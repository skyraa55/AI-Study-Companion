/**
 * PRD 41 AI Model & Provider Abstraction.
 *
 * The base contract every AI provider must implement. The rest of the
 * application depends ONLY on this interface (accessed via
 * services/ai/providerRegistry.js), never on a specific vendor SDK
 * directly - adding or swapping a provider means writing a new class here,
 * not touching call sites in materialService, quizService, tutorController,
 * etc.
 */
class AIProvider {
  constructor(name) {
    this.name = name;
  }

  async generateText(_opts) {
    throw new Error(`${this.name}: generateText not implemented`);
  }

  async generateTextWithTools(_opts) {
    throw new Error(`${this.name}: generateTextWithTools not implemented`);
  }

  async generateStructured(_opts) {
    throw new Error(`${this.name}: generateStructured not implemented`);
  }

  async evaluate(opts) {
    return this.generateStructured(opts);
  }

  async classify(opts) {
    return this.generateStructured(opts);
  }

  async understandDocument(opts) {
    return this.generateStructured(opts);
  }

  async embed(_opts) {
    throw new Error(
      `${this.name}: embed not implemented - this prototype uses keyword-based retrieval instead (see contextService.rankRelevantChunks)`
    );
  }

  supportsEmbeddings() {
    return false;
  }
}

module.exports = AIProvider;