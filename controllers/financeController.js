const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Treasury = require('../models/Treasury');
const Withdrawal = require('../models/Withdrawal');

const ACTIVATION_COST = 1000;
const WITHDRAWAL_FEE = 5;
const GOLD_PRICE_PER_GRAM = 78.50;

exports.activateAccount = async (req, res) => {
    try {
        const user = req.user;
        if (user.isActivated) return res.status(400).json({ success: false, message: 'Аккаунт уже активирован' });
        if (user.balance < ACTIVATION_COST) {
            return res.status(400).json({ success: false, message: `Недостаточно средств. Требуется ${ACTIVATION_COST} ALTYN`, currentBalance: user.balance, required: ACTIVATION_COST, shortage: ACTIVATION_COST - user.balance });
        }

        const balanceBefore = user.balance;
        user.balance -= ACTIVATION_COST;
        user.isActivated = true;
        user.activationDate = new Date();
        user.role = 'investor';
        if (user.directPartners >= 1) user.partnerStatus = 'partner_leader';

        let dist = { toL1: 0, toL2: 0, toTreasury: ACTIVATION_COST };

        // Бонус L1 (200 ALTYN)
        if (user.sponsorL1) {
            const l1 = await User.findById(user.sponsorL1);
            if (l1 && l1.isActivated) {
                dist.toL1 = 200; dist.toTreasury -= 200;
                l1.balance += 200; l1.totalEarned += 200;
                await l1.save();
                await Transaction.create({ userId: l1._id, relatedUserId: user._id, type: 'activation_bonus_l1', amount: 200, currency: 'ALTYN', status: 'completed', description: `Бонус за активацию партнёра ${user.userId} (L1)`, balanceBefore: l1.balance - 200, balanceAfter: l1.balance });
                await l1.updatePartnerStatus();
            }
            // Бонус L2 (100 ALTYN)
            if (user.sponsorL2) {
                const l2 = await User.findById(user.sponsorL2);
                if (l2 && l2.isActivated) {
                    dist.toL2 = 100; dist.toTreasury -= 100;
                    l2.balance += 100; l2.totalEarned += 100;
                    await l2.save();
                    await Transaction.create({ userId: l2._id, relatedUserId: user._id, type: 'activation_bonus_l2', amount: 100, currency: 'ALTYN', status: 'completed', description: `Бонус за активацию субпартнёра ${user.userId} (L2)`, balanceBefore: l2.balance - 100, balanceAfter: l2.balance });
                }
            }
        }

        // Казна (700 ALTYN)
        let treasury = await Treasury.findOne();
        if (!treasury) treasury = await Treasury.create({ totalProfit: 0, activationProfit: 0, feeProfit: 0, projectProfit: 0 });
        await treasury.addProfit(dist.toTreasury, 'activation', `Активация ${user.userId}`);

        await user.save();
        await Transaction.create({ userId: user._id, type: 'activation', amount: -ACTIVATION_COST, currency: 'ALTYN', status: 'completed', description: 'Активация аккаунта', balanceBefore, balanceAfter: user.balance });

        res.json({ success: true, message: '🎉 Аккаунт успешно активирован! Добро пожаловать в DIBP Global!', data: { userId: user.userId, balance: user.balance, isActivated: true, role: user.role, partnerStatus: user.partnerStatus, distribution: dist } });
    } catch (e) {
        console.error('Activate error:', e.message);
        res.status(500).json({ success: false, message: 'Ошибка сервера при активации' });
    }
};

exports.deposit = async (req, res) => {
    try {
        const { amount, currency, paymentMethod } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Укажите корректную сумму' });

        let amountALTYN = amount;
        if (currency === 'USD') amountALTYN = Math.floor((amount / (GOLD_PRICE_PER_GRAM / 1000)) * 100) / 100;
        if (currency === 'USDT') amountALTYN = Math.floor((amount / (GOLD_PRICE_PER_GRAM / 1000)) * 100) / 100;

        const user = req.user;
        const balanceBefore = user.balance;
        user.balance += amountALTYN;
        await user.save();

        await Transaction.create({ userId: user._id, type: 'deposit', amount, currency: currency || 'USD', amountALTYN, status: 'completed', paymentMethod: paymentMethod || 'crypto', description: `Пополнение ${amount} ${currency || 'USD'} → ${amountALTYN} ALTYN`, balanceBefore, balanceAfter: user.balance });

        res.json({ success: true, message: `Баланс пополнен на ${amountALTYN} ALTYN`, data: { balance: user.balance, balanceUSD: user.balanceUSD, addedALTYN: amountALTYN } });
    } catch (e) {
        console.error('Deposit error:', e.message);
        res.status(500).json({ success: false, message: 'Ошибка сервера при пополнении' });
    }
};

