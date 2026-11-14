let Pool = null;
let drizzle = null;
let eq, and, drizzleSql, desc;
let bigint, boolean, doublePrecision, integer, jsonb, pgTable, primaryKey, text, timestamp;
let pgModulesLoaded = false;

try {
  const pgMod = await import('pg');
  const drizzleNodeMod = await import('drizzle-orm/node-postgres');
  const drizzleOrmMod = await import('drizzle-orm');
  const pgCoreMod = await import('drizzle-orm/pg-core');
  Pool = pgMod.Pool || pgMod.default?.Pool;
  drizzle = drizzleNodeMod.drizzle;
  eq = drizzleOrmMod.eq;
  and = drizzleOrmMod.and;
  drizzleSql = drizzleOrmMod.sql;
  desc = drizzleOrmMod.desc;
  bigint = pgCoreMod.bigint;
  boolean = pgCoreMod.boolean;
  doublePrecision = pgCoreMod.doublePrecision;
  integer = pgCoreMod.integer;
  jsonb = pgCoreMod.jsonb;
  pgTable = pgCoreMod.pgTable;
  primaryKey = pgCoreMod.primaryKey;
  text = pgCoreMod.text;
  timestamp = pgCoreMod.timestamp;
  pgModulesLoaded = Boolean(Pool && drizzle && pgTable);
} catch {
  pgModulesLoaded = false;
}

const noopTable = () => null;
const defTable = (...args) => (pgTable ? pgTable(...args) : noopTable());

// Mirror exact PostgreSQL tables from src/db/schema.ts for native Node ESM runtime
export const erpCompanies = pgModulesLoaded
  ? pgTable('erp_companies', {
      companyId: text('company_id').primaryKey(),
      companyName: text('company_name').notNull(),
      activeFiscalYear: text('active_fiscal_year').notNull().default('1405'),
      fiscalYears: jsonb('fiscal_years').notNull().default(['1405', '1404', '1403']),
      nextCartonSeq: integer('next_carton_seq').notNull().default(10001),
      nextVoucherNo: integer('next_voucher_no').notNull().default(1),
      cutoverConfig: jsonb('cutover_config').notNull().default({}),
      labelTemplateConfig: jsonb('label_template_config').notNull().default({}),
      scaleConfig: jsonb('scale_config').notNull().default({}),
      revision: integer('revision').notNull().default(1),
      updatedAt: timestamp('updated_at').defaultNow().notNull(),
    })
  : null;

