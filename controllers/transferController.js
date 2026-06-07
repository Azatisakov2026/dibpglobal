const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Treasury = require('../models/Treasury');
const emailService = require('../services/emailService');

const TRANSFER_FEE = 5;
const transferCodes = {};

exports.initiateTransfer = async (req, res) => {
    try {
        const sender = req.user;
        const { recipientId, amount } = req.body;

        if (!recipientId || !amount || amount < 1) {
            return res.status(400).json({ success: false, message: 'Укажите получателя и сумму (мин 1 ALTYN)' });
        }

        if (sender.balance < amount + TRANSFER_FEE) {
            return res.status(400).json({ 
                success: false, 
                message: `Недостаточно средств. Нужно ${amount + TRANSFER_FEE} ALTYN (включая комиссию ${TRANSFER_FEE})`,
                required: amount + TRANSFER_FEE,
                currentBalance: sender.balance
            });
        }

        const recipient = await User.findOne({ userId: recipientId.toUpperCase() });
        if (!recipient) {
            return res.status(400).json({ success: false, message: 'Получатель не найден' });
        }
        if (recipient.userId === sender.userId) {
            return res.status(400).json({ success: false, message: 'Нельзя перевести самому себе' });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        transferCodes[sender.userId] = {
            code,
            recipientId: recipient.userId,
            recipient_id: recipient._id,
            amount,
            expires: Date.now() + 600000
        };

        // Отправка кода на email
        if (sender.email) {
            try {
                await emailService.sendVerificationCode(sender.email, code, 'перевода средств');
            } catch (e) {
                console.warn('Email not sent:', e.message);
            }
        }

        console.log(`📧 Код подтверждения перевода для ${sender.userId}: ${code}`);

        res.json({
            success: true,
            message: 'Код подтверждения отправлен на email',
            needCode: true,
            data: {
                recipientId: recipient.userId,
                recipientName: recipient.fullName,
                amount,
                fee: TRANSFER_FEE,
                total: amount + TRANSFER_FEE
            }
        });
    } catch (e) {
        console.error('Transfer error:', e.message);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.confirmTransfer = async (req, res) => {
    try {
        const sender = req.user;
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ success: false, message: 'Введите код подтверждения' });
        }

        const record = transferCodes[sender.userId];
        if (!record) {
            return res.status(400).json({ success: false, message: 'Код не найден. Запросите новый перевод.' });
        }
        if (Date.now() > record.expires) {
            delete transferCodes[sender.userId];
            return res.status(400).json({ success: false, message: 'Код истёк. Запросите новый перевод.' });
        }
        if (record.code !== code) {
            return res.status(400).json({ success: false, message: 'Неверный код подтверждения' });
        }

        const recipient = await User.findById(record.recipient_id);
        if (!recipient) {
            delete transferCodes[sender.userId];
            return res.status(404).json({ success: false, message: 'Получатель не найден' });
        }

        const totalDeduction = record.amount + TRANSFER_FEE;
        if (sender.balance < totalDeduction) {
            delete transferCodes[sender.userId];
            return res.status(400).json({ success: false, message: 'Недостаточно средств' });
        }

        const senderBalanceBefore = sender.balance;
        const recipientBalanceBefore = recipient.balance;

        sender.balance -= totalDeduction;
        recipient.balance += record.amount;
        await sender.save();
        await recipient.save();

        // Комиссия в казну
        let treasury = await Treasury.findOne();
        if (!treasury) treasury = await Treasury.create({ totalProfit: 0 });
        await treasury.addProfit(TRANSFER_FEE, 'fee', `Комиссия за перевод от ${sender.userId} → ${recipient.userId}`);

        // Транзакции
        await Transaction.create({
            userId: sender._id,
            relatedUserId: recipient._id,
            type: 'transfer',
            amount: -totalDeduction,
            currency: 'ALTYN',
            status: 'completed',
            description: `Перевод ${record.amount} ALTYN → ${recipient.userId} (комиссия ${TRANSFER_FEE})`,
            balanceBefore: senderBalanceBefore,
            balanceAfter: sender.balance
        });

        await Transaction.create({
            userId: recipient._id,
            relatedUserId: sender._id,
            type: 'transfer',
            amount: record.amount,
            currency: 'ALTYN',
            status: 'completed',
            description: `Поступление ${record.amount} ALTYN от ${sender.userId}`,
            balanceBefore: recipientBalanceBefore,
            balanceAfter: recipient.balance
        });

        delete transferCodes[sender.userId];

        res.json({
            success: true,
            message: `Перевод ${record.amount} ALTYN выполнен успешно!`,
            data: {
                amount: record.amount,
                fee: TRANSFER_FEE,
                total: totalDeduction,
                recipient: {
                    userId: recipient.userId,
                    fullName: recipient.fullName
                },
                balance: sender.balance
            }
        });
    } catch (e) {
        console.error('Confirm transfer error:', e.message);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};