const { shell } = require('electron');

/**
 * IPC обработчики для консоли отладки
 */
class ConsoleHandlers {
    constructor(ipcMain, windowManager) {
        this.ipcMain = ipcMain;
        this.windowManager = windowManager;
        this.consoleLogs = [];
        this.maxConsoleLogs = 1000;
        this.setup();
    }

    setup() {
        // Открытие консоли
        this.ipcMain.handle('open-console', () => {
            const win = this.windowManager.createConsoleWindow();
            // Отправляем накопленные логи после готовности
            setTimeout(() => this.sendAllLogsToConsole(), 150);
            return { success: true };
        });

        // Получение логов из рендерера
        this.ipcMain.on('console-log-from-renderer', (e, logData) => {
            this.addLog(logData);
        });

        // Открытие папки Minecraft
        this.ipcMain.handle('open-folder', () => {
            const path = require('path');
            const { app } = require('electron');
            const minecraftDir = path.join(app.getPath('userData'), '.minecraft');
            shell.openPath(minecraftDir);
        });
    }

    addLog(logData) {
        const normalized = this.normalizeLog(logData);
        this.consoleLogs.push(normalized);
        if (this.consoleLogs.length > this.maxConsoleLogs) {
            this.consoleLogs.shift();
        }

        const consoleWindow = this.windowManager.getConsoleWindow();
        if (consoleWindow && !consoleWindow.isDestroyed()) {
            consoleWindow.webContents.send('console-log', normalized);
        }
    }

    normalizeLog(logData) {
        const level = (logData.level || 'info').toLowerCase();
        const message = typeof logData.message === 'string'
            ? logData.message
            : JSON.stringify(logData.message, null, 2);

        let ts = logData.timestamp ? new Date(logData.timestamp) : new Date();
        if (Number.isNaN(ts.getTime())) ts = new Date();

        return {
            level,
            message,
            timestamp: ts,
            source: logData.source || 'main'
        };
    }

    getAllLogs() {
        return this.consoleLogs;
    }

    sendAllLogsToConsole() {
        const consoleWindow = this.windowManager.getConsoleWindow();
        if (!consoleWindow || consoleWindow.isDestroyed()) return;

        this.consoleLogs.forEach((log, index) => {
            setTimeout(() => {
                if (consoleWindow && !consoleWindow.isDestroyed()) {
                    consoleWindow.webContents.send('console-log', log);
                }
            }, index * 10);
        });
    }
}

module.exports = ConsoleHandlers;
