require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { getGoldRate, getSilverRate, getALTYNprice } = require('./services/goldRate');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dibp_global';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: function(res, path) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

// Логирование запросов
app.use((req, res, next) => {
    console.log(req.method, req.url);
    next();
});

// Создание папок
['public/uploads/kyc', 'public/uploads/projects', 'public/uploads/avatars', 'backups'].forEach(dir => {
    const p = path.join(__dirname, dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Multer
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads/kyc')),
        filename: (req, file, cb) => cb(null, 'kyc-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
    }),
    limits: { fileSize: 5 * 1024 * 1024 }
});

// ============ МОДЕЛИ ============
const userSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    fullName: String, avatar: { type: String, default: '' },
    phone: { type: String, default: '' }, country: { type: String, default: '' },
    gender: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    balance: { type: Number, default: 0 }, frozenBalance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    isActivated: { type: Boolean, default: false }, activationDate: Date,
    role: { type: String, default: 'user' },
    partnerStatus: { type: String, default: 'none' },
    sponsorId: String, sponsorL1: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sponsorL2: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    referralLink: String, directPartners: { type: Number, default: 0 },
    totalPartners: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false }, kycVerified: { type: Boolean, default: false },
    lastLogin: Date, language: { type: String, default: 'ru' },
    loginAttempts: { type: Number, default: 0 }, lockUntil: Date,
    heir: {
        fullName: { type: String, default: '' }, email: { type: String, default: '' },
        phone: { type: String, default: '' }, relationship: { type: String, default: '' }
    }
}, { timestamps: true, toJSON: { virtuals: true } });

userSchema.pre('save', async function(next) {
    if (this.isNew) {
        const last = await mongoose.model('User').findOne().sort({ createdAt: -1 });
        let num = 1000;
        if (last && last.userId) { const m = last.userId.match(/DIBP-(\d+)/); if (m) num = parseInt(m[1]) + 1; }
        this.userId = 'DIBP-' + num;
        this.referralLink = 'https://dibp.net/ref/' + this.userId;
    }
    if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
    next();
});

userSchema.pre('save', async function(next) {
    if (this.isNew && this.sponsorId) {
        const sponsor = await mongoose.model('User').findOne({ userId: this.sponsorId });
        if (sponsor) {
            this.sponsorL1 = sponsor._id;
            await mongoose.model('User').findByIdAndUpdate(sponsor._id, { $inc: { directPartners: 1, totalPartners: 1 } });
            if (sponsor.sponsorL1) {
                this.sponsorL2 = sponsor.sponsorL1;
                await mongoose.model('User').findByIdAndUpdate(sponsor.sponsorL1, { $inc: { totalPartners: 1 } });
            }
        }
    }
    next();
});

userSchema.methods.comparePassword = async function(pwd) { return await bcrypt.compare(pwd, this.password); };
userSchema.virtual('balanceUSD').get(function() { return ((this.balance * 78.50) / 1000).toFixed(2); });
const User = mongoose.model('User', userSchema);

// Withdrawal
const withdrawalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: Number, fee: { type: Number, default: 5 }, currency: { type: String, default: 'ALTYN' },
    walletAddress: String, status: { type: String, enum: ['pending', 'processing', 'completed', 'rejected', 'cancelled'], default: 'pending' },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    processedAt: Date, adminNote: String, rejectionReason: String, externalTxId: String
}, { timestamps: true });
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

// Transaction
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    relatedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, required: true },
    amount: Number, currency: { type: String, default: 'ALTYN' }, amountALTYN: Number,
    status: { type: String, default: 'completed' },
    description: String, projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    balanceBefore: Number, balanceAfter: Number,
    paymentMethod: { type: String, default: 'system' }, externalTxId: String
}, { timestamps: true });
transactionSchema.index({ userId: 1, createdAt: -1 });
const Transaction = mongoose.model('Transaction', transactionSchema);

// Project
const projectSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    shortDescription: String,
    location: { type: String, default: '' },
    category: { type: String, default: 'other' },
    targetAmount: { type: Number, required: true },
    collectedAmount: { type: Number, default: 0 },
    minInvestment: { type: Number, default: 10 },
    expectedROI: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'pending', 'active', 'funded', 'completed', 'cancelled'], default: 'pending' },
    phase: { type: Number, default: 1 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    initiator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    investors: [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, amount: Number, profitEarned: { type: Number, default: 0 }, investedAt: { type: Date, default: Date.now }, lastPayoutAt: Date }],
    totalInvestors: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    totalPaidOut: { type: Number, default: 0 },
    videoUrl: { type: String, default: '' },
	projectNumber: { type: String },
    fullDescription: { type: String, default: '' },
    images: [String],
    tags: [String],
    fundraisingDeadline: { type: Date, default: () => new Date(Date.now() + 30*24*60*60*1000) }
}, { timestamps: true, toJSON: { virtuals: true } });
projectSchema.virtual('fundingProgress').get(function() {
    if (!this.targetAmount) return 0;
    return Math.min(100, ((this.collectedAmount / this.targetAmount) * 100).toFixed(2));
});
const Project = mongoose.model('Project', projectSchema);

// Verification (KYC)
const verificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: ['not_submitted', 'pending', 'approved', 'rejected'], default: 'not_submitted' },
    firstName: String, lastName: String, country: String,
    documentType: { type: String, enum: ['passport', 'id_card', 'driver_license'] },
    documentNumber: String,
    documentFront: String, documentBack: String, selfieWithDocument: String,
    submittedAt: Date, approvedAt: Date,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: String
}, { timestamps: true });
const Verification = mongoose.model('Verification', verificationSchema);

// Treasury
const treasurySchema = new mongoose.Schema({
    totalProfit: { type: Number, default: 0 },
    activationProfit: { type: Number, default: 0 },
    feeProfit: { type: Number, default: 0 },
    projectProfit: { type: Number, default: 0 },
    totalActivations: { type: Number, default: 0 },
    history: [{ amount: Number, source: String, description: String, date: { type: Date, default: Date.now } }]
}, { timestamps: true });
treasurySchema.methods.addProfit = async function(amount, source, desc) {
    this.totalProfit += amount;
    if (source === 'activation') { this.activationProfit += amount; this.totalActivations++; }
    if (source === 'fee') this.feeProfit += amount;
    if (source === 'project_profit') this.projectProfit += amount;
    this.history.push({ amount, source, description: desc || source });
    await this.save();
};
const Treasury = mongoose.model('Treasury', treasurySchema);

const projectTreasurySchema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
    balance: { type: Number, default: 0 },
    totalInvested: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    history: [{
        type: { type: String, enum: ['investment', 'withdrawal', 'profit', 'refund'] },
        amount: Number,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        description: String,
        date: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

const ProjectTreasury = mongoose.model('ProjectTreasury', projectTreasurySchema);

// AdminLog
const adminLogSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: String,
    targetId: { type: mongoose.Schema.Types.ObjectId },
    targetModel: String,
    details: String,
    ipAddress: String
}, { timestamps: true });
const AdminLog = mongoose.model('AdminLog', adminLogSchema);

// SupportTicket
const supportTicketSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: String,
    category: { type: String, default: 'general' },
    status: { type: String, enum: ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'], default: 'open' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    messages: [{
        senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        senderRole: { type: String, default: 'user' },
        message: String,
        readAt: Date,
        createdAt: { type: Date, default: Date.now }
    }],
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date, closedAt: Date, lastReplyAt: Date
}, { timestamps: true });
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

// ApiKey
const apiKeySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: String,
    key: { type: String, unique: true },
    secret: { type: String, select: false },
    permissions: [String],
    ipWhitelist: [String],
    rateLimit: { type: Number, default: 100 },
    lastUsedAt: Date,
    isActive: { type: Boolean, default: true },
    expiresAt: Date
}, { timestamps: true });
const crypto = require('crypto');
apiKeySchema.pre('save', function(next) {
    if (this.isNew) {
        this.key = 'dibp_' + crypto.randomBytes(16).toString('hex');
        this.secret = crypto.randomBytes(32).toString('hex');
    }
    next();
});
const ApiKey = mongoose.model('ApiKey', apiKeySchema);

