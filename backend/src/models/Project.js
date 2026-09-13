const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },

    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    goal: { type: String, default: '' }, // learning goal for this project

    // Project-scoped learning context (PRD 3.1 Context First / 3.4 Persistent Context)
    context: {
      importantConcepts: [{ type: String }],
      previousDifficulties: [{ type: String }],
      significantNotes: [{ type: String }], // curated, not raw transcript dump
      areasRequiringAttention: [{ type: String }],
    },

       progress: { type: Number, default: 0 }, // 0-100, derived from mastery
    status: { type: String, enum: ['active', 'completed', 'paused'], default: 'active' },

    // PRD 32 "Previous recommendations" - lets the growth recommendation
    // generator avoid repeating itself verbatim across refreshes.
    growthState: {
      lastRecommendations: [{ type: String }],
      lastGeneratedAt: { type: Date, default: null },
    },

    lastAccessedAt: { type: Date, default: Date.now },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

projectSchema.index({ user: 1, space: 1, archived: 1 });

module.exports = mongoose.model('Project', projectSchema);
