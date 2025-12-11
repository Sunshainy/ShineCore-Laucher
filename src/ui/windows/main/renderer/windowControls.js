export function wireWindowControls() {
  const minimizeBtn = document.getElementById('minimize');
  const maximizeBtn = document.getElementById('maximize');
  const closeBtn = document.getElementById('close');

  if (minimizeBtn) {
    minimizeBtn.onclick = () => window.electronAPI.close();
  }

  if (maximizeBtn) {
    maximizeBtn.onclick = () => window.electronAPI.maximize();
  }

  if (closeBtn) {
    closeBtn.onclick = () => window.electronAPI.close();
  }
}
