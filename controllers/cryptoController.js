const cryptoService = require('../services/cryptoService');
const tronService = require('../services/tronService');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

exports.getDepositInfo = async (req, res) => {
    try {
        const user = req.user;
        const currency = req.query.currency || 'USDT_TRC20';
        const paymentInfo = cryptoService.generatePaymentAddress(user.userId, currency);
        const qrCode = await cryptoService.generateQRCode(paymentInfo.qrData);

        res.json({
            success: true,
            data: {
                ...paymentInfo,
                qrCode
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.verifyTransaction = async (req, res) => {
    try {
        const { txId } = req.body;
        if (!txId) return res.status(400).json({ success: false, message: 'Укажите TX ID' });

        const txStatus = await tronService.checkSingleTx(txId);

        if (txStatus.confirmed) {
            res.json({
                success: true,
                confirmed: true,
                message: 'Транзакция подтверждена в блокчейне',
                data: txStatus
            });
        } else {
            res.json({
                success: true,
                confirmed: false,
                message: 'Транзакция не найдена или не подтверждена. Попробуйте позже.'
            });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка: ' + e.message });
    }
};

exports.processDeposit = async (req, res) => {
    try {
        const user = req.user;
        const { txId, amount, currency } = req.body;

        if (!txId || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Укажите TX ID и сумму' });
        }

        const goldRate = 78.50;
        const altynAmount = cryptoService.usdToALTYN(amount, goldRate);

        const balanceBefore = user.balance;
        user.balance += altynAmount;
        await user.save();

        await Transaction.create({
            userId: user._id,
            type: 'deposit',
            amount: amount,
            currency: currency || 'USDT',
            amountALTYN: altynAmount,
            status: 'completed',
            description: `Крипто-пополнение ${amount} ${currency || 'USDT'} → ${altynAmount.toFixed(2)} ALTYN`,
            paymentMethod: 'crypto',
            externalTxId: txId,
            balanceBefore,
            balanceAfter: user.balance
        });

        res.json({
            success: true,
            message: `Зачислено ${altynAmount.toFixed(2)} ALTYN`,
            data: {
                balance: user.balance,
                balanceUSD: user.balanceUSD,
                addedALTYN: altynAmount.toFixed(2)
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.getCryptoRates = async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                USDT: 1.00,
                BTC: 67500.00,
                ETH: 3500.00,
                ALTYN: 0.0785,
                updatedAt: new Date().toISOString()
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};