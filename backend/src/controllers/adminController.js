const User = require('../models/User');
const Space = require('../models/Space');
const Project = require('../models/Project');
const Material = require('../models/Material');
const QuizAttempt = require('../models/QuizAttempt');
const Conversation = require('../models/Conversation');
const AIRequestLog = require('../models/AIRequestLog');
const BackgroundJob = require('../models/BackgroundJob');
const ActivityEvent = require('../models/ActivityEvent');
const asyncHandler = require('../utils/asyncHandler');

// PRD: Admin Dashboard -> monitor users, learning activity, Projects, engagement
const getOverview = asyncHandler(async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsersLast7d,
    totalSpaces,
    totalProjects,
    totalMaterials,
    materialsReady,
    totalQuizAttempts,
    totalConversations,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ 'globalContext.lastActiveAt': { $gte: sevenDaysAgo } }),
    Space.countDocuments({ archived: false }),
    Project.countDocuments({ archived: false }),
    Material.countDocuments(),
    Material.countDocuments({ processingStatus: 'ready' }),
    QuizAttempt.countDocuments({ status: 'evaluated' }),
    Conversation.countDocuments(),
  ]);

  res.json({
    totalUsers,
    activeUsersLast7d,
    totalSpaces,
    totalProjects,
    totalMaterials,
    materialsReady,
    totalQuizAttempts,
    totalConversations,
  });
});

// Users monitoring with basic engagement stats
const listUsers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const [users, total] = await Promise.all([
    User.find().select('-passwordHash').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(),
  ]);

  res.json({ users, total, page, pages: Math.ceil(total / limit) });
});

const getUserDetail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-passwordHash');
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const [spaceCount, projectCount, quizAttempts, aiRequests] = await Promise.all([
    Space.countDocuments({ user: user._id, archived: false }),
    Project.countDocuments({ user: user._id, archived: false }),
    QuizAttempt.countDocuments({ user: user._id, status: 'evaluated' }),
    AIRequestLog.countDocuments({ user: user._id }),
  ]);

  res.json({ user, spaceCount, projectCount, quizAttempts, aiRequests });
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const { isActive, role } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  if (isActive !== undefined) user.isActive = isActive;
  if (role !== undefined && ['user', 'admin'].includes(role)) user.role = role;
  await user.save();

  res.json({ user: user.toSafeJSON() });
});

// PRD 3.6 Observable AI -> AI usage: requests, latency, failures, tokens, cost
const getAIUsageSummary = asyncHandler(async (req, res) => {
  const [byPurpose, byProvider, totals] = await Promise.all([
    AIRequestLog.aggregate([
      {
        $group: {
          _id: '$purpose',
          count: { $sum: 1 },
          avgLatencyMs: { $avg: '$latencyMs' },
          totalCostUsd: { $sum: '$estimatedCostUsd' },
          errorCount: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]),
    AIRequestLog.aggregate([
      {
        $group: {
          _id: { provider: '$provider', promptVersion: '$promptVersion' },
          count: { $sum: 1 },
          totalCostUsd: { $sum: '$estimatedCostUsd' },
          errorCount: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]),
    AIRequestLog.aggregate([
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          totalInputTokens: { $sum: '$inputTokens' },
          totalOutputTokens: { $sum: '$outputTokens' },
          totalCostUsd: { $sum: '$estimatedCostUsd' },
          avgLatencyMs: { $avg: '$latencyMs' },
          errorCount: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  res.json({ totals: totals[0] || {}, byPurpose, byProvider });
});

const getAIRequestLogs = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 25, 100);
  const filter = {};
  if (req.query.purpose) filter.purpose = req.query.purpose;
  if (req.query.status) filter.status = req.query.status;

  const [logs, total] = await Promise.all([
    AIRequestLog.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AIRequestLog.countDocuments(filter),
  ]);

  res.json({ logs, total, page, pages: Math.ceil(total / limit) });
});

// System health: background job success/failure rates & recent failures (PRD 3.6)
const getSystemHealth = asyncHandler(async (req, res) => {
  const [statusBreakdown, recentFailures, avgDurationByType] = await Promise.all([
    BackgroundJob.aggregate([{ $group: { _id: { type: '$type', status: '$status' }, count: { $sum: 1 } } }]),
    BackgroundJob.find({ status: 'failed' }).sort({ createdAt: -1 }).limit(20),
    BackgroundJob.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$type', avgDurationMs: { $avg: '$durationMs' }, count: { $sum: 1 } } },
    ]),
  ]);

  res.json({ statusBreakdown, recentFailures, avgDurationByType });
});

const listBackgroundJobs = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 25, 100);
  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;

  const [jobs, total] = await Promise.all([
    BackgroundJob.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    BackgroundJob.countDocuments(filter),
  ]);

  res.json({ jobs, total, page, pages: Math.ceil(total / limit) });
});

const listActivityEvents = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 25, 100);
  const filter = {};
  if (req.query.type) filter.type = req.query.type;

  const [events, total, typeBreakdown, failedEvents] = await Promise.all([
    ActivityEvent.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ActivityEvent.countDocuments(filter),
    ActivityEvent.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ActivityEvent.find({ 'processingErrors.0': { $exists: true } })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('type message processingErrors createdAt'),
  ]);

  res.json({ events, total, page, pages: Math.ceil(total / limit), typeBreakdown, failedEvents });
});

module.exports = {
  getOverview,
  listUsers,
  getUserDetail,
  updateUserStatus,
  getAIUsageSummary,
  getAIRequestLogs,
  getSystemHealth,
  listBackgroundJobs,
  listActivityEvents,
};