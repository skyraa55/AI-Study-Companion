const Material = require('../models/Material');
const Mastery = require('../models/Mastery');
const Concept = require('../models/Concept');

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
      excerpt: c.text,
    })),
  };

  return { contextBlock, relevantChunks };
}

module.exports = { buildProjectContext, rankRelevantChunks, tokenize };
