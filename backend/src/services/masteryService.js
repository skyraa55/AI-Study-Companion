const Concept = require('../models/Concept');
const Mastery = require('../models/Mastery');
const Project = require('../models/Project');

/**
 * Updates per-concept Mastery documents from a graded QuizAttempt, then
 * rolls up the Project's overall progress. This is the "Evaluate Understanding
 * -> Update Concept Mastery -> Track Growth" segment of the core loop.
 */
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

    // Weighted-recency update: blend historical score with this attempt's
    // performance so recent evidence moves the needle without wiping history.
    const attemptScore = (correct / answers.length) * 100;
    const nextScore = Math.round(previousScore * 0.6 + attemptScore * 0.4);
    mastery.masteryScore = Math.max(0, Math.min(100, nextScore));

    if (mastery.masteryScore > previousScore + 3) mastery.trend = 'improving';
    else if (mastery.masteryScore < previousScore - 3) mastery.trend = 'declining';
    else mastery.trend = mastery.attemptsCount <= answers.length ? 'new' : 'stable';

    mastery.needsAttention = mastery.masteryScore < 60;
    mastery.lastEvaluatedAt = new Date();

    await mastery.save();
  }

  await recalculateProjectProgress(attempt.project);
}

async function recalculateProjectProgress(projectId) {
  const masteries = await Mastery.find({ project: projectId });
  const progress = masteries.length
    ? Math.round(masteries.reduce((sum, m) => sum + m.masteryScore, 0) / masteries.length)
    : 0;

  await Project.findByIdAndUpdate(projectId, { progress });
  return progress;
}



/**
 * Updates a single concept's Mastery immediately after ONE answered question
 * (PRD 26 Adaptive Quiz Flow: "Evaluate Answer -> Update Mastery -> Select
 * Next Question"). Uses a smaller blend step than the batch update below
 * since it fires much more frequently (once per question rather than once
 * per whole quiz), so any single answer doesn't swing the score too hard.
 */
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
  mastery.masteryScore = Math.max(0, Math.min(100, nextScore));

  if (mastery.masteryScore > previousScore + 3) mastery.trend = 'improving';
  else if (mastery.masteryScore < previousScore - 3) mastery.trend = 'declining';
  else mastery.trend = mastery.attemptsCount <= 1 ? 'new' : 'stable';

  mastery.needsAttention = mastery.masteryScore < 60;
  mastery.lastEvaluatedAt = new Date();
  await mastery.save();

  await recalculateProjectProgress(projectId);
  return mastery;
}

module.exports = { updateMasteryFromAttempt, updateMasteryForAnswer, recalculateProjectProgress };
