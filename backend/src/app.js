const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const spaceRoutes = require('./routes/spaceRoutes');
const projectRoutes = require('./routes/projectRoutes');
const materialRoutes = require('./routes/materialRoutes');
const tutorRoutes = require('./routes/tutorRoutes');
const quizRoutes = require('./routes/quizRoutes');
const adaptiveQuizRoutes = require('./routes/adaptiveQuizRoutes');
const masteryRoutes = require('./routes/masteryRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Basic abuse protection, esp. around AI-calling endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ai-study-companion-backend', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/spaces', spaceRoutes);
app.use('/api', projectRoutes); // nested + direct project routes
app.use('/api', materialRoutes);
app.use('/api', tutorRoutes);
app.use('/api', quizRoutes);
app.use('/api', adaptiveQuizRoutes);
app.use('/api', masteryRoutes);
app.use('/api', analyticsRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
