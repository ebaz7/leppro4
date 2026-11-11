import { getEffectiveApiUrl } from './apiService';
import { isTauriDesktop, isMobileApp, isWebApp, isElectronDesktop, getDesktopRuntime } from '../utils/platformDetection';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import toast from 'react-hot-toast';

export interface AppVersionInfo {
  version: string;
  webVersion?: string | null;
  electronLatestVersion?: string | null;
  tauriLatestVersion?: string | null;
  desktopLatestVersion?: string | null;
  androidLatestVersion?: string | null;
  hasDesktopInstaller?: boolean;
  hasElectronInstaller?: boolean;
  hasTauriInstaller?: boolean;
  hasAndroidInstaller?: boolean;
  desktopFileName?: string | null;
  desktopFileSize?: number;
  androidFileName?: string | null;
  androidFileSize?: number;
  buildNumber: string;
  title?: string;
  releaseNotes?: string;
  timestamp?: number;
  downloadUrl?: string;
  androidDownloadUrl?: string;
  forceUpdate?: boolean;
  updateIntervalMinutes?: number;
  autoCheck?: boolean;
  targetPlatform?: string;
}

// Current client build embedded in the bundle
export const CURRENT_CLIENT_BUILD: AppVersionInfo = {
  version: '1.0.29',
  buildNumber: '10029',
  title: 'نسخه جاری',
  releaseNotes: 'نسخه پایدار سامانه مالی و بازرگانی'
};

// Helper: compare semantic versions (e.g. "1.0.27" vs "1.0.26")
export function compareSemVer(v1: string, v2: string): number {
  const p1 = (v1 || '').replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = (v2 || '').replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

// Detect if running inside Android Capacitor Native Shell
export function isCapacitorAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as any;
  return Boolean(
    (win.Capacitor?.isNativePlatform?.() && win.Capacitor?.getPlatform?.() === 'android') ||
    (win.Capacitor?.platform === 'android') ||
    Boolean(win.DlkamAndroid) ||
    (isMobileApp() && /android/i.test(navigator.userAgent))
  );
}

// Build an Android intent:// URL that forces Capacitor WebView to open the URL in Chrome / System Browser
export function buildAndroidBrowserIntentUrl(httpUrl: string): string {
  try {
    const clean = httpUrl.trim();
    if (clean.startsWith('https://')) {
      const rest = clean.substring('https://'.length);
      return `intent://${rest}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
    }
    if (clean.startsWith('http://')) {
      const rest = clean.substring('http://'.length);
      return `intent://${rest}#Intent;scheme=http;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
    }
  } catch (_) {}
  return httpUrl;
}

function extractSemVerFromText(text?: string | null): string | null {
  if (!text) return null;
  const m = String(text).match(/(?:v|_|-|\s)(\d+\.\d+\.\d+)/i) || String(text).match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

export function getRecordedInstalledVersion(runtime?: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const rt = runtime || getDesktopRuntime();
    return localStorage.getItem(`dlkam_installed_version_${rt}`) || null;
  } catch {
    return null;
  }
}

export function markPlatformUpdateInstalled(version?: string | null, runtimeOverride?: string): void {
  if (typeof window === 'undefined') return;
  const cleanVer = extractSemVerFromText(version) || String(version || '').trim();
  if (!cleanVer || cleanVer === 'latest') return;
  try {
    const rt = runtimeOverride || (isCapacitorAndroid() ? 'android' : getDesktopRuntime());
    const currentRecorded = localStorage.getItem(`dlkam_installed_version_${rt}`);
    if (!currentRecorded || compareSemVer(cleanVer, currentRecorded) >= 0) {
      localStorage.setItem(`dlkam_installed_version_${rt}`, cleanVer);
    }
    const sig = rt === 'android' ? `android_${cleanVer}` : `${rt}_desktop_${cleanVer}`;
    localStorage.setItem(`dismissed_update_sig_${rt}`, sig);
    localStorage.setItem('dismissed_update_sig', sig);
    sessionStorage.setItem('dismissed_update_sig', sig);
    window.dispatchEvent(new CustomEvent('app:update-installed', { detail: { version: cleanVer, runtime: rt } }));
  } catch (_) {}
}

