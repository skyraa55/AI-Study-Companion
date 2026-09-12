const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Project = require('../models/Project');
const asyncHandler = require('../utils/asyncHandler');
const { callClaude } = require('../services/aiService');
const { assembleTutorContext } = require('../services/contextService');

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

  const messages = await Message.find({ conversation: conversation._id })
    .sort({ createdAt: 1 })
    .populate('retrievalRefs.materialId', 'title');

  res.json({ conversation, messages });
});

const sendMessage = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, user: req.user._id });
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });

  const project = await Project.findOne({ _id: conversation.project, user: req.user._id });
  if (!project) return res.status(404).json({ message: 'Project not found.' });

  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ message: 'Message content is required.' });

  const userMessage = await Message.create({ conversation: conversation._id, role: 'user', content });

  const { shortTermHistory, longTermContext, projectKnowledge, evidenceStatus, relevantChunks } =
    await assembleTutorContext({ project, user: req.user, conversation, query: content });

  const evidenceInstruction =
    evidenceStatus === 'grounded'
      ? 'Relevant excerpts were found in this Project\'s materials (see "Project Knowledge" below) - ground your answer in them and cite the source + page for anything you use from them.'
      : 'No relevant excerpts were found in this Project\'s materials for this question. Say so explicitly rather than inventing specifics as if they came from the materials. You may still answer carefully from general understanding if appropriate, clearly flagged as general knowledge, and suggest what kind of material would help.';

  const system = `You are an AI Tutor inside the "${project.name}" project.
Priority order for answering: (1) Project Knowledge below, (2) Long-Term Relevant
Context, (3) Short-Term Context (this conversation), (4) general knowledge only as a
last resort and clearly flagged as such. Context here is strictly scoped to this
Project - never use information from any other project (Context First).

${evidenceInstruction}

--- Long-Term Relevant Context (durable, curated - not the full raw history) ---
${JSON.stringify(longTermContext, null, 2)}

--- Project Knowledge (evidence retrieved from this Project's materials for the
current question) ---
${JSON.stringify(projectKnowledge, null, 2)}

Show Source: when you rely on a specific excerpt from Project Knowledge, cite its
source title and page number in parentheses, e.g. "(See 'Chapter 2 Notes', p.3)",
so the learner can locate the evidence themselves.

Be encouraging, Socratic where useful, and concise. If the learner seems to be
struggling with a concept, note it plainly so it can be tracked.`;

  let assistantText;
  try {
    assistantText = await callClaude({
      purpose: 'tutor_chat',
      system,
      messages: shortTermHistory,
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
    groundedness: evidenceStatus,
  });
  await assistantMessage.populate('retrievalRefs.materialId', 'title');

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

const flagSignificantNote = asyncHandler(async (req, res) => {
  const { note, field } = req.body;
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