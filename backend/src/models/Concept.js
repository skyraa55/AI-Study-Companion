const mongoose = require('mongoose');

// A discrete, trackable unit of knowledge within a Project (used for Mastery)
const conceptSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    sourceMaterials: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Material' }],
  },
  { timestamps: true }
);

conceptSchema.index({ project: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Concept', conceptSchema);
