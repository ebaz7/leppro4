// Utility to generate printable and PDF-ready single-page A4 HTML for Production Executive & Analytical Report
// SPDX-License-Identifier: Apache-2.0

export interface ProductionGroupSummary {
    name: string;
    machinesCount: number;
    dailyIdealKg: number;
    periodIdealKg: number;
    actualKg: number;
    achPct: number;
    varianceKg: number;
}

export interface ProductionReportPrintDataset {
    title?: string;
    subtitle?: string;
    dateFrom: string;
    dateTo: string;
    daysCount: number;
    periodLabel: string; // 'روزانه' | 'هفتگی' | 'یک‌ماهه' | 'کل دوره'
    groupFilter: string; // 'all' or specific group name
    groupFilterName: string;
    chartPoints: Array<{
        label: string;
        date: string;
        actual: number;
        ideal: number;
        variancePeriod?: number;
        actualCum?: number;
        idealCum?: number;
        ratioCum?: number;
    }>;
    kpis: {
        totalActual: number;
        totalIdeal: number;
        achievementPct: number;
        variance: number;
        avgDailyActual: number;
        avgDailyIdeal: number;
        peakDay?: { date: string; amount: number };
        lowDay?: { date: string; amount: number };
        activeDaysCount?: number;
        totalWaste?: number;
        wastePct?: number;
    };
    groupsBreakdown?: ProductionGroupSummary[];
    executiveSummaryText?: string;
    wasteNotes?: string;
    issuedAt?: string;
    fiscalYear?: string;
}

/**
 * Generates pure vector SVG chart for PDF and A4 Printout
 * Self-contained, offline-safe, high DPI, crisp lines, no canvas/external dependencies.
 */
