const QuizSession = require('../models/QuizSession');
const Mastery = require('../models/Mastery');
const { callClaude, parseJSONResponse } = require('./aiService');
const { buildProjectContext } = require('./contextService');
const { updateMasteryForAnswer } = require('./masteryService');

/**
 * PRD 25 Adaptive Assessment + PRD 26 Adaptive Quiz Flow.
 *
 * Deliberately NOT the naive "wrong -> easy, correct -> hard" toggle (PRD 26
 * explicitly rules this out). Instead:
 *
 *   - WHICH CONCEPT to ask next is chosen from a priority pool: concepts
 *     missed earlier in *this session* first (immediate reinforcement),
 *     then concepts already flagged needsAttention, then the lowest overall
 *     mastery score - while avoiding repeating the same concept twice in a
 *     row when a different one is available, so the session covers ground
 *     rather than fixating.
 *   - DIFFICULTY follows the learner's STABLE mastery estimate for that
 *     concept (a rolling score built from many prior answers), not the
 *     single most recent right/wrong - so one lucky guess or one slip
 *     doesn't whiplash the difficulty.
 */
async function chooseConceptAndDifficulty(project, userId, session) {
  const masteries = await Mastery.find({ project: project._id, user: userId }).populate('concept', 'name');

  let candidates = masteries.map((m) => ({
    name: m.concept?.name,
    masteryScore: m.masteryScore,
    needsAttention: m.needsAttention,
  })).filter((c) => c.name);

  if (candidates.length === 0) {
    // Brand-new Project with no tracked concepts yet - fall back to the
    // Project's own goal/name so a first quiz can still run; a real Concept
    // will be created for it once this question is answered.
    candidates = [{ name: project.goal || project.name, masteryScore: 0, needsAttention: true }];
  }

  const askedThisSession = session.questions.map((q) => q.concept);
  const lastConcept = askedThisSession[askedThisSession.length - 1] || null;
  const sessionMistakes = session.questions.filter((q) => q.isCorrect === false).map((q) => q.concept);

  // Priority pool: recent mistakes in this session > needs-attention > everything
  let pool = candidates.filter((c) => sessionMistakes.includes(c.name));
  if (pool.length === 0) pool = candidates.filter((c) => c.needsAttention);
  if (pool.length === 0) pool = candidates;

  // Avoid repeating the same concept twice in a row unless it's the only option
  let filtered = pool.filter((c) => c.name !== lastConcept);
  if (filtered.length === 0) filtered = pool;

  filtered.sort((a, b) => a.masteryScore - b.masteryScore); // most in need of work first
  const chosen = filtered[0];

  let difficulty;
  if (chosen.masteryScore < 40) difficulty = 'easy';
  else if (chosen.masteryScore < 75) difficulty = 'medium';
  else difficulty = 'hard';

  return { concept: chosen.name, difficulty, masteryScore: chosen.masteryScore };
}

