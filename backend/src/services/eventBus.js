const EventEmitter = require('events');
const ActivityEvent = require('../models/ActivityEvent');
const { isKnownEventType } = require('../constants/eventTypes');

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

function on(type, listenerName, handler) {
  emitter.on(type, async (event) => {
    try {
      await handler(event);
    } catch (err) {
      console.error(`[eventBus] Listener "${listenerName}" failed for ${type} (event ${event._id}):`, err.message);
      ActivityEvent.findByIdAndUpdate(event._id, {
        $push: { processingErrors: { listener: listenerName, error: err.message } },
      }).catch(() => {});
    }
  });
}

async function emitEvent(type, { user = null, project = null, space = null, payload = {}, message = '', dedupeKey = null } = {}) {
  if (!isKnownEventType(type)) {
    console.warn(`[eventBus] Emitting unrecognized event type "${type}" - consider adding it to constants/eventTypes.js`);
  }

  try {
    if (dedupeKey) {
      const since = new Date(Date.now() - 10 * 1000);
      const existing = await ActivityEvent.findOne({ type, dedupeKey, createdAt: { $gte: since } });
      if (existing) return existing;
    }

    const event = await ActivityEvent.create({ type, user, project, space, payload, message, dedupeKey });
    emitter.emit(type, event);
    return event;
  } catch (err) {
    console.error(`[eventBus] Failed to record event ${type}:`, err.message);
    return null;
  }
}

module.exports = { emitEvent, on };