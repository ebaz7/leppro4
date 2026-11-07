import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
    Printer, 
    X, 
    Download, 
    FileText, 
    CheckCircle2, 
    Copy, 
    Check, 
    Building2, 
    User, 
    Calendar, 
    CreditCard, 
    MessageSquare, 
    Paperclip,
    Image as ImageIcon,
    Eye
} from 'lucide-react';
import * as jalaali from 'jalaali-js';
import { formatChequeAmountInWords } from '../../utils/persianNumberToWords';
import { shareElementToChat, openSendToChat } from '../../services/chatShareService';
import { resolveImageUrl } from '../../services/apiService';

export interface A5ChequeData {
    id?: string | number;
    receiptNo?: string | number;
    poshtNomreh?: string;
    personCode?: string;
    personName?: string;
    cashboxCode?: string;
    cashboxTitle?: string;
    fiscalYear?: string;
    totalAmount: number;
    docDateShamsi?: string;
    createdAt?: string;
    description?: string;
    createdByName?: string;
    cheques: Array<{
        chequeNumber: string;
        amount: number | string;
        dueDate: string;
        bankName: string;
        inNameOf?: string;
        description?: string;
        rowSeq?: number;
    }>;
    attachments?: Array<{
        id?: string;
        fileName: string;
        fileType?: string;
        fileSize?: number;
        fileData?: string;
        url?: string;
    }>;
}

interface Props {
    isOpen?: boolean;
    receipt: A5ChequeData | null;
    onClose: () => void;
    onRegisterNewNext?: () => void;
}

const toPersianDigits = (num: string | number | undefined | null): string => {
    if (num === undefined || num === null || num === '') return '';
    return String(num).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
};

const toShamsiStr = (dateStr?: string): string => {
    if (!dateStr) return '';
    try {
        if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) return dateStr;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const mm = String(j.jm).padStart(2, '0');
        const dd = String(j.jd).padStart(2, '0');
        return `${j.jy}/${mm}/${dd}`;
    } catch {
        return dateStr || '';
    }
};

/**
 * Builds standalone, isolated pure-white A5 Landscape HTML for direct printing.
 * This completely prevents dark mode, gray overlays, or parent container backgrounds.
 */
