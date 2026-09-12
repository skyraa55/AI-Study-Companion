const express = require('express');
const { register, login, me, updatePreferences } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, me);
router.patch('/me/preferences', protect, updatePreferences);

module.exports = router;
