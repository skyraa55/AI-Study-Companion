const Project = require('../models/Project');
const Space = require('../models/Space');
const Material = require('../models/Material');
const Mastery = require('../models/Mastery');
const Concept = require('../models/Concept');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const QuizSession = require('../models/QuizSession');
const Conversation = require('../models/Conversation');
const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const asyncHandler = require('../utils/asyncHandler');

const createProject = asyncHandler(async (req, res) => {
  const { spaceId } = req.params;
  const { name, description, goal } = req.body;
  if (!name) return res.status(400).json({ message: 'Project name is required.' });

  const space = await Space.findOne({ _id: spaceId, user: req.user._id });
  if (!space) return res.status(404).json({ message: 'Space not found.' });

  const project = await Project.create({
    user: req.user._id,
    space: space._id,
    name,
    description: description || '',
    goal: goal || '',
  });

  space.stats.projectCount += 1;
  await space.save();

  res.status(201).json({ project });
});

const listProjectsInSpace = asyncHandler(async (req, res) => {
  const projects = await Project.find({
    space: req.params.spaceId,
    user: req.user._id,
    archived: false,
  }).sort({ lastAccessedAt: -1 });
  res.json({ projects });
});

const getProject = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  project.lastAccessedAt = new Date();
  await project.save();

  res.json({ project });
});

const updateProject = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const { name, description, goal, status, context } = req.body;
  if (name !== undefined) project.name = name;
  if (description !== undefined) project.description = description;
  if (goal !== undefined) project.goal = goal;
  if (status !== undefined) project.status = status;
  if (context !== undefined) project.context = { ...project.context.toObject(), ...context };
  await project.save();

  res.json({ project });
});

const deleteProject = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  project.archived = true;
  await project.save();
  res.json({ message: 'Project archived.' });
});

// Project workspace summary - counts across Materials/Knowledge/Mastery/Quiz for tab badges
const getProjectSummary = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

   const [masteries, conversations, quizAttempts, adaptiveSessions, materials, latestSnapshot] = await Promise.all([
    Mastery.find({ project: project._id, user: req.user._id }).populate('concept', 'name description'),
    Conversation.find({ project: project._id, user: req.user._id, archived: false })
      .sort({ lastMessageAt: -1 })
      .limit(5),
    QuizAttempt.find({ project: project._id, user: req.user._id, status: 'evaluated' })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('quiz', 'title'),
    QuizSession.find({ project: project._id, user: req.user._id, status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(10),
    Material.find({ project: project._id, user: req.user._id })
      .select('title processingStatus createdAt')
      .sort({ createdAt: -1 })
      .limit(5),
    AnalyticsSnapshot.findOne({ project: project._id, user: req.user._id, scope: 'project' }).sort({
      createdAt: -1,
    }),
  ]);

  res.json({
    project,
    materialCount,
    readyMaterialCount,
    conceptCount,
    masteredConceptCount: masteries.filter((m) => m.masteryScore >= 80).length,
    needsAttentionCount: masteries.filter((m) => m.needsAttention).length,
    quizAttemptCount: attemptCount,
  });
});

