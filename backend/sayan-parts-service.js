import { getDb, saveDb, robustFetch, sanitizeSayanUrl } from './db-manager.js';

// Pre-defined category mapping based on Sayan 0310* codes
const CATEGORY_MAP = {
    '03': 'قطعات و ماشین‌آلات',
    '031001': 'کاورینگ',
    '031002': 'برق و الکتریکال',
    '031003': 'استرج',
    '031004': 'تسمه و پولی',
    '031005': 'لوازم لوله‌کشی و تاسیسات',
    '031006': 'خط تولید POY',
    '031007': 'بسته‌بندی و ملزومات',
    '031008': 'قطعات شوایتر جدید',
    '031009': 'بلبرینگ و یاتاقان',
    '031010': 'کمپرسور و پنوماتیک',
    '031011': 'پولی و اتصالات دنده‌ای',
    '031012': 'قطعات لیفتراک و خودرویی',
    '031013': 'الکتروموتور، دینام و پمپ',
    '031014': 'چسب و عایق',
    '031015': 'ابزارآلات کارگاهی',
    '031016': 'تجهیزات ایمنی و HSE',
    '031017': 'حراست و انتظامات',
    '031018': 'ملزومات رفاهی و عمومی',
    '031019': 'لوازم اداری و مصرفی',
    '031020': 'فرم‌ها و اوراق',
    '031021': 'سوخت و مواد شیمیایی',
    '031022': 'وسایل رفاهی',
    '031023': 'قطعات کرکره برقی',
    '031024': 'قطعات درب و قفل',
    '031025': 'ملزومات سالن تولید',
    '031026': 'تاسیسات عمرانی و ساختمانی',
    '031027': 'خدمات و نظافت',
    '031028': 'کپسول و آتش‌نشانی',
    '031030': 'دوربین و قطعات شبکه',
    '031031': 'قطعات دیزل ژنراتور',
    '031032': 'لوازم و قطعات هوا برش',
    '031034': 'انبار قطعات و ملزومات کارخانه'
};

const STOP_WORDS = new Set([
    'با', 'برای', 'در', 'از', 'به', 'تا', 'و', 'یا', 'یک', 'دو', 'سه', 'چهار', 'پنج',
    'جور', 'عدد', 'بسته', 'سایز', 'مدل', 'نوع', 'جهت', 'مربوط', 'عرض', 'طول', 'قطر',
    'ضخامت', 'میلی', 'متر', 'سانت', 'سانتی', 'گرمی', 'کیلویی', 'شماره', 'قلم', 'دیگر',
    'شامل', 'اصلی', 'مارک', 'برند', 'فابریک', 'دانه', 'دستگاه', 'مورد', 'نیاز', 'جهت'
]);

export const normalizePersianText = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/[\u064A\u0649]/g, 'ی')
        .replace(/[\u0643]/g, 'ک')
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, ' ')
        .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
        .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
        .replace(/[\(\)\[\]\{\}\-_,\.؛:\/\\\|\+\*]/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
};

// In-memory LRU-like cache for match & stock queries (TTL: 3 minutes)
const matchResultCache = new Map();
const matchResultCacheTimestamps = new Map();
const CACHE_TTL_MS = 180000;

/**
 * Execute query on Sayan ERP with robust error handling and timeout
 */
export const querySayanDirect = async (db, sqlQuery, timeoutMs = 25000) => {
    const settings = db.settings || {};
    const sayanUrl = sanitizeSayanUrl(settings.sayanApiUrl || process.env.SAYAN_API_URL || 'http://80.210.31.176:5000/api/external/v1');
    const sayanKey = settings.sayanApiKey || process.env.SAYAN_API_KEY || 's_gate_live_73f08a91b2c';

    if (!sayanUrl || !sayanKey) {
        throw new Error('آدرس و کلید وب‌سرویس سایان در تنظیمات تعریف نشده است.');
    }

    const endpoint = `${sayanUrl}/query`;
    const response = await robustFetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${sayanKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ query: sqlQuery }),
        timeout: timeoutMs
    });

    if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || `خطا در اجرای کوئری سایان (${response.status})`);
    }

    const json = await response.json();
    return json.data || [];
};

/**
 * Detect unit from title or default to 'عدد'
 */
