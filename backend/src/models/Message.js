const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },

    retrievalRefs: [
      {
        materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
        chunkOrder: Number,
        page: Number,
      },
    ],
    aiRequestLog: { type: mongoose.Schema.Types.ObjectId, ref: 'AIRequestLog', default: null },
    groundedness: { type: String, enum: ['grounded', 'insufficient', null], default: null },
    actions: [
      {
        name: String,
        input: mongoose.Schema.Types.Mixed,
        result: mongoose.Schema.Types.Mixed,
      },
    ],

    flaggedSignificant: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);