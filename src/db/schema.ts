import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Core authenticated users table (Step 4.5 Cloud SQL setup)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Per-company ERP root metadata, settings, sequences & optimistic concurrency revision
export const erpCompanies = pgTable('erp_companies', {
  companyId: text('company_id').primaryKey(),
  companyName: text('company_name').notNull(),
  activeFiscalYear: text('active_fiscal_year').notNull().default('1405'),
  fiscalYears: jsonb('fiscal_years').$type<string[]>().notNull().default(['1405', '1404', '1403']),
  nextCartonSeq: integer('next_carton_seq').notNull().default(10001),
  nextVoucherNo: integer('next_voucher_no').notNull().default(1),
  cutoverConfig: jsonb('cutover_config').$type<Record<string, any>>().notNull().default({}),
  labelTemplateConfig: jsonb('label_template_config').$type<Record<string, any>>().notNull().default({}),
  scaleConfig: jsonb('scale_config').$type<Record<string, any>>().notNull().default({}),
  revision: integer('revision').notNull().default(1),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const erpProductionLines = pgTable(
  'erp_production_lines',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    code: text('code').notNull().default(''),
    name: text('name').notNull(),
    machineType: text('machine_type').notNull().default(''),
    supervisorName: text('supervisor_name').notNull().default(''),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes').notNull().default(''),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_prod_lines_company').on(table.companyId),
  ]
);

export const erpCommodityGroups = pgTable(
  'erp_commodity_groups',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    code: text('code').notNull().default(''),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    isActive: boolean('is_active').notNull().default(true),
    description: text('description').notNull().default(''),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_comm_groups_company').on(table.companyId),
  ]
);

export const erpWarehouses = pgTable(
  'erp_warehouses',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    code: text('code').notNull().default(''),
    name: text('name').notNull(),
    warehouseType: text('warehouse_type').notNull().default('GENERAL'),
    location: text('location').notNull().default(''),
    managerName: text('manager_name').notNull().default(''),
    assignedGroupIds: jsonb('assigned_group_ids').$type<string[]>().notNull().default([]),
    assignedItemIds: jsonb('assigned_item_ids').$type<string[]>().notNull().default([]),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_warehouses_company').on(table.companyId),
  ]
);

export const erpItems = pgTable(
  'erp_items',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    code: text('code').notNull().default(''),
    name: text('name').notNull(),
    category: text('category').notNull().default('FINISHED_YARN'),
    groupId: text('group_id'),
    groupName: text('group_name').notNull().default(''),
    unit: text('unit').notNull().default('کیلوگرم'),
    warehouseId: text('warehouse_id').notNull().default(''),
    stockQty: doublePrecision('stock_qty').notNull().default(0),
    unitCost: doublePrecision('unit_cost').notNull().default(0),
    salesPrice: doublePrecision('sales_price').notNull().default(0),
    yarnCount: text('yarn_count').notNull().default(''),
    colorCode: text('color_code').notNull().default(''),
    colorName: text('color_name').notNull().default(''),
    grade: text('grade').notNull().default('A'),
    coneWeightGrams: doublePrecision('cone_weight_grams').notNull().default(110),
    cartonWeightGrams: doublePrecision('carton_weight_grams').notNull().default(1450),
    defaultConesPerCarton: integer('default_cones_per_carton').notNull().default(6),
    isActive: boolean('is_active').notNull().default(true),
    isTareLocked: boolean('is_tare_locked').notNull().default(false),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_items_company_code').on(table.companyId, table.code),
    index('idx_erp_items_warehouse').on(table.companyId, table.warehouseId),
  ]
);

export const erpBoms = pgTable(
  'erp_boms',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    code: text('code').notNull().default(''),
    title: text('title').notNull().default(''),
    finishedItemId: text('finished_item_id').notNull().default(''),
    finishedItemCode: text('finished_item_code').notNull().default(''),
    finishedItemName: text('finished_item_name').notNull().default(''),
    version: text('version').notNull().default('1.0'),
    wastePercent: doublePrecision('waste_percent').notNull().default(0),
    directLaborPerKg: doublePrecision('direct_labor_per_kg').notNull().default(0),
    factoryOverheadPerKg: doublePrecision('factory_overhead_per_kg').notNull().default(0),
    components: jsonb('components').$type<any[]>().notNull().default([]),
    status: text('status').notNull().default('ACTIVE'),
    totalCostPerKg: doublePrecision('total_cost_per_kg').notNull().default(0),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_boms_company').on(table.companyId),
  ]
);

