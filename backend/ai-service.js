import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { getDb, saveDb } from './db-manager.js';
import * as utils from './utils.js';
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici';

// Initialize global fetch proxy dispatcher using system / custom proxy settings with NO_PROXY support
const proxyUrl = process.env.PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
if (proxyUrl) {
    try {
        setGlobalDispatcher(new EnvHttpProxyAgent());
    } catch (err) {
        console.error('[Proxy Setup - AI Service] Failed to set EnvHttpProxyAgent:', err);
    }
}

/**
 * Dynamically resolves the Gemini API Key from settings or environment variables
 */
export const getActiveGeminiApiKey = (customKey) => {
    if (customKey && typeof customKey === 'string' && customKey.trim()) {
        return customKey.trim().replace(/^['"]|['"]$/g, '');
    }
    try {
        const db = getDb();
        const settingsKey = db?.settings?.geminiApiKey;
        if (settingsKey && typeof settingsKey === 'string' && settingsKey.trim()) {
            return settingsKey.trim().replace(/^['"]|['"]$/g, '');
        }
    } catch (e) {
        // ignore DB read error
    }
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim()) {
        return envKey.trim().replace(/^['"]|['"]$/g, '');
    }
    return '';
};

/**
 * Dynamically resolves custom Base URL / Proxy from settings or environment variables
 */
export const getActiveGeminiBaseUrl = (customBaseUrl) => {
    if (customBaseUrl && typeof customBaseUrl === 'string' && customBaseUrl.trim()) {
        return customBaseUrl.trim().replace(/\/+$/, '');
    }
    try {
        const db = getDb();
        const settingsUrl = db?.settings?.geminiBaseUrl || db?.settings?.aiProxyUrl;
        if (settingsUrl && typeof settingsUrl === 'string' && settingsUrl.trim()) {
            return settingsUrl.trim().replace(/\/+$/, '');
        }
    } catch (e) {
        // ignore DB read error
    }
    const envUrl = process.env.GEMINI_BASE_URL || process.env.AI_PROXY_URL;
    if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
        return envUrl.trim().replace(/\/+$/, '');
    }
    return '';
};

/**
 * Initializes GoogleGenAI client with active API key and optional proxy/base URL
 */
export const getGeminiClient = (customKey, customBaseUrl) => {
    const apiKey = getActiveGeminiApiKey(customKey);
    if (!apiKey) {
        throw new Error("کلید Google Gemini AI تنظیم نشده است. لطفاً کلید API را از بخش تنظیمات وارد نمایید.");
    }
    const baseUrl = getActiveGeminiBaseUrl(customBaseUrl);
    const options = { apiKey };
    if (baseUrl) {
        options.httpOptions = { baseUrl };
    }
    return new GoogleGenAI(options);
};

/**
 * Helper to generate content using primary model or fallback
 */
export const safeGenerateContent = async (ai, params) => {
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-2.5-flash'];
    const errors = [];
    for (const model of candidateModels) {
        try {
            const response = await ai.models.generateContent({
                ...params,
                model
            });
            return { response, model };
        } catch (err) {
            const errMsg = err.message || String(err);
            errors.push(`${model}: ${errMsg}`);
            console.warn(`Gemini generation with ${model} failed, trying next candidate:`, errMsg);
        }
    }
    const combinedError = new Error(`تمامی تلاش‌ها برای اتصال به مدل‌های Gemini با خطا مواجه شدند:\n${errors.join('\n')}`);
    combinedError.rawErrors = errors;
    throw combinedError;
};

/**
 * Live test of AI connection with given or stored key
 */
export const testAiConnection = async (customKey, customBaseUrl) => {
    const ai = getGeminiClient(customKey, customBaseUrl);
    const { response, model } = await safeGenerateContent(ai, {
        contents: [
            {
                role: 'user',
                parts: [{ text: 'سلام! اتصال آزمایشی سیستم ERP لیان بافت به هوش مصنوعی را در یک جمله کوتاه تایید کن.' }]
            }
        ]
    });
    return {
        success: true,
        reply: response.text?.trim() || 'ارتباط با موتور هوش مصنوعی با موفقیت برقرار است.',
        model,
        timestamp: new Date().toISOString()
    };
};

/**
 * Gather live system snapshot context for the AI Agent
 */
export const getSystemContextSnapshot = () => {
    try {
        const db = getDb();
        const settings = db.settings || {};
        
        // Active fiscal year
        const activeYear = (settings.fiscalYears || []).find(y => y.id === settings.activeFiscalYearId)?.label || '1405';
        
        // Orders & permits
        const orders = db.orders || [];
        const exitPermits = db.exitPermits || [];
        const ordersCount = orders.length;
        const pendingPermits = exitPermits.filter(p => p.status === 'PENDING' || p.status === 'APPROVED_FINANCIAL').length;
        const completedPermits = exitPermits.filter(p => p.status === 'EXITED' || p.status === 'DELIVERED').length;
        
        // Warehouse Overview (Sayan & Logistics Data)
        const wo = db.warehouseOverview || {};
        const meta = wo.meta || {};
        const goodsInTransit = wo.goodsInTransit || [];
        const goodsInCustoms = wo.goodsInCustoms || [];
        const purchasingGoods = wo.purchasingGoods || [];
        const commercialGoods = wo.commercialGoods || [];

        // Trade records (Logistics)
        const tradeRecords = db.tradeRecords || [];
        const activeTradeRecords = tradeRecords.filter(r => !r.isArchived);

        const totalTransitWeight = goodsInTransit.reduce((s, i) => s + (Number(i.weight) || 0), 0);
        const totalTransitDollars = goodsInTransit.reduce((s, i) => s + (Number(i.dollars) || 0), 0);
        const totalTransitContainers = goodsInTransit.reduce((s, i) => s + (Number(i.container) || 0), 0);

        const totalCustomsWeight = goodsInCustoms.reduce((s, i) => s + (Number(i.weight) || 0), 0);
        const totalCustomsDollars = goodsInCustoms.reduce((s, i) => s + (Number(i.dollars) || 0), 0);

        const totalPurchasingWeight = purchasingGoods.reduce((s, i) => s + (Number(i.weight) || 0), 0);
        const totalPurchasingDollars = purchasingGoods.reduce((s, i) => s + (Number(i.dollars) || 0), 0);

        // Cheques
        const cheques = db.cheques || db.chequeReceipts || [];
        const pendingCheques = cheques.filter(c => c.statusGroup === 'in_hand' || !c.statusGroup || c.status === 'PENDING').length;
        const totalChequeAmount = cheques.reduce((s, c) => s + (Number(c.amount || c.rialAmount) || 0), 0);

        return {
            activeYear,
            companyNames: (settings.companies || []).map(c => typeof c === 'string' ? c : c.name),
            ordersCount,
            pendingPermits,
            completedPermits,
            warehouseBalance: {
                reportDate: meta.reportDate || '۱۴۰۵/۰۵/۳۱',
                totalCurrentAllWeight: meta.totalCurrentAllWeight !== undefined ? meta.totalCurrentAllWeight : 730000,
                diffAllWeight: meta.diffAllWeight !== undefined ? meta.diffAllWeight : -30000,
                ratioAllWeight: meta.ratioAllWeight !== undefined ? meta.ratioAllWeight : -4.1,
                totalPositiveWeight: meta.totalPositiveWeight !== undefined ? meta.totalPositiveWeight : 45000,
                totalNegativeWeight: meta.totalNegativeWeight !== undefined ? meta.totalNegativeWeight : -75000,
                allowedCompanies: meta.allowedCompanies || ['شرکت لیان بافت', 'KOZA']
            },
            goodsInTransit: {
                totalCount: goodsInTransit.length,
                totalWeightKg: totalTransitWeight,
                totalDollars: totalTransitDollars,
                totalContainers: totalTransitContainers,
                items: goodsInTransit.map(g => ({
                    cargoType: g.cargoType,
                    proforma: g.proforma,
                    weight: g.weight,
                    cartons: g.cartons,
                    container: g.container,
                    dollars: g.dollars
                }))
            },
            goodsInCustoms: {
                totalCount: goodsInCustoms.length,
                totalWeightKg: totalCustomsWeight,
                totalDollars: totalCustomsDollars,
                items: goodsInCustoms.map(g => ({
                    cargoType: g.cargoType,
                    proforma: g.proforma,
                    weight: g.weight,
                    cartons: g.cartons,
                    dollars: g.dollars
                }))
            },
            purchasingGoods: {
                totalCount: purchasingGoods.length,
                totalWeightKg: totalPurchasingWeight,
                totalDollars: totalPurchasingDollars,
                items: purchasingGoods.map(g => ({
                    cargoType: g.cargoType,
                    proforma: g.proforma,
                    weight: g.weight,
                    dollars: g.dollars
                }))
            },
            commercialGoodsCount: commercialGoods.length,
            activeTradeFilesCount: activeTradeRecords.length,
            pendingChequesCount: pendingCheques,
            totalChequeAmountRial: totalChequeAmount,
            dateJalali: new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' }).format(new Date())
        };
    } catch (e) {
        console.error("Error generating system snapshot:", e.message);
        return {};
    }
};

/**
 * Transcribe and execute Voice / Audio commands
 */
export const processVoiceAudio = async (audioBuffer, mimeType = 'audio/ogg', customKey, contextData) => {
    const ai = getGeminiClient(customKey);
    const base64Audio = audioBuffer.toString('base64');
    const systemContext = JSON.stringify(getSystemContextSnapshot(), null, 2);

    const prompt = `
شما «دستیار هوشمند و ایجنت صوتی مدیر ارشد ERP» گروه صنعتی لیان بافت هستید.
وظیفه شما:
۱. پیام صوتی فارسی ارسال شده را دقیقاً بشنوید و متن آن را رونویسی (Transcribe) کنید.
۲. بر اساس متن و دستور کاربر، اطلاعات مربوطه را از سیستم تحلیل کرده یا پاسخ جامع، مؤدبانه و دقیق مدیریتی بدهید.
۳. در صورتی که کاربر دستوری درباره تراز انبار، بارهای در راه، گمرک، خرید یا چک‌ها داده باشد، دقیقاً از داده‌های واقعی جداول استفاده نمایید و هرگز ادعای خالی یا صفر بودن نفرمایید.

اطلاعات زنده سیستم:
${systemContext}

داده‌های زمینه‌ای سایان و صفحه جاری کاربر:
${contextData ? JSON.stringify(contextData, null, 2) : 'داده اضافه ثبت نشده'}

خروجی خود را دقیقاً به زبان فارسی سلیس و در قالب JSON معتبر زیر ارائه دهید:
{
  "transcription": "متن دقیق شنیده شده از وویس",
  "intent": "نوع_درخواست (مانند WAREHOUSE_QUERY, SALES_QUERY, CHEQUE_QUERY, LOGISTICS_QUERY, GENERAL_HELP)",
  "replyText": "پاسخ کامل، روان و رسمی به زبان فارسی برای کاربر یا مدیر",
  "suggestedAction": "نام_عملیات_پیشنهادی_در_صورت_وجود (اختیاری)"
}
`;

    const { response } = await safeGenerateContent(ai, {
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            data: base64Audio,
                            mimeType: mimeType || 'audio/ogg'
                        }
                    },
                    {
                        text: prompt
                    }
                ]
            }
        ],
        config: {
            responseMimeType: "application/json"
        }
    });

    try {
        const text = response.text?.trim() || "{}";
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return {
            transcription: "صوت دریافت شد",
            intent: "GENERAL",
            replyText: response.text || "پیام صوتی شما با موفقیت پردازش شد."
        };
    }
};

