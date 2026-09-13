const express = require('express');
const { listProjectActivity } = require('../controllers/activityController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/projects/:projectId/activity', listProjectActivity);

module.exports = router;