export const erpProductionOrders = pgTable(
  'erp_production_orders',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    orderNo: text('order_no').notNull().default(''),
    dateJalali: text('date_jalali').notNull().default(''),
    machineCode: text('machine_code').notNull().default(''),
    shift: text('shift').notNull().default(''),
    supervisorName: text('supervisor_name').notNull().default(''),
    productId: text('product_id').notNull().default(''),
    productName: text('product_name').notNull().default(''),
    lotNumber: text('lot_number').notNull().default(''),
    targetQtyKg: doublePrecision('target_qty_kg').notNull().default(0),
    producedQtyKg: doublePrecision('produced_qty_kg').notNull().default(0),
    wasteQtyKg: doublePrecision('waste_qty_kg').notNull().default(0),
    status: text('status').notNull().default('IN_PROGRESS'),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_prod_orders_company').on(table.companyId),
  ]
);

export const erpCartonLabels = pgTable(
  'erp_carton_labels',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    serialNumber: text('serial_number').notNull().default(''),
    referenceCode: text('reference_code').notNull().default(''),
    qrPayload: text('qr_payload').notNull().default(''),
    productId: text('product_id').notNull().default(''),
    productCode: text('product_code').notNull().default(''),
    productName: text('product_name').notNull().default(''),
    yarnCount: text('yarn_count').notNull().default(''),
    colorName: text('color_name').notNull().default(''),
    lotNumber: text('lot_number').notNull().default(''),
    machineCode: text('machine_code').notNull().default(''),
    shift: text('shift').notNull().default(''),
    grade: text('grade').notNull().default('A'),
    grossWeightKg: doublePrecision('gross_weight_kg').notNull().default(0),
    conesCount: integer('cones_count').notNull().default(6),
    coneWeightGrams: doublePrecision('cone_weight_grams').notNull().default(110),
    cartonWeightGrams: doublePrecision('carton_weight_grams').notNull().default(1450),
    totalTareKg: doublePrecision('total_tare_kg').notNull().default(0),
    netWeightKg: doublePrecision('net_weight_kg').notNull().default(0),
    unitCostPerKg: doublePrecision('unit_cost_per_kg').notNull().default(0),
    totalCostRials: doublePrecision('total_cost_rials').notNull().default(0),
    warehouseId: text('warehouse_id').notNull().default(''),
    status: text('status').notNull().default('IN_STOCK'),
    createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull().default(0),
    createdDateJalali: text('created_date_jalali').notNull().default(''),
    createdTimeExact: text('created_time_exact').notNull().default(''),
    createdBy: text('created_by').notNull().default(''),
    productionLineId: text('production_line_id'),
    productionVoucherNo: text('production_voucher_no'),
    productionArchiveCode: text('production_archive_code'),
    remittanceId: text('remittance_id'),
    sourceSystem: text('source_system').notNull().default('DELKAM'),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_cartons_serial').on(table.companyId, table.serialNumber),
    index('idx_erp_cartons_ref').on(table.companyId, table.referenceCode),
    index('idx_erp_cartons_status').on(table.companyId, table.status),
  ]
);

export const erpProductionVouchers = pgTable(
  'erp_production_vouchers',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    voucherNo: text('voucher_no').notNull().default(''),
    archiveCode: text('archive_code').notNull().default(''),
    dateJalali: text('date_jalali').notNull().default(''),
    timeExact: text('time_exact').notNull().default(''),
    lineId: text('line_id').notNull().default(''),
    lineName: text('line_name').notNull().default(''),
    itemId: text('item_id').notNull().default(''),
    itemCode: text('item_code').notNull().default(''),
    itemName: text('item_name').notNull().default(''),
    cartonsCount: integer('cartons_count').notNull().default(0),
    totalGrossWeightKg: doublePrecision('total_gross_weight_kg').notNull().default(0),
    totalTareKg: doublePrecision('total_tare_kg').notNull().default(0),
    totalNetWeightKg: doublePrecision('total_net_weight_kg').notNull().default(0),
    operatorName: text('operator_name').notNull().default(''),
    cartonIds: jsonb('carton_ids').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('PENDING_WAREHOUSE_DELIVERY'),
    deliveredWarehouseId: text('delivered_warehouse_id'),
    deliveredWarehouseName: text('delivered_warehouse_name'),
    deliveredDocNo: text('delivered_doc_no'),
    notes: text('notes').notNull().default(''),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_prod_vouchers_company').on(table.companyId),
  ]
);

