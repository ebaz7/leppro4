import { executeSayanQuery } from './sayan-order-automation.js';
import { parseDetailNote } from './sayan-remittance-service.js';
import { getDb, saveDb } from './db-manager.js';
import { generatePdfBuffer } from './renderer.js';
import * as jalaali from 'jalaali-js';

/**
 * Enterprise Sayan Sales Invoice Issuance & Customer Bot PDF Service
 * - Lists live Sayan Sales Remittances (OpCode 23 - حواله فروش) as invoice basis (انتخاب مبنا)
 * - Auto-loads customer, warehouse, goods, net weights & carton counts from the remittance
 * - Registers the priced Sales Invoice atomically into Sayan ERP (STR_TBL_010 / STR_TBL_011 / STR_TBL_029)
 * - Renders 2-mode printable HTML & PDF:
 *     1) 'unofficial' (غیر رسمی): With carton counts, WITHOUT 10% VAT
 *     2) 'official'   (رسمی):     With carton counts AND 10% VAT
 * - Publishes invoice automatically for Customer Bot PDF download by customer code (Telegram & Bale)
 */

const GATEWAY_BLOCKED_KEYWORD_REGEX =
    /(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|MERGE|WAITFOR|SHUTDOWN|TABLE|BEGIN|COMMIT|ROLLBACK|SYS\.SQL_MODULES)/gi;

const wrapSqlForSayanGateway = (innerSql) => {
    const CHUNK_SIZE = 1200;
    const lines = ["DECLARE @q NVARCHAR(MAX) = N'';"];
    for (let i = 0; i < innerSql.length; i += CHUNK_SIZE) {
        const rawChunk = innerSql.slice(i, i + CHUNK_SIZE);
        const escapedForOuterLiteral = rawChunk.replace(/'/g, "''");
        const safeOuterLiteral = escapedForOuterLiteral.replace(
            GATEWAY_BLOCKED_KEYWORD_REGEX,
            (match) => `${match.slice(0, 2)}' + N'${match.slice(2)}`
        );
        lines.push(`SET @q = @q + N'${safeOuterLiteral}';`);
    }
    lines.push('EXEC(@q);');
    return lines.join('\n');
};

const sanitizeSqlString = (val, maxLen = 500) => {
    return String(val ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/'/g, "''")
        .trim()
        .slice(0, maxLen);
};

const toPersianDigits = (val) => {
    if (val === undefined || val === null) return '';
    return String(val).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
};

const formatFaNumber = (n, decimals = 0) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return '۰';
    const fixed = decimals > 0 ? Number(num.toFixed(decimals)) : Math.round(num);
    return toPersianDigits(
        fixed.toLocaleString('en-US', {
            minimumFractionDigits: decimals > 0 ? Math.min(2, decimals) : 0,
            maximumFractionDigits: decimals
        })
    );
};

const escapeHtml = (str) => {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const toShamsiDateStr = (dateVal) => {
    if (!dateVal) return '';
    const s = String(dateVal).trim();
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s;
    try {
        const d = new Date(s);
        if (isNaN(d.getTime())) return s;
        const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
        return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
    } catch {
        return s;
    }
};

const parseShamsiOrIsoToSqlDatetime = (dateInput) => {
    const pad = (n) => String(n).padStart(2, '0');
    let d = new Date();
    if (dateInput && typeof dateInput === 'string') {
        const clean = dateInput
            .trim()
            .replace(/[۰-۹]/g, (ch) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)))
            .replace(/[٠-٩]/g, (ch) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)));
        const shamsiMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
        if (shamsiMatch) {
            const y = parseInt(shamsiMatch[1], 10);
            const m = parseInt(shamsiMatch[2], 10);
            const day = parseInt(shamsiMatch[3], 10);
            if (y >= 1300 && y <= 1500) {
                const g = jalaali.toGregorian(y, m, day);
                d = new Date(g.gy, g.gm - 1, g.gd, d.getHours(), d.getMinutes(), d.getSeconds());
            } else {
                const parsed = new Date(clean);
                if (!isNaN(parsed.getTime())) d = parsed;
            }
        } else {
            const parsed = new Date(clean);
            if (!isNaN(parsed.getTime())) d = parsed;
        }
    }
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// Lightweight Persian number-to-words converter for invoice footer (Rials & Tomans)
const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

const chunkToPersianWords = (num) => {
    const parts = [];
    const h = Math.floor(num / 100);
    const rem = num % 100;
    if (h > 0) parts.push(HUNDREDS[h]);
    if (rem >= 10 && rem < 20) {
        parts.push(TEENS[rem - 10]);
    } else {
        const t = Math.floor(rem / 10);
        const o = rem % 10;
        if (t > 0) parts.push(TENS[t]);
        if (o > 0) parts.push(ONES[o]);
    }
    return parts.join(' و ');
};

export const numberToPersianWords = (value) => {
    const n = Math.floor(Math.abs(Number(value) || 0));
    if (n === 0) return 'صفر';
    const chunks = [];
    let tmp = n;
    let scaleIdx = 0;
    while (tmp > 0 && scaleIdx < SCALES.length) {
        const c = tmp % 1000;
        if (c > 0) {
            const w = chunkToPersianWords(c);
            chunks.unshift(SCALES[scaleIdx] ? `${w} ${SCALES[scaleIdx]}` : w);
        }
        tmp = Math.floor(tmp / 1000);
        scaleIdx++;
    }
    return chunks.join(' و ');
};

// Flexible customer code matcher (matches 2756 with 112756, 312756, or leading zeros)
export const matchCustomerCode = (codeA, codeB) => {
    const normalizeRaw = (v) =>
        String(v || '')
            .replace(/[۰-۹]/g, (ch) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)))
            .replace(/[٠-٩]/g, (ch) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
            .trim();
    const variants = (raw) => {
        const set = new Set();
        const r = normalizeRaw(raw);
        if (!r) return set;
        set.add(r);
        const noLead = r.replace(/^0+/, '');
        if (noLead) set.add(noLead);
        if (/^(01|11|21|31)\d{3,}$/.test(r)) {
            const stripped = r.slice(2).replace(/^0+/, '');
            if (stripped) set.add(stripped);
        }
        return set;
    };
    const setA = variants(codeA);
    const setB = variants(codeB);
    if (setA.size === 0 || setB.size === 0) return false;
    for (const v of setA) {
        if (setB.has(v)) return true;
    }
    return false;
};

// Serialize Sayan sales invoice writes to prevent concurrent DocNo/SubNo collisions
let invoiceWriteTail = Promise.resolve();
const withSalesInvoiceWriteLock = async (fn) => {
    const prev = invoiceWriteTail;
    let release;
    invoiceWriteTail = new Promise((resolve) => {
        release = resolve;
    });
    await prev.catch(() => {});
    try {
        return await fn();
    } finally {
        release();
    }
};

// Auto-discover Sayan's live Sales Invoice OpCode, SubSystem & OwnerGuid (cached 10 minutes)
let cachedSalesInvoiceMeta = null;
let cachedSalesInvoiceMetaTs = 0;
const META_CACHE_TTL = 10 * 60 * 1000;

export const discoverLiveSayanSalesInvoiceMeta = async (fiscalYear = '4') => {
    if (cachedSalesInvoiceMeta && Date.now() - cachedSalesInvoiceMetaTs < META_CACHE_TTL) {
        return cachedSalesInvoiceMeta;
    }

    const fallback = {
        opCode: '12',
        subSystem: 2,
        ownerGuid: 'e57cbb1e-c5b0-49b0-a755-b18392a267a9',
        lineOpField36: '12',
        sampleDocNo: null
    };

    try {
        // 1. Check STR_TBL_006 for official "فاکتور فروش" definition
        const opRows = await executeSayanQuery(`
            SELECT TOP 5
                RTRIM(LTRIM(Field_003)) as OpCode,
                RTRIM(LTRIM(Field_004)) as OpTitle,
                ISNULL(Field_018, 2) as SubSystem
            FROM STR_TBL_006 WITH (NOLOCK)
            WHERE Field_004 LIKE N'%فاکتور فروش%'
              AND Field_004 NOT LIKE N'%پیش%'
              AND Field_004 NOT LIKE N'%برگشت%'
              AND Field_004 NOT LIKE N'%مرجوع%'
            ORDER BY Field_001 ASC
        `, 15000).catch(() => []);

        let detectedOpCode = opRows?.[0]?.OpCode || null;
        let detectedSubSystem = opRows?.[0]?.SubSystem ? Number(opRows[0].SubSystem) : null;

        // 2. Inspect latest real Sales Invoice in STR_TBL_010 to verify SubSystem, OpCode & OwnerGuid
        const sampleSql = detectedOpCode
            ? `
                SELECT TOP 1
                    Field_001 as DocId,
                    Field_004 as FiscalYear,
                    Field_005 as ArchiveNo,
                    RTRIM(LTRIM(Field_009)) as OpCode,
                    ISNULL(Field_018, 2) as SubSystem,
                    RTRIM(LTRIM(CAST(Field_020 AS NVARCHAR(100)))) as OwnerGuid
                FROM STR_TBL_010 WITH (NOLOCK)
                WHERE RTRIM(LTRIM(Field_009)) = N'${sanitizeSqlString(detectedOpCode, 10)}'
                ORDER BY CAST(Field_001 AS BIGINT) DESC
            `
            : `
                SELECT TOP 1
                    Field_001 as DocId,
                    Field_004 as FiscalYear,
                    Field_005 as ArchiveNo,
                    RTRIM(LTRIM(Field_009)) as OpCode,
                    ISNULL(Field_018, 2) as SubSystem,
                    RTRIM(LTRIM(CAST(Field_020 AS NVARCHAR(100)))) as OwnerGuid
                FROM STR_TBL_010 WITH (NOLOCK)
                WHERE RTRIM(LTRIM(Field_009)) IN ('12', '3') AND Field_018 IN (2, 3)
                ORDER BY CAST(Field_001 AS BIGINT) DESC
            `;
        const sampleRows = await executeSayanQuery(sampleSql, 15000).catch(() => []);
        const sample = sampleRows?.[0] || null;

        const finalOpCode = String(sample?.OpCode || detectedOpCode || fallback.opCode).trim();
        const finalSubSystem = Number(sample?.SubSystem || detectedSubSystem || fallback.subSystem) || 2;
        const finalOwnerGuid =
            sample?.OwnerGuid && String(sample.OwnerGuid).trim().length >= 8
                ? String(sample.OwnerGuid).trim()
                : fallback.ownerGuid;

        // 3. Check how STR_TBL_011.Field_036 is populated on that real Sales Invoice
        let lineOpField36 = finalOpCode;
        if (sample?.ArchiveNo && sample?.FiscalYear) {
            const lineSample = await executeSayanQuery(`
                SELECT TOP 1 RTRIM(LTRIM(ISNULL(Field_036, ''))) as F36
                FROM STR_TBL_011 WITH (NOLOCK)
                WHERE Field_003 = ${Number(sample.FiscalYear) || Number(fiscalYear) || 4}
                  AND Field_004 = ${Number(sample.ArchiveNo)}
                  AND Field_012 = ${finalSubSystem}
            `, 12000).catch(() => []);
            if (lineSample?.[0]?.F36) {
                lineOpField36 = String(lineSample[0].F36).trim();
            }
        }

        cachedSalesInvoiceMeta = {
            opCode: finalOpCode,
            subSystem: finalSubSystem,
            ownerGuid: finalOwnerGuid,
            lineOpField36,
            sampleDocNo: sample?.ArchiveNo || null
        };
        cachedSalesInvoiceMetaTs = Date.now();
        return cachedSalesInvoiceMeta;
    } catch (err) {
        console.warn('[SayanSalesInvoice] Metadata discovery fallback used:', err.message);
        return fallback;
    }
};

