const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('/api/version') || line.includes('/check-update') || line.includes('sayan-app.apk') || line.includes('android')) {
    if (line.includes('app.get') || line.includes('app.post') || line.includes('router') || line.includes('version')) {
      console.log(`Line ${idx + 1}: ${line}`);
    }
  }
});