export function generateProductionChartSvg(
    points: ProductionReportPrintDataset['chartPoints'],
    isSingleDay: boolean = false,
    width: number = 720,
    height: number = 190
): string {
    if (!points || points.length === 0) {
        return `
            <div style="width:${width}px; height:${height}px; display:flex; align-items:center; justify-content:center; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; font-size:9pt; color:#64748b;">
                داده‌ای برای ترسیم نمودار در این بازه زمانی موجود نیست.
            </div>
        `;
    }

    // 1. Single-day mode: Draw clear comparative bar chart
    if (isSingleDay || points.length === 1) {
        const pt = points[0];
        const actual = pt.actual || 0;
        const ideal = pt.ideal || 0;
        const maxVal = Math.max(actual, ideal, 1) * 1.15;
        const barWidth = 70;
        const chartHeight = height - 55;
        const actualHeight = Math.max(4, (actual / maxVal) * chartHeight);
        const idealHeight = Math.max(4, (ideal / maxVal) * chartHeight);
        const diff = actual - ideal;
        const achPct = ideal > 0 ? (actual / ideal) * 100 : 0;

        return `
            <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;" xmlns="http://www.w3.org/2000/svg">
                <!-- Background & Grid -->
                <rect width="${width}" height="${height}" fill="#fafbfc"/>
                <line x1="40" y1="${height - 35}" x2="${width - 40}" y2="${height - 35}" stroke="#cbd5e1" stroke-width="1.5"/>
                
                <!-- Title / Date Header -->
                <text x="${width / 2}" y="22" font-family="Tahoma, sans-serif" font-size="11" font-weight="bold" fill="#1e293b" text-anchor="middle">
                    مقایسه عملکرد تولید روزانه با ظرفیت اسمی پلن ماشین‌آلات (تاریخ: ${pt.date || pt.label})
                </text>

                <!-- Legend -->
                <circle cx="${width - 150}" cy="20" r="5" fill="#2563eb" />
                <text x="${width - 140}" y="23" font-family="Tahoma, sans-serif" font-size="9" font-weight="bold" fill="#1e40af">تولید واقعی</text>
                <circle cx="${width - 70}" cy="20" r="5" fill="#d97706" />
                <text x="${width - 60}" y="23" font-family="Tahoma, sans-serif" font-size="9" font-weight="bold" fill="#b45309">سهمیه پلن</text>

                <!-- Bar 1: Actual Production -->
                <rect x="${width / 2 - 95}" y="${height - 35 - actualHeight}" width="${barWidth}" height="${actualHeight}" rx="4" fill="url(#barActualGrad)" stroke="#1d4ed8" stroke-width="1.5"/>
                <text x="${width / 2 - 95 + barWidth / 2}" y="${height - 40 - actualHeight}" font-family="Tahoma, monospace" font-size="10" font-weight="bold" fill="#1e3a8a" text-anchor="middle">
                    ${Math.round(actual).toLocaleString('fa-IR')} kg
                </text>
                <text x="${width / 2 - 95 + barWidth / 2}" y="${height - 18}" font-family="Tahoma, sans-serif" font-size="9" font-weight="bold" fill="#1e293b" text-anchor="middle">
                    تولید واقعی
                </text>

                <!-- Bar 2: Ideal Plan -->
                <rect x="${width / 2 + 25}" y="${height - 35 - idealHeight}" width="${barWidth}" height="${idealHeight}" rx="4" fill="url(#barIdealGrad)" stroke="#b45309" stroke-width="1.5" stroke-dasharray="4 2"/>
                <text x="${width / 2 + 25 + barWidth / 2}" y="${height - 40 - idealHeight}" font-family="Tahoma, monospace" font-size="10" font-weight="bold" fill="#b45309" text-anchor="middle">
                    ${Math.round(ideal).toLocaleString('fa-IR')} kg
                </text>
                <text x="${width / 2 + 25 + barWidth / 2}" y="${height - 18}" font-family="Tahoma, sans-serif" font-size="9" font-weight="bold" fill="#1e293b" text-anchor="middle">
                    سهمیه ایده‌آل پلن
                </text>

                <!-- Achievement Badge -->
                <rect x="50" y="${height / 2 - 25}" width="140" height="50" rx="6" fill="${achPct >= 100 ? '#ecfdf5' : '#fffbeb'}" stroke="${achPct >= 100 ? '#10b981' : '#f59e0b'}" stroke-width="1"/>
                <text x="120" y="${height / 2 - 7}" font-family="Tahoma, sans-serif" font-size="9" font-weight="bold" fill="#475569" text-anchor="middle">درصد تحقق روزانه:</text>
                <text x="120" y="${height / 2 + 15}" font-family="Tahoma, sans-serif" font-size="13" font-weight="900" fill="${achPct >= 100 ? '#047857' : '#b45309'}" text-anchor="middle">${achPct.toFixed(1)}%</text>

                <defs>
                    <linearGradient id="barActualGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#3b82f6" />
                        <stop offset="100%" stop-color="#1d4ed8" />
                    </linearGradient>
                    <linearGradient id="barIdealGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#fbbf24" />
                        <stop offset="100%" stop-color="#d97706" />
                    </linearGradient>
                </defs>
            </svg>
        `;
    }

    // 2. Multi-point Timeline mode: Sinuous S-Curve / Trend Area Chart
    const paddingLeft = 65;
    const paddingRight = 25;
    const paddingTop = 28;
    const paddingBottom = 28;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    // Use cumulative values if present, else standard step values
    const hasCum = points.some(p => (p.actualCum || 0) > 0 || (p.idealCum || 0) > 0);
    const getAct = (p: any) => hasCum ? (p.actualCum ?? p.actual) : p.actual;
    const getIdl = (p: any) => hasCum ? (p.idealCum ?? p.ideal) : p.ideal;

    const maxVal = Math.max(
        ...points.map(p => Math.max(getAct(p) || 0, getIdl(p) || 0)),
        1
    ) * 1.08;

    const n = points.length;
    const getX = (idx: number) => paddingLeft + (idx / Math.max(n - 1, 1)) * plotWidth;
    const getY = (val: number) => paddingTop + plotHeight - (Math.max(0, val) / maxVal) * plotHeight;

    // Build SVG Paths
    let actualPath = '';
    let actualAreaPath = '';
    let idealPath = '';

    points.forEach((p, idx) => {
        const x = getX(idx);
        const yAct = getY(getAct(p));
        const yIdl = getY(getIdl(p));

        if (idx === 0) {
            actualPath += `M ${x.toFixed(1)} ${yAct.toFixed(1)}`;
            actualAreaPath += `M ${x.toFixed(1)} ${yAct.toFixed(1)}`;
            idealPath += `M ${x.toFixed(1)} ${yIdl.toFixed(1)}`;
        } else {
            // Smooth bezier curve
            const prevX = getX(idx - 1);
            const prevYAct = getY(getAct(points[idx - 1]));
            const prevYIdl = getY(getIdl(points[idx - 1]));
            const midX = (prevX + x) / 2;

            actualPath += ` C ${midX.toFixed(1)} ${prevYAct.toFixed(1)}, ${midX.toFixed(1)} ${yAct.toFixed(1)}, ${x.toFixed(1)} ${yAct.toFixed(1)}`;
            actualAreaPath += ` C ${midX.toFixed(1)} ${prevYAct.toFixed(1)}, ${midX.toFixed(1)} ${yAct.toFixed(1)}, ${x.toFixed(1)} ${yAct.toFixed(1)}`;
            idealPath += ` C ${midX.toFixed(1)} ${prevYIdl.toFixed(1)}, ${midX.toFixed(1)} ${yIdl.toFixed(1)}, ${x.toFixed(1)} ${yIdl.toFixed(1)}`;
        }
    });

    const firstX = getX(0);
    const lastX = getX(n - 1);
    const bottomY = paddingTop + plotHeight;
    actualAreaPath += ` L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`;

    // Horizontal Grid Lines (4 steps)
    let gridLinesHtml = '';
    const steps = 4;
    for (let s = 0; s <= steps; s++) {
        const gridVal = (maxVal / steps) * s;
        const gridY = getY(gridVal);
        gridLinesHtml += `
            <line x1="${paddingLeft}" y1="${gridY.toFixed(1)}" x2="${width - paddingRight}" y2="${gridY.toFixed(1)}" stroke="#f1f5f9" stroke-width="1"/>
            <text x="${paddingLeft - 8}" y="${(gridY + 3).toFixed(1)}" font-family="Tahoma, sans-serif" font-size="8" fill="#64748b" text-anchor="end">
                ${Math.round(gridVal).toLocaleString('fa-IR')}
            </text>
        `;
    }

    // X-Axis Labels (sample at most 8 evenly spaced dates)
    let xLabelsHtml = '';
    const maxLabels = Math.min(n, 7);
    const stepInterval = Math.max(1, Math.floor((n - 1) / (maxLabels - 1 || 1)));
    const sampledIndices = new Set<number>();
    sampledIndices.add(0);
    for (let i = stepInterval; i < n - 1; i += stepInterval) {
        sampledIndices.add(i);
    }
    sampledIndices.add(n - 1);

    sampledIndices.forEach(idx => {
        const x = getX(idx);
        const p = points[idx];
        const labelText = p.label || p.date;
        xLabelsHtml += `
            <line x1="${x.toFixed(1)}" y1="${bottomY}" x2="${x.toFixed(1)}" y2="${bottomY + 4}" stroke="#94a3b8" stroke-width="1"/>
            <text x="${x.toFixed(1)}" y="${bottomY + 15}" font-family="Tahoma, sans-serif" font-size="8" fill="#475569" text-anchor="middle">
                ${labelText}
            </text>
        `;
    });

    return `
        <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="chartActualAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#2563eb" stop-opacity="0.25" />
                    <stop offset="100%" stop-color="#2563eb" stop-opacity="0.0" />
                </linearGradient>
            </defs>

            <!-- Background -->
            <rect width="${width}" height="${height}" fill="#fafbfc"/>

            <!-- Grid Lines & Values -->
            ${gridLinesHtml}

            <!-- Actual Area Fill -->
            <path d="${actualAreaPath}" fill="url(#chartActualAreaGrad)"/>

            <!-- Ideal Quota Line (Dashed Purple/Amber) -->
            <path d="${idealPath}" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="5 3"/>

            <!-- Actual Production Line (Solid Blue) -->
            <path d="${actualPath}" fill="none" stroke="#2563eb" stroke-width="2.5"/>

            <!-- X-Axis Baseline & Labels -->
            <line x1="${paddingLeft}" y1="${bottomY}" x2="${width - paddingRight}" y2="${bottomY}" stroke="#cbd5e1" stroke-width="1.5"/>
            ${xLabelsHtml}

            <!-- Legend at Top -->
            <rect x="${width - 250}" y="6" width="235" height="18" rx="4" fill="#ffffff" fill-opacity="0.9" stroke="#e2e8f0" stroke-width="1"/>
            <line x1="${width - 240}" y1="15" x2="${width - 225}" y2="15" stroke="#2563eb" stroke-width="3"/>
            <circle cx="${width - 232}" cy="15" r="3" fill="#2563eb"/>
            <text x="${width - 220}" y="18" font-family="Tahoma, sans-serif" font-size="8.5" font-weight="bold" fill="#1e40af">
                ${hasCum ? 'تولید واقعی تجمعی' : 'تولید واقعی'}
            </text>
            <line x1="${width - 125}" y1="15" x2="${width - 110}" y2="15" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="3 2"/>
            <text x="${width - 105}" y="18" font-family="Tahoma, sans-serif" font-size="8.5" font-weight="bold" fill="#6d28d9">
                ${hasCum ? 'سهمیه پلن تجمعی' : 'سهمیه پلن'}
            </text>
        </svg>
    `;
}

