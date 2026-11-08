import test from 'node:test';
import assert from 'node:assert/strict';
import {
    generateProductionChartSvg,
    generateProductionStepChartSvg,
    buildProductionExecutiveA4PrintHtml
} from '../utils/productionReportPrintHtml.js';

test('Production Report A4: Vector SVG chart generation for single day (comparative bar)', () => {
    const singleDayPoints = [
        { label: '1405/08/17', date: '1405/08/17', actual: 6400, ideal: 51096, variancePeriod: -44696 }
    ];
    const svg = generateProductionChartSvg(singleDayPoints, true, 740, 135);
    assert.ok(svg.includes('<svg'), 'SVG chart should be generated');
    assert.ok(svg.includes('تولید واقعی'), 'SVG should contain actual production label');
    assert.ok(svg.includes('سهمیه ایده‌آل پلن'), 'SVG should contain ideal plan label');
    assert.ok(svg.includes('درصد تحقق روزانه:'), 'SVG should show daily achievement percentage');
});

test('Production Report A4: Vector SVG chart generation for multi-day period (S-curve trend)', () => {
    const multiDayPoints = [
        { label: '08/01', date: '1405/08/01', actual: 5000, ideal: 5100, actualCum: 5000, idealCum: 5100 },
        { label: '08/02', date: '1405/08/02', actual: 5200, ideal: 5100, actualCum: 10200, idealCum: 10200 },
        { label: '08/03', date: '1405/08/03', actual: 5500, ideal: 5100, actualCum: 15700, idealCum: 15300 }
    ];
    const svg = generateProductionChartSvg(multiDayPoints, false, 740, 135);
    assert.ok(svg.includes('<svg'), 'SVG chart should be generated');
    assert.ok(svg.includes('path'), 'SVG should contain curve path elements');
    assert.ok(svg.includes('نمودار ۱: منحنی خطی سینوسی تجمعی S-Curve'), 'SVG should contain Chart 1 title');
    assert.ok(svg.includes('تولید واقعی تجمعی'), 'SVG should contain cumulative legend');
    assert.ok(svg.includes('سهمیه پلن تجمعی'), 'SVG should contain plan quota legend');
});

test('Production Report A4: Vector SVG step chart generation for periodic comparison (Line & Bar modes)', () => {
    const monthlyPoints = [
        { label: 'فروردین', date: '1405/01', actual: 180000, ideal: 810000 },
        { label: 'اردیبهشت', date: '1405/02', actual: 240000, ideal: 1580000 },
        { label: 'خرداد', date: '1405/03', actual: 210000, ideal: 1490000 }
    ];
    const periodLabels = {
        title: 'روند مقایسه‌ای ماهانه (تولید ماه در برابر سهمیه ماهانه پلن)',
        actualLegend: 'تولید واقعی ماهانه',
        idealLegend: 'سهمیه ایده‌آل ماهانه پلن'
    };

    const lineSvg = generateProductionStepChartSvg(monthlyPoints, 'line', periodLabels, 740, 135);
    assert.ok(lineSvg.includes('<svg'), 'Step line SVG should be generated');
    assert.ok(lineSvg.includes('نمودار ۲: روند مقایسه‌ای ماهانه'), 'Step SVG should contain Chart 2 title');
    assert.ok(lineSvg.includes('<path'), 'Line mode should render path curves');
    assert.ok(lineSvg.includes('<circle'), 'Line mode should render data point circles');

    const barSvg = generateProductionStepChartSvg(monthlyPoints, 'bar', periodLabels, 740, 135);
    assert.ok(barSvg.includes('<svg'), 'Step bar SVG should be generated');
    assert.ok(barSvg.includes('fill="#0284c7"'), 'Bar mode should render sky-blue actual bars');
    assert.ok(barSvg.includes('fill="#d97706"'), 'Bar mode should render amber ideal bars');
});

