/**
 * PRD 37 Activity Tracking: the canonical list of meaningful event types.
 *
 * Deliberately a plain JS object, NOT a Mongoose schema enum - ActivityEvent.type
 * is stored as a validated string (see models/ActivityEvent.js), so introducing
 * a new event type is a one-line addition here plus a call to
 * eventBus.emitEvent() at the point it happens. No migration, no schema change,
 * no changes to existing event-processing code.
 */
const EVENT_TYPES = {
  SPACE_CREATED: 'SPACE_CREATED',
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_ACCESSED: 'PROJECT_ACCESSED',

  MATERIAL_UPLOADED: 'MATERIAL_UPLOADED',
  MATERIAL_PROCESSING_STARTED: 'MATERIAL_PROCESSING_STARTED',
  MATERIAL_PROCESSING_COMPLETED: 'MATERIAL_PROCESSING_COMPLETED',
  MATERIAL_PROCESSING_FAILED: 'MATERIAL_PROCESSING_FAILED',

  TUTOR_CONVERSATION_STARTED: 'TUTOR_CONVERSATION_STARTED',
  TUTOR_QUESTION_ASKED: 'TUTOR_QUESTION_ASKED',

  QUIZ_STARTED: 'QUIZ_STARTED',
  QUESTION_ANSWERED: 'QUESTION_ANSWERED',
  QUIZ_COMPLETED: 'QUIZ_COMPLETED',

  MASTERY_UPDATED: 'MASTERY_UPDATED',
  RECOMMENDATION_GENERATED: 'RECOMMENDATION_GENERATED',
};

const EVENT_LABELS = {
  SPACE_CREATED: 'Created Space "{name}"',
  PROJECT_CREATED: 'Created Project "{name}"',
  PROJECT_ACCESSED: 'Opened this Project',
  MATERIAL_UPLOADED: 'Added material "{title}"',
  MATERIAL_PROCESSING_STARTED: 'Started processing "{title}"',
  MATERIAL_PROCESSING_COMPLETED: 'Finished processing "{title}"',
  MATERIAL_PROCESSING_FAILED: 'Failed to process "{title}"',
  TUTOR_CONVERSATION_STARTED: 'Started a new Tutor session',
  TUTOR_QUESTION_ASKED: 'Asked the Tutor a question',
  QUIZ_STARTED: 'Started an adaptive quiz',
  QUESTION_ANSWERED: 'Answered a quiz question ({concept})',
  QUIZ_COMPLETED: 'Completed a quiz - scored {score}%',
  MASTERY_UPDATED: 'Mastery updated for "{concept}"',
  RECOMMENDATION_GENERATED: 'New recommendations generated',
};

const EVENT_TYPE_VALUES = Object.values(EVENT_TYPES);

function isKnownEventType(type) {
  return EVENT_TYPE_VALUES.includes(type);
}

module.exports = { EVENT_TYPES, EVENT_LABELS, EVENT_TYPE_VALUES, isKnownEventType };