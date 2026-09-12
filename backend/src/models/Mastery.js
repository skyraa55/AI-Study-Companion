const mongoose = require('mongoose');

// Tracks the user's evolving mastery of a Concept within a Project
const masterySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },

    masteryScore: { type: Number, default: 0, min: 0, max: 100 },
    attemptsCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },

    trend: { type: String, enum: ['improving', 'stable', 'declining', 'new'], default: 'new' },
    lastEvaluatedAt: { type: Date, default: Date.now },
    needsAttention: { type: Boolean, default: false },
  },
  { timestamps: true }
);

masterySchema.index({ project: 1, concept: 1 }, { unique: true });

module.exports = mongoose.model('Mastery', masterySchema);
