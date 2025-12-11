// modpack-manager.js - Улучшенная система управления файлами модпака
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DownloadUtil = require('../utils/DownloadUtil');
const Logger = require('../utils/Logger');

// Логирование
console.log('ModpackManager module loaded');

class ModpackManager {
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

    // Основной метод синхронизации модпака
    async syncModpack(manifest, baseUrl) {
        try {
            console.log('\n=== Синхронизация модпака ===');
            this.logger.info('Starting modpack sync', { files: manifest.files?.length || 0 });

            // 1. Проверка целостности существующих файлов
            this.sendProgress('Проверка целостности файлов', 1, 4);
            const integrityCheck = await this.checkFileIntegrity(manifest.files);
            
            // 2. Удаление лишних файлов
            this.sendProgress('Удаление лишних файлов', 2, 4);
            await this.cleanupExtraFiles(manifest.files, integrityCheck.missing);
            
            // 3. Загрузка поврежденных и отсутствующих файлов
            this.sendProgress('Загрузка файлов', 3, 4);
            await this.downloadMissingFiles(integrityCheck, manifest.files, baseUrl);
            
            // 4. Финальная проверка
            this.sendProgress('Финальная проверка', 4, 4);
            const finalCheck = await this.checkFileIntegrity(manifest.files);
            
            if (finalCheck.corrupted.length > 0 || finalCheck.missing.length > 0) {
                throw new Error(`Не удалось синхронизировать все файлы. Повреждено: ${finalCheck.corrupted.length}, отсутствует: ${finalCheck.missing.length}`);
            }

            this.sendProgress('Синхронизация завершена', 4, 4);
            console.log('✓ Модпак успешно синхронизирован!');
            this.logger.success('Modpack sync completed successfully');

            return {
                success: true,
                downloaded: integrityCheck.missing.length + integrityCheck.corrupted.length,
                deleted: 0, // Будет заполнено в cleanupExtraFiles
                corrupted: finalCheck.corrupted.length
            };

        } catch (err) {
            this.logger.error('Modpack sync failed', err);
            throw err;
        }
    }

