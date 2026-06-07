const telegramService = require('./telegramService');

class ErrorMonitor {
    constructor() {
        this.errors = [];
        this.maxErrors = 100;
    }

    log(error, location = 'unknown') {
        const errorObj = {
            message: error.message || String(error),
            stack: error.stack || '',
            location,
            timestamp: new Date().toISOString()
        };

        console.error(`❌ [${location}]`, errorObj.message);

        this.errors.push(errorObj);
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }

        // Критические ошибки отправляем в Telegram
        if (this.isCritical(errorObj)) {
            telegramService.notifications.error(errorObj.message, location);
        }
    }

    isCritical(errorObj) {
        const criticalPatterns = [
            'MongoError',
            'MongooseError',
            'ConnectionError',
            'ECONNREFUSED',
            'disk space',
            'out of memory'
        ];
        return criticalPatterns.some(pattern => 
            errorObj.message.includes(pattern) || errorObj.stack.includes(pattern)
        );
    }

    getRecentErrors(limit = 10) {
        return this.errors.slice(-limit);
    }

    getStats() {
        const now = new Date();
        const last24h = this.errors.filter(e => 
            now - new Date(e.timestamp) < 24 * 60 * 60 * 1000
        );

        return {
            total: this.errors.length,
            last24h: last24h.length,
            critical: last24h.filter(e => this.isCritical(e)).length,
            byLocation: last24h.reduce((acc, e) => {
                acc[e.location] = (acc[e.location] || 0) + 1;
                return acc;
            }, {})
        };
    }

    clear() {
        this.errors = [];
    }
}

// Синглтон
const errorMonitor = new ErrorMonitor();

// Глобальный обработчик необработанных ошибок
process.on('uncaughtException', (error) => {
    errorMonitor.log(error, 'uncaughtException');
    console.error('НЕОБРАБОТАННАЯ ОШИБКА:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    errorMonitor.log(reason, 'unhandledRejection');
    console.error('НЕОБРАБОТАННЫЙ PROMISE REJECTION:', reason);
});

module.exports = errorMonitor;