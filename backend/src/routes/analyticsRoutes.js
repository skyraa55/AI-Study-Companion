const express = require('express');
const {
  refreshProjectAnalytics,
  getLatestProjectAnalytics,
  getProjectAnalyticsDetail,
  refreshGlobalAnalytics,
  getLatestGlobalAnalytics,
  getGlobalAnalyticsDetail,
} = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/projects/:projectId/analytics/refresh', refreshProjectAnalytics);
router.get('/projects/:projectId/analytics', getLatestProjectAnalytics);
router.get('/projects/:projectId/analytics/detail', getProjectAnalyticsDetail);

router.post('/analytics/global/refresh', refreshGlobalAnalytics);
router.get('/analytics/global', getLatestGlobalAnalytics);
router.get('/analytics/global/detail', getGlobalAnalyticsDetail);

module.exports = router;