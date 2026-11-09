const { app, BrowserWindow, ipcMain, shell, Tray, Menu, Notification, nativeImage, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let powerBlockerId = null;

// Optimize Chromium startup, hardware rendering flags, and cap V8 heap to prevent memory bloat
try {
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.delkam.erp');
  }
} catch (_) {}

// Keep application active in background without suspension
try {
  powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  console.log('[Electron] Background power save blocker active with ID:', powerBlockerId);
} catch (e) {
  console.warn('[Electron] Power save blocker failed:', e);
}

function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, '../app-icon.png');
  let trayIcon;
  try {
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
      if (process.platform === 'win32') {
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
      }
    }
  } catch (err) {
    console.warn('Tray icon error:', err);
  }

  tray = new Tray(trayIcon || iconPath);
  tray.setToolTip('سامانه هوشمند دلکام (فعال در پس‌زمینه)');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'باز کردن سامانه دلکام',
      click: () => {
        if (mainWindow) {
          if (!mainWindow.isVisible()) mainWindow.show();
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'بررسی پیام‌ها و اعلان‌ها',
      click: () => {
        if (mainWindow) {
          if (!mainWindow.isVisible()) mainWindow.show();
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
          mainWindow.webContents.send('open-tab', 'chat');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'خروج کامل از برنامه',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  tray.on('click', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f172a',
    title: 'دلکام - سامانه مالی و بازرگانی',
    icon: path.join(__dirname, '../app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Security & Background Persistence: Closing the window automatically logs out to the Login screen
  mainWindow.on('close', (event) => {
    try {
      if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('desktop-auto-logout');
        mainWindow.webContents.executeJavaScript(
          "try { localStorage.removeItem('app_current_user'); sessionStorage.removeItem('dlkam_desktop_session_active'); window.dispatchEvent(new CustomEvent('desktop-auto-logout')); } catch(e) {}",
          true
        ).catch(() => {});
      }
    } catch (_) {}
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  if (app.isPackaged) {
    const indexPath = path.join(__dirname, '../dist/index.html');
    mainWindow.loadFile(indexPath);
  } else {
    const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
    mainWindow.loadURL(startUrl);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for Desktop Auto-Updates & Local Downloads Folder Management (Identical to Tauri)

// 1. Get client native version
ipcMain.handle('get-version', () => {
  return app.getVersion() || '1.0.29';
});

// 2. Check if installer file exists in Downloads or UserData
ipcMain.handle('check-local-file-exists', async (event, fileName) => {
  try {
    const downloadsDir = app.getPath('downloads');
    const userDataDir = app.getPath('userData');
    const p1 = path.join(downloadsDir, fileName);
    const p2 = path.join(userDataDir, fileName);
    return fs.existsSync(p1) || fs.existsSync(p2);
  } catch {
    return false;
  }
});

// 3. Save binary bytes to Downloads folder and automatically execute installer
ipcMain.handle('save-and-open-local-file', async (event, { fileName, bytes }) => {
  try {
    const downloadsDir = app.getPath('downloads');
    const filePath = path.join(downloadsDir, fileName);
    let buffer;
    if (Buffer.isBuffer(bytes)) {
      buffer = bytes;
    } else if (bytes instanceof Uint8Array || bytes instanceof ArrayBuffer) {
      buffer = Buffer.from(bytes);
    } else if (bytes?.buffer) {
      buffer = Buffer.from(bytes.buffer);
    } else {
      buffer = Buffer.from(bytes);
    }
    fs.writeFileSync(filePath, buffer);
    await shell.openPath(filePath);
    return filePath;
  } catch (err) {
    console.error('Failed to save and open local update file:', err);
    throw err;
  }
});

ipcMain.handle('open-external', async (event, url) => {
  try {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to open external URL in browser:', err);
    return false;
  }
});

// 4. Open & launch local installer executable
ipcMain.handle('open-local-file', async (event, fileName) => {
  try {
    const downloadsDir = app.getPath('downloads');
    const userDataDir = app.getPath('userData');
    let filePath = path.join(downloadsDir, fileName);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(userDataDir, fileName);
    }
    if (fs.existsSync(filePath)) {
      await shell.openPath(filePath);
      return filePath;
    }
    throw new Error('File not found');
  } catch (err) {
    console.error('Failed to open local file:', err);
    throw err;
  }
});

// 5. Open File Explorer / Folder containing downloaded update with file highlighted
ipcMain.handle('open-local-file-dir', async (event, fileName) => {
  try {
    const downloadsDir = app.getPath('downloads');
    const userDataDir = app.getPath('userData');
    let filePath = path.join(downloadsDir, fileName);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(userDataDir, fileName);
    }
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return downloadsDir;
    } else {
      await shell.openPath(downloadsDir);
      return downloadsDir;
    }
  } catch (err) {
    console.error('Failed to open local file directory:', err);
    throw err;
  }
});

// 6. Show Native Windows Toast Notification (Action Center)
ipcMain.handle('show-native-notification', (event, { title, body, silent, url, id, tab, type }) => {
  try {
    if (Notification.isSupported()) {
      const iconPath = path.join(__dirname, '../app-icon.png');
      const isUrgentChat = type === 'chat_pv' || (url && url.includes('pv='));
      const notif = new Notification({
        title: title || 'سامانه دلکام',
        body: body || '',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        silent: !!silent,
        urgency: isUrgentChat ? 'critical' : 'normal',
        timeoutType: 'never'
      });
      notif.on('click', () => {
        if (mainWindow) {
          if (!mainWindow.isVisible()) mainWindow.show();
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
          if (url || tab) {
            mainWindow.webContents.send('navigate-to-url', { url, tab: tab || (isUrgentChat ? 'chat' : null), id });
          }
        }
      });
      notif.show();
      return true;
    }
  } catch (err) {
    console.error('Failed to show native notification:', err);
  }
  return false;
});

// 7. Focus or restore window
ipcMain.handle('focus-window', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// 8. Request & confirm native permissions (Notifications, Background, Media)
ipcMain.handle('request-native-permissions', () => {
  try {
    return {
      granted: true,
      notificationsSupported: Notification.isSupported()
    };
  } catch {
    return { granted: true, notificationsSupported: true };
  }
});

app.whenReady().then(() => {
  try {
    const { session } = require('electron');
    if (session && session.defaultSession) {
      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(true);
      });
      session.defaultSession.setPermissionCheckHandler(() => true);
    }
  } catch (e) {
    console.warn('[Electron] Permission handler setup warning:', e);
  }
  createWindow();
  createTray();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // If quitting or on macOS without tray, allow quit
  if (isQuitting || process.platform === 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

