import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  Printer,
  Search,
  Eye,
  FileText,
  Truck,
  ArrowRightLeft,
  RotateCcw,
  Check,
  X,
  AlertCircle,
  Warehouse as WhIcon,
  Layers,
  BarChart3,
  Hash,
  Download,
  Lock,
  Calculator,
  AlertTriangle,
  SlidersHorizontal,
  PackagePlus,
  BookOpen
} from 'lucide-react';
import {
  ErpSubViewId,
  IndustrialErpState,
  ErpCompanySummary,
  ErpWarehouse,
  ErpCommodityGroup,
  ErpItem,
  ErpCartonLabel,
  ErpProductionVoucher,
  ErpWarehouseDocument,
  ErpWarehouseDocType,
  ErpWarehouseDocItemLine,
  ErpCartonHistoryEvent,
  getTodayJalali,
  getExactTimeNow
} from './types';
import {
  getNextPlainSequentialNumber,
  matchesSearchQuery,
  normalizeFaSearch
} from './erpCodeUtils';
import {
  PRODUCTION_FLOOR_WAREHOUSE_ID,
  PRODUCTION_FLOOR_WAREHOUSE_NAME,
  ensureProductionFloorWarehouse,
  getWarehouseTypeLabel,
  getDocTypePersianLabel,
  canDeleteWarehouse,
  validateCartonForSalesRemittance,
  validateCartonForTransfer,
  buildChronologicalKardex,
  computeBulkStockByKey,
  computeWeightedAverageCosting,
  buildWarehouseAccountingVoucher,
  normalizeGrade
} from './warehouseLogic';
import { saveBlobAndOpenFile } from '../../services/fileService';
import { User } from '../../types';

interface WarehouseModuleViewProps {
  activeSubView: ErpSubViewId;
  selectedCompany?: ErpCompanySummary;
  erpState: IndustrialErpState;
  setErpState?: React.Dispatch<React.SetStateAction<IndustrialErpState | null>>;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
  currentUser?: User;
  showToast?: (type: 'success' | 'error', text: string) => void;
  openSubViewTab?: (subId: ErpSubViewId) => void;
}

const WAREHOUSE_TYPES: Array<{ value: ErpWarehouse['type']; label: string }> = [
  { value: 'PRODUCTION_FLOOR', label: 'انبار تولید (پای خط)' },
  { value: 'FINISHED_YARN', label: 'انبار محصول نهایی' },
  { value: 'RAW_MATERIAL', label: 'انبار مواد اولیه' },
  { value: 'PACKAGING', label: 'انبار ملزومات و بسته‌بندی' },
  { value: 'WASTE', label: 'انبار ضایعات و درجه ۳' },
  { value: 'GENERAL', label: 'انبار عمومی / مرکزی' }
];

