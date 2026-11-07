import test from 'node:test';
import assert from 'node:assert/strict';

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
        if (globalThis.window.matchMedia('(display-mode: standalone)').matches) return true;
        return false;
    };

    const shouldEnforceIdleTimeout = (isCapacitor = false) => {
        return !isPersistentClientApp(isCapacitor);
    };

    // Case 1: Pure Web Browser -> MUST enforce 1-hour idle timeout
    assert.equal(shouldEnforceIdleTimeout(false), true, 'Pure Web browser should enforce 1-hour idle timeout');

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
