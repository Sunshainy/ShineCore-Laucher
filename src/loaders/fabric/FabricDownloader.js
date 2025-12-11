const fs = require('fs');
const path = require('path');
const Logger = require('../../utils/Logger');
const DownloadUtil = require('../../utils/DownloadUtil');

// Логирование
console.log('FabricDownloader module loaded');

class FabricDownloader {
    constructor(minecraftDir) {
        this.minecraftDir = minecraftDir;
        this.fabricMetaUrl = 'https://meta.fabricmc.net/v2';
        this.logger = new Logger(minecraftDir);
        this.downloader = new DownloadUtil(this.logger);
    }

    async getFabricVersions(mcVersion) {
        console.log(`Загрузка версий Fabric для Minecraft ${mcVersion}...`);
        this.logger.info(`Fetching Fabric versions for ${mcVersion}`);
        
        try {
            const url = `${this.fabricMetaUrl}/versions/loader/${mcVersion}`;
            return await this.downloader.fetchJson(url);
        } catch (error) {
            this.logger.error('Failed to fetch Fabric versions', error);
            console.error('Ошибка загрузки версий Fabric:', error.message);
            return [];
        }
    }

    async installFabric(mcVersion, fabricVersionInfo) {
        const loaderVersion = fabricVersionInfo.loader.version;
        const versionId = `fabric-loader-${loaderVersion}-${mcVersion}`;
        const versionDir = path.join(this.minecraftDir, 'versions', versionId);

        this.logger.info(`Installing Fabric ${loaderVersion} for ${mcVersion}`);
        this.ensureDir(versionDir);

        console.log(`[1/4] Проверка ванильной версии...`);
        await this.verifyVanillaVersion(mcVersion);

        console.log(`[2/4] Загрузка профиля Fabric...`);
        const profileUrl = `${this.fabricMetaUrl}/versions/loader/${mcVersion}/${loaderVersion}/profile/json`;
        const fabricProfile = await this.downloader.fetchJson(profileUrl);

        const profilePath = path.join(versionDir, `${versionId}.json`);
        fs.writeFileSync(profilePath, JSON.stringify(fabricProfile, null, 2));

        console.log(`[3/4] Загрузка библиотек Fabric...`);
        await this.downloadLibraries(fabricProfile.libraries);

        console.log(`[4/4] Готово!`);
        this.logger.success(`Fabric ${loaderVersion} installed for ${mcVersion}`);
        
        return profilePath;
    }

    async verifyVanillaVersion(mcVersion) {
        const vanillaDir = path.join(this.minecraftDir, 'versions', mcVersion);
        const vanillaJson = path.join(vanillaDir, `${mcVersion}.json`);
        const vanillaJar = path.join(vanillaDir, `${mcVersion}.jar`);
        
        if (!fs.existsSync(vanillaJson) || !fs.existsSync(vanillaJar)) {
            throw new Error(`Ванильная версия ${mcVersion} не установлена!`);
        }

        const json = JSON.parse(fs.readFileSync(vanillaJson, 'utf8'));
        await this.downloadLibraries(json.libraries);
    }

    async downloadLibraries(libraries) {
        const toDownload = [];
        const osName = this.getOsName();

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
            } else if (lib.name) {
                const info = this.getMavenInfo(lib.name, lib.url);
                if (!fs.existsSync(info.path)) {
                    toDownload.push({ ...info, name: lib.name });
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

        if (toDownload.length === 0) return;

        console.log(`  Нужно скачать файлов: ${toDownload.length}`);
        
        const result = await this.downloader.downloadParallel(toDownload, 5, (completed, total, file) => {
            process.stdout.write(`\r  Загрузка: ${completed}/${total} - ${path.basename(file.path).padEnd(50).substring(0, 50)}`);
        });

        console.log('');
        
        if (result.failed.length > 0) {
            this.logger.warn(`Failed to download ${result.failed.length} files`);
            throw new Error(`Не удалось загрузить ${result.failed.length} файлов`);
        }
    }

    getOsName() {
        const p = process.platform;
        if (p === 'win32') return 'windows';
        if (p === 'darwin') return 'osx';
        return 'linux';
    }

    getNativeClassifier(natives) {
        if (!natives) return null;
        const os = this.getOsName();
        let classifier = natives[os];
        if (classifier) {
            classifier = classifier.replace('${arch}', process.arch === 'x64' ? '64' : '32');
        }
        return classifier;
    }

    checkRules(rules) {
        if (!rules) return true;
        const os = this.getOsName();
        let allow = true;
        
        for (const rule of rules) {
            if (rule.os && rule.os.name !== os) continue;
            allow = rule.action === 'allow';
        }
        
        return allow;
    }

    getMavenInfo(name, baseUrl = 'https://repo1.maven.org/maven2/') {
        const parts = name.split(':');
        const [group, artifact, version] = parts;
        const pathStr = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
        
        return {
            path: path.join(this.minecraftDir, 'libraries', pathStr.replace(/\//g, path.sep)),
            url: `${baseUrl}${pathStr}`
        };
    }

    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

module.exports = FabricDownloader;