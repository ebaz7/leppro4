import {
  FileSpreadsheet,
  Landmark,
  ClipboardList,
  ShoppingCart,
  Boxes,
  Calculator,
  Factory,
  Users,
  Cpu,
  Sliders
} from 'lucide-react';

export interface ErpCompanySummary {
  id: string;
  name: string;
  registrationNumber: string;
  nationalId: string;
  economicCode: string;
  address: string;
  phone: string;
  logo?: string;
  activeFiscalYear: string;
  fiscalYears?: string[];
  allowedUserIds: string[];
  createdAt?: number;
  stats?: {
    warehousesCount: number;
    itemsCount: number;
    inStockCartonsCount: number;
    vouchersCount: number;
    pendingRemittancesCount: number;
    treasuryDocsCount: number;
  };
}

export interface ErpProductionLine {
  id: string;
  code: string;
  name: string;
  machineType: string;
  supervisorName: string;
  isActive: boolean;
  notes?: string;
}

export interface ErpCommodityGroup {
  id: string;
  code: string;
  name: string;
  description?: string;
}

export interface ErpWarehouse {
  id: string;
  code: string;
  name: string;
  type: 'RAW_MATERIAL' | 'PACKAGING' | 'FINISHED_YARN' | 'WASTE' | 'GENERAL';
  location: string;
  managerName?: string;
  assignedGroupIds?: string[];
  assignedItemIds?: string[];
}

export interface ErpItem {
  id: string;
  code: string;
  name: string;
  category: 'RAW_MATERIAL' | 'PACKAGING' | 'FINISHED_YARN' | 'WASTE';
  groupId?: string;
  groupName?: string;
  unit: string;
  warehouseId: string;
  stockQty: number;
  unitCost: number;
  salesPrice: number;
  yarnCount?: string;
  filament?: string;
  ply?: string;
  colorCode?: string;
  colorName?: string;
  grade?: 'A' | 'B' | 'C';
  coneWeightGrams: number;
  cartonWeightGrams: number;
  defaultConesPerCarton: number;
}

export interface ErpBomComponent {
  id: string;
  itemId: string;
  itemName: string;
  category: 'RAW_MATERIAL' | 'PACKAGING';
  qtyPerKgOutput: number;
  unit: string;
}

export interface ErpBom {
  id: string;
  finishedItemId: string;
  finishedItemName: string;
  version: string;
  wastePercent: number;
  directLaborPerKg: number;
  factoryOverheadPerKg: number;
  components: ErpBomComponent[];
}

export interface ErpProductionOrder {
  id: string;
  orderNo: string;
  dateJalali: string;
  machineCode: string;
  shift: string;
  supervisorName: string;
  productId: string;
  productName: string;
  lotNumber: string;
  targetQtyKg: number;
  producedQtyKg: number;
  wasteQtyKg: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'HALTED';
}

export interface ErpCartonHistoryEvent {
  id: string;
  stage: 'PRODUCTION_WEIGHING' | 'WAREHOUSE_RECEIPT' | 'INTER_WH_TRANSFER' | 'INTER_WH_RECEIPT' | 'SALES_REMITTANCE' | 'SALES_RETURN';
  title: string;
  dateJalali: string;
  timeExact: string;
  actor: string;
  details: string;
  docNo?: string;
  archiveCode?: string;
}

export interface ErpCartonLabel {
  id: string;
  serialNumber: string;
  referenceCode: string; // e.g. DLK-405-10023
  qrPayload: string;
  productId: string;
  productCode: string;
  productName: string;
  yarnCount: string;
  colorName: string;
  lotNumber: string;
  machineCode: string;
  shift: string;
  grade: 'A' | 'B' | 'C';
  grossWeightKg: number;
  conesCount: number;
  coneWeightGrams: number;
  cartonWeightGrams: number;
  totalTareKg: number;
  netWeightKg: number;
  unitCostPerKg: number;
  totalCostRials: number;
  warehouseId: string;
  status: 'IN_STOCK' | 'REMITTED' | 'SOLD' | 'RETURNED' | 'VOID';
  createdAt: number;
  createdDateJalali: string;
  createdTimeExact?: string;
  createdBy: string;
  productionLineId?: string;
  productionLineName?: string;
  productionVoucherNo?: string;
  productionArchiveCode?: string;
  remittanceId?: string;
  sourceSystem?: 'DELKAM' | 'SAYAN';
  history?: ErpCartonHistoryEvent[];
}

