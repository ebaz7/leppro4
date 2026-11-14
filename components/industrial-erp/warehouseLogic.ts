import type {
  ErpWarehouse,
  ErpItem,
  ErpCartonLabel,
  ErpProductionVoucher,
  ErpWarehouseDocument,
  ErpWarehouseDocType,
  ErpVoucher,
  ErpVoucherLine
} from './types';
import { matchesSearchQuery, normalizeFaSearch } from './erpCodeUtils';

export const PRODUCTION_FLOOR_WAREHOUSE_ID = 'wh_production';
export const PRODUCTION_FLOOR_WAREHOUSE_CODE = 'WH-PRD';
export const PRODUCTION_FLOOR_WAREHOUSE_NAME = 'انبار تولید (پای خط)';

export function ensureProductionFloorWarehouse(
  warehouses: ErpWarehouse[] = [],
  operatorName = 'سرپرست تولید'
): { warehouses: ErpWarehouse[]; productionWarehouse: ErpWarehouse } {
  const existing = warehouses.find(
    w =>
      w.id === PRODUCTION_FLOOR_WAREHOUSE_ID ||
      w.isProductionFloor === true ||
      w.type === 'PRODUCTION_FLOOR' ||
      w.code === PRODUCTION_FLOOR_WAREHOUSE_CODE
  );
  if (existing) {
    const normalized: ErpWarehouse = {
      ...existing,
      type: existing.type || 'PRODUCTION_FLOOR',
      isProductionFloor: true
    };
    const nextList = warehouses.map(w => (w.id === existing.id ? normalized : w));
    return { warehouses: nextList, productionWarehouse: normalized };
  }

  const created: ErpWarehouse = {
    id: PRODUCTION_FLOOR_WAREHOUSE_ID,
    code: PRODUCTION_FLOOR_WAREHOUSE_CODE,
    name: PRODUCTION_FLOOR_WAREHOUSE_NAME,
    type: 'PRODUCTION_FLOOR',
    location: 'سالن خطوط تولید',
    managerName: operatorName || 'سرپرست تولید',
    isProductionFloor: true,
    minStockKg: 0,
    assignedGroupIds: []
  };
  return { warehouses: [created, ...warehouses], productionWarehouse: created };
}

export function getWarehouseTypeLabel(type?: ErpWarehouse['type']): string {
  switch (type) {
    case 'PRODUCTION_FLOOR':
      return 'انبار تولید (پای خط)';
    case 'FINISHED_YARN':
      return 'انبار محصول نهایی';
    case 'RAW_MATERIAL':
      return 'انبار مواد اولیه';
    case 'PACKAGING':
      return 'انبار ملزومات و بسته‌بندی';
    case 'WASTE':
      return 'انبار ضایعات و درجه ۳';
    default:
      return 'انبار عمومی / مرکزی';
  }
}

export function getDocTypePersianLabel(type: ErpWarehouseDocType): string {
  switch (type) {
    case 'OPENING_BALANCE':
      return 'سند موجودی ابتدای دوره';
    case 'PRODUCTION_DELIVERY':
      return 'حواله تحویل از خط تولید به انبار';
    case 'RECEIPT_PRODUCTION':
      return 'رسید دریافت کالا از تولید';
    case 'RECEIPT_PURCHASE':
      return 'رسید خرید و ورود مواد/کالا';
    case 'ISSUE_PRODUCTION':
      return 'حواله مصرف و تحویل به خط تولید';
    case 'SALES_REMITTANCE':
      return 'حواله فروش کارخانه (خروج بدون فی)';
    case 'INTER_WH_TRANSFER':
      return 'حواله بین انبار (انتقال)';
    case 'INTER_WH_RECEIPT':
      return 'رسید حواله بین انبار (تایید ورود)';
    case 'SALES_RETURN':
      return 'رسید مرجوعی از فروش';
    case 'STOCK_ADJUSTMENT_IN':
      return 'سند اصلاحی افزایش موجودی انبار';
    case 'STOCK_ADJUSTMENT_OUT':
      return 'سند اصلاحی کاهش موجودی انبار';
    default:
      return String(type);
  }
}

export function canDeleteWarehouse(
  warehouseId: string,
  cartonLabels: ErpCartonLabel[] = [],
  warehouseDocuments: ErpWarehouseDocument[] = []
): { allowed: boolean; reason?: string; activeCartonCount: number; pendingDocsCount: number } {
  const activeCartons = cartonLabels.filter(
    c =>
      c.warehouseId === warehouseId &&
      (c.status === 'IN_STOCK' || c.status === 'RETURNED' || c.status === 'IN_TRANSIT' || !c.status)
  );
  if (activeCartons.length > 0) {
    return {
      allowed: false,
      reason: `این انبار دارای ${activeCartons.length} کارتن موجود یا در حال انتقال است و قابل حذف نیست. ابتدا موجودی آن را منتقل یا تعدیل کنید.`,
      activeCartonCount: activeCartons.length,
      pendingDocsCount: 0
    };
  }

  const pendingDocs = warehouseDocuments.filter(
    d =>
      d.status === 'PENDING_RECEIPT' &&
      (d.sourceWarehouseId === warehouseId || d.targetWarehouseId === warehouseId)
  );
  if (pendingDocs.length > 0) {
    return {
      allowed: false,
      reason: `این انبار دارای ${pendingDocs.length} سند در حال انتظار تایید است و قابل حذف نیست.`,
      activeCartonCount: 0,
      pendingDocsCount: pendingDocs.length
    };
  }

  return { allowed: true, activeCartonCount: 0, pendingDocsCount: 0 };
}

