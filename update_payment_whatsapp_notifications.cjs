const fs = require('fs');

// 1. Update App.tsx
const appPath = '/app/applet/App.tsx';
if (fs.existsSync(appPath)) {
  let appCode = fs.readFileSync(appPath, 'utf8');

  const oldAppBlock = `if (type === 'create') {
                      targetUser = usersList.find(u => u.role === UserRole.FINANCIAL && u.phoneNumber);
                      caption = \`📢 *درخواست پرداخت جدید*\\nشماره: \${order.trackingNumber}\\nمبلغ: \${formatCurrency(order.totalAmount)}\\nدرخواست کننده: \${order.requester}\\n\\nلطفا بررسی نمایید.\`;
                  } else if (type === 'approve') {
                      if (order.status === OrderStatus.APPROVED_FINANCE) { 
                           targetUser = usersList.find(u => u.role === UserRole.MANAGER && u.phoneNumber);
                           caption = \`✅ *تایید مالی انجام شد*\\nشماره: \${order.trackingNumber}\\nمنتظر تایید مدیریت.\`; 
                       } else if (order.status === OrderStatus.APPROVED_MANAGER) { 
                           targetUser = usersList.find(u => u.role === UserRole.CEO && u.phoneNumber);
                           caption = \`✅ *تایید مدیریت انجام شد*\\nشماره: \${order.trackingNumber}\\nمنتظر تایید نهایی مدیرعامل.\`; 
                       } else if (order.status === OrderStatus.APPROVED_CEO) { 
                           targetUser = usersList.find(u => u.role === UserRole.FINANCIAL && u.phoneNumber);
                           caption = \`💰 *دستور پرداخت تایید نهایی شد*\\nشماره: \${order.trackingNumber}\\nلطفا پرداخت نمایید.\`; 
                       }
                  }`;

  const newAppBlock = `let bankInfo = '-';
                  if (order.paymentDetails && order.paymentDetails.length > 0) {
                      const b = [...new Set(order.paymentDetails.map((d: any) => d.bankName || d.method).filter(Boolean))];
                      if (b.length > 0) bankInfo = b.join('، ');
                  }

                  if (type === 'create') {
                      targetUser = usersList.find(u => u.role === UserRole.FINANCIAL && u.phoneNumber);
                      caption = \`📢 *درخواست پرداخت جدید*\\n\\n\` +
                          \`🔢 *شماره پیگیری:* #\${order.trackingNumber || order.id}\\n\` +
                          \`🏢 *شرکت صادرکننده:* \${order.payingCompany || order.company || '-'}\\n\` +
                          \`💰 *مبلغ کل:* *\${formatCurrency(order.totalAmount)}*\\n\` +
                          \`👤 *ذینفع / دریافت‌کننده:* *\${order.payee || order.beneficiary || '-'}\\n\` +
                          \`👤 *درخواست‌کننده:* \${order.requester || order.createdByName || '-'}\\n\` +
                          \`📅 *تاریخ ثبت/پرداخت:* \${order.date || '-'}\\n\` +
                          \`🏦 *بانک / حساب:* \${bankInfo}\\n\` +
                          \`💳 *روش پرداخت:* \${(order.paymentDetails && order.paymentDetails.length > 0) ? order.paymentDetails[0].method : (order.paymentMethod || '-')}\\n\` +
                          \`📍 *محل / مرکز هزینه:* \${order.paymentPlace || order.costCenter || '-'}\\n\` +
                          \`📝 *بابت / توضیحات کامل:* \${order.description || '-'}\\n\\n\` +
                          \`لطفا بررسی و اقدام فرمایید.\`;
                  } else if (type === 'approve') {
                      if (order.status === OrderStatus.APPROVED_FINANCE) { 
                           targetUser = usersList.find(u => u.role === UserRole.MANAGER && u.phoneNumber);
                           caption = \`✅ *تایید مالی انجام شد*\\n\\n\` +
                               \`🔢 *شماره:* #\${order.trackingNumber || order.id}\\n\` +
                               \`🏢 *شرکت:* \${order.payingCompany || '-'}\\n\` +
                               \`💰 *مبلغ:* *\${formatCurrency(order.totalAmount)}*\\n\` +
                               \`👤 *ذینفع:* *\${order.payee || '-'}\\n\` +
                               \`📝 *بابت:* \${order.description || '-'}\\n\\n\` +
                               \`منتظر تایید مدیریت.\`; 
                       } else if (order.status === OrderStatus.APPROVED_MANAGER) { 
                           targetUser = usersList.find(u => u.role === UserRole.CEO && u.phoneNumber);
                           caption = \`✅ *تایید مدیریت انجام شد*\\n\\n\` +
                               \`🔢 *شماره:* #\${order.trackingNumber || order.id}\\n\` +
                               \`🏢 *شرکت:* \${order.payingCompany || '-'}\\n\` +
                               \`💰 *مبلغ:* *\${formatCurrency(order.totalAmount)}*\\n\` +
                               \`👤 *ذینفع:* *\${order.payee || '-'}\\n\` +
                               \`📝 *بابت:* \${order.description || '-'}\\n\\n\` +
                               \`منتظر تایید نهایی مدیرعامل.\`; 
                       } else if (order.status === OrderStatus.APPROVED_CEO) { 
                           targetUser = usersList.find(u => u.role === UserRole.FINANCIAL && u.phoneNumber);
                           caption = \`💰 *دستور پرداخت تایید نهایی شد*\\n\\n\` +
                               \`🔢 *شماره:* #\${order.trackingNumber || order.id}\\n\` +
                               \`🏢 *شرکت:* \${order.payingCompany || '-'}\\n\` +
                               \`💰 *مبلغ:* *\${formatCurrency(order.totalAmount)}*\\n\` +
                               \`👤 *ذینفع:* *\${order.payee || '-'}\\n\` +
                               \`📝 *بابت:* \${order.description || '-'}\\n\\n\` +
                               \`لطفا پرداخت نمایید.\`; 
                       }
                  }`;

  appCode = appCode.replace(oldAppBlock, newAppBlock);
  fs.writeFileSync(appPath, appCode, 'utf8');
  console.log('Successfully updated App.tsx payment WhatsApp notification captions!');
}

