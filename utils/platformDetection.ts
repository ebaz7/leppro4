import { Capacitor } from '@capacitor/core';

export type AppPlatform = 'desktop' | 'android' | 'web';

/**
 * Checks if the current app environment is running inside Electron desktop.
 */
export const isElectronDesktop = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).electronAPI ||
    (window as any).electron ||
    navigator.userAgent.toLowerCase().includes('electron')
  );
};

/**
 * Checks if the current app environment is running inside Tauri or Electron (Windows / Mac / Linux desktop).
 */
export const isTauriDesktop = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).__TAURI__ ||
    (window as any).__TAURI_IPC__ ||
    (window as any).__TAURI_METADATA__ ||
    navigator.userAgent.toLowerCase().includes('tauri') ||
    isElectronDesktop()
  );
};

/**
 * Checks if running strictly inside Tauri (and NOT Electron).
 */
export const isTauriDesktopOnly = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isElectronDesktop()) return false;
  return Boolean(
    (window as any).__TAURI__ ||
    (window as any).__TAURI_IPC__ ||
    (window as any).__TAURI_METADATA__ ||
    navigator.userAgent.toLowerCase().includes('tauri')
  );
};

/**
 * Returns exact client runtime flavor: 'electron' | 'tauri' | 'android' | 'web'
 */
export const getDesktopRuntime = (): 'electron' | 'tauri' | 'android' | 'web' => {
  if (isElectronDesktop()) return 'electron';
  if (isTauriDesktopOnly()) return 'tauri';
  if (isMobileApp()) return 'android';
  return 'web';
};

/**
 * Checks if the current app environment is running on mobile (Android / iOS Capacitor).
 */
export const isMobileApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return (
      Capacitor.isNativePlatform() ||
      Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
      Boolean((window as any).AndroidBridge) ||
      /android|iphone|ipad|ipod/i.test(navigator.userAgent)
    );
  } catch {
    return false;
  }
};

/**
 * Checks if running specifically inside the Windows desktop app (Electron, Tauri, or WebView2).
 */
export const isWindowsDesktopApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    isElectronDesktop() ||
    isTauriDesktop() ||
    (window as any).electronAPI ||
    (window as any).electron ||
    (window as any).__TAURI__ ||
    (window as any).__TAURI_IPC__ ||
    (window as any).chrome?.webview ||
    /electron|tauri|delkamdesktop|lepandesktop/i.test(navigator.userAgent)
  );
};

/**
 * Checks if running specifically inside the Android native app (Capacitor APK / Native Shell).
 */
export const isAndroidApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform()) return true;
    if (Boolean((window as any).Capacitor?.isNativePlatform?.())) return true;
    if (Boolean((window as any).AndroidBridge)) return true;
    if (typeof (Capacitor as any).getPlatform === 'function' && ['android', 'ios'].includes((Capacitor as any).getPlatform())) return true;
    return false;
  } catch {
    return false;
  }
};

/**
 * Checks if the current client is an installed persistent app (Android APK or Windows Desktop app).
 * Installed clients MUST NEVER have idle session timeouts or automatic logouts.
 */
export const isPersistentClientApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isAndroidApp() || isWindowsDesktopApp() || Capacitor.isNativePlatform()) return true;
  if (isElectronDesktop() || isTauriDesktop()) return true;
  // Installed PWA standalone mode
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((navigator as any)?.standalone === true) return true;
  return false;
};

/**
 * Checks if idle session timeout (1 hour auto-logout) should be enforced.
 * Strictly applies ONLY to standard web browsers (Cloud/Web URL).
 * Android app and Windows desktop app MUST ALWAYS return false.
 */
export const shouldEnforceIdleTimeout = (): boolean => {
  return !isPersistentClientApp();
};

/**
 * Checks if running as standard web browser app (not desktop client and not mobile native container).
 */
export const isWebApp = (): boolean => {
  return !isPersistentClientApp();
};

/**
 * Get current platform key
 */
export const getPlatform = (): AppPlatform => {
  if (isWindowsDesktopApp()) return 'desktop';
  if (isAndroidApp() || isMobileApp()) return 'android';
  return 'web';
};

/**
 * Human-readable Persian platform badge title
 */
export const getPlatformBadgeLabel = (): { title: string; subtitle: string; iconType: 'desktop' | 'mobile' | 'web'; colorClass: string } => {
  if (isTauriDesktop()) {
    return {
      title: 'نسخه دسکتاپ ویندوز',
      subtitle: 'دلکام کلاینت بومی',
      iconType: 'desktop',
      colorClass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    };
  }
  if (isMobileApp()) {
    return {
      title: 'نسخه اندروید',
      subtitle: 'اپلیکیشن موبایل',
      iconType: 'mobile',
      colorClass: 'text-purple-400 border-purple-500/30 bg-purple-500/10'
    };
  }
  return {
    title: 'نسخه تحت وب',
    subtitle: 'مرورگر ابری',
    iconType: 'web',
    colorClass: 'text-amber-400 border-amber-500/30 bg-amber-500/10'
  };
};
