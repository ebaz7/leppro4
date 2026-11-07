/**
 * Automated Android APK Builder & Publisher
 * Usage:
 *   npm run release:android               -> Automatically bumps patch version, generates icons, builds signed APK, copies to downloads/
 *   npm run release:android -- 1.2.0      -> Sets version to 1.2.0, builds signed APK, copies to downloads/
 *   npm run build:apk                     -> Builds APK and places it in downloads/
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { generateAllIcons } = require('./setup-assets.cjs');
const { syncBuildVersion } = require('./setup-build-version.cjs');

function runCommand(command, cwd = process.cwd(), extraEnv = {}) {
  console.log(`\n⏳ Running: ${command}`);
  try {
    execSync(command, {
      stdio: 'inherit',
      cwd,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096', ...extraEnv }
    });
  } catch (error) {
    console.error(`\n❌ Error executing command: ${command}`);
    process.exit(1);
  }
}

async function buildAndroid() {
  console.log('====================================================================');
  console.log('🚀 شروع فرآیند خودکار ساخت و انتشار نسخه اندروید (APK)');
  console.log('====================================================================');

  const args = process.argv.slice(2).filter(a => a !== '--release' && a !== '--debug');
  const noBump = args.includes('--no-bump') || args.includes('--same-version');
  const explicitVersion = args.find(a => !a.startsWith('-'));

  // 1. Bump / Sync Version across package.json, build.gradle, release-version.json, and database.json
  const verInfo = syncBuildVersion({
    bump: !noBump && !explicitVersion,
    explicitVersion,
    platform: 'android'
  });
  console.log(`✅ نسخه جدید اندروید ثبت شد: v${verInfo.version} (کد بیلد: ${verInfo.versionCode})`);

  // 2. Generate all icons preserving exact background color or transparency
  await generateAllIcons();

  // 3. Build web assets
  console.log('\n📦 مرحله ۱: ساخت فایل‌های وب (Vite Build)...');
  runCommand('npm run build');

  // 3.5. Remove heavy installer files (dist/downloads, dist/assets/aistudio) from dist before copying to Android APK assets
  const distDownloadsDir = path.join(__dirname, 'dist', 'downloads');
  if (fs.existsSync(distDownloadsDir)) {
    fs.rmSync(distDownloadsDir, { recursive: true, force: true });
    console.log('   🧹 پوشه dist/downloads از باندل اندروید حذف شد تا حجم APK و مصرف رم Gradle بهینه شود.');
  }
  const distAiStudioAssetsDir = path.join(__dirname, 'dist', 'assets', 'aistudio');
  if (fs.existsSync(distAiStudioAssetsDir)) {
    fs.rmSync(distAiStudioAssetsDir, { recursive: true, force: true });
  }

  // 4. Add or sync android platform
  const androidDir = path.join(__dirname, 'android');
  if (!fs.existsSync(androidDir)) {
    console.log('\n📱 مرحله ۲: افزودن پلتفرم اندروید Capacitor...');
    runCommand('npx cap add android');
    await generateAllIcons();
  } else {
    console.log('\n🔄 مرحله ۲: همگام‌سازی فایل‌ها با پلتفرم اندروید (Capacitor Sync)...');
    runCommand('npx cap sync android');
    await generateAllIcons();
  }

  // Clean any leftover downloads or large installer files inside android/app/src/main/assets/public
  const androidAssetsDownloadsDir = path.join(androidDir, 'app', 'src', 'main', 'assets', 'public', 'downloads');
  if (fs.existsSync(androidAssetsDownloadsDir)) {
    fs.rmSync(androidAssetsDownloadsDir, { recursive: true, force: true });
  }
  const androidAssetsAiStudioDir = path.join(androidDir, 'app', 'src', 'main', 'assets', 'public', 'assets', 'aistudio');
  if (fs.existsSync(androidAssetsAiStudioDir)) {
    fs.rmSync(androidAssetsAiStudioDir, { recursive: true, force: true });
  }

  // 5. Auto-detect Android SDK and configure local.properties if needed
  const isWindows = process.platform === 'win32';
  const localPropertiesPath = path.join(androidDir, 'local.properties');
  let sdkPath = '';
  if (isWindows) {
    const candidates = [
      'C:\\Users\\Factorythird\\AppData\\Local\\Android\\Sdk',
      path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Local', 'Android', 'Sdk'),
      'C:\\Android\\Sdk',
      process.env.ANDROID_HOME,
      process.env.ANDROID_SDK_ROOT
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) {
        sdkPath = c;
        break;
      }
    }
  } else {
    const candidates = [
      path.join(process.env.HOME || '/', 'Android', 'Sdk'),
      path.join(process.env.HOME || '/', 'Library', 'Android', 'sdk'),
      process.env.ANDROID_HOME,
      process.env.ANDROID_SDK_ROOT
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) {
        sdkPath = c;
        break;
      }
    }
  }

  if (sdkPath && !fs.existsSync(localPropertiesPath)) {
    const formattedPath = sdkPath.replace(/\\/g, '/');
    fs.writeFileSync(localPropertiesPath, `sdk.dir=${formattedPath}\n`, 'utf8');
  }

  // 6. Ensure AndroidManifest.xml is AGP 8+ compliant (no package="..." attribute) and Cleartext (HTTP) traffic is enabled
  const manifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    let manifestContent = fs.readFileSync(manifestPath, 'utf8');
    let modified = false;

    // Remove deprecated package="..." attribute from <manifest> tag (forbidden in AGP 8+)
    if (/<manifest[^>]*\s+package\s*=\s*["'][^"']*["']/.test(manifestContent)) {
      manifestContent = manifestContent.replace(
        /(<manifest[^>]*?)\s+package\s*=\s*["'][^"']*["']([^>]*>)/,
        '$1$2'
      );
      modified = true;
      console.log('   ✅ ویژگی قدیمی package از AndroidManifest.xml برای سازگاری با Gradle جدید حذف شد.');
    }

    // Ensure MainActivity points to the actual Java source package if com/payment/system/MainActivity.java exists
    const legacyMainActivityJava = path.join(androidDir, 'app', 'src', 'main', 'java', 'com', 'payment', 'system', 'MainActivity.java');
    if (fs.existsSync(legacyMainActivityJava) && manifestContent.includes('android:name=".MainActivity"')) {
      manifestContent = manifestContent.replace(
        'android:name=".MainActivity"',
        'android:name="com.payment.system.MainActivity"'
      );
      modified = true;
    }

    if (!manifestContent.includes('android:usesCleartextTraffic="true"')) {
      manifestContent = manifestContent.replace(
        '<application',
        '<application\n        android:usesCleartextTraffic="true"'
      );
      modified = true;
    }

    // Ensure REQUEST_INSTALL_PACKAGES is present so the app can directly launch the Android Package Installer for in-place updates
    if (!manifestContent.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
      manifestContent = manifestContent.replace(
        '<uses-permission android:name="android.permission.INTERNET" />',
        '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'
      );
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(manifestPath, manifestContent, 'utf8');
    }
  }

  // Ensure res/xml/file_paths.xml exists for FileProvider (without <root-path> which triggers Play Protect heuristics)
  const xmlResDir = path.join(androidDir, 'app', 'src', 'main', 'res', 'xml');
  const filePathsXml = path.join(xmlResDir, 'file_paths.xml');
  fs.mkdirSync(xmlResDir, { recursive: true });
  fs.writeFileSync(
    filePathsXml,
    `<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n    <files-path name="files" path="." />\n    <cache-path name="cache" path="." />\n    <external-path name="external" path="." />\n    <external-files-path name="external_files" path="." />\n    <external-cache-path name="external_cache" path="." />\n</paths>\n`,
    'utf8'
  );

  // Ensure res/values/strings.xml sets app_name and title_activity_main to "dlkam"
  const stringsXmlPath = path.join(androidDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  if (fs.existsSync(stringsXmlPath)) {
    let stringsXml = fs.readFileSync(stringsXmlPath, 'utf8');
    stringsXml = stringsXml
      .replace(/<string name="app_name">[^<]*<\/string>/, '<string name="app_name">dlkam</string>')
      .replace(/<string name="title_activity_main">[^<]*<\/string>/, '<string name="title_activity_main">dlkam</string>');
    fs.writeFileSync(stringsXmlPath, stringsXml, 'utf8');
  }

  // 6.5. Fix google-services.json package_name mismatch & guard build.gradle
  const appBuildGradlePath = path.join(androidDir, 'app', 'build.gradle');
  let appPackageName = 'com.dikam.paymentorder';
  if (fs.existsSync(appBuildGradlePath)) {
    let gradleText = fs.readFileSync(appBuildGradlePath, 'utf8');
    let gradleModified = false;
    const appIdMatch = gradleText.match(/applicationId\s+["']([^"']+)["']/);
    if (appIdMatch && appIdMatch[1]) {
      appPackageName = appIdMatch[1].trim();
    }

    // Ensure aaptOptions skips re-compressing heavy binary/wasm/archive extensions to prevent CompressAssetsWorkAction OOM
    if (!gradleText.includes('noCompress')) {
      gradleText = gradleText.replace(
        /ignoreAssetsPattern\s+["'][^"']+["']/,
        `ignoreAssetsPattern "!.svn:!.git:!.ds_store:!*.scc:.*:g*.tbi:f*.tbi:!downloads:!*.apk:!*.exe:!*.msi"\n             noCompress "wasm", "gz", "traineddata", "apk", "exe", "msi", "zip", "mp4", "mp3"`
      );
      gradleModified = true;
    }

    // Ensure invalid v3SigningEnabled / v4SigningEnabled methods are removed
    if (/v[34]SigningEnabled/.test(gradleText)) {
      gradleText = gradleText.replace(/\s*v[34]SigningEnabled\s+true/g, '');
      gradleModified = true;
    }

    if (gradleModified) {
      fs.writeFileSync(appBuildGradlePath, gradleText, 'utf8');
    }
  }

  const googleServicesPath = path.join(androidDir, 'app', 'google-services.json');
  if (fs.existsSync(googleServicesPath)) {
    try {
      const gsRaw = fs.readFileSync(googleServicesPath, 'utf8');
      const gsJson = JSON.parse(gsRaw);
      if (gsJson && Array.isArray(gsJson.client) && gsJson.client.length > 0) {
        const hasMatchingClient = gsJson.client.some(
          c => c?.client_info?.android_client_info?.package_name === appPackageName
        );
        if (!hasMatchingClient) {
          const clonedClient = JSON.parse(JSON.stringify(gsJson.client[0]));
          if (!clonedClient.client_info) clonedClient.client_info = {};
          if (!clonedClient.client_info.android_client_info) clonedClient.client_info.android_client_info = {};
          clonedClient.client_info.android_client_info.package_name = appPackageName;
          gsJson.client.push(clonedClient);
          fs.writeFileSync(googleServicesPath, JSON.stringify(gsJson, null, 2) + '\n', 'utf8');
          console.log(`   ✅ فایل google-services.json به‌صورت خودکار با پکیج (${appPackageName}) همگام‌سازی شد.`);
        }
      }
    } catch (gsErr) {
      console.warn('⚠️ فایل google-services.json نامعتبر بود؛ نادیده گرفته شد.');
    }
  }

  // 6.8. Ensure gradle.properties has sufficient heap memory (4GB) and capped workers to prevent OOM in compressReleaseAssets
  const gradlePropsPath = path.join(androidDir, 'gradle.properties');
  if (fs.existsSync(gradlePropsPath)) {
    let gradleProps = fs.readFileSync(gradlePropsPath, 'utf8');
    let propsModified = false;
    if (/org\.gradle\.jvmargs\s*=/.test(gradleProps)) {
      if (!gradleProps.includes('-Xmx4096m')) {
        gradleProps = gradleProps.replace(
          /org\.gradle\.jvmargs\s*=.*/,
          'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8'
        );
        propsModified = true;
      }
    } else {
      gradleProps += '\norg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8\n';
      propsModified = true;
    }
    if (!gradleProps.includes('org.gradle.workers.max')) {
      gradleProps += '\norg.gradle.workers.max=2\n';
      propsModified = true;
    }
    if (propsModified) {
      fs.writeFileSync(gradlePropsPath, gradleProps, 'utf8');
    }
  }

  // Remove any accidental .apk, .exe, .msi, or unused tesseract wasm.js duplicates inside android/app/src/main/assets/public
  const assetsPublicDir = path.join(androidDir, 'app', 'src', 'main', 'assets', 'public');
  function purgeHeavyBinariesFromAssets(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'downloads' || entry.name === 'backups' || entry.name === 'uploads' || entry.name === 'chat_uploads') {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          purgeHeavyBinariesFromAssets(fullPath);
        }
      } else if (/\.(apk|exe|msi|zip|rar|7z|bak)$/i.test(entry.name)) {
        fs.rmSync(fullPath, { force: true });
      } else if (/^tesseract-core.*\.wasm\.js$/i.test(entry.name)) {
        // Modern Android WebView supports WebAssembly (.wasm) natively; the huge base64 .wasm.js fallback files (~60MB total) are unnecessary and cause Gradle CompressAssets OOM
        fs.rmSync(fullPath, { force: true });
      }
    }
  }
  purgeHeavyBinariesFromAssets(assetsPublicDir);

  // Ensure android/app/src/main/assets/capacitor.config.json uses the unified packageId
  const capAssetsConfigPath = path.join(androidDir, 'app', 'src', 'main', 'assets', 'capacitor.config.json');
  if (fs.existsSync(capAssetsConfigPath)) {
    try {
      const capCfg = JSON.parse(fs.readFileSync(capAssetsConfigPath, 'utf-8'));
      if (capCfg.appId !== 'com.dikam.paymentorder') {
        capCfg.appId = 'com.dikam.paymentorder';
        fs.writeFileSync(capAssetsConfigPath, JSON.stringify(capCfg, null, 2), 'utf-8');
      }
    } catch (_) {}
  }

  // 7. Compile Signed APK using Gradle (with official permanent keystore so all builds forever share the exact same signature)
  const isRelease = !process.argv.includes('--debug');
  const keystorePath = path.join(androidDir, 'app', 'release-key.keystore');
  const backupKeystoreDir = path.join(__dirname, '.keystore-backup');
  const backupKeystorePath = path.join(backupKeystoreDir, 'release-key.keystore');

  // Permanent official release certificate (SHA-256: 24:CA:96:B8:5D:82:09:1A:1B:15:A2:15:FB:E6:90:2A:F5:0B:73:44:3D:9D:04:4F:EC:B7:7F:4E:75:82:FF:92)
  const OFFICIAL_KEYSTORE_BASE64 = 
    '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' +
    'Kqm7hWupZiSRLu+sezsECH65k9VELpYfAgIIAA==';

  if (!fs.existsSync(keystorePath)) {
    if (fs.existsSync(backupKeystorePath)) {
      try {
        fs.copyFileSync(backupKeystorePath, keystorePath);
        console.log('🔐 فایل امضای دیجیتال رسمی (release-key.keystore) از نسخه پشتیبان بازیابی شد.');
      } catch (_) {}
    }
    if (!fs.existsSync(keystorePath)) {
      try {
        fs.writeFileSync(keystorePath, Buffer.from(OFFICIAL_KEYSTORE_BASE64, 'base64'));
        console.log('🔐 فایل امضای رسمی و ثابت دائم (Permanent Official Keystore) با موفقیت مستقر شد.');
      } catch (_) {}
    }
  }

  if (fs.existsSync(keystorePath)) {
    try {
      if (!fs.existsSync(backupKeystoreDir)) fs.mkdirSync(backupKeystoreDir, { recursive: true });
      fs.copyFileSync(keystorePath, backupKeystorePath);
    } catch (_) {}
  }

  const gradlew = isWindows ? 'gradlew.bat' : './gradlew';
  if (!isWindows) {
    runCommand('chmod +x gradlew', androidDir);
  }

  const buildType = isRelease ? 'Release' : 'Debug';
  console.log(`\n🔨 مرحله ۴: کامپایل فایل نصبی APK (${buildType}) با Gradle...`);
  const localTempDir = path.join(__dirname, '.temp');
  if (!fs.existsSync(localTempDir)) {
    fs.mkdirSync(localTempDir, { recursive: true });
  }
  const extraEnv = {
    ...(sdkPath ? { ANDROID_HOME: sdkPath, ANDROID_SDK_ROOT: sdkPath } : {}),
    TEMP: localTempDir,
    TMP: localTempDir,
    TMPDIR: localTempDir,
    GRADLE_OPTS: `-Dorg.gradle.jvmargs="-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8 -Djava.io.tmpdir=${localTempDir.replace(/\\/g, '/')}" -Dorg.gradle.workers.max=2`
  };
  try {
    execSync(`${gradlew} --stop`, { cwd: androidDir, stdio: 'ignore', env: { ...process.env, ...extraEnv } });
  } catch (_) {}
  runCommand(`${gradlew} assemble${buildType} --max-workers=2`, androidDir, extraEnv);

  const releaseSignedPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  const releaseUnsignedPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
  const debugApkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

  let apkSourcePath = null;
  if (isRelease && fs.existsSync(releaseSignedPath)) {
    apkSourcePath = releaseSignedPath;
  } else if (isRelease && fs.existsSync(releaseUnsignedPath)) {
    apkSourcePath = releaseUnsignedPath;
  } else if (fs.existsSync(debugApkPath)) {
    apkSourcePath = debugApkPath;
  }

  if (apkSourcePath && fs.existsSync(apkSourcePath)) {
    const downloadsDir = path.join(__dirname, 'downloads');
    const publicDownloadsDir = path.join(__dirname, 'public', 'downloads');

    [downloadsDir, publicDownloadsDir].forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    const targets = [
      path.join(downloadsDir, 'dlkam-android-latest.apk'),
      path.join(downloadsDir, 'sayan-android-latest.apk'),
      path.join(downloadsDir, `dlkam-android-v${verInfo.version}.apk`),
      path.join(publicDownloadsDir, 'dlkam-android-latest.apk'),
      path.join(publicDownloadsDir, 'sayan-android-latest.apk'),
      path.join(__dirname, 'payment-system-release.apk'),
      path.join(__dirname, 'dlkam-android-latest.apk')
    ];

    for (const target of targets) {
      fs.copyFileSync(apkSourcePath, target);
    }

    console.log('\n====================================================================');
    console.log(`🎉 نسخه v${verInfo.version} اندروید با موفقیت ساخته شد و در پوشه دانلود قرار گرفت!`);
    console.log(`📂 مسیر فایل در سرور: downloads/dlkam-android-latest.apk`);
    console.log(`📂 مسیر نسخه آرشیوی: downloads/dlkam-android-v${verInfo.version}.apk`);
    console.log('🔔 تمام کلاینت‌های اندروید در بررسی خودکار بعدی، پیشنهاد آپدیت به این نسخه را دریافت خواهند کرد.');
    console.log('====================================================================');
  } else {
    console.error('\n❌ ساخت APK به پایان رسید اما فایل خروجی در مسیر مورد انتظار یافت نشد.');
    process.exit(1);
  }
}

buildAndroid().catch(err => {
  console.error('❌ خطای غیرمنتظره در ساخت اندروید:', err);
  process.exit(1);
});
