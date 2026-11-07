import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Reuse existing app if already initialized
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
];

const provider = new GoogleAuthProvider();
GOOGLE_WORKSPACE_SCOPES.forEach(scope => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account',
});

export const isRunningInIframe = (): boolean => {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
};

export const openInStandaloneTab = () => {
  if (typeof window !== 'undefined') {
    window.open(window.location.href, '_blank');
  }
};

export const translateGoogleAuthError = (error: any): string => {
  const code = error?.code || '';
  const message = error?.message || '';

  if (code === 'auth/popup-blocked') {
    return 'پنجره پاپ‌آپ ورود گوگل توسط مرورگر مسدود شده است. لطفاً مسدودکننده پاپ‌آپ (Pop-up Blocker) را غیرفعال کنید یا برنامه را در یک تب مستقل باز فرمایید.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'دامنه پیش‌نمایش در لیست دامنه‌های مجاز فایربیس ثبت نشده است. لطفاً برنامه را در تب مستقل باز کنید یا دامنه پروژه فایربیس را بررسی فرمایید.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'یک درخواست ورود دیگر در حال پردازش بود. لطفاً یک بار دیگر دکمه اتصال را لمس کنید.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'پنجره ورود به حساب گوگل قبل از اتمام توسط شما بسته شد. برای اتصال لطفا دوباره تلاش کنید.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'ورود با گوگل در تنظیمات پروژه فایربیس فعال نشده است.';
  }
  if (code === 'auth/network-request-failed') {
    return 'خطای شبکه در ارتباط با سرورهای گوگل. لطفاً اتصال اینترنت خود را بررسی نمایید.';
  }
  if (code === 'auth/internal-error') {
    return 'خطای محیط پیش‌نمایش در ایجاد ارتباط با پاپ‌آپ. برای رفع، لطفاً برنامه را در یک تب جدید باز کنید.';
  }

  if (message.includes('accessToken')) {
    return 'احراز هویت انجام شد اما توکن دسترسی به تقویم و تسک‌ها دریافت نگردید. لطفاً تیک‌های دسترسی تقویم و وظایف را در صفحه ورود گوگل علامت بزنید.';
  }

  return message || 'خطای ناشناخته در اتصال به حساب گوگل';
};

// Google Identity Services (GSI) loader for reliable client-side OAuth without iframe domain restrictions
const loadGsiScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Window not available'));
    if ((window as any).google?.accounts?.oauth2) return resolve();

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', (e) => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;

    const timer = setTimeout(() => {
      reject(new Error('عدم دسترسی به سرورهای گوگل. در وضعیت اینترنت ملی یا شبکه داخلی، اتصال به گوگل در دسترس نیست.'));
    }, 6000);

    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = (err) => {
      clearTimeout(timer);
      reject(new Error('خطا در بارگذاری کتابخانه گوگل یا عدم اتصال اینترنت'));
    };
    document.head.appendChild(script);
  });
};

export const signInWithGsi = async (
  clientId: string,
  options?: { loginHint?: string; forceAccountSelection?: boolean }
): Promise<{ email: string; name: string; accessToken: string }> => {
  await loadGsiScript();
  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error('Google Identity Services not loaded');
  }

  // Disable auto-select so Google doesn't silently auto-pick the browser's active Google account
  try {
    google.accounts.id?.disableAutoSelect?.();
  } catch {}

  const promptValue = options?.forceAccountSelection !== false ? 'select_account consent' : 'select_account';

  return new Promise((resolve, reject) => {
    try {
      const clientConfig: any = {
        client_id: clientId,
        scope: GOOGLE_WORKSPACE_SCOPES.join(' ') + ' https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
        prompt: promptValue,
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            return reject(new Error(`خطای گوگل: ${tokenResponse.error_description || tokenResponse.error}`));
          }
          const accessToken = tokenResponse.access_token;
          if (!accessToken) {
            return reject(new Error('توکن دسترسی از گوگل دریافت نشد'));
          }

          try {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            const userInfo = await userInfoRes.json();
            resolve({
              email: userInfo.email || 'Google User',
              name: userInfo.name || '',
              accessToken
            });
          } catch {
            resolve({
              email: 'Google User',
              name: '',
              accessToken
            });
          }
        },
        error_callback: (err: any) => {
          reject(err);
        }
      };

      if (options?.loginHint) {
        clientConfig.login_hint = options.loginHint;
      }

      const client = google.accounts.oauth2.initTokenClient(clientConfig);

      client.requestAccessToken({
        prompt: promptValue,
        ...(options?.loginHint ? { hint: options.loginHint } : {})
      });
    } catch (e) {
      reject(e);
    }
  });
};