/**
 * 1. Fetch Sales Remittances (OpCode 23 - حواله فروش) available as basis for Sales Invoices
 */
export const getPendingSalesRemittancesForInvoicing = async ({
    fiscalYear = '4',
    search = '',
    status = 'all',
    limit = 120
} = {}) => {
    const fyNum = parseInt(String(fiscalYear || '4').trim(), 10) || 4;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 120, 10), 300);
    const searchClean = sanitizeSqlString(search, 80);

    const searchWhere = searchClean
        ? `AND (
            CAST(t10.Field_005 AS NVARCHAR(30)) LIKE N'%${searchClean}%'
            OR CAST(t10.Field_006 AS NVARCHAR(30)) LIKE N'%${searchClean}%'
            OR ISNULL(CAST(t10.Field_007 AS NVARCHAR(50)), '') LIKE N'%${searchClean}%'
            OR RTRIM(LTRIM(ISNULL(t10.Field_010, ''))) LIKE N'%${searchClean}%'
            OR ISNULL(act.Field_006, '') LIKE N'%${searchClean}%'
            OR ISNULL(g01.Field_006, '') LIKE N'%${searchClean}%'
            OR ISNULL(g01.Field_007, '') LIKE N'%${searchClean}%'
            OR ISNULL(t10.Field_029, '') LIKE N'%${searchClean}%'
        )`
        : '';

    const remSql = `
        SELECT TOP ${safeLimit}
            t10.Field_001 as DocId,
            t10.Field_004 as FiscalYear,
            t10.Field_005 as ArchiveNo,
            t10.Field_006 as RemittanceNo,
            ISNULL(t10.Field_007, '') as SubCode,
            t10.Field_008 as DocDate,
            RTRIM(LTRIM(ISNULL(t10.Field_009, ''))) as OpCode,
            RTRIM(LTRIM(ISNULL(t10.Field_010, ''))) as CustomerCode,
            RTRIM(LTRIM(ISNULL(t10.Field_011, ''))) as WarehouseCode,
            ISNULL(t10.Field_029, '') as Description,
            COALESCE(
                NULLIF(RTRIM(LTRIM(act.Field_006)), ''),
                NULLIF(RTRIM(LTRIM(COALESCE(g01.Field_006, '') + ' ' + COALESCE(g01.Field_007, ''))), ''),
                RTRIM(LTRIM(ISNULL(t10.Field_010, '')))
            ) as CustomerName,
            ISNULL(RTRIM(LTRIM(w.Field_004)), '') as WarehouseName
        FROM STR_TBL_010 t10 WITH (NOLOCK)
        LEFT JOIN (
            SELECT Field_005, MIN(Field_006) as Field_006
            FROM ACT_TBL_007 WITH (NOLOCK)
            WHERE Field_005 IS NOT NULL AND Field_006 IS NOT NULL AND LEN(RTRIM(LTRIM(Field_006))) > 0
            GROUP BY Field_005
        ) act ON RTRIM(LTRIM(act.Field_005)) = RTRIM(LTRIM(t10.Field_010))
        LEFT JOIN GNR_TBL_001 g01 WITH (NOLOCK) ON RTRIM(LTRIM(g01.Field_003)) = RTRIM(LTRIM(t10.Field_010))
        LEFT JOIN STR_TBL_001 w WITH (NOLOCK) ON RTRIM(LTRIM(w.Field_003)) = RTRIM(LTRIM(t10.Field_011))
        WHERE t10.Field_004 = ${fyNum}
          AND t10.Field_018 = 1
          AND RTRIM(LTRIM(t10.Field_009)) = '23'
          ${searchWhere}
        ORDER BY t10.Field_008 DESC, CAST(t10.Field_005 AS BIGINT) DESC
    `;

    const remRows = await executeSayanQuery(remSql, 45000);
    if (!Array.isArray(remRows) || remRows.length === 0) {
        return [];
    }

    const archiveNos = remRows
        .map((r) => Number(r.ArchiveNo))
        .filter((n) => Number.isFinite(n) && n > 0);
    const docIds = remRows
        .map((r) => Number(r.DocId))
        .filter((n) => Number.isFinite(n) && n > 0);

    // Parallel batch lookups: line stats + already-invoiced detection (Sayan STR_TBL_011 links & STR_TBL_029)
    const [lineStatsRows, linkedLineRows, linkedDocRows] = await Promise.all([
        archiveNos.length > 0
            ? executeSayanQuery(`
                SELECT
                    Field_004 as ArchiveNo,
                    COUNT(*) as LineCount,
                    ISNULL(SUM(CAST(ISNULL(Field_006, 0) AS FLOAT)), 0) as TotalNetWeight
                FROM STR_TBL_011 WITH (NOLOCK)
                WHERE Field_003 = ${fyNum}
                  AND Field_012 = 1
                  AND Field_004 IN (${archiveNos.join(',')})
                GROUP BY Field_004
            `, 30000).catch(() => [])
            : Promise.resolve([]),
        archiveNos.length > 0
            ? executeSayanQuery(`
                SELECT DISTINCT
                    rem.Field_004 as RemArchiveNo,
                    inv.Field_004 as InvArchiveNo,
                    invH.Field_006 as InvDocNo
                FROM STR_TBL_011 rem WITH (NOLOCK)
                INNER JOIN STR_TBL_011 inv WITH (NOLOCK)
                    ON (inv.Field_018 = rem.Field_001 OR inv.Field_008 = rem.Field_001)
                   AND inv.Field_012 IN (2, 3)
                LEFT JOIN STR_TBL_010 invH WITH (NOLOCK)
                    ON invH.Field_004 = inv.Field_003
                   AND invH.Field_005 = inv.Field_004
                   AND invH.Field_018 = inv.Field_012
                WHERE rem.Field_003 = ${fyNum}
                  AND rem.Field_012 = 1
                  AND rem.Field_004 IN (${archiveNos.join(',')})
            `, 30000).catch(() => [])
            : Promise.resolve([]),
        docIds.length > 0
            ? executeSayanQuery(`
                SELECT
                    Field_003 as BaseDocId,
                    Field_009 as TargetDocId
                FROM STR_TBL_029 WITH (NOLOCK)
                WHERE Field_004 = ${fyNum}
                  AND Field_003 IN (${docIds.join(',')})
                  AND Field_009 > 0
            `, 20000).catch(() => [])
            : Promise.resolve([])
    ]);

    const statsByArchive = new Map();
    for (const s of lineStatsRows || []) {
        statsByArchive.set(String(s.ArchiveNo), {
            lineCount: Number(s.LineCount) || 0,
            totalNetWeight: Number((Number(s.TotalNetWeight) || 0).toFixed(2))
        });
    }

    const sayanInvoicedByArchive = new Map();
    for (const lk of linkedLineRows || []) {
        sayanInvoicedByArchive.set(String(lk.RemArchiveNo), {
            invoiceArchiveNo: String(lk.InvArchiveNo || ''),
            invoiceNo: String(lk.InvDocNo || lk.InvArchiveNo || '')
        });
    }
    const sayanInvoicedByDocId = new Set(
        (linkedDocRows || []).map((r) => String(r.BaseDocId))
    );

    // Also inspect local archive of issued invoices
    const db = getDb();
    const localArchive = Array.isArray(db.sayanSalesInvoicesArchive) ? db.sayanSalesInvoicesArchive : [];
    const localByBaseArchive = new Map();
    for (const inv of localArchive) {
        if (inv?.baseRemittanceArchiveNo && String(inv.fiscalYear || '4') === String(fyNum)) {
            localByBaseArchive.set(String(inv.baseRemittanceArchiveNo), inv);
        }
    }

    let mapped = remRows.map((r) => {
        const archiveKey = String(r.ArchiveNo || '');
        const stats = statsByArchive.get(archiveKey) || { lineCount: 0, totalNetWeight: 0 };
        const sayanInv = sayanInvoicedByArchive.get(archiveKey) || null;
        const localInv = localByBaseArchive.get(archiveKey) || null;
        const isInvoiced = Boolean(sayanInv || localInv || sayanInvoicedByDocId.has(String(r.DocId)));

        return {
            docId: String(r.DocId || ''),
            fiscalYear: String(r.FiscalYear || fyNum),
            archiveNo: archiveKey,
            remittanceNo: String(r.RemittanceNo || archiveKey),
            subCode: String(r.SubCode || '').trim(),
            docDate: r.DocDate,
            shamsiDate: toShamsiDateStr(r.DocDate),
            opCode: String(r.OpCode || '23').trim(),
            customerCode: String(r.CustomerCode || '').trim(),
            customerName: String(r.CustomerName || r.CustomerCode || 'مشتری نامشخص').trim(),
            warehouseCode: String(r.WarehouseCode || '').trim(),
            warehouseName: String(r.WarehouseName || (r.WarehouseCode ? `انبار ${r.WarehouseCode}` : '-')).trim(),
            description: String(r.Description || '').trim(),
            lineCount: stats.lineCount,
            totalNetWeight: stats.totalNetWeight,
            isInvoiced,
            linkedInvoiceId: localInv?.id || null,
            linkedInvoiceNo: localInv?.invoiceNo || sayanInv?.invoiceNo || null,
            linkedInvoiceType: localInv?.invoiceType || null
        };
    });

    if (status === 'pending') {
        mapped = mapped.filter((m) => !m.isInvoiced);
    } else if (status === 'invoiced') {
        mapped = mapped.filter((m) => m.isInvoiced);
    }

    return mapped;
};

