import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Barcode, 
  Package, 
  Warehouse, 
  User, 
  Calendar, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Printer, 
  Send, 
  Search, 
  Sparkles, 
  ArrowRight, 
  Volume2, 
  VolumeX, 
  History, 
  FileText, 
  Layers, 
  Scale, 
  Boxes, 
  ExternalLink,
  ChevronDown,
  X,
  Copy,
  Check,
  Building2,
  RefreshCw,
  Truck,
  TrendingUp,
  Clock,
  Filter,
  ArrowUpRight,
  Camera,
  Zap,
  ZapOff,
  Smartphone
} from 'lucide-react';
import jsQR from 'jsqr';
import * as jalaali from 'jalaali-js';
import { apiCall } from '../services/apiService';
import { openSendToChat } from '../services/chatShareService';

interface WarehouseItem {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface LiveWarehouseStat {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  fiscalYear: string;
  docsCount: number;
  itemsCount: number;
  totalQty: number;
  salesRemittancesCount: number;
}

export interface WarehouseRecentDoc {
  docId: string;
  fiscalYear: string;
  docNo: string;
  subNo: string;
  subCode: string;
  docDate: string;
  opCode: string;
  opName: string;
  customerCode: string;
  customerName: string;
  warehouseCode: string;
  warehouseName: string;
  itemsCount: number;
  description: string;
}

interface FiscalYearItem {
  code: string;
  title: string;
  isDefault: boolean;
}

interface CustomerItem {
  tafsiliCode: string;
  personCode: string;
  name: string;
  levelCode: string;
}

interface GoodsItem {
  code: string;
  name: string;
  groupCode?: string;
}

export interface RemittanceItemRow {
  id: string;
  barcode: string;
  batch: string;
  itemCode: string;
  itemName: string;
  netWeight: number;
  grossWeight: number;
  cartonCount: number;
  bobbinCount: number;
  grade: string;
  twistDirection: string;
  rawGrade: string;
  rawTwist: string;
  note: string;
}

export interface ArchiveRecord {
  id: string;
  sayanDocId: string;
  docNo: string;
  subNo: string;
  opCode?: string;
  opName?: string;
  fiscalYear: string;
  warehouseCode: string;
  warehouseName?: string;
  customerCode: string;
  customerName: string;
  remittanceDate: string;
  shamsiDate: string;
  notes: string;
  subCode: string;
  itemsCount: number;
  totalNetWeight: number;
  totalCartons: number;
  totalBobbins: number;
  items: RemittanceItemRow[];
  createdBy: string;
  createdAt: string;
  status: string;
}

interface SayanSalesRemittanceIssuerProps {
  currentUser?: any;
  settings?: any;
  initialSubTab?: 'issuer' | 'archive' | 'warehouses';
  initialWarehouseCode?: string;
  autoStartCamera?: boolean;
  onSuccessRegistered?: (docNo: string, archiveRecord?: any) => void;
  onClose?: () => void;
}

// Simple Web Audio API Synthesizer for instant audible scan feedback (no external files)
const playBeepSound = (type: 'success' | 'error' = 'success') => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1900, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.setValueAtTime(300, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    // Ignore audio errors if blocked by browser policy
  }
};

const getTodayShamsi = () => {
  const d = new Date();
  const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
};

