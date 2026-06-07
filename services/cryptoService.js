const axios = require('axios');
const QRCode = require('qrcode');
const crypto = require('crypto');

// ============================================
// КРИПТО-СЕРВИС DIBP Global
// ============================================

// Тестовые кошельки (замени на реальные!)
const WALLETS = {
    USDT_TRC20: 'TCxjK1KjBpCvFx38NXQ41Msou51uxLZSTC',  // USDT TRC-20
    USDT_ERC20: '0xYOUR_ETH_WALLET_HERE',               // USDT ERC-20
    BTC: 'bc1qYOUR_BTC_WALLET_HERE',                    // Bitcoin
    ETH: '0xYOUR_ETH_WALLET_HERE',                      // Ethereum
};

// Комиссии сети (примерные, обновляются)
const NETWORK_FEES = {
    USDT_TRC20: 1,      // 1 USDT
    USDT_ERC20: 5,      // ~5 USDT
    BTC: 0.0003,        // ~0.0003 BTC
    ETH: 0.001,         // ~0.001 ETH
};

// Курсы криптовалют (заглушка, нужно подключить API)
const CRYPTO_RATES = {
    USDT: 1.00,
    BTC: 67500.00,
    ETH: 3500.00,
};

// ============================================
// ГЕНЕРАЦИЯ АДРЕСА ДЛЯ ПОПОЛНЕНИЯ
// ============================================
function generatePaymentAddress(userId, currency) {
    // Генерируем уникальную метку для пользователя
    const uniqueTag = `${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    const addresses = {
        USDT_TRC20: {
            address: WALLETS.USDT_TRC20,
            memo: uniqueTag,
            network: 'TRC-20',
            minAmount: 10,
            fee: NETWORK_FEES.USDT_TRC20,
            qrData: `tron:${WALLETS.USDT_TRC20}?memo=${uniqueTag}`
        },
        USDT_ERC20: {
            address: WALLETS.USDT_ERC20,
            memo: null,
            network: 'ERC-20',
            minAmount: 50,
            fee: NETWORK_FEES.USDT_ERC20,
            qrData: `ethereum:${WALLETS.USDT_ERC20}`
        },
        BTC: {
            address: WALLETS.BTC,
            memo: null,
            network: 'Bitcoin',
            minAmount: 0.001,
            fee: NETWORK_FEES.BTC,
            qrData: `bitcoin:${WALLETS.BTC}`
        },
        ETH: {
            address: WALLETS.ETH,
            memo: null,
            network: 'Ethereum',
            minAmount: 0.01,
            fee: NETWORK_FEES.ETH,
            qrData: `ethereum:${WALLETS.ETH}`
        }
    };
    
    return addresses[currency] || addresses.USDT_TRC20;
}

// ============================================
// ГЕНЕРАЦИЯ QR-КОДА
// ============================================
async function generateQRCode(data) {
    try {
        const qrDataUrl = await QRCode.toDataURL(data, {
            width: 300,
            margin: 2,
            color: { dark: '#d4af37', light: '#0a0a0a' }
        });
        return qrDataUrl;
    } catch (error) {
        console.error('QR error:', error.message);
        return null;
    }
}

// ============================================
// ПРОВЕРКА ТРАНЗАКЦИИ (заглушка)
// ============================================
async function checkTransaction(txId, currency) {
    // В реальном проекте здесь проверка через API блокчейна
    // TronGrid для TRC-20, Etherscan для ERC-20, Blockchain.info для BTC
    
    try {
        if (currency === 'USDT_TRC20') {
            // Пример: проверка через TronGrid API
            // const response = await axios.get(`https://api.trongrid.io/v1/transactions/${txId}`);
            return { confirmed: true, amount: 100, currency: 'USDT' };
        }
        
        if (currency === 'BTC') {
            // Пример: проверка через Blockchain.info
            // const response = await axios.get(`https://blockchain.info/rawtx/${txId}`);
            return { confirmed: true, amount: 0.01, currency: 'BTC' };
        }
        
        return { confirmed: false, amount: 0, currency };
    } catch (error) {
        console.error('Check tx error:', error.message);
        return { confirmed: false, error: error.message };
    }
}

// ============================================
// ОТПРАВКА ТРАНЗАКЦИИ (для вывода)
// ============================================
async function sendTransaction(toAddress, amount, currency) {
    // В реальном проекте здесь подписание и отправка транзакции
    
    const txId = 'TX_' + crypto.randomBytes(16).toString('hex');
    
    console.log(`📤 Отправка: ${amount} ${currency} → ${toAddress}`);
    console.log(`   TX ID: ${txId}`);
    
    return {
        success: true,
        txId: txId,
        amount: amount,
        currency: currency,
        toAddress: toAddress,
        fee: NETWORK_FEES[currency] || 0,
        timestamp: new Date().toISOString()
    };
}

// ============================================
// КОНВЕРТАЦИЯ КРИПТЫ → USD
// ============================================
function cryptoToUSD(amount, currency) {
    const rate = CRYPTO_RATES[currency] || 1;
    return amount * rate;
}

// ============================================
// КОНВЕРТАЦИЯ USD → ALTYN
// ============================================
function usdToALTYN(usdAmount, goldPricePerGram) {
    const altynPrice = goldPricePerGram / 1000;
    return Math.floor((usdAmount / altynPrice) * 100) / 100;
}

module.exports = {
    generatePaymentAddress,
    generateQRCode,
    checkTransaction,
    sendTransaction,
    cryptoToUSD,
    usdToALTYN,
    WALLETS,
    NETWORK_FEES,
    CRYPTO_RATES
};