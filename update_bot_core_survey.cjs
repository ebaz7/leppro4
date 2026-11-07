const fs = require('fs');
const filePath = '/app/applet/backend/bot-core.js';
let code = fs.readFileSync(filePath, 'utf8');

// Replace driver caption block
const oldDriverMarker = 'if (p.driverPhone && settings.whatsappEnabled !== false) {';
const idx = code.indexOf(oldDriverMarker);
if (idx !== -1) {
  const endIdx = code.indexOf('const driverImg = imgNoPrice || imgPrice;', idx);
  if (endIdx !== -1) {
    const replacement = `if (p.driverPhone && settings.whatsappEnabled !== false) {
                const surveyUrl = \`\${(settings.appBaseUrl || 'https://dlkam.ir').replace(/\\/+$/, '')}/#customer-survey?id=\${p.permitNumber}\`;
                
                let driverGoodsList = '';
                if (p.items && p.items.length > 0) {
                    driverGoodsList = p.items.map((it, idx) => {
                        const cartons = it.cartonCount || it.deliveredCartons || it.cartons || 0;
                        const w = it.deliveredWeight || it.weight || 0;
                        return \`\${idx + 1}. \${it.goodsName || 'کالا'} \${cartons ? \`(\${cartons} کارتن)\` : ''} \${w ? \`- \${Number(w).toLocaleString()} kg\` : ''}\`;
                    }).join('\\n');
                } else if (p.goodsName) {
                    driverGoodsList = \`1. \${p.goodsName} (\${p.cartonCount || 0} کارتن) \${p.netWeight ? \`- \${Number(p.netWeight).toLocaleString()} kg\` : ''}\`;
                } else {
                    driverGoodsList = 'ثبت نشده';
                }

                const driverWeight = totalDelivWeight > 0 ? totalDelivWeight : (totalReqWeight > 0 ? totalReqWeight : (Number(p.netWeight || p.totalWeight || 0)));
                const driverCartons = totalDelivCount > 0 ? totalDelivCount : (totalReqCount > 0 ? totalReqCount : (Number(p.cartonCount || p.totalCartons || 0)));

                const driverCaption = \`🚛 *تایید نهایی خروج بار از کارخانه*\\n\\n\` +
                    \`راننده گرامی جناب آقای *\${p.driverName || 'راننده محترم'}* (خودرو: *\${p.plateNumber || '-'}*)\\n\` +
                    \`مجوز خروج شماره *\u200E#\${p.permitNumber}* مربوط به شرکت *\${p.company || '-'}* تایید و بارگیری تکمیل گردید.\\n\\n\` +
                    \`⚖️ *وزن کل خروجی بار:* *\${driverWeight > 0 ? driverWeight.toLocaleString() : '-'} کیلوگرم*\\n\` +
                    \`📦 *تعداد کارتن / بسته‌ها:* *\${driverCartons > 0 ? driverCartons.toLocaleString() : '-'} عدد*\\n\\n\` +
                    \`📦 *اقلام و کالاهای بارگیری شده:*\\n\${driverGoodsList}\\n\\n\` +
                    \`📍 *مقصد:* \${p.destinationAddress || 'تحویل مشتری'}\\n\` +
                    \`سفر بی‌خطری را برای شما آرزومندیم. 🛣️\\n\\n\` +
                    \`⭐ *فرم نظرسنجی و ارزیابی کیفیت خدمات مشتریان:*\\n\` +
                    \`\${surveyUrl}\`;\n\n                `;
    code = code.substring(0, idx) + replacement + code.substring(endIdx);
    console.log('Successfully updated driver caption block in bot-core.js!');
  }
}

// Replace generateCaption return
const genMarker = 'const generateCaption = (targetGroupId) => {';
const genIdx = code.indexOf(genMarker);
if (genIdx !== -1) {
  const retIdx = code.indexOf('return `${header}\\n🏢 شرکت:', genIdx);
  if (retIdx !== -1) {
    const endRetIdx = code.indexOf('`;', retIdx);
    if (endRetIdx !== -1) {
      const oldReturnText = code.substring(retIdx, endRetIdx + 2);
      const newReturnText = `const surveyUrl = \`\${(settings.appBaseUrl || 'https://dlkam.ir').replace(/\\/+$/, '')}/#customer-survey?id=\${p.permitNumber}\`;
            const surveyBlock = (isFinalStep || p.status === 'خارج شده (بایگانی)' || p.status === 'خارج شد') ? \`\\n\\n⭐ *فرم نظرسنجی و ارزیابی کیفیت خدمات مشتریان:*\\n\${surveyUrl}\` : '';
            ${oldReturnText.replace('`;', '${surveyBlock}`;')}`;
      code = code.substring(0, retIdx) + newReturnText + code.substring(endRetIdx + 2);
      console.log('Successfully updated generateCaption return in bot-core.js!');
    }
  }
}

fs.writeFileSync(filePath, code, 'utf8');
