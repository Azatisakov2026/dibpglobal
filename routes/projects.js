const router = require('express').Router();
const { createProject, getProjects, getProjectById, investInProject, confirmInvest, distributeProfit, getMyInvestments, getMyProjects } = require('../controllers/projectController');
const { protect, requireActivation, optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, getProjects);
router.get('/my/investments', protect, getMyInvestments);
router.get('/my/projects', protect, getMyProjects);
router.get('/:id', optionalAuth, getProjectById);
router.post('/', protect, requireActivation, createProject);
router.post('/:id/invest', protect, requireActivation, investInProject);
router.post('/:id/invest-confirm', protect, requireActivation, confirmInvest);
router.post('/:id/distribute-profit', protect, distributeProfit);

module.exports = router;