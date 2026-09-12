const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Project = require('../models/Project');
const asyncHandler = require('../utils/asyncHandler');
const { callClaude, callClaudeWithTools } = require('../services/aiService');
const { assembleTutorContext } = require('../services/contextService');
const { TOOLS, executeCapability } = require('../services/aiCapabilities');

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

  let evidenceInstruction;
  if (evidenceStatus === 'grounded') {
    evidenceInstruction =
      'Relevant Evidence: YES. Relevant excerpts were found in this Project\'s materials (see "Project Knowledge" below). ' +
      'Ground your answer in them and cite the source + page for anything you use from them (Show Source).';
  } else if (longTermContext.materialsStatus.readyCount === 0) {
    evidenceInstruction =
      'Relevant Evidence: NO - this Project has no processed materials yet. Say so plainly (e.g. "This project doesn\'t have any materials yet") ' +
      'and suggest the learner add some via the Materials tab, rather than answering as if evidence exists.';
  } else {
    evidenceInstruction =
      'Relevant Evidence: NO. This Project has materials, but none of them appear to cover this specific question. ' +
      'Clearly and explicitly state that the available materials don\'t support a confident answer to this question - ' +
      'do not invent specifics as if they came from the materials. You may briefly offer general understanding if you ' +
      'have it, but it must be clearly labeled as general knowledge, not something found in the materials, and you should ' +
      'suggest what kind of material would help or a related question the materials DO cover.';
  }

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

Show Source (PRD 19): when you rely on a specific excerpt from Project Knowledge,
cite it in this exact format on its own line: "Source: <document title> - Page <n>"
(omit "- Page <n>" if the material has no page, e.g. pasted notes).

Conversational Learning (PRD 21): support natural back-and-forth, not just isolated
Q&A. Recognize and handle requests like: follow-up questions, "explain it simpler",
"give me an example", "can you clarify that", exploring a related concept,
continuing from your previous answer, "test my understanding" / "quiz me" (use the
generate_quiz tool for this), "give me a practical example", and "make me a revision
plan" (use get_weak_concepts + get_assessment_history to ground the plan in reality).

Application Capabilities (PRD 22): you have tools to look up real learner progress,
weak concepts, assessment history, analytics, search materials by a different phrase,
generate a real quiz, and record durable learning notes. Prefer calling a tool over
guessing when the learner asks something a tool can answer authoritatively (e.g.
"how am I doing?" -> get_learner_progress; "test me" -> generate_quiz).

Be encouraging, Socratic where useful, and concise. If the learner seems to be
struggling with a concept, consider recording it via record_learning_event.`;

  const boundExecuteTool = (name, input) => executeCapability(name, input, { project, user: req.user, conversation });

  let assistantText;
  let toolCalls = [];
  try {
    const result = await callClaudeWithTools({
      purpose: 'tutor_chat',
      system,
      messages: shortTermHistory,
      tools: TOOLS,
      executeTool: boundExecuteTool,
      maxTokens: 1000,
      meta: {
        userId: req.user._id,
        projectId: project._id,
        retrievalUsed: relevantChunks.length > 0,
        retrievalChunkCount: relevantChunks.length,
      },
    });
    assistantText = result.text || "I wasn't able to generate a response - please try rephrasing your question.";
    toolCalls = result.toolCalls;
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
    actions: toolCalls,
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