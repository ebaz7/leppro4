import {
  ErpAccount,
  ErpAccountCategory,
  ErpAccountLayerConfig,
  ErpAccountLevel,
  ErpAccountingSettings,
  ErpParty,
  ErpProductionVoucher,
  ErpSupportingDoc,
  ErpTradeDoc,
  ErpTreasuryDoc,
  ErpVoucher,
  ErpVoucherLine,
  ErpVoucherType,
  ErpWarehouseDocument,
  IndustrialErpState,
  getTodayJalali
} from '../types';
import { printHtmlInPage } from '../../../utils/pdfGenerator';

export const DEFAULT_ACCOUNTING_LAYERS: ErpAccountLayerConfig[] = [
  { depth: 1, title: 'گروه حساب', codeLength: 1, isTafsilLayer: false, description: 'سطح کلان ترازنامه و سود و زیان (۱ تا ۹)' },
  { depth: 2, title: 'حساب کل', codeLength: 2, isTafsilLayer: false, description: 'سرفصل‌های دفتر کل استاندارد دارایی' },
  { depth: 3, title: 'حساب معین', codeLength: 4, isTafsilLayer: false, description: 'تفکیک عملیاتی هر حساب کل' },
  { depth: 4, title: 'تفصیل سطح ۱', codeLength: 6, isTafsilLayer: true, description: 'بانک‌ها، انبارها، اشخاص، خطوط تولید' },
  { depth: 5, title: 'زیرتفصیل سطح ۲', codeLength: 8, isTafsilLayer: true, description: 'شعب، دستگاه‌ها، قراردادها، مراکز هزینه فرعی' },
  { depth: 6, title: 'زیرتفصیل سطح ۳', codeLength: 10, isTafsilLayer: true, description: 'سطوح عمیق‌تر پروژه، پارت تولید و زیرمجموعه‌ها' }
];

export const DEFAULT_ACCOUNTING_SETTINGS: Required<
  Pick<
    ErpAccountingSettings,
    'layers' | 'allowEditFinalizedVoucher' | 'lockedFiscalYears' | 'autoVoucherEnabled' | 'defaultAccounts' | 'supportingDocs'
  >
> & { chartOfAccountsCustomized?: boolean } = {
  chartOfAccountsCustomized: false,
  layers: DEFAULT_ACCOUNTING_LAYERS,
  allowEditFinalizedVoucher: true,
  lockedFiscalYears: [],
  autoVoucherEnabled: {
    sales: true,
    purchase: true,
    warehouse: true,
    production: true,
    treasury: true,
    payroll: true
  },
  defaultAccounts: {
    cashBank: '1101',
    receivable: '1102',
    payable: '2101',
    inventoryRaw: '110301',
    inventoryFinished: '110303',
    wipProduction: '110302',
    salesRevenue: '5101',
    salesReturn: '5102',
    cogs: '6104',
    directMaterial: '6101',
    directLabor: '6102',
    factoryOverhead: '6103',
    adminExpense: '7101',
    vatReceivable: '1105',
    vatPayable: '2103',
    incomeSummary: '3103',
    retainedEarnings: '3102',
    openingClosing: '9101'
  },
  supportingDocs: []
};

export function getEffectiveAccountingSettings(erpState: IndustrialErpState): typeof DEFAULT_ACCOUNTING_SETTINGS {
  const saved = erpState.cutoverConfig?.accountingSettings;
  return {
    chartOfAccountsCustomized: Boolean(
      erpState.cutoverConfig?.chartOfAccountsCustomized || saved?.chartOfAccountsCustomized
    ),
    layers:
      Array.isArray(saved?.layers) && saved!.layers.length > 0
        ? saved!.layers
        : DEFAULT_ACCOUNTING_LAYERS,
    allowEditFinalizedVoucher:
      saved?.allowEditFinalizedVoucher !== undefined ? saved.allowEditFinalizedVoucher : true,
    lockedFiscalYears: Array.isArray(saved?.lockedFiscalYears) ? saved!.lockedFiscalYears : [],
    autoVoucherEnabled: {
      ...DEFAULT_ACCOUNTING_SETTINGS.autoVoucherEnabled,
      ...(saved?.autoVoucherEnabled || {})
    },
    defaultAccounts: {
      ...DEFAULT_ACCOUNTING_SETTINGS.defaultAccounts,
      ...(saved?.defaultAccounts || {})
    },
    supportingDocs: Array.isArray(saved?.supportingDocs) ? saved!.supportingDocs : []
  };
}