export interface ErpProductionVoucher {
  id: string;
  voucherNo: string;
  archiveCode: string;
  dateJalali: string;
  timeExact: string;
  lineId: string;
  lineName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  cartonsCount: number;
  totalGrossWeightKg: number;
  totalTareKg: number;
  totalNetWeightKg: number;
  operatorName: string;
  cartonIds: string[];
  status: 'PENDING_WAREHOUSE_DELIVERY' | 'DELIVERED_TO_WAREHOUSE';
  deliveredWarehouseId?: string;
  deliveredWarehouseName?: string;
  deliveredDocNo?: string;
  notes?: string;
}

export type ErpWarehouseDocType =
  | 'RECEIPT_PRODUCTION'
  | 'SALES_REMITTANCE'
  | 'INTER_WH_TRANSFER'
  | 'INTER_WH_RECEIPT'
  | 'SALES_RETURN';

export interface ErpWarehouseDocument {
  id: string;
  docNo: string;
  archiveCode: string;
  docType: ErpWarehouseDocType;
  dateJalali: string;
  timeExact: string;
  sourceWarehouseId?: string;
  sourceWarehouseName?: string;
  targetWarehouseId?: string;
  targetWarehouseName?: string;
  partyName?: string;
  partyCode?: string;
  driverName?: string;
  plateNumber?: string;
  productionVoucherId?: string;
  referenceDocId?: string;
  cartonIds: string[];
  cartonsCount: number;
  totalGrossWeightKg: number;
  totalNetWeightKg: number;
  status: 'COMPLETED' | 'PENDING_RECEIPT';
  receiverUserName?: string;
  createdBy: string;
  notes?: string;
}

export interface ErpWarehouseDoc {
  id: string;
  docNo: string;
  docType: 'RECEIPT_PURCHASE' | 'RECEIPT_PRODUCTION' | 'ISSUE_PRODUCTION' | 'ISSUE_SALES' | 'STOCKTAKING_ADJUST' | 'TRANSFER';
  dateJalali: string;
  warehouseId: string;
  warehouseName: string;
  counterpartyName: string;
  status: 'DRAFT' | 'CARTABLE' | 'FINALIZED';
  items: {
    itemId: string;
    itemCode: string;
    itemName: string;
    qty: number;
    unit: string;
    unitCost: number;
    totalCost: number;
  }[];
  notes?: string;
}

export interface ErpSalesOrder {
  id: string;
  orderNo: string;
  orderType: 'SALES_ORDER' | 'PURCHASE_ORDER';
  dateJalali: string;
  partyName: string;
  partyCode: string;
  deliveryDueDate: string;
  status: 'PENDING_CARTABLE' | 'APPROVED_FOR_WAREHOUSE' | 'CONVERTED_TO_INVOICE' | 'CANCELLED';
  items: {
    itemId: string;
    itemName: string;
    qtyKg: number;
    estimatedUnitPrice: number;
  }[];
  notes?: string;
}

export interface ErpRemittanceItem {
  productId: string;
  productName: string;
  cartonIds: string[];
  cartonsCount: number;
  grossWeightKg: number;
  netWeightKg: number;
  unitCostPerKg: number;
  unitPrice: number;
}

export interface ErpRemittance {
  id: string;
  remittanceNo: string;
  dateJalali: string;
  customerName: string;
  customerCode: string;
  driverName: string;
  plateNumber: string;
  destinationAddress?: string;
  status: 'FACTORY_EXIT_NO_PRICE' | 'PENDING_INVOICE' | 'INVOICED' | 'CANCELLED';
  items: ErpRemittanceItem[];
  notes: string;
  createdAt: number;
  createdBy: string;
  invoiceId?: string;
  exitPermitId?: string;
  exitPermitNumber?: number;
}

