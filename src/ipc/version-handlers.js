/**
 * IPC обработчики для версий Minecraft
 */
class VersionHandlers {
    constructor(ipcMain, vanillaDownloader, fabricDownloader, gameLauncher, javaManager, windowManager, processMonitor, logger) {
        this.ipcMain = ipcMain;
        this.vanilla = vanillaDownloader;
        this.fabric = fabricDownloader;
        this.game = gameLauncher;
        this.java = javaManager;
        this.windowManager = windowManager;
        this.processMonitor = processMonitor;
        this.logger = logger;
        this.versionsCache = null;
        this.fabricCache = new Map();
        this.setup();
    }

    setup() {
        // Получение списка версий
        this.ipcMain.handle('get-versions', async () => {
            if (!this.versionsCache) {
                this.versionsCache = await this.buildVersionList();
            }
            return this.versionsCache;
        });

        // Обновление списка версий
        this.ipcMain.handle('refresh-versions', async () => {
            this.versionsCache = await this.buildVersionList();
            return this.versionsCache;
        });

        // Проверка установленных версий
        this.ipcMain.handle('check-installed-versions', async (e, versions) => {
            const installed = this.game.getInstalledVersions();
            return versions.map(v => ({
                version: v,
                installed: installed.includes(v)
            }));
        });

        // Загрузка версии
        this.ipcMain.handle('download-version', async (e, { versionId }) => {
            try {
                if (versionId.includes('fabric-loader')) {
                    return await this.downloadFabricVersion(versionId);
                }

                const manifest = await this.vanilla.getVersionManifest();
                const versionInfo = manifest.find(v => v.id === versionId);

                if (!versionInfo) {
                    throw new Error(`Версия ${versionId} не найдена`);
                }

                const VanillaDownloader = require('../loaders/vanilla/VanillaDownloader');
                const downloader = new VanillaDownloader(
                    this.vanilla.minecraftDir,
                    (progress) => {
                        this.windowManager.getMainWindow()?.webContents.send('download-progress', progress);
                    }
                );

                await downloader.downloadVersion(versionInfo);
                return { success: true };
            } catch (err) {
                this.logger.error('Download error', err);
                throw err;
            }
        });

        // Запуск игры
        this.ipcMain.handle('launch-game', async (e, { nick, versionId }) => {
            try {
                const ConfigManager = require('../core/ConfigManager');
                const configManager = new ConfigManager();
                const config = configManager.getConfig();
                const ram = config.ram || 4;

                console.log('Проверка Java перед запуском...');
                const minecraftVersion = versionId.includes('fabric-loader')
                    ? versionId.split('-').pop()
                    : versionId;

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
                this.logger.error('Launch error', err);
                return { success: false, error: err.message };
            }
        });
    }

    async buildVersionList() {
        const manifest = await this.vanilla.getVersionManifest();
        const releases = manifest.filter(v => v.type === 'release').slice(0, 30);
        const versions = [];

        for (const v of releases) {
            versions.push({
                id: v.id,
                kind: 'vanilla',
                display: `${v.id} (Vanilla)`
            });

            try {
                const fabricVersions = await this.getFabricVersionsCached(v.id);
                if (fabricVersions && fabricVersions.length > 0) {
                    const stable = fabricVersions.find(f => f.loader?.stable) || fabricVersions[0];
                    if (stable?.loader?.version) {
                        const fabricId = `fabric-loader-${stable.loader.version}-${v.id}`;
                        versions.push({
                            id: fabricId,
                            kind: 'fabric',
                            base: v.id,
                            loader: stable.loader.version,
                            display: `${v.id} (Fabric ${stable.loader.version})`
                        });
                    }
                }
            } catch (err) {
                this.logger.warn(`Fabric list failed for ${v.id}`, err.message || err);
            }
        }

        return versions;
    }

    async getFabricVersionsCached(mcVersion) {
        if (this.fabricCache.has(mcVersion)) return this.fabricCache.get(mcVersion);
        const versions = await this.fabric.getFabricVersions(mcVersion);
        this.fabricCache.set(mcVersion, versions);
        return versions;
    }

    async downloadFabricVersion(versionId) {
        const parts = versionId.split('-');
        const mcVersion = parts[parts.length - 1];
        const loaderVersion = parts[2];

        // Убедимся, что ванильная версия установлена
        const manifest = await this.vanilla.getVersionManifest();
        const vanillaInfo = manifest.find(v => v.id === mcVersion);
        if (!vanillaInfo) {
            throw new Error(`Базовая версия ${mcVersion} не найдена`);
        }

        const VanillaDownloader = require('../loaders/vanilla/VanillaDownloader');
        const vanillaDownloader = new VanillaDownloader(
            this.vanilla.minecraftDir,
            (progress) => {
                this.windowManager.getMainWindow()?.webContents.send('download-progress', progress);
            }
        );
        await vanillaDownloader.downloadVersion(vanillaInfo);

        // Ищем нужный Fabric loader
        const fabricList = await this.getFabricVersionsCached(mcVersion);
        const fabricInfo = fabricList.find(f => f.loader?.version === loaderVersion);
        if (!fabricInfo) {
            throw new Error(`Fabric ${loaderVersion} для ${mcVersion} не найден`);
        }

        await this.fabric.installFabric(mcVersion, fabricInfo);
        return { success: true };
    }
}

module.exports = VersionHandlers;
