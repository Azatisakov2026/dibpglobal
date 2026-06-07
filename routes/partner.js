<<<<<<< HEAD
const router = require('express').Router();
const { getPartnerStats, getL1Partners, getL2Partners, getReferralLink, getMarketingPlan } = require('../controllers/partnerController');
const { protect } = require('../middleware/auth');
router.get('/marketing-plan', getMarketingPlan);
router.get('/stats', protect, getPartnerStats);
router.get('/l1', protect, getL1Partners);
router.get('/l2', protect, getL2Partners);
router.get('/referral-link', protect, getReferralLink);
=======
const router = require('express').Router();
const { getPartnerStats, getL1Partners, getL2Partners, getReferralLink, getMarketingPlan } = require('../controllers/partnerController');
const { protect } = require('../middleware/auth');
router.get('/marketing-plan', getMarketingPlan);
router.get('/stats', protect, getPartnerStats);
router.get('/l1', protect, getL1Partners);
router.get('/l2', protect, getL2Partners);
router.get('/referral-link', protect, getReferralLink);
>>>>>>> 502a4b1 (Full project)
module.exports = router;