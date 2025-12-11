/**
 * IPC обработчики для управления окнами
 */
class WindowHandlers {
    constructor(ipcMain, windowManager) {
        this.ipcMain = ipcMain;
        this.windowManager = windowManager;
        this.setup();
    }

    setup() {
        // Минимизация
        this.ipcMain.on('window-minimize', () => {
            this.windowManager.minimizeMainWindow();
        });

        // Максимизация/восстановление
        this.ipcMain.on('window-maximize', () => {
            this.windowManager.toggleMaximizeMainWindow();
        });

        // Закрытие (скрытие в трей)
        this.ipcMain.on('window-close', () => {
            this.windowManager.hideMainWindow();
        });

        // Показать окно
        this.ipcMain.on('window-show', () => {
            this.windowManager.showMainWindow();
        });
    }
}

module.exports = WindowHandlers;
