const Project = require('../models/Project');
const Mastery = require('../models/Mastery');
const Conversation = require('../models/Conversation');
const QuizAttempt = require('../models/QuizAttempt');
const QuizSession = require('../models/QuizSession');
const asyncHandler = require('../utils/asyncHandler');

const ALLOWED_CONTEXT_FIELDS = [
  'importantConcepts',
  'previousDifficulties',
  'significantNotes',
  'areasRequiringAttention',
];

const getLearningContext = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id }).populate(
    'user',
    'globalContext'
  );
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const [masteries, conversations, attempts, sessions] = await Promise.all([
    Mastery.find({ project: project._id, user: req.user._id }).populate('concept', 'name'),
    Conversation.find({ project: project._id, user: req.user._id, summary: { $ne: '' } })
      .sort({ lastMessageAt: -1 })
      .limit(5)
      .select('title summary lastMessageAt'),
    QuizAttempt.find({ project: project._id, user: req.user._id, status: 'evaluated' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('score createdAt'),
    QuizSession.find({ project: project._id, user: req.user._id, status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(5)
      .select('score completedAt questions'),
  ]);

  const knownStrengths = masteries
    .filter((m) => m.concept && m.masteryScore >= 80)
    .map((m) => ({ concept: m.concept.name, masteryScore: m.masteryScore }));

  const knownWeaknesses = masteries
    .filter((m) => m.concept && m.needsAttention)
    .map((m) => ({ concept: m.concept.name, masteryScore: m.masteryScore, trend: m.trend }));

  const recentMistakeConcepts = new Set();
  for (const s of sessions) {
    for (const q of s.questions || []) {
      if (q.isCorrect === false) recentMistakeConcepts.add(q.concept);
    }
  }

  const learningHistory = {
    totalQuizzesTaken: attempts.length + sessions.length,
    totalConceptsTracked: masteries.length,
    firstTrackedAt: project.createdAt,
  };

  res.json({
    learningGoals: {
      project: project.goal || null,
      overall: req.user.globalContext?.overallGoals || [],
    },
    learningPreferences: req.user.globalContext?.learningPreferences || null,
    knownStrengths,
    knownWeaknesses,
    learningHistory,
    importantTutorContext: conversations.map((c) => ({
      title: c.title,
      summary: c.summary,
      lastMessageAt: c.lastMessageAt,
    })),
    assessmentContext: {
      recentScores: [
        ...attempts.map((a) => ({ date: a.createdAt, score: a.score })),
        ...sessions.map((s) => ({ date: s.completedAt, score: s.score })),
      ]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 8),
      recentMistakeConcepts: Array.from(recentMistakeConcepts),
    },
    curatedNotes: project.context,
  });
});

const removeContextNote = asyncHandler(async (req, res) => {
  const { field } = req.params;
  const { note } = req.body;

  if (!ALLOWED_CONTEXT_FIELDS.includes(field)) {
    return res.status(400).json({ message: `field must be one of: ${ALLOWED_CONTEXT_FIELDS.join(', ')}.` });
  }
  if (!note) return res.status(400).json({ message: 'note is required.' });

  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  project.context[field] = project.context[field].filter((n) => n !== note);
  await project.save();

  res.json({ project });
});

module.exports = { getLearningContext, removeContextNote };