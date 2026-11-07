
import { PaymentOrder, User, UserRole, SystemSettings, ChatMessage, ChatGroup, GroupTask, TradeRecord, WarehouseItem, WarehouseTransaction } from '../types';
import { INITIAL_ORDERS } from '../constants';
import { Capacitor } from '@capacitor/core';
import { isTauriDesktop } from '../utils/platformDetection';

// تنظیمات آدرس سرور با اولویت متغیر محیطی
const ENV_API_URL = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL;
let DEFAULT_SERVER_URL = ENV_API_URL || 'https://dlkam.ir'; 

export let serverTimeOffset = 0;
export const getServerTime = (): number => Date.now() + serverTimeOffset;

// Authentication Token & Refresh Token Management
const AUTH_TOKEN_KEY = 'app_auth_token';
const REFRESH_TOKEN_KEY = 'app_refresh_token';

export const getAuthToken = (): string | null => {
    try {
        return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
        return null;
    }
};

export const setAuthToken = (token: string | null): void => {
    try {
        if (token) {
            localStorage.setItem(AUTH_TOKEN_KEY, token);
        } else {
            localStorage.removeItem(AUTH_TOKEN_KEY);
        }
    } catch {}
};

export const getRefreshToken = (): string | null => {
    try {
        return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
        return null;
    }
};

export const setRefreshToken = (token: string | null): void => {
    try {
        if (token) {
            localStorage.setItem(REFRESH_TOKEN_KEY, token);
        } else {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
        }
    } catch {}
};

// 401 Token Refresh Mutex & Queue
let isRefreshingToken = false;
let refreshTokenSubscribers: Array<(token: string | null) => void> = [];

const subscribeTokenRefresh = (cb: (token: string | null) => void) => {
    refreshTokenSubscribers.push(cb);
};

const onTokenRefreshed = (newToken: string | null) => {
    refreshTokenSubscribers.forEach(cb => cb(newToken));
    refreshTokenSubscribers = [];
};