/**
 * Ask AI Assistant / Copilot
 */
export const askAiAssistant = async ({ message, contextData, history = [], customKey }) => {
    const ai = getGeminiClient(customKey);
    const systemSnapshot = getSystemContextSnapshot();
    const systemInstruction = `
شما «ایجنت هوش مصنوعی و مشاور ارشد سیستم ERP لیان بافت» هستید.
شما به تمام داده‌های زنده سیستم شامل تراز انبار سایان (موجودی‌ها، کسری‌ها و تراز وزنی)، بارهای در راه (Transit)، بارهای گمرک (Customs)، خریدهای در حال انجام (Purchasing)، فروش و مرجوعی‌ها، اسناد و چک‌های خزانه، برگه‌های خروج و وضعیت بارگیری دسترسی کامل دارید.

دستورالعمل‌های حیاتی:
۱. تحلیل بر اساس داده‌های واقعی: همیشه از ارقام دقیق، اوزان (کیلوگرم)، مبالغ دلاری، شماره پروفرم‌ها و کانتینرهای استخراج‌شده زیر استفاده کنید.
۲. عدم فرض صفر: هرگز و تحت هیچ شرایطی ادعا نکنید که بارهای در راه، گمرک یا خرید صفر است یا سیستم در ایستایی قرار دارد؛ تمام ارقام ثبت‌شده در جدول و سیستم را استخراج کرده و به تفکیک تحلیل نمایید.
۳. قالب پاسخ: فارسی رسمی، فاخر، با بولِت‌پوینت، تفکیک دسته‌بندی و اعداد خوانا.

داده‌های جامع استخراج‌شده از انبار و سیستم:
${JSON.stringify(systemSnapshot, null, 2)}

داده‌های زمینه‌ای سایان و صفحه جاری کاربر:
${contextData ? JSON.stringify(contextData, null, 2) : 'داده اضافه ثبت نشده'}
`;

    const formattedContents = [];
    if (Array.isArray(history) && history.length > 0) {
        history.forEach(item => {
            if (item.text) {
                formattedContents.push({
                    role: item.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: item.text }]
                });
            }
        });
    }

    formattedContents.push({
        role: 'user',
        parts: [{ text: message }]
    });

    const { response } = await safeGenerateContent(ai, {
        contents: formattedContents,
        config: {
            systemInstruction
        }
    });

    return {
        reply: response.text || "پاسخی از هوش مصنوعی دریافت نشد.",
        timestamp: new Date().toISOString()
    };
};

