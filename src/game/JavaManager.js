const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const DownloadUtil = require('../utils/DownloadUtil');
const AdmZip = require('adm-zip');

class JavaManager {
    constructor(minecraftDir) {
        this.minecraftDir = minecraftDir;
        this.javaDir = path.join(minecraftDir, 'java');
        this.ensureJavaDir();
    }

    ensureJavaDir() {
        if (!fs.existsSync(this.javaDir)) {
            fs.mkdirSync(this.javaDir, { recursive: true });
            console.log(`Создана папка для Java: ${this.javaDir}`);
        }
    }

    // URL для загрузки Java версий
    getJavaUrls() {
        return {
            "8": "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u472-b08/OpenJDK8U-jdk_x64_windows_hotspot_8u472b08.zip",
            "17": "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.17%2B10/OpenJDK17U-jdk_x64_windows_hotspot_17.0.17_10.zip",
            "21": "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.9%2B10/OpenJDK21U-jdk_x64_windows_hotspot_21.0.9_10.zip"
        };
    }

    // Определяем нужную версию Java по версии Minecraft
    getRequiredJavaVersion(minecraftVersion) {
        const version = parseFloat(minecraftVersion);
        
        if (version >= 1.20 && version <= 1.21) {
            return "21";
        } else if (version >= 1.18 && version <= 1.19) {
            return "17";
        } else if (version >= 1.8 && version <= 1.17) {
            return "8";
        } else {
            // По умолчанию используем Java 21 для новых версий
            return "21";
        }
    }

    // Получаем путь к Java для конкретной версии
    getJavaPath(javaVersion) {
        const javaHome = path.join(this.javaDir, `java-${javaVersion}`);
        const javaExe = path.join(javaHome, 'bin', 'javaw.exe');
        
        // Проверяем существование Java
        if (fs.existsSync(javaExe)) {
            return javaExe;
        }
        
        // Если Java не найдена, возвращаем null
        return null;
    }

    // Проверяем, установлена ли Java для версии
    isJavaInstalled(javaVersion) {
        return this.getJavaPath(javaVersion) !== null;
    }

    // Загружаем и устанавливаем Java
    async downloadJava(javaVersion, progressCallback = null) {
        const javaUrls = this.getJavaUrls();
        const url = javaUrls[javaVersion];
        
        if (!url) {
            throw new Error(`Неизвестная версия Java: ${javaVersion}`);
        }

        const downloadPath = path.join(this.javaDir, `java-${javaVersion}.zip`);
        const extractPath = path.join(this.javaDir, `java-${javaVersion}`);

        console.log(`Начинаем загрузку Java ${javaVersion}...`);
        
        // Отправляем прогресс загрузки
        if (progressCallback) {
            progressCallback({ stage: 'Загрузка Java', current: 1, total: 3, percent: 0 });
        }
        
        try {
            // Создаем экземпляр DownloadUtil для скачивания
            const downloader = new DownloadUtil();
            
            // Скачиваем архив
            await downloader.downloadFile(url, downloadPath);
            
            // Отправляем прогресс распаковки
            if (progressCallback) {
                progressCallback({ stage: 'Распаковка Java', current: 2, total: 3, percent: 50 });
            }
            
            console.log(`Распаковываем Java ${javaVersion}...`);
            
            // Распаковываем архив
            await this.extractZip(downloadPath, extractPath);
            
            // Удаляем временный файл
            fs.unlinkSync(downloadPath);
            
            // Отправляем прогресс финальной настройки
            if (progressCallback) {
                progressCallback({ stage: 'Настройка Java', current: 3, total: 3, percent: 75 });
            }
            
            // Находим правильную структуру папок после распаковки
            const fixedPath = await this.fixJavaStructure(extractPath, javaVersion);
            
            // Отправляем завершение
            if (progressCallback) {
                progressCallback({ stage: 'Java установлена', current: 3, total: 3, percent: 100 });
            }
            
            console.log(`Java ${javaVersion} успешно установлена в: ${fixedPath}`);
            return fixedPath;
            
        } catch (error) {
            console.error(`Ошибка при установке Java ${javaVersion}: ${error.message}`);
            throw error;
        }
    }

    // Исправляем структуру папок после распаковки
    async fixJavaStructure(extractPath, javaVersion) {
        const items = fs.readdirSync(extractPath);
        
        // Ищем папку с именем jdk*
        const jdkFolder = items.find(item => 
            item.startsWith('jdk') && fs.statSync(path.join(extractPath, item)).isDirectory()
        );
        
        if (jdkFolder) {
            // Если нашли папку jdk*, перемещаем ее содержимое на уровень выше
            const jdkPath = path.join(extractPath, jdkFolder);
            const tempPath = path.join(this.javaDir, `temp-java-${javaVersion}`);
            
            // Перемещаем содержимое jdk папки в temp
            this.moveContents(jdkPath, tempPath);
            
            // Удаляем старую папку
            fs.rmSync(extractPath, { recursive: true, force: true });
            
            // Переименовываем temp в нужное имя
            fs.renameSync(tempPath, extractPath);
        }
        
        return extractPath;
    }

