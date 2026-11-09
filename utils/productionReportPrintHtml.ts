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
    stepChartType?: 'line' | 'bar';
    periodLabels?: {
        title?: string;
        subtitle?: string;
        actualLegend?: string;
        idealLegend?: string;
    };
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
 * Chart 1: Generates pure vector SVG chart for Cumulative S-Curve (or single-point comparative bar)
 * Self-contained, offline-safe, high DPI, crisp lines, no canvas/external dependencies.
 */
export function generateProductionChartSvg(
    points: ProductionReportPrintDataset['chartPoints'],
    isSingleDay: boolean = false,
    width: number = 720,
    height: number = 135
): string {
    if (!points || points.length === 0) {
        return `
            <div style="width:${width}px; height:${height}px; display:flex; align-items:center; justify-content:center; background:#f8fafc; border:1.5px dashed #000000; border-radius:8px; font-size:9pt; font-weight:bold; color:#000000;">
                داده‌ای برای ترسیم نمودار در این بازه زمانی موجود نیست.
            </div>
        `;
    }

    // 1. Single-day / single-point mode: Draw clear comparative bar chart
    if (isSingleDay || points.length === 1) {
        const pt = points[0];
        const actual = pt.actualCum ?? pt.actual ?? 0;
        const ideal = pt.idealCum ?? pt.ideal ?? 0;
        const maxVal = Math.max(actual, ideal, 1) * 1.18;
        const barWidth = 64;
        const chartHeight = height - 52;
        const actualHeight = Math.max(4, (actual / maxVal) * chartHeight);
        const idealHeight = Math.max(4, (ideal / maxVal) * chartHeight);
        const achPct = ideal > 0 ? (actual / ideal) * 100 : 0;

        return `
            <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="background:#ffffff; border:1.2px solid #000000; border-radius:6px; overflow:hidden; display:block;" xmlns="http://www.w3.org/2000/svg">
                <!-- Background & Grid -->
                <rect width="${width}" height="${height}" fill="#ffffff"/>
                <line x1="40" y1="${height - 28}" x2="${width - 40}" y2="${height - 28}" stroke="#000000" stroke-width="1.5"/>
                
                <!-- Title / Date Header -->
                <text x="${width - 14}" y="18" font-family="Tahoma, sans-serif" font-size="9.5" font-weight="bold" fill="#000000" text-anchor="end">
                    ${pt.label && (pt.label.includes('دوره') || pt.label.includes('بازه')) 
                        ? `نمودار ۱: مقایسه عملکرد تولید کل بازه با ظرفیت اسمی پلن ماشین‌آلات (${pt.date || pt.label})` 
                        : `نمودار ۱: مقایسه عملکرد تولید روزانه با ظرفیت اسمی پلن ماشین‌آلات (تاریخ: ${pt.date || pt.label})`}
                </text>

                <!-- Legend -->
                <circle cx="165" cy="15" r="4.5" fill="#1d4ed8" />
                <text x="155" y="18" font-family="Tahoma, sans-serif" font-size="8.5" font-weight="bold" fill="#000000" text-anchor="end">تولید واقعی</text>
                <circle cx="85" cy="15" r="4.5" fill="#b45309" />
                <text x="75" y="18" font-family="Tahoma, sans-serif" font-size="8.5" font-weight="bold" fill="#000000" text-anchor="end">سهمیه ایده‌آل پلن</text>

                <!-- Bar 1: Actual Production -->
                <rect x="${width / 2 - 85}" y="${height - 28 - actualHeight}" width="${barWidth}" height="${actualHeight}" rx="4" fill="url(#barActualGrad)" stroke="#000000" stroke-width="1.5"/>
                <text x="${width / 2 - 85 + barWidth / 2}" y="${height - 32 - actualHeight}" font-family="Tahoma, monospace" font-size="9" font-weight="bold" fill="#000000" text-anchor="middle">
                    ${Math.round(actual).toLocaleString('fa-IR')} kg
                </text>
                <text x="${width / 2 - 85 + barWidth / 2}" y="${height - 13}" font-family="Tahoma, sans-serif" font-size="8.5" font-weight="bold" fill="#000000" text-anchor="middle">
                    تولید واقعی
                </text>

                <!-- Bar 2: Ideal Plan -->
                <rect x="${width / 2 + 25}" y="${height - 28 - idealHeight}" width="${barWidth}" height="${idealHeight}" rx="4" fill="url(#barIdealGrad)" stroke="#000000" stroke-width="1.5" stroke-dasharray="4 2"/>
                <text x="${width / 2 + 25 + barWidth / 2}" y="${height - 32 - idealHeight}" font-family="Tahoma, monospace" font-size="9" font-weight="bold" fill="#000000" text-anchor="middle">
                    ${Math.round(ideal).toLocaleString('fa-IR')} kg
                </text>
                <text x="${width / 2 + 25 + barWidth / 2}" y="${height - 13}" font-family="Tahoma, sans-serif" font-size="8.5" font-weight="bold" fill="#000000" text-anchor="middle">
                    سهمیه ایده‌آل پلن
                </text>

                <!-- Achievement Badge -->
                <rect x="45" y="${height / 2 - 18}" width="135" height="42" rx="6" fill="${achPct >= 100 ? '#ecfdf5' : '#fffbeb'}" stroke="#000000" stroke-width="1.2"/>
                <text x="112" y="${height / 2 - 3}" font-family="Tahoma, sans-serif" font-size="8.5" font-weight="bold" fill="#000000" text-anchor="middle">${pt.label && (pt.label.includes('دوره') || pt.label.includes('بازه')) ? 'درصد تحقق کل بازه:' : 'درصد تحقق روزانه:'}</text>
                <text x="112" y="${height / 2 + 15}" font-family="Tahoma, sans-serif" font-size="11.5" font-weight="900" fill="#000000" text-anchor="middle">${achPct.toFixed(1)}%</text>

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

    // 2. Multi-point Timeline mode: Sinuous S-Curve / Cumulative Trend Area Chart
    const paddingLeft = 65;
    const paddingRight = 22;
    const paddingTop = 28;
    const paddingBottom = 22;
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
    let idealAreaPath = '';

    points.forEach((p, idx) => {
        const x = getX(idx);
        const yAct = getY(getAct(p));
        const yIdl = getY(getIdl(p));

        if (idx === 0) {
            actualPath += `M ${x.toFixed(1)} ${yAct.toFixed(1)}`;
            actualAreaPath += `M ${x.toFixed(1)} ${yAct.toFixed(1)}`;
            idealPath += `M ${x.toFixed(1)} ${yIdl.toFixed(1)}`;
            idealAreaPath += `M ${x.toFixed(1)} ${yIdl.toFixed(1)}`;
        } else {
            // Smooth bezier curve
            const prevX = getX(idx - 1);
            const prevYAct = getY(getAct(points[idx - 1]));
            const prevYIdl = getY(getIdl(points[idx - 1]));
            const midX = (prevX + x) / 2;

            actualPath += ` C ${midX.toFixed(1)} ${prevYAct.toFixed(1)}, ${midX.toFixed(1)} ${yAct.toFixed(1)}, ${x.toFixed(1)} ${yAct.toFixed(1)}`;
            actualAreaPath += ` C ${midX.toFixed(1)} ${prevYAct.toFixed(1)}, ${midX.toFixed(1)} ${yAct.toFixed(1)}, ${x.toFixed(1)} ${yAct.toFixed(1)}`;
            idealPath += ` C ${midX.toFixed(1)} ${prevYIdl.toFixed(1)}, ${midX.toFixed(1)} ${yIdl.toFixed(1)}, ${x.toFixed(1)} ${yIdl.toFixed(1)}`;
            idealAreaPath += ` C ${midX.toFixed(1)} ${prevYIdl.toFixed(1)}, ${midX.toFixed(1)} ${yIdl.toFixed(1)}, ${x.toFixed(1)} ${yIdl.toFixed(1)}`;
        }
    });

    const firstX = getX(0);
    const lastX = getX(n - 1);
    const bottomY = paddingTop + plotHeight;
    actualAreaPath += ` L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`;
    idealAreaPath += ` L ${lastX.toFixed(1)} ${bottomY.toFixed(1)} L ${firstX.toFixed(1)} ${bottomY.toFixed(1)} Z`;

    // Horizontal Grid Lines (4 steps)
    let gridLinesHtml = '';
    const steps = 4;
    for (let s = 0; s <= steps; s++) {
        const gridVal = (maxVal / steps) * s;
        const gridY = getY(gridVal);
        gridLinesHtml += `
            <line x1="${paddingLeft}" y1="${gridY.toFixed(1)}" x2="${width - paddingRight}" y2="${gridY.toFixed(1)}" stroke="#cbd5e1" stroke-width="1"/>
            <text x="${paddingLeft - 6}" y="${(gridY + 3).toFixed(1)}" font-family="Tahoma, sans-serif" font-size="7.5" font-weight="bold" fill="#000000" text-anchor="end">
                ${Math.round(gridVal).toLocaleString('fa-IR')}
            </text>
        `;
    }

    // X-Axis Labels (sample up to 8 evenly spaced dates)
    let xLabelsHtml = '';
    const maxLabels = Math.min(n, 8);
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
            <line x1="${x.toFixed(1)}" y1="${bottomY}" x2="${x.toFixed(1)}" y2="${bottomY + 3}" stroke="#000000" stroke-width="1.2"/>
            <text x="${x.toFixed(1)}" y="${bottomY + 13}" font-family="Tahoma, sans-serif" font-size="7.5" font-weight="bold" fill="#000000" text-anchor="middle">
                ${labelText}
            </text>
        `;
    });

    return `
        <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="background:#ffffff; border:1.2px solid #000000; border-radius:6px; overflow:hidden; display:block;" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="chartActualAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#2563eb" stop-opacity="0.28" />
                    <stop offset="100%" stop-color="#2563eb" stop-opacity="0.0" />
                </linearGradient>
                <linearGradient id="chartIdealAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.16" />
                    <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.0" />
                </linearGradient>
            </defs>

            <!-- Background -->
            <rect width="${width}" height="${height}" fill="#ffffff"/>

            <!-- Chart 1 Title (Right-aligned) -->
            <text x="${width - 12}" y="16" font-family="Tahoma, sans-serif" font-size="8.5" font-weight="bold" fill="#000000" text-anchor="end">
                📈 نمودار ۱: منحنی خطی سینوسی تجمعی S-Curve (تولید واقعی در برابر ایده‌آل تجمعی)
            </text>

            <!-- Grid Lines & Values -->
            ${gridLinesHtml}

            <!-- Ideal & Actual Area Fills -->
            <path d="${idealAreaPath}" fill="url(#chartIdealAreaGrad)"/>
            <path d="${actualAreaPath}" fill="url(#chartActualAreaGrad)"/>

            <!-- Ideal Quota Line (Dashed Purple/Dark) -->
            <path d="${idealPath}" fill="none" stroke="#6d28d9" stroke-width="2.2" stroke-dasharray="5 3"/>

            <!-- Actual Production Line (Solid Blue/Dark) -->
            <path d="${actualPath}" fill="none" stroke="#1d4ed8" stroke-width="2.8"/>

            <!-- X-Axis Baseline & Labels -->
            <line x1="${paddingLeft}" y1="${bottomY}" x2="${width - paddingRight}" y2="${bottomY}" stroke="#000000" stroke-width="1.5"/>
            ${xLabelsHtml}

            <!-- Legend at Top Left -->
            <rect x="${paddingLeft}" y="4" width="235" height="17" rx="4" fill="#ffffff" fill-opacity="0.96" stroke="#000000" stroke-width="1"/>
            <line x1="${paddingLeft + 8}" y1="12.5" x2="${paddingLeft + 23}" y2="12.5" stroke="#1d4ed8" stroke-width="2.5"/>
            <circle cx="${paddingLeft + 15.5}" cy="12.5" r="2.8" fill="#1d4ed8"/>
            <text x="${paddingLeft + 28}" y="15.5" font-family="Tahoma, sans-serif" font-size="8" font-weight="bold" fill="#000000">
                ${hasCum ? 'تولید واقعی تجمعی' : 'تولید واقعی'}
            </text>
            <line x1="${paddingLeft + 125}" y1="12.5" x2="${paddingLeft + 140}" y2="12.5" stroke="#6d28d9" stroke-width="2.2" stroke-dasharray="3 2"/>
            <text x="${paddingLeft + 145}" y="15.5" font-family="Tahoma, sans-serif" font-size="8" font-weight="bold" fill="#000000">
                ${hasCum ? 'سهمیه پلن تجمعی' : 'سهمیه پلن'}
            </text>
        </svg>
    `;
}

