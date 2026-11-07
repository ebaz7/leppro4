/**
 * Unified Icon & Asset Generator (Android + Tauri + Web PWA)
 * Usage:
 *   npm run icons
 *   node setup-assets.cjs
 *   node setup-icons.cjs
 *   build-icons.bat
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const sharp = require('sharp');

const ROOT_DIR = __dirname;
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const TAURI_ICONS_DIR = path.join(ROOT_DIR, 'src-tauri', 'icons');
const ANDROID_RES_DIR = path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'res');

/**
 * Finds the user's app-icon in the project root directory.
 * Handles cases where Windows Explorer hides file extensions (e.g. `app-icon.png.png`)
 * or when multiple `app-icon*` files exist by picking the most recently modified file in root.
 */
function findSourceIcon() {
  try {
    const rootEntries = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
    const rootMatches = [];

    for (const entry of rootEntries) {
      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.tmp')) continue;
      if (/^app-icon/i.test(entry.name) && /\.(png|webp|jpg|jpeg|svg)$/i.test(entry.name)) {
        const fullPath = path.join(ROOT_DIR, entry.name);
        const stat = fs.statSync(fullPath);
        if (stat.size > 100) {
          rootMatches.push({ path: fullPath, name: entry.name, mtimeMs: stat.mtimeMs, size: stat.size });
        }
      }
    }

    if (rootMatches.length > 0) {
      // Sort by newest modification time first
      rootMatches.sort((a, b) => b.mtimeMs - a.mtimeMs);
      return rootMatches[0].path;
    }
  } catch (_) {}

  const fallbackCandidates = [
    path.join(ROOT_DIR, 'icon.png'),
    path.join(PUBLIC_DIR, 'app-icon.png'),
    path.join(PUBLIC_DIR, 'icon.png')
  ];

  for (const candidate of fallbackCandidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile() && fs.statSync(candidate).size > 100) {
      return candidate;
    }
  }
  return null;
}

/**
 * Inspects the outer border/corner pixels of the image to determine whether
 * the icon has a transparent background or a solid/colored background.
 */