/**
 * 2. Fetch full lines & customer metadata for a chosen Sales Remittance (مبنا - OpCode 23)
 * Auto-groups identical goods while preserving all underlying remittance line IDs & carton counts.
 */
export const getRemittanceLinesForInvoice = async (archiveCode, fiscalYear = '4') => {
    const fyNum = parseInt(String(fiscalYear || '4').trim(), 10) || 4;
    const archNum = parseInt(String(archiveCode || '').trim(), 10);
    if (!Number.isFinite(archNum) || archNum <= 0) {
        throw new Error('کد بایگانی حواله فروش معتبر نیست.');
    }

    const headerSql = `
        SELECT TOP 1
            t10.Field_001 as DocId,
            t10.Field_004 as FiscalYear,
            t10.Field_005 as ArchiveNo,
            t10.Field_006 as RemittanceNo,
            ISNULL(t10.Field_007, '') as SubCode,
            t10.Field_008 as DocDate,
            RTRIM(LTRIM(ISNULL(t10.Field_010, ''))) as CustomerCode,
            RTRIM(LTRIM(ISNULL(t10.Field_011, ''))) as WarehouseCode,
            ISNULL(t10.Field_029, '') as Description,
            COALESCE(
                NULLIF(RTRIM(LTRIM(act.Field_006)), ''),
                NULLIF(RTRIM(LTRIM(COALESCE(g01.Field_006, '') + ' ' + COALESCE(g01.Field_007, ''))), ''),
                RTRIM(LTRIM(ISNULL(t10.Field_010, '')))
            ) as CustomerName,
            RTRIM(LTRIM(ISNULL(g01.Field_009, ''))) as CustomerNationalCode,
            RTRIM(LTRIM(ISNULL(g01.Field_015, ''))) as CustomerMobile,
            RTRIM(LTRIM(ISNULL(g01.Field_013, ''))) as CustomerAddress,
            RTRIM(LTRIM(ISNULL(act.Field_003, ''))) as CustomerTafsiliCode,
            ISNULL(RTRIM(LTRIM(w.Field_004)), '') as WarehouseName
        FROM STR_TBL_010 t10 WITH (NOLOCK)
        LEFT JOIN (
            SELECT Field_005, MIN(Field_006) as Field_006, MIN(Field_003) as Field_003
            FROM ACT_TBL_007 WITH (NOLOCK)
            WHERE Field_005 IS NOT NULL AND Field_006 IS NOT NULL AND LEN(RTRIM(LTRIM(Field_006))) > 0
            GROUP BY Field_005
        ) act ON RTRIM(LTRIM(act.Field_005)) = RTRIM(LTRIM(t10.Field_010))
        LEFT JOIN GNR_TBL_001 g01 WITH (NOLOCK) ON RTRIM(LTRIM(g01.Field_003)) = RTRIM(LTRIM(t10.Field_010))
        LEFT JOIN STR_TBL_001 w WITH (NOLOCK) ON RTRIM(LTRIM(w.Field_003)) = RTRIM(LTRIM(t10.Field_011))
        WHERE t10.Field_004 = ${fyNum}
          AND t10.Field_018 = 1
          AND RTRIM(LTRIM(t10.Field_009)) = '23'
          AND t10.Field_005 = ${archNum}
    `;

    const linesSql = `
        SELECT
            t11.Field_001 as RowId,
            t11.Field_034 as RowNo,
            RTRIM(LTRIM(ISNULL(t11.Field_005, ''))) as ItemCode,
            ISNULL(CAST(t11.Field_006 AS FLOAT), 0) as Quantity,
            RTRIM(LTRIM(ISNULL(t11.Field_028, ''))) as BatchCode,
            ISNULL(t11.Field_031, '') as SpecNote,
            RTRIM(LTRIM(ISNULL(t11.Field_036, '12'))) as UnitCode,
            ISNULL(t11.Field_037, '') as WareUnitId,
            COALESCE(
                NULLIF(RTRIM(LTRIM(t22.Field_004)), ''),
                NULLIF(RTRIM(LTRIM(g03.Field_008)), ''),
                ''
            ) as DirectItemName
        FROM STR_TBL_011 t11 WITH (NOLOCK)
        LEFT JOIN IND_TBL_022 t22 WITH (NOLOCK) ON RTRIM(LTRIM(t22.Field_005)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN GNR_TBL_003 g03 WITH (NOLOCK) ON RTRIM(LTRIM(g03.Field_003)) = RTRIM(LTRIM(t11.Field_005))
        WHERE t11.Field_003 = ${fyNum}
          AND t11.Field_004 = ${archNum}
          AND t11.Field_012 = 1
        ORDER BY CAST(t11.Field_001 AS BIGINT) ASC
    `;

    const cartonParamsSql = `
        SELECT
            Field_005 as RowId,
            Field_006 as ParamId,
            Field_007 as ParamVal
        FROM STR_TBL_009 WITH (NOLOCK)
        WHERE Field_003 = ${fyNum}
          AND Field_004 = ${archNum}
          AND Field_008 = 1
          AND Field_006 IN ('272', '271', '275', '273', '274')
    `;

    const [headerRows, lineRows, paramRows] = await Promise.all([
        executeSayanQuery(headerSql, 30000),
        executeSayanQuery(linesSql, 30000),
        executeSayanQuery(cartonParamsSql, 20000).catch(() => [])
    ]);

    if (!headerRows || headerRows.length === 0) {
        throw new Error(`حواله فروش با کد بایگانی ${archNum} در سال مالی ${fyNum} یافت نشد.`);
    }
    const h = headerRows[0];

    // Map STR_TBL_009 params per line
    const paramsByRow = new Map();
    for (const p of paramRows || []) {
        const rid = String(p.RowId);
        if (!paramsByRow.has(rid)) paramsByRow.set(rid, {});
        paramsByRow.get(rid)[String(p.ParamId)] = String(p.ParamVal || '').trim();
    }

    // Resolve item names from IND_TBL_021 -> IND_TBL_002 for any missing DirectItemName + last unit price hints
    const distinctCodes = Array.from(
        new Set((lineRows || []).map((r) => String(r.ItemCode || '').trim()).filter(Boolean))
    );
    const indNameMap = new Map();
    const lastPriceMap = new Map();

    if (distinctCodes.length > 0) {
        const inClause = distinctCodes.map((c) => `N'${sanitizeSqlString(c, 50)}'`).join(', ');
        const [indNames, lastPrices] = await Promise.all([
            executeSayanQuery(`
                SELECT
                    RTRIM(LTRIM(t21.Field_004)) as ItemCode,
                    MIN(t02.Field_003) as ItemName
                FROM IND_TBL_021 t21 WITH (NOLOCK)
                LEFT JOIN IND_TBL_002 t02 WITH (NOLOCK) ON RTRIM(LTRIM(t21.Field_003)) = RTRIM(LTRIM(t02.Field_008))
                WHERE RTRIM(LTRIM(t21.Field_004)) IN (${inClause})
                GROUP BY RTRIM(LTRIM(t21.Field_004))
            `, 20000).catch(() => []),
            executeSayanQuery(`
                SELECT TOP 80
                    RTRIM(LTRIM(t11.Field_005)) as ItemCode,
                    CAST(ISNULL(t11.Field_006, 0) AS FLOAT) as Qty,
                    CAST(ISNULL(t11.Field_007, 0) AS FLOAT) as Amt
                FROM STR_TBL_011 t11 WITH (NOLOCK)
                INNER JOIN STR_TBL_010 t10 WITH (NOLOCK)
                    ON t10.Field_004 = t11.Field_003
                   AND t10.Field_005 = t11.Field_004
                   AND t10.Field_018 = t11.Field_012
                WHERE RTRIM(LTRIM(t11.Field_005)) IN (${inClause})
                  AND RTRIM(LTRIM(t10.Field_009)) IN ('12', '3')
                  AND ISNULL(t11.Field_006, 0) > 0
                  AND ISNULL(t11.Field_007, 0) > 0
                ORDER BY CAST(t11.Field_001 AS BIGINT) DESC
            `, 20000).catch(() => [])
        ]);

        for (const row of indNames || []) {
            if (row.ItemCode && row.ItemName) {
                indNameMap.set(String(row.ItemCode).trim(), String(row.ItemName).trim());
            }
        }
        for (const lp of lastPrices || []) {
            const ic = String(lp.ItemCode || '').trim();
            if (!ic || lastPriceMap.has(ic)) continue;
            const qty = Number(lp.Qty) || 0;
            const amt = Number(lp.Amt) || 0;
            if (qty > 0 && amt > 0) {
                lastPriceMap.set(ic, Math.round(amt / qty));
            }
        }
    }

    // Parse raw lines
    const rawLines = (lineRows || []).map((r, idx) => {
        const parsedNote = parseDetailNote(r.SpecNote || '');
        const pMap = paramsByRow.get(String(r.RowId)) || {};
        const cartons = parseInt(pMap['272'], 10) || parsedNote.cartonCount || 1;
        const bobbins = parseInt(pMap['271'], 10) || parsedNote.bobbinCount || 0;
        const grossWeight = parseFloat(pMap['275']) || parsedNote.grossWeight || 0;
        const itemCode = String(r.ItemCode || '').trim();
        const itemName = String(r.DirectItemName || '').trim() || indNameMap.get(itemCode) || itemCode || 'کالای بدون نام';
        const netWeight = Number((Number(r.Quantity) || 0).toFixed(3));

        return {
            rowId: String(r.RowId),
            rowNo: Number(r.RowNo) || idx + 1,
            itemCode,
            itemName,
            netWeight,
            grossWeight: Number((grossWeight || 0).toFixed(2)),
            cartonCount: cartons > 0 ? cartons : 1,
            bobbinCount: bobbins,
            grade: parsedNote.grade || '',
            twistDirection: parsedNote.twistDirection || '',
            batchCode: String(r.BatchCode || '').trim(),
            unitCode: String(r.UnitCode || '12').trim(),
            wareUnitId: String(r.WareUnitId || '').trim(),
            specNote: String(r.SpecNote || '').trim()
        };
    });

    // Group lines by itemCode (standard invoice view: 1 line per distinct good with total cartons & total net weight)
    const groupedMap = new Map();
    for (const line of rawLines) {
        const key = line.itemCode;
        if (!groupedMap.has(key)) {
            groupedMap.set(key, {
                itemCode: line.itemCode,
                itemName: line.itemName,
                unitName: 'کیلوگرم',
                unitCode: line.unitCode,
                wareUnitId: line.wareUnitId,
                netWeight: 0,
                grossWeight: 0,
                cartonCount: 0,
                bobbinCount: 0,
                grade: line.grade,
                suggestedUnitPrice: lastPriceMap.get(line.itemCode) || 0,
                unitPrice: 0,
                discount: 0,
                note: '',
                sourceRowIds: []
            });
        }
        const g = groupedMap.get(key);
        g.netWeight = Number((g.netWeight + line.netWeight).toFixed(3));
        g.grossWeight = Number((g.grossWeight + line.grossWeight).toFixed(2));
        g.cartonCount += line.cartonCount;
        g.bobbinCount += line.bobbinCount;
        g.sourceRowIds.push(line.rowId);
    }

    const groupedItems = Array.from(groupedMap.values());

    return {
        remittance: {
            docId: String(h.DocId || ''),
            fiscalYear: String(h.FiscalYear || fyNum),
            archiveNo: String(h.ArchiveNo || archNum),
            remittanceNo: String(h.RemittanceNo || archNum),
            subCode: String(h.SubCode || '').trim(),
            docDate: h.DocDate,
            shamsiDate: toShamsiDateStr(h.DocDate),
            customerCode: String(h.CustomerCode || '').trim(),
            customerTafsiliCode: String(h.CustomerTafsiliCode || '').trim(),
            customerName: String(h.CustomerName || h.CustomerCode || 'مشتری نامشخص').trim(),
            customerNationalCode: String(h.CustomerNationalCode || '').trim(),
            customerMobile: String(h.CustomerMobile || '').trim(),
            customerAddress: String(h.CustomerAddress || '').trim(),
            warehouseCode: String(h.WarehouseCode || '').trim(),
            warehouseName: String(h.WarehouseName || '').trim(),
            description: String(h.Description || '').trim()
        },
        groupedItems,
        rawLinesCount: rawLines.length,
        totalCartons: groupedItems.reduce((s, it) => s + it.cartonCount, 0),
        totalNetWeight: Number(groupedItems.reduce((s, it) => s + it.netWeight, 0).toFixed(3))
    };
};

