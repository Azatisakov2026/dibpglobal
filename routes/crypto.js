const router = require('express').Router();
const { getDepositInfo, verifyTransaction, processDeposit, getCryptoRates } = require('../controllers/cryptoController');
const { protect } = require('../middleware/auth');

router.get('/rates', getCryptoRates);
router.get('/deposit-info', protect, getDepositInfo);
router.post('/verify-tx', protect, verifyTransaction);
router.post('/process-deposit', protect, processDeposit);

module.exports = router;