export interface ErpTradeDoc {
  id: string;
  docNo: string;
  docType: 'PURCHASE' | 'PURCHASE_RETURN' | 'SALES' | 'SALES_RETURN';
  dateJalali: string;
  partyName: string;
  partyCode: string;
  warehouseId: string;
  remittanceId?: string;
  items: {
    itemId: string;
    itemName: string;
    qty: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    costPrice?: number;
  }[];
  discountAmount: number;
  taxAmount: number;
  netTotalAmount: number;
  voucherId?: string;
  notes: string;
  createdAt: number;
  createdBy: string;
}

export interface ErpParty {
  id: string;
  code: string;
  name: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'PERSONNEL' | 'COST_CENTER';
  nationalId: string;
  phone: string;
  city: string;
  creditLimitRials: number;
}

export interface ErpBankAccount {
  id: string;
  code: string;
  bankName: string;
  branchName: string;
  accountNo: string;
  shebaNo: string;
  accountType: 'JARI' | 'KOTAH_MODAT' | 'CASHBOX';
  balanceRials: number;
  tafziliCode: string;
}

export interface ErpChequeBook {
  id: string;
  bankAccountId: string;
  bankName: string;
  series: string;
  fromSerial: string;
  toSerial: string;
  leavesCount: number;
  usedLeaves: number;
  status: 'ACTIVE' | 'EXHAUSTED';
}

export interface ErpTreasuryDoc {
  id: string;
  docNo: string;
  docType: 'RECEIPT_CHEQUE' | 'RECEIPT_CASH' | 'PAYMENT_CHEQUE' | 'PAYMENT_WIRE';
  dateJalali: string;
  partyName: string;
  partyCode: string;
  bankName: string;
  sayadiId?: string;
  chequeSerial?: string;
  dueDateJalali?: string;
  amountRials: number;
  chequeStatus?: 'IN_VAULT' | 'IN_BANK_COLLECTION' | 'CLEARED' | 'BOUNCED' | 'ENDORSED' | 'ISSUED';
  voucherNo?: number;
  description: string;
}

export interface ErpEmployee {
  id: string;
  personnelCode: string;
  fullName: string;
  nationalId: string;
  department: string;
  jobTitle: string;
  baseSalaryRials: number;
  housingAllowanceRials: number;
  childAllowanceRials: number;
  bankSheba: string;
}

export interface ErpPayrollSlip {
  id: string;
  yearMonth: string;
  employeeId: string;
  employeeName: string;
  personnelCode: string;
  workedDays: number;
  overtimeHours: number;
  grossPayRials: number;
  insuranceEmployeeRials: number;
  insuranceEmployerRials: number;
  taxRials: number;
  netPayableRials: number;
  voucherNo?: number;
}

export interface ErpFixedAsset {
  id: string;
  assetCode: string;
  title: string;
  category: 'MACHINERY' | 'BUILDING' | 'VEHICLE' | 'EQUIPMENT';
  purchaseDateJalali: string;
  costRials: number;
  salvageValueRials: number;
  depreciationMethod: 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
  annualRatePercent: number;
  accumulatedDepRials: number;
  bookValueRials: number;
  location: string;
}

export interface ErpAccount {
  id: string;
  code: string;
  title: string;
  level: 'GROUP' | 'KOL' | 'MOEIN' | 'TAFZILI';
  parentCode?: string;
  nature: 'DEBIT' | 'CREDIT' | 'BOTH';
  systemRole?: string;
}

export interface ErpVoucherLine {
  id: string;
  accountCode: string;
  accountTitle: string;
  tafziliName: string;
  debit: number;
  credit: number;
  description: string;
}

