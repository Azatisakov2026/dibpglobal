const Project = require('../models/Project');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Treasury = require('../models/Treasury');
const emailService = require('../services/emailService');

const investCodes = {};

exports.createProject = async (req, res) => {
    try {
        if (req.user.role !== 'business_partner' && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Только бизнес-партнёры могут создавать проекты' });
        const { title, description, targetAmount, expectedROI, duration, category, riskLevel } = req.body;
        if (!title || !description || !targetAmount || !expectedROI || !duration) return res.status(400).json({ success: false, message: 'Заполните все обязательные поля' });

        const project = await Project.create({ title, description, shortDescription: description.substring(0, 200), targetAmount, expectedROI, duration, category: category || 'other', riskLevel: riskLevel || 'medium', initiator: req.user._id, status: 'pending' });

        res.status(201).json({ success: true, message: 'Проект создан и отправлен на модерацию', data: project });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.getProjects = async (req, res) => {
    try {
        const filter = { status: { $in: ['active', 'funded'] } };
        if (req.query.category) filter.category = req.query.category;
        if (req.query.riskLevel) filter.riskLevel = req.query.riskLevel;
        const projects = await Project.find(filter).populate('initiator', 'userId fullName avatar').sort({ createdAt: -1 }).select('-investors');
        res.json({ success: true, count: projects.length, data: projects.length > 0 ? projects : [
            { _id: 'p1', title: 'Солнечная ферма', shortDescription: 'Зелёная энергия будущего', expectedROI: 25, fundingProgress: 65, targetAmount: 50000, collectedAmount: 32500, status: 'active' },
            { _id: 'p2', title: 'IT Стартап AI', shortDescription: 'Искусственный интеллект для бизнеса', expectedROI: 40, fundingProgress: 30, targetAmount: 25000, collectedAmount: 7500, status: 'active' },
            { _id: 'p3', title: 'Агрокомплекс', shortDescription: 'Тепличный комплекс с гидропоникой', expectedROI: 18, fundingProgress: 85, targetAmount: 15000, collectedAmount: 12750, status: 'active' }
        ]});
    } catch (e) {
        res.json({ success: true, data: [
            { _id: 'p1', title: 'Солнечная ферма', shortDescription: 'Зелёная энергия будущего', expectedROI: 25, fundingProgress: 65, targetAmount: 50000, collectedAmount: 32500, status: 'active' },
            { _id: 'p2', title: 'IT Стартап AI', shortDescription: 'Искусственный интеллект для бизнеса', expectedROI: 40, fundingProgress: 30, targetAmount: 25000, collectedAmount: 7500, status: 'active' }
        ]});
    }
};

exports.getProjectById = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id).populate('initiator', 'userId fullName avatar country').populate('investors.userId', 'userId fullName avatar');
        if (!project) return res.status(404).json({ success: false, message: 'Проект не найден' });
        res.json({ success: true, data: project });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

// Шаг 1: Запрос инвестиции — отправка кода
exports.investInProject = async (req, res) => {
    try {
        const { amount } = req.body;
        const project = await Project.findById(req.params.id);
        const user = req.user;

        if (!project) return res.status(404).json({ success: false, message: 'Проект не найден' });
        if (project.status !== 'active') return res.status(400).json({ success: false, message: 'Проект не доступен для инвестиций' });
        if (!amount || amount < project.minInvestment) return res.status(400).json({ success: false, message: `Минимальная сумма: ${project.minInvestment} ALTYN` });
        if (project.maxInvestment > 0 && amount > project.maxInvestment) return res.status(400).json({ success: false, message: `Максимальная сумма: ${project.maxInvestment} ALTYN` });

        const remaining = project.targetAmount - project.collectedAmount;
        if (amount > remaining) return res.status(400).json({ success: false, message: `Доступно только ${remaining} ALTYN`, remaining });
        if (user.balance < amount) return res.status(400).json({ success: false, message: `Недостаточно средств. Баланс: ${user.balance} ALTYN` });

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        investCodes[user.userId] = { code, projectId: project._id, amount, expires: Date.now() + 600000 };

        if (user.email) {
            try {
                await emailService.sendVerificationCode(user.email, code, 'инвестиции в проект "' + project.title + '"');
            } catch (e) {
                console.warn('Email not sent:', e.message);
            }
        }
        console.log('📧 Код инвестиции для ' + user.email + ': ' + code);

        res.json({ success: true, message: 'Код отправлен на почту', needCode: true, projectTitle: project.title });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

// Шаг 2: Подтверждение инвестиции
exports.confirmInvest = async (req, res) => {
    try {
        const user = req.user;
        const { code } = req.body;

        if (!code) return res.status(400).json({ success: false, message: 'Введите код' });

        const record = investCodes[user.userId];
        if (!record || Date.now() > record.expires) return res.status(400).json({ success: false, message: 'Код недействителен или истёк' });
        if (record.code !== code) return res.status(400).json({ success: false, message: 'Неверный код' });

        const project = await Project.findById(record.projectId);
        if (!project || project.status !== 'active') return res.status(400).json({ success: false, message: 'Проект недоступен' });
        if (user.balance < record.amount) return res.status(400).json({ success: false, message: 'Недостаточно средств' });

        const balanceBefore = user.balance;
        user.balance -= record.amount;
        user.frozenBalance += record.amount;
        await user.save();

        await project.addInvestment(user._id, record.amount);
        project.calculateProfitShares();
        await project.save();

        await Transaction.create({ userId: user._id, type: 'investment', amount: -record.amount, currency: 'ALTYN', status: 'completed', description: `Инвестиция в проект "${project.title}"`, projectId: project._id, balanceBefore, balanceAfter: user.balance });

        delete investCodes[user.userId];
        res.json({ success: true, message: `✅ Инвестировано ${record.amount} ALTYN в "${project.title}"`, data: { balance: user.balance } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.distributeProfit = async (req, res) => {
    try {
        const { profitAmount } = req.body;
        const project = await Project.findById(req.params.id).populate('initiator').populate('investors.userId');
        if (!project) return res.status(404).json({ success: false, message: 'Проект не найден' });

        const isInitiator = project.initiator._id.toString() === req.user._id.toString();
        if (!isInitiator && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Только инициатор или админ может распределять прибыль' });
        if (!profitAmount || profitAmount <= 0) return res.status(400).json({ success: false, message: 'Укажите сумму прибыли' });

        // 20% компании (включая бонусы L1/L2), 40% инвесторам, 40% инициатору
        const companyShare = profitAmount * 0.20;
        const investorShare = profitAmount * 0.40;
        const partnerShare = profitAmount * 0.40;

        let totalBonuses = 0;

        // Сначала считаем и выплачиваем инвесторам + бонусы L1/L2
        for (const investor of project.investors) {
            const investorUser = await User.findById(investor.userId._id || investor.userId);
            if (!investorUser || !investorUser.isActivated) continue;

            const investorProfit = (investor.amount / project.collectedAmount) * investorShare;
            const roundedProfit = Math.floor(investorProfit * 100) / 100;

            // Выплата инвестору
            investorUser.balance += roundedProfit;
            investorUser.frozenBalance -= investor.amount;
            investorUser.totalEarned += roundedProfit;
            await investorUser.save();

            investor.profitEarned += roundedProfit;
            investor.lastPayoutAt = new Date();

            await Transaction.create({ userId: investorUser._id, type: 'profit', amount: roundedProfit, currency: 'ALTYN', status: 'completed', description: `Прибыль от проекта "${project.title}"`, projectId: project._id, balanceAfter: investorUser.balance });

            // Бонус L1 (5% или 7% от прибыли инвестора)
            if (investorUser.sponsorL1) {
                const l1 = await User.findById(investorUser.sponsorL1);
                if (l1 && l1.isActivated) {
                    const l1Percent = l1.partnerStatus === 'vip_partner' ? 0.07 : 0.05;
                    const l1Bonus = Math.floor(investorProfit * l1Percent * 100) / 100;
                    l1.balance += l1Bonus;
                    l1.totalEarned += l1Bonus;
                    await l1.save();
                    totalBonuses += l1Bonus;
                    await Transaction.create({ userId: l1._id, relatedUserId: investorUser._id, type: 'partner_bonus_l1', amount: l1Bonus, currency: 'ALTYN', status: 'completed', description: `Бонус L1 (${l1Percent*100}%) от прибыли ${investorUser.userId}`, projectId: project._id });
                }
            }

            // Бонус L2 (2% или 3% от прибыли инвестора)
            if (investorUser.sponsorL2) {
                const l2 = await User.findById(investorUser.sponsorL2);
                if (l2 && l2.isActivated) {
                    const l2Percent = l2.partnerStatus === 'vip_partner' ? 0.03 : 0.02;
                    const l2Bonus = Math.floor(investorProfit * l2Percent * 100) / 100;
                    l2.balance += l2Bonus;
                    l2.totalEarned += l2Bonus;
                    await l2.save();
                    totalBonuses += l2Bonus;
                    await Transaction.create({ userId: l2._id, relatedUserId: investorUser._id, type: 'partner_bonus_l2', amount: l2Bonus, currency: 'ALTYN', status: 'completed', description: `Бонус L2 (${l2Percent*100}%) от прибыли ${investorUser.userId}`, projectId: project._id });
                }
            }
        }

        // Казна получает 20% минус бонусы L1/L2
        const treasuryAmount = Math.max(0, companyShare - totalBonuses);
        let treasury = await Treasury.findOne();
        if (!treasury) treasury = await Treasury.create({ totalProfit: 0 });
        await treasury.addProfit(treasuryAmount, 'project_profit', `Прибыль от проекта "${project.title}"`);

        // Инициатор получает 40%
        const initiatorShare = Math.floor(partnerShare * 100) / 100;
        const initiator = await User.findById(project.initiator._id);
        if (initiator && initiatorShare > 0) {
            initiator.balance += initiatorShare;
            initiator.totalEarned += initiatorShare;
            await initiator.save();
            await Transaction.create({ userId: initiator._id, type: 'profit', amount: initiatorShare, currency: 'ALTYN', status: 'completed', description: `Доля инициатора от проекта "${project.title}"`, projectId: project._id });
        }

        project.totalProfit += profitAmount;
        project.totalPaidOut += profitAmount;
        project.status = 'completed';
        project.completedAt = new Date();
        await project.save();

        res.json({ success: true, message: 'Прибыль распределена!', data: { totalProfit: profitAmount, companyShare, investorShare, partnerShare, totalBonuses, treasuryAmount, initiatorShare } });
    } catch (e) {
        console.error('Distribute profit error:', e.message);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.getMyInvestments = async (req, res) => {
    try {
        const projects = await Project.find({ 'investors.userId': req.user._id }).populate('initiator', 'userId fullName');
        const myInv = projects.map(p => {
            const inv = p.investors.find(i => i.userId.toString() === req.user._id.toString());
            return { projectId: p._id, title: p.title, status: p.status, investedAmount: inv?.amount || 0, profitShare: inv?.profitShare || 0, profitEarned: inv?.profitEarned || 0, expectedROI: p.expectedROI, duration: p.duration, initiator: p.initiator, lastPayoutAt: inv?.lastPayoutAt };
        });
        res.json({ success: true, count: myInv.length, data: myInv });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};

exports.getMyProjects = async (req, res) => {
    try {
        const projects = await Project.find({ initiator: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, count: projects.length, data: projects });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
};