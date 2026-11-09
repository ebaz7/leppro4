import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ANDROID_RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

test('Android status bar notification icon (ic_stat_dlkam) is a valid white-on-transparent silhouette across all densities', async () => {
  const densities = [
    { folder: 'drawable', expectedSize: 96 },
    { folder: 'drawable-mdpi', expectedSize: 24 },
    { folder: 'drawable-hdpi', expectedSize: 36 },
    { folder: 'drawable-xhdpi', expectedSize: 48 },
    { folder: 'drawable-xxhdpi', expectedSize: 72 },
    { folder: 'drawable-xxxhdpi', expectedSize: 96 }
  ];

  for (const d of densities) {
    for (const fileName of ['ic_stat_dlkam.png', 'ic_stat_name.png', 'ic_notification.png']) {
      const fullPath = path.join(ANDROID_RES, d.folder, fileName);
      assert.equal(fs.existsSync(fullPath), true, `Missing ${d.folder}/${fileName}`);

      const { data, info } = await sharp(fullPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, d.expectedSize);
      assert.equal(info.height, d.expectedSize);

      // Verify top-left corner pixel is 100% transparent (so Android does not render a solid white square!)
      const cornerAlpha = data[3];
      assert.equal(cornerAlpha, 0, `${d.folder}/${fileName} top-left corner must be transparent (alpha=0)`);

      // Verify foreground pixels exist and are pure white (R=255, G=255, B=255)
      let opaqueWhitePixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a > 128) {
          assert.ok(r >= 245, `Expected white R>=245, got ${r}`);
          assert.ok(g >= 245, `Expected white G>=245, got ${g}`);
          assert.ok(b >= 245, `Expected white B>=245, got ${b}`);
          opaqueWhitePixels++;
        }
      }
      assert.ok(opaqueWhitePixels > 20, `${d.folder}/${fileName} should contain visible white silhouette pixels of Delkam logo`);
    }
  }

  // Verify full-color drawable/ic_launcher.png also exists for largeIcon
  const drawableLauncher = path.join(ANDROID_RES, 'drawable', 'ic_launcher.png');
  assert.equal(fs.existsSync(drawableLauncher), true, 'Missing drawable/ic_launcher.png');
});

test('Android native classes and Capacitor config use ic_stat_dlkam and do not prematurely mark notifications read in background', () => {
  const manifest = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  assert.ok(manifest.includes('@drawable/ic_stat_dlkam'), 'AndroidManifest.xml must specify @drawable/ic_stat_dlkam');

  const capConfig = fs.readFileSync(path.join(ROOT, 'capacitor.config.ts'), 'utf8');
  assert.ok(capConfig.includes('smallIcon: "ic_stat_dlkam"'), 'capacitor.config.ts must configure smallIcon: "ic_stat_dlkam"');

  const mainActivity = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'payment', 'system', 'MainActivity.java'), 'utf8');
  assert.ok(mainActivity.includes('R.drawable.ic_stat_dlkam'), 'MainActivity.java must use R.drawable.ic_stat_dlkam as smallIcon');
  assert.ok(mainActivity.includes('showNativeNotification'), 'MainActivity.java must expose showNativeNotification on DlkamAndroid bridge');

  const syncWorker = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'payment', 'system', 'SyncWorker.java'), 'utf8');
  assert.ok(syncWorker.includes('MainActivity.dispatchDlkamNotification'), 'SyncWorker.java must dispatch via MainActivity.dispatchDlkamNotification');
  assert.equal(syncWorker.includes('markNotificationAsReadOnServer'), false, 'SyncWorker.java must not mark notifications as read on server before user views them');
});

test('SSE client resolves server URL via getEffectiveApiUrl and Layout test button sends test notification instead of disabling notifications', () => {
  const sseClient = fs.readFileSync(path.join(ROOT, 'services', 'sseNotificationClient.ts'), 'utf8');
  assert.ok(sseClient.includes('getEffectiveApiUrl('), 'sseNotificationClient.ts must resolve stream URL with getEffectiveApiUrl for Android/Desktop');

  const layoutCode = fs.readFileSync(path.join(ROOT, 'components', 'Layout.tsx'), 'utf8');
  assert.equal(layoutCode.includes('if (notifEnabled) { \n          setNotifEnabled(false);'), false, 'Layout.tsx must not disable notifications when clicking تست ارسال');
  assert.ok(layoutCode.includes('این یک اعلان آزمایشی است'), 'Layout.tsx must send a test notification when clicking تست ارسال');
});

test('Android app uses Play-Protect-safe Jetpack WorkManager periodic sync without sticky notifications or suspicious permissions', () => {
  const manifest = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  assert.equal(manifest.includes('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'), false, 'AndroidManifest.xml must not include REQUEST_IGNORE_BATTERY_OPTIMIZATIONS which triggers Play Protect when combined with REQUEST_INSTALL_PACKAGES');
  assert.equal(manifest.includes('DlkamBackgroundService'), false, 'AndroidManifest.xml must not register custom covert background services');

  const syncWorker = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'payment', 'system', 'SyncWorker.java'), 'utf8');
  assert.ok(syncWorker.includes('scheduleNextPeriodicWorkPulse'), 'SyncWorker.java must schedule periodic WorkManager checks');
  assert.ok(syncWorker.includes('ExistingWorkPolicy.REPLACE'), 'SyncWorker.java must enqueue unique periodic pulse via WorkManager');

  const mainActivity = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'payment', 'system', 'MainActivity.java'), 'utf8');
  assert.ok(mainActivity.includes('SyncWorker.scheduleNextPeriodicWorkPulse'), 'MainActivity.java must schedule periodic WorkManager checks');
  assert.ok(mainActivity.includes('syncSessionCredentialsNative'), 'MainActivity.java must expose syncSessionCredentialsNative to keep native SharedPreferences in sync');
  assert.equal(mainActivity.includes('ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'), false, 'MainActivity.java must not launch ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS');
});

