import { setupConsoleInterception } from './consoleInterceptor.js';
import { initBackground } from './background.js';
import { registerIpcListeners } from './ipcListeners.js';
import { initNavigation } from './navigation.js';
import { wireWindowControls } from './windowControls.js';

setupConsoleInterception();
wireWindowControls();
initBackground();
registerIpcListeners();
initNavigation();
