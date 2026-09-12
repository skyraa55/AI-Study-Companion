const express = require('express');
const { listMasteryForProject } = require('../controllers/masteryController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/projects/:projectId/mastery', listMasteryForProject);

module.exports = router;
