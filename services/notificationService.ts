
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { isTauriDesktop, isElectronDesktop } from '../utils/platformDetection';
import { apiCall } from './apiService';

const PREF_KEY = 'app_notification_pref';

export const isNotificationEnabledInApp = (): boolean => {
    return localStorage.getItem(PREF_KEY) !== 'false';
};

export const setNotificationPreference = (enabled: boolean) => {
    localStorage.setItem(PREF_KEY, String(enabled));
};

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
 
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
 
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (Capacitor.isNativePlatform()) {
      let localGranted = false;
      let pushGranted = false;

      try {
          const dlkamBridge = (window as any).DlkamAndroid;
          if (dlkamBridge && typeof dlkamBridge.requestNotificationPermissionNative === 'function') {
              dlkamBridge.requestNotificationPermissionNative();
              localGranted = true;
          }
      } catch (_) {}

      try {
          const localResult = await LocalNotifications.requestPermissions();
          if (localResult.display === 'granted') {
              localGranted = true;
          }
      } catch (e) {
          console.warn("LocalNotifications permission request warning:", e);
      }

      if (Capacitor.getPlatform() === 'android') {
          try {
              await LocalNotifications.createChannel({
                  id: 'chat_pv_channel',
                  name: 'پیام‌های شخصی و گفتگو (PV)',
                  description: 'اعلان فوری پیام‌های خصوصی و گفتگوهای سازمانی دلکام',
                  importance: 5,
                  visibility: 1,
                  lights: true,
                  vibration: true,
                  sound: 'default'
              });
              await LocalNotifications.createChannel({
                  id: 'fcm_default_channel',
                  name: 'اعلان‌های سیستم خروج و پرداخت دلکام',
                  description: 'کانال اصلی اعلان‌های دستور پرداخت، کارتابل و برگه خروج',
                  importance: 5,
                  visibility: 1,
                  lights: true,
                  vibration: true,
                  sound: 'default'
              });
          } catch (e) {
              console.warn('Create channel notice', e);
          }
      }

      try {
          const result = await PushNotifications.requestPermissions();
          if (result.receive === 'granted') {
              pushGranted = true;
              await Promise.race([
                  PushNotifications.register(),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('FCM register timeout (National Internet / LAN fallback)')), 3500))
              ]);
          }
      } catch (e) {
          console.warn("PushNotifications registration notice (using Local/SSE fallback):", e);
      }

      return localGranted || pushGranted || true;
  }

  // Electron Desktop Windows/Linux/Mac Logic
  if (isElectronDesktop()) {
      return true;
  }

  // Tauri Desktop Windows/Mac/Linux Logic
  if (isTauriDesktop()) {
      try {
          if ((window as any).__TAURI__?.notification) {
              const tauriNotif = (window as any).__TAURI__.notification;
              let isGranted = await tauriNotif.isPermissionGranted();
              if (!isGranted) {
                  const perm = await tauriNotif.requestPermission();
                  isGranted = perm === 'granted';
              }
              if (isGranted) return true;
          }
          const tauriMod = await import('@tauri-apps/api/notification');
          let isGranted = await tauriMod.isPermissionGranted();
          if (!isGranted) {
              const perm = await tauriMod.requestPermission();
              isGranted = perm === 'granted';
          }
          if (isGranted) return true;
      } catch (e) {
          console.warn('Tauri native notification check:', e);
      }
      if (typeof window !== 'undefined' && 'Notification' in window && typeof Notification !== 'undefined') {
          try {
              const perm = await Notification.requestPermission();
              return perm === 'granted';
          } catch (e) {
              return true;
          }
      }
      return true;
  }

  // Web Logic - Safe check for iOS Safari & unsupported browsers
  if (typeof window === 'undefined' || !("Notification" in window) || typeof Notification === 'undefined') {
      return false;
  }
  
  try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
          // Run push subscription in background so unreachable FCM (without international internet) never blocks UI permission flow
          subscribeToPushNotifications().catch(err => {
              console.warn('[Push] Background push subscription skipped (using SSE/Local notification fallback):', err?.message || err);
          });
          return true;
      }
      return false;
  } catch (e) {
      console.error("Web Permission Error:", e);
      return false;
  }
};