const GOOGLE_TOKEN_STORAGE_KEY_PREFIX = 'gw_access_token_';

let isSigningIn = false;
// In-memory token cache keyed strictly by user ID to prevent cross-account pollution on shared computers
const userTokenCache = new Map<string, string>();

export const getStoredGoogleTokenForUser = (userId?: string | number): string | null => {
  if (!userId) return null;
  const uid = String(userId);
  if (userTokenCache.has(uid)) {
    return userTokenCache.get(uid) || null;
  }
  try {
    const key = `${GOOGLE_TOKEN_STORAGE_KEY_PREFIX}${uid}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      userTokenCache.set(uid, stored);
      return stored;
    }
  } catch {}
  return null;
};

export const storeGoogleTokenForUser = (token: string, userId?: string | number) => {
  if (!userId) return;
  const uid = String(userId);
  userTokenCache.set(uid, token);
  try {
    const key = `${GOOGLE_TOKEN_STORAGE_KEY_PREFIX}${uid}`;
    localStorage.setItem(key, token);
    // Remove legacy global key to prevent cross-user token leakage
    localStorage.removeItem('gw_access_token_global');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('google-auth-sync', { detail: { token, userId: uid, action: 'login' } }));
    }
  } catch {}
};

export const removeGoogleTokenForUser = (userId?: string | number) => {
  if (userId) {
    const uid = String(userId);
    userTokenCache.delete(uid);
    try {
      const key = `${GOOGLE_TOKEN_STORAGE_KEY_PREFIX}${uid}`;
      localStorage.removeItem(key);
      localStorage.removeItem('gw_access_token_global');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('google-auth-sync', { detail: { token: null, userId: uid, action: 'logout' } }));
      }
    } catch {}
  } else {
    userTokenCache.clear();
    try {
      localStorage.removeItem('gw_access_token_global');
    } catch {}
  }
};

// Initialize Google OAuth state listener
export const initGoogleAuth = (
  onAuthSuccess?: (user: FirebaseUser, token: string) => void,
  onAuthFailure?: () => void,
  userId?: string | number
) => {
  return onAuthStateChanged(auth, async (user) => {
    const token = getStoredGoogleTokenForUser(userId);
    if (user && token) {
      if (onAuthSuccess) onAuthSuccess(user, token);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const signInWithGoogleWorkspace = async (
  userId?: string | number,
  options?: { loginHint?: string; forceAccountSelection?: boolean }
): Promise<{ user: { email?: string | null; displayName?: string | null; uid?: string }; accessToken: string } | null> => {
  isSigningIn = true;
  const clientId = (firebaseConfig as any)?.oAuthClientId;

  // Clear previous Firebase session first to guarantee isolation across users
  try {
    await auth.signOut();
  } catch {}

  try {
    const google = (typeof window !== 'undefined' && (window as any).google);
    google?.accounts?.id?.disableAutoSelect?.();
  } catch {}

  // 1. Try Google Identity Services (GIS) first for iframe-safe OAuth
  if (clientId) {
    try {
      const gsiRes = await signInWithGsi(clientId, options);
      if (userId) {
        storeGoogleTokenForUser(gsiRes.accessToken, userId);
      }
      return {
        user: {
          email: gsiRes.email,
          displayName: gsiRes.name,
          uid: gsiRes.email,
        },
        accessToken: gsiRes.accessToken
      };
    } catch (gsiErr: any) {
      console.warn('GIS sign in attempted, falling back to Firebase Auth:', gsiErr);
    }
  }

  // 2. Fallback to Firebase signInWithPopup
  try {
    const customProvider = new GoogleAuthProvider();
    GOOGLE_WORKSPACE_SCOPES.forEach(scope => customProvider.addScope(scope));
    customProvider.setCustomParameters({
      prompt: options?.forceAccountSelection !== false ? 'select_account consent' : 'select_account',
      ...(options?.loginHint ? { login_hint: options.loginHint } : {})
    });

    const result = await signInWithPopup(auth, customProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google');
    }

    if (userId) {
      storeGoogleTokenForUser(credential.accessToken, userId);
    }
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error('Google Sign-in error:', error);
    const friendlyMsg = translateGoogleAuthError(error);
    const enrichedError = new Error(friendlyMsg);
    (enrichedError as any).originalError = error;
    (enrichedError as any).code = error?.code;
    throw enrichedError;
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleAccessToken = async (userId?: string | number): Promise<string | null> => {
  return getStoredGoogleTokenForUser(userId);
};

export const logoutGoogleWorkspace = async (userId?: string | number) => {
  const currentToken = userId ? getStoredGoogleTokenForUser(userId) : null;
  
  try {
    await auth.signOut();
  } catch {}

  try {
    const google = (typeof window !== 'undefined' && (window as any).google);
    google?.accounts?.id?.disableAutoSelect?.();
    if (currentToken && google?.accounts?.oauth2?.revoke) {
      google.accounts.oauth2.revoke(currentToken, () => {});
    }
  } catch {}

  removeGoogleTokenForUser(userId);
};

// Types for Google Calendar & Tasks
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  htmlLink?: string;
  status?: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  updated?: string;
  completed?: string;
  webViewLink?: string;
}

// Fetch user's Google Calendar events (primary calendar)
export const fetchGoogleCalendarEvents = async (
  token: string,
  timeMin?: string,
  timeMax?: string
): Promise<GoogleCalendarEvent[]> => {
  const min = timeMin || new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const max = timeMax || new Date(new Date().setDate(new Date().getDate() + 30)).toISOString();
  
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.append('timeMin', min);
  url.searchParams.append('timeMax', max);
  url.searchParams.append('singleEvents', 'true');
  url.searchParams.append('orderBy', 'startTime');
  url.searchParams.append('maxResults', '50');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return data.items || [];
};

// Fetch user's Google Tasks
export const fetchGoogleTasks = async (token: string): Promise<GoogleTaskItem[]> => {
  // First fetch task lists
  const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listsRes.ok) {
    const errorText = await listsRes.text();
    throw new Error(`Google Tasks API error (${listsRes.status}): ${errorText}`);
  }

  const listsData = await listsRes.json();
  const lists = listsData.items || [];
  if (lists.length === 0) return [];

  // Fetch tasks from the first list (default list) or all lists
  const allTasks: GoogleTaskItem[] = [];
  for (const list of lists.slice(0, 3)) {
    try {
      const taskRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=true&maxResults=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        if (taskData.items) {
          allTasks.push(...taskData.items);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch tasks for list', list.id, e);
    }
  }

  return allTasks;
};

// Google Calendar List Interface
export interface GoogleCalendarItem {
  id: string;
  summary: string;
  description?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
}

// Fetch all Google Calendars of the connected user
export const fetchGoogleCalendarList = async (token: string): Promise<GoogleCalendarItem[]> => {
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.items || [];
  } catch (e) {
    console.warn('Failed to fetch calendar list from Google', e);
    return [];
  }
};

// Create a new event on user's Google Calendar
export const createGoogleCalendarEvent = async (
  token: string,
  event: {
    summary: string;
    description?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    location?: string;
  },
  calendarId: string = 'primary'
): Promise<GoogleCalendarEvent> => {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Calendar Create Error (${res.status}): ${errorText}`);
  }

  return await res.json();
};

