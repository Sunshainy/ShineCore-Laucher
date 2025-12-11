const { Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Менеджер системного трея
 * Управляет иконкой в трее и контекстным меню
 */
class TrayManager {
    constructor(windowManager) {
        this.tray = null;
        this.windowManager = windowManager;
    }

    /**
     * Создание трея
     */
    create() {
        try {
            const iconPath = path.join(__dirname, '..', 'assets', 'icon-tray.png');
            console.log('Creating tray with icon:', iconPath);

            if (!fs.existsSync(iconPath)) {
                console.error('Tray icon not found:', iconPath);
                const fallbackIcon = path.join(__dirname, '..', 'assets', 'icon.ico');
                if (fs.existsSync(fallbackIcon)) {
                    this.tray = new Tray(fallbackIcon);
                } else {
                    this.tray = new Tray(path.join(__dirname, '..', 'assets', 'logo.svg'));
                }
            } else {
                this.tray = new Tray(iconPath);
            }

            const contextMenu = this.createContextMenu();
            this.tray.setToolTip('ShineCore Launcher - клик для показа/скрытия');
            this.tray.setContextMenu(contextMenu);

            // Одинарный клик - показать/скрыть
            this.tray.on('click', () => {
                this.toggleMainWindow();
            });

            // Двойной клик - показать
            this.tray.on('double-click', () => {
                this.windowManager.showMainWindow();
            });

            console.log('Tray created successfully');
            return this.tray;
        } catch (error) {
            console.error('Failed to create tray:', error);
            return null;
        }
    }

    /**
     * Создание контекстного меню
     */
    createContextMenu() {
        return Menu.buildFromTemplate([
            {
                label: 'Развернуть лаунчер',
                click: () => {
                    this.windowManager.showMainWindow();
                }
            },
            {
                label: 'Открыть консоль',
                click: () => {
                    this.windowManager.createConsoleWindow();
                }
            },
            {
                type: 'separator'
            },
            {
                label: 'Выход',
                click: () => {
                    const { app } = require('electron');
                    app.quit();
                }
            }
        ]);
    }

    /**
     * Переключение видимости главного окна
     */
    toggleMainWindow() {
        try {
            if (this.windowManager.hasMainWindow()) {
                const mainWindow = this.windowManager.getMainWindow();
                if (mainWindow.isVisible()) {
                    this.windowManager.hideMainWindow();
                } else {
                    this.windowManager.showMainWindow();
                }
            }
        } catch (err) {
            console.error('Error toggling main window:', err.message);
        }
    }

    /**
     * Обновление тултипа
     */
    setTooltip(text) {
        if (this.tray) {
            this.tray.setToolTip(text);
        }
    }

    /**
     * Уничтожение трея
     */
    destroy() {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }
}

module.exports = TrayManager;
