const Mastery = require('../models/Mastery');
const Project = require('../models/Project');
const QuizSession = require('../models/QuizSession');
const QuizAttempt = require('../models/QuizAttempt');
const Material = require('../models/Material');
const GrowthSnapshot = require('../models/GrowthSnapshot');
const { callClaude, parseJSONResponse } = require('./aiService');
const { emitEvent } = require('./eventBus');
const { EVENT_TYPES } = require('../constants/eventTypes');
const { validateStructured, RECOMMENDATIONS_SCHEMA } = require('./ai/structuredValidation');

async function computeGrowthBreakdown(projectId, userId) {
  const masteries = await Mastery.find({ project: projectId, user: userId }).populate('concept', 'name');

  const concepts = masteries
    .filter((m) => m.concept)
    .map((m) => ({
      name: m.concept.name,
      previousScore: m.previousMasteryScore,
      currentScore: m.masteryScore,
      trend: m.trend,
      isStrong: m.masteryScore >= 80,
      isWeak: m.masteryScore < 60,
      needsAttention: m.needsAttention || m.trend === 'declining',
    }));

  return {
    concepts,
    strongAreas: concepts.filter((c) => c.isStrong),
    weakAreas: concepts.filter((c) => c.isWeak),
    improvingAreas: concepts.filter((c) => c.trend === 'improving'),
    stableAreas: concepts.filter((c) => c.trend === 'stable'),
    needsAttentionAreas: concepts.filter((c) => c.needsAttention),
  };
}

async function generateGrowthRecommendation(project, user, breakdown) {
  const [readyMaterialCount, recentAttempts, recentSessions] = await Promise.all([
    Material.countDocuments({ project: project._id, processingStatus: 'ready' }),
    QuizAttempt.find({ project: project._id, user: user._id, status: 'evaluated' })
      .sort({ createdAt: -1 })
      .limit(3)
      .select('score'),
    QuizSession.find({ project: project._id, user: user._id, status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(3)
      .select('score questions'),
  ]);

  const recentMistakeConcepts = new Set();
  for (const s of recentSessions) {
    for (const q of s.questions || []) {
      if (q.isCorrect === false) recentMistakeConcepts.add(q.concept);
    }
  }

  const payload = {
    projectGoal: project.goal,
    userLearningGoals: user.globalContext?.overallGoals || [],
    weakConcepts: breakdown.weakAreas.map((c) => c.name),
    needsAttentionConcepts: breakdown.needsAttentionAreas.map((c) => ({
      name: c.name,
      previousScore: c.previousScore,
      currentScore: c.currentScore,
      trend: c.trend,
    })),
    recentMistakeConcepts: Array.from(recentMistakeConcepts),
    recentAssessmentScores: [...recentAttempts.map((a) => a.score), ...recentSessions.map((s) => s.score)],
    materialsAvailable: readyMaterialCount,
    previousRecommendations: project.growthState?.lastRecommendations || [],
  };

  const system = `You are a learning coach producing Growth Analysis recommendations.
Answer the single question "what should the learner do next?" with 1-3 SHORT, SPECIFIC,
actionable recommendations, each referencing a concept by name where relevant. Style example:
"Your understanding of Concept C has improved, but application-based questions remain
difficult. Consider reviewing the related material and completing another short assessment."

Do NOT repeat any of the previousRecommendations verbatim - vary the phrasing or focus if the
underlying situation is similar. If materialsAvailable is 0, recommend adding material instead
of reviewing it. If there is no quiz activity yet, recommend taking a first assessment rather
than inventing weaknesses. Respond with STRICT JSON only: {"recommendations": string[]}`;

  try {
    const raw = await callClaude({
      purpose: 'analytics_recommendation',
      system,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
      maxTokens: 500,
      meta: { userId: user._id, projectId: project._id },
    });
    const parsed = parseJSONResponse(raw);
    const { valid } = validateStructured(parsed, RECOMMENDATIONS_SCHEMA);
    if (valid && parsed.recommendations.length > 0) {
      return parsed.recommendations.slice(0, 3);
    }
  } catch (err) {
    console.error('[growthService] AI recommendation failed, using fallback:', err.message);
  }

  if (readyMaterialCount === 0) return ['Add some learning material to this Project to get started.'];
  if (payload.recentAssessmentScores.length === 0) {
    return ['Take your first adaptive quiz to establish a growth baseline for this Project.'];
  }
  if (breakdown.needsAttentionAreas.length > 0) {
    const c = breakdown.needsAttentionAreas[0];
    return [`Review "${c.name}" with the AI Tutor, then take a short quiz to reinforce it.`];
  }
  return ['Keep up the momentum - try a fresh quiz or explore a related concept with the Tutor.'];
}

async function growthAnalysisJob(job) {
  const projectId = job.project;
  const project = await Project.findById(projectId).populate('user');
  if (!project) throw new Error('Project not found');

  const User = require('../models/User');
  const user = await User.findById(job.user || project.user);
  if (!user) throw new Error('User not found');

  const breakdown = await computeGrowthBreakdown(projectId, user._id);
  const recommendations = await generateGrowthRecommendation(project, user, breakdown);

  const snapshot = await GrowthSnapshot.create({
    user: user._id,
    project: projectId,
    concepts: breakdown.concepts,
    recommendations,
    trigger: job.input?.trigger || 'manual_refresh',
  });

    project.growthState = {
    lastRecommendations: recommendations,
    lastGeneratedAt: new Date(),
  };
  await project.save();

  emitEvent(EVENT_TYPES.RECOMMENDATION_GENERATED, {
    user: user._id,
    project: projectId,
    payload: { snapshotId: snapshot._id.toString(), source: 'growth', trigger: snapshot.trigger },
    message: 'New growth recommendations generated',
  }).catch(() => {});

  return { snapshotId: snapshot._id };
}

module.exports = { computeGrowthBreakdown, generateGrowthRecommendation, growthAnalysisJob };