const detectUnit = (title) => {
    if (!title) return 'عدد';
    if (/کیلو|گرم|وزن/i.test(title)) return 'کیلوگرم';
    if (/متر|طاقه/i.test(title)) return 'متر';
    if (/لیتر|گالن/i.test(title)) return 'لیتر';
    if (/شاخه/i.test(title)) return 'شاخه';
    if (/بسته|پک/i.test(title)) return 'بسته';
    if (/جفت/i.test(title)) return 'جفت';
    if (/دستگاه/i.test(title)) return 'دستگاه';
    if (/کارتن/i.test(title)) return 'کارتن';
    return 'عدد';
};

/**
 * Detect category name from code prefix
 */
const detectCategory = (code) => {
    if (!code) return 'قطعات و ملزومات کارخانه';
    for (let len = 6; len >= 2; len -= 2) {
        const prefix = code.slice(0, len);
        if (CATEGORY_MAP[prefix]) {
            return CATEGORY_MAP[prefix];
        }
    }
    return 'قطعات و ملزومات کارخانه';
};

/**
 * Extract meaningful keywords from a part query string
 */
const CORE_EQUIPMENT_KEYWORDS = [
    'تسمه', 'پولی', 'بلبرینگ', 'یاتاقان', 'رولربیرینگ', 'شفت', 'محور',
    'پیچ', 'مهره', 'واشر', 'خار', 'پین', 'گوژین',
    'سنسور', 'حسگر', 'چشمی', 'ترانسمیتر', 'اینکودر', 'خط کش',
    'اینورتر', 'درایو', 'کنتاکتور', 'رله', 'کلید', 'فیوز', 'ترانس', 'پاور',
    'موتور', 'الکتروموتور', 'دینام', 'سرووموتور', 'استپر', 'گیربکس',
    'پمپ', 'شناور', 'شیر', 'شیربرقی', 'والو', 'سلونوئید', 'گیج', 'فشارسنج', 'مانومتر',
    'فیلتر', 'صافی', 'المنت', 'هیتر', 'ترموکوپل',
    'جک', 'سیلندر', 'پیستون', 'شیلنگ', 'شلنگ', 'لوله', 'اتصال', 'فیتینگ', 'کوپلینگ',
    'تیغه', 'کاردک', 'چاقو', 'قیچی', 'سنبه', 'ماتریس', 'اره',
    'چرخ دنده', 'دنده', 'زنجیر',
    'کاسه نمد', 'اورینگ', 'پکینگ', 'سیل', 'گسکت',
    'کابل', 'سیم', 'سوکت', 'کانکتور', 'ترمینال',
    'روغن', 'گریس', 'اسپری', 'چسب', 'رنگ'
];

/**
 * Identify the primary physical machine element / core noun of a phrase
 */
function identifyCoreEquipmentType(text) {
    if (!text) return null;
    const norm = normalizePersianText(text);
    const tokens = norm.split(/\s+/).filter(Boolean);
    
    // First token is often the primary head noun
    if (tokens.length > 0) {
        for (const kw of CORE_EQUIPMENT_KEYWORDS) {
            if (tokens[0] === kw || tokens[0].startsWith(kw)) return kw;
        }
    }
    
    // Secondary scan across all tokens
    for (const kw of CORE_EQUIPMENT_KEYWORDS) {
        if (tokens.includes(kw)) return kw;
    }
    return null;
}

export const extractMeaningfulTokens = (rawInput) => {
    const norm = normalizePersianText(rawInput);
    if (!norm) return [];
    
    const allTokens = norm.split(/\s+/).filter(t => t.length >= 2);
    const substantive = allTokens.filter(t => !STOP_WORDS.has(t));
    return substantive.length > 0 ? substantive : allTokens;
};

/**
 * Query Sayan for an item name or item code directly in GNR_TBL_003 (with real-time stock from STR_TBL_011)
 * Highly optimized, multi-tier matching that handles complex specifications, extra words, and dimensions
 */
