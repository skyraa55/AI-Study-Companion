const Project = require('../models/Project');
const ActivityEvent = require('../models/ActivityEvent');
const asyncHandler = require('../utils/asyncHandler');

const listProjectActivity = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const events = await ActivityEvent.find({ project: project._id, user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('type message payload createdAt');

  res.json({ events });
});

module.exports = { listProjectActivity };