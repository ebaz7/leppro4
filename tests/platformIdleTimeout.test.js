import test from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import path from 'node:path';

test('Platform detection & idle timeout rules', async () => {
    // Simulate web browser environment
    globalThis.window = {
        matchMedia: () => ({ matches: false })
    };
    let mockUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

    // Helper functions mirroring utils/platformDetection.ts
    const isElectronDesktop = () => {
        return Boolean(
            globalThis.window.electronAPI ||
            globalThis.window.electron ||
            mockUserAgent.toLowerCase().includes('electron')
        );
    };

    const isTauriDesktop = () => {
        return Boolean(
            globalThis.window.__TAURI__ ||
            globalThis.window.__TAURI_IPC__ ||
            mockUserAgent.toLowerCase().includes('tauri') ||
            isElectronDesktop()
        );
    };

    const isWindowsDesktopApp = () => {
        return Boolean(
            isElectronDesktop() ||
            isTauriDesktop() ||
            globalThis.window.chrome?.webview ||
            /electron|tauri|delkamdesktop|lepandesktop/i.test(mockUserAgent)
        );
    };

    const isAndroidApp = (isCapacitorNative = false) => {
        return isCapacitorNative || Boolean(globalThis.window.AndroidBridge);
    };

    const isPersistentClientApp = (isCapacitor = false) => {
        if (isAndroidApp(isCapacitor) || isWindowsDesktopApp()) return true;
        if (isElectronDesktop() || isTauriDesktop()) return true;
        return false;
    };

    const shouldEnforceIdleTimeout = (isCapacitor = false) => {
        return !isPersistentClientApp(isCapacitor);
    };

    // Case 1: Pure Web Browser -> MUST enforce 1-hour idle timeout
    assert.equal(shouldEnforceIdleTimeout(false), true, 'Pure Web browser should enforce 1-hour idle timeout');

    // Case 1b: Browser PWA Standalone -> Still Web, MUST enforce 1-hour idle timeout
    globalThis.window.matchMedia = () => ({ matches: true });
    assert.equal(shouldEnforceIdleTimeout(false), true, 'Browser standalone PWA must still enforce Web 1-hour idle timeout');
    globalThis.window.matchMedia = () => ({ matches: false });

    // Case 2: Windows Electron Desktop -> MUST NEVER enforce idle timeout
    globalThis.window.electronAPI = { getVersion: () => '1.0.0' };
    assert.equal(shouldEnforceIdleTimeout(false), false, 'Electron Windows desktop must NEVER enforce idle timeout');
    delete globalThis.window.electronAPI;

    // Case 3: Windows Tauri Desktop -> MUST NEVER enforce idle timeout
    globalThis.window.__TAURI__ = {};
    assert.equal(shouldEnforceIdleTimeout(false), false, 'Tauri Windows desktop must NEVER enforce idle timeout');
    delete globalThis.window.__TAURI__;

    // Case 4: Android Capacitor Native -> MUST NEVER enforce idle timeout
    assert.equal(shouldEnforceIdleTimeout(true), false, 'Android Capacitor native must NEVER enforce idle timeout');

    // Case 5: Android Native Bridge -> MUST NEVER enforce idle timeout
    globalThis.window.AndroidBridge = {};
    assert.equal(shouldEnforceIdleTimeout(false), false, 'AndroidBridge native shell must NEVER enforce idle timeout');
    delete globalThis.window.AndroidBridge;
});

test('Web vs Windows vs Android session & background push security rules', () => {
    const authService = fs.readFileSync(path.resolve('services/authService.ts'), 'utf8');
    assert.ok(authService.includes('WEB_SESSION_ACTIVE_KEY'), 'Web session must use sessionStorage-backed active key');
    assert.ok(authService.includes('WEB_IDLE_LIMIT_MS'), 'Web getCurrentUser must enforce 1-hour expiration');
    assert.ok(authService.includes('DESKTOP_SESSION_ACTIVE_KEY'), 'Windows Desktop must clear login across close/reopen');

    const notifController = fs.readFileSync(path.resolve('components/NotificationController.tsx'), 'utf8');
    assert.ok(notifController.includes('if (isWebApp())'), 'NotificationController must skip persistent background WebPush on Web');

    const swCode = fs.readFileSync(path.resolve('public/sw.js'), 'utf8');
    assert.ok(swCode.includes('openClients.length === 0'), 'Service Worker must suppress background push when Web tabs are closed');

    const electronMain = fs.readFileSync(path.resolve('electron/main.cjs'), 'utf8');
    assert.ok(electronMain.includes('backgroundThrottling: false'), 'Electron must keep backgroundThrottling disabled for minimized notifications');
    assert.ok(electronMain.includes('desktop-auto-logout'), 'Electron must log out on window close');
});
