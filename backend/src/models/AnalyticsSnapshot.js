const mongoose = require('mongoose');

// Periodic aggregated snapshots (per-project and global) so the Analytics
// views don't need to recompute heavy aggregates on every page load.
const analyticsSnapshotSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scope: { type: String, enum: ['project', 'global'], required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },

    metrics: {
      quizzesTaken: { type: Number, default: 0 },
      averageScore: { type: Number, default: 0 },
      conceptsTracked: { type: Number, default: 0 },
      conceptsMastered: { type: Number, default: 0 }, // masteryScore >= 80
      conceptsNeedingAttention: { type: Number, default: 0 },
      studyStreakDays: { type: Number, default: 0 },
      totalTutorMessages: { type: Number, default: 0 },
      totalTimeMinutesEstimate: { type: Number, default: 0 },
    },

    recommendations: [{ type: String }], // "next learning action" suggestions
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

analyticsSnapshotSchema.index({ user: 1, scope: 1, project: 1 });

module.exports = mongoose.model('AnalyticsSnapshot', analyticsSnapshotSchema);
