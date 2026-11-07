import { getDb, saveDb, robustFetch, sanitizeSayanUrl } from './db-manager.js';

// Safe Gregorian to Jalali converter
function gregorianToJalali(gy, gm, gd) {
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    const gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    jy += Math.floor((days - 1) / 365);
    if (days > 0) days = (days - 1) % 365;
    let jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    let jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return { jy, jm, jd };
}

export function formatToJalaliStr(isoOrDate) {
    if (!isoOrDate) return '---';
    try {
        const d = new Date(isoOrDate);
        if (isNaN(d.getTime())) return '---';
        const { jy, jm, jd } = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const mm = String(jm).padStart(2, '0');
        const dd = String(jd).padStart(2, '0');
        return `${jy}/${mm}/${dd}`;
    } catch {
        return '---';
    }
}

/**
 * Calculates standard Accounting and Market Ras (Weighted Average Maturity)
 * based on Chronological Invoices, Receipts/Payments and FIFO Balance Settlement.
 */
export function calculateFifoAging(balance, transactions, nowMs = Date.now()) {
    const balNum = Number(balance || 0);
    const balAbs = Math.abs(balNum);
    const isDebtor = balNum > 0;
    
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return {
            balance: balNum,
            daysOverdue: 0,
            weightedDate: null,
            weightedDateJalali: balAbs < 1 ? 'تسویه شده' : 'فاقد گردش فاکتور',
            invoicesRasDate: null,
            invoicesRasJalali: '---',
            receiptsRasDate: null,
            receiptsRasJalali: '---',
            settlementLagDays: 0,
            totalInvoicesAmt: 0,
            totalReceiptsAmt: 0,
            oldestUnpaidDate: null,
            oldestUnpaidDateJalali: '---',
            oldestDaysOverdue: 0,
            lastInvoiceDate: null,
            lastInvoiceDateJalali: '---',
            status: balAbs < 1 ? 'settled' : 'unknown',
            statusLabel: balAbs < 1 ? 'تسویه شده' : 'بدون گردش',
            coveredAmt: 0,
            coveragePercent: balAbs < 1 ? 100 : 0,
            unpaidInvoices: []
        };
    }

    // Sort transactions chronologically (Oldest to Newest) for correct accounting FIFO
    const sortedTx = transactions
        .map(t => {
            const bed = Number(t.Bed || 0);
            const bes = Number(t.Bes || 0);
            const dateMs = new Date(t.Date).getTime();
            return {
                ...t,
                bed,
                bes,
                dateMs,
                dateJalali: formatToJalaliStr(t.Date)
            };
        })
        .filter(t => !isNaN(t.dateMs))
        .sort((a, b) => a.dateMs - b.dateMs);

    // Invoices = Debits for Debtors, Credits for Creditors
    // Receipts/Settlements = Credits for Debtors, Debits for Creditors
    const invoices = sortedTx
        .map(t => ({ ...t, amount: isDebtor ? t.bed : t.bes }))
        .filter(t => t.amount > 0);

    const receipts = sortedTx
        .map(t => ({ ...t, amount: isDebtor ? t.bes : t.bed }))
        .filter(t => t.amount > 0);

    // 1. Calculate Market Ras of Total Invoices (میانگین وزنی کل فاکتورها)
    let totalInvoicesAmt = 0;
    let sumInvoicesWeight = 0;
    invoices.forEach(inv => {
        totalInvoicesAmt += inv.amount;
        sumInvoicesWeight += inv.amount * inv.dateMs;
    });
    const invoicesRasMs = totalInvoicesAmt > 0 ? (sumInvoicesWeight / totalInvoicesAmt) : null;
    const invoicesRasDate = invoicesRasMs ? new Date(invoicesRasMs).toISOString() : null;
    const invoicesRasJalali = formatToJalaliStr(invoicesRasDate);

    // 2. Calculate Market Ras of Total Receipts (میانگین وزنی کل دریافت‌ها/تسویه‌ها)
    let totalReceiptsAmt = 0;
    let sumReceiptsWeight = 0;
    receipts.forEach(rec => {
        totalReceiptsAmt += rec.amount;
        sumReceiptsWeight += rec.amount * rec.dateMs;
    });
    const receiptsRasMs = totalReceiptsAmt > 0 ? (sumReceiptsWeight / totalReceiptsAmt) : null;
    const receiptsRasDate = receiptsRasMs ? new Date(receiptsRasMs).toISOString() : null;
    const receiptsRasJalali = formatToJalaliStr(receiptsRasDate);

    // 3. Settlement Period / Market Lag (مدت زمان تسویه مشتری از راس فاکتور تا راس دریافت)
    const settlementLagDays = (invoicesRasMs && receiptsRasMs) 
        ? Math.round((receiptsRasMs - invoicesRasMs) / (1000 * 60 * 60 * 24)) 
        : 0;

    // 4. Accounting FIFO Settlement on Invoices (تطبیق دریافت‌ها با فاکتورهای قدیمی)
    let totalReceiptsToCover = totalReceiptsAmt;
    const invoiceSettlementState = invoices.map(inv => {
        let covered = 0;
        if (totalReceiptsToCover > 0) {
            covered = Math.min(inv.amount, totalReceiptsToCover);
            totalReceiptsToCover -= covered;
        }
        const remainingUnpaid = inv.amount - covered;
        return {
            ...inv,
            coveredAmount: covered,
            unpaidPortion: remainingUnpaid,
            isSettled: remainingUnpaid <= 0
        };
    });

    // Unpaid invoices that constitute the remaining balance
    const openInvoices = invoiceSettlementState
        .filter(inv => inv.unpaidPortion > 0)
        .reverse(); // Newest first for display

    let fifoWeightedSum = 0;
    let fifoCoveredAmt = 0;
    let oldestDate = null;
    let newestDate = openInvoices[0]?.Date || invoices[invoices.length - 1]?.Date || null;
    const unpaidInvoices = [];

    // If balance is <= 0 or settled
    if (balAbs < 1) {
        return {
            balance: balNum,
            daysOverdue: 0,
            weightedDate: null,
            weightedDateJalali: 'تسویه شده',
            invoicesRasDate,
            invoicesRasJalali,
            receiptsRasDate,
            receiptsRasJalali,
            settlementLagDays,
            totalInvoicesAmt,
            totalReceiptsAmt,
            oldestUnpaidDate: null,
            oldestUnpaidDateJalali: '---',
            oldestDaysOverdue: 0,
            lastInvoiceDate: newestDate,
            lastInvoiceDateJalali: formatToJalaliStr(newestDate),
            status: 'settled',
            statusLabel: 'تسویه شده',
            coveredAmt: 0,
            coveragePercent: 100,
            unpaidInvoices: []
        };
    }

    let remainingToMatch = balAbs;
    for (const inv of openInvoices) {
        const portion = Math.min(inv.unpaidPortion, remainingToMatch);
        fifoWeightedSum += portion * inv.dateMs;
        fifoCoveredAmt += portion;
        remainingToMatch -= portion;
        oldestDate = inv.Date;

        unpaidInvoices.push({
            sanadNo: inv.SanadNo,
            date: inv.Date,
            dateJalali: formatToJalaliStr(inv.Date),
            description: inv.Description,
            totalAmount: inv.amount,
            unpaidPortion: portion,
            isFullyUnpaid: portion === inv.amount
        });

        if (remainingToMatch <= 0) break;
    }

    // Fallback if no open invoices from matching but positive balance exists
    if (fifoCoveredAmt === 0 && invoices.length > 0) {
        const lastInv = invoices[invoices.length - 1];
        fifoWeightedSum = balAbs * lastInv.dateMs;
        fifoCoveredAmt = balAbs;
        oldestDate = lastInv.Date;
        newestDate = lastInv.Date;
        unpaidInvoices.push({
            sanadNo: lastInv.SanadNo,
            date: lastInv.Date,
            dateJalali: formatToJalaliStr(lastInv.Date),
            description: lastInv.Description || 'مانده تعهد جاری',
            totalAmount: lastInv.amount,
            unpaidPortion: balAbs,
            isFullyUnpaid: false
        });
    }

    const fifoWeightedMs = fifoCoveredAmt > 0 ? (fifoWeightedSum / fifoCoveredAmt) : (invoicesRasMs || nowMs);
    const weightedDateIso = new Date(fifoWeightedMs).toISOString();
    const daysOverdue = Math.max(0, Math.round((nowMs - fifoWeightedMs) / (1000 * 60 * 60 * 24)));
    const oldestDaysOverdue = oldestDate ? Math.max(0, Math.round((nowMs - new Date(oldestDate).getTime()) / (1000 * 60 * 60 * 24))) : daysOverdue;
    const coveragePercent = Math.min(100, Math.round((fifoCoveredAmt / balAbs) * 100));

    let status = 'normal';
    let statusLabel = `${daysOverdue} روز`;
    if (daysOverdue > 90) {
        status = 'critical';
        statusLabel = `⚠️ ${daysOverdue} روز تاخیر (بحرانی)`;
    } else if (daysOverdue > 60) {
        status = 'warning';
        statusLabel = `⏳ ${daysOverdue} روز تاخیر`;
    } else if (daysOverdue > 30) {
        status = 'caution';
        statusLabel = `${daysOverdue} روز گذشته`;
    } else {
        status = 'normal';
        statusLabel = `✅ ${daysOverdue} روز (جاری)`;
    }

    return {
        balance: balNum,
        daysOverdue,
        weightedDate: weightedDateIso,
        weightedDateJalali: formatToJalaliStr(weightedDateIso),
        invoicesRasDate,
        invoicesRasJalali,
        receiptsRasDate,
        receiptsRasJalali,
        settlementLagDays,
        totalInvoicesAmt,
        totalReceiptsAmt,
        oldestUnpaidDate: oldestDate,
        oldestUnpaidDateJalali: formatToJalaliStr(oldestDate),
        oldestDaysOverdue,
        lastInvoiceDate: newestDate,
        lastInvoiceDateJalali: formatToJalaliStr(newestDate),
        status,
        statusLabel,
        coveredAmt: fifoCoveredAmt,
        coveragePercent,
        unpaidInvoices
    };
}

