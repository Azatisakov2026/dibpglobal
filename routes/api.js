const router = require('express').Router();
const ApiKey = require('../models/ApiKey');
const User = require('../models/User');
const Project = require('../models/Project');
const Transaction = require('../models/Transaction');
const crypto = require('crypto');

// Middleware для проверки API ключа
const apiAuth = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ success: false, message: 'API ключ не указан' });

    const key = await ApiKey.findOne({ key: apiKey, isActive: true });
    if (!key) return res.status(401).json({ success: false, message: 'Неверный API ключ' });

    if (key.expiresAt && key.expiresAt < new Date()) {
        return res.status(401).json({ success: false, message: 'API ключ истёк' });
    }

    key.lastUsedAt = new Date();
    await key.save();

    req.apiKey = key;
    req.user = await User.findById(key.userId);
    next();
};

// Публичные эндпоинты
router.get('/projects', apiAuth, async (req, res) => {
    try {
        const projects = await Project.find({ status: 'active' }).select('-investors').lean();
        res.json({ success: true, data: projects });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

router.get('/balance', apiAuth, async (req, res) => {
    try {
        const user = await User.findById(req.apiKey.userId);
        res.json({ success: true, data: { balance: user.balance, balanceUSD: user.balanceUSD } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

router.get('/transactions', apiAuth, async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.apiKey.userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        res.json({ success: true, data: transactions });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

// Генерация API ключа
router.post('/keys/generate', async (req, res) => {
    try {
        const user = await require('../middleware/auth').protect(req, res, () => {});
        if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

        const { name, permissions } = req.body;
        const key = await ApiKey.create({
            userId: req.user._id,
            name: name || 'API Key',
            permissions: permissions || ['read_projects', 'read_balance']
        });

        res.json({
            success: true,
            message: 'API ключ создан. Сохраните секретный ключ!',
            data: {
                id: key._id,
                name: key.name,
                key: key.key,
                secret: key.secret,
                permissions: key.permissions
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

router.get('/keys', async (req, res) => {
    try {
        const user = await require('../middleware/auth').protect(req, res, () => {});
        if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

        const keys = await ApiKey.find({ userId: req.user._id }).select('-secret');
        res.json({ success: true, data: keys });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

router.delete('/keys/:id', async (req, res) => {
    try {
        const user = await require('../middleware/auth').protect(req, res, () => {});
        if (!req.user) return res.status(401).json({ success: false, message: 'Не авторизован' });

        await ApiKey.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        res.json({ success: true, message: 'API ключ удалён' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

module.exports = router;