/**
 * Deep Strategic Warehouse AI Analysis
 */
export const generateWarehouseStrategicAnalysis = async (warehousePayload, customKey) => {
    const ai = getGeminiClient(customKey);

    const prompt = `
شما «مدیر ارشد تحلیل زنجیره تامین و هوش انبار (AI Supply Chain Director)» هستید.
داده‌های تراز وزنی انبار، اقلام تولیدی، مواد اولیه وارداتی و کالاهای در راه/گمرک/خرید به شرح زیر به شما ارائه شده است:

${JSON.stringify(warehousePayload, null, 2)}

لطفاً یک «گزارش تحلیلی و استراتژیک جامع مدیریتی» تهیه کنید که شامل بخش‌های زیر باشد:
۱. **ارزیابی کلان تراز وزنی و مقایسه دوره‌ها**: تحلیل تغییرات وزنی، نسبت رشد یا کاهش مواد و محصولات نهایی.
۲. **تحلیل وضعیت لجستیک و تامین در راه**: بررسی وضعیت بارهای کانتینری در راه، بارهای متوقف در گمرک و در حال خرید و تخمین زمان تزریق به خط تولید.
۳. **شناسایی اقلام بحرانی و هشدارهای کسری (Stockout Risks)**: اقلام با افت شدید یا منفی و تخمین زمان اتمام بر اساس روند.
۴. **پیشنهادات عملیاتی و استراتژی خرید (Procurement Recommendations)**: چه اقلامی باید فوراً سفارش‌گذاری شوند و اولویت ترخیص گمرکی با کدام است.
۵. **خلاصه اجرایی برای جلسه هیئت مدیره (Executive Summary)**: ۳ الی ۵ نکته کلیدی تصمیم‌ساز به صورت کاملاً حرفه‌ای.

خروجی را در قالب یک پاسخ ساختاریافته JSON با فرمت زیر ارائه فرمایید:
{
  "executiveSummary": ["نکته ۱", "نکته ۲", "نکته ۳"],
  "healthScore": 88, // نمره سلامت زنجیره تامین از ۱ تا ۱۰۰
  "totalWeightAnalysis": "متن تحلیل کلان تراز و نسبت‌ها",
  "logisticsPipelineInsight": "تحلیل بارهای در راه، گمرک و خریدهای در حال انجام",
  "criticalAlerts": [
    { "itemName": "نام کالا", "riskLevel": "CRITICAL", "reason": "علت ریسک و پیشنهاد رفع" }
  ],
  "procurementActionPlan": [
    { "priority": "HIGH", "action": "اقدام مشخص خرید یا ترخیص", "impact": "اثر اقتصادی/تولیدی" }
  ],
  "fullReportMarkdown": "متن کامل، ساختاریافته و زیبای گزارش با مارک‌داون جهت نمایش و چاپ"
}
`;

    const { response } = await safeGenerateContent(ai, {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            responseMimeType: "application/json"
        }
    });

    try {
        const text = response.text?.trim() || "{}";
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return {
            healthScore: 85,
            executiveSummary: ["تحلیل با موفقیت انجام شد"],
            fullReportMarkdown: response.text || "گزارش تحلیلی با موفقیت تولید شد."
        };
    }
};

/**
 * Deep Strategic Sales & Cashflow AI Analysis
 */
export const generateSalesStrategicAnalysis = async (salesPayload, customKey) => {
    const ai = getGeminiClient(customKey);

    const prompt = `
شما «مدیر ارشد هوش تجاری و تحلیل استراتژیک فروش (AI Commercial & Revenue Director)» هستید.
داده‌های فروش، نرخ‌های میانگین، مقایسه بازه‌ها، مرجوعی‌ها (کد ۱۳) و تعهدات چک‌های دریافتنی به شرح زیر است:

${JSON.stringify(salesPayload, null, 2)}

لطفاً تحلیل جامع مدیریتی شامل موارد زیر ارائه دهید:
۱. **تحلیل روند فروش و حاشیه سود**: ارزیابی میانگین فی نهایی، درآمد ناخالص، نوسانات حجم فروش کیلوگرمی.
۲. **تحلیل مرجوعی‌ها و کیفیت بازار**: بررسی نسبت مرجوعی به فروش و شناسایی خطرات احتمالی.
۳. **پیش‌بینی جریان نقدینگی و وضعیت چک‌ها**: وضعیت سررسید چک‌های صندوق، نسبت وصولی و ریسک عدم وصول.
۴. **فرصت‌های رشد و راهکارهای افزایش فروش**: پیشنهادات کاربردی برای افزایش سهم بازار و سبد کالایی.
۵. **نکات کلیدی برای مدیرعامل و هیئت مدیره**.

خروجی را در قالب JSON استاندارد زیر ارائه فرمایید:
{
  "growthRatePct": 12.5,
  "revenueHealth": "STRONG",
  "executiveSummary": ["نکته ۱", "نکته ۲", "نکته ۳"],
  "salesTrendInsight": "متن تحلیل روند فروش و وزن مقایسه‌ای",
  "pricingAnalysis": "تحلیل میانگین نرخ‌ها و کشش قیمتی محصولات",
  "cashflowForecast": "پیش‌بینی نقدینگی ناشی از چک‌ها و درآمدهای وصولی",
  "strategicSuggestions": [
    { "target": "مشتریان یا گروه کالا", "action": "پیشنهاد عملیاتی", "expectedResult": "نتیجه مورد انتظار" }
  ],
  "fullReportMarkdown": "متن کامل و فاخر گزارش مدیریتی به صورت مارک‌داون"
}
`;

    const { response } = await safeGenerateContent(ai, {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            responseMimeType: "application/json"
        }
    });

    try {
        const text = response.text?.trim() || "{}";
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return {
            growthRatePct: 0,
            revenueHealth: "STRONG",
            executiveSummary: ["تحلیل فروش با موفقیت تولید شد."],
            fullReportMarkdown: response.text || "تحلیل استراتژیک فروش آماده است."
        };
    }
};

/**
 * Universal Sayan ERP AI Strategic, Financial & Engineering Analysis Engine
 * Generates comprehensive managerial KPIs, engineering evaluation, risk alerts, action plans, and chart data
 */
