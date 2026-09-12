const express = require('express');
const {
  generateQuiz,
  listQuizzes,
  getQuiz,
  getQuizForTaking,
  submitAttempt,
  getAttempt,
  listAttempts,
} = require('../controllers/quizController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/projects/:projectId/quizzes', generateQuiz);
router.get('/projects/:projectId/quizzes', listQuizzes);
router.get('/projects/:projectId/quiz-attempts', listAttempts);

router.get('/quizzes/:id', getQuiz);
router.get('/quizzes/:id/take', getQuizForTaking);
router.post('/quizzes/:id/attempts', submitAttempt);

router.get('/quiz-attempts/:attemptId', getAttempt);

module.exports = router;
