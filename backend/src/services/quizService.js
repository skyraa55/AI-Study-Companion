const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Concept = require('../models/Concept');
const Mastery = require('../models/Mastery');
const Project = require('../models/Project');
const { callClaude, parseJSONResponse } = require('./aiService');
const { buildProjectContext } = require('./contextService');
const { updateMasteryFromAttempt } = require('./masteryService');
const { enqueue } = require('./jobQueue');

/**
 * Chooses which concepts the next quiz should target: weaker/needs-attention
 * concepts are prioritized, with a couple of well-known concepts mixed in so
 * quizzes reinforce, not just interrogate weaknesses.
 */
/**
 * Chooses which concepts the next quiz should target, using several signals
 * (PRD 24): current mastery, concepts explicitly flagged as needing
 * attention, and recent mistakes from the last few graded attempts (a
 * concept the learner just got wrong is reinforced even if their
 * longer-run mastery score for it looks fine). A couple of well-known
 * concepts are mixed in so quizzes reinforce, not just interrogate weaknesses.
 */
async function selectAdaptiveConcepts(projectId, userId, count = 5) {
  const masteries = await Mastery.find({ project: projectId, user: userId }).populate('concept', 'name');

  // Recent mistakes (PRD 24 "Recent mistakes"): last few graded attempts,
  // regardless of the concept's overall mastery score.
  const recentAttempts = await QuizAttempt.find({ project: projectId, user: userId, status: 'evaluated' })
    .sort({ createdAt: -1 })
    .limit(5);

  const recentMistakeCounts = new Map();
  for (const attempt of recentAttempts) {
    for (const answer of attempt.answers) {
      if (!answer.isCorrect) {
        recentMistakeCounts.set(answer.concept, (recentMistakeCounts.get(answer.concept) || 0) + 1);
      }
    }
  }
  const recentMistakeConcepts = Array.from(recentMistakeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  if (masteries.length === 0 && recentMistakeConcepts.length === 0) {
    return { concepts: [], notes: 'No tracked concepts yet - quiz will cover material broadly.' };
  }

  const sortedByMastery = [...masteries].sort((a, b) => a.masteryScore - b.masteryScore);
  const weak = sortedByMastery.slice(0, Math.ceil(count * 0.6)).map((m) => m.concept?.name).filter(Boolean);
  const strong = sortedByMastery
    .slice(-Math.floor(count * 0.2))
    .map((m) => m.concept?.name)
    .filter(Boolean);

  // Recent mistakes take priority even over the mastery-ranked weak list
  const concepts = Array.from(new Set([...recentMistakeConcepts, ...weak, ...strong])).slice(0, count);

  return {
    concepts,
    notes: `Prioritized ${recentMistakeConcepts.length} concept(s) with recent mistakes and ${weak.length} lower-mastery concept(s), with light reinforcement of stronger ones.`,
  };
}

/**
 * Gathers recently-asked question prompts for this Project/user (PRD 24
 * "Question history") so the generator can avoid asking near-duplicates and
 * instead probe the same concepts from a different angle.
 */
async function getRecentQuestionHistory(projectId, userId, limit = 15) {
  const quizzes = await Quiz.find({ project: projectId, user: userId, status: 'ready' })
    .sort({ createdAt: -1 })
    .limit(3)
    .select('questions.prompt');
  const prompts = quizzes.flatMap((q) => q.questions.map((qq) => qq.prompt));
  return prompts.slice(0, limit);
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
    const questionHistory = await getRecentQuestionHistory(quiz.project, quiz.user);

    const system = `You are an adaptive quiz generator for a learning platform.
Generate a quiz grounded ONLY in the provided project context and retrieved material excerpts.
If the retrieved material is insufficient for a concept, write a question testing general
understanding of that concept's name/definition rather than inventing specific facts not
present in the context.

Question History (PRD 24 - avoid repetition): the learner has recently been asked these
questions in this Project. Do NOT repeat or closely paraphrase any of them - if a concept
needs re-testing, ask about it from a different angle (different scenario, format, or
sub-aspect) instead:
${questionHistory.length > 0 ? JSON.stringify(questionHistory) : '(no prior questions on record)'}

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
Generate 5-8 questions total. REQUIRED mix (PRD 24 - support both formats): at least 2
multiple-choice (mcq) questions AND at least 1 open-ended (short_answer) question; the
remaining questions can be any type. Target these concepts when relevant: ${
      concepts.join(', ') || '(none tracked yet - cover the material generally)'
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

    // Backend validation, not blind trust in model output (mirrors PRD 23's
    // principle applied here to quiz content): enforce the required type mix
    // rather than assuming the model followed instructions.
    const hasMcq = parsed.questions.some((q) => q.type === 'mcq');
    const hasOpenEnded = parsed.questions.some((q) => q.type === 'short_answer');
    if (!hasMcq || !hasOpenEnded) {
      console.warn(
        `[quizService] Generated quiz ${quiz._id} did not satisfy the required mcq+open-ended mix (hasMcq=${hasMcq}, hasOpenEnded=${hasOpenEnded}) - keeping questions as-is but flagging in notes.`
      );
    }

    quiz.questions = parsed.questions;
    quiz.adaptiveContext = {
      targetedConcepts: concepts,
      generationNotes: notes + (!hasMcq || !hasOpenEnded ? ' (Note: requested type mix was not fully met by the model.)' : ''),
    };
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

  enqueue({
    type: 'growth_analysis',
    user: attempt.user,
    project: attempt.project,
    relatedId: null,
    input: { trigger: 'quiz_completed' },
  }).catch((err) => console.error('[quizService] failed to enqueue growth_analysis:', err.message));

  return { attemptId: attempt._id, score: attempt.score };
}

function normalize(str) {
  return (str || '').trim().toLowerCase();
}

module.exports = { generateQuizJob, evaluateQuizAttemptJob, selectAdaptiveConcepts };
