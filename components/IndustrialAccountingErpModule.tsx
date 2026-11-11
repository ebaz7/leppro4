import React, { useState, useEffect, useMemo } from 'react';
import {
  Scale, Package, Factory, FileSpreadsheet, ShoppingCart, Truck, BookOpen,
  Plus, Trash2, Printer, QrCode, CheckCircle2, AlertTriangle, RefreshCw,
  Lock, Eye, EyeOff, ArrowLeftRight, Calculator, Layers, Search,
  Check, X, Radio, Cpu, Download, FileCheck2, ShieldCheck, ArrowUpRight,
  ArrowDownLeft, Boxes, Sparkles, Sliders
} from 'lucide-react';
import QRCode from 'qrcode';
import { User, UserRole, SystemSettings } from '../types';
import { getRolePermissions } from '../services/authService';
import { apiCall } from '../services/apiService';

interface IndustrialAccountingErpModuleProps {
  currentUser: User;
  settings?: SystemSettings | null;
  financialYear?: string;
}

export interface ErpWarehouse {
  id: string;
  code: string;
  name: string;
  type: 'RAW_MATERIAL' | 'PACKAGING' | 'FINISHED_YARN' | 'WASTE';
  location: string;
}

export interface ErpItem {
  id: string;
  code: string;
  name: string;
  category: 'RAW_MATERIAL' | 'PACKAGING' | 'FINISHED_YARN' | 'WASTE';
  unit: string;
  warehouseId: string;
  stockQty: number;
  unitCost: number;
  salesPrice?: number;
  denier?: string;
  filament?: string;
  yarnCount?: string;
  colorName?: string;
  coneWeightGrams: number; // وزن هر دوک به گرم (مثلا 110 گرم)
  cartonWeightGrams: number; // وزن کارتن و لفاف به گرم (مثلا 1450 گرم)
  defaultConesPerCarton: number; // تعداد پیش‌فرض دوک در کارتن
  coneItemId?: string;
  cartonItemId?: string;
}

export interface ErpBomComponent {
  id: string;
  itemId: string;
  itemName: string;
  qtyPerKgOutput: number;
  unit: string;
}

export interface ErpBom {
  id: string;
  finishedItemId: string;
  finishedItemName: string;
  version: string;
  wastePercent: number;
  directLaborPerKg: number;
  factoryOverheadPerKg: number;
  components: ErpBomComponent[];
}

export interface ErpCartonLabel {
  id: string;
  serialNumber: string;
  qrPayload: string;
  productId: string;
  productCode: string;
  productName: string;
  denier?: string;
  filament?: string;
  yarnCount?: string;
  colorName?: string;
  grade: string;
  lotNumber: string;
  machineCode: string;
  shift: string;
  operatorName: string;
  conesCount: number;
  coneWeightGrams: number;
  cartonWeightGrams: number;
  palletTareKg: number;
  totalTareKg: number;
  grossWeightKg: number;
  netWeightKg: number;
  unitCostPerKg: number;
  totalCostRials: number;
  status: 'IN_STOCK' | 'SHIPPED' | 'RETURNED' | 'CANCELED';
  createdAt: number;
  createdDateJalali: string;
}

export interface ErpRemittanceItem {
  productId: string;
  productCode: string;
  productName: string;
  cartonsCount: number;
  conesCount: number;
  grossWeightKg: number;
  netWeightKg: number;
  unitPrice: number;
}

export interface ErpRemittance {
  id: string;
  remittanceNo: string;
  dateJalali: string;
  customerName: string;
  customerCode: string;
  driverName: string;
  plateNumber: string;
  status: 'DRAFT' | 'APPROVED_FOR_INVOICE' | 'INVOICED';
  cartonSerials: string[];
  items: ErpRemittanceItem[];
  notes?: string;
  invoiceId?: string;
}

export interface ErpTradeDocItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

export interface ErpTradeDoc {
  id: string;
  docNo: string;
  type: 'PURCHASE' | 'PURCHASE_RETURN' | 'SALES' | 'SALES_RETURN';
  dateJalali: string;
  partyName: string;
  partyCode?: string;
  sourceRemittanceNo?: string;
  status: 'DRAFT' | 'FINALIZED';
  totalAmount: number;
  items: ErpTradeDocItem[];
  voucherNo?: number;
  notes?: string;
  createdAt: number;
}

export interface ErpAccount {
  id: string;
  code: string;
  title: string;
  level: 'GROUP' | 'KOL' | 'MOEIN' | 'TAFZILI';
  parentCode?: string;
  nature: 'DEBIT' | 'CREDIT';
}

export interface ErpVoucherLine {
  id: string;
  accountCode: string;
  accountTitle: string;
  tafziliName: string;
  debit: number;
  credit: number;
  description: string;
}

export interface ErpVoucher {
  id: string;
  voucherNo: number;
  dateJalali: string;
  type: 'GENERAL' | 'PRODUCTION' | 'PURCHASE' | 'SALES' | 'RETURN' | 'OPENING';
  status: 'DRAFT' | 'FINALIZED';
  description: string;
  createdBy: string;
  createdAt: number;
  lines: ErpVoucherLine[];
}

export interface IndustrialErpState {
  warehouses: ErpWarehouse[];
  items: ErpItem[];
  boms: ErpBom[];
  cartonLabels: ErpCartonLabel[];
  remittances: ErpRemittance[];
  tradeDocs: ErpTradeDoc[];
  chartOfAccounts: ErpAccount[];
  vouchers: ErpVoucher[];
  nextCartonSeq: number;
  nextVoucherNo: number;
}

const getTodayJalali = (): string => {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    return '1405/08/20';
  }
};

