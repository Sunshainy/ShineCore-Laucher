const { BrowserWindow } = require('electron');
const path = require('path');
const { app } = require('electron');

/**
 * Менеджер окон приложения
 * Управляет созданием и жизненным циклом окон
 */
class WindowManager {
    constructor() {
        this.mainWindow = null;
        this.consoleWindow = null;
    }

    /**
     * Создание главного окна
     */
    createMainWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 750,
            minWidth: 1000,
            minHeight: 650,
            frame: false,
            transparent: true,
            resizable: true,
            backgroundColor: '#00000000',
            roundedCorners: false,
            hasShadow: false,
            thickFrame: false,
            webPreferences: {
                preload: path.join(__dirname, '..', 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false
            },
            icon: path.join(__dirname, '..', 'assets', 'icon.ico')
        });

        // Дополнительные настройки для Windows
        if (process.platform === 'win32') {
            this.mainWindow.setBackgroundMaterial('none');
            this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
            setTimeout(() => {
                this.mainWindow.setAlwaysOnTop(false);
            }, 100);
        }

        this.mainWindow.loadFile(path.join(__dirname, '..', 'ui', 'windows', 'main', 'index.html'));

        // Открывайте DevTools вручную при необходимости (Ctrl+Shift+I)
        // this.mainWindow.webContents.openDevTools({ mode: 'detach' });

        this.mainWindow.on('closed', () => {
            console.log('Main window closed');
            this.mainWindow = null;
        });

        return this.mainWindow;
    }

    /**
     * Создание окна консоли отладки
     */
    createConsoleWindow() {
        if (this.consoleWindow) {
            this.consoleWindow.show();
            this.consoleWindow.focus();
            return this.consoleWindow;
        }

        this.consoleWindow = new BrowserWindow({
            width: 1000,
            height: 700,
            minWidth: 800,
            minHeight: 500,
            title: 'Консоль отладки - ShineCore Launcher',
            webPreferences: {
                preload: path.join(__dirname, '..', 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false
            },
            icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
            show: false
        });

        this.consoleWindow.loadFile(path.join(__dirname, '..', 'ui', 'windows', 'console', 'console.html'));

        this.consoleWindow.once('ready-to-show', () => {
            this.consoleWindow.show();
            this.consoleWindow.focus();
        });

        this.consoleWindow.on('closed', () => {
            this.consoleWindow = null;
        });

        return this.consoleWindow;
    }

    /**
     * Получение главного окна
     */
    getMainWindow() {
        return this.mainWindow;
    }

    /**
     * Получение окна консоли
     */
    getConsoleWindow() {
        return this.consoleWindow;
    }

    /**
     * Проверка существования главного окна
     */
    hasMainWindow() {
        return this.mainWindow !== null && !this.mainWindow.isDestroyed();
    }

    /**
     * Проверка существования окна консоли
     */
    hasConsoleWindow() {
        return this.consoleWindow !== null && !this.consoleWindow.isDestroyed();
    }

    /**
     * Показать главное окно
     */
    showMainWindow() {
        if (this.hasMainWindow()) {
            this.mainWindow.show();
            this.mainWindow.focus();
        }
    }

    /**
     * Скрыть главное окно
     */
    hideMainWindow() {
        if (this.hasMainWindow()) {
            this.mainWindow.hide();
        }
    }

    /**
     * Минимизировать главное окно
     */
    minimizeMainWindow() {
        if (this.hasMainWindow()) {
            this.mainWindow.minimize();
        }
    }

    /**
     * Максимизировать/восстановить главное окно
     */
    toggleMaximizeMainWindow() {
        if (this.hasMainWindow()) {
            if (this.mainWindow.isMaximized()) {
                this.mainWindow.unmaximize();
            } else {
                this.mainWindow.maximize();
            }
        }
    }
}

module.exports = WindowManager;