export const searchAndMatchSayanPart = async (requestedItemName, explicitCode = '') => {
    const rawInput = (requestedItemName || '').trim();
    const rawCode = (explicitCode || '').trim();

    if (!rawInput && !rawCode) {
        return { matched: false, part: null, stock: 0 };
    }

    const normInput = normalizePersianText(rawInput);
    const cacheKey = `${rawCode}_${normInput}`;

    // Check memory cache
    const now = Date.now();
    if (matchResultCache.has(cacheKey)) {
        const ts = matchResultCacheTimestamps.get(cacheKey) || 0;
        if (now - ts < CACHE_TTL_MS) {
            return matchResultCache.get(cacheKey);
        }
    }

    const db = getDb();

    // 1. Direct Code Lookup if a valid Sayan numeric code is provided
    if (rawCode && /^[0-9]{4,}$/.test(rawCode)) {
        const codeSql = `
            SELECT TOP 1
                RTRIM(LTRIM(g03.Field_003)) as Code,
                RTRIM(LTRIM(g03.Field_008)) as Title,
                ISNULL((
                    SELECT SUM(CASE 
                        WHEN RTRIM(LTRIM(t10.Field_009)) IN ('10', '24', '26', '29', '40', '44', '46', '83') THEN t11.Field_006 
                        WHEN RTRIM(LTRIM(t10.Field_009)) IN ('23', '25', '30', '37', '42', '84', '62', '68', '71', '74', '80') THEN -t11.Field_006 
                        ELSE 0 
                    END)
                    FROM STR_TBL_011 t11 WITH (NOLOCK)
                    INNER JOIN STR_TBL_010 t10 WITH (NOLOCK) ON t11.Field_004 = t10.Field_005 
                                               AND t11.Field_003 = t10.Field_004 
                                               AND t11.Field_012 = t10.Field_018
                    WHERE t11.Field_005 = g03.Field_003
                ), 0) as StockQty
            FROM GNR_TBL_003 g03 WITH (NOLOCK)
            WHERE g03.Field_003 = '${rawCode}'
        `;
        try {
            const rows = await querySayanDirect(db, codeSql, 8000);
            if (Array.isArray(rows) && rows.length > 0) {
                const best = rows[0];
                const stock = parseFloat(best.StockQty) || 0;
                const result = {
                    matched: true,
                    part: {
                        id: `sayan-part-${best.Code}`,
                        code: best.Code,
                        name: best.Title,
                        category: detectCategory(best.Code),
                        unit: detectUnit(best.Title),
                        type: 'قطعات کارخانه',
                        warehouseName: 'انبار ملزومات و قطعات',
                        warehouseCode: '14',
                        stock
                    },
                    stock,
                    confidence: 100
                };
                matchResultCache.set(cacheKey, result);
                matchResultCacheTimestamps.set(cacheKey, now);
                return result;
            }
        } catch (e) {
            console.warn('[Sayan Parts Service] Code lookup error:', e.message);
        }
    }

    if (!normInput || normInput.length < 2) {
        return { matched: false, part: null, stock: 0 };
    }

    const reqCoreType = identifyCoreEquipmentType(rawInput);
    const meaningfulTokens = extractMeaningfulTokens(rawInput);
    const isNumericCode = /^[0-9]{4,}$/.test(rawInput);

    let whereClause = '';
    if (isNumericCode) {
        whereClause = `g03.Field_003 = '${rawInput}'`;
    } else if (meaningfulTokens.length >= 2) {
        const allAnd = meaningfulTokens.map(t => `g03.Field_008 LIKE N'%${t}%'`).join(' AND ');
        const top2And = meaningfulTokens.slice(0, 2).map(t => `g03.Field_008 LIKE N'%${t}%'`).join(' AND ');
        
        if (reqCoreType) {
            const otherTokens = meaningfulTokens.filter(t => t !== reqCoreType);
            const coreAndOthers = otherTokens.length > 0 
                ? otherTokens.map(t => `(g03.Field_008 LIKE N'%${reqCoreType}%' AND g03.Field_008 LIKE N'%${t}%')`).join(' OR ')
                : `g03.Field_008 LIKE N'%${reqCoreType}%'`;
            whereClause = `(${allAnd}) OR (${top2And}) OR (${coreAndOthers}) OR g03.Field_008 LIKE N'%${rawInput}%'`;
        } else {
            whereClause = `(${allAnd}) OR (${top2And}) OR g03.Field_008 LIKE N'%${rawInput}%'`;
        }
    } else if (meaningfulTokens.length === 1) {
        whereClause = `g03.Field_008 LIKE N'%${meaningfulTokens[0]}%'`;
    } else {
        whereClause = `g03.Field_008 LIKE N'%${rawInput}%'`;
    }

    const sql = `
        SELECT TOP 25
            RTRIM(LTRIM(g03.Field_003)) as Code,
            RTRIM(LTRIM(g03.Field_008)) as Title,
            ISNULL((
                SELECT SUM(CASE 
                    WHEN RTRIM(LTRIM(t10.Field_009)) IN ('10', '24', '26', '29', '40', '44', '46', '83') THEN t11.Field_006 
                    WHEN RTRIM(LTRIM(t10.Field_009)) IN ('23', '25', '30', '37', '42', '84', '62', '68', '71', '74', '80') THEN -t11.Field_006 
                    ELSE 0 
                END)
                FROM STR_TBL_011 t11 WITH (NOLOCK)
                INNER JOIN STR_TBL_010 t10 WITH (NOLOCK) ON t11.Field_004 = t10.Field_005 
                                           AND t11.Field_003 = t10.Field_004 
                                           AND t11.Field_012 = t10.Field_018
                WHERE t11.Field_005 = g03.Field_003
            ), 0) as StockQty
        FROM GNR_TBL_003 g03 WITH (NOLOCK)
        WHERE (g03.Field_007 IN ('11', '12', '14', '15', '16', '13', '19') OR g03.Field_007 IS NULL)
          AND (${whereClause})
        ORDER BY 
            CASE WHEN g03.Field_008 = N'${rawInput}' THEN 0 ELSE 1 END,
            CASE WHEN g03.Field_003 LIKE '03%' OR g03.Field_003 LIKE '08%' THEN 0 ELSE 1 END,
            CASE WHEN g03.Field_008 LIKE N'${rawInput}%' THEN 0 ELSE 1 END
    `;

    try {
        const rows = await querySayanDirect(db, sql, 12000);
        if (Array.isArray(rows) && rows.length > 0) {
            let best = null;
            let maxScore = -1;

            for (const r of rows) {
                const normTitle = normalizePersianText(r.Title);
                const candCoreType = identifyCoreEquipmentType(r.Title);
                const candTokens = normTitle.split(/\s+/).filter(Boolean);
                
                // 1. Critical Equipment Type Conflict Detection
                // If user asked for 'تسمه' (Belt) but candidate is 'پولی' (Pulley), disqualify immediately!
                if (reqCoreType && candCoreType && reqCoreType !== candCoreType) {
                    if (candTokens[0] && candTokens[0] !== reqCoreType && CORE_EQUIPMENT_KEYWORDS.includes(candTokens[0])) {
                        continue; // HARD REJECTION: Do not match a pulley when user requested a belt
                    }
                }

                // If requested item has a known equipment type, candidate MUST contain it
                if (reqCoreType && !normTitle.includes(reqCoreType)) {
                    continue; // HARD REJECTION: Missing core equipment type
                }

                let score = 0;

                // Exact match
                if (normTitle === normInput) score += 150;
                // Starts with
                if (normTitle.startsWith(normInput)) score += 80;

                // Count how many meaningful tokens are matched in the title
                let matchedTokenCount = 0;
                meaningfulTokens.forEach((t, idx) => {
                    if (normTitle.includes(t)) {
                        score += 35;
                        matchedTokenCount++;
                        if (idx === 0 && (normTitle.startsWith(t) || candTokens[0] === t)) {
                            score += 40;
                        }
                    }
                });

                // Penalize if candidate starts with a conflicting core noun not in query
                if (candTokens.length > 0 && !meaningfulTokens.includes(candTokens[0])) {
                    if (CORE_EQUIPMENT_KEYWORDS.includes(candTokens[0])) {
                        score -= 80;
                    }
                }

                // Bonus if first 2 primary tokens match
                if (meaningfulTokens.length >= 2 && normTitle.includes(meaningfulTokens[0]) && normTitle.includes(meaningfulTokens[1])) {
                    score += 40;
                }

                // If all tokens match
                if (matchedTokenCount === meaningfulTokens.length) {
                    score += 60;
                }

                // Token coverage ratio check
                const tokenCoverage = meaningfulTokens.length > 0 ? (matchedTokenCount / meaningfulTokens.length) : 0;
                if (tokenCoverage < 0.4 && matchedTokenCount < 2 && normTitle !== normInput) {
                    continue; // REJECT if less than 40% tokens matched
                }

                // Prefer items that actually have positive stock in Sayan warehouse
                if (parseFloat(r.StockQty) > 0) score += 20;

                // Prefer 03% or 08% factory parts
                if (String(r.Code).startsWith('03') || String(r.Code).startsWith('08')) score += 25;

                if (score > maxScore) {
                    maxScore = score;
                    best = r;
                }
            }

            const MIN_REQUIRED_SCORE = 75;
            if (best && maxScore >= MIN_REQUIRED_SCORE) {
                const stock = parseFloat(best.StockQty) || 0;
                const unit = detectUnit(best.Title);
                const category = detectCategory(best.Code);

                const result = {
                    matched: true,
                    part: {
                        id: `sayan-part-${best.Code}`,
                        code: best.Code,
                        name: best.Title,
                        category,
                        unit,
                        type: 'قطعات کارخانه',
                        warehouseName: 'انبار ملزومات و قطعات',
                        warehouseCode: '14',
                        stock
                    },
                    stock,
                    confidence: maxScore > 100 ? 95 : 80
                };

                matchResultCache.set(cacheKey, result);
                matchResultCacheTimestamps.set(cacheKey, now);
                return result;
            }
        }
    } catch (err) {
        console.warn(`[Sayan Parts Service] Search error for "${requestedItemName}":`, err.message);
    }

    const notFoundResult = { matched: false, part: null, stock: 0 };
    matchResultCache.set(cacheKey, notFoundResult);
    matchResultCacheTimestamps.set(cacheKey, now);
    return notFoundResult;
};

