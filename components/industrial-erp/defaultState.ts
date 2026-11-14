import { IndustrialErpState, DEFAULT_LABEL_TEMPLATE_CONFIG } from './types';

/**
 * Clean & Raw (خام) Initial Industrial ERP State
 * No dummy items, no mock lines, no fake bank balances, no fake inventory.
 * Contains only the standard Iranian accounting chart structure (کل و معین)
 * and empty operational collections so the company starts 100% clean.
 */
export const createDefaultIndustrialErpState = (
  companyId: string,
  companyName: string
): IndustrialErpState => {
  return {
    companyId,
    companyName: companyName || 'شرکت انتخابی',
    activeFiscalYear: '1405',
    productionLines: [],
    commodityGroups: [],
    warehouses: [],
    items: [],
    boms: [],
    productionOrders: [],
    cartonLabels: [],
    productionVouchers: [],
    warehouseDocuments: [],
    warehouseDocs: [],
    salesOrders: [],
    remittances: [],
    tradeDocs: [],
    parties: [],
    bankAccounts: [],
    chequeBooks: [],
    treasuryDocs: [],
    employees: [],
    payrollSlips: [],
    fixedAssets: [],
    chartOfAccounts: [
      { id: 'acc_10', code: '10', title: 'دارایی‌های جاری', level: 'KOL', nature: 'DEBIT' },
      { id: 'acc_1101', code: '1101', title: 'موجودی نقد و بانک‌ها', level: 'MOEIN', parentCode: '10', nature: 'DEBIT' },
      { id: 'acc_1102', code: '1102', title: 'حساب‌ها و اسناد دریافتنی تجاری', level: 'MOEIN', parentCode: '10', nature: 'DEBIT' },
      { id: 'acc_1103', code: '1103', title: 'موجودی مواد و کالا', level: 'MOEIN', parentCode: '10', nature: 'DEBIT' },
      { id: 'acc_1104', code: '1104', title: 'پیش‌پرداخت‌ها و سفارشات', level: 'MOEIN', parentCode: '10', nature: 'DEBIT' },
      { id: 'acc_12', code: '12', title: 'دارایی‌های غیرجاری (ثابت)', level: 'KOL', nature: 'DEBIT' },
      { id: 'acc_1201', code: '1201', title: 'ماشین‌آلات و تجهیزات تولید', level: 'MOEIN', parentCode: '12', nature: 'DEBIT' },
      { id: 'acc_20', code: '20', title: 'بدهی‌های جاری', level: 'KOL', nature: 'CREDIT' },
      { id: 'acc_2101', code: '2101', title: 'حساب‌ها و اسناد پرداختنی تجاری', level: 'MOEIN', parentCode: '20', nature: 'CREDIT' },
      { id: 'acc_2102', code: '2102', title: 'سایر حساب‌های پرداختنی و ذخایر', level: 'MOEIN', parentCode: '20', nature: 'CREDIT' },
      { id: 'acc_30', code: '30', title: 'حقوق صاحبان سهام و سرمایه', level: 'KOL', nature: 'CREDIT' },
      { id: 'acc_3101', code: '3101', title: 'سرمایه ثبت‌شده شرکت', level: 'MOEIN', parentCode: '30', nature: 'CREDIT' },
      { id: 'acc_3102', code: '3102', title: 'سود (زیان) انباشته', level: 'MOEIN', parentCode: '30', nature: 'BOTH' },
      { id: 'acc_50', code: '50', title: 'درآمدها و فروش', level: 'KOL', nature: 'CREDIT' },
      { id: 'acc_5101', code: '5101', title: 'فروش ناخالص محصولات تولیدی', level: 'MOEIN', parentCode: '50', nature: 'CREDIT' },
      { id: 'acc_5102', code: '5102', title: 'برگشت از فروش و تخفیفات', level: 'MOEIN', parentCode: '50', nature: 'DEBIT' },
      { id: 'acc_60', code: '60', title: 'بهای تمام‌شده کالای فروش‌رفته', level: 'KOL', nature: 'DEBIT' },
      { id: 'acc_6101', code: '6101', title: 'مواد اولیه مستقیم مصرفی', level: 'MOEIN', parentCode: '60', nature: 'DEBIT' },
      { id: 'acc_6102', code: '6102', title: 'دستمزد مستقیم خطوط تولید', level: 'MOEIN', parentCode: '60', nature: 'DEBIT' },
      { id: 'acc_6103', code: '6103', title: 'سربار ساخت و تولید کارخانه', level: 'MOEIN', parentCode: '60', nature: 'DEBIT' },
      { id: 'acc_70', code: '70', title: 'هزینه‌های اداری، عمومی و فروش', level: 'KOL', nature: 'DEBIT' }
    ],
    vouchers: [],
    nextVoucherNo: 1,
    nextSerialCounter: 10001,
    cutoverConfig: {
      stage1FactoryWarehouseActive: true,
      stage2TehranPricingInvoiceActive: true,
      stage3PaymentOrdersAutoVoucherActive: false,
      lastSayanBarcodeSyncAt: null,
      lastSayanBarcodeSyncCount: 0,
      lastTrialBalanceCutoffDate: '1405/08/20',
      lastTrialBalanceImportAt: null,
      defaultPaymentBankAccountCode: '110101',
      defaultReceivableAccountCode: '110201',
      defaultPayableAccountCode: '210101'
    },
    labelTemplateConfig: {
      ...DEFAULT_LABEL_TEMPLATE_CONFIG,
      fields: { ...DEFAULT_LABEL_TEMPLATE_CONFIG.fields }
    },
    scaleConfig: {
      lockTareWeightsGlobally: false,
      lockConesCountGlobally: false
    }
  };
};