export const syncServiceWorkerAuth = async (user: any | null) => {
    try {
        if ('caches' in window) {
            const cache = await caches.open('auth-session-v1');
            await cache.put(
                new Request('/auth-status'),
                new Response(JSON.stringify({
                    isLoggedIn: !!user,
                    username: user?.username || null,
                    role: user?.role || null,
                    updatedAt: Date.now()
                }), { headers: { 'Content-Type': 'application/json' } })
            );
        }
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: user ? 'LOGIN' : 'LOGOUT',
                username: user?.username || null
            });
        }
    } catch (e) {
        console.error('Failed to sync SW auth state:', e);
    }
};

export const clearAllActiveNotifications = async () => {
    // 1. Android Native (Capacitor)
    if (Capacitor.isNativePlatform()) {
        try {
            await PushNotifications.removeAllDeliveredNotifications();
        } catch (e) {
            console.error('Error removing delivered push notifications', e);
        }
        try {
            await LocalNotifications.removeAllDeliveredNotifications();
        } catch (e) {
            console.error('Error removing delivered local notifications', e);
        }
    }
    // 2. Windows Desktop (Tauri)
    if (isTauriDesktop()) {
        try {
            if ((window as any).__TAURI__?.window?.appWindow) {
                // Cancel flashing/attention on Windows taskbar
                (window as any).__TAURI__.window.appWindow.requestUserAttention(null);
            }
        } catch (e) {}
    }
    // 3. Web & PWA (Service Worker)
    if (typeof navigator !== 'undefined' && "serviceWorker" in navigator) {
        try {
            const reg = await navigator.serviceWorker.ready;
            if (reg && reg.getNotifications) {
                const activeNotifs = await reg.getNotifications();
                activeNotifs.forEach(n => n.close());
            }
        } catch (e) {}
    }
};

export const unsubscribeFromPushNotifications = async (user?: any | null, passedEndpoint?: string | null) => {
    try {
        let endpoint = passedEndpoint || localStorage.getItem('push_endpoint') || '';

        // 1. Unsubscribe the browser push manager instance
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            try {
                const reg = await navigator.serviceWorker.ready;
                if (reg && reg.pushManager) {
                    const sub = await reg.pushManager.getSubscription();
                    if (sub) {
                        if (!endpoint) endpoint = sub.endpoint;
                        await sub.unsubscribe();
                        console.log('[Push] Browser PushManager unsubscribed successfully.');
                    }
                }
            } catch (swErr) {
                console.warn('[Push] Error unsubscribing browser push manager:', swErr);
            }
        }

        // 2. Clear all visible notifications from notification tray
        await clearAllActiveNotifications();

        // 3. Mark Service Worker as logged out so incoming push events are dropped immediately
        await syncServiceWorkerAuth(null);

        // 4. Capacitor native cleanup
        if (Capacitor.isNativePlatform()) {
            try {
                await PushNotifications.removeAllListeners();
                await PushNotifications.removeAllDeliveredNotifications();
                await LocalNotifications.removeAllDeliveredNotifications();
                if (typeof PushNotifications.unregister === 'function') {
                    await PushNotifications.unregister();
                }
            } catch (capErr) {
                console.warn('[Push] Capacitor push cleanup error:', capErr);
            }
        }

        // 5. Notify server to purge subscription records from database
        const payload = {
            endpoint: endpoint || undefined,
            username: user?.username || undefined
        };

        if (endpoint || user?.username) {
            const jsonPayload = JSON.stringify(payload);
            let beaconSent = false;
            if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
                try {
                    const blob = new Blob([jsonPayload], { type: 'application/json' });
                    beaconSent = navigator.sendBeacon('/api/unsubscribe', blob);
                } catch (e) {}
            }

            if (!beaconSent) {
                await fetch('/api/unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: jsonPayload,
                    keepalive: true
                }).catch(err => {
                    console.warn('[Push] Fetch unsubscribe fallback error:', err);
                });
            }
        }
    } catch (e) {
        console.error('[Push] unsubscribeFromPushNotifications failed:', e);
    } finally {
        localStorage.removeItem('push_endpoint');
    }
};

