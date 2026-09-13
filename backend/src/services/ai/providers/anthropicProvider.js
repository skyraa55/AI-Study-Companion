const Anthropic = require('@anthropic-ai/sdk');
const AIProvider = require('../AIProvider');
const { logAIRequest } = require('../requestLogger');

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

class AnthropicProvider extends AIProvider {
  constructor() {
    super('anthropic');
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async generateText({ purpose, system, messages, maxTokens = 1200, promptVersion = '1.0', meta = {} }) {
    const start = Date.now();
    let status = 'success';
    let errorMessage = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let text = '';

    try {
      const response = await this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: maxTokens,
        system,
        messages,
      });
      text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      inputTokens = response.usage?.input_tokens || 0;
      outputTokens = response.usage?.output_tokens || 0;
    } catch (err) {
      status = 'error';
      errorMessage = err.message || 'Unknown AI error';
      await this._log({ purpose, promptVersion, system, start, inputTokens, outputTokens, status, errorMessage, meta });
      throw err;
    }

    await this._log({ purpose, promptVersion, system, start, inputTokens, outputTokens, status, errorMessage, meta });
    return { text, inputTokens, outputTokens };
  }

  async generateTextWithTools({
    purpose, system, messages, tools, executeTool, maxRounds = 3, maxTokens = 1200, promptVersion = '1.0', meta = {},
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
        response = await this.client.messages.create({
          model: DEFAULT_MODEL,
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
        await this._log({ purpose, promptVersion, system, start, inputTokens, outputTokens, status, errorMessage, meta });
        throw err;
      }

      await this._log({ purpose, promptVersion, system, start, inputTokens, outputTokens, status, errorMessage, meta });

      const textBlocks = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      if (textBlocks) finalText = textBlocks;

      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
      if (toolUseBlocks.length === 0 || round === maxRounds - 1) break;

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

  async generateStructured(opts) {
    const { text } = await this.generateText(opts);
    return { data: parseJSON(text), raw: text };
  }

  supportsEmbeddings() {
    return false;
  }

  async _log({ purpose, promptVersion, system, start, inputTokens, outputTokens, status, errorMessage, meta }) {
    await logAIRequest({
      provider: this.name,
      model: DEFAULT_MODEL,
      purpose,
      promptVersion,
      promptPreview: system,
      latencyMs: Date.now() - start,
      inputTokens,
      outputTokens,
      status,
      errorMessage,
      userId: meta.userId,
      projectId: meta.projectId,
      retrievalUsed: meta.retrievalUsed,
      retrievalChunkCount: meta.retrievalChunkCount,
    });
  }
}

function parseJSON(raw) {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = Math.min(...[cleaned.indexOf('{'), cleaned.indexOf('[')].filter((i) => i !== -1));
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (firstBrace === Infinity || lastBrace === -1) {
    throw new Error('AI response did not contain parseable JSON');
  }
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}

module.exports = AnthropicProvider;