exports.withdraw = async (req, res) => {
    try {
        const { amount, currency, walletAddress, bankDetails } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Укажите сумму' });

        const user = req.user;
        if (!user.isActivated) return res.status(403).json({ success: false, message: 'Требуется активация аккаунта' });

        let amountALTYN = amount;
        if (currency === 'USD') amountALTYN = Math.floor((amount / (GOLD_PRICE_PER_GRAM / 1000)) * 100) / 100;

        const totalDeduction = amountALTYN + WITHDRAWAL_FEE;
        if (user.balance < totalDeduction) return res.status(400).json({ success: false, message: `Недостаточно средств. Требуется ${totalDeduction} ALTYN (включая комиссию ${WITHDRAWAL_FEE} ALTYN)`, required: totalDeduction, currentBalance: user.balance, fee: WITHDRAWAL_FEE });

        const balanceBefore = user.balance;
        user.balance -= totalDeduction;
        await user.save();

        let treasury = await Treasury.findOne();
        if (!treasury) treasury = await Treasury.create({ totalProfit: 0, activationProfit: 0, feeProfit: 0, projectProfit: 0 });
        await treasury.addProfit(WITHDRAWAL_FEE, 'fee', `Комиссия за вывод от ${user.userId}`);

        const withdrawal = await Withdrawal.create({ userId: user._id, amount: amountALTYN, currency: currency || 'ALTYN', fee: WITHDRAWAL_FEE, walletAddress: walletAddress || '', bankDetails: bankDetails || {}, status: 'pending' });

        await Transaction.create({ userId: user._id, type: 'withdrawal', amount: -amountALTYN, currency: 'ALTYN', status: 'pending', description: `Заявка на вывод ${amountALTYN} ALTYN (комиссия ${WITHDRAWAL_FEE})`, balanceBefore, balanceAfter: user.balance });
        await Transaction.create({ userId: user._id, type: 'fee', amount: -WITHDRAWAL_FEE, currency: 'ALTYN', status: 'completed', description: `Комиссия за вывод средств` });

        res.json({ success: true, message: 'Заявка на вывод создана и ожидает обработки', data: { withdrawalId: withdrawal._id, amount: amountALTYN, fee: WITHDRAWAL_FEE, totalDeducted: totalDeduction, status: 'pending', balance: user.balance } });
    } catch (e) {
        console.error('Withdraw error:', e.message);
        res.status(500).json({ success: false, message: 'Ошибка сервера при выводе' });
    }
};

exports.getTransactions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const filter = { userId: req.user._id };
        if (req.query.type) filter.type = req.query.type;
        if (req.query.status) filter.status = req.query.status;

        const [transactions, total] = await Promise.all([
            Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('relatedUserId', 'userId fullName').populate('projectId', 'title'),
            Transaction.countDocuments(filter)
        ]);

        res.json({ success: true, count: transactions.length, total, page, totalPages: Math.ceil(total / limit), data: transactions });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.getBalance = async (req, res) => {
    try {
        const user = req.user;
        res.json({ success: true, data: { balance: user.balance, frozenBalance: user.frozenBalance, totalEarned: user.totalEarned, balanceUSD: user.balanceUSD, currency: 'ALTYN', goldPricePerGram: GOLD_PRICE_PER_GRAM, altynPriceUSD: (GOLD_PRICE_PER_GRAM / 1000).toFixed(4) } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.getRates = async (req, res) => {
    try {
        const goldPricePerGram = GOLD_PRICE_PER_GRAM;
        const silverPricePerGram = 0.92;
        const altynPriceUSD = goldPricePerGram / 1000;
        res.json({ success: true, data: { gold: { pricePerGram: goldPricePerGram, pricePerOunce: goldPricePerGram * 31.1035, currency: 'USD' }, silver: { pricePerGram: silverPricePerGram, pricePerOunce: silverPricePerGram * 31.1035, currency: 'USD' }, altyn: { priceUSD: altynPriceUSD, priceEUR: altynPriceUSD * 0.92, description: '1 ALTYN = 1 мг золота' }, currencies: { usdToAltyn: (1 / altynPriceUSD).toFixed(2), eurToAltyn: (1 / (altynPriceUSD * 0.92)).toFixed(2) }, updatedAt: new Date().toISOString() } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};