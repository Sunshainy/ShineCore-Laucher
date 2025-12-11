const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');

// Настройка логирования
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Устанавливаем правильную кодировку для консоли на Windows
if (process.platform === 'win32') {
    // Устанавливаем UTF-8 кодировку для консоли
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
  // Если уже запущен, фокусируем существующее окно и закрываем этот экземпляр
  app.quit();
  process.exit(0);
}

let mainProcess; // Объявляем переменную, но не инициализируем пока

// Обработчик второго экземпляра
app.on('second-instance', () => {
  try {
    if (mainProcess && mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed()) {
      if (mainProcess.mainWindow.isMinimized()) {
        mainProcess.mainWindow.restore();
      }
      mainProcess.mainWindow.show();
      mainProcess.mainWindow.focus();
    }
  } catch (err) {
    console.error('Error in second-instance handler:', err.message);
  }
});

// Обработчик для очистки перед выходом
app.on('before-quit', () => {
  try {
    if (mainProcess && mainProcess.mainWindow && !mainProcess.mainWindow.isDestroyed()) {
      mainProcess.mainWindow.webContents.session.clearCache().catch(() => {});
    }
  } catch (err) {
    console.error('Error in before-quit handler:', err);
  }
});

// Импортируем классы лаунчера
const VanillaDownloader = require('./launcher/vanilla-downloader');
const FabricDownloader = require('./launcher/fabric-downloader');
const GameLauncher = require('./launcher/game-launcher');
const ModpackLauncher = require('./launcher/modpack-launcher');
const Logger = require('./launcher/logger');
const JavaManager = require('./launcher/java-manager');

class MainProcess {
  constructor() {
    this.minecraftDir = path.join(app.getPath('userData'), '.minecraft');
    this.configPath = path.join(app.getPath('userData'), 'config.json');
    this.mainWindow = null;
    this.consoleWindow = null;
    this.tray = null;
    
    // Инициализация модулей
    this.logger = new Logger(this.minecraftDir);
    this.vanilla = new VanillaDownloader(this.minecraftDir);
    this.fabric = new FabricDownloader(this.minecraftDir);
    this.game = new GameLauncher(this.minecraftDir);
    this.modpack = new ModpackLauncher(this.minecraftDir);
    
    // Кеш версий
    this.versionsCache = null;
    this.modpackManifestCache = null;
    
    // Мониторинг процессов Minecraft
    this.minecraftProcesses = new Set();
    this.processMonitorInterval = null;
    
    // Логи для консоли
    this.consoleLogs = [];
    this.maxConsoleLogs = 1000;
    
    this.setupIPC();
    this.interceptConsoleLogs();
    this.setupAutoUpdater();
    
    // Добавляем логирование запуска
    console.log('=== ShineCore Launcher Started ===');
    console.log('App version:', app.getVersion());
    console.log('Minecraft directory:', this.minecraftDir);
    console.log('Platform:', process.platform);
    console.log('Node version:', process.version);
    console.log('Electron version:', process.versions.electron);
  }

