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




/**
 * Tool-use variant of callClaude, used ONLY by the AI Tutor for PRD 22 AI
 * Application Capabilities. The model may request tools (from `tools`);
 * each request is executed via `executeTool(name, input)` - the caller is
 * responsible for that function being the controlled/validated/
 * permission-aware dispatcher (see services/aiCapabilities.js), never
 * arbitrary code or direct DB access.
 *
 * Bounded by `maxRounds` (default 3) and at most 3 tool calls executed per
 * round, so a misbehaving model cannot spin into an unbounded action loop
 * (Controlled). Every round is logged exactly like callClaude (Observable).
 *
 * Returns { text, toolCalls } where toolCalls is the ordered list of
 * { name, input, result } actually executed, for the caller to surface to
 * the user/UI.
 */
async function callClaudeWithTools({
  purpose,
  system,
  messages,
  tools,
  executeTool,
  maxRounds = 3,
  maxTokens = 1200,
  meta = {},
}) {
  let convo = [...messages];
  let finalText = '';
  const toolCalls = [];

  for (let round = 0; round < maxRounds; round++) {
    const start = Date.now();
    let response;
    let status = 'success';
    let errorMessage = null;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: convo,
        tools,
      });
      inputTokens = response.usage?.input_tokens || 0;
      outputTokens = response.usage?.output_tokens || 0;
    } catch (err) {
      status = 'error';
      errorMessage = err.message || 'Unknown AI error';
      const latencyMs = Date.now() - start;
      AIRequestLog.create({
        user: meta.userId || null,
        project: meta.projectId || null,
        purpose,
        model: MODEL,
        promptPreview: (system || '').slice(0, 300),
        latencyMs,
        inputTokens,
        outputTokens,
        estimatedCostUsd: 0,
        status,
        errorMessage,
        retrievalUsed: !!meta.retrievalUsed,
        retrievalChunkCount: meta.retrievalChunkCount || 0,
      }).catch(() => {});
      throw err;
    }

    const latencyMs = Date.now() - start;
    const estimatedCostUsd =
      (inputTokens / 1000) * PRICE_PER_1K_INPUT + (outputTokens / 1000) * PRICE_PER_1K_OUTPUT;
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

    const textBlocks = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (textBlocks) finalText = textBlocks;

    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    if (toolUseBlocks.length === 0 || round === maxRounds - 1) break;

    // Controlled: cap how many tool calls are honored per round
    const cappedToolUse = toolUseBlocks.slice(0, 3);
    const toolResultsContent = [];

    for (const block of cappedToolUse) {
      let result;
      try {
        result = await executeTool(block.name, block.input);
      } catch (err) {
        result = { error: err.message };
      }
      toolCalls.push({ name: block.name, input: block.input, result });
      toolResultsContent.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result ?? {}).slice(0, 4000),
      });
    }

    convo.push({ role: 'assistant', content: response.content });
    convo.push({ role: 'user', content: toolResultsContent });
  }

  return { text: finalText, toolCalls };
}

module.exports = { callClaude, callClaudeWithTools, parseJSONResponse, MODEL };
