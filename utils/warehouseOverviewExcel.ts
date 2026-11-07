import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface WarehouseExcelDataset {
    summary: {
        reportDate?: string;
        report1Label?: string;
        report1Jalali?: string;
        report2Label?: string;
        report2Jalali?: string;
        signature?: string;
        lastYearYarnsWeight?: number;
        currentYarnsWeight?: number;
        yarnsDiffWeight?: number;
        yarnsRatio?: number;
        lastYearRawWeight?: number;
        currentRawWeight?: number;
        rawDiffWeight?: number;
        rawRatio?: number;
        lastYearTotalWeight?: number;
        currentTotalWeight?: number;
        totalDiffWeight?: number;
        totalRatio?: number;
        totalLastYearContainers?: number;
        containersTotal?: number | string;
        diffContainers?: number;
        totalLastYearDollars?: number;
        dollarsTotal?: number | string;
        diffDollars?: number;
    };
    yarnItems: any[];
    rawItems: any[];
    purchasingGoods?: any[];
    domesticPurchases?: any[];
    goodsInCustoms?: any[];
    commercialGoods?: any[];
    logisticsItems?: any[];
    growthItems?: any[];
    negativeItems?: any[];
    allComparedItems?: any[];
    getGroupChildItems?: (groupCode: string) => Array<{ itemName: string; itemCode: string }>;
}

export type WarehouseExcelScope = 'all' | 'summary' | 'yarns' | 'raw' | 'logistics' | 'variance';

const n = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
};

const formatPct = (pct: number): string => {
    if (isNaN(pct) || !isFinite(pct)) return '-';
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
};

// Styling helper functions for ExcelJS
const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
};

const doubleBottomBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'double', color: { argb: 'FF1E293B' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
};

