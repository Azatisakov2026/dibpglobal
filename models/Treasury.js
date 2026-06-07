const mongoose = require('mongoose');
const TreasurySchema = new mongoose.Schema({
    totalProfit: { type: Number, default: 0 },
    activationProfit: { type: Number, default: 0 },
    feeProfit: { type: Number, default: 0 },
    projectProfit: { type: Number, default: 0 },
    totalActivations: { type: Number, default: 0 },
    history: [{ amount: Number, source: { type: String, enum: ['activation', 'fee', 'project_profit', 'other'] }, description: String, date: { type: Date, default: Date.now } }]
}, { timestamps: true });
TreasurySchema.methods.addProfit = async function(amount, source, desc) {
    this.totalProfit += amount;
    if (source === 'activation') { this.activationProfit += amount; this.totalActivations++; }
    if (source === 'fee') this.feeProfit += amount;
    if (source === 'project_profit') this.projectProfit += amount;
    this.history.push({ amount, source, description: desc || `Поступление: ${source}` });
    await this.save();
};
module.exports = mongoose.model('Treasury', TreasurySchema);