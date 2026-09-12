const Project = require('../models/Project');
const Mastery = require('../models/Mastery');
const Material = require('../models/Material');
const QuizAttempt = require('../models/QuizAttempt');
const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const { rankRelevantChunks } = require('./contextService');

/**
 * PRD 22 AI Application Capabilities + PRD 23 AI Decision & Action Boundaries.
 *
 * This is the ONLY interface through which the AI Tutor can interact with
 * the application - never direct database/model access from the model. The
 * pipeline for every invocation follows PRD 23's flow exactly:
 *
 *   AI Reasoning -> Determine Required Action -> Structured Application
 *   Capability -> Validate Request -> Execute -> Return Result ->
 *   Continue AI Interaction
 *
 * Concretely, `executeCapability` below:
 *   1. Looks the tool name up in a fixed allow-list (Structured/Controlled) -
 *      unknown names are rejected before anything else runs.
 *   2. Confirms permission context (project/user) was supplied by the
 *      SERVER, never taken from the model's tool input (Permission-aware).
 *   3. Runs a dedicated validator for that capability's input BEFORE calling
 *      its handler (Validate Request) - the backend never blindly trusts
 *      model-generated parameters.
 *   4. Only then executes the handler (Execute) and returns a plain result
 *      object (Return Result) that gets fed back to the model so it can
 *      continue the conversation (Continue AI Interaction).
 *
 * Sensitive/state-changing capabilities are marked `sideEffects: true` in
 * CAPABILITY_META. The caller (tutorController) uses this to enforce a
 * safeguard: at most one state-changing action per Tutor response, so the
 * model cannot chain multiple writes in a single turn.
 */

const TOOLS = [
  {
    name: 'search_project_materials',
    description:
      "Search this Project's processed learning materials for content relevant to a specific phrase. Use this if the automatically-retrieved context doesn't cover what the learner is asking, or to look up a different angle on a topic.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to search for' } },
      required: ['query'],
    },
  },
  {
    name: 'get_learner_progress',
    description: "Look up the learner's overall progress and mastery in this Project.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_weak_concepts',
    description: 'Identify which concepts in this Project the learner is currently weak on (mastery < 60%).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_assessment_history',
    description: "Read the learner's recent quiz scores in this Project to understand their assessment history.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_analytics_summary',
    description: 'Retrieve the latest generated analytics/recommendations snapshot for this Project, if one exists.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'generate_quiz',
    description:
      "Start generating a new adaptive quiz for the learner in this Project (e.g. when they ask to be tested, quizzed, or to check their understanding). This starts a background job - it does not return questions immediately. State-changing - used sparingly.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'record_learning_event',
    description:
      'Persist an important, durable note about the learner\'s journey in this Project so it is remembered in future sessions (e.g. a recurring difficulty, an important concept, or something needing attention). State-changing - used sparingly, for genuinely durable information only.',
    input_schema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'The note to record, written concisely (under ~200 characters)' },
        field: {
          type: 'string',
          enum: ['importantConcepts', 'previousDifficulties', 'significantNotes', 'areasRequiringAttention'],
          description: 'Which category of persistent context this note belongs to',
        },
      },
      required: ['note', 'field'],
    },
  },
];

// Which capabilities are sensitive/state-changing (PRD 23 "appropriate safeguards")
const CAPABILITY_META = {
  search_project_materials: { sideEffects: false },
  get_learner_progress: { sideEffects: false },
  get_weak_concepts: { sideEffects: false },
  get_assessment_history: { sideEffects: false },
  get_analytics_summary: { sideEffects: false },
  generate_quiz: { sideEffects: true },
  record_learning_event: { sideEffects: true },
};

const SIDE_EFFECT_TOOLS = new Set(
  Object.entries(CAPABILITY_META)
    .filter(([, meta]) => meta.sideEffects)
    .map(([name]) => name)
);

const NOTE_FIELD_MAX_ENTRIES = 25; // safeguard against unbounded growth from a chatty AI

// --- Validators: run BEFORE execution. Never trust model-generated params. ---

function validateSearchProjectMaterials(input) {
  if (typeof input?.query !== 'string' || !input.query.trim()) {
    return { valid: false, error: 'query must be a non-empty string.' };
  }
  if (input.query.length > 300) {
    return { valid: false, error: 'query must be 300 characters or fewer.' };
  }
  return { valid: true };
}

function validateNoOpInput() {
  return { valid: true }; // read-only tools with no parameters
}

async function validateRecordLearningEvent(input, ctx) {
  const allowedFields = ['importantConcepts', 'previousDifficulties', 'significantNotes', 'areasRequiringAttention'];
  if (!allowedFields.includes(input?.field)) {
    return { valid: false, error: `field must be one of: ${allowedFields.join(', ')}.` };
  }
  if (typeof input?.note !== 'string' || !input.note.trim()) {
    return { valid: false, error: 'note must be a non-empty string.' };
  }
  if (input.note.length > 300) {
    return { valid: false, error: 'note must be 300 characters or fewer.' };
  }

  // Safeguard: cap how many notes can accumulate per category per project
  const project = await Project.findOne({ _id: ctx.project._id, user: ctx.user._id }).select('context');
  if (!project) return { valid: false, error: 'Project not found or not permitted.' };
  if ((project.context[input.field]?.length || 0) >= NOTE_FIELD_MAX_ENTRIES) {
    return {
      valid: false,
      error: `Safeguard: "${input.field}" already has ${NOTE_FIELD_MAX_ENTRIES} recorded notes for this Project - skipping to avoid unbounded growth. Consider this information already captured.`,
    };
  }
  return { valid: true };
}