/**
 * Runs a direct SQL query against Sayan API
 */
async function querySayan(sql) {
    const db = getDb();
    const settings = db.settings || {};
    const sayanUrl = sanitizeSayanUrl(settings.sayanApiUrl || process.env.SAYAN_API_URL || 'http://80.210.31.176:5000/api/external/v1');
    const sayanKey = settings.sayanApiKey || process.env.SAYAN_API_KEY || 's_gate_live_73f08a91b2c';

    if (!sayanUrl || !sayanKey) {
        throw new Error('تنظیمات آدرس و کلید API سایان پیکربندی نشده است.');
    }

    const endpoint = `${sayanUrl}/query`;
    const response = await robustFetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${sayanKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ query: sql }),
        timeout: 25000
    });

    if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || `خطا در اجرای کوئری سایان (${response.status})`);
    }

    const json = await response.json();
    return json.data || [];
}

/**
 * Fetches recent vouchers for a specific party code and computes their aging live from Sayan
 */
export async function getPartyAgingFromSayan(code, balance = 0) {
    if (!code) return null;
    const cleanCode = String(code).trim();

    const sql = `
        SELECT TOP 150 
            t9.Field_004 as SanadNo,
            t8.Field_008 as Date,
            t9.Field_009 as Bed,
            t9.Field_010 as Bes,
            t9.Field_011 as Description
        FROM ACT_TBL_009 t9 WITH (NOLOCK)
        INNER JOIN ACT_TBL_008 t8 WITH (NOLOCK) ON t8.Field_004 = t9.Field_003 AND t8.Field_005 = t9.Field_004
        WHERE (t8.Field_004 = '4' OR t8.Field_004 = '3')
          AND (
              t9.Field_015 LIKE '11:11' + '${cleanCode}' + '%' OR 
              t9.Field_015 LIKE '%:' + '${cleanCode}' + '%' OR
              t9.Field_015 LIKE '31:31' + '${cleanCode}' + '%' OR
              t9.Field_015 LIKE '51:51' + '${cleanCode}' + '%'
          )
          AND t9.Field_007 NOT IN ('102', '103', '107', '109', '114', '116', '117')
          AND t9.Field_005 <> '9'
        ORDER BY t8.Field_008 ASC
    `;

    try {
        const rows = await querySayan(sql);
        const aging = calculateFifoAging(balance, rows);
        return {
            code: cleanCode,
            ...aging
        };
    } catch (err) {
        console.warn(`[Sayan Aging] Failed to query aging for party ${cleanCode}:`, err.message);
        return {
            code: cleanCode,
            balance: Number(balance || 0),
            daysOverdue: 0,
            weightedDate: null,
            weightedDateJalali: '---',
            status: 'unknown',
            statusLabel: 'خطا در واکشی',
            error: err.message
        };
    }
}

