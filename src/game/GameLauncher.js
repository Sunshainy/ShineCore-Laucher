const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const JavaManager = require('./JavaManager');

class GameLauncher {
    constructor(minecraftDir) {
        this.minecraftDir = minecraftDir;
        this.javaManager = new JavaManager(minecraftDir);
    }

    // Получение списка установленных версий
    getInstalledVersions() {
        const versionsDir = path.join(this.minecraftDir, 'versions');
        
        if (!fs.existsSync(versionsDir)) {
            return [];
        }

        const versions = fs.readdirSync(versionsDir).filter(dir => {
            const versionDir = path.join(versionsDir, dir);
            const jsonPath = path.join(versionDir, `${dir}.json`);
            
            // Для версий достаточно наличия JSON файла
            // JAR может быть унаследован от родительской версии
            return fs.statSync(versionDir).isDirectory() && fs.existsSync(jsonPath);
        });

        return versions;
    }

    // Запуск игры
    async launch(versionId, username = 'Player', ram = 4) {
        // Сохраняем RAM в свойство класса для использования в buildJvmArguments
        this.currentRam = ram;
        const versionDir = path.join(this.minecraftDir, 'versions', versionId);
        const versionJsonPath = path.join(versionDir, `${versionId}.json`);
        const versionJarPath = path.join(versionDir, `${versionId}.jar`);

        // Проверяем существование файлов
        if (!fs.existsSync(versionJsonPath)) {
            throw new Error(`Не найден JSON файл версии: ${versionJsonPath}`);
        }

        // Читаем JSON версии
        let versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));

        // Обрабатываем наследование (inheritsFrom) для Fabric и других модлоадеров
        if (versionJson.inheritsFrom) {
            console.log(`  Загрузка базовой версии: ${versionJson.inheritsFrom}`);
            versionJson = await this.mergeVersions(versionJson, versionJson.inheritsFrom);
            
            // Дополнительная проверка для Fabric
            if (versionId.includes('fabric')) {
                console.log(`\n  Проверка критичных библиотек Fabric...`);
                const criticalLibs = [
                    'net.fabricmc:fabric-loader',
                    'net.fabricmc:intermediary',
                    'net.sf.jopt-simple:jopt-simple'
                ];
                
                const foundLibs = versionJson.libraries.filter(lib =>
                    criticalLibs.some(critical => lib.name.startsWith(critical))
                );
                
                console.log(`  Найдено критичных библиотек: ${foundLibs.length}/${criticalLibs.length}`);
                foundLibs.forEach(lib => {
                    console.log(`    ✓ ${lib.name}`);
                });
                
                if (foundLibs.length < criticalLibs.length) {
                    console.error(`  ⚠ Некоторые критичные библиотеки Fabric отсутствуют!`);
                }
            }
        }

        // Проверяем Java версию
        this.checkJavaVersion(versionJson);

        // Формируем classpath
        const classpath = this.buildClasspath(versionJson, versionId);

        // Формируем аргументы JVM
        const jvmArgs = this.buildJvmArguments(versionJson, versionId, classpath);

        // Формируем аргументы игры
        const gameArgs = this.buildGameArguments(versionJson, username, versionId);

        // Получаем путь к Java через менеджер
        const minecraftVersion = this.extractMinecraftVersion(versionId);
        const javaPath = await this.javaManager.getJavaForVersion(minecraftVersion);

        // Полный набор аргументов
        const args = [...jvmArgs, versionJson.mainClass, ...gameArgs];

        console.log('\n--- Параметры запуска ---');
        console.log(`Java: ${javaPath}`);
        console.log(`Версия: ${versionId}`);
        console.log(`Игрок: ${username}`);
        console.log(`Главный класс: ${versionJson.mainClass}`);
        
        // Дополнительная информация для Fabric
        if (versionJson.inheritsFrom) {
            console.log(`Базовая версия: ${versionJson.inheritsFrom}`);
        }
        
        console.log(`Количество библиотек: ${versionJson.libraries?.length || 0}`);
        console.log('------------------------\n');

        // ВСЕГДА показываем отладочную информацию для Fabric
        if (versionId.includes('fabric') || process.env.DEBUG_LAUNCHER) {
            console.log('=== DEBUG: Информация о запуске ===');
            console.log(`Рабочая директория: ${this.minecraftDir}`);
            console.log(`\nКоличество JVM аргументов: ${jvmArgs.length}`);
            console.log(`Количество игровых аргументов: ${gameArgs.length}`);
            
            // Проверяем classpath
            const classpathLibs = classpath.split(process.platform === 'win32' ? ';' : ':');
            console.log(`\nКоличество библиотек в classpath: ${classpathLibs.length}`);
            
            // Проверяем существование первых 5 библиотек
            console.log('\nПроверка первых 5 библиотек:');
            classpathLibs.slice(0, 5).forEach((lib, i) => {
                const exists = fs.existsSync(lib);
                console.log(`  ${i + 1}. ${exists ? '✓' : '✗'} ${path.basename(lib)}`);
            });
            
            // Проверяем последние 5 библиотек (включая основной JAR)
            console.log('\nПроверка последних 5 библиотек:');
            classpathLibs.slice(-5).forEach((lib, i) => {
                const exists = fs.existsSync(lib);
                console.log(`  ${i + 1}. ${exists ? '✓' : '✗'} ${path.basename(lib)}`);
            });
            
            console.log('\n=== Полный список аргументов ===');
            console.log('\nJVM аргументы:');
            jvmArgs.forEach((arg, i) => {
                if (arg.length > 100) {
                    console.log(`  ${i + 1}. ${arg.substring(0, 100)}...`);
                } else {
                    console.log(`  ${i + 1}. ${arg}`);
                }
            });
            
            console.log('\nИгровые аргументы:');
            gameArgs.forEach((arg, i) => {
                console.log(`  ${i + 1}. ${arg}`);
            });
            console.log('=====================================\n');
        }

        // Создаем папки для игры
        this.ensureDir(path.join(this.minecraftDir, 'saves'));
        this.ensureDir(path.join(this.minecraftDir, 'resourcepacks'));
        this.ensureDir(path.join(this.minecraftDir, 'logs'));

        // Проверяем существование Java перед запуском
        console.log(`Проверка Java: ${javaPath}`);
        if (!fs.existsSync(javaPath)) {
            throw new Error(`Java не найдена по пути: ${javaPath}`);
        }
        
        // Получаем информацию о версии Java
        try {
            const versionProcess = spawnSync(javaPath, ['-version'], { encoding: 'utf8' });
            if (versionProcess.stderr) {
                const versionMatch = versionProcess.stderr.match(/version "([^"]+)"/);
                if (versionMatch) {
                    console.log(`Найдена Java версии: ${versionMatch[1]}`);
                }
            }
        } catch (error) {
            console.log(`Не удалось получить версию Java: ${error.message}`);
        }
        
        // Запускаем игру
        return new Promise((resolve, reject) => {
            let stderrData = '';
            
            console.log(`Запуск Minecraft с Java: ${javaPath}`);
            console.log(`Аргументы запуска: ${args.length} аргументов`);
            console.log(`Рабочая директория: ${this.minecraftDir}`);
            
            const gameProcess = spawn(javaPath, args, {
                cwd: this.minecraftDir,
                stdio: ['inherit', 'inherit', 'pipe'] // Перехватываем stderr для логирования
            });

            // Логируем stderr для диагностики
            if (gameProcess.stderr) {
                gameProcess.stderr.on('data', (data) => {
                    const text = data.toString();
                    stderrData += text;
                    // Выводим stderr в реальном времени
                    process.stderr.write(data);
                    
                    // Логируем ошибки Minecraft в консоль отладки
                    const lines = text.split('\n');
                    lines.forEach(line => {
                        if (line.trim()) {
                            console.error(`[Minecraft] ${line.trim()}`);
                        }
                    });
                });
            }

            gameProcess.on('error', (error) => {
                console.error(`Ошибка запуска Minecraft: ${error.message}`);
                console.error(`Stack trace: ${error.stack}`);
                reject(new Error(`Ошибка запуска: ${error.message}`));
            });

            // Возвращаем PID процесса сразу после запуска
            // Не ждем завершения игры, так как это блокирует UI
            if (gameProcess.pid) {
                console.log(`Minecraft запущен с PID: ${gameProcess.pid}`);
                resolve({ pid: gameProcess.pid });
            } else {
                // Если PID не получен сразу, ждем немного
                setTimeout(() => {
                    if (gameProcess.pid) {
                        console.log(`Minecraft запущен с PID: ${gameProcess.pid}`);
                        resolve({ pid: gameProcess.pid });
                    } else {
                        reject(new Error('Не удалось запустить Minecraft'));
                    }
                }, 500);
            }

            // Отслеживаем завершение игры отдельно (не блокируем Promise)
            gameProcess.on('exit', (code) => {
                if (code === 0) {
                    console.log('\nИгра завершена успешно');
                } else {
                    // Сохраняем stderr в файл для анализа
                    if (stderrData) {
                        const errorLogPath = path.join(this.minecraftDir, 'launcher-error.log');
                        fs.writeFileSync(errorLogPath, stderrData);
                        console.error(`\n⚠ Логи ошибок сохранены в: ${errorLogPath}`);
                    }
                    console.error(`Игра завершена с кодом: ${code}`);
                }
            });
        });
    }

    // Замени полностью функцию mergeVersions в GameLauncher.js
