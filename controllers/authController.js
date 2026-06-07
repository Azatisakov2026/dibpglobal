const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const generateToken = (user) => `token_${user.userId}_${user._id}`;

exports.register = async (req, res) => {
    try {
        const { fullName, email, password, sponsorId } = req.body;
        if (!fullName || !email || !password) {
            return res.status(400).json({ success: false, message: 'Заполните все обязательные поля' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Пароль должен быть не менее 6 символов' });
        }
        const exists = await User.findOne({ email: email.toLowerCase() });
        if (exists) return res.status(400).json({ success: false, message: 'Пользователь с таким email уже зарегистрирован' });

        const user = await User.create({ fullName, email: email.toLowerCase(), password, sponsorId: sponsorId || null });

        await Transaction.create({ userId: user._id, type: 'registration', amount: 0, currency: 'ALTYN', status: 'completed', description: 'Регистрация нового аккаунта' });

        const token = generateToken(user);
        res.status(201).json({
            success: true, message: 'Регистрация успешна! Добро пожаловать в DIBP Global!',
            data: { userId: user.userId, fullName: user.fullName, email: user.email, balance: user.balance, isActivated: false, role: 'user', partnerStatus: 'none', referralLink: user.referralLink, directPartners: 0, totalPartners: 0, isVerified: false, balanceUSD: '0.00', token }
        });
    } catch (e) {
        console.error('Register error:', e.message);
        if (e.name === 'ValidationError') {
            const messages = Object.values(e.errors).map(err => err.message).join('. ');
            return res.status(400).json({ success: false, message: messages });
        }
        if (e.code === 11000) return res.status(400).json({ success: false, message: 'Email уже используется' });
        res.status(500).json({ success: false, message: 'Ошибка сервера при регистрации' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Введите email/ID и пароль' });

        const user = await User.findOne({ $or: [{ email: (email || '').toLowerCase() }, { userId: (email || '').toUpperCase() }] }).select('+password');
        if (!user) return res.status(401).json({ success: false, message: 'Неверный email/ID или пароль' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Неверный пароль' });

        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        const token = generateToken(user);
        res.json({
            success: true, message: 'Вход выполнен успешно!',
            data: { userId: user.userId, fullName: user.fullName, email: user.email, avatar: user.avatar, balance: user.balance, frozenBalance: user.frozenBalance, isActivated: user.isActivated, role: user.role, partnerStatus: user.partnerStatus, referralLink: user.referralLink, directPartners: user.directPartners, totalPartners: user.totalPartners, isVerified: user.isVerified, balanceUSD: user.balanceUSD, token }
        });
    } catch (e) {
        console.error('Login error:', e.message);
        res.status(500).json({ success: false, message: 'Ошибка сервера при входе' });
    }
};

exports.getProfile = async (req, res) => {
    try {
        res.json({ success: true, data: req.user });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const allowedFields = ['fullName', 'phone', 'country', 'city', 'address', 'language', 'heir'];
        const updates = {};
        allowedFields.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });
        const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
        res.json({ success: true, message: 'Профиль обновлён', data: user });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.logout = async (req, res) => {
    res.json({ success: true, message: 'Выход выполнен' });
};