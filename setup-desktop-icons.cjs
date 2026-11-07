/**
 * Unified Desktop Icons & Tauri Release Builder
 * - When called without `--release`: generates all icons for Android, Tauri, and Web (`generateAllIcons()`).
 * - When called with `--release` (via `npm run release:tauri` or `build-desktop.bat`):
 *   automatically bumps/sets the version, generates all icons preserving background/transparency,
 *   runs `npx tauri build`, and copies the resulting `.msi` / `.exe` installers into `downloads/` and `public/downloads/`.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { generateAllIcons } = require('./setup-assets.cjs');
const { syncBuildVersion } = require('./setup-build-version.cjs');

const ROOT_DIR = __dirname;
const DOWNLOADS_DIR = path.join(ROOT_DIR, 'downloads');
const PUBLIC_DOWNLOADS_DIR = path.join(ROOT_DIR, 'public', 'downloads');

function findBuiltFiles(dir, extList, result = []) {
  if (!fs.existsSync(dir)) return result;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findBuiltFiles(fullPath, extList, result);
    } else if (extList.some(ext => entry.name.toLowerCase().endsWith(ext))) {
      result.push(fullPath);
    }
  }
  return result;
}

async function buildAndPublishTauri() {
  console.log('====================================================================');
  console.log('🚀 شروع فرآیند خودکار ساخت و انتشار نسخه دسکتاپ (Tauri)');
  console.log('====================================================================');

  const args = process.argv.slice(2).filter(a => a !== '--release');
  const noBump = args.includes('--no-bump') || args.includes('--same-version');
  const explicitVersion = args.find(a => !a.startsWith('-'));

  // 1. Sync / Bump Version
  const verInfo = syncBuildVersion({
    bump: !noBump && !explicitVersion,
    explicitVersion,
    platform: 'tauri'
  });
  console.log(`✅ نسخه جدید دسکتاپ ثبت شد: v${verInfo.version}`);

  // 2. Generate Icons from app-icon preserving background / transparency & purge cached Tauri .exe/.rc
  const { purgeTauriIconBuildCache, refreshWindowsIconCache } = require('./setup-assets.cjs');
  await generateAllIcons();
  purgeTauriIconBuildCache();

  // 3. Prepare local temp directory on project drive (e.g. D:\PaymentSystem\.temp) & clean old C:\ Temp build artifacts
  const localTempDir = path.join(ROOT_DIR, '.temp');
  if (!fs.existsSync(localTempDir)) {
    fs.mkdirSync(localTempDir, { recursive: true });
  }

  // Safely clean stale compiler temp directories in system TEMP (e.g. C:\Users\...\AppData\Local\Temp) to free C: drive space for pagefile
  const sysTemp = process.env.TEMP || process.env.TMP;
  if (sysTemp && fs.existsSync(sysTemp) && sysTemp !== localTempDir) {
    try {
      for (const entry of fs.readdirSync(sysTemp)) {
        if (/^(rustc|cargo|tauri|wix|nsis|vite|npm-|v8-compile-cache)/i.test(entry)) {
          try {
            fs.rmSync(path.join(sysTemp, entry), { recursive: true, force: true });
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // Ensure memory-safe Cargo config on Windows so linking & LLVM never run out of stack/memory
  const cargoConfigDir = path.join(ROOT_DIR, 'src-tauri', '.cargo');
  if (!fs.existsSync(cargoConfigDir)) fs.mkdirSync(cargoConfigDir, { recursive: true });
  const cargoConfigPath = path.join(cargoConfigDir, 'config.toml');
  fs.writeFileSync(
    cargoConfigPath,
    `[build]\njobs = 1\n\n[env]\nCARGO_BUILD_JOBS = "1"\n\n[target.x86_64-pc-windows-msvc]\nrustflags = ["-C", "link-args=/STACK:16777216"]\n`,
    'utf8'
  );

  // Clean old embedded asset codegen in target/release/build/sayan-warehouse* so Tauri rebuilds cleanly with slimmed dist/
  const releaseBuildDir = path.join(ROOT_DIR, 'src-tauri', 'target', 'release', 'build');
  if (fs.existsSync(releaseBuildDir)) {
    try {
      for (const entry of fs.readdirSync(releaseBuildDir)) {
        if (entry.startsWith('sayan-warehouse-') || entry.startsWith('dlkam-')) {
          fs.rmSync(path.join(releaseBuildDir, entry), { recursive: true, force: true });
        }
      }
    } catch (_) {}
  }

  // 4. Build Tauri Desktop Bundle
  console.log('\n🔨 در حال کامپایل و ساخت فایل نصبی ویندوز (Tauri Build)...');
  try {
    execSync('npx tauri build', {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        TEMP: localTempDir,
        TMP: localTempDir,
        TMPDIR: localTempDir,
        NODE_OPTIONS: '--max-old-space-size=4096',
        CARGO_BUILD_JOBS: '1',
        CARGO_PROFILE_RELEASE_CODEGEN_UNITS: '16',
        CARGO_PROFILE_RELEASE_OPT_LEVEL: '2',
        CARGO_PROFILE_RELEASE_LTO: 'false',
        CARGO_PROFILE_RELEASE_DEBUG: 'false',
        CARGO_PROFILE_RELEASE_INCREMENTAL: 'false'
      }
    });
  } catch (err) {
    console.error('❌ خطا در زمان اجرای npx tauri build:', err.message);
    process.exit(1);
  }

  refreshWindowsIconCache();

  // 5. Copy final .msi and .exe installers to downloads/ and public/downloads/
  [DOWNLOADS_DIR, PUBLIC_DOWNLOADS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  const bundleDir = path.join(ROOT_DIR, 'src-tauri', 'target', 'release', 'bundle');
  const msiFiles = findBuiltFiles(path.join(bundleDir, 'msi'), ['.msi']);
  const nsisFiles = findBuiltFiles(path.join(bundleDir, 'nsis'), ['.exe']);

  let copiedAny = false;

  if (msiFiles.length > 0) {
    msiFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    const latestMsi = msiFiles[0];

    const msiTargets = [
      path.join(DOWNLOADS_DIR, 'dlkam-desktop-setup.msi'),
      path.join(DOWNLOADS_DIR, 'sayan-desktop-setup.msi'),
      path.join(DOWNLOADS_DIR, `dlkam-desktop-v${verInfo.version}.msi`),
      path.join(PUBLIC_DOWNLOADS_DIR, 'dlkam-desktop-setup.msi'),
      path.join(PUBLIC_DOWNLOADS_DIR, 'sayan-desktop-setup.msi')
    ];

    for (const target of msiTargets) {
      fs.copyFileSync(latestMsi, target);
    }
    console.log(`✅ فایل نصبی MSI در پوشه دانلود قرار گرفت: downloads/dlkam-desktop-setup.msi`);
    copiedAny = true;
  }

  if (nsisFiles.length > 0) {
    nsisFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    const latestExe = nsisFiles[0];

    const exeTargets = [
      path.join(DOWNLOADS_DIR, 'dlkam-desktop-setup.exe'),
      path.join(DOWNLOADS_DIR, 'sayan-desktop-setup.exe'),
      path.join(DOWNLOADS_DIR, `dlkam-desktop-v${verInfo.version}.exe`),
      path.join(PUBLIC_DOWNLOADS_DIR, 'dlkam-desktop-setup.exe'),
      path.join(PUBLIC_DOWNLOADS_DIR, 'sayan-desktop-setup.exe')
    ];

    if (msiFiles.length === 0) {
      exeTargets.push(
        path.join(DOWNLOADS_DIR, 'dlkam-desktop-setup.msi'),
        path.join(PUBLIC_DOWNLOADS_DIR, 'dlkam-desktop-setup.msi')
      );
    }

    for (const target of exeTargets) {
      fs.copyFileSync(latestExe, target);
    }
    console.log(`✅ فایل نصبی EXE در پوشه دانلود قرار گرفت: downloads/dlkam-desktop-setup.exe`);
    copiedAny = true;
  }

  if (!copiedAny) {
    console.warn('⚠️ فایل باندل در مسیر src-tauri/target/release/bundle یافت نشد. لطفاً خروجی کامپایل Rust را بررسی کنید.');
  } else {
    console.log('\n====================================================================');
    console.log(`🎉 نسخه v${verInfo.version} تائوری با موفقیت ساخته شد و در پوشه downloads قرار گرفت!`);
    console.log('🔔 تمام کلاینت‌های دسکتاپ در بررسی خودکار بعدی، پیشنهاد آپدیت به این نسخه را دریافت خواهند کرد.');
    console.log('====================================================================');
  }
}

if (require.main === module) {
  if (process.argv.includes('--release')) {
    buildAndPublishTauri().catch(err => {
      console.error('❌ خطای غیرمنتظره در ساخت نسخه دسکتاپ:', err);
      process.exit(1);
    });
  } else {
    generateAllIcons().catch(err => {
      console.error('❌ خطا در ساخت آیکون‌ها:', err);
      process.exit(1);
    });
  }
}

module.exports = { buildAndPublishTauri, generateAllIcons };
