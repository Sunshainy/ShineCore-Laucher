import { DEFAULT_BACKGROUND_PATH } from './constants.js';
import { state } from './state.js';

export function applyBackground(background) {
  const videoElement = document.querySelector('.background-video');
  const customBackgroundElement = document.getElementById('customBackground');
  const overlayElement = document.querySelector('.overlay');
  
  if (!videoElement || !customBackgroundElement || !overlayElement) {
    console.error('Background elements not found:', { videoElement, customBackgroundElement, overlayElement });
    return;
  }
  
  console.log('Applying background:', background);
  console.log('Background type:', background.type);
  const bgPath = background.resolvedPath || background.path;
  console.log('Background path:', bgPath);
  
  videoElement.classList.add('fade-in');
  customBackgroundElement.classList.add('fade-in');
  
  try {
    if (background.type === 'default') {
      customBackgroundElement.classList.remove('active');
      customBackgroundElement.innerHTML = '';
      customBackgroundElement.style.backgroundImage = '';
      
      videoElement.style.display = 'block';
      videoElement.innerHTML = '';
      const source = document.createElement('source');
      source.src = bgPath;
      source.type = 'video/webm';
      videoElement.appendChild(source);
      videoElement.load();
      videoElement.play().catch(e => console.log('Video autoplay prevented:', e));
      
    } else if (background.type === 'image') {
      videoElement.pause();
      videoElement.currentTime = 0;
      videoElement.style.display = 'none';
      videoElement.innerHTML = '';
      
      let fileUrl;
      if (bgPath.startsWith('file://')) {
        fileUrl = bgPath;
      } else {
        fileUrl = `file://${bgPath}`;
      }
      
      console.log('Image file URL:', fileUrl);
      
      const img = new Image();
      img.onload = function() {
        customBackgroundElement.style.backgroundImage = `url('${fileUrl}')`;
        customBackgroundElement.style.backgroundSize = 'cover';
        customBackgroundElement.style.backgroundPosition = 'center';
        customBackgroundElement.style.backgroundRepeat = 'no-repeat';
        customBackgroundElement.classList.add('active');
      };
      img.onerror = function() {
        console.error('Failed to load image:', fileUrl);
        console.error('Image error details:', img.error);
        applyBackground({ type: 'default', path: DEFAULT_BACKGROUND_PATH });
      };
      img.src = fileUrl;
      
      customBackgroundElement.style.backgroundImage = `url('${fileUrl}')`;
      customBackgroundElement.style.backgroundSize = 'cover';
      customBackgroundElement.style.backgroundPosition = 'center';
      customBackgroundElement.style.backgroundRepeat = 'no-repeat';
      customBackgroundElement.classList.add('active');
      
    } else if (background.type === 'video') {
      videoElement.pause();
      videoElement.currentTime = 0;
      videoElement.style.display = 'none';
      videoElement.innerHTML = '';
      
      let fileUrl;
      if (background.path.startsWith('file://')) {
        fileUrl = background.path;
      } else {
        fileUrl = `file://${background.path}`;
      }
      
      console.log('Video file URL:', fileUrl);
      
      customBackgroundElement.innerHTML = '';
      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      
      const source = document.createElement('source');
      source.src = fileUrl;
      const ext = bgPath.split('.').pop().toLowerCase();
      console.log('Video extension:', ext);
      if (ext === 'webm') {
        source.type = 'video/webm';
      } else if (ext === 'mp4') {
        source.type = 'video/mp4';
      } else {
        source.type = 'video/mp4';
      }
      
      video.appendChild(source);
      customBackgroundElement.appendChild(video);
      customBackgroundElement.classList.add('active');
      
      video.load();
      
      video.onerror = function(e) {
        console.error('Custom video element error:', e);
        console.error('Custom video source:', fileUrl);
        applyBackground({ type: 'default', path: DEFAULT_BACKGROUND_PATH });
      };
      
      video.onloadstart = function() {
        console.log('Custom video loading started');
      };
      
      video.oncanplay = function() {
        console.log('Custom video can play, starting playback');
        video.play().catch(e => {
          console.error('Custom video play error:', e);
          console.error('Custom video source:', fileUrl);
          applyBackground({ type: 'default', path: DEFAULT_BACKGROUND_PATH });
        });
      };
      
      setTimeout(() => {
        if (video.readyState >= 2) {
          video.play().catch(() => {
            console.log('Video not ready yet, waiting for canplay event');
          });
        }
      }, 100);
    }
  } catch (error) {
    console.error('Error applying background:', error);
    applyBackground({ type: 'default', path: DEFAULT_BACKGROUND_PATH });
  }
  
  setTimeout(() => {
    videoElement.classList.remove('fade-in');
    customBackgroundElement.classList.remove('fade-in');
    console.log('Background animation completed');
  }, 500);
}

