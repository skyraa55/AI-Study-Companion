const AIRequestLog = require('../../models/AIRequestLog');

const PRICE_PER_1K_INPUT = 0.003;
const PRICE_PER_1K_OUTPUT = 0.015;

async function logAIRequest({
  provider, model, purpose, promptVersion, promptPreview,
  latencyMs, inputTokens = 0, outputTokens = 0, status, errorMessage,
  userId, projectId, retrievalUsed, retrievalChunkCount,
}) {
  const estimatedCostUsd = (inputTokens / 1000) * PRICE_PER_1K_INPUT + (outputTokens / 1000) * PRICE_PER_1K_OUTPUT;

  try {
    await AIRequestLog.create({
      user: userId || null,
      project: projectId || null,
      purpose,
      model,
      provider,
      promptVersion,
      promptPreview: (promptPreview || '').slice(0, 300),
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      status,
      errorMessage: errorMessage || null,
      retrievalUsed: !!retrievalUsed,
      retrievalChunkCount: retrievalChunkCount || 0,
    });
  } catch (err) {
    console.error('[requestLogger] Failed to write AIRequestLog:', err.message);
  }
}

module.exports = { logAIRequest };