const router = require('express').Router();
const { exportTransactions, exportProjects, exportAdminData } = require('../controllers/exportController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/transactions', protect, exportTransactions);
router.get('/projects', exportProjects);
router.get('/admin-data', protect, adminOnly, exportAdminData);

module.exports = router;