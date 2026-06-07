const SupportTicket = require('../models/SupportTicket');
const emailService = require('../services/emailService');
const telegramService = require('../services/telegramService');

exports.createTicket = async (req, res) => {
    try {
        const { subject, message, category } = req.body;
        if (!subject || !message) {
            return res.status(400).json({ success: false, message: 'Укажите тему и сообщение' });
        }

        const ticket = await SupportTicket.create({
            userId: req.user._id,
            subject,
            category: category || 'general',
            messages: [{
                senderId: req.user._id,
                senderRole: 'user',
                message
            }],
            lastReplyAt: new Date()
        });

        // Уведомление админам
        await telegramService.sendMessage(
            `🆕 Новый тикет #${ticket._id}\n👤 ${req.user.fullName} (${req.user.userId})\n📧 ${req.user.email}\n📝 ${subject}\n💬 ${message.substring(0, 200)}`
        );

        res.status(201).json({
            success: true,
            message: 'Тикет создан. Поддержка ответит в ближайшее время.',
            data: ticket
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.getMyTickets = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [tickets, total] = await Promise.all([
            SupportTicket.find({ userId: req.user._id })
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit),
            SupportTicket.countDocuments({ userId: req.user._id })
        ]);

        res.json({ success: true, count: tickets.length, total, page, totalPages: Math.ceil(total / limit), data: tickets });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.getTicket = async (req, res) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id)
            .populate('messages.senderId', 'userId fullName avatar');

        if (!ticket) return res.status(404).json({ success: false, message: 'Тикет не найден' });
        if (ticket.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Нет доступа' });
        }

        // Отмечаем сообщения как прочитанные
        ticket.messages.forEach(m => {
            if (!m.readAt && m.senderRole !== req.user.role) {
                m.readAt = new Date();
            }
        });
        await ticket.save();

        res.json({ success: true, data: ticket });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.replyTicket = async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ success: false, message: 'Введите сообщение' });

        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ success: false, message: 'Тикет не найден' });

        const senderRole = req.user.role === 'admin' ? 'admin' : 'user';
        ticket.messages.push({
            senderId: req.user._id,
            senderRole,
            message
        });
        ticket.lastReplyAt = new Date();

        if (senderRole === 'admin') {
            ticket.status = 'in_progress';
        } else {
            ticket.status = 'open';
        }

        await ticket.save();

        // Уведомление пользователю если ответил админ
        if (senderRole === 'admin') {
            const ticketOwner = await require('../models/User').findById(ticket.userId);
            if (ticketOwner?.email) {
                await emailService.sendNotification(
                    ticketOwner.email,
                    'Ответ поддержки DIBP Global',
                    `По вашему тикету "${ticket.subject}" поступил ответ.\n\n${message.substring(0, 500)}\n\nВойдите в личный кабинет для просмотра.`
                );
            }
        }

        res.json({ success: true, message: 'Ответ отправлен', data: ticket });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.closeTicket = async (req, res) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ success: false, message: 'Тикет не найден' });

        ticket.status = 'closed';
        ticket.closedAt = new Date();
        await ticket.save();

        res.json({ success: true, message: 'Тикет закрыт' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

// Админские методы
exports.getAllTickets = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const filter = {};
        if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
        if (req.query.priority) filter.priority = req.query.priority;

        const [tickets, total] = await Promise.all([
            SupportTicket.find(filter)
                .populate('userId', 'userId fullName email')
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit),
            SupportTicket.countDocuments(filter)
        ]);

        res.json({ success: true, count: tickets.length, total, page, totalPages: Math.ceil(total / limit), data: tickets });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};