/**
 * Batch match parts for multiple items in parallel
 */
export const batchMatchSayanParts = async (items = []) => {
    if (!Array.isArray(items) || items.length === 0) return [];
    
    return await Promise.all(items.map(async (it) => {
        const queryName = it.itemName || it.name || it.Title || '';
        const explicitCode = it.sayanItemCode || it.itemCode || it.code || '';
        const matchResult = await searchAndMatchSayanPart(queryName, explicitCode);
        return {
            id: it.id || it.itemId,
            itemName: queryName,
            matchResult
        };
    }));
};

/**
 * Enriches all items in a purchase request with Sayan factory part matches and live warehouse stock
 */
export const enrichPurchaseRequestWithSayanStock = async (purchaseRequest) => {
    if (!purchaseRequest) return purchaseRequest;

    const items = Array.isArray(purchaseRequest.items) ? purchaseRequest.items : [];
    const enrichedItems = [];
    const stockSummaryParts = [];

    for (let i = 0; i < items.length; i++) {
        const it = { ...items[i] };
        const queryName = it.itemName || purchaseRequest.itemName || '';
        const explicitCode = it.sayanItemCode || it.itemCode || '';
        const matchResult = await searchAndMatchSayanPart(queryName, explicitCode);

        if (matchResult.matched && matchResult.part) {
            it.itemCode = it.itemCode || matchResult.part.code;
            it.sayanItemCode = matchResult.part.code;
            it.sayanMatchedItem = matchResult.part.name;
            it.sayanStock = matchResult.stock;
            it.warehouseStock = matchResult.stock;
            it.isAvailableInWarehouse = matchResult.stock > 0;
            it.sayanWarehouseName = matchResult.part.warehouseName || 'انبار ملزومات و قطعات';
            it.unit = it.unit || matchResult.part.unit;

            if (matchResult.stock > 0) {
                stockSummaryParts.push(`✅ ${it.itemName}: ${matchResult.stock.toLocaleString('fa-IR')} ${it.unit} در انبار سایان`);
            } else {
                stockSummaryParts.push(`⚠️ ${it.itemName}: عدم موجودی در انبار سایان (۰ ${it.unit})`);
            }
        } else {
            it.sayanMatchedItem = undefined;
            it.sayanItemCode = undefined;
            it.sayanStock = undefined;
            it.warehouseStock = undefined;
            it.isAvailableInWarehouse = false;
        }
        enrichedItems.push(it);
    }

    // Also enrich primary item if single-item request
    if (enrichedItems.length === 0 && purchaseRequest.itemName) {
        const singleMatch = await searchAndMatchSayanPart(purchaseRequest.itemName, purchaseRequest.itemCodeAssigned || purchaseRequest.sayanItemCode);
        if (singleMatch.matched && singleMatch.part) {
            purchaseRequest.itemCodeAssigned = purchaseRequest.itemCodeAssigned || singleMatch.part.code;
            purchaseRequest.sayanStock = singleMatch.stock;
            purchaseRequest.warehouseStock = singleMatch.stock;
            purchaseRequest.sayanMatchedItem = singleMatch.part.name;
            purchaseRequest.isAvailableInWarehouse = singleMatch.stock > 0;
            if (singleMatch.stock > 0) {
                stockSummaryParts.push(`✅ موجود در انبار سایان: ${singleMatch.stock.toLocaleString('fa-IR')} ${purchaseRequest.unit || 'عدد'}`);
            } else {
                stockSummaryParts.push(`⚠️ عدم موجودی در انبار سایان (۰ ${purchaseRequest.unit || 'عدد'})`);
            }
        } else {
            purchaseRequest.sayanMatchedItem = undefined;
            purchaseRequest.sayanStock = undefined;
            purchaseRequest.warehouseStock = undefined;
            purchaseRequest.isAvailableInWarehouse = false;
        }
    }

    purchaseRequest.items = enrichedItems;
    if (stockSummaryParts.length > 0) {
        purchaseRequest.sayanStockSummary = stockSummaryParts.join(' | ');
    }
    if (enrichedItems.length > 0) {
        purchaseRequest.sayanStock = enrichedItems[0]?.sayanStock;
        purchaseRequest.sayanMatchedItem = enrichedItems[0]?.sayanMatchedItem;
    }

    return purchaseRequest;
};

