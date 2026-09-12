const fs = require('fs');
const Material = require('../models/Material');
const Concept = require('../models/Concept');
const Mastery = require('../models/Mastery');
const { callClaude, parseJSONResponse } = require('./aiService');

const CHUNK_SIZE = 900; // characters per chunk, simple fixed-window chunking

function chunkText(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  let order = 0;
  for (let i = 0; i < clean.length; i += CHUNK_SIZE) {
    chunks.push({ text: clean.slice(i, i + CHUNK_SIZE), order: order++ });
  }
  return chunks;
}

async function extractTextFromFile(filePath, mimetype) {
  if (mimetype === 'application/pdf') {
    // pdf-parse is required lazily so the app still boots without the pdf
    // dependency present if a deployment only needs plain-text materials.
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Background job handler: 'material_processing'
 * Steps: extract text -> chunk -> AI knowledge extraction (summary + key
 * concepts) -> persist Concept docs (creating Mastery placeholders) -> mark
 * material ready. Runs off the request cycle (PRD 3.5 Asynchronous by Design).
 */
async function processMaterialJob(job) {
  const materialId = job.relatedId;
  const material = await Material.findById(materialId);
  if (!material) throw new Error('Material not found');

  material.processingStatus = 'processing';
  await material.save();

  try {
    const chunks = chunkText(material.rawContent);

    const extraction = await extractKnowledge(material.rawContent.slice(0, 12000), {
      userId: material.user,
      projectId: material.project,
    });

    material.knowledge = {
      summary: extraction.summary,
      keyConcepts: extraction.keyConcepts,
      chunks,
    };
    material.processingStatus = 'ready';
    material.processingError = null;
    await material.save();

    // Register/merge concepts and ensure a Mastery placeholder exists per user+project
    for (const conceptName of extraction.keyConcepts) {
      const concept = await Concept.findOneAndUpdate(
        { project: material.project, name: conceptName },
        { $addToSet: { sourceMaterials: material._id } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      await Mastery.findOneAndUpdate(
        { project: material.project, concept: concept._id, user: material.user },
        { $setOnInsert: { masteryScore: 0, trend: 'new' } },
        { upsert: true }
      );
    }

    return { materialId: material._id, conceptsExtracted: extraction.keyConcepts.length };
  } catch (err) {
    material.processingStatus = 'failed';
    material.processingError = err.message;
    await material.save();
    throw err;
  }
}

async function extractKnowledge(content, meta) {
  if (!content || content.trim().length < 20) {
    return { summary: 'Not enough content to summarize.', keyConcepts: [] };
  }

  const system = `You are a knowledge-extraction engine for a learning platform.
Given study material, extract a concise summary and a list of distinct, well-named
key concepts a learner would need to master. Respond with STRICT JSON only, no
markdown, no preamble, in this exact shape:
{"summary": string, "keyConcepts": string[]}
Keep keyConcepts to 3-10 short noun-phrases (e.g. "Binary Search", "Photosynthesis Light Reactions").
If the content is too sparse or unclear to extract meaningfully, return an empty
keyConcepts array rather than inventing concepts.`;

  const raw = await callClaude({
    purpose: 'knowledge_extraction',
    system,
    messages: [{ role: 'user', content }],
    maxTokens: 800,
    meta,
  });

  try {
    const parsed = parseJSONResponse(raw);
    return {
      summary: parsed.summary || '',
      keyConcepts: Array.isArray(parsed.keyConcepts) ? parsed.keyConcepts.slice(0, 10) : [],
    };
  } catch (e) {
    // Evidence Over Guessing: fail soft with an explicit note rather than
    // inventing a summary/concepts from nothing.
    return { summary: 'AI summary unavailable (parsing error).', keyConcepts: [] };
  }
}

module.exports = { processMaterialJob, chunkText, extractTextFromFile, extractKnowledge };
