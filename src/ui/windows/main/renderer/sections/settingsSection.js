import { selectBackgroundFile, resetBackground } from '../background.js';
import { state } from '../state.js';

export async function loadSettings() {
  const content = document.getElementById('mainContent');
  
  try {
    state.currentConfig = await window.electronAPI.getConfig();
    state.currentBackground = await window.electronAPI.getBackground();
  } catch (e) {
    console.error('Config load error:', e);
  }

  content.innerHTML = `
    <div class="version-section">
      <h2>Настройки</h2>
      <p class="subtitle">Настройте параметры лаунчера и игры</p>
    </div>
    <div class="divider"></div>
    
    <div class="settings-section">
      <h3>🎨 Внешний вид</h3>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Фон лаунчера</div>
          <div class="setting-description">Выберите изображение или видео для фона. Поддерживаются JPG, PNG, WEBM, MP4</div>
        </div>
        <div class="setting-control">
          <div class="background-controls">
            <button class="settings-button" id="selectBackgroundBtn">Выбрать файл</button>
            <button class="settings-button" id="resetBackgroundBtn">Сбросить</button>
          </div>
        </div>
      </div>
      <div class="background-preview" id="backgroundPreview">
        <div class="preview-info">
          <span id="currentBackgroundInfo">Текущий фон: ${state.currentBackground.type === 'default' ? 'Стандартный' : 'Пользовательский'}</span>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>⚙️ Производительность</h3>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Оперативная память (RAM)</div>
          <div class="setting-description">Выделенная память для Minecraft. Рекомендуется 4-8 ГБ</div>
        </div>
        <div class="setting-control">
          <input type="range" class="ram-slider" id="ramSlider" min="1" max="16" value="${state.currentConfig.ram}" step="1">
          <span class="ram-value" id="ramValue">${state.currentConfig.ram} ГБ</span>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>📁 Пути и файлы</h3>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Папка игры</div>
          <div class="setting-description">Расположение файлов Minecraft</div>
        </div>
        <div class="setting-control">
          <button class="settings-button" id="openFolderBtn">Открыть папку</button>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>🐞 Отладка</h3>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Консоль отладки</div>
          <div class="setting-description">Открыть окно с логами лаунчера и Minecraft для диагностики проблем</div>
        </div>
        <div class="setting-control">
          <button class="settings-button" id="openConsoleBtn">Открыть консоль</button>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-title">Расширенное логирование</div>
          <div class="setting-description">Включить подробные логи для диагностики проблем</div>
        </div>
        <div class="setting-control">
          <label class="toggle-switch">
            <input type="checkbox" id="debugLoggingToggle">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

  `;

  const ramSlider = document.getElementById('ramSlider');
  const ramValue = document.getElementById('ramValue');

  ramSlider.oninput = () => {
    const ram = parseInt(ramSlider.value, 10);
    ramValue.textContent = `${ram} ГБ`;
  };

  ramSlider.onchange = async () => {
    const ram = parseInt(ramSlider.value, 10);
    state.currentConfig.ram = ram;
    try {
      await window.electronAPI.saveConfig(state.currentConfig);
    } catch (e) {
      console.error('Save config error:', e);
    }
  };

  document.getElementById('openConsoleBtn').onclick = () => {
    window.electronAPI.openConsole();
  };

  const debugToggle = document.getElementById('debugLoggingToggle');
  debugToggle.checked = state.currentConfig.debugLogging || false;
  debugToggle.onchange = async () => {
    state.currentConfig.debugLogging = debugToggle.checked;
    try {
      await window.electronAPI.saveConfig(state.currentConfig);
      if (debugToggle.checked) {
        console.log('Расширенное логирование включено');
      } else {
        console.log('Расширенное логирование выключено');
      }
    } catch (e) {
      console.error('Save config error:', e);
    }
  };

  document.getElementById('selectBackgroundBtn').onclick = selectBackgroundFile;
  document.getElementById('resetBackgroundBtn').onclick = resetBackground;

  document.getElementById('openFolderBtn').onclick = () => {
    window.electronAPI.openFolder();
  };
}
