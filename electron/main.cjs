const { app, BrowserWindow, ipcMain, shell, Tray, Menu, Notification, nativeImage, powerSaveBlocker, session, clipboard, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let powerBlockerId = null;

// Optimize Chromium startup, enable Windows EcoQoS efficiency mode, and cap V8 heap to prevent CPU/memory bloat
try {
  app.commandLine.appendSwitch('enable-features', 'UseEcoQoSForBackgroundProcess');
  app.commandLine.appendSwitch('disable-features', 'Translate,BackForwardCache,MediaRouter');
  app.commandLine.appendSwitch('process-per-site');
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.delkam.erp');
  }
} catch (_) {}

// Single-Instance Lock:
// Prevents spawning a 2nd Electron process when the app is minimized to tray and reopened from Desktop/Start Menu.
// Without this lock, Chromium LevelDB LOCK causes the 2nd instance to open with an empty localStorage (losing saved users/login).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (app.isReady()) {
      createWindow();
    }
  } catch (_) {}
});

function getPersistentKVPath() {
  return path.join(app.getPath('userData'), 'dlkam-persistent-kv.json');
}

function readPersistentKV() {
  try {
    const filePath = getPersistentKVPath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.warn('[Electron] readPersistentKV warning:', err?.message || err);
    return {};
  }
}

function writePersistentKV(data) {
  try {
    const filePath = getPersistentKVPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data || {}, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    console.warn('[Electron] writePersistentKV warning:', err?.message || err);
    return false;
  }
}

