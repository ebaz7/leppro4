const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function fixIconAndGenerate() {
  console.log('🔄 Checking source icon format and converting to valid PNG...');

  // Identify available source image
  const candidates = [
    path.join(__dirname, 'app-icon.png'),
    path.join(__dirname, 'public', 'app-icon.png'),
    path.join(__dirname, 'assets', 'icon.png'),
  ];

  let sourceFile = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const metadata = await sharp(c).metadata();
        if (metadata && metadata.width && metadata.height) {
          sourceFile = c;
          console.log(`✅ Found valid image: ${path.basename(c)} (Format: ${metadata.format}, Size: ${metadata.width}x${metadata.height})`);
          break;
        }
      } catch (err) {
        console.warn(`⚠️ File ${path.basename(c)} could not be read as an image:`, err.message);
      }
    }
  }

  if (!sourceFile) {
    console.error('❌ No valid source image found in root or assets directory.');
    process.exit(1);
  }

  // 1. Convert and save a guaranteed pristine 1024x1024 PNG with valid PNG signature
  const targetAppIcon = path.join(__dirname, 'app-icon.png');
  const transparentBg = { r: 0, g: 0, b: 0, alpha: 0 };

  console.log('📦 Re-encoding into authentic 1024x1024 PNG with valid signature...');
  await sharp(sourceFile)
    .ensureAlpha()
    .resize(1024, 1024, { fit: 'contain', background: transparentBg })
    .png({ compressionLevel: 9, adaptiveFiltering: true, force: true })
    .toFile(targetAppIcon + '.tmp');

  if (fs.existsSync(targetAppIcon)) {
    try { fs.unlinkSync(targetAppIcon); } catch (_) {}
  }
  fs.renameSync(targetAppIcon + '.tmp', targetAppIcon);
  console.log('✅ app-icon.png saved with guaranteed valid PNG signature!');

  // 2. Generate all src-tauri/icons directly using Sharp
  const tauriIconsDir = path.join(__dirname, 'src-tauri', 'icons');
  if (!fs.existsSync(tauriIconsDir)) {
    fs.mkdirSync(tauriIconsDir, { recursive: true });
  }

  const iconSizes = [
    { name: '32x32.png', size: 32 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: 'icon.png', size: 512 },
    { name: 'StoreLogo.png', size: 50 },
    { name: 'Square30x30Logo.png', size: 30 },
    { name: 'Square44x44Logo.png', size: 44 },
    { name: 'Square71x71Logo.png', size: 71 },
    { name: 'Square89x89Logo.png', size: 89 },
    { name: 'Square107x107Logo.png', size: 107 },
    { name: 'Square142x142Logo.png', size: 142 },
    { name: 'Square150x150Logo.png', size: 150 },
    { name: 'Square284x284Logo.png', size: 284 },
    { name: 'Square310x310Logo.png', size: 310 },
  ];

  for (const { name, size } of iconSizes) {
    await sharp(targetAppIcon)
      .ensureAlpha()
      .resize(size, size, { fit: 'contain', background: transparentBg })
      .png()
      .toFile(path.join(tauriIconsDir, name));
  }
  console.log('✅ All PNG desktop icons generated in src-tauri/icons/');

  // 3. Clean .npmrc if corrupted with BOM or bad encoding
  const npmrcPath = path.join(__dirname, '.npmrc');
  const cleanNpmrc = `registry=https://registry.npmjs.org
puppeteer_skip_chromium_download=true
puppeteer_skip_download=true
sharp_binary_host=https://npmmirror.com/mirrors/sharp
sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips
fetch-retry-maxtimeout=120000
fetch-retry-mintimeout=15000
fetch-retries=5
audit=false
fund=false
legacy-peer-deps=true
`;
  fs.writeFileSync(npmrcPath, cleanNpmrc, { encoding: 'utf8' });
  console.log('✅ .npmrc file verified and saved with clean UTF-8 (no BOM).');

  console.log('\n🎉 Finished! You can now run:');
  console.log('   npx tauri icon app-icon.png -o src-tauri/icons');
  console.log('   OR directly build desktop:');
  console.log('   npm run desktop:build');
}

fixIconAndGenerate().catch((err) => {
  console.error('❌ Error during icon fix:', err);
});