export interface CartonSalesValidationResult {
  allowed: boolean;
  reason?: string;
  lockedByDocNo?: string;
}

export function validateCartonForSalesRemittance(
  carton: ErpCartonLabel | undefined | null,
  allCartons: ErpCartonLabel[] = [],
  warehouseDocuments: ErpWarehouseDocument[] = [],
  sourceWarehouseId?: string
): CartonSalesValidationResult {
  if (!carton) {
    return { allowed: false, reason: 'کارتن با این بارکد یا کد ارجاع در سامانه یافت نشد.' };
  }

  if (carton.isSalesLocked) {
    const docRef = carton.lockedByDocNo || carton.remittanceId || 'ثبت‌شده';
    return {
      allowed: false,
      lockedByDocNo: docRef,
      reason: `این بارکد/کد ارجاع (${carton.referenceCode}) قبلاً در حواله فروش شماره ${docRef} صادر و به‌صورت دائمی قفل شده است و امکان صدور مجدد ندارد.`
    };
  }

  if (carton.status === 'SOLD' || carton.status === 'REMITTED') {
    const docRef = carton.lockedByDocNo || carton.remittanceId || 'قبلی';
    return {
      allowed: false,
      lockedByDocNo: docRef,
      reason: `کارتن ${carton.referenceCode} قبلاً فروش رفته / حواله خروج (${docRef}) صادر شده و قفل است.`
    };
  }

  if (carton.status === 'IN_TRANSIT') {
    return {
      allowed: false,
      reason: `کارتن ${carton.referenceCode} در وضعیت «در راه / در انتظار تایید ورود انبار مقصد» قرار دارد و قابل فروش نیست.`
    };
  }

  if (carton.status === 'ADJUSTED_OUT' || carton.status === 'VOID') {
    return {
      allowed: false,
      reason: `کارتن ${carton.referenceCode} از موجودی انبار کسر یا ابطال شده است و قابلیت صدور حواله فروش ندارد.`
    };
  }

  // Cross-check active warehouse documents to enforce single-use sales lock
  const normRef = normalizeFaSearch(carton.referenceCode);
  const matchingIds = new Set<string>([carton.id]);
  if (normRef) {
    for (const other of allCartons) {
      if (normalizeFaSearch(other.referenceCode) === normRef) {
        if (
          other.isSalesLocked ||
          other.status === 'SOLD' ||
          other.status === 'REMITTED' ||
          other.remittanceId ||
          other.lockedByDocNo
        ) {
          const docRef = other.lockedByDocNo || other.remittanceId || 'قبلی';
          return {
            allowed: false,
            lockedByDocNo: docRef,
            reason: `کد ارجاع تکراری ${carton.referenceCode} قبلاً در حواله فروش ${docRef} استفاده و قفل شده است.`
          };
        }
        matchingIds.add(other.id);
      }
    }
  }

  // Check if a non-cancelled SALES_REMITTANCE references this carton without a subsequent SALES_RETURN unlocking it
  const salesDocs = warehouseDocuments.filter(
    d =>
      d.status !== 'CANCELLED' &&
      d.docType === 'SALES_REMITTANCE' &&
      Array.isArray(d.cartonIds) &&
      d.cartonIds.some(cid => matchingIds.has(cid))
  );
  if (salesDocs.length > 0 && carton.status !== 'RETURNED') {
    const firstDoc = salesDocs[0];
    return {
      allowed: false,
      lockedByDocNo: firstDoc.docNo,
      reason: `بارکد ${carton.referenceCode} در حواله فروش شماره ${firstDoc.docNo} ثبت و قفل شده است.`
    };
  }

  if (carton.remittanceId || carton.lockedByDocNo) {
    const docRef = carton.lockedByDocNo || carton.remittanceId;
    return {
      allowed: false,
      lockedByDocNo: docRef,
      reason: `بارکد ${carton.referenceCode} به حواله فروش ${docRef} متصل و قفل است.`
    };
  }

  if (sourceWarehouseId && carton.warehouseId !== sourceWarehouseId) {
    return {
      allowed: false,
      reason: `کارتن ${carton.referenceCode} در انبار مبدا انتخاب‌شده قرار ندارد.`
    };
  }

  return { allowed: true };
}

