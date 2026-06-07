const User = require('../models/User');
const Project = require('../models/Project');
const Transaction = require('../models/Transaction');
const Treasury = require('../models/Treasury');
const Withdrawal = require('../models/Withdrawal');

exports.getDashboard = async (req, res) => {
    try {
        const [totalUsers, activatedUsers, totalProjects, pendingWithdrawals, treasury, recentTransactions, recentUsers] = await Promise.all([
            User.countDocuments(), User.countDocuments({ isActivated: true }), Project.countDocuments(), Withdrawal.countDocuments({ status: 'pending' }), Treasury.findOne(),
            Transaction.find().sort({ createdAt: -1 }).limit(10).populate('userId', 'userId fullName'),
            User.find().sort({ createdAt: -1 }).limit(10).select('userId fullName email isActivated balance')
        ]);
        const totalBalance = await User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]);
        const totalFrozen = await User.aggregate([{ $group: { _id: null, total: { $sum: '$frozenBalance' } } }]);

        res.json({ success: true, data: { stats: { totalUsers, activatedUsers, totalProjects, pendingWithdrawals, totalSystemBalance: totalBalance[0]?.total || 0, totalFrozenBalance: totalFrozen[0]?.total || 0 }, treasury: treasury || { totalProfit: 0 }, recentTransactions, recentUsers } });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
};

exports.getWithdrawals = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; const limit = 20; const skip = (page-1)*limit;
        const filter = req.query.status && req.query.status !== 'all' ? { status: req.query.status } : {};
        const [withdrawals, total] = await Promise.all([Withdrawal.find(filter).populate('userId', 'userId fullName email balance').sort({ createdAt: -1 }).skip(skip).limit(limit), Withdrawal.countDocuments(filter)]);
        res.json({ success: true, count: withdrawals.length, total, page, totalPages: Math.ceil(total/limit), data: withdrawals });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
};

exports.approveWithdrawal = async (req, res) => {
    try {
        const w = await Withdrawal.findById(req.params.id);
        if (!w) return res.status(404).json({ success: false, message: 'Заявка не найдена' });
        if (w.status !== 'pending') return res.status(400).json({ success: false, message: `Заявка уже ${w.status}` });
        w.status = 'completed'; w.processedBy = req.user._id; w.processedAt = new Date(); w.adminNote = req.body.note || 'Одобрено'; w.externalTxId = req.body.externalTxId || '';
        await w.save();
        await Transaction.findOneAndUpdate({ userId: w.userId, type: 'withdrawal', status: 'pending' }, { status: 'completed' });
        res.json({ success: true, message: 'Вывод одобрен', data: w });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
};

exports.rejectWithdrawal = async (req, res) => {
    try {
        const w = await Withdrawal.findById(req.params.id);
        if (!w) return res.status(404).json({ success: false, message: 'Заявка не найдена' });
        if (w.status !== 'pending') return res.status(400).json({ success: false, message: `Заявка уже ${w.status}` });
        const user = await User.findById(w.userId);
        if (user) { user.balance += (w.amount + w.fee); await user.save(); }
        w.status = 'rejected'; w.processedBy = req.user._id; w.processedAt = new Date(); w.rejectionReason = req.body.reason || 'Отклонено'; w.adminNote = req.body.note || '';
        await w.save();
        await Transaction.findOneAndUpdate({ userId: w.userId, type: 'withdrawal', status: 'pending' }, { status: 'cancelled', description: 'Вывод отклонён. Средства возвращены.' });
        await Transaction.create({ userId: w.userId, type: 'deposit', amount: w.amount + w.fee, currency: 'ALTYN', status: 'completed', description: 'Возврат средств: вывод отклонён' });
        res.json({ success: true, message: 'Вывод отклонён, средства возвращены' });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
};

exports.updateProjectStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ['active', 'pending', 'cancelled', 'completed'];
        if (!allowed.includes(status)) return res.status(400).json({ success: false, message: `Недопустимый статус: ${allowed.join(', ')}` });
        const project = await Project.findById(req.params.id);
        if (!project) return res.status(404).json({ success: false, message: 'Проект не найден' });
        project.status = status;
        if (status === 'active') project.startDate = new Date();
        await project.save();
        res.json({ success: true, message: `Статус изменён на "${status}"`, data: project });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
};

exports.getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; const limit = 20; const skip = (page-1)*limit;
        const search = req.query.search || '';
        const filter = search ? { $or: [{ userId: { $regex: search, $options: 'i' } }, { fullName: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }] } : {};
        const [users, total] = await Promise.all([User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments(filter)]);
        res.json({ success: true, count: users.length, total, page, totalPages: Math.ceil(total/limit), data: users });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
};

exports.makeAdmin = async (req, res) => {
    try {
        const { secret, userId } = req.body;
        if (secret !== 'DIBP_ADMIN_2026') return res.status(403).json({ success: false, message: 'Неверный ключ' });
        const user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ success: false, message: 'Пользователь не найден' });
        user.role = 'admin';
        await user.save();
        res.json({ success: true, message: `${user.userId} теперь администратор` });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
};