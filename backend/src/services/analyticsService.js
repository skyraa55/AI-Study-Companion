const Mastery = require('../models/Mastery');
const QuizAttempt = require('../models/QuizAttempt');
const QuizSession = require('../models/QuizSession');
const Quiz = require('../models/Quiz');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Project = require('../models/Project');
const Space = require('../models/Space');
const Material = require('../models/Material');
const User = require('../models/User');
const AIRequestLog = require('../models/AIRequestLog');
const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const GrowthSnapshot = require('../models/GrowthSnapshot');
const { callClaude, parseJSONResponse } = require('./aiService');
const { emitEvent } = require('./eventBus');
const { EVENT_TYPES } = require('../constants/eventTypes');
const { validateStructured, RECOMMENDATIONS_SCHEMA } = require('./ai/structuredValidation');

async function computeProjectMetrics(projectId, userId) {
  const [attempts, adaptiveSessions, masteries, conversations] = await Promise.all([
    QuizAttempt.find({ project: projectId, user: userId, status: 'evaluated' }),
    QuizSession.find({ project: projectId, user: userId, status: 'completed' }),
    Mastery.find({ project: projectId, user: userId }),
    Conversation.find({ project: projectId, user: userId }).select('_id'),
  ]);

  const conversationIds = conversations.map((c) => c._id);
  const totalTutorMessages = conversationIds.length
    ? await Message.countDocuments({ conversation: { $in: conversationIds }, role: 'user' })
    : 0;

  const combinedQuizCount = attempts.length + adaptiveSessions.length;
  const combinedScores = [...attempts.map((a) => a.score), ...adaptiveSessions.map((s) => s.score)];
  const averageScore = combinedScores.length
    ? Math.round(combinedScores.reduce((s, v) => s + v, 0) / combinedScores.length)
    : 0;

  const conceptsMastered = masteries.filter((m) => m.masteryScore >= 80).length;
  const conceptsNeedingAttention = masteries.filter((m) => m.needsAttention).length;

  const totalTimeMinutesEstimate = totalTutorMessages * 1.5 + combinedQuizCount * 5;

  return {
    quizzesTaken: combinedQuizCount,
    averageScore,
    conceptsTracked: masteries.length,
    conceptsMastered,
    conceptsNeedingAttention,
    studyStreakDays: await computeStreakDays(projectId, userId),
    totalTutorMessages,
    totalTimeMinutesEstimate: Math.round(totalTimeMinutesEstimate),
  };
}

