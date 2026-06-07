const mongoose = require('mongoose');
const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    relatedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: ['registration', 'deposit', 'withdrawal', 'activation', 'activation_bonus_l1', 'activation_bonus_l2', 'investment', 'profit', 'partner_bonus_l1', 'partner_bonus_l2', 'fee', 'transfer', 'correction'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'ALTYN' },
    amountALTYN: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'pending' },
    description: { type: String, default: '' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    balanceBefore: { type: Number, default: 0 },
    balanceAfter: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: ['bank_transfer', 'crypto', 'internal', 'system'], default: 'system' }
}, { timestamps: true });
TransactionSchema.index({ userId: 1, type: 1 });
TransactionSchema.index({ createdAt: -1 });
module.exports = mongoose.model('Transaction', TransactionSchema);