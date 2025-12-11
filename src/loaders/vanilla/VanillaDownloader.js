const fs = require('fs');
const path = require('path');
const Logger = require('../../utils/Logger');
const DownloadUtil = require('../../utils/DownloadUtil');
const VanillaIntegrity = require('./VanillaIntegrity');

// Логирование
console.log('VanillaDownloader module loaded');

class VanillaDownloader {
    constructor(minecraftDir, progressCallback = null) {
        this.minecraftDir = minecraftDir;
        this.manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
        this.logger = new Logger(minecraftDir);
        this.downloader = new DownloadUtil(this.logger);
        this.integrity = new VanillaIntegrity(minecraftDir, progressCallback);
        this.progressCallback = progressCallback;
        this.cacheDir = path.join(this.minecraftDir, 'cache');
        this.ensureDir(this.cacheDir);
        
        // Счетчики для прогресса
        this.totalSteps = 0;
        this.currentStep = 0;
    }

    sendProgress(stage, current, total, substagePercent = 0) {
        if (this.progressCallback) {
            // Вычисляем общий процент с учетом подэтапов
            const stepProgress = this.currentStep / this.totalSteps;
            const substepProgress = (1 / this.totalSteps) * (substagePercent / 100);
            const totalPercent = Math.round((stepProgress + substepProgress) * 100);
            
            this.progressCallback({ 
                stage, 
                current, 
                total, 
                percent: totalPercent 
            });
        }
    }

    async getVersionManifest() {
        const cacheFile = path.join(this.cacheDir, 'version_manifest_v2.json');
        const cacheTtlMs = 6 * 60 * 60 * 1000; // 6 часов

        try {
            const cached = this.readJsonSafe(cacheFile);
            if (cached && cached.fetchedAt && (Date.now() - cached.fetchedAt) < cacheTtlMs && Array.isArray(cached.versions)) {
                return cached.versions;
            }
        } catch (_) {
            // игнорируем ошибки кеша
        }

        console.log('Загрузка манифеста версий...');
        this.logger.info('Fetching version manifest');
        const manifest = await this.downloader.fetchJson(this.manifestUrl, cacheTtlMs);

        try {
            fs.writeFileSync(cacheFile, JSON.stringify({ fetchedAt: Date.now(), versions: manifest.versions }, null, 2));
        } catch (e) {
            this.logger.warn('Failed to write manifest cache', e.message || e);
        }

        return manifest.versions;
    }

