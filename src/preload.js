const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Управление окном
  minimize: () => ipcRenderer.send('window-close'), // Всегда скрываем в трей
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  show: () => ipcRenderer.send('window-show'),

  // Конфигурация
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  saveNick: (nick) => ipcRenderer.invoke('save-nick', nick),

  // Версии
  getVersions: () => ipcRenderer.invoke('get-versions'),
  refreshVersions: () => ipcRenderer.invoke('refresh-versions'),
  checkInstalledVersions: (versions) => ipcRenderer.invoke('check-installed-versions', versions),

  // Загрузка и запуск
  downloadVersion: (data) => ipcRenderer.invoke('download-version', data),
  launchGame: (data) => ipcRenderer.invoke('launch-game', data),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (e, progress) => callback(progress));
  },

  // Модпак
  getModpackManifest: () => ipcRenderer.invoke('get-modpack-manifest'),
  checkModpackInstalled: () => ipcRenderer.invoke('check-modpack-installed'),
  downloadModpack: () => ipcRenderer.invoke('download-modpack'),
  launchModpack: (data) => ipcRenderer.invoke('launch-modpack', data),
  onModpackProgress: (callback) => {
    ipcRenderer.on('modpack-progress', (e, progress) => callback(progress));
  },
  
  // Java прогресс
  onJavaProgress: (callback) => {
    ipcRenderer.on('java-progress', (e, progress) => callback(progress));
  },

  // Утилиты
  openFolder: () => ipcRenderer.invoke('open-folder'),
  selectBackgroundFile: () => ipcRenderer.invoke('select-background-file'),

  // Фон лаунчера
  setBackground: (backgroundConfig) => ipcRenderer.invoke('set-background', backgroundConfig),
  getBackground: () => ipcRenderer.invoke('get-background'),
  resetBackground: () => ipcRenderer.invoke('reset-background'),
  onBackgroundChanged: (callback) => {
    ipcRenderer.on('background-changed', (e, background) => callback(background));
  },

  // Консоль отладки
  openConsole: () => ipcRenderer.invoke('open-console'),
  onConsoleLog: (callback) => {
    ipcRenderer.on('console-log', (e, logData) => callback(logData));
  },
  
  // Отправка логов из рендерера в основной процесс
  sendConsoleLog: (logData) => {
    ipcRenderer.send('console-log-from-renderer', logData);
  },

  // === Автообновление ===
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (e, info) => callback(info));
  },
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (e, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', () => callback());
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update-error', (e, error) => callback(error));
  }
});