const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Project = require('../models/Project');
const asyncHandler = require('../utils/asyncHandler');
const { callClaude } = require('../services/aiService');
const { buildProjectContext } = require('../services/contextService');

const SUMMARIZE_EVERY_N_MESSAGES = 10;

const createConversation = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const conversation = await Conversation.create({
    user: req.user._id,
    project: project._id,
    title: req.body.title || 'Tutor Session',
  });
  res.status(201).json({ conversation });
});

const listConversations = asyncHandler(async (req, res) => {
  const conversations = await Conversation.find({
    project: req.params.projectId,
    user: req.user._id,
    archived: false,
  }).sort({ lastMessageAt: -1 });
  res.json({ conversations });
});

const getMessages = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, user: req.user._id });
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });

  const messages = await Message.find({ conversation: conversation._id }).sort({ createdAt: 1 });
  res.json({ conversation, messages });
});

/**
 * Core "Learn with AI Tutor" endpoint. Context is strictly scoped to this
 * conversation's Project (PRD 3.1 Context First) - retrieval, mastery signal,
 * and persistent notes are all queried by project._id, never merged globally.
 */
const sendMessage = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, user: req.user._id });
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });

  const project = await Project.findOne({ _id: conversation.project, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ message: 'Message content is required.' });

  const userMessage = await Message.create({ conversation: conversation._id, role: 'user', content });

  const { contextBlock, relevantChunks } = await buildProjectContext(project, content);

  const recentMessages = await Message.find({ conversation: conversation._id })
    .sort({ createdAt: -1 })
    .limit(12);
  const history = recentMessages.reverse().map((m) => ({ role: m.role, content: m.content }));

  const system = `You are an AI Tutor inside the "${project.name}" project (goal: ${
    project.goal || 'not specified'
  }).
Use ONLY the following grounded project context and conversation summary to inform your
answer. If the context doesn't contain enough evidence to answer confidently, say so
explicitly instead of inventing facts (Evidence Over Guessing).
Never reference or use information from any other project.

Conversation summary so far: ${conversation.summary || '(none yet)'}

Project context:
${JSON.stringify(contextBlock, null, 2)}

When you rely on a specific excerpt from "retrievedMaterial", mention its source
title and page number in parentheses (e.g. "(See 'Chapter 2 Notes', p.3)") so the
learner can locate the evidence themselves.

Be encouraging, Socratic where useful, and concise. If the learner seems to be
struggling with a concept, note it plainly so it can be tracked.`;

  let assistantText;
  try {
    assistantText = await callClaude({
      purpose: 'tutor_chat',
      system,
      messages: history,
      maxTokens: 1000,
      meta: {
        userId: req.user._id,
        projectId: project._id,
        retrievalUsed: relevantChunks.length > 0,
        retrievalChunkCount: relevantChunks.length,
      },
    });
  } catch (err) {
    assistantText =
      "I'm having trouble reaching the AI service right now, so I can't respond confidently. Please try again shortly.";
  }

  const assistantMessage = await Message.create({
    conversation: conversation._id,
    role: 'assistant',
    content: assistantText,
           retrievalRefs: relevantChunks.map((c) => ({ materialId: c.materialId, chunkOrder: c.chunkOrder, page: c.page })),
  });

  conversation.lastMessageAt = new Date();
  await conversation.save();

  const messageCount = await Message.countDocuments({ conversation: conversation._id });
  if (messageCount % SUMMARIZE_EVERY_N_MESSAGES === 0) {
    summarizeConversation(conversation._id).catch((e) =>
      console.error('[tutorController] summarize failed:', e.message)
    );
  }

  res.status(201).json({ userMessage, assistantMessage });
});

/** Compresses older turns into conversation.summary (PRD 3.4 Persistent Context:
 * retain useful info across sessions without unbounded growth). */
async function summarizeConversation(conversationId) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return;

  const messages = await Message.find({ conversation: conversationId }).sort({ createdAt: 1 });
  const transcript = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

  const system = `Summarize this tutoring conversation into a compact, durable memory (max 150
words) capturing: learning goals discussed, concepts covered, difficulties the learner showed,
and anything requiring follow-up. Be factual, no fluff. Output plain text only, no JSON.`;

  const summary = await callClaude({
    purpose: 'tutor_chat',
    system,
    messages: [{ role: 'user', content: transcript.slice(-8000) }],
    maxTokens: 300,
    meta: { projectId: conversation.project },
  });

  conversation.summary = summary.trim();
  await conversation.save();
}

// Lets a learner (or the UI, based on AI signal) mark a note as significant,
// persisting it onto the Project's durable context (PRD 3.4).
const flagSignificantNote = asyncHandler(async (req, res) => {
  const { note, field } = req.body; // field: importantConcepts | previousDifficulties | significantNotes | areasRequiringAttention
  const project = await Project.findOne({ _id: req.params.projectId, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const allowedFields = ['importantConcepts', 'previousDifficulties', 'significantNotes', 'areasRequiringAttention'];
  const targetField = allowedFields.includes(field) ? field : 'significantNotes';
  if (!note) return res.status(400).json({ message: 'note is required.' });

  project.context[targetField].push(note);
  await project.save();

  res.json({ project });
});

module.exports = {
  createConversation,
  listConversations,
  getMessages,
  sendMessage,
  flagSignificantNote,
};
