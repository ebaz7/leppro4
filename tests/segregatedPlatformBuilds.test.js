import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { syncBuildVersion, compareSemVer, findHighestDiskInstallerVersion } = require('../setup-build-version.cjs');

test('Per-Platform Segregated Build & Version Isolation', async (t) => {
  const rootDir = path.resolve('.');
  const pkgPath = path.join(rootDir, 'package.json');
  const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
  const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
  const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
  const releaseJsonPath = path.join(rootDir, 'release-version.json');

  // Snapshot before test
  const originalPkg = fs.readFileSync(pkgPath, 'utf8');
  const originalTauri = fs.existsSync(tauriConfPath) ? fs.readFileSync(tauriConfPath, 'utf8') : null;
  const originalCargo = fs.existsSync(cargoTomlPath) ? fs.readFileSync(cargoTomlPath, 'utf8') : null;
  const originalGradle = fs.existsSync(gradlePath) ? fs.readFileSync(gradlePath, 'utf8') : null;
  const originalRelease = fs.existsSync(releaseJsonPath) ? fs.readFileSync(releaseJsonPath, 'utf8') : null;

  try {
    // 1. Test Android Build Isolation:
    // When Android is built/bumped, only android/app/build.gradle should change.
    // package.json and tauri.conf.json MUST NOT CHANGE.
    await t.test('Android bump does not modify package.json or tauri.conf.json', () => {
      const beforePkgVer = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
      const beforeTauriVer = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8')).package?.version;

      const res = syncBuildVersion({ platform: 'android', bump: true });
      assert.ok(res.version, 'Should return bumped android version');

      const afterPkgVer = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
      const afterTauriVer = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8')).package?.version;
      const gradleContent = fs.readFileSync(gradlePath, 'utf8');

      assert.equal(afterPkgVer, beforePkgVer, 'package.json version must remain unchanged on android build');
      assert.equal(afterTauriVer, beforeTauriVer, 'tauri.conf.json version must remain unchanged on android build');
      assert.ok(gradleContent.includes(`versionName "${res.version}"`), 'build.gradle must have the new android version');

      const rel = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf8'));
      assert.equal(rel.androidVersion, res.version, 'release-version.json androidVersion must be updated');
      assert.equal(rel.webVersion, beforePkgVer, 'webVersion must not be overwritten by android build');
    });

    // 2. Test Electron Build Isolation:
    // When Electron is built/bumped, package.json is updated, but android/app/build.gradle and tauri.conf.json MUST NOT CHANGE.
    await t.test('Electron bump does not modify android build.gradle or tauri.conf.json', () => {
      const beforeGradleContent = fs.readFileSync(gradlePath, 'utf8');
      const beforeTauriVer = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8')).package?.version;

      const res = syncBuildVersion({ platform: 'electron', bump: true });
      assert.ok(res.version, 'Should return bumped electron version');

      const afterGradleContent = fs.readFileSync(gradlePath, 'utf8');
      const afterTauriVer = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8')).package?.version;
      const afterPkgVer = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;

      assert.equal(afterGradleContent, beforeGradleContent, 'android build.gradle must remain unchanged on electron build');
      assert.equal(afterTauriVer, beforeTauriVer, 'tauri.conf.json version must remain unchanged on electron build');
      assert.equal(afterPkgVer, res.version, 'package.json version must be updated for electron');

      const rel = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf8'));
      assert.equal(rel.electronVersion, res.version, 'release-version.json electronVersion must be updated');
    });

    // 3. Test Tauri Build Isolation:
    // When Tauri is built/bumped, src-tauri/tauri.conf.json is updated, but package.json and android/app/build.gradle MUST NOT CHANGE.
    await t.test('Tauri bump does not modify android build.gradle or package.json', () => {
      const beforePkgVer = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
      const beforeGradleContent = fs.readFileSync(gradlePath, 'utf8');

      const res = syncBuildVersion({ platform: 'tauri', bump: true });
      assert.ok(res.version, 'Should return bumped tauri version');

      const afterPkgVer = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
      const afterGradleContent = fs.readFileSync(gradlePath, 'utf8');
      const afterTauriVer = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8')).package?.version;

      assert.equal(afterPkgVer, beforePkgVer, 'package.json version must remain unchanged on tauri build');
      assert.equal(afterGradleContent, beforeGradleContent, 'android build.gradle must remain unchanged on tauri build');
      assert.equal(afterTauriVer, res.version, 'tauri.conf.json version must be updated for tauri');

      const rel = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf8'));
      assert.equal(rel.tauriVersion, res.version, 'release-version.json tauriVersion must be updated');
    });

    // 4. Test Web Build Isolation:
    // When Web is built/bumped, only webVersion is updated, but android and tauri configs remain untouched.
    await t.test('Web bump updates webVersion and keeps native configs intact', () => {
      const beforeGradleContent = fs.readFileSync(gradlePath, 'utf8');
      const beforeTauriVer = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8')).package?.version;

      const res = syncBuildVersion({ platform: 'web', bump: true });
      assert.ok(res.version, 'Should return bumped web version');

      const afterGradleContent = fs.readFileSync(gradlePath, 'utf8');
      const afterTauriVer = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8')).package?.version;

      assert.equal(afterGradleContent, beforeGradleContent, 'android build.gradle must remain unchanged on web build');
      assert.equal(afterTauriVer, beforeTauriVer, 'tauri.conf.json version must remain unchanged on web build');

      const rel = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf8'));
      assert.equal(rel.webVersion, res.version, 'release-version.json webVersion must be updated');
    });
  } finally {
    // Restore files to clean state
    fs.writeFileSync(pkgPath, originalPkg, 'utf8');
    if (originalTauri) fs.writeFileSync(tauriConfPath, originalTauri, 'utf8');
    if (originalCargo) fs.writeFileSync(cargoTomlPath, originalCargo, 'utf8');
    if (originalGradle) fs.writeFileSync(gradlePath, originalGradle, 'utf8');
    if (originalRelease) fs.writeFileSync(releaseJsonPath, originalRelease, 'utf8');
  }
});
