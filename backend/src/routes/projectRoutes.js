const express = require('express');
const {
  createProject,
  listProjectsInSpace,
  getProject,
  updateProject,
  deleteProject,
  getProjectSummary,
   getProjectDashboard, 
} = require('../controllers/projectController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// Nested under a Space
router.post('/spaces/:spaceId/projects', createProject);
router.get('/spaces/:spaceId/projects', listProjectsInSpace);

// Direct project access
router.get('/projects/:id', getProject);
router.get('/projects/:id/summary', getProjectSummary);
router.patch('/projects/:id', updateProject);
router.delete('/projects/:id', deleteProject);
router.get('/projects/:id/dashboard', getProjectDashboard);

module.exports = router;
