const fs = require('fs');
const filePath = '/app/applet/components/WarehouseFinalizeModal.tsx';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add apiCall import if missing
if (!code.includes('apiCall')) {
  code = code.replace(
    "import { getSettings } from '../services/storageService';",
    "import { getSettings } from '../services/storageService';\nimport { apiCall } from '../services/apiService';"
  );
}

// 2. Rewrite handleSave to be 100% instant and non-blocking
const oldHandleSave = /const handleSave = async \(\) => \{[\s\S]*?onConfirm\(finalizedItems, sayanRemittance, attachmentDataUrl, attachedRemittances\);\s*\};/g;

const newHandleSave = `const handleSave = () => {
    if (items.some(i => !i.goodsName)) return alert("نام کالا نمی‌تواند خالی باشد.");
    if (items.some(i => i.deliveredCartonCount === undefined || i.deliveredCartonCount === null || i.deliveredCartonCount <= 0)) {
      return alert("وارد کردن تعداد کارتن خروجی معتبر برای تمامی ردیف‌ها الزامی است.");
    }
    if (items.some(i => !i.deliveredWeight || i.deliveredWeight <= 0)) return alert("وارد کردن وزن خروجی برای تمامی ردیف‌ها الزامی است.");

    setIsSubmitting(true);

    const finalizedItems = items.map(i => ({
      ...i,
      cartonCount: Number(i.cartonCount), 
      weight: Number(i.weight),
      deliveredCartonCount: Number(i.deliveredCartonCount),
      deliveredWeight: Number(i.deliveredWeight)
    }));

    // ⚡ INSTANT CONFIRMATION & MODAL CLOSE (0ms delay)
    onConfirm(finalizedItems, sayanRemittance, undefined, attachedRemittances);

    // 🚀 BACKGROUND NON-BLOCKING REMITTANCE CAPTURE & ATTACHMENT
    if (settings?.sayanOnlineExitPermitsEnabled || sayanRemittance) {
      const permitId = permit.id;
      const remNum = sayanRemittance?.remittanceNumber || permit.permitNumber;
      setTimeout(async () => {
        try {
          const elId = 'hidden-sayan-remittance-capture';
          const bgDataUrl = await captureElementToDataUrl(elId);
          if (bgDataUrl) {
            const docName = \`حواله_فروش_سایان_\${remNum}.png\`;
            const bgAttachment = { fileName: docName, data: bgDataUrl };
            await apiCall(\`/exit-permits/\${permitId}\`, 'PUT', {
              attachments: [...(permit.attachments || []), bgAttachment]
            }).catch(() => {});
          }
        } catch (err) {
          console.warn('Background Sayan remittance capture warning:', err);
        }
      }, 100);
    }
  };`;

code = code.replace(oldHandleSave, newHandleSave);
fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated WarehouseFinalizeModal.tsx for instant non-blocking confirmation!');
