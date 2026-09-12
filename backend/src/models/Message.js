const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },

    // Observability: which materials/concepts were retrieved to ground this reply
    retrievalRefs: [
      {
        materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
        chunkOrder: Number,
      },
    ],
    aiRequestLog: { type: mongoose.Schema.Types.ObjectId, ref: 'AIRequestLog', default: null },

    flaggedSignificant: { type: Boolean, default: false }, // marked for persistent context
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