export const SayanSalesRemittanceIssuer: React.FC<SayanSalesRemittanceIssuerProps> = ({
  currentUser,
  settings,
  initialSubTab = 'issuer',
  initialWarehouseCode = '15',
  autoStartCamera = false,
  onSuccessRegistered,
  onClose
}) => {
  // Navigation / View State
  const [activeSubTab, setActiveSubTab] = useState<'issuer' | 'archive' | 'warehouses'>(initialSubTab);

  // Form Headers
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYearItem[]>([
    { code: '4', title: '۱۴۰۵ (سال مالی جاری)', isDefault: true },
    { code: '3', title: '۱۴۰۴', isDefault: false },
    { code: '2', title: '۱۴۰۳', isDefault: false }
  ]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(initialWarehouseCode || '15'); // Default Tehran Store
  const [selectedDestinationWarehouse, setSelectedDestinationWarehouse] = useState<string>('11'); // Destination warehouse for transfers
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>('4'); // Default 1405 (Code 4)
  const [remittanceDate, setRemittanceDate] = useState<string>(getTodayShamsi());
  const [subCode, setSubCode] = useState<string>('');
  const [headerNotes, setHeaderNotes] = useState<string>('');
  const [operationType, setOperationType] = useState<'23' | '25'>('23');
  const [archiveOpFilter, setArchiveOpFilter] = useState<string>('all');

  // Live Warehouses Stats & Recent Documents
  const [warehouseStats, setWarehouseStats] = useState<LiveWarehouseStat[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState<boolean>(false);
  const [selectedStatWarehouse, setSelectedStatWarehouse] = useState<string>(initialWarehouseCode || '15');
  const [recentDocs, setRecentDocs] = useState<WarehouseRecentDoc[]>([]);
  const [isLoadingRecentDocs, setIsLoadingRecentDocs] = useState<boolean>(false);
  const [docsSearchQuery, setDocsSearchQuery] = useState<string>('');
  const [docsOpFilter, setDocsOpFilter] = useState<string>('all');

  // Customer Auto-Extraction & Search
  const [allCustomersList, setAllCustomersList] = useState<CustomerItem[]>([]);
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [customersList, setCustomersList] = useState<CustomerItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState<boolean>(false);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState<boolean>(false);

  // Active Goods for quick manual picking
  const [goodsList, setGoodsList] = useState<GoodsItem[]>([]);
  const [activeItemCode, setActiveItemCode] = useState<string>('0402010105');
  const [activeItemName, setActiveItemName] = useState<string>('کش 110S سفید بشقابی');

  // Barcode Scanner Station
  const [scannedBarcode, setScannedBarcode] = useState<string>('');
  const [isContinuousScan, setIsContinuousScan] = useState<boolean>(true);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);
  const [isResolvingBarcode, setIsResolvingBarcode] = useState<boolean>(false);
  const [lastScanResult, setLastScanResult] = useState<{ text: string; success: boolean; item?: any } | null>(null);

  // Items List
  const [items, setItems] = useState<RemittanceItemRow[]>([]);
  const itemsRef = useRef<RemittanceItemRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Mobile Camera Scanner Station State & Refs
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isTorchSupported, setIsTorchSupported] = useState<boolean>(true);
  const [cameraScanFlash, setCameraScanFlash] = useState<boolean>(false);
  const [isCameraCustomerPickerOpen, setIsCameraCustomerPickerOpen] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const isFrameBusyRef = useRef<boolean>(false);
  const recentCameraScansRef = useRef<Map<string, number>>(new Map());
  const isResolvingBarcodeRef = useRef<boolean>(false);

  // Submission & Dialogs
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any | null>(null);
  const [printModalRecord, setPrintModalRecord] = useState<any | null>(null);

  // Local Archive State
  const [archiveList, setArchiveList] = useState<ArchiveRecord[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState<boolean>(false);
  const [archiveSearch, setArchiveSearch] = useState<string>('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Close customer dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1. Initial Data Fetch: Warehouses, Fiscal Years, Automatic Customer Extraction
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        setIsLoadingCustomers(true);
        const [whRes, fyRes, custRes] = await Promise.all([
          apiCall<{ success: boolean; warehouses: WarehouseItem[] }>('/sayan/warehouses', 'GET'),
          apiCall<{ success: boolean; fiscalYears: FiscalYearItem[] }>('/sayan/fiscal-years', 'GET'),
          apiCall<{ success: boolean; customers: CustomerItem[]; count?: number }>('/sayan/customers', 'GET')
        ]);

        if (whRes?.success && Array.isArray(whRes.warehouses)) {
          setWarehouses(whRes.warehouses);
          const tehran = whRes.warehouses.find(w => w.code === '15');
          if (tehran) setSelectedWarehouse('15');
          else if (whRes.warehouses.length > 0) setSelectedWarehouse(whRes.warehouses[0].code);

          const factory = whRes.warehouses.find(w => w.code === '11');
          if (factory) setSelectedDestinationWarehouse('11');
          else if (whRes.warehouses.length > 1) setSelectedDestinationWarehouse(whRes.warehouses[1].code);
        }

        if (fyRes?.success && Array.isArray(fyRes.fiscalYears) && fyRes.fiscalYears.length > 0) {
          setFiscalYears(fyRes.fiscalYears);
          const defYear = fyRes.fiscalYears.find(y => y.isDefault);
          if (defYear) setSelectedFiscalYear(defYear.code);
          else setSelectedFiscalYear(fyRes.fiscalYears[0].code);
        } else {
          // Default to current year 1405 (Code 4)
          setSelectedFiscalYear('4');
        }

        if (custRes?.success && Array.isArray(custRes.customers)) {
          setAllCustomersList(custRes.customers);
          setCustomersList(custRes.customers);
          if (!selectedCustomer && custRes.customers.length > 0) {
            // Pick default if available
            const tehranOffice = custRes.customers.find(c => c.personCode === '2471' || c.name.includes('تهران'));
            if (tehranOffice) setSelectedCustomer(tehranOffice);
            else setSelectedCustomer(custRes.customers[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load warehouses/fiscal years/customers:', err);
      } finally {
        setIsLoadingCustomers(false);
      }
    };

    fetchMetadata();
  }, []);

  // 2. Fetch Common Goods on start
  useEffect(() => {
    apiCall<{ success: boolean; items: GoodsItem[] }>('/sayan/goods/search?q=کش', 'GET')
      .then(res => {
        if (res?.success && Array.isArray(res.items) && res.items.length > 0) {
          setGoodsList(res.items);
          setActiveItemCode(res.items[0].code);
          setActiveItemName(res.items[0].name);
        }
      })
      .catch(() => {});
  }, []);

  // 3. Customer live client-side + debounced server filtering
  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomersList(allCustomersList);
      return;
    }

    const q = customerSearch.trim().toLowerCase();
    const jsNorm = q.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').replace(/أ/g, 'ا');

    const clientFiltered = allCustomersList.filter(c => {
      const n = (c.name || '').toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').replace(/أ/g, 'ا');
      return n.includes(jsNorm) || (c.personCode && c.personCode.includes(q)) || (c.tafsiliCode && c.tafsiliCode.includes(q));
    });

    setCustomersList(clientFiltered);

    // If not found in preloaded list and query is longer than 2 chars, run server search
    if (clientFiltered.length === 0 && customerSearch.trim().length >= 2) {
      const timer = setTimeout(async () => {
        setIsSearchingCustomer(true);
        try {
          const res = await apiCall<{ success: boolean; customers: CustomerItem[] }>(
            `/sayan/customers/search?q=${encodeURIComponent(customerSearch.trim())}`,
            'GET'
          );
          if (res?.success && Array.isArray(res.customers)) {
            setCustomersList(res.customers);
          }
        } catch (e) {
          console.error('Customer server search error:', e);
        } finally {
          setIsSearchingCustomer(false);
        }
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [customerSearch, allCustomersList]);

  // Keep scanner input focused when continuous mode is active
  useEffect(() => {
    if (activeSubTab === 'issuer' && isContinuousScan) {
      const focusTimer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(focusTimer);
    }
  }, [activeSubTab, isContinuousScan, items.length]);

  // Load Archive on tab switch
  useEffect(() => {
    if (activeSubTab === 'archive') {
      loadArchive();
    }
  }, [activeSubTab]);

  const loadArchive = async () => {
    setIsLoadingArchive(true);
    try {
      const res = await apiCall<{ success: boolean; archive: ArchiveRecord[] }>('/sayan/sales-remittances/archive', 'GET');
      if (res?.success && Array.isArray(res.archive)) {
        setArchiveList(res.archive);
      }
    } catch (err) {
      console.error('Load archive error:', err);
    } finally {
      setIsLoadingArchive(false);
    }
  };

  // Fetch warehouse live statistics
  const loadWarehouseStats = async (fy = selectedFiscalYear) => {
    setIsLoadingStats(true);
    try {
      const res = await apiCall<{ success: boolean; stats: LiveWarehouseStat[] }>(`/sayan/warehouses/live-stats?fiscalYear=${fy}`, 'GET');
      if (res?.success && Array.isArray(res.stats)) {
        setWarehouseStats(res.stats);
      }
    } catch (err) {
      console.error('Load warehouse stats error:', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Fetch recent documents for selected warehouse
  const loadWarehouseDocuments = async (whCode = selectedStatWarehouse, fy = selectedFiscalYear) => {
    if (!whCode) return;
    setIsLoadingRecentDocs(true);
    try {
      const res = await apiCall<{ success: boolean; documents: WarehouseRecentDoc[] }>(`/sayan/warehouses/${whCode}/documents?fiscalYear=${fy}&limit=30`, 'GET');
      if (res?.success && Array.isArray(res.documents)) {
        setRecentDocs(res.documents);
      }
    } catch (err) {
      console.error('Load warehouse documents error:', err);
    } finally {
      setIsLoadingRecentDocs(false);
    }
  };

  // Effect for warehouse stats tab
  useEffect(() => {
    if (activeSubTab === 'warehouses') {
      loadWarehouseStats(selectedFiscalYear);
    }
  }, [activeSubTab, selectedFiscalYear]);

  // Effect for recent documents
  useEffect(() => {
    if (activeSubTab === 'warehouses' && selectedStatWarehouse) {
      loadWarehouseDocuments(selectedStatWarehouse, selectedFiscalYear);
    }
  }, [activeSubTab, selectedStatWarehouse, selectedFiscalYear]);

  // 4. Unified Barcode Processing (Supports Physical Gun + Mobile Camera Scanner)
  const processBarcodeValue = async (rawInput: string, fromCamera = false) => {
    const raw = (rawInput || '').trim();
    if (!raw) return;

    const normalizedKey = raw.toLowerCase();

    // In camera mode, debounce the same barcode for 2.5s so holding the phone over a box
    // doesn't spam duplicate alerts while moving to the next box scans immediately
    if (fromCamera) {
      const now = Date.now();
      const lastSeen = recentCameraScansRef.current.get(normalizedKey) || 0;
      if (now - lastSeen < 2500) {
        return;
      }
      recentCameraScansRef.current.set(normalizedKey, now);
    }

    // Check duplicate in current document using ref for latest items
    const exists = itemsRef.current.some(it => it.barcode.toLowerCase() === normalizedKey);
    if (exists) {
      if (isSoundEnabled) playBeepSound('error');
      try { navigator.vibrate?.([40, 60, 40]); } catch {}
      setLastScanResult({
        text: `⚠️ بارکد «${raw}» قبلاً در این حواله اسکن شده است!`,
        success: false
      });
      if (!fromCamera) setScannedBarcode('');
      return;
    }

    if (isResolvingBarcodeRef.current) return;
    isResolvingBarcodeRef.current = true;
    setIsResolvingBarcode(true);

    try {
      const res = await apiCall<any>('/sayan/barcode/lookup', 'POST', {
        barcode: raw,
        warehouseCode: selectedWarehouse,
        fiscalYear: selectedFiscalYear
      });

      if (res && res.success) {
        // Double-check duplicate after async resolution
        if (itemsRef.current.some(it => it.barcode.toLowerCase() === normalizedKey)) {
          return;
        }

        const itemCode = res.itemCode || activeItemCode;
        const itemName = res.itemName || activeItemName;
        const netWeight = res.netWeight > 0 ? res.netWeight : 14.5;
        const grossWeight = res.grossWeight > 0 ? res.grossWeight : Number((netWeight + 4.35).toFixed(2));

        const newItem: RemittanceItemRow = {
          id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          barcode: raw,
          batch: res.batch || raw,
          itemCode,
          itemName,
          netWeight,
          grossWeight,
          cartonCount: res.cartonCount || 1,
          bobbinCount: res.bobbinCount || 56,
          grade: res.grade || 'A',
          twistDirection: res.twistDirection || 'Z',
          rawGrade: res.rawGrade || '00011002',
          rawTwist: res.rawTwist || '00021001',
          note: res.note || `سری ساخت: ${raw} | همبافت:  | تعداد بوبین: 56 | تعداد کارتن: 1 | گرید: 00011002 | جهت تاب: 00021001 | وزن ناخالص: ${grossWeight}`
        };

        setItems(prev => {
          const next = [newItem, ...prev];
          itemsRef.current = next;
          return next;
        });

        if (isSoundEnabled) playBeepSound('success');
        try { navigator.vibrate?.(70); } catch {}

        if (fromCamera) {
          setCameraScanFlash(true);
          setTimeout(() => setCameraScanFlash(false), 320);
        }

        setLastScanResult({
          text: `✅ کارتن ${raw} با وزن خالص ${netWeight} کیلوگرم اضافه شد.`,
          success: true,
          item: newItem
        });
      } else {
        throw new Error('خطا در تحلیل بارکد');
      }
    } catch (err: any) {
      if (isSoundEnabled) playBeepSound('error');
      setLastScanResult({
        text: `❌ خطا در استعلام بارکد: ${err.message || 'نامشخص'}`,
        success: false
      });
    } finally {
      isResolvingBarcodeRef.current = false;
      setIsResolvingBarcode(false);
      if (!fromCamera) {
        setScannedBarcode('');
        if (isContinuousScan && !isCameraScannerOpen) {
          setTimeout(() => barcodeInputRef.current?.focus(), 50);
        }
      }
    }
  };

  const handleBarcodeSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await processBarcodeValue(scannedBarcode, false);
  };

  // 4b. Mobile Camera Scanner Lifecycle (Auto-Torch, Toggle Torch, Low-CPU Hardware Accelerated Loop)
  const applyTorchState = async (stream: MediaStream | null, turnOn: boolean): Promise<boolean> => {
    if (!stream) return false;
    const track = stream.getVideoTracks()[0];
    if (!track) return false;
    try {
      await track.applyConstraints({
        advanced: [{ torch: turnOn } as any]
      });
      setIsTorchOn(turnOn);
      setIsTorchSupported(true);
      return true;
    } catch {
      try {
        await (track as any).applyConstraints({ torch: turnOn });
        setIsTorchOn(turnOn);
        setIsTorchSupported(true);
        return true;
      } catch {
        return false;
      }
    }
  };

  const toggleCameraTorch = async () => {
    const nextState = !isTorchOn;
    const ok = await applyTorchState(cameraStreamRef.current, nextState);
    if (!ok) {
      setLastScanResult({
        text: '⚠️ تغییر وضعیت فلش روی دوربین این دستگاه توسط مرورگر پشتیبانی نشد.',
        success: false
      });
    }
  };

  const stopCameraScanner = () => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (cameraStreamRef.current) {
      // Turn off torch cleanly before stopping tracks
      const track = cameraStreamRef.current.getVideoTracks()[0];
      if (track) {
        try {
          track.applyConstraints({ advanced: [{ torch: false } as any] }).catch(() => {});
        } catch {}
      }
      cameraStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    isFrameBusyRef.current = false;
    setIsTorchOn(false);
    setIsCameraScannerOpen(false);
    setIsCameraCustomerPickerOpen(false);
  };

  const startCameraScanner = async () => {
    setCameraError(null);
    setIsCameraScannerOpen(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('مرورگر یا دستگاه شما به دوربین دسترسی ندارد (نیازمند HTTPS یا دسترسی دوربین در اپ).');
      }

      // Stop any existing stream first
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(t => t.stop());
      }

      // Request 720p @ max 24fps rear camera to ensure crisp barcode edges with minimal CPU/battery load
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 24, max: 30 }
        },
        audio: false
      });

      cameraStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play().catch(() => {});
      }

      // Configure continuous autofocus + auto turn ON flashlight (torch)
      const track = stream.getVideoTracks()[0];
      if (track) {
        const caps = (track.getCapabilities ? track.getCapabilities() : {}) as any;
        if (caps?.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          try {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
          } catch {}
        }

        // Attempt auto-torch immediately, then retry after 350ms once Android camera sensor is warm
        const immediateTorch = await applyTorchState(stream, true);
        if (!immediateTorch) {
          setTimeout(async () => {
            if (cameraStreamRef.current === stream) {
              const delayedTorch = await applyTorchState(stream, true);
              if (!delayedTorch && caps && caps.torch === undefined) {
                setIsTorchSupported(false);
              }
            }
          }, 350);
        }
      }

      // Initialize hardware-accelerated BarcodeDetector if available (Android WebView / Chrome)
      let nativeDetector: any = null;
      if ('BarcodeDetector' in window) {
        try {
          const BarcodeDetectorClass = (window as any).BarcodeDetector;
          const supportedFormats = await BarcodeDetectorClass.getSupportedFormats?.().catch(() => null);
          const desiredFormats = [
            'code_128',
            'code_39',
            'code_93',
            'ean_13',
            'ean_8',
            'itf',
            'qr_code',
            'data_matrix',
            'upc_a',
            'upc_e',
            'codabar',
            'pdf417'
          ];
          const formatsToUse = Array.isArray(supportedFormats) && supportedFormats.length > 0
            ? desiredFormats.filter(f => supportedFormats.includes(f))
            : desiredFormats;

          nativeDetector = new BarcodeDetectorClass({
            formats: formatsToUse.length > 0 ? formatsToUse : undefined
          });
        } catch {
          try {
            nativeDetector = new (window as any).BarcodeDetector();
          } catch {
            nativeDetector = null;
          }
        }
      }

      // Throttled 140ms (~7 FPS) single-flight scan loop: instant response like a physical scanner, <4% CPU load
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
      }

      scanIntervalRef.current = window.setInterval(async () => {
        if (
          document.hidden ||
          isFrameBusyRef.current ||
          isResolvingBarcodeRef.current ||
          !videoRef.current ||
          videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA
        ) {
          return;
        }

        isFrameBusyRef.current = true;
        try {
          const videoEl = videoRef.current;

          // 1. Hardware-accelerated native BarcodeDetector (1D + 2D barcodes directly from video element)
          if (nativeDetector) {
            try {
              const detected = await nativeDetector.detect(videoEl);
              if (Array.isArray(detected) && detected.length > 0) {
                const validHit = detected.find((d: any) => d?.rawValue && String(d.rawValue).trim().length >= 3);
                if (validHit) {
                  await processBarcodeValue(String(validHit.rawValue).trim(), true);
                  isFrameBusyRef.current = false;
                  return;
                }
              }
            } catch {
              // Fall through to lightweight ROI canvas
            }
          }

          // 2. Lightweight cropped center Region-of-Interest (ROI) canvas fallback (360x220 max)
          if (canvasRef.current && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              const cropW = Math.min(videoEl.videoWidth, Math.floor(videoEl.videoWidth * 0.8));
              const cropH = Math.min(videoEl.videoHeight, Math.floor(videoEl.videoHeight * 0.45));
              const sx = Math.floor((videoEl.videoWidth - cropW) / 2);
              const sy = Math.floor((videoEl.videoHeight - cropH) / 2);

              const targetW = 360;
              const targetH = 200;
              if (canvas.width !== targetW) canvas.width = targetW;
              if (canvas.height !== targetH) canvas.height = targetH;

              ctx.drawImage(videoEl, sx, sy, cropW, cropH, 0, 0, targetW, targetH);
              const imageData = ctx.getImageData(0, 0, targetW, targetH);
              const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
              });

              if (qrCode && qrCode.data && qrCode.data.trim().length >= 3) {
                await processBarcodeValue(qrCode.data.trim(), true);
              }
            }
          }
        } catch {
          // Ignore single frame errors
        } finally {
          isFrameBusyRef.current = false;
        }
      }, 140);
    } catch (err: any) {
      console.error('Camera start error:', err);
      setCameraError(err?.message || 'خطا در باز کردن دوربین گوشی. لطفاً مجوز دوربین را بررسی کنید.');
    }
  };

  // Auto-open camera if requested via prop, and always clean up camera tracks on unmount
  useEffect(() => {
    if (autoStartCamera) {
      startCameraScanner();
    }
    return () => {
      if (scanIntervalRef.current) window.clearInterval(scanIntervalRef.current);
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(t => {
          try { t.stop(); } catch {}
        });
      }
    };
  }, []);

  // 5. KPIs
  const totalNetWeight = useMemo(() => {
    return Number(items.reduce((s, it) => s + (Number(it.netWeight) || 0), 0).toFixed(2));
  }, [items]);

  const totalGrossWeight = useMemo(() => {
    return Number(items.reduce((s, it) => s + (Number(it.grossWeight) || 0), 0).toFixed(2));
  }, [items]);

  const totalCartons = useMemo(() => {
    return items.reduce((s, it) => s + (Number(it.cartonCount) || 1), 0);
  }, [items]);

  const totalBobbins = useMemo(() => {
    return items.reduce((s, it) => s + (Number(it.bobbinCount) || 56), 0);
  }, [items]);

  // 6. Submit Remittance directly to Sayan
  const handleRegisterInSayan = async () => {
    setErrorMsg(null);
    if (!selectedCustomer) {
      setErrorMsg('لطفاً ابتدا خریدار / طرف‌حساب را انتخاب نمایید.');
      if (isCameraScannerOpen) {
        setIsCameraCustomerPickerOpen(true);
      }
      return;
    }
    if (items.length === 0) {
      setErrorMsg('حداقل یک کارتن یا قلم کالا برای صدور حواله باید اسکن شود.');
      return;
    }

    const opTitle = operationType === '25' ? 'حواله بین انبار' : 'حواله فروش';
    const confirmText = `آیا از صدور قطعی ${opTitle} در سایان برای «${selectedCustomer.name}» با ${items.length} کارتن (مجموع وزن خالص: ${totalNetWeight.toLocaleString('fa-IR')} کیلوگرم) اطمینان دارید؟`;
    if (!window.confirm(confirmText)) return;

    if (isCameraScannerOpen) {
      stopCameraScanner();
    }

    setIsSubmitting(true);
    try {
      const payload = {
        fiscalYear: selectedFiscalYear,
        opCode: operationType,
        warehouseCode: selectedWarehouse,
        customerCode: selectedCustomer.personCode,
        customerName: selectedCustomer.name,
        remittanceDate,
        subCode,
        notes: headerNotes,
        items
      };

      const res = await apiCall<any>('/sayan/sales-remittances/create', 'POST', payload);

      if (res && res.success) {
        const resultData = {
          ...res,
          opCode: operationType,
          opName: opTitle,
          customerName: selectedCustomer.name,
          warehouseName: warehouses.find(w => w.code === selectedWarehouse)?.name || `انبار ${selectedWarehouse}`,
          totalNetWeight,
          totalCartons,
          totalBobbins,
          remittanceDate,
          items: [...items]
        };
        setSuccessResult(resultData);
        if (onSuccessRegistered) {
          onSuccessRegistered(res.docNo, resultData);
        }
        loadArchive();
      } else {
        throw new Error(res?.message || 'خطا در ثبت حواله در پایگاه داده سایان');
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setErrorMsg(err.message || 'خطای شبکه در ارتباط با سرور سایان');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset for next remittance
  const handleStartNextRemittance = () => {
    setSuccessResult(null);
    setItems([]);
    setLastScanResult(null);
    setHeaderNotes('');
    setSubCode('');
    setErrorMsg(null);
    if (isContinuousScan) {
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  };

  const handleShareToChat = (record: any) => {
    const title = record.opCode === '25' ? 'حواله بین انبار' : 'حواله فروش';
    openSendToChat({
      title: `ارسال ${title} به گفتگو`,
      defaultMessage: `📄 ${title} رسمی سایان ERP شماره #${record.docNo || record.DocNo} (فرعی ${record.subNo || '-'})
👤 تحویل‌گیرنده / خریدار: ${record.customerName || record.personFullName || 'شخص'}
🏢 انبار مبدا: ${record.warehouseName || record.storeId || 'انبار'}
📅 تاریخ: ${record.shamsiDate || record.remittanceDate}
📦 تعداد کارتن: ${record.totalCartons || record.itemsCount} کارتن
⚖️ وزن خالص: ${Number(record.totalNetWeight || 0).toLocaleString('fa-IR')} کیلوگرم
✅ صادر شده به صورت لایو از نرم‌افزار سازمانی`
    });
  };

  // Filtered Archive
  const filteredArchive = useMemo(() => {
    if (!archiveSearch.trim()) return archiveList;
    const q = archiveSearch.trim().toLowerCase();
    return archiveList.filter(r => 
      r.docNo.includes(q) ||
      (r.customerName && r.customerName.toLowerCase().includes(q)) ||
      (r.customerCode && r.customerCode.includes(q)) ||
      (r.notes && r.notes.toLowerCase().includes(q))
    );
  }, [archiveList, archiveSearch]);

  return (
    <div className="flex flex-col min-h-full bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-100 select-text" dir="rtl">
      {/* Top Banner Navigation: Compact on mobile, rich on desktop */}
      <div className="flex-none p-2.5 sm:p-4 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
        {/* Desktop View */}
        <div className="hidden sm:flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Barcode size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm md:text-base font-black tracking-tight text-slate-900 dark:text-white">
                  سامانه صدور حواله فروش و خروج انبار (لایو سایان ERP)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>اتصال زنده</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                صدور فوق‌سریع حواله فروش با بارکدخوان فیزیکی و ثبت اتوماتیک در دیتابیس سایان بدون فریز یا کندی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="p-1 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center gap-1">
              <button
                onClick={() => setActiveSubTab('issuer')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubTab === 'issuer' 
                    ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs' 
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                }`}
              >
                <Package size={14} />
                <span>صدور حواله با بارکدخوان</span>
              </button>
              <button
                onClick={() => setActiveSubTab('archive')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubTab === 'archive' 
                    ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs' 
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                }`}
              >
                <History size={14} />
                <span>بایگانی حواله‌ها ({archiveList.length})</span>
              </button>
              <button
                onClick={() => setActiveSubTab('warehouses')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeSubTab === 'warehouses' 
                    ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs' 
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                }`}
              >
                <Building2 size={14} />
                <span>انبارها و آمار زنده سایان</span>
              </button>
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                title="بستن"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Mobile View: Sleek, compact and native feeling */}
        <div className="sm:hidden space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Barcode size={15} />
              </div>
              <span className="text-xs font-black text-slate-900 dark:text-white">
                حواله سایان ERP
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[9px] font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>زنده</span>
              </span>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Segmented 3-part tab strip on mobile */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-zinc-800">
            <button
              onClick={() => setActiveSubTab('issuer')}
              className={`py-1.5 px-1 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition-all ${
                activeSubTab === 'issuer'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              <Package size={13} />
              <span>صدور حواله</span>
            </button>
            <button
              onClick={() => setActiveSubTab('archive')}
              className={`py-1.5 px-1 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition-all ${
                activeSubTab === 'archive'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              <History size={13} />
              <span>بایگانی ({archiveList.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('warehouses')}
              className={`py-1.5 px-1 rounded-lg text-[11px] font-black flex items-center justify-center gap-1 transition-all ${
                activeSubTab === 'warehouses'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              <Building2 size={13} />
              <span>انبارها</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      {activeSubTab === 'issuer' ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Header Controls: Warehouse, Fiscal Year, Customer, Date */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-4">
            
            {/* Top Bar of Card: Operation Type Selector & Description */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800 text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-zinc-300">
                <Layers size={16} className={operationType === '25' ? "text-purple-600" : "text-blue-600"} />
                <span>نوع و مشخصات سند انبار (مطابق منوی عملیات سایان ERP)</span>
              </div>

              {/* Operation Type Switcher: 23 (فروش) / 25 (بین انبار) */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setOperationType('23')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                    operationType === '23'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                >
                  <Package size={14} />
                  <span>حواله فروش (کد ۲۳)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOperationType('25');
                    if (!selectedCustomer) {
                      setSelectedCustomer({
                        personCode: '2471',
                        name: 'دفتر تهران-لپان بافت',
                        tafsiliCode: '112471',
                        levelCode: '11'
                      });
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${
                    operationType === '25'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900'
                  }`}
                >
                  <ArrowRight size={14} />
                  <span>حواله بین انبار (کد ۲۵)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* 1. Warehouse Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-zinc-400 mb-1">
                  {operationType === '25' ? 'انبار مبدا (فرستنده) *' : 'انبار مبدا (تحویل کالا) *'}
                </label>
                <div className="relative">
                  <select
                    value={selectedWarehouse}
                    onChange={(e) => setSelectedWarehouse(e.target.value)}
                    className="w-full h-10 px-3 pr-9 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500 transition-all cursor-pointer"
                  >
                    {warehouses.map((w) => (
                      <option key={w.code} value={w.code}>
                        کد {w.code} - {w.name}
                      </option>
                    ))}
                  </select>
                  <Warehouse className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              {/* 2. Fiscal Year Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-zinc-400 mb-1">
                  سال مالی سایان *
                </label>
                <select
                  value={selectedFiscalYear}
                  onChange={(e) => setSelectedFiscalYear(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500 transition-all cursor-pointer font-mono"
                >
                  {fiscalYears.map((fy) => (
                    <option key={fy.code} value={fy.code}>
                      {fy.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Customer / Destination Store Selection */}
              <div className="relative" ref={customerDropdownRef}>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-600 dark:text-zinc-400">
                    {operationType === '25' ? 'انبار مقصد (تحویل‌گیرنده) *' : 'مشتری / خریدار (انتخاب از سایان) *'}
                  </label>
                  {operationType === '23' && allCustomersList.length > 0 && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                      {allCustomersList.length} مشتری آماده
                    </span>
                  )}
                </div>

                {operationType === '25' ? (
                  /* Destination Warehouse selector for inter-warehouse transfers */
                  <div className="relative">
                    <select
                      value={selectedDestinationWarehouse}
                      onChange={(e) => {
                        const code = e.target.value;
                        setSelectedDestinationWarehouse(code);
                        const targetWh = warehouses.find(w => w.code === code);
                        setSelectedCustomer({
                          personCode: code === '15' ? '2471' : code,
                          name: targetWh ? targetWh.name : `انبار کد ${code}`,
                          tafsiliCode: code,
                          levelCode: '11'
                        });
                      }}
                      className="w-full h-10 px-3 pr-9 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-950/30 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-purple-500 transition-all cursor-pointer"
                    >
                      {warehouses
                        .filter(w => w.code !== selectedWarehouse)
                        .map((w) => (
                          <option key={w.code} value={w.code}>
                            کد {w.code} - {w.name}
                          </option>
                        ))}
                    </select>
                    <Building2 className="w-4 h-4 text-purple-600 absolute right-3 top-3 pointer-events-none" />
                  </div>
                ) : (
                  /* Live Customer Search & Select Combobox */
                  <div className="relative">
                    <div 
                      onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                      className="w-full h-10 px-3 pr-9 pl-8 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-bold text-slate-900 dark:text-white outline-none focus-within:border-blue-500 transition-all cursor-pointer flex items-center justify-between"
                    >
                      <span className={selectedCustomer ? "text-slate-900 dark:text-white font-bold truncate" : "text-slate-400"}>
                        {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.personCode})` : 'انتخاب مشتری از پایگاه سایان...'}
                      </span>
                      <ChevronDown size={15} className={`text-slate-400 transition-transform ${isCustomerDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>
                    <User className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    
                    {selectedCustomer && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomer(null);
                          setCustomerSearch('');
                          setIsCustomerDropdownOpen(true);
                        }}
                        className="absolute left-7 top-2.5 p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400"
                        title="پاک کردن انتخاب"
                      >
                        <X size={14} />
                      </button>
                    )}

                    {/* Rich Searchable Dropdown */}
                    {isCustomerDropdownOpen && (
                      <div className="absolute z-50 top-full mt-1 w-full max-h-72 bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-700 p-2 flex flex-col gap-2">
                        {/* Search Input inside dropdown */}
                        <div className="relative">
                          <input
                            type="text"
                            autoFocus
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            placeholder="جستجوی نام یا کد تفصیلی مشتری..."
                            className="w-full h-8 px-2.5 pr-8 rounded-lg bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <Search size={13} className="text-slate-400 absolute right-2.5 top-2.5" />
                          {isSearchingCustomer && (
                            <Loader2 size={13} className="text-blue-500 animate-spin absolute left-2.5 top-2.5" />
                          )}
                        </div>

                        {/* Customer Items List */}
                        <div className="flex-1 overflow-y-auto max-h-52 divide-y divide-slate-100 dark:divide-zinc-700/60 custom-scrollbar">
                          {customersList.length === 0 ? (
                            <div className="p-4 text-center text-xs text-slate-400">
                              {isSearchingCustomer ? 'در حال جستجو در سایان...' : 'مشتری با این مشخصات یافت نشد.'}
                            </div>
                          ) : (
                            customersList.map((c) => {
                              const isSelected = selectedCustomer?.personCode === c.personCode;
                              return (
                                <button
                                  key={c.personCode}
                                  type="button"
                                  onClick={() => {
                                    setSelectedCustomer(c);
                                    setIsCustomerDropdownOpen(false);
                                    setCustomerSearch('');
                                  }}
                                  className={`w-full p-2 text-right rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                    isSelected 
                                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-black'
                                      : 'hover:bg-slate-100 dark:hover:bg-zinc-700/60 text-slate-800 dark:text-zinc-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 flex items-center justify-center text-[10px] shrink-0 font-bold">
                                      {c.name.slice(0, 1)}
                                    </div>
                                    <span className="truncate">{c.name}</span>
                                  </div>
                                  <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded shrink-0">
                                    کد {c.personCode}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Remittance Date */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-zinc-400 mb-1">
                  تاریخ صدور حواله
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={remittanceDate}
                    onChange={(e) => setRemittanceDate(e.target.value)}
                    placeholder="1404/07/13"
                    className="w-full h-10 px-3 pr-9 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-bold text-slate-900 dark:text-white font-mono outline-none focus:border-blue-500 transition-all text-left dir-ltr"
                  />
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* SubCode & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">
                  کد فرعی حواله (اختیاری)
                </label>
                <input
                  type="text"
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  placeholder="مثال: ۹۹۸ یا بارنامه"
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1">
                  توضیحات و یادداشت سربرگ حواله
                </label>
                <input
                  type="text"
                  value={headerNotes}
                  onChange={(e) => setHeaderNotes(e.target.value)}
                  placeholder="توضیحات راننده، آدرس باربری یا شرایط تحویل..."
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Barcode Scanner Station */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  <Barcode size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">ایستگاه اسکن بارکد کارتن‌ها (بارکدخوان فیزیکی و دوربین گوشی)</h3>
                  <p className="text-[11px] text-blue-200">
                    کارتن‌ها را با بارکدخوان یا دوربین گوشی (وب موبایل و اندروید با فلش خودکار) به صورت متوالی اسکن کنید.
                  </p>
                </div>
              </div>

              {/* Toggles & Mobile Camera Launch Button */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={startCameraScanner}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/30 transition-all active:scale-95 cursor-pointer"
                >
                  <Camera size={16} className="stroke-[2.5]" />
                  <span>اسکن سریع با دوربین گوشی (فلش خودکار)</span>
                  <Zap size={14} className="fill-slate-950" />
                </button>

                <label className="flex items-center gap-1.5 text-xs text-blue-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isContinuousScan}
                    onChange={(e) => setIsContinuousScan(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span>اسکن متوالی خودکار</span>
                </label>

                <button
                  type="button"
                  onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                  className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                    isSoundEnabled 
                      ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300' 
                      : 'bg-white/10 border-white/20 text-slate-400'
                  }`}
                  title="صدای تایید اسکن"
                >
                  {isSoundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                  <span>{isSoundEnabled ? 'صدا فعال' : 'بی‌صدا'}</span>
                </button>
              </div>
            </div>

            {/* Scanner Input Bar */}
            <form onSubmit={handleBarcodeSubmit} className="flex flex-wrap sm:flex-nowrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={scannedBarcode}
                  onChange={(e) => setScannedBarcode(e.target.value)}
                  placeholder="اسکن بارکد یا تایپ بچ (مثال: PO-F-6986-5-14.35)..."
                  disabled={isResolvingBarcode}
                  className="w-full h-12 pr-11 pl-4 rounded-xl bg-white/10 border-2 border-blue-400/40 focus:border-blue-300 text-white placeholder-blue-300/60 font-mono text-sm sm:text-base font-bold outline-none transition-all dir-ltr text-left"
                />
                <Barcode className="w-5 h-5 text-blue-300 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>
              <button
                type="submit"
                disabled={isResolvingBarcode || !scannedBarcode.trim()}
                className="px-5 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isResolvingBarcode ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                <span>ثبت ردیف</span>
              </button>
              <button
                type="button"
                onClick={startCameraScanner}
                className="sm:hidden w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-amber-500/25 active:scale-95"
              >
                <Camera size={17} />
                <span>باز کردن دوربین بارکدخوان گوشی با فلش خودکار</span>
              </button>
            </form>

            {/* Live Scan Notification */}
            {lastScanResult && (
              <div className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                lastScanResult.success 
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200' 
                  : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
              }`}>
                {lastScanResult.text}
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Boxes size={18} className="text-blue-600" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  اقلام و کارتن‌های اسکن‌شده در این حواله ({items.length} کارتن)
                </h3>
              </div>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('آیا از پاک کردن تمامی ردیف‌های اسکن‌شده اطمینان دارید؟')) {
                      setItems([]);
                      setLastScanResult(null);
                    }
                  }}
                  className="px-2.5 py-1 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg font-bold transition-colors"
                >
                  پاکسازی کل لیست
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="py-16 text-center text-slate-400 dark:text-zinc-500 border border-dashed rounded-2xl border-slate-200 dark:border-zinc-800 space-y-2">
                <Barcode className="w-12 h-12 mx-auto text-slate-300 dark:text-zinc-700" />
                <p className="text-sm font-bold">هنوز هیچ کارتنی اسکن نشده است.</p>
                <p className="text-xs text-slate-400">
                  بارکدخوان خود را روی برچسب کارتن قرار داده و شلیک کنید تا وزن و اطلاعات به‌صورت اتوماتیک ثبت شود.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-700">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-black border-b border-slate-200 dark:border-zinc-700">
                    <tr>
                      <th className="py-2.5 px-3 text-center w-12">#</th>
                      <th className="py-2.5 px-3 font-mono">بارکد / سری ساخت</th>
                      <th className="py-2.5 px-3">کد و شرح کالا</th>
                      <th className="py-2.5 px-3 text-left">وزن خالص (kg)</th>
                      <th className="py-2.5 px-3 text-left">وزن ناخالص (kg)</th>
                      <th className="py-2.5 px-3 text-center">کارتن</th>
                      <th className="py-2.5 px-3 text-center">بوبین</th>
                      <th className="py-2.5 px-3 text-center">گرید / تاب</th>
                      <th className="py-2.5 px-3">مشخصات تکمیلی</th>
                      <th className="py-2.5 px-3 text-center w-12">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {items.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-blue-50/40 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="py-2.5 px-3 text-center font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white dir-ltr text-right">
                          {row.barcode}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-900 dark:text-white block">{row.itemName}</span>
                          <span className="font-mono text-[10px] text-slate-400 block">{row.itemCode}</span>
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-black text-blue-600 dark:text-blue-400 text-sm">
                          {row.netWeight.toLocaleString('fa-IR')}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-medium text-slate-600 dark:text-zinc-400">
                          {row.grossWeight.toLocaleString('fa-IR')}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold">{row.cartonCount}</td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-600 dark:text-zinc-400">{row.bobbinCount}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 font-mono font-bold text-[10px]">
                            {row.grade} / {row.twistDirection}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 text-[11px] truncate max-w-[200px]" title={row.note}>
                          {row.note}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setItems(prev => prev.filter(it => it.id !== row.id))}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="حذف ردیف"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                <span className="text-[11px] font-bold text-blue-600 dark:text-blue-300 block">مجموع وزن خالص</span>
                <span className="text-lg sm:text-2xl font-black font-mono text-blue-900 dark:text-blue-100 mt-1 block">
                  {totalNetWeight.toLocaleString('fa-IR')} <span className="text-xs font-normal">کیلوگرم</span>
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50">
                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300 block">مجموع وزن ناخالص</span>
                <span className="text-lg sm:text-2xl font-black font-mono text-indigo-900 dark:text-indigo-100 mt-1 block">
                  {totalGrossWeight.toLocaleString('fa-IR')} <span className="text-xs font-normal">کیلوگرم</span>
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-300 block">تعداد کارتن‌ها</span>
                <span className="text-lg sm:text-2xl font-black font-mono text-emerald-900 dark:text-emerald-100 mt-1 block">
                  {totalCartons.toLocaleString('fa-IR')} <span className="text-xs font-normal">بسته</span>
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block">تعداد بوبین‌ها</span>
                <span className="text-lg sm:text-2xl font-black font-mono text-slate-900 dark:text-white mt-1 block">
                  {totalBobbins.toLocaleString('fa-IR')} <span className="text-xs font-normal">عدد</span>
                </span>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Final Action Button */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                با کلیک روی دکمه زیر، سند خروج و حواله فروش بلافاصله در پایگاه‌داده سایان ثبت و شماره سند صادر خواهد شد.
              </span>

              <button
                type="button"
                onClick={handleRegisterInSayan}
                disabled={isSubmitting || items.length === 0}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-blue-600/30 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                <span>{isSubmitting ? 'در حال صدور و ثبت در سایان...' : 'صدور و ثبت قطعی حواله فروش در سایان'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : activeSubTab === 'archive' ? (
        /* Archive Tab */
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center gap-2">
              <History size={18} className="text-blue-600" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                بایگانی حواله‌های صادرشده ({filteredArchive.length} مورد)
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <input
                  type="text"
                  value={archiveSearch}
                  onChange={(e) => setArchiveSearch(e.target.value)}
                  placeholder="جستجو در شماره حواله یا خریدار..."
                  className="w-full h-9 px-3 pr-8 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs text-slate-900 dark:text-white outline-none"
                />
                <Search size={14} className="text-slate-400 absolute right-2.5 top-2.5" />
              </div>

              <button
                type="button"
                onClick={loadArchive}
                disabled={isLoadingArchive}
                className="p-2 rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors"
                title="تازه سازی"
              >
                <Loader2 size={16} className={isLoadingArchive ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {filteredArchive.length === 0 ? (
            <div className="py-16 text-center text-slate-400 border border-dashed rounded-2xl border-slate-200 dark:border-zinc-800">
              هیچ حواله ثبتی در بایگانی یافت نشد.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredArchive.map((rec) => (
                <div
                  key={rec.id}
                  className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs hover:border-blue-400 transition-all space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-mono font-black text-sm border border-blue-200 dark:border-blue-800">
                        شماره حواله #{rec.docNo}
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-slate-900 dark:text-white">{rec.customerName}</h4>
                        <span className="text-[11px] text-slate-400">کد تفصیلی: {rec.customerCode} • فرعی: {rec.subNo}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleShareToChat(rec)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Send size={13} />
                        <span>ارسال به گفتگو</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPrintModalRecord(rec)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Printer size={13} />
                        <span>چاپ سند رسمی</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-100 dark:border-zinc-800/60 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">تاریخ صدور:</span>
                      <span className="font-bold font-mono">{rec.shamsiDate}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">مجموع وزن خالص:</span>
                      <span className="font-black font-mono text-blue-600 dark:text-blue-400">
                        {rec.totalNetWeight.toLocaleString('fa-IR')} kg
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">تعداد کارتن:</span>
                      <span className="font-bold font-mono">{rec.totalCartons} بسته</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">ثبت‌کننده:</span>
                      <span className="font-medium">{rec.createdBy}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Live Sayan Warehouses & Stock Metrics SubTab */
        <div className="flex-1 md:overflow-y-auto p-2.5 sm:p-5 space-y-3 sm:space-y-4">
          {/* Top Bar: Title, Fiscal Year Selector, Live Refresh */}
          <div className="p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">
                <Building2 size={18} className="sm:hidden" />
                <Building2 size={22} className="hidden sm:block" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs sm:text-base font-black text-slate-900 dark:text-white">
                    وضعیت و آمار زنده انبارهای سایان ERP
                  </h3>
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[9px] sm:text-[10px] font-mono font-bold">
                    STR_TBL_001
                  </span>
                </div>
                <p className="hidden sm:block text-xs text-slate-500 dark:text-zinc-400">
                  اتصال مستقیم به ۸ انبار فعال کارخانه و دفاتر با تفکیک سال مالی
                </p>
              </div>
            </div>

            {/* Fiscal Year & Refresh Action */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] sm:text-xs font-bold text-slate-600 dark:text-zinc-300">
                  سال مالی سایان:
                </label>
                <select
                  value={selectedFiscalYear}
                  onChange={(e) => setSelectedFiscalYear(e.target.value)}
                  className="h-8 sm:h-9 px-2 sm:px-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg sm:rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {fiscalYears.map(fy => (
                    <option key={fy.code} value={fy.code}>{fy.title}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  loadWarehouseStats(selectedFiscalYear);
                  if (selectedStatWarehouse) loadWarehouseDocuments(selectedStatWarehouse, selectedFiscalYear);
                }}
                disabled={isLoadingStats}
                className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={13} className={isLoadingStats ? 'animate-spin' : ''} />
                <span>{isLoadingStats ? 'دریافت...' : 'به‌روزرسانی'}</span>
              </button>
            </div>
          </div>

          {/* Top KPI Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/40 dark:from-blue-950/40 dark:to-blue-900/20 border border-blue-200/80 dark:border-blue-800/60 shadow-xs">
              <span className="text-[10px] sm:text-[11px] font-bold text-blue-700 dark:text-blue-300 block">تعداد کل انبارها</span>
              <span className="text-base sm:text-2xl font-black font-mono text-blue-950 dark:text-blue-100 mt-0.5 block">
                {warehouseStats.length || 8} انبار
              </span>
              <span className="text-[9px] sm:text-[10px] text-blue-600/80 dark:text-blue-400 mt-0.5 block">پایگاه داده سایان</span>
            </div>

            <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/40 dark:from-emerald-950/40 dark:to-emerald-900/20 border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs">
              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 dark:text-emerald-300 block">کل وزن گردش سال مالی</span>
              <span className="text-base sm:text-2xl font-black font-mono text-emerald-950 dark:text-emerald-100 mt-0.5 block">
                {Math.round(warehouseStats.reduce((s, w) => s + (w.totalQty || 0), 0)).toLocaleString('fa-IR')} <span className="text-[10px] sm:text-xs font-normal">ک‌گ</span>
              </span>
              <span className="text-[9px] sm:text-[10px] text-emerald-600/80 dark:text-emerald-400 mt-0.5 block">تراکنش‌های انبار</span>
            </div>

            <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100/40 dark:from-purple-950/40 dark:to-purple-900/20 border border-purple-200/80 dark:border-purple-800/60 shadow-xs">
              <span className="text-[10px] sm:text-[11px] font-bold text-purple-700 dark:text-purple-300 block">کل اسناد انبار</span>
              <span className="text-base sm:text-2xl font-black font-mono text-purple-950 dark:text-purple-100 mt-0.5 block">
                {warehouseStats.reduce((s, w) => s + (w.docsCount || 0), 0).toLocaleString('fa-IR')} <span className="text-[10px] sm:text-xs font-normal">سند</span>
              </span>
              <span className="text-[9px] sm:text-[10px] text-purple-600/80 dark:text-purple-400 mt-0.5 block">STR_TBL_010</span>
            </div>

            <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/40 dark:from-amber-950/40 dark:to-amber-900/20 border border-amber-200/80 dark:border-amber-800/60 shadow-xs">
              <span className="text-[10px] sm:text-[11px] font-bold text-amber-700 dark:text-amber-300 block">حواله‌های فروش</span>
              <span className="text-base sm:text-2xl font-black font-mono text-amber-950 dark:text-amber-100 mt-0.5 block">
                {warehouseStats.reduce((s, w) => s + (w.salesRemittancesCount || 0), 0).toLocaleString('fa-IR')} <span className="text-[10px] sm:text-xs font-normal">حواله</span>
              </span>
              <span className="text-[9px] sm:text-[10px] text-amber-600/80 dark:text-amber-400 mt-0.5 block">عملیات فروش (۲۳)</span>
            </div>
          </div>

          {/* 8 Warehouses Interactive Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-700 dark:text-zinc-200 flex items-center gap-1.5">
                <Warehouse size={16} className="text-blue-600" />
                <span>فهرست تمام انبارها به تفکیک کد و آمار گردش (جهت انتخاب کلیک کنید)</span>
              </h4>
              <span className="text-[11px] text-slate-400">انبار فعال انتخاب شده: انبار {selectedStatWarehouse}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {warehouseStats.map((wh) => {
                const isSelected = selectedStatWarehouse === wh.code;
                return (
                  <div
                    key={wh.code}
                    onClick={() => setSelectedStatWarehouse(wh.code)}
                    className={`p-4 rounded-2xl transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                        : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800 font-mono font-black text-xs text-slate-700 dark:text-zinc-300">
                            کد {wh.code}
                          </span>
                          <span className="w-2 h-2 rounded-full bg-emerald-500" title="انبار فعال"></span>
                        </div>
                        <h4 className="font-black text-sm text-slate-900 dark:text-white mt-1.5">
                          {wh.name}
                        </h4>
                      </div>

                      <div className="w-8 h-8 rounded-xl bg-blue-100/60 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Warehouse size={16} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800/80 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">تعداد اسناد:</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">
                          {wh.docsCount.toLocaleString('fa-IR')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">حواله فروش (۲۳):</span>
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          {wh.salesRemittancesCount.toLocaleString('fa-IR')}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 block text-[10px]">کل وزن گردش:</span>
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                          {Math.round(wh.totalQty).toLocaleString('fa-IR')} کیلوگرم
                        </span>
                      </div>
                    </div>

                    {/* Quick Action Button */}
                    <div className="mt-3 pt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWarehouse(wh.code);
                          setActiveSubTab('issuer');
                          setTimeout(() => barcodeInputRef.current?.focus(), 150);
                        }}
                        className="w-full py-1.5 px-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow-xs transition-transform active:scale-95"
                      >
                        <Barcode size={13} />
                        <span>صدور حواله فروش با بارکدخوان</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Warehouse Detailed Recent Documents */}
          <div className="p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-3 sm:space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">
                  <Clock size={15} />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                    آخرین اسناد در {warehouseStats.find(w => w.code === selectedStatWarehouse)?.name || `انبار ${selectedStatWarehouse}`}
                  </h4>
                  <p className="hidden sm:block text-[11px] text-slate-400">
                    نمایش ۲۰ سند اخیر ثبت‌شده در جدول STR_TBL_010 سایان
                  </p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-44">
                  <input
                    type="text"
                    value={docsSearchQuery}
                    onChange={(e) => setDocsSearchQuery(e.target.value)}
                    placeholder="جستجو در اسناد..."
                    className="w-full h-8 px-2 pr-7 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs text-slate-900 dark:text-white outline-none"
                  />
                  <Search size={12} className="text-slate-400 absolute right-2 top-2" />
                </div>

                <select
                  value={docsOpFilter}
                  onChange={(e) => setDocsOpFilter(e.target.value)}
                  className="h-8 px-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-[11px] sm:text-xs font-bold text-slate-800 dark:text-zinc-200 outline-none"
                >
                  <option value="all">همه عملیات‌ها</option>
                  <option value="23">حواله فروش (۲۳)</option>
                  <option value="12">حواله خروج (۱۲)</option>
                  <option value="65">رسید انبار (۶۵)</option>
                  <option value="67">انتقال (۶۷)</option>
                  <option value="13">برگشت (۱۳)</option>
                </select>

                <button
                  type="button"
                  onClick={() => loadWarehouseDocuments(selectedStatWarehouse, selectedFiscalYear)}
                  disabled={isLoadingRecentDocs}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300"
                  title="تازه‌سازی اسناد"
                >
                  <RefreshCw size={14} className={isLoadingRecentDocs ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Documents Table / Cards */}
            {isLoadingRecentDocs ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <Loader2 size={24} className="animate-spin text-blue-600" />
                <span className="text-xs">در حال بارگذاری اسناد از سایان ERP...</span>
              </div>
            ) : recentDocs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 border border-dashed rounded-xl border-slate-200 dark:border-zinc-800 text-xs">
                هیچ سندی برای این انبار در سال مالی جاری یافت نشد.
              </div>
            ) : (
              <>
                {/* Mobile View: High density, clean cards */}
                <div className="sm:hidden space-y-2">
                  {recentDocs
                    .filter(d => {
                      if (docsOpFilter !== 'all' && d.opCode !== docsOpFilter) return false;
                      if (!docsSearchQuery.trim()) return true;
                      const q = docsSearchQuery.trim().toLowerCase();
                      return (
                        d.docNo.includes(q) ||
                        (d.customerName && d.customerName.toLowerCase().includes(q)) ||
                        (d.customerCode && d.customerCode.includes(q)) ||
                        (d.description && d.description.toLowerCase().includes(q))
                      );
                    })
                    .map(doc => (
                      <div key={doc.docId} className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-750 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-xs">
                              #{doc.docNo}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                              doc.opCode === '23'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : doc.opCode === '12'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-slate-200 text-slate-700 dark:bg-zinc-700 dark:text-zinc-300'
                            }`}>
                              {doc.opName}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">
                            {doc.docDate ? new Date(doc.docDate).toLocaleDateString('fa-IR') : '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {doc.customerName || doc.customerCode || 'نامشخص'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedWarehouse(doc.warehouseCode || selectedStatWarehouse);
                              setActiveSubTab('issuer');
                              setTimeout(() => barcodeInputRef.current?.focus(), 150);
                            }}
                            className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold inline-flex items-center gap-1 shrink-0 active:scale-95"
                          >
                            <Plus size={11} />
                            <span>صدور حواله</span>
                          </button>
                        </div>
                        {doc.description && (
                          <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                            {doc.description}
                          </p>
                        )}
                      </div>
                    ))}
                </div>

                {/* Desktop View: Full Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/40 text-slate-500 font-bold">
                        <th className="py-2.5 px-3">شماره سند</th>
                        <th className="py-2.5 px-3">شماره فرعی</th>
                        <th className="py-2.5 px-3">نوع عملیات انبار</th>
                        <th className="py-2.5 px-3">تاریخ ثبت</th>
                        <th className="py-2.5 px-3">طرف‌حساب / مشتری</th>
                        <th className="py-2.5 px-3">شرح سند</th>
                        <th className="py-2.5 px-3 text-center">اقدام</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {recentDocs
                        .filter(d => {
                          if (docsOpFilter !== 'all' && d.opCode !== docsOpFilter) return false;
                          if (!docsSearchQuery.trim()) return true;
                          const q = docsSearchQuery.trim().toLowerCase();
                          return (
                            d.docNo.includes(q) ||
                            (d.customerName && d.customerName.toLowerCase().includes(q)) ||
                            (d.customerCode && d.customerCode.includes(q)) ||
                            (d.description && d.description.toLowerCase().includes(q))
                          );
                        })
                        .map(doc => (
                          <tr key={doc.docId} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/50 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-black text-blue-600 dark:text-blue-400">
                              #{doc.docNo}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-zinc-400">
                              {doc.subNo || '-'}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                doc.opCode === '23'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : doc.opCode === '12'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300'
                              }`}>
                                {doc.opName}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-zinc-300 text-[11px]">
                              {doc.docDate ? new Date(doc.docDate).toLocaleDateString('fa-IR') : '-'}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                              {doc.customerName || doc.customerCode || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate" title={doc.description}>
                              {doc.description || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedWarehouse(doc.warehouseCode || selectedStatWarehouse);
                                  setActiveSubTab('issuer');
                                  setTimeout(() => barcodeInputRef.current?.focus(), 150);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-[11px] font-bold inline-flex items-center gap-1"
                                title="صدور حواله فروش جدید"
                              >
                                <Plus size={12} />
                                <span>صدور حواله</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile Camera Barcode Scanner HUD Modal (Web Mobile & Android) */}
      {isCameraScannerOpen && createPortal(
        <div className="fixed inset-0 z-[999999998] bg-slate-950 text-white flex flex-col select-none overflow-hidden" dir="rtl">
          {/* Top Bar: Title, Torch Toggle, Sound Toggle, Close */}
          <div className="flex-none px-3 py-2.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-400 flex items-center justify-center shrink-0">
                <Camera size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs sm:text-sm font-black text-white truncate">اسکنر سریع دوربین گوشی</h3>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                    کم‌مصرف و پیوسته
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">
                  دوربین را مقابل بارکد کارتن بگیرید تا خودکار ثبت شود
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Flashlight (Torch) Toggle Button */}
              <button
                type="button"
                onClick={toggleCameraTorch}
                className={`px-3 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 border transition-all active:scale-95 cursor-pointer ${
                  isTorchOn
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg shadow-amber-400/30'
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                }`}
                title="روشن / خاموش کردن فلش گوشی"
              >
                {isTorchOn ? <Zap size={15} className="fill-slate-950" /> : <ZapOff size={15} />}
                <span>{isTorchOn ? 'فلش روشن (خاموش کردن)' : 'روشن کردن فلش'}</span>
              </button>

              {/* Sound Toggle */}
              <button
                type="button"
                onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                className={`p-2 rounded-xl border transition-colors ${
                  isSoundEnabled
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
                title="صدای بوق اسکن"
              >
                {isSoundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>

              {/* Close Scanner */}
              <button
                type="button"
                onClick={stopCameraScanner}
                className="px-2.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1"
              >
                <X size={16} />
                <span className="hidden sm:inline">بستن دوربین</span>
              </button>
            </div>
          </div>

          {/* Customer & Warehouse Quick Selector Bar inside Scanner */}
          <div className="flex-none px-3 py-2 bg-slate-900/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs relative">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <User size={15} className="text-blue-400 shrink-0" />
              <span className="text-slate-400 shrink-0">مشتری سایان:</span>
              <button
                type="button"
                onClick={() => setIsCameraCustomerPickerOpen(!isCameraCustomerPickerOpen)}
                className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-right flex items-center justify-between gap-2 transition-colors"
              >
                <span className={selectedCustomer ? 'font-black text-amber-300 truncate' : 'text-rose-400 font-bold'}>
                  {selectedCustomer
                    ? `${selectedCustomer.name} (کد ${selectedCustomer.personCode})`
                    : '⚠️ انتخاب مشتری برای ثبت اسکن‌ها...'}
                </span>
                <ChevronDown size={14} className="text-slate-400 shrink-0" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700">
                انبار مبدا: <strong className="text-white">{warehouses.find(w => w.code === selectedWarehouse)?.name || `کد ${selectedWarehouse}`}</strong>
              </span>
            </div>

            {/* Dropdown Modal for Picking Customer directly inside Camera View */}
            {isCameraCustomerPickerOpen && (
              <div className="absolute top-full right-2 left-2 mt-1 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 space-y-2 max-h-72 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-white">انتخاب مشتری / طرف‌حساب سایان</span>
                  <button
                    type="button"
                    onClick={() => setIsCameraCustomerPickerOpen(false)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="جستجوی نام یا کد تفصیلی مشتری..."
                    className="w-full h-9 px-3 pr-8 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white outline-none focus:border-blue-500"
                  />
                  <Search size={14} className="text-slate-400 absolute right-2.5 top-2.5" />
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-800 max-h-48">
                  {customersList.map((c) => (
                    <button
                      key={c.personCode}
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(c);
                        setIsCameraCustomerPickerOpen(false);
                        setErrorMsg(null);
                      }}
                      className={`w-full p-2 text-right flex items-center justify-between text-xs rounded-lg ${
                        selectedCustomer?.personCode === c.personCode
                          ? 'bg-blue-600/30 text-amber-300 font-black'
                          : 'hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                        کد {c.personCode}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Center Camera Viewfinder */}
          <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[220px]">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Laser Target Frame Overlay */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              <div
                className={`w-full max-w-sm h-44 sm:h-52 rounded-3xl border-2 transition-all duration-200 relative flex items-center justify-center ${
                  cameraScanFlash
                    ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.7)] scale-[1.02]'
                    : 'border-amber-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.55)]'
                }`}
              >
                {/* Corner Markers */}
                <div className="absolute -top-0.5 -right-0.5 w-7 h-7 border-t-4 border-r-4 border-amber-400 rounded-tr-2xl" />
                <div className="absolute -top-0.5 -left-0.5 w-7 h-7 border-t-4 border-l-4 border-amber-400 rounded-tl-2xl" />
                <div className="absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-4 border-r-4 border-amber-400 rounded-br-2xl" />
                <div className="absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-4 border-l-4 border-amber-400 rounded-bl-2xl" />

                {/* Red/Green Laser Line */}
                <div
                  className={`w-[90%] h-0.5 rounded-full transition-colors ${
                    cameraScanFlash
                      ? 'bg-emerald-400 shadow-[0_0_15px_#10b981]'
                      : 'bg-rose-500/90 shadow-[0_0_12px_#f43f5e] animate-pulse'
                  }`}
                />

                {isResolvingBarcode && (
                  <div className="absolute inset-0 bg-slate-950/60 rounded-3xl flex items-center justify-center gap-2 text-xs font-black text-amber-300">
                    <Loader2 size={18} className="animate-spin" />
                    <span>در حال استعلام بارکد از سایان...</span>
                  </div>
                )}
              </div>

              {/* Torch Status Pill */}
              <div className="mt-3 flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                  <Smartphone size={13} className="text-amber-400" />
                  <span>بارکد کارتن را داخل کادر قرار دهید (اسکن خودکار بدون نیاز به کلیک)</span>
                </span>
              </div>
            </div>

            {/* Camera Error Overlay */}
            {cameraError && (
              <div className="absolute inset-0 bg-slate-950/90 p-6 flex flex-col items-center justify-center text-center space-y-3 z-20">
                <AlertCircle size={36} className="text-rose-400" />
                <p className="text-sm font-black text-white">{cameraError}</p>
                <p className="text-xs text-slate-400 max-w-md">
                  در صورتی که مجوز دوربین را نداده‌اید، از بخش تنظیمات مرورگر یا اپلیکیشن مجوز Camera را فعال کرده و مجدداً تلاش کنید.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={startCameraScanner}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold"
                  >
                    تلاش مجدد باز کردن دوربین
                  </button>
                  <button
                    type="button"
                    onClick={stopCameraScanner}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                  >
                    بازگشت
                  </button>
                </div>
              </div>
            )}

            {/* Live Last Scan Toast Overlay */}
            {lastScanResult && (
              <div
                className={`absolute bottom-3 right-3 left-3 p-2.5 rounded-xl text-xs font-black border shadow-lg transition-all ${
                  lastScanResult.success
                    ? 'bg-emerald-950/95 border-emerald-500 text-emerald-200'
                    : 'bg-rose-950/95 border-rose-500 text-rose-200'
                }`}
              >
                {lastScanResult.text}
              </div>
            )}
          </div>

          {/* Bottom Control Deck: Live Scanned Items + Manual Fallback + Final Sayan Submit */}
          <div className="flex-none bg-slate-900 border-t border-slate-800 p-3 space-y-2.5 max-h-[44vh] flex flex-col">
            {/* KPI Summary Row + Quick Manual Barcode Input */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-black flex items-center gap-1.5">
                  <Boxes size={15} />
                  <span>{items.length.toLocaleString('fa-IR')} کارتن اسکن‌شده</span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-black flex items-center gap-1.5">
                  <Scale size={15} />
                  <span>وزن خالص: {totalNetWeight.toLocaleString('fa-IR')} kg</span>
                </div>
              </div>

              {/* Manual Barcode Quick Entry inside Camera View */}
              <form
                onSubmit={handleBarcodeSubmit}
                className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-xs"
              >
                <input
                  type="text"
                  value={scannedBarcode}
                  onChange={(e) => setScannedBarcode(e.target.value)}
                  placeholder="تایپ دستی بارکد خدشه‌دار..."
                  className="flex-1 h-8 px-2.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white font-mono dir-ltr text-left outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={isResolvingBarcode || !scannedBarcode.trim()}
                  className="h-8 px-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold disabled:opacity-40"
                >
                  افزودن
                </button>
              </form>
            </div>

            {/* Scanned Cartons Mini List */}
            {items.length > 0 && (
              <div className="overflow-y-auto max-h-24 divide-y divide-slate-800/80 bg-slate-950/60 rounded-xl border border-slate-800 px-2.5 py-1">
                {items.map((it, idx) => (
                  <div key={it.id} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-slate-500">{items.length - idx}.</span>
                      <span className="font-mono font-bold text-amber-300 dir-ltr">{it.barcode}</span>
                      <span className="text-slate-300 truncate">{it.itemName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-black text-emerald-400">{it.netWeight} kg</span>
                      <button
                        type="button"
                        onClick={() => setItems(prev => prev.filter(r => r.id !== it.id))}
                        className="p-1 text-rose-400 hover:bg-rose-500/20 rounded"
                        title="حذف این کارتن"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error Alert if any */}
            {errorMsg && (
              <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs font-bold flex items-center gap-1.5">
                <AlertCircle size={14} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Bottom Actions: Register Directly for Customer in Sayan OR Return to Table */}
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleRegisterInSayan}
                disabled={isSubmitting || items.length === 0}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 disabled:opacity-40 transition-all active:scale-95 cursor-pointer"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                <span className="truncate">
                  {selectedCustomer
                    ? `ثبت نهایی ${items.length.toLocaleString('fa-IR')} کارتن برای «${selectedCustomer.name}» در سایان`
                    : `انتخاب مشتری و ثبت ${items.length.toLocaleString('fa-IR')} کارتن در سایان`}
                </span>
              </button>

              <button
                type="button"
                onClick={stopCameraScanner}
                className="py-3 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs shrink-0"
              >
                مشاهده جدول ({items.length})
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Success Modal */}
      {successResult && createPortal(
        <div className="fixed inset-0 z-[999999999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 select-text" dir="rtl">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 text-center space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 size={32} />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                حواله فروش با موفقیت در سایان ثبت شد!
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                سند انبار و حواله فروش با شماره رسمی زیر به پایگاه داده سایان تزریق گردید.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700/60 space-y-2 text-right">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">شماره حواله سایان:</span>
                <span className="font-mono font-black text-base text-blue-600 dark:text-blue-400">
                  #{successResult.docNo}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">شماره فرعی سند:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {successResult.subNo}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">خریدار:</span>
                <span className="font-bold text-slate-900 dark:text-white">{successResult.customerName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">مجموع وزن خالص:</span>
                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                  {successResult.totalNetWeight?.toLocaleString('fa-IR')} کیلوگرم
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPrintModalRecord(successResult)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer size={16} />
                <span>چاپ سند رسمی</span>
              </button>

              <button
                type="button"
                onClick={() => handleShareToChat(successResult)}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all active:scale-95"
              >
                <Send size={16} />
                <span>ارسال به گفتگو</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleStartNextRemittance}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition-colors cursor-pointer"
            >
              ثبت و صدور حواله بعدی
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Printable Voucher Modal */}
      {printModalRecord && createPortal(
        <div className="fixed inset-0 z-[999999999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-sm select-text overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-5 sm:p-6 text-slate-900 space-y-5 border border-slate-300">
            {/* Top Toolbar */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <span className="font-black text-sm">پیش‌نمایش چاپ رسمی حواله فروش سایان (#{printModalRecord.docNo})</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <Printer size={16} />
                  <span>پرینت برگه</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModalRecord(null)}
                  className="p-2 text-slate-500 hover:text-slate-800 rounded-xl"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Official Printable Sheet (A4 fit) */}
            <div id="sales-remittance-print-voucher" className="p-4 sm:p-6 bg-white border-2 border-slate-900 rounded-xl space-y-4">
              {/* Sheet Header */}
              <div className="flex justify-between items-center border-b-2 border-slate-900 pb-3">
                <div className="w-1/3">
                  <h2 className="text-base font-black text-slate-900">شرکت لپان بافت</h2>
                  <p className="text-xs text-slate-600 font-bold">سامانه مدیریت خروج کالا و انبارداری</p>
                </div>
                <div className="w-1/3 text-center">
                  <span className="px-3 py-1 rounded-lg border-2 border-slate-900 bg-slate-100 font-black text-sm">
                    حواله خروج و فروش کالا (OpCode 23)
                  </span>
                </div>
                <div className="w-1/3 text-left font-mono text-xs space-y-1">
                  <div>شماره حواله: <span className="font-black text-sm">#{printModalRecord.docNo}</span></div>
                  <div>شماره فرعی: <span className="font-bold">{printModalRecord.subNo}</span></div>
                  <div>تاریخ: <span className="font-bold">{printModalRecord.shamsiDate}</span></div>
                </div>
              </div>

              {/* Header Info Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-300">
                  <span className="text-slate-500 block mb-0.5">تحویل‌گیرنده / خریدار:</span>
                  <span className="font-black text-sm text-slate-900">{printModalRecord.customerName}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-300">
                  <span className="text-slate-500 block mb-0.5">انبار مبدا تحویل:</span>
                  <span className="font-black text-sm text-slate-900">{printModalRecord.warehouseName || 'انبار تهران'}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border-2 border-slate-900 rounded-lg overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 border-b-2 border-slate-900 font-black">
                    <tr>
                      <th className="py-2 px-2 text-center w-10">ردیف</th>
                      <th className="py-2 px-2">بارکد / سری ساخت</th>
                      <th className="py-2 px-2">شرح کالا</th>
                      <th className="py-2 px-2 text-left">وزن خالص (kg)</th>
                      <th className="py-2 px-2 text-left">وزن ناخالص (kg)</th>
                      <th className="py-2 px-2 text-center">کارتن</th>
                      <th className="py-2 px-2 text-center">بوبین</th>
                      <th className="py-2 px-2">گرید</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(printModalRecord.items || []).map((it: any, i: number) => (
                      <tr key={i}>
                        <td className="py-1.5 px-2 text-center font-mono">{i + 1}</td>
                        <td className="py-1.5 px-2 font-mono font-bold dir-ltr text-right">{it.barcode || it.batch}</td>
                        <td className="py-1.5 px-2 font-bold">{it.itemName || it.goodsName}</td>
                        <td className="py-1.5 px-2 text-left font-mono font-black">{Number(it.netWeight || it.netQty || 0).toLocaleString('fa-IR')}</td>
                        <td className="py-1.5 px-2 text-left font-mono">{Number(it.grossWeight || it.grossQty || 0).toLocaleString('fa-IR')}</td>
                        <td className="py-1.5 px-2 text-center font-mono">{it.cartonCount || 1}</td>
                        <td className="py-1.5 px-2 text-center font-mono">{it.bobbinCount || 56}</td>
                        <td className="py-1.5 px-2 font-mono">{it.grade || 'A'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 border-t-2 border-slate-900 font-black">
                    <tr>
                      <td colSpan={3} className="py-2 px-2 text-left">جمع کل محموله:</td>
                      <td className="py-2 px-2 text-left font-mono text-sm text-blue-700">
                        {Number(printModalRecord.totalNetWeight || 0).toLocaleString('fa-IR')} kg
                      </td>
                      <td className="py-2 px-2 text-left font-mono">
                        {Number(printModalRecord.totalGrossWeight || 0).toLocaleString('fa-IR')} kg
                      </td>
                      <td className="py-2 px-2 text-center font-mono">{printModalRecord.totalCartons} کارتن</td>
                      <td className="py-2 px-2 text-center font-mono">{printModalRecord.totalBobbins}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-4 gap-3 pt-6 text-center text-xs">
                <div className="border-t border-slate-400 pt-1">
                  <span className="font-bold text-slate-700">مسئول انبار / بارکدخوان</span>
                </div>
                <div className="border-t border-slate-400 pt-1">
                  <span className="font-bold text-slate-700">راننده / تحویل‌گیرنده</span>
                </div>
                <div className="border-t border-slate-400 pt-1">
                  <span className="font-bold text-slate-700">واحد فروش و بازرگانی</span>
                </div>
                <div className="border-t border-slate-400 pt-1">
                  <span className="font-bold text-slate-700">مدیریت مالی و خروج</span>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SayanSalesRemittanceIssuer;
