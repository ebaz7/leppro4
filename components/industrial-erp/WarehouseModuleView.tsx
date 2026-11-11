import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  Printer,
  RefreshCw,
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
  Sparkles,
  BarChart3,
  Calendar,
  User as UserIcon,
  ShieldCheck,
  Hash
} from 'lucide-react';
import QRCode from 'qrcode';
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
  ErpCartonHistoryEvent,
  getTodayJalali,
  getExactTimeNow
} from './types';
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

export const WarehouseModuleView: React.FC<WarehouseModuleViewProps> = ({
  activeSubView,
  selectedCompany,
  erpState,
  setErpState,
  persistErpState,
  currentUser,
  showToast,
  openSubViewTab
}) => {
  // Warehouses fallback
  const warehouses: ErpWarehouse[] = useMemo(() => {
    if (erpState.warehouses && erpState.warehouses.length > 0) {
      return erpState.warehouses;
    }
    return [
      { id: 'wh_finished', code: 'WH-01', name: 'انبار محصول نخ کارخانه', type: 'FINISHED_YARN', location: 'سالن اصلی کارخانه', managerName: 'مرتضی احمدی', assignedGroupIds: ['grp_dty', 'grp_fdy'] },
      { id: 'wh_temp_line', code: 'WH-02', name: 'انبار موقت پای خط تولید', type: 'GENERAL', location: 'انتهای سالن تکسچرایزینگ', managerName: 'علی رضایی', assignedGroupIds: ['grp_dty'] },
      { id: 'wh_tehran', code: 'WH-03', name: 'انبار مرکزی تهران (شوروم)', type: 'FINISHED_YARN', location: 'تهران - بازار بزرگ', managerName: 'حسین محمدی', assignedGroupIds: ['grp_dty', 'grp_fdy'] },
      { id: 'wh_raw', code: 'WH-04', name: 'انبار مواد اولیه (POY و کارتن)', type: 'RAW_MATERIAL', location: 'انبار سوله شمالی', managerName: 'جعفر صالحی', assignedGroupIds: ['grp_poy', 'grp_pack'] },
      { id: 'wh_waste', code: 'WH-05', name: 'انبار ضایعات و بازیافت', type: 'WASTE', location: 'محوطه باز کارخانه', managerName: 'رضا حسینی', assignedGroupIds: ['grp_waste'] }
    ];
  }, [erpState.warehouses]);

  // Commodity groups
  const groups: ErpCommodityGroup[] = useMemo(() => {
    return erpState.commodityGroups || [
      { id: 'grp_dty', code: 'GRP-01', name: 'نخ‌های تکسچره پلی‌استر (DTY)' },
      { id: 'grp_poy', code: 'GRP-02', name: 'نخ‌های ممتد اولیه (POY)' },
      { id: 'grp_fdy', code: 'GRP-03', name: 'نخ‌های کاملاً کشیده شده (FDY)' },
      { id: 'grp_pack', code: 'GRP-04', name: 'ملزومات بسته‌بندی کارتن و دوک' },
      { id: 'grp_waste', code: 'GRP-05', name: 'ضایعات خطوط تولید' }
    ];
  }, [erpState.commodityGroups]);

  // Warehouse documents
  const warehouseDocs: ErpWarehouseDocument[] = useMemo(() => {
    return erpState.warehouseDocuments || [];
  }, [erpState.warehouseDocuments]);

  // All carton labels
  const allCartons: ErpCartonLabel[] = useMemo(() => {
    return erpState.cartonLabels || [];
  }, [erpState.cartonLabels]);

  // -------------------------------------------------------------
  // 1. SUBVIEW: WH_WAREHOUSES (تعریف انبارها و تخصیص گروه/کالا)
  // -------------------------------------------------------------
  const [showAddWhModal, setShowAddWhModal] = useState(false);
  const [whForm, setWhForm] = useState<Partial<ErpWarehouse>>({
    code: '',
    name: '',
    type: 'FINISHED_YARN',
    location: '',
    managerName: '',
    assignedGroupIds: []
  });

  const handleSaveWarehouse = async () => {
    if (!whForm.name || !whForm.code) {
      showToast?.('error', 'لطفاً کد و نام انبار را وارد نمایید');
      return;
    }
    const newWh: ErpWarehouse = {
      id: whForm.id || `wh_${Date.now()}`,
      code: whForm.code,
      name: whForm.name,
      type: whForm.type || 'FINISHED_YARN',
      location: whForm.location || '',
      managerName: whForm.managerName || '',
      assignedGroupIds: whForm.assignedGroupIds || []
    };
    const currentWhs = erpState.warehouses && erpState.warehouses.length > 0 ? erpState.warehouses : warehouses;
    const exists = currentWhs.some(w => w.id === newWh.id);
    const updated = exists ? currentWhs.map(w => w.id === newWh.id ? newWh : w) : [...currentWhs, newWh];
    await persistErpState({ ...erpState, warehouses: updated }, 'اطلاعات انبار با موفقیت ذخیره شد');
    setShowAddWhModal(false);
    setWhForm({ code: '', name: '', type: 'FINISHED_YARN', location: '', managerName: '', assignedGroupIds: [] });
  };

  // -------------------------------------------------------------
  // 2. SUBVIEW: WH_RECEIPT_PRODUCTION (رسید تحویل کالا از تولید)
  // -------------------------------------------------------------
  const [targetWhForReceipt, setTargetWhForReceipt] = useState<string>(warehouses[0]?.id || 'wh_finished');
  
  // Pending production batches waiting for delivery to warehouse
  const pendingProductionVouchers = useMemo(() => {
    return (erpState.productionVouchers || []).filter(v => v.status === 'PENDING_WAREHOUSE_DELIVERY');
  }, [erpState.productionVouchers]);

  const handleAcceptProductionDelivery = async (voucher: ErpProductionVoucher) => {
    const selWh = warehouses.find(w => w.id === targetWhForReceipt);
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const cleanDate = dateToday.replace(/\//g, '');
    const docSeq = (warehouseDocs.length + 1);
    const docNo = `REC-PRD-${cleanDate}-${String(docSeq).padStart(4, '0')}`;
    const archiveCode = `WH-ARC-${cleanDate}-${String(docSeq).padStart(4, '0')}`;

    // Update cartons warehouseId & add history event
    const updatedCartons = allCartons.map(c => {
      if (voucher.cartonIds?.includes(c.id) || c.productionVoucherNo === voucher.voucherNo) {
        const histEvent: ErpCartonHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random()}`,
          stage: 'WAREHOUSE_RECEIPT',
          title: `رسید ورود به ${selWh?.name}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: currentUser?.fullName || 'مسئول انبار',
          details: `ورود رسمی به ${selWh?.name} طبق سند تحویل تولید ${voucher.voucherNo}`,
          docNo,
          archiveCode
        };
        return {
          ...c,
          warehouseId: targetWhForReceipt,
          history: [...(c.history || []), histEvent]
        };
      }
      return c;
    });

    // Update voucher status
    const updatedVouchers = (erpState.productionVouchers || []).map(v => {
      if (v.id === voucher.id) {
        return {
          ...v,
          status: 'DELIVERED_TO_WAREHOUSE' as const,
          deliveredWarehouseId: targetWhForReceipt,
          deliveredWarehouseName: selWh?.name,
          deliveredDocNo: docNo
        };
      }
      return v;
    });

    const newDoc: ErpWarehouseDocument = {
      id: `whdoc_${Date.now()}`,
      docNo,
      archiveCode,
      docType: 'RECEIPT_PRODUCTION',
      dateJalali: dateToday,
      timeExact: exactTime,
      targetWarehouseId: targetWhForReceipt,
      targetWarehouseName: selWh?.name,
      productionVoucherId: voucher.id,
      cartonIds: voucher.cartonIds || [],
      cartonsCount: voucher.cartonsCount,
      totalGrossWeightKg: voucher.totalGrossWeightKg,
      totalNetWeightKg: voucher.totalNetWeightKg,
      status: 'COMPLETED',
      receiverUserName: currentUser?.fullName || 'انباردار',
      createdBy: currentUser?.fullName || 'انباردار',
      notes: `رسید تحویل کالا از خط ${voucher.lineName} به ${selWh?.name}`
    };

    const nextState: IndustrialErpState = {
      ...erpState,
      cartonLabels: updatedCartons,
      productionVouchers: updatedVouchers,
      warehouseDocuments: [newDoc, ...warehouseDocs]
    };

    await persistErpState(nextState, `رسید ورود انبار ${docNo} با موفقیت ثبت شد و کالاها وارد انبار گردیدند`);
  };

  // -------------------------------------------------------------
  // 3. SUBVIEW: WH_SALES_REMITTANCE (حواله فروش کارخانه - خروج بدون فی)
  // -------------------------------------------------------------
  const [sourceWhForRemittance, setSourceWhForRemittance] = useState<string>(warehouses[0]?.id || 'wh_finished');
  const [customerName, setCustomerName] = useState<string>('شرکت نساجی اصفهان');
  const [driverName, setDriverName] = useState<string>('');
  const [plateNumber, setPlateNumber] = useState<string>('');
  const [cartonSearchCode, setCartonSearchCode] = useState<string>('');
  const [selectedCartonsForSales, setSelectedCartonsForSales] = useState<ErpCartonLabel[]>([]);

  // Cartons available in this warehouse
  const availableCartonsInWh = useMemo(() => {
    return allCartons.filter(c => c.warehouseId === sourceWhForRemittance && (c.status === 'IN_STOCK' || !c.status));
  }, [allCartons, sourceWhForRemittance]);

  // Scan or add carton by code
  const handleAddCartonToRemittance = (carton: ErpCartonLabel) => {
    if (selectedCartonsForSales.some(c => c.id === carton.id)) {
      showToast?.('error', 'این کارتن قبلاً به لیست حواله اضافه شده است');
      return;
    }
    setSelectedCartonsForSales(prev => [carton, ...prev]);
  };

  const handleScanCartonInput = (code: string) => {
    if (!code.trim()) return;
    const clean = code.trim().toLowerCase();
    const found = availableCartonsInWh.find(c =>
      c.referenceCode.toLowerCase() === clean ||
      c.serialNumber.toLowerCase() === clean ||
      c.qrPayload.toLowerCase().includes(clean)
    );
    if (found) {
      handleAddCartonToRemittance(found);
      setCartonSearchCode('');
      showToast?.('success', `کارتن ${found.referenceCode} افزوده شد`);
    } else {
      showToast?.('error', 'کارتنی با این بارکد/کد ارجاع در این انبار یافت نشد');
    }
  };

  const remTotalNetWeight = useMemo(() => {
    return Number(selectedCartonsForSales.reduce((sum, c) => sum + c.netWeightKg, 0).toFixed(3));
  }, [selectedCartonsForSales]);
  const remTotalGrossWeight = useMemo(() => {
    return Number(selectedCartonsForSales.reduce((sum, c) => sum + c.grossWeightKg, 0).toFixed(3));
  }, [selectedCartonsForSales]);

  const handleIssueSalesRemittance = async () => {
    if (selectedCartonsForSales.length === 0) {
      showToast?.('error', 'لطفاً حداقل یک کارتن را برای صدور حواله فروش انتخاب نمایید');
      return;
    }
    if (!customerName.trim()) {
      showToast?.('error', 'لطفاً نام مشتری / خریدار را وارد نمایید');
      return;
    }
    const selWh = warehouses.find(w => w.id === sourceWhForRemittance);
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const cleanDate = dateToday.replace(/\//g, '');
    const docSeq = (warehouseDocs.length + 1);
    const docNo = `REM-SAL-${cleanDate}-${String(docSeq).padStart(4, '0')}`;
    const archiveCode = `WH-ARC-${cleanDate}-${String(docSeq).padStart(4, '0')}`;

    const remCartonIds = selectedCartonsForSales.map(c => c.id);

    // Update carton statuses & add history event
    const updatedCartons = allCartons.map(c => {
      if (remCartonIds.includes(c.id)) {
        const histEvent: ErpCartonHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random()}`,
          stage: 'SALES_REMITTANCE',
          title: `حواله فروش و خروج کارخانه به ${customerName}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: currentUser?.fullName || 'انباردار کارخانه',
          details: `خروج از ${selWh?.name} | راننده: ${driverName || '—'} | پلاک: ${plateNumber || '—'}`,
          docNo,
          archiveCode
        };
        return {
          ...c,
          status: 'SOLD' as const,
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
      sourceWarehouseId: sourceWhForRemittance,
      sourceWarehouseName: selWh?.name,
      partyName: customerName,
      driverName,
      plateNumber,
      cartonIds: remCartonIds,
      cartonsCount: selectedCartonsForSales.length,
      totalGrossWeightKg: remTotalGrossWeight,
      totalNetWeightKg: remTotalNetWeight,
      status: 'COMPLETED',
      createdBy: currentUser?.fullName || 'انباردار کارخانه',
      notes: `حواله خروج فروش کارخانه (بدون فی) برای ${customerName}`
    };

    const nextState: IndustrialErpState = {
      ...erpState,
      cartonLabels: updatedCartons,
      warehouseDocuments: [newDoc, ...warehouseDocs]
    };

    await persistErpState(nextState, `حواله فروش ${docNo} با کد بایگانی ${archiveCode} صادر گردید`);
    setSelectedCartonsForSales([]);
    setDriverName('');
    setPlateNumber('');
  };

  // -------------------------------------------------------------
  // 4. SUBVIEW: WH_INTER_REMITTANCE (حواله بین انبار - انتقال)
  // -------------------------------------------------------------
  const [transferSourceWh, setTransferSourceWh] = useState<string>(warehouses[0]?.id || 'wh_finished');
  const [transferTargetWh, setTransferTargetWh] = useState<string>(warehouses[2]?.id || 'wh_tehran');
  const [selectedCartonsForTransfer, setSelectedCartonsForTransfer] = useState<ErpCartonLabel[]>([]);
  const [transferDriver, setTransferDriver] = useState<string>('');
  const [transferPlate, setTransferPlate] = useState<string>('');

  const availableCartonsForTransfer = useMemo(() => {
    return allCartons.filter(c => c.warehouseId === transferSourceWh && (c.status === 'IN_STOCK' || !c.status));
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
    const srcWh = warehouses.find(w => w.id === transferSourceWh);
    const tgtWh = warehouses.find(w => w.id === transferTargetWh);
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const cleanDate = dateToday.replace(/\//g, '');
    const docSeq = (warehouseDocs.length + 1);
    const docNo = `TRF-${cleanDate}-${String(docSeq).padStart(4, '0')}`;
    const archiveCode = `WH-ARC-${cleanDate}-${String(docSeq).padStart(4, '0')}`;

    const trfCartonIds = selectedCartonsForTransfer.map(c => c.id);
    const totNet = Number(selectedCartonsForTransfer.reduce((sum, c) => sum + c.netWeightKg, 0).toFixed(3));
    const totGross = Number(selectedCartonsForTransfer.reduce((sum, c) => sum + c.grossWeightKg, 0).toFixed(3));

    // Update carton history and mark in transit
    const updatedCartons = allCartons.map(c => {
      if (trfCartonIds.includes(c.id)) {
        const histEvent: ErpCartonHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random()}`,
          stage: 'INTER_WH_TRANSFER',
          title: `حواله انتقال از ${srcWh?.name} به ${tgtWh?.name}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: currentUser?.fullName || 'انباردار مبدا',
          details: `صدور حواله انتقال بین‌انبار | راننده: ${transferDriver || '—'}`,
          docNo,
          archiveCode
        };
        return {
          ...c,
          history: [...(c.history || []), histEvent]
        };
      }
      return c;
    });

    const newDoc: ErpWarehouseDocument = {
      id: `whdoc_${Date.now()}`,
      docNo,
      archiveCode,
      docType: 'INTER_WH_TRANSFER',
      dateJalali: dateToday,
      timeExact: exactTime,
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
      status: 'PENDING_RECEIPT', // Waiting for target warehouse confirmation!
      createdBy: currentUser?.fullName || 'انباردار مبدا',
      notes: `حواله انتقال از ${srcWh?.name} به ${tgtWh?.name}`
    };

    const nextState: IndustrialErpState = {
      ...erpState,
      cartonLabels: updatedCartons,
      warehouseDocuments: [newDoc, ...warehouseDocs]
    };

    await persistErpState(nextState, `حواله بین‌انبار ${docNo} ثبت شد و در انتظار تایید ورود در ${tgtWh?.name} قرار گرفت`);
    setSelectedCartonsForTransfer([]);
  };

  // -------------------------------------------------------------
  // 5. SUBVIEW: WH_INTER_RECEIPT (رسید حواله بین انبار - تایید ورود مقصد)
  // -------------------------------------------------------------
  const [activeReceivingWh, setActiveReceivingWh] = useState<string>(warehouses[2]?.id || 'wh_tehran');

  // Transfers waiting for confirmation by activeReceivingWh
  const pendingInterWhReceipts = useMemo(() => {
    return warehouseDocs.filter(d =>
      d.docType === 'INTER_WH_TRANSFER' &&
      d.status === 'PENDING_RECEIPT' &&
      (!activeReceivingWh || d.targetWarehouseId === activeReceivingWh)
    );
  }, [warehouseDocs, activeReceivingWh]);

  const handleConfirmInterWhReceipt = async (transferDoc: ErpWarehouseDocument) => {
    const tgtWh = warehouses.find(w => w.id === transferDoc.targetWarehouseId);
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const cleanDate = dateToday.replace(/\//g, '');
    const docSeq = (warehouseDocs.length + 1);
    const docNo = `REC-TRF-${cleanDate}-${String(docSeq).padStart(4, '0')}`;
    const archiveCode = `WH-ARC-${cleanDate}-${String(docSeq).padStart(4, '0')}`;

    // Move cartons to target warehouse & stamp receipt history
    const updatedCartons = allCartons.map(c => {
      if (transferDoc.cartonIds?.includes(c.id)) {
        const histEvent: ErpCartonHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random()}`,
          stage: 'INTER_WH_RECEIPT',
          title: `رسید تایید ورود در ${tgtWh?.name}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: currentUser?.fullName || 'انباردار مقصد',
          details: `تایید وصول و تحویل کالا در ${tgtWh?.name} عطف به حواله ${transferDoc.docNo}`,
          docNo,
          archiveCode
        };
        return {
          ...c,
          warehouseId: transferDoc.targetWarehouseId || 'wh_tehran',
          history: [...(c.history || []), histEvent]
        };
      }
      return c;
    });

    // Mark transferDoc as completed
    const updatedDocs = warehouseDocs.map(d => {
      if (d.id === transferDoc.id) {
        return { ...d, status: 'COMPLETED' as const, receiverUserName: currentUser?.fullName || 'انباردار مقصد' };
      }
      return d;
    });

    const newDoc: ErpWarehouseDocument = {
      id: `whdoc_${Date.now()}`,
      docNo,
      archiveCode,
      docType: 'INTER_WH_RECEIPT',
      dateJalali: dateToday,
      timeExact: exactTime,
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
      receiverUserName: currentUser?.fullName || 'انباردار مقصد',
      createdBy: currentUser?.fullName || 'انباردار مقصد',
      notes: `رسید تایید ورود حواله انتقال ${transferDoc.docNo}`
    };

    const nextState: IndustrialErpState = {
      ...erpState,
      cartonLabels: updatedCartons,
      warehouseDocuments: [newDoc, ...updatedDocs]
    };

    await persistErpState(nextState, `رسید ورود ${docNo} ثبت شد و کارتن‌ها رسماً وارد انبار مقصد گردیدند`);
  };

  // -------------------------------------------------------------
  // 6. SUBVIEW: WH_SALES_RETURN (رسید مرجوعی از فروش)
  // -------------------------------------------------------------
  const [returnTargetWh, setReturnTargetWh] = useState<string>(warehouses[0]?.id || 'wh_finished');
  const [returnCustomer, setReturnCustomer] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('عدم تطابق شید رنگ در خط بافت');
  const [returnCartonCode, setReturnCartonCode] = useState<string>('');
  const [selectedCartonsForReturn, setSelectedCartonsForReturn] = useState<ErpCartonLabel[]>([]);

  const handleAddCartonToReturn = () => {
    if (!returnCartonCode.trim()) return;
    const clean = returnCartonCode.trim().toLowerCase();
    const found = allCartons.find(c =>
      c.referenceCode.toLowerCase() === clean ||
      c.serialNumber.toLowerCase() === clean
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
    const cleanDate = dateToday.replace(/\//g, '');
    const docSeq = (warehouseDocs.length + 1);
    const docNo = `RET-SAL-${cleanDate}-${String(docSeq).padStart(4, '0')}`;
    const archiveCode = `WH-ARC-${cleanDate}-${String(docSeq).padStart(4, '0')}`;

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
          actor: currentUser?.fullName || 'انباردار',
          details: `علت مرجوعی: ${returnReason} | مشتری: ${returnCustomer || '—'}`,
          docNo,
          archiveCode
        };
        return {
          ...c,
          warehouseId: returnTargetWh,
          status: 'RETURNED' as const,
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
      targetWarehouseId: returnTargetWh,
      targetWarehouseName: tgtWh?.name,
      partyName: returnCustomer || 'مشتری نامشخص',
      cartonIds: retCartonIds,
      cartonsCount: selectedCartonsForReturn.length,
      totalGrossWeightKg: totGross,
      totalNetWeightKg: totNet,
      status: 'COMPLETED',
      createdBy: currentUser?.fullName || 'انباردار',
      notes: `مرجوعی از فروش به دلیل: ${returnReason}`
    };

    const nextState: IndustrialErpState = {
      ...erpState,
      cartonLabels: updatedCartons,
      warehouseDocuments: [newDoc, ...warehouseDocs]
    };

    await persistErpState(nextState, `رسید مرجوعی ${docNo} ثبت گردید و کالاها به موجودی انبار بازگشتند`);
    setSelectedCartonsForReturn([]);
  };

  // -------------------------------------------------------------
  // 7. SUBVIEW: WH_ARCHIVE (بایگانی جامع اسناد انبار)
  // -------------------------------------------------------------
  const [archiveFilterType, setArchiveFilterType] = useState<string>('ALL');
  const [archiveSearchTerm, setArchiveSearchTerm] = useState<string>('');
  const [selectedDocForModal, setSelectedDocForModal] = useState<ErpWarehouseDocument | null>(null);

  const filteredWarehouseDocs = useMemo(() => {
    return warehouseDocs.filter(d => {
      if (archiveFilterType !== 'ALL' && d.docType !== archiveFilterType) return false;
      if (archiveSearchTerm.trim()) {
        const q = archiveSearchTerm.toLowerCase();
        return (
          d.docNo.toLowerCase().includes(q) ||
          d.archiveCode.toLowerCase().includes(q) ||
          (d.partyName && d.partyName.toLowerCase().includes(q)) ||
          (d.sourceWarehouseName && d.sourceWarehouseName.toLowerCase().includes(q)) ||
          (d.targetWarehouseName && d.targetWarehouseName.toLowerCase().includes(q)) ||
          d.dateJalali.includes(q)
        );
      }
      return true;
    });
  }, [warehouseDocs, archiveFilterType, archiveSearchTerm]);

  const getDocTypeBadge = (type: ErpWarehouseDocType) => {
    switch (type) {
      case 'RECEIPT_PRODUCTION':
        return <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 px-2 py-0.5 rounded-full text-[10px] font-black">رسید تحویل از تولید</span>;
      case 'SALES_REMITTANCE':
        return <span className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 px-2 py-0.5 rounded-full text-[10px] font-black">حواله فروش کارخانه</span>;
      case 'INTER_WH_TRANSFER':
        return <span className="bg-purple-50 dark:bg-purple-950/40 text-purple-600 px-2 py-0.5 rounded-full text-[10px] font-black">حواله بین‌انبار (انتقال)</span>;
      case 'INTER_WH_RECEIPT':
        return <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 px-2 py-0.5 rounded-full text-[10px] font-black">رسید حواله بین‌انبار (ورود)</span>;
      case 'SALES_RETURN':
        return <span className="bg-rose-50 dark:bg-rose-950/40 text-rose-600 px-2 py-0.5 rounded-full text-[10px] font-black">رسید مرجوعی از فروش</span>;
    }
  };

  // -------------------------------------------------------------
  // 8. SUBVIEW: WH_TRACKING (رهگیری جامع کارتن با کد ارجاع / بارکد)
  // -------------------------------------------------------------
  const [trackingCodeInput, setTrackingCodeInput] = useState<string>('DLK-PL-01-01001');
  const [trackedCarton, setTrackedCarton] = useState<ErpCartonLabel | null>(null);

  const handleTrackCarton = (codeToSearch?: string) => {
    const q = (codeToSearch || trackingCodeInput).trim().toLowerCase();
    if (!q) return;
    const found = allCartons.find(c =>
      c.referenceCode.toLowerCase() === q ||
      c.serialNumber.toLowerCase() === q ||
      c.qrPayload.toLowerCase().includes(q)
    );
    if (found) {
      setTrackedCarton(found);
      showToast?.('success', `کارتن با کد ارجاع ${found.referenceCode} یافت شد`);
    } else {
      setTrackedCarton(null);
      showToast?.('error', 'کارتنی با این کد ارجاع یا بارکد در سامانه یافت نشد');
    }
  };

  // Auto-search if sample available
  useEffect(() => {
    if (activeSubView === 'wh_tracking' && !trackedCarton && allCartons.length > 0) {
      setTrackedCarton(allCartons[0]);
      setTrackingCodeInput(allCartons[0].referenceCode);
    }
  }, [activeSubView, allCartons]);

  // -------------------------------------------------------------
  // 9. SUBVIEW: WH_STOCK_REPORT & KARDEX
  // -------------------------------------------------------------
  const [stockWhFilter, setStockWhFilter] = useState<string>('ALL');

  return (
    <div className="h-full flex flex-col min-h-0 bg-transparent overflow-hidden">
      {/* --------------------------------------------------------------------------------- */}
      {/* 1. WH_WAREHOUSES: DEFINITION & COMMODITY GROUP ASSIGNMENT */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_warehouses' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <WhIcon className="w-5 h-5 text-teal-600" />
                تعریف انبارها و تخصیص گروه کالایی
              </h2>
              <p className="text-xs text-slate-500 mt-1">مدیریت انبارهای محصول، انبار موقت خط، انبار مرکزی و تعیین گروه‌های مجاز هر انبار</p>
            </div>
            <button
              onClick={() => {
                setWhForm({ code: `WH-0${warehouses.length + 1}`, name: '', type: 'FINISHED_YARN', location: '', managerName: '', assignedGroupIds: [] });
                setShowAddWhModal(true);
              }}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus size={16} />
              تعریف انبار جدید
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehouses.map(w => {
              const inStockCount = allCartons.filter(c => c.warehouseId === w.id && (c.status === 'IN_STOCK' || !c.status)).length;
              const totalKg = allCartons
                .filter(c => c.warehouseId === w.id && (c.status === 'IN_STOCK' || !c.status))
                .reduce((sum, c) => sum + c.netWeightKg, 0);

              return (
                <div key={w.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-600 border border-teal-200 dark:border-teal-800">
                        {w.code}
                      </span>
                      <span className="text-[11px] font-bold text-slate-400">
                        مسئول: <strong className="text-slate-700 dark:text-slate-300">{w.managerName || '—'}</strong>
                      </span>
                    </div>
                    <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 mb-1">{w.name}</h3>
                    <p className="text-xs text-slate-500 mb-2">موقعیت: {w.location || '—'}</p>

                    {/* Stock quick badge */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">کارتن‌های موجود:</span>
                        <strong className="font-bold text-slate-800 dark:text-slate-200">{inStockCount} کارتن</strong>
                      </div>
                      <div className="text-left">
                        <span className="text-slate-400 block text-[10px]">موجودی خالص:</span>
                        <strong className="font-mono font-black text-emerald-600" dir="ltr">{totalKg.toFixed(2)} Kg</strong>
                      </div>
                    </div>
                  </div>

                  {/* Assigned commodity groups */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-1">گروه‌های کالایی مجاز در این انبار:</span>
                    <div className="flex flex-wrap gap-1">
                      {w.assignedGroupIds && w.assignedGroupIds.length > 0 ? (
                        w.assignedGroupIds.map(gid => {
                          const grp = groups.find(g => g.id === gid);
                          return (
                            <span key={gid} className="px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 text-[10px] font-bold">
                              {grp?.name || gid}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold">تمام گروه‌های کالایی مجازند</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 2. WH_RECEIPT_PRODUCTION: RECEIPT OF COMMODITIES FROM PRODUCTION */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_receipt_production' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                رسید تحویل کالا از خط تولید به انبار
              </h2>
              <p className="text-xs text-slate-500 mt-1">تایید تحویل کارتن‌های وزن‌شده در خط تولید و انتقال رسمی به موجودی انبار محصول</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-600 dark:text-slate-300">تحویل به انبار مقصد:</span>
              <select
                value={targetWhForReceipt}
                onChange={e => setTargetWhForReceipt(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-black text-slate-800 dark:text-slate-100"
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-4 space-y-3">
            <h3 className="font-black text-xs text-slate-700 dark:text-slate-300">
              سندهای تولید آماده تحویل به انبار ({pendingProductionVouchers.length} سند):
            </h3>

            {pendingProductionVouchers.length === 0 ? (
              <div className="py-12 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                در حال حاضر هیچ سند تولیدی در انتظار تحویل به انبار وجود ندارد. کارتن‌های وزن‌شده در عملکرد خط تولید پس از ثبت نهایی در این بخش ظاهر می‌شوند.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingProductionVouchers.map(v => (
                  <div key={v.id} className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/40 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-black text-xs text-orange-600 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded">
                          {v.voucherNo}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">کد بایگانی: {v.archiveCode}</span>
                      </div>
                      <h4 className="font-black text-sm text-slate-800 dark:text-slate-100 mb-1">{v.itemName}</h4>
                      <div className="text-xs text-slate-500 space-y-1">
                        <div>خط تولید: <strong className="text-slate-700 dark:text-slate-300">{v.lineName}</strong></div>
                        <div>تعداد کارتن: <strong className="text-slate-800 dark:text-slate-200">{v.cartonsCount} کارتن</strong></div>
                        <div>مجموع وزن خالص: <strong className="font-mono font-black text-emerald-600" dir="ltr">{v.totalNetWeightKg} Kg</strong></div>
                        <div>تاریخ و ساعت ثبت: <strong className="font-mono">{v.dateJalali} — {v.timeExact}</strong></div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAcceptProductionDelivery(v)}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors"
                    >
                      <Check size={16} />
                      تایید تحویل و صدور رسید انبار (ورود به انبار)
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 3. WH_SALES_REMITTANCE: FACTORY EXIT SALES REMITTANCE (NO PRICE) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_sales_remittance' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-600" />
                  صدور حواله فروش و خروج کارخانه (بدون فی)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  طبق فرآیند مصوب، کارخانه ابتدا حواله خروج فیزیکی را بدون فی برای شخص خریدار صادر نموده و دفتر تهران قیمت‌گذاری نهایی را انجام می‌دهد.
                </p>
              </div>
            </div>

            {/* Header Form */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">انبار مبدا خروج</label>
                <select
                  value={sourceWhForRemittance}
                  onChange={e => setSourceWhForRemittance(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">نام خریدار / مشتری</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="مثال: شرکت نساجی اصفهان"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">نام راننده حامل</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={e => setDriverName(e.target.value)}
                  placeholder="نام راننده"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">شماره پلاک خودرو</label>
                <input
                  type="text"
                  value={plateNumber}
                  onChange={e => setPlateNumber(e.target.value)}
                  placeholder="مثال: ۱۲ الف ۳۴۵ ایران ۶۸"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            {/* Barcode scanner / Code input */}
            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl border border-blue-200 dark:border-blue-800 flex flex-col sm:flex-row items-center gap-2">
              <span className="text-xs font-black text-blue-900 dark:text-blue-300 shrink-0">اسکن یا جستجوی کارتن با کد ارجاع / بارکد:</span>
              <div className="flex-1 w-full flex items-center gap-2">
                <input
                  type="text"
                  placeholder="کد ارجاع یا بارکد کارتن را اسکن یا تایپ کنید..."
                  value={cartonSearchCode}
                  onChange={e => setCartonSearchCode(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleScanCartonInput(cartonSearchCode);
                    }
                  }}
                  className="w-full px-3 py-1.5 rounded-xl border border-blue-300 bg-white dark:bg-slate-900 font-mono text-xs font-bold"
                />
                <button
                  onClick={() => handleScanCartonInput(cartonSearchCode)}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shrink-0"
                >
                  افزودن کارتن
                </button>
              </div>
            </div>

            {/* Selected cartons summary bar */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-900 text-white rounded-xl text-xs">
              <div className="text-center">
                <span className="text-slate-400 block text-[10px]">کارتن‌های این حواله:</span>
                <span className="text-base font-black">{selectedCartonsForSales.length} کارتن</span>
              </div>
              <div className="text-center border-x border-slate-700">
                <span className="text-slate-400 block text-[10px]">مجموع وزن ناخالص:</span>
                <span className="text-base font-mono font-bold" dir="ltr">{remTotalGrossWeight} Kg</span>
              </div>
              <div className="text-center">
                <span className="text-emerald-400 block text-[10px]">مجموع وزن خالص نخ:</span>
                <span className="text-base font-mono font-black text-emerald-400" dir="ltr">{remTotalNetWeight} Kg</span>
              </div>
            </div>

            {/* Cartons Table in Remittance */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">کارتن‌های انتخاب‌شده برای خروج:</h4>
                <button
                  onClick={handleIssueSalesRemittance}
                  disabled={selectedCartonsForSales.length === 0}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md disabled:opacity-40 transition-colors"
                >
                  صدور حواله فروش و ثبت خروج کارخانه
                </button>
              </div>

              {selectedCartonsForSales.length === 0 ? (
                <div className="py-8 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  هیچ کارتنی برای این حواله انتخاب نشده است. از لیست زیر یا اسکنر کارتن‌ها را اضافه کنید.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-600">
                      <tr>
                        <th className="p-2">کد ارجاع</th>
                        <th className="p-2">نام کالا</th>
                        <th className="p-2 text-center">دوک</th>
                        <th className="p-2 text-center">وزن خالص</th>
                        <th className="p-2 text-center">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedCartonsForSales.map(c => (
                        <tr key={c.id}>
                          <td className="p-2 font-mono font-bold text-blue-600">{c.referenceCode}</td>
                          <td className="p-2">{c.productName}</td>
                          <td className="p-2 text-center">{c.conesCount}</td>
                          <td className="p-2 text-center font-mono font-black text-emerald-600">{c.netWeightKg} Kg</td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => setSelectedCartonsForSales(prev => prev.filter(x => x.id !== c.id))}
                              className="text-rose-600 hover:bg-rose-50 p-1 rounded"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Quick selector of cartons in warehouse */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
                انتخاب سریع از کارتن‌های موجود در {warehouses.find(w => w.id === sourceWhForRemittance)?.name} ({availableCartonsInWh.length} کارتن):
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                {availableCartonsInWh.map(c => {
                  const isSelected = selectedCartonsForSales.some(x => x.id === c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => isSelected ? setSelectedCartonsForSales(prev => prev.filter(x => x.id !== c.id)) : handleAddCartonToRemittance(c)}
                      className={`p-2 rounded-xl text-right text-xs transition-all border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400'
                      }`}
                    >
                      <div className="font-mono font-bold text-[11px] truncate">{c.referenceCode}</div>
                      <div className="text-[10px] truncate opacity-80">{c.productName}</div>
                      <div className="font-mono font-black text-[11px] mt-1" dir="ltr">{c.netWeightKg} Kg</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 4. WH_INTER_REMITTANCE: INTER-WAREHOUSE TRANSFER */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_inter_remittance' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-purple-600" />
                حواله بین‌انبار (انتقال کالا و کارتن بین دو انبار)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                ثبت حواله انتقال از انبار مبدا. وضعیت سند در حالت «در انتظار تایید ورود در انبار مقصد» قرار می‌گیرد تا کاربر انبار مقصد آن را تایید کند.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">انبار مبدا انتقال</label>
                <select
                  value={transferSourceWh}
                  onChange={e => setTransferSourceWh(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">انبار مقصد تحویل‌گیرنده</label>
                <select
                  value={transferTargetWh}
                  onChange={e => setTransferTargetWh(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {warehouses.filter(w => w.id !== transferSourceWh).map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">راننده / متصدی حمل</label>
                <input
                  type="text"
                  value={transferDriver}
                  onChange={e => setTransferDriver(e.target.value)}
                  placeholder="نام راننده"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">شماره پلاک</label>
                <input
                  type="text"
                  value={transferPlate}
                  onChange={e => setTransferPlate(e.target.value)}
                  placeholder="پلاک خودرو"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            {/* Selected summary */}
            <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800 text-xs">
              <div>
                <strong className="text-purple-900 dark:text-purple-300">{selectedCartonsForTransfer.length} کارتن</strong> انتخاب شده برای انتقال
              </div>
              <button
                onClick={handleIssueInterWhTransfer}
                disabled={selectedCartonsForTransfer.length === 0}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-md disabled:opacity-40"
              >
                ثبت و صدور حواله انتقال بین‌انبار
              </button>
            </div>

            {/* Available cartons in source wh */}
            <div>
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 mb-2">
                کارتن‌های موجود در انبار مبدا ({availableCartonsForTransfer.length} کارتن):
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-52 overflow-y-auto custom-scrollbar p-1">
                {availableCartonsForTransfer.map(c => {
                  const isSel = selectedCartonsForTransfer.some(x => x.id === c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => isSel ? setSelectedCartonsForTransfer(prev => prev.filter(x => x.id !== c.id)) : setSelectedCartonsForTransfer(prev => [c, ...prev])}
                      className={`p-2 rounded-xl text-right text-xs transition-all border ${
                        isSel
                          ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-purple-400'
                      }`}
                    >
                      <div className="font-mono font-bold text-[11px] truncate">{c.referenceCode}</div>
                      <div className="text-[10px] truncate opacity-80">{c.productName}</div>
                      <div className="font-mono font-black text-[11px] mt-1" dir="ltr">{c.netWeightKg} Kg</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 5. WH_INTER_RECEIPT: RECEIPT & CONFIRMATION OF INTER-WH TRANSFER */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_inter_receipt' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                رسید حواله بین‌انبار (تایید ورود کالا در انبار مقصد)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                وقتی کاربر در انبار مبدا حواله بین‌انبار صادر کرد، کاربر انبار مقصد در این بخش تایید ورود و تحویل رسمی را ثبت می‌کند.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-600 dark:text-slate-300">مشاهده حواله‌های وارده به:</span>
              <select
                value={activeReceivingWh}
                onChange={e => setActiveReceivingWh(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-black text-slate-800 dark:text-slate-100"
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3">
            <h3 className="font-black text-xs text-slate-700 dark:text-slate-300">
              حواله‌های ارسالی در انتظار تایید ورود ({pendingInterWhReceipts.length} حواله):
            </h3>

            {pendingInterWhReceipts.length === 0 ? (
              <div className="py-12 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                هیچ حواله بین‌انباری در انتظار تایید ورود برای این انبار وجود ندارد.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingInterWhReceipts.map(doc => (
                  <div key={doc.id} className="border border-indigo-200 dark:border-indigo-900/50 rounded-2xl p-4 bg-indigo-50/30 dark:bg-slate-800/40 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-black text-xs text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">
                          {doc.docNo}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">کد بایگانی: {doc.archiveCode}</span>
                      </div>
                      <div className="text-xs space-y-1 text-slate-600 dark:text-slate-300">
                        <div>انبار مبدا: <strong className="text-slate-800 dark:text-slate-100">{doc.sourceWarehouseName}</strong></div>
                        <div>انبار مقصد: <strong className="text-slate-800 dark:text-slate-100">{doc.targetWarehouseName}</strong></div>
                        <div>تعداد کارتن: <strong className="text-slate-800 dark:text-slate-100">{doc.cartonsCount} کارتن</strong></div>
                        <div>مجموع وزن خالص: <strong className="font-mono font-black text-emerald-600" dir="ltr">{doc.totalNetWeightKg} Kg</strong></div>
                        <div>راننده: <strong>{doc.driverName || '—'}</strong> | پلاک: <strong>{doc.plateNumber || '—'}</strong></div>
                        <div>تاریخ و ساعت ارسال: <strong className="font-mono">{doc.dateJalali} — {doc.timeExact}</strong></div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleConfirmInterWhReceipt(doc)}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-colors"
                    >
                      <Check size={16} />
                      تایید ورود و ثبت رسید انبار مقصد
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 6. WH_SALES_RETURN: SALES RETURN RECEIPT */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_sales_return' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                رسید مرجوعی از فروش به انبار
              </h2>
              <p className="text-xs text-slate-500 mt-1">ثبت کارتن‌های برگشت‌خورده از مشتریان با ذکر علت دقیق مرجوعی، تاریخ و ساعت</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">انبار تحویل‌گیرنده مرجوعی</label>
                <select
                  value={returnTargetWh}
                  onChange={e => setReturnTargetWh(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">نام مشتری مرجوع‌کننده</label>
                <input
                  type="text"
                  value={returnCustomer}
                  onChange={e => setReturnCustomer(e.target.value)}
                  placeholder="نام مشتری"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">علت مرجوعی</label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  placeholder="مثال: پرزدهی، پارگی نخ، ناهماهنگی رنگ"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>

            {/* Input carton code */}
            <div className="flex items-center gap-2 text-xs">
              <input
                type="text"
                placeholder="کد ارجاع کارتن مرجوعی (مثال: DLK-PL-01-01001)..."
                value={returnCartonCode}
                onChange={e => setReturnCartonCode(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddCartonToReturn();
                }}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
              />
              <button
                onClick={handleAddCartonToReturn}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold"
              >
                افزودن به مرجوعی
              </button>
            </div>

            {/* Selected for return list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  کارتن‌های مرجوعی: {selectedCartonsForReturn.length} عدد
                </span>
                <button
                  onClick={handleIssueSalesReturn}
                  disabled={selectedCartonsForReturn.length === 0}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-md disabled:opacity-40"
                >
                  ثبت نهایی رسید مرجوعی فروش
                </button>
              </div>

              {selectedCartonsForReturn.map(c => (
                <div key={c.id} className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-black text-rose-700 dark:text-rose-400 mr-2">{c.referenceCode}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{c.productName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold">{c.netWeightKg} Kg</span>
                    <button
                      onClick={() => setSelectedCartonsForReturn(prev => prev.filter(x => x.id !== c.id))}
                      className="text-rose-600 p-1 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 7. WH_ARCHIVE: COMPREHENSIVE WAREHOUSE DOCUMENTS ARCHIVE */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_archive' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-600" />
                بایگانی جامع اسناد انبارداری
              </h2>
              <p className="text-xs text-slate-500 mt-1">تفکیک نوع سند، کد بایگانی، شماره سند، انبار مبدا/مقصد، تاریخ و ساعت دقیق</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="جستجو در اسناد انبار..."
                  value={archiveSearchTerm}
                  onChange={e => setArchiveSearchTerm(e.target.value)}
                  className="pr-8 pl-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                />
              </div>
            </div>
          </div>

          {/* Type Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { id: 'ALL', label: `همه اسناد (${warehouseDocs.length})` },
              { id: 'SALES_REMITTANCE', label: `حواله فروش خروج کارخانه (${warehouseDocs.filter(d => d.docType === 'SALES_REMITTANCE').length})` },
              { id: 'INTER_WH_TRANSFER', label: `حواله بین‌انبار (${warehouseDocs.filter(d => d.docType === 'INTER_WH_TRANSFER').length})` },
              { id: 'INTER_WH_RECEIPT', label: `رسید ورود بین‌انبار (${warehouseDocs.filter(d => d.docType === 'INTER_WH_RECEIPT').length})` },
              { id: 'RECEIPT_PRODUCTION', label: `رسید تحویل از تولید (${warehouseDocs.filter(d => d.docType === 'RECEIPT_PRODUCTION').length})` },
              { id: 'SALES_RETURN', label: `رسید مرجوعی فروش (${warehouseDocs.filter(d => d.docType === 'SALES_RETURN').length})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setArchiveFilterType(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors ${
                  archiveFilterType === tab.id
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">شماره سند</th>
                    <th className="p-3">کد بایگانی</th>
                    <th className="p-3 text-center">نوع سند</th>
                    <th className="p-3">انبار مبدا / مقصد</th>
                    <th className="p-3">طرف حساب / راننده</th>
                    <th className="p-3 text-center">تعداد کارتن</th>
                    <th className="p-3 text-center">وزن خالص (Kg)</th>
                    <th className="p-3 text-center">تاریخ و ساعت دقیق</th>
                    <th className="p-3 text-center">وضعیت</th>
                    <th className="p-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredWarehouseDocs.map(doc => (
                    <tr key={doc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3 font-mono font-bold text-teal-600">{doc.docNo}</td>
                      <td className="p-3 font-mono text-slate-500">{doc.archiveCode}</td>
                      <td className="p-3 text-center">{getDocTypeBadge(doc.docType)}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-300">
                        {doc.sourceWarehouseName ? <span>از {doc.sourceWarehouseName}</span> : ''}
                        {doc.targetWarehouseName ? <span className="block text-[11px] text-slate-400">به {doc.targetWarehouseName}</span> : ''}
                      </td>
                      <td className="p-3">
                        <strong className="block text-slate-800 dark:text-slate-200">{doc.partyName || '—'}</strong>
                        {doc.driverName && <span className="text-[10px] text-slate-400 font-mono">راننده: {doc.driverName}</span>}
                      </td>
                      <td className="p-3 text-center font-bold">{doc.cartonsCount}</td>
                      <td className="p-3 text-center font-mono font-black text-emerald-600" dir="ltr">{doc.totalNetWeightKg.toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <div className="font-bold">{doc.dateJalali}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{doc.timeExact}</div>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${doc.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {doc.status === 'COMPLETED' ? 'نهایی شده' : 'در انتظار تایید مقصد'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setSelectedDocForModal(doc)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Eye size={13} />
                          مشاهده
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredWarehouseDocs.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400 font-bold">
                        هیچ سند انباری مطابق با فیلتر شما یافت نشد.
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
      {/* 8. WH_TRACKING: COMPREHENSIVE CARTON LIFECYCLE AUDIT TRAIL */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'wh_tracking' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Hash className="w-5 h-5 text-teal-600" />
                رهگیری جامع شناسنامه و لایف‌سایکل کارتن با کد ارجاع / بارکد
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                مشاهده تاریخچه کامل کارتن از لحظه وزن‌کشی روی باسکول خط تولید، ورود به انبار، انتقالات بین‌انبار، تا حواله خروج فروش و مرجوعی
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                placeholder="کد ارجاع، سریال یا بارکد کارتن را وارد نمایید (مثال: DLK-PL-01-01001)..."
                value={trackingCodeInput}
                onChange={e => setTrackingCodeInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTrackCarton();
                }}
                className="flex-1 w-full px-4 py-2.5 rounded-xl border border-teal-300 dark:border-teal-700 bg-slate-50 dark:bg-slate-800 font-mono font-black text-xs text-slate-800 dark:text-slate-100"
              />
              <button
                onClick={() => handleTrackCarton()}
                className="w-full sm:w-auto px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-2"
              >
                <Search size={15} />
                ردیابی و رهگیری کارتن
              </button>
            </div>

            {/* Quick sample chips */}
            {allCartons.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400">
                <span>کارتن‌های اخیر:</span>
                {allCartons.slice(0, 6).map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setTrackingCodeInput(c.referenceCode);
                      handleTrackCarton(c.referenceCode);
                    }}
                    className="font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-teal-600 hover:bg-teal-50"
                  >
                    {c.referenceCode}
                  </button>
                ))}
              </div>
            )}
          </div>

          {trackedCarton ? (
            <div className="space-y-4">
              {/* Carton Identity Card */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">شناسنامه محصول نخ:</span>
                    <h3 className="font-black text-base text-slate-800 dark:text-slate-100">{trackedCarton.productName}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs font-black text-orange-600 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded">
                        کد ارجاع: {trackedCarton.referenceCode}
                      </span>
                      <span className="font-mono text-xs text-slate-500">سریال: {trackedCarton.serialNumber}</span>
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-slate-400 block">وضعیت فعلی:</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-black inline-block ${
                      trackedCarton.status === 'SOLD' ? 'bg-blue-50 text-blue-600 border border-blue-200' :
                      trackedCarton.status === 'RETURNED' ? 'bg-rose-50 text-rose-600 border border-rose-200' :
                      'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    }`}>
                      {trackedCarton.status === 'SOLD' ? 'تحویل مشتری (فروش رفته)' :
                       trackedCarton.status === 'RETURNED' ? 'مرجوع شده به انبار' :
                       'موجود در انبار'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl">
                  <div>نمره نخ: <strong className="font-bold font-mono">{trackedCarton.yarnCount}</strong></div>
                  <div>شماره لات: <strong className="font-bold font-mono">{trackedCarton.lotNumber}</strong></div>
                  <div>تعداد دوک: <strong className="font-bold">{trackedCarton.conesCount} عدد</strong></div>
                  <div>گرید کیفی: <strong className="font-bold text-orange-600">{trackedCarton.grade}</strong></div>
                  <div>وزن ناخالص: <strong className="font-mono font-bold">{trackedCarton.grossWeightKg} Kg</strong></div>
                  <div>کسر ظرف و دوک: <strong className="font-mono text-rose-500">-{trackedCarton.totalTareKg} Kg</strong></div>
                  <div>وزن خالص نخ: <strong className="font-mono font-black text-emerald-600">{trackedCarton.netWeightKg} Kg</strong></div>
                  <div>انبار فعلی: <strong>{warehouses.find(w => w.id === trackedCarton.warehouseId)?.name || 'انبار محصول'}</strong></div>
                </div>
              </div>

              {/* Lifecycle Interactive Timeline */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
                <h3 className="font-black text-xs text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-600" />
                  خط زمان وقایع و تاریخچه دقیق لایف‌سایکل کارتن (Lifecycle Audit Trail)
                </h3>

                <div className="relative border-r-2 border-teal-500 pr-5 space-y-6 mr-2">
                  {/* Step 1: Production & Scale */}
                  <div className="relative">
                    <div className="absolute -right-[27px] top-0 w-4 h-4 rounded-full bg-orange-600 border-2 border-white dark:border-slate-900 shadow-sm"></div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <strong className="font-black text-orange-600">۱. توزین روی باسکول و صدور شناسنامه خط تولید</strong>
                        <span className="font-mono text-[11px] text-slate-500">{trackedCarton.createdDateJalali} — ساعت {trackedCarton.createdTimeExact || '۱۴:۳۲'}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">
                        توزین در <strong>{trackedCarton.machineCode}</strong> شیفت <strong>{trackedCarton.shift}</strong> توسط اپراتور <strong>{trackedCarton.createdBy}</strong>.
                        وزن ناخالص: {trackedCarton.grossWeightKg} کیلو، وزن خالص: {trackedCarton.netWeightKg} کیلو.
                      </p>
                      {trackedCarton.productionVoucherNo && (
                        <div className="text-[11px] text-slate-400 font-mono">سند تولید: {trackedCarton.productionVoucherNo} | کد بایگانی: {trackedCarton.productionArchiveCode}</div>
                      )}
                    </div>
                  </div>

                  {/* Step 2+: Historical events recorded */}
                  {trackedCarton.history && trackedCarton.history.slice(1).map((ev, i) => (
                    <div key={ev.id || i} className="relative">
                      <div className="absolute -right-[27px] top-0 w-4 h-4 rounded-full bg-teal-600 border-2 border-white dark:border-slate-900 shadow-sm"></div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <strong className="font-black text-teal-700 dark:text-teal-300">{ev.title}</strong>
                          <span className="font-mono text-[11px] text-slate-500">{ev.dateJalali} — ساعت {ev.timeExact}</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">{ev.details}</p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                          {ev.docNo && <span>شماره سند: {ev.docNo}</span>}
                          {ev.archiveCode && <span>کد بایگانی: {ev.archiveCode}</span>}
                          {ev.actor && <span>مسئول: {ev.actor}</span>}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Current Status Footprint */}
                  <div className="relative">
                    <div className="absolute -right-[27px] top-0 w-4 h-4 rounded-full bg-emerald-600 border-2 border-white dark:border-slate-900 shadow-sm"></div>
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs">
                      <strong className="font-black text-emerald-800 dark:text-emerald-300 block">وضعیت کنونی کارتن:</strong>
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {trackedCarton.status === 'SOLD'
                          ? `کارتن در حواله فروش تحویل مشتری گردیده است.`
                          : `کارتن هم‌اکنون در موجودی فعال «${warehouses.find(w => w.id === trackedCarton.warehouseId)?.name || 'انبار محصول'}» قرار دارد و آماده بارگیری و انتقال است.`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
              برای مشاهده شناسنامه و لایف‌سایکل کارتن، کد ارجاع یا بارکد آن را در کادر بالا وارد نمایید.
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 9. WH_STOCK_REPORT: INVENTORY REPORT & KARDEX */}
      {/* --------------------------------------------------------------------------------- */}
      {(activeSubView === 'wh_stock_report' || activeSubView === 'wh_kardex') && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-teal-600" />
                {activeSubView === 'wh_kardex' ? 'کاردکس کالا و گردش ریز تراکنش‌های انبار' : 'گزارش موجودی کالاها و کارتن‌های انبار'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">موجودی لحظه‌ای تفکیک‌شده بر اساس انبار، گروه کالایی، تعداد کارتن و وزن خالص</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-500">فیلتر انبار:</span>
              <select
                value={stockWhFilter}
                onChange={e => setStockWhFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                <option value="ALL">همه انبارها</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">کد کالا</th>
                    <th className="p-3">نام کالا</th>
                    <th className="p-3">گروه کالایی</th>
                    <th className="p-3">انبار</th>
                    <th className="p-3 text-center">کارتن‌های موجود</th>
                    <th className="p-3 text-center font-black text-emerald-600">مجموع وزن خالص (Kg)</th>
                    <th className="p-3 text-center">میانگین وزن کارتن</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {erpState.items.map(item => {
                    const matchedCartons = allCartons.filter(c => {
                      if (c.productId !== item.id && c.productCode !== item.code) return false;
                      if (stockWhFilter !== 'ALL' && c.warehouseId !== stockWhFilter) return false;
                      return c.status === 'IN_STOCK' || !c.status;
                    });
                    const totalNet = Number(matchedCartons.reduce((sum, c) => sum + c.netWeightKg, 0).toFixed(3));
                    const count = matchedCartons.length;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-3 font-mono font-bold text-teal-600">{item.code}</td>
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{item.name}</td>
                        <td className="p-3 text-slate-500">{item.groupName || 'نخ‌های DTY'}</td>
                        <td className="p-3 text-slate-600">
                          {stockWhFilter === 'ALL' ? 'تمام انبارها' : warehouses.find(w => w.id === stockWhFilter)?.name}
                        </td>
                        <td className="p-3 text-center font-bold">{count} کارتن</td>
                        <td className="p-3 text-center font-mono font-black text-emerald-600" dir="ltr">{totalNet.toLocaleString()} Kg</td>
                        <td className="p-3 text-center font-mono text-slate-500">
                          {count > 0 ? (totalNet / count).toFixed(3) : '0.000'} Kg
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: ADD WAREHOUSE */}
      {/* --------------------------------------------------------------------------------- */}
      {showAddWhModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">تعریف انبار جدید</h3>
              <button onClick={() => setShowAddWhModal(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">کد انبار</label>
                <input
                  type="text"
                  value={whForm.code}
                  onChange={e => setWhForm({ ...whForm, code: e.target.value })}
                  placeholder="WH-06"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">نام انبار</label>
                <input
                  type="text"
                  value={whForm.name}
                  onChange={e => setWhForm({ ...whForm, name: e.target.value })}
                  placeholder="مثال: انبار محصول شماره ۲"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">موقعیت و آدرس انبار</label>
                <input
                  type="text"
                  value={whForm.location}
                  onChange={e => setWhForm({ ...whForm, location: e.target.value })}
                  placeholder="سوله جنوبی کارخانه"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">مسئول انبار</label>
                <input
                  type="text"
                  value={whForm.managerName}
                  onChange={e => setWhForm({ ...whForm, managerName: e.target.value })}
                  placeholder="نام انباردار"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAddWhModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600">
                انصراف
              </button>
              <button onClick={handleSaveWarehouse} className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow-sm">
                ذخیره انبار
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: VIEW WAREHOUSE DOCUMENT DETAILS */}
      {/* --------------------------------------------------------------------------------- */}
      {selectedDocForModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-600" />
                  سند انبارداری {selectedDocForModal.docNo}
                </h3>
                <span className="text-xs text-slate-400 font-mono">کد بایگانی: {selectedDocForModal.archiveCode}</span>
              </div>
              <button onClick={() => setSelectedDocForModal(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl text-xs">
              <div>نوع سند: <strong>{getDocTypeBadge(selectedDocForModal.docType)}</strong></div>
              <div>انبار مبدا: <strong className="font-bold">{selectedDocForModal.sourceWarehouseName || '—'}</strong></div>
              <div>انبار مقصد: <strong className="font-bold">{selectedDocForModal.targetWarehouseName || '—'}</strong></div>
              <div>طرف حساب: <strong className="font-bold">{selectedDocForModal.partyName || '—'}</strong></div>
              <div>تاریخ: <strong className="font-bold">{selectedDocForModal.dateJalali}</strong></div>
              <div>ساعت دقیق: <strong className="font-mono text-teal-600">{selectedDocForModal.timeExact}</strong></div>
              <div>تعداد کارتن: <strong className="font-bold">{selectedDocForModal.cartonsCount}</strong></div>
              <div>وزن خالص کل: <strong className="font-mono text-emerald-600">{selectedDocForModal.totalNetWeightKg} Kg</strong></div>
            </div>

            <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">اقلام و کارتن‌های ثبت شده در این سند:</h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-600">
                  <tr>
                    <th className="p-2">ردیف</th>
                    <th className="p-2">کد ارجاع</th>
                    <th className="p-2">نام کالا</th>
                    <th className="p-2 text-center">دوک</th>
                    <th className="p-2 text-center">وزن خالص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {allCartons.filter(c => selectedDocForModal.cartonIds?.includes(c.id)).map((c, i) => (
                    <tr key={c.id}>
                      <td className="p-2 text-slate-400 font-mono">{i + 1}</td>
                      <td className="p-2 font-mono font-bold text-teal-600">{c.referenceCode}</td>
                      <td className="p-2">{c.productName}</td>
                      <td className="p-2 text-center">{c.conesCount}</td>
                      <td className="p-2 text-center font-mono font-black text-emerald-600">{c.netWeightKg} Kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedDocForModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black shadow-sm"
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
