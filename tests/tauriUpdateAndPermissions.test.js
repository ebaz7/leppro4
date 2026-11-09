import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('Tauri configuration enables withGlobalTauri and full notification allowlist', () => {
  const tauriConfPath = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));

  assert.equal(tauriConf.build.withGlobalTauri, true, 'tauri.conf.json must enable withGlobalTauri so window.__TAURI__ is available');
  assert.equal(tauriConf.tauri.allowlist.notification.all, true, 'tauri.conf.json must enable notification.all in allowlist');
});

test('Tauri main.rs exposes get_app_version and delete_local_file commands', () => {
  const mainRsPath = path.join(ROOT, 'src-tauri', 'src', 'main.rs');
  const mainRs = fs.readFileSync(mainRsPath, 'utf8');

  assert.ok(mainRs.includes('fn get_app_version('), 'main.rs must define get_app_version command');
  assert.ok(mainRs.includes('fn delete_local_file('), 'main.rs must define delete_local_file command');
  assert.ok(mainRs.includes('get_app_version,'), 'main.rs must register get_app_version in generate_handler');
  assert.ok(mainRs.includes('delete_local_file,'), 'main.rs must register delete_local_file in generate_handler');
});

test('updateService.ts detects Tauri version via @tauri-apps/api/app and suppresses already-installed updates', () => {
  const updateServicePath = path.join(ROOT, 'services', 'updateService.ts');
  const content = fs.readFileSync(updateServicePath, 'utf8');

  assert.ok(content.includes("import('@tauri-apps/api/app')"), 'getNativeClientVersion must query @tauri-apps/api/app getVersion()');
  assert.ok(content.includes("invoke<string>('get_app_version')"), 'getNativeClientVersion must fallback to get_app_version invoke');
  assert.ok(content.includes('markPlatformUpdateInstalled'), 'updateService must define markPlatformUpdateInstalled');
  assert.ok(content.includes('dlkam_installed_version_'), 'updateService must persist installed version per runtime in localStorage');
  assert.ok(content.includes('alreadyDownloadedAndLaunched = await isDesktopUpdateFileReady(exeFileName)'), 'checkServerUpdate must auto-suppress sticky banner when installer was already downloaded and executed');
});

test('FirstLaunchPermissionsModal prompts and activates permissions across Tauri, Android, and Electron', () => {
  const modalPath = path.join(ROOT, 'components', 'FirstLaunchPermissionsModal.tsx');
  assert.ok(fs.existsSync(modalPath), 'FirstLaunchPermissionsModal.tsx must exist');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  assert.ok(modalContent.includes("import('@tauri-apps/api/notification')"), 'Modal must request Tauri notification permission');
  assert.ok(modalContent.includes('requestNotificationPermissionNative'), 'Modal must request Android native notification permission');
  assert.ok(modalContent.includes('requestNativePermissions'), 'Modal must request Electron native permissions');
  assert.ok(modalContent.includes('dlkam_first_install_permissions_v2'), 'Modal must persist first-install permission onboarding state');
});