export function validateCartonForTransfer(
  carton: ErpCartonLabel | undefined | null,
  sourceWarehouseId?: string
): { allowed: boolean; reason?: string } {
  if (!carton) return { allowed: false, reason: 'کارتن یافت نشد.' };
  if (carton.status === 'IN_TRANSIT') {
    return { allowed: false, reason: `کارتن ${carton.referenceCode} هم‌اکنون در حال انتقال است.` };
  }
  if (carton.isSalesLocked || carton.status === 'SOLD' || carton.status === 'REMITTED') {
    return { allowed: false, reason: `کارتن ${carton.referenceCode} حواله فروش خورده و قفل است.` };
  }
  if (carton.status === 'ADJUSTED_OUT' || carton.status === 'VOID') {
    return { allowed: false, reason: `کارتن ${carton.referenceCode} کسر یا ابطال شده است.` };
  }
  if (sourceWarehouseId && carton.warehouseId !== sourceWarehouseId) {
    return { allowed: false, reason: `کارتن ${carton.referenceCode} در انبار مبدا انتخاب‌شده نیست.` };
  }
  return { allowed: true };
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toAsciiDigits(val: unknown): string {
  let s = String(val || '');
  for (let i = 0; i < 10; i++) {
    s = s.split(PERSIAN_DIGITS[i]).join(String(i));
    s = s.split(ARABIC_DIGITS[i]).join(String(i));
  }
  return s;
}

export function parseJalaliSortKey(dateJalali?: string, timeExact?: string, createdAtMs?: number): number {
  if (typeof createdAtMs === 'number' && Number.isFinite(createdAtMs) && createdAtMs > 100000000000) {
    return createdAtMs;
  }
  const dateClean = toAsciiDigits(dateJalali).replace(/[^0-9/]/g, '');
  const parts = dateClean.split('/').filter(Boolean).map(p => parseInt(p, 10) || 0);
  const y = parts[0] || 1405;
  const m = parts[1] || 1;
  const d = parts[2] || 1;

  const timeClean = toAsciiDigits(timeExact).replace(/[^0-9:]/g, '');
  const tParts = timeClean.split(':').filter(Boolean).map(p => parseInt(p, 10) || 0);
  const hh = tParts[0] || 0;
  const mm = tParts[1] || 0;
  const ss = tParts[2] || 0;

  return (((y * 100 + m) * 100 + d) * 1000000) + hh * 10000 + mm * 100 + ss;
}

export function normalizeGrade(g?: string): 'A' | 'B' | 'C' {
  const up = String(g || 'A').trim().toUpperCase();
  if (up === 'B') return 'B';
  if (up === 'C') return 'C';
  return 'A';
}

export interface KardexMovementRow {
  id: string;
  sortKey: number;
  isOpening: boolean;
  dateJalali: string;
  timeExact: string;
  docNo: string;
  archiveCode: string;
  docType: ErpWarehouseDocType | 'PRODUCTION_VOUCHER';
  txTitle: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  grade: 'A' | 'B' | 'C';
  warehouseLabel: string;
  direction: 'IN' | 'OUT' | 'TRANSFER';
  inCartons: number;
  inNetKg: number;
  outCartons: number;
  outNetKg: number;
  runningBalanceCartons: number;
  runningBalanceKg: number;
  unitCostRials: number;
  lineValueRials: number;
  runningBalanceValueRials: number;
  sampleRefCodes: string[];
  notes?: string;
}

export interface KardexResult {
  rows: KardexMovementRow[];
  openingCartons: number;
  openingKg: number;
  totalInCartons: number;
  totalInKg: number;
  totalOutCartons: number;
  totalOutKg: number;
  finalBalanceCartons: number;
  finalBalanceKg: number;
  finalBalanceValueRials: number;
}

export function buildChronologicalKardex(params: {
  warehouses: ErpWarehouse[];
  items: ErpItem[];
  productionVouchers: ErpProductionVoucher[];
  cartonLabels: ErpCartonLabel[];
  warehouseDocuments: ErpWarehouseDocument[];
  warehouseFilter?: string;
  gradeFilter?: 'ALL' | 'A' | 'B' | 'C';
  itemFilter?: string;
  searchQuery?: string;
}): KardexResult {
  const {
    warehouses = [],
    items = [],
    productionVouchers = [],
    cartonLabels = [],
    warehouseDocuments = [],
    warehouseFilter = 'ALL',
    gradeFilter = 'ALL',
    itemFilter = 'ALL',
    searchQuery = ''
  } = params;

  const cartonById = new Map<string, ErpCartonLabel>();
  for (const c of cartonLabels) {
    cartonById.set(c.id, c);
  }
  const itemById = new Map<string, ErpItem>();
  for (const it of items) {
    itemById.set(it.id, it);
  }
  const whById = new Map<string, ErpWarehouse>();
  for (const w of warehouses) {
    whById.set(w.id, w);
  }

  type RawMv = Omit<KardexMovementRow, 'runningBalanceCartons' | 'runningBalanceKg' | 'runningBalanceValueRials'> & {
    priority: number;
  };
  const rawList: RawMv[] = [];

  // 1. Production Vouchers (initial entry into production warehouse when line performance is finalized)
  for (let vIdx = 0; vIdx < productionVouchers.length; vIdx++) {
    const v = productionVouchers[vIdx];
    const prodWhId = v.productionWarehouseId || PRODUCTION_FLOOR_WAREHOUSE_ID;
    const voucherCartons = cartonLabels.filter(
      c => (v.cartonIds || []).includes(c.id) || (v.voucherNo && c.productionVoucherNo === v.voucherNo)
    );
    const itemObj = itemById.get(v.itemId) || items.find(i => i.code === v.itemCode);

    // Check legacy vouchers where cartons went straight to another warehouse via RECEIPT_PRODUCTION without PRODUCTION_DELIVERY
    const hasDeliveryDoc =
      Boolean(v.deliveryDocId) ||
      warehouseDocuments.some(d => d.status !== 'CANCELLED' && d.docType === 'PRODUCTION_DELIVERY' && d.productionVoucherId === v.id);
    const legacyReceiptDoc = warehouseDocuments.find(
      d => d.status !== 'CANCELLED' && d.docType === 'RECEIPT_PRODUCTION' && d.productionVoucherId === v.id
    );
    const isLegacyDirectReceipt = !v.productionWarehouseId && !hasDeliveryDoc && Boolean(legacyReceiptDoc);

    // In single-warehouse mode, a legacy direct voucher only affects legacyReceiptDoc.targetWarehouseId via that receipt doc (avoid double entry in receipt wh)
    if (warehouseFilter !== 'ALL') {
      if (isLegacyDirectReceipt) {
        // Handled cleanly by the RECEIPT_PRODUCTION doc in section 2
        continue;
      }
      if (prodWhId !== warehouseFilter) {
        continue;
      }
    }

    const byGrade: Record<'A' | 'B' | 'C', ErpCartonLabel[]> = { A: [], B: [], C: [] };
    for (const c of voucherCartons) {
      byGrade[normalizeGrade(c.grade || itemObj?.grade)].push(c);
    }

    const gradesPresent = (['A', 'B', 'C'] as const).filter(g => byGrade[g].length > 0);
    if (gradesPresent.length === 0) {
      const g = normalizeGrade(itemObj?.grade);
      if (
        (gradeFilter === 'ALL' || g === gradeFilter) &&
        (itemFilter === 'ALL' || v.itemId === itemFilter)
      ) {
        const unitCost = Number(itemObj?.unitCost || 0);
        const netKg = Number(Number(v.totalNetWeightKg || 0).toFixed(3));
        const whName = whById.get(prodWhId)?.name || PRODUCTION_FLOOR_WAREHOUSE_NAME;
        rawList.push({
          id: `prd_${v.id}_${g}`,
          priority: 1,
          sortKey: parseJalaliSortKey(v.dateJalali, v.timeExact, undefined) + vIdx * 0.001,
          isOpening: false,
          dateJalali: v.dateJalali,
          timeExact: v.timeExact,
          docNo: v.voucherNo,
          archiveCode: v.archiveCode,
          docType: 'PRODUCTION_VOUCHER',
          txTitle: `تولید خط (${v.lineName}) — ورود به ${whName}`,
          itemId: v.itemId,
          itemCode: v.itemCode,
          itemName: v.itemName,
          grade: g,
          warehouseLabel: whName,
          direction: 'IN',
          inCartons: Number(v.cartonsCount || 0),
          inNetKg: netKg,
          outCartons: 0,
          outNetKg: 0,
          unitCostRials: unitCost,
          lineValueRials: Math.round(netKg * unitCost),
          sampleRefCodes: []
        });
      }
    } else {
      for (const g of gradesPresent) {
        if (gradeFilter !== 'ALL' && g !== gradeFilter) continue;
        if (itemFilter !== 'ALL' && v.itemId !== itemFilter) continue;
        const list = byGrade[g];
        const netKg = Number(list.reduce((s, c) => s + Number(c.netWeightKg || 0), 0).toFixed(3));
        const unitCost = Number(list[0]?.unitCostPerKg || itemObj?.unitCost || 0);
        const whName = whById.get(prodWhId)?.name || PRODUCTION_FLOOR_WAREHOUSE_NAME;
        const maxCreated = list.reduce((mx, c) => Math.max(mx, Number(c.createdAt) || 0), 0);
        rawList.push({
          id: `prd_${v.id}_${g}`,
          priority: 1,
          sortKey: parseJalaliSortKey(v.dateJalali, v.timeExact, maxCreated || undefined),
          isOpening: false,
          dateJalali: v.dateJalali,
          timeExact: v.timeExact,
          docNo: v.voucherNo,
          archiveCode: v.archiveCode,
          docType: 'PRODUCTION_VOUCHER',
          txTitle: `تولید خط (${v.lineName}) — ورود به ${whName}`,
          itemId: v.itemId,
          itemCode: v.itemCode,
          itemName: v.itemName,
          grade: g,
          warehouseLabel: whName,
          direction: 'IN',
          inCartons: list.length,
          inNetKg: netKg,
          outCartons: 0,
          outNetKg: 0,
          unitCostRials: unitCost,
          lineValueRials: Math.round(netKg * unitCost),
          sampleRefCodes: list.map(c => c.referenceCode)
        });
      }
    }
  }

  // 2. Warehouse Documents
  for (let dIdx = 0; dIdx < warehouseDocuments.length; dIdx++) {
    const d = warehouseDocuments[dIdx];
    if (d.status === 'CANCELLED') continue;

    const isTransferDoc =
      d.docType === 'PRODUCTION_DELIVERY' ||
      d.docType === 'RECEIPT_PRODUCTION' ||
      d.docType === 'INTER_WH_TRANSFER' ||
      d.docType === 'INTER_WH_RECEIPT';

    let direction: 'IN' | 'OUT' | 'TRANSFER';
    if (warehouseFilter === 'ALL') {
      if (isTransferDoc) {
        direction = 'TRANSFER';
      } else if (
        d.docType === 'SALES_REMITTANCE' ||
        d.docType === 'ISSUE_PRODUCTION' ||
        d.docType === 'STOCK_ADJUSTMENT_OUT'
      ) {
        direction = 'OUT';
      } else {
        direction = 'IN';
      }
    } else {
      const touchesSource = d.sourceWarehouseId === warehouseFilter;
      const touchesTarget = d.targetWarehouseId === warehouseFilter;
      if (!touchesSource && !touchesTarget) continue;

      if (d.docType === 'PRODUCTION_DELIVERY' || d.docType === 'INTER_WH_TRANSFER') {
        if (!touchesSource) continue;
        direction = 'OUT';
      } else if (d.docType === 'RECEIPT_PRODUCTION' || d.docType === 'INTER_WH_RECEIPT') {
        if (!touchesTarget) continue;
        direction = 'IN';
      } else if (
        d.docType === 'SALES_REMITTANCE' ||
        d.docType === 'ISSUE_PRODUCTION' ||
        d.docType === 'STOCK_ADJUSTMENT_OUT'
      ) {
        direction = 'OUT';
      } else {
        direction = 'IN';
      }
    }

    const docCartons = (d.cartonIds || [])
      .map(cid => cartonById.get(cid))
      .filter((c): c is ErpCartonLabel => Boolean(c));

    const whLabel = [
      d.sourceWarehouseName ? `از ${d.sourceWarehouseName}` : '',
      d.targetWarehouseName ? `به ${d.targetWarehouseName}` : '',
      d.partyName ? `(${d.partyName})` : ''
    ]
      .filter(Boolean)
      .join(' ');

    const docSortKey = parseJalaliSortKey(d.dateJalali, d.timeExact, d.createdAtMs);
    const isOpening = d.docType === 'OPENING_BALANCE';
    const priority = isOpening ? 0 : 1;

    if (docCartons.length > 0) {
      const grouped = new Map<
        string,
        { itemId: string; itemCode: string; itemName: string; grade: 'A' | 'B' | 'C'; cartons: ErpCartonLabel[] }
      >();
      for (const c of docCartons) {
        const g = normalizeGrade(c.grade);
        if (gradeFilter !== 'ALL' && g !== gradeFilter) continue;
        if (itemFilter !== 'ALL' && c.productId !== itemFilter) continue;
        const k = `${c.productId}_${g}`;
        const ex = grouped.get(k);
        if (ex) {
          ex.cartons.push(c);
        } else {
          grouped.set(k, {
            itemId: c.productId,
            itemCode: c.productCode,
            itemName: c.productName,
            grade: g,
            cartons: [c]
          });
        }
      }

      grouped.forEach(group => {
        const netKg = Number(group.cartons.reduce((s, c) => s + Number(c.netWeightKg || 0), 0).toFixed(3));
        const cartonsCount = group.cartons.length;
        const unitCost = Number(d.unitCostRials || group.cartons[0]?.unitCostPerKg || itemById.get(group.itemId)?.unitCost || 0);
        rawList.push({
          id: `wh_${d.id}_${group.itemId}_${group.grade}`,
          priority,
          sortKey: docSortKey + (dIdx + 1) * 0.001,
          isOpening,
          dateJalali: d.dateJalali,
          timeExact: d.timeExact,
          docNo: d.docNo,
          archiveCode: d.archiveCode,
          docType: d.docType,
          txTitle: getDocTypePersianLabel(d.docType),
          itemId: group.itemId,
          itemCode: group.itemCode,
          itemName: group.itemName,
          grade: group.grade,
          warehouseLabel: whLabel || 'انبار',
          direction,
          inCartons: direction === 'IN' ? cartonsCount : 0,
          inNetKg: direction === 'IN' ? netKg : 0,
          outCartons: direction === 'OUT' ? cartonsCount : 0,
          outNetKg: direction === 'OUT' ? netKg : 0,
          unitCostRials: unitCost,
          lineValueRials: Math.round(netKg * unitCost),
          sampleRefCodes: group.cartons.map(c => c.referenceCode),
          notes: d.notes || d.adjustmentReason
        });
      });
    } else if (Array.isArray(d.docItems) && d.docItems.length > 0) {
      for (const line of d.docItems) {
        const g = normalizeGrade(line.grade);
        if (gradeFilter !== 'ALL' && g !== gradeFilter) continue;
        if (itemFilter !== 'ALL' && line.itemId !== itemFilter) continue;
        const netKg = Number(Number(line.netWeightKg || 0).toFixed(3));
        const cartonsCount = Number(line.cartonsCount || 0);
        const unitCost = Number(line.unitCostRials ?? d.unitCostRials ?? itemById.get(line.itemId)?.unitCost ?? 0);
        rawList.push({
          id: `wh_line_${d.id}_${line.id}`,
          priority,
          sortKey: docSortKey + (dIdx + 1) * 0.001,
          isOpening,
          dateJalali: d.dateJalali,
          timeExact: d.timeExact,
          docNo: d.docNo,
          archiveCode: d.archiveCode,
          docType: d.docType,
          txTitle: getDocTypePersianLabel(d.docType),
          itemId: line.itemId,
          itemCode: line.itemCode,
          itemName: line.itemName,
          grade: g,
          warehouseLabel: whLabel || 'انبار',
          direction,
          inCartons: direction === 'IN' ? cartonsCount : 0,
          inNetKg: direction === 'IN' ? netKg : 0,
          outCartons: direction === 'OUT' ? cartonsCount : 0,
          outNetKg: direction === 'OUT' ? netKg : 0,
          unitCostRials: unitCost,
          lineValueRials: Math.round(line.totalCostRials ?? netKg * unitCost),
          sampleRefCodes: [],
          notes: line.notes || d.notes || d.adjustmentReason
        });
      }
    }
  }

  // Sort chronologically ascending (oldest / opening balance first -> latest at bottom)
  rawList.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.sortKey - b.sortKey;
  });

  let runningCartons = 0;
  let runningKg = 0;
  let runningValueRials = 0;

  let openingCartons = 0;
  let openingKg = 0;
  let totalInCartons = 0;
  let totalInKg = 0;
  let totalOutCartons = 0;
  let totalOutKg = 0;

  const withBalances: KardexMovementRow[] = rawList.map(mv => {
    if (mv.direction === 'IN') {
      runningCartons += mv.inCartons;
      runningKg = Number((runningKg + mv.inNetKg).toFixed(3));
      runningValueRials += mv.lineValueRials;
      if (mv.isOpening) {
        openingCartons += mv.inCartons;
        openingKg = Number((openingKg + mv.inNetKg).toFixed(3));
      } else {
        totalInCartons += mv.inCartons;
        totalInKg = Number((totalInKg + mv.inNetKg).toFixed(3));
      }
    } else if (mv.direction === 'OUT') {
      runningCartons -= mv.outCartons;
      runningKg = Number((runningKg - mv.outNetKg).toFixed(3));
      runningValueRials -= mv.lineValueRials;
      totalOutCartons += mv.outCartons;
      totalOutKg = Number((totalOutKg + mv.outNetKg).toFixed(3));
    }

    return {
      ...mv,
      runningBalanceCartons: runningCartons,
      runningBalanceKg: runningKg,
      runningBalanceValueRials: Math.round(runningValueRials)
    };
  });

  const filteredRows = searchQuery.trim()
    ? withBalances.filter(mv =>
        matchesSearchQuery(searchQuery, [
          mv.docNo,
          mv.archiveCode,
          mv.itemCode,
          mv.itemName,
          mv.txTitle,
          mv.warehouseLabel,
          mv.grade,
          mv.notes,
          ...mv.sampleRefCodes
        ])
      )
    : withBalances;

  return {
    rows: filteredRows,
    openingCartons,
    openingKg,
    totalInCartons,
    totalInKg,
    totalOutCartons,
    totalOutKg,
    finalBalanceCartons: runningCartons,
    finalBalanceKg: runningKg,
    finalBalanceValueRials: Math.round(runningValueRials)
  };
}