async mergeVersions(modloaderJson, parentVersionId) {
    const parentJsonPath = path.join(
        this.minecraftDir, 
        'versions', 
        parentVersionId, 
        `${parentVersionId}.json`
    );

    if (!fs.existsSync(parentJsonPath)) {
        throw new Error(`Не найдена родительская версия: ${parentVersionId}`);
    }

    console.log(`  Чтение базовой версии: ${parentJsonPath}`);
    const parentJson = JSON.parse(fs.readFileSync(parentJsonPath, 'utf8'));

    // === КЛЮЧЕВАЯ ЧАСТЬ: фильтрация дублей по groupId:artifactId ===
    const seen = new Map(); // ключ: "group:artifact" → library object (из модлоадера имеет приоритет)

    // Сначала добавляем все библиотеки из модлоадера (они имеют приоритет)
    if (modloaderJson.libraries) {
        for (const lib of modloaderJson.libraries) {
            const key = this.getLibraryKey(lib);
            if (key) seen.set(key, lib);
        }
        console.log(`  Библиотеки модлоадера: ${modloaderJson.libraries.length}`);
    }

    // Потом добавляем ванильные, только если их ещё нет
    if (parentJson.libraries) {
        let addedFromParent = 0;
        for (const lib of parentJson.libraries) {
            const key = this.getLibraryKey(lib);
            if (key && !seen.has(key)) {
                seen.set(key, lib);
                addedFromParent++;
            }
        }
        console.log(`  Добавлено из ванильной версии: ${addedFromParent}`);
    }

    const mergedLibraries = Array.from(seen.values());

    console.log(`  Всего библиотек после фильтрации дублей: ${mergedLibraries.length}`);

    // Остальное — как было (аргументы и т.д.)
    let mergedArguments = {};
    if (parentJson.arguments || modloaderJson.arguments) {
        const parentGameArgs = parentJson.arguments?.game || [];
        const modloaderGameArgs = modloaderJson.arguments?.game || [];
        const parentJvmArgs = parentJson.arguments?.jvm || [];
        const modloaderJvmArgs = modloaderJson.arguments?.jvm || [];
        
        mergedArguments = {
            game: [...modloaderGameArgs, ...parentGameArgs],  // модлоадер тоже имеет приоритет!
            jvm: [...modloaderJvmArgs, ...parentJvmArgs]
        };
    }

    

    const merged = {
        ...parentJson,
        ...modloaderJson,
        libraries: mergedLibraries,
        id: modloaderJson.id,
        mainClass: modloaderJson.mainClass || parentJson.mainClass
    };

    if (Object.keys(mergedArguments).length > 0) {
        merged.arguments = mergedArguments;
    }

    console.log(`  Версии объединены успешно`);
    console.log(`  Главный класс: ${merged.mainClass}`);

    return merged;
    }

    // Вспомогательная функция — получает уникальный ключ group:artifact
    getLibraryKey(lib) {
    if (!lib.name) return null;
    const parts = lib.name.split(':');
    if (parts.length < 2) return null;
    return `${parts[0]}:${parts[1]}`; // например: org.ow2.asm:asm
    }

    // Построение classpath — ИСПРАВЛЕННАЯ ВЕРСИЯ
