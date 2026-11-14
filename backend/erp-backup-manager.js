import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import {
  isPostgresConfigured,
  getCompanyErpStateFromPg,
  saveCompanyErpStateToPg,
  recordCompanyBackupMetadataInPg,
  listCompanyBackupsFromPg,
} from './erp-pg-repository.js';

export const sanitizeCompanyFolderName = (companyId) => {
  const raw = String(companyId || 'default_company').trim();
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!clean || /^_+$/.test(clean)) {
    const hash = crypto.createHash('sha1').update(raw, 'utf8').digest('hex').slice(0, 10);
    return `comp_${hash}`;
  }
  return clean;
};

export const getCompanyBackupDir = (backupsRootDir, companyId) => {
  const dir = path.join(backupsRootDir, 'companies', sanitizeCompanyFolderName(companyId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

export const computeCanonicalSha256 = (data) => {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
};

export const computeCompanyRecordCounts = (state) => ({
  productionLines: Array.isArray(state?.productionLines) ? state.productionLines.length : 0,
  commodityGroups: Array.isArray(state?.commodityGroups) ? state.commodityGroups.length : 0,
  warehouses: Array.isArray(state?.warehouses) ? state.warehouses.length : 0,
  items: Array.isArray(state?.items) ? state.items.length : 0,
  boms: Array.isArray(state?.boms) ? state.boms.length : 0,
  cartonLabels: Array.isArray(state?.cartonLabels) ? state.cartonLabels.length : 0,
  productionVouchers: Array.isArray(state?.productionVouchers) ? state.productionVouchers.length : 0,
  warehouseDocuments: Array.isArray(state?.warehouseDocuments) ? state.warehouseDocuments.length : 0,
  remittances: Array.isArray(state?.remittances) ? state.remittances.length : 0,
  tradeDocs: Array.isArray(state?.tradeDocs) ? state.tradeDocs.length : 0,
  treasuryDocs: Array.isArray(state?.treasuryDocs) ? state.treasuryDocs.length : 0,
  vouchers: Array.isArray(state?.vouchers) ? state.vouchers.length : 0,
  chartOfAccounts: Array.isArray(state?.chartOfAccounts) ? state.chartOfAccounts.length : 0,
});

export const buildIsolatedCompanyBackupEnvelope = (companyId, companyName, state, storageEngine = 'postgresql') => {
  const cleanState = {
    ...state,
    companyId,
    companyName: companyName || state?.companyName || companyId,
  };
  delete cleanState.companiesData;

  const checksumSha256 = computeCanonicalSha256(cleanState);
  const recordCounts = computeCompanyRecordCounts(cleanState);

  return {
    formatVersion: 'delkam-erp-company-backup-v2',
    isolatedPerCompany: true,
    storageEngine,
    companyId,
    companyName: cleanState.companyName,
    activeFiscalYear: cleanState.activeFiscalYear || '1405',
    exportedAt: new Date().toISOString(),
    exportedAtMs: Date.now(),
    checksumSha256,
    recordCounts,
    state: cleanState,
  };
};

// Creates a compact per-company .json.gz snapshot inside backups/companies/<companyId>/
// Skips writing a duplicate auto-backup if the company checksum matches the newest snapshot.
export async function createIsolatedCompanySnapshot({
  backupsRootDir,
  companyId,
  companyName,
  state,
  backupKind = 'manual',
  createdBy = 'system',
  createdDateJalali = '',
  maxRetainedPerCompany = 15,
}) {
  const companyDir = getCompanyBackupDir(backupsRootDir, companyId);
  const engine = isPostgresConfigured() ? 'postgresql' : 'json';
  const envelope = buildIsolatedCompanyBackupEnvelope(companyId, companyName, state, engine);
  const rawJson = JSON.stringify(envelope);
  const rawBuffer = Buffer.from(rawJson, 'utf8');

  // Smart deduplication for automatic scheduled backups: avoid identical disk bloat
  if (backupKind === 'auto') {
    const metaFiles = fs
      .readdirSync(companyDir)
      .filter((f) => f.endsWith('.json.gz'))
      .sort()
      .reverse();
    if (metaFiles.length > 0) {
      try {
        const latestGz = fs.readFileSync(path.join(companyDir, metaFiles[0]));
        const latestParsed = JSON.parse(zlib.gunzipSync(latestGz).toString('utf8'));
        if (latestParsed?.checksumSha256 === envelope.checksumSha256) {
          return {
            skippedUnchanged: true,
            fileName: metaFiles[0],
            companyId,
            checksumSha256: envelope.checksumSha256,
            recordCounts: envelope.recordCounts,
          };
        }
      } catch {}
    }
  }

  const compressedBuffer = zlib.gzipSync(rawBuffer, { level: 9 });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeComp = sanitizeCompanyFolderName(companyId);
  const fileName = `ERP_${safeComp}_${backupKind}_${ts}.json.gz`;
  const filePath = path.join(companyDir, fileName);

  fs.writeFileSync(filePath, compressedBuffer);

  // Retain only newest N snapshots per company to keep Windows storage compact
  try {
    const files = fs
      .readdirSync(companyDir)
      .filter((f) => f.endsWith('.json.gz'))
      .sort();
    if (files.length > maxRetainedPerCompany) {
      const toRemove = files.slice(0, files.length - maxRetainedPerCompany);
      toRemove.forEach((f) => {
        try {
          fs.unlinkSync(path.join(companyDir, f));
        } catch {}
      });
    }
  } catch {}

  const metadata = {
    id: `bkp_${safeComp}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    companyId,
    companyName: envelope.companyName,
    fileName,
    format: 'json.gz',
    backupKind,
    sizeBytes: rawBuffer.length,
    compressedSizeBytes: compressedBuffer.length,
    recordCounts: envelope.recordCounts,
    checksumSha256: envelope.checksumSha256,
    createdBy: String(createdBy || 'system'),
    createdAtMs: envelope.exportedAtMs,
    createdDateJalali: String(createdDateJalali || ''),
  };

  if (isPostgresConfigured()) {
    await recordCompanyBackupMetadataInPg(metadata);
  }

  return {
    skippedUnchanged: false,
    ...metadata,
    filePath,
  };
}

// Lists saved isolated snapshots strictly for the requested companyId
export async function listIsolatedCompanySnapshots(backupsRootDir, companyId) {
  const companyDir = getCompanyBackupDir(backupsRootDir, companyId);
  const diskFiles = fs
    .readdirSync(companyDir)
    .filter((f) => f.endsWith('.json.gz') || f.endsWith('.json') || f.endsWith('.zip'))
    .map((f) => {
      const fp = path.join(companyDir, f);
      const stat = fs.statSync(fp);
      let kind = 'manual';
      if (f.includes('_auto_')) kind = 'auto';
      else if (f.includes('_pre_restore_')) kind = 'pre_restore';
      return {
        fileName: f,
        backupKind: kind,
        compressedSizeBytes: stat.size,
        createdAtMs: Math.round(stat.mtimeMs),
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  const pgMeta = isPostgresConfigured() ? await listCompanyBackupsFromPg(companyId) : [];
  const pgMap = new Map(pgMeta.map((m) => [m.fileName, m]));

  return diskFiles.map((df) => {
    const meta = pgMap.get(df.fileName);
    return {
      id: meta?.id || df.fileName,
      companyId,
      companyName: meta?.companyName || '',
      fileName: df.fileName,
      format: df.fileName.endsWith('.zip') ? 'zip' : df.fileName.endsWith('.json.gz') ? 'json.gz' : 'json',
      backupKind: meta?.backupKind || df.backupKind,
      sizeBytes: meta?.sizeBytes || df.compressedSizeBytes,
      compressedSizeBytes: df.compressedSizeBytes,
      recordCounts: meta?.recordCounts || null,
      checksumSha256: meta?.checksumSha256 || null,
      createdBy: meta?.createdBy || 'system',
      createdAtMs: meta?.createdAtMs || df.createdAtMs,
      createdDateJalali: meta?.createdDateJalali || '',
    };
  });
}

const sqlQuote = (val) => {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
};

const sqlJsonb = (val, fallback = {}) => {
  const safe = val !== undefined && val !== null ? val : fallback;
  return `${sqlQuote(JSON.stringify(safe))}::jsonb`;
};

// Generates a real, standalone PostgreSQL .sql dump script for a single company's 24 ERP tables
export function generateCompanyPostgresSqlDump(envelope) {
  const state = envelope?.state || {};
  const cid = String(envelope?.companyId || state.companyId || 'default_company');
  const cname = String(envelope?.companyName || state.companyName || cid);
  const envelopeB64 = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');

  const lines = [
    '-- ============================================================================',
    '-- Delkam Industrial Accounting ERP - Native PostgreSQL Per-Company SQL Dump',
    `-- Company ID:      ${cid}`,
    `-- Company Name:    ${cname}`,
    `-- Fiscal Year:     ${envelope?.activeFiscalYear || state.activeFiscalYear || '1405'}`,
    `-- Exported At:     ${envelope?.exportedAt || new Date().toISOString()}`,
    `-- SHA-256 Checksum:${envelope?.checksumSha256 || ''}`,
    `-- DELKAM_ERP_ENVELOPE_BASE64:${envelopeB64}`,
    '-- ============================================================================',
    '',
    "SET client_encoding = 'UTF8';",
    'SET standard_conforming_strings = on;',
    'BEGIN;',
    '',
    `-- 1. Clear existing rows strictly for company_id = ${sqlQuote(cid)} (other companies untouched)`,
  ];

  const childTables = [
    'erp_voucher_lines',
    'erp_vouchers',
    'erp_chart_of_accounts',
    'erp_fixed_assets',
    'erp_payroll_slips',
    'erp_employees',
    'erp_treasury_docs',
    'erp_cheque_books',
    'erp_bank_accounts',
    'erp_parties',
    'erp_trade_docs',
    'erp_remittances',
    'erp_sales_orders',
    'erp_warehouse_legacy_docs',
    'erp_warehouse_documents',
    'erp_production_vouchers',
    'erp_carton_labels',
    'erp_production_orders',
    'erp_boms',
    'erp_items',
    'erp_warehouses',
    'erp_commodity_groups',
    'erp_production_lines',
  ];

  for (const tbl of childTables) {
    lines.push(`DELETE FROM ${tbl} WHERE company_id = ${sqlQuote(cid)};`);
  }
  lines.push(`DELETE FROM erp_companies WHERE company_id = ${sqlQuote(cid)};`);
  lines.push('');

  // 2. Insert erp_companies header row
  lines.push(
    `INSERT INTO erp_companies (company_id, company_name, active_fiscal_year, fiscal_years, next_carton_seq, next_voucher_no, cutover_config, label_template_config, scale_config, revision) VALUES (${sqlQuote(cid)}, ${sqlQuote(cname)}, ${sqlQuote(state.activeFiscalYear || '1405')}, ${sqlJsonb(state.fiscalYears || ['1405', '1404'], ['1405'])}, ${sqlQuote(Number(state.nextCartonSeq || 10001))}, ${sqlQuote(Number(state.nextVoucherNo || 1))}, ${sqlJsonb(state.cutoverConfig, {})}, ${sqlJsonb(state.labelTemplateConfig, {})}, ${sqlJsonb(state.scaleConfig, {})}, ${sqlQuote(Number(state._revision || 1))});`
  );

  // 3. Insert erp_production_lines
  for (const r of state.productionLines || []) {
    if (!r?.id) continue;
    lines.push(
      `INSERT INTO erp_production_lines (company_id, id, code, name, machine_type, supervisor_name, is_active, notes, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(r.id)}, ${sqlQuote(r.code || '')}, ${sqlQuote(r.name || '')}, ${sqlQuote(r.machineType || '')}, ${sqlQuote(r.supervisorName || '')}, ${sqlQuote(Boolean(r.isActive ?? true))}, ${sqlQuote(r.notes || '')}, ${sqlJsonb(r, {})});`
    );
  }

  // 4. Insert erp_commodity_groups
  for (const r of state.commodityGroups || []) {
    if (!r?.id) continue;
    lines.push(
      `INSERT INTO erp_commodity_groups (company_id, id, code, name, parent_id, is_active, description, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(r.id)}, ${sqlQuote(r.code || '')}, ${sqlQuote(r.name || '')}, ${sqlQuote(r.parentId || null)}, ${sqlQuote(Boolean(r.isActive ?? true))}, ${sqlQuote(r.description || '')}, ${sqlJsonb(r, {})});`
    );
  }

  // 5. Insert erp_warehouses
  for (const r of state.warehouses || []) {
    if (!r?.id) continue;
    lines.push(
      `INSERT INTO erp_warehouses (company_id, id, code, name, warehouse_type, location, manager_name, assigned_group_ids, assigned_item_ids, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(r.id)}, ${sqlQuote(r.code || '')}, ${sqlQuote(r.name || '')}, ${sqlQuote(r.type || r.warehouseType || 'GENERAL')}, ${sqlQuote(r.location || '')}, ${sqlQuote(r.managerName || '')}, ${sqlJsonb(r.assignedGroupIds || [], [])}, ${sqlJsonb(r.assignedItemIds || [], [])}, ${sqlJsonb(r, {})});`
    );
  }

  // 6. Insert erp_items
  for (const r of state.items || []) {
    if (!r?.id) continue;
    lines.push(
      `INSERT INTO erp_items (company_id, id, code, name, category, group_id, group_name, unit, warehouse_id, stock_qty, unit_cost, sales_price, yarn_count, color_code, color_name, grade, cone_weight_grams, carton_weight_grams, default_cones_per_carton, is_active, is_tare_locked, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(r.id)}, ${sqlQuote(r.code || '')}, ${sqlQuote(r.name || '')}, ${sqlQuote(r.category || 'FINISHED_YARN')}, ${sqlQuote(r.groupId || null)}, ${sqlQuote(r.groupName || '')}, ${sqlQuote(r.unit || 'کیلوگرم')}, ${sqlQuote(r.warehouseId || '')}, ${sqlQuote(Number(r.stockQty || 0))}, ${sqlQuote(Number(r.unitCost || 0))}, ${sqlQuote(Number(r.salesPrice || 0))}, ${sqlQuote(r.yarnCount || '')}, ${sqlQuote(r.colorCode || '')}, ${sqlQuote(r.colorName || '')}, ${sqlQuote(r.grade || 'A')}, ${sqlQuote(Number(r.coneWeightGrams || 110))}, ${sqlQuote(Number(r.cartonWeightGrams || 1450))}, ${sqlQuote(Number(r.defaultConesPerCarton || 6))}, ${sqlQuote(Boolean(r.isActive ?? true))}, ${sqlQuote(Boolean(r.isTareLocked ?? false))}, ${sqlJsonb(r, {})});`
    );
  }

  // 7. Insert erp_boms
  for (const r of state.boms || []) {
    if (!r?.id) continue;
    lines.push(
      `INSERT INTO erp_boms (company_id, id, code, title, finished_item_id, finished_item_code, finished_item_name, version, waste_percent, direct_labor_per_kg, factory_overhead_per_kg, components, status, total_cost_per_kg, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(r.id)}, ${sqlQuote(r.code || '')}, ${sqlQuote(r.title || '')}, ${sqlQuote(r.finishedItemId || '')}, ${sqlQuote(r.finishedItemCode || '')}, ${sqlQuote(r.finishedItemName || '')}, ${sqlQuote(r.version || '1.0')}, ${sqlQuote(Number(r.wastePercent || 0))}, ${sqlQuote(Number(r.directLaborPerKg || 0))}, ${sqlQuote(Number(r.factoryOverheadPerKg || 0))}, ${sqlJsonb(r.components || [], [])}, ${sqlQuote(r.status || 'ACTIVE')}, ${sqlQuote(Number(r.totalCostPerKg || 0))}, ${sqlJsonb(r, {})});`
    );
  }

  // 8. Insert erp_carton_labels
  for (const r of state.cartonLabels || []) {
    if (!r?.id) continue;
    lines.push(
      `INSERT INTO erp_carton_labels (company_id, id, serial_number, reference_code, qr_payload, product_id, product_code, product_name, yarn_count, color_name, lot_number, machine_code, shift, grade, gross_weight_kg, cones_count, cone_weight_grams, carton_weight_grams, total_tare_kg, net_weight_kg, unit_cost_per_kg, total_cost_rials, warehouse_id, status, created_at_ms, created_date_jalali, created_time_exact, created_by, production_line_id, production_voucher_no, production_archive_code, remittance_id, source_system, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(r.id)}, ${sqlQuote(r.serialNumber || '')}, ${sqlQuote(r.referenceCode || '')}, ${sqlQuote(r.qrPayload || '')}, ${sqlQuote(r.productId || '')}, ${sqlQuote(r.productCode || '')}, ${sqlQuote(r.productName || '')}, ${sqlQuote(r.yarnCount || '')}, ${sqlQuote(r.colorName || '')}, ${sqlQuote(r.lotNumber || '')}, ${sqlQuote(r.machineCode || '')}, ${sqlQuote(r.shift || '')}, ${sqlQuote(r.grade || 'A')}, ${sqlQuote(Number(r.grossWeightKg || 0))}, ${sqlQuote(Number(r.conesCount || 6))}, ${sqlQuote(Number(r.coneWeightGrams || 110))}, ${sqlQuote(Number(r.cartonWeightGrams || 1450))}, ${sqlQuote(Number(r.totalTareKg || 0))}, ${sqlQuote(Number(r.netWeightKg || 0))}, ${sqlQuote(Number(r.unitCostPerKg || 0))}, ${sqlQuote(Number(r.totalCostRials || 0))}, ${sqlQuote(r.warehouseId || '')}, ${sqlQuote(r.status || 'IN_STOCK')}, ${sqlQuote(Number(r.createdAt || 0))}, ${sqlQuote(r.createdDateJalali || '')}, ${sqlQuote(r.createdTimeExact || '')}, ${sqlQuote(r.createdBy || '')}, ${sqlQuote(r.productionLineId || null)}, ${sqlQuote(r.productionVoucherNo || null)}, ${sqlQuote(r.productionArchiveCode || null)}, ${sqlQuote(r.remittanceId || null)}, ${sqlQuote(r.sourceSystem || 'DELKAM')}, ${sqlJsonb(r, {})});`
    );
  }

  // 9. Insert erp_production_vouchers
  for (const r of state.productionVouchers || []) {
    if (!r?.id) continue;
    lines.push(
      `INSERT INTO erp_production_vouchers (company_id, id, voucher_no, archive_code, date_jalali, time_exact, line_id, line_name, item_id, item_code, item_name, cartons_count, total_gross_weight_kg, total_tare_kg, total_net_weight_kg, operator_name, carton_ids, status, delivered_warehouse_id, delivered_warehouse_name, delivered_doc_no, notes, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(r.id)}, ${sqlQuote(r.voucherNo || '')}, ${sqlQuote(r.archiveCode || '')}, ${sqlQuote(r.dateJalali || '')}, ${sqlQuote(r.timeExact || '')}, ${sqlQuote(r.lineId || '')}, ${sqlQuote(r.lineName || '')}, ${sqlQuote(r.itemId || '')}, ${sqlQuote(r.itemCode || '')}, ${sqlQuote(r.itemName || '')}, ${sqlQuote(Number(r.cartonsCount || 0))}, ${sqlQuote(Number(r.totalGrossWeightKg || 0))}, ${sqlQuote(Number(r.totalTareKg || 0))}, ${sqlQuote(Number(r.totalNetWeightKg || 0))}, ${sqlQuote(r.operatorName || '')}, ${sqlJsonb(r.cartonIds || [], [])}, ${sqlQuote(r.status || 'PENDING_WAREHOUSE_DELIVERY')}, ${sqlQuote(r.deliveredWarehouseId || null)}, ${sqlQuote(r.deliveredWarehouseName || null)}, ${sqlQuote(r.deliveredDocNo || null)}, ${sqlQuote(r.notes || '')}, ${sqlJsonb(r, {})});`
    );
  }

  // 10. Insert erp_warehouse_documents
  for (const r of state.warehouseDocuments || []) {
    if (!r?.id) continue;
    lines.push(
      `INSERT INTO erp_warehouse_documents (company_id, id, doc_no, archive_code, doc_type, date_jalali, time_exact, source_warehouse_id, source_warehouse_name, target_warehouse_id, target_warehouse_name, party_name, party_code, driver_name, plate_number, production_voucher_id, reference_doc_id, carton_ids, cartons_count, total_gross_weight_kg, total_net_weight_kg, status, receiver_user_name, created_by, notes, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(r.id)}, ${sqlQuote(r.docNo || '')}, ${sqlQuote(r.archiveCode || '')}, ${sqlQuote(r.docType || 'RECEIPT_PRODUCTION')}, ${sqlQuote(r.dateJalali || '')}, ${sqlQuote(r.timeExact || '')}, ${sqlQuote(r.sourceWarehouseId || null)}, ${sqlQuote(r.sourceWarehouseName || null)}, ${sqlQuote(r.targetWarehouseId || null)}, ${sqlQuote(r.targetWarehouseName || null)}, ${sqlQuote(r.partyName || null)}, ${sqlQuote(r.partyCode || null)}, ${sqlQuote(r.driverName || null)}, ${sqlQuote(r.plateNumber || null)}, ${sqlQuote(r.productionVoucherId || null)}, ${sqlQuote(r.referenceDocId || null)}, ${sqlJsonb(r.cartonIds || [], [])}, ${sqlQuote(Number(r.cartonsCount || 0))}, ${sqlQuote(Number(r.totalGrossWeightKg || 0))}, ${sqlQuote(Number(r.totalNetWeightKg || 0))}, ${sqlQuote(r.status || 'COMPLETED')}, ${sqlQuote(r.receiverUserName || null)}, ${sqlQuote(r.createdBy || '')}, ${sqlQuote(r.notes || '')}, ${sqlJsonb(r, {})});`
    );
  }

  // 11. Insert erp_remittances, erp_trade_docs, erp_vouchers, erp_voucher_lines
  for (const r of state.remittances || []) {
    if (!r?.id) continue;
    lines.push(
      `INSERT INTO erp_remittances (company_id, id, remittance_no, date_jalali, customer_name, customer_code, driver_name, plate_number, status, items, notes, created_at_ms, created_by, invoice_id, exit_permit_id, exit_permit_number, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(r.id)}, ${sqlQuote(r.remittanceNo || '')}, ${sqlQuote(r.dateJalali || '')}, ${sqlQuote(r.customerName || '')}, ${sqlQuote(r.customerCode || '')}, ${sqlQuote(r.driverName || '')}, ${sqlQuote(r.plateNumber || '')}, ${sqlQuote(r.status || 'PENDING_TEHRAN_PRICING')}, ${sqlJsonb(r.items || [], [])}, ${sqlQuote(r.notes || '')}, ${sqlQuote(Number(r.createdAt || 0))}, ${sqlQuote(r.createdBy || '')}, ${sqlQuote(r.invoiceId || null)}, ${sqlQuote(r.exitPermitId || null)}, ${sqlQuote(r.exitPermitNumber != null ? Number(r.exitPermitNumber) : null)}, ${sqlJsonb(r, {})});`
    );
  }

  for (const r of state.tradeDocs || []) {
    if (!r?.id) continue;
    lines.push(
      `INSERT INTO erp_trade_docs (company_id, id, doc_no, doc_type, date_jalali, party_name, party_code, warehouse_id, remittance_id, items, discount_amount, tax_amount, net_total_amount, voucher_id, notes, created_at_ms, created_by, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(r.id)}, ${sqlQuote(r.docNo || '')}, ${sqlQuote(r.docType || 'SALES')}, ${sqlQuote(r.dateJalali || '')}, ${sqlQuote(r.partyName || '')}, ${sqlQuote(r.partyCode || '')}, ${sqlQuote(r.warehouseId || '')}, ${sqlQuote(r.remittanceId || null)}, ${sqlJsonb(r.items || [], [])}, ${sqlQuote(Number(r.discountAmount || 0))}, ${sqlQuote(Number(r.taxAmount || 0))}, ${sqlQuote(Number(r.netTotalAmount || 0))}, ${sqlQuote(r.voucherId || null)}, ${sqlQuote(r.notes || '')}, ${sqlQuote(Number(r.createdAt || 0))}, ${sqlQuote(r.createdBy || '')}, ${sqlJsonb(r, {})});`
    );
  }

  for (const r of state.chartOfAccounts || []) {
    if (!r?.id) continue;
    lines.push(
      `INSERT INTO erp_chart_of_accounts (company_id, id, code, title, level, parent_code, nature, system_role, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(r.id)}, ${sqlQuote(r.code || '')}, ${sqlQuote(r.title || '')}, ${sqlQuote(r.level || 'MOEIN')}, ${sqlQuote(r.parentCode || null)}, ${sqlQuote(r.nature || 'DEBIT')}, ${sqlQuote(r.systemRole || null)}, ${sqlJsonb(r, {})});`
    );
  }

  for (const v of state.vouchers || []) {
    if (!v?.id) continue;
    lines.push(
      `INSERT INTO erp_vouchers (company_id, id, voucher_no, date_jalali, voucher_type, status, description, reference_id, created_by, created_at_ms, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(v.id)}, ${sqlQuote(Number(v.voucherNo || 1))}, ${sqlQuote(v.dateJalali || '')}, ${sqlQuote(v.voucherType || 'GENERAL')}, ${sqlQuote(v.status || 'FINALIZED')}, ${sqlQuote(v.description || '')}, ${sqlQuote(v.referenceId || null)}, ${sqlQuote(v.createdBy || '')}, ${sqlQuote(Number(v.createdAt || 0))}, ${sqlJsonb(v, {})});`
    );
    const vLines = Array.isArray(v.lines) ? v.lines : [];
    vLines.forEach((vl, idx) => {
      const vlId = vl.id || `${v.id}_L${idx + 1}`;
      lines.push(
        `INSERT INTO erp_voucher_lines (company_id, voucher_id, id, line_order, account_code, account_title, tafzili_name, debit, credit, description, extra) VALUES (${sqlQuote(cid)}, ${sqlQuote(v.id)}, ${sqlQuote(vlId)}, ${sqlQuote(idx)}, ${sqlQuote(vl.accountCode || '')}, ${sqlQuote(vl.accountTitle || '')}, ${sqlQuote(vl.tafziliName || '')}, ${sqlQuote(Number(vl.debit || 0))}, ${sqlQuote(Number(vl.credit || 0))}, ${sqlQuote(vl.description || '')}, ${sqlJsonb(vl, {})});`
      );
    });
  }

  lines.push('');
  lines.push('COMMIT;');
  lines.push('-- End of Delkam Industrial ERP PostgreSQL Dump');
  return lines.join('\n');
}

// Builds an in-memory ZIP buffer for a single company's ERP backup containing BOTH native .sql (PostgreSQL Dump) and .json
export function createIsolatedCompanyBackupZipBuffer({
  companyId,
  companyName,
  state,
}) {
  const engine = isPostgresConfigured() ? 'postgresql' : 'json';
  const envelope = buildIsolatedCompanyBackupEnvelope(companyId, companyName, state, engine);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeComp = sanitizeCompanyFolderName(companyId);
  const zipFileName = `ERP_Backup_${safeComp}_${ts}.zip`;
  const innerSqlName = `ERP_Postgres_${safeComp}_${ts}.sql`;
  const innerJsonName = `ERP_Snapshot_${safeComp}_${ts}.json`;

  const sqlDumpText = generateCompanyPostgresSqlDump(envelope);

  const zip = new AdmZip();
  zip.addFile(innerSqlName, Buffer.from(sqlDumpText, 'utf8'));
  zip.addFile(innerJsonName, Buffer.from(JSON.stringify(envelope, null, 2), 'utf8'));
  const buffer = zip.toBuffer();

  return {
    buffer,
    filename: zipFileName,
    sqlFilename: innerSqlName,
    jsonFilename: innerJsonName,
    size: buffer.length,
    envelope,
  };
}

// Creates a compact ZIP file containing BOTH native PostgreSQL .sql dump and .json snapshot for a single company
export async function createIsolatedCompanyBackupZip({
  backupsRootDir,
  companyId,
  companyName,
  state,
}) {
  const companyDir = getCompanyBackupDir(backupsRootDir, companyId);
  const engine = isPostgresConfigured() ? 'postgresql' : 'json';
  const envelope = buildIsolatedCompanyBackupEnvelope(companyId, companyName, state, engine);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeComp = sanitizeCompanyFolderName(companyId);
  const zipFileName = `ERP_Backup_${safeComp}_${ts}.zip`;
  const zipFilePath = path.join(companyDir, zipFileName);
  const innerSqlName = `ERP_Postgres_${safeComp}_${ts}.sql`;
  const innerJsonName = `ERP_Snapshot_${safeComp}_${ts}.json`;
  const sqlDumpText = generateCompanyPostgresSqlDump(envelope);

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve({ filePath: zipFilePath, filename: zipFileName, size: archive.pointer() }));
    archive.on('error', reject);
    output.on('error', reject);
    archive.pipe(output);
    archive.append(sqlDumpText, { name: innerSqlName });
    archive.append(JSON.stringify(envelope, null, 2), { name: innerJsonName });
    archive.finalize();
  });

  // Keep max 5 zip artifacts in company folder so disk remains compact
  try {
    const zips = fs.readdirSync(companyDir).filter((f) => f.endsWith('.zip')).sort();
    if (zips.length > 5) {
      zips.slice(0, zips.length - 5).forEach((f) => {
        try { fs.unlinkSync(path.join(companyDir, f)); } catch {}
      });
    }
  } catch {}

  const stat = fs.statSync(zipFilePath);
  return {
    filePath: zipFilePath,
    filename: zipFileName,
    size: stat.size,
    envelope,
  };
}

function tryExtractEnvelopeFromSqlString(sqlText) {
  const match = String(sqlText || '').match(/--\s*DELKAM_ERP_ENVELOPE_BASE64:([A-Za-z0-9+/=]+)/);
  if (match && match[1]) {
    const jsonStr = Buffer.from(match[1], 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  }
  return null;
}

// Parses & validates a company backup payload (.sql, .json, .json.gz, or .zip buffer/object)
export function parseAndValidateCompanyBackupPayload(input) {
  let parsed = null;

  if (Buffer.isBuffer(input)) {
    // Detect ZIP (PK\x03\x04) or GZIP (\x1f\x8b) or SQL/JSON text
    if (input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b) {
      const gunzipped = zlib.gunzipSync(input).toString('utf8');
      parsed = tryExtractEnvelopeFromSqlString(gunzipped) || JSON.parse(gunzipped);
    } else if (input.length >= 2 && input[0] === 0x50 && input[1] === 0x4b) {
      const zip = new AdmZip(input);
      const jsonEntries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.endsWith('.json'));
      const sqlEntries = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.endsWith('.sql'));
      if (jsonEntries.length > 0) {
        parsed = JSON.parse(jsonEntries[0].getData().toString('utf8'));
      } else if (sqlEntries.length > 0) {
        parsed = tryExtractEnvelopeFromSqlString(sqlEntries[0].getData().toString('utf8'));
      }
      if (!parsed) {
        throw new Error('فایل ZIP فاقد فایل پشتیبان معتبر (.sql یا .json) است.');
      }
    } else {
      const rawText = input.toString('utf8');
      parsed = tryExtractEnvelopeFromSqlString(rawText) || JSON.parse(rawText);
    }
  } else if (typeof input === 'string') {
    parsed = tryExtractEnvelopeFromSqlString(input) || JSON.parse(input);
  } else if (input && typeof input === 'object') {
    parsed = input;
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('ساختار فایل پشتیبان نامعتبر است.');
  }

  // Reject accidental full system database.json uploads to protect other companies
  if (parsed.companiesData || parsed.exitPermits || parsed.paymentOrders || parsed.users) {
    throw new Error('فایل انتخابی بکاپ کلی سامانه است. لطفاً فقط فایل بکاپ اختصاصی شرکت را انتخاب کنید.');
  }

  let extractedState = null;
  let sourceCompanyId = null;
  let sourceCompanyName = null;

  if (parsed.formatVersion && parsed.state && typeof parsed.state === 'object') {
    if (parsed.checksumSha256) {
      const actualHash = computeCanonicalSha256(parsed.state);
      if (actualHash !== parsed.checksumSha256) {
        throw new Error('کنترل اصالت (SHA-256) فایل پشتیبان ناموفق بود؛ فایل تغییر یافته یا آسیب دیده است.');
      }
    }
    extractedState = parsed.state;
    sourceCompanyId = parsed.companyId || parsed.state.companyId || null;
    sourceCompanyName = parsed.companyName || parsed.state.companyName || null;
  } else if (Array.isArray(parsed.chartOfAccounts) || Array.isArray(parsed.items) || Array.isArray(parsed.vouchers)) {
    // Legacy per-company direct JSON download compatibility
    extractedState = parsed;
    sourceCompanyId = parsed.companyId || null;
    sourceCompanyName = parsed.companyName || null;
  } else {
    throw new Error('فایل پشتیبان ساختار معتبر حسابداری شرکتی ندارد.');
  }

  return {
    state: extractedState,
    sourceCompanyId,
    sourceCompanyName,
    recordCounts: computeCompanyRecordCounts(extractedState),
    checksumSha256: computeCanonicalSha256(extractedState),
  };
}

// Restores a single company snapshot/file strictly into targetCompanyId without touching other companies
export async function restoreIsolatedCompanyBackup({
  backupsRootDir,
  targetCompanyId,
  targetCompanyName,
  settingsCompany = null,
  currentStateForSafetySnapshot = null,
  backupInput,
  allowCrossCompanyImport = false,
  restoredBy = 'system',
  createdDateJalali = '',
  legacyJsonSyncFn = null,
}) {
  const validated = parseAndValidateCompanyBackupPayload(backupInput);

  if (
    validated.sourceCompanyId &&
    validated.sourceCompanyId !== targetCompanyId &&
    !allowCrossCompanyImport
  ) {
    throw new Error(
      `این فایل پشتیبان متعلق به شرکت «${validated.sourceCompanyName || validated.sourceCompanyId}» است و با شرکت فعلی «${targetCompanyName}» مطابقت ندارد.`
    );
  }

  // Take an automatic safety snapshot right before restoring so rollback is always possible
  if (currentStateForSafetySnapshot) {
    await createIsolatedCompanySnapshot({
      backupsRootDir,
      companyId: targetCompanyId,
      companyName: targetCompanyName,
      state: currentStateForSafetySnapshot,
      backupKind: 'pre_restore',
      createdBy: restoredBy,
      createdDateJalali,
    });
  }

  const normalizedRestoredState = {
    ...validated.state,
    companyId: targetCompanyId,
    companyName: targetCompanyName || validated.sourceCompanyName || 'شرکت تولیدی',
  };
  delete normalizedRestoredState.companiesData;

  let finalState = normalizedRestoredState;
  if (isPostgresConfigured()) {
    const pgRes = await saveCompanyErpStateToPg(targetCompanyId, normalizedRestoredState, targetCompanyName, {
      forceReplace: true,
      settingsCompany,
    });
    if (pgRes?.state) {
      finalState = pgRes.state;
    }
  }

  if (typeof legacyJsonSyncFn === 'function') {
    legacyJsonSyncFn(finalState);
  }

  return {
    state: finalState,
    recordCounts: validated.recordCounts,
    checksumSha256: validated.checksumSha256,
  };
}

// Helper for server startup: resolves authoritative company state (PostgreSQL when configured, else JSON fallback)
export async function loadAuthoritativeCompanyErpState({
  companyId,
  companyName,
  settingsCompany,
  legacyState,
}) {
  if (isPostgresConfigured()) {
    const pgState = await getCompanyErpStateFromPg(companyId, companyName, settingsCompany, legacyState);
    if (pgState) return pgState;
  }
  return legacyState;
}