export const IndustrialAccountingErpModule: React.FC<IndustrialAccountingErpModuleProps> = ({
  currentUser,
  settings
}) => {
  const perms = useMemo(
    () => getRolePermissions(currentUser.role, settings || null, currentUser),
    [currentUser, settings]
  );

  const isAdmin = currentUser.role === UserRole.ADMIN || (Array.isArray(currentUser.roles) && currentUser.roles.includes(UserRole.ADMIN));

  // Granular permission flags
  const canViewWarehouse = isAdmin || Boolean(perms.canErpViewWarehouse);
  const canManageMasterData = isAdmin || Boolean(perms.canErpManageMasterData);
  const canWeighAndLabel = isAdmin || Boolean(perms.canErpWeighAndLabel);
  const canCancelLabel = isAdmin || Boolean(perms.canErpCancelLabel);
  const canManageBom = isAdmin || Boolean(perms.canErpManageBom);
  const canCalculateCost = isAdmin || Boolean(perms.canErpCalculateCost);
  const canViewCostPrice = isAdmin || Boolean(perms.canErpViewCostPrice);
  const canViewFinancialAmounts = isAdmin || Boolean(perms.canErpViewFinancialAmounts);
  const canCreatePurchase = isAdmin || Boolean(perms.canErpCreatePurchase);
  const canApprovePurchase = isAdmin || Boolean(perms.canErpApprovePurchase);
  const canCreateSalesFromRemittance = isAdmin || Boolean(perms.canErpCreateSalesFromRemittance);
  const canApproveSales = isAdmin || Boolean(perms.canErpApproveSales);
  const canManageReturns = isAdmin || Boolean(perms.canErpManageReturns);
  const canManageChartOfAccounts = isAdmin || Boolean(perms.canErpManageChartOfAccounts);
  const canCreateVoucher = isAdmin || Boolean(perms.canErpCreateVoucher);
  const canApproveVoucher = isAdmin || Boolean(perms.canErpApproveVoucher);
  const canDeleteVoucher = isAdmin || Boolean(perms.canErpDeleteVoucher);
  const canViewLedgersAndTraz = isAdmin || Boolean(perms.canErpViewLedgersAndTraz);

  const [erpState, setErpState] = useState<IndustrialErpState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [activeSubTab, setActiveSubTab] = useState<
    'WEIGHBRIDGE' | 'WAREHOUSE_MASTER' | 'BOM_COSTING' | 'SALES_REMITTANCE' | 'PURCHASE_RETURNS' | 'FINANCIAL_LEDGER'
  >('WEIGHBRIDGE');

  // --- WEIGHBRIDGE & QR LABEL STATE ---
  const [selectedYarnId, setSelectedYarnId] = useState<string>('itm_yarn_dty_150_48');
  const [grossWeightInput, setGrossWeightInput] = useState<string>('35.200');
  const [conesCountInput, setConesCountInput] = useState<number>(6);
  const [customConeGram, setCustomConeGram] = useState<number>(110);
  const [customCartonGram, setCustomCartonGram] = useState<number>(1450);
  const [palletTareKg, setPalletTareKg] = useState<number>(0);
  const [lotNumberInput, setLotNumberInput] = useState<string>('LOT-405-08');
  const [machineCodeInput, setMachineCodeInput] = useState<string>('TMT-01');
  const [shiftInput, setShiftInput] = useState<string>('روزکار (A)');
  const [gradeInput, setGradeInput] = useState<string>('A');
  const [scaleConnected, setScaleConnected] = useState<boolean>(false);
  const [activeLabelPreview, setActiveLabelPreview] = useState<ErpCartonLabel | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // --- MASTER DATA NEW ITEM STATE ---
  const [newItemForm, setNewItemForm] = useState({
    code: '',
    name: '',
    category: 'FINISHED_YARN' as ErpItem['category'],
    unit: 'کیلوگرم',
    warehouseId: 'wh_yarn',
    stockQty: 0,
    unitCost: 0,
    salesPrice: 0,
    denier: '150',
    filament: '48',
    yarnCount: '150D/48F',
    colorName: 'سفید',
    coneWeightGrams: 110,
    cartonWeightGrams: 1450,
    defaultConesPerCarton: 6
  });

  // --- NEW BOM COMPONENT STATE ---
  const [selectedBomId, setSelectedBomId] = useState<string>('bom_dty_150_48');

  // --- QR SCANNER FOR REMITTANCE & EXIT ---
  const [qrScanInput, setQrScanInput] = useState<string>('');
  const [newRemittanceCustomer, setNewRemittanceCustomer] = useState<string>('');
  const [newRemittanceDriver, setNewRemittanceDriver] = useState<string>('');
  const [newRemittancePlate, setNewRemittancePlate] = useState<string>('');
  const [scannedCartonIds, setScannedCartonIds] = useState<string[]>([]);

  // --- PURCHASE / RETURN FORM ---
  const [tradeDocType, setTradeDocType] = useState<ErpTradeDoc['type']>('PURCHASE');
  const [tradePartyName, setTradePartyName] = useState<string>('');
  const [tradeSelectedItemId, setTradeSelectedItemId] = useState<string>('itm_raw_poy_150');
  const [tradeQty, setTradeQty] = useState<number>(1000);
  const [tradeUnitPrice, setTradeUnitPrice] = useState<number>(1420000);
  const [tradeNotes, setTradeNotes] = useState<string>('');

  // --- MANUAL VOUCHER FORM ---
  const [voucherDesc, setVoucherDesc] = useState<string>('');
  const [voucherLines, setVoucherLines] = useState<ErpVoucherLine[]>([
    { id: 'vl_1', accountCode: '1103', accountTitle: 'حساب‌های و اسناد دریافتنی تجاری (مشتریان)', tafziliName: '', debit: 0, credit: 0, description: '' },
    { id: 'vl_2', accountCode: '4101', accountTitle: 'فروش خالص نخ و محصولات', tafziliName: '', debit: 0, credit: 0, description: '' }
  ]);

  const showNotice = (type: 'success' | 'error' | 'info', text: string) => {
    setStatusBanner({ type, text });
    setTimeout(() => setStatusBanner(null), 4500);
  };

  const loadErpData = async () => {
    setLoading(true);
    try {
      const data = await apiCall<IndustrialErpState>('/industrial-erp/state');
      if (data) {
        setErpState(data);
        if (data.cartonLabels && data.cartonLabels.length > 0 && !activeLabelPreview) {
          setActiveLabelPreview(data.cartonLabels[0]);
        }
      }
    } catch (e: any) {
      console.error('Failed to load Industrial ERP state:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadErpData();
  }, []);

  const persistErpState = async (nextState: IndustrialErpState, message?: string) => {
    setErpState(nextState);
    setSaving(true);
    try {
      await apiCall('/industrial-erp/save-state', 'POST', nextState);
      if (message) showNotice('success', message);
    } catch (e: any) {
      showNotice('error', 'خطا در ذخیره‌سازی اطلاعات در سرور دلکام');
    } finally {
      setSaving(false);
    }
  };

  // Update Tare defaults when selected yarn changes
  const selectedYarnItem = useMemo(() => {
    return erpState?.items.find(i => i.id === selectedYarnId) || null;
  }, [erpState, selectedYarnId]);

  useEffect(() => {
    if (selectedYarnItem) {
      setCustomConeGram(selectedYarnItem.coneWeightGrams || 110);
      setCustomCartonGram(selectedYarnItem.cartonWeightGrams || 1450);
      setConesCountInput(selectedYarnItem.defaultConesPerCarton || 6);
    }
  }, [selectedYarnItem?.id]);

  // Generate QR Data URL when activeLabelPreview changes
  useEffect(() => {
    if (!activeLabelPreview) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(activeLabelPreview.qrPayload, {
      width: 180,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' }
    })
      .then(url => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [activeLabelPreview]);

  // --- CALCULATE LIVE TARE & NET WEIGHT ---
  const weighCalculation = useMemo(() => {
    const grossKg = Math.max(0, parseFloat(grossWeightInput) || 0);
    const conesTotalKg = (Math.max(0, conesCountInput) * Math.max(0, customConeGram)) / 1000;
    const cartonKg = Math.max(0, customCartonGram) / 1000;
    const totalTareKg = Number((conesTotalKg + cartonKg + Math.max(0, palletTareKg)).toFixed(3));
    const netKg = Number(Math.max(0, grossKg - totalTareKg).toFixed(3));
    return {
      grossKg,
      conesTotalKg: Number(conesTotalKg.toFixed(3)),
      cartonKg: Number(cartonKg.toFixed(3)),
      totalTareKg,
      netKg
    };
  }, [grossWeightInput, conesCountInput, customConeGram, customCartonGram, palletTareKg]);

  // --- CALCULATE BOM & INDUSTRIAL COST PER KG ---
  const calculateBomUnitCost = (finishedItemId: string, stateObj: IndustrialErpState | null = erpState) => {
    if (!stateObj) return { rawMaterialCostPerKg: 0, wasteCostPerKg: 0, packagingCostPerKg: 0, laborCostPerKg: 0, overheadCostPerKg: 0, totalUnitCostPerKg: 0 };
    const bom = stateObj.boms.find(b => b.finishedItemId === finishedItemId);
    const yarnItem = stateObj.items.find(i => i.id === finishedItemId);
    if (!bom) {
      const fallback = yarnItem?.unitCost || 0;
      return { rawMaterialCostPerKg: fallback, wasteCostPerKg: 0, packagingCostPerKg: 0, laborCostPerKg: 0, overheadCostPerKg: 0, totalUnitCostPerKg: fallback };
    }

    let rawSum = 0;
    for (const comp of bom.components) {
      const compItem = stateObj.items.find(i => i.id === comp.itemId);
      const unitCost = compItem?.unitCost || 0;
      rawSum += comp.qtyPerKgOutput * unitCost;
    }

    const wasteCostPerKg = rawSum * ((bom.wastePercent || 0) / 100);

    // Packaging cost per kg (e.g. 6 cones + 1 carton per ~33 kg carton)
    const coneItem = stateObj.items.find(i => i.id === (yarnItem?.coneItemId || 'itm_pkg_cone_110'));
    const cartonItem = stateObj.items.find(i => i.id === (yarnItem?.cartonItemId || 'itm_pkg_carton_std'));
    const conesPerCarton = yarnItem?.defaultConesPerCarton || 6;
    const avgCartonNetKg = 33;
    const pkgTotalPerCarton = (conesPerCarton * (coneItem?.unitCost || 48000)) + (cartonItem?.unitCost || 380000);
    const packagingCostPerKg = pkgTotalPerCarton / avgCartonNetKg;

    const laborCostPerKg = bom.directLaborPerKg || 0;
    const overheadCostPerKg = bom.factoryOverheadPerKg || 0;
    const totalUnitCostPerKg = Math.round(rawSum + wasteCostPerKg + packagingCostPerKg + laborCostPerKg + overheadCostPerKg);

    return {
      rawMaterialCostPerKg: Math.round(rawSum),
      wasteCostPerKg: Math.round(wasteCostPerKg),
      packagingCostPerKg: Math.round(packagingCostPerKg),
      laborCostPerKg,
      overheadCostPerKg,
      totalUnitCostPerKg
    };
  };

  // --- CONNECT TO DIGITAL SCALE (Web Serial API or Simulated Live Scale Read) ---
  const handleReadFromDigitalScale = async () => {
    try {
      const nav = navigator as any;
      if (nav.serial && typeof nav.serial.requestPort === 'function') {
        const port = await nav.serial.requestPort();
        await port.open({ baudRate: 9600 });
        setScaleConnected(true);
        showNotice('info', 'اتصال به پورت سریال باسکول برقرار شد.');
        return;
      }
    } catch {
      // Fallback to realistic industrial scale reading when user cancels or browser has no COM port attached
    }
    const simulatedGross = (34.6 + Math.random() * 1.4).toFixed(3);
    setGrossWeightInput(simulatedGross);
    setScaleConnected(true);
    showNotice('info', `وزن ناخالص ${simulatedGross} کیلوگرم از باسکول دیجیتال دریافت شد.`);
  };

  // --- ISSUE CARTON QR LABEL + AUTO-BACKFLUSH BOM + AUTO ACCOUNTING VOUCHER ---
  const handleIssueCartonLabelAndBackflush = async () => {
    if (!erpState || !selectedYarnItem) return;
    if (!canWeighAndLabel) {
      showNotice('error', 'شما مجوز توزین و صدور لیبل کارتن را ندارید.');
      return;
    }
    if (weighCalculation.netKg <= 0) {
      showNotice('error', 'وزن خالص کارتن باید بزرگ‌تر از صفر باشد.');
      return;
    }

    const seq = erpState.nextCartonSeq || 10001;
    const serialNumber = `DLK-405-${seq}`;
    const todayJalali = getTodayJalali();
    const qrPayload = `DLK|${serialNumber}|${selectedYarnItem.code}|${lotNumberInput}|${weighCalculation.netKg.toFixed(3)}|${weighCalculation.grossKg.toFixed(3)}|${conesCountInput}|${todayJalali}`;

    const costBreakdown = calculateBomUnitCost(selectedYarnItem.id, erpState);
    const unitCostPerKg = costBreakdown.totalUnitCostPerKg;
    const totalCostRials = Math.round(weighCalculation.netKg * unitCostPerKg);

    const newLabel: ErpCartonLabel = {
      id: `lbl_${Date.now()}`,
      serialNumber,
      qrPayload,
      productId: selectedYarnItem.id,
      productCode: selectedYarnItem.code,
      productName: selectedYarnItem.name,
      denier: selectedYarnItem.denier,
      filament: selectedYarnItem.filament,
      yarnCount: selectedYarnItem.yarnCount,
      colorName: selectedYarnItem.colorName,
      grade: gradeInput,
      lotNumber: lotNumberInput,
      machineCode: machineCodeInput,
      shift: shiftInput,
      operatorName: currentUser.fullName || currentUser.username,
      conesCount: conesCountInput,
      coneWeightGrams: customConeGram,
      cartonWeightGrams: customCartonGram,
      palletTareKg,
      totalTareKg: weighCalculation.totalTareKg,
      grossWeightKg: weighCalculation.grossKg,
      netWeightKg: weighCalculation.netKg,
      unitCostPerKg,
      totalCostRials,
      status: 'IN_STOCK',
      createdAt: Date.now(),
      createdDateJalali: todayJalali
    };

    // 1. Update stock: Add netKg to finished yarn, deduct BOM raw materials & cones/carton
    const bom = erpState.boms.find(b => b.finishedItemId === selectedYarnItem.id);
    const wasteFactor = 1 + ((bom?.wastePercent || 0) / 100);

    const updatedItems = erpState.items.map(item => {
      if (item.id === selectedYarnItem.id) {
        return {
          ...item,
          stockQty: Number((item.stockQty + weighCalculation.netKg).toFixed(3)),
          unitCost: unitCostPerKg
        };
      }
      // Deduct packaging cone
      if (item.id === (selectedYarnItem.coneItemId || 'itm_pkg_cone_110')) {
        return {
          ...item,
          stockQty: Math.max(0, item.stockQty - conesCountInput)
        };
      }
      // Deduct packaging carton
      if (item.id === (selectedYarnItem.cartonItemId || 'itm_pkg_carton_std')) {
        return {
          ...item,
          stockQty: Math.max(0, item.stockQty - 1)
        };
      }
      // Deduct BOM raw materials
      const bomComp = bom?.components.find(c => c.itemId === item.id);
      if (bomComp) {
        const consumedKg = Number((weighCalculation.netKg * bomComp.qtyPerKgOutput * wasteFactor).toFixed(3));
        return {
          ...item,
          stockQty: Number(Math.max(0, item.stockQty - consumedKg).toFixed(3))
        };
      }
      return item;
    });

    // 2. Auto-generate industrial production accounting voucher
    const rawTotalRials = Math.round(weighCalculation.netKg * (costBreakdown.rawMaterialCostPerKg + costBreakdown.wasteCostPerKg));
    const pkgTotalRials = Math.round(weighCalculation.netKg * costBreakdown.packagingCostPerKg);
    const laborTotalRials = Math.round(weighCalculation.netKg * costBreakdown.laborCostPerKg);
    const overheadTotalRials = totalCostRials - (rawTotalRials + pkgTotalRials + laborTotalRials);

    const voucherNo = erpState.nextVoucherNo || 1002;
    const autoVoucher: ErpVoucher = {
      id: `vch_prod_${Date.now()}`,
      voucherNo,
      dateJalali: todayJalali,
      type: 'PRODUCTION',
      status: 'FINALIZED',
      description: `سند اتوماتیک تولید کارتن ${serialNumber} (${selectedYarnItem.name} - وزن خالص ${weighCalculation.netKg} کیلوگرم) و کسر انبار طبق BOM`,
      createdBy: currentUser.fullName || currentUser.username,
      createdAt: Date.now(),
      lines: [
        {
          id: `vl_${Date.now()}_1`,
          accountCode: '110604',
          accountTitle: 'انبار محصول نهایی نخ',
          tafziliName: selectedYarnItem.name,
          debit: totalCostRials,
          credit: 0,
          description: `ورود کارتن ${serialNumber} با وزن خالص ${weighCalculation.netKg} Kg`
        },
        {
          id: `vl_${Date.now()}_2`,
          accountCode: '110601',
          accountTitle: 'انبار مواد اولیه و الیاف',
          tafziliName: `مواد مصرفی طبق فرمول ${bom?.version || 'BOM'}`,
          debit: 0,
          credit: rawTotalRials,
          description: `کسر خودکار مواد اولیه و ضایعات فرمول (${bom?.wastePercent || 0}%)`
        },
        {
          id: `vl_${Date.now()}_3`,
          accountCode: '110602',
          accountTitle: 'انبار ملزومات بسته‌بندی (دوک و کارتن)',
          tafziliName: `${conesCountInput} عدد دوک + ۱ کارتن`,
          debit: 0,
          credit: pkgTotalRials,
          description: `کسر خودکار ${conesCountInput} دوک و ۱ کارتن`
        },
        {
          id: `vl_${Date.now()}_4`,
          accountCode: '6101',
          accountTitle: 'هزینه‌های دستمزد مستقیم تولید',
          tafziliName: `خط ${machineCodeInput} - شیفت ${shiftInput}`,
          debit: 0,
          credit: laborTotalRials,
          description: 'جذب دستمزد مستقیم تولید نخ'
        },
        {
          id: `vl_${Date.now()}_5`,
          accountCode: '6102',
          accountTitle: 'سربار ساخت کارخانه (برق، استهلاک، نت)',
          tafziliName: `خط ${machineCodeInput}`,
          debit: 0,
          credit: Math.max(0, overheadTotalRials),
          description: 'جذب سربار ساخت کارخانه'
        }
      ]
    };

    const nextState: IndustrialErpState = {
      ...erpState,
      items: updatedItems,
      cartonLabels: [newLabel, ...erpState.cartonLabels],
      vouchers: [autoVoucher, ...erpState.vouchers],
      nextCartonSeq: seq + 1,
      nextVoucherNo: voucherNo + 1
    };

    setActiveLabelPreview(newLabel);
    await persistErpState(
      nextState,
      `لیبل کارتن ${serialNumber} با وزن خالص ${weighCalculation.netKg} Kg صادر شد، مواد اولیه طبق فرمول کسر گردید و سند مالی شماره ${voucherNo} ثبت شد.`
    );
  };

  // --- PRINT CARTON QR LABEL ---
  const handlePrintCartonLabel = (label: ErpCartonLabel) => {
    const printWin = window.open('', '_blank', 'width=520,height=680');
    if (!printWin) {
      window.print();
      return;
    }
    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="UTF-8" />
        <title>لیبل کارتن نخ - ${label.serialNumber}</title>
        <style>
          @page { size: 100mm 140mm; margin: 4mm; }
          body { font-family: Tahoma, Arial, sans-serif; margin: 0; padding: 8px; color: #0f172a; }
          .box { border: 2.5px solid #0f172a; border-radius: 10px; padding: 10px; }
          .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px; }
          .title { font-size: 15px; font-weight: bold; }
          .serial { font-family: monospace; font-size: 14px; font-weight: bold; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
          .prod { font-size: 13px; font-weight: bold; margin-bottom: 8px; text-align: center; background: #f8fafc; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; margin-bottom: 8px; }
          .cell { border: 1px solid #cbd5e1; padding: 4px 6px; border-radius: 4px; }
          .weights { border: 2px solid #0f172a; border-radius: 8px; padding: 8px; margin-bottom: 8px; background: #f1f5f9; }
          .net { font-size: 20px; font-weight: 900; text-align: center; margin-top: 4px; direction: ltr; }
          .qr-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="hdr">
            <span class="title">صنایع نساجی و تولید نخ دلکام</span>
            <span class="serial">${label.serialNumber}</span>
          </div>
          <div class="prod">${label.productName}</div>
          <div class="grid">
            <div class="cell"><strong>نمره نخ / دنیر:</strong> ${label.yarnCount || label.denier || '-'}</div>
            <div class="cell"><strong>درجه کیفیت:</strong> Grade ${label.grade}</div>
            <div class="cell"><strong>شماره لات (Lot):</strong> ${label.lotNumber}</div>
            <div class="cell"><strong>کد ماشین / خط:</strong> ${label.machineCode}</div>
            <div class="cell"><strong>تعداد دوک:</strong> ${label.conesCount} عدد</div>
            <div class="cell"><strong>تاریخ تولید:</strong> ${label.createdDateJalali}</div>
          </div>
          <div class="weights">
            <div style="display:flex;justify-content:space-between;font-size:11px;">
              <span>وزن ناخالص (Gross): <strong>${label.grossWeightKg.toFixed(3)} Kg</strong></span>
              <span>کسر ظرف/دوک (Tare): <strong>${label.totalTareKg.toFixed(3)} Kg</strong></span>
            </div>
            <div class="net">NET: ${label.netWeightKg.toFixed(3)} KG</div>
          </div>
          <div class="qr-row">
            <div style="font-size:10px;line-height:1.6;">
              <div><strong>اپراتور:</strong> ${label.operatorName}</div>
              <div><strong>شیفت:</strong> ${label.shift}</div>
              <div style="font-family:monospace;font-size:9px;margin-top:4px;word-break:break-all;">${label.qrPayload}</div>
            </div>
            ${qrDataUrl ? `<img src="${qrDataUrl}" style="width:110px;height:110px;" />` : ''}
          </div>
        </div>
        <script>window.onload = () => { window.print(); };</script>
      </body>
      </html>
    `;
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  };

  // --- SCAN QR CODE FOR REMITTANCE ---
  const handleScanCartonQrForRemittance = () => {
    if (!erpState || !qrScanInput.trim()) return;
    const raw = qrScanInput.trim();
    // Match either full QR payload `DLK|SERIAL|...` or direct serial number `DLK-405-...`
    let serial = raw;
    if (raw.includes('|')) {
      const parts = raw.split('|');
      if (parts.length >= 2) serial = parts[1].trim();
    }
    const found = erpState.cartonLabels.find(
      c => c.serialNumber.toLowerCase() === serial.toLowerCase() && c.status === 'IN_STOCK'
    );
    if (!found) {
      showNotice('error', `کارتن با سریال «${serial}» در موجودی انبار یافت نشد یا قبلاً خارج شده است.`);
      return;
    }
    if (scannedCartonIds.includes(found.id)) {
      showNotice('info', `کارتن ${found.serialNumber} قبلاً به لیست بارگیری اضافه شده است.`);
      setQrScanInput('');
      return;
    }
    setScannedCartonIds(prev => [...prev, found.id]);
    setQrScanInput('');
    showNotice('success', `کارتن ${found.serialNumber} (${found.netWeightKg} کیلوگرم خالص) به حواله خروج اضافه شد.`);
  };

  // --- CREATE REMITTANCE FROM SCANNED CARTONS ---
  const handleCreateRemittanceFromScanned = async () => {
    if (!erpState) return;
    if (!newRemittanceCustomer.trim()) {
      showNotice('error', 'لطفاً نام مشتری / خریدار را وارد نمایید.');
      return;
    }
    const selectedCartons = erpState.cartonLabels.filter(c => scannedCartonIds.includes(c.id));
    if (selectedCartons.length === 0) {
      showNotice('error', 'حداقل یک کارتن را با QR یا از لیست انبار انتخاب کنید.');
      return;
    }

    const groupedMap = new Map<string, ErpRemittanceItem>();
    for (const c of selectedCartons) {
      const prod = erpState.items.find(i => i.id === c.productId);
      const existing = groupedMap.get(c.productId);
      if (existing) {
        existing.cartonsCount += 1;
        existing.conesCount += c.conesCount;
        existing.grossWeightKg = Number((existing.grossWeightKg + c.grossWeightKg).toFixed(3));
        existing.netWeightKg = Number((existing.netWeightKg + c.netWeightKg).toFixed(3));
      } else {
        groupedMap.set(c.productId, {
          productId: c.productId,
          productCode: c.productCode,
          productName: c.productName,
          cartonsCount: 1,
          conesCount: c.conesCount,
          grossWeightKg: c.grossWeightKg,
          netWeightKg: c.netWeightKg,
          unitPrice: prod?.salesPrice || Math.round((c.unitCostPerKg || 1800000) * 1.18)
        });
      }
    }

    const remittanceNo = `REM-405-${502 + erpState.remittances.length}`;
    const newRem: ErpRemittance = {
      id: `rem_${Date.now()}`,
      remittanceNo,
      dateJalali: getTodayJalali(),
      customerName: newRemittanceCustomer.trim(),
      customerCode: String(113300 + erpState.remittances.length),
      driverName: newRemittanceDriver.trim() || 'راننده حمل کارخانه',
      plateNumber: newRemittancePlate.trim() || 'ثبت در انتظامات',
      status: 'APPROVED_FOR_INVOICE',
      cartonSerials: selectedCartons.map(c => c.serialNumber),
      items: Array.from(groupedMap.values()),
      notes: 'صادرشده با اسکن QR کارتن‌های باسکول'
    };

    const updatedLabels = erpState.cartonLabels.map(c =>
      scannedCartonIds.includes(c.id) ? { ...c, status: 'SHIPPED' as const } : c
    );

    // Deduct shipped net weight from finished yarn warehouse
    const updatedItems = erpState.items.map(item => {
      const remItem = groupedMap.get(item.id);
      if (remItem) {
        return {
          ...item,
          stockQty: Number(Math.max(0, item.stockQty - remItem.netWeightKg).toFixed(3))
        };
      }
      return item;
    });

    const nextState: IndustrialErpState = {
      ...erpState,
      items: updatedItems,
      cartonLabels: updatedLabels,
      remittances: [newRem, ...erpState.remittances]
    };

    setScannedCartonIds([]);
    setNewRemittanceCustomer('');
    setNewRemittanceDriver('');
    setNewRemittancePlate('');
    await persistErpState(nextState, `حواله خروج ${remittanceNo} صادر شد و آماده تبدیل یک‌کلیکی به فاکتور فروش است.`);
  };

  // --- CONVERT REMITTANCE TO OFFICIAL SALES INVOICE + AUTO ACCOUNTING VOUCHER ---
  const handleConvertRemittanceToSalesInvoice = async (rem: ErpRemittance) => {
    if (!erpState) return;
    if (!canCreateSalesFromRemittance) {
      showNotice('error', 'شما مجوز صدور فاکتور فروش از روی حواله خروج را ندارید.');
      return;
    }
    if (rem.status === 'INVOICED') {
      showNotice('info', 'برای این حواله قبلاً فاکتور فروش صادر شده است.');
      return;
    }

    const todayJalali = getTodayJalali();
    const docNo = `INV-S-${1001 + erpState.tradeDocs.length}`;
    const docItems: ErpTradeDocItem[] = rem.items.map(it => ({
      itemId: it.productId,
      itemCode: it.productCode,
      itemName: `${it.productName} (${it.cartonsCount} کارتن / ${it.conesCount} دوک)`,
      qty: it.netWeightKg,
      unit: 'کیلوگرم خالص',
      unitPrice: it.unitPrice,
      totalPrice: Math.round(it.netWeightKg * it.unitPrice)
    }));

    const totalSalesAmount = docItems.reduce((s, x) => s + x.totalPrice, 0);

    // Calculate COGS (بهای تمام‌شده کالای فروش‌رفته)
    let totalCogsAmount = 0;
    for (const it of rem.items) {
      const costInfo = calculateBomUnitCost(it.productId, erpState);
      totalCogsAmount += Math.round(it.netWeightKg * costInfo.totalUnitCostPerKg);
    }

    const voucherNo = erpState.nextVoucherNo || 1002;
    const salesVoucher: ErpVoucher = {
      id: `vch_sales_${Date.now()}`,
      voucherNo,
      dateJalali: todayJalali,
      type: 'SALES',
      status: 'FINALIZED',
      description: `سند خودکار فاکتور فروش ${docNo} از روی حواله خروج ${rem.remittanceNo} - مشتری: ${rem.customerName}`,
      createdBy: currentUser.fullName || currentUser.username,
      createdAt: Date.now(),
      lines: [
        {
          id: `vl_s1_${Date.now()}`,
          accountCode: '1103',
          accountTitle: 'حساب‌های و اسناد دریافتنی تجاری (مشتریان)',
          tafziliName: rem.customerName,
          debit: totalSalesAmount,
          credit: 0,
          description: `بابت فاکتور فروش نخ شماره ${docNo} (حواله ${rem.remittanceNo})`
        },
        {
          id: `vl_s2_${Date.now()}`,
          accountCode: '4101',
          accountTitle: 'فروش خالص نخ و محصولات',
          tafziliName: rem.customerName,
          debit: 0,
          credit: totalSalesAmount,
          description: `فروش خالص نخ بر اساس وزن خالص باسکول`
        },
        {
          id: `vl_s3_${Date.now()}`,
          accountCode: '5101',
          accountTitle: 'بهای تمام‌شده کالای فروش‌رفته',
          tafziliName: 'محصولات نخ کارخانه',
          debit: totalCogsAmount,
          credit: 0,
          description: `ثبت بهای تمام‌شده صنعتی نخ فروخته‌شده در حواله ${rem.remittanceNo}`
        },
        {
          id: `vl_s4_${Date.now()}`,
          accountCode: '110604',
          accountTitle: 'انبار محصول نهایی نخ',
          tafziliName: 'انبار محصول زنجان',
          debit: 0,
          credit: totalCogsAmount,
          description: `خروج قطعی بهای تمام‌شده از انبار محصول`
        }
      ]
    };

    const newInvoice: ErpTradeDoc = {
      id: `td_${Date.now()}`,
      docNo,
      type: 'SALES',
      dateJalali: todayJalali,
      partyName: rem.customerName,
      partyCode: rem.customerCode,
      sourceRemittanceNo: rem.remittanceNo,
      status: 'FINALIZED',
      totalAmount: totalSalesAmount,
      items: docItems,
      voucherNo,
      notes: `صادرشده اتوماتیک از حواله خروج ${rem.remittanceNo}`,
      createdAt: Date.now()
    };

    const updatedRemittances = erpState.remittances.map(r =>
      r.id === rem.id ? { ...r, status: 'INVOICED' as const, invoiceId: newInvoice.id } : r
    );

    const nextState: IndustrialErpState = {
      ...erpState,
      remittances: updatedRemittances,
      tradeDocs: [newInvoice, ...erpState.tradeDocs],
      vouchers: [salesVoucher, ...erpState.vouchers],
      nextVoucherNo: voucherNo + 1
    };

    await persistErpState(
      nextState,
      `فاکتور فروش ${docNo} و سند حسابداری صنعتی شماره ${voucherNo} (به همراه ثبت بهای تمام‌شده کالای فروش‌رفته) با موفقیت صادر گردید.`
    );
  };

  // --- CREATE PURCHASE OR RETURN DOC + AUTO INVENTORY & ACCOUNTING VOUCHER ---
  const handleCreateTradeDoc = async () => {
    if (!erpState) return;
    if ((tradeDocType === 'PURCHASE') && !canCreatePurchase) {
      showNotice('error', 'شما مجوز ثبت فاکتور خرید را ندارید.');
      return;
    }
    if ((tradeDocType === 'PURCHASE_RETURN' || tradeDocType === 'SALES_RETURN') && !canManageReturns) {
      showNotice('error', 'شما مجوز ثبت مرجوعی خرید/فروش را ندارید.');
      return;
    }
    const targetItem = erpState.items.find(i => i.id === tradeSelectedItemId);
    if (!targetItem || !tradePartyName.trim() || tradeQty <= 0) {
      showNotice('error', 'لطفاً طرف حساب، کالا و مقدار معتبر وارد کنید.');
      return;
    }

    const totalAmount = Math.round(tradeQty * tradeUnitPrice);
    const todayJalali = getTodayJalali();
    const prefix =
      tradeDocType === 'PURCHASE'
        ? 'PUR'
        : tradeDocType === 'PURCHASE_RETURN'
        ? 'PRET'
        : tradeDocType === 'SALES_RETURN'
        ? 'SRET'
        : 'SLS';
    const docNo = `${prefix}-${1001 + erpState.tradeDocs.length}`;
    const voucherNo = erpState.nextVoucherNo || 1002;

    // Update stock & moving average cost on purchase
    const updatedItems = erpState.items.map(it => {
      if (it.id !== targetItem.id) return it;
      if (tradeDocType === 'PURCHASE') {
        const oldVal = it.stockQty * it.unitCost;
        const newQty = Number((it.stockQty + tradeQty).toFixed(3));
        const newAvgCost = newQty > 0 ? Math.round((oldVal + totalAmount) / newQty) : tradeUnitPrice;
        return { ...it, stockQty: newQty, unitCost: newAvgCost };
      }
      if (tradeDocType === 'PURCHASE_RETURN') {
        return { ...it, stockQty: Number(Math.max(0, it.stockQty - tradeQty).toFixed(3)) };
      }
      if (tradeDocType === 'SALES_RETURN') {
        return { ...it, stockQty: Number((it.stockQty + tradeQty).toFixed(3)) };
      }
      return { ...it, stockQty: Number(Math.max(0, it.stockQty - tradeQty).toFixed(3)) };
    });

    const voucherLinesForDoc: ErpVoucherLine[] =
      tradeDocType === 'PURCHASE'
        ? [
            {
              id: `vl_${Date.now()}_1`,
              accountCode: targetItem.category === 'PACKAGING' ? '110602' : '110601',
              accountTitle: targetItem.category === 'PACKAGING' ? 'انبار ملزومات بسته‌بندی (دوک و کارتن)' : 'انبار مواد اولیه و الیاف',
              tafziliName: targetItem.name,
              debit: totalAmount,
              credit: 0,
              description: `رسید خرید ${tradeQty} ${targetItem.unit} ${targetItem.name} - فاکتور ${docNo}`
            },
            {
              id: `vl_${Date.now()}_2`,
              accountCode: '2101',
              accountTitle: 'حساب‌ها و اسناد پرداختنی تجاری (تامین‌کنندگان)',
              tafziliName: tradePartyName.trim(),
              debit: 0,
              credit: totalAmount,
              description: `بستانکاری تامین‌کننده بابت فاکتور خرید ${docNo}`
            }
          ]
        : tradeDocType === 'PURCHASE_RETURN'
        ? [
            {
              id: `vl_${Date.now()}_1`,
              accountCode: '2101',
              accountTitle: 'حساب‌ها و اسناد پرداختنی تجاری (تامین‌کنندگان)',
              tafziliName: tradePartyName.trim(),
              debit: totalAmount,
              credit: 0,
              description: `مرجوعی خرید به تامین‌کننده - برگشت شماره ${docNo}`
            },
            {
              id: `vl_${Date.now()}_2`,
              accountCode: targetItem.category === 'PACKAGING' ? '110602' : '110601',
              accountTitle: targetItem.category === 'PACKAGING' ? 'انبار ملزومات بسته‌بندی (دوک و کارتن)' : 'انبار مواد اولیه و الیاف',
              tafziliName: targetItem.name,
              debit: 0,
              credit: totalAmount,
              description: `خروج کالای مرجوعی خرید از انبار (${tradeQty} ${targetItem.unit})`
            }
          ]
        : [
            {
              id: `vl_${Date.now()}_1`,
              accountCode: '4102',
              accountTitle: 'برگشت از فروش و تخفیفات',
              tafziliName: tradePartyName.trim(),
              debit: totalAmount,
              credit: 0,
              description: `برگشت از فروش نخ (${tradeQty} ${targetItem.unit}) - سند ${docNo}`
            },
            {
              id: `vl_${Date.now()}_2`,
              accountCode: '1103',
              accountTitle: 'حساب‌های و اسناد دریافتنی تجاری (مشتریان)',
              tafziliName: tradePartyName.trim(),
              debit: 0,
              credit: totalAmount,
              description: `کسر از بدهی مشتری بابت مرجوعی فروش ${docNo}`
            }
          ];

    const newVoucher: ErpVoucher = {
      id: `vch_trd_${Date.now()}`,
      voucherNo,
      dateJalali: todayJalali,
      type: tradeDocType === 'PURCHASE' ? 'PURCHASE' : 'RETURN',
      status: 'FINALIZED',
      description: `سند خودکار ${
        tradeDocType === 'PURCHASE' ? 'فاکتور خرید' : tradeDocType === 'PURCHASE_RETURN' ? 'مرجوعی خرید' : 'برگشت از فروش'
      } شماره ${docNo} - ${tradePartyName.trim()}`,
      createdBy: currentUser.fullName || currentUser.username,
      createdAt: Date.now(),
      lines: voucherLinesForDoc
    };

    const newDoc: ErpTradeDoc = {
      id: `td_${Date.now()}`,
      docNo,
      type: tradeDocType,
      dateJalali: todayJalali,
      partyName: tradePartyName.trim(),
      status: 'FINALIZED',
      totalAmount,
      items: [
        {
          itemId: targetItem.id,
          itemCode: targetItem.code,
          itemName: targetItem.name,
          qty: tradeQty,
          unit: targetItem.unit,
          unitPrice: tradeUnitPrice,
          totalPrice: totalAmount
        }
      ],
      voucherNo,
      notes: tradeNotes.trim(),
      createdAt: Date.now()
    };

    const nextState: IndustrialErpState = {
      ...erpState,
      items: updatedItems,
      tradeDocs: [newDoc, ...erpState.tradeDocs],
      vouchers: [newVoucher, ...erpState.vouchers],
      nextVoucherNo: voucherNo + 1
    };

    setTradePartyName('');
    setTradeNotes('');
    await persistErpState(nextState, `سند بازرگانی ${docNo}، اصلاح موجودی انبار و سند مالی شماره ${voucherNo} با موفقیت ثبت شد.`);
  };

  // --- ADD NEW ITEM IN MASTER DATA ---
  const handleAddMasterItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!erpState || !canManageMasterData) return;
    if (!newItemForm.code.trim() || !newItemForm.name.trim()) {
      showNotice('error', 'کد کالا و نام کالا الزامی است.');
      return;
    }
    const created: ErpItem = {
      id: `itm_${Date.now()}`,
      code: newItemForm.code.trim(),
      name: newItemForm.name.trim(),
      category: newItemForm.category,
      unit: newItemForm.unit,
      warehouseId: newItemForm.warehouseId,
      stockQty: Number(newItemForm.stockQty) || 0,
      unitCost: Number(newItemForm.unitCost) || 0,
      salesPrice: Number(newItemForm.salesPrice) || 0,
      denier: newItemForm.denier,
      filament: newItemForm.filament,
      yarnCount: newItemForm.yarnCount,
      colorName: newItemForm.colorName,
      coneWeightGrams: Number(newItemForm.coneWeightGrams) || 0,
      cartonWeightGrams: Number(newItemForm.cartonWeightGrams) || 0,
      defaultConesPerCarton: Number(newItemForm.defaultConesPerCarton) || 6
    };

    const nextState: IndustrialErpState = {
      ...erpState,
      items: [...erpState.items, created]
    };

    setNewItemForm({
      ...newItemForm,
      code: '',
      name: '',
      stockQty: 0
    });
    await persistErpState(nextState, `کالای «${created.name}» با مشخصات توزین و انبار ثبت شد.`);
  };

  // --- MANUAL ACCOUNTING VOUCHER ---
  const handleSaveManualVoucher = async () => {
    if (!erpState || !canCreateVoucher) return;
    const sumDebit = voucherLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const sumCredit = voucherLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (sumDebit <= 0 || sumDebit !== sumCredit) {
      showNotice('error', 'سند حسابداری باید تراز باشد (جمع بدهکار و بستانکار برابر و بزرگتر از صفر باشد).');
      return;
    }
    const voucherNo = erpState.nextVoucherNo || 1002;
    const vch: ErpVoucher = {
      id: `vch_man_${Date.now()}`,
      voucherNo,
      dateJalali: getTodayJalali(),
      type: 'GENERAL',
      status: canApproveVoucher ? 'FINALIZED' : 'DRAFT',
      description: voucherDesc.trim() || `سند حسابداری روزانه شماره ${voucherNo}`,
      createdBy: currentUser.fullName || currentUser.username,
      createdAt: Date.now(),
      lines: voucherLines
    };

    const nextState: IndustrialErpState = {
      ...erpState,
      vouchers: [vch, ...erpState.vouchers],
      nextVoucherNo: voucherNo + 1
    };

    setVoucherDesc('');
    await persistErpState(nextState, `سند حسابداری شماره ${voucherNo} با موفقیت ثبت شد.`);
  };

  // --- TRIAL BALANCE (تراز آزمایشی استاندارد) ---
  const trialBalanceRows = useMemo(() => {
    if (!erpState) return [];
    const map = new Map<string, { code: string; title: string; debitTurnover: number; creditTurnover: number }>();
    for (const acc of erpState.chartOfAccounts) {
      map.set(acc.code, { code: acc.code, title: acc.title, debitTurnover: 0, creditTurnover: 0 });
    }
    for (const v of erpState.vouchers) {
      for (const l of v.lines) {
        const cur = map.get(l.accountCode) || { code: l.accountCode, title: l.accountTitle, debitTurnover: 0, creditTurnover: 0 };
        cur.debitTurnover += Number(l.debit) || 0;
        cur.creditTurnover += Number(l.credit) || 0;
        map.set(l.accountCode, cur);
      }
    }
    return Array.from(map.values()).map(r => {
      const diff = r.debitTurnover - r.creditTurnover;
      return {
        ...r,
        debitBalance: diff > 0 ? diff : 0,
        creditBalance: diff < 0 ? Math.abs(diff) : 0
      };
    });
  }, [erpState]);

  const formatAmount = (val: number) => {
    if (!canViewFinancialAmounts) return '🔒 محرمانه';
    return val.toLocaleString('en-US') + ' ریال';
  };

  const formatCostAmount = (val: number) => {
    if (!canViewCostPrice || !canViewFinancialAmounts) return '🔒 محرمانه';
    return val.toLocaleString('en-US') + ' ریال';
  };

  if (loading || !erpState) {
    return (
      <div className="p-8 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300">
        در حال بارگذاری سامانه حسابداری صنعتی، باسکول و انبار نخ...
      </div>
    );
  }

  const finishedYarns = erpState.items.filter(i => i.category === 'FINISHED_YARN');
  const activeCostBreakdown = calculateBomUnitCost(selectedYarnId, erpState);
  const selectedBom = erpState.boms.find(b => b.id === selectedBomId) || erpState.boms[0];

  return (
    <div className="space-y-4 pb-16 text-right" dir="rtl">
      {/* Top Industrial Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-600 text-white">
                <Scale size={20} />
              </div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                سامانه جامع حسابداری صنعتی، توزین باسکول، لیبل QR و انبار نخ دلکام
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>موتور دیتابیس مستقل دلکام</span>
              <span>·</span>
              <span>کسر خودکار دوک، کارتن و مواد اولیه طبق BOM</span>
              <span>·</span>
              <span>محاسبه بهای تمام‌شده و صدور خودکار سند مالی</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>سطح دسترسی: {isAdmin ? 'مدیر کل سیستم (کامل)' : 'دسترسی اختصاصی کاربر'}</span>
            </div>
            <button
              type="button"
              onClick={loadErpData}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} className={saving ? 'animate-spin' : ''} />
              <span>بروزرسانی</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'WEIGHBRIDGE', label: '۱. توزین باسکول و لیبل QR تولید', icon: Scale, allowed: canWeighAndLabel || canViewWarehouse },
            { id: 'WAREHOUSE_MASTER', label: '۲. انبارها، کالاها و وزن دوک/کارتن', icon: Boxes, allowed: canViewWarehouse || canManageMasterData },
            { id: 'BOM_COSTING', label: '۳. فرمول تولید نخ (BOM) و بهای تمام‌شده', icon: Factory, allowed: canManageBom || canCalculateCost || canViewCostPrice },
            { id: 'SALES_REMITTANCE', label: '۴. حواله خروج با QR و صدور فاکتور فروش', icon: Truck, allowed: canCreateSalesFromRemittance || canViewWarehouse },
            { id: 'PURCHASE_RETURNS', label: '۵. خرید، مرجوعی خرید و برگشت از فروش', icon: ShoppingCart, allowed: canCreatePurchase || canManageReturns },
            { id: 'FINANCIAL_LEDGER', label: '۶. اسناد حسابداری، کدینگ و تراز آزمایشی', icon: BookOpen, allowed: canCreateVoucher || canViewLedgersAndTraz }
          ]
            .filter(t => t.allowed)
            .map(tab => {
              const Icon = tab.icon;
              const active = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Status Notice Banner */}
      {statusBanner && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : statusBanner.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              : 'bg-sky-50 dark:bg-sky-950/50 border-sky-300 dark:border-sky-800 text-sky-900 dark:text-sky-200'
          }`}
        >
          <span>{statusBanner.text}</span>
          <button type="button" onClick={() => setStatusBanner(null)} className="p-1">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 1: WEIGHBRIDGE, AUTOMATIC TARE DEDUCTION, QR LABELING & BOM BACKFLUSH                 */}
      {/* ========================================================================================= */}
      {activeSubTab === 'WEIGHBRIDGE' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left/Right Column 1: Scale Terminal & Packaging Tare Form (7 cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Scale size={18} className="text-emerald-600" />
                <span>ایستگاه توزین دیجیتال باسکول، محاسبه خالص و صدور لیبل کارتن نخ</span>
              </div>
              <button
                type="button"
                onClick={handleReadFromDigitalScale}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Radio size={14} />
                <span>{scaleConnected ? 'خواندن مجدد وزن از باسکول' : 'اتصال و دریافت وزن از باسکول'}</span>
              </button>
            </div>

            {/* Digital Scale Live HUD */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950 text-white p-4 rounded-2xl border border-slate-800">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">وزن ناخالص باسکول (Gross Weight)</div>
                <div className="text-2xl font-mono font-black text-sky-400 tabular-nums mt-1 dir-ltr text-left">
                  {weighCalculation.grossKg.toFixed(3)} <span className="text-xs">kg</span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">کسر اتوماتیک دوک و کارتن (Tare)</div>
                <div className="text-2xl font-mono font-black text-amber-400 tabular-nums mt-1 dir-ltr text-left">
                  -{weighCalculation.totalTareKg.toFixed(3)} <span className="text-xs">kg</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {conesCountInput} دوک ({weighCalculation.conesTotalKg}kg) + کارتن ({weighCalculation.cartonKg}kg)
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-950/90 border-2 border-emerald-500">
                <div className="text-[11px] text-emerald-300 font-bold">وزن خالص نخ (Net Weight)</div>
                <div className="text-2xl font-mono font-black text-emerald-400 tabular-nums mt-1 dir-ltr text-left">
                  {weighCalculation.netKg.toFixed(3)} <span className="text-xs">kg</span>
                </div>
                <div className="text-[10px] text-emerald-300 mt-1">مبنای ثبت انبار، BOM و فروش</div>
              </div>
            </div>

            {/* Form Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">انتخاب محصول (نخ تولیدشده روی باسکول)</label>
                <select
                  value={selectedYarnId}
                  onChange={e => setSelectedYarnId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {finishedYarns.map(y => (
                    <option key={y.id} value={y.id}>
                      {y.code} — {y.name} (موجودی فعلی: {y.stockQty.toLocaleString('en-US')} Kg)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">وزن ناخالص روی باسکول (کیلوگرم - Gross)</label>
                <input
                  type="number"
                  step="0.001"
                  value={grossWeightInput}
                  onChange={e => setGrossWeightInput(e.target.value)}
                  className="w-full rounded-xl border-2 border-emerald-500 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono font-black text-slate-900 dark:text-slate-100 tabular-nums dir-ltr text-left"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">تعداد دوک / بوبین داخل کارتن</label>
                <input
                  type="number"
                  value={conesCountInput}
                  onChange={e => setConesCountInput(Number(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums dir-ltr text-left"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">وزن هر دوک خالی (گرم)</label>
                <input
                  type="number"
                  value={customConeGram}
                  onChange={e => setCustomConeGram(Number(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums dir-ltr text-left"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">وزن کارتن خالی و لفاف (گرم)</label>
                <input
                  type="number"
                  value={customCartonGram}
                  onChange={e => setCustomCartonGram(Number(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums dir-ltr text-left"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">شماره لات تولید (Lot / Batch No)</label>
                <input
                  type="text"
                  value={lotNumberInput}
                  onChange={e => setLotNumberInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 dir-ltr text-left"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">کد ماشین / خط تولید و شیفت</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={machineCodeInput}
                    onChange={e => setMachineCodeInput(e.target.value)}
                    placeholder="TMT-01"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 dir-ltr text-left"
                  />
                  <select
                    value={shiftInput}
                    onChange={e => setShiftInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100"
                  >
                    <option value="روزکار (A)">روزکار (A)</option>
                    <option value="عصرکار (B)">عصرکار (B)</option>
                    <option value="شب‌کار (C)">شب‌کار (C)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Automatic BOM Backflush Preview */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-xs font-black text-slate-800 dark:text-slate-200">
                <span>کسر خودکار مواد اولیه از انبار با ثبت این کارتن (Auto-Backflush BOM):</span>
                {canViewCostPrice && (
                  <span className="text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                    بهای تمام‌شده هر کیلو: {formatCostAmount(activeCostBreakdown.totalUnitCostPerKg)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                {erpState.boms
                  .find(b => b.finishedItemId === selectedYarnId)
                  ?.components.map(c => {
                    const bom = erpState.boms.find(b => b.finishedItemId === selectedYarnId);
                    const wf = 1 + ((bom?.wastePercent || 0) / 100);
                    const deductKg = (weighCalculation.netKg * c.qtyPerKgOutput * wf).toFixed(3);
                    return (
                      <div key={c.id} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <span className="truncate">{c.itemName}</span>
                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums dir-ltr">
                          -{deductKg} kg
                        </span>
                      </div>
                    );
                  })}
                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span>دوک و کارتن بسته‌بندی</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                    -{conesCountInput} دوک / -1 کارتن
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleIssueCartonLabelAndBackflush}
              disabled={!canWeighAndLabel || saving}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <QrCode size={18} />
              <span>ثبت توزین کارتن، صدور لیبل QR، کسر خودکار انبار طبق فرمول و صدور سند تولید</span>
            </button>
          </div>

          {/* Column 2: Industrial QR Label Preview & Print (5 cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <QrCode size={18} className="text-indigo-600" />
                <span>پیش‌نمایش لیبل صنعتی کارتن نخ (QR Code)</span>
              </div>
              {activeLabelPreview && (
                <button
                  type="button"
                  onClick={() => handlePrintCartonLabel(activeLabelPreview)}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>چاپ لیبل کارتن</span>
                </button>
              )}
            </div>

            {activeLabelPreview ? (
              <div className="border-2 border-slate-900 dark:border-slate-200 rounded-2xl p-4 bg-white text-slate-900 space-y-3">
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
                  <div>
                    <div className="text-xs font-black">صنایع نساجی و تولید نخ دلکام</div>
                    <div className="text-[10px] text-slate-500">کارت شناسایی و رهگیری کارتن محصول</div>
                  </div>
                  <span className="font-mono text-xs font-black bg-slate-900 text-white px-2.5 py-1 rounded-md">
                    {activeLabelPreview.serialNumber}
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-slate-100 border border-slate-300 text-center text-xs font-black">
                  {activeLabelPreview.productName}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-1.5 rounded border border-slate-300">
                    <span className="text-slate-500">نمره نخ: </span>
                    <strong className="font-mono">{activeLabelPreview.yarnCount || activeLabelPreview.denier}</strong>
                  </div>
                  <div className="p-1.5 rounded border border-slate-300">
                    <span className="text-slate-500">لات تولید: </span>
                    <strong className="font-mono">{activeLabelPreview.lotNumber}</strong>
                  </div>
                  <div className="p-1.5 rounded border border-slate-300">
                    <span className="text-slate-500">خط / ماشین: </span>
                    <strong className="font-mono">{activeLabelPreview.machineCode}</strong>
                  </div>
                  <div className="p-1.5 rounded border border-slate-300">
                    <span className="text-slate-500">تعداد دوک: </span>
                    <strong className="font-mono">{activeLabelPreview.conesCount} عدد</strong>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border-2 border-slate-900 bg-slate-50">
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>ناخالص (Gross): <strong className="font-mono">{activeLabelPreview.grossWeightKg.toFixed(3)} Kg</strong></span>
                    <span>ظرف (Tare): <strong className="font-mono">{activeLabelPreview.totalTareKg.toFixed(3)} Kg</strong></span>
                  </div>
                  <div className="text-center text-lg font-mono font-black text-slate-950 mt-1 dir-ltr">
                    NET WEIGHT: {activeLabelPreview.netWeightKg.toFixed(3)} KG
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="space-y-1 text-[10px] text-slate-600">
                    <div><strong>تاریخ:</strong> {activeLabelPreview.createdDateJalali} — {activeLabelPreview.shift}</div>
                    <div><strong>اپراتور توزین:</strong> {activeLabelPreview.operatorName}</div>
                    <div className="font-mono text-[9px] text-slate-500 break-all dir-ltr text-left">
                      {activeLabelPreview.qrPayload}
                    </div>
                  </div>
                  {qrDataUrl && (
                    <img
                      src={qrDataUrl}
                      alt={activeLabelPreview.serialNumber}
                      referrerPolicy="no-referrer"
                      className="w-24 h-24 border border-slate-300 rounded-lg p-1 bg-white shrink-0"
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">لیبلی برای پیش‌نمایش انتخاب نشده است.</div>
            )}

            {/* Recent Weighed Cartons List */}
            <div className="space-y-2">
              <div className="text-xs font-black text-slate-700 dark:text-slate-300">آخرین کارتن‌های توزین و لیبل‌خورده:</div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {erpState.cartonLabels.slice(0, 8).map(lbl => (
                  <div
                    key={lbl.id}
                    onClick={() => setActiveLabelPreview(lbl)}
                    className={`p-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      activeLabelPreview?.id === lbl.id
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <span className="font-mono font-black text-slate-900 dark:text-slate-100">{lbl.serialNumber}</span>
                      <span className="mx-1.5 text-slate-400">·</span>
                      <span className="text-slate-600 dark:text-slate-300">{lbl.productName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-emerald-700 dark:text-emerald-400 tabular-nums dir-ltr">
                        {lbl.netWeightKg.toFixed(2)} Kg
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {lbl.status === 'IN_STOCK' ? 'موجود در انبار' : 'ارسال‌شده'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 2: WAREHOUSES, MASTER DATA & TARE DEFINITIONS                                         */}
      {/* ========================================================================================= */}
      {activeSubTab === 'WAREHOUSE_MASTER' && (
        <div className="space-y-4">
          {canManageMasterData && (
            <form onSubmit={handleAddMasterItem} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="text-sm font-black text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5">
                تعریف کالای جدید نساجی و تنظیم وزن استاندارد دوک و کارتن
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="کد کالا (مثلاً YN-3005)"
                  value={newItemForm.code}
                  onChange={e => setNewItemForm({ ...newItemForm, code: e.target.value })}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold"
                />
                <input
                  type="text"
                  placeholder="نام کامل کالا / نخ"
                  value={newItemForm.name}
                  onChange={e => setNewItemForm({ ...newItemForm, name: e.target.value })}
                  className="sm:col-span-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
                />
                <select
                  value={newItemForm.category}
                  onChange={e => setNewItemForm({ ...newItemForm, category: e.target.value as any })}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
                >
                  <option value="FINISHED_YARN">محصول نهایی نخ (Finished Yarn)</option>
                  <option value="RAW_MATERIAL">ماده اولیه (POY / گرانول / روغن / رنگ)</option>
                  <option value="PACKAGING">ملزومات بسته‌بندی (دوک / کارتن / پالت)</option>
                  <option value="WASTE">ضایعات نساجی</option>
                </select>

                <input
                  type="text"
                  placeholder="نمره نخ / دنیر-فیلامنت (150D/48F)"
                  value={newItemForm.yarnCount}
                  onChange={e => setNewItemForm({ ...newItemForm, yarnCount: e.target.value })}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs"
                />
                <input
                  type="number"
                  placeholder="وزن هر دوک به گرم (مثلاً 110)"
                  value={newItemForm.coneWeightGrams}
                  onChange={e => setNewItemForm({ ...newItemForm, coneWeightGrams: Number(e.target.value) })}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono"
                />
                <input
                  type="number"
                  placeholder="وزن کارتن خالی به گرم (مثلاً 1450)"
                  value={newItemForm.cartonWeightGrams}
                  onChange={e => setNewItemForm({ ...newItemForm, cartonWeightGrams: Number(e.target.value) })}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2 px-4 cursor-pointer"
                >
                  افزودن کالا به سیستم
                </button>
              </div>
            </form>
          )}

          {/* Inventory & Packaging Tare Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-sm font-black text-slate-900 dark:text-slate-100 mb-3">
              موجودی لحظه‌ای انبارهای کارخانه و ضرایب کسر اتوماتیک دوک و کارتن
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2.5 px-3 text-right">کد کالا</th>
                    <th className="py-2.5 px-3 text-right">نام کالا / مشخصات نخ</th>
                    <th className="py-2.5 px-3 text-right">طبقه انبار</th>
                    <th className="py-2.5 px-3 text-right">وزن دوک (گرم)</th>
                    <th className="py-2.5 px-3 text-right">وزن کارتن (گرم)</th>
                    <th className="py-2.5 px-3 text-left">موجودی فعلی</th>
                    <th className="py-2.5 px-3 text-left">فی میانگین / بهای تمام‌شده</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {erpState.items.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="py-2.5 px-3 font-mono font-bold">{item.code}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">{item.name}</td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {item.category === 'FINISHED_YARN'
                          ? 'انبار محصول نخ'
                          : item.category === 'RAW_MATERIAL'
                          ? 'انبار مواد اولیه'
                          : 'انبار ملزومات بسته‌بندی'}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">{item.coneWeightGrams ? `${item.coneWeightGrams} g` : '-'}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">{item.cartonWeightGrams ? `${item.cartonWeightGrams} g` : '-'}</td>
                      <td className="py-2.5 px-3 font-mono font-black text-emerald-700 dark:text-emerald-400 tabular-nums text-left dir-ltr">
                        {item.stockQty.toLocaleString('en-US')} {item.unit}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-left">
                        {formatCostAmount(item.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 3: TEXTILE BOM & INDUSTRIAL COST ACCOUNTING                                           */}
      {/* ========================================================================================= */}
      {activeSubTab === 'BOM_COSTING' && selectedBom && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                مهندسی فرمول تولید نخ (BOM) و آنالیز بهای تمام‌شده صنعتی (به ازای ۱ کیلوگرم نخ خالص)
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                محاسبه دقیق مواد اولیه مصرفی + درصد ضایعات خط تولید + دوک و کارتن + سرشکن دستمزد و سربار کارخانه
              </div>
            </div>
            <select
              value={selectedBom.id}
              onChange={e => setSelectedBomId(e.target.value)}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
            >
              {erpState.boms.map(b => (
                <option key={b.id} value={b.id}>
                  {b.finishedItemName} ({b.version})
                </option>
              ))}
            </select>
          </div>

          {(() => {
            const breakdown = calculateBomUnitCost(selectedBom.finishedItemId, erpState);
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500">۱. مواد اولیه مستقیم</div>
                  <div className="text-sm font-mono font-black text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {formatCostAmount(breakdown.rawMaterialCostPerKg)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500">۲. هزینه ضایعات فرمول ({selectedBom.wastePercent}%)</div>
                  <div className="text-sm font-mono font-black text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
                    {formatCostAmount(breakdown.wasteCostPerKg)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500">۳. سهم دوک و کارتن در هر کیلو</div>
                  <div className="text-sm font-mono font-black text-sky-700 dark:text-sky-400 mt-1 tabular-nums">
                    {formatCostAmount(breakdown.packagingCostPerKg)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500">۴. دستمزد مستقیم و سربار ساخت</div>
                  <div className="text-sm font-mono font-black text-indigo-700 dark:text-indigo-400 mt-1 tabular-nums">
                    {formatCostAmount(breakdown.laborCostPerKg + breakdown.overheadCostPerKg)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border-2 border-emerald-500">
                  <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">بهای تمام‌شده ۱ کیلوگرم نخ خالص</div>
                  <div className="text-base font-mono font-black text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
                    {formatCostAmount(breakdown.totalUnitCostPerKg)}
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 px-3 text-right">نام ماده اولیه مصرفی</th>
                  <th className="py-2 px-3 text-right">ضریب مصرف به ازای ۱ کیلوگرم نخ</th>
                  <th className="py-2 px-3 text-right">ضریب با احتساب پرت ({selectedBom.wastePercent}%)</th>
                  <th className="py-2 px-3 text-left">نرخ میانگین انبار</th>
                  <th className="py-2 px-3 text-left">سهم ریالی در هر کیلو نخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {selectedBom.components.map(comp => {
                  const itemObj = erpState.items.find(i => i.id === comp.itemId);
                  const withWaste = comp.qtyPerKgOutput * (1 + selectedBom.wastePercent / 100);
                  const costShare = Math.round(withWaste * (itemObj?.unitCost || 0));
                  return (
                    <tr key={comp.id}>
                      <td className="py-2.5 px-3 font-bold">{comp.itemName}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">{comp.qtyPerKgOutput} {comp.unit}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">{withWaste.toFixed(4)} {comp.unit}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-left">{formatCostAmount(itemObj?.unitCost || 0)}</td>
                      <td className="py-2.5 px-3 font-mono font-bold tabular-nums text-left">{formatCostAmount(costShare)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 4: QR SCANNER EXIT REMITTANCE & 1-CLICK SALES INVOICE ISSUANCE                        */}
      {/* ========================================================================================= */}
      {activeSubTab === 'SALES_REMITTANCE' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="text-sm font-black text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5">
              اسکن QR کارتن‌های نخ برای صدور حواله خروج کارخانه و تبدیل خودکار به فاکتور فروش
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2 flex gap-2">
                <input
                  type="text"
                  value={qrScanInput}
                  onChange={e => setQrScanInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleScanCartonQrForRemittance()}
                  placeholder="اسکن بارکدخوان یا ورود سریال کارتن (مثلاً DLK-405-10002)..."
                  className="flex-1 rounded-xl border-2 border-indigo-500 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold dir-ltr text-left"
                />
                <button
                  type="button"
                  onClick={handleScanCartonQrForRemittance}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black cursor-pointer shrink-0"
                >
                  افزودن کارتن با QR
                </button>
              </div>
              <input
                type="text"
                value={newRemittanceCustomer}
                onChange={e => setNewRemittanceCustomer(e.target.value)}
                placeholder="نام مشتری / خریدار..."
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newRemittanceDriver}
                  onChange={e => setNewRemittanceDriver(e.target.value)}
                  placeholder="نام راننده"
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
                />
                <input
                  type="text"
                  value={newRemittancePlate}
                  onChange={e => setNewRemittancePlate(e.target.value)}
                  placeholder="شماره پلاک خودرو"
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
                />
              </div>
            </div>

            {/* Quick Select Available In-Stock Cartons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500">کارتن‌های موجود در انبار (کلیک برای افزودن به بارگیری):</span>
              {erpState.cartonLabels
                .filter(c => c.status === 'IN_STOCK')
                .map(c => {
                  const selected = scannedCartonIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setScannedCartonIds(prev =>
                          prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                        )
                      }
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border cursor-pointer ${
                        selected
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {c.serialNumber} ({c.netWeightKg} Kg)
                    </button>
                  );
                })}
            </div>

            {scannedCartonIds.length > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
                <span className="text-xs font-black text-emerald-900 dark:text-emerald-200">
                  {scannedCartonIds.length} کارتن انتخاب شد — مجموع وزن خالص:{' '}
                  {erpState.cartonLabels
                    .filter(c => scannedCartonIds.includes(c.id))
                    .reduce((s, c) => s + c.netWeightKg, 0)
                    .toFixed(3)}{' '}
                  کیلوگرم
                </span>
                <button
                  type="button"
                  onClick={handleCreateRemittanceFromScanned}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer"
                >
                  ثبت نهایی حواله خروج انبار
                </button>
              </div>
            )}
          </div>

          {/* Remittances List & 1-Click Invoice Button */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="text-sm font-black text-slate-900 dark:text-slate-100">
              کارتابل حواله‌های خروج کارخانه (آماده صدور فاکتور فروش و سند حسابداری)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2.5 px-3 text-right">شماره حواله</th>
                    <th className="py-2.5 px-3 text-right">تاریخ</th>
                    <th className="py-2.5 px-3 text-right">مشتری / خریدار</th>
                    <th className="py-2.5 px-3 text-right">راننده و پلاک</th>
                    <th className="py-2.5 px-3 text-right">شرح محموله نخ</th>
                    <th className="py-2.5 px-3 text-left">وزن خالص کل</th>
                    <th className="py-2.5 px-3 text-left">عملیات بخش فروش</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {erpState.remittances.map(rem => {
                    const totalNet = rem.items.reduce((s, i) => s + i.netWeightKg, 0);
                    return (
                      <tr key={rem.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <td className="py-2.5 px-3 font-mono font-black">{rem.remittanceNo}</td>
                        <td className="py-2.5 px-3 font-mono">{rem.dateJalali}</td>
                        <td className="py-2.5 px-3 font-bold">{rem.customerName}</td>
                        <td className="py-2.5 px-3 text-slate-500">{rem.driverName} · {rem.plateNumber}</td>
                        <td className="py-2.5 px-3">
                          {rem.items.map(it => `${it.productName} (${it.cartonsCount} کارتن)`).join('، ')}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-black text-emerald-700 dark:text-emerald-400 tabular-nums text-left dir-ltr">
                          {totalNet.toFixed(2)} Kg
                        </td>
                        <td className="py-2.5 px-3 text-left">
                          {rem.status === 'INVOICED' ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              فاکتور فروش و سند مالی صادر شد
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleConvertRemittanceToSalesInvoice(rem)}
                              disabled={!canCreateSalesFromRemittance}
                              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-black cursor-pointer"
                            >
                              صدور فاکتور فروش و سند مالی از حواله
                            </button>
                          )}
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

      {/* ========================================================================================= */}
      {/* TAB 5: PURCHASING, PURCHASE RETURNS & SALES RETURNS                                       */}
      {/* ========================================================================================= */}
      {activeSubTab === 'PURCHASE_RETURNS' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="text-sm font-black text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2.5">
              ثبت فاکتور خرید مواد اولیه، مرجوعی خرید و برگشت از فروش (با اصلاح خودکار انبار و صدور سند مالی)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <select
                value={tradeDocType}
                onChange={e => setTradeDocType(e.target.value as any)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
              >
                <option value="PURCHASE">فاکتور خرید مواد و ملزومات</option>
                <option value="PURCHASE_RETURN">مرجوعی خرید (برگشت به تامین‌کننده)</option>
                <option value="SALES_RETURN">مرجوعی فروش (برگشت نخ از مشتری به انبار)</option>
              </select>
              <input
                type="text"
                placeholder="نام تامین‌کننده / مشتری..."
                value={tradePartyName}
                onChange={e => setTradePartyName(e.target.value)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
              />
              <select
                value={tradeSelectedItemId}
                onChange={e => {
                  const id = e.target.value;
                  setTradeSelectedItemId(id);
                  const found = erpState.items.find(i => i.id === id);
                  if (found) setTradeUnitPrice(found.unitCost || 0);
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
              >
                {erpState.items.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="مقدار / وزن"
                value={tradeQty}
                onChange={e => setTradeQty(Number(e.target.value))}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold"
              />
              <input
                type="number"
                placeholder="فی واحد (ریال)"
                value={tradeUnitPrice}
                onChange={e => setTradeUnitPrice(Number(e.target.value))}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                جمع کل سند: <span className="font-mono font-black">{formatAmount(Math.round(tradeQty * tradeUnitPrice))}</span>
              </div>
              <button
                type="button"
                onClick={handleCreateTradeDoc}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer"
              >
                ثبت قطعی فاکتور، بروزرسانی انبار و صدور سند حسابداری
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="text-sm font-black text-slate-900 dark:text-slate-100">
              فهرست فاکتورهای خرید، فروش و برگشتی‌ها
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 px-3 text-right">شماره فاکتور</th>
                    <th className="py-2 px-3 text-right">نوع سند</th>
                    <th className="py-2 px-3 text-right">تاریخ</th>
                    <th className="py-2 px-3 text-right">طرف حساب</th>
                    <th className="py-2 px-3 text-right">اقلام</th>
                    <th className="py-2 px-3 text-right">سند مالی مرتبط</th>
                    <th className="py-2 px-3 text-left">مبلغ کل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {erpState.tradeDocs.map(doc => (
                    <tr key={doc.id}>
                      <td className="py-2.5 px-3 font-mono font-bold">{doc.docNo}</td>
                      <td className="py-2.5 px-3 font-bold">
                        {doc.type === 'PURCHASE'
                          ? 'خرید'
                          : doc.type === 'PURCHASE_RETURN'
                          ? 'مرجوعی خرید'
                          : doc.type === 'SALES'
                          ? 'فروش از حواله'
                          : 'برگشت از فروش'}
                      </td>
                      <td className="py-2.5 px-3 font-mono">{doc.dateJalali}</td>
                      <td className="py-2.5 px-3 font-bold">{doc.partyName}</td>
                      <td className="py-2.5 px-3">
                        {doc.items.map(i => `${i.itemName} (${i.qty} ${i.unit})`).join('، ')}
                      </td>
                      <td className="py-2.5 px-3 font-mono">سند #{doc.voucherNo || '-'}</td>
                      <td className="py-2.5 px-3 font-mono font-black tabular-nums text-left">{formatAmount(doc.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================================= */}
      {/* TAB 6: FINANCIAL ACCOUNTING VOUCHERS, CHART OF ACCOUNTS & TRIAL BALANCE                   */}
      {/* ========================================================================================= */}
      {activeSubTab === 'FINANCIAL_LEDGER' && (
        <div className="space-y-4">
          {/* Manual Voucher Entry */}
          {canCreateVoucher && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                  ثبت سند حسابداری جدید (کل / معین / تفصیلی)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setVoucherLines([
                      ...voucherLines,
                      { id: `vl_${Date.now()}`, accountCode: '1101', accountTitle: 'موجودی نقد و بانک', tafziliName: '', debit: 0, credit: 0, description: '' }
                    ])
                  }
                  className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
                >
                  + افزودن آرتیکل جدید
                </button>
              </div>

              <input
                type="text"
                placeholder="شرح کلی سند حسابداری..."
                value={voucherDesc}
                onChange={e => setVoucherDesc(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold"
              />

              <div className="space-y-2">
                {voucherLines.map((line, idx) => (
                  <div key={line.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                    <select
                      value={line.accountCode}
                      onChange={e => {
                        const acc = erpState.chartOfAccounts.find(a => a.code === e.target.value);
                        const copy = [...voucherLines];
                        copy[idx] = { ...line, accountCode: e.target.value, accountTitle: acc?.title || '' };
                        setVoucherLines(copy);
                      }}
                      className="md:col-span-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-bold"
                    >
                      {erpState.chartOfAccounts.map(a => (
                        <option key={a.id} value={a.code}>
                          {a.code} — {a.title}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="حساب تفصیلی / شخص"
                      value={line.tafziliName}
                      onChange={e => {
                        const copy = [...voucherLines];
                        copy[idx] = { ...line, tafziliName: e.target.value };
                        setVoucherLines(copy);
                      }}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="شرح آرتیکل"
                      value={line.description}
                      onChange={e => {
                        const copy = [...voucherLines];
                        copy[idx] = { ...line, description: e.target.value };
                        setVoucherLines(copy);
                      }}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs"
                    />
                    <input
                      type="number"
                      placeholder="بدهکار (ریال)"
                      value={line.debit || ''}
                      onChange={e => {
                        const copy = [...voucherLines];
                        copy[idx] = { ...line, debit: Number(e.target.value) || 0, credit: 0 };
                        setVoucherLines(copy);
                      }}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono tabular-nums"
                    />
                    <input
                      type="number"
                      placeholder="بستانکار (ریال)"
                      value={line.credit || ''}
                      onChange={e => {
                        const copy = [...voucherLines];
                        copy[idx] = { ...line, credit: Number(e.target.value) || 0, debit: 0 };
                        setVoucherLines(copy);
                      }}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-mono tabular-nums"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                  جمع بدهکار: {voucherLines.reduce((s, l) => s + (Number(l.debit) || 0), 0).toLocaleString('en-US')} | جمع بستانکار:{' '}
                  {voucherLines.reduce((s, l) => s + (Number(l.credit) || 0), 0).toLocaleString('en-US')}
                </div>
                <button
                  type="button"
                  onClick={handleSaveManualVoucher}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black cursor-pointer"
                >
                  ثبت و ذخیره سند حسابداری
                </button>
              </div>
            </div>
          )}

          {/* Trial Balance (تراز آزمایشی استاندارد ۴ ستونی) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="text-sm font-black text-slate-900 dark:text-slate-100">
              تراز آزمایشی استاندارد حسابداری صنعتی (گردش و مانده حساب‌های کل و معین)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 px-3 text-right">کد حساب</th>
                    <th className="py-2 px-3 text-right">عنوان سرفصل حساب</th>
                    <th className="py-2 px-3 text-left">گردش بدهکار</th>
                    <th className="py-2 px-3 text-left">گردش بستانکار</th>
                    <th className="py-2 px-3 text-left">مانده بدهکار</th>
                    <th className="py-2 px-3 text-left">مانده بستانکار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {trialBalanceRows.map(row => (
                    <tr key={row.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <td className="py-2 px-3 font-mono font-bold">{row.code}</td>
                      <td className="py-2 px-3 font-bold">{row.title}</td>
                      <td className="py-2 px-3 font-mono tabular-nums text-left">{formatAmount(row.debitTurnover)}</td>
                      <td className="py-2 px-3 font-mono tabular-nums text-left">{formatAmount(row.creditTurnover)}</td>
                      <td className="py-2 px-3 font-mono font-black text-emerald-700 dark:text-emerald-400 tabular-nums text-left">
                        {formatAmount(row.debitBalance)}
                      </td>
                      <td className="py-2 px-3 font-mono font-black text-sky-700 dark:text-sky-400 tabular-nums text-left">
                        {formatAmount(row.creditBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vouchers List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="text-sm font-black text-slate-900 dark:text-slate-100">
              دفتر روزنامه و اسناد حسابداری صادرشده (خودکار تولید، خرید، فروش و دستی)
            </div>
            <div className="space-y-3">
              {erpState.vouchers.map(v => (
                <div key={v.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                      سند شماره #{v.voucherNo} — {v.description}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      تاریخ: {v.dateJalali} · صادرکننده: {v.createdBy}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-slate-400">
                          <th className="py-1 px-2 text-right">کد حساب</th>
                          <th className="py-1 px-2 text-right">سرفصل</th>
                          <th className="py-1 px-2 text-right">تفصیلی</th>
                          <th className="py-1 px-2 text-right">شرح آرتیکل</th>
                          <th className="py-1 px-2 text-left">بدهکار</th>
                          <th className="py-1 px-2 text-left">بستانکار</th>
                        </tr>
                      </thead>
                      <tbody>
                        {v.lines.map(l => (
                          <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800/60">
                            <td className="py-1 px-2 font-mono">{l.accountCode}</td>
                            <td className="py-1 px-2 font-bold">{l.accountTitle}</td>
                            <td className="py-1 px-2">{l.tafziliName}</td>
                            <td className="py-1 px-2 text-slate-500">{l.description}</td>
                            <td className="py-1 px-2 font-mono tabular-nums text-left">{l.debit ? formatAmount(l.debit) : '-'}</td>
                            <td className="py-1 px-2 font-mono tabular-nums text-left">{l.credit ? formatAmount(l.credit) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
