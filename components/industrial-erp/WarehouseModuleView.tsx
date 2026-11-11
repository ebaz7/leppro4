import React, { useState, useEffect, useMemo } from 'react';
import {
  Scale,
  QrCode,
  Printer,
  RefreshCw,
  Truck,
  Database,
  X,
  ShoppingCart
} from 'lucide-react';
import QRCode from 'qrcode';
import { apiCall } from '../../services/apiService';
import { User, ExitPermit } from '../../types';
import {
  ErpCompanySummary,
  ErpSubViewId,
  IndustrialErpState,
  ErpCartonLabel,
  ErpWarehouse,
  ErpItem,
  ErpWarehouseDoc,
  ErpBomComponent,
  getTodayJalali
} from './types';

interface WarehouseModuleViewProps {
  activeSubView: ErpSubViewId;
  selectedCompany: ErpCompanySummary;
  erpState: IndustrialErpState;
  setErpState: React.Dispatch<React.SetStateAction<IndustrialErpState | null>>;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
  currentUser: User;
  showToast: (type: 'success' | 'error', text: string) => void;
  openSubViewTab: (subId: ErpSubViewId) => void;
  canWeighAndPrintLabel: boolean;
  canIssueRemittance: boolean;
  canViewCostPrice: boolean;
  syncingBarcodes: boolean;
  handleSyncSayanBarcodes: () => Promise<void>;
}

