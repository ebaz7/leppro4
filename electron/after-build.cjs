/**
 * electron-builder afterAllArtifactBuild hook
 * Ensures every Electron Windows NSIS build (.exe) is automatically copied to
 * downloads/ and public/downloads/ so the live server, /api/version,
 * /api/desktop/updater.json, and /api/downloads/latest-desktop?runtime=electron
 * immediately serve the exact built installer.
 */

const fs = require('fs');
const path = require('path');

function copyElectronInstallersToDownloads(artifactPaths = []) {
  const ROOT_DIR = path.resolve(__dirname, '..');
  const DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads');
  const PUBLIC_DOWNLOADS_DIR = path.join(ROOT_DIR, 'public', 'downloads');
  const RELEASE_DIR = path.join(ROOT_DIR, 'release-electron');
  const PKG_PATH = path.join(ROOT_DIR, 'package.json');
  const RELEASE_JSON_PATH = path.join(ROOT_DIR, 'release-version.json');

  let pkgVersion = '1.0.29';
  try {
    if (fs.existsSync(PKG_PATH)) {
      const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
      if (pkg?.version) pkgVersion = String(pkg.version).trim();
    }
  } catch (_) {}

  const candidates = [];

  // 1. Check artifactPaths provided directly by electron-builder
  if (Array.isArray(artifactPaths)) {
    for (const p of artifactPaths) {
      if (
        p &&
        typeof p === 'string' &&
        p.toLowerCase().endsWith('.exe') &&
        !p.toLowerCase().includes('__uninstaller') &&
        fs.existsSync(p)
      ) {
        candidates.push(p);
      }
    }
  }

  // 2. Fallback scan inside release-electron/
  if (candidates.length === 0 && fs.existsSync(RELEASE_DIR)) {
    try {
      for (const f of fs.readdirSync(RELEASE_DIR)) {
        const lower = f.toLowerCase();
        if (lower.endsWith('.exe') && !lower.includes('uninstaller') && !lower.includes('blockmap')) {
          const full = path.join(RELEASE_DIR, f);
          if (fs.statSync(full).isFile()) {
            candidates.push(full);
          }
        }
      }
    } catch (_) {}
  }

  if (candidates.length === 0) {
    console.warn('[Electron AfterBuild] ⚠️ فایل نصبی .exe در خروجی electron-builder یافت نشد.');
    return [];
  }

  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const newestExe = candidates[0];
  const stat = fs.statSync(newestExe);

  [DOWNLOADS_DIR, PUBLIC_DOWNLOADS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  const versionedFileName = `dlkam-electron-setup-v${pkgVersion}.exe`;
  const targets = [
    path.join(DOWNLOADS_DIR, versionedFileName),
    path.join(DOWNLOADS_DIR, 'dlkam-electron-setup.exe'),
    path.join(PUBLIC_DOWNLOADS_DIR, 'dlkam-electron-setup.exe')
  ];

  // Clean older versioned Electron setup files from downloads/ so disk doesn't fill up with old builds
  try {
    for (const existing of fs.readdirSync(DOWNLOADS_DIR)) {
      const lower = existing.toLowerCase();
      if (
        /^dlkam-electron-setup-v[\d.]+\.exe$/i.test(lower) &&
        lower !== versionedFileName.toLowerCase()
      ) {
        try {
          fs.unlinkSync(path.join(DOWNLOADS_DIR, existing));
        } catch (_) {}
      }
    }
  } catch (_) {}

  for (const target of targets) {
    fs.copyFileSync(newestExe, target);
  }

  // Update release-version.json metadata so server reads exact latest Electron installer info immediately
  try {
    let relData = {};
    if (fs.existsSync(RELEASE_JSON_PATH)) {
      relData = JSON.parse(fs.readFileSync(RELEASE_JSON_PATH, 'utf8'));
    }
    const updatedRel = {
      ...relData,
      electronVersion: pkgVersion,
      electronLatestVersion: pkgVersion,
      electronInstallerFileName: versionedFileName,
      electronInstallerSize: stat.size,
      electronBuiltAt: new Date().toISOString()
    };
    fs.writeFileSync(RELEASE_JSON_PATH, JSON.stringify(updatedRel, null, 2) + '\n', 'utf8');
  } catch (_) {}

  console.log(`✅ [Electron AfterBuild] فایل نصبی الکترون (${(stat.size / (1024 * 1024)).toFixed(1)} MB) در پوشه downloads کپی شد:`);
  console.log(`   - downloads/${versionedFileName}`);
  console.log(`   - downloads/dlkam-electron-setup.exe`);
  console.log(`   - public/downloads/dlkam-electron-setup.exe`);

  return [];
}

module.exports = async function afterAllArtifactBuild(buildResult) {
  const artifacts = buildResult && Array.isArray(buildResult.artifactPaths) ? buildResult.artifactPaths : [];
  return copyElectronInstallersToDownloads(artifacts);
};

module.exports.copyElectronInstallersToDownloads = copyElectronInstallersToDownloads;
