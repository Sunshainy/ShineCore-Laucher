const fs = require('fs');
const path = require('path');
const { dialog, app } = require('electron');
const { pathToFileURL, fileURLToPath } = require('url');

/**
 * IPC обработчики для фона лаунчера
 */
class BackgroundHandlers {
    constructor(ipcMain, configManager, windowManager) {
        this.ipcMain = ipcMain;
        this.configManager = configManager;
        this.windowManager = windowManager;
        this.setup();
    }

    // Приводим путь к абсолютному file:// для dev и prod
    resolveBackgroundPath(originalPath) {
        if (!originalPath) return '';

        const devBase = path.join(app.getAppPath(), 'src', 'assets');
        const prodBase = path.join(process.resourcesPath, 'assets');
        const baseAssets = app.isPackaged ? prodBase : devBase;

        // Если уже file:// — проверим наличие; если нет, попробуем восстановить по имени
        if (originalPath.startsWith('file://')) {
            try {
                const fsPath = fileURLToPath(originalPath);
                if (fs.existsSync(fsPath)) return originalPath;
                originalPath = path.basename(fsPath);
            } catch (_) {
                originalPath = path.basename(originalPath.replace('file://', ''));
            }
        }

        // Если абсолютный путь — отдаём его как есть, но сначала проверим наличие
        if (path.isAbsolute(originalPath)) {
            return fs.existsSync(originalPath)
                ? pathToFileURL(originalPath).href
                : pathToFileURL(originalPath).href;
        }

        // Очищаем относительный путь: вырезаем всё до assets/ и нормализуем
        const normalized = originalPath.replace(/\\/g, '/');
        const assetsIdx = normalized.lastIndexOf('/assets/');
        let relative = assetsIdx !== -1
            ? normalized.slice(assetsIdx + '/assets/'.length)
            : normalized.replace(/^\.\//, '');

        if (!relative || relative === '.') {
            relative = 'background.webm';
        }

        // Собираем финальный путь и проверяем наличие; если нет — пробуем basename
        let fullPath = path.resolve(baseAssets, relative);
        if (!fs.existsSync(fullPath)) {
            const fallbackName = path.basename(relative);
            fullPath = path.resolve(baseAssets, fallbackName);
        }

        const exists = fs.existsSync(fullPath);
        console.log('[background] resolved', {
            originalPath,
            baseAssets,
            relative,
            fullPath,
            exists,
            packaged: app.isPackaged
        });

        return pathToFileURL(fullPath).href;
    }

    setup() {
        // Выбор файла фона
        this.ipcMain.handle('select-background-file', async () => {
            try {
                const mainWindow = this.windowManager.getMainWindow();
                if (!mainWindow || mainWindow.isDestroyed()) {
                    throw new Error('Окно приложения не инициализировано');
                }

                const result = await dialog.showOpenDialog(mainWindow, {
                    title: 'Выберите файл фона',
                    filters: [
                        { name: 'Изображения', extensions: ['jpg', 'jpeg', 'png'] },
                        { name: 'Видео', extensions: ['webm', 'mp4'] },
                        { name: 'Все файлы', extensions: ['*'] }
                    ],
                    properties: ['openFile']
                });

                return result;
            } catch (err) {
                console.error('File selection error:', err);
                throw err;
            }
        });

        // Установка фона
        this.ipcMain.handle('set-background', async (e, backgroundConfig) => {
            try {
                console.log('Setting background:', backgroundConfig);

                const config = this.configManager.getConfig();

                if (backgroundConfig.type !== 'default') {
                    if (!fs.existsSync(backgroundConfig.path)) {
                        throw new Error('Выбранный файл не существует');
                    }
                }

                config.background = {
                    type: backgroundConfig.type,
                    path: backgroundConfig.path
                };

                await this.configManager.saveConfig(config);

                const mainWindow = this.windowManager.getMainWindow();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('background-changed', config.background);
                }

                return { success: true, background: config.background };
            } catch (err) {
                console.error('Failed to set background:', err);
                return { success: false, error: err.message };
            }
        });

        // Получение текущего фона
        this.ipcMain.handle('get-background', () => {
            const config = this.configManager.getConfig();
            const background = config.background || { type: 'default', path: 'background.webm' };

            // Нормализуем старые пути из предыдущей версии (../assets → ../../assets)
            if (background.path && background.path.startsWith('../assets/')) {
                background.path = background.path.replace('../assets/', '../../assets/');
            }

            const resolvedPath = this.resolveBackgroundPath(background.path);
            return { ...background, resolvedPath };
        });

        // Сброс фона
        this.ipcMain.handle('reset-background', async () => {
            try {
                const config = this.configManager.getConfig();
                config.background = { type: 'default', path: 'background.webm' };
                await this.configManager.saveConfig(config);

                const mainWindow = this.windowManager.getMainWindow();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('background-changed', config.background);
                }

                return { success: true };
            } catch (err) {
                return { success: false, error: err.message };
            }
        });
    }
}

module.exports = BackgroundHandlers;