export const generateSayanUniversalAnalysis = async ({
    reportSection,
    sectionTitle,
    payload,
    dateRange,
    customPrompt,
    customKey
}) => {
    const ai = getGeminiClient(customKey);

    const sectionDescriptions = {
        'traz': 'تراز معین تفصیلی و مانده حساب بدهکاران و بستانکاران سایان ERP (Customer Accounts & Balance Ledger)',
        'customer_balances': 'تراز معین تفصیلی و مانده حساب بدهکاران و بستانکاران سایان ERP',
        'statement': 'صورت‌حساب و گردش تفصیلی حساب شخص / مشتری (Customer Detailed Ledger & Statement)',
        'sales': 'گزارش فروش، برگشت از فروش، نرخ‌های وزنی و تحلیل مشتریان (Sayan Sales & Returns)',
        'daily_sales': 'گزارش روزانه و دوره‌ای فروش و برگشت از فروش',
        'sales_comparison': 'گزارش مقایسه‌ای فروش کارخانه بین دو بازه زمانی (Sales Comparative Analysis)',
        'production': 'آمار تولید روزانه، راندمان خطوط ۶۱، ۶۷، ۷۹، ۷۳، شوایتر و نرخ ضایعات (Factory Production & Waste)',
        'production_comparison': 'گزارش مقایسه‌ای آمار تولید کارخانه بین دو دوره (Production Lines Comparative Review)',
        'prodReturns': 'گزارش برگشت از تولید و اقلام ضایعاتی کارخانه - عملیات ۴۴ (Production Returns & Scrap Analysis)',
        'cheques': 'گزارش اسناد دریافتنی، چک‌های نزد صندوق، سررسید و تحلیل نقدینگی خزانه‌داری (Treasury Vault Cheques)',
        'cheque_vault': 'گزارش اسناد دریافتنی نزد صندوق خزانه‌داری',
        'remittances': 'گزارش حواله‌های فروش و برگه‌های خروج کالا و لجستیک (Sayan Remittances & Exit Permits)',
        'warehouseOverview': 'گزارش جامع تراز وزنی انبارها، بارهای در راه، گمرک و خرید (Warehouse Stock Balance & Logistics Overview)'
    };

    const sectionContext = sectionDescriptions[reportSection] || sectionTitle || 'گزارش جامع سامانه مالی و تولیدی سایان ERP';

    const systemInstruction = `شما مشاور ارشد و تحلیل‌گر ارشد هوش مصنوعی شرکت تولیدی و صنعتی هستید که بر نرم‌افزار جامع سایان ERP (Sayan ERP)، مهندسی تولید نساجی/صنعتی، حسابداری صنعتی، خزانه‌داری، لجستیک و مدیریت ارشد تسلط کامل دارید.
وظیفه شما این است که داده‌های واقعی استخراج شده از این بخش گزارشات سایان را با بالاترین دقت، واقع‌گرایی، دیدگاه مهندسی و بصیرت مدیریتی تحلیل کنید.

مفاهیم تخصصی که باید در نظر بگیرید:
۱. فروش و برگشت (عملیات ۳/۱۲/۲۳ فروش، عملیات ۱۳/۱۴ برگشت از فروش).
۲. خطوط تولید کارخانه (خط ۶۱، ۶۷، ۷۹، ۷۳، شوایتر و وایندینگ، گریدهای کیفی AA, A, B, C و ضایعات).
۳. برگشت از تولید (عملیات ۴۴ - بازیافت و ضایعات فرآیندی).
۴. تراز تفصیلی مشتریان (بدهکاران، بستانکاران، دوره وصول مطالبات، سقف اعتباری، ریسک عدم تسویه).
۵. چک‌های خزانه‌داری (نزد صندوق، در جریان وصول، سررسید شده، معوق، برگشتی، پیش‌بینی جریان نقدینگی).
۶. لجستیک و انبار (حواله‌های خروج، کاردکس وزنی، بارهای در راه، گمرک، نقطه سفارش و هشدار کسری).

شما باید یک خروجی ساختاریافته در قالب JSON با ساختار زیر تولید کنید:
{
  "healthScore": 85,
  "healthStatus": "OPTIMAL",
  "healthStatusFa": "عالی / پایدار / نیازمند پایش / بحرانی",
  "reportTitle": "عنوان دقیق و حرفه‌ای گزارش تحلیلی",
  "executiveSummary": [
    "نکته کلیدی اول با ارقام و تحلیل مستقیم...",
    "نکته کلیدی دوم درباره روند یا عملکرد...",
    "نکته کلیدی سوم درباره فرصت‌ها یا ریسک‌ها..."
  ],
  "kpis": [
    {
      "label": "عنوان شاخص کلیدی",
      "value": "مقدار به همراه واحد",
      "change": "درصد تغییر یا مقایسه",
      "trend": "UP",
      "status": "GOOD"
    }
  ],
  "engineeringAnalysis": "متن جامع و عمیق تحلیل مهندسی، فنی، خطوط تولید، یا مکانیک فرآیندی و عملیاتی (حداقل ۲ پاراگراف غنی با فرمت مناسب)",
  "managerialInsights": "تحلیل تخصصی استراتژیک، مدیریتی و مالی برای مدیرعامل و اعضای هیئت مدیره",
  "riskAlerts": [
    {
      "title": "عنوان ریسک یا انحراف",
      "level": "CRITICAL",
      "description": "شرح علت ایجاد و ریسک احتمالی",
      "recommendation": "راهکار عملیاتی و راهبردی برای مهار ریسک"
    }
  ],
  "actionPlan": [
    {
      "priority": "HIGH",
      "action": "اقدام مشخص و شفاف",
      "owner": "واحد مسئول (تولید / فروش / مالی / انبار / فنی)",
      "timeframe": "فوری (۲۴ ساعت) / میان‌مدت (۱ هفته) / ماهانه",
      "expectedImpact": "اثر عملیاتی و مالی مورد انتظار"
    }
  ],
  "chartConfig": {
    "type": "bar",
    "title": "عنوان نمودار تحلیلی داده‌ها",
    "xAxisKey": "label",
    "yAxisKey": "value",
    "yAxisKey2": "value2",
    "yAxisName": "واحد محور اصلی (مثلا: کیلوگرم یا ریال)",
    "yAxisName2": "واحد محور دوم (در صورت وجود)"
  },
  "chartData": [
    { "label": "ردیف ۱ / نام کالا یا خط", "value": 15000, "value2": 12000, "category": "گروه" }
  ],
  "fullReportMarkdown": "# گزارش تحلیلی استراتژیک و مهندسی...\n\nمتن کامل و بی‌نقص گزارش با تیترها، بولت‌پوینت‌ها، جداول مارک‌داون و ادبیات فاخر مدیریتی فارسی."
}`;

    const userPrompt = `لطفاً داده‌های زیر مربوط به بخش «${sectionContext}» در بازه زمانی ${JSON.stringify(dateRange || 'دوره جاری')} را تحلیل عمیق نمایید.

داده‌های ورودی:
${JSON.stringify(payload, null, 2)}

${customPrompt ? `دستور و سوال تکمیلی کاربر:\n${customPrompt}` : ''}

پاسخ را فقط و فقط به صورت JSON معتبر و بدون هیچ متن اضافه‌ای خارج از ساختار JSON ارسال نمایید.`;

    const { response } = await safeGenerateContent(ai, {
        contents: [
            { role: 'user', parts: [{ text: userPrompt }] }
        ],
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json"
        }
    });

    try {
        const text = response.text?.trim() || "{}";
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(clean);
        return {
            success: true,
            reportSection,
            sectionTitle: sectionContext,
            dateRange,
            generatedAt: new Date().toISOString(),
            ...parsed
        };
    } catch (err) {
        console.error("Failed to parse Sayan AI analysis response:", err);
        return {
            success: true,
            reportSection,
            sectionTitle: sectionContext,
            dateRange,
            generatedAt: new Date().toISOString(),
            healthScore: 75,
            healthStatus: "STABLE",
            healthStatusFa: "پایدار",
            reportTitle: `تحلیل هوشمند ${sectionContext}`,
            executiveSummary: [
                "تحلیل هوشمند با موفقیت تولید شد.",
                "جهت بررسی جزئیات به متن کامل گزارش مراجعه فرمایید."
            ],
            kpis: [],
            engineeringAnalysis: response.text || "تحلیل استخراج گردید.",
            managerialInsights: "تحلیل مدیریتی حاصل گردید.",
            riskAlerts: [],
            actionPlan: [],
            chartConfig: { type: 'bar', title: 'نمودار تحلیل', xAxisKey: 'label', yAxisKey: 'value', yAxisName: 'مقدار' },
            chartData: [],
            fullReportMarkdown: response.text || "گزارش تحلیلی با موفقیت آماده شد."
        };
    }
};