export const erpWarehouseDocuments = pgTable(
  'erp_warehouse_documents',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    docNo: text('doc_no').notNull().default(''),
    archiveCode: text('archive_code').notNull().default(''),
    docType: text('doc_type').notNull().default('RECEIPT_PRODUCTION'),
    dateJalali: text('date_jalali').notNull().default(''),
    timeExact: text('time_exact').notNull().default(''),
    sourceWarehouseId: text('source_warehouse_id'),
    sourceWarehouseName: text('source_warehouse_name'),
    targetWarehouseId: text('target_warehouse_id'),
    targetWarehouseName: text('target_warehouse_name'),
    partyName: text('party_name'),
    partyCode: text('party_code'),
    driverName: text('driver_name'),
    plateNumber: text('plate_number'),
    productionVoucherId: text('production_voucher_id'),
    referenceDocId: text('reference_doc_id'),
    cartonIds: jsonb('carton_ids').$type<string[]>().notNull().default([]),
    cartonsCount: integer('cartons_count').notNull().default(0),
    totalGrossWeightKg: doublePrecision('total_gross_weight_kg').notNull().default(0),
    totalNetWeightKg: doublePrecision('total_net_weight_kg').notNull().default(0),
    status: text('status').notNull().default('COMPLETED'),
    receiverUserName: text('receiver_user_name'),
    createdBy: text('created_by').notNull().default(''),
    notes: text('notes').notNull().default(''),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_wh_docs_type').on(table.companyId, table.docType),
    index('idx_erp_wh_docs_status').on(table.companyId, table.status),
  ]
);

export const erpWarehouseLegacyDocs = pgTable(
  'erp_warehouse_legacy_docs',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    docNo: text('doc_no').notNull().default(''),
    docType: text('doc_type').notNull().default('RECEIPT_PRODUCTION'),
    dateJalali: text('date_jalali').notNull().default(''),
    warehouseId: text('warehouse_id').notNull().default(''),
    status: text('status').notNull().default('FINALIZED'),
    data: jsonb('data').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_wh_legacy_company').on(table.companyId),
  ]
);

export const erpSalesOrders = pgTable(
  'erp_sales_orders',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    orderNo: text('order_no').notNull().default(''),
    orderType: text('order_type').notNull().default('SALES_ORDER'),
    dateJalali: text('date_jalali').notNull().default(''),
    partyName: text('party_name').notNull().default(''),
    partyCode: text('party_code').notNull().default(''),
    deliveryDueDate: text('delivery_due_date').notNull().default(''),
    status: text('status').notNull().default('PENDING_CARTABLE'),
    items: jsonb('items').$type<any[]>().notNull().default([]),
    notes: text('notes').notNull().default(''),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_sales_orders_company').on(table.companyId),
  ]
);

export const erpRemittances = pgTable(
  'erp_remittances',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    remittanceNo: text('remittance_no').notNull().default(''),
    dateJalali: text('date_jalali').notNull().default(''),
    customerName: text('customer_name').notNull().default(''),
    customerCode: text('customer_code').notNull().default(''),
    driverName: text('driver_name').notNull().default(''),
    plateNumber: text('plate_number').notNull().default(''),
    status: text('status').notNull().default('PENDING_TEHRAN_PRICING'),
    items: jsonb('items').$type<any[]>().notNull().default([]),
    notes: text('notes').notNull().default(''),
    createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull().default(0),
    createdBy: text('created_by').notNull().default(''),
    invoiceId: text('invoice_id'),
    exitPermitId: text('exit_permit_id'),
    exitPermitNumber: integer('exit_permit_number'),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_remittances_company_status').on(table.companyId, table.status),
  ]
);

