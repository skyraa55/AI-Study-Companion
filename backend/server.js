require('dotenv').config();

const app = require('./src/app');
const connectDB = require('./src/config/db');
const { registerAllJobHandlers } = require('./src/services/registerJobs');
const { registerEventListeners } = require('./src/services/eventListeners');

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  registerAllJobHandlers();
  registerEventListeners();

  app.listen(PORT, () => {
    console.log(`[server] AI Study Companion API listening on port ${PORT}`);
  });
})();

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});