// Dismiss an update so it does not keep showing up across sessions for the same version
export function dismissUpdate(serverInfo?: AppVersionInfo | null): void {
  if (typeof window === 'undefined') return;
  const isAndroid = isCapacitorAndroid();
  const isDesktop = isTauriDesktop();
  const runtime = isAndroid ? 'android' : getDesktopRuntime();

  const targetVer = isAndroid
    ? (serverInfo?.androidLatestVersion || serverInfo?.version || '')
    : isDesktop
      ? ((runtime === 'electron' ? serverInfo?.electronLatestVersion : serverInfo?.tauriLatestVersion) || serverInfo?.desktopLatestVersion || serverInfo?.version || '')
      : (serverInfo?.webVersion || serverInfo?.version || '');

  const serverBuild = serverInfo?.buildNumber || targetVer;
  const serverTimestamp = Number(serverInfo?.timestamp) || 0;
  const sig = isAndroid
    ? `android_${targetVer}`
    : isDesktop
      ? `${runtime}_desktop_${targetVer}`
      : `${targetVer}_${serverBuild}_${serverTimestamp}`;

  try {
    sessionStorage.setItem('dismissed_update_sig', sig);
    localStorage.setItem('dismissed_update_sig', sig);
    localStorage.setItem(`dismissed_update_sig_${runtime}`, sig);
    if (isDesktop && targetVer) {
      localStorage.setItem(`dlkam_installed_version_${runtime}`, targetVer);
    }
  } catch (_) {}
}

// Get native client version asynchronously if running on Tauri, Electron, or Android Capacitor
export async function getNativeClientVersion(): Promise<{ version: string; buildNumber: string }> {
  if (typeof window === 'undefined') {
    return { version: CURRENT_CLIENT_BUILD.version, buildNumber: CURRENT_CLIENT_BUILD.buildNumber };
  }

  const win = window as any;
  let detectedVersion = CURRENT_CLIENT_BUILD.version;
  let detectedBuild = CURRENT_CLIENT_BUILD.buildNumber;

  // 1. Check Electron or Tauri — authoritative version of the installed Windows .exe binary
  try {
    if (isTauriDesktop()) {
      const runtime = getDesktopRuntime();
      if (win.electronAPI?.getVersion) {
        const ver = await win.electronAPI.getVersion();
        if (ver) {
          detectedVersion = String(ver).trim();
          detectedBuild = detectedVersion;
        }
      } else if (win.electron?.getVersion) {
        const ver = await win.electron.getVersion();
        if (ver) {
          detectedVersion = String(ver).trim();
          detectedBuild = detectedVersion;
        }
      } else {
        let tauriVer: string | null = null;
        if (win.__TAURI__?.app?.getVersion) {
          try {
            tauriVer = await win.__TAURI__.app.getVersion();
          } catch (_) {}
        }
        if (!tauriVer) {
          try {
            const { getVersion } = await import('@tauri-apps/api/app');
            tauriVer = await getVersion();
          } catch (_) {}
        }
        if (!tauriVer) {
          try {
            const { invoke } = await import('@tauri-apps/api/tauri');
            tauriVer = await invoke<string>('get_app_version');
          } catch (_) {}
        }
        if (tauriVer) {
          detectedVersion = String(tauriVer).trim();
          detectedBuild = detectedVersion;
        }
      }

      // Also honor recorded installed version if higher (e.g. right after running installer)
      const recordedVer = getRecordedInstalledVersion(runtime);
      if (recordedVer && compareSemVer(recordedVer, detectedVersion) > 0) {
        detectedVersion = recordedVer;
        detectedBuild = recordedVer;
      }

      return { version: detectedVersion, buildNumber: detectedBuild };
    }
  } catch (_) {}

  // 2. Check Capacitor App.getInfo() — authoritative version of the installed Android .apk binary
  try {
    if (isCapacitorAndroid()) {
      if (win.Capacitor?.Plugins?.App?.getInfo) {
        const info = await win.Capacitor.Plugins.App.getInfo();
        if (info?.version) {
          detectedVersion = String(info.version).trim();
          detectedBuild = String(info.build || info.version).trim();
        }
      }
      const recordedAndroidVer = getRecordedInstalledVersion('android');
      if (recordedAndroidVer && compareSemVer(recordedAndroidVer, detectedVersion) > 0) {
        detectedVersion = recordedAndroidVer;
      }
      return { version: detectedVersion, buildNumber: detectedBuild };
    }
  } catch (_) {}

  return { version: detectedVersion, buildNumber: detectedBuild };
}