    // Проверка целостности всех файлов модпака
    async checkFileIntegrity(files) {
        console.log('  Проверка целостности файлов...');
        
        const result = {
            valid: [],
            corrupted: [],
            missing: []
        };

        for (const file of files) {
            const { path: clientPath, sha1, size } = file;
            
            // Игнорируем файлы в папке apps (для личного использования)
            if (clientPath.startsWith('apps/')) {
                console.log(`    ⏭ Игнорируем файл в папке apps: ${clientPath}`);
                result.valid.push(file); // Помечаем как валидный, чтобы не загружать
                continue;
            }
            
            // Игнорируем файлы с пользовательскими настройками (options.txt, launcher_profiles.json и т.д.)
            // только если они уже существуют
            const userConfigFiles = ['options.txt', 'launcher_profiles.json', 'servers.dat', 'usercache.json', 'servers.dat_old'];
            if (userConfigFiles.some(configFile => clientPath.includes(configFile))) {
                // Если путь начинается с "file/", то файл должен быть в корне
                let actualPath = clientPath;
                if (clientPath.startsWith('file/')) {
                    actualPath = clientPath.substring(5); // Убираем "file/" из пути
                }
                const fullPath = path.join(this.minecraftDir, actualPath.replace(/\//g, path.sep));
                
                if (fs.existsSync(fullPath)) {
                    console.log(`    ⏭ Игнорируем файл с пользовательскими настройками (уже существует): ${clientPath}`);
                    // Добавляем в valid, чтобы не загружать повторно
                    result.valid.push(file);
                    continue;
                } else {
                    console.log(`    ⚠ Файл с пользовательскими настройками не существует, будет проверен: ${clientPath}`);
                    // Продолжаем обычную проверку - файл будет загружен
                }
            }
            
            // Если путь начинается с "file/", то файл должен быть в корне
            let actualPath = clientPath;
            if (clientPath.startsWith('file/')) {
                actualPath = clientPath.substring(5); // Убираем "file/" из пути
            }
            const fullPath = path.join(this.minecraftDir, actualPath.replace(/\//g, path.sep));

            if (!fs.existsSync(fullPath)) {
                result.missing.push(file);
                continue;
            }

            try {
                // Проверка размера файла
                const stats = fs.statSync(fullPath);
                if (size && stats.size !== size) {
                    console.log(`    ⚠ Размер не совпадает: ${clientPath} (ожидалось: ${size}, фактически: ${stats.size})`);
                    result.corrupted.push(file);
                    continue;
                }

                // Проверка SHA1 хеша
                const currentHash = await this.calculateSha1(fullPath);
                if (currentHash !== sha1) {
                    console.log(`    ⚠ Хеш не совпадает: ${clientPath}`);
                    console.log(`      Ожидалось: ${sha1}`);
                    console.log(`      Фактически: ${currentHash}`);
                    result.corrupted.push(file);
                    continue;
                }

                result.valid.push(file);
            } catch (err) {
                console.log(`    ⚠ Ошибка проверки: ${clientPath} - ${err.message}`);
                result.corrupted.push(file);
            }
        }

        console.log(`  Результаты проверки:`);
        console.log(`    ✓ Корректные: ${result.valid.length}`);
        console.log(`    ⚠ Поврежденные: ${result.corrupted.length}`);
        console.log(`    ✗ Отсутствуют: ${result.missing.length}`);

        return result;
    }

    // Удаление файлов, которых нет в манифесте
    async cleanupExtraFiles(manifestFiles, missingFiles) {
        console.log('  Поиск лишних файлов...');
        
        const manifestPaths = new Set(manifestFiles.map(f =>
            path.join(this.minecraftDir, f.path.replace(/\//g, path.sep))
        ));

        // Добавляем пути отсутствующих файлов, чтобы их не удалять
        missingFiles.forEach(f => {
            manifestPaths.add(path.join(this.minecraftDir, f.path.replace(/\//g, path.sep)));
        });

        const modsDir = path.join(this.minecraftDir, 'mods');
        const configDir = path.join(this.minecraftDir, 'config');
        const appsDir = path.join(this.minecraftDir, 'apps');
        
        let deletedCount = 0;

        // Проверяем только директории, которые обычно содержат файлы модпака
        // ИСКЛЮЧАЕМ папку config - файлы там создаются модами автоматически
        const checkDirs = [modsDir];
        
        // Список пользовательских файлов, которые НЕЛЬЗЯ удалять
        const protectedUserFiles = ['options.txt', 'launcher_profiles.json', 'servers.dat', 'usercache.json', 'servers.dat_old'];
        
        for (const dir of checkDirs) {
            if (!fs.existsSync(dir)) continue;
            
            try {
                const files = await this.getAllFiles(dir);
                for (const file of files) {
                    // Игнорируем файлы в папке apps
                    if (file.startsWith(appsDir)) {
                        continue;
                    }
                    
                    // Игнорируем пользовательские файлы настроек
                    const fileName = path.basename(file);
                    if (protectedUserFiles.includes(fileName)) {
                        console.log(`    ⏭ Защищенный пользовательский файл: ${fileName}`);
                        continue;
                    }
                    
                    if (!manifestPaths.has(file)) {
                        console.log(`    🗑 Удаление лишнего файла: ${path.relative(this.minecraftDir, file)}`);
                        fs.unlinkSync(file);
                        deletedCount++;
                    }
                }
            } catch (err) {
                console.log(`    ⚠ Ошибка при проверке директории ${dir}: ${err.message}`);
            }
        }

        console.log(`  Удалено лишних файлов: ${deletedCount}`);
        return deletedCount;
    }

    // Рекурсивно получаем все файлы в директории
    async getAllFiles(dir) {
        const files = [];
        
        const walk = (currentDir) => {
            if (!fs.existsSync(currentDir)) return;
            
            const items = fs.readdirSync(currentDir);
            for (const item of items) {
                const fullPath = path.join(currentDir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    walk(fullPath);
                } else {
                    files.push(fullPath);
                }
            }
        };

        walk(dir);
        return files;
    }

    // Дозагрузка отсутствующих и поврежденных файлов
    async downloadMissingFiles(integrityCheck, manifestFiles, baseUrl) {
        console.log('  DEBUG: integrityCheck.missing:', integrityCheck.missing.map(f => f.path));
        console.log('  DEBUG: integrityCheck.corrupted:', integrityCheck.corrupted.map(f => f.path));
        
        // Фильтруем файлы, исключая те, что находятся в папке apps
        // И исключаем пользовательские файлы настроек, если они уже существуют
        const filesToDownload = [...integrityCheck.missing, ...integrityCheck.corrupted].filter(file => {
            if (file.path.startsWith('apps/')) {
                console.log(`    ⏭ Пропускаем файл в папке apps: ${file.path}`);
                return false;
            }
            
            // Проверяем, является ли файл пользовательским конфигом
            const userConfigFiles = ['options.txt', 'launcher_profiles.json', 'servers.dat', 'usercache.json', 'servers.dat_old'];
            if (userConfigFiles.some(configFile => file.path.includes(configFile))) {
                let actualPath = file.path;
                if (file.path.startsWith('file/')) {
                    actualPath = file.path.substring(5); // Убираем "file/" из пути
                }
                const fullPath = path.join(this.minecraftDir, actualPath.replace(/\//g, path.sep));
                
                if (fs.existsSync(fullPath)) {
                    console.log(`    ⏭ Пропускаем загрузку пользовательского файла (уже существует): ${file.path}`);
                    // Пропускаем загрузку, если файл уже существует
                    return false;
                } else {
                    console.log(`    ⚠ Пользовательский файл не существует, будет загружен: ${file.path}`);
                    // Продолжаем загрузку, если файл не существует
                }
            }
            
            return true;
        });
        
        console.log('  DEBUG: filesToDownload after filtering:', filesToDownload.map(f => f.path));
        
        if (filesToDownload.length === 0) {
            console.log('  Все файлы корректны, дозагрузка не требуется');
            return { success: true, downloaded: 0 };
        }

        console.log(`  Дозагрузка файлов: ${filesToDownload.length}`);

        const toDownload = filesToDownload.map(file => {
            const { path: clientPath, url: relativeUrl, sha1, size } = file;
            
            const fileUrl = relativeUrl
                ? new URL(relativeUrl, `${baseUrl}/`).toString()
                : `${baseUrl}/${clientPath.replace(/^\//, '')}`;

            // Если путь начинается с "file/", то файл должен быть в корне
            let actualPath = clientPath;
            if (clientPath.startsWith('file/')) {
                actualPath = clientPath.substring(5); // Убираем "file/" из пути
            }
            const fullPath = path.join(this.minecraftDir, actualPath.replace(/\//g, path.sep));
            this.ensureDir(path.dirname(fullPath));

            return {
                url: fileUrl,
                path: fullPath,
                sha1,
                name: clientPath,
                size
            };
        });

        const result = await this.downloader.downloadParallel(
            toDownload,
            6,
            (completed, total, file) => {
                const percent = Math.round((completed / total) * 100);
                this.sendProgress(
                    `Дозагрузка: ${completed}/${total}`,
                    3,
                    4,
                    percent
                );
                
                process.stdout.write(`\r  [${completed}/${total}] ${path.basename(file.path).padEnd(40).substring(0, 40)}`);
            }
        );

        console.log('\n');

        if (result.failed.length > 0) {
            console.error(`  ⚠ Не удалось загрузить ${result.failed.length} файлов:`);
            result.failed.forEach(f => {
                console.error(`    - ${f.name}`);
            });
            throw new Error(`Не удалось загрузить ${result.failed.length} файлов`);
        }

        console.log(`  ✓ Успешно загружено: ${result.completed} файлов`);
        return { success: true, downloaded: result.completed };
    }

    // Вычисление SHA1 хеша файла
    async calculateSha1(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha1');
            const stream = fs.createReadStream(filePath);
            stream.on('data', d => hash.update(d));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    // Создание директории
    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // Проверка, установлен ли модпак корректно
    async isModpackInstalled(manifest) {
        try {
            const integrityCheck = await this.checkFileIntegrity(manifest.files);
            return integrityCheck.corrupted.length === 0 && integrityCheck.missing.length === 0;
        } catch (err) {
            this.logger.error('Error checking modpack installation', err);
            return false;
        }
    }
}

module.exports = ModpackManager;