export interface ErpVoucher {
  id: string;
  voucherNo: number;
  dateJalali: string;
  type: 'GENERAL' | 'PRODUCTION' | 'PURCHASE' | 'SALES' | 'RETURN' | 'TREASURY' | 'PAYROLL' | 'OPENING_CUTOVER';
  status: 'DRAFT' | 'FINALIZED';
  description: string;
  referenceId?: string;
  createdBy: string;
  createdAt: number;
  lines: ErpVoucherLine[];
}

export interface ErpCutoverConfig {
  stage1FactoryWarehouseActive: boolean;
  stage2TehranPricingInvoiceActive: boolean;
  stage3PaymentOrdersAutoVoucherActive: boolean;
  lastSayanBarcodeSyncAt: number | null;
  lastSayanBarcodeSyncCount: number;
  lastTrialBalanceCutoffDate: string;
  lastTrialBalanceImportAt: number | null;
  defaultPaymentBankAccountCode: string;
  defaultReceivableAccountCode: string;
  defaultPayableAccountCode: string;
}

export interface IndustrialErpState {
  companyId?: string;
  companyName?: string;
  activeFiscalYear?: string;
  productionLines?: ErpProductionLine[];
  commodityGroups?: ErpCommodityGroup[];
  productionVouchers?: ErpProductionVoucher[];
  warehouseDocuments?: ErpWarehouseDocument[];
  warehouses: ErpWarehouse[];
  items: ErpItem[];
  boms: ErpBom[];
  productionOrders: ErpProductionOrder[];
  cartonLabels: ErpCartonLabel[];
  warehouseDocs: ErpWarehouseDoc[];
  salesOrders: ErpSalesOrder[];
  remittances: ErpRemittance[];
  tradeDocs: ErpTradeDoc[];
  parties: ErpParty[];
  bankAccounts: ErpBankAccount[];
  chequeBooks: ErpChequeBook[];
  treasuryDocs: ErpTreasuryDoc[];
  employees: ErpEmployee[];
  payrollSlips: ErpPayrollSlip[];
  fixedAssets: ErpFixedAsset[];
  chartOfAccounts: ErpAccount[];
  vouchers: ErpVoucher[];
  nextVoucherNo: number;
  nextSerialCounter: number;
  cutoverConfig?: ErpCutoverConfig;
}

export type ErpMainCategoryId =
  | 'FINANCE'
  | 'TREASURY'
  | 'ORDERS'
  | 'COMMERCE'
  | 'WAREHOUSE'
  | 'WAREHOUSE_ACC'
  | 'PRODUCTION'
  | 'PAYROLL'
  | 'ASSETS'
  | 'MASTER';

export type ErpSubViewId =
  | 'fin_chart'
  | 'fin_tafsili'
  | 'fin_voucher_new'
  | 'fin_voucher_list'
  | 'fin_ledger_review'
  | 'fin_trial_balance'
  | 'fin_year_end'
  | 'trs_banks'
  | 'trs_chequebooks'
  | 'trs_doc_new'
  | 'trs_cheque_ops'
  | 'trs_archive'
  | 'ord_new'
  | 'ord_cartable'
  | 'com_tehran_pricing'
  | 'com_sales'
  | 'com_purchases'
  | 'com_returns'
  | 'wh_warehouses'
  | 'wh_receipt_production'
  | 'wh_sales_remittance'
  | 'wh_inter_remittance'
  | 'wh_inter_receipt'
  | 'wh_sales_return'
  | 'wh_archive'
  | 'wh_stock_report'
  | 'wh_kardex'
  | 'wh_tracking'
  | 'wh_items'
  | 'wh_weighbridge'
  | 'wh_exit_remittance'
  | 'wh_receipt_issue'
  | 'wh_cartable'
  | 'wh_stocktaking'
  | 'wacc_pricing'
  | 'wacc_riali_kardex'
  | 'prd_lines'
  | 'prd_items'
  | 'prd_line_perf'
  | 'prd_archive'
  | 'prd_bom'
  | 'pay_employees'
  | 'pay_slips'
  | 'ast_management'
  | 'mst_companies'
  | 'mst_sayan_cutover';

