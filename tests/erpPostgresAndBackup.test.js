import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { mergeConcurrentErpStates } from '../backend/erp-pg-repository.js';
import {
  createIsolatedCompanySnapshot,
  listIsolatedCompanySnapshots,
  createIsolatedCompanyBackupZip,
  parseAndValidateCompanyBackupPayload,
  restoreIsolatedCompanyBackup,
  getCompanyBackupDir,
} from '../backend/erp-backup-manager.js';

const makeTempBackupsDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'delkam-erp-test-'));

const makeCompanyState = (companyId, companyName, extras = {}) => ({
  companyId,
  companyName,
  activeFiscalYear: '1405',
  productionLines: [{ id: `${companyId}_line_1`, code: 'L1', name: 'خط ۱', machineType: 'DTY', supervisorName: 'تست', isActive: true }],
  commodityGroups: [],
  warehouses: [{ id: `${companyId}_wh_1`, code: 'W1', name: 'انبار محصول', type: 'FINISHED_YARN', location: 'سوله ۱' }],
  items: [{ id: `${companyId}_item_1`, code: 'IT-1', name: `نخ ${companyName}`, category: 'FINISHED_YARN', unit: 'KG', warehouseId: `${companyId}_wh_1`, stockQty: 100, unitCost: 1000, salesPrice: 1200, coneWeightGrams: 110, cartonWeightGrams: 1450, defaultConesPerCarton: 6 }],
  boms: [],
  productionOrders: [],
  cartonLabels: [{ id: `${companyId}_ctn_1`, serialNumber: '10001', referenceCode: `REF-${companyId}-1`, productId: `${companyId}_item_1`, productName: `نخ ${companyName}`, grossWeightKg: 25.5, netWeightKg: 23.39, status: 'IN_STOCK' }],
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
  chartOfAccounts: [{ id: `${companyId}_acc_1`, code: '1101', title: 'موجودی نقد', group: 'ASSET', nature: 'DEBIT' }],
  vouchers: [{ id: `${companyId}_vch_1`, voucherNo: 1, dateJalali: '1405/08/20', description: `سند ${companyName}`, lines: [{ accountCode: '1101', debit: 500000, credit: 0 }, { accountCode: '1101', debit: 0, credit: 500000 }] }],
  nextVoucherNo: 2,
  nextCartonSeq: 10002,
  nextSerialCounter: 10002,
  ...extras,
});

test('mergeConcurrentErpStates merges additions from two concurrent operators and honors explicit deletions', () => {
  const serverState = makeCompanyState('comp_a', 'شرکت الف', {
    cartonLabels: [
      { id: 'ctn_1', serialNumber: '10001', netWeightKg: 20 },
      { id: 'ctn_by_op1', serialNumber: '10002', netWeightKg: 21 },
      { id: 'ctn_to_delete', serialNumber: '10003', netWeightKg: 19 },
    ],
    vouchers: [
      { id: 'v1', voucherNo: 1 },
      { id: 'v_by_op1', voucherNo: 2 },
    ],
    nextCartonSeq: 10004,
    nextSerialCounter: 10004,
    nextVoucherNo: 3,
  });

  // Operator 2 loaded revision 5 while Operator 1 saved revision 6 first.
  const incomingFromOp2 = makeCompanyState('comp_a', 'شرکت الف', {
    cartonLabels: [
      { id: 'ctn_1', serialNumber: '10001', netWeightKg: 20 },
      { id: 'ctn_by_op2', serialNumber: '10002', netWeightKg: 22.5 },
    ],
    vouchers: [
      { id: 'v1', voucherNo: 1 },
      { id: 'v_by_op2', voucherNo: 2 },
    ],
    nextCartonSeq: 10003,
    nextSerialCounter: 10003,
    nextVoucherNo: 3,
    _deletedIds: {
      cartonLabels: ['ctn_to_delete'],
    },
  });

  const merged = mergeConcurrentErpStates(serverState, incomingFromOp2, 5, 6);

  const cartonIds = merged.cartonLabels.map((c) => c.id);
  assert.ok(cartonIds.includes('ctn_1'), 'Existing carton retained');
  assert.ok(cartonIds.includes('ctn_by_op1'), 'Operator 1 concurrent carton preserved');
  assert.ok(cartonIds.includes('ctn_by_op2'), 'Operator 2 new carton preserved');
  assert.ok(!cartonIds.includes('ctn_to_delete'), 'Explicitly deleted carton stays deleted');

  const voucherIds = merged.vouchers.map((v) => v.id);
  assert.ok(voucherIds.includes('v_by_op1'));
  assert.ok(voucherIds.includes('v_by_op2'));

  assert.equal(merged.nextCartonSeq, 10004);
  assert.equal(merged.nextSerialCounter, 10004);
  assert.equal(merged._deletedIds, undefined);
});

