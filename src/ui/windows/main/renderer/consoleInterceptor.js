export function setupConsoleInterception() {
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  };

  const sendToConsole = (level, ...args) => {
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');

    if (window.electronAPI && window.electronAPI.sendConsoleLog) {
      const logEntry = {
        level,
        message,
        timestamp: new Date(),
        source: 'renderer'
      };

      setTimeout(() => {
        try {
          window.electronAPI.sendConsoleLog(logEntry);
        } catch (err) {
          // Ignore send errors
        }
      }, 0);
    }

    return message;
  };

  console.log = (...args) => {
    sendToConsole('info', ...args);
    originalConsole.log.apply(console, args);
  };

  console.info = (...args) => {
    sendToConsole('info', ...args);
    originalConsole.info.apply(console, args);
  };

  console.warn = (...args) => {
    sendToConsole('warning', ...args);
    originalConsole.warn.apply(console, args);
  };

  console.error = (...args) => {
    sendToConsole('error', ...args);
    originalConsole.error.apply(console, args);
  };

  console.debug = (...args) => {
    sendToConsole('debug', ...args);
    originalConsole.debug.apply(console, args);
  };

  console.log('Renderer process started - console.log interception active');
}