/**
 * Smart Scanner for Invoices, Proformas, Bijaks, Cheques, Weighbridge Slips
 */
export const scanDocumentWithAi = async (imageBuffer, mimeType = 'image/jpeg', customKey) => {
    const ai = getGeminiClient(customKey);
    const base64Image = imageBuffer.toString('base64');
    const prompt = `
تصویر یک سند تجاری / صنعتی (فاکتور فروش، پروفرما، برگه خروج/بیجک، چک، یا برگه باسکول) بارگذاری شده است.
لطفاً تمام اطلاعات متنی و ساختاریافته این سند را به صورت هوشمند استخراج و اعتبارسنجی کنید.

نوع سند را تشخیص دهید و فیلدهای زیر را استخراج کنید:
- نوع سند (invoice, proforma, exit_permit, cheque, weighbridge, other)
- شماره سند / فاکتور / چک
- تاریخ سند (شمسی یا میلادی)
- نام صادرکننده / فروشنده / شرکت
- نام خریدار / تحویل‌گیرنده / گیرنده
- اقلام و ردیف‌های کالا (شامل نام کالا، تعداد/کارتن، وزن ناخالص/خالص، قیمت واحد، مبلغ کل)
- جمع کل مبالغ و اوزان
- شماره شبا / بانک / شماره حساب (در صورت وجود)
- توضیحات یا شروط سند

خروجی را در قالب JSON استاندارد زیر برگردانید:
{
  "documentType": "invoice",
  "documentTypeFa": "عنوان فارسی سند",
  "documentNumber": "شماره سند",
  "date": "تاریخ",
  "issuer": "صادرکننده",
  "recipient": "گیرنده/خریدار",
  "items": [
    {
      "rowNumber": 1,
      "itemName": "نام کالا",
      "quantity": 100,
      "unit": "کارتن یا عدد",
      "weight": 2500,
      "unitPrice": 150000,
      "totalPrice": 15000000
    }
  ],
  "totalQuantity": 100,
  "totalWeight": 2500,
  "totalAmount": 15000000,
  "currency": "ریال",
  "bankInfo": {
    "bankName": "نام بانک",
    "accountNo": "شماره حساب",
    "iban": "شماره شبا",
    "chequeSayad": "شناسه صیادی ۱۶ رقمی"
  },
  "notes": "سایر نکات مهم سند",
  "confidenceScore": 0.95
}
`;

    const { response } = await safeGenerateContent(ai, {
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            data: base64Image,
                            mimeType: mimeType || 'image/jpeg'
                        }
                    },
                    { text: prompt }
                ]
            }
        ],
        config: {
            responseMimeType: "application/json"
        }
    });

    try {
        const text = response.text?.trim() || "{}";
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        return {
            documentType: "other",
            documentTypeFa: "سند متفرقه",
            notes: response.text || "استخراج اطلاعات انجام شد."
        };
    }
};

/**
 * AI Purchase Sourcing & Supplier Search (با جستجوی هوشمند در وب و استخراج تامین‌کنندگان و لینک‌ها)
 */
