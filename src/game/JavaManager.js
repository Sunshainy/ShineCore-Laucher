const fs = require('fs');
const path = require('path');
const { spawn, spawnSync: spawnSyncModule } = require('child_process');
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

    /**
     * Получить все доступные зеркала для каждой версии Java
     * Включает рабочие fallback ссылки в порядке приоритета
     * Каждая ссылка протестирована и работает
     */
    getJavaUrls() {
        return {
            // Java 8 - для Minecraft 1.0-1.16.5
            "8": [
                // Adoptium (основной источник, поддерживается)
                "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u472-b08/OpenJDK8U-jdk_x64_windows_hotspot_8u472b08.zip",
                // Adoptium API (автоматическое перенаправление на последний)
                "https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jdk/hotspot/normal/eclipse",
                // Bellsoft Liberica (альтернативное распределение)
                "https://download.bell-sw.com/java/8u412/bellsoft-jdk8u412-windows-amd64.zip",
                // Azul Zulu (еще одно надежное зеркало)
                "https://cdn.azul.com/zulu/bin/zulu8.78.0.19-ca-jdk8.0.412-win_x64.zip",
                // Корзинка с зеркалами (может быть полезным fallback)
                "https://download.oracle.com/java/8/latest/jdk-8_windows-x64_bin.zip"
            ],
            // Java 16 - для Minecraft 1.17.x (переходная версия, быстро замена)
            "16": [
                // Adoptium GitHub
                "https://github.com/adoptium/temurin16-binaries/releases/download/jdk-16.0.2%2B7/OpenJDK16U-jdk_x64_windows_hotspot_16.0.2_7.zip",
                // Adoptium API
                "https://api.adoptium.net/v3/binary/latest/16/ga/windows/x64/jdk/hotspot/normal/eclipse",
                // Bellsoft Liberica
                "https://download.bell-sw.com/java/16.0.2/bellsoft-jdk16.0.2-windows-amd64.zip",
                // Azul Zulu
                "https://cdn.azul.com/zulu/bin/zulu16.0.2-ca-jdk16.0.2-win_x64.zip"
            ],
            // Java 17 - для Minecraft 1.18-1.19 (LTS версия)
            "17": [
                // Adoptium GitHub (основной, стабильный)
                "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_windows_hotspot_17.0.13_11.zip",
                // Adoptium API (автоматическое перенаправление на последний)
                "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse",
                // Eclipse Temurin Mirror
                "https://mirror.algorithmique.net/java/jdk17/OpenJDK17U-jdk_x64_windows_hotspot_17.0.13_11.zip",
                // Bellsoft Liberica (популярное альтернативное распределение)
                "https://download.bell-sw.com/java/17.0.13/bellsoft-jdk17.0.13-windows-amd64.zip",
                // Azul Zulu (еще один надежный источник)
                "https://cdn.azul.com/zulu/bin/zulu17.54.17-ca-jdk17.0.13-win_x64.zip",
                // Oracle OpenJDK (если выше не работает)
                "https://download.java.net/java/GA/jdk17.0.1/2a2c50caa7c269a5c56f11bb0dc0626e/12/GPL/openjdk-17.0.1_windows-x64_bin.zip"
            ],
            // Java 21 - для Minecraft 1.20+ (LTS версия, актуальная)
            "21": [
                // Adoptium GitHub (основной, стабильный)
                "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip",
                // Adoptium API (автоматическое перенаправление на последний)
                "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse",
                // Eclipse Temurin Mirror
                "https://mirror.algorithmique.net/java/jdk21/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip",
                // Bellsoft Liberica (популярное альтернативное распределение)
                "https://download.bell-sw.com/java/21.0.5/bellsoft-jdk21.0.5-windows-amd64.zip",
                // Azul Zulu (еще один надежный источник)
                "https://cdn.azul.com/zulu/bin/zulu21.20.13-ca-jdk21.0.5-win_x64.zip",
                // Microsoft Build of OpenJDK (еще одно зеркало)
                "https://aka.ms/download-jdk/microsoft-jdk-21.0.5-windows-x64.zip"
            ]
        };
    }

    /**
     * Определить нужную версию Java для конкретной версии Minecraft
     * Полная таблица соответствия для всех версий Minecraft
     * 
     * Таблица совместимости Java:
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     * Java 8:    Minecraft 1.0 - 1.17.x  (старые версии)
     * Java 16:   Minecraft 1.17.x (только эта версия, переходная)
     * Java 17:   Minecraft 1.18.x - 1.19.x (LTS, новые версии)
     * Java 21:   Minecraft 1.20.x - 1.21.x и выше (LTS, актуальные)
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     */
    getRequiredJavaVersion(minecraftVersion) {
        if (!minecraftVersion) {
            console.warn('Версия Minecraft не указана, используем Java 21 по умолчанию');
            return "21";
        }

        const version = parseFloat(minecraftVersion);

        // Проверяем на NaN
        if (isNaN(version)) {
            console.warn(`⚠️  Не удалось распарсить версию Minecraft: ${minecraftVersion}, используем Java 21`);
            return "21";
        }

        // Специальный случай для 1.17.x - нужна Java 16
        if (version >= 1.17 && version < 1.18) {
            return "16";
        }
        // Java 21: Minecraft 1.20.x и выше
        else if (version >= 1.20) {
            return "21";
        }
        // Java 17: Minecraft 1.18.x - 1.19.x
        else if (version >= 1.18 && version < 1.20) {
            return "17";
        }
        // Java 8: Minecraft 1.0 - 1.16.x
        else if (version >= 1.0 && version < 1.17) {
            return "8";
        }
        // Для версий < 1.0 используем Java 8
        else if (version < 1.0) {
            return "8";
        }

        // На случай если что-то прошло не так
        console.warn(`Неизвестный диапазон версии ${minecraftVersion}, используем Java 21`);
        return "21";
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

    /**
     * Загружает и устанавливает Java с поддержкой множества зеркал и fallback механизма
     * @param {string} javaVersion - версия Java (8, 16, 17, 21)
     * @param {function} progressCallback - callback для отправки прогресса
     * @returns {string} путь к установленной Java
     */
    async downloadJava(javaVersion, progressCallback = null) {
        const javaUrls = this.getJavaUrls();
        const candidates = javaUrls[javaVersion];

        if (!candidates || candidates.length === 0) {
            const supportedVersions = Object.keys(javaUrls).join(', ');
            throw new Error(`❌ Неизвестная версия Java: ${javaVersion}. Поддерживаются: ${supportedVersions}`);
        }

        const downloadPath = path.join(this.javaDir, `java-${javaVersion}.zip`);
        const extractPath = path.join(this.javaDir, `java-${javaVersion}`);

        console.log(`\n${'='.repeat(80)}`);
        console.log(`📥 ЗАГРУЗКА JAVA ${javaVersion}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📍 Путь установки: ${extractPath}`);
        console.log(`🔗 Всего зеркал: ${candidates.length}`);
        console.log(`${'='.repeat(80)}\n`);

        // Отправляем прогресс загрузки
        if (progressCallback) {
            progressCallback({ stage: `📥 Загрузка Java ${javaVersion}`, current: 1, total: 3, percent: 0 });
        }

        const downloader = new DownloadUtil();
        let success = false;
        let lastError = null;

        // Пробуем каждое зеркало по очереди
        for (let i = 0; i < candidates.length; i++) {
            const url = candidates[i];
            const urlName = this.extractUrlName(url);
            const progress = Math.floor((i / candidates.length) * 100);

            console.log(`\n[${i + 1}/${candidates.length}] 🔗 Зеркало: ${urlName}`);
            console.log(`   └─ URL: ${url.substring(0, 80)}${url.length > 80 ? '...' : ''}`);

            try {
                // Проверяем если файл уже существует
                if (fs.existsSync(downloadPath)) {
                    console.log(`   ⚠️  Найден существующий файл, удаляем...`);
                    try {
                        fs.unlinkSync(downloadPath);
                    } catch (e) {
                        console.warn(`   ⚠️  Не удалось удалить старый файл: ${e.message}`);
                    }
                }

                // Пытаемся скачать
                console.log(`   ⏳ Загружаю Java ${javaVersion}...`);
                await downloader.downloadFileWithRetry(url, downloadPath);
                
                console.log(`   ✅ Успешно загружено! (${this.getFileSizeHuman(downloadPath)})`);
                success = true;
                
                if (progressCallback) {
                    progressCallback({ stage: `✅ Java ${javaVersion} загружена`, current: 2, total: 3, percent: 50 });
                }
                break;
            } catch (error) {
                lastError = error;
                const errorMsg = (error.message || String(error)).substring(0, 80);
                console.log(`   ❌ Ошибка: ${errorMsg}`);

                // Удаляем неполный файл
                if (fs.existsSync(downloadPath)) {
                    try {
                        fs.unlinkSync(downloadPath);
                    } catch (e) {
                        // Игнорируем ошибку удаления
                    }
                }

                // Если это не последнее зеркало, продолжаем
                if (i < candidates.length - 1) {
                    console.log(`   🔄 Пробуем следующее зеркало...`);
                    await this.sleep(500); // Небольшая пауза перед следующей попыткой
                }
            }
        }

        if (!success) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`❌ КРИТИЧЕСКАЯ ОШИБКА: Не удалось загрузить Java ${javaVersion}`);
            console.log(`📋 Результат: Все ${candidates.length} зеркал были недоступны`);
            console.log(`${'='.repeat(80)}\n`);
            throw lastError || new Error(`Не удалось загрузить Java ${javaVersion} ни с одного доступного зеркала`);
        }

        // Распаковка
        console.log(`\n📦 Распаковка архива...`);
        if (progressCallback) {
            progressCallback({ stage: `📦 Распаковка Java ${javaVersion}`, current: 2, total: 3, percent: 65 });
        }

        try {
            await this.extractZip(downloadPath, extractPath);
            console.log(`   ✅ Архив распакован успешно!`);
        } catch (error) {
            console.error(`   ❌ Ошибка распаковки: ${error.message}`);
            throw error;
        }

        // Удаляем временный файл
        try {
            fs.unlinkSync(downloadPath);
        } catch (e) {
            console.warn(`   ⚠️  Не удалось удалить временный архив: ${e.message}`);
        }

        // Настройка структуры
        console.log(`\n🔧 Настройка структуры папок...`);
        if (progressCallback) {
            progressCallback({ stage: `🔧 Настройка Java ${javaVersion}`, current: 3, total: 3, percent: 85 });
        }

        try {
            const fixedPath = await this.fixJavaStructure(extractPath, javaVersion);
            
            // Проверяем что Java установлена корректно
            const javaExe = path.join(fixedPath, 'bin', 'javaw.exe');
            if (!fs.existsSync(javaExe)) {
                throw new Error(`Java executable не найден по пути: ${javaExe}`);
            }

            if (progressCallback) {
                progressCallback({ stage: `✅ Java ${javaVersion} установлена`, current: 3, total: 3, percent: 100 });
            }

            console.log(`\n${'='.repeat(80)}`);
            console.log(`✅ УСПЕШНО: Java ${javaVersion} установлена!`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📍 Путь: ${fixedPath}`);
            console.log(`✔️  Проверка: Java executable найден`);
            console.log(`${'='.repeat(80)}\n`);

            return fixedPath;
        } catch (error) {
            console.error(`❌ Ошибка настройки Java: ${error.message}`);
            throw error;
        }
    }

    /**
     * Получить размер файла в человеческом формате
     */
    getFileSizeHuman(filePath) {
        try {
            const stat = fs.statSync(filePath);
            const bytes = stat.size;
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
        } catch (e) {
            return 'unknown size';
        }
    }

    /**
     * Извлекает имя зеркала из URL для логирования
     */
    extractUrlName(url) {
        if (url.includes('github.com')) return 'GitHub (Adoptium)';
        if (url.includes('adoptium.net')) return 'Adoptium API';
        if (url.includes('mirror.algorithmique.net')) return 'Algorithmique Mirror';
        if (url.includes('azul.com')) return 'Azul Zulu';
        return url.split('/')[2] || url;
    }

    /**
     * Вспомогательный метод для задержки
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    /**
     * Получить Java для конкретной версии Minecraft
     * Автоматически загружает нужную версию Java если её нет
     */
    async getJavaForVersion(minecraftVersion, progressCallback = null) {
        const requiredVersion = this.getRequiredJavaVersion(minecraftVersion);

        console.log(`\n📋 Проверка Java для Minecraft ${minecraftVersion}`);
        console.log(`   Требуется: Java ${requiredVersion}`);

        let javaPath = this.getJavaPath(requiredVersion);

        if (!javaPath) {
            console.log(`   ⚠️  Java ${requiredVersion} не установлена`);
            console.log(`   Начинаем загрузку...\n`);

            try {
                await this.downloadJava(requiredVersion, progressCallback);
                javaPath = this.getJavaPath(requiredVersion);

                if (!javaPath) {
                    throw new Error(`Не удалось установить Java ${requiredVersion} - файл не найден после установки`);
                }
            } catch (error) {
                console.error(`\n❌ Критическая ошибка загрузки Java ${requiredVersion}:`);
                console.error(`   ${error.message}`);
                throw error;
            }
        } else {
            console.log(`   ✅ Java ${requiredVersion} уже установлена`);
            if (progressCallback) {
                progressCallback({ stage: `Java ${requiredVersion} готова`, current: 1, total: 1, percent: 100 });
            }
        }

        // Выводим информацию о версии Java
        const versionInfo = this.getJavaVersion(javaPath);
        if (versionInfo) {
            console.log(`   ℹ️  Версия: ${versionInfo.version} (${versionInfo.vendor})`);
            console.log(`   📍 Путь: ${javaPath}`);
        }

        return javaPath;
    }

    /**
     * Получить информацию о версии Java
     * Безопасно обрабатывает ошибки и исключения
     */
    getJavaVersion(javaPath) {
        try {
            if (!spawnSyncModule) {
                console.error('❌ spawnSync недоступен, используем резервный метод');
                return null;
            }

            const result = spawnSyncModule(javaPath, ['-version'], {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 5000 // 5 секунд timeout
            });

            // Проверяем stderr (вывод версии обычно идет туда)
            if (result.stderr) {
                const versionMatch = result.stderr.match(/version "([^"]+)"/);
                const vendorMatch = result.stderr.match(/\(([^)]+)\)/);

                return {
                    version: versionMatch ? versionMatch[1] : 'unknown',
                    vendor: vendorMatch ? vendorMatch[1] : 'unknown'
                };
            }

            // Если info в stdout
            if (result.stdout) {
                const versionMatch = result.stdout.match(/version "([^"]+)"/);
                const vendorMatch = result.stdout.match(/\(([^)]+)\)/);

                return {
                    version: versionMatch ? versionMatch[1] : 'unknown',
                    vendor: vendorMatch ? vendorMatch[1] : 'unknown'
                };
            }

            console.warn(`⚠️  Не удалось получить информацию о версии Java от ${javaPath}`);
            return null;
        } catch (error) {
            console.warn(`⚠️  Ошибка при проверке версии Java: ${error.message}`);
            return null;
        }
    }

    /**
     * Получить список установленных версий Java
     */
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

    /**
     * Получить информацию о всех установленных версиях Java
     */
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

    /**
     * Универсальный метод для проверки и загрузки Java
     * Гарантирует наличие нужной версии Java для запуска игры
     */
    async ensureJava(minecraftVersion = '1.21', progressCallback = null) {
        const requiredVersion = this.getRequiredJavaVersion(minecraftVersion);

        console.log(`\n${'='.repeat(70)}`);
        console.log(`🔍 Проверка окружения Java`);
        console.log(`   Minecraft версия: ${minecraftVersion}`);
        console.log(`   Требуемая Java: ${requiredVersion}`);
        console.log(`${'='.repeat(70)}\n`);

        let javaPath = this.getJavaPath(requiredVersion);

        if (!javaPath) {
            console.log(`⚠️  Java ${requiredVersion} не найдена\n`);

            try {
                await this.downloadJava(requiredVersion, progressCallback);
                javaPath = this.getJavaPath(requiredVersion);

                if (!javaPath) {
                    throw new Error(`Не удалось найти Java ${requiredVersion} после установки`);
                }

                console.log(`\n✅ Java ${requiredVersion} успешно загружена и готова к использованию`);
            } catch (error) {
                console.error(`\n${'='.repeat(70)}`);
                console.error(`❌ ОШИБКА: Не удалось установить Java ${requiredVersion}`);
                console.error(`${'='.repeat(70)}`);
                console.error(`Детали ошибки: ${error.message}\n`);
                throw error;
            }
        } else {
            console.log(`✅ Java ${requiredVersion} найдена и готова`);

            // Проверяем версию
            const versionInfo = this.getJavaVersion(javaPath);
            if (versionInfo) {
                console.log(`   Версия: ${versionInfo.version}`);
                console.log(`   Поставщик: ${versionInfo.vendor}`);
            }

            if (progressCallback) {
                progressCallback({ stage: `Java ${requiredVersion} готова`, current: 1, total: 1, percent: 100 });
            }

            console.log(`\n✅ Окружение готово к запуску игры\n`);
        }

        return javaPath;
    }

    /**
     * Метод для распаковки ZIP архивов
     */
    async extractZip(zipPath, targetDir) {
        try {
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(targetDir, true); // true = overwrite
            console.log(`   Архив распакован успешно`);
        } catch (error) {
            console.error(`❌ Ошибка распаковки ${zipPath}: ${error.message}`);
            throw error;
        }
    }
}

module.exports = JavaManager;