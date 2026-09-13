const Project = require('../models/Project');
const GrowthSnapshot = require('../models/GrowthSnapshot');
const asyncHandler = require('../utils/asyncHandler');
const { enqueue } = require('../services/jobQueue');

const refreshGrowth = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const job = await enqueue({
    type: 'growth_analysis',
    user: req.user._id,
    project: project._id,
    relatedId: null,
    input: { trigger: 'manual_refresh' },
  });

  res.status(202).json({ jobId: job._id, message: 'Growth analysis refresh started.' });
});

const getLatestGrowth = asyncHandler(async (req, res) => {
  const snapshot = await GrowthSnapshot.findOne({
    project: req.params.projectId,
    user: req.user._id,
  }).sort({ createdAt: -1 });

  res.json({ snapshot: snapshot || null });
});

module.exports = { refreshGrowth, getLatestGrowth };