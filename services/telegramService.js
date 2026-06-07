const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'ТВОЙ_ТОКЕН_БОТА';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'ТВОЙ_CHAT_ID';
const TELEGRAM_SUPPORT_CHAT = process.env.TELEGRAM_SUPPORT_CHAT || 'https://t.me/DIBPglobal';

async function sendMessage(text, chatId = null) {
    try {
        const targetChatId = chatId || TELEGRAM_CHAT_ID;
        if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'ТВОЙ_ТОКЕН_БОТА') {
            console.log('📱 [Telegram] Бот не настроен. Сообщение:', text.substring(0, 100));
            return { success: false, error: 'Токен бота не настроен' };
        }

        const response = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: targetChatId,
                text: text,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            },
            { timeout: 5000 }
        );

        return { success: true, data: response.data };
    } catch (error) {
        console.error('Telegram send error:', error.message);
        return { success: false, error: error.message };
    }
}

// Шаблоны уведомлений
const notifications = {
    newRegistration: async (user) => {
        await sendMessage(
            `🆕 <b>Новая регистрация!</b>\n\n` +
            `👤 Имя: ${user.fullName}\n` +
            `🆔 ID: ${user.userId}\n` +
            `📧 Email: ${user.email}\n` +
            `📱 Телефон: ${user.phone || 'Не указан'}\n` +
            `📅 Дата: ${new Date().toLocaleString('ru-RU')}`
        );
    },

    newWithdrawal: async (withdrawal, user) => {
        await sendMessage(
            `💰 <b>Новая заявка на вывод!</b>\n\n` +
            `👤 ${user.fullName} (${user.userId})\n` +
            `💵 Сумма: ${withdrawal.amount} ALTYN\n` +
            `💸 Комиссия: ${withdrawal.fee} ALTYN\n` +
            `🏦 Кошелёк: ${withdrawal.walletAddress || 'Не указан'}\n` +
            `📅 ${new Date().toLocaleString('ru-RU')}`
        );
    },

    newTicket: async (ticket, user) => {
        await sendMessage(
            `🎫 <b>Новый тикет поддержки!</b>\n\n` +
            `🆔 #${ticket._id}\n` +
            `👤 ${user.fullName} (${user.userId})\n` +
            `📝 Тема: ${ticket.subject}\n` +
            `📂 Категория: ${ticket.category}\n` +
            `⭐ Приоритет: ${ticket.priority}`
        );
    },

    error: async (errorMessage, location) => {
        await sendMessage(
            `🚨 <b>Ошибка на сервере!</b>\n\n` +
            `📍 ${location}\n` +
            `❌ ${errorMessage}\n` +
            `🕐 ${new Date().toLocaleString('ru-RU')}`
        );
    },

    backup: async (status, details = '') => {
        await sendMessage(
            `💾 <b>Резервное копирование</b>\n\n` +
            `Статус: ${status}\n` +
            `${details}\n` +
            `🕐 ${new Date().toLocaleString('ru-RU')}`
        );
    }
};

module.exports = { sendMessage, notifications, TELEGRAM_SUPPORT_CHAT };