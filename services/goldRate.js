const axios = require('axios');

// Бесплатные API (выбираем рабочий)
const APIS = [
    'https://api.gold-api.com/price/XAU',           // Gold API
    'https://www.goldapi.io/api/XAU/USD',            // GoldAPI.io (нужен ключ)
];

// Кэш
let cached = {
    gold: { pricePerOunce: 2650.00, pricePerGram: 85.20, timestamp: null },
    silver: { pricePerOunce: 31.50, pricePerGram: 1.01, timestamp: null }
};

async function getGoldRate() {
    try {
        const now = Date.now();
        // Кэш на 5 минут
        if (cached.gold.timestamp && (now - cached.gold.timestamp) < 5 * 60 * 1000) {
            return cached.gold;
        }

        // Пробуем первый API
        const response = await axios.get('https://api.gold-api.com/price/XAU', {
            timeout: 8000,
            headers: { 'Accept': 'application/json' }
        });
        
        if (response.data && response.data.price) {
            const pricePerOunce = parseFloat(response.data.price);
            const pricePerGram = pricePerOunce / 31.1035;
            
            cached.gold = {
                pricePerOunce: pricePerOunce,
                pricePerGram: pricePerGram,
                timestamp: now
            };
            console.log('✅ Курс золота обновлён:', pricePerOunce, 'USD/унция');
        }
        
        return cached.gold;
    } catch (error) {
        console.warn('⚠️ API золота недоступен, использую кэш');
        return cached.gold;
    }
}

async function getSilverRate() {
    try {
        const now = Date.now();
        if (cached.silver.timestamp && (now - cached.silver.timestamp) < 5 * 60 * 1000) {
            return cached.silver;
        }

        // Пробуем получить серебро
        const response = await axios.get('https://api.gold-api.com/price/XAG', {
            timeout: 8000,
            headers: { 'Accept': 'application/json' }
        });
        
        if (response.data && response.data.price) {
            const pricePerOunce = parseFloat(response.data.price);
            const pricePerGram = pricePerOunce / 31.1035;
            
            cached.silver = {
                pricePerOunce: pricePerOunce,
                pricePerGram: pricePerGram,
                timestamp: now
            };
            console.log('✅ Курс серебра обновлён:', pricePerOunce, 'USD/унция');
        }
        
        return cached.silver;
    } catch (error) {
        console.warn('⚠️ API серебра недоступен, использую кэш');
        return cached.silver;
    }
}

function getALTYNprice(goldPricePerGram) {
    return (parseFloat(goldPricePerGram) / 1000).toFixed(6);
}

module.exports = { getGoldRate, getSilverRate, getALTYNprice };