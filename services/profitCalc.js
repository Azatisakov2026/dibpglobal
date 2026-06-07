const calculateDistribution = (profitAmount, investorSharePercent, partnerStatus) => {
    const companyShare = profitAmount * 0.10;
    const investorShare = profitAmount * 0.45;
    const partnerPool = profitAmount * 0.45;

    const l1BonusPercent = partnerStatus === 'vip_partner' ? 5 : partnerStatus === 'partner_leader' ? 4 : 0;
    const l2BonusPercent = partnerStatus === 'vip_partner' ? 2.5 : partnerStatus === 'partner_leader' ? 2 : 0;

    return { companyShare, investorShare, partnerPool, l1BonusPercent, l2BonusPercent, formula: '10% / 45% / 45%' };
};

module.exports = { calculateDistribution };