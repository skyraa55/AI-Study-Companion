const Mastery = require('../models/Mastery');
const Project = require('../models/Project');
const asyncHandler = require('../utils/asyncHandler');

// Concept Mastery view for a Project (PRD core loop: Update Concept Mastery)
const listMasteryForProject = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const masteries = await Mastery.find({ project: project._id, user: req.user._id })
    .populate('concept', 'name description')
    .sort({ masteryScore: 1 });

  res.json({ masteries });
});

module.exports = { listMasteryForProject };