/** Generates exactly one new question, grounded in Project material, avoiding repeats within this session. */
async function generateAdaptiveQuestion(project, user, session) {
  const { concept, difficulty } = await chooseConceptAndDifficulty(project, user._id, session);
  const { contextBlock } = await buildProjectContext(project, concept);
  const askedPrompts = session.questions.map((q) => q.prompt);

  // Periodically favor short_answer so open-ended assessment (PRD 28) is
  // actually exercised through the session, not just theoretically supported.
  const preferredType =
    (session.questions.length + 1) % 3 === 0 ? 'short_answer' : Math.random() < 0.5 ? 'mcq' : 'true_false';

  const system = `You are an adaptive quiz engine for a learning platform. Generate exactly ONE
question testing the concept "${concept}" at "${difficulty}" difficulty, grounded ONLY in the
provided project context/material excerpts below - invent nothing not supported by them; if
evidence is thin, test general understanding of the concept's definition instead of specific facts.

Prefer question type "${preferredType}" unless it is clearly unsuitable for this concept.

Do NOT repeat or closely paraphrase any of these already-asked questions from this session
(PRD 25 "Questions already answered"):
${askedPrompts.length > 0 ? JSON.stringify(askedPrompts) : '(none yet)'}

Respond with STRICT JSON only in this exact shape:
{
  "prompt": string,
  "type": "mcq" | "true_false" | "short_answer",
  "options": string[],
  "correctAnswer": string,
  "concept": string,
  "difficulty": "easy" | "medium" | "hard",
  "explanation": string
}`;

  const raw = await callClaude({
    purpose: 'quiz_generation',
    system,
    messages: [{ role: 'user', content: JSON.stringify({ context: contextBlock }) }],
    maxTokens: 700,
    meta: {
      userId: user._id,
      projectId: project._id,
      retrievalUsed: contextBlock.retrievedMaterial.length > 0,
      retrievalChunkCount: contextBlock.retrievedMaterial.length,
    },
  });

  const parsed = parseJSONResponse(raw);

  // Backend validation (PRD 23 principle applied here too) - never trust
  // model output blindly, even for its own generated question shape.
  if (!parsed.prompt || !parsed.correctAnswer || !['mcq', 'true_false', 'short_answer'].includes(parsed.type)) {
    throw new Error('Generated question failed validation');
  }

  return {
    prompt: String(parsed.prompt),
    type: parsed.type,
    options: Array.isArray(parsed.options) ? parsed.options.map(String) : [],
    correctAnswer: String(parsed.correctAnswer),
    concept: parsed.concept ? String(parsed.concept) : concept,
    difficulty: ['easy', 'medium', 'hard'].includes(parsed.difficulty) ? parsed.difficulty : difficulty,
    explanation: parsed.explanation ? String(parsed.explanation) : '',
  };
}

/** PRD 28 Open-Ended Assessment: rich, meaningful evaluation - not just a score. */
async function evaluateOpenEnded(question, project, user) {
  const system = `You are evaluating an open-ended quiz answer for a learning platform.
Assess the student's answer against the question and model answer. Consider: understanding,
accuracy, relevance, which key concepts were covered, which were missing, and reasoning
quality where applicable. Be fair to paraphrasing and synonyms - do not require exact wording.

Respond with STRICT JSON only in this exact shape:
{
  "isCorrect": boolean,
  "understanding": string,
  "accuracy": string,
  "relevance": string,
  "keyConceptsCovered": string[],
  "missingConcepts": string[],
  "reasoningQuality": string,
  "feedback": string
}
"feedback" must be meaningful prose (2-4 sentences) the learner can act on - e.g. "Your answer
shows a good understanding of the core concept, but one important relationship is missing.
Focus on: <missing concept 1>, <missing concept 2>." Never just a bare verdict like "Correct" or "Incorrect".`;

  const payload = {
    question: question.prompt,
    modelAnswer: question.correctAnswer,
    concept: question.concept,
    studentAnswer: question.userAnswer,
  };

  try {
    const raw = await callClaude({
      purpose: 'quiz_evaluation',
      system,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
      maxTokens: 500,
      meta: { userId: user._id, projectId: project._id },
    });
    const parsed = parseJSONResponse(raw);
    return {
      isCorrect: !!parsed.isCorrect,
      understanding: parsed.understanding || '',
      accuracy: parsed.accuracy || '',
      relevance: parsed.relevance || '',
      keyConceptsCovered: Array.isArray(parsed.keyConceptsCovered) ? parsed.keyConceptsCovered : [],
      missingConcepts: Array.isArray(parsed.missingConcepts) ? parsed.missingConcepts : [],
      reasoningQuality: parsed.reasoningQuality || '',
      feedback: parsed.feedback || 'Thanks for your answer - detailed feedback was unavailable this time.',
    };
  } catch (e) {
    return {
      isCorrect: false,
      understanding: '',
      accuracy: '',
      relevance: '',
      keyConceptsCovered: [],
      missingConcepts: [],
      reasoningQuality: '',
      feedback: 'Automatic grading was unavailable for this answer - please review it against the explanation shown.',
    };
  }
}

