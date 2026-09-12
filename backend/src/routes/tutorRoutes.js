const express = require('express');
const {
  createConversation,
  listConversations,
  getMessages,
  sendMessage,
  flagSignificantNote,
} = require('../controllers/tutorController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/projects/:projectId/tutor/conversations', createConversation);
router.get('/projects/:projectId/tutor/conversations', listConversations);
router.post('/projects/:projectId/tutor/context-notes', flagSignificantNote);

router.get('/tutor/conversations/:id/messages', getMessages);
router.post('/tutor/conversations/:id/messages', sendMessage);

module.exports = router;