export const erpTradeDocs = pgTable(
  'erp_trade_docs',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    docNo: text('doc_no').notNull().default(''),
    docType: text('doc_type').notNull().default('SALES'),
    dateJalali: text('date_jalali').notNull().default(''),
    partyName: text('party_name').notNull().default(''),
    partyCode: text('party_code').notNull().default(''),
    warehouseId: text('warehouse_id').notNull().default(''),
    remittanceId: text('remittance_id'),
    items: jsonb('items').$type<any[]>().notNull().default([]),
    discountAmount: doublePrecision('discount_amount').notNull().default(0),
    taxAmount: doublePrecision('tax_amount').notNull().default(0),
    netTotalAmount: doublePrecision('net_total_amount').notNull().default(0),
    voucherId: text('voucher_id'),
    notes: text('notes').notNull().default(''),
    createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull().default(0),
    createdBy: text('created_by').notNull().default(''),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_trade_docs_company').on(table.companyId),
  ]
);

export const erpParties = pgTable(
  'erp_parties',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    code: text('code').notNull().default(''),
    name: text('name').notNull(),
    partyType: text('party_type').notNull().default('CUSTOMER'),
    nationalId: text('national_id').notNull().default(''),
    phone: text('phone').notNull().default(''),
    city: text('city').notNull().default(''),
    creditLimitRials: doublePrecision('credit_limit_rials').notNull().default(0),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_parties_company').on(table.companyId),
  ]
);

export const erpBankAccounts = pgTable(
  'erp_bank_accounts',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    code: text('code').notNull().default(''),
    bankName: text('bank_name').notNull(),
    branchName: text('branch_name').notNull().default(''),
    accountNo: text('account_no').notNull().default(''),
    shebaNo: text('sheba_no').notNull().default(''),
    accountType: text('account_type').notNull().default('JARI'),
    balanceRials: doublePrecision('balance_rials').notNull().default(0),
    tafziliCode: text('tafzili_code').notNull().default(''),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_banks_company').on(table.companyId),
  ]
);

export const erpChequeBooks = pgTable(
  'erp_cheque_books',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    bankAccountId: text('bank_account_id').notNull().default(''),
    bankName: text('bank_name').notNull().default(''),
    series: text('series').notNull().default(''),
    fromSerial: text('from_serial').notNull().default(''),
    toSerial: text('to_serial').notNull().default(''),
    leavesCount: integer('leaves_count').notNull().default(0),
    usedLeaves: integer('used_leaves').notNull().default(0),
    status: text('status').notNull().default('ACTIVE'),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_chequebooks_company').on(table.companyId),
  ]
);

export const erpTreasuryDocs = pgTable(
  'erp_treasury_docs',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    docNo: text('doc_no').notNull().default(''),
    docType: text('doc_type').notNull().default('RECEIPT_CASH'),
    dateJalali: text('date_jalali').notNull().default(''),
    partyName: text('party_name').notNull().default(''),
    partyCode: text('party_code').notNull().default(''),
    bankName: text('bank_name').notNull().default(''),
    sayadiId: text('sayadi_id'),
    chequeSerial: text('cheque_serial'),
    dueDateJalali: text('due_date_jalali'),
    amountRials: doublePrecision('amount_rials').notNull().default(0),
    chequeStatus: text('cheque_status'),
    voucherNo: integer('voucher_no'),
    description: text('description').notNull().default(''),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_treasury_docs_company').on(table.companyId),
  ]
);

export const erpEmployees = pgTable(
  'erp_employees',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    personnelCode: text('personnel_code').notNull().default(''),
    fullName: text('full_name').notNull(),
    nationalId: text('national_id').notNull().default(''),
    department: text('department').notNull().default(''),
    jobTitle: text('job_title').notNull().default(''),
    baseSalaryRials: doublePrecision('base_salary_rials').notNull().default(0),
    housingAllowanceRials: doublePrecision('housing_allowance_rials').notNull().default(0),
    childAllowanceRials: doublePrecision('child_allowance_rials').notNull().default(0),
    bankSheba: text('bank_sheba').notNull().default(''),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_employees_company').on(table.companyId),
  ]
);

