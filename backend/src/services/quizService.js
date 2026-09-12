const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Concept = require('../models/Concept');
const Mastery = require('../models/Mastery');
const Project = require('../models/Project');
const { callClaude, parseJSONResponse } = require('./aiService');
const { buildProjectContext } = require('./contextService');
const { updateMasteryFromAttempt } = require('./masteryService');

/**
 * Chooses which concepts the next quiz should target: weaker/needs-attention
 * concepts are prioritized, with a couple of well-known concepts mixed in so
 * quizzes reinforce, not just interrogate weaknesses.
 */
async function selectAdaptiveConcepts(projectId, userId, count = 5) {
  const masteries = await Mastery.find({ project: projectId, user: userId }).populate('concept', 'name');
  if (masteries.length === 0) return { concepts: [], notes: 'No tracked concepts yet - quiz will cover material broadly.' };

  const sorted = [...masteries].sort((a, b) => a.masteryScore - b.masteryScore);
  const weak = sorted.slice(0, Math.ceil(count * 0.7)).map((m) => m.concept?.name).filter(Boolean);
  const strong = sorted
    .slice(-Math.floor(count * 0.3))
    .map((m) => m.concept?.name)
    .filter(Boolean);

  const concepts = Array.from(new Set([...weak, ...strong])).slice(0, count);
  return {
    concepts,
    notes: `Prioritized ${weak.length} lower-mastery concept(s) with light reinforcement of stronger ones.`,
  };
}

/** Background job handler: 'quiz_generation' */
async function generateQuizJob(job) {
  const quizId = job.relatedId;
  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw new Error('Quiz not found');

  const project = await Project.findById(quiz.project);
  if (!project) throw new Error('Project not found');

  try {
    const { concepts, notes } = await selectAdaptiveConcepts(quiz.project, quiz.user);
    const focusQuery = concepts.join(', ') || project.goal || project.name;
    const { contextBlock } = await buildProjectContext(project, focusQuery);

    const system = `You are an adaptive quiz generator for a learning platform.
Generate a quiz grounded ONLY in the provided project context and retrieved material excerpts.
If the retrieved material is insufficient for a concept, write a question testing general
understanding of that concept's name/definition rather than inventing specific facts not
present in the context.

Respond with STRICT JSON only in this exact shape:
{
  "questions": [
    {
      "prompt": string,
      "type": "mcq" | "true_false" | "short_answer",
      "options": string[],            // 4 options for mcq, ["True","False"] for true_false, [] for short_answer
      "correctAnswer": string,
      "concept": string,              // must match one of the target concepts when possible
      "difficulty": "easy" | "medium" | "hard",
      "explanation": string
    }
  ]
}
Generate 5-8 questions. Mix question types. Target these concepts when relevant: ${concepts.join(', ') || '(none tracked yet - cover the material generally)'
      }.`;

    const userContent = JSON.stringify({ context: contextBlock }, null, 2);

    const raw = await callClaude({
      purpose: 'quiz_generation',
      system,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 2000,
      meta: {
        userId: quiz.user,
        projectId: quiz.project,
        retrievalUsed: contextBlock.retrievedMaterial.length > 0,
        retrievalChunkCount: contextBlock.retrievedMaterial.length,
      },
    });

    const parsed = parseJSONResponse(raw);
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('AI returned no questions');
    }

    quiz.questions = parsed.questions;
    quiz.adaptiveContext = { targetedConcepts: concepts, generationNotes: notes };
    quiz.status = 'ready';
    await quiz.save();

    return { quizId: quiz._id, questionCount: quiz.questions.length };
  } catch (err) {
    quiz.status = 'failed';
    await quiz.save();
    throw err;
  }
}

/** Background job handler: 'quiz_evaluation' */
async function evaluateQuizAttemptJob(job) {
  const attemptId = job.relatedId;
  const attempt = await QuizAttempt.findById(attemptId);
  if (!attempt) throw new Error('QuizAttempt not found');

  const quiz = await Quiz.findById(attempt.quiz);
  if (!quiz) throw new Error('Quiz not found');

  const questionsById = new Map(quiz.questions.map((q) => [q._id.toString(), q]));
  const shortAnswerAnswers = attempt.answers.filter((a) => {
    const q = questionsById.get(a.questionId.toString());
    return q && q.type === 'short_answer';
  });

  // Directly grade mcq/true_false; AI-grade short_answer for semantic correctness
  for (const answer of attempt.answers) {
    const q = questionsById.get(answer.questionId.toString());
    if (!q) continue;
    if (q.type !== 'short_answer') {
      answer.isCorrect = normalize(answer.userAnswer) === normalize(q.correctAnswer);
    }
  }

  if (shortAnswerAnswers.length > 0) {
    const gradingPayload = shortAnswerAnswers.map((a) => {
      const q = questionsById.get(a.questionId.toString());
      return {
        questionId: a.questionId.toString(),
        prompt: q.prompt,
        modelAnswer: q.correctAnswer,
        studentAnswer: a.userAnswer,
      };
    });

    const system = `You are grading short-answer quiz responses for a learning platform.
For each item, decide if the student's answer demonstrates correct understanding compared
to the model answer (allow paraphrasing/synonyms - do not require exact wording).
Respond with STRICT JSON only:
{"results": [{"questionId": string, "isCorrect": boolean, "note": string}]}
"note" should be a one-sentence, encouraging explanation of the grading decision.`;

    const raw = await callClaude({
      purpose: 'quiz_evaluation',
      system,
      messages: [{ role: 'user', content: JSON.stringify(gradingPayload) }],
      maxTokens: 1000,
      meta: { userId: attempt.user, projectId: attempt.project },
    });

    try {
      const parsed = parseJSONResponse(raw);
      const resultMap = new Map((parsed.results || []).map((r) => [r.questionId, r]));
      for (const answer of attempt.answers) {
        const result = resultMap.get(answer.questionId.toString());
        if (result) {
          answer.isCorrect = !!result.isCorrect;
          answer.aiEvaluationNote = result.note || '';
        }
      }
    } catch (e) {
      // Evidence Over Guessing: if grading JSON fails to parse, leave those
      // answers as incorrect-by-default but flagged, rather than fabricating.
      for (const a of shortAnswerAnswers) {
        a.aiEvaluationNote = 'Automatic grading unavailable - please review manually.';
      }
    }
  }

  const correctCount = attempt.answers.filter((a) => a.isCorrect).length;
  attempt.correctCount = correctCount;
  attempt.totalQuestions = attempt.answers.length;
  attempt.score = attempt.answers.length ? Math.round((correctCount / attempt.answers.length) * 100) : 0;
  attempt.status = 'evaluated';
  await attempt.save();

  await updateMasteryFromAttempt(attempt, quiz);

  return { attemptId: attempt._id, score: attempt.score };
}

function normalize(str) {
  return (str || '').trim().toLowerCase();
}

module.exports = { generateQuizJob, evaluateQuizAttemptJob, selectAdaptiveConcepts };
