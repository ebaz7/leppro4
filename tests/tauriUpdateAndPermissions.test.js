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