// Check for updates by querying /api/version and /api/desktop/check-update
// IMPORTANT:
// - On Windows Desktop (Tauri / Electron): ONLY announces an update when an actual .exe/.msi file on disk for THAT platform has a higher version than the installed binary.
// - On Android (Capacitor): ONLY announces an update when an actual .apk file on disk has a higher version than the installed Android APK binary.
export async function checkServerUpdate(): Promise<{ hasUpdate: boolean; serverInfo: AppVersionInfo | null }> {
  try {
    const runtime = getDesktopRuntime();
    const versionApiUrl = getEffectiveApiUrl(`/api/version?runtime=${runtime}&t=${Date.now()}`);
    let data: AppVersionInfo | null = null;
    let desktopDownloadUrl = '';
    let androidDownloadUrl = '';

    try {
      const res = await fetch(versionApiUrl, {
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'X-Client-Runtime': runtime }
      });
      if (res.ok) {
        data = await res.json();
        if (data?.androidDownloadUrl) {
          androidDownloadUrl = data.androidDownloadUrl;
        }
      }
    } catch (e) {
      console.debug('Failed fetching /api/version:', e);
    }

    const isDesktop = isTauriDesktop();
    const isAndroid = isCapacitorAndroid();

    // If on Desktop, also query desktop specific endpoint with explicit runtime
    if (isDesktop) {
      try {
        const desktopApiUrl = getEffectiveApiUrl(`/api/desktop/check-update?runtime=${runtime}&t=${Date.now()}`);
        const desktopRes = await fetch(desktopApiUrl, {
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'X-Client-Runtime': runtime }
        });
        if (desktopRes.ok) {
          const desktopData = await desktopRes.json();
          if (desktopData) {
            desktopDownloadUrl = desktopData.directDownloadUrl || desktopData.updateUrl || '';
            if (data) {
              if (desktopData.desktopLatestVersion || desktopData.latestVersion) {
                data.desktopLatestVersion = desktopData.desktopLatestVersion || desktopData.latestVersion;
              }
              if (typeof desktopData.hasDesktopInstaller === 'boolean') {
                data.hasDesktopInstaller = desktopData.hasDesktopInstaller;
              }
              if (desktopData.desktopFileName) data.desktopFileName = desktopData.desktopFileName;
              if (desktopData.desktopFileSize) data.desktopFileSize = desktopData.desktopFileSize;
            } else {
              data = {
                version: desktopData.desktopLatestVersion || desktopData.latestVersion || '',
                desktopLatestVersion: desktopData.desktopLatestVersion || desktopData.latestVersion || null,
                hasDesktopInstaller: desktopData.hasDesktopInstaller,
                desktopFileName: desktopData.desktopFileName || null,
                desktopFileSize: desktopData.desktopFileSize || 0,
                buildNumber: desktopData.latestVersion || '',
                releaseNotes: desktopData.releaseNotes || 'به‌روزرسانی نرم‌افزار دسکتاپ',
                title: 'نسخه جدید ویندوز آماده نصب'
              };
            }
          }
        }
      } catch (e) {
        console.debug('Failed fetching /api/desktop/check-update:', e);
      }
    }

    if (!data) {
      return { hasUpdate: false, serverInfo: null };
    }

    if (typeof window === 'undefined') {
      return { hasUpdate: false, serverInfo: data };
    }

    const nativeClient = await getNativeClientVersion();
    const clientVer = nativeClient.version;
    const clientBuild = nativeClient.buildNumber;

    // --- 1. ANDROID NATIVE APK CHECK (Strictly file-based) ---
    if (isAndroid) {
      const actualApkVer = data.androidLatestVersion || '';
      if (!actualApkVer || data.hasAndroidInstaller === false) {
        return { hasUpdate: false, serverInfo: data };
      }

      const defaultAndroidUrl = getEffectiveApiUrl(`/api/downloads/latest-android?v=${encodeURIComponent(actualApkVer)}`);
      data.version = actualApkVer;
      data.androidDownloadUrl = androidDownloadUrl
        ? (androidDownloadUrl.startsWith('http') ? androidDownloadUrl : getEffectiveApiUrl(androidDownloadUrl))
        : defaultAndroidUrl;
      data.downloadUrl = data.androidDownloadUrl;

      const currentServerSig = `android_${actualApkVer}`;
      const sessionDismissedSig = sessionStorage.getItem('dismissed_update_sig');
      const localDismissedSig = localStorage.getItem('dismissed_update_sig_android') || localStorage.getItem('dismissed_update_sig');
      if (sessionDismissedSig === currentServerSig || localDismissedSig === currentServerSig) {
        return { hasUpdate: false, serverInfo: data };
      }

      const semVerComp = compareSemVer(actualApkVer, clientVer);
      return { hasUpdate: semVerComp > 0, serverInfo: data };
    }

    // --- 2. WINDOWS DESKTOP (Electron or Tauri) CHECK (Strictly file-based & segregated) ---
    if (isDesktop) {
      const isElectron = runtime === 'electron';
      const actualDesktopVer = (isElectron ? data.electronLatestVersion : data.tauriLatestVersion) || data.desktopLatestVersion || '';
      const hasSpecificInstaller = isElectron ? data.hasElectronInstaller : data.hasTauriInstaller;

      // If server does not have an actual compiled installer file on disk for THIS runtime, NEVER claim update
      if (!actualDesktopVer || hasSpecificInstaller === false || data.hasDesktopInstaller === false) {
        return { hasUpdate: false, serverInfo: data };
      }

      const defaultDesktopUrl = getEffectiveApiUrl(`/api/downloads/latest-desktop?v=${encodeURIComponent(actualDesktopVer)}&ext=exe&runtime=${runtime}`);
      data.version = actualDesktopVer;
      const rawUrl = desktopDownloadUrl || data.downloadUrl || '';
      data.downloadUrl = rawUrl
        ? (rawUrl.startsWith('http') ? rawUrl : getEffectiveApiUrl(rawUrl))
        : defaultDesktopUrl;

      // Runtime-specific signature so Electron and Tauri don't collide
      const currentServerSig = `${runtime}_desktop_${actualDesktopVer}`;
      const sessionDismissedSig = sessionStorage.getItem('dismissed_update_sig');
      const localDismissedSig = localStorage.getItem(`dismissed_update_sig_${runtime}`) || localStorage.getItem('dismissed_update_sig');
      if (sessionDismissedSig === currentServerSig || localDismissedSig === currentServerSig) {
        return { hasUpdate: false, serverInfo: data };
      }

      const semVerComp = compareSemVer(actualDesktopVer, clientVer);
      if (semVerComp <= 0) {
        return { hasUpdate: false, serverInfo: data };
      }

      // Check if this exact installer file is ALREADY present in DlkamFiles from a prior session's save_and_open_local_file!
      // Because save_and_open_local_file downloads AND immediately executes the installer, if the file is already sitting
      // in DlkamFiles on startup, the user already downloaded and ran this installer!
      const exeFileName = data.desktopFileName || (isElectron ? `dlkam-electron-setup-v${actualDesktopVer}.exe` : `dlkam-desktop-v${actualDesktopVer}.exe`);
      const justDownloadedInSession = sessionStorage.getItem('dlkam_just_downloaded_exe');
      if (justDownloadedInSession !== exeFileName) {
        try {
          const alreadyDownloadedAndLaunched = await isDesktopUpdateFileReady(exeFileName);
          if (alreadyDownloadedAndLaunched) {
            markPlatformUpdateInstalled(actualDesktopVer, runtime);
            return { hasUpdate: false, serverInfo: data };
          }
        } catch (_) {}
      }

      return { hasUpdate: true, serverInfo: data };
    }

    // --- 3. WEB BROWSER CHECK ---
    data.downloadUrl = '';
    const serverVer = data.webVersion || data.version || data.buildNumber;
    const serverBuild = data.buildNumber || serverVer;
    const serverTimestamp = Number(data.timestamp) || 0;
    const currentServerSig = `${serverVer}_${serverBuild}_${serverTimestamp}`;

    const sessionDismissedSig = sessionStorage.getItem('dismissed_update_sig');
    const localDismissedSig = localStorage.getItem('dismissed_update_sig_web') || localStorage.getItem('dismissed_update_sig');
    if (sessionDismissedSig === currentServerSig || localDismissedSig === currentServerSig) {
      return { hasUpdate: false, serverInfo: data };
    }

    const lastAppliedSig = localStorage.getItem('last_applied_release_sig');
    if (lastAppliedSig && lastAppliedSig === currentServerSig) {
      return { hasUpdate: false, serverInfo: data };
    }

    const appliedVer = localStorage.getItem('applied_server_version');
    const appliedBuild = localStorage.getItem('applied_server_build');
    if (appliedVer === serverVer && appliedBuild === serverBuild) {
      return { hasUpdate: false, serverInfo: data };
    }

    const baselineBuild = localStorage.getItem('baseline_server_build');
    const baselineTimestamp = Number(localStorage.getItem('baseline_server_timestamp')) || 0;
    const semVerComp = compareSemVer(serverVer, clientVer);

    if (semVerComp < 0) {
      return { hasUpdate: false, serverInfo: data };
    }
    if (semVerComp > 0) {
      return { hasUpdate: true, serverInfo: data };
    }
    if (serverBuild !== clientBuild && baselineBuild && baselineBuild !== serverBuild) {
      if (serverTimestamp > 0 && baselineTimestamp > 0 && serverTimestamp > baselineTimestamp) {
        return { hasUpdate: true, serverInfo: data };
      }
    }

    return { hasUpdate: false, serverInfo: data };
  } catch (error) {
    console.debug('Update check failed (offline or network error):', error);
    return { hasUpdate: false, serverInfo: null };
  }
}

