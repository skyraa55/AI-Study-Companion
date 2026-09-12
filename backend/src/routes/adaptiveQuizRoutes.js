const express = require('express');
const { startAdaptiveQuiz, getSession, answerQuestion, listSessions } = require('../controllers/adaptiveQuizController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/projects/:projectId/adaptive-quiz/start', startAdaptiveQuiz);
router.get('/projects/:projectId/adaptive-quiz/sessions', listSessions);
router.get('/adaptive-quiz/:sessionId', getSession);
router.post('/adaptive-quiz/:sessionId/answer', answerQuestion);

module.exports = router;