function flushElectronSessionStorage() {
  try {
    if (session && session.defaultSession && typeof session.defaultSession.flushStorageData === 'function') {
      session.defaultSession.flushStorageData();
    }
  } catch (_) {}
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

  // Intercept popup / target="_blank" links: if URL is a downloadable file/endpoint, download directly via Chromium will-download instead of opening a blank popup
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const lowerUrl = String(url || '').toLowerCase();
      if (
        lowerUrl.includes('/api/downloads/') ||
        lowerUrl.includes('/downloads/') ||
        lowerUrl.includes('/uploads/') ||
        lowerUrl.includes('/api/secretariat/') ||
        lowerUrl.includes('/api/tools/') ||
        lowerUrl.includes('/api/ccti/') ||
        lowerUrl.includes('/api/industrial-erp/download-backup') ||
        lowerUrl.includes('/api/backups/download') ||
        /[?&]download=/i.test(lowerUrl) ||
        /\.(exe|msi|apk|zip|sql|gz|xlsx|xls|pdf|docx|doc|csv|json|ccti)(\?|$)/i.test(lowerUrl)
      ) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.downloadURL(url);
        }
        return { action: 'deny' };
      }
    } catch (_) {}
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        title: 'دلکام - سامانه مالی و بازرگانی',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false
        }
      }
    };
  });

  mainWindow.webContents.on('did-create-window', (childWindow) => {
    try {
      childWindow.setMenuBarVisibility(false);
      childWindow.setTitle('دلکام - چاپ و پیش‌نمایش');
    } catch (_) {}
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Native Persian Context Menu for Copy / Cut / Paste / Select All across all views & modals
  mainWindow.webContents.on('context-menu', (_event, params) => {
    try {
      const template = [];
      const hasSelection = Boolean(params.selectionText && params.selectionText.trim().length > 0);
      if (params.isEditable) {
        template.push(
          { label: 'برش (Cut)', role: 'cut', enabled: params.editFlags.canCut },
          { label: 'کپی (Copy)', role: 'copy', enabled: params.editFlags.canCopy || hasSelection },
          { label: 'جایگذاری (Paste)', role: 'paste', enabled: params.editFlags.canPaste },
          { type: 'separator' },
          { label: 'انتخاب همه (Select All)', role: 'selectAll', enabled: params.editFlags.canSelectAll }
        );
      } else {
        if (hasSelection) {
          template.push({ label: 'کپی (Copy)', role: 'copy' });
        }
        template.push({ label: 'انتخاب همه (Select All)', role: 'selectAll' });
      }
      if (template.length > 0) {
        const ctxMenu = Menu.buildFromTemplate(template);
        ctxMenu.popup({ window: mainWindow });
      }
    } catch (_) {}
  });

  // Security & Background Persistence: Closing the window automatically logs out active session to the Login screen
  // while preserving saved accounts & server settings in localStorage + native persistent KV store.
  mainWindow.on('close', (event) => {
    try {
      if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('desktop-auto-logout');
        mainWindow.webContents.executeJavaScript(
          "try { localStorage.removeItem('app_current_user'); localStorage.removeItem('app_auth_token'); localStorage.removeItem('app_refresh_token'); sessionStorage.removeItem('dlkam_desktop_session_active'); window.dispatchEvent(new CustomEvent('desktop-auto-logout')); } catch(e) {}",
          true
        ).catch(() => {});
      }
    } catch (_) {}
    flushElectronSessionStorage();
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('hide', () => {
    flushElectronSessionStorage();
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

// IPC Handlers for Desktop Auto-Updates & Local Downloads Folder Management

function ensureDownloadsDir() {
  const candidates = [];
  try { candidates.push(app.getPath('downloads')); } catch (_) {}
  try { candidates.push(path.join(os.homedir(), 'Downloads')); } catch (_) {}
  try { candidates.push(path.join(app.getPath('userData'), 'downloads')); } catch (_) {}

  for (const dir of candidates) {
    if (!dir) continue;
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return dir;
    } catch (_) {}
  }
  return app.getPath('userData');
}

function ensureDlkamExportsDir() {
  const downloadsDir = ensureDownloadsDir();
  const dlkamDir = path.join(downloadsDir, 'Dlkam');
  try {
    if (!fs.existsSync(dlkamDir)) {
      fs.mkdirSync(dlkamDir, { recursive: true });
    }
    return dlkamDir;
  } catch (_) {
    return downloadsDir;
  }
}

function isDesktopInstallerFileName(fileName) {
  return /\.(exe|msi)$/i.test(String(fileName || '').trim());
}

function findMatchingInstallerInDir(dir, safeName) {
  try {
    if (!dir || !fs.existsSync(dir)) return null;
    const direct = path.join(dir, safeName);
    if (isValidLocalFile(direct, safeName)) return direct;

    // Also match numbered copies like "dlkam-electron-setup-v1.0.62 (1).exe"
    const ext = path.extname(safeName);
    const stem = ext ? safeName.slice(0, -ext.length) : safeName;
    const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escapedStem}(?:\\s*\\(\\d+\\)|_\\d+)?${escapedExt}$`, 'i');
    const matches = fs.readdirSync(dir)
      .filter((entry) => pattern.test(entry))
      .map((entry) => path.join(dir, entry))
      .filter((fullPath) => isValidLocalFile(fullPath, fullPath))
      .sort((a, b) => {
        try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
      });
    return matches[0] || null;
  } catch {
    return null;
  }
}

function sanitizeDownloadFileName(rawName) {
  const base = path.basename(String(rawName || '').trim()) || `delkam_file_${Date.now()}`;
  return base.replace(/[\\/:*?"<>|]/g, '_').trim() || `delkam_file_${Date.now()}`;
}

function getUniqueSavePath(dir, fileName, overwriteIfInstaller = false) {
  const safeName = sanitizeDownloadFileName(fileName);
  const candidate = path.join(dir, safeName);
  if (overwriteIfInstaller || !fs.existsSync(candidate)) {
    return candidate;
  }
  const ext = path.extname(safeName);
  const stem = ext ? safeName.slice(0, -ext.length) : safeName;
  for (let i = 1; i < 1000; i++) {
    const nextCandidate = path.join(dir, `${stem} (${i})${ext}`);
    if (!fs.existsSync(nextCandidate)) {
      return nextCandidate;
    }
  }
  return path.join(dir, `${stem}_${Date.now()}${ext}`);
}

function isValidLocalFile(filePath, fileName) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) return false;
    const lower = String(fileName || filePath).toLowerCase();
    if (lower.endsWith('.exe') || lower.endsWith('.msi')) {
      // Never accept truncated/HTML error pages (< 100 KB) as a valid Windows installer
      if (stat.size < 102400) return false;
      if (lower.endsWith('.exe')) {
        const fd = fs.openSync(filePath, 'r');
        const header = Buffer.alloc(2);
        const bytesRead = fs.readSync(fd, header, 0, 2, 0);
        fs.closeSync(fd);
        if (bytesRead < 2 || header[0] !== 0x4D || header[1] !== 0x5A) {
          return false; // Not a valid PE/MZ executable
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function toNodeBuffer(bytes) {
  if (!bytes) return Buffer.alloc(0);
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array || bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (typeof bytes === 'string') return Buffer.from(bytes, 'base64');
  if (bytes?.buffer) return Buffer.from(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
  return Buffer.from(bytes);
}

function purgeOldInstallers(keepFileName) {
  const downloadsDir = ensureDownloadsDir();
  const userDataDir = app.getPath('userData');
  const keepLower = String(keepFileName || '').toLowerCase();
  for (const dir of [downloadsDir, userDataDir]) {
    try {
      if (!dir || !fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir)) {
        const lower = entry.toLowerCase();
        if (
          lower !== keepLower &&
          /^(dlkam-desktop|dlkam-electron|sayan-desktop).*\.(exe|msi)$/i.test(lower)
        ) {
          try { fs.unlinkSync(path.join(dir, entry)); } catch (_) {}
        }
      }
    } catch (_) {}
  }
}

async function openPathWithFallback(filePath) {
  let errStr = await shell.openPath(filePath);
  if (errStr && String(errStr).trim()) {
    // Brief retry in case Windows Defender SmartScreen is still scanning the newly written .exe
    await new Promise((r) => setTimeout(r, 750));
    errStr = await shell.openPath(filePath);
  }
  if (errStr && String(errStr).trim()) {
    console.warn('[Electron] shell.openPath error:', errStr, 'for', filePath);
    try {
      shell.showItemInFolder(filePath);
    } catch (_) {}
    throw new Error(errStr);
  }
  return filePath;
}

function finalizeDownloadedFile(tempPartPath, destPath, receivedBytes, contentLength, onProgress) {
  let finalPath = destPath;
  if (fs.existsSync(finalPath)) {
    try {
      fs.unlinkSync(finalPath);
    } catch (_) {
      finalPath = getUniqueSavePath(path.dirname(destPath), path.basename(destPath), false);
    }
  }
  try {
    fs.renameSync(tempPartPath, finalPath);
  } catch (renameErr) {
    // If target filename is locked (EPERM/EBUSY by Defender/Explorer), write to unique numbered filename
    const code = renameErr?.code || '';
    if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
      finalPath = getUniqueSavePath(path.dirname(destPath), path.basename(destPath), false);
      fs.renameSync(tempPartPath, finalPath);
    } else {
      throw renameErr;
    }
  }
  if (!isValidLocalFile(finalPath, finalPath)) {
    try { fs.unlinkSync(finalPath); } catch (_) {}
    throw new Error('Downloaded file failed integrity verification (empty or corrupt binary)');
  }
  if (onProgress) {
    onProgress({ pct: 100, loadedBytes: receivedBytes, totalBytes: contentLength || receivedBytes });
  }
  return { filePath: finalPath, size: receivedBytes };
}

function streamDownloadWithElectronNet({ url, destPath, authToken, expectedSize = 0, onProgress }) {
  return new Promise((resolve, reject) => {
    if (!net || typeof net.request !== 'function') {
      return reject(new Error('Electron net module unavailable'));
    }

    let settled = false;
    const failOnce = (err, writeStream, tempPartPath, req) => {
      if (settled) return;
      settled = true;
      if (inactivityTimer) clearTimeout(inactivityTimer);
      try { if (writeStream) writeStream.destroy(); } catch (_) {}
      try { if (req && typeof req.abort === 'function') req.abort(); } catch (_) {}
      try { if (tempPartPath && fs.existsSync(tempPartPath)) fs.unlinkSync(tempPartPath); } catch (_) {}
      reject(err);
    };

    const tempPartPath = `${destPath}.${Date.now()}.part`;
    let inactivityTimer = null;
    const resetTimeout = (req, writeStream) => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        failOnce(new Error('Electron net download timed out (90s inactivity)'), writeStream, tempPartPath, req);
      }, 90000);
    };

    try {
      const request = net.request({
        method: 'GET',
        url,
        session: session?.defaultSession,
        useSessionCookies: true,
        redirect: 'follow'
      });

      request.setHeader(
        'User-Agent',
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 DelkamDesktop-Electron/${app.getVersion() || '1.0.29'}`
      );
      request.setHeader('X-Client-Runtime', 'electron');
      request.setHeader('Accept', '*/*');
      request.setHeader('Cache-Control', 'no-cache');
      if (authToken) {
        request.setHeader('Authorization', `Bearer ${authToken}`);
      }

      let activeWriteStream = null;
      resetTimeout(request, null);

      request.on('response', (response) => {
        resetTimeout(request, null);
        const status = response.statusCode || 0;
        if (status < 200 || status >= 300) {
          let errBody = '';
          response.on('data', (chunk) => {
            if (errBody.length < 1024) errBody += Buffer.from(chunk).toString('utf8');
          });
          response.on('end', () => {
            failOnce(new Error(`HTTP_${status}: ${errBody.slice(0, 200)}`), null, tempPartPath, request);
          });
          return;
        }

        const rawCt = response.headers['content-type'];
        const contentType = String(Array.isArray(rawCt) ? rawCt[0] : (rawCt || '')).toLowerCase();
        if (contentType.includes('text/html') && /\.(exe|msi|apk|zip|gz|xlsx|pdf)$/i.test(destPath.toLowerCase())) {
          return failOnce(new Error('Server returned HTML error page instead of binary file'), null, tempPartPath, request);
        }

        const rawCl = response.headers['content-length'];
        const contentLength = Number(Array.isArray(rawCl) ? rawCl[0] : rawCl) || Number(expectedSize) || 0;
        let receivedBytes = 0;
        let lastReportAt = 0;

        activeWriteStream = fs.createWriteStream(tempPartPath);

        activeWriteStream.on('error', (err) => {
          failOnce(err, activeWriteStream, tempPartPath, request);
        });

        activeWriteStream.on('finish', () => {
          if (settled) return;
          try {
            const result = finalizeDownloadedFile(tempPartPath, destPath, receivedBytes, contentLength, onProgress);
            settled = true;
            if (inactivityTimer) clearTimeout(inactivityTimer);
            resolve(result);
          } catch (finErr) {
            failOnce(finErr, activeWriteStream, tempPartPath, request);
          }
        });

        response.on('data', (chunk) => {
          resetTimeout(request, activeWriteStream);
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buf.length;
          if (!activeWriteStream.write(buf)) {
            // Backpressure handled gracefully by Node stream buffering; avoid deadlocking Chromium response
          }
          const now = Date.now();
          if (onProgress && (now - lastReportAt >= 120 || (contentLength > 0 && receivedBytes >= contentLength))) {
            lastReportAt = now;
            const pct = contentLength > 0
              ? Math.min(99, Math.max(1, Math.round((receivedBytes / contentLength) * 100)))
              : 50;
            onProgress({ pct, loadedBytes: receivedBytes, totalBytes: contentLength });
          }
        });

        response.on('end', () => {
          if (activeWriteStream && !activeWriteStream.destroyed) {
            activeWriteStream.end();
          }
        });

        response.on('error', (err) => {
          failOnce(err, activeWriteStream, tempPartPath, request);
        });
      });

      request.on('error', (err) => {
        failOnce(err, activeWriteStream, tempPartPath, request);
      });

      request.end();
    } catch (err) {
      failOnce(err, null, tempPartPath, null);
    }
  });
}

