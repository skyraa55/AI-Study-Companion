const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    concept: { type: String, required: true },
    userAnswer: { type: String, default: '' },
    isCorrect: { type: Boolean, default: false },
    aiEvaluationNote: { type: String, default: '' }, // for short-answer AI grading
  },
  { _id: false }
);

const quizAttemptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },

    answers: [answerSchema],
    score: { type: Number, default: 0 }, // percent
    totalQuestions: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },

    status: { type: String, enum: ['in_progress', 'submitted', 'evaluated'], default: 'in_progress' },
    evaluationJob: { type: mongoose.Schema.Types.ObjectId, ref: 'BackgroundJob', default: null },

    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);
