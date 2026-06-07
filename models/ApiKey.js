const mongoose = require('mongoose');
const crypto = require('crypto');

const ApiKeySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    key: { type: String, unique: true },
    secret: { type: String, select: false },
    permissions: [{ 
        type: String, 
        enum: ['read_projects', 'read_balance', 'read_transactions', 'create_investment', 'webhook'] 
    }],
    ipWhitelist: [String],
    rateLimit: { type: Number, default: 100 },
    lastUsedAt: Date,
    isActive: { type: Boolean, default: true },
    expiresAt: Date
}, { timestamps: true });

ApiKeySchema.pre('save', function(next) {
    if (this.isNew) {
        this.key = 'dibp_' + crypto.randomBytes(16).toString('hex');
        this.secret = crypto.randomBytes(32).toString('hex');
    }
    next();
});

ApiKeySchema.index({ key: 1 });
ApiKeySchema.index({ userId: 1 });

module.exports = mongoose.model('ApiKey', ApiKeySchema);