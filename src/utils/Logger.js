const fs = require('fs');
const path = require('path');

/**
 * Система логирования для лаунчера
 * Записывает логи в файл и консоль
 */
class Logger {
    constructor(minecraftDir) {
        this.logsDir = path.join(minecraftDir, 'logs');
        this.logFile = path.join(this.logsDir, `launcher-${this.getDateString()}.log`);
        this.ensureDir(this.logsDir);
        this.cleanOldLogs();
    }

    getDateString() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    getTimeString() {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    }

    log(level, message, data = null) {
        const timestamp = this.getTimeString();
        const logLine = `[${timestamp}] [${level}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
        
        try {
            fs.appendFileSync(this.logFile, logLine);
        } catch (err) {
            console.error('Failed to write log:', err.message);
        }
    }

    info(message, data) {
        this.log('INFO', message, data);
    }

    warn(message, data) {
        this.log('WARN', message, data);
        console.warn(`⚠ ${message}`);
    }

    error(message, error) {
        const errorData = error instanceof Error ? {
            message: error.message,
            stack: error.stack
        } : error;
        this.log('ERROR', message, errorData);
        console.error(`✗ ${message}`);
    }

    success(message) {
        this.log('SUCCESS', message);
    }

    cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logsDir);
            const logFiles = files.filter(f => f.startsWith('launcher-') && f.endsWith('.log'));
            
            if (logFiles.length > 7) {
                logFiles.sort().slice(0, logFiles.length - 7).forEach(file => {
                    fs.unlinkSync(path.join(this.logsDir, file));
                });
            }
        } catch (err) {
            // Игнорируем ошибки очистки
        }
    }

    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

module.exports = Logger;