const refreshAccessToken = async (): Promise<string | null> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
        let baseUrl = '';
        const host = getServerHost();
        if (Capacitor.isNativePlatform()) {
            baseUrl = `${host || DEFAULT_SERVER_URL}/api`;
        } else {
            baseUrl = host ? `${host}/api` : '/api';
        }

        const res = await fetch(`${baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });

        if (res.ok) {
            const data = await res.json();
            const newToken = data.token || data.accessToken;
            if (newToken) {
                setAuthToken(newToken);
                if (data.refreshToken) setRefreshToken(data.refreshToken);
                return newToken;
            }
        }
    } catch (e) {
        console.warn('Token refresh failed:', e);
    }
    return null;
};

export const getServerHost = (): string => {
    const inDesktop = isTauriDesktop();
    const isNativeCapacitor = Capacitor.isNativePlatform();

    // Check if we are running strictly in the AI Studio preview sandbox environment
    const isDevEnvironment = !isNativeCapacitor && !inDesktop && (
        typeof window !== 'undefined' && (
          window.location.hostname.includes('run.app') || 
          window.location.hostname.includes('google.com')
        )
    );

    if (isDevEnvironment) {
        if (localStorage.getItem('app_server_host')) {
            try { localStorage.removeItem('app_server_host'); } catch (e) {}
        }
        return '';
    }

    // Top Priority: Explicitly configured central server host in localStorage (Network Role / Settings)
    try {
        const stored = localStorage.getItem('app_server_host') || 
                       localStorage.getItem('sayan_remote_server_url') || 
                       localStorage.getItem('sayan_active_api_url');
        if (stored && stored.trim()) {
            let cleanStored = stored.trim().replace(/\/+$/, '');
            cleanStored = cleanStored.replace(/\/api\/?$/i, '');
            if (cleanStored) {
                // If stored host matches current origin on web, return empty string for clean relative requests
                if (typeof window !== 'undefined' && cleanStored === window.location.origin) {
                    return '';
                }
                return cleanStored;
            }
        }
    } catch (_) {}

    // On Native containers (Electron / Tauri / Capacitor) without explicit stored host:
    if (inDesktop || isNativeCapacitor) {
        if (DEFAULT_SERVER_URL) {
            let cleanDef = DEFAULT_SERVER_URL.trim().replace(/\/+$/, '');
            cleanDef = cleanDef.replace(/\/api\/?$/i, '');
            return cleanDef;
        }
        return '';
    }

    // Default Web Browser
    return '';
};

export const getEffectiveApiUrl = (path: string): string => {
    const host = getServerHost();
    let cleanPath = path.startsWith('/') ? path : `/${path}`;
    // Deduplicate /api prefix if host or cleanPath causes doubling
    if (host) {
        cleanPath = cleanPath.replace(/^\/api(?=\/|$)/, '');
        return `${host}/api${cleanPath}`;
    }
    if (!cleanPath.startsWith('/api')) {
        cleanPath = `/api${cleanPath}`;
    }
    return cleanPath;
};

export const resolveImageUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
        return url;
    }
    const host = getServerHost();
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    
    // On web, if no host is configured, we use relative paths to current origin.
    // On native or Tauri desktop, getServerHost() will return either stored host or DEFAULT_SERVER_URL.
    if (!host && !Capacitor.isNativePlatform() && !isTauriDesktop()) {
        return cleanUrl;
    }
    
    // Fallback for native, Tauri desktop, or if host is set
    const effectiveHost = host || DEFAULT_SERVER_URL;
    return `${effectiveHost}${cleanUrl}`;
};

export const setServerHost = (url: string) => {
    const cleanUrl = url.trim().replace(/\/$/, '');
    localStorage.setItem('app_server_host', cleanUrl);
};

let isFetchInterceptorInstalled = false;

export const installGlobalApiFetchInterceptor = () => {
    if (isFetchInterceptorInstalled || typeof window === 'undefined') return;
    isFetchInterceptorInstalled = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
        let urlString = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input as Request).url);

        const isApiCall = urlString.startsWith('/api/') || urlString === '/api' || urlString.startsWith('api/');
        const isUploadCall = urlString.startsWith('/uploads/');

        if (isApiCall) {
            const effectiveUrl = getEffectiveApiUrl(urlString);
            const token = getAuthToken();

            let headers: Headers;
            if (init?.headers) {
                headers = new Headers(init.headers);
            } else if (input instanceof Request && input.headers) {
                headers = new Headers(input.headers);
            } else {
                headers = new Headers();
            }

            if (token && !headers.has('Authorization')) {
                headers.set('Authorization', `Bearer ${token}`);
            }

            const updatedInit: RequestInit = {
                ...init,
                headers
            };

            if (typeof input === 'string' || input instanceof URL) {
                return originalFetch(effectiveUrl, updatedInit);
            } else {
                return originalFetch(new Request(effectiveUrl, input), updatedInit);
            }
        } else if (isUploadCall) {
            const effectiveUrl = resolveImageUrl(urlString);
            if (typeof input === 'string' || input instanceof URL) {
                return originalFetch(effectiveUrl, init);
            } else {
                return originalFetch(new Request(effectiveUrl, input), init);
            }
        }

        return originalFetch(input, init);
    };
};

try {
    installGlobalApiFetchInterceptor();
} catch (e) {
    console.error('Failed to auto-install global fetch interceptor:', e);
}

const isNativeApp = Capacitor.isNativePlatform();

const MOCK_USERS: User[] = [
    { id: '1', username: 'admin', password: '123', fullName: 'مدیر سیستم (آفلاین)', role: UserRole.ADMIN, canManageTrade: true }
];

export const LS_KEYS = {
    ORDERS: 'app_data_orders',
    USERS: 'app_data_users',
    SETTINGS: 'app_data_settings',
    CHAT: 'app_data_chat',
    GROUPS: 'app_data_groups',
    TASKS: 'app_data_tasks',
    TRADE: 'app_data_trade',
    WH_ITEMS: 'app_data_wh_items',
    WH_TX: 'app_data_wh_tx',
    NOTES: 'app_data_notes',
    EXIT_PERMITS: 'app_data_exit_permits',
    MEETINGS: 'app_data_meetings',
    PURCHASE_REQS: 'app_data_purchase_reqs',
    ANNOUNCEMENTS: 'app_data_announcements',
    TASK_GROUPS: 'app_data_task_groups'
};

// Exported so App.tsx can use it for instant load
export const getLocalData = <T>(key: string, defaultData: T): T => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultData;
    } catch {
        return defaultData;
    }
};

export interface ApiCallOptions {
    method?: string;
    body?: any;
    retries?: number;
    headers?: Record<string, string>;
}

export const apiCall = async <T>(
    endpoint: string, 
    methodOrOptions: string | ApiCallOptions = 'GET', 
    body?: any, 
    retries: number = 2
): Promise<T> => {
    let method = 'GET';
    let requestBody = body;
    let maxRetries = retries;

    if (typeof methodOrOptions === 'object' && methodOrOptions !== null) {
        method = methodOrOptions.method || 'GET';
        requestBody = methodOrOptions.body !== undefined ? methodOrOptions.body : body;
        if (typeof methodOrOptions.retries === 'number') {
            maxRetries = methodOrOptions.retries;
        }
    } else if (typeof methodOrOptions === 'string') {
        method = methodOrOptions;
    }

    let lastError: any = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            // Increased timeout significantly for mobile networks AND large file uploads (300s)
            const timeoutId = setTimeout(() => controller.abort(), 300000); 

            let baseUrl = '';
            const host = getServerHost();

            if (isNativeApp) {
                if (!host) {
                    throw new Error("SERVER_URL_MISSING");
                }
                baseUrl = `${host}/api`;
            } else {
                if (host) {
                    baseUrl = `${host}/api`;
                } else {
                    baseUrl = '/api';
                }
            }

            // Ensure endpoint starts with /
            let safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            // Prevent double /api/api if caller passes path prefixed with /api
            while (safeEndpoint.startsWith('/api/')) {
                safeEndpoint = safeEndpoint.substring(4);
            }
            if (safeEndpoint === '/api') {
                safeEndpoint = '';
            }
            const finalUrl = `${baseUrl}${safeEndpoint}`;

            console.log(`API calling (attempt ${attempt + 1}/${maxRetries + 1}): ${method} ${finalUrl}`); 

            const serializedBody = requestBody === undefined
                ? undefined
                : typeof requestBody === 'string'
                    ? requestBody
                    : JSON.stringify(requestBody);

            const token = getAuthToken();
            const requestHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                ...(typeof methodOrOptions === 'object' && methodOrOptions.headers ? methodOrOptions.headers : {})
            };
            if (token) {
                requestHeaders['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(finalUrl, {
                method,
                headers: requestHeaders,
                body: serializedBody,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const contentType = response.headers.get("content-type");
            const isJson = contentType && contentType.includes("application/json");

            // Handle 401 Unauthorized with Token Refresh
            if (response.status === 401 && !endpoint.includes('/login') && !endpoint.includes('/auth/refresh')) {
                const refreshToken = getRefreshToken();
                if (refreshToken) {
                    if (!isRefreshingToken) {
                        isRefreshingToken = true;
                        try {
                            const newToken = await refreshAccessToken();
                            isRefreshingToken = false;
                            onTokenRefreshed(newToken);
                            if (newToken) {
                                // Retry request with new token
                                requestHeaders['Authorization'] = `Bearer ${newToken}`;
                                const retryResponse = await fetch(finalUrl, {
                                    method,
                                    headers: requestHeaders,
                                    body: serializedBody
                                });
                                if (retryResponse.ok) {
                                    return await (isJson ? retryResponse.json() : ({ success: true } as unknown as T));
                                }
                            }
                        } catch (refreshErr) {
                            isRefreshingToken = false;
                            onTokenRefreshed(null);
                        }
                    } else {
                        // Queue request until active refresh completes
                        const retryWithNewToken = await new Promise<boolean>((resolve) => {
                            subscribeTokenRefresh((newToken) => {
                                resolve(!!newToken);
                            });
                        });
                        if (retryWithNewToken) {
                            const currentToken = getAuthToken();
                            if (currentToken) {
                                requestHeaders['Authorization'] = `Bearer ${currentToken}`;
                                const retryResponse = await fetch(finalUrl, {
                                    method,
                                    headers: requestHeaders,
                                    body: serializedBody
                                });
                                if (retryResponse.ok) {
                                    return await (isJson ? retryResponse.json() : ({ success: true } as unknown as T));
                                }
                            }
                        }
                    }
                }
            }

            // Sync server and client clocks using standard response 'date' header
            const serverDateStr = response.headers.get('date');
            if (serverDateStr) {
                const serverTime = new Date(serverDateStr).getTime();
                if (!isNaN(serverTime)) {
                    serverTimeOffset = serverTime - Date.now();
                }
            }

            if (response.ok) {
                let data;
                if (isJson) {
                    try {
                        data = await response.json();
                    } catch (jsonErr) {
                        throw new Error("پاسخ سرور در قالب معتبر JSON نبود. احتمالاً مشکلی در پروکسی یا شبکه وجود دارد.");
                    }
                } else {
                    data = { success: true } as unknown as T;
                }

                // --- NON-BLOCKING BACKGROUND CACHING ---
                // Deferred to background tick so large JSON.stringify calls never block UI rendering or modal close
                if (method === 'GET' || ((method === 'POST' || method === 'PUT' || method === 'DELETE') && Array.isArray(data))) {
                    setTimeout(() => {
                        try {
                            const capArray = (arr: any, limit: number = 100) => {
                                if (Array.isArray(arr)) {
                                    return JSON.stringify(arr.slice(-limit));
                                }
                                return JSON.stringify(arr);
                            };
                            if (endpoint === '/orders') localStorage.setItem(LS_KEYS.ORDERS, capArray(data, 100));
                            else if (endpoint === '/users') localStorage.setItem(LS_KEYS.USERS, capArray(data, 100));
                            else if (endpoint === '/settings') localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(data));
                            else if (endpoint === '/chat') localStorage.setItem(LS_KEYS.CHAT, capArray(data, 50));
                            else if (endpoint === '/trade' || endpoint.startsWith('/trade/')) localStorage.setItem(LS_KEYS.TRADE, capArray(data, 50));
                            else if (endpoint === '/customer-balances') localStorage.setItem('app_data_balances', capArray(data, 100));
                            else if (endpoint === '/customer-balances/chat-codes') localStorage.setItem('app_data_balances_mappings', capArray(data, 100));
                            else if (endpoint === '/warehouse/items') localStorage.setItem(LS_KEYS.WH_ITEMS, capArray(data, 100));
                            else if (endpoint === '/warehouse/transactions') localStorage.setItem(LS_KEYS.WH_TX, capArray(data, 50));
                            else if (endpoint === '/notes') localStorage.setItem(LS_KEYS.NOTES, capArray(data, 50));
                            else if (endpoint === '/exit-permits') localStorage.setItem(LS_KEYS.EXIT_PERMITS, capArray(data, 50));
                            else if (endpoint === '/meetings') localStorage.setItem(LS_KEYS.MEETINGS, capArray(data, 50));
                            else if (endpoint === '/purchase-requests') localStorage.setItem(LS_KEYS.PURCHASE_REQS, capArray(data, 50));
                            else if (endpoint === '/announcements') localStorage.setItem(LS_KEYS.ANNOUNCEMENTS, capArray(data, 30));
                            else if (endpoint === '/groups') localStorage.setItem(LS_KEYS.GROUPS, capArray(data, 50));
                            else if (endpoint === '/task-groups') localStorage.setItem(LS_KEYS.TASK_GROUPS, capArray(data, 50));
                            else if (endpoint === '/tasks') localStorage.setItem(LS_KEYS.TASKS, capArray(data, 50));
                        } catch (cacheError) {
                            console.warn("Cache write failed (storage full?)", cacheError);
                        }
                    }, 80);
                }

                return data;
            } else {
                // Server returned non-200 error code
                let serverErrorMsg = `خطای سرور: ${response.status}`;
                if (isJson) {
                    try {
                        const errData = await response.json();
                        if (errData && (errData.error || errData.message)) {
                            serverErrorMsg = errData.error || errData.message;
                        }
                    } catch (e) {
                        // Fallback to text if JSON parse failed
                    }
                } else {
                    try {
                        const text = await response.text();
                        if (text && text.length < 500 && !text.startsWith('<!')) {
                            serverErrorMsg = text;
                        }
                    } catch (e) {}
                }

                // If 502/503/504 or server busy, retry if attempts remain
                if ((response.status >= 500 || response.status === 429) && attempt < retries) {
                    console.warn(`Server error ${response.status}, retrying in ${(attempt + 1) * 350}ms...`);
                    await new Promise(r => setTimeout(r, (attempt + 1) * 350));
                    continue;
                }

                throw new Error(serverErrorMsg);
            }

        } catch (error: any) {
            lastError = error;
            if (error.message === "SERVER_URL_MISSING") {
                throw error;
            }
            // Retry on network errors if attempts remain
            if (attempt < retries && !error.message?.includes('SERVER_URL_MISSING') && !error.message?.includes('409') && !error.message?.includes('403')) {
                console.warn(`Network error on ${method} ${endpoint}, retrying in ${(attempt + 1) * 350}ms...`, error);
                await new Promise(r => setTimeout(r, (attempt + 1) * 350));
                continue;
            }
            break;
        }
    }

    console.warn(`API Error for ${endpoint}:`, lastError);

    if (endpoint === '/login' && method === 'POST') {
         if (lastError?.message?.includes("Server Error") || (lastError?.message && lastError.message.includes("خطا"))) throw lastError; 
         throw new Error('اتصال به سرور برقرار نشد. آدرس سرور یا اینترنت را بررسی کنید.');
    }

    // --- CACHE FALLBACK (READ-ONLY) ---
    // If network fails, return cached data to prevent empty UI
    if (method === 'GET') {
        if (endpoint === '/orders') return getLocalData<any>(LS_KEYS.ORDERS, INITIAL_ORDERS);
        if (endpoint === '/trade') return getLocalData<any>(LS_KEYS.TRADE, []);
        if (endpoint === '/customer-balances') return getLocalData<any>('app_data_balances', { balances: [] });
        if (endpoint === '/customer-balances/chat-codes') return getLocalData<any>('app_data_balances_mappings', []);
        if (endpoint === '/customer-balances/statements/all') return getLocalData<any>('app_data_balances_statements', []);
        if (endpoint === '/warehouse/items') return getLocalData<any>(LS_KEYS.WH_ITEMS, []);
        if (endpoint === '/warehouse/transactions') return getLocalData<any>(LS_KEYS.WH_TX, []);
        if (endpoint === '/settings') return getLocalData<any>(LS_KEYS.SETTINGS, { currentTrackingNumber: 1000 });
        if (endpoint === '/chat') return getLocalData<any>(LS_KEYS.CHAT, []);
        if (endpoint === '/users') return getLocalData<any>(LS_KEYS.USERS, MOCK_USERS);
        if (endpoint === '/notes') return getLocalData<any>(LS_KEYS.NOTES, []);
        if (endpoint === '/exit-permits') return getLocalData<any>(LS_KEYS.EXIT_PERMITS, []);
        if (endpoint === '/meetings') return getLocalData<any>(LS_KEYS.MEETINGS, []);
        if (endpoint === '/purchase-requests') return getLocalData<any>(LS_KEYS.PURCHASE_REQS, []);
        if (endpoint === '/announcements') return getLocalData<any>(LS_KEYS.ANNOUNCEMENTS, []);
        if (endpoint === '/groups') return getLocalData<any>(LS_KEYS.GROUPS, []);
        if (endpoint === '/task-groups') return getLocalData<any>(LS_KEYS.TASK_GROUPS, []);
        if (endpoint === '/tasks') return getLocalData<any>(LS_KEYS.TASKS, []);
    }

    throw lastError || new Error("خطای برقراری ارتباط با سرور");
};