export const erpPayrollSlips = pgTable(
  'erp_payroll_slips',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    yearMonth: text('year_month').notNull().default(''),
    employeeId: text('employee_id').notNull().default(''),
    employeeName: text('employee_name').notNull().default(''),
    personnelCode: text('personnel_code').notNull().default(''),
    workedDays: integer('worked_days').notNull().default(30),
    overtimeHours: doublePrecision('overtime_hours').notNull().default(0),
    grossPayRials: doublePrecision('gross_pay_rials').notNull().default(0),
    insuranceEmployeeRials: doublePrecision('insurance_employee_rials').notNull().default(0),
    insuranceEmployerRials: doublePrecision('insurance_employer_rials').notNull().default(0),
    taxRials: doublePrecision('tax_rials').notNull().default(0),
    netPayableRials: doublePrecision('net_payable_rials').notNull().default(0),
    voucherNo: integer('voucher_no'),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_payroll_slips_company').on(table.companyId),
  ]
);

export const erpFixedAssets = pgTable(
  'erp_fixed_assets',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    assetCode: text('asset_code').notNull().default(''),
    title: text('title').notNull(),
    category: text('category').notNull().default('MACHINERY'),
    purchaseDateJalali: text('purchase_date_jalali').notNull().default(''),
    costRials: doublePrecision('cost_rials').notNull().default(0),
    salvageValueRials: doublePrecision('salvage_value_rials').notNull().default(0),
    depreciationMethod: text('depreciation_method').notNull().default('STRAIGHT_LINE'),
    annualRatePercent: doublePrecision('annual_rate_percent').notNull().default(10),
    accumulatedDepRials: doublePrecision('accumulated_dep_rials').notNull().default(0),
    bookValueRials: doublePrecision('book_value_rials').notNull().default(0),
    location: text('location').notNull().default(''),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_assets_company').on(table.companyId),
  ]
);

export const erpChartOfAccounts = pgTable(
  'erp_chart_of_accounts',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    level: text('level').notNull().default('MOEIN'),
    parentCode: text('parent_code'),
    nature: text('nature').notNull().default('DEBIT'),
    systemRole: text('system_role'),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_coa_company_code').on(table.companyId, table.code),
  ]
);

export const erpVouchers = pgTable(
  'erp_vouchers',
  {
    companyId: text('company_id').notNull(),
    id: text('id').notNull(),
    voucherNo: integer('voucher_no').notNull().default(1),
    dateJalali: text('date_jalali').notNull().default(''),
    voucherType: text('voucher_type').notNull().default('GENERAL'),
    status: text('status').notNull().default('FINALIZED'),
    description: text('description').notNull().default(''),
    referenceId: text('reference_id'),
    createdBy: text('created_by').notNull().default(''),
    createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull().default(0),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.id] }),
    index('idx_erp_vouchers_company_no').on(table.companyId, table.voucherNo),
  ]
);

export const erpVoucherLines = pgTable(
  'erp_voucher_lines',
  {
    companyId: text('company_id').notNull(),
    voucherId: text('voucher_id').notNull(),
    id: text('id').notNull(),
    lineOrder: integer('line_order').notNull().default(0),
    accountCode: text('account_code').notNull().default(''),
    accountTitle: text('account_title').notNull().default(''),
    tafziliName: text('tafzili_name').notNull().default(''),
    debit: doublePrecision('debit').notNull().default(0),
    credit: doublePrecision('credit').notNull().default(0),
    description: text('description').notNull().default(''),
    extra: jsonb('extra').$type<Record<string, any>>().notNull().default({}),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.voucherId, table.id] }),
    index('idx_erp_voucher_lines_voucher').on(table.companyId, table.voucherId),
  ]
);

export const erpCompanyBackups = pgTable(
  'erp_company_backups',
  {
    id: text('id').primaryKey(),
    companyId: text('company_id').notNull(),
    companyName: text('company_name').notNull(),
    fileName: text('file_name').notNull(),
    format: text('format').notNull().default('json.gz'),
    backupKind: text('backup_kind').notNull().default('manual'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    compressedSizeBytes: integer('compressed_size_bytes').notNull().default(0),
    recordCounts: jsonb('record_counts').$type<Record<string, number>>().notNull().default({}),
    checksumSha256: text('checksum_sha256').notNull().default(''),
    createdBy: text('created_by').notNull().default('system'),
    createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull().default(0),
    createdDateJalali: text('created_date_jalali').notNull().default(''),
  },
  (table) => [
    index('idx_erp_backups_company_time').on(table.companyId, table.createdAtMs),
  ]
);
