const AIProvider = require('../AIProvider');

class UnavailableProvider extends AIProvider {
  constructor() {
    super('unavailable');
  }

  async generateText() {
    return {
      text: 'The AI service is temporarily unavailable. Please try again shortly.',
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  async generateTextWithTools() {
    return {
      text: 'The AI service is temporarily unavailable. Please try again shortly.',
      toolCalls: [],
    };
  }

  async generateStructured() {
    throw new Error('AI service unavailable - no structured data could be generated.');
  }
}

module.exports = UnavailableProvider;