/**
 * 3. Build Attractive Standalone HTML for Sales Invoice Print & PDF
 * Supports TWO exact modes:
 *   - 'unofficial' (غیر رسمی): Displays Carton Count + Net Weight + Unit Price + Total, WITHOUT 10% VAT
 *   - 'official'   (رسمی):     Displays Carton Count + Net Weight + Unit Price + Total + 10% VAT
 */
export const buildSalesInvoicePrintHtml = (invoice, overrideMode = null) => {
    const mode = overrideMode === 'official' || overrideMode === 'unofficial'
        ? overrideMode
        : (invoice.invoiceType === 'official' ? 'official' : 'unofficial');
    const isOfficial = mode === 'official';

    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const computedItems = items.map((it, idx) => {
        const qty = Number(it.netWeight ?? it.quantity ?? 0) || 0;
        const cartons = Math.max(0, Math.round(Number(it.cartonCount) || 0));
        const storedUnit = Math.max(0, Math.round(Number(it.unitPrice) || 0));
        const storedVatPerUnit = Math.max(0, Math.round(Number(it.vatPerUnit) || 0));
        const baseUnitPrice =
            Number(it.baseUnitPrice) > 0
                ? Math.round(Number(it.baseUnitPrice))
                : invoice.invoiceType === 'official' && storedVatPerUnit > 0
                    ? Math.max(0, storedUnit - storedVatPerUnit)
                    : storedUnit;
        const effectiveUnitPrice = isOfficial ? Math.round(baseUnitPrice * 1.10) : baseUnitPrice;
        const vatPerUnit = isOfficial ? Math.max(0, effectiveUnitPrice - baseUnitPrice) : 0;
        const baseAmount = Math.round(qty * baseUnitPrice);
        const discount = Math.max(0, Math.round(Number(it.discount) || 0));
        const afterDiscount = Math.max(0, baseAmount - discount);
        const grossWithVat = isOfficial ? Math.round(qty * effectiveUnitPrice) : baseAmount;
        const lineTotal = Math.max(0, grossWithVat - discount);
        const vat = isOfficial ? Math.max(0, lineTotal - afterDiscount) : 0;
        return {
            seq: idx + 1,
            itemCode: String(it.itemCode || ''),
            itemName: String(it.itemName || 'کالا'),
            cartonCount: cartons,
            netWeight: qty,
            unitName: String(it.unitName || 'کیلوگرم'),
            baseUnitPrice,
            vatPerUnit,
            unitPrice: effectiveUnitPrice,
            rawAmount: baseAmount,
            discount,
            afterDiscount,
            vat,
            lineTotal,
            note: String(it.note || '').trim()
        };
    });

    const totalCartons = computedItems.reduce((s, x) => s + x.cartonCount, 0);
    const totalWeight = Number(computedItems.reduce((s, x) => s + x.netWeight, 0).toFixed(2));
    const subtotal = computedItems.reduce((s, x) => s + x.rawAmount, 0);
    const totalDiscount = computedItems.reduce((s, x) => s + x.discount, 0);
    const totalAfterDiscount = Math.max(0, subtotal - totalDiscount);
    const totalVat = isOfficial ? computedItems.reduce((s, x) => s + x.vat, 0) : 0;
    const grandTotal = computedItems.reduce((s, x) => s + x.lineTotal, 0);

    const rialWords = `${numberToPersianWords(grandTotal)} ریال`;
    const tomanWords = `${numberToPersianWords(Math.floor(grandTotal / 10))} تومان`;

    const sellerName = invoice.sellerName || 'شرکت تولیدی و صنعتی لپان بافت';
    const sellerSubTitle = isOfficial ? 'صورتحساب رسمی فروش کالا و خدمات' : 'فاکتور فروش کالا';
    const sellerBadge = isOfficial ? 'رسمی (با ۱۰٪ افزوده بر فی و ارزش افزوده)' : 'غیر رسمی (بدون ارزش افزوده)';
    const accentPrimary = isOfficial ? '#0f172a' : '#1e3a5f';
    const accentSoft = isOfficial ? '#eef2ff' : '#ecfdf5';
    const accentBorder = isOfficial ? '#312e81' : '#047857';
    const accentText = isOfficial ? '#1e1b4b' : '#065f46';

    const rowsHtml = computedItems
        .map(
            (row, idx) => `
            <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td class="c-center c-bold">${toPersianDigits(row.seq)}</td>
                <td class="c-mono c-center">${escapeHtml(toPersianDigits(row.itemCode))}</td>
                <td class="c-right c-bold">
                    ${escapeHtml(row.itemName)}
                    ${row.note ? `<div class="sub-note">${escapeHtml(row.note)}</div>` : ''}
                </td>
                <td class="c-center c-bold c-carton">${formatFaNumber(row.cartonCount)}</td>
                <td class="c-center c-mono c-bold">${formatFaNumber(row.netWeight, 2)}</td>
                <td class="c-left c-mono">
                    <div class="c-bold">${formatFaNumber(row.unitPrice)}</div>
                    ${isOfficial ? `<div class="sub-note">پایه: ${formatFaNumber(row.baseUnitPrice)}</div>` : ''}
                </td>
                ${totalDiscount > 0 ? `<td class="c-left c-mono">${formatFaNumber(row.discount)}</td>` : ''}
                <td class="c-left c-mono c-bold">${formatFaNumber(row.afterDiscount)}</td>
                ${isOfficial ? `<td class="c-left c-mono c-vat">${formatFaNumber(row.vat)}</td>` : ''}
                <td class="c-left c-mono c-bold c-total">${formatFaNumber(row.lineTotal)}</td>
            </tr>
        `
        )
        .join('');

    const invoiceNoDisplay = toPersianDigits(invoice.invoiceNo || invoice.archiveNo || invoice.id || '-');
    const archiveNoDisplay = toPersianDigits(invoice.archiveNo || '-');
    const baseRemDisplay = toPersianDigits(invoice.baseRemittanceNo || invoice.baseRemittanceArchiveNo || '-');
    const dateDisplay = toPersianDigits(invoice.shamsiDate || toShamsiDateStr(invoice.createdAt));

    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>فاکتور فروش شماره ${escapeHtml(invoice.invoiceNo || invoice.id || '')} - ${escapeHtml(invoice.customerName || '')}</title>
<style>
    @page {
        size: A4 portrait;
        margin: 8mm 9mm;
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
        color: #0f172a !important;
        font-family: 'Vazirmatn', Tahoma, 'Segoe UI', Arial, sans-serif;
        direction: rtl;
        font-size: 11px;
        line-height: 1.55;
    }
    .invoice-sheet {
        width: 100%;
        max-width: 194mm;
        margin: 0 auto;
        border: 1.8px solid ${accentPrimary};
        border-radius: 10px;
        overflow: hidden;
        background: #ffffff;
    }
    .inv-header {
        background: linear-gradient(135deg, ${accentPrimary} 0%, #1e293b 100%);
        color: #ffffff;
        padding: 14px 18px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
    }
    .inv-brand h1 {
        margin: 0;
        font-size: 17px;
        font-weight: 900;
        letter-spacing: -0.2px;
    }
    .inv-brand p {
        margin: 3px 0 0;
        font-size: 10.5px;
        opacity: 0.88;
    }
    .inv-title-box {
        text-align: center;
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 8px;
        padding: 7px 16px;
    }
    .inv-title-box .main-title {
        font-size: 14.5px;
        font-weight: 900;
    }
    .inv-title-box .sub-badge {
        margin-top: 3px;
        font-size: 9.5px;
        font-weight: 700;
        color: #fde68a;
    }
    .inv-meta {
        text-align: left;
        font-size: 10.5px;
        line-height: 1.7;
        background: rgba(255,255,255,0.1);
        padding: 6px 11px;
        border-radius: 8px;
        min-width: 155px;
    }
    .inv-meta strong {
        color: #ffffff;
        font-weight: 900;
    }
    .parties-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 12px 16px 8px;
        background: #f8fafc;
        border-bottom: 1.5px solid #cbd5e1;
    }
    .party-card {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-right: 4px solid ${accentBorder};
        border-radius: 8px;
        padding: 8px 12px;
    }
    .party-card .party-head {
        font-size: 10px;
        font-weight: 900;
        color: ${accentText};
        margin-bottom: 4px;
        border-bottom: 1px dashed #e2e8f0;
        padding-bottom: 3px;
    }
    .party-row {
        font-size: 10.5px;
        margin-top: 2px;
        color: #334155;
    }
    .party-row strong {
        color: #0f172a;
        font-weight: 800;
    }
    .table-wrap {
        padding: 10px 16px;
    }
    table.items-tbl {
        width: 100%;
        border-collapse: collapse;
        border: 1.5px solid #334155;
        font-size: 10.5px;
    }
    table.items-tbl thead tr {
        background: ${accentSoft};
        color: ${accentPrimary};
        border-bottom: 1.5px solid #334155;
    }
    table.items-tbl th {
        padding: 7px 6px;
        font-weight: 900;
        border-left: 1px solid #94a3b8;
        text-align: center;
        white-space: nowrap;
    }
    table.items-tbl th:last-child,
    table.items-tbl td:last-child {
        border-left: none;
    }
    table.items-tbl td {
        padding: 6px 6px;
        border-left: 1px solid #cbd5e1;
        border-bottom: 1px solid #cbd5e1;
        vertical-align: middle;
    }
    .c-center { text-align: center; }
    .c-right { text-align: right; }
    .c-left { text-align: left; direction: ltr; }
    .c-bold { font-weight: 800; }
    .c-mono { font-variant-numeric: tabular-nums; }
    .c-carton {
        background: #fffbeb;
        color: #92400e;
        font-size: 11px;
    }
    .c-vat {
        color: #4338ca;
        font-weight: 700;
    }
    .c-total {
        color: #0f172a;
        background: #f1f5f9;
    }
    .sub-note {
        font-size: 9px;
        color: #64748b;
        font-weight: 500;
        margin-top: 2px;
    }
    .summary-section {
        display: grid;
        grid-template-columns: 1.25fr 1fr;
        gap: 12px;
        padding: 4px 16px 12px;
    }
    .words-box {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    }
    .words-box .w-label {
        font-size: 10px;
        color: #475569;
        font-weight: 700;
    }
    .words-box .w-val {
        font-size: 11.5px;
        font-weight: 900;
        color: #0f172a;
        margin-top: 3px;
    }
    .words-box .w-toman {
        font-size: 10px;
        color: #047857;
        font-weight: 700;
        margin-top: 2px;
    }
    .words-box .meta-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px dashed #cbd5e1;
    }
    .meta-pill {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 3px 8px;
        font-size: 10px;
        font-weight: 800;
    }
    .totals-box {
        border: 1.5px solid ${accentPrimary};
        border-radius: 8px;
        overflow: hidden;
    }
    .tot-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 10px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 10.5px;
    }
    .tot-row.vat-row {
        background: #eef2ff;
        color: #312e81;
        font-weight: 800;
    }
    .tot-row.grand-row {
        background: ${accentPrimary};
        color: #ffffff;
        font-size: 12.5px;
        font-weight: 900;
        border-bottom: none;
        padding: 8px 10px;
    }
    .notes-strip {
        margin: 0 16px 10px;
        padding: 7px 10px;
        background: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: 6px;
        font-size: 10px;
        color: #78350f;
    }
    .signatures {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        padding: 8px 16px 14px;
    }
    .sig-box {
        border: 1px solid #94a3b8;
        border-radius: 8px;
        height: 62px;
        padding: 6px 10px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        background: #ffffff;
    }
    .sig-box .sig-title {
        font-size: 10px;
        font-weight: 900;
        color: #334155;
    }
    .sig-box .sig-sub {
        font-size: 9px;
        color: #64748b;
        text-align: left;
    }
    .inv-footer {
        background: #f1f5f9;
        border-top: 1px solid #cbd5e1;
        padding: 6px 16px;
        display: flex;
        justify-content: space-between;
        font-size: 9px;
        color: #475569;
    }
