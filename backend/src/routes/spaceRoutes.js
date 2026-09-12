const express = require('express');
const {
  createSpace,
  listSpaces,
  getSpace,
  getSpaceDashboard,
  updateSpace,
  deleteSpace,
} = require('../controllers/spaceController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/', createSpace);
router.get('/', listSpaces);
router.get('/:id', getSpace);
router.get('/:id/dashboard', getSpaceDashboard);
router.patch('/:id', updateSpace);
router.delete('/:id', deleteSpace);

module.exports = router;
