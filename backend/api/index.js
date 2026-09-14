const app = require('../src/app');
const connectDB = require('../src/config/db');

module.exports = async (req, res) => {
  try {
    console.log('🔥 VERCEL API FUNCTION WAS CALLED');

    await connectDB();

    console.log('✅ MongoDB ready');

    return app(req, res);
  } catch (error) {
    console.error('❌ Vercel API error:', error);

    return res.status(500).json({
      message: 'Server error',
      error: error.message,
    });
  }
};