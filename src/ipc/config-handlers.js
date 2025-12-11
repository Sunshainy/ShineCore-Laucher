/**
 * IPC обработчики для конфигурации
 */
class ConfigHandlers {
    constructor(ipcMain, configManager) {
        this.ipcMain = ipcMain;
        this.configManager = configManager;
        this.setup();
    }

    setup() {
        // Получение конфигурации
        this.ipcMain.handle('get-config', () => {
            return this.configManager.getConfig();
        });

        // Сохранение конфигурации
        this.ipcMain.handle('save-config', (e, config) => {
            return this.configManager.saveConfig(config);
        });

        // Сохранение никнейма
        this.ipcMain.handle('save-nick', (e, nick) => {
            return this.configManager.set('nick', nick);
        });
    }
}

module.exports = ConfigHandlers;