    // Перемещает содержимое одной папки в другую
    moveContents(source, destination) {
        if (!fs.existsSync(destination)) {
            fs.mkdirSync(destination, { recursive: true });
        }
        
        const items = fs.readdirSync(source);
        for (const item of items) {
            const sourcePath = path.join(source, item);
            const destPath = path.join(destination, item);
            
            if (fs.statSync(sourcePath).isDirectory()) {
                this.moveContents(sourcePath, destPath);
            } else {
                fs.renameSync(sourcePath, destPath);
            }
        }
    }

    // Получаем Java для конкретной версии Minecraft
    async getJavaForVersion(minecraftVersion, progressCallback = null) {
        const requiredVersion = this.getRequiredJavaVersion(minecraftVersion);
        console.log(`Для Minecraft ${minecraftVersion} требуется Java ${requiredVersion}`);
        
        // Всегда проверяем наличие Java и загружаем при необходимости
        let javaPath = this.getJavaPath(requiredVersion);
        
        if (!javaPath) {
            console.log(`Java ${requiredVersion} не найдена, начинаем загрузку...`);
            try {
                await this.downloadJava(requiredVersion, progressCallback);
                javaPath = this.getJavaPath(requiredVersion);
                
                if (!javaPath) {
                    throw new Error(`Не удалось установить Java ${requiredVersion}`);
                }
            } catch (error) {
                console.error(`Ошибка загрузки Java ${requiredVersion}:`, error);
                throw error;
            }
        } else {
            // Java уже установлена - отправляем сообщение о готовности
            if (progressCallback) {
                progressCallback({ stage: 'Java уже установлена', current: 1, total: 1, percent: 100 });
            }
        }
        
        // Проверяем версию установленной Java
        const versionInfo = this.getJavaVersion(javaPath);
        if (versionInfo) {
            console.log(`Используется Java ${versionInfo.version} (${versionInfo.vendor})`);
        } else {
            console.log(`Java найдена по пути: ${javaPath}`);
        }
        
        return javaPath;
    }

    // Получаем информацию о версии Java
    getJavaVersion(javaPath) {
        try {
            const result = spawnSync(javaPath, ['-version'], { 
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            if (result.stderr) {
                const versionMatch = result.stderr.match(/version "([^"]+)"/);
                const vendorMatch = result.stderr.match(/\(([^)]+)\)/);
                
                return {
                    version: versionMatch ? versionMatch[1] : 'unknown',
                    vendor: vendorMatch ? vendorMatch[1] : 'unknown'
                };
            }
        } catch (error) {
            console.error(`Не удалось получить версию Java: ${error.message}`);
        }
        
        return null;
    }

    // Получаем список установленных версий Java
    getInstalledJavaVersions() {
        const versions = [];
        const items = fs.readdirSync(this.javaDir);
        
        for (const item of items) {
            const match = item.match(/^java-(\d+)$/);
            if (match && this.isJavaInstalled(match[1])) {
                versions.push(match[1]);
            }
        }
        
        return versions.sort();
    }

    // Получаем информацию о всех установленных версиях Java
    getJavaInfo() {
        const installedVersions = this.getInstalledJavaVersions();
        const info = {};
        
        for (const version of installedVersions) {
            const javaPath = this.getJavaPath(version);
            const versionInfo = this.getJavaVersion(javaPath);
            
            info[version] = {
                path: javaPath,
                version: versionInfo ? versionInfo.version : 'unknown',
                vendor: versionInfo ? versionInfo.vendor : 'unknown'
            };
        }
        
        return info;
    }

    // Универсальный метод для проверки и загрузки Java
    async ensureJava(minecraftVersion = '1.21', progressCallback = null) {
        const requiredVersion = this.getRequiredJavaVersion(minecraftVersion);
        console.log(`Проверка Java для Minecraft ${minecraftVersion} (требуется Java ${requiredVersion})`);
        
        let javaPath = this.getJavaPath(requiredVersion);
        
        if (!javaPath) {
            console.log(`Java ${requiredVersion} не найдена, начинаем загрузку...`);
            try {
                await this.downloadJava(requiredVersion, progressCallback);
                javaPath = this.getJavaPath(requiredVersion);
                
                if (!javaPath) {
                    throw new Error(`Не удалось установить Java ${requiredVersion}`);
                }
                
                console.log(`Java ${requiredVersion} успешно загружена и установлена`);
            } catch (error) {
                console.error(`Ошибка загрузки Java ${requiredVersion}:`, error);
                throw error;
            }
        } else {
            console.log(`Java ${requiredVersion} уже установлена: ${javaPath}`);
            // Отправляем сообщение о готовности
            if (progressCallback) {
                progressCallback({ stage: 'Java уже установлена', current: 1, total: 1, percent: 100 });
            }
        }
        
        return javaPath;
    }

    // Метод для распаковки ZIP архивов
    async extractZip(zipPath, targetDir) {
        try {
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(targetDir, true); // true = overwrite
            console.log(`Распакован архив: ${path.basename(zipPath)} → ${targetDir}`);
        } catch (error) {
            console.error(`Ошибка распаковки ${zipPath}:`, error.message);
            throw error;
        }
    }
}

module.exports = JavaManager;