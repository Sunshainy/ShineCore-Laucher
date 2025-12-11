export function registerIpcListeners() {
  if (window.electronAPI && window.electronAPI.onDownloadProgress) {
    window.electronAPI.onDownloadProgress(handleDownloadProgress);
  }

  if (window.electronAPI && window.electronAPI.onModpackProgress) {
    window.electronAPI.onModpackProgress(handleModpackProgress);
  }

  if (window.electronAPI && window.electronAPI.onJavaProgress) {
    window.electronAPI.onJavaProgress(handleJavaProgress);
  }
}

function handleDownloadProgress(progress) {
  const progressBar = document.getElementById('progressBar');
  const stageText = document.getElementById('stageText');
  const progressPercent = document.getElementById('progressPercent');
  const launchText = document.getElementById('launchText');

  if (!progressBar || !stageText || !progressPercent || !launchText) return;

  const percent = progress.percent || 0;
  progressBar.style.transform = `scaleX(${percent / 100})`;
  progressPercent.textContent = `${percent}%`;
  stageText.textContent = progress.stage;
  
  if (progress.stage.includes('метаданных')) {
    launchText.textContent = 'Подготовка...';
  } else if (progress.stage.includes('клиента')) {
    launchText.textContent = 'Загрузка клиента...';
  } else if (progress.stage.includes('библиотек')) {
    launchText.textContent = 'Загрузка библиотек...';
  } else if (progress.stage.includes('ассетов')) {
    launchText.textContent = 'Загрузка ассетов...';
  } else if (progress.stage.includes('завершена')) {
    launchText.textContent = 'Готово!';
  } else {
    launchText.textContent = 'Установка...';
  }
}

function handleModpackProgress(progress) {
  const progressBar = document.getElementById('progressBar');
  const stageText = document.getElementById('stageText');
  const progressPercent = document.getElementById('progressPercent');
  const launchText = document.getElementById('launchText');

  if (!progressBar || !stageText || !progressPercent || !launchText) return;

  const percent = progress.percent || 0;
  progressBar.style.transform = `scaleX(${percent / 100})`;
  progressPercent.textContent = `${percent}%`;
  
  if (progress.stage) {
    if (progress.total > 1) {
      stageText.textContent = `${progress.stage} (${progress.current}/${progress.total})`;
    } else {
      stageText.textContent = progress.stage;
    }

    if (progress.stage.includes('манифеста')) {
      launchText.textContent = 'Подготовка...';
    } else if (progress.stage.includes('базовой версии') || progress.stage.includes('Установка')) {
      launchText.textContent = 'Установка Minecraft...';
    } else if (progress.stage.includes('модпака')) {
      launchText.textContent = 'Загрузка модов...';
    } else if (progress.stage.includes('завершена')) {
      launchText.textContent = 'Готово!';
    } else {
      launchText.textContent = 'Установка...';
    }
  } else {
    launchText.textContent = 'Установка...';
  }
}

function handleJavaProgress(progress) {
  const progressBar = document.getElementById('progressBar');
  const stageText = document.getElementById('stageText');
  const progressPercent = document.getElementById('progressPercent');
  const launchText = document.getElementById('launchText');

  if (!progressBar || !stageText || !progressPercent || !launchText) return;

  const percent = progress.percent || 0;
  progressBar.style.transform = `scaleX(${percent / 100})`;
  progressPercent.textContent = `${percent}%`;
  
  if (progress.stage) {
    stageText.textContent = progress.stage;
    
    if (progress.stage.includes('Загрузка Java')) {
      launchText.textContent = 'Загрузка Java...';
    } else if (progress.stage.includes('Распаковка Java')) {
      launchText.textContent = 'Распаковка Java...';
    } else if (progress.stage.includes('Настройка Java')) {
      launchText.textContent = 'Настройка Java...';
    } else if (progress.stage.includes('Java установлена') || progress.stage.includes('Java уже установлена')) {
      launchText.textContent = 'Java готова';
    }
  }
}
