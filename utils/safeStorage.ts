/**
 * Enterprise Safe Storage Utility & Quota Recovery Engine
 * Prevents QuotaExceededError crashes across Web, Android (Capacitor), and Windows Desktop (Tauri).
 * Automatically cleans non-essential heavy offline caches and falls back to memory.
 */

// In-memory fallback map for values that exceed quota or if storage is blocked
const memoryStore = new Map<string, string>();

// List of volatile/non-essential cache keys that can be safely evicted when quota is exceeded
const VOLATILE_CACHE_KEYS = [
  'app_data_balances_statements',
  'SAYAN_TRAZ_AGING_CACHE',
  'chat_downloaded_files',
  'app_data_balances',
  'app_data_wh_tx',
  'app_data_trade',
  'ccti_archives',
  'app_data_balances_mappings',
  'PARTS_CACHE_KEY'
];

/**
 * Prunes heavy non-essential caches from localStorage to free up space.
 */
export const pruneStorageQuota = (): number => {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  let freedCount = 0;

  try {
    // 1. Remove large volatile cache keys first
    for (const key of VOLATILE_CACHE_KEYS) {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        freedCount++;
      }
    }

    // 2. Trim shown notifications log to the last 50 items
    try {
      const shownRaw = localStorage.getItem('shown_notifications_log');
      if (shownRaw) {
        const parsed = JSON.parse(shownRaw);
        if (Array.isArray(parsed) && parsed.length > 50) {
          localStorage.setItem('shown_notifications_log', JSON.stringify(parsed.slice(-50)));
        }
      }
    } catch {
      localStorage.removeItem('shown_notifications_log');
    }

    // 3. Trim offline chat cache to last 50 items if too large
    try {
      const chatRaw = localStorage.getItem('app_data_chat');
      if (chatRaw && chatRaw.length > 300000) {
        const parsed = JSON.parse(chatRaw);
        if (Array.isArray(parsed) && parsed.length > 50) {
          localStorage.setItem('app_data_chat', JSON.stringify(parsed.slice(-50)));
        }
      }
    } catch {
      localStorage.removeItem('app_data_chat');
    }

    // 4. If custom background image is excessively large base64, remove it to prevent total quota exhaustion
    try {
      const customBg = localStorage.getItem('app_custom_bg_image');
      if (customBg && customBg.length > 1000000) {
        // Larger than ~1MB base64
        console.warn('[SafeStorage] Evicting oversized base64 background wallpaper to recover storage quota.');
        localStorage.removeItem('app_custom_bg_image');
        freedCount++;
      }
    } catch {}

    console.info(`[SafeStorage] Quota prune completed. Evicted ${freedCount} volatile cache objects.`);
  } catch (err) {
    console.warn('[SafeStorage] Error during quota eviction:', err);
  }

  return freedCount;
};

/**
 * Checks whether an error is a QuotaExceeded DOMException.
 */
export const isQuotaError = (err: any): boolean => {
  if (!err) return false;
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014 ||
    (typeof err.message === 'string' && (
      err.message.toLowerCase().includes('quota') ||
      err.message.toLowerCase().includes('exceeded') ||
      err.message.toLowerCase().includes('storage full')
    ))
  );
};

export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return memoryStore.get(key) || null;
    try {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
      return memoryStore.get(key) || null;
    } catch {
      return memoryStore.get(key) || null;
    }
  },

  setItem: (key: string, value: string): void => {
    // Keep in-memory store in sync
    memoryStore.set(key, String(value));

    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      window.localStorage.setItem(key, String(value));
    } catch (err: any) {
      if (isQuotaError(err)) {
        console.warn(`[SafeStorage] LocalStorage quota exceeded when writing "${key}". Initiating auto-cleanup...`);
        pruneStorageQuota();
        // Retry writing the key
        try {
          window.localStorage.setItem(key, String(value));
          return;
        } catch (retryErr) {
          console.warn(`[SafeStorage] Storage still full after pruning. Key "${key}" safely saved in memory fallback.`);
          // Stored safely in memoryStore, do not re-throw
        }
      } else {
        console.warn(`[SafeStorage] Failed to set localStorage key "${key}":`, err);
      }
    }
  },

  removeItem: (key: string): void => {
    memoryStore.delete(key);
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.removeItem(key);
    } catch {}
  },

  clear: (): void => {
    memoryStore.clear();
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.clear();
    } catch {}
  }
};

/**
 * Installs global monkey-patch over window.localStorage to protect every existing call in the app
 * against QuotaExceededError crashes.
 */
export const installSafeStorageGlobalPolyfill = (): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if ((window as any).__SAFE_STORAGE_POLYFILLED__) return;

  try {
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    const originalGetItem = window.localStorage.getItem.bind(window.localStorage);
    const originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

    window.localStorage.setItem = function (key: string, value: string): void {
      memoryStore.set(key, String(value));
      try {
        originalSetItem(key, String(value));
      } catch (err: any) {
        if (isQuotaError(err)) {
          console.warn(`[SafeStorage Global] Quota exceeded for "${key}". Recovering space...`);
          pruneStorageQuota();
          try {
            originalSetItem(key, String(value));
            return;
          } catch (retryErr) {
            console.warn(`[SafeStorage Global] Storage remains full. Value for "${key}" kept in memory.`);
            // Safely swallowed to prevent React ErrorBoundary crashes
          }
        } else {
          console.warn(`[SafeStorage Global] Error writing "${key}":`, err);
        }
      }
    };

    window.localStorage.getItem = function (key: string): string | null {
      try {
        const res = originalGetItem(key);
        if (res !== null) return res;
        return memoryStore.get(key) || null;
      } catch {
        return memoryStore.get(key) || null;
      }
    };

    window.localStorage.removeItem = function (key: string): void {
      memoryStore.delete(key);
      try {
        originalRemoveItem(key);
      } catch {}
    };

    (window as any).__SAFE_STORAGE_POLYFILLED__ = true;
    console.info('[SafeStorage] Global storage quota protection active.');
  } catch (polyErr) {
    console.warn('[SafeStorage] Failed to install global polyfill:', polyErr);
  }
};
