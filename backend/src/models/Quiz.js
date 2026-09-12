const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true },
    type: { type: String, enum: ['mcq', 'short_answer', 'true_false'], default: 'mcq' },
    options: [{ type: String }], // for mcq / true_false
    correctAnswer: { type: String, required: true },
    concept: { type: String, required: true }, // concept name this question targets
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    explanation: { type: String, default: '' },
  },
  { _id: true }
);

const quizSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, default: 'Adaptive Quiz' },

    questions: [questionSchema],
    adaptiveContext: {
      targetedConcepts: [{ type: String }], // concepts chosen based on weak mastery
      generationNotes: { type: String, default: '' }, // why these Qs were chosen
    },

    status: { type: String, enum: ['generating', 'ready', 'failed'], default: 'generating' },
    generationJob: { type: mongoose.Schema.Types.ObjectId, ref: 'BackgroundJob', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Quiz', quizSchema);
