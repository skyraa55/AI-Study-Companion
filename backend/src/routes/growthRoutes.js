const express = require('express');
const { refreshGrowth, getLatestGrowth } = require('../controllers/growthController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/projects/:projectId/growth/refresh', refreshGrowth);
router.get('/projects/:projectId/growth', getLatestGrowth);

module.exports = router;