export async function loadBackground() {
  try {
    console.log('Loading background from main process...');
    state.currentBackground = await window.electronAPI.getBackground();
    console.log('Loaded background:', state.currentBackground);
    console.log('Resolved path:', state.currentBackground.resolvedPath);
    applyBackground(state.currentBackground);
  } catch (err) {
    console.error('Failed to load background:', err);
    console.error('Error details:', err.stack);
  }
}

export function initBackground() {
  window.electronAPI.onBackgroundChanged((background) => {
    console.log('Received background-changed event:', background);
    state.currentBackground = background;
    applyBackground(background);
  });

  loadBackground();
}

export async function selectBackgroundFile() {
  try {
    console.log('Starting background file selection');
    const result = await window.electronAPI.selectBackgroundFile();
    console.log('File selection result:', result);
    
    if (!result || !result.filePaths || result.filePaths.length === 0) {
      console.log('No file selected');
      return;
    }
    
    const filePath = result.filePaths[0];
    console.log('Selected file path:', filePath);
    
    if (!filePath) {
      console.error('File path is undefined');
      alert('Ошибка: не удалось получить путь к файлу');
      return;
    }
    
    const fileName = filePath.toLowerCase();
    const isImage = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png');
    const isVideo = fileName.endsWith('.webm') || fileName.endsWith('.mp4');
    
    console.log('File analysis:', { fileName, isImage, isVideo });
    
    if (!isImage && !isVideo) {
      alert('Пожалуйста, выберите файл изображения (JPG, PNG) или видео (WEBM, MP4)');
      return;
    }
    
    const selectBtn = document.getElementById('selectBackgroundBtn');
    const originalText = selectBtn ? selectBtn.textContent : '';
    if (selectBtn) {
      selectBtn.textContent = 'Загрузка...';
      selectBtn.disabled = true;
    }
    
    try {
      const backgroundConfig = {
        type: isImage ? 'image' : 'video',
        path: filePath
      };
      
      console.log('Sending background config to main process:', backgroundConfig);
      
      const setResult = await window.electronAPI.setBackground(backgroundConfig);
      console.log('Background set result:', setResult);
      
      if (setResult.success) {
        state.currentBackground = setResult.background || backgroundConfig;
        console.log('Updated current background:', state.currentBackground);
        applyBackground(state.currentBackground);
        
        const info = document.getElementById('currentBackgroundInfo');
        if (info) {
          info.textContent = 'Текущий фон: Пользовательский';
        }
        alert('Фон успешно изменен!');
      } else {
        alert('Ошибка при изменении фона: ' + setResult.error);
      }
    } catch (err) {
      console.error('Failed to set background:', err);
      console.error('Error details:', err.stack);
      alert('Ошибка при изменении фона: ' + err.message);
    } finally {
      if (selectBtn) {
        selectBtn.textContent = originalText;
        selectBtn.disabled = false;
      }
    }
    
  } catch (err) {
    console.error('Background selection error:', err);
    console.error('Error details:', err.stack);
    alert('Ошибка при выборе файла: ' + err.message);
  }
}

export async function resetBackground() {
  try {
    console.log('Resetting background...');
    const result = await window.electronAPI.resetBackground();
    console.log('Reset background result:', result);
    
    if (result.success) {
      state.currentBackground = { type: 'default', path: DEFAULT_BACKGROUND_PATH };
      console.log('Updated current background:', state.currentBackground);
      applyBackground(state.currentBackground);
      const info = document.getElementById('currentBackgroundInfo');
      if (info) {
        info.textContent = 'Текущий фон: Стандартный';
      }
      alert('Фон сброшен к стандартному');
    } else {
      alert('Ошибка при сбросе фона: ' + result.error);
    }
  } catch (err) {
    console.error('Failed to reset background:', err);
    console.error('Error details:', err.stack);
    alert('Ошибка при сбросе фона: ' + err.message);
  }
}
