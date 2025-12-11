// modpack-launcher.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DownloadUtil = require('../utils/DownloadUtil');
const Logger = require('../utils/Logger');
const VanillaDownloader = require('../loaders/vanilla/VanillaDownloader');
const FabricDownloader = require('../loaders/fabric/FabricDownloader');
const GameLauncher = require('../game/GameLauncher');
const ModpackManager = require('./ModpackManager');
const JavaManager = require('../game/JavaManager');

// Логирование
console.log('ModpackLauncher module loaded');

class ModpackLauncher {
    constructor(minecraftDir, progressCallback = null) {
        this.minecraftDir = minecraftDir;
        this.logger = new Logger(minecraftDir);
        this.downloader = new DownloadUtil(this.logger);
        this.vanilla = new VanillaDownloader(minecraftDir, progressCallback);
        this.fabric = new FabricDownloader(minecraftDir);
        this.game = new GameLauncher(minecraftDir);
        this.modpackManager = new ModpackManager(minecraftDir, progressCallback);
        this.progressCallback = progressCallback;
    }

    sendProgress(stage, current, total) {
        if (this.progressCallback) {
            const percent = total > 0 ? Math.round((current / total) * 100) : 0;
            this.progressCallback({ stage, current, total, percent });
        }
    }

    async launchFromServer(serverUrl = "be-sunshainy.online:8000") {
        try {
            console.log('\n=== Запуск модпака с сервера ===');

            let baseUrl = serverUrl.trim();
            if (!/^https?:\/\//i.test(baseUrl)) {
                baseUrl = 'http://' + baseUrl.replace(/^\/+/g, '');
            }
            baseUrl = baseUrl.replace(/\/+$/, '');

            const manifestUrl = `${baseUrl}/manifest`;
            console.log(`Загрузка манифеста: ${manifestUrl}`);
            this.sendProgress('Загрузка манифеста модпака', 1, 10);

            const manifest = await this.downloader.fetchJson(manifestUrl);
            this.logger.info('Modpack manifest loaded', manifest);

            const {
                minecraft,
                loader = 'vanilla',
                loader_version,
                files = [],
                name = 'Custom Modpack',
                version = '1.0'
            } = manifest;

            const versionId = loader === 'fabric'
                ? `fabric-loader-${loader_version}-${minecraft}`
                : minecraft;

            console.log(`\nСборка: ${name} v${version}`);
            console.log(`Minecraft: ${minecraft}`);
            console.log(`Загрузчик: ${loader}${loader_version ? ` ${loader_version}` : ''}`);
            console.log(`Файлов в модпаке: ${files.length}\n`);

            // 1. Установка базовой версии
            this.sendProgress('Проверка базовой версии Minecraft', 2, 10);
            await this.ensureBaseVersion(minecraft, loader, loader_version);

            // 2. Синхронизация файлов модпака (новая улучшенная система)
            this.sendProgress('Синхронизация файлов модпака', 5, 10);
            await this.modpackManager.syncModpack(manifest, baseUrl);

            this.sendProgress('Установка завершена', 10, 10);
            this.logger.success('Modpack installed successfully');
        } catch (err) {
            this.logger.error('Failed to launch modpack from server', err);
            console.error('Ошибка запуска сборки:', err.message || err);
            console.error('Stack trace:', err.stack);
            throw err;
        }
    }

    async ensureBaseVersion(mcVersion, loader, loaderVersion) {
        const installed = this.game.getInstalledVersions();
        const expectedId = loader === 'fabric'
            ? `fabric-loader-${loaderVersion}-${mcVersion}`
            : mcVersion;

        if (installed.includes(expectedId)) {
            console.log(`Версия ${expectedId} уже установлена`);
            this.sendProgress(`Версия ${expectedId} установлена`, 3, 10);
            return;
        }

        console.log(`Установка базовой версии: ${mcVersion} + ${loader}`);
        this.sendProgress(`Установка ${mcVersion}`, 3, 10);

        const manifest = await this.vanilla.getVersionManifest();
        const versionInfo = manifest.find(v => v.id === mcVersion);
        if (!versionInfo) throw new Error(`Версия Minecraft ${mcVersion} не найдена`);

        await this.vanilla.downloadVersion(versionInfo);

        if (loader === 'fabric') {
            this.sendProgress('Установка Fabric Loader', 4, 10);
            const fabricVersions = await this.fabric.getFabricVersions(mcVersion);
            const fabricInfo = fabricVersions.find(v => v.loader.version === loaderVersion);
            if (!fabricInfo) throw new Error(`Fabric loader ${loaderVersion} не найден`);
            await this.fabric.installFabric(mcVersion, fabricInfo);
        }

        this.sendProgress('Базовая версия установлена', 5, 10);
    }

    // Проверка, установлен ли модпак корректно
    async isModpackInstalled(manifest) {
        return await this.modpackManager.isModpackInstalled(manifest);
    }

    async launch() {
        try {
            console.log('Запуск модпака...');
            
            // Получаем версию Minecraft для Java
            const installedVersions = this.game.getInstalledVersions();
            let minecraftVersion = '1.21'; // По умолчанию
            
            if (installedVersions.length > 0) {
                // Берем первую установленную версию и извлекаем версию Minecraft
                const versionId = installedVersions[0];
                if (versionId.includes('fabric-loader')) {
                    const parts = versionId.split('-');
                    minecraftVersion = parts[parts.length - 1];
                } else {
                    minecraftVersion = versionId;
                }
            }
            
            // Проверяем и загружаем Java перед запуском
            console.log(`Проверка наличия Java для Minecraft ${minecraftVersion}...`);
            const javaManager = new JavaManager(this.minecraftDir);
            const javaPath = await javaManager.ensureJava(minecraftVersion);
            console.log(`Java найдена по пути: ${javaPath}`);
            
            // Запускаем игру
            const result = await this.game.launch();
            console.log(`Minecraft запущен с PID: ${result.pid}`);
            
            return result;
        } catch (error) {
            console.error('Ошибка запуска модпака:', error);
            throw error;
        }
    }

    addMinecraftProcess(pid) {
        // Передаем PID в основной процесс через IPC
        if (process.send) {
            process.send({ type: 'minecraft-process', pid });
        }
    }

    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

module.exports = ModpackLauncher;