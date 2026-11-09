const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  getRuntime: () => 'electron',
  checkLocalFileExists: (fileName) => ipcRenderer.invoke('check-local-file-exists', fileName),
  saveAndOpenLocalFile: (fileName, bytes) => ipcRenderer.invoke('save-and-open-local-file', { fileName, bytes }),
  openLocalFile: (fileName) => ipcRenderer.invoke('open-local-file', fileName),
  openLocalFileDir: (fileName) => ipcRenderer.invoke('open-local-file-dir', fileName),
  showNativeNotification: (title, body, options) => ipcRenderer.invoke('show-native-notification', { title, body, ...options }),
  requestNativePermissions: () => ipcRenderer.invoke('request-native-permissions'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  focusWindow: () => ipcRenderer.invoke('focus-window'),
  onNavigate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('navigate-to-url', handler);
    return () => ipcRenderer.removeListener('navigate-to-url', handler);
  },
  onAutoLogout: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('desktop-auto-logout', handler);
    return () => ipcRenderer.removeListener('desktop-auto-logout', handler);
  }
});

ipcRenderer.on('desktop-auto-logout', () => {
  try {
    localStorage.removeItem('app_current_user');
    sessionStorage.removeItem('dlkam_desktop_session_active');
    window.dispatchEvent(new CustomEvent('desktop-auto-logout'));
  } catch (_) {}
});


