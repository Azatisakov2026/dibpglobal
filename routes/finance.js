<<<<<<< HEAD
const router = require('express').Router();
const { activateAccount, deposit, withdraw, getTransactions, getBalance, getRates } = require('../controllers/financeController');
const { protect, requireActivation } = require('../middleware/auth');
router.get('/rates', getRates);
router.get('/balance', protect, getBalance);
router.get('/transactions', protect, getTransactions);
router.post('/deposit', protect, deposit);
router.post('/activate', protect, activateAccount);
router.post('/withdraw', protect, requireActivation, withdraw);
=======
const router = require('express').Router();
const { activateAccount, deposit, withdraw, getTransactions, getBalance, getRates } = require('../controllers/financeController');
const { protect, requireActivation } = require('../middleware/auth');
router.get('/rates', getRates);
router.get('/balance', protect, getBalance);
router.get('/transactions', protect, getTransactions);
router.post('/deposit', protect, deposit);
router.post('/activate', protect, activateAccount);
router.post('/withdraw', protect, requireActivation, withdraw);
>>>>>>> 502a4b1 (Full project)
module.exports = router;