const { contextBridge, ipcRenderer } = require('electron');

const PERSISTENT_KV_KEYS = [
  'dlkam_saved_accounts_v2',
  'dlkam_saved_credentials',
  'saved_username',
  'app_server_host',
  'sayan_remote_server_url',
  'sayan_active_api_url'
];

// Synchronously hydrate localStorage from durable JSON backup before React mounts
// so saved users ("لیست کاربران"), remembered credentials, and server host NEVER vanish.
function hydratePersistentLocalStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const diskData = ipcRenderer.sendSync('get-persistent-kv-sync') || {};
    const toBackfill = {};
    let hasBackfill = false;

    for (const key of PERSISTENT_KV_KEYS) {
      const lsVal = window.localStorage.getItem(key);
      const diskVal = diskData && typeof diskData[key] === 'string' ? diskData[key] : null;

      const isLsEmpty =
        lsVal === null ||
        lsVal === '' ||
        (key === 'dlkam_saved_accounts_v2' && lsVal === '[]');

      const isDiskValid =
        diskVal !== null &&
        diskVal !== '' &&
        !(key === 'dlkam_saved_accounts_v2' && diskVal === '[]');

      if (isLsEmpty && isDiskValid) {
        try {
          window.localStorage.setItem(key, diskVal);
        } catch (_) {}
      } else if (!isLsEmpty && !isDiskValid) {
        toBackfill[key] = lsVal;
        hasBackfill = true;
      }
    }

    if (hasBackfill) {
      ipcRenderer.invoke('set-persistent-kv-bulk', toBackfill).catch(() => {});
    }
  } catch (_) {}
}

hydratePersistentLocalStorage();
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', hydratePersistentLocalStorage, { once: true });
}

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('get-version'),
  getRuntime: () => 'electron',
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  getExportsPath: () => ipcRenderer.invoke('get-exports-path'),
  checkLocalFileExists: (fileName) => ipcRenderer.invoke('check-local-file-exists', fileName),
  saveLocalFile: (fileName, bytes, openAfter = true) => ipcRenderer.invoke('save-local-file', { fileName, bytes, openAfter }),
  saveAndOpenLocalFile: (fileName, bytes) => ipcRenderer.invoke('save-and-open-local-file', { fileName, bytes }),
  downloadAndSaveFile: (options) => ipcRenderer.invoke('download-and-save-file', options),
  openLocalFile: (fileName) => ipcRenderer.invoke('open-local-file', fileName),
  openLocalFileDir: (fileName) => ipcRenderer.invoke('open-local-file-dir', fileName),
  showNativeNotification: (title, body, options) => ipcRenderer.invoke('show-native-notification', { title, body, ...options }),
  requestNativePermissions: () => ipcRenderer.invoke('request-native-permissions'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  focusWindow: () => ipcRenderer.invoke('focus-window'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  getBarcodeWedgeStatus: () => ipcRenderer.invoke('barcode-wedge-status'),
  warmupBarcodeWedge: () => ipcRenderer.invoke('barcode-wedge-warmup'),
  stopBarcodeWedge: () => ipcRenderer.invoke('barcode-wedge-stop'),
  typeBarcodeToActiveWindow: (payload) => ipcRenderer.invoke('type-barcode-to-active-window', payload),
  getPersistentKV: () => ipcRenderer.invoke('get-persistent-kv'),
  getPersistentKVSync: () => ipcRenderer.sendSync('get-persistent-kv-sync'),
  syncPersistentKV: (key, value) => ipcRenderer.invoke('set-persistent-kv', { key, value }),
  removePersistentKV: (key) => ipcRenderer.invoke('remove-persistent-kv', key),
  onDownloadProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  onDownloadCompleted: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download-completed', handler);
    return () => ipcRenderer.removeListener('download-completed', handler);
  },
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
    localStorage.removeItem('app_auth_token');
    localStorage.removeItem('app_refresh_token');
    sessionStorage.removeItem('dlkam_desktop_session_active');
    window.dispatchEvent(new CustomEvent('desktop-auto-logout'));
  } catch (_) {}
});
