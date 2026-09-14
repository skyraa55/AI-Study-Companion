const mongoose = require('mongoose');

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = {
    conn: null,
    promise: null,
  };
}

async function connectDB() {
  if (cached.conn) {
    console.log('[DB] Using existing MongoDB connection');
    return cached.conn;
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not defined');
  }

  if (!cached.promise) {
    console.log('[DB] Creating MongoDB connection...');

    cached.promise = mongoose
      .connect(process.env.MONGO_URI)
      .then((mongooseInstance) => {
        console.log(
          `[DB] Connected to MongoDB: ${mongooseInstance.connection.host}/${mongooseInstance.connection.name}`
        );

        return mongooseInstance;
      })
      .catch((error) => {
        cached.promise = null;
        console.error('[DB] MongoDB connection failed:', error.message);
        throw error;
      });
  }

  cached.conn = await cached.promise;

  return cached.conn;
}

module.exports = connectDB;