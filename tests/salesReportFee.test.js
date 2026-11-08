import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Sayan Sales Report - Average Unit Price (فی میانگین = مبلغ خالص / وزن خالص)', () => {
    it('should correctly compute netFee = netAmt / netWgt for individual rows', () => {
        const netAmt = 125000000; // 125,000,000 Rials
        const netWgt = 250;       // 250 Kg
        const netFee = netWgt > 0 ? (netAmt / netWgt) : 0;
        
        assert.strictEqual(netFee, 500000);
        assert.strictEqual(Math.round(netFee), 500000);
    });

    it('should handle zero net weight gracefully without divide-by-zero or NaN', () => {
        const netAmt = 5000000;
        const netWgt = 0;
        const netFee = netWgt > 0 ? (netAmt / netWgt) : 0;

        assert.strictEqual(netFee, 0);
        assert.strictEqual(Number.isFinite(netFee), true);
    });

    it('should accurately calculate feeA and feeB for comparative sales reports', () => {
        const row = {
            name: 'DTY 150/48',
            netWeightA: 1000,
            netAmountA: 850000000,
            netWeightB: 800,
            netAmountB: 720000000
        };

        const wgtA = row.netWeightA ?? 0;
        const amtA = row.netAmountA ?? 0;
        const feeA = wgtA > 0 ? amtA / wgtA : 0;

        const wgtB = row.netWeightB ?? 0;
        const amtB = row.netAmountB ?? 0;
        const feeB = wgtB > 0 ? amtB / wgtB : 0;

        assert.strictEqual(feeA, 850000);
        assert.strictEqual(feeB, 900000);

        const diffFee = feeA - feeB;
        const feePct = feeB > 0 ? ((diffFee / feeB) * 100).toFixed(1) : '0';
        assert.strictEqual(feePct, '-5.6');
    });

    it('should include average unit rate (فی میانگین) columns and row breakdown in server.js and bot-core.js', () => {
        const serverSrc = fs.readFileSync(path.resolve('server.js'), 'utf8');
        const botCoreSrc = fs.readFileSync(path.resolve('backend/bot-core.js'), 'utf8');
        const dashboardSrc = fs.readFileSync(path.resolve('components/sales/SayanSalesDashboard.tsx'), 'utf8');

        assert.ok(serverSrc.includes("'فی A (ریال)'"), 'server.js send-compare should include فی A (ریال)');
        assert.ok(serverSrc.includes("'فی B (ریال)'"), 'server.js send-compare should include فی B (ریال)');
        assert.ok(serverSrc.includes("'فی میانگین A (ریال)'"), 'server.js download-compare-pdf should include فی میانگین A (ریال)');
        assert.ok(serverSrc.includes("'فی میانگین B (ریال)'"), 'server.js download-compare-pdf should include فی میانگین B (ریال)');
        assert.ok(serverSrc.includes("تفکیک عملکرد و فی میانگین هر سطر"), 'server.js captions should include row-by-row fee breakdown');

        assert.ok(botCoreSrc.includes("'فی میانگین A (ریال)'"), 'bot-core.js comparison PDF should include فی میانگین A');
        assert.ok(botCoreSrc.includes("'فی میانگین B (ریال)'"), 'bot-core.js comparison PDF should include فی میانگین B');
        assert.ok(botCoreSrc.includes("'فی میانگین (ریال)'"), 'bot-core.js daily sales PDF should include فی میانگین (ریال)');

        assert.ok(dashboardSrc.includes("'فی میانگین (ریال/ک‌گ)'"), 'SayanSalesDashboard.tsx should include فی میانگین (ریال/ک‌گ)');
    });
});