</style>
</head>
<body>
<div class="invoice-sheet">
    <div class="inv-header">
        <div class="inv-brand">
            <h1>${escapeHtml(sellerName)}</h1>
            <p>واحد فروش و بازرگانی • متصل به سامانه حسابداری سایان</p>
        </div>
        <div class="inv-title-box">
            <div class="main-title">${escapeHtml(sellerSubTitle)}</div>
            <div class="sub-badge">${escapeHtml(sellerBadge)}</div>
        </div>
        <div class="inv-meta">
            <div>شماره فاکتور: <strong>#${invoiceNoDisplay}</strong></div>
            <div>کد بایگانی سایان: <strong>${archiveNoDisplay}</strong></div>
            <div>مبنا (حواله فروش): <strong>#${baseRemDisplay}</strong></div>
            <div>تاریخ صدور: <strong>${dateDisplay}</strong></div>
        </div>
    </div>

    <div class="parties-grid">
        <div class="party-card">
            <div class="party-head">مشخصات فروشنده</div>
            <div class="party-row">نام شرکت: <strong>${escapeHtml(sellerName)}</strong></div>
            <div class="party-row">انبار مبدا: <strong>${escapeHtml(invoice.warehouseName || invoice.warehouseCode || 'انبار کارخانه')}</strong></div>
            <div class="party-row">سال مالی سایان: <strong>${toPersianDigits(invoice.fiscalYearLabel || '۱۴۰۵')}</strong></div>
        </div>
        <div class="party-card">
            <div class="party-head">مشخصات خریدار (مشتری)</div>
            <div class="party-row">نام خریدار: <strong>${escapeHtml(invoice.customerName || '-')}</strong></div>
            <div class="party-row">کد مشتری: <strong>${toPersianDigits(invoice.customerCode || '-')}</strong> ${invoice.customerNationalCode ? ` | کد/شناسه ملی: <strong>${toPersianDigits(invoice.customerNationalCode)}</strong>` : ''}</div>
            <div class="party-row">${invoice.customerMobile ? `تلفن: <strong>${toPersianDigits(invoice.customerMobile)}</strong>` : ''}${invoice.customerAddress ? ` | نشانی: ${escapeHtml(invoice.customerAddress)}` : (!invoice.customerMobile ? 'طرف حساب ثبت‌شده در سامانه سایان' : '')}</div>
        </div>
    </div>

    <div class="table-wrap">
        <table class="items-tbl">
            <thead>
                <tr>
                    <th style="width: 32px;">ردیف</th>
                    <th style="width: 82px;">کد کالا</th>
                    <th>شرح کالا</th>
                    <th style="width: 66px;">تعداد کارتن</th>
                    <th style="width: 78px;">وزن خالص (kg)</th>
                    <th style="width: 96px;">${isOfficial ? 'فی رسمی (+۱۰٪)' : 'فی واحد (ریال)'}</th>
                    ${totalDiscount > 0 ? '<th style="width: 76px;">تخفیف</th>' : ''}
                    <th style="width: 102px;">${isOfficial ? 'مبلغ مشمول (ریال)' : 'مبلغ (ریال)'}</th>
                    ${isOfficial ? '<th style="width: 88px;">ارزش افزوده ۱۰٪</th>' : ''}
                    <th style="width: 108px;">جمع کل (ریال)</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>
    </div>

    <div class="summary-section">
        <div class="words-box">
            <div>
                <div class="w-label">مبلغ قابل پرداخت به حروف:</div>
                <div class="w-val">${escapeHtml(rialWords)}</div>
                <div class="w-toman">(معادل ${escapeHtml(tomanWords)})</div>
            </div>
            <div class="meta-pills">
                <span class="meta-pill">جمع تعداد کارتن: ${formatFaNumber(totalCartons)} کارتن</span>
                <span class="meta-pill">جمع وزن خالص: ${formatFaNumber(totalWeight, 2)} کیلوگرم</span>
                <span class="meta-pill">تعداد اقلام: ${toPersianDigits(computedItems.length)} ردیف</span>
            </div>
        </div>

        <div class="totals-box">
            <div class="tot-row">
                <span>جمع کل اقلام:</span>
                <strong class="c-mono">${formatFaNumber(subtotal)} ریال</strong>
            </div>
            ${totalDiscount > 0 ? `
            <div class="tot-row">
                <span>جمع تخفیفات:</span>
                <strong class="c-mono">${formatFaNumber(totalDiscount)} ریال</strong>
            </div>` : ''}
            ${isOfficial ? `
            <div class="tot-row vat-row">
                <span>مالیات بر ارزش افزوده (۱۰٪):</span>
                <strong class="c-mono">${formatFaNumber(totalVat)} ریال</strong>
            </div>` : ''}
            <div class="tot-row grand-row">
                <span>مبلغ نهایی قابل پرداخت:</span>
                <span class="c-mono">${formatFaNumber(grandTotal)} ریال</span>
            </div>
        </div>
    </div>

    ${invoice.notes ? `<div class="notes-strip"><strong>توضیحات فاکتور:</strong> ${escapeHtml(invoice.notes)}</div>` : ''}

    <div class="signatures">
        <div class="sig-box">
            <div class="sig-title">صادرکننده / واحد فروش</div>
            <div class="sig-sub">${escapeHtml(invoice.createdBy || 'واحد فروش')} • مهر و امضا</div>
        </div>
        <div class="sig-box">
            <div class="sig-title">واحد مالی و حسابداری</div>
            <div class="sig-sub">تایید و ثبت در سایان</div>
        </div>
        <div class="sig-box">
            <div class="sig-title">مهر و امضای خریدار</div>
            <div class="sig-sub">${escapeHtml(invoice.customerName || '')}</div>
        </div>
    </div>

    <div class="inv-footer">
        <span>سامانه یکپارچه فروش و حسابداری سایان • ${escapeHtml(sellerName)}</span>
        <span>کد پیگیری سند: ${escapeHtml(invoice.id || invoice.sayanDocId || '-')}</span>
        <span>حالت چاپ: ${isOfficial ? 'رسمی (با کارتن + ۱۰٪)' : 'غیر رسمی (با کارتن، بدون ۱۰٪)'}</span>
    </div>
