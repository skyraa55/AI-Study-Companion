const Project = require('../models/Project');
const QuizSession = require('../models/QuizSession');
const asyncHandler = require('../utils/asyncHandler');
const { startSession, submitAnswer, toPublicQuestion } = require('../services/adaptiveQuizService');

const startAdaptiveQuiz = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const targetQuestionCount = Math.min(Math.max(parseInt(req.body.questionCount) || 8, 3), 15);

  const session = await startSession(project, req.user, targetQuestionCount);
  const currentQuestion = toPublicQuestion(session.questions[session.questions.length - 1], session);

  res.status(201).json({
    sessionId: session._id,
    currentQuestion,
    progress: { asked: 0, total: session.targetQuestionCount, score: 0 },
  });
});

const getSession = asyncHandler(async (req, res) => {
  const session = await QuizSession.findOne({ _id: req.params.sessionId, user: req.user._id });
  if (!session) return res.status(404).json({ message: 'Quiz session not found.' });

  const current = session.questions[session.questions.length - 1];
  const currentQuestion = current && !current.answeredAt ? toPublicQuestion(current, session) : null;

  res.json({
    sessionId: session._id,
    status: session.status,
    currentQuestion,
    progress: {
      asked: session.questions.filter((q) => q.answeredAt).length,
      total: session.targetQuestionCount,
      score: session.score,
    },
    history: session.questions
      .filter((q) => q.answeredAt)
      .map((q) => ({
        prompt: q.prompt,
        type: q.type,
        difficulty: q.difficulty,
        concept: q.concept,
        userAnswer: q.userAnswer,
        isCorrect: q.isCorrect,
        feedback: q.feedback,
        evaluation: q.evaluation,
      })),
  });
});

const answerQuestion = asyncHandler(async (req, res) => {
  const session = await QuizSession.findOne({ _id: req.params.sessionId, user: req.user._id });
  if (!session) return res.status(404).json({ message: 'Quiz session not found.' });
  if (session.status === 'completed') {
    return res.status(400).json({ message: 'This quiz session is already completed.' });
  }

  const project = await Project.findOne({ _id: session.project, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const { userAnswer } = req.body;
  const result = await submitAnswer(session, project, req.user, userAnswer);

  res.json(result);
});

const listSessions = asyncHandler(async (req, res) => {
  const sessions = await QuizSession.find({ project: req.params.projectId, user: req.user._id })
    .select('-questions.correctAnswer -questions.explanation')
    .sort({ createdAt: -1 });
  res.json({ sessions });
});

module.exports = { startAdaptiveQuiz, getSession, answerQuestion, listSessions };