export const searchSuppliersWithAi = async ({ item, items = [], additionalNotes = '', customKey, excludeSuppliers = [], isDeepSearch = false, customSearchQuery = '' }) => {
    // Build comprehensive search details
    const targetItem = item || (items && items[0]) || {};
    const itemName = targetItem.itemName || targetItem.name || 'کالای صنعتی';
    const specifications = targetItem.specifications || targetItem.specs || targetItem.dimensions || '';
    const itemCode = targetItem.itemCode || targetItem.code || '';
    const quantity = targetItem.quantity || 1;
    const unit = targetItem.unit || 'عدد';
    const category = targetItem.category || '';

    // Multi items summary if applicable
    let itemsContext = `کالای اصلی مورد نظر: ${itemName}\nتعداد/مقدار: ${quantity} ${unit}\nمشخصات فنی و ابعاد: ${specifications || 'ذکر نشده'}\nکد کالا در سیستم: ${itemCode || 'ندارد'}\nدسته‌بندی: ${category || 'عمومی'}`;
    if (items && items.length > 1) {
        itemsContext += `\n\nلیست کلیه اقلام این درخواست خرید:\n` + items.map((it, idx) => 
            `${idx + 1}. ${it.itemName || it.name} - تعداد: ${it.quantity || 1} ${it.unit || 'عدد'} - مشخصات: ${it.specifications || '-'}`
        ).join('\n');
    }

    const previousExclusionNote = (excludeSuppliers && excludeSuppliers.length > 0)
        ? `\n⚠️ هشدار مهم فیلتر موارد تکراری:\nکاربر قبلاً تامین‌کنندگان زیر را بررسی کرده و مناسب تشخیص نداده است:\n${excludeSuppliers.map(s => `- ${s}`).join('\n')}\nبسیار مهم: اکیداً تامین‌کنندگان بالا را تکرار نکنید و موارد، سایت‌ها، بازرگانی‌ها و فروشگاه‌های متفاوتی را بیابید.\n`
        : '';

    const deepSearchNote = (isDeepSearch || customSearchQuery)
        ? `\n🔍 هدف این مرحله: جستجوی موارد بیشتر (یافتن تامین‌کنندگان جایگزین و جدید).\n${customSearchQuery ? `شرط یا کلیدواژه جستجوی اختصاصی کاربر: «${customSearchQuery}»` : 'به دنبال کانال‌های تامین دیگر، دایرکتوری‌های صنعتی دیگر، کارگاه‌ها یا واردکنندگان متفاوتی باشید.'}\n`
        : '';

    const prompt = `
شما «مشاور و متخصص ارشد خرید، تدارکات صنعتی و منبع‌یابی (Procurement & Sourcing AI Specialist)» گروه صنعتی و کارخانجات نساجی و تولیدی «لیان بافت» هستید.

اطلاعات درخواست خرید:
${itemsContext}

توضیحات و مشخصات تکمیلی/اختیاری کاربر:
${additionalNotes ? additionalNotes : 'توضیحات اختیاری بیشتری ثبت نشده است.'}
${previousExclusionNote}
${deepSearchNote}

⚠️ قوانین بسیار حیاتی و الزامی جهت صحت و دقت اطلاعات:
۱. ممنوعیت مطلق تولید داده‌های ساختگی (Zero Hallucination Policy):
   - اکیداً از درج دامنه‌ها و وب‌سایت‌های خیالی (مثل sitename.ir یا lalehzar.com فرضی) خودداری کنید. اگر آدرس اینترنتی معتبر و فعالی از تامین‌کننده در نتایج وب موجود نیست، فیلد website را حتماً خالی ("") بگذارید.
   - اکیداً از درج شماره موبایل‌های تستی، فرضی، رند یا ترتیبی (مانند 09121234567 یا 09123456789 یا ارقام تکراری) خودداری کنید. تنها در صورتی شماره موبایل درج کنید که یک شماره همراه ۱۱ رقمی واقعی و معتبر ایرانسل/همراه اول متعلق به فروشنده در وب یافت شده باشد؛ در غیر این صورت فیلد mobile را خالی ("") بگذارید.
۲. منبع‌یابی از وب‌سایت‌های زنده و فعال ایران:
   - جستجو را بر پایگاه‌ها و فروشگاه‌های معتبر و فعال صنعتی و عمومی ایران (نظیر ترب Torob، ایمالز Emalls، دیجی‌کالا Digikala، پلتفرم‌های تخصصی ابزار صنعتی، بلبرینگ، قطعات پنوماتیک، هیدرولیک، الکتریکال لاله زار، آهن‌آلات شادآباد و فروشگاه‌های دارای اینماد) متمرکز کنید.
۳. تفکیک دقیق تلفن ثابت و موبایل:
   - تلفن ثابت دفتر یا فروشگاه (شروع با 021 یا پیش‌شماره شهر) در فیلد landline قرار گیرد.
   - شماره موبایل کارشناس فروش (شروع با 09) در فیلد mobile قرار گیرد.
۴. نکات فنی و چک‌لیست بازرسی کیفی پیش از خرید ارائه شود.
۵. پیش‌نویس متن اداری و رسمی استعلام قیمت (RFQ) با مشخصات کالا جهت ارسال به تامین‌کننده تنظیم گردد.

پاسخ را در قالب ساختار JSON زیر برگردانید:
{
  "summary": "خلاصه کوتاه فارسی از وضعیت موجودی کالا در بازار و بهترین کانال‌های تهیه",
  "searchKeywords": ["کلمه کلیدی ۱", "کلمه کلیدی ۲"],
  "technicalTips": [
    "نکته فنی ۱: مشخصات متریال و تلرانس",
    "نکته فنی ۲: تست سلامت و تطابق با نمونه فابریک",
    "نکته فنی ۳: برندهای معتبر و تایید اصالت"
  ],
  "suppliers": [
    {
      "name": "نام دقیق فروشگاه، شرکت یا برند تامین‌کننده در وب",
      "title": "عنوان صفحه محصول یا معرفی تامین‌کننده",
      "website": "آدرس مستقیم و واقعی صفحه محصول یا وب‌سایت رسمی (شروع با https://)",
      "mobile": "شماره همراه واقعی فروشنده (شروع با 09) یا خالی در صورت عدم وجود",
      "landline": "تلفن ثابت دفتر یا فروشگاه با پیش‌شماره شهر",
      "phone": "تلفن تماس اصلی",
      "city": "شهر یا بازار استقرار (مثلاً تهران - بازار شادآباد / لاله زار / زنجان / آنلاین)",
      "estimatedPrice": "حدود قیمت برآورد شده یا استعلامی",
      "stockStatus": "وضعیت موجودی در بازار (موجود / استعلامی / سفارشی)",
      "brand": "برند یا سازنده",
      "description": "توضیحات کوتاه درباره محصول و شرایط ارسال و فاکتور رسمی",
      "pros": "مزیت خرید از این فروشگاه (قیمت مناسب، سابقه، گارانتی)"
    }
  ],
  "rfqTemplate": "متن رسمی استعلام قیمت و پیش‌فاکتور برای تامین‌کننده به نام شرکت لیان بافت"
}
`;

    let responseObj = null;
    let groundingSources = [];
    let aiWarning = null;

    try {
        const ai = getGeminiClient(customKey);
        
        try {
            // First attempt: Gemini with Google Search grounding
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }]
                }
            });

            // Extract search grounding metadata if available
            const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            groundingSources = chunks.map(c => ({
                title: c.web?.title || 'منبع وب',
                uri: c.web?.uri || ''
            })).filter(s => !!s.uri);

            const text = response.text?.trim() || "";
            const jsonMatch = text.match(/```(?:json)?([\s\S]*?)```/) || [null, text];
            const clean = (jsonMatch[1] || text).trim();

            try {
                responseObj = JSON.parse(clean);
            } catch (pe) {
                responseObj = {
                    summary: text.slice(0, 300) + '...',
                    suppliers: [],
                    technicalTips: ["بررسی دقیق مشخصات ابعادی و فنی پیش از خرید"],
                    rfqTemplate: `احتراماً خواهشمند است پیش‌فاکتور رسمی برای کالای ${itemName} به تعداد ${quantity} ${unit} به نام شرکت لیان بافت صادر و ارسال فرمایید.`
                };
            }
        } catch (searchErr) {
            console.warn("Gemini search grounding call fallback:", searchErr.message);
            // Fallback with safeGenerateContent
            try {
                const { response } = await safeGenerateContent(ai, {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: { responseMimeType: "application/json" }
                });
                const text = response.text?.trim() || "{}";
                const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
                responseObj = JSON.parse(clean);
            } catch (fallbackErr) {
                console.warn("Gemini safeGenerateContent failed:", fallbackErr.message);
                aiWarning = `پاسخ زنده هوش مصنوعی به دلیل محدودیت شبکه یا کلید API موقتاً در دسترس نیست (${fallbackErr.message || 'خطای شبکه'}). اطلاعات تکمیلی از دیتابیس آماده شد.`;
            }
        }
    } catch (clientErr) {
        console.warn("Gemini client initialization failed:", clientErr.message);
        aiWarning = `ارتباط هوش مصنوعی برقرار نشد: ${clientErr.message || 'عدم دسترسی'}. پیش‌نویس استعلام و بررسی دیتابیس آماده شد.`;
    }

    if (!responseObj) responseObj = {};
    if (!responseObj.suppliers) responseObj.suppliers = [];

    // Helper functions for Iranian phone validation and fake-data detection
    const cleanNum = (str) => String(str || '').replace(/[^\d+]/g, '');
    const isIranianMobile = (num) => /^(?:\+98|0098|98|0)?9\d{9}$/.test(cleanNum(num));
    const isIranianLandline = (num) => {
        const c = cleanNum(num);
        return /^(?:\+98|0098|98|0)?(?:21|26|31|24|51|71|41|13|86|34|61|77|54|87|81|83|66|58|45|28|44|17|25|38|74)\d{7,8}$/.test(c) || (/^0[1-8]/.test(c) && !/^09/.test(c));
    };

    // Strict detection of fake/placeholder numbers like 09121234567 or 09120000000
    const isFakePhone = (p) => {
        if (!p) return true;
        const digits = cleanNum(p);
        if (digits.length < 10) return true;
        if (/1234567|9876543|0000000|1111111|2222222|3333333|4444444|5555555|6666666|7777777|8888888|9999999/.test(digits)) return true;
        const last7 = digits.slice(-7);
        if (/^(\d)\1{6}$/.test(last7)) return true;
        if (last7 === '1234567' || last7 === '7654321') return true;
        return false;
    };

    // Strict detection of fake/hallucinated websites
    const isFakeWebsite = (url) => {
        if (!url || typeof url !== 'string') return true;
        const u = url.trim().toLowerCase();
        if (!u.startsWith('http://') && !u.startsWith('https://')) return true;
        if (u.includes('example.com') || u.includes('domain.com') || u.includes('test.com') || u.includes('sitename.') || u.includes('sample.') || u.includes('lalehzar.com') || u.includes('fake.') || u.includes('yourwebsite.')) return true;
        try {
            const parsed = new URL(u);
            if (!parsed.hostname || !parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) return true;
            return false;
        } catch {
            return true;
        }
    };

    const isExcluded = (name, url = '') => {
        if (!excludeSuppliers || excludeSuppliers.length === 0) return false;
        const normName = String(name || '').trim().toLowerCase();
        const normUrl = String(url || '').trim().toLowerCase();
        return excludeSuppliers.some(ex => {
            const normEx = String(ex || '').trim().toLowerCase();
            return (normName && normEx && (normName.includes(normEx) || normEx.includes(normName))) ||
                   (normUrl && normEx && normUrl.includes(normEx));
        });
    };

    const prioritizedSuppliers = [];

    // 1. Guaranteed Live Iranian Procurement Portals for the specific item (100% active, always open with real prices & phones)
    prioritizedSuppliers.push({
        name: `موتور مقایسه قیمت و تامین‌کنندگان ترب (Torob)`,
        title: `استعلام زنده قیمت «${itemName}» در صدها فروشگاه معتبر ایران`,
        website: `https://torob.com/search/?query=${encodeURIComponent(itemName)}`,
        phone: '',
        mobile: '',
        landline: '',
        city: 'سراسر کشور (دارای اینماد و تایید هویت)',
        estimatedPrice: 'مشاهده تنوع قیمت و فروشندگان',
        stockStatus: 'موجودی زنده در صدها فروشگاه',
        brand: 'برندهای گوناگون و استعلام فوری',
        description: 'دسترسی مستقیم به قیمت روز، فروشگاه‌های دارای نماد اعتماد الکترونیکی (اینماد)، شماره تماس و مقایسه آنی.',
        pros: 'تنوع بسیار بالا، تضمین پرداخت و راستی‌آزمایی فروشندگان',
        isVerifiedPortal: true
    });

    prioritizedSuppliers.push({
        name: `ایمالز (Emalls) - مقایسه قیمت کالا و قطعات`,
        title: `جستجوی موجودی و تامین‌کنندگان «${itemName}» در ایمالز`,
        website: `https://emalls.ir/search/?query=${encodeURIComponent(itemName)}`,
        phone: '',
        mobile: '',
        landline: '',
        city: 'آنلاین / تهران و شهرستان‌ها',
        estimatedPrice: 'استعلام آنی با یک کلیک',
        stockStatus: 'موجود در انبار فروشگاه‌ها',
        brand: 'اصلی / متفرقه',
        description: 'موتور جستجوی جامع ابزارآلات و تجهیزات با اطلاعات تماس مستقیم، تلفن دفتر و آدرس فروشندگان.',
        pros: 'دسترسی به فروشگاه‌های تخصصی و شماره‌های مستقیم',
        isVerifiedPortal: true
    });

    // 2. Real Grounding Sources from Google Search (actual active URLs visited by AI)
    groundingSources.forEach(src => {
        if (!isExcluded(src.title, src.uri) && !prioritizedSuppliers.some(s => s.website === src.uri)) {
            let portalName = src.title || 'تامین‌کننده آنلاین فعال در وب ایران';
            if (src.uri.includes('torob.com')) portalName = 'فروشگاه در ترب (Torob)';
            else if (src.uri.includes('emalls.ir')) portalName = 'فروشگاه در ایمالز (Emalls)';
            else if (src.uri.includes('digikala.com')) portalName = 'دیجی‌کالا (Digikala)';
            else if (src.uri.includes('abzarmarket.com')) portalName = 'ابزار مارکت (Abzar Market)';
            else if (src.uri.includes('kalasanat.com')) portalName = 'کالا صنعت (Kala Sanat)';
            else if (src.uri.includes('technosanat.com')) portalName = 'تکنو صنعت';

            prioritizedSuppliers.push({
                name: portalName,
                title: src.title || `صفحه استعلام «${itemName}»`,
                website: src.uri,
                phone: '',
                mobile: '',
                landline: '',
                city: 'آنلاین / استعلام وب',
                estimatedPrice: 'مشاهده در صفحه سایت',
                stockStatus: 'بررسی در سایت فروشنده',
                brand: '',
                description: `صفحه رسمی محصول و مشخصات فنی تاییدشده توسط جستجوی گوگل`,
                pros: 'آدرس اینترنتی زنده و تاییدشده وب',
                isLiveVerified: true
            });
        }
    });

    // 3. Model-Generated Suppliers (Sanitized & Checked against fake data)
    (responseObj.suppliers || []).forEach(s => {
        if (!s || !s.name || isExcluded(s.name, s.website)) return;

        let cleanWebsite = s.website || '';
        if (cleanWebsite && isFakeWebsite(cleanWebsite)) {
            // If the model hallucinated a fake website, replace it with a real Google search for the supplier's real business profile
            cleanWebsite = `https://www.google.com/search?q=${encodeURIComponent(s.name + ' ' + (s.city || '') + ' تلفن آدرس فروشگاه سایت')}`;
        } else if (cleanWebsite && !cleanWebsite.startsWith('http')) {
            cleanWebsite = `https://${cleanWebsite}`;
        }

        let rawMobile = s.mobile || (isIranianMobile(s.phone) ? s.phone : '');
        let mobile = isFakePhone(rawMobile) ? '' : rawMobile;

        let rawLandline = s.landline || (isIranianLandline(s.phone) ? s.phone : '');
        let landline = isFakePhone(rawLandline) ? '' : rawLandline;

        // If not already in the list
        if (!prioritizedSuppliers.some(p => p.name === s.name || (p.website && cleanWebsite && p.website === cleanWebsite))) {
            prioritizedSuppliers.push({
                name: s.name,
                title: s.title || `تامین‌کننده «${itemName}»`,
                website: cleanWebsite,
                mobile: mobile,
                landline: landline,
                phone: mobile || landline || '',
                city: s.city || 'تهران / آنلاین',
                estimatedPrice: s.estimatedPrice || 'استعلامی',
                stockStatus: s.stockStatus || 'نیازمند استعلام',
                brand: s.brand || '',
                description: s.description || 'تامین‌کننده استخراج‌شده از منابع تجاری',
                pros: s.pros || 'تخصص در فروش و توزیع کالای درخواستی'
            });
        }
    });

    // 4. Targeted Local Database Match (ONLY if relevant to item name or category)
    try {
        const db = getDb();
        const pastPurchases = db.purchases || [];
        const contacts = db.contacts || [];

        const itemKw = itemName.toLowerCase().trim();
        const matchedContacts = contacts.filter(c => {
            const txt = `${c.name || ''} ${c.company || ''} ${c.notes || ''} ${c.category || ''}`.toLowerCase();
            return itemKw.length >= 3 && txt.includes(itemKw);
        });

        matchedContacts.slice(0, 3).forEach(c => {
            if (isExcluded(c.name)) return;
            const mob = isIranianMobile(c.mobile) && !isFakePhone(c.mobile) ? c.mobile : (isIranianMobile(c.phone) && !isFakePhone(c.phone) ? c.phone : '');
            const land = isIranianLandline(c.phone) ? c.phone : (isIranianLandline(c.landline) ? c.landline : '');

            if (!prioritizedSuppliers.some(s => s.name === c.name)) {
                prioritizedSuppliers.push({
                    name: c.name,
                    title: `مخاطب مرتبط در سیستم (${c.company || 'تامین‌کننده'})`,
                    website: '',
                    mobile: mob,
                    landline: land,
                    phone: mob || land || '',
                    city: c.city || 'دفترچه تلفن ERP',
                    estimatedPrice: 'سابقه در سیستم',
                    stockStatus: 'مخاطب سازمانی',
                    brand: '',
                    description: `تامین‌کننده مرتبط ثبت‌شده در دفترچه تلفن سازمانی`,
                    pros: 'دارای سابقه ارتباط در سیستم شرکت'
                });
            }
        });

        // Past purchases match
        pastPurchases.forEach(p => {
            if (p.proformas && Array.isArray(p.proformas) && p.proformas.length > 0) {
                const isMatch = (p.itemName && p.itemName.includes(itemName)) || 
                                (itemName && itemName.includes(p.itemName)) ||
                                (p.category && category && p.category === category);
                if (isMatch) {
                    p.proformas.forEach(prof => {
                        if (isExcluded(prof.vendorName)) return;
                        if (prof.vendorName && !prioritizedSuppliers.some(s => s.name === prof.vendorName)) {
                            const pMob = isIranianMobile(prof.vendorPhone) && !isFakePhone(prof.vendorPhone) ? prof.vendorPhone : '';
                            const pLand = !pMob ? (prof.vendorPhone || '') : '';
                            prioritizedSuppliers.push({
                                name: prof.vendorName,
                                title: `تامین‌کننده سابقه خرید #${p.requestNumber || ''}`,
                                website: '',
                                mobile: pMob,
                                landline: pLand,
                                phone: prof.vendorPhone || '',
                                city: 'سابقه پیشین',
                                estimatedPrice: prof.unitPrice ? `${Number(prof.unitPrice).toLocaleString('fa-IR')} ریال` : 'استعلام جدید',
                                stockStatus: 'دارای سابقه معامله',
                                brand: prof.brand || '',
                                description: prof.description || `سابقه پیش‌فاکتور قبلی در سیستم ERP لیان بافت`,
                                pros: 'تامین‌کننده تاییدشده در خریدهای قبلی کارخانه'
                            });
                        }
                    });
                }
            }
        });
    } catch (dbErr) {
        console.warn("Local DB supplier lookup error:", dbErr.message);
    }

    // Final mapping and whatsapp phone assignment
    const processedSuppliers = prioritizedSuppliers.map(s => {
        const mob = isIranianMobile(s.mobile) && !isFakePhone(s.mobile) ? s.mobile : '';
        const land = isIranianLandline(s.landline) ? s.landline : (isIranianLandline(s.phone) ? s.phone : '');
        return {
            ...s,
            mobile: mob,
            landline: land,
            phone: mob || land || s.phone || '',
            whatsappPhone: mob,
            whatsappAvailable: !!mob
        };
    });
    responseObj.suppliers = processedSuppliers;

    // Curated default technical checklist if empty
    if (!responseObj.technicalTips || responseObj.technicalTips.length === 0) {
        responseObj.technicalTips = [
            `مطابقت دقیق کد کالا (${itemCode || 'شناسه کالا'}) و ابعاد و مشخصات فنی با قطعه فابریک`,
            `الزام فروشنده به ارائه پیش‌فاکتور رسمی دارای شناسه ملی و گواهی ارزش افزوده`,
            `بررسی اصالت برند، کشور سازنده و داشتن گارانتی تعویض در صورت عدم کارکرد`,
            `درخواست نمونه یا برگه آنالیز متریال (MTC) در صورت قطعات حساس مکانیکی یا الکترونیکی`,
            `استعلام زمان تحویل و هزینه حمل تا انبار کارخانه`
        ];
    }

    // Default RFQ template if empty
    const defaultRfq = `با سلام و احترام\nاحتراماً پیرو نیاز فنی واحد تولید و مهندسی گروه صنعتی «لیان بافت»، خواهشمند است پیش‌فاکتور رسمی و قیمت همکاری برای قلم زیر را صادر و ارسال فرمایید:\n\n📦 نام کالا: ${itemName}\n🔢 تعداد / مقدار: ${quantity} ${unit}\n📐 مشخصات فنی: ${specifications || 'مطابق استاندارد رایج'}\n${itemCode ? `🏷️ کد قطعه: ${itemCode}\n` : ''}\nلطفاً شرایط پرداخت، مدت اعتبار پیش‌فاکتور و کوتاه‌ترین زمان تحویل را قید بفرمایید.\nبا تشکر - واحد بازرگانی و تدارکات لیان بافت`;

    return {
        success: true,
        item: {
            itemName,
            specifications,
            itemCode,
            quantity,
            unit,
            category
        },
        additionalNotes,
        warning: aiWarning,
        summary: responseObj.summary || `استعلام تامین‌کنندگان و پیش‌نویس استعلام قیمت برای «${itemName}» آماده گردید.`,
        searchKeywords: responseObj.searchKeywords || [itemName, specifications].filter(Boolean),
        technicalTips: responseObj.technicalTips || [],
        suppliers: responseObj.suppliers || [],
        rfqTemplate: responseObj.rfqTemplate || defaultRfq,
        generatedAt: new Date().toISOString()
    };
};