  createWindow() {
  this.mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 1000,
    minHeight: 650,
    frame: false,
    transparent: true,
    resizable: true,
    backgroundColor: '#00000000',
    
    // КРИТИЧЕСКИ ВАЖНО: отключаем системные закругления
    roundedCorners: false, // для macOS
    hasShadow: false, // временно отключаем тень
    
    // Для Windows
    thickFrame: false,
    
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, 'assets', 'icon.ico')
  });

  // Дополнительные меры для Windows
  if (process.platform === 'win32') {
    this.mainWindow.setBackgroundMaterial('none');
    // Принудительно обновляем окно
    this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
    setTimeout(() => {
      this.mainWindow.setAlwaysOnTop(false);
    }, 100);
  }

  this.mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  
  if (process.env.NODE_ENV === 'development') {
    this.mainWindow.webContents.openDevTools();
  }

  // Обработчик закрытия окна
  this.mainWindow.on('closed', () => {
    console.log('Main window closed, cleaning up references');
    this.mainWindow = null;
  });

  // Обработчик для перехвата попытки закрытия
  this.mainWindow.on('close', (event) => {
    // Предотвращаем закрытие окна - вместо этого скрываем его
    if (this.minecraftProcesses.size === 0) {
      // Если Minecraft не запущен, разрешаем закрытие
      // иначе скрываем окно
    } else {
      // Если Minecraft запущен, скрываем окно
      event.preventDefault();
      this.mainWindow.hide();
    }
  });
}

  setupAutoUpdater() {
    // Настройка автообновления
    autoUpdater.autoDownload = false; // Не скачиваем автоматически, спрашиваем пользователя
    autoUpdater.autoInstallOnAppQuit = false; // Не устанавливаем при выходе автоматически

    console.log('Setting up auto-updater...');
    console.log('Current version:', app.getVersion());

    // Событие: проверка обновлений
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for update...');
    });

    // Событие: обновление доступно
    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      console.log('Release notes:', info.releaseNotes);
      
      // Отправляем в рендерер вместо системного диалога
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('update-available', {
          version: info.version,
          releaseNotes: info.releaseNotes,
          releaseDate: info.releaseDate
        });
      }
    });

    // Событие: обновление недоступно
    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available. Current version is:', info.version);
    });

    // Событие: ошибка при обновлении
    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('update-error', err.message || 'Ошибка автообновления');
      }
    });

    // Событие: прогресс загрузки
    autoUpdater.on('download-progress', (progressObj) => {
      const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
      console.log(logMessage);
      
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('update-download-progress', {
          percent: progressObj.percent,
          bytesPerSecond: progressObj.bytesPerSecond,
          transferred: progressObj.transferred,
          total: progressObj.total
        });
      }
    });

    // Событие: обновление скачано
    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('update-downloaded');
      }
    });

    // Автоматическая проверка обновлений при запуске (через 5 секунд)
    setTimeout(() => {
      console.log('Starting automatic update check...');
      autoUpdater.checkForUpdates().catch(err => {
        console.error('Auto-update check failed:', err);
      });
    }, 5000);

    // Периодическая проверка обновлений каждые 30 минут
    setInterval(() => {
      console.log('Periodic update check...');
      autoUpdater.checkForUpdates().catch(err => {
        console.error('Periodic update check failed:', err);
      });
    }, 30 * 60 * 1000);
  }

  setupIPC() {
    // === Управление окном ===
    ipcMain.on('window-minimize', () => this.mainWindow?.minimize());
    ipcMain.on('window-maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
    });
    ipcMain.on('window-close', () => {
      // Скрываем окно вместо закрытия, чтобы Minecraft продолжал работать
      this.mainWindow?.hide();
    });

    ipcMain.on('window-show', () => {
      // Показываем окно после скрытия
      this.mainWindow?.show();
    });

    // === Конфигурация ===
    ipcMain.handle('get-config', () => this.getConfig());
    ipcMain.handle('save-config', (e, config) => this.saveConfig(config));
    ipcMain.handle('save-nick', (e, nick) => {
      const config = this.getConfig();
      config.nick = nick;
      return this.saveConfig(config);
    });

    // === Версии Minecraft ===
    ipcMain.handle('get-versions', async () => {
      if (!this.versionsCache) {
        const manifest = await this.vanilla.getVersionManifest();
        this.versionsCache = manifest.filter(v => v.type === 'release').slice(0, 30);
      }
      return this.versionsCache;
    });

    ipcMain.handle('refresh-versions', async () => {
      const manifest = await this.vanilla.getVersionManifest();
      this.versionsCache = manifest.filter(v => v.type === 'release').slice(0, 30);
      return this.versionsCache;
    });

    ipcMain.handle('check-installed-versions', async (e, versions) => {
      const installed = this.game.getInstalledVersions();
      return versions.map(v => ({
        version: v,
        installed: installed.includes(v)
      }));
    });

    // === Загрузка версии ===
