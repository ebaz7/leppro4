import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { appendOrReplaceQueryParam, inferDesktopRuntimeFromRequest } from '../utils/urlUtils.ts';

test('appendOrReplaceQueryParam avoids duplicate t= query parameters on fallback retries', () => {
  const original =
    'https://dlkam.ir/api/downloads/latest-desktop?v=1.0.58&ext=exe&runtime=electron&t=1794740718440&t=1794740718616';
  const deduplicated = appendOrReplaceQueryParam(original, 't', '9999999999999');

  assert.equal(
    deduplicated,
    'https://dlkam.ir/api/downloads/latest-desktop?v=1.0.58&ext=exe&runtime=electron&t=9999999999999'
  );
  assert.equal((deduplicated.match(/(?:^|[?&])t=/g) || []).length, 1);

  const bareUrl = appendOrReplaceQueryParam('/api/downloads/latest-desktop', 'runtime', 'electron');
  assert.equal(bareUrl, '/api/downloads/latest-desktop?runtime=electron');

  const withHash = appendOrReplaceQueryParam('https://dlkam.ir/downloads/dlkam-electron-setup.exe?t=111#dl', 't', '222');
  assert.equal(withHash, 'https://dlkam.ir/downloads/dlkam-electron-setup.exe?t=222#dl');
});

test('inferDesktopRuntimeFromRequest detects electron vs tauri from explicit flag or filename', () => {
  assert.equal(inferDesktopRuntimeFromRequest('electron', '/downloads/dlkam-desktop-setup.exe'), 'electron');
  assert.equal(inferDesktopRuntimeFromRequest('', '/downloads/dlkam-electron-setup.exe'), 'electron');
  assert.equal(inferDesktopRuntimeFromRequest('', '/api/downloads/dlkam-electron-setup-v1.0.58.exe'), 'electron');
  assert.equal(inferDesktopRuntimeFromRequest('', '/downloads/dlkam-desktop-v1.0.58.exe'), 'tauri');
  assert.equal(inferDesktopRuntimeFromRequest('', '/downloads/dlkam-desktop-setup.msi'), 'tauri');
  assert.equal(inferDesktopRuntimeFromRequest('', '/api/downloads/latest-desktop'), '');
});

test('Electron scripts, hooks, and electron-builder.json are valid and consistent', () => {
  const rootDir = process.cwd();
  const builderCfg = JSON.parse(fs.readFileSync(path.join(rootDir, 'electron-builder.json'), 'utf8'));
  assert.equal(builderCfg.afterAllArtifactBuild, 'electron/after-build.cjs');
  assert.ok(Array.isArray(builderCfg.files) && builderCfg.files.includes('!dist/downloads/**'));

  for (const scriptFile of [
    'electron/main.cjs',
    'electron/preload.cjs',
    'electron/after-build.cjs',
    'build-electron.cjs'
  ]) {
    execSync(`node --check "${path.join(rootDir, scriptFile)}"`, { stdio: 'pipe' });
  }

  const mainSrc = fs.readFileSync(path.join(rootDir, 'electron/main.cjs'), 'utf8');
  assert.ok(mainSrc.includes('app.requestSingleInstanceLock()'));
  assert.ok(mainSrc.includes("'second-instance'"));
  assert.ok(mainSrc.includes("'context-menu'"));
  assert.ok(mainSrc.includes('dlkam-persistent-kv.json'));
});
