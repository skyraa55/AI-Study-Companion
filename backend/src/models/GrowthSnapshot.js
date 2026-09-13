const mongoose = require('mongoose');

// A per-Project growth analysis snapshot: where each concept currently
// stands, how it moved from its previous score, and 1-3 actionable
// recommendations answering "what should I do next?" (PRD 30-32).
const growthSnapshotSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },

    concepts: [
      {
        name: { type: String, required: true },
        previousScore: { type: Number, default: 0 },
        currentScore: { type: Number, default: 0 },
        trend: { type: String, enum: ['improving', 'stable', 'declining', 'new'] },
        isStrong: { type: Boolean, default: false },
        isWeak: { type: Boolean, default: false },
        needsAttention: { type: Boolean, default: false },
      },
    ],

    recommendations: [{ type: String }],

    trigger: {
      type: String,
      enum: ['manual_refresh', 'quiz_completed', 'repeated_mistake_pattern'],
      default: 'manual_refresh',
    },

    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

growthSnapshotSchema.index({ project: 1, user: 1, createdAt: -1 });

module.exports = mongoose.model('GrowthSnapshot', growthSnapshotSchema);