export function isMatchValidForQuery(queryName, matchedName) {
    if (!queryName || !matchedName) return true;
    const reqCore = identifyCoreEquipmentType(queryName);
    const candCore = identifyCoreEquipmentType(matchedName);
    if (reqCore && candCore && reqCore !== candCore) {
        return false;
    }
    return true;
}

/**
 * Fetch top factory parts catalog from Sayan with live stock to populate the "قطعات" tab
 */
export const syncSayanFactoryPartsToDatabase = async (limit = 60) => {
    const db = getDb();
    const sql = `
        SELECT TOP ${limit}
            RTRIM(LTRIM(t11.Field_005)) as Code,
            RTRIM(LTRIM(g03.Field_008)) as Title,
            ISNULL(SUM(CASE 
                WHEN RTRIM(LTRIM(t10.Field_009)) IN ('10', '24', '26', '29', '40', '44', '46', '83') THEN t11.Field_006 
                WHEN RTRIM(LTRIM(t10.Field_009)) IN ('23', '25', '30', '37', '42', '84', '62', '68', '71', '74', '80') THEN -t11.Field_006 
                ELSE 0 
            END), 0) as StockQty
        FROM STR_TBL_011 t11 WITH (NOLOCK)
        INNER JOIN STR_TBL_010 t10 WITH (NOLOCK) ON t11.Field_004 = t10.Field_005 
                                   AND t11.Field_003 = t10.Field_004 
                                   AND t11.Field_012 = t10.Field_018
        LEFT JOIN GNR_TBL_003 g03 WITH (NOLOCK) ON t11.Field_005 = g03.Field_003
        WHERE (t11.Field_005 LIKE '03%' OR t11.Field_005 LIKE '08%')
        GROUP BY t11.Field_005, g03.Field_008
        ORDER BY StockQty DESC
    `;

    try {
        const rows = await querySayanDirect(db, sql, 15000);
        if (Array.isArray(rows) && rows.length > 0) {
            const partsList = rows.map((r) => {
                const code = r.Code;
                const name = r.Title || `قطعه ${code}`;
                const category = detectCategory(code);
                const unit = detectUnit(name);
                const stock = parseFloat(r.StockQty) || 0;

                return {
                    id: `sayan-part-${code}`,
                    name,
                    code,
                    category,
                    unit,
                    currentStock: stock,
                    minStock: 0,
                    reorderPoint: 5,
                    location: 'انبار ملزومات و قطعات',
                    type: 'قطعات کارخانه',
                    isActive: true,
                    lastSyncDate: new Date().toISOString()
                };
            });

            return {
                success: true,
                count: partsList.length,
                parts: partsList
            };
        }
    } catch (err) {
        console.error('[Sayan Parts Service] Sync catalog error:', err.message);
    }

    return { success: false, count: 0, parts: [] };
};
