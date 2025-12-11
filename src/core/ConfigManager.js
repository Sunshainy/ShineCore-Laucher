const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Менеджер конфигурации лаунчера
 * Управляет настройками пользователя
 */
class ConfigManager {
    constructor() {
        this.configPath = path.join(app.getPath('userData'), 'config.json');
        this.defaultConfig = {
            nick: 'Player',
            ram: 4,
            debugLogging: false,
            background: {
                type: 'default',
                path: 'background.webm'
            }
        };
    }

    /**
     * Загрузка конфигурации
     */
    getConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                // Объединяем с дефолтной конфигурацией для добавления новых полей
                return { ...this.defaultConfig, ...config };
            }
        } catch (e) {
            console.error('Config read error:', e);
        }
        return { ...this.defaultConfig };
    }

    /**
     * Сохранение конфигурации
     */
    saveConfig(config) {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            return config;
        } catch (e) {
            console.error('Config save error:', e);
            throw e;
        }
    }

    /**
     * Обновление части конфигурации
     */
    updateConfig(updates) {
        const config = this.getConfig();
        const newConfig = { ...config, ...updates };
        return this.saveConfig(newConfig);
    }

    /**
     * Получение конкретного параметра
     */
    get(key) {
        const config = this.getConfig();
        return config[key];
    }

    /**
     * Установка конкретного параметра
     */
    set(key, value) {
        const config = this.getConfig();
        config[key] = value;
        return this.saveConfig(config);
    }

    /**
     * Сброс к настройкам по умолчанию
     */
    reset() {
        return this.saveConfig({ ...this.defaultConfig });
    }
}

module.exports = ConfigManager;