/**
 * Builds the complete, high-density, professional A4 single-page HTML
 * Strictly designed for printing or PDF export (fits on 1 page without spilling)
 */
export function buildProductionExecutiveA4PrintHtml(dataset: ProductionReportPrintDataset): string {
    const {
        title = 'گزارش مدیریتی و تحلیلی عملکرد خطوط تولید (مقایسه با پلن ظرفیت ماشین‌آلات)',
        subtitle = 'سامانه یکپارچه مانیتورینگ خطوط کارخانه دلکام - اطلاعات معتبر سایان ERP',
        dateFrom,
        dateTo,
        daysCount,
        periodLabel,
        groupFilterName,
        chartPoints,
        kpis,
        groupsBreakdown = [],
        executiveSummaryText = '',
        wasteNotes = '',
        issuedAt = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        fiscalYear = '۱۴۰۵'
    } = dataset;

    const isSingleDay = dateFrom === dateTo || daysCount === 1;
    const chartSvg = generateProductionChartSvg(chartPoints, isSingleDay, 740, 180);

    const fKg = (val: number) => Math.round(val || 0).toLocaleString('fa-IR');
    const fDec = (val: number, d = 1) => Number(val || 0).toLocaleString('fa-IR', { minimumFractionDigits: d, maximumFractionDigits: d });

    // Status color helper
    const achStatusColor = kpis.achievementPct >= 100 ? '#15803d' : (kpis.achievementPct >= 80 ? '#b45309' : '#b91c1c');
    const achStatusBg = kpis.achievementPct >= 100 ? '#f0fdf4' : (kpis.achievementPct >= 80 ? '#fffbeb' : '#fef2f2');
    const achStatusBorder = kpis.achievementPct >= 100 ? '#86efac' : (kpis.achievementPct >= 80 ? '#fde68a' : '#fca5a5');
    const achStatusLabel = kpis.achievementPct >= 100 ? 'عالی (فراتر از برنامه)' : (kpis.achievementPct >= 80 ? 'مطلوب (در آستانه هدف)' : 'نیازمند پیگیری (کسری تولید)');

    // Compact group rows (Top 6 lines if many, to guarantee single A4 page fit)
    const groupsToDisplay = groupsBreakdown.slice(0, 7);
    const groupsTableHtml = groupsToDisplay.map((grp, idx) => {
        const rowAchColor = grp.achPct >= 100 ? '#15803d' : (grp.achPct >= 80 ? '#b45309' : '#b91c1c');
        const diffText = grp.varianceKg >= 0 ? `+${fKg(grp.varianceKg)}` : fKg(grp.varianceKg);

        return `
            <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; font-size:7.8pt;">
                <td style="padding:4px 6px; border:1px solid #cbd5e1; text-align:center;">${idx + 1}</td>
                <td style="padding:4px 8px; border:1px solid #cbd5e1; font-weight:bold; text-align:right;">${grp.name}</td>
                <td style="padding:4px 6px; border:1px solid #cbd5e1; text-align:center;">${grp.machinesCount} دستگاه</td>
                <td style="padding:4px 6px; border:1px solid #cbd5e1; text-align:center; font-family:monospace;">${fKg(grp.dailyIdealKg)}</td>
                <td style="padding:4px 6px; border:1px solid #cbd5e1; text-align:center; font-family:monospace; color:#475569;">${fKg(grp.periodIdealKg)}</td>
                <td style="padding:4px 6px; border:1px solid #cbd5e1; text-align:center; font-family:monospace; font-weight:bold; color:#1e40af; background:#eff6ff;">${fKg(grp.actualKg)}</td>
                <td style="padding:4px 6px; border:1px solid #cbd5e1; text-align:center; font-weight:bold; color:${rowAchColor}; font-family:monospace;">${grp.achPct.toFixed(1)}%</td>
                <td style="padding:4px 6px; border:1px solid #cbd5e1; text-align:center; font-family:monospace; color:${grp.varianceKg >= 0 ? '#15803d' : '#b91c1c'}; font-weight:bold;">${diffText}</td>
            </tr>
        `;
    }).join('');

    return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
    <meta charset="UTF-8">
    <title>${title} (${dateFrom} تا ${dateTo})</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 8mm 9mm 8mm 9mm;
        }
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        body {
            font-family: 'Vazirmatn', 'Vazir', 'Tahoma', sans-serif;
            margin: 0;
            padding: 0;
            color: #0f172a;
            direction: rtl;
            background: #ffffff;
            font-size: 8.5pt;
            line-height: 1.35;
            width: 100%;
            max-width: 794px;
            margin: 0 auto;
        }
        .header-container {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #1e3a8a;
            padding-bottom: 6px;
            margin-bottom: 8px;
        }
        .header-title-box {
            text-align: right;
            flex: 1;
        }
        .main-title {
            font-size: 11.5pt;
            font-weight: 900;
            color: #1e3a8a;
            margin: 0 0 2px 0;
        }
        .sub-title {
            font-size: 7.5pt;
            color: #64748b;
            margin: 0;
        }
        .meta-box {
            text-align: left;
            font-size: 7.5pt;
            color: #334155;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 4px 8px;
            border-radius: 6px;
            line-height: 1.4;
        }
        .badges-bar {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 8px;
            background: #f1f5f9;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 8pt;
            font-weight: bold;
        }
        .badge {
            background: #ffffff;
            border: 1px solid #cbd5e1;
            padding: 2px 7px;
            border-radius: 4px;
            color: #1e293b;
        }
        .badge strong {
            color: #1d4ed8;
        }

        /* KPI Cards Grid */
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 5px;
            margin-bottom: 8px;
        }
        .kpi-card {
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 5px 6px;
            background: #ffffff;
            text-align: center;
        }
        .kpi-label {
            font-size: 6.8pt;
            color: #64748b;
            font-weight: bold;
            margin-bottom: 2px;
            white-space: nowrap;
        }
        .kpi-value {
            font-size: 9.5pt;
            font-weight: 900;
            font-family: monospace, Tahoma;
            color: #0f172a;
        }

        /* Chart Container */
        .chart-box {
            margin-bottom: 8px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 4px;
            background: #ffffff;
        }

        /* Executive Analysis Box */
        .summary-box {
            border-right: 3px solid #2563eb;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            border-bottom: 1px solid #e2e8f0;
            border-left: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 6px 10px;
            margin-bottom: 8px;
            font-size: 7.8pt;
            line-height: 1.45;
        }
        .summary-box strong {
            color: #1e3a8a;
        }

        /* Table */
        .table-title {
            font-size: 8.5pt;
            font-weight: bold;
            color: #1e293b;
            margin: 0 0 4px 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
        }
        th {
            background: #1e293b;
            color: #ffffff;
            font-size: 7.5pt;
            font-weight: bold;
            padding: 4px 6px;
            border: 1px solid #334155;
            text-align: center;
        }
        td {
            border: 1px solid #cbd5e1;
            padding: 3.5px 6px;
        }

        /* Signatures Block */
        .signatures-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-top: 10px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 8px;
        }
        .sig-box {
            text-align: center;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 6px 4px 22px 4px;
            background: #ffffff;
            font-size: 7.5pt;
            color: #475569;
        }
        .sig-title {
            font-weight: bold;
            color: #1e293b;
            margin-bottom: 2px;
        }

        .footer-note {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 6.8pt;
            color: #94a3b8;
            margin-top: 6px;
            border-top: 1px solid #f1f5f9;
            padding-top: 4px;
        }
    </style>
