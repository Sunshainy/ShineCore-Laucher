const { app, ipcMain } = require('electron');
const path = require('path');

// Core модули
const WindowManager = require('./WindowManager');
const TrayManager = require('./TrayManager');
const ConfigManager = require('./ConfigManager');
const ProcessMonitor = require('./ProcessMonitor');

// IPC handlers
const WindowHandlers = require('../ipc/window-handlers');
const ConfigHandlers = require('../ipc/config-handlers');
const VersionHandlers = require('../ipc/version-handlers');
const ModpackHandlers = require('../ipc/modpack-handlers');
const BackgroundHandlers = require('../ipc/background-handlers');
const ConsoleHandlers = require('../ipc/console-handlers');
const UpdateHandlers = require('../ipc/update-handlers');

// Утилиты
const Logger = require('../utils/Logger');
const DownloadUtil = require('../utils/DownloadUtil');

// Загрузчики
const VanillaDownloader = require('../loaders/vanilla/VanillaDownloader');
const FabricDownloader = require('../loaders/fabric/FabricDownloader');

// Игровая логика
const GameLauncher = require('../game/GameLauncher');
const JavaManager = require('../game/JavaManager');

// Модпаки
const ModpackLauncher = require('../modpacks/ModpackLauncher');

/**
 * Главный процесс приложения
 * Координирует все подсистемы лаунчера
 */
class MainProcess {
    constructor() {
        this.minecraftDir = path.join(app.getPath('userData'), '.minecraft');

        // Инициализация утилит
        this.logger = new Logger(this.minecraftDir);
        this.downloader = new DownloadUtil(this.logger);

        // Инициализация загрузчиков
        this.vanilla = new VanillaDownloader(this.minecraftDir);
        this.fabric = new FabricDownloader(this.minecraftDir);

        // Инициализация игровой логики
        this.game = new GameLauncher(this.minecraftDir);
        this.java = new JavaManager(this.minecraftDir);
        this.modpack = new ModpackLauncher(this.minecraftDir);

        // Инициализация Core модулей
        this.configManager = new ConfigManager();
        this.windowManager = new WindowManager();
        this.processMonitor = new ProcessMonitor(this.windowManager);
        this.trayManager = new TrayManager(this.windowManager);

        // Логирование старта
        this.logStartup();

        // Инициализация IPC handlers
        this.setupIPCHandlers();

        // Перехват console.log для отправки в консоль отладки
        this.interceptConsoleLogs();
    }

    /**
     * Логирование информации о запуске
     */
    logStartup() {
        console.log('=== ShineCore Launcher Started ===');
        console.log('App version:', app.getVersion());
        console.log('Minecraft directory:', this.minecraftDir);
        console.log('Platform:', process.platform);
        console.log('Node version:', process.version);
        console.log('Electron version:', process.versions.electron);
    }

    /**
     * Настройка всех IPC обработчиков
     */
    setupIPCHandlers() {
        // Окна
        new WindowHandlers(ipcMain, this.windowManager);

        // Конфигурация
        new ConfigHandlers(ipcMain, this.configManager);

        // Версии
        new VersionHandlers(
            ipcMain,
            this.vanilla,
            this.fabric,
            this.game,
            this.java,
            this.windowManager,
            this.processMonitor,
            this.logger
        );

        // Модпаки
        new ModpackHandlers(
            ipcMain,
            this.modpack,
            this.game,
            this.java,
            this.windowManager,
            this.processMonitor,
            this.logger,
            this.minecraftDir
        );

        // Фон
        new BackgroundHandlers(ipcMain, this.configManager, this.windowManager);

        // Консоль
        this.consoleHandlers = new ConsoleHandlers(ipcMain, this.windowManager);

        // Автообновления
        new UpdateHandlers(ipcMain, this.windowManager);
    }

    /**
     * Перехват console.log для отправки в консоль отладки
     */
    interceptConsoleLogs() {
        // Устанавливаем кодировку для Windows
        if (process.platform === 'win32') {
            if (process.stdout.setEncoding) {
                process.stdout.setEncoding('utf8');
            }
            if (process.stderr.setEncoding) {
                process.stderr.setEncoding('utf8');
            }
        }

        const originalConsole = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
            debug: console.debug
        };

        const safeSerialize = (arg) => {
            if (typeof arg !== 'object' || arg === null) {
                return String(arg);
            }
            try {
                return JSON.stringify(arg, null, 2);
            } catch (err) {
                return `[Unserializable object: ${err.message}]`;
            }
        };

        const sendToConsole = (level, ...args) => {
            const message = args.map(safeSerialize).join(' ');

            const logEntry = {
                level: level,
                message: message,
                timestamp: new Date(),
                source: 'main'
            };

            // Добавляем лог в консоль
            if (this.consoleHandlers) {
                this.consoleHandlers.addLog(logEntry);
            }

            return logEntry;
        };

        console.log = (...args) => {
            sendToConsole('info', ...args);
            originalConsole.log.apply(console, args);
        };

        console.info = (...args) => {
            sendToConsole('info', ...args);
            originalConsole.info.apply(console, args);
        };

        console.warn = (...args) => {
            sendToConsole('warning', ...args);
            originalConsole.warn.apply(console, args);
        };

        console.error = (...args) => {
            sendToConsole('error', ...args);
            originalConsole.error.apply(console, args);
        };

        console.debug = (...args) => {
            sendToConsole('debug', ...args);
            originalConsole.debug.apply(console, args);
        };
    }

    /**
     * Создание главного окна
     */
    createMainWindow() {
        return this.windowManager.createMainWindow();
    }

    /**
     * Создание трея
     */
    createTray() {
        return this.trayManager.create();
    }

    /**
     * Cleanup перед закрытием
     */
    cleanup() {
        try {
            const mainWindow = this.windowManager.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.session.clearCache().catch(() => {});
            }
        } catch (err) {
            console.error('Error during cleanup:', err);
        }
    }
}

module.exports = MainProcess;