</div>
</body>
</html>`;
};

/**
 * 4. Render Sales Invoice to a real PDF Buffer using server-side Puppeteer renderer
 */
export const generateSalesInvoicePdfBuffer = async (invoice, overrideMode = null) => {
    const html = buildSalesInvoicePrintHtml(invoice, overrideMode);
    const pdfBuffer = await generatePdfBuffer(html, {
        landscape: false,
        forceOrientation: true
    });
    return pdfBuffer;
};

/**
 * 5. Register Sales Invoice in Sayan ERP based on Sales Remittance (OpCode 23),
 *    save into archive, and publish for Customer Bot PDF downloads.
 */
export const registerSalesInvoiceInSayan = async (payload, user = 'کاربر سیستم', options = {}) => {
    const isDryRun = Boolean(options?.dryRun || payload?.dryRun);
    const {
        fiscalYear = '4',
        baseRemittanceDocId,
        baseRemittanceArchiveNo,
        baseRemittanceNo,
        customerCode,
        customerName = '',
        customerNationalCode = '',
        customerMobile = '',
        customerAddress = '',
        customerTafsiliCode = '',
        warehouseCode = '',
        warehouseName = '',
        invoiceDate = '',
        invoiceType = '', // MUST be explicitly 'unofficial' or 'official' at registration time
        subCode = '',
        notes = '',
        publishToBot = true,
        items = []
    } = payload || {};

    if (invoiceType !== 'official' && invoiceType !== 'unofficial') {
        const err = new Error('لطفاً هنگام ثبت فاکتور، رسمی یا غیر رسمی بودن آن را مشخص نمایید.');
        err.statusCode = 400;
        throw err;
    }

    const normalizedType = invoiceType;
    const isOfficial = normalizedType === 'official';
    const fyNum = parseInt(String(fiscalYear || '4').trim(), 10) || 4;
    const baseArchNum = parseInt(String(baseRemittanceArchiveNo || '').trim(), 10);
    const baseDocIdNum = parseInt(String(baseRemittanceDocId || '0').trim(), 10) || 0;

    if (!Number.isFinite(baseArchNum) || baseArchNum <= 0) {
        const err = new Error('حواله فروش مبنا انتخاب نشده است.');
        err.statusCode = 400;
        throw err;
    }
    const cleanCustomerCode = String(customerCode || '').trim();
    if (!cleanCustomerCode) {
        const err = new Error('کد مشتری از حواله مبنا مشخص نیست.');
        err.statusCode = 400;
        throw err;
    }
    if (!Array.isArray(items) || items.length === 0) {
        const err = new Error('حداقل یک ردیف کالا با فی معتبر برای ثبت فاکتور فروش الزامی است.');
        err.statusCode = 400;
        throw err;
    }

    // Validate prices & compute exact financials
    // Rule: For 'official' invoices, 10% is added directly to the unit price (فی رسمی = فی پایه × 1.10)
    // and registered in Sayan STR_TBL_011.Field_007 using the +10% unit price.
    const preparedItems = items.map((it, idx) => {
        const qty = Number(it.netWeight ?? it.quantity ?? 0);
        const enteredUnitPrice = Number(it.baseUnitPrice ?? it.unitPrice ?? 0);
        const discount = Math.max(0, Math.round(Number(it.discount) || 0));
        const cartonCount = Math.max(0, Math.round(Number(it.cartonCount) || 0));
        if (!Number.isFinite(qty) || qty <= 0) {
            const err = new Error(`مقدار/وزن ردیف ${idx + 1} (${it.itemName || it.itemCode}) نامعتبر است.`);
            err.statusCode = 400;
            throw err;
        }
        if (!Number.isFinite(enteredUnitPrice) || enteredUnitPrice <= 0) {
            const err = new Error(`لطفاً فی واحد معتبر (بزرگتر از صفر) برای ردیف ${idx + 1} (${it.itemName || it.itemCode}) وارد نمایید.`);
            err.statusCode = 400;
            throw err;
        }
        const baseUnitPrice = Math.round(enteredUnitPrice);
        const effectiveUnitPrice = isOfficial ? Math.round(baseUnitPrice * 1.10) : baseUnitPrice;
        const vatPerUnit = isOfficial ? Math.max(0, effectiveUnitPrice - baseUnitPrice) : 0;
        const rawAmount = Math.round(qty * baseUnitPrice);
        const afterDiscount = Math.max(0, rawAmount - discount);
        const grossWithVat = isOfficial ? Math.round(qty * effectiveUnitPrice) : rawAmount;
        const lineTotal = Math.max(0, grossWithVat - discount);
        const vatAmount = isOfficial ? Math.max(0, lineTotal - afterDiscount) : 0;
        const sourceRowIds = Array.isArray(it.sourceRowIds) ? it.sourceRowIds.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n) && n > 0) : [];

        return {
            rowNo: idx + 1,
            itemCode: String(it.itemCode || '').trim(),
            itemName: String(it.itemName || it.itemCode || 'کالا').trim(),
            unitName: String(it.unitName || 'کیلوگرم').trim(),
            unitCode: String(it.unitCode || '12').trim(),
            wareUnitId: parseInt(String(it.wareUnitId || '0'), 10) || 0,
            netWeight: Number(qty.toFixed(3)),
            grossWeight: Number((Number(it.grossWeight) || 0).toFixed(2)),
            cartonCount,
            baseUnitPrice,
            vatPerUnit,
            unitPrice: effectiveUnitPrice,
            rawAmount,
            discount,
            afterDiscount,
            vatAmount,
            lineTotal,
            note: String(it.note || '').trim(),
            primarySourceRowId: sourceRowIds[0] || null,
            sourceRowIds
        };
    });

    const totalCartons = preparedItems.reduce((s, x) => s + x.cartonCount, 0);
    const totalNetWeight = Number(preparedItems.reduce((s, x) => s + x.netWeight, 0).toFixed(3));
    const subtotal = preparedItems.reduce((s, x) => s + x.rawAmount, 0);
    const totalDiscount = preparedItems.reduce((s, x) => s + x.discount, 0);
    const totalVat = preparedItems.reduce((s, x) => s + x.vatAmount, 0);
    const grandTotal = preparedItems.reduce((s, x) => s + x.lineTotal, 0);

    return await withSalesInvoiceWriteLock(async () => {
        const liveMeta = await discoverLiveSayanSalesInvoiceMeta(String(fyNum));
        const docDateStr = parseShamsiOrIsoToSqlDatetime(invoiceDate);
        const cCodeEsc = sanitizeSqlString(cleanCustomerCode, 40);
        const wCodeEsc = sanitizeSqlString(warehouseCode || '11', 30);
        const sCodeEsc = sanitizeSqlString(subCode || baseRemittanceNo || String(baseArchNum), 50);
        const notesClean = String(notes || '').trim();
        const notesEsc = sanitizeSqlString(notesClean, 400);
        const typeLabelFa = isOfficial ? 'رسمی' : 'غیر رسمی';
        const headerDescEsc = sanitizeSqlString(
            `مشتری: ${cCodeEsc} | مبنا: حواله فروش ${baseRemittanceNo || baseArchNum} (بایگانی ${baseArchNum}) | نوع: ${typeLabelFa} | تعداد کارتن: ${totalCartons}${notesClean ? ` | توضیحات: ${notesClean}` : ''}`,
            480
        );
        const ownerGuidEsc = sanitizeSqlString(liveMeta.ownerGuid, 80);
        const opCodeEsc = sanitizeSqlString(liveMeta.opCode, 10);
        const subSys = Number(liveMeta.subSystem) || 2;
        const lineF36Esc = sanitizeSqlString(liveMeta.lineOpField36 || liveMeta.opCode, 20);

        // Resolve valid GNR_TBL_028 WareUnitId fallback for any item missing wareUnitId
        const missingUnitCodes = preparedItems.filter((it) => !it.wareUnitId).map((it) => it.itemCode);
        const wareUnitMap = new Map();
        if (missingUnitCodes.length > 0) {
            const inCodes = Array.from(new Set(missingUnitCodes))
                .map((c) => `N'${sanitizeSqlString(c, 50)}'`)
                .join(', ');
            const wuRows = await executeSayanQuery(`
                SELECT Field_001 as WareUnitId, RTRIM(LTRIM(Field_003)) as ItemCode, RTRIM(LTRIM(Field_004)) as UnitCode
                FROM GNR_TBL_028 WITH (NOLOCK)
                WHERE RTRIM(LTRIM(Field_003)) IN (${inCodes})
                ORDER BY ISNULL(Field_008, 0) DESC, Field_001 ASC
            `, 15000).catch(() => []);
            for (const r of wuRows || []) {
                const ic = String(r.ItemCode || '').trim();
                if (ic && !wareUnitMap.has(ic)) {
                    wareUnitMap.set(ic, {
                        wareUnitId: Number(r.WareUnitId) || 0,
                        unitCode: String(r.UnitCode || '12').trim()
                    });
                }
            }
        }

        const sqlParts = [
            'SET XACT_ABORT ON;',
            'BEGIN TRAN;',
            `DECLARE @FY BIGINT = ${fyNum};`,
            `DECLARE @SubSys INT = ${subSys};`,
            'DECLARE @NextArchiveNo BIGINT;',
            'DECLARE @NextInvoiceNo BIGINT;',
            'DECLARE @NewDocId BIGINT;',
            'SELECT @NextArchiveNo = ISNULL(MAX(Field_005), 0) + 1 FROM STR_TBL_010 WITH (NOLOCK) WHERE Field_004 = @FY AND Field_018 = @SubSys;',
            `SELECT @NextInvoiceNo = ISNULL(MAX(Field_006), 0) + 1 FROM STR_TBL_010 WITH (NOLOCK) WHERE Field_004 = @FY AND RTRIM(LTRIM(Field_009)) = N'${opCodeEsc}' AND Field_018 = @SubSys;`,
            `INSERT INTO STR_TBL_010 (Field_004, Field_005, Field_006, Field_007, Field_008, Field_009, Field_010, Field_011, Field_015, Field_016, Field_017, Field_018, Field_019, Field_020, Field_021, Field_024, Field_025, Field_026, Field_029, Field_036, Field_037) VALUES (@FY, @NextArchiveNo, @NextInvoiceNo, ${sCodeEsc ? `N'${sCodeEsc}'` : 'NULL'}, CAST('${docDateStr}' AS DATETIME), N'${opCodeEsc}', N'${cCodeEsc}', N'${wCodeEsc}', 0, 0, ${notesEsc ? `N'${notesEsc}'` : 'NULL'}, @SubSys, 0, N'${ownerGuidEsc}', 0, ${totalDiscount}, ${totalVat}, ${subtotal}, N'${headerDescEsc}', GETDATE(), ${grandTotal});`,
            'SET @NewDocId = SCOPE_IDENTITY();'
        ];

        // Insert invoice lines into STR_TBL_011 linking back to base remittance line via Field_018 (when available)
        for (const it of preparedItems) {
            const icEsc = sanitizeSqlString(it.itemCode, 50);
            const resolvedWu = it.wareUnitId || wareUnitMap.get(it.itemCode)?.wareUnitId || null;
            const lineNote = sanitizeSqlString(
                isOfficial
                    ? `تعداد کارتن: ${it.cartonCount} | فی پایه: ${it.baseUnitPrice} | فی رسمی (+۱۰٪): ${it.unitPrice} | تخفیف: ${it.discount} | ارزش افزوده: ${it.vatAmount} | نوع: رسمی${it.note ? ` | ${it.note}` : ''}`
                    : `تعداد کارتن: ${it.cartonCount} | فی: ${it.unitPrice} | تخفیف: ${it.discount} | نوع: غیر رسمی${it.note ? ` | ${it.note}` : ''}`,
                480
            );
            const trackingKeyExpr = `CONCAT(@FY, '-', @SubSys, '-', @NextArchiveNo, '-', ${it.rowNo})`;
            const mabnaRowExpr = it.primarySourceRowId ? String(it.primarySourceRowId) : 'NULL';
            const wuExpr = resolvedWu ? String(resolvedWu) : 'NULL';

            sqlParts.push(
                `INSERT INTO STR_TBL_011 (Field_003, Field_004, Field_005, Field_006, Field_007, Field_009, Field_010, Field_011, Field_012, Field_013, Field_014, Field_018, Field_024, Field_025, Field_031, Field_034, Field_035, Field_036, Field_037) VALUES (@FY, @NextArchiveNo, N'${icEsc}', ${it.netWeight}, ${it.lineTotal}, 0, ${trackingKeyExpr}, N'', @SubSys, N'${cCodeEsc}', N'${wCodeEsc}', ${mabnaRowExpr}, 1, 0, N'${lineNote}', ${it.rowNo}, 0, N'${lineF36Esc}', ${wuExpr});`
            );
        }

        // Link base remittance document to new sales invoice in STR_TBL_029 (best-effort inside TRY/CATCH)
        if (baseDocIdNum > 0) {
            sqlParts.push(
                `BEGIN TRY INSERT INTO STR_TBL_029 (Field_003, Field_004, Field_005, Field_006, Field_007, Field_008, Field_009, Field_050, Field_051, Field_052, Field_053) VALUES (${baseDocIdNum}, @FY, ${baseArchNum}, 1, N'23', CAST('${docDateStr}' AS DATETIME), @NewDocId, GETDATE(), ${preparedItems.length}, 0, 0); END TRY BEGIN CATCH END CATCH;`
            );
        }

        sqlParts.push(
            'SELECT @NewDocId as DocId, @NextArchiveNo as ArchiveNo, @NextInvoiceNo as InvoiceNo, ' +
            '(SELECT COUNT(*) FROM STR_TBL_011 WHERE Field_003 = @FY AND Field_004 = @NextArchiveNo AND Field_012 = @SubSys) as LineCnt;'
        );
        sqlParts.push(isDryRun ? 'ROLLBACK TRAN;' : 'COMMIT TRAN;');

        const wrappedSql = wrapSqlForSayanGateway(sqlParts.join('\n'));
        let resRows;
        try {
            resRows = await executeSayanQuery(wrappedSql, 90000);
        } catch (sqlErr) {
            console.error('[SayanSalesInvoice] SQL insert error:', sqlErr.message);
            const err = new Error(`خطا در ثبت فاکتور فروش در دیتابیس سایان: ${sqlErr.message}`);
            err.statusCode = 502;
            throw err;
        }

        const out = Array.isArray(resRows) && resRows[0] ? resRows[0] : null;
        const createdArchiveNo = String(out?.ArchiveNo ?? out?.archiveno ?? '');
        const createdInvoiceNo = String(out?.InvoiceNo ?? out?.invoiceno ?? createdArchiveNo);
        const createdDocId = String(out?.DocId ?? out?.docid ?? '');
        const lineCnt = Number(out?.LineCnt ?? out?.linecnt ?? preparedItems.length);

        if (!out || !createdArchiveNo) {
            const err = new Error('پاسخ نامعتبر از سرور سایان هنگام دریافت شماره فاکتور صادرشده');
            err.statusCode = 502;
            throw err;
        }

        if (isDryRun) {
            return {
                success: true,
                dryRun: true,
                message: `شبیه‌سازی موفق: فاکتور فروش شماره ${createdInvoiceNo} (کد بایگانی ${createdArchiveNo}) بدون ذخیره نهایی تست شد.`,
                sayanDocId: createdDocId,
                archiveNo: createdArchiveNo,
                invoiceNo: createdInvoiceNo,
                lineCnt,
                grandTotal
            };
        }

        const nowShamsi = invoiceDate && /^\d{4}\/\d{2}\/\d{2}$/.test(String(invoiceDate).trim())
            ? String(invoiceDate).trim()
            : toShamsiDateStr(new Date().toISOString());

        const archiveRecord = {
            id: `SINV-${Date.now()}-${createdInvoiceNo}`,
            sayanDocId: createdDocId,
            archiveNo: createdArchiveNo,
            invoiceNo: createdInvoiceNo,
            opCode: liveMeta.opCode,
            subSystem: subSys,
            fiscalYear: String(fyNum),
            fiscalYearLabel: fyNum === 4 ? '۱۴۰۵' : fyNum === 3 ? '۱۴۰۴' : String(fyNum),
            baseRemittanceDocId: String(baseDocIdNum || ''),
            baseRemittanceArchiveNo: String(baseArchNum),
            baseRemittanceNo: String(baseRemittanceNo || baseArchNum),
            customerCode: cleanCustomerCode,
            customerTafsiliCode: String(customerTafsiliCode || '').trim(),
            customerName: String(customerName || cleanCustomerCode).trim(),
            customerNationalCode: String(customerNationalCode || '').trim(),
            customerMobile: String(customerMobile || '').trim(),
            customerAddress: String(customerAddress || '').trim(),
            warehouseCode: String(warehouseCode || '11').trim(),
            warehouseName: String(warehouseName || '').trim(),
            invoiceType: normalizedType, // 'unofficial' | 'official'
            vatRate: isOfficial ? 10 : 0,
            totalCartons,
            totalNetWeight,
            subtotal,
            totalDiscount,
            vatAmount: totalVat,
            grandTotal,
            items: preparedItems,
            notes: notesClean,
            subCode: String(subCode || baseRemittanceNo || baseArchNum),
            shamsiDate: nowShamsi,
            invoiceDateIso: docDateStr,
            publishedToBot: publishToBot !== false,
            botDeliveredCount: 0,
            createdBy: user?.fullName || user?.username || (typeof user === 'string' ? user : 'کاربر سیستم'),
            createdAt: new Date().toISOString()
        };

        const db = getDb();
        if (!Array.isArray(db.sayanSalesInvoicesArchive)) {
            db.sayanSalesInvoicesArchive = [];
        }
        db.sayanSalesInvoicesArchive.unshift(archiveRecord);
        if (db.sayanSalesInvoicesArchive.length > 1000) {
            db.sayanSalesInvoicesArchive = db.sayanSalesInvoicesArchive.slice(0, 1000);
        }
        saveDb();

        return {
            success: true,
            message: `فاکتور فروش ${typeLabelFa} شماره ${createdInvoiceNo} (بایگانی ${createdArchiveNo}) با موفقیت در سایان ثبت و در ربات مشتریان منتشر شد.`,
            invoice: archiveRecord
        };
    });
};

/**
 * 6. Archive & Customer Bot Lookup Helpers
 */
export const getSalesInvoicesArchive = ({ search = '', customerCode = '', invoiceType = 'all', limit = 200 } = {}) => {
    const db = getDb();
    let list = Array.isArray(db.sayanSalesInvoicesArchive) ? [...db.sayanSalesInvoicesArchive] : [];
    if (customerCode) {
        list = list.filter((inv) => matchCustomerCode(inv.customerCode, customerCode) || matchCustomerCode(inv.customerTafsiliCode, customerCode));
    }
    if (invoiceType === 'official' || invoiceType === 'unofficial') {
        list = list.filter((inv) => inv.invoiceType === invoiceType);
    }
    if (search && String(search).trim()) {
        const q = String(search).trim().toLowerCase();
        list = list.filter((inv) => {
            return (
                String(inv.invoiceNo || '').toLowerCase().includes(q) ||
                String(inv.archiveNo || '').toLowerCase().includes(q) ||
                String(inv.baseRemittanceNo || '').toLowerCase().includes(q) ||
                String(inv.customerName || '').toLowerCase().includes(q) ||
                String(inv.customerCode || '').toLowerCase().includes(q)
            );
        });
    }
    return list.slice(0, Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500));
};

export const getSalesInvoiceById = (invoiceId) => {
    const db = getDb();
    const list = Array.isArray(db.sayanSalesInvoicesArchive) ? db.sayanSalesInvoicesArchive : [];
    return list.find((inv) => String(inv.id) === String(invoiceId)) || null;
};

export const getCustomerBotInvoices = (accountCode, limit = 15) => {
    const db = getDb();
    const list = Array.isArray(db.sayanSalesInvoicesArchive) ? db.sayanSalesInvoicesArchive : [];
    return list
        .filter(
            (inv) =>
                inv.publishedToBot !== false &&
                (matchCustomerCode(inv.customerCode, accountCode) ||
                    matchCustomerCode(inv.customerTafsiliCode, accountCode))
        )
        .slice(0, limit);
};

/**
 * 7. Proactively deliver a Sales Invoice PDF to a customer's linked Telegram / Bale chat(s)
 */
export const sendSalesInvoiceToCustomerBot = async (invoiceId, overrideMode = null) => {
    const invoice = getSalesInvoiceById(invoiceId);
    if (!invoice) {
        const err = new Error('فاکتور فروش مورد نظر یافت نشد.');
        err.statusCode = 404;
        throw err;
    }

    const db = getDb();
    const targets = [];

    // 1. Check customerChatCodes (customers who entered their customer code in Telegram or Bale bot)
    const chatCodes = Array.isArray(db.customerChatCodes) ? db.customerChatCodes : [];
    for (const c of chatCodes) {
        if (matchCustomerCode(c.accountCode, invoice.customerCode) || matchCustomerCode(c.accountCode, invoice.customerTafsiliCode)) {
            if (c.chatId && (c.platform === 'telegram' || c.platform === 'bale')) {
                targets.push({ platform: c.platform, chatId: String(c.chatId) });
            }
        }
    }

    // 2. Fallback to CRM salesContacts matching customer accountCode
    const salesContacts = (db.settings && Array.isArray(db.settings.salesContacts)) ? db.settings.salesContacts : [];
    for (const sc of salesContacts) {
        if (matchCustomerCode(sc.accountCode, invoice.customerCode) || matchCustomerCode(sc.accountCode, invoice.customerTafsiliCode)) {
            if (sc.telegramId && /^\-?\d+$/.test(String(sc.telegramId).trim())) {
                targets.push({ platform: 'telegram', chatId: String(sc.telegramId).trim() });
            }
            if (sc.baleId && /^\-?\d+$/.test(String(sc.baleId).trim())) {
                targets.push({ platform: 'bale', chatId: String(sc.baleId).trim() });
            }
        }
    }

    // Deduplicate targets
    const uniqueTargets = [];
    const seen = new Set();
    for (const t of targets) {
        const k = `${t.platform}:${t.chatId}`;
        if (!seen.has(k)) {
            seen.add(k);
            uniqueTargets.push(t);
        }
    }

    // Ensure invoice stays published in bot menu even if customer hasn't linked chat yet
    invoice.publishedToBot = true;

    if (uniqueTargets.length === 0) {
        saveDb();
        return {
            success: true,
            delivered: 0,
            publishedToBot: true,
            message: `فاکتور در ربات مشتریان برای کد مشتری ${invoice.customerCode} فعال است. مشتری هنوز در ربات کد خود را ثبت نکرده؛ به محض ورود کد مشتری در ربات، می‌تواند فایل PDF را دریافت کند.`
        };
    }

    const effectiveMode = overrideMode || invoice.invoiceType || 'unofficial';
    const pdfBuffer = await generateSalesInvoicePdfBuffer(invoice, effectiveMode);
    const fileName = `Factor_${invoice.invoiceNo || invoice.archiveNo}_${effectiveMode === 'official' ? 'Official' : 'Unofficial'}.pdf`;
    const typeLabel = effectiveMode === 'official' ? 'رسمی (با ۱۰٪ ارزش افزوده)' : 'غیر رسمی';
    const caption =
        `🧾 *فاکتور فروش ${typeLabel} شماره #${invoice.invoiceNo}*\n` +
        `👤 خریدار: ${invoice.customerName} (کد: ${invoice.customerCode})\n` +
        `📅 تاریخ: ${invoice.shamsiDate}\n` +
        `📦 تعداد کارتن: ${invoice.totalCartons} کارتن | وزن: ${invoice.totalNetWeight} کیلوگرم\n` +
        `💰 مبلغ قابل پرداخت: ${Number(invoice.grandTotal).toLocaleString('fa-IR')} ریال`;

    const [tgModule, baleModule] = await Promise.all([
        import('./telegram.js').catch(() => null),
        import('./bale.js').catch(() => null)
    ]);

    let delivered = 0;
    const errors = [];
    for (const t of uniqueTargets) {
        try {
            if (t.platform === 'telegram' && tgModule?.sendBotDocument && db.settings?.telegramBotToken) {
                await tgModule.sendBotDocument(t.chatId, pdfBuffer, fileName, caption);
                delivered++;
            } else if (t.platform === 'bale' && baleModule?.sendBotDocument && db.settings?.baleBotToken) {
                await baleModule.sendBotDocument(t.chatId, pdfBuffer, fileName, caption);
                delivered++;
            }
        } catch (sendErr) {
            errors.push(`${t.platform}:${sendErr.message}`);
        }
    }

    invoice.botDeliveredCount = (Number(invoice.botDeliveredCount) || 0) + delivered;
    invoice.lastBotSentAt = new Date().toISOString();
    saveDb();

    return {
        success: true,
        delivered,
        publishedToBot: true,
        errors,
        message:
            delivered > 0
                ? `فایل PDF فاکتور با موفقیت به ${delivered} حساب ربات (تلگرام/بله) مشتری ارسال شد.`
                : `فاکتور در منوی ربات برای کد مشتری ${invoice.customerCode} ثبت شده است (ارسال مستقیم انجام نشد: ${errors.join(' | ') || 'توکن ربات فعال نیست'}).`
    };
};
