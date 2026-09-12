const fs = require('fs');
const Material = require('../models/Material');
const Project = require('../models/Project');
const asyncHandler = require('../utils/asyncHandler');
const { enqueue } = require('../services/jobQueue');
const { extractTextFromFile } = require('../services/materialService');

// Add material as pasted text or note (PRD: Add Learning Materials)
const addTextMaterial = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const { title, content, type } = req.body;
  if (!title || !content) return res.status(400).json({ message: 'title and content are required.' });

  const material = await Material.create({
    user: req.user._id,
    project: project._id,
    title,
    type: type === 'note' ? 'note' : 'text',
    rawContent: content,
    processingStatus: 'pending',
  });

  const job = await enqueue({
    type: 'material_processing',
    user: req.user._id,
    project: project._id,
    relatedId: material._id,
  });

  res.status(201).json({ material, jobId: job._id });
});

// Add material via file upload (.pdf / .txt) - PRD: Process & Understand Content
const uploadFileMaterial = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

  let rawContent = '';
  try {
    rawContent = await extractTextFromFile(req.file.path, req.file.mimetype);
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(422).json({ message: `Could not extract text from file: ${err.message}` });
  } finally {
    fs.unlink(req.file.path, () => {}); // don't retain raw uploaded binary, only extracted text
  }

  const material = await Material.create({
    user: req.user._id,
    project: project._id,
    title: req.body.title || req.file.originalname,
    type: req.file.mimetype === 'application/pdf' ? 'pdf' : 'text',
    sourceFileName: req.file.originalname,
    rawContent,
    processingStatus: 'pending',
  });

  const job = await enqueue({
    type: 'material_processing',
    user: req.user._id,
    project: project._id,
    relatedId: material._id,
  });

  res.status(201).json({ material, jobId: job._id });
});

const listMaterials = asyncHandler(async (req, res) => {
  const materials = await Material.find({ project: req.params.projectId, user: req.user._id })
    .select('-rawContent -knowledge.chunks')
    .sort({ createdAt: -1 });
  res.json({ materials });
});

const getMaterial = asyncHandler(async (req, res) => {
  const material = await Material.findOne({ _id: req.params.id, user: req.user._id });
  if (!material) return res.status(404).json({ message: 'Material not found.' });
  res.json({ material });
});

const deleteMaterial = asyncHandler(async (req, res) => {
  const material = await Material.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!material) return res.status(404).json({ message: 'Material not found.' });
  res.json({ message: 'Material deleted.' });
});

const reprocessMaterial = asyncHandler(async (req, res) => {
  const material = await Material.findOne({ _id: req.params.id, user: req.user._id });
  if (!material) return res.status(404).json({ message: 'Material not found.' });

  material.processingStatus = 'pending';
  await material.save();

  const job = await enqueue({
    type: 'material_processing',
    user: req.user._id,
    project: material.project,
    relatedId: material._id,
  });

  res.json({ message: 'Reprocessing queued.', jobId: job._id });
});

module.exports = {
  addTextMaterial,
  uploadFileMaterial,
  listMaterials,
  getMaterial,
  deleteMaterial,
  reprocessMaterial,
};
