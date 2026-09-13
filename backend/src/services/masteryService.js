const Concept = require('../models/Concept');
const Mastery = require('../models/Mastery');
const Project = require('../models/Project');
const { enqueue } = require('./jobQueue');
const { emitEvent } = require('./eventBus');
const { EVENT_TYPES } = require('../constants/eventTypes');

const HISTORY_CAP = 10;
const REPEATED_MISTAKE_THRESHOLD = 3;

async function updateMasteryFromAttempt(attempt, quiz) {
  const byConceptName = new Map();
  for (const answer of attempt.answers) {
    if (!byConceptName.has(answer.concept)) byConceptName.set(answer.concept, []);
    byConceptName.get(answer.concept).push(answer);
  }

  for (const [conceptName, answers] of byConceptName.entries()) {
    const concept = await Concept.findOneAndUpdate(
      { project: attempt.project, name: conceptName },
      {},
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    let mastery = await Mastery.findOne({ project: attempt.project, concept: concept._id, user: attempt.user });
    if (!mastery) {
      mastery = new Mastery({ project: attempt.project, concept: concept._id, user: attempt.user });
    }

    const correct = answers.filter((a) => a.isCorrect).length;
    const previousScore = mastery.masteryScore;

    mastery.attemptsCount += answers.length;
    mastery.correctCount += correct;

    const attemptScore = (correct / answers.length) * 100;
    const nextScore = Math.round(previousScore * 0.6 + attemptScore * 0.4);

    mastery.previousMasteryScore = previousScore;
    mastery.masteryScore = Math.max(0, Math.min(100, nextScore));

    if (mastery.masteryScore > previousScore + 3) mastery.trend = 'improving';
    else if (mastery.masteryScore < previousScore - 3) mastery.trend = 'declining';
    else mastery.trend = mastery.attemptsCount <= answers.length ? 'new' : 'stable';

    mastery.needsAttention = mastery.masteryScore < 60;
    mastery.lastEvaluatedAt = new Date();
    pushHistory(mastery);

    const allWrong = correct === 0;
    if (allWrong) {
      mastery.consecutiveMisses += 1;
    } else {
      mastery.consecutiveMisses = 0;
      mastery.patternFlaggedAt = null;
    }

        await mastery.save();
    await maybeFlagRepeatedMistakePattern(attempt.project, attempt.user, mastery);

    emitEvent(EVENT_TYPES.MASTERY_UPDATED, {
      user: attempt.user,
      project: attempt.project,
      payload: { concept: conceptName, masteryScore: mastery.masteryScore, trend: mastery.trend },
      message: `Mastery updated for "${conceptName}"`,
    }).catch(() => {});
  }

  await recalculateProjectProgress(attempt.project);
}

async function updateMasteryForAnswer({ projectId, userId, conceptName, isCorrect }) {
  const concept = await Concept.findOneAndUpdate(
    { project: projectId, name: conceptName },
    {},
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  let mastery = await Mastery.findOne({ project: projectId, concept: concept._id, user: userId });
  if (!mastery) {
    mastery = new Mastery({ project: projectId, concept: concept._id, user: userId });
  }

  const previousScore = mastery.masteryScore;
  mastery.attemptsCount += 1;
  if (isCorrect) mastery.correctCount += 1;

  const attemptScore = isCorrect ? 100 : 0;
  const nextScore = Math.round(previousScore * 0.75 + attemptScore * 0.25);

  mastery.previousMasteryScore = previousScore;
  mastery.masteryScore = Math.max(0, Math.min(100, nextScore));

  if (mastery.masteryScore > previousScore + 3) mastery.trend = 'improving';
  else if (mastery.masteryScore < previousScore - 3) mastery.trend = 'declining';
  else mastery.trend = mastery.attemptsCount <= 1 ? 'new' : 'stable';

  mastery.needsAttention = mastery.masteryScore < 60;
  mastery.lastEvaluatedAt = new Date();
  pushHistory(mastery);

  if (isCorrect) {
    mastery.consecutiveMisses = 0;
    mastery.patternFlaggedAt = null;
  } else {
    mastery.consecutiveMisses += 1;
  }

   await mastery.save();
  await maybeFlagRepeatedMistakePattern(projectId, userId, mastery);

  emitEvent(EVENT_TYPES.MASTERY_UPDATED, {
    user: userId,
    project: projectId,
    payload: { concept: conceptName, masteryScore: mastery.masteryScore, trend: mastery.trend },
    message: `Mastery updated for "${conceptName}"`,
  }).catch(() => {});

  await recalculateProjectProgress(projectId);
  return mastery;
}

function pushHistory(mastery) {
  mastery.history.push({ score: mastery.masteryScore, date: new Date() });
  if (mastery.history.length > HISTORY_CAP) {
    mastery.history = mastery.history.slice(mastery.history.length - HISTORY_CAP);
  }
}

async function maybeFlagRepeatedMistakePattern(projectId, userId, mastery) {
  if (mastery.consecutiveMisses < REPEATED_MISTAKE_THRESHOLD) return;
  if (mastery.patternFlaggedAt) return;

  mastery.patternFlaggedAt = new Date();
  await mastery.save();

  const concept = await Concept.findById(mastery.concept).select('name');
  const conceptName = concept?.name || 'a concept';

  const project = await Project.findById(projectId);
  if (project) {
    const note = `Repeated difficulty with "${conceptName}" (${mastery.consecutiveMisses} recent misses in a row).`;
    if (!project.context.previousDifficulties.includes(note)) {
      project.context.previousDifficulties.push(note);
      await project.save();
    }
  }

  await enqueue({
    type: 'growth_analysis',
    user: userId,
    project: projectId,
    relatedId: null,
    input: { trigger: 'repeated_mistake_pattern' },
  });
}

async function recalculateProjectProgress(projectId) {
  const masteries = await Mastery.find({ project: projectId });
  const progress = masteries.length
    ? Math.round(masteries.reduce((sum, m) => sum + m.masteryScore, 0) / masteries.length)
    : 0;

  await Project.findByIdAndUpdate(projectId, { progress });
  return progress;
}

module.exports = { updateMasteryFromAttempt, updateMasteryForAnswer, recalculateProjectProgress };