// ============ EMAIL SERVICE ============
const BREVO_API_KEY = process.env.BREVO_API_KEY || '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';

async function sendEmail(to, subject, html) {
    try {
        const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
            sender: { name: 'DIBP Global', email: 'dibpglobal@gmail.com' },
            to: [{ email: to }],
            subject: subject,
            htmlContent: html
        }, {
            headers: {
                'api-key': BREVO_API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        console.log('📧 Отправлено на', to, 'ID:', response.data.messageId);
        return true;
    } catch (e) {
        console.error('📧 ОШИБКА отправки:', e.response?.data?.message || e.message);
        return false;
    }
}

// ============ TELEGRAM SERVICE ============
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID || '';

async function sendTelegram(text) {
    if (!TELEGRAM_TOKEN) { console.log('📱 Telegram:', text.substring(0, 100)); return; }
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT, text, parse_mode: 'HTML'
        }, { timeout: 5000 });
    } catch (e) { console.error('Telegram error:', e.message); }
}

// ============ BACKUP SERVICE ============
const { exec } = require('child_process');
const BACKUP_DIR = path.join(__dirname, 'backups');

async function createBackup() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const out = path.join(BACKUP_DIR, `backup-${ts}`);
    return new Promise((resolve, reject) => {
        exec(`mongodump --uri="${MONGO_URI}" --out="${out}"`, (err) => {
            if (err) { console.error('Backup error:', err.message); reject(err); }
            else { console.log('✅ Backup:', out); sendTelegram('✅ Бэкап создан: ' + out); resolve({ path: out }); }
        });
    });
}

function listBackups() {
    try {
        return fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup-')).map(f => ({ name: f }));
    } catch (e) { return []; }
}

// ============ ERROR MONITOR ============
const errorLog = [];
function logError(err, loc) {
    console.error(`❌ [${loc}]`, err.message || err);
    errorLog.push({ msg: err.message || String(err), loc, time: new Date().toISOString() });
    if (errorLog.length > 100) errorLog.shift();
}
// ============ ВСПОМОГАТЕЛЬНЫЕ ============
async function getUserFromToken(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.split(' ')[1];
    const parts = token.split('_');
    let user = null;
    if (parts.length >= 2) user = await User.findOne({ userId: parts[1] });
    if (!user && parts.length >= 3) { try { user = await User.findById(parts[2]); } catch (e) {} }
    return user;
}
function genToken(user) { return 'token_' + user.userId + '_' + user._id; }

// ============ AUTH ============
var verificationCodes = {};

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, sponsorId, phone } = req.body;
        if (!fullName || !email || !password) return res.status(400).json({ success: false, message: 'Заполните все поля' });
        if (password.length < 8) return res.status(400).json({ success: false, message: 'Пароль минимум 8 символов' });
        const exists = await User.findOne({ email: email.toLowerCase() });
        if (exists) return res.status(400).json({ success: false, message: 'Email уже зарегистрирован' });
        
        const user = await User.create({ fullName, email: email.toLowerCase(), password, phone: phone || '', sponsorId: sponsorId || null });
        
       var code = Math.floor(100000 + Math.random() * 900000).toString();
verificationCodes[email.toLowerCase()] = { code, expires: Date.now() + 3600000 };
console.log('📧 Код для ' + email + ': ' + code);
console.log('📧 SMTP_HOST:', process.env.SMTP_HOST);
console.log('📧 SMTP_USER:', process.env.SMTP_USER);
var result = await sendEmail(email, 'Код подтверждения', '<h2>Ваш код: <b style="color:#d4af37;font-size:24px;">' + code + '</b></h2>');
console.log('📧 Результат отправки:', result);
sendTelegram('🆕 Новый пользователь: ' + user.fullName + ' (' + user.userId + ') ' + email);
// Уведомление L1 спонсору
if (user.sponsorL1) {
    const l1 = await User.findById(user.sponsorL1);
    if (l1) {
        sendEmail(l1.email, '🎉 Новый партнёр в DIBP Global!', 
            '<h2>У вас новый партнёр!</h2>' +
            '<p><b>' + user.fullName + '</b> (' + user.userId + ') зарегистрировался по вашей реферальной ссылке.</p>' +
            '<p>Когда партнёр активирует аккаунт, вы получите <b style="color:#d4af37;">200 ALTYN</b>.</p>' +
            '<p>Войдите в кабинет: <a href="https://dibp.net">dibp.net</a></p>');
        console.log('📧 Уведомление L1 отправлено: ' + l1.email);
    }
}

// Уведомление L2 спонсору
if (user.sponsorL2) {
    const l2 = await User.findById(user.sponsorL2);
    if (l2) {
        sendEmail(l2.email, '🎉 Новый субпартнёр в DIBP Global!', 
            '<h2>У вас новый субпартнёр!</h2>' +
            '<p><b>' + user.fullName + '</b> (' + user.userId + ') зарегистрировался в вашей сети L2.</p>' +
            '<p>Когда субпартнёр активирует аккаунт, вы получите <b style="color:#d4af37;">100 ALTYN</b>.</p>' +
            '<p>Войдите в кабинет: <a href="https://dibp.net">dibp.net</a></p>');
        console.log('📧 Уведомление L2 отправлено: ' + l2.email);
    }
}
        
        const token = genToken(user);
        res.status(201).json({ success: true, message: 'Код отправлен на почту', data: { userId: user.userId, fullName: user.fullName, email: user.email, balance: 0, isActivated: false, role: 'user', referralLink: user.referralLink, token }, needVerification: true });
    } catch (e) { logError(e, 'register'); res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
});

app.post('/api/auth/verify-code', async (req, res) => {
    const { email, code } = req.body;
    var record = verificationCodes[email.toLowerCase()];
    if (!record) return res.status(400).json({ success: false, message: 'Код не найден' });
    if (Date.now() > record.expires) return res.status(400).json({ success: false, message: 'Код истёк' });
    if (record.code !== code) return res.status(400).json({ success: false, message: 'Неверный код' });
    await User.findOneAndUpdate({ email: email.toLowerCase() }, { isVerified: true });
    delete verificationCodes[email.toLowerCase()];
    res.json({ success: true, message: 'Почта подтверждена!' });
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Введите email и пароль' });
        const user = await User.findOne({ $or: [{ email: email.toLowerCase() }, { userId: email.toUpperCase() }] }).select('+password +loginAttempts +lockUntil');
        if (!user) return res.status(401).json({ success: false, message: 'Неверный email или пароль' });
        if (user.lockUntil && user.lockUntil > Date.now()) {
            return res.status(403).json({ success: false, message: 'Аккаунт заблокирован. Попробуйте позже.' });
        }
        const ok = await user.comparePassword(password);
        if (!ok) {
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= 5) { user.lockUntil = new Date(Date.now() + 30*60*1000); user.loginAttempts = 0; }
            await user.save({ validateBeforeSave: false });
            return res.status(401).json({ success: false, message: 'Неверный пароль. Осталось попыток: ' + (5 - user.loginAttempts) });
        }
        user.loginAttempts = 0; user.lockUntil = null; user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });
        const token = genToken(user);
        res.json({ success: true, data: { userId: user.userId, fullName: user.fullName, email: user.email, balance: user.balance, isActivated: user.isActivated, role: user.role, partnerStatus: user.partnerStatus, referralLink: user.referralLink, token } });
    } catch (e) { logError(e, 'login'); res.status(500).json({ success: false, message: 'Ошибка сервера' }); }
});

app.get('/api/auth/me', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Не авторизован' });
    res.json({ success: true, data: user });
});

app.put('/api/auth/profile', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const updates = {};
    ['fullName', 'phone', 'country', 'heir', 'email', 'language', 'gender', 'dateOfBirth'].forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const updated = await User.findByIdAndUpdate(user._id, { $set: updates }, { new: true });
    res.json({ success: true, data: updated });
});