export const setupNativePushNotifications = async (username: string, role: string) => {
    if (!Capacitor.isNativePlatform()) return;
    if (!username) return;
    try {
        // Clear old listeners first to protect against multiple callbacks
        await PushNotifications.removeAllListeners();

        // 1. Listen for successful registration & get the actual FCM registration token
        await PushNotifications.addListener('registration', async (token) => {
            console.log("FCM registration token achieved:", token.value);
            try {
                // Save token value to push_endpoint so logout can unregister it nicely
                localStorage.setItem('push_endpoint', token.value);

                // Post to /api/subscribe so the server caches this native token securely
                await apiCall('/subscribe', 'POST', {
                    endpoint: token.value,
                    username: username,
                    role: role,
                    type: 'android',
                    deviceType: 'android',
                    keys: {} // Standard parameters
                });
                console.log("FCM push token registered with server for user:", username);
            } catch (e) {
                console.error("Error subscribing FCM token on server", e);
            }
        });

        // 2. Listen for registration failures
        await PushNotifications.addListener('registrationError', (error) => {
            console.error('Capacitor Push Registration Error:', JSON.stringify(error));
        });

        // 3. Listen for foreground push notification reception
        await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
            console.log('FCM Push received in foreground:', notification);
            const data = notification.data || {};
            const idValue = data.id || '';
            
            // Prevent duplicated notification loops if it has already been shown
            if (idValue && hasNotificationBeenShown(idValue)) {
                return;
            }

            // Fire clean local toast/banner on Android screen immediately
            try {
                const isChatPV = data?.type === 'chat_pv' || data?.tab === 'chat' || (data?.url && String(data.url).includes('pv='));
                const channelId = isChatPV ? 'chat_pv_channel' : 'fcm_default_channel';
                const dlkamBridge = (window as any).DlkamAndroid;
                if (dlkamBridge && typeof dlkamBridge.showNativeNotification === 'function') {
                    dlkamBridge.showNativeNotification(
                        notification.title || 'اعلان جدید',
                        notification.body || '',
                        idValue || String(Date.now()),
                        channelId,
                        data?.url || ''
                    );
                } else {
                    await LocalNotifications.schedule({
                        notifications: [
                            {
                                title: notification.title || 'اعلان جدید',
                                body: notification.body || '',
                                id: Math.floor(Math.random() * 2147483647),
                                extra: data || null,
                                channelId,
                                smallIcon: 'ic_stat_dlkam',
                                largeIcon: 'ic_launcher',
                                iconColor: '#2563EB',
                                sound: 'default'
                            }
                        ]
                    });
                }
                if (idValue) markNotificationAsShown(idValue);
            } catch (err) {
                console.error('Error scheduling local notification for received FCM push', err);
            }
        });

        // Create high priority Android notification channels for instant status-bar banners
        if (Capacitor.getPlatform() === 'android') {
            try {
                await LocalNotifications.createChannel({
                    id: 'chat_pv_channel',
                    name: 'پیام‌های شخصی (PV)',
                    description: 'اعلان‌های فوری گفتگو و پیام‌های مستقیم',
                    importance: 5,
                    visibility: 1,
                    lights: true,
                    vibration: true,
                    sound: 'default'
                });
                await LocalNotifications.createChannel({
                    id: 'fcm_default_channel',
                    name: 'اعلان‌های عمومی سیستم',
                    description: 'اعلان‌های کارتابل و سامانه',
                    importance: 5,
                    visibility: 1,
                    lights: true,
                    vibration: true,
                    sound: 'default'
                });
                await PushNotifications.createChannel({
                    id: 'chat_pv_channel',
                    name: 'پیام‌های شخصی (PV)',
                    description: 'اعلان‌های فوری گفتگو و پیام‌های مستقیم',
                    importance: 5,
                    visibility: 1,
                    lights: true,
                    vibration: true,
                    sound: 'default'
                });
                await PushNotifications.createChannel({
                    id: 'fcm_default_channel',
                    name: 'اعلان‌های عمومی سیستم',
                    description: 'اعلان‌های کارتابل و سامانه',
                    importance: 5,
                    visibility: 1,
                    lights: true,
                    vibration: true,
                    sound: 'default'
                });
            } catch (chErr) {
                console.warn('[Notification] Channel creation notice:', chErr);
            }
        }

        // Request permissions and trigger register with 3.5s timeout for National Internet / LAN resilience
        const result = await PushNotifications.requestPermissions();
        if (result.receive === 'granted') {
            await Promise.race([
                PushNotifications.register(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('FCM register timeout (SSE/Local active)')), 3500))
            ]);
            console.log("PushNotifications registered for user:", username);
        }
    } catch (e) {
        console.warn("setupNativePushNotifications notice (SSE/Local notifications active):", e);
    }
};