export interface ErpSidebarGroup {
  groupTitle: string;
  items: { id: ErpSubViewId; label: string }[];
}

export interface ErpSidebarCategory {
  id: ErpMainCategoryId;
  title: string;
  icon: any;
  color: string;
  groups: ErpSidebarGroup[];
}

export const ERP_SIDEBAR_TREE: ErpSidebarCategory[] = [
  {
    id: 'PRODUCTION',
    title: 'برنامه‌ریزی و تولید',
    icon: Factory,
    color: 'text-orange-600',
    groups: [
      {
        groupTitle: 'تعاریف پایه تولید',
        items: [
          { id: 'prd_lines', label: 'تعریف خطوط تولید' },
          { id: 'prd_items', label: 'تعریف کالاها و گروه‌ها' },
          { id: 'prd_bom', label: 'تعریف فرمول تولید (BOM)' }
        ]
      },
      {
        groupTitle: 'عملکرد خط و باسکول',
        items: [
          { id: 'prd_line_perf', label: 'عملکرد خط تولید و توزین باسکول (چاپ لیبل)' },
          { id: 'prd_archive', label: 'بایگانی تولید' }
        ]
      }
    ]
  },
  {
    id: 'WAREHOUSE',
    title: 'انبارداری',
    icon: Boxes,
    color: 'text-teal-600',
    groups: [
      {
        groupTitle: 'تعاریف و تخصیص انبار',
        items: [
          { id: 'wh_warehouses', label: 'تعریف انبارها و تخصیص کالا و گروه' }
        ]
      },
      {
        groupTitle: 'اسناد و عملیات انبار',
        items: [
          { id: 'wh_receipt_production', label: 'رسید تحویل کالا از تولید' },
          { id: 'wh_sales_remittance', label: 'حواله فروش (خروج بدون فی)' },
          { id: 'wh_inter_remittance', label: 'حواله بین انبار (انتقال)' },
          { id: 'wh_inter_receipt', label: 'رسید حواله بین انبار (تایید ورود)' },
          { id: 'wh_sales_return', label: 'رسید مرجوعی از فروش' },
          { id: 'wh_archive', label: 'بایگانی اسناد انبار' }
        ]
      },
      {
        groupTitle: 'گزارش و رهگیری',
        items: [
          { id: 'wh_stock_report', label: 'گزارش انبار' },
          { id: 'wh_kardex', label: 'کاردکس کالا' },
          { id: 'wh_tracking', label: 'رهگیری جامع کارتن با کد ارجاع / بارکد' }
        ]
      }
    ]
  },
  {
    id: 'FINANCE',
    title: 'مالی و حسابداری',
    icon: FileSpreadsheet,
    color: 'text-emerald-600',
    groups: [
      {
        groupTitle: 'اطلاعات پایه حسابداری',
        items: [
          { id: 'fin_chart', label: 'درختواره حساب‌ها (کل/معین)' },
          { id: 'fin_tafsili', label: 'معرفی تفصیلی‌های شناور و اشخاص' }
        ]
      },
      {
        groupTitle: 'عملیات روزانه و اسناد',
        items: [
          { id: 'fin_voucher_new', label: 'صدور و ویرایش سند حسابداری' },
          { id: 'fin_voucher_list', label: 'فهرست و بایگانی اسناد مالی' }
        ]
      },
      {
        groupTitle: 'مرور و گزارشات مالی',
        items: [
          { id: 'fin_ledger_review', label: 'مرور جامع حساب‌ها و دفاتر' },
          { id: 'fin_trial_balance', label: 'تراز آزمایشی ۴ و ۶ ستونی' },
          { id: 'fin_year_end', label: 'عملیات پایان سال و بستن حساب‌ها' }
        ]
      }
    ]
  },
  {
    id: 'TREASURY',
    title: 'خزانه‌داری',
    icon: Landmark,
    color: 'text-blue-600',
    groups: [
      {
        groupTitle: 'اطلاعات پایه خزانه',
        items: [
          { id: 'trs_banks', label: 'معرفی بانک‌ها، حساب‌ها و صندوق' },
          { id: 'trs_chequebooks', label: 'معرفی دسته‌چک‌ها و برگه‌ها' }
        ]
      },
      {
        groupTitle: 'عملیات روزانه خزانه',
        items: [
          { id: 'trs_doc_new', label: 'صدور و ویرایش سند خزانه (دریافت/پرداخت)' },
          { id: 'trs_cheque_ops', label: 'عملیات چک (واگذاری/وصول/خرج/برگشت)' },
          { id: 'trs_archive', label: 'بایگانی اسناد خزانه + اتصال به دستور پرداخت دلکام' }
        ]
      }
    ]
  },
  {
    id: 'ORDERS',
    title: 'دریافت سفارشات',
    icon: ClipboardList,
    color: 'text-amber-600',
    groups: [
      {
        groupTitle: 'عملیات سفارشات',
        items: [
          { id: 'ord_new', label: 'صدور و ویرایش سند سفارشات' },
          { id: 'ord_cartable', label: 'کارتابل و لیست‌های سفارش' }
        ]
      }
    ]
  },
  {
    id: 'COMMERCE',
    title: 'خرید و فروش',
    icon: ShoppingCart,
    color: 'text-indigo-600',
    groups: [
      {
        groupTitle: 'عملیات بازرگانی و دفتر تهران',
        items: [
          { id: 'com_tehran_pricing', label: 'کارتابل دفتر تهران (تعیین فی و صدور فاکتور)' },
          { id: 'com_sales', label: 'صدور فاکتور فروش قطعی' },
          { id: 'com_purchases', label: 'صدور فاکتور خرید مواد و ملزومات' },
          { id: 'com_returns', label: 'برگشت از فروش / برگشت از خرید' }
        ]
      }
    ]
  },
  {
    id: 'WAREHOUSE_ACC',
    title: 'حسابداری انبار',
    icon: Calculator,
    color: 'text-cyan-600',
    groups: [
      {
        groupTitle: 'قیمت‌گذاری و اسناد ریالی انبار',
        items: [
          { id: 'wacc_pricing', label: 'قیمت‌گذاری اسناد انبار (میانگین موزون)' },
          { id: 'wacc_riali_kardex', label: 'کاردکس ریالی-تعدادی و صدور سند انبار' }
        ]
      }
    ]
  },
  {
    id: 'PAYROLL',
    title: 'حقوق و دستمزد',
    icon: Users,
    color: 'text-purple-600',
    groups: [
      {
        groupTitle: 'کارگزینی و محاسبه حقوق',
        items: [
          { id: 'pay_employees', label: 'پرونده پرسنل، حکم کارگزینی و مراکز هزینه' },
          { id: 'pay_slips', label: 'محاسبه فیش حقوقی، بیمه، مالیات و سند حقوق' }
        ]
      }
    ]
  },
  {
    id: 'ASSETS',
    title: 'دارایی ثابت و اموال',
    icon: Cpu,
    color: 'text-rose-600',
    groups: [
      {
        groupTitle: 'مدیریت اموال و استهلاک',
        items: [
          { id: 'ast_management', label: 'پلاک‌گذاری اموال، ماشین‌آلات و محاسبه استهلاک' }
        ]
      }
    ]
  },
  {
    id: 'MASTER',
    title: 'اطلاعات پایه و مشترک',
    icon: Sliders,
    color: 'text-slate-600',
    groups: [
      {
        groupTitle: 'مدیریت شرکت‌ها و ارتباط با سایان/دلکام',
        items: [
          { id: 'mst_companies', label: 'مدیریت شرکت‌ها، شعب و دوره‌های مالی مستقل' },
          { id: 'mst_sayan_cutover', label: 'انتقال تراز افتتاحیه سایان و سینک بارکدها' }
        ]
      }
    ]
  }
];

