import { state } from '../state.js';

export async function loadVersionsSection() {
  const content = document.getElementById('mainContent');
  content.innerHTML = `
    <div class="version-section">
      <h2>Версии Minecraft</h2>
      <p class="subtitle">Выберите ванильную или Fabric-версию Minecraft</p>
      <div class="version-info">
        <div class="version-selector">
          <div class="version-dropdown" id="versionDropdown">Выберите версию</div>
          <div class="version-list" id="versionList"></div>
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="launch-section">
      <button class="launch-button" id="launchBtn" disabled>
        <span class="progress-percent" id="progressPercent"></span>
        <div class="launch-button-content">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <span id="launchText">Выберите версию</span>
        </div>
        <div class="stage-text" id="stageText"></div>
        <div class="progress-bar" id="progressBar" style="transform: scaleX(0)"></div>
      </button>
      <button class="refresh-button" id="refreshBtn" title="Обновить список версий">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M1 4v6h6M23 20v-6h-6M20.3 5.51C18.52 3.5 15.99 2 13 2c-5.25 0-9.55 3.06-11.63 7.12h4.84c1.6-2.2 4.05-3.62 6.79-3.62 2.59 0 4.84 1.04 6.56 2.73l-3.56 3.56h8v-8l-3.7 3.7zM3.7 18.5c1.78 2.01 4.31 3.5 7.3 3.5 5.25 0 9.55-3.06 11.63-7.12h-4.84c-1.6 2.2-4.05 3.62-6.79 3.62-2.59 0-4.84-1.04-6.56-2.73l3.56-3.56h-8v8l3.7-3.7z"/>
        </svg>
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
    state.versions = await window.electronAPI.getVersions();
    await checkInstalledVersions();
    populateVersionList();
  } catch (e) {
    console.error('Versions load error:', e);
  }

  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.onclick = async () => {
    refreshBtn.classList.add('loading');
    refreshBtn.disabled = true;
    try {
      state.versions = await window.electronAPI.refreshVersions();
      await checkInstalledVersions();
      populateVersionList();
    } catch (e) {
      console.error('Refresh error:', e);
    } finally {
      refreshBtn.classList.remove('loading');
      refreshBtn.disabled = false;
    }
  };

  document.getElementById('playerNick').oninput = async () => {
    checkLaunchReady();
    const nick = document.getElementById('playerNick').value.trim();
    if (nick) {
      await window.electronAPI.saveNick(nick);
    }
  };

  document.getElementById('versionDropdown').onclick = toggleVersionList;
  document.getElementById('launchBtn').onclick = handleLaunchClick;
}

async function checkInstalledVersions() {
  state.installedVersions.clear();
  const checks = await window.electronAPI.checkInstalledVersions(state.versions.map(v => v.id));
  checks.forEach(item => {
    if (item.installed) {
      state.installedVersions.add(item.version);
    }
  });
}

function populateVersionList() {
  const list = document.getElementById('versionList');
  list.innerHTML = state.versions.map(v => {
    const isInstalled = state.installedVersions.has(v.id);
    return `
      <div class="version-item ${isInstalled ? 'installed' : ''}" data-version="${v.id}">
        <span class="version-item-text">${v.display || v.id}</span>
        ${isInstalled ? `
          <span class="version-badge compact" title="Установлено">
            ✓
          </span>
        ` : ''}
      </div>
    `;
  }).join('');

  list.querySelectorAll('.version-item').forEach(item => {
    item.onclick = (e) => {
      e.stopPropagation();
      selectVersion(item.dataset.version);
    };
  });
}

function toggleVersionList() {
  const list = document.getElementById('versionList');
  list.classList.toggle('open');
}

function selectVersion(version) {
  state.selectedVersion = version;
  const found = state.versions.find(v => v.id === version);
  document.getElementById('versionDropdown').textContent = found?.display || version;
  document.getElementById('versionList').classList.remove('open');
  checkLaunchReady();
}

function checkLaunchReady() {
  const nick = document.getElementById('playerNick').value.trim();
  const btn = document.getElementById('launchBtn');
  const text = document.getElementById('launchText');

  if (state.selectedVersion && nick && !state.isDownloading) {
    btn.disabled = false;
    text.textContent = 'Играть';
  } else {
    btn.disabled = true;
    text.textContent = state.selectedVersion ? 'Введите ник' : 'Выберите версию';
  }
}

async function handleLaunchClick() {
  if (state.isDownloading) return;

  const nick = document.getElementById('playerNick').value.trim() || 'Player';
  const btn = document.getElementById('launchBtn');
  const text = document.getElementById('launchText');
  const progressBar = document.getElementById('progressBar');
  const stageText = document.getElementById('stageText');
  const progressPercent = document.getElementById('progressPercent');

  btn.disabled = true;
  state.isDownloading = true;

  try {
    text.textContent = 'Загрузка...';
    stageText.textContent = 'Подготовка...';
    progressBar.style.transform = 'scaleX(0)';
    progressPercent.textContent = '0%';

    await window.electronAPI.downloadVersion({ versionId: state.selectedVersion });

    state.installedVersions.add(state.selectedVersion);
    populateVersionList();

    text.textContent = 'Запуск...';
    stageText.textContent = 'Запуск Minecraft';
    progressBar.style.transform = 'scaleX(1)';
    progressPercent.textContent = '100%';

    await window.electronAPI.launchGame({ nick, versionId: state.selectedVersion });

    text.textContent = 'Запущено!';
    stageText.textContent = 'Игра запущена';
  } catch (err) {
    text.textContent = 'Ошибка';
    stageText.textContent = err.message;
    progressBar.style.transform = 'scaleX(0)';
    progressPercent.textContent = '';
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      state.isDownloading = false;
      text.textContent = 'Играть';
      stageText.textContent = '';
      progressBar.style.transform = 'scaleX(0)';
      progressPercent.textContent = '';
    }, 3000);
  }
}