export const subscribeToPushNotifications = async () => {
    if (Capacitor.isNativePlatform()) return; // Native handled by Capacitor plugin
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        return;
    }

    // CRITICAL: Only allow subscribing if there is an authenticated user!
    const userStr = localStorage.getItem('app_current_user');
    const user = userStr ? JSON.parse(userStr) : null;
    if (!user || !user.username) {
        console.log('[Push] Aborted push subscription: No user is currently logged in.');
        return;
    }

    try {
        // Always sync Service Worker auth state first so local/SSE notifications work offline/intranet immediately
        await syncServiceWorkerAuth(user);

        // 1. Get VAPID Key from Server
        const { publicKey } = await apiCall<{publicKey: string}>('/vapid-key');
        if (!publicKey) throw new Error("No VAPID key returned");

        // 2. Get Service Worker Registration
        const registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<ServiceWorkerRegistration>((_, reject) => setTimeout(() => reject(new Error("ServiceWorker ready timeout")), 3500))
        ]);
        if (!registration || !registration.pushManager) throw new Error("Push manager not available");

        // 3. Subscribe to Push Manager with a strict 3.5s timeout (avoids hanging on fcm.googleapis.com when international internet is cut)
        const convertedVapidKey = urlBase64ToUint8Array(publicKey);
        const subscription = await Promise.race([
            registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            }),
            new Promise<PushSubscription>((_, reject) =>
                setTimeout(() => reject(new Error("WebPush FCM endpoint unreachable (National Internet / Intranet mode - using SSE real-time channel)")), 3500)
            )
        ]);

        // 4. Send Subscription to Server
        const subData = subscription.toJSON();
        await apiCall('/subscribe', 'POST', {
            ...subData,
            username: user.username,
            role: user.role,
            type: 'web'
        });

        if (subscription.endpoint) {
            localStorage.setItem('push_endpoint', subscription.endpoint);
        }

        console.log("✅ Web Push Subscribed Successfully for user:", user.username);
    } catch (e: any) {
        console.warn("[Push] WebPush subscription unavailable (SSE & Local SW notifications remain active):", e?.message || e);
    }
};

const shownInMemory = new Set<string>();

export const syncServiceWorkerShownNotifications = async () => {
    try {
        if ('caches' in window) {
            const cache = await caches.open('shown-notifications-v1');
            const requests = await cache.keys();
            const key = 'shown_notifications_log';
            const raw = localStorage.getItem(key);
            const list: string[] = raw ? JSON.parse(raw) : [];
            let updated = false;

            for (const req of requests) {
                const parts = req.url.split('/notification-shown/');
                if (parts.length > 1) {
                    const id = parts[1];
                    shownInMemory.add(id);
                    if (!list.includes(id)) {
                        list.push(id);
                        updated = true;
                    }
                }
            }

            if (updated) {
                if (list.length > 500) list.splice(0, list.length - 500);
                localStorage.setItem(key, JSON.stringify(list));
                console.log('[SWSync] Synchronized service worker shown notifications. New database count:', list.length);
            }
        }
    } catch (e) {
        console.error('Error synchronizing service worker shown notifications', e);
    }
};