export const exportWarehouseOverviewToExcel = async (
    dataset: WarehouseExcelDataset,
    scope: WarehouseExcelScope = 'all'
): Promise<void> => {
    const {
        summary = {},
        yarnItems = [],
        rawItems = [],
        purchasingGoods = [],
        domesticPurchases = [],
        goodsInCustoms = [],
        commercialGoods = [],
        logisticsItems = [],
        growthItems = [],
        negativeItems = []
    } = dataset;

    const reportDate = summary.reportDate || '۱۴۰۵/۰۵/۳۱';
    const r1Label = summary.report1Label || 'منتهی به سال ۱۴۰۴';
    const r1Date = summary.report1Jalali || '۱۴۰۴/۱۲/۲۹';
    const r2Label = summary.report2Label || 'وضعیت فعلی سال ۱۴۰۵';
    const r2Date = summary.report2Jalali || '۱۴۰۵/۰۵/۳۱';
    const manager = summary.signature || 'محمد ابراهیم حیدری';
    const ceo = (summary as any).ceo || 'مدیریت عامل';

    // Summary calculations
    const yLast = n(summary.lastYearYarnsWeight) || yarnItems.reduce((s, i) => s + n(i.lastYearWeight), 0);
    const yCurr = n(summary.currentYarnsWeight) || yarnItems.reduce((s, i) => s + n(i.currentWeight), 0);
    const yDiff = yCurr - yLast;
    const yPct = yLast ? (yDiff / yLast) * 100 : 0;

    const rLast = n(summary.lastYearRawWeight) || rawItems.reduce((s, i) => s + n(i.lastYearWeight), 0);
    const rCurr = n(summary.currentRawWeight) || rawItems.reduce((s, i) => s + n(i.currentWeight), 0);
    const rDiff = rCurr - rLast;
    const rPct = rLast ? (rDiff / rLast) * 100 : 0;

    const tLast = n(summary.lastYearTotalWeight) || (yLast + rLast);
    const tCurr = n(summary.currentTotalWeight) || (yCurr + rCurr);
    const tDiff = tCurr - tLast;
    const tPct = tLast ? (tDiff / tLast) * 100 : 0;

    const containersCount = summary.containersTotal || '۰';
    const dollarsAmount = typeof summary.dollarsTotal === 'number' ? summary.dollarsTotal.toLocaleString('en-US') : (summary.dollarsTotal || '۰');

    // Combine logistics items
    const allLogistics = logisticsItems.length > 0 ? logisticsItems : [
        ...goodsInCustoms.map((r) => ({
            name: r.cargoType || 'بار گمرکی',
            proforma: r.proforma || '-',
            registrationNumber: r.registrationNumber || '-',
            status: r.statusBadge || 'در گمرک',
            containers: r.container || 0,
            value: r.weight ? `${n(r.weight).toLocaleString('fa-IR')} kg` : `${n(r.dollars).toLocaleString('fa-IR')} $`,
            currency: r.dollars > 0 ? 'USD' : 'IRR'
        })),
        ...purchasingGoods.map((r) => ({
            name: r.cargoType || 'بار در راه / خرید خارجی',
            proforma: r.proforma || '-',
            registrationNumber: r.registrationNumber || '-',
            status: r.statusBadge || 'در حال خرید / در راه',
            containers: r.container || 0,
            value: r.weight ? `${n(r.weight).toLocaleString('fa-IR')} kg` : `${n(r.dollars).toLocaleString('fa-IR')} $`,
            currency: r.dollars > 0 ? 'USD' : 'IRR'
        })),
        ...domesticPurchases.map((r) => ({
            name: `${r.cargoType || 'خرید داخلی'}${r.petrochemicalName ? ` (${r.petrochemicalName})` : ''}`,
            proforma: r.proforma || '-',
            registrationNumber: r.registrationNumber || '-',
            status: r.statusBadge || 'خرید پتروشیمی',
            containers: r.container || 0,
            value: r.weight ? `${n(r.weight).toLocaleString('fa-IR')} kg` : `${n(r.rialAmount).toLocaleString('fa-IR')} ریال`,
            currency: 'IRR'
        })),
        ...commercialGoods.map((r) => ({
            name: r.itemName || 'کالای تجاری',
            proforma: r.proforma || '-',
            registrationNumber: r.registrationNumber || '-',
            status: 'انبار تجاری',
            containers: r.container || 0,
            value: r.weight ? `${n(r.weight).toLocaleString('fa-IR')} kg` : `${n(r.dollars).toLocaleString('fa-IR')} $`,
            currency: r.dollars > 0 ? 'USD' : 'IRR'
        }))
    ];

    // Create ExcelJS Workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'سامانه جامع زنجیره تامین و انبارها';
    wb.lastModifiedBy = manager;
    wb.created = new Date();
    wb.modified = new Date();

    // ==========================================
    // SHEET 1: گزارش تراز وزنی و وضعیت انبارها
    // ==========================================
    const ws1 = wb.addWorksheet('گزارش تراز و وضعیت انبارها', {
        views: [{ showGridLines: true } as any],
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 }
    });
    (ws1 as any).views = [{ rightToLeft: true, showGridLines: true }];

    // Setup column widths
    ws1.columns = [
        { key: 'colA', width: 7 },   // ردیف
        { key: 'colB', width: 34 },  // شرح کالا
        { key: 'colC', width: 14 },  // کد کالا
        { key: 'colD', width: 22 },  // وزن سال قبل
        { key: 'colE', width: 22 },  // وزن سال جاری
        { key: 'colF', width: 22 },  // اختلاف وزنی
        { key: 'colG', width: 18 }   // درصد تغییر
    ];

    let rIdx = 1;

    // --- Header Title Banner ---
    ws1.mergeCells(`A${rIdx}:G${rIdx}`);
    const titleCell = ws1.getCell(`A${rIdx}`);
    titleCell.value = 'گزارش مدیریتی و تراز وزنی وضعیت انبارها و زنجیره تامین';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(rIdx).height = 34;
    rIdx++;

    // --- Subtitle Metadata Banner ---
    ws1.mergeCells(`A${rIdx}:G${rIdx}`);
    const subCell = ws1.getCell(`A${rIdx}`);
    subCell.value = `📅 تاریخ گزارش: ${reportDate}   |   🏛️ دوره مبنا: ${r1Label} (${r1Date})   |   📈 دوره مقایسه: ${r2Label} (${r2Date})`;
    subCell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF475569' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(rIdx).height = 24;
    rIdx++;

    rIdx++; // empty row

    // --- KPI Metric Cards (4 Cards across columns) ---
    // Card Title Row
    ws1.mergeCells(`A${rIdx}:B${rIdx}`);
    const card1H = ws1.getCell(`A${rIdx}`);
    card1H.value = '🧵 تراز کل نخ‌های کارخانه';
    card1H.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    card1H.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    card1H.alignment = { horizontal: 'center', vertical: 'middle' };

    ws1.getCell(`C${rIdx}`).value = '';
    ws1.getCell(`C${rIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

    ws1.mergeCells(`D${rIdx}:E${rIdx}`);
    const card2H = ws1.getCell(`D${rIdx}`);
    card2H.value = '📦 مواد اولیه و اقلام وارداتی';
    card2H.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    card2H.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
    card2H.alignment = { horizontal: 'center', vertical: 'middle' };

    ws1.mergeCells(`F${rIdx}:G${rIdx}`);
    const card3H = ws1.getCell(`F${rIdx}`);
    card3H.value = '⚖️ تراز کل کارخانه و انبارها';
    card3H.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    card3H.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    card3H.alignment = { horizontal: 'center', vertical: 'middle' };

    ws1.getRow(rIdx).height = 22;
    rIdx++;

    // Card Value Row
    ws1.mergeCells(`A${rIdx}:B${rIdx}`);
    const card1V = ws1.getCell(`A${rIdx}`);
    card1V.value = `${yCurr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
    card1V.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF312E81' } };
    card1V.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    card1V.alignment = { horizontal: 'center', vertical: 'middle' };

    ws1.mergeCells(`D${rIdx}:E${rIdx}`);
    const card2V = ws1.getCell(`D${rIdx}`);
    card2V.value = `${rCurr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
    card2V.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF064E3B' } };
    card2V.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
    card2V.alignment = { horizontal: 'center', vertical: 'middle' };

    ws1.mergeCells(`F${rIdx}:G${rIdx}`);
    const card3V = ws1.getCell(`F${rIdx}`);
    card3V.value = `${tCurr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
    card3V.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF1E3A8A' } };
    card3V.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    card3V.alignment = { horizontal: 'center', vertical: 'middle' };

    ws1.getRow(rIdx).height = 26;
    rIdx++;

    // Card Subtitle Row
    ws1.mergeCells(`A${rIdx}:B${rIdx}`);
    const card1S = ws1.getCell(`A${rIdx}`);
    card1S.value = `تغییر: ${yDiff >= 0 ? '+' : ''}${yDiff.toLocaleString('en-US', { minimumFractionDigits: 2 })} kg (${formatPct(yPct)})`;
    card1S.font = { name: 'Arial', size: 9, bold: true, color: { argb: yDiff >= 0 ? 'FF15803D' : 'FFB91C1C' } };
    card1S.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
    card1S.alignment = { horizontal: 'center', vertical: 'middle' };

    ws1.mergeCells(`D${rIdx}:E${rIdx}`);
    const card2S = ws1.getCell(`D${rIdx}`);
    card2S.value = `تغییر: ${rDiff >= 0 ? '+' : ''}${rDiff.toLocaleString('en-US', { minimumFractionDigits: 2 })} kg (${formatPct(rPct)})`;
    card2S.font = { name: 'Arial', size: 9, bold: true, color: { argb: rDiff >= 0 ? 'FF15803D' : 'FFB91C1C' } };
    card2S.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
    card2S.alignment = { horizontal: 'center', vertical: 'middle' };

    ws1.mergeCells(`F${rIdx}:G${rIdx}`);
    const card3S = ws1.getCell(`F${rIdx}`);
    card3S.value = `رشد کل: ${tDiff >= 0 ? '+' : ''}${tDiff.toLocaleString('en-US', { minimumFractionDigits: 2 })} kg (${formatPct(tPct)})`;
    card3S.font = { name: 'Arial', size: 9, bold: true, color: { argb: tDiff >= 0 ? 'FF15803D' : 'FFB91C1C' } };
    card3S.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    card3S.alignment = { horizontal: 'center', vertical: 'middle' };

    ws1.getRow(rIdx).height = 20;
    rIdx++;

    rIdx++; // empty row

    // ==========================================
    // TABLE 1: جدول نخ‌های تولیدی کارخانه
    // ==========================================
    ws1.mergeCells(`A${rIdx}:G${rIdx}`);
    const tbl1Header = ws1.getCell(`A${rIdx}`);
    tbl1Header.value = '۱. جدول نخ‌های تولیدی کارخانه (تولید داخلی)';
    tbl1Header.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    tbl1Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
    tbl1Header.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    ws1.getRow(rIdx).height = 26;
    rIdx++;

    // Table Column Headers
    const colHeaders1 = ['#', 'نام گروه کالا / شرح تولید', 'کد گروه', 'وزن سال قبل (kg)', 'وزن سال جاری (kg)', 'اختلاف وزنی (kg)', 'درصد تغییر'];
    const rowHeaders1 = ws1.getRow(rIdx);
    colHeaders1.forEach((text, i) => {
        const cell = rowHeaders1.getCell(i + 1);
        cell.value = text;
        cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
        cell.alignment = { horizontal: i === 1 ? 'right' : 'center', vertical: 'middle' };
        cell.border = thinBorder;
    });
    rowHeaders1.height = 25;
    rIdx++;

    // Data rows for Yarns
    yarnItems.forEach((item, idx) => {
        const row = ws1.getRow(rIdx);
        const last = n(item.lastYearWeight);
        const curr = n(item.currentWeight);
        const diff = curr - last;
        const pct = last ? (diff / last) * 100 : 0;
        const isNeg = diff < 0;
        const isPos = diff > 0;
        const zebraBg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';

        row.getCell(1).value = idx + 1;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(1).font = { name: 'Arial', size: 9, color: { argb: 'FF64748B' } };

        row.getCell(2).value = item.name || item.groupName || '-';
        row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        row.getCell(2).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };

        row.getCell(3).value = item.code || '-';
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(3).font = { name: 'Arial', size: 8.5, color: { argb: 'FF64748B' } };

        row.getCell(4).value = last;
        row.getCell(4).numFmt = '#,##0.00';
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).font = { name: 'Arial', size: 9.5, color: { argb: 'FF334155' } };

        row.getCell(5).value = curr;
        row.getCell(5).numFmt = '#,##0.00';
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };

        row.getCell(6).value = diff;
        row.getCell(6).numFmt = '+#,##0.00;-#,##0.00;0.00';
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: isNeg ? 'FFB91C1C' : (isPos ? 'FF15803D' : 'FF64748B') } };

        row.getCell(7).value = last ? formatPct(pct) : '-';
        row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(7).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: isNeg ? 'FFB91C1C' : (isPos ? 'FF15803D' : 'FF64748B') } };
        row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isNeg ? 'FFFEE2E2' : (isPos ? 'FFDCFCE7' : zebraBg) } };

        for (let c = 1; c <= 7; c++) {
            if (c !== 7 || (!isNeg && !isPos)) {
                row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraBg } };
            }
            row.getCell(c).border = thinBorder;
        }

        row.height = 22;
        rIdx++;
    });

    // Summary Row for Yarns
    const sumRow1 = ws1.getRow(rIdx);
    sumRow1.getCell(1).value = '∑';
    sumRow1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.mergeCells(`B${rIdx}:C${rIdx}`);
    sumRow1.getCell(2).value = 'جمع کل نخ‌های تولیدی کارخانه';
    sumRow1.getCell(2).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    sumRow1.getCell(4).value = yLast;
    sumRow1.getCell(4).numFmt = '#,##0.00';
    sumRow1.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    sumRow1.getCell(5).value = yCurr;
    sumRow1.getCell(5).numFmt = '#,##0.00';
    sumRow1.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    sumRow1.getCell(6).value = yDiff;
    sumRow1.getCell(6).numFmt = '+#,##0.00;-#,##0.00;0.00';
    sumRow1.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    sumRow1.getCell(7).value = formatPct(yPct);
    sumRow1.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = 1; c <= 7; c++) {
        const cell = sumRow1.getCell(c);
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E1B4B' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
        cell.border = doubleBottomBorder;
    }
    sumRow1.height = 26;
    rIdx++;

    rIdx++; // empty row

    // ==========================================
    // TABLE 2: جدول مواد اولیه، اقلام وارداتی و انبار سایان
    // ==========================================
    ws1.mergeCells(`A${rIdx}:G${rIdx}`);
    const tbl2Header = ws1.getCell(`A${rIdx}`);
    tbl2Header.value = '۲. جدول مواد اولیه، اقلام وارداتی و انبار سایان';
    tbl2Header.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    tbl2Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
    tbl2Header.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    ws1.getRow(rIdx).height = 26;
    rIdx++;

    const rowHeaders2 = ws1.getRow(rIdx);
    const colHeaders2 = ['#', 'نام گروه کالا / مواد اولیه وارداتی', 'کد گروه', 'وزن سال قبل (kg)', 'وزن سال جاری (kg)', 'اختلاف وزنی (kg)', 'درصد تغییر'];
    colHeaders2.forEach((text, i) => {
        const cell = rowHeaders2.getCell(i + 1);
        cell.value = text;
        cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
        cell.alignment = { horizontal: i === 1 ? 'right' : 'center', vertical: 'middle' };
        cell.border = thinBorder;
    });
    rowHeaders2.height = 25;
    rIdx++;

    // Data rows for Raw materials
    rawItems.forEach((item, idx) => {
        const row = ws1.getRow(rIdx);
        const last = n(item.lastYearWeight);
        const curr = n(item.currentWeight);
        const diff = curr - last;
        const pct = last ? (diff / last) * 100 : 0;
        const isNeg = diff < 0;
        const isPos = diff > 0;
        const zebraBg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';

        row.getCell(1).value = idx + 1;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(1).font = { name: 'Arial', size: 9, color: { argb: 'FF64748B' } };

        row.getCell(2).value = item.name || item.groupName || '-';
        row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        row.getCell(2).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };

        row.getCell(3).value = item.code || '-';
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(3).font = { name: 'Arial', size: 8.5, color: { argb: 'FF64748B' } };

        row.getCell(4).value = last;
        row.getCell(4).numFmt = '#,##0.00';
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(4).font = { name: 'Arial', size: 9.5, color: { argb: 'FF334155' } };

        row.getCell(5).value = curr;
        row.getCell(5).numFmt = '#,##0.00';
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };

        row.getCell(6).value = diff;
        row.getCell(6).numFmt = '+#,##0.00;-#,##0.00;0.00';
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(6).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: isNeg ? 'FFB91C1C' : (isPos ? 'FF15803D' : 'FF64748B') } };

        row.getCell(7).value = last ? formatPct(pct) : '-';
        row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(7).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: isNeg ? 'FFB91C1C' : (isPos ? 'FF15803D' : 'FF64748B') } };
        row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isNeg ? 'FFFEE2E2' : (isPos ? 'FFDCFCE7' : zebraBg) } };

        for (let c = 1; c <= 7; c++) {
            if (c !== 7 || (!isNeg && !isPos)) {
                row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraBg } };
            }
            row.getCell(c).border = thinBorder;
        }

        row.height = 22;
        rIdx++;
    });

    // Summary Row for Raw materials
    const sumRow2 = ws1.getRow(rIdx);
    sumRow2.getCell(1).value = '∑';
    sumRow2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.mergeCells(`B${rIdx}:C${rIdx}`);
    sumRow2.getCell(2).value = 'جمع کل مواد اولیه و اقلام وارداتی';
    sumRow2.getCell(2).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    sumRow2.getCell(4).value = rLast;
    sumRow2.getCell(4).numFmt = '#,##0.00';
    sumRow2.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    sumRow2.getCell(5).value = rCurr;
    sumRow2.getCell(5).numFmt = '#,##0.00';
    sumRow2.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    sumRow2.getCell(6).value = rDiff;
    sumRow2.getCell(6).numFmt = '+#,##0.00;-#,##0.00;0.00';
    sumRow2.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    sumRow2.getCell(7).value = formatPct(rPct);
    sumRow2.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = 1; c <= 7; c++) {
        const cell = sumRow2.getCell(c);
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF064E3B' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        cell.border = doubleBottomBorder;
    }
    sumRow2.height = 26;
    rIdx++;

    // Grand Total Row
    const grandRow = ws1.getRow(rIdx);
    grandRow.getCell(1).value = '💎';
    grandRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.mergeCells(`B${rIdx}:C${rIdx}`);
    grandRow.getCell(2).value = 'مجموع کل دارایی وزنی انبارها (نخ + مواد اولیه)';
    grandRow.getCell(2).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    grandRow.getCell(4).value = tLast;
    grandRow.getCell(4).numFmt = '#,##0.00';
    grandRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    grandRow.getCell(5).value = tCurr;
    grandRow.getCell(5).numFmt = '#,##0.00';
    grandRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    grandRow.getCell(6).value = tDiff;
    grandRow.getCell(6).numFmt = '+#,##0.00;-#,##0.00;0.00';
    grandRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    grandRow.getCell(7).value = formatPct(tPct);
    grandRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = 1; c <= 7; c++) {
        const cell = grandRow.getCell(c);
        cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.border = doubleBottomBorder;
    }
    grandRow.height = 28;
    rIdx++;

    rIdx++; // empty row

    // ==========================================
    // TABLE 3: بارهای در راه، گمرک و خریدهای در جریان
    // ==========================================
    if (allLogistics.length > 0) {
        ws1.mergeCells(`A${rIdx}:G${rIdx}`);
        const tbl3Header = ws1.getCell(`A${rIdx}`);
        tbl3Header.value = '۳. بارهای در راه، گمرک و خریدهای در جریان (کانتینری و ارزی)';
        tbl3Header.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        tbl3Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF78350F' } };
        tbl3Header.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        ws1.getRow(rIdx).height = 26;
        rIdx++;

        const rowHeaders3 = ws1.getRow(rIdx);
        const colHeaders3 = ['#', 'شرح محموله / کالا', 'شماره پروفرما', 'ثبت سفارش', 'وضعیت سند', 'تعداد کانتینر', 'مقدار / ارزش'];
        colHeaders3.forEach((text, i) => {
            const cell = rowHeaders3.getCell(i + 1);
            cell.value = text;
            cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
            cell.alignment = { horizontal: i === 1 ? 'right' : 'center', vertical: 'middle' };
            cell.border = thinBorder;
        });
        rowHeaders3.height = 25;
        rIdx++;

        allLogistics.forEach((item, idx) => {
            const row = ws1.getRow(rIdx);
            const zebraBg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';

            row.getCell(1).value = idx + 1;
            row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(1).font = { name: 'Arial', size: 9, color: { argb: 'FF64748B' } };

            row.getCell(2).value = item.name || '-';
            row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
            row.getCell(2).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };

            row.getCell(3).value = item.proforma || '-';
            row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(3).font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };

            row.getCell(4).value = item.registrationNumber || '-';
            row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(4).font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };

            row.getCell(5).value = item.status || 'در راه / گمرک';
            row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(5).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFB45309' } };

            row.getCell(6).value = item.containers ? `${item.containers} کانتینر` : '-';
            row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(6).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0284C7' } };

            row.getCell(7).value = item.value || '-';
            row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
            row.getCell(7).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };

            for (let c = 1; c <= 7; c++) {
                row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraBg } };
                row.getCell(c).border = thinBorder;
            }

            row.height = 22;
            rIdx++;
        });
    }

    rIdx++; // empty row

    // --- Formal Signature Approvals Section ---
    ws1.mergeCells(`A${rIdx}:C${rIdx + 2}`);
    const sigBox1 = ws1.getCell(`A${rIdx}`);
    sigBox1.value = `تنظیم‌کننده و مدیریت سیستم:\n${manager}\nتاریخ: ${reportDate}`;
    sigBox1.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF334155' } };
    sigBox1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    sigBox1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sigBox1.border = thinBorder;

    ws1.mergeCells(`E${rIdx}:G${rIdx + 2}`);
    const sigBox2 = ws1.getCell(`E${rIdx}`);
    sigBox2.value = `تأییدکننده نهایی:\n${ceo}\nوضعیت: تأیید شده`;
    sigBox2.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF064E3B' } };
    sigBox2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
    sigBox2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sigBox2.border = thinBorder;

    rIdx += 3;

    // ==========================================
    // SHEET 2: تحلیل کسری و رشد موجودی (صفحه ۲)
    // ==========================================
    if (negativeItems.length > 0 || growthItems.length > 0) {
        const ws2 = wb.addWorksheet('تحلیل روند و کسری موجودی', {
            views: [{ showGridLines: true } as any],
            pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 }
        });
        (ws2 as any).views = [{ rightToLeft: true, showGridLines: true }];

        ws2.columns = [
            { key: 'colA', width: 7 },
            { key: 'colB', width: 34 },
            { key: 'colC', width: 14 },
            { key: 'colD', width: 22 },
            { key: 'colE', width: 22 },
            { key: 'colF', width: 22 },
            { key: 'colG', width: 18 }
        ];

        let r2Idx = 1;

        // Header Title
        ws2.mergeCells(`A${r2Idx}:G${r2Idx}`);
        const ws2Title = ws2.getCell(`A${r2Idx}`);
        ws2Title.value = 'تحلیل نوسانات وزنی، اقلام نیازمند توجه و رشد موجودی انبارها';
        ws2Title.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        ws2Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF881337' } };
        ws2Title.alignment = { horizontal: 'center', vertical: 'middle' };
        ws2.getRow(r2Idx).height = 32;
        r2Idx++;

        r2Idx++; // empty row

        // Negative / Deficit Items Table
        ws2.mergeCells(`A${r2Idx}:G${r2Idx}`);
        const negHeader = ws2.getCell(`A${r2Idx}`);
        negHeader.value = '⚠️ اقلام با بیشترین کاهش موجودی نسبت به سال قبل (نیازمند خرید / تولید)';
        negHeader.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
        negHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
        negHeader.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        ws2.getRow(r2Idx).height = 25;
        r2Idx++;

        const negColRow = ws2.getRow(r2Idx);
        ['#', 'نام کالا / شرح مغایرت', 'کد کالا', 'وزن سال قبل (kg)', 'وزن سال جاری (kg)', 'کسری وزنی (kg)', 'درصد کاهش'].forEach((text, i) => {
            const cell = negColRow.getCell(i + 1);
            cell.value = text;
            cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
            cell.alignment = { horizontal: i === 1 ? 'right' : 'center', vertical: 'middle' };
            cell.border = thinBorder;
        });
        negColRow.height = 24;
        r2Idx++;

        if (negativeItems.length === 0) {
            ws2.mergeCells(`A${r2Idx}:G${r2Idx}`);
            const cell = ws2.getCell(`A${r2Idx}`);
            cell.value = '✅ هیچ کالایی با تراز وزنی منفی یافت نشد.';
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF15803D' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            ws2.getRow(r2Idx).height = 25;
            r2Idx++;
        } else {
            negativeItems.forEach((item, idx) => {
                const row = ws2.getRow(r2Idx);
                const last = n(item.lastYearWeight);
                const curr = n(item.currentWeight);
                const diff = parseFloat(item.diffWeight) || (curr - last);
                const pct = last ? (diff / last) * 100 : 0;
                const zebraBg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFFFF1F2';

                row.getCell(1).value = idx + 1;
                row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

                row.getCell(2).value = item.name || '-';
                row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
                row.getCell(2).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF991B1B' } };

                row.getCell(3).value = item.code || '-';
                row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

                row.getCell(4).value = last;
                row.getCell(4).numFmt = '#,##0.00';
                row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

                row.getCell(5).value = curr;
                row.getCell(5).numFmt = '#,##0.00';
                row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

                row.getCell(6).value = diff;
                row.getCell(6).numFmt = '-#,##0.00';
                row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
                row.getCell(6).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF991B1B' } };

                row.getCell(7).value = formatPct(pct);
                row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
                row.getCell(7).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF991B1B' } };
                row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

                for (let c = 1; c <= 7; c++) {
                    if (c !== 7) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraBg } };
                    row.getCell(c).border = thinBorder;
                }
                row.height = 22;
                r2Idx++;
            });
        }

        r2Idx++; // empty row

        // High Growth Items Table
        if (growthItems.length > 0) {
            ws2.mergeCells(`A${r2Idx}:G${r2Idx}`);
            const posHeader = ws2.getCell(`A${r2Idx}`);
            posHeader.value = '📈 اقلام با بیشترین رشد موجودی نسبت به سال قبل';
            posHeader.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
            posHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
            posHeader.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
            ws2.getRow(r2Idx).height = 25;
            r2Idx++;

            const posColRow = ws2.getRow(r2Idx);
            ['#', 'نام کالا / شرح گروه', 'کد کالا', 'وزن سال قبل (kg)', 'وزن سال جاری (kg)', 'رشد وزنی (kg)', 'درصد رشد'].forEach((text, i) => {
                const cell = posColRow.getCell(i + 1);
                cell.value = text;
                cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
                cell.alignment = { horizontal: i === 1 ? 'right' : 'center', vertical: 'middle' };
                cell.border = thinBorder;
            });
            posColRow.height = 24;
            r2Idx++;

            growthItems.forEach((item, idx) => {
                const row = ws2.getRow(r2Idx);
                const last = n(item.lastYearWeight);
                const curr = n(item.currentWeight);
                const diff = parseFloat(item.diffWeight) || (curr - last);
                const pct = last ? (diff / last) * 100 : 0;
                const zebraBg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF0FDF4';

                row.getCell(1).value = idx + 1;
                row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

                row.getCell(2).value = item.name || '-';
                row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
                row.getCell(2).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF064E3B' } };

                row.getCell(3).value = item.code || '-';
                row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

                row.getCell(4).value = last;
                row.getCell(4).numFmt = '#,##0.00';
                row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

                row.getCell(5).value = curr;
                row.getCell(5).numFmt = '#,##0.00';
                row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

                row.getCell(6).value = diff;
                row.getCell(6).numFmt = '+#,##0.00';
                row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
                row.getCell(6).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF15803D' } };

                row.getCell(7).value = formatPct(pct);
                row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
                row.getCell(7).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF15803D' } };
                row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };

                for (let c = 1; c <= 7; c++) {
                    if (c !== 7) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraBg } };
                    row.getCell(c).border = thinBorder;
                }
                row.height = 22;
                r2Idx++;
            });
        }
    }

    // Write to buffer and trigger download with FileSaver
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const cleanDate = reportDate.replace(/[\/\\]/g, '-');
    saveAs(blob, `گزارش_رسمی_موجودی_و_تراز_انبار_${cleanDate}.xlsx`);
};