async function computeStreakDays(projectId, userId) {
  const [attempts, adaptiveSessions] = await Promise.all([
    QuizAttempt.find({ project: projectId, user: userId, status: 'evaluated' })
      .select('createdAt')
      .sort({ createdAt: -1 })
      .limit(60),
    QuizSession.find({ project: projectId, user: userId, status: 'completed' })
      .select('completedAt')
      .sort({ completedAt: -1 })
      .limit(60),
  ]);

  if (attempts.length === 0 && adaptiveSessions.length === 0) return 0;

  const days = new Set([
    ...attempts.map((a) => a.createdAt.toISOString().slice(0, 10)),
    ...adaptiveSessions.filter((s) => s.completedAt).map((s) => s.completedAt.toISOString().slice(0, 10)),
  ]);
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

async function generateRecommendations(project, metrics, weakConcepts) {
  const system = `You are a learning coach. Based ONLY on the provided metrics and weak
concepts, suggest the 2-4 most useful "next learning actions" for this learner in this
project. Be specific and actionable (e.g. "Review 'Binary Search' with the AI Tutor, then
retake a short quiz"). If metrics show no activity yet, recommend getting started rather
than inventing weaknesses. Respond with STRICT JSON only: {"recommendations": string[]}`;

  const payload = { project: { name: project.name, goal: project.goal }, metrics, weakConcepts };

  try {
    const raw = await callClaude({
      purpose: 'analytics_recommendation',
      system,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
      maxTokens: 500,
      meta: { userId: project.user, projectId: project._id },
    });
       const parsed = parseJSONResponse(raw);
    const { valid, errors } = validateStructured(parsed, RECOMMENDATIONS_SCHEMA);
    if (!valid) {
      throw new Error(`Recommendations response failed structural validation: ${errors.join('; ')}`);
    }
    return parsed.recommendations;
  } catch (err) {
    if (metrics.quizzesTaken === 0) return ['Add materials and take your first adaptive quiz to establish a baseline.'];
    if (weakConcepts.length > 0) return [`Review ${weakConcepts[0]} with the AI Tutor, then retake a short quiz.`];
    return ['Keep up the momentum - try a fresh quiz to reinforce recent learning.'];
  }
}

async function aggregateProjectAnalyticsJob(job) {
  const projectId = job.relatedId;
  const project = await Project.findById(projectId);
  if (!project) throw new Error('Project not found');

  const metrics = await computeProjectMetrics(projectId, project.user);
  const weakMasteries = await Mastery.find({ project: projectId, needsAttention: true })
    .populate('concept', 'name')
    .limit(5);
  const weakConcepts = weakMasteries.map((m) => m.concept?.name).filter(Boolean);

  const recommendations = await generateRecommendations(project, metrics, weakConcepts);

   const snapshot = await AnalyticsSnapshot.create({
    user: project.user,
    scope: 'project',
    project: project._id,
    metrics,
    recommendations,
  });

  emitEvent(EVENT_TYPES.RECOMMENDATION_GENERATED, {
    user: project.user,
    project: project._id,
    payload: { snapshotId: snapshot._id.toString(), source: 'analytics' },
    message: 'New analytics recommendations generated',
  }).catch(() => {});

  return { snapshotId: snapshot._id };
}

async function aggregateGlobalAnalyticsJob(job) {
  const userId = job.user;
  const projects = await Project.find({ user: userId, archived: false });

  const allMetrics = await Promise.all(projects.map((p) => computeProjectMetrics(p._id, userId)));

  const merged = allMetrics.reduce(
    (acc, m) => ({
      quizzesTaken: acc.quizzesTaken + m.quizzesTaken,
      averageScore: acc.averageScore + m.averageScore,
      conceptsTracked: acc.conceptsTracked + m.conceptsTracked,
      conceptsMastered: acc.conceptsMastered + m.conceptsMastered,
      conceptsNeedingAttention: acc.conceptsNeedingAttention + m.conceptsNeedingAttention,
      studyStreakDays: Math.max(acc.studyStreakDays, m.studyStreakDays),
      totalTutorMessages: acc.totalTutorMessages + m.totalTutorMessages,
      totalTimeMinutesEstimate: acc.totalTimeMinutesEstimate + m.totalTimeMinutesEstimate,
    }),
    {
      quizzesTaken: 0,
      averageScore: 0,
      conceptsTracked: 0,
      conceptsMastered: 0,
      conceptsNeedingAttention: 0,
      studyStreakDays: 0,
      totalTutorMessages: 0,
      totalTimeMinutesEstimate: 0,
    }
  );
  if (allMetrics.length > 0) merged.averageScore = Math.round(merged.averageScore / allMetrics.length);

  const snapshot = await AnalyticsSnapshot.create({
    user: userId,
    scope: 'global',
    project: null,
    metrics: merged,
    recommendations: [],
  });

  return { snapshotId: snapshot._id };
}

// ---------------------------------------------------------------------------
// PRD 34 Project Analytics: Activity / Performance / Growth / AI Activity.
// Pure aggregation - no AI calls - so this is a fast SYNCHRONOUS endpoint,
// unlike the AI-recommendation snapshot above which stays async (PRD 3.5:
// only genuinely long-running AI work needs the job queue).
// ---------------------------------------------------------------------------

async function computeActivityOverTime({ conversationIds, projectIds, userId, days = 14 }) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const projectFilter = Array.isArray(projectIds) ? { $in: projectIds } : projectIds;

  const [messages, attempts, sessions] = await Promise.all([
    conversationIds.length
      ? Message.find({ conversation: { $in: conversationIds }, role: 'user', createdAt: { $gte: since } }).select(
          'createdAt'
        )
      : [],
    QuizAttempt.find({ project: projectFilter, user: userId, status: 'evaluated', createdAt: { $gte: since } }).select(
      'createdAt'
    ),
    QuizSession.find({
      project: projectFilter,
      user: userId,
      status: 'completed',
      completedAt: { $gte: since },
    }).select('completedAt'),
  ]);

  const buckets = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, tutorMessages: 0, quizActivity: 0 });
  }
  for (const m of messages) {
    const key = m.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.get(key).tutorMessages += 1;
  }
  for (const a of attempts) {
    const key = a.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.get(key).quizActivity += 1;
  }
  for (const s of sessions) {
    const key = s.completedAt.toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.get(key).quizActivity += 1;
  }

  return Array.from(buckets.values());
}