export const syncNativeShownNotifications = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        const { keys } = await Preferences.keys();
        const shownIdsFromNative: string[] = [];
        for (const k of keys) {
            if (k.startsWith('shown_')) {
                const id = k.substring(6); // remove 'shown_'
                shownIdsFromNative.push(id);
            }
        }
        if (shownIdsFromNative.length > 0) {
            const key = 'shown_notifications_log';
            const raw = localStorage.getItem(key);
            const list: string[] = raw ? JSON.parse(raw) : [];
            let updated = false;
            for (const id of shownIdsFromNative) {
                shownInMemory.add(id);
                if (!list.includes(id)) {
                    list.push(id);
                    updated = true;
                }
            }
            if (updated) {
                if (list.length > 500) list.splice(0, list.length - 500);
                localStorage.setItem(key, JSON.stringify(list));
                console.log('[NativeSync] Synchronized native shown notifications count:', shownIdsFromNative.length);
            }
        }
    } catch (e) {
        console.error('Error synchronizing native shown notifications', e);
    }
};

export const hasNotificationBeenShown = (id: string): boolean => {
    if (!id) return false;
    if (shownInMemory.has(id)) return true;
    try {
        const key = 'shown_notifications_log';
        const raw = localStorage.getItem(key);
        const list: string[] = raw ? JSON.parse(raw) : [];
        const found = list.includes(id);
        if (found) {
            shownInMemory.add(id);
        }
        return found;
    } catch {
        return false;
    }
};

export const markNotificationAsShown = (id: string) => {
    if (!id) return;
    shownInMemory.add(id);
    try {
        const key = 'shown_notifications_log';
        const raw = localStorage.getItem(key);
        const list: string[] = raw ? JSON.parse(raw) : [];
        if (!list.includes(id)) {
            list.push(id);
            if (list.length > 500) {
                list.shift();
            }
            localStorage.setItem(key, JSON.stringify(list));
            
            // Sync to native SharedPreferences as well so background worker can see it!
            if (Capacitor.isNativePlatform()) {
                Preferences.set({ key: `shown_${id}`, value: 'true' }).catch(console.error);
            }

            // Sync to Service Worker CacheStorage
            if ('caches' in window) {
                caches.open('shown-notifications-v1').then(cache => {
                    cache.put(
                        new Request(`/notification-shown/${id}`),
                        new Response('true', { headers: { 'Content-Type': 'text/plain' } })
                    ).catch(() => {});
                }).catch(() => {});
            }
        }
    } catch (e) {
        console.error("markNotificationAsShown error", e);
    }
};

let lastNotificationString = '';
let lastNotificationTime = 0;

const getPwaIconUrl = (): string => {
  try {
    const cached = localStorage.getItem('app_data_settings');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.pwaIcon) {
        return parsed.pwaIcon;
      }
    }
  } catch (e) {
    console.error('Failed to parse settings for pwaIcon', e);
  }
  return '/pwa-192x192.png'; // default fallback
};