async function detectIconBackground(imagePath) {
  const image = sharp(imagePath).ensureAlpha();
  const { data, info } = await image
    .resize(64, 64, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const getPixel = (x, y) => {
    const idx = (y * w + x) * 4;
    return {
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
      a: data[idx + 3]
    };
  };

  const sampleCoords = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2],
    [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)]
  ];

  const samples = sampleCoords.map(([x, y]) => getPixel(x, y));
  const transparentCount = samples.filter(p => p.a < 40).length;

  if (transparentCount >= 4) {
    return {
      hasBackground: false,
      rgba: { r: 0, g: 0, b: 0, alpha: 0 },
      hex: '#00000000'
    };
  }

  const opaqueSamples = samples.filter(p => p.a >= 40);
  const avg = opaqueSamples.reduce(
    (acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }),
    { r: 0, g: 0, b: 0 }
  );
  const count = Math.max(1, opaqueSamples.length);
  const r = Math.round(avg.r / count);
  const g = Math.round(avg.g / count);
  const b = Math.round(avg.b / count);
  const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();

  return {
    hasBackground: true,
    rgba: { r, g, b, alpha: 1 },
    hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`
  };
}

/**
 * Builds a true Win32-compliant .ico file:
 * - Sizes 16, 24, 32, 48, 64 are stored as 32-bit BGRA BITMAPINFOHEADER (DIB) frames
 *   with bottom-up scanlines and a valid 1-bit AND mask (required by Windows Explorer shortcuts & rc.exe).
 * - Size 256 is stored as a compressed RGBA PNG frame (Windows Vista+ high-DPI standard).
 */
async function createTrueWin32Ico(masterPngBuffer, bgRgba) {
  const dibSizes = [16, 24, 32, 48, 64];
  const frames = [];

  for (const sz of dibSizes) {
    const { data } = await sharp(masterPngBuffer)
      .resize(sz, sz, { fit: 'contain', background: bgRgba })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // BITMAPINFOHEADER (40 bytes)
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);          // biSize
    header.writeInt32LE(sz, 4);           // biWidth
    header.writeInt32LE(sz * 2, 8);       // biHeight (doubled for XOR + AND mask)
    header.writeUInt16LE(1, 12);          // biPlanes
    header.writeUInt16LE(32, 14);         // biBitCount (32-bit BGRA)
    header.writeUInt32LE(0, 16);          // biCompression (BI_RGB)

    const xorSize = sz * sz * 4;
    const andRowBytes = Math.ceil(sz / 32) * 4;
    const andSize = andRowBytes * sz;
    header.writeUInt32LE(xorSize + andSize, 20); // biSizeImage

    const xorMask = Buffer.alloc(xorSize);
    const andMask = Buffer.alloc(andSize, 0);

    // Bottom-up rows for DIB
    for (let y = 0; y < sz; y++) {
      const srcRow = sz - 1 - y;
      for (let x = 0; x < sz; x++) {
        const srcIdx = (srcRow * sz + x) * 4;
        const dstIdx = (y * sz + x) * 4;
        const r = data[srcIdx];
        const g = data[srcIdx + 1];
        const b = data[srcIdx + 2];
        const a = data[srcIdx + 3];

        xorMask[dstIdx] = b;
        xorMask[dstIdx + 1] = g;
        xorMask[dstIdx + 2] = r;
        xorMask[dstIdx + 3] = a;

        // If pixel is transparent (alpha < 128), set bit in AND mask
        if (a < 32) {
          const byteIndex = y * andRowBytes + (x >> 3);
          const bitMask = 0x80 >> (x & 7);
          andMask[byteIndex] |= bitMask;
        }
      }
    }

    frames.push({
      size: sz,
      buffer: Buffer.concat([header, xorMask, andMask])
    });
  }

  // Add 256x256 PNG frame
  const png256 = await sharp(masterPngBuffer)
    .resize(256, 256, { fit: 'contain', background: bgRgba })
    .png()
    .toBuffer();
  frames.push({ size: 256, buffer: png256 });

  const numImages = frames.length;
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);
  icoHeader.writeUInt16LE(1, 2); // Type 1 = ICO
  icoHeader.writeUInt16LE(numImages, 4);

  let offset = 6 + numImages * 16;
  const dirEntries = [];

  for (const frame of frames) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(frame.size === 256 ? 0 : frame.size, 0);
    entry.writeUInt8(frame.size === 256 ? 0 : frame.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(frame.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += frame.buffer.length;
  }

  return Buffer.concat([icoHeader, ...dirEntries, ...frames.map(f => f.buffer)]);
}

/**
 * Purges cached Tauri / Cargo Windows resource & executable files in `src-tauri/target/release`
 * so `npx tauri build` NEVER reuses an old `.exe` or `.res` with the previous icon!
 */
function purgeTauriIconBuildCache() {
  const releaseDir = path.join(ROOT_DIR, 'src-tauri', 'target', 'release');
  const debugDir = path.join(ROOT_DIR, 'src-tauri', 'target', 'debug');

  for (const targetSubDir of [releaseDir, debugDir]) {
    if (!fs.existsSync(targetSubDir)) continue;

    // 1. Remove cached .exe binaries and WiX/NSIS intermediate folders
    const toRemove = [
      'sayan-warehouse.exe',
      'dlkam.exe',
      'Dlkam.exe',
      'wix',
      'nsis',
      'resources'
    ];
    for (const item of toRemove) {
      const full = path.join(targetSubDir, item);
      if (fs.existsSync(full)) {
        try {
          fs.rmSync(full, { recursive: true, force: true });
        } catch (_) {}
      }
    }

    // 2. Remove cached build-script outputs (resource.rc / resource.lib) and fingerprints for sayan-warehouse
    for (const cacheFolder of ['build', '.fingerprint', 'deps']) {
      const folderPath = path.join(targetSubDir, cacheFolder);
      if (!fs.existsSync(folderPath)) continue;
      try {
        const entries = fs.readdirSync(folderPath);
        for (const name of entries) {
          if (name.startsWith('sayan-warehouse') || name.startsWith('dlkam')) {
            const p = path.join(folderPath, name);
            try {
              fs.rmSync(p, { recursive: true, force: true });
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
  }

  // 3. Touch src-tauri/build.rs and src-tauri/src/main.rs so Cargo is forced to recompile resources
  const now = new Date();
  for (const relFile of ['src-tauri/build.rs', 'src-tauri/src/main.rs', 'src-tauri/tauri.conf.json']) {
    const full = path.join(ROOT_DIR, relFile);
    if (fs.existsSync(full)) {
      try {
        fs.utimesSync(full, now, now);
      } catch (_) {}
    }
  }
}

/**
 * Flushes the Windows Explorer icon cache so Desktop shortcuts immediately display the new icon.
 */
function refreshWindowsIconCache() {
  if (process.platform !== 'win32') return;
  try {
    execSync('ie4uinit.exe -show', { stdio: 'ignore' });
    execSync('ie4uinit.exe -ClearIconCache', { stdio: 'ignore' });
  } catch (_) {}
}

async function generateAllIcons() {
  console.log('==============================================================');
  console.log('🎨 شروع ساخت یکپارچه آیکون‌ها برای اندروید، تائوری و وب');
  console.log('==============================================================');

  const sourceIcon = findSourceIcon();
  if (!sourceIcon) {
    console.error('❌ فایل app-icon.png در پوشه اصلی سرور یافت نشد!');
    console.error('لطفاً فایل آیکون خود را با نام app-icon.png در پوشه اصلی قرار دهید.');
    process.exit(1);
  }

  const rawSourceBuffer = fs.readFileSync(sourceIcon);
  const sourceHash = crypto.createHash('sha256').update(rawSourceBuffer).digest('hex').slice(0, 12);
  const sourceMeta = await sharp(rawSourceBuffer).metadata();
  console.log(`📌 فایل مبدا شناسایی شد: ${path.basename(sourceIcon)} (${sourceMeta.width}x${sourceMeta.height}, Hash: ${sourceHash})`);

  const bgInfo = await detectIconBackground(sourceIcon);
  if (bgInfo.hasBackground) {
    console.log(`🎨 وضعیت پس‌زمینه: دارای پس‌زمینه رنگی (${bgInfo.hex}) -> تمام آیکون‌های اندروید و تائوری با همین رنگ بک‌گراند ساخته می‌شوند.`);
  } else {
    console.log(`✨ وضعیت پس‌زمینه: بدون پس‌زمینه (Transparent) -> تمام آیکون‌های اندروید و تائوری بدون بک‌گراند (شفاف) ساخته می‌شوند.`);
  }

  // Ensure directories exist
  [ASSETS_DIR, PUBLIC_DIR, TAURI_ICONS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // Prepare 1024x1024 master buffer preserving exact background state
  const master1024Buffer = await sharp(rawSourceBuffer)
    .ensureAlpha()
    .resize(1024, 1024, {
      fit: 'contain',
      background: bgInfo.rgba
    })
    .png()
    .toBuffer();

  // Keep root app-icon.png synced in clean 1024x1024 RGBA format
  const rootAppIconPng = path.join(ROOT_DIR, 'app-icon.png');
  const tmpRootIcon = rootAppIconPng + '.tmp';
  fs.writeFileSync(tmpRootIcon, master1024Buffer);
  fs.renameSync(tmpRootIcon, rootAppIconPng);

  // Build true Win32 multi-resolution .ico (DIB + PNG)
  const win32IcoBuffer = await createTrueWin32Ico(master1024Buffer, bgInfo.rgba);

  // ------------------------------------------------------------------------
  // 1. WEB & PWA ICONS (public/)
  // ------------------------------------------------------------------------
  console.log('\n🌐 [1/3] در حال ساخت آیکون‌های وب و PWA در پوشه public...');
  await sharp(master1024Buffer)
    .resize(512, 512, { fit: 'contain', background: bgInfo.rgba })
    .png()
    .toFile(path.join(PUBLIC_DIR, 'app-icon.png'));

  await sharp(master1024Buffer)
    .resize(512, 512, { fit: 'contain', background: bgInfo.rgba })
    .png()
    .toFile(path.join(PUBLIC_DIR, 'icon.png'));

  await sharp(master1024Buffer)
    .resize(512, 512, { fit: 'contain', background: bgInfo.rgba })
    .png()
    .toFile(path.join(PUBLIC_DIR, 'pwa-512x512.png'));

  await sharp(master1024Buffer)
    .resize(192, 192, { fit: 'contain', background: bgInfo.rgba })
    .png()
    .toFile(path.join(PUBLIC_DIR, 'pwa-192x192.png'));

  await sharp(master1024Buffer)
    .resize(180, 180, { fit: 'contain', background: bgInfo.rgba })
    .png()
    .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));

  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), win32IcoBuffer);
  console.log('   ✅ آیکون‌های وب و PWA در مسیر public/ ساخته شدند.');

  // ------------------------------------------------------------------------
  // 2. TAURI DESKTOP ICONS (src-tauri/icons/) + CACHE PURGE
  // ------------------------------------------------------------------------
  console.log('\n🖥️ [2/3] در حال ساخت آیکون‌های دسکتاپ تائوری در src-tauri/icons...');

  // Write True Win32 .ico and all PNG sizes first
  const tauriPngSizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.png', size: 512 },
    { name: 'Square30x30Logo.png', size: 30 },
    { name: 'Square44x44Logo.png', size: 44 },
    { name: 'Square71x71Logo.png', size: 71 },
    { name: 'Square89x89Logo.png', size: 89 },
    { name: 'Square107x107Logo.png', size: 107 },
    { name: 'Square142x142Logo.png', size: 142 },
    { name: 'Square150x150Logo.png', size: 150 },
    { name: 'Square284x284Logo.png', size: 284 },
    { name: 'Square310x310Logo.png', size: 310 },
    { name: 'StoreLogo.png', size: 50 }
  ];

  for (const item of tauriPngSizes) {
    await sharp(master1024Buffer)
      .resize(item.size, item.size, { fit: 'contain', background: bgInfo.rgba })
      .png()
      .toFile(path.join(TAURI_ICONS_DIR, item.name));
  }

  fs.writeFileSync(path.join(TAURI_ICONS_DIR, 'icon.ico'), win32IcoBuffer);

  // Also run official `npx tauri icon` so Tauri's native ICNS/ICO generator runs on the 1024x1024 master
  let tauriCliSucceeded = false;
  try {
    execSync(`npx tauri icon "${rootAppIconPng}" -o src-tauri/icons`, { stdio: 'inherit', cwd: ROOT_DIR });
    tauriCliSucceeded = true;
  } catch (_) {}

  // Ensure our true Win32 .ico (with 16, 24, 32, 48, 64 DIB + 256 PNG) is in place if Tauri CLI didn't create it
  if (!fs.existsSync(path.join(TAURI_ICONS_DIR, 'icon.ico')) || fs.statSync(path.join(TAURI_ICONS_DIR, 'icon.ico')).size < 1000) {
    fs.writeFileSync(path.join(TAURI_ICONS_DIR, 'icon.ico'), win32IcoBuffer);
  }

  // CRITICAL: Purge cached Cargo/Tauri .exe and Windows resource build files so the next Tauri build is 100% forced to embed the new icon!
  purgeTauriIconBuildCache();
  refreshWindowsIconCache();

  const finalIcoHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(TAURI_ICONS_DIR, 'icon.ico'))).digest('hex').slice(0, 12);
  console.log(`   ✅ تمام آیکون‌های تائوری (${tauriCliSucceeded ? 'Tauri CLI + Win32 ICO' : 'Win32 DIB ICO'}) در مسیر src-tauri/icons/ ساخته شدند (ICO Hash: ${finalIcoHash}).`);
  console.log('   🧹 کش قبلی کامپایلر تائوری (target/release/build & .exe) پاک‌سازی شد تا آیکون جدید ۱۰۰٪ در فایل نصبی کامپایل شود.');

  // ------------------------------------------------------------------------
  // 3. ANDROID CAPACITOR ICONS & SPLASH (assets/ + android/app/src/main/res/)
  // ------------------------------------------------------------------------
  console.log('\n🤖 [3/3] در حال ساخت تمام آیکون‌های اندروید در پوشه‌های mipmap و drawable...');

  fs.writeFileSync(path.join(ASSETS_DIR, 'icon.png'), master1024Buffer);
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon-only.png'), master1024Buffer);

  const paddedLogo740 = await sharp(master1024Buffer)
    .resize(740, 740, { fit: 'contain', background: bgInfo.rgba })
    .png()
    .toBuffer();

  const adaptiveForeground1024 = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: bgInfo.rgba
    }
  })
    .composite([{ input: paddedLogo740, gravity: 'center' }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(ASSETS_DIR, 'icon-foreground.png'), adaptiveForeground1024);

  const adaptiveBackground1024 = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: bgInfo.rgba
    }
  })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(ASSETS_DIR, 'icon-background.png'), adaptiveBackground1024);

  // Splash screen (2732x2732)
  const splashBgRgba = bgInfo.hasBackground ? bgInfo.rgba : { r: 15, g: 23, b: 42, alpha: 1 };
  const splashLogo = await sharp(master1024Buffer)
    .resize(640, 640, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const splash2732 = await sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 4,
      background: splashBgRgba
    }
  })
    .composite([{ input: splashLogo, gravity: 'center' }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(ASSETS_DIR, 'splash.png'), splash2732);
  fs.writeFileSync(path.join(ASSETS_DIR, 'splash-dark.png'), splash2732);

  if (fs.existsSync(ANDROID_RES_DIR)) {
    const mipmapSpecs = [
      { folder: 'mipmap-ldpi', legacySize: 36, fgSize: 81 },
      { folder: 'mipmap-mdpi', legacySize: 48, fgSize: 108 },
      { folder: 'mipmap-hdpi', legacySize: 72, fgSize: 162 },
      { folder: 'mipmap-xhdpi', legacySize: 96, fgSize: 216 },
      { folder: 'mipmap-xxhdpi', legacySize: 144, fgSize: 324 },
      { folder: 'mipmap-xxxhdpi', legacySize: 192, fgSize: 432 }
    ];

    for (const spec of mipmapSpecs) {
      const targetDir = path.join(ANDROID_RES_DIR, spec.folder);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      await sharp(master1024Buffer)
        .resize(spec.legacySize, spec.legacySize, { fit: 'contain', background: bgInfo.rgba })
        .png()
        .toFile(path.join(targetDir, 'ic_launcher.png'));

      if (bgInfo.hasBackground) {
        const circleSvg = Buffer.from(
          `<svg width="${spec.legacySize}" height="${spec.legacySize}"><circle cx="${spec.legacySize / 2}" cy="${spec.legacySize / 2}" r="${spec.legacySize / 2}" fill="white"/></svg>`
        );
        const resizedSquare = await sharp(master1024Buffer)
          .resize(spec.legacySize, spec.legacySize, { fit: 'contain', background: bgInfo.rgba })
          .png()
          .toBuffer();

        await sharp(resizedSquare)
          .composite([{ input: circleSvg, blend: 'dest-in' }])
          .png()
          .toFile(path.join(targetDir, 'ic_launcher_round.png'));
      } else {
        await sharp(master1024Buffer)
          .resize(spec.legacySize, spec.legacySize, { fit: 'contain', background: bgInfo.rgba })
          .png()
          .toFile(path.join(targetDir, 'ic_launcher_round.png'));
      }

      await sharp(adaptiveForeground1024)
        .resize(spec.fgSize, spec.fgSize, { fit: 'contain', background: bgInfo.rgba })
        .png()
        .toFile(path.join(targetDir, 'ic_launcher_foreground.png'));

      await sharp(adaptiveBackground1024)
        .resize(spec.fgSize, spec.fgSize, { fit: 'contain', background: bgInfo.rgba })
        .png()
        .toFile(path.join(targetDir, 'ic_launcher_background.png'));
    }

    const valuesDir = path.join(ANDROID_RES_DIR, 'values');
    if (!fs.existsSync(valuesDir)) fs.mkdirSync(valuesDir, { recursive: true });
    const bgXmlPath = path.join(valuesDir, 'ic_launcher_background.xml');
    const colorValue = bgInfo.hasBackground ? bgInfo.hex : '#00000000';
    const bgXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${colorValue}</color>
</resources>
`;
    fs.writeFileSync(bgXmlPath, bgXmlContent, 'utf8');

    const anyDpiDir = path.join(ANDROID_RES_DIR, 'mipmap-anydpi-v26');
    if (!bgInfo.hasBackground) {
      if (fs.existsSync(anyDpiDir)) {
        for (const xmlFile of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
          const xmlPath = path.join(anyDpiDir, xmlFile);
          if (fs.existsSync(xmlPath)) {
            try { fs.unlinkSync(xmlPath); } catch (_) {}
          }
        }
      }
    } else {
      if (!fs.existsSync(anyDpiDir)) fs.mkdirSync(anyDpiDir, { recursive: true });
      const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
      fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher.xml'), adaptiveXml, 'utf8');
      fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher_round.xml'), adaptiveXml, 'utf8');
    }

    const drawableDirs = [
      { folder: 'drawable', w: 480, h: 800 },
      { folder: 'drawable-night', w: 480, h: 800 },
      { folder: 'drawable-port-mdpi', w: 320, h: 480 },
      { folder: 'drawable-port-hdpi', w: 480, h: 800 },
      { folder: 'drawable-port-xhdpi', w: 720, h: 1280 },
      { folder: 'drawable-port-xxhdpi', w: 960, h: 1600 },
      { folder: 'drawable-port-xxxhdpi', w: 1280, h: 1920 },
      { folder: 'drawable-land-mdpi', w: 480, h: 320 },
      { folder: 'drawable-land-hdpi', w: 800, h: 480 },
      { folder: 'drawable-land-xhdpi', w: 1280, h: 720 },
      { folder: 'drawable-land-xxhdpi', w: 1600, h: 960 },
      { folder: 'drawable-land-xxxhdpi', w: 1920, h: 1280 }
    ];

    for (const d of drawableDirs) {
      const dPath = path.join(ANDROID_RES_DIR, d.folder);
      if (!fs.existsSync(dPath)) fs.mkdirSync(dPath, { recursive: true });
      const logoSize = Math.round(Math.min(d.w, d.h) * 0.38);
      const centeredLogo = await sharp(master1024Buffer)
        .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      await sharp({
        create: {
          width: d.w,
          height: d.h,
          channels: 4,
          background: splashBgRgba
        }
      })
        .composite([{ input: centeredLogo, gravity: 'center' }])
        .png()
        .toFile(path.join(dPath, 'splash.png'));
    }

    console.log(`   ✅ تمام آیکون‌های اندروید در مسیر android/app/src/main/res/mipmap-* با پس‌زمینه (${colorValue}) ساخته شدند.`);
  } else {
    console.warn('   ⚠️ پوشه android/app/src/main/res یافت نشد؛ فایل‌های آماده در assets/ ذخیره شدند.');
  }

  console.log('\n==============================================================');
  console.log('🎉 عملیات ساخت آیکون‌ها با موفقیت کامل شد! مسیرهای خروجی:');
  console.log('   1) وب و PWA:      public/app-icon.png , public/pwa-512x512.png , public/favicon.ico');
  console.log('   2) دسکتاپ تائوری: src-tauri/icons/icon.ico , src-tauri/icons/icon.png , 32x32, 128x128');
  console.log('   3) اندروید:       android/app/src/main/res/mipmap-mdpi ... mipmap-xxxhdpi');
  console.log('==============================================================');
}

if (require.main === module) {
  generateAllIcons().catch(err => {
    console.error('❌ خطا در ساخت آیکون‌ها:', err);
    process.exit(1);
  });
}

module.exports = { generateAllIcons, detectIconBackground, purgeTauriIconBuildCache, refreshWindowsIconCache };
