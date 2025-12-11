/**
 * IPC обработчики для модпаков
 */
const fs = require('fs');
const path = require('path');

class ModpackHandlers {
    constructor(ipcMain, modpackLauncher, gameLauncher, javaManager, windowManager, processMonitor, logger, minecraftDir) {
        this.ipcMain = ipcMain;
        this.modpack = modpackLauncher;
        this.game = gameLauncher;
        this.java = javaManager;
        this.windowManager = windowManager;
        this.processMonitor = processMonitor;
        this.logger = logger;
        this.minecraftDir = minecraftDir;
        this.modpackManifestCache = null;
        this.cacheDir = path.join(this.minecraftDir, 'cache');
        this.ensureDir(this.cacheDir);
        this.setup();
    }

    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    async loadManifest() {
        if (this.modpackManifestCache) return this.modpackManifestCache;

        const cacheFile = path.join(this.cacheDir, 'modpack_manifest.json');
        let cached = null;

        // Читаем кеш как fallback (может быть устаревшим, но лучше чем ничего)
        try {
            if (fs.existsSync(cacheFile)) {
                const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
                if (parsed?.manifest) {
                    cached = parsed.manifest;
                }
            }
        } catch (err) {
            this.logger.warn('Failed to read modpack manifest cache', err.message || err);
        }

        // Всегда пробуем актуальные данные с сервера; при ошибке — используем кеш
        try {
            const url = 'http://be-sunshainy.online:8000/manifest';
            const DownloadUtil = require('../utils/DownloadUtil');
            const Logger = require('../utils/Logger');
            const downloader = new DownloadUtil(new Logger(this.minecraftDir));
            const manifest = await downloader.fetchJson(url, 0); // без client-side TTL, но с кэшом сервера
            manifest.__fromCache = false;
            this.modpackManifestCache = manifest;

            try {
                fs.writeFileSync(cacheFile, JSON.stringify({ fetchedAt: Date.now(), manifest }, null, 2));
            } catch (e) {
                this.logger.warn('Failed to cache modpack manifest', e.message || e);
            }

            return manifest;
        } catch (err) {
            if (cached) {
                cached.__fromCache = true;
                this.modpackManifestCache = cached;
                return cached;
            }

            const offlineError = new Error('Нет соединения с сервером модпака. Установите или обновите сборку при наличии сети.');
            offlineError.code = 'OFFLINE';
            offlineError.offline = true;
            throw offlineError;
        }
    }

    setup() {
        // Получение манифеста модпака
        this.ipcMain.handle('get-modpack-manifest', async () => {
            return this.loadManifest();
        });

        // Проверка установки модпака
        this.ipcMain.handle('check-modpack-installed', async () => {
            try {
                const manifest = await this.loadManifest();
                const versionId = manifest.loader === 'fabric'
                    ? `fabric-loader-${manifest.loader_version}-${manifest.minecraft}`
                    : manifest.minecraft;

                const installed = this.game.getInstalledVersions();
                const versionInstalled = installed.includes(versionId);

                return {
                    installed: versionInstalled,
                    versionInstalled
                };
            } catch {
                return { installed: false, versionInstalled: false };
            }
        });

        // Загрузка модпака
        this.ipcMain.handle('download-modpack', async () => {
            try {
                const manifest = await this.loadManifest();
                const expectedVersion = manifest.loader === 'fabric'
                    ? `fabric-loader-${manifest.loader_version}-${manifest.minecraft}`
                    : manifest.minecraft;

                const isInstalled = this.game.getInstalledVersions().includes(expectedVersion);

                // Если манифест взят из кеша (скорее всего оффлайн) и версия уже установлена — запускаем без синхронизации
                if (manifest.__fromCache && isInstalled) {
                    return { success: true, skipped: true, offline: true };
                }

                const ModpackLauncher = require('../modpacks/ModpackLauncher');
                const modpackLauncher = new ModpackLauncher(
                    this.minecraftDir,
                    (progress) => {
                        this.windowManager.getMainWindow()?.webContents.send('modpack-progress', progress);
                    }
                );

                await modpackLauncher.launchFromServer('be-sunshainy.online:8000');
                return { success: true };
            } catch (err) {
                this.logger.error('Modpack download error', err);

                // Чёткая оффлайн-ошибка вместо падения UI
                if (err.code === 'OFFLINE' || err.offline) {
                    throw new Error('Нет соединения с сервером модпака. Установите сборку при наличии сети.');
                }

                throw err;
            }
        });

        // Запуск модпака
        this.ipcMain.handle('launch-modpack', async (e, { nick }) => {
            try {
                const manifest = await this.loadManifest();
                const ConfigManager = require('../core/ConfigManager');
                const configManager = new ConfigManager();
                const config = configManager.getConfig();
                const ram = config.ram || 4;
                const versionId = manifest.loader === 'fabric'
                    ? `fabric-loader-${manifest.loader_version}-${manifest.minecraft}`
                    : manifest.minecraft;

                console.log('Проверка Java перед запуском модпака...');
                const minecraftVersion = manifest.minecraft;
                await this.java.ensureJava(minecraftVersion, (progress) => {
                    this.windowManager.getMainWindow()?.webContents.send('java-progress', progress);
                });

                const result = await this.game.launch(versionId, nick, ram);

                if (result && result.pid) {
                    this.processMonitor.addProcess(result.pid);
                    console.log(`Minecraft запущен с PID: ${result.pid}`);
                    return { success: true };
                } else {
                    throw new Error('Не удалось получить PID процесса Minecraft');
                }
            } catch (err) {
                this.logger.error('Modpack launch error', err);
                // Оффлайн с отсутствующей сборкой — явное сообщение
                if (err.code === 'OFFLINE' || err.offline) {
                    return { success: false, error: 'Нет соединения с сервером модпака. Установите сборку при наличии сети.' };
                }
                return { success: false, error: err.message };
            }
        });
    }
}

module.exports = ModpackHandlers;