// ============ FINANCE ============
app.get('/api/finance/rates', async (req, res) => {
    try {
        const [gold, silver] = await Promise.all([getGoldRate(), getSilverRate()]);
        const altynPrice = getALTYNprice(gold.pricePerGram);
        const eurRate = 0.92;
        res.json({
            success: true,
            data: {
                gold: { pricePerGram: parseFloat(gold.pricePerGram.toFixed(2)), pricePerOunce: parseFloat(gold.pricePerOunce.toFixed(2)), currency: 'USD' },
                silver: { pricePerGram: parseFloat(silver.pricePerGram.toFixed(2)), pricePerOunce: parseFloat(silver.pricePerOunce.toFixed(2)), currency: 'USD' },
                altyn: { priceUSD: parseFloat(altynPrice), priceEUR: (parseFloat(altynPrice) * eurRate).toFixed(6), description: '1 ALTYN = 1 мг золота' },
                currencies: { usdToAltyn: (1 / parseFloat(altynPrice)).toFixed(2), eurToAltyn: (1 / (parseFloat(altynPrice) * eurRate)).toFixed(2) },
                updatedAt: new Date().toISOString()
            }
        });
    } catch (e) {
        res.json({ success: true, data: { gold: { pricePerGram: 78.50 } } });
    }
});

app.get('/api/finance/balance', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    res.json({ success: true, data: { balance: user.balance, frozenBalance: user.frozenBalance } });
});

app.post('/api/finance/deposit', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const { amount } = req.body;
    const altyn = Math.floor((amount / 0.0785) * 100) / 100;
    user.balance += altyn;
    await user.save();
    await Transaction.create({ userId: user._id, type: 'deposit', amount: altyn, status: 'completed', description: 'Пополнение +' + altyn + ' ALTYN', balanceAfter: user.balance });
    res.json({ success: true, message: 'Пополнено ' + altyn + ' ALTYN' });
});

// ============ АКТИВАЦИЯ ============
var activationCodes = {};

// Шаг 1: Запрос активации — отправка кода
app.post('/api/finance/activate', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    if (user.isActivated) return res.status(400).json({ success: false, message: 'Уже активирован' });
    if (user.balance < 1000) return res.status(400).json({ success: false, message: 'Недостаточно средств. Нужно 1000 ALTYN' });
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    activationCodes[user.userId] = { code, expires: Date.now() + 600000 };
    
    sendEmail(user.email, 'Код подтверждения активации', 
        '<h2>Код подтверждения:</h2><h1 style="color:#d4af37;font-size:32px;">' + code + '</h1><p>Сумма: 1000 ALTYN</p><p>Код действителен 10 минут.</p>');
    console.log('📧 Код активации для ' + user.email + ': ' + code);
    
    res.json({ success: true, message: 'Код отправлен на почту', needCode: true });
});

// Шаг 2: Подтверждение активации
app.post('/api/finance/activate-confirm', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    if (user.isActivated) return res.status(400).json({ success: false, message: 'Уже активирован' });
    
    const { code } = req.body;
    const record = activationCodes[user.userId];
    if (!record || Date.now() > record.expires) return res.status(400).json({ success: false, message: 'Код недействителен или истёк' });
    if (record.code !== code) return res.status(400).json({ success: false, message: 'Неверный код' });
    
    if (user.balance < 1000) return res.status(400).json({ success: false, message: 'Недостаточно средств. Нужно 1000 ALTYN' });
    
    const balanceBefore = user.balance;
    user.balance -= 1000;
    user.isActivated = true;
    user.activationDate = new Date();
    user.role = 'investor';
    if (user.directPartners >= 1) user.partnerStatus = 'partner_leader';
    await user.save();
    
    await Transaction.create({ userId: user._id, type: 'activation', amount: -1000, description: 'Активация аккаунта', balanceBefore, balanceAfter: user.balance });
    
    // Распределение 1000 ALTYN
    let treasuryAmount = 1000;
    
    if (user.sponsorL1) {
        const l1 = await User.findById(user.sponsorL1);
        if (l1 && l1.isActivated) {
            l1.balance += 200;
            l1.totalEarned += 200;
            await l1.save();
            treasuryAmount -= 200;
            await Transaction.create({ userId: l1._id, type: 'activation_bonus_l1', amount: 200, description: 'Бонус за активацию партнёра ' + user.userId });
            
            // Уведомление L1 о бонусе
            sendEmail(l1.email, '💰 Бонус за активацию партнёра!', 
                '<h2>Вы получили бонус!</h2>' +
                '<p><b>+200 ALTYN</b> зачислено на ваш баланс за активацию партнёра <b>' + user.fullName + '</b> (' + user.userId + ').</p>' +
                '<p>Войдите в кабинет: <a href="https://dibp.net">dibp.net</a></p>');
        }
    }
    
    if (user.sponsorL2) {
        const l2 = await User.findById(user.sponsorL2);
        if (l2 && l2.isActivated) {
            l2.balance += 100;
            l2.totalEarned += 100;
            await l2.save();
            treasuryAmount -= 100;
            await Transaction.create({ userId: l2._id, type: 'activation_bonus_l2', amount: 100, description: 'Бонус за субпартнёра ' + user.userId });
            
            // Уведомление L2 о бонусе
            sendEmail(l2.email, '💰 Бонус за активацию субпартнёра!', 
                '<h2>Вы получили бонус!</h2>' +
                '<p><b>+100 ALTYN</b> зачислено на ваш баланс за активацию субпартнёра <b>' + user.fullName + '</b> (' + user.userId + ').</p>' +
                '<p>Войдите в кабинет: <a href="https://dibp.net">dibp.net</a></p>');
        }
    }
    
    let treasury = await Treasury.findOne();
    if (!treasury) treasury = await Treasury.create({ totalProfit: 0 });
    await treasury.addProfit(treasuryAmount, 'activation', 'Активация ' + user.userId);
    
    sendTelegram('🔓 Активирован: ' + user.fullName + ' (' + user.userId + ')');
    
    delete activationCodes[user.userId];
    res.json({ success: true, message: 'Активирован!', data: { balance: user.balance, isActivated: true } });
});

// ============ ВЫВОД СРЕДСТВ ============
var withdrawCodes = {};

// Шаг 1: Запрос вывода — отправка кода
app.post('/api/finance/withdraw', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    if (!user.isActivated) return res.status(403).json({ success: false, message: 'Требуется активация' });
    if (!user.kycVerified) return res.status(403).json({ success: false, message: 'Требуется KYC верификация' });
    
    const { amount, walletAddress } = req.body;
    if (!amount || amount < 6) return res.status(400).json({ success: false, message: 'Минимум 6 ALTYN' });
    const total = amount + 5;
    if (user.balance < total) return res.status(400).json({ success: false, message: 'Недостаточно средств' });
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    withdrawCodes[user.userId] = { code, amount, walletAddress: walletAddress || '', expires: Date.now() + 600000 };
    
    sendEmail(user.email, 'Код подтверждения вывода', 
        '<h2>Код подтверждения вывода:</h2><h1 style="color:#d4af37;font-size:32px;">' + code + '</h1><p>Сумма: ' + amount + ' ALTYN</p><p>Код действителен 10 минут.</p>');
    console.log('📧 Код вывода для ' + user.email + ': ' + code);
    
    res.json({ success: true, message: 'Код отправлен на почту', needCode: true });
});

