// update-notification.js - Красивая система уведомлений об обновлениях

class UpdateNotification {
  constructor() {
    this.modal = null;
    this.progressBar = null;
    this.progressPercent = null;
    this.modalTitle = null;
    this.modalText = null;
    this.modalButtons = null;
    this.newVersion = null;
    
    this.init();
  }

  init() {
    // Проверяем наличие модального окна
    this.modal = document.getElementById('updateModal');
    this.progressBar = document.getElementById('updateProgressBar');
    this.progressPercent = document.getElementById('updateProgressPercent');
    this.modalTitle = document.getElementById('updateTitle');
    this.modalText = document.getElementById('updateText');
    this.modalButtons = document.getElementById('updateButtons');
    this.notificationIcon = document.getElementById('updateNotificationIcon');

    if (!this.modal) {
      console.error('Update modal not found in DOM');
      return;
    }

    // Клик по иконке уведомления открывает модальное окно
    if (this.notificationIcon) {
      this.notificationIcon.onclick = () => {
        this.hideNotificationIcon();
        this.showModal();
      };
    }

    // Подписываемся на события обновления от main процесса
    this.setupUpdateListeners();
    
    // Автоматическая проверка обновлений через 3 секунды после загрузки
    setTimeout(() => {
      this.checkForUpdates();
    }, 3000);
  }

  setupUpdateListeners() {
    // Слушаем события от main процесса
    if (window.electronAPI && window.electronAPI.onUpdateAvailable) {
      window.electronAPI.onUpdateAvailable((info) => {
        console.log('Update available:', info);
        this.showUpdateAvailable(info);
      });
    }

    if (window.electronAPI && window.electronAPI.onUpdateDownloadProgress) {
      window.electronAPI.onUpdateDownloadProgress((progress) => {
        console.log('Download progress:', progress);
        this.showDownloadProgress(progress);
      });
    }

    if (window.electronAPI && window.electronAPI.onUpdateDownloaded) {
      window.electronAPI.onUpdateDownloaded(() => {
        console.log('Update downloaded');
        this.showUpdateReady();
      });
    }

    if (window.electronAPI && window.electronAPI.onUpdateError) {
      window.electronAPI.onUpdateError((error) => {
        console.error('Update error:', error);
        this.showUpdateError(error);
      });
    }
  }

  async checkForUpdates() {
    try {
      console.log('Checking for updates...');
      if (window.electronAPI && window.electronAPI.checkForUpdates) {
        await window.electronAPI.checkForUpdates();
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  }

  showUpdateAvailable(info) {
    this.newVersion = info.version;
    this.modalTitle.textContent = 'Доступно обновление';
    this.modalText.innerHTML = `
      <div class="version">Версия <strong>${info.version}</strong></div>
      <div class="description">Новые функции и улучшения производительности</div>
    `;

    document.getElementById('updateProgress').style.display = 'none';

    this.modalButtons.innerHTML = `
      <button class="update-btn update-btn-secondary" id="updateLaterBtn">Позже</button>
      <button class="update-btn update-btn-primary" id="updateNowBtn">Обновить сейчас</button>
    `;

    document.getElementById('updateNowBtn').onclick = () => this.startDownload();
    document.getElementById('updateLaterBtn').onclick = () => {
      this.hideModal();
      this.showNotificationIcon();
    };

    this.showModal();
  }

  async startDownload() {
    console.log('Starting update download...');
    
    this.modalTitle.textContent = 'Скачивание обновления';
    this.modalText.innerHTML = '<div class="download-info"></div>';
    this.modalButtons.innerHTML = '';

    // Показываем прогресс-бар
    document.getElementById('updateProgress').style.display = 'block';

    try {
      if (window.electronAPI && window.electronAPI.startUpdateDownload) {
        await window.electronAPI.startUpdateDownload();
      }
    } catch (error) {
      console.error('Failed to start download:', error);
      this.showUpdateError(error.message || 'Не удалось начать загрузку');
    }
  }

  showDownloadProgress(progress) {
    const percent = Math.round(progress.percent || progress);
    
    if (this.progressBar) {
      this.progressBar.style.width = `${percent}%`;
    }
    
    if (this.progressPercent) {
      this.progressPercent.textContent = `${percent}%`;
    }

    // Обновляем текст с деталями
    const transferred = this.formatBytes(progress.transferred);
    const total = this.formatBytes(progress.total);
    const speed = this.formatBytes(progress.bytesPerSecond);

    if (this.modalText && progress.transferred !== undefined) {
      this.modalText.innerHTML = `
        <div class="download-info">
          <span><strong>${transferred}</strong> / ${total}</span>
          <span>${speed}/с</span>
        </div>
      `;
    }
  }

  showUpdateReady() {
    this.modalTitle.textContent = 'Обновление готово';
    this.modalText.innerHTML = `
      <div class="version" style="color:#34d399;"><strong>${this.newVersion || 'новая'}</strong> загружено</div>
      <div class="description">Перезапустите приложение для применения</div>
    `;

    document.getElementById('updateProgress').style.display = 'none';

    this.modalButtons.innerHTML = `
      <button class="update-btn update-btn-secondary" id="restartLaterBtn">Позже</button>
      <button class="update-btn update-btn-primary" id="restartNowBtn">Перезапустить</button>
    `;

    document.getElementById('restartNowBtn').onclick = () => this.quitAndInstall();
    document.getElementById('restartLaterBtn').onclick = () => this.hideModal();
  }

  showUpdateError(error) {
    this.modalTitle.textContent = 'Ошибка обновления';
    this.modalText.innerHTML = `
      <div class="error">
        Не удалось загрузить файл.<br>
        <small>${error}</small>
      </div>
    `;

    document.getElementById('updateProgress').style.display = 'none';

    this.modalButtons.innerHTML = `
      <button class="update-btn update-btn-secondary" id="closeErrorBtn">Закрыть</button>
    `;

    document.getElementById('closeErrorBtn').onclick = () => this.hideModal();
  }

  quitAndInstall() {
    console.log('Quitting and installing update...');
    if (window.electronAPI && window.electronAPI.quitAndInstall) {
      window.electronAPI.quitAndInstall();
    }
  }

  showModal() {
    if (this.modal) {
      this.modal.classList.add('show');
      
      // Анимация появления
      setTimeout(() => {
        const content = this.modal.querySelector('.update-modal-content');
        if (content) {
          content.style.transform = 'scale(1)';
          content.style.opacity = '1';
        }
      }, 10);
    }
  }

  hideModal() {
    if (this.modal) {
      const content = this.modal.querySelector('.update-modal-content');
      if (content) {
        content.style.transform = 'scale(0.9)';
        content.style.opacity = '0';
      }
      
      setTimeout(() => {
        this.modal.classList.remove('show');
      }, 200);
    }
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Б';
    
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  showNotificationIcon() {
    if (this.notificationIcon) {
      this.notificationIcon.style.display = 'block';
    }
  }

  hideNotificationIcon() {
    if (this.notificationIcon) {
      this.notificationIcon.style.display = 'none';
    }
  }
}

// Инициализируем систему обновлений при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing update notification system...');
  window.updateNotification = new UpdateNotification();
});
