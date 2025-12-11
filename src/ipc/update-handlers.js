const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

/**
 * IPC обработчики для автообновления
 */
class UpdateHandlers {
    constructor(ipcMain, windowManager) {
        this.ipcMain = ipcMain;
        this.windowManager = windowManager;
        this.setup();
        this.setupAutoUpdater();
    }

    setup() {
        // Проверка обновлений
        this.ipcMain.handle('check-for-updates', async () => {
            try {
                console.log('Manual update check requested');
                const result = await autoUpdater.checkForUpdates();
                return result;
            } catch (err) {
                console.error('Check for updates error:', err);
                throw err;
            }
        });

        // Начать загрузку обновления
        this.ipcMain.handle('start-update-download', async () => {
            try {
                console.log('Starting update download');
                await autoUpdater.downloadUpdate();
            } catch (err) {
                console.error('Download update error:', err);
                throw err;
            }
        });

        // Выход и установка
        this.ipcMain.on('quit-and-install', () => {
            console.log('Quitting and installing update');
            autoUpdater.quitAndInstall(false, true);
        });
    }

    setupAutoUpdater() {
        autoUpdater.logger = log;
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = false;

        console.log('Setting up auto-updater...');

        // Проверка обновлений
        autoUpdater.on('checking-for-update', () => {
            console.log('Checking for update...');
        });

        // Обновление доступно
        autoUpdater.on('update-available', (info) => {
            console.log('Update available:', info.version);

            const mainWindow = this.windowManager.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-available', {
                    version: info.version,
                    releaseNotes: info.releaseNotes,
                    releaseDate: info.releaseDate
                });
            }
        });

        // Обновление недоступно
        autoUpdater.on('update-not-available', (info) => {
            console.log('Update not available. Current version is:', info.version);
        });

        // Ошибка
        autoUpdater.on('error', (err) => {
            console.error('Auto-updater error:', err);

            const mainWindow = this.windowManager.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-error', err.message || 'Ошибка автообновления');
            }
        });

        // Прогресс загрузки
        autoUpdater.on('download-progress', (progressObj) => {
            console.log(`Download progress: ${progressObj.percent}%`);

            const mainWindow = this.windowManager.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-download-progress', {
                    percent: progressObj.percent,
                    bytesPerSecond: progressObj.bytesPerSecond,
                    transferred: progressObj.transferred,
                    total: progressObj.total
                });
            }
        });

        // Обновление скачано
        autoUpdater.on('update-downloaded', (info) => {
            console.log('Update downloaded:', info.version);

            const mainWindow = this.windowManager.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-downloaded');
            }
        });

        // Автоматическая проверка при запуске
        setTimeout(() => {
            console.log('Starting automatic update check...');
            autoUpdater.checkForUpdates().catch(err => {
                console.error('Auto-update check failed:', err);
            });
        }, 5000);

        // Периодическая проверка каждые 30 минут
        setInterval(() => {
            console.log('Periodic update check...');
            autoUpdater.checkForUpdates().catch(err => {
                console.error('Periodic update check failed:', err);
            });
        }, 30 * 60 * 1000);
    }
}

module.exports = UpdateHandlers;
