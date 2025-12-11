const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Утилиты для работы с файловой системой
 */
class FileUtil {
    /**
     * Создание директории если не существует
     */
    static ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Вычисление SHA1 хеша файла
     */
    static calculateSha1(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha1');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    /**
     * Перемещение содержимого папки
     */
    static moveContents(source, destination) {
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
     * Рекурсивное удаление директории
     */
    static removeDir(dirPath) {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
    }

    /**
     * Копирование файла
     */
    static copyFile(source, destination) {
        this.ensureDir(path.dirname(destination));
        fs.copyFileSync(source, destination);
    }

    /**
     * Проверка существования пути
     */
    static exists(filePath) {
        return fs.existsSync(filePath);
    }

    /**
     * Чтение JSON файла
     */
    static readJson(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    /**
     * Запись JSON файла
     */
    static writeJson(filePath, data) {
        this.ensureDir(path.dirname(filePath));
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
}

module.exports = FileUtil;
