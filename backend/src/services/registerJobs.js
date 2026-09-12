const { registerHandler } = require('./jobQueue');
const { processMaterialJob } = require('./materialService');
const { generateQuizJob, evaluateQuizAttemptJob } = require('./quizService');
const { aggregateProjectAnalyticsJob, aggregateGlobalAnalyticsJob } = require('./analyticsService');

function registerAllJobHandlers() {
  registerHandler('material_processing', processMaterialJob);
  registerHandler('quiz_generation', generateQuizJob);
  registerHandler('quiz_evaluation', evaluateQuizAttemptJob);
  registerHandler('analytics_aggregation', async (job) => {
    return job.project ? aggregateProjectAnalyticsJob(job) : aggregateGlobalAnalyticsJob(job);
  });
  console.log('[jobQueue] Background job handlers registered.');
}

module.exports = { registerAllJobHandlers };
