const express = require('express');
const {
  getOverview,
  listUsers,
  getUserDetail,
  updateUserStatus,
  getAIUsageSummary,
  getAIRequestLogs,
  getSystemHealth,
  listBackgroundJobs,
  listActivityEvents,
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const router = express.Router();
router.use(protect, requireAdmin);

router.get('/overview', getOverview);
router.get('/users', listUsers);
router.get('/users/:id', getUserDetail);
router.patch('/users/:id', updateUserStatus);
router.get('/ai-usage', getAIUsageSummary);
router.get('/ai-logs', getAIRequestLogs);
router.get('/system-health', getSystemHealth);
router.get('/jobs', listBackgroundJobs);
router.get('/activity', listActivityEvents);

module.exports = router;
