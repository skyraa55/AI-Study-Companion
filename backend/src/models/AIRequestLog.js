const mongoose = require('mongoose');

// Observable AI (PRD 3.6): every AI call is logged for inspection by the
// engineering/product team - latency, tokens, cost, failures, retrieval used.
const aiRequestLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },

    purpose: {
      type: String,
      enum: ['tutor_chat', 'quiz_generation', 'quiz_evaluation', 'knowledge_extraction', 'analytics_recommendation'],
      required: true,
    },

    model: { type: String, default: '' },
    promptPreview: { type: String, default: '' }, // truncated, not full prompt (avoid bloat)

    latencyMs: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    estimatedCostUsd: { type: Number, default: 0 },

    status: { type: String, enum: ['success', 'error'], default: 'success' },
    errorMessage: { type: String, default: null },

    retrievalUsed: { type: Boolean, default: false },
    retrievalChunkCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

aiRequestLogSchema.index({ createdAt: -1 });
aiRequestLogSchema.index({ purpose: 1, status: 1 });

module.exports = mongoose.model('AIRequestLog', aiRequestLogSchema);
