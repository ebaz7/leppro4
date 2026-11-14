import 'dotenv/config';
import { Pool } from 'pg';
import { pathToFileURL } from 'url';

// 100% idempotent, non-destructive DDL matching src/db/schema.ts & backend/erp-pg-repository.js
// Works completely offline on local Windows PostgreSQL or LAN PostgreSQL without dropping/altering data.
export const ERP_SCHEMA_DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    uid TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS erp_companies (
    company_id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    active_fiscal_year TEXT NOT NULL DEFAULT '1405',
    fiscal_years JSONB NOT NULL DEFAULT '["1405","1404","1403"]'::jsonb,
    next_carton_seq INTEGER NOT NULL DEFAULT 10001,
    next_voucher_no INTEGER NOT NULL DEFAULT 1,
    cutover_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    label_template_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    scale_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS erp_production_lines (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    machine_type TEXT NOT NULL DEFAULT '',
    supervisor_name TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT NOT NULL DEFAULT '',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_prod_lines_company ON erp_production_lines (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_commodity_groups (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    parent_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT NOT NULL DEFAULT '',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_comm_groups_company ON erp_commodity_groups (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_warehouses (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    warehouse_type TEXT NOT NULL DEFAULT 'GENERAL',
    location TEXT NOT NULL DEFAULT '',
    manager_name TEXT NOT NULL DEFAULT '',
    assigned_group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    assigned_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_warehouses_company ON erp_warehouses (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_items (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'FINISHED_YARN',
    group_id TEXT,
    group_name TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT 'کیلوگرم',
    warehouse_id TEXT NOT NULL DEFAULT '',
    stock_qty DOUBLE PRECISION NOT NULL DEFAULT 0,
    unit_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
    sales_price DOUBLE PRECISION NOT NULL DEFAULT 0,
    yarn_count TEXT NOT NULL DEFAULT '',
    color_code TEXT NOT NULL DEFAULT '',
    color_name TEXT NOT NULL DEFAULT '',
    grade TEXT NOT NULL DEFAULT 'A',
    cone_weight_grams DOUBLE PRECISION NOT NULL DEFAULT 110,
    carton_weight_grams DOUBLE PRECISION NOT NULL DEFAULT 1450,
    default_cones_per_carton INTEGER NOT NULL DEFAULT 6,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_tare_locked BOOLEAN NOT NULL DEFAULT FALSE,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_items_company_code ON erp_items (company_id, code);`,
  `CREATE INDEX IF NOT EXISTS idx_erp_items_warehouse ON erp_items (company_id, warehouse_id);`,

  `CREATE TABLE IF NOT EXISTS erp_boms (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    finished_item_id TEXT NOT NULL DEFAULT '',
    finished_item_code TEXT NOT NULL DEFAULT '',
    finished_item_name TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '1.0',
    waste_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
    direct_labor_per_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    factory_overhead_per_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    components JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    total_cost_per_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_boms_company ON erp_boms (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_production_orders (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    order_no TEXT NOT NULL DEFAULT '',
    date_jalali TEXT NOT NULL DEFAULT '',
    machine_code TEXT NOT NULL DEFAULT '',
    shift TEXT NOT NULL DEFAULT '',
    supervisor_name TEXT NOT NULL DEFAULT '',
    product_id TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL DEFAULT '',
    lot_number TEXT NOT NULL DEFAULT '',
    target_qty_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    produced_qty_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    waste_qty_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_prod_orders_company ON erp_production_orders (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_carton_labels (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    serial_number TEXT NOT NULL DEFAULT '',
    reference_code TEXT NOT NULL DEFAULT '',
    qr_payload TEXT NOT NULL DEFAULT '',
    product_id TEXT NOT NULL DEFAULT '',
    product_code TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL DEFAULT '',
    yarn_count TEXT NOT NULL DEFAULT '',
    color_name TEXT NOT NULL DEFAULT '',
    lot_number TEXT NOT NULL DEFAULT '',
    machine_code TEXT NOT NULL DEFAULT '',
    shift TEXT NOT NULL DEFAULT '',
    grade TEXT NOT NULL DEFAULT 'A',
    gross_weight_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    cones_count INTEGER NOT NULL DEFAULT 6,
    cone_weight_grams DOUBLE PRECISION NOT NULL DEFAULT 110,
    carton_weight_grams DOUBLE PRECISION NOT NULL DEFAULT 1450,
    total_tare_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    net_weight_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    unit_cost_per_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_cost_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    warehouse_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'IN_STOCK',
    created_at_ms BIGINT NOT NULL DEFAULT 0,
    created_date_jalali TEXT NOT NULL DEFAULT '',
    created_time_exact TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    production_line_id TEXT,
    production_voucher_no TEXT,
    production_archive_code TEXT,
    remittance_id TEXT,
    source_system TEXT NOT NULL DEFAULT 'DELKAM',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_cartons_serial ON erp_carton_labels (company_id, serial_number);`,
  `CREATE INDEX IF NOT EXISTS idx_erp_cartons_ref ON erp_carton_labels (company_id, reference_code);`,
  `CREATE INDEX IF NOT EXISTS idx_erp_cartons_status ON erp_carton_labels (company_id, status);`,

  `CREATE TABLE IF NOT EXISTS erp_production_vouchers (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    voucher_no TEXT NOT NULL DEFAULT '',
    archive_code TEXT NOT NULL DEFAULT '',
    date_jalali TEXT NOT NULL DEFAULT '',
    time_exact TEXT NOT NULL DEFAULT '',
    line_id TEXT NOT NULL DEFAULT '',
    line_name TEXT NOT NULL DEFAULT '',
    item_id TEXT NOT NULL DEFAULT '',
    item_code TEXT NOT NULL DEFAULT '',
    item_name TEXT NOT NULL DEFAULT '',
    cartons_count INTEGER NOT NULL DEFAULT 0,
    total_gross_weight_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_tare_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_net_weight_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    operator_name TEXT NOT NULL DEFAULT '',
    carton_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING_WAREHOUSE_DELIVERY',
    delivered_warehouse_id TEXT,
    delivered_warehouse_name TEXT,
    delivered_doc_no TEXT,
    notes TEXT NOT NULL DEFAULT '',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_prod_vouchers_company ON erp_production_vouchers (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_warehouse_documents (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    doc_no TEXT NOT NULL DEFAULT '',
    archive_code TEXT NOT NULL DEFAULT '',
    doc_type TEXT NOT NULL DEFAULT 'RECEIPT_PRODUCTION',
    date_jalali TEXT NOT NULL DEFAULT '',
    time_exact TEXT NOT NULL DEFAULT '',
    source_warehouse_id TEXT,
    source_warehouse_name TEXT,
    target_warehouse_id TEXT,
    target_warehouse_name TEXT,
    party_name TEXT,
    party_code TEXT,
    driver_name TEXT,
    plate_number TEXT,
    production_voucher_id TEXT,
    reference_doc_id TEXT,
    carton_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    cartons_count INTEGER NOT NULL DEFAULT 0,
    total_gross_weight_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_net_weight_kg DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    receiver_user_name TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_wh_docs_type ON erp_warehouse_documents (company_id, doc_type);`,
  `CREATE INDEX IF NOT EXISTS idx_erp_wh_docs_status ON erp_warehouse_documents (company_id, status);`,

  `CREATE TABLE IF NOT EXISTS erp_warehouse_legacy_docs (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    doc_no TEXT NOT NULL DEFAULT '',
    doc_type TEXT NOT NULL DEFAULT 'RECEIPT_PRODUCTION',
    date_jalali TEXT NOT NULL DEFAULT '',
    warehouse_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'FINALIZED',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_wh_legacy_company ON erp_warehouse_legacy_docs (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_sales_orders (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    order_no TEXT NOT NULL DEFAULT '',
    order_type TEXT NOT NULL DEFAULT 'SALES_ORDER',
    date_jalali TEXT NOT NULL DEFAULT '',
    party_name TEXT NOT NULL DEFAULT '',
    party_code TEXT NOT NULL DEFAULT '',
    delivery_due_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDING_CARTABLE',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT NOT NULL DEFAULT '',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_sales_orders_company ON erp_sales_orders (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_remittances (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    remittance_no TEXT NOT NULL DEFAULT '',
    date_jalali TEXT NOT NULL DEFAULT '',
    customer_name TEXT NOT NULL DEFAULT '',
    customer_code TEXT NOT NULL DEFAULT '',
    driver_name TEXT NOT NULL DEFAULT '',
    plate_number TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDING_TEHRAN_PRICING',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT NOT NULL DEFAULT '',
    created_at_ms BIGINT NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    invoice_id TEXT,
    exit_permit_id TEXT,
    exit_permit_number INTEGER,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_remittances_company_status ON erp_remittances (company_id, status);`,

  `CREATE TABLE IF NOT EXISTS erp_trade_docs (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    doc_no TEXT NOT NULL DEFAULT '',
    doc_type TEXT NOT NULL DEFAULT 'SALES',
    date_jalali TEXT NOT NULL DEFAULT '',
    party_name TEXT NOT NULL DEFAULT '',
    party_code TEXT NOT NULL DEFAULT '',
    warehouse_id TEXT NOT NULL DEFAULT '',
    remittance_id TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    tax_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    net_total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    voucher_id TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at_ms BIGINT NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT '',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_trade_docs_company ON erp_trade_docs (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_parties (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    party_type TEXT NOT NULL DEFAULT 'CUSTOMER',
    national_id TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    credit_limit_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_parties_company ON erp_parties (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_bank_accounts (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    bank_name TEXT NOT NULL,
    branch_name TEXT NOT NULL DEFAULT '',
    account_no TEXT NOT NULL DEFAULT '',
    sheba_no TEXT NOT NULL DEFAULT '',
    account_type TEXT NOT NULL DEFAULT 'JARI',
    balance_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    tafzili_code TEXT NOT NULL DEFAULT '',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_banks_company ON erp_bank_accounts (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_cheque_books (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    bank_account_id TEXT NOT NULL DEFAULT '',
    bank_name TEXT NOT NULL DEFAULT '',
    series TEXT NOT NULL DEFAULT '',
    from_serial TEXT NOT NULL DEFAULT '',
    to_serial TEXT NOT NULL DEFAULT '',
    leaves_count INTEGER NOT NULL DEFAULT 0,
    used_leaves INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_chequebooks_company ON erp_cheque_books (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_treasury_docs (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    doc_no TEXT NOT NULL DEFAULT '',
    doc_type TEXT NOT NULL DEFAULT 'RECEIPT_CASH',
    date_jalali TEXT NOT NULL DEFAULT '',
    party_name TEXT NOT NULL DEFAULT '',
    party_code TEXT NOT NULL DEFAULT '',
    bank_name TEXT NOT NULL DEFAULT '',
    sayadi_id TEXT,
    cheque_serial TEXT,
    due_date_jalali TEXT,
    amount_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    cheque_status TEXT,
    voucher_no INTEGER,
    description TEXT NOT NULL DEFAULT '',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_treasury_docs_company ON erp_treasury_docs (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_employees (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    personnel_code TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL,
    national_id TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    job_title TEXT NOT NULL DEFAULT '',
    base_salary_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    housing_allowance_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    child_allowance_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    bank_sheba TEXT NOT NULL DEFAULT '',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_employees_company ON erp_employees (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_payroll_slips (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    year_month TEXT NOT NULL DEFAULT '',
    employee_id TEXT NOT NULL DEFAULT '',
    employee_name TEXT NOT NULL DEFAULT '',
    personnel_code TEXT NOT NULL DEFAULT '',
    worked_days INTEGER NOT NULL DEFAULT 30,
    overtime_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
    gross_pay_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    insurance_employee_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    insurance_employer_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    tax_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    net_payable_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    voucher_no INTEGER,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_payroll_slips_company ON erp_payroll_slips (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_fixed_assets (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    asset_code TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'MACHINERY',
    purchase_date_jalali TEXT NOT NULL DEFAULT '',
    cost_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    salvage_value_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    depreciation_method TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    annual_rate_percent DOUBLE PRECISION NOT NULL DEFAULT 10,
    accumulated_dep_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    book_value_rials DOUBLE PRECISION NOT NULL DEFAULT 0,
    location TEXT NOT NULL DEFAULT '',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_assets_company ON erp_fixed_assets (company_id);`,

  `CREATE TABLE IF NOT EXISTS erp_chart_of_accounts (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'MOEIN',
    parent_code TEXT,
    nature TEXT NOT NULL DEFAULT 'DEBIT',
    system_role TEXT,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_coa_company_code ON erp_chart_of_accounts (company_id, code);`,

  `CREATE TABLE IF NOT EXISTS erp_vouchers (
    company_id TEXT NOT NULL,
    id TEXT NOT NULL,
    voucher_no INTEGER NOT NULL DEFAULT 1,
    date_jalali TEXT NOT NULL DEFAULT '',
    voucher_type TEXT NOT NULL DEFAULT 'GENERAL',
    status TEXT NOT NULL DEFAULT 'FINALIZED',
    description TEXT NOT NULL DEFAULT '',
    reference_id TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    created_at_ms BIGINT NOT NULL DEFAULT 0,
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_vouchers_company_no ON erp_vouchers (company_id, voucher_no);`,

  `CREATE TABLE IF NOT EXISTS erp_voucher_lines (
    company_id TEXT NOT NULL,
    voucher_id TEXT NOT NULL,
    id TEXT NOT NULL,
    line_order INTEGER NOT NULL DEFAULT 0,
    account_code TEXT NOT NULL DEFAULT '',
    account_title TEXT NOT NULL DEFAULT '',
    tafzili_name TEXT NOT NULL DEFAULT '',
    debit DOUBLE PRECISION NOT NULL DEFAULT 0,
    credit DOUBLE PRECISION NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    extra JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (company_id, voucher_id, id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_voucher_lines_voucher ON erp_voucher_lines (company_id, voucher_id);`,

  `CREATE TABLE IF NOT EXISTS erp_company_backups (
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
  );`,
  `CREATE INDEX IF NOT EXISTS idx_erp_backups_company_time ON erp_company_backups (company_id, created_at_ms);`,

  // Non-destructive column upgrades for existing production PostgreSQL installations
  `ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;`,
  `ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS cutover_config JSONB NOT NULL DEFAULT '{}'::jsonb;`,
  `ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS label_template_config JSONB NOT NULL DEFAULT '{}'::jsonb;`,
  `ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS scale_config JSONB NOT NULL DEFAULT '{}'::jsonb;`,
  `ALTER TABLE erp_carton_labels ADD COLUMN IF NOT EXISTS production_line_id TEXT;`,
  `ALTER TABLE erp_carton_labels ADD COLUMN IF NOT EXISTS production_voucher_no TEXT;`,
  `ALTER TABLE erp_carton_labels ADD COLUMN IF NOT EXISTS production_archive_code TEXT;`,
  `ALTER TABLE erp_carton_labels ADD COLUMN IF NOT EXISTS remittance_id TEXT;`,
  `ALTER TABLE erp_carton_labels ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'DELKAM';`,
  `ALTER TABLE erp_carton_labels ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}'::jsonb;`,
  `ALTER TABLE erp_production_vouchers ADD COLUMN IF NOT EXISTS delivered_warehouse_id TEXT;`,
  `ALTER TABLE erp_production_vouchers ADD COLUMN IF NOT EXISTS delivered_warehouse_name TEXT;`,
  `ALTER TABLE erp_production_vouchers ADD COLUMN IF NOT EXISTS delivered_doc_no TEXT;`,
  `ALTER TABLE erp_production_vouchers ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}'::jsonb;`,
  `ALTER TABLE erp_warehouses ADD COLUMN IF NOT EXISTS assigned_group_ids JSONB NOT NULL DEFAULT '[]'::jsonb;`,
  `ALTER TABLE erp_warehouses ADD COLUMN IF NOT EXISTS assigned_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb;`,
  `ALTER TABLE erp_warehouses ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}'::jsonb;`,
  `ALTER TABLE erp_items ADD COLUMN IF NOT EXISTS is_tare_locked BOOLEAN NOT NULL DEFAULT FALSE;`,
  `ALTER TABLE erp_items ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}'::jsonb;`,
];

export async function applyIdempotentErpSchema(pool, appUser = process.env.SQL_USER) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const stmt of ERP_SCHEMA_DDL_STATEMENTS) {
      await client.query(stmt);
    }
    await client.query('COMMIT');

    if (appUser && /^[a-zA-Z0-9_]+$/.test(String(appUser))) {
      try {
        await client.query(`GRANT USAGE, CREATE ON SCHEMA public TO "${appUser}";`);
        await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${appUser}";`);
        await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${appUser}";`);
      } catch {
        // Ignore privilege grant warnings if connected as non-superuser with existing table access
      }
    }

    return { appliedStatements: ERP_SCHEMA_DDL_STATEMENTS.length };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function runCli() {
  const host = process.env.SQL_HOST;
  const database = process.env.SQL_DB_NAME;
  const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
  const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;
  const port = process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 5432;

  if (!host || !database || !user) {
    console.log('[ERP PG Schema] SQL_HOST / SQL_DB_NAME / SQL_USER not configured. Skipping schema initialization.');
    process.exit(0);
  }

  const pool = new Pool({
    host,
    port,
    database,
    user,
    password,
    max: 2,
    connectionTimeoutMillis: 15000,
  });

  try {
    const res = await applyIdempotentErpSchema(pool);
    console.log(`[ERP PG Schema] Verified and synchronized ${res.appliedStatements} schema objects non-destructively.`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((err) => {
    console.error('[ERP PG Schema] Error applying offline schema:', err.message);
    process.exit(1);
  });
}
