const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, default: 'Tutor Session' },

    // Rolling summary so context stays useful across sessions without unbounded growth
    // (PRD 3.4 Persistent Context + avoid retaining irrelevant info)
    summary: { type: String, default: '' },

    lastMessageAt: { type: Date, default: Date.now },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Conversation', conversationSchema);
