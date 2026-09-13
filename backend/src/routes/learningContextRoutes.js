const express = require('express');
const { getLearningContext, removeContextNote } = require('../controllers/learningContextController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/projects/:projectId/learning-context', getLearningContext);
router.delete('/projects/:projectId/learning-context/:field', removeContextNote);

module.exports = router;