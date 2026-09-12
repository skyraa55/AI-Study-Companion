const BackgroundJob = require('../models/BackgroundJob');

const handlers = {};

function registerHandler(type, handler) {
  handlers[type] = handler;
}

async function enqueue({ type, user, project, relatedId, input, maxRetries = 2 }) {
  if (relatedId) {
    const existing = await BackgroundJob.findOne({
      type,
      relatedId,
      status: { $in: ['queued', 'running'] },
    });
    if (existing) return existing;
  }

  const job = await BackgroundJob.create({
    type,
    user: user || null,
    project: project || null,
    relatedId: relatedId || null,
    input: input || {},
    status: 'queued',
    maxRetries,
  });

  setImmediate(() => runJob(job._id));
  return job;
}

async function updateProgress(jobId, { stage, progress } = {}) {
  const update = {};
  if (stage !== undefined) update.stage = stage;
  if (progress !== undefined) update.progress = progress;
  if (Object.keys(update).length === 0) return;

  await BackgroundJob.findByIdAndUpdate(jobId, update).catch((err) =>
    console.error('[jobQueue] updateProgress failed:', err.message)
  );
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
  job.startedAt = job.startedAt || new Date();
  job.error = null;
  await job.save();

  const start = Date.now();
  try {
    const result = await handler(job);
    job.status = 'completed';
    job.result = result || null;
    job.progress = 100;
    job.finishedAt = new Date();
    job.durationMs = Date.now() - start;
    await job.save();
  } catch (err) {
    console.error(
      `[jobQueue] Job ${job._id} (${job.type}) failed (attempt ${job.retryCount + 1}/${job.maxRetries + 1}):`,
      err.message
    );

    if (job.retryCount < job.maxRetries) {
      job.retryCount += 1;
      job.status = 'queued';
      job.error = err.message;
      await job.save();

      const delayMs = Math.min(2 ** job.retryCount * 1000, 15000);
      setTimeout(() => runJob(job._id), delayMs);
      return;
    }

    job.status = 'failed';
    job.error = err.message;
    job.finishedAt = new Date();
    job.durationMs = Date.now() - start;
    await job.save();
  }
}

module.exports = { registerHandler, enqueue, updateProgress };