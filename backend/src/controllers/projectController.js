const Project = require('../models/Project');
const Space = require('../models/Space');
const Material = require('../models/Material');
const Mastery = require('../models/Mastery');
const Concept = require('../models/Concept');
const QuizAttempt = require('../models/QuizAttempt');
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

  const [materialCount, readyMaterialCount, conceptCount, masteries, attemptCount] = await Promise.all([
    Material.countDocuments({ project: project._id }),
    Material.countDocuments({ project: project._id, processingStatus: 'ready' }),
    Concept.countDocuments({ project: project._id }),
    Mastery.find({ project: project._id, user: req.user._id }),
    QuizAttempt.countDocuments({ project: project._id, user: req.user._id, status: 'evaluated' }),
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

module.exports = {
  createProject,
  listProjectsInSpace,
  getProject,
  updateProject,
  deleteProject,
  getProjectSummary,
};