</head>
<body>
    <!-- Official Header -->
    <div class="header-container">
        <div class="header-title-box">
            <h1 class="main-title">${title}</h1>
            <p class="sub-title">${subtitle}</p>
        </div>
        <div class="meta-box">
            <div><strong>سال مالی:</strong> ${fiscalYear}</div>
            <div><strong>بازه انتخابی:</strong> ${dateFrom} تا ${dateTo} (${daysCount} روز)</div>
            <div><strong>زمان صدور:</strong> ${issuedAt}</div>
        </div>
    </div>

    <!-- Filter & Scope Badges -->
    <div class="badges-bar">
        <span class="badge">فیلتر خط کالایی: <strong>${groupFilterName}</strong></span>
        <span class="badge">گام زمانی تحلیل: <strong>${periodLabel}</strong></span>
        <span class="badge">تعداد روزهای فعال دارای تولید: <strong>${kpis.activeDaysCount || daysCount} روز</strong></span>
        <span class="badge" style="background:${achStatusBg}; border-color:${achStatusBorder}; color:${achStatusColor};">
            ارزیابی تحقق: <strong>${achStatusLabel}</strong>
        </span>
    </div>

    <!-- Top KPI Cards Grid -->
    <div class="kpi-grid">
        <div class="kpi-card" style="border-top: 2px solid #2563eb;">
            <div class="kpi-label">مجموع تولید واقعی</div>
            <div class="kpi-value" style="color:#1d4ed8;">${fKg(kpis.totalActual)} <span style="font-size:7pt; font-family:sans-serif;">kg</span></div>
        </div>
        <div class="kpi-card" style="border-top: 2px solid #8b5cf6;">
            <div class="kpi-label">سهمیه ایده‌آل پلن</div>
            <div class="kpi-value" style="color:#6d28d9;">${fKg(kpis.totalIdeal)} <span style="font-size:7pt; font-family:sans-serif;">kg</span></div>
        </div>
        <div class="kpi-card" style="border-top: 2px solid ${achStatusColor}; background:${achStatusBg};">
            <div class="kpi-label">درصد تحقق هدف (KPI)</div>
            <div class="kpi-value" style="color:${achStatusColor};">${kpis.achievementPct.toFixed(1)}%</div>
        </div>
        <div class="kpi-card" style="border-top: 2px solid ${kpis.variance >= 0 ? '#10b981' : '#ef4444'};">
            <div class="kpi-label">انحراف از برنامه</div>
            <div class="kpi-value" style="color:${kpis.variance >= 0 ? '#047857' : '#b91c1c'};">${kpis.variance >= 0 ? '+' : ''}${fKg(kpis.variance)}</div>
        </div>
        <div class="kpi-card" style="border-top: 2px solid #0284c7;">
            <div class="kpi-label">میانگین روزانه واقعی / اسمی</div>
            <div class="kpi-value" style="font-size:8.5pt;">${fKg(kpis.avgDailyActual)} <span style="font-size:7pt; color:#64748b;">/ ${fKg(kpis.avgDailyIdeal)}</span></div>
        </div>
        <div class="kpi-card" style="border-top: 2px solid #f59e0b;">
            <div class="kpi-label">ضایعات کارخانه</div>
            <div class="kpi-value" style="color:#b45309; font-size:8.5pt;">${fKg(kpis.totalWaste || 0)} <span style="font-size:7pt;">(${fDec(kpis.wastePct || 0, 2)}%)</span></div>
        </div>
    </div>

    <!-- Vector Visual Chart Section -->
    <div class="chart-box">
        ${chartSvg}
    </div>

    <!-- Executive Management Summary Text Box -->
    <div class="summary-box">
        <strong>📝 خلاصه تحلیلی وضعیت واقعی تولید:</strong>
        ${executiveSummaryText || `
            در بازه زمانی ${dateFrom} تا ${dateTo} (${daysCount} روز)، مجموع تولید خالص کارخانه به مقدار ${fKg(kpis.totalActual)} کیلوگرم به ثبت رسید که نشان‌دهنده تحقق ${kpis.achievementPct.toFixed(1)} درصدی از ظرفیت اسمی تعیین‌شده در پلن ماشین‌آلات (${fKg(kpis.totalIdeal)} کیلوگرم) می‌باشد.
            ${kpis.peakDay ? `بالاترین رکورد روزانه در تاریخ ${kpis.peakDay.date} با مقدار ${fKg(kpis.peakDay.amount)} کیلوگرم ثبت شده است.` : ''}
            میزان ضایعات ثبت‌شده خطوط در این بازه معادل ${fKg(kpis.totalWaste || 0)} کیلوگرم (${fDec(kpis.wastePct || 0, 2)}%) گزارش گردیده است.
        `}
        ${wasteNotes ? `<br><span style="color:#64748b; font-size:7.2pt;"><strong>یادداشت ضایعات:</strong> ${wasteNotes}</span>` : ''}
    </div>

    <!-- Group Breakdown Table -->
    ${groupsBreakdown.length > 0 ? `
        <div>
            <div class="table-title">
                <span>📊 ارزیابی و تفکیک عملکرد خطوط تولید بر اساس پلن مهندسی:</span>
                <span style="font-size:7pt; color:#64748b; font-weight:normal;">(اوزان بر حسب کیلوگرم)</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width:24px;">#</th>
                        <th style="text-align:right;">نام خط / گروه کالایی</th>
                        <th style="width:65px;">دستگاه فعال</th>
                        <th style="width:75px;">ظرفیت روزانه</th>
                        <th style="width:85px;">سهمیه دوره (${daysCount} روز)</th>
                        <th style="width:85px; background:#1e3a8a;">تولید واقعی</th>
                        <th style="width:65px;">تحقق (%)</th>
                        <th style="width:75px;">انحراف (kg)</th>
                    </tr>
                </thead>
                <tbody>
                    ${groupsTableHtml}
                </tbody>
            </table>
        </div>
    ` : ''}

    <!-- Official Management Signatures -->
    <div class="signatures-grid">
        <div class="sig-box">
            <div class="sig-title">مدیریت تولید و برنامه‌ریزی فنی</div>
            <div>امضا و تایید گزارش تولید</div>
        </div>
        <div class="sig-box">
            <div class="sig-title">مدیریت کنترل کیفیت و آزمایشگاه</div>
            <div>تایید کیفیت و نرخ ضایعات</div>
        </div>
        <div class="sig-box">
            <div class="sig-title">مدیریت عامل کارخانه</div>
            <div>رویت و تایید نهایی شاخص‌های KPI</div>
        </div>
    </div>

    <!-- Footer Note -->
    <div class="footer-note">
        <span>سامانه یکپارچه برنامه‌ریزی و پایش خطوط نساجی دلکام ERP</span>
        <span>سند رسمی گزارش مدیریتی A4 - کد سند: DEL-PROD-${Date.now().toString().slice(-6)}</span>
        <span>صفحه ۱ از ۱</span>
    </div>
</body>
</html>
    `;
}
