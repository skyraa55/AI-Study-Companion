const { EVENT_TYPES } = require('../constants/eventTypes');
const { on } = require('./eventBus');
const { enqueue } = require('./jobQueue');

function registerEventListeners() {
  on(EVENT_TYPES.QUIZ_COMPLETED, 'growth-analysis-on-quiz-completed', async (event) => {
    await enqueue({
      type: 'growth_analysis',
      user: event.user,
      project: event.project,
      relatedId: null,
      input: { trigger: 'quiz_completed' },
    });
  });

  on(EVENT_TYPES.MATERIAL_PROCESSING_COMPLETED, 'growth-refresh-on-material-processed', async (event) => {
    await enqueue({
      type: 'growth_analysis',
      user: event.user,
      project: event.project,
      relatedId: null,
      input: { trigger: 'material_processed' },
    });
  });

  console.log('[eventBus] Event listeners registered.');
}

module.exports = { registerEventListeners };