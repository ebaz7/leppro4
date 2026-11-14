import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {
  sanitizeCompanyFolderName,
  createIsolatedCompanyBackupZipBuffer,
  parseAndValidateCompanyBackupPayload,
} from '../backend/erp-backup-manager.js';

function loadTsModule(relPath, deps = {}) {
  const fullPath = path.resolve(process.cwd(), relPath);
  const tsSource = fs.readFileSync(fullPath, 'utf8');
  const { outputText } = ts.transpileModule(tsSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const customRequire = (spec) => {
    if (deps[spec]) return deps[spec];
    throw new Error(`Unexpected require inside VM: ${spec}`);
  };
  vm.runInNewContext(outputText, {
    module: mod,
    exports: mod.exports,
    require: customRequire,
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    Boolean,
  });
  return mod.exports;
}

const erpCodeUtils = loadTsModule('components/industrial-erp/erpCodeUtils.ts');
const warehouseLogic = loadTsModule('components/industrial-erp/warehouseLogic.ts', {
  './erpCodeUtils': erpCodeUtils,
});

const {
  PRODUCTION_FLOOR_WAREHOUSE_ID,
  ensureProductionFloorWarehouse,
  canDeleteWarehouse,
  validateCartonForSalesRemittance,
  validateCartonForTransfer,
  buildChronologicalKardex,
  computeBulkStockByKey,
  computeWeightedAverageCosting,
  buildWarehouseAccountingVoucher,
} = warehouseLogic;

test('ensureProductionFloorWarehouse auto-creates wh_production and is idempotent', () => {
  const first = ensureProductionFloorWarehouse([], 'اپراتور خط');
  assert.equal(first.productionWarehouse.id, PRODUCTION_FLOOR_WAREHOUSE_ID);
  assert.equal(first.productionWarehouse.type, 'PRODUCTION_FLOOR');
  assert.equal(first.productionWarehouse.isProductionFloor, true);
  assert.equal(first.warehouses.length, 1);

  const second = ensureProductionFloorWarehouse(
    [
      ...first.warehouses,
      { id: 'wh_main', code: 'W2', name: 'انبار کارخانه', type: 'FINISHED_YARN', location: 'سوله اصلی' },
    ],
    'مدیر'
  );
  assert.equal(second.warehouses.length, 2);
  assert.equal(second.warehouses.filter((w) => w.id === PRODUCTION_FLOOR_WAREHOUSE_ID).length, 1);
});

test('Full 2-step Production -> Production Delivery -> Destination Receipt & Kardex running/final balances', () => {
  const { warehouses } = ensureProductionFloorWarehouse([
    { id: 'wh_main', code: 'WH-02', name: 'انبار کارخانه', type: 'FINISHED_YARN', location: 'سالن اصلی' },
  ]);

  const items = [
    {
      id: 'item_poy',
      code: 'POY-150',
      name: 'نخ POY 150/48',
      category: 'FINISHED_YARN',
      grade: 'A',
      unit: 'KG',
      warehouseId: 'wh_main',
      stockQty: 0,
      unitCost: 2000000,
      salesPrice: 2500000,
    },
  ];

  // Step 0: Opening balance in wh_main: 100 kg @ 1,800,000
  const openingDoc = {
    id: 'doc_open',
    docNo: 'OPN-1',
    archiveCode: '1001',
    docType: 'OPENING_BALANCE',
    dateJalali: '1405/01/01',
    timeExact: '08:00:00',
    targetWarehouseId: 'wh_main',
    targetWarehouseName: 'انبار کارخانه',
    cartonIds: [],
    docItems: [
      {
        id: 'li_open',
        itemId: 'item_poy',
        itemCode: 'POY-150',
        itemName: 'نخ POY 150/48',
        grade: 'A',
        cartonsCount: 4,
        netWeightKg: 100,
        unitCostRials: 1800000,
        totalCostRials: 180000000,
      },
    ],
    status: 'COMPLETED',
    createdBy: 'مدیر',
    createdAtMs: 1770000000000,
  };

  // Step 1: Production performance creates carton in wh_production (50 kg @ 2,000,000)
  const carton1 = {
    id: 'ctn_1',
    serialNumber: '10001',
    referenceCode: 'PO-00001-25',
    productId: 'item_poy',
    productCode: 'POY-150',
    productName: 'نخ POY 150/48',
    grade: 'A',
    grossWeightKg: 26.5,
    netWeightKg: 25,
    conesCount: 6,
    warehouseId: 'wh_main',
    warehouseName: 'انبار کارخانه',
    status: 'IN_STOCK',
    isSalesLocked: false,
    unitCostPerKg: 2000000,
    createdAt: 1770000010000,
  };
  const carton2 = {
    id: 'ctn_2',
    serialNumber: '10002',
    referenceCode: 'PO-00002-25',
    productId: 'item_poy',
    productCode: 'POY-150',
    productName: 'نخ POY 150/48',
    grade: 'A',
    grossWeightKg: 26.5,
    netWeightKg: 25,
    conesCount: 6,
    warehouseId: 'wh_main',
    warehouseName: 'انبار کارخانه',
    status: 'IN_STOCK',
    isSalesLocked: false,
    unitCostPerKg: 2000000,
    createdAt: 1770000010500,
  };

  const prodVoucher = {
    id: 'pv_1',
    voucherNo: '1',
    archiveCode: '1001',
    dateJalali: '1405/08/10',
    timeExact: '10:00:00',
    lineId: 'line_1',
    lineName: 'خط ۱',
    itemId: 'item_poy',
    itemCode: 'POY-150',
    itemName: 'نخ POY 150/48',
    cartonsCount: 2,
    totalGrossWeightKg: 53,
    totalNetWeightKg: 50,
    cartonIds: ['ctn_1', 'ctn_2'],
    productionWarehouseId: PRODUCTION_FLOOR_WAREHOUSE_ID,
    targetWarehouseId: 'wh_main',
    status: 'DELIVERED_TO_WAREHOUSE',
    createdBy: 'اپراتور تولید',
  };

  // Step 2: Production delivery (wh_production -> wh_main)
  const deliveryDoc = {
    id: 'doc_deliv',
    docNo: 'DLV-1',
    archiveCode: '1002',
    docType: 'PRODUCTION_DELIVERY',
    dateJalali: '1405/08/10',
    timeExact: '11:00:00',
    sourceWarehouseId: PRODUCTION_FLOOR_WAREHOUSE_ID,
    sourceWarehouseName: 'انبار تولید (پای خط)',
    targetWarehouseId: 'wh_main',
    targetWarehouseName: 'انبار کارخانه',
    productionVoucherId: 'pv_1',
    cartonIds: ['ctn_1', 'ctn_2'],
    status: 'COMPLETED',
    createdBy: 'اپراتور تولید',
    createdAtMs: 1770000020000,
  };

  // Step 3: Destination warehouse receipt into wh_main
  const receiptDoc = {
    id: 'doc_rcpt',
    docNo: 'RCP-1',
    archiveCode: '1003',
    docType: 'RECEIPT_PRODUCTION',
    dateJalali: '1405/08/10',
    timeExact: '12:00:00',
    sourceWarehouseId: PRODUCTION_FLOOR_WAREHOUSE_ID,
    sourceWarehouseName: 'انبار تولید (پای خط)',
    targetWarehouseId: 'wh_main',
    targetWarehouseName: 'انبار کارخانه',
    productionVoucherId: 'pv_1',
    linkedTransferDocId: 'doc_deliv',
    cartonIds: ['ctn_1', 'ctn_2'],
    status: 'COMPLETED',
    createdBy: 'انباردار',
    createdAtMs: 1770000030000,
  };

  // Step 4: Sales remittance out of wh_main for carton1 (25 kg)
  const salesDoc = {
    id: 'doc_sale',
    docNo: 'SAL-1',
    archiveCode: '1004',
    docType: 'SALES_REMITTANCE',
    dateJalali: '1405/08/11',
    timeExact: '14:00:00',
    sourceWarehouseId: 'wh_main',
    sourceWarehouseName: 'انبار کارخانه',
    partyName: 'مشتری تست',
    cartonIds: ['ctn_1'],
    status: 'COMPLETED',
    createdBy: 'فروش',
    createdAtMs: 1770000040000,
  };

  // Step 5: Manual stock adjustment decrease (-10 kg) on wh_main
  const adjOutDoc = {
    id: 'doc_adj_out',
    docNo: 'ADJ-1',
    archiveCode: '1005',
    docType: 'STOCK_ADJUSTMENT_OUT',
    dateJalali: '1405/08/12',
    timeExact: '16:00:00',
    sourceWarehouseId: 'wh_main',
    sourceWarehouseName: 'انبار کارخانه',
    cartonIds: [],
    docItems: [
      {
        id: 'li_adj',
        itemId: 'item_poy',
        itemCode: 'POY-150',
        itemName: 'نخ POY 150/48',
        grade: 'A',
        cartonsCount: 0,
        netWeightKg: 10,
        unitCostRials: 1850000,
        totalCostRials: 18500000,
      },
    ],
    adjustmentReason: 'کسری انبارگردانی',
    status: 'COMPLETED',
    createdBy: 'انباردار',
    createdAtMs: 1770000050000,
  };

  const allDocs = [openingDoc, deliveryDoc, receiptDoc, salesDoc, adjOutDoc];
  const allCartons = [carton1, carton2];

  // Kardex scoped to wh_production: +50 (production) -50 (delivery) = 0 final
  const prodKardex = buildChronologicalKardex({
    warehouses,
    items,
    productionVouchers: [prodVoucher],
    cartonLabels: allCartons,
    warehouseDocuments: allDocs,
    warehouseFilter: PRODUCTION_FLOOR_WAREHOUSE_ID,
  });
  assert.equal(prodKardex.totalInKg, 50);
  assert.equal(prodKardex.totalOutKg, 50);
  assert.equal(prodKardex.finalBalanceKg, 0);

  // Kardex scoped to wh_main: opening(100) + receipt(50) - sales(25) - adjOut(10) = 115 kg
  const mainKardex = buildChronologicalKardex({
    warehouses,
    items,
    productionVouchers: [prodVoucher],
    cartonLabels: allCartons,
    warehouseDocuments: allDocs,
    warehouseFilter: 'wh_main',
  });
  assert.equal(mainKardex.rows.length, 4);
  assert.equal(mainKardex.rows[0].docType, 'OPENING_BALANCE');
  assert.equal(mainKardex.rows[0].runningBalanceKg, 100);
  assert.equal(mainKardex.rows[1].runningBalanceKg, 150);
  assert.equal(mainKardex.rows[2].runningBalanceKg, 125);
  assert.equal(mainKardex.rows[3].runningBalanceKg, 115);

  assert.equal(mainKardex.openingKg, 100);
  assert.equal(mainKardex.totalInKg, 50);
  assert.equal(mainKardex.totalOutKg, 35);
  assert.equal(
    Number((mainKardex.openingKg + mainKardex.totalInKg - mainKardex.totalOutKg).toFixed(3)),
    mainKardex.finalBalanceKg
  );
  assert.equal(mainKardex.finalBalanceKg, 115);

  // Bulk stock calculation reflects opening(100) - adjOut(10) = 90 kg (carton-tracked docs excluded)
  const bulkMap = computeBulkStockByKey(allDocs, 'wh_main');
  assert.equal(bulkMap.get('item_poy_A').bulkNetKg, 90);

  // WACC costing: opening(100*1.8M = 180M) + receipt(50*2.0M = 100M) = 150kg @ 280M (wacc ~ 1,866,666.67)
  // Out 25kg + 10kg = 35kg => ending 115kg
  const waccRes = computeWeightedAverageCosting({
    warehouses,
    items,
    productionVouchers: [prodVoucher],
    cartonLabels: allCartons,
    warehouseDocuments: allDocs,
    warehouseFilter: 'wh_main',
  });
  assert.equal(waccRes.itemSummaries.length, 1);
  assert.equal(waccRes.itemSummaries[0].endingKg, 115);
  assert.ok(waccRes.itemSummaries[0].waccUnitCostRials > 1800000);

  const accVoucher = buildWarehouseAccountingVoucher({
    nextVoucherNo: 55,
    dateJalali: '1405/08/12',
    createdBy: 'حسابدار',
    description: 'ثبت بهای تمام‌شده',
    totalValueRials: waccRes.totalOutValueRials,
    mode: 'SALES_COGS',
    warehouseName: 'انبار کارخانه',
  });
  const totalDebit = accVoucher.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = accVoucher.lines.reduce((s, l) => s + l.credit, 0);
  assert.equal(totalDebit, totalCredit);
  assert.ok(totalDebit > 0);
});

test('Permanent sales barcode lock rejects already-sold, duplicate reference codes, IN_TRANSIT, and ADJUSTED_OUT cartons', () => {
  const lockedCarton = {
    id: 'c_locked',
    referenceCode: 'PO-00100-24',
    warehouseId: 'wh_main',
    status: 'SOLD',
    isSalesLocked: true,
    lockedByDocNo: 'SAL-101',
    lockedAt: '1405/08/10 12:00',
  };
  const duplicateRefCarton = {
    id: 'c_dup',
    referenceCode: 'PO-00100-24',
    warehouseId: 'wh_main',
    status: 'IN_STOCK',
    isSalesLocked: false,
  };
  const inTransitCarton = {
    id: 'c_transit',
    referenceCode: 'PO-00101-24',
    warehouseId: 'wh_main',
    status: 'IN_TRANSIT',
    isSalesLocked: false,
  };
  const adjustedOutCarton = {
    id: 'c_adj',
    referenceCode: 'PO-00102-24',
    warehouseId: 'wh_main',
    status: 'ADJUSTED_OUT',
    isSalesLocked: false,
  };
  const docReferencedCarton = {
    id: 'c_doc_ref',
    referenceCode: 'PO-00103-24',
    warehouseId: 'wh_main',
    status: 'IN_STOCK',
    isSalesLocked: false,
  };
  const validCarton = {
    id: 'c_ok',
    referenceCode: 'PO-00104-24',
    warehouseId: 'wh_main',
    status: 'IN_STOCK',
    isSalesLocked: false,
  };

  const allCartons = [
    lockedCarton,
    duplicateRefCarton,
    inTransitCarton,
    adjustedOutCarton,
    docReferencedCarton,
    validCarton,
  ];
  const docs = [
    {
      id: 'd1',
      docNo: 'SAL-102',
      docType: 'SALES_REMITTANCE',
      status: 'COMPLETED',
      cartonIds: ['c_doc_ref'],
    },
  ];

  const r1 = validateCartonForSalesRemittance(lockedCarton, allCartons, docs, 'wh_main');
  assert.equal(r1.allowed, false);
  assert.equal(r1.lockedByDocNo, 'SAL-101');

  const r2 = validateCartonForSalesRemittance(duplicateRefCarton, allCartons, docs, 'wh_main');
  assert.equal(r2.allowed, false);
  assert.equal(r2.lockedByDocNo, 'SAL-101');

  const r3 = validateCartonForSalesRemittance(inTransitCarton, allCartons, docs, 'wh_main');
  assert.equal(r3.allowed, false);

  const r4 = validateCartonForSalesRemittance(adjustedOutCarton, allCartons, docs, 'wh_main');
  assert.equal(r4.allowed, false);

  const r5 = validateCartonForSalesRemittance(docReferencedCarton, allCartons, docs, 'wh_main');
  assert.equal(r5.allowed, false);
  assert.equal(r5.lockedByDocNo, 'SAL-102');

  const r6 = validateCartonForSalesRemittance(validCarton, allCartons, docs, 'wh_main');
  assert.equal(r6.allowed, true);

  // Transfer validation blocks wrong source warehouse or locked/in-transit cartons
  assert.equal(validateCartonForTransfer(lockedCarton, 'wh_main').allowed, false);
  assert.equal(validateCartonForTransfer(validCarton, 'wh_other').allowed, false);
  assert.equal(validateCartonForTransfer(validCarton, 'wh_main').allowed, true);
});

test('canDeleteWarehouse prevents deleting warehouses with active cartons or pending docs, allows empty/sold-only warehouses', () => {
  const cartons = [
    { id: 'c1', warehouseId: 'wh_busy', status: 'IN_STOCK' },
    { id: 'c2', warehouseId: 'wh_sold_only', status: 'SOLD' },
  ];
  const docs = [
    {
      id: 'd_pending',
      docNo: 'DLV-9',
      docType: 'PRODUCTION_DELIVERY',
      status: 'PENDING_RECEIPT',
      sourceWarehouseId: 'wh_pending',
      targetWarehouseId: 'wh_empty',
    },
  ];

  assert.equal(canDeleteWarehouse('wh_busy', cartons, docs).allowed, false);
  assert.equal(canDeleteWarehouse('wh_pending', cartons, docs).allowed, false);
  assert.equal(canDeleteWarehouse('wh_empty', cartons, docs).allowed, false);
  assert.equal(canDeleteWarehouse('wh_sold_only', cartons, []).allowed, true);
});

test('Backup ZIP buffer round-trip and Persian folder-name hashing work deterministically', () => {
  const folderA = sanitizeCompanyFolderName('شرکت_لیان_بافت');
  const folderB = sanitizeCompanyFolderName('شرکت_پارس_نخ');
  assert.ok(folderA.startsWith('comp_'));
  assert.ok(folderB.startsWith('comp_'));
  assert.notEqual(folderA, folderB);

  const state = {
    companyId: 'شرکت_لیان_بافت',
    companyName: 'شرکت لیان بافت',
    activeFiscalYear: '1405',
    items: [{ id: 'it1', name: 'نخ', code: 'Y1' }],
    vouchers: [],
  };
  const zipRes = createIsolatedCompanyBackupZipBuffer({
    companyId: state.companyId,
    companyName: state.companyName,
    state,
  });
  assert.ok(Buffer.isBuffer(zipRes.buffer));
  assert.ok(zipRes.filename.endsWith('.zip'));
  assert.ok(zipRes.size > 50);

  const parsed = parseAndValidateCompanyBackupPayload(zipRes.buffer);
  assert.equal(parsed.sourceCompanyId, state.companyId);
  assert.equal(parsed.state.items[0].id, 'it1');
});
