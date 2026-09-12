const fs = require('fs');
const Material = require('../models/Material');
const Concept = require('../models/Concept');
const Mastery = require('../models/Mastery');
const { callClaude, parseJSONResponse } = require('./aiService');
const { updateProgress } = require('./jobQueue');

const CHUNK_SIZE = 900;
const MIN_CHARS_PER_PAGE_FOR_TEXT = 15;
const MIN_TOTAL_CHARS = 40;

async function extractTextFromFile(filePath, mimetype) {
  if (mimetype === 'application/pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const pages = [];

    await pdfParse(buffer, {
      pagerender: async (pageData) => {
        const textContent = await pageData.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(' ');
        pages.push({ page: pages.length + 1, text: pageText });
        return pageText;
      },
    });

    const text = pages.map((p) => p.text).join('\n\n');
    return { text, pages, pageCount: pages.length };
  }

  const text = fs.readFileSync(filePath, 'utf-8');
  return { text, pages: [{ page: 1, text }], pageCount: 1 };
}

function detectStructure(text) {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const tableLikeLines = lines.filter(
    (l) => (l.match(/\t/g)?.length || 0) >= 2 || (l.match(/\|/g)?.length || 0) >= 2
  ).length;
  const headingLikeLines = lines.filter(
    (l) => l.trim().length > 0 && l.trim().length < 80 && l.trim() === l.trim().toUpperCase() && /[A-Z]/.test(l)
  ).length;

  return {
    hasTables: tableLikeLines >= 2,
    headingCount: headingLikeLines,
    notes:
      'Structure detection is heuristic (text-layout based); image and diagram content is not separately analyzed in this prototype.',
  };
}

function chunkPages(pages) {
  const chunks = [];
  let order = 0;
  for (const p of pages) {
    const clean = (p.text || '').replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    for (let i = 0; i < clean.length; i += CHUNK_SIZE) {
      chunks.push({ text: clean.slice(i, i + CHUNK_SIZE), order: order++, page: p.page });
    }
  }
  return chunks;
}

async function setStage(material, job, stage, progress) {
  material.processingStage = stage;
  material.processingProgress = progress;
  await material.save();
  if (job) await updateProgress(job._id, { stage, progress });
}

async function processMaterialJob(job) {
  const materialId = job.relatedId;
  const material = await Material.findById(materialId);
  if (!material) throw new Error('Material not found');

  material.processingStatus = 'processing';
  material.retryCount = job.retryCount;
  await setStage(material, job, 'reading_content', 10);

  try {
    let text = material.rawContent;
    let pages = [{ page: 1, text: material.rawContent }];
    let pageCount = material.pageCount || 1;

    if (job.input?.filePath) {
      const extracted = await extractTextFromFile(job.input.filePath, job.input.mimetype);
      text = extracted.text;
      pages = extracted.pages;
      pageCount = extracted.pageCount;
      material.rawContent = text;
      material.pageCount = pageCount;
    }

    const totalChars = text.replace(/\s+/g, '').length;
    const avgCharsPerPage = pageCount > 0 ? totalChars / pageCount : totalChars;
    material.possiblyScanned = avgCharsPerPage < MIN_CHARS_PER_PAGE_FOR_TEXT;

    if (totalChars < MIN_TOTAL_CHARS) {
      throw new Error(
        'This document appears to contain little to no extractable text (likely a scanned or image-only PDF). ' +
          'OCR is not yet supported in this prototype - please upload a text-based PDF or paste the content as text.'
      );
    }

    await setStage(material, job, 'understanding_structure', 35);
    material.structure = detectStructure(text);
    await material.save();

    await setStage(material, job, 'extracting_knowledge', 60);
    const extraction = await extractKnowledge(text.slice(0, 12000), {
      userId: material.user,
      projectId: material.project,
    });

    await setStage(material, job, 'creating_search_index', 85);
    const chunks = chunkPages(pages);

    material.knowledge = {
      summary: extraction.summary,
      keyConcepts: extraction.keyConcepts,
      chunks,
    };
    material.processingStatus = 'ready';
    material.processingStage = 'ready';
    material.processingProgress = 100;
    material.processingError = null;
    await material.save();

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

    return {
      materialId: material._id,
      conceptsExtracted: extraction.keyConcepts.length,
      pageCount,
      chunkCount: chunks.length,
    };
  } catch (err) {
    const isFinalAttempt = job.retryCount >= job.maxRetries;

    material.processingError = err.message;
    if (isFinalAttempt) {
      material.processingStatus = 'failed';
      material.processingStage = 'failed';
    } else {
      material.processingStatus = 'pending';
      material.processingStage = 'queued';
    }
    await material.save();
    throw err;
  } finally {
    if (job.input?.filePath) {
      fs.unlink(job.input.filePath, () => {});
    }
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
    return { summary: 'AI summary unavailable (parsing error).', keyConcepts: [] };
  }
}

module.exports = { processMaterialJob, chunkPages, extractTextFromFile, extractKnowledge, detectStructure };