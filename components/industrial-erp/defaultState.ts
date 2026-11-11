import { IndustrialErpState } from './types';

export const createDefaultIndustrialErpState = (
  companyId: string,
  companyName: string
): IndustrialErpState => {
  return {
    companyId,
    companyName: companyName || 'شرکت تولیدی',
    activeFiscalYear: '1405',
    productionLines: [
      {
        id: 'line_1',
        code: 'L-01',
        name: 'خط ۱ تکسچره DTY (ماشین‌های ۱ الی ۶)',
        machineType: 'دستگاه تکسچره Barmag FK6-1000',
        supervisorName: 'مهندس حسینی',
        isActive: true,
        notes: 'تولید نخ‌های نمره ۷۵ الی ۱۵۰'
      },
      {
        id: 'line_2',
        code: 'L-02',
        name: 'خط ۲ تکسچره DTY (ماشین‌های ۷ الی ۱۲)',
        machineType: 'دستگاه تکسچره Murata 33H',
        supervisorName: 'مهندس محمدی',
        isActive: true,
        notes: 'تولید نخ‌های نمره ۱۵۰ الی ۳۰۰'
      },
      {
        id: 'line_3',
        code: 'L-03',
        name: 'خط ۳ تابندگی و دولاتابی TFO',
        machineType: 'دستگاه تابندگی Saurer Volkmann',
        supervisorName: 'آقای رضایی',
        isActive: true,
        notes: 'تولید نخ‌های تابیده و دولا'
      },
      {
        id: 'line_4',
        code: 'L-04',
        name: 'خط ۴ وایندر و کنترل کیفی نهایی',
        machineType: 'وایندر دقیق SSM Preciflex',
        supervisorName: 'آقای کریمی',
        isActive: true,
        notes: 'بازبینی، وزن‌کشی نهایی و پالت‌بندی'
      }
    ],
    commodityGroups: [
      {
        id: 'grp_yarn',
        code: '10',
        name: 'نخ‌های تکسچره و فیلامنت DTY/FDY/POY',
        description: 'انواع نخ پلی‌استر آماده تحویل'
      },
      {
        id: 'grp_raw',
        code: '20',
        name: 'مواد اولیه نساجی (POY، چیپس، روغن و مستربچ)',
        description: 'ورودی‌های مستقیم خطوط تکسچره'
      },
      {
        id: 'grp_pkg',
        code: '30',
        name: 'ملزومات بسته‌بندی (کارتن، دوک، پالت و نایلون)',
        description: 'اقلام مصرفی جهت بسته‌بندی کارتن‌ها'
      },
      {
        id: 'grp_waste',
        code: '40',
        name: 'ضایعات خط تولید و نخ استوک',
        description: 'کلاف‌های ضایعاتی، پودر و استوک'
      }
    ],
    warehouses: [
      {
        id: 'wh_yarn',
        code: '103',
        name: 'انبار محصول نهایی نخ (آماده فروش و بارگیری)',
        type: 'FINISHED_YARN',
        location: 'کارخانه - سالن محصول',
        managerName: 'آقای رضایی',
        assignedGroupIds: ['grp_yarn']
      },
      {
        id: 'wh_raw',
        code: '101',
        name: 'انبار مواد اولیه (گرانول، چیپس، POY و رنگ)',
        type: 'RAW_MATERIAL',
        location: 'کارخانه - سالن ۱ مواد',
        managerName: 'مهندس محمدی',
        assignedGroupIds: ['grp_raw']
      },
      {
        id: 'wh_pkg',
        code: '102',
        name: 'انبار ملزومات بسته‌بندی (دوک، کارتن، نایلون)',
        type: 'PACKAGING',
        location: 'کارخانه - سالن ملزومات',
        managerName: 'آقای کریمی',
        assignedGroupIds: ['grp_pkg']
      },
      {
        id: 'wh_waste',
        code: '104',
        name: 'انبار ضایعات نساجی و استوک',
        type: 'WASTE',
        location: 'کارخانه - محوطه انبار ضایعات',
        managerName: 'آقای حسینی',
        assignedGroupIds: ['grp_waste']
      }
    ],
    items: [
      {
        id: 'itm_yarn_dty_150_48',
        code: 'YN-3001',
        name: 'نخ تکسچره پلی‌استر DTY 150/48 NIM سفید درجه A',
        category: 'FINISHED_YARN',
        groupId: 'grp_yarn',
        groupName: 'نخ‌های تکسچره و فیلامنت DTY/FDY/POY',
        unit: 'کیلوگرم',
        warehouseId: 'wh_yarn',
        stockQty: 4250.0,
        unitCost: 1845000,
        salesPrice: 2180000,
        filament: '48',
        yarnCount: '150D/48F NIM',
        colorName: 'سفید (Raw White)',
        coneWeightGrams: 110,
        cartonWeightGrams: 1450,
        defaultConesPerCarton: 6,
        grade: 'A'
      },
      {
        id: 'itm_yarn_dty_75_36',
        code: 'YN-3002',
        name: 'نخ تکسچره پلی‌استر DTY 75/36 HIM مشکی درجه A',
        category: 'FINISHED_YARN',
        groupId: 'grp_yarn',
        groupName: 'نخ‌های تکسچره و فیلامنت DTY/FDY/POY',
        unit: 'کیلوگرم',
        warehouseId: 'wh_yarn',
        stockQty: 2850.0,
        unitCost: 2150000,
        salesPrice: 2540000,
        filament: '36',
        yarnCount: '75D/36F HIM',
        colorName: 'مشکی سوپر بلک',
        coneWeightGrams: 110,
        cartonWeightGrams: 1450,
        defaultConesPerCarton: 6,
        grade: 'A'
      },
      {
        id: 'itm_yarn_dty_300_96',
        code: 'YN-3003',
        name: 'نخ تکسچره پلی‌استر DTY 300/96 SIM سفید درجه A',
        category: 'FINISHED_YARN',
        groupId: 'grp_yarn',
        groupName: 'نخ‌های تکسچره و فیلامنت DTY/FDY/POY',
        unit: 'کیلوگرم',
        warehouseId: 'wh_yarn',
        stockQty: 3100.0,
        unitCost: 1720000,
        salesPrice: 2040000,
        filament: '96',
        yarnCount: '300D/96F SIM',
        colorName: 'سفید (Raw White)',
        coneWeightGrams: 110,
        cartonWeightGrams: 1450,
        defaultConesPerCarton: 6,
        grade: 'A'
      },
      {
        id: 'itm_raw_poy_250',
        code: 'RM-1001',
        name: 'نخ POY پلی‌استر 250/48 خام',
        category: 'RAW_MATERIAL',
        groupId: 'grp_raw',
        groupName: 'مواد اولیه نساجی (POY، چیپس، روغن و مستربچ)',
        unit: 'کیلوگرم',
        warehouseId: 'wh_raw',
        stockQty: 18500.0,
        unitCost: 1420000,
        salesPrice: 0,
        filament: '48',
        yarnCount: '250D/48F',
        colorName: 'خام (Raw White)',
        coneWeightGrams: 0,
        cartonWeightGrams: 0,
        defaultConesPerCarton: 0
      },
      {
        id: 'itm_raw_oil',
        code: 'RM-1002',
        name: 'روغن کنینگ نساجی (Coning Oil)',
        category: 'RAW_MATERIAL',
        groupId: 'grp_raw',
        groupName: 'مواد اولیه نساجی (POY، چیپس، روغن و مستربچ)',
        unit: 'کیلوگرم',
        warehouseId: 'wh_raw',
        stockQty: 2400.0,
        unitCost: 1950000,
        salesPrice: 0,
        coneWeightGrams: 0,
        cartonWeightGrams: 0,
        defaultConesPerCarton: 0
      },
      {
        id: 'itm_pkg_cone',
        code: 'PK-2001',
        name: 'دوک مقوایی استاندارد نساجی (۱۱۰ گرم)',
        category: 'PACKAGING',
        groupId: 'grp_pkg',
        groupName: 'ملزومات بسته‌بندی (کارتن، دوک، پالت و نایلون)',
        unit: 'عدد',
        warehouseId: 'wh_pkg',
        stockQty: 45000,
        unitCost: 48000,
        salesPrice: 0,
        coneWeightGrams: 110,
        cartonWeightGrams: 0,
        defaultConesPerCarton: 0
      },
      {
        id: 'itm_pkg_carton',
        code: 'PK-2002',
        name: 'کارتن ۵ لایه استاندارد نخ (۱۴۵۰ گرم به همراه نایلون)',
        category: 'PACKAGING',
        groupId: 'grp_pkg',
        groupName: 'ملزومات بسته‌بندی (کارتن، دوک، پالت و نایلون)',
        unit: 'عدد',
        warehouseId: 'wh_pkg',
        stockQty: 6200,
        unitCost: 380000,
        salesPrice: 0,
        coneWeightGrams: 0,
        cartonWeightGrams: 1450,
        defaultConesPerCarton: 6
      }
    ],
    boms: [],
    productionOrders: [],
    cartonLabels: [],
    productionVouchers: [],
    warehouseDocuments: [],
    warehouseDocs: [],
    salesOrders: [],
    remittances: [],
    tradeDocs: [],
    parties: [
      {
        id: 'pty_1',
        code: 'C-101',
        name: 'دفتر مرکزی تهران (فروش و فاکتور نهایی)',
        type: 'CUSTOMER',
        nationalId: '10103489201',
        phone: '021-88776655',
        city: 'تهران',
        creditLimitRials: 50000000000
      },
      {
        id: 'pty_2',
        code: 'C-102',
        name: 'انبار مرکزی بازار تهران',
        type: 'CUSTOMER',
        nationalId: '10103489202',
        phone: '021-55667788',
        city: 'تهران',
        creditLimitRials: 30000000000
      },
      {
        id: 'pty_3',
        code: 'V-201',
        name: 'شرکت پتروشیمی تندگویان (تامین POY)',
        type: 'SUPPLIER',
        nationalId: '10861234567',
        phone: '061-52345678',
        city: 'ماهشهر',
        creditLimitRials: 100000000000
      },
      {
        id: 'pty_4',
        code: 'V-202',
        name: 'کارتن‌سازی میهن (تامین کارتن و دوک)',
        type: 'SUPPLIER',
        nationalId: '10109876543',
        phone: '024-33445566',
        city: 'زنجان',
        creditLimitRials: 20000000000
      }
    ],
    bankAccounts: [
      {
        id: 'bnk_1',
        code: 'B-01',
        bankName: 'بانک ملت',
        branchName: 'شعبه مرکزی',
        accountNo: '4758921045',
        shebaNo: 'IR450120000000004758921045',
        accountType: 'JARI',
        balanceRials: 14500000000,
        tafziliCode: '110101'
      },
      {
        id: 'bnk_2',
        code: 'B-02',
        bankName: 'بانک تجارت',
        branchName: 'شعبه کارخانه',
        accountNo: '1048932014',
        shebaNo: 'IR180180000000001048932014',
        accountType: 'JARI',
        balanceRials: 8200000000,
        tafziliCode: '110102'
      },
      {
        id: 'bnk_3',
        code: 'B-03',
        bankName: 'بانک ملی ایران',
        branchName: 'شعبه بازرگانی',
        accountNo: '0105829471004',
        shebaNo: 'IR020170000000105829471004',
        accountType: 'JARI',
        balanceRials: 5120000000,
        tafziliCode: '110103'
      }
    ],
    chequeBooks: [],
    treasuryDocs: [],
    employees: [],
    payrollSlips: [],
    fixedAssets: [],
    chartOfAccounts: [
      { id: 'acc_10', code: '10', title: 'دارایی‌های جاری', level: 'KOL', nature: 'DEBIT' },
      { id: 'acc_1101', code: '1101', title: 'موجودی نقد و بانک‌ها', level: 'MOEIN', parentCode: '10', nature: 'DEBIT' },
      { id: 'acc_110101', code: '110101', title: 'بانک ملت - جاری مرکزی', level: 'TAFZILI', parentCode: '1101', nature: 'DEBIT' },
      { id: 'acc_110102', code: '110102', title: 'بانک تجارت - جاری کارخانه', level: 'TAFZILI', parentCode: '1101', nature: 'DEBIT' },
      { id: 'acc_110103', code: '110103', title: 'بانک ملی - جاری بازرگانی', level: 'TAFZILI', parentCode: '1101', nature: 'DEBIT' },
      { id: 'acc_1102', code: '1102', title: 'حساب‌ها و اسناد دریافتنی تجاری', level: 'MOEIN', parentCode: '10', nature: 'DEBIT' },
      { id: 'acc_110201', code: '110201', title: 'مشتریان داخلی نخ', level: 'TAFZILI', parentCode: '1102', nature: 'DEBIT' },
      { id: 'acc_1103', code: '1103', title: 'موجودی مواد و کالا', level: 'MOEIN', parentCode: '10', nature: 'DEBIT' },
      { id: 'acc_110301', code: '110301', title: 'موجودی محصول نهایی نخ', level: 'TAFZILI', parentCode: '1103', nature: 'DEBIT' },
      { id: 'acc_110302', code: '110302', title: 'موجودی مواد اولیه (POY و شیمیایی)', level: 'TAFZILI', parentCode: '1103', nature: 'DEBIT' },
      { id: 'acc_110303', code: '110303', title: 'موجودی ملزومات بسته‌بندی', level: 'TAFZILI', parentCode: '1103', nature: 'DEBIT' },
      { id: 'acc_20', code: '20', title: 'بدهی‌های جاری', level: 'KOL', nature: 'CREDIT' },
      { id: 'acc_2101', code: '2101', title: 'حساب‌ها و اسناد پرداختنی تجاری', level: 'MOEIN', parentCode: '20', nature: 'CREDIT' },
      { id: 'acc_210101', code: '210101', title: 'تامین‌کنندگان مواد اولیه و ملزومات', level: 'TAFZILI', parentCode: '2101', nature: 'CREDIT' },
      { id: 'acc_50', code: '50', title: 'درآمدها و فروش', level: 'KOL', nature: 'CREDIT' },
      { id: 'acc_5101', code: '5101', title: 'فروش ناخالص نخ‌های تولیدی', level: 'MOEIN', parentCode: '50', nature: 'CREDIT' },
      { id: 'acc_60', code: '60', title: 'بهای تمام‌شده کالای فروش‌رفته', level: 'KOL', nature: 'DEBIT' },
      { id: 'acc_6101', code: '6101', title: 'مواد اولیه مستقیم مصرفی', level: 'MOEIN', parentCode: '60', nature: 'DEBIT' },
      { id: 'acc_6102', code: '6102', title: 'دستمزد مستقیم خطوط تولید', level: 'MOEIN', parentCode: '60', nature: 'DEBIT' },
      { id: 'acc_6103', code: '6103', title: 'سربار ساخت و بسته‌بندی کارخانه', level: 'MOEIN', parentCode: '60', nature: 'DEBIT' }
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
    }
  };
};
