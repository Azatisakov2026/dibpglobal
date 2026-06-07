const mongoose = require('mongoose');
const WithdrawalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ['ALTYN', 'USD', 'USDT', 'BTC', 'ETH'], default: 'ALTYN' },
    fee: { type: Number, default: 5 },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'rejected', 'cancelled'], default: 'pending' },
    walletAddress: { type: String, default: '' },
    bankDetails: { bankName: String, accountNumber: String, swiftCode: String, iban: String, accountHolder: String },
    paymentMethod: { type: String, enum: ['crypto', 'bank_transfer', 'payment_system'], default: 'crypto' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    processedAt: Date,
    adminNote: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    externalTxId: { type: String, default: '' }
}, { timestamps: true });
module.exports = mongoose.model('Withdrawal', WithdrawalSchema);