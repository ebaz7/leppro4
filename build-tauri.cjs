const { buildAndPublishTauri } = require('./setup-desktop-icons.cjs');

buildAndPublishTauri().catch(err => {
  console.error('❌ خطای غیرمنتظره در ساخت نسخه دسکتاپ:', err);
  process.exit(1);
});