// 2. Update backend/bot-core.js notifyPaymentOrderStep
const botPath = '/app/applet/backend/bot-core.js';
if (fs.existsSync(botPath)) {
  let botCode = fs.readFileSync(botPath, 'utf8');

  // Enhance notifyPaymentOrderStep caption and attached file forwarding
  const oldCaptionMarker = "let header = isDelete ? `❌ *حذف شد: دستور پرداخت*` : (isEdit ? `✏️ *ویرایش شد: دستور پرداخت*` : `💸 *دستور پرداخت*`);";
  const oldCaptionEnd = "const attachFiles = o.attachments && o.attachments.length > 0;";

  const cIdx = botCode.indexOf(oldCaptionMarker);
  const eIdx = botCode.indexOf(oldCaptionEnd);

  if (cIdx !== -1 && eIdx !== -1) {
    const newCaptionBlock = `let header = isDelete ? \`❌ *حذف شد: دستور پرداخت*\` : (isEdit ? \`✏️ *ویرایش شد: دستور پرداخت*\` : \`📢 *درخواست پرداخت جدید*\`);
        let caption = \`\${header}\\n\\n\` +
            \`🔢 *شماره پیگیری:* #\${o.trackingNumber || o.id}\\n\` +
            \`🏢 *شرکت صادرکننده:* \${o.payingCompany || o.company || '-'}\\n\` +
            \`💰 *مبلغ کل:* *\${Number(o.totalAmount || 0).toLocaleString()} ریال*\\n\` +
            \`👤 *ذینفع / دریافت‌کننده:* *\${o.payee || o.beneficiary || '-'}\\n\` +
            \`👤 *درخواست کننده:* \${o.requester || o.createdByName || '-'}\\n\` +
            \`📅 *تاریخ ثبت/پرداخت:* \${o.date ? toShamsiFull(o.date) : '-'}\\n\` +
            \`🏦 *بانک / حساب:* \${paymentBankInfo}\\n\` +
            \`💳 *نوع/روش پرداخت:* \${(o.paymentDetails && o.paymentDetails.length > 0) ? o.paymentDetails[0].method : (o.paymentMethod || '-')}\\n\` +
            \`📍 *محل / مرکز هزینه:* \${o.paymentPlace || o.costCenter || '-'}\\n\` +
            \`📝 *بابت / توضیحات کامل:* \${o.description || '-'}\\n\\n\` +
            \`✅ *مرحله:* \${stepName}\\n\` +
            \`🔄 *وضعیت:* \${o.status}\${isEdit ? '\\n⚠️ *این یک پیام ویرایشی است*' : ''}\${isDelete ? '\\n⚠️ *این سند حذف شده است*' : ''}\`;\n\n        `;
    botCode = botCode.substring(0, cIdx) + newCaptionBlock + botCode.substring(eIdx);
    console.log('Successfully updated notifyPaymentOrderStep caption in bot-core.js!');
  }

  // Also check if attached invoice photos should be sent along with paymentOrderImgBuffer
  const waGroupSendBlock = "if (waGroupId && settings.whatsappEnabled) {";
  const waGroupIdx = botCode.indexOf(waGroupSendBlock);
  if (waGroupIdx !== -1) {
    const waSendEnd = "filename: `payment_order_${o.id || o.trackingNumber}.png`\n                    }).catch(async () => {";
    const waSendIdx = botCode.indexOf(waSendEnd, waGroupIdx);
    if (waSendIdx !== -1) {
      // Ensure if o.attachments has image files, send attached photo files as additional media!
      const attachSendCode = `
                    // Send attached photo/file if present
                    if (o.attachments && o.attachments.length > 0) {
                      for (let attIdx = 0; attIdx < o.attachments.length; attIdx++) {
                        const att = o.attachments[attIdx];
                        if (att.data || att.url) {
                          try {
                            const attB64 = att.data ? att.data.replace(/^data:[^;]+;base64,/, '') : null;
                            if (attB64) {
                              const attMime = att.mimeType || (att.name && att.name.endsWith('.pdf') ? 'application/pdf' : 'image/png');
                              await mod.sendMessage(waGroupId, \`📎 پیوست (\${attIdx + 1}/\${o.attachments.length}) دستور پرداخت #\${o.trackingNumber || o.id}\\n📄 \${att.name || 'فاکتور/پیوست'}\`, {
                                data: attB64,
                                mimeType: attMime,
                                filename: att.name || \`attachment_\${attIdx + 1}.png\`
                              }).catch(() => {});
                            }
                          } catch (attErr) {}
                        }
                      }
                    }
      `;
      botCode = botCode.substring(0, waSendIdx + waSendEnd.length) + attachSendCode + botCode.substring(waSendIdx + waSendEnd.length);
      console.log('Successfully added attachment photo forwarding in bot-core.js!');
    }
  }

  fs.writeFileSync(botPath, botCode, 'utf8');
}