// Publish a new update to all clients
export async function publishApplicationUpdate(payload: {
  version: string;
  title?: string;
  releaseNotes?: string;
  sendToBots?: boolean;
}): Promise<{ success: boolean; data?: AppVersionInfo; error?: string }> {
  try {
    const publishUrl = getEffectiveApiUrl('/api/version/publish');
    const res = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'خطا در انتشار به‌روزرسانی' };
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('last_applied_release_sig');
      localStorage.removeItem('applied_server_version');
      localStorage.removeItem('applied_server_build');
      sessionStorage.removeItem('dismissed_update_sig');
      localStorage.removeItem('dismissed_update_sig');
      localStorage.setItem('baseline_server_build', 'old_version_baseline');
      localStorage.setItem('baseline_server_timestamp', '0');
      window.dispatchEvent(new CustomEvent('app:update-published', { detail: data }));
    }

    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e.message || 'خطا در برقراری ارتباط با سرور' };
  }
}

// Helper: Convert Blob to Base64 string without data: prefix
function blobToRawBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.substring(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Helper: Fetch binary file with real-time progress reporting
async function fetchBinaryWithProgress(
  url: string,
  expectedSize: number = 0,
  onProgress?: (pct: number, statusText: string) => void
): Promise<Blob> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length')) || expectedSize || 18 * 1024 * 1024;
  if (!response.body || !response.body.getReader) {
    onProgress?.(60, 'در حال دریافت فایل...');
    const blob = await response.blob();
    onProgress?.(100, 'دریافت کامل شد ✓');
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedLength += value.length;
      const pct = Math.min(99, Math.max(1, Math.round((receivedLength / contentLength) * 100)));
      const loadedMB = (receivedLength / (1024 * 1024)).toFixed(1);
      const totalMB = (contentLength / (1024 * 1024)).toFixed(1);
      onProgress?.(pct, `در حال دانلود: ${pct}% (${loadedMB} از ${totalMB} مگابایت)`);
    }
  }

  onProgress?.(100, 'دانلود کامل شد — در حال باز کردن نصب‌کننده...');
  return new Blob(chunks as BlobPart[]);
}

