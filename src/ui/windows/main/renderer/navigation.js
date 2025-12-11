import { loadMainSection } from './sections/mainSection.js';
import { loadSettings } from './sections/settingsSection.js';
import { loadVersionsSection } from './sections/versionsSection.js';

export function initNavigation() {
  const startButton = document.getElementById('startButton');
  if (startButton) {
    startButton.onclick = () => {
      document.getElementById('welcomeScreen').classList.add('fade-out');
      setTimeout(() => {
        document.getElementById('welcomeScreen').style.display = 'none';
        const launcher = document.getElementById('launcherInterface');
        launcher.style.display = 'flex';
        launcher.classList.add('active');
        loadMainSection();
      }, 500);
    };
  }

  document.addEventListener('click', (e) => {
    const navItem = e.target.closest('.nav-item');
    if (!navItem) return;

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    navItem.classList.add('active');

    const section = navItem.dataset.section;
    if (section === 'main') loadMainSection();
    else if (section === 'versions') loadVersionsSection();
    else if (section === 'settings') loadSettings();
  });
}