    readJsonSafe(filePath) {
        if (!fs.existsSync(filePath)) return null;
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
            this.logger.warn('Failed to read cache file', err.message || err);
            return null;
        }
    }

    async downloadVersion(versionInfo) {
        const versionId = versionInfo.id;
        
        // Сначала проверяем, установлена ли версия и корректна ли она
        try {
            const isIntact = await this.integrity.checkVersionIntegrity(versionId);
            if (isIntact) {
                console.log(`✓ Версия ${versionId} уже установлена и корректна`);
                this.sendProgress('Версия корректна', 4, 4, 100);
                return path.join(this.minecraftDir, 'versions', versionId, `${versionId}.json`);
            } else {
                console.log(`⚠ Версия ${versionId} повреждена, требуется восстановление`);
                await this.integrity.repairVersion(versionId);
                return path.join(this.minecraftDir, 'versions', versionId, `${versionId}.json`);
            }
        } catch (err) {
            // Если версия не установлена или проверка не удалась, устанавливаем заново
            console.log(`Установка новой версии ${versionId}...`);
            console.log(`Причина: ${err.message}`);
        }

        const versionDir = path.join(this.minecraftDir, 'versions', versionId);
        
        this.logger.info(`Starting download for version ${versionId}`);
        this.ensureDir(versionDir);
        this.ensureDir(path.join(this.minecraftDir, 'libraries'));
        this.ensureDir(path.join(this.minecraftDir, 'assets'));

        // Сбрасываем счетчики
        this.totalSteps = 4; // метаданные, клиент, библиотеки, ассеты
        this.currentStep = 0;

        // [1/4] Метаданные
        this.currentStep = 0;
        this.sendProgress('Загрузка метаданных версии', 1, 4, 0);
        console.log(`[1/4] Загрузка метаданных версии ${versionId}...`);
        
        const versionJson = await this.downloader.fetchJson(versionInfo.url);
        const versionJsonPath = path.join(versionDir, `${versionId}.json`);
        fs.writeFileSync(versionJsonPath, JSON.stringify(versionJson, null, 2));
        
        this.currentStep = 1;
        this.sendProgress('Метаданные загружены', 1, 4, 100);

        // [2/4] Клиент JAR
        this.sendProgress('Загрузка клиента Minecraft', 2, 4, 0);
        console.log(`[2/4] Загрузка клиента ${versionId}...`);
        
        const clientJarPath = path.join(versionDir, `${versionId}.jar`);
        await this.downloader.downloadFileWithRetry(
            versionJson.downloads.client.url,
            clientJarPath,
            versionJson.downloads.client.sha1
        );
        
        this.currentStep = 2;
        this.sendProgress('Клиент загружен', 2, 4, 100);

        // [3/4] Библиотеки
        console.log(`[3/4] Загрузка библиотек...`);
        await this.downloadLibraries(versionJson.libraries);
        this.currentStep = 3;

        // [4/4] Ассеты (только при полной установке с нуля)
        console.log(`[4/4] Загрузка ассетов...`);
        await this.downloadAssets(versionJson.assetIndex);
        this.currentStep = 4;

        this.sendProgress('Установка завершена', 4, 4, 100);
        console.log(`✓ Версия ${versionId} успешно загружена!`);
        this.logger.success(`Version ${versionId} downloaded successfully`);
        
        return versionJsonPath;
    }

    async downloadLibraries(libraries) {
        const toDownload = [];

        // Собираем список файлов для загрузки
        for (const lib of libraries) {
            if (!this.checkRules(lib.rules)) continue;

            if (lib.downloads?.artifact) {
                const libPath = path.join(this.minecraftDir, 'libraries', lib.downloads.artifact.path);
                if (!fs.existsSync(libPath)) {
                    toDownload.push({
                        url: lib.downloads.artifact.url,
                        path: libPath,
                        sha1: lib.downloads.artifact.sha1,
                        name: lib.name
                    });
                }
            }

            if (lib.downloads?.classifiers) {
                const nativeKey = this.getNativeClassifier(lib.natives);
                if (nativeKey && lib.downloads.classifiers[nativeKey]) {
                    const native = lib.downloads.classifiers[nativeKey];
                    const nativePath = path.join(this.minecraftDir, 'libraries', native.path);
                    
                    if (!fs.existsSync(nativePath)) {
                        toDownload.push({
                            url: native.url,
                            path: nativePath,
                            sha1: native.sha1,
                            name: `${lib.name} (Native)`
                        });
                    }
                }
            }
        }

        if (toDownload.length === 0) {
            this.sendProgress('Библиотеки уже установлены', 3, 4, 100);
            return;
        }

        console.log(`  Найдено библиотек для загрузки: ${toDownload.length}`);
        
        const result = await this.downloader.downloadParallel(
            toDownload, 
            8, 
            (completed, total, file) => {
                // Вычисляем процент выполнения подэтапа
                const substagePercent = Math.round((completed / total) * 100);
                this.sendProgress(
                    `Загрузка библиотек: ${completed}/${total}`,
                    3,
                    4,
                    substagePercent
                );
                
                if (completed % 5 === 0 || completed === total) {
                    process.stdout.write(`\r  Прогресс: ${completed}/${total}`);
                }
            }
        );

        console.log('');
        
        if (result.failed.length > 0) {
            this.logger.warn(`Failed to download ${result.failed.length} libraries`);
        }
    }

    async downloadAssets(assetIndex) {
        const assetsDir = path.join(this.minecraftDir, 'assets');
        const indexesDir = path.join(assetsDir, 'indexes');
        const objectsDir = path.join(assetsDir, 'objects');
        
        this.ensureDir(indexesDir);
        this.ensureDir(objectsDir);

        const indexPath = path.join(indexesDir, `${assetIndex.id}.json`);
        const indexData = await this.downloader.fetchJson(assetIndex.url);
        fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));

        const toDownload = [];
        for (const [name, asset] of Object.entries(indexData.objects)) {
            const hash = asset.hash;
            const subPath = `${hash.substring(0, 2)}/${hash}`;
            const assetPath = path.join(objectsDir, subPath);

            if (!fs.existsSync(assetPath)) {
                toDownload.push({
                    url: `https://resources.download.minecraft.net/${subPath}`,
                    path: assetPath,
                    sha1: hash,
                    name: name
                });
            }
        }

        if (toDownload.length === 0) {
            this.sendProgress('Ассеты уже установлены', 4, 4, 100);
            return;
        }

        console.log(`  Найдено ассетов для загрузки: ${toDownload.length}`);
        
        const result = await this.downloader.downloadParallel(
            toDownload, 
            10, 
            (completed, total, file) => {
                // Вычисляем процент выполнения подэтапа
                const substagePercent = Math.round((completed / total) * 100);
                this.sendProgress(
                    `Загрузка ассетов: ${completed}/${total}`,
                    4,
                    4,
                    substagePercent
                );
                
                if (completed % 20 === 0 || completed === total) {
                    process.stdout.write(`\r  Прогресс: ${completed}/${total}`);
                }
            }
        );

        console.log('');
        
        if (result.failed.length > 0) {
            this.logger.warn(`Failed to download ${result.failed.length} assets`);
        }
    }

    checkRules(rules) {
        if (!rules) return true;

        const os = this.getOsName();
        let allowed = false;

        for (const rule of rules) {
            let applies = true;
            if (rule.os) applies = rule.os.name === os;
            if (applies) allowed = rule.action === 'allow';
        }

        return allowed;
    }

    getNativeClassifier(natives) {
        if (!natives) return null;

        const os = this.getOsName();
        const arch = process.arch === 'x64' ? '64' : '32';

        let classifier = natives[os];
        if (classifier) {
            classifier = classifier.replace('${arch}', arch);
        }

        return classifier;
    }

    getOsName() {
        const platform = process.platform;
        if (platform === 'win32') return 'windows';
        if (platform === 'darwin') return 'osx';
        return 'linux';
    }

    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

module.exports = VanillaDownloader;