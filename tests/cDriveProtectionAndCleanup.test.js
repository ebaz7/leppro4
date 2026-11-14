import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('free-c-drive.ps1 and free-c-drive.bat stay strictly safe and 7-bit ASCII', () => {
  const ps1Path = path.join(ROOT, 'scripts', 'free-c-drive.ps1');
  const batPath = path.join(ROOT, 'free-c-drive.bat');

  assert.ok(fs.existsSync(ps1Path), 'scripts/free-c-drive.ps1 must exist');
  assert.ok(fs.existsSync(batPath), 'free-c-drive.bat must exist');

  const ps1 = fs.readFileSync(ps1Path, 'utf8');
  const bat = fs.readFileSync(batPath, 'utf8');

  assert.ok(!/[^\x00-\x7F]/.test(ps1), 'free-c-drive.ps1 must remain strictly 7-bit ASCII for Windows PowerShell 5.1 safety');
  assert.ok(bat.includes('scripts\\free-c-drive.ps1'), 'free-c-drive.bat must launch scripts\\free-c-drive.ps1');

  // Verify disposable C:\ targets covered
  assert.ok(ps1.includes('C:\\Windows\\Temp'), 'Cleans C:\\Windows\\Temp');
  assert.ok(ps1.includes('AppData\\Local\\Temp'), 'Cleans user AppData\\Local\\Temp');
  assert.ok(ps1.includes('.gradle\\caches'), 'Cleans Gradle caches');
  assert.ok(ps1.includes('.cargo\\registry\\cache'), 'Cleans Cargo registry cache');
  assert.ok(ps1.includes('DlkamFiles'), 'Cleans older installers inside DlkamFiles');
  assert.ok(ps1.includes('Remove-OldMatchingFiles'), 'Keeps newest installer via Remove-OldMatchingFiles');
  assert.ok(ps1.includes('KeepNewest = 1'), 'Keeps at least the newest installer');
  assert.ok(ps1.includes('GRADLE_USER_HOME'), 'Redirects GRADLE_USER_HOME onto InstallDir');
  assert.ok(ps1.includes('ELECTRON_CACHE'), 'Redirects ELECTRON_CACHE onto InstallDir');
  assert.ok(ps1.includes('docker builder prune -f'), 'Prunes Docker builder cache safely without deleting ONLYOFFICE container');

  // Verify dangerous user/database deletions NEVER appear as deletion targets
  const deleteLines = ps1
    .split('\n')
    .filter((l) => /Clear-DirContents\s+-TargetPath|Remove-Item|Remove-OldMatchingFiles\s+-DirectoryPath/i.test(l) && !/^\s*function\s+/i.test(l))
    .join('\n');
  assert.ok(!/pgdata/i.test(deleteLines), 'Never wipes pgdata');
  assert.ok(!/wauth/i.test(deleteLines), 'Never wipes wauth');
  assert.ok(!/database\.json/i.test(deleteLines), 'Never touches database.json');
  assert.ok(!/\.cargo\\bin/i.test(deleteLines), 'Never touches installed .cargo\\bin');
  assert.ok(!/Local Storage/i.test(deleteLines), 'Never clears WebView2 Local Storage');
  assert.ok(!/IndexedDB/i.test(deleteLines), 'Never clears WebView2 IndexedDB');
  assert.ok(!/Documents/i.test(deleteLines), 'Never touches Documents');
});

test('manager.bat, build-android.js, setup-desktop-icons.cjs, and electron-builder.json protect C:\\ drive', () => {
  const managerBat = fs.readFileSync(path.join(ROOT, 'manager.bat'), 'utf8');
  assert.ok(managerBat.includes('set "GRADLE_USER_HOME=%cd%\\.gradle_home"'), 'manager.bat redirects GRADLE_USER_HOME');
  assert.ok(managerBat.includes('set "ANDROID_USER_HOME=%cd%\\.android_home"'), 'manager.bat redirects ANDROID_USER_HOME');
  assert.ok(managerBat.includes('set "ELECTRON_CACHE=%cd%\\.electron_cache"'), 'manager.bat redirects ELECTRON_CACHE');
  assert.ok(managerBat.includes('set "ELECTRON_BUILDER_CACHE=%cd%\\.electron_builder_cache"'), 'manager.bat redirects ELECTRON_BUILDER_CACHE');
  assert.ok(managerBat.includes('git rm -r --cached .gradle_home'), 'manager.bat keeps .gradle_home out of git resets');
  assert.ok(managerBat.includes(':CLEAN_C'), 'manager.bat exposes Option 7 for C:\\ cleanup');

  const buildAndroid = fs.readFileSync(path.join(ROOT, 'build-android.js'), 'utf8');
  assert.ok(buildAndroid.includes("path.join(__dirname, '.gradle_home')"), 'build-android.js redirects GRADLE_USER_HOME');
  assert.ok(buildAndroid.includes("path.join(__dirname, '.android_home')"), 'build-android.js redirects ANDROID_USER_HOME');

  const setupIcons = fs.readFileSync(path.join(ROOT, 'setup-desktop-icons.cjs'), 'utf8');
  assert.ok(setupIcons.includes('ELECTRON_CACHE:'), 'setup-desktop-icons.cjs redirects ELECTRON_CACHE');
  assert.ok(setupIcons.includes('ELECTRON_BUILDER_CACHE:'), 'setup-desktop-icons.cjs redirects ELECTRON_BUILDER_CACHE');
  assert.ok(setupIcons.includes('WIX_TEMP:'), 'setup-desktop-icons.cjs redirects WIX_TEMP');

  const electronBuilder = JSON.parse(fs.readFileSync(path.join(ROOT, 'electron-builder.json'), 'utf8'));
  assert.equal(electronBuilder.nsis.allowToChangeInstallationDirectory, true, 'electron-builder allows user to choose D:\\ drive');
});

test('Tauri and Electron auto-updaters purge older installers while keeping current file', () => {
  const mainRs = fs.readFileSync(path.join(ROOT, 'src-tauri', 'src', 'main.rs'), 'utf8');
  assert.ok(mainRs.includes('fn cleanup_old_desktop_installers('), 'main.rs defines cleanup_old_desktop_installers');
  assert.ok(mainRs.includes('cleanup_old_desktop_installers(&dir, &safe_name);'), 'main.rs calls cleanup after writing new installer');
  assert.ok(mainRs.includes('lower != keep_lower'), 'main.rs never deletes the newly saved installer');

  const electronMain = fs.readFileSync(path.join(ROOT, 'electron', 'main.cjs'), 'utf8');
  assert.ok(electronMain.includes('lower !== keepLower'), 'electron/main.cjs keeps newly saved installer while removing older Delkam installers');
  assert.ok(electronMain.includes('dlkam-desktop|dlkam-electron|sayan-desktop'), 'electron/main.cjs only deletes Delkam/Sayan setup executables');
});
