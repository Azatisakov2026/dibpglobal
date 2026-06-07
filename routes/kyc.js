const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { submitKYC, getKYCStatus, getPendingKYC, approveKYC, rejectKYC } = require('../controllers/kycController');
const { protect, adminOnly } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'kyc');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, 'kyc-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/submit', protect, upload.fields([
    { name: 'documentFront', maxCount: 1 },
    { name: 'documentBack', maxCount: 1 },
    { name: 'selfieWithDocument', maxCount: 1 }
]), submitKYC);

router.get('/status', protect, getKYCStatus);
router.get('/pending', protect, adminOnly, getPendingKYC);
router.put('/:id/approve', protect, adminOnly, approveKYC);
router.put('/:id/reject', protect, adminOnly, rejectKYC);

module.exports = router;