/**
 * Chart 2: Generates pure vector SVG chart for Step-by-Step Periodic Comparison (Monthly / Weekly / Daily / Custom)
 * Plots `actual` vs `ideal` per step (supports both 'line' and 'bar' modes matching the UI).
 */
export function generateProductionStepChartSvg(
    points: ProductionReportPrintDataset['chartPoints'],
    stepChartType: 'line' | 'bar' = 'line',
    periodLabels?: ProductionReportPrintDataset['periodLabels'],
    width: number = 720,
    height: number = 135
): string {
    if (!points || points.length === 0) {
        return '';
    }

    const chartTitle = periodLabels?.title || 'روند مقایسه‌ای دوره‌ای / روزانه (تولید هر گام در برابر سهمیه ایده‌آل پلن)';
    const actualLegend = periodLabels?.actualLegend || 'تولید واقعی این گام';
    const idealLegend = periodLabels?.idealLegend || 'سهمیه ایده‌آل گام (پلن)';

    const paddingLeft = 65;
    const paddingRight = 22;
    const paddingTop = 28;
    const paddingBottom = 22;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const bottomY = paddingTop + plotHeight;

    const maxVal = Math.max(
        ...points.map(p => Math.max(p.actual || 0, p.ideal || 0)),
        1
    ) * 1.12;

    const n = points.length;
    const getY = (val: number) => paddingTop + plotHeight - (Math.max(0, val) / maxVal) * plotHeight;

    // Horizontal Grid Lines (4 steps)
    let gridLinesHtml = '';
    const steps = 4;
    for (let s = 0; s <= steps; s++) {
        const gridVal = (maxVal / steps) * s;
        const gridY = getY(gridVal);
        gridLinesHtml += `
            <line x1="${paddingLeft}" y1="${gridY.toFixed(1)}" x2="${width - paddingRight}" y2="${gridY.toFixed(1)}" stroke="#cbd5e1" stroke-width="1"/>
            <text x="${paddingLeft - 6}" y="${(gridY + 3).toFixed(1)}" font-family="Tahoma, sans-serif" font-size="7.5" font-weight="bold" fill="#000000" text-anchor="end">
                ${Math.round(gridVal).toLocaleString('fa-IR')}
            </text>
        `;
    }

    const useBarMode = stepChartType === 'bar' || n <= 1;

    let plotElementsHtml = '';
    let xLabelsHtml = '';

    if (useBarMode) {
        const groupStep = plotWidth / Math.max(n, 1);
        const barPairWidth = Math.min(48, Math.max(6, groupStep * 0.68));
        const singleBarW = Math.max(2.5, (barPairWidth - 2) / 2);

        const maxLabels = Math.min(n, 8);
        const stepInterval = Math.max(1, Math.floor((n - 1) / (maxLabels - 1 || 1)));
        const sampledIndices = new Set<number>();
        sampledIndices.add(0);
        for (let i = stepInterval; i < n - 1; i += stepInterval) {
            sampledIndices.add(i);
        }
        sampledIndices.add(n - 1);

        points.forEach((p, idx) => {
            const centerX = paddingLeft + (idx + 0.5) * groupStep;
            const yAct = getY(p.actual || 0);
            const hAct = Math.max(2, bottomY - yAct);
            const yIdl = getY(p.ideal || 0);
            const hIdl = Math.max(2, bottomY - yIdl);

            plotElementsHtml += `
                <rect x="${(centerX - singleBarW - 1).toFixed(1)}" y="${yAct.toFixed(1)}" width="${singleBarW.toFixed(1)}" height="${hAct.toFixed(1)}" rx="2" fill="#0284c7" stroke="#000000" stroke-width="0.6"/>
                <rect x="${(centerX + 1).toFixed(1)}" y="${yIdl.toFixed(1)}" width="${singleBarW.toFixed(1)}" height="${hIdl.toFixed(1)}" rx="2" fill="#d97706" stroke="#000000" stroke-width="0.6"/>
            `;

            if (sampledIndices.has(idx)) {
                const labelText = p.label || p.date;
                xLabelsHtml += `
                    <line x1="${centerX.toFixed(1)}" y1="${bottomY}" x2="${centerX.toFixed(1)}" y2="${bottomY + 3}" stroke="#000000" stroke-width="1.2"/>
                    <text x="${centerX.toFixed(1)}" y="${bottomY + 13}" font-family="Tahoma, sans-serif" font-size="7.5" font-weight="bold" fill="#000000" text-anchor="middle">
                        ${labelText}
                    </text>
                `;
            }
        });
    } else {
        const getX = (idx: number) => paddingLeft + (idx / Math.max(n - 1, 1)) * plotWidth;
        let actualPath = '';
        let idealPath = '';
        let dotsHtml = '';
        const dotRadius = n <= 16 ? 3.2 : (n <= 45 ? 2.2 : 1.5);

        points.forEach((p, idx) => {
            const x = getX(idx);
            const yAct = getY(p.actual || 0);
            const yIdl = getY(p.ideal || 0);

            if (idx === 0) {
                actualPath += `M ${x.toFixed(1)} ${yAct.toFixed(1)}`;
                idealPath += `M ${x.toFixed(1)} ${yIdl.toFixed(1)}`;
            } else {
                const prevX = getX(idx - 1);
                const prevYAct = getY(points[idx - 1].actual || 0);
                const prevYIdl = getY(points[idx - 1].ideal || 0);
                const midX = (prevX + x) / 2;

                actualPath += ` C ${midX.toFixed(1)} ${prevYAct.toFixed(1)}, ${midX.toFixed(1)} ${yAct.toFixed(1)}, ${x.toFixed(1)} ${yAct.toFixed(1)}`;
                idealPath += ` C ${midX.toFixed(1)} ${prevYIdl.toFixed(1)}, ${midX.toFixed(1)} ${yIdl.toFixed(1)}, ${x.toFixed(1)} ${yIdl.toFixed(1)}`;
            }

            if (n <= 65 || idx % Math.ceil(n / 45) === 0 || idx === n - 1) {
                dotsHtml += `
                    <circle cx="${x.toFixed(1)}" cy="${yIdl.toFixed(1)}" r="${(dotRadius * 0.85).toFixed(1)}" fill="#d97706"/>
                    <circle cx="${x.toFixed(1)}" cy="${yAct.toFixed(1)}" r="${dotRadius.toFixed(1)}" fill="#0284c7" stroke="#000000" stroke-width="0.7"/>
                `;
            }
        });

        plotElementsHtml = `
            <path d="${idealPath}" fill="none" stroke="#b45309" stroke-width="2.2" stroke-dasharray="4 3"/>
            <path d="${actualPath}" fill="none" stroke="#0369a1" stroke-width="2.6"/>
            ${dotsHtml}
        `;

        const maxLabels = Math.min(n, 8);
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
                <line x1="${x.toFixed(1)}" y1="${bottomY}" x2="${x.toFixed(1)}" y2="${bottomY + 3}" stroke="#000000" stroke-width="1.2"/>
                <text x="${x.toFixed(1)}" y="${bottomY + 13}" font-family="Tahoma, sans-serif" font-size="7.5" font-weight="bold" fill="#000000" text-anchor="middle">
                    ${labelText}
                </text>
            `;
        });
    }

    return `
        <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="background:#ffffff; border:1.2px solid #000000; border-radius:6px; overflow:hidden; display:block;" xmlns="http://www.w3.org/2000/svg">
            <!-- Background -->
            <rect width="${width}" height="${height}" fill="#ffffff"/>

            <!-- Chart 2 Title (Right-aligned) -->
            <text x="${width - 12}" y="16" font-family="Tahoma, sans-serif" font-size="8.5" font-weight="bold" fill="#000000" text-anchor="end">
                📊 نمودار ۲: ${chartTitle}
            </text>

            <!-- Grid Lines & Values -->
            ${gridLinesHtml}

            <!-- Step Comparison Plot (Line or Bar) -->
            ${plotElementsHtml}

            <!-- X-Axis Baseline & Labels -->
            <line x1="${paddingLeft}" y1="${bottomY}" x2="${width - paddingRight}" y2="${bottomY}" stroke="#000000" stroke-width="1.5"/>
            ${xLabelsHtml}

            <!-- Legend at Top Left -->
            <rect x="${paddingLeft}" y="4" width="275" height="17" rx="4" fill="#ffffff" fill-opacity="0.96" stroke="#000000" stroke-width="1"/>
            <circle cx="${paddingLeft + 12}" cy="12.5" r="3.5" fill="#0284c7"/>
            <text x="${paddingLeft + 20}" y="15.5" font-family="Tahoma, sans-serif" font-size="7.8" font-weight="bold" fill="#000000">
                ${actualLegend.length > 22 ? actualLegend.slice(0, 22) : actualLegend}
            </text>
            <circle cx="${paddingLeft + 135}" cy="12.5" r="3.5" fill="#d97706"/>
            <text x="${paddingLeft + 143}" y="15.5" font-family="Tahoma, sans-serif" font-size="7.8" font-weight="bold" fill="#000000">
                ${idealLegend.length > 26 ? idealLegend.slice(0, 26) : idealLegend}
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
        stepChartType = 'line',
        periodLabels,
        chartPoints,
        kpis,
        groupsBreakdown = [],
        executiveSummaryText = '',
        wasteNotes = '',
        issuedAt = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        fiscalYear = '۱۴۰۵'
    } = dataset;

    const isSingleDay = dateFrom === dateTo || (daysCount === 1 && chartPoints.length <= 1);
    const chart1Svg = generateProductionChartSvg(chartPoints, isSingleDay, 740, 126);
    const chart2Svg = generateProductionStepChartSvg(chartPoints, stepChartType, periodLabels, 740, 126);

    const fKg = (val: number) => Math.round(val || 0).toLocaleString('fa-IR');
    const fDec = (val: number, d = 1) => Number(val || 0).toLocaleString('fa-IR', { minimumFractionDigits: d, maximumFractionDigits: d });

    // Status color helper
    const achStatusColor = kpis.achievementPct >= 100 ? '#15803d' : (kpis.achievementPct >= 80 ? '#b45309' : '#b91c1c');
    const achStatusBg = kpis.achievementPct >= 100 ? '#f0fdf4' : (kpis.achievementPct >= 80 ? '#fffbeb' : '#fef2f2');
    const achStatusLabel = kpis.achievementPct >= 100 ? 'عالی (فراتر از برنامه)' : (kpis.achievementPct >= 80 ? 'مطلوب (در آستانه هدف)' : 'نیازمند پیگیری (کسری تولید)');

    // Compact group rows (Top 7 lines if many, to guarantee single A4 page fit)
    const groupsToDisplay = groupsBreakdown.slice(0, 7);
    const groupsTableHtml = groupsToDisplay.map((grp, idx) => {
        const diffText = grp.varianceKg >= 0 ? `+${fKg(grp.varianceKg)}` : fKg(grp.varianceKg);

        return `
            <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f1f5f9'}; font-size:7.8pt; color:#000000; font-weight:bold;">
                <td style="padding:4px 6px; border:1.2px solid #000000; text-align:center;">${idx + 1}</td>
                <td style="padding:4px 8px; border:1.2px solid #000000; font-weight:900; text-align:right; color:#000000;">${grp.name}</td>
                <td style="padding:4px 6px; border:1.2px solid #000000; text-align:center;">${grp.machinesCount} دستگاه</td>
                <td style="padding:4px 6px; border:1.2px solid #000000; text-align:center; font-family:monospace; font-weight:900;">${fKg(grp.dailyIdealKg)}</td>
                <td style="padding:4px 6px; border:1.2px solid #000000; text-align:center; font-family:monospace; color:#000000; font-weight:900;">${fKg(grp.periodIdealKg)}</td>
                <td style="padding:4px 6px; border:1.2px solid #000000; text-align:center; font-family:monospace; font-weight:900; color:#000000; background:#e2e8f0;">${fKg(grp.actualKg)}</td>
                <td style="padding:4px 6px; border:1.2px solid #000000; text-align:center; font-weight:900; color:#000000; font-family:monospace;">${grp.achPct.toFixed(1)}%</td>
                <td style="padding:4px 6px; border:1.2px solid #000000; text-align:center; font-family:monospace; color:#000000; font-weight:900;">${diffText}</td>
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
            margin: 7mm 8mm;
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
            color: #000000;
            direction: rtl;
            background: #ffffff;
            font-size: 8.5pt;
            line-height: 1.35;
            width: 100%;
        }
        .header-container {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2.5px solid #000000;
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
            color: #000000;
            margin: 0 0 2px 0;
        }
        .sub-title {
            font-size: 7.8pt;
            font-weight: bold;
            color: #000000;
            margin: 0;
        }
        .meta-box {
            text-align: left;
            font-size: 7.5pt;
            font-weight: bold;
            color: #000000;
            background: #f8fafc;
            border: 1.5px solid #000000;
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
            border: 1.2px solid #000000;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 8pt;
            font-weight: bold;
        }
        .badge {
            background: #ffffff;
            border: 1.2px solid #000000;
            padding: 2px 7px;
            border-radius: 4px;
            color: #000000;
            font-weight: bold;
        }
        .badge strong {
            color: #000000;
            font-weight: 900;
        }

        /* KPI Cards Grid */
        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 5px;
            margin-bottom: 8px;
        }
        .kpi-card {
            border: 1.5px solid #000000;
            border-radius: 6px;
            padding: 5px 6px;
            background: #ffffff;
            text-align: center;
        }
        .kpi-label {
            font-size: 7pt;
            color: #000000;
            font-weight: 900;
            margin-bottom: 2px;
            white-space: nowrap;
        }
        .kpi-value {
            font-size: 9.5pt;
            font-weight: 900;
            font-family: monospace, Tahoma;
            color: #000000;
        }

        /* Chart Container */
        .chart-box {
            margin-bottom: 6px;
            border: 1.5px solid #000000;
            border-radius: 6px;
            padding: 4px;
            background: #ffffff;
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        /* Executive Analysis Box */
        .summary-box {
            border-right: 3.5px solid #000000;
            background: #f8fafc;
            border-top: 1.2px solid #000000;
            border-bottom: 1.2px solid #000000;
            border-left: 1.2px solid #000000;
            border-radius: 4px;
            padding: 5px 9px;
            margin-bottom: 6px;
            font-size: 7.8pt;
            font-weight: bold;
            color: #000000;
            line-height: 1.4;
        }
        .summary-box strong {
            color: #000000;
            font-weight: 900;
        }

        /* Table */
        .table-title {
            font-size: 8.4pt;
            font-weight: 900;
            color: #000000;
            margin: 0 0 3px 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 6px;
            border: 2px solid #000000;
        }
        th {
            background: #e2e8f0 !important;
            color: #000000 !important;
            font-size: 7.6pt;
            font-weight: 900;
            padding: 4px 6px;
            border: 1.5px solid #000000 !important;
            text-align: center;
        }
        td {
            border: 1.2px solid #000000 !important;
            padding: 3px 6px;
            color: #000000;
            font-weight: bold;
        }

        /* Signatures Block */
        .signatures-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-top: 6px;
            border-top: 1.5px dashed #000000;
            padding-top: 6px;
        }
        .sig-box {
            text-align: center;
            border: 1.5px solid #000000;
            border-radius: 6px;
            padding: 5px 4px 16px 4px;
            background: #ffffff;
            font-size: 7.5pt;
            font-weight: bold;
            color: #000000;
        }
        .sig-title {
            font-weight: 900;
            color: #000000;
            margin-bottom: 2px;
        }

        .footer-note {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 7pt;
            font-weight: bold;
            color: #000000;
            margin-top: 4px;
            border-top: 1.2px solid #000000;
            padding-top: 3px;
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
        <span class="badge" style="background:${achStatusBg}; border-color:#000000; color:#000000;">
            ارزیابی تحقق: <strong>${achStatusLabel}</strong>
        </span>
    </div>

    <!-- Top KPI Cards Grid -->
    <div class="kpi-grid">
        <div class="kpi-card" style="border-top: 3px solid #000000;">
            <div class="kpi-label">مجموع تولید واقعی</div>
            <div class="kpi-value" style="color:#000000;">${fKg(kpis.totalActual)} <span style="font-size:7pt; font-family:sans-serif;">kg</span></div>
        </div>
        <div class="kpi-card" style="border-top: 3px solid #000000;">
            <div class="kpi-label">سهمیه ایده‌آل پلن</div>
            <div class="kpi-value" style="color:#000000;">${fKg(kpis.totalIdeal)} <span style="font-size:7pt; font-family:sans-serif;">kg</span></div>
        </div>
        <div class="kpi-card" style="border-top: 3px solid #000000; background:${achStatusBg};">
            <div class="kpi-label">درصد تحقق هدف (KPI)</div>
            <div class="kpi-value" style="color:#000000;">${kpis.achievementPct.toFixed(1)}%</div>
        </div>
        <div class="kpi-card" style="border-top: 3px solid #000000;">
            <div class="kpi-label">انحراف از برنامه</div>
            <div class="kpi-value" style="color:#000000;">${kpis.variance >= 0 ? '+' : ''}${fKg(kpis.variance)}</div>
        </div>
        <div class="kpi-card" style="border-top: 3px solid #000000;">
            <div class="kpi-label">میانگین روزانه واقعی / اسمی</div>
            <div class="kpi-value" style="font-size:8.5pt; color:#000000;">${fKg(kpis.avgDailyActual)} <span style="font-size:7pt; color:#000000;">/ ${fKg(kpis.avgDailyIdeal)}</span></div>
        </div>
        <div class="kpi-card" style="border-top: 3px solid #000000;">
            <div class="kpi-label">ضایعات کارخانه</div>
            <div class="kpi-value" style="color:#000000; font-size:8.5pt;">${fKg(kpis.totalWaste || 0)} <span style="font-size:7pt;">(${fDec(kpis.wastePct || 0, 2)}%)</span></div>
        </div>
    </div>

    <!-- Vector Visual Charts Section (Both Chart 1: Cumulative S-Curve & Chart 2: Periodic Step Comparison) -->
    <div class="chart-box">
        ${chart1Svg}
        ${chart2Svg}
    </div>

    <!-- Executive Management Summary Text Box -->
    <div class="summary-box">
        <strong>📝 خلاصه تحلیلی وضعیت واقعی تولید:</strong>
        ${executiveSummaryText || `
            در بازه زمانی ${dateFrom} تا ${dateTo} (${daysCount} روز)، مجموع تولید خالص کارخانه به مقدار ${fKg(kpis.totalActual)} کیلوگرم به ثبت رسید که نشان‌دهنده تحقق ${kpis.achievementPct.toFixed(1)} درصدی از ظرفیت اسمی تعیین‌شده در پلن ماشین‌آلات (${fKg(kpis.totalIdeal)} کیلوگرم) می‌باشد.
            ${kpis.peakDay ? `بالاترین رکورد روزانه در تاریخ ${kpis.peakDay.date} با مقدار ${fKg(kpis.peakDay.amount)} کیلوگرم ثبت شده است.` : ''}
            میزان ضایعات ثبت‌شده خطوط در این بازه معادل ${fKg(kpis.totalWaste || 0)} کیلوگرم (${fDec(kpis.wastePct || 0, 2)}%) گزارش گردیده است.
        `}
        ${wasteNotes ? `<br><span style="color:#000000; font-size:7.4pt;"><strong>یادداشت ضایعات:</strong> ${wasteNotes}</span>` : ''}
    </div>

    <!-- Group Breakdown Table -->
    ${groupsBreakdown.length > 0 ? `
        <div>
            <div class="table-title">
                <span>📊 ارزیابی و تفکیک عملکرد خطوط تولید بر اساس پلن مهندسی:</span>
                <span style="font-size:7.2pt; color:#000000; font-weight:bold;">(اوزان بر حسب کیلوگرم)</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width:24px;">#</th>
                        <th style="text-align:right;">نام خط / گروه کالایی</th>
                        <th style="width:65px;">دستگاه فعال</th>
                        <th style="width:75px;">ظرفیت روزانه</th>
                        <th style="width:85px;">سهمیه دوره (${daysCount} روز)</th>
                        <th style="width:85px; background:#cbd5e1 !important; color:#000000 !important;">تولید واقعی</th>
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
