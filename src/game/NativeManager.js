const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

class NativesManager {
    constructor(minecraftDir, logger) {
        this.minecraftDir = minecraftDir;
        this.logger = logger;
    }

    extractNativesIfNeeded(versionJson, versionId, nativesDir) {
        const cacheFile = path.join(nativesDir, '.natives-cache');
        const currentHash = this.calculateNativesHash(versionJson);

        if (fs.existsSync(cacheFile)) {
            const cachedHash = fs.readFileSync(cacheFile, 'utf8');
            if (cachedHash === currentHash && this.verifyNativesExist(nativesDir)) {
                this.logger.info(`Natives cache valid for ${versionId}`);
                return nativesDir;
            }
        }

        this.logger.info(`Extracting natives for ${versionId}`);
        this.extractNatives(versionJson, versionId, nativesDir);
        fs.writeFileSync(cacheFile, currentHash);
        
        return nativesDir;
    }

    calculateNativesHash(versionJson) {
        const nativeLibs = versionJson.libraries
            .filter(lib => lib.downloads?.classifiers || lib.name?.includes('natives'))
            .map(lib => lib.name)
            .sort()
            .join('|');
        
        return crypto.createHash('md5').update(nativeLibs).digest('hex');
    }

    verifyNativesExist(nativesDir) {
        if (!fs.existsSync(nativesDir)) return false;
        
        const files = fs.readdirSync(nativesDir).filter(f => 
            f.endsWith('.dll') || f.endsWith('.so') || f.endsWith('.dylib')
        );
        
        return files.length > 0;
    }

    extractNatives(versionJson, versionId, nativesDir) {
        if (fs.existsSync(nativesDir)) {
            try {
                fs.rmSync(nativesDir, { recursive: true, force: true });
            } catch (e) {
                this.logger.warn('Failed to clean natives dir', e);
            }
        }
        
        fs.mkdirSync(nativesDir, { recursive: true });

        const osName = this.getOsName();
        const processedJars = new Set();
        let extractedCount = 0;

        const allLibraries = this.collectAllLibraries(versionJson);

        for (const lib of allLibraries) {
            const libDir = this.getLibraryDir(lib);
            if (!libDir || !fs.existsSync(libDir)) continue;

            try {
                const files = fs.readdirSync(libDir);
                for (const file of files) {
                    if (this.isNativeJar(file, osName) && !processedJars.has(file)) {
                        const jarPath = path.join(libDir, file);
                        this.extractJar(jarPath, nativesDir, lib.extract);
                        processedJars.add(file);
                        extractedCount++;
                    }
                }
            } catch (err) {
                this.logger.warn(`Failed to scan ${libDir}`, err);
            }
        }

        this.logger.info(`Extracted ${extractedCount} native archives`);
    }

    collectAllLibraries(versionJson) {
        const libraries = [...versionJson.libraries];

        if (versionJson.inheritsFrom) {
            try {
                const parentPath = path.join(
                    this.minecraftDir,
                    'versions',
                    versionJson.inheritsFrom,
                    `${versionJson.inheritsFrom}.json`
                );
                
                if (fs.existsSync(parentPath)) {
                    const parentJson = JSON.parse(fs.readFileSync(parentPath, 'utf8'));
                    libraries.push(...parentJson.libraries);
                }
            } catch (e) {
                this.logger.warn('Failed to load parent version for natives', e);
            }
        }

        return libraries;
    }

    getLibraryDir(lib) {
        if (!lib.name) return null;
        
        const parts = lib.name.split(':');
        if (parts.length < 3) return null;
        
        const [group, artifact, version] = parts;
        const groupPath = group.replace(/\./g, path.sep);
        
        return path.join(this.minecraftDir, 'libraries', groupPath, artifact, version);
    }

    isNativeJar(filename, osName) {
        if (!filename.endsWith('.jar')) return false;
        if (!filename.includes('natives-')) return false;
        
        const platformMap = {
            'windows': ['windows'],
            'osx': ['macos', 'osx'],
            'linux': ['linux']
        };

        const platforms = platformMap[osName] || [];
        return platforms.some(platform => filename.includes(platform));
    }

    extractJar(jarPath, targetDir, extractRules) {
        try {
            const zip = new AdmZip(jarPath);
            const entries = zip.getEntries();

            for (const entry of entries) {
                if (entry.isDirectory) continue;

                if (this.shouldExtract(entry.entryName, extractRules)) {
                    const targetPath = path.join(targetDir, entry.entryName);
                    const dir = path.dirname(targetPath);
                    
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    
                    fs.writeFileSync(targetPath, entry.getData());
                }
            }
        } catch (error) {
            this.logger.error(`Failed to extract ${path.basename(jarPath)}`, error);
        }
    }

    shouldExtract(entryName, extractRules) {
        const ext = path.extname(entryName).toLowerCase();
        if (!['.dll', '.so', '.dylib', '.jnilib'].includes(ext)) return false;

        if (extractRules?.exclude) {
            for (const exclude of extractRules.exclude) {
                if (entryName.startsWith(exclude)) return false;
            }
        }

        return true;
    }

    getOsName() {
        const platform = process.platform;
        if (platform === 'win32') return 'windows';
        if (platform === 'darwin') return 'osx';
        return 'linux';
    }
}

module.exports = NativesManager;