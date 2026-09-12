const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },

    title: { type: String, required: true },
    type: { type: String, enum: ['text', 'pdf', 'note', 'link'], default: 'text' },
    sourceFileName: { type: String, default: null },

    rawContent: { type: String, default: '' }, // extracted plain text (kept, may be large)

    // Knowledge extraction output (PRD: Materials -> Knowledge)
    knowledge: {
      summary: { type: String, default: '' },
      keyConcepts: [{ type: String }],
      chunks: [
        {
          text: String,
          order: Number,
        },
      ],
    },

    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
    },
    processingError: { type: String, default: null },
  },
  { timestamps: true }
);

materialSchema.index({ project: 1, processingStatus: 1 });

module.exports = mongoose.model('Material', materialSchema);
