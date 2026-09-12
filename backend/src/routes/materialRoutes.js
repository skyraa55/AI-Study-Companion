const express = require('express');
const {
  addTextMaterial,
  uploadFileMaterial,
  listMaterials,
  getMaterial,
  deleteMaterial,
  reprocessMaterial,
} = require('../controllers/materialController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();
router.use(protect);

router.post('/projects/:projectId/materials/text', addTextMaterial);
router.post('/projects/:projectId/materials/upload', upload.single('file'), uploadFileMaterial);
router.get('/projects/:projectId/materials', listMaterials);
router.get('/materials/:id', getMaterial);
router.delete('/materials/:id', deleteMaterial);
router.post('/materials/:id/reprocess', reprocessMaterial);

module.exports = router;