// Local storage key for persistent custom calendar events/notes/loan reminders
export interface CustomCalendarItem {
  id: string;
  title: string;
  category: 'personal' | 'tasks' | 'loans' | 'reminders' | 'english' | 'holidays' | 'other';
  color: string;
  startDate: string; // YYYY-MM-DD
  startHour: number; // e.g. 8 (8:00 AM) or 8.5 (8:30 AM)
  durationHours: number; // e.g. 1
  description?: string;
  googleEventId?: string;
  syncedWithGoogle?: boolean;
}

export const getCustomCalendarItems = (userId?: string | number): CustomCalendarItem[] => {
  const uid = userId ? String(userId) : '';
  const result: CustomCalendarItem[] = [];
  const seenIds = new Set<string>();

  try {
    // 1. Check user-isolated key
    if (uid) {
      const userRaw = localStorage.getItem(`gw_custom_events_${uid}`);
      if (userRaw) {
        const parsed = JSON.parse(userRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            if (item && item.id && !seenIds.has(item.id)) {
              seenIds.add(item.id);
              result.push(item);
            }
          });
        }
      }
    }

    // 2. Fallback to legacy/shared key so previously saved events, loans, and notes are preserved
    const legacyRaw = localStorage.getItem('gw_custom_events');
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          if (item && item.id && !seenIds.has(item.id)) {
            // Include if not claimed by a different user
            if (!item.userId || item.userId === uid || !uid) {
              seenIds.add(item.id);
              result.push({ ...item, userId: uid || item.userId });
            }
          }
        });
      }
    }
  } catch (err) {
    console.error('Failed to get custom calendar items', err);
  }

  return result;
};

