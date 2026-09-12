const Anthropic = require('@anthropic-ai/sdk');
const AIRequestLog = require('../models/AIRequestLog');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// Rough public per-token pricing placeholder for cost observability.
// Replace with the real current rate card for the configured model.
const PRICE_PER_1K_INPUT = 0.003;
const PRICE_PER_1K_OUTPUT = 0.015;

/**
 * Central entry point for every AI call in the app (PRD 3.6 Observable AI +
 * 3.7 Safe Application Interaction: this is the ONLY place that talks to the
 * model, so application capabilities are never exposed to the model directly
 * as arbitrary code execution - only as structured prompts/responses).
 *
 * @param {Object} opts
 * @param {string} opts.purpose - one of AIRequestLog.purpose enum
 * @param {string} opts.system - system prompt
 * @param {Array}  opts.messages - [{role:'user'|'assistant', content:string}]
 * @param {number} [opts.maxTokens]
 * @param {Object} [opts.meta] - { userId, projectId, retrievalUsed, retrievalChunkCount }
 */
async function callClaude({ purpose, system, messages, maxTokens = 1200, meta = {} }) {
  const start = Date.now();
  let status = 'success';
  let errorMessage = null;
  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    });

    text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    inputTokens = response.usage?.input_tokens || 0;
    outputTokens = response.usage?.output_tokens || 0;
  } catch (err) {
    status = 'error';
    errorMessage = err.message || 'Unknown AI error';
    throw err;
  } finally {
    const latencyMs = Date.now() - start;
    const estimatedCostUsd =
      (inputTokens / 1000) * PRICE_PER_1K_INPUT + (outputTokens / 1000) * PRICE_PER_1K_OUTPUT;

    // Fire-and-forget logging - never let observability break the main flow
    AIRequestLog.create({
      user: meta.userId || null,
      project: meta.projectId || null,
      purpose,
      model: MODEL,
      promptPreview: (system || '').slice(0, 300),
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      status,
      errorMessage,
      retrievalUsed: !!meta.retrievalUsed,
      retrievalChunkCount: meta.retrievalChunkCount || 0,
    }).catch((logErr) => console.error('[aiService] Failed to write AIRequestLog:', logErr.message));
  }

  return text;
}

/**
 * Extracts a JSON object/array from a model response that may contain
 * markdown fences or stray preamble. Throws if nothing parseable is found -
 * callers should treat that as "evidence unavailable" (PRD 3.2) rather than
 * guessing.
 */
function parseJSONResponse(raw) {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = Math.min(
    ...[cleaned.indexOf('{'), cleaned.indexOf('[')].filter((i) => i !== -1)
  );
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (firstBrace === Infinity || lastBrace === -1) {
    throw new Error('AI response did not contain parseable JSON');
  }
  const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonSlice);
}

module.exports = { callClaude, parseJSONResponse, MODEL };
