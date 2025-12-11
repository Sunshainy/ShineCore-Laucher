// console.js - Логика консоли отладки
class DebugConsole {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.filters = {
            info: true,
            warning: true,
            error: true,
            debug: true,
            success: true
        };
        
        this.initialize();
        this.setupEventListeners();
        this.startTime = new Date();
        this.updateStartTime();
    }

    initialize() {
        console.log('Debug console initialized');
        console.log('Electron API available:', !!window.electronAPI);
        console.log('onConsoleLog available:', window.electronAPI ? !!window.electronAPI.onConsoleLog : false);
        
        // Добавляем начальное сообщение
        this.addLog('info', 'Консоль отладки инициализирована. Готова к приему логов.');
        this.addLog('info', 'Время запуска: ' + new Date().toLocaleString('ru-RU'));
        this.addLog('info', 'Electron API: ' + (window.electronAPI ? 'доступен' : 'недоступен'));
    }

    setupEventListeners() {
        // Кнопки управления
        document.getElementById('clearBtn').addEventListener('click', () => this.clearLogs());
        document.getElementById('copyBtn').addEventListener('click', () => this.copyLogs());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportLogs());

        // Фильтры
        document.getElementById('filterInfo').addEventListener('change', (e) => this.updateFilter('info', e.target.checked));
        document.getElementById('filterWarning').addEventListener('change', (e) => this.updateFilter('warning', e.target.checked));
        document.getElementById('filterError').addEventListener('change', (e) => this.updateFilter('error', e.target.checked));
        document.getElementById('filterDebug').addEventListener('change', (e) => this.updateFilter('debug', e.target.checked));
        document.getElementById('filterSuccess').addEventListener('change', (e) => this.updateFilter('success', e.target.checked));

        // Обработка сообщений от основного процесса
        if (window.electronAPI && window.electronAPI.onConsoleLog) {
            window.electronAPI.onConsoleLog((logData) => {
                this.addLog(logData.level, logData.message, logData.timestamp, logData.source);
            });
        } else {
            console.error('Electron API not available for console logging');
        }

        // Перехват console.log и других методов
        this.interceptConsole();
    }

    updateStartTime() {
        const startTimeElement = document.getElementById('startTime');
        if (startTimeElement) {
            startTimeElement.textContent = this.startTime.toLocaleTimeString('ru-RU');
        }
    }

    addLog(level, message, timestamp = new Date(), source = 'main') {
        const logEntry = {
            id: Date.now() + Math.random(),
            level: level,
            message: this.ensureUtf8(message),
            timestamp: timestamp,
            source,
            visible: this.filters[level]
        };

        this.logs.push(logEntry);

        // Ограничиваем количество логов
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.renderLog(logEntry);
        this.updateLogCount();
    }

    ensureUtf8(text) {
        // Функция для обеспечения правильной кодировки русских символов
        if (typeof text !== 'string') {
            text = String(text);
        }
        
        // Заменяем проблемные символы
        return text
            .replace(/[^\x00-\x7F]/g, (char) => {
                // Если символ не ASCII, оставляем как есть (должен правильно отображаться в UTF-8)
                return char;
            })
            .replace(/\\u([\dA-F]{4})/gi, (match, grp) => {
                return String.fromCharCode(parseInt(grp, 16));
            });
    }

    renderLog(logEntry) {
        if (!logEntry.visible) return;

        const logContainer = document.getElementById('logContainer');
        const logElement = document.createElement('div');
        
        logElement.className = `log-entry new`;
        logElement.innerHTML = `
            <span class="log-timestamp">${new Date(logEntry.timestamp).toLocaleTimeString('ru-RU')}</span>
            <span class="log-level ${logEntry.level}">${logEntry.level.toUpperCase()}</span>
            <span class="log-level source">${this.escapeHtml(logEntry.source || '')}</span>
            <span class="log-message">${this.escapeHtml(logEntry.message)}</span>
        `;

        logContainer.appendChild(logElement);

        // Автопрокрутка к новым логам
        logContainer.scrollTop = logContainer.scrollHeight;

        // Убираем класс анимации через некоторое время
        setTimeout(() => {
            logElement.classList.remove('new');
        }, 1000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateFilter(level, enabled) {
        this.filters[level] = enabled;
        
        // Перерисовываем все логи с новыми фильтрами
        this.rerenderLogs();
    }

    rerenderLogs() {
        const logContainer = document.getElementById('logContainer');
        logContainer.innerHTML = '';

        // Добавляем начальное сообщение
        const startElement = document.createElement('div');
        startElement.className = 'log-entry';
        startElement.innerHTML = `
            <span class="log-timestamp">${this.startTime.toLocaleTimeString('ru-RU')}</span>
            <span class="log-level info">INFO</span>
            <span class="log-message">Консоль отладки запущена. Логи будут отображаться здесь.</span>
        `;
        logContainer.appendChild(startElement);

        // Рендерим отфильтрованные логи
        this.logs.forEach(log => {
            log.visible = this.filters[log.level];
            if (log.visible) {
                this.renderLog(log);
            }
        });

        this.updateLogCount();
    }

    clearLogs() {
        this.logs = [];
        const logContainer = document.getElementById('logContainer');
        logContainer.innerHTML = '';
        
        // Добавляем сообщение об очистке
        this.addLog('info', 'Логи очищены');
    }

    copyLogs() {
        const logText = this.logs.map(log => 
            `[${new Date(log.timestamp).toLocaleString('ru-RU')}] ${log.source || 'main'} ${log.level.toUpperCase()}: ${log.message}`
        ).join('\n');

        navigator.clipboard.writeText(logText).then(() => {
            this.addLog('success', 'Логи скопированы в буфер обмена');
        }).catch(err => {
            this.addLog('error', 'Ошибка копирования логов: ' + err.message);
        });
    }

    exportLogs() {
        const logText = this.logs.map(log => 
            `[${new Date(log.timestamp).toLocaleString('ru-RU')}] ${log.source || 'main'} ${log.level.toUpperCase()}: ${log.message}`
        ).join('\n');

        const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = `shinecore-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.addLog('success', 'Логи экспортированы в файл');
    }

    updateLogCount() {
        const visibleCount = this.logs.filter(log => log.visible).length + 1; // +1 для начального сообщения
        document.getElementById('logCount').textContent = `Записей: ${visibleCount}`;
    }

    interceptConsole() {
        // Сохраняем оригинальные методы console
        const originalConsole = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
            debug: console.debug
        };

        // Перехватываем console.log
        console.log = (...args) => {
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            
            this.addLog('info', message);
            originalConsole.log.apply(console, args);
        };

        // Перехватываем console.info
        console.info = (...args) => {
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            
            this.addLog('info', message);
            originalConsole.info.apply(console, args);
        };

        // Перехватываем console.warn
        console.warn = (...args) => {
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            
            this.addLog('warning', message);
            originalConsole.warn.apply(console, args);
        };

        // Перехватываем console.error
        console.error = (...args) => {
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            
            this.addLog('error', message);
            originalConsole.error.apply(console, args);
        };

        // Перехватываем console.debug
        console.debug = (...args) => {
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            
            this.addLog('debug', message);
            originalConsole.debug.apply(console, args);
        };
    }

    // Метод для добавления логов извне
    log(level, message) {
        this.addLog(level, message);
    }
}

// Инициализация консоли при загрузке
let debugConsole;

document.addEventListener('DOMContentLoaded', () => {
    debugConsole = new DebugConsole();
    
    // Добавляем информацию о запуске консоли
    debugConsole.addLog('info', 'Консоль отладки готова к работе');
    debugConsole.addLog('info', 'Все логи лаунчера и Minecraft будут отображаться здесь');
});

// Глобальный доступ к консоли
window.debugConsole = debugConsole;