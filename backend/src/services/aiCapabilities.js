const Project = require('../models/Project');
const Mastery = require('../models/Mastery');
const Material = require('../models/Material');
const QuizAttempt = require('../models/QuizAttempt');
const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const { rankRelevantChunks } = require('./contextService');
const { enqueue } = require('./jobQueue');

/**
 * PRD 22 AI Application Capabilities.
 *
 * This is the ONLY interface through which the AI Tutor can interact with
 * the application. It is deliberately NOT direct database/model access from
 * the model - the model only ever sees the named tools + JSON schemas below,
 * and every invocation is:
 *
 *   - Structured    - fixed name + JSON input schema (Anthropic tool-use)
 *   - Controlled    - a fixed allow-list dispatched below; unknown tool
 *                     names are rejected, and write actions reuse the same
 *                     existing controllers/services normal users go through
 *                     (no bespoke "AI-only" write paths)
 *   - Validated     - each handler checks/normalizes its own input
 *   - Observable    - every call is recorded onto the triggering Message's
 *                     `actions` array (visible in the Tutor UI) via
 *                     tutorController, and write actions additionally
 *                     produce their normal BackgroundJob / model records
 *   - Permission-aware - `ctx.project` / `ctx.user` come from the
 *                     authenticated request, NEVER from the model's tool
 *                     input, so the AI cannot act on a different user's
 *                     data or a project it wasn't given
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
      "Start generating a new adaptive quiz for the learner in this Project (e.g. when they ask to be tested, quizzed, or to check their understanding). This starts a background job - it does not return questions immediately.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'record_learning_event',
    description:
      'Persist an important, durable note about the learner\'s journey in this Project so it is remembered in future sessions (e.g. a recurring difficulty, an important concept, or something needing attention).',
    input_schema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'The note to record, written concisely' },
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

// --- Handlers: ctx = { project, user } is ALWAYS server-derived, never from the model ---

async function handleSearchProjectMaterials(input, ctx) {
  const query = typeof input?.query === 'string' ? input.query.slice(0, 300) : '';
  if (!query.trim()) return { error: 'query is required' };

  const chunks = await rankRelevantChunks(ctx.project._id, query, 4);
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
  // Reuses the exact same background job pipeline the "Generate Quiz" button
  // uses - the AI does not get a special/bespoke write path.
  const Quiz = require('../models/Quiz');
  const quiz = await Quiz.create({ user: ctx.user._id, project: ctx.project._id, status: 'generating' });
  const job = await enqueue({
    type: 'quiz_generation',
    user: ctx.user._id,
    project: ctx.project._id,
    relatedId: quiz._id,
  });
  quiz.generationJob = job._id;
  await quiz.save();
  return { started: true, quizId: quiz._id.toString(), jobId: job._id.toString() };
}

async function handleRecordLearningEvent(input, ctx) {
  const allowedFields = ['importantConcepts', 'previousDifficulties', 'significantNotes', 'areasRequiringAttention'];
  const field = allowedFields.includes(input?.field) ? input.field : 'significantNotes';
  const note = typeof input?.note === 'string' ? input.note.trim().slice(0, 300) : '';
  if (!note) return { error: 'note is required' };

  const project = await Project.findOne({ _id: ctx.project._id, user: ctx.user._id });
  if (!project) return { error: 'Project not found or not permitted' };

  project.context[field].push(note);
  await project.save();
  return { recorded: true, field, note };
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
 * Executes a named capability against the fixed allow-list above.
 * `ctx` (project/user) must come from the authenticated request context -
 * callers must never let the model supply its own project/user identifiers.
 */
async function executeCapability(name, input, ctx) {
  const handler = CAPABILITY_HANDLERS[name];
  if (!handler) {
    return { error: `Unknown or unpermitted capability: ${name}` };
  }
  if (!ctx?.project?._id || !ctx?.user?._id) {
    return { error: 'Missing permission context - capability call rejected.' };
  }
  try {
    return await handler(input, ctx);
  } catch (err) {
    console.error(`[aiCapabilities] "${name}" failed:`, err.message);
    return { error: `Capability "${name}" failed: ${err.message}` };
  }
}

module.exports = { TOOLS, executeCapability };