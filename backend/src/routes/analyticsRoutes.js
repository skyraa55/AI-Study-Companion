const express = require('express');
const {
  refreshProjectAnalytics,
  getLatestProjectAnalytics,
  refreshGlobalAnalytics,
  getLatestGlobalAnalytics,
} = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/projects/:projectId/analytics/refresh', refreshProjectAnalytics);
router.get('/projects/:projectId/analytics', getLatestProjectAnalytics);

router.post('/analytics/global/refresh', refreshGlobalAnalytics);
router.get('/analytics/global', getLatestGlobalAnalytics);

module.exports = router;