export const SUBVIEW_TITLES: Record<ErpSubViewId, string> = {
  prd_lines: 'تعریف خطوط تولید',
  prd_items: 'تعریف گروه‌ها و کالاهای تولیدی',
  prd_line_perf: 'عملکرد خط تولید (توزین باسکول و چاپ لیبل کارتن)',
  prd_archive: 'بایگانی تولید',
  prd_bom: 'تعریف فرمول‌های تولید (BOM)',
  wh_warehouses: 'تعریف انبارها و تخصیص کالا و گروه',
  wh_receipt_production: 'رسید تحویل کالا از تولید',
  wh_sales_remittance: 'حواله فروش کارخانه (خروج بدون فی)',
  wh_inter_remittance: 'حواله بین انبار (انتقال)',
  wh_inter_receipt: 'رسید حواله بین انبار (تایید ورود مقصد)',
  wh_sales_return: 'رسید مرجوعی از فروش',
  wh_archive: 'بایگانی اسناد انبار',
  wh_stock_report: 'گزارش موجودی انبار',
  wh_kardex: 'کاردکس کالا و گردش انبار',
  wh_tracking: 'رهگیری جامع کارتن با کد ارجاع / بارکد',
  wh_items: 'تعریف سرفصل کالاها و وزن دوک/کارتن',
  wh_weighbridge: 'توزین باسکول، محاسبه خالص و چاپ بارکد/QR',
  wh_exit_remittance: 'حواله خروج کارخانه (اسکن بارکد - بدون فی)',
  wh_receipt_issue: 'صدور و ویرایش سند انبار (رسید/حواله)',
  wh_cartable: 'کارتابل اسناد انبار و بیجک‌های دلکام',
  wh_stocktaking: 'کنترل موجودی و انبارگردانی',
  wacc_pricing: 'قیمت‌گذاری اسناد انبار (میانگین موزون)',
  wacc_riali_kardex: 'کاردکس ریالی-تعدادی انبار',
  fin_chart: 'درختواره حساب‌ها (کل / معین)',
  fin_tafsili: 'معرفی تفصیلی‌های شناور و اشخاص',
  fin_voucher_new: 'صدور و ویرایش سند حسابداری',
  fin_voucher_list: 'فهرست و بایگانی اسناد مالی',
  fin_ledger_review: 'مرور جامع حساب‌ها و دفاتر',
  fin_trial_balance: 'تراز آزمایشی ۴ و ۶ ستونی',
  fin_year_end: 'عملیات پایان سال و بستن حساب‌ها',
  trs_banks: 'معرفی بانک‌ها، حساب‌ها و صندوق',
  trs_chequebooks: 'معرفی دسته‌چک‌ها و برگه‌ها',
  trs_doc_new: 'صدور و ویرایش سند خزانه',
  trs_cheque_ops: 'عملیات چک‌های دریافتی و پرداختی',
  trs_archive: 'بایگانی اسناد خزانه و دستور پرداخت‌های دلکام',
  ord_new: 'صدور و ویرایش سند سفارشات',
  ord_cartable: 'کارتابل و لیست‌های سفارش',
  com_tehran_pricing: 'کارتابل دفتر تهران (تعیین فی و صدور فاکتور)',
  com_sales: 'صدور فاکتور فروش قطعی',
  com_purchases: 'صدور فاکتور خرید مواد و ملزومات',
  com_returns: 'برگشت از فروش / برگشت از خرید',
  pay_employees: 'پرونده پرسنل و مراکز هزینه',
  pay_slips: 'محاسبه فیش حقوقی و سند حقوق',
  ast_management: 'دارایی ثابت، اموال و محاسبه استهلاک',
  mst_companies: 'مدیریت شرکت‌ها و دوره‌های مالی مستقل',
  mst_sayan_cutover: 'انتقال تراز افتتاحیه سایان و سینک بارکدها'
};

export function getTodayJalali(): string {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .format(new Date())
      .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  } catch {
    return '1405/08/20';
  }
}

export function getExactTimeNow(): string {
  try {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return '14:30:00';
  }
}
