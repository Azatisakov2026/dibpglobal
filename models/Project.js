const mongoose = require('mongoose');
const ProjectSchema = new mongoose.Schema({
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 5000 },
    shortDescription: { type: String, maxlength: 300, default: '' },
    category: { type: String, enum: ['technology', 'real_estate', 'trading', 'agriculture', 'energy', 'education', 'healthcare', 'other'], default: 'other' },
    targetAmount: { type: Number, required: true, min: 100 },
    collectedAmount: { type: Number, default: 0 },
    minInvestment: { type: Number, default: 1 },
    maxInvestment: { type: Number, default: 0 },
    expectedROI: { type: Number, required: true, min: 1, max: 1000 },
    duration: { type: Number, required: true, min: 1, max: 3650 },
    status: { type: String, enum: ['draft', 'pending', 'active', 'funded', 'in_progress', 'completed', 'cancelled', 'failed'], default: 'draft' },
    riskLevel: { type: String, enum: ['low', 'medium', 'high', 'very_high'], default: 'medium' },
    initiator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    investors: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        amount: Number,
        profitShare: Number,
        profitEarned: { type: Number, default: 0 },
        investedAt: { type: Date, default: Date.now },
        lastPayoutAt: Date
    }],
    totalInvestors: { type: Number, default: 0 },
    profitDistribution: { companyShare: { type: Number, default: 20 }, investorShare: { type: Number, default: 40 }, partnerShare: { type: Number, default: 40 } },
    totalProfit: { type: Number, default: 0 },
    totalPaidOut: { type: Number, default: 0 },
    fundraisingDeadline: { type: Date, default: () => new Date(Date.now() + 30*24*60*60*1000) },
    tags: [String]
}, { timestamps: true, toJSON: { virtuals: true } });
ProjectSchema.virtual('fundingProgress').get(function() {
    if (!this.targetAmount) return 0;
    return Math.min(100, ((this.collectedAmount / this.targetAmount) * 100).toFixed(2));
});
ProjectSchema.virtual('remainingAmount').get(function() {
    return Math.max(0, this.targetAmount - this.collectedAmount);
});
module.exports = mongoose.model('Project', ProjectSchema);