buildClasspath(versionJson, versionId) {
    const separator = process.platform === 'win32' ? ';' : ':';
    const libraries = [];
    const missingLibraries = [];

    console.log(`\n  Построение classpath...`);

    // Собираем ВСЕ библиотеки, включая нативные
    for (const lib of versionJson.libraries) {
        // Для Fabric ВСЕ библиотеки должны быть в classpath
        const shouldInclude = this.checkLibraryRules(lib.rules);
        
        if (!shouldInclude) {
            continue;
        }

        let libPath = null;

        // Основной артефакт библиотеки
        if (lib.downloads?.artifact) {
            libPath = path.join(this.minecraftDir, 'libraries', lib.downloads.artifact.path);
            
            if (fs.existsSync(libPath)) {
                libraries.push(libPath);
            } else {
                missingLibraries.push({ name: lib.name, path: libPath, type: 'main' });
            }
        }

        // Нативные библиотеки (classifiers) - КРИТИЧНО ДЛЯ FABRIC
        if (lib.downloads?.classifiers) {
            const nativeKey = this.getNativeClassifier(lib.natives);
            if (nativeKey && lib.downloads.classifiers[nativeKey]) {
                const nativePath = path.join(this.minecraftDir, 'libraries', lib.downloads.classifiers[nativeKey].path);
                
                if (fs.existsSync(nativePath)) {
                    libraries.push(nativePath);
                } else {
                    missingLibraries.push({ 
                        name: `${lib.name}:${nativeKey}`, 
                        path: nativePath, 
                        type: 'native' 
                    });
                }
            }
        }

        // Резервный путь для библиотек без downloads
        if (!libPath && lib.name && !lib.downloads) {
            libPath = this.getMavenLibraryPath(lib.name, lib.url);
            if (libPath && fs.existsSync(libPath)) {
                libraries.push(libPath);
            } else if (libPath) {
                missingLibraries.push({ name: lib.name, path: libPath, type: 'fallback' });
            }
        }
    }

    // Добавляем JAR клиента
    const versionJar = path.join(this.minecraftDir, 'versions', versionId, `${versionId}.jar`);
    
    // Для Fabric версий нужно добавить ванильный JAR
    if (versionId.includes('fabric-loader')) {
        // Извлекаем версию Minecraft из имени версии Fabric
        const mcVersion = versionId.split('-').pop();
        const vanillaJar = path.join(this.minecraftDir, 'versions', mcVersion, `${mcVersion}.jar`);
        
        if (fs.existsSync(vanillaJar)) {
            console.log(`  ✓ Ванильный JAR найден: ${mcVersion}.jar`);
            libraries.push(vanillaJar);
        } else {
            console.error(`  ✗ Ванильный JAR не найден: ${vanillaJar}`);
            missingLibraries.push({
                name: `minecraft-${mcVersion}`,
                path: vanillaJar,
                type: 'vanilla'
            });
        }
    } else if (fs.existsSync(versionJar)) {
        libraries.push(versionJar);
    }

    console.log(`  Добавлено библиотек: ${libraries.length}`);

    // Подробная диагностика отсутствующих библиотек
    if (missingLibraries.length > 0) {
        console.warn(`\n  ⚠ ПРЕДУПРЕЖДЕНИЕ: Отсутствуют библиотеки (${missingLibraries.length}):`);
        
        const nativeMissing = missingLibraries.filter(lib => lib.type === 'native');
        const mainMissing = missingLibraries.filter(lib => lib.type === 'main');
        
        if (nativeMissing.length > 0) {
            console.warn(`    Нативные библиотеки (${nativeMissing.length}):`);
            nativeMissing.slice(0, 5).forEach(lib => {
                console.warn(`      - ${lib.name}`);
            });
        }
        
        if (mainMissing.length > 0) {
            console.warn(`    Основные библиотеки (${mainMissing.length}):`);
            mainMissing.slice(0, 5).forEach(lib => {
                console.warn(`      - ${lib.name}`);
            });
        }
        
        if (missingLibraries.length > 10) {
            console.warn(`    ... и еще ${missingLibraries.length - 10}`);
        }
        
        console.warn(`\n  Попробуйте переустановить версию!`);
        console.warn(`  Или запустите: npm run diagnose для диагностики\n`);
    }

    return libraries.join(separator);
}

    // Получение пути к Maven библиотеке
    getMavenLibraryPath(mavenName, baseUrl = null) {
        const parts = mavenName.split(':');
        if (parts.length < 3) return null;

        const [group, artifact, version] = parts;
        const groupPath = group.replace(/\./g, path.sep);
        const fileName = `${artifact}-${version}.jar`;
        const relativePath = path.join(groupPath, artifact, version, fileName);
        
        return path.join(this.minecraftDir, 'libraries', relativePath);
    }

        // Построение JVM аргументов - ИСПРАВЛЕННАЯ ВЕРСИЯ (с передачей classpath в распаковку)
    buildJvmArguments(versionJson, versionId, classpath) {
        const args = [];

        // Память - используем реальное значение из настроек
        const ram = this.currentRam || 4; // Используем сохраненное значение RAM или значение по умолчанию
        args.push(`-Xmx${ram}G`, `-Xms${Math.max(1, Math.floor(ram / 2))}G`);

        // === УЛУЧШЕННАЯ обработка нативных библиотек для Fabric ===
        const isFabric = versionId.includes('fabric-loader') || versionId.includes('quilt-loader');

        let nativesDir = null;

        if (isFabric) {
            // Для Fabric создаем папку natives и распаковываем ВСЕ нативные библиотеки
            nativesDir = path.join(this.minecraftDir, 'versions', versionId, 'natives');
            this.ensureDir(nativesDir);
            
            // ИЗМЕНЕНИЕ: Передаем classpath для "умного" поиска нативов
            this.extractNativesForFabric(versionJson, versionId, nativesDir);
            
            args.push(
                `-Djava.library.path=${nativesDir}`,
                `-Dorg.lwjgl.librarypath=${nativesDir}`,
                `-Dnet.fabricmc.loader.natives=${nativesDir}`,
                `-Djna.tmpdir=${nativesDir}`,
                `-Dorg.lwjgl.system.SharedLibraryExtractPath=${nativesDir}`,
                `-Dio.netty.native.workdir=${nativesDir}`
            );
        } else {
            // Обычная ванильная версия
            nativesDir = this.extractNatives(versionJson, versionId);
            args.push(`-Djava.library.path=${nativesDir}`);
        }

        // Обязательные параметры
        args.push('-Dlog4j2.formatMsgNoLookups=true');
        args.push('-Dlog4j.configurationFile=' + this.createLog4jConfig(versionId));

        if (process.platform === 'win32') {
            args.push('-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump');
        }

        // Fabric-specific аргументы
        if (isFabric) {
            args.push('-DFabricMcEmu= net.minecraft.client.main.Main');
        }

        // JVM аргументы из version.json
        if (versionJson.arguments?.jvm) {
            for (const arg of versionJson.arguments.jvm) {
                if (typeof arg === 'string') {
                    const replaced = this.replaceArgument(arg, versionId, classpath, nativesDir || '');
                    // Избегаем дублирования java.library.path
                    if (!replaced.includes('java.library.path')) {
                        args.push(replaced);
                    }
                } else if (arg.rules && this.checkRules(arg.rules)) {
                    const values = Array.isArray(arg.value) ? arg.value : [arg.value];
                    for (const v of values) {
                        const replaced = this.replaceArgument(v, versionId, classpath, nativesDir || '');
                        if (!replaced.includes('java.library.path')) {
                            args.push(replaced);
                        }
                    }
                }
            }
        }

        // Launcher properties
        args.push(
            '-Dminecraft.launcher.brand=CustomLauncher',
            '-Dminecraft.launcher.version=1.0'
        );

        // Classpath
        if (!args.some(a => a === '-cp' || a.startsWith('-cp'))) {
            args.push('-cp', classpath);
        }

        return args;
    }

