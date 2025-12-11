// vanilla-integrity.js - Система проверки целостности ванильных версий
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DownloadUtil = require('../../utils/DownloadUtil');
const Logger = require('../../utils/Logger');

// Логирование
console.log('VanillaIntegrity module loaded');

class VanillaIntegrity {
    constructor(minecraftDir, progressCallback = null) {
        this.minecraftDir = minecraftDir;
        this.logger = new Logger(minecraftDir);
        this.downloader = new DownloadUtil(this.logger);
        this.progressCallback = progressCallback;
    }

    sendProgress(stage, current, total) {
        if (this.progressCallback) {
            const percent = total > 0 ? Math.round((current / total) * 100) : 0;
            this.progressCallback({ stage, current, total, percent });
        }
    }

    // Проверка целостности установленной версии
    async checkVersionIntegrity(versionId) {
        try {
            console.log(`\n=== Проверка целостности версии ${versionId} ===`);
            
            const versionDir = path.join(this.minecraftDir, 'versions', versionId);
            const versionJsonPath = path.join(versionDir, `${versionId}.json`);
            
            if (!fs.existsSync(versionJsonPath)) {
                throw new Error(`Версия ${versionId} не установлена`);
            }

            const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            
            // Проверка клиентского JAR
            this.sendProgress('Проверка клиента', 1, 3);
            const clientValid = await this.checkClientIntegrity(versionJson, versionId);
            
            // Проверка библиотек
            this.sendProgress('Проверка библиотек', 2, 3);
            const librariesValid = await this.checkLibrariesIntegrity(versionJson.libraries);
            
            // Проверка ассетов (только при полной проверке)
            this.sendProgress('Проверка ассетов', 3, 3);
            const assetsValid = await this.checkAssetsIntegrity(versionJson.assetIndex);
            
            const allValid = clientValid && librariesValid && assetsValid;
            
            console.log(`  Результаты проверки:`);
            console.log(`    ✓ Клиент: ${clientValid ? 'корректный' : 'поврежден'}`);
            console.log(`    ✓ Библиотеки: ${librariesValid ? 'корректны' : 'повреждены'}`);
            console.log(`    ✓ Ассеты: ${assetsValid ? 'корректны' : 'повреждены'}`);
            console.log(`  Итог: ${allValid ? 'Версия корректна' : 'Требуется восстановление'}`);
            
            return allValid;

        } catch (err) {
            this.logger.error('Version integrity check failed', err);
            console.error(`  Ошибка проверки: ${err.message}`);
            return false;
        }
    }

    // Проверка целостности клиентского JAR
    async checkClientIntegrity(versionJson, versionId) {
        const clientJarPath = path.join(this.minecraftDir, 'versions', versionId, `${versionId}.jar`);
        
        if (!fs.existsSync(clientJarPath)) {
            console.log(`    ✗ Клиентский JAR отсутствует: ${clientJarPath}`);
            return false;
        }

        try {
            const expectedSha1 = versionJson.downloads.client.sha1;
            const currentHash = await this.calculateSha1(clientJarPath);
            
            if (currentHash !== expectedSha1) {
                console.log(`    ⚠ Клиентский JAR поврежден`);
                console.log(`      Ожидалось: ${expectedSha1}`);
                console.log(`      Фактически: ${currentHash}`);
                return false;
            }
            
            console.log(`    ✓ Клиентский JAR корректен`);
            return true;
        } catch (err) {
            console.log(`    ✗ Ошибка проверки клиента: ${err.message}`);
            return false;
        }
    }

    // Проверка целостности библиотек
    async checkLibrariesIntegrity(libraries) {
        let validCount = 0;
        let totalCount = 0;
        let corruptedCount = 0;

        for (const lib of libraries) {
            if (!this.checkRules(lib.rules)) continue;

            if (lib.downloads?.artifact) {
                totalCount++;
                const libPath = path.join(this.minecraftDir, 'libraries', lib.downloads.artifact.path);
                
                if (fs.existsSync(libPath)) {
                    try {
                        const currentHash = await this.calculateSha1(libPath);
                        if (currentHash === lib.downloads.artifact.sha1) {
                            validCount++;
                        } else {
                            corruptedCount++;
                            console.log(`    ⚠ Библиотека повреждена: ${lib.name}`);
                        }
                    } catch (err) {
                        corruptedCount++;
                        console.log(`    ✗ Ошибка проверки библиотеки: ${lib.name}`);
                    }
                } else {
                    corruptedCount++;
                    console.log(`    ✗ Библиотека отсутствует: ${lib.name}`);
                }
            }

            // Проверка нативных библиотек
            if (lib.downloads?.classifiers) {
                const nativeKey = this.getNativeClassifier(lib.natives);
                if (nativeKey && lib.downloads.classifiers[nativeKey]) {
                    totalCount++;
                    const native = lib.downloads.classifiers[nativeKey];
                    const nativePath = path.join(this.minecraftDir, 'libraries', native.path);
                    
                    if (fs.existsSync(nativePath)) {
                        try {
                            const currentHash = await this.calculateSha1(nativePath);
                            if (currentHash === native.sha1) {
                                validCount++;
                            } else {
                                corruptedCount++;
                                console.log(`    ⚠ Нативная библиотека повреждена: ${lib.name}:${nativeKey}`);
                            }
                        } catch (err) {
                            corruptedCount++;
                            console.log(`    ✗ Ошибка проверки нативной библиотеки: ${lib.name}:${nativeKey}`);
                        }
                    } else {
                        corruptedCount++;
                        console.log(`    ✗ Нативная библиотека отсутствует: ${lib.name}:${nativeKey}`);
                    }
                }
            }
        }

        console.log(`    Библиотеки: ${validCount}/${totalCount} корректны`);
        return corruptedCount === 0;
    }

