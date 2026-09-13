const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const Project = require('../models/Project');
const asyncHandler = require('../utils/asyncHandler');
const { enqueue } = require('../services/jobQueue');
const { computeDetailedProjectAnalytics, computeGlobalDashboard } = require('../services/analyticsService');

// Trigger a fresh project-level analytics aggregation (async, PRD 3.5)
const refreshProjectAnalytics = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const job = await enqueue({
    type: 'analytics_aggregation',
    user: req.user._id,
    project: project._id,
    relatedId: project._id,
  });
  res.status(202).json({ jobId: job._id, message: 'Analytics refresh started.' });
});

const getLatestProjectAnalytics = asyncHandler(async (req, res) => {
  const snapshot = await AnalyticsSnapshot.findOne({
    project: req.params.projectId,
    user: req.user._id,
    scope: 'project',
  }).sort({ createdAt: -1 });

  res.json({ snapshot: snapshot || null });
});

// PRD 34 Project Analytics: Activity / Performance / Growth / AI Activity.
// Pure aggregation, no AI call - safe to compute synchronously on every request.
const getProjectAnalyticsDetail = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const detail = await computeDetailedProjectAnalytics(project._id, req.user._id);
  res.json(detail);
});

// Global Analytics / Growth Tracking across all Spaces & Projects (PRD Product Structure)
const refreshGlobalAnalytics = asyncHandler(async (req, res) => {
  const job = await enqueue({
    type: 'analytics_aggregation',
    user: req.user._id,
    project: null,
    relatedId: null,
  });
  res.status(202).json({ jobId: job._id, message: 'Global analytics refresh started.' });
});

const getLatestGlobalAnalytics = asyncHandler(async (req, res) => {
  const snapshot = await AnalyticsSnapshot.findOne({ user: req.user._id, scope: 'global' }).sort({
    createdAt: -1,
  });
  res.json({ snapshot: snapshot || null });
});

// PRD 35/36 Global Analytics Dashboard: Overall Learning / Learning
// Performance / AI Usage / Trends. Pure aggregation across all Spaces &
// Projects, no AI call - safe to compute synchronously.
const getGlobalAnalyticsDetail = asyncHandler(async (req, res) => {
  const detail = await computeGlobalDashboard(req.user._id);
  res.json(detail);
});

module.exports = {
  refreshProjectAnalytics,
  getLatestProjectAnalytics,
  getProjectAnalyticsDetail,
  refreshGlobalAnalytics,
  getLatestGlobalAnalytics,
  getGlobalAnalyticsDetail,
};
