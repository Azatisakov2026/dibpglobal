const router = require('express').Router();
const { initiateTransfer, confirmTransfer } = require('../controllers/transferController');
const { protect, requireActivation } = require('../middleware/auth');

router.post('/initiate', protect, requireActivation, initiateTransfer);
router.post('/confirm', protect, requireActivation, confirmTransfer);

module.exports = router;