export interface BulkStockAdjustmentSummary {
  itemId: string;
  grade: 'A' | 'B' | 'C';
  warehouseId: string;
  bulkCartons: number;
  bulkNetKg: number;
  totalValueRials: number;
}

export function computeBulkStockByKey(
  warehouseDocuments: ErpWarehouseDocument[] = [],
  warehouseFilter = 'ALL'
): Map<string, BulkStockAdjustmentSummary> {
  const map = new Map<string, BulkStockAdjustmentSummary>();

  for (const d of warehouseDocuments) {
    if (d.status === 'CANCELLED') continue;
    if ((d.cartonIds || []).length > 0) continue; // Carton-tracked docs are represented by cartonLabels
    if (!Array.isArray(d.docItems) || d.docItems.length === 0) continue;

    const isOut =
      d.docType === 'SALES_REMITTANCE' ||
      d.docType === 'ISSUE_PRODUCTION' ||
      d.docType === 'STOCK_ADJUSTMENT_OUT';
    const whId = isOut ? d.sourceWarehouseId || '' : d.targetWarehouseId || '';
    if (warehouseFilter !== 'ALL' && whId !== warehouseFilter) continue;

    for (const line of d.docItems) {
      const g = normalizeGrade(line.grade);
      const key = `${line.itemId}_${g}`;
      const sign = isOut ? -1 : 1;
      const netKg = Number(line.netWeightKg || 0) * sign;
      const cartons = Number(line.cartonsCount || 0) * sign;
      const val = Number(line.totalCostRials ?? Math.round((line.netWeightKg || 0) * (line.unitCostRials || 0))) * sign;

      const cur = map.get(key) || {
        itemId: line.itemId,
        grade: g,
        warehouseId: whId,
        bulkCartons: 0,
        bulkNetKg: 0,
        totalValueRials: 0
      };
      cur.bulkCartons += cartons;
      cur.bulkNetKg = Number((cur.bulkNetKg + netKg).toFixed(3));
      cur.totalValueRials += Math.round(val);
      map.set(key, cur);
    }
  }

  return map;
}

