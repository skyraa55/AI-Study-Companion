const { getProvider, getFallbackProvider } = require('./ai/providerRegistry');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

async function callClaude({ purpose, system, messages, maxTokens = 1200, promptVersion = '1.0', meta = {} }) {
  const provider = getProvider();
  try {
    const { text } = await provider.generateText({ purpose, system, messages, maxTokens, promptVersion, meta });
    return text;
  } catch (err) {
    console.error(`[aiService] Provider "${provider.name}" failed for purpose="${purpose}":`, err.message);
    if (!process.env.AI_FALLBACK_PROVIDER) throw err;
    const fallback = getFallbackProvider();
    const { text } = await fallback.generateText({ purpose, system, messages, maxTokens, promptVersion, meta });
    return text;
  }
}

async function callClaudeWithTools({
  purpose, system, messages, tools, executeTool, maxRounds = 3, maxTokens = 1200, promptVersion = '1.0', meta = {},
}) {
  const provider = getProvider();
  try {
    return await provider.generateTextWithTools({
      purpose, system, messages, tools, executeTool, maxRounds, maxTokens, promptVersion, meta,
    });
  } catch (err) {
    console.error(`[aiService] Provider "${provider.name}" failed for purpose="${purpose}":`, err.message);
    if (!process.env.AI_FALLBACK_PROVIDER) throw err;
    const fallback = getFallbackProvider();
    return fallback.generateTextWithTools({ purpose, system, messages, tools, executeTool, maxRounds, maxTokens, promptVersion, meta });
  }
}

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

module.exports = { callClaude, callClaudeWithTools, parseJSONResponse, MODEL };