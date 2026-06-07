const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const telegramService = require('./telegramService');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dibp_global';

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function createBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);

        console.log('💾 Создание резервной копии...');

        const command = `mongodump --uri="${MONGO_URI}" --out="${backupPath}"`;

        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ Ошибка бэкапа:', error.message);
                    telegramService.notifications.backup('❌ Ошибка', error.message);
                    reject(error);
                    return;
                }

                console.log('✅ Бэкап создан:', backupPath);
                telegramService.notifications.backup('✅ Успешно', `Путь: ${backupPath}`);

                // Удаляем старые бэкапы (старше 7 дней)
                cleanupOldBackups(7);

                resolve({ success: true, path: backupPath, timestamp });
            });
        });
    } catch (e) {
        console.error('Backup error:', e.message);
        return { success: false, error: e.message };
    }
}

function cleanupOldBackups(daysToKeep = 7) {
    try {
        const files = fs.readdirSync(BACKUP_DIR);
        const now = Date.now();
        const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

        files.forEach(file => {
            const filePath = path.join(BACKUP_DIR, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > maxAge) {
                fs.rmSync(filePath, { recursive: true, force: true });
                console.log('🗑️ Удалён старый бэкап:', file);
            }
        });
    } catch (e) {
        console.warn('Cleanup error:', e.message);
    }
}

async function restoreBackup(backupName) {
    try {
        const backupPath = path.join(BACKUP_DIR, backupName);
        if (!fs.existsSync(backupPath)) {
            throw new Error('Бэкап не найден: ' + backupName);
        }

        console.log('🔄 Восстановление из бэкапа:', backupName);
        const command = `mongorestore --uri="${MONGO_URI}" --drop "${backupPath}"`;

        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ Ошибка восстановления:', error.message);
                    reject(error);
                    return;
                }
                console.log('✅ Бэкап восстановлен:', backupName);
                resolve({ success: true, path: backupPath });
            });
        });
    } catch (e) {
        console.error('Restore error:', e.message);
        return { success: false, error: e.message };
    }
}

function listBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR);
        return files
            .filter(f => f.startsWith('backup-'))
            .map(f => {
                const stats = fs.statSync(path.join(BACKUP_DIR, f));
                return {
                    name: f,
                    size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
                    date: stats.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (e) {
        return [];
    }
}

module.exports = { createBackup, restoreBackup, listBackups, cleanupOldBackups };