export interface WaccItemSummary {
  item: ErpItem;
  grade: 'A' | 'B' | 'C';
  openingKg: number;
  openingValueRials: number;
  inKg: number;
  inValueRials: number;
  outKg: number;
  outValueRials: number;
  endingKg: number;
  waccUnitCostRials: number;
  endingValueRials: number;
}

export function computeWeightedAverageCosting(params: {
  warehouses: ErpWarehouse[];
  items: ErpItem[];
  productionVouchers: ErpProductionVoucher[];
  cartonLabels: ErpCartonLabel[];
  warehouseDocuments: ErpWarehouseDocument[];
  warehouseFilter?: string;
}): { itemSummaries: WaccItemSummary[]; totalEndingValueRials: number; totalOutValueRials: number } {
  const kardex = buildChronologicalKardex({
    warehouses: params.warehouses,
    items: params.items,
    productionVouchers: params.productionVouchers,
    cartonLabels: params.cartonLabels,
    warehouseDocuments: params.warehouseDocuments,
    warehouseFilter: params.warehouseFilter || 'ALL',
    gradeFilter: 'ALL',
    itemFilter: 'ALL'
  });

  const itemById = new Map<string, ErpItem>();
  params.items.forEach(it => itemById.set(it.id, it));

  const bucketMap = new Map<
    string,
    {
      item: ErpItem;
      grade: 'A' | 'B' | 'C';
      openingKg: number;
      openingVal: number;
      inKg: number;
      inVal: number;
      outKg: number;
      outVal: number;
      qty: number;
      val: number;
    }
  >();

  for (const row of kardex.rows) {
    const item = itemById.get(row.itemId);
    if (!item) continue;
    const key = `${row.itemId}_${row.grade}`;
    const b = bucketMap.get(key) || {
      item,
      grade: row.grade,
      openingKg: 0,
      openingVal: 0,
      inKg: 0,
      inVal: 0,
      outKg: 0,
      outVal: 0,
      qty: 0,
      val: 0
    };

    const rate = row.unitCostRials > 0 ? row.unitCostRials : item.unitCost || 0;
    if (row.direction === 'IN') {
      const addVal = Math.round(row.inNetKg * rate);
      b.qty = Number((b.qty + row.inNetKg).toFixed(3));
      b.val += addVal;
      if (row.isOpening) {
        b.openingKg = Number((b.openingKg + row.inNetKg).toFixed(3));
        b.openingVal += addVal;
      } else {
        b.inKg = Number((b.inKg + row.inNetKg).toFixed(3));
        b.inVal += addVal;
      }
    } else if (row.direction === 'OUT') {
      const currentWacc = b.qty > 0 ? b.val / b.qty : rate;
      const issueVal = Math.round(row.outNetKg * currentWacc);
      b.qty = Number((b.qty - row.outNetKg).toFixed(3));
      b.val = Math.max(0, b.val - issueVal);
      b.outKg = Number((b.outKg + row.outNetKg).toFixed(3));
      b.outVal += issueVal;
    }

    bucketMap.set(key, b);
  }

  const summaries: WaccItemSummary[] = [];
  let totalEndingValueRials = 0;
  let totalOutValueRials = 0;

  bucketMap.forEach(b => {
    const wacc = b.qty > 0 ? Math.round(b.val / b.qty) : b.item.unitCost || 0;
    const endVal = Math.max(0, Math.round(b.val));
    totalEndingValueRials += endVal;
    totalOutValueRials += Math.round(b.outVal);
    summaries.push({
      item: b.item,
      grade: b.grade,
      openingKg: b.openingKg,
      openingValueRials: Math.round(b.openingVal),
      inKg: b.inKg,
      inValueRials: Math.round(b.inVal),
      outKg: b.outKg,
      outValueRials: Math.round(b.outVal),
      endingKg: b.qty,
      waccUnitCostRials: wacc,
      endingValueRials: endVal
    });
  });

  return { itemSummaries: summaries, totalEndingValueRials, totalOutValueRials };
}

