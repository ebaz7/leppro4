
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';
import * as jalaali from 'jalaali-js';
import * as Renderer from './renderer.js';
import * as dbManager from './db-manager.js';
import * as utils from './utils.js';
import * as whatsapp from './whatsapp.js';
import { mergeFilesToPdf } from './pdf-merger.js';

const getDb = dbManager.getDb;
const saveDb = dbManager.saveDb;
const robustFetch = dbManager.robustFetch;
const toShamsiYearMonth = utils.toShamsiYearMonth;
const toShamsiFull = utils.toShamsiFull;
const findNextGapNumber = utils.findNextGapNumber;
const sanitizeGroupId = utils.sanitizeGroupId;
const generateUUID = utils.generateUUID;
const getTehranDateString = utils.getTehranDateString;

const getRolePermissions = (userRole, settings, userObject) => {
    if (userRole === 'admin') {
        return {
            canViewCustomerBalances: true,
            canImportCustomerBalances: true
        };
    }
    const perms = {
        canViewCustomerBalances: false,
        canImportCustomerBalances: false
    };
    switch (userRole) {
        case 'ceo':
        case 'financial':
            perms.canViewCustomerBalances = true;
            perms.canImportCustomerBalances = true;
            break;
        case 'manager':
        case 'sales_manager':
            perms.canViewCustomerBalances = true;
            break;
    }
    if (settings && settings.customRoles && settings.customRoles[userRole]) {
        const r = settings.customRoles[userRole];
        if (r.canViewCustomerBalances !== undefined) perms.canViewCustomerBalances = !!r.canViewCustomerBalances;
        if (r.canImportCustomerBalances !== undefined) perms.canImportCustomerBalances = !!r.canImportCustomerBalances;
    }
    return perms;
};

const normalizeChannelId = (id) => {
    if (!id) return id;
    id = id.toString().trim();
    // Support links
    if (id.startsWith('http')) {
        const parts = id.split('/');
        id = parts[parts.length - 1] || id;
    }
    // Remove if @ is at the end (user typo like lepanbaft@)
    if (id.endsWith('@')) id = id.slice(0, -1);
    
    if (id.startsWith('-100') || id.startsWith('-')) return id;
    if (!id.startsWith('@') && isNaN(Number(id))) return `@${id}`;
    return id;
};

// Helper to extract Buffer from stored attachment (url, data, base64)
const getAttachmentBuffer = (att) => {
    if (!att) return null;
    let dataStr = att.data || att.url || '';
    if (!dataStr) return null;
    if (dataStr.startsWith('data:')) {
        const base64 = dataStr.replace(/^data:.*;base64,/, '');
        return Buffer.from(base64, 'base64');
    }
    if (dataStr.startsWith('/uploads/') || dataStr.startsWith('uploads/')) {
        const safeBase = path.basename(dataStr).replace(/[\/\\]/g, '');
        const filePath = path.join(process.cwd(), 'uploads', safeBase);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath);
        }
    }
    if (typeof dataStr === 'string' && dataStr.length > 100 && !dataStr.includes('/') && !dataStr.includes('\\')) {
        try {
            return Buffer.from(dataStr, 'base64');
        } catch (_) {}
    }
    return null;
};

// Session memory
export const sessions = {}; 
const lastSentIds = new Map(); // Use Map to store { key: timestamp }
const NOTIFY_DEDUPE_WINDOW = 30000; // 30 seconds default

const isDuplicateNotification = (key, customWindowMs = NOTIFY_DEDUPE_WINDOW) => {
    const now = Date.now();
    const lastTime = lastSentIds.get(key);
    if (lastTime && (now - lastTime) < customWindowMs) {
        console.log(`[Dedupe] Suppressed duplicate notification for key: ${key} (within ${customWindowMs/1000}s)`);
        return true;
    }
    lastSentIds.set(key, now);
    // Cleanup old keys occasionally
    if (lastSentIds.size > 1000) {
        for (const [k, v] of lastSentIds.entries()) {
            if (now - v > 3600000) lastSentIds.delete(k);
        }
    }
    return false;
};

const resolveUser = (db, platform, chatId) => {
    if (platform === 'telegram') return db.users.find(u => u.telegramChatId == chatId);
    if (platform === 'bale') return db.users.find(u => u.baleChatId == chatId);
    return null;
};

const isUnionExitBotUser = (db, chatId, senderId) => {
    const list = db.settings?.unionExitBotUsers || [];
    const id1 = String(chatId);
    const id2 = senderId ? String(senderId) : '';
    return list.find(u => String(u.messengerId) === id1 || (id2 && String(u.messengerId) === id2));
};

const runSayanQuery = async (db, queryStr) => {
    const settings = db.settings || {};
    const serverSayanBaseUrl = settings.sayanApiUrl;
    const serverSayanApiKey = settings.sayanApiKey;
    
    if (!serverSayanBaseUrl || !serverSayanApiKey) {
        throw new Error('تنظیمات اتصال به سرور سایان (آدرس و رمز API) در سیستم پیکربندی نشده است.');
    }
    
    const finalUrl = `${serverSayanBaseUrl.replace(/\/$/, '')}/query`;
    const response = await robustFetch(finalUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${serverSayanApiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: queryStr })
    });
    
    if (!response.ok) {
        const errDetails = await response.json().catch(() => ({}));
        throw new Error(errDetails.error || 'خطای اتصال به سرور سایان ERP');
    }
    
    const data = await response.json();
    return data.data || [];
};

export const detectAndTriggerReport = async (platform, chatId, userId, text, sendFn, sendPhotoFn, sendDocFn, checkMembershipFn) => {
    if (!text) return false;
    const cleanText = text.toLowerCase().trim();
    
    // 1. Daily Sales Report
    if (
        (cleanText.includes('فروش') && (cleanText.includes('امروز') || cleanText.includes('روزانه') || cleanText.includes('روز'))) ||
        cleanText.includes('ارزش فروش') ||
        cleanText.includes('فاکتور فروش امروز')
    ) {
        await handleCallback(platform, chatId, userId, 'BOT_SAYAN_DAILY_SALES', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }
    
    // 2. Pending Documents / Checks
    if (
        cleanText.includes('آویزان') ||
        (cleanText.includes('چک') && cleanText.includes('آویزان')) ||
        (cleanText.includes('سند') && cleanText.includes('آویزان'))
    ) {
        await handleCallback(platform, chatId, userId, 'BOT_SAYAN_PENDING_DOCS', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }
    
    // 3. Debtors PDF
    if (
        (cleanText.includes('بدهکاران') && (cleanText.includes('دانلود') || cleanText.includes('فایل') || cleanText.includes('پی دی اف') || cleanText.includes('pdf') || cleanText.includes('لیست'))) ||
        (cleanText.includes('لیست بدهکار') || cleanText.includes('فایل بدهکار'))
    ) {
        await handleCallback(platform, chatId, userId, 'SALES_BAL_DOWNLOAD_DEBTORS', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }
    
    // 4. Creditors PDF
    if (
        (cleanText.includes('بستانکاران') && (cleanText.includes('دانلود') || cleanText.includes('فایل') || cleanText.includes('پی دی اف') || cleanText.includes('pdf') || cleanText.includes('لیست'))) ||
        (cleanText.includes('لیست بستانکار') || cleanText.includes('فایل بستانکار'))
    ) {
        await handleCallback(platform, chatId, userId, 'SALES_BAL_DOWNLOAD_CREDITORS', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 5. Comparison Yesterday vs Today
    if (
        cleanText.includes('مقایسه فروش دیروز') ||
        (cleanText.includes('مقایسه فروش') && cleanText.includes('دیروز') && cleanText.includes('امروز'))
    ) {
        await handleCallback(platform, chatId, userId, 'BOT_SAYAN_COMPARE_PRESETS_YESTERDAY_TODAY', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 6. Comparison This Week vs Last Week
    if (
        cleanText.includes('مقایسه فروش این هفته') ||
        (cleanText.includes('مقایسه فروش') && cleanText.includes('هفته') && cleanText.includes('قبل'))
    ) {
        await handleCallback(platform, chatId, userId, 'BOT_SAYAN_COMPARE_PRESETS_WEEK', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 7. Comparison This Month vs Last Month
    if (
        cleanText.includes('مقایسه فروش این ماه') ||
        (cleanText.includes('مقایسه فروش') && cleanText.includes('ماه') && cleanText.includes('قبل'))
    ) {
        await handleCallback(platform, chatId, userId, 'BOT_SAYAN_COMPARE_PRESETS_MONTH', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 8. Payment Cartable (کارتابل پرداخت)
    if (
        cleanText.includes('کارتابل پرداخت') ||
        cleanText.includes('تایید پرداخت') ||
        cleanText.includes('لیست پرداخت') ||
        cleanText.includes('دستور پرداخت های منتظر')
    ) {
        await handleCallback(platform, chatId, userId, 'ACT_PAY_CARTABLE', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 9. New Payment Request (ثبت دستور پرداخت)
    if (
        cleanText.includes('ثبت دستور پرداخت') ||
        cleanText.includes('پرداخت جدید') ||
        cleanText.includes('ایجاد دستور پرداخت')
    ) {
        await handleCallback(platform, chatId, userId, 'ACT_PAY_NEW', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 9.1 Payment Order Attachment (افزودن پیوست به سند پرداخت)
    if (
        cleanText.includes('پیوست به سند') ||
        cleanText.includes('افزودن پیوست') ||
        cleanText.includes('پیوست دستور پرداخت') ||
        cleanText.includes('اتچ دستور پرداخت') ||
        cleanText.includes('اتچ فاکتور') ||
        cleanText.includes('پیوست پرداخت') ||
        cleanText.includes('ارسال عکس فاکتور') ||
        cleanText.includes('ارسال پیوست')
    ) {
        await handleCallback(platform, chatId, userId, 'ACT_ATTACH_PAY_START', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 10. Exit Cartable (کارتابل خروج)
    if (
        cleanText.includes('کارتابل خروج') ||
        cleanText.includes('تایید خروج') ||
        cleanText.includes('مجوزهای خروج منتظر') ||
        cleanText.includes('مجوز خروج')
    ) {
        await handleCallback(platform, chatId, userId, 'ACT_EXIT_CARTABLE', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 11. New Exit Permit (ثبت مجوز خروج)
    if (
        cleanText.includes('ثبت مجوز خروج') ||
        cleanText.includes('خروج جدید') ||
        cleanText.includes('ایجاد مجوز خروج')
    ) {
        await handleCallback(platform, chatId, userId, 'ACT_EXIT_NEW', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 12. Warehouse Cartable (کارتابل انبار)
    if (
        cleanText.includes('کارتابل انبار') ||
        cleanText.includes('تایید بیجک') ||
        cleanText.includes('بیجک‌های منتظر') ||
        cleanText.includes('کارتابل بیجک')
    ) {
        await handleCallback(platform, chatId, userId, 'ACT_WH_CARTABLE', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 13. New Bijak Request (ثبت بیجک خروج)
    if (
        cleanText.includes('ثبت بیجک خروج') ||
        cleanText.includes('بیجک جدید') ||
        cleanText.includes('ایجاد بیجک')
    ) {
        await handleCallback(platform, chatId, userId, 'ACT_WH_NEW_BIJAK', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 14. Stock Report (موجودی انبار)
    if (
        cleanText.includes('موجودی انبار') ||
        cleanText.includes('گزارش موجودی') ||
        cleanText.includes('فایل موجودی')
    ) {
        await handleCallback(platform, chatId, userId, 'WH_RPT_STOCK', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 15. Dispatch Report (گزارش خروج انبار)
    if (
        cleanText.includes('گزارش خروج') ||
        cleanText.includes('گزارش ترخیص') ||
        cleanText.includes('خروجی‌های انبار')
    ) {
        await handleCallback(platform, chatId, userId, 'WH_RPT_DISPATCH_PROMPT', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 16. Secretariat Pending (نامه‌های منتظر تایید)
    if (
        cleanText.includes('نامه های منتظر') ||
        cleanText.includes('تایید نامه') ||
        cleanText.includes('کارتابل نامه')
    ) {
        await handleCallback(platform, chatId, userId, 'SEC_PENDING', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 17. Latest Letters Cartable (آخرین نامه‌های کارتابل)
    if (
        cleanText.includes('آخرین نامه ها') ||
        cleanText.includes('نامه های کارتابل')
    ) {
        await handleCallback(platform, chatId, userId, 'SEC_CARTABLE_LATEST', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 18. Customer Balances (استعلام و مانده حساب مشتریان)
    if (
        cleanText.includes('مانده حساب مشتری') ||
        cleanText.includes('استعلام حساب') ||
        cleanText.includes('مانده مشتریان') ||
        cleanText.includes('استعلام مشتری')
    ) {
        await handleCallback(platform, chatId, userId, 'SALES_CUSTOMER_BALANCES', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    // 19. Compare Sales (مقایسه تحلیل فروش دو بازه)
    if (
        cleanText.includes('مقایسه تحلیل فروش') ||
        cleanText.includes('مقایسه فروش دو بازه') ||
        cleanText.includes('تحلیل مقایسه ای فروش')
    ) {
        await handleCallback(platform, chatId, userId, 'BOT_SAYAN_COMPARE_SALES', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        return true;
    }

    return false;
};

export function isActualProduct(row) {
  if (!row) return false;
  const code = String(row.ItemCode || '').trim();
  const name = String(row.ItemName || '').trim();
  const group = String(row.GroupName || '').trim();
  
  const lowerName = name.toLowerCase();
  const lowerGroup = group.toLowerCase();

  const keywordsToExclude = [
    'کارتن', 'پالت', 'جعبه', 'حمل', 'کرایه', 'خدمات',
    'هزینه', 'دوک خالی', 'کیسه خالی', 'بسته بندی', 'پلاستیک'
  ];

  for (const keyword of keywordsToExclude) {
    if (lowerName.includes(keyword) || lowerGroup.includes(keyword)) {
      return false;
    }
  }

  const isProductPrefix = /^(01|02|04|05)/.test(code);
  if (isProductPrefix) return true;

  if (!group && (!name || name === code || /^\d+$/.test(name))) {
    return false;
  }

  return true;
}

const BOT_MAJOR_CATEGORIES = [
  'اسپاندکس (کاور)',
  'کش',
  'اسپاندکس جوشی ( ساپورت )',
  'پلی استر شوایتر',
  'نایلون',
  'نخ ملت',
  'الیاف',
  'FDY',
  'چیپس',
  'POY',
  'dty یا پلی استر',
  'لاستیک',
  'لاکرا',
  'پلی استر اسپان',
  'مستر بچ',
  'ضایعات POY',
  'ضایعات تولید'
];

export function classifyMajorCategory(groupName = '', itemName = '', itemCode = '') {
  const code = String(itemCode || '').trim();
  const text = `${groupName} ${itemName}`.toLowerCase();

  if (code.startsWith('0501') || text.includes('ضایعات poy') || text.includes('ضایعات پی او وای')) return 'ضایعات POY';
  if (code.startsWith('0502') || (text.includes('ضایعات') && !text.includes('poy'))) return 'ضایعات تولید';

  if (code.startsWith('0401') || text.includes('کاور') || text.includes('کاورینگ')) return 'اسپاندکس (کاور)';
  if (code.startsWith('0402') || (text.includes('کش') && !text.includes('روکش') && !text.includes('سرکش'))) return 'کش';
  if (code.startsWith('0403') || text.includes('ساپورت') || text.includes('جوشی') || text.includes('پوشش')) return 'اسپاندکس جوشی ( ساپورت )';
  if (code.startsWith('0405') || text.includes('شواتیز') || text.includes('شوایتر')) return 'پلی استر شوایتر';
  if (code.startsWith('0407') || code.startsWith('0108') || text.includes('نایلون') || text.includes('nylon')) return 'نایلون';
  if (code.startsWith('0408') || text.includes('ملت') || text.includes('melt')) return 'نخ ملت';
  if (code.startsWith('0409') || text.includes('الیاف')) return 'الیاف';
  if (code.startsWith('0410') || text.includes('fdy') || text.includes('اف دی ای')) return 'FDY';

  if (code.startsWith('0101') || text.includes('چیپس') || text.includes('chip')) return 'چیپس';
  if (code.startsWith('0102') || text.includes('poy') || text.includes('پی او وای')) return 'POY';
  if (code.startsWith('0103') || text.includes('dty') || text.includes('دی تی آی') || text.includes('پلی استر')) return 'dty یا پلی استر';
  if (code.startsWith('0104') || text.includes('لاستیک') || text.includes('rubber')) return 'لاستیک';
  if (code.startsWith('0105') || text.includes('لاکرا') || text.includes('لایکرا') || text.includes('lycra')) return 'لاکرا';
  if (code.startsWith('0106') || text.includes('اسپان') || text.includes('span')) return 'پلی استر اسپان';
  if (code.startsWith('0107') || text.includes('مستر') || text.includes('masterbatch')) return 'مستر بچ';

  if (text.includes('اسپاندکس') || text.includes('spandex') || text.includes('اسپندکس')) return 'اسپاندکس (کاور)';
  if (text.includes('پلی استر') || text.includes('polyester')) return 'dty یا پلی استر';

  return groupName ? groupName : (itemName ? itemName : 'سایر محصولات');
}

export const normalizeToYmdStrings = (dateFromInput, dateToInput) => {
    let gregFrom = '';
    let gregTo = '';
    let shamsiFrom = '';
    let shamsiTo = '';

    const processInput = (val) => {
        if (!val) return { greg: '', shamsi: '' };
        if (val instanceof Date) {
            const g = getTehranDateString(val);
            const sh = toShamsiFull(val.toISOString()).split(' ')[0].replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
            return { greg: g, shamsi: sh };
        }
        const str = String(val).trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        if (str.includes('/') || str.includes('.') || str.match(/^\d{4}-\d{2}-\d{2}$/)) {
            if (str.startsWith('13') || str.startsWith('14')) {
                const parts = str.split(/[\/\.\-]/).map(p => parseInt(p, 10));
                if (parts.length === 3) {
                    const g = jalaali.toGregorian(parts[0], parts[1], parts[2]);
                    const gregStr = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
                    const shamsiStr = `${parts[0]}/${String(parts[1]).padStart(2, '0')}/${String(parts[2]).padStart(2, '0')}`;
                    return { greg: gregStr, shamsi: shamsiStr };
                }
            } else if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const parts = str.split('-').map(p => parseInt(p, 10));
                const j = jalaali.toJalaali(parts[0], parts[1], parts[2]);
                const shamsiStr = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
                return { greg: str, shamsi: shamsiStr };
            }
        }
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
            const g = getTehranDateString(d);
            const sh = toShamsiFull(d.toISOString()).split(' ')[0].replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
            return { greg: g, shamsi: sh };
        }
        return { greg: str, shamsi: str };
    };

    const resFrom = processInput(dateFromInput);
    const resTo = processInput(dateToInput || dateFromInput);

    gregFrom = resFrom.greg;
    shamsiFrom = resFrom.shamsi;
    gregTo = resTo.greg || gregFrom;
    shamsiTo = resTo.shamsi || shamsiFrom;

    if (gregFrom && gregTo && gregFrom > gregTo) {
        const tmpG = gregFrom; gregFrom = gregTo; gregTo = tmpG;
        const tmpS = shamsiFrom; shamsiFrom = shamsiTo; shamsiTo = tmpS;
    }

    return { gregFrom, gregTo, shamsiFrom, shamsiTo };
};

export async function fetchProcessedSayanSalesData(db, dateFromInput, dateToInput) {
    const { gregFrom, gregTo, shamsiFrom, shamsiTo } = normalizeToYmdStrings(dateFromInput, dateToInput);

    const shamsiFromClean = shamsiFrom ? shamsiFrom.replace(/\//g, '') : '';
    const shamsiToClean = shamsiTo ? shamsiTo.replace(/\//g, '') : '';
    const shamsiFromDash = shamsiFrom ? shamsiFrom.replace(/\//g, '-') : '';
    const shamsiToDash = shamsiTo ? shamsiTo.replace(/\//g, '-') : '';

    let dateCond = '';
    if (gregFrom && gregTo) {
        dateCond = `(t10.Field_008 >= '${gregFrom}T00:00:00.000Z' AND t10.Field_008 <= '${gregTo}T23:59:59.999Z')`;
    } else if (gregFrom) {
        dateCond = `(t10.Field_008 >= '${gregFrom}T00:00:00.000Z' AND t10.Field_008 <= '${gregFrom}T23:59:59.999Z')`;
    } else {
        dateCond = `(t10.Field_008 >= CONVERT(date, GETDATE()))`;
    }

    const sql = `
        SELECT 
            t10.Field_001 as DocId,
            t10.Field_006 as InvoiceNum,
            t10.Field_008 as Date,
            t10.Field_029 as Notes,
            t10.Field_037 as HeaderPayable,
            t11.Field_005 as ItemCode,
            COALESCE(t22.Field_004, t_name.ItemName, t11.Field_005, 'کالای بدون نام') as ItemName,
            t11.Field_006 as Quantity,
            t11.Field_031 as ItemNotes,
            t11.Field_007 as Amount,
            t_group.GroupName,
            t07.Field_006 as CustomerName,
            t10.Field_009 as OpCode
        FROM STR_TBL_010 t10 WITH (NOLOCK)
        INNER JOIN STR_TBL_011 t11 WITH (NOLOCK) ON t11.Field_004 = t10.Field_005 
                                   AND t11.Field_003 = t10.Field_004
                                   AND t11.Field_012 = t10.Field_018
                                   AND (
                                       (t10.Field_009 IN ('3', '12', '23') AND t11.Field_036 = t10.Field_009)
                                       OR
                                       (t10.Field_009 = '13' AND t11.Field_036 IN ('3', '12', '23', '13'))
                                   )
        LEFT JOIN IND_TBL_022 t22 WITH (NOLOCK) ON RTRIM(LTRIM(t22.Field_005)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN (
            SELECT RTRIM(LTRIM(t21_sub.Field_004)) as ItemCode, MIN(t02_sub.Field_003) as ItemName
            FROM IND_TBL_021 t21_sub WITH (NOLOCK)
            LEFT JOIN IND_TBL_002 t02_sub WITH (NOLOCK) ON RTRIM(LTRIM(t21_sub.Field_003)) = RTRIM(LTRIM(t02_sub.Field_008))
            GROUP BY t21_sub.Field_004
        ) t_name ON RTRIM(LTRIM(t11.Field_005)) = RTRIM(LTRIM(t_name.ItemCode))
        LEFT JOIN (
            SELECT t21_sub.Field_004 as ItemCode, MIN(COALESCE(t02_grandparent.Field_003, t02_parent.Field_003, t02_sub.Field_003)) as GroupName
            FROM IND_TBL_021 t21_sub WITH (NOLOCK)
            LEFT JOIN IND_TBL_002 t02_sub WITH (NOLOCK) ON RTRIM(LTRIM(t21_sub.Field_003)) = RTRIM(LTRIM(t02_sub.Field_008))
            LEFT JOIN IND_TBL_002 t02_parent WITH (NOLOCK) ON RTRIM(LTRIM(t02_sub.Field_009)) = RTRIM(LTRIM(t02_parent.Field_008))
            LEFT JOIN IND_TBL_002 t02_grandparent WITH (NOLOCK) ON RTRIM(LTRIM(t02_parent.Field_009)) = RTRIM(LTRIM(t02_grandparent.Field_008))
            GROUP BY t21_sub.Field_004
        ) t_group ON RTRIM(LTRIM(t11.Field_005)) = RTRIM(LTRIM(t_group.ItemCode))
        LEFT JOIN ACT_TBL_007 t07 WITH (NOLOCK) ON RTRIM(LTRIM(t10.Field_010)) = RTRIM(LTRIM(t07.Field_005)) AND (t07.Field_004 = '11' OR t07.Field_004 = '31')
        WHERE (
            (t10.Field_009 IN ('3', '12', '23') AND t11.Field_007 > 0)
            OR
            t10.Field_009 = '13'
          )
          AND ${dateCond}
        ORDER BY t10.Field_008 DESC
    `;

    console.log(`[fetchProcessedSayanSalesData] Executing SQL:`, sql);
    const rawSalesRows = await runSayanQuery(db, sql);
    console.log(`[fetchProcessedSayanSalesData] SQL execution returned ${rawSalesRows.length} rows.`);
    const productRows = rawSalesRows.filter(isActualProduct);
    console.log(`[fetchProcessedSayanSalesData] After isActualProduct filtering: ${productRows.length} rows.`);

    const invMap = new Map();
    productRows.forEach(row => {
        const docId = row.DocId || 'unknown';
        if (!invMap.has(docId)) invMap.set(docId, []);
        invMap.get(docId).push(row);
    });

    const salesRows = [];
    invMap.forEach((rows) => {
        const headerPayable = parseFloat(rows[0].HeaderPayable || rows[0].Amount || 0);
        const sumItemAmt = rows.reduce((s, r) => s + parseFloat(r.Amount || 0), 0);
        const sumItemQty = rows.reduce((s, r) => s + parseFloat(r.Quantity || 0), 0);

        rows.forEach(r => {
            const itemAmt = parseFloat(r.Amount || 0);
            const itemQty = parseFloat(r.Quantity || 0);
            let allocatedAmt = 0;
            if (headerPayable > 0) {
                if (sumItemAmt > 0) {
                    allocatedAmt = headerPayable * (itemAmt / sumItemAmt);
                } else if (sumItemQty > 0) {
                    allocatedAmt = headerPayable * (itemQty / sumItemQty);
                } else {
                    allocatedAmt = headerPayable / rows.length;
                }
            } else {
                allocatedAmt = itemAmt;
            }
            salesRows.push({
                ...r,
                Amount: allocatedAmt
            });
        });
    });

    const categoryMap = new Map();
    const invoicesSet = new Set();
    const customersSet = new Set();

    let totalSalesQty = 0;
    let totalSalesAmt = 0;
    let totalReturnQty = 0;
    let totalReturnAmt = 0;

    salesRows.forEach(inv => {
        const isReturn = String(inv.OpCode || '').trim() === '13';
        const qty = parseFloat(inv.Quantity || 0);
        const amt = parseFloat(inv.Amount || 0);
        const catName = classifyMajorCategory(inv.GroupName, inv.ItemName, inv.ItemCode);

        if (inv.InvoiceNum || inv.DocId) invoicesSet.add(inv.InvoiceNum || inv.DocId);
        if (inv.CustomerName) customersSet.add(inv.CustomerName);

        if (isReturn) {
            totalReturnQty += qty;
            totalReturnAmt += amt;
        } else {
            totalSalesQty += qty;
            totalSalesAmt += amt;
        }

        if (!categoryMap.has(catName)) {
            categoryMap.set(catName, {
                name: catName,
                salesQty: 0,
                salesAmt: 0,
                returnQty: 0,
                returnAmt: 0
            });
        }

        const entry = categoryMap.get(catName);
        if (isReturn) {
            entry.returnQty += qty;
            entry.returnAmt += amt;
        } else {
            entry.salesQty += qty;
            entry.salesAmt += amt;
        }
    });

    const categoryList = Array.from(categoryMap.values()).map(c => {
        const netWgt = c.salesQty - c.returnQty;
        const netAmt = c.salesAmt - c.returnAmt;
        const netFee = netWgt > 0 ? netAmt / netWgt : 0;
        return {
            ...c,
            netWgt,
            netAmt,
            netFee
        };
    });

    categoryList.sort((a, b) => {
        const indexA = BOT_MAJOR_CATEGORIES.indexOf(a.name);
        const indexB = BOT_MAJOR_CATEGORIES.indexOf(b.name);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
    });

    const netWeight = totalSalesQty - totalReturnQty;
    const netAmount = totalSalesAmt - totalReturnAmt;
    const avgFee = netWeight > 0 ? netAmount / netWeight : 0;

    return {
        salesRows,
        categoryList,
        categoryMap,
        summary: {
            totalSalesQty,
            totalSalesAmt,
            totalReturnQty,
            totalReturnAmt,
            netWeight,
            netAmount,
            avgFee,
            invoiceCount: invoicesSet.size,
            customerCount: customersSet.size,
            shamsiFrom,
            shamsiTo,
            gregFrom,
            gregTo
        }
    };
}

export const hasSayanReportsAccess = (user, section) => {
    if (!user) return false;
    if (['admin', 'ceo', 'financial'].includes(user.role)) return true;
    
    // Check if overall report access is explicitly revoked
    if (user.canAccessBotReports === false && user.canViewSayanReports === false && user.canAccessSayanReports === false) {
        return false;
    }
    
    // Check granular sections if requested
    if (section === 'balances' && user.canAccessSayanBalances === false) return false;
    if (section === 'pending' && user.canAccessSayanPendingDocs === false) return false;
    if (section === 'daily_sales' && user.canAccessSayanDailySales === false) return false;
    if (section === 'compare_sales' && user.canAccessSayanCompareSales === false) return false;

    return true;
};

export const getSayanReportsKeyboard = (user) => {
    const buttons = [];
    if (hasSayanReportsAccess(user, 'balances')) {
        buttons.push([{ text: '💳 استعلام و مانده حساب مشتریان', callback_data: 'SALES_CUSTOMER_BALANCES' }]);
    }
    if (hasSayanReportsAccess(user, 'pending')) {
        buttons.push([{ text: '📜 گزارش اسناد و چک‌های آویزان (PDF)', callback_data: 'BOT_SAYAN_PENDING_DOCS' }]);
    }
    if (hasSayanReportsAccess(user, 'daily_sales')) {
        buttons.push([{ text: '🧾 فاکتور فروش روزانه سایان (PDF)', callback_data: 'BOT_SAYAN_DAILY_SALES' }]);
    }
    if (hasSayanReportsAccess(user, 'compare_sales')) {
        buttons.push([{ text: '⚖️ مقایسه تحلیل فروش دو بازه (PDF)', callback_data: 'BOT_SAYAN_COMPARE_SALES' }]);
    }
    if (hasSayanReportsAccess(user, 'balances')) {
        buttons.push([
            { text: '🔴 دانلود بدهکاران (PDF)', callback_data: 'SALES_BAL_DOWNLOAD_DEBTORS' },
            { text: '📊 اکسل بدهکاران', callback_data: 'SALES_BAL_DOWNLOAD_DEBTORS_XLSX' }
        ]);
        buttons.push([
            { text: '🟢 دانلود بستانکاران (PDF)', callback_data: 'SALES_BAL_DOWNLOAD_CREDITORS' },
            { text: '📈 اکسل بستانکاران', callback_data: 'SALES_BAL_DOWNLOAD_CREDITORS_XLSX' }
        ]);
    }
    buttons.push([{ text: '🔙 بازگشت به گزارشات مدیریتی', callback_data: 'MENU_REPORTS' }]);
    return { inline_keyboard: buttons };
};

export const matchAccountCode = (bCode, inputCode) => {
    if (!bCode || !inputCode) return false;
    const bc = String(bCode).trim().toLowerCase();
    const ic = String(inputCode).trim().toLowerCase();
    if (bc === ic) return true;
    
    // Compare without leading zeros
    const bcNoZeros = bc.replace(/^0+/, '');
    const icNoZeros = ic.replace(/^0+/, '');
    if (bcNoZeros && icNoZeros && bcNoZeros === icNoZeros) return true;
    
    return false;
};

export const getCustomerBalancesData = async (db) => {
    let list = [];

    if (db.settings?.sayanApiUrl) {
        try {
            // 1. Fetch Tafsilis
            const tafsiliSql = `
                SELECT DISTINCT 
                    Field_003 as Code, 
                    Field_006 as Name, 
                    Field_005 as TafsiliCode,
                    Field_004 as MoeinGroup
                FROM ACT_TBL_007 
                WHERE Field_004 LIKE '11%' OR Field_004 LIKE '31%' OR Field_003 LIKE '11%' OR Field_003 LIKE '31%'
            `;
            const tafsilis = await runSayanQuery(db, tafsiliSql);

            // 2. Fetch Traz
            const trazSql = `
                SELECT 
                    t24.Field_010 as TafsiliRaw,
                    SUM(CAST(t24.Field_006 AS FLOAT)) as TotalBed,
                    SUM(CAST(t24.Field_007 AS FLOAT)) as TotalBes
                FROM ACT_TBL_024 t24
                WHERE (t24.Field_010 LIKE '11%' OR t24.Field_010 LIKE '%-11%' OR t24.Field_010 LIKE '31%' OR t24.Field_010 LIKE '%-31%') 
                  AND t24.Field_010 NOT LIKE '%-12%'
                  AND t24.Field_010 NOT LIKE '%-13%'
                  AND t24.Field_005 NOT IN ('102', '103', '107', '109', '114', '116', '117')
                  AND t24.Field_003 <> '9'
                GROUP BY t24.Field_010
            `;
            const rawRows = await runSayanQuery(db, trazSql);

            // Helper to parse TafsiliRaw
            const parseTafsiliRaw = (raw) => {
                if (!raw) return { moein: '', code: '' };
                const parts = raw.split('-');
                for (const part of parts) {
                    const match = part.match(/^(11\d*|31\d*):(\d+)/);
                    if (match) {
                        return { moein: match[1], code: match[2] };
                    }
                }
                const match = raw.match(/(11\d*|31\d*):(\d+)/);
                if (match) {
                    return { moein: match[1], code: match[2] };
                }
                return { moein: '', code: '' };
            };

            // 3. Map and group
            const groupedMap = new Map();
            rawRows.forEach((row) => {
                const parsed = parseTafsiliRaw(row.TafsiliRaw);
                const code = parsed.code;
                if (!code) return;
                
                const tafsili = tafsilis.find(t => matchAccountCode(t.Code, code) || matchAccountCode(t.TafsiliCode, code));
                const name = tafsili ? tafsili.Name : `کد اشخاص ${code}`;
                const bed = parseFloat(row.TotalBed || 0);
                const bes = parseFloat(row.TotalBes || 0);
                
                if (groupedMap.has(code)) {
                    const existing = groupedMap.get(code);
                    existing.bed += bed;
                    existing.bes += bes;
                    existing.balance = existing.bed - existing.bes;
                } else {
                    groupedMap.set(code, {
                        accountCode: code,
                        name,
                        bed,
                        bes,
                        balance: bed - bes
                    });
                }
            });

            list = Array.from(groupedMap.values())
                .filter((r) => r.balance !== 0)
                .map((r) => ({
                    accountCode: r.accountCode,
                    name: r.name,
                    balance: Math.abs(r.balance),
                    type: r.balance > 0 ? 'بدهکار' : 'بستانکار',
                    rawBalance: r.balance,
                    updatedAt: Date.now()
                }));
        } catch (err) {
            console.error("Failed to query live Sayan balances:", err);
        }
    }

    if (list.length === 0) {
        return db.customerBalances || [];
    }
    return list;
};

const getTehranOffsetDateString = (offsetDays = 0) => {
    const now = new Date();
    const target = new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000);
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tehran',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(target);
};

export const generateAndSendComparisonPDF = async (db, chatId, sendFn, sendDocFn, dateFromA, dateToA, dateFromB, dateToB, nameA = "بازه اول", nameB = "بازه دوم") => {
    const labelA = `${nameA} (${dateFromA}${dateFromA !== dateToA ? ' تا ' + dateToA : ''})`;
    const labelB = `${nameB} (${dateFromB}${dateFromB !== dateToB ? ' تا ' + dateToB : ''})`;
    await sendFn(chatId, `⏳ در حال محاسبه و استعلام گزارش مقایسه‌ای فروش سایان (دوره A: ${labelA} در برابر دوره B: ${labelB})... لطفا شکیبا باشید.`);
    
    try {
        const [dataA, dataB] = await Promise.all([
            fetchProcessedSayanSalesData(db, dateFromA, dateToA),
            fetchProcessedSayanSalesData(db, dateFromB, dateToB)
        ]);

        const mapA = dataA.categoryMap;
        const mapB = dataB.categoryMap;

        const presentCats = new Set([...mapA.keys(), ...mapB.keys()]);
        const allCatNames = [];
        
        BOT_MAJOR_CATEGORIES.forEach(cat => {
            if (presentCats.has(cat)) {
                allCatNames.push(cat);
                presentCats.delete(cat);
            }
        });
        presentCats.forEach(cat => {
            allCatNames.push(cat);
        });

        const columns = ['ردیف', 'گروه اصلی کالا', 'وزن A (ک‌گ)', 'مبلغ A (ریال)', 'وزن B (ک‌گ)', 'مبلغ B (ریال)', 'تغییر وزن %', 'تغییر مبلغ %', 'تغییر فی %'];
        const tableRows = [];
        let index = 1;

        let totalWgtA = 0, totalAmtA = 0;
        let totalWgtB = 0, totalAmtB = 0;

        for (const catName of allCatNames) {
            const rowA = mapA.get(catName) || { salesQty: 0, salesAmt: 0, returnQty: 0, returnAmt: 0 };
            const rowB = mapB.get(catName) || { salesQty: 0, salesAmt: 0, returnQty: 0, returnAmt: 0 };

            const wgtA = rowA.salesQty - rowA.returnQty;
            const amtA = rowA.salesAmt - rowA.returnAmt;
            const feeA = wgtA > 0 ? amtA / wgtA : 0;

            const wgtB = rowB.salesQty - rowB.returnQty;
            const amtB = rowB.salesAmt - rowB.returnAmt;
            const feeB = wgtB > 0 ? amtB / wgtB : 0;

            totalWgtA += wgtA;
            totalAmtA += amtA;
            totalWgtB += wgtB;
            totalAmtB += amtB;

            const diffQty = wgtA - wgtB;
            const qtyPct = wgtB > 0 ? ((diffQty / wgtB) * 100).toFixed(1) : (wgtA > 0 ? '+100' : '0');
            const qtyPctStr = Number(qtyPct) >= 0 ? `+${qtyPct}%` : `${qtyPct}%`;

            const diffAmt = amtA - amtB;
            const amtPct = amtB > 0 ? ((diffAmt / amtB) * 100).toFixed(1) : (amtA > 0 ? '+100' : '0');
            const amtPctStr = Number(amtPct) >= 0 ? `+${amtPct}%` : `${amtPct}%`;

            const diffFee = feeA - feeB;
            const feePct = feeB > 0 ? ((diffFee / feeB) * 100).toFixed(1) : (feeA > 0 ? '+100' : '0');
            const feePctStr = Number(feePct) >= 0 ? `+${feePct}%` : `${feePct}%`;

            tableRows.push([
                (index++).toLocaleString('fa-IR'),
                catName,
                wgtA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                Math.round(amtA).toLocaleString('fa-IR') + ' ریال',
                wgtB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
                Math.round(amtB).toLocaleString('fa-IR') + ' ریال',
                qtyPctStr,
                amtPctStr,
                feePctStr
            ]);
        }

        const avgFeeA = totalWgtA > 0 ? (totalAmtA / totalWgtA) : 0;
        const avgFeeB = totalWgtB > 0 ? (totalAmtB / totalWgtB) : 0;

        const totalDiffQty = totalWgtA - totalWgtB;
        const totalQtyPct = totalWgtB > 0 ? ((totalDiffQty / totalWgtB) * 100).toFixed(1) : (totalWgtA > 0 ? '+100' : '0');
        const totalQtyPctStr = Number(totalQtyPct) >= 0 ? `+${totalQtyPct}%` : `${totalQtyPct}%`;

        const totalDiffAmt = totalAmtA - totalAmtB;
        const totalAmtPct = totalAmtB > 0 ? ((totalDiffAmt / totalAmtB) * 100).toFixed(1) : (totalAmtA > 0 ? '+100' : '0');
        const totalAmtPctStr = Number(totalAmtPct) >= 0 ? `+${totalAmtPct}%` : `${totalAmtPct}%`;

        const totalDiffFee = avgFeeA - avgFeeB;
        const totalFeePct = avgFeeB > 0 ? ((totalDiffFee / avgFeeB) * 100).toFixed(1) : (avgFeeA > 0 ? '+100' : '0');
        const totalFeePctStr = Number(totalFeePct) >= 0 ? `+${totalFeePct}%` : `${totalFeePct}%`;

        tableRows.push([
            'جمع کل',
            'خلاصه کل عملکرد',
            totalWgtA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
            Math.round(totalAmtA).toLocaleString('fa-IR') + ' ریال',
            totalWgtB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ک‌گ',
            Math.round(totalAmtB).toLocaleString('fa-IR') + ' ریال',
            totalQtyPctStr,
            totalAmtPctStr,
            totalFeePctStr
        ]);

        const title = `گزارش مدیریتی و تحلیلی مقایسه فروش (دوره A: ${labelA} | دوره B: ${labelB})`;
        const pdfBuffer = await Renderer.generateReportPDF(title, columns, tableRows, true);
        const filename = `Sayan_Sales_Comparison_${dateFromA}_VS_${dateFromB}.pdf`;

        const caption = `📊 *گزارش مدیریتی و تحلیلی مقایسه‌ای فروش (سایان ERP)*\n\n` +
            `🔹 **دوره A (${labelA}):**\n` +
            `   📦 وزن کل: ${totalWgtA.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} کیلوگرم\n` +
            `   💰 مبلغ کل: ${Math.round(totalAmtA).toLocaleString('fa-IR')} ریال\n` +
            `   🏷 فی متوسط: ${Math.round(avgFeeA).toLocaleString('fa-IR')} ریال/ک‌گ\n\n` +
            `🔸 **دوره B (${labelB}):**\n` +
            `   📦 وزن کل: ${totalWgtB.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} کیلوگرم\n` +
            `   💰 مبلغ کل: ${Math.round(totalAmtB).toLocaleString('fa-IR')} ریال\n` +
            `   🏷 فی متوسط: ${Math.round(avgFeeB).toLocaleString('fa-IR')} ریال/ک‌گ\n\n` +
            `📈 **تغییرات وزن:** ${totalQtyPctStr}\n` +
            `💵 **تغییرات مبلغ:** ${totalAmtPctStr}\n` +
            `📊 **تغییرات فی متوسط:** ${totalFeePctStr}`;

        await sendDocFn(chatId, pdfBuffer, filename, caption);
    } catch (err) {
        console.error("Bot Comparative Sales Error:", err);
        sendFn(chatId, `❌ خطا در استعلام گزارش مقایسه‌ای سایان: ${err.message}`);
    }
};

const getAvailableYears = (list) => {
    const years = new Set();
    list.forEach(o => {
        const sh = toShamsiYearMonth(o.date);
        if (sh) years.add(sh.split('/')[0]);
    });
    const sorted = Array.from(years).sort().reverse();
    if (sorted.length === 0) return ['1403'];
    return sorted;
};

const generateExcelBuffer = (columns, rows, sheetName = "Report") => {
    const wsData = [columns, ...rows];
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(wsData);
    
    // Set column widths so content is not truncated
    const maxCols = columns.length;
    const colWidths = [];
    for (let c = 0; c < maxCols; c++) {
        let maxLen = columns[c] ? columns[c].toString().length : 0;
        for (let r = 0; r < wsData.length; r++) {
            if (wsData[r] && wsData[r][c] !== undefined && wsData[r][c] !== null) {
                const len = wsData[r][c].toString().length;
                if (len > maxLen) maxLen = len;
            }
        }
        colWidths.push({ wch: Math.max(maxLen + 3, 10) });
    }
    ws['!cols'] = colWidths;
    
    xlsx.utils.book_append_sheet(wb, ws, sheetName);
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
};

// --- KEYBOARDS ---
const KEYBOARDS = {
    MAIN: {
        inline_keyboard: [
            [{ text: '💰 مدیریت پرداخت', callback_data: 'MENU_PAY' }, { text: '🚛 مدیریت خروج', callback_data: 'MENU_EXIT' }],
            [{ text: '📦 انبار و موجودی', callback_data: 'MENU_WH' }, { text: '🌍 بازرگانی', callback_data: 'MENU_TRADE' }],
            [{ text: '🛒 فروش', callback_data: 'MENU_SALES' }, { text: '📂 دبیرخانه اداری', callback_data: 'MENU_SEC' }],
            [{ text: '📑 تبدیل و ادغام عکس/PDF به تک‌فایل PDF', callback_data: 'ACT_MERGE_PDF_START' }],
            [{ text: '📊 گزارشات مدیریتی', callback_data: 'MENU_REPORTS' }, { text: 'ℹ️ اطلاعات شرکت و بانک‌ها', callback_data: 'ACT_KNOWLEDGE' }],
            [{ text: '👤 پروفایل', callback_data: 'MENU_PROFILE' }]
        ]
    },
    SECRETARIAT: {
        inline_keyboard: [
            [{ text: '📥 نامه‌های منتظر تایید من', callback_data: 'SEC_PENDING' }],
            [{ text: '📂 آخرین نامه‌های کارتابل', callback_data: 'SEC_CARTABLE_LATEST' }],
            [{ text: '🔎 جستجو در نامه‌ها', callback_data: 'SEC_SEARCH' }],
            [{ text: '➕ ثبت نامه جدید (ارسال فایل)', callback_data: 'SEC_NEW_LETTER_FLOW' }],
            [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'MENU_MAIN' }]
        ]
    },
    SALES: {
        inline_keyboard: [
            [{ text: '💳 استعلام و مانده حساب مشتریان', callback_data: 'SALES_CUSTOMER_BALANCES' }],
            [{ text: '🔍 جستجوی کالا (نام/کد)', callback_data: 'SALES_SEARCH' }],
            [{ text: '🔖 دسته‌بندی محصولات (هرمی)', callback_data: 'SALES_GROUPS' }],
            [{ text: '📦 لیست کامل قیمت محصولات', callback_data: 'SALES_LIST_ALL' }],
            [{ text: '📢 ارسال پیام گروهی به مشتریان', callback_data: 'SALES_BROADCAST' }],
            [{ text: '🛒 ورود به بخش مشتریان', callback_data: 'GUEST_MAIN' }],
            [{ text: '🏢 ارسال اطلاعات شرکت به مشتری', callback_data: 'ACT_SEND_CO_INFO' }],
            [{ text: '🔙 بازگشت', callback_data: 'MENU_MAIN' }]
        ]
    },
    PAYMENT: {
        inline_keyboard: [
            [{ text: '➕ ثبت دستور پرداخت', callback_data: 'ACT_PAY_NEW' }],
            [{ text: '📂 کارتابل پرداخت (تایید)', callback_data: 'ACT_PAY_CARTABLE' }],
            [{ text: '🔎 جستجو با شماره', callback_data: 'ACT_SEARCH_ID_PAY' }, { text: '🗄️ آرشیو تاریخی', callback_data: 'ACT_ARCHIVE_PAY' }],
            [{ text: '📎 افزودن پیوست به سند پرداخت (عکس/PDF)', callback_data: 'ACT_ATTACH_PAY_START' }],
            [{ text: '🔙 بازگشت', callback_data: 'MENU_MAIN' }]
        ]
    },
    EXIT: {
        inline_keyboard: [
            [{ text: '➕ ثبت مجوز خروج', callback_data: 'ACT_EXIT_NEW' }],
            [{ text: '📂 کارتابل خروج (تایید/رد)', callback_data: 'ACT_EXIT_CARTABLE' }],
            [{ text: '🔎 جستجو با شماره', callback_data: 'ACT_SEARCH_ID_EXIT' }, { text: '🗄️ آرشیو تاریخی', callback_data: 'ACT_ARCHIVE_EXIT' }],
            [{ text: '🔙 بازگشت', callback_data: 'MENU_MAIN' }]
        ]
    },
    WAREHOUSE: {
        inline_keyboard: [
            [{ text: '➕ ثبت بیجک خروج', callback_data: 'ACT_WH_NEW_BIJAK' }],
            [{ text: '📂 کارتابل انبار (تایید/رد)', callback_data: 'ACT_WH_CARTABLE' }], 
            [{ text: '🔎 جستجو بیجک (شماره)', callback_data: 'ACT_SEARCH_ID_WH' }],
            [{ text: '🗄️ آرشیو بیجک‌ها', callback_data: 'ACT_ARCHIVE_WH_OUT' }, { text: '🗄️ آرشیو رسیدها', callback_data: 'ACT_ARCHIVE_WH_IN' }],
            [{ text: '📦 گزارش موجودی (PDF)', callback_data: 'WH_RPT_STOCK' }, { text: '📊 گزارش خروج (PDF/Excel)', callback_data: 'WH_RPT_DISPATCH_PROMPT' }],
            [{ text: '🔙 بازگشت', callback_data: 'MENU_MAIN' }]
        ]
    },
    TRADE: {
        inline_keyboard: [
            [{ text: '📂 لیست پرونده‌های فعال (PDF)', callback_data: 'TRD_RPT_ACTIVE' }],
            [{ text: '⏳ گزارش صف تخصیص ارز (PDF)', callback_data: 'TRD_RPT_ALLOCATION' }],
            [{ text: '💰 گزارش خرید ارز (PDF)', callback_data: 'TRD_RPT_CURRENCY' }],
            [{ text: '🛡️ گزارش تضامین و بیمه (PDF)', callback_data: 'TRD_RPT_INSURANCE' }],
            [{ text: '🔙 بازگشت', callback_data: 'MENU_MAIN' }]
        ]
    },
    REPORTS: { 
        inline_keyboard: [
            [{ text: '📊 خلاصه وضعیت امور جاری', callback_data: 'RPT_DAILY' }],
            [{ text: '🗓 عملکرد ماه جاری سیستم', callback_data: 'RPT_MONTHLY' }],
            [{ text: '🏢 گزارشات حسابداری و ERP سایان (مانده، آویزان و فروش)', callback_data: 'SAYAN_REPORTS_MENU' }],
            [{ text: '⏳ وضعیت کارتابل‌ها (پاسخ‌نشده)', callback_data: 'RPT_PENDING' }],
            [{ text: '🔙 بازگشت', callback_data: 'MENU_MAIN' }]
        ] 
    },
    SAYAN_REPORTS: {
        inline_keyboard: [
            [{ text: '💳 استعلام و مانده حساب مشتریان', callback_data: 'SALES_CUSTOMER_BALANCES' }],
            [{ text: '📜 گزارش اسناد و چک‌های آویزان (PDF)', callback_data: 'BOT_SAYAN_PENDING_DOCS' }],
            [{ text: '🧾 فاکتور فروش روزانه سایان (PDF)', callback_data: 'BOT_SAYAN_DAILY_SALES' }],
            [{ text: '⚖️ مقایسه تحلیل فروش دو بازه (PDF)', callback_data: 'BOT_SAYAN_COMPARE_SALES' }],
            [{ text: '🔴 دانلود لیست بدهکاران (PDF)', callback_data: 'SALES_BAL_DOWNLOAD_DEBTORS' }, { text: '📊 اکسل بدهکاران', callback_data: 'SALES_BAL_DOWNLOAD_DEBTORS_XLSX' }],
            [{ text: '🟢 دانلود لیست بستانکاران (PDF)', callback_data: 'SALES_BAL_DOWNLOAD_CREDITORS' }, { text: '📈 اکسل بستانکاران', callback_data: 'SALES_BAL_DOWNLOAD_CREDITORS_XLSX' }],
            [{ text: '🔙 بازگشت به گزارشات مدیریتی', callback_data: 'MENU_REPORTS' }]
        ]
    },
    BACK: { inline_keyboard: [[{ text: '🔙 انصراف', callback_data: 'MENU_MAIN' }]] }
};

// --- GENERIC SEARCH FUNCTION ---
const searchAndSendResults = async (db, company, query, mode, type, platform, chatId, sendFn, sendPhotoFn) => {
    let sourceData = [];
    let imageType = '';
    
    if (type === 'PAYMENT') { sourceData = db.orders || []; imageType = 'PAYMENT'; }
    else if (type === 'EXIT') { sourceData = db.exitPermits || []; imageType = 'EXIT'; }
    else if (type === 'WH_OUT' || type === 'WH_BIJAK') { sourceData = (db.warehouseTransactions || []).filter(t => t.type === 'OUT'); imageType = 'BIJAK'; }
    else if (type === 'WH_IN') { sourceData = (db.warehouseTransactions || []).filter(t => t.type === 'IN'); imageType = 'RECEIPT'; }

    const results = sourceData.filter(o => {
        // ID Search Logic
        if (mode === 'ID') {
            const num = (o.trackingNumber || o.permitNumber || o.number || '').toString();
            return num.includes(query);
        }

        const itemCompany = o.company || o.payingCompany;
        if (company && itemCompany !== company) return false;
        
        if (mode === 'MONTH') {
            const shamsiMonth = toShamsiYearMonth(o.date);
            return shamsiMonth === query;
        } else if (mode === 'EXACT_DAY') {
            try {
                const d = new Date(o.date);
                const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' });
                const parts = formatter.formatToParts(d);
                const y = parts.find(p=>p.type==='year')?.value;
                const m = parts.find(p=>p.type==='month')?.value;
                const d_ = parts.find(p=>p.type==='day')?.value;
                return `${y}/${m}/${d_}` === query;
            } catch(e) { return false; }
        }
        return false;
    });

    if (results.length === 0) {
        return sendFn(chatId, `❌ موردی یافت نشد.`);
    }

    await sendFn(chatId, `✅ تعداد ${results.length} سند یافت شد. در حال ارسال...`);

    // Limit results to 10 to avoid spamming
    const limitedResults = results.slice(0, 10);

    for (const item of limitedResults) {
        let caption = '';
        let kb = undefined;
        let pdfCallback = '';

        try {
            if (type === 'PAYMENT') {
                const hasAtt = (item.attachments && item.attachments.length > 0) || (item.archiveAttachments && item.archiveAttachments.length > 0);
                const attCount = (item.attachments?.length || 0) + (item.archiveAttachments?.length || 0);

                caption = `📄 *دستور پرداخت #${item.trackingNumber}*\n🏢 شرکت: ${item.payingCompany || '-'}\n📅 تاریخ: ${toShamsiFull(item.date)}\n👤 ذینفع: ${item.payee}\n💰 مبلغ: ${parseInt(item.totalAmount).toLocaleString()} ریال\n📝 بابت: ${item.description}\n🔄 وضعیت: ${item.status}\n👤 درخواست‌کننده: ${item.requester || '-'}\n📎 پیوست: ${hasAtt ? `✅ دارد (${attCount} فایل)` : '❌ ندارد'}`;
                
                const btnRow1 = [{ text: '📥 دریافت PDF سند', callback_data: `GEN_PDF_ORDER_${item.id}` }];
                if (hasAtt) {
                    btnRow1.push({ text: `📎 مشاهده پیوست‌ها (${attCount})`, callback_data: `ACT_VIEW_PAY_ATTACH_${item.id}` });
                }
                const btnRow2 = [{ text: '📎 افزودن پیوست (عکس/PDF)', callback_data: `ACT_ATTACH_PAY_FOR_${item.id}` }];
                const btnRow3 = [
                    { text: '🔙 بازگشت', callback_data: 'MENU_PAY' },
                    { text: '🏠 منوی اصلی', callback_data: 'MENU_MAIN' }
                ];
                
                kb = { inline_keyboard: [btnRow1, btnRow2, btnRow3] };
            } else if (type === 'EXIT') {
                const totalReqCount = (item.items && item.items.length > 0) 
                    ? item.items.reduce((sum, i) => sum + (Number(i.cartonCount) || 0), 0)
                    : (Number(item.cartonCount) || 0);
                const showDeliv = item.items && item.items.some(i => i.deliveredCartonCount !== undefined);
                const totalDelivCount = showDeliv ? (item.items||[]).reduce((sum, i) => sum + (Number(i.deliveredCartonCount) || 0), 0) : totalReqCount;
                
                caption = `🚛 *مجوز خروج کالا #${item.permitNumber}*\n🏢 شرکت: ${item.company || '-'}\n📅 تاریخ: ${toShamsiFull(item.date)}\n👤 گیرنده: ${item.recipientName}\n📦 کالا: ${item.goodsName || 'چند مورد'}\n🔢 تعداد درخواستی: ${totalReqCount} ${showDeliv ? `\n✅ تعداد خروجی (انبار): ${totalDelivCount}` : ''}\n🔄 وضعیت: ${item.status}\n👤 درخواست‌کننده: ${item.requester || '-'}`;
                
                const btnRow1 = [{ text: '📥 دریافت PDF', callback_data: `GEN_PDF_EXIT_${item.id}` }];
                const btnRow2 = [
                    { text: '🔙 بازگشت', callback_data: 'MENU_EXIT' },
                    { text: '🏠 منوی اصلی', callback_data: 'MENU_MAIN' }
                ];
                kb = { inline_keyboard: [btnRow1, btnRow2] };
            } else if (type === 'WH_OUT' || type === 'WH_BIJAK') {
                caption = `📦 *حواله انبار (بیجک) #${item.number}*\n📅 تاریخ: ${toShamsiFull(item.date)}\n👤 گیرنده: ${item.recipientName}\n🚛 راننده: ${item.driverName||'-'}`;
                const btnRow1 = [{ text: '📥 دریافت PDF', callback_data: `GEN_PDF_BIJAK_${item.id}` }];
                const btnRow2 = [
                    { text: '🔙 بازگشت', callback_data: 'MENU_WH' },
                    { text: '🏠 منوی اصلی', callback_data: 'MENU_MAIN' }
                ];
                kb = { inline_keyboard: [btnRow1, btnRow2] };
            } else if (type === 'WH_IN') {
                caption = `📥 *رسید ورود #${item.proformaNumber}*\n📅 تاریخ: ${toShamsiFull(item.date)}\n📦 اقلام: ${item.items.length} ردیف`;
                const btnRow1 = [
                    { text: '🔙 بازگشت', callback_data: 'MENU_WH' },
                    { text: '🏠 منوی اصلی', callback_data: 'MENU_MAIN' }
                ];
                kb = { inline_keyboard: [btnRow1] };
            }

            let img = null;
            try {
                img = await Renderer.generateRecordImage(item, imageType, { forceHidePrices: false });
            } catch (renderErr) {
                console.warn("[Search Record Render Image Error]:", renderErr.message);
            }

            let photoSent = false;
            if (img && img.length > 0 && sendPhotoFn) {
                try {
                    await sendPhotoFn(platform, chatId, img, caption, { reply_markup: kb });
                    photoSent = true;
                } catch (photoErr) {
                    console.warn("[Search Send Photo Failed, falling back to text]:", photoErr.message);
                }
            }

            if (!photoSent) {
                await sendFn(chatId, caption, { reply_markup: kb });
            }
        } catch (e) {
            console.error("[searchAndSendResults Item Error]:", e);
            try {
                if (caption) {
                    await sendFn(chatId, caption, { reply_markup: kb });
                }
            } catch (_) {}
        }
    }
    
    if (results.length > 10) {
        await sendFn(chatId, `⚠️ ... و ${results.length - 10} مورد دیگر. لطفا جستجو را محدودتر کنید.`);
    }
};

export const runDailyReport = async (platform, chatId, dateStr, sendFn, sendDocFn) => {
    const db = getDb();
    const settings = db.settings || {};

    const toEnglishDigits = (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    };

    const normalizeDateString = (str) => {
        if (!str) return str;
        return str.split('/').map(part => part.padStart(2, '0')).join('/');
    };

    const matchesDate = (dateVal) => {
        if (!dateVal) return false;
        const normalizedInput = normalizeDateString(toEnglishDigits(String(dateVal)));
        if (normalizedInput.includes('/') && normalizedInput.length >= 8) {
             // It's likely already a shamsi string
             return normalizedInput.startsWith(dateStr) || normalizedInput === dateStr;
        }
        try {
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return false;
            
            // Explicitly format in Tehran timezone to avoid UTC shifts
            const fmt = new Intl.DateTimeFormat('fa-IR', { 
                year: 'numeric', month: '2-digit', day: '2-digit', 
                timeZone: 'Asia/Tehran' 
            });
            const shamsiRaw = fmt.format(d);
            return normalizeDateString(toEnglishDigits(shamsiRaw)) === dateStr;
        } catch(e) { return false; }
    };

    // Determine which reports to show. If it's a recognized group, show only that module.
    // If it's not a recognized group (e.g. ad-hoc request), show all available for that date.
    
    const matchesId = (cid, sid) => {
        if (!sid) return false;
        const n1 = normalizeChannelId(cid);
        const n2 = normalizeChannelId(sid);
        return n1 && n2 && n1 === n2;
    };

    const g1 = settings.exitPermitFirstGroupConfig || {};
    const g2 = settings.exitPermitSecondGroupConfig || {};
    const g3 = settings.exitPermitThirdGroupConfig || {};

    const isKnownAccounting = 
        (platform === 'telegram' && (matchesId(chatId, settings.botAccountingGroupIdTele) || matchesId(chatId, settings.botAccountingGroupId))) ||
        (platform === 'bale' && matchesId(chatId, settings.botAccountingGroupIdBale)) ||
        (platform === 'whatsapp' && (matchesId(chatId, settings.botAccountingGroupIdWhatsApp) || matchesId(chatId, settings.botAccountingGroupId)));

    const isKnownBijak = 
        (platform === 'telegram' && matchesId(chatId, settings.botBijakGroupId)) ||
        (platform === 'bale' && matchesId(chatId, settings.botBijakGroupIdBale)) ||
        (platform === 'whatsapp' && matchesId(chatId, settings.botBijakGroupIdWhatsApp));

    const isKnownLogistics = 
        (platform === 'telegram' && (matchesId(chatId, settings.exitPermitNotificationTelegramId) || matchesId(chatId, settings.botSecurityGroupId) || matchesId(chatId, g1.telegramId) || matchesId(chatId, g2.telegramId) || matchesId(chatId, g3.telegramId) || matchesId(chatId, settings.dailyExitReportDedicatedTelegramId))) ||
        (platform === 'bale' && (matchesId(chatId, settings.exitPermitNotificationBaleId) || matchesId(chatId, g1.baleId) || matchesId(chatId, g2.baleId) || matchesId(chatId, g3.baleId) || matchesId(chatId, settings.dailyExitReportDedicatedBaleId))) ||
        (platform === 'whatsapp' && (matchesId(chatId, settings.exitPermitNotificationGroup) || matchesId(chatId, g1.groupId) || matchesId(chatId, g2.groupId) || matchesId(chatId, g3.groupId) || matchesId(chatId, settings.dailyExitReportDedicatedWhatsAppId)));

    const isRecognized = isKnownAccounting || isKnownBijak || isKnownLogistics;

    const isGroup = chatId.toString().startsWith('-') || 
                  (platform === 'bale' && (chatId.toString().startsWith('g') || chatId.toString().length > 10)) ||
                  chatId.toString().includes('@') ||
                  isRecognized;

    const isPrivate = !isGroup;

    // Determine which reports to show based on group context
    // If it's a recognized group, ONLY show that specific module.
    // If it's a private chat and not recognized as a specific group, show everything.
    const showPayments = isKnownAccounting || (isPrivate && !isRecognized);
    const showBijaks = isKnownBijak || (isPrivate && !isRecognized);
    const showLogistics = isKnownLogistics || (isPrivate && !isRecognized);
    
    const showAll = isPrivate && !isRecognized;

    console.log(`[DailyReport] Platform: ${platform}, Chat: ${chatId}, Private: ${isPrivate}, Recognized: ${isRecognized}`);
    console.log(`[DailyReport] Roles: Accounting=${isKnownAccounting}, Bijak=${isKnownBijak}, Logistics=${isKnownLogistics}`);

    // If it's a group but UNRECOGNIZED, warn the user
    if (isGroup && !isRecognized) {
        return sendFn(chatId, `⚠️ این گروه در تنظیمات بات شناسایی نشد.\n🆔 شناسه چت: \`${chatId}\`\n✅ لطفا این شناسه را در بخش پیکربندی بات برای گروه‌های مربوطه (حسابداری، خروج یا بیجک) وارد کنید.`);
    }

    // 1. PAYMENT REPORT
    if (showPayments || showAll) {
        console.log(`[DailyReport] checking payments for date ${dateStr}`);
        const finalPayments = (db.orders || []).filter(p => matchesDate(p.date));
        if (finalPayments.length > 0) {
            console.log(`[DailyReport] found ${finalPayments.length} payments`);
            let reportMsg = `💰 *گزارش پرداختی‌های ${dateStr}*\n\n`;
            finalPayments.forEach((p, idx) => {
                const amount = Number(p.totalAmount || 0).toLocaleString();
                let paymentBankInfo = 'صندوق / نقدی';
                if (p.paymentDetails && p.paymentDetails.length > 0) {
                    const banks = [...new Set(p.paymentDetails.map(d => d.bankName || d.method).filter(Boolean))];
                    if (banks.length > 0) paymentBankInfo = banks.join('، ');
                }
                reportMsg += `${idx + 1}. *#${p.trackingNumber}* | بانک: ${paymentBankInfo}\n💵 مبلغ: ${amount} ریال\n👤 در وجه: ${p.payee}\n📝 بابت: ${p.description}\n📊 وضعیت: ${p.status}\n------------------\n`;
            });
            if (sendFn) await sendFn(chatId, reportMsg);

            if (sendFn) sendFn(chatId, `⏳ در حال تولید فایل PDF از تصاویر ${finalPayments.length} پرداخت...`).catch(()=>{});
            try {
                console.log(`[DailyReport] Generating Payment PDF for ${finalPayments.length} items...`);
                const htmlParts = [];
                for (const p of finalPayments) {
                    try {
                        const imgBuffer = await Renderer.generateRecordImage(p, 'PAYMENT', { forceHidePrices: false });
                        if (imgBuffer) {
                            const b64 = imgBuffer.toString('base64');
                            htmlParts.push(`<div style="page-break-after: always; text-align: center; height: 100vh; display: flex; align-items: center; justify-content: center;"><img src="data:image/png;base64,${b64}" style="max-height: 95vh; max-width: 95vw;" /></div>`);
                        }
                    } catch(e) { console.error(`[DailyReport] Failed to generate image for payment ${p.trackingNumber}:`, e.message); }
                }
                if (htmlParts.length > 0) {
                    console.log(`[DailyReport] HTML composed, calling generatePdfBuffer...`);
                    const pdfBuffer = await Renderer.generatePdfBuffer(htmlParts.join(''));
                    console.log(`[DailyReport] PDF buffer ready (${pdfBuffer.length} bytes). Sending...`);
                    if (sendDocFn) {
                        const res = await sendDocFn(chatId, pdfBuffer, `Payment_Report_${dateStr.replace(/[\/\\]/g,'-')}.pdf`, `💰 گزارش تصاویر پرداختی‌ها ${dateStr}`);
                        console.log(`[DailyReport] PDF send result:`, res ? "Success" : "Failed/Empty");
                    } else {
                        console.error(`[DailyReport] sendDocFn is not defined for ${platform}`);
                    }
                } else {
                    console.warn(`[DailyReport] No images generated for Payment PDF.`);
                }
            } catch (e) { console.error("PDF generation failed:", e); }
        } else if (isKnownAccounting) {
            if (sendFn) await sendFn(chatId, `📭 در تاریخ ${dateStr} پرداختی ثبت نشده است.`);
        }
    }

    // 2. BIJAK / LOGISTICS REPORT
    if (showBijaks || showLogistics || showAll) {
        // If it's logistics group or general request, show Exit Permits report, else if Bijak group show Bijak report
        const sBijak = showBijaks || showAll;
        const sLogistics = showLogistics || showAll;

        if (sBijak) {
            const finalBijaks = (db.warehouseTransactions || []).filter(t => t.type === 'OUT' && matchesDate(t.date));
            if (finalBijaks.length > 0) {
                const grouped = finalBijaks.reduce((acc, b) => {
                    const comp = b.company || 'بدون شرکت';
                    acc[comp] = acc[comp] || [];
                    acc[comp].push(b);
                    return acc;
                }, {});
                
                let reportMsg = `📦 *گزارش بیجک‌های انبار ${dateStr}*\n\n`;
                for (const [comp, bijaks] of Object.entries(grouped)) {
                    reportMsg += `🏢 *شرکت: ${comp}*\n`;
                    bijaks.forEach((b, idx) => {
                        reportMsg += `  ${idx + 1}. بیجک #${b.number} | گیرنده: ${b.recipientName} | راننده: ${b.driverName || '---'}\n`;
                    });
                    reportMsg += `------------------\n`;
                }
                
                if (sendFn) await sendFn(chatId, reportMsg).catch(e => console.error("Error sending Bijak msg:", e));

                if (sendFn) sendFn(chatId, `⏳ در حال تولید فایل PDF از تصاویر ${finalBijaks.length} بیجک...`).catch(()=>{});
                try {
                    console.log(`[DailyReport] Generating Bijak PDF for ${finalBijaks.length} items...`);
                    const htmlParts = [];
                    for (const b of finalBijaks) {
                        try {
                            const imgBuffer = await Renderer.generateRecordImage(b, 'BIJAK', { forceHidePrices: true });
                            if (imgBuffer) {
                                const b64 = imgBuffer.toString('base64');
                                htmlParts.push(`<div style="page-break-after: always; text-align: center; height: 100vh; display: flex; align-items: center; justify-content: center;"><img src="data:image/png;base64,${b64}" style="max-height: 95vh; max-width: 95vw;" /></div>`);
                            }
                        } catch(e) { console.error("Error generating image for bijak", b.id, e); }
                    }
                    if (htmlParts.length > 0) {
                        console.log(`[DailyReport] Bijak HTML composed, calling generatePdfBuffer...`);
                        const pdfBuffer = await Renderer.generatePdfBuffer(htmlParts.join(''));
                        console.log(`[DailyReport] Bijak PDF buffer ready (${pdfBuffer.length} bytes). Sending...`);
                        if (sendDocFn) {
                            await sendDocFn(chatId, pdfBuffer, `Bijak_Report_${dateStr.replace(/[\/\\]/g,'-')}.pdf`, `📦 گزارش تصاویر بیجک‌ها ${dateStr}`);
                        }
                    }
                } catch (e) { console.error("Bijak PDF generation failed:", e); }
            } else if (isKnownBijak) {
                if (sendFn) await sendFn(chatId, `📭 در تاریخ ${dateStr} بیجکی ثبت نشده است.`);
            }
        }

        // 3. EXIT PERMITS REPORT
        if (sLogistics) {
            console.log(`[DailyReport] checking exit permits for date ${dateStr}`);
            const finalExits = (db.exitPermits || []).filter(p => matchesDate(p.date));
            if (finalExits.length > 0) {
                console.log(`[DailyReport] found ${finalExits.length} exit permits`);
                const hidePrice = true; // Logistics groups always hide prices
                let reportMsg = `🚛 *گزارش مجوزهای خروج ${dateStr}*\n\n`;
                finalExits.forEach((p, idx) => {
                    const totalOutCount = (p.items||[]).reduce((sum, i) => sum + (Number(i.deliveredCartonCount ?? i.cartonCount) || 0), p.cartonCount || 0);
                    let goodsInfo = (p.items && p.items.length > 0) ? p.items.map(it => it.goodsName).join('، ') : (p.goodsName || 'چند مورد');
                    reportMsg += `${idx + 1}. *مجوز #${p.permitNumber}*\n🏢 شرکت: ${p.company || 'نامشخص'}\n👤 گیرنده: ${p.recipientName}\n📦 کالا: ${goodsInfo} (${totalOutCount} عدد)\n📊 وضعیت: ${p.status}\n------------------\n`;
                });
                if (sendFn) await sendFn(chatId, reportMsg);
                if (sendFn) sendFn(chatId, `⏳ در حال تولید فایل PDF از تصاویر ${finalExits.length} خروج...`).catch(()=>{});
                
                try {
                    console.log(`[DailyReport] Generating Exit PDF for ${finalExits.length} items...`);
                    const htmlParts = [];
                    for (const p of finalExits) {
                        try {
                            const imgBuffer = await Renderer.generateRecordImage(p, 'EXIT', { forceHidePrices: hidePrice });
                            if (imgBuffer) {
                                const b64 = imgBuffer.toString('base64');
                                htmlParts.push(`<div style="page-break-after: always; text-align: center; height: 100vh; display: flex; align-items: center; justify-content: center;"><img src="data:image/png;base64,${b64}" style="max-height: 95vh; max-width: 95vw;" /></div>`);
                            }
                        } catch(e) { console.error("Error generating image for permit", p.id, e); }
                    }
                    if (htmlParts.length > 0) {
                        console.log(`[DailyReport] Exit HTML composed, calling generatePdfBuffer...`);
                        const pdfBuffer = await Renderer.generatePdfBuffer(htmlParts.join(''));
                        console.log(`[DailyReport] Exit PDF buffer ready (${pdfBuffer.length} bytes). Sending...`);
                        if (sendDocFn) {
                            await sendDocFn(chatId, pdfBuffer, `Exit_Report_${dateStr.replace(/[\/\\]/g,'-')}.pdf`, `🚛 گزارش تصاویر خروج ${dateStr}`);
                        }
                    }
                } catch (e) { console.error("PDF generation failed:", e); }
            } else if (isKnownLogistics) {
                if (sendFn) await sendFn(chatId, `📭 در تاریخ ${dateStr} مجوزی ثبت نشده است.`);
            }
        }
    } 
    
    if (isUnrecognizedGroup) {
        // PV or Unregistered context
        // if we are here and nothing was sent (checked elsewhere or just fallback)
    }
};

// --- PRODUCT HELPERS ---
const formatProduct = (p) => {
    const priceTxt = p.hidePrice ? "📞 تماس با فروش" : `${Number(p.price || 0).toLocaleString()} ریال`;
    const stockTxt = p.hideStock ? "📞 تماس با فروش" : `${p.stock || 0} ${p.unit || 'عدد'}`;
    
    return `📁 گروه: ${p.group || 'بدون گروه'}\n🔹 زیرگروه: ${p.subgroup || 'سایر'}\n📦 کالا: ${p.name}\n💰 قیمت: ${priceTxt}\n📊 موجودی: ${stockTxt}\n`;
};

// --- MAIN HANDLERS ---

// --- PHONE SEARCH & SEND ---
export const sendBotMessageByPhone = async (phone, text, photoBase64 = null) => {
    if (!phone) return false;
    const db = getDb();
    const cleanPhone = phone.toString().replace(/[^0-9]/g, '').slice(-10); // Last 10 digits
    if (!cleanPhone || cleanPhone.length < 7) return false;
    
    // Find subscriber in botSubscribers
    const sub = (db.botSubscribers || []).find(s => {
        if (!s.mobile) return false;
        const subPhone = s.mobile.toString().replace(/[^0-9]/g, '').slice(-10);
        return subPhone === cleanPhone;
    });

    // Also check salesContacts in settings
    const contact = (db.settings?.salesContacts || []).find(c => {
        if (!c.mobile) return false;
        const cPhone = c.mobile.toString().replace(/[^0-9]/g, '').slice(-10);
        return cPhone === cleanPhone;
    });

    const tgChatId = (sub && sub.telegramChatId) || (contact && contact.telegramId) || null;
    const baleChatId = (sub && sub.baleChatId) || (contact && contact.baleId) || null;

    if (!tgChatId && !baleChatId && (!sub || (!sub.telegramChatId && !sub.baleChatId))) {
        return false;
    }

    let sent = false;
    try {
        const baleModule = await import('./bale.js');
        const tgModule = await import('./telegram.js');
        const buffer = photoBase64 ? Buffer.from(photoBase64, 'base64') : null;

        if (tgChatId && db.settings?.telegramBotToken) {
            try {
                if (buffer && tgModule.sendBotPhoto) await tgModule.sendBotPhoto(tgChatId, buffer, text);
                else if (tgModule.sendBotMessage) await tgModule.sendBotMessage(tgChatId, text);
                sent = true;
            } catch (tgErr) {
                console.warn(`[BotCore] Failed sending TG by phone ${phone}:`, tgErr.message);
            }
        }

        if (baleChatId && db.settings?.baleBotToken) {
            try {
                if (buffer && baleModule.sendBotPhoto) await baleModule.sendBotPhoto(baleChatId, buffer, text);
                else if (baleModule.sendBotMessage) await baleModule.sendBotMessage(baleChatId, text);
                sent = true;
            } catch (baleErr) {
                console.warn(`[BotCore] Failed sending Bale by phone ${phone}:`, baleErr.message);
            }
        }
        return sent;
    } catch (e) {
        console.error(`[BotCore] Failed to send to ${phone}:`, e.message);
        return false;
    }
};

export const handleMessage = async (platform, chatId, text, sendFn, sendPhotoFn, sendDocFn, checkMembershipFn, senderId, rawMsg = null) => {
    const db = getDb();
    
    // Default Settings
    const settings = db.settings || {};

    const user = resolveUser(db, platform, senderId || chatId);
    const isGroup = chatId.toString().startsWith('-') || 
                  (platform === 'bale' && (chatId.toString().length > 10 || chatId.toString().startsWith('g') || chatId.toString().includes('@group'))) ||
                  (senderId && senderId.toString() !== chatId.toString());

    if (!sessions[chatId]) sessions[chatId] = { state: 'IDLE', data: {} };
    const session = sessions[chatId];

    // --- GROUP BEHAVIOR ---
    if (isGroup) {
        if (text === '/id' || text === 'آیدی') {
            return sendFn(chatId, `🆔 شناسه چت فعلی شما در ${platform === 'telegram' ? 'تلگرام' : 'بله'}: \`${chatId}\`\n\n⚠️ *توجه برای کارمندان:* برای استفاده از امکانات اختصاصی (مانند گزارش‌ها) بدون نیاز به عضویت در کانال‌های اجباری، این کد را در بخش "پیکربندی سیستم" یا "پروفایل من" در داخل نرم‌افزار مقابل نام خود وارد کنید.`);
        }

        const toEnglishDigits = (str) => {
            if (typeof str !== 'string') return str;
            return str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        };

        const normalizeDateString = (str) => {
            if (!str) return str;
            return str.split('/').map(part => part.padStart(2, '0')).join('/');
        };

        // --- DIRECT DATE HANDLER ---
        const cleanedText = normalizeDateString(toEnglishDigits(text));
        if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cleanedText)) {
            await runDailyReport(platform, chatId, cleanedText, sendFn, sendDocFn);
            return;
        }

        if (text.startsWith('/daily_report') || text.startsWith('/report') || text.startsWith('/repot') || text.toLowerCase() === 'daily' || text.toLowerCase() === 'repot' || text === 'گزارش روزانه') {
            const args = text.split(' ');
            
            let dateStr = normalizeDateString(toEnglishDigits(new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' }).format(new Date())));

            if (args.length > 1) {
                // Find the argument that looks like a date (e.g., 1403/02/01 or 1403/2/1)
                // Skip the first argument which is the command itself
                const dateArg = args.slice(1).find(a => a.includes('/'));
                if (dateArg) {
                    dateStr = normalizeDateString(toEnglishDigits(dateArg));
                }
            }
            
            await runDailyReport(platform, chatId, dateStr, sendFn, sendDocFn);
            return;
        }

        // Silent for all other group messages as per user request
        return;
    }

    if (text.startsWith('/daily_report') || text.startsWith('/report') || text.startsWith('/repot') || text.toLowerCase() === 'daily' || text.toLowerCase() === 'repot' || text === 'گزارش روزانه') {
        const toEnglishDigits = (str) => {
            if (typeof str !== 'string') return str;
            return str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        };
        const normalizeDateString = (str) => {
            if (!str) return str;
            return str.split('/').map(part => part.padStart(2, '0')).join('/');
        };
        const args = text.split(' ');
        let dateStr = normalizeDateString(toEnglishDigits(new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' }).format(new Date())));
        if (args.length > 1) {
            const dateArg = args.slice(1).find(a => a.includes('/'));
            if (dateArg) dateStr = normalizeDateString(toEnglishDigits(dateArg));
        }
        await runDailyReport(platform, chatId, dateStr, sendFn, sendDocFn);
        return;
    }

    if (text.startsWith('/start') || text === 'شروع' || text === 'منو') {
        session.state = 'IDLE';
        session.data = {};

        // TRACK SUBSCRIBER
        if (!db.botSubscribers) db.botSubscribers = [];
        const existingSub = db.botSubscribers.find(s => (platform === 'telegram' && s.telegramChatId == chatId) || (platform === 'bale' && s.baleChatId == chatId));
        if (!existingSub) {
            const newSub = { id: generateUUID(), platform, joinedAt: new Date().toISOString() };
            if (platform === 'telegram') newSub.telegramChatId = chatId;
            if (platform === 'bale') newSub.baleChatId = chatId;
            db.botSubscribers.push(newSub);
            saveDb(db);
        } else {
            // Already sub, check if we should continue onboarding
        }
        
        // --- SALES REPLY HANDLER ---
        const isSalesUser = (settings.salesNotificationUsers || []).some(item => {
            const u = typeof item === 'string' ? item : item.username;
            return (user && user.username === u) || String(chatId) === u || String(senderId) === u;
        });
        const isAdminUser = user && user.role === 'admin';
        
        if (text.startsWith('/reply ') || text.startsWith('پاسخ ') || (rawMsg && rawMsg.reply_to_message && (isSalesUser || isAdminUser))) {
            if (isSalesUser || isAdminUser) {
                let targetChatId = null;
                let replyText = text;
                
                if (text.startsWith('/reply ') || text.startsWith('پاسخ ')) {
                    const parts = text.split(' ');
                    if (parts.length >= 3) {
                        targetChatId = parts[1];
                        replyText = parts.slice(2).join(' ');
                    }
                } else if (rawMsg && rawMsg.reply_to_message && rawMsg.reply_to_message.text) {
                    const match = rawMsg.reply_to_message.text.match(/شناسه:\s*`?(\d+)`?/);
                    if (match) {
                        targetChatId = match[1];
                    }
                }
                
                if (targetChatId) {
                    try {
                        const baleModule = await import('./bale.js');
                        const tgModule = await import('./telegram.js');
                        
                        db.tickets = db.tickets || [];
                        const ticket = db.tickets.find(t => t.id === targetChatId);

                        let actualChatId = targetChatId;
                        let prefixMsg = `📩 *پاسخ از طرف پشتیبانی:*\n\n${replyText}`;
                        
                        if (ticket) {
                            actualChatId = ticket.chatId;
                            ticket.messages.push({
                                id: generateUUID(),
                                sender: 'admin',
                                text: replyText,
                                timestamp: new Date().toISOString()
                            });
                            ticket.updatedAt = Date.now();
                            ticket.status = 'OPEN';
                            saveDb(db);
                            prefixMsg = `📩 *پاسخ پشتیبانی به درخواست #${ticket.id}:*\n\n${replyText}`;
                        }
                        
                        let sent = false;
                        try {
                            await tgModule.sendBotMessage(actualChatId, prefixMsg);
                            sent = true;
                        } catch (e) {}
                        
                        try {
                            await baleModule.sendBotMessage(actualChatId, prefixMsg);
                            sent = true;
                        } catch (e) {}

                        if (sent) return sendFn(chatId, `✅ پاسخ شما با موفقیت به شناسه/تیکت ${targetChatId} ارسال شد.`);
                        else return sendFn(chatId, "❌ خطا در ارسال پاسخ (شناسه یافت نشد یا ربات بلاک شده است).");
                    } catch (e) {
                        return sendFn(chatId, "❌ خطای سیستمی در ارسال پاسخ.");
                    }
                } else if (text.startsWith('/reply ') || text.startsWith('پاسخ ')) {
                    return sendFn(chatId, "💡 روش استفاده: `/reply [ID] [Message]` یا ریپلای کردن روی پیام دریافتی");
                } else if (rawMsg && rawMsg.reply_to_message) {
                    // Do nothing, let it fall through if it's not a reply to a customer message.
                }
            }
        }
        
        // --- CHANNEL JOIN CHECK ---
        if (!user && !isGroup && (platform === 'telegram' || platform === 'bale') && settings.botForceJoinEnabled && settings.botForceJoinChannels && settings.botForceJoinChannels.length > 0) {
            if (checkMembershipFn) {
                const missingChannels = [];
            
            // Parallelize checks for performance
            const checkPromises = settings.botForceJoinChannels.map(async (ch) => {
                if (ch.id && (!ch.platform || ch.platform === platform || ch.platform === 'all')) {
                    try {
                        const normalizedId = normalizeChannelId(ch.id);
                        const isMember = await checkMembershipFn(chatId, normalizedId);
                        return { ch, isMember };
                    } catch (e) {
                        return { ch, isMember: false };
                    }
                }
                return { ch, isMember: true };
            });

            const results = await Promise.all(checkPromises);
            results.forEach(res => { if (!res.isMember) missingChannels.push(res.ch); });

            if (missingChannels.length > 0) {
                const btns = missingChannels.map(ch => {
                        let link = ch.link;
                        if (!link) {
                            let id = (ch.id || '').toString();
                            if (id.startsWith('http')) {
                                link = id;
                            } else {
                                const cleanId = id.replace('@', '');
                                if (platform === 'bale') link = `https://ble.ir/${cleanId}`;
                                else link = `https://t.me/${cleanId}`;
                            }
                        }
                        return [{ text: `عضویت در ${ch.name || 'کانال'}`, url: link }];
                    });
                    btns.push([{ text: '✅ عضو شدم', callback_data: 'CHECK_JOIN' }]);
                    return sendFn(chatId, `⚠️ برای استفاده از ربات در ${platform === 'bale' ? 'بله' : 'تلگرام'}، ابتدا باید در کانال زیر عضو شوید:\nپس از عضویت دکمه تایید را بزنید.`, {
                        reply_markup: { inline_keyboard: btns }
                    });
                }
            }
        }

        // --- UNION EXIT BOT USER INTERCEPT ---
        const unionBotUser = isUnionExitBotUser(db, chatId, senderId || chatId);
        if (unionBotUser && (text === '/start' || text === 'شروع' || text === 'منو')) {
            const buttons = [
                [{ text: '💎 خروج اتحادیه', callback_data: 'ACT_UNION_EXIT_FLOW' }]
            ];
            if (user) {
                // If they are also a regular system user, merge with Main Keyboard
                buttons.push(...KEYBOARDS.MAIN.inline_keyboard);
            } else {
                buttons.push([{ text: '🆔 نمایش شناسه چت من', callback_data: 'GUEST_SHOW_ID' }]);
            }
            session.state = 'IDLE'; // Ensure state is reset
            return sendFn(chatId, `👋 سلام ${unionBotUser.name || 'کاربر گرامی'}\nبه سیستم خوش آمدید.\nبرای ثبت درخواست خروج اتحادیه، لطفاً روی دکمه زیر کلیک کنید:`, {
                reply_markup: { inline_keyboard: buttons }
            });
        }

        // --- ONBOARDING FOR GUESTS ---
        if (!user && !isGroup && session.state === 'IDLE') {
            const sub = db.botSubscribers.find(s => (platform === 'telegram' && s.telegramChatId == chatId) || (platform === 'bale' && s.baleChatId == chatId));
            
            // If sub exists but lacks info, and we haven't asked yet or user just started
            if (sub && !sub.fullName && !sub.mobile && !sub.birthday && session.state === 'IDLE') {
                session.state = 'GUEST_REG_CONFIRM';
                return sendFn(chatId, `🎉 خوش آمدید! آیا مایل هستید پروفایل خود را تکمیل کنید تا از خدمات بهتر ما بهره‌مند شوید؟ (اختیاری)`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ بله، تکمیل مشخصات', callback_data: 'GUEST_START_REG' }],
                            [{ text: 'خیر، بعداً', callback_data: 'GUEST_MAIN' }]
                        ]
                    }
                });
            }
        }

        if (!user && !isGroup && session.state === 'IDLE') {
            const guestMenu = [
                [{ text: '📦 لیست محصولات و قیمت', callback_data: 'GUEST_PRODUCTS' }],
                [{ text: '🛒 ثبت سفارش خرید', callback_data: 'GUEST_ORDER' }],
                [{ text: '📑 تبدیل و ادغام عکس/PDF به تک‌فایل PDF', callback_data: 'ACT_MERGE_PDF_START' }],
                [{ text: '📞 ارتباط با بخش فروش (تیکت)', callback_data: 'GUEST_CONTACT' }],
                [{ text: '💰 استعلام مانده حساب من', callback_data: 'GUEST_BALANCE_REQUEST' }],
                [{ text: '🔍 پیگیری درخواست', callback_data: 'GUEST_TRACK' }],
                [{ text: '🏢 اطلاعات شرکت', callback_data: 'GUEST_COMPANY_INFO' }]
            ];
            
            guestMenu.push([{ text: '🆔 نمایش شناسه چت من', callback_data: 'GUEST_SHOW_ID' }]);
            
            if (settings.botStoreLinks && settings.botStoreLinks.length > 0) {
                settings.botStoreLinks.forEach(link => {
                    guestMenu.push([{ text: `🌐 ${link.title}`, url: link.url }]);
                });
            }

            return sendFn(chatId, `👋 خوش آمدید کاربر گرامی.\n\nشما به عنوان کاربر مهمان/مشتری وارد شده‌اید. لطفاً یکی از گزینه‌های زیر را انتخاب کنید:`, {
                reply_markup: {
                    inline_keyboard: guestMenu
                }
            });
        }
        
        if (isGroup) {
            if (!user) {
                return sendFn(chatId, "⚠️ برای دسترسی به پنل مدیریت در گروه، باید ابتدا بصورت کاربر در سیستم ثبت شده باشید.\nاما سایر دستورات عمومی (مانند DAILY) فعال هستند.");
            }
            return sendFn(chatId, `👋 سلام ${user.fullName}\nبرای استفاده از منوی مدیریت، لطفاً در چت خصوصی با ربات در ارتباط باشید.`);
        }

        return sendFn(chatId, `👋 سلام ${user.fullName}\nبه سیستم مدیریت یکپارچه خوش آمدید.\nلطفاً یک گزینه را انتخاب کنید:`, { reply_markup: KEYBOARDS.MAIN });
    }
    if (!isGroup) {
        // Handle guest states
        
        // --- GUEST REGISTRATION STATES ---
        if (session.state === 'GUEST_REG_NAME') {
            const sub = db.botSubscribers.find(s => (platform === 'telegram' && s.telegramChatId == chatId) || (platform === 'bale' && s.baleChatId == chatId));
            if (sub) {
                sub.fullName = text;
                saveDb(db);
            }
            session.state = 'GUEST_REG_MOBILE';
            return sendFn(chatId, "📱 لطفاً شماره موبایل خود را وارد کنید (اختیاری):", {
                reply_markup: { inline_keyboard: [[{ text: '⏩ رد کردن', callback_data: 'SKIP_REG_MOBILE' }]] }
            });
        }

        if (session.state === 'GUEST_REG_MOBILE') {
            const sub = db.botSubscribers.find(s => (platform === 'telegram' && s.telegramChatId == chatId) || (platform === 'bale' && s.baleChatId == chatId));
            if (sub) {
                sub.mobile = text;
                saveDb(db);
            }
            session.state = 'GUEST_REG_BIRTHDAY';
            return sendFn(chatId, "🎂 لطفاً تاریخ تولد خود را وارد کنید (مثال: 1370/05/12) (اختیاری):", {
                reply_markup: { inline_keyboard: [[{ text: '⏩ رد کردن', callback_data: 'SKIP_REG_BIRTHDAY' }]] }
            });
        }

        if (session.state === 'GUEST_REG_BIRTHDAY') {
            const sub = db.botSubscribers.find(s => (platform === 'telegram' && s.telegramChatId == chatId) || (platform === 'bale' && s.baleChatId == chatId));
            if (sub) {
                sub.birthday = text;
                saveDb(db);
            }
            session.state = 'IDLE';
            return sendFn(chatId, "✅ با تشکر! اطلاعات شما ثبت شد.", {
                reply_markup: { inline_keyboard: [[{ text: '🏠 منوی اصلی', callback_data: 'GUEST_MAIN' }]] }
            });
        }

        if (session.state === 'GUEST_WAIT_CONTACT_MSG') {
            const ticketId = Math.floor(10000 + Math.random() * 90000).toString();
            
            let messageText = text;
            if (!text && rawMsg) {
                if (rawMsg.photo) messageText = '📷 یک عکس ارسال شد';
                else if (rawMsg.document) messageText = '📎 یک فایل ارسال شد';
                else if (rawMsg.voice) messageText = '🎤 یک پیام صوتی ارسال شد';
            }

            const newTicket = {
                id: ticketId,
                chatId: chatId,
                platform: platform,
                customerName: rawMsg?.from?.first_name || 'مشتری',
                messages: [{
                    id: generateUUID(),
                    sender: 'customer',
                    text: messageText,
                    timestamp: new Date().toISOString()
                }],
                status: 'OPEN',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            db.tickets = db.tickets || [];
            db.tickets.push(newTicket);
            saveDb(db);
            session.state = 'GUEST_ACTIVE_TICKET';
            session.data.ticketId = ticketId;
            
            // Forward to sales notification users
            if (settings.salesNotificationUsers && settings.salesNotificationUsers.length > 0) {
                 const forwardText = `📞 *تیکت جدید (کد پیگیری: ${ticketId})*\n👤 کاربر: ${newTicket.customerName}\n💬 متن:\n${messageText}`;
                 const baleModule = await import('./bale.js');
                 const tgModule = await import('./telegram.js');
                 
                 for (const item of settings.salesNotificationUsers) {
                     const username = typeof item === 'string' ? item : item.username;
                     const platforms = typeof item === 'string' ? ['telegram', 'bale'] : item.platforms;
                     
                     // Try to find as system user
                     const targetUser = db.users.find(u => u.username === username);
                     
                     if (targetUser) {
                         if (platforms.includes('telegram') && targetUser.telegramChatId) {
                             tgModule.sendBotMessage(targetUser.telegramChatId, forwardText).catch(e => {});
                         }
                         if (platforms.includes('bale') && targetUser.baleChatId) {
                             baleModule.sendBotMessage(targetUser.baleChatId, forwardText).catch(e => {});
                         }
                     } else {
                         // If not a system user, check if username is a numeric Chat ID
                         if (!isNaN(Number(username))) {
                             if (platforms.includes('telegram')) tgModule.sendBotMessage(username, forwardText).catch(e => {});
                             if (platforms.includes('bale')) baleModule.sendBotMessage(username, forwardText).catch(e => {});
                         }
                     }
                 }
            }
            
            return sendFn(chatId, `✅ تیکت شما ایجاد شد.\n🔖 شناسه تیکت: \`${ticketId}\`\n\nهم‌اکنون مستقیماً به چت پشتیبانی متصل هستید و مدیران شرکت پیام شما را دریافت کردند. می‌توانید ادامه پیام‌ها یا فایل‌های خود را همینجا ارسال کنید. جهت خروج از حالت پشتیبانی، روی دکمه زیر کلیک کنید:`, {
                reply_markup: { inline_keyboard: [[{ text: '🔙 پایان مکالمه', callback_data: 'GUEST_MAIN' }]] }
            });
        }

        if (session.state === 'GUEST_ACTIVE_TICKET' || session.state === 'GUEST_WAIT_TICKET_REPLY') {
            db.tickets = db.tickets || [];
            const ticket = db.tickets.find(t => t.id === session.data.ticketId);
            if (ticket) {
                if (ticket.status !== 'OPEN') {
                    session.state = 'IDLE';
                    return sendFn(chatId, `❌ این تیکت بسته شده است.`);
                }
                
                let messageText = text;
                if (!text && rawMsg) {
                    if (rawMsg.photo) messageText = '📷 یک عکس ارسال شد';
                    else if (rawMsg.document) messageText = '📎 یک فایل ارسال شد';
                    else if (rawMsg.voice) messageText = '🎤 یک پیام صوتی ارسال شد';
                }

                ticket.messages.push({
                    id: generateUUID(),
                    sender: 'customer',
                    text: messageText || '📎 مدیا',
                    timestamp: new Date().toISOString()
                });
                ticket.updatedAt = Date.now();
                saveDb(db);
                
                if (settings.salesNotificationUsers && settings.salesNotificationUsers.length > 0) {
                     const forwardText = `📞 *پاسخ کاربر در تیکت #${ticket.id}*\n👤 کاربر: ${ticket.customerName}\n💬 متن:\n${messageText}`;
                     const baleModule = await import('./bale.js');
                     const tgModule = await import('./telegram.js');
                     for (const item of settings.salesNotificationUsers) {
                         const username = typeof item === 'string' ? item : item.username;
                         const platforms = typeof item === 'string' ? ['telegram', 'bale'] : item.platforms;
                         const targetUser = db.users.find(u => u.username === username);
                         if (targetUser) {
                             if (platforms.includes('telegram') && targetUser.telegramChatId) tgModule.sendBotMessage(targetUser.telegramChatId, forwardText).catch(e => {});
                             if (platforms.includes('bale') && targetUser.baleChatId) baleModule.sendBotMessage(targetUser.baleChatId, forwardText).catch(e => {});
                         } else if (!isNaN(Number(username))) {
                             if (platforms.includes('telegram')) tgModule.sendBotMessage(username, forwardText).catch(e => {});
                             if (platforms.includes('bale')) baleModule.sendBotMessage(username, forwardText).catch(e => {});
                         }
                     }
                }
                
                session.state = 'GUEST_ACTIVE_TICKET';
                return sendFn(chatId, `✅ ارسال شد.`, {
                    reply_markup: { inline_keyboard: [[{ text: '🔙 پایان مکالمه', callback_data: 'GUEST_MAIN' }]] }
                });
            } else {
                session.state = 'IDLE';
            }
        }

        if (session.state === 'GUEST_WAIT_TRACK_CODE') {
            const trackId = text.trim();
            db.tickets = db.tickets || [];
            db.customerOrders = db.customerOrders || [];
            
            const ticket = db.tickets.find(t => t.id === trackId && t.chatId === chatId);
            const order = db.customerOrders.find(o => o.id === trackId && o.chatId === chatId);
            
            if (!ticket && !order) {
                return sendFn(chatId, "❌ کد پیگیری نامعتبر است یا متعلق به شما نمی‌باشد. لطفاً مجدداً تلاش کنید:", {
                   reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف', callback_data: 'GUEST_MAIN' }]] }
                });
            }
            
            if (ticket) {
                let historyText = `📋 *تاریخچه درخواست تیکت #${ticket.id}*\nوضعیت: ${ticket.status === 'OPEN' ? 'باز' : 'بسته'}\n\n`;
                ticket.messages.forEach(m => {
                    const isCustomer = m.sender === 'customer';
                    historyText += `${isCustomer ? '👤 شما:' : 'پشتیبانی:'}\n${m.text}\n---\n`;
                });
                
                session.state = 'IDLE';
                return sendFn(chatId, historyText, {
                    reply_markup: { inline_keyboard: [
                        ticket.status === 'OPEN' ? [{ text: '➕ ارسال پاسخ جدید', callback_data: `GUEST_TICKET_REPLY_${ticket.id}` }] : [],
                        [{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]
                    ]}
                });
            } else {
                // It's an order
                let statusColor = '⏳';
                if (order.status === 'APPROVED') statusColor = '✅';
                if (order.status === 'REJECTED') statusColor = '❌';
                
                let textRes = `📦 *جزئیات سفارش #${order.id}*\n`;
                textRes += `وضعیت: ${statusColor} ${order.status}\n`;
                textRes += `تاریخ: ${order.date}\n\n`;
                textRes += `*محصولات:*\n`;
                order.items.forEach(it => {
                    textRes += `- ${it.name} (${it.quantity} ${it.unit || 'عدد'})\n`;
                });
                if (order.description) textRes += `\n💬 توضیحات: ${order.description}`;
                
                session.state = 'IDLE';
                return sendFn(chatId, textRes, {
                    reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]] }
                });
            }
        }
        

        if (session.state === 'GUEST_WAIT_ORDER_DESC') {
            const selectedProduct = session.data.selectedProduct;
            const orderDoc = {
                id: generateUUID(),
                customerChatId: chatId,
                productId: selectedProduct?.id,
                productName: selectedProduct?.name,
                description: text,
                status: 'pending',
                date: new Date().toISOString()
            };
            db.customerOrders = db.customerOrders || [];
            db.customerOrders.push(orderDoc);
            saveDb(db);
            session.state = 'IDLE';
            
             // Forward to sales notification users
            if (settings.salesNotificationUsers && settings.salesNotificationUsers.length > 0) {
                 const forwardText = `🛒 *درخواست خرید جدید*\n👤 مشتری: \`${chatId}\`\n📦 کالا: ${selectedProduct?.name || 'نامشخص'}\n📝 توضیحات: ${text}`;
                 const baleModule = await import('./bale.js');
                 const tgModule = await import('./telegram.js');
                 
                 for (const item of settings.salesNotificationUsers) {
                     const username = typeof item === 'string' ? item : item.username;
                     const platforms = typeof item === 'string' ? ['telegram', 'bale'] : item.platforms;
                     
                     const targetUser = db.users.find(u => u.username === username);
                     if (targetUser) {
                         if (platforms.includes('telegram') && targetUser.telegramChatId) tgModule.sendBotMessage(targetUser.telegramChatId, forwardText).catch(e => {});
                         if (platforms.includes('bale') && targetUser.baleChatId) baleModule.sendBotMessage(targetUser.baleChatId, forwardText).catch(e => {});
                     } else {
                         if (!isNaN(Number(username))) {
                             if (platforms.includes('telegram')) tgModule.sendBotMessage(username, forwardText).catch(e => {});
                             if (platforms.includes('bale')) baleModule.sendBotMessage(username, forwardText).catch(e => {});
                         }
                     }
                 }
            }

            return sendFn(chatId, `✅ سفارش شما برای محصول *${selectedProduct?.name}* ثبت شد و در اسرع وقت بررسی می‌گردد.\nکد پیگیری: \`${orderDoc.id.split('-')[0]}\``, {
                reply_markup: { inline_keyboard: [[{ text: '🏠 منوی اصلی', callback_data: 'GUEST_MAIN' }]] }
            });
        }

        if (session.state === 'GUEST_SUBMIT_ACCOUNT_CODE') {
            const code = text.trim();
            if (!code) {
                return sendFn(chatId, "⚠️ لطفاً یک کد حسابداری معتبر ارسال کنید:");
            }
            if (!db.customerChatCodes) db.customerChatCodes = [];
            db.customerChatCodes = db.customerChatCodes.filter(c => !(c.chatId === String(chatId) && c.platform === platform));
            db.customerChatCodes.push({
                chatId: String(chatId),
                platform: platform,
                accountCode: code,
                updatedAt: Date.now()
            });
            saveDb(db);
            session.state = 'IDLE';

            const rawList = await getCustomerBalancesData(db);
            const rec = rawList.find(b => matchAccountCode(b.accountCode, code));
            if (rec) {
                const balanceStr = Number(rec.balance).toLocaleString('fa-IR');
                const successMsg = `✅ *ارتباط با حسابداری برقرار شد!*\n\n👤 *مشتری:* ${rec.name}\n🔢 کد حسابداری: \`${rec.accountCode}\`\n\n💰 *مانده حساب شما (آنلاین سایان):* ${balanceStr} ریال (${rec.type})\n📅 آخرین بروزرسانی: ${new Date(rec.updatedAt || Date.now()).toLocaleDateString('fa-IR')}\n\n💬 مانده حساب شما ذخیره شد و در پرسش‌های بعدی با زدن دکمه مربوطه مستقیماً نشان داده خواهد شد.`;
                return sendFn(chatId, successMsg, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]] } });
            } else {
                let name = 'مشتری سایان';
                let balanceStr = '۰';
                let type = 'تسویه شده';
                let foundAny = false;
                if (db.settings?.sayanApiUrl) {
                    try {
                        const sql = `
                            SELECT 
                                t07.Field_005 as accountCode,
                                t07.Field_006 as name,
                                SUM(CAST(t24.Field_006 AS FLOAT)) - SUM(CAST(t24.Field_007 AS FLOAT)) as balance
                            FROM ACT_TBL_024 t24
                            INNER JOIN ACT_TBL_007 t07 ON t24.Field_010 LIKE '%' + RTRIM(LTRIM(t07.Field_003)) + '%'
                            WHERE (t07.Field_005 = '${code}' OR t07.Field_003 = '${code}' OR t07.Field_005 LIKE '%${code}' OR t07.Field_003 LIKE '%${code}')
                              AND (t24.Field_010 LIKE '11%' OR t24.Field_010 LIKE '%-11%' OR t24.Field_010 LIKE '31%' OR t24.Field_010 LIKE '%-31%') 
                              AND t24.Field_010 NOT LIKE '%-12%'
                              AND t24.Field_010 NOT LIKE '%-13%'
                              AND t24.Field_005 NOT IN ('102', '103', '107', '109', '114', '116', '117')
                              AND t24.Field_003 <> '9'
                            GROUP BY t07.Field_005, t07.Field_006
                        `;
                        const res = await runSayanQuery(db, sql);
                        if (res && res.length > 0) {
                            name = res[0].name || name;
                            const bal = Number(res[0].balance || 0);
                            balanceStr = Math.abs(bal).toLocaleString('fa-IR');
                            type = bal > 0 ? 'بدهکار' : (bal < 0 ? 'بستانکار' : 'تسویه شده');
                            foundAny = true;
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }
                if (foundAny) {
                    const successMsg = `✅ *ارتباط با حسابداری برقرار شد!*\n\n👤 *مشتری:* ${name}\n🔢 کد حسابداری: \`${code}\`\n\n💰 *مانده حساب شما (آنلاین سایان):* ${balanceStr} ریال (${type})\n💬 مانده حساب شما ذخیره شد و در پرسش‌های بعدی مستقیماً نشان داده خواهد شد.`;
                    return sendFn(chatId, successMsg, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]] } });
                } else {
                    const successMsg = `✅ *پیوند حساب برقرار شد!*\n🔢 کد حسابداری شما \`${code}\` با موفقیت در ربات ذخیره گردید.\n\n⚠️ اما در حال حاضر رکوردی با این کد در سرور حسابداری سایان یافت نشد. به محض برقراری اتصال یا تصحیح کد، مانده حساب شما نمایش داده خواهد شد.`;
                    return sendFn(chatId, successMsg, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]] } });
                }
            }
        }

        if (session.state === 'BOT_SAYAN_WAIT_COMPARE_DATES') {
            const val = text.trim();
            // Expected format: Date1, Date2 | Date3, Date4 (Supports both Shamsi 1403/01/01 and Gregorian 2024-01-01)
            const parts = val.split('|');
            if (parts.length !== 2) {
                return sendFn(chatId, "⚠️ فرمت وارد شده اشتباه است. لطفاً دقیقاً مانند الگو بنویسید:\n\nتاریخ شروع بازه ۱, تاریخ پایان بازه ۱ | تاریخ شروع بازه ۲, تاریخ پایان بازه ۲\n\nمثال شمسی:\n1403/01/01, 1403/01/15 | 1403/02/01, 1403/02/15\n\nمثال میلادی:\n2024-01-01, 2024-01-15 | 2024-02-01, 2024-02-15", { reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف', callback_data: 'BOT_SAYAN_COMPARE_SALES' }]] } });
            }
            
            const rangeA = parts[0].split(',').map(s => s.trim());
            const rangeB = parts[1].split(',').map(s => s.trim());
            
            if (rangeA.length !== 2 || rangeB.length !== 2) {
                return sendFn(chatId, "⚠️ فرمت وارد شده برای تاریخ‌های بازه اول یا دوم ناقص است. مثال:\n1403/01/01, 1403/01/15 | 1403/02/01, 1403/02/15", { reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف', callback_data: 'BOT_SAYAN_COMPARE_SALES' }]] } });
            }
            
            const dateFromA = rangeA[0];
            const dateToA = rangeA[1];
            const dateFromB = rangeB[0];
            const dateToB = rangeB[1];
            
            const dateRegex = /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;
            if (!dateRegex.test(dateFromA) || !dateRegex.test(dateToA) || !dateRegex.test(dateFromB) || !dateRegex.test(dateToB)) {
                return sendFn(chatId, "⚠️ لطفاً از فرمت معتبر تاریخ (شمسی مانند 1403/01/01 یا میلادی مانند 2024-01-01) استفاده کنید.", { reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف', callback_data: 'BOT_SAYAN_COMPARE_SALES' }]] } });
            }
            
            session.state = 'IDLE';
            await generateAndSendComparisonPDF(db, chatId, sendFn, sendDocFn, dateFromA, dateToA, dateFromB, dateToB, "بازه انتخابی اول", "بازه انتخابی دوم");
            return;
        }

        if (session.state === 'FIN_WAIT_CUSTOMER_BALANCE_SEARCH') {
            const query = text.trim();
            if (!query) {
                return sendFn(chatId, "⚠️ لطفا یک عبارت معتبر برای جستجو وارد کنید:");
            }
            
            // Query Sayan live balances
            const balances = await getCustomerBalancesData(db);

            const terms = query.split(/\s+/).filter(Boolean);
            let found = balances.filter(b => {
                return terms.every(term => {
                    const normTerm = term.toLowerCase();
                    return (b.accountCode || '').toLowerCase().includes(normTerm) || 
                           (b.name || '').toLowerCase().includes(normTerm);
                });
            }).sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));

            // Fallback: If no match with non-zero balance, let's search Sayan for ANY matching customer (even with zero balance)
            if (found.length === 0 && db.settings?.sayanApiUrl) {
                try {
                    const sql = `
                        SELECT 
                            t07.Field_005 as accountCode,
                            t07.Field_006 as name,
                            SUM(CAST(ISNULL(t24.Field_006, 0) AS FLOAT)) - SUM(CAST(ISNULL(t24.Field_007, 0) AS FLOAT)) as balance
                        FROM ACT_TBL_007 t07
                        LEFT JOIN ACT_TBL_024 t24 ON t24.Field_010 LIKE '%' + RTRIM(LTRIM(t07.Field_003)) + '%'
                          AND (t24.Field_010 LIKE '11%' OR t24.Field_010 LIKE '%-11%' OR t24.Field_010 LIKE '31%' OR t24.Field_010 LIKE '%-31%') 
                          AND t24.Field_010 NOT LIKE '%-12%'
                          AND t24.Field_010 NOT LIKE '%-13%'
                          AND t24.Field_005 NOT IN ('102', '103', '107', '109', '114', '116', '117')
                          AND t24.Field_003 <> '9'
                        WHERE (t07.Field_004 = '11' OR t07.Field_004 = '31')
                          AND (t07.Field_005 LIKE '%${query}%' OR t07.Field_006 LIKE N'%${query}%')
                        GROUP BY t07.Field_005, t07.Field_006
                    `;
                    const sayanCustomers = await runSayanQuery(db, sql);
                    if (sayanCustomers && sayanCustomers.length > 0) {
                        found = sayanCustomers.map(sc => {
                            const bal = Number(sc.balance || 0);
                            return {
                                accountCode: sc.accountCode,
                                name: sc.name || 'مشتری سایان',
                                balance: Math.abs(bal),
                                type: bal > 0 ? 'بدهکار' : (bal < 0 ? 'بستانکار' : 'بی‌حساب / تسویه شده'),
                                rawBalance: bal,
                                updatedAt: Date.now()
                            };
                        });
                    }
                } catch (err) {
                    console.error("Sayan customer search fallback error:", err);
                }
            }

            if (found.length === 0) {
                return sendFn(chatId, `❌ هیچ مشتری با عبارت "${query}" در لیست مانده حساب‌ها یا سرور سایان یافت نشد.\n\n🔍 تلاش مجدد (نام یا کد):`, { reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف و بازگشت', callback_data: 'SALES_CUSTOMER_BALANCES' }]] } });
            }

            if (found.length === 1) {
                session.state = 'IDLE';
                const rec = found[0];
                const balanceStr = Number(rec.balance).toLocaleString('fa-IR');
                const updateStr = new Date(rec.updatedAt || Date.now()).toLocaleDateString('fa-IR');
                
                let msg = `👤 *مشخصات مشتری*\n\n`;
                msg += `👤 *نام:* ${rec.name}\n`;
                msg += `🔢 *کد حسابداری:* \`${rec.accountCode}\`\n`;
                msg += `💰 *مانده حساب:* *${balanceStr}* ریال (${rec.type})\n`;
                msg += `📅 *آخرین بروزرسانی:* ${updateStr}\n\n`;
                
                const statements = db.customerStatements || [];
                const hasStatement = statements.some(s => s.accountCode === rec.accountCode);
                
                const kb = [
                    [
                        { text: '📄 دانلود آخرین صورتحساب تفصیلی (Excel/PDF)', callback_data: `SALES_BAL_STMT_DOWNLOAD_${rec.accountCode}` }
                    ],
                    [
                        { text: '📥 دانلود فرم تاییدیه حساب (PDF)', callback_data: `SALES_BAL_MAKE_CONFIRMATION_${rec.accountCode}` }
                    ],
                    [
                        { text: '🔍 جستجوی مجدد', callback_data: 'SALES_BAL_SPECIFIC_SEARCH' },
                        { text: '🔙 منوی قبلی', callback_data: 'SALES_CUSTOMER_BALANCES' }
                    ]
                ];
                
                if (!hasStatement) {
                    kb.shift();
                }
                
                return sendFn(chatId, msg, { reply_markup: { inline_keyboard: kb } });
            }

            // Multiple matches
            session.state = 'IDLE';
            let resMsg = `🔍 نتایج جستجو برای عبارت "${query}" (${found.length} مورد یافت شد):\n`;
            resMsg += `لطفاً مشتری مد نظر خود را جهت استعلام انتخاب نمایید:`;
            
            const buttons = found.slice(0, 10).map(rec => [{
                text: `👤 ${rec.name} (${rec.accountCode})`,
                callback_data: `SALES_BAL_VIEW_${rec.accountCode}`
            }]);
            
            if (found.length > 10) {
                resMsg += `\n\n⚠️ تعداد کل یافت شده‌ها ${found.length} مورد است. برای مشاهده مابقی، لطفاً جستجوی دقیق‌تری انجام دهید.`;
            }
            
            buttons.push([
                { text: '🔍 جستجوی مجدد', callback_data: 'SALES_BAL_SPECIFIC_SEARCH' },
                { text: '🔙 بازگشت به منو', callback_data: 'SALES_CUSTOMER_BALANCES' }
            ]);
            
            return sendFn(chatId, resMsg, { reply_markup: { inline_keyboard: buttons } });
        }
        
        if (text === '/start' || text === 'شروع' || text === 'منو') return; // Handled above helper logic
    }

    // --- PDF MERGER COLLECTING STATE ---
    if (session.state === 'MERGE_PDF_COLLECTING') {
        const lower = text.toLowerCase().trim();
        if (text.includes('ساخت') || text.includes('اتمام') || text.includes('پایان') || lower === '/done' || lower === '/finish' || lower === 'done' || lower === 'finish') {
            return handleCallback(platform, chatId, senderId || chatId, 'ACT_MERGE_PDF_FINISH', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        }
        if (text.includes('پاک') || lower === '/clear' || lower === 'clear') {
            return handleCallback(platform, chatId, senderId || chatId, 'ACT_MERGE_PDF_CLEAR', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        }
        if (text.includes('لغو') || text.includes('انصراف') || lower === '/cancel' || lower === 'cancel') {
            session.state = 'IDLE';
            session.data.mergeFiles = [];
            return sendFn(chatId, "❌ عملیات ادغام فایل‌ها لغو شد.", { reply_markup: KEYBOARDS.MAIN });
        }
        
        const count = (session.data.mergeFiles || []).length;
        return sendFn(chatId, `📥 شما در حالت «تبدیل و ادغام به PDF» هستید.\n\nتعداد فایل‌های حاضر در صف: *${count} عدد*\n\n🔹 لطفاً تصاویر (JPG/PNG) یا فایل‌های PDF خود را ارسال کنید.\n🔹 پس از پایان ارسال، دکمه «🏁 ساخت فایل PDF نهایی» را لمس کنید:`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `🏁 ساخت فایل PDF نهایی (${count} فایل)`, callback_data: 'ACT_MERGE_PDF_FINISH' }],
                    [{ text: '🗑️ پاک کردن صف', callback_data: 'ACT_MERGE_PDF_CLEAR' }],
                    [{ text: '🔙 انصراف و بازگشت', callback_data: 'MENU_MAIN' }]
                ]
            }
        });
    }

    // --- SECRETARIAT STATES ---
    if (session.state === 'SEC_WAIT_FILE') {
        if (rawMsg && rawMsg.document) {
            session.data.fileName = rawMsg.document.file_name;
            session.data.fileId = rawMsg.document.file_id;
            
            const companies = db.settings?.companies || [];
            if (companies.length === 0) {
                session.state = 'IDLE';
                return sendFn(chatId, "❌ خطایی رخ داد: هیچ شرکتی در سیستم تعریف نشده است.");
            }
            
            session.state = 'SEC_WAIT_COMPANY';
            const inline_keyboard = companies.map(c => [{ text: `🏢 ${c.name}`, callback_data: `SEC_SET_CO_${c.id}` }]);
            inline_keyboard.push([{ text: '❌ انصراف', callback_data: 'MENU_SEC' }]);
            
            return sendFn(chatId, `📎 فایل دریافت شد: *${rawMsg.document.file_name}*\n\n🏢 لطفا شرکت مربوط به این نامه را انتخاب کنید:`, {
                reply_markup: { inline_keyboard }
            });
        } else {
            return sendFn(chatId, "⚠️ لطفا فایل نامه (PDF یا Word/DOCX) را به عنوان یک فایل (Document) ارسال کنید. در صورت انصراف، منوی اصلی را انتخاب کنید یا دستور /start را بفرستید.");
        }
    }

    if (session.state === 'SEC_WAIT_SENDER') {
        session.data.sender = text.trim();
        session.state = 'SEC_WAIT_RECEIVER';
        return sendFn(chatId, `👤 فرستنده ثبت شد: *${text}*\n\n👥 لطفا نام گیرنده نامه را ارسال کنید:`);
    }

    if (session.state === 'SEC_WAIT_RECEIVER') {
        session.data.receiver = text.trim();
        session.state = 'SEC_WAIT_SUBJECT';
        return sendFn(chatId, `👥 گیرنده ثبت شد: *${text}*\n\n📝 لطفا موضوع نامه را ارسال کنید:`);
    }

    if (session.state === 'SEC_WAIT_SUBJECT') {
        session.data.subject = text.trim();
        session.state = 'SEC_WAIT_CONTENT';
        return sendFn(chatId, `📝 موضوع ثبت شد: *${text}*\n\n💬 لطفا خلاصه متن نامه را ارسال کنید (یا کلمه /skip را جهت رد کردن بفرستید):`);
    }

    if (session.state === 'SEC_WAIT_CONTENT') {
        const hasContent = text.trim().toLowerCase() !== '/skip';
        session.data.content = hasContent ? text.trim() : '';
        
        session.state = 'IDLE';
        try {
            if (!db.secretariatLetters) db.secretariatLetters = [];
            
            const companies = db.settings?.companies || [];
            const company = companies.find(c => c.id === session.data.companyId);
            const companyName = company ? company.name : '';
            const companySettings = (db.secretariatSettings || []).find(s => s.companyId === session.data.companyId);
            
            const count = (db.secretariatLetters || []).filter(l => l.companyId === session.data.companyId).length + 1;
            const prefix = companySettings?.letterNumberPrefix || 'A';
            const yearStr = new Intl.DateTimeFormat('fa-IR', { year: 'numeric' }).format(new Date()).replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)]);
            const letterNumber = `${prefix}/${yearStr}/${String(count).padStart(4, '0')}`;
            
            const shamsiDate = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            
            const newLetter = {
                id: generateUUID(),
                companyId: session.data.companyId,
                section: session.data.section,
                letterNumber: letterNumber,
                date: shamsiDate,
                sender: session.data.sender,
                receiver: session.data.receiver,
                subject: session.data.subject,
                content: session.data.content,
                status: 'PENDING',
                type: 'incoming',
                attachments: [
                    {
                        fileName: session.data.fileName,
                        url: `bot_file_id:${session.data.fileId}`
                    }
                ],
                referredTo: [],
                approvedBy: [],
                signatureImageUrls: [],
                createdBy: user ? user.fullName : 'سیستم (بات)',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            db.secretariatLetters.unshift(newLetter);
            saveDb(db);
            
            notifySecretariatLetter(newLetter, db).catch(e => console.error("Bot Secretariat notification error:", e));
            
            const confirmationMsg = `✅ *نامه اداری با موفقیت ثبت شد!*\n\n` +
                                   `🔢 *شماره نامه:* ${letterNumber}\n` +
                                   `🏢 *شرکت:* ${companyName}\n` +
                                   `📍 *بخش:* ${session.data.section === 'headquarters' ? 'دفتر مرکزی' : 'کارخانه'}\n` +
                                   `📅 *تاریخ ثبت:* ${shamsiDate}\n` +
                                   `👤 *فرستنده:* ${session.data.sender}\n` +
                                   `👥 *گیرنده:* ${session.data.receiver}\n` +
                                   `📝 *موضوع:* ${session.data.subject}`;
                                   
            return sendFn(chatId, confirmationMsg, {
                reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت به منوی دبیرخانه', callback_data: 'MENU_SEC' }]] }
            });
        } catch (e) {
            console.error("Bot register letter error:", e);
            return sendFn(chatId, "❌ متأسفانه در ثبت نامه خطایی رخ داد. مجدداً تلاش کنید.");
        }
    }

    if (session.state === 'SEC_WAIT_SEARCH_QUERY') {
        session.state = 'IDLE';
        const query = text.trim().toLowerCase();
        const letters = db.secretariatLetters || [];
        
        const results = letters.filter(l => 
            userHasLetterAccess(user, l, db) &&
            (
                l.subject.toLowerCase().includes(query) ||
                l.sender.toLowerCase().includes(query) ||
                l.receiver.toLowerCase().includes(query) ||
                l.letterNumber.toLowerCase().includes(query) ||
                (l.content && l.content.toLowerCase().includes(query))
            )
        ).slice(0, 5);
        
        if (results.length === 0) {
            return sendFn(chatId, `❌ هیچ نامه‌ای با عبارت "${text}" یافت نشد.`, {
                reply_markup: { inline_keyboard: [[{ text: '🔍 جستجوی مجدد', callback_data: 'SEC_SEARCH' }], [{ text: '🔙 بازگشت', callback_data: 'MENU_SEC' }]] }
            });
        }
        
        await sendFn(chatId, `🔎 نتایج جستجو برای عبارت *"${text}"*:`);
        for (const l of results) {
            const inline_keyboard = [
                [
                    { text: '📥 دریافت PDF', callback_data: `SEC_GET_PDF_${l.id}` },
                    { text: '📥 دریافت Word', callback_data: `SEC_GET_DOC_${l.id}` }
                ]
            ];
            
            const msg = `✉️ *نامه شماره ${l.letterNumber}*\n` +
                        `📅 تاریخ: ${l.date}\n` +
                        `👤 فرستنده: ${l.sender}\n` +
                        `👥 گیرنده: ${l.receiver}\n` +
                        `📝 موضوع: ${l.subject}\n` +
                        `وضعیت: ${l.status === 'APPROVED' ? '✅ تایید شده' : l.status === 'REJECTED' ? '❌ رد شده' : '⏳ در حال بررسی'}`;
                        
            await sendFn(chatId, msg, { reply_markup: { inline_keyboard } });
        }
        return;
    }

    if (session.state === 'SALES_WAIT_BROADCAST_MSG') {
        session.state = 'IDLE';
        // Broadcast
        let count = 0;
        const baleModule = await import('./bale.js');
        const tgModule = await import('./telegram.js');

        for (const u of db.users) {
            if (u.telegramChatId) {
                try { await tgModule.sendBotMessage(u.telegramChatId, text); count++; } catch (e) {}
            }
            if (u.baleChatId) {
                try { await baleModule.sendBotMessage(u.baleChatId, text); count++; } catch (e) {}
            }
        }
        return sendFn(chatId, `✅ پیام به ${count} کاربر ارسال شد.`);
    }

    if (session.state === 'SALES_WAIT_SEARCH_QUERY') {
        const query = text.trim().toLowerCase();
        if (query.length < 2) return sendFn(chatId, "⚠️ لطفاً حداقل ۲ کاراکتر وارد کنید:");
        
        const products = (db.products || []).filter(p => 
            p.name.toLowerCase().includes(query) || 
            (p.code && p.code.toLowerCase().includes(query))
        );

        if (products.length === 0) {
            return sendFn(chatId, `❌ کالایی با عبارت "${text}" یافت نشد.`, {
                reply_markup: { inline_keyboard: [[{ text: '🔍 جستجوی مجدد', callback_data: 'SALES_SEARCH' }], [{ text: '🔙 بازگشت', callback_data: 'MENU_SALES' }]] }
            });
        }

        let res = `🔎 *نتایج جستجو برای:* "${text}"\n\n`;
        products.slice(0, 15).forEach(p => {
            res += formatProduct(p) + "------------------\n";
        });

        if (products.length > 15) res += `⚠️ ${products.length - 15} مورد دیگر یافت شد. لطفا جستجو را دقیق‌تر کنید.`;
        
        session.state = 'IDLE';
        return sendFn(chatId, res, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'MENU_SALES' }]] } });
    }


    // --- SEARCH BY ID HANDLER ---
    if (session.state === 'WAIT_FOR_SEARCH_ID') {
        const num = text.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).trim(); // Persian numbers support
        if (!num) return sendFn(chatId, "❌ لطفا شماره سند را وارد کنید:");
        
        await searchAndSendResults(db, null, num, 'ID', session.data.targetType, platform, chatId, sendFn, sendPhotoFn);
        session.state = 'IDLE';
        return;
    }

    // --- PAYMENT ORDER ATTACHMENT WAITING NUMBERS ---
    if (session.state === 'WAIT_PAYMENT_ORDER_FOR_ATTACH') {
        const rawDigits = text.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^0-9a-zA-Z_-]/g, '').trim();
        if (!rawDigits) {
            return sendFn(chatId, "⚠️ لطفاً شماره پیگیری یا شماره سند معتبر را به صورت عدد وارد کنید:");
        }
        
        const targetOrder = (db.orders || []).find(o => 
            String(o.trackingNumber) === rawDigits || 
            String(o.id) === rawDigits || 
            (o.trackingNumber && String(o.trackingNumber) === rawDigits)
        );

        if (!targetOrder) {
            return sendFn(chatId, `❌ دستور پرداختی با شماره پیگیری/سند «${rawDigits}» در سیستم یافت نشد.\n\nلطفاً شماره سند را مجدداً بررسی و وارد فرمایید، یا برای انصراف /start را بزنید:`);
        }

        session.state = 'WAIT_PAYMENT_ORDER_ATTACHMENT_FILE';
        session.data.attachOrderId = targetOrder.id;
        session.data.attachOrderTracking = targetOrder.trackingNumber;
        session.data.paymentAttachFiles = [];

        const existingAtts = (targetOrder.attachments?.length || 0) + (targetOrder.archiveAttachments?.length || 0);

        const info = `💸 *دستور پرداخت #${targetOrder.trackingNumber}*
🏢 شرکت: ${targetOrder.payingCompany || '-'}
👤 ذینفع: ${targetOrder.payee || '-'}
💰 مبلغ: ${Number(targetOrder.totalAmount || 0).toLocaleString()} ریال
📝 بابت: ${targetOrder.description || '-'}
🔄 وضعیت: ${targetOrder.status}
📎 پیوست‌های فعلی: ${existingAtts > 0 ? `✅ ${existingAtts} فایل` : '❌ ندارد'}

📸 *اکنون لطفاً عکس‌های فاکتور/رسید یا فایل PDF پیوست را ارسال کنید.*
(می‌توانید چند عکس یا فایل را پشت سر هم بفرستید)`;

        return sendFn(chatId, info, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 انصراف و بازگشت', callback_data: 'MENU_PAYMENT' }]
                ]
            }
        });
    }

    if (session.state === 'WAIT_PAYMENT_ORDER_FOR_ATTACH_WITH_FILE') {
        const rawDigits = text.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^0-9a-zA-Z_-]/g, '').trim();
        if (!rawDigits) {
            return sendFn(chatId, "⚠️ لطفاً شماره پیگیری یا شماره سند معتبر را وارد کنید:");
        }
        
        const targetOrder = (db.orders || []).find(o => 
            String(o.trackingNumber) === rawDigits || 
            String(o.id) === rawDigits
        );

        if (!targetOrder) {
            return sendFn(chatId, `❌ دستور پرداختی با شماره «${rawDigits}» یافت نشد. لطفاً شماره صحیح را وارد کنید:`);
        }

        const files = session.data.paymentAttachFiles || [];
        if (files.length === 0) {
            session.state = 'IDLE';
            return sendFn(chatId, "⚠️ فایلی برای پیوست موجود نیست.");
        }

        try {
            let pdfBuffer;
            if (files.length === 1 && (files[0].type === 'pdf' || (files[0].fileName && files[0].fileName.endsWith('.pdf')))) {
                pdfBuffer = files[0].buffer;
            } else {
                pdfBuffer = await mergeFilesToPdf(files);
            }

            const safeName = `pay_attach_${targetOrder.trackingNumber}_${Date.now()}.pdf`;
            const uploadDir = path.join(process.cwd(), 'uploads');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            fs.writeFileSync(path.join(uploadDir, safeName), pdfBuffer);
            const fileUrl = `/uploads/${safeName}`;

            const attObj = {
                id: generateUUID(),
                fileName: `پیوست_سند_${targetOrder.trackingNumber}.pdf`,
                name: `پیوست_سند_${targetOrder.trackingNumber}.pdf`,
                url: fileUrl,
                data: fileUrl,
                type: 'application/pdf',
                size: pdfBuffer.length,
                uploadedAt: Date.now(),
                uploadedBy: user ? user.fullName : (platform === 'bale' ? 'کاربر بله' : 'کاربر ربات')
            };

            if (!targetOrder.attachments) targetOrder.attachments = [];
            if (!targetOrder.archiveAttachments) targetOrder.archiveAttachments = [];
            targetOrder.attachments.push(attObj);
            targetOrder.archiveAttachments.push(attObj);

            saveDb(db);
            session.state = 'IDLE';
            session.data.paymentAttachFiles = [];

            // Real-time broadcast to all connected Web / App clients
            import('../server.js').then(async m => {
                if (m.broadcastNotification) {
                    await m.broadcastNotification(
                        `📎 پیوست جدید دستور پرداخت #${targetOrder.trackingNumber}`,
                        `پیوست جدید توسط ${user ? user.fullName : (platform === 'bale' ? 'کاربر بله' : 'کاربر ربات')} به سند #${targetOrder.trackingNumber} متصل شد.`,
                        '/manage',
                        ['admin', 'financial', 'manager', 'ceo']
                    );
                }
            }).catch(() => {});

            await sendFn(chatId, `✅ فایل پیوست با موفقیت به دستور پرداخت #${targetOrder.trackingNumber} متصل و ذخیره شد.`);
            try {
                await sendDocFn(chatId, pdfBuffer, `پیوست_سند_${targetOrder.trackingNumber}.pdf`, `📎 فایل PDF پیوست سند #${targetOrder.trackingNumber}`);
            } catch (_) {}

            return sendFn(chatId, "می‌توانید سایر امور مالی را مدیریت نمایید:", { reply_markup: KEYBOARDS.PAYMENT });
        } catch (err) {
            console.error("Error attaching file to order:", err);
            return sendFn(chatId, `❌ خطا در ذخیره پیوست: ${err.message}`);
        }
    }

    // --- STATE MACHINES ---

    // 1. Manual Date Search
    if (session.state === 'ARCHIVE_WAIT_DATE') {
        const dateRegex = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
        const match = text.match(dateRegex);
        if (!match) return sendFn(chatId, "⚠️ فرمت صحیح نیست. لطفا به صورت yyyy/mm/dd وارد کنید (مثال: 1403/02/15):");
        
        const normalizedDate = `${match[1]}/${match[2].padStart(2, '0')}/${match[3].padStart(2, '0')}`;
        await sendFn(chatId, `🔎 جستجو برای ${normalizedDate}...`);
        
        await searchAndSendResults(db, session.data.company, normalizedDate, 'EXACT_DAY', session.data.targetType, platform, chatId, sendFn, sendPhotoFn);
        session.state = 'IDLE';
        return;
    }

    // 2. Payment Registration
    if (session.state === 'PAY_AMOUNT') {
        const cleanText = text.replace(/,/g, '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        const amt = parseInt(cleanText);
        if (isNaN(amt) || amt <= 0) return sendFn(chatId, "❌ مبلغ نامعتبر است. لطفا عدد وارد کنید:");
        session.data.amount = amt;
        session.state = 'PAY_PAYEE';
        return sendFn(chatId, "👤 نام گیرنده وجه (ذینفع) را وارد کنید:");
    }
    if (session.state === 'PAY_PAYEE') {
        session.data.payee = text;
        session.state = 'PAY_DESC';
        return sendFn(chatId, "📝 بابت (شرح پرداخت) را وارد کنید:");
    }
    if (session.state === 'PAY_DESC') {
        const company = session.data.company || db.settings.defaultCompany || '';
        let minStart = db.settings.currentTrackingNumber || 1000;
        let activeYear = null;
        if (db.settings.activeFiscalYearId) {
            activeYear = (db.settings.fiscalYears || []).find(y => y.id === db.settings.activeFiscalYearId);
            if (activeYear && company && activeYear.companySequences) {
                const target = company.trim().replace(/\s+/g, ' ');
                const foundKey = Object.keys(activeYear.companySequences).find(k => k.trim().replace(/\s+/g, ' ') === target);
                if (foundKey && activeYear.companySequences[foundKey]) {
                    minStart = parseInt(String(activeYear.companySequences[foundKey].startTrackingNumber)) || minStart;
                }
            }
        }
        
        let yearOrders = db.orders || [];
        if (activeYear) {
            yearOrders = yearOrders.filter(o => {
                if (o.fiscalYearId) return o.fiscalYearId === activeYear.id;
                if (activeYear.label) {
                    const shamsiYM = utils.toShamsiYearMonth(o.date);
                    if (shamsiYM && shamsiYM.startsWith(activeYear.label + '/')) return true;
                }
                if (activeYear.startDate && activeYear.endDate && o.date) {
                    return o.date >= activeYear.startDate && o.date <= activeYear.endDate;
                }
                return false;
            });
        }
        
        let trackingNumber = utils.findNextGapNumber(yearOrders, company, 'trackingNumber', minStart);
        
        // Final Duplicate Check
        while (utils.checkForDuplicate(yearOrders, 'trackingNumber', trackingNumber, 'payingCompany', company)) {
            trackingNumber++;
        }

        const order = {
            id: generateUUID(),
            trackingNumber: trackingNumber,
            date: getTehranDateString(),
            payee: session.data.payee,
            totalAmount: session.data.amount,
            description: text,
            status: 'در انتظار بررسی مالی',
            requester: user ? user.fullName : 'کاربر ربات',
            payingCompany: company,
            fiscalYearId: activeYear ? activeYear.id : undefined,
            createdAt: Date.now(),
            paymentDetails: [{ id: generateUUID(), method: 'حواله بانکی', amount: session.data.amount }]
        };
        if(!db.orders) db.orders = [];
        db.orders.unshift(order);
        dbManager.saveDb(db);
        console.log(`[Bot] Registered Payment #${order.trackingNumber} for user ${user ? user.fullName : chatId}`);
        session.state = 'IDLE';
        
        await sendFn(chatId, `✅ دستور پرداخت #${order.trackingNumber} با موفقیت ثبت شد.\n\n📎 برای ارسال و متصل کردن فاکتور/رسید، دکمه زیر را لمس کنید:`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `📎 افزودن پیوست به همین سند (#${order.trackingNumber})`, callback_data: `ACT_ATTACH_PAY_FOR_${order.id}` }],
                    [{ text: '🏠 منوی اصلی', callback_data: 'MENU_MAIN' }]
                ]
            }
        });
        return;
    }

    // 3. Exit Permit Registration
    if (session.state === 'EXIT_RECIPIENT') {
        session.data.recipient = text;
        session.state = 'EXIT_ITEM';
        return sendFn(chatId, "📦 نام کالا را وارد کنید:");
    }
    if (session.state === 'EXIT_ITEM') {
        session.data.item = text;
        session.state = 'EXIT_COUNT';
        return sendFn(chatId, "🔢 تعداد/مقدار را وارد کنید:");
    }
    if (session.state === 'EXIT_COUNT') {
        const company = session.data.company || db.settings.defaultCompany || '';
        
        let minStart = db.settings.currentExitPermitNumber || 1000;
        if (db.settings.activeFiscalYearId && company) {
            const year = (db.settings.fiscalYears || []).find(y => y.id === db.settings.activeFiscalYearId);
            if (year && year.companySequences && year.companySequences[company]) {
                minStart = year.companySequences[company].startExitPermitNumber || minStart;
            }
        }
        
        let permitNumber = utils.findNextGapNumber(db.exitPermits, company, 'permitNumber', minStart);
        
        // Final Duplicate Check
        while (utils.checkForDuplicate(db.exitPermits, 'permitNumber', permitNumber, 'company', company)) {
            permitNumber++;
        }

        const permit = {
            id: generateUUID(),
            permitNumber: permitNumber,
            date: getTehranDateString(),
            company: company,
            requester: user.fullName,
            recipientName: session.data.recipient,
            goodsName: session.data.item,
            cartonCount: parseInt(text) || 0,
            weight: 0,
            status: 'در انتظار تایید مدیرعامل',
            createdAt: Date.now(),
            items: [{ id: generateUUID(), goodsName: session.data.item, cartonCount: parseInt(text) || 0, weight: 0 }],
            destinations: [{ id: generateUUID(), recipientName: session.data.recipient, address: '', phone: '' }]
        };
        if(!db.exitPermits) db.exitPermits = [];
        db.exitPermits.push(permit);
        dbManager.saveDb(db);
        session.state = 'IDLE';

        // Notify first step (CEO)
        try {
            await notifyExitPermitStep(permit, platform, chatId, sendPhotoFn, db, 'ثبت توسط ربات');
        } catch (e) { console.error("Initial Notify Error:", e); }

        return sendFn(chatId, `✅ مجوز خروج #${permit.permitNumber} ثبت شد.`);
    }

    // 4. Warehouse Bijak Registration
    if (session.state === 'WH_BIJAK_COUNT') {
        const count = parseInt(text.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
        if(isNaN(count)) return sendFn(chatId, "❌ لطفا عدد وارد کنید:");
        session.data.count = count;
        session.state = 'WH_BIJAK_ITEM';
        return sendFn(chatId, "📦 نام کالا را وارد کنید:");
    }
    if (session.state === 'WH_BIJAK_ITEM') {
        session.data.itemName = text;
        session.state = 'WH_BIJAK_RECIPIENT';
        return sendFn(chatId, "👤 نام تحویل گیرنده:");
    }
    if (session.state === 'WH_BIJAK_RECIPIENT') {
        session.data.recipient = text;
        session.state = 'WH_BIJAK_PRICE';
        return sendFn(chatId, "💰 فی (قیمت واحد) را وارد کنید:\n(در صورت عدم نیاز به قیمت، عدد 0 را وارد کنید)");
    }

    if (session.state === 'WH_BIJAK_PRICE') {
        const cleanPrice = text.replace(/,/g, '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        let price = parseInt(cleanPrice);
        if(isNaN(price) || price < 0) return sendFn(chatId, "❌ لطفا یک عدد معتبر برای قیمت وارد کنید:");

        const company = session.data.company || db.settings.defaultCompany || '';
        let minStart = 1000;
        if (db.settings.activeFiscalYearId && company) {
            const year = (db.settings.fiscalYears || []).find(y => y.id === db.settings.activeFiscalYearId);
            if (year && year.companySequences && year.companySequences[company]) {
                minStart = year.companySequences[company].startBijakNumber || 1000;
            }
        }
        let nextSeq = utils.findNextGapNumber(db.warehouseTransactions, company, 'number', minStart);
        
        // Final Duplicate Check
        while (utils.checkForDuplicate(db.warehouseTransactions, 'number', nextSeq, 'company', company)) {
            nextSeq++;
        }

        const tx = {
            id: generateUUID(),
            type: 'OUT',
            date: getTehranDateString(),
            company: company,
            number: nextSeq,
            recipientName: session.data.recipient,
            items: [{
                itemId: 'bot_gen',
                itemName: session.data.itemName,
                quantity: session.data.count,
                weight: 0,
                unitPrice: price
            }],
            createdAt: Date.now(),
            createdBy: user.fullName + ' (Bot)',
            status: 'APPROVED',
            approvedBy: user.fullName + ' (Bot)'
        };
        if(!db.warehouseTransactions) db.warehouseTransactions = [];
        db.warehouseTransactions.unshift(tx);
        dbManager.saveDb(db);
        session.state = 'IDLE';
        
        notifyWarehouseBijak(tx, db, 'تایید نهایی').catch(e => console.error("Bot Bijak Notify Error:", e));

        return sendFn(chatId, `✅ بیجک خروج #${nextSeq} ثبت و تایید نهایی شد.`);
    }

    // --- UNION EXIT STATE MACHINE ---
    if (session.state === 'UNION_EXIT_BUYER') {
        session.data.buyerName = text;
        session.state = 'UNION_EXIT_NATIONAL_CODE';
        return sendFn(chatId, "🪪 لطفاً کد ملی خریدار را وارد کنید:\n(در صورت عدم نیاز، عدد 0 را وارد کنید)");
    }

    if (session.state === 'UNION_EXIT_NATIONAL_CODE') {
        session.data.nationalCode = text;
        session.state = 'UNION_EXIT_MOBILE';
        return sendFn(chatId, "📱 لطفاً شماره تلفن همراه خریدار را وارد کنید:\n(در صورت عدم نیاز، عدد 0 را وارد کنید)");
    }

    if (session.state === 'UNION_EXIT_MOBILE') {
        session.data.mobile = text;
        session.state = 'UNION_EXIT_ADDRESS';
        return sendFn(chatId, "📍 لطفاً آدرس خریدار را وارد کنید:\n(در صورت عدم نیاز، عدد 0 را وارد کنید)");
    }

    if (session.state === 'UNION_EXIT_ADDRESS') {
        session.data.address = text;
        session.state = 'UNION_EXIT_GUILD_ID';
        return sendFn(chatId, "🔖 لطفاً شناسه صنفی خریدار را وارد کنید:\n(در صورت عدم نیاز، عدد 0 را وارد کنید)");
    }

    if (session.state === 'UNION_EXIT_GUILD_ID') {
        session.data.guildId = text;
        
        const unionBotUser = isUnionExitBotUser(db, chatId, senderId || chatId);
        const items = Array.isArray(db.warehouseItems) ? db.warehouseItems : [];
        let allowedItems = items;
        if (unionBotUser && unionBotUser.allowedCommodities && !unionBotUser.allowedCommodities.includes('*')) {
            allowedItems = items.filter(item => unionBotUser.allowedCommodities.includes(item.name));
        }
        
        if (allowedItems.length === 0) {
            session.state = 'IDLE';
            return sendFn(chatId, "⚠️ هیچ کالای مجاز یا تعریف‌شده‌ای برای دسترسی شما یافت نشد. لطفاً با مدیریت تماس بگیرید.");
        }
        
        session.state = 'UNION_EXIT_SEARCH_ITEM';
        const itemButtons = allowedItems.slice(0, 10).map(item => [{ text: item.name, callback_data: `SEL_UNION_ITEM_${item.id}` }]);
        return sendFn(chatId, "📦 لطفاً بخشی از نام کالا را برای جستجو بنویسید یا یکی از گزینه‌های زیر را انتخاب کنید:", {
            reply_markup: { inline_keyboard: itemButtons }
        });
    }

    if (session.state === 'UNION_EXIT_SEARCH_ITEM') {
        const unionBotUser = isUnionExitBotUser(db, chatId, senderId || chatId);
        const items = Array.isArray(db.warehouseItems) ? db.warehouseItems : [];
        let allowedItems = items;
        if (unionBotUser && unionBotUser.allowedCommodities && !unionBotUser.allowedCommodities.includes('*')) {
            allowedItems = items.filter(item => unionBotUser.allowedCommodities.includes(item.name));
        }
        
        const query = text.toLowerCase();
        const matched = allowedItems.filter(item => item.name.toLowerCase().includes(query));
        if (matched.length === 0) {
            return sendFn(chatId, "❌ کالایی با این عنوان یافت نشد. لطفاً مجدداً جستجو کنید یا نام کالا را بنویسید:");
        }
        
        const itemButtons = matched.slice(0, 10).map(item => [{ text: item.name, callback_data: `SEL_UNION_ITEM_${item.id}` }]);
        return sendFn(chatId, `🔍 نتایج جستجو برای "${text}":\nلطفاً کالای مورد نظر را انتخاب کنید:`, {
            reply_markup: { inline_keyboard: itemButtons }
        });
    }

    if (session.state === 'UNION_EXIT_QTY') {
        const qty = parseFloat(text.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
        if (isNaN(qty) || qty <= 0) return sendFn(chatId, "❌ تعداد نامعتبر است. لطفاً فقط عدد وارد کنید:");
        session.data.quantity = qty;
        session.state = 'UNION_EXIT_WEIGHT';
        return sendFn(chatId, "⚖️ وزن خالص کالا را به کیلوگرم وارد کنید:\n(مثال: 1250.5 یا در صورت عدم نیاز عدد 0 را وارد کنید)");
    }

    if (session.state === 'UNION_EXIT_WEIGHT') {
        const weight = parseFloat(text.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
        if (isNaN(weight) || weight < 0) return sendFn(chatId, "❌ وزن نامعتبر است. لطفاً فقط عدد وارد کنید:");
        session.data.weight = weight;
        session.state = 'UNION_EXIT_CONFIRM';
        
        const summary = `💎 *پیش‌نویس خروج اتحادیه*\n` +
                        `🏢 *شرکت:* ${session.data.company}\n` +
                        `👤 *خریدار:* ${session.data.buyerName}\n` +
                        `🪪 *کد ملی:* ${session.data.nationalCode !== '0' ? session.data.nationalCode : '-'}\n` +
                        `📱 *تلفن:* ${session.data.mobile !== '0' ? session.data.mobile : '-'}\n` +
                        `📍 *آدرس:* ${session.data.address !== '0' ? session.data.address : '-'}\n` +
                        `🔖 *شناسه صنفی:* ${session.data.guildId !== '0' ? session.data.guildId : '-'}\n` +
                        `📦 *کالا:* ${session.data.itemName}\n` +
                        `🔢 *تعداد:* ${session.data.quantity}\n` +
                        `⚖️ *وزن خالص:* ${session.data.weight !== 0 ? `${session.data.weight} KG` : '-'}\n` +
                        `━━━━━━━━━━━━━━\n` +
                        `⚠️ لطفاً اطلاعات فوق را بررسی کرده و در صورت صحت، دکمه تایید را بزنید:`;
                        
        const buttons = [
            [
                { text: '🚀 ثبت و ارسال جهت تایید', callback_data: 'SUBMIT_UNION_EXIT' },
                { text: '❌ انصراف', callback_data: 'CANCEL_UNION_EXIT' }
            ]
        ];
        return sendFn(chatId, summary, { reply_markup: { inline_keyboard: buttons } });
    }

    // PDF Merger trigger command
    if (text === '/pdf' || text === '/mergepdf' || text === 'تبدیل pdf' || text === 'ادغام pdf' || text === 'ادغام فایل' || text === 'تبدیل به pdf' || text === 'pdf') {
        return handleCallback(platform, chatId, senderId || chatId, 'ACT_MERGE_PDF_START', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
    }

    // AI Agent Intelligence Fallback
    if (text && text.trim().length > 1 && !text.startsWith('/')) {
        const triggered = await detectAndTriggerReport(platform, chatId, senderId || chatId, text, sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
        if (triggered) return;

        try {
            const aiModule = await import('./ai-service.js');
            const aiRes = await aiModule.askAiAssistant({
                message: text,
                contextData: { platform, chatId, senderId, userName: user?.fullName || 'کاربر سیستم' }
            });
            if (aiRes && aiRes.reply) {
                return sendFn(chatId, `🤖 *پاسخ هوش مصنوعی ERP:*\n\n${aiRes.reply}`, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🏠 منوی اصلی', callback_data: 'MAIN_MENU' }]
                        ]
                    }
                });
            }
        } catch (aiErr) {
            console.error("[Bot AI Fallback Error]:", aiErr.message);
        }
    }

    if (isGroup) return; // Silent for groups on unrecognized messages
    
    return sendFn(chatId, "دستور نامفهوم. از منو استفاده کنید.", { 
        reply_markup: user ? KEYBOARDS.MAIN : {
            inline_keyboard: [[{ text: '🏠 منوی اصلی', callback_data: 'GUEST_MAIN' }]]
        }
    });
};

// --- AUTOMATIC NOTIFICATION TO CUSTOMER ON CARGO EXIT (WHATSAPP, TELEGRAM, BALE) ---
export const notifyCustomerCargoExit = async (p, db = null, manual = false) => {
    if (!p) return { success: false, reason: 'سند خروج نامعتبر است' };
    const freshDb = db || getDb();
    const settings = freshDb.settings || {};
    const salesContacts = settings.salesContacts || [];
    const savedContacts = settings.savedContacts || [];
    const botSubscribers = freshDb.botSubscribers || [];

    // Deduplication check for automatic calls to prevent duplicate triggers
    const dedupeKey = `CUST_EXIT_${p.id}_${p.exitTime || ''}`;
    if (!manual && isDuplicateNotification(dedupeKey)) {
        return { success: true, skipped: true, reason: 'قبلاً ارسال شده است' };
    }

    const normalizeExactName = (str) => {
        if (!str) return '';
        return String(str)
            .replace(/ي/g, 'ی')
            .replace(/ك/g, 'ک')
            .replace(/[آأإ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/[\u200B-\u200D\uFEFF\u200C]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    };

    const cleanPhone10 = (phone) => {
        if (!phone) return '';
        const digits = String(phone)
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
            .replace(/[^0-9]/g, '');
        return digits.length >= 10 ? digits.slice(-10) : '';
    };

    const notifyAdminsMissingCustomerPhone = async (buyerName) => {
        const displayBuyer = buyerName || p.recipientName || 'نامشخص';
        const adminAlertMsg =
            `⚠️ *هشدار عدم ثبت شماره تماس مشتری (عدم ارسال پیام خروج بار)*\n\n` +
            `پیام واتساپ تایید نهایی خروج کارخانه برای حواله شماره *#${p.permitNumber}* (شرکت: *${p.company || '-'}*) به مشتری ارسال نشد.\n\n` +
            `👤 *نام خریدار (گیرنده ثبت شده):* *${displayBuyer}*\n` +
            `❌ *علت:* برای شخص «*${displayBuyer}*» هیچ شماره تلفنی در سامانه ثبت نشده است.\n\n` +
            `📦 *کالاها:* ${p.goodsName || '-'}\n` +
            `🚛 *راننده:* ${p.driverName || '-'} (پلاک: ${p.plateNumber || '-'})\n\n` +
            `💡 لطفاً شماره موبایل دقیق این خریدار را در بخش مخاطبین فروش / مشتریان ثبت نموده و مجدداً ارسال به مشتری را بزنید.`;

        // Collect all Admin / CEO / Sales Manager phone numbers & bot IDs
        const adminUsers = (freshDb.users || []).filter(u =>
            u.role === 'admin' ||
            u.role === 'ceo' ||
            u.role === 'sales_manager' ||
            (Array.isArray(u.roles) && (u.roles.includes('admin') || u.roles.includes('ceo') || u.roles.includes('sales_manager')))
        );

        const adminPhoneMap = new Map();
        const addAdminPhone = (rawPhone) => {
            const c10 = cleanPhone10(rawPhone);
            if (c10 && !adminPhoneMap.has(c10)) {
                adminPhoneMap.set(c10, String(rawPhone).trim());
            }
        };

        for (const u of adminUsers) {
            if (u.phoneNumber) addAdminPhone(u.phoneNumber);
            if (u.mobile) addAdminPhone(u.mobile);
        }
        if (settings.salesManagerWhatsapp) addAdminPhone(settings.salesManagerWhatsapp);
        if (settings.defaultSalesManager) addAdminPhone(settings.defaultSalesManager);
        const compNotif = settings.companyNotifications?.[p.company] || settings.companyNotifications?.[p.company?.trim()] || {};
        if (compNotif.salesManager) addAdminPhone(compNotif.salesManager);

        // 1. Send WhatsApp alert to Admins
        if (settings.whatsappEnabled !== false) {
            try {
                const waModule = await import('./whatsapp.js');
                if (waModule && waModule.sendMessage) {
                    // If no admin phone was configured in users/settings, fallback to connected WhatsApp self number if available
                    if (adminPhoneMap.size === 0 && waModule.getStatus) {
                        const st = waModule.getStatus();
                        const selfUser = st?.user?.id ? String(st.user.id).split(':')[0].split('@')[0] : '';
                        if (selfUser) addAdminPhone(selfUser);
                    }
                    for (const [, targetAdminPhone] of adminPhoneMap.entries()) {
                        try {
                            await waModule.sendMessage(targetAdminPhone, adminAlertMsg);
                            console.log(`[notifyCustomerCargoExit] ⚠️ Sent missing-phone alert to Admin WhatsApp (${targetAdminPhone}) for buyer "${displayBuyer}"`);
                        } catch (waAdminErr) {
                            console.warn(`[notifyCustomerCargoExit] Failed to send missing-phone alert to Admin WhatsApp (${targetAdminPhone}):`, waAdminErr.message);
                        }
                    }
                }
            } catch (e) {
                console.warn("[notifyCustomerCargoExit] Admin WhatsApp alert error:", e.message);
            }
        }

        // 2. Also notify Admin on Telegram & Bale if configured
        const adminTgIds = new Set();
        const adminBaleIds = new Set();
        if (settings.telegramAdminId) adminTgIds.add(String(settings.telegramAdminId).trim());
        for (const u of adminUsers) {
            if (u.telegramChatId) adminTgIds.add(String(u.telegramChatId).trim());
            if (u.telegramId) adminTgIds.add(String(u.telegramId).trim());
            if (u.baleChatId) adminBaleIds.add(String(u.baleChatId).trim());
            if (u.baleId) adminBaleIds.add(String(u.baleId).trim());
        }

        if (adminTgIds.size > 0 && settings.telegramBotToken) {
            import('./telegram.js').then(async (tgMod) => {
                if (!tgMod || !tgMod.sendBotMessage) return;
                for (const tgId of adminTgIds) {
                    await tgMod.sendBotMessage(sanitizeGroupId(tgId), adminAlertMsg).catch(() => {});
                }
            }).catch(() => {});
        }

        if (adminBaleIds.size > 0 && settings.baleBotToken) {
            import('./bale.js').then(async (baleMod) => {
                if (!baleMod || !baleMod.sendBotMessage) return;
                for (const bId of adminBaleIds) {
                    await baleMod.sendBotMessage(sanitizeGroupId(bId), adminAlertMsg).catch(() => {});
                }
            }).catch(() => {});
        }
    };

    // Collect all destinations/customers
    const destinationsList = (p.destinations && p.destinations.length > 0)
        ? p.destinations
        : [{ recipientName: p.recipientName || '', phone: '', address: p.destinationAddress || '' }];

    let sentSummary = [];
    let missingPhoneBuyers = [];

    // Pre-generate invoice image if possible
    let imgB64 = null;
    let imgBuffer = null;
    try {
        imgBuffer = await Renderer.generateRecordImage(p, 'CUSTOMER_INVOICE');
        if (!imgBuffer) {
            imgBuffer = await Renderer.generateRecordImage(p, 'EXIT', { forceHidePrices: false });
        }
        if (imgBuffer) {
            imgB64 = imgBuffer.toString('base64');
        }
    } catch (invErr) {
        console.warn("[notifyCustomerCargoExit] Image generation error:", invErr.message);
    }

    // Calculate cargo weight and carton count
    const itemsToCalculate = (p.items && p.items.length > 0)
        ? p.items
        : [{ cartonCount: p.cartonCount || 0, weight: p.weight || 0, goodsName: p.goodsName || 'محصولات کارخانه' }];
    const totalCartons = itemsToCalculate.reduce((s, i) => s + (Number(i.deliveredCartonCount ?? i.cartonCount) || 0), 0);
    const totalWeight = Number((itemsToCalculate.reduce((s, i) => s + (Number(i.deliveredWeight ?? i.weight) || 0), 0)).toFixed(3));
    const totalAmount = itemsToCalculate.reduce((s, i) => s + ((Number(i.deliveredCartonCount ?? i.cartonCount) || 0) * (Number(i.price) || 0)), 0);

    const goodsListFormatted = itemsToCalculate.map((it, idx) => {
        const count = it.deliveredCartonCount ?? it.cartonCount ?? 0;
        const w = it.deliveredWeight ?? it.weight ?? 0;
        return `  ▫️ ${idx + 1}. *${it.goodsName}* (${count} کارتن${w > 0 ? ` | ${w} کیلوگرم` : ''})`;
    }).join('\n');

    const driverPhone10 = cleanPhone10(p.driverPhone);
    const normDriverName = normalizeExactName(p.driverName);
    const allKnownContacts = [...salesContacts, ...savedContacts];

    for (const dest of destinationsList) {
        // Strictly use the exact buyer name selected when registering the exit permit
        const destName = (dest.recipientName || p.recipientName || '').trim();
        const normDest = normalizeExactName(destName);

        if (!normDest) {
            await notifyAdminsMissingCustomerPhone('نامشخص (نام خریدار ثبت نشده)');
            missingPhoneBuyers.push('نامشخص');
            continue;
        }

        let targetPhone = '';
        let targetTgId = null;
        let targetBaleId = null;
        let matchedContact = null;

        let sCode = dest.sayanPersonCode || p.sayanPersonCode;
        let sTafsili = dest.sayanTafsiliCode || p.sayanTafsiliCode;

        // 1. Strict Exact Match in salesContacts / savedContacts by exact normalized buyer name first
        matchedContact = allKnownContacts.find(c => {
            if (!c || (!c.name && !c.sayanPersonName)) return false;
            const normC = normalizeExactName(c.name);
            const normSayanC = normalizeExactName(c.sayanPersonName);
            return (normC && normC === normDest) || (normSayanC && normSayanC === normDest);
        });

        // 2. If not matched by name, check Sayan code ONLY if the contact's name also matches the buyer name (prevents stale Sayan code mismatch)
        if (!matchedContact && (sCode || sTafsili)) {
            matchedContact = allKnownContacts.find(c => {
                const codeMatches =
                    (sCode && c.sayanPersonCode && String(c.sayanPersonCode).trim() === String(sCode).trim()) ||
                    (sTafsili && c.sayanTafsiliCode && String(c.sayanTafsiliCode).trim() === String(sTafsili).trim());
                if (!codeMatches) return false;
                const normC = normalizeExactName(c.name);
                const normSayanC = normalizeExactName(c.sayanPersonName);
                return (normC && normC === normDest) || (normSayanC && normSayanC === normDest);
            });
        }

        if (matchedContact) {
            const contactMobile = matchedContact.mobile || matchedContact.phone || matchedContact.sayanMobile || '';
            if (cleanPhone10(contactMobile)) {
                targetPhone = String(contactMobile).trim();
            }
            if (matchedContact.telegramId) targetTgId = String(matchedContact.telegramId).trim();
            if (matchedContact.baleId) targetBaleId = String(matchedContact.baleId).trim();
            if (!sCode && matchedContact.sayanPersonCode) sCode = matchedContact.sayanPersonCode;
            if (!sTafsili && matchedContact.sayanTafsiliCode) sTafsili = matchedContact.sayanTafsiliCode;
        }

        // 3. Check dest.phone from the permit ONLY if targetPhone is not yet found, and ensure it is NOT the driver's phone
        if (!targetPhone && dest.phone && cleanPhone10(dest.phone)) {
            const destPhone10 = cleanPhone10(dest.phone);
            const isDriverPhone = driverPhone10 && destPhone10 === driverPhone10 && normDest !== normDriverName;
            if (!isDriverPhone) {
                targetPhone = String(dest.phone).trim();
            } else {
                console.warn(`[notifyCustomerCargoExit] Ignored dest.phone (${dest.phone}) because it belongs to the driver (${p.driverName}), not buyer "${destName}".`);
            }
        }

        // 4. Live Sayan Fallback: Query GNR_TBL_001 ONLY for exact buyer name match (never partial match to a different person)
        if (!targetPhone && destName) {
            try {
                const sanitizedName = String(destName).replace(/'/g, "''").trim();
                const sanitizedCode = sCode ? String(sCode).replace(/'/g, "''").trim() : '';
                const sanitizedTafsili = sTafsili ? String(sTafsili).replace(/'/g, "''").trim() : '';
                if (sanitizedName.length >= 2) {
                    const { executeSayanQuery } = await import('./sayan-order-automation.js');
                    const codeFilter = [
                        sanitizedCode ? `Field_003 = '${sanitizedCode}'` : '',
                        sanitizedTafsili ? `Field_030 = '${sanitizedTafsili}'` : ''
                    ].filter(Boolean).join(' OR ');

                    const liveSql = `
                        SELECT TOP 20 
                            RTRIM(LTRIM(Field_003)) as PersonCode,
                            RTRIM(LTRIM(COALESCE(Field_015, ''))) as Mobile,
                            RTRIM(LTRIM(COALESCE(Field_030, Field_021, Field_003))) as TafsiliCode,
                            RTRIM(LTRIM(COALESCE(Field_006, ''))) as FirstName,
                            RTRIM(LTRIM(COALESCE(Field_007, ''))) as LastName,
                            RTRIM(LTRIM(COALESCE(Field_006, '') + ' ' + COALESCE(Field_007, ''))) as FullName
                        FROM GNR_TBL_001 WITH (NOLOCK)
                        WHERE (
                            RTRIM(LTRIM(COALESCE(Field_006, '') + ' ' + COALESCE(Field_007, ''))) LIKE N'%${sanitizedName}%' OR
                            Field_007 LIKE N'%${sanitizedName}%'
                            ${codeFilter ? `OR (${codeFilter})` : ''}
                        )
                    `;
                    const liveRows = await executeSayanQuery(liveSql, 15000).catch(() => []);
                    if (Array.isArray(liveRows) && liveRows.length > 0) {
                        // Strictly find the row whose normalized name EXACTLY matches the buyer's name
                        const exactRow = liveRows.find(r => {
                            const nFull = normalizeExactName(r.FullName);
                            const nLast = normalizeExactName(r.LastName);
                            const nRev = normalizeExactName(`${r.LastName || ''} ${r.FirstName || ''}`);
                            return (nFull && nFull === normDest) || (nLast && nLast === normDest) || (nRev && nRev === normDest);
                        });

                        if (exactRow) {
                            if (exactRow.Mobile && cleanPhone10(exactRow.Mobile)) {
                                targetPhone = String(exactRow.Mobile).trim();
                                console.log(`[notifyCustomerCargoExit] Resolved exact buyer mobile ${targetPhone} from Sayan GNR_TBL_001 for "${destName}"`);
                            }
                            if (!sCode && exactRow.PersonCode) sCode = exactRow.PersonCode;
                            if (!sTafsili && exactRow.TafsiliCode) sTafsili = exactRow.TafsiliCode;
                        }
                    }
                }
            } catch (liveSayanErr) {
                console.warn("[notifyCustomerCargoExit] Live Sayan mobile lookup error:", liveSayanErr.message);
            }
        }

        // 5. Check botSubscribers ONLY by exact buyer name or already-verified buyer phone
        if (targetPhone) {
            const clean10 = cleanPhone10(targetPhone);
            const sub = botSubscribers.find(s => s.mobile && cleanPhone10(s.mobile) === clean10);
            if (sub) {
                if (!targetTgId && sub.telegramChatId) targetTgId = sub.telegramChatId;
                if (!targetBaleId && sub.baleChatId) targetBaleId = sub.baleChatId;
            }
        } else {
            const exactSub = botSubscribers.find(s => s.fullName && normalizeExactName(s.fullName) === normDest);
            if (exactSub) {
                if (exactSub.mobile && cleanPhone10(exactSub.mobile)) {
                    targetPhone = String(exactSub.mobile).trim();
                }
                if (!targetTgId && exactSub.telegramChatId) targetTgId = exactSub.telegramChatId;
                if (!targetBaleId && exactSub.baleChatId) targetBaleId = exactSub.baleChatId;
            }
        }

        // 6. Final safety check: Never send customer notification to the driver's phone number
        if (targetPhone && driverPhone10 && cleanPhone10(targetPhone) === driverPhone10 && normDest !== normDriverName) {
            console.warn(`[notifyCustomerCargoExit] Blocked sending customer notification to driver phone (${targetPhone}) for buyer "${destName}".`);
            targetPhone = '';
        }

        // 7. If no valid phone number is registered for this exact buyer, notify Admin via WhatsApp!
        if (!targetPhone || !cleanPhone10(targetPhone)) {
            console.warn(`[notifyCustomerCargoExit] No phone registered for exact buyer "${destName}" on Permit #${p.permitNumber}. Alerting Admin.`);
            missingPhoneBuyers.push(destName);
            await notifyAdminsMissingCustomerPhone(destName);
            if (!targetTgId && !targetBaleId) {
                continue;
            }
        }

        const sayanAccountInfo = (sTafsili || sCode) ? `\n🔗 *حساب سایان:* کد تفصیلی ${sTafsili || sCode}` : '';

        // Assemble Bot Links for Customer Notification
        const botLinksList = [];
        const rawBale = (settings.customerExitBaleBotUrl || '').trim();
        const rawTele = (settings.customerExitTelegramBotUrl || '').trim();
        const rawOther = (settings.customerExitOtherBotUrl || '').trim();

        if (rawBale) {
            let baleUrl = rawBale;
            if (!baleUrl.startsWith('http://') && !baleUrl.startsWith('https://')) {
                const cleanHandle = baleUrl.replace(/^@/, '').trim();
                baleUrl = `https://ble.ir/${cleanHandle}`;
            }
            botLinksList.push(`🔹 *ربات بله:* ${baleUrl}`);
        } else if (settings.baleBotUsername) {
            const cleanHandle = String(settings.baleBotUsername).replace(/^@/, '').trim();
            botLinksList.push(`🔹 *ربات بله:* https://ble.ir/${cleanHandle}`);
        }

        if (rawTele) {
            let teleUrl = rawTele;
            if (!teleUrl.startsWith('http://') && !teleUrl.startsWith('https://')) {
                const cleanHandle = teleUrl.replace(/^@/, '').trim();
                teleUrl = `https://t.me/${cleanHandle}`;
            }
            botLinksList.push(`🔹 *ربات تلگرام:* ${teleUrl}`);
        } else if (settings.telegramBotUsername) {
            const cleanHandle = String(settings.telegramBotUsername).replace(/^@/, '').trim();
            botLinksList.push(`🔹 *ربات تلگرام:* https://t.me/${cleanHandle}`);
        }

        if (rawOther) {
            botLinksList.push(`🔹 *سامانه / سایر پیام‌رسان‌ها:* ${rawOther}`);
        }

        // Fallback to botStoreLinks if defined and no explicit links
        if (botLinksList.length === 0 && Array.isArray(settings.botStoreLinks) && settings.botStoreLinks.length > 0) {
            settings.botStoreLinks.filter(b => b.title && b.url).forEach(b => {
                botLinksList.push(`🔹 *${b.title}:* ${b.url}`);
            });
        }

        const inviteHeading = (settings.customerExitBotInviteText || '').trim() || 
            'جهت پیگیری آنلاین بار، دریافت فاکتورها، مانده حساب و ثبت سفارشات، می‌توانید از ربات‌های هوشمند ما استفاده فرمایید:';

        const botLinksBlock = botLinksList.length > 0
            ? `\n\n🤖 *${inviteHeading}*\n${botLinksList.join('\n')}`
            : '';

        const effectiveSurveyUrl = (settings.customerSurveyUrl || '').trim() || 
            `${(settings.appBaseUrl || 'https://dlkam.ir').replace(/\/+$/, '')}/#customer-survey?id=${p.permitNumber}`;

        const surveyBlock = `\n\n⭐ *فرم نظرسنجی و ارزیابی کیفیت محصولات و خدمات:*\n${effectiveSurveyUrl}`;

        // Formulate customer message with all requested details
        const customerCaption = 
            `🚚 *اعلام بارگیری و خروج بار کارخانه*\n\n` +
            `👤 *مشتری گرامی:* *${destName || '-'}*${sayanAccountInfo}\n` +
            `🏢 *شرکت صادرکننده:* ${p.company || '-'}\n` +
            `🔢 *شماره حواله خروج:* #${p.permitNumber}\n` +
            `📅 *تاریخ خروج:* ${toShamsiFull(p.date)}\n` +
            (p.exitTime ? `🕒 *ساعت خروج از کارخانه:* ${p.exitTime}\n` : '') +
            `\n⚖️ *وزن کل بار:* *${totalWeight.toLocaleString()} کیلوگرم*\n` +
            `📦 *تعداد کارتن / بسته‌ها:* *${totalCartons.toLocaleString()} عدد*\n` +
            `\n👨‍✈️ *مشخصات و نام راننده:* *${p.driverName || 'ثبت نشده'}*\n` +
            `📞 *شماره تماس راننده:* *${p.driverPhone || 'ثبت نشده'}*\n` +
            `🆔 *شماره پلاک خودرو:* *${p.plateNumber || 'ثبت نشده'}*\n` +
            `📍 *مقصد تحویل:* ${dest.address || p.destinationAddress || 'تحویل درب کارخانه'}\n` +
            `\n📦 *اقلام و کالاهای بارگیری شده:*\n${goodsListFormatted}\n` +
            (totalAmount > 0 ? `\n💵 *مبلغ فاکتور:* ${totalAmount.toLocaleString()} ریال\n` : '') +
            (p.description ? `\n📝 *توضیحات:* ${p.description}\n` : '') +
            `\n✅ محموله شما با مشخصات فوق با موفقیت بارگیری و از کارخانه خارج گردید. تصویر فاکتور رسمی خروج کالا نیز پیوست می‌باشد.` +
            botLinksBlock +
            surveyBlock +
            `\n\nبا سپاس از اعتماد و خرید شما 🙏`;

        let channelResults = { phone: targetPhone, name: destName, wa: false, tg: false, bale: false };

        // 1. WhatsApp Delivery (Strictly to the verified customer phone only)
        if (targetPhone && settings.whatsappEnabled !== false) {
            try {
                const waModule = await import('./whatsapp.js');
                if (waModule && waModule.sendMessage) {
                    const mediaOpts = imgB64 ? {
                        data: imgB64,
                        mimeType: 'image/png',
                        filename: `exit-permit-${p.permitNumber}.png`
                    } : undefined;
                    await waModule.sendMessage(targetPhone, customerCaption, mediaOpts);
                    channelResults.wa = true;
                    console.log(`[notifyCustomerCargoExit] ✅ Sent WhatsApp to customer ${destName} (${targetPhone})`);
                }
            } catch (waErr) {
                console.warn(`[notifyCustomerCargoExit] WhatsApp fail for ${targetPhone}:`, waErr.message);
            }
        }

        // 2. Telegram Bot Delivery
        if (targetTgId && settings.telegramBotToken) {
            try {
                const tgModule = await import('./telegram.js');
                if (tgModule) {
                    const cleanTg = sanitizeGroupId(targetTgId);
                    if (imgBuffer && tgModule.sendBotPhoto) {
                        await tgModule.sendBotPhoto(cleanTg, imgBuffer, customerCaption);
                        channelResults.tg = true;
                    } else if (tgModule.sendBotMessage) {
                        await tgModule.sendBotMessage(cleanTg, customerCaption);
                        channelResults.tg = true;
                    }
                    console.log(`[notifyCustomerCargoExit] ✅ Sent Telegram to customer ${destName} (${cleanTg})`);
                }
            } catch (tgErr) {
                console.warn(`[notifyCustomerCargoExit] Telegram fail for ${targetTgId}:`, tgErr.message);
            }
        }

        // 3. Bale Bot Delivery
        if (targetBaleId && settings.baleBotToken) {
            try {
                const baleModule = await import('./bale.js');
                if (baleModule) {
                    const cleanBale = sanitizeGroupId(targetBaleId);
                    if (imgBuffer && baleModule.sendBotPhoto) {
                        await baleModule.sendBotPhoto(cleanBale, imgBuffer, customerCaption);
                        channelResults.bale = true;
                    } else if (baleModule.sendBotMessage) {
                        await baleModule.sendBotMessage(cleanBale, customerCaption);
                        channelResults.bale = true;
                    }
                    console.log(`[notifyCustomerCargoExit] ✅ Sent Bale to customer ${destName} (${cleanBale})`);
                }
            } catch (baleErr) {
                console.warn(`[notifyCustomerCargoExit] Bale fail for ${targetBaleId}:`, baleErr.message);
            }
        }

        // 4. Phone-based Bot Fallback
        if (targetPhone && (!channelResults.tg || !channelResults.bale)) {
            try {
                const botRes = await sendBotMessageByPhone(targetPhone, customerCaption, imgB64);
                if (botRes) {
                    channelResults.botPhone = true;
                }
            } catch (e) {}
        }

        sentSummary.push(channelResults);
    }

    return {
        success: sentSummary.length > 0 && missingPhoneBuyers.length === 0,
        recipientsNotified: sentSummary,
        missingPhoneBuyers,
        adminNotified: missingPhoneBuyers.length > 0,
        reason: missingPhoneBuyers.length > 0
            ? `شماره تماس برای خریدار «${missingPhoneBuyers.join('، ')}» ثبت نشده است؛ پیام هشدار به واتساپ ادمین ارسال شد.`
            : undefined
    };
};

export const notifyExitPermitStep = async (p, platform, chatId, sendPhotoFn, db, stepName, eventType = 'STEP') => {
    try {
        const isEdit = eventType === 'EDIT';
        const isDelete = eventType === 'DELETE';
        
        // Deduplicate the same permit + status notification to avoid "Machine Gun" bursts
        const dedupeKey = `EXIT_${p.id}_${p.status}_${eventType}`;
        if (isDuplicateNotification(dedupeKey) && eventType !== 'MANUAL') return;
        
        let imgPrice = null;
        let imgNoPrice = null;
        try {
            imgPrice = await Renderer.generateRecordImage(p, 'EXIT', { isEdit, isDelete, forceHidePrices: false });
        } catch (imgErr) {
            console.error("[notifyExitPermitStep] Error generating imgPrice:", imgErr.message);
        }
        try {
            imgNoPrice = await Renderer.generateRecordImage(p, 'EXIT', { isEdit, isDelete, forceHidePrices: true });
        } catch (imgErr) {
            console.error("[notifyExitPermitStep] Error generating imgNoPrice:", imgErr.message);
        }
        
        const itemsToCalculate = (p.items && p.items.length > 0) ? p.items : [{ cartonCount: p.cartonCount || 0, weight: p.weight || 0, deliveredCartonCount: undefined, deliveredWeight: undefined }];
        const totalReqCount = itemsToCalculate.reduce((sum, i) => sum + (Number(i.cartonCount) || 0), 0);
        const totalReqWeight = itemsToCalculate.reduce((sum, i) => sum + (Number(i.weight) || 0), 0);
        
        const showDeliv = itemsToCalculate.some(i => i.deliveredCartonCount !== undefined);
        const totalDelivCount = showDeliv ? itemsToCalculate.reduce((sum, i) => sum + (Number(i.deliveredCartonCount) || 0), 0) : totalReqCount;
        const totalDelivWeight = showDeliv ? itemsToCalculate.reduce((sum, i) => sum + (Number(i.deliveredWeight) || 0), 0) : totalReqWeight;

        const settings = db.settings || {};

        const isLogisticsGroup = (id) => {
            if (!id) return false;
            const s = settings;
            const logisticsIds = [
                s.botSecurityGroupId,
                s.botBijakGroupId,
                s.botBijakGroupIdBale,
                s.botBijakGroupIdWhatsApp,
                s.exitPermitNotificationTelegramId,
                s.exitPermitNotificationBaleId,
                s.exitPermitNotificationGroup,
                s.defaultWarehouseGroup,
                s.exitPermitFirstGroupConfig?.groupId,
                s.exitPermitFirstGroupConfig?.telegramId,
                s.exitPermitFirstGroupConfig?.baleId,
                s.exitPermitSecondGroupConfig?.groupId,
                s.exitPermitSecondGroupConfig?.telegramId,
                s.exitPermitSecondGroupConfig?.baleId
            ].filter(Boolean).map(x => String(x));
            
            const strId = String(id);
            // Also detect by ID pattern (Telegram groups start with -)
            return logisticsIds.includes(strId) || strId.startsWith('-') || strId.includes('@g.us');
        };

        const generateCaption = (targetGroupId) => {
            const hidePrice = isLogisticsGroup(targetGroupId);
            let goodsList = '';
            if (p.items && p.items.length > 0) {
                goodsList = p.items.map((it, idx) => {
                    // Force hide price if it's a logistics group or as per general rule for factory groups
                    const priceTxt = (!hidePrice && it.price) ? ` (فی: ${Number(it.price).toLocaleString()} ریال)` : '';
                    return `${idx + 1}. ${it.goodsName} (${it.cartonCount} عدد)${priceTxt}`;
                }).join('\n');
            } else if (p.goodsName) {
                goodsList = `1. ${p.goodsName} (${p.cartonCount || 0} عدد)`;
            } else {
                goodsList = 'نامشخص';
            }

            const isFinalStep = p.status === 'خارج شده (بایگانی)';
            let header = isDelete ? `❌ *حذف شد: مجوز خروج کالا*` : (isEdit ? `✏️ *ویرایش شد: مجوز خروج کالا*` : `🚛 *مجوز خروج کالا از کارخانه*`);
            if (isFinalStep && !isDelete && !isEdit) header = `✅ *خروج کارخانه (تکمیل شده)*`;
            
            let approvers = [];
            if (p.approverCeo) approvers.push(`مدیرعامل / تایید فروش: ${p.approverCeo}`);
            if (p.approverFactory) approvers.push(`مدیر کارخانه / مجوز ورود و بارگیری: ${p.approverFactory}`);
            if (p.approverWarehouse) approvers.push(`سرپرست انبار / انجام بارگیری: ${p.approverWarehouse}`);
            if (p.approverSecurity) approvers.push(`سرپرست انتظامات / بازرسی و تایید بارگیری: ${p.approverSecurity}`);
            if (p.approverFactoryFinal) approvers.push(`مدیر کارخانه / تایید نهایی خروج: ${p.approverFactoryFinal}`);
            const approversLine = approvers.length > 0 ? `\n✅ *تاییدها:* \n${approvers.join('\n')}` : '';

            const countLine = `🔢 تعداد درخواستی: ${totalReqCount} واحد/کارتن ${totalReqWeight > 0 ? `(${totalReqWeight} کیلوگرم)` : ''} ${showDeliv ? `\n✅ ارسالی از انبار: ${totalDelivCount} واحد/کارتن ${totalDelivWeight > 0 ? `(${totalDelivWeight} کیلوگرم)` : ''}` : ''}`;
            
            const surveyUrl = `${(settings.appBaseUrl || 'https://dlkam.ir').replace(/\/+$/, '')}/#customer-survey?id=${p.permitNumber}`;
            const surveyBlock = (isFinalStep || p.status === 'خارج شده (بایگانی)' || p.status === 'خارج شد') ? `\n\n⭐ *فرم نظرسنجی و ارزیابی کیفیت خدمات مشتریان:*\n${surveyUrl}` : '';
            return `${header}\n🏢 شرکت: ${p.company || '-'}\n🔢 شماره: ${p.permitNumber}\n📅 تاریخ: ${toShamsiFull(p.date)}\n👤 گیرنده: ${p.recipientName || '-'}\n📦 کالاها:\n${goodsList}\n${countLine}\n👤 ثبت کننده: ${p.requester || '-'}\n📍 مقصد: ${p.destinationAddress || '-'}\n🚛 راننده: ${p.driverName || '-'} (پلاک: ${p.plateNumber || '-'}) | تماس: ${p.driverPhone || '-'}${p.status === 'خارج شده (بایگانی)' && p.exitTime ? `\n🕒 ساعت خروج نهایی: ${p.exitTime}` : (p.exitTime ? `\n🕒 ساعت خروج: ${p.exitTime}` : '')}${approversLine}\n📝 توضیحات: ${p.description || '-'}\n\n✅ *مرحله:* ${stepName}\n🔄 *وضعیت:* ${p.status}${isEdit ? '\n⚠️ *این یک پیام ویرایشی است*' : ''}${isDelete ? '\n⚠️ *این سند حذف شده است*' : ''}${surveyBlock}`;
        };

        // Notify the user who did the action (if possible)
        if (chatId && sendPhotoFn) {
            const userCaption = generateCaption(chatId);
            const userImg = isLogisticsGroup(chatId) ? (imgNoPrice || imgPrice) : (imgPrice || imgNoPrice);
            if (userImg) {
                sendPhotoFn(platform, chatId, userImg, userCaption).catch(e => console.error("User Notify Error:", e));
            }
        }

        // Map Persian Status to Internal Key for checking settings
        let statusKey = p.status;
        if (eventType === 'DELETE' || isDelete) {
            statusKey = 'DELETE';
        } else if (p.status === 'رد شده') {
            statusKey = 'REJECTED'; 
        } else if (p.status === 'کنسل شده') {
            statusKey = 'CANCELED';
        } else if (eventType === 'CREATE' || stepName === 'ثبت اولیه' || stepName === 'ثبت توسط ربات' || p.status === 'در انتظار تایید مدیرعامل') {
            statusKey = 'CREATE';
        } else if (p.status === 'خارج شده (بایگانی)' || p.status === 'خارج شد') {
            // This is the final archived state
            statusKey = 'ARCHIVED'; 
        }

        let targetGroups = [];

        const g1Config = settings.exitPermitFirstGroupConfig || { activeStatuses: [] };
        const g2Config = settings.exitPermitSecondGroupConfig || { activeStatuses: [] };
        const g3Config = settings.exitPermitThirdGroupConfig || { activeStatuses: [] };

        const hasActive1 = Array.isArray(g1Config.activeStatuses) && g1Config.activeStatuses.length > 0;
        const hasActive2 = Array.isArray(g2Config.activeStatuses) && g2Config.activeStatuses.length > 0;
        const hasActive3 = Array.isArray(g3Config.activeStatuses) && g3Config.activeStatuses.length > 0;

        // Resolve company notification config flexibly
        let companyConfig = settings.companyNotifications?.[p.company] || 
                            settings.companyNotifications?.[p.company?.trim()] || {};
        if (!companyConfig.baleChannelId && !companyConfig.telegramChannelId && !companyConfig.warehouseGroup) {
            const compName = (p.company || '').trim();
            if (compName && settings.companyNotifications) {
                for (const [k, v] of Object.entries(settings.companyNotifications)) {
                    if (k.trim() === compName || k.includes(compName) || compName.includes(k)) {
                        companyConfig = v;
                        break;
                    }
                }
            }
        }

        const hasG1 = !!(g1Config.telegramId || g1Config.baleId || g1Config.groupId || 
                         settings.exitPermitNotificationTelegramId || settings.exitPermitNotificationBaleId || 
                         settings.exitPermitNotificationGroup || settings.defaultWarehouseGroup ||
                         companyConfig.telegramChannelId || companyConfig.baleChannelId || companyConfig.warehouseGroup);

        if (eventType === 'MANUAL' || stepName === 'ارسال دستی') {
            if (hasG1) targetGroups.push(1);
            if (g2Config.telegramId || g2Config.baleId || g2Config.groupId) targetGroups.push(2);
            if (g3Config.telegramId || g3Config.baleId || g3Config.groupId) targetGroups.push(3);
            if (targetGroups.length === 0) targetGroups.push(1);
        } else {
            if (!hasActive1 || g1Config.activeStatuses.includes(statusKey) || (isDelete && (g1Config.activeStatuses.includes('DELETE') || g1Config.activeStatuses.includes('REJECTED'))) || (isEdit && g1Config.activeStatuses.includes('CREATE'))) {
                targetGroups.push(1);
            }
            if (hasActive2 && (g2Config.activeStatuses.includes(statusKey) || (isDelete && (g2Config.activeStatuses.includes('DELETE') || g2Config.activeStatuses.includes('REJECTED'))) || (isEdit && g2Config.activeStatuses.includes('CREATE')))) {
                targetGroups.push(2);
            }
            if (hasActive3 && (g3Config.activeStatuses.includes(statusKey) || (isDelete && (g3Config.activeStatuses.includes('DELETE') || g3Config.activeStatuses.includes('REJECTED'))) || (isEdit && g3Config.activeStatuses.includes('CREATE')))) {
                targetGroups.push(3);
            }
        }

        // Default routing fallbacks
        if (targetGroups.length === 0) {
            targetGroups.push(1);
        }

        // --- CEO/Manager Notification on Initial Creation ---
        if (statusKey === 'CREATE' && !isEdit && !isDelete) {
            const managers = (db.users || []).filter(u => u.role === 'ceo' || u.role === 'admin' || u.role === 'sales_manager');
            for (const mgr of managers) {
                const captionWithPrice = generateCaption(mgr.telegramId || mgr.baleId || mgr.phoneNumber);
                if (mgr.telegramId && settings.telegramBotToken) {
                    const cleanId = sanitizeGroupId(mgr.telegramId);
                    import('./telegram.js').then(async (mod) => {
                        if (!mod) return;
                        if (imgPrice && mod.sendBotPhoto) {
                            try {
                                await mod.sendBotPhoto(cleanId, imgPrice, captionWithPrice);
                                return;
                            } catch (e) {}
                        }
                        if (mod.sendBotMessage) {
                            await mod.sendBotMessage(cleanId, captionWithPrice).catch(() => {});
                        }
                    }).catch(() => {});
                }
                if (mgr.baleId && settings.baleBotToken) {
                    const cleanId = sanitizeGroupId(mgr.baleId);
                    import('./bale.js').then(async (mod) => {
                        if (!mod) return;
                        if (imgPrice && mod.sendBotPhoto) {
                            try {
                                await mod.sendBotPhoto(cleanId, imgPrice, captionWithPrice);
                                return;
                            } catch (e) {}
                        }
                        if (mod.sendBotMessage) {
                            await mod.sendBotMessage(cleanId, captionWithPrice).catch(() => {});
                        }
                    }).catch(() => {});
                }
                if (mgr.phoneNumber && settings.whatsappEnabled !== false) {
                    import('./whatsapp.js').then(async (mod) => {
                        if (!mod) return;
                        if (imgPrice && mod.sendMessage) {
                            try {
                                const buffer = Buffer.from(imgPrice);
                                const b64 = buffer.toString('base64');
                                await mod.sendMessage(mgr.phoneNumber, captionWithPrice, { data: b64, mimeType: 'image/png', filename: 'permit.png' });
                                return;
                            } catch (e) {}
                        }
                        if (mod.sendMessage) {
                            await mod.sendMessage(mgr.phoneNumber, captionWithPrice).catch(() => {});
                        }
                    }).catch(() => {});
                }
            }
        }

        // --- Customer Notification ONLY when Cargo Exits Factory (Strictly to Customer, NEVER to Driver) ---
        if ((p.status === 'خارج شده (بایگانی)' || p.status === 'خارج شد') && !isEdit && !isDelete) {
            (async () => {
                try {
                    await notifyCustomerCargoExit(p, db, false);
                } catch (cErr) {
                    console.error("❌ Customer cargo exit notification failed:", cErr.message);
                }
            })();
        }

        // Distinctly and separately fire off to all targets with bulletproof fallbacks
        for (const gNum of targetGroups) {
            let tgGroupId = '';
            let baleGroupId = '';
            let waGroupId = '';

            if (gNum === 1) {
                tgGroupId = g1Config.telegramId || companyConfig.telegramChannelId || settings.exitPermitNotificationTelegramId || '';
                baleGroupId = g1Config.baleId || companyConfig.baleChannelId || settings.exitPermitNotificationBaleId || '';
                waGroupId = g1Config.groupId || companyConfig.warehouseGroup || settings.exitPermitNotificationGroup || settings.defaultWarehouseGroup || '';
            } else if (gNum === 2) {
                tgGroupId = g2Config.telegramId || '';
                baleGroupId = g2Config.baleId || '';
                waGroupId = g2Config.groupId || '';
            } else if (gNum === 3) {
                tgGroupId = g3Config.telegramId || '';
                baleGroupId = g3Config.baleId || '';
                waGroupId = g3Config.groupId || '';
            }

            // Fire Telegram
            if (tgGroupId) {
                const cleanId = sanitizeGroupId(tgGroupId);
                const targetCaption = generateCaption(cleanId);
                const targetImg = isLogisticsGroup(cleanId) ? (imgNoPrice || imgPrice) : (imgPrice || imgNoPrice);
                import('./telegram.js').then(async (mod) => {
                    if (!mod) return;
                    let sent = false;
                    if (targetImg && mod.sendBotPhoto) {
                        try {
                            await mod.sendBotPhoto(cleanId, targetImg, targetCaption);
                            sent = true;
                            console.log(`[Exit Permit #${p.permitNumber}] Sent photo to TG Group ${cleanId} (Group ${gNum}) ✅`);
                        } catch (photoErr) {
                            console.warn(`[Exit Permit #${p.permitNumber}] TG Photo error to ${cleanId}: ${photoErr.message}. Falling back to text...`);
                        }
                    }
                    if (!sent && mod.sendBotMessage) {
                        await mod.sendBotMessage(cleanId, targetCaption);
                        console.log(`[Exit Permit #${p.permitNumber}] Sent text to TG Group ${cleanId} (Group ${gNum}) ✅`);
                    }
                }).catch(e => console.error("TG Group Notify Error:", e.message));
            }

            // Fire Bale
            if (baleGroupId) {
                const cleanId = sanitizeGroupId(baleGroupId);
                const targetCaption = generateCaption(cleanId);
                const targetImg = isLogisticsGroup(cleanId) ? (imgNoPrice || imgPrice) : (imgPrice || imgNoPrice);
                import('./bale.js').then(async (mod) => {
                    if (!mod) return;
                    let sent = false;
                    if (targetImg && mod.sendBotPhoto) {
                        try {
                            await mod.sendBotPhoto(cleanId, targetImg, targetCaption);
                            sent = true;
                            console.log(`[Exit Permit #${p.permitNumber}] Sent photo to Bale Group ${cleanId} (Group ${gNum}) ✅`);
                        } catch (photoErr) {
                            console.warn(`[Exit Permit #${p.permitNumber}] Bale Photo error to ${cleanId}: ${photoErr.message}. Falling back to text...`);
                        }
                    }
                    if (!sent && mod.sendBotMessage) {
                        await mod.sendBotMessage(cleanId, targetCaption);
                        console.log(`[Exit Permit #${p.permitNumber}] Sent text to Bale Group ${cleanId} (Group ${gNum}) ✅`);
                    }
                }).catch(e => console.error("Bale Group Notify Error:", e.message));
            }

            // Fire WhatsApp
            if (waGroupId && settings.whatsappEnabled !== false) {
                const cleanId = sanitizeGroupId(waGroupId);
                const targetCaption = generateCaption(cleanId);
                const targetImg = isLogisticsGroup(cleanId) ? (imgNoPrice || imgPrice) : (imgPrice || imgNoPrice);
                import('./whatsapp.js').then(async (mod) => {
                    if (!mod) return;
                    let sent = false;
                    if (targetImg && mod.sendMessage) {
                        try {
                            const buffer = Buffer.from(targetImg);
                            const b64 = buffer.toString('base64');
                            await mod.sendMessage(cleanId, targetCaption, { data: b64, mimeType: 'image/png', filename: 'permit.png' });
                            sent = true;
                            console.log(`[Exit Permit #${p.permitNumber}] Sent photo to WA Group ${cleanId} (Group ${gNum}) ✅`);
                        } catch (waImgErr) {
                            console.warn(`[Exit Permit #${p.permitNumber}] WA Photo error to ${cleanId}: ${waImgErr.message}. Falling back to text...`);
                        }
                    }
                    if (!sent && mod.sendMessage) {
                        await mod.sendMessage(cleanId, targetCaption);
                        console.log(`[Exit Permit #${p.permitNumber}] Sent text to WA Group ${cleanId} (Group ${gNum}) ✅`);
                    }
                }).catch(e => console.error("WA Group Notify Error:", e.message));
            }
        }
    } catch (e) { console.error("Notification Helper Error:", e); }
};

export const notifyPaymentOrderStep = async (o, db, stepName, isFinal = false, eventType = 'STEP') => {
    try {
        const isEdit = eventType === 'EDIT';
        const isDelete = eventType === 'DELETE';
        
        const dedupeKey = `PAYMENT_${o.id}_${o.status}_${eventType}`;
        if (isDuplicateNotification(dedupeKey)) return;
        const settings = db.settings || {};
        
        // DEFAULTING TO 'after_submit' based on repeated user request for accounting group behavior
        const mode = settings.botPaymentNotificationMode || 'after_submit';
        
        // CRITICAL: Mode filtering for ACCOUNTING GROUP
        // Based on user request: If mode is 'after_submit', ONLY send the initial registration message to the group.
        // We trim the stepName to avoid whitespace issues.
        const normalizedStep = (stepName || '').trim();
        
        if (mode === 'after_submit') {
            // When in 'after_submit' mode, block everything EXCEPT the initial creation
            if (normalizedStep !== 'ثبت اولیه') {
                // If it's a step change (not create/edit/delete), we block it for the group
                if (eventType === 'STEP') return;
                // If it's an EDIT or DELETE, we might want to send it, but let's be strict as per user request
                // The user says "only on initial registration mode", so we block others too if needed
                if (eventType === 'EDIT') return; // User doesn't want updates to flood the group
            }
        }
        
        // If mode is after_final, only send if it's the final approval
        if (mode === 'after_final' && !isFinal && eventType === 'STEP') return;

        const tgGroupId = settings.botAccountingGroupIdTele || settings.botAccountingGroupId || '';
        const baleGroupId = settings.botAccountingGroupIdBale || '';
        const waGroupId = settings.botAccountingGroupIdWhatsApp || '';

        if (!tgGroupId && !baleGroupId && !waGroupId) return; // No targets

        let paymentBankInfo = '-';
        if (o.paymentDetails && o.paymentDetails.length > 0) {
            const banks = [...new Set(o.paymentDetails.map(d => d.bankName || d.method).filter(Boolean))];
            if (banks.length > 0) {
                paymentBankInfo = banks.join('، ');
            }
        }

        let header = isDelete ? `❌ *حذف شد: دستور پرداخت*` : (isEdit ? `✏️ *ویرایش شد: دستور پرداخت*` : `📢 *درخواست پرداخت جدید*`);
        let caption = `${header}\n\n` +
            `🔢 *شماره پیگیری:* #${o.trackingNumber || o.id}\n` +
            `🏢 *شرکت صادرکننده:* ${o.payingCompany || o.company || '-'}\n` +
            `💰 *مبلغ کل:* *${Number(o.totalAmount || 0).toLocaleString()} ریال*\n` +
            `👤 *ذینفع / دریافت‌کننده:* *${o.payee || o.beneficiary || '-'}\n` +
            `👤 *درخواست کننده:* ${o.requester || o.createdByName || '-'}\n` +
            `📅 *تاریخ ثبت/پرداخت:* ${o.date ? toShamsiFull(o.date) : '-'}\n` +
            `🏦 *بانک / حساب:* ${paymentBankInfo}\n` +
            `💳 *نوع/روش پرداخت:* ${(o.paymentDetails && o.paymentDetails.length > 0) ? o.paymentDetails[0].method : (o.paymentMethod || '-')}\n` +
            `📍 *محل / مرکز هزینه:* ${o.paymentPlace || o.costCenter || '-'}\n` +
            `📝 *بابت / توضیحات کامل:* ${o.description || '-'}\n\n` +
            `✅ *مرحله:* ${stepName}\n` +
            `🔄 *وضعیت:* ${o.status}${isEdit ? '\n⚠️ *این یک پیام ویرایشی است*' : ''}${isDelete ? '\n⚠️ *این سند حذف شده است*' : ''}`;

        const attachFiles = o.attachments && o.attachments.length > 0;
        if (attachFiles) caption += `\n📎 همراه با ${o.attachments.length} فایل/سند الحاقی`;

        let paymentOrderImgBuffer = null;
        try {
            if (Renderer && Renderer.generateRecordImage) {
                paymentOrderImgBuffer = await Renderer.generateRecordImage(o, 'PAYMENT', { isEdit, isDelete, forceHidePrices: false });
            }
        } catch (imgErr) {
            console.warn("[notifyPaymentOrderStep] Payment order card render warning:", imgErr.message);
        }

        // Fire Telegram Group
        if (tgGroupId && settings.telegramBotToken) {
            const cleanId = sanitizeGroupId(tgGroupId);
            import('./telegram.js').then(async mod => {
                if (!mod) return;
                if (paymentOrderImgBuffer && mod.sendBotPhoto) {
                    await mod.sendBotPhoto(cleanId, paymentOrderImgBuffer, caption).catch(async () => {
                        if (mod.sendBotMessage) await mod.sendBotMessage(cleanId, caption).catch(e => console.error("TG Payment Text Error:", e));
                    });
                } else if (mod.sendBotMessage) {
                    await mod.sendBotMessage(cleanId, caption).catch(e => console.error("TG Payment Notify Error:", e));
                }
            }).catch(e => console.error("TG Import Error", e));
        }

        // Fire Bale Group
        if (baleGroupId && settings.baleBotToken) {
            const cleanId = sanitizeGroupId(baleGroupId);
            import('./bale.js').then(async mod => {
                if (!mod) return;
                if (paymentOrderImgBuffer && mod.sendBotPhoto) {
                    await mod.sendBotPhoto(cleanId, paymentOrderImgBuffer, caption).catch(async () => {
                        if (mod.sendBotMessage) await mod.sendBotMessage(cleanId, caption).catch(e => console.error("Bale Payment Text Error:", e));
                    });
                } else if (mod.sendBotMessage) {
                    await mod.sendBotMessage(cleanId, caption).catch(e => console.error("Bale Payment Notify Error:", e));
                }
            }).catch(e => console.error("Bale Import Error", e));
        }

        // Helper to resolve attachment base64 (from inline data or /uploads/ file path)
        const resolveAttachmentBase64 = (att) => {
            if (!att) return null;
            if (att.data) {
                return att.data.replace(/^data:[^;]+;base64,/, '');
            }
            const fileUrl = att.url || att.path || att.filePath;
            if (fileUrl && typeof fileUrl === 'string') {
                try {
                    const relPath = fileUrl.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '');
                    const absPath = path.resolve(process.cwd(), relPath);
                    if (fs.existsSync(absPath)) {
                        return fs.readFileSync(absPath).toString('base64');
                    }
                } catch (e) {}
            }
            return null;
        };

        // Fire WhatsApp Group
        if (waGroupId && settings.whatsappEnabled !== false) {
            import('./whatsapp.js').then(async mod => {
                if (!mod || !mod.sendMessage) return;
                if (paymentOrderImgBuffer) {
                    const b64 = paymentOrderImgBuffer.toString('base64');
                    const sendRes = await mod.sendMessage(waGroupId, caption, {
                        data: b64,
                        mimeType: 'image/png',
                        filename: `payment_order_${o.id || o.trackingNumber}.png`
                    }).catch(() => ({ success: false }));
                    if (!sendRes || !sendRes.success) {
                        await mod.sendMessage(waGroupId, caption).catch(e => console.error("WA Payment Notify Error:", e));
                    }
                } else {
                    await mod.sendMessage(waGroupId, caption).catch(e => console.error("WA Payment Notify Error:", e));
                }

                // Send attached invoice/receipt photos or PDFs right after the payment order card
                if (o.attachments && o.attachments.length > 0) {
                    for (let attIdx = 0; attIdx < o.attachments.length; attIdx++) {
                        const att = o.attachments[attIdx];
                        try {
                            const attB64 = resolveAttachmentBase64(att);
                            if (attB64) {
                                const attName = att.name || att.fileName || `attachment_${attIdx + 1}.png`;
                                const attMime = att.mimeType || (attName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');
                                await mod.sendMessage(waGroupId, `📎 پیوست (${attIdx + 1}/${o.attachments.length}) دستور پرداخت #${o.trackingNumber || o.id}\n📄 ${attName}`, {
                                    data: attB64,
                                    mimeType: attMime,
                                    filename: attName
                                }).catch(() => {});
                            }
                        } catch (attErr) {}
                    }
                }
            }).catch(e => console.error("WA Import Error", e));
        }

        // Send simultaneously to responsible individuals for each stage (CEO, Finance Manager, Accountant)
        const responsibleUsers = (db.users || []).filter(u => {
            if (isFinal) return u.role === 'financial' || u.role === 'accountant' || u.role === 'admin';
            if (o.status === 'APPROVED_FINANCE') return u.role === 'manager' || u.role === 'admin';
            if (o.status === 'APPROVED_MANAGER') return u.role === 'ceo' || u.role === 'admin';
            return u.role === 'ceo' || u.role === 'financial' || u.role === 'manager' || u.role === 'admin';
        });

        for (const user of responsibleUsers) {
            if (user.phoneNumber && settings.whatsappEnabled !== false) {
                import('./whatsapp.js').then(async mod => {
                    if (!mod || !mod.sendMessage) return;
                    if (paymentOrderImgBuffer) {
                        const b64 = paymentOrderImgBuffer.toString('base64');
                        await mod.sendMessage(user.phoneNumber, caption, {
                            data: b64,
                            mimeType: 'image/png',
                            filename: `payment_order_${o.id || o.trackingNumber}.png`
                        }).catch(() => {});
                    } else {
                        await mod.sendMessage(user.phoneNumber, caption).catch(() => {});
                    }
                    if (o.attachments && o.attachments.length > 0) {
                        for (let attIdx = 0; attIdx < o.attachments.length; attIdx++) {
                            const att = o.attachments[attIdx];
                            try {
                                const attB64 = resolveAttachmentBase64(att);
                                if (attB64) {
                                    const attName = att.name || att.fileName || `attachment_${attIdx + 1}.png`;
                                    const attMime = att.mimeType || (attName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');
                                    await mod.sendMessage(user.phoneNumber, `📎 پیوست (${attIdx + 1}/${o.attachments.length}) دستور پرداخت #${o.trackingNumber || o.id}\n📄 ${attName}`, {
                                        data: attB64,
                                        mimeType: attMime,
                                        filename: attName
                                    }).catch(() => {});
                                }
                            } catch (attErr) {}
                        }
                    }
                }).catch(() => {});
            }
        }
    } catch (e) { console.error("Payment Notification Helper Error:", e); }
};

export const notifyDriverPayment = async (dp, db, eventType = 'CREATE', options = {}) => {
    try {
        if (!dp) return { success: false, error: 'No driver payment data' };
        const isEdit = eventType === 'EDIT';
        const isDelete = eventType === 'DELETE';
        const isManual = eventType === 'MANUAL';
        const stage = options.stage || (dp.factoryApproved || dp.status === 'ARCHIVED' ? 'factory' : (dp.supervisorApproved || dp.status === 'PENDING_FACTORY' ? 'supervisor' : 'initial'));

        const dedupeKey = `DRIVER_PAY_${dp.id}_${eventType}_${stage}`;
        if (!isManual && isDuplicateNotification(dedupeKey)) return { success: true, deduped: true };

        const settings = db?.settings || {};

        // Support Stage 2 (Factory Manager approval) vs Stage 1 (Supervisor / Initial)
        let tgGroupId = '';
        let baleGroupId = '';
        let waGroupId = '';

        if (stage === 'factory') {
            tgGroupId = settings.botDriverPaymentSecondGroupIdTele || settings.botDriverPaymentGroupIdTele || settings.botDriverPaymentGroupId || '';
            baleGroupId = settings.botDriverPaymentSecondGroupIdBale || settings.botDriverPaymentGroupIdBale || '';
            waGroupId = settings.botDriverPaymentSecondGroupIdWhatsApp || settings.botDriverPaymentGroupIdWhatsApp || '';
        } else {
            tgGroupId = settings.botDriverPaymentGroupIdTele || settings.botDriverPaymentGroupId || '';
            baleGroupId = settings.botDriverPaymentGroupIdBale || '';
            waGroupId = settings.botDriverPaymentGroupIdWhatsApp || '';
        }

        // Allow explicit targetGroupId override
        if (options.targetGroupId) {
            if (options.platform === 'tele') tgGroupId = options.targetGroupId;
            else if (options.platform === 'bale') baleGroupId = options.targetGroupId;
            else if (options.platform === 'wa') waGroupId = options.targetGroupId;
            else {
                tgGroupId = options.targetGroupId;
                baleGroupId = options.targetGroupId;
            }
        }

        if (!tgGroupId && !baleGroupId && !waGroupId) {
            console.log(">>> notifyDriverPayment: No driver payment bot groups configured in settings for stage:", stage);
            return { success: false, message: 'هیچ گروهی برای ارسال واریزی رانندگان در تنظیمات ربات تعیین نشده است.' };
        }

        const formattedAmount = dp.amount ? Number(dp.amount).toLocaleString('fa-IR') + ' ریال' : 'مشخص نشده';
        const dateStr = dp.date ? (toShamsiFull ? toShamsiFull(dp.date) : dp.date) : '-';

        let header = '';
        if (isDelete) {
            header = `❌ *حذف شد: فرم حواله و واریزی راننده*`;
        } else if (isEdit) {
            header = `✏️ *ویرایش شد: فرم حواله و واریزی راننده*`;
        } else if (stage === 'factory') {
            header = `✅ *تایید نهایی مدیر کارخانه و بایگانی: فرم واریزی راننده*`;
        } else if (stage === 'supervisor') {
            header = `📋 *تایید سرپرست انتظامات: فرم واریزی راننده (ارسال به انتظامات)*`;
        } else {
            header = `🚚 *فرم واریزی و کرایه راننده - واحد انتظامات*`;
        }

        let caption = `${header}\n\n` +
            `👤 *نام راننده:* ${dp.driverName || '-'}\n` +
            `📱 *تلفن تماس:* ${dp.driverPhone || 'ثبت نشده'}\n` +
            `🚗 *شماره پلاک:* ${dp.plateNumber || 'ثبت نشده'}\n` +
            `💰 *مبلغ واریزی:* ${formattedAmount}\n` +
            `💳 *نوع پرداخت:* ${dp.paymentType || 'کارت به کارت'}\n` +
            (dp.cardNumber ? `💳 *شماره کارت:* \`${dp.cardNumber}\`\n` : '') +
            (dp.shebaNumber ? `🏦 *شماره شبا:* \`${dp.shebaNumber}\`\n` : '') +
            ((dp.bankName || dp.accountHolder) ? `🏛️ *بانک / حساب:* ${dp.bankName || ''} ${dp.accountHolder ? `(به نام: ${dp.accountHolder})` : ''}\n` : '') +
            `📦 *نام کالا:* ${dp.goodsName || 'ثبت نشده'}\n` +
            `🔢 *مقدار / تعداد:* ${dp.quantity || 'ثبت نشده'}\n` +
            `📍 *مسیر حمل:* از *${dp.origin || 'نامشخص'}* به *${dp.destination || 'نامشخص'}*\n` +
            (dp.permitProvider ? `🏢 *شرکت / صادرکننده:* ${dp.permitProvider}\n` : '') +
            `👤 *ثبت‌کننده:* ${dp.registrant || 'واحد انتظامات'}\n` +
            `📅 *تاریخ:* ${dateStr}\n` +
            (dp.supervisorApproved ? `👮‍♂️ *تایید سرپرست انتظامات:* تایید شده توسط ${dp.supervisorApproverName || 'سرپرست'}\n` : '') +
            (dp.factoryApproved ? `🏭 *تایید مدیر کارخانه:* تایید و بایگانی شده توسط ${dp.factoryApproverName || 'مدیریت'}\n` : '') +
            (dp.description ? `📝 *توضیحات:* ${dp.description}\n` : '') +
            `${isEdit ? '\n⚠️ *این یک پیام ویرایشی است*' : ''}` +
            `${isDelete ? '\n⚠️ *این سند واریزی حذف شده است*' : ''}`;

        // Generate Record Card Image
        let formImageBuffer = null;
        try {
            if (Renderer && Renderer.generateRecordImage) {
                formImageBuffer = await Renderer.generateRecordImage(dp, 'DRIVER_PAYMENT', { isEdit, isDelete });
            }
        } catch (imgErr) {
            console.error("Failed to render driver payment card image:", imgErr.message);
        }

        const attachments = Array.isArray(dp.attachments) ? dp.attachments : [];
        if (attachments.length > 0) {
            caption += `\n📎 *پیوست‌ها:* شامل ${attachments.length} فایل ضمیمه (در حال ارسال به همراه پیام...)`;
        }

        // Helper to load file buffer
        const loadAttachmentBuffer = async (att) => {
            if (!att || !att.url) return null;
            try {
                let buffer = null;
                let mimeType = 'application/octet-stream';
                const fileName = att.fileName || 'attachment';

                if (att.url.startsWith('data:')) {
                    const match = att.url.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        mimeType = match[1];
                        buffer = Buffer.from(match[2], 'base64');
                    }
                } else if (att.url.startsWith('http://') || att.url.startsWith('https://')) {
                    const res = await fetch(att.url);
                    if (res.ok) {
                        const ab = await res.arrayBuffer();
                        buffer = Buffer.from(ab);
                        mimeType = res.headers.get('content-type') || mimeType;
                    }
                } else {
                    // Local file from uploads dir
                    let cleanPath = att.url.replace(/^\/?uploads\//, '');
                    cleanPath = cleanPath.replace(/^\//, '');
                    const fullPath = path.join(process.cwd(), 'uploads', cleanPath);
                    if (fs.existsSync(fullPath)) {
                        buffer = await fs.promises.readFile(fullPath);
                    } else {
                        const fallbackPath = path.join(process.cwd(), cleanPath);
                        if (fs.existsSync(fallbackPath)) {
                            buffer = await fs.promises.readFile(fallbackPath);
                        }
                    }
                }

                if (buffer) {
                    if (/\.(jpg|jpeg)$/i.test(fileName)) mimeType = 'image/jpeg';
                    else if (/\.png$/i.test(fileName)) mimeType = 'image/png';
                    else if (/\.webp$/i.test(fileName)) mimeType = 'image/webp';
                    else if (/\.pdf$/i.test(fileName)) mimeType = 'application/pdf';
                    else if (/\.xlsx$/i.test(fileName)) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

                    const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName);
                    return { buffer, mimeType, fileName, isImage };
                }
            } catch (err) {
                console.error("Error reading attachment for driver payment:", att.fileName, err.message);
            }
            return null;
        };

        // Load all valid buffers
        const loadedAttachments = [];
        for (const att of attachments) {
            const loaded = await loadAttachmentBuffer(att);
            if (loaded) loadedAttachments.push(loaded);
        }

        // Fire Telegram
        if (tgGroupId && settings.telegramBotToken) {
            const cleanId = sanitizeGroupId(tgGroupId);
            import('./telegram.js').then(async (mod) => {
                if (mod) {
                    // Send form card image with caption if available
                    if (formImageBuffer && mod.sendBotPhoto) {
                        await mod.sendBotPhoto(cleanId, formImageBuffer, caption, { parse_mode: 'Markdown', filename: `driver_payment_${dp.id}.png` })
                            .catch(async () => {
                                if (mod.sendBotMessage) await mod.sendBotMessage(cleanId, caption, { parse_mode: 'Markdown' });
                            });
                    } else if (mod.sendBotMessage) {
                        await mod.sendBotMessage(cleanId, caption, { parse_mode: 'Markdown' }).catch(e => console.error("TG Driver Payment Text Error:", e.message));
                    }

                    // Send attachments one by one
                    for (const item of loadedAttachments) {
                        await new Promise(r => setTimeout(r, 600));
                        const fileCaption = `📎 پیوست فرم واریزی (${dp.driverName}): ${item.fileName}`;
                        if (item.isImage && mod.sendBotPhoto) {
                            await mod.sendBotPhoto(cleanId, item.buffer, fileCaption, { filename: item.fileName }).catch(e => console.error("TG Driver Payment Photo Error:", e.message));
                        } else if (mod.sendBotDocument) {
                            await mod.sendBotDocument(cleanId, item.buffer, item.fileName, fileCaption).catch(e => console.error("TG Driver Payment Doc Error:", e.message));
                        }
                    }
                }
            }).catch(e => console.error("TG Import Error", e));
        }

        // Fire Bale
        if (baleGroupId && settings.baleBotToken) {
            const cleanId = sanitizeGroupId(baleGroupId);
            import('./bale.js').then(async (mod) => {
                if (mod) {
                    // Send form card image with caption if available
                    if (formImageBuffer && mod.sendBotPhoto) {
                        await mod.sendBotPhoto(cleanId, formImageBuffer, caption, { filename: `driver_payment_${dp.id}.png` })
                            .catch(async () => {
                                if (mod.sendBotMessage) await mod.sendBotMessage(cleanId, caption);
                            });
                    } else if (mod.sendBotMessage) {
                        await mod.sendBotMessage(cleanId, caption).catch(e => console.error("Bale Driver Payment Text Error:", e.message));
                    }

                    // Send attachments one by one
                    for (const item of loadedAttachments) {
                        await new Promise(r => setTimeout(r, 600));
                        const fileCaption = `📎 پیوست فرم واریزی (${dp.driverName}): ${item.fileName}`;
                        if (item.isImage && mod.sendBotPhoto) {
                            await mod.sendBotPhoto(cleanId, item.buffer, fileCaption, { filename: item.fileName }).catch(e => console.error("Bale Driver Payment Photo Error:", e.message));
                        } else if (mod.sendBotDocument) {
                            await mod.sendBotDocument(cleanId, item.buffer, item.fileName, fileCaption).catch(e => console.error("Bale Driver Payment Doc Error:", e.message));
                        }
                    }
                }
            }).catch(e => console.error("Bale Import Error", e));
        }

        // Fire WhatsApp Group
        if (waGroupId && settings.whatsappEnabled !== false) {
            import('./whatsapp.js').then(async (mod) => {
                if (mod?.sendMessage) {
                    if (formImageBuffer) {
                        const b64 = formImageBuffer.toString('base64');
                        const sendRes = await mod.sendMessage(waGroupId, caption, {
                            data: b64,
                            mimeType: 'image/png',
                            filename: `driver_payment_${dp.id}.png`
                        }).catch(() => ({ success: false }));
                        if (!sendRes || !sendRes.success) {
                            await mod.sendMessage(waGroupId, caption).catch(e => console.error("WA Driver Payment Text Error:", e.message));
                        }
                    } else {
                        await mod.sendMessage(waGroupId, caption).catch(e => console.error("WA Driver Payment Text Error:", e.message));
                    }

                    // Send attachments one by one
                    for (const item of loadedAttachments) {
                        await new Promise(r => setTimeout(r, 800));
                        const fileCaption = `📎 پیوست فرم واریزی (${dp.driverName}): ${item.fileName}`;
                        const b64 = item.buffer.toString('base64');
                        await mod.sendMessage(waGroupId, fileCaption, {
                            data: b64,
                            mimeType: item.mimeType,
                            filename: item.fileName
                        }).catch(e => console.error("WA Driver Payment Media Error:", e.message));
                    }
                }
            }).catch(e => console.error("WA Import Error", e));
        }

        // Direct WhatsApp to Driver (if driver phone provided)
        if (dp.driverPhone && settings.whatsappEnabled !== false && !isDelete) {
            const driverCaption = `🚚 *رسید واریز کرایه راننده*\n` +
                `جناب آقای ${dp.driverName || 'راننده محترم'}، مبلغ ${formattedAmount} بابت کرایه مسیر ${dp.origin || ''} به ${dp.destination || ''} واریز گردید.\n` +
                `📅 تاریخ: ${dateStr}\n` +
                (dp.cardNumber ? `💳 شماره کارت: ${dp.cardNumber}\n` : '') +
                `✅ وضعیت: ${stage === 'factory' ? 'تایید نهایی و واریز شد' : 'در حال پردازش و تایید'}`;

            import('./whatsapp.js').then(async (mod) => {
                if (mod?.sendMessage) {
                    if (formImageBuffer) {
                        const b64 = formImageBuffer.toString('base64');
                        await mod.sendMessage(dp.driverPhone, driverCaption, {
                            data: b64,
                            mimeType: 'image/png',
                            filename: `driver_receipt_${dp.id}.png`
                        }).catch(() => {});
                    } else {
                        await mod.sendMessage(dp.driverPhone, driverCaption).catch(() => {});
                    }
                }
            }).catch(() => {});
        }

        // Send to Responsible Stage Users (Supervisor / Factory Manager / Accounting)
        const responsibleStageRoles = stage === 'factory' 
            ? ['factory_manager', 'financial', 'accountant', 'admin'] 
            : ['security_supervisor', 'security', 'factory_manager', 'admin'];
        const stageUsers = (db?.users || []).filter(u => responsibleStageRoles.includes(u.role) && u.phoneNumber);

        for (const sUser of stageUsers) {
            if (settings.whatsappEnabled !== false) {
                import('./whatsapp.js').then(async (mod) => {
                    if (mod?.sendMessage && formImageBuffer) {
                        const b64 = formImageBuffer.toString('base64');
                        await mod.sendMessage(sUser.phoneNumber, caption, {
                            data: b64,
                            mimeType: 'image/png',
                            filename: `driver_payment_${dp.id}.png`
                        }).catch(() => {});
                    }
                }).catch(() => {});
            }
        }

        return { success: true, count: loadedAttachments.length };
    } catch (e) {
        console.error("notifyDriverPayment Error:", e);
        return { success: false, error: e.message };
    }
};

export const notifyWarehouseBijak = async (tx, db, stepName, eventType = 'STEP') => {
    try {
        const isEdit = eventType === 'EDIT';
        const isDelete = eventType === 'DELETE';

        const dedupeKey = `BIJAK_${tx.id}_${tx.status}_${eventType}`;
        if (isDuplicateNotification(dedupeKey)) return;
        
        const settings = db.settings || {};
        
        // Calculate remaining balance for items in this Bijak
        const txs = Array.isArray(db.warehouseTransactions) ? db.warehouseTransactions : [];
        const stockInfo = (tx.items || []).map(item => {
            let qty = 0; let weight = 0;
            txs.filter(t => t.company === tx.company && t.status !== 'REJECTED').forEach(t => {
                if (Array.isArray(t.items)) {
                    t.items.forEach(ti => {
                        if (ti.itemId === item.itemId || ti.itemName === item.itemName) {
                            if (t.type === 'IN') { qty += (ti.quantity || 0); weight += (ti.weight || 0); }
                            else { qty -= (ti.quantity || 0); weight -= (ti.weight || 0); }
                        }
                    });
                }
            });
            return { name: item.itemName, qty, weight };
        });

        // Use full date helper if available
        const dateStr = toShamsiFull ? toShamsiFull(tx.date) : new Date(tx.date).toLocaleDateString('fa-IR');
        
        // Generate images using Renderer
        const Renderer = await import('./renderer.js');
        const imgWithPrice = await Renderer.generateRecordImage(tx, 'BIJAK', { isEdit, isDelete, forceHidePrices: false, stockInfo });
        const imgNoPrice = await Renderer.generateRecordImage(tx, 'BIJAK', { isEdit, isDelete, forceHidePrices: true, stockInfo });
        
        let header = tx.isUnionExit 
            ? (isDelete ? `❌ *حذف شد: خروج اتحادیه*` : (isEdit ? `✏️ *ویرایش شد: خروج اتحادیه*` : `🚨 *حواله خروج اتحادیه*`))
            : (isDelete ? `❌ *حذف شد: حواله خروج انبار (بیجک)*` : (isEdit ? `✏️ *ویرایش شد: حواله خروج انبار*` : `🚨 *حواله خروج انبار (بیجک)*`));
            
        let footerText = stepName === 'ثبت اولیه' ? '⚠️ *لطفا جهت بررسی و تایید به کارتابل انبار مراجعه فرمایید.*' : `✅ *تایید نهایی توسط:* ${tx.approvedBy || '-'}`;
        
        let commonDetails = `🔢 *شماره:* ${tx.number}\n`;
        commonDetails += `🏢 *شرکت:* ${tx.company || '-'}\n`;
        commonDetails += `📅 *تاریخ:* ${dateStr}\n`;
        
        if (tx.isUnionExit && tx.unionExitDetails) {
            commonDetails += `👤 *خریدار:* ${tx.unionExitDetails.buyerName || '-'}\n`;
            if (tx.unionExitDetails.nationalCode && tx.unionExitDetails.nationalCode !== '0') {
                commonDetails += `🪪 *کد ملی:* \`${tx.unionExitDetails.nationalCode}\`\n`;
            }
            if (tx.unionExitDetails.mobile && tx.unionExitDetails.mobile !== '0') {
                commonDetails += `📱 *تلفن:* \`${tx.unionExitDetails.mobile}\`\n`;
            }
            if (tx.unionExitDetails.address && tx.unionExitDetails.address !== '0') {
                commonDetails += `📍 *آدرس:* ${tx.unionExitDetails.address}\n`;
            }
            if (tx.unionExitDetails.guildId && tx.unionExitDetails.guildId !== '0') {
                commonDetails += `🔖 *شناسه صنفی:* \`${tx.unionExitDetails.guildId}\`\n`;
            }
        } else {
            commonDetails += `👤 *گیرنده:* ${tx.recipientName || '-'}\n`;
            commonDetails += `📍 *مقصد:* ${tx.destination || '-'}\n`;
            commonDetails += `🚚 *راننده:* ${tx.driverName || '-'}\n`;
            commonDetails += `🆔 *پلاک:* \`${tx.plateNumber || '-'}\`\n`;
        }
        commonDetails += `━━━━━━━━━━━━━━\n`;
        
        const getItemsText = (showPrice) => {
            let text = `📦 *اقلام حواله:* \n`;
            tx.items.forEach((it, idx) => {
                text += `${idx + 1}. ${it.itemName} | ${it.quantity} ${it.unit || 'واحد'}${showPrice && it.unitPrice ? ` | في: ${Number(it.unitPrice).toLocaleString()}` : ''}\n`;
            });
            return text;
        };

        const stockText = `━━━━━━━━━━━━━━\n📊 *مانده موجودی این کالاها:* \n${stockInfo.map(s => `🔹 ${s.name}: ${s.qty.toFixed(2)} واحد | ${s.weight.toFixed(2)} KG`).join('\n')}\n`;
        
        const footer = `━━━━━━━━━━━━━━\n${tx.description ? `📝 *توضیحات:* ${tx.description}\n━━━━━━━━━━━━━━\n` : ''}🔄 *وضعیت:* ${tx.status || 'PENDING'}\n📢 *مرحله:* ${stepName}\n${footerText}`;

        const privateCaption = `${header}\n━━━━━━━━━━━━━━\n${commonDetails}${getItemsText(true)}${stockText}${footer}`;
        const groupCaption = `${header}\n━━━━━━━━━━━━━━\n${commonDetails}${getItemsText(false)}${stockText}${footer}`;

        const mediaDataNoPrice = { data: imgNoPrice.toString('base64'), filename: `Bijak_${tx.number}.png`, mimeType: 'image/png' };
        const mediaDataWithPrice = { data: imgWithPrice.toString('base64'), filename: `Bijak_${tx.number}_Price.png`, mimeType: 'image/png' };

        const reply_markup = {
            inline_keyboard: [
                [
                    { text: '✅ تایید نهایی', callback_data: `APP_WH_${tx.id}` },
                    { text: '❌ رد درخواست', callback_data: `REJ_WH_${tx.id}` }
                ]
            ]
        };

        // Helper to send based on target type
        const sendToTarget = async (t, isPrivate) => {
            const img = isPrivate ? imgWithPrice : imgNoPrice;
            const caption = isPrivate ? privateCaption : groupCaption;
            const media = isPrivate ? mediaDataWithPrice : mediaDataNoPrice;
            const opts = (tx.status === 'PENDING' && isPrivate) ? { reply_markup } : {};

            if (t.type === 'wa' && settings.whatsappEnabled !== false) {
                const mod = await import('./whatsapp.js');
                mod.sendMessage(t.id, caption, media).catch(console.error);
            }
            if (t.type === 'tg' && settings.telegramBotToken) {
                const mod = await import('./telegram.js');
                mod.sendBotPhoto(sanitizeGroupId(t.id), img, caption, opts).catch(console.error);
            }
            if (t.type === 'bale' && settings.baleBotToken) {
                const mod = await import('./bale.js');
                mod.sendBotPhoto(sanitizeGroupId(t.id), img, caption, opts).catch(console.error);
            }
        };

        // 1. Send to Global Bijak Groups (if configured) -> NO PRICE
        const tgGroupId = settings.botBijakGroupId || '';
        const baleGroupId = settings.botBijakGroupIdBale || '';
        const waGroupId = settings.botBijakGroupIdWhatsApp || '';

        if (tx.status === 'APPROVED' || isDelete || isEdit) {
            if (tgGroupId) sendToTarget({ type: 'tg', id: tgGroupId }, false);
            if (baleGroupId) sendToTarget({ type: 'bale', id: baleGroupId }, false);
            if (waGroupId) sendToTarget({ type: 'wa', id: waGroupId }, false);
        }

        // 2. Send to Company-Specific Groups/Managers -> GROUPS NO PRICE
        const companyConfig = settings.companyNotifications?.[tx.company];
        if (companyConfig) {
            // Group notifications
            if (tx.status === 'APPROVED' && companyConfig.warehouseGroup) sendToTarget({ type: 'wa', id: companyConfig.warehouseGroup }, false);
            if (tx.status === 'APPROVED' && companyConfig.telegramChannelId) sendToTarget({ type: 'tg', id: companyConfig.telegramChannelId }, false);
            if (tx.status === 'APPROVED' && companyConfig.baleChannelId) sendToTarget({ type: 'bale', id: companyConfig.baleChannelId }, false);
            
            // Sales Manager notifications on Approval
            if (tx.status === 'APPROVED' && companyConfig.salesManager) sendToTarget({ type: 'wa', id: companyConfig.salesManager }, true);
            if (tx.status === 'APPROVED' && companyConfig.salesManagerBale) sendToTarget({ type: 'bale', id: companyConfig.salesManagerBale }, true);
            if (tx.status === 'APPROVED' && companyConfig.salesManagerTelegram) sendToTarget({ type: 'tg', id: companyConfig.salesManagerTelegram }, true);

            if (stepName === 'ثبت اولیه' && companyConfig.salesManager) sendToTarget({ type: 'wa', id: companyConfig.salesManager }, true);
            if (stepName === 'ثبت اولیه' && companyConfig.salesManagerBale) sendToTarget({ type: 'bale', id: companyConfig.salesManagerBale }, true);
            if (stepName === 'ثبت اولیه' && companyConfig.salesManagerTelegram) sendToTarget({ type: 'tg', id: companyConfig.salesManagerTelegram }, true);
        }

        // 3. If Pending, Notify CEO/Managers/Warehouse Supervisors (Private) -> WITH PRICE
        if (tx.status === 'PENDING' && stepName === 'ثبت اولیه') {
            const managers = (db.users || []).filter(u => u.role === 'ceo' || u.role === 'admin' || u.role === 'warehouse_manager' || u.role === 'warehouse');
            for (const mgr of managers) {
                if (mgr.telegramId) sendToTarget({ type: 'tg', id: mgr.telegramId }, true);
                if (mgr.baleId) sendToTarget({ type: 'bale', id: mgr.baleId }, true);
                if (mgr.phoneNumber) sendToTarget({ type: 'wa', id: mgr.phoneNumber }, true);
            }
        }

        // 4. Send directly to Driver on WhatsApp upon approval (if driver mobile present)
        if (tx.status === 'APPROVED' && (tx.driverPhone || tx.driverMobile) && settings.whatsappEnabled !== false) {
            const driverPhone = tx.driverPhone || tx.driverMobile;
            sendToTarget({ type: 'wa', id: driverPhone }, false);
        }

    } catch (e) {
        console.error("notifyWarehouseBijak Error:", e);
    }
};

export const handleCallback = async (platform, chatId, userId, data, sendFn, sendPhotoFn, sendDocFn, checkMembershipFn) => {
    const db = getDb();
    const settings = db.settings || {};
    const user = resolveUser(db, platform, userId);
    const isGroup = chatId.toString().startsWith('-') || 
                  (platform === 'bale' && (chatId.toString().length > 10 || chatId.toString().startsWith('g') || chatId.toString().includes('@group'))) ||
                  (userId && userId.toString() !== chatId.toString());

    if (!sessions[userId]) sessions[userId] = { state: 'IDLE', data: {} };
    const session = sessions[userId];
    
    // --- GROUP SILENCE POLICY ---
    if (isGroup && !data.startsWith('APP_') && !data.startsWith('REJ_') && !data.startsWith('GEN_PDF_') && data !== 'CHECK_JOIN') {
        return; 
    }
    
    // GUEST HANDLERS / PRE-AUTH HANDLERS
    if (data === 'CHECK_JOIN') {
        if (!user && !isGroup && (platform === 'telegram' || platform === 'bale') && settings.botForceJoinEnabled && settings.botForceJoinChannels) {
            if (checkMembershipFn) {
                const missingChannels = [];
                for (const ch of settings.botForceJoinChannels) {
                    if (ch.id && (!ch.platform || ch.platform === platform || ch.platform === 'all')) {
                        try {
                            const normalizedId = normalizeChannelId(ch.id);
                            const isMember = await checkMembershipFn(userId, normalizedId);
                            console.log(`[Join Callback] User ${userId} on ${platform} for channel ${normalizedId}: ${isMember}`);
                            if (!isMember) missingChannels.push(ch);
                        } catch (e) {
                            console.error(`[Join Callback Err] ${e.message}`);
                            missingChannels.push(ch);
                        }
                    }
                }
                if (missingChannels.length > 0) {
                    const btns = missingChannels.map(ch => {
                        let link = ch.link;
                        if (!link) {
                            let id = (ch.id || '').toString();
                            if (id.startsWith('http')) {
                                link = id;
                            } else {
                                const cleanId = id.replace('@', '');
                                if (platform === 'bale') link = `https://ble.ir/${cleanId}`;
                                else link = `https://t.me/${cleanId}`;
                            }
                        }
                        return [{ text: `عضویت در ${ch.name || 'کانال'}`, url: link }];
                    });
                    btns.push([{ text: '✅ عضو شدم', callback_data: 'CHECK_JOIN' }]);
                    
                    let debugInfo = "";
                    if (platform === 'bale') {
                        debugInfo = `\n\n🔍 اطلاعات بررسی:\nآیدی شما: ${userId}\nآیدی کانال: ${missingChannels[0].id}`;
                    }

                    return sendFn(chatId, `⚠️ تایید عضویت شما در ${platform === 'bale' ? 'بله' : 'تلگرام'} ناموفق بود.\n\nلطفاً ابتدا در کانال عضو شده و حدود ۱۰ ثانیه صبر کنید، سپس مجدداً دکمه تایید را بزنید.${debugInfo}`, {
                        reply_markup: { inline_keyboard: btns }
                    });
                } else {
                    // Success! 
                    await sendFn(chatId, "✅ عضویت شما تایید شد. خوش آمدید!");
                    return handleMessage(platform, chatId, '/start', sendFn, sendPhotoFn, sendDocFn, checkMembershipFn);
                }
            }
        }
        return;
    }

    // --- REGISTRATION BUTTONS ---
    if (data === 'GUEST_START_REG') {
        if (!sessions[chatId]) sessions[chatId] = { state: 'IDLE', data: {} };
        sessions[chatId].state = 'GUEST_REG_NAME';
        return sendFn(chatId, "👤 لطفاً نام و نام خانوادگی خود را وارد کنید (اختیاری):", {
            reply_markup: { inline_keyboard: [[{ text: '⏩ رد کردن', callback_data: 'SKIP_REG_NAME' }]] }
        });
    }
    if (data === 'SKIP_REG_NAME') {
        if (!sessions[chatId]) sessions[chatId] = { state: 'IDLE', data: {} };
        sessions[chatId].state = 'GUEST_REG_MOBILE';
        return sendFn(chatId, "📱 لطفاً شماره موبایل خود را وارد کنید (اختیاری):", {
            reply_markup: { inline_keyboard: [[{ text: '⏩ رد کردن', callback_data: 'SKIP_REG_MOBILE' }, { text: '⏹️ توقف ثبت‌نام', callback_data: 'SKIP_REG_BIRTHDAY' }]] }
        });
    }
    if (data === 'SKIP_REG_MOBILE') {
        if (!sessions[chatId]) sessions[chatId] = { state: 'IDLE', data: {} };
        sessions[chatId].state = 'GUEST_REG_BIRTHDAY';
        return sendFn(chatId, "🎂 لطفاً تاریخ تولد خود را وارد کنید (مثال: 1370/05/12) (اختیاری):", {
            reply_markup: { inline_keyboard: [[{ text: '⏩ رد کردن', callback_data: 'SKIP_REG_BIRTHDAY' }, { text: '⏹️ توقف ثبت‌نام', callback_data: 'SKIP_REG_BIRTHDAY' }]] }
        });
    }
    if (data === 'SKIP_REG_BIRTHDAY') {
        if (!sessions[chatId]) sessions[chatId] = { state: 'IDLE', data: {} };
        sessions[chatId].state = 'IDLE';
        return sendFn(chatId, "✅ ثبت‌نام متوقف شد. خوش آمدید!", {
            reply_markup: { inline_keyboard: [[{ text: '🏠 منوی اصلی', callback_data: 'GUEST_MAIN' }]] }
        });
    }

    // Allow Guest callbacks even for registered users (Admin access to customer menus)
    if (data.startsWith('GUEST_') || data.startsWith('SALES_GROUP_') || data.startsWith('SALES_SUB')) {
        if (data === 'GUEST_MAIN') {
            session.state = 'IDLE';
            const guestMenu = [
                [{ text: '📦 لیست محصولات و قیمت', callback_data: 'GUEST_PRODUCTS' }],
                [{ text: '🛒 ثبت سفارش خرید', callback_data: 'GUEST_ORDER' }],
                [{ text: '🎫 ثبت تیکت / ارتباط با پشتیبانی', callback_data: 'GUEST_CONTACT_FLOW' }],
                [{ text: '💰 استعلام مانده حساب من', callback_data: 'GUEST_BALANCE_REQUEST' }],
                [{ text: '🔍 پیگیری تیکت یا سفارش', callback_data: 'GUEST_TRACK' }],
                [{ text: '🏢 اطلاعات شرکت و حساب‌ها', callback_data: 'GUEST_COMPANY_INFO' }]
            ];
            
            if (settings.botStoreLinks && settings.botStoreLinks.length > 0) {
                settings.botStoreLinks.forEach(link => {
                    guestMenu.push([{ text: `🌐 ${link.title}`, url: link.url }]);
                });
            }

            return sendFn(userId, `لطفاً یکی از گزینه‌های زیر را انتخاب کنید:`, {
                reply_markup: {
                    inline_keyboard: guestMenu
                }
            });
        }

        if (data === 'GUEST_BALANCE_REQUEST') {
            let code = null;
            let source = 'direct';
            const mapped = (db.customerChatCodes || []).find(c => c.chatId === String(userId) && c.platform === platform);
            if (mapped) {
                code = mapped.accountCode;
            } else {
                // Try searching in settings.salesContacts
                const salesContacts = (db.settings && db.settings.salesContacts) || [];
                // Find contact by platform ID match
                let matchedContact = salesContacts.find(c => 
                    (platform === 'telegram' && c.telegramId && String(c.telegramId).replace('@','').toLowerCase() === String(userId).toLowerCase()) ||
                    (platform === 'bale' && c.baleId && String(c.baleId).replace('@','').toLowerCase() === String(userId).toLowerCase())
                );
                
                // If not found, look at botSubscribers to get their phone number, then match with salesContacts
                if (!matchedContact) {
                    const sub = (db.botSubscribers || []).find(s => s.chatId === String(userId) && s.platform === platform);
                    if (sub && sub.mobile) {
                        const cleanedSubMobile = String(sub.mobile).replace(/\D/g, '').slice(-10);
                        matchedContact = salesContacts.find(c => {
                            const cleanedCMobile = String(c.mobile).replace(/\D/g, '').slice(-10);
                            return cleanedCMobile && cleanedCMobile === cleanedSubMobile;
                        });
                    }
                }
                
                if (matchedContact && matchedContact.accountCode) {
                    code = matchedContact.accountCode;
                    source = 'crm';
                    
                    // Automatically persist the mapped code into customerChatCodes to make it faster next time!
                    if (!db.customerChatCodes) db.customerChatCodes = [];
                    db.customerChatCodes.push({
                        chatId: String(userId),
                        platform: platform,
                        accountCode: code,
                        updatedAt: Date.now()
                    });
                    saveDb(db);
                }
            }

            if (code) {
                const rawList = await getCustomerBalancesData(db);
                const rec = rawList.find(b => matchAccountCode(b.accountCode, code));
                
                // Fetch statements for this accountCode
                const statements = db.customerStatements || [];
                const matchedStatements = statements.filter(s => matchAccountCode(s.accountCode, code));
                
                const inline_keyboard = [];
                if (matchedStatements.length > 0) {
                    // Button to receive the latest statement file!
                    inline_keyboard.push([{ text: '📄 دریافت آخرین صورتحساب پیوست مالی', callback_data: `GUEST_STMT_${code}` }]);
                }
                inline_keyboard.push([{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]);

                if (rec) {
                    const balanceStr = Number(rec.balance).toLocaleString('fa-IR');
                    
                    const displayTime = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }).format(new Date(rec.updatedAt || Date.now()));

                    const msg = `👤 *مشتری گرامی:* ${rec.name}\n🔢 کد حسابداری: \`${rec.accountCode}\`\n\n💰 *مانده حساب شما (آنلاین سایان):* ${balanceStr} ریال (${rec.type})\n📅 زمان استعلام زنده: ${displayTime}\n\n💬 در صورت هرگونه مغایرت، لطفاً به پشتیبانی یا واحد مالی اطلاع دهید.`;
                    return sendFn(userId, msg, { reply_markup: { inline_keyboard } });
                } else {
                    // Try to query Sayan directly for this specific customer in case they have zero balance
                    let name = 'مشتری سایان';
                    let balanceStr = '۰';
                    let type = 'تسویه شده';
                    let foundAny = false;
                    if (db.settings?.sayanApiUrl) {
                        try {
                            const sql = `
                                SELECT 
                                    t07.Field_005 as accountCode,
                                    t07.Field_006 as name,
                                    SUM(CAST(t24.Field_006 AS FLOAT)) - SUM(CAST(t24.Field_007 AS FLOAT)) as balance
                                FROM ACT_TBL_024 t24
                                INNER JOIN ACT_TBL_007 t07 ON t24.Field_010 LIKE '%' + RTRIM(LTRIM(t07.Field_003)) + '%'
                                WHERE (t07.Field_005 = '${code}' OR t07.Field_003 = '${code}' OR t07.Field_005 LIKE '%${code}' OR t07.Field_003 LIKE '%${code}')
                                  AND (t24.Field_010 LIKE '11%' OR t24.Field_010 LIKE '%-11%' OR t24.Field_010 LIKE '31%' OR t24.Field_010 LIKE '%-31%') 
                                  AND t24.Field_010 NOT LIKE '%-12%'
                                  AND t24.Field_010 NOT LIKE '%-13%'
                                  AND t24.Field_005 NOT IN ('102', '103', '107', '109', '114', '116', '117')
                                  AND t24.Field_003 <> '9'
                                GROUP BY t07.Field_005, t07.Field_006
                            `;
                            const res = await runSayanQuery(db, sql);
                            if (res && res.length > 0) {
                                name = res[0].name || name;
                                const bal = Number(res[0].balance || 0);
                                balanceStr = Math.abs(bal).toLocaleString('fa-IR');
                                type = bal > 0 ? 'بدهکار' : (bal < 0 ? 'بستانکار' : 'تسویه شده');
                                foundAny = true;
                            }
                        } catch (err) {
                            console.error(err);
                        }
                    }
                    if (foundAny) {
                        const displayTime = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' }).format(new Date());
                        const msg = `👤 *مشتری گرامی:* ${name}\n🔢 کد حسابداری: \`${code}\`\n\n💰 *مانده حساب شما (آنلاین سایان):* ${balanceStr} ریال (${type})\n📅 زمان استعلام زنده: ${displayTime}\n\n💬 در صورت هرگونه مغایرت، لطفاً به پشتیبانی یا واحد مالی اطلاع دهید.`;
                        return sendFn(userId, msg, { reply_markup: { inline_keyboard } });
                    } else {
                        const msg = `⚠️ *توجه!*\nکد حسابداری شما \`${code}\` است، اما رکوردی با این کد در سرور حسابداری سایان یافت نشد.\n\n💬 لطفا به پشتیبانی پیام دهید تا موضوع بررسی شود.`;
                        return sendFn(userId, msg, { reply_markup: { inline_keyboard } });
                    }
                }
            } else {
                session.state = 'GUEST_SUBMIT_ACCOUNT_CODE';
                const msg = `⚠️ *توجه!*\nشما هنوز کد حسابداری خود را ثبت نکرده‌اید.\n\n💬 لطفا ابتدا به پشتیبانی ما پیام دهید و *«کد حسابداری»* خود را دریافت نمایید.\n\nپس از دریافت، کد حسابداری اختصاصی خود را (تنها به صورت عدد انگلیسی یا کاراکتر کد) در پاسخ به این پیام ارسال نمایید تا پیوند حساب شما برقرار شود.`;
                return sendFn(userId, msg, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]] } });
            }
        }

        if (data.startsWith('GUEST_STMT_')) {
            const code = data.replace('GUEST_STMT_', '');
            const statements = db.customerStatements || [];
            // Sort by uploadedAt desc to get the latest
            const matched = statements
                .filter(s => s.accountCode === code)
                .sort((a, b) => b.uploadedAt - a.uploadedAt);
                
            if (matched.length > 0) {
                const stmt = matched[0];
                try {
                    await sendFn(userId, `🔄 در حال دریافت آخرین صورتحساب پیوست مالی شما با شناسه \`${stmt.id}\`... منتظر بمانید.`);
                    const fileBuffer = Buffer.from(stmt.fileData, 'base64');
                    await sendDocFn(chatId, fileBuffer, stmt.fileName, `📄 صورتحساب تفصیلی تفکیک شده حسابداری: ${stmt.fileName}`);
                    return;
                } catch (e) {
                    console.error("Statement sendDocFn error: ", e);
                    return sendFn(userId, `❌ خطایی در ارسال فایل صورتحساب رخ داد. لطفاً با پشتیبانی تماس بگیرید.`);
                }
            } else {
                return sendFn(userId, `⚠️ صورتحساب بارگذاری‌شده‌ای برای کد حسابداری شما یافت نشد.`);
            }
        }

        if (data === 'GUEST_PRODUCTS') {
            const products = db.products || [];
            if (products.length === 0) {
                return sendFn(userId, "لیست محصولات در حال حاضر خالی است.", {
                    reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]] }
                });
            }
            
            const groups = [...new Set(products.map(p => p.group || 'بدون گروه'))].sort();
            const buttons = groups.map(g => [{ text: `📁 ${g}`, callback_data: `SALES_GROUP_${g}` }]);
            buttons.push([{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]);
            
            return sendFn(userId, "🔖 انتخاب گروه کالا:", { reply_markup: { inline_keyboard: buttons } });
        }

        if (data.startsWith('SALES_GROUP_')) {
            const group = data.replace('SALES_GROUP_', '');
            const products = (db.products || []).filter(p => (p.group || 'بدون گروه') === group);
            const subgroups = [...new Set(products.map(p => p.subgroup || 'سایر'))].sort();
            
            const buttons = subgroups.map(sg => [
                { text: `🔹 ${sg}`, callback_data: `SALES_SUB|${group}|${sg}` }
            ]);
            const backBtn = (session.state || '').startsWith('GUEST_ORDER') ? 'GUEST_ORDER' : 'GUEST_PRODUCTS';
            buttons.push([{ text: '🔙 بازگشت', callback_data: backBtn }]);
            
            return sendFn(userId, `📁 *گروه: ${group}*\nلطفاً زیرگروه را انتخاب کنید:`, { reply_markup: { inline_keyboard: buttons } });
        }

        if (data.startsWith('SALES_SUB|')) {
            const parts = data.split('|');
            const group = parts[1];
            const subgroup = parts[2];
            const products = (db.products || []).filter(p => (p.group || 'بدون گروه') === group && (p.subgroup || 'سایر') === subgroup);
            
            if (session.state === 'GUEST_ORDER_SELECT_PRODUCT') {
                 const buttons = products.map(p => [{ text: `🛒 انتخاب ${p.name}`, callback_data: `GUEST_ORDER_PICK_${p.id}` }]);
                 buttons.push([{ text: '🔙 بازگشت', callback_data: `SALES_GROUP_${group}` }]);
                 return sendFn(userId, `🛍️ انتخاب کالا از ${subgroup}:`, { reply_markup: { inline_keyboard: buttons } });
            }

            let res = `📁 ${group} > 🔹 ${subgroup}\n\n`;
            products.forEach(p => {
                res += formatProduct(p) + "------------------\n";
            });
            
            return sendFn(userId, res, { reply_markup: { inline_keyboard: [[{ text: '🔙 انتخاب زیرگروه دیگر', callback_data: `SALES_GROUP_${group}` }], [{ text: '🔙 منوی اصلی', callback_data: 'GUEST_MAIN' }]] } });
        }

        if (data === 'GUEST_ORDER') {
            const products = db.products || [];
            if (products.length === 0) return sendFn(userId, "لیست محصولات خالی است.");
            
            session.state = 'GUEST_ORDER_SELECT_PRODUCT';
            const groups = [...new Set(products.map(p => p.group || 'بدون گروه'))].sort();
            const buttons = groups.map(g => [{ text: `📁 ${g}`, callback_data: `SALES_GROUP_${g}` }]);
            buttons.push([{ text: '🔙 انصراف', callback_data: 'GUEST_MAIN' }]);
            
            return sendFn(userId, "🛒 مرحله ۱: انتخاب محصول\nلطفاً گروه محصول مورد نظر خود را انتخاب کنید:", { reply_markup: { inline_keyboard: buttons } });
        }

        if (data.startsWith('GUEST_ORDER_PICK_')) {
            const pid = data.replace('GUEST_ORDER_PICK_', '');
            const product = (db.products || []).find(p => p.id === pid);
            if (!product) return sendFn(userId, "❌ کالا یافت نشد.");
            
            session.data.selectedProduct = product;
            session.state = 'GUEST_WAIT_ORDER_DESC';
            return sendFn(userId, `🛍️ محصول انتخاب شده: *${product.name}*\n\n📝 مرحله ۲: توضیحات\nلطفاً نام، شماره تماس و هرگونه توضیحات تکمیلی (تعداد، رنگ، و ...) را ارسال کنید:`, {
                reply_markup: { inline_keyboard: [[{ text: '🔙 تغییر محصول', callback_data: 'GUEST_ORDER' }]] }
            });
        }

        if (data === 'GUEST_CONTACT_FLOW') {
            const defaultMsg = "💬 شما در حال ارتباط با بخش پشتیبانی هستید.\n\nبرای ثبت تیکت جدید و دریافت کد پیگیری، روی دکمه زیر کلیک کنید:";
            const contactMsg = settings.salesContactMessage || "برای تماس مستقیم با شماره‌های زیر در ارتباط باشید...";
            
            return sendFn(userId, `${contactMsg}\n\n${defaultMsg}`, {
                reply_markup: { inline_keyboard: [[{ text: '📝 ثبت تیکت جدید', callback_data: 'GUEST_CONTACT' }], [{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]] }
            });
        }

        if (data === 'GUEST_CONTACT') {
            session.state = 'GUEST_WAIT_CONTACT_MSG';
            const defaultMsg = "لطفاً پیام خود را شرح دهید (در صورت نیاز فایل یا عکس نیز می‌توانید ارسال کنید):";
            return sendFn(userId, defaultMsg, {
                reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف', callback_data: 'GUEST_MAIN' }]] }
            });
        }
        
        if (data === 'GUEST_TRACK') {
            session.state = 'GUEST_WAIT_TRACK_CODE';
            return sendFn(userId, "🔍 لطفاً کد پیگیری درخواست خود را وارد کنید:", {
                reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]] }
            });
        }

        if (data.startsWith('GUEST_TICKET_REPLY_')) {
            const ticketId = data.replace('GUEST_TICKET_REPLY_', '');
            session.state = 'GUEST_WAIT_TICKET_REPLY';
            session.data.ticketId = ticketId;
            return sendFn(userId, "📩 لطفاً پاسخ خود را بنویسید:");
        }

        if (data === 'GUEST_COMPANY_INFO') {
            const companies = settings.companies || [];
            const customItems = settings.knowledgeBaseItems || [];
            
            // If admin enabled guest access or no specific host info, show the list
            if (settings.botAllowGuestKnowledgeBase || (companies.length > 0 && !settings.companyAddress && !settings.companyPhone)) {
                const btns = [];
                companies.slice(0, 10).forEach(c => {
                    btns.push([{ text: `🏢 ${c.name}`, callback_data: `GUEST_KNOWLEDGE_CO_${c.id}` }]);
                });
                customItems.slice(0, 5).forEach(c => {
                    btns.push([{ text: `📄 ${c.title}`, callback_data: `GUEST_KNOWLEDGE_CUST_${c.id}` }]);
                });
                btns.push([{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]);
                
                return sendFn(userId, "🏢 اطلاعات شرکت‌ها و حساب‌ها\nلطفاً مورد مورد نظر را انتخاب کنید:", { reply_markup: { inline_keyboard: btns } });
            }

            const parts = [];
            if (settings.botCompanyInfo) parts.push(`ℹ️ *درباره ما:*\n${settings.botCompanyInfo}`);
            if (settings.companyAddress) parts.push(`📍 *آدرس:*\n${settings.companyAddress}`);
            if (settings.companyPhone) parts.push(`📞 *شماره تماس:*\n${settings.companyPhone}`);
            if (settings.companyBank) parts.push(`💳 *اطلاعات حساب:*\n${settings.companyBank}`);
            
            const info = parts.length > 0 ? parts.join('\n\n') : "🏢 اطلاعات شرکت هنوز تنظیم نشده است.";
            return sendFn(userId, info, {
                reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]] }
            });
        }

        if (data.startsWith('GUEST_KNOWLEDGE_CO_')) {
            const id = data.replace('GUEST_KNOWLEDGE_CO_', '');
            const company = (settings.companies || []).find(c => c.id === id);
            if (!company) return sendFn(userId, "❌ یافت نشد.");
            
            let text = `🏢 *مشخصات ${company.name}*\n\n`;
            if (company.nationalId) text += `▫️ شناسه ملی: \`${company.nationalId}\`\n`;
            if (company.phone) text += `▫️ تلفن: \`${company.phone}\`\n`;
            if (company.address) text += `▫️ آدرس: ${company.address}\n`;
            
            const btns = [];
            if (company.banks && company.banks.length > 0) {
                text += `\n*حساب‌های بانکی:*`;
                company.banks.forEach((b, idx) => {
                    btns.push([{ text: `🏦 ${b.bankName} (${b.accountNumber.slice(-4)})`, callback_data: `GUEST_KNOW_BANK_${company.id}:${b.id || idx}` }]);
                });
            }
            btns.push([{ text: '🔙 بازگشت', callback_data: 'GUEST_COMPANY_INFO' }]);
            return sendFn(userId, text, { reply_markup: { inline_keyboard: btns } });
        }

        if (data.startsWith('GUEST_KNOW_BANK_')) {
            const rawPayload = data.replace('GUEST_KNOW_BANK_', '');
            const companies = settings.companies || [];
            
            let company = null;
            let bank = null;
            let bankKey = '';

            if (rawPayload.includes(':')) {
                const colonIdx = rawPayload.indexOf(':');
                const companyId = rawPayload.substring(0, colonIdx);
                bankKey = rawPayload.substring(colonIdx + 1);
                company = companies.find(c => c.id === companyId);
            } else {
                for (const c of companies) {
                    if (rawPayload.startsWith(c.id + '_') || rawPayload === c.id) {
                        company = c;
                        bankKey = rawPayload.substring(c.id.length + 1);
                        break;
                    }
                }
                if (!company) {
                    const parts = rawPayload.split('_');
                    company = companies.find(c => c.id === parts[0]);
                    bankKey = parts.slice(1).join('_');
                }
            }

            if (company) {
                bank = (company.banks || []).find((b, idx) => 
                    b.id === bankKey || 
                    String(idx) === bankKey || 
                    (b.accountNumber && b.accountNumber === bankKey)
                );
            }

            if (!company || !bank) return sendFn(userId, "❌ اطلاعات حساب بانکی مورد نظر یافت نشد.");
            
            let text = `💳 *اطلاعات حساب بانکی*\n\n`;
            text += `👤 صاحب حساب: *${company.name}*\n`;
            text += `🏦 بانک: *${bank.bankName}*\n\n`;
            text += `🔸 *شماره حساب:*\n\`${bank.accountNumber}\`\n`;
            if (bank.cardNumber) text += `\n🔸 *شماره کارت:*\n\`${bank.cardNumber}\`\n`;
            if (bank.sheba) text += `\n🔸 *شماره شبا:*\n\`IR${bank.sheba.replace(/^IR/i, '')}\`\n`;
            
            text += `\n💡 _جهت کپی هر شماره، روی آن کلیک کنید._`;
            
            return sendFn(userId, text, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت به لیست حساب‌ها', callback_data: `GUEST_KNOWLEDGE_CO_${company.id}` }]] } });
        }

        if (data.startsWith('GUEST_KNOWLEDGE_CUST_')) {
            const id = data.replace('GUEST_KNOWLEDGE_CUST_', '');
            const item = (settings.knowledgeBaseItems || []).find(c => c.id === id);
            if (!item) return sendFn(userId, "❌ یافت نشد.");
            return sendFn(userId, `📌 *${item.title}*\n\n${item.content}`, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'GUEST_COMPANY_INFO' }]] } });
        }
        
        if (data === 'GUEST_SHOW_ID') {
             return sendFn(userId, `🆔 شناسه چت شما: \`${userId}\``, {
                reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]] }
            });
        }

        return;
    }

    if (!user) {
        if (isGroup) return; // Silent in groups
        return sendFn(userId, `⛔ امکان انجام این عملیات وجود ندارد. شناسه شما (\`${userId}\`) ثبت نشده است.`);
    }

    // --- NAVIGATION ---
    if (data.startsWith('MENU_') || data === 'SALES_FIN_REPORTS' || data === 'SAYAN_REPORTS_MENU') {
        if (isGroup) return; // Silent in groups
        session.state = 'IDLE';
        if (data === 'MENU_MAIN') return sendFn(chatId, "🏠 منوی اصلی:", { reply_markup: KEYBOARDS.MAIN });
        if (data === 'MENU_PAY' || data === 'MENU_PAYMENT') return sendFn(chatId, "💰 مدیریت پرداخت:", { reply_markup: KEYBOARDS.PAYMENT });
        if (data === 'MENU_EXIT') return sendFn(chatId, "🚛 مدیریت خروج:", { reply_markup: KEYBOARDS.EXIT });
        if (data === 'MENU_WH') return sendFn(chatId, "📦 مدیریت انبار:", { reply_markup: KEYBOARDS.WAREHOUSE });
        if (data === 'MENU_TRADE') return sendFn(chatId, "🌍 مدیریت بازرگانی:", { reply_markup: KEYBOARDS.TRADE });
        if (data === 'MENU_SEC') {
            const isSecAdmin = user && (user.role === 'admin' || user.role === 'ceo' || user.canManageSecretariatSettings);
            const hasSecAccess = user && (isSecAdmin || user.canAccessSecretariat);
            if (!hasSecAccess) {
                return sendFn(chatId, "⛔ شما به دبیرخانه اداری دسترسی ندارید. لطفا با مدیر سیستم تماس بگیرید.");
            }
            return sendFn(chatId, "📂 دبیرخانه اداری:\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:", { reply_markup: KEYBOARDS.SECRETARIAT });
        }
        
        if (data === 'MENU_SALES') {
            session.lastFinMenu = 'MENU_SALES';
            return sendFn(chatId, "🛒 مدیریت فروش:", { reply_markup: KEYBOARDS.SALES });
        }
        
        if (data === 'MENU_REPORTS') {
            session.lastFinMenu = 'MENU_REPORTS';
            return sendFn(chatId, "📊 گزارشات مدیریتی:", { reply_markup: KEYBOARDS.REPORTS });
        }

        if (data === 'SAYAN_REPORTS_MENU' || data === 'SALES_FIN_REPORTS') {
            if (!hasSayanReportsAccess(user)) {
                return sendFn(chatId, "❌ شما دسترسی لازم جهت دریافت گزارشات مالی و ERP سایان را ندارید.");
            }
            session.lastFinMenu = 'SAYAN_REPORTS_MENU';
            const userKb = getSayanReportsKeyboard(user);
            return sendFn(chatId, "🏢 *گزارشات و اطلاعات مالی ERP سایان*\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:", { reply_markup: userKb });
        }
    }

    // --- PDF MERGER CALLBACK ACTIONS ---
    if (data === 'ACT_MERGE_PDF_START') {
        session.state = 'MERGE_PDF_COLLECTING';
        session.data.mergeFiles = [];
        const guideText = 
            `📑 *ابزار تبدیل و ادغام تصاویر و فایل‌های PDF به یک فایل PDF واحد*\n\n` +
            `🔹 لطفاً عکس‌ها (JPG, PNG, WebP) و فایل‌های PDF مورد نظرتان را یکی پس از دیگری به این چت ارسال نمایید.\n` +
            `🔹 هر تصویر به عنوان یک صفحه استاندارد و هر فایل PDF با تمام صفحاتش به همان ترتیبی که ارسال می‌کنید در خروجی قرار می‌گیرند.\n` +
            `🔹 پس از ارسال فایل‌ها، دکمه «🏁 ساخت فایل PDF نهایی» را لمس کنید.\n\n` +
            `📥 _در انتظار دریافت فایل‌ها... (تعداد فعلی: ۰)_`;
        
        return sendFn(chatId, guideText, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏁 ساخت فایل PDF نهایی (۰ فایل)', callback_data: 'ACT_MERGE_PDF_FINISH' }],
                    [{ text: '🗑️ پاک کردن صف', callback_data: 'ACT_MERGE_PDF_CLEAR' }],
                    [{ text: '🔙 انصراف و منوی اصلی', callback_data: 'MENU_MAIN' }]
                ]
            }
        });
    }

    if (data === 'ACT_MERGE_PDF_CLEAR') {
        session.data.mergeFiles = [];
        return sendFn(chatId, "🗑️ صف فایل‌ها با موفقیت خالی شد (۰ فایل).\nاکنون می‌توانید عکس‌ها یا فایل‌های PDF جدید را ارسال کنید:", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏁 ساخت فایل PDF نهایی (۰ فایل)', callback_data: 'ACT_MERGE_PDF_FINISH' }],
                    [{ text: '🔙 منوی اصلی', callback_data: 'MENU_MAIN' }]
                ]
            }
        });
    }

    if (data === 'ACT_MERGE_PDF_FINISH') {
        const fileList = session.data.mergeFiles || [];
        if (fileList.length === 0) {
            return sendFn(chatId, "⚠️ هنوز هیچ فایل یا تصویری ارسال نکرده‌اید!\nلطفاً ابتدا عکس‌ها یا فایل‌های PDF خود را به چت بفرستید.", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 منوی اصلی', callback_data: 'MENU_MAIN' }]
                    ]
                }
            });
        }

        try {
            await sendFn(chatId, `⏳ در حال پردازش و ادغام ${fileList.length} فایل ارسالی به یک فایل PDF باکیفیت... لطفاً چند لحظه صبر کنید.`);
            const mergedBuffer = await mergeFilesToPdf(fileList);
            const fileName = `Merged_Document_${Date.now()}.pdf`;
            
            await sendDocFn(chatId, mergedBuffer, fileName, `✅ *فایل PDF تجمیعی با موفقیت تولید شد.*\n📄 تعداد کل اسناد و تصاویر ادغام شده: *${fileList.length} مورد*`);
            
            session.data.mergeFiles = [];
            session.state = 'IDLE';
            return sendFn(chatId, "🎉 عملیات ادغام با موفقیت انجام شد. منوی اصلی:", {
                reply_markup: KEYBOARDS.MAIN
            });
        } catch (mergeErr) {
            console.error("[Bot Merge PDF Error]:", mergeErr);
            return sendFn(chatId, `❌ خطا در تولید فایل PDF: ${mergeErr.message || 'خطای ناشناخته'}\nلطفاً از سلامت فایل‌های ارسالی اطمینان حاصل نمایید.`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 تلاش مجدد', callback_data: 'ACT_MERGE_PDF_FINISH' }],
                        [{ text: '🗑️ پاک کردن صف', callback_data: 'ACT_MERGE_PDF_CLEAR' }],
                        [{ text: '🔙 منوی اصلی', callback_data: 'MENU_MAIN' }]
                    ]
                }
            });
        }
    }

    if (data === 'ACT_MERGE_PDF_ADD_RECENT') {
        if (session.data.recentFile) {
            session.state = 'MERGE_PDF_COLLECTING';
            session.data.mergeFiles = session.data.mergeFiles || [];
            session.data.mergeFiles.push(session.data.recentFile);
            delete session.data.recentFile;
            
            const count = session.data.mergeFiles.length;
            return sendFn(chatId, `✅ فایل به صف ادغام اضافه شد.\n\n📊 تعداد کل فایل‌ها در صف: *${count} عدد*\n\nمی‌توانید فایل‌های بعدی را بفرستید یا دکمه ساخت PDF نهایی را بزنید:`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `🏁 ساخت فایل PDF نهایی (${count} فایل)`, callback_data: 'ACT_MERGE_PDF_FINISH' }],
                        [{ text: '🗑️ پاک کردن صف', callback_data: 'ACT_MERGE_PDF_CLEAR' }],
                        [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'MENU_MAIN' }]
                    ]
                }
            });
        }
    }

    // Sales logic
    if (data === 'ACT_SEND_CO_INFO') {
        const keyboard = [
            [{ text: '📢 ارسال همه موارد', callback_data: 'SEND_INFO_ALL' }],
            [{ text: '📍 آدرس و تلفن', callback_data: 'SEND_INFO_ADDR' }],
            [{ text: '💳 اطلاعات بانکی', callback_data: 'SEND_INFO_BANK' }],
            [{ text: '🏢 درباره شرکت', callback_data: 'SEND_INFO_ABOUT' }],
            [{ text: '🔙 بازگشت', callback_data: 'MENU_SALES' }]
        ];
        return sendFn(chatId, "🏢 کدام اطلاعات را مایلید ارسال کنید؟", { reply_markup: { inline_keyboard: keyboard } });
    }

    if (data === 'SALES_BAL_DOWNLOAD_DEBTORS' || data === 'SALES_BAL_DOWNLOAD_CREDITORS') {
        const isDebtors = data === 'SALES_BAL_DOWNLOAD_DEBTORS';
        const rawList = await getCustomerBalancesData(db);
        const filtered = rawList
            .filter(b => isDebtors ? b.type === 'بدهکار' : b.type === 'بستانکار')
            .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
        
        if (filtered.length === 0) {
            return sendFn(chatId, `⚠️ هیچ رکوردی برای لیست ${isDebtors ? "بدهکاران" : "بستانکاران"} یافت نشد.`, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'SALES_CUSTOMER_BALANCES' }]] } });
        }
        
        sendFn(chatId, "⏳ در حال تولید فایل گزارش PDF... لطفاً منتظر بمانید.");
        
        const title = `گزارش مشتریان ${isDebtors ? "بدهکار" : "بستانکار"}`;
        const columns = ['کد حسابداری', 'نام مشتری', 'مانده حساب (ریال)', 'نوع'];
        const rows = filtered.map(b => [
            b.accountCode || '',
            b.name || '',
            Number(b.balance || 0).toLocaleString('fa-IR'),
            b.type || (Number(b.balance || 0) > 0 ? 'بدهکار' : 'بستانکار')
        ]);
        
        try {
            const pdfBuffer = await Renderer.generateReportPDF(title, columns, rows);
            const filename = `Report_${isDebtors ? 'Debtors' : 'Creditors'}_${Date.now()}.pdf`;
            await sendDocFn(chatId, pdfBuffer, filename, `📄 ${title}\nتعداد مشتریان: ${filtered.length}\n📅 تاریخ گزارش: ${toShamsiFull(new Date())}`);
        } catch (err) {
            console.error(err);
            sendFn(chatId, "❌ متاسفانه در تولید فایل گزارش خطایی رخ داد.");
        }
        return;
        }

    if (data.startsWith('SEC_GET_PDF_') || data.startsWith('SEC_GET_DOC_')) {
        const isPdf = data.startsWith('SEC_GET_PDF_');
            const letterId = data.replace(isPdf ? 'SEC_GET_PDF_' : 'SEC_GET_DOC_', '');
            const letters = db.secretariatLetters || [];
            const letter = letters.find(l => l.id === letterId);
            
            if (!letter) return sendFn(chatId, "❌ نامه یافت نشد.");
            if (!userHasLetterAccess(user, letter, db)) {
                return sendFn(chatId, "⛔ شما به این نامه دسترسی ندارید.");
            }
            
            await sendFn(chatId, `⏳ در حال تولید فایل ${isPdf ? 'PDF' : 'Word'} نامه...`);
            try {
                const company = (settings.companies || []).find(c => c.id === letter.companyId);
                const companyName = company ? company.name : '';
                const companySettings = (db.secretariatSettings || []).find(s => s.companyId === letter.companyId);
                
                if (isPdf) {
                    const buf = await Renderer.generateSecretariatLetterPDF(letter, companyName, companySettings);
                    const filename = `Letter_${letter.letterNumber.replace(/[\/\\]/g, '_')}.pdf`;
                    await sendDocFn(chatId, buf, filename, `📄 فایل PDF رسمی نامه شماره ${letter.letterNumber}`);
                } else {
                    const buf = await Renderer.generateSecretariatLetterDoc(letter, companyName, companySettings);
                    const filename = `Letter_${letter.letterNumber.replace(/[\/\\]/g, '_')}.doc`;
                    await sendDocFn(chatId, buf, filename, `📝 فایل Word رسمی نامه شماره ${letter.letterNumber}`);
                }
            } catch (e) {
                console.error("Bot export letter error:", e);
                await sendFn(chatId, "❌ خطا در تولید یا ارسال فایل نامه اداری.");
            }
            return;
        }

        if (data.startsWith('SEC_APPROVE_')) {
            const letterId = data.replace('SEC_APPROVE_', '');
            const letters = db.secretariatLetters || [];
            const letterIdx = letters.findIndex(l => l.id === letterId);
            
            if (letterIdx === -1) return sendFn(chatId, "❌ نامه یافت نشد.");
            const letter = letters[letterIdx];
            
            if (!(letter.referredTo || []).includes(user.id)) {
                return sendFn(chatId, "⛔ این نامه به شما ارجاع داده نشده است.");
            }
            
            if ((letter.approvedBy || []).includes(user.id)) {
                return sendFn(chatId, "⚠️ شما قبلاً این نامه را تایید کرده‌اید.");
            }
            
            if (!user.signatureUrl) {
                return sendFn(chatId, "⚠️ تصویر امضای واقعی شما در پروفایلتان بارگذاری نشده است. لطفاً ابتدا از منوی کاربران در پنل وب نسبت به آپلود امضا اقدام کنید.");
            }
            
            const currentApprovers = letter.approvedBy || [];
            const currentSignatures = letter.signatureImageUrls || [];
            
            letter.approvedBy = [...currentApprovers, user.id];
            letter.signatureImageUrls = [...currentSignatures, user.signatureUrl];
            letter.status = 'APPROVED';
            letter.updatedAt = Date.now();
            
            saveDb(db);
            await sendFn(chatId, `✅ نامه شماره ${letter.letterNumber} با موفقیت توسط امضای واقعی شما تایید و امضا شد.`);
            
            // Notify creator!
            const creator = db.users.find(u => u.fullName === letter.createdBy);
            if (creator) {
                const notifyMsg = `🔔 *امضای نامه دبیرخانه*:\n` +
                                  `نامه شماره ${letter.letterNumber} با موضوع "${letter.subject}" توسط *${user.fullName}* تایید و امضا شد.`;
                                  
                const baleModule = await import('./bale.js');
                const tgModule = await import('./telegram.js');
                if (creator.telegramChatId) {
                    try { await tgModule.sendBotMessage(creator.telegramChatId, notifyMsg); } catch(e){}
                }
                if (creator.baleChatId) {
                    try { await baleModule.sendBotMessage(creator.baleChatId, notifyMsg); } catch(e){}
                }
            }
            return;
        }

        if (data === 'SEC_NEW_LETTER_FLOW') {
            const isSecAdmin = user && (user.role === 'admin' || user.role === 'ceo' || user.canManageSecretariatSettings);
            const hasSecAccess = user && (isSecAdmin || user.canAccessSecretariat);
            if (!hasSecAccess) {
                return sendFn(chatId, "⛔ شما دسترسی لازم برای ثبت نامه در دبیرخانه را ندارید.");
            }
            session.state = 'SEC_WAIT_FILE';
            session.data = {};
            return sendFn(chatId, "📎 لطفا فایل ضمیمه یا تصویر نامه اداری را ارسال کنید (یا در صورت عدم وجود فایل، عبارت /skip را ارسال فرمایید):", {
                reply_markup: { inline_keyboard: [[{ text: '❌ انصراف و بازگشت', callback_data: 'MENU_SEC' }]] }
            });
        }

        if (data === 'SEC_PENDING') {
            const letters = (db.secretariatLetters || []).filter(l => 
                (l.referredTo || []).includes(user.id) &&
                !(l.approvedBy || []).includes(user.id) &&
                l.status !== 'REJECTED'
            );

            if (letters.length === 0) {
                return sendFn(chatId, "✅ در حال حاضر هیچ نامه منتظر تاییدی برای شما وجود ندارد.", {
                    reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت به منوی دبیرخانه', callback_data: 'MENU_SEC' }]] }
                });
            }

            await sendFn(chatId, `📬 *تعداد ${letters.length} نامه منتظر تایید و امضای شما است:*`);
            for (const l of letters.slice(0, 5)) {
                const inline_keyboard = [
                    [
                        { text: '📥 دریافت PDF', callback_data: `SEC_GET_PDF_${l.id}` },
                        { text: '📥 دریافت Word', callback_data: `SEC_GET_DOC_${l.id}` }
                    ],
                    [
                        { text: '✍️ تایید و امضای نامه', callback_data: `SEC_APPROVE_${l.id}` }
                    ]
                ];
                const msg = `✉️ *شماره نامه:* ${l.letterNumber}\n` +
                            `🏢 تاریخ: ${l.date}\n` +
                            `👤 فرستنده: ${l.sender}\n` +
                            `👥 گیرنده: ${l.receiver}\n` +
                            `📝 موضوع: ${l.subject}`;
                await sendFn(chatId, msg, { reply_markup: { inline_keyboard } });
            }
            return;
        }

        if (data === 'SEC_CARTABLE_LATEST') {
            const letters = (db.secretariatLetters || []).filter(l => userHasLetterAccess(user, l, db)).slice(0, 5);

            if (letters.length === 0) {
                return sendFn(chatId, "📂 هیچ نامه‌ای در کارتابل شما ثبت نشده است.", {
                    reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت به منوی دبیرخانه', callback_data: 'MENU_SEC' }]] }
                });
            }

            await sendFn(chatId, `📂 *آخرین نامه‌های ثبت شده در کارتابل شما:*`);
            for (const l of letters) {
                const inline_keyboard = [
                    [
                        { text: '📥 دریافت PDF', callback_data: `SEC_GET_PDF_${l.id}` },
                        { text: '📥 دریافت Word', callback_data: `SEC_GET_DOC_${l.id}` }
                    ]
                ];
                if ((l.referredTo || []).includes(user.id) && !(l.approvedBy || []).includes(user.id)) {
                    inline_keyboard.push([{ text: '✍️ تایید و امضا', callback_data: `SEC_APPROVE_${l.id}` }]);
                }
                const msg = `✉️ *شماره نامه:* ${l.letterNumber}\n` +
                            `📅 تاریخ: ${l.date}\n` +
                            `👤 فرستنده: ${l.sender}\n` +
                            `👥 گیرنده: ${l.receiver}\n` +
                            `📝 موضوع: ${l.subject}\n` +
                            `وضعیت: ${l.status === 'APPROVED' ? '✅ تایید شده' : l.status === 'REJECTED' ? '❌ رد شده' : '⏳ در حال بررسی'}`;
                await sendFn(chatId, msg, { reply_markup: { inline_keyboard } });
            }
            return;
        }

        if (data === 'SEC_SEARCH') {
            session.state = 'SEC_WAIT_SEARCH_QUERY';
            return sendFn(chatId, "🔍 لطفا کلمه کلیدی، شماره نامه، نام فرستنده یا گیرنده مورد نظر خود را ارسال فرمایید:", {
                reply_markup: { inline_keyboard: [[{ text: '❌ انصراف', callback_data: 'MENU_SEC' }]] }
            });
        }

        if (data.startsWith('SEC_SET_CO_')) {
            const coId = data.replace('SEC_SET_CO_', '');
            session.data.companyId = coId;
            
            session.state = 'SEC_WAIT_SECTION';
            const inline_keyboard = [
                [
                    { text: '🏢 دفتر مرکزی', callback_data: 'SEC_SET_SEC_hq' },
                    { text: '🏭 کارخانه', callback_data: 'SEC_SET_SEC_fc' }
                ],
                [{ text: '❌ انصراف', callback_data: 'MENU_SEC' }]
            ];
            
            const company = (settings.companies || []).find(c => c.id === coId);
            return sendFn(chatId, `🏢 شرکت انتخاب شد: *${company ? company.name : ''}*\n\n📍 لطفا بخش مربوط به این نامه اداری را مشخص کنید:`, {
                reply_markup: { inline_keyboard }
            });
        }
        
        if (data.startsWith('SEC_SET_SEC_')) {
            const isHq = data === 'SEC_SET_SEC_hq';
            session.data.section = isHq ? 'headquarters' : 'factory';
            
            session.state = 'SEC_WAIT_SENDER';
            return sendFn(chatId, `📍 بخش انتخاب شد: *${isHq ? 'دفتر مرکزی' : 'کارخانه'}*\n\n👤 لطفا نام فرستنده نامه را ارسال کنید (مثال: شرکت پارس، یا نام شخص):`);
        }

    // Knowledge Base logic
    if (data === 'ACT_KNOWLEDGE') {
        const companies = settings.companies || [];
        const customItems = settings.knowledgeBaseItems || [];
        
        if (companies.length === 0 && customItems.length === 0) {
            return sendFn(chatId, "ℹ️ هیچ اطلاعاتی ثبت نشده است.", { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'MENU_MAIN' }]] } });
        }
        
        const btns = [];
        companies.forEach(c => {
            btns.push([{ text: `🏢 شرکت/فرد: ${c.name}`, callback_data: `KNOWLEDGE_CO_${c.id}` }]);
        });
        customItems.forEach(c => {
            btns.push([{ text: `📄 یادداشت: ${c.title}`, callback_data: `KNOWLEDGE_CUST_${c.id}` }]);
        });
        btns.push([{ text: '🔙 بازگشت', callback_data: 'MENU_MAIN' }]);
        
        return sendFn(chatId, "ℹ️ اطلاعات شرکت و حساب‌ها\nموردی را برای مشاهده انتخاب کنید:", { reply_markup: { inline_keyboard: btns } });
    }

    if (data.startsWith('KNOWLEDGE_CO_')) {
        const id = data.replace('KNOWLEDGE_CO_', '');
        const company = (settings.companies || []).find(c => c.id === id);
        if (!company) return sendFn(chatId, "❌ یافت نشد.");
        
        let text = `📌 *مشخصات ${company.name}*\n\n`;
        if (company.nationalId) text += `▫️ شناسه ملی: \`${company.nationalId}\`\n`;
        if (company.registrationNumber) text += `▫️ شماره ثبت: \`${company.registrationNumber}\`\n`;
        if (company.phone) text += `▫️ تلفن: \`${company.phone}\`\n`;
        if (company.address) text += `▫️ آدرس: ${company.address}\n`;
        
        const btns = [];
        if (company.banks && company.banks.length > 0) {
            text += `\n*برای مشاهده اطلاعات کامل هر حساب، روی دکمه‌های زیر کلیک کنید:*`;
            company.banks.forEach((b, idx) => {
                btns.push([{ text: `🏦 ${b.bankName} (${b.accountNumber.slice(-4)})`, callback_data: `KNOW_BANK_${company.id}:${b.id || idx}` }]);
            });
        } else {
            text += `\n⚠️ (حساب بانکی ثبت نشده)\n`;
        }
        
        btns.push([{ text: '🔙 بازگشت', callback_data: 'ACT_KNOWLEDGE' }]);
        return sendFn(chatId, text, { reply_markup: { inline_keyboard: btns } });
    }

    if (data.startsWith('KNOW_BANK_')) {
        const rawPayload = data.replace('KNOW_BANK_', '');
        const companies = settings.companies || [];
        
        let company = null;
        let bank = null;
        let bankKey = '';

        if (rawPayload.includes(':')) {
            const colonIdx = rawPayload.indexOf(':');
            const companyId = rawPayload.substring(0, colonIdx);
            bankKey = rawPayload.substring(colonIdx + 1);
            company = companies.find(c => c.id === companyId);
        } else {
            for (const c of companies) {
                if (rawPayload.startsWith(c.id + '_') || rawPayload === c.id) {
                    company = c;
                    bankKey = rawPayload.substring(c.id.length + 1);
                    break;
                }
            }
            if (!company) {
                const parts = rawPayload.split('_');
                company = companies.find(c => c.id === parts[0]);
                bankKey = parts.slice(1).join('_');
            }
        }

        if (company) {
            bank = (company.banks || []).find((b, idx) => 
                b.id === bankKey || 
                String(idx) === bankKey || 
                (b.accountNumber && b.accountNumber === bankKey)
            );
        }

        if (!company || !bank) return sendFn(chatId, "❌ اطلاعات حساب بانکی مورد نظر یافت نشد.");
        
        let text = `💳 *اطلاعات حساب بانکی*\n\n`;
        text += `👤 صاحب حساب: *${company.name}*\n`;
        text += `🏦 بانک: *${bank.bankName}*\n\n`;
        text += `🔸 *شماره حساب:*\n\`${bank.accountNumber}\`\n`;
        if (bank.cardNumber) text += `\n🔸 *شماره کارت:*\n\`${bank.cardNumber}\`\n`;
        if (bank.sheba) text += `\n🔸 *شماره شبا:*\n\`IR${bank.sheba.replace(/^IR/i, '')}\`\n`;
        
        text += `\n💡 _جهت کپی هر شماره، روی آن کلیک کنید._`;
        
        return sendFn(chatId, text, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت به لیست حساب‌ها', callback_data: `KNOWLEDGE_CO_${company.id}` }]] } });
    }

    if (data.startsWith('KNOWLEDGE_CUST_')) {
        const id = data.replace('KNOWLEDGE_CUST_', '');
        const item = (settings.knowledgeBaseItems || []).find(c => c.id === id);
        if (!item) return sendFn(chatId, "❌ یافت نشد.");
        
        const text = `📌 *${item.title}*\n\n${item.content || '...'}`;
        return sendFn(chatId, text, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'ACT_KNOWLEDGE' }]] } });
    }


    if (data === 'SALES_BAL_DOWNLOAD_DEBTORS_XLSX' || data === 'SALES_BAL_DOWNLOAD_CREDITORS_XLSX') {
        const isDebtors = data === 'SALES_BAL_DOWNLOAD_DEBTORS_XLSX';
        const rawList = await getCustomerBalancesData(db);
        const filtered = rawList
            .filter(b => isDebtors ? b.type === 'بدهکار' : b.type === 'بستانکار')
            .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
        
        if (filtered.length === 0) {
            return sendFn(chatId, `⚠️ هیچ رکوردی برای لیست ${isDebtors ? "بدهکاران" : "بستانکاران"} یافت نشد.`, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'SALES_CUSTOMER_BALANCES' }]] } });
        }
        
        sendFn(chatId, "⏳ در حال تولید فایل اکسل گزارش... لطفاً منتظر بمانید.");
        
        const columns = ['کد حسابداری', 'نام مشتری', 'مانده حساب (ریال)', 'نوع'];
        const rows = filtered.map(b => [
            b.accountCode || '',
            b.name || '',
            Number(b.balance || 0),
            b.type || (Number(b.balance || 0) > 0 ? 'بدهکار' : 'بستانکار')
        ]);
        
        try {
            const buffer = generateExcelBuffer(columns, rows, isDebtors ? "Debtors" : "Creditors");
            const filename = `Report_${isDebtors ? 'Debtors' : 'Creditors'}_${Date.now()}.xlsx`;
            await sendDocFn(chatId, buffer, filename, `📊 گزارش اکسل ${isDebtors ? 'مشتریان بدهکار' : 'مشتریان بستانکار'}`);
        } catch (err) {
            console.error(err);
            sendFn(chatId, "❌ خطا در تولید یا ارسال فایل اکسل.");
        }
        return;
    }

    if (data.startsWith('SALES_BAL_VIEW_')) {
        const code = data.replace('SALES_BAL_VIEW_', '');
        const rawList = await getCustomerBalancesData(db);
        const rec = rawList.find(b => matchAccountCode(b.accountCode, code));
        
        if (!rec) {
            return sendFn(chatId, "❌ مشتری یافت نشد.", { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'SALES_CUSTOMER_BALANCES' }]] } });
        }
        
        const balanceStr = Number(rec.balance).toLocaleString('fa-IR');
        const updateStr = new Date(rec.updatedAt || Date.now()).toLocaleDateString('fa-IR');
        
        let msg = `👤 *مشخصات مشتری*\n\n`;
        msg += `👤 *نام:* ${rec.name}\n`;
        msg += `🔢 *کد حسابداری:* \`${rec.accountCode}\`\n`;
        msg += `💰 *مانده حساب:* *${balanceStr}* ریال (${rec.type})\n`;
        msg += `📅 *آخرین بروزرسانی:* ${updateStr}\n\n`;
        
        const statements = db.customerStatements || [];
        const hasStatement = statements.some(s => matchAccountCode(s.accountCode, code));
        
        const kb = [
            [
                { text: '📄 دانلود آخرین صورتحساب تفصیلی (Excel/PDF)', callback_data: `SALES_BAL_STMT_DOWNLOAD_${code}` }
            ],
            [
                { text: '📥 دانلود فرم تاییدیه حساب (PDF)', callback_data: `SALES_BAL_MAKE_CONFIRMATION_${code}` }
            ],
            [
                { text: '🔍 جستجوی مجدد', callback_data: 'SALES_BAL_SPECIFIC_SEARCH' },
                { text: '🔙 منوی قبلی', callback_data: 'SALES_CUSTOMER_BALANCES' }
            ]
        ];
        
        if (!hasStatement) {
            kb.shift();
        }
        
        return sendFn(chatId, msg, { reply_markup: { inline_keyboard: kb } });
    }

    if (data.startsWith('SALES_BAL_STMT_DOWNLOAD_')) {
        const code = data.replace('SALES_BAL_STMT_DOWNLOAD_', '');
        const statements = db.customerStatements || [];
        const matched = statements
            .filter(s => matchAccountCode(s.accountCode, code))
            .sort((a, b) => b.uploadedAt - a.uploadedAt);
            
        if (matched.length > 0) {
            const stmt = matched[0];
            try {
                await sendFn(chatId, `🔄 در حال دریافت آخرین صورتحساب پیوست مالی شما با شناسه \`${stmt.id}\`... منتظر بمانید.`);
                const fileBuffer = Buffer.from(stmt.fileData, 'base64');
                await sendDocFn(chatId, fileBuffer, stmt.fileName, `📄 صورتحساب تفصیلی تفکیک شده حسابداری: ${stmt.fileName}`);
                return;
            } catch (e) {
                console.error("Statement sendDocFn error: ", e);
                return sendFn(chatId, `❌ خطایی در ارسال فایل صورتحساب رخ داد.`);
            }
        } else {
            return sendFn(chatId, `⚠️ صورتحساب بارگذاری‌شده‌ای برای کد حسابداری شما یافت نشد.`, { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: `SALES_BAL_VIEW_${code}` }]] } });
        }
    }

    if (data.startsWith('SALES_BAL_MAKE_CONFIRMATION_')) {
        const code = data.replace('SALES_BAL_MAKE_CONFIRMATION_', '');
        const rawList = await getCustomerBalancesData(db);
        const rec = rawList.find(b => matchAccountCode(b.accountCode, code));
        
        if (!rec) {
            return sendFn(chatId, "❌ مشتری یافت نشد.");
        }
        
        sendFn(chatId, "⏳ در حال تولید تاییدیه حساب... لطفاً کمی صبر کنید.");
        
        const title = 'فرم رسمی تاییدیه مانده حساب';
        const columns = ['ردیف', 'مشخصه حساب', 'جزئیات ثبتی'];
        const rows = [
            ['۱', 'نام کامل مشتری / شرکت', rec.name || ''],
            ['۲', 'شناسه / کد حسابداری', rec.accountCode || ''],
            ['۳', 'نوع طلب/بدهی شرکت', rec.type || (Number(rec.balance || 0) > 0 ? 'بدهکار' : 'بستانکار')],
            ['۴', 'مبلغ کل مانده به ریال', Number(rec.balance || 0).toLocaleString('fa-IR')],
            ['۵', 'مبنای ثبت تاریخی', toShamsiFull(new Date(rec.updatedAt || Date.now()))],
            ['۶', 'تاریخ رسمی استعلام سیستم', toShamsiFull(new Date())]
        ];
        
        try {
            const pdfBuffer = await Renderer.generateReportPDF(title, columns, rows);
            const filename = `Confirmation_${code}_${Date.now()}.pdf`;
            await sendDocFn(chatId, pdfBuffer, filename, `📥 فرم رسمی تاییدیه حساب صادر شده از طرف شرکت جهت استعلام مانده حساب مشتری گرامی.`);
        } catch (err) {
            console.error(err);
            sendFn(chatId, "❌ متاسفانه خطایی در ساخت تاییدیه حساب پیش آمد.");
        }
        return;
    }

    if (data === 'SALES_GROUPS') {
        const products = db.products || [];
        const groups = [...new Set(products.map(p => p.group || 'بدون گروه'))].sort();
        const buttons = groups.map(g => [{ text: `📁 ${g}`, callback_data: `SALES_GROUP_${g}` }]);
        buttons.push([{ text: '🔙 بازگشت', callback_data: 'MENU_SALES' }]);
        return sendFn(chatId, "🔖 انتخاب گروه کالا:", { reply_markup: { inline_keyboard: buttons } });
    }

    if (data.startsWith('SALES_GROUP_')) {
        const group = data.replace('SALES_GROUP_', '');
        const products = (db.products || []).filter(p => (p.group || 'بدون گروه') === group);
        const subgroups = [...new Set(products.map(p => p.subgroup || 'سایر'))].sort();

        const buttons = subgroups.map(sg => [
            { text: `🔹 ${sg}`, callback_data: `SALES_SUB|${group}|${sg}` }
        ]);
        buttons.push([{ text: '🔙 انتخاب گروه دیگر', callback_data: 'SALES_GROUPS' }]);

        return sendFn(chatId, `📁 *گروه: ${group}*\nلطفاً زیرگروه را انتخاب کنید:`, { reply_markup: { inline_keyboard: buttons } });
    }

    if (data.startsWith('SALES_SUB|')) {
        const parts = data.split('|');
        const group = parts[1];
        const subgroup = parts[2];
        const products = (db.products || []).filter(p => (p.group || 'بدون گروه') === group && (p.subgroup || 'سایر') === subgroup);
        
        let res = `📁 ${group} > 🔹 ${subgroup}\n\n`;
        products.forEach(p => {
            res += formatProduct(p) + "------------------\n";
        });
        
        return sendFn(chatId, res, { reply_markup: { inline_keyboard: [[{ text: '🔙 انتخاب زیرگروه دیگر', callback_data: `SALES_GROUP_${group}` }], [{ text: '🔙 منوی اصلی فروش', callback_data: 'MENU_SALES' }]] } });
    }
    // --- NEW: SEARCH BY ID INIT ---
    if (['ACT_SEARCH_ID_PAY', 'ACT_SEARCH_ID_EXIT', 'ACT_SEARCH_ID_WH'].includes(data)) {
        let type = 'PAYMENT';
        if (data === 'ACT_SEARCH_ID_EXIT') type = 'EXIT';
        if (data === 'ACT_SEARCH_ID_WH') type = 'WH_BIJAK';
        
        session.data.targetType = type;
        session.state = 'WAIT_FOR_SEARCH_ID';
        return sendFn(chatId, "🔢 شماره سند / حواله / بیجک را وارد کنید:");
    }

    // --- MANAGEMENT REPORTS HANDLERS ---
    if (data === 'BOT_SAYAN_PENDING_DOCS') {
        if (!hasSayanReportsAccess(user, 'pending')) {
            return sendFn(chatId, "❌ شما دسترسی لازم جهت دریافت گزارش اسناد آویزان سایان را ندارید.");
        }

        await sendFn(chatId, "⏳ در حال استعلام و استخراج اسناد و چک‌های آویزان از سرور سایان... لطفا شکیبا باشید.");

        try {
            let rows = [];
            if (db.settings?.sayanApiUrl) {
                try {
                    const sql = `
                        SELECT 
                            t12.Field_001 as Id,
                            t12.Field_004 as StatusType,
                            t12.Field_005 as ChequeNo,
                            t12.Field_006 as DueDate,
                            t12.Field_008 as IsActive,
                            t12.Field_009 as BankName,
                            t12.Field_011 as DrawerName,
                            t12.Field_013 as Amount,
                            t12.Field_014 as Field014,
                            t12.Field_015 as StatusDesc,
                            t12.Field_016 as StatusCode,
                            t12.Field_017 as Field017,
                            t_last_op.LastOpCode,
                            t_last_op.LastOpSubCode,
                            t_last_op.LastOpAccount
                        FROM BUR_TBL_012 t12
                        LEFT JOIN (
                            SELECT 
                                t09.Field_007 as ChequeId,
                                t09.Field_023 as LastOpCode,
                                t09.Field_005 as LastOpSubCode,
                                t09.Field_012 as LastOpAccount
                            FROM BUR_TBL_009 t09
                            INNER JOIN (
                                SELECT Field_007 as ChequeId, MAX(CAST(Field_001 AS INT)) as MaxOpId
                                FROM BUR_TBL_009
                                WHERE Field_007 IS NOT NULL AND RTRIM(LTRIM(Field_007)) <> ''
                                GROUP BY Field_007
                            ) t_max ON t09.Field_007 = t_max.ChequeId AND CAST(t09.Field_001 AS INT) = t_max.MaxOpId
                        ) t_last_op ON CAST(t12.Field_001 AS VARCHAR(50)) = CAST(t_last_op.ChequeId AS VARCHAR(50))
                        ORDER BY t12.Field_006 ASC
                    `;
                    rows = await runSayanQuery(db, sql);
                } catch (err) {
                    console.error("Sayan query error for pending docs:", err);
                }
            }

            let totalAmt = 0;
            let tableRows = [];

            if (rows && rows.length > 0) {
                const extractShamsiYear = (dateStr) => {
                    if (!dateStr) return null;
                    const clean = String(dateStr).trim()
                        .replace(/[۰-۹]/g, x => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x))
                        .replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧۸۹'.indexOf(x));
                    
                    const match = clean.match(/(13\d{2}|14\d{2})/);
                    if (match) {
                        return parseInt(match[1], 10);
                    }

                    try {
                        const d = new Date(clean);
                        if (!isNaN(d.getTime())) {
                            const y = d.getFullYear();
                            const m = d.getMonth() + 1;
                            const day = d.getDate();
                            if (jalaali && typeof jalaali.toJalaali === 'function') {
                                const j = jalaali.toJalaali(y, m, day);
                                return j.jy;
                            }
                            const sh = toShamsiFull(d.toISOString());
                            const cleanSh = sh.replace(/[۰-۹]/g, x => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x)).replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧۸۹'.indexOf(x));
                            const matchSh = cleanSh.match(/(13\d{2}|14\d{2})/);
                            if (matchSh) {
                                return parseInt(matchSh[1], 10);
                            }
                        }
                    } catch (e) {}
                    return null;
                };

                const getCurrentShamsiYear = () => {
                    try {
                        const now = new Date();
                        const sh = toShamsiFull(now.toISOString());
                        const cleanSh = sh.replace(/[۰-۹]/g, x => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x)).replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧۸۹'.indexOf(x));
                        const match = cleanSh.match(/(13\d{2}|14\d{2})/);
                        if (match) return parseInt(match[1], 10);
                    } catch (e) {}
                    return 1405; // Fallback
                };

                const is1404PlusYear = (dateStr) => {
                    const yr = extractShamsiYear(dateStr);
                    const currentYear = getCurrentShamsiYear();
                    return yr !== null && yr >= (currentYear - 1);
                };

                const vaultRows = rows.filter(r => {
                    if (!is1404PlusYear(r.DueDate)) return false;
                    const lastOp = String(r.LastOpCode || '').trim();
                    const subOp = String(r.LastOpSubCode || '').trim();
                    const isActive = String(r.IsActive ?? '1').trim();
                    const rawDesc = String(r.StatusDesc || '').trim();
                    const cleanDesc = rawDesc
                        .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
                        .replace(/ي/g, 'ی')
                        .replace(/ك/g, 'ک')
                        .replace(/\s+/g, ' ')
                        .toLowerCase()
                        .trim();

                    if (isActive === '0' || isActive === 'false') return false;

                    // Sayan ERP authoritative operation codes
                    // 11 = دریافت چک (نزد صندوق)
                    // 12 = واگذاری به بانک (در جریان وصول)
                    // 17 = وصول شده
                    // 18 = خرج چک (خرج شده)
                    // 15, 16 = برگشتی (برگشتی)
                    // 20 = برگشت به صندوق (نزد صندوق)

                    let isCashed = false;
                    let isSpent = false;
                    let isReturned = false;

                    if (lastOp === '17' || lastOp === '14') {
                        isCashed = true;
                    } else if (lastOp === '18') {
                        isSpent = true;
                    } else if (lastOp === '15' || lastOp === '16') {
                        isReturned = true;
                    } else {
                        // Text parsing fallback
                        isCashed = cleanDesc.includes('وصول شده') || 
                                   cleanDesc.includes('برگشتی وصول شده');
                        isSpent = cleanDesc.includes('چک خرجی') || cleanDesc.includes('خرج شده');
                        isReturned = cleanDesc.includes('برگشت به طرف حساب') || 
                                     cleanDesc.includes('برگشتی');
                    }

                    if (isCashed || isSpent || isReturned) return false;
                    return true;
                });

                tableRows = vaultRows.map((r, idx) => {
                    const amt = parseFloat(r.Amount || 0);
                    totalAmt += amt;

                    const lastOp = String(r.LastOpCode || '').trim();
                    const subOp = String(r.LastOpSubCode || '').trim();
                    const rawDesc = String(r.StatusDesc || '').trim();
                    const cleanDesc = rawDesc
                        .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
                        .replace(/ي/g, 'ی')
                        .replace(/ك/g, 'ک')
                        .replace(/\s+/g, ' ')
                        .toLowerCase()
                        .trim();

                    let isAtBank = false;
                    if (lastOp === '12' || lastOp === '13') {
                        isAtBank = true;
                    } else if (lastOp === '11' || lastOp === '20') {
                        isAtBank = false;
                    } else {
                        isAtBank = cleanDesc.includes('به حساب خوابانده شده') || 
                                   cleanDesc.includes('در جریان') || 
                                   cleanDesc.includes('واگذار');
                    }

                    let displayStatus = 'نزد صندوق (فعال)';
                    if (isAtBank) {
                        displayStatus = 'در جریان وصول (بانک)';
                    } else if (r.StatusDesc && r.StatusDesc.trim() !== '') {
                        displayStatus = r.StatusDesc;
                    }

                    return [
                        (idx + 1).toLocaleString('fa-IR'),
                        r.ChequeNo || String(r.Id || '-'),
                        r.DueDate || '-',
                        r.DrawerName || 'نامشخص',
                        r.BankName || '-',
                        amt.toLocaleString('fa-IR'),
                        displayStatus
                    ];
                });
            } else {
                // Fallback to local cheque receipts or pending records
                const localCheques = db.chequeReceipts || [];
                tableRows = localCheques.map((c, idx) => {
                    const amt = parseFloat(c.amount || 0);
                    totalAmt += amt;
                    return [
                        (idx + 1).toLocaleString('fa-IR'),
                        c.chequeNumber || '-',
                        c.dueDate || '-',
                        c.payerName || '-',
                        c.bankName || '-',
                        amt.toLocaleString('fa-IR'),
                        'آویزان / نزد صندوق'
                    ];
                });
            }

            if (tableRows.length === 0) {
                return sendFn(chatId, "⚠️ هیچ سند یا چک آویزانی در سیستم یافت نشد.", {
                    reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'SAYAN_REPORTS_MENU' }]] }
                });
            }

            tableRows.push([
                'جمع کل',
                '-',
                '-',
                '-',
                '-',
                totalAmt.toLocaleString('fa-IR'),
                '-'
            ]);

            const title = `گزارش اسناد و چک‌های آویزان سایان ERP - ${toShamsiFull(new Date())}`;
            const columns = ["ردیف", "شماره چک / سند", "سررسید / تاریخ", "صادرکننده / طرف حساب", "بانک / شعبه", "مبلغ (ریال)", "وضعیت سند / چک"];
            const pdfBuffer = await Renderer.generateReportPDF(title, columns, tableRows);
            const filename = `Sayan_Pending_Docs_${getTehranDateString()}.pdf`;

            await sendDocFn(chatId, pdfBuffer, filename, `📜 *گزارش رسمی اسناد و چک‌های آویزان سایان ERP*\n\n📊 تعداد ردیف‌ها: ${(tableRows.length - 1).toLocaleString('fa-IR')}\n💰 مجموع مبلغ: ${totalAmt.toLocaleString('fa-IR')} ریال`);
        } catch (err) {
            console.error("Bot Pending Docs Error:", err);
            sendFn(chatId, `❌ خطا در استعلام اسناد آویزان: ${err.message}`);
        }
        return;
    }

    if (data === 'BOT_SAYAN_DAILY_SALES') {
        if (!hasSayanReportsAccess(user, 'daily_sales')) {
            return sendFn(chatId, "❌ شما دسترسی لازم جهت دریافت گزارش فاکتور فروش روزانه سایان را ندارید.");
        }
        
        await sendFn(chatId, "⏳ در حال استعلام اطلاعات فروش امروز از سرور سایان و تولید فرم چاپی... لطفا شکیبا باشید.");
        
        try {
            const todayStr = getTehranDateString();
            const salesData = await fetchProcessedSayanSalesData(db, todayStr, todayStr);
            const { categoryList, summary } = salesData;

            if (categoryList.length === 0) {
                return sendFn(chatId, `⚠️ هیچ فاکتور فروش یا مرجوعی برای امروز (${toShamsiFull(new Date())}) در سرور سایان ثبت نشده است.`);
            }
            
            const title = `گزارش رسمی فروش روزانه و مرجوعی سایان - مورخ ${summary.shamsiFrom || toShamsiFull(new Date())}`;
            const columns = ['ردیف', 'سرفصل کالا', 'فروش (ک‌گ / ریال)', 'مرجوعی کد ۱۳ (ک‌گ / ریال)', 'خالص نهایی (ک‌گ / ریال)'];
            
            let idx = 1;
            const tableRows = categoryList.map(cat => [
                (idx++).toLocaleString('fa-IR'),
                cat.name,
                `${cat.salesQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${Math.round(cat.salesAmt).toLocaleString('fa-IR')}`,
                `${cat.returnQty > 0 ? cat.returnQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '۰'} / ${Math.round(cat.returnAmt).toLocaleString('fa-IR')}`,
                `${cat.netWgt.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${Math.round(cat.netAmt).toLocaleString('fa-IR')}`
            ]);

            tableRows.push([
                'جمع کل',
                'خلاصه عملکرد',
                `${summary.totalSalesQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${Math.round(summary.totalSalesAmt).toLocaleString('fa-IR')}`,
                `${summary.totalReturnQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${Math.round(summary.totalReturnAmt).toLocaleString('fa-IR')}`,
                `${summary.netWeight.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${Math.round(summary.netAmount).toLocaleString('fa-IR')}`
            ]);
            
            const pdfBuffer = await Renderer.generateReportPDF(title, columns, tableRows, true);
            const filename = `Sayan_Daily_Sales_${todayStr}.pdf`;
            
            await sendDocFn(chatId, pdfBuffer, filename, `Sayan ERP 🧾 ${title}\n 📦 فروش ناخالص: ${summary.totalSalesQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} کیلوگرم (${Math.round(summary.totalSalesAmt).toLocaleString('fa-IR')} ریال)\n 🔄 مرجوعی کد ۱۳: ${summary.totalReturnQty.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} کیلوگرم (${Math.round(summary.totalReturnAmt).toLocaleString('fa-IR')} ریال)\n ✅ فروش خالص کل: ${summary.netWeight.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} کیلوگرم (${Math.round(summary.netAmount).toLocaleString('fa-IR')} ریال)\n 🏷 فی متوسط خالص: ${Math.round(summary.avgFee).toLocaleString('fa-IR')} ریال/ک‌گ`);
        } catch (err) {
            console.error("Bot Daily Sales Error:", err);
            sendFn(chatId, `❌ خطا در تهیه گزارش فروش سایان: ${err.message}`);
        }
        return;
    }

    if (data === 'BOT_SAYAN_COMPARE_SALES') {
        if (!hasSayanReportsAccess(user, 'compare_sales')) {
            return sendFn(chatId, "❌ شما دسترسی لازم جهت دریافت گزارش مقایسه‌ای فروش سایان را ندارید.");
        }
        
        const kb = [
            [{ text: '🔄 مقایسه دیروز با امروز', callback_data: 'BOT_SAYAN_COMPARE_PRESETS_YESTERDAY_TODAY' }],
            [{ text: '📅 مقایسه این هفته با هفته قبل', callback_data: 'BOT_SAYAN_COMPARE_PRESETS_WEEK' }],
            [{ text: '🗓 مقایسه این ماه با ماه قبل', callback_data: 'BOT_SAYAN_COMPARE_PRESETS_MONTH' }],
            [{ text: '⌨️ ورود بازه زمانی دلخواه (تایپ)', callback_data: 'BOT_SAYAN_COMPARE_CUSTOM' }],
            [{ text: '🔙 بازگشت', callback_data: 'MENU_REPORTS' }]
        ];
        return sendFn(chatId, "⚖️ *انتخاب بازه مقایسه فروش سایان*\nیکی از بازه‌های پیش‌فرض زیر را انتخاب کنید یا بازه زمانی دلخواه خود را وارد نمایید:", { reply_markup: { inline_keyboard: kb }, parse_mode: 'Markdown' });
    }

    if (data === 'BOT_SAYAN_COMPARE_PRESETS_YESTERDAY_TODAY') {
        const dateFromA = getTehranOffsetDateString(0);
        const dateToA = getTehranOffsetDateString(0);
        const dateFromB = getTehranOffsetDateString(1);
        const dateToB = getTehranOffsetDateString(1);
        await generateAndSendComparisonPDF(db, chatId, sendFn, sendDocFn, dateFromA, dateToA, dateFromB, dateToB, "امروز", "دیروز");
        return;
    }

    if (data === 'BOT_SAYAN_COMPARE_PRESETS_WEEK') {
        const dateFromA = getTehranOffsetDateString(6);
        const dateToA = getTehranOffsetDateString(0);
        const dateFromB = getTehranOffsetDateString(13);
        const dateToB = getTehranOffsetDateString(7);
        await generateAndSendComparisonPDF(db, chatId, sendFn, sendDocFn, dateFromA, dateToA, dateFromB, dateToB, "۷ روز اخیر", "۷ روز قبل از آن");
        return;
    }

    if (data === 'BOT_SAYAN_COMPARE_PRESETS_MONTH') {
        const dateFromA = getTehranOffsetDateString(29);
        const dateToA = getTehranOffsetDateString(0);
        const dateFromB = getTehranOffsetDateString(59);
        const dateToB = getTehranOffsetDateString(30);
        await generateAndSendComparisonPDF(db, chatId, sendFn, sendDocFn, dateFromA, dateToA, dateFromB, dateToB, "۳۰ روز اخیر", "۳۰ روز قبل از آن");
        return;
    }

    if (data === 'BOT_SAYAN_COMPARE_CUSTOM') {
        session.state = 'BOT_SAYAN_WAIT_COMPARE_DATES';
        return sendFn(chatId, "⌨️ *لطفاً بازه‌های مقایسه‌ای خود را دقیقاً با فرمت زیر به صورت تاریخ میلادی بنویسید:*\n\nتاریخ شروع بازه ۱, تاریخ پایان بازه ۱ | تاریخ شروع بازه ۲, تاریخ پایان بازه ۲\n\nالگوی نمونه:\n`2024-01-01, 2024-01-10 | 2024-02-01, 2024-02-10`", { reply_markup: { inline_keyboard: [[{ text: '🔙 انصراف', callback_data: 'BOT_SAYAN_COMPARE_SALES' }]] }, parse_mode: 'Markdown' });
    }

    if (data === 'RPT_DAILY') {
        const today = getTehranDateString(); // YYYY-MM-DD
        const shamsiToday = toShamsiFull(new Date());
        
        const payToday = db.orders.filter(o => o.date.startsWith(today));
        const totalPay = payToday.reduce((sum, o) => sum + o.totalAmount, 0);
        
        const exitToday = db.exitPermits.filter(p => p.date.startsWith(today));
        const bijakToday = db.warehouseTransactions.filter(t => t.type === 'OUT' && t.date.startsWith(today));

        let msg = `📊 *گزارش خلاصه وضعیت امروز* (${shamsiToday})\n`;
        msg += `--------------------------\n`;
        msg += `💰 *پرداخت‌ها:* ${payToday.length} مورد\n`;
        msg += `💵 *جمع مبلغ:* ${parseInt(totalPay).toLocaleString()} ریال\n`;
        msg += `--------------------------\n`;
        msg += `🚛 *مجوزهای خروج:* ${exitToday.length} مورد\n`;
        msg += `📦 *بیجک‌های صادر شده:* ${bijakToday.length} مورد\n`;
        
        return sendFn(chatId, msg);
    }

    if (data === 'RPT_MONTHLY') {
        const today = new Date();
        const currentMonth = toShamsiYearMonth(today.toISOString()); // "1403/02"
        
        // Filter by Shamsi Month string comparison
        const payMonth = db.orders.filter(o => toShamsiYearMonth(o.date) === currentMonth);
        const totalPay = payMonth.reduce((sum, o) => sum + o.totalAmount, 0);
        
        const exitMonth = db.exitPermits.filter(p => toShamsiYearMonth(p.date) === currentMonth);
        const bijakMonth = db.warehouseTransactions.filter(t => t.type === 'OUT' && t.date.startsWith(today));

        let msg = `🗓 *عملکرد ماه جاری* (${currentMonth})\n`;
        msg += `--------------------------\n`;
        msg += `💰 *کل پرداخت‌ها:* ${payMonth.length} فقره\n`;
        msg += `💵 *جمع کل:* ${parseInt(totalPay).toLocaleString()} ریال\n`;
        msg += `--------------------------\n`;
        msg += `🚛 *مجوز خروج:* ${exitMonth.length} فقره\n`;
        msg += `📦 *بیجک انبار:* ${bijakMonth.length} فقره\n`;

        return sendFn(chatId, msg);
    }

    if (data === 'RPT_PENDING') {
        // Count Pending Items by Status
        const payPendingFin = db.orders.filter(o => o.status === 'در انتظار بررسی مالی').length;
        const payPendingMgr = db.orders.filter(o => o.status === 'تایید مالی / در انتظار مدیریت').length;
        const payPendingCeo = db.orders.filter(o => o.status === 'تایید مدیریت / در انتظار مدیرعامل').length;

        const exitPendingCeo = db.exitPermits.filter(p => p.status === 'در انتظار تایید مدیرعامل').length;
        const exitPendingFac = db.exitPermits.filter(p => p.status === 'در انتظار مدیر کارخانه').length;
        const exitPendingWh = db.exitPermits.filter(p => p.status === 'در انتظار تایید انبار').length;
        const exitPendingSec = db.exitPermits.filter(p => p.status === 'در انتظار خروج').length;

        let msg = `⏳ *وضعیت کارتابل‌ها (اسناد باز)*\n`;
        msg += `--------------------------\n`;
        msg += `💰 *دستور پرداخت:*\n`;
        msg += `   ▫️ مالی: ${payPendingFin}\n`;
        msg += `   ▫️ مدیریت: ${payPendingMgr}\n`;
        msg += `   ▫️ مدیرعامل: ${payPendingCeo}\n`;
        msg += `--------------------------\n`;
        msg += `🚛 *مجوز خروج:*\n`;
        msg += `   ▫️ مدیرعامل: ${exitPendingCeo}\n`;
        msg += `   ▫️ کارخانه: ${exitPendingFac}\n`;
        msg += `   ▫️ انبار: ${exitPendingWh}\n`;
        msg += `   ▫️ انتظامات: ${exitPendingSec}\n`;

        return sendFn(chatId, msg);
    }

    // --- PAYMENT ACTIONS ---
    if (data === 'ACT_PAY_NEW') {
        session.state = 'PAY_AMOUNT';
        return sendFn(chatId, "💵 مبلغ پرداختی (ریال) را وارد کنید:");
    }

    if (data === 'ACT_ATTACH_PAY_START') {
        session.state = 'WAIT_PAYMENT_ORDER_FOR_ATTACH';
        session.data.paymentAttachFiles = [];
        return sendFn(chatId, "🔢 لطفاً شماره سند یا شماره پیگیری دستور پرداخت مورد نظر را وارد کنید:", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 بازگشت به مدیریت پرداخت', callback_data: 'MENU_PAYMENT' }]
                ]
            }
        });
    }

    if (data.startsWith('ACT_ATTACH_PAY_FOR_')) {
        const orderId = data.replace('ACT_ATTACH_PAY_FOR_', '');
        const order = (db.orders || []).find(o => o.id === orderId || String(o.trackingNumber) === orderId);
        if (!order) return sendFn(chatId, "❌ دستور پرداخت مورد نظر یافت نشد.");

        session.state = 'WAIT_PAYMENT_ORDER_ATTACHMENT_FILE';
        session.data.attachOrderId = order.id;
        session.data.attachOrderTracking = order.trackingNumber;
        session.data.paymentAttachFiles = [];

        const existingAtts = (order.attachments?.length || 0) + (order.archiveAttachments?.length || 0);

        return sendFn(chatId, `📎 *افزودن پیوست به دستور پرداخت #${order.trackingNumber}*
🏢 شرکت: ${order.payingCompany || '-'}
👤 ذینفع: ${order.payee || '-'}
💰 مبلغ: ${Number(order.totalAmount || 0).toLocaleString()} ریال
📎 پیوست‌های فعلی: ${existingAtts > 0 ? `✅ ${existingAtts} فایل` : '❌ ندارد'}

📸 *لطفاً عکس‌های فاکتور، رسید یا فایل PDF پیوست را ارسال فرمایید:*`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 بازگشت به مدیریت پرداخت', callback_data: 'MENU_PAYMENT' }]
                ]
            }
        });
    }

    if (data.startsWith('ACT_VIEW_PAY_ATTACH_')) {
        const orderId = data.replace('ACT_VIEW_PAY_ATTACH_', '');
        const order = (db.orders || []).find(o => o.id === orderId || String(o.trackingNumber) === orderId);
        if (!order) return sendFn(chatId, "❌ دستور پرداخت مورد نظر یافت نشد.");

        const allAtts = [...(order.attachments || []), ...(order.archiveAttachments || [])];
        if (allAtts.length === 0) {
            return sendFn(chatId, `📎 دستور پرداخت #${order.trackingNumber} هیچ فایل پیوستی ندارد.`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '➕ افزودن پیوست به همین سند', callback_data: `ACT_ATTACH_PAY_FOR_${order.id}` }],
                        [{ text: '🔙 بازگشت', callback_data: 'MENU_PAYMENT' }]
                    ]
                }
            });
        }

        await sendFn(chatId, `⏳ در حال آماده‌سازی و ارسال ${allAtts.length} فایل پیوست برای سند #${order.trackingNumber}...`);

        let sentAny = false;
        for (let i = 0; i < allAtts.length; i++) {
            const att = allAtts[i];
            try {
                const buffer = getAttachmentBuffer(att);
                if (!buffer || buffer.length === 0) continue;
                
                const isPdf = (att.type && att.type.includes('pdf')) || (att.fileName && att.fileName.toLowerCase().endsWith('.pdf')) || (att.name && att.name.toLowerCase().endsWith('.pdf'));
                const fileName = att.fileName || att.name || `attachment_${i+1}.${isPdf ? 'pdf' : 'jpg'}`;
                const caption = `📎 پیوست (${i+1}/${allAtts.length}) سند #${order.trackingNumber}\n📄 نام فایل: ${fileName}`;

                if (isPdf) {
                    await sendDocFn(chatId, buffer, fileName, caption);
                    sentAny = true;
                } else {
                    try {
                        await sendPhotoFn(platform, chatId, buffer, caption);
                        sentAny = true;
                    } catch (_) {
                        await sendDocFn(chatId, buffer, fileName, caption);
                        sentAny = true;
                    }
                }
            } catch (fileErr) {
                console.error("[View Attach Err]:", fileErr.message);
            }
        }

        if (!sentAny) {
            await sendFn(chatId, `⚠️ امکان بازخوانی فایل‌های پیوست از سرور میسر نشد.`);
        }

        return sendFn(chatId, `✅ نمایش پیوست‌های سند #${order.trackingNumber} پایان یافت.`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ افزودن پیوست جدید', callback_data: `ACT_ATTACH_PAY_FOR_${order.id}` }],
                    [{ text: '🔙 بازگشت', callback_data: 'MENU_PAYMENT' }]
                ]
            }
        });
    }

    if (data.startsWith('ACT_PAY_ATTACH_MERGE_SAVE_')) {
        const orderId = data.replace('ACT_PAY_ATTACH_MERGE_SAVE_', '');
        const order = (db.orders || []).find(o => o.id === orderId || String(o.trackingNumber) === orderId);
        if (!order) return sendFn(chatId, "❌ دستور پرداخت مورد نظر یافت نشد.");

        const files = session.data.paymentAttachFiles || [];
        if (files.length === 0) {
            return sendFn(chatId, "⚠️ هیچ عکس یا فایلی ارسال نشده است. لطفاً ابتدا تصاویر یا فایل PDF را بفرستید.");
        }

        await sendFn(chatId, `⏳ در حال ادغام ${files.length} فایل و تبدیل به PDF پیوست...`);

        try {
            let pdfBuffer;
            if (files.length === 1 && (files[0].type === 'pdf' || (files[0].fileName && files[0].fileName.endsWith('.pdf')))) {
                pdfBuffer = files[0].buffer;
            } else {
                pdfBuffer = await mergeFilesToPdf(files);
            }

            const safeName = `pay_attach_${order.trackingNumber}_${Date.now()}.pdf`;
            const uploadDir = path.join(process.cwd(), 'uploads');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            fs.writeFileSync(path.join(uploadDir, safeName), pdfBuffer);
            const fileUrl = `/uploads/${safeName}`;

            if (!order.attachments) order.attachments = [];
            order.attachments.push({
                id: generateUUID(),
                fileName: `پیوست_سند_${order.trackingNumber}.pdf`,
                name: `پیوست_سند_${order.trackingNumber}.pdf`,
                url: fileUrl,
                data: fileUrl,
                type: 'application/pdf',
                size: pdfBuffer.length,
                uploadedAt: Date.now(),
                uploadedBy: user ? user.fullName : (platform === 'bale' ? 'کاربر بله' : 'کاربر تلگرام')
            });

            saveDb(db);
            session.state = 'IDLE';
            session.data.paymentAttachFiles = [];

            await sendFn(chatId, `✅ فایل‌های پیوست با موفقیت ادغام و به سند #${order.trackingNumber} متصل شدند.`);
            try {
                await sendDocFn(chatId, pdfBuffer, `پیوست_سند_${order.trackingNumber}.pdf`, `📎 فایل نهایی پیوست دستور پرداخت #${order.trackingNumber}`);
            } catch (_) {}

            return sendFn(chatId, "عملیات دیگری مد نظر دارید؟", { reply_markup: KEYBOARDS.PAYMENT });
        } catch (err) {
            console.error("Error merging payment attachments:", err);
            return sendFn(chatId, `❌ خطا در پردازش و ذخیره PDF: ${err.message}`);
        }
    }

    if (data.startsWith('ACT_PAY_ATTACH_SAVE_RAW_')) {
        const orderId = data.replace('ACT_PAY_ATTACH_SAVE_RAW_', '');
        const order = (db.orders || []).find(o => o.id === orderId || String(o.trackingNumber) === orderId);
        if (!order) return sendFn(chatId, "❌ دستور پرداخت مورد نظر یافت نشد.");

        const files = session.data.paymentAttachFiles || [];
        if (files.length === 0) {
            return sendFn(chatId, "⚠️ هیچ فایلی برای ذخیره ارسال نشده است.");
        }

        const uploadDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        if (!order.attachments) order.attachments = [];
        if (!order.archiveAttachments) order.archiveAttachments = [];

        for (const file of files) {
            const ext = (file.fileName && file.fileName.includes('.')) ? file.fileName.split('.').pop() : (file.type === 'image' ? 'jpg' : 'pdf');
            const safeName = `pay_attach_${order.trackingNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}.${ext}`;
            fs.writeFileSync(path.join(uploadDir, safeName), file.buffer);
            const fileUrl = `/uploads/${safeName}`;

            const attObj = {
                id: generateUUID(),
                fileName: file.fileName || safeName,
                name: file.fileName || safeName,
                url: fileUrl,
                data: fileUrl,
                type: file.type === 'image' ? 'image/jpeg' : 'application/pdf',
                size: file.buffer.length,
                uploadedAt: Date.now(),
                uploadedBy: user ? user.fullName : (platform === 'bale' ? 'کاربر بله' : 'کاربر تلگرام')
            };

            order.attachments.push(attObj);
            order.archiveAttachments.push(attObj);
        }

        saveDb(db);
        const count = files.length;
        session.state = 'IDLE';
        session.data.paymentAttachFiles = [];

        // Real-time broadcast to connected clients
        import('../server.js').then(async m => {
            if (m.broadcastNotification) {
                await m.broadcastNotification(
                    `📎 پیوست جدید دستور پرداخت #${order.trackingNumber}`,
                    `${count} فایل جدید به دستور پرداخت #${order.trackingNumber} ضمیمه شد.`,
                    '/manage',
                    ['admin', 'financial', 'manager', 'ceo']
                );
            }
        }).catch(() => {});

        await sendFn(chatId, `✅ تعداد ${count} فایل با موفقیت به عنوان پیوست به دستور پرداخت #${order.trackingNumber} متصل شد.`);
        return sendFn(chatId, "عملیات دیگری مد نظر دارید؟", { reply_markup: KEYBOARDS.PAYMENT });
    }

    if (data === 'ACT_ATTACH_RECENT_TO_PAYMENT') {
        if (!session.data.recentFile) {
            return sendFn(chatId, "⚠️ فایلی یافت نشد. لطفاً ابتدا عکس یا فایل PDF را ارسال نمایید.");
        }
        session.data.paymentAttachFiles = [session.data.recentFile];
        session.state = 'WAIT_PAYMENT_ORDER_FOR_ATTACH_WITH_FILE';
        return sendFn(chatId, "🔢 لطفاً شماره سند یا شماره پیگیری دستور پرداختی که مایلید این فایل به آن متصل شود را وارد کنید:", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 انصراف', callback_data: 'MENU_PAYMENT' }]
                ]
            }
        });
    }

    if (data === 'ACT_PAY_CARTABLE') {
        // Logic to show pending payments based on role
        let pendingOrders = [];
        if (user.role === 'financial') pendingOrders = db.orders.filter(o => o.status === 'در انتظار بررسی مالی');
        else if (user.role === 'manager') pendingOrders = db.orders.filter(o => o.status === 'تایید مالی / در انتظار مدیریت');
        else if (user.role === 'ceo') pendingOrders = db.orders.filter(o => o.status === 'تایید مدیریت / در انتظار مدیرعامل');
        else if (user.role === 'admin') pendingOrders = db.orders.filter(o => !o.status.includes('نهایی') && !o.status.includes('رد'));
        else {
            // Normal users or users with attachment rights: show their own requests or active orders awaiting attachments
            pendingOrders = (db.orders || []).filter(o => 
                (user && o.requester === user.fullName) || 
                (user && user.canManageArchiveAttachments && !o.status.includes('رد'))
            ).slice(0, 10);
        }

        if (pendingOrders.length === 0) return sendFn(chatId, "✅ کارتابل شما خالی است.");

        for (const order of pendingOrders) {
            let paymentBankInfo = 'نامشخص';
            if (order.paymentDetails && order.paymentDetails.length > 0) {
                const banks = [...new Set(order.paymentDetails.map(d => d.bankName).filter(Boolean))];
                if (banks.length > 0) paymentBankInfo = banks.join('، ');
            }
            
            let detailsText = '';
            if (order.paymentDetails && order.paymentDetails.length > 0) {
                detailsText = '\n📋 *جزئیات پرداخت:*';
                order.paymentDetails.forEach((d, i) => {
                    detailsText += `\n   ${i+1}. ${d.method} (${Number(d.amount).toLocaleString()} ریال)${d.bankName ? ' - بانک ' + d.bankName : ''}${d.chequeNumber ? ' - چک ' + d.chequeNumber : ''}${d.chequeDate ? ' (' + d.chequeDate + ')' : ''}`;
                });
            }
            
            const hasAtt = (order.attachments && order.attachments.length > 0) || (order.archiveAttachments && order.archiveAttachments.length > 0);
            const attCount = (order.attachments?.length || 0) + (order.archiveAttachments?.length || 0);

            const methodType = (order.paymentDetails && order.paymentDetails.length > 0) ? order.paymentDetails[0].method : '-';
            const caption = `💸 *دستور پرداخت کارتابل*
--------------------------
🏢 *شرکت:* ${order.payingCompany || '-'}
🔢 *شماره سند:* #${order.trackingNumber || order.id}
📅 *تاریخ ثبت:* ${order.date ? toShamsiFull(order.date) : '-'}
👤 *ذینفع:* ${order.payee || '-'}
📍 *محل پرداخت:* ${order.paymentPlace || '-'}
💳 *روش اصلی:* ${methodType}
🏦 *بانک صادرکننده:* ${paymentBankInfo}
💰 *مبلغ کل:* ${Number(order.totalAmount || 0).toLocaleString()} ریال
📝 *بابت/توضیحات:* ${order.description || '-'}
🔄 *وضعیت فعلی:* ${order.status}
📎 *پیوست:* ${hasAtt ? `✅ دارد (${attCount} فایل)` : '❌ ندارد'}${detailsText}`;
            
            const actionRow = [
                { text: '✅ تایید', callback_data: `APP_PAY_${order.id}` },
                { text: '❌ رد', callback_data: `REJ_PAY_${order.id}` }
            ];
            const fileRow = [];
            if (hasAtt) {
                fileRow.push({ text: `📎 مشاهده پیوست‌ها (${attCount})`, callback_data: `ACT_VIEW_PAY_ATTACH_${order.id}` });
            }
            fileRow.push({ text: '📎 افزودن پیوست', callback_data: `ACT_ATTACH_PAY_FOR_${order.id}` });

            const kb = {
                inline_keyboard: [
                    actionRow,
                    fileRow
                ]
            };
            await sendFn(chatId, caption, { reply_markup: kb });
        }
        return;
    }

    // Payment Approval Logic
    if (data.startsWith('APP_PAY_')) {
        const id = data.replace('APP_PAY_', '');
        const order = db.orders.find(o => o.id === id);
        if (order) {
            let canApprove = false;
            if (order.status === 'در انتظار بررسی مالی' && ['financial', 'admin'].includes(user.role)) canApprove = true;
            else if (order.status === 'تایید مالی / در انتظار مدیریت' && ['manager', 'admin'].includes(user.role)) canApprove = true;
            else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل' && ['ceo', 'admin'].includes(user.role)) canApprove = true;

            if (!canApprove) return sendFn(userId, "⛔ شما دسترسی لازم برای این مرحله را ندارید.");

            if (order.status === 'در انتظار بررسی مالی') {
                order.status = 'تایید مالی / در انتظار مدیریت';
                order.approverFinancial = user.fullName;
            } else if (order.status === 'تایید مالی / در انتظار مدیریت') {
                order.status = 'تایید مدیریت / در انتظار مدیرعامل';
                order.approverManager = user.fullName;
            } else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل') {
                order.status = 'تایید نهایی';
                order.approverCeo = user.fullName;
            }
            
            saveDb(db);
            sendFn(chatId, `✅ سند #${order.trackingNumber} تایید شد.`);

            const isFinal = order.status === 'تایید نهایی' || order.status === 'پرداخت شده';
            notifyPaymentOrderStep(order, db, order.status, isFinal).catch(e => console.error("Bot Callback Notify Error:", e));
        }
        return;
    }
    if (data.startsWith('REJ_PAY_')) {
        const id = data.replace('REJ_PAY_', '');
        const order = db.orders.find(o => o.id === id);
        if (order) {
            let canReject = false;
            if (order.status === 'در انتظار بررسی مالی' && ['financial', 'admin'].includes(user.role)) canReject = true;
            else if (order.status === 'تایید مالی / در انتظار مدیریت' && ['manager', 'admin'].includes(user.role)) canReject = true;
            else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل' && ['ceo', 'admin'].includes(user.role)) canReject = true;

            if (!canReject) return sendFn(userId, "⛔ شما دسترسی لازم برای رد این مرحله را ندارید.");

            order.status = 'رد شده';
            order.rejectedBy = user.fullName;
            order.rejectionReason = 'رد شده از طریق ربات پیام‌رسان';
            saveDb(db);
            sendFn(chatId, `❌ سند #${order.trackingNumber} رد شد.`);
            
            notifyPaymentOrderStep(order, db, 'رد شده', false).catch(e => console.error("Bot Callback Reject Notify Error:", e));
        }
        return;
    }

    // --- EXIT ACTIONS ---
    if (data === 'ACT_EXIT_NEW') {
        session.state = 'EXIT_RECIPIENT';
        return sendFn(chatId, "👤 نام گیرنده کالا را وارد کنید:");
    }

    if (data === 'ACT_EXIT_CARTABLE') {
        let pendingPermits = [];
        if (user.role === 'ceo') pendingPermits = db.exitPermits.filter(p => p.status === 'در انتظار تایید مدیرعامل');
        else if (user.role === 'factory_manager') pendingPermits = db.exitPermits.filter(p => p.status === 'در انتظار مدیر کارخانه' || p.status === 'در انتظار تایید نهایی مدیر کارخانه');
        else if (user.role === 'warehouse_keeper') pendingPermits = db.exitPermits.filter(p => p.status === 'در انتظار تایید انبار');
        else if (user.role === 'security_head' || user.role === 'security_guard') pendingPermits = db.exitPermits.filter(p => p.status === 'در انتظار خروج (انتظامات)');
        else if (user.role === 'admin') pendingPermits = db.exitPermits.filter(p => !p.status.includes('بایگانی') && !p.status.includes('خارج شد') && !p.status.includes('رد'));

        if (pendingPermits.length === 0) return sendFn(chatId, "✅ کارتابل خروج خالی است.");

        for (const p of pendingPermits) {
            const isFinalStep = p.status === 'در انتظار تایید نهایی مدیر کارخانه';
            const caption = `🚛 مجوز #${p.permitNumber}\n👤 گیرنده: ${p.recipientName}\n📦 کالا: ${p.goodsName}\n🔄 وضعیت: ${isFinalStep ? 'در انتظار تایید نهایی خروج' : p.status}`;
            const kb = {
                inline_keyboard: [
                    [
                        { text: isFinalStep ? '✅ تایید نهایی خروج' : '✅ تایید', callback_data: `APP_EXIT_${p.id}` },
                        { text: '❌ رد', callback_data: `REJ_EXIT_${p.id}` }
                    ]
                ]
            };
            await sendFn(chatId, caption, { reply_markup: kb });
        }
        return;
    }

    if (data.startsWith('APP_EXIT_')) {
        const id = data.replace('APP_EXIT_', '');
        const p = db.exitPermits.find(x => x.id === id);
        if (p) {
            let canApprove = false;
            if (p.status === 'در انتظار تایید مدیرعامل' && ['ceo', 'admin'].includes(user.role)) canApprove = true;
            else if (p.status === 'در انتظار مدیر کارخانه' && ['factory_manager', 'admin'].includes(user.role)) canApprove = true;
            else if (p.status === 'در انتظار تایید انبار' && ['warehouse_keeper', 'admin'].includes(user.role)) canApprove = true;
            else if (p.status === 'در انتظار خروج (انتظامات)' && ['security_head', 'security_guard', 'admin'].includes(user.role)) canApprove = true;
            else if (p.status === 'در انتظار تایید نهایی مدیر کارخانه' && ['factory_manager', 'admin'].includes(user.role)) canApprove = true;

            if (!canApprove) {
                return sendFn(userId, "⛔ شما دسترسی لازم برای تایید این مرحله را ندارید.");
            }

            if (p.status === 'در انتظار تایید انبار') {
                return sendFn(chatId, "⚠️ جهت تایید انبار و الزام ثبت مقادیر واقعی (توزین نهایی)، لطفا حتما از طریق وب‌اپلیکیشن اقدام نمایید.");
            }
            if (p.status === 'در انتظار خروج (انتظامات)') {
                return sendFn(chatId, "⚠️ جهت ثبت مشخصات راننده و پلاک خودرو، لطفا حتما از طریق وب‌اپلیکیشن اقدام نمایید.");
            }

            const oldStatus = p.status;
            let stepName = '';

            if (p.status === 'در انتظار تایید مدیرعامل') {
                p.status = 'در انتظار مدیر کارخانه';
                stepName = 'مدیرعامل';
                p.approverCeo = user.fullName;
            } else if (p.status === 'در انتظار مدیر کارخانه') {
                p.status = 'در انتظار تایید انبار';
                stepName = 'مدیر کارخانه';
                p.approverFactory = user.fullName;
            } else if (p.status === 'در انتظار تایید نهایی مدیر کارخانه') {
                p.status = 'خارج شده (بایگانی)';
                p.exitTime = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
                stepName = 'تایید نهایی مدیر کارخانه (خروج کالا)';
                p.approverFactoryFinal = user.fullName;
                // Note: Customer WhatsApp with proforma image is now sent automatically via notifyExitPermitStep
            }
            
            saveDb(db);
            sendFn(chatId, `✅ مجوز #${p.permitNumber} تایید شد.`);

            if (stepName) {
                await notifyExitPermitStep(p, platform, chatId, sendPhotoFn, db, stepName);
            }
        }
        return;
    }

    if (data.startsWith('REJ_EXIT_')) {
        const id = data.replace('REJ_EXIT_', '');
        const p = db.exitPermits.find(x => x.id === id);
        if (p) {
            let canReject = false;
            if (p.status === 'در انتظار تایید مدیرعامل' && ['ceo', 'admin'].includes(user.role)) canReject = true;
            else if (p.status === 'در انتظار مدیر کارخانه' && ['factory_manager', 'admin'].includes(user.role)) canReject = true;
            else if (p.status === 'در انتظار تایید انبار' && ['warehouse_keeper', 'admin'].includes(user.role)) canReject = true;
            else if (p.status === 'در انتظار خروج (انتظامات)' && ['security_head', 'security_guard', 'admin'].includes(user.role)) canReject = true;
            else if (p.status === 'در انتظار تایید نهایی مدیر کارخانه' && ['factory_manager', 'admin'].includes(user.role)) canReject = true;

            if (!canReject) {
                return sendFn(userId, "⛔ شما دسترسی لازم برای رد این مرحله را ندارید.");
            }

            p.status = 'رد شده';
            saveDb(db);
            sendFn(chatId, `❌ مجوز #${p.permitNumber} رد شد.`);
        }
        return;
    }

    // --- WAREHOUSE ACTIONS ---
    if (data === 'ACT_WH_NEW_BIJAK') {
        session.data.targetType = 'WH_BIJAK'; // Context for Company Select
        
        const companies = [...new Set((db.warehouseTransactions||[]).map(o=>o.company).filter(Boolean))];
        if (companies.length === 0 && db.settings.companyNames) companies.push(...db.settings.companyNames);
        
        if (companies.length === 0) {
             session.state = 'WH_BIJAK_COUNT';
             return sendFn(chatId, "تعداد کالا را وارد کنید:");
        }

        const buttons = companies.map(c => [{ text: c, callback_data: `SEL_COMP_BIJAK_${c}` }]);
        buttons.push([{ text: '🔙 بازگشت', callback_data: 'MENU_WH' }]);
        return sendFn(chatId, "🏢 شرکت صادرکننده بیجک را انتخاب کنید:", { reply_markup: { inline_keyboard: buttons } });
    }

    if (data.startsWith('SEL_COMP_BIJAK_')) {
        session.data.company = data.replace('SEL_COMP_BIJAK_', '');
        session.state = 'WH_BIJAK_COUNT';
        return sendFn(chatId, `🏢 شرکت: ${session.data.company}\n🔢 تعداد کالا را وارد کنید:`);
    }

    if (data === 'ACT_WH_CARTABLE') {
        const pendingBijaks = (db.warehouseTransactions || []).filter(t => t.type === 'OUT' && t.status === 'PENDING');
        
        if (pendingBijaks.length === 0) return sendFn(chatId, "✅ کارتابل انبار خالی است.");

        // Only Admin or CEO (or Managers with access) can approve via bot ideally, 
        // but here we allow basic check if user role fits (Admin/CEO) or if we want open access for ease.
        // Assuming Admin/CEO role check:
        const canApprove = ['admin', 'ceo', 'manager'].includes(user.role);
        
        for (const tx of pendingBijaks) {
            const caption = `📦 *بیجک انبار #${tx.number}*\n📅 ${toShamsiFull(tx.date)}\n🏢 ${tx.company}\n👤 گیرنده: ${tx.recipientName}\n🔢 اقلام: ${tx.items.length} ردیف`;
            const kb = canApprove ? {
                inline_keyboard: [
                    [
                        { text: '✅ تایید نهایی', callback_data: `APP_WH_${tx.id}` },
                        { text: '❌ رد', callback_data: `REJ_WH_${tx.id}` }
                    ]
                ]
            } : undefined;
            await sendFn(chatId, caption, { reply_markup: kb });
        }
        return;
    }

    if (data.startsWith('APP_WH_')) {
        const id = data.replace('APP_WH_', '');
        const tx = db.warehouseTransactions.find(t => t.id === id);
        if (tx) {
            tx.status = 'APPROVED';
            tx.approvedBy = user.fullName + ' (Bot)';
            saveDb(db);
            sendFn(chatId, `✅ بیجک #${tx.number} تایید نهایی شد.`);
            notifyWarehouseBijak(tx, db, 'تایید نهایی').catch(e => console.error("Bot Bijak Notify Error:", e));
        }
        return;
    }

    if (data.startsWith('REJ_WH_')) {
        const id = data.replace('REJ_WH_', '');
        const tx = db.warehouseTransactions.find(t => t.id === id);
        if (tx) {
            tx.status = 'REJECTED';
            tx.rejectedBy = user.fullName + ' (Bot)';
            saveDb(db);
            sendFn(chatId, `❌ بیجک #${tx.number} رد شد.`);
        }
        return;
    }

    // --- UNION EXIT CALLBACK HANDLERS ---
    if (data === 'ACT_UNION_EXIT_FLOW') {
        const unionBotUser = isUnionExitBotUser(db, chatId, userId || chatId);
        if (!unionBotUser) {
            return sendFn(chatId, "⛔ شما دسترسی ثبت خروج اتحادیه را ندارید.");
        }
        
        session.state = 'UNION_EXIT_COMPANY';
        session.data = {
            buyerName: '',
            nationalCode: '',
            mobile: '',
            address: '',
            guildId: '',
            itemName: '',
            itemId: '',
            quantity: 0,
            weight: 0
        };

        const companies = Array.isArray(unionBotUser.allowedCompanies) ? unionBotUser.allowedCompanies : ['*'];
        let allowedCompanies = [];
        if (companies.includes('*')) {
            allowedCompanies = db.settings.companyNames || (db.settings.companies || []).map(c => c.name) || [];
        } else {
            allowedCompanies = companies;
        }

        if (allowedCompanies.length === 0) {
            session.state = 'IDLE';
            return sendFn(chatId, "⚠️ هیچ شرکت مجاز یا تعریف‌شده‌ای برای دسترسی شما یافت نشد.");
        }

        if (allowedCompanies.length === 1) {
            session.data.company = allowedCompanies[0];
            session.state = 'UNION_EXIT_BUYER';
            return sendFn(chatId, `🏢 شرکت: ${allowedCompanies[0]}\n\n👤 لطفاً نام خریدار را وارد کنید:`);
        }

        const buttons = allowedCompanies.map(c => [{ text: c, callback_data: `SEL_UNION_CO_${c}` }]);
        buttons.push([{ text: '🔙 بازگشت', callback_data: 'GUEST_MAIN' }]);
        return sendFn(chatId, "🏢 لطفاً شرکت صادرکننده را انتخاب کنید:", { reply_markup: { inline_keyboard: buttons } });
    }

    if (data.startsWith('SEL_UNION_CO_')) {
        const unionBotUser = isUnionExitBotUser(db, chatId, userId || chatId);
        if (!unionBotUser) return;
        session.data.company = data.replace('SEL_UNION_CO_', '');
        session.state = 'UNION_EXIT_BUYER';
        return sendFn(chatId, `🏢 شرکت انتخاب شده: ${session.data.company}\n\n👤 لطفاً نام خریدار را وارد کنید:`);
    }

    if (data.startsWith('SEL_UNION_ITEM_')) {
        const unionBotUser = isUnionExitBotUser(db, chatId, userId || chatId);
        if (!unionBotUser) return;
        const itemId = data.replace('SEL_UNION_ITEM_', '');
        const items = Array.isArray(db.warehouseItems) ? db.warehouseItems : [];
        const item = items.find(it => it.id === itemId);
        if (!item) {
            return sendFn(chatId, "❌ کالای مورد نظر یافت نشد. لطفاً مجدداً جستجو کنید یا نام کالا را بنویسید:");
        }
        session.data.itemId = item.id;
        session.data.itemName = item.name;
        session.state = 'UNION_EXIT_QTY';
        return sendFn(chatId, `📦 کالای انتخاب شده: ${item.name}\n\n🔢 تعداد کالا را وارد کنید:`);
    }

    if (data === 'SUBMIT_UNION_EXIT') {
        const unionBotUser = isUnionExitBotUser(db, chatId, userId || chatId);
        if (!unionBotUser) {
            return sendFn(chatId, "⛔ شما دسترسی لازم برای این کار را ندارید.");
        }
        
        const company = session.data.company;
        let minStart = 1000;
        if (db.settings.activeFiscalYearId && company) {
            const year = (db.settings.fiscalYears || []).find(y => y.id === db.settings.activeFiscalYearId);
            if (year && year.companySequences && year.companySequences[company]) {
                minStart = year.companySequences[company].startBijakNumber || 1000;
            }
        }
        let nextSeq = utils.findNextGapNumber(db.warehouseTransactions, company, 'number', minStart);
        while (utils.checkForDuplicate(db.warehouseTransactions, 'number', nextSeq, 'company', company)) {
            nextSeq++;
        }

        const tx = {
            id: generateUUID(),
            type: 'OUT',
            date: getTehranDateString(),
            company: company,
            number: nextSeq,
            recipientName: session.data.buyerName,
            items: [{
                itemId: session.data.itemId || 'bot_gen',
                itemName: session.data.itemName,
                quantity: session.data.quantity,
                weight: session.data.weight || 0,
                unitPrice: 0
            }],
            isUnionExit: true,
            unionExitDetails: {
                buyerName: session.data.buyerName,
                nationalCode: session.data.nationalCode || '0',
                mobile: session.data.mobile || '0',
                address: session.data.address || '0',
                guildId: session.data.guildId || '0'
            },
            createdAt: Date.now(),
            createdBy: (unionBotUser.name || 'کاربر ربات') + ' (Bot)',
            status: 'PENDING'
        };

        if(!db.warehouseTransactions) db.warehouseTransactions = [];
        db.warehouseTransactions.unshift(tx);
        saveDb(db);
        session.state = 'IDLE';

        await sendFn(chatId, `✅ حواله خروج اتحادیه پیش‌نویس #${nextSeq} با موفقیت ثبت شد و در انتظار تایید نهایی انبار قرار گرفت.`);
        
        // Notify managers/wh keeper
        notifyWarehouseBijak(tx, db, 'ثبت اولیه').catch(e => console.error("Bot Bijak Notify Error:", e));

        // Generate and send PDF
        try {
            await sendPdf(tx, 'BIJAK', chatId, sendFn, sendDocFn);
        } catch (e) {
            console.error("Error generating PDF for new union exit:", e);
        }
        return;
    }

    if (data === 'CANCEL_UNION_EXIT') {
        session.state = 'IDLE';
        session.data = {};
        return sendFn(chatId, "❌ درخواست خروج اتحادیه لغو شد.", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💎 خروج اتحادیه جدید', callback_data: 'ACT_UNION_EXIT_FLOW' }]
                ]
            }
        });
    }

    // --- WAREHOUSE STOCK REPORT ---
    if (data === 'WH_RPT_DISPATCH_PROMPT') {
        const kb = [
            [{ text: '📅 گزارش امروز', callback_data: 'WH_RPT_DISPATCH_TODAY' }],
            [{ text: '📅 گزارش هفته جاری', callback_data: 'WH_RPT_DISPATCH_WEEK' }],
            [{ text: '📅 گزارش ماه جاری', callback_data: 'WH_RPT_DISPATCH_MONTH' }],
            [{ text: '📋 تمام بیجک‌ها', callback_data: 'WH_RPT_DISPATCH_ALL' }],
            [{ text: '🔙 بازگشت', callback_data: 'MENU_WH' }]
        ];
        return sendFn(chatId, "بازه زمانی گزارش خروج را انتخاب کنید:", { reply_markup: { inline_keyboard: kb } });
    }

    if (data.startsWith('WH_RPT_DISPATCH_') && data !== 'WH_RPT_DISPATCH_PROMPT') {
        const rangeType = data.replace('WH_RPT_DISPATCH_', '');
        await sendFn(chatId, "⏳ در حال استخراج و تولید گزارش خروج (PDF و Excel)...");
        
        try {
            const txs = Array.isArray(db.warehouseTransactions) ? db.warehouseTransactions : [];
            let outTxs = txs.filter(t => t.type === 'OUT');
            
            let titleRange = 'تمام دوره‌ها';
            
            if (rangeType === 'TODAY') {
                const todayStr = getTehranDateString(); 
                outTxs = outTxs.filter(t => t.date && t.date.startsWith(todayStr));
                titleRange = 'امروز';
            } else if (rangeType === 'WEEK') {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                outTxs = outTxs.filter(t => t.date && new Date(t.date) >= weekAgo);
                titleRange = 'هفته جاری';
            } else if (rangeType === 'MONTH') {
                const monthAgo = new Date();
                monthAgo.setDate(monthAgo.getDate() - 30);
                outTxs = outTxs.filter(t => t.date && new Date(t.date) >= monthAgo);
                titleRange = 'ماه جاری';
            }

            outTxs.sort((a,b) => new Date(b.date) - new Date(a.date));

            const columns = ["ردیف", "تاریخ", "شماره", "شرکت", "کالا", "تعداد", "وزن", "گیرنده", "راننده", "پلاک", "توضیحات"];
            const rows = [];
            
            let rowIdx = 1;
            outTxs.forEach(tx => {
                if (tx.items && tx.items.length > 0) {
                    tx.items.forEach(item => {
                        let fDate = '-';
                        try {
                            if (tx.date) fDate = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(tx.date));
                        } catch(e){}
                        rows.push([
                            rowIdx++,
                            fDate,
                            tx.number || '-',
                            tx.company || '-',
                            item.itemName || '-',
                            item.quantity || '0',
                            item.weight || '0',
                            tx.recipientName || '-',
                            tx.driverName || '-',
                            tx.plateNumber || '-',
                            tx.description || '-'
                        ]);
                    });
                }
            });

            if (rows.length === 0) {
                return sendFn(chatId, `هیچ بیجک خروجی در بازه "${titleRange}" یافت نشد.`);
            }

            const title = `گزارش خروج کالا (بیجک‌ها) - ${titleRange}`;
            
            // 1. Generate PDF
            const pdfBuffer = await Renderer.generateReportPDF(title, columns, rows, true);
            const pdfFilename = `Dispatch_Report_${rangeType}_${Date.now()}.pdf`;
            await sendDocFn(chatId, pdfBuffer, pdfFilename, `📄 فایل PDF گزارش خروج (${titleRange})\nتعداد رکورد: ${rows.length}`);

            // 2. Generate Excel
            const excelBuffer = generateExcelBuffer(columns, rows, "خروج کالا");
            const excelFilename = `Dispatch_Report_${rangeType}_${Date.now()}.xlsx`;
            await sendDocFn(chatId, excelBuffer, excelFilename, `📊 فایل Excel گزارش خروج (${titleRange})`);
            
        } catch (e) {
            console.error("Dispatch Report Gen Error:", e);
            return sendFn(chatId, "❌ خطا در تولید گزارش.");
        }
        return;
    }

    if (data === 'WH_RPT_STOCK') {
        await sendFn(chatId, "⏳ در حال محاسبه موجودی و تولید PDF...");
        try {
            const items = Array.isArray(db.warehouseItems) ? db.warehouseItems : [];
            const txs = Array.isArray(db.warehouseTransactions) ? db.warehouseTransactions : [];
            const companies = [...new Set(txs.map(t => t.company).filter(Boolean))];
            
            const reportData = companies.map(company => {
                const companyItems = items.map(catItem => {
                    let qty = 0; let weight = 0;
                    txs.filter(t => t.company === company && t.status !== 'REJECTED').forEach(t => {
                        if (Array.isArray(t.items)) {
                            t.items.forEach(ti => {
                                if (ti.itemId === catItem.id) {
                                    if (t.type === 'IN') { qty += (ti.quantity || 0); weight += (ti.weight || 0); }
                                    else { qty -= (ti.quantity || 0); weight -= (ti.weight || 0); }
                                }
                            });
                        }
                    });
                    const cap = catItem.containerCapacity || 0;
                    const containerCount = (cap > 0 && qty > 0) ? (qty / cap) : 0;
                    return { name: catItem.name, quantity: qty, weight: weight, containerCount };
                }).filter(i => Math.abs(i.quantity) > 0.001 || Math.abs(i.weight) > 0.001);
                return { company, items: companyItems };
            });

            // Generate HTML designed for A4 Landscape
            let html = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><style>
                @page { size: A4 landscape; margin: 0; }
                body { font-family: 'Vazirmatn', sans-serif; background: white; margin: 0; }
            </style></head><body>
            <div style="width: 290mm; min-height: 200mm; direction: rtl; padding: 5mm; box-sizing: border-box; margin: 0 auto; color: black;">
                <div style="text-align: center; background-color: #fde047; border: 2px solid black; padding: 8px; margin-bottom: 10px; font-weight: 900; font-size: 20px;">موجودی کلی انبارها</div>
                <table style="width: 100%; border-collapse: collapse; border: 2px solid black; table-layout: fixed;">
                    <thead>
                        <tr>
                            ${reportData.map((group, index) => {
                                const headerColor = index === 0 ? '#d8b4fe' : index === 1 ? '#fdba74' : '#93c5fd';
                                return `
                                    <th style="border-left: 2px solid black; vertical-align: top; padding: 0;">
                                        <div style="background-color: ${headerColor}; color: black; padding: 8px; border-bottom: 2px solid black; font-size: 14px; font-weight: 900;">${group.company}</div>
                                        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                            <thead>
                                                <tr style="background-color: #f3f4f6;">
                                                    <th style="width: 40%; border-left: 1px solid black; border-bottom: 1px solid black; padding: 4px;">نخ / کالا</th>
                                                    <th style="width: 20%; border-left: 1px solid black; border-bottom: 1px solid black; padding: 4px;">کارتن</th>
                                                    <th style="width: 20%; border-left: 1px solid black; border-bottom: 1px solid black; padding: 4px;">وزن</th>
                                                    <th style="width: 20%; border-bottom: 1px solid black; padding: 4px;">کانتینر</th>
                                                </tr>
                                            </thead>
                                        </table>
                                    </th>
                                `;
                            }).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            ${reportData.map((group, index) => {
                                return `
                                    <td style="border-left: 2px solid black; vertical-align: top; padding: 0;">
                                        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                            <tbody>
                                                ${group.items.map((item, i) => `
                                                    <tr style="border-bottom: 1px solid #d1d5db;">
                                                        <td style="width: 40%; border-left: 1px solid black; padding: 4px; text-align: right; font-weight: bold; overflow: hidden; white-space: nowrap;">${item.name}</td>
                                                        <td style="width: 20%; border-left: 1px solid black; padding: 4px; text-align: center; font-family: monospace; font-weight: bold;">${item.quantity.toFixed(2)}</td>
                                                        <td style="width: 20%; border-left: 1px solid black; padding: 4px; text-align: center; font-family: monospace;">${item.weight > 0 ? item.weight.toFixed(2) : '0.00'}</td>
                                                        <td style="width: 20%; padding: 4px; text-align: center; font-family: monospace; color: #6b7280;">
                                                            ${item.containerCount > 0 ? item.containerCount.toFixed(2) : '-'}
                                                        </td>
                                                    </tr>
                                                `).join('')}
                                                ${group.items.length > 0 ? `
                                                    <tr style="background-color: #f9fafb; border-top: 2px solid black;">
                                                        <td style="width: 40%; border-left: 1px solid black; padding: 6px; text-align: right; font-weight: 900; font-size: 12px;">جمع کل</td>
                                                        <td style="width: 20%; border-left: 1px solid black; padding: 6px; text-align: center; font-weight: 900; font-size: 12px; border-bottom: 2px double black;">
                                                            ${group.items.reduce((sum, i) => sum + (i.quantity || 0), 0).toFixed(2)}
                                                        </td>
                                                        <td style="width: 20%; border-left: 1px solid black; padding: 6px; text-align: center; font-weight: 900; font-size: 12px; border-bottom: 2px double black;">
                                                        ${group.items.reduce((sum, i) => sum + (i.weight || 0), 0).toFixed(2)}
                                                    </td>
                                                    <td style="width: 20%; padding: 6px; text-align: center;"></td>
                                                </tr>
                                            ` : ''}
                                            ${group.items.length === 0 ? `<tr><td colspan="4" style="padding: 20px; text-align: center; color: #9ca3af;">موجودی صفر</td></tr>` : ''}
                                        </tbody>
                                    </table>
                                </td>
                            `;
                        }).join('')}
                    </tr>
                </tbody>
            </table>
                <div style="text-align: center; background-color: #fde047; border: 2px solid black; border-top: none; padding: 4px; font-weight: bold; font-size: 12px;">
                    گزارش سیستم مدیریت انبار - تاریخ چاپ: ${new Date().toLocaleDateString('fa-IR')}
                </div>
            </div>
            </body></html>`;

            const pdfBuffer = await Renderer.generatePdfBuffer(html, { landscape: true });
            if (pdfBuffer && pdfBuffer.length > 100) {
                await sendDocFn(chatId, pdfBuffer, `Stock_Report_${Date.now()}.pdf`, 'گزارش موجودی انبار');
            } else {
                await sendFn(chatId, "⚠️ خطا در تولید PDF.\n(خروجی خالی)");
            }
        } catch (e) {
            console.error("Stock Report Error:", e);
            await sendFn(chatId, `⚠️ خطا در تولید گزارش: ${e.message}`);
        }
        return;
    }

    // --- ARCHIVE & SEARCH LOGIC (GENERIC) ---
    const ARCHIVE_TYPES = {
        'ACT_ARCHIVE_PAY': 'PAYMENT',
        'ACT_ARCHIVE_EXIT': 'EXIT',
        'ACT_ARCHIVE_WH_OUT': 'WH_OUT',
        'ACT_ARCHIVE_WH_IN': 'WH_IN'
    };

    if (ARCHIVE_TYPES[data]) {
        const type = ARCHIVE_TYPES[data];
        session.data.targetType = type;
        
        let companies = [];
        if (type === 'PAYMENT') companies = [...new Set((db.orders||[]).map(o=>o.payingCompany).filter(Boolean))];
        else if (type === 'EXIT') companies = [...new Set((db.exitPermits||[]).map(o=>o.company).filter(Boolean))];
        else companies = [...new Set((db.warehouseTransactions||[]).map(o=>o.company).filter(Boolean))];

        if (companies.length === 0) return sendFn(chatId, "❌ داده‌ای برای جستجو یافت نشد.");
        
        const buttons = companies.map(c => [{ text: c, callback_data: `ARC_SEL_COMP_${c}` }]);
        buttons.push([{ text: '🔙 بازگشت', callback_data: 'MENU_MAIN' }]);
        
        return sendFn(chatId, `🏢 شرکت را انتخاب کنید (${type}):`, { reply_markup: { inline_keyboard: buttons } });
    }

    if (data.startsWith('ARC_SEL_COMP_')) {
        const company = data.replace('ARC_SEL_COMP_', '');
        session.data.company = company;
        const type = session.data.targetType || 'PAYMENT';

        let sourceList = [];
        if (type === 'PAYMENT') sourceList = (db.orders||[]).filter(o => o.payingCompany === company);
        else if (type === 'EXIT') sourceList = (db.exitPermits||[]).filter(o => o.company === company);
        else sourceList = (db.warehouseTransactions||[]).filter(o => o.company === company);

        const years = getAvailableYears(sourceList);
        
        const buttons = [];
        for(let i=0; i<years.length; i+=3) {
            const row = years.slice(i, i+3).map(y => ({ text: y, callback_data: `ARC_SEL_YEAR_${y}` }));
            buttons.push(row);
        }
        buttons.push([{ text: '📅 جستجوی روز دقیق', callback_data: 'ARCHIVE_INPUT_DATE' }]);
        buttons.push([{ text: '🔙 بازگشت', callback_data: 'MENU_MAIN' }]);

        return sendFn(chatId, `🗓 سال را انتخاب کنید (${company}):`, { reply_markup: { inline_keyboard: buttons } });
    }

    if (data === 'ARCHIVE_INPUT_DATE') {
        session.state = 'ARCHIVE_WAIT_DATE';
        return sendFn(chatId, "⌨️ تاریخ دقیق را وارد کنید (yyyy/mm/dd):");
    }

    if (data.startsWith('ARC_SEL_YEAR_')) {
        const year = data.replace('ARC_SEL_YEAR_', '');
        session.data.year = year;
        const months = [
            { text: 'فروردین', id: '01' }, { text: 'اردیبهشت', id: '02' }, { text: 'خرداد', id: '03' },
            { text: 'تیر', id: '04' }, { text: 'مرداد', id: '05' }, { text: 'شهریور', id: '06' },
            { text: 'مهر', id: '07' }, { text: 'آبان', id: '08' }, { text: 'آذر', id: '09' },
            { text: 'دی', id: '10' }, { text: 'بهمن', id: '11' }, { text: 'اسفند', id: '12' }
        ];
        const buttons = [];
        for(let i=0; i<months.length; i+=3) {
            const row = months.slice(i, i+3).map(m => ({ text: m.text, callback_data: `ARC_EXEC_MONTH_${m.id}` }));
            buttons.push(row);
        }
        buttons.push([{ text: '🔙 بازگشت', callback_data: 'MENU_MAIN' }]);
        return sendFn(chatId, `🗓 ماه را انتخاب کنید (${year}):`, { reply_markup: { inline_keyboard: buttons } });
    }

    if (data.startsWith('ARC_EXEC_MONTH_')) {
        const month = data.replace('ARC_EXEC_MONTH_', '');
        const targetDateStr = `${session.data.year}/${month}`;
        await sendFn(chatId, `⏳ جستجو در ${targetDateStr}...`);
        await searchAndSendResults(db, session.data.company, targetDateStr, 'MONTH', session.data.targetType, platform, chatId, sendFn, sendPhotoFn);
        return;
    }

    // --- PDF GENERATION ---
    if (data.startsWith('GEN_PDF_ORDER_')) {
        const id = data.replace('GEN_PDF_ORDER_', '');
        const item = db.orders.find(o => o.id === id);
        if(item) await sendPdf(item, 'PAYMENT', chatId, sendFn, sendDocFn);
    }
    if (data.startsWith('GEN_PDF_EXIT_')) {
        const id = data.replace('GEN_PDF_EXIT_', '');
        const item = db.exitPermits.find(o => o.id === id);
        if(item) await sendPdf(item, 'EXIT', chatId, sendFn, sendDocFn);
    }
    if (data.startsWith('GEN_PDF_BIJAK_')) {
        const id = data.replace('GEN_PDF_BIJAK_', '');
        const item = db.warehouseTransactions.find(o => o.id === id);
        if(item) await sendPdf(item, 'BIJAK', chatId, sendFn, sendDocFn);
    }
};

const sendPdf = async (item, type, chatId, sendFn, sendDocFn) => {
    await sendFn(chatId, "⏳ در حال تولید PDF...");
    try {
        let pdf = null;
        let filename = 'document.pdf';
        
        if (type === 'PAYMENT') {
            pdf = await Renderer.generateVoucherPDF(item);
            filename = `Voucher_${item.trackingNumber}.pdf`;
        } else if (type === 'EXIT') {
            pdf = await Renderer.generateExitPermitPDF(item);
            filename = `Permit_${item.permitNumber}.pdf`;
        } else if (type === 'BIJAK') {
            pdf = await Renderer.generateBijakPDF(item);
            filename = `Bijak_${item.number}.pdf`;
        }

        if (pdf && pdf.length > 100) {
            await sendDocFn(chatId, pdf, filename, 'فایل PDF سند');
        } else {
            await sendFn(chatId, "⚠️ خطا در تولید PDF: خروجی خالی است.");
        }
    } catch (e) {
        console.error("PDF Error:", e);
        // Provide the actual error message to the user for better diagnostics
        await sendFn(chatId, `⚠️ خطا در تولید PDF: ${e.message}`);
    }
};

// Helper to extract distinct, sanitized group destination IDs without duplicates
const extractUniqueGroupIds = (primaryId, secondaryId, fallbackId) => {
    const candidateIds = [
        primaryId,
        secondaryId,
        (!primaryId && !secondaryId ? fallbackId : null)
    ].filter(Boolean);
    const uniqueIds = new Set();
    for (const raw of candidateIds) {
        if (!raw) continue;
        const normalized = normalizeChannelId(raw);
        const clean = sanitizeGroupId(normalized);
        if (clean) uniqueIds.add(clean);
    }
    return Array.from(uniqueIds);
};

// --- MEETING NOTIFICATIONS ---

export const notifyMeetingAnnouncement = async (meeting, db) => {
    const dedupeKey = `MEETING_ANN_${meeting.id}`;
    if (isDuplicateNotification(dedupeKey, 900000)) return; // 15-minute deduplication window
    
    console.log(`>>> Meeting Announcement triggered for ${meeting.meetingNumber}`);
    const s = db.settings;
    if (!s) {
        console.error("No settings found in DB for meeting announcement");
        return;
    }

    const attendeesList = (meeting.attendees || []).map(a => `• ${a.fullName} (${a.role || 'عضو'})`).join('\n');
    const message = `✨️ اعلان برگزاری جلسه تولید؛\n\n⚜️ با عرض سلام و احترام،\n\nجلسه تولید شماره *${meeting.meetingNumber}* روز ${meeting.date} راس ساعت *${meeting.time || '۱۲:۰۰'}* در ${meeting.location || 'محل دائمی جلسات کارخانه'}، برگزار خواهد شد.\n\nرئیس جلسه:\n${meeting.chairman || 'سیّد علی احمدی'}\nدبیر جلسه:\n${meeting.secretary || 'پریسا مرادی'}\n\n🔆 اعضای حاضر / مدعوین:\n${attendeesList || 'موردی ثبت نشده است'}`;

    let announcementImg = null;
    try {
        announcementImg = await Renderer.generateMeetingAnnouncementImage(meeting);
    } catch(e) { console.error("Error generating meeting image", e); }

    // Send to unique Telegram groups
    const teleIds = extractUniqueGroupIds(
        s.botMeetingAnnouncementTelegramId,
        s.botMeetingAnnouncementSecondGroupIdTele,
        s.botMeetingAnnouncementGroupId || s.botAccountingGroupIdTele
    );
    if (teleIds.length > 0 && s.telegramBotToken) {
        import('./telegram.js').then(m => {
            for (const cleanId of teleIds) {
                console.log(`Sending meeting announcement to Telegram: ${cleanId}`);
                if (announcementImg) m.sendBotPhoto(cleanId, announcementImg, message).catch(e => console.error("Tele meeting photo fail:", e));
                else m.sendMessage(cleanId, message).catch(e => console.error("Tele meeting msg fail:", e));
            }
        }).catch(e => console.error("Tele import fail:", e));
    } else {
        console.warn("No Telegram ID found for meeting announcement");
    }

    // Send to unique Bale groups
    const baleIds = extractUniqueGroupIds(
        s.botMeetingAnnouncementBaleId,
        s.botMeetingAnnouncementSecondGroupIdBale,
        s.botMeetingAnnouncementGroupId || s.botAccountingGroupIdBale
    );
    if (baleIds.length > 0 && s.baleBotToken) {
        import('./bale.js').then(m => {
            for (const cleanId of baleIds) {
                console.log(`Sending meeting announcement to Bale: ${cleanId}`);
                if (announcementImg) m.sendBotPhoto(cleanId, announcementImg, message).catch(e => console.error("Bale meeting photo fail:", e));
                else m.sendMessage(cleanId, message).catch(e => console.error("Bale meeting msg fail:", e));
            }
        }).catch(e => console.error("Bale import fail:", e));
    } else {
        console.warn("No Bale ID found for meeting announcement");
    }

    // Send to unique WhatsApp groups
    const waIds = extractUniqueGroupIds(
        s.botMeetingAnnouncementWhatsAppId,
        s.botMeetingAnnouncementSecondGroupIdWhatsApp,
        s.botMeetingAnnouncementGroupId
    );
    if (waIds.length > 0 && s.whatsappEnabled !== false) {
        import('./whatsapp.js').then(m => {
            for (const cleanId of waIds) {
                console.log(`Sending meeting announcement to WhatsApp: ${cleanId}`);
                if (announcementImg) {
                    m.sendMessage(cleanId, message, {
                        data: announcementImg.toString('base64'),
                        mimeType: 'image/png',
                        filename: `meeting_${meeting.meetingNumber || meeting.id}.png`
                    }).catch(e => console.error("WA meeting fail:", e));
                } else {
                    m.sendMessage(cleanId, message).catch(e => console.error("WA meeting fail:", e));
                }
            }
        }).catch(e => console.error("WA import fail:", e));
    }
};

export const notifyMeetingMinutes = async (meeting, db) => {
    const dedupeKey = `MEETING_MIN_${meeting.id}`;
    if (isDuplicateNotification(dedupeKey, 900000)) return; // 15-minute deduplication window
    
    const s = db.settings;
    if (!s) return;

    const generateResolutionsText = (platform) => {
        return (meeting.items || []).map((item, idx) => {
            let text = `${idx + 1}. ${item.description}`;
            if (item.responsiblePerson) {
                const user = (db.users || []).find(u => u.fullName === item.responsiblePerson || u.username === item.responsiblePerson);
                if (user) {
                    if (platform === 'telegram' && user.telegramChatId) {
                        text += ` (👤 مسئول: [${user.fullName}](tg://user?id=${user.telegramChatId}))`;
                    } else if (platform === 'bale' && user.baleChatId) {
                        // Bale sometimes supports tagging with [name](id) but the deep link tg:// is also common
                        // We will use the common approach first
                        text += ` (👤 مسئول: [${user.fullName}](tg://user?id=${user.baleChatId}))`;
                    } else {
                        text += ` (👤 مسئول: ${item.responsiblePerson})`;
                    }
                } else {
                    text += ` (👤 مسئول: ${item.responsiblePerson})`;
                }
            }
            if (item.duration) text += ` [⏳ مهلت: ${item.duration}]`;
            return text;
        }).join('\n');
    };

    const generateFullMessage = (platform) => {
        let resolutionsText = generateResolutionsText(platform);
        if (resolutionsText.length > 900) {
            resolutionsText = resolutionsText.substring(0, 900) + '... (ادامه در فایل پیوست)';
        }
        return `🏁 *صورتجلسه نهایی و مصوبات تایید شده* 🏁\n\n📄 شماره: *${meeting.meetingNumber}*\n📅 تاریخ: *${meeting.date}*\n\n✅ این صورتجلسه به تایید الکترونیکی تمامی حاضرین رسیده است.\n\n📝 *لیست مصوبات و تصمیمات*:\n${resolutionsText}\n\n📎 فایل PDF پیوست جهت بایگانی ارسال شد.`;
    };

    // Extract unique target groups for each platform
    const teleIds = extractUniqueGroupIds(
        s.botMeetingMinutesTelegramId,
        s.botMeetingMinutesSecondGroupIdTele,
        s.botMeetingMinutesGroupId
    );
    const baleIds = extractUniqueGroupIds(
        s.botMeetingMinutesBaleId,
        s.botMeetingMinutesSecondGroupIdBale,
        s.botMeetingMinutesGroupId
    );
    const waIds = extractUniqueGroupIds(
        s.botMeetingMinutesWhatsAppId,
        s.botMeetingMinutesSecondGroupIdWhatsApp,
        s.botMeetingMinutesGroupId
    );

    let pdfBuffer = null;
    const fileName = `Meeting_${meeting.meetingNumber}_Minutes.pdf`;
    try {
        pdfBuffer = await Renderer.generateMeetingMinutesPDF(meeting);
    } catch (err) {
        console.error("Meeting PDF Generation Error:", err);
    }

    // 1. Send to unique Telegram groups
    if (teleIds.length > 0 && s.telegramBotToken) {
        const msg = generateFullMessage('telegram');
        import('./telegram.js').then(m => {
            for (const cleanId of teleIds) {
                if (pdfBuffer) {
                    m.sendBotDocument(cleanId, pdfBuffer, fileName, msg, { parse_mode: 'Markdown' }).catch(e => console.error("Tele PDF fail:", e));
                } else {
                    m.sendMessage(cleanId, msg, { parse_mode: 'Markdown' }).catch(e => console.error("Tele text fail:", e));
                }
            }
        }).catch(e => console.error("Tele import fail:", e));
    }

    // 2. Send to unique Bale groups
    if (baleIds.length > 0 && s.baleBotToken) {
        const msg = generateFullMessage('bale');
        import('./bale.js').then(m => {
            for (const cleanId of baleIds) {
                if (pdfBuffer) {
                    m.sendBotDocument(cleanId, pdfBuffer, fileName, msg).catch(e => console.error("Bale PDF fail:", e));
                } else {
                    m.sendMessage(cleanId, msg).catch(e => console.error("Bale text fail:", e));
                }
            }
        }).catch(e => console.error("Bale import fail:", e));
    }

    // 3. Send to unique WhatsApp groups
    if (waIds.length > 0 && s.whatsappEnabled !== false) {
        const msg = generateFullMessage('whatsapp');
        import('./whatsapp.js').then(m => {
            for (const cleanId of waIds) {
                if (pdfBuffer) {
                    m.sendMessage(cleanId, msg, {
                        data: pdfBuffer.toString('base64'),
                        mimeType: 'application/pdf',
                        filename: fileName
                    }).catch(e => console.error("WA PDF fail:", e));
                } else {
                    m.sendMessage(cleanId, msg).catch(e => console.error("WA text fail:", e));
                }
            }
        }).catch(e => console.error("WA import fail:", e));
    }
};

export const notifyPurchaseRequestStep = async (p, platform, chatId, sendPhotoFn, db, stepName, eventType = 'STEP') => {
    try {
        const isEdit = eventType === 'EDIT';
        const isDelete = eventType === 'DELETE';
        
        const dedupeKey = `PURCHASE_${p.id}_${p.status}_${eventType}`;
        if (isDuplicateNotification(dedupeKey)) return;

        let header = isDelete ? `❌ *حذف شد: درخواست خرید*` : (isEdit ? `✏️ *ویرایش شد: درخواست خرید*` : `🛒 *درخواست خرید*`);
        let sayanStockText = '';
        if (p.sayanStockSummary) {
            sayanStockText = `\n🏭 *موجودی در انبار سایان:* ${p.sayanStockSummary}`;
        } else if (p.sayanStock !== undefined && p.sayanStock !== null) {
            sayanStockText = `\n🏭 *موجودی در انبار سایان:* ${p.sayanStock.toLocaleString('fa-IR')} ${p.unit || 'عدد'} ${p.sayanMatchedItem ? `(${p.sayanMatchedItem})` : ''}`;
        }
        const branchLabel = p.location === 'Tehran' ? '🏢 بازرگانی تهران' : (p.location === 'Factory' || p.location === 'Zanjan' ? '🏭 کارخانه زنجان' : 'تعیین در کارخانه');
        const caption = `${header}\n🔢 شماره: ${p.requestNumber || '-'}\n📅 تاریخ: ${p.date || '-'}\n📍 شاخه: ${branchLabel}\n👤 درخواست‌کننده: ${p.requester || '-'}\n📦 کالا: ${p.itemName || '-'}\n📂 گروه: ${p.category || '-'} - ${p.subCategory || '-'}\n🔢 مقدار: ${p.quantity} ${p.unit}\n📝 توضیحات: ${p.specifications || '-'}${sayanStockText}\n\n✅ *مرحله:* ${stepName}\n🔄 *وضعیت:* ${p.status}${isEdit ? '\n⚠️ *این پیام ویرایشی است*' : ''}`;
        
        if (chatId && sendPhotoFn) {
            const defaultLogo = path.join(process.cwd(), 'public', 'lepan-logo.png');
            sendPhotoFn(platform, chatId, defaultLogo, caption).catch(e => {});
        }

        const settings = db.settings || {};
        const telGroupId = sanitizeGroupId(settings.purchaseTelegramGroup);
        const baleGroupId = sanitizeGroupId(settings.purchaseBaleGroup);
        const waGroupId = settings.purchaseWhatsappGroup ? String(settings.purchaseWhatsappGroup).trim() : null;

        import('./telegram.js').then(m => {
            if (telGroupId && m.sendMessage) m.sendMessage(telGroupId, caption).catch(e=>{});
        }).catch(err => {});

        import('./bale.js').then(m => {
            if (baleGroupId && m.sendMessage) m.sendMessage(baleGroupId, caption).catch(e=>{});
        }).catch(err => {});

        import('./whatsapp.js').then(m => {
            if (waGroupId && m.sendMessage) m.sendMessage(waGroupId, caption).catch(e=>{});
        }).catch(err => {});
    } catch (e) {
        console.error('Error in notifyPurchase:', e);
    }
};

export const userHasLetterAccess = (user, letter, db) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'ceo' || user.canManageSecretariatSettings) return true;
    if (!user.canAccessSecretariat) return false;
    
    const companySettings = (db.secretariatSettings || []).find(s => s.companyId === letter.companyId);
    if (!companySettings) return true; // Default to true if not configured yet
    
    const tokens = letter.section === 'headquarters'
        ? companySettings.headquartersAccessTokens || []
        : companySettings.factoryAccessTokens || [];
    return tokens.includes(user.id);
};

export const notifySecretariatLetter = async (letter, db) => {
    try {
        const company = (db.settings?.companies || []).find(c => c.id === letter.companyId);
        const companyName = company ? company.name : 'نامشخص';
        const sectionName = letter.section === 'headquarters' ? 'دفتر مرکزی' : 'کارخانه';
        
        let userIdsToNotify = [];
        if (letter.referredTo && letter.referredTo.length > 0) {
            userIdsToNotify = [...letter.referredTo];
        } else {
            const companySettings = (db.secretariatSettings || []).find(s => s.companyId === letter.companyId);
            if (companySettings) {
                userIdsToNotify = letter.section === 'headquarters'
                    ? [...(companySettings.headquartersAccessTokens || [])]
                    : [...(companySettings.factoryAccessTokens || [])];
            }
        }
        
        // Also add signers if they are users and have not approved yet
        if (letter.signers && letter.signers.length > 0) {
            const signerUserIds = letter.signers.map(s => s.userId).filter(Boolean);
            for (const suid of signerUserIds) {
                if (!userIdsToNotify.includes(suid)) {
                    userIdsToNotify.push(suid);
                }
            }
        }
        
        // Filter out those who already approved
        userIdsToNotify = userIdsToNotify.filter(uid => !(letter.approvedBy || []).includes(uid));
        
        if (userIdsToNotify.length === 0) return;
        
        const text = `✉️ *اطلاعیه کارتابل دبیرخانه اداری*\n` +
                     `یک نامه اداری جدید منتظر بررسی یا امضای شماست:\n\n` +
                     `🏢 *شرکت:* ${companyName}\n` +
                     `📍 *بخش:* ${sectionName}\n` +
                     `🔢 *شماره نامه:* ${letter.letterNumber}\n` +
                     `📅 *تاریخ:* ${letter.date}\n` +
                     `👤 *فرستنده:* ${letter.sender}\n` +
                     `👥 *گیرنده:* ${letter.receiver}\n` +
                     `📝 *موضوع:* ${letter.subject}\n\n` +
                     `💡 جهت مشاهده و تایید واقعی، وارد سامانه شوید یا از دکمه‌های زیر در ربات استفاده کنید:`;
                     
        const inline_keyboard = [
            [
                { text: '📥 دریافت PDF', callback_data: `SEC_GET_PDF_${letter.id}` },
                { text: '📥 دریافت Word', callback_data: `SEC_GET_DOC_${letter.id}` }
            ],
            [{ text: '✍️ تایید و امضا', callback_data: `SEC_APPROVE_${letter.id}` }]
        ];
        
        // --- IN-APP NOTIFICATION ---
        const targetUsernames = userIdsToNotify.map(uid => db.users.find(u => u.id === uid)?.username).filter(Boolean);
        if (targetUsernames.length > 0) {
            if (!db.notifications) db.notifications = [];
            db.notifications.push({
                id: utils.generateUUID(),
                title: "نامه اداری جدید",
                body: `نامه با موضوع "${letter.subject}" منتظر بررسی یا امضای شماست.`,
                url: "/secretariat",
                targetRoles: null,
                targetUsernames: targetUsernames,
                excludeUsernames: null,
                createdAt: Date.now(),
                readBy: []
            });
            if (db.notifications.length > 2000) db.notifications = db.notifications.slice(-1000);
            dbManager.saveDb(db);
        }
        
        const baleModule = await import('./bale.js');
        const tgModule = await import('./telegram.js');
        
        for (const uid of userIdsToNotify) {
            const u = db.users.find(usr => usr.id === uid);
            if (!u) continue;
            
            if (u.telegramChatId) {
                try {
                    await tgModule.sendBotMessage(u.telegramChatId, text, { reply_markup: { inline_keyboard } });
                } catch(e) {
                    console.error(`Failed to notify ${u.fullName} via Telegram:`, e.message);
                }
            }
            if (u.baleChatId) {
                try {
                    await baleModule.sendBotMessage(u.baleChatId, text, { reply_markup: { inline_keyboard } });
                } catch(e) {
                    console.error(`Failed to notify ${u.fullName} via Bale:`, e.message);
                }
            }
        }
    } catch (err) {
        console.error("notifySecretariatLetter error:", err);
    }
};

export const sendTreasuryChequesReport = async (db, customTargets = null, selectedPlatforms = ['telegram', 'bale', 'whatsapp'], options = {}) => {
    const settings = db.settings || {};
    const { 
        attachPdf = (settings.chequeVaultAttachPdf ?? true), 
        attachExcel = (settings.chequeVaultAttachExcel ?? true),
        reportType = (settings.chequeVaultReportType || 'vault'), // 'vault' | 'returned' | 'at_bank' | 'all' | 'custom'
        sortBy = (settings.chequeVaultSortBy || 'dueDate'), // 'dueDate' | 'amount' | 'bankName' | 'drawerName'
        sortOrder = (settings.chequeVaultSortOrder || 'asc'), // 'asc' | 'desc'
        filterBank = '',
        filterDrawer = '',
        customCheques = null,
        title: customTitle = ''
    } = options;

    const platforms = Array.isArray(selectedPlatforms) && selectedPlatforms.length > 0 ? selectedPlatforms : ['telegram', 'bale', 'whatsapp'];

    // Collect and normalize targets
    let targets = [];
    if (customTargets) {
        if (Array.isArray(customTargets) && customTargets.length > 0) {
            customTargets.forEach(item => {
                if (!item) return;
                if (typeof item === 'object') {
                    const plat = item.platform || 'telegram';
                    const rawId = item.id || item.groupId || item.chatId;
                    if (rawId) {
                        String(rawId).split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean).forEach(singleId => {
                            targets.push({ platform: plat, id: singleId });
                        });
                    }
                } else if (typeof item === 'string') {
                    const trimmed = item.trim();
                    if (!trimmed) return;
                    if (trimmed.startsWith('wa_')) {
                        targets.push({ platform: 'whatsapp', id: trimmed.slice(3) });
                    } else if (/^(\+98|98|09)\d{9}$/.test(trimmed) || trimmed.includes('@c.us') || trimmed.includes('@g.us')) {
                        targets.push({ platform: 'whatsapp', id: trimmed });
                    } else {
                        platforms.forEach(p => {
                            if (p !== 'whatsapp') targets.push({ platform: p, id: trimmed });
                        });
                    }
                }
            });
        } else if (typeof customTargets === 'object') {
            // Support { telegram: '...', bale: '...', whatsapp: '...' }
            ['telegram', 'bale', 'whatsapp'].forEach(plat => {
                const val = customTargets[plat];
                if (val && typeof val === 'string' && val.trim()) {
                    val.split(/[,،;\n\r]+/).map(s => s.trim()).filter(Boolean).forEach(singleId => {
                        targets.push({ platform: plat, id: singleId });
                    });
                } else if (Array.isArray(val)) {
                    val.forEach(singleId => {
                        if (singleId && String(singleId).trim()) {
                            targets.push({ platform: plat, id: String(singleId).trim() });
                        }
                    });
                }
            });
        }
    }

    if (targets.length === 0) {
        // Resolve Telegram target independently
        const tgGroup = settings.chequeVaultTelegramGroupId || 
                        settings.botAccountingGroupIdTele || 
                        settings.botAccountingGroupId ||
                        settings.dailySalesTelegramGroupId || 
                        settings.botDailySalesGroupIdTele || 
                        settings.botDailySalesGroupId || 
                        settings.dailySalesGroupId || 
                        settings.salesGroupId || 
                        settings.telegramReportsGroupId || 
                        settings.telegramGroupId || 
                        settings.defaultWarehouseGroup ||
                        settings.exitPermitNotificationGroup ||
                        settings.exitPermitFirstGroupConfig?.telegramGroupId ||
                        settings.exitPermitSecondGroupConfig?.telegramGroupId ||
                        settings.exitPermitThirdGroupConfig?.telegramGroupId ||
                        settings.purchaseTelegramGroup ||
                        settings.productionTelegramGroupId ||
                        settings.productionTelegramGroupId2 ||
                        settings.botBijakGroupId ||
                        settings.dailyExitReportDedicatedTelegramId ||
                        settings.telegramAdminId ||
                        settings.telegramChatId;
        if (tgGroup) targets.push({ platform: 'telegram', id: String(tgGroup).trim() });

        // Resolve Bale target independently
        const baleGroup = settings.chequeVaultBaleGroupId || 
                          settings.botAccountingGroupIdBale ||
                          settings.dailySalesBaleGroupId || 
                          settings.botDailySalesGroupIdBale || 
                          settings.baleReportsGroupId || 
                          settings.baleGroupId || 
                          settings.dailyExitReportDedicatedBaleId ||
                          settings.exitPermitFirstGroupConfig?.baleGroupId ||
                          settings.exitPermitSecondGroupConfig?.baleGroupId ||
                          settings.exitPermitThirdGroupConfig?.baleGroupId ||
                          settings.purchaseBaleGroup ||
                          settings.productionBaleGroupId ||
                          settings.productionBaleGroupId2 ||
                          settings.botBijakGroupIdBale ||
                          settings.baleChatId;
        if (baleGroup) targets.push({ platform: 'bale', id: String(baleGroup).trim() });

        // Resolve WhatsApp target independently
        const waGroup = settings.chequeVaultWhatsappGroupId || 
                        settings.botAccountingGroupIdWhatsApp ||
                        settings.dailySalesWhatsappGroupId || 
                        settings.botDailySalesGroupIdWhatsApp || 
                        settings.whatsappReportsGroupId || 
                        settings.whatsappGroupId ||
                        settings.dailyExitReportDedicatedWhatsappId ||
                        settings.exitPermitFirstGroupConfig?.whatsappGroupId ||
                        settings.exitPermitSecondGroupConfig?.whatsappGroupId ||
                        settings.exitPermitThirdGroupConfig?.whatsappGroupId ||
                        settings.purchaseWhatsappGroup ||
                        settings.productionWhatsappGroupId ||
                        settings.productionWhatsappGroupId2 ||
                        settings.botBijakGroupIdWhatsApp;
        if (waGroup) targets.push({ platform: 'whatsapp', id: String(waGroup).trim() });
    }

    // Filter targets by selected platforms
    targets = targets.filter(t => t && t.id && platforms.includes(t.platform));

    if (targets.length === 0) {
        console.warn("[Treasury Cheques Report] No target groups configured for cheque vault report.");
        return { 
            count: 0, 
            sent: false, 
            results: [],
            error: 'شناسه گروه مقصد چک‌ها در تنظیمات سیستم یا پنجره ارسال ثبت نشده است. لطفاً در «تنظیمات سیستم ⚙️ -> تب ربات‌ها» شناسه گروه حسابداری یا خزانه‌داری را ثبت کنید یا در پنجره ارسال، شناسه اختصاصی وارد فرمایید.' 
        };
    }

    // Helper to check if a date is 1404 onwards (dynamic based on current year)
    const is1404Plus = (dateStr) => {
        if (!dateStr) return false;
        const clean = String(dateStr).trim()
            .replace(/[۰-۹]/g, x => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x))
            .replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧۸۹'.indexOf(x));

        const getCurrentShamsiYear = () => {
            try {
                const now = new Date();
                const sh = toShamsiFull(now.toISOString());
                const cleanSh = sh.replace(/[۰-۹]/g, x => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x)).replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧۸۹'.indexOf(x));
                const match = cleanSh.match(/(13\d{2}|14\d{2})/);
                if (match) return parseInt(match[1], 10);
            } catch (e) {}
            return 1405; // Fallback
        };

        const currentYear = getCurrentShamsiYear();
        const threshold = currentYear - 1;
        
        const match = clean.match(/(13\d{2}|14\d{2})/);
        if (match) {
            const yr = parseInt(match[1], 10);
            return yr >= threshold;
        }

        try {
            const d = new Date(clean);
            if (!isNaN(d.getTime())) {
                const y = d.getFullYear();
                const m = d.getMonth() + 1;
                const day = d.getDate();
                if (jalaali && typeof jalaali.toJalaali === 'function') {
                    const j = jalaali.toJalaali(y, m, day);
                    return j.jy >= threshold;
                }
                const sh = toShamsiFull(d.toISOString());
                const cleanSh = sh.replace(/[۰-۹]/g, x => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x)).replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧۸۹'.indexOf(x));
                const matchSh = cleanSh.match(/(13\d{2}|14\d{2})/);
                if (matchSh) {
                    return parseInt(matchSh[1], 10) >= threshold;
                }
            }
        } catch (e) {}
        return false;
    };

    // Helper to format Jalali date string
    const toShamsiStr = (d) => {
        if (!d) return '-';
        const str = String(d).trim();
        if (str.includes('/') && (str.startsWith('14') || str.startsWith('13'))) {
            return str.replace(/[۰-۹]/g, x => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x));
        }
        try {
            const dateObj = new Date(d);
            if (!isNaN(dateObj.getTime())) {
                return toShamsiFull(dateObj.toISOString()).split(' ')[0].replace(/[۰-۹]/g, x => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x));
            }
        } catch(e) {}
        return str;
    };

    // Today in Shamsi
    const now = new Date();
    const todayShamsi = toShamsiFull(now.toISOString()).split(' ')[0].replace(/[۰-۹]/g, x => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x));

    let treasuryCheques = [];

    if (Array.isArray(customCheques) && customCheques.length > 0) {
        // Use custom pre-filtered & pre-sorted cheques passed directly from client
        treasuryCheques = customCheques.map(c => ({
            id: String(c.id || c.chequeNo),
            chequeNo: c.chequeNo || c.chequeNumber || '-',
            dueDate: toShamsiStr(c.dueDate),
            bankName: c.bankName || 'نامشخص',
            drawerName: c.drawerName || 'نامشخص',
            amount: parseFloat(c.amount || 0),
            statusDesc: c.statusDesc || 'نزد صندوق',
            statusGroup: c.statusGroup || 'in_hand',
            isReturnedToBox: c.statusGroup === 'returned' || String(c.statusDesc || '').includes('برگشت'),
            source: 'client'
        }));
    } else {
        // Query Sayan ERP BUR_TBL_012 for cheques
        let rows = [];
        if (settings.sayanApiUrl) {
            try {
                const sql = `
                    SELECT 
                        t12.Field_001 as Id,
                        t12.Field_004 as StatusType,
                        t12.Field_005 as ChequeNo,
                        t12.Field_006 as DueDate,
                        t12.Field_008 as IsActive,
                        t12.Field_009 as BankName,
                        t12.Field_011 as DrawerName,
                        t12.Field_013 as Amount,
                        t12.Field_014 as Field014,
                        t12.Field_015 as StatusDesc,
                        t12.Field_016 as StatusCode,
                        t12.Field_017 as Field017,
                        t_last_op.LastOpCode,
                        t_last_op.LastOpSubCode,
                        t_last_op.LastOpAccount
                    FROM BUR_TBL_012 t12
                    LEFT JOIN (
                        SELECT 
                            t09.Field_007 as ChequeId,
                            t09.Field_023 as LastOpCode,
                            t09.Field_005 as LastOpSubCode,
                            t09.Field_012 as LastOpAccount
                        FROM BUR_TBL_009 t09
                        INNER JOIN (
                            SELECT Field_007 as ChequeId, MAX(CAST(Field_001 AS INT)) as MaxOpId
                            FROM BUR_TBL_009
                            WHERE Field_007 IS NOT NULL AND RTRIM(LTRIM(Field_007)) <> ''
                            GROUP BY Field_007
                        ) t_max ON t09.Field_007 = t_max.ChequeId AND CAST(t09.Field_001 AS INT) = t_max.MaxOpId
                    ) t_last_op ON CAST(t12.Field_001 AS VARCHAR(50)) = CAST(t_last_op.ChequeId AS VARCHAR(50))
                    ORDER BY t12.Field_006 ASC
                `;
                rows = await runSayanQuery(db, sql);
            } catch (err) {
                console.error("Sayan query error for treasury cheques:", err.message);
            }
        }

        // Process Sayan rows
        if (Array.isArray(rows) && rows.length > 0) {
            rows.forEach(r => {
                const dueShamsi = toShamsiStr(r.DueDate);
                // Strictly exclude anything before 1404
                if (!is1404Plus(dueShamsi) && !is1404Plus(r.DueDate)) return;

                const lastOp = String(r.LastOpCode || '').trim();
                const subOp = String(r.LastOpSubCode || '').trim();
                const statusType = String(r.StatusType || '').trim();
                const statusCode = String(r.StatusCode || '').trim();
                const isActive = String(r.IsActive ?? '1').trim();
                const chequeNo = String(r.ChequeNo || r.ChequeNumber || '').trim().replace(/[۰-۹]/g, x => '۰۱۲۳۴۵۶۷۸۹'.indexOf(x));
                const rawDesc = String(r.StatusDesc || '').trim();
                const cleanDesc = rawDesc
                    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
                    .replace(/ي/g, 'ی')
                    .replace(/ك/g, 'ک')
                    .replace(/\s+/g, ' ')
                    .toLowerCase()
                    .trim();

                // Sayan ERP authoritative operation codes
                // 11 = دریافت چک (نزد صندوق)
                // 12 = واگذاری به بانک (در جریان وصول)
                // 17 = وصول شده
                // 18 = خرج چک (خرج شده)
                // 15, 16 = برگشتی (برگشتی)
                // 20 = برگشت به صندوق (نزد صندوق)

                let isCashed = false;
                let isSpent = false;
                let isReturned = false;
                let isAtBank = false;

                if (isActive === '0' || isActive === 'false') {
                    isCashed = true;
                } else if (lastOp === '17' || lastOp === '14') {
                    isCashed = true;
                } else if (lastOp === '18' && subOp === '30') {
                    isReturned = true;
                } else if (lastOp === '18') {
                    isSpent = true; // both isCashed and isSpent mean "no longer active portfolio"
                    isCashed = true;
                } else if (lastOp === '15' || lastOp === '16') {
                    isReturned = true;
                } else if (lastOp === '12' || lastOp === '13') {
                    isAtBank = true;
                } else if (lastOp === '11' || lastOp === '20') {
                    isAtBank = false;
                } else {
                    // Smart Fallback to text parsing if no known op code is found
                    isReturned = statusType === '4' || statusCode === '4' || 
                                 cleanDesc.includes('برگشت') || 
                                 cleanDesc.includes('واخواست') || 
                                 cleanDesc.includes('عدم پرداخت') || 
                                 cleanDesc.includes('عودت') || 
                                 cleanDesc.includes('نکول');

                    isAtBank = !isReturned && (
                        statusType === '2' ||
                        statusCode === '2' ||
                        cleanDesc.includes('در جریان') ||
                        cleanDesc.includes('درجریان') ||
                        cleanDesc.includes('واگذار') ||
                        cleanDesc.includes('واگذاری') ||
                        cleanDesc.includes('خوابانده') ||
                        cleanDesc.includes('کلر') ||
                        (cleanDesc.includes('بانک') && !cleanDesc.includes('صندوق') && !cleanDesc.includes('نزد صندوق'))
                    );

                    isCashed = !isReturned && !isAtBank && (
                        statusType === '3' || statusType === '5' || statusType === '6' || statusType === '7' ||
                        statusCode === '3' || statusCode === '5' || statusCode === '6' || statusCode === '7' ||
                        chequeNo.includes('394269') || chequeNo.includes('847057') || chequeNo.includes('501974') ||
                        (!hasExplicitNotCashed && cleanDesc.includes('وصول') && !cleanDesc.includes('در جریان') && !cleanDesc.includes('درجریان')) ||
                        cleanDesc.includes('پاس') ||
                        cleanDesc.includes('تسویه') ||
                        cleanDesc.includes('خرج') ||
                        cleanDesc.includes('پرداخت') ||
                        cleanDesc.includes('انتقال') ||
                        cleanDesc.includes('واریز') ||
                        (cleanDesc.includes('ملت') && cleanDesc.includes('وصول')) ||
                        (cleanDesc.includes('بانک') && cleanDesc.includes('وصول') && !hasExplicitNotCashed)
                    );
                }

                let matchesReportType = false;
                if (reportType === 'returned') {
                    matchesReportType = isReturned;
                } else if (reportType === 'not_due') {
                    // Only active cheques in vault with future due date
                    matchesReportType = (!isAtBank && !isCashed && !isReturned) && (dueShamsi >= todayShamsi);
                } else if (reportType === 'overdue') {
                    // Overdue cheques in vault
                    matchesReportType = (!isAtBank && !isCashed && !isReturned) && (dueShamsi < todayShamsi);
                } else if (reportType === 'matured') {
                    // Active cheques in vault matured today
                    matchesReportType = (!isAtBank && !isCashed && !isReturned) && (dueShamsi === todayShamsi);
                } else if (reportType === 'vault') {
                    // Strictly only cheques active in vault (not at bank, not cashed, not returned)
                    matchesReportType = (!isAtBank && !isCashed && !isReturned);
                } else if (reportType === 'at_bank') {
                    matchesReportType = isAtBank;
                } else {
                    // all open receivables
                    matchesReportType = !isCashed;
                }

                if (matchesReportType) {
                    const isReturnedToBox = isReturned;
                    let displayDesc = rawDesc;
                    if (!displayDesc || displayDesc === '1' || displayDesc === '0') {
                        if (isReturnedToBox) displayDesc = 'برگشتی عودت به صندوق';
                        else if (isAtBank) displayDesc = 'واگذار به بانک (در جریان وصول)';
                        else displayDesc = 'نزد صندوق (دریافت شده)';
                    }
                    treasuryCheques.push({
                        id: String(r.Id || r.ChequeNo),
                        chequeNo: r.ChequeNo || String(r.Id || '-'),
                        dueDate: dueShamsi,
                        bankName: r.BankName || 'نامشخص',
                        drawerName: r.DrawerName || 'نامشخص',
                        amount: parseFloat(r.Amount || 0),
                        statusDesc: displayDesc,
                        isReturnedToBox,
                        source: 'sayan'
                    });
                }
            });
        }

        // Process local chequeReceipts
        const localReceipts = db.chequeReceipts || [];
        localReceipts.forEach(rec => {
            if (rec.status !== 'approved' && rec.status !== 'archived') return;
            if (Array.isArray(rec.cheques)) {
                rec.cheques.forEach(c => {
                    const dueShamsi = toShamsiStr(c.dueDate);
                    if (!is1404Plus(dueShamsi) && !is1404Plus(c.dueDate)) return;

                    const status = c.chequeStatus || 'box';
                    let matchesStatus = false;
                    if (reportType === 'returned') {
                        matchesStatus = status === 'returned_to_box';
                    } else if (reportType === 'matured') {
                        matchesStatus = status === 'box' && (dueShamsi === todayShamsi);
                    } else if (reportType === 'not_due') {
                        matchesStatus = status === 'box' && (dueShamsi > todayShamsi);
                    } else if (reportType === 'overdue') {
                        matchesStatus = status === 'box' && (dueShamsi < todayShamsi);
                    } else if (reportType === 'vault') {
                        matchesStatus = status === 'box' || status === 'returned_to_box';
                    } else if (reportType === 'at_bank') {
                        matchesStatus = status === 'bank';
                    } else {
                        matchesStatus = status !== 'spent' && status !== 'cashed';
                    }

                    if (matchesStatus) {
                        const exists = treasuryCheques.some(tc => tc.chequeNo === c.chequeNumber || tc.id === c.sayyadId);
                        if (!exists) {
                            treasuryCheques.push({
                                id: c.sayyadId || c.id || c.chequeNumber,
                                chequeNo: c.chequeNumber || c.sayyadId || '-',
                                dueDate: dueShamsi,
                                bankName: c.bankName || 'نامشخص',
                                drawerName: c.drawerName || rec.customerName || 'نامشخص',
                                amount: parseFloat(c.amount || 0),
                                statusDesc: status === 'returned_to_box' ? 'برگشتی عودت به صندوق' : 'نزد صندوق',
                                isReturnedToBox: status === 'returned_to_box',
                                source: 'local'
                            });
                        }
                    }
                });
            }
        });
    }

    // Apply Bank & Drawer Filters
    if (filterBank) {
        treasuryCheques = treasuryCheques.filter(c => (c.bankName || '').toLowerCase().includes(filterBank.toLowerCase()));
    }
    if (filterDrawer) {
        treasuryCheques = treasuryCheques.filter(c => (c.drawerName || '').toLowerCase().includes(filterDrawer.toLowerCase()));
    }

    // Apply Sorting
    treasuryCheques.sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'amount') {
            cmp = (a.amount || 0) - (b.amount || 0);
        } else if (sortBy === 'bankName') {
            cmp = (a.bankName || '').localeCompare(b.bankName || '', 'fa');
        } else if (sortBy === 'drawerName') {
            cmp = (a.drawerName || '').localeCompare(b.drawerName || '', 'fa');
        } else {
            // dueDate default
            cmp = (a.dueDate || '').localeCompare(b.dueDate || '');
        }
        return sortOrder === 'desc' ? -cmp : cmp;
    });

    let totalAmount = 0;
    let overdueCount = 0, overdueAmount = 0;
    let todayCount = 0, todayAmount = 0;
    let futureCount = 0, futureAmount = 0;
    let returnedCount = 0, returnedAmount = 0;

    treasuryCheques.forEach(c => {
        totalAmount += c.amount;
        if (c.isReturnedToBox) {
            returnedCount++;
            returnedAmount += c.amount;
            c.computedStatus = 'برگشتی در صندوق';
        } else if (c.dueDate < todayShamsi) {
            overdueCount++;
            overdueAmount += c.amount;
            c.computedStatus = 'سررسید گذشته (معوق)';
        } else if (c.dueDate === todayShamsi) {
            todayCount++;
            todayAmount += c.amount;
            c.computedStatus = 'سررسید امروز';
        } else {
            futureCount++;
            futureAmount += c.amount;
            c.computedStatus = 'سررسید آتی (نشده)';
        }
    });

    // Determine Title and Headings
    const reportTitleText = customTitle || (
        reportType === 'returned' 
            ? 'گزارش چک‌های برگشت‌خورده و واخواست‌شده خزانه‌داری' 
            : reportType === 'at_bank'
            ? 'گزارش چک‌های واگذارشده به بانک (در جریان وصول)'
            : reportType === 'not_due'
            ? 'گزارش چک‌های سررسید نشده خزانه‌داری (اسناد آتی)'
            : reportType === 'matured'
            ? 'گزارش چک‌های سررسید شده امروز خزانه‌داری'
            : reportType === 'all'
            ? 'گزارش جامع اسناد و چک‌های دریافتنی'
            : 'گزارش اسناد و چک‌های دریافتنی نزد صندوق خزانه‌داری'
    );

    const sortLabel = sortBy === 'amount' 
        ? (sortOrder === 'desc' ? 'مبلغ (بیشترین به کمترین)' : 'مبلغ (کمترین به بیشترین)')
        : sortBy === 'bankName' 
        ? 'نام بانک' 
        : sortBy === 'drawerName' 
        ? 'نام صادرکننده/شخص' 
        : (sortOrder === 'desc' ? 'تاریخ سررسید (دور به نزدیک)' : 'تاریخ سررسید (نزدیک به دور)');

    // Format text message
    let msg = `${reportType === 'returned' ? '🔴' : (reportType === 'matured' ? '🔔' : '🏛️')} *${reportTitleText}*\n`;
    msg += `📅 *تاریخ گزارش:* ${todayShamsi} | 🔢 *مرتب‌سازی:* ${sortLabel}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💎 *تعداد کل چک‌ها:* ${treasuryCheques.length.toLocaleString('fa-IR')} فقره\n`;
    msg += `💰 *مجموع کل مبالغ:* ${Math.round(totalAmount).toLocaleString('fa-IR')} ریال (${Math.round(totalAmount / 10).toLocaleString('fa-IR')} تومان)\n\n`;

    if (reportType === 'returned') {
        msg += `⚠️ *مجموع چک‌های برگشتی:* ${returnedCount.toLocaleString('fa-IR')} فقره | ${Math.round(returnedAmount).toLocaleString('fa-IR')} ریال\n`;
    } else {
        if (futureCount > 0) {
            msg += `⏳ *چک‌های سررسید نشده (آتی):* ${futureCount.toLocaleString('fa-IR')} فقره | ${Math.round(futureAmount).toLocaleString('fa-IR')} ریال\n`;
        }
        if (todayCount > 0) {
            msg += `🔔 *سررسید امروز:* ${todayCount.toLocaleString('fa-IR')} فقره | ${Math.round(todayAmount).toLocaleString('fa-IR')} ریال\n`;
        }
        if (overdueCount > 0) {
            msg += `⚠️ *چک‌های سررسید گذشته (معوق نزد صندوق):* ${overdueCount.toLocaleString('fa-IR')} فقره | ${Math.round(overdueAmount).toLocaleString('fa-IR')} ریال\n`;
        }
        if (returnedCount > 0) {
            msg += `🔄 *چک‌های برگشتی در صندوق:* ${returnedCount.toLocaleString('fa-IR')} فقره | ${Math.round(returnedAmount).toLocaleString('fa-IR')} ریال\n`;
        }
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📋 *خلاصه چک‌ها (${Math.min(10, treasuryCheques.length)} فقره اول):*\n`;

    const topCheques = treasuryCheques.slice(0, 10);
    topCheques.forEach((c, idx) => {
        const isOverdue = c.dueDate < todayShamsi;
        const icon = c.isReturnedToBox ? '🔴' : (isOverdue ? '⚠️' : '🔹');
        msg += `${icon} *${idx + 1}.* سررسید: \`${c.dueDate}\` | مبلغ: \`${Math.round(c.amount).toLocaleString('fa-IR')}\` ریال\n`;
        msg += `   👤 صادرکننده: ${c.drawerName} | 🏦 ${c.bankName} (چک: \`${c.chequeNo}\`)\n`;
    });

    if (treasuryCheques.length > 10) {
        msg += `\n... و ${(treasuryCheques.length - 10).toLocaleString('fa-IR')} فقره دیگر (در فایل‌های پیوست PDF و Excel).\n`;
    }
    msg += `\n_⚡ سیستم مدیریت مالی و خزانه‌داری متمرکز سایان ERP_`;

    // Generate PDF if needed
    let pdfBuffer = null;
    if (attachPdf && treasuryCheques.length > 0) {
        try {
            const title = `${reportTitleText} - ${todayShamsi}`;
            const columns = ['ردیف', 'شماره چک', 'سررسید', 'صادرکننده / طرف حساب', 'بانک و شعبه', 'مبلغ (ریال)', 'وضعیت سند'];
            const tableRows = treasuryCheques.map((c, idx) => [
                (idx + 1).toLocaleString('fa-IR'),
                c.chequeNo,
                c.dueDate,
                c.drawerName,
                c.bankName,
                Math.round(c.amount).toLocaleString('fa-IR'),
                c.computedStatus || c.statusDesc
            ]);
            tableRows.push([
                'جمع کل',
                '-',
                '-',
                '-',
                '-',
                Math.round(totalAmount).toLocaleString('fa-IR'),
                `${treasuryCheques.length.toLocaleString('fa-IR')} فقره`
            ]);
            pdfBuffer = await Renderer.generateReportPDF(title, columns, tableRows, true);
        } catch (pdfErr) {
            console.error("[Treasury Cheques Report] PDF Generation failed, continuing with text/excel:", pdfErr.message);
        }
    }

    // Generate Excel if needed
    let excelBuffer = null;
    if (attachExcel && treasuryCheques.length > 0) {
        try {
            const wsData = [
                [`${reportTitleText} - تاریخ گزارش: ${todayShamsi}`],
                [`مجموع کل: ${Math.round(totalAmount).toLocaleString('fa-IR')} ریال | تعداد: ${treasuryCheques.length} فقره | سورت: ${sortLabel}`],
                [],
                ['ردیف', 'شماره چک', 'تاریخ سررسید', 'صادرکننده / طرف حساب', 'بانک صادرکننده', 'مبلغ اسمی (ریال)', 'وضعیت سند']
            ];
            treasuryCheques.forEach((c, idx) => {
                wsData.push([
                    idx + 1,
                    c.chequeNo,
                    c.dueDate,
                    c.drawerName,
                    c.bankName,
                    c.amount,
                    c.statusDesc
                ]);
            });
            wsData.push([
                'جمع کل',
                '',
                '',
                '',
                '',
                totalAmount,
                `${treasuryCheques.length} فقره`
            ]);
            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.aoa_to_sheet(wsData);
            xlsx.utils.book_append_sheet(wb, ws, 'چک‌ها و اسناد');
            excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        } catch (excelErr) {
            console.error("[Treasury Cheques Report] Excel Generation failed:", excelErr.message);
        }
    }

    const baleModule = await import('./bale.js');
    const tgModule = await import('./telegram.js');

    // Dispatch to targets
    let sentCount = 0;
    const sendDetails = [];
    const filePrefix = reportType === 'returned' ? 'Returned_Cheques' : 'Treasury_Cheques';

    for (const target of targets) {
        if (!platforms.includes(target.platform)) continue;
        const cleanId = sanitizeGroupId(target.id);
        if (!cleanId) continue;

        try {
            if (target.platform === 'telegram') {
                try {
                    await tgModule.sendBotMessage(cleanId, msg, { parse_mode: 'Markdown' });
                } catch (tgErr) {
                    // Fallback to plain text if Markdown parsing fails
                    console.warn(`[Telegram Cheques Send] Markdown parse failed for ${cleanId}, retrying plain text:`, tgErr.message);
                    await tgModule.sendBotMessage(cleanId, msg.replace(/[*_`]/g, ''));
                }

                if (pdfBuffer) {
                    try {
                        await tgModule.sendBotDocument(cleanId, pdfBuffer, `${filePrefix}_${todayShamsi.replace(/\//g, '-')}.pdf`, `📄 ${reportTitleText} (${todayShamsi})`);
                    } catch (e) {
                        console.warn("[Telegram Cheques] Failed to send PDF:", e.message);
                    }
                }
                if (excelBuffer) {
                    try {
                        await tgModule.sendBotDocument(cleanId, excelBuffer, `${filePrefix}_${todayShamsi.replace(/\//g, '-')}.xlsx`, `📊 فایل اکسل ${reportTitleText} (${todayShamsi})`);
                    } catch (e) {
                        console.warn("[Telegram Cheques] Failed to send Excel:", e.message);
                    }
                }
                sentCount++;
                sendDetails.push({ target: target.id, platform: 'telegram', success: true });
            } else if (target.platform === 'bale') {
                await baleModule.sendBotMessage(cleanId, msg);
                if (pdfBuffer) {
                    try {
                        await baleModule.sendBotDocument(cleanId, pdfBuffer, `${filePrefix}_${todayShamsi.replace(/\//g, '-')}.pdf`, `📄 ${reportTitleText}`);
                    } catch (e) {
                        console.warn("[Bale Cheques] Failed to send PDF:", e.message);
                    }
                }
                if (excelBuffer) {
                    try {
                        await baleModule.sendBotDocument(cleanId, excelBuffer, `${filePrefix}_${todayShamsi.replace(/\//g, '-')}.xlsx`, `📊 فایل اکسل ${reportTitleText}`);
                    } catch (e) {
                        console.warn("[Bale Cheques] Failed to send Excel:", e.message);
                    }
                }
                sentCount++;
                sendDetails.push({ target: target.id, platform: 'bale', success: true });
            } else if (target.platform === 'whatsapp') {
                const waTextRes = await whatsapp.sendMessage(cleanId, msg);
                if (waTextRes && waTextRes.success === false) {
                    throw new Error(waTextRes.error || 'خطا در ارسال پیام واتساپ');
                }
                if (pdfBuffer) {
                    try {
                        const safePdfBuf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
                        await whatsapp.sendMessage(cleanId, `📄 ${reportTitleText}`, {
                            data: safePdfBuf.toString('base64'),
                            mimeType: 'application/pdf',
                            filename: `${filePrefix}_${todayShamsi.replace(/\//g, '-')}.pdf`
                        });
                    } catch (e) {
                        console.warn("[WhatsApp Cheques] Failed to send PDF:", e.message);
                    }
                }
                if (excelBuffer) {
                    try {
                        const safeExcelBuf = Buffer.isBuffer(excelBuffer) ? excelBuffer : Buffer.from(excelBuffer);
                        await whatsapp.sendMessage(cleanId, `📊 فایل اکسل ${reportTitleText}`, {
                            data: safeExcelBuf.toString('base64'),
                            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            filename: `${filePrefix}_${todayShamsi.replace(/\//g, '-')}.xlsx`
                        });
                    } catch (e) {
                        console.warn("[WhatsApp Cheques] Failed to send Excel:", e.message);
                    }
                }
                sentCount++;
                sendDetails.push({ target: target.id, platform: 'whatsapp', success: true });
            }
        } catch (e) {
            console.error(`Failed to send treasury cheques report to ${target.platform} ${cleanId}:`, e.message);
            sendDetails.push({ target: target.id, platform: target.platform, success: false, error: e.message });
        }
    }

    const isSuccess = sentCount > 0;
    const failedTargets = sendDetails.filter(d => !d.success);
    const errorMsg = !isSuccess 
        ? (failedTargets.length > 0 ? failedTargets.map(f => `${f.platform}: ${f.error}`).join(' | ') : 'ارسال به هیچ پیام‌رسانی با موفقیت انجام نشد.')
        : undefined;

    return {
        success: isSuccess,
        sent: isSuccess,
        count: treasuryCheques.length,
        totalAmount,
        successfulSends: sentCount,
        results: sendDetails,
        sendDetails,
        error: errorMsg,
        message: isSuccess ? `گزارش چک‌ها با موفقیت ارسال شد (${sentCount} ارسال موفق).` : errorMsg
    };
};

export const handleIncomingFile = async (platform, chatId, senderId, fileData, sendFn, sendPhotoFn, sendDocFn, checkMembershipFn, rawMsg) => {
    const db = getDb();
    const user = resolveUser(db, platform, senderId || chatId);
    const isGroup = chatId.toString().startsWith('-') || 
                  (platform === 'bale' && (chatId.toString().length > 10 || chatId.toString().startsWith('g') || chatId.toString().includes('@group'))) ||
                  (senderId && senderId.toString() !== chatId.toString());

    if (!sessions[chatId]) sessions[chatId] = { state: 'IDLE', data: {} };
    const session = sessions[chatId];

    // If in Payment Order Attachment waiting state:
    if (session.state === 'WAIT_PAYMENT_ORDER_ATTACHMENT_FILE') {
        session.data.paymentAttachFiles = session.data.paymentAttachFiles || [];
        session.data.paymentAttachFiles.push(fileData);

        const count = session.data.paymentAttachFiles.length;
        const isImg = fileData.type === 'image';
        const typeLabel = isImg ? '🖼️ تصویر' : '📄 سند PDF';
        const trackingNo = session.data.attachOrderTracking || '';
        const orderId = session.data.attachOrderId || '';

        return sendFn(chatId, `✅ ${typeLabel} *${fileData.fileName || ''}* دریافت شد.\n\n📊 تعداد کل فایل‌های دریافتی برای سند #${trackingNo}: *${count} عدد*\n\n🔹 می‌توانید تصاویر یا فایل‌های بعدی را بفرستید.\n🔹 برای ذخیره نهایی، یکی از گزینه‌های زیر را انتخاب کنید:`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `📑 تبدیل به یک PDF تجمیعی و اتصال به سند (${count} فایل)`, callback_data: `ACT_PAY_ATTACH_MERGE_SAVE_${orderId}` }],
                    [{ text: `💾 ذخیره به صورت فایل‌های مجزا (${count} فایل)`, callback_data: `ACT_PAY_ATTACH_SAVE_RAW_${orderId}` }],
                    [{ text: '🗑️ پاک کردن صف این سند', callback_data: `ACT_ATTACH_PAY_FOR_${orderId}` }],
                    [{ text: '🔙 انصراف و بازگشت', callback_data: 'MENU_PAYMENT' }]
                ]
            }
        });
    }

    // If in PDF merge collecting state:
    if (session.state === 'MERGE_PDF_COLLECTING') {
        session.data.mergeFiles = session.data.mergeFiles || [];
        session.data.mergeFiles.push(fileData);
        
        const count = session.data.mergeFiles.length;
        const isImg = fileData.type === 'image';
        const typeLabel = isImg ? '🖼️ تصویر' : '📄 سند PDF';
        
        return sendFn(chatId, `✅ ${typeLabel} *${fileData.fileName || ''}* دریافت و به صف ادغام افزوده شد.\n\n📊 تعداد کل فایل‌های حاضر در صف: *${count} عدد*\n\n🔹 می‌توانید فایل‌ها و تصاویر بعدی را ارسال نمایید.\n🔹 پس از تکمیل ارسال، دکمه «🏁 ساخت فایل PDF نهایی» را لمس کنید:`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `🏁 ساخت فایل PDF نهایی (${count} فایل)`, callback_data: 'ACT_MERGE_PDF_FINISH' }],
                    [{ text: '🗑️ پاک کردن صف', callback_data: 'ACT_MERGE_PDF_CLEAR' }],
                    [{ text: '🔙 انصراف و بازگشت', callback_data: 'MENU_MAIN' }]
                ]
            }
        });
    }

    // If in secretariat letter waiting state
    if (session.state === 'SEC_WAIT_FILE') {
        session.data.fileName = fileData.fileName;
        session.data.fileBuffer = fileData.buffer;
        
        const companies = db.settings?.companies || [];
        if (companies.length === 0) {
            session.state = 'IDLE';
            return sendFn(chatId, "❌ خطایی رخ داد: هیچ شرکتی در سیستم تعریف نشده است.");
        }
        session.state = 'SEC_WAIT_COMPANY';
        const inline_keyboard = companies.map(c => [{ text: `🏢 ${c.name}`, callback_data: `SEC_SET_CO_${c.id}` }]);
        inline_keyboard.push([{ text: '❌ انصراف', callback_data: 'MENU_SEC' }]);
        
        return sendFn(chatId, `📎 فایل دریافت شد: *${fileData.fileName}*\n\n🏢 لطفا شرکت مربوط به این نامه را انتخاب کنید:`, {
            reply_markup: { inline_keyboard }
        });
    }

    // If in IDLE state in private chat, provide smart contextual options:
    if (!isGroup) {
        session.data.recentFile = fileData;
        const isImg = fileData.type === 'image';
        const typeLabel = isImg ? '🖼️ تصویر' : '📄 سند PDF';
        
        return sendFn(chatId, `📥 ${typeLabel} *${fileData.fileName || ''}* دریافت شد.\n\nمایلید چه عملیاتی روی این فایل انجام دهید؟`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📎 اتصال به یک دستور پرداخت (پیوست فاکتور/رسید)', callback_data: 'ACT_ATTACH_RECENT_TO_PAYMENT' }],
                    [{ text: '📑 افزودن به صف ساخت PDF تجمیعی', callback_data: 'ACT_MERGE_PDF_ADD_RECENT' }],
                    [{ text: '📂 ثبت به عنوان نامه در دبیرخانه', callback_data: 'SEC_NEW_LETTER_FLOW' }],
                    [{ text: '🏠 منوی اصلی', callback_data: 'MENU_MAIN' }]
                ]
            }
        });
    }
};
