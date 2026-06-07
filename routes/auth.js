<<<<<<< HEAD
const router = require('express').Router();
const { register, login, getProfile, updateProfile, logout } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.post('/logout', protect, logout);
=======
const router = require('express').Router();
const { register, login, getProfile, updateProfile, logout } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.post('/logout', protect, logout);
>>>>>>> 502a4b1 (Full project)
module.exports = router;