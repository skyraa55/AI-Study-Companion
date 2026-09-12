const Material = require('../models/Material');
const Mastery = require('../models/Mastery');
const Concept = require('../models/Concept');
const Message = require('../models/Message');
const QuizAttempt = require('../models/QuizAttempt');

/**
 * PRD 3.1 Context First: a Tutor conversation inside one Project must never
 * accidentally use another Project's information. Every retrieval query below
 * is scoped by `project` at the database level - never merged across projects.
 *
 * Retrieval here is a lightweight keyword-overlap ranker over material chunks.
 * This keeps the prototype dependency-free (no vector DB); the interface
 * (rankRelevantChunks) is isolated so it can be swapped for real embedding
 * search later without touching callers.
 */

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

async function rankRelevantChunks(projectId, query, limit = 6) {
  const materials = await Material.find({
    project: projectId,
    processingStatus: 'ready',
  }).select('title knowledge.chunks');

  const queryTerms = new Set(tokenize(query));
  const scored = [];

  for (const material of materials) {
    for (const chunk of material.knowledge?.chunks || []) {
      const chunkTerms = tokenize(chunk.text);
      let overlap = 0;
      for (const term of chunkTerms) {
        if (queryTerms.has(term)) overlap += 1;
      }
            if (overlap > 0) {
        scored.push({
          materialId: material._id,
          materialTitle: material.title,
          chunkOrder: chunk.order,
          page: chunk.page ?? null,
          text: chunk.text,
          score: overlap,
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Assembles the grounded context block used in Tutor + Quiz generation
 * prompts: project goal/notes, curated persistent context, weak concepts,
 * and retrieved material excerpts. Evidence-only - if nothing is retrieved,
 * the caller's prompt instructs the model to say so rather than invent facts
 * (PRD 3.2 Evidence Over Guessing).
 */
async function buildProjectContext(project, query) {
  const relevantChunks = query ? await rankRelevantChunks(project._id, query) : [];

  const weakMastery = await Mastery.find({ project: project._id, needsAttention: true })
    .populate('concept', 'name')
    .limit(10);

  const contextBlock = {
    projectName: project.name,
    projectGoal: project.goal,
    importantConcepts: project.context?.importantConcepts || [],
    previousDifficulties: project.context?.previousDifficulties || [],
    significantNotes: project.context?.significantNotes || [],
    areasRequiringAttention: project.context?.areasRequiringAttention || [],
    conceptsNeedingAttention: weakMastery.map((m) => m.concept?.name).filter(Boolean),
        retrievedMaterial: relevantChunks.map((c) => ({
      source: c.materialTitle,
      page: c.page,
      excerpt: c.text,
    })),
  };

  return { contextBlock, relevantChunks };
}

const SHORT_TERM_MESSAGE_LIMIT = 8;
const RECENT_ASSESSMENT_LIMIT = 3;

/**
 * PRD 17 Contextual Continuity + PRD 18 Grounded AI Learning.
 *
 * Assembles a structured, clearly-separated context for a single Tutor turn
 * instead of indiscriminately sending the entire historical context to every
 * AI request:
 *
 *   - Short-Term Context: only the last few turns of *this* conversation -
 *     what's needed to understand the current exchange.
 *   - Long-Term Relevant Context: durable, curated information that stays
 *     useful across future sessions - the User's learning goal, Project
 *     context, a compressed conversation summary (not raw transcript),
 *     concepts needing attention, and recent assessment history.
 *   - Project Knowledge: evidence retrieved from this Project's processed
 *     materials for the *current* question only.
 *
 * Also performs "Check Supporting Evidence" (PRD 18 step 5): if retrieval
 * returns nothing, evidenceStatus is 'insufficient' so the caller's prompt
 * can instruct the model to say so rather than invent an answer.
 */
async function assembleTutorContext({ project, user, conversation, query }) {
  // Identify Project Context (long-term, project-scoped, curated - not a full history dump)
  const projectContext = {
    goal: project.goal,
    importantConcepts: project.context?.importantConcepts || [],
    previousDifficulties: project.context?.previousDifficulties || [],
    significantNotes: project.context?.significantNotes || [],
    areasRequiringAttention: project.context?.areasRequiringAttention || [],
  };

    // Retrieve Relevant Content -> Project Knowledge
  const relevantChunks = query ? await rankRelevantChunks(project._id, query) : [];
  const evidenceStatus = relevantChunks.length > 0 ? 'grounded' : 'insufficient'; // Check Supporting Evidence

  const projectKnowledge = relevantChunks.map((c) => ({
    source: c.materialTitle,
    page: c.page,
    excerpt: c.text,
  }));

  const [readyMaterialCount, totalMaterialCount] = await Promise.all([
    Material.countDocuments({ project: project._id, processingStatus: 'ready' }),
    Material.countDocuments({ project: project._id }),
  ]);

  // Assessment History (long-term signal, kept as a compact summary, not raw attempt dumps)
  const [weakMastery, recentAttempts] = await Promise.all([
    Mastery.find({ project: project._id, needsAttention: true }).populate('concept', 'name').limit(10),
    QuizAttempt.find({ project: project._id, user: user._id, status: 'evaluated' })
      .sort({ createdAt: -1 })
      .limit(RECENT_ASSESSMENT_LIMIT)
      .select('score createdAt'),
  ]);

  // Short-Term Context: recent turns of THIS conversation only (never other conversations/projects)
  const recentMessages = conversation
    ? await Message.find({ conversation: conversation._id }).sort({ createdAt: -1 }).limit(SHORT_TERM_MESSAGE_LIMIT)
    : [];
  const shortTermHistory = recentMessages.reverse().map((m) => ({ role: m.role, content: m.content }));

  // Long-Term Relevant Context: durable, compressed - a rolling summary
  // replaces older raw turns so this never grows unbounded (PRD 3.4 + 17).
   const longTermContext = {
    userLearningGoal: user.globalContext?.overallGoals?.length ? user.globalContext.overallGoals : null,
    learningPreferences: user.globalContext?.learningPreferences || null,
    project: projectContext,
    conversationSummary: conversation?.summary || null,
    conceptsNeedingAttention: weakMastery.map((m) => m.concept?.name).filter(Boolean),
    recentAssessmentHistory: recentAttempts.map((a) => ({ score: a.score, date: a.createdAt })),
    materialsStatus: { readyCount: readyMaterialCount, totalCount: totalMaterialCount },
  };

  return { shortTermHistory, longTermContext, projectKnowledge, evidenceStatus, relevantChunks };
}

module.exports = { buildProjectContext, rankRelevantChunks, tokenize, assembleTutorContext };