test('Per-company backups are strictly isolated on disk, compressed, and deduplicated when unchanged', async () => {
  const rootDir = makeTempBackupsDir();
  try {
    const stateA = makeCompanyState('comp_lian', 'لیان بافت');
    const stateB = makeCompanyState('comp_pars', 'پارس نخ');

    const snapA1 = await createIsolatedCompanySnapshot({
      backupsRootDir: rootDir,
      companyId: 'comp_lian',
      companyName: 'لیان بافت',
      state: stateA,
      backupKind: 'auto',
      createdDateJalali: '1405/08/20',
    });
    assert.equal(snapA1.skippedUnchanged, false);
    assert.ok(snapA1.fileName.endsWith('.json.gz'));

    // Auto backup with identical content should be deduplicated
    const snapA2 = await createIsolatedCompanySnapshot({
      backupsRootDir: rootDir,
      companyId: 'comp_lian',
      companyName: 'لیان بافت',
      state: stateA,
      backupKind: 'auto',
      createdDateJalali: '1405/08/20',
    });
    assert.equal(snapA2.skippedUnchanged, true);

    await createIsolatedCompanySnapshot({
      backupsRootDir: rootDir,
      companyId: 'comp_pars',
      companyName: 'پارس نخ',
      state: stateB,
      backupKind: 'manual',
      createdDateJalali: '1405/08/20',
    });

    const listA = await listIsolatedCompanySnapshots(rootDir, 'comp_lian');
    const listB = await listIsolatedCompanySnapshots(rootDir, 'comp_pars');

    assert.equal(listA.length, 1);
    assert.equal(listB.length, 1);
    assert.ok(listA[0].fileName.includes('comp_lian'));
    assert.ok(listB[0].fileName.includes('comp_pars'));

    // Create ZIP for Company A and verify it never contains Company B data
    const zipA = await createIsolatedCompanyBackupZip({
      backupsRootDir: rootDir,
      companyId: 'comp_lian',
      companyName: 'لیان بافت',
      state: stateA,
    });
    const zipBytes = fs.readFileSync(zipA.filePath);
    const parsedZip = parseAndValidateCompanyBackupPayload(zipBytes);
    assert.equal(parsedZip.sourceCompanyId, 'comp_lian');
    assert.equal(parsedZip.state.items[0].id, 'comp_lian_item_1');
    assert.ok(!JSON.stringify(parsedZip.state).includes('comp_pars'));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('Backup validation rejects tampered checksums, full database.json, and cross-company mismatches by default', async () => {
  const rootDir = makeTempBackupsDir();
  try {
    const stateA = makeCompanyState('comp_alpha', 'شرکت آلفا');
    const stateB = makeCompanyState('comp_beta', 'شرکت بتا');

    const snapA = await createIsolatedCompanySnapshot({
      backupsRootDir: rootDir,
      companyId: 'comp_alpha',
      companyName: 'شرکت آلفا',
      state: stateA,
      backupKind: 'manual',
    });

    const rawGz = fs.readFileSync(snapA.filePath);

    // 1. Cross-company restore blocked unless allowCrossCompanyImport = true
    await assert.rejects(
      () =>
        restoreIsolatedCompanyBackup({
          backupsRootDir: rootDir,
          targetCompanyId: 'comp_beta',
          targetCompanyName: 'شرکت بتا',
          currentStateForSafetySnapshot: stateB,
          backupInput: rawGz,
          allowCrossCompanyImport: false,
        }),
      /متعلق به شرکت/
    );

    // 2. Full system database.json rejected
    assert.throws(
      () =>
        parseAndValidateCompanyBackupPayload({
          users: [{ id: '1', username: 'admin' }],
          exitPermits: [],
          paymentOrders: [],
          companiesData: { comp_alpha: stateA },
        }),
      /بکاپ کلی سامانه/
    );

    // 3. Tampered payload fails SHA-256 verification
    const parsedEnvelope = JSON.parse(zlib.gunzipSync(rawGz).toString('utf8'));
    parsedEnvelope.state.nextVoucherNo = 9999;
    assert.throws(() => parseAndValidateCompanyBackupPayload(parsedEnvelope), /SHA-256/);

    // 4. Valid restore into comp_alpha creates pre_restore safety snapshot and leaves comp_beta intact
    const snapB = await createIsolatedCompanySnapshot({
      backupsRootDir: rootDir,
      companyId: 'comp_beta',
      companyName: 'شرکت بتا',
      state: stateB,
      backupKind: 'manual',
    });

    const modifiedA = makeCompanyState('comp_alpha', 'شرکت آلفا', { nextVoucherNo: 77 });
    let syncedToJson = null;
    const restored = await restoreIsolatedCompanyBackup({
      backupsRootDir: rootDir,
      targetCompanyId: 'comp_alpha',
      targetCompanyName: 'شرکت آلفا',
      currentStateForSafetySnapshot: modifiedA,
      backupInput: rawGz,
      restoredBy: 'مدیر تست',
      legacyJsonSyncFn: (s) => {
        syncedToJson = s;
      },
    });

    assert.equal(restored.state.nextVoucherNo, 2);
    assert.equal(syncedToJson.nextVoucherNo, 2);

    const listAlphaAfter = await listIsolatedCompanySnapshots(rootDir, 'comp_alpha');
    assert.ok(listAlphaAfter.some((b) => b.backupKind === 'pre_restore'), 'Safety pre_restore snapshot created for Company Alpha');

    const compBetaDir = getCompanyBackupDir(rootDir, 'comp_beta');
    const compBetaFiles = fs.readdirSync(compBetaDir);
    assert.deepEqual(compBetaFiles, [snapB.fileName], 'Company Beta backup folder completely untouched');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('Offline PostgreSQL DDL initializer is 100% idempotent, covers all 26 tables, and contains zero destructive SQL', async () => {
  const { ERP_SCHEMA_DDL_STATEMENTS, applyIdempotentErpSchema } = await import('../scripts/setup-local-postgres-schema.mjs');
  const joined = ERP_SCHEMA_DDL_STATEMENTS.join('\n').toUpperCase();

  assert.ok(!joined.includes('DROP TABLE'), 'Must never DROP tables');
  assert.ok(!joined.includes('TRUNCATE'), 'Must never TRUNCATE tables');
  assert.ok(!joined.includes('DELETE FROM'), 'Must never DELETE rows');
  assert.ok(!joined.includes('DROP DATABASE'), 'Must never DROP databases');

  const expectedTables = [
    'users',
    'erp_companies',
    'erp_production_lines',
    'erp_commodity_groups',
    'erp_warehouses',
    'erp_items',
    'erp_boms',
    'erp_production_orders',
    'erp_carton_labels',
    'erp_production_vouchers',
    'erp_warehouse_documents',
    'erp_warehouse_legacy_docs',
    'erp_sales_orders',
    'erp_remittances',
    'erp_trade_docs',
    'erp_parties',
    'erp_bank_accounts',
    'erp_cheque_books',
    'erp_treasury_docs',
    'erp_employees',
    'erp_payroll_slips',
    'erp_fixed_assets',
    'erp_chart_of_accounts',
    'erp_vouchers',
    'erp_voucher_lines',
    'erp_company_backups',
  ];

  for (const tbl of expectedTables) {
    assert.ok(
      joined.includes(`CREATE TABLE IF NOT EXISTS ${tbl.toUpperCase()}`),
      `Missing idempotent CREATE TABLE IF NOT EXISTS for ${tbl}`
    );
  }

  const executed = [];
  let released = false;
  const fakePool = {
    connect: async () => ({
      query: async (sql) => {
        executed.push(sql);
        return { rows: [] };
      },
      release: () => {
        released = true;
      },
    }),
  };

  const res = await applyIdempotentErpSchema(fakePool);
  assert.equal(res.appliedStatements, ERP_SCHEMA_DDL_STATEMENTS.length);
  assert.equal(executed[0], 'BEGIN');
  assert.equal(executed[executed.length - 1], 'COMMIT');
  assert.equal(released, true);
});

test('Windows install-drive PostgreSQL script protects C: drive, existing .env/pgdata, and organizational SQL processes', () => {
  const ps1 = fs.readFileSync(path.join(process.cwd(), 'scripts', 'setup-local-postgres.ps1'), 'utf8');
  const bat = fs.readFileSync(path.join(process.cwd(), 'manager.bat'), 'utf8');

  assert.ok(!/[^\x00-\x7F]/.test(ps1), 'setup-local-postgres.ps1 must stay strictly 7-bit ASCII for Windows PowerShell 5.1 localization safety');
  assert.ok(ps1.includes('Invoke-PsqlStdin'), 'Uses stdin pipe for psql commands to avoid PS 5.1 quote mangling');
  assert.ok(ps1.includes('$env:TEMP = $PgTempDir'), 'Temp directory redirected to install drive');
  assert.ok(ps1.includes('PG_VERSION'), 'Checks PG_VERSION before initdb so existing pgdata is never overwritten');
  assert.ok(ps1.includes('5439'), 'Uses dedicated isolated port 5439 to avoid colliding with organizational SQL');
  assert.ok(!ps1.includes('taskkill') && !ps1.toLowerCase().includes('stop-process -name postgres'), 'Never kills global postgres processes');

  assert.ok(bat.includes('set "TEMP=%cd%\\pgtemp"'), 'manager.bat redirects TEMP to install drive');
  assert.ok(bat.includes('npm_config_logs_dir'), 'manager.bat redirects npm logs off C:');
  assert.ok(bat.includes('--prefer-offline'), 'manager.bat uses offline-safe npm install');
  assert.ok(bat.includes('if not exist .env'), 'manager.bat preserves existing .env on install');
  assert.ok(bat.includes('git rm -r --cached pgdata'), 'manager.bat protects pgdata from git reset');
});
