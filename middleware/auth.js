const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const parts = token.split('_');
            let user = null;
            if (parts.length >= 3) {
                user = await User.findOne({ userId: parts[1] });
                if (!user && parts[2].length > 20) {
                    try { user = await User.findById(parts[2]); } catch (e) {}
                }
            }
            if (!user) return res.status(401).json({ success: false, message: 'Пользователь не найден. Войдите заново.' });
            req.user = user;
            next();
        } catch (error) {
            return res.status(401).json({ success: false, message: 'Токен недействителен' });
        }
    } else {
        return res.status(401).json({ success: false, message: 'Требуется авторизация' });
    }
};

const requireActivation = (req, res, next) => {
    if (!req.user.isActivated) {
        return res.status(403).json({ success: false, message: 'Требуется активация аккаунта. Пополните баланс на 1000 ALTYN.', requiredAction: 'activate', activationCost: 1000 });
    }
    next();
};

const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Доступ запрещён. Требуются права администратора.' });
    next();
};

const optionalAuth = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const parts = token.split('_');
            let user = null;
            if (parts.length >= 3) {
                user = await User.findOne({ userId: parts[1] });
                if (!user && parts[2].length > 20) {
                    try { user = await User.findById(parts[2]); } catch (e) {}
                }
            }
            req.user = user;
        } catch (e) { req.user = null; }
    } else { req.user = null; }
    next();
};

module.exports = { protect, requireActivation, adminOnly, optionalAuth };