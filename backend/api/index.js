// require('dotenv').config();

// const app = require('../src/app');
// const connectDB = require('../src/config/db');
// const { registerAllJobHandlers } = require('../src/services/registerJobs');
// const { registerEventListeners } = require('../src/services/eventListeners');

// let initialized = false;

// async function initialize() {
//   if (initialized) return;

//   await connectDB();

//   registerAllJobHandlers();
//   registerEventListeners();

//   initialized = true;
// }

// module.exports = async (req, res) => {
//   try {
//     await initialize();
//     return app(req, res);
//   } catch (error) {
//     console.error('[vercel] initialization error:', error);

//     return res.status(500).json({
//       success: false,
//       message: 'Server initialization failed'
//     });
//   }
// };






const app = require('../src/app');
const connectDB = require('../src/config/db');

let isDBConnected = false;

module.exports = async (req, res) => {
  try {
    console.log('🔥 VERCEL API FUNCTION WAS CALLED');

    if (!isDBConnected) {
      console.log('🔄 Connecting to MongoDB...');
      await connectDB();
      isDBConnected = true;
      console.log('✅ MongoDB connected in Vercel');
    }

    return app(req, res);
  } catch (error) {
    console.error('❌ Vercel API error:', error);

    return res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};