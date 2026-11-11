import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Factory,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Scale,
  QrCode,
  Printer,
  RefreshCw,
  Search,
  Eye,
  FileText,
  Clock,
  Layers,
  Sparkles,
  ArrowRight,
  Filter,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  ErpSubViewId,
  IndustrialErpState,
  ErpCompanySummary,
  ErpProductionLine,
  ErpCommodityGroup,
  ErpItem,
  ErpCartonLabel,
  ErpProductionVoucher,
  ErpBom,
  ErpBomComponent,
  getTodayJalali,
  getExactTimeNow
} from './types';
import { User } from '../../types';

interface ProductionBomModuleViewProps {
  activeSubView: ErpSubViewId;
  selectedCompany?: ErpCompanySummary;
  erpState: IndustrialErpState;
  setErpState?: React.Dispatch<React.SetStateAction<IndustrialErpState | null>>;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
  currentUser?: User;
  showToast?: (type: 'success' | 'error', text: string) => void;
  openSubViewTab?: (subId: ErpSubViewId) => void;
}

export const ProductionBomModuleView: React.FC<ProductionBomModuleViewProps> = ({
  activeSubView,
  selectedCompany,
  erpState,
  setErpState,
  persistErpState,
  currentUser,
  showToast,
  openSubViewTab
}) => {
  // Production lines fallback
  const lines: ErpProductionLine[] = useMemo(() => {
    if (erpState.productionLines && erpState.productionLines.length > 0) {
      return erpState.productionLines;
    }
    return [
      { id: 'pl_01', code: 'PL-01', name: 'خط تکسچره ۱ (TMT-01)', machineType: 'تکسچرایزینگ ۲۱۶ چشمه', supervisorName: 'مهندس اکبری', isActive: true, notes: 'خط تولید فعال نخ DTY' },
      { id: 'pl_02', code: 'PL-02', name: 'خط تکسچره ۲ (TMT-02)', machineType: 'تکسچرایزینگ ۲۴۰ چشمه', supervisorName: 'مهندس مرادی', isActive: true, notes: 'تولید نخ پلی‌استر سفید' },
      { id: 'pl_03', code: 'PL-03', name: 'خط تابندگی ۱ (Barmag)', machineType: 'تابندگی TFO', supervisorName: 'مهندس حیدری', isActive: true, notes: 'تولید نخ تابیده' },
      { id: 'pl_04', code: 'PL-04', name: 'خط وایندر و بسته‌بندی', machineType: 'وایندر دقیق', supervisorName: 'مهندس کریمی', isActive: true, notes: 'بسته‌بندی و سلفون‌کشی' }
    ];
  }, [erpState.productionLines]);

  // Commodity groups fallback
  const groups: ErpCommodityGroup[] = useMemo(() => {
    if (erpState.commodityGroups && erpState.commodityGroups.length > 0) {
      return erpState.commodityGroups;
    }
    return [
      { id: 'grp_dty', code: 'GRP-01', name: 'نخ‌های تکسچره پلی‌استر (DTY)', description: 'نخ‌های فیلامنت متراکم و پفکی' },
      { id: 'grp_poy', code: 'GRP-02', name: 'نخ‌های ممتد اولیه (POY)', description: 'مواد اولیه خط تکسچرایزینگ' },
      { id: 'grp_fdy', code: 'GRP-03', name: 'نخ‌های کاملاً کشیده شده (FDY)', description: 'نخ‌های براق و مات صنعتی' },
      { id: 'grp_pack', code: 'GRP-04', name: 'ملزومات بسته‌بندی کارتن و دوک', description: 'کارتن خالی، نایلون، دوک مقوایی و پلاستیکی' },
      { id: 'grp_waste', code: 'GRP-05', name: 'ضایعات خطوط تولید', description: 'ضایعات نخ، تلو، الیاف بازیافتی' }
    ];
  }, [erpState.commodityGroups]);

  // Filter yarn items for production
  const yarnItems: ErpItem[] = useMemo(() => {
    return erpState.items.filter(i => i.category === 'FINISHED_YARN' || i.category === 'RAW_MATERIAL');
  }, [erpState.items]);

  // -------------------------------------------------------------
  // TAB 1: PRODUCTION LINES STATE
  // -------------------------------------------------------------
  const [showAddLineModal, setShowAddLineModal] = useState(false);
  const [lineForm, setLineForm] = useState<Partial<ErpProductionLine>>({
    code: '',
    name: '',
    machineType: '',
    supervisorName: currentUser?.fullName || '',
    isActive: true,
    notes: ''
  });

  const handleSaveLine = async () => {
    if (!lineForm.name || !lineForm.code) {
      showToast?.('error', 'لطفاً کد و عنوان خط تولید را وارد نمایید');
      return;
    }
    const newLine: ErpProductionLine = {
      id: lineForm.id || `pl_${Date.now()}`,
      code: lineForm.code,
      name: lineForm.name,
      machineType: lineForm.machineType || '',
      supervisorName: lineForm.supervisorName || '',
      isActive: lineForm.isActive !== false,
      notes: lineForm.notes || ''
    };
    const currentLines = erpState.productionLines && erpState.productionLines.length > 0 ? erpState.productionLines : lines;
    const exists = currentLines.some(l => l.id === newLine.id);
    const updatedLines = exists ? currentLines.map(l => l.id === newLine.id ? newLine : l) : [...currentLines, newLine];
    
    await persistErpState({ ...erpState, productionLines: updatedLines }, 'خط تولید با موفقیت ذخیره شد');
    setShowAddLineModal(false);
    setLineForm({ code: '', name: '', machineType: '', supervisorName: currentUser?.fullName || '', isActive: true, notes: '' });
  };

  const handleDeleteLine = async (id: string) => {
    if (!confirm('آیا از حذف این خط تولید اطمینان دارید؟')) return;
    const currentLines = erpState.productionLines && erpState.productionLines.length > 0 ? erpState.productionLines : lines;
    const updated = currentLines.filter(l => l.id !== id);
    await persistErpState({ ...erpState, productionLines: updated }, 'خط تولید حذف شد');
  };

  // -------------------------------------------------------------
  // TAB 2: COMMODITY GROUPS & ITEMS STATE
  // -------------------------------------------------------------
  const [itemsSubTab, setItemsSubTab] = useState<'ITEMS' | 'GROUPS'>('ITEMS');
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState<Partial<ErpCommodityGroup>>({ code: '', name: '', description: '' });

  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [itemForm, setItemForm] = useState<Partial<ErpItem>>({
    code: '',
    name: '',
    category: 'FINISHED_YARN',
    groupId: '',
    unit: 'کیلوگرم',
    yarnCount: '150/48',
    grade: 'A',
    colorName: 'سفید خام',
    defaultConesPerCarton: 6,
    cartonWeightGrams: 1450,
    coneWeightGrams: 110,
    stockQty: 0,
    unitCost: 1250000,
    salesPrice: 1450000
  });

  const handleSaveGroup = async () => {
    if (!groupForm.name || !groupForm.code) {
      showToast?.('error', 'لطفاً کد و نام گروه را وارد نمایید');
      return;
    }
    const newGroup: ErpCommodityGroup = {
      id: groupForm.id || `grp_${Date.now()}`,
      code: groupForm.code,
      name: groupForm.name,
      description: groupForm.description || ''
    };
    const currentGroups = erpState.commodityGroups && erpState.commodityGroups.length > 0 ? erpState.commodityGroups : groups;
    const exists = currentGroups.some(g => g.id === newGroup.id);
    const updatedGroups = exists ? currentGroups.map(g => g.id === newGroup.id ? newGroup : g) : [...currentGroups, newGroup];
    await persistErpState({ ...erpState, commodityGroups: updatedGroups }, 'گروه کالایی با موفقیت ذخیره شد');
    setShowAddGroupModal(false);
    setGroupForm({ code: '', name: '', description: '' });
  };

  const handleSaveItem = async () => {
    if (!itemForm.name || !itemForm.code) {
      showToast?.('error', 'لطفاً کد و نام کالا را وارد نمایید');
      return;
    }
    const selGroup = groups.find(g => g.id === itemForm.groupId);
    const newItem: ErpItem = {
      id: itemForm.id || `itm_${Date.now()}`,
      code: itemForm.code,
      name: itemForm.name,
      category: itemForm.category || 'FINISHED_YARN',
      groupId: itemForm.groupId,
      groupName: selGroup?.name || '',
      unit: itemForm.unit || 'کیلوگرم',
      warehouseId: itemForm.warehouseId || erpState.warehouses?.[0]?.id || 'wh_finished',
      stockQty: Number(itemForm.stockQty || 0),
      unitCost: Number(itemForm.unitCost || 0),
      salesPrice: Number(itemForm.salesPrice || 0),
      yarnCount: itemForm.yarnCount || '',
      grade: itemForm.grade || 'A',
      colorName: itemForm.colorName || '',
      defaultConesPerCarton: Number(itemForm.defaultConesPerCarton || 6),
      cartonWeightGrams: Number(itemForm.cartonWeightGrams || 1450),
      coneWeightGrams: Number(itemForm.coneWeightGrams || 110)
    };
    const exists = erpState.items.some(i => i.id === newItem.id);
    const updatedItems = exists ? erpState.items.map(i => i.id === newItem.id ? newItem : i) : [...erpState.items, newItem];
    await persistErpState({ ...erpState, items: updatedItems }, 'کالای تولیدی با موفقیت ذخیره شد');
    setShowAddItemModal(false);
    setItemForm({
      code: '',
      name: '',
      category: 'FINISHED_YARN',
      groupId: '',
      unit: 'کیلوگرم',
      yarnCount: '150/48',
      grade: 'A',
      colorName: 'سفید خام',
      defaultConesPerCarton: 6,
      cartonWeightGrams: 1450,
      coneWeightGrams: 110,
      stockQty: 0,
      unitCost: 1250000,
      salesPrice: 1450000
    });
  };

  // -------------------------------------------------------------
  // TAB 3: WEIGHBRIDGE & SEQUENTIAL CARTON WEIGHING & LABEL PRINT
  // -------------------------------------------------------------
  // Step 1: Line Selection
  const [selectedLineId, setSelectedLineId] = useState<string>(lines[0]?.id || '');
  // Step 2: Commodity Selection
  const [selectedItemId, setSelectedItemId] = useState<string>(yarnItems[0]?.id || '');
  // Step 3: Cones Count
  const [conesCount, setConesCount] = useState<number>(6);
  // Step 4: Tare weights (editable/auto-populated)
  const [cartonTareGrams, setCartonTareGrams] = useState<number>(1450);
  const [coneTareGrams, setConeTareGrams] = useState<number>(110);
  const [lotNumber, setLotNumber] = useState<string>('L405-88');
  const [shiftName, setShiftName] = useState<string>('شیفت صبح A');
  const [grade, setGrade] = useState<'A' | 'B' | 'C'>('A');

  // Step 5: Gross weight from scale
  const [grossWeightKg, setGrossWeightKg] = useState<number>(25.61);
  const [isScaleReadingLive, setIsScaleReadingLive] = useState<boolean>(false);

  // Auto-populate tare & cones when item changes
  useEffect(() => {
    const itm = erpState.items.find(i => i.id === selectedItemId);
    if (itm) {
      if (itm.defaultConesPerCarton) setConesCount(itm.defaultConesPerCarton);
      if (itm.cartonWeightGrams) setCartonTareGrams(itm.cartonWeightGrams);
      if (itm.coneWeightGrams) setConeTareGrams(itm.coneWeightGrams);
      if (itm.grade) setGrade(itm.grade);
    }
  }, [selectedItemId, erpState.items]);

  // Net weight auto-calculation:
  // Tare (Kg) = (CartonTare + Cones * ConeTare) / 1000
  // Net (Kg) = Gross - Tare
  const calculatedTareKg = useMemo(() => {
    const grams = cartonTareGrams + conesCount * coneTareGrams;
    return Number((grams / 1000).toFixed(3));
  }, [cartonTareGrams, conesCount, coneTareGrams]);

  const calculatedNetKg = useMemo(() => {
    const net = grossWeightKg - calculatedTareKg;
    return Number(Math.max(0, net).toFixed(3));
  }, [grossWeightKg, calculatedTareKg]);

  // Current Weighing Batch (سلسله کارتن‌های وزن شده در این نوبت)
  const [currentBatchCartons, setCurrentBatchCartons] = useState<ErpCartonLabel[]>([]);
  const [singlePrintCarton, setSinglePrintCarton] = useState<ErpCartonLabel | null>(null);
  const [qrCodeDataUrls, setQrCodeDataUrls] = useState<Record<string, string>>({});
  const [isBatchPrinting, setIsBatchPrinting] = useState<boolean>(false);

  // Generate QR Code data url helper
  const generateCartonQr = async (carton: ErpCartonLabel): Promise<string> => {
    try {
      const payload = `DLKAM-ERP|REF:${carton.referenceCode}|ITEM:${carton.productCode}|LOT:${carton.lotNumber}|NET:${carton.netWeightKg}KG|GROSS:${carton.grossWeightKg}KG|CONES:${carton.conesCount}|DATE:${carton.createdDateJalali}|TIME:${carton.createdTimeExact || '14:00'}`;
      const url = await QRCode.toDataURL(payload, { width: 140, margin: 1 });
      return url;
    } catch {
      return '';
    }
  };

  // Live scale simulated read button
  const handleReadFromScale = () => {
    setIsScaleReadingLive(true);
    setTimeout(() => {
      // Simulate slight digital scale variation around 25.40 - 25.80 kg
      const base = 25.5;
      const variation = (Math.floor(Math.random() * 40) - 20) / 100;
      setGrossWeightKg(Number((base + variation).toFixed(2)));
      setIsScaleReadingLive(false);
      showToast?.('success', 'وزن ناخالص از ترازو/باسکول با موفقیت خوانده شد');
    }, 300);
  };

  // Add carton to current batch (توزین متوالی)
  const handleAddCartonToBatch = async () => {
    if (grossWeightKg <= calculatedTareKg) {
      showToast?.('error', 'وزن ناخالص باید از مجموع وزن ظرف و دوک‌ها بیشتر باشد');
      return;
    }
    const currentLine = lines.find(l => l.id === selectedLineId);
    const currentItem = erpState.items.find(i => i.id === selectedItemId);
    if (!currentItem) {
      showToast?.('error', 'لطفاً کالا را انتخاب نمایید');
      return;
    }

    const nextCounter = (erpState.nextSerialCounter || 1000) + currentBatchCartons.length + 1;
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const cleanDateParts = dateToday.replace(/\//g, '').slice(2); // e.g. 050820
    const serialNumber = `SN-${cleanDateParts}-${String(nextCounter).padStart(5, '0')}`;
    const referenceCode = `DLK-${currentLine?.code || 'L01'}-${String(nextCounter).padStart(5, '0')}`;
    const qrPayload = `DLKAM-ERP|REF:${referenceCode}|ITEM:${currentItem.code}|LOT:${lotNumber}|NET:${calculatedNetKg}KG|CONES:${conesCount}|TIME:${exactTime}`;

    const newCarton: ErpCartonLabel = {
      id: `carton_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      serialNumber,
      referenceCode,
      qrPayload,
      productId: currentItem.id,
      productCode: currentItem.code,
      productName: currentItem.name,
      yarnCount: currentItem.yarnCount || '150/48',
      colorName: currentItem.colorName || 'سفید خام',
      lotNumber,
      machineCode: currentLine?.name || 'TMT-01',
      shift: shiftName,
      grade,
      grossWeightKg,
      conesCount,
      coneWeightGrams: coneTareGrams,
      cartonWeightGrams: cartonTareGrams,
      totalTareKg: calculatedTareKg,
      netWeightKg: calculatedNetKg,
      unitCostPerKg: currentItem.unitCost,
      totalCostRials: Math.round(currentItem.unitCost * calculatedNetKg),
      warehouseId: currentItem.warehouseId || 'wh_finished',
      status: 'IN_STOCK',
      createdAt: Date.now(),
      createdDateJalali: dateToday,
      createdTimeExact: exactTime,
      createdBy: currentUser?.fullName || 'اپراتور خط تولید',
      productionLineId: selectedLineId,
      productionLineName: currentLine?.name || '',
      history: [
        {
          id: `hist_${Date.now()}`,
          stage: 'PRODUCTION_WEIGHING',
          title: 'توزین باسکول و ثبت عملکرد خط تولید',
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: currentUser?.fullName || 'اپراتور خط',
          details: `توزین در ${currentLine?.name} | وزن ناخالص: ${grossWeightKg} کیلو | خالص: ${calculatedNetKg} کیلو | دوک: ${conesCount}`
        }
      ]
    };

    // Pre-generate QR
    const qrUrl = await generateCartonQr(newCarton);
    setQrCodeDataUrls(prev => ({ ...prev, [newCarton.id]: qrUrl }));
    setCurrentBatchCartons(prev => [newCarton, ...prev]);

    // Prepare next gross weight with slight variation so operator can quickly weigh next
    const nextGross = Number((25.5 + (Math.floor(Math.random() * 30) - 15) / 100).toFixed(2));
    setGrossWeightKg(nextGross);
    showToast?.('success', `کارتن با کد ارجاع ${referenceCode} در بچ جاری ثبت شد`);
  };

  // Batch summary totals
  const batchTotalCartons = currentBatchCartons.length;
  const batchTotalNetWeight = useMemo(() => {
    return Number(currentBatchCartons.reduce((sum, c) => sum + c.netWeightKg, 0).toFixed(3));
  }, [currentBatchCartons]);
  const batchTotalGrossWeight = useMemo(() => {
    return Number(currentBatchCartons.reduce((sum, c) => sum + c.grossWeightKg, 0).toFixed(3));
  }, [currentBatchCartons]);

  // Finalize Batch & Generate Production Voucher with Archive Code and exact time
  const handleFinalizeBatchAndIssueVoucher = async () => {
    if (currentBatchCartons.length === 0) {
      showToast?.('error', 'هیچ کارتنی برای ثبت نهایی در این نوبت وزن‌کشی نشده است');
      return;
    }

    const currentLine = lines.find(l => l.id === selectedLineId);
    const currentItem = erpState.items.find(i => i.id === selectedItemId);
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const cleanDate = dateToday.replace(/\//g, '');
    const voucherSeq = ((erpState.productionVouchers?.length || 0) + 1);
    const voucherNo = `PRD-${cleanDate}-${String(voucherSeq).padStart(4, '0')}`;
    const archiveCode = `PRD-ARC-${cleanDate}-${String(voucherSeq).padStart(4, '0')}`;

    // Stamp cartons with voucher & archive code
    const finalizedCartons = currentBatchCartons.map(c => ({
      ...c,
      productionVoucherNo: voucherNo,
      productionArchiveCode: archiveCode
    }));

    const newVoucher: ErpProductionVoucher = {
      id: `prdv_${Date.now()}`,
      voucherNo,
      archiveCode,
      dateJalali: dateToday,
      timeExact: exactTime,
      lineId: selectedLineId,
      lineName: currentLine?.name || '',
      itemId: selectedItemId,
      itemCode: currentItem?.code || '',
      itemName: currentItem?.name || '',
      cartonsCount: finalizedCartons.length,
      totalGrossWeightKg: batchTotalGrossWeight,
      totalTareKg: Number((batchTotalGrossWeight - batchTotalNetWeight).toFixed(3)),
      totalNetWeightKg: batchTotalNetWeight,
      operatorName: currentUser?.fullName || 'اپراتور خط تولید',
      cartonIds: finalizedCartons.map(c => c.id),
      status: 'PENDING_WAREHOUSE_DELIVERY',
      notes: `تولید نوبت ${shiftName} در ${currentLine?.name}`
    };

    const nextState: IndustrialErpState = {
      ...erpState,
      cartonLabels: [...finalizedCartons, ...erpState.cartonLabels],
      productionVouchers: [newVoucher, ...(erpState.productionVouchers || [])],
      nextSerialCounter: (erpState.nextSerialCounter || 1000) + finalizedCartons.length
    };

    await persistErpState(nextState, `سند تولید ${voucherNo} با ${finalizedCartons.length} کارتن و کد بایگانی ${archiveCode} ثبت گردید`);
    setCurrentBatchCartons([]);
  };

  // -------------------------------------------------------------
  // TAB 4: PRODUCTION ARCHIVE
  // -------------------------------------------------------------
  const [selectedVoucherForView, setSelectedVoucherForView] = useState<ErpProductionVoucher | null>(null);
  const [archiveSearch, setArchiveSearch] = useState<string>('');

  const vouchersList = useMemo(() => {
    return erpState.productionVouchers || [];
  }, [erpState.productionVouchers]);

  const filteredVouchers = useMemo(() => {
    if (!archiveSearch.trim()) return vouchersList;
    const q = archiveSearch.toLowerCase();
    return vouchersList.filter(v =>
      v.voucherNo.toLowerCase().includes(q) ||
      v.archiveCode.toLowerCase().includes(q) ||
      v.itemName.toLowerCase().includes(q) ||
      v.lineName.toLowerCase().includes(q) ||
      v.dateJalali.includes(q)
    );
  }, [vouchersList, archiveSearch]);

  // -------------------------------------------------------------
  // TAB 5: BOM CALCULATION (PRESERVED)
  // -------------------------------------------------------------
  const finishedYarns = useMemo(() => erpState.items.filter(i => i.category === 'FINISHED_YARN'), [erpState.items]);
  const [selectedBomProductId, setSelectedBomProductId] = useState<string>(finishedYarns[0]?.id || 'itm_yarn_150_w');
  const [bomWastePercent, setBomWastePercent] = useState<number>(2.5);
  const [bomLaborPerKg, setBomLaborPerKg] = useState<number>(145000);
  const [bomOverheadPerKg, setBomOverheadPerKg] = useState<number>(105000);
  const [bomComponents, setBomComponents] = useState<ErpBomComponent[]>([]);

  useEffect(() => {
    const existingBom = erpState.boms?.find(b => b.finishedItemId === selectedBomProductId) || erpState.boms?.[0];
    if (existingBom) {
      setSelectedBomProductId(existingBom.finishedItemId);
      setBomWastePercent(existingBom.wastePercent);
      setBomLaborPerKg(existingBom.directLaborPerKg);
      setBomOverheadPerKg(existingBom.factoryOverheadPerKg);
      setBomComponents(existingBom.components);
    }
  }, [selectedBomProductId, erpState.boms]);

  // Print helper
  const handlePrintElement = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>چاپ لیبل صنعتی کارخانه</title>
          <style>
            body { font-family: Tahoma, 'IRANSans', sans-serif; margin: 0; padding: 12px; }
            .label-card { border: 2px solid #000; padding: 12px; border-radius: 8px; margin-bottom: 12px; page-break-inside: avoid; }
            .header { text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-bottom: 8px; font-weight: bold; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; }
            .code-box { font-family: monospace; font-weight: bold; font-size: 14px; }
            .weights-row { display: flex; justify-content: space-between; background: #f0f0f0; padding: 6px; border-radius: 4px; font-weight: bold; margin-top: 6px; }
          </style>
        </head>
        <body>${el.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-transparent overflow-hidden">
      {/* --------------------------------------------------------------------------------- */}
      {/* 1. SUBVIEW: PRD_LINES (تعریف خطوط تولید) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'prd_lines' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Factory className="w-5 h-5 text-orange-600" />
                تعریف خطوط تولید و ماشین‌آلات کارخانه
              </h2>
              <p className="text-xs text-slate-500 mt-1">مدیریت خطوط فعال، کدینگ ماشین‌آلات، سرپرست شیفت و مشخصات فنی</p>
            </div>
            <button
              onClick={() => {
                setLineForm({ code: `PL-0${lines.length + 1}`, name: '', machineType: '', supervisorName: currentUser?.fullName || '', isActive: true, notes: '' });
                setShowAddLineModal(true);
              }}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus size={16} />
              تعریف خط تولید جدید
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {lines.map(line => (
              <div key={line.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-orange-50 dark:bg-orange-950/40 text-orange-600 border border-orange-200 dark:border-orange-800">
                      {line.code}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${line.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {line.isActive ? 'فعال در خط' : 'غیرفعال'}
                    </span>
                  </div>
                  <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 mb-1">{line.name}</h3>
                  <div className="text-xs text-slate-500 space-y-1 mb-3">
                    <div>نوع تکنولوژی: <span className="font-bold text-slate-700 dark:text-slate-300">{line.machineType || '—'}</span></div>
                    <div>سرپرست: <span className="font-bold text-slate-700 dark:text-slate-300">{line.supervisorName || '—'}</span></div>
                    {line.notes && <div className="text-[11px] text-slate-400">{line.notes}</div>}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setLineForm(line);
                      setShowAddLineModal(true);
                    }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
                    title="ویرایش"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    onClick={() => handleDeleteLine(line.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors"
                    title="حذف"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 2. SUBVIEW: PRD_ITEMS (تعریف کالاها و گروه‌ها) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'prd_items' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-orange-600" />
                تعریف گروه‌های کالایی و سرفصل محصولات تولیدی
              </h2>
              <p className="text-xs text-slate-500 mt-1">تنظیم وزن ظرف کارتن خالی، وزن هر دوک و تعداد پیش‌فرض دوک در کارتن</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center gap-1">
                <button
                  onClick={() => setItemsSubTab('ITEMS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors ${itemsSubTab === 'ITEMS' ? 'bg-white dark:bg-slate-700 text-orange-600 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  کالاها ({erpState.items.length})
                </button>
                <button
                  onClick={() => setItemsSubTab('GROUPS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-colors ${itemsSubTab === 'GROUPS' ? 'bg-white dark:bg-slate-700 text-orange-600 shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  گروه‌های کالا ({groups.length})
                </button>
              </div>
              {itemsSubTab === 'ITEMS' ? (
                <button
                  onClick={() => setShowAddItemModal(true)}
                  className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow-sm transition-colors"
                >
                  <Plus size={15} />
                  تعریف کالا
                </button>
              ) : (
                <button
                  onClick={() => setShowAddGroupModal(true)}
                  className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow-sm transition-colors"
                >
                  <Plus size={15} />
                  تعریف گروه
                </button>
              )}
            </div>
          </div>

          {itemsSubTab === 'ITEMS' ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">کد کالا</th>
                      <th className="p-3">نام و مشخصات کالا</th>
                      <th className="p-3">گروه کالایی</th>
                      <th className="p-3 text-center">نمره نخ / گرید</th>
                      <th className="p-3 text-center">تعداد دوک در کارتن</th>
                      <th className="p-3 text-center">وزن کارتن خالی (گرم)</th>
                      <th className="p-3 text-center">وزن هر دوک (گرم)</th>
                      <th className="p-3 text-left">موجودی فعلی</th>
                      <th className="p-3 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {erpState.items.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-orange-600">{item.code}</td>
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{item.name}</td>
                        <td className="p-3 text-slate-500">{item.groupName || groups.find(g => g.id === item.groupId)?.name || 'نخ‌های DTY'}</td>
                        <td className="p-3 text-center">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono font-bold">{item.yarnCount || '—'}</span>
                          <span className="mr-1 text-[10px] text-amber-600 font-bold">({item.grade || 'A'})</span>
                        </td>
                        <td className="p-3 text-center font-bold">{item.defaultConesPerCarton || 6} دوک</td>
                        <td className="p-3 text-center font-mono">{item.cartonWeightGrams || 1450} g</td>
                        <td className="p-3 text-center font-mono">{item.coneWeightGrams || 110} g</td>
                        <td className="p-3 text-left font-mono font-black text-emerald-600" dir="ltr">{item.stockQty?.toLocaleString() || 0} {item.unit}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => {
                              setItemForm(item);
                              setShowAddItemModal(true);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {groups.map(g => (
                <div key={g.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-orange-600 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded">
                      {g.code}
                    </span>
                    <span className="text-xs text-slate-400 font-bold">
                      {erpState.items.filter(i => i.groupId === g.id).length} کالا
                    </span>
                  </div>
                  <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 mb-1">{g.name}</h3>
                  <p className="text-xs text-slate-500 mb-3">{g.description || '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 3. SUBVIEW: PRD_LINE_PERF (عملکرد خط تولید و توزین باسکول و چاپ لیبل) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'prd_line_perf' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          {/* Header Step Indicator & Scale Station */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left/Middle Column: Digital Weighing Station */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-orange-600 text-white shadow-sm">
                      <Scale size={20} />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">
                        میز توزین دیجیتال خط تولید، کسر خودکار وزن دوک و کارتن و چاپ لیبل QR
                      </h2>
                      <span className="text-xs text-slate-500">فرآیند دقیق ثبت عملکرد روزانه خطوط کارخانه</span>
                    </div>
                  </div>
                  <button
                    onClick={handleReadFromScale}
                    disabled={isScaleReadingLive}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black flex items-center gap-1.5 transition-colors border border-slate-200/80 dark:border-slate-700"
                  >
                    <RefreshCw size={14} className={isScaleReadingLive ? 'animate-spin text-orange-600' : ''} />
                    <span>{isScaleReadingLive ? 'در حال خواندن از ترازو...' : 'خواندن زنده از ترازو / باسکول'}</span>
                  </button>
                </div>

                {/* Step 1 & 2: Line & Commodity Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-black text-slate-700 dark:text-slate-300 block mb-1">
                      ۱. انتخاب خط تولید کارخانه:
                    </label>
                    <select
                      value={selectedLineId}
                      onChange={e => setSelectedLineId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-black text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      {lines.map(line => (
                        <option key={line.id} value={line.id}>
                          {line.code} — {line.name} ({line.machineType})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-black text-slate-700 dark:text-slate-300 block mb-1">
                      ۲. انتخاب کالای تولیدی (نخ روی باسکول):
                    </label>
                    <select
                      value={selectedItemId}
                      onChange={e => setSelectedItemId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-black text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      {yarnItems.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.code} — {item.name} ({item.yarnCount} {item.colorName})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Step 3, 4, 5: Cones, Tare & Scale Reading */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">تعداد دوک در کارتن</label>
                    <input
                      type="number"
                      value={conesCount}
                      onChange={e => setConesCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-black text-center"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">وزن کارتن خالی (گرم)</label>
                    <input
                      type="number"
                      value={cartonTareGrams}
                      onChange={e => setCartonTareGrams(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">وزن هر دوک (گرم)</label>
                    <input
                      type="number"
                      value={coneTareGrams}
                      onChange={e => setConeTareGrams(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">شماره لات (Lot No)</label>
                    <input
                      type="text"
                      value={lotNumber}
                      onChange={e => setLotNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">شیفت کاری</label>
                    <select
                      value={shiftName}
                      onChange={e => setShiftName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                    >
                      <option value="شیفت صبح A">شیفت صبح A</option>
                      <option value="شیفت عصر B">شیفت عصر B</option>
                      <option value="شیفت شب C">شیفت شب C</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">گرید کیفی نخ</label>
                    <select
                      value={grade}
                      onChange={e => setGrade(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-center"
                    >
                      <option value="A">درجه A (صادراتی ممتاز)</option>
                      <option value="B">درجه B (معمولی)</option>
                      <option value="C">درجه C (ضایعاتی/استوک)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">وزن ناخالص ترازو (Kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={grossWeightKg}
                      onChange={e => setGrossWeightKg(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border-2 border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 font-mono font-black text-center text-sm text-orange-700 dark:text-orange-400"
                    />
                  </div>
                </div>

                {/* Live Weights Calculation HUD */}
                <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md">
                  <div className="text-center">
                    <span className="text-[10px] text-slate-400 font-bold block">وزن ناخالص (Gross)</span>
                    <span className="text-base sm:text-xl font-mono font-black text-amber-400" dir="ltr">{grossWeightKg.toFixed(2)} Kg</span>
                  </div>
                  <div className="text-center border-x border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold block">کسر ظرف و دوک (Tare)</span>
                    <span className="text-base sm:text-xl font-mono font-black text-rose-400" dir="ltr">-{calculatedTareKg.toFixed(3)} Kg</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-emerald-400 font-bold block">وزن خالص نخ (Net)</span>
                    <span className="text-base sm:text-xl font-mono font-black text-emerald-400" dir="ltr">{calculatedNetKg.toFixed(3)} Kg</span>
                  </div>
                </div>

                {/* Add to batch action */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-slate-500">
                    💡 با فشردن دکمه زیر، کارتن در صف وزن‌کشی نوبت ثبت شده و باسکول بلافاصله آماده وزن کارتن بعدی می‌شود.
                  </span>
                  <button
                    onClick={handleAddCartonToBatch}
                    className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
                  >
                    <Plus size={16} />
                    ثبت این کارتن و وزن‌کشی کارتن بعدی (Enter)
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Single Label Preview */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <QrCode size={16} className="text-orange-600" />
                    پیش‌نمایش لیبل حرارتی کارتن
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">سایز استاندارد 100x70 mm</span>
                </div>

                <div id="single-carton-label-preview" className="border-2 border-slate-800 rounded-xl p-3 bg-white text-slate-900 space-y-2 select-none shadow-sm">
                  <div className="text-center border-b border-slate-300 pb-1">
                    <h4 className="font-black text-xs">{selectedCompany?.name || 'شرکت تولیدی و صنعتی لیان بافت'}</h4>
                    <span className="text-[9px] font-bold text-slate-500">لیبل شناسنامه کارتن نخ صنعتی</span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1 text-[11px] flex-1">
                      <div>کالا: <strong className="font-black text-xs">{erpState.items.find(i => i.id === selectedItemId)?.name}</strong></div>
                      <div>کد کالا: <span className="font-mono font-bold">{erpState.items.find(i => i.id === selectedItemId)?.code}</span></div>
                      <div>خط: <strong>{lines.find(l => l.id === selectedLineId)?.name}</strong></div>
                      <div>لات: <span className="font-mono font-bold">{lotNumber}</span> | شیفت: <strong>{shiftName}</strong></div>
                      <div>تعداد دوک: <strong>{conesCount} عدد</strong> | گرید: <strong className="text-orange-600">{grade}</strong></div>
                    </div>
                    <div className="w-20 h-20 bg-slate-50 border border-slate-300 rounded flex items-center justify-center shrink-0">
                      <QrCode size={64} className="text-slate-800" />
                    </div>
                  </div>

                  <div className="bg-slate-100 p-2 rounded flex items-center justify-between font-mono font-bold text-xs border border-slate-300">
                    <div>Gross: {grossWeightKg.toFixed(2)} Kg</div>
                    <div>Tare: {calculatedTareKg.toFixed(3)} Kg</div>
                    <div className="text-emerald-700 font-black">Net: {calculatedNetKg.toFixed(3)} Kg</div>
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-slate-500 pt-1 border-t border-slate-200">
                    <div>کد ارجاع: <span className="font-mono font-bold">DLK-{lines.find(l => l.id === selectedLineId)?.code}-PROD</span></div>
                    <div>تاریخ: {getTodayJalali()}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sequential Weighing Table (بچ کارتن‌های جاری) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-3 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  کارتن‌های وزن‌شده در این نوبت (آماده صدور سند تولید و چاپ دسته‌ای)
                </h3>
                <span className="text-[11px] text-slate-500">امکان ثبت متوالی تا ۵۰ الی ۱۰۰ کارتن پشت‌سرهم بدون خروج از صفحه</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsBatchPrinting(true)}
                  disabled={currentBatchCartons.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-xs font-black flex items-center gap-1.5 border border-blue-200 dark:border-blue-800 disabled:opacity-40 transition-colors"
                >
                  <Printer size={14} />
                  چاپ دسته‌ای کلیه لیبل‌ها ({currentBatchCartons.length})
                </button>
                <button
                  onClick={handleFinalizeBatchAndIssueVoucher}
                  disabled={currentBatchCartons.length === 0}
                  className="px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm disabled:opacity-40 transition-colors"
                >
                  <FileText size={14} />
                  ثبت نهایی و صدور سند تولید
                </button>
              </div>
            </div>

            {/* Batch Stats Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">تعداد کارتن این نوبت:</span>
                <span className="font-black text-sm text-slate-800 dark:text-slate-100">{batchTotalCartons} کارتن</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">مجموع وزن خالص:</span>
                <span className="font-mono font-black text-sm text-emerald-600" dir="ltr">{batchTotalNetWeight.toFixed(3)} Kg</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">مجموع وزن ناخالص:</span>
                <span className="font-mono font-black text-sm text-slate-700 dark:text-slate-300" dir="ltr">{batchTotalGrossWeight.toFixed(3)} Kg</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">میانگین وزن خالص کارتن:</span>
                <span className="font-mono font-black text-sm text-blue-600" dir="ltr">
                  {batchTotalCartons > 0 ? (batchTotalNetWeight / batchTotalCartons).toFixed(3) : '0.000'} Kg
                </span>
              </div>
            </div>

            {currentBatchCartons.length === 0 ? (
              <div className="py-8 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                هنوز کارتنی در این نوبت وزن‌کشی نشده است. وزن ناخالص را وارد نموده و دکمه «ثبت این کارتن» را بزنید.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/60 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2.5">ردیف</th>
                      <th className="p-2.5">کد ارجاع (بارکد)</th>
                      <th className="p-2.5">کالای تولیدی</th>
                      <th className="p-2.5 text-center">خط / شیفت</th>
                      <th className="p-2.5 text-center">دوک</th>
                      <th className="p-2.5 text-center">وزن ناخالص</th>
                      <th className="p-2.5 text-center">کسر ظرف</th>
                      <th className="p-2.5 text-center font-black text-emerald-600">وزن خالص</th>
                      <th className="p-2.5 text-center">ساعت ثبت</th>
                      <th className="p-2.5 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {currentBatchCartons.map((carton, idx) => (
                      <tr key={carton.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-2.5 font-mono font-bold text-orange-600">{carton.referenceCode}</td>
                        <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">{carton.productName}</td>
                        <td className="p-2.5 text-center text-slate-500">{carton.machineCode} — {carton.shift}</td>
                        <td className="p-2.5 text-center">{carton.conesCount}</td>
                        <td className="p-2.5 text-center font-mono" dir="ltr">{carton.grossWeightKg.toFixed(2)}</td>
                        <td className="p-2.5 text-center font-mono text-rose-500" dir="ltr">-{carton.totalTareKg.toFixed(3)}</td>
                        <td className="p-2.5 text-center font-mono font-black text-emerald-600" dir="ltr">{carton.netWeightKg.toFixed(3)} Kg</td>
                        <td className="p-2.5 text-center font-mono text-slate-400">{carton.createdTimeExact}</td>
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => {
                              setSinglePrintCarton(carton);
                            }}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 mr-1"
                            title="چاپ تکی لیبل"
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setCurrentBatchCartons(prev => prev.filter(c => c.id !== carton.id));
                            }}
                            className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                            title="حذف از بچ"
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
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 4. SUBVIEW: PRD_ARCHIVE (بایگانی اسناد تولید) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'prd_archive' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-600" />
                بایگانی جامع اسناد و بچ‌های نوبت تولید
              </h2>
              <p className="text-xs text-slate-500 mt-1">تفکیک شماره سند، کد بایگانی، تاریخ و ساعت دقیق ثبت نوبت و رهگیری کارتن‌ها</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="جستجو در اسناد تولید..."
                  value={archiveSearch}
                  onChange={e => setArchiveSearch(e.target.value)}
                  className="pr-8 pl-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">شماره سند تولید</th>
                    <th className="p-3">کد بایگانی</th>
                    <th className="p-3">خط تولید</th>
                    <th className="p-3">محصول تولیدی</th>
                    <th className="p-3 text-center">تعداد کارتن</th>
                    <th className="p-3 text-center">مجموع وزن خالص (Kg)</th>
                    <th className="p-3 text-center">تاریخ و ساعت دقیق</th>
                    <th className="p-3 text-center">ثبت‌کننده</th>
                    <th className="p-3 text-center">وضعیت تحویل انبار</th>
                    <th className="p-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredVouchers.map(v => (
                    <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-orange-600">{v.voucherNo}</td>
                      <td className="p-3 font-mono text-slate-500">{v.archiveCode}</td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{v.lineName}</td>
                      <td className="p-3">{v.itemName}</td>
                      <td className="p-3 text-center font-bold">{v.cartonsCount} کارتن</td>
                      <td className="p-3 text-center font-mono font-black text-emerald-600" dir="ltr">{v.totalNetWeightKg.toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <div className="font-bold">{v.dateJalali}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{v.timeExact}</div>
                      </td>
                      <td className="p-3 text-center text-slate-500">{v.operatorName}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${v.status === 'DELIVERED_TO_WAREHOUSE' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {v.status === 'DELIVERED_TO_WAREHOUSE' ? 'تحویل انبار شده' : 'در انتظار تحویل به انبار'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setSelectedVoucherForView(v)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Eye size={13} />
                          مشاهده کارتن‌ها
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredVouchers.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400 font-bold">
                        هیچ سند تولیدی در بایگانی یافت نشد.
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
      {/* 5. SUBVIEW: PRD_BOM (تعریف فرمول‌های تولید BOM) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'prd_bom' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-600" />
                مهندسی فرمول تولید نخ (BOM)، ضایعات فرمول و محاسبه بهای تمام‌شده هر کیلوگرم
              </h2>
              <p className="text-xs text-slate-500 mt-1">تخصیص مواد اولیه POY، روغن تکسچرایزینگ، ملزومات و بهای تمام‌شده</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">محصول نهایی نخ</label>
                <select
                  value={selectedBomProductId}
                  onChange={e => setSelectedBomProductId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {finishedYarns.map(y => (
                    <option key={y.id} value={y.id}>
                      {y.code} — {y.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">درصد ضایعات فرمول (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={bomWastePercent}
                  onChange={e => setBomWastePercent(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">دستمزد مستقیم هر کیلو (ریال)</label>
                <input
                  type="number"
                  value={bomLaborPerKg}
                  onChange={e => setBomLaborPerKg(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">سربار کارخانه هر کیلو (ریال)</label>
                <input
                  type="number"
                  value={bomOverheadPerKg}
                  onChange={e => setBomOverheadPerKg(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>
            </div>

            <div className="pt-2">
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 mb-2">اجزای مصرفی در ۱ کیلوگرم نخ خروجی:</h4>
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                  <span className="font-bold">نخ اولیه POY پلی‌استر (با احتساب {bomWastePercent}% ضایعات)</span>
                  <span className="font-mono font-black text-orange-600">{(1 * (1 + bomWastePercent / 100)).toFixed(3)} Kg</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-700">
                  <span className="font-bold">روغن تکسچرایزینگ (Spin Finish)</span>
                  <span className="font-mono font-bold">0.025 Kg</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="font-bold">سهم ملزومات بسته‌بندی (کارتن، دوک، نایلون و تسمه)</span>
                  <span className="font-mono font-bold">0.043 کارتن</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: ADD / EDIT LINE */}
      {/* --------------------------------------------------------------------------------- */}
      {showAddLineModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                {lineForm.id ? 'ویرایش خط تولید' : 'تعریف خط تولید جدید'}
              </h3>
              <button onClick={() => setShowAddLineModal(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">کد خط تولید</label>
                <input
                  type="text"
                  value={lineForm.code}
                  onChange={e => setLineForm({ ...lineForm, code: e.target.value })}
                  placeholder="مثال: PL-05"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">نام خط تولید</label>
                <input
                  type="text"
                  value={lineForm.name}
                  onChange={e => setLineForm({ ...lineForm, name: e.target.value })}
                  placeholder="مثال: خط تکسچره ۳ (ماشین Rieter)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">نوع ماشین / تکنولوژی</label>
                <input
                  type="text"
                  value={lineForm.machineType}
                  onChange={e => setLineForm({ ...lineForm, machineType: e.target.value })}
                  placeholder="مثال: تکسچرایزینگ ۲۸۸ چشمه"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">سرپرست خط</label>
                <input
                  type="text"
                  value={lineForm.supervisorName}
                  onChange={e => setLineForm({ ...lineForm, supervisorName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">توضیحات تکمیلی</label>
                <textarea
                  value={lineForm.notes}
                  onChange={e => setLineForm({ ...lineForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddLineModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveLine}
                className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-sm"
              >
                ذخیره اطلاعات خط
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: ADD / EDIT ITEM */}
      {/* --------------------------------------------------------------------------------- */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                {itemForm.id ? 'ویرایش مشخصات کالا' : 'تعریف کالای تولیدی جدید'}
              </h3>
              <button onClick={() => setShowAddItemModal(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">کد کالا</label>
                  <input
                    type="text"
                    value={itemForm.code}
                    onChange={e => setItemForm({ ...itemForm, code: e.target.value })}
                    placeholder="مثال: YN-3005"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">گروه کالایی</label>
                  <select
                    value={itemForm.groupId}
                    onChange={e => setItemForm({ ...itemForm, groupId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                  >
                    <option value="">انتخاب گروه کالایی...</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">نام و عنوان کامل کالا</label>
                <input
                  type="text"
                  value={itemForm.name}
                  onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="مثال: نخ تکسچره پلی‌استر DTY 150/48 NIM سفید"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold block mb-1">نمره نخ</label>
                  <input
                    type="text"
                    value={itemForm.yarnCount}
                    onChange={e => setItemForm({ ...itemForm, yarnCount: e.target.value })}
                    placeholder="150/48"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">رنگ نخ</label>
                  <input
                    type="text"
                    value={itemForm.colorName}
                    onChange={e => setItemForm({ ...itemForm, colorName: e.target.value })}
                    placeholder="سفید خام"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-center"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">گرید کیفی</label>
                  <select
                    value={itemForm.grade || 'A'}
                    onChange={e => setItemForm({ ...itemForm, grade: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-center"
                  >
                    <option value="A">درجه A</option>
                    <option value="B">درجه B</option>
                    <option value="C">درجه C</option>
                  </select>
                </div>
              </div>

              {/* Crucial tare weights */}
              <div className="p-3 bg-orange-50/50 dark:bg-orange-950/20 rounded-2xl border border-orange-200 dark:border-orange-800 space-y-2">
                <span className="font-black text-orange-800 dark:text-orange-300 block text-[11px]">
                  پارامترهای محاسباتی کسر ظرف خودکار هنگام توزین:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">تعداد دوک پیش‌فرض</label>
                    <input
                      type="number"
                      value={itemForm.defaultConesPerCarton}
                      onChange={e => setItemForm({ ...itemForm, defaultConesPerCarton: parseInt(e.target.value) || 6 })}
                      className="w-full px-2 py-1.5 rounded-lg border bg-white dark:bg-slate-900 font-bold text-center text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">وزن کارتن خالی (گرم)</label>
                    <input
                      type="number"
                      value={itemForm.cartonWeightGrams}
                      onChange={e => setItemForm({ ...itemForm, cartonWeightGrams: parseInt(e.target.value) || 1450 })}
                      className="w-full px-2 py-1.5 rounded-lg border bg-white dark:bg-slate-900 font-mono font-bold text-center text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">وزن هر دوک (گرم)</label>
                    <input
                      type="number"
                      value={itemForm.coneWeightGrams}
                      onChange={e => setItemForm({ ...itemForm, coneWeightGrams: parseInt(e.target.value) || 110 })}
                      className="w-full px-2 py-1.5 rounded-lg border bg-white dark:bg-slate-900 font-mono font-bold text-center text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddItemModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveItem}
                className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-sm"
              >
                ذخیره کالا
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: VIEW PRODUCTION VOUCHER DETAILS & CARTONS */}
      {/* --------------------------------------------------------------------------------- */}
      {selectedVoucherForView && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-orange-600" />
                  جزئیات سند تولید {selectedVoucherForView.voucherNo}
                </h3>
                <span className="text-xs text-slate-400 font-mono">کد بایگانی: {selectedVoucherForView.archiveCode}</span>
              </div>
              <button onClick={() => setSelectedVoucherForView(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl text-xs">
              <div>خط: <strong className="font-bold text-slate-800 dark:text-slate-200">{selectedVoucherForView.lineName}</strong></div>
              <div>محصول: <strong className="font-bold text-slate-800 dark:text-slate-200">{selectedVoucherForView.itemName}</strong></div>
              <div>تاریخ: <strong className="font-bold">{selectedVoucherForView.dateJalali}</strong></div>
              <div>ساعت دقیق: <strong className="font-mono text-orange-600">{selectedVoucherForView.timeExact}</strong></div>
              <div>تعداد کارتن: <strong className="font-bold">{selectedVoucherForView.cartonsCount}</strong></div>
              <div>وزن ناخالص: <strong className="font-mono">{selectedVoucherForView.totalGrossWeightKg} Kg</strong></div>
              <div>وزن خالص کل: <strong className="font-mono text-emerald-600">{selectedVoucherForView.totalNetWeightKg} Kg</strong></div>
              <div>ثبت‌کننده: <strong>{selectedVoucherForView.operatorName}</strong></div>
            </div>

            <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">فهرست کارتن‌های ثبت شده در این سند:</h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-600">
                  <tr>
                    <th className="p-2">ردیف</th>
                    <th className="p-2">کد ارجاع</th>
                    <th className="p-2 text-center">دوک</th>
                    <th className="p-2 text-center">وزن ناخالص</th>
                    <th className="p-2 text-center">وزن خالص</th>
                    <th className="p-2 text-center">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {erpState.cartonLabels
                    .filter(c => selectedVoucherForView.cartonIds?.includes(c.id) || c.productionVoucherNo === selectedVoucherForView.voucherNo)
                    .map((c, i) => (
                      <tr key={c.id}>
                        <td className="p-2 text-slate-400 font-mono">{i + 1}</td>
                        <td className="p-2 font-mono font-bold text-orange-600">{c.referenceCode}</td>
                        <td className="p-2 text-center">{c.conesCount}</td>
                        <td className="p-2 text-center font-mono">{c.grossWeightKg.toFixed(2)}</td>
                        <td className="p-2 text-center font-mono font-black text-emerald-600">{c.netWeightKg.toFixed(3)} Kg</td>
                        <td className="p-2 text-center">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                            {c.status === 'IN_STOCK' ? 'در انبار' : c.status === 'SOLD' ? 'تحویل مشتری' : 'آماده تحویل'}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedVoucherForView(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black shadow-sm"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL / SHEET: BATCH PRINT STICKERS */}
      {/* --------------------------------------------------------------------------------- */}
      {isBatchPrinting && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Printer className="w-5 h-5 text-orange-600" />
                  چاپ دسته‌ای کلیه لیبل‌های کارتن ({currentBatchCartons.length} کارتن)
                </h3>
                <span className="text-xs text-slate-500">طرح چاپ لیبل حرارتی استاندارد صنعتی ۱۰ در ۷ سانتیمتر</span>
              </div>
              <button onClick={() => setIsBatchPrinting(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div id="batch-labels-print-container" className="space-y-4">
              {currentBatchCartons.map((carton, idx) => (
                <div key={carton.id} className="label-card border-2 border-slate-800 rounded-2xl p-4 bg-white text-slate-900 space-y-2 shadow-sm page-break-inside-avoid">
                  <div className="text-center border-b border-slate-300 pb-1">
                    <h4 className="font-black text-sm">{selectedCompany?.name || 'شرکت تولیدی و صنعتی لیان بافت'}</h4>
                    <span className="text-[10px] font-bold text-slate-500">شناسنامه کارتن تولید - ردیف {idx + 1} از {currentBatchCartons.length}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1 text-xs flex-1">
                      <div>محصول: <strong className="font-black text-sm">{carton.productName}</strong></div>
                      <div>کد کالا: <span className="font-mono font-bold text-orange-600">{carton.productCode}</span></div>
                      <div>خط: <strong>{carton.machineCode}</strong> | شیفت: <strong>{carton.shift}</strong></div>
                      <div>لات: <span className="font-mono font-bold">{carton.lotNumber}</span> | دوک: <strong>{carton.conesCount} عدد</strong> | درجه: <strong>{carton.grade}</strong></div>
                    </div>
                    <div className="w-24 h-24 bg-slate-50 border border-slate-300 rounded-xl flex items-center justify-center p-1 shrink-0">
                      {qrCodeDataUrls[carton.id] ? (
                        <img src={qrCodeDataUrls[carton.id]} alt="QR" className="w-full h-full object-contain" />
                      ) : (
                        <QrCode size={70} className="text-slate-800" />
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-100 p-2.5 rounded-xl flex items-center justify-between font-mono font-bold text-xs border border-slate-300">
                    <div>Gross: {carton.grossWeightKg.toFixed(2)} Kg</div>
                    <div>Tare: {carton.totalTareKg.toFixed(3)} Kg</div>
                    <div className="text-emerald-700 font-black text-sm">Net: {carton.netWeightKg.toFixed(3)} Kg</div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200">
                    <div>کد ارجاع: <span className="font-mono font-black text-slate-900">{carton.referenceCode}</span></div>
                    <div>ساعت: <span className="font-mono font-bold">{carton.createdTimeExact}</span> | تاریخ: {carton.createdDateJalali}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsBatchPrinting(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600"
              >
                انصراف
              </button>
              <button
                onClick={() => handlePrintElement('batch-labels-print-container')}
                className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md flex items-center gap-1.5"
              >
                <Printer size={15} />
                ارسال به چاپگر لیبل‌زن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: SINGLE LABEL PRINT */}
      {/* --------------------------------------------------------------------------------- */}
      {singlePrintCarton && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Printer size={16} className="text-orange-600" />
                چاپ لیبل کارتن {singlePrintCarton.referenceCode}
              </h3>
              <button onClick={() => setSinglePrintCarton(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div id="single-carton-print-box" className="border-2 border-slate-800 rounded-2xl p-4 bg-white text-slate-900 space-y-2 shadow-sm">
              <div className="text-center border-b border-slate-300 pb-1">
                <h4 className="font-black text-sm">{selectedCompany?.name || 'شرکت تولیدی و صنعتی لیان بافت'}</h4>
                <span className="text-[10px] font-bold text-slate-500">لیبل شناسنامه کارتن نخ صنعتی</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1 text-xs flex-1">
                  <div>محصول: <strong className="font-black">{singlePrintCarton.productName}</strong></div>
                  <div>کد کالا: <span className="font-mono font-bold text-orange-600">{singlePrintCarton.productCode}</span></div>
                  <div>خط: <strong>{singlePrintCarton.machineCode}</strong></div>
                  <div>لات: <span className="font-mono font-bold">{singlePrintCarton.lotNumber}</span> | شیفت: <strong>{singlePrintCarton.shift}</strong></div>
                  <div>تعداد دوک: <strong>{singlePrintCarton.conesCount}</strong> | گرید: <strong>{singlePrintCarton.grade}</strong></div>
                </div>
                <div className="w-24 h-24 bg-slate-50 border border-slate-300 rounded-xl flex items-center justify-center p-1 shrink-0">
                  {qrCodeDataUrls[singlePrintCarton.id] ? (
                    <img src={qrCodeDataUrls[singlePrintCarton.id]} alt="QR" className="w-full h-full object-contain" />
                  ) : (
                    <QrCode size={70} className="text-slate-800" />
                  )}
                </div>
              </div>

              <div className="bg-slate-100 p-2 rounded-xl flex items-center justify-between font-mono font-bold text-xs border border-slate-300">
                <div>Gross: {singlePrintCarton.grossWeightKg.toFixed(2)} Kg</div>
                <div>Tare: {singlePrintCarton.totalTareKg.toFixed(3)} Kg</div>
                <div className="text-emerald-700 font-black">Net: {singlePrintCarton.netWeightKg.toFixed(3)} Kg</div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200">
                <div>کد ارجاع: <span className="font-mono font-black text-slate-900">{singlePrintCarton.referenceCode}</span></div>
                <div>ساعت: <span className="font-mono font-bold">{singlePrintCarton.createdTimeExact}</span> | تاریخ: {singlePrintCarton.createdDateJalali}</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSinglePrintCarton(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600"
              >
                انصراف
              </button>
              <button
                onClick={() => handlePrintElement('single-carton-print-box')}
                className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md flex items-center gap-1.5"
              >
                <Printer size={15} />
                چاپ لیبل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
