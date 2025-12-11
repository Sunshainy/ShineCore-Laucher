/**
 * Мониторинг процессов Minecraft
 * Отслеживает запущенные процессы и управляет видимостью лаунчера
 */
class ProcessMonitor {
    constructor(windowManager) {
        this.windowManager = windowManager;
        this.minecraftProcesses = new Set();
        this.monitorInterval = null;
        this.checkIntervalMs = 5000; // 5 секунд
    }

    /**
     * Добавить процесс Minecraft в мониторинг
     */
    addProcess(pid) {
        this.minecraftProcesses.add(pid);
        console.log('Added Minecraft process to monitoring:', pid);

        // Автоматически скрываем лаунчер при запуске Minecraft
        if (this.windowManager.hasMainWindow()) {
            const mainWindow = this.windowManager.getMainWindow();
            if (mainWindow.isVisible()) {
                this.windowManager.hideMainWindow();
                console.log('Auto-hiding launcher because Minecraft started');
            }
        }

        // Запускаем мониторинг если еще не запущен
        if (!this.monitorInterval) {
            this.startMonitoring();
        }
    }

    /**
     * Удалить процесс из мониторинга
     */
    removeProcess(pid) {
        this.minecraftProcesses.delete(pid);
        console.log('Removed Minecraft process from monitoring:', pid);

        // Если все процессы Minecraft закрыты, показываем лаунчер
        if (this.minecraftProcesses.size === 0) {
            if (this.windowManager.hasMainWindow()) {
                const mainWindow = this.windowManager.getMainWindow();
                if (!mainWindow.isVisible()) {
                    this.windowManager.showMainWindow();
                    console.log('Auto-showing launcher because all Minecraft processes closed');
                }
            }
        }
    }

    /**
     * Запуск мониторинга
     */
    startMonitoring() {
        this.monitorInterval = setInterval(() => {
            this.checkProcesses();
        }, this.checkIntervalMs);
        console.log('Started Minecraft process monitoring');
    }

    /**
     * Остановка мониторинга
     */
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
            console.log('Stopped Minecraft process monitoring');
        }
    }

    /**
     * Проверка всех процессов
     */
    checkProcesses() {
        const processesToRemove = [];

        for (const pid of this.minecraftProcesses) {
            if (!this.isProcessRunning(pid)) {
                processesToRemove.push(pid);
            }
        }

        // Удаляем несуществующие процессы
        processesToRemove.forEach(pid => this.removeProcess(pid));

        // Если нет активных процессов, останавливаем мониторинг
        if (this.minecraftProcesses.size === 0) {
            this.stopMonitoring();
        }
    }

    /**
     * Проверка существования процесса
     */
    isProcessRunning(pid) {
        try {
            // Отправляем сигнал 0 для проверки существования процесса
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Получение количества активных процессов
     */
    getProcessCount() {
        return this.minecraftProcesses.size;
    }

    /**
     * Получение списка PID процессов
     */
    getProcesses() {
        return Array.from(this.minecraftProcesses);
    }

    /**
     * Очистка всех процессов
     */
    clear() {
        this.minecraftProcesses.clear();
        this.stopMonitoring();
    }
}

module.exports = ProcessMonitor;