function normalize(str) {
  return (str || '').trim().toLowerCase();
}

/** Public (answer-safe) view of a question, for sending to the client before it's answered. */
function toPublicQuestion(q, session) {
  return {
    id: q._id,
    prompt: q.prompt,
    type: q.type,
    options: q.options,
    concept: q.concept,
    difficulty: q.difficulty,
    progress: { current: session.questions.length, total: session.targetQuestionCount },
  };
}

/** PRD 26 "Start Quiz": creates a session and generates its first question. */
async function startSession(project, user, targetQuestionCount = 8) {
  const session = await QuizSession.create({
    user: user._id,
    project: project._id,
    targetQuestionCount,
    questions: [],
  });

  const question = await generateAdaptiveQuestion(project, user, session);
  session.questions.push({ ...question, askedAt: new Date() });
  await session.save();
  return session;
}

/**
 * PRD 26 "User Answers -> Evaluate Answer -> Update Mastery -> Select Next
 * Question -> Continue". Grades the current pending question, updates
 * mastery immediately, then either generates the next question or completes
 * the session.
 */
async function submitAnswer(session, project, user, userAnswer) {
  const current = session.questions[session.questions.length - 1];
  if (!current || current.answeredAt) {
    throw new Error('There is no pending question to answer for this session.');
  }

  current.userAnswer = typeof userAnswer === 'string' ? userAnswer.slice(0, 2000) : '';
  current.answeredAt = new Date();

  let feedback;
  let evaluation = null;

  if (current.type !== 'short_answer') {
    current.isCorrect = normalize(current.userAnswer) === normalize(current.correctAnswer);
    feedback = current.explanation || (current.isCorrect ? 'Correct!' : 'Not quite - review the explanation above.');
    current.feedback = feedback;
  } else {
    const result = await evaluateOpenEnded(current, project, user);
    current.isCorrect = result.isCorrect;
    current.feedback = result.feedback;
    current.evaluation = {
      understanding: result.understanding,
      accuracy: result.accuracy,
      relevance: result.relevance,
      keyConceptsCovered: result.keyConceptsCovered,
      missingConcepts: result.missingConcepts,
      reasoningQuality: result.reasoningQuality,
    };
    feedback = result.feedback;
    evaluation = current.evaluation;
  }

  if (current.isCorrect) session.correctCount += 1;
  session.score = Math.round((session.correctCount / session.questions.length) * 100);

  // Update Mastery (PRD 26) - this feeds directly into the NEXT question's
  // concept/difficulty selection, and into Growth Tracking (PRD 28).
  const mastery = await updateMasteryForAnswer({
    projectId: project._id,
    userId: user._id,
    conceptName: current.concept,
    isCorrect: current.isCorrect,
  });

  const answeredSnapshot = {
    id: current._id,
    prompt: current.prompt,
    type: current.type,
    difficulty: current.difficulty,
    concept: current.concept,
    correctAnswer: current.correctAnswer,
    userAnswer: current.userAnswer,
    isCorrect: current.isCorrect,
    feedback,
    evaluation,
  };

  let nextQuestion = null;
  let completed = false;

  if (session.questions.length >= session.targetQuestionCount) {
    session.status = 'completed';
    session.completedAt = new Date();
    completed = true;
  } else {
    const nextQ = await generateAdaptiveQuestion(project, user, session);
    session.questions.push({ ...nextQ, askedAt: new Date() });
    nextQuestion = toPublicQuestion(session.questions[session.questions.length - 1], session);
  }

  await session.save();

  return {
    answered: answeredSnapshot,
    masterySnapshot: { concept: current.concept, masteryScore: mastery.masteryScore, trend: mastery.trend },
    nextQuestion,
    completed,
    progress: {
      asked: session.questions.filter((q) => q.answeredAt).length,
      total: session.targetQuestionCount,
      score: session.score,
    },
  };
}

module.exports = { startSession, submitAnswer, toPublicQuestion, chooseConceptAndDifficulty };