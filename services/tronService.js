const axios = require('axios');

// ============================================
// TRONGRID API — проверка USDT TRC-20 платежей
// ============================================

const TRONGRID_API = 'https://api.trongrid.io/v1';
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // Адрес контракта USDT TRC-20

// Твой кошелёк для приёма платежей
const DIBP_WALLET = 'TCxjK1KjBpCvFx38NXQ41Msou51uxLZSTC'; // Твой адрес

// Кэш проверенных транзакций
const checkedTxIds = new Set();

async function checkUSDTpayments() {
    try {
        // Получаем транзакции TRC-20 для кошелька
        const url = `${TRONGRID_API}/accounts/${DIBP_WALLET}/transactions/trc20`;
        
        const response = await axios.get(url, {
            params: {
                only_confirmed: true,
                limit: 50,
                order_by: 'block_timestamp,desc',
                contract_address: USDT_CONTRACT
            },
            timeout: 10000
        });

        const transactions = response.data.data || [];
        const newPayments = [];

        for (const tx of transactions) {
            const txId = tx.transaction_id;
            
            // Пропускаем уже проверенные
            if (checkedTxIds.has(txId)) continue;
            
            // Проверяем что это входящий платёж
            if (tx.to === DIBP_WALLET) {
                // Декодируем amount (USDT имеет 6 decimals)
                const amountRaw = parseInt(tx.value || '0');
                const amount = amountRaw / 1000000; // 6 decimals
                
                // Получаем MEMO
                const memo = tx.memo || '';
                
                // Извлекаем ID пользователя из MEMO (формат: DIBP-XXXX)
                const userIdMatch = memo.match(/DIBP-(\d+)/);
                
                newPayments.push({
                    txId: txId,
                    from: tx.from,
                    to: tx.to,
                    amount: amount,
                    amountRaw: amountRaw,
                    memo: memo,
                    userId: userIdMatch ? 'DIBP-' + userIdMatch[1] : null,
                    timestamp: tx.block_timestamp,
                    token: 'USDT',
                    network: 'TRC-20'
                });
                
                // Помечаем как проверенную
                checkedTxIds.add(txId);
            }
        }

        return newPayments;
    } catch (error) {
        console.error('❌ Ошибка проверки USDT:', error.message);
        return [];
    }
}

// Проверка конкретной транзакции по TX ID
async function checkSingleTx(txId) {
    try {
        const url = `${TRONGRID_API}/transactions/${txId}`;
        const response = await axios.get(url, { timeout: 10000 });
        const tx = response.data;
        
        if (tx && tx.ret && tx.ret[0]?.contractRet === 'SUCCESS') {
            return {
                confirmed: true,
                txId: tx.txID,
                blockTimestamp: tx.block_timestamp
            };
        }
        
        return { confirmed: false };
    } catch (error) {
        console.error('❌ Ошибка проверки TX:', error.message);
        return { confirmed: false, error: error.message };
    }
}

// Генерация MEMO для пользователя
function generateMemo(userId) {
    return `DIBP-${userId.replace('DIBP-', '')}`;
}

module.exports = {
    checkUSDTpayments,
    checkSingleTx,
    generateMemo,
    DIBP_WALLET
};