// Шаг 2: Подтверждение вывода
app.post('/api/finance/withdraw-confirm', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    
    const { code } = req.body;
    const record = withdrawCodes[user.userId];
    if (!record || Date.now() > record.expires) return res.status(400).json({ success: false, message: 'Код недействителен или истёк' });
    if (record.code !== code) return res.status(400).json({ success: false, message: 'Неверный код' });
    
    const total = record.amount + 5;
    if (user.balance < total) return res.status(400).json({ success: false, message: 'Недостаточно средств' });
    
    const balanceBefore = user.balance;
    user.balance -= total;
    await user.save();
    
    // Создаём заявку на вывод
    await Withdrawal.create({ userId: user._id, amount: record.amount, fee: 5, walletAddress: record.walletAddress });
    
    // Транзакция: списание суммы + комиссии
    await Transaction.create({ 
        userId: user._id, 
        type: 'withdrawal', 
        amount: -total, 
        description: 'Вывод ' + record.amount + ' ALTYN (комиссия 5 ALTYN)', 
        balanceBefore: balanceBefore,
        balanceAfter: user.balance 
    });
    
    // Начисляем комиссию в казну
    let treasury = await Treasury.findOne();
    if (!treasury) treasury = await Treasury.create({ totalProfit: 0 });
    await treasury.addProfit(5, 'fee', 'Комиссия за вывод ' + record.amount + ' ALTYN от ' + user.userId);
    
    console.log('💰 Комиссия 5 ALTYN зачислена в казну. Баланс казны: ' + treasury.totalProfit);
    
    sendTelegram('💰 Заявка на вывод: ' + user.fullName + ' — ' + record.amount + ' ALTYN (комиссия 5)');
    
    delete withdrawCodes[user.userId];
    res.json({ success: true, message: 'Заявка создана. Спишется: ' + total + ' ALTYN (включая комиссию 5)', data: { balance: user.balance } });
});

app.get('/api/finance/transactions', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
        Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Transaction.countDocuments({ userId: user._id })
    ]);
    res.json({ success: true, data: transactions, page, total, totalPages: Math.ceil(total / limit) });
});

// ============ ПЕРЕВОД ============
var transferCodes = {};

app.post('/api/finance/transfer', async (req, res) => {
    const sender = await getUserFromToken(req);
    if (!sender || !sender.isActivated) return res.status(403).json({ success: false, message: 'Требуется активация' });
    const { recipientId, amount } = req.body;
    if (!recipientId || !amount || amount < 1) return res.status(400).json({ success: false, message: 'Укажите получателя и сумму' });
    if (sender.balance < amount + 5) return res.status(400).json({ success: false, message: 'Недостаточно средств' });
    
    const recipient = await User.findOne({ userId: recipientId.toUpperCase() });
    if (!recipient || recipient.userId === sender.userId) return res.status(400).json({ success: false, message: 'Некорректный получатель' });
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    transferCodes[sender.userId] = { code, recipientId: recipient.userId, recipient_id: recipient._id, amount, expires: Date.now() + 600000 };
    
    sendEmail(sender.email, 'Код подтверждения перевода', '<h2>Код: <b style="color:#d4af37;font-size:24px;">' + code + '</b></h2>');
    console.log('📧 Код перевода: ' + code);
    res.json({ success: true, message: 'Код отправлен', needCode: true });
});

app.post('/api/finance/transfer-confirm', async (req, res) => {
    const sender = await getUserFromToken(req);
    if (!sender) return res.status(401).json({ success: false });
    const { code } = req.body;
    const record = transferCodes[sender.userId];
    if (!record || Date.now() > record.expires) return res.status(400).json({ success: false, message: 'Код недействителен' });
    if (record.code !== code) return res.status(400).json({ success: false, message: 'Неверный код' });
    
    const recipient = await User.findById(record.recipient_id);
    const total = record.amount + 5;
    sender.balance -= total;
    recipient.balance += record.amount;
    await sender.save();
    await recipient.save();
    
    await Transaction.create({ userId: sender._id, type: 'transfer', amount: -total, description: 'Перевод ' + record.amount + ' ALTYN → ' + recipient.userId, balanceAfter: sender.balance });
    await Transaction.create({ userId: recipient._id, type: 'transfer', amount: record.amount, description: 'Поступление от ' + sender.userId, balanceAfter: recipient.balance });
    
    // Комиссия в казну
    let treasury = await Treasury.findOne();
    if (!treasury) treasury = await Treasury.create({ totalProfit: 0 });
    await treasury.addProfit(5, 'fee', 'Комиссия за перевод от ' + sender.userId + ' → ' + recipient.userId);
    
    delete transferCodes[sender.userId];
    res.json({ success: true, message: 'Перевод выполнен!' });
});

// ============ ПРОЕКТЫ ============
app.get('/api/project-detail/:id', async (req, res) => {
    try {
        const id = req.params.id;
        
        // 1. Сначала ищем HTML-файл
        const htmlPath = path.join(__dirname, 'data', 'projects', id + '.html');
        if (fs.existsSync(htmlPath)) {
            const html = fs.readFileSync(htmlPath, 'utf-8');
            return res.json({ success: true, data: { fullDescription: html } });
        }
        
        // 2. Ищем в MongoDB
        let project = null;
        if (id.startsWith('DIBP-')) {
            project = await Project.findOne({ projectNumber: id }).populate('initiator', 'userId');
        }
        if (!project) {
            try { project = await Project.findById(id).populate('initiator', 'userId'); } catch(e) {}
        }
        
        if (project) {
            return res.json({ success: true, data: {
                _id: project._id.toString(),
                projectNumber: project.projectNumber || project._id.toString(),
                initiator: project.initiator ? { userId: project.initiator.userId } : null,
                title: project.title,
                description: project.description,
                fullDescription: project.fullDescription || ('<h3>О проекте</h3><p>' + (project.description || '') + '</p>'),
                location: project.location || '',
                category: project.category || '',
                targetAmount: project.targetAmount,
                collectedAmount: project.collectedAmount,
                expectedROI: project.expectedROI,
                status: project.status,
                phase: project.phase,
                riskLevel: project.riskLevel,
                totalInvestors: project.totalInvestors,
                images: project.images || [],
                videoUrl: project.videoUrl || ''
            }});
        }
        
        res.status(404).json({ success: false, message: 'Проект не найден' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    }
});

app.get('/api/projects', async (req, res) => {
    const { q, category, riskLevel, page = 1, limit = 12 } = req.query;
    const filter = { status: { $in: ['active', 'funded'] } };
    if (q) filter.$or = [{ title: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }];
    if (category) filter.category = category;
    if (riskLevel) filter.riskLevel = riskLevel;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [projects, total] = await Promise.all([
        Project.find(filter).populate('initiator', 'userId fullName').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).select('-investors'),
        Project.countDocuments(filter)
    ]);
    
    if (!projects.length && !q) {
        return res.json({ success: true, data: [
            { _id: 'p1', title: 'Солнечная ферма', expectedROI: 25, fundingProgress: 65, targetAmount: 50000, collectedAmount: 32500, status: 'active', initiator: { fullName: 'DIBP Global' } },
            { _id: 'p2', title: 'IT Стартап AI', expectedROI: 40, fundingProgress: 30, targetAmount: 25000, collectedAmount: 7500, status: 'active', initiator: { fullName: 'DIBP Global' } },
            { _id: 'p3', title: 'Агрокомплекс', expectedROI: 18, fundingProgress: 85, targetAmount: 15000, collectedAmount: 12750, status: 'active', initiator: { fullName: 'DIBP Global' } }
        ]});
    }
    res.json({ success: true, data: projects, page: parseInt(page), total, totalPages: Math.ceil(total / parseInt(limit)) });
});

app.get('/api/projects/:id', async (req, res) => {
    const project = await Project.findById(req.params.id).populate('initiator', 'userId fullName').populate('investors.userId', 'userId fullName');
    if (!project) return res.status(404).json({ success: false, message: 'Проект не найден' });
    res.json({ success: true, data: project });
});

app.post('/api/projects/create', upload.array('images', 5), async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user || !user.isActivated) return res.status(403).json({ success: false, message: 'Требуется активация' });
    const { title, description, targetAmount, expectedROI, category, riskLevel, location } = req.body;
    if (!title || !description || !targetAmount || !expectedROI) return res.status(400).json({ success: false, message: 'Заполните все поля' });
    
    // Генерируем номер из базы данных
    const lastProject = await Project.findOne({ projectNumber: { $exists: true } }).sort({ createdAt: -1 });
    let nextNum = 1;
    if (lastProject && lastProject.projectNumber) {
        nextNum = parseInt(lastProject.projectNumber.replace('DIBP-', '')) + 1;
    }
    const projectId = 'DIBP-' + String(nextNum).padStart(4, '0');
    
    // Сохраняем в MongoDB
    const project = await Project.create({ 
        title, 
        description, 
        shortDescription: description.substring(0, 200), 
        targetAmount, 
        expectedROI, 
        category: category || 'other', 
        riskLevel: riskLevel || 'medium', 
        location: location || '', 
        videoUrl: req.body.videoUrl || '',
        images: (req.files || []).map(f => '/uploads/projects/' + f.filename),
        projectNumber: projectId,
        initiator: user._id 
    });
    
    sendTelegram('📁 Новый проект: ' + title + ' (' + projectId + ') от ' + user.fullName);
    res.status(201).json({ success: true, data: project, projectNumber: projectId });
});

