const mongoose = require('mongoose');

// Simple observable job record for async work (PRD 3.5 Asynchronous by Design,
// 3.6 Observable AI -> "Background workflows"). Execution is handled by an
// in-process async job runner (src/services/jobQueue.js) - swap-able for a real
// queue (BullMQ/Redis, SQS, etc.) in production without changing this schema.
const backgroundJobSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'material_processing',
        'quiz_generation',
        'quiz_evaluation',
        'mastery_update',
        'analytics_aggregation',
        'recommendation_generation',
      ],
      required: true,
    },
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null }, // e.g. materialId, quizId, attemptId

    input: { type: mongoose.Schema.Types.Mixed, default: {} },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: null },

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

backgroundJobSchema.index({ status: 1, type: 1 });
backgroundJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BackgroundJob', backgroundJobSchema);
