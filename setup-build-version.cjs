/**
 * Synchronizes or bumps the application version across:
 *   - package.json
 *   - src-tauri/tauri.conf.json
 *   - src-tauri/Cargo.toml
 *   - android/app/build.gradle (versionName & strictly-increasing versionCode)
 *   - services/updateService.ts (CURRENT_CLIENT_BUILD.version)
 *   - release-version.json (read dynamically by running server.js)
 *   - database.json & db.json (systemVersion, desktopLatestVersion, androidLatestVersion)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const pkgPath = path.join(ROOT_DIR, 'package.json');
const tauriConfPath = path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml');
const gradlePath = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');
const updateServicePath = path.join(ROOT_DIR, 'services', 'updateService.ts');
const releaseJsonPath = path.join(ROOT_DIR, 'release-version.json');
const dbPaths = [path.join(ROOT_DIR, 'database.json'), path.join(ROOT_DIR, 'db.json')];
const downloadDirs = [
  path.join(ROOT_DIR, 'downloads'),
  path.join(ROOT_DIR, 'public', 'downloads'),
  path.join(ROOT_DIR, 'release-electron')
];

function compareSemVer(v1, v2) {
  if (!v1 && !v2) return 0;
  if (v1 && !v2) return 1;
  if (!v1 && v2) return -1;
  const p1 = String(v1).replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = String(v2).replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function extractVersionFromFileName(fileName) {
  const match = String(fileName || '').match(/(?:v|_|-|\s)(\d+\.\d+\.\d+)/i) || String(fileName || '').match(/(\d+\.\d+\.\d+)/i);
  return match ? match[1] : null;
}

function findHighestDiskInstallerVersion(platformType, runtime = null) {
  const isAndroid = platformType === 'android';
  const isElectron = platformType === 'electron' || runtime === 'electron';
  const isTauri = platformType === 'tauri' || runtime === 'tauri';
  let maxVer = null;

  for (const dir of downloadDirs) {
    if (!fs.existsSync(dir)) continue;
    const isElectronDir = dir.includes('release-electron');
    try {
      for (const f of fs.readdirSync(dir)) {
        const lower = f.toLowerCase();
        if (isAndroid) {
          if (!lower.endsWith('.apk')) continue;
        } else {
          const isExe = lower.endsWith('.exe');
          const isMsi = lower.endsWith('.msi');
          if (!isExe && !isMsi) continue;

          const isElectronFile = isElectronDir || f.includes('سامانه دلکام') || lower.includes('electron') || (lower.includes('setup') && !lower.startsWith('dlkam-desktop-') && !lower.startsWith('sayan-desktop-'));
          const isTauriFile = !isElectronDir && ((lower.startsWith('dlkam-desktop-') || lower.startsWith('sayan-desktop-') || isMsi) && !f.includes('سامانه دلکام'));

          if (isElectron && (isTauriFile || !isElectronFile)) continue;
          if (isTauri && (isElectronFile || !isTauriFile)) continue;
        }

        const ver = extractVersionFromFileName(f);
        if (ver && (!maxVer || compareSemVer(ver, maxVer) > 0)) {
          maxVer = ver;
        }
      }
    } catch (_) {}
  }
  return maxVer;
}

function bumpPatchVersion(ver) {
  const clean = String(ver || '1.0.0').trim().replace(/^v/i, '');
  const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function versionToCode(ver) {
  const clean = String(ver || '1.0.0').trim().replace(/^v/i, '');
  const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
  const major = parts[0] || 1;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  return major * 10000 + minor * 100 + patch;
}

function syncBuildVersion(options = {}) {
  const targetPlatform = String(options.platform || 'all').toLowerCase();
  const timestamp = Date.now();

  let existingRelease = {};
  if (fs.existsSync(releaseJsonPath)) {
    try {
      existingRelease = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf8'));
    } catch (_) {}
  }

  // 1. Determine Current Known Versions per platform independently
  // A. Android
  let androidCurrent = '1.0.29';
  if (fs.existsSync(gradlePath)) {
    try {
      const gradleContent = fs.readFileSync(gradlePath, 'utf8');
      const m = gradleContent.match(/versionName\s+["'](\d+\.\d+\.\d+)["']/);
      if (m && m[1]) androidCurrent = m[1];
    } catch (_) {}
  }
  if (existingRelease.androidVersion && compareSemVer(existingRelease.androidVersion, androidCurrent) > 0) {
    androidCurrent = existingRelease.androidVersion;
  }
  const diskAndroidVer = findHighestDiskInstallerVersion('android');
  if (diskAndroidVer && compareSemVer(diskAndroidVer, androidCurrent) > 0) {
    androidCurrent = diskAndroidVer;
  }

  // B. Electron
  let electronCurrent = '1.0.29';
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) electronCurrent = pkg.version;
    } catch (_) {}
  }
  if (existingRelease.electronVersion && compareSemVer(existingRelease.electronVersion, electronCurrent) > 0) {
    electronCurrent = existingRelease.electronVersion;
  }
  const diskElectronVer = findHighestDiskInstallerVersion('electron', 'electron');
  if (diskElectronVer && compareSemVer(diskElectronVer, electronCurrent) > 0) {
    electronCurrent = diskElectronVer;
  }

  // C. Tauri
  let tauriCurrent = '1.0.29';
  if (fs.existsSync(tauriConfPath)) {
    try {
      const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
      if (conf?.package?.version) tauriCurrent = conf.package.version;
    } catch (_) {}
  }
  if (existingRelease.tauriVersion && compareSemVer(existingRelease.tauriVersion, tauriCurrent) > 0) {
    tauriCurrent = existingRelease.tauriVersion;
  }
  const diskTauriVer = findHighestDiskInstallerVersion('tauri', 'tauri');
  if (diskTauriVer && compareSemVer(diskTauriVer, tauriCurrent) > 0) {
    tauriCurrent = diskTauriVer;
  }

  // D. Web
  let webCurrent = existingRelease.webVersion || existingRelease.version || '1.0.29';

  console.log(`\n==============================================================`);
  console.log(`📌 وضعیت کنونی نسخه‌ها به تفکیک پلتفرم:`);
  console.log(`   📱 اندروید (Android):    v${androidCurrent}`);
  console.log(`   🖥️ ویندوز (Electron):    v${electronCurrent}`);
  console.log(`   ⚡ ویندوز (Tauri):       v${tauriCurrent}`);
  console.log(`   🌐 وب (Web / PWA):      v${webCurrent}`);
  console.log(`==============================================================`);

  let newAndroidVer = androidCurrent;
  let newElectronVer = electronCurrent;
  let newTauriVer = tauriCurrent;
  let newWebVer = webCurrent;
  let newAndroidCode = versionToCode(androidCurrent);

  // Apply bump or explicit version ONLY to the targeted platform
  if (targetPlatform === 'android') {
    newAndroidVer = options.explicitVersion ? String(options.explicitVersion).trim().replace(/^v/i, '') : (options.bump ? bumpPatchVersion(androidCurrent) : androidCurrent);
    newAndroidCode = versionToCode(newAndroidVer);
    if (fs.existsSync(gradlePath)) {
      try {
        const raw = fs.readFileSync(gradlePath, 'utf8');
        const m = raw.match(/versionCode\s+(\d+)/);
        if (m && m[1]) {
          const oldCode = parseInt(m[1], 10) || 0;
          if (options.bump && newAndroidCode <= oldCode) newAndroidCode = oldCode + 1;
        }
      } catch (_) {}
    }
  } else if (targetPlatform === 'electron') {
    newElectronVer = options.explicitVersion ? String(options.explicitVersion).trim().replace(/^v/i, '') : (options.bump ? bumpPatchVersion(electronCurrent) : electronCurrent);
  } else if (targetPlatform === 'tauri') {
    newTauriVer = options.explicitVersion ? String(options.explicitVersion).trim().replace(/^v/i, '') : (options.bump ? bumpPatchVersion(tauriCurrent) : tauriCurrent);
  } else if (targetPlatform === 'web') {
    newWebVer = options.explicitVersion ? String(options.explicitVersion).trim().replace(/^v/i, '') : (options.bump ? bumpPatchVersion(webCurrent) : webCurrent);
  } else if (targetPlatform === 'all') {
    // Legacy / full-sync bump
    const baseVer = options.explicitVersion ? String(options.explicitVersion).trim().replace(/^v/i, '') : (options.bump ? bumpPatchVersion(webCurrent) : webCurrent);
    newAndroidVer = baseVer;
    newElectronVer = baseVer;
    newTauriVer = baseVer;
    newWebVer = baseVer;
    newAndroidCode = versionToCode(baseVer);
  }

  // --- WRITE FILES ACCORDING TO TARGET PLATFORM ONLY ---

  // 1. Android: android/app/build.gradle
  if (targetPlatform === 'android' || targetPlatform === 'all') {
    if (fs.existsSync(gradlePath)) {
      let content = fs.readFileSync(gradlePath, 'utf8');
      content = content.replace(/versionCode\s+\d+/, `versionCode ${newAndroidCode}`);
      content = content.replace(/versionName\s+"[^"]*"/, `versionName "${newAndroidVer}"`);
      fs.writeFileSync(gradlePath, content, 'utf8');
      console.log(`   ✅ android/app/build.gradle -> versionName "${newAndroidVer}", versionCode ${newAndroidCode}`);
    }
  }

  // 2. Electron: package.json (used by electron-builder)
  if (targetPlatform === 'electron' || targetPlatform === 'all') {
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkg.version = newElectronVer;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      console.log(`   ✅ package.json (Electron) -> v${newElectronVer}`);
    }
  }

  // 3. Tauri: src-tauri/tauri.conf.json & src-tauri/Cargo.toml
  if (targetPlatform === 'tauri' || targetPlatform === 'all') {
    if (fs.existsSync(tauriConfPath)) {
      const conf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
      if (!conf.package) conf.package = {};
      conf.package.version = newTauriVer;
      fs.writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2) + '\n', 'utf8');
      console.log(`   ✅ src-tauri/tauri.conf.json (Tauri) -> v${newTauriVer}`);
    }
    if (fs.existsSync(cargoTomlPath)) {
      let cargo = fs.readFileSync(cargoTomlPath, 'utf8');
      cargo = cargo.replace(/^version\s*=\s*"[^"]*"/m, `version = "${newTauriVer}"`);
      fs.writeFileSync(cargoTomlPath, cargo, 'utf8');
      console.log(`   ✅ src-tauri/Cargo.toml (Tauri) -> v${newTauriVer}`);
    }
  }

  // 4. Web: services/updateService.ts
  if (targetPlatform === 'web' || targetPlatform === 'all') {
    if (fs.existsSync(updateServicePath)) {
      try {
        let sc = fs.readFileSync(updateServicePath, 'utf8');
        sc = sc.replace(/version:\s*['"][^'"]+['"]/, `version: '${newWebVer}'`);
        fs.writeFileSync(updateServicePath, sc, 'utf8');
        console.log(`   ✅ services/updateService.ts (Web) -> v${newWebVer}`);
      } catch (_) {}
    }
  }

  // 5. Update release-version.json with isolated per-platform fields
  const releasePayload = {
    ...existingRelease,
    webVersion: newWebVer,
    electronVersion: newElectronVer,
    electronLatestVersion: newElectronVer,
    tauriVersion: newTauriVer,
    tauriLatestVersion: newTauriVer,
    androidVersion: newAndroidVer,
    androidLatestVersion: newAndroidVer,
    androidVersionCode: newAndroidCode,
    version: newWebVer, // Backwards-compatible fallback for web clients
    desktopLatestVersion: targetPlatform === 'electron' ? newElectronVer : (targetPlatform === 'tauri' ? newTauriVer : (existingRelease.desktopLatestVersion || newElectronVer)),
    buildNumber: `b_${targetPlatform}_${timestamp}`,
    timestamp,
    publishedAt: new Date(timestamp).toISOString()
  };
  fs.writeFileSync(releaseJsonPath, JSON.stringify(releasePayload, null, 2) + '\n', 'utf8');
  console.log(`   ✅ release-version.json به‌روزرسانی شد.`);

  // 6. Update database.json / db.json without polluting other platforms
  for (const dbPath of dbPaths) {
    if (fs.existsSync(dbPath)) {
      try {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (db && typeof db === 'object') {
          if (!db.settings) db.settings = {};
          if (targetPlatform === 'android' || targetPlatform === 'all') {
            db.settings.androidLatestVersion = newAndroidVer;
            db.settings.androidVersion = newAndroidVer;
            db.settings.androidVersionCode = newAndroidCode;
          }
          if (targetPlatform === 'electron' || targetPlatform === 'all') {
            db.settings.electronLatestVersion = newElectronVer;
            db.settings.electronVersion = newElectronVer;
            db.settings.desktopLatestVersion = newElectronVer;
          }
          if (targetPlatform === 'tauri' || targetPlatform === 'all') {
            db.settings.tauriLatestVersion = newTauriVer;
            db.settings.tauriVersion = newTauriVer;
            db.settings.desktopLatestVersion = newTauriVer;
          }
          if (targetPlatform === 'web' || targetPlatform === 'all') {
            db.settings.webVersion = newWebVer;
            db.settings.systemVersion = newWebVer;
            db.settings.systemBuildNumber = `b_web_${timestamp}`;
            db.settings.systemUpdatePublishedAt = timestamp;
          }
          fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        }
      } catch (_) {}
    }
  }

  const selectedTargetVer = targetPlatform === 'android' ? newAndroidVer : (targetPlatform === 'electron' ? newElectronVer : (targetPlatform === 'tauri' ? newTauriVer : newWebVer));
  return { version: selectedTargetVer, platform: targetPlatform, versionCode: newAndroidCode, timestamp };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const bump = args.includes('--bump') || args.includes('-b');
  const platformIdx = args.findIndex(a => a === '--platform' || a === '-p');
  const platform = platformIdx !== -1 ? args[platformIdx + 1] : null;
  const explicitArg = args.find(a => !a.startsWith('-') && a !== platform);
  syncBuildVersion({ bump, explicitVersion: explicitArg, platform });
}

module.exports = { syncBuildVersion, findHighestDiskInstallerVersion, compareSemVer };