export const saveCustomCalendarItems = (items: CustomCalendarItem[], userId?: string | number) => {
  const uid = userId ? String(userId) : '';
  try {
    if (uid) {
      localStorage.setItem(`gw_custom_events_${uid}`, JSON.stringify(items));
    }
    // Also update legacy/shared storage with items tagged by userId for safety
    localStorage.setItem('gw_custom_events', JSON.stringify(items));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('custom-calendar-events-updated', { detail: { items, userId: uid } }));
    }
    // Persist to server in background if items changed
    if (items.length > 0) {
      fetch('/api/calendar-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items[0])
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to save custom calendar items', err);
  }
};

export const syncCalendarEventsWithServer = async (userId?: string | number): Promise<CustomCalendarItem[]> => {
  const uid = userId ? String(userId) : '';
  try {
    const res = await fetch(`/api/calendar-events${uid ? `?userId=${encodeURIComponent(uid)}` : ''}`);
    if (res.ok) {
      const serverEvents: CustomCalendarItem[] = await res.json();
      if (Array.isArray(serverEvents) && serverEvents.length > 0) {
        const local = getCustomCalendarItems(uid);
        const map = new Map<string, CustomCalendarItem>();
        serverEvents.forEach(item => { if (item?.id) map.set(item.id, item); });
        local.forEach(item => { if (item?.id) map.set(item.id, item); });
        const merged = Array.from(map.values());
        if (uid) {
          localStorage.setItem(`gw_custom_events_${uid}`, JSON.stringify(merged));
        }
        localStorage.setItem('gw_custom_events', JSON.stringify(merged));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('custom-calendar-events-updated', { detail: { items: merged, userId: uid } }));
        }
        return merged;
      }
    }
  } catch (e) {
    console.debug('Failed to sync calendar events with server', e);
  }
  return getCustomCalendarItems(uid);
};
