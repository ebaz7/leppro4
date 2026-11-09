import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getApps } from 'firebase/app';

test('National Internet & Local Intranet Resilience Suite', async (t) => {
  await t.test('index.html and index.css have zero external CDN dependencies', () => {
    const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
    const indexCss = fs.readFileSync(path.resolve('index.css'), 'utf8');

    const forbiddenCdns = [
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'cdn.jsdelivr.net',
      'cdnjs.cloudflare.com',
      'unpkg.com',
      'cdn.tailwindcss.com'
    ];

    for (const cdn of forbiddenCdns) {
      assert.equal(
        indexHtml.includes(cdn),
        false,
        `index.html must not reference external CDN: ${cdn}`
      );
      assert.equal(
        indexCss.includes(cdn),
        false,
        `index.css must not reference external CDN: ${cdn}`
      );
    }
  });

  await t.test('All required Persian fonts and Tesseract OCR offline assets exist locally', () => {
    const requiredAssets = [
      'public/fonts/Vazirmatn-Regular.woff2',
      'public/fonts/Vazirmatn-Bold.woff2',
      'public/fonts/Sahel.woff2',
      'public/fonts/Samim.woff2',
      'public/fonts/Shabnam.woff2',
      'public/fonts/Estedad.woff2',
      'public/tesseract/worker.min.js',
      'public/tesseract/tesseract-core-simd.wasm.js',
      'public/tesseract/lang-data/fas.traineddata.gz'
    ];

    for (const relPath of requiredAssets) {
      const fullPath = path.resolve(relPath);
      assert.equal(
        fs.existsSync(fullPath),
        true,
        `Required offline asset missing: ${relPath}`
      );
    }
  });

  await t.test('Importing googleWorkspaceService does NOT eagerly initialize Firebase Auth on startup', async () => {
    const appsBefore = getApps().length;
    const gwModule = await import('../services/googleWorkspaceService.ts');
    const appsAfter = getApps().length;

    assert.equal(
      appsAfter,
      appsBefore,
      'Firebase must NOT be initialized eagerly at module import time'
    );
    assert.equal(typeof gwModule.getFirebaseAuth, 'function');
    assert.equal(typeof gwModule.fetchWithGoogleTimeout, 'function');
  });

  await t.test('Notification, WebPush queue, and Telegram modules include fast timeouts for National Internet mode', () => {
    const notifServiceCode = fs.readFileSync(path.resolve('services/notificationService.ts'), 'utf8');
    const notifQueueCode = fs.readFileSync(path.resolve('backend/notification-queue.js'), 'utf8');
    const telegramCode = fs.readFileSync(path.resolve('backend/telegram.js'), 'utf8');

    assert.equal(
      notifServiceCode.includes('3500'),
      true,
      'notificationService.ts must enforce a 3.5s timeout on FCM/WebPush registration'
    );
    assert.equal(
      notifQueueCode.includes('timeout: 3500') && notifQueueCode.includes('Promise.allSettled'),
      true,
      'notification-queue.js must dispatch WebPush in parallel with a 3.5s timeout'
    );
    assert.equal(
      telegramCode.includes('withTelegramTimeout') && telegramCode.includes('telegramOfflineUntil'),
      true,
      'telegram.js must include fast timeout and circuit breaker when international internet is cut'
    );
  });
});
