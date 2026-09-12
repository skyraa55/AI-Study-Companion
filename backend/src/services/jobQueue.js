const BackgroundJob = require('../models/BackgroundJob');

/**
 * PRD 3.5 Asynchronous by Design: long-running operations (document processing,
 * knowledge extraction, quiz generation/evaluation, analytics aggregation,
 * recommendations) should not block the request/response cycle.
 *
 * This is an in-process job runner intended for a prototype: enqueue() returns
 * immediately with a queued BackgroundJob, and the handler runs on the next
 * tick. Every job is recorded (PRD 3.6 Observable AI -> "Background workflows")
 * so the API/Admin Dashboard can show status, duration, and failures.
 *
 * In production this would be swapped for a durable queue (BullMQ + Redis,
 * SQS, etc.) - the BackgroundJob schema and handler signature are designed to
 * make that swap straightforward without touching calling code.
 */

const handlers = {}; // type -> async (job) => result

function registerHandler(type, handler) {
  handlers[type] = handler;
}

async function enqueue({ type, user, project, relatedId, input }) {
  const job = await BackgroundJob.create({
    type,
    user: user || null,
    project: project || null,
    relatedId: relatedId || null,
    input: input || {},
    status: 'queued',
  });

  // Run asynchronously - do not await in the caller's request cycle
  setImmediate(() => runJob(job._id));

  return job;
}

async function runJob(jobId) {
  const job = await BackgroundJob.findById(jobId);
  if (!job) return;

  const handler = handlers[job.type];
  if (!handler) {
    job.status = 'failed';
    job.error = `No handler registered for job type: ${job.type}`;
    job.finishedAt = new Date();
    await job.save();
    return;
  }

  job.status = 'running';
  job.startedAt = new Date();
  await job.save();

  const start = Date.now();
  try {
    const result = await handler(job);
    job.status = 'completed';
    job.result = result || null;
  } catch (err) {
    console.error(`[jobQueue] Job ${job._id} (${job.type}) failed:`, err.message);
    job.status = 'failed';
    job.error = err.message;
  } finally {
    job.finishedAt = new Date();
    job.durationMs = Date.now() - start;
    await job.save();
  }
}

module.exports = { registerHandler, enqueue };
