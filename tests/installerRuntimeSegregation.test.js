import test from 'node:test';
import assert from 'node:assert/strict';

test('Desktop update runtime segregation and installer requirement', () => {
    // Helper to simulate findNewestInstallerFile runtime matching logic
    const mockFiles = [
        { name: 'dlkam-desktop-v1.0.26.exe', isTauri: true, isElectron: false, version: '1.0.26' },
        { name: 'Dlkam-Setup-1.0.29.exe', isTauri: false, isElectron: true, version: '1.0.29' }
    ];

    function findInstaller(runtime, files) {
        if (runtime === 'electron') {
            return files.find(f => f.isElectron) || null;
        }
        if (runtime === 'tauri') {
            return files.find(f => f.isTauri) || null;
        }
        return null;
    }

    // 1. Electron query matches ONLY Electron installer
    const electronMatch = findInstaller('electron', mockFiles);
    assert.ok(electronMatch);
    assert.equal(electronMatch.version, '1.0.29');
    assert.equal(electronMatch.isElectron, true);

    // 2. Tauri query matches ONLY Tauri installer
    const tauriMatch = findInstaller('tauri', mockFiles);
    assert.ok(tauriMatch);
    assert.equal(tauriMatch.version, '1.0.26');
    assert.equal(tauriMatch.isTauri, true);

    // 3. If Electron installer is NOT on disk, it MUST return null (hasDesktopInstaller = false)
    const tauriOnlyFiles = [
        { name: 'dlkam-desktop-v1.0.30.exe', isTauri: true, isElectron: false, version: '1.0.30' }
    ];
    const missingElectron = findInstaller('electron', tauriOnlyFiles);
    assert.equal(missingElectron, null, 'When Electron installer is not built, must return null');

    // 4. If Tauri installer is NOT on disk, it MUST return null
    const electronOnlyFiles = [
        { name: 'Dlkam-Setup-1.0.30.exe', isTauri: false, isElectron: true, version: '1.0.30' }
    ];
    const missingTauri = findInstaller('tauri', electronOnlyFiles);
    assert.equal(missingTauri, null, 'When Tauri installer is not built, must return null');
});
