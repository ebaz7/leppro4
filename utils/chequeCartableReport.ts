import * as jalaali from 'jalaali-js';
import { formatChequeAmountInWords } from './persianNumberToWords';
import { getEffectiveApiUrl, getAuthToken } from '../services/apiService';
import { downloadAndOpenFile, saveBlobAndOpenFile } from '../services/fileService';
import { generatePdfFromHtml, printHtmlInPage } from './pdfGenerator';

export interface CartableReportChequeItem {
    chequeNumber?: string;
    sayadId?: string;
    amount?: number | string;
    dueDate?: string;
    bankName?: string;
    branch?: string;
    inNameOf?: string;
    accountNo?: string;
    description?: string;
    registrationType?: 'company' | 'person' | 'unregistered' | '';
    registeredPersonName?: string;
    isCustomerSelfIssuer?: boolean;
}

export interface CartableReportReceipt {
    id: string;
    receiptNo?: number | string;
    source?: 'APP_DRAFT' | 'SAYAN_DB' | string;
    status: string;
    sayanSyncStatus?: string;
    fiscalYear?: string;
    docNo?: string | number;
    archiveCode?: string | number;
    sayanDocNo?: string | number;
    sayanArchiveCode?: string | number;
    poshtNomreh?: string;
    docDate?: string;
    docDateShamsi?: string;
    personCode?: string;
    personName?: string;
    companyId?: string;
    companyName?: string;
    registrationTargetMode?: string;
    dalkamRegistered?: boolean;
    dalkamCompanyName?: string;
    dalkamVoucherNo?: string | number;
    cashboxCode?: string;
    cashboxTitle?: string;
    totalAmount?: number;
    description?: string;
    createdAt?: string;
    createdByName?: string;
    cancellationInfo?: {
        id?: string;
        name?: string;
        role?: string;
        reason?: string;
        cancelledAt?: string;
    } | null;
    cheques?: CartableReportChequeItem[];
}

export interface CartableReportParams {
    reportTitle: string;
    reportSubtitle?: string;
    receipts: CartableReportReceipt[];
    totalReceiptsInSystem?: number;
    activeFilters: string[];
    sortLabel: string;
    sortDirLabel: string;
    fiscalYear?: string;
    generatedByName?: string;
    cashboxTitleMap?: Record<string, string>;
    requireCeoApproval?: boolean;
    companyName?: string;
}

const DEFAULT_CASHBOX_TITLES: Record<string, string> = {
    '11001': 'صندوق دفتر',
    '11002': 'صندوق سکه و کارت هدیه',
    '11003': 'صندوق آقای مقدم',
    '11004': 'صندوق ارزی',
    '11005': 'صندوق چک‌های برگشتی',
};

const toPersianDigits = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null || val === '') return '';
    return String(val).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
};

const normalizeAsciiDigits = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return '';
    return String(val)
        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
};

const normalizeSearchCompare = (val: string): string =>
    String(val || '')
        .trim()
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/\u200c/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();

const toShamsiStr = (dateInput?: string | Date | null): string => {
    if (!dateInput) return '-';
    try {
        const raw = normalizeAsciiDigits(String(dateInput)).trim();
        const alreadyShamsi = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (alreadyShamsi) {
            const yr = parseInt(alreadyShamsi[1], 10);
            if (yr >= 1300 && yr <= 1550) {
                return `${yr}/${alreadyShamsi[2].padStart(2, '0')}/${alreadyShamsi[3].padStart(2, '0')}`;
            }
        }
        const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        if (isNaN(d.getTime())) return String(dateInput);
        const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
        return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
    } catch {
        return String(dateInput);
    }
};

