import { DEFAULT_BACKGROUND_PATH } from './constants.js';

export const state = {
  selectedVersion: null,
  versions: [],
  installedVersions: new Set(),
  isDownloading: false,
  currentConfig: { nick: 'Player', ram: 4 },
  currentBackground: { type: 'default', path: DEFAULT_BACKGROUND_PATH }
};