const getProjectDashboard = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.id, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const [masteries, conversations, quizAttempts, materials, latestSnapshot] = await Promise.all([
    Mastery.find({ project: project._id, user: req.user._id }).populate('concept', 'name description'),
    Conversation.find({ project: project._id, user: req.user._id, archived: false })
      .sort({ lastMessageAt: -1 })
      .limit(5),
    QuizAttempt.find({ project: project._id, user: req.user._id, status: 'evaluated' })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('quiz', 'title'),
    Material.find({ project: project._id, user: req.user._id })
      .select('title processingStatus createdAt')
      .sort({ createdAt: -1 })
      .limit(5),
    AnalyticsSnapshot.findOne({ project: project._id, user: req.user._id, scope: 'project' }).sort({
      createdAt: -1,
    }),
  ]);

  // --- Concepts -------------------------------------------------------
  const concepts = masteries
    .filter((m) => m.concept)
    .map((m) => ({
      id: m.concept._id,
      name: m.concept.name,
      masteryScore: m.masteryScore,
      trend: m.trend,
      needsAttention: m.needsAttention,
    }))
    .sort((a, b) => a.masteryScore - b.masteryScore);

  // --- Recent Activity (merged feed: tutor / quiz / material) --------
  const recentActivity = [
    ...conversations.map((c) => ({
      type: 'tutor',
      id: c._id,
      title: c.title,
      detail: c.summary ? c.summary.slice(0, 120) : 'Tutor session',
      timestamp: c.lastMessageAt,
    })),
        ...quizAttempts.map((a) => ({
      type: 'quiz',
      id: a._id,
      title: a.quiz?.title || 'Quiz',
      detail: `Scored ${a.score}% (${a.correctCount}/${a.totalQuestions})`,
      timestamp: a.createdAt,
    })),
    ...adaptiveSessions.map((s) => ({
      type: 'quiz',
      id: s._id,
      title: 'Adaptive Quiz',
      detail: `Scored ${s.score}% (${s.correctCount}/${s.questions.length})`,
      timestamp: s.completedAt || s.updatedAt,
    })),
    ...materials.map((m) => ({
      type: 'material',
      id: m._id,
      title: m.title,
      detail: `Material ${m.processingStatus}`,
      timestamp: m.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 8);

  // --- Learning Performance (combines legacy batch attempts and the newer
  // adaptive quiz engine's completed sessions - PRD 25-28) -----------------
  const combinedResults = [
    ...quizAttempts.map((a) => ({ date: a.createdAt, score: a.score })),
    ...adaptiveSessions.map((s) => ({ date: s.completedAt || s.updatedAt, score: s.score })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  const scoreHistory = combinedResults;
  const totalQuizCount = combinedResults.length;

  const averageScore = totalQuizCount
    ? Math.round(combinedResults.reduce((s, r) => s + r.score, 0) / totalQuizCount)
    : 0;

  let performanceTrend = 'stable';
  if (totalQuizCount >= 2) {
    const mostRecentFirst = [...combinedResults].reverse();
    const recent = mostRecentFirst.slice(0, Math.min(3, totalQuizCount));
    const older = mostRecentFirst.slice(3, Math.min(6, totalQuizCount));
    if (older.length > 0) {
      const recentAvg = recent.reduce((s, r) => s + r.score, 0) / recent.length;
      const olderAvg = older.reduce((s, r) => s + r.score, 0) / older.length;
      if (recentAvg > olderAvg + 5) performanceTrend = 'improving';
      else if (recentAvg < olderAvg - 5) performanceTrend = 'declining';
    }
  }

  // --- Continue Learning: the single most recent activity across the project
  const continueLearning = recentActivity[0] || null;

  // --- Recommended Next Step ------------------------------------------
  // Prefer the latest AI-generated recommendation (Analytics tab); fall back
  // to a fast rule-based suggestion so the dashboard never calls the AI
  // synchronously (Asynchronous by Design).
  let recommendedNextStep = latestSnapshot?.recommendations?.[0] || null;
  if (!recommendedNextStep) {
    const weakest = concepts.find((c) => c.needsAttention);
    if (materials.length === 0) {
      recommendedNextStep = 'Add your first learning material to get started.';
    } else if (weakest) {
      recommendedNextStep = `Review "${weakest.name}" with the AI Tutor, then retake a quiz to reinforce it.`;
    } else if (totalQuizCount === 0) {
      recommendedNextStep = 'Take your first adaptive quiz to establish a mastery baseline.';
    } else {
      recommendedNextStep = 'Keep the momentum going - start a new Tutor session or try a fresh quiz.';
    }
  }

  // --- Learning Context (persistent, curated - PRD 3.4) ----------------
  const learningContext = {
    goal: project.goal,
    importantConcepts: project.context?.importantConcepts || [],
    previousDifficulties: project.context?.previousDifficulties || [],
    significantNotes: project.context?.significantNotes || [],
    areasRequiringAttention: project.context?.areasRequiringAttention || [],
  };

  res.json({
    project,
    progress: project.progress,
    concepts,
    recentActivity,
    performance: { averageScore, quizzesTaken: totalQuizCount, trend: performanceTrend, scoreHistory },
    continueLearning,
    recommendedNextStep,
    learningContext,
  });
});

module.exports = {
  createProject,
  listProjectsInSpace,
  getProject,
  updateProject,
  deleteProject,
  getProjectSummary,
   getProjectDashboard,
};