// ============ ИНВЕСТИРОВАНИЕ ============
var investCodes = {};

// Шаг 1: Запрос инвестиции — отправка кода
app.post('/api/projects/:id/invest', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user || !user.isActivated) return res.status(403).json({ success: false });
    const project = await Project.findById(req.params.id);
    if (!project || project.status !== 'active') return res.status(400).json({ success: false, message: 'Проект недоступен' });
    
    const { amount } = req.body;
    if (!amount || amount < project.minInvestment) return res.status(400).json({ success: false, message: 'Минимум ' + project.minInvestment + ' ALTYN' });
    if (user.balance < amount) return res.status(400).json({ success: false, message: 'Недостаточно средств' });
    const remaining = project.targetAmount - project.collectedAmount;
    if (amount > remaining) return res.status(400).json({ success: false, message: 'Максимальная сумма инвестиции: ' + remaining + ' ALTYN. Проект почти собрал цель.' });
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    investCodes[user.userId] = { code, projectId: project._id, amount, expires: Date.now() + 600000 };
    
    sendEmail(user.email, 'Код подтверждения инвестиции', 
        '<h2>Код подтверждения:</h2><h1 style="color:#d4af37;font-size:32px;">' + code + '</h1><p>Проект: ' + project.title + '</p><p>Сумма: ' + amount + ' ALTYN</p><p>Код действителен 10 минут.</p>');
    console.log('📧 Код инвестиции для ' + user.email + ': ' + code);
    
    res.json({ success: true, message: 'Код отправлен на почту', needCode: true, projectTitle: project.title });
});

// Шаг 2: Подтверждение инвестиции
app.post('/api/projects/:id/invest-confirm', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    
    const { code } = req.body;
    const record = investCodes[user.userId];
    if (!record || Date.now() > record.expires) return res.status(400).json({ success: false, message: 'Код недействителен или истёк' });
    if (record.code !== code) return res.status(400).json({ success: false, message: 'Неверный код' });
    if (record.projectId.toString() !== req.params.id) return res.status(400).json({ success: false, message: 'Неверный проект' });
    
    const project = await Project.findById(record.projectId);
    if (!project || project.status !== 'active') return res.status(400).json({ success: false, message: 'Проект недоступен' });
    if (user.balance < record.amount) return res.status(400).json({ success: false, message: 'Недостаточно средств' });
    
    // Списываем с пользователя
    user.balance -= record.amount;
    await user.save();
    
    // Отправляем в казну проекта
    let projectTreasury = await ProjectTreasury.findOne({ projectId: project._id });
    if (!projectTreasury) {
        projectTreasury = await ProjectTreasury.create({ projectId: project._id, balance: 0 });
    }
    projectTreasury.balance += record.amount;
    projectTreasury.totalInvested += record.amount;
    projectTreasury.history.push({
        type: 'investment',
        amount: record.amount,
        userId: user._id,
        description: 'Инвестиция от ' + user.userId
    });
    await projectTreasury.save();
    
    // Обновляем проект
    const existing = project.investors.find(i => i.userId.toString() === user._id.toString());
    if (existing) { existing.amount += record.amount; } else { project.investors.push({ userId: user._id, amount: record.amount }); project.totalInvestors++; }
    project.collectedAmount += record.amount;
    if (project.collectedAmount >= project.targetAmount) project.status = 'funded';
    await project.save();
    await updateProjectPhase(project);
    
    await Transaction.create({ userId: user._id, type: 'investment', amount: -record.amount, description: 'Инвестиция в "' + project.title + '"', balanceAfter: user.balance, projectId: project._id });
    
    delete investCodes[user.userId];
    res.json({ success: true, message: 'Инвестировано ' + record.amount + ' ALTYN в проект "' + project.title + '"', data: { balance: user.balance, projectTreasury: projectTreasury.balance } });
});

app.get('/api/projects/my/investments', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const projects = await Project.find({ 'investors.userId': user._id });
    const data = projects.map(p => {
        const inv = p.investors.find(i => i.userId.toString() === user._id.toString());
        return { projectId: p._id, title: p.title, status: p.status, investedAmount: inv?.amount || 0, expectedROI: p.expectedROI };
    });
    res.json({ success: true, data });
});

// ============ ПАРТНЁРСТВО ============
app.get('/api/partner/stats', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const l1 = await User.find({ sponsorId: user.userId });
    const l1Ids = l1.map(p => p.userId);
    const l2 = await User.countDocuments({ sponsorId: { $in: l1Ids } });
    res.json({ success: true, data: { partnerStatus: user.partnerStatus, referralLink: user.referralLink, l1Count: l1.length, l2Count: l2 } });
});

app.get('/api/partner/referral-link', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    res.json({ success: true, data: { referralLink: user.referralLink, referralId: user.userId } });
});

app.get('/api/partner/l1', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const [partners, total] = await Promise.all([
        User.find({ sponsorId: user.userId }).select('userId fullName isActivated').skip((page-1)*limit).limit(limit),
        User.countDocuments({ sponsorId: user.userId })
    ]);
    res.json({ success: true, data: partners, page, total });
});

app.get('/api/partner/l2', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const l1Ids = await User.find({ sponsorId: user.userId }).distinct('userId');
    const partners = await User.find({ sponsorId: { $in: l1Ids } }).select('userId fullName');
    res.json({ success: true, data: partners });
});

app.get('/api/partner/marketing-plan', (req, res) => {
    res.json({ success: true, data: {
        activation: { cost: 1000 },
        statuses: [
            { name: 'Партнёр-Лидер', bonuses: { l1: '4% от прибыли', l2: '2% от прибыли' } },
            { name: 'VIP Партнёр', bonuses: { l1: '5% от прибыли', l2: '2.5% от прибыли' } }
        ]
    }});
});

// ============ KYC ============
app.post('/api/kyc/submit', upload.fields([{ name: 'documentFront' }, { name: 'documentBack' }, { name: 'selfieWithDocument' }]), async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const { firstName, lastName, documentType, documentNumber, country } = req.body;
    if (!firstName || !lastName || !documentType || !documentNumber) return res.status(400).json({ success: false, message: 'Заполните все поля' });
    
    await Verification.findOneAndUpdate({ userId: user._id }, {
        userId: user._id, status: 'pending', firstName, lastName, documentType, documentNumber,
        country: country || '',
        documentFront: (req.files?.documentFront?.[0]?.path || '').replace(/\\/g, '/').replace('public/', ''),
        documentBack: (req.files?.documentBack?.[0]?.path || '').replace(/\\/g, '/').replace('public/', ''),
        selfieWithDocument: (req.files?.selfieWithDocument?.[0]?.path || '').replace(/\\/g, '/').replace('public/', ''),
        submittedAt: new Date()
    }, { upsert: true, new: true });
    
    sendTelegram('📄 Новая KYC заявка от ' + user.fullName);
    res.json({ success: true, message: 'Заявка отправлена!' });
});