const escapeHtml = (val: unknown): string => {
    if (val === undefined || val === null) return '';
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

function resolveReportFontUrl(relPath: string): string {
    try {
        if (typeof window !== 'undefined' && window.location?.href) {
            return new URL(relPath.replace(/^\//, ''), window.location.href).href;
        }
    } catch {}
    return relPath;
}

const resolveSayanStatusMeta = (r: CartableReportReceipt, requireCeoApproval = true) => {
    const isDocOne = String(r.docNo) === '1' || String(r.archiveCode) === '1';
    const isProcessing =
        r.status === 'PROCESSING_SAYAN' ||
        r.sayanSyncStatus === 'QUEUED' ||
        r.sayanSyncStatus === 'PROCESSING';
    const isRegistered =
        !isDocOne &&
        !isProcessing &&
        (r.status === 'REGISTERED_IN_SAYAN' || r.source === 'SAYAN_DB');

    const effectiveDocNo = r.docNo || r.sayanDocNo;
    const effectiveArchive = r.archiveCode || r.sayanArchiveCode;

    if (r.status === 'CANCELLED') {
        return {
            isRegistered: false,
            label: 'ابطال شده (بایگانی)',
            subLabel: r.cancellationInfo?.reason || 'حفظ شماره رسید در توالی',
            bg: '#fff1f2',
            border: '#be123c',
            text: '#881337',
        };
    }
    if (isDocOne) {
        return {
            isRegistered: false,
            label: 'ثبت نشده (سند ۱ نیازمند ثبت مجدد)',
            subLabel: 'نیاز به ثبت مجدد در سایان',
            bg: '#fffbeb',
            border: '#d97706',
            text: '#92400e',
        };
    }
    if (r.status === 'REGISTERED_IN_DALKAM') {
        return {
            isRegistered: true,
            label: 'ثبت شده در دلکام',
            subLabel: `سند دلکام #${toPersianDigits(r.dalkamVoucherNo || '-')}${r.dalkamCompanyName || r.companyName ? ` • ${r.dalkamCompanyName || r.companyName}` : ''}`,
            bg: '#f0fdfa',
            border: '#0d9488',
            text: '#115e59',
        };
    }
    if (isRegistered) {
        const subParts: string[] = [];
        if (effectiveDocNo) subParts.push(`سند ${toPersianDigits(effectiveDocNo)}`);
        if (effectiveArchive) subParts.push(`بایگانی ${toPersianDigits(effectiveArchive)}`);
        if (r.dalkamRegistered && r.dalkamVoucherNo) subParts.push(`دلکام #${toPersianDigits(r.dalkamVoucherNo)}`);
        return {
            isRegistered: true,
            label: r.dalkamRegistered ? 'ثبت در سایان و دلکام' : 'ثبت شده در سایان',
            subLabel: subParts.join(' | ') || 'ثبت نهایی ERP',
            bg: '#ecfdf5',
            border: '#047857',
            text: '#065f46',
        };
    }
    if (isProcessing) {
        return {
            isRegistered: false,
            label: 'در حال ثبت در سایان',
            subLabel: 'در صف پردازش پس‌زمینه',
            bg: '#eef2ff',
            border: '#4338ca',
            text: '#3730a3',
        };
    }
    if (r.status === 'PENDING_CEO') {
        return {
            isRegistered: false,
            label: requireCeoApproval ? 'ثبت نشده (منتظر مدیرعامل)' : 'ثبت نشده (آماده ثبت سایان)',
            subLabel: 'تایید حسابداری انجام شده',
            bg: '#fffbeb',
            border: '#b45309',
            text: '#78350f',
        };
    }
    if (r.status === 'PENDING_ACCOUNTING') {
        return {
            isRegistered: false,
            label: 'ثبت نشده (منتظر حسابداری)',
            subLabel: 'مرحله ۱ کارتابل',
            bg: '#eff6ff',
            border: '#1d4ed8',
            text: '#1e3a8a',
        };
    }
    if (r.status === 'REJECTED') {
        return {
            isRegistered: false,
            label: 'عودت / رد شده',
            subLabel: 'بسته شده',
            bg: '#fff1f2',
            border: '#be123c',
            text: '#881337',
        };
    }
    return {
        isRegistered: false,
        label: r.status || 'ثبت نشده در سایان',
        subLabel: '',
        bg: '#f8fafc',
        border: '#64748b',
        text: '#334155',
    };
};

const resolveSayadiInfo = (c: CartableReportChequeItem) => {
    const rt = c?.registrationType || '';
    const regName = (c?.registeredPersonName || '').trim();
    if (rt === 'company') {
        return {
            key: 'company' as const,
            label: 'ثبت به نام شرکت',
            bg: '#ecfdf5',
            border: '#047857',
            text: '#065f46',
        };
    }
    if (rt === 'person') {
        return {
            key: 'person' as const,
            label: regName ? `به نام شخص: ${regName}` : 'ثبت به نام شخص',
            bg: '#eef2ff',
            border: '#4338ca',
            text: '#312e81',
        };
    }
    if (rt === 'unregistered') {
        return {
            key: 'unregistered' as const,
            label: 'ثبت نشده در صیاد',
            bg: '#fff1f2',
            border: '#be123c',
            text: '#881337',
        };
    }
    return {
        key: 'unspecified' as const,
        label: 'تعیین نشده',
        bg: '#f8fafc',
        border: '#94a3b8',
        text: '#475569',
    };
};

const resolveIssuerRelation = (_r: CartableReportReceipt, c: CartableReportChequeItem): boolean | null => {
    if (c.isCustomerSelfIssuer === true) return true;
    if (c.isCustomerSelfIssuer === false) return false;
    return null;
};

export const buildChequeCartableReportHtml = (
    params: CartableReportParams,
    options?: { forServerPdf?: boolean }
): string => {
    const {
        reportTitle,
        reportSubtitle,
        receipts,
        totalReceiptsInSystem,
        activeFilters,
        sortLabel,
        sortDirLabel,
        fiscalYear,
        generatedByName,
        cashboxTitleMap,
        requireCeoApproval = true,
        companyName = 'شرکت لپان بافت',
    } = params;

    const mergedCashboxes = { ...DEFAULT_CASHBOX_TITLES, ...(cashboxTitleMap || {}) };
    const now = new Date();
    const todayShamsi = toShamsiStr(now);
    const nowTime = now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

    let totalChequesCount = 0;
    let totalAmountRial = 0;
    let sayanRegisteredReceipts = 0;
    let sayanRegisteredAmount = 0;
    let sayanUnregisteredReceipts = 0;
    let sayanUnregisteredAmount = 0;
    let sayadiCompanyCount = 0;
    let sayadiPersonCount = 0;
    let sayadiUnregisteredCount = 0;
    let sayadiUnspecifiedCount = 0;
    let withSayadIdCount = 0;

    receipts.forEach((r) => {
        const recAmt = Number(r.totalAmount || 0);
        totalAmountRial += recAmt;
        const sayanMeta = resolveSayanStatusMeta(r, requireCeoApproval);
        if (sayanMeta.isRegistered) {
            sayanRegisteredReceipts += 1;
            sayanRegisteredAmount += recAmt;
        } else {
            sayanUnregisteredReceipts += 1;
            sayanUnregisteredAmount += recAmt;
        }

        const cheques = Array.isArray(r.cheques) && r.cheques.length > 0 ? r.cheques : [];
        totalChequesCount += cheques.length > 0 ? cheques.length : 1;
        cheques.forEach((c) => {
            const sInfo = resolveSayadiInfo(c);
            if (sInfo.key === 'company') sayadiCompanyCount += 1;
            else if (sInfo.key === 'person') sayadiPersonCount += 1;
            else if (sInfo.key === 'unregistered') sayadiUnregisteredCount += 1;
            else sayadiUnspecifiedCount += 1;

            if (c.sayadId && String(c.sayadId).trim().length > 0) {
                withSayadIdCount += 1;
            }
        });
    });

    const totalAmountToman = Math.floor(totalAmountRial / 10);
    const amountWords = formatChequeAmountInWords(totalAmountRial);

    const filtersHtml =
        activeFilters.length > 0
            ? activeFilters
                  .map(
                      (f) =>
                          `<span style="display: inline-block; background: #eef2ff; color: #1e3a8a; border: 1px solid #93c5fd; border-radius: 4px; padding: 1.5px 6px; font-size: 8.5px; font-weight: 700; margin-left: 4px; margin-bottom: 3px;">${escapeHtml(f)}</span>`
                  )
                  .join('')
            : `<span style="display: inline-block; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; border-radius: 4px; padding: 1.5px 6px; font-size: 8.5px; font-weight: 700;">بدون فیلتر محدودکننده (نمایش کل سوابق موجود)</span>`;

    let globalRowNo = 0;
    const rowsHtml =
        receipts.length === 0
            ? `<tr><td colspan="10" style="text-align: center; padding: 24px; font-size: 11px; color: #64748b; font-weight: 700;">هیچ رسید چکی مطابق فیلترهای اعمال‌شده یافت نشد.</td></tr>`
            : receipts
                  .map((r, rIdx) => {
                      const cheques =
                          Array.isArray(r.cheques) && r.cheques.length > 0
                              ? r.cheques
                              : [
                                    {
                                        chequeNumber: '-',
                                        amount: r.totalAmount || 0,
                                        dueDate: r.docDate || r.createdAt || '',
                                        bankName: '-',
                                        inNameOf: r.personName || '-',
                                    } as CartableReportChequeItem,
                                ];

                      const sayanMeta = resolveSayanStatusMeta(r, requireCeoApproval);
                      const recDisplayNo = r.receiptNo
                          ? `#${toPersianDigits(r.receiptNo)}`
                          : r.docNo
                          ? `سند ${toPersianDigits(r.docNo)}`
                          : `#${toPersianDigits(r.id)}`;
                      const docDateDisp = toPersianDigits(toShamsiStr(r.docDateShamsi || r.docDate || r.createdAt));
                      const cashboxTitle =
                          r.cashboxTitle ||
                          mergedCashboxes[String(r.cashboxCode || '').trim()] ||
                          (r.cashboxCode ? `صندوق ${toPersianDigits(r.cashboxCode)}` : '-');
                      const recTotalAmt = Number(r.totalAmount || 0);

                      return cheques
                          .map((c, cIdx) => {
                              globalRowNo += 1;
                              const isFirstInReceipt = cIdx === 0;
                              const sayadi = resolveSayadiInfo(c);
                              const selfIssuer = resolveIssuerRelation(r, c);
                              const issuerText =
                                  selfIssuer === true
                                      ? 'خود مشتری'
                                      : selfIssuer === false
                                      ? 'شخص ثالث'
                                      : 'نامشخص';
                              const issuerBg = selfIssuer === true ? '#f0fdfa' : selfIssuer === false ? '#f8fafc' : '#f8fafc';
                              const issuerBorder = selfIssuer === true ? '#0d9488' : '#cbd5e1';
                              const issuerColor = selfIssuer === true ? '#115e59' : '#475569';

                              const chequeAmt = Number(c.amount || 0);
                              const sayadDigits = c.sayadId && String(c.sayadId).trim() ? toPersianDigits(String(c.sayadId).trim()) : '';
                              const dueStr = toPersianDigits(toShamsiStr(c.dueDate));
                              const rowBg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
                              const topBorder = isFirstInReceipt ? '1.5px solid #475569' : '1px dashed #cbd5e1';

                              return `
                                <tr style="background-color: ${rowBg}; border-top: ${topBorder}; page-break-inside: avoid; break-inside: avoid;">
                                    <td style="text-align: center; font-family: monospace; font-weight: 700; color: #334155;">
                                        ${toPersianDigits(globalRowNo)}
                                    </td>
                                    <td style="white-space: nowrap;">
                                        ${
                                            isFirstInReceipt
                                                ? `<div style="font-weight: 900; color: #0f172a; font-family: monospace;">${escapeHtml(recDisplayNo)}</div>
                                                   <div style="font-size: 8px; color: #475569;">پشت‌نمره: <b style="font-family: monospace;">${escapeHtml(toPersianDigits(r.poshtNomreh || '-'))}</b></div>
                                                   <div style="font-size: 8px; color: #64748b; font-family: monospace;">ثبت: ${escapeHtml(docDateDisp)}</div>`
                                                : `<div style="font-size: 8px; color: #64748b;">ادامه ${escapeHtml(recDisplayNo)}<br/>(${toPersianDigits(cIdx + 1)} از ${toPersianDigits(cheques.length)})</div>`
                                        }
                                    </td>
                                    <td>
                                        ${
                                            isFirstInReceipt
                                                ? `<div style="font-weight: 800; color: #0f172a;">${escapeHtml(r.personName || '-')}</div>
                                                   <div style="font-size: 8px; color: #475569;">${r.personCode ? `کد: ${escapeHtml(toPersianDigits(r.personCode))} • ` : ''}${escapeHtml(cashboxTitle)}${r.companyName ? ` • ${escapeHtml(r.companyName)}` : ''}</div>`
                                                : `<span style="font-size: 8px; color: #94a3b8;">— « —</span>`
                                        }
                                    </td>
                                    <td>
                                        ${
                                            isFirstInReceipt
                                                ? `<div style="display: inline-block; padding: 1px 4px; border-radius: 3px; font-size: 8px; font-weight: 800; background: ${sayanMeta.bg}; border: 1px solid ${sayanMeta.border}; color: ${sayanMeta.text};">
                                                       ${escapeHtml(sayanMeta.label)}
                                                   </div>
                                                   ${sayanMeta.subLabel ? `<div style="font-size: 8px; color: #475569; margin-top: 2px; font-family: monospace;">${escapeHtml(sayanMeta.subLabel)}</div>` : ''}`
                                                : `<span style="font-size: 8px; color: #94a3b8;">— « —</span>`
                                        }
                                    </td>
                                    <td style="font-family: monospace;">
                                        <div style="font-weight: 900; color: #1d4ed8;">چک: ${escapeHtml(toPersianDigits(c.chequeNumber || '-'))}</div>
                                        <div style="font-size: 8px; margin-top: 1px; color: ${sayadDigits ? '#0f172a' : '#94a3b8'};">
                                            ${sayadDigits ? `صیاد: ${escapeHtml(sayadDigits)}` : 'صیاد: ثبت نشده'}
                                        </div>
                                    </td>
                                    <td>
                                        <div style="font-weight: 700; color: #0f172a;">${escapeHtml(c.bankName || '-')}${c.branch ? ` (${escapeHtml(c.branch)})` : ''}</div>
                                        <div style="font-size: 8.5px; font-family: monospace; color: #047857; font-weight: 800; margin-top: 1px;">سررسید: ${escapeHtml(dueStr)}</div>
                                    </td>
                                    <td>
                                        <div style="font-weight: 700; color: #0f172a;">${escapeHtml(c.inNameOf || r.personName || '-')}</div>
                                        <span style="display: inline-block; margin-top: 1px; padding: 0.5px 4px; border-radius: 3px; font-size: 7.5px; font-weight: 700; background: ${issuerBg}; border: 1px solid ${issuerBorder}; color: ${issuerColor};">
                                            ${escapeHtml(issuerText)}
                                        </span>
                                    </td>
                                    <td>
                                        <span style="display: inline-block; padding: 1px 4px; border-radius: 3px; font-size: 8px; font-weight: 800; background: ${sayadi.bg}; border: 1px solid ${sayadi.border}; color: ${sayadi.text};">
                                            ${escapeHtml(sayadi.label)}
                                        </span>
                                    </td>
                                    <td style="text-align: left; font-family: monospace; white-space: nowrap;">
                                        <div style="font-weight: 900; color: #065f46; font-size: 9.5px;">${toPersianDigits(chequeAmt.toLocaleString('fa-IR'))}</div>
                                        ${
                                            isFirstInReceipt && cheques.length > 1
                                                ? `<div style="font-size: 8px; color: #334155; margin-top: 1px; border-top: 1px dotted #cbd5e1; padding-top: 1px;">کل رسید: <b>${toPersianDigits(recTotalAmt.toLocaleString('fa-IR'))}</b></div>`
                                                : ''
                                        }
                                    </td>
                                    <td style="font-size: 8px; color: #475569; max-width: 130px;">
                                        ${escapeHtml(c.description || r.description || '-')}
                                    </td>
                                </tr>
                              `;
                          })
                          .join('');
                  })
                  .join('');

    const fontFaceCss = options?.forServerPdf
        ? ''
        : `
            @font-face {
                font-family: 'Vazirmatn';
                src: url('${resolveReportFontUrl('/fonts/Vazirmatn-Regular.woff2')}') format('woff2');
                font-weight: 400;
                font-style: normal;
            }
            @font-face {
                font-family: 'Vazirmatn';
                src: url('${resolveReportFontUrl('/fonts/Vazirmatn-Bold.woff2')}') format('woff2');
                font-weight: 700;
                font-style: normal;
            }
          `;

    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(reportTitle)} - ${escapeHtml(companyName)}</title>
    <style>
        ${fontFaceCss}
        @page {
            size: A4 landscape;
            margin: 7mm 8mm;
        }
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        html, body {
            margin: 0;
            padding: 0;
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #0f172a !important;
            font-family: 'Vazirmatn', Tahoma, sans-serif;
            direction: rtl;
            text-align: right;
            font-size: 9.5px;
            line-height: 1.35;
        }
        .report-wrapper {
            width: 100%;
            background: #ffffff;
            color: #0f172a;
        }
        .header-box {
            border: 1.5px solid #0f172a;
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 8px;
            background: #f8fafc;
        }
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 6px;
            margin-bottom: 8px;
        }
        .kpi-card {
            border: 1px solid #cbd5e1;
            border-radius: 5px;
            padding: 6px 8px;
            background: #ffffff;
        }
        .kpi-title {
            font-size: 8px;
            font-weight: 700;
            color: #475569;
            margin-bottom: 2px;
        }
        .kpi-val {
            font-size: 11px;
            font-weight: 900;
            color: #0f172a;
            font-family: monospace;
        }
        .kpi-sub {
            font-size: 8px;
            color: #64748b;
            margin-top: 2px;
        }
        .filters-banner {
            border: 1px solid #cbd5e1;
            border-radius: 5px;
            padding: 6px 9px;
            margin-bottom: 8px;
            background: #ffffff;
        }
        table.report-table {
            width: 100%;
            border-collapse: collapse;
            border: 1.5px solid #0f172a;
            font-size: 8.8px;
        }
        table.report-table thead {
            display: table-header-group;
        }
        table.report-table th {
            background: #0f172a !important;
            color: #ffffff !important;
            font-weight: 800;
            padding: 5px 5px;
            border: 1px solid #334155;
            text-align: right;
            white-space: nowrap;
            font-size: 8.5px;
        }
        table.report-table td {
            padding: 4px 5px;
            border: 1px solid #cbd5e1;
            vertical-align: top;
            color: #0f172a;
        }
        .summary-footer {
            margin-top: 8px;
            border: 1.5px solid #0f172a;
            border-radius: 6px;
            padding: 7px 10px;
            background: #f8fafc;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .signatures {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            margin-top: 10px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .sig-box {
            border: 1px dashed #64748b;
            border-radius: 5px;
            padding: 6px 8px;
            min-height: 46px;
            text-align: center;
            font-size: 8.5px;
            color: #334155;
            background: #ffffff;
        }
    </style>
</head>
<body>
<div class="report-wrapper">
    <!-- Report Header -->
    <div class="header-box">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
            <div>
                <div style="font-size: 13px; font-weight: 900; color: #0f172a;">
                    ${escapeHtml(companyName)} — ${escapeHtml(reportTitle)}
                </div>
                <div style="font-size: 9px; color: #475569; margin-top: 2px;">
                    ${escapeHtml(reportSubtitle || 'گزارش مدیریتی جامع کارتابل و بایگانی اسناد و چک‌های دریافتی (سایان و صیادی)')}
                </div>
            </div>
            <div style="text-align: left; font-size: 8.5px; color: #334155; line-height: 1.5;">
                <div>تاریخ و ساعت گزارش: <b style="font-family: monospace;">${escapeHtml(toPersianDigits(todayShamsi))} - ${escapeHtml(toPersianDigits(nowTime))}</b></div>
                <div>سال مالی: <b style="font-family: monospace;">${escapeHtml(toPersianDigits(fiscalYear || '-'))}</b> ${generatedByName ? `• تهیه‌کننده: <b>${escapeHtml(generatedByName)}</b>` : ''}</div>
            </div>
        </div>
    </div>

    <!-- KPI Summary Cards -->
    <div class="kpi-grid">
        <div class="kpi-card">
            <div class="kpi-title">تعداد رسیدها / برگ چک</div>
            <div class="kpi-val">${toPersianDigits(receipts.length)} رسید (${toPersianDigits(totalChequesCount)} چک)</div>
            <div class="kpi-sub">${totalReceiptsInSystem !== undefined ? `از مجموع ${toPersianDigits(totalReceiptsInSystem)} رسید ثبت‌شده` : 'مطابق فیلتر فعال'}</div>
        </div>
        <div class="kpi-card" style="border-color: #059669; background: #ecfdf5;">
            <div class="kpi-title" style="color: #065f46;">جمع کل مبلغ فیلترشده</div>
            <div class="kpi-val" style="color: #065f46;">${toPersianDigits(totalAmountRial.toLocaleString('fa-IR'))} ریال</div>
            <div class="kpi-sub" style="color: #047857;">معادل ${toPersianDigits(totalAmountToman.toLocaleString('fa-IR'))} تومان</div>
        </div>
        <div class="kpi-card" style="border-color: #047857;">
            <div class="kpi-title">ثبت شده در سایان</div>
            <div class="kpi-val" style="color: #047857;">${toPersianDigits(sayanRegisteredReceipts)} رسید</div>
            <div class="kpi-sub">${toPersianDigits(sayanRegisteredAmount.toLocaleString('fa-IR'))} ریال</div>
        </div>
        <div class="kpi-card" style="border-color: #d97706;">
            <div class="kpi-title">ثبت نشده / در جریان کارتابل</div>
            <div class="kpi-val" style="color: #b45309;">${toPersianDigits(sayanUnregisteredReceipts)} رسید</div>
            <div class="kpi-sub">${toPersianDigits(sayanUnregisteredAmount.toLocaleString('fa-IR'))} ریال</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-title">تفکیک صیاد و ثبت صیادی</div>
            <div class="kpi-val" style="font-size: 9px; font-family: inherit;">شرکت: ${toPersianDigits(sayadiCompanyCount)} • شخص: ${toPersianDigits(sayadiPersonCount)}</div>
            <div class="kpi-sub">ثبت‌نشده: ${toPersianDigits(sayadiUnregisteredCount)} • نامشخص: ${toPersianDigits(sayadiUnspecifiedCount)} • دارای صیاد: ${toPersianDigits(withSayadIdCount)}</div>
        </div>
    </div>

    <!-- Active Filters & Sort Banner -->
    <div class="filters-banner">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div style="flex: 1;">
                <span style="font-size: 8.5px; font-weight: 900; color: #0f172a; margin-left: 6px;">فیلترهای اعمال‌شده:</span>
                ${filtersHtml}
            </div>
            <div style="white-space: nowrap; font-size: 8.5px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 7px; color: #0f172a;">
                مرتب‌سازی: <b>${escapeHtml(sortLabel)}</b> (${escapeHtml(sortDirLabel)})
            </div>
        </div>
    </div>

    <!-- Main Data Table -->
    <table class="report-table">
        <thead>
            <tr>
                <th style="text-align: center; width: 26px;">ردیف</th>
                <th>رسید / پشت‌نمره / تاریخ</th>
                <th>تحویل‌دهنده و صندوق</th>
                <th>وضعیت ثبت در سایان</th>
                <th>شماره چک و شناسه صیاد</th>
                <th>بانک و سررسید</th>
                <th>صاحب چک و نسبت</th>
                <th>وضعیت ثبت صیادی</th>
                <th style="text-align: left;">مبلغ چک (ریال)</th>
                <th>شرح / بابت</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
    </table>

    <!-- Summary Footer -->
    <div class="summary-footer">
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px;">
            <div>
                <b>جمع کل مبالغ گزارش به حروف:</b>
                <span style="color: #065f46; font-weight: 800; margin-right: 4px;">${escapeHtml(amountWords)}</span>
            </div>
            <div style="font-family: monospace; font-weight: 900; font-size: 10px; color: #0f172a;">
                جمع کل: ${toPersianDigits(totalAmountRial.toLocaleString('fa-IR'))} ریال (${toPersianDigits(totalAmountToman.toLocaleString('fa-IR'))} تومان)
            </div>
        </div>
    </div>

    <!-- Management Approval Signatures -->
    <div class="signatures">
        <div class="sig-box">
            <div style="font-weight: 800;">تنظیم‌کننده گزارش / خزانه‌داری</div>
            <div style="font-size: 7.5px; color: #64748b; margin-top: 2px;">${escapeHtml(generatedByName || 'نام و امضاء')}</div>
        </div>
        <div class="sig-box">
            <div style="font-weight: 800;">بررسی و تایید امور مالی / حسابداری</div>
            <div style="font-size: 7.5px; color: #64748b; margin-top: 2px;">تاریخ و امضاء</div>
        </div>
        <div class="sig-box">
            <div style="font-weight: 800;">ملاحظه و تایید مدیریت محترم عامل</div>
            <div style="font-size: 7.5px; color: #64748b; margin-top: 2px;">مهر و امضاء</div>
        </div>
    </div>
</div>
</body>
</html>`;
};

export const printChequeCartableReport = async (params: CartableReportParams): Promise<void> => {
    const html = buildChequeCartableReportHtml(params, { forServerPdf: false });
    const safeTitle = `گزارش_مدیریتی_چک_${toShamsiStr(new Date()).replace(/\//g, '-')}`;

    const electronBridge = typeof window !== 'undefined' ? ((window as any).electronAPI || (window as any).electron) : null;
    if (electronBridge?.printHtml) {
        try {
            await electronBridge.printHtml(html, {
                landscape: true,
                pageSize: 'A4',
                printBackground: true,
            });
            return;
        } catch (err) {
            console.warn('Electron printHtml failed, falling back to in-page iframe:', err);
        }
    }

    printHtmlInPage(html, 'landscape', safeTitle, { skipStyleInjection: true });
};

export const downloadChequeCartablePdfReport = async (params: CartableReportParams): Promise<boolean> => {
    const dateStamp = normalizeAsciiDigits(toShamsiStr(new Date())).replace(/\//g, '-');
    const fileName = `Cheque_Cartable_Report_${dateStamp}_${Date.now()}.pdf`;

    // 1. Primary path: server-side Puppeteer PDF renderer (produces crisp searchable Persian vector PDF & works cleanly on Android/Mobile/Desktop)
    try {
        const serverHtml = buildChequeCartableReportHtml(params, { forServerPdf: true });
        const token = getAuthToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(getEffectiveApiUrl('/api/render-html-to-pdf'), {
            method: 'POST',
            headers,
            body: JSON.stringify({
                html: serverHtml,
                filename: fileName,
                landscape: true,
                orientation: 'landscape',
            }),
        });

        if (res.ok) {
            const data = await res.json();
            if (data?.success && data?.url) {
                return await downloadAndOpenFile(data.url, fileName, undefined, false);
            }
        }
    } catch (serverErr) {
        console.warn('Server PDF rendering failed, falling back to client PDF:', serverErr);
    }

    // 2. Fallback path: client-side HTML-to-PDF capture
    const clientHtml = buildChequeCartableReportHtml(params, { forServerPdf: false });
    const blob = await generatePdfFromHtml(clientHtml, fileName, { orientation: 'landscape' });
    if (!blob) {
        throw new Error('تولید فایل PDF گزارش با خطا مواجه شد.');
    }
    return await saveBlobAndOpenFile(blob, fileName);
};