// Специальная распаковка natives для Fabric - ЖЕЛЕЗОБЕТОННЫЙ МЕТОД
    extractNativesForFabric(versionJson, versionId, nativesDir) {
        console.log(`  Распаковка нативных библиотек для Fabric (прямое сканирование папок)...`);
        
        // 1. Очищаем папку natives
        if (fs.existsSync(nativesDir)) {
            try {
                fs.rmSync(nativesDir, { recursive: true, force: true });
            } catch (e) { /* игнорируем если занято */ }
        }
        this.ensureDir(nativesDir);

        let extractedCount = 0;
        const osName = this.getOsName(); // 'windows', 'osx' или 'linux'
        
        // Ключевые слова для поиска файла нативов
        // Для Windows ищем файлы, содержащие "natives-windows"
        const searchPattern = `natives-${osName}`; 

        // Собираем все библиотеки (из Fabric json и из родительского, если есть)
        let allLibraries = [...versionJson.libraries];
        if (versionJson.inheritsFrom) {
            try {
                const parentPath = path.join(this.minecraftDir, 'versions', versionJson.inheritsFrom, `${versionJson.inheritsFrom}.json`);
                if (fs.existsSync(parentPath)) {
                    const parentJson = JSON.parse(fs.readFileSync(parentPath, 'utf8'));
                    allLibraries = [...allLibraries, ...parentJson.libraries];
                }
            } catch (e) { console.warn("Не удалось прочитать родителя для нативов"); }
        }

        const processedPaths = new Set(); // Чтобы не распаковывать одно и то же дважды

        for (const lib of allLibraries) {
            // Пропускаем библиотеки, запрещенные правилами (rules)
            if (!this.checkLibraryRules(lib.rules)) continue;

            // Вычисляем путь к папке библиотеки на основе Maven координат (group:artifact:version)
            const libDirPath = this.getLibraryDirectoryPath(lib);
            
            if (!libDirPath || !fs.existsSync(libDirPath)) continue;
            if (processedPaths.has(libDirPath)) continue;
            
            processedPaths.add(libDirPath);

            // Сканируем папку библиотеки
            try {
                const files = fs.readdirSync(libDirPath);
                for (const file of files) {
                    // Ищем JAR, в названии которого есть 'natives-windows' (или linux/macos)
                    // И исключаем arm64, если у нас обычный x64 процессор (для Windows)
                    if (file.includes(searchPattern) && file.endsWith('.jar')) {
                        
                        // Доп. проверка архитектуры для Windows (чтобы не взять arm64 на обычном ПК)
                        if (osName === 'windows' && process.arch === 'x64' && file.includes('arm64')) {
                            continue; 
                        }

                        const fullPath = path.join(libDirPath, file);
                        console.log(`    Найдена нативная библиотека: ${file}`);
                        this.extractZip(fullPath, nativesDir, null);
                        extractedCount++;
                    }
                }
            } catch (err) {
                // Игнорируем ошибки доступа к папке
            }
        }

        console.log(`  Распаковано архивов с нативами: ${extractedCount}`);
        
        if (extractedCount === 0) {
            console.error(`  ⚠ ОШИБКА: Нативы не найдены! Проверьте папку libraries/org/lwjgl`);
        }
    }

    // Вспомогательная функция для получения пути к папке библиотеки
    getLibraryDirectoryPath(lib) {
        if (!lib.name) return null;
        
        const parts = lib.name.split(':');
        if (parts.length < 3) return null;
        
        const [group, artifact, version] = parts;
        const groupPath = group.replace(/\./g, path.sep);
        
        // Путь: .minecraft/libraries/org/lwjgl/lwjgl/3.3.3/
        return path.join(this.minecraftDir, 'libraries', groupPath, artifact, version);
    }

    // Построение игровых аргументов
    buildGameArguments(versionJson, username, versionId) {
        const args = [];
        const quickPlayArgs = new Set(['--quickPlayPath', '--quickPlaySingleplayer', '--quickPlayMultiplayer', '--quickPlayRealms']);
        let hasQuickPlay = false;

        if (versionJson.arguments && versionJson.arguments.game) {
            // Новый формат (1.13+)
            for (const arg of versionJson.arguments.game) {
                if (typeof arg === 'string') {
                    const replaced = this.replaceGameArgument(arg, username, versionId);
                    // Пропускаем все quick play аргументы и пустые строки
                    if (replaced && !quickPlayArgs.has(replaced)) {
                        args.push(replaced);
                    }
                } else if (arg.rules) {
                    // Проверяем, не является ли это quick play feature
                    const isQuickPlayFeature = arg.rules.some(rule => 
                        rule.features && (
                            rule.features.has_quick_plays_support || 
                            rule.features.is_quick_play_singleplayer ||
                            rule.features.is_quick_play_multiplayer ||
                            rule.features.is_quick_play_realms
                        )
                    );

                    // Пропускаем все quick play features
                    if (!isQuickPlayFeature && this.checkRules(arg.rules)) {
                        if (typeof arg.value === 'string') {
                            const replaced = this.replaceGameArgument(arg.value, username, versionId);
                            if (replaced && !quickPlayArgs.has(replaced)) {
                                args.push(replaced);
                            }
                        } else if (Array.isArray(arg.value)) {
                            arg.value.forEach(v => {
                                const replaced = this.replaceGameArgument(v, username, versionId);
                                if (replaced && !quickPlayArgs.has(replaced)) {
                                    args.push(replaced);
                                }
                            });
                        }
                    }
                }
            }
        } else if (versionJson.minecraftArguments) {
            // Старый формат (pre-1.13)
            const oldArgs = versionJson.minecraftArguments.split(' ');
            oldArgs.forEach(arg => {
                const replaced = this.replaceGameArgument(arg, username, versionId);
                if (replaced && !quickPlayArgs.has(replaced)) {
                    args.push(replaced);
                }
            });
        }

        return args;
    }

    replaceArgument(arg, versionId, classpath, nativesDir = '') {
        return arg
            .replace('${natives_directory}', nativesDir)
            .replace('${launcher_name}', 'CustomLauncher')
            .replace('${launcher_version}', '1.0')
            .replace('${classpath}', classpath)
            .replace('${version_name}', versionId)
            .replace('${library_directory}', path.join(this.minecraftDir, 'libraries'))
            .replace('${classpath_separator}', process.platform === 'win32' ? ';' : ':');
    }

    // Замена переменных в игровых аргументах
    replaceGameArgument(arg, username, versionId) {
        const assetsDir = path.join(this.minecraftDir, 'assets');
        const assetsIndexId = this.getAssetsIndex(versionId);

        // Список quick play аргументов, которые нужно удалить
        const quickPlayVars = ['${quickPlayPath}', '${quickPlaySingleplayer}', '${quickPlayMultiplayer}', '${quickPlayRealms}'];
        
        // Если аргумент содержит quick play переменную, возвращаем пустую строку
        if (quickPlayVars.some(qp => arg.includes(qp))) {
            return '';
        }

        return arg
            .replace('${auth_player_name}', username)
            .replace('${version_name}', versionId)
            .replace('${game_directory}', this.minecraftDir)
            .replace('${assets_root}', assetsDir)
            .replace('${assets_index_name}', assetsIndexId)
            .replace('${auth_uuid}', this.generateUuid())
            .replace('${auth_access_token}', 'null')
            .replace('${user_type}', 'legacy')
            .replace('${version_type}', 'release')
            .replace('${user_properties}', '{}')
            .replace('${clientid}', 'null')
            .replace('${auth_xuid}', 'null');
    }

    // Извлечение нативных библиотек
    extractNatives(versionJson, versionId) {
        const nativesDir = path.join(this.minecraftDir, 'versions', versionId, 'natives');
        this.ensureDir(nativesDir);

        for (const lib of versionJson.libraries) {
            if (!this.checkLibraryRules(lib.rules)) continue;

            if (lib.downloads && lib.downloads.classifiers) {
                const nativeKey = this.getNativeClassifier(lib.natives);
                if (nativeKey && lib.downloads.classifiers[nativeKey]) {
                    const native = lib.downloads.classifiers[nativeKey];
                    const nativePath = path.join(this.minecraftDir, 'libraries', native.path);

                    if (fs.existsSync(nativePath)) {
                        this.extractZip(nativePath, nativesDir, lib.extract);
                    }
                }
            }
        }

        return nativesDir;
    }

    // Извлечение ZIP архива - УЛУЧШЕННАЯ ВЕРСИЯ
