const mongoose = require('mongoose');

const masterySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },

    masteryScore: { type: Number, default: 0, min: 0, max: 100 },
    previousMasteryScore: { type: Number, default: 0 }, // snapshot before the most recent update (PRD 31 "Previous -> Current")
    attemptsCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },

    // Bounded history for simple growth charting (PRD 30/31) - capped in
    // code to the last 10 entries so this never grows unbounded (PRD 3.4).
    history: [
      {
        score: Number,
        date: { type: Date, default: Date.now },
      },
    ],

    trend: { type: String, enum: ['improving', 'stable', 'declining', 'new'], default: 'new' },
    lastEvaluatedAt: { type: Date, default: Date.now },
    needsAttention: { type: Boolean, default: false },

    // PRD 33 "Repeated Mistake Detected" workflow: consecutive wrong answers
    // on this concept, reset to 0 on any correct answer. patternFlaggedAt
    // makes the pattern-detection trigger idempotent (only fires once per streak).
    consecutiveMisses: { type: Number, default: 0 },
    patternFlaggedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

masterySchema.index({ project: 1, concept: 1 }, { unique: true });

module.exports = mongoose.model('Mastery', masterySchema);