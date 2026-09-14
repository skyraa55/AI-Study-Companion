require('dotenv').config();

const app = require('../src/app');
const connectDB = require('../src/config/db');
const { registerAllJobHandlers } = require('../src/services/registerJobs');
const { registerEventListeners } = require('../src/services/eventListeners');

let initialized = false;

async function initialize() {
  if (initialized) return;

  await connectDB();

  registerAllJobHandlers();
  registerEventListeners();

  initialized = true;
}

module.exports = async (req, res) => {
  try {
    await initialize();
    return app(req, res);
  } catch (error) {
    console.error('[vercel] initialization error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server initialization failed'
    });
  }
};