const VALIDATORS = {
  search_project_materials: validateSearchProjectMaterials,
  get_learner_progress: validateNoOpInput,
  get_weak_concepts: validateNoOpInput,
  get_assessment_history: validateNoOpInput,
  get_analytics_summary: validateNoOpInput,
  generate_quiz: validateNoOpInput,
  record_learning_event: validateRecordLearningEvent,
};

// --- Handlers: ctx = { project, user } is ALWAYS server-derived, never from the model ---

async function handleSearchProjectMaterials(input, ctx) {
  const chunks = await rankRelevantChunks(ctx.project._id, input.query.slice(0, 300), 4);
  return {
    resultCount: chunks.length,
    results: chunks.map((c) => ({ source: c.materialTitle, page: c.page, excerpt: c.text.slice(0, 500) })),
  };
}

async function handleGetLearnerProgress(_input, ctx) {
  const project = await Project.findById(ctx.project._id).select('progress name goal');
  const masteries = await Mastery.find({ project: ctx.project._id, user: ctx.user._id });
  return {
    overallProgress: project?.progress ?? 0,
    conceptsTracked: masteries.length,
    conceptsMastered: masteries.filter((m) => m.masteryScore >= 80).length,
    conceptsNeedingAttention: masteries.filter((m) => m.needsAttention).length,
  };
}

async function handleGetWeakConcepts(_input, ctx) {
  const masteries = await Mastery.find({ project: ctx.project._id, user: ctx.user._id, needsAttention: true })
    .populate('concept', 'name')
    .sort({ masteryScore: 1 })
    .limit(8);
  return {
    weakConcepts: masteries.map((m) => ({ name: m.concept?.name, masteryScore: m.masteryScore, trend: m.trend })),
  };
}

async function handleGetAssessmentHistory(_input, ctx) {
  const attempts = await QuizAttempt.find({ project: ctx.project._id, user: ctx.user._id, status: 'evaluated' })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('score createdAt');
  return { recentAttempts: attempts.map((a) => ({ score: a.score, date: a.createdAt })) };
}

async function handleGetAnalyticsSummary(_input, ctx) {
  const snapshot = await AnalyticsSnapshot.findOne({
    project: ctx.project._id,
    user: ctx.user._id,
    scope: 'project',
  }).sort({ createdAt: -1 });
  if (!snapshot) return { available: false, message: 'No analytics snapshot has been generated for this Project yet.' };
  return { available: true, metrics: snapshot.metrics, recommendations: snapshot.recommendations };
}

async function handleGenerateQuiz(_input, ctx) {
  const QuizSession = require('../models/QuizSession');
  const { startSession } = require('./adaptiveQuizService');

  // Safeguard: don't spin up a duplicate session if the learner already has
  // an active adaptive quiz in progress for this Project.
  const existing = await QuizSession.findOne({
    project: ctx.project._id,
    user: ctx.user._id,
    status: 'active',
  }).sort({ createdAt: -1 });

  if (existing) {
    return {
      started: false,
      reused: true,
      sessionId: existing._id.toString(),
      message: 'An adaptive quiz is already in progress for this Project - reusing it instead of starting a duplicate.',
    };
  }

  // Reuses the exact same adaptive engine the "Start Quiz" button uses - the
  // AI does not get a special/bespoke write path.
  const session = await startSession(ctx.project, ctx.user);
  return { started: true, sessionId: session._id.toString() };
}

async function handleRecordLearningEvent(input, ctx) {
  const project = await Project.findOne({ _id: ctx.project._id, user: ctx.user._id });
  if (!project) return { error: 'Project not found or not permitted' };

  project.context[input.field].push(input.note.trim().slice(0, 300));
  await project.save();
  return { recorded: true, field: input.field, note: input.note.trim().slice(0, 300) };
}

const CAPABILITY_HANDLERS = {
  search_project_materials: handleSearchProjectMaterials,
  get_learner_progress: handleGetLearnerProgress,
  get_weak_concepts: handleGetWeakConcepts,
  get_assessment_history: handleGetAssessmentHistory,
  get_analytics_summary: handleGetAnalyticsSummary,
  generate_quiz: handleGenerateQuiz,
  record_learning_event: handleRecordLearningEvent,
};

/**
 * Executes a named capability following PRD 23's Validate -> Execute ->
 * Return Result pipeline. `ctx` (project/user) must come from the
 * authenticated request context - callers must never let the model supply
 * its own project/user identifiers.
 */
async function executeCapability(name, input, ctx) {
  // 1. Determine Required Action / Structured Application Capability
  const handler = CAPABILITY_HANDLERS[name];
  const validator = VALIDATORS[name];
  if (!handler || !validator) {
    return { error: `Unknown or unpermitted capability: ${name}` };
  }

  // 2. Permission-aware: context must come from the server, not the model
  if (!ctx?.project?._id || !ctx?.user?._id) {
    return { error: 'Missing permission context - capability call rejected.' };
  }

  // 3. Validate Request - backend validation, not trust in model parameters
  let validation;
  try {
    validation = await validator(input, ctx);
  } catch (err) {
    return { error: `Validation error: ${err.message}` };
  }
  if (!validation.valid) {
    return { error: `Validation failed: ${validation.error}` };
  }

  // 4. Execute -> 5. Return Result
  try {
    return await handler(input, ctx);
  } catch (err) {
    console.error(`[aiCapabilities] "${name}" failed:`, err.message);
    return { error: `Capability "${name}" failed: ${err.message}` };
  }
}

module.exports = { TOOLS, executeCapability, SIDE_EFFECT_TOOLS };