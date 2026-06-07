const Verification = require('../models/Verification');
const User = require('../models/User');
const AdminLog = require('../models/AdminLog');

exports.submitKYC = async (req, res) => {
    try {
        const user = req.user;
        const { firstName, lastName, documentType, documentNumber, country } = req.body;
        
        if (!firstName || !lastName || !documentType || !documentNumber) {
            return res.status(400).json({ success: false, message: 'Заполните все обязательные поля' });
        }

        const existing = await Verification.findOne({ userId: user._id });
        if (existing && existing.status === 'pending') {
            return res.status(400).json({ success: false, message: 'Заявка уже на рассмотрении' });
        }

        const verification = await Verification.findOneAndUpdate(
            { userId: user._id },
            {
                userId: user._id,
                status: 'pending',
                firstName,
                lastName,
                documentType,
                documentNumber,
                country: country || '',
                documentFront: (req.files?.documentFront?.[0]?.path || '').replace(/\\/g, '/').replace('public/', ''),
                documentBack: (req.files?.documentBack?.[0]?.path || '').replace(/\\/g, '/').replace('public/', ''),
                selfieWithDocument: (req.files?.selfieWithDocument?.[0]?.path || '').replace(/\\/g, '/').replace('public/', ''),
                submittedAt: new Date(),
                rejectionReason: ''
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, message: 'Заявка на верификацию отправлена!', data: verification });
    } catch (e) {
        console.error('KYC submit error:', e.message);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.getKYCStatus = async (req, res) => {
    try {
        const verification = await Verification.findOne({ userId: req.user._id });
        if (!verification) {
            return res.json({ success: true, data: { status: 'not_submitted' } });
        }
        res.json({ success: true, data: verification });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.getPendingKYC = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [verifications, total] = await Promise.all([
            Verification.find({ status: 'pending' })
                .populate('userId', 'userId fullName email')
                .sort({ submittedAt: -1 })
                .skip(skip)
                .limit(limit),
            Verification.countDocuments({ status: 'pending' })
        ]);

        res.json({ success: true, count: verifications.length, total, page, totalPages: Math.ceil(total / limit), data: verifications });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.approveKYC = async (req, res) => {
    try {
        const verification = await Verification.findById(req.params.id);
        if (!verification) return res.status(404).json({ success: false, message: 'Заявка не найдена' });
        if (verification.status !== 'pending') return res.status(400).json({ success: false, message: 'Заявка уже обработана' });

        verification.status = 'approved';
        verification.approvedAt = new Date();
        verification.processedBy = req.user._id;
        await verification.save();

        await User.findByIdAndUpdate(verification.userId, { isVerified: true, kycVerified: true });

        // Логирование
        await AdminLog.create({
            adminId: req.user._id,
            action: 'approve_kyc',
            targetId: verification.userId,
            targetModel: 'Verification',
            details: `Одобрена верификация для пользователя`,
            ipAddress: req.ip,
            userAgent: req.get('user-agent') || ''
        });

        res.json({ success: true, message: 'Верификация одобрена!' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.rejectKYC = async (req, res) => {
    try {
        const { reason } = req.body;
        const verification = await Verification.findById(req.params.id);
        if (!verification) return res.status(404).json({ success: false, message: 'Заявка не найдена' });
        if (verification.status !== 'pending') return res.status(400).json({ success: false, message: 'Заявка уже обработана' });

        verification.status = 'rejected';
        verification.rejectionReason = reason || 'Не соответствует требованиям';
        verification.processedBy = req.user._id;
        await verification.save();

        await AdminLog.create({
            adminId: req.user._id,
            action: 'reject_kyc',
            targetId: verification.userId,
            targetModel: 'Verification',
            details: `Отклонена верификация. Причина: ${reason || 'Не указана'}`,
            ipAddress: req.ip,
            userAgent: req.get('user-agent') || ''
        });

        res.json({ success: true, message: 'Верификация отклонена' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};