test('Production Report A4: Vector SVG chart generation for custom period total (comparative bar)', () => {
    const customPeriodPoints = [
        { label: 'کل دوره (227 روز)', date: '1405/01/01 تا 1405/08/17', actual: 538000, ideal: 4648234 }
    ];
    const svg = generateProductionChartSvg(customPeriodPoints, false, 740, 135);
    assert.ok(svg.includes('<svg'), 'SVG chart should be generated');
    assert.ok(svg.includes('مقایسه عملکرد تولید کل بازه با ظرفیت اسمی پلن ماشین‌آلات'), 'Title should show whole period comparison');
    assert.ok(svg.includes('درصد تحقق کل بازه:'), 'Badge should show total period achievement');
    assert.ok(svg.includes('تولید واقعی'), 'SVG should contain actual label');
    assert.ok(svg.includes('سهمیه ایده‌آل پلن'), 'SVG should contain plan label');
});

test('Production Report A4: Full single-page A4 document builder embeds BOTH charts, signatures, and KPIs', () => {
    const dataset = {
        title: 'گزارش تحلیلی و مانیتورینگ عملکرد خطوط تولید (مقایسه با پلن ظرفیت ماشین‌آلات)',
        subtitle: 'سامانه پایش خطوط نساجی و ظرفیت‌سنجی ماشین‌آلات کارخانه - دلکام ERP',
        dateFrom: '1405/08/01',
        dateTo: '1405/08/17',
        daysCount: 17,
        periodLabel: 'روزانه',
        groupFilter: 'all',
        groupFilterName: 'همه گروه‌ها (کل کارخانه)',
        stepChartType: 'line',
        periodLabels: {
            title: 'روند مقایسه‌ای روزانه (تولید هر روز در برابر سهمیه روزانه پلن)',
            actualLegend: 'تولید واقعی روزانه',
            idealLegend: 'سهمیه ایده‌آل روزانه پلن'
        },
        chartPoints: [
            { label: '08/01', date: '1405/08/01', actual: 4800, ideal: 5100, actualCum: 4800, idealCum: 5100 },
            { label: '08/17', date: '1405/08/17', actual: 5300, ideal: 5100, actualCum: 85000, idealCum: 86700 }
        ],
        kpis: {
            totalActual: 85000,
            totalIdeal: 86700,
            achievementPct: 98.0,
            variance: -1700,
            avgDailyActual: 5000,
            avgDailyIdeal: 5100,
            peakDay: { date: '1405/08/15', amount: 6200 },
            lowDay: { date: '1405/08/03', amount: 3900 },
            activeDaysCount: 17,
            totalWaste: 240,
            wastePct: 0.28
        },
        groupsBreakdown: [
            {
                name: 'dty یا پلی استر',
                machinesCount: 4,
                dailyIdealKg: 20477,
                periodIdealKg: 348109,
                actualKg: 350000,
                achPct: 100.5,
                varianceKg: 1891
            }
        ],
        executiveSummaryText: 'عملکرد تولید در این بازه با ثبات ارزیابی می‌شود.',
        wasteNotes: 'ضایعات در محدوده استاندارد است.',
        issuedAt: '15:30',
        fiscalYear: '۱۴۰۵'
    };

    const html = buildProductionExecutiveA4PrintHtml(dataset);
    assert.ok(html.includes('<!DOCTYPE html>'), 'Must start with DOCTYPE');
    assert.ok(html.includes('@page'), 'Must include @page CSS');
    assert.ok(html.includes('A4 portrait'), 'Must be specified as A4 portrait');
    assert.ok(html.includes('مدیریت تولید و برنامه‌ریزی فنی'), 'Must include production manager signature box');
    assert.ok(html.includes('مدیریت عامل کارخانه'), 'Must include CEO signature box');
    assert.ok(html.includes('dty یا پلی استر'), 'Must include line breakdown table');
    assert.ok(html.includes('نمودار ۱: منحنی خطی سینوسی تجمعی S-Curve'), 'Must include Chart 1 (Cumulative S-Curve)');
    assert.ok(html.includes('نمودار ۲: روند مقایسه‌ای روزانه'), 'Must include Chart 2 (Periodic Step Comparison)');
    const svgMatches = html.match(/<svg/g) || [];
    assert.equal(svgMatches.length, 2, 'Must embed BOTH vector charts in the A4 report');
});

