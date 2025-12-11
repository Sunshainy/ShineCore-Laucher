const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Базовый класс для всех загрузчиков (Vanilla, Fabric, NeoForge и т.д.)
 * Содержит общую функциональность для всех типов загрузчиков
 */
class BaseLoader {
    constructor(minecraftDir, logger, downloader) {
        this.minecraftDir = minecraftDir;
        this.logger = logger;
        this.downloader = downloader;
    }

    /**
     * Получение имени операционной системы для Minecraft
     */
    getOsName() {
        const platform = os.platform();
        if (platform === 'win32') return 'windows';
        if (platform === 'darwin') return 'osx';
        return 'linux';
    }

    /**
     * Проверка правил для библиотек
     */
    checkRules(rules) {
        if (!rules) return true;

        for (const rule of rules) {
            let applies = true;

            if (rule.os) {
                const osName = this.getOsName();
                applies = osName === rule.os.name;
            }

            if (applies) {
                return rule.action === 'allow';
            }
        }

        return true;
    }

    /**
     * Получение классификатора нативных библиотек
     */
    getNativeClassifier(natives) {
        if (!natives) return null;
        const osName = this.getOsName();
        return natives[osName];
    }

    /**
     * Парсинг Maven артефакта
     */
    getMavenInfo(name, baseUrl = 'https://libraries.minecraft.net/') {
        const parts = name.split(':');
        const domain = parts[0].replace(/\./g, '/');
        const artifact = parts[1];
        const version = parts[2];
        const fileName = `${artifact}-${version}.jar`;
        
        const relativePath = `${domain}/${artifact}/${version}/${fileName}`;
        const libPath = path.join(this.minecraftDir, 'libraries', relativePath);
        const url = baseUrl + relativePath;

        return {
            name,
            path: libPath,
            url,
            relativePath
        };
    }

    /**
     * Создание директории если не существует
     */
    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Проверка установки версии
     */
    isVersionInstalled(versionId) {
        const versionDir = path.join(this.minecraftDir, 'versions', versionId);
        const versionJson = path.join(versionDir, `${versionId}.json`);
        return fs.existsSync(versionJson);
    }

    /**
     * Получение пути к JSON файлу версии
     */
    getVersionJsonPath(versionId) {
        return path.join(this.minecraftDir, 'versions', versionId, `${versionId}.json`);
    }

    /**
     * Чтение JSON файла версии
     */
    readVersionJson(versionId) {
        const jsonPath = this.getVersionJsonPath(versionId);
        if (!fs.existsSync(jsonPath)) {
            throw new Error(`Version ${versionId} not found`);
        }
        return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }

    /**
     * Загрузка библиотек (общая логика для всех загрузчиков)
     */
    async downloadLibraries(libraries, onProgress = null) {
        const toDownload = [];

        for (const lib of libraries) {
            if (!this.checkRules(lib.rules)) continue;

            // Artifact
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
            } else if (lib.name) {
                const info = this.getMavenInfo(lib.name, lib.url);
                if (!fs.existsSync(info.path)) {
                    toDownload.push({ ...info });
                }
            }

            // Natives
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
            return { completed: 0, total: 0, failed: [] };
        }

        return await this.downloader.downloadParallel(toDownload, 8, onProgress);
    }

    /**
     * Получение информации о версии загрузчика
     * Должен быть переопределен в дочерних классах
     */
    getName() {
        return 'BaseLoader';
    }

    /**
     * Загрузка и установка версии
     * Должен быть переопределен в дочерних классах
     */
    async install(version) {
        throw new Error('install() must be implemented in subclass');
    }
}

module.exports = BaseLoader;
