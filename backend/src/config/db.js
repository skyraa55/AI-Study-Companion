const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb+srv://username:gowthi_515@cluster0.cas0l.mongodb.net/ai-study-companion?retryWrites=true&w=majority';
  try {
    await mongoose.connect(uri);
    console.log(`[DB] Connected to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    console.error('[DB] Connection error:', err.message);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected');
  });
}

module.exports = connectDB;
