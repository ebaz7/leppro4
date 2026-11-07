const { generateAllIcons } = require('./setup-assets.cjs');

generateAllIcons().catch(err => {
  console.error('❌ خطا در ساخت آیکون‌ها:', err);
  process.exit(1);
});