// Trigger a single direct external browser download (when the user clicks "لینک مستقیم" or when running an older desktop shell without in-app file saving)
export async function openDirectUpdateLink(rawUrl: string): Promise<void> {
  if (!rawUrl || typeof window === 'undefined') return;
  const win = window as any;
  const isAndroid = isCapacitorAndroid();
  const isDesktop = isTauriDesktop();

  let fullUrl = rawUrl;
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    fullUrl = getEffectiveApiUrl(fullUrl);
  }
  const cacheBustedUrl = fullUrl.includes('?') ? `${fullUrl}&t=${Date.now()}` : `${fullUrl}?t=${Date.now()}`;

  if (isAndroid) {
    try {
      if (win.DlkamAndroid && typeof win.DlkamAndroid.openExternalUrl === 'function') {
        win.DlkamAndroid.openExternalUrl(cacheBustedUrl);
        return;
      }
    } catch (_) {}
    const intentUrl = buildAndroidBrowserIntentUrl(cacheBustedUrl);
    try {
      window.location.href = intentUrl;
      return;
    } catch (_) {}
  }

  if (isDesktop) {
    try {
      const electronBridge = win.electronAPI || win.electron;
      if (electronBridge?.openExternal) {
        await electronBridge.openExternal(cacheBustedUrl);
        return;
      }
      if (win.__TAURI__?.shell?.open) {
        await win.__TAURI__.shell.open(cacheBustedUrl);
        return;
      }
      const { open } = await import('@tauri-apps/api/shell');
      await open(cacheBustedUrl);
      return;
    } catch (_) {}
  }

  // Fallback: single anchor click without duplicate window.open
  const a = document.createElement('a');
  a.href = cacheBustedUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch (_) {}
  }, 300);
}