function computeMasteryOverTime(masteries, days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const buckets = new Map();
  for (const m of masteries) {
    for (const h of m.history || []) {
      if (!h.date || new Date(h.date) < since) continue;
      const key = new Date(h.date).toISOString().slice(0, 10);
      if (!buckets.has(key)) buckets.set(key, { sum: 0, count: 0 });
      const b = buckets.get(key);
      b.sum += h.score;
      b.count += 1;
    }
  }
  return Array.from(buckets.entries())
    .map(([date, b]) => ({ date, averageMastery: Math.round(b.sum / b.count) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function computeDetailedProjectAnalytics(projectId, userId) {
  const [
    conversations,
    quizzesBatchCount,
    adaptiveSessionsAllCount,
    attemptsEvaluated,
    adaptiveSessionsCompleted,
    masteries,
    materialCount,
    analyticsSnapshotCount,
    growthSnapshotCount,
    aiEvalCount,
    project,
  ] = await Promise.all([
    Conversation.find({ project: projectId, user: userId }).select('_id'),
    Quiz.countDocuments({ project: projectId, user: userId }),
    QuizSession.countDocuments({ project: projectId, user: userId }),
    QuizAttempt.find({ project: projectId, user: userId, status: 'evaluated' }),
    QuizSession.find({ project: projectId, user: userId, status: 'completed' }),
    Mastery.find({ project: projectId, user: userId }),
    Material.countDocuments({ project: projectId, user: userId }),
    AnalyticsSnapshot.countDocuments({ project: projectId, user: userId, scope: 'project' }),
    GrowthSnapshot.countDocuments({ project: projectId, user: userId }),
    AIRequestLog.countDocuments({ project: projectId, user: userId, purpose: 'quiz_evaluation' }),
    Project.findById(projectId).select('progress'),
  ]);

  const conversationIds = conversations.map((c) => c._id);
  const [tutorQuestions, tutorInteractions] = await Promise.all([
    conversationIds.length ? Message.countDocuments({ conversation: { $in: conversationIds }, role: 'user' }) : 0,
    conversationIds.length ? Message.countDocuments({ conversation: { $in: conversationIds }, role: 'assistant' }) : 0,
  ]);

  const questionsAnswered =
    attemptsEvaluated.reduce((s, a) => s + a.answers.length, 0) +
    adaptiveSessionsCompleted.reduce((s, sess) => s + sess.questions.filter((q) => q.answeredAt).length, 0);

  const combinedQuizCount = attemptsEvaluated.length + adaptiveSessionsCompleted.length;
  const combinedScores = [...attemptsEvaluated.map((a) => a.score), ...adaptiveSessionsCompleted.map((s) => s.score)];
  const quizAccuracy = combinedScores.length
    ? Math.round(combinedScores.reduce((s, v) => s + v, 0) / combinedScores.length)
    : 0;

  const conceptsMastered = masteries.filter((m) => m.masteryScore >= 80).length;
  const conceptsNeedingAttention = masteries.filter((m) => m.needsAttention).length;

  const masteryTrends = {
    improving: masteries.filter((m) => m.trend === 'improving').length,
    stable: masteries.filter((m) => m.trend === 'stable').length,
    declining: masteries.filter((m) => m.trend === 'declining').length,
    new: masteries.filter((m) => m.trend === 'new').length,
  };

  const assessmentTrend = [
    ...attemptsEvaluated.map((a) => ({ date: a.createdAt, score: a.score })),
    ...adaptiveSessionsCompleted.map((s) => ({ date: s.completedAt || s.updatedAt, score: s.score })),
  ]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-20);

  const activityOverTime = await computeActivityOverTime({ conversationIds, projectIds: projectId, userId, days: 14 });

  return {
    activity: {
      learningSessions: conversationIds.length + combinedQuizCount,
      tutorQuestions,
      quizAttempts: combinedQuizCount,
      questionsAnswered,
      materialInteractions: materialCount,
    },
    performance: {
      quizAccuracy,
      currentMastery: project?.progress || 0,
      conceptsMastered,
      conceptsNeedingAttention,
    },
    growth: {
      masteryTrends,
      assessmentTrend,
      activityOverTime,
    },
    aiActivity: {
      tutorInteractions,
      aiGeneratedAssessments: quizzesBatchCount + adaptiveSessionsAllCount,
      aiEvaluations: aiEvalCount,
      recommendationsGenerated: analyticsSnapshotCount + growthSnapshotCount,
    },
  };
}

async function computeGlobalActiveDays(conversationIds, projectIds, userId) {
  const [messages, attempts, sessions] = await Promise.all([
    conversationIds.length
      ? Message.find({ conversation: { $in: conversationIds }, role: 'user' })
          .select('createdAt')
          .sort({ createdAt: -1 })
          .limit(300)
      : [],
    QuizAttempt.find({ project: { $in: projectIds }, user: userId, status: 'evaluated' })
      .select('createdAt')
      .sort({ createdAt: -1 })
      .limit(300),
    QuizSession.find({ project: { $in: projectIds }, user: userId, status: 'completed' })
      .select('completedAt')
      .sort({ completedAt: -1 })
      .limit(300),
  ]);

  const days = new Set([
    ...messages.map((m) => m.createdAt.toISOString().slice(0, 10)),
    ...attempts.map((a) => a.createdAt.toISOString().slice(0, 10)),
    ...sessions.filter((s) => s.completedAt).map((s) => s.completedAt.toISOString().slice(0, 10)),
  ]);
  return days.size;
}

async function computeGlobalDashboard(userId) {
  const [spaceCount, projects] = await Promise.all([
    Space.countDocuments({ user: userId, archived: false }),
    Project.find({ user: userId, archived: false }).select('_id progress'),
  ]);
  const projectIds = projects.map((p) => p._id);

  const [
    conversations,
    attempts,
    sessionsCompleted,
    sessionsAllCount,
    quizzesBatchCount,
    masteries,
    materialCount,
    aiEvalCount,
    analyticsSnapshotCount,
    growthSnapshotCount,
  ] = await Promise.all([
    Conversation.find({ project: { $in: projectIds }, user: userId }).select('_id'),
    QuizAttempt.find({ project: { $in: projectIds }, user: userId, status: 'evaluated' }),
    QuizSession.find({ project: { $in: projectIds }, user: userId, status: 'completed' }),
    QuizSession.countDocuments({ project: { $in: projectIds }, user: userId }),
    Quiz.countDocuments({ project: { $in: projectIds }, user: userId }),
    Mastery.find({ project: { $in: projectIds }, user: userId }),
    Material.countDocuments({ project: { $in: projectIds }, user: userId }),
    AIRequestLog.countDocuments({ user: userId, purpose: 'quiz_evaluation' }),
    AnalyticsSnapshot.countDocuments({ user: userId, scope: 'project' }),
    GrowthSnapshot.countDocuments({ user: userId }),
  ]);

  const conversationIds = conversations.map((c) => c._id);
  const [tutorInteractions, questionsAsked] = await Promise.all([
    conversationIds.length ? Message.countDocuments({ conversation: { $in: conversationIds }, role: 'assistant' }) : 0,
    conversationIds.length ? Message.countDocuments({ conversation: { $in: conversationIds }, role: 'user' }) : 0,
  ]);

  const combinedQuizCount = attempts.length + sessionsCompleted.length;
  const combinedScores = [...attempts.map((a) => a.score), ...sessionsCompleted.map((s) => s.score)];
  const averageAssessmentPerformance = combinedScores.length
    ? Math.round(combinedScores.reduce((s, v) => s + v, 0) / combinedScores.length)
    : 0;

  const overallMastery = projects.length
    ? Math.round(projects.reduce((s, p) => s + (p.progress || 0), 0) / projects.length)
    : 0;

  const conceptsImproving = masteries.filter((m) => m.trend === 'improving').length;
  const conceptsNeedingAttention = masteries.filter((m) => m.needsAttention).length;

  const totalLearningActivity = questionsAsked + combinedQuizCount + materialCount;
  const activeDays = await computeGlobalActiveDays(conversationIds, projectIds, userId);

  const learningActivityOverTime = await computeActivityOverTime({
    conversationIds,
    projectIds,
    userId,
    days: 14,
  });
  const masteryOverTime = computeMasteryOverTime(masteries, 14);
  const assessmentPerformanceTrend = [
    ...attempts.map((a) => ({ date: a.createdAt, score: a.score })),
    ...sessionsCompleted.map((s) => ({ date: s.completedAt || s.updatedAt, score: s.score })),
  ]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-20);

  return {
    overallLearning: {
      totalLearningActivity,
      activeDays,
      spaceCount,
      projectCount: projects.length,
    },
    learningPerformance: {
      overallMastery,
      averageAssessmentPerformance,
      conceptsImproving,
      conceptsNeedingAttention,
    },
    aiUsage: {
      tutorInteractions,
      questionsAsked,
      quizActivity: sessionsAllCount + quizzesBatchCount,
      aiGeneratedFeedback: aiEvalCount + analyticsSnapshotCount + growthSnapshotCount,
    },
    trends: {
      learningActivityOverTime,
      masteryOverTime,
      assessmentPerformanceTrend,
    },
  };
}

module.exports = {
  computeProjectMetrics,
  generateRecommendations,
  aggregateProjectAnalyticsJob,
  aggregateGlobalAnalyticsJob,
  computeDetailedProjectAnalytics,
  computeGlobalDashboard,
};