function streamDownloadWithNodeHttp({ url, destPath, authToken, expectedSize = 0, onProgress, redirectCount = 0 }) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 8) {
      return reject(new Error('Too many HTTP redirects while downloading update'));
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return reject(new Error(`Invalid download URL: ${url}`));
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const headers = {
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 DelkamDesktop-Electron/${app.getVersion() || '1.0.29'}`,
      'X-Client-Runtime': 'electron',
      'Accept': '*/*',
      'Cache-Control': 'no-cache'
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const reqOptions = {
      method: 'GET',
      headers,
      timeout: 90000,
    };
    if (isHttps && /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(parsedUrl.hostname)) {
      reqOptions.rejectUnauthorized = false;
    }

    const tempPartPath = `${destPath}.${Date.now()}.part`;
    const req = client.request(parsedUrl, reqOptions, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        const nextUrl = new URL(res.headers.location, parsedUrl).toString();
        return streamDownloadWithNodeHttp({
          url: nextUrl,
          destPath,
          authToken,
          expectedSize,
          onProgress,
          redirectCount: redirectCount + 1
        }).then(resolve).catch(reject);
      }

      if (status < 200 || status >= 300) {
        let errBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (errBody.length < 1024) errBody += chunk;
        });
        res.on('end', () => {
          reject(new Error(`HTTP_${status}: ${errBody.slice(0, 200)}`));
        });
        return;
      }

      const contentType = String(res.headers['content-type'] || '').toLowerCase();
      const lowerDest = destPath.toLowerCase();
      if (
        contentType.includes('text/html') &&
        /\.(exe|msi|apk|zip|gz|xlsx|pdf)$/i.test(lowerDest)
      ) {
        res.resume();
        return reject(new Error('Server returned HTML error page instead of binary file'));
      }

      const contentLength = Number(res.headers['content-length']) || Number(expectedSize) || 0;
      let receivedBytes = 0;
      let lastReportAt = 0;

      const writeStream = fs.createWriteStream(tempPartPath);

      res.on('data', (chunk) => {
        receivedBytes += chunk.length;
        const now = Date.now();
        if (onProgress && (now - lastReportAt >= 120 || (contentLength > 0 && receivedBytes >= contentLength))) {
          lastReportAt = now;
          const pct = contentLength > 0
            ? Math.min(99, Math.max(1, Math.round((receivedBytes / contentLength) * 100)))
            : 50;
          onProgress({ pct, loadedBytes: receivedBytes, totalBytes: contentLength });
        }
      });

      writeStream.on('finish', () => {
        try {
          resolve(finalizeDownloadedFile(tempPartPath, destPath, receivedBytes, contentLength, onProgress));
        } catch (finErr) {
          try { if (fs.existsSync(tempPartPath)) fs.unlinkSync(tempPartPath); } catch (_) {}
          reject(finErr);
        }
      });

      writeStream.on('error', (err) => {
        try { if (fs.existsSync(tempPartPath)) fs.unlinkSync(tempPartPath); } catch (_) {}
        reject(err);
      });

      res.on('error', (err) => {
        writeStream.destroy();
        try { if (fs.existsSync(tempPartPath)) fs.unlinkSync(tempPartPath); } catch (_) {}
        reject(err);
      });

      res.pipe(writeStream);
    });

    req.on('timeout', () => {
      req.destroy(new Error('Download request timed out'));
    });

    req.on('error', (err) => {
      try { if (fs.existsSync(tempPartPath)) fs.unlinkSync(tempPartPath); } catch (_) {}
      reject(err);
    });

    req.end();
  });
}

async function streamDownloadToFile(opts) {
  // 1. Prefer Electron's Chromium net.request (respects Windows VPN/System Proxy & OS certificate store)
  try {
    return await streamDownloadWithElectronNet(opts);
  } catch (netErr) {
    console.warn('[Electron] net.request download fallback to Node http/https:', netErr?.message || netErr);
  }
  // 2. Fallback to Node http/https with 1 automatic transient retry
  try {
    return await streamDownloadWithNodeHttp(opts);
  } catch (nodeErr) {
    console.warn('[Electron] Node download attempt 1 failed, retrying once:', nodeErr?.message || nodeErr);
    await new Promise((r) => setTimeout(r, 800));
    return await streamDownloadWithNodeHttp(opts);
  }
}

// 1. Get client native version
ipcMain.handle('get-version', () => {
  return app.getVersion() || '1.0.29';
});

// 1b. Get Windows Downloads directory path & dedicated Dlkam exports folder (Downloads\Dlkam)
ipcMain.handle('get-downloads-path', () => {
  return ensureDownloadsDir();
});

ipcMain.handle('get-exports-path', () => {
  return ensureDlkamExportsDir();
});

// 2. Check if valid file exists in Downloads\Dlkam, Downloads, or UserData
ipcMain.handle('check-local-file-exists', async (event, fileName) => {
  try {
    const safeName = sanitizeDownloadFileName(fileName);
    const exportsDir = ensureDlkamExportsDir();
    const downloadsDir = ensureDownloadsDir();
    const userDataDir = app.getPath('userData');
    return Boolean(
      findMatchingInstallerInDir(exportsDir, safeName) ||
      findMatchingInstallerInDir(downloadsDir, safeName) ||
      findMatchingInstallerInDir(userDataDir, safeName)
    );
  } catch {
    return false;
  }
});

// 3a. Save binary bytes to Downloads\Dlkam (or Downloads root for installers)
ipcMain.handle('save-local-file', async (event, { fileName, bytes, openAfter = true }) => {
  try {
    const safeName = sanitizeDownloadFileName(fileName);
    const isInstaller = /^(dlkam-desktop|dlkam-electron|sayan-desktop).*\.(exe|msi)$/i.test(safeName);
    const targetDir = isInstaller ? ensureDownloadsDir() : ensureDlkamExportsDir();
    const filePath = isInstaller
      ? getUniqueSavePath(targetDir, safeName, !fs.existsSync(path.join(targetDir, safeName)))
      : getUniqueSavePath(targetDir, safeName, false);

    const buffer = toNodeBuffer(bytes);
    if (!buffer || buffer.length === 0) {
      throw new Error('Cannot save empty file buffer');
    }
    try {
      fs.writeFileSync(filePath, buffer);
    } catch (writeErr) {
      const altPath = getUniqueSavePath(targetDir, safeName, false);
      fs.writeFileSync(altPath, buffer);
      if (isInstaller && !isValidLocalFile(altPath, safeName)) {
        try { fs.unlinkSync(altPath); } catch (_) {}
        throw new Error('Saved installer failed binary validation');
      }
      if (isInstaller) purgeOldInstallers(path.basename(altPath));
      if (openAfter !== false) {
        try {
          await openPathWithFallback(altPath);
        } catch (launchErr) {
          if (isInstaller) {
            throw new Error(`LAUNCH_FAILED: ${launchErr?.message || launchErr}`);
          }
          try { shell.showItemInFolder(altPath); } catch (_) {}
        }
      }
      return altPath;
    }

    if (isInstaller) {
      if (!isValidLocalFile(filePath, safeName)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
        throw new Error('Saved installer failed binary validation');
      }
      purgeOldInstallers(path.basename(filePath));
    }

    if (openAfter !== false) {
      try {
        await openPathWithFallback(filePath);
      } catch (launchErr) {
        if (isInstaller) {
          throw new Error(`LAUNCH_FAILED: ${launchErr?.message || launchErr}`);
        }
        try { shell.showItemInFolder(filePath); } catch (_) {}
      }
    }
    return filePath;
  } catch (err) {
    console.error('Failed to save local file:', err);
    throw err;
  }
});

// 3b. Save binary bytes to Downloads\Dlkam (or Downloads for installers) and automatically execute/open it
ipcMain.handle('save-and-open-local-file', async (event, { fileName, bytes, openAfter = true }) => {
  try {
    const safeName = sanitizeDownloadFileName(fileName);
    const isInstaller = /^(dlkam-desktop|dlkam-electron|sayan-desktop).*\.(exe|msi)$/i.test(safeName);
    const targetDir = isInstaller ? ensureDownloadsDir() : ensureDlkamExportsDir();
    let filePath = isInstaller
      ? path.join(targetDir, safeName)
      : getUniqueSavePath(targetDir, safeName, false);

    const buffer = toNodeBuffer(bytes);
    if (!buffer || buffer.length === 0) {
      throw new Error('Cannot save empty file buffer');
    }
    try {
      fs.writeFileSync(filePath, buffer);
    } catch (_) {
      filePath = getUniqueSavePath(targetDir, safeName, false);
      fs.writeFileSync(filePath, buffer);
    }

    if (isInstaller) {
      if (!isValidLocalFile(filePath, safeName)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
        throw new Error('Saved installer failed binary validation');
      }
      purgeOldInstallers(path.basename(filePath));
    }

    if (openAfter !== false) {
      try {
        await openPathWithFallback(filePath);
      } catch (launchErr) {
        if (isInstaller) {
          throw new Error(`LAUNCH_FAILED: ${launchErr?.message || launchErr}`);
        }
        try { shell.showItemInFolder(filePath); } catch (_) {}
      }
    }
    return filePath;
  } catch (err) {
    console.error('Failed to save and open local update file:', err);
    throw err;
  }
});

// 3c. Native Main-Process Streaming Downloader (installers -> Downloads, exports/reports -> Downloads\Dlkam)
ipcMain.handle('download-and-save-file', async (event, { url, fileName, openAfter = true, authToken = '', expectedSize = 0 }) => {
  try {
    const safeName = sanitizeDownloadFileName(fileName || `delkam_download_${Date.now()}`);
    const isInstaller = isDesktopInstallerFileName(safeName);
    const targetDir = isInstaller ? ensureDownloadsDir() : ensureDlkamExportsDir();
    const destPath = isInstaller
      ? path.join(targetDir, safeName)
      : getUniqueSavePath(targetDir, safeName, false);

    const { filePath } = await streamDownloadToFile({
      url,
      destPath,
      authToken,
      expectedSize,
      onProgress: (progress) => {
        try {
          if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('download-progress', {
              url,
              fileName: safeName,
              ...progress
            });
          }
        } catch (_) {}
      }
    });

    if (isInstaller) {
      purgeOldInstallers(path.basename(filePath));
    }

    if (openAfter !== false) {
      try {
        await openPathWithFallback(filePath);
      } catch (launchErr) {
        if (isInstaller) {
          // File IS downloaded & verified — distinguish installer launch block from download failure
          throw new Error(`LAUNCH_FAILED: ${launchErr?.message || launchErr}`);
        }
        try { shell.showItemInFolder(filePath); } catch (_) {}
      }
    }
    return filePath;
  } catch (err) {
    console.error('download-and-save-file failed:', err);
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

// 4. Open & launch local file or installer executable
ipcMain.handle('open-local-file', async (event, fileName) => {
  try {
    const safeName = sanitizeDownloadFileName(fileName);
    const exportsDir = ensureDlkamExportsDir();
    const downloadsDir = ensureDownloadsDir();
    const userDataDir = app.getPath('userData');
    const filePath =
      findMatchingInstallerInDir(exportsDir, safeName) ||
      findMatchingInstallerInDir(downloadsDir, safeName) ||
      findMatchingInstallerInDir(userDataDir, safeName);
    if (filePath && isValidLocalFile(filePath, safeName)) {
      try {
        await openPathWithFallback(filePath);
        return filePath;
      } catch (launchErr) {
        throw new Error(`LAUNCH_FAILED: ${launchErr?.message || launchErr}`);
      }
    }
    throw new Error('Valid local file not found');
  } catch (err) {
    console.error('Failed to open local file:', err);
    throw err;
  }
});

// 5. Open File Explorer / Folder containing downloaded file with file highlighted
ipcMain.handle('open-local-file-dir', async (event, fileName) => {
  try {
    const safeName = sanitizeDownloadFileName(fileName);
    const exportsDir = ensureDlkamExportsDir();
    const downloadsDir = ensureDownloadsDir();
    const userDataDir = app.getPath('userData');
    const matchedPath =
      findMatchingInstallerInDir(exportsDir, safeName) ||
      findMatchingInstallerInDir(downloadsDir, safeName) ||
      findMatchingInstallerInDir(userDataDir, safeName) ||
      (fs.existsSync(path.join(exportsDir, safeName)) ? path.join(exportsDir, safeName) : null) ||
      (fs.existsSync(path.join(downloadsDir, safeName)) ? path.join(downloadsDir, safeName) : null) ||
      (fs.existsSync(path.join(userDataDir, safeName)) ? path.join(userDataDir, safeName) : null);

    const fallbackDir = isDesktopInstallerFileName(safeName) ? downloadsDir : exportsDir;
    if (matchedPath && fs.existsSync(matchedPath)) {
      shell.showItemInFolder(matchedPath);
      return path.dirname(matchedPath);
    } else {
      await shell.openPath(fallbackDir);
      return fallbackDir;
    }
  } catch (err) {
    console.error('Failed to open local file directory:', err);
    throw err;
  }
});

// 6. Show Native Windows Toast Notification (Action Center)
ipcMain.handle('show-native-notification', (event, payload = {}) => {
  try {
    const { title, body, silent, url, id, tab, type, ...rest } = payload || {};
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
          mainWindow.webContents.send('navigate-to-url', {
            ...rest,
            url: url || '',
            tab: tab || (isUrgentChat ? 'chat' : null),
            id,
            title: title || '',
            body: body || '',
            type
          });
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

// 9. Native Persistent Key-Value Store (survives LevelDB locks, upgrades, and abrupt exits)
ipcMain.on('get-persistent-kv-sync', (event) => {
  event.returnValue = readPersistentKV();
});

ipcMain.handle('get-persistent-kv', () => {
  return readPersistentKV();
});

ipcMain.handle('set-persistent-kv', (_event, { key, value }) => {
  if (!key || typeof key !== 'string') return false;
  const current = readPersistentKV();
  if (value === null || value === undefined) {
    delete current[key];
  } else {
    current[key] = String(value);
  }
  return writePersistentKV(current);
});

ipcMain.handle('set-persistent-kv-bulk', (_event, entries) => {
  if (!entries || typeof entries !== 'object') return false;
  const current = readPersistentKV();
  for (const [k, v] of Object.entries(entries)) {
    if (!k) continue;
    if (v === null || v === undefined) {
      delete current[k];
    } else {
      current[k] = String(v);
    }
  }
  return writePersistentKV(current);
});

ipcMain.handle('remove-persistent-kv', (_event, key) => {
  if (!key || typeof key !== 'string') return false;
  const current = readPersistentKV();
  if (Object.prototype.hasOwnProperty.call(current, key)) {
    delete current[key];
    return writePersistentKV(current);
  }
  return true;
});

ipcMain.handle('copy-text', (_event, text) => {
  try {
    clipboard.writeText(String(text ?? ''));
    return true;
  } catch (_) {
    return false;
  }
});

// 10. Windows Direct Keyboard-Wedge Engine (Barcode-to-PC -> Sayan ERP active window)
// Uses Win32 SendInput with KEYEVENTF_UNICODE via a persistent hidden PowerShell helper
// so typing is <5ms, immune to Persian/English keyboard layout, and 100% safe against shell injection.
let winKeyWedgeProc = null;
let winKeyWedgeReady = false;
let winKeyWedgeStdoutBuf = '';
let winKeyWedgePending = new Map();
let winKeyWedgeReqSeq = 1;

const ALLOWED_WEDGE_SUFFIXES = new Set(['enter', 'tab', 'enter2', 'tab_enter', 'none']);

const WIN32_KEYWEDGE_PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;

public static class DlkamWin32KeyWedge {
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT {
        public uint type;
        public InputUnion u;
    }

    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT {
        public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct HARDWAREINPUT {
        public uint uMsg; public ushort wParamL; public ushort wParamH;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    const uint INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_UNICODE = 0x0004;
    const ushort VK_RETURN = 0x0D;
    const ushort VK_TAB = 0x09;

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    static extern bool IsIconic(IntPtr hWnd);

    public static bool FocusWindowByKeywords(string[] keywords) {
        if (keywords == null || keywords.Length == 0) return false;
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new StringBuilder(256);
            int len = GetWindowText(hWnd, sb, sb.Capacity);
            if (len <= 0) return true;
            string title = sb.ToString();
            foreach (var kw in keywords) {
                if (!string.IsNullOrEmpty(kw) && title.IndexOf(kw, StringComparison.OrdinalIgnoreCase) >= 0) {
                    found = hWnd;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);

        if (found != IntPtr.Zero) {
            if (IsIconic(found)) ShowWindow(found, 9);
            SetForegroundWindow(found);
            Thread.Sleep(60);
            return true;
        }
        return false;
    }

    static void SendUnicodeChar(char ch) {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].u.ki.wVk = 0;
        inputs[0].u.ki.wScan = (ushort)ch;
        inputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE;

        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].u.ki.wVk = 0;
        inputs[1].u.ki.wScan = (ushort)ch;
        inputs[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    static void SendVirtualKey(ushort vk) {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].u.ki.wVk = vk;
        inputs[0].u.ki.dwFlags = 0;

        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].u.ki.wVk = vk;
        inputs[1].u.ki.dwFlags = KEYEVENTF_KEYUP;

        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void TypeBarcode(string text, string suffix, int charDelayMs, bool focusSayan) {
        if (focusSayan) {
            FocusWindowByKeywords(new string[] { "Sayan", "سایان" });
        }
        int delay = Math.Max(0, Math.Min(50, charDelayMs));
        if (!string.IsNullOrEmpty(text)) {
            foreach (char c in text) {
                SendUnicodeChar(c);
                if (delay > 0) Thread.Sleep(delay);
            }
        }
        if (suffix == "enter") {
            Thread.Sleep(25);
            SendVirtualKey(VK_RETURN);
        } else if (suffix == "tab") {
            Thread.Sleep(25);
            SendVirtualKey(VK_TAB);
        } else if (suffix == "enter2") {
            Thread.Sleep(25);
            SendVirtualKey(VK_RETURN);
            Thread.Sleep(70);
            SendVirtualKey(VK_RETURN);
        } else if (suffix == "tab_enter") {
            Thread.Sleep(25);
            SendVirtualKey(VK_TAB);
            Thread.Sleep(50);
            SendVirtualKey(VK_RETURN);
        }
    }
}
"@
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()
while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0) { continue }
    try {
        $req = $trimmed | ConvertFrom-Json
        if ($req.cmd -eq 'exit') { break }
        $id = [int]$req.id
        $txt = [string]$req.text
        $suf = [string]$req.suffix
        $cd = [int]$req.charDelayMs
        $fs = [bool]$req.focusSayan
        [DlkamWin32KeyWedge]::TypeBarcode($txt, $suf, $cd, $fs)
        $resp = @{ id = $id; ok = $true } | ConvertTo-Json -Compress
        [Console]::Out.WriteLine($resp)
        [Console]::Out.Flush()
    } catch {
        $errMsg = $_.Exception.Message
        $resp = @{ id = 0; ok = $false; error = $errMsg } | ConvertTo-Json -Compress
        [Console]::Out.WriteLine($resp)
        [Console]::Out.Flush()
    }
}
`;

function stopWinKeyWedgeHelper() {
  try {
    if (winKeyWedgeProc && !winKeyWedgeProc.killed) {
      try { winKeyWedgeProc.stdin.write(JSON.stringify({ cmd: 'exit' }) + '\n'); } catch (_) {}
      setTimeout(() => {
        try { if (winKeyWedgeProc && !winKeyWedgeProc.killed) winKeyWedgeProc.kill(); } catch (_) {}
      }, 150);
    }
  } catch (_) {}
  winKeyWedgeProc = null;
  winKeyWedgeReady = false;
  for (const [, pending] of winKeyWedgePending.entries()) {
    try { clearTimeout(pending.timer); } catch (_) {}
    pending.reject(new Error('Keyboard wedge helper stopped'));
  }
  winKeyWedgePending.clear();
}

function ensureWinKeyWedgeHelper() {
  if (process.platform !== 'win32') {
    return Promise.reject(new Error('Direct OS barcode typing is only supported on Windows'));
  }
  if (winKeyWedgeProc && !winKeyWedgeProc.killed && winKeyWedgeReady) {
    return Promise.resolve(winKeyWedgeProc);
  }

  return new Promise((resolve, reject) => {
    stopWinKeyWedgeHelper();
    winKeyWedgeStdoutBuf = '';

    const encodedScript = Buffer.from(WIN32_KEYWEDGE_PS_SCRIPT, 'utf16le').toString('base64');
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encodedScript],
      { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    winKeyWedgeProc = proc;

    let settledInit = false;
    const initTimeout = setTimeout(() => {
      if (!settledInit) {
        settledInit = true;
        stopWinKeyWedgeHelper();
        reject(new Error('Windows keyboard wedge startup timed out'));
      }
    }, 12000);

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      winKeyWedgeStdoutBuf += chunk;
      let idx;
      while ((idx = winKeyWedgeStdoutBuf.indexOf('\n')) >= 0) {
        const line = winKeyWedgeStdoutBuf.slice(0, idx).trim();
        winKeyWedgeStdoutBuf = winKeyWedgeStdoutBuf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.ready) {
            winKeyWedgeReady = true;
            if (!settledInit) {
              settledInit = true;
              clearTimeout(initTimeout);
              resolve(proc);
            }
            continue;
          }
          if (msg.id && winKeyWedgePending.has(msg.id)) {
            const p = winKeyWedgePending.get(msg.id);
            winKeyWedgePending.delete(msg.id);
            clearTimeout(p.timer);
            if (msg.ok) p.resolve({ ok: true });
            else p.reject(new Error(msg.error || 'Win32 SendInput failed'));
          }
        } catch (_) {}
      }
    });

    proc.on('error', (err) => {
      if (!settledInit) {
        settledInit = true;
        clearTimeout(initTimeout);
        reject(err);
      }
      stopWinKeyWedgeHelper();
    });

    proc.on('exit', () => {
      if (!settledInit) {
        settledInit = true;
        clearTimeout(initTimeout);
        reject(new Error('Windows keyboard wedge helper exited unexpectedly'));
      }
      winKeyWedgeProc = null;
      winKeyWedgeReady = false;
    });
  });
}