export const erpProductionLines = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpCommodityGroups = pgModulesLoaded
  ? pgTable(
      'erp_commodity_groups',
      {
        companyId: text('company_id').notNull(),
        id: text('id').notNull(),
        code: text('code').notNull().default(''),
        name: text('name').notNull(),
        parentId: text('parent_id'),
        isActive: boolean('is_active').notNull().default(true),
        description: text('description').notNull().default(''),
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpWarehouses = pgModulesLoaded
  ? pgTable(
      'erp_warehouses',
      {
        companyId: text('company_id').notNull(),
        id: text('id').notNull(),
        code: text('code').notNull().default(''),
        name: text('name').notNull(),
        warehouseType: text('warehouse_type').notNull().default('GENERAL'),
        location: text('location').notNull().default(''),
        managerName: text('manager_name').notNull().default(''),
        assignedGroupIds: jsonb('assigned_group_ids').notNull().default([]),
        assignedItemIds: jsonb('assigned_item_ids').notNull().default([]),
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpItems = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpBoms = pgModulesLoaded
  ? pgTable(
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
        components: jsonb('components').notNull().default([]),
        status: text('status').notNull().default('ACTIVE'),
        totalCostPerKg: doublePrecision('total_cost_per_kg').notNull().default(0),
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpProductionOrders = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpCartonLabels = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpProductionVouchers = pgModulesLoaded
  ? pgTable(
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
        cartonIds: jsonb('carton_ids').notNull().default([]),
        status: text('status').notNull().default('PENDING_WAREHOUSE_DELIVERY'),
        deliveredWarehouseId: text('delivered_warehouse_id'),
        deliveredWarehouseName: text('delivered_warehouse_name'),
        deliveredDocNo: text('delivered_doc_no'),
        notes: text('notes').notNull().default(''),
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpWarehouseDocuments = pgModulesLoaded
  ? pgTable(
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
        cartonIds: jsonb('carton_ids').notNull().default([]),
        cartonsCount: integer('cartons_count').notNull().default(0),
        totalGrossWeightKg: doublePrecision('total_gross_weight_kg').notNull().default(0),
        totalNetWeightKg: doublePrecision('total_net_weight_kg').notNull().default(0),
        status: text('status').notNull().default('COMPLETED'),
        receiverUserName: text('receiver_user_name'),
        createdBy: text('created_by').notNull().default(''),
        notes: text('notes').notNull().default(''),
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpWarehouseLegacyDocs = pgModulesLoaded
  ? pgTable(
      'erp_warehouse_legacy_docs',
      {
        companyId: text('company_id').notNull(),
        id: text('id').notNull(),
        docNo: text('doc_no').notNull().default(''),
        docType: text('doc_type').notNull().default('RECEIPT_PRODUCTION'),
        dateJalali: text('date_jalali').notNull().default(''),
        warehouseId: text('warehouse_id').notNull().default(''),
        status: text('status').notNull().default('FINALIZED'),
        data: jsonb('data').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpSalesOrders = pgModulesLoaded
  ? pgTable(
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
        items: jsonb('items').notNull().default([]),
        notes: text('notes').notNull().default(''),
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpRemittances = pgModulesLoaded
  ? pgTable(
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
        items: jsonb('items').notNull().default([]),
        notes: text('notes').notNull().default(''),
        createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull().default(0),
        createdBy: text('created_by').notNull().default(''),
        invoiceId: text('invoice_id'),
        exitPermitId: text('exit_permit_id'),
        exitPermitNumber: integer('exit_permit_number'),
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpTradeDocs = pgModulesLoaded
  ? pgTable(
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
        items: jsonb('items').notNull().default([]),
        discountAmount: doublePrecision('discount_amount').notNull().default(0),
        taxAmount: doublePrecision('tax_amount').notNull().default(0),
        netTotalAmount: doublePrecision('net_total_amount').notNull().default(0),
        voucherId: text('voucher_id'),
        notes: text('notes').notNull().default(''),
        createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull().default(0),
        createdBy: text('created_by').notNull().default(''),
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpParties = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpBankAccounts = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpChequeBooks = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpTreasuryDocs = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpEmployees = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpPayrollSlips = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpFixedAssets = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpChartOfAccounts = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpVouchers = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
        updatedAt: timestamp('updated_at').defaultNow().notNull(),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.id] })]
    )
  : null;

export const erpVoucherLines = pgModulesLoaded
  ? pgTable(
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
        extra: jsonb('extra').notNull().default({}),
      },
      (t) => [primaryKey({ columns: [t.companyId, t.voucherId, t.id] })]
    )
  : null;

export const erpCompanyBackups = pgModulesLoaded
  ? pgTable('erp_company_backups', {
      id: text('id').primaryKey(),
      companyId: text('company_id').notNull(),
      companyName: text('company_name').notNull(),
      fileName: text('file_name').notNull(),
      format: text('format').notNull().default('json.gz'),
      backupKind: text('backup_kind').notNull().default('manual'),
      sizeBytes: integer('size_bytes').notNull().default(0),
      compressedSizeBytes: integer('compressed_size_bytes').notNull().default(0),
      recordCounts: jsonb('record_counts').notNull().default({}),
      checksumSha256: text('checksum_sha256').notNull().default(''),
      createdBy: text('created_by').notNull().default('system'),
      createdAtMs: bigint('created_at_ms', { mode: 'number' }).notNull().default(0),
      createdDateJalali: text('created_date_jalali').notNull().default(''),
    })
  : null;

const schemaBundle = pgModulesLoaded
  ? {
      erpCompanies,
      erpProductionLines,
      erpCommodityGroups,
      erpWarehouses,
      erpItems,
      erpBoms,
      erpProductionOrders,
      erpCartonLabels,
      erpProductionVouchers,
      erpWarehouseDocuments,
      erpWarehouseLegacyDocs,
      erpSalesOrders,
      erpRemittances,
      erpTradeDocs,
      erpParties,
      erpBankAccounts,
      erpChequeBooks,
      erpTreasuryDocs,
      erpEmployees,
      erpPayrollSlips,
      erpFixedAssets,
      erpChartOfAccounts,
      erpVouchers,
      erpVoucherLines,
      erpCompanyBackups,
    }
  : {};

export const isPostgresConfigured = () =>
  Boolean(pgModulesLoaded && process.env.SQL_HOST && process.env.SQL_DB_NAME && process.env.SQL_USER);

// Lazy pg.Pool creation strictly using Object Method (no startup probes or reconnect loops)
export const getErpPgPool = () => {
  if (!isPostgresConfigured()) return null;
  if (!globalThis._erpPostgresPool) {
    globalThis._erpPostgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      ...(process.env.SQL_PORT ? { port: Number(process.env.SQL_PORT) } : {}),
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    });
    globalThis._erpPostgresPool.on('error', (err) => {
      console.error('[ERP PostgreSQL] Unexpected error on idle pool client:', err.message);
    });
  }
  return globalThis._erpPostgresPool;
};

export const getErpPgDb = () => {
  const pool = getErpPgPool();
  if (!pool) return null;
  if (!globalThis._erpDrizzleDb) {
    globalThis._erpDrizzleDb = drizzle(pool, { schema: schemaBundle });
  }
  return globalThis._erpDrizzleDb;
};

export const DEFAULT_ERP_CHART_OF_ACCOUNTS = [
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
  { id: 'acc_70', code: '70', title: 'هزینه‌های اداری، عمومی و فروش', level: 'KOL', nature: 'DEBIT' },
];

export const DEFAULT_CUTOVER_CONFIG = {
  stage1FactoryWarehouseActive: true,
  stage2TehranPricingInvoiceActive: true,
  stage3PaymentOrdersAutoVoucherActive: false,
  lastSayanBarcodeSyncAt: null,
  lastSayanBarcodeSyncCount: 0,
  lastTrialBalanceCutoffDate: '1405/08/20',
  lastTrialBalanceImportAt: null,
  defaultPaymentBankAccountCode: '110101',
  defaultReceivableAccountCode: '110201',
  defaultPayableAccountCode: '210101',
};

export const DEFAULT_LABEL_TEMPLATE_CONFIG = {
  barcodeType: 'LINEAR_1D',
  barcodeValueSource: 'referenceCode',
  showBarcodeHumanText: true,
  linearBarcodeHeightPx: 44,
  labelWidthMm: 100,
  labelHeightMm: 70,
  fontSizeScale: 'MEDIUM',
  borderStyle: 'SOLID',
  headerTitle: '',
  headerSubtitle: 'لیبل شناسنامه کارتن نخ صنعتی',
  footerNote: '',
  fields: {
    showCompanyName: true,
    showHeaderSubtitle: true,
    showProductName: true,
    showProductCode: true,
    showYarnCount: true,
    showColorName: true,
    showMachineLine: true,
    showShift: true,
    showLotNumber: true,
    showConesCount: true,
    showGrade: true,
    showGrossWeight: true,
    showTareWeight: true,
    showNetWeight: true,
    showReferenceCode: true,
    showSerialNumber: false,
    showDate: true,
    showTime: true,
    showOperator: false,
    showFooterNote: false,
  },
};

export const DEFAULT_SCALE_CONFIG = {
  lockTareWeightsGlobally: false,
  lockConesCountGlobally: false,
};

const pickExtra = (obj, knownKeys) => {
  const extra = {};
  if (!obj || typeof obj !== 'object') return extra;
  for (const [k, v] of Object.entries(obj)) {
    if (!knownKeys.has(k) && v !== undefined) {
      extra[k] = v;
    }
  }
  return extra;
};

const safeStr = (val, fallback = '') => (val == null ? fallback : String(val));
const safeNum = (val, fallback = 0) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};
const safeInt = (val, fallback = 0) => Math.trunc(safeNum(val, fallback));
const ensureId = (row, prefix, idx) =>
  row?.id ? String(row.id) : `${prefix}_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;

// Concurrent collection merge: preserves records inserted concurrently by another operator
// unless explicitly marked in deletedIds[collectionKey].
export const mergeConcurrentErpStates = (serverState, incomingState, baseRevision, currentRevision) => {
  if (!serverState || baseRevision == null || Number(baseRevision) >= Number(currentRevision)) {
    return incomingState;
  }

  const merged = { ...serverState, ...incomingState };
  const deletedMap = incomingState?._deletedIds || {};

  const arrayKeys = [
    'productionLines',
    'commodityGroups',
    'warehouses',
    'items',
    'boms',
    'productionOrders',
    'cartonLabels',
    'productionVouchers',
    'warehouseDocuments',
    'warehouseDocs',
    'salesOrders',
    'remittances',
    'tradeDocs',
    'parties',
    'bankAccounts',
    'chequeBooks',
    'treasuryDocs',
    'employees',
    'payrollSlips',
    'fixedAssets',
    'chartOfAccounts',
    'vouchers',
  ];

  for (const key of arrayKeys) {
    const srvArr = Array.isArray(serverState[key]) ? serverState[key] : [];
    const incArr = Array.isArray(incomingState[key]) ? incomingState[key] : [];
    const deletedSet = new Set(Array.isArray(deletedMap[key]) ? deletedMap[key].map(String) : []);

    const incById = new Map();
    for (const item of incArr) {
      if (item && item.id) incById.set(String(item.id), item);
    }

    const resultList = [...incArr];
    for (const srvItem of srvArr) {
      if (!srvItem || !srvItem.id) continue;
      const sid = String(srvItem.id);
      if (!incById.has(sid) && !deletedSet.has(sid)) {
        resultList.push(srvItem);
      }
    }
    merged[key] = resultList;
  }

  merged.nextCartonSeq = Math.max(safeInt(serverState.nextCartonSeq, 10001), safeInt(incomingState.nextCartonSeq, 10001));
  merged.nextSerialCounter = Math.max(safeInt(serverState.nextSerialCounter, 10001), safeInt(incomingState.nextSerialCounter, 10001), merged.nextCartonSeq);
  merged.nextVoucherNo = Math.max(safeInt(serverState.nextVoucherNo, 1), safeInt(incomingState.nextVoucherNo, 1));
  delete merged._deletedIds;
  return merged;
};

const syncSettingsBanksIntoAccounts = (bankAccounts, settingsCompany) => {
  const list = Array.isArray(bankAccounts) ? [...bankAccounts] : [];
  if (settingsCompany && Array.isArray(settingsCompany.banks)) {
    settingsCompany.banks.forEach((b, idx) => {
      if (!b || !b.bankName) return;
      const bankId = b.id || `settings_bank_${idx}`;
      const exists = list.some(
        (eb) =>
          eb.id === bankId ||
          (eb.bankName === b.bankName && (eb.accountNo || eb.accountNumber || '') === (b.accountNumber || ''))
      );
      if (!exists) {
        list.push({
          id: bankId,
          code: `1101${String(list.length + 1).padStart(2, '0')}`,
          bankName: b.bankName,
          branchName: 'مرکزی',
          accountNo: b.accountNumber || '-',
          shebaNo: b.sheba || '-',
          accountType: 'JARI',
          balanceRials: 0,
          tafziliCode: '110101',
        });
      }
    });
  }
  return list;
};

const hydrateChartOfAccounts = (coa) => {
  const list = Array.isArray(coa) ? [...coa] : [];
  for (const acc of DEFAULT_ERP_CHART_OF_ACCOUNTS) {
    if (!list.some((a) => a.code === acc.code)) {
      list.push(acc);
    }
  }
  return list;
};

async function readCompanyStateInsideTx(tx, companyId) {
  const [compRow] = await tx
    .select()
    .from(erpCompanies)
    .where(eq(erpCompanies.companyId, companyId))
    .limit(1);

  if (!compRow) return null;

  const productionLinesRows = await tx.select().from(erpProductionLines).where(eq(erpProductionLines.companyId, companyId));
  const commodityGroupsRows = await tx.select().from(erpCommodityGroups).where(eq(erpCommodityGroups.companyId, companyId));
  const warehousesRows = await tx.select().from(erpWarehouses).where(eq(erpWarehouses.companyId, companyId));
  const itemsRows = await tx.select().from(erpItems).where(eq(erpItems.companyId, companyId));
  const bomsRows = await tx.select().from(erpBoms).where(eq(erpBoms.companyId, companyId));
  const productionOrdersRows = await tx.select().from(erpProductionOrders).where(eq(erpProductionOrders.companyId, companyId));
  const cartonLabelsRows = await tx.select().from(erpCartonLabels).where(eq(erpCartonLabels.companyId, companyId));
  const productionVouchersRows = await tx.select().from(erpProductionVouchers).where(eq(erpProductionVouchers.companyId, companyId));
  const warehouseDocumentsRows = await tx.select().from(erpWarehouseDocuments).where(eq(erpWarehouseDocuments.companyId, companyId));
  const warehouseLegacyRows = await tx.select().from(erpWarehouseLegacyDocs).where(eq(erpWarehouseLegacyDocs.companyId, companyId));
  const salesOrdersRows = await tx.select().from(erpSalesOrders).where(eq(erpSalesOrders.companyId, companyId));
  const remittancesRows = await tx.select().from(erpRemittances).where(eq(erpRemittances.companyId, companyId));
  const tradeDocsRows = await tx.select().from(erpTradeDocs).where(eq(erpTradeDocs.companyId, companyId));
  const partiesRows = await tx.select().from(erpParties).where(eq(erpParties.companyId, companyId));
  const bankAccountsRows = await tx.select().from(erpBankAccounts).where(eq(erpBankAccounts.companyId, companyId));
  const chequeBooksRows = await tx.select().from(erpChequeBooks).where(eq(erpChequeBooks.companyId, companyId));
  const treasuryDocsRows = await tx.select().from(erpTreasuryDocs).where(eq(erpTreasuryDocs.companyId, companyId));
  const employeesRows = await tx.select().from(erpEmployees).where(eq(erpEmployees.companyId, companyId));
  const payrollSlipsRows = await tx.select().from(erpPayrollSlips).where(eq(erpPayrollSlips.companyId, companyId));
  const fixedAssetsRows = await tx.select().from(erpFixedAssets).where(eq(erpFixedAssets.companyId, companyId));
  const chartRows = await tx.select().from(erpChartOfAccounts).where(eq(erpChartOfAccounts.companyId, companyId));
  const vouchersRows = await tx.select().from(erpVouchers).where(eq(erpVouchers.companyId, companyId));
  const voucherLinesRows = await tx.select().from(erpVoucherLines).where(eq(erpVoucherLines.companyId, companyId));

  const linesByVoucher = new Map();
  for (const vl of voucherLinesRows) {
    if (!linesByVoucher.has(vl.voucherId)) linesByVoucher.set(vl.voucherId, []);
    linesByVoucher.get(vl.voucherId).push({
      ...(vl.extra || {}),
      id: vl.id,
      accountCode: vl.accountCode,
      accountTitle: vl.accountTitle,
      tafziliName: vl.tafziliName,
      debit: vl.debit,
      credit: vl.credit,
      description: vl.description,
      _order: vl.lineOrder,
    });
  }
  for (const arr of linesByVoucher.values()) {
    arr.sort((a, b) => (a._order ?? 0) - (b._order ?? 0));
    arr.forEach((x) => delete x._order);
  }

  const nextSeq = Math.max(safeInt(compRow.nextCartonSeq, 10001), 10001);

  return {
    companyId: compRow.companyId,
    companyName: compRow.companyName,
    activeFiscalYear: compRow.activeFiscalYear || '1405',
    fiscalYears: Array.isArray(compRow.fiscalYears) ? compRow.fiscalYears : ['1405', '1404', '1403'],
    nextCartonSeq: nextSeq,
    nextSerialCounter: nextSeq,
    nextVoucherNo: safeInt(compRow.nextVoucherNo, 1),
    _revision: safeInt(compRow.revision, 1),
    cutoverConfig: { ...DEFAULT_CUTOVER_CONFIG, ...(compRow.cutoverConfig || {}) },
    labelTemplateConfig: {
      ...DEFAULT_LABEL_TEMPLATE_CONFIG,
      ...(compRow.labelTemplateConfig || {}),
      fields: {
        ...DEFAULT_LABEL_TEMPLATE_CONFIG.fields,
        ...((compRow.labelTemplateConfig && compRow.labelTemplateConfig.fields) || {}),
      },
    },
    scaleConfig: { ...DEFAULT_SCALE_CONFIG, ...(compRow.scaleConfig || {}) },
    productionLines: productionLinesRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      code: r.code,
      name: r.name,
      machineType: r.machineType,
      supervisorName: r.supervisorName,
      isActive: r.isActive,
      notes: r.notes,
    })),
    commodityGroups: commodityGroupsRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      code: r.code,
      name: r.name,
      parentId: r.parentId,
      isActive: r.isActive,
      description: r.description,
    })),
    warehouses: warehousesRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.warehouseType,
      location: r.location,
      managerName: r.managerName,
      assignedGroupIds: Array.isArray(r.assignedGroupIds) ? r.assignedGroupIds : [],
      assignedItemIds: Array.isArray(r.assignedItemIds) ? r.assignedItemIds : [],
    })),
    items: itemsRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category,
      groupId: r.groupId || undefined,
      groupName: r.groupName,
      unit: r.unit,
      warehouseId: r.warehouseId,
      stockQty: r.stockQty,
      unitCost: r.unitCost,
      salesPrice: r.salesPrice,
      yarnCount: r.yarnCount,
      colorCode: r.colorCode,
      colorName: r.colorName,
      grade: r.grade,
      coneWeightGrams: r.coneWeightGrams,
      cartonWeightGrams: r.cartonWeightGrams,
      defaultConesPerCarton: r.defaultConesPerCarton,
      isActive: r.isActive,
      isTareLocked: r.isTareLocked,
    })),
    boms: bomsRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      code: r.code,
      title: r.title,
      finishedItemId: r.finishedItemId,
      finishedItemCode: r.finishedItemCode,
      finishedItemName: r.finishedItemName,
      version: r.version,
      wastePercent: r.wastePercent,
      directLaborPerKg: r.directLaborPerKg,
      factoryOverheadPerKg: r.factoryOverheadPerKg,
      components: Array.isArray(r.components) ? r.components : [],
      status: r.status,
      totalCostPerKg: r.totalCostPerKg,
    })),
    productionOrders: productionOrdersRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      orderNo: r.orderNo,
      dateJalali: r.dateJalali,
      machineCode: r.machineCode,
      shift: r.shift,
      supervisorName: r.supervisorName,
      productId: r.productId,
      productName: r.productName,
      lotNumber: r.lotNumber,
      targetQtyKg: r.targetQtyKg,
      producedQtyKg: r.producedQtyKg,
      wasteQtyKg: r.wasteQtyKg,
      status: r.status,
    })),
    cartonLabels: cartonLabelsRows
      .map((r) => ({
        ...(r.extra || {}),
        id: r.id,
        serialNumber: r.serialNumber,
        referenceCode: r.referenceCode,
        qrPayload: r.qrPayload,
        productId: r.productId,
        productCode: r.productCode,
        productName: r.productName,
        yarnCount: r.yarnCount,
        colorName: r.colorName,
        lotNumber: r.lotNumber,
        machineCode: r.machineCode,
        shift: r.shift,
        grade: r.grade,
        grossWeightKg: r.grossWeightKg,
        conesCount: r.conesCount,
        coneWeightGrams: r.coneWeightGrams,
        cartonWeightGrams: r.cartonWeightGrams,
        totalTareKg: r.totalTareKg,
        netWeightKg: r.netWeightKg,
        unitCostPerKg: r.unitCostPerKg,
        totalCostRials: r.totalCostRials,
        warehouseId: r.warehouseId,
        status: r.status,
        createdAt: r.createdAtMs,
        createdDateJalali: r.createdDateJalali,
        createdTimeExact: r.createdTimeExact,
        createdBy: r.createdBy,
        productionLineId: r.productionLineId || undefined,
        productionVoucherNo: r.productionVoucherNo || undefined,
        productionArchiveCode: r.productionArchiveCode || undefined,
        remittanceId: r.remittanceId || undefined,
        sourceSystem: r.sourceSystem,
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    productionVouchers: productionVouchersRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      voucherNo: r.voucherNo,
      archiveCode: r.archiveCode,
      dateJalali: r.dateJalali,
      timeExact: r.timeExact,
      lineId: r.lineId,
      lineName: r.lineName,
      itemId: r.itemId,
      itemCode: r.itemCode,
      itemName: r.itemName,
      cartonsCount: r.cartonsCount,
      totalGrossWeightKg: r.totalGrossWeightKg,
      totalTareKg: r.totalTareKg,
      totalNetWeightKg: r.totalNetWeightKg,
      operatorName: r.operatorName,
      cartonIds: Array.isArray(r.cartonIds) ? r.cartonIds : [],
      status: r.status,
      deliveredWarehouseId: r.deliveredWarehouseId || undefined,
      deliveredWarehouseName: r.deliveredWarehouseName || undefined,
      deliveredDocNo: r.deliveredDocNo || undefined,
      notes: r.notes,
    })),
    warehouseDocuments: warehouseDocumentsRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      docNo: r.docNo,
      archiveCode: r.archiveCode,
      docType: r.docType,
      dateJalali: r.dateJalali,
      timeExact: r.timeExact,
      sourceWarehouseId: r.sourceWarehouseId || undefined,
      sourceWarehouseName: r.sourceWarehouseName || undefined,
      targetWarehouseId: r.targetWarehouseId || undefined,
      targetWarehouseName: r.targetWarehouseName || undefined,
      partyName: r.partyName || undefined,
      partyCode: r.partyCode || undefined,
      driverName: r.driverName || undefined,
      plateNumber: r.plateNumber || undefined,
      productionVoucherId: r.productionVoucherId || undefined,
      referenceDocId: r.referenceDocId || undefined,
      cartonIds: Array.isArray(r.cartonIds) ? r.cartonIds : [],
      cartonsCount: r.cartonsCount,
      totalGrossWeightKg: r.totalGrossWeightKg,
      totalNetWeightKg: r.totalNetWeightKg,
      status: r.status,
      receiverUserName: r.receiverUserName || undefined,
      createdBy: r.createdBy,
      notes: r.notes,
    })),
    warehouseDocs: warehouseLegacyRows.map((r) => ({
      ...(r.data || {}),
      id: r.id,
      docNo: r.docNo,
      docType: r.docType,
      dateJalali: r.dateJalali,
      warehouseId: r.warehouseId,
      status: r.status,
    })),
    salesOrders: salesOrdersRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      orderNo: r.orderNo,
      orderType: r.orderType,
      dateJalali: r.dateJalali,
      partyName: r.partyName,
      partyCode: r.partyCode,
      deliveryDueDate: r.deliveryDueDate,
      status: r.status,
      items: Array.isArray(r.items) ? r.items : [],
      notes: r.notes,
    })),
    remittances: remittancesRows
      .map((r) => ({
        ...(r.extra || {}),
        id: r.id,
        remittanceNo: r.remittanceNo,
        dateJalali: r.dateJalali,
        customerName: r.customerName,
        customerCode: r.customerCode,
        driverName: r.driverName,
        plateNumber: r.plateNumber,
        status: r.status,
        items: Array.isArray(r.items) ? r.items : [],
        notes: r.notes,
        createdAt: r.createdAtMs,
        createdBy: r.createdBy,
        invoiceId: r.invoiceId || undefined,
        exitPermitId: r.exitPermitId || undefined,
        exitPermitNumber: r.exitPermitNumber || undefined,
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    tradeDocs: tradeDocsRows
      .map((r) => ({
        ...(r.extra || {}),
        id: r.id,
        docNo: r.docNo,
        docType: r.docType,
        dateJalali: r.dateJalali,
        partyName: r.partyName,
        partyCode: r.partyCode,
        warehouseId: r.warehouseId,
        remittanceId: r.remittanceId || undefined,
        items: Array.isArray(r.items) ? r.items : [],
        discountAmount: r.discountAmount,
        taxAmount: r.taxAmount,
        netTotalAmount: r.netTotalAmount,
        voucherId: r.voucherId || undefined,
        notes: r.notes,
        createdAt: r.createdAtMs,
        createdBy: r.createdBy,
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    parties: partiesRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.partyType,
      nationalId: r.nationalId,
      phone: r.phone,
      city: r.city,
      creditLimitRials: r.creditLimitRials,
    })),
    bankAccounts: bankAccountsRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      code: r.code,
      bankName: r.bankName,
      branchName: r.branchName,
      accountNo: r.accountNo,
      shebaNo: r.shebaNo,
      accountType: r.accountType,
      balanceRials: r.balanceRials,
      tafziliCode: r.tafziliCode,
    })),
    chequeBooks: chequeBooksRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      bankAccountId: r.bankAccountId,
      bankName: r.bankName,
      series: r.series,
      fromSerial: r.fromSerial,
      toSerial: r.toSerial,
      leavesCount: r.leavesCount,
      usedLeaves: r.usedLeaves,
      status: r.status,
    })),
    treasuryDocs: treasuryDocsRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      docNo: r.docNo,
      docType: r.docType,
      dateJalali: r.dateJalali,
      partyName: r.partyName,
      partyCode: r.partyCode,
      bankName: r.bankName,
      sayadiId: r.sayadiId || undefined,
      chequeSerial: r.chequeSerial || undefined,
      dueDateJalali: r.dueDateJalali || undefined,
      amountRials: r.amountRials,
      chequeStatus: r.chequeStatus || undefined,
      voucherNo: r.voucherNo ?? undefined,
      description: r.description,
    })),
    employees: employeesRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      personnelCode: r.personnelCode,
      fullName: r.fullName,
      nationalId: r.nationalId,
      department: r.department,
      jobTitle: r.jobTitle,
      baseSalaryRials: r.baseSalaryRials,
      housingAllowanceRials: r.housingAllowanceRials,
      childAllowanceRials: r.childAllowanceRials,
      bankSheba: r.bankSheba,
    })),
    payrollSlips: payrollSlipsRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      yearMonth: r.yearMonth,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      personnelCode: r.personnelCode,
      workedDays: r.workedDays,
      overtimeHours: r.overtimeHours,
      grossPayRials: r.grossPayRials,
      insuranceEmployeeRials: r.insuranceEmployeeRials,
      insuranceEmployerRials: r.insuranceEmployerRials,
      taxRials: r.taxRials,
      netPayableRials: r.netPayableRials,
      voucherNo: r.voucherNo ?? undefined,
    })),
    fixedAssets: fixedAssetsRows.map((r) => ({
      ...(r.extra || {}),
      id: r.id,
      assetCode: r.assetCode,
      title: r.title,
      category: r.category,
      purchaseDateJalali: r.purchaseDateJalali,
      costRials: r.costRials,
      salvageValueRials: r.salvageValueRials,
      depreciationMethod: r.depreciationMethod,
      annualRatePercent: r.annualRatePercent,
      accumulatedDepRials: r.accumulatedDepRials,
      bookValueRials: r.bookValueRials,
      location: r.location,
    })),
    chartOfAccounts: hydrateChartOfAccounts(
      chartRows.map((r) => ({
        ...(r.extra || {}),
        id: r.id,
        code: r.code,
        title: r.title,
        level: r.level,
        parentCode: r.parentCode || undefined,
        nature: r.nature,
        systemRole: r.systemRole || undefined,
      }))
    ),
    vouchers: vouchersRows
      .map((r) => ({
        ...(r.extra || {}),
        id: r.id,
        voucherNo: r.voucherNo,
        dateJalali: r.dateJalali,
        type: r.voucherType,
        status: r.status,
        description: r.description,
        referenceId: r.referenceId || undefined,
        createdBy: r.createdBy,
        createdAt: r.createdAtMs,
        lines: linesByVoucher.get(r.id) || [],
      }))
      .sort((a, b) => (b.voucherNo || 0) - (a.voucherNo || 0)),
  };
}

const KNOWN_KEYS = {
  productionLines: new Set(['id', 'code', 'name', 'machineType', 'supervisorName', 'isActive', 'notes']),
  commodityGroups: new Set(['id', 'code', 'name', 'parentId', 'isActive', 'description']),
  warehouses: new Set(['id', 'code', 'name', 'type', 'warehouseType', 'location', 'managerName', 'assignedGroupIds', 'assignedItemIds']),
  items: new Set([
    'id', 'code', 'name', 'category', 'groupId', 'groupName', 'unit', 'warehouseId', 'stockQty',
    'unitCost', 'salesPrice', 'yarnCount', 'colorCode', 'colorName', 'grade', 'coneWeightGrams',
    'cartonWeightGrams', 'defaultConesPerCarton', 'isActive', 'isTareLocked',
  ]),
  boms: new Set([
    'id', 'code', 'title', 'finishedItemId', 'finishedItemCode', 'finishedItemName', 'version',
    'wastePercent', 'directLaborPerKg', 'factoryOverheadPerKg', 'components', 'status', 'totalCostPerKg',
  ]),
  productionOrders: new Set([
    'id', 'orderNo', 'dateJalali', 'machineCode', 'shift', 'supervisorName', 'productId',
    'productName', 'lotNumber', 'targetQtyKg', 'producedQtyKg', 'wasteQtyKg', 'status',
  ]),
  cartonLabels: new Set([
    'id', 'serialNumber', 'referenceCode', 'qrPayload', 'productId', 'productCode', 'productName',
    'yarnCount', 'colorName', 'lotNumber', 'machineCode', 'shift', 'grade', 'grossWeightKg',
    'conesCount', 'coneWeightGrams', 'cartonWeightGrams', 'totalTareKg', 'netWeightKg',
    'unitCostPerKg', 'totalCostRials', 'warehouseId', 'status', 'createdAt', 'createdDateJalali',
    'createdTimeExact', 'createdBy', 'productionLineId', 'productionVoucherNo',
    'productionArchiveCode', 'remittanceId', 'sourceSystem',
  ]),
  productionVouchers: new Set([
    'id', 'voucherNo', 'archiveCode', 'dateJalali', 'timeExact', 'lineId', 'lineName', 'itemId',
    'itemCode', 'itemName', 'cartonsCount', 'totalGrossWeightKg', 'totalTareKg', 'totalNetWeightKg',
    'operatorName', 'cartonIds', 'status', 'deliveredWarehouseId', 'deliveredWarehouseName',
    'deliveredDocNo', 'notes',
  ]),
  warehouseDocuments: new Set([
    'id', 'docNo', 'archiveCode', 'docType', 'dateJalali', 'timeExact', 'sourceWarehouseId',
    'sourceWarehouseName', 'targetWarehouseId', 'targetWarehouseName', 'partyName', 'partyCode',
    'driverName', 'plateNumber', 'productionVoucherId', 'referenceDocId', 'cartonIds',
    'cartonsCount', 'totalGrossWeightKg', 'totalNetWeightKg', 'status', 'receiverUserName',
    'createdBy', 'notes',
  ]),
  salesOrders: new Set([
    'id', 'orderNo', 'orderType', 'dateJalali', 'partyName', 'partyCode', 'deliveryDueDate',
    'status', 'items', 'notes',
  ]),
  remittances: new Set([
    'id', 'remittanceNo', 'dateJalali', 'customerName', 'customerCode', 'driverName', 'plateNumber',
    'status', 'items', 'notes', 'createdAt', 'createdBy', 'invoiceId', 'exitPermitId', 'exitPermitNumber',
  ]),
  tradeDocs: new Set([
    'id', 'docNo', 'docType', 'dateJalali', 'partyName', 'partyCode', 'warehouseId', 'remittanceId',
    'items', 'discountAmount', 'taxAmount', 'netTotalAmount', 'voucherId', 'notes', 'createdAt', 'createdBy',
  ]),
  parties: new Set(['id', 'code', 'name', 'type', 'partyType', 'nationalId', 'phone', 'city', 'creditLimitRials']),
  bankAccounts: new Set(['id', 'code', 'bankName', 'branchName', 'accountNo', 'shebaNo', 'accountType', 'balanceRials', 'tafziliCode']),
  chequeBooks: new Set(['id', 'bankAccountId', 'bankName', 'series', 'fromSerial', 'toSerial', 'leavesCount', 'usedLeaves', 'status']),
  treasuryDocs: new Set([
    'id', 'docNo', 'docType', 'dateJalali', 'partyName', 'partyCode', 'bankName', 'sayadiId',
    'chequeSerial', 'dueDateJalali', 'amountRials', 'chequeStatus', 'voucherNo', 'description',
  ]),
  employees: new Set([
    'id', 'personnelCode', 'fullName', 'nationalId', 'department', 'jobTitle', 'baseSalaryRials',
    'housingAllowanceRials', 'childAllowanceRials', 'bankSheba',
  ]),
  payrollSlips: new Set([
    'id', 'yearMonth', 'employeeId', 'employeeName', 'personnelCode', 'workedDays', 'overtimeHours',
    'grossPayRials', 'insuranceEmployeeRials', 'insuranceEmployerRials', 'taxRials', 'netPayableRials', 'voucherNo',
  ]),
  fixedAssets: new Set([
    'id', 'assetCode', 'title', 'category', 'purchaseDateJalali', 'costRials', 'salvageValueRials',
    'depreciationMethod', 'annualRatePercent', 'accumulatedDepRials', 'bookValueRials', 'location',
  ]),
  chartOfAccounts: new Set(['id', 'code', 'title', 'level', 'parentCode', 'nature', 'systemRole']),
  vouchers: new Set([
    'id', 'voucherNo', 'dateJalali', 'type', 'voucherType', 'status', 'description', 'referenceId',
    'createdBy', 'createdAt', 'lines',
  ]),
  voucherLines: new Set(['id', 'accountCode', 'accountTitle', 'tafziliName', 'debit', 'credit', 'description']),
};

async function insertBatched(tx, table, rows, chunkSize = 250) {
  if (!rows || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await tx.insert(table).values(chunk).onConflictDoNothing();
  }
}

async function writeCompanyStateInsideTx(tx, companyId, state, nextRevision) {
  const companyName = safeStr(state.companyName, 'شرکت تولیدی');
  const nextSeq = Math.max(
    safeInt(state.nextCartonSeq, 10001),
    safeInt(state.nextSerialCounter, 10001),
    10001
  );
  const nextVoucherNo = Math.max(safeInt(state.nextVoucherNo, 1), 1);

  await tx
    .insert(erpCompanies)
    .values({
      companyId,
      companyName,
      activeFiscalYear: safeStr(state.activeFiscalYear, '1405'),
      fiscalYears: Array.isArray(state.fiscalYears) ? state.fiscalYears : ['1405', '1404', '1403'],
      nextCartonSeq: nextSeq,
      nextVoucherNo,
      cutoverConfig: state.cutoverConfig || DEFAULT_CUTOVER_CONFIG,
      labelTemplateConfig: state.labelTemplateConfig || DEFAULT_LABEL_TEMPLATE_CONFIG,
      scaleConfig: state.scaleConfig || DEFAULT_SCALE_CONFIG,
      revision: nextRevision,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: erpCompanies.companyId,
      set: {
        companyName,
        activeFiscalYear: safeStr(state.activeFiscalYear, '1405'),
        fiscalYears: Array.isArray(state.fiscalYears) ? state.fiscalYears : ['1405', '1404', '1403'],
        nextCartonSeq: nextSeq,
        nextVoucherNo,
        cutoverConfig: state.cutoverConfig || DEFAULT_CUTOVER_CONFIG,
        labelTemplateConfig: state.labelTemplateConfig || DEFAULT_LABEL_TEMPLATE_CONFIG,
        scaleConfig: state.scaleConfig || DEFAULT_SCALE_CONFIG,
        revision: nextRevision,
        updatedAt: new Date(),
      },
    });

  // Delete strictly within company_id scope inside this ACID transaction, then re-insert batched rows
  const childTables = [
    erpVoucherLines,
    erpVouchers,
    erpChartOfAccounts,
    erpFixedAssets,
    erpPayrollSlips,
    erpEmployees,
    erpTreasuryDocs,
    erpChequeBooks,
    erpBankAccounts,
    erpParties,
    erpTradeDocs,
    erpRemittances,
    erpSalesOrders,
    erpWarehouseLegacyDocs,
    erpWarehouseDocuments,
    erpProductionVouchers,
    erpCartonLabels,
    erpProductionOrders,
    erpBoms,
    erpItems,
    erpWarehouses,
    erpCommodityGroups,
    erpProductionLines,
  ];
  for (const tbl of childTables) {
    await tx.delete(tbl).where(eq(tbl.companyId, companyId));
  }

  await insertBatched(
    tx,
    erpProductionLines,
    (state.productionLines || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'line', i),
      code: safeStr(r.code),
      name: safeStr(r.name, 'خط تولید'),
      machineType: safeStr(r.machineType),
      supervisorName: safeStr(r.supervisorName),
      isActive: r.isActive !== false,
      notes: safeStr(r.notes),
      extra: pickExtra(r, KNOWN_KEYS.productionLines),
    }))
  );

  await insertBatched(
    tx,
    erpCommodityGroups,
    (state.commodityGroups || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'grp', i),
      code: safeStr(r.code),
      name: safeStr(r.name, 'گروه کالا'),
      parentId: r.parentId ? String(r.parentId) : null,
      isActive: r.isActive !== false,
      description: safeStr(r.description),
      extra: pickExtra(r, KNOWN_KEYS.commodityGroups),
    }))
  );

  await insertBatched(
    tx,
    erpWarehouses,
    (state.warehouses || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'wh', i),
      code: safeStr(r.code),
      name: safeStr(r.name, 'انبار'),
      warehouseType: safeStr(r.type || r.warehouseType, 'GENERAL'),
      location: safeStr(r.location),
      managerName: safeStr(r.managerName),
      assignedGroupIds: Array.isArray(r.assignedGroupIds) ? r.assignedGroupIds : [],
      assignedItemIds: Array.isArray(r.assignedItemIds) ? r.assignedItemIds : [],
      extra: pickExtra(r, KNOWN_KEYS.warehouses),
    }))
  );

  await insertBatched(
    tx,
    erpItems,
    (state.items || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'itm', i),
      code: safeStr(r.code),
      name: safeStr(r.name, 'کالا'),
      category: safeStr(r.category, 'FINISHED_YARN'),
      groupId: r.groupId ? String(r.groupId) : null,
      groupName: safeStr(r.groupName),
      unit: safeStr(r.unit, 'کیلوگرم'),
      warehouseId: safeStr(r.warehouseId),
      stockQty: safeNum(r.stockQty, 0),
      unitCost: safeNum(r.unitCost, 0),
      salesPrice: safeNum(r.salesPrice, 0),
      yarnCount: safeStr(r.yarnCount),
      colorCode: safeStr(r.colorCode),
      colorName: safeStr(r.colorName),
      grade: safeStr(r.grade, 'A'),
      coneWeightGrams: safeNum(r.coneWeightGrams, 110),
      cartonWeightGrams: safeNum(r.cartonWeightGrams, 1450),
      defaultConesPerCarton: safeInt(r.defaultConesPerCarton, 6),
      isActive: r.isActive !== false,
      isTareLocked: Boolean(r.isTareLocked),
      extra: pickExtra(r, KNOWN_KEYS.items),
    }))
  );

  await insertBatched(
    tx,
    erpBoms,
    (state.boms || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'bom', i),
      code: safeStr(r.code),
      title: safeStr(r.title),
      finishedItemId: safeStr(r.finishedItemId),
      finishedItemCode: safeStr(r.finishedItemCode),
      finishedItemName: safeStr(r.finishedItemName),
      version: safeStr(r.version, '1.0'),
      wastePercent: safeNum(r.wastePercent, 0),
      directLaborPerKg: safeNum(r.directLaborPerKg, 0),
      factoryOverheadPerKg: safeNum(r.factoryOverheadPerKg, 0),
      components: Array.isArray(r.components) ? r.components : [],
      status: safeStr(r.status, 'ACTIVE'),
      totalCostPerKg: safeNum(r.totalCostPerKg, 0),
      extra: pickExtra(r, KNOWN_KEYS.boms),
    }))
  );

  await insertBatched(
    tx,
    erpProductionOrders,
    (state.productionOrders || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'po', i),
      orderNo: safeStr(r.orderNo),
      dateJalali: safeStr(r.dateJalali),
      machineCode: safeStr(r.machineCode),
      shift: safeStr(r.shift),
      supervisorName: safeStr(r.supervisorName),
      productId: safeStr(r.productId),
      productName: safeStr(r.productName),
      lotNumber: safeStr(r.lotNumber),
      targetQtyKg: safeNum(r.targetQtyKg, 0),
      producedQtyKg: safeNum(r.producedQtyKg, 0),
      wasteQtyKg: safeNum(r.wasteQtyKg, 0),
      status: safeStr(r.status, 'IN_PROGRESS'),
      extra: pickExtra(r, KNOWN_KEYS.productionOrders),
    }))
  );

  await insertBatched(
    tx,
    erpCartonLabels,
    (state.cartonLabels || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'lbl', i),
      serialNumber: safeStr(r.serialNumber),
      referenceCode: safeStr(r.referenceCode),
      qrPayload: safeStr(r.qrPayload),
      productId: safeStr(r.productId),
      productCode: safeStr(r.productCode),
      productName: safeStr(r.productName),
      yarnCount: safeStr(r.yarnCount),
      colorName: safeStr(r.colorName),
      lotNumber: safeStr(r.lotNumber),
      machineCode: safeStr(r.machineCode),
      shift: safeStr(r.shift),
      grade: safeStr(r.grade, 'A'),
      grossWeightKg: safeNum(r.grossWeightKg, 0),
      conesCount: safeInt(r.conesCount, 6),
      coneWeightGrams: safeNum(r.coneWeightGrams, 110),
      cartonWeightGrams: safeNum(r.cartonWeightGrams, 1450),
      totalTareKg: safeNum(r.totalTareKg, 0),
      netWeightKg: safeNum(r.netWeightKg, 0),
      unitCostPerKg: safeNum(r.unitCostPerKg, 0),
      totalCostRials: safeNum(r.totalCostRials, 0),
      warehouseId: safeStr(r.warehouseId),
      status: safeStr(r.status, 'IN_STOCK'),
      createdAtMs: safeInt(r.createdAt, Date.now()),
      createdDateJalali: safeStr(r.createdDateJalali),
      createdTimeExact: safeStr(r.createdTimeExact),
      createdBy: safeStr(r.createdBy),
      productionLineId: r.productionLineId ? String(r.productionLineId) : null,
      productionVoucherNo: r.productionVoucherNo ? String(r.productionVoucherNo) : null,
      productionArchiveCode: r.productionArchiveCode ? String(r.productionArchiveCode) : null,
      remittanceId: r.remittanceId ? String(r.remittanceId) : null,
      sourceSystem: safeStr(r.sourceSystem || r.source, 'DELKAM'),
      extra: pickExtra(r, KNOWN_KEYS.cartonLabels),
    }))
  );

  await insertBatched(
    tx,
    erpProductionVouchers,
    (state.productionVouchers || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'pv', i),
      voucherNo: safeStr(r.voucherNo),
      archiveCode: safeStr(r.archiveCode),
      dateJalali: safeStr(r.dateJalali),
      timeExact: safeStr(r.timeExact),
      lineId: safeStr(r.lineId),
      lineName: safeStr(r.lineName),
      itemId: safeStr(r.itemId),
      itemCode: safeStr(r.itemCode),
      itemName: safeStr(r.itemName),
      cartonsCount: safeInt(r.cartonsCount, 0),
      totalGrossWeightKg: safeNum(r.totalGrossWeightKg, 0),
      totalTareKg: safeNum(r.totalTareKg, 0),
      totalNetWeightKg: safeNum(r.totalNetWeightKg, 0),
      operatorName: safeStr(r.operatorName),
      cartonIds: Array.isArray(r.cartonIds) ? r.cartonIds : [],
      status: safeStr(r.status, 'PENDING_WAREHOUSE_DELIVERY'),
      deliveredWarehouseId: r.deliveredWarehouseId ? String(r.deliveredWarehouseId) : null,
      deliveredWarehouseName: r.deliveredWarehouseName ? String(r.deliveredWarehouseName) : null,
      deliveredDocNo: r.deliveredDocNo ? String(r.deliveredDocNo) : null,
      notes: safeStr(r.notes),
      extra: pickExtra(r, KNOWN_KEYS.productionVouchers),
    }))
  );

  await insertBatched(
    tx,
    erpWarehouseDocuments,
    (state.warehouseDocuments || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'whd', i),
      docNo: safeStr(r.docNo),
      archiveCode: safeStr(r.archiveCode),
      docType: safeStr(r.docType, 'RECEIPT_PRODUCTION'),
      dateJalali: safeStr(r.dateJalali),
      timeExact: safeStr(r.timeExact),
      sourceWarehouseId: r.sourceWarehouseId ? String(r.sourceWarehouseId) : null,
      sourceWarehouseName: r.sourceWarehouseName ? String(r.sourceWarehouseName) : null,
      targetWarehouseId: r.targetWarehouseId ? String(r.targetWarehouseId) : null,
      targetWarehouseName: r.targetWarehouseName ? String(r.targetWarehouseName) : null,
      partyName: r.partyName ? String(r.partyName) : null,
      partyCode: r.partyCode ? String(r.partyCode) : null,
      driverName: r.driverName ? String(r.driverName) : null,
      plateNumber: r.plateNumber ? String(r.plateNumber) : null,
      productionVoucherId: r.productionVoucherId ? String(r.productionVoucherId) : null,
      referenceDocId: r.referenceDocId ? String(r.referenceDocId) : null,
      cartonIds: Array.isArray(r.cartonIds) ? r.cartonIds : [],
      cartonsCount: safeInt(r.cartonsCount, 0),
      totalGrossWeightKg: safeNum(r.totalGrossWeightKg, 0),
      totalNetWeightKg: safeNum(r.totalNetWeightKg, 0),
      status: safeStr(r.status, 'COMPLETED'),
      receiverUserName: r.receiverUserName ? String(r.receiverUserName) : null,
      createdBy: safeStr(r.createdBy),
      notes: safeStr(r.notes),
      extra: pickExtra(r, KNOWN_KEYS.warehouseDocuments),
    }))
  );

  await insertBatched(
    tx,
    erpWarehouseLegacyDocs,
    (state.warehouseDocs || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'wld', i),
      docNo: safeStr(r.docNo),
      docType: safeStr(r.docType, 'RECEIPT_PRODUCTION'),
      dateJalali: safeStr(r.dateJalali),
      warehouseId: safeStr(r.warehouseId),
      status: safeStr(r.status, 'FINALIZED'),
      data: r || {},
    }))
  );

  await insertBatched(
    tx,
    erpSalesOrders,
    (state.salesOrders || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'ord', i),
      orderNo: safeStr(r.orderNo),
      orderType: safeStr(r.orderType, 'SALES_ORDER'),
      dateJalali: safeStr(r.dateJalali),
      partyName: safeStr(r.partyName),
      partyCode: safeStr(r.partyCode),
      deliveryDueDate: safeStr(r.deliveryDueDate),
      status: safeStr(r.status, 'PENDING_CARTABLE'),
      items: Array.isArray(r.items) ? r.items : [],
      notes: safeStr(r.notes),
      extra: pickExtra(r, KNOWN_KEYS.salesOrders),
    }))
  );

  await insertBatched(
    tx,
    erpRemittances,
    (state.remittances || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'rem', i),
      remittanceNo: safeStr(r.remittanceNo),
      dateJalali: safeStr(r.dateJalali),
      customerName: safeStr(r.customerName),
      customerCode: safeStr(r.customerCode),
      driverName: safeStr(r.driverName),
      plateNumber: safeStr(r.plateNumber),
      status: safeStr(r.status, 'PENDING_TEHRAN_PRICING'),
      items: Array.isArray(r.items) ? r.items : [],
      notes: safeStr(r.notes),
      createdAtMs: safeInt(r.createdAt, Date.now()),
      createdBy: safeStr(r.createdBy),
      invoiceId: r.invoiceId ? String(r.invoiceId) : null,
      exitPermitId: r.exitPermitId ? String(r.exitPermitId) : null,
      exitPermitNumber: r.exitPermitNumber != null ? safeInt(r.exitPermitNumber) : null,
      extra: pickExtra(r, KNOWN_KEYS.remittances),
    }))
  );

  await insertBatched(
    tx,
    erpTradeDocs,
    (state.tradeDocs || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'td', i),
      docNo: safeStr(r.docNo),
      docType: safeStr(r.docType || r.type, 'SALES'),
      dateJalali: safeStr(r.dateJalali),
      partyName: safeStr(r.partyName),
      partyCode: safeStr(r.partyCode),
      warehouseId: safeStr(r.warehouseId),
      remittanceId: r.remittanceId ? String(r.remittanceId) : null,
      items: Array.isArray(r.items) ? r.items : [],
      discountAmount: safeNum(r.discountAmount, 0),
      taxAmount: safeNum(r.taxAmount, 0),
      netTotalAmount: safeNum(r.netTotalAmount ?? r.totalAmount, 0),
      voucherId: r.voucherId ? String(r.voucherId) : null,
      notes: safeStr(r.notes),
      createdAtMs: safeInt(r.createdAt, Date.now()),
      createdBy: safeStr(r.createdBy),
      extra: pickExtra(r, KNOWN_KEYS.tradeDocs),
    }))
  );

  await insertBatched(
    tx,
    erpParties,
    (state.parties || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'prt', i),
      code: safeStr(r.code),
      name: safeStr(r.name, 'طرف حساب'),
      partyType: safeStr(r.type || r.partyType, 'CUSTOMER'),
      nationalId: safeStr(r.nationalId),
      phone: safeStr(r.phone),
      city: safeStr(r.city),
      creditLimitRials: safeNum(r.creditLimitRials, 0),
      extra: pickExtra(r, KNOWN_KEYS.parties),
    }))
  );

  await insertBatched(
    tx,
    erpBankAccounts,
    (state.bankAccounts || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'bnk', i),
      code: safeStr(r.code),
      bankName: safeStr(r.bankName, 'بانک'),
      branchName: safeStr(r.branchName),
      accountNo: safeStr(r.accountNo || r.accountNumber),
      shebaNo: safeStr(r.shebaNo || r.sheba),
      accountType: safeStr(r.accountType, 'JARI'),
      balanceRials: safeNum(r.balanceRials ?? r.balance, 0),
      tafziliCode: safeStr(r.tafziliCode || r.accountingCode),
      extra: pickExtra(r, KNOWN_KEYS.bankAccounts),
    }))
  );

  await insertBatched(
    tx,
    erpChequeBooks,
    (state.chequeBooks || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'chq', i),
      bankAccountId: safeStr(r.bankAccountId),
      bankName: safeStr(r.bankName),
      series: safeStr(r.series),
      fromSerial: safeStr(r.fromSerial),
      toSerial: safeStr(r.toSerial),
      leavesCount: safeInt(r.leavesCount, 0),
      usedLeaves: safeInt(r.usedLeaves, 0),
      status: safeStr(r.status, 'ACTIVE'),
      extra: pickExtra(r, KNOWN_KEYS.chequeBooks),
    }))
  );

  await insertBatched(
    tx,
    erpTreasuryDocs,
    (state.treasuryDocs || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'trs', i),
      docNo: safeStr(r.docNo),
      docType: safeStr(r.docType, 'RECEIPT_CASH'),
      dateJalali: safeStr(r.dateJalali),
      partyName: safeStr(r.partyName),
      partyCode: safeStr(r.partyCode),
      bankName: safeStr(r.bankName),
      sayadiId: r.sayadiId ? String(r.sayadiId) : null,
      chequeSerial: r.chequeSerial ? String(r.chequeSerial) : null,
      dueDateJalali: r.dueDateJalali ? String(r.dueDateJalali) : null,
      amountRials: safeNum(r.amountRials, 0),
      chequeStatus: r.chequeStatus ? String(r.chequeStatus) : null,
      voucherNo: r.voucherNo != null ? safeInt(r.voucherNo) : null,
      description: safeStr(r.description),
      extra: pickExtra(r, KNOWN_KEYS.treasuryDocs),
    }))
  );

  const empSource = Array.isArray(state.employees) && state.employees.length > 0
    ? state.employees
    : (Array.isArray(state.payrollEmployees) ? state.payrollEmployees : []);

  await insertBatched(
    tx,
    erpEmployees,
    empSource.map((r, i) => ({
      companyId,
      id: ensureId(r, 'emp', i),
      personnelCode: safeStr(r.personnelCode),
      fullName: safeStr(r.fullName, 'پرسنل'),
      nationalId: safeStr(r.nationalId),
      department: safeStr(r.department),
      jobTitle: safeStr(r.jobTitle),
      baseSalaryRials: safeNum(r.baseSalaryRials, 0),
      housingAllowanceRials: safeNum(r.housingAllowanceRials, 0),
      childAllowanceRials: safeNum(r.childAllowanceRials, 0),
      bankSheba: safeStr(r.bankSheba),
      extra: pickExtra(r, KNOWN_KEYS.employees),
    }))
  );

  await insertBatched(
    tx,
    erpPayrollSlips,
    (state.payrollSlips || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'slp', i),
      yearMonth: safeStr(r.yearMonth),
      employeeId: safeStr(r.employeeId),
      employeeName: safeStr(r.employeeName),
      personnelCode: safeStr(r.personnelCode),
      workedDays: safeInt(r.workedDays, 30),
      overtimeHours: safeNum(r.overtimeHours, 0),
      grossPayRials: safeNum(r.grossPayRials, 0),
      insuranceEmployeeRials: safeNum(r.insuranceEmployeeRials, 0),
      insuranceEmployerRials: safeNum(r.insuranceEmployerRials, 0),
      taxRials: safeNum(r.taxRials, 0),
      netPayableRials: safeNum(r.netPayableRials, 0),
      voucherNo: r.voucherNo != null ? safeInt(r.voucherNo) : null,
      extra: pickExtra(r, KNOWN_KEYS.payrollSlips),
    }))
  );

  await insertBatched(
    tx,
    erpFixedAssets,
    (state.fixedAssets || []).map((r, i) => ({
      companyId,
      id: ensureId(r, 'ast', i),
      assetCode: safeStr(r.assetCode),
      title: safeStr(r.title, 'دارایی'),
      category: safeStr(r.category, 'MACHINERY'),
      purchaseDateJalali: safeStr(r.purchaseDateJalali),
      costRials: safeNum(r.costRials, 0),
      salvageValueRials: safeNum(r.salvageValueRials, 0),
      depreciationMethod: safeStr(r.depreciationMethod, 'STRAIGHT_LINE'),
      annualRatePercent: safeNum(r.annualRatePercent, 10),
      accumulatedDepRials: safeNum(r.accumulatedDepRials, 0),
      bookValueRials: safeNum(r.bookValueRials, 0),
      location: safeStr(r.location),
      extra: pickExtra(r, KNOWN_KEYS.fixedAssets),
    }))
  );

  const hydratedCoa = hydrateChartOfAccounts(state.chartOfAccounts || []);
  await insertBatched(
    tx,
    erpChartOfAccounts,
    hydratedCoa.map((r, i) => ({
      companyId,
      id: ensureId(r, 'acc', i),
      code: safeStr(r.code, String(i)),
      title: safeStr(r.title, 'سرفصل'),
      level: safeStr(r.level, 'MOEIN'),
      parentCode: r.parentCode ? String(r.parentCode) : null,
      nature: safeStr(r.nature, 'DEBIT'),
      systemRole: r.systemRole ? String(r.systemRole) : null,
      extra: pickExtra(r, KNOWN_KEYS.chartOfAccounts),
    }))
  );

  const voucherRows = [];
  const voucherLineRows = [];
  (state.vouchers || []).forEach((v, vIdx) => {
    const vid = ensureId(v, 'vch', vIdx);
    voucherRows.push({
      companyId,
      id: vid,
      voucherNo: safeInt(v.voucherNo, vIdx + 1),
      dateJalali: safeStr(v.dateJalali),
      voucherType: safeStr(v.type || v.voucherType, 'GENERAL'),
      status: safeStr(v.status, 'FINALIZED'),
      description: safeStr(v.description),
      referenceId: v.referenceId ? String(v.referenceId) : null,
      createdBy: safeStr(v.createdBy),
      createdAtMs: safeInt(v.createdAt, Date.now()),
      extra: pickExtra(v, KNOWN_KEYS.vouchers),
    });
    const lines = Array.isArray(v.lines) ? v.lines : [];
    lines.forEach((l, lIdx) => {
      voucherLineRows.push({
        companyId,
        voucherId: vid,
        id: ensureId(l, `vl_${vid}`, lIdx),
        lineOrder: lIdx,
        accountCode: safeStr(l.accountCode),
        accountTitle: safeStr(l.accountTitle),
        tafziliName: safeStr(l.tafziliName),
        debit: safeNum(l.debit, 0),
        credit: safeNum(l.credit, 0),
        description: safeStr(l.description),
        extra: pickExtra(l, KNOWN_KEYS.voucherLines),
      });
    });
  });

  await insertBatched(tx, erpVouchers, voucherRows);
  await insertBatched(tx, erpVoucherLines, voucherLineRows);
}

export async function getCompanyErpStateFromPg(
  companyId,
  companyName = 'شرکت تولیدی',
  settingsCompany = null,
  legacyFallbackState = null
) {
  const db = getErpPgDb();
  if (!db) return null;

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(drizzleSql`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`);
      let state = await readCompanyStateInsideTx(tx, companyId);

      if (!state) {
        // First-time lazy initialization / seamless migration from legacy database.json state
        const initial = legacyFallbackState
          ? {
              ...legacyFallbackState,
              companyId,
              companyName: companyName || legacyFallbackState.companyName || 'شرکت تولیدی',
            }
          : {
              companyId,
              companyName,
              activeFiscalYear: '1405',
              fiscalYears: ['1405', '1404', '1403'],
              nextCartonSeq: 10001,
              nextSerialCounter: 10001,
              nextVoucherNo: 1,
              cutoverConfig: DEFAULT_CUTOVER_CONFIG,
              labelTemplateConfig: DEFAULT_LABEL_TEMPLATE_CONFIG,
              scaleConfig: DEFAULT_SCALE_CONFIG,
              chartOfAccounts: DEFAULT_ERP_CHART_OF_ACCOUNTS,
            };

        initial.bankAccounts = syncSettingsBanksIntoAccounts(initial.bankAccounts, settingsCompany);
        initial.chartOfAccounts = hydrateChartOfAccounts(initial.chartOfAccounts);
        await writeCompanyStateInsideTx(tx, companyId, initial, 1);
        state = await readCompanyStateInsideTx(tx, companyId);
      } else if (settingsCompany) {
        const syncedBanks = syncSettingsBanksIntoAccounts(state.bankAccounts, settingsCompany);
        if (syncedBanks.length !== state.bankAccounts.length) {
          state.bankAccounts = syncedBanks;
          await writeCompanyStateInsideTx(tx, companyId, state, (state._revision || 1) + 1);
          state = await readCompanyStateInsideTx(tx, companyId);
        }
      }

      return state;
    });
  } catch (error) {
    console.error(`[ERP PostgreSQL] Failed loading state for company ${companyId}:`, error.message);
    throw new Error('خطا در واکشی اطلاعات حسابداری شرکت از دیتابیس PostgreSQL.', { cause: error });
  }
}

export async function saveCompanyErpStateToPg(
  companyId,
  incomingState,
  companyName = 'شرکت تولیدی',
  options = {}
) {
  const db = getErpPgDb();
  if (!db) return null;

  const { forceReplace = false, settingsCompany = null, legacyFallbackState = null } = options;

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(drizzleSql`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`);
      const currentServerState = await readCompanyStateInsideTx(tx, companyId);
      const currentRevision = currentServerState ? safeInt(currentServerState._revision, 1) : 0;
      const clientBaseRevision =
        incomingState && incomingState._revision != null ? safeInt(incomingState._revision, 0) : null;

      let stateToPersist;
      if (forceReplace || !currentServerState) {
        const base = legacyFallbackState && !currentServerState ? { ...legacyFallbackState } : {};
        stateToPersist = {
          ...base,
          ...incomingState,
          companyId,
          companyName: companyName || incomingState?.companyName || currentServerState?.companyName || 'شرکت تولیدی',
        };
      } else {
        stateToPersist = mergeConcurrentErpStates(
          currentServerState,
          {
            ...incomingState,
            companyId,
            companyName: companyName || incomingState?.companyName || currentServerState.companyName,
          },
          clientBaseRevision,
          currentRevision
        );
      }

      if (settingsCompany) {
        stateToPersist.bankAccounts = syncSettingsBanksIntoAccounts(stateToPersist.bankAccounts, settingsCompany);
      }
      stateToPersist.chartOfAccounts = hydrateChartOfAccounts(stateToPersist.chartOfAccounts);

      const nextRevision = currentRevision + 1;
      await writeCompanyStateInsideTx(tx, companyId, stateToPersist, nextRevision);
      const savedState = await readCompanyStateInsideTx(tx, companyId);

      return {
        state: savedState,
        revision: nextRevision,
        mergedConcurrently: Boolean(
          !forceReplace && currentServerState && clientBaseRevision != null && currentRevision > clientBaseRevision
        ),
      };
    });
  } catch (error) {
    console.error(`[ERP PostgreSQL] Failed saving state for company ${companyId}:`, error.message);
    throw new Error('خطا در ثبت تراکنش حسابداری در دیتابیس PostgreSQL.', { cause: error });
  }
}

export async function mutateCompanyErpTransactionally(
  companyId,
  companyName,
  settingsCompany,
  legacyFallbackState,
  mutatorFn
) {
  const db = getErpPgDb();
  if (!db) return null;

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(drizzleSql`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`);
      let current = await readCompanyStateInsideTx(tx, companyId);
      if (!current) {
        const seed = legacyFallbackState
          ? { ...legacyFallbackState, companyId, companyName }
          : {
              companyId,
              companyName,
              activeFiscalYear: '1405',
              fiscalYears: ['1405', '1404', '1403'],
              nextCartonSeq: 10001,
              nextSerialCounter: 10001,
              nextVoucherNo: 1,
              cutoverConfig: DEFAULT_CUTOVER_CONFIG,
              labelTemplateConfig: DEFAULT_LABEL_TEMPLATE_CONFIG,
              scaleConfig: DEFAULT_SCALE_CONFIG,
              chartOfAccounts: DEFAULT_ERP_CHART_OF_ACCOUNTS,
            };
        await writeCompanyStateInsideTx(tx, companyId, seed, 1);
        current = await readCompanyStateInsideTx(tx, companyId);
      }

      const mutationResult = await mutatorFn(current);
      if (mutationResult && mutationResult.abortResponse) {
        return { aborted: true, ...mutationResult };
      }

      const nextState = mutationResult?.state || current;
      const nextRev = safeInt(current._revision, 1) + 1;
      await writeCompanyStateInsideTx(tx, companyId, nextState, nextRev);
      const committed = await readCompanyStateInsideTx(tx, companyId);
      return { aborted: false, ...mutationResult, state: committed };
    });
  } catch (error) {
    console.error(`[ERP PostgreSQL] Transactional mutation failed for ${companyId}:`, error.message);
    throw error;
  }
}

export async function resetCompanyErpStateInPg(companyId, companyName, freshState) {
  const db = getErpPgDb();
  if (!db) return null;

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(drizzleSql`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`);
      const existing = await readCompanyStateInsideTx(tx, companyId);
      const nextRev = (existing ? safeInt(existing._revision, 1) : 0) + 1;
      await writeCompanyStateInsideTx(tx, companyId, { ...freshState, companyId, companyName }, nextRev);
      return await readCompanyStateInsideTx(tx, companyId);
    });
  } catch (error) {
    console.error(`[ERP PostgreSQL] Reset failed for ${companyId}:`, error.message);
    throw new Error('خطا در خام‌سازی دیتابیس شرکت در PostgreSQL.', { cause: error });
  }
}

export async function getAllCompanyStatsFromPg() {
  const db = getErpPgDb();
  if (!db) return null;

  try {
    const [companiesRows, voucherCounts, cartonCounts, itemCounts, remittanceCounts, tradeCounts, whCounts] =
      await Promise.all([
        db.select().from(erpCompanies),
        db
          .select({ companyId: erpVouchers.companyId, cnt: drizzleSql`count(*)::int` })
          .from(erpVouchers)
          .groupBy(erpVouchers.companyId),
        db
          .select({ companyId: erpCartonLabels.companyId, cnt: drizzleSql`count(*)::int` })
          .from(erpCartonLabels)
          .where(eq(erpCartonLabels.status, 'IN_STOCK'))
          .groupBy(erpCartonLabels.companyId),
        db
          .select({ companyId: erpItems.companyId, cnt: drizzleSql`count(*)::int` })
          .from(erpItems)
          .groupBy(erpItems.companyId),
        db
          .select({ companyId: erpRemittances.companyId, cnt: drizzleSql`count(*)::int` })
          .from(erpRemittances)
          .where(eq(erpRemittances.status, 'PENDING_TEHRAN_PRICING'))
          .groupBy(erpRemittances.companyId),
        db
          .select({ companyId: erpTradeDocs.companyId, cnt: drizzleSql`count(*)::int` })
          .from(erpTradeDocs)
          .groupBy(erpTradeDocs.companyId),
        db
          .select({ companyId: erpWarehouses.companyId, cnt: drizzleSql`count(*)::int` })
          .from(erpWarehouses)
          .groupBy(erpWarehouses.companyId),
      ]);

    const mapFrom = (rows) => new Map(rows.map((r) => [r.companyId, Number(r.cnt) || 0]));
    const vMap = mapFrom(voucherCounts);
    const cMap = mapFrom(cartonCounts);
    const iMap = mapFrom(itemCounts);
    const rMap = mapFrom(remittanceCounts);
    const tMap = mapFrom(tradeCounts);
    const wMap = mapFrom(whCounts);

    const statsByCompany = new Map();
    for (const c of companiesRows) {
      statsByCompany.set(c.companyId, {
        activeFiscalYear: c.activeFiscalYear,
        fiscalYears: Array.isArray(c.fiscalYears) ? c.fiscalYears : ['1405', '1404'],
        stats: {
          vouchersCount: vMap.get(c.companyId) || 0,
          inStockCartonsCount: cMap.get(c.companyId) || 0,
          itemsCount: iMap.get(c.companyId) || 0,
          pendingRemittancesCount: rMap.get(c.companyId) || 0,
          invoicesCount: tMap.get(c.companyId) || 0,
          warehousesCount: wMap.get(c.companyId) || 0,
        },
      });
    }
    return statsByCompany;
  } catch (error) {
    console.error('[ERP PostgreSQL] Failed loading stats:', error.message);
    return null;
  }
}

let backupTableEnsured = false;

async function ensureBackupTableInPg() {
  if (backupTableEnsured) return;
  const pool = getErpPgPool();
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS erp_company_backups (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        company_name TEXT NOT NULL,
        file_name TEXT NOT NULL,
        format TEXT NOT NULL DEFAULT 'json.gz',
        backup_kind TEXT NOT NULL DEFAULT 'manual',
        size_bytes INTEGER NOT NULL DEFAULT 0,
        compressed_size_bytes INTEGER NOT NULL DEFAULT 0,
        record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
        checksum_sha256 TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT 'system',
        created_at_ms BIGINT NOT NULL DEFAULT 0,
        created_date_jalali TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_erp_backups_company_time ON erp_company_backups (company_id, created_at_ms);
    `);
    backupTableEnsured = true;
  } catch (error) {
    console.warn('[ERP PostgreSQL] Auto-create erp_company_backups warning:', error.message);
  }
}

export async function recordCompanyBackupMetadataInPg(record) {
  const db = getErpPgDb();
  if (!db) return null;
  try {
    await ensureBackupTableInPg();
    await db
      .insert(erpCompanyBackups)
      .values(record)
      .onConflictDoUpdate({
        target: erpCompanyBackups.id,
        set: record,
      });
    return record;
  } catch (error) {
    console.warn('[ERP PostgreSQL] Backup metadata insert warning:', error.message);
    return null;
  }
}

export async function listCompanyBackupsFromPg(companyId) {
  const db = getErpPgDb();
  if (!db) return [];
  try {
    await ensureBackupTableInPg();
    return await db
      .select()
      .from(erpCompanyBackups)
      .where(eq(erpCompanyBackups.companyId, companyId))
      .orderBy(desc(erpCompanyBackups.createdAtMs))
      .limit(30);
  } catch (error) {
    console.warn('[ERP PostgreSQL] Backup metadata query warning:', error.message);
    return [];
  }
}
