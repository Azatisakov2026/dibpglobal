const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    fullName: { type: String, required: true, trim: true },
    avatar: { type: String, default: 'default.png' },
    phone: { type: String, default: '' },
    country: { type: String, default: '' },
    city: { type: String, default: '' },
    address: { type: String, default: '' },
    isActivated: { type: Boolean, default: false },
    activationDate: Date,
    role: { type: String, enum: ['user', 'investor', 'business_partner', 'admin'], default: 'user' },
    partnerStatus: { type: String, enum: ['none', 'partner_leader', 'vip_partner'], default: 'none' },
    balance: { type: Number, default: 0, min: 0 },
    frozenBalance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    sponsorId: { type: String, default: null },
    sponsorL1: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sponsorL2: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralLink: { type: String, unique: true, sparse: true },
    directPartners: { type: Number, default: 0 },
    totalPartners: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    verificationDocuments: [{
        type: { type: String, enum: ['passport', 'id_card', 'driver_license'] },
        documentNumber: String,
        documentImage: String,
        verifiedAt: Date
    }],
    heir: {
        fullName: { type: String, default: '' },
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        relationship: { type: String, default: '' },
        documentNumber: { type: String, default: '' }
    },
    twoFactorEnabled: { type: Boolean, default: false },
    lastLogin: Date,
    language: { type: String, enum: ['ru', 'en', 'zh', 'kg', 'uz'], default: 'ru' }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Генерация ID
UserSchema.pre('save', async function(next) {
    if (this.isNew) {
        const last = await mongoose.model('User').findOne().sort({ createdAt: -1 });
        let num = 1000;
        if (last && last.userId) {
            const match = last.userId.match(/DIBP-(\d+)/);
            if (match) num = parseInt(match[1]) + 1;
        }
        this.userId = `DIBP-${num}`;
        this.referralLink = `https://dibp-global.com/ref/${this.userId}`;
    }
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 12);
    }
    next();
});

// Спонсоры при создании
UserSchema.pre('save', async function(next) {
    if (this.isNew && this.sponsorId) {
        const Sponsor = this.constructor;
        const sponsor = await Sponsor.findOne({ userId: this.sponsorId });
        if (sponsor) {
            this.sponsorL1 = sponsor._id;
            await Sponsor.findByIdAndUpdate(sponsor._id, { $inc: { directPartners: 1, totalPartners: 1 } });
            if (sponsor.sponsorL1) {
                this.sponsorL2 = sponsor.sponsorL1;
                await Sponsor.findByIdAndUpdate(sponsor.sponsorL1, { $inc: { totalPartners: 1 } });
            }
        }
    }
    next();
});

UserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.updatePartnerStatus = async function() {
    if (this.directPartners >= 1000) this.partnerStatus = 'vip_partner';
    else if (this.directPartners >= 1) this.partnerStatus = 'partner_leader';
    else this.partnerStatus = 'none';
    await this.save();
    return this.partnerStatus;
};

UserSchema.virtual('balanceUSD').get(function() {
    return ((this.balance * 78.50) / 1000).toFixed(2);
});

module.exports = mongoose.model('User', UserSchema);