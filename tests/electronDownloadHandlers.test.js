import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

test('Electron main & preload expose streaming updater, will-download Downloads saver, and PE/size validation', () => {
  const mainSrc = fs.readFileSync(path.join(ROOT, 'electron', 'main.cjs'), 'utf8');
  const preloadSrc = fs.readFileSync(path.join(ROOT, 'electron', 'preload.cjs'), 'utf8');

  assert.ok(mainSrc.includes("session.defaultSession.on('will-download'"), 'main.cjs must register will-download handler');
  assert.ok(mainSrc.includes('item.setSavePath(savePath)'), 'will-download must automatically save into Downloads without prompt');
  assert.ok(mainSrc.includes("app.getPath('downloads')"), 'main.cjs must resolve Windows Downloads folder');
  assert.ok(mainSrc.includes("ipcMain.handle('download-and-save-file'"), 'main.cjs must provide streaming download-and-save-file IPC');
  assert.ok(mainSrc.includes("ipcMain.handle('save-local-file'"), 'main.cjs must provide save-local-file IPC');
  assert.ok(mainSrc.includes('header[0] !== 0x4D || header[1] !== 0x5A'), 'main.cjs must verify MZ executable magic bytes for .exe installers');
  assert.ok(mainSrc.includes('mainWindow.webContents.downloadURL(url)'), 'setWindowOpenHandler must route download URLs to downloadURL');

  assert.ok(preloadSrc.includes('downloadAndSaveFile:'), 'preload must expose downloadAndSaveFile');
  assert.ok(preloadSrc.includes('saveLocalFile:'), 'preload must expose saveLocalFile');
  assert.ok(preloadSrc.includes('onDownloadProgress:'), 'preload must expose onDownloadProgress');
  assert.ok(preloadSrc.includes('onDownloadCompleted:'), 'preload must expose onDownloadCompleted');
});

test('fileService routes Electron saves through window.electronAPI instead of Tauri invoke', () => {
  const fileServiceSrc = fs.readFileSync(path.join(ROOT, 'services', 'fileService.ts'), 'utf8');
  assert.ok(fileServiceSrc.includes('isElectronDesktop()'), 'fileService must explicitly check isElectronDesktop()');
  assert.ok(fileServiceSrc.includes('isTauriDesktopOnly()'), 'fileService must restrict Tauri invoke to isTauriDesktopOnly()');
  assert.ok(fileServiceSrc.includes('electronBridge?.saveLocalFile'), 'fileService must call electronBridge.saveLocalFile');
  assert.ok(fileServiceSrc.includes('electronBridge?.downloadAndSaveFile'), 'fileService must support electronBridge.downloadAndSaveFile');
});

test('Settings and updateService use getEffectiveApiUrl and real downloads without fake simulation', () => {
  const settingsSrc = fs.readFileSync(path.join(ROOT, 'components', 'Settings.tsx'), 'utf8');
  const updateSvcSrc = fs.readFileSync(path.join(ROOT, 'services', 'updateService.ts'), 'utf8');

  assert.ok(!settingsSrc.includes('Realistic progressive download simulation'), 'Settings must not contain fake setInterval download simulation');
  assert.ok(!settingsSrc.includes('${window.location.origin}/api/desktop/updater.json'), 'Settings must not use file:// window.location.origin for updater.json');
  assert.ok(settingsSrc.includes("getEffectiveApiUrl(`/api/desktop/updater.json?runtime=${runtime}`)"), 'Settings must resolve updater.json via getEffectiveApiUrl');
  assert.ok(updateSvcSrc.includes('electronBridge?.downloadAndSaveFile'), 'updateService must prefer native streaming downloadAndSaveFile for Electron');
});

test('Atomic build swaps staging directory into dist without deleting live dist during compilation', async () => {
  const os = await import('os');
  const { swapStagingIntoDist } = await import('../scripts/atomic-build.mjs');
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'delkam-atomic-build-'));
  try {
    const liveDist = path.join(tmpBase, 'dist');
    const staging = path.join(tmpBase, 'dist-staging');
    fs.mkdirSync(liveDist, { recursive: true });
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(liveDist, 'index.html'), 'old-version', 'utf8');
    fs.writeFileSync(path.join(staging, 'index.html'), 'new-version', 'utf8');

    const res = swapStagingIntoDist(staging, liveDist);
    assert.ok(['atomic-rename', 'copy-fallback'].includes(res.mode));
    assert.equal(fs.readFileSync(path.join(liveDist, 'index.html'), 'utf8'), 'new-version');
    assert.equal(fs.existsSync(staging), false);
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('server.js never runs Vite dev middleware in NODE_ENV=production and checks dist/index.html dynamically', () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(
    serverSrc.includes("(!process.env.NODE_ENV && checkIsDistOutdated())"),
    'isExplicitDev must not trigger checkIsDistOutdated when NODE_ENV=production'
  );
  assert.ok(
    serverSrc.includes("const indexPath = path.join(DIST_DIR, 'index.html');\n        if (fs.existsSync(indexPath))"),
    'Production server must check dist/index.html dynamically per request'
  );
});