function buildA5ChequePrintHtml(receipt: A5ChequeData, printTarget: 'all' | 'receipt' | 'attachments'): string {
    const totalAmount = Number(receipt.totalAmount) || 0;
    const amountInWords = formatChequeAmountInWords(totalAmount);
    const receiptDate = receipt.docDateShamsi || toShamsiStr(receipt.createdAt) || toShamsiStr(new Date().toISOString());
    const attachments = Array.isArray(receipt.attachments) ? receipt.attachments : [];
    const hasAttachments = attachments.length > 0;

    const includeReceipt = printTarget === 'all' || printTarget === 'receipt';
    const includeAttachments = hasAttachments && (printTarget === 'all' || printTarget === 'attachments');

    let pagesHtml = '';

    // PAGE 1: A5 Landscape Receipt
    if (includeReceipt) {
        const rowsHtml = receipt.cheques.map((ch, idx) => `
            <tr style="border-bottom: 1px solid #94a3b8;">
                <td style="padding: 3px 4px; border-left: 1px solid #94a3b8; text-align: center; font-weight: 900; font-family: monospace; font-size: 11px;">
                    ${toPersianDigits(ch.rowSeq || (idx + 1))}
                </td>
                <td style="padding: 3px 6px; border-left: 1px solid #94a3b8; text-align: right; direction: ltr; font-weight: 900; font-family: monospace; font-size: 12px; letter-spacing: 0.5px;">
                    ${toPersianDigits(ch.chequeNumber)}
                </td>
                <td style="padding: 3px 6px; border-left: 1px solid #94a3b8; text-align: center; font-weight: 800; font-family: monospace; font-size: 11.5px;">
                    ${toPersianDigits(toShamsiStr(ch.dueDate))}
                </td>
                <td style="padding: 3px 6px; border-left: 1px solid #94a3b8; text-align: left; direction: ltr; font-weight: 900; font-family: monospace; font-size: 12.5px;">
                    ${toPersianDigits(Number(ch.amount).toLocaleString('fa-IR'))}
                </td>
                <td style="padding: 3px 6px; border-left: 1px solid #94a3b8; text-align: center; font-weight: 800; font-size: 11.5px;">
                    ${ch.bankName || '-'}
                </td>
                <td style="padding: 3px 6px; border-left: 1px solid #94a3b8; text-align: right; font-weight: 700; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">
                    ${ch.inNameOf || receipt.personName || '-'}
                </td>
                <td style="padding: 3px 6px; text-align: right; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;">
                    ${ch.description || '-'}
                </td>
            </tr>
        `).join('');

        pagesHtml += `
        <div class="print-page a5-landscape">
            <!-- Header Section -->
            <div style="border-bottom: 2px solid #000000; padding-bottom: 4px;">
                <table style="width: 100%; border-collapse: collapse; border: none;">
                    <tr>
                        <td style="width: 33%; text-align: right; vertical-align: top; border: none; padding: 0;">
                            <div style="font-size: 15px; font-weight: 900; color: #000000; line-height: 1.2;">شرکت لپان بافت</div>
                            <div style="font-size: 11px; font-weight: bold; color: #334155; margin-top: 1px;">سیستم مدیریت مالی و خزانه‌داری</div>
                            <div style="font-size: 10px; color: #475569;">واحد اعتبارات و دریافت اسناد تجاری</div>
                        </td>
                        <td style="width: 34%; text-align: center; vertical-align: top; border: none; padding: 0;">
                            <div style="display: inline-block; padding: 3px 14px; border: 2px solid #000000; border-radius: 8px; background-color: #f1f5f9;">
                                <div style="font-size: 14px; font-weight: 900; color: #000000;">رسید دریافت چک</div>
                            </div>
                            <div style="font-size: 10px; font-weight: bold; color: #475569; margin-top: 2px;">(اسناد دریافتنی نزد صندوق خزانه‌داری)</div>
                        </td>
                        <td style="width: 33%; text-align: left; vertical-align: top; border: none; padding: 0; font-family: monospace; font-size: 11px;">
                            <div style="margin-bottom: 2px;"><span style="font-family: inherit; font-size: 10.5px; color: #475569;">شماره رسید: </span><strong style="font-size: 13px; font-weight: 900; background: #f1f5f9; padding: 1px 4px; border: 1px solid #cbd5e1; border-radius: 4px;">#${toPersianDigits(receipt.receiptNo || receipt.id)}</strong></div>
                            <div style="margin-bottom: 2px;"><span style="font-family: inherit; font-size: 10.5px; color: #475569;">شماره پشت‌نمره: </span><strong style="font-size: 12px; font-weight: 900;">${toPersianDigits(receipt.poshtNomreh || '-')}</strong></div>
                            <div style="margin-bottom: 2px;"><span style="font-family: inherit; font-size: 10.5px; color: #475569;">تاریخ صدور: </span><strong style="font-size: 12px; font-weight: 900;">${toPersianDigits(receiptDate)}</strong></div>
                            <div><span style="font-family: inherit; font-size: 10px; color: #64748b;">سال مالی: </span><strong style="font-size: 11px;">${toPersianDigits(receipt.fiscalYear || '۱۴۰۳')}</strong></div>
                        </td>
                    </tr>
                </table>

                <div style="margin-top: 5px; padding-top: 4px; border-top: 1px dashed #94a3b8; display: flex; justify-content: space-between; font-size: 11.5px;">
                    <div style="flex: 1;">
                        <span style="color: #334155; font-weight: 900; font-size: 12px;">دریافت شد از: </span>
                        <strong style="font-size: 14.5px; font-weight: 900; color: #000000; letter-spacing: -0.2px;">${receipt.personName || 'شخص نامشخص'}</strong>
                        <span style="font-family: monospace; font-size: 11px; font-weight: bold; color: #1e293b; background: #e2e8f0; padding: 1px 6px; border-radius: 4px; border: 1px solid #94a3b8; margin-right: 4px;">(کد: ${toPersianDigits(receipt.personCode)})</span>
                    </div>
                    <div style="margin-left: 15px;">
                        <span style="color: #475569; font-weight: bold;">صندوق: </span>
                        <strong style="color: #000000;">${receipt.cashboxTitle || (receipt.cashboxCode === '11001' ? 'صندوق دفتر مرکزی' : `صندوق کد ${toPersianDigits(receipt.cashboxCode)}`)}</strong>
                    </div>
                    <div>
                        <span style="color: #475569; font-weight: bold;">شرح / بابت: </span>
                        <span style="color: #000000; font-weight: 500;">${receipt.description || 'تسویه حساب و واریز اسناد دریافتنی'}</span>
                    </div>
                </div>
            </div>

            <!-- Table of Cheques -->
            <div style="flex: 1; margin: 4px 0; display: flex; flex-direction: column; justify-content: center;">
                <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000000; text-align: right; background-color: #ffffff;">
                    <thead>
                        <tr style="background-color: #f1f5f9; border-bottom: 1.5px solid #000000; font-size: 11px; font-weight: 900; color: #000000;">
                            <th style="padding: 3px 4px; border-left: 1px solid #000000; text-align: center; width: 30px;">ردیف</th>
                            <th style="padding: 3px 6px; border-left: 1px solid #000000; text-align: right;">شماره صیادی / چک</th>
                            <th style="padding: 3px 6px; border-left: 1px solid #000000; text-align: center; width: 90px;">تاریخ سررسید</th>
                            <th style="padding: 3px 6px; border-left: 1px solid #000000; text-align: left; width: 130px;">مبلغ چک (ریال)</th>
                            <th style="padding: 3px 6px; border-left: 1px solid #000000; text-align: center; width: 100px;">نام بانک / شعبه</th>
                            <th style="padding: 3px 6px; border-left: 1px solid #000000; text-align: right;">صاحب حساب / در وجه</th>
                            <th style="padding: 3px 6px; text-align: right;">شرح / پشت‌نمره</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- Financial Totals -->
            <div style="border: 1.5px solid #000000; border-radius: 6px; padding: 4px 8px; background-color: #f8fafc; font-size: 11.5px;">
                <table style="width: 100%; border-collapse: collapse; border: none;">
                    <tr>
                        <td style="text-align: right; border: none; padding: 0;">
                            <span style="font-weight: bold; color: #334155;">جمع کل مبالغ: </span>
                            <strong style="font-family: monospace; font-size: 14px; font-weight: 900; color: #000000;">${toPersianDigits(totalAmount.toLocaleString('fa-IR'))} ریال</strong>
                            <span style="font-family: monospace; font-size: 11px; font-weight: 900; background: #ffffff; padding: 1px 6px; border: 1px solid #cbd5e1; border-radius: 4px; margin-right: 6px;">(${toPersianDigits(Math.floor(totalAmount / 10).toLocaleString('fa-IR'))} تومان)</span>
                        </td>
                        <td style="text-align: left; border: none; padding: 0;">
                            <span style="color: #475569; font-weight: bold;">تعداد چک: </span>
                            <strong style="font-family: monospace; font-size: 13px; font-weight: 900;">${toPersianDigits(receipt.cheques.length)} فقره</strong>
                        </td>
                    </tr>
                </table>
                <div style="margin-top: 3px; padding-top: 3px; border-top: 1px solid #e2e8f0; font-size: 11px;">
                    <span style="font-weight: bold; color: #334155;">مبلغ به حروف: </span>
                    <strong style="color: #000000;">${amountInWords.rialWords} (${amountInWords.tomanWords})</strong>
                </div>
                <div style="font-size: 9px; color: #64748b; margin-top: 2px;">
                    * اسناد و چک‌های فوق‌الذکر جهت واریز به حساب و طی تشریفات بانکی دریافت گردید. تسویه نهایی منوط به وصول قطعی وجه در سررسیدهای مقرر در سامانه صیاد خواهد بود.
                </div>
            </div>

            <!-- Signatures Section -->
            <div style="margin-top: 5px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
                <div style="border: 1px solid #000000; border-radius: 6px; padding: 4px 6px; height: 32px; display: flex; align-items: center; justify-content: space-between; background: #ffffff;">
                    <span style="font-size: 10px; font-weight: 900; color: #000000;">ثبت‌کننده:</span>
                    <span style="font-size: 10px; font-weight: bold; font-family: monospace; color: #000000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90px;">${receipt.createdByName || 'کاربر ثبت'}</span>
                </div>
                <div style="border: 1px solid #000000; border-radius: 6px; padding: 4px 6px; height: 32px; display: flex; align-items: center; justify-content: space-between; background: #ffffff;">
                    <span style="font-size: 10px; font-weight: 900; color: #000000;">واحد فروش:</span>
                    <span style="font-size: 10px; font-weight: bold; color: #334155;">تایید و تحویل</span>
                </div>
                <div style="border: 1px solid #000000; border-radius: 6px; padding: 4px 6px; height: 32px; display: flex; align-items: center; justify-content: space-between; background: #ffffff;">
                    <span style="font-size: 9.5px; font-weight: 900; color: #000000;">سرپرست مالی / مدیر مالی:</span>
                    <span style="font-size: 10px; font-weight: bold; color: #334155;">تایید شد</span>
                </div>
                <div style="border: 1px solid #000000; border-radius: 6px; padding: 4px 6px; height: 32px; display: flex; align-items: center; justify-content: space-between; background: #ffffff;">
                    <span style="font-size: 10px; font-weight: 900; color: #000000;">مدیرعامل:</span>
                    <span style="font-size: 10px; font-weight: bold; color: #334155;">مهر و امضا</span>
                </div>
            </div>

            <!-- Footer Bar -->
            <div style="margin-top: 3px; padding-top: 2px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 8px; font-family: monospace; color: #64748b;">
                <span>سامانه هوشمند خزانه‌داری و چک لپان بافت</span>
                <span>شناسه سند: ${receipt.id || receipt.receiptNo}</span>
                <span>زمان چاپ: ${toPersianDigits(new Date().toLocaleTimeString('fa-IR'))}</span>
            </div>
        </div>
        `;
    }

    // PAGES 2+: Attached Images
    if (includeAttachments) {
        attachments.forEach((att, idx) => {
            const isImg = att.fileType?.startsWith('image/') || att.fileData?.startsWith('data:image');
            const src = resolveImageUrl(att.fileData || att.url || (att.fileName ? `/uploads/${att.fileName}` : ''));

            pagesHtml += `
            <div class="print-page a5-landscape" style="page-break-before: always; break-before: page;">
                <!-- Attachment Header -->
                <div style="border-bottom: 2px solid #000000; padding-bottom: 4px;">
                    <table style="width: 100%; border-collapse: collapse; border: none;">
                        <tr>
                            <td style="width: 35%; text-align: right; vertical-align: top; border: none; padding: 0;">
                                <div style="font-size: 14px; font-weight: 900; color: #000000;">شرکت لپان بافت</div>
                                <div style="font-size: 10.5px; font-weight: bold; color: #334155; margin-top: 1px;">
                                    پیوست سند دریافت چک • برگه ${toPersianDigits(idx + 1)} از ${toPersianDigits(attachments.length)}
                                </div>
                            </td>
                            <td style="width: 30%; text-align: center; vertical-align: top; border: none; padding: 0;">
                                <div style="display: inline-block; padding: 2px 10px; border: 1px solid #000000; border-radius: 6px; background-color: #f1f5f9; font-size: 11px; font-weight: 900;">
                                    تصویر و مدارک پیوست چک
                                </div>
                            </td>
                            <td style="width: 35%; text-align: left; vertical-align: top; border: none; padding: 0; font-family: monospace; font-size: 10.5px;">
                                <div><span style="font-family: inherit; color: #475569;">پیوست رسید: </span><strong style="font-weight: 900;">#${toPersianDigits(receipt.receiptNo || receipt.id)}</strong></div>
                                <div><span style="font-family: inherit; color: #475569;">پشت‌نمره: </span><strong style="font-weight: 900;">${toPersianDigits(receipt.poshtNomreh || '-')}</strong></div>
                                <div><span style="font-family: inherit; color: #475569;">تاریخ: </span><strong>${toPersianDigits(receiptDate)}</strong></div>
                            </td>
                        </tr>
                    </table>

                    <div style="margin-top: 4px; padding-top: 3px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; font-size: 10.5px; color: #334155;">
                        <div>
                            <span style="font-weight: bold; color: #475569;">طرف‌حساب: </span>
                            <strong style="color: #000000;">${receipt.personName} (کد ${toPersianDigits(receipt.personCode)})</strong>
                        </div>
                        <div style="font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;">
                            <span style="font-family: inherit; font-weight: bold; color: #475569;">نام فایل: </span>
                            <strong>${att.fileName}</strong>
                        </div>
                        <div>
                            <span style="font-weight: bold; color: #475569;">مبلغ رسید: </span>
                            <strong style="font-family: monospace; color: #047857;">${toPersianDigits(totalAmount.toLocaleString('fa-IR'))} ریال</strong>
                        </div>
                    </div>
                </div>

                <!-- Attachment Image View -->
                <div style="flex: 1; margin: 6px 0; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px;">
                    ${isImg && src ? `
                        <img src="${src}" alt="${att.fileName}" style="max-height: 105mm; max-width: 100%; object-fit: contain; margin: 0 auto; display: block;" />
                    ` : `
                        <div style="text-align: center; padding: 20px; color: #334155;">
                            <div style="font-size: 14px; font-weight: 900; margin-bottom: 5px;">${att.fileName}</div>
                            <div style="font-size: 11px; font-family: monospace; color: #64748b;">فرمت: ${att.fileType || 'سند پیوست'} • حجم: ${att.fileSize ? `${Math.round(att.fileSize / 1024)} KB` : '-'}</div>
                        </div>
                    `}
                </div>

                <!-- Attachment Footer -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 2px; display: flex; justify-content: space-between; font-size: 8.5px; font-family: monospace; color: #64748b;">
                    <span>سامانه هوشمند خزانه‌داری و چک لپان بافت</span>
                    <span>ضمیمه رسمی سند حسابداری</span>
                    <span>چاپ: ${toPersianDigits(receiptDate)} - ${toPersianDigits(new Date().toLocaleTimeString('fa-IR'))}</span>
                </div>
            </div>
            `;
        });
    }

    return `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>رسید دریافت چک #${receipt.receiptNo || receipt.id} - لپان بافت</title>
        <style>
            @font-face {
                font-family: 'Vazirmatn';
                src: url('/fonts/Vazirmatn-Regular.woff2') format('woff2');
                font-weight: normal;
                font-style: normal;
            }
            @font-face {
                font-family: 'Vazirmatn';
                src: url('/fonts/Vazirmatn-Bold.woff2') format('woff2');
                font-weight: bold;
                font-style: normal;
            }
            @page {
                size: A5 landscape;
                margin: 0;
            }
            * {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            html, body {
                margin: 0;
                padding: 0;
                background-color: #ffffff !important;
                background: #ffffff !important;
                color: #000000 !important;
                font-family: "Vazirmatn", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Tahoma, sans-serif;
                direction: rtl;
                text-align: right;
            }
            .print-page {
                width: 200mm;
                height: 136mm;
                max-height: 136mm;
                margin: 6mm auto;
                padding: 3.5mm 5mm;
                background-color: #ffffff !important;
                background: #ffffff !important;
                color: #000000 !important;
                border: 2px solid #000000;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                page-break-inside: avoid;
                break-inside: avoid;
                overflow: hidden;
            }
            @media print {
                html, body, #root, #root *, [class*="theme-"], [class*="bg-"], [class*="text-"], .dark, .dark * {
                    background: #ffffff !important;
                    background-color: #ffffff !important;
                    color: #000000 !important;
                    border-color: #000000 !important;
                    box-shadow: none !important;
                    filter: none !important;
                }
                .print-page {
                    page-break-inside: avoid;
                    break-inside: avoid;
                    border: 1.5px solid #000000 !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                }
            }
        </style>
    </head>
    <body>
        ${pagesHtml}
    </body>
    </html>
    `;
}

