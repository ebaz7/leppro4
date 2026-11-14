import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initNotificationQueue,
  enqueueNotification,
  acknowledgeNotification,
  getPendingNotificationsForUser
} from '../backend/notification-queue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

test('Windows Electron print pipeline inlines document CSS rules and avoids remote base href hijacking', () => {
  const printService = fs.readFileSync(path.join(ROOT, 'utils', 'mobilePrintService.ts'), 'utf8');
  assert.ok(printService.includes('collectPrintableDocumentStyles'), 'mobilePrintService.ts must inline accessible CSSStyleSheet rules');
  assert.ok(printService.includes('resolveCssUrls'), 'mobilePrintService.ts must resolve relative CSS url(...) references');
  assert.equal(printService.includes('<base href="${activeHost'), false, 'mobilePrintService.ts must not inject a remote <base href> that breaks ./assets/*.css in Electron file:// builds');
  assert.ok(printService.includes("frameDoc.querySelectorAll('link[rel=\"stylesheet\"]')"), 'mobilePrintService.ts must await any fallback stylesheet links before printing');

  const voucher = fs.readFileSync(path.join(ROOT, 'components', 'PrintVoucher.tsx'), 'utf8');
  assert.ok(voucher.includes('body > *:not(.printing-modal):not(#${printAreaId})'), 'PrintVoucher.tsx must not hide #printAreaId when printed inside an isolated iframe');
  assert.ok(voucher.includes('#${printAreaId} .grid-cols-12'), 'PrintVoucher.tsx must include explicit @media print grid-cols-12 fallback rules');
});

test('Android MainActivity captures notification targetUrl on both cold start and onNewIntent and exposes JS bridge consumer', () => {
  const mainActivity = fs.readFileSync(
    path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'payment', 'system', 'MainActivity.java'),
    'utf8'
  );
  assert.ok(mainActivity.includes('onNewIntent(Intent intent)'), 'MainActivity.java must override onNewIntent to handle taps while app is open/backgrounded');
  assert.ok(mainActivity.includes('extractNotificationTargetUrl(getIntent())'), 'MainActivity.java must extract notification targetUrl during onCreate cold start');
  assert.ok(mainActivity.includes('consumePendingNotificationUrl()'), 'MainActivity.java must expose consumePendingNotificationUrl on DlkamAndroid bridge');
  assert.ok(mainActivity.includes('dlkam-notification-tap'), 'MainActivity.java must dispatch dlkam-notification-tap event to WebView');
  assert.ok(mainActivity.includes('OPEN_NOTIFICATION.'), 'MainActivity.java must assign unique notification Intent action to avoid PendingIntent extra reuse');

  const syncWorker = fs.readFileSync(
    path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'payment', 'system', 'SyncWorker.java'),
    'utf8'
  );
  assert.ok(syncWorker.includes('&device=android'), 'SyncWorker.java must request queue-pending scoped to device=android');
  assert.ok(syncWorker.includes('"device", "android"'), 'SyncWorker.java must acknowledge queued items with device=android');
});

test('App.tsx and ChatRoom.tsx support unified notification deep-linking for PV, Group, Task Group, and Public chats', () => {
  const appCode = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf8');
  assert.ok(appCode.includes('navigateFromNotificationUrl'), 'App.tsx must route all notification tap sources through navigateFromNotificationUrl');
  assert.ok(appCode.includes('consumePendingNotificationUrl'), 'App.tsx must consume cold-start notification intent URL from DlkamAndroid');
  assert.ok(appCode.includes("addEventListener('dlkam-notification-tap'"), 'App.tsx must listen to dlkam-notification-tap custom events');
  assert.ok(appCode.includes('pendingNotificationUrlRef'), 'App.tsx must defer deep-link navigation until currentUser session finishes restoring');

  const chatRoom = fs.readFileSync(path.join(ROOT, 'components', 'ChatRoom.tsx'), 'utf8');
  assert.ok(chatRoom.includes('__dlkamActiveChat'), 'ChatRoom.tsx must expose active conversation globally for targeted notification suppression');
  assert.ok(chatRoom.includes("resolvedType = 'task_group'"), 'ChatRoom.tsx must auto-resolve task_group targets from group notification URLs');
});

test('NotificationQueue tracks acknowledgements per device so Desktop/Web acks do not hide Android notifications', async () => {
  const mockDb = { users: [{ username: 'ali', role: 'USER' }], subscriptions: [], notificationQueue: [] };
  initNotificationQueue({
    getDb: () => mockDb,
    saveDb: () => {}
  });

  const item = await enqueueNotification({
    id: 'test_pv_cross_device_1',
    type: 'chat_pv',
    title: 'پیام از رضا',
    body: 'سلام لطفا چک کنید',
    url: '/chat?pv=reza',
    targetUsernames: ['ali'],
    excludeUsernames: ['reza'],
    priority: 1
  });

  assert.ok(item);

  // Desktop Electron acknowledges the notification
  const ackedElectron = acknowledgeNotification('test_pv_cross_device_1', 'ali', 'electron');
  assert.equal(ackedElectron, true);

  // Electron device no longer sees it as pending
  const pendingForElectron = getPendingNotificationsForUser('ali', ['USER'], 'electron');
  assert.equal(pendingForElectron.some(p => p.id === 'test_pv_cross_device_1'), false);

  // Android device MUST still see it pending!
  const pendingForAndroid = getPendingNotificationsForUser('ali', ['USER'], 'android');
  assert.equal(pendingForAndroid.some(p => p.id === 'test_pv_cross_device_1'), true);

  // Once Android acknowledges, it is cleared for Android
  acknowledgeNotification('test_pv_cross_device_1', 'ali', 'android');
  const pendingAfterAndroidAck = getPendingNotificationsForUser('ali', ['USER'], 'android');
  assert.equal(pendingAfterAndroidAck.some(p => p.id === 'test_pv_cross_device_1'), false);
});

test('Real-time chat typing indicator dispatches via SSE and renders in both sidebar list and chat header', () => {
  const serverCode = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(serverCode.includes("app.post(['/api/chat/typing', '/chat/typing']"), 'server.js must expose /api/chat/typing endpoint');
  assert.ok(serverCode.includes("dispatchSSEEvent('chat_typing'"), 'server.js must broadcast chat_typing via SSE without disk persistence');

  const sseClient = fs.readFileSync(path.join(ROOT, 'services', 'sseNotificationClient.ts'), 'utf8');
  assert.ok(sseClient.includes("addEventListener('chat_typing'"), 'sseNotificationClient.ts must listen for chat_typing SSE events');
  assert.ok(sseClient.includes('CHAT_TYPING_REALTIME'), 'sseNotificationClient.ts must dispatch CHAT_TYPING_REALTIME CustomEvent');

  const chatRoom = fs.readFileSync(path.join(ROOT, 'components', 'ChatRoom.tsx'), 'utf8');
  assert.ok(chatRoom.includes("apiCall('/chat/typing'"), 'ChatRoom.tsx must send typing status to /chat/typing');
  assert.ok(chatRoom.includes('CHAT_TYPING_REALTIME'), 'ChatRoom.tsx must subscribe to CHAT_TYPING_REALTIME');
  assert.ok(chatRoom.includes('getChannelTypingText(item.type, item.id)'), 'ChatRoom.tsx must render typing indicator in sidebar channel list');
  assert.ok(chatRoom.includes('getChannelTypingText(activeChannel.type, activeChannel.id)'), 'ChatRoom.tsx must render typing indicator next to name in chat header');
  assert.ok(chatRoom.includes('در حال تایپ...'), 'ChatRoom.tsx must display Persian typing label');
});

