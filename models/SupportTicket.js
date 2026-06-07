const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['user', 'admin', 'support'], default: 'user' },
    message: { type: String, required: true },
    attachments: [String],
    readAt: Date
}, { timestamps: true });

const SupportTicketSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true },
    category: { 
        type: String, 
        enum: ['general', 'finance', 'technical', 'kyc', 'projects', 'partnership', 'other'],
        default: 'general' 
    },
    status: { 
        type: String, 
        enum: ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'], 
        default: 'open' 
    },
    priority: { 
        type: String, 
        enum: ['low', 'medium', 'high', 'urgent'], 
        default: 'medium' 
    },
    messages: [MessageSchema],
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: Date,
    closedAt: Date,
    lastReplyAt: Date
}, { timestamps: true });

SupportTicketSchema.index({ userId: 1, status: 1 });
SupportTicketSchema.index({ status: 1, priority: 1 });
SupportTicketSchema.index({ updatedAt: -1 });

SupportTicketSchema.virtual('unreadCount').get(function() {
    return this.messages.filter(m => !m.readAt && m.senderRole === 'user').length;
});

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);