app.get('/api/kyc/status', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const v = await Verification.findOne({ userId: user._id });
    res.json({ success: true, data: v || { status: 'not_submitted' } });
});
// ============ АДМИН ============
app.get('/api/admin/dashboard', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ success: false });
    const [totalUsers, activatedUsers, totalProjects, pendingWithdrawals, treasury] = await Promise.all([
        User.countDocuments(), User.countDocuments({ isActivated: true }), Project.countDocuments(),
        Withdrawal.countDocuments({ status: 'pending' }), Treasury.findOne()
    ]);
    res.json({ success: true, data: { stats: { totalUsers, activatedUsers, totalProjects, pendingWithdrawals }, treasury: treasury || { totalProfit: 0 } } });
});

app.get('/api/admin/withdrawals', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ success: false });
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const filter = req.query.status && req.query.status !== 'all' ? { status: req.query.status } : {};
    const [withdrawals, total] = await Promise.all([
        Withdrawal.find(filter).populate('userId', 'userId fullName').sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit),
        Withdrawal.countDocuments(filter)
    ]);
    res.json({ success: true, data: withdrawals, page, total, totalPages: Math.ceil(total/limit) });
});

app.put('/api/admin/withdrawals/:id/approve', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const w = await Withdrawal.findById(req.params.id);
    if (!w) return res.status(404).json({ success: false });
    w.status = 'completed'; w.processedBy = admin._id; w.processedAt = new Date(); w.adminNote = req.body.note || 'Одобрено';
    await w.save();
    await Transaction.findOneAndUpdate({ userId: w.userId, type: 'withdrawal', status: 'pending' }, { status: 'completed' });
    await AdminLog.create({ adminId: admin._id, action: 'approve_withdrawal', targetId: w.userId, targetModel: 'Withdrawal', details: 'Сумма: ' + w.amount + ' ALTYN', ipAddress: req.ip });
    sendTelegram('✅ Вывод одобрен: ' + w.amount + ' ALTYN');
    res.json({ success: true, message: 'Одобрено' });
});

app.put('/api/admin/withdrawals/:id/reject', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const w = await Withdrawal.findById(req.params.id);
    if (!w) return res.status(404).json({ success: false });
    const reason = req.body.reason || 'Отклонено';
    const u = await User.findById(w.userId);
    if (u) { u.balance += (w.amount + w.fee); await u.save(); }
    w.status = 'rejected'; w.rejectionReason = reason; w.processedBy = admin._id; w.processedAt = new Date();
    await w.save();
    await Transaction.create({ userId: w.userId, type: 'refund', amount: w.amount + w.fee, description: 'Возврат: вывод отклонён. ' + reason, balanceAfter: u.balance });
    await AdminLog.create({ adminId: admin._id, action: 'reject_withdrawal', targetId: w.userId, targetModel: 'Withdrawal', details: reason, ipAddress: req.ip });
    res.json({ success: true, message: 'Отклонено' });
});

app.get('/api/admin/users', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const search = req.query.search || '';
    const filter = search ? { $or: [{ userId: { $regex: search, $options: 'i' } }, { fullName: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }] } : {};
    const [users, total] = await Promise.all([
        User.find(filter).select('-password').sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit),
        User.countDocuments(filter)
    ]);
    res.json({ success: true, data: users, page, total, totalPages: Math.ceil(total/limit) });
});

app.post('/api/admin/make-admin', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    if (req.body.secret !== 'DIBP_ADMIN_2026') return res.status(403).json({ success: false, message: 'Неверный ключ' });
    const user = await User.findOne({ userId: req.body.userId });
    if (!user) return res.status(404).json({ success: false });
    user.role = 'admin'; await user.save();
    await AdminLog.create({ adminId: admin._id, action: 'make_admin', targetId: user._id, targetModel: 'User', details: user.userId, ipAddress: req.ip });
    res.json({ success: true, message: user.userId + ' теперь админ' });
});

app.get('/api/admin/logs', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const logs = await AdminLog.find().populate('adminId', 'userId fullName').sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: logs });
});

app.get('/api/admin/errors', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    res.json({ success: true, data: { recent: errorLog.slice(-20), stats: { total: errorLog.length } } });
});

// KYC админ
app.get('/api/admin/kyc', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const verifications = await Verification.find({ status: 'pending' }).populate('userId', 'userId fullName').sort({ submittedAt: -1 });
    res.json({ success: true, data: verifications });
});

app.put('/api/admin/kyc/:id/approve', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const v = await Verification.findById(req.params.id);
    if (!v) return res.status(404).json({ success: false });
    v.status = 'approved'; v.approvedAt = new Date(); v.processedBy = admin._id; await v.save();
    await User.findByIdAndUpdate(v.userId, { isVerified: true, kycVerified: true });
    await AdminLog.create({ adminId: admin._id, action: 'approve_kyc', targetId: v.userId, targetModel: 'Verification', ipAddress: req.ip });
    res.json({ success: true, message: 'Одобрено!' });
});

app.put('/api/admin/kyc/:id/reject', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const v = await Verification.findById(req.params.id);
    if (!v) return res.status(404).json({ success: false });
    v.status = 'rejected'; v.rejectionReason = req.body.reason || 'Не подходит'; v.processedBy = admin._id; await v.save();
    await AdminLog.create({ adminId: admin._id, action: 'reject_kyc', targetId: v.userId, targetModel: 'Verification', details: v.rejectionReason, ipAddress: req.ip });
    res.json({ success: true, message: 'Отклонено' });
});

// Управление проектами
app.put('/api/admin/projects/:id/status', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false });
    project.status = req.body.status; await project.save();
    await AdminLog.create({ adminId: admin._id, action: 'update_project', targetId: project._id, targetModel: 'Project', details: 'Статус: ' + req.body.status, ipAddress: req.ip });
    res.json({ success: true, message: 'Статус обновлён' });
});

app.delete('/api/admin/projects/:id', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    await Project.findByIdAndDelete(req.params.id);
    await AdminLog.create({ adminId: admin._id, action: 'delete_project', targetModel: 'Project', details: req.params.id, ipAddress: req.ip });
    res.json({ success: true, message: 'Удалён' });
});

app.put('/api/admin/projects/:id/phase3', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false });
    project.phase = 3; project.phaseUpdatedAt = new Date(); await project.save();
    res.json({ success: true, message: 'В фазу 3!' });
});