ipcMain.handle('download-version', async (e, { versionId }) => {
  try {
    const manifest = await this.vanilla.getVersionManifest();
    const versionInfo = manifest.find(v => v.id === versionId);
    
    if (!versionInfo) {
      throw new Error(`Версия ${versionId} не найдена`);
    }

    // Создаем новый экземпляр с callback для прогресса
    const downloader = new (require('./launcher/vanilla-downloader'))(
      this.minecraftDir,
      (progress) => {
        // Отправляем прогресс в UI
        this.mainWindow?.webContents.send('download-progress', progress);
      }
    );

    await downloader.downloadVersion(versionInfo);
    
    return { success: true };
  } catch (err) {
    this.logger.error('Download error', err);
    throw err;
  }
});

    // === Запуск игры ===
    ipcMain.handle('launch-game', async (e, { nick, versionId }) => {
      try {
        const config = this.getConfig();
        const ram = config.ram || 4;
        
        // Проверяем и загружаем Java перед запуском
        console.log('Проверка Java перед запуском ванильной версии...');
        const javaManager = new JavaManager(this.minecraftDir);
        const minecraftVersion = versionId.includes('fabric-loader')
          ? versionId.split('-').pop()
          : versionId;
        const javaPath = await javaManager.ensureJava(minecraftVersion, (progress) => {
          // Отправляем прогресс Java в UI
          this.mainWindow?.webContents.send('java-progress', progress);
        });
        console.log(`Java готова: ${javaPath}`);
        
        const result = await this.game.launch(versionId, nick, ram);
        
        // Если запуск успешен и есть PID процесса, добавляем в мониторинг
        if (result && result.pid) {
          this.addMinecraftProcess(result.pid);
          console.log(`Minecraft запущен с PID: ${result.pid}`);
          return { success: true };
        } else {
          throw new Error('Не удалось получить PID процесса Minecraft');
        }
      } catch (err) {
        this.logger.error('Launch error', err);
        return { success: false, error: err.message };
      }
    });

    // === Модпак ===
    ipcMain.handle('get-modpack-manifest', async () => {
      if (!this.modpackManifestCache) {
        try {
          const url = 'http://be-sunshainy.online:8000/manifest';
          const DownloadUtil = require('./launcher/download-util');
          const downloader = new DownloadUtil(this.logger);
          this.modpackManifestCache = await downloader.fetchJson(url);
        } catch (err) {
          throw new Error('Не удалось загрузить информацию о сборке');
        }
      }
      return this.modpackManifestCache;
    });

    ipcMain.handle('check-modpack-installed', async () => {
      try {
        const manifest = await this.modpackManifestCache || await ipcMain.handle('get-modpack-manifest');
        const versionId = manifest.loader === 'fabric'
          ? `fabric-loader-${manifest.loader_version}-${manifest.minecraft}`
          : manifest.minecraft;
        
        const installed = this.game.getInstalledVersions();
        const versionInstalled = installed.includes(versionId);
        
        // Для пользователя всегда показываем "Играть", если версия установлена
        // Автоматическая проверка и дозагрузка произойдет при нажатии
        return {
          installed: versionInstalled, // Всегда true если версия установлена
          versionInstalled
        };
      } catch {
        return { installed: false, versionInstalled: false };
      }
    });

    ipcMain.handle('download-modpack', async () => {
  try {
    // Создаем экземпляр с callback для прогресса
    const ModpackLauncher = require('./launcher/modpack-launcher');
    const modpackLauncher = new ModpackLauncher(
      this.minecraftDir,
      (progress) => {
        // Отправляем прогресс в UI
        this.mainWindow?.webContents.send('modpack-progress', progress);
      }
    );
    
    await modpackLauncher.launchFromServer('be-sunshainy.online:8000');
    
    return { success: true };
  } catch (err) {
    this.logger.error('Modpack download error', err);
    throw err;
  }
});

    ipcMain.handle('launch-modpack', async (e, { nick }) => {
      try {
        const manifest = this.modpackManifestCache;
        const config = this.getConfig();
        const ram = config.ram || 4;
        const versionId = manifest.loader === 'fabric'
          ? `fabric-loader-${manifest.loader_version}-${manifest.minecraft}`
          : manifest.minecraft;
        
        // Проверяем и загружаем Java перед запуском
        console.log('Проверка Java перед запуском модпака...');
        const javaManager = new JavaManager(this.minecraftDir);
        const minecraftVersion = manifest.minecraft;
        const javaPath = await javaManager.ensureJava(minecraftVersion, (progress) => {
          // Отправляем прогресс Java в UI
          this.mainWindow?.webContents.send('java-progress', progress);
        });
        console.log(`Java готова: ${javaPath}`);
        
        const result = await this.game.launch(versionId, nick, ram);
        
        // Если запуск успешен и есть PID процесса, добавляем в мониторинг
        if (result && result.pid) {
          this.addMinecraftProcess(result.pid);
          console.log(`Minecraft запущен с PID: ${result.pid}`);
          return { success: true };
        } else {
          throw new Error('Не удалось получить PID процесса Minecraft');
        }
      } catch (err) {
        this.logger.error('Modpack launch error', err);
        return { success: false, error: err.message };
      }
    });

    // === Утилиты ===
    ipcMain.handle('open-folder', () => {
      shell.openPath(this.minecraftDir);
    });

    // === Выбор файла фона ===
    ipcMain.handle('select-background-file', async () => {
      try {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
          throw new Error('Окно приложения не инициализировано');
        }
        const result = await dialog.showOpenDialog(this.mainWindow, {
          title: 'Выберите файл фона',
          filters: [
            { name: 'Изображения', extensions: ['jpg', 'jpeg', 'png'] },
            { name: 'Видео', extensions: ['webm', 'mp4'] },
            { name: 'Все файлы', extensions: ['*'] }
          ],
          properties: ['openFile']
        });
        
        console.log('File dialog result:', result);
        return result;
      } catch (err) {
        console.error('File selection error:', err);
        throw err;
      }
    });

    // === Фон лаунчера ===
    ipcMain.handle('set-background', async (e, backgroundConfig) => {
      try {
        console.log('Setting background in main process:', backgroundConfig);
        console.log('Background type:', backgroundConfig.type);
        console.log('Background path:', backgroundConfig.path);
        
        const config = this.getConfig();
        
        // Проверяем существование файла для пользовательских фонов
        if (backgroundConfig.type !== 'default') {
          if (!fs.existsSync(backgroundConfig.path)) {
            console.error('Source file does not exist:', backgroundConfig.path);
            throw new Error('Выбранный файл не существует');
          }
          console.log('File exists, using original path:', backgroundConfig.path);
        }
        
        // Сохраняем оригинальный путь к файлу
        config.background = {
          type: backgroundConfig.type,
          path: backgroundConfig.path
        };
        
        console.log('Saving background config:', config.background);
        await this.saveConfig(config);
        
        // Отправляем обновление всем окнам
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          console.log('Sending background-changed event to renderer');
          try {
            this.mainWindow.webContents.send('background-changed', config.background);
          } catch (err) {
            console.warn('Failed to send background change notification:', err.message);
          }
        }
        
        console.log('Background set successfully');
        return { success: true, background: config.background };
      } catch (err) {
        console.error('Failed to set background:', err);
        console.error('Error stack:', err.stack);
        this.logger.error('Failed to set background', err);
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('get-background', () => {
      const config = this.getConfig();
      const background = config.background || { type: 'default', path: '../assets/background.webm' };
      console.log('Returning background config:', background);
      return background;
    });

    ipcMain.handle('reset-background', async () => {
      try {
        const config = this.getConfig();
        
        // Просто устанавливаем стандартный фон, не удаляя пользовательские файлы
        config.background = { type: 'default', path: '../assets/background.webm' };
        await this.saveConfig(config);
        
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          try {
            this.mainWindow.webContents.send('background-changed', config.background);
          } catch (err) {
            console.warn('Failed to send background change notification:', err.message);
          }
        }
        
        return { success: true };
      } catch (err) {
        this.logger.error('Failed to reset background', err);
        return { success: false, error: err.message };
      }
    });

    // === Консоль отладки ===
    ipcMain.handle('open-console', () => {
      this.createConsoleWindow();
      return { success: true };
    });

    // Получение логов из рендерера
    ipcMain.on('console-log-from-renderer', (e, logData) => {
      // Отправляем лог в окно консоли
      if (this.consoleWindow && !this.consoleWindow.isDestroyed()) {
        this.consoleWindow.webContents.send('console-log', logData);
      }
    });

    // === Автообновление ===
    ipcMain.handle('check-for-updates', async () => {
      try {
        console.log('Manual update check requested');
        const result = await autoUpdater.checkForUpdates();
        return result;
      } catch (err) {
        console.error('Check for updates error:', err);
        throw err;
      }
    });

    ipcMain.handle('start-update-download', async () => {
      try {
        console.log('Starting update download');
        await autoUpdater.downloadUpdate();
      } catch (err) {
        console.error('Download update error:', err);
        throw err;
      }
    });

    ipcMain.on('quit-and-install', () => {
      console.log('Quitting and installing update');
      // Закрываем все окна Minecraft перед обновлением
      this.minecraftProcesses.clear();
      autoUpdater.quitAndInstall(false, true);
    });
  }

  getConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (e) {
      this.logger.error('Config read error', e);
    }
    return {
      nick: 'Player',
      ram: 4,
      debugLogging: false,
      background: {
        type: 'default',
        path: '../assets/background.webm'
      }
    };
  }

  saveConfig(config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      return config;
    } catch (e) {
      this.logger.error('Config save error', e);
      throw e;
    }
  }

  // Добавляем процесс Minecraft в мониторинг
  addMinecraftProcess(pid) {
    this.minecraftProcesses.add(pid);
    console.log('Added Minecraft process to monitoring:', pid);
    
    // Автоматически скрываем лаунчер при запуске Minecraft
    if (this.mainWindow && this.mainWindow.isVisible()) {
      this.mainWindow.hide();
      console.log('Auto-hiding launcher because Minecraft started');
    }
    
    // Запускаем мониторинг, если еще не запущен
    if (!this.processMonitorInterval) {
      this.startProcessMonitoring();
    }
  }

  // Удаляем процесс Minecraft из мониторинга
  removeMinecraftProcess(pid) {
    this.minecraftProcesses.delete(pid);
    console.log('Removed Minecraft process from monitoring:', pid);
    
    // Если все процессы Minecraft закрыты, показываем лаунчер
    if (this.minecraftProcesses.size === 0) {
      if (this.mainWindow && !this.mainWindow.isVisible()) {
        this.mainWindow.show();
        this.mainWindow.focus();
        console.log('Auto-showing launcher because all Minecraft processes closed');
      }
    }
  }

  // Мониторинг процессов Minecraft
  startProcessMonitoring() {
    this.processMonitorInterval = setInterval(() => {
      const processesToRemove = [];
      
      for (const pid of this.minecraftProcesses) {
        try {
          // Проверяем, существует ли процесс
          process.kill(pid, 0); // Отправляем сигнал 0 для проверки существования
        } catch (error) {
          // Процесс не существует, добавляем в список для удаления
          processesToRemove.push(pid);
        }
      }
      
      // Удаляем несуществующие процессы
      processesToRemove.forEach(pid => this.removeMinecraftProcess(pid));
      
      // Если нет активных процессов, останавливаем мониторинг
      if (this.minecraftProcesses.size === 0) {
        this.stopProcessMonitoring();
      }
    }, 5000); // Проверяем каждые 5 секунд
  }

  // Останавливаем мониторинг процессов
  stopProcessMonitoring() {
    if (this.processMonitorInterval) {
      clearInterval(this.processMonitorInterval);
      this.processMonitorInterval = null;
      console.log('Stopped Minecraft process monitoring');
    }
  }

  createConsoleWindow() {
    if (this.consoleWindow) {
      this.consoleWindow.show();
      this.consoleWindow.focus();
      return;
    }

    this.consoleWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      minWidth: 800,
      minHeight: 500,
      title: 'Консоль отладки - ShineCore Launcher',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false
      },
      icon: path.join(__dirname, 'assets', 'icon.ico'),
      show: false
    });

    this.consoleWindow.loadFile(path.join(__dirname, 'ui', 'console.html'));

    this.consoleWindow.once('ready-to-show', () => {
      this.consoleWindow.show();
      this.consoleWindow.focus();
      
      // Отправляем все сохраненные логи в новое окно консоли
      this.sendAllLogsToConsole();
    });

    this.consoleWindow.on('closed', () => {
      this.consoleWindow = null;
    });

    // Перехватываем console.log и отправляем в окно консоли
    this.interceptConsoleLogs();
    
    // Сохраняем начальные логи в буфер
    this.consoleLogs.push({
        level: 'info',
        message: '=== ShineCore Launcher Started ===',
        timestamp: new Date()
    });
    this.consoleLogs.push({
        level: 'info',
        message: `App version: ${app.getVersion()}`,
        timestamp: new Date()
    });
    this.consoleLogs.push({
        level: 'info',
        message: `Minecraft directory: ${this.minecraftDir}`,
        timestamp: new Date()
    });
    this.consoleLogs.push({
        level: 'info',
        message: `Platform: ${process.platform}`,
        timestamp: new Date()
    });
    this.consoleLogs.push({
        level: 'info',
        message: `Node version: ${process.version}`,
        timestamp: new Date()
    });
    this.consoleLogs.push({
        level: 'info',
        message: `Electron version: ${process.versions.electron}`,
        timestamp: new Date()
    });
  }

  interceptConsoleLogs() {
    // Устанавливаем кодировку для всех логов
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

    const sendToConsole = (level, ...args) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      // Сохраняем лог
      const logEntry = {
        level: level,
        message: message,
        timestamp: new Date()
      };

      this.consoleLogs.push(logEntry);
      if (this.consoleLogs.length > this.maxConsoleLogs) {
        this.consoleLogs.shift();
      }

      // Отправляем в окно консоли, если оно открыто
      if (this.consoleWindow && !this.consoleWindow.isDestroyed()) {
        this.consoleWindow.webContents.send('console-log', logEntry);
      }

      // Вызываем оригинальный метод
      return logEntry;
    };

    console.log = (...args) => {
      const logEntry = sendToConsole('info', ...args);
      originalConsole.log.apply(console, args);
    };

    console.info = (...args) => {
      const logEntry = sendToConsole('info', ...args);
      originalConsole.info.apply(console, args);
    };

    console.warn = (...args) => {
      const logEntry = sendToConsole('warning', ...args);
      originalConsole.warn.apply(console, args);
    };

    console.error = (...args) => {
      const logEntry = sendToConsole('error', ...args);
      originalConsole.error.apply(console, args);
    };

    console.debug = (...args) => {
      const logEntry = sendToConsole('debug', ...args);
      originalConsole.debug.apply(console, args);
    };

    // Перехватываем process.stdout и process.stderr
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;

    process.stdout.write = (chunk, encoding, callback) => {
      if (typeof chunk === 'string') {
        sendToConsole('info', chunk);
      }
      return originalStdoutWrite.call(process.stdout, chunk, encoding, callback);
    };

    process.stderr.write = (chunk, encoding, callback) => {
      if (typeof chunk === 'string') {
        sendToConsole('error', chunk);
      }
      return originalStderrWrite.call(process.stderr, chunk, encoding, callback);
    };
  }

  // Отправка всех сохраненных логов в окно консоли
  sendAllLogsToConsole() {
    if (!this.consoleWindow || this.consoleWindow.isDestroyed()) return;
    
    console.log(`Sending ${this.consoleLogs.length} saved logs to console window`);
    
    // Отправляем все логи по одному с небольшой задержкой
    this.consoleLogs.forEach((log, index) => {
      setTimeout(() => {
        if (this.consoleWindow && !this.consoleWindow.isDestroyed()) {
          this.consoleWindow.webContents.send('console-log', log);
        }
      }, index * 10); // Небольшая задержка между логами
    });
  }

  createTray() {
    try {
      // Создаем иконку в системном трее
      const iconPath = path.join(__dirname, 'assets', 'icon-tray.png');
      console.log('Creating tray with icon:', iconPath);
      
      if (!fs.existsSync(iconPath)) {
        console.error('Tray icon not found:', iconPath);
        // Пробуем использовать другую иконку
        const fallbackIcon = path.join(__dirname, 'assets', 'icon.ico');
        if (fs.existsSync(fallbackIcon)) {
          this.tray = new Tray(fallbackIcon);
        } else {
          // Создаем трей без иконки
          this.tray = new Tray(path.join(__dirname, 'assets', 'logo.svg'));
        }
      } else {
        this.tray = new Tray(iconPath);
      }
      
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Развернуть лаунчер',
          click: () => {
            try {
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.show();
                this.mainWindow.focus();
              }
            } catch (err) {
              console.error('Error showing main window from tray:', err.message);
            }
          }
        },
        {
          label: 'Открыть консоль',
          click: () => {
            this.createConsoleWindow();
          }
        },
        {
          label: 'Выход',
          click: () => {
            app.quit();
          }
        }
      ]);
      
      this.tray.setToolTip('ShineCore Launcher - клик для показа/скрытия');
      this.tray.setContextMenu(contextMenu);
      
      // Одинарный клик по иконке трея показывает/скрывает лаунчер
      this.tray.on('click', () => {
        try {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            if (this.mainWindow.isVisible()) {
              this.mainWindow.hide();
            } else {
              this.mainWindow.show();
              this.mainWindow.focus();
            }
          }
        } catch (err) {
          console.error('Error handling tray click:', err.message);
        }
      });
      
      // Двойной клик по иконке трея открывает лаунчер
      this.tray.on('double-click', () => {
        try {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.show();
            this.mainWindow.focus();
          }
        } catch (err) {
          console.error('Error handling tray double-click:', err.message);
        }
      });
      
      console.log('Tray created successfully');
    } catch (error) {
      console.error('Failed to create tray:', error);
      // Продолжаем работу без трея
    }
  }
}

app.whenReady().then(() => {
  // Инициализируем mainProcess после объявления класса
  mainProcess = new MainProcess();
  mainProcess.createWindow();
  mainProcess.createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainProcess.createWindow();
    }
  });
});

// Глобальный обработчик необработанных исключений в основном процессе
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in main process:', error);
  console.error('Stack:', error.stack);
  // Продолжаем работу, не выходим из приложения
});

// Обработчик необработанных Promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Продолжаем работу, не выходим из приложения
});

app.on('window-all-closed', () => {
  // Не закрываем приложение полностью, чтобы Minecraft продолжал работать
  // Приложение будет работать в фоне с иконкой в трее
  if (process.platform !== 'darwin') {
    // Приложение продолжит работать в фоне
    // Пользователь может открыть лаунчер через иконку в трее
  }
});