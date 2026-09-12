const mongoose = require('mongoose');

// A single asked question within an adaptive session, including its answer
// and evaluation once answered. Kept inline (not a separate Quiz doc) since
// questions are generated one at a time based on evolving learner state,
// not pre-baked as a fixed set (PRD 25/26).
const askedQuestionSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true },
    type: { type: String, enum: ['mcq', 'true_false', 'short_answer'], required: true },
    options: [{ type: String }],
    correctAnswer: { type: String, required: true },
    concept: { type: String, required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    explanation: { type: String, default: '' },

    userAnswer: { type: String, default: null },
    isCorrect: { type: Boolean, default: null },

    // Meaningful feedback (PRD 27/28) - not just a score. For open-ended
    // answers this is AI-generated prose; for mcq/true_false it falls back
    // to the question's explanation.
    feedback: { type: String, default: '' },

    // Rich open-ended assessment (PRD 28) - only populated for type === 'short_answer'
    evaluation: {
      understanding: { type: String, default: '' },
      accuracy: { type: String, default: '' },
      relevance: { type: String, default: '' },
      keyConceptsCovered: [{ type: String }],
      missingConcepts: [{ type: String }],
      reasoningQuality: { type: String, default: '' },
    },

    askedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date, default: null },
  },
  { _id: true }
);

const quizSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },

    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    targetQuestionCount: { type: Number, default: 8 },

    // Ordered history of every question asked in this session; the last
    // entry with answeredAt === null (if any) is the current pending question.
    questions: [askedQuestionSchema],

    score: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },

    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

quizSessionSchema.index({ project: 1, user: 1, status: 1 });

module.exports = mongoose.model('QuizSession', quizSessionSchema);