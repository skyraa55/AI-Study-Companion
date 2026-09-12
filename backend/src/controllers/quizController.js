const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Project = require('../models/Project');
const asyncHandler = require('../utils/asyncHandler');
const { enqueue } = require('../services/jobQueue');

// Take Adaptive Quiz (PRD core loop): kicks off async generation targeting weak concepts
const generateQuiz = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const quiz = await Quiz.create({
    user: req.user._id,
    project: project._id,
    status: 'generating',
  });

  const job = await enqueue({
    type: 'quiz_generation',
    user: req.user._id,
    project: project._id,
    relatedId: quiz._id,
  });

  quiz.generationJob = job._id;
  await quiz.save();

  res.status(202).json({ quiz, jobId: job._id, message: 'Quiz generation started.' });
});

const listQuizzes = asyncHandler(async (req, res) => {
  const quizzes = await Quiz.find({ project: req.params.projectId, user: req.user._id })
    .select('-questions.correctAnswer -questions.explanation')
    .sort({ createdAt: -1 });
  res.json({ quizzes });
});

// Full quiz WITH answers - only used internally / after evaluation; the "take quiz"
// screen should use getQuizForTaking to avoid leaking correct answers up front.
const getQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.id, user: req.user._id });
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
  res.json({ quiz });
});

const getQuizForTaking = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.id, user: req.user._id }).select(
    '-questions.correctAnswer -questions.explanation'
  );
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
  res.json({ quiz });
});

// Submit answers -> creates attempt, kicks off async evaluation (PRD 3.5)
const submitAttempt = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findOne({ _id: req.params.id, user: req.user._id });
  if (!quiz) return res.status(404).json({ message: 'Quiz not found.' });
  if (quiz.status !== 'ready') return res.status(400).json({ message: 'Quiz is not ready yet.' });

  const { answers } = req.body; // [{questionId, userAnswer}]
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ message: 'answers array is required.' });
  }

  const questionsById = new Map(quiz.questions.map((q) => [q._id.toString(), q]));
  const formattedAnswers = answers
    .filter((a) => questionsById.has(a.questionId))
    .map((a) => ({
      questionId: a.questionId,
      concept: questionsById.get(a.questionId).concept,
      userAnswer: a.userAnswer || '',
      isCorrect: false,
    }));

  const attempt = await QuizAttempt.create({
    user: req.user._id,
    project: quiz.project,
    quiz: quiz._id,
    answers: formattedAnswers,
    status: 'submitted',
    submittedAt: new Date(),
  });

  const job = await enqueue({
    type: 'quiz_evaluation',
    user: req.user._id,
    project: quiz.project,
    relatedId: attempt._id,
  });

  attempt.evaluationJob = job._id;
  await attempt.save();

  res.status(202).json({ attempt, jobId: job._id, message: 'Evaluation started.' });
});

const getAttempt = asyncHandler(async (req, res) => {
  const attempt = await QuizAttempt.findOne({ _id: req.params.attemptId, user: req.user._id });
  if (!attempt) return res.status(404).json({ message: 'Attempt not found.' });
  res.json({ attempt });
});

const listAttempts = asyncHandler(async (req, res) => {
  const attempts = await QuizAttempt.find({ project: req.params.projectId, user: req.user._id }).sort({
    createdAt: -1,
  });
  res.json({ attempts });
});

module.exports = {
  generateQuiz,
  listQuizzes,
  getQuiz,
  getQuizForTaking,
  submitAttempt,
  getAttempt,
  listAttempts,
};
