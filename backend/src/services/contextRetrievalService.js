const Material = require('../models/Material');
const Mastery = require('../models/Mastery');
const Message = require('../models/Message');
const QuizAttempt = require('../models/QuizAttempt');
const QuizSession = require('../models/QuizSession');
const { rankRelevantChunks } = require('./contextService');

const SHORT_TERM_MESSAGE_LIMIT = 8;
const RECENT_ASSESSMENT_LIMIT = 3;

async function retrieveContext({ project, user, query, conversation = null }) {
  const relevantChunks = query ? await rankRelevantChunks(project._id, query) : [];
  const projectKnowledge = relevantChunks.map((c) => ({ source: c.materialTitle, page: c.page, excerpt: c.text }));

  const [readyMaterialCount, totalMaterialCount] = await Promise.all([
    Material.countDocuments({ project: project._id, processingStatus: 'ready' }),
    Material.countDocuments({ project: project._id }),
  ]);

  let conversationContext = null;
  if (conversation) {
    const recentMessages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: -1 })
      .limit(SHORT_TERM_MESSAGE_LIMIT);
    conversationContext = {
      recentTurns: recentMessages.reverse().map((m) => ({ role: m.role, content: m.content })),
      summary: conversation.summary || null,
    };
  }

  const learnerContext = {
    userLearningGoal: user.globalContext?.overallGoals?.length ? user.globalContext.overallGoals : null,
    learningPreferences: user.globalContext?.learningPreferences || null,
    project: {
      goal: project.goal,
      importantConcepts: project.context?.importantConcepts || [],
      previousDifficulties: project.context?.previousDifficulties || [],
      significantNotes: project.context?.significantNotes || [],
      areasRequiringAttention: project.context?.areasRequiringAttention || [],
    },
  };

  const [weakMastery, recentAttempts, recentSessions] = await Promise.all([
    Mastery.find({ project: project._id, needsAttention: true }).populate('concept', 'name').limit(10),
    QuizAttempt.find({ project: project._id, user: user._id, status: 'evaluated' })
      .sort({ createdAt: -1 })
      .limit(RECENT_ASSESSMENT_LIMIT)
      .select('score createdAt'),
    QuizSession.find({ project: project._id, user: user._id, status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(RECENT_ASSESSMENT_LIMIT)
      .select('score completedAt'),
  ]);

  const assessmentState = {
    conceptsNeedingAttention: weakMastery.map((m) => m.concept?.name).filter(Boolean),
    recentAssessmentHistory: [
      ...recentAttempts.map((a) => ({ score: a.score, date: a.createdAt })),
      ...recentSessions.map((s) => ({ score: s.score, date: s.completedAt })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)),
  };

  const learningHistory = {
    materialsStatus: { readyCount: readyMaterialCount, totalCount: totalMaterialCount },
    recentAssessmentCount: recentAttempts.length + recentSessions.length,
  };

  return {
    projectKnowledge,
    conversationContext,
    learningHistory,
    learnerContext,
    assessmentState,
    relevantChunks,
    evidenceStatus: relevantChunks.length > 0 ? 'grounded' : 'insufficient',
  };
}

module.exports = { retrieveContext };