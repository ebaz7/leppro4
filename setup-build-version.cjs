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

function findHighestDiskInstallerVersion(platformType) {
  const isAndroid = platformType === 'android';
  let maxVer = null;
  for (const dir of downloadDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        const lower = f.toLowerCase();
        const isMatch = isAndroid
          ? lower.endsWith('.apk')
          : (lower.endsWith('.exe') || lower.endsWith('.msi'));
        if (!isMatch) continue;
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
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  let maxKnownVersion = (pkg.version || '1.0.0').trim();

  const updateMax = (cand) => {
    if (cand && compareSemVer(cand, maxKnownVersion) > 0) {
      maxKnownVersion = String(cand).trim().replace(/^v/i, '');
    }
  };

  // Check release-version.json
  if (fs.existsSync(releaseJsonPath)) {
    try {
      const rel = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf8'));
      updateMax(rel.version);
      updateMax(rel.desktopLatestVersion);
      updateMax(rel.androidLatestVersion);
    } catch (_) {}
  }

  // Check database.json / db.json
  for (const dbPath of dbPaths) {
    if (fs.existsSync(dbPath)) {
      try {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        updateMax(db?.settings?.systemVersion);
        updateMax(db?.settings?.desktopLatestVersion);
        updateMax(db?.settings?.androidLatestVersion);
      } catch (_) {}
    }
  }

  // Check actual installer files in downloads/ so git pull never resets the version backwards
  const diskDesktopVer = findHighestDiskInstallerVersion('desktop');
  const diskAndroidVer = findHighestDiskInstallerVersion('android');
  updateMax(diskDesktopVer);
  updateMax(diskAndroidVer);

  let targetVersion = maxKnownVersion;
  if (options.explicitVersion) {
    targetVersion = String(options.explicitVersion).trim().replace(/^v/i, '');
  } else if (options.bump) {
    targetVersion = bumpPatchVersion(maxKnownVersion);
  }

  const buildNumber = `b_${Date.now()}`;
  const timestamp = Date.now();
  let versionCode = versionToCode(targetVersion);

  // Ensure versionCode in build.gradle is strictly greater than any existing versionCode
  if (fs.existsSync(gradlePath)) {
    try {
      const gradleRaw = fs.readFileSync(gradlePath, 'utf8');
      const existingCodeMatch = gradleRaw.match(/versionCode\s+(\d+)/);
      if (existingCodeMatch && existingCodeMatch[1]) {
        const existingCode = parseInt(existingCodeMatch[1], 10) || 0;
        if (options.bump && versionCode <= existingCode) {
          versionCode = existingCode + 1;
        } else if (versionCode < existingCode) {
          versionCode = existingCode;
        }
      }
    } catch (_) {}
  }

  console.log(`\n==============================================================`);
  console.log(`📌 تنظیم نسخه یکپارچه سیستم روی: v${targetVersion} (کد بیلد اندروید: ${versionCode})`);
  console.log(`==============================================================`);

  // 1. Update package.json
  pkg.version = targetVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`   ✅ package.json -> v${targetVersion}`);

  // 2. Update src-tauri/tauri.conf.json
  if (fs.existsSync(tauriConfPath)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    if (!tauriConf.package) tauriConf.package = {};
    tauriConf.package.version = targetVersion;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
    console.log(`   ✅ src-tauri/tauri.conf.json -> v${targetVersion}`);
  }

  // 3. Update src-tauri/Cargo.toml
  if (fs.existsSync(cargoTomlPath)) {
    let cargoContent = fs.readFileSync(cargoTomlPath, 'utf8');
    cargoContent = cargoContent.replace(
      /^version\s*=\s*"[^"]*"/m,
      `version = "${targetVersion}"`
    );
    fs.writeFileSync(cargoTomlPath, cargoContent, 'utf8');
    console.log(`   ✅ src-tauri/Cargo.toml -> v${targetVersion}`);
  }

  // 4. Update android/app/build.gradle & sync google-services.json
  if (fs.existsSync(gradlePath)) {
    let gradleContent = fs.readFileSync(gradlePath, 'utf8');
    gradleContent = gradleContent.replace(
      /versionCode\s+\d+/,
      `versionCode ${versionCode}`
    );
    gradleContent = gradleContent.replace(
      /versionName\s+"[^"]*"/,
      `versionName "${targetVersion}"`
    );
    fs.writeFileSync(gradlePath, gradleContent, 'utf8');
    console.log(`   ✅ android/app/build.gradle -> versionName "${targetVersion}", versionCode ${versionCode}`);
  }

  const googleServicesPath = path.join(ROOT_DIR, 'android', 'app', 'google-services.json');
  if (fs.existsSync(googleServicesPath)) {
    try {
      const gsJson = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8'));
      if (gsJson && Array.isArray(gsJson.client) && gsJson.client.length > 0) {
        const hasMatch = gsJson.client.some(
          c => c && c.client_info && c.client_info.android_client_info && c.client_info.android_client_info.package_name === 'com.dikam.paymentorder'
        );
        if (!hasMatch) {
          const cloned = JSON.parse(JSON.stringify(gsJson.client[0]));
          if (!cloned.client_info) cloned.client_info = {};
          if (!cloned.client_info.android_client_info) cloned.client_info.android_client_info = {};
          cloned.client_info.android_client_info.package_name = 'com.dikam.paymentorder';
          gsJson.client.push(cloned);
          fs.writeFileSync(googleServicesPath, JSON.stringify(gsJson, null, 2) + '\n', 'utf8');
        }
      }
    } catch (_) {}
  }

  // 5. Update services/updateService.ts
  if (fs.existsSync(updateServicePath)) {
    try {
      let serviceContent = fs.readFileSync(updateServicePath, 'utf8');
      serviceContent = serviceContent.replace(/version:\s*['"][^'"]+['"]/, `version: '${targetVersion}'`);
      fs.writeFileSync(updateServicePath, serviceContent, 'utf8');
    } catch (_) {}
  }

  // 6. Write release-version.json (keeping desktopLatestVersion and androidLatestVersion accurate to what was actually built)
  let existingRelease = {};
  if (fs.existsSync(releaseJsonPath)) {
    try {
      existingRelease = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf8'));
    } catch (_) {}
  }

  const newDesktopLatest = options.platform === 'android'
    ? (diskDesktopVer || existingRelease.desktopLatestVersion || null)
    : targetVersion;
  const newAndroidLatest = options.platform === 'tauri'
    ? (diskAndroidVer || existingRelease.androidLatestVersion || null)
    : targetVersion;

  const releasePayload = {
    ...existingRelease,
    version: targetVersion,
    desktopLatestVersion: newDesktopLatest,
    androidLatestVersion: newAndroidLatest,
    buildNumber,
    versionCode,
    timestamp,
    publishedAt: new Date(timestamp).toISOString()
  };
  fs.writeFileSync(releaseJsonPath, JSON.stringify(releasePayload, null, 2) + '\n', 'utf8');

  // 7. Update database.json / db.json
  for (const dbPath of dbPaths) {
    if (fs.existsSync(dbPath)) {
      try {
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (db && typeof db === 'object') {
          if (!db.settings) db.settings = {};
          db.settings.systemVersion = targetVersion;
          if (newDesktopLatest) {
            db.settings.desktopLatestVersion = newDesktopLatest;
          }
          if (newAndroidLatest) {
            db.settings.androidLatestVersion = newAndroidLatest;
          }
          db.settings.systemBuildNumber = buildNumber;
          db.settings.systemUpdatePublishedAt = timestamp;
          fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        }
      } catch (_) {}
    }
  }

  return { version: targetVersion, versionCode, buildNumber, timestamp };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const bump = args.includes('--bump') || args.includes('-b');
  const explicitArg = args.find(a => !a.startsWith('-'));
  syncBuildVersion({ bump, explicitVersion: explicitArg });
}

module.exports = { syncBuildVersion };

