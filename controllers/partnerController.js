const User = require('../models/User');
const Transaction = require('../models/Transaction');

exports.getPartnerStats = async (req, res) => {
    try {
        const user = req.user;
        const l1Partners = await User.find({ sponsorId: user.userId }).select('userId fullName email isActivated partnerStatus balance createdAt');
        const l1Ids = l1Partners.map(p => p.userId);
        const l2Partners = await User.find({ sponsorId: { $in: l1Ids } }).select('userId fullName email isActivated createdAt');

        const bonuses = await Transaction.aggregate([
            { $match: { userId: user._id, type: { $in: ['activation_bonus_l1', 'activation_bonus_l2', 'partner_bonus_l1', 'partner_bonus_l2'] }, status: 'completed' } },
            { $group: { _id: '$type', total: { $sum: '$amount' } } }
        ]);

        const bonusSummary = { activationL1: 0, activationL2: 0, profitL1: 0, profitL2: 0, total: 0 };
        bonuses.forEach(b => { bonusSummary.total += b.total; if (b._id === 'activation_bonus_l1') bonusSummary.activationL1 = b.total; if (b._id === 'activation_bonus_l2') bonusSummary.activationL2 = b.total; if (b._id === 'partner_bonus_l1') bonusSummary.profitL1 = b.total; if (b._id === 'partner_bonus_l2') bonusSummary.profitL2 = b.total; });

        await user.updatePartnerStatus();

        const bonusRates = user.partnerStatus === 'vip_partner' ? { l1Bonus: 5, l2Bonus: 2.5, description: 'VIP Партнёр: 5% с L1, 2.5% с L2' } : user.partnerStatus === 'partner_leader' ? { l1Bonus: 4, l2Bonus: 2, description: 'Партнёр-Лидер: 4% с L1, 2% с L2' } : { l1Bonus: 0, l2Bonus: 0, description: 'Привлеките партнёров для получения бонусов' };

        const toVIP = Math.max(0, 1000 - user.directPartners);

        res.json({ success: true, data: { partnerStatus: user.partnerStatus, referralLink: user.referralLink, referralId: user.userId, l1Count: l1Partners.length, l2Count: l2Partners.length, directPartners: user.directPartners, totalPartners: user.totalPartners, bonusSummary, bonusRates, nextStatus: user.partnerStatus === 'vip_partner' ? null : { name: 'VIP Партнёр', requirement: '1000+ прямых партнёров', current: user.directPartners, remaining: toVIP, progress: Math.min(100, ((user.directPartners / 1000) * 100).toFixed(1)) } } });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
};

exports.getL1Partners = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; const limit = 20; const skip = (page-1)*limit;
        const [partners, total] = await Promise.all([User.find({ sponsorId: req.user.userId }).select('userId fullName email isActivated partnerStatus balance createdAt').sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments({ sponsorId: req.user.userId })]);
        res.json({ success: true, count: partners.length, total, page, totalPages: Math.ceil(total/limit), data: partners });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
};

exports.getL2Partners = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; const limit = 20; const skip = (page-1)*limit;
        const l1Ids = await User.find({ sponsorId: req.user.userId }).distinct('userId');
        const [partners, total] = await Promise.all([User.find({ sponsorId: { $in: l1Ids } }).select('userId fullName email isActivated sponsorId createdAt').sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments({ sponsorId: { $in: l1Ids } })]);
        const enriched = await Promise.all(partners.map(async p => { const sponsor = await User.findOne({ userId: p.sponsorId }).select('userId fullName'); return { ...p.toObject(), directSponsor: sponsor ? { userId: sponsor.userId, fullName: sponsor.fullName } : null }; }));
        res.json({ success: true, count: enriched.length, total, page, totalPages: Math.ceil(total/limit), data: enriched });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
};

exports.getReferralLink = async (req, res) => {
    try {
        res.json({ success: true, data: { referralLink: req.user.referralLink, referralId: req.user.userId, qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(req.user.referralLink || '')}` } });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
};

exports.getMarketingPlan = async (req, res) => {
    res.json({ success: true, data: { currency: 'ALTYN', description: '1 ALTYN = 1 мг золота', activation: { cost: 1000, distribution: { sponsorL1: 200, sponsorL2: 100, companyTreasury: 700 } }, statuses: [{ name: 'Партнёр-Лидер', icon: '🌟', condition: '1+ лично привлечённых партнёров-инвесторов', bonuses: { fromPartnerProfit: '4% от прибыли инвестиций партнёра', fromSubPartnerProfit: '2% от прибыли инвестиций субпартнёра' } }, { name: 'VIP Партнёр', icon: '⭐', condition: '1000+ лично привлечённых партнёров-инвесторов', bonuses: { fromPartnerProfit: '5% от прибыли инвестиций партнёра', fromSubPartnerProfit: '2.5% от прибыли инвестиций субпартнёра' }, privileges: ['Максимальные привилегии', 'Приоритетная поддержка', 'Участие в VIP-проектах'] }], profitFormula: { description: 'Распределение прибыли проекта', companyShare: '10%', investorShare: '45%', partnerPool: '45% (бонусы L1, L2 + инициатор проекта)' } } });
};