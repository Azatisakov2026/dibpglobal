<<<<<<< HEAD
const router = require('express').Router();
const { getDashboard, getWithdrawals, approveWithdrawal, rejectWithdrawal, updateProjectStatus, getUsers, makeAdmin } = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');
router.use(protect, adminOnly);
router.get('/dashboard', getDashboard);
router.get('/withdrawals', getWithdrawals);
router.put('/withdrawals/:id/approve', approveWithdrawal);
router.put('/withdrawals/:id/reject', rejectWithdrawal);
router.put('/projects/:id/status', updateProjectStatus);
router.get('/users', getUsers);
router.post('/make-admin', makeAdmin);
=======
const router = require('express').Router();
const { getDashboard, getWithdrawals, approveWithdrawal, rejectWithdrawal, updateProjectStatus, getUsers, makeAdmin } = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');
router.use(protect, adminOnly);
router.get('/dashboard', getDashboard);
router.get('/withdrawals', getWithdrawals);
router.put('/withdrawals/:id/approve', approveWithdrawal);
router.put('/withdrawals/:id/reject', rejectWithdrawal);
router.put('/projects/:id/status', updateProjectStatus);
router.get('/users', getUsers);
router.post('/make-admin', makeAdmin);
>>>>>>> 502a4b1 (Full project)
module.exports = router;