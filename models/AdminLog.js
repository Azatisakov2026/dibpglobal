const mongoose = require('mongoose');

const AdminLogSchema = new mongoose.Schema({
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { 
        type: String, 
        enum: [
            'login', 'logout',
            'approve_withdrawal', 'reject_withdrawal',
            'approve_kyc', 'reject_kyc',
            'activate_project', 'cancel_project', 'delete_project',
            'make_admin', 'treasury_withdraw',
            'update_user', 'view_users', 'view_stats'
        ],
        required: true 
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    targetModel: { type: String, default: '' },
    details: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' }
}, { timestamps: true });

AdminLogSchema.index({ adminId: 1, createdAt: -1 });
AdminLogSchema.index({ action: 1 });

module.exports = mongoose.model('AdminLog', AdminLogSchema);