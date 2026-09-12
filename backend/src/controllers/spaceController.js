const Space = require('../models/Space');
const Project = require('../models/Project');
const asyncHandler = require('../utils/asyncHandler');

const createSpace = asyncHandler(async (req, res) => {
  const { name, description, icon, color } = req.body;
  if (!name) return res.status(400).json({ message: 'Space name is required.' });

  const space = await Space.create({
    user: req.user._id,
    name,
    description: description || '',
    icon: icon || '📘',
    color: color || '#6366f1',
  });
  res.status(201).json({ space });
});

const listSpaces = asyncHandler(async (req, res) => {
  const spaces = await Space.find({ user: req.user._id, archived: false }).sort({ updatedAt: -1 });
  res.json({ spaces });
});

const getSpace = asyncHandler(async (req, res) => {
  const space = await Space.findOne({ _id: req.params.id, user: req.user._id });
  if (!space) return res.status(404).json({ message: 'Space not found.' });
  res.json({ space });
});

// Space Dashboard (PRD 7): projects, overall progress, recent activity, areas requiring attention
const getSpaceDashboard = asyncHandler(async (req, res) => {
  const space = await Space.findOne({ _id: req.params.id, user: req.user._id });
  if (!space) return res.status(404).json({ message: 'Space not found.' });

  const projects = await Project.find({ space: space._id, user: req.user._id, archived: false }).sort({
    lastAccessedAt: -1,
  });

  const overallProgress = projects.length
    ? Math.round(projects.reduce((sum, p) => sum + p.progress, 0) / projects.length)
    : 0;

  const areasRequiringAttention = projects
    .filter((p) => (p.context?.areasRequiringAttention || []).length > 0)
    .flatMap((p) => p.context.areasRequiringAttention.map((a) => ({ project: p.name, note: a })));

  space.stats.projectCount = projects.length;
  space.stats.overallProgress = overallProgress;
  space.stats.lastActivityAt = projects[0]?.lastAccessedAt || space.stats.lastActivityAt;
  await space.save();

  res.json({
    space,
    projectCount: projects.length,
    overallProgress,
    activeProjects: projects.filter((p) => p.status === 'active'),
    recentlyAccessedProjects: projects.slice(0, 5),
    areasRequiringAttention,
  });
});

const updateSpace = asyncHandler(async (req, res) => {
  const space = await Space.findOne({ _id: req.params.id, user: req.user._id });
  if (!space) return res.status(404).json({ message: 'Space not found.' });

  const { name, description, icon, color } = req.body;
  if (name !== undefined) space.name = name;
  if (description !== undefined) space.description = description;
  if (icon !== undefined) space.icon = icon;
  if (color !== undefined) space.color = color;
  await space.save();

  res.json({ space });
});

const deleteSpace = asyncHandler(async (req, res) => {
  const space = await Space.findOne({ _id: req.params.id, user: req.user._id });
  if (!space) return res.status(404).json({ message: 'Space not found.' });

  space.archived = true;
  await space.save();
  res.json({ message: 'Space archived.' });
});

module.exports = { createSpace, listSpaces, getSpace, getSpaceDashboard, updateSpace, deleteSpace };