ipcMain.handle('barcode-wedge-status', () => {
  return {
    supported: process.platform === 'win32',
    ready: winKeyWedgeReady,
    runtime: 'electron'
  };
});

ipcMain.handle('barcode-wedge-warmup', async () => {
  if (process.platform !== 'win32') return { supported: false, ready: false };
  try {
    await ensureWinKeyWedgeHelper();
    return { supported: true, ready: true };
  } catch (err) {
    return { supported: true, ready: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('barcode-wedge-stop', () => {
  stopWinKeyWedgeHelper();
  return { ok: true };
});

ipcMain.handle('type-barcode-to-active-window', async (_event, payload = {}) => {
  if (process.platform !== 'win32') {
    throw new Error('تایپ مستقیم سیستمی فقط در اپلیکیشن ویندوز پشتیبانی می‌شود.');
  }
  const cleanText = String(payload.text || '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 128);
  if (!cleanText) {
    throw new Error('متن بارکد خالی است.');
  }
  const suffix = ALLOWED_WEDGE_SUFFIXES.has(payload.suffix) ? payload.suffix : 'enter';
  const charDelayMs = Math.max(0, Math.min(40, Number(payload.charDelayMs ?? 4) || 0));
  const focusSayan = Boolean(payload.focusSayan);

  const proc = await ensureWinKeyWedgeHelper();
  const id = winKeyWedgeReqSeq++;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      winKeyWedgePending.delete(id);
      reject(new Error('مهلت ارسال کلید به پنجره ویندوز به پایان رسید.'));
    }, 8000);

    winKeyWedgePending.set(id, { resolve, reject, timer });
    try {
      proc.stdin.write(
        JSON.stringify({ id, text: cleanText, suffix, charDelayMs, focusSayan }) + '\n'
      );
    } catch (writeErr) {
      clearTimeout(timer);
      winKeyWedgePending.delete(id);
      reject(writeErr);
    }
  });
});

// 11. Native Windows/Desktop Isolated HTML Printer (fixes Chromium GDI double-rotation on A5 Landscape)
ipcMain.handle('print-html-document', async (_event, payload = {}) => {
  const {
    html = '',
    pageSize = 'A5',
    landscape = true,
    silent = false,
    title = 'چاپ سند'
  } = payload || {};

  if (!html || typeof html !== 'string') {
    return { success: false, error: 'Empty print HTML' };
  }

  let printWin = null;
  let tempHtmlPath = null;
  try {
    tempHtmlPath = path.join(os.tmpdir(), `dlkam-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
    fs.writeFileSync(tempHtmlPath, html, 'utf8');

    printWin = new BrowserWindow({
      show: false,
      width: landscape ? 920 : 820,
      height: landscape ? 660 : 1140,
      backgroundColor: '#ffffff',
      title: String(title || 'چاپ سند'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: false
      }
    });

    await printWin.loadFile(tempHtmlPath);

    // Wait briefly for web fonts & embedded images to settle
    await printWin.webContents.executeJavaScript(`
      (async () => {
        try {
          if (document.fonts && document.fonts.ready) {
            await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]);
          }
          const imgs = Array.from(document.querySelectorAll('img'));
          await Promise.race([
            Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; }))),
            new Promise(r => setTimeout(r, 1500))
          ]);
        } catch (_) {}
      })();
    `).catch(() => {});

    const normalizedPageSize =
      typeof pageSize === 'string' && ['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid'].includes(pageSize)
        ? pageSize
        : (pageSize && typeof pageSize === 'object' ? pageSize : 'A5');

    const printResult = await new Promise((resolve) => {
      try {
        printWin.webContents.print(
          {
            silent: Boolean(silent),
            printBackground: true,
            landscape: Boolean(landscape),
            pageSize: normalizedPageSize,
            margins: { marginType: 'none' },
            preferCSSPageSize: false
          },
          (success, failureReason) => {
            resolve({ success: Boolean(success), failureReason: failureReason || '' });
          }
        );
      } catch (printErr) {
        resolve({ success: false, failureReason: printErr?.message || String(printErr) });
      }
    });

    return printResult;
  } catch (err) {
    console.error('[Electron] print-html-document error:', err);
    return { success: false, error: err?.message || String(err) };
  } finally {
    try {
      if (printWin && !printWin.isDestroyed()) printWin.close();
    } catch (_) {}
    if (tempHtmlPath) {
      setTimeout(() => {
        try { if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath); } catch (_) {}
      }, 2000);
    }
  }
});

app.whenReady().then(() => {
  try {
    if (session && session.defaultSession) {
      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(true);
      });
      session.defaultSession.setPermissionCheckHandler(() => true);

      // Automatically save ALL Chromium downloads (<a download>, file-saver saveAs(), blob:, downloadURL)
      // directly into Downloads\Dlkam (or Downloads root for installers) without blocking prompts.
      session.defaultSession.on('will-download', (event, item) => {
        try {
          const suggested = sanitizeDownloadFileName(item.getFilename() || `delkam_download_${Date.now()}`);
          const isInstaller = isDesktopInstallerFileName(suggested);
          const targetDir = isInstaller ? ensureDownloadsDir() : ensureDlkamExportsDir();
          const savePath = getUniqueSavePath(targetDir, suggested, isInstaller);
          item.setSavePath(savePath);

          item.on('updated', (_ev, state) => {
            if (state === 'progressing' && !item.isPaused()) {
              const totalBytes = item.getTotalBytes();
              const loadedBytes = item.getReceivedBytes();
              const pct = totalBytes > 0 ? Math.min(99, Math.max(1, Math.round((loadedBytes / totalBytes) * 100))) : 50;
              try {
                if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                  mainWindow.webContents.send('download-progress', {
                    url: item.getURL(),
                    fileName: path.basename(savePath),
                    pct,
                    loadedBytes,
                    totalBytes
                  });
                }
              } catch (_) {}
            }
          });

          item.once('done', (_ev, state) => {
            try {
              if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send('download-completed', {
                  state,
                  filePath: savePath,
                  fileName: path.basename(savePath)
                });
              }
              if (state === 'completed' && isInstaller && isValidLocalFile(savePath, savePath)) {
                purgeOldInstallers(path.basename(savePath));
                openPathWithFallback(savePath).catch(() => {});
              }
            } catch (_) {}
          });
        } catch (dlErr) {
          console.error('[Electron] will-download handler error:', dlErr);
        }
      });
    }
  } catch (e) {
    console.warn('[Electron] Session handler setup warning:', e);
  }
  createWindow();
  createTray();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopWinKeyWedgeHelper();
  flushElectronSessionStorage();
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