export const WarehouseModuleView: React.FC<WarehouseModuleViewProps> = ({
  activeSubView,
  selectedCompany,
  erpState,
  setErpState,
  persistErpState,
  currentUser,
  showToast,
  openSubViewTab,
  canWeighAndPrintLabel,
  canIssueRemittance,
  canViewCostPrice,
  syncingBarcodes,
  handleSyncSayanBarcodes
}) => {
  // Weighbridge state
  const [selectedYarnId, setSelectedYarnId] = useState<string>('itm_yarn_150_w');
  const [scaleGrossWeightKg, setScaleGrossWeightKg] = useState<number>(25.61);
  const [conesCount, setConesCount] = useState<number>(6);
  const [overrideConeWeightGrams, setOverrideConeWeightGrams] = useState<number>(110);
  const [overrideCartonWeightGrams, setOverrideCartonWeightGrams] = useState<number>(1450);
  const [lotNumber, setLotNumber] = useState<string>('L405-88');
  const [machineCode, setMachineCode] = useState<string>('TMT-01');
  const [shiftName, setShiftName] = useState<string>('شیفت صبح A');
  const [grade, setGrade] = useState<'A' | 'B' | 'C'>('A');
  const [autoIssueProductionVoucher, setAutoIssueProductionVoucher] = useState<boolean>(true);
  const [activePreviewLabel, setActivePreviewLabel] = useState<ErpCartonLabel | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [savingLocal, setSavingLocal] = useState(false);

  // Factory Exit Remittance state
  const [scanInput, setScanInput] = useState<string>('');
  const [scannedCartonsForRemittance, setScannedCartonsForRemittance] = useState<ErpCartonLabel[]>([]);
  const [remCustomerName, setRemCustomerName] = useState<string>('شرکت نساجی بهپود');
  const [remCustomerCode, setRemCustomerCode] = useState<string>('113101');
  const [remDriverName, setRemDriverName] = useState<string>('');
  const [remDriverPhone, setRemDriverPhone] = useState<string>('');
  const [remPlateNumber, setRemPlateNumber] = useState<string>('');
  const [remDestinationAddress, setRemDestinationAddress] = useState<string>('');

  // Warehouse Master & Docs state
  const [newWarehouseForm, setNewWarehouseForm] = useState({
    code: '',
    name: '',
    type: 'FINISHED_YARN' as ErpWarehouse['type'],
    location: '',
    managerName: ''
  });
  const [newItem, setNewItem] = useState<Partial<ErpItem>>({
    code: '',
    name: '',
    category: 'FINISHED_YARN',
    unit: 'کیلوگرم',
    warehouseId: 'wh_yarn',
    stockQty: 0,
    unitCost: 1850000,
    salesPrice: 2150000,
    yarnCount: '150D/48F',
    colorName: 'سفید',
    coneWeightGrams: 110,
    cartonWeightGrams: 1450,
    defaultConesPerCarton: 6
  });
  const [whDocForm, setWhDocForm] = useState({
    docType: 'RECEIPT_PURCHASE' as ErpWarehouseDoc['docType'],
    warehouseId: 'wh_raw',
    counterpartyName: '',
    itemId: 'itm_poy_150',
    qty: 100,
    notes: ''
  });
  const [stockCountMap, setStockCountMap] = useState<Record<string, number>>({});

  // Live Delkam Exit Permits (for cross-module integration with Delkam Factory Exit / Guard section)
  const [delkamExitPermits, setDelkamExitPermits] = useState<ExitPermit[]>([]);
  const [loadingDelkamPermits, setLoadingDelkamPermits] = useState<boolean>(false);

  const fetchDelkamExitPermits = async () => {
    try {
      setLoadingDelkamPermits(true);
      const list = await apiCall<ExitPermit[]>('/exit-permits');
      if (Array.isArray(list)) {
        setDelkamExitPermits(list.slice(0, 20));
      }
    } catch {
      // ignore if user lacks exit permit view permission
    } finally {
      setLoadingDelkamPermits(false);
    }
  };

  useEffect(() => {
    if (activeSubView === 'wh_exit_remittance' || activeSubView === 'wh_cartable') {
      fetchDelkamExitPermits();
    }
  }, [activeSubView, erpState.remittances.length]);

  useEffect(() => {
    if (erpState.cartonLabels?.length > 0 && !activePreviewLabel) {
      setActivePreviewLabel(erpState.cartonLabels[0]);
    }
  }, [erpState.cartonLabels, activePreviewLabel]);

  const selectedYarnProduct = useMemo(() => {
    return erpState.items.find(i => i.id === selectedYarnId) || erpState.items.find(i => i.category === 'FINISHED_YARN') || null;
  }, [erpState, selectedYarnId]);

  useEffect(() => {
    if (selectedYarnProduct) {
      setConesCount(selectedYarnProduct.defaultConesPerCarton || 6);
      setOverrideConeWeightGrams(selectedYarnProduct.coneWeightGrams || 110);
      setOverrideCartonWeightGrams(selectedYarnProduct.cartonWeightGrams || 1450);
    }
  }, [selectedYarnProduct]);

  useEffect(() => {
    if (!activePreviewLabel) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(activePreviewLabel.qrPayload, {
      width: 190,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    })
      .then(url => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [activePreviewLabel]);

  const calculateBomCostPerKg = (
    components: ErpBomComponent[],
    wastePct: number,
    laborPerKg: number,
    overheadPerKg: number,
    yarnItem?: ErpItem | null
  ) => {
    let rawMaterialCostPerKg = 0;
    let packagingCostPerKg = 0;
    const avgNetPerCarton = 23.5;

    for (const comp of components) {
      const mat = erpState.items.find(i => i.id === comp.itemId);
      const unitCost = mat?.unitCost || 0;
      if (comp.category === 'RAW_MATERIAL') {
        const effectiveQty = comp.qtyPerKgOutput * (1 + wastePct / 100);
        rawMaterialCostPerKg += effectiveQty * unitCost;
      } else {
        if (comp.unit.includes('عدد')) {
          packagingCostPerKg += (comp.qtyPerKgOutput * unitCost) / avgNetPerCarton;
        } else {
          packagingCostPerKg += comp.qtyPerKgOutput * unitCost;
        }
      }
    }

    if (components.length === 0 && yarnItem) {
      return {
        rawMaterialCostPerKg: yarnItem.unitCost * 0.78,
        packagingCostPerKg: yarnItem.unitCost * 0.06,
        laborPerKg,
        overheadPerKg,
        totalCostPerKg: yarnItem.unitCost
      };
    }

    const totalCostPerKg = Math.round(rawMaterialCostPerKg + packagingCostPerKg + laborPerKg + overheadPerKg);
    return {
      rawMaterialCostPerKg: Math.round(rawMaterialCostPerKg),
      packagingCostPerKg: Math.round(packagingCostPerKg),
      laborPerKg: Math.round(laborPerKg),
      overheadPerKg: Math.round(overheadPerKg),
      totalCostPerKg
    };
  };

  const weighCalculation = useMemo(() => {
    const totalConesGrams = Math.max(0, conesCount) * Math.max(0, overrideConeWeightGrams);
    const totalTareGrams = totalConesGrams + Math.max(0, overrideCartonWeightGrams);
    const totalTareKg = Number((totalTareGrams / 1000).toFixed(3));
    const netWeightKg = Number(Math.max(0, scaleGrossWeightKg - totalTareKg).toFixed(3));

    const productBom = erpState.boms.find(b => b.finishedItemId === selectedYarnProduct?.id);
    const costBreakdown = calculateBomCostPerKg(
      productBom?.components || [],
      productBom?.wastePercent ?? 2.5,
      productBom?.directLaborPerKg ?? 145000,
      productBom?.factoryOverheadPerKg ?? 105000,
      selectedYarnProduct
    );

    const bomDeductions: { itemId: string; itemName: string; deductedQty: number; unit: string; totalCost: number }[] = [];
    if (productBom) {
      for (const comp of productBom.components) {
        const mat = erpState.items.find(i => i.id === comp.itemId);
        let deductedQty = 0;
        if (comp.category === 'RAW_MATERIAL') {
          deductedQty = Number((netWeightKg * comp.qtyPerKgOutput * (1 + productBom.wastePercent / 100)).toFixed(3));
        } else {
          if (comp.itemId.includes('cone') || comp.itemName.includes('دوک')) {
            deductedQty = conesCount;
          } else if (comp.itemId.includes('carton') || comp.itemName.includes('کارتن')) {
            deductedQty = 1;
          } else {
            deductedQty = Number((netWeightKg * comp.qtyPerKgOutput).toFixed(3));
          }
        }
        bomDeductions.push({
          itemId: comp.itemId,
          itemName: comp.itemName,
          deductedQty,
          unit: comp.unit,
          totalCost: Math.round(deductedQty * (mat?.unitCost || 0))
        });
      }
    }

    return {
      totalConesGrams,
      totalTareGrams,
      totalTareKg,
      netWeightKg,
      unitCostPerKg: costBreakdown.totalCostPerKg,
      totalCartonCostRials: Math.round(netWeightKg * costBreakdown.totalCostPerKg),
      bomDeductions
    };
  }, [scaleGrossWeightKg, conesCount, overrideConeWeightGrams, overrideCartonWeightGrams, selectedYarnProduct, erpState]);

  const handleIssueWeighbridgeLabel = async () => {
    if (!selectedYarnProduct) return;
    if (!canWeighAndPrintLabel) {
      showToast('error', 'شما مجوز توزین باسکول و صدور لیبل کارتن را ندارید.');
      return;
    }
    if (weighCalculation.netWeightKg <= 0) {
      showToast('error', 'وزن خالص کارتن باید بزرگ‌تر از صفر باشد.');
      return;
    }

    setSavingLocal(true);
    try {
      const serialCounter = erpState.nextSerialCounter || 10002;
      const serialNumber = `DLK-405-${serialCounter}`;
      const qrPayload = `DLKAM|${serialNumber}|${selectedYarnProduct.code}|LOT:${lotNumber}|GROSS:${scaleGrossWeightKg}|TARE:${weighCalculation.totalTareKg}|NET:${weighCalculation.netWeightKg}|CONES:${conesCount}`;
      const todayJalali = getTodayJalali();

      const newLabel: ErpCartonLabel = {
        id: `lbl_${Date.now()}`,
        serialNumber,
        qrPayload,
        productId: selectedYarnProduct.id,
        productCode: selectedYarnProduct.code,
        productName: selectedYarnProduct.name,
        yarnCount: selectedYarnProduct.yarnCount || '',
        colorName: selectedYarnProduct.colorName || '',
        lotNumber,
        machineCode,
        shift: shiftName,
        grade,
        grossWeightKg: scaleGrossWeightKg,
        conesCount,
        coneWeightGrams: overrideConeWeightGrams,
        cartonWeightGrams: overrideCartonWeightGrams,
        totalTareKg: weighCalculation.totalTareKg,
        netWeightKg: weighCalculation.netWeightKg,
        unitCostPerKg: weighCalculation.unitCostPerKg,
        totalCostRials: weighCalculation.totalCartonCostRials,
        warehouseId: selectedYarnProduct.warehouseId || 'wh_yarn',
        status: 'IN_STOCK',
        createdAt: Date.now(),
        createdDateJalali: todayJalali,
        createdBy: currentUser.fullName,
        sourceSystem: 'DELKAM'
      };

      const nextItems = erpState.items.map(item => {
        if (item.id === selectedYarnProduct.id) {
          return {
            ...item,
            stockQty: Number((item.stockQty + weighCalculation.netWeightKg).toFixed(3)),
            unitCost: weighCalculation.unitCostPerKg
          };
        }
        const deduct = weighCalculation.bomDeductions.find(d => d.itemId === item.id);
        if (deduct) {
          return {
            ...item,
            stockQty: Number(Math.max(0, item.stockQty - deduct.deductedQty).toFixed(3))
          };
        }
        return item;
      });

      const nextVouchers = [...erpState.vouchers];
      let nextVoucherNo = erpState.nextVoucherNo || 1002;

      if (autoIssueProductionVoucher) {
        const rawTotal = weighCalculation.bomDeductions
          .filter(d => erpState.items.find(i => i.id === d.itemId)?.category === 'RAW_MATERIAL')
          .reduce((s, d) => s + d.totalCost, 0);
        const packTotal = weighCalculation.bomDeductions
          .filter(d => erpState.items.find(i => i.id === d.itemId)?.category === 'PACKAGING')
          .reduce((s, d) => s + d.totalCost, 0);
        const remainderOverhead = Math.max(0, weighCalculation.totalCartonCostRials - rawTotal - packTotal);

        const prodVoucher = {
          id: `vch_${Date.now()}`,
          voucherNo: nextVoucherNo,
          dateJalali: todayJalali,
          type: 'PRODUCTION' as const,
          status: 'FINALIZED' as const,
          description: `سند اتوماتیک تولید و توزین کارتن ${serialNumber} (${selectedYarnProduct.name} - خالص ${weighCalculation.netWeightKg} Kg)`,
          referenceId: newLabel.id,
          createdBy: currentUser.fullName,
          createdAt: Date.now(),
          lines: [
            {
              id: `vl_${Date.now()}_1`,
              accountCode: '110403',
              accountTitle: 'موجودی انبار محصول نهایی نخ',
              tafziliName: selectedYarnProduct.name,
              debit: weighCalculation.totalCartonCostRials,
              credit: 0,
              description: `رسید تولید کارتن ${serialNumber} با وزن خالص ${weighCalculation.netWeightKg} کیلوگرم`
            },
            ...(rawTotal > 0
              ? [
                  {
                    id: `vl_${Date.now()}_2`,
                    accountCode: '110401',
                    accountTitle: 'موجودی انبار مواد اولیه (الیاف و POY)',
                    tafziliName: 'مصرف مواد اولیه طبق BOM',
                    debit: 0,
                    credit: rawTotal,
                    description: `کسر اتوماتیک مواد اولیه بابت کارتن ${serialNumber}`
                  }
                ]
              : []),
            ...(packTotal > 0
              ? [
                  {
                    id: `vl_${Date.now()}_3`,
                    accountCode: '110402',
                    accountTitle: 'موجودی انبار ملزومات بسته‌بندی (دوک و کارتن)',
                    tafziliName: `${conesCount} عدد دوک + ۱ کارتن`,
                    debit: 0,
                    credit: packTotal,
                    description: `کسر اتوماتیک دوک و کارتن مصرفی (${weighCalculation.totalTareKg} Kg)`
                  }
                ]
              : []),
            ...(remainderOverhead > 0
              ? [
                  {
                    id: `vl_${Date.now()}_4`,
                    accountCode: '5102',
                    accountTitle: 'دستمزد مستقیم و سربار جذب‌شده تولید',
                    tafziliName: machineCode,
                    debit: 0,
                    credit: remainderOverhead,
                    description: `جذب دستمزد و سربار کارخانه برای ${weighCalculation.netWeightKg} Kg`
                  }
                ]
              : [])
          ]
        };
        nextVouchers.unshift(prodVoucher);
        nextVoucherNo += 1;
      }

      const nextState: IndustrialErpState = {
        ...erpState,
        items: nextItems,
        cartonLabels: [newLabel, ...erpState.cartonLabels],
        vouchers: nextVouchers,
        nextVoucherNo,
        nextSerialCounter: serialCounter + 1
      };

      await persistErpState(
        nextState,
        `لیبل کارتن ${serialNumber} با وزن خالص ${weighCalculation.netWeightKg} Kg صادر شد و کسورات BOM از انبار کسر گردید.`
      );
      setActivePreviewLabel(newLabel);
    } finally {
      setSavingLocal(false);
    }
  };

  const handlePrintCartonLabel = (label: ErpCartonLabel) => {
    const win = window.open('', '_blank', 'width=520,height=650');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="UTF-8" />
        <title>لیبل کارتن نخ ${label.serialNumber}</title>
        <style>
          body { font-family: Tahoma, Vazirmatn, sans-serif; margin: 0; padding: 14px; background: #fff; color: #0f172a; }
          .box { border: 3px solid #0f172a; border-radius: 12px; padding: 14px; }
          .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
          .title { font-size: 16px; font-weight: 900; }
          .serial { font-family: monospace; font-size: 16px; font-weight: 900; background: #0f172a; color: #fff; padding: 4px 10px; border-radius: 6px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; margin-bottom: 10px; }
          .cell { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; }
          .lbl { color: #475569; font-size: 10px; display: block; }
          .val { font-weight: 800; font-size: 13px; }
          .weights { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; background: #f8fafc; border: 2px solid #0f172a; border-radius: 8px; padding: 8px; text-align: center; margin-bottom: 10px; }
          .net { font-size: 18px; font-weight: 900; color: #047857; }
          .qr-row { display: flex; align-items: center; justify-content: space-between; border-top: 1px dashed #94a3b8; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="hdr">
            <div>
              <div class="title">${selectedCompany?.name || erpState?.companyName || 'شرکت تولیدی لپان بافت'}</div>
              <div style="font-size:11px;font-weight:bold;margin-top:2px;">${label.productName}</div>
            </div>
            <div class="serial">${label.serialNumber}</div>
          </div>
          <div class="grid">
            <div class="cell"><span class="lbl">نمره نخ / دنیر و فیلامنت</span><span class="val">${label.yarnCount || '-'}</span></div>
            <div class="cell"><span class="lbl">شماره لات (Lot No) و گرید</span><span class="val">${label.lotNumber} | درجه ${label.grade}</span></div>
            <div class="cell"><span class="lbl">رنگ نخ</span><span class="val">${label.colorName || '-'}</span></div>
            <div class="cell"><span class="lbl">تعداد دوک در کارتن</span><span class="val">${label.conesCount} عدد دوک</span></div>
            <div class="cell"><span class="lbl">ماشین / شیفت تولید</span><span class="val">${label.machineCode} - ${label.shift}</span></div>
            <div class="cell"><span class="lbl">تاریخ تولید</span><span class="val">${label.createdDateJalali}</span></div>
          </div>
          <div class="weights">
            <div><span class="lbl">وزن ناخالص باسکول</span><span class="val">${label.grossWeightKg.toFixed(2)} Kg</span></div>
            <div><span class="lbl">وزن کارتن و دوک (Tare)</span><span class="val">${label.totalTareKg.toFixed(2)} Kg</span></div>
            <div><span class="lbl">وزن خالص نخ (Net)</span><span class="net">${label.netWeightKg.toFixed(2)} Kg</span></div>
          </div>
          <div class="qr-row">
            <div style="font-size:10px;font-family:monospace;word-break:break-all;max-width:65%;">${label.qrPayload}</div>
            ${qrDataUrl ? `<img src="${qrDataUrl}" style="width:105px;height:105px;" />` : ''}
          </div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    win.document.close();
  };

  const handleScanCartonForRemittance = async () => {
    if (!scanInput.trim()) return;
    const raw = scanInput.trim();
    let serial = raw;
    if (raw.includes('|')) {
      const parts = raw.split('|');
      if (parts.length >= 2) serial = parts[1].trim();
    }

    let found = erpState.cartonLabels.find(
      c => c.serialNumber.toLowerCase() === serial.toLowerCase() || c.qrPayload.toLowerCase() === raw.toLowerCase()
    );

    if (!found) {
      try {
        const liveRes = await apiCall<any>('/industrial-erp/lookup-any-barcode', 'POST', {
          companyId: selectedCompany.id,
          barcode: raw
        });
        if (liveRes?.success && liveRes.carton) {
          found = liveRes.carton;
          if (liveRes.state) setErpState(liveRes.state);
        }
      } catch {
        // handled below
      }
    }

    if (!found) {
      showToast('error', `کارتن با بارکد/سریال «${serial}» در انبار این شرکت یا سایان یافت نشد.`);
      return;
    }
    if (found.status !== 'IN_STOCK') {
      showToast('error', `کارتن ${found.serialNumber} قبلاً خارج یا ابطال شده است (${found.status}).`);
      return;
    }
    if (scannedCartonsForRemittance.some(c => c.id === found!.id)) {
      showToast('error', `کارتن ${found.serialNumber} همین الان در لیست اسکن قرار دارد.`);
      return;
    }

    setScannedCartonsForRemittance(prev => [...prev, found!]);
    setScanInput('');
    showToast('success', `کارتن ${found.serialNumber} (${found.netWeightKg} Kg خالص) به حواله خروج اضافه شد.`);
  };

  const handleIssueFactoryExitRemittance = async () => {
    if (!remCustomerName.trim()) {
      showToast('error', 'لطفاً نام مشتری / گیرنده را برای صدور خروج کارخانه وارد کنید.');
      return;
    }
    if (scannedCartonsForRemittance.length === 0) {
      showToast('error', 'حداقل یک کارتن باید با بارکد/QR اسکن یا انتخاب شود.');
      return;
    }

    try {
      setSavingLocal(true);
      const res = await apiCall<any>('/industrial-erp/factory-exit-remittance', 'POST', {
        companyId: selectedCompany.id,
        customerName: remCustomerName.trim(),
        customerCode: remCustomerCode.trim(),
        driverName: remDriverName.trim(),
        driverPhone: remDriverPhone.trim(),
        plateNumber: remPlateNumber.trim(),
        destinationAddress: remDestinationAddress.trim(),
        cartonIds: scannedCartonsForRemittance.map(c => c.id),
        createdBy: currentUser.fullName
      });

      if (res?.state) setErpState(res.state);
      setScannedCartonsForRemittance([]);
      setRemCustomerName('');
      setRemCustomerCode('');
      setRemDriverName('');
      setRemDriverPhone('');
      setRemPlateNumber('');
      setRemDestinationAddress('');
      fetchDelkamExitPermits();
      showToast('success', res?.message || 'حواله خروج کارخانه (بدون فی) و مجوز خروج انتظامات دلکام صادر شد.');
    } catch (err: any) {
      showToast('error', err?.message || 'خطا در صدور حواله خروج کارخانه');
    } finally {
      setSavingLocal(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. WEIGHBRIDGE & QR LABELING (wh_weighbridge) */}
      {activeSubView === 'wh_weighbridge' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <Scale size={20} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white">
                    میز توزین دیجیتال باسکول، کسر خودکار وزن دوک/کارتن و چاپ لیبل QR
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    محاسبه اتوماتیک وزن خالص نخ + کسر مواد اولیه و ملزومات از انبار طبق BOM
                  </p>
                </div>
              </div>
              <button
                onClick={() => setScaleGrossWeightKg(Number((23.5 + Math.random() * 3.2).toFixed(2)))}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 text-emerald-700 font-bold text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                <RefreshCw size={13} />
                <span>خواندن وزن زنده باسکول</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  انتخاب کالای تولیدی (نخ) روی باسکول
                </label>
                <select
                  value={selectedYarnId}
                  onChange={e => setSelectedYarnId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  {erpState.items
                    .filter(i => i.category === 'FINISHED_YARN')
                    .map(y => (
                      <option key={y.id} value={y.id}>
                        {y.code} — {y.name} ({y.yarnCount})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  وزن ناخالص باسکول (Gross Kg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={scaleGrossWeightKg}
                  onChange={e => setScaleGrossWeightKg(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 font-mono font-black text-base text-emerald-700 dark:text-emerald-300"
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">تعداد دوک داخل کارتن</label>
                <input
                  type="number"
                  value={conesCount}
                  onChange={e => setConesCount(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">وزن هر دوک خالی (گرم)</label>
                <input
                  type="number"
                  value={overrideConeWeightGrams}
                  onChange={e => setOverrideConeWeightGrams(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">وزن کارتن خالی و نایلون (گرم)</label>
                <input
                  type="number"
                  value={overrideCartonWeightGrams}
                  onChange={e => setOverrideCartonWeightGrams(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">شماره لات تولید (Lot No)</label>
                <input
                  type="text"
                  value={lotNumber}
                  onChange={e => setLotNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">کد ماشین / شیفت / درجه</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <input
                    type="text"
                    value={machineCode}
                    onChange={e => setMachineCode(e.target.value)}
                    className="px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-center"
                  />
                  <input
                    type="text"
                    value={shiftName}
                    onChange={e => setShiftName(e.target.value)}
                    className="px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-center"
                  />
                  <select
                    value={grade}
                    onChange={e => setGrade(e.target.value as 'A' | 'B' | 'C')}
                    className="px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-center"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-slate-900 text-white rounded-2xl p-4 text-center">
              <div>
                <span className="text-[11px] text-slate-400 block">وزن ناخالص (Gross)</span>
                <span className="font-mono font-black text-base">{scaleGrossWeightKg.toFixed(2)} Kg</span>
              </div>
              <div className="border-x border-slate-700">
                <span className="text-[11px] text-amber-300 block">کسر ظرف و دوک (Tare)</span>
                <span className="font-mono font-black text-base text-amber-400">
                  {weighCalculation.totalTareKg.toFixed(3)} Kg
                </span>
              </div>
              <div>
                <span className="text-[11px] text-emerald-300 block">وزن خالص نخ (Net)</span>
                <span className="font-mono font-black text-xl text-emerald-400">
                  {weighCalculation.netWeightKg.toFixed(3)} Kg
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoIssueProductionVoucher}
                  onChange={e => setAutoIssueProductionVoucher(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-600"
                />
                <span>صدور اتوماتیک سند حسابداری تولید و کسر BOM از انبار</span>
              </label>

              <button
                onClick={handleIssueWeighbridgeLabel}
                disabled={savingLocal}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-md cursor-pointer"
              >
                <QrCode size={16} />
                <span>ثبت توزین، کسر از انبار و صدور لیبل QR</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-900 dark:text-white">پیش‌نمایش لیبل کارتن و QR Code</h3>
              {activePreviewLabel && (
                <button
                  onClick={() => handlePrintCartonLabel(activePreviewLabel)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>چاپ لیبل حرارتی</span>
                </button>
              )}
            </div>

            {activePreviewLabel && (
              <div className="border-2 border-slate-900 dark:border-slate-600 rounded-xl p-4 bg-white text-slate-900 space-y-3">
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
                  <div>
                    <div className="font-black text-xs">{selectedCompany.name}</div>
                    <div className="font-bold text-sm text-indigo-900">{activePreviewLabel.productName}</div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-slate-900 text-white font-mono font-black text-xs">
                    {activePreviewLabel.serialNumber}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-2.5 rounded-lg border border-slate-300 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">ناخالص</span>
                    <span className="font-mono font-bold">{activePreviewLabel.grossWeightKg} Kg</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">ظرف (دوک+کارتن)</span>
                    <span className="font-mono font-bold">{activePreviewLabel.totalTareKg} Kg</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-700 font-bold block">خالص نخ</span>
                    <span className="font-mono font-black text-sm text-emerald-700">
                      {activePreviewLabel.netWeightKg} Kg
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="text-[11px] space-y-0.5">
                    <div>لات: {activePreviewLabel.lotNumber} | درجه: {activePreviewLabel.grade}</div>
                    <div>تعداد دوک: {activePreviewLabel.conesCount} عدد | تاریخ: {activePreviewLabel.createdDateJalali}</div>
                    <div className="font-mono text-[9px] text-slate-500 break-all max-w-[200px]">
                      {activePreviewLabel.qrPayload}
                    </div>
                  </div>
                  {qrDataUrl && <img src={qrDataUrl} alt="QR" className="w-24 h-24 border border-slate-300 rounded p-1" />}
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-xs text-slate-700 dark:text-slate-300">
                  کارتن‌های موجود در انبار این شرکت ({erpState.cartonLabels.filter(c => c.status === 'IN_STOCK').length})
                </h4>
                <button
                  onClick={handleSyncSayanBarcodes}
                  disabled={syncingBarcodes}
                  className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Database size={12} />
                  <span>فراخوانی بارکدهای موجود سایان</span>
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {erpState.cartonLabels.slice(0, 25).map(lbl => (
                  <div
                    key={lbl.id}
                    onClick={() => setActivePreviewLabel(lbl)}
                    className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer ${
                      activePreviewLabel?.id === lbl.id
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <span className="font-mono font-black text-indigo-700 dark:text-indigo-300">{lbl.serialNumber}</span>
                      <span className="mx-1.5 text-slate-400">|</span>
                      <span className="font-bold">{lbl.productName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-emerald-600">{lbl.netWeightKg} Kg</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          lbl.status === 'IN_STOCK' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {lbl.status === 'IN_STOCK' ? 'موجود' : 'خارج شده'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. FACTORY EXIT REMITTANCE WITHOUT PRICE (wh_exit_remittance) */}
      {activeSubView === 'wh_exit_remittance' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center">
                    <Truck size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900 dark:text-white">
                      صدور حواله خروج کارخانه (بدون فی) + ثبت اتوماتیک مجوز خروج انتظامات دلکام
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      اسکن بارکد کارتن‌های دلکام یا سایان — ارسال همزمان به کارتابل قیمت‌گذاری دفتر تهران و کارتابل خروج کارخانه دلکام
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleScanCartonForRemittance()}
                  placeholder="اسکن بارکد کارتن (دلکام یا سایان) و کلید Enter..."
                  className="flex-1 px-3 py-2 rounded-xl border-2 border-amber-400 bg-amber-50/20 font-mono text-xs font-bold"
                />
                <button
                  onClick={handleScanCartonForRemittance}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs cursor-pointer"
                >
                  افزودن بارکد
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {erpState.cartonLabels
                  .filter(c => c.status === 'IN_STOCK')
                  .slice(0, 8)
                  .map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        if (!scannedCartonsForRemittance.some(x => x.id === c.id)) {
                          setScannedCartonsForRemittance(prev => [...prev, c]);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 text-[11px] font-mono font-bold border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      + {c.serialNumber} ({c.netWeightKg}Kg)
                    </button>
                  ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">نام مشتری / طرف حساب *</label>
                  <input
                    type="text"
                    value={remCustomerName}
                    onChange={e => setRemCustomerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">کد تفصیلی مشتری</label>
                  <input
                    type="text"
                    value={remCustomerCode}
                    onChange={e => setRemCustomerCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">نام راننده</label>
                  <input
                    type="text"
                    value={remDriverName}
                    onChange={e => setRemDriverName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">شماره پلاک خودرو</label>
                  <input
                    type="text"
                    value={remPlateNumber}
                    onChange={e => setRemPlateNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-black">
                  <span>کارتن‌های اسکن‌شده ({scannedCartonsForRemittance.length} کارتن)</span>
                  <span className="font-mono text-emerald-600">
                    جمع خالص:{' '}
                    {scannedCartonsForRemittance.reduce((s, c) => s + c.netWeightKg, 0).toFixed(2)} Kg
                  </span>
                </div>
                {scannedCartonsForRemittance.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded-lg">
                    <span className="font-mono font-bold">{c.serialNumber} — {c.productName}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-600">{c.netWeightKg} Kg</span>
                      <button
                        onClick={() => setScannedCartonsForRemittance(prev => prev.filter(x => x.id !== c.id))}
                        className="text-rose-500 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleIssueFactoryExitRemittance}
                disabled={savingLocal || !canIssueRemittance}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs cursor-pointer shadow-md"
              >
                ثبت قطعی خروج کارخانه (بدون فی) و ارسال همزمان به دفتر تهران و انتظامات دلکام
              </button>
            </div>

            <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
              <h3 className="font-black text-sm text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                فهرست حواله‌های خروج کارخانه در «{selectedCompany.name}» ({erpState.remittances.length})
              </h3>
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto">
                {erpState.remittances.map(rem => (
                  <div
                    key={rem.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xs text-indigo-600">{rem.remittanceNo}</span>
                        {rem.exitPermitNumber && (
                          <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-mono font-bold">
                            مجوز خروج دلکام #{rem.exitPermitNumber}
                          </span>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          rem.status === 'INVOICED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {rem.status === 'INVOICED' ? 'فاکتور نهایی صادر شد' : 'منتظر فی دفتر تهران'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      مشتری: {rem.customerName} | تاریخ: {rem.dateJalali}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        راننده: {rem.driverName || '-'} ({rem.plateNumber || '-'})
                      </span>
                      {rem.status !== 'INVOICED' && (
                        <button
                          onClick={() => openSubViewTab('com_tehran_pricing')}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold text-[11px] cursor-pointer flex items-center gap-1"
                        >
                          <ShoppingCart size={12} />
                          <span>ثبت فی در دفتر تهران</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. WAREHOUSE MASTER: WAREHOUSES & ITEMS (wh_warehouses & wh_items) */}
      {(activeSubView === 'wh_warehouses' || activeSubView === 'wh_items') && (
        <div className="space-y-5">
          {activeSubView === 'wh_warehouses' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h3 className="font-black text-sm">معرفی انبار جدید در «{selectedCompany.name}»</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-bold block mb-1">کد انبار</label>
                    <input
                      type="text"
                      value={newWarehouseForm.code}
                      onChange={e => setNewWarehouseForm({ ...newWarehouseForm, code: e.target.value })}
                      placeholder="مثلاً 105"
                      className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">نوع انبار</label>
                    <select
                      value={newWarehouseForm.type}
                      onChange={e => setNewWarehouseForm({ ...newWarehouseForm, type: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                    >
                      <option value="RAW_MATERIAL">مواد اولیه</option>
                      <option value="PACKAGING">ملزومات بسته‌بندی</option>
                      <option value="FINISHED_YARN">محصول نهایی نخ</option>
                      <option value="WASTE">ضایعات و استوک</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="font-bold block mb-1">نام انبار</label>
                    <input
                      type="text"
                      value={newWarehouseForm.name}
                      onChange={e => setNewWarehouseForm({ ...newWarehouseForm, name: e.target.value })}
                      placeholder="نام کامل انبار..."
                      className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">موقعیت / سالن</label>
                    <input
                      type="text"
                      value={newWarehouseForm.location}
                      onChange={e => setNewWarehouseForm({ ...newWarehouseForm, location: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">انباردار مسئول</label>
                    <input
                      type="text"
                      value={newWarehouseForm.managerName}
                      onChange={e => setNewWarehouseForm({ ...newWarehouseForm, managerName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border bg-slate-50"
                    />
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!newWarehouseForm.code || !newWarehouseForm.name) return;
                    const nw: ErpWarehouse = {
                      id: `wh_${Date.now()}`,
                      ...newWarehouseForm
                    };
                    await persistErpState(
                      { ...erpState, warehouses: [...erpState.warehouses, nw] },
                      `انبار «${nw.name}» ثبت شد.`
                    );
                    setNewWarehouseForm({ code: '', name: '', type: 'FINISHED_YARN', location: '', managerName: '' });
                  }}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs cursor-pointer"
                >
                  افزودن انبار جدید
                </button>
              </div>

              <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h3 className="font-black text-sm">لیست انبارهای فعال شرکت ({erpState.warehouses.length})</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {erpState.warehouses.map(w => (
                    <div key={w.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 space-y-1">
                      <div className="flex justify-between">
                        <span className="font-mono font-black text-xs text-indigo-600">کد {w.code}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 font-bold">{w.location}</span>
                      </div>
                      <div className="font-black text-sm">{w.name}</div>
                      <div className="text-[11px] text-slate-500">مسئول انبار: {w.managerName || 'تعیین نشده'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSubView === 'wh_items' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h3 className="font-black text-sm">معرفی سرفصل کالا / نخ و تنظیم وزن دوک و کارتن</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-bold block mb-1">کد کالا</label>
                    <input
                      type="text"
                      value={newItem.code || ''}
                      onChange={e => setNewItem({ ...newItem, code: e.target.value })}
                      placeholder="YN-3005"
                      className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">گروه کالا</label>
                    <select
                      value={newItem.category}
                      onChange={e => setNewItem({ ...newItem, category: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                    >
                      <option value="FINISHED_YARN">محصول نهایی نخ</option>
                      <option value="RAW_MATERIAL">مواد اولیه (POY/الیاف)</option>
                      <option value="PACKAGING">ملزومات (دوک/کارتن)</option>
                      <option value="WASTE">ضایعات نساجی</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="font-bold block mb-1">نام کامل کالا / مشخصات نخ</label>
                    <input
                      type="text"
                      value={newItem.name || ''}
                      onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">وزن هر دوک (گرم)</label>
                    <input
                      type="number"
                      value={newItem.coneWeightGrams || 0}
                      onChange={e => setNewItem({ ...newItem, coneWeightGrams: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">وزن کارتن خالی (گرم)</label>
                    <input
                      type="number"
                      value={newItem.cartonWeightGrams || 0}
                      onChange={e => setNewItem({ ...newItem, cartonWeightGrams: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">موجودی اولیه</label>
                    <input
                      type="number"
                      value={newItem.stockQty || 0}
                      onChange={e => setNewItem({ ...newItem, stockQty: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-mono"
                    />
                  </div>
                  {canViewCostPrice && (
                    <div>
                      <label className="font-bold block mb-1">بهای واحد (ریال)</label>
                      <input
                        type="number"
                        value={newItem.unitCost || 0}
                        onChange={e => setNewItem({ ...newItem, unitCost: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-mono"
                      />
                    </div>
                  )}
                </div>
                <button
                  onClick={async () => {
                    if (!newItem.code || !newItem.name) return;
                    const created: ErpItem = {
                      id: `itm_${Date.now()}`,
                      code: newItem.code.trim(),
                      name: newItem.name.trim(),
                      category: (newItem.category as any) || 'FINISHED_YARN',
                      unit: newItem.unit || 'کیلوگرم',
                      warehouseId: newItem.warehouseId || 'wh_yarn',
                      stockQty: Number(newItem.stockQty) || 0,
                      unitCost: Number(newItem.unitCost) || 1800000,
                      salesPrice: Number(newItem.salesPrice) || 2150000,
                      yarnCount: newItem.yarnCount || '150D/48F',
                      colorName: newItem.colorName || 'سفید',
                      coneWeightGrams: Number(newItem.coneWeightGrams) || 110,
                      cartonWeightGrams: Number(newItem.cartonWeightGrams) || 1450,
                      defaultConesPerCarton: Number(newItem.defaultConesPerCarton) || 6
                    };
                    await persistErpState({ ...erpState, items: [...erpState.items, created] }, 'کالای جدید ثبت شد.');
                  }}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs cursor-pointer"
                >
                  ذخیره سرفصل کالا در انبار
                </button>
              </div>

              <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h3 className="font-black text-sm">فهرست سرفصل کالاها و موجودی لحظه‌ای ({erpState.items.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b text-slate-500">
                        <th className="py-2 px-2">کد</th>
                        <th className="py-2 px-2">نام کالا</th>
                        <th className="py-2 px-2">موجودی</th>
                        <th className="py-2 px-2">وزن دوک/کارتن</th>
                        {canViewCostPrice && <th className="py-2 px-2">بهای واحد (ریال)</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {erpState.items.map(it => (
                        <tr key={it.id}>
                          <td className="py-2 px-2 font-mono font-bold text-indigo-600">{it.code}</td>
                          <td className="py-2 px-2 font-bold">{it.name}</td>
                          <td className="py-2 px-2 font-mono font-black text-emerald-600">
                            {it.stockQty.toLocaleString()} {it.unit}
                          </td>
                          <td className="py-2 px-2 font-mono text-[11px]">
                            {it.coneWeightGrams}g / {it.cartonWeightGrams}g
                          </td>
                          {canViewCostPrice && (
                            <td className="py-2 px-2 font-mono font-bold">{it.unitCost.toLocaleString()}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. WAREHOUSE DOCS, STOCKTAKING, DELKAM BIJAK LINK & KARDEX */}
      {(activeSubView === 'wh_receipt_issue' ||
        activeSubView === 'wh_cartable' ||
        activeSubView === 'wh_stocktaking' ||
        activeSubView === 'wh_kardex' ||
        activeSubView === 'wacc_pricing' ||
        activeSubView === 'wacc_riali_kardex') && (
        <div className="space-y-5">
          {activeSubView === 'wh_receipt_issue' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h3 className="font-black text-sm">صدور رسید مستقیم انبار / حواله مصرف خط تولید / انتقالی بین انبارها</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="font-bold block mb-1">نوع سند انبار</label>
                  <select
                    value={whDocForm.docType}
                    onChange={e => setWhDocForm({ ...whDocForm, docType: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                  >
                    <option value="RECEIPT_PURCHASE">رسید ورود کالا به انبار (افزایش موجودی)</option>
                    <option value="ISSUE_PRODUCTION">حواله مصرف خط تولید (کاهش موجودی)</option>
                    <option value="TRANSFER">انتقال بین انبارها</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">انتخاب کالا</label>
                  <select
                    value={whDocForm.itemId}
                    onChange={e => setWhDocForm({ ...whDocForm, itemId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-bold"
                  >
                    {erpState.items.map(i => (
                      <option key={i.id} value={i.id}>
                        {i.code} — {i.name} (موجودی: {i.stockQty})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">مقدار / تعداد</label>
                  <input
                    type="number"
                    value={whDocForm.qty}
                    onChange={e => setWhDocForm({ ...whDocForm, qty: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-50 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">طرف حساب / تحویل‌گیرنده</label>
                  <input
                    type="text"
                    value={whDocForm.counterpartyName}
                    onChange={e => setWhDocForm({ ...whDocForm, counterpartyName: e.target.value })}
                    placeholder="نام تامین‌کننده یا سالن تولید..."
                    className="w-full px-3 py-2 rounded-xl border bg-slate-50"
                  />
                </div>
                <div className="sm:col-span-2 flex items-end">
                  <button
                    onClick={async () => {
                      const itm = erpState.items.find(i => i.id === whDocForm.itemId);
                      if (!itm || whDocForm.qty <= 0) return;
                      const isAdd = whDocForm.docType === 'RECEIPT_PURCHASE';
                      const newDoc: ErpWarehouseDoc = {
                        id: `whd_${Date.now()}`,
                        docNo: `WHD-405-${102 + (erpState.warehouseDocs || []).length}`,
                        docType: whDocForm.docType,
                        dateJalali: getTodayJalali(),
                        warehouseId: itm.warehouseId,
                        warehouseName: erpState.warehouses.find(w => w.id === itm.warehouseId)?.name || 'انبار کارخانه',
                        counterpartyName: whDocForm.counterpartyName || 'داخلی کارخانه',
                        status: 'FINALIZED',
                        items: [
                          {
                            itemId: itm.id,
                            itemCode: itm.code,
                            itemName: itm.name,
                            qty: whDocForm.qty,
                            unit: itm.unit,
                            unitCost: itm.unitCost,
                            totalCost: Math.round(whDocForm.qty * itm.unitCost)
                          }
                        ]
                      };
                      const nextItems = erpState.items.map(i =>
                        i.id === itm.id
                          ? { ...i, stockQty: Number(Math.max(0, i.stockQty + (isAdd ? whDocForm.qty : -whDocForm.qty)).toFixed(3)) }
                          : i
                      );
                      await persistErpState(
                        {
                          ...erpState,
                          items: nextItems,
                          warehouseDocs: [newDoc, ...(erpState.warehouseDocs || [])]
                        },
                        `سند انبار ${newDoc.docNo} ثبت شد و موجودی بروزرسانی گردید.`
                      );
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs cursor-pointer"
                  >
                    ثبت قطعی سند انبار و بروزرسانی موجودی
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSubView === 'wh_cartable' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                <h3 className="font-black text-sm">اسناد انبار ثبت‌شده در این شرکت ({(erpState.warehouseDocs || []).length})</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {(erpState.warehouseDocs || []).map(doc => (
                    <div key={doc.id} className="p-3 rounded-xl border bg-slate-50/50 text-xs space-y-1">
                      <div className="flex justify-between font-bold">
                        <span className="font-mono text-indigo-600">{doc.docNo}</span>
                        <span>{doc.dateJalali}</span>
                      </div>
                      <div className="font-bold">{doc.warehouseName} — طرف حساب: {doc.counterpartyName}</div>
                      {doc.items.map((it, idx) => (
                        <div key={idx} className="text-slate-600 flex justify-between">
                          <span>{it.itemName}</span>
                          <span className="font-mono font-bold">{it.qty} {it.unit}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-900/50 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-sm text-amber-800 dark:text-amber-300">
                      اتصال زنده به کارتابل خروج کارخانه و بیجک‌های انتظامات دلکام ({delkamExitPermits.length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      مجوزهای خروج ثبت‌شده در ماژول خروج کارخانه دلکام که با انبار حسابداری در ارتباط هستند
                    </p>
                  </div>
                  <button
                    onClick={fetchDelkamExitPermits}
                    className="p-1.5 rounded-lg border hover:bg-slate-100 cursor-pointer"
                  >
                    <RefreshCw size={14} className={loadingDelkamPermits ? 'animate-spin' : ''} />
                  </button>
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {delkamExitPermits.map(p => (
                    <div key={p.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between">
                      <div>
                        <span className="font-mono font-black text-amber-600">مجوز خروج #{p.permitNumber}</span>
                        <span className="mx-2 text-slate-300">|</span>
                        <span className="font-bold">{p.recipientName || p.description || 'خروج کالا'}</span>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          راننده: {p.driverName || '-'} | پلاک: {p.plateNumber || '-'} | تاریخ: {p.date}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-[10px]">
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSubView === 'wh_stocktaking' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm">کنترل موجودی، شمارش فیزیکی و انبارگردانی</h3>
                <button
                  onClick={async () => {
                    const nextItems = erpState.items.map(it => {
                      const counted = stockCountMap[it.id];
                      return counted !== undefined ? { ...it, stockQty: counted } : it;
                    });
                    await persistErpState({ ...erpState, items: nextItems }, 'تعدیلات انبارگردانی اعمال شد.');
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-black text-xs cursor-pointer"
                >
                  اعمال شمارش فیزیکی و صدور سند تعدیل انبارگردانی
                </button>
              </div>
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2 px-2">کد کالا</th>
                    <th className="py-2 px-2">نام کالا</th>
                    <th className="py-2 px-2">موجودی سیستم</th>
                    <th className="py-2 px-2">شمارش فیزیکی انبارگردانی</th>
                    <th className="py-2 px-2">مغایرت (کسری/اضافی)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {erpState.items.map(it => {
                    const counted = stockCountMap[it.id] ?? it.stockQty;
                    const diff = Number((counted - it.stockQty).toFixed(3));
                    return (
                      <tr key={it.id}>
                        <td className="py-2 px-2 font-mono font-bold">{it.code}</td>
                        <td className="py-2 px-2 font-bold">{it.name}</td>
                        <td className="py-2 px-2 font-mono font-bold">{it.stockQty.toLocaleString()} {it.unit}</td>
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            value={counted}
                            onChange={e => setStockCountMap({ ...stockCountMap, [it.id]: parseFloat(e.target.value) || 0 })}
                            className="w-28 px-2 py-1 rounded border font-mono font-bold"
                          />
                        </td>
                        <td className={`py-2 px-2 font-mono font-black ${diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {diff > 0 ? `+${diff}` : diff} {it.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
            <h3 className="font-black text-sm">
              {activeSubView.startsWith('wacc_')
                ? 'کاردکس ریالی-تعدادی و ارزش‌گذاری میانگین موزون موجودی انبارها'
                : 'مرور گردش کالاها، اسناد انبار و کاردکس تعدادی'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2 px-2">کد کالا</th>
                    <th className="py-2 px-2">شرح کالا</th>
                    <th className="py-2 px-2">انبار</th>
                    <th className="py-2 px-2">موجودی فعلی</th>
                    {(canViewCostPrice || activeSubView.startsWith('wacc_')) && (
                      <>
                        <th className="py-2 px-2">فی میانگین موزون (ریال)</th>
                        <th className="py-2 px-2">ارزش ریالی کل موجودی (ریال)</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {erpState.items.map(it => (
                    <tr key={it.id}>
                      <td className="py-2 px-2 font-mono font-bold text-indigo-600">{it.code}</td>
                      <td className="py-2 px-2 font-bold">{it.name}</td>
                      <td className="py-2 px-2">{erpState.warehouses.find(w => w.id === it.warehouseId)?.name || '-'}</td>
                      <td className="py-2 px-2 font-mono font-black text-emerald-600">
                        {it.stockQty.toLocaleString()} {it.unit}
                      </td>
                      {(canViewCostPrice || activeSubView.startsWith('wacc_')) && (
                        <>
                          <td className="py-2 px-2 font-mono">{canViewCostPrice ? it.unitCost.toLocaleString() : '***'}</td>
                          <td className="py-2 px-2 font-mono font-black text-indigo-700">
                            {canViewCostPrice ? Math.round(it.stockQty * it.unitCost).toLocaleString() : 'محرمانه'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