    // Проверка целостности ассетов
    async checkAssetsIntegrity(assetIndex) {
        const assetsDir = path.join(this.minecraftDir, 'assets');
        const indexesDir = path.join(assetsDir, 'indexes');
        const objectsDir = path.join(assetsDir, 'objects');
        
        const indexPath = path.join(indexesDir, `${assetIndex.id}.json`);
        
        if (!fs.existsSync(indexPath)) {
            console.log(`    ✗ Индекс ассетов отсутствует: ${assetIndex.id}`);
            return false;
        }

        try {
            const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            let validCount = 0;
            let totalCount = 0;
            let corruptedCount = 0;

            for (const [name, asset] of Object.entries(indexData.objects)) {
                totalCount++;
                const hash = asset.hash;
                const subPath = `${hash.substring(0, 2)}/${hash}`;
                const assetPath = path.join(objectsDir, subPath);

                if (fs.existsSync(assetPath)) {
                    try {
                        const currentHash = await this.calculateSha1(assetPath);
                        if (currentHash === hash) {
                            validCount++;
                        } else {
                            corruptedCount++;
                            console.log(`    ⚠ Ассет поврежден: ${name}`);
                        }
                    } catch (err) {
                        corruptedCount++;
                        console.log(`    ✗ Ошибка проверки ассета: ${name}`);
                    }
                } else {
                    corruptedCount++;
                    console.log(`    ✗ Ассет отсутствует: ${name}`);
                }
            }

            console.log(`    Ассеты: ${validCount}/${totalCount} корректны`);
            return corruptedCount === 0;

        } catch (err) {
            console.log(`    ✗ Ошибка проверки ассетов: ${err.message}`);
            return false;
        }
    }

    // Восстановление поврежденной версии
    async repairVersion(versionId) {
        try {
            console.log(`\n=== Восстановление версии ${versionId} ===`);
            
            const versionDir = path.join(this.minecraftDir, 'versions', versionId);
            const versionJsonPath = path.join(versionDir, `${versionId}.json`);
            
            if (!fs.existsSync(versionJsonPath)) {
                throw new Error(`Версия ${versionId} не установлена`);
            }

            const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            
            // Восстановление клиента
            this.sendProgress('Восстановление клиента', 1, 3);
            await this.repairClient(versionJson, versionId);
            
            // Восстановление библиотек
            this.sendProgress('Восстановление библиотек', 2, 3);
            await this.repairLibraries(versionJson.libraries);
            
            // Восстановление ассетов (только при полном восстановлении)
            this.sendProgress('Восстановление ассетов', 3, 3);
            await this.repairAssets(versionJson.assetIndex);
            
            console.log(`✓ Версия ${versionId} успешно восстановлена`);
            this.sendProgress('Восстановление завершено', 3, 3);
            
            return true;

        } catch (err) {
            this.logger.error('Version repair failed', err);
            console.error(`  Ошибка восстановления: ${err.message}`);
            throw err;
        }
    }

    async repairClient(versionJson, versionId) {
        const clientJarPath = path.join(this.minecraftDir, 'versions', versionId, `${versionId}.jar`);
        
        console.log(`  Восстановление клиента...`);
        await this.downloader.downloadFileWithRetry(
            versionJson.downloads.client.url,
            clientJarPath,
            versionJson.downloads.client.sha1
        );
    }

    async repairLibraries(libraries) {
        const toDownload = [];

        for (const lib of libraries) {
            if (!this.checkRules(lib.rules)) continue;

            if (lib.downloads?.artifact) {
                const libPath = path.join(this.minecraftDir, 'libraries', lib.downloads.artifact.path);
                toDownload.push({
                    url: lib.downloads.artifact.url,
                    path: libPath,
                    sha1: lib.downloads.artifact.sha1,
                    name: lib.name
                });
            }

            if (lib.downloads?.classifiers) {
                const nativeKey = this.getNativeClassifier(lib.natives);
                if (nativeKey && lib.downloads.classifiers[nativeKey]) {
                    const native = lib.downloads.classifiers[nativeKey];
                    const nativePath = path.join(this.minecraftDir, 'libraries', native.path);
                    toDownload.push({
                        url: native.url,
                        path: nativePath,
                        sha1: native.sha1,
                        name: `${lib.name}:${nativeKey}`
                    });
                }
            }
        }

        if (toDownload.length > 0) {
            console.log(`  Восстановление библиотек: ${toDownload.length}`);
            const result = await this.downloader.downloadParallel(toDownload, 6);
            
            if (result.failed.length > 0) {
                throw new Error(`Не удалось восстановить ${result.failed.length} библиотек`);
            }
        }
    }

    async repairAssets(assetIndex) {
        const assetsDir = path.join(this.minecraftDir, 'assets');
        const objectsDir = path.join(assetsDir, 'objects');
        
        const indexData = await this.downloader.fetchJson(assetIndex.url);
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

        if (toDownload.length > 0) {
            console.log(`  Восстановление ассетов: ${toDownload.length}`);
            const result = await this.downloader.downloadParallel(toDownload, 8);
            
            if (result.failed.length > 0) {
                throw new Error(`Не удалось восстановить ${result.failed.length} ассетов`);
            }
        }
    }

    // Вспомогательные методы
    async calculateSha1(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha1');
            const stream = fs.createReadStream(filePath);
            stream.on('data', d => hash.update(d));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
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
}

module.exports = VanillaIntegrity;