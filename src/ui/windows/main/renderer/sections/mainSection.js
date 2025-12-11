import { state } from '../state.js';

export async function loadMainSection() {
  const content = document.getElementById('mainContent');
  content.innerHTML = `
    <div class="version-section">
      <h2>ShineCore</h2>
      <p class="subtitle" id="modpackSubtitle">Загрузка информации о сборке...</p>
      <div class="modpack-info" id="modpackInfo"></div>
    </div>
    <div class="divider"></div>
    <div class="launch-section">
      <button class="launch-button" id="launchBtn" disabled>
        <span class="progress-percent" id="progressPercent"></span>
        <div class="launch-button-content">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <span id="launchText">Загрузка...</span>
        </div>
        <div class="stage-text" id="stageText"></div>
        <div class="progress-bar" id="progressBar" style="transform: scaleX(0)"></div>
      </button>
    </div>
    <div class="info-panel">
      <div class="info-item">
        <div class="info-label">Ник игрока</div>
        <input type="text" class="player-nick-input" id="playerNick" placeholder="Введите ник" value="Player">
      </div>
    </div>
  `;

  try {
    state.currentConfig = await window.electronAPI.getConfig();
    document.getElementById('playerNick').value = state.currentConfig.nick || 'Player';
  } catch (e) {
    console.error('Config load error:', e);
  }

  try {
    const manifest = await window.electronAPI.getModpackManifest();
    const installed = await window.electronAPI.checkModpackInstalled();
    
    const subtitle = document.getElementById('modpackSubtitle');
    const info = document.getElementById('modpackInfo');
    const btn = document.getElementById('launchBtn');
    const text = document.getElementById('launchText');
    
    subtitle.textContent = manifest.description || 'Персональная сборка с модами';
    
    info.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 12px;">
        <div class="info-badge">
          <span class="info-badge-label">Minecraft</span>
          <span class="info-badge-value">${manifest.minecraft}</span>
        </div>
        <div class="info-badge">
          <span class="info-badge-label">Загрузчик</span>
          <span class="info-badge-value">${manifest.loader === 'none' ? 'Vanilla' : manifest.loader.charAt(0).toUpperCase() + manifest.loader.slice(1)}</span>
        </div>
        <div class="info-badge">
          <span class="info-badge-label">Java</span>
          <span class="info-badge-value">${manifest.java_version}</span>
        </div>
        <div class="info-badge">
          <span class="info-badge-label">Файлов</span>
          <span class="info-badge-value">${manifest.files?.length || 0}</span>
        </div>
      </div>
    `;
    
    if (installed.versionInstalled) {
      btn.disabled = false;
      text.textContent = 'Играть';
    } else {
      btn.disabled = false;
      text.textContent = 'Установить сборку';
    }
    
    btn.onclick = () => handleModpackLaunch(installed.versionInstalled);
    
  } catch (err) {
    console.error('Failed to load modpack info:', err);
    document.getElementById('modpackSubtitle').textContent = 'Ошибка загрузки сборки';
    document.getElementById('modpackInfo').innerHTML = `
      <div style="color: var(--error); margin-top: 12px;">
        ${err.message || 'Не удалось подключиться к серверу'}
      </div>
    `;
    document.getElementById('launchText').textContent = 'Недоступно';
  }

  document.getElementById('playerNick').oninput = async () => {
    const nick = document.getElementById('playerNick').value.trim();
    if (nick) {
      await window.electronAPI.saveNick(nick);
    }
  };
}

async function handleModpackLaunch(versionInstalled) {
  const btn = document.getElementById('launchBtn');
  const text = document.getElementById('launchText');
  const progressBar = document.getElementById('progressBar');
  const stageText = document.getElementById('stageText');
  const progressPercent = document.getElementById('progressPercent');
  const nick = document.getElementById('playerNick').value.trim() || 'Player';

  btn.disabled = true;

  try {
    if (!versionInstalled) {
      text.textContent = 'Установка...';
      stageText.textContent = 'Подготовка';
      progressBar.style.transform = 'scaleX(0)';
      progressPercent.textContent = '0%';

      await window.electronAPI.downloadModpack();

      text.textContent = 'Запуск...';
      stageText.textContent = 'Запуск игры';
    } else {
      text.textContent = 'Проверка...';
      stageText.textContent = 'Проверка файлов';
      progressBar.style.transform = 'scaleX(0)';
      progressPercent.textContent = '0%';

      await window.electronAPI.downloadModpack();

      text.textContent = 'Запуск...';
      stageText.textContent = 'Запуск игры';
    }

    const result = await window.electronAPI.launchModpack({ nick });

    if (result.success) {
      text.textContent = 'Запущено!';
      stageText.textContent = 'Игра запущена';
      progressBar.style.transform = 'scaleX(1)';
      progressPercent.textContent = '100%';
    } else {
      throw new Error(result.error || 'Ошибка запуска');
    }
  } catch (err) {
    console.error('Modpack launch error:', err);
    text.textContent = 'Ошибка';
    stageText.textContent = err.message;
    progressBar.style.transform = 'scaleX(0)';
    progressPercent.textContent = '';
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      text.textContent = 'Играть';
      stageText.textContent = '';
      progressBar.style.transform = 'scaleX(0)';
      progressPercent.textContent = '';
    }, 3000);
  }
}