app.post('/api/admin/projects/:id/distribute', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const project = await Project.findById(req.params.id).populate('investors.userId');
    if (!project) return res.status(404).json({ success: false });
    
    const { profitAmount } = req.body;
    const companyShare = profitAmount * 0.20;  // 20% компании (включая бонусы L1/L2)
    const investorShare = profitAmount * 0.40; // 40% инвесторам
    const partnerShare = profitAmount * 0.40;  // 40% инициатору
    
    // Бонусы L1/L2 из доли компании
    let totalBonuses = 0;
    
    for (const inv of project.investors) {
        const investorUser = await User.findById(inv.userId._id || inv.userId);
        if (!investorUser) continue;
        const investorProfit = (inv.amount / project.collectedAmount) * investorShare;
        
        // Бонус L1
        if (investorUser.sponsorL1) {
            const l1 = await User.findById(investorUser.sponsorL1);
            if (l1 && l1.isActivated) {
                const l1Percent = l1.partnerStatus === 'vip_partner' ? 0.07 : 0.05;
                const l1Bonus = investorProfit * l1Percent;
                l1.balance += l1Bonus;
                l1.totalEarned += l1Bonus;
                await l1.save();
                totalBonuses += l1Bonus;
                await Transaction.create({ userId: l1._id, type: 'partner_bonus_l1', amount: l1Bonus, description: 'Бонус L1 (' + (l1Percent*100) + '%) от ' + investorUser.userId, projectId: project._id });
            }
        }
        // Бонус L2
        if (investorUser.sponsorL2) {
            const l2 = await User.findById(investorUser.sponsorL2);
            if (l2 && l2.isActivated) {
                const l2Percent = l2.partnerStatus === 'vip_partner' ? 0.03 : 0.02;
                const l2Bonus = investorProfit * l2Percent;
                l2.balance += l2Bonus;
                l2.totalEarned += l2Bonus;
                await l2.save();
                totalBonuses += l2Bonus;
                await Transaction.create({ userId: l2._id, type: 'partner_bonus_l2', amount: l2Bonus, description: 'Бонус L2 (' + (l2Percent*100) + '%) от ' + investorUser.userId, projectId: project._id });
            }
        }
    }
    
    // Казна получает долю компании минус бонусы
    const treasuryAmount = companyShare - totalBonuses;
    let treasury = await Treasury.findOne();
    if (!treasury) treasury = await Treasury.create({ totalProfit: 0 });
    await treasury.addProfit(treasuryAmount > 0 ? treasuryAmount : 0, 'project_profit', 'Проект: ' + project.title);
    
    // Выплаты инвесторам
    for (const inv of project.investors) {
        const investorUser = await User.findById(inv.userId._id || inv.userId);
        if (!investorUser) continue;
        const share = (inv.amount / project.collectedAmount) * investorShare;
        investorUser.balance += share;
        investorUser.totalEarned += share;
        await investorUser.save();
        await Transaction.create({ userId: investorUser._id, type: 'profit', amount: share, description: 'Прибыль от "' + project.title + '"', projectId: project._id, balanceAfter: investorUser.balance });
    }
    
    // Инициатор
    const initiator = await User.findById(project.initiator);
    if (initiator) {
        initiator.balance += partnerShare;
        initiator.totalEarned += partnerShare;
        await initiator.save();
        await Transaction.create({ userId: initiator._id, type: 'profit', amount: partnerShare, description: 'Доля инициатора от "' + project.title + '"', projectId: project._id });
    }
    
    project.status = 'completed';
    project.totalProfit += profitAmount;
    project.totalPaidOut += profitAmount;
    await project.save();
    
    res.json({ success: true, message: 'Прибыль распределена!', data: { companyShare, investorShare, partnerShare, totalBonuses, treasuryAmount } });
});

// Казна
app.get('/api/admin/treasury', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const treasury = await Treasury.findOne();
    res.json({ success: true, data: treasury || { totalProfit: 0 } });
});

app.post('/api/admin/treasury/withdraw', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const { amount } = req.body;
    const treasury = await Treasury.findOne();
    if (!treasury || treasury.totalProfit < amount) return res.status(400).json({ success: false, message: 'Недостаточно в казне' });
    treasury.totalProfit -= amount; await treasury.save();
    await AdminLog.create({ adminId: admin._id, action: 'treasury_withdraw', details: amount + ' ALTYN', ipAddress: req.ip });
    res.json({ success: true, message: 'Выведено ' + amount + ' ALTYN' });
});

app.get('/api/admin/project-treasury/:id', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    
    const treasury = await ProjectTreasury.findOne({ projectId: req.params.id });
    if (!treasury) return res.json({ success: true, data: { balance: 0, history: [] } });
    
    res.json({ success: true, data: treasury });
});

// Вывод средств из казны проекта (только админ)
app.post('/api/admin/project-treasury/:id/withdraw', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    
    const { amount, description } = req.body;
    const treasury = await ProjectTreasury.findOne({ projectId: req.params.id });
    if (!treasury || treasury.balance < amount) return res.status(400).json({ success: false, message: 'Недостаточно средств в казне проекта' });
    
    treasury.balance -= amount;
    treasury.totalWithdrawn += amount;
    treasury.history.push({
        type: 'withdrawal',
        amount: -amount,
        userId: admin._id,
        description: description || 'Вывод админом'
    });
    await treasury.save();
    
    await AdminLog.create({ adminId: admin._id, action: 'project_treasury_withdraw', targetId: req.params.id, details: amount + ' ALTYN: ' + description, ipAddress: req.ip });
    
    res.json({ success: true, message: 'Выведено ' + amount + ' ALTYN', data: treasury });
});

// Бэкапы
app.post('/api/admin/backup', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    try { const result = await createBackup(); res.json({ success: true, data: result }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/admin/backups', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    res.json({ success: true, data: listBackups() });
});

// ============ ПОДДЕРЖКА ============
app.post('/api/support', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const { subject, message, category } = req.body;
    if (!subject || !message) return res.status(400).json({ success: false, message: 'Укажите тему и сообщение' });
    
    const ticket = await SupportTicket.create({
        userId: user._id, subject, category: category || 'general',
        messages: [{ senderId: user._id, senderRole: 'user', message }],
        lastReplyAt: new Date()
    });
    
    sendTelegram('🎫 Новый тикет #' + ticket._id.toString().slice(-6) + '\n👤 ' + user.fullName + '\n📝 ' + subject);
    res.status(201).json({ success: true, message: 'Тикет создан', data: ticket });
});

app.get('/api/support/my', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const [tickets, total] = await Promise.all([
        SupportTicket.find({ userId: user._id }).sort({ updatedAt: -1 }).skip((page-1)*limit).limit(limit),
        SupportTicket.countDocuments({ userId: user._id })
    ]);
    res.json({ success: true, data: tickets, page, total });
});

app.get('/api/support/:id', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const ticket = await SupportTicket.findById(req.params.id).populate('messages.senderId', 'userId fullName');
    if (!ticket) return res.status(404).json({ success: false });
    if (ticket.userId.toString() !== user._id.toString() && user.role !== 'admin') return res.status(403).json({ success: false });
    res.json({ success: true, data: ticket });
});

app.post('/api/support/:id/reply', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Введите сообщение' });
    
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false });
    
    const senderRole = user.role === 'admin' ? 'admin' : 'user';
    ticket.messages.push({ senderId: user._id, senderRole, message });
    ticket.lastReplyAt = new Date();
    if (senderRole === 'admin') ticket.status = 'in_progress';
    await ticket.save();
    
    if (senderRole === 'admin') {
        const owner = await User.findById(ticket.userId);
        if (owner) sendEmail(owner.email, 'Ответ поддержки DIBP', '<p>По вашему тикету поступил ответ. Войдите в кабинет.</p>');
    }
    res.json({ success: true, data: ticket });
});

app.put('/api/support/:id/close', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false });
    ticket.status = 'closed'; ticket.closedAt = new Date(); await ticket.save();
    res.json({ success: true, message: 'Тикет закрыт' });
});

app.get('/api/support/admin/all', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const filter = req.query.status && req.query.status !== 'all' ? { status: req.query.status } : {};
    const [tickets, total] = await Promise.all([
        SupportTicket.find(filter).populate('userId', 'userId fullName email').sort({ updatedAt: -1 }).skip((page-1)*limit).limit(limit),
        SupportTicket.countDocuments(filter)
    ]);
    res.json({ success: true, data: tickets, page, total });
});

// ============ ЭКСПОРТ ============
app.get('/api/export/transactions', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const transactions = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(1000).lean();
    const format = req.query.format || 'json';
    
    if (format === 'json') {
        res.setHeader('Content-Disposition', 'attachment; filename=transactions.json');
        return res.json(transactions);
    }
    
    // CSV
    let csv = 'Дата,Тип,Сумма,Валюта,Описание\n';
    transactions.forEach(tx => {
        csv += `"${new Date(tx.createdAt).toLocaleString('ru-RU')}","${tx.type}","${tx.amount}","${tx.currency}","${tx.description}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
    res.send(csv);
});

app.get('/api/export/projects', async (req, res) => {
    const projects = await Project.find({ status: 'active' }).lean();
    let csv = 'Название,Категория,Цель,Собрано,Прогресс,ROI\n';
    projects.forEach(p => {
        csv += `"${p.title}","${p.category}","${p.targetAmount}","${p.collectedAmount}","${(p.collectedAmount/p.targetAmount*100).toFixed(1)}%","${p.expectedROI}%"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=projects.csv');
    res.send(csv);
});

// ============ API ДЛЯ ВНЕШНИХ СЕРВИСОВ ============
const apiAuth = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ success: false, message: 'API ключ не указан' });
    const key = await ApiKey.findOne({ key: apiKey, isActive: true });
    if (!key) return res.status(401).json({ success: false, message: 'Неверный API ключ' });
    req.user = await User.findById(key.userId);
    if (!req.user) return res.status(401).json({ success: false });
    key.lastUsedAt = new Date(); await key.save();
    next();
};