export const WarehouseModuleView: React.FC<WarehouseModuleViewProps> = ({
  activeSubView,
  selectedCompany,
  erpState,
  persistErpState,
  currentUser,
  showToast,
  openSubViewTab
}) => {
  const warehouses: ErpWarehouse[] = useMemo(() => erpState.warehouses || [], [erpState.warehouses]);
  const nonProductionWarehouses: ErpWarehouse[] = useMemo(
    () =>
      warehouses.filter(
        w => w.id !== PRODUCTION_FLOOR_WAREHOUSE_ID && w.type !== 'PRODUCTION_FLOOR' && !w.isProductionFloor
      ),
    [warehouses]
  );
  const groups: ErpCommodityGroup[] = useMemo(() => erpState.commodityGroups || [], [erpState.commodityGroups]);
  const warehouseDocs: ErpWarehouseDocument[] = useMemo(
    () => erpState.warehouseDocuments || [],
    [erpState.warehouseDocuments]
  );
  const allCartons: ErpCartonLabel[] = useMemo(() => erpState.cartonLabels || [], [erpState.cartonLabels]);
  const allItems: ErpItem[] = useMemo(() => erpState.items || [], [erpState.items]);
  const actorName = currentUser?.fullName || 'مسئول انبار';

  const csvDownload = async (fileName: string, headers: string[], rows: Array<Array<string | number>>) => {
    const escapeCell = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csvBody =
      '\uFEFF' + [headers.map(escapeCell).join(','), ...rows.map(r => r.map(escapeCell).join(','))].join('\n');
    const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8;' });
    await saveBlobAndOpenFile(blob, fileName);
  };

  // -------------------------------------------------------------
  // 1. SUBVIEW: WH_WAREHOUSES (تعریف، ویرایش و حذف ایمن انبارها)
  // -------------------------------------------------------------
  const [showAddWhModal, setShowAddWhModal] = useState(false);
  const [whForm, setWhForm] = useState<Partial<ErpWarehouse>>({
    code: '',
    name: '',
    type: 'FINISHED_YARN',
    location: '',
    managerName: '',
    minStockKg: 0,
    assignedGroupIds: []
  });
  const [confirmDeleteWhId, setConfirmDeleteWhId] = useState<string | null>(null);
  const [whDeleteError, setWhDeleteError] = useState<string | null>(null);

  const handleSaveWarehouse = async () => {
    if (!whForm.name?.trim() || !whForm.code?.trim()) {
      showToast?.('error', 'لطفاً کد و نام انبار را وارد نمایید');
      return;
    }
    const duplicateCode = warehouses.find(
      w => w.id !== whForm.id && normalizeFaSearch(w.code) === normalizeFaSearch(whForm.code)
    );
    if (duplicateCode) {
      showToast?.('error', `کد انبار «${whForm.code}» قبلاً برای انبار «${duplicateCode.name}» ثبت شده است.`);
      return;
    }

    const newWh: ErpWarehouse = {
      id: whForm.id || `wh_${Date.now()}`,
      code: whForm.code.trim(),
      name: whForm.name.trim(),
      type: whForm.type || 'FINISHED_YARN',
      location: (whForm.location || '').trim(),
      managerName: (whForm.managerName || '').trim(),
      isProductionFloor: Boolean(whForm.isProductionFloor || whForm.type === 'PRODUCTION_FLOOR'),
      minStockKg: Math.max(0, Number(whForm.minStockKg || 0)),
      assignedGroupIds: whForm.assignedGroupIds || []
    };

    const exists = warehouses.some(w => w.id === newWh.id);
    const updated = exists ? warehouses.map(w => (w.id === newWh.id ? newWh : w)) : [...warehouses, newWh];
    await persistErpState({ ...erpState, warehouses: updated }, exists ? 'مشخصات انبار بروزرسانی شد' : 'انبار جدید با موفقیت ثبت شد');
    setShowAddWhModal(false);
    setWhForm({ code: '', name: '', type: 'FINISHED_YARN', location: '', managerName: '', minStockKg: 0, assignedGroupIds: [] });
  };

  const handleConfirmDeleteWarehouse = async (wh: ErpWarehouse) => {
    const check = canDeleteWarehouse(wh.id, allCartons, warehouseDocs);
    if (!check.allowed) {
      setWhDeleteError(check.reason || 'این انبار قابل حذف نیست.');
      showToast?.('error', check.reason || 'انبار قابل حذف نیست');
      setConfirmDeleteWhId(null);
      return;
    }
    const updated = warehouses.filter(w => w.id !== wh.id);
    await persistErpState({ ...erpState, warehouses: updated }, `انبار «${wh.name}» حذف گردید.`);
    setConfirmDeleteWhId(null);
    setWhDeleteError(null);
  };

  const handleEnsureProdWarehouse = async () => {
    const { warehouses: nextWhs, productionWarehouse } = ensureProductionFloorWarehouse(warehouses, actorName);
    await persistErpState({ ...erpState, warehouses: nextWhs }, `«${productionWarehouse.name}» فعال و آماده است.`);
  };

  // -------------------------------------------------------------
  // 2. SUBVIEW: WH_OPENING_BALANCE (ثبت موجودی ابتدای دوره انبار)
  // -------------------------------------------------------------
  const [openingWhId, setOpeningWhId] = useState<string>('');
  const [openingItemId, setOpeningItemId] = useState<string>('');
  const [openingGrade, setOpeningGrade] = useState<'A' | 'B' | 'C'>('A');
  const [openingCartons, setOpeningCartons] = useState<number>(0);
  const [openingWeightKg, setOpeningWeightKg] = useState<number>(0);
  const [openingUnitCost, setOpeningUnitCost] = useState<number>(0);
  const [openingDate, setOpeningDate] = useState<string>(getTodayJalali());
  const [openingNotes, setOpeningNotes] = useState<string>('ثبت موجودی اول دوره انبار');
  const [openingGenerateCartons, setOpeningGenerateCartons] = useState<boolean>(false);

  useEffect(() => {
    if (!openingWhId && warehouses.length > 0) setOpeningWhId(warehouses[0].id);
  }, [warehouses, openingWhId]);

  useEffect(() => {
    if (!openingItemId && allItems.length > 0) {
      setOpeningItemId(allItems[0].id);
      setOpeningUnitCost(allItems[0].unitCost || 0);
    }
  }, [allItems, openingItemId]);

  const openingDocs = useMemo(
    () => warehouseDocs.filter(d => d.docType === 'OPENING_BALANCE' && d.status !== 'CANCELLED'),
    [warehouseDocs]
  );

  const handleRegisterOpeningBalance = async () => {
    const wh = warehouses.find(w => w.id === openingWhId);
    const item = allItems.find(i => i.id === openingItemId);
    if (!wh) {
      showToast?.('error', 'لطفاً انبار مورد نظر را انتخاب نمایید');
      return;
    }
    if (!item) {
      showToast?.('error', 'لطفاً کالا را انتخاب نمایید');
      return;
    }
    if (openingWeightKg <= 0) {
      showToast?.('error', 'وزن خالص موجودی ابتدای دوره باید بیشتر از صفر باشد');
      return;
    }

    const dateToday = openingDate.trim() || getTodayJalali();
    const exactTime = getExactTimeNow();
    const docNo = getNextPlainSequentialNumber(warehouseDocs.map(d => d.docNo), 1);
    const archiveCode = getNextPlainSequentialNumber(warehouseDocs.map(d => d.archiveCode), 1001);
    const docId = `whdoc_open_${Date.now()}`;
    const rate = Math.max(0, Number(openingUnitCost || item.unitCost || 0));
    const netKg = Number(Number(openingWeightKg).toFixed(3));
    const cartonQty = Math.max(0, Math.round(openingCartons));
    const totalCostRials = Math.round(netKg * rate);

    const createdCartons: ErpCartonLabel[] = [];
    let nextSerialCounter = erpState.nextSerialCounter || 1000;
    if (openingGenerateCartons && cartonQty > 0 && cartonQty <= 200) {
      const avgNet = Number((netKg / cartonQty).toFixed(3));
      const cleanDate = dateToday.replace(/\//g, '').slice(2);
      for (let i = 0; i < cartonQty; i++) {
        nextSerialCounter += 1;
        const thisNet = i === cartonQty - 1 ? Number((netKg - avgNet * (cartonQty - 1)).toFixed(3)) : avgNet;
        const refCode = `OPN-${String(nextSerialCounter).padStart(5, '0')}-${thisNet.toFixed(2)}`;
        createdCartons.push({
          id: `carton_opn_${Date.now()}_${i}`,
          serialNumber: `SN-${cleanDate}-${String(nextSerialCounter).padStart(5, '0')}`,
          referenceCode: refCode,
          qrPayload: `DLKAM-ERP|OPEN|REF:${refCode}|ITEM:${item.code}|NET:${thisNet}KG`,
          productId: item.id,
          productCode: item.code,
          productName: item.name,
          yarnCount: item.yarnCount || '150/48',
          colorName: item.colorName || 'سفید',
          lotNumber: `OPN-${docNo}`,
          machineCode: 'اول دوره',
          shift: 'ابتدای دوره',
          grade: openingGrade,
          grossWeightKg: Number((thisNet + 1.8).toFixed(3)),
          conesCount: item.defaultConesPerCarton || 6,
          coneWeightGrams: item.coneWeightGrams || 110,
          cartonWeightGrams: item.cartonWeightGrams || 1450,
          totalTareKg: 1.8,
          netWeightKg: thisNet,
          unitCostPerKg: rate,
          totalCostRials: Math.round(thisNet * rate),
          warehouseId: wh.id,
          status: 'IN_STOCK',
          isSalesLocked: false,
          openingDocId: docId,
          isOpeningLot: true,
          createdAt: Date.now() - 86400000,
          createdDateJalali: dateToday,
          createdTimeExact: exactTime,
          createdBy: actorName,
          history: [
            {
              id: `hist_opn_${Date.now()}_${i}`,
              stage: 'OPENING_BALANCE',
              title: `موجودی ابتدای دوره در ${wh.name}`,
              dateJalali: dateToday,
              timeExact: exactTime,
              actor: actorName,
              details: `سند ابتدای دوره ${docNo} | درجه ${openingGrade} | وزن ${thisNet} Kg`,
              docNo,
              archiveCode
            }
          ]
        });
      }
    }

    const line: ErpWarehouseDocItemLine = {
      id: `line_opn_${Date.now()}`,
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      grade: openingGrade,
      cartonsCount: cartonQty,
      grossWeightKg: netKg,
      netWeightKg: netKg,
      unitCostRials: rate,
      totalCostRials,
      notes: openingNotes
    };

    const newDoc: ErpWarehouseDocument = {
      id: docId,
      docNo,
      archiveCode,
      docType: 'OPENING_BALANCE',
      dateJalali: dateToday,
      timeExact: exactTime,
      createdAtMs: Date.now() - 3600000,
      targetWarehouseId: wh.id,
      targetWarehouseName: wh.name,
      cartonIds: createdCartons.map(c => c.id),
      docItems: [line],
      cartonsCount: cartonQty,
      totalGrossWeightKg: netKg,
      totalNetWeightKg: netKg,
      unitCostRials: rate,
      totalCostRials,
      status: 'COMPLETED',
      createdBy: actorName,
      notes: openingNotes || `ابتدای دوره ${item.name} در ${wh.name}`
    };

    await persistErpState(
      {
        ...erpState,
        cartonLabels: [...createdCartons, ...allCartons],
        warehouseDocuments: [newDoc, ...warehouseDocs],
        nextSerialCounter
      },
      `سند موجودی ابتدای دوره ${docNo} برای «${wh.name}» (${netKg} Kg) ثبت شد.`
    );
    setOpeningCartons(0);
    setOpeningWeightKg(0);
  };

  // -------------------------------------------------------------
  // 3. WH_PRODUCTION_DELIVERY & 4. WH_RECEIPT_PRODUCTION (دو مرحله ای با انبار تولید)
  // -------------------------------------------------------------
  const [deliveryTargetWhId, setDeliveryTargetWhId] = useState<string>('');
  const [deliveryDriver, setDeliveryDriver] = useState<string>('');
  const [deliveryPlate, setDeliveryPlate] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [targetWhForReceipt, setTargetWhForReceipt] = useState<string>('');

  useEffect(() => {
    if (!deliveryTargetWhId && nonProductionWarehouses.length > 0) {
      setDeliveryTargetWhId(nonProductionWarehouses[0].id);
    }
    if (!targetWhForReceipt && nonProductionWarehouses.length > 0) {
      setTargetWhForReceipt(nonProductionWarehouses[0].id);
    }
  }, [nonProductionWarehouses, deliveryTargetWhId, targetWhForReceipt]);

  // Vouchers standing inside Production Floor Warehouse waiting to be delivered to a destination warehouse
  const vouchersInProductionWh = useMemo(() => {
    return (erpState.productionVouchers || []).filter(
      v => v.status === 'IN_PRODUCTION_WAREHOUSE' || v.status === 'PENDING_WAREHOUSE_DELIVERY'
    );
  }, [erpState.productionVouchers]);

  // Delivery documents sent from Production Warehouse awaiting destination keeper's receipt confirmation
  const pendingProductionDeliveryDocs = useMemo(() => {
    return warehouseDocs.filter(
      d => d.docType === 'PRODUCTION_DELIVERY' && d.status === 'PENDING_RECEIPT'
    );
  }, [warehouseDocs]);

  const handleIssueProductionDelivery = async (voucher: ErpProductionVoucher) => {
    const targetWh = warehouses.find(w => w.id === deliveryTargetWhId);
    if (!targetWh || targetWh.id === PRODUCTION_FLOOR_WAREHOUSE_ID || targetWh.type === 'PRODUCTION_FLOOR') {
      showToast?.('error', 'لطفاً یک انبار مقصد غیر از انبار تولید انتخاب نمایید');
      return;
    }

    const { warehouses: nextWarehouses, productionWarehouse } = ensureProductionFloorWarehouse(warehouses, actorName);
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const docNo = getNextPlainSequentialNumber(warehouseDocs.map(d => d.docNo), 1);
    const archiveCode = getNextPlainSequentialNumber(warehouseDocs.map(d => d.archiveCode), 1001);
    const docId = `whdoc_pdel_${Date.now()}`;

    const cartonIdSet = new Set(voucher.cartonIds || []);
    const updatedCartons = allCartons.map(c => {
      if (cartonIdSet.has(c.id) || c.productionVoucherNo === voucher.voucherNo) {
        const ev: ErpCartonHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          stage: 'PRODUCTION_DELIVERY',
          title: `تحویل از ${productionWarehouse.name} به ${targetWh.name}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: actorName,
          details: `سند تحویل تولید ${docNo} | در انتظار تایید رسید مسئول ${targetWh.name}`,
          docNo,
          archiveCode
        };
        return {
          ...c,
          status: 'IN_TRANSIT' as const,
          inTransitDocId: docId,
          history: [...(c.history || []), ev]
        };
      }
      return c;
    });

    const updatedVouchers = (erpState.productionVouchers || []).map(v =>
      v.id === voucher.id
        ? {
            ...v,
            status: 'PENDING_RECEIPT' as const,
            productionWarehouseId: productionWarehouse.id,
            deliveryDocId: docId,
            deliveryDocNo: docNo
          }
        : v
    );

    const newDoc: ErpWarehouseDocument = {
      id: docId,
      docNo,
      archiveCode,
      docType: 'PRODUCTION_DELIVERY',
      dateJalali: dateToday,
      timeExact: exactTime,
      createdAtMs: Date.now(),
      sourceWarehouseId: productionWarehouse.id,
      sourceWarehouseName: productionWarehouse.name,
      targetWarehouseId: targetWh.id,
      targetWarehouseName: targetWh.name,
      driverName: deliveryDriver,
      plateNumber: deliveryPlate,
      productionVoucherId: voucher.id,
      cartonIds: voucher.cartonIds || [],
      cartonsCount: voucher.cartonsCount,
      totalGrossWeightKg: voucher.totalGrossWeightKg,
      totalNetWeightKg: voucher.totalNetWeightKg,
      status: 'PENDING_RECEIPT',
      createdBy: actorName,
      notes: deliveryNotes || `تحویل از ${productionWarehouse.name} (${voucher.lineName}) به ${targetWh.name}`
    };

    await persistErpState(
      {
        ...erpState,
        warehouses: nextWarehouses,
        cartonLabels: updatedCartons,
        productionVouchers: updatedVouchers,
        warehouseDocuments: [newDoc, ...warehouseDocs]
      },
      `سند تحویل ${docNo} از انبار تولید به «${targetWh.name}» ثبت شد و در انتظار رسید مسئول انبار مقصد است.`
    );
  };

  // Confirm receipt of a PRODUCTION_DELIVERY doc (destination warehouse keeper)
  const handleConfirmProductionDeliveryReceipt = async (deliveryDoc: ErpWarehouseDocument) => {
    const tgtWhId = deliveryDoc.targetWarehouseId || targetWhForReceipt;
    const tgtWh = warehouses.find(w => w.id === tgtWhId);
    if (!tgtWh) {
      showToast?.('error', 'انبار مقصد یافت نشد');
      return;
    }

    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const docNo = getNextPlainSequentialNumber(warehouseDocs.map(d => d.docNo), 1);
    const archiveCode = getNextPlainSequentialNumber(warehouseDocs.map(d => d.archiveCode), 1001);
    const cartonIdSet = new Set(deliveryDoc.cartonIds || []);

    const updatedCartons = allCartons.map(c => {
      if (cartonIdSet.has(c.id)) {
        const histEvent: ErpCartonHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          stage: 'WAREHOUSE_RECEIPT',
          title: `رسید دریافت از تولید در ${tgtWh.name}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: actorName,
          details: `تایید دریافت قطعی از انبار تولید عطف به سند تحویل ${deliveryDoc.docNo}`,
          docNo,
          archiveCode
        };
        return {
          ...c,
          warehouseId: tgtWh.id,
          status: 'IN_STOCK' as const,
          inTransitDocId: undefined,
          history: [...(c.history || []), histEvent]
        };
      }
      return c;
    });

    const updatedVouchers = (erpState.productionVouchers || []).map(v =>
      v.id === deliveryDoc.productionVoucherId || v.deliveryDocId === deliveryDoc.id
        ? {
            ...v,
            status: 'DELIVERED_TO_WAREHOUSE' as const,
            deliveredWarehouseId: tgtWh.id,
            deliveredWarehouseName: tgtWh.name,
            deliveredDocNo: docNo
          }
        : v
    );

    const updatedDocs = warehouseDocs.map(d =>
      d.id === deliveryDoc.id
        ? { ...d, status: 'COMPLETED' as const, receiverUserName: actorName }
        : d
    );

    const newReceiptDoc: ErpWarehouseDocument = {
      id: `whdoc_rcp_${Date.now()}`,
      docNo,
      archiveCode,
      docType: 'RECEIPT_PRODUCTION',
      dateJalali: dateToday,
      timeExact: exactTime,
      createdAtMs: Date.now(),
      sourceWarehouseId: deliveryDoc.sourceWarehouseId || PRODUCTION_FLOOR_WAREHOUSE_ID,
      sourceWarehouseName: deliveryDoc.sourceWarehouseName || PRODUCTION_FLOOR_WAREHOUSE_NAME,
      targetWarehouseId: tgtWh.id,
      targetWarehouseName: tgtWh.name,
      productionVoucherId: deliveryDoc.productionVoucherId,
      referenceDocId: deliveryDoc.id,
      cartonIds: deliveryDoc.cartonIds || [],
      cartonsCount: deliveryDoc.cartonsCount,
      totalGrossWeightKg: deliveryDoc.totalGrossWeightKg,
      totalNetWeightKg: deliveryDoc.totalNetWeightKg,
      status: 'COMPLETED',
      receiverUserName: actorName,
      createdBy: actorName,
      notes: `رسید دریافت از تولید عطف به سند تحویل ${deliveryDoc.docNo} در ${tgtWh.name}`
    };

    await persistErpState(
      {
        ...erpState,
        cartonLabels: updatedCartons,
        productionVouchers: updatedVouchers,
        warehouseDocuments: [newReceiptDoc, ...updatedDocs]
      },
      `رسید دریافت از تولید ${docNo} با موفقیت ثبت شد و کالاها وارد «${tgtWh.name}» شدند.`
    );
  };

  // Rollback pending PRODUCTION_DELIVERY back into wh_production
  const handleCancelProductionDelivery = async (deliveryDoc: ErpWarehouseDocument) => {
    const srcWhId = deliveryDoc.sourceWarehouseId || PRODUCTION_FLOOR_WAREHOUSE_ID;
    const cartonIdSet = new Set(deliveryDoc.cartonIds || []);
    const updatedCartons = allCartons.map(c =>
      cartonIdSet.has(c.id)
        ? { ...c, warehouseId: srcWhId, status: 'IN_STOCK' as const, inTransitDocId: undefined }
        : c
    );
    const updatedVouchers = (erpState.productionVouchers || []).map(v =>
      v.id === deliveryDoc.productionVoucherId || v.deliveryDocId === deliveryDoc.id
        ? { ...v, status: 'IN_PRODUCTION_WAREHOUSE' as const, deliveryDocId: undefined, deliveryDocNo: undefined }
        : v
    );
    const updatedDocs = warehouseDocs.map(d =>
      d.id === deliveryDoc.id ? { ...d, status: 'CANCELLED' as const } : d
    );
    await persistErpState(
      {
        ...erpState,
        cartonLabels: updatedCartons,
        productionVouchers: updatedVouchers,
        warehouseDocuments: updatedDocs
      },
      `تحویل ${deliveryDoc.docNo} لغو شد و کارتن‌ها در انبار تولید باقی ماندند.`
    );
  };

  // Legacy direct receipt helper for old vouchers saved with PENDING_WAREHOUSE_DELIVERY
  const handleAcceptLegacyProductionReceipt = async (voucher: ErpProductionVoucher) => {
    const selWh = warehouses.find(w => w.id === targetWhForReceipt) || nonProductionWarehouses[0] || warehouses[0];
    if (!selWh) return;
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const docNo = getNextPlainSequentialNumber(warehouseDocs.map(d => d.docNo), 1);
    const archiveCode = getNextPlainSequentialNumber(warehouseDocs.map(d => d.archiveCode), 1001);

    const updatedCartons = allCartons.map(c => {
      if (voucher.cartonIds?.includes(c.id) || c.productionVoucherNo === voucher.voucherNo) {
        const histEvent: ErpCartonHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random()}`,
          stage: 'WAREHOUSE_RECEIPT',
          title: `رسید ورود به ${selWh.name}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: actorName,
          details: `ورود رسمی به ${selWh.name} طبق سند تولید ${voucher.voucherNo}`,
          docNo,
          archiveCode
        };
        return { ...c, warehouseId: selWh.id, status: 'IN_STOCK' as const, history: [...(c.history || []), histEvent] };
      }
      return c;
    });

    const updatedVouchers = (erpState.productionVouchers || []).map(v =>
      v.id === voucher.id
        ? {
            ...v,
            status: 'DELIVERED_TO_WAREHOUSE' as const,
            deliveredWarehouseId: selWh.id,
            deliveredWarehouseName: selWh.name,
            deliveredDocNo: docNo
          }
        : v
    );

    const newDoc: ErpWarehouseDocument = {
      id: `whdoc_${Date.now()}`,
      docNo,
      archiveCode,
      docType: 'RECEIPT_PRODUCTION',
      dateJalali: dateToday,
      timeExact: exactTime,
      createdAtMs: Date.now(),
      sourceWarehouseId: PRODUCTION_FLOOR_WAREHOUSE_ID,
      sourceWarehouseName: PRODUCTION_FLOOR_WAREHOUSE_NAME,
      targetWarehouseId: selWh.id,
      targetWarehouseName: selWh.name,
      productionVoucherId: voucher.id,
      cartonIds: voucher.cartonIds || [],
      cartonsCount: voucher.cartonsCount,
      totalGrossWeightKg: voucher.totalGrossWeightKg,
      totalNetWeightKg: voucher.totalNetWeightKg,
      status: 'COMPLETED',
      receiverUserName: actorName,
      createdBy: actorName,
      notes: `رسید دریافت از خط ${voucher.lineName} به ${selWh.name}`
    };

    await persistErpState(
      {
        ...erpState,
        cartonLabels: updatedCartons,
        productionVouchers: updatedVouchers,
        warehouseDocuments: [newDoc, ...warehouseDocs]
      },
      `رسید ورود انبار ${docNo} با موفقیت ثبت شد.`
    );
  };

  // -------------------------------------------------------------
  // 5. SUBVIEW: WH_SALES_REMITTANCE (حواله فروش + قفل دائمی بارکد)
  // -------------------------------------------------------------
  const [sourceWhForRemittance, setSourceWhForRemittance] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [plateNumber, setPlateNumber] = useState<string>('');
  const [cartonSearchCode, setCartonSearchCode] = useState<string>('');
  const [selectedCartonsForSales, setSelectedCartonsForSales] = useState<ErpCartonLabel[]>([]);
  const [salesScanError, setSalesScanError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceWhForRemittance && warehouses.length > 0) {
      const def = nonProductionWarehouses[0] || warehouses[0];
      setSourceWhForRemittance(def.id);
    }
  }, [warehouses, nonProductionWarehouses, sourceWhForRemittance]);

  const availableCartonsInWh = useMemo(() => {
    return allCartons.filter(c => {
      if (c.warehouseId !== sourceWhForRemittance) return false;
      const v = validateCartonForSalesRemittance(c, allCartons, warehouseDocs, sourceWhForRemittance);
      return v.allowed;
    });
  }, [allCartons, warehouseDocs, sourceWhForRemittance]);

  const handleAddCartonToRemittance = (carton: ErpCartonLabel) => {
    setSalesScanError(null);
    if (selectedCartonsForSales.some(c => c.id === carton.id)) {
      const msg = `کارتن ${carton.referenceCode} هم‌اکنون در لیست این حواله انتخاب شده است.`;
      setSalesScanError(msg);
      showToast?.('error', msg);
      return;
    }
    const check = validateCartonForSalesRemittance(carton, allCartons, warehouseDocs, sourceWhForRemittance);
    if (!check.allowed) {
      setSalesScanError(check.reason || 'این بارکد غیرقابل فروش است');
      showToast?.('error', check.reason || 'این بارکد غیرقابل فروش است');
      return;
    }
    setSelectedCartonsForSales(prev => [carton, ...prev]);
  };

  const handleScanCartonInput = (code: string) => {
    setSalesScanError(null);
    if (!code.trim()) return;
    const clean = normalizeFaSearch(code);
    // Search across ALL cartons first so already-sold/locked barcodes report exact lock error!
    const foundGlobal = allCartons.find(
      c =>
        normalizeFaSearch(c.referenceCode) === clean ||
        normalizeFaSearch(c.serialNumber) === clean ||
        normalizeFaSearch(c.qrPayload).includes(clean)
    );
    if (!foundGlobal) {
      const msg = `بارکد / کد ارجاع «${code}» در سیستم یافت نشد.`;
      setSalesScanError(msg);
      showToast?.('error', msg);
      return;
    }
    const check = validateCartonForSalesRemittance(foundGlobal, allCartons, warehouseDocs, sourceWhForRemittance);
    if (!check.allowed) {
      setSalesScanError(check.reason || 'صدور حواله برای این بارکد مجاز نیست.');
      showToast?.('error', check.reason || 'صدور حواله برای این بارکد مجاز نیست.');
      return;
    }
    handleAddCartonToRemittance(foundGlobal);
    setCartonSearchCode('');
    showToast?.('success', `کارتن ${foundGlobal.referenceCode} به لیست حواله افزوده شد`);
  };

  const remTotalNetWeight = useMemo(
    () => Number(selectedCartonsForSales.reduce((sum, c) => sum + c.netWeightKg, 0).toFixed(3)),
    [selectedCartonsForSales]
  );
  const remTotalGrossWeight = useMemo(
    () => Number(selectedCartonsForSales.reduce((sum, c) => sum + c.grossWeightKg, 0).toFixed(3)),
    [selectedCartonsForSales]
  );

  const handleIssueSalesRemittance = async () => {
    setSalesScanError(null);
    if (selectedCartonsForSales.length === 0) {
      showToast?.('error', 'لطفاً حداقل یک کارتن را برای صدور حواله فروش انتخاب نمایید');
      return;
    }
    if (!customerName.trim()) {
      showToast?.('error', 'لطفاً نام مشتری / خریدار را وارد نمایید');
      return;
    }

    // Re-validate every carton against latest state right before persisting
    for (const c of selectedCartonsForSales) {
      const latest = allCartons.find(x => x.id === c.id) || c;
      const check = validateCartonForSalesRemittance(latest, allCartons, warehouseDocs, sourceWhForRemittance);
      if (!check.allowed) {
        setSalesScanError(check.reason || 'بارکد قفل‌شده شناسایی شد');
        showToast?.('error', check.reason || 'بارکد قفل‌شده شناسایی شد');
        return;
      }
    }

    const selWh = warehouses.find(w => w.id === sourceWhForRemittance);
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const docNo = getNextPlainSequentialNumber(warehouseDocs.map(d => d.docNo), 1);
    const archiveCode = getNextPlainSequentialNumber(warehouseDocs.map(d => d.archiveCode), 1001);
    const lockTimestamp = Date.now();
    const remCartonIds = selectedCartonsForSales.map(c => c.id);

    const updatedCartons = allCartons.map(c => {
      if (remCartonIds.includes(c.id)) {
        const histEvent: ErpCartonHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random()}`,
          stage: 'SALES_REMITTANCE',
          title: `حواله فروش و قفل دائمی بارکد به ${customerName}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: actorName,
          details: `خروج از ${selWh?.name || 'انبار'} | حواله ${docNo} | قفل فروش فعال شد | راننده: ${driverName || '—'} | پلاک: ${plateNumber || '—'}`,
          docNo,
          archiveCode
        };
        return {
          ...c,
          status: 'SOLD' as const,
          isSalesLocked: true,
          lockedByDocNo: docNo,
          lockedAt: lockTimestamp,
          remittanceId: docNo,
          history: [...(c.history || []), histEvent]
        };
      }
      return c;
    });

    const newDoc: ErpWarehouseDocument = {
      id: `whdoc_${Date.now()}`,
      docNo,
      archiveCode,
      docType: 'SALES_REMITTANCE',
      dateJalali: dateToday,
      timeExact: exactTime,
      createdAtMs: lockTimestamp,
      sourceWarehouseId: sourceWhForRemittance,
      sourceWarehouseName: selWh?.name,
      partyName: customerName.trim(),
      driverName,
      plateNumber,
      cartonIds: remCartonIds,
      cartonsCount: selectedCartonsForSales.length,
      totalGrossWeightKg: remTotalGrossWeight,
      totalNetWeightKg: remTotalNetWeight,
      status: 'COMPLETED',
      createdBy: actorName,
      notes: `حواله فروش (خروج بدون فی) برای ${customerName.trim()} — بارکدها قفل شدند`
    };

    await persistErpState(
      {
        ...erpState,
        cartonLabels: updatedCartons,
        warehouseDocuments: [newDoc, ...warehouseDocs]
      },
      `حواله فروش ${docNo} صادر و تمامی ${remCartonIds.length} بارکد به‌صورت دائمی قفل شدند.`
    );
    setSelectedCartonsForSales([]);
    setDriverName('');
    setPlateNumber('');
  };

  // -------------------------------------------------------------
  // 6. WH_INTER_REMITTANCE & 7. WH_INTER_RECEIPT
  // -------------------------------------------------------------
  const [transferSourceWh, setTransferSourceWh] = useState<string>('');
  const [transferTargetWh, setTransferTargetWh] = useState<string>('');
  const [selectedCartonsForTransfer, setSelectedCartonsForTransfer] = useState<ErpCartonLabel[]>([]);
  const [transferDriver, setTransferDriver] = useState<string>('');
  const [transferPlate, setTransferPlate] = useState<string>('');
  const [activeReceivingWh, setActiveReceivingWh] = useState<string>('ALL');

  useEffect(() => {
    if (!transferSourceWh && warehouses.length > 0) setTransferSourceWh(warehouses[0].id);
    if (!transferTargetWh && warehouses.length > 1) {
      const other = warehouses.find(w => w.id !== (transferSourceWh || warehouses[0].id));
      if (other) setTransferTargetWh(other.id);
    }
  }, [warehouses, transferSourceWh, transferTargetWh]);

  const availableCartonsForTransfer = useMemo(() => {
    return allCartons.filter(c => validateCartonForTransfer(c, transferSourceWh).allowed);
  }, [allCartons, transferSourceWh]);

  const handleIssueInterWhTransfer = async () => {
    if (transferSourceWh === transferTargetWh) {
      showToast?.('error', 'انبار مبدا و مقصد نمی‌توانند یکسان باشند');
      return;
    }
    if (selectedCartonsForTransfer.length === 0) {
      showToast?.('error', 'لطفاً حداقل یک کارتن را برای انتقال انتخاب نمایید');
      return;
    }
    for (const c of selectedCartonsForTransfer) {
      const check = validateCartonForTransfer(c, transferSourceWh);
      if (!check.allowed) {
        showToast?.('error', check.reason || 'کارتن قابل انتقال نیست');
        return;
      }
    }

    const srcWh = warehouses.find(w => w.id === transferSourceWh);
    const tgtWh = warehouses.find(w => w.id === transferTargetWh);
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const docNo = getNextPlainSequentialNumber(warehouseDocs.map(d => d.docNo), 1);
    const archiveCode = getNextPlainSequentialNumber(warehouseDocs.map(d => d.archiveCode), 1001);
    const docId = `whdoc_trf_${Date.now()}`;

    const trfCartonIds = selectedCartonsForTransfer.map(c => c.id);
    const totNet = Number(selectedCartonsForTransfer.reduce((sum, c) => sum + c.netWeightKg, 0).toFixed(3));
    const totGross = Number(selectedCartonsForTransfer.reduce((sum, c) => sum + c.grossWeightKg, 0).toFixed(3));

    const updatedCartons = allCartons.map(c => {
      if (trfCartonIds.includes(c.id)) {
        const histEvent: ErpCartonHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random()}`,
          stage: 'INTER_WH_TRANSFER',
          title: `حواله انتقال از ${srcWh?.name} به ${tgtWh?.name}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: actorName,
          details: `صدور حواله انتقال بین‌انبار ${docNo} | در حال حمل`,
          docNo,
          archiveCode
        };
        return {
          ...c,
          status: 'IN_TRANSIT' as const,
          inTransitDocId: docId,
          history: [...(c.history || []), histEvent]
        };
      }
      return c;
    });

    const newDoc: ErpWarehouseDocument = {
      id: docId,
      docNo,
      archiveCode,
      docType: 'INTER_WH_TRANSFER',
      dateJalali: dateToday,
      timeExact: exactTime,
      createdAtMs: Date.now(),
      sourceWarehouseId: transferSourceWh,
      sourceWarehouseName: srcWh?.name,
      targetWarehouseId: transferTargetWh,
      targetWarehouseName: tgtWh?.name,
      driverName: transferDriver,
      plateNumber: transferPlate,
      cartonIds: trfCartonIds,
      cartonsCount: selectedCartonsForTransfer.length,
      totalGrossWeightKg: totGross,
      totalNetWeightKg: totNet,
      status: 'PENDING_RECEIPT',
      createdBy: actorName,
      notes: `حواله انتقال از ${srcWh?.name} به ${tgtWh?.name}`
    };

    await persistErpState(
      {
        ...erpState,
        cartonLabels: updatedCartons,
        warehouseDocuments: [newDoc, ...warehouseDocs]
      },
      `حواله بین‌انبار ${docNo} ثبت شد و در انتظار تایید ورود در «${tgtWh?.name}» قرار گرفت.`
    );
    setSelectedCartonsForTransfer([]);
  };

  const pendingInterWhReceipts = useMemo(() => {
    return warehouseDocs.filter(
      d =>
        d.docType === 'INTER_WH_TRANSFER' &&
        d.status === 'PENDING_RECEIPT' &&
        (activeReceivingWh === 'ALL' || d.targetWarehouseId === activeReceivingWh)
    );
  }, [warehouseDocs, activeReceivingWh]);

  const handleConfirmInterWhReceipt = async (transferDoc: ErpWarehouseDocument) => {
    const tgtWh = warehouses.find(w => w.id === transferDoc.targetWarehouseId);
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const docNo = getNextPlainSequentialNumber(warehouseDocs.map(d => d.docNo), 1);
    const archiveCode = getNextPlainSequentialNumber(warehouseDocs.map(d => d.archiveCode), 1001);

    const updatedCartons = allCartons.map(c => {
      if (transferDoc.cartonIds?.includes(c.id)) {
        const histEvent: ErpCartonHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random()}`,
          stage: 'INTER_WH_RECEIPT',
          title: `رسید تایید ورود در ${tgtWh?.name}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: actorName,
          details: `تایید وصول در ${tgtWh?.name} عطف به حواله ${transferDoc.docNo}`,
          docNo,
          archiveCode
        };
        return {
          ...c,
          warehouseId: transferDoc.targetWarehouseId || tgtWh?.id || c.warehouseId,
          status: 'IN_STOCK' as const,
          inTransitDocId: undefined,
          history: [...(c.history || []), histEvent]
        };
      }
      return c;
    });

    const updatedDocs = warehouseDocs.map(d =>
      d.id === transferDoc.id ? { ...d, status: 'COMPLETED' as const, receiverUserName: actorName } : d
    );

    const newDoc: ErpWarehouseDocument = {
      id: `whdoc_${Date.now()}`,
      docNo,
      archiveCode,
      docType: 'INTER_WH_RECEIPT',
      dateJalali: dateToday,
      timeExact: exactTime,
      createdAtMs: Date.now(),
      sourceWarehouseId: transferDoc.sourceWarehouseId,
      sourceWarehouseName: transferDoc.sourceWarehouseName,
      targetWarehouseId: transferDoc.targetWarehouseId,
      targetWarehouseName: tgtWh?.name,
      referenceDocId: transferDoc.id,
      cartonIds: transferDoc.cartonIds,
      cartonsCount: transferDoc.cartonsCount,
      totalGrossWeightKg: transferDoc.totalGrossWeightKg,
      totalNetWeightKg: transferDoc.totalNetWeightKg,
      status: 'COMPLETED',
      receiverUserName: actorName,
      createdBy: actorName,
      notes: `رسید تایید ورود حواله انتقال ${transferDoc.docNo}`
    };

    await persistErpState(
      {
        ...erpState,
        cartonLabels: updatedCartons,
        warehouseDocuments: [newDoc, ...updatedDocs]
      },
      `رسید ورود ${docNo} ثبت شد و کارتن‌ها وارد انبار مقصد گردیدند.`
    );
  };

  const handleCancelInterWhTransfer = async (transferDoc: ErpWarehouseDocument) => {
    const idSet = new Set(transferDoc.cartonIds || []);
    const updatedCartons = allCartons.map(c =>
      idSet.has(c.id)
        ? {
            ...c,
            warehouseId: transferDoc.sourceWarehouseId || c.warehouseId,
            status: 'IN_STOCK' as const,
            inTransitDocId: undefined
          }
        : c
    );
    const updatedDocs = warehouseDocs.map(d =>
      d.id === transferDoc.id ? { ...d, status: 'CANCELLED' as const } : d
    );
    await persistErpState(
      { ...erpState, cartonLabels: updatedCartons, warehouseDocuments: updatedDocs },
      `حواله بین‌انبار ${transferDoc.docNo} لغو و کارتن‌ها به انبار مبدا برگشت داده شد.`
    );
  };

  // -------------------------------------------------------------
  // 8. WH_SALES_RETURN (رسید مرجوعی از فروش - حفظ قفل بارکد پیش‌فرض)
  // -------------------------------------------------------------
  const [returnTargetWh, setReturnTargetWh] = useState<string>('');
  const [returnCustomer, setReturnCustomer] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('عدم تطابق شید رنگ / کیفیت');
  const [returnCartonCode, setReturnCartonCode] = useState<string>('');
  const [selectedCartonsForReturn, setSelectedCartonsForReturn] = useState<ErpCartonLabel[]>([]);
  const [allowUnlockOnReturn, setAllowUnlockOnReturn] = useState<boolean>(false);

  useEffect(() => {
    if (!returnTargetWh && nonProductionWarehouses.length > 0) {
      setReturnTargetWh(nonProductionWarehouses[0].id);
    }
  }, [nonProductionWarehouses, returnTargetWh]);

  const handleAddCartonToReturn = () => {
    if (!returnCartonCode.trim()) return;
    const clean = normalizeFaSearch(returnCartonCode);
    const found = allCartons.find(
      c =>
        normalizeFaSearch(c.referenceCode) === clean ||
        normalizeFaSearch(c.serialNumber) === clean ||
        normalizeFaSearch(c.qrPayload).includes(clean)
    );
    if (found) {
      if (selectedCartonsForReturn.some(c => c.id === found.id)) {
        showToast?.('error', 'این کارتن قبلاً اضافه شده است');
        return;
      }
      setSelectedCartonsForReturn(prev => [found, ...prev]);
      setReturnCartonCode('');
      showToast?.('success', `کارتن ${found.referenceCode} به لیست مرجوعی اضافه شد`);
    } else {
      showToast?.('error', 'کارتنی با این مشخصات یافت نشد');
    }
  };

  const handleIssueSalesReturn = async () => {
    if (selectedCartonsForReturn.length === 0) {
      showToast?.('error', 'لطفاً حداقل یک کارتن مرجوعی انتخاب نمایید');
      return;
    }
    const tgtWh = warehouses.find(w => w.id === returnTargetWh);
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const docNo = getNextPlainSequentialNumber(warehouseDocs.map(d => d.docNo), 1);
    const archiveCode = getNextPlainSequentialNumber(warehouseDocs.map(d => d.archiveCode), 1001);
    const retCartonIds = selectedCartonsForReturn.map(c => c.id);
    const totNet = Number(selectedCartonsForReturn.reduce((sum, c) => sum + c.netWeightKg, 0).toFixed(3));
    const totGross = Number(selectedCartonsForReturn.reduce((sum, c) => sum + c.grossWeightKg, 0).toFixed(3));

    const updatedCartons = allCartons.map(c => {
      if (retCartonIds.includes(c.id)) {
        const histEvent: ErpCartonHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random()}`,
          stage: 'SALES_RETURN',
          title: `رسید مرجوعی از فروش به ${tgtWh?.name}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: actorName,
          details: `علت مرجوعی: ${returnReason} | مشتری: ${returnCustomer || '—'}`,
          docNo,
          archiveCode
        };
        return {
          ...c,
          warehouseId: returnTargetWh || c.warehouseId,
          status: 'RETURNED' as const,
          isSalesLocked: allowUnlockOnReturn ? false : true,
          history: [...(c.history || []), histEvent]
        };
      }
      return c;
    });

    const newDoc: ErpWarehouseDocument = {
      id: `whdoc_${Date.now()}`,
      docNo,
      archiveCode,
      docType: 'SALES_RETURN',
      dateJalali: dateToday,
      timeExact: exactTime,
      createdAtMs: Date.now(),
      targetWarehouseId: returnTargetWh,
      targetWarehouseName: tgtWh?.name,
      partyName: returnCustomer || 'مشتری نامشخص',
      cartonIds: retCartonIds,
      cartonsCount: selectedCartonsForReturn.length,
      totalGrossWeightKg: totGross,
      totalNetWeightKg: totNet,
      status: 'COMPLETED',
      createdBy: actorName,
      notes: `مرجوعی از فروش به دلیل: ${returnReason}`
    };

    await persistErpState(
      {
        ...erpState,
        cartonLabels: updatedCartons,
        warehouseDocuments: [newDoc, ...warehouseDocs]
      },
      `رسید مرجوعی ${docNo} ثبت شد و کالا به موجودی انبار برگشت.`
    );
    setSelectedCartonsForReturn([]);
  };

  // -------------------------------------------------------------
  // 9. SUBVIEW: WH_STOCK_ADJUSTMENT (اصلاح دستی مانده انبار - افزایش / کاهش)
  // -------------------------------------------------------------
  const [adjMode, setAdjMode] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  const [adjWhId, setAdjWhId] = useState<string>('');
  const [adjItemId, setAdjItemId] = useState<string>('');
  const [adjGrade, setAdjGrade] = useState<'A' | 'B' | 'C'>('A');
  const [adjCartons, setAdjCartons] = useState<number>(0);
  const [adjWeightKg, setAdjWeightKg] = useState<number>(0);
  const [adjUnitCost, setAdjUnitCost] = useState<number>(0);
  const [adjReason, setAdjReason] = useState<string>('انبارگردانی و تطبیق موجودی فیزیکی');
  const [adjDate, setAdjDate] = useState<string>(getTodayJalali());
  const [adjSelectedCartonIds, setAdjSelectedCartonIds] = useState<string[]>([]);
  const [adjGenCartonsOnInc, setAdjGenCartonsOnInc] = useState<boolean>(false);

  useEffect(() => {
    if (!adjWhId && warehouses.length > 0) setAdjWhId(warehouses[0].id);
  }, [warehouses, adjWhId]);

  useEffect(() => {
    if (!adjItemId && allItems.length > 0) {
      setAdjItemId(allItems[0].id);
      setAdjUnitCost(allItems[0].unitCost || 0);
    }
  }, [allItems, adjItemId]);

  const adjCandidateCartons = useMemo(() => {
    return allCartons.filter(
      c =>
        c.warehouseId === adjWhId &&
        c.productId === adjItemId &&
        normalizeGrade(c.grade) === adjGrade &&
        (c.status === 'IN_STOCK' || c.status === 'RETURNED' || !c.status) &&
        !c.isSalesLocked
    );
  }, [allCartons, adjWhId, adjItemId, adjGrade]);

  const currentScopedStockForAdj = useMemo(() => {
    const cartonKg = allCartons
      .filter(
        c =>
          c.warehouseId === adjWhId &&
          c.productId === adjItemId &&
          normalizeGrade(c.grade) === adjGrade &&
          (c.status === 'IN_STOCK' || c.status === 'RETURNED' || !c.status)
      )
      .reduce((s, c) => s + Number(c.netWeightKg || 0), 0);
    const bulkMap = computeBulkStockByKey(warehouseDocs, adjWhId);
    const bulkKg = bulkMap.get(`${adjItemId}_${adjGrade}`)?.bulkNetKg || 0;
    return Number((cartonKg + bulkKg).toFixed(3));
  }, [allCartons, warehouseDocs, adjWhId, adjItemId, adjGrade]);

  const adjustmentDocs = useMemo(
    () =>
      warehouseDocs.filter(
        d => (d.docType === 'STOCK_ADJUSTMENT_IN' || d.docType === 'STOCK_ADJUSTMENT_OUT') && d.status !== 'CANCELLED'
      ),
    [warehouseDocs]
  );

  const handleApplyStockAdjustment = async () => {
    const wh = warehouses.find(w => w.id === adjWhId);
    const item = allItems.find(i => i.id === adjItemId);
    if (!wh || !item) {
      showToast?.('error', 'انبار و کالا را انتخاب نمایید');
      return;
    }
    if (!adjReason.trim()) {
      showToast?.('error', 'ذکر علت اصلاح مانده انبار الزامی است');
      return;
    }

    const selectedDecreaseCartons =
      adjMode === 'DECREASE' ? allCartons.filter(c => adjSelectedCartonIds.includes(c.id)) : [];

    const effectiveWeightKg =
      selectedDecreaseCartons.length > 0
        ? Number(selectedDecreaseCartons.reduce((s, c) => s + Number(c.netWeightKg || 0), 0).toFixed(3))
        : Number(Number(adjWeightKg || 0).toFixed(3));
    const effectiveCartons =
      selectedDecreaseCartons.length > 0 ? selectedDecreaseCartons.length : Math.max(0, Math.round(adjCartons));

    if (effectiveWeightKg <= 0) {
      showToast?.('error', 'لطفاً وزن اصلاحی (بیشتر از صفر) یا کارتن‌های مورد نظر را مشخص کنید');
      return;
    }

    if (adjMode === 'DECREASE' && selectedDecreaseCartons.length === 0 && effectiveWeightKg > currentScopedStockForAdj) {
      showToast?.(
        'error',
        `مقدار کاهش (${effectiveWeightKg} Kg) از موجودی فعلی (${currentScopedStockForAdj} Kg) بیشتر است و باعث منفی شدن انبار می‌شود.`
      );
      return;
    }

    const dateToday = adjDate.trim() || getTodayJalali();
    const exactTime = getExactTimeNow();
    const docNo = getNextPlainSequentialNumber(warehouseDocs.map(d => d.docNo), 1);
    const archiveCode = getNextPlainSequentialNumber(warehouseDocs.map(d => d.archiveCode), 1001);
    const docId = `whdoc_adj_${Date.now()}`;
    const rate = Math.max(0, Number(adjUnitCost || item.unitCost || 0));
    const totalVal = Math.round(effectiveWeightKg * rate);

    let updatedCartons = allCartons;
    const generatedCartons: ErpCartonLabel[] = [];
    let nextSerial = erpState.nextSerialCounter || 1000;

    if (adjMode === 'DECREASE' && selectedDecreaseCartons.length > 0) {
      const decIds = new Set(selectedDecreaseCartons.map(c => c.id));
      updatedCartons = allCartons.map(c => {
        if (decIds.has(c.id)) {
          const ev: ErpCartonHistoryEvent = {
            id: `hist_adj_${Date.now()}_${Math.random()}`,
            stage: 'STOCK_ADJUSTMENT',
            title: `کسر دستی موجودی از ${wh.name}`,
            dateJalali: dateToday,
            timeExact: exactTime,
            actor: actorName,
            details: `سند اصلاحی ${docNo} | علت: ${adjReason.trim()}`,
            docNo,
            archiveCode
          };
          return { ...c, status: 'ADJUSTED_OUT' as const, history: [...(c.history || []), ev] };
        }
        return c;
      });
    } else if (adjMode === 'INCREASE' && adjGenCartonsOnInc && effectiveCartons > 0 && effectiveCartons <= 200) {
      const avgNet = Number((effectiveWeightKg / effectiveCartons).toFixed(3));
      const cleanDate = dateToday.replace(/\//g, '').slice(2);
      for (let i = 0; i < effectiveCartons; i++) {
        nextSerial += 1;
        const thisNet = i === effectiveCartons - 1 ? Number((effectiveWeightKg - avgNet * (effectiveCartons - 1)).toFixed(3)) : avgNet;
        const refCode = `ADJ-${String(nextSerial).padStart(5, '0')}-${thisNet.toFixed(2)}`;
        generatedCartons.push({
          id: `carton_adj_${Date.now()}_${i}`,
          serialNumber: `SN-${cleanDate}-${String(nextSerial).padStart(5, '0')}`,
          referenceCode: refCode,
          qrPayload: `DLKAM-ERP|ADJ|REF:${refCode}|ITEM:${item.code}|NET:${thisNet}KG`,
          productId: item.id,
          productCode: item.code,
          productName: item.name,
          yarnCount: item.yarnCount || '150/48',
          colorName: item.colorName || 'سفید',
          lotNumber: `ADJ-${docNo}`,
          machineCode: 'اصلاحیه',
          shift: 'تعدیل',
          grade: adjGrade,
          grossWeightKg: Number((thisNet + 1.8).toFixed(3)),
          conesCount: item.defaultConesPerCarton || 6,
          coneWeightGrams: item.coneWeightGrams || 110,
          cartonWeightGrams: item.cartonWeightGrams || 1450,
          totalTareKg: 1.8,
          netWeightKg: thisNet,
          unitCostPerKg: rate,
          totalCostRials: Math.round(thisNet * rate),
          warehouseId: wh.id,
          status: 'IN_STOCK',
          isSalesLocked: false,
          createdAt: Date.now(),
          createdDateJalali: dateToday,
          createdTimeExact: exactTime,
          createdBy: actorName,
          history: [
            {
              id: `hist_adj_${Date.now()}_${i}`,
              stage: 'STOCK_ADJUSTMENT',
              title: `افزایش دستی موجودی در ${wh.name}`,
              dateJalali: dateToday,
              timeExact: exactTime,
              actor: actorName,
              details: `سند اصلاحی ${docNo} | علت: ${adjReason.trim()}`,
              docNo,
              archiveCode
            }
          ]
        });
      }
      updatedCartons = [...generatedCartons, ...allCartons];
    }

    const line: ErpWarehouseDocItemLine = {
      id: `line_adj_${Date.now()}`,
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      grade: adjGrade,
      cartonsCount: effectiveCartons,
      grossWeightKg: effectiveWeightKg,
      netWeightKg: effectiveWeightKg,
      unitCostRials: rate,
      totalCostRials: totalVal,
      notes: adjReason.trim()
    };

    const docType: ErpWarehouseDocType = adjMode === 'INCREASE' ? 'STOCK_ADJUSTMENT_IN' : 'STOCK_ADJUSTMENT_OUT';
    const newDoc: ErpWarehouseDocument = {
      id: docId,
      docNo,
      archiveCode,
      docType,
      dateJalali: dateToday,
      timeExact: exactTime,
      createdAtMs: Date.now(),
      sourceWarehouseId: adjMode === 'DECREASE' ? wh.id : undefined,
      sourceWarehouseName: adjMode === 'DECREASE' ? wh.name : undefined,
      targetWarehouseId: adjMode === 'INCREASE' ? wh.id : undefined,
      targetWarehouseName: adjMode === 'INCREASE' ? wh.name : undefined,
      cartonIds:
        adjMode === 'DECREASE'
          ? selectedDecreaseCartons.map(c => c.id)
          : generatedCartons.map(c => c.id),
      docItems: [line],
      cartonsCount: effectiveCartons,
      totalGrossWeightKg: effectiveWeightKg,
      totalNetWeightKg: effectiveWeightKg,
      unitCostRials: rate,
      totalCostRials: totalVal,
      adjustmentReason: adjReason.trim(),
      status: 'COMPLETED',
      createdBy: actorName,
      notes: `${adjMode === 'INCREASE' ? 'افزایش دستی' : 'کاهش دستی'} مانده انبار: ${adjReason.trim()}`
    };

    await persistErpState(
      {
        ...erpState,
        cartonLabels: updatedCartons,
        warehouseDocuments: [newDoc, ...warehouseDocs],
        nextSerialCounter: nextSerial
      },
      `سند اصلاح مانده انبار ${docNo} (${adjMode === 'INCREASE' ? '+' : '-'}${effectiveWeightKg} Kg) ثبت شد.`
    );
    setAdjCartons(0);
    setAdjWeightKg(0);
    setAdjSelectedCartonIds([]);
  };

  // -------------------------------------------------------------
  // 10. WH_RECEIPT_ISSUE (رسید خرید مواد و حواله مصرف خط تولید)
  // -------------------------------------------------------------
  const [riDocType, setRiDocType] = useState<'RECEIPT_PURCHASE' | 'ISSUE_PRODUCTION'>('RECEIPT_PURCHASE');
  const [riWhId, setRiWhId] = useState<string>('');
  const [riItemId, setRiItemId] = useState<string>('');
  const [riGrade, setRiGrade] = useState<'A' | 'B' | 'C'>('A');
  const [riWeightKg, setRiWeightKg] = useState<number>(0);
  const [riCartons, setRiCartons] = useState<number>(0);
  const [riUnitCost, setRiUnitCost] = useState<number>(0);
  const [riPartyOrLine, setRiPartyOrLine] = useState<string>('');
  const [riNotes, setRiNotes] = useState<string>('');

  useEffect(() => {
    if (!riWhId && warehouses.length > 0) setRiWhId(warehouses[0].id);
  }, [warehouses, riWhId]);
  useEffect(() => {
    if (!riItemId && allItems.length > 0) {
      setRiItemId(allItems[0].id);
      setRiUnitCost(allItems[0].unitCost || 0);
    }
  }, [allItems, riItemId]);

  const handleSaveReceiptOrIssue = async () => {
    const wh = warehouses.find(w => w.id === riWhId);
    const item = allItems.find(i => i.id === riItemId);
    if (!wh || !item) {
      showToast?.('error', 'لطفاً انبار و کالا را انتخاب نمایید');
      return;
    }
    if (riWeightKg <= 0) {
      showToast?.('error', 'وزن/مقدار باید بیشتر از صفر باشد');
      return;
    }

    const bulkMap = computeBulkStockByKey(warehouseDocs, wh.id);
    const cartonKg = allCartons
      .filter(c => c.warehouseId === wh.id && c.productId === item.id && (c.status === 'IN_STOCK' || c.status === 'RETURNED' || !c.status))
      .reduce((s, c) => s + Number(c.netWeightKg || 0), 0);
    const bulkKg = bulkMap.get(`${item.id}_${riGrade}`)?.bulkNetKg || 0;
    const availKg = Number((cartonKg + bulkKg).toFixed(3));

    if (riDocType === 'ISSUE_PRODUCTION' && riWeightKg > availKg) {
      showToast?.('error', `موجودی کافی در «${wh.name}» وجود ندارد (موجودی فعلی: ${availKg} Kg).`);
      return;
    }

    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const docNo = getNextPlainSequentialNumber(warehouseDocs.map(d => d.docNo), 1);
    const archiveCode = getNextPlainSequentialNumber(warehouseDocs.map(d => d.archiveCode), 1001);
    const netKg = Number(Number(riWeightKg).toFixed(3));
    const rate = Math.max(0, Number(riUnitCost || item.unitCost || 0));
    const line: ErpWarehouseDocItemLine = {
      id: `line_ri_${Date.now()}`,
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      grade: riGrade,
      cartonsCount: Math.max(0, Math.round(riCartons)),
      grossWeightKg: netKg,
      netWeightKg: netKg,
      unitCostRials: rate,
      totalCostRials: Math.round(netKg * rate),
      notes: riNotes
    };

    const newDoc: ErpWarehouseDocument = {
      id: `whdoc_ri_${Date.now()}`,
      docNo,
      archiveCode,
      docType: riDocType,
      dateJalali: dateToday,
      timeExact: exactTime,
      createdAtMs: Date.now(),
      sourceWarehouseId: riDocType === 'ISSUE_PRODUCTION' ? wh.id : undefined,
      sourceWarehouseName: riDocType === 'ISSUE_PRODUCTION' ? wh.name : undefined,
      targetWarehouseId: riDocType === 'RECEIPT_PURCHASE' ? wh.id : undefined,
      targetWarehouseName: riDocType === 'RECEIPT_PURCHASE' ? wh.name : undefined,
      partyName: riPartyOrLine || (riDocType === 'ISSUE_PRODUCTION' ? 'خط تولید کارخانه' : 'تامین‌کننده'),
      cartonIds: [],
      docItems: [line],
      cartonsCount: Math.max(0, Math.round(riCartons)),
      totalGrossWeightKg: netKg,
      totalNetWeightKg: netKg,
      unitCostRials: rate,
      totalCostRials: Math.round(netKg * rate),
      status: 'COMPLETED',
      createdBy: actorName,
      notes: riNotes || getDocTypePersianLabel(riDocType)
    };

    await persistErpState(
      { ...erpState, warehouseDocuments: [newDoc, ...warehouseDocs] },
      `${getDocTypePersianLabel(riDocType)} شماره ${docNo} ثبت شد.`
    );
    setRiWeightKg(0);
    setRiCartons(0);
  };

  // -------------------------------------------------------------
  // 11. WH_ARCHIVE & DOC MODAL
  // -------------------------------------------------------------
  const [archiveFilterType, setArchiveFilterType] = useState<string>('ALL');
  const [archiveSearchTerm, setArchiveSearchTerm] = useState<string>('');
  const [selectedDocForModal, setSelectedDocForModal] = useState<ErpWarehouseDocument | null>(null);

  const getDocCartons = (doc: ErpWarehouseDocument): ErpCartonLabel[] => {
    const idSet = new Set(doc.cartonIds || []);
    return allCartons.filter(c => idSet.has(c.id));
  };

  const filteredWarehouseDocs = useMemo(() => {
    return warehouseDocs.filter(d => {
      if (archiveFilterType !== 'ALL' && d.docType !== archiveFilterType) return false;
      if (archiveSearchTerm.trim()) {
        const linkedCartons = getDocCartons(d);
        const statusText =
          d.status === 'COMPLETED' ? 'نهایی شده' : d.status === 'CANCELLED' ? 'لغو شده' : 'در انتظار تایید مقصد';
        const cartonFields: unknown[] = [];
        for (const c of linkedCartons) {
          cartonFields.push(c.referenceCode, c.serialNumber, c.productName, c.productCode, c.lotNumber, c.netWeightKg);
        }
        return matchesSearchQuery(archiveSearchTerm, [
          d.docNo,
          d.archiveCode,
          d.docType,
          getDocTypePersianLabel(d.docType),
          d.sourceWarehouseName,
          d.targetWarehouseName,
          d.partyName,
          d.driverName,
          d.plateNumber,
          d.createdBy,
          d.receiverUserName,
          d.dateJalali,
          d.notes,
          d.adjustmentReason,
          statusText,
          ...cartonFields
        ]);
      }
      return true;
    });
  }, [warehouseDocs, allCartons, archiveFilterType, archiveSearchTerm]);

  const getDocTypeColorClass = (type: ErpWarehouseDocType) => {
    switch (type) {
      case 'OPENING_BALANCE':
        return 'text-cyan-700 dark:text-cyan-300';
      case 'PRODUCTION_DELIVERY':
        return 'text-orange-700 dark:text-orange-300';
      case 'RECEIPT_PRODUCTION':
      case 'RECEIPT_PURCHASE':
        return 'text-emerald-700 dark:text-emerald-300';
      case 'SALES_REMITTANCE':
        return 'text-blue-700 dark:text-blue-300';
      case 'INTER_WH_TRANSFER':
        return 'text-purple-700 dark:text-purple-300';
      case 'INTER_WH_RECEIPT':
        return 'text-indigo-700 dark:text-indigo-300';
      case 'SALES_RETURN':
      case 'STOCK_ADJUSTMENT_OUT':
      case 'ISSUE_PRODUCTION':
        return 'text-rose-700 dark:text-rose-300';
      case 'STOCK_ADJUSTMENT_IN':
        return 'text-teal-700 dark:text-teal-300';
      default:
        return 'text-slate-700 dark:text-slate-300';
    }
  };

  // -------------------------------------------------------------
  // 12. WH_TRACKING (رهگیری جامع کارتن با کد ارجاع / بارکد)
  // -------------------------------------------------------------
  const [trackingCodeInput, setTrackingCodeInput] = useState<string>('');
  const [trackedCarton, setTrackedCarton] = useState<ErpCartonLabel | null>(null);

  const handleTrackCarton = (codeToSearch?: string) => {
    const q = normalizeFaSearch(codeToSearch || trackingCodeInput);
    if (!q) return;
    const found = allCartons.find(
      c =>
        normalizeFaSearch(c.referenceCode) === q ||
        normalizeFaSearch(c.serialNumber) === q ||
        normalizeFaSearch(c.qrPayload).includes(q)
    );
    if (found) {
      setTrackedCarton(found);
      showToast?.('success', `کارتن با کد ارجاع ${found.referenceCode} یافت شد`);
    } else {
      setTrackedCarton(null);
      showToast?.('error', 'کارتنی با این کد ارجاع یا بارکد در سامانه یافت نشد');
    }
  };

  useEffect(() => {
    if (activeSubView === 'wh_tracking' && !trackedCarton && allCartons.length > 0) {
      setTrackedCarton(allCartons[0]);
      setTrackingCodeInput(allCartons[0].referenceCode);
    }
  }, [activeSubView, allCartons, trackedCarton]);

  // -------------------------------------------------------------
  // 13. WH_STOCK_REPORT & WH_KARDEX (موجودی، کاردکس ورود/خروج/مانده وزن)
  // -------------------------------------------------------------
  const [stockWhFilter, setStockWhFilter] = useState<string>('ALL');
  const [stockGradeFilter, setStockGradeFilter] = useState<'ALL' | 'A' | 'B' | 'C'>('ALL');
  const [kardexItemFilter, setKardexItemFilter] = useState<string>('ALL');
  const [kardexSearch, setKardexSearch] = useState<string>('');

  const gradeLabelText = (g?: string) => {
    const gr = normalizeGrade(g);
    return gr === 'A' ? 'درجه A (۱)' : gr === 'B' ? 'درجه B (۲)' : 'درجه C (۳)';
  };

  const stockSummaryRows = useMemo(() => {
    const gradesList: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];
    const bulkMap = computeBulkStockByKey(warehouseDocs, stockWhFilter);
    const rows: Array<{
      key: string;
      item: ErpItem;
      grade: 'A' | 'B' | 'C';
      inStockCount: number;
      inStockNetKg: number;
      inTransitCount: number;
      inTransitKg: number;
      soldCount: number;
      soldNetKg: number;
      returnedCount: number;
      returnedNetKg: number;
    }> = [];

    for (const item of allItems) {
      if (kardexItemFilter !== 'ALL' && item.id !== kardexItemFilter) continue;
      if (
        kardexSearch.trim() &&
        !matchesSearchQuery(kardexSearch, [item.code, item.name, item.groupName, item.yarnCount])
      ) {
        const hasMatchingCarton = allCartons.some(
          c =>
            (c.productId === item.id || c.productCode === item.code) &&
            matchesSearchQuery(kardexSearch, [c.referenceCode, c.serialNumber, c.lotNumber, c.grade])
        );
        if (!hasMatchingCarton) continue;
      }

      const itemCartons = allCartons.filter(c => c.productId === item.id || c.productCode === item.code);

      for (const g of gradesList) {
        if (stockGradeFilter !== 'ALL' && g !== stockGradeFilter) continue;
        const scopedCartons = itemCartons.filter(c => {
          if (normalizeGrade(c.grade || item.grade) !== g) return false;
          if (stockWhFilter !== 'ALL' && c.warehouseId !== stockWhFilter) return false;
          return true;
        });

        const inStockCartons = scopedCartons.filter(
          c => c.status === 'IN_STOCK' || c.status === 'RETURNED' || !c.status
        );
        const transitCartons = scopedCartons.filter(c => c.status === 'IN_TRANSIT');
        const soldCartons = scopedCartons.filter(c => c.status === 'SOLD' || c.status === 'REMITTED');
        const retCartons = scopedCartons.filter(c => c.status === 'RETURNED');
        const bulk = bulkMap.get(`${item.id}_${g}`);

        const totalCount = inStockCartons.length + (bulk?.bulkCartons || 0);
        const totalKg = Number(
          (inStockCartons.reduce((s, c) => s + Number(c.netWeightKg || 0), 0) + (bulk?.bulkNetKg || 0)).toFixed(3)
        );

        const isDefaultGrade = normalizeGrade(item.grade) === g;
        if (scopedCartons.length > 0 || (bulk && (bulk.bulkNetKg !== 0 || bulk.bulkCartons !== 0)) || (isDefaultGrade && stockWhFilter === 'ALL')) {
          rows.push({
            key: `${item.id}_${g}`,
            item,
            grade: g,
            inStockCount: Math.max(0, totalCount),
            inStockNetKg: totalKg,
            inTransitCount: transitCartons.length,
            inTransitKg: Number(transitCartons.reduce((s, c) => s + Number(c.netWeightKg || 0), 0).toFixed(3)),
            soldCount: soldCartons.length,
            soldNetKg: Number(soldCartons.reduce((s, c) => s + Number(c.netWeightKg || 0), 0).toFixed(3)),
            returnedCount: retCartons.length,
            returnedNetKg: Number(retCartons.reduce((s, c) => s + Number(c.netWeightKg || 0), 0).toFixed(3))
          });
        }
      }
    }
    return rows;
  }, [allItems, allCartons, warehouseDocs, stockWhFilter, stockGradeFilter, kardexItemFilter, kardexSearch]);

  const kardexResult = useMemo(() => {
    return buildChronologicalKardex({
      warehouses,
      items: allItems,
      productionVouchers: erpState.productionVouchers || [],
      cartonLabels: allCartons,
      warehouseDocuments: warehouseDocs,
      warehouseFilter: stockWhFilter,
      gradeFilter: stockGradeFilter,
      itemFilter: kardexItemFilter,
      searchQuery: kardexSearch
    });
  }, [
    warehouses,
    allItems,
    erpState.productionVouchers,
    allCartons,
    warehouseDocs,
    stockWhFilter,
    stockGradeFilter,
    kardexItemFilter,
    kardexSearch
  ]);

  const lowStockWarehouses = useMemo(() => {
    return warehouses
      .map(w => {
        const minKg = Number(w.minStockKg || 0);
        if (minKg <= 0) return null;
        const cartonKg = allCartons
          .filter(c => c.warehouseId === w.id && (c.status === 'IN_STOCK' || c.status === 'RETURNED' || !c.status))
          .reduce((s, c) => s + Number(c.netWeightKg || 0), 0);
        const bulkMap = computeBulkStockByKey(warehouseDocs, w.id);
        let bulkKg = 0;
        bulkMap.forEach(b => {
          bulkKg += b.bulkNetKg;
        });
        const curKg = Number((cartonKg + bulkKg).toFixed(3));
        if (curKg < minKg) return { warehouse: w, currentKg: curKg, minKg };
        return null;
      })
      .filter((x): x is { warehouse: ErpWarehouse; currentKg: number; minKg: number } => Boolean(x));
  }, [warehouses, allCartons, warehouseDocs]);

  // -------------------------------------------------------------
  // 14. WACC_PRICING & WACC_RIALI_KARDEX (حسابداری انبار)
  // -------------------------------------------------------------
  const [waccWhFilter, setWaccWhFilter] = useState<string>('ALL');
  const [voucherMode, setVoucherMode] = useState<'PRODUCTION_RECEIPT' | 'PURCHASE_RECEIPT' | 'SALES_COGS' | 'OPENING_INVENTORY' | 'ADJUSTMENT'>('PRODUCTION_RECEIPT');

  const waccSummary = useMemo(() => {
    return computeWeightedAverageCosting({
      warehouses,
      items: allItems,
      productionVouchers: erpState.productionVouchers || [],
      cartonLabels: allCartons,
      warehouseDocuments: warehouseDocs,
      warehouseFilter: waccWhFilter
    });
  }, [warehouses, allItems, erpState.productionVouchers, allCartons, warehouseDocs, waccWhFilter]);

  const handleApplyWaccToItems = async () => {
    if (waccSummary.itemSummaries.length === 0) {
      showToast?.('error', 'داده‌ای برای بروزرسانی میانگین موزون یافت نشد.');
      return;
    }
    const rateMap = new Map<string, number>();
    waccSummary.itemSummaries.forEach(s => {
      if (s.waccUnitCostRials > 0) rateMap.set(s.item.id, s.waccUnitCostRials);
    });
    const updatedItems = allItems.map(it => {
      const r = rateMap.get(it.id);
      return r ? { ...it, unitCost: r } : it;
    });
    await persistErpState({ ...erpState, items: updatedItems }, 'نرخ میانگین موزون (WACC) با موفقیت روی کاردکس کالاها اعمال شد.');
  };

  const handleIssueWarehouseAccountingVoucher = async () => {
    const val = voucherMode === 'SALES_COGS' ? waccSummary.totalOutValueRials : waccSummary.totalEndingValueRials;
    if (val <= 0) {
      showToast?.('error', 'مبلغ ریالی معتبری برای صدور سند حسابداری انبار وجود ندارد (ابتدا نرخ یا بهای تمام‌شده کالاها را مشخص کنید).');
      return;
    }
    const nextVoucherNo = erpState.nextVoucherNo || (erpState.vouchers?.length || 0) + 1;
    const whName =
      waccWhFilter === 'ALL' ? 'کل انبارهای شرکت' : warehouses.find(w => w.id === waccWhFilter)?.name || 'انبار';
    const newVoucher = buildWarehouseAccountingVoucher({
      nextVoucherNo,
      dateJalali: getTodayJalali(),
      createdBy: actorName,
      description: `سند اتوماتیک حسابداری انبار (${whName}) — شرکت ${selectedCompany?.name || ''}`,
      totalValueRials: val,
      mode: voucherMode,
      warehouseName: whName
    });

    await persistErpState(
      {
        ...erpState,
        vouchers: [newVoucher, ...(erpState.vouchers || [])],
        nextVoucherNo: nextVoucherNo + 1
      },
      `سند حسابداری متوازن شماره ${nextVoucherNo} به مبلغ ${val.toLocaleString()} ریال صادر و در دفتر روزنامه ثبت شد.`
    );
  };

  const hasProductionWarehouse = warehouses.some(
    w => w.id === PRODUCTION_FLOOR_WAREHOUSE_ID || w.isProductionFloor || w.type === 'PRODUCTION_FLOOR'
  );

  return (
    <div className="h-full flex flex-col min-h-0 bg-transparent overflow-hidden">
      {/* --------------------------------------------------------------------------------- */}
      {/* 1. WH_WAREHOUSES: DEFINE, EDIT & SAFE DELETE WAREHOUSES */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_warehouses' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <WhIcon className="w-5 h-5 text-teal-600" />
                تعریف، ویرایش و حذف انبارها و تخصیص گروه کالایی
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                مدیریت انبار تولید (پای خط)، انبار محصول، انبار مواد اولیه، نقطه سفارش و مسئول انبار
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!hasProductionWarehouse && (
                <button
                  onClick={handleEnsureProdWarehouse}
                  className="min-h-[40px] px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={15} />
                  ایجاد انبار تولید (پای خط)
                </button>
              )}
              <button
                onClick={() => {
                  setWhForm({
                    code: `WH-0${warehouses.length + 1}`,
                    name: '',
                    type: 'FINISHED_YARN',
                    location: '',
                    managerName: '',
                    minStockKg: 0,
                    assignedGroupIds: []
                  });
                  setShowAddWhModal(true);
                }}
                className="min-h-[40px] px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer"
              >
                <Plus size={16} />
                تعریف انبار جدید
              </button>
            </div>
          </div>

          {whDeleteError && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
              <span>{whDeleteError}</span>
              <button onClick={() => setWhDeleteError(null)} className="p-1 cursor-pointer">
                <X size={14} />
              </button>
            </div>
          )}

          {warehouses.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-10 text-center space-y-3">
              <WhIcon size={28} className="mx-auto text-teal-600" />
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                هیچ انباری برای این شرکت تعریف نشده است
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                انبار تولید (پای خط) هنگام ثبت عملکرد خط به‌صورت خودکار ایجاد می‌شود. همچنین می‌توانید انبارهای محصول و مواد اولیه را از اینجا تعریف کنید.
              </p>
              <button
                onClick={() => {
                  setWhForm({
                    code: 'WH-01',
                    name: 'انبار مرکزی محصول',
                    type: 'FINISHED_YARN',
                    location: 'سوله شماره ۱',
                    managerName: actorName,
                    minStockKg: 0,
                    assignedGroupIds: []
                  });
                  setShowAddWhModal(true);
                }}
                className="min-h-[44px] px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={15} />
                <span>تعریف اولین انبار</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {warehouses.map(w => {
                const inStockCartons = allCartons.filter(
                  c => c.warehouseId === w.id && (c.status === 'IN_STOCK' || c.status === 'RETURNED' || !c.status)
                );
                const bulkMap = computeBulkStockByKey(warehouseDocs, w.id);
                let bulkCartons = 0;
                let bulkKg = 0;
                bulkMap.forEach(b => {
                  bulkCartons += b.bulkCartons;
                  bulkKg += b.bulkNetKg;
                });

                const totalCount = inStockCartons.length + bulkCartons;
                const totalKg = Number(
                  (inStockCartons.reduce((sum, c) => sum + Number(c.netWeightKg || 0), 0) + bulkKg).toFixed(3)
                );
                const delCheck = canDeleteWarehouse(w.id, allCartons, warehouseDocs);
                const isConfirmingDel = confirmDeleteWhId === w.id;

                return (
                  <div
                    key={w.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-black text-teal-600 tabular-nums">{w.code}</span>
                          <span className="text-slate-300">/</span>
                          <span className="text-[11px] font-bold text-slate-500">{getWarehouseTypeLabel(w.type)}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setWhForm({ ...w });
                              setShowAddWhModal(true);
                            }}
                            className="p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 cursor-pointer"
                            title="ویرایش انبار"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (!delCheck.allowed) {
                                setWhDeleteError(delCheck.reason || 'امکان حذف این انبار وجود ندارد');
                                showToast?.('error', delCheck.reason || 'امکان حذف نیست');
                                return;
                              }
                              setWhDeleteError(null);
                              setConfirmDeleteWhId(isConfirmingDel ? null : w.id);
                            }}
                            className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 cursor-pointer"
                            title={delCheck.allowed ? 'حذف انبار' : delCheck.reason}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">{w.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          موقعیت: {w.location || '—'} · مسئول: {w.managerName || '—'}
                        </p>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px]">تعداد کل کارتن / بسته</span>
                          <strong className="font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                            {totalCount} کارتن
                          </strong>
                        </div>
                        <div className="text-left">
                          <span className="text-slate-400 block text-[10px]">مانده وزن خالص</span>
                          <strong className="font-mono tabular-nums font-black text-emerald-600" dir="ltr">
                            {totalKg.toLocaleString()} Kg
                          </strong>
                        </div>
                      </div>

                      {Number(w.minStockKg || 0) > 0 && (
                        <div className="text-[11px] flex items-center justify-between text-slate-500 font-mono tabular-nums">
                          <span>حداقل موجودی (نقطه سفارش):</span>
                          <span className={totalKg < Number(w.minStockKg) ? 'text-rose-600 font-black' : 'text-emerald-600 font-bold'}>
                            {Number(w.minStockKg).toLocaleString()} Kg {totalKg < Number(w.minStockKg) ? '— کمبود موجودی' : ''}
                          </span>
                        </div>
                      )}

                      {isConfirmingDel && (
                        <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs space-y-2">
                          <div className="font-bold text-rose-800 dark:text-rose-200">
                            آیا انبار «{w.name}» برای همیشه حذف شود؟
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setConfirmDeleteWhId(null)}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 font-bold cursor-pointer"
                            >
                              انصراف
                            </button>
                            <button
                              onClick={() => handleConfirmDeleteWarehouse(w)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-black cursor-pointer"
                            >
                              تایید حذف
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                      گروه‌های مجاز:{' '}
                      {w.assignedGroupIds && w.assignedGroupIds.length > 0
                        ? w.assignedGroupIds.map(gid => groups.find(g => g.id === gid)?.name || gid).join(' · ')
                        : 'همه گروه‌های کالایی'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 2. WH_OPENING_BALANCE: OPENING INVENTORY ENTRY PER WAREHOUSE */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_opening_balance' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-cyan-600" />
                ثبت موجودی ابتدای دوره برای هر انبار
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                کالا و انبار مورد نظر را انتخاب کنید تا مانده ابتدای دوره وزن و تعداد در کاردکس و تراز ریالی انبار لحاظ گردد.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">انبار مقصد *</label>
                <select
                  value={openingWhId}
                  onChange={e => setOpeningWhId(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">انتخاب کالا *</label>
                <select
                  value={openingItemId}
                  onChange={e => {
                    setOpeningItemId(e.target.value);
                    const it = allItems.find(x => x.id === e.target.value);
                    if (it) setOpeningUnitCost(it.unitCost || 0);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {allItems.length === 0 && <option value="">ابتدا کالا تعریف کنید</option>}
                  {allItems.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.code} — {it.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">درجه کیفی کالا</label>
                <select
                  value={openingGrade}
                  onChange={e => setOpeningGrade(e.target.value as any)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  <option value="A">درجه A (درجه ۱)</option>
                  <option value="B">درجه B (درجه ۲)</option>
                  <option value="C">درجه C (ضایعات/درجه ۳)</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">تاریخ سند ابتدای دوره</label>
                <input
                  type="text"
                  value={openingDate}
                  onChange={e => setOpeningDate(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">وزن خالص (کیلوگرم) *</label>
                <input
                  type="number"
                  step="0.001"
                  value={openingWeightKg || ''}
                  onChange={e => setOpeningWeightKg(parseFloat(e.target.value) || 0)}
                  placeholder="مثلاً: 1250.5"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-cyan-300 dark:border-cyan-700 bg-white dark:bg-slate-800 font-mono tabular-nums font-black"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">تعداد کارتن / بسته (اختیاری)</label>
                <input
                  type="number"
                  value={openingCartons || ''}
                  onChange={e => setOpeningCartons(parseInt(e.target.value, 10) || 0)}
                  placeholder="مثلاً: 50"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">فی واحد هر کیلو (ریال)</label>
                <input
                  type="number"
                  value={openingUnitCost || ''}
                  onChange={e => setOpeningUnitCost(parseInt(e.target.value, 10) || 0)}
                  placeholder="ریال"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">شرح سند</label>
                <input
                  type="text"
                  value={openingNotes}
                  onChange={e => setOpeningNotes(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={openingGenerateCartons}
                  onChange={e => setOpeningGenerateCartons(e.target.checked)}
                  className="accent-cyan-600 w-4 h-4"
                />
                <span>صدور بارکد و کارتن‌های قابل اسکن به‌ازای تعداد کارتن واردشده (حداکثر ۲۰۰ کارتن)</span>
              </label>

              <button
                onClick={handleRegisterOpeningBalance}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check size={16} />
                ثبت سند موجودی ابتدای دوره انبار
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-black text-xs text-slate-700 dark:text-slate-200">
              اسناد ابتدای دوره ثبت‌شده ({openingDocs.length} سند)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="p-3">شماره سند</th>
                    <th className="p-3">تاریخ</th>
                    <th className="p-3">انبار</th>
                    <th className="p-3">کالا و درجه</th>
                    <th className="p-3 text-center">تعداد کارتن</th>
                    <th className="p-3 text-center">وزن خالص (Kg)</th>
                    <th className="p-3 text-center">ارزش کل (ریال)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {openingDocs.map(d => (
                    <tr key={d.id}>
                      <td className="p-3 font-mono font-bold text-cyan-600">{d.docNo}</td>
                      <td className="p-3 font-mono">{d.dateJalali}</td>
                      <td className="p-3 font-bold">{d.targetWarehouseName}</td>
                      <td className="p-3">{d.docItems?.[0]?.itemName || '—'} ({gradeLabelText(d.docItems?.[0]?.grade)})</td>
                      <td className="p-3 text-center font-mono tabular-nums">{d.cartonsCount}</td>
                      <td className="p-3 text-center font-mono tabular-nums font-black text-emerald-600" dir="ltr">
                        {d.totalNetWeightKg.toLocaleString()}
                      </td>
                      <td className="p-3 text-center font-mono tabular-nums" dir="ltr">
                        {(d.totalCostRials || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {openingDocs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                        هنوز سند موجودی ابتدای دوره‌ای ثبت نشده است.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 3. WH_PRODUCTION_DELIVERY: تحویل کالا از انبار تولید به انبار مقصد */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_production_delivery' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-teal-600" />
                  صدور سند تحویل کالا از «انبار تولید» به انبار مقصد
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  ۱) با ثبت عملکرد خط تولید، کالا خودکار وارد انبار تولید می‌شود. ۲) در این بخش سند تحویل به انبار مقصد (مانند انبار کارخانه) صادر می‌کنید تا مسئول انبار مقصد رسید آن را ثبت کند.
                </p>
              </div>
              {openSubViewTab && (
                <button
                  onClick={() => openSubViewTab('wh_receipt_production')}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-black shrink-0 cursor-pointer"
                >
                  رفتن به کارتابل رسید دریافت از تولید
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">انبار مقصد تحویل‌گیرنده *</label>
                <select
                  value={deliveryTargetWhId}
                  onChange={e => setDeliveryTargetWhId(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/40 dark:bg-slate-800 font-black"
                >
                  {nonProductionWarehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">تحویل‌دهنده / متصدی حمل</label>
                <input
                  type="text"
                  value={deliveryDriver}
                  onChange={e => setDeliveryDriver(e.target.value)}
                  placeholder="نام متصدی سالن / لیفتراک"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">شماره پالت / خودرو داخلی</label>
                <input
                  type="text"
                  value={deliveryPlate}
                  onChange={e => setDeliveryPlate(e.target.value)}
                  placeholder="کد پالت یا وسیله"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">توضیحات</label>
                <input
                  type="text"
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder="یادداشت سند تحویل"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="font-black text-xs text-slate-700 dark:text-slate-300">
              اسناد تولید موجود در انبار تولید و آماده صدور حواله تحویل ({vouchersInProductionWh.length} سند):
            </h3>
            {vouchersInProductionWh.length === 0 ? (
              <div className="py-10 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                در حال حاضر موجودی جدیدی در انبار تولید منتظر تحویل به انبار مقصد نیست.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vouchersInProductionWh.map(v => (
                  <div
                    key={v.id}
                    className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/40 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-black text-orange-600">{v.voucherNo}</span>
                        <span className="text-[11px] text-slate-400">بایگانی: {v.archiveCode}</span>
                      </div>
                      <h4 className="font-black text-sm text-slate-800 dark:text-slate-100">{v.itemName}</h4>
                      <div className="text-slate-500 space-y-1">
                        <div>خط: <strong className="text-slate-800 dark:text-slate-200">{v.lineName}</strong></div>
                        <div>تعداد: <strong className="font-mono tabular-nums">{v.cartonsCount} کارتن</strong> · وزن خالص: <strong className="font-mono tabular-nums text-emerald-600" dir="ltr">{v.totalNetWeightKg} Kg</strong></div>
                        <div>تاریخ و ساعت: <strong className="font-mono">{v.dateJalali} — {v.timeExact}</strong></div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleIssueProductionDelivery(v)}
                      className="min-h-[44px] w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Truck size={15} />
                      صدور سند تحویل به {warehouses.find(w => w.id === deliveryTargetWhId)?.name || 'انبار مقصد'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {pendingProductionDeliveryDocs.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <h3 className="font-black text-xs text-indigo-700 dark:text-indigo-300">
                سندهای تحویل ارسال‌شده در انتظار تایید رسید انبار مقصد ({pendingProductionDeliveryDocs.length} سند):
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingProductionDeliveryDocs.map(doc => (
                  <div key={doc.id} className="border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-mono font-black text-indigo-600">سند تحویل {doc.docNo} (بایگانی {doc.archiveCode})</div>
                      <div>مقصد: <strong>{doc.targetWarehouseName}</strong> · {doc.cartonsCount} کارتن · {doc.totalNetWeightKg} Kg</div>
                    </div>
                    <button
                      onClick={() => handleCancelProductionDelivery(doc)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-rose-300 text-rose-600 hover:bg-rose-50 font-bold cursor-pointer shrink-0"
                    >
                      لغو تحویل (بازگشت به انبار تولید)
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 4. WH_RECEIPT_PRODUCTION: رسید دریافت کالا از تولید توسط مسئول انبار مقصد */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_receipt_production' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                رسید دریافت کالا از تولید (تایید ورود توسط مسئول انبار مقصد)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                کالاهایی که از «انبار تولید» به مقصد انبارهای کارخانه حواله تحویل خورده‌اند، با تایید مسئول انبار در این بخش رسماً وارد موجودی می‌شوند.
              </p>
            </div>
            {openSubViewTab && (
              <button
                onClick={() => openSubViewTab('wh_production_delivery')}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs font-black shrink-0 cursor-pointer"
              >
                ثبت تحویل جدید از انبار تولید
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <h3 className="font-black text-xs text-slate-700 dark:text-slate-300">
              اسناد تحویل از تولید در انتظار تایید رسید ({pendingProductionDeliveryDocs.length} سند):
            </h3>

            {pendingProductionDeliveryDocs.length === 0 ? (
              <div className="py-10 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                در حال حاضر سند تحویل تولیدی منتظر تایید رسید نیست. ابتدا از بخش «تحویل کالا از تولید به انبار مقصد» سند تحویل صادر نمایید.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingProductionDeliveryDocs.map(doc => (
                  <div
                    key={doc.id}
                    className="border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-4 bg-emerald-50/20 dark:bg-slate-800/40 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-black text-emerald-700 dark:text-emerald-300">حواله تحویل {doc.docNo}</span>
                        <span className="text-[11px] text-slate-400">کد بایگانی: {doc.archiveCode}</span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 space-y-1">
                        <div>مبدا: <strong>{doc.sourceWarehouseName}</strong></div>
                        <div>انبار مقصد تحویل‌گیرنده: <strong className="text-slate-900 dark:text-white">{doc.targetWarehouseName}</strong></div>
                        <div>تعداد کارتن: <strong className="font-mono tabular-nums">{doc.cartonsCount} کارتن</strong> · وزن خالص: <strong className="font-mono tabular-nums text-emerald-600" dir="ltr">{doc.totalNetWeightKg} Kg</strong></div>
                        <div>تاریخ و ساعت: <strong className="font-mono">{doc.dateJalali} — {doc.timeExact}</strong></div>
                        {doc.notes && <div className="text-[11px] text-slate-500">{doc.notes}</div>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConfirmProductionDeliveryReceipt(doc)}
                        className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Check size={16} />
                        تایید دریافت و ثبت رسید انبار
                      </button>
                      <button
                        onClick={() => handleCancelProductionDelivery(doc)}
                        className="min-h-[44px] px-3 py-2.5 rounded-xl border border-rose-300 text-rose-600 hover:bg-rose-50 text-xs font-bold cursor-pointer"
                        title="برگشت به انبار تولید"
                      >
                        برگشت
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {vouchersInProductionWh.some(v => v.status === 'PENDING_WAREHOUSE_DELIVERY') && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="font-black text-xs text-amber-700 dark:text-amber-300">
                  سندهای تولید قدیمی در وضعیت انتظار مستقیم (سازگاری با داده‌های قبلی):
                </h3>
                <select
                  value={targetWhForReceipt}
                  onChange={e => setTargetWhForReceipt(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {vouchersInProductionWh
                  .filter(v => v.status === 'PENDING_WAREHOUSE_DELIVERY')
                  .map(v => (
                    <div key={v.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs gap-2">
                      <div>
                        <div className="font-mono font-black text-orange-600">{v.voucherNo} — {v.itemName}</div>
                        <div>{v.cartonsCount} کارتن · {v.totalNetWeightKg} Kg</div>
                      </div>
                      <button
                        onClick={() => handleAcceptLegacyProductionReceipt(v)}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-black cursor-pointer"
                      >
                        تایید رسید
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 5. WH_SALES_REMITTANCE: حواله فروش و قفل دائمی بارکد / کد ارجاع */}
      {/* --------------------------------------------------------------------------------- */}
      {(activeSubView === 'wh_sales_remittance' || activeSubView === 'wh_exit_remittance') && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-600" />
                  صدور حواله فروش کارخانه (خروج بدون فی + قفل دائمی بارکد)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  هر بارکد / کد ارجاع پس از صدور حواله فروش به‌صورت دائمی قفل می‌شود و امکان صدور حواله فروش مجدد برای آن به‌هیچ‌وجه وجود ندارد.
                </p>
              </div>
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 shrink-0">
                <Lock size={14} />
                <span>قفل یکبارمصرف حواله فروش فعال است</span>
              </div>
            </div>

            {salesScanError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs font-black text-rose-800 dark:text-rose-200 flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-600" />
                  <span className="leading-relaxed">{salesScanError}</span>
                </div>
                <button onClick={() => setSalesScanError(null)} className="p-1 cursor-pointer">
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">انبار مبدا خروج</label>
                <select
                  value={sourceWhForRemittance}
                  onChange={e => {
                    setSourceWhForRemittance(e.target.value);
                    setSelectedCartonsForSales([]);
                    setSalesScanError(null);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">نام خریدار / مشتری *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="نام مشتری یا شرکت خریدار"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">نام راننده حامل</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={e => setDriverName(e.target.value)}
                  placeholder="نام راننده"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">شماره پلاک خودرو</label>
                <input
                  type="text"
                  value={plateNumber}
                  onChange={e => setPlateNumber(e.target.value)}
                  placeholder="۱۲ الف ۳۴۵ ایران ۶۸"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl border border-blue-200 dark:border-blue-800 flex flex-col sm:flex-row items-center gap-2">
              <span className="text-xs font-black text-blue-900 dark:text-blue-300 shrink-0">
                اسکن یا جستجوی بارکد / کد ارجاع:
              </span>
              <div className="flex-1 w-full flex items-center gap-2">
                <input
                  type="text"
                  placeholder="کد ارجاع یا بارکد کارتن را اسکن یا وارد کنید..."
                  value={cartonSearchCode}
                  onChange={e => setCartonSearchCode(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleScanCartonInput(cartonSearchCode);
                  }}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-blue-300 bg-white dark:bg-slate-900 font-mono text-xs font-bold"
                />
                <button
                  onClick={() => handleScanCartonInput(cartonSearchCode)}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  افزودن
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-900 text-white rounded-xl text-xs">
              <div className="text-center">
                <span className="text-slate-400 block text-[10px]">تعداد انتخاب‌شده</span>
                <span className="text-base font-black font-mono tabular-nums">{selectedCartonsForSales.length} کارتن</span>
              </div>
              <div className="text-center border-x border-slate-700">
                <span className="text-slate-400 block text-[10px]">جمع ناخالص</span>
                <span className="text-base font-mono tabular-nums font-bold" dir="ltr">{remTotalGrossWeight} Kg</span>
              </div>
              <div className="text-center">
                <span className="text-emerald-400 block text-[10px]">جمع وزن خالص</span>
                <span className="text-base font-mono tabular-nums font-black text-emerald-400" dir="ltr">{remTotalNetWeight} Kg</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">کارتن‌های این حواله فروش:</h4>
                <button
                  onClick={handleIssueSalesRemittance}
                  disabled={selectedCartonsForSales.length === 0}
                  className="min-h-[44px] px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black disabled:opacity-40 cursor-pointer"
                >
                  صدور حواله فروش و قفل دائمی بارکدها
                </button>
              </div>

              {selectedCartonsForSales.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-600">
                      <tr>
                        <th className="p-2">کد ارجاع</th>
                        <th className="p-2">نام کالا</th>
                        <th className="p-2 text-center">درجه</th>
                        <th className="p-2 text-center">وزن خالص</th>
                        <th className="p-2 text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedCartonsForSales.map(c => (
                        <tr key={c.id}>
                          <td className="p-2 font-mono font-bold text-blue-600">{c.referenceCode}</td>
                          <td className="p-2">{c.productName}</td>
                          <td className="p-2 text-center font-bold">{c.grade}</td>
                          <td className="p-2 text-center font-mono tabular-nums font-black text-emerald-600">{c.netWeightKg} Kg</td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => setSelectedCartonsForSales(prev => prev.filter(x => x.id !== c.id))}
                              className="text-rose-600 p-1 rounded cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
                کارتن‌های آزاد و آماده فروش در {warehouses.find(w => w.id === sourceWhForRemittance)?.name} ({availableCartonsInWh.length} کارتن):
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1">
                {availableCartonsInWh.map(c => {
                  const isSelected = selectedCartonsForSales.some(x => x.id === c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        isSelected
                          ? setSelectedCartonsForSales(prev => prev.filter(x => x.id !== c.id))
                          : handleAddCartonToRemittance(c)
                      }
                      className={`min-h-[60px] p-2 rounded-xl text-right text-xs border cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400'
                      }`}
                    >
                      <div className="font-mono font-bold text-[11px] truncate">{c.referenceCode}</div>
                      <div className="text-[10px] truncate opacity-80">{c.productName}</div>
                      <div className="font-mono tabular-nums font-black text-[11px] mt-1" dir="ltr">{c.netWeightKg} Kg</div>
                    </button>
                  );
                })}
                {availableCartonsInWh.length === 0 && (
                  <div className="col-span-full text-center text-xs text-slate-400 py-4 font-bold">
                    کارتن آزادی در این انبار یافت نشد.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 6. WH_INTER_REMITTANCE & 7. WH_INTER_RECEIPT */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_inter_remittance' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-purple-600" />
                حواله بین‌انبار (انتقال کالا بین دو انبار)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                کارتن‌های انتخاب‌شده پس از صدور حواله در وضعیت «در راه / انتظار تایید مقصد» قفل می‌شوند تا انباردار مقصد رسید آن‌ها را تایید کند.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">انبار مبدا</label>
                <select
                  value={transferSourceWh}
                  onChange={e => {
                    setTransferSourceWh(e.target.value);
                    setSelectedCartonsForTransfer([]);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">انبار مقصد</label>
                <select
                  value={transferTargetWh}
                  onChange={e => setTransferTargetWh(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {warehouses.filter(w => w.id !== transferSourceWh).map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">راننده</label>
                <input
                  type="text"
                  value={transferDriver}
                  onChange={e => setTransferDriver(e.target.value)}
                  placeholder="نام راننده"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">پلاک خودرو</label>
                <input
                  type="text"
                  value={transferPlate}
                  onChange={e => setTransferPlate(e.target.value)}
                  placeholder="پلاک خودرو"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800 text-xs">
              <div>
                <strong className="text-purple-900 dark:text-purple-300 font-mono tabular-nums">
                  {selectedCartonsForTransfer.length} کارتن
                </strong>{' '}
                انتخاب شده برای انتقال
              </div>
              <button
                onClick={handleIssueInterWhTransfer}
                disabled={selectedCartonsForTransfer.length === 0}
                className="min-h-[44px] px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black disabled:opacity-40 cursor-pointer"
              >
                ثبت حواله انتقال بین‌انبار
              </button>
            </div>

            <div>
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
                کارتن‌های آماده انتقال در مبدا ({availableCartonsForTransfer.length} کارتن):
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-56 overflow-y-auto p-1">
                {availableCartonsForTransfer.map(c => {
                  const isSel = selectedCartonsForTransfer.some(x => x.id === c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() =>
                        isSel
                          ? setSelectedCartonsForTransfer(prev => prev.filter(x => x.id !== c.id))
                          : setSelectedCartonsForTransfer(prev => [c, ...prev])
                      }
                      className={`min-h-[60px] p-2 rounded-xl text-right text-xs border cursor-pointer ${
                        isSel
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-purple-400'
                      }`}
                    >
                      <div className="font-mono font-bold text-[11px] truncate">{c.referenceCode}</div>
                      <div className="text-[10px] truncate opacity-80">{c.productName}</div>
                      <div className="font-mono tabular-nums font-black text-[11px] mt-1" dir="ltr">{c.netWeightKg} Kg</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubView === 'wh_inter_receipt' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                رسید حواله بین‌انبار (تایید ورود کالا در انبار مقصد)
              </h2>
              <p className="text-xs text-slate-500 mt-1">تایید ورود رسمی کارتن‌های انتقالی توسط انباردار مقصد</p>
            </div>
            <select
              value={activeReceivingWh}
              onChange={e => setActiveReceivingWh(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-black"
            >
              <option value="ALL">همه انبارهای مقصد</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            {pendingInterWhReceipts.length === 0 ? (
              <div className="py-10 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                حواله بین‌انباری در انتظار تایید ورود برای فیلتر انتخاب‌شده وجود ندارد.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingInterWhReceipts.map(doc => (
                  <div key={doc.id} className="border border-indigo-200 dark:border-indigo-900/50 rounded-2xl p-4 bg-indigo-50/20 dark:bg-slate-800/40 space-y-3">
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between font-mono">
                        <span className="font-black text-indigo-600">{doc.docNo}</span>
                        <span className="text-slate-400">بایگانی: {doc.archiveCode}</span>
                      </div>
                      <div>مبدا: <strong>{doc.sourceWarehouseName}</strong> ← مقصد: <strong>{doc.targetWarehouseName}</strong></div>
                      <div>تعداد: <strong className="font-mono tabular-nums">{doc.cartonsCount} کارتن</strong> · وزن: <strong className="font-mono tabular-nums text-emerald-600">{doc.totalNetWeightKg} Kg</strong></div>
                      <div className="text-slate-400 font-mono">{doc.dateJalali} — {doc.timeExact}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConfirmInterWhReceipt(doc)}
                        className="flex-1 min-h-[44px] py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black cursor-pointer"
                      >
                        تایید ورود در انبار مقصد
                      </button>
                      <button
                        onClick={() => handleCancelInterWhTransfer(doc)}
                        className="min-h-[44px] px-3 py-2 rounded-xl border border-rose-300 text-rose-600 text-xs font-bold cursor-pointer"
                      >
                        لغو انتقال
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 8. WH_SALES_RETURN */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_sales_return' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                رسید مرجوعی از فروش به انبار
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                ثبت کارتن‌های برگشت‌خورده از مشتری. برای جلوگیری از صدور حواله فروش تکراری روی بارکد مرجوعی، قفل فروش بارکد به‌صورت پیش‌فرض حفظ می‌گردد.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">انبار تحویل‌گیرنده مرجوعی</label>
                <select
                  value={returnTargetWh}
                  onChange={e => setReturnTargetWh(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">نام مشتری</label>
                <input
                  type="text"
                  value={returnCustomer}
                  onChange={e => setReturnCustomer(e.target.value)}
                  placeholder="نام مشتری"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">علت مرجوعی</label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300 cursor-pointer">
              <input
                type="checkbox"
                checked={allowUnlockOnReturn}
                onChange={e => setAllowUnlockOnReturn(e.target.checked)}
                className="accent-amber-600 w-4 h-4"
              />
              <span>باز کردن قفل فروش بارکد پس از مرجوعی (فقط در صورت تایید کنترل کیفیت جهت فروش مجدد با همین کد)</span>
            </label>

            <div className="flex items-center gap-2 text-xs">
              <input
                type="text"
                placeholder="کد ارجاع یا بارکد کارتن مرجوعی..."
                value={returnCartonCode}
                onChange={e => setReturnCartonCode(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddCartonToReturn();
                }}
                className="flex-1 min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
              />
              <button
                onClick={handleAddCartonToReturn}
                className="min-h-[40px] px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold cursor-pointer"
              >
                افزودن
              </button>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-bold">کارتن‌های مرجوعی: {selectedCartonsForReturn.length} عدد</span>
              <button
                onClick={handleIssueSalesReturn}
                disabled={selectedCartonsForReturn.length === 0}
                className="min-h-[44px] px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black disabled:opacity-40 cursor-pointer"
              >
                ثبت نهایی رسید مرجوعی فروش
              </button>
            </div>

            {selectedCartonsForReturn.map(c => (
              <div key={c.id} className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-black text-rose-700 dark:text-rose-400 mr-2">{c.referenceCode}</span>
                  <span className="font-bold">{c.productName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono tabular-nums font-bold">{c.netWeightKg} Kg</span>
                  <button
                    onClick={() => setSelectedCartonsForReturn(prev => prev.filter(x => x.id !== c.id))}
                    className="text-rose-600 p-1 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 9. WH_STOCK_ADJUSTMENT: اصلاح دستی مانده انبار (افزایش و کاهش) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_stock_adjustment' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-amber-600" />
                  اصلاح دستی مانده انبار (افزایش یا کاهش موجودی / انبارگردانی)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  تعدیل دستی وزن و تعداد یا کسر کارتن‌های خاص با ثبت علت دقیق و اثر فوری در کاردکس انبار
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-black">
                <button
                  onClick={() => {
                    setAdjMode('INCREASE');
                    setAdjSelectedCartonIds([]);
                  }}
                  className={`min-h-[38px] px-4 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    adjMode === 'INCREASE'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  افزایش موجودی (+)
                </button>
                <button
                  onClick={() => setAdjMode('DECREASE')}
                  className={`min-h-[38px] px-4 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    adjMode === 'DECREASE'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  کاهش موجودی (-)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">انبار مورد نظر *</label>
                <select
                  value={adjWhId}
                  onChange={e => {
                    setAdjWhId(e.target.value);
                    setAdjSelectedCartonIds([]);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">کالا *</label>
                <select
                  value={adjItemId}
                  onChange={e => {
                    setAdjItemId(e.target.value);
                    setAdjSelectedCartonIds([]);
                    const it = allItems.find(x => x.id === e.target.value);
                    if (it) setAdjUnitCost(it.unitCost || 0);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {allItems.map(it => (
                    <option key={it.id} value={it.id}>{it.code} — {it.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">درجه کالا</label>
                <select
                  value={adjGrade}
                  onChange={e => {
                    setAdjGrade(e.target.value as any);
                    setAdjSelectedCartonIds([]);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  <option value="A">درجه A</option>
                  <option value="B">درجه B</option>
                  <option value="C">درجه C</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">موجودی فعلی این ترکیب در انبار</label>
                <div className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono tabular-nums font-black text-emerald-600 flex items-center" dir="ltr">
                  {currentScopedStockForAdj.toLocaleString()} Kg
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">
                  وزن {adjMode === 'INCREASE' ? 'افزایشی' : 'کاهشی'} (کیلوگرم) *
                </label>
                <input
                  type="number"
                  step="0.001"
                  disabled={adjMode === 'DECREASE' && adjSelectedCartonIds.length > 0}
                  value={
                    adjMode === 'DECREASE' && adjSelectedCartonIds.length > 0
                      ? Number(
                          allCartons
                            .filter(c => adjSelectedCartonIds.includes(c.id))
                            .reduce((s, c) => s + Number(c.netWeightKg || 0), 0)
                            .toFixed(3)
                        )
                      : adjWeightKg || ''
                  }
                  onChange={e => setAdjWeightKg(parseFloat(e.target.value) || 0)}
                  placeholder="Kg"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 font-mono tabular-nums font-black"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">تعداد کارتن اصلاحی</label>
                <input
                  type="number"
                  disabled={adjMode === 'DECREASE' && adjSelectedCartonIds.length > 0}
                  value={adjMode === 'DECREASE' && adjSelectedCartonIds.length > 0 ? adjSelectedCartonIds.length : adjCartons || ''}
                  onChange={e => setAdjCartons(parseInt(e.target.value, 10) || 0)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">تاریخ سند اصلاحی</label>
                <input
                  type="text"
                  value={adjDate}
                  onChange={e => setAdjDate(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">نرخ واحد (ریال)</label>
                <input
                  type="number"
                  value={adjUnitCost || ''}
                  onChange={e => setAdjUnitCost(parseInt(e.target.value, 10) || 0)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="font-bold block mb-1">علت و شرح اصلاح مانده انبار *</label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={e => setAdjReason(e.target.value)}
                  placeholder="توضیح دقیق علت افزایش یا کاهش موجودی..."
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            {adjMode === 'INCREASE' && (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adjGenCartonsOnInc}
                  onChange={e => setAdjGenCartonsOnInc(e.target.checked)}
                  className="accent-emerald-600 w-4 h-4"
                />
                <span>صدور بارکد جدید برای کارتن‌های اضافه‌شده</span>
              </label>
            )}

            {adjMode === 'DECREASE' && adjCandidateCartons.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  اختیاری: انتخاب کارتن‌های مشخص برای کسر مستقیم از انبار ({adjCandidateCartons.length} کارتن موجود):
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-40 overflow-y-auto p-1">
                  {adjCandidateCartons.map(c => {
                    const sel = adjSelectedCartonIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setAdjSelectedCartonIds(prev => (sel ? prev.filter(x => x !== c.id) : [...prev, c.id]))
                        }
                        className={`p-2 rounded-xl border text-right text-xs cursor-pointer ${
                          sel ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="font-mono font-bold truncate">{c.referenceCode}</div>
                        <div className="font-mono tabular-nums text-[11px]" dir="ltr">{c.netWeightKg} Kg</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={handleApplyStockAdjustment}
                className={`min-h-[44px] px-6 py-2.5 rounded-xl text-white text-xs font-black flex items-center gap-2 cursor-pointer ${
                  adjMode === 'INCREASE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                <Check size={16} />
                {adjMode === 'INCREASE' ? 'ثبت سند اصلاحی افزایش موجودی' : 'ثبت سند اصلاحی کاهش موجودی'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-black text-xs">
              تاریخچه اسناد اصلاح مانده انبار ({adjustmentDocs.length} سند)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600">
                  <tr>
                    <th className="p-3">سند</th>
                    <th className="p-3">نوع</th>
                    <th className="p-3">انبار</th>
                    <th className="p-3">کالا</th>
                    <th className="p-3 text-center">مقدار (Kg)</th>
                    <th className="p-3">علت اصلاح</th>
                    <th className="p-3 text-center">تاریخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {adjustmentDocs.map(d => (
                    <tr key={d.id}>
                      <td className="p-3 font-mono font-bold">{d.docNo}</td>
                      <td className={`p-3 font-black ${getDocTypeColorClass(d.docType)}`}>
                        {d.docType === 'STOCK_ADJUSTMENT_IN' ? 'افزایش (+)' : 'کاهش (-)'}
                      </td>
                      <td className="p-3 font-bold">{d.targetWarehouseName || d.sourceWarehouseName}</td>
                      <td className="p-3">{d.docItems?.[0]?.itemName || 'کارتنی'}</td>
                      <td className="p-3 text-center font-mono tabular-nums font-black" dir="ltr">
                        {d.docType === 'STOCK_ADJUSTMENT_IN' ? `+${d.totalNetWeightKg}` : `-${d.totalNetWeightKg}`}
                      </td>
                      <td className="p-3 text-slate-500">{d.adjustmentReason || d.notes}</td>
                      <td className="p-3 text-center font-mono">{d.dateJalali}</td>
                    </tr>
                  ))}
                  {adjustmentDocs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                        هنوز سند اصلاح دستی ثبت نشده است.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 10. WH_RECEIPT_ISSUE: رسید خرید و حواله مصرف خط تولید */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_receipt_issue' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  رسید خرید مواد اولیه / حواله مصرف خط تولید
                </h2>
                <p className="text-xs text-slate-500 mt-1">ورود مواد اولیه (POY/مواد شیمیایی) یا خروج حواله مصرف به خطوط تولید</p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-black">
                <button
                  onClick={() => setRiDocType('RECEIPT_PURCHASE')}
                  className={`min-h-[38px] px-4 py-1.5 rounded-lg cursor-pointer ${
                    riDocType === 'RECEIPT_PURCHASE' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  رسید خرید و ورود (+)
                </button>
                <button
                  onClick={() => setRiDocType('ISSUE_PRODUCTION')}
                  className={`min-h-[38px] px-4 py-1.5 rounded-lg cursor-pointer ${
                    riDocType === 'ISSUE_PRODUCTION' ? 'bg-rose-600 text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  حواله مصرف تولید (-)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">انبار</label>
                <select
                  value={riWhId}
                  onChange={e => setRiWhId(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">کالا / ماده اولیه</label>
                <select
                  value={riItemId}
                  onChange={e => {
                    setRiItemId(e.target.value);
                    const it = allItems.find(x => x.id === e.target.value);
                    if (it) setRiUnitCost(it.unitCost || 0);
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {allItems.map(it => (
                    <option key={it.id} value={it.id}>{it.code} — {it.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">وزن خالص (Kg)</label>
                <input
                  type="number"
                  step="0.001"
                  value={riWeightKg || ''}
                  onChange={e => setRiWeightKg(parseFloat(e.target.value) || 0)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono tabular-nums font-black"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">فی هر کیلو (ریال)</label>
                <input
                  type="number"
                  value={riUnitCost || ''}
                  onChange={e => setRiUnitCost(parseInt(e.target.value, 10) || 0)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">تامین‌کننده / خط مصرف‌کننده</label>
                <input
                  type="text"
                  value={riPartyOrLine}
                  onChange={e => setRiPartyOrLine(e.target.value)}
                  placeholder="نام شرکت یا خط تولید"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">تعداد کارتن / بسته</label>
                <input
                  type="number"
                  value={riCartons || ''}
                  onChange={e => setRiCartons(parseInt(e.target.value, 10) || 0)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">درجه</label>
                <select
                  value={riGrade}
                  onChange={e => setRiGrade(e.target.value as any)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  <option value="A">درجه A</option>
                  <option value="B">درجه B</option>
                  <option value="C">درجه C</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">شرح</label>
                <input
                  type="text"
                  value={riNotes}
                  onChange={e => setRiNotes(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSaveReceiptOrIssue}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black cursor-pointer"
              >
                ثبت {getDocTypePersianLabel(riDocType)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 11. WH_ARCHIVE: بایگانی و چاپ اسناد انبار */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_archive' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-600" />
                بایگانی جامع اسناد انبارداری
              </h2>
              <p className="text-xs text-slate-500 mt-1">جستجو و چاپ تمام رسیدها، حواله‌های فروش، تحویل تولید، ابتدای دوره و اصلاحات</p>
            </div>
            <div className="relative">
              <Search size={14} className="absolute right-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="جستجو سند، بایگانی، کد ارجاع، کالا..."
                value={archiveSearchTerm}
                onChange={e => setArchiveSearchTerm(e.target.value)}
                className="w-full sm:w-80 min-h-[40px] pr-8 pl-7 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { id: 'ALL', label: `همه (${warehouseDocs.length})` },
              { id: 'PRODUCTION_DELIVERY', label: 'تحویل از تولید' },
              { id: 'RECEIPT_PRODUCTION', label: 'رسید تولید' },
              { id: 'SALES_REMITTANCE', label: 'حواله فروش' },
              { id: 'INTER_WH_TRANSFER', label: 'حواله بین‌انبار' },
              { id: 'INTER_WH_RECEIPT', label: 'رسید بین‌انبار' },
              { id: 'OPENING_BALANCE', label: 'ابتدای دوره' },
              { id: 'STOCK_ADJUSTMENT_IN', label: 'اصلاح افزایش (+)' },
              { id: 'STOCK_ADJUSTMENT_OUT', label: 'اصلاح کاهش (-)' },
              { id: 'SALES_RETURN', label: 'مرجوعی فروش' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setArchiveFilterType(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer ${
                  archiveFilterType === tab.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">سند / بایگانی</th>
                    <th className="p-3">نوع سند</th>
                    <th className="p-3">مسیر / انبار</th>
                    <th className="p-3">طرف حساب</th>
                    <th className="p-3 text-center">کارتن</th>
                    <th className="p-3 text-center">وزن خالص (Kg)</th>
                    <th className="p-3 text-center">تاریخ و ساعت</th>
                    <th className="p-3 text-center">وضعیت</th>
                    <th className="p-3 text-center">مشاهده / چاپ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredWarehouseDocs.map(doc => (
                    <tr key={doc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3 font-mono font-bold text-teal-600">
                        <div>{doc.docNo}</div>
                        <div className="text-[10px] text-slate-400">بایگانی: {doc.archiveCode}</div>
                      </td>
                      <td className={`p-3 font-black ${getDocTypeColorClass(doc.docType)}`}>{getDocTypePersianLabel(doc.docType)}</td>
                      <td className="p-3">
                        {doc.sourceWarehouseName && <div>از: {doc.sourceWarehouseName}</div>}
                        {doc.targetWarehouseName && <div className="text-slate-500">به: {doc.targetWarehouseName}</div>}
                      </td>
                      <td className="p-3 font-bold">{doc.partyName || '—'}</td>
                      <td className="p-3 text-center font-mono tabular-nums">{doc.cartonsCount}</td>
                      <td className="p-3 text-center font-mono tabular-nums font-black text-emerald-600" dir="ltr">
                        {doc.totalNetWeightKg.toLocaleString()}
                      </td>
                      <td className="p-3 text-center font-mono">
                        <div>{doc.dateJalali}</div>
                        <div className="text-[10px] text-slate-400">{doc.timeExact}</div>
                      </td>
                      <td className="p-3 text-center font-bold">
                        {doc.status === 'COMPLETED' ? 'نهایی' : doc.status === 'CANCELLED' ? 'لغو‌شده' : 'در انتظار رسید'}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setSelectedDocForModal(doc)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye size={13} />
                          مشاهده
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredWarehouseDocs.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">
                        سندی یافت نشد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 12. WH_TRACKING: رهگیری جامع کارتن و وضعیت قفل بارکد */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_tracking' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Hash className="w-5 h-5 text-teal-600" />
              رهگیری شناسنامه و وضعیت قفل کارتن با کد ارجاع / بارکد
            </h2>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                placeholder="کد ارجاع، سریال یا بارکد کارتن..."
                value={trackingCodeInput}
                onChange={e => setTrackingCodeInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTrackCarton();
                }}
                className="flex-1 w-full min-h-[42px] px-4 py-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-slate-50 dark:bg-slate-800 font-mono font-black text-xs"
              />
              <button
                onClick={() => handleTrackCarton()}
                className="w-full sm:w-auto min-h-[42px] px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
              >
                <Search size={15} />
                ردیابی کارتن
              </button>
            </div>
          </div>

          {trackedCarton && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="font-black text-base text-slate-800 dark:text-slate-100">{trackedCarton.productName}</h3>
                    <div className="text-xs font-mono text-slate-500 mt-0.5">
                      کد ارجاع: <strong className="text-orange-600">{trackedCarton.referenceCode}</strong> · سریال: {trackedCarton.serialNumber}
                    </div>
                  </div>
                  <div className="text-xs font-black">
                    {trackedCarton.isSalesLocked || trackedCarton.status === 'SOLD' ? (
                      <span className="text-blue-600 flex items-center gap-1">
                        <Lock size={14} />
                        حواله فروش صادر و قفل‌شده (سند {trackedCarton.lockedByDocNo || trackedCarton.remittanceId || '—'})
                      </span>
                    ) : trackedCarton.status === 'IN_TRANSIT' ? (
                      <span className="text-amber-600">در حال انتقال / انتظار تایید مقصد</span>
                    ) : trackedCarton.status === 'ADJUSTED_OUT' ? (
                      <span className="text-rose-600">کسرشده در اصلاح انبار</span>
                    ) : (
                      <span className="text-emerald-600">
                        موجود در «{warehouses.find(w => w.id === trackedCarton.warehouseId)?.name || 'انبار'}»
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl font-mono tabular-nums">
                  <div>نمره: <strong>{trackedCarton.yarnCount}</strong></div>
                  <div>گرید: <strong>{trackedCarton.grade}</strong></div>
                  <div>ناخالص: <strong>{trackedCarton.grossWeightKg} Kg</strong></div>
                  <div>خالص: <strong className="text-emerald-600">{trackedCarton.netWeightKg} Kg</strong></div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h4 className="font-black text-xs flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-600" />
                  تاریخچه کامل گردش کارتن
                </h4>
                <div className="space-y-2.5">
                  {(trackedCarton.history || []).map((ev, idx) => (
                    <div key={ev.id || idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="font-black text-teal-700 dark:text-teal-300">{ev.title}</strong>
                        <span className="font-mono text-[11px] text-slate-500">{ev.dateJalali} — {ev.timeExact}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{ev.details}</p>
                      <div className="text-[11px] text-slate-400 font-mono">
                        مسئول: {ev.actor} {ev.docNo ? `| سند: ${ev.docNo}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 13. WH_STOCK_REPORT & WH_KARDEX (کاردکس ورود/خروج/مانده وزن + موجودی و نقطه سفارش) */}
      {/* --------------------------------------------------------------------------------- */}
      {(activeSubView === 'wh_stock_report' ||
        activeSubView === 'wh_kardex' ||
        activeSubView === 'wh_stocktaking' ||
        activeSubView === 'wh_cartable') && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          {/* Header & Multi-Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-teal-600" />
                {activeSubView === 'wh_kardex'
                  ? 'کاردکس جامع کالا (وارده / صادره / مانده لحظه‌ای و وزن نهایی)'
                  : 'گزارش موجودی انبارها، تفکیک درجه و نقطه سفارش'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {activeSubView === 'wh_kardex'
                  ? 'ستون‌های وارده و صادره به‌صورت مجزا و کنار هم به همراه محاسبه دقیق مانده وزن نهایی'
                  : 'تلفیق موجودی کارتن‌های باسکول، موجودی ابتدای دوره و سندهای اصلاح انبار'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="relative">
                <Search size={13} className="absolute right-2.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="جستجو کد ارجاع، سند، کالا..."
                  value={kardexSearch}
                  onChange={e => setKardexSearch(e.target.value)}
                  className="w-48 min-h-[38px] pr-7 pl-6 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>

              <select
                value={stockGradeFilter}
                onChange={e => setStockGradeFilter(e.target.value as any)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                <option value="ALL">همه درجه‌ها</option>
                <option value="A">درجه A</option>
                <option value="B">درجه B</option>
                <option value="C">درجه C</option>
              </select>

              <select
                value={kardexItemFilter}
                onChange={e => setKardexItemFilter(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold max-w-[200px]"
              >
                <option value="ALL">همه کالاها</option>
                {allItems.map(it => (
                  <option key={it.id} value={it.id}>{it.code} — {it.name}</option>
                ))}
              </select>

              <select
                value={stockWhFilter}
                onChange={e => setStockWhFilter(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                <option value="ALL">همه انبارها</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>

              <button
                onClick={() => window.print()}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold inline-flex items-center gap-1 cursor-pointer print:hidden"
              >
                <Printer size={14} />
                چاپ
              </button>

              <button
                onClick={() => {
                  if (activeSubView === 'wh_kardex') {
                    csvDownload(
                      `Kardex_${selectedCompany?.id || 'erp'}_${getTodayJalali().replace(/\//g, '-')}.csv`,
                      ['تاریخ', 'سند', 'نوع تراکنش', 'کالا', 'درجه', 'مسیر/انبار', 'وارده (Kg)', 'صادره (Kg)', 'مانده لحظه‌ای (Kg)'],
                      kardexResult.rows.map(r => [
                        r.dateJalali,
                        r.docNo,
                        r.txTitle,
                        r.itemName,
                        r.grade,
                        r.warehouseLabel,
                        r.inNetKg,
                        r.outNetKg,
                        r.runningBalanceKg
                      ])
                    );
                  } else {
                    csvDownload(
                      `StockReport_${selectedCompany?.id || 'erp'}_${getTodayJalali().replace(/\//g, '-')}.csv`,
                      ['کد کالا', 'نام کالا', 'درجه', 'تعداد کارتن', 'موجودی خالص (Kg)', 'در انتظار انتقال (Kg)', 'فروش رفته (Kg)'],
                      stockSummaryRows.map(r => [r.item.code, r.item.name, r.grade, r.inStockCount, r.inStockNetKg, r.inTransitKg, r.soldNetKg])
                    );
                  }
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold inline-flex items-center gap-1 cursor-pointer print:hidden"
              >
                <Download size={14} />
                خروجی اکسل (CSV)
              </button>
            </div>
          </div>

          {/* Low stock alerts */}
          {lowStockWarehouses.length > 0 && (
            <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2 flex-wrap">
              <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              <span>هشدار نقطه سفارش انبار:</span>
              {lowStockWarehouses.map(al => (
                <span key={al.warehouse.id} className="font-mono">
                  {al.warehouse.name} ({al.currentKg} Kg / حداقل {al.minKg} Kg)
                </span>
              ))}
            </div>
          )}

          {/* KARDEX CHRONOLOGICAL LEDGER WITH FINAL WEIGHT BALANCE */}
          {activeSubView === 'wh_kardex' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5">
                  <div className="text-[11px] text-slate-500 font-bold">موجودی اول دوره</div>
                  <div className="font-mono tabular-nums font-black text-base text-slate-800 dark:text-slate-100 mt-1" dir="ltr">
                    {kardexResult.openingKg.toLocaleString()} Kg
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">{kardexResult.openingCartons} کارتن</div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5">
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-bold">جمع کل وارده طی دوره</div>
                  <div className="font-mono tabular-nums font-black text-base text-emerald-600 mt-1" dir="ltr">
                    +{kardexResult.totalInKg.toLocaleString()} Kg
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">+{kardexResult.totalInCartons} کارتن</div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5">
                  <div className="text-[11px] text-rose-700 dark:text-rose-300 font-bold">جمع کل صادره طی دوره</div>
                  <div className="font-mono tabular-nums font-black text-base text-rose-600 mt-1" dir="ltr">
                    -{kardexResult.totalOutKg.toLocaleString()} Kg
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">-{kardexResult.totalOutCartons} کارتن</div>
                </div>
                <div className="bg-slate-900 text-white rounded-2xl p-3.5">
                  <div className="text-[11px] text-emerald-300 font-black">مانده وزن نهایی انبار</div>
                  <div className="font-mono tabular-nums font-black text-lg text-emerald-300 mt-1" dir="ltr">
                    {kardexResult.finalBalanceKg.toLocaleString()} Kg
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono">{kardexResult.finalBalanceCartons} کارتن · {kardexResult.rows.length} ردیف گردش</div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
                  <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                    ریز کاردکس کالا (وارده و صادره کنار هم + مانده ردیف‌به‌ردیف تا مانده وزن نهایی)
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono font-bold">{kardexResult.rows.length} ردیف</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">تاریخ / ساعت</th>
                        <th className="p-3">شماره سند</th>
                        <th className="p-3">شرح تراکنش</th>
                        <th className="p-3">کالا / درجه</th>
                        <th className="p-3">انبار / مسیر</th>
                        <th className="p-3 text-center bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300">
                          وارده (Kg / کارتن)
                        </th>
                        <th className="p-3 text-center bg-rose-50/60 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300">
                          صادره (Kg / کارتن)
                        </th>
                        <th className="p-3 text-center bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-black">
                          مانده وزن لحظه‌ای (Kg)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {kardexResult.rows.map((mv, idx) => (
                        <tr key={mv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-mono">
                            <div className="font-bold">{mv.dateJalali}</div>
                            <div className="text-[10px] text-slate-400">{mv.timeExact}</div>
                          </td>
                          <td className="p-3 font-mono font-bold text-teal-600">{mv.docNo}</td>
                          <td className="p-3 font-bold">
                            <div>{mv.txTitle}</div>
                            {mv.notes && <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{mv.notes}</div>}
                          </td>
                          <td className="p-3">
                            <div className="font-bold">{mv.itemName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{mv.itemCode} · {gradeLabelText(mv.grade)}</div>
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{mv.warehouseLabel}</td>
                          <td className="p-3 text-center font-mono tabular-nums font-black text-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/10" dir="ltr">
                            {mv.direction === 'IN' ? `+${mv.inNetKg.toLocaleString()} (${mv.inCartons})` : '—'}
                          </td>
                          <td className="p-3 text-center font-mono tabular-nums font-black text-rose-600 bg-rose-50/30 dark:bg-rose-950/10" dir="ltr">
                            {mv.direction === 'OUT' ? `-${mv.outNetKg.toLocaleString()} (${mv.outCartons})` : '—'}
                          </td>
                          <td className="p-3 text-center font-mono tabular-nums font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/40" dir="ltr">
                            {mv.runningBalanceKg.toLocaleString()} Kg ({mv.runningBalanceCartons})
                          </td>
                        </tr>
                      ))}
                      {kardexResult.rows.length === 0 && (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">
                            هیچ تراکنشی برای فیلتر انتخاب‌شده یافت نشد.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {kardexResult.rows.length > 0 && (
                      <tfoot className="bg-slate-900 text-white font-black text-xs">
                        <tr>
                          <td colSpan={6} className="p-3 text-right">
                            جمع کل گردش و مانده وزن نهایی ({kardexResult.rows.length} ردیف)
                          </td>
                          <td className="p-3 text-center font-mono tabular-nums text-emerald-300" dir="ltr">
                            +{(kardexResult.openingKg + kardexResult.totalInKg).toLocaleString()} Kg
                          </td>
                          <td className="p-3 text-center font-mono tabular-nums text-rose-300" dir="ltr">
                            -{kardexResult.totalOutKg.toLocaleString()} Kg
                          </td>
                          <td className="p-3 text-center font-mono tabular-nums text-sm text-emerald-300" dir="ltr">
                            {kardexResult.finalBalanceKg.toLocaleString()} Kg ({kardexResult.finalBalanceCartons} کارتن)
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Stock Summary Table + Mobile Cards */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
              <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                جدول موجودی لحظه‌ای کالاها به تفکیک درجه کیفی (شامل ابتدای دوره و تعدیلات)
              </span>
              <span className="text-[11px] text-slate-500 font-mono font-bold">{stockSummaryRows.length} ردیف</span>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {stockSummaryRows.map(row => (
                <div key={row.key} className="p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <strong className="font-black text-slate-800 dark:text-slate-100">{row.item.name}</strong>
                    <span className="font-mono font-black text-emerald-600" dir="ltr">{row.inStockNetKg.toLocaleString()} Kg</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono flex items-center justify-between">
                    <span>{row.item.code} · {gradeLabelText(row.grade)}</span>
                    <span>{row.inStockCount} کارتن</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">کد کالا</th>
                    <th className="p-3">نام کالا</th>
                    <th className="p-3 text-center">درجه</th>
                    <th className="p-3">گروه</th>
                    <th className="p-3 text-center">در راه (انتقال)</th>
                    <th className="p-3 text-center">فروش رفته</th>
                    <th className="p-3 text-center">کارتن موجود</th>
                    <th className="p-3 text-center font-black text-emerald-600">موجودی خالص نهایی (Kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stockSummaryRows.map(row => (
                    <tr
                      key={row.key}
                      onClick={() => {
                        if (activeSubView === 'wh_kardex') {
                          setKardexItemFilter(row.item.id);
                          setStockGradeFilter(row.grade);
                        }
                      }}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 ${
                        activeSubView === 'wh_kardex' ? 'cursor-pointer' : ''
                      }`}
                    >
                      <td className="p-3 font-mono font-bold text-teal-600">{row.item.code}</td>
                      <td className="p-3 font-bold">{row.item.name}</td>
                      <td className="p-3 text-center font-bold">{gradeLabelText(row.grade)}</td>
                      <td className="p-3 text-slate-500">{row.item.groupName || 'عمومی'}</td>
                      <td className="p-3 text-center font-mono tabular-nums text-amber-600" dir="ltr">
                        {row.inTransitKg > 0 ? `${row.inTransitKg.toLocaleString()} (${row.inTransitCount})` : '—'}
                      </td>
                      <td className="p-3 text-center font-mono tabular-nums text-rose-600" dir="ltr">
                        {row.soldNetKg.toLocaleString()} ({row.soldCount})
                      </td>
                      <td className="p-3 text-center font-mono tabular-nums font-bold">{row.inStockCount}</td>
                      <td className="p-3 text-center font-mono tabular-nums font-black text-emerald-600" dir="ltr">
                        {row.inStockNetKg.toLocaleString()} Kg
                      </td>
                    </tr>
                  ))}
                  {stockSummaryRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                        موردی یافت نشد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 14. WACC_PRICING & WACC_RIALI_KARDEX (حسابداری صنعتی و ریالی انبار) */}
      {/* --------------------------------------------------------------------------------- */}
      {(activeSubView === 'wacc_pricing' || activeSubView === 'wacc_riali_kardex') && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-cyan-600" />
                {activeSubView === 'wacc_pricing'
                  ? 'حسابداری انبار و قیمت‌گذاری به روش میانگین موزون (WACC)'
                  : 'کاردکس ریالی-مقداری و صدور سند حسابداری انبار'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                محاسبه بهای تمام‌شده میانگین موزون (ریال/Kg) و صدور سند متوازن به دفتر روزنامه حسابداری
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={waccWhFilter}
                onChange={e => setWaccWhFilter(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                <option value="ALL">کل انبارها</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <button
                onClick={handleApplyWaccToItems}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-black cursor-pointer"
              >
                اعمال نرخ WACC روی کالاها
              </button>
              <select
                value={voucherMode}
                onChange={e => setVoucherMode(e.target.value as any)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                <option value="PRODUCTION_RECEIPT">سند جذب تولید</option>
                <option value="PURCHASE_RECEIPT">سند خرید انبار</option>
                <option value="SALES_COGS">سند بهای تمام‌شده فروش</option>
                <option value="OPENING_INVENTORY">سند افتتاحیه انبار</option>
                <option value="ADJUSTMENT">سند کسر و اضافات انبار</option>
              </select>
              <button
                onClick={handleIssueWarehouseAccountingVoucher}
                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black inline-flex items-center gap-1.5 cursor-pointer"
              >
                <BookOpen size={14} />
                صدور سند حسابداری
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-slate-500 font-bold">ارزش ریالی کل موجودی پایان دوره</div>
              <div className="font-mono tabular-nums font-black text-lg text-emerald-600 mt-1" dir="ltr">
                {waccSummary.totalEndingValueRials.toLocaleString()} ریال
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <div className="text-slate-500 font-bold">بهای تمام‌شده صادره / مصرف / فروش</div>
              <div className="font-mono tabular-nums font-black text-lg text-rose-600 mt-1" dir="ltr">
                {waccSummary.totalOutValueRials.toLocaleString()} ریال
              </div>
            </div>
            <div className="bg-slate-900 text-white rounded-2xl p-4">
              <div className="text-slate-300 font-bold">تعداد گروه‌های ارزیابی‌شده (کالا × درجه)</div>
              <div className="font-mono tabular-nums font-black text-lg text-cyan-300 mt-1">
                {waccSummary.itemSummaries.length} ردیف
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">کد / نام کالا</th>
                    <th className="p-3 text-center">درجه</th>
                    <th className="p-3 text-center">اول دوره (Kg)</th>
                    <th className="p-3 text-center">وارده (Kg)</th>
                    <th className="p-3 text-center">صادره (Kg)</th>
                    <th className="p-3 text-center">مانده پایان (Kg)</th>
                    <th className="p-3 text-center text-cyan-600">نرخ میانگین موزون (ریال)</th>
                    <th className="p-3 text-center text-emerald-600 font-black">ارزش پایان دوره (ریال)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {waccSummary.itemSummaries.map(s => (
                    <tr key={`${s.item.id}_${s.grade}`}>
                      <td className="p-3 font-bold">
                        <div>{s.item.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{s.item.code}</div>
                      </td>
                      <td className="p-3 text-center font-bold">{s.grade}</td>
                      <td className="p-3 text-center font-mono tabular-nums">{s.openingKg.toLocaleString()}</td>
                      <td className="p-3 text-center font-mono tabular-nums text-emerald-600">+{s.inKg.toLocaleString()}</td>
                      <td className="p-3 text-center font-mono tabular-nums text-rose-600">-{s.outKg.toLocaleString()}</td>
                      <td className="p-3 text-center font-mono tabular-nums font-black">{s.endingKg.toLocaleString()}</td>
                      <td className="p-3 text-center font-mono tabular-nums font-bold text-cyan-600" dir="ltr">
                        {s.waccUnitCostRials.toLocaleString()}
                      </td>
                      <td className="p-3 text-center font-mono tabular-nums font-black text-emerald-600" dir="ltr">
                        {s.endingValueRials.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {waccSummary.itemSummaries.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                        گردش انباری برای محاسبه میانگین موزون ثبت نشده است.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: ADD / EDIT WAREHOUSE */}
      {/* --------------------------------------------------------------------------------- */}
      {showAddWhModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                {whForm.id ? 'ویرایش اطلاعات انبار' : 'تعریف انبار جدید'}
              </h3>
              <button onClick={() => setShowAddWhModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">کد انبار *</label>
                  <input
                    type="text"
                    value={whForm.code || ''}
                    onChange={e => setWhForm({ ...whForm, code: e.target.value })}
                    placeholder="WH-01"
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">نوع کاربری انبار</label>
                  <select
                    value={whForm.type || 'FINISHED_YARN'}
                    onChange={e => setWhForm({ ...whForm, type: e.target.value as ErpWarehouse['type'] })}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                  >
                    {WAREHOUSE_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bold block mb-1">نام انبار *</label>
                <input
                  type="text"
                  value={whForm.name || ''}
                  onChange={e => setWhForm({ ...whForm, name: e.target.value })}
                  placeholder="مثال: انبار مرکزی کارخانه"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold block mb-1">موقعیت انبار</label>
                  <input
                    type="text"
                    value={whForm.location || ''}
                    onChange={e => setWhForm({ ...whForm, location: e.target.value })}
                    placeholder="سوله شماره ۱"
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">مسئول انبار</label>
                  <input
                    type="text"
                    value={whForm.managerName || ''}
                    onChange={e => setWhForm({ ...whForm, managerName: e.target.value })}
                    placeholder="نام انباردار"
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">حداقل موجودی (نقطه سفارش Kg)</label>
                  <input
                    type="number"
                    value={whForm.minStockKg ?? 0}
                    onChange={e => setWhForm({ ...whForm, minStockKg: parseFloat(e.target.value) || 0 })}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
              </div>
              {groups.length > 0 && (
                <div>
                  <label className="font-bold block mb-1">گروه‌های کالایی مجاز (خالی = همه گروه‌ها)</label>
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-slate-200 dark:border-slate-700 max-h-28 overflow-y-auto">
                    {groups.map(g => {
                      const checked = (whForm.assignedGroupIds || []).includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            const cur = whForm.assignedGroupIds || [];
                            setWhForm({
                              ...whForm,
                              assignedGroupIds: checked ? cur.filter(x => x !== g.id) : [...cur, g.id]
                            });
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                            checked ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddWhModal(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 cursor-pointer"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveWarehouse}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black cursor-pointer"
              >
                ذخیره انبار
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: VIEW & PRINT WAREHOUSE DOCUMENT DETAILS */}
      {/* --------------------------------------------------------------------------------- */}
      {selectedDocForModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-600" />
                  {getDocTypePersianLabel(selectedDocForModal.docType)} — شماره {selectedDocForModal.docNo}
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  {selectedCompany?.name || ''} · کد بایگانی: {selectedDocForModal.archiveCode}
                </span>
              </div>
              <button onClick={() => setSelectedDocForModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer print:hidden">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl text-xs">
              <div>انبار مبدا: <strong>{selectedDocForModal.sourceWarehouseName || '—'}</strong></div>
              <div>انبار مقصد: <strong>{selectedDocForModal.targetWarehouseName || '—'}</strong></div>
              <div>طرف حساب: <strong>{selectedDocForModal.partyName || '—'}</strong></div>
              <div>تاریخ / ساعت: <strong className="font-mono">{selectedDocForModal.dateJalali} {selectedDocForModal.timeExact}</strong></div>
              <div>تعداد کارتن: <strong className="font-mono tabular-nums">{selectedDocForModal.cartonsCount}</strong></div>
              <div>وزن خالص کل: <strong className="font-mono tabular-nums text-emerald-600">{selectedDocForModal.totalNetWeightKg} Kg</strong></div>
              <div>ثبت‌کننده: <strong>{selectedDocForModal.createdBy}</strong></div>
              <div>تاییدکننده: <strong>{selectedDocForModal.receiverUserName || '—'}</strong></div>
            </div>

            {selectedDocForModal.notes && (
              <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-xl">
                شرح: {selectedDocForModal.notes}
              </div>
            )}

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-600">
                  <tr>
                    <th className="p-2">ردیف</th>
                    <th className="p-2">کد ارجاع / کد کالا</th>
                    <th className="p-2">نام کالا</th>
                    <th className="p-2 text-center">تعداد</th>
                    <th className="p-2 text-center">وزن خالص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {allCartons.filter(c => selectedDocForModal.cartonIds?.includes(c.id)).length > 0
                    ? allCartons
                        .filter(c => selectedDocForModal.cartonIds?.includes(c.id))
                        .map((c, i) => (
                          <tr key={c.id}>
                            <td className="p-2 text-slate-400 font-mono">{i + 1}</td>
                            <td className="p-2 font-mono font-bold text-teal-600">{c.referenceCode}</td>
                            <td className="p-2">{c.productName}</td>
                            <td className="p-2 text-center font-mono">1 ({c.conesCount} دوک)</td>
                            <td className="p-2 text-center font-mono tabular-nums font-black text-emerald-600">{c.netWeightKg} Kg</td>
                          </tr>
                        ))
                    : (selectedDocForModal.docItems || []).map((ln, i) => (
                        <tr key={ln.id || i}>
                          <td className="p-2 text-slate-400 font-mono">{i + 1}</td>
                          <td className="p-2 font-mono font-bold text-teal-600">{ln.itemCode}</td>
                          <td className="p-2">{ln.itemName} (درجه {ln.grade})</td>
                          <td className="p-2 text-center font-mono tabular-nums">{ln.cartonsCount}</td>
                          <td className="p-2 text-center font-mono tabular-nums font-black text-emerald-600">{ln.netWeightKg} Kg</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer size={14} />
                چاپ سند رسمی انبار
              </button>
              <button
                onClick={() => setSelectedDocForModal(null)}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