export const A5ChequeReceiptPrintModal: React.FC<Props> = ({
    isOpen = true,
    receipt,
    onClose,
    onRegisterNewNext
}) => {
    const [copied, setCopied] = React.useState(false);
    const [sharingToChat, setSharingToChat] = useState(false);
    const [printTarget, setPrintTarget] = useState<'all' | 'receipt' | 'attachments'>('all');
    const [isPrinting, setIsPrinting] = useState(false);

    if (!isOpen || !receipt) return null;

    const attachments = Array.isArray(receipt.attachments) ? receipt.attachments : [];
    const hasAttachments = attachments.length > 0;

    /**
     * Isolated Pure White iframe Print:
     * Eliminates 100% of gray backgrounds, dark mode artifacts, and modal backdrops.
     */
    const handlePrintDirectly = (target: 'all' | 'receipt' | 'attachments' = 'all') => {
        setIsPrinting(true);
        setPrintTarget(target);

        try {
            const htmlContent = buildA5ChequePrintHtml(receipt, target);

            // Create invisible iframe
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0px';
            iframe.style.height = '0px';
            iframe.style.border = '0';
            iframe.style.zIndex = '-9999';
            document.body.appendChild(iframe);

            const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
            if (!frameDoc) {
                window.print();
                setIsPrinting(false);
                return;
            }

            frameDoc.open();
            frameDoc.write(htmlContent);
            frameDoc.close();

            // Allow rendering then print
            setTimeout(() => {
                try {
                    if (iframe.contentWindow) {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                    }
                } catch (err) {
                    console.error('Iframe print error, falling back to window.print():', err);
                    window.print();
                } finally {
                    setIsPrinting(false);
                    setTimeout(() => {
                        if (document.body.contains(iframe)) {
                            document.body.removeChild(iframe);
                        }
                    }, 2000);
                }
            }, 250);
        } catch (e) {
            console.error('Print build error:', e);
            window.print();
            setIsPrinting(false);
        }
    };

    const handleCopySummary = () => {
        if (!receipt) return;
        const text = `رسید دریافت چک #${receipt.receiptNo || receipt.id}\nشرکت لپان بافت\nطرف حساب: ${receipt.personName} (کد: ${receipt.personCode})\nشماره پشت‌نمره: ${receipt.poshtNomreh || '-'}\nتعداد چک: ${receipt.cheques.length} فقره\nجمع کل: ${Number(receipt.totalAmount).toLocaleString('fa-IR')} ریال\nتعداد فایل‌های پیوست: ${attachments.length} مورد\nبابت: ${receipt.description || '-'}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShareToChat = async () => {
        if (!receipt) return;
        setSharingToChat(true);
        try {
            const el = document.getElementById('a5-cheque-receipt-preview-card');
            const summaryText = `📄 رسید دریافت چک #${receipt.receiptNo || receipt.id} - شرکت لپان بافت\n👤 طرف حساب: ${receipt.personName} (کد ${receipt.personCode})\n🏷️ شماره پشت‌نمره: ${receipt.poshtNomreh || '-'}\n💳 تعداد چک: ${receipt.cheques.length} فقره\n💰 جمع کل: ${Number(receipt.totalAmount).toLocaleString('fa-IR')} ریال\n📎 پیوست‌ها: ${attachments.length} فایل\n📝 بابت: ${receipt.description || '-'}`;
            if (el) {
                await shareElementToChat(
                    el,
                    `Cheque_Receipt_${receipt.receiptNo || receipt.id}.jpg`,
                    {
                        defaultMessage: summaryText,
                        title: 'ارسال رسید چک به گفتگو'
                    }
                );
            } else {
                openSendToChat({
                    defaultMessage: summaryText,
                    title: 'ارسال رسید چک به گفتگو'
                });
            }
        } catch (err) {
            console.error('Error sharing receipt to chat:', err);
            openSendToChat({
                defaultMessage: `📄 رسید دریافت چک #${receipt.receiptNo || receipt.id} - شرکت لپان بافت\n👤 طرف حساب: ${receipt.personName}\n💰 جمع کل: ${Number(receipt.totalAmount).toLocaleString('fa-IR')} ریال`,
                title: 'ارسال رسید چک به گفتگو'
            });
        } finally {
            setSharingToChat(false);
        }
    };

    const totalAmount = Number(receipt.totalAmount) || 0;
    const amountInWords = formatChequeAmountInWords(totalAmount);
    const receiptDate = receipt.docDateShamsi || toShamsiStr(receipt.createdAt) || toShamsiStr(new Date().toISOString());

    const modalContent = (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/85 backdrop-blur-sm overflow-hidden animate-fade-in select-text"
            dir="rtl"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            {/* Global Print Fallback Styles */}
            <style>{`
                @media print {
                    @page {
                        size: A5 landscape;
                        margin: 2mm 3mm;
                    }
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    html, html.dark, body, body.dark, #root {
                        background: #ffffff !important;
                        background-color: #ffffff !important;
                        color: #000000 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>

            <div 
                className="relative w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100 max-h-[92vh] h-[92vh] sm:h-auto shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Top Control Bar */}
                <div className="no-print p-4 bg-slate-800/95 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm sm:text-base font-black text-white">
                                    رسید دریافت چک با موفقیت ثبت شد
                                </h3>
                                <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 text-[11px] font-mono font-bold border border-emerald-800">
                                    رسید شماره #{toPersianDigits(receipt.receiptNo || receipt.id)}
                                </span>
                                {hasAttachments && (
                                    <span className="px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 text-[11px] font-mono font-bold border border-indigo-800 flex items-center gap-1">
                                        <Paperclip className="w-3 h-3" />
                                        <span>{toPersianDigits(attachments.length)} پیوست</span>
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-400">
                                شرکت لپان بافت • آماده چاپ شفاف و مستقیم A5 افقی
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleCopySummary}
                            className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                            title="کپی خلاصه رسید"
                        >
                            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            <span>{copied ? 'کپی شد' : 'کپی خلاصه'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleShareToChat}
                            disabled={sharingToChat}
                            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
                            title="ارسال رسید به گفتگوی درون‌برنامه‌ای"
                        >
                            <MessageSquare className="w-4 h-4" />
                            <span>{sharingToChat ? 'در حال ارسال...' : 'ارسال به گفتگو'}</span>
                        </button>

                        {/* Print Group Buttons */}
                        {hasAttachments ? (
                            <div className="flex items-center bg-emerald-700 p-0.5 rounded-xl shadow-lg shadow-emerald-600/30">
                                <button
                                    type="button"
                                    onClick={() => handlePrintDirectly('all')}
                                    disabled={isPrinting}
                                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 transition-all active:scale-95"
                                    title="چاپ مستقیم و ایزوله رسید و فایل‌های پیوست"
                                >
                                    <Printer className="w-4 h-4" />
                                    <span>{isPrinting ? 'آماده‌سازی چاپ...' : 'چاپ کامل (رسید + پیوست‌ها)'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePrintDirectly('receipt')}
                                    disabled={isPrinting}
                                    className="px-2.5 py-2 text-emerald-100 hover:text-white hover:bg-emerald-600/60 rounded-lg text-xs font-bold transition-colors"
                                    title="فقط چاپ برگه رسید"
                                >
                                    فقط رسید
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePrintDirectly('attachments')}
                                    disabled={isPrinting}
                                    className="px-2.5 py-2 text-emerald-100 hover:text-white hover:bg-emerald-600/60 rounded-lg text-xs font-bold transition-colors"
                                    title="فقط چاپ فایل‌های پیوست"
                                >
                                    فقط پیوست
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => handlePrintDirectly('all')}
                                disabled={isPrinting}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
                            >
                                <Printer className="w-4 h-4" />
                                <span>{isPrinting ? 'آماده‌سازی چاپ...' : 'چاپ رسید (A5 افقی)'}</span>
                            </button>
                        )}

                        {onRegisterNewNext && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onRegisterNewNext();
                                }}
                                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
                            >
                                ثبت رسید بعدی
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-xl bg-slate-700/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="بستن پنجره"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Printable Visual Preview Area in Pure White */}
                <div className="flex-1 p-3 sm:p-6 bg-slate-950/60 overflow-y-auto space-y-6">
                    {/* PAGE 1 Preview Card */}
                    <div className="flex justify-center items-center">
                        <div
                            id="a5-cheque-receipt-preview-card"
                            className="w-full max-w-[880px] aspect-[210/148] min-h-[560px] bg-white text-slate-900 rounded-xl shadow-2xl p-4 sm:p-5 border-2 border-slate-900 flex flex-col justify-between select-text"
                            style={{ backgroundColor: '#ffffff', color: '#000000' }}
                        >
                            {/* 1. Header Section */}
                            <div className="border-b-2 border-slate-900 pb-2">
                                <div className="flex items-center justify-between">
                                    {/* Company Logo & Identity */}
                                    <div className="text-right w-1/3">
                                        <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                                            شرکت لپان بافت
                                        </h2>
                                        <p className="text-[11px] sm:text-xs text-slate-700 font-bold leading-tight mt-0.5">
                                            سیستم مدیریت مالی و خزانه‌داری
                                        </p>
                                        <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium leading-tight">
                                            واحد اعتبارات و دریافت اسناد تجاری
                                        </p>
                                    </div>

                                    {/* Main Title Badge */}
                                    <div className="text-center w-1/3 flex flex-col items-center">
                                        <div className="px-4 py-1 rounded-xl border-2 border-slate-900 bg-slate-100 shadow-xs">
                                            <h1 className="text-sm sm:text-base font-black text-slate-900">
                                                رسید دریافت چک
                                            </h1>
                                        </div>
                                        <span className="text-[10px] sm:text-[11px] text-slate-700 font-bold mt-1">
                                            (اسناد دریافتنی نزد صندوق خزانه‌داری)
                                        </span>
                                    </div>

                                    {/* Tracking & Date Metadata */}
                                    <div className="text-left w-1/3 text-[11px] sm:text-xs font-mono space-y-1">
                                        <div className="flex justify-end items-center gap-1.5 font-bold">
                                            <span className="text-slate-700 font-sans text-[11px]">شماره رسید:</span>
                                            <span className="text-slate-900 font-black text-xs sm:text-sm font-mono px-1.5 py-0.2 rounded bg-slate-100 border border-slate-400">
                                                #{toPersianDigits(receipt.receiptNo || receipt.id)}
                                            </span>
                                        </div>
                                        <div className="flex justify-end items-center gap-1.5">
                                            <span className="text-slate-700 font-sans text-[11px] font-bold">شماره پشت‌نمره:</span>
                                            <span className="text-slate-900 font-black font-mono text-xs sm:text-[13px]">
                                                {toPersianDigits(receipt.poshtNomreh || '-')}
                                            </span>
                                        </div>
                                        <div className="flex justify-end items-center gap-1.5">
                                            <span className="text-slate-700 font-sans text-[11px] font-bold">تاریخ صدور:</span>
                                            <span className="text-slate-900 font-black font-mono text-xs sm:text-[13px]">
                                                {toPersianDigits(receiptDate)}
                                            </span>
                                        </div>
                                        <div className="flex justify-end items-center gap-1.5">
                                            <span className="text-slate-700 font-sans text-[10.5px]">سال مالی:</span>
                                            <span className="text-slate-900 font-bold font-mono text-[11px]">
                                                {toPersianDigits(receipt.fiscalYear || '۱۴۰۳')}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Party & Account Details Strip */}
                                <div className="mt-2 pt-1.5 border-t border-dashed border-slate-400 grid grid-cols-12 gap-1.5 text-xs sm:text-[13px]">
                                    <div className="col-span-12 sm:col-span-5 flex items-center gap-1.5">
                                        <span className="text-slate-800 text-xs shrink-0 font-black">دریافت شد از:</span>
                                        <span className="font-black text-slate-950 truncate text-sm sm:text-base tracking-tight">
                                            {receipt.personName || 'شخص نامشخص'}
                                        </span>
                                        <span className="text-slate-800 font-mono text-[11px] bg-slate-200/80 px-1.5 py-0.5 rounded border border-slate-400 shrink-0 font-black">
                                            (کد: {toPersianDigits(receipt.personCode)})
                                        </span>
                                    </div>

                                    <div className="col-span-6 sm:col-span-3 flex items-center gap-1.5">
                                        <span className="text-slate-700 text-xs shrink-0 font-bold">صندوق مقصد:</span>
                                        <span className="font-bold text-slate-900 text-xs sm:text-[12.5px] truncate">
                                            {receipt.cashboxTitle || (receipt.cashboxCode === '11001' ? 'صندوق دفتر مرکزی' : `صندوق کد ${toPersianDigits(receipt.cashboxCode)}`)}
                                        </span>
                                    </div>

                                    <div className="col-span-6 sm:col-span-4 flex items-center gap-1.5">
                                        <span className="text-slate-700 text-xs shrink-0 font-bold">بابت / شرح:</span>
                                        <span className="text-slate-900 font-medium truncate text-xs sm:text-[12px]" title={receipt.description}>
                                            {receipt.description || 'تسویه حساب و واریز اسناد دریافتنی'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Detailed Table of Cheques */}
                            <div className="my-1.5 flex-1 flex flex-col justify-center overflow-x-auto">
                                <table className="w-full text-right border-2 border-slate-900 border-collapse bg-white">
                                    <thead>
                                        <tr className="bg-slate-100 border-b-2 border-slate-900 text-xs sm:text-[12px] font-black text-slate-900">
                                            <th className="py-1 px-1.5 border-l border-slate-900 text-center w-8">ردیف</th>
                                            <th className="py-1 px-2 border-l border-slate-900 text-right">شماره چک / صیادی</th>
                                            <th className="py-1 px-2 border-l border-slate-900 text-center w-24">تاریخ سررسید</th>
                                            <th className="py-1 px-2 border-l border-slate-900 text-left w-36">مبلغ چک (ریال)</th>
                                            <th className="py-1 px-2 border-l border-slate-900 text-center w-28">نام بانک / شعبه</th>
                                            <th className="py-1 px-2 border-l border-slate-900 text-right">صاحب حساب / در وجه</th>
                                            <th className="py-1 px-2 text-right">شرح / پشت‌نمره</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {receipt.cheques.map((ch, idx) => (
                                            <tr key={idx} className="border-b border-slate-300 hover:bg-slate-50 transition-colors text-xs sm:text-[13px]">
                                                <td className="py-1 px-1.5 border-l border-slate-300 font-mono font-black text-slate-900 text-center">
                                                    {toPersianDigits(ch.rowSeq || (idx + 1))}
                                                </td>
                                                <td className="py-1 px-2 border-l border-slate-300 font-mono font-black text-slate-900 text-right dir-ltr tracking-wider text-xs sm:text-[13px]">
                                                    {toPersianDigits(ch.chequeNumber)}
                                                </td>
                                                <td className="py-1 px-2 border-l border-slate-300 font-mono font-bold text-slate-900 text-center text-xs sm:text-[12.5px]">
                                                    {toPersianDigits(toShamsiStr(ch.dueDate))}
                                                </td>
                                                <td className="py-1 px-2 border-l border-slate-300 font-mono font-black text-slate-900 text-left dir-ltr text-xs sm:text-[13.5px]">
                                                    {toPersianDigits(Number(ch.amount).toLocaleString('fa-IR'))}
                                                </td>
                                                <td className="py-1 px-2 border-l border-slate-300 font-bold text-slate-900 text-center text-xs sm:text-[12.5px]">
                                                    {ch.bankName}
                                                </td>
                                                <td className="py-1 px-2 border-l border-slate-300 font-bold text-slate-900 text-right truncate max-w-[150px] text-xs sm:text-[12.5px]">
                                                    {ch.inNameOf || receipt.personName || '-'}
                                                </td>
                                                <td className="py-1 px-2 text-slate-800 font-medium text-right truncate max-w-[140px] text-[11px] sm:text-xs">
                                                    {ch.description || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* 3. Summary & Financial Totals */}
                            <div className="border-2 border-slate-900 rounded-lg p-2 bg-slate-50 space-y-1 text-xs sm:text-[13px]">
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-800 font-bold text-xs sm:text-[13px]">جمع کل مبالغ:</span>
                                        <span className="font-mono font-black text-sm sm:text-base text-slate-900">
                                            {toPersianDigits(totalAmount.toLocaleString('fa-IR'))} ریال
                                        </span>
                                        <span className="text-xs font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300">
                                            ({toPersianDigits(Math.floor(totalAmount / 10).toLocaleString('fa-IR'))} تومان)
                                        </span>
                                    </div>

                                    <div className="text-xs sm:text-[13px]">
                                        <span className="text-slate-700 font-bold">مجموع تعداد: </span>
                                        <span className="font-mono font-black text-slate-900">
                                            {toPersianDigits(receipt.cheques.length)} فقره
                                        </span>
                                    </div>
                                </div>

                                <div className="text-xs sm:text-[13px] pt-1 border-t border-slate-300 flex items-start gap-1.5">
                                    <span className="font-bold text-slate-800 shrink-0">مبلغ کل به حروف:</span>
                                    <span className="font-black text-slate-900 leading-tight">
                                        {amountInWords.rialWords} ({amountInWords.tomanWords})
                                    </span>
                                </div>

                                <p className="text-[9.5px] sm:text-[10px] text-slate-600 leading-tight font-medium">
                                    * اسناد و چک‌های فوق‌الذکر جهت واریز به حساب و طی تشریفات بانکی دریافت گردید. تسویه نهایی منوط به وصول قطعی وجه در سررسیدهای مقرر در سامانه صیاد خواهد بود.
                                </p>
                            </div>

                            {/* 4. Official Signatures */}
                            <div className="mt-1.5 pt-1 grid grid-cols-4 gap-2 text-center text-xs">
                                <div className="border-2 border-slate-900 rounded-lg p-1.5 flex items-center justify-between px-2 h-8 sm:h-9 bg-white text-slate-900">
                                    <span className="font-black text-slate-900 text-[11px] sm:text-xs leading-none shrink-0">
                                        ثبت‌کننده:
                                    </span>
                                    <span className="text-[10.5px] sm:text-[11.5px] text-slate-900 font-bold font-mono truncate max-w-[90px]">
                                        {receipt.createdByName || 'کاربر ثبت'}
                                    </span>
                                </div>

                                <div className="border-2 border-slate-900 rounded-lg p-1.5 flex items-center justify-between px-2 h-8 sm:h-9 bg-white text-slate-900">
                                    <span className="font-black text-slate-900 text-[11px] sm:text-xs leading-none shrink-0">
                                        واحد فروش:
                                    </span>
                                    <span className="text-[10.5px] sm:text-[11px] text-slate-800 font-bold">
                                        تایید و تحویل
                                    </span>
                                </div>

                                <div className="border-2 border-slate-900 rounded-lg p-1.5 flex items-center justify-between px-2 h-8 sm:h-9 bg-white text-slate-900">
                                    <span className="font-black text-slate-900 text-[10px] sm:text-[11px] leading-none shrink-0">
                                        سرپرست مالی / مدیر مالی:
                                    </span>
                                    <span className="text-[10.5px] sm:text-[11px] text-slate-800 font-bold">
                                        تایید شد
                                    </span>
                                </div>

                                <div className="border-2 border-slate-900 rounded-lg p-1.5 flex items-center justify-between px-2 h-8 sm:h-9 bg-white text-slate-900">
                                    <span className="font-black text-slate-900 text-[11px] sm:text-xs leading-none shrink-0">
                                        مدیرعامل:
                                    </span>
                                    <span className="text-[10.5px] sm:text-[11px] text-slate-800 font-bold">
                                        مهر و امضا
                                    </span>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="mt-0.5 pt-0.5 border-t border-slate-200 flex items-center justify-between text-[8px] text-slate-500 font-mono">
                                <span>سامانه هوشمند خزانه‌داری و چک لپان بافت</span>
                                <span>شناسه سند: {receipt.id || receipt.receiptNo}</span>
                                <span>زمان چاپ: {toPersianDigits(new Date().toLocaleTimeString('fa-IR'))}</span>
                            </div>
                        </div>
                    </div>

                    {/* Attached Images Preview */}
                    {hasAttachments && attachments.map((att, idx) => {
                        const isImg = att.fileType?.startsWith('image/') || att.fileData?.startsWith('data:image');
                        const src = resolveImageUrl(att.fileData || att.url || (att.fileName ? `/uploads/${att.fileName}` : ''));

                        return (
                            <div key={att.id || idx} className="flex justify-center items-center">
                                <div 
                                    className="w-full max-w-[880px] aspect-[210/148] min-h-[560px] bg-white text-slate-900 rounded-xl shadow-2xl p-4 sm:p-5 border-2 border-slate-900 flex flex-col justify-between select-text"
                                    style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                >
                                    <div className="border-b-2 border-slate-900 pb-2">
                                        <div className="flex items-center justify-between">
                                            <div className="text-right">
                                                <h3 className="text-base font-black text-slate-900">
                                                    شرکت لپان بافت
                                                </h3>
                                                <p className="text-xs text-slate-700 font-bold mt-0.5">
                                                    پیوست رسمی سند دریافت چک • برگه {toPersianDigits(idx + 1)} از {toPersianDigits(attachments.length)}
                                                </p>
                                            </div>

                                            <div className="text-center">
                                                <span className="px-3 py-1 rounded-lg border border-slate-900 font-black text-xs bg-slate-100">
                                                    تصویر و مدارک پیوست چک
                                                </span>
                                            </div>

                                            <div className="text-left font-mono text-xs space-y-0.5">
                                                <div>
                                                    <span className="font-sans text-slate-700">پیوست رسید: </span>
                                                    <span className="font-black text-slate-900">#{toPersianDigits(receipt.receiptNo || receipt.id)}</span>
                                                </div>
                                                <div>
                                                    <span className="font-sans text-slate-700">پشت‌نمره: </span>
                                                    <span className="font-bold text-slate-900">{toPersianDigits(receipt.poshtNomreh || '-')}</span>
                                                </div>
                                                <div>
                                                    <span className="font-sans text-slate-700">تاریخ: </span>
                                                    <span className="font-bold text-slate-900">{toPersianDigits(receiptDate)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-2 pt-1.5 border-t border-dashed border-slate-300 flex items-center justify-between text-xs text-slate-800">
                                            <div>
                                                <span className="font-bold text-slate-700">طرف‌حساب: </span>
                                                <span className="font-black text-slate-900">{receipt.personName} (کد {toPersianDigits(receipt.personCode)})</span>
                                            </div>
                                            <div className="truncate max-w-[300px]">
                                                <span className="font-bold text-slate-700">نام فایل: </span>
                                                <span className="font-mono font-bold text-slate-900">{att.fileName}</span>
                                            </div>
                                            <div>
                                                <span className="font-bold text-slate-700">مجموع رسید: </span>
                                                <span className="font-mono font-black text-emerald-700">{toPersianDigits(totalAmount.toLocaleString('fa-IR'))} ریال</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Image Display */}
                                    <div className="flex-1 my-2 flex items-center justify-center overflow-hidden bg-white border border-slate-300 rounded-lg p-2 min-h-[300px]">
                                        {isImg && src ? (
                                            <img
                                                src={src}
                                                alt={att.fileName}
                                                referrerPolicy="no-referrer"
                                                className="max-h-[320px] sm:max-h-[380px] max-w-full object-contain mx-auto rounded shadow-xs"
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center justify-center p-6 text-slate-600 space-y-2">
                                                <FileText className="w-16 h-16 text-indigo-500" />
                                                <p className="font-bold text-sm text-slate-800">{att.fileName}</p>
                                                <p className="text-xs text-slate-500 font-mono">
                                                    فرمت فایل: {att.fileType || 'سند ضمیمه'} • حجم: {att.fileSize ? `${Math.round(att.fileSize / 1024)} KB` : '-'}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Footer */}
                                    <div className="border-t border-slate-300 pt-1.5 flex items-center justify-between text-[9px] sm:text-[10px] text-slate-600 font-mono">
                                        <span>سامانه هوشمند خزانه‌داری و چک لپان بافت</span>
                                        <span>ضمیمه معتبر سند حسابداری و بایگانی</span>
                                        <span>چاپ: ${toPersianDigits(receiptDate)} - ${toPersianDigits(new Date().toLocaleTimeString('fa-IR'))}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Bottom Bar */}
                <div className="no-print p-3 bg-slate-800/90 border-t border-slate-700/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
                    <span className="flex items-center gap-1 text-[11px]">
                        <span>شرکت </span>
                        <strong className="text-white font-bold">لپان بافت</strong>
                        <span> • چاپ کاملاً شفاف و سفید روی ابعاد </span>
                        <strong className="text-white font-bold">A5 افقی (Landscape)</strong>
                    </span>

                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition-colors"
                    >
                        بستن
                    </button>
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