test('Windows Desktop auto-logs out on app close/relaunch and supports multi-account username selector with optional password save', async () => {
  const authServicePath = path.join(ROOT, 'services', 'authService.ts');
  const authContent = fs.readFileSync(authServicePath, 'utf8');
  assert.ok(authContent.includes('dlkam_desktop_session_active'), 'authService.ts must track active desktop session in sessionStorage');
  assert.ok(authContent.includes('isWindowsDesktopApp()'), 'authService.ts must detect Windows Desktop (Tauri/Electron) for auto-logout on new launch');
  assert.ok(authContent.includes('export const getSavedAccounts'), 'authService.ts must export getSavedAccounts');
  assert.ok(authContent.includes('export const saveAccountOnLogin'), 'authService.ts must export saveAccountOnLogin');
  assert.ok(authContent.includes('export const removeSavedAccount'), 'authService.ts must export removeSavedAccount');

  // Verify Tauri and Electron clear session on window close
  const mainRs = fs.readFileSync(path.join(ROOT, 'src-tauri', 'src', 'main.rs'), 'utf8');
  assert.ok(mainRs.includes('WindowEvent::CloseRequested'), 'Tauri main.rs must clear active session on CloseRequested');
  assert.ok(mainRs.includes('dlkam_desktop_session_active'), 'Tauri main.rs must remove dlkam_desktop_session_active on close');

  const electronMain = fs.readFileSync(path.join(ROOT, 'electron', 'main.cjs'), 'utf8');
  assert.ok(electronMain.includes('desktop-auto-logout'), 'Electron main.cjs must notify renderer on window close');
  assert.ok(electronMain.includes('dlkam_desktop_session_active'), 'Electron main.cjs must clear active session on window close');

  // Verify Login.tsx renders saved accounts list and respects per-user rememberPassword setting
  const loginTsx = fs.readFileSync(path.join(ROOT, 'components', 'Login.tsx'), 'utf8');
  assert.ok(loginTsx.includes('getSavedAccounts'), 'Login.tsx must load saved accounts list');
  assert.ok(loginTsx.includes('saveAccountOnLogin'), 'Login.tsx must save account entry on login');
  assert.ok(loginTsx.includes('لیست کاربران'), 'Login.tsx must display saved usernames selector');
  assert.ok(loginTsx.includes('ذخیره رمز عبور برای این نام کاربری'), 'Login.tsx must allow optional password saving per username');
});

test('WebView2 and Desktop CPU optimization eliminates 60fps compositor loops, enables EcoQoS, and avoids redundant background polling', () => {
  const mainRs = fs.readFileSync(path.join(ROOT, 'src-tauri', 'src', 'main.rs'), 'utf8');
  assert.ok(mainRs.includes('UseEcoQoSForBackgroundProcess'), 'Tauri main.rs must enable Windows EcoQoS efficiency mode for WebView2 background processes');
  assert.ok(!mainRs.includes('--enable-gpu-rasterization'), 'Tauri main.rs must not force CPU-heavy GPU rasterization on integrated graphics');
  assert.ok(mainRs.includes('WindowEvent::Destroyed'), 'Tauri main.rs must cleanly exit process on WindowEvent::Destroyed to prevent zombie WebView2 processes');

  const electronMain = fs.readFileSync(path.join(ROOT, 'electron', 'main.cjs'), 'utf8');
  assert.ok(electronMain.includes('UseEcoQoSForBackgroundProcess'), 'Electron main.cjs must enable UseEcoQoSForBackgroundProcess');
  assert.ok(electronMain.includes('backgroundThrottling: true'), 'Electron main.cjs must enable backgroundThrottling');

  const indexCss = fs.readFileSync(path.join(ROOT, 'index.css'), 'utf8');
  assert.ok(indexCss.includes('animation-iteration-count: 3 !important'), 'index.css must cap decorative infinite animations to prevent perpetual 60fps DWM/WebView2 repaints');
  assert.ok(indexCss.includes('html.window-hidden *'), 'index.css must pause animations when window is hidden/minimized');

  const graphicsEngine = fs.readFileSync(path.join(ROOT, 'services', 'graphicsEngine.ts'), 'utf8');
  assert.ok(graphicsEngine.includes('this.enableTurboMode(true)'), 'graphicsEngine.ts must enable perf-turbo mode');
  assert.ok(graphicsEngine.includes('window-unfocused'), 'graphicsEngine.ts must track window focus/visibility to pause idle animations');

  const sseClient = fs.readFileSync(path.join(ROOT, 'services', 'sseNotificationClient.ts'), 'utf8');
  assert.ok(sseClient.includes('eventSourceInstance.readyState === EventSource.OPEN'), 'sseNotificationClient.ts must skip redundant HTTP polling when SSE stream is open');
});