export const STANDARD_IRANIAN_INDUSTRIAL_COA: ErpAccount[] = [
  // 1 - Assets
  { id: 'std_1', code: '1', title: 'دارایی‌ها', level: 'GROUP', layerDepth: 1, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_10', code: '10', title: 'دارایی‌های جاری', level: 'KOL', parentCode: '1', layerDepth: 2, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_1101', code: '1101', title: 'موجودی نقد و بانک‌ها', level: 'MOEIN', parentCode: '10', layerDepth: 3, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, tafsilRequired: true, isActive: true },
  { id: 'acc_110101', code: '110101', title: 'بانک جاری عامل اصلی', level: 'TAFZILI', parentCode: '1101', layerDepth: 4, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_110102', code: '110102', title: 'صندوق و تنخواه‌گردان کارخانه', level: 'TAFZILI', parentCode: '1101', layerDepth: 4, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_1102', code: '1102', title: 'حساب‌ها و اسناد دریافتنی تجاری', level: 'MOEIN', parentCode: '10', layerDepth: 3, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, tafsilRequired: true, isActive: true },
  { id: 'acc_110201', code: '110201', title: 'بدهکاران تجاری (مشتریان)', level: 'TAFZILI', parentCode: '1102', layerDepth: 4, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, tafsilRequired: true, isActive: true },
  { id: 'acc_110202', code: '110202', title: 'اسناد دریافتنی (چک‌های نزد صندوق/بانک)', level: 'TAFZILI', parentCode: '1102', layerDepth: 4, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, tafsilRequired: true, isActive: true },
  { id: 'acc_1103', code: '1103', title: 'موجودی مواد و کالا', level: 'MOEIN', parentCode: '10', layerDepth: 3, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_110301', code: '110301', title: 'موجودی مواد اولیه و ملزومات تولید', level: 'TAFZILI', parentCode: '1103', layerDepth: 4, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_110302', code: '110302', title: 'کالای در جریان ساخت (WIP)', level: 'TAFZILI', parentCode: '1103', layerDepth: 4, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_110303', code: '110303', title: 'موجودی کالای ساخته‌شده (محصول نهایی)', level: 'TAFZILI', parentCode: '1103', layerDepth: 4, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_110304', code: '110304', title: 'موجودی ضایعات قابل فروش', level: 'TAFZILI', parentCode: '1103', layerDepth: 4, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_1104', code: '1104', title: 'پیش‌پرداخت‌ها و سفارشات خرید', level: 'MOEIN', parentCode: '10', layerDepth: 3, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_1105', code: '1105', title: 'مالیات بر ارزش افزوده خرید (اعتبار مالیاتی)', level: 'MOEIN', parentCode: '10', layerDepth: 3, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_12', code: '12', title: 'دارایی‌های غیرجاری (ثابت مشهود)', level: 'KOL', parentCode: '1', layerDepth: 2, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_1201', code: '1201', title: 'ماشین‌آلات و تجهیزات خطوط تولید', level: 'MOEIN', parentCode: '12', layerDepth: 3, category: 'ASSET', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_1202', code: '1202', title: 'استهلاک انباشته دارایی‌های ثابت', level: 'MOEIN', parentCode: '12', layerDepth: 3, category: 'ASSET', nature: 'CREDIT', acceptsVoucher: true, isActive: true },

  // 2 - Liabilities
  { id: 'std_2', code: '2', title: 'بدهی‌ها', level: 'GROUP', layerDepth: 1, category: 'LIABILITY', nature: 'CREDIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_20', code: '20', title: 'بدهی‌های جاری', level: 'KOL', parentCode: '2', layerDepth: 2, category: 'LIABILITY', nature: 'CREDIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_2101', code: '2101', title: 'حساب‌ها و اسناد پرداختنی تجاری', level: 'MOEIN', parentCode: '20', layerDepth: 3, category: 'LIABILITY', nature: 'CREDIT', acceptsVoucher: true, tafsilRequired: true, isActive: true },
  { id: 'acc_210101', code: '210101', title: 'بستانکاران تجاری (تامین‌کنندگان)', level: 'TAFZILI', parentCode: '2101', layerDepth: 4, category: 'LIABILITY', nature: 'CREDIT', acceptsVoucher: true, tafsilRequired: true, isActive: true },
  { id: 'acc_210102', code: '210102', title: 'اسناد پرداختنی (چک‌های صادره)', level: 'TAFZILI', parentCode: '2101', layerDepth: 4, category: 'LIABILITY', nature: 'CREDIT', acceptsVoucher: true, tafsilRequired: true, isActive: true },
  { id: 'acc_2102', code: '2102', title: 'سایر حساب‌های پرداختنی (حقوق، بیمه، مالیات)', level: 'MOEIN', parentCode: '20', layerDepth: 3, category: 'LIABILITY', nature: 'CREDIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_2103', code: '2103', title: 'مالیات بر ارزش افزوده فروش (بدهی مالیاتی)', level: 'MOEIN', parentCode: '20', layerDepth: 3, category: 'LIABILITY', nature: 'CREDIT', acceptsVoucher: true, isActive: true },

  // 3 - Equity
  { id: 'std_3', code: '3', title: 'حقوق صاحبان سهام و سرمایه', level: 'GROUP', layerDepth: 1, category: 'EQUITY', nature: 'CREDIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_30', code: '30', title: 'سرمایه و اندوخته‌ها', level: 'KOL', parentCode: '3', layerDepth: 2, category: 'EQUITY', nature: 'CREDIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_3101', code: '3101', title: 'سرمایه ثبت‌شده شرکت', level: 'MOEIN', parentCode: '30', layerDepth: 3, category: 'EQUITY', nature: 'CREDIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_3102', code: '3102', title: 'سود (زیان) انباشته', level: 'MOEIN', parentCode: '30', layerDepth: 3, category: 'EQUITY', nature: 'BOTH', acceptsVoucher: true, isActive: true },
  { id: 'acc_3103', code: '3103', title: 'خلاصه سود و زیان دوره مالی', level: 'MOEIN', parentCode: '30', layerDepth: 3, category: 'EQUITY', nature: 'BOTH', acceptsVoucher: true, isActive: true },

  // 5 - Revenue
  { id: 'std_5', code: '5', title: 'درآمدها و فروش', level: 'GROUP', layerDepth: 1, category: 'REVENUE', nature: 'CREDIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_50', code: '50', title: 'درآمد فروش محصولات و خدمات', level: 'KOL', parentCode: '5', layerDepth: 2, category: 'REVENUE', nature: 'CREDIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_5101', code: '5101', title: 'فروش ناخالص محصولات تولیدی', level: 'MOEIN', parentCode: '50', layerDepth: 3, category: 'REVENUE', nature: 'CREDIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_5102', code: '5102', title: 'برگشت از فروش و تخفیفات تجاری', level: 'MOEIN', parentCode: '50', layerDepth: 3, category: 'REVENUE', nature: 'DEBIT', acceptsVoucher: true, isActive: true },

  // 6 - Industrial Costing / COGS
  { id: 'std_6', code: '6', title: 'بهای تمام‌شده و حسابداری صنعتی', level: 'GROUP', layerDepth: 1, category: 'COGS', nature: 'DEBIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_60', code: '60', title: 'بهای تمام‌شده تولید و فروش', level: 'KOL', parentCode: '6', layerDepth: 2, category: 'COGS', nature: 'DEBIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_6101', code: '6101', title: 'مواد اولیه مستقیم مصرفی تولید', level: 'MOEIN', parentCode: '60', layerDepth: 3, category: 'COGS', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_6102', code: '6102', title: 'دستمزد مستقیم خطوط تولید', level: 'MOEIN', parentCode: '60', layerDepth: 3, category: 'COGS', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_6103', code: '6103', title: 'سربار ساخت و تولید کارخانه', level: 'MOEIN', parentCode: '60', layerDepth: 3, category: 'COGS', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_6104', code: '6104', title: 'بهای تمام‌شده کالای فروش‌رفته (COGS)', level: 'MOEIN', parentCode: '60', layerDepth: 3, category: 'COGS', nature: 'DEBIT', acceptsVoucher: true, isActive: true },

  // 7 - Operating & Admin Expenses
  { id: 'std_7', code: '7', title: 'هزینه‌های عملیاتی، اداری و فروش', level: 'GROUP', layerDepth: 1, category: 'EXPENSE', nature: 'DEBIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_70', code: '70', title: 'هزینه‌های اداری، عمومی و توزیع', level: 'KOL', parentCode: '7', layerDepth: 2, category: 'EXPENSE', nature: 'DEBIT', acceptsVoucher: false, isActive: true },
  { id: 'acc_7101', code: '7101', title: 'هزینه‌های اداری، حقوق ستاد و عمومی', level: 'MOEIN', parentCode: '70', layerDepth: 3, category: 'EXPENSE', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_7102', code: '7102', title: 'هزینه‌های فروش، حمل و بازاریابی', level: 'MOEIN', parentCode: '70', layerDepth: 3, category: 'EXPENSE', nature: 'DEBIT', acceptsVoucher: true, isActive: true },
  { id: 'acc_7103', code: '7103', title: 'هزینه استهلاک ماشین‌آلات و اموال', level: 'MOEIN', parentCode: '70', layerDepth: 3, category: 'EXPENSE', nature: 'DEBIT', acceptsVoucher: true, isActive: true },

  // 9 - Disciplinary / Opening-Closing
  { id: 'std_9', code: '9', title: 'حساب‌های انتظامی و کنترلی پایان دوره', level: 'GROUP', layerDepth: 1, category: 'DISCIPLINARY', nature: 'BOTH', acceptsVoucher: false, isActive: true },
  { id: 'acc_90', code: '90', title: 'حساب‌های افتتاحیه، اختتامیه و تضامین', level: 'KOL', parentCode: '9', layerDepth: 2, category: 'DISCIPLINARY', nature: 'BOTH', acceptsVoucher: false, isActive: true },
  { id: 'acc_9101', code: '9101', title: 'تراز افتتاحیه و اختتامیه دوره مالی', level: 'MOEIN', parentCode: '90', layerDepth: 3, category: 'DISCIPLINARY', nature: 'BOTH', acceptsVoucher: true, isActive: true }
];

export const VOUCHER_TYPE_META: Record<
  ErpVoucherType,
  { label: string; shortLabel: string; accent: string }
> = {
  GENERAL: { label: 'سند عمومی (روزانه)', shortLabel: 'عمومی', accent: 'text-slate-700 dark:text-slate-200' },
  AUTO_FINANCIAL: { label: 'سند اتوماتیک مالی', shortLabel: 'اتوماتیک مالی', accent: 'text-indigo-700 dark:text-indigo-300' },
  PRODUCTION: { label: 'سند تولید و صنعتی', shortLabel: 'تولید / صنعتی', accent: 'text-orange-700 dark:text-orange-300' },
  WAREHOUSE: { label: 'سند حسابداری انبار', shortLabel: 'انبار', accent: 'text-teal-700 dark:text-teal-300' },
  SALES: { label: 'سند فروش', shortLabel: 'فروش', accent: 'text-emerald-700 dark:text-emerald-300' },
  PURCHASE: { label: 'سند خرید', shortLabel: 'خرید', accent: 'text-blue-700 dark:text-blue-300' },
  TREASURY: { label: 'سند خزانه‌داری و بانک', shortLabel: 'خزانه', accent: 'text-cyan-700 dark:text-cyan-300' },
  PAYROLL: { label: 'سند حقوق و دستمزد', shortLabel: 'حقوق', accent: 'text-purple-700 dark:text-purple-300' },
  RETURN: { label: 'سند برگشت از فروش / خرید', shortLabel: 'برگشتی', accent: 'text-amber-700 dark:text-amber-300' },
  OPENING_CUTOVER: { label: 'سند افتتاحیه', shortLabel: 'افتتاحیه', accent: 'text-sky-700 dark:text-sky-300' },
  CLOSING: { label: 'سند اختتامیه و بستن حساب', shortLabel: 'اختتامیه', accent: 'text-rose-700 dark:text-rose-300' },
  ADJUSTMENT: { label: 'سند اصلاحی و تسهیم', shortLabel: 'اصلاحی / تسهیم', accent: 'text-violet-700 dark:text-violet-300' }
};

export const VOUCHER_STATUS_META: Record<
  ErpVoucher['status'],
  { label: string; textClass: string }
> = {
  DRAFT: { label: 'پیش‌نویس', textClass: 'text-amber-700 dark:text-amber-300' },
  TEMPORARY: { label: 'موقت', textClass: 'text-blue-700 dark:text-blue-300' },
  FINALIZED: { label: 'قطعی', textClass: 'text-emerald-700 dark:text-emerald-300' }
};

export const ACCOUNT_CATEGORY_META: Record<ErpAccountCategory, { label: string; defaultNature: ErpAccount['nature'] }> = {
  ASSET: { label: 'دارایی (ترازنامه‌ای)', defaultNature: 'DEBIT' },
  LIABILITY: { label: 'بدهی (ترازنامه‌ای)', defaultNature: 'CREDIT' },
  EQUITY: { label: 'حقوق صاحبان سهام (ترازنامه‌ای)', defaultNature: 'CREDIT' },
  REVENUE: { label: 'درآمد و فروش (سود و زیانی)', defaultNature: 'CREDIT' },
  COGS: { label: 'بهای تمام‌شده و تولید صنعتی', defaultNature: 'DEBIT' },
  EXPENSE: { label: 'هزینه عملیاتی و اداری', defaultNature: 'DEBIT' },
  DISCIPLINARY: { label: 'انتظامی / افتتاحیه و اختتامیه', defaultNature: 'BOTH' }
};

export const PARTY_TYPE_META: Record<ErpParty['type'], { label: string }> = {
  GROUP: { label: 'سرفصل / گروه تفصیل' },
  CUSTOMER: { label: 'مشتری / خریدار' },
  SUPPLIER: { label: 'تامین‌کننده / فروشنده' },
  COST_CENTER: { label: 'مرکز هزینه / خط تولید' },
  PERSONNEL: { label: 'پرسنل / کارمند' },
  BANK: { label: 'بانک / صندوق / تنخواه' },
  PROJECT: { label: 'پروژه / قرارداد' },
  PRODUCT: { label: 'کالا / محصول / پارت' },
  OTHER: { label: 'سایر تفصیلی‌ها' }
};

export const SUPPORTING_DOC_TYPE_META: Record<ErpSupportingDoc['docType'], { label: string }> = {
  INVOICE: { label: 'فاکتور فروش / خرید' },
  BANK_RECEIPT: { label: 'فیش / رسید بانکی و چک' },
  CONTRACT: { label: 'قرارداد و الحاقیه' },
  WAYBILL: { label: 'بارنامه و قبض باسکول' },
  PAYSLIP: { label: 'لیست حقوق و بیمه' },
  TAX_BILL: { label: 'اظهارنامه / قبض مالیاتی' },
  OTHER: { label: 'سایر اسناد مثبته' }
};

export function inferAccountCategory(account: Partial<ErpAccount>): ErpAccountCategory {
  if (account.category) return account.category;
  const code = String(account.code || '').trim();
  if (code.startsWith('1')) return 'ASSET';
  if (code.startsWith('2')) return 'LIABILITY';
  if (code.startsWith('3')) return 'EQUITY';
  if (code.startsWith('4') || code.startsWith('5')) return 'REVENUE';
  if (code.startsWith('6')) return 'COGS';
  if (code.startsWith('7') || code.startsWith('8')) return 'EXPENSE';
  return 'DISCIPLINARY';
}

export function inferAccountDepth(account: ErpAccount, byCode: Map<string, ErpAccount>, byId: Map<string, ErpAccount>): number {
  if (typeof account.layerDepth === 'number' && account.layerDepth >= 1) return account.layerDepth;
  let depth = 1;
  let curr: ErpAccount | undefined = account;
  const visited = new Set<string>([account.id]);
  while (curr && (curr.parentId || curr.parentCode)) {
    const parent =
      (curr.parentId ? byId.get(curr.parentId) : undefined) ||
      (curr.parentCode ? byCode.get(curr.parentCode) : undefined);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    depth++;
    curr = parent;
    if (depth > 30) break;
  }
  if (depth === 1) {
    if (account.level === 'KOL') return 2;
    if (account.level === 'MOEIN') return 3;
    if (account.level === 'TAFZILI') return 4;
    if (account.level === 'SUB_TAFZILI') return 5;
  }
  return depth;
}

export function levelFromDepth(depth: number): ErpAccountLevel {
  if (depth <= 1) return 'GROUP';
  if (depth === 2) return 'KOL';
  if (depth === 3) return 'MOEIN';
  if (depth === 4) return 'TAFZILI';
  return 'SUB_TAFZILI';
}

export function getLevelDisplayTitle(
  account: ErpAccount,
  depth: number,
  layers: ErpAccountLayerConfig[] = DEFAULT_ACCOUNTING_LAYERS
): string {
  if (account.layerTitle) return account.layerTitle;
  const matched = layers.find(l => l.depth === depth);
  if (matched) return matched.title;
  if (depth <= 1) return 'گروه حساب';
  if (depth === 2) return 'حساب کل';
  if (depth === 3) return 'حساب معین';
  if (depth === 4) return 'تفصیل سطح ۱';
  return `زیرتفصیل سطح ${depth - 3}`;
}

export interface AccountTreeNode {
  account: ErpAccount;
  depth: number;
  children: AccountTreeNode[];
}

export function buildAccountTree(accounts: ErpAccount[]): AccountTreeNode[] {
  const sorted = [...(accounts || [])].sort((a, b) =>
    String(a.code || '').localeCompare(String(b.code || ''), 'en', { numeric: true })
  );
  const byId = new Map<string, ErpAccount>();
  const byCode = new Map<string, ErpAccount>();
  for (const acc of sorted) {
    byId.set(acc.id, acc);
    if (acc.code) byCode.set(acc.code, acc);
  }

  const nodeMap = new Map<string, AccountTreeNode>();
  for (const acc of sorted) {
    nodeMap.set(acc.id, { account: acc, depth: 1, children: [] });
  }

  const roots: AccountTreeNode[] = [];
  for (const acc of sorted) {
    const node = nodeMap.get(acc.id)!;
    let parent: ErpAccount | undefined;
    if (acc.parentId && acc.parentId !== acc.id) {
      parent = byId.get(acc.parentId);
    }
    if (!parent && acc.parentCode && acc.parentCode !== acc.code) {
      parent = byCode.get(acc.parentCode);
    }

    // Cycle check before attaching
    let isCycle = false;
    let cursor = parent;
    const seen = new Set<string>([acc.id]);
    while (cursor) {
      if (seen.has(cursor.id)) {
        isCycle = true;
        break;
      }
      seen.add(cursor.id);
      cursor =
        (cursor.parentId ? byId.get(cursor.parentId) : undefined) ||
        (cursor.parentCode ? byCode.get(cursor.parentCode) : undefined);
    }

    if (parent && !isCycle && nodeMap.has(parent.id)) {
      nodeMap.get(parent.id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const assignDepth = (nodes: AccountTreeNode[], depth: number) => {
    for (const n of nodes) {
      n.depth = depth;
      assignDepth(n.children, depth + 1);
    }
  };
  assignDepth(roots, 1);
  return roots;
}

export function getDescendantAccountIds(rootId: string, accounts: ErpAccount[]): Set<string> {
  const tree = buildAccountTree(accounts);
  const result = new Set<string>();
  const collect = (node: AccountTreeNode) => {
    result.add(node.account.id);
    for (const c of node.children) collect(c);
  };
  const findAndCollect = (nodes: AccountTreeNode[]): boolean => {
    for (const n of nodes) {
      if (n.account.id === rootId) {
        collect(n);
        return true;
      }
      if (findAndCollect(n.children)) return true;
    }
    return false;
  };
  findAndCollect(tree);
  return result;
}

export function getAccountBreadcrumb(account: ErpAccount, accounts: ErpAccount[]): string {
  const byId = new Map(accounts.map(a => [a.id, a]));
  const byCode = new Map(accounts.map(a => [a.code, a]));
  const parts: string[] = [];
  let curr: ErpAccount | undefined = account;
  const seen = new Set<string>();
  while (curr && !seen.has(curr.id)) {
    seen.add(curr.id);
    parts.unshift(`${curr.code} ${curr.title}`);
    curr =
      (curr.parentId ? byId.get(curr.parentId) : undefined) ||
      (curr.parentCode ? byCode.get(curr.parentCode) : undefined);
  }
  return parts.join(' / ');
}

export function suggestNextChildCode(
  parent: ErpAccount | null,
  allAccounts: ErpAccount[],
  layers: ErpAccountLayerConfig[] = DEFAULT_ACCOUNTING_LAYERS
): string {
  if (!parent) {
    const rootNums = allAccounts
      .filter(a => !a.parentCode && !a.parentId)
      .map(a => parseInt(a.code, 10))
      .filter(n => Number.isFinite(n));
    return String((rootNums.length > 0 ? Math.max(...rootNums) : 0) + 1);
  }
  const siblings = allAccounts.filter(
    a => a.parentId === parent.id || (!a.parentId && a.parentCode === parent.code)
  );
  const nextDepth = (parent.layerDepth || 1) + 1;
  const layerCfg = layers.find(l => l.depth === nextDepth);
  const parentLen = parent.code.length;
  const padWidth = layerCfg && layerCfg.codeLength > parentLen ? Math.min(4, layerCfg.codeLength - parentLen) : 2;

  let maxSuffix = 0;
  for (const s of siblings) {
    if (s.code.startsWith(parent.code)) {
      const tail = s.code.slice(parent.code.length).replace(/[^0-9]/g, '');
      const num = parseInt(tail, 10);
      if (Number.isFinite(num) && num > maxSuffix) maxSuffix = num;
    }
  }
  const used = new Set(allAccounts.map(a => a.code));
  let candidateNum = maxSuffix + 1;
  while (candidateNum < 99999) {
    const candidate = `${parent.code}${String(candidateNum).padStart(padWidth, '0')}`;
    if (!used.has(candidate)) return candidate;
    candidateNum++;
  }
  return `${parent.code}${Date.now().toString().slice(-3)}`;
}

// --- Unlimited-Depth Tafsil & Sub-Tafsil Tree ---
export interface TafsilTreeNode {
  party: ErpParty;
  depth: number;
  children: TafsilTreeNode[];
}

export function buildTafsilTree(parties: ErpParty[]): TafsilTreeNode[] {
  const sorted = [...(parties || [])].sort((a, b) =>
    String(a.code || '').localeCompare(String(b.code || ''), 'en', { numeric: true })
  );
  const byId = new Map<string, ErpParty>();
  const byCode = new Map<string, ErpParty>();
  for (const p of sorted) {
    byId.set(p.id, p);
    if (p.code) byCode.set(p.code, p);
  }
  const nodeMap = new Map<string, TafsilTreeNode>();
  for (const p of sorted) {
    nodeMap.set(p.id, { party: p, depth: 1, children: [] });
  }

  const roots: TafsilTreeNode[] = [];
  for (const p of sorted) {
    const node = nodeMap.get(p.id)!;
    let parent: ErpParty | undefined;
    if (p.parentId && p.parentId !== p.id) parent = byId.get(p.parentId);
    if (!parent && p.parentCode && p.parentCode !== p.code) parent = byCode.get(p.parentCode);

    let isCycle = false;
    let cur = parent;
    const seen = new Set<string>([p.id]);
    while (cur) {
      if (seen.has(cur.id)) {
        isCycle = true;
        break;
      }
      seen.add(cur.id);
      cur =
        (cur.parentId ? byId.get(cur.parentId) : undefined) ||
        (cur.parentCode ? byCode.get(cur.parentCode) : undefined);
    }

    if (parent && !isCycle && nodeMap.has(parent.id)) {
      nodeMap.get(parent.id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const assignDepth = (nodes: TafsilTreeNode[], depth: number) => {
    for (const n of nodes) {
      n.depth = depth;
      assignDepth(n.children, depth + 1);
    }
  };
  assignDepth(roots, 1);
  return roots;
}

export function getTafsilFullPath(party: ErpParty, allParties: ErpParty[]): string {
  const byId = new Map(allParties.map(p => [p.id, p]));
  const byCode = new Map(allParties.map(p => [p.code, p]));
  const parts: string[] = [];
  let cur: ErpParty | undefined = party;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    cur =
      (cur.parentId ? byId.get(cur.parentId) : undefined) ||
      (cur.parentCode ? byCode.get(cur.parentCode) : undefined);
  }
  return parts.join(' / ');
}

export function getDescendantTafsilIds(rootId: string, parties: ErpParty[]): Set<string> {
  const tree = buildTafsilTree(parties);
  const result = new Set<string>();
  const collect = (node: TafsilTreeNode) => {
    result.add(node.party.id);
    for (const c of node.children) collect(c);
  };
  const find = (nodes: TafsilTreeNode[]): boolean => {
    for (const n of nodes) {
      if (n.party.id === rootId) {
        collect(n);
        return true;
      }
      if (find(n.children)) return true;
    }
    return false;
  };
  find(tree);
  return result;
}

export function suggestNextTafsilCode(parent: ErpParty | null, allParties: ErpParty[]): string {
  const used = new Set(allParties.map(p => p.code));
  if (!parent) {
    let n = 1001;
    while (used.has(String(n))) n++;
    return String(n);
  }
  const siblings = allParties.filter(
    p => p.parentId === parent.id || (!p.parentId && p.parentCode === parent.code)
  );
  let maxTail = 0;
  for (const s of siblings) {
    if (s.code.startsWith(parent.code)) {
      const tail = parseInt(s.code.slice(parent.code.length).replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(tail) && tail > maxTail) maxTail = tail;
    }
  }
  let idx = maxTail + 1;
  while (idx < 99999) {
    const candidate = `${parent.code}${String(idx).padStart(2, '0')}`;
    if (!used.has(candidate)) return candidate;
    idx++;
  }
  return `${parent.code}${Date.now().toString().slice(-3)}`;
}

// --- Balances, Trial Balance & Financial Statements ---
export interface TrialBalanceRow {
  accountId: string;
  code: string;
  title: string;
  level: ErpAccountLevel;
  depth: number;
  category: ErpAccountCategory;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  totalDebit: number;
  totalCredit: number;
  endingDebit: number;
  endingCredit: number;
  hasChildren: boolean;
}

export function computeTrialBalanceRows(
  accounts: ErpAccount[],
  vouchers: ErpVoucher[],
  options?: {
    dateFrom?: string;
    dateTo?: string;
    includeDrafts?: boolean;
    onlyWithTurnover?: boolean;
    rollupHierarchy?: boolean;
  }
): TrialBalanceRow[] {
  const dateFrom = (options?.dateFrom || '').trim();
  const dateTo = (options?.dateTo || '').trim();
  const includeDrafts = options?.includeDrafts ?? true;

  const directMap = new Map<
    string,
    { openD: number; openC: number; perD: number; perC: number; title: string }
  >();

  for (const v of vouchers || []) {
    if (!includeDrafts && v.status === 'DRAFT') continue;
    if (dateFrom && v.dateJalali && v.dateJalali < dateFrom) continue;
    if (dateTo && v.dateJalali && v.dateJalali > dateTo) continue;

    const isOpening = v.type === 'OPENING_CUTOVER';
    for (const line of v.lines || []) {
      const code = String(line.accountCode || '').trim();
      if (!code) continue;
      const cur = directMap.get(code) || {
        openD: 0,
        openC: 0,
        perD: 0,
        perC: 0,
        title: line.accountTitle || code
      };
      const d = Number(line.debit) || 0;
      const c = Number(line.credit) || 0;
      if (isOpening) {
        cur.openD += d;
        cur.openC += c;
      } else {
        cur.perD += d;
        cur.perC += c;
      }
      directMap.set(code, cur);
    }
  }

  const tree = buildAccountTree(accounts);
  const rows: TrialBalanceRow[] = [];
  const knownCodes = new Set(accounts.map(a => a.code));

  const walk = (node: AccountTreeNode): { openD: number; openC: number; perD: number; perC: number } => {
    const self = directMap.get(node.account.code) || { openD: 0, openC: 0, perD: 0, perC: 0, title: node.account.title };
    let aggOpenD = self.openD;
    let aggOpenC = self.openC;
    let aggPerD = self.perD;
    let aggPerC = self.perC;

    const childStartIndex = rows.length;
    // Placeholder pushed first to preserve tree order
    const rowIdx = rows.length;
    rows.push({
      accountId: node.account.id,
      code: node.account.code,
      title: node.account.title,
      level: node.account.level,
      depth: node.depth,
      category: inferAccountCategory(node.account),
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 0,
      totalDebit: 0,
      totalCredit: 0,
      endingDebit: 0,
      endingCredit: 0,
      hasChildren: node.children.length > 0
    });

    for (const child of node.children) {
      const cTot = walk(child);
      if (options?.rollupHierarchy !== false) {
        aggOpenD += cTot.openD;
        aggOpenC += cTot.openC;
        aggPerD += cTot.perD;
        aggPerC += cTot.perC;
      }
    }

    const totalD = aggOpenD + aggPerD;
    const totalC = aggOpenC + aggPerC;
    const net = totalD - totalC;
    rows[rowIdx] = {
      ...rows[rowIdx],
      openingDebit: aggOpenD,
      openingCredit: aggOpenC,
      periodDebit: aggPerD,
      periodCredit: aggPerC,
      totalDebit: totalD,
      totalCredit: totalC,
      endingDebit: net > 0 ? net : 0,
      endingCredit: net < 0 ? Math.abs(net) : 0
    };

    void childStartIndex;
    return { openD: aggOpenD, openC: aggOpenC, perD: aggPerD, perC: aggPerC };
  };

  for (const root of tree) walk(root);

  // Include any legacy/orphan voucher account codes not currently in chartOfAccounts
  for (const [code, totals] of directMap.entries()) {
    if (!knownCodes.has(code)) {
      const totalD = totals.openD + totals.perD;
      const totalC = totals.openC + totals.perC;
      const net = totalD - totalC;
      rows.push({
        accountId: `orphan_${code}`,
        code,
        title: `${totals.title} (خارج از کدینگ)`,
        level: 'MOEIN',
        depth: 3,
        category: inferAccountCategory({ code }),
        openingDebit: totals.openD,
        openingCredit: totals.openC,
        periodDebit: totals.perD,
        periodCredit: totals.perC,
        totalDebit: totalD,
        totalCredit: totalC,
        endingDebit: net > 0 ? net : 0,
        endingCredit: net < 0 ? Math.abs(net) : 0,
        hasChildren: false
      });
    }
  }

  return options?.onlyWithTurnover
    ? rows.filter(r => r.totalDebit > 0 || r.totalCredit > 0)
    : rows;
}

export interface LedgerCardRow {
  lineId: string;
  voucherId: string;
  voucherNo: number;
  dateJalali: string;
  voucherType: ErpVoucherType;
  accountCode: string;
  accountTitle: string;
  tafziliName: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  balanceSide: 'بد' | 'بس' | 'تسویه';
}

export function computeAccountCardLines(
  vouchers: ErpVoucher[],
  predicate: (line: ErpVoucherLine, voucher: ErpVoucher) => boolean
): LedgerCardRow[] {
  const chronological = [...(vouchers || [])].sort((a, b) => {
    const dateCmp = String(a.dateJalali || '').localeCompare(String(b.dateJalali || ''));
    if (dateCmp !== 0) return dateCmp;
    return (a.voucherNo || 0) - (b.voucherNo || 0);
  });

  const rows: LedgerCardRow[] = [];
  let running = 0;
  for (const v of chronological) {
    for (const l of v.lines || []) {
      if (!predicate(l, v)) continue;
      const d = Number(l.debit) || 0;
      const c = Number(l.credit) || 0;
      running += d - c;
      rows.push({
        lineId: l.id,
        voucherId: v.id,
        voucherNo: v.voucherNo,
        dateJalali: v.dateJalali,
        voucherType: v.type,
        accountCode: l.accountCode,
        accountTitle: l.accountTitle,
        tafziliName: l.tafziliName || '-',
        description: l.description || v.description,
        debit: d,
        credit: c,
        runningBalance: Math.abs(running),
        balanceSide: running > 0.01 ? 'بد' : running < -0.01 ? 'بس' : 'تسویه'
      });
    }
  }
  return rows;
}

export interface FinancialStatementsResult {
  revenues: { code: string; title: string; amount: number }[];
  totalRevenue: number;
  cogsItems: { code: string; title: string; amount: number }[];
  totalCogs: number;
  grossProfit: number;
  expenses: { code: string; title: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
  assets: { code: string; title: string; amount: number }[];
  totalAssets: number;
  liabilities: { code: string; title: string; amount: number }[];
  totalLiabilities: number;
  equity: { code: string; title: string; amount: number }[];
  totalEquityBeforeNetProfit: number;
  totalLiabilitiesAndEquity: number;
  isBalanceSheetBalanced: boolean;
  industrialCosting: {
    directMaterial: number;
    directLabor: number;
    factoryOverhead: number;
    totalManufacturedCost: number;
    totalNetWeightKg: number;
    avgCostPerKg: number;
    vouchersCount: number;
  };
}

export function computeFinancialStatements(
  accounts: ErpAccount[],
  vouchers: ErpVoucher[],
  productionVouchers: ErpProductionVoucher[] = []
): FinancialStatementsResult {
  // Direct leaf balances (no parent rollup so amounts are never double-counted)
  const leafRows = computeTrialBalanceRows(accounts, vouchers, {
    rollupHierarchy: false,
    onlyWithTurnover: true
  });

  const revenues: { code: string; title: string; amount: number }[] = [];
  const cogsItems: { code: string; title: string; amount: number }[] = [];
  const expenses: { code: string; title: string; amount: number }[] = [];
  const assets: { code: string; title: string; amount: number }[] = [];
  const liabilities: { code: string; title: string; amount: number }[] = [];
  const equity: { code: string; title: string; amount: number }[] = [];

  for (const r of leafRows) {
    const netDebit = r.totalDebit - r.totalCredit;
    const netCredit = r.totalCredit - r.totalDebit;
    if (Math.abs(netDebit) < 0.01) continue;

    switch (r.category) {
      case 'REVENUE':
        revenues.push({ code: r.code, title: r.title, amount: netCredit });
        break;
      case 'COGS':
        cogsItems.push({ code: r.code, title: r.title, amount: netDebit });
        break;
      case 'EXPENSE':
        expenses.push({ code: r.code, title: r.title, amount: netDebit });
        break;
      case 'ASSET':
        assets.push({ code: r.code, title: r.title, amount: netDebit });
        break;
      case 'LIABILITY':
        liabilities.push({ code: r.code, title: r.title, amount: netCredit });
        break;
      case 'EQUITY':
        equity.push({ code: r.code, title: r.title, amount: netCredit });
        break;
      default:
        break;
    }
  }

  const totalRevenue = revenues.reduce((s, x) => s + x.amount, 0);
  const totalCogs = cogsItems.reduce((s, x) => s + x.amount, 0);
  const grossProfit = totalRevenue - totalCogs;
  const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0);
  const netProfit = grossProfit - totalExpenses;

  const totalAssets = assets.reduce((s, x) => s + x.amount, 0);
  const totalLiabilities = liabilities.reduce((s, x) => s + x.amount, 0);
  const totalEquityBeforeNetProfit = equity.reduce((s, x) => s + x.amount, 0);
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquityBeforeNetProfit + netProfit;

  // Industrial production costing from production vouchers + COGS ledger
  const prdRaw = (productionVouchers || []).reduce((s, p) => s + (Number(p.rawMaterialsCostRials) || 0), 0);
  const prdLabor = (productionVouchers || []).reduce((s, p) => s + (Number(p.directLaborCostRials) || 0), 0);
  const prdOverhead = (productionVouchers || []).reduce((s, p) => s + (Number(p.factoryOverheadCostRials) || 0), 0);
  const prdWeight = (productionVouchers || []).reduce((s, p) => s + (Number(p.totalNetWeightKg) || 0), 0);
  const ledgerMat = leafRows.filter(r => r.code.startsWith('6101')).reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0);
  const ledgerLab = leafRows.filter(r => r.code.startsWith('6102')).reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0);
  const ledgerOvh = leafRows.filter(r => r.code.startsWith('6103')).reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0);

  const directMaterial = prdRaw > 0 ? prdRaw : Math.max(0, ledgerMat);
  const directLabor = prdLabor > 0 ? prdLabor : Math.max(0, ledgerLab);
  const factoryOverhead = prdOverhead > 0 ? prdOverhead : Math.max(0, ledgerOvh);
  const totalManufacturedCost = directMaterial + directLabor + factoryOverhead;

  return {
    revenues,
    totalRevenue,
    cogsItems,
    totalCogs,
    grossProfit,
    expenses,
    totalExpenses,
    netProfit,
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    equity,
    totalEquityBeforeNetProfit,
    totalLiabilitiesAndEquity,
    isBalanceSheetBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 1,
    industrialCosting: {
      directMaterial,
      directLabor,
      factoryOverhead,
      totalManufacturedCost,
      totalNetWeightKg: prdWeight,
      avgCostPerKg: prdWeight > 0 ? totalManufacturedCost / prdWeight : 0,
      vouchersCount: (productionVouchers || []).length
    }
  };
}

// --- Automatic Financial Voucher Engine ---
export interface AutoVoucherCandidate {
  key: string;
  sourceModule: 'PRODUCTION' | 'WAREHOUSE' | 'SALES' | 'PURCHASE' | 'TREASURY' | 'PAYROLL';
  sourceId: string;
  sourceDocNo: string;
  dateJalali: string;
  title: string;
  amountRials: number;
  voucherType: ErpVoucherType;
  lines: ErpVoucherLine[];
}

function findAccountTitle(chartOfAccounts: ErpAccount[], code: string, fallbackTitle: string): string {
  const found = (chartOfAccounts || []).find(a => a.code === code);
  return found ? found.title : fallbackTitle;
}

export function scanPendingAutoVoucherCandidates(erpState: IndustrialErpState): AutoVoucherCandidate[] {
  const settings = getEffectiveAccountingSettings(erpState);
  const def = settings.defaultAccounts;
  const coa = erpState.chartOfAccounts || [];
  const existingRefs = new Set(
    (erpState.vouchers || [])
      .map(v => String(v.referenceId || '').trim())
      .filter(Boolean)
  );
  const candidates: AutoVoucherCandidate[] = [];

  // 1. Production Vouchers (Industrial Costing Auto-Voucher)
  if (settings.autoVoucherEnabled.production) {
    for (const pv of erpState.productionVouchers || []) {
      const refKey = `auto_prd_${pv.id}`;
      if (existingRefs.has(refKey) || existingRefs.has(pv.id)) continue;
      const totalCost = Math.round(Number(pv.totalProductionCostRials) || 0);
      if (totalCost <= 0) continue;
      const matCost = Math.round(Number(pv.rawMaterialsCostRials) || totalCost);
      const labCost = Math.round(Number(pv.directLaborCostRials) || 0);
      const ovhCost = Math.round(Number(pv.factoryOverheadCostRials) || 0);
      const sumCredit = matCost + labCost + ovhCost;
      const adjustedMat = sumCredit === totalCost ? matCost : Math.max(0, totalCost - labCost - ovhCost);

      const lines: ErpVoucherLine[] = [
        {
          id: `avl_${pv.id}_1`,
          accountCode: def.inventoryFinished,
          accountTitle: findAccountTitle(coa, def.inventoryFinished, 'موجودی کالای ساخته‌شده'),
          tafziliName: pv.itemName,
          costCenterName: pv.lineName,
          debit: totalCost,
          credit: 0,
          description: `ورود محصول تولیدی ${pv.itemName} (${pv.totalNetWeightKg} کیلوگرم) - سند تولید ${pv.voucherNo}`
        }
      ];
      if (adjustedMat > 0) {
        lines.push({
          id: `avl_${pv.id}_2`,
          accountCode: def.directMaterial,
          accountTitle: findAccountTitle(coa, def.directMaterial, 'مواد اولیه مستقیم مصرفی'),
          tafziliName: pv.lineName,
          debit: 0,
          credit: adjustedMat,
          description: `بهای مواد مستقیم مصرف‌شده در خط ${pv.lineName}`
        });
      }
      if (labCost > 0) {
        lines.push({
          id: `avl_${pv.id}_3`,
          accountCode: def.directLabor,
          accountTitle: findAccountTitle(coa, def.directLabor, 'دستمزد مستقیم خطوط تولید'),
          tafziliName: pv.lineName,
          debit: 0,
          credit: labCost,
          description: `جذب دستمزد مستقیم خط ${pv.lineName}`
        });
      }
      if (ovhCost > 0) {
        lines.push({
          id: `avl_${pv.id}_4`,
          accountCode: def.factoryOverhead,
          accountTitle: findAccountTitle(coa, def.factoryOverhead, 'سربار ساخت کارخانه'),
          tafziliName: pv.lineName,
          debit: 0,
          credit: ovhCost,
          description: `جذب سربار ساخت خط ${pv.lineName}`
        });
      }

      candidates.push({
        key: refKey,
        sourceModule: 'PRODUCTION',
        sourceId: refKey,
        sourceDocNo: pv.voucherNo,
        dateJalali: pv.dateJalali || getTodayJalali(),
        title: `سند اتوماتیک تولید #${pv.voucherNo} — ${pv.itemName}`,
        amountRials: totalCost,
        voucherType: 'PRODUCTION',
        lines
      });
    }
  }

  // 2. Warehouse Documents with Cost (without voucher)
  if (settings.autoVoucherEnabled.warehouse) {
    for (const wd of erpState.warehouseDocuments || []) {
      const refKey = `auto_wh_${wd.id}`;
      if (wd.accountingVoucherNo || existingRefs.has(refKey) || existingRefs.has(wd.id) || wd.status === 'CANCELLED') continue;
      const amount = Math.round(Number(wd.totalCostRials) || 0);
      if (amount <= 0) continue;

      const isReceipt =
        wd.docType === 'RECEIPT_PURCHASE' ||
        wd.docType === 'OPENING_BALANCE' ||
        wd.docType === 'RECEIPT_PRODUCTION' ||
        wd.docType === 'STOCK_ADJUSTMENT_IN';
      const debitAcc = isReceipt ? def.inventoryRaw : def.directMaterial;
      const creditAcc =
        wd.docType === 'OPENING_BALANCE'
          ? def.openingClosing
          : wd.docType === 'RECEIPT_PURCHASE'
          ? def.payable
          : def.inventoryRaw;

      candidates.push({
        key: refKey,
        sourceModule: 'WAREHOUSE',
        sourceId: refKey,
        sourceDocNo: wd.docNo,
        dateJalali: wd.dateJalali || getTodayJalali(),
        title: `سند اتوماتیک انبار #${wd.docNo} (${wd.docType})`,
        amountRials: amount,
        voucherType: 'WAREHOUSE',
        lines: [
          {
            id: `avl_${wd.id}_1`,
            accountCode: debitAcc,
            accountTitle: findAccountTitle(coa, debitAcc, 'موجودی مواد و کالا'),
            tafziliName: wd.targetWarehouseName || wd.sourceWarehouseName || wd.partyName || '',
            debit: amount,
            credit: 0,
            description: `سند اتوماتیک انبار شماره ${wd.docNo}`
          },
          {
            id: `avl_${wd.id}_2`,
            accountCode: creditAcc,
            accountTitle: findAccountTitle(coa, creditAcc, 'طرف مقابل سند انبار'),
            tafziliName: wd.partyName || wd.sourceWarehouseName || '',
            debit: 0,
            credit: amount,
            description: `بابت سند انبار شماره ${wd.docNo}`
          }
        ]
      });
    }
  }

  // 3. Trade Docs (Sales / Purchase without voucher)
  for (const td of erpState.tradeDocs || []) {
    const refKey = `auto_trd_${td.id}`;
    if (td.voucherId || existingRefs.has(refKey) || existingRefs.has(td.id)) continue;
    const net = Math.round(Number(td.netTotalAmount) || 0);
    if (net <= 0) continue;
    const tax = Math.round(Number(td.taxAmount) || 0);
    const baseAmt = Math.max(0, net - tax);
    const isSales = td.docType === 'SALES' || td.docType === 'SALES_RETURN';
    if (isSales && !settings.autoVoucherEnabled.sales) continue;
    if (!isSales && !settings.autoVoucherEnabled.purchase) continue;

    const lines: ErpVoucherLine[] = [];
    if (td.docType === 'SALES') {
      lines.push({
        id: `avl_${td.id}_1`,
        accountCode: def.receivable,
        accountTitle: findAccountTitle(coa, def.receivable, 'حساب‌های دریافتنی تجاری'),
        tafziliCode: td.partyCode,
        tafziliName: td.partyName,
        debit: net,
        credit: 0,
        description: `بابت فاکتور فروش شماره ${td.docNo}`
      });
      lines.push({
        id: `avl_${td.id}_2`,
        accountCode: def.salesRevenue,
        accountTitle: findAccountTitle(coa, def.salesRevenue, 'فروش محصولات تولیدی'),
        tafziliCode: td.partyCode,
        tafziliName: td.partyName,
        debit: 0,
        credit: baseAmt,
        description: `درآمد فروش فاکتور شماره ${td.docNo}`
      });
      if (tax > 0) {
        lines.push({
          id: `avl_${td.id}_3`,
          accountCode: def.vatPayable,
          accountTitle: findAccountTitle(coa, def.vatPayable, 'مالیات بر ارزش افزوده فروش'),
          tafziliName: td.partyName,
          debit: 0,
          credit: tax,
          description: `مالیات بر ارزش افزوده فاکتور ${td.docNo}`
        });
      }
    } else if (td.docType === 'PURCHASE') {
      lines.push({
        id: `avl_${td.id}_1`,
        accountCode: def.inventoryRaw,
        accountTitle: findAccountTitle(coa, def.inventoryRaw, 'موجودی مواد اولیه'),
        tafziliCode: td.partyCode,
        tafziliName: td.partyName,
        debit: baseAmt,
        credit: 0,
        description: `خرید مواد فاکتور شماره ${td.docNo}`
      });
      if (tax > 0) {
        lines.push({
          id: `avl_${td.id}_2`,
          accountCode: def.vatReceivable,
          accountTitle: findAccountTitle(coa, def.vatReceivable, 'مالیات ارزش افزوده خرید'),
          tafziliName: td.partyName,
          debit: tax,
          credit: 0,
          description: `ارزش افزوده خرید فاکتور ${td.docNo}`
        });
      }
      lines.push({
        id: `avl_${td.id}_3`,
        accountCode: def.payable,
        accountTitle: findAccountTitle(coa, def.payable, 'حساب‌های پرداختنی تجاری'),
        tafziliCode: td.partyCode,
        tafziliName: td.partyName,
        debit: 0,
        credit: net,
        description: `بستانکاری تامین‌کننده بابت فاکتور ${td.docNo}`
      });
    } else {
      continue;
    }

    candidates.push({
      key: refKey,
      sourceModule: td.docType === 'SALES' ? 'SALES' : 'PURCHASE',
      sourceId: refKey,
      sourceDocNo: td.docNo,
      dateJalali: td.dateJalali || getTodayJalali(),
      title: `سند اتوماتیک ${td.docType === 'SALES' ? 'فروش' : 'خرید'} #${td.docNo} — ${td.partyName}`,
      amountRials: net,
      voucherType: td.docType === 'SALES' ? 'SALES' : 'PURCHASE',
      lines
    });
  }

  // 4. Treasury Docs without voucher
  if (settings.autoVoucherEnabled.treasury) {
    for (const tr of erpState.treasuryDocs || []) {
      const refKey = `auto_trs_${tr.id}`;
      if (tr.voucherNo || existingRefs.has(refKey) || existingRefs.has(tr.id)) continue;
      const amount = Math.round(Number(tr.amountRials) || 0);
      if (amount <= 0) continue;
      const isReceipt = tr.docType === 'RECEIPT_CASH' || tr.docType === 'RECEIPT_CHEQUE';
      candidates.push({
        key: refKey,
        sourceModule: 'TREASURY',
        sourceId: refKey,
        sourceDocNo: tr.docNo,
        dateJalali: tr.dateJalali || getTodayJalali(),
        title: `سند اتوماتیک خزانه #${tr.docNo} — ${tr.partyName}`,
        amountRials: amount,
        voucherType: 'TREASURY',
        lines: isReceipt
          ? [
              {
                id: `avl_${tr.id}_1`,
                accountCode: def.cashBank,
                accountTitle: findAccountTitle(coa, def.cashBank, 'موجودی نقد و بانک'),
                tafziliName: tr.bankName || 'بانک / خزانه',
                debit: amount,
                credit: 0,
                description: tr.description || `دریافت خزانه #${tr.docNo}`
              },
              {
                id: `avl_${tr.id}_2`,
                accountCode: def.receivable,
                accountTitle: findAccountTitle(coa, def.receivable, 'حساب‌های دریافتنی تجاری'),
                tafziliCode: tr.partyCode,
                tafziliName: tr.partyName,
                debit: 0,
                credit: amount,
                description: `بابت دریافت از ${tr.partyName} - سند خزانه #${tr.docNo}`
              }
            ]
          : [
              {
                id: `avl_${tr.id}_1`,
                accountCode: def.payable,
                accountTitle: findAccountTitle(coa, def.payable, 'حساب‌های پرداختنی تجاری'),
                tafziliCode: tr.partyCode,
                tafziliName: tr.partyName,
                debit: amount,
                credit: 0,
                description: `پرداخت به ${tr.partyName} - سند خزانه #${tr.docNo}`
              },
              {
                id: `avl_${tr.id}_2`,
                accountCode: def.cashBank,
                accountTitle: findAccountTitle(coa, def.cashBank, 'موجودی نقد و بانک'),
                tafziliName: tr.bankName || 'بانک / خزانه',
                debit: 0,
                credit: amount,
                description: tr.description || `پرداخت خزانه #${tr.docNo}`
              }
            ]
      });
    }
  }

  return candidates;
}

export type QuickAutoTemplateId =
  | 'PURCHASE_RAW_VAT'
  | 'SALES_PRODUCT_VAT'
  | 'PRODUCTION_ABSORPTION'
  | 'BANK_RECEIPT'
  | 'BANK_PAYMENT'
  | 'OVERHEAD_EXPENSE';

export function buildQuickAutoTemplate(
  templateId: QuickAutoTemplateId,
  params: { amount: number; vatPercent?: number; partyName?: string; bankOrLineName?: string; note?: string },
  erpState: IndustrialErpState
): { type: ErpVoucherType; description: string; lines: ErpVoucherLine[] } {
  const settings = getEffectiveAccountingSettings(erpState);
  const def = settings.defaultAccounts;
  const coa = erpState.chartOfAccounts || [];
  const amt = Math.max(0, Math.round(Number(params.amount) || 0));
  const vatPct = Math.max(0, Number(params.vatPercent) || 0);
  const vat = Math.round((amt * vatPct) / 100);
  const gross = amt + vat;
  const party = params.partyName?.trim() || 'طرف حساب';
  const ref = params.bankOrLineName?.trim() || '';
  const ts = Date.now();

  switch (templateId) {
    case 'PURCHASE_RAW_VAT':
      return {
        type: 'PURCHASE',
        description: params.note || `خرید مواد اولیه از ${party}`,
        lines: [
          {
            id: `tpl_${ts}_1`,
            accountCode: def.inventoryRaw,
            accountTitle: findAccountTitle(coa, def.inventoryRaw, 'موجودی مواد اولیه'),
            tafziliName: ref || party,
            debit: amt,
            credit: 0,
            description: `خرید مواد اولیه از ${party}`
          },
          ...(vat > 0
            ? [
                {
                  id: `tpl_${ts}_2`,
                  accountCode: def.vatReceivable,
                  accountTitle: findAccountTitle(coa, def.vatReceivable, 'مالیات ارزش افزوده خرید'),
                  tafziliName: party,
                  debit: vat,
                  credit: 0,
                  description: `مالیات بر ارزش افزوده (${vatPct}٪)`
                }
              ]
            : []),
          {
            id: `tpl_${ts}_3`,
            accountCode: def.payable,
            accountTitle: findAccountTitle(coa, def.payable, 'حساب‌های پرداختنی تجاری'),
            tafziliName: party,
            debit: 0,
            credit: gross,
            description: `بستانکاری ${party} بابت خرید`
          }
        ]
      };
    case 'SALES_PRODUCT_VAT':
      return {
        type: 'SALES',
        description: params.note || `فروش محصول به ${party}`,
        lines: [
          {
            id: `tpl_${ts}_1`,
            accountCode: def.receivable,
            accountTitle: findAccountTitle(coa, def.receivable, 'حساب‌های دریافتنی تجاری'),
            tafziliName: party,
            debit: gross,
            credit: 0,
            description: `بدهکاری ${party} بابت فروش محصول`
          },
          {
            id: `tpl_${ts}_2`,
            accountCode: def.salesRevenue,
            accountTitle: findAccountTitle(coa, def.salesRevenue, 'فروش محصولات تولیدی'),
            tafziliName: ref || party,
            debit: 0,
            credit: amt,
            description: `درآمد فروش به ${party}`
          },
          ...(vat > 0
            ? [
                {
                  id: `tpl_${ts}_3`,
                  accountCode: def.vatPayable,
                  accountTitle: findAccountTitle(coa, def.vatPayable, 'مالیات ارزش افزوده فروش'),
                  tafziliName: party,
                  debit: 0,
                  credit: vat,
                  description: `مالیات بر ارزش افزوده فروش (${vatPct}٪)`
                }
              ]
            : [])
        ]
      };
    case 'PRODUCTION_ABSORPTION':
      return {
        type: 'PRODUCTION',
        description: params.note || `انتقال بهای تمام‌شده تولید ${ref || 'خط تولید'} به موجودی محصول`,
        lines: [
          {
            id: `tpl_${ts}_1`,
            accountCode: def.inventoryFinished,
            accountTitle: findAccountTitle(coa, def.inventoryFinished, 'موجودی کالای ساخته‌شده'),
            tafziliName: ref || 'محصول نهایی',
            debit: amt,
            credit: 0,
            description: `ورود محصول تولیدی به انبار`
          },
          {
            id: `tpl_${ts}_2`,
            accountCode: def.directMaterial,
            accountTitle: findAccountTitle(coa, def.directMaterial, 'مواد اولیه مستقیم مصرفی'),
            tafziliName: ref || 'خط تولید',
            debit: 0,
            credit: Math.round(amt * 0.7),
            description: `جذب مواد مستقیم مصرفی`
          },
          {
            id: `tpl_${ts}_3`,
            accountCode: def.directLabor,
            accountTitle: findAccountTitle(coa, def.directLabor, 'دستمزد مستقیم خطوط تولید'),
            tafziliName: ref || 'خط تولید',
            debit: 0,
            credit: Math.round(amt * 0.15),
            description: `جذب دستمزد مستقیم`
          },
          {
            id: `tpl_${ts}_4`,
            accountCode: def.factoryOverhead,
            accountTitle: findAccountTitle(coa, def.factoryOverhead, 'سربار ساخت کارخانه'),
            tafziliName: ref || 'خط تولید',
            debit: 0,
            credit: amt - Math.round(amt * 0.7) - Math.round(amt * 0.15),
            description: `جذب سربار ساخت کارخانه`
          }
        ]
      };
    case 'BANK_RECEIPT':
      return {
        type: 'TREASURY',
        description: params.note || `دریافت وجه از ${party}`,
        lines: [
          {
            id: `tpl_${ts}_1`,
            accountCode: def.cashBank,
            accountTitle: findAccountTitle(coa, def.cashBank, 'موجودی نقد و بانک'),
            tafziliName: ref || 'بانک جاری',
            debit: amt,
            credit: 0,
            description: `واریز وجه توسط ${party}`
          },
          {
            id: `tpl_${ts}_2`,
            accountCode: def.receivable,
            accountTitle: findAccountTitle(coa, def.receivable, 'حساب‌های دریافتنی تجاری'),
            tafziliName: party,
            debit: 0,
            credit: amt,
            description: `تسویه بدهی ${party}`
          }
        ]
      };
    case 'BANK_PAYMENT':
      return {
        type: 'TREASURY',
        description: params.note || `پرداخت وجه به ${party}`,
        lines: [
          {
            id: `tpl_${ts}_1`,
            accountCode: def.payable,
            accountTitle: findAccountTitle(coa, def.payable, 'حساب‌های پرداختنی تجاری'),
            tafziliName: party,
            debit: amt,
            credit: 0,
            description: `پرداخت وجه به ${party}`
          },
          {
            id: `tpl_${ts}_2`,
            accountCode: def.cashBank,
            accountTitle: findAccountTitle(coa, def.cashBank, 'موجودی نقد و بانک'),
            tafziliName: ref || 'بانک جاری',
            debit: 0,
            credit: amt,
            description: `برداشت از ${ref || 'حساب بانکی'}`
          }
        ]
      };
    case 'OVERHEAD_EXPENSE':
    default:
      return {
        type: 'AUTO_FINANCIAL',
        description: params.note || `ثبت هزینه سربار / اداری (${party})`,
        lines: [
          {
            id: `tpl_${ts}_1`,
            accountCode: def.factoryOverhead,
            accountTitle: findAccountTitle(coa, def.factoryOverhead, 'سربار ساخت کارخانه'),
            tafziliName: ref || party,
            debit: amt,
            credit: 0,
            description: params.note || `هزینه ${party}`
          },
          {
            id: `tpl_${ts}_2`,
            accountCode: def.cashBank,
            accountTitle: findAccountTitle(coa, def.cashBank, 'موجودی نقد و بانک'),
            tafziliName: ref || 'بانک / تنخواه',
            debit: 0,
            credit: amt,
            description: `پرداخت هزینه به ${party}`
          }
        ]
      };
  }
}

// --- Safe HTML Escaping, Printing & CSV Export ---
export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatRials(value: number | undefined | null): string {
  const n = Number(value) || 0;
  return Math.round(n).toLocaleString('fa-IR');
}

export function exportRowsToCsv(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const sanitizeCell = (val: string | number) => {
    let s = String(val ?? '');
    // Guard against spreadsheet formula injection
    if (/^[=+\-@\t\r]/.test(s)) {
      s = `'${s}`;
    }
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(sanitizeCell).join(','), ...rows.map(r => r.map(sanitizeCell).join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printVoucherDocument(voucher: ErpVoucher, companyName: string) {
  const totalDebit = (voucher.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = (voucher.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const typeLabel = VOUCHER_TYPE_META[voucher.type]?.label || voucher.type;
  const statusLabel = VOUCHER_STATUS_META[voucher.status]?.label || voucher.status;

  const rowsHtml = (voucher.lines || [])
    .map(
      (l, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td style="font-family:monospace;font-weight:700;">${escapeHtml(l.accountCode)}</td>
        <td>${escapeHtml(l.accountTitle)}</td>
        <td>${escapeHtml(l.tafziliPath?.length ? l.tafziliPath.join(' / ') : l.tafziliName || '-')}</td>
        <td>${escapeHtml(l.description || '-')}</td>
        <td style="text-align:left;font-family:monospace;font-weight:700;">${(Number(l.debit) || 0).toLocaleString('en-US')}</td>
        <td style="text-align:left;font-family:monospace;font-weight:700;">${(Number(l.credit) || 0).toLocaleString('en-US')}</td>
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8" />
  <title>سند حسابداری #${escapeHtml(voucher.voucherNo)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Tahoma, Vazirmatn, sans-serif; font-size: 11px; color: #0f172a; margin: 0; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
    .hdr h1 { margin: 0 0 4px 0; font-size: 16px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; }
    th { background: #f1f5f9; font-weight: 700; }
    tfoot td { background: #e2e8f0; font-weight: 700; }
    .sigs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 32px; text-align: center; }
    .sig-box { border-top: 1px solid #64748b; padding-top: 6px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1>${escapeHtml(companyName)}</h1>
      <div>سند حسابداری رسمی (دوبل)</div>
    </div>
    <div style="text-align:left;font-family:monospace;">
      <div><strong>شماره سند:</strong> #${escapeHtml(voucher.voucherNo)}</div>
      <div><strong>تاریخ:</strong> ${escapeHtml(voucher.dateJalali)}</div>
    </div>
  </div>
  <div class="meta">
    <div><strong>نوع سند:</strong> ${escapeHtml(typeLabel)}</div>
    <div><strong>وضعیت:</strong> ${escapeHtml(statusLabel)}</div>
    <div><strong>تنظیم‌کننده:</strong> ${escapeHtml(voucher.createdBy || '-')}</div>
    <div><strong>کد عطف:</strong> ${escapeHtml(voucher.archiveCode || voucher.supportingDocRef || '-')}</div>
    <div style="grid-column: span 4;"><strong>شرح کلی سند:</strong> ${escapeHtml(voucher.description)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:36px;text-align:center;">ردیف</th>
        <th style="width:90px;">کد حساب</th>
        <th>عنوان حساب</th>
        <th>تفصیل / زیرتفصیل</th>
        <th>شرح آرتیکل</th>
        <th style="width:110px;">بدهکار (ریال)</th>
        <th style="width:110px;">بستانکار (ریال)</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" style="text-align:left;">جمع کل سند (ریال):</td>
        <td style="text-align:left;font-family:monospace;">${totalDebit.toLocaleString('en-US')}</td>
        <td style="text-align:left;font-family:monospace;">${totalCredit.toLocaleString('en-US')}</td>
      </tr>
    </tfoot>
  </table>
  <div class="sigs">
    <div class="sig-box">تنظیم‌کننده / حسابدار</div>
    <div class="sig-box">رئیس حسابداری</div>
    <div class="sig-box">مدیر مالی / مدیرعامل</div>
  </div>
</body>
</html>`;

  printHtmlInPage(html, 'portrait', `سند_حسابداری_${voucher.voucherNo}`, { skipStyleInjection: true });
}
