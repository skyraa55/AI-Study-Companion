const mongoose = require('mongoose');

const spaceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '📘' }, // optional visual identity
    color: { type: String, default: '#6366f1' },

    // Denormalized quick-stats for dashboard performance (kept in sync by services)
    stats: {
      projectCount: { type: Number, default: 0 },
      overallProgress: { type: Number, default: 0 }, // 0-100
      lastActivityAt: { type: Date, default: Date.now },
    },

    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

spaceSchema.index({ user: 1, archived: 1 });

module.exports = mongoose.model('Space', spaceSchema);
