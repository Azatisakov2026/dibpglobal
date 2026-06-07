const axios = require('axios');

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
        return { success: true };
    } catch (error) {
        console.error('📧 ОШИБКА отправки:', error.response?.data?.message || error.message);
        return { success: false, error: error.message };
    }
}

async function sendVerificationCode(email, code, purpose = 'подтверждения') {
    return sendEmail(email, `DIBP Global — Код ${purpose}`, `
        <div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;">
            <h1 style="color:#d4af37;text-align:center;">DIBP Global</h1>
            <div style="background:#1a1a1a;padding:30px;border-radius:12px;text-align:center;">
                <p style="color:#fff;font-size:16px;">Ваш код ${purpose}:</p>
                <h2 style="color:#d4af37;font-size:36px;letter-spacing:10px;">${code}</h2>
                <p style="color:#888;font-size:14px;">Код действителен 10 минут</p>
            </div>
        </div>
    `);
}

async function sendNotification(email, subject, message) {
    return sendEmail(email, subject, `
        <div style="max-width:600px;margin:0 auto;padding:20px;font-family:Arial,sans-serif;">
            <h2 style="color:#d4af37;">DIBP Global</h2>
            <div style="background:#1a1a1a;padding:20px;border-radius:8px;">
                <p style="color:#fff;">${message.replace(/\n/g, '<br>')}</p>
            </div>
        </div>
    `);
}

async function sendWelcomeEmail(email, fullName) {
    return sendNotification(email, 'Добро пожаловать в DIBP Global!',
        `Здравствуйте, ${fullName}!\n\nДобро пожаловать на платформу DIBP Global.\n\nДля активации аккаунта пополните баланс на 1000 ALTYN.\n\nС уважением,\nКоманда DIBP Global`
    );
}

module.exports = { sendVerificationCode, sendNotification, sendWelcomeEmail };