// Apply update:
// - Android: Downloads the newest .apk ONCE inside the app with live progress, saves it to phone storage & Downloads/Dlkam, and launches the Android Package Installer.
// - Desktop (Tauri): Downloads the newest .exe installer ONCE inside the app with live progress, saves it via Tauri's native save_and_open_local_file command, and immediately executes the Windows Setup wizard.
// - Web: Purges caches and reloads.
export async function applyApplicationUpdate(
  serverInfo?: AppVersionInfo | null,
  onProgress?: (pct: number, statusText: string) => void
): Promise<void> {
  const isAndroid = isCapacitorAndroid();
  const isDesktop = isTauriDesktop();
  const isWeb = !isAndroid && !isDesktop;
  const win = typeof window !== 'undefined' ? (window as any) : {};

  // 1. Send automated backup to bots asynchronously with strict 1.5s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const backupUrl = getEffectiveApiUrl('/api/backups/send-to-bot');
    fetch(backupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: `پشتیبان خودکار ${isAndroid ? 'اندروید' : isDesktop ? 'دسکتاپ' : 'تحت‌وب'} قبل از بروزرسانی به نسخه ${serverInfo?.version || serverInfo?.buildNumber || 'جدید'}`
      }),
      signal: controller.signal
    }).catch(() => {}).finally(() => clearTimeout(timeoutId));
  } catch (_) {}

  // 2. ANDROID PLATFORM: Single in-app download + launch Android Package Installer
  if (isAndroid) {
    const targetVer = serverInfo?.androidLatestVersion || serverInfo?.version || 'latest';
    const apkFileName = serverInfo?.androidFileName || `dlkam-android-v${targetVer}.apk`;
    let rawApk = serverInfo?.androidDownloadUrl || serverInfo?.downloadUrl || `/api/downloads/latest-android?v=${encodeURIComponent(targetVer)}`;
    if (!rawApk.startsWith('http://') && !rawApk.startsWith('https://')) {
      rawApk = getEffectiveApiUrl(rawApk);
    }
    const apkUrl = rawApk.includes('?') ? `${rawApk}&t=${Date.now()}` : `${rawApk}?t=${Date.now()}`;
    const APK_MIME = 'application/vnd.android.package-archive';

    try {
      // Download APK bytes ONCE inside the app with real-time percentage progress
      onProgress?.(2, 'در حال اتصال به سرور و شروع دانلود APK...');
      const apkBlob = await fetchBinaryWithProgress(apkUrl, serverInfo?.androidFileSize || 19000000, onProgress);
      const base64Data = await blobToRawBase64(apkBlob);

      let installerOpened = false;

      // Save via Native DlkamAndroid bridge (saves to DlkamFiles AND public Downloads/Dlkam folder)
      if (win.DlkamAndroid && typeof win.DlkamAndroid.saveFileToAppFolder === 'function') {
        const saved = win.DlkamAndroid.saveFileToAppFolder(base64Data, apkFileName, APK_MIME);
        if (saved) {
          toast.success(`فایل ${apkFileName} در پوشه Downloads/Dlkam ذخیره شد ✓`, { duration: 6000 });

          if (typeof win.DlkamAndroid.installApkFromAppFolder === 'function') {
            installerOpened = Boolean(win.DlkamAndroid.installApkFromAppFolder(apkFileName));
          }

          if (!installerOpened && typeof win.DlkamAndroid.getAppFolderFilePath === 'function') {
            const absPath = win.DlkamAndroid.getAppFolderFilePath(apkFileName);
            if (absPath) {
              try {
                await FileOpener.open({
                  filePath: absPath.startsWith('file://') ? absPath : `file://${absPath}`,
                  contentType: APK_MIME
                });
                installerOpened = true;
              } catch (_) {}
            }
          }

          if (!installerOpened && typeof win.DlkamAndroid.openFileFromAppFolder === 'function') {
            installerOpened = Boolean(win.DlkamAndroid.openFileFromAppFolder(apkFileName, APK_MIME));
          }
        }
      }

      // Also try Capacitor Filesystem + FileOpener if native bridge did not open it
      if (!installerOpened) {
        const writeDirs = [Directory.External, Directory.Cache, Directory.Data];
        for (const dir of writeDirs) {
          try {
            const res = await Filesystem.writeFile({
              path: apkFileName,
              data: base64Data,
              directory: dir,
              recursive: true
            });
            if (res?.uri) {
              try {
                await FileOpener.open({
                  filePath: res.uri,
                  contentType: APK_MIME
                });
                installerOpened = true;
                break;
              } catch (_) {}
            }
          } catch (_) {}
        }
      }

      markPlatformUpdateInstalled(targetVer, 'android');
      onProgress?.(100, 'دانلود کامل شد — پنجره نصب باز شد ✓');
      return;
    } catch (downloadErr) {
      console.warn('In-app APK fetch failed, falling back to single external link:', downloadErr);
      onProgress?.(100, 'انتقال به لینک مستقیم دانلود...');
      await openDirectUpdateLink(apkUrl);
      return;
    }
  }

  // 3. WINDOWS DESKTOP (TAURI & ELECTRON) PLATFORM: Single in-app download of newest .exe + automatic execution
  if (isDesktop) {
    const runtime = getDesktopRuntime();
    const targetVer = (runtime === 'electron' ? serverInfo?.electronLatestVersion : serverInfo?.tauriLatestVersion) || serverInfo?.desktopLatestVersion || serverInfo?.version || 'latest';
    const exeFileName = serverInfo?.desktopFileName || (runtime === 'electron' ? `dlkam-electron-setup-v${targetVer}.exe` : `dlkam-desktop-v${targetVer}.exe`);
    let rawDesktop = serverInfo?.downloadUrl || `/api/downloads/latest-desktop?v=${encodeURIComponent(targetVer)}&ext=exe&runtime=${runtime}`;
    if (!rawDesktop.startsWith('http://') && !rawDesktop.startsWith('https://')) {
      rawDesktop = getEffectiveApiUrl(rawDesktop);
    }
    const downloadUrl = rawDesktop.includes('?') ? `${rawDesktop}&t=${Date.now()}` : `${rawDesktop}?t=${Date.now()}`;

    const win = window as any;
    const electronBridge = win.electronAPI || win.electron;

    // A. ELECTRON DESKTOP BRIDGE (Identical flow to Tauri)
    if (electronBridge?.saveAndOpenLocalFile || electronBridge?.openLocalFile) {
      try {
        let fileExists = false;
        try {
          if (electronBridge.checkLocalFileExists) {
            fileExists = await electronBridge.checkLocalFileExists(exeFileName);
          }
        } catch (_) {}

        if (fileExists) {
          onProgress?.(80, 'فایل نصبی موجود است — در حال اجرای نصاب...');
          if (electronBridge.openLocalFile) {
            await electronBridge.openLocalFile(exeFileName);
          }
        } else {
          onProgress?.(2, `در حال دانلود نسخه جدید ویندوز (v${targetVer})...`);
          const exeBlob = await fetchBinaryWithProgress(downloadUrl, serverInfo?.desktopFileSize || 15000000, onProgress);
          const arrayBuffer = await exeBlob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          onProgress?.(95, 'ذخیره فایل و اجرای نصاب ویندوز...');
          if (electronBridge.saveAndOpenLocalFile) {
            await electronBridge.saveAndOpenLocalFile(exeFileName, bytes);
          } else if (electronBridge.openLocalFile) {
            await electronBridge.openLocalFile(exeFileName);
          }
        }

        markPlatformUpdateInstalled(targetVer, 'electron');
        onProgress?.(100, 'پنجره نصاب ویندوز باز شد ✓');
        toast.success(`فایل نصبی نسخه v${targetVer} اجرا شد ✓ مراحل نصب را در پنجره باز شده تکمیل فرمایید.`, { duration: 9000 });
        return;
      } catch (electronErr) {
        console.warn('Electron in-app update download/exec failed:', electronErr);
        toast.error('خطا در دانلود درون‌برنامه‌ای — از دکمه «لینک مستقیم» استفاده کنید.');
        throw electronErr;
      }
    }

    // B. TAURI DESKTOP BRIDGE
    try {
      const { invoke } = await import('@tauri-apps/api/tauri');
      // Check first if this Tauri desktop shell supports native local file saving (added in v1.0.27+)
      let supportsInAppSave = true;
      try {
        await invoke<boolean>('check_local_file_exists', { fileName: '__probe__.tmp' });
      } catch (probeErr: any) {
        const msg = String(probeErr?.message || probeErr || '');
        if (msg.includes('not found') || msg.includes('unknown command')) {
          supportsInAppSave = false;
        }
      }

      if (!supportsInAppSave) {
        // Older desktop shell: do NOT download in-app and then download again in browser; open direct link ONCE!
        markPlatformUpdateInstalled(targetVer, 'tauri');
        onProgress?.(100, 'در حال دانلود مستقیم فایل نصبی...');
        await openDirectUpdateLink(downloadUrl);
        return;
      }

      // Check if file is ALREADY downloaded locally!
      let fileExists = false;
      try {
        fileExists = await invoke<boolean>('check_local_file_exists', { fileName: exeFileName });
      } catch (e) {
        fileExists = false;
      }

      let savedPath = '';

      if (fileExists) {
        onProgress?.(80, 'فایل نصبی موجود است — در حال اجرای نصاب...');
        try {
          savedPath = await invoke<string>('open_local_file', { fileName: exeFileName });
        } catch (openErr) {
          console.warn('open_local_file returned error, attempting direct shell open:', openErr);
        }
      } else {
        onProgress?.(2, `در حال دانلود نسخه جدید ویندوز (v${targetVer})...`);
        const exeBlob = await fetchBinaryWithProgress(downloadUrl, serverInfo?.desktopFileSize || 15000000, onProgress);
        const arrayBuffer = await exeBlob.arrayBuffer();
        const bytes = Array.from(new Uint8Array(arrayBuffer));

        onProgress?.(95, 'ذخیره فایل و اجرای نصاب ویندوز...');
        savedPath = await invoke<string>('save_and_open_local_file', {
          fileName: exeFileName,
          bytes,
          openAfter: true
        });

        // Complementary open_local_file call
        try {
          await invoke<string>('open_local_file', { fileName: exeFileName });
        } catch {}
      }

      // Complementary execution via Tauri shell open API
      if (savedPath) {
        try {
          const { open } = await import('@tauri-apps/api/shell');
          await open(savedPath);
        } catch (shellOpenErr) {
          console.debug('Tauri shell.open complementary invocation:', shellOpenErr);
        }
      }

      markPlatformUpdateInstalled(targetVer, 'tauri');
      onProgress?.(100, 'پنجره نصاب ویندوز باز شد ✓');
      toast.success(`فایل نصبی نسخه v${targetVer} اجرا شد ✓ مراحل نصب را در پنجره باز شده تکمیل فرمایید.`, { duration: 9000 });
      return;
    } catch (tauriSaveErr) {
      console.warn('Tauri in-app download/exec failed:', tauriSaveErr);
      toast.error('خطا در دانلود یا اجرای نصاب درون‌برنامه‌ای — از دکمه «لینک مستقیم» استفاده کنید.');
      throw tauriSaveErr;
    }
  }

  // 4. WEB BROWSER PLATFORM: Mark update applied, clear caches, and reload
  if (isWeb) {
    try {
      if (serverInfo) {
        const serverBuild = serverInfo.buildNumber || serverInfo.version;
        const serverVer = serverInfo.version || serverBuild;
        const serverTimestamp = Number(serverInfo.timestamp) || 0;
        const serverSig = `${serverVer}_${serverBuild}_${serverTimestamp}`;
        localStorage.setItem('last_applied_release_sig', serverSig);
        localStorage.setItem('applied_server_version', serverVer);
        localStorage.setItem('applied_server_build', serverBuild);
        localStorage.setItem('baseline_server_build', serverBuild);
        localStorage.setItem('baseline_server_timestamp', serverTimestamp.toString());
        sessionStorage.removeItem('dismissed_update_sig');
        localStorage.removeItem('dismissed_update_sig');
      }

      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(
          cacheKeys.map(key => {
            if (key !== 'auth-session-v1' && key !== 'shown-notifications-v1') {
              return caches.delete(key);
            }
            return Promise.resolve(true);
          })
        );
      }

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          try {
            await reg.update();
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('Failed clearing web caches:', e);
    } finally {
      setTimeout(() => {
        const cleanUrl = window.location.origin + window.location.pathname;
        window.location.replace(`${cleanUrl}?v=${Date.now()}`);
      }, 400);
    }
  }
}