extractZip(zipPath, targetDir, extractRules) {
    const AdmZip = require('adm-zip');
    
    try {
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();
        let extractedCount = 0;

        zipEntries.forEach(entry => {
            // Пропускаем директории
            if (entry.isDirectory) return;

            // Проверяем правила исключения
            let shouldExtract = true;
            if (extractRules && extractRules.exclude) {
                for (const exclude of extractRules.exclude) {
                    if (entry.entryName.includes(exclude)) {
                        shouldExtract = false;
                        break;
                    }
                }
            }

            if (shouldExtract) {
                const targetPath = path.join(targetDir, entry.entryName);
                this.ensureDir(path.dirname(targetPath));
                
                // Извлекаем только определенные типы файлов (библиотеки)
                const ext = path.extname(entry.entryName).toLowerCase();
                if (['.dll', '.so', '.dylib', '.jnilib'].includes(ext) || 
                    entry.entryName.includes('lwjgl') ||
                    entry.entryName.includes('native')) {
                    
                    fs.writeFileSync(targetPath, entry.getData());
                    extractedCount++;
                }
            }
        });

        if (extractedCount > 0) {
            console.log(`      Извлечено ${extractedCount} файлов из ${path.basename(zipPath)}`);
        }
    } catch (error) {
        console.error(`    Ошибка извлечения ${path.basename(zipPath)}:`, error.message);
    }
}

    // Получение ID индекса ассетов
    getAssetsIndex(versionId) {
        const versionJsonPath = path.join(this.minecraftDir, 'versions', versionId, `${versionId}.json`);
        
        if (fs.existsSync(versionJsonPath)) {
            const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            
            if (versionJson.assetIndex) {
                return versionJson.assetIndex.id;
            }
            
            if (versionJson.assets) {
                return versionJson.assets;
            }
            
            // Для версий с наследованием
            if (versionJson.inheritsFrom) {
                return this.getAssetsIndex(versionJson.inheritsFrom);
            }
        }

        return 'legacy';
    }

    // Проверка правил библиотек
    checkLibraryRules(rules) {
        if (!rules) return true;
        return this.checkRules(rules);
    }

    // Проверка правил
    checkRules(rules) {
        if (!rules) return true;

        const osName = this.getOsName();
        let allowed = false;

        for (const rule of rules) {
            let applies = true;

            // Проверка ОС
            if (rule.os) {
                if (rule.os.name) {
                    applies = rule.os.name === osName;
                }
                if (rule.os.arch && applies) {
                    const arch = rule.os.arch === 'x86' ? '32' : '64';
                    applies = arch === (process.arch === 'x64' ? '64' : '32');
                }
            }

            // Проверка features - всегда возвращаем false для quick play features
            if (rule.features) {
                // Блокируем все quick play фичи
                if (rule.features.has_quick_plays_support ||
                    rule.features.is_quick_play_singleplayer ||
                    rule.features.is_quick_play_multiplayer ||
                    rule.features.is_quick_play_realms) {
                    return false;
                }
                // Для других features применяем стандартную логику
                applies = false;
            }

            if (applies) {
                allowed = rule.action === 'allow';
            }
        }

        return allowed;
    }

    // Получение классификатора нативных библиотек - ИСПРАВЛЕННАЯ ВЕРСИЯ
    getNativeClassifier(natives) {
        if (!natives) return null;

        const platform = this.getOsName();
        const arch = process.arch === 'x64' ? '64' : '32';

        // Прямое сопоставление платформ
        const platformMapping = {
            'windows': 'natives-windows',
            'osx': 'natives-macos', 
            'linux': 'natives-linux'
        };

        let classifier = natives[platform];
        
        // Если нет прямого совпадения, пробуем найти по маппингу
        if (!classifier) {
            classifier = platformMapping[platform];
        }

        if (classifier) {
            // Заменяем переменные в классификаторе
            classifier = classifier
                .replace('${arch}', arch)
                .replace('${platform}', platform)
                .replace('${classifier}', platform);

            // Специфичные замены для разных платформ
            if (platform === 'windows') {
                // В 1.21 обычно просто natives-windows без указания архитектуры в суффиксе,
                // но если переменная есть, меняем её
                classifier = classifier.replace('${arch}', 'x86_64');
            } else if (platform === 'osx') {
                if (arch === '64') {
                    const isArm = process.arch === 'arm64' || os.arch().includes('arm');
                    classifier = isArm ? 'natives-macos-arm64' : 'natives-macos';
                }
            }
        }

        return classifier;
    }

    // Определение ОС
    getOsName() {
        const platform = process.platform;
        if (platform === 'win32') return 'windows';
        if (platform === 'darwin') return 'osx';
        return 'linux';
    }

    // Получаем информацию об установленных версиях Java
    getJavaInfo() {
        return this.javaManager.getJavaInfo();
    }

    // Генерация UUID
    generateUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Проверка версии Java
    checkJavaVersion(versionJson) {
        if (versionJson.javaVersion) {
            const requiredMajor = versionJson.javaVersion.majorVersion;
            console.log(`\n⚠ Требуемая версия Java: ${requiredMajor}`);
            console.log('Убедитесь, что у вас установлена правильная версия Java!');
            
            // Для версий 1.18+ требуется Java 17+
            if (requiredMajor >= 17) {
                console.log('Для Minecraft 1.18+ требуется Java 17 или новее');
            }
            // Для версий 1.21+ требуется Java 21+
            if (requiredMajor >= 21) {
                console.log('Для Minecraft 1.21+ требуется Java 21 или новее');
            }
        }
    }

    // Создание директории
    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // Извлекает версию Minecraft из versionId
    extractMinecraftVersion(versionId) {
        // Для Fabric версий: fabric-loader-0.17.3-1.21.8 → 1.21.8
        if (versionId.includes('fabric-loader')) {
            const parts = versionId.split('-');
            return parts[parts.length - 1]; // Последняя часть - версия Minecraft
        }
        
        // Для ванильных версий: 1.21.8 → 1.21.8
        return versionId;
    }

    // Создание конфигурации Log4j
    createLog4jConfig(versionId) {
        const logsDir = path.join(this.minecraftDir, 'logs');
        this.ensureDir(logsDir);

        const configPath = path.join(this.minecraftDir, 'log4j2.xml');
        
        if (!fs.existsSync(configPath)) {
            const log4jConfig = `<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="WARN" packages="com.mojang.util">
    <Appenders>
        <Console name="SysOut" target="SYSTEM_OUT">
            <PatternLayout pattern="[%d{HH:mm:ss}] [%t/%level]: %msg%n"/>
        </Console>
        <Queue name="ServerGuiConsole">
            <PatternLayout pattern="[%d{HH:mm:ss} %level]: %msg%n"/>
        </Queue>
        <RollingRandomAccessFile name="File" fileName="logs/latest.log" filePattern="logs/%d{yyyy-MM-dd}-%i.log.gz">
            <PatternLayout pattern="[%d{HH:mm:ss}] [%t/%level]: %msg%n"/>
            <Policies>
                <TimeBasedTriggeringPolicy/>
                <OnStartupTriggeringPolicy/>
            </Policies>
        </RollingRandomAccessFile>
    </Appenders>
    <Loggers>
        <Root level="info">
            <AppenderRef ref="SysOut"/>
            <AppenderRef ref="File"/>
            <AppenderRef ref="ServerGuiConsole"/>
        </Root>
    </Loggers>
</Configuration>`;
            fs.writeFileSync(configPath, log4jConfig);
        }

        return configPath;
    }
}

module.exports = GameLauncher;