export const sendNotification = async (title: string, body: string, data?: any) => {
  if (!isNotificationEnabledInApp()) return;
  
  const idValue = data?.id || '';
  if (idValue && hasNotificationBeenShown(idValue)) {
      return; // Already notified on this device, do not duplicate!
  }

  const currentStr = `${title}:${body}`;
  const now = Date.now();
  if (currentStr === lastNotificationString && (now - lastNotificationTime < 5000)) {
      return; // Deduplicate identical notifications fired within 5 seconds
  }
  lastNotificationString = currentStr;
  lastNotificationTime = now;

  if (idValue) {
      markNotificationAsShown(idValue);
  }

  if (Capacitor.isNativePlatform()) {
      try {
          const isChatPV = data?.type === 'chat_pv' || data?.tab === 'chat' || (data?.url && String(data.url).includes('pv='));
          const channelId = isChatPV ? 'chat_pv_channel' : 'fcm_default_channel';
          const dlkamBridge = (window as any).DlkamAndroid;

          // 1. Primary path: Direct Native Android NotificationManager (0ms latency, guaranteed Delkam icon)
          if (dlkamBridge && typeof dlkamBridge.showNativeNotification === 'function') {
              const shown = dlkamBridge.showNativeNotification(
                  title,
                  body,
                  idValue || `dlkam_${now}`,
                  channelId,
                  data?.url || ''
              );
              if (shown) return;
          }

          // 2. Fallback path: Capacitor LocalNotifications with drawable/ic_stat_dlkam and drawable/ic_launcher
          await LocalNotifications.schedule({
              notifications: [
                  {
                      title: title,
                      body: body,
                      id: Math.floor(Math.random() * 2147483647),
                      extra: data || null,
                      channelId,
                      smallIcon: 'ic_stat_dlkam',
                      largeIcon: 'ic_launcher',
                      iconColor: '#2563EB',
                      sound: 'default'
                  }
              ]
          });
      } catch (e) { console.error('LocalNotifications error', e); }
      return;
  }

  // Electron Desktop Native Windows Notification (Toast / Action Center)
  if (isElectronDesktop()) {
      try {
          const electronAPI = (window as any).electronAPI;
          if (electronAPI && typeof electronAPI.showNativeNotification === 'function') {
              electronAPI.showNativeNotification(title, body, {
                  id: idValue,
                  url: data?.url,
                  tab: data?.tab,
                  type: data?.type
              });
              return;
          }
      } catch (e) {
          console.warn('Electron native notification dispatch error:', e);
      }
  }

  if (isTauriDesktop()) {
      try {
          if ((window as any).__TAURI__?.notification) {
              const tauriNotif = (window as any).__TAURI__.notification;
              const isGranted = await tauriNotif.isPermissionGranted();
              if (isGranted) {
                  tauriNotif.sendNotification({ title, body });
                  return;
              }
          }
          const tauriMod = await import('@tauri-apps/api/notification');
          const isGranted = await tauriMod.isPermissionGranted();
          if (isGranted) {
              tauriMod.sendNotification({ title, body });
              return;
          }
      } catch (e) {
          console.warn('Tauri native notification dispatch error:', e);
      }

      // Flash user attention on Windows taskbar if available
      try {
          if ((window as any).__TAURI__?.window?.appWindow) {
              (window as any).__TAURI__.window.appWindow.requestUserAttention(1);
          }
      } catch {}

      // Fallback to webview Notification if permitted
      if (typeof window !== 'undefined' && 'Notification' in window && typeof Notification === 'function') {
          try {
              if (Notification.permission === 'granted') {
                  const iconUrl = getPwaIconUrl();
                  new Notification(title, { body, icon: iconUrl, dir: 'rtl', lang: 'fa' });
                  return;
              }
          } catch (e) {}
      }
      return;
  }

  if (typeof window !== 'undefined' && 'Notification' in window && typeof Notification !== 'undefined' && Notification.permission === "granted") {
      try {
          const iconUrl = getPwaIconUrl();
          // Check if SW is active to show via SW (more reliable)
          if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
              try {
                  const registration = await navigator.serviceWorker.ready;
                  if (registration && registration.active && typeof registration.showNotification === 'function') {
                      await registration.showNotification(title, {
                          body,
                          icon: iconUrl,
                          dir: 'rtl',
                          lang: 'fa',
                          vibrate: [200, 100, 200],
                          tag: idValue || 'general',
                          renotify: true,
                          data: data
                      } as any);
                      return;
                  }
              } catch (_) {}
          }
          
          if (typeof Notification === 'function') {
              new Notification(title, { body, icon: iconUrl, dir: 'rtl', lang: 'fa' });
          }
      } catch (e) {
          console.error("Web Notification Error:", e);
      }
  }
};
