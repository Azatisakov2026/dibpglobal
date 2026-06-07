const mongoose = require('mongoose');

const VerificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { 
        type: String, 
        enum: ['not_submitted', 'pending', 'approved', 'rejected'], 
        default: 'not_submitted' 
    },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    country: { type: String, default: '' },
    documentType: { 
        type: String, 
        enum: ['passport', 'id_card', 'driver_license'], 
        required: true 
    },
    documentNumber: { type: String, required: true },
    documentFront: { type: String, default: '' },
    documentBack: { type: String, default: '' },
    selfieWithDocument: { type: String, default: '' },
    submittedAt: { type: Date, default: Date.now },
    approvedAt: Date,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: '' }
}, { timestamps: true });

VerificationSchema.index({ userId: 1 });
VerificationSchema.index({ status: 1 });

module.exports = mongoose.model('Verification', VerificationSchema);