export function buildWarehouseAccountingVoucher(params: {
  nextVoucherNo: number;
  dateJalali: string;
  createdBy: string;
  description: string;
  totalValueRials: number;
  mode: 'PRODUCTION_RECEIPT' | 'PURCHASE_RECEIPT' | 'SALES_COGS' | 'OPENING_INVENTORY' | 'ADJUSTMENT';
  warehouseName?: string;
}): ErpVoucher {
  const amt = Math.max(0, Math.round(params.totalValueRials));
  const whLabel = params.warehouseName || 'انبار مرکزی';
  const lines: ErpVoucherLine[] = [];

  if (params.mode === 'PRODUCTION_RECEIPT') {
    lines.push(
      {
        id: `vl_wh1_${Date.now()}`,
        accountCode: '1103',
        accountTitle: 'موجودی مواد و کالا (محصول نهایی)',
        tafziliName: whLabel,
        debit: amt,
        credit: 0,
        description: params.description
      },
      {
        id: `vl_wh2_${Date.now()}`,
        accountCode: '6101',
        accountTitle: 'بهای تولید در جریان / جذب تولید',
        tafziliName: whLabel,
        debit: 0,
        credit: amt,
        description: params.description
      }
    );
  } else if (params.mode === 'PURCHASE_RECEIPT') {
    lines.push(
      {
        id: `vl_wh1_${Date.now()}`,
        accountCode: '1103',
        accountTitle: 'موجودی مواد اولیه و کالا',
        tafziliName: whLabel,
        debit: amt,
        credit: 0,
        description: params.description
      },
      {
        id: `vl_wh2_${Date.now()}`,
        accountCode: '2101',
        accountTitle: 'حساب‌های پرداختنی تجاری',
        tafziliName: whLabel,
        debit: 0,
        credit: amt,
        description: params.description
      }
    );
  } else if (params.mode === 'SALES_COGS') {
    lines.push(
      {
        id: `vl_wh1_${Date.now()}`,
        accountCode: '60',
        accountTitle: 'بهای تمام‌شده کالای فروش‌رفته',
        tafziliName: whLabel,
        debit: amt,
        credit: 0,
        description: params.description
      },
      {
        id: `vl_wh2_${Date.now()}`,
        accountCode: '1103',
        accountTitle: 'موجودی مواد و کالا',
        tafziliName: whLabel,
        debit: 0,
        credit: amt,
        description: params.description
      }
    );
  } else if (params.mode === 'OPENING_INVENTORY') {
    lines.push(
      {
        id: `vl_wh1_${Date.now()}`,
        accountCode: '1103',
        accountTitle: 'موجودی مواد و کالا (ابتدای دوره)',
        tafziliName: whLabel,
        debit: amt,
        credit: 0,
        description: params.description
      },
      {
        id: `vl_wh2_${Date.now()}`,
        accountCode: '3101',
        accountTitle: 'تراز افتتاحیه دوره مالی',
        tafziliName: whLabel,
        debit: 0,
        credit: amt,
        description: params.description
      }
    );
  } else {
    lines.push(
      {
        id: `vl_wh1_${Date.now()}`,
        accountCode: '1103',
        accountTitle: 'موجودی مواد و کالا (تعدیل انبار)',
        tafziliName: whLabel,
        debit: amt,
        credit: 0,
        description: params.description
      },
      {
        id: `vl_wh2_${Date.now()}`,
        accountCode: '70',
        accountTitle: 'کسر و اضافات انبار',
        tafziliName: whLabel,
        debit: 0,
        credit: amt,
        description: params.description
      }
    );
  }

  return {
    id: `vch_wh_${Date.now()}`,
    voucherNo: params.nextVoucherNo,
    dateJalali: params.dateJalali,
    type: 'PRODUCTION',
    status: 'FINALIZED',
    description: params.description,
    createdBy: params.createdBy,
    createdAt: Date.now(),
    lines
  };
}
