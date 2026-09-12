const mongoose = require('mongoose');

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

    stage: { type: String, default: null },
    progress: { type: Number, default: 0 },

    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 2 },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },

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
backgroundJobSchema.index({ type: 1, relatedId: 1, status: 1 });
backgroundJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BackgroundJob', backgroundJobSchema);