/**
 * Computes aging for a batch of parties directly from Sayan
 */
export async function getBatchAgingForParties(parties, force = false) {
    if (!Array.isArray(parties) || parties.length === 0) return {};

    const db = getDb();
    if (!db.sayanAgingCache || force) db.sayanAgingCache = {};

    const results = {};
    const toQuery = [];

    const now = Date.now();
    // Cache valid for 5 minutes unless force is requested
    const CACHE_TTL = 5 * 60 * 1000;
    for (const p of parties) {
        const code = String(p.code || p.accountCode || '').trim();
        if (!code) continue;
        const cached = db.sayanAgingCache[code];
        if (!force && cached && (now - (cached.cachedAt || 0) < CACHE_TTL) && cached.balance === p.balance) {
            results[code] = cached;
        } else {
            toQuery.push({ code, balance: Number(p.balance || 0) });
        }
    }

    // Process in batches of 5 concurrent queries to respect Sayan server capacity
    const BATCH_SIZE = 5;
    for (let i = 0; i < toQuery.length; i += BATCH_SIZE) {
        const chunk = toQuery.slice(i, i + BATCH_SIZE);
        const promises = chunk.map(item => getPartyAgingFromSayan(item.code, item.balance));
        const chunkResults = await Promise.allSettled(promises);

        chunkResults.forEach((res, idx) => {
            const item = chunk[idx];
            if (res.status === 'fulfilled' && res.value) {
                const agingData = { ...res.value, cachedAt: now };
                results[item.code] = agingData;
                db.sayanAgingCache[item.code] = agingData;
            }
        });
    }

    saveDb(db);
    return results;
}
