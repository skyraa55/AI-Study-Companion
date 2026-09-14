const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('[DB] MONGO_URI is not defined');
  }

  try {
    await mongoose.connect(uri);

    console.log(
      `[DB] Connected to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`
    );
  } catch (err) {
    console.error('[DB] Connection error:', err.message);
    throw err;
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected');
  });
}

module.exports = connectDB;