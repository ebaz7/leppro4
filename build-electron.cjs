/**
 * Automated Electron Windows Installer Builder & Publisher
 * Usage:
 *   npm run build:electron              -> Bumps Electron patch version, generates icons, builds web assets, compiles .exe, and copies to downloads/
 *   npm run build:electron:exact        -> Keeps current Electron version (--no-bump), builds & copies to downloads/
 *   node build-electron.cjs 1.0.60      -> Sets explicit Electron version 1.0.60, builds & copies to downloads/
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { generateAllIcons, refreshWindowsIconCache } = require('./setup-assets.cjs');
const { syncBuildVersion } = require('./setup-build-version.cjs');
const { copyElectronInstallersToDownloads } = require('./electron/after-build.cjs');

const ROOT_DIR = __dirname;

function runCommand(command, extraEnv = {}) {
  console.log(`\n⏳ Running: ${command}`);
  execSync(command, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=4096',
      TEMP: path.join(ROOT_DIR, '.temp'),
      TMP: path.join(ROOT_DIR, '.temp'),
      TMPDIR: path.join(ROOT_DIR, '.temp'),
      XDG_CACHE_HOME: path.join(ROOT_DIR, '.cache'),
      ELECTRON_CACHE: path.join(ROOT_DIR, '.electron_cache'),
      ELECTRON_BUILDER_CACHE: path.join(ROOT_DIR, '.electron_builder_cache'),
      ...extraEnv
    }
  });
}

async function buildAndPublishElectron() {
  console.log('====================================================================');
  console.log('🚀 شروع فرآیند خودکار ساخت و انتشار نسخه ویندوز (Electron)');
  console.log('====================================================================');

  const args = process.argv.slice(2).filter(a => a !== '--release');
  const noBump = args.includes('--no-bump') || args.includes('--same-version');
  const explicitVersion = args.find(a => !a.startsWith('-'));

  // 1. Sync / Bump Electron Version independently
  const verInfo = syncBuildVersion({
    bump: !noBump && !explicitVersion,
    explicitVersion,
    platform: 'electron'
  });
  console.log(`✅ نسخه جدید الکترون ثبت شد: v${verInfo.version}`);

  // 2. Prepare local cache directories on install drive so C:\ drive stays clean
  ['.temp', '.cache', '.electron_cache', '.electron_builder_cache'].forEach((dirName) => {
    const dirPath = path.join(ROOT_DIR, dirName);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  });

  // 3. Ensure all app icons are up-to-date
  await generateAllIcons();

  // 4. Build Vite frontend bundle
  console.log('\n📦 مرحله ۱: ساخت فایل‌های وب (Vite Build)...');
  runCommand('npm run build');

  // 5. Ensure heavy installer/asset directories inside dist/ are excluded before Electron packages app.asar
  const distDownloadsDir = path.join(ROOT_DIR, 'dist', 'downloads');
  if (fs.existsSync(distDownloadsDir)) {
    fs.rmSync(distDownloadsDir, { recursive: true, force: true });
    console.log('   🧹 پوشه dist/downloads پیش از بسته‌بندی الکترون حذف شد.');
  }
  const distAiStudioDir = path.join(ROOT_DIR, 'dist', 'assets', 'aistudio');
  if (fs.existsSync(distAiStudioDir)) {
    fs.rmSync(distAiStudioDir, { recursive: true, force: true });
  }

  // 6. Build Electron NSIS Windows Installer (electron-builder also triggers electron/after-build.cjs)
  console.log('\n🔨 مرحله ۲: کامپایل و ساخت فایل نصبی ویندوز (Electron NSIS)...');
  runCommand('npx electron-builder --win --x64');

  // 7. Guarantee copy into downloads/ & public/downloads/ even if hook was bypassed
  copyElectronInstallersToDownloads();
  refreshWindowsIconCache();

  console.log('\n====================================================================');
  console.log(`🎉 نسخه v${verInfo.version} الکترون با موفقیت ساخته و در پوشه downloads منتشر شد!`);
  console.log(`📁 فایل خروجی: downloads/dlkam-electron-setup-v${verInfo.version}.exe`);
  console.log('====================================================================');
}

if (require.main === module) {
  buildAndPublishElectron().catch((err) => {
    console.error('❌ خطا در ساخت نسخه الکترون:', err);
    process.exit(1);
  });
}

module.exports = { buildAndPublishElectron };
