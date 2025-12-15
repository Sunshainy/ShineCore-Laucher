const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

/**
 * Утилиты для загрузки файлов
 * Поддерживает параллельную загрузку, retry, проверку SHA1
 */
class DownloadUtil {
    constructor(logger) {
        this.logger = logger || {
            info: () => {},
            warn: console.warn,
            error: console.error
        };
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.jsonCache = new Map();
    }

    _getRequestModule(url) {
        return url.startsWith('https://') ? https : http;
    }

    /**
     * Загрузка файла с повторными попытками
     */
    async downloadFileWithRetry(url, filePath, expectedSha1 = null) {
        if (fs.existsSync(filePath) && expectedSha1) {
            const hash = await this.calculateSha1(filePath);
            if (hash === expectedSha1) return true;
        }

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                await this.downloadFile(url, filePath);
                if (expectedSha1) {
                    const hash = await this.calculateSha1(filePath);
                    if (hash === expectedSha1) return true;
                    this.logger.warn(`SHA1 mismatch: ${path.basename(filePath)}`);
                }
                return true;
            } catch (error) {
                this.logger.warn(`Download failed (${attempt}/${this.maxRetries}): ${url}`);
                if (attempt === this.maxRetries) throw error;
                await this.sleep(this.retryDelay * attempt);
            }
        }
    }

    /**
     * Загрузка одного файла
     */
    downloadFile(url, filePath) {
        return new Promise((resolve, reject) => {
            this.ensureDir(path.dirname(filePath));
            const client = this._getRequestModule(url);
            
            // Опции для HTTPS запросов
            const options = { 
                timeout: 30000
            };
            
            // Если это HTTPS, добавляем опции для сертификатов
            if (url.startsWith('https://')) {
                options.rejectUnauthorized = true;
            }

            client.get(url, options, (response) => {
                if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
                    return this.downloadFile(response.headers.location, filePath)
                        .then(resolve).catch(reject);
                }

                if (response.statusCode !== 200) {
                    return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                }

                const fileStream = fs.createWriteStream(filePath);
                response.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve();
                });

                fileStream.on('error', (err) => {
                    fs.unlink(filePath, () => {});
                    reject(err);
                });
            }).on('error', reject);
        });
    }

    /**
     * Параллельная загрузка файлов
     */
    async downloadParallel(files, concurrency = 8, onProgress = null) {
        let completed = 0;
        const total = files.length;
        const failed = [];

        const queue = [...files];
        const workers = [];

        const worker = async () => {
            while (queue.length > 0) {
                const file = queue.shift();
                if (!file) break;

                try {
                    await this.downloadFileWithRetry(file.url, file.path, file.sha1);
                    completed++;
                    if (onProgress) {
                        onProgress(completed, total, file);
                    }
                } catch (error) {
                    this.logger.error(`Failed to download: ${file.name || path.basename(file.path)}`, error);
                    failed.push({ file, error: error.message });
                }
            }
        };

        for (let i = 0; i < concurrency; i++) {
            workers.push(worker());
        }

        await Promise.all(workers);

        return { completed, total, failed };
    }

    /**
     * Загрузка JSON с автоматическим парсингом
     */
    async fetchJson(url, cacheTtlMs = 300000) {
        // Легкий in-memory cache для снижения сетевых запросов
        if (cacheTtlMs > 0) {
            const cached = this.jsonCache.get(url);
            if (cached && cached.expires > Date.now()) {
                return cached.data;
            }
        }

        const data = await new Promise((resolve, reject) => {
            const client = this._getRequestModule(url);
            
            // Опции для HTTPS запросов
            const options = { 
                timeout: 30000
            };
            
            // Если это HTTPS, добавляем опции для сертификатов
            if (url.startsWith('https://')) {
                options.rejectUnauthorized = true;
            }
            
            client.get(url, options, (response) => {
                if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
                    return this.fetchJson(response.headers.location, cacheTtlMs).then(resolve).catch(reject);
                }

                if (response.statusCode !== 200) {
                    return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                }

                let raw = '';
                response.on('data', (chunk) => raw += chunk);
                response.on('end', () => {
                    try {
                        resolve(JSON.parse(raw));
                    } catch (error) {
                        reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
                    }
                });
            }).on('error', reject);
        });

        if (cacheTtlMs > 0) {
            this.jsonCache.set(url, { data, expires: Date.now() + cacheTtlMs });
        }

        return data;
    }

    /**
     * Вычисление SHA1 хеша файла
     */
    calculateSha1(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha1');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }

    /**
     * Вспомогательная функция для задержки
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Создание директории если не существует
     */
    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

module.exports = DownloadUtil;