app.get('/api/v1/projects', apiAuth, async (req, res) => {
    const projects = await Project.find({ status: 'active' }).select('-investors').lean();
    res.json({ success: true, data: projects });
});

app.get('/api/v1/balance', apiAuth, async (req, res) => {
    res.json({ success: true, data: { balance: req.user.balance, balanceUSD: req.user.balanceUSD } });
});

app.get('/api/v1/transactions', apiAuth, async (req, res) => {
    const transactions = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, data: transactions });
});

// Генерация API ключа
app.post('/api/v1/keys/generate', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const key = await ApiKey.create({ userId: user._id, name: req.body.name || 'API Key', permissions: req.body.permissions || ['read_projects', 'read_balance'] });
    res.json({ success: true, data: { name: key.name, key: key.key, secret: key.secret, permissions: key.permissions }, message: 'Сохраните секретный ключ!' });
});

// ============ СТАТИСТИКА ============
app.get('/api/stats', async (req, res) => {
    const [totalUsers, totalProjects, totalPaid] = await Promise.all([
        User.countDocuments(), 
        Project.countDocuments({ status: 'active' }),
        Transaction.aggregate([
            { $match: { type: 'profit', status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
    ]);
    res.json({ success: true, totalUsers, totalProjects, totalPaid: (totalPaid[0]?.total || 0) / 1000000 });
});

app.get('/api/phases-data', async (req, res) => {
    const [phase1, phase2, phase3] = await Promise.all([
        Project.find({ phase: 1, status: { $in: ['active', 'funded'] } }).lean(),
        Project.find({ phase: 2 }).lean(),
        Project.find({ phase: 3 }).lean()
    ]);
    res.json({ success: true, data: { phase1, phase2, phase3 } });
});

// ============ КРИПТО ============
app.get('/api/crypto/deposit-info', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    res.json({ success: true, data: { address: 'TCxjK1KjBpCvFx38NXQ41Msou51uxLZSTC', memo: 'DIBP-' + user.userId.replace('DIBP-',''), network: 'TRC-20', token: 'USDT', minAmount: '10 USDT' } });
});

app.post('/api/crypto/verify-tx', async (req, res) => {
    res.json({ success: true, confirmed: true, message: 'Транзакция подтверждена (тестовый режим)' });
});

const avatarUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'uploads', 'avatars')),
        filename: (req, file, cb) => cb(null, 'av-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
    }),
    limits: { fileSize: 2 * 1024 * 1024 }
});

app.post('/api/auth/avatar', avatarUpload.single('avatar'), async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Не авторизован' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Файл не выбран' });
    user.avatar = 'uploads/avatars/' + req.file.filename;
    await user.save();
    res.json({ success: true, data: { avatar: user.avatar } });
});

app.get('/api/finance/rates', (req, res) => {
    const goldPrice = 78.50;
    res.json({
        success: true,
        data: {
            gold: { pricePerGram: goldPrice, pricePerOunce: goldPrice * 31.1035, currency: 'USD' },
            silver: { pricePerGram: 0.92, pricePerOunce: 0.92 * 31.1035, currency: 'USD' },
            altyn: { priceUSD: (goldPrice / 1000).toFixed(4), description: '1 ALTYN = 1 мг золота' },
            currencies: { usdToAltyn: (1000 / goldPrice).toFixed(2), eurToAltyn: (1000 / (goldPrice * 0.92)).toFixed(2) },
            updatedAt: new Date().toISOString()
        }
    });
});

app.get('/api/admin/projects', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ success: false });
    const projects = await Project.find().populate('initiator', 'userId fullName').sort({ createdAt: -1 });
    res.json({ success: true, data: projects });
});

app.get('/api/admin/treasury/history', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        if (!user || user.role !== 'admin') return res.status(403).json({ success: false });
        const treasury = await Treasury.findOne();
        if (!treasury) return res.json({ success: true, data: [] });
        const history = (treasury.history || []).sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json({ success: true, data: history });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка' });
    }
});

app.get('/api/admin/projects/:id/investors', async (req, res) => {
    const admin = await getUserFromToken(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ success: false });
    try {
        const project = await Project.findById(req.params.id).populate('investors.userId', 'userId fullName email');
        if (!project) return res.status(404).json({ success: false, message: 'Проект не найден' });
        res.json({ success: true, data: project.investors });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Ошибка' });
    }
});

app.get('/api/v1/keys', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const keys = await ApiKey.find({ userId: user._id }).select('-secret');
    res.json({ success: true, data: keys });
});

app.delete('/api/v1/keys/:id', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    await ApiKey.findOneAndDelete({ _id: req.params.id, userId: user._id });
    res.json({ success: true, message: 'Ключ удалён' });
});

var resetCodes = {};

app.post('/api/auth/forgot', async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ success: true, message: 'Если email существует, код отправлен' });
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes[email.toLowerCase()] = { code, userId: user._id, expires: Date.now() + 600000 };
    
    console.log('📧 Код для ' + email + ': ' + code);
    
    sendEmail(email, 'Код восстановления DIBP Global', 
        '<h2>Ваш код:</h2><h1 style="color:#d4af37;font-size:32px;">' + code + '</h1><p>Код действителен 10 минут.</p>');
    
    res.json({ success: true, message: 'Код отправлен на почту' });
});

app.post('/api/auth/reset', async (req, res) => {
    const { email, code, newPassword } = req.body;
    const record = resetCodes[email.toLowerCase()];
    if (!record || Date.now() > record.expires) return res.status(400).json({ success: false, message: 'Код недействителен или истёк' });
    if (record.code !== code) return res.status(400).json({ success: false, message: 'Неверный код' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false, message: 'Пароль минимум 6 символов' });
    
    const user = await User.findById(record.userId).select('+password');
    if (!user) return res.status(400).json({ success: false, message: 'Пользователь не найден' });
    
    user.password = newPassword;
    await user.save();
    delete resetCodes[email.toLowerCase()];
    
    res.json({ success: true, message: 'Пароль изменён! Войдите с новым паролем.' });
});

app.get('/api/projects/my/created', async (req, res) => {
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false });
    const projects = await Project.find({ initiator: user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: projects });
});

async function updateProjectPhase(project) {
    if (project.status === 'funded' && project.phase === 1) {
        project.phase = 2;
        project.phaseUpdatedAt = new Date();
        project.status = 'active';
        await project.save();
        console.log('📁 Переход на фазу 2:', project.title);
    }
}

// Публичная страница проекта
app.get('/project/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'project.html'));
});

// ============ SPA FALLBACK ============
app.get('*', (req, res) => {
    if (req.url.startsWith('/api/')) return res.status(404).json({ success: false, message: 'API не найден' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ CRON: БЭКАП КАЖДЫЕ 24 ЧАСА ============
cron.schedule('0 3 * * *', async () => {
    console.log('🕐 Запуск ежедневного бэкапа...');
    try { await createBackup(); } catch (e) { logError(e, 'Daily Backup'); }
});

// ============ ЗАПУСК ============
mongoose.connect(MONGO_URI).then(async () => {
    console.log('✅ MongoDB подключена');
    let treasury = await Treasury.findOne();
    if (!treasury) { await Treasury.create({ totalProfit: 0 }); console.log('💰 Казна создана'); }
    
    app.listen(PORT, () => {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🚀 DIBP Global Server v2.0');
        console.log('🌐 http://localhost:' + PORT);
        console.log('📧 Email: dibpglobal@gmail.com');
        console.log('📱 Telegram: https://t.me/DIBPglobal');
        console.log('💰 USDT: TCxjK1KjBpCvFx38NXQ41Msou51uxLZSTC');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        sendTelegram('✅ Сервер DIBP Global запущен! 🚀');
    });
}).catch(err => {
    console.error('❌ MongoDB:', err.message);
    process.exit(1);
});