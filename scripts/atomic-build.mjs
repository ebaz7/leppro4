import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const STAGING_DIR = path.join(ROOT_DIR, 'dist-staging');
const VITE_BIN = path.join(ROOT_DIR, 'node_modules', 'vite', 'bin', 'vite.js');

function safeRemoveDir(targetDir) {
  if (!fs.existsSync(targetDir)) return;
  try {
    fs.rmSync(targetDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (_) {}
}

function cleanupOldDistDirs() {
  try {
    for (const entry of fs.readdirSync(ROOT_DIR)) {
      if (entry.startsWith('dist-old-')) {
        safeRemoveDir(path.join(ROOT_DIR, entry));
      }
    }
  } catch (_) {}
}

export function swapStagingIntoDist(stagingDir = STAGING_DIR, distDir = DIST_DIR) {
  const stagingIndex = path.join(stagingDir, 'index.html');
  if (!fs.existsSync(stagingIndex)) {
    throw new Error(`Staging build incomplete: missing ${stagingIndex}`);
  }

  const backupDir = path.join(path.dirname(distDir), `dist-old-${Date.now()}`);
  let movedOld = false;

  try {
    if (fs.existsSync(distDir)) {
      fs.renameSync(distDir, backupDir);
      movedOld = true;
    }
    fs.renameSync(stagingDir, distDir);
    if (movedOld) {
      safeRemoveDir(backupDir);
    }
    return { mode: 'atomic-rename' };
  } catch (renameErr) {
    // Rollback if old dist was moved away but staging rename failed
    if (movedOld && !fs.existsSync(distDir) && fs.existsSync(backupDir)) {
      try {
        fs.renameSync(backupDir, distDir);
      } catch (_) {}
    }

    // Windows fallback if an external process holds a lock on dist/:
    // Copy new files over dist/ (keeping live service uninterrupted) and clean staging
    try {
      fs.cpSync(stagingDir, distDir, { recursive: true, force: true });
      safeRemoveDir(stagingDir);
      return { mode: 'copy-fallback', warning: renameErr?.message };
    } catch (cpErr) {
      throw cpErr;
    }
  }
}

function main() {
  cleanupOldDistDirs();
  safeRemoveDir(STAGING_DIR);

  const extraArgs = process.argv.slice(2);
  const viteArgs = [VITE_BIN, 'build', '--outDir', 'dist-staging', '--emptyOutDir', ...extraArgs];

  console.log('⚡ Starting zero-downtime staging Vite build (live dist/ stays online)...');
  const result = spawnSync(process.execPath, viteArgs, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    safeRemoveDir(STAGING_DIR);
    process.exit(result.status || 1);
  }

  const swapResult = swapStagingIntoDist(STAGING_DIR, DIST_DIR);
  cleanupOldDistDirs();
  console.log(`✅ Atomic dist swap complete (${swapResult.mode}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  main();
}