/**
 * Check if the desktop update installer file is already downloaded and present in local app cache
 */
export async function isDesktopUpdateFileReady(fileName: string): Promise<boolean> {
  if (!isTauriDesktop()) return false;
  const win = window as any;
  const electronBridge = win.electronAPI || win.electron;
  if (electronBridge?.checkLocalFileExists) {
    try {
      return await electronBridge.checkLocalFileExists(fileName);
    } catch {
      return false;
    }
  }
  try {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return await invoke<boolean>('check_local_file_exists', { fileName });
  } catch {
    return false;
  }
}

/**
 * Directly execute and launch the downloaded desktop update installer
 */
export async function openDesktopUpdateFile(fileName: string): Promise<string> {
  if (!isTauriDesktop()) throw new Error('Not running in desktop app');
  const extractedVer = extractSemVerFromText(fileName);
  const runtime = getDesktopRuntime();
  const win = window as any;
  const electronBridge = win.electronAPI || win.electron;
  if (electronBridge?.openLocalFile) {
    const p = await electronBridge.openLocalFile(fileName);
    if (extractedVer) markPlatformUpdateInstalled(extractedVer, runtime);
    return p;
  }
  const { invoke } = await import('@tauri-apps/api/tauri');
  let savedPath = '';
  try {
    savedPath = await invoke<string>('open_local_file', { fileName });
  } catch (err) {
    console.warn('open_local_file failed:', err);
  }

  // Complementary shell open
  if (savedPath) {
    try {
      const { open } = await import('@tauri-apps/api/shell');
      await open(savedPath);
    } catch (e) {
      console.debug('Tauri shell open fallback:', e);
    }
  }
  if (extractedVer) markPlatformUpdateInstalled(extractedVer, runtime);
  return savedPath || fileName;
}

/**
 * Open Windows File Explorer / Folder containing the downloaded file with the file highlighted
 */
export async function openDesktopUpdateFolder(fileName: string): Promise<string> {
  if (!isTauriDesktop()) throw new Error('Not running in desktop app');
  const win = window as any;
  const electronBridge = win.electronAPI || win.electron;
  if (electronBridge?.openLocalFileDir) {
    return await electronBridge.openLocalFileDir(fileName);
  }
  const { invoke } = await import('@tauri-apps/api/tauri');
  try {
    return await invoke<string>('open_local_file_dir', { fileName });
  } catch {
    return await invoke<string>('open_local_file', { fileName });
  }
}



