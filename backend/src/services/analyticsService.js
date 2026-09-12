const Mastery = require('../models/Mastery');
const QuizAttempt = require('../models/QuizAttempt');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Project = require('../models/Project');
const Space = require('../models/Space');
const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const { callClaude, parseJSONResponse } = require('./aiService');

async function computeProjectMetrics(projectId, userId) {
  const [attempts, masteries, conversations] = await Promise.all([
    QuizAttempt.find({ project: projectId, user: userId, status: 'evaluated' }),
    Mastery.find({ project: projectId, user: userId }),
    Conversation.find({ project: projectId, user: userId }).select('_id'),
  ]);

  const conversationIds = conversations.map((c) => c._id);
  const totalTutorMessages = conversationIds.length
    ? await Message.countDocuments({ conversation: { $in: conversationIds }, role: 'user' })
    : 0;

  const averageScore = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length)
    : 0;

  const conceptsMastered = masteries.filter((m) => m.masteryScore >= 80).length;
  const conceptsNeedingAttention = masteries.filter((m) => m.needsAttention).length;

  // Rough engagement-time estimate for prototype purposes (not real time-tracking)
  const totalTimeMinutesEstimate = totalTutorMessages * 1.5 + attempts.length * 5;

  return {
    quizzesTaken: attempts.length,
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
  const attempts = await QuizAttempt.find({ project: projectId, user: userId, status: 'evaluated' })
    .select('createdAt')
    .sort({ createdAt: -1 })
    .limit(60);

  if (attempts.length === 0) return 0;

  const days = new Set(attempts.map((a) => a.createdAt.toISOString().slice(0, 10)));
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
    return Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
  } catch (err) {
    // Fail soft with a rule-based fallback rather than blocking analytics
    if (metrics.quizzesTaken === 0) return ['Add materials and take your first adaptive quiz to establish a baseline.'];
    if (weakConcepts.length > 0) return [`Review ${weakConcepts[0]} with the AI Tutor, then retake a short quiz.`];
    return ['Keep up the momentum - try a fresh quiz to reinforce recent learning.'];
  }
}

/** Background job handler: 'analytics_aggregation' (project scope) */
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

  return { snapshotId: snapshot._id };
}

/** Background job handler: 'analytics_aggregation' (global scope) */
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

module.exports = {
  computeProjectMetrics,
  generateRecommendations,
  aggregateProjectAnalyticsJob,
  aggregateGlobalAnalyticsJob,
};
