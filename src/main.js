const { app, BrowserWindow } = require('electron');
const MainProcess = require('./core/MainProcess');

// Настройка логирования
const log = require('electron-log');
log.transports.file.level = 'info';

// Устанавливаем правильную кодировку для консоли на Windows
if (process.platform === 'win32') {
    if (process.stdout.setEncoding) {
        process.stdout.setEncoding('utf8');
    }
    if (process.stderr.setEncoding) {
        process.stderr.setEncoding('utf8');
    }
}

// Проверяем, не запущен ли уже экземпляр лаунчера
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // Если уже запущен, закрываем этот экземпляр
    app.quit();
    process.exit(0);
}

let mainProcess;

// Обработчик второго экземпляра
app.on('second-instance', () => {
    try {
        if (mainProcess && mainProcess.windowManager.hasMainWindow()) {
            const mainWindow = mainProcess.windowManager.getMainWindow();
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
        }
    } catch (err) {
        console.error('Error in second-instance handler:', err.message);
    }
});

// Обработчик перед выходом
app.on('before-quit', () => {
    try {
        if (mainProcess) {
            mainProcess.cleanup();
        }
    } catch (err) {
        console.error('Error in before-quit handler:', err);
    }
});

// Запуск приложения
app.whenReady().then(() => {
    mainProcess = new MainProcess();
    mainProcess.createMainWindow();
    mainProcess.createTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            mainProcess.createMainWindow();
        }
    });
});

// Глобальный обработчик необработанных исключений
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception in main process:', error);
    console.error('Stack:', error.stack);
});

// Обработчик необработанных Promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Не закрываем приложение при закрытии всех окон
app.on('window-all-closed', () => {
    // Приложение продолжит работать в фоне с иконкой в трее
    // Не вызываем app.quit() на Windows/Linux
    if (process.platform === 'darwin') {
        // На macOS традиционно приложения остаются активными
    }
});
