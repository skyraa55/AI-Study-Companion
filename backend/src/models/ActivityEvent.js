const mongoose = require('mongoose');

const activityEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true },

    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', default: null },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },

    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    message: { type: String, default: '' },

    dedupeKey: { type: String, default: null },

    processingErrors: [
      {
        listener: String,
        error: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

activityEventSchema.index({ project: 1, createdAt: -1 });
activityEventSchema.index({ user: 1, createdAt: -1 });
activityEventSchema.index({ type: 1, dedupeKey: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityEvent', activityEventSchema);