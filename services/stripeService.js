const stripe = require('stripe')('sk_test_ТВОЙ_СЕКРЕТНЫЙ_КЛЮЧ'); // ← Замени на свой

// Создать платёжное намерение
async function createPaymentIntent(amount, currency = 'usd', metadata = {}) {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Stripe работает в центах
            currency: currency,
            metadata: metadata,
            description: `Пополнение DIBP Global: ${amount} USD`
        });
        
        return {
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentId: paymentIntent.id
        };
    } catch (error) {
        console.error('Stripe error:', error.message);
        return { success: false, error: error.message };
    }
}

// Проверить статус платежа
async function checkPaymentStatus(paymentIntentId) {
    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        return {
            success: true,
            status: paymentIntent.status,
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency,
            metadata: paymentIntent.metadata
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Webhook для получения уведомлений от Stripe
async function handleWebhook(body, signature, webhookSecret) {
    try {
        const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            return {
                success: true,
                type: 'payment_succeeded',
                amount: paymentIntent.amount / 100,
                paymentId: paymentIntent.id,
                metadata: paymentIntent.metadata
            };
        }
        
        return { success: true, type: event.type };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = { createPaymentIntent, checkPaymentStatus, handleWebhook };