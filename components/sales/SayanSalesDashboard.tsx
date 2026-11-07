import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  TrendingUp, TrendingDown, DollarSign, Package, FileText, Users, 
  Send, Printer, Download, Calendar, Filter, ChevronDown, ChevronRight, 
  Sparkles, RefreshCw, BarChart2, PieChart as PieChartIcon, LineChart as LineChartIcon,
  CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownRight, Layers, Award, ShieldAlert, X,
  Image as ImageIcon, FileSpreadsheet, Eye, EyeOff, Check, Grid,
  Smartphone, UserCheck, MessageCircle, ExternalLink, Plus, Phone
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, 
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid 
} from 'recharts';
import * as jalaali from 'jalaali-js';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import { getServerHost, apiCall } from '../../services/apiService';
import { AiSayanReportModal } from '../AiSayanReportModal';
import { SmartBotRecipientPicker } from '../SmartBotRecipientPicker';

// ----------------------------------------------------------------------
// TYPES & INTERFACES
// ----------------------------------------------------------------------
export interface SayanSalesRow {
  DocId: string;
  InvoiceNum: string;
  Date: string; // ISO String
  Notes?: string;
  OpCode: string; // '3', '12', '23' = Sales; '13', '14' = Return
  ItemCode: string;
  ItemName: string;
  Quantity: string; // Weight / Qty
  ItemNotes?: string;
  Amount: string;
  GroupName?: string;
  CustomerName?: string;
  City?: string;
  SalesExpert?: string;
  PaymentStatus?: string;
  isOfficial?: boolean;
}

interface SayanSalesDashboardProps {
  salesData: SayanSalesRow[];
  compareDataB?: SayanSalesRow[];
  dateFrom: string;
  dateTo: string;
  salesDateFromB?: string;
  salesDateToB?: string;
  compareMode: boolean;
  isLoading: boolean;
  settings?: any;
  onRefreshData?: () => void;
  onDateRangeChange?: (from: string, to: string) => void;
  onCompareDateRangeChange?: (fromB: string, toB: string) => void;
  onToggleCompareMode?: (enabled: boolean) => void;
  runSayanQuery?: (sql: string) => Promise<any>;
  onShareToChat?: (customGenerator?: () => Promise<{ htmlContent?: string; blob?: Blob; pdfFilename: string; defaultMsg: string; prebuiltUrl?: string }>, customTitle?: string) => void;
}

const getEffectiveApiUrl = (path: string) => {
  const host = getServerHost();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!host) {
    return cleanPath;
  }
  return `${host}${cleanPath}`;
};

// ----------------------------------------------------------------------
// CONSTANTS & HELPERS
// ----------------------------------------------------------------------
export const MAJOR_CATEGORIES = [
  'اسپاندکس (کاور)',
  'کش',
  'اسپاندکس جوشی ( ساپورت )',
  'پلی استر شوایتر',
  'نایلون',
  'نخ ملت',
  'الیاف',
  'FDY',
  'چیپس',
  'POY',
  'dty یا پلی استر',
  'لاستیک',
  'لاکرا',
  'پلی استر اسپان',
  'مستر بچ',
  'ضایعات POY',
  'ضایعات تولید'
];

const CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', 
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
  '#a855f7', '#e11d48', '#0284c7', '#059669', '#d97706', '#64748b'
];

export function classifyMajorCategory(groupName: string = '', itemName: string = '', itemCode: string = ''): string {
  const code = String(itemCode || '').trim();
  const text = `${groupName} ${itemName}`.toLowerCase();

  if (code.startsWith('0501') || text.includes('ضایعات poy') || text.includes('ضایعات پی او وای')) return 'ضایعات POY';
  if (code.startsWith('0502') || (text.includes('ضایعات') && !text.includes('poy'))) return 'ضایعات تولید';

  if (code.startsWith('0401') || text.includes('کاور') || text.includes('کاورینگ')) return 'اسپاندکس (کاور)';
  if (code.startsWith('0402') || (text.includes('کش') && !text.includes('روکش') && !text.includes('سرکش'))) return 'کش';
  if (code.startsWith('0403') || text.includes('ساپورت') || text.includes('جوشی') || text.includes('پوشش')) return 'اسپاندکس جوشی ( ساپورت )';
  if (code.startsWith('0405') || text.includes('شواتیز') || text.includes('شوایتر')) return 'پلی استر شوایتر';
  if (code.startsWith('0407') || code.startsWith('0108') || text.includes('نایلون') || text.includes('nylon')) return 'نایلون';
  if (code.startsWith('0408') || text.includes('ملت') || text.includes('melt')) return 'نخ ملت';
  if (code.startsWith('0409') || text.includes('الیاف')) return 'الیاف';
  if (code.startsWith('0410') || text.includes('fdy') || text.includes('اف دی ای')) return 'FDY';

  if (code.startsWith('0101') || text.includes('چیپس') || text.includes('chip')) return 'چیپس';
  if (code.startsWith('0102') || text.includes('poy') || text.includes('پی او وای')) return 'POY';
  if (code.startsWith('0103') || text.includes('dty') || text.includes('دی تی آی') || text.includes('پلی استر')) return 'dty یا پلی استر';
  if (code.startsWith('0104') || text.includes('لاستیک') || text.includes('rubber')) return 'لاستیک';
  if (code.startsWith('0105') || text.includes('لاکرا') || text.includes('لایکرا') || text.includes('lycra')) return 'لاکرا';
  if (code.startsWith('0106') || text.includes('اسپان') || text.includes('span')) return 'پلی استر اسپان';
  if (code.startsWith('0107') || text.includes('مستر') || text.includes('masterbatch')) return 'مستر بچ';

  if (text.includes('اسپاندکس') || text.includes('spandex') || text.includes('اسپندکس')) return 'اسپاندکس (کاور)';
  if (text.includes('پلی استر') || text.includes('polyester')) return 'dty یا پلی استر';

  return groupName ? groupName : (itemName ? itemName : 'سایر محصولات');
}

export function isActualProduct(row: any): boolean {
  if (!row) return false;
  const code = String(row.ItemCode || '').trim();
  const name = String(row.ItemName || '').trim();
  const group = String(row.GroupName || '').trim();
  
  const lowerName = name.toLowerCase();
  const lowerGroup = group.toLowerCase();

  const keywordsToExclude = [
    'کارتن',
    'پالت',
    'جعبه',
    'حمل',
    'کرایه',
    'خدمات',
    'هزینه',
    'دوک خالی',
    'کیسه خالی',
    'بسته بندی',
    'پلاستیک'
  ];

  for (const keyword of keywordsToExclude) {
    if (lowerName.includes(keyword) || lowerGroup.includes(keyword)) {
      return false;
    }
  }

  // Standard prefixes for actual products (yarns/raw materials)
  const isProductPrefix = /^(01|02|04|05)/.test(code);
  if (isProductPrefix) {
    return true;
  }

  // If the group is empty, and name is empty or name is equal to the code, or it's a digit-only string, it's not an actual product
  if (!group && (!name || name === code || /^\d+$/.test(name))) {
    return false;
  }

  return true;
}

function formatMoney(amount: number): string {
  if (isNaN(amount)) return '۰';
  return Math.round(amount).toLocaleString('fa-IR');
}

function formatWeight(kg: number): string {
  if (isNaN(kg)) return '۰';
  return kg.toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function toShamsiStr(dateIso: string): string {
  if (!dateIso) return '-';
  try {
    // 1. Direct string-based parsing (completely timezone-agnostic)
    const match = dateIso.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (match) {
      const gy = parseInt(match[1], 10);
      const gm = parseInt(match[2], 10);
      const gd = parseInt(match[3], 10);
      const j = jalaali.toJalaali(gy, gm, gd);
      return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
    }

    // 2. Fallback to Date object with explicit Iran Time (UTC+3:30) shift to prevent browser timezone shift
    const d = new Date(dateIso);
    if (isNaN(d.getTime())) return '-';
    const iranTime = new Date(d.getTime() + (3.5 * 60 * 60 * 1000));
    const y = iranTime.getUTCFullYear();
    const m = iranTime.getUTCMonth() + 1;
    const day = iranTime.getUTCDate();
    const j = jalaali.toJalaali(y, m, day);
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  } catch (e) {
    return '-';
  }
}

// ----------------------------------------------------------------------
// MAIN COMPONENT
// ----------------------------------------------------------------------
export const SayanSalesDashboard: React.FC<SayanSalesDashboardProps> = ({
  salesData = [],
  compareDataB = [],
  dateFrom,
  dateTo,
  salesDateFromB = '',
  salesDateToB = '',
  compareMode = false,
  isLoading = false,
  settings = {},
  onRefreshData,
  onDateRangeChange,
  onCompareDateRangeChange,
  onToggleCompareMode,
  onShareToChat
}) => {

  // State
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'items' | 'invoices' | 'customers' | 'compare' | 'charts'>('hierarchy');
  const [compareModeType, setCompareModeType] = useState<'groups' | 'items'>('groups');
  const [isExportingImage, setIsExportingImage] = useState<boolean>(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'official' | 'unofficial'>('all');
  const [excludeOther, setExcludeOther] = useState<boolean>(true);
  const [excludedSalesGroups, setExcludedSalesGroups] = useState<string[]>([]);

  // Customer Filtering & Sorting State
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all');
  const [customerSortBy, setCustomerSortBy] = useState<'netAmt_desc' | 'netAmt_asc' | 'netWgt_desc' | 'netWgt_asc' | 'invoices_desc' | 'name_asc'>('netAmt_desc');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [customerDetailTab, setCustomerDetailTab] = useState<Record<string, 'invoices' | 'items'>>({});
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const [customerFilterSearchQuery, setCustomerFilterSearchQuery] = useState<string>('');
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    if (isCustomerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCustomerDropdownOpen]);

  // Toggle exclusion of a major product group in comparison report
  const toggleExcludeSalesGroup = (groupName: string) => {
    setExcludedSalesGroups(prev =>
      prev.includes(groupName) ? prev.filter(g => g !== groupName) : [...prev, groupName]
    );
  };

  // Reset all excluded product groups
  const clearExcludedSalesGroups = () => {
    setExcludedSalesGroups([]);
  };

  // Available major product groups present in datasets for exclusion chips
  const availableSalesGroups = useMemo(() => {
    const groups = new Set<string>();
    salesData.forEach(row => {
      const g = classifyMajorCategory(row.GroupName, row.ItemName, row.ItemCode);
      if (g) groups.add(g);
    });
    if (compareDataB && compareDataB.length > 0) {
      compareDataB.forEach(row => {
        const g = classifyMajorCategory(row.GroupName, row.ItemName, row.ItemCode);
        if (g) groups.add(g);
      });
    }
    // If no transactions yet, fallback to canonical MAJOR_CATEGORIES
    if (groups.size === 0) {
      MAJOR_CATEGORIES.forEach(g => groups.add(g));
    }
    return Array.from(groups).sort((a, b) => a.localeCompare(b, 'fa'));
  }, [salesData, compareDataB]);

  // Dashboard Image Export Handler (html2canvas)
  const handleExportImage = async () => {
    const el = document.getElementById('executive-sales-dashboard');
    if (!el) return;
    setIsExportingImage(true);
    const toastId = toast.loading('در حال پردازش و ساخت تصویر داشبورد مدیریتی...');
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f8fafc',
        logging: false
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `Sayan_Sales_Executive_Dashboard_${dateFrom.replace(/\//g, '-')}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('تصویر داشبورد با موفقیت تولید و دانلود شد.', { id: toastId });
    } catch (err: any) {
      toast.error('خطا در تولید تصویر داشبورد: ' + err.message, { id: toastId });
    } finally {
      setIsExportingImage(false);
    }
  };

  // CSV Export Handler
  const handleExportCSV = () => {
    try {
      let csvContent = '\uFEFF';
      if (activeTab === 'hierarchy') {
        csvContent += 'ردیف,گروه اصلی کالا,وزن فروش (ک‌گ),وزن مرجوعی (ک‌گ),وزن خالص (ک‌گ),مبلغ فروش (ریال),مبلغ مرجوعی (ریال),فروش خالص (ریال),فی نهایی (ریال/ک‌گ),سهم %\n';
        processedMetrics.categoryList.forEach((c, idx) => {
          csvContent += `${idx + 1},"${c.name}",${c.salesWgt},${c.retWgt},${c.netWgt},${c.salesAmt},${c.retAmt},${c.netAmt},${Math.round(c.netFee)},${c.sharePct.toFixed(1)}%\n`;
        });
      } else if (activeTab === 'items') {
        csvContent += 'ردیف,کد کالا,نام کالا,گروه اصلی,وزن فروش (ک‌گ),وزن مرجوعی (ک‌گ),وزن خالص (ک‌گ),مبلغ فروش (ریال),مبلغ مرجوعی (ریال),فروش خالص (ریال),فی خالص نهایی (ریال/ک‌گ),سهم %\n';
        filteredItems.forEach((item, idx) => {
          csvContent += `${idx + 1},"${item.itemCode}","${item.itemName}","${item.majorCategory}",${item.salesQty},${item.returnQty},${item.netQty},${item.salesAmt},${item.returnAmt},${item.netAmt},${Math.round(item.netFee)},${item.sharePct.toFixed(1)}%\n`;
        });
      } else if (activeTab === 'invoices') {
        csvContent += 'ردیف,شماره فاکتور,تاریخ,نام خریدار,شهر,کارشناس فروش,مبلغ ناخالص (ریال),مرجوعی (ریال),فروش خالص (ریال),وزن خالص (ک‌گ),وضعیت تسویه\n';
        filteredInvoices.forEach((inv, idx) => {
          csvContent += `${idx + 1},"${inv.invoiceNum}","${inv.date}","${inv.customerName}","${inv.city}","${inv.salesExpert}",${inv.grossAmt},${inv.retAmt},${inv.netAmt},${inv.netWgt},"${inv.paymentStatus}"\n`;
        });
      } else if (activeTab === 'customers') {
        csvContent += 'ردیف,نام خریدار / مشتری,تعداد فاکتور,وزن فروش (ک‌گ),وزن مرجوعی (ک‌گ),وزن خالص (ک‌گ),مبلغ فروش (ریال),مبلغ مرجوعی (ریال),فروش خالص (ریال),فی میانگین (ریال/ک‌گ),سهم از کل %\n';
        sortedAndFilteredCustomers.forEach((c, idx) => {
          csvContent += `${idx + 1},"${c.customerName}",${c.invoiceCount},${c.salesWgt},${c.retWgt},${c.netWgt},${c.salesAmt},${c.retAmt},${c.netAmt},${Math.round(c.netFee)},${c.sharePct.toFixed(1)}%\n`;
        });
      } else if (activeTab === 'compare' && comparisonMetrics) {
        csvContent += 'عنوان کالا / گروه,فروش خالص A (ریال),فروش خالص B (ریال),وزن A (ک‌گ),وزن B (ک‌گ),فی A (ریال),فی B (ریال),اختلاف مبلغ,درصد رشد/افت\n';
        comparisonMetrics.compareRows.forEach(row => {
          csvContent += `"${row.catName}",${row.netAmtA},${row.netAmtB},${row.netWgtA},${row.netWgtB},${Math.round(row.netFeeA)},${Math.round(row.netFeeB)},${row.diffAmt},${row.growthPct.toFixed(1)}%\n`;
        });
      }
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Sayan_Sales_${activeTab}_${dateFrom.replace(/\//g, '-')}.csv`;
      link.click();
      toast.success('فایل CSV با موفقیت دانلود شد.');
    } catch (e: any) {
      toast.error('خطا در ساخت CSV: ' + e.message);
    }
  };

  // Preset generator for quick Period B selection
  const applyPreset = (preset: 'prev_year' | 'prev_month' | 'prev_quarter') => {
    if (!dateFrom || !dateTo || !onCompareDateRangeChange) return;
    try {
      const partsFrom = dateFrom.split('/');
      const partsTo = dateTo.split('/');
      if (partsFrom.length === 3 && partsTo.length === 3) {
        const yFrom = parseInt(partsFrom[0], 10);
        const mFrom = parseInt(partsFrom[1], 10);
        const dFrom = parseInt(partsFrom[2], 10);
        const yTo = parseInt(partsTo[0], 10);
        const mTo = parseInt(partsTo[1], 10);
        const dTo = parseInt(partsTo[2], 10);

        const getMaxDays = (y: number, m: number) => m <= 6 ? 31 : (m <= 11 ? 30 : (jalaali.isLeapJalaaliYear(y) ? 30 : 29));

        let bFrom = '';
        let bTo = '';

        if (preset === 'prev_year') {
          const maxDf = getMaxDays(yFrom - 1, mFrom);
          const maxDt = getMaxDays(yTo - 1, mTo);
          bFrom = `${yFrom - 1}/${String(mFrom).padStart(2, '0')}/${String(Math.min(dFrom, maxDf)).padStart(2, '0')}`;
          bTo = `${yTo - 1}/${String(mTo).padStart(2, '0')}/${String(Math.min(dTo, maxDt)).padStart(2, '0')}`;
        } else if (preset === 'prev_month') {
          let prevMFrom = mFrom - 1;
          let prevYFrom = yFrom;
          if (prevMFrom < 1) { prevMFrom = 12; prevYFrom--; }
          
          let prevMTo = mTo - 1;
          let prevYTo = yTo;
          if (prevMTo < 1) { prevMTo = 12; prevYTo--; }

          const maxDf = getMaxDays(prevYFrom, prevMFrom);
          const maxDt = getMaxDays(prevYTo, prevMTo);

          bFrom = `${prevYFrom}/${String(prevMFrom).padStart(2, '0')}/${String(Math.min(dFrom, maxDf)).padStart(2, '0')}`;
          bTo = `${prevYTo}/${String(prevMTo).padStart(2, '0')}/${String(Math.min(dTo, maxDt)).padStart(2, '0')}`;
        } else if (preset === 'prev_quarter') {
          let prevMFrom = mFrom - 3;
          let prevYFrom = yFrom;
          if (prevMFrom < 1) { prevMFrom += 12; prevYFrom--; }

          let prevMTo = mTo - 3;
          let prevYTo = yTo;
          if (prevMTo < 1) { prevMTo += 12; prevYTo--; }

          const maxDf = getMaxDays(prevYFrom, prevMFrom);
          const maxDt = getMaxDays(prevYTo, prevMTo);

          bFrom = `${prevYFrom}/${String(prevMFrom).padStart(2, '0')}/${String(Math.min(dFrom, maxDf)).padStart(2, '0')}`;
          bTo = `${prevYTo}/${String(prevMTo).padStart(2, '0')}/${String(Math.min(dTo, maxDt)).padStart(2, '0')}`;
        }

        onCompareDateRangeChange(bFrom, bTo);
        if (onToggleCompareMode) onToggleCompareMode(true);
        toast.success(`بازه دوم مقایسه به همسان (${bFrom} تا ${bTo}) ست شد.`);
      }
    } catch (e: any) {
      toast.error('خطا در محاسبه تاریخ مقایسه');
    }
  };
  
  // Bot & AI Modal State
  const [isBotModalOpen, setIsBotModalOpen] = useState<boolean>(false);
  const [isSendingBot, setIsSendingBot] = useState<boolean>(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['telegram', 'bale', 'whatsapp']);
  const [botSendMode, setBotSendMode] = useState<'custom_recipients' | 'default_groups'>('custom_recipients');
  const [customChatIdsTele, setCustomChatIdsTele] = useState<string[]>([]);
  const [customChatIdsBale, setCustomChatIdsBale] = useState<string[]>([]);
  const [customChatIdsWa, setCustomChatIdsWa] = useState<string[]>([]);
  const [manualWhatsappPhone, setManualWhatsappPhone] = useState<string>('');

  // Toggle Category Expand
  const toggleCategory = (catName: string) => {
    setExpandedCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
  };

  // ----------------------------------------------------------------------
  // DATA COMPUTATIONS (Net Sales = Sales - Returns)
  // ----------------------------------------------------------------------
  const processedMetrics = useMemo(() => {
    let rangeSalesAmt = 0, rangeSalesWgt = 0;
    let rangeRetAmt = 0, rangeRetWgt = 0;
    
    let todayNetAmt = 0, todayNetWgt = 0, todayRetAmt = 0, todayRetWgt = 0;
    let yesterdayNetAmt = 0, yesterdayNetWgt = 0, yesterdayRetAmt = 0, yesterdayRetWgt = 0;
    let monthNetAmt = 0, monthNetWgt = 0;
    let quarterNetAmt = 0, quarterNetWgt = 0;
    let yearNetAmt = 0, yearNetWgt = 0;

    const invoicesSet = new Set<string>();
    const customersSet = new Set<string>();

    const now = new Date();
    const jNow = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const jYesterday = jalaali.toJalaali(yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate());

    // Determine target year being inspected (e.g. 1404 or 1405)
    const targetYear = (() => {
      if (dateFrom) {
        const match = dateFrom.match(/(\d{4})/);
        if (match) return parseInt(match[1], 10);
        const match2 = dateFrom.match(/(\d{1,4})/);
        if (match2) {
          let y = parseInt(match2[1], 10);
          if (y < 100) y += 1400;
          else if (y >= 100 && y < 1000) y += 1000;
          return y;
        }
      }
      return jNow.jy;
    })();

    // Detailed Item Map
    const itemMap = new Map<string, {
      itemCode: string;
      itemName: string;
      groupName: string;
      majorCategory: string;
      salesQty: number;
      salesAmt: number;
      returnQty: number;
      returnAmt: number;
    }>();

    // Major Category Map
    const categoryMap = new Map<string, {
      name: string;
      salesWgt: number;
      salesAmt: number;
      retWgt: number;
      retAmt: number;
      itemsMap: Map<string, { itemName: string; salesWgt: number; salesAmt: number; retWgt: number; retAmt: number; }>;
    }>();

    // Initialize all 15 Major Categories to preserve order
    MAJOR_CATEGORIES.forEach(cat => {
      categoryMap.set(cat, {
        name: cat,
        salesWgt: 0,
        salesAmt: 0,
        retWgt: 0,
        retAmt: 0,
        itemsMap: new Map()
      });
    });

    // Invoices list
    const invoiceListMap = new Map<string, {
      invoiceNum: string;
      date: string;
      customerName: string;
      city: string;
      salesExpert: string;
      grossAmt: number;
      retAmt: number;
      netAmt: number;
      netWgt: number;
      paymentStatus: string;
    }>();

    const filteredRows = salesData.filter(row => {
      if (invoiceFilter === 'official' && row.isOfficial !== true) return false;
      if (invoiceFilter === 'unofficial' && row.isOfficial === true) return false;
      if (excludeOther && !row.GroupName && !row.ItemName) return false;
      if (selectedCustomer !== 'all' && (row.CustomerName || 'مشتری متفرقه').trim() !== selectedCustomer.trim()) return false;
      return true;
    });

    filteredRows.forEach(row => {
      if (!isActualProduct(row)) return;
      const amt = parseFloat(row.Amount || '0') || 0;
      const qty = parseFloat(row.Quantity || '0') || 0;
      // OpCode 13 is Sales Return (مرجوعی از فروش).
      const isReturn = String(row.OpCode || '').trim() === '13';
      const invNum = row.InvoiceNum || row.DocId || 'بدون شماره';
      const custName = row.CustomerName || 'مشتری متفرقه';
      const majorCat = classifyMajorCategory(row.GroupName, row.ItemName, row.ItemCode);

      if (invNum) invoicesSet.add(invNum);
      if (custName) customersSet.add(custName);

      // Accumulate Selected Range
      if (isReturn) {
        rangeRetAmt += amt;
        rangeRetWgt += qty;
      } else {
        rangeSalesAmt += amt;
        rangeSalesWgt += qty;
      }

      // Check dates for Today / Month / Quarter / Year
      const jRow = (() => {
        if (!row.Date) return { jy: 0, jm: 0, jd: 0 };
        try {
          const match = row.Date.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
          if (match) {
            const gy = parseInt(match[1], 10);
            const gm = parseInt(match[2], 10);
            const gd = parseInt(match[3], 10);
            return jalaali.toJalaali(gy, gm, gd);
          }
          const d = new Date(row.Date);
          if (isNaN(d.getTime())) return { jy: 0, jm: 0, jd: 0 };
          const iranTime = new Date(d.getTime() + (3.5 * 60 * 60 * 1000));
          return jalaali.toJalaali(iranTime.getUTCFullYear(), iranTime.getUTCMonth() + 1, iranTime.getUTCDate());
        } catch {
          return { jy: 0, jm: 0, jd: 0 };
        }
      })();
      
      // Today
      if (jRow.jy === jNow.jy && jRow.jm === jNow.jm && jRow.jd === jNow.jd) {
        if (isReturn) {
          todayRetAmt += amt; todayRetWgt += qty;
        } else {
          todayNetAmt += amt; todayNetWgt += qty;
        }
      }

      // Yesterday
      if (jRow.jy === jYesterday.jy && jRow.jm === jYesterday.jm && jRow.jd === jYesterday.jd) {
        if (isReturn) {
          yesterdayRetAmt += amt; yesterdayRetWgt += qty;
        } else {
          yesterdayNetAmt += amt; yesterdayNetWgt += qty;
        }
      }

      // Month (Match target year; if targetYear is current year use current month, else aggregate for month)
      const targetMonth = targetYear === jNow.jy ? jNow.jm : (jRow.jm || 1);
      if (jRow.jy === targetYear && (targetYear === jNow.jy ? jRow.jm === targetMonth : true)) {
        if (isReturn) monthNetAmt -= amt; else monthNetAmt += amt;
        if (isReturn) monthNetWgt -= qty; else monthNetWgt += qty;
      }

      // Quarter
      const currentQuarter = Math.ceil(jNow.jm / 3);
      const rowQuarter = Math.ceil(jRow.jm / 3);
      if (jRow.jy === targetYear && (targetYear === jNow.jy ? rowQuarter === currentQuarter : true)) {
        if (isReturn) quarterNetAmt -= amt; else quarterNetAmt += amt;
        if (isReturn) quarterNetWgt -= qty; else quarterNetWgt += qty;
      }

      // Year
      if (jRow.jy === targetYear) {
        if (isReturn) yearNetAmt -= amt; else yearNetAmt += amt;
        if (isReturn) yearNetWgt -= qty; else yearNetWgt += qty;
      }

      // Item Accumulation
      const itemKey = row.ItemCode || row.ItemName || 'کالا';
      if (!itemMap.has(itemKey)) {
        itemMap.set(itemKey, {
          itemCode: row.ItemCode || '',
          itemName: row.ItemName || 'کالای بدون نام',
          groupName: row.GroupName || 'سایر',
          majorCategory: majorCat,
          salesQty: 0, salesAmt: 0, returnQty: 0, returnAmt: 0
        });
      }
      const itemRecord = itemMap.get(itemKey)!;
      if (isReturn) {
        itemRecord.returnQty += qty; itemRecord.returnAmt += amt;
      } else {
        itemRecord.salesQty += qty; itemRecord.salesAmt += amt;
      }

      // Major Category Accumulation
      if (!categoryMap.has(majorCat)) {
        categoryMap.set(majorCat, {
          name: majorCat, salesWgt: 0, salesAmt: 0, retWgt: 0, retAmt: 0, itemsMap: new Map()
        });
      }
      const catRecord = categoryMap.get(majorCat)!;
      if (isReturn) {
        catRecord.retWgt += qty; catRecord.retAmt += amt;
      } else {
        catRecord.salesWgt += qty; catRecord.salesAmt += amt;
      }

      // Sub-items inside category
      if (!catRecord.itemsMap.has(itemKey)) {
        catRecord.itemsMap.set(itemKey, { itemName: row.ItemName, salesWgt: 0, salesAmt: 0, retWgt: 0, retAmt: 0 });
      }
      const catSubItem = catRecord.itemsMap.get(itemKey)!;
      if (isReturn) {
        catSubItem.retWgt += qty; catSubItem.retAmt += amt;
      } else {
        catSubItem.salesWgt += qty; catSubItem.salesAmt += amt;
      }

      // Invoices List - key by DocId (unique per document in Sayan DB) to prevent collisions across dates
      const docKey = row.DocId ? String(row.DocId) : invNum;
      if (!invoiceListMap.has(docKey)) {
        invoiceListMap.set(docKey, {
          invoiceNum: invNum,
          date: toShamsiStr(row.Date),
          customerName: custName,
          city: row.City || 'نامشخص',
          salesExpert: row.SalesExpert || 'کارشناس فروش',
          grossAmt: 0, retAmt: 0, netAmt: 0, netWgt: 0,
          paymentStatus: row.PaymentStatus || 'تسویه شده'
        });
      }
      const invRecord = invoiceListMap.get(docKey)!;
      if (isReturn) {
        invRecord.retAmt += amt;
        invRecord.netAmt -= amt;
        invRecord.netWgt -= qty;
      } else {
        invRecord.grossAmt += amt;
        invRecord.netAmt += amt;
        invRecord.netWgt += qty;
      }
    });

    const rangeNetAmt = rangeSalesAmt - rangeRetAmt;
    const rangeNetWgt = rangeSalesWgt - rangeRetWgt;
    const rangeNetFee = rangeNetWgt > 0 ? (rangeNetAmt / rangeNetWgt) : 0;

    const todayNetCalculatedAmt = todayNetAmt - todayRetAmt;
    const todayNetCalculatedWgt = todayNetWgt - todayRetWgt;
    const todayNetFee = todayNetCalculatedWgt > 0 ? (todayNetCalculatedAmt / todayNetCalculatedWgt) : 0;

    const yesterdayNetCalculatedAmt = yesterdayNetAmt - yesterdayRetAmt;
    const yesterdayNetCalculatedWgt = yesterdayNetWgt - yesterdayRetWgt;
    const yesterdayNetFee = yesterdayNetCalculatedWgt > 0 ? (yesterdayNetCalculatedAmt / yesterdayNetCalculatedWgt) : 0;

    const monthNetFee = monthNetWgt > 0 ? (monthNetAmt / monthNetWgt) : 0;
    const quarterNetFee = quarterNetWgt > 0 ? (quarterNetAmt / quarterNetWgt) : 0;
    const yearNetFee = yearNetWgt > 0 ? (yearNetAmt / yearNetWgt) : 0;

    const invoiceCount = invoicesSet.size;
    const customerCount = customersSet.size;
    const avgInvoiceAmt = invoiceCount > 0 ? (rangeNetAmt / invoiceCount) : 0;
    const avgInvoiceWgt = invoiceCount > 0 ? (rangeNetWgt / invoiceCount) : 0;

    // Build Category Breakdown List
    const categoryList = Array.from(categoryMap.values()).map(c => {
      const netAmt = c.salesAmt - c.retAmt;
      const netWgt = c.salesWgt - c.retWgt;
      const netFee = netWgt > 0 ? (netAmt / netWgt) : 0;
      const sharePct = rangeNetAmt > 0 ? ((netAmt / rangeNetAmt) * 100) : 0;

      const itemsList = Array.from(c.itemsMap.values()).map(sub => {
        const sNetAmt = sub.salesAmt - sub.retAmt;
        const sNetWgt = sub.salesWgt - sub.retWgt;
        const sNetFee = sNetWgt > 0 ? (sNetAmt / sNetWgt) : 0;
        const sSharePct = netAmt > 0 ? ((sNetAmt / netAmt) * 100) : 0;
        return {
          itemName: sub.itemName,
          salesWgt: sub.salesWgt,
          retWgt: sub.retWgt,
          netWgt: sNetWgt,
          salesAmt: sub.salesAmt,
          retAmt: sub.retAmt,
          netAmt: sNetAmt,
          netFee: sNetFee,
          sharePct: sSharePct
        };
      }).filter(item => Math.abs(item.netAmt) > 0 || Math.abs(item.netWgt) > 0);

      return {
        name: c.name,
        salesWgt: c.salesWgt,
        retWgt: c.retWgt,
        netWgt,
        salesAmt: c.salesAmt,
        retAmt: c.retAmt,
        netAmt,
        netFee,
        sharePct,
        items: itemsList
      };
    }).filter(c => Math.abs(c.netAmt) > 0 || Math.abs(c.netWgt) > 0 || c.salesAmt > 0);

    // Build Detailed Items List
    const itemList = Array.from(itemMap.values()).map(i => {
      const netAmt = i.salesAmt - i.returnAmt;
      const netWgt = i.salesQty - i.returnQty;
      const netFee = netWgt > 0 ? (netAmt / netWgt) : 0;
      const sharePct = rangeNetAmt > 0 ? ((netAmt / rangeNetAmt) * 100) : 0;
      return {
        itemCode: i.itemCode,
        itemName: i.itemName,
        groupName: i.groupName,
        majorCategory: i.majorCategory,
        salesQty: i.salesQty,
        salesAmt: i.salesAmt,
        returnQty: i.returnQty,
        returnAmt: i.returnAmt,
        netQty: netWgt,
        netAmt,
        netFee,
        sharePct
      };
    }).filter(i => Math.abs(i.netAmt) > 0 || Math.abs(i.netQty) > 0);

    // Build Invoices Array
    const invoicesList = Array.from(invoiceListMap.values());

    // Compute Executive Automated Insights
    const sortedByAmt = [...itemList].sort((a, b) => b.netAmt - a.netAmt);
    const sortedByWgt = [...itemList].sort((a, b) => b.netQty - a.netQty);
    const sortedByFee = [...itemList].filter(i => i.netQty > 10).sort((a, b) => b.netFee - a.netFee);
    const sortedByReturn = [...itemList].sort((a, b) => b.returnAmt - a.returnAmt);
    const sortedCategories = [...categoryList].sort((a, b) => b.netAmt - a.netAmt);

    const topProductByAmt = sortedByAmt[0]?.itemName || 'ثبت نشده';
    const topProductByWgt = sortedByWgt[0]?.itemName || 'ثبت نشده';
    const topProductByFee = sortedByFee[0] ? `${sortedByFee[0].itemName} (${formatMoney(sortedByFee[0].netFee)} ریال/ک‌گ)` : 'ثبت نشده';
    const topReturnProduct = sortedByReturn[0] ? `${sortedByReturn[0].itemName} (${formatMoney(sortedByReturn[0].returnAmt)} ریال)` : 'بدون مرجوعی';
    const topGroup = sortedCategories[0]?.name || 'ثبت نشده';
    const lowestGroup = sortedCategories[sortedCategories.length - 1]?.name || 'ثبت نشده';
    const returnRatePct = rangeSalesAmt > 0 ? ((rangeRetAmt / rangeSalesAmt) * 100) : 0;

    return {
      todayNetAmt: todayNetCalculatedAmt,
      todayNetWgt: todayNetCalculatedWgt,
      todayNetFee,
      todayRetAmt,
      todayRetWgt: todayRetWgt,
      todayGrossAmt: todayNetAmt,
      todayGrossWgt: todayNetWgt,
      yesterdayNetAmt: yesterdayNetCalculatedAmt,
      yesterdayNetWgt: yesterdayNetCalculatedWgt,
      yesterdayNetFee,
      yesterdayRetAmt: yesterdayRetAmt,
      yesterdayRetWgt: yesterdayRetWgt,
      yesterdayGrossAmt: yesterdayNetAmt,
      yesterdayGrossWgt: yesterdayNetWgt,
      monthNetAmt,
      monthNetWgt,
      monthNetFee,
      quarterNetAmt,
      quarterNetWgt,
      quarterNetFee,
      yearNetAmt,
      yearNetWgt,
      yearNetFee,
      rangeNetAmt,
      rangeNetWgt,
      rangeNetFee,
      rangeSalesAmt,
      rangeSalesWgt,
      rangeRetAmt,
      rangeRetWgt,
      invoiceCount,
      customerCount,
      avgInvoiceAmt,
      avgInvoiceWgt,
      categoryList,
      itemList,
      invoicesList,
      filteredRowsCount: filteredRows.length,
      insights: {
        topProductByAmt,
        topProductByWgt,
        topProductByFee,
        topReturnProduct,
        topGroup,
        lowestGroup,
        returnRatePct
      }
    };
  }, [salesData, invoiceFilter, excludeOther, selectedCustomer]);

  // ----------------------------------------------------------------------
  // COMPARISON COMPUTATIONS (Period A vs Period B)
  // ----------------------------------------------------------------------
  const comparisonMetrics = useMemo(() => {
    if (!compareMode || !compareDataB || compareDataB.length === 0) return null;

    let netAmtB = 0, netWgtB = 0, salesAmtB = 0, retAmtB = 0, salesWgtB = 0, retWgtB = 0;
    const catMapB = new Map<string, { salesWgt: number; salesAmt: number; retWgt: number; retAmt: number; }>();
    const itemMapB = new Map<string, { itemCode: string; itemName: string; groupName: string; majorCategory: string; salesQty: number; salesAmt: number; returnQty: number; returnAmt: number; }>();

    const filteredB = compareDataB.filter(row => {
      if (invoiceFilter === 'official' && row.isOfficial !== true) return false;
      if (invoiceFilter === 'unofficial' && row.isOfficial === true) return false;
      if (excludeOther && !row.GroupName && !row.ItemName) return false;
      return true;
    });

    filteredB.forEach(row => {
      if (!isActualProduct(row)) return;
      const amt = parseFloat(row.Amount || '0') || 0;
      const qty = parseFloat(row.Quantity || '0') || 0;
      // OpCode 13 is Sales Return (مرجوعی از فروش).
      const isReturn = String(row.OpCode || '').trim() === '13';
      const cat = classifyMajorCategory(row.GroupName, row.ItemName, row.ItemCode);
      const itemKey = row.ItemCode || row.ItemName || 'کالا';

      if (isReturn) {
        retAmtB += amt;
        retWgtB += qty;
        netAmtB -= amt;
        netWgtB -= qty;
      } else {
        salesAmtB += amt;
        salesWgtB += qty;
        netAmtB += amt;
        netWgtB += qty;
      }

      // Group Map B
      if (!catMapB.has(cat)) {
        catMapB.set(cat, { salesWgt: 0, salesAmt: 0, retWgt: 0, retAmt: 0 });
      }
      const catRecord = catMapB.get(cat)!;
      if (isReturn) {
        catRecord.retWgt += qty; catRecord.retAmt += amt;
      } else {
        catRecord.salesWgt += qty; catRecord.salesAmt += amt;
      }

      // Item Map B
      if (!itemMapB.has(itemKey)) {
        itemMapB.set(itemKey, {
          itemCode: row.ItemCode || '',
          itemName: row.ItemName || 'کالای بدون نام',
          groupName: row.GroupName || 'سایر',
          majorCategory: cat,
          salesQty: 0, salesAmt: 0, returnQty: 0, returnAmt: 0
        });
      }
      const itemRecord = itemMapB.get(itemKey)!;
      if (isReturn) {
        itemRecord.returnQty += qty; itemRecord.returnAmt += amt;
      } else {
        itemRecord.salesQty += qty; itemRecord.salesAmt += amt;
      }
    });

    const avgFeeB = netWgtB > 0 ? (netAmtB / netWgtB) : 0;

    const netAmtA = processedMetrics.rangeNetAmt;
    const netWgtA = processedMetrics.rangeNetWgt;
    const avgFeeA = processedMetrics.rangeNetFee;

    const amtDiff = netAmtA - netAmtB;
    const amtGrowthPct = netAmtB ? ((amtDiff / netAmtB) * 100) : 0;

    const wgtDiff = netWgtA - netWgtB;
    const wgtGrowthPct = netWgtB ? ((wgtDiff / netWgtB) * 100) : 0;

    const feeDiff = avgFeeA - avgFeeB;
    const feeGrowthPct = avgFeeB ? ((feeDiff / avgFeeB) * 100) : 0;

    const getVariance = (dAmt: number, dWgt: number, dFee: number) => {
      if (dAmt > 0 && dWgt > 0 && dFee > 0) return { label: 'رشد متوازن (نرخ + حجم)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      if (dAmt > 0 && dWgt > 0 && dFee <= 0) return { label: 'رشد حجمی (قیمت رقابتی)', color: 'bg-blue-100 text-blue-800 border-blue-300' };
      if (dAmt > 0 && dWgt <= 0 && dFee > 0) return { label: 'رشد مبلغمحور (افزایش نرخ)', color: 'bg-purple-100 text-purple-800 border-purple-300' };
      if (dAmt < 0 && dWgt < 0 && dFee < 0) return { label: 'افت شدید (نرخ + حجم)', color: 'bg-rose-100 text-rose-800 border-rose-300' };
      if (dAmt < 0 && dWgt < 0) return { label: 'افت حجمی فروش', color: 'bg-amber-100 text-amber-800 border-amber-300' };
      if (dAmt < 0) return { label: 'انحراف کاهشی درآمد', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      return { label: 'ثبات نسبی عملکرد', color: 'bg-slate-100 text-slate-700 border-slate-300' };
    };

    // Mode 1: Group comparison rows (Level-2 15 Major Categories)
    // Filter out user-selected excluded major product groups
    const compareGroupRows = MAJOR_CATEGORIES
      .filter(catName => !excludedSalesGroups.includes(catName))
      .map(catName => {
      const catA = processedMetrics.categoryList.find(c => c.name === catName) || { salesAmt: 0, retAmt: 0, netAmt: 0, salesWgt: 0, retWgt: 0, netWgt: 0, netFee: 0 };
      const catBRecord = catMapB.get(catName);
      const grossAmtB = catBRecord ? catBRecord.salesAmt : 0;
      const retAmtB_row = catBRecord ? catBRecord.retAmt : 0;
      const grossWgtB = catBRecord ? catBRecord.salesWgt : 0;
      const retWgtB_row = catBRecord ? catBRecord.retWgt : 0;

      const catBNetAmt = grossAmtB - retAmtB_row;
      const catBNetWgt = grossWgtB - retWgtB_row;
      const catBNetFee = catBNetWgt > 0 ? (catBNetAmt / catBNetWgt) : 0;

      const diffAmt = catA.netAmt - catBNetAmt;
      const growthPct = catBNetAmt ? ((diffAmt / catBNetAmt) * 100) : 0;
      const diffWgt = catA.netWgt - catBNetWgt;
      const wgtGrowthPctRow = catBNetWgt ? ((diffWgt / catBNetWgt) * 100) : 0;
      const diffFee = catA.netFee - catBNetFee;

      const sharePctA = netAmtA > 0 ? ((catA.netAmt / netAmtA) * 100) : 0;
      const sharePctB = netAmtB > 0 ? ((catBNetAmt / netAmtB) * 100) : 0;

      return {
        catName,
        grossAmtA: catA.salesAmt,
        retAmtA: catA.retAmt,
        netAmtA: catA.netAmt,
        grossWgtA: catA.salesWgt,
        retWgtA: catA.retWgt,
        netWgtA: catA.netWgt,
        netFeeA: catA.netFee,
        sharePctA,
        grossAmtB,
        retAmtB: retAmtB_row,
        netAmtB: catBNetAmt,
        grossWgtB,
        retWgtB: retWgtB_row,
        netWgtB: catBNetWgt,
        netFeeB: catBNetFee,
        sharePctB,
        diffAmt,
        growthPct,
        diffWgt,
        wgtGrowthPctRow,
        wgtGrowthPct: wgtGrowthPctRow,
        feeGrowthPct: catBNetFee ? ((diffFee / catBNetFee) * 100) : 0,
        diffFee,
        variance: getVariance(diffAmt, diffWgt, diffFee)
      };
    }).filter(r => Math.abs(r.netAmtA) > 0 || Math.abs(r.netAmtB) > 0);

    // Mode 2: Item Detail comparison rows (All individual products)
    const allItemKeys = new Set<string>([
      ...processedMetrics.itemList.map(i => i.itemCode || i.itemName),
      ...Array.from(itemMapB.keys())
    ]);

    const compareItemRows = Array.from(allItemKeys).map(itemKey => {
      const itemA = processedMetrics.itemList.find(i => (i.itemCode || i.itemName) === itemKey) || {
        itemCode: '', itemName: itemKey, groupName: '', majorCategory: '', salesAmt: 0, returnAmt: 0, netAmt: 0, salesQty: 0, returnQty: 0, netQty: 0, netFee: 0
      };
      const itemBRecord = itemMapB.get(itemKey);
      const grossAmtB = itemBRecord ? itemBRecord.salesAmt : 0;
      const retAmtB_row = itemBRecord ? itemBRecord.returnAmt : 0;
      const grossWgtB = itemBRecord ? itemBRecord.salesQty : 0;
      const retWgtB_row = itemBRecord ? itemBRecord.returnQty : 0;

      const netAmtB_row = grossAmtB - retAmtB_row;
      const netWgtB_row = grossWgtB - retWgtB_row;
      const netFeeB_row = netWgtB_row > 0 ? (netAmtB_row / netWgtB_row) : 0;

      const diffAmt = itemA.netAmt - netAmtB_row;
      const growthPct = netAmtB_row ? ((diffAmt / netAmtB_row) * 100) : 0;
      const diffWgt = itemA.netQty - netWgtB_row;
      const diffFee = itemA.netFee - netFeeB_row;

      return {
        itemCode: itemA.itemCode || (itemBRecord ? itemBRecord.itemCode : ''),
        itemName: itemA.itemName || (itemBRecord ? itemBRecord.itemName : itemKey),
        majorCategory: itemA.majorCategory || (itemBRecord ? itemBRecord.majorCategory : 'سایر'),
        grossAmtA: itemA.salesAmt,
        retAmtA: itemA.returnAmt,
        netAmtA: itemA.netAmt,
        netWgtA: itemA.netQty,
        netFeeA: itemA.netFee,
        grossAmtB,
        retAmtB: retAmtB_row,
        netAmtB: netAmtB_row,
        netWgtB: netWgtB_row,
        netFeeB: netFeeB_row,
        diffAmt,
        growthPct,
        diffWgt,
        diffFee,
        variance: getVariance(diffAmt, diffWgt, diffFee)
      };
    }).filter(r => {
      if (excludedSalesGroups.includes(r.majorCategory)) return false;
      return Math.abs(r.netAmtA) > 0 || Math.abs(r.netAmtB) > 0;
    });

    return {
      netAmtA, netAmtB, amtDiff, amtGrowthPct,
      netWgtA, netWgtB, wgtDiff, wgtGrowthPct,
      avgFeeA, avgFeeB, feeDiff, feeGrowthPct,
      compareRows: compareGroupRows,
      compareGroupRows,
      compareItemRows
    };
  }, [compareMode, compareDataB, processedMetrics, invoiceFilter, excludedSalesGroups]);

  // ----------------------------------------------------------------------
  // QUICK PRESET SELECTION
  // ----------------------------------------------------------------------
  const handleSelectPreset = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const now = new Date();
    const jNow = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());

    let fromStr = '';
    let toStr = '';

    const pad = (n: number) => String(n).padStart(2, '0');

    if (presetKey === 'today') {
      fromStr = `${jNow.jy}/${pad(jNow.jm)}/${pad(jNow.jd)}`;
      toStr = fromStr;
    } else if (presetKey === 'yesterday') {
      const yDate = new Date(now);
      yDate.setDate(yDate.getDate() - 1);
      const jY = jalaali.toJalaali(yDate.getFullYear(), yDate.getMonth() + 1, yDate.getDate());
      fromStr = `${jY.jy}/${pad(jY.jm)}/${pad(jY.jd)}`;
      toStr = fromStr;
    } else if (presetKey === 'this_week') {
      // Current Saturday to Today
      const dayOfWeek = now.getDay(); // 0 is Sun, 6 is Sat
      const distSat = (dayOfWeek + 1) % 7;
      const satDate = new Date(now);
      satDate.setDate(satDate.getDate() - distSat);
      const jSat = jalaali.toJalaali(satDate.getFullYear(), satDate.getMonth() + 1, satDate.getDate());
      fromStr = `${jSat.jy}/${pad(jSat.jm)}/${pad(jSat.jd)}`;
      toStr = `${jNow.jy}/${pad(jNow.jm)}/${pad(jNow.jd)}`;
    } else if (presetKey === 'this_month') {
      fromStr = `${jNow.jy}/${pad(jNow.jm)}/01`;
      toStr = `${jNow.jy}/${pad(jNow.jm)}/${pad(jNow.jd)}`;
    } else if (presetKey === 'last_month') {
      let prevM = jNow.jm - 1;
      let prevY = jNow.jy;
      if (prevM < 1) { prevM = 12; prevY -= 1; }
      fromStr = `${prevY}/${pad(prevM)}/01`;
      const daysInPrev = jalaali.jalaaliMonthLength(prevY, prevM);
      toStr = `${prevY}/${pad(prevM)}/${pad(daysInPrev)}`;
    } else if (presetKey === 'this_year') {
      const activeY = jNow.jy;
      fromStr = `${activeY}/01/01`;
      toStr = `${activeY}/${pad(jNow.jm)}/${pad(jNow.jd)}`;
    } else if (presetKey === 'last_year') {
      const prevY = jNow.jy - 1;
      fromStr = `${prevY}/01/01`;
      toStr = `${prevY}/12/29`;
    }

    if (fromStr && toStr && onDateRangeChange) {
      onDateRangeChange(fromStr, toStr);
    }
  };

  // ----------------------------------------------------------------------
  // EXPORT TO EXCEL
  // ----------------------------------------------------------------------
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Major Categories
      const catData = processedMetrics.categoryList.map((c, i) => ({
        'ردیف': i + 1,
        'گروه اصلی کالا': c.name,
        'وزن فروش (ک‌گ)': c.salesWgt,
        'وزن مرجوعی (ک‌گ)': c.retWgt,
        'وزن خالص (ک‌گ)': c.netWgt,
        'مبلغ فروش (ریال)': c.salesAmt,
        'مبلغ مرجوعی (ریال)': c.retAmt,
        'فروش خالص (ریال)': c.netAmt,
        'فی نهایی (ریال/ک‌گ)': Math.round(c.netFee),
        'سهم از کل %': c.sharePct.toFixed(1) + '%'
      }));
      const wsCat = XLSX.utils.json_to_sheet(catData);
      XLSX.utils.book_append_sheet(wb, wsCat, 'گروههای اصلی');

      // Sheet 2: Detailed Items
      const itemData = processedMetrics.itemList.map((i, idx) => ({
        'ردیف': idx + 1,
        'کد کالا': i.itemCode,
        'نام کالا': i.itemName,
        'گروه اصلی': i.majorCategory,
        'وزن فروش (ک‌گ)': i.salesQty,
        'وزن مرجوعی (ک‌گ)': i.returnQty,
        'وزن خالص (ک‌گ)': i.netQty,
        'مبلغ فروش (ریال)': i.salesAmt,
        'مبلغ مرجوعی (ریال)': i.returnAmt,
        'فروش خالص (ریال)': i.netAmt,
        'فی نهایی (ریال/ک‌گ)': Math.round(i.netFee),
        'سهم %': i.sharePct.toFixed(1) + '%'
      }));
      const wsItem = XLSX.utils.json_to_sheet(itemData);
      XLSX.utils.book_append_sheet(wb, wsItem, 'ریز کالاها');

      // Sheet 3: Invoices
      const invData = processedMetrics.invoicesList.map((inv, idx) => ({
        'ردیف': idx + 1,
        'شماره فاکتور': inv.invoiceNum,
        'تاریخ': inv.date,
        'نام مشتری': inv.customerName,
        'شهر/استان': inv.city,
        'کارشناس فروش': inv.salesExpert,
        'مبلغ ناخالص (ریال)': inv.grossAmt,
        'مرجوعی (ریال)': inv.retAmt,
        'فروش خالص (ریال)': inv.netAmt,
        'وزن خالص (ک‌گ)': inv.netWgt,
        'وضعیت تسویه': inv.paymentStatus
      }));
      const wsInv = XLSX.utils.json_to_sheet(invData);
      XLSX.utils.book_append_sheet(wb, wsInv, 'لیست فاکتورها');

      // Sheet 4: Customer Summary
      const custData = sortedAndFilteredCustomers.map((c, idx) => ({
        'ردیف': idx + 1,
        'نام خریدار / مشتری': c.customerName,
        'تعداد فاکتور': c.invoiceCount,
        'وزن فروش (ک‌گ)': c.salesWgt,
        'وزن مرجوعی (ک‌گ)': c.retWgt,
        'وزن خالص (ک‌گ)': c.netWgt,
        'مبلغ فروش (ریال)': c.salesAmt,
        'مبلغ مرجوعی (ریال)': c.retAmt,
        'فروش خالص (ریال)': c.netAmt,
        'فی میانگین (ریال/ک‌گ)': Math.round(c.netFee),
        'سهم از کل %': c.sharePct.toFixed(1) + '%'
      }));
      const wsCust = XLSX.utils.json_to_sheet(custData);
      XLSX.utils.book_append_sheet(wb, wsCust, 'فروش مشتریان');

      XLSX.writeFile(wb, `Sayan_Sales_Executive_${dateFrom.replace(/\//g, '-')}_to_${dateTo.replace(/\//g, '-')}.xlsx`);
      toast.success('فایل اکسل با موفقیت تولید و دانلود شد.');
    } catch (e: any) {
      toast.error(`خطا در تولید فایل اکسل: ${e.message}`);
    }
  };

  // ----------------------------------------------------------------------
    // ----------------------------------------------------------------------
  // TAB-AWARE PRINT & EXPORT GENERATOR
  // ----------------------------------------------------------------------
  const getHtmlForCurrentTab = () => {
    const printDateStr = toShamsiStr(new Date().toISOString());
    const printTimeStr = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    const filterSummary = selectedCustomer !== 'all' ? ('خریدار: ' + selectedCustomer) : '';
    const searchSummary = searchQuery ? ('جستجو: ' + searchQuery) : '';

    const buildHeaderHtml = (headerTitle: string, extraNote: string = '') => `
      <div class="header">
        <div style="flex: 1; text-align: right;">
          <h1 style="font-size: 16px; margin: 0 0 6px 0; font-weight: 900; color: #0f172a;">${headerTitle}</h1>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="background-color: #1e3a8a; color: #ffffff; padding: 3px 10px; border-radius: 6px; font-weight: 900; font-size: 11px; display: inline-block;">
              بازه زمانی گزارش: از ${dateFrom} تا ${dateTo}
            </span>
            ${extraNote ? `<span style="background-color: #f1f5f9; color: #334155; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; border: 1px solid #cbd5e1;">${extraNote}</span>` : ''}
            ${filterSummary ? `<span style="background-color: #f1f5f9; color: #334155; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; border: 1px solid #cbd5e1;">${filterSummary}</span>` : ''}
            ${searchSummary ? `<span style="background-color: #f1f5f9; color: #334155; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; border: 1px solid #cbd5e1;">${searchSummary}</span>` : ''}
          </div>
        </div>
        <div style="text-align: left; font-size: 9.5px; color: #64748b; line-height: 1.6; border-right: 2px solid #e2e8f0; padding-right: 12px; margin-right: 12px;">
          <div>زمان چاپ گزارش: <strong style="color: #0f172a;">${printDateStr}</strong> - ${printTimeStr}</div>
          <div style="font-size: 8.5px; color: #94a3b8; margin-top: 2px;">سامانه جامع سایان ERP</div>
        </div>
      </div>
    `;

    if (activeTab === 'hierarchy') {
      const title = 'گزارش سرفصل‌های اصلی کالا (۱۵ گروه اصلی سایان ERP)';
      const filename = 'Sayan_Sales_Categories_' + dateFrom.replace(/\//g, '-') + '_to_' + dateTo.replace(/\//g, '-') + '.pdf';
      const htmlContent = '<html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>' + title + ' (' + dateFrom + ' تا ' + dateTo + ')</title>' +
        '<style>@page { size: A4 portrait; margin: 8mm; } body { font-family: Tahoma, Vazirmatn, sans-serif; padding: 10px; color: #0f172a; direction: rtl; } .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; } .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 15px; } .kpi-card { border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; background: #f8fafc; text-align: center; } .kpi-title { font-size: 9px; color: #64748b; font-weight: bold; } .kpi-val { font-size: 12px; font-weight: 900; margin-top: 3px; font-family: monospace; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; border: 1px solid #cbd5e1; } th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; } th { background-color: #0f172a; color: #fff; font-weight: 900; } tr:nth-child(even) { background-color: #f8fafc; } .total { font-weight: 900; background: #fef3c7 !important; border-top: 2px solid #0f172a; }</style></head><body>' +
        buildHeaderHtml(title) +
        '<div class="kpi-grid">' +
        '<div class="kpi-card"><div class="kpi-title">تعداد گروه‌های اصلی</div><div class="kpi-val">' + processedMetrics.categoryList.length + ' گروه</div></div>' +
        '<div class="kpi-card"><div class="kpi-title">مجموع وزن خالص</div><div class="kpi-val">' + formatWeight(processedMetrics.rangeNetWgt) + ' ک‌گ</div></div>' +
        '<div class="kpi-card"><div class="kpi-title">مجموع فروش خالص</div><div class="kpi-val">' + formatMoney(processedMetrics.rangeNetAmt) + ' ریال</div></div>' +
        '<div class="kpi-card"><div class="kpi-title">میانگین فی نهایی</div><div class="kpi-val">' + formatMoney(processedMetrics.rangeNetFee) + ' ریال</div></div></div>' +
        '<table><thead><tr><th style="width: 35px;">#</th><th style="text-align: right;">نام گروه اصلی کالا</th><th>وزن خالص (ک‌گ)</th><th>فروش خالص (ریال)</th><th>میانگین فی (ریال/ک‌گ)</th><th>سهم %</th></tr></thead><tbody>' +
        processedMetrics.categoryList.map((cat, idx) => '<tr><td>' + (idx + 1) + '</td><td style="text-align: right; font-weight: bold;">' + cat.name + '</td><td>' + formatWeight(cat.netWgt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(cat.netAmt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(cat.netFee) + '</td><td>' + cat.sharePct.toFixed(1) + '%</td></tr>').join('') +
        '<tr class="total"><td colspan="2" style="text-align: right;">جمع کل</td><td>' + formatWeight(processedMetrics.rangeNetWgt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(processedMetrics.rangeNetAmt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(processedMetrics.rangeNetFee) + '</td><td>100%</td></tr></tbody></table></body></html>';
      return { htmlContent, title, filename };
    }

    if (activeTab === 'items') {
      const title = 'گزارش تفکیکی و ریز کالاهای فروخته شده (سایان ERP)';
      const filename = 'Sayan_Sales_Detailed_Items_' + dateFrom.replace(/\//g, '-') + '_to_' + dateTo.replace(/\//g, '-') + '.pdf';
      const totQty = filteredItems.reduce((s, i) => s + (i.netQty || 0), 0);
      const totWgt = filteredItems.reduce((s, i: any) => s + (i.netWgt || i.netQty || 0), 0);
      const totAmt = filteredItems.reduce((s, i) => s + (i.netAmt || 0), 0);
      const avgFee = totWgt > 0 ? Math.round(totAmt / totWgt) : 0;

      const htmlContent = '<html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>' + title + ' (' + dateFrom + ' تا ' + dateTo + ')</title>' +
        '<style>@page { size: A4 landscape; margin: 6mm 8mm; } body { font-family: Tahoma, Vazirmatn, sans-serif; padding: 10px; color: #0f172a; direction: rtl; } .header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; } .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; } .kpi-card { border: 1px solid #e2e8f0; padding: 6px 8px; border-radius: 6px; background: #f8fafc; text-align: center; } .kpi-title { font-size: 9px; color: #64748b; font-weight: bold; } .kpi-val { font-size: 11px; font-weight: 900; margin-top: 2px; font-family: monospace; } table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9.5px; border: 1px solid #cbd5e1; } th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: center; } th { background-color: #0f172a; color: #fff; font-weight: 900; } tr:nth-child(even) { background-color: #f8fafc; } .total { font-weight: 900; background: #fef3c7 !important; border-top: 2px solid #0f172a; }</style></head><body>' +
        buildHeaderHtml(title) +
        '<div class="kpi-grid">' +
        '<div class="kpi-card"><div class="kpi-title">تعداد عناوین کالاها</div><div class="kpi-val">' + filteredItems.length + ' قلم</div></div>' +
        '<div class="kpi-card"><div class="kpi-title">مجموع تعداد/بسته</div><div class="kpi-val">' + totQty.toLocaleString('fa-IR') + '</div></div>' +
        '<div class="kpi-card"><div class="kpi-title">مجموع وزن خالص</div><div class="kpi-val">' + formatWeight(totWgt) + ' ک‌گ</div></div>' +
        '<div class="kpi-card"><div class="kpi-title">مجموع مبلغ فروش</div><div class="kpi-val">' + formatMoney(totAmt) + ' ریال</div></div></div>' +
        '<table><thead><tr><th style="width: 30px;">#</th><th style="width: 75px;">کد کالا</th><th style="text-align: right;">نام کامل کالا</th><th>گروه کالا</th><th>تعداد / بسته</th><th>وزن خالص (ک‌گ)</th><th>مبلغ کل (ریال)</th><th>میانگین فی (ریال/ک‌گ)</th></tr></thead><tbody>' +
        filteredItems.map((item: any, idx) => '<tr><td>' + (idx + 1) + '</td><td style="font-family: monospace;">' + (item.itemCode || '-') + '</td><td style="text-align: right; font-weight: bold;">' + item.itemName + '</td><td>' + (item.majorCategory || '-') + '</td><td>' + (item.netQty || 0).toLocaleString('fa-IR') + '</td><td>' + formatWeight(item.netWgt || item.netQty || 0) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(item.netAmt || 0) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(item.netFee || 0) + '</td></tr>').join('') +
        '<tr class="total"><td colspan="4" style="text-align: right;">جمع کل اقلام</td><td>' + totQty.toLocaleString('fa-IR') + '</td><td>' + formatWeight(totWgt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(totAmt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(avgFee) + '</td></tr></tbody></table></body></html>';
      return { htmlContent, title, filename };
    }

    if (activeTab === 'invoices') {
      const title = 'گزارش جامع لیست فاکتورهای فروش (سایان ERP)';
      const filename = 'Sayan_Sales_Invoices_' + dateFrom.replace(/\//g, '-') + '_to_' + dateTo.replace(/\//g, '-') + '.pdf';
      const totWgt = filteredInvoices.reduce((s, i) => s + (i.netWgt || 0), 0);
      const totAmt = filteredInvoices.reduce((s, i) => s + (i.netAmt || 0), 0);

      const htmlContent = '<html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>' + title + ' (' + dateFrom + ' تا ' + dateTo + ')</title>' +
        '<style>@page { size: A4 portrait; margin: 8mm; } body { font-family: Tahoma, Vazirmatn, sans-serif; padding: 10px; color: #0f172a; direction: rtl; } .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; } .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; } .kpi-card { border: 1px solid #e2e8f0; padding: 6px 8px; border-radius: 6px; background: #f8fafc; text-align: center; } .kpi-title { font-size: 9px; color: #64748b; font-weight: bold; } .kpi-val { font-size: 11px; font-weight: 900; margin-top: 2px; font-family: monospace; } table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9.5px; border: 1px solid #cbd5e1; } th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; } th { background-color: #0f172a; color: #fff; font-weight: 900; } tr:nth-child(even) { background-color: #f8fafc; } .total { font-weight: 900; background: #fef3c7 !important; border-top: 2px solid #0f172a; }</style></head><body>' +
        buildHeaderHtml(title) +
        '<div class="kpi-grid">' +
        '<div class="kpi-card"><div class="kpi-title">تعداد کل فاکتورها</div><div class="kpi-val">' + filteredInvoices.length + ' فقره</div></div>' +
        '<div class="kpi-card"><div class="kpi-title">مجموع وزن فاکتورها</div><div class="kpi-val">' + formatWeight(totWgt) + ' ک‌گ</div></div>' +
        '<div class="kpi-card"><div class="kpi-title">مجموع مبلغ فاکتورها</div><div class="kpi-val">' + formatMoney(totAmt) + ' ریال</div></div></div>' +
        '<table><thead><tr><th style="width: 30px;">#</th><th>شماره فاکتور</th><th>تاریخ فاکتور</th><th style="text-align: right;">خریدار / مشتری</th><th>شهر / محل</th><th>وزن خالص (ک‌گ)</th><th>مبلغ فاکتور (ریال)</th></tr></thead><tbody>' +
        filteredInvoices.map((inv: any, idx) => '<tr><td>' + (idx + 1) + '</td><td style="font-weight: bold; font-family: monospace;">' + inv.invoiceNum + '</td><td style="font-family: monospace;">' + (inv.date || inv.invoiceDate || '-') + '</td><td style="text-align: right; font-weight: bold;">' + (inv.customerName || 'مشتری متفرقه') + '</td><td>' + (inv.city || '-') + '</td><td>' + formatWeight(inv.netWgt || 0) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(inv.netAmt || 0) + '</td></tr>').join('') +
        '<tr class="total"><td colspan="5" style="text-align: right;">جمع کل فاکتورها</td><td>' + formatWeight(totWgt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(totAmt) + '</td></tr></tbody></table></body></html>';
      return { htmlContent, title, filename };
    }

    if (activeTab === 'customers') {
      const title = 'گزارش فروش بر اساس مشتریان و اشخاص (Customer Sales Breakdown)';
      const filename = 'Sayan_Sales_Customers_' + dateFrom.replace(/\//g, '-') + '_to_' + dateTo.replace(/\//g, '-') + '.pdf';
      const custs = sortedAndFilteredCustomers;
      const totInvoices = custs.reduce((s, c) => s + c.invoiceCount, 0);
      const totWgt = custs.reduce((s, c) => s + c.netWgt, 0);
      const totAmt = custs.reduce((s, c) => s + c.netAmt, 0);
      const avgFee = totWgt > 0 ? Math.round(totAmt / totWgt) : 0;

      const htmlContent = '<html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>' + title + ' (' + dateFrom + ' تا ' + dateTo + ')</title>' +
        '<style>@page { size: A4 portrait; margin: 8mm; } body { font-family: Tahoma, Vazirmatn, sans-serif; padding: 10px; color: #0f172a; direction: rtl; } .header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; } .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; } .kpi-card { border: 1px solid #e2e8f0; padding: 6px 8px; border-radius: 6px; background: #f8fafc; text-align: center; } .kpi-title { font-size: 9px; color: #64748b; font-weight: bold; } .kpi-val { font-size: 11px; font-weight: 900; margin-top: 2px; font-family: monospace; } table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9.5px; border: 1px solid #cbd5e1; } th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: center; } th { background-color: #0f172a; color: #fff; font-weight: 900; } tr:nth-child(even) { background-color: #f8fafc; } .total { font-weight: 900; background: #fef3c7 !important; border-top: 2px solid #0f172a; }</style></head><body>' +
        buildHeaderHtml(title) +
        '<div class="kpi-grid">' +
        '<div class="kpi-card"><div class="kpi-title">تعداد مشتریان فعال</div><div class="kpi-val">' + custs.length + ' شخص</div></div>' +
        '<div class="kpi-card"><div class="kpi-title">تعداد فاکتورها</div><div class="kpi-val">' + totInvoices.toLocaleString('fa-IR') + '</div></div>' +
        '<div class="kpi-card"><div class="kpi-title">مجموع وزن خرید</div><div class="kpi-val">' + formatWeight(totWgt) + ' ک‌گ</div></div>' +
        '<div class="kpi-card"><div class="kpi-title">مجموع ارزش خرید</div><div class="kpi-val">' + formatMoney(totAmt) + ' ریال</div></div></div>' +
        '<table><thead><tr><th style="width: 30px;">#</th><th style="text-align: right;">نام خریدار / مشتری</th><th>تعداد فاکتور</th><th>وزن خرید (ک‌گ)</th><th>ارزش کل خرید (ریال)</th><th>میانگین فی (ریال/ک‌گ)</th></tr></thead><tbody>' +
        custs.map((c: any, idx) => '<tr><td>' + (idx + 1) + '</td><td style="text-align: right; font-weight: bold;">' + c.customerName + '</td><td>' + c.invoiceCount + '</td><td>' + formatWeight(c.netWgt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(c.netAmt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(c.netFee || c.avgFee || 0) + '</td></tr>').join('') +
        '<tr class="total"><td colspan="2" style="text-align: right;">جمع کل مشتریان</td><td>' + totInvoices.toLocaleString('fa-IR') + '</td><td>' + formatWeight(totWgt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(totAmt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(avgFee) + '</td></tr></tbody></table></body></html>';
      return { htmlContent, title, filename };
    }

    const title = compareMode ? 'گزارش مدیریتی و تحلیلی مقایسه‌ای فروش سایان ERP' : 'داشبورد مدیریتی و خلاصه فروش سایان ERP';
    const filename = 'Sayan_Sales_Executive_' + dateFrom.replace(/\//g, '-') + '_to_' + dateTo.replace(/\//g, '-') + '.pdf';

    const docHtml = '<html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>' + title + ' (' + dateFrom + ' تا ' + dateTo + ')</title><style>body { font-family: Tahoma, Vazirmatn, sans-serif; padding: 20px; background: #fff; color: #1e293b; direction: rtl; } .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; } .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; } .kpi-card { border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px; background: #f8fafc; text-align: center; } .kpi-title { font-size: 10px; color: #64748b; font-weight: bold; } .kpi-val { font-size: 14px; font-weight: bold; color: #0f172a; margin-top: 4px; font-family: monospace; } table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; border: 1px solid #cbd5e1; } th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: center; } th { background-color: #0f172a; color: #fff; font-weight: bold; } tr:nth-child(even) { background-color: #f1f5f9; } .total { font-weight: bold; background: #fef3c7 !important; border-top: 2px solid #0f172a; }</style></head><body>' +
      buildHeaderHtml(title) +
      '<div class="kpi-grid"><div class="kpi-card"><div class="kpi-title">فروش خالص بازه</div><div class="kpi-val">' + formatMoney(processedMetrics.rangeNetAmt) + ' ریال</div></div><div class="kpi-card"><div class="kpi-title">وزن خالص بازه</div><div class="kpi-val">' + formatWeight(processedMetrics.rangeNetWgt) + ' ک‌گ</div></div><div class="kpi-card"><div class="kpi-title">فی نهایی میانگین</div><div class="kpi-val">' + formatMoney(processedMetrics.rangeNetFee) + ' ریال/ک‌گ</div></div><div class="kpi-card"><div class="kpi-title">تعداد فاکتورها</div><div class="kpi-val">' + processedMetrics.invoiceCount + ' عدد</div></div></div><h2>جدول عملکرد گروههای اصلی کالا (15 گروه)</h2><table><thead><tr><th>ردیف</th><th style="text-align: right;">نام گروه اصلی</th><th>وزن خالص (ک‌گ)</th><th>فروش خالص (ریال)</th><th>فی نهایی (ریال/ک‌گ)</th><th>سهم %</th></tr></thead><tbody>' + processedMetrics.categoryList.map((cat, idx) => '<tr><td>' + (idx + 1) + '</td><td style="text-align: right; font-weight: bold;">' + cat.name + '</td><td>' + formatWeight(cat.netWgt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(cat.netAmt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(cat.netFee) + '</td><td>' + cat.sharePct.toFixed(1) + '%</td></tr>').join('') + '<tr class="total"><td colspan="2" style="text-align: right;">جمع کل</td><td>' + formatWeight(processedMetrics.rangeNetWgt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(processedMetrics.rangeNetAmt) + '</td><td style="text-align: left; font-family: monospace;">' + formatMoney(processedMetrics.rangeNetFee) + '</td><td>100%</td></tr></tbody></table></body></html>';
    return { htmlContent: docHtml, title, filename };
  };

    const handleShareCurrentTabToChat = () => {
    if (!onShareToChat) return;
    const { htmlContent, title, filename } = getHtmlForCurrentTab();
    const customGenerator = async () => {
      let filterNote = selectedCustomer !== "all" ? (" (خریدار: " + selectedCustomer + ")") : "";
      let searchNote = searchQuery ? (" (جستجو: " + searchQuery + ")") : "";
      let defaultMsg = `📊 ${title}${filterNote}${searchNote} (${dateFrom} تا ${dateTo})
• مجموع فروش: ${formatMoney(processedMetrics.rangeNetAmt)} ریال
• مجموع وزن: ${formatWeight(processedMetrics.rangeNetWgt)} کیلوگرم
📄 فایل PDF تفکیکی گزارش پیوست گردید.`;
      return { htmlContent, pdfFilename: filename, defaultMsg };
    };
    onShareToChat(customGenerator, title);
  };

  const handlePrint = () => {
    const { htmlContent } = getHtmlForCurrentTab();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };
  // ----------------------------------------------------------------------
  // DOWNLOAD COMPARATIVE PDF
  // ----------------------------------------------------------------------
  const handleDownloadComparePdf = async () => {
    try {
      toast('در حال تولید و دانلود فایل PDF مقایسه‌ای...', { icon: '⏳' });
      const isItems = compareModeType === 'items';
      const rows = isItems
        ? (comparisonMetrics ? comparisonMetrics.compareItemRows : [])
        : (comparisonMetrics ? comparisonMetrics.compareGroupRows : []);

      const response = await fetch(getEffectiveApiUrl('/api/sayan/sales-report/download-compare-pdf'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compareType: compareModeType,
          chartData: rows.map(r => ({
            name: isItems ? r.itemName : r.catName,
            category: isItems ? r.majorCategory : undefined,
            netWeightA: r.netWgtA,
            netAmountA: r.netAmtA,
            retWeightA: r.retWgtA,
            netWeightB: r.netWgtB,
            netAmountB: r.netAmtB,
            retWeightB: r.retWgtB,
            netFeeA: r.netFeeA,
            netFeeB: r.netFeeB
          })),
          dateFromA: dateFrom,
          dateToA: dateTo,
          dateFromB: salesDateFromB,
          dateToB: salesDateToB
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'خطا در دریافت فایل PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Compare_Sales_Report_${dateFrom.replace(/\//g, '-')}_vs_${(salesDateFromB || 'B').replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('فایل PDF مقایسه‌ای با موفقیت دانلود گردید.');
    } catch (e: any) {
      toast.error(`خطا در دریافت PDF: ${e.message}`);
    }
  };

  // ----------------------------------------------------------------------
  // BOT DISPATCH HANDLERS
  // ----------------------------------------------------------------------
  const computedCustomTargets = useMemo(() => {
    if (botSendMode === 'default_groups') {
      return undefined;
    }
    const targets: { platform: string; id: string }[] = [];
    if (selectedPlatforms.includes('telegram') && customChatIdsTele.length > 0) {
      customChatIdsTele.forEach(id => {
        if (id && id.trim()) targets.push({ platform: 'telegram', id: id.trim() });
      });
    }
    if (selectedPlatforms.includes('bale') && customChatIdsBale.length > 0) {
      customChatIdsBale.forEach(id => {
        if (id && id.trim()) targets.push({ platform: 'bale', id: id.trim() });
      });
    }
    if (selectedPlatforms.includes('whatsapp')) {
      if (customChatIdsWa.length > 0) {
        customChatIdsWa.forEach(id => {
          if (id && id.trim()) targets.push({ platform: 'whatsapp', id: id.trim() });
        });
      }
      if (manualWhatsappPhone && manualWhatsappPhone.trim()) {
        const cleanWa = manualWhatsappPhone.trim().replace(/[^0-9]/g, '');
        if (cleanWa) targets.push({ platform: 'whatsapp', id: cleanWa });
      }
    }
    const unique = targets.filter(
      (t, i, arr) => arr.findIndex(x => x.platform === t.platform && x.id === t.id) === i
    );
    return unique.length > 0 ? unique : undefined;
  }, [botSendMode, selectedPlatforms, customChatIdsTele, customChatIdsBale, customChatIdsWa, manualWhatsappPhone]);

  const handleSendCompareToBots = async () => {
    setIsSendingBot(true);
    try {
      const groupRows = comparisonMetrics ? comparisonMetrics.compareGroupRows : [];
      const response = await fetch(getEffectiveApiUrl('/api/sayan/sales-report/send-compare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chartData: groupRows.map(r => ({
            name: r.catName,
            netWeightA: r.netWgtA,
            netAmountA: r.netAmtA,
            retWeightA: r.retWgtA,
            netWeightB: r.netWgtB,
            netAmountB: r.netAmtB,
            retWeightB: r.retWgtB,
            netFeeA: r.netFeeA,
            netFeeB: r.netFeeB
          })),
          dateFromA: dateFrom,
          dateToA: dateTo,
          dateFromB: salesDateFromB,
          dateToB: salesDateToB,
          selectedPlatforms,
          customTargets: computedCustomTargets
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'خطا در ارسال گزارش مقایسه‌ای به پیام‌رسان‌ها');

      const failed = resData.sendDetails?.filter((d: any) => d.status === 'failed') || [];
      const successes = resData.sendDetails?.filter((d: any) => d.status === 'success') || [];

      if (failed.length > 0) {
        const successMsg = successes.map((s: any) => s.platform === 'telegram' ? 'تلگرام' : s.platform === 'bale' ? 'بله' : s.platform).join(' و ');
        const failMsg = failed.map((f: any) => `${f.platform === 'telegram' ? 'تلگرام' : f.platform === 'bale' ? 'بله' : f.platform} (خطا: ${f.error || 'نامشخص'})`).join('، ');
        if (successes.length > 0) {
          toast(`گزارش مقایسه‌ای به ${successMsg} ارسال شد، اما در ارسال به ${failMsg} خطا رخ داد.`, { icon: '⚠️', duration: 10000 });
        } else {
          toast.error(`ارسال گزارش مقایسه‌ای ناموفق بود: ${failMsg}`, { duration: 10000 });
        }
      } else {
        toast.success(resData.message || 'گزارش مقایسه‌ای با موفقیت به پیام‌رسان‌ها ارسال گردید.');
      }
      setIsBotModalOpen(false);
    } catch (e: any) {
      toast.error(`خطا در ارسال گزارش مقایسه‌ای: ${e.message}`);
    } finally {
      setIsSendingBot(false);
    }
  };

  const handleSendManualReport = async (targetDate: 'today' | 'yesterday' | 'custom') => {
    setIsSendingBot(true);
    try {
      let bodyData: any = { 
        selectedPlatforms, 
        customTargets: computedCustomTargets 
      };
      if (targetDate === 'today') {
        bodyData.targetDate = 'today';
        bodyData.label = 'امروز';
      } else if (targetDate === 'yesterday') {
        bodyData.targetDate = 'yesterday';
        bodyData.label = 'دیروز';
      } else {
        bodyData.date = dateFrom;
        bodyData.label = `بازه ${dateFrom} تا ${dateTo}`;
      }

      const response = await fetch(getEffectiveApiUrl('/api/sayan/sales-report/send-manual'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || resData.message || 'خطا در ارسال دستی گزارش');

      const failed = resData.result?.sendDetails?.filter((d: any) => d.status === 'failed') || [];
      const successes = resData.result?.sendDetails?.filter((d: any) => d.status === 'success') || [];

      if (failed.length > 0) {
        const successMsg = successes.map((s: any) => s.platform === 'telegram' ? 'تلگرام' : s.platform === 'bale' ? 'بله' : s.platform).join(' و ');
        const failMsg = failed.map((f: any) => `${f.platform === 'telegram' ? 'تلگرام' : f.platform === 'bale' ? 'بله' : f.platform} (خطا: ${f.error || 'نامشخص'})`).join('، ');
        if (successes.length > 0) {
          toast(`گزارش دستی به ${successMsg} ارسال شد، اما در ارسال به ${failMsg} خطا رخ داد.`, { icon: '⚠️', duration: 10000 });
        } else {
          toast.error(`ارسال گزارش دستی ناموفق بود: ${failMsg}`, { duration: 10000 });
        }
      } else {
        toast.success(resData.message || 'گزارش با موفقیت به پیام‌رسان‌ها ارسال شد.');
      }
      setIsBotModalOpen(false);
    } catch (e: any) {
      toast.error(`خطا در ارسال دستی گزارش: ${e.message}`);
    } finally {
      setIsSendingBot(false);
    }
  };

  const handleSendToBots = async () => {
    if (compareMode) {
      await handleSendCompareToBots();
      return;
    }

    setIsSendingBot(true);
    try {
      const response = await fetch(getEffectiveApiUrl('/api/sayan/sales-report/send-executive'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateFrom,
          dateTo,
          selectedPlatforms,
          customTargets: computedCustomTargets,
          summary: {
            netAmount: processedMetrics.rangeNetAmt,
            netWeight: processedMetrics.rangeNetWgt,
            avgFee: processedMetrics.rangeNetFee,
            invoiceCount: processedMetrics.invoiceCount,
            customerCount: processedMetrics.customerCount,
            avgInvoiceAmt: processedMetrics.avgInvoiceAmt,
            topGroup: processedMetrics.insights.topGroup,
            topProduct: processedMetrics.insights.topProductByAmt,
            returnAmount: processedMetrics.rangeRetAmt,
            returnWeight: processedMetrics.rangeRetWgt
          },
          groupData: processedMetrics.categoryList.map(c => ({
            name: c.name,
            netWgt: c.netWgt,
            netAmt: c.netAmt,
            netFee: c.netFee,
            sharePct: c.sharePct
          }))
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'خطا در ارسال به پیام‌رسان‌ها');

      const failed = resData.sendDetails?.filter((d: any) => d.status === 'failed') || [];
      const successes = resData.sendDetails?.filter((d: any) => d.status === 'success') || [];

      if (failed.length > 0) {
        const successMsg = successes.map((s: any) => s.platform === 'telegram' ? 'تلگرام' : s.platform === 'bale' ? 'بله' : s.platform).join(' و ');
        const failMsg = failed.map((f: any) => `${f.platform === 'telegram' ? 'تلگرام' : f.platform === 'bale' ? 'بله' : f.platform} (خطا: ${f.error || 'نامشخص'})`).join('، ');
        if (successes.length > 0) {
          toast(`گزارش به ${successMsg} ارسال شد، اما در ارسال به ${failMsg} خطا رخ داد.`, { icon: '⚠️', duration: 10000 });
        } else {
          toast.error(`ارسال گزارش ناموفق بود: ${failMsg}`, { duration: 10000 });
        }
      } else {
        toast.success(resData.message || 'گزارش با موفقیت به پیام‌رسان‌ها ارسال گردید.');
      }
      setIsBotModalOpen(false);
    } catch (e: any) {
      toast.error(`خطا در ارسال گزارش: ${e.message}`);
    } finally {
      setIsSendingBot(false);
    }
  };

  // Filtered Items for Search
  const filteredItems = useMemo(() => {
    if (!searchQuery) return processedMetrics.itemList;
    const q = searchQuery.toLowerCase();
    return processedMetrics.itemList.filter(i => 
      i.itemName.toLowerCase().includes(q) || 
      i.majorCategory.toLowerCase().includes(q) ||
      i.itemCode.toLowerCase().includes(q)
    );
  }, [processedMetrics.itemList, searchQuery]);

  // Filtered Invoices for Search
  const filteredInvoices = useMemo(() => {
    if (!searchQuery) return processedMetrics.invoicesList;
    const q = searchQuery.toLowerCase();
    return processedMetrics.invoicesList.filter(inv => 
      inv.invoiceNum.toLowerCase().includes(q) ||
      inv.customerName.toLowerCase().includes(q) ||
      inv.city.toLowerCase().includes(q) ||
      inv.salesExpert.toLowerCase().includes(q)
    );
  }, [processedMetrics.invoicesList, searchQuery]);

  // All Available Customers (for dropdown filter)
  const allAvailableCustomers = useMemo(() => {
    const custMap = new Map<string, { count: number; totalAmt: number; totalWgt: number }>();
    salesData.forEach(row => {
      if (!isActualProduct(row)) return;
      if (invoiceFilter === 'official' && row.isOfficial !== true) return false;
      if (invoiceFilter === 'unofficial' && row.isOfficial === true) return false;
      if (excludeOther && !row.GroupName && !row.ItemName) return false;
      const name = (row.CustomerName || '').trim() || 'مشتری متفرقه';
      const amt = parseFloat(row.Amount || '0') || 0;
      const qty = parseFloat(row.Quantity || '0') || 0;
      const isRet = String(row.OpCode || '').trim() === '13';
      const netAmt = isRet ? -amt : amt;
      const netWgt = isRet ? -qty : qty;
      const prev = custMap.get(name) || { count: 0, totalAmt: 0, totalWgt: 0 };
      custMap.set(name, {
        count: prev.count + 1,
        totalAmt: prev.totalAmt + netAmt,
        totalWgt: prev.totalWgt + netWgt
      });
    });
    return Array.from(custMap.entries())
      .map(([name, data]) => ({ name, count: data.count, totalAmt: data.totalAmt, totalWgt: data.totalWgt }))
      .sort((a, b) => b.totalAmt - a.totalAmt);
  }, [salesData, invoiceFilter, excludeOther]);

  // Filtered list of customers inside the dropdown picker search
  const filteredAvailableCustomers = useMemo(() => {
    if (!customerFilterSearchQuery) return allAvailableCustomers;
    const q = customerFilterSearchQuery.trim().toLowerCase();
    return allAvailableCustomers.filter(c => c.name.toLowerCase().includes(q));
  }, [allAvailableCustomers, customerFilterSearchQuery]);

  // Aggregated Customer Report List (with drill-down invoices & items)
  const customersList = useMemo(() => {
    const custMap = new Map<string, {
      customerName: string;
      invoicesMap: Map<string, {
        invoiceNum: string;
        docId: string;
        date: string;
        city: string;
        salesExpert: string;
        grossAmt: number;
        retAmt: number;
        netAmt: number;
        netWgt: number;
        paymentStatus: string;
      }>;
      itemsMap: Map<string, {
        itemCode: string;
        itemName: string;
        groupName: string;
        majorCategory: string;
        salesQty: number;
        returnQty: number;
        netQty: number;
        salesAmt: number;
        returnAmt: number;
        netAmt: number;
      }>;
      salesAmt: number;
      retAmt: number;
      salesWgt: number;
      retWgt: number;
    }>();

    const baseRows = salesData.filter(row => {
      if (invoiceFilter === 'official' && row.isOfficial !== true) return false;
      if (invoiceFilter === 'unofficial' && row.isOfficial === true) return false;
      if (excludeOther && !row.GroupName && !row.ItemName) return false;
      if (selectedCustomer !== 'all' && (row.CustomerName || 'مشتری متفرقه').trim() !== selectedCustomer.trim()) return false;
      return true;
    });

    let totalAllNetAmt = 0;

    baseRows.forEach(row => {
      if (!isActualProduct(row)) return;
      const amt = parseFloat(row.Amount || '0') || 0;
      const qty = parseFloat(row.Quantity || '0') || 0;
      const isReturn = String(row.OpCode || '').trim() === '13';
      const custName = (row.CustomerName || '').trim() || 'مشتری متفرقه';
      const invNum = row.InvoiceNum || row.DocId || 'بدون شماره';
      const docKey = row.DocId ? String(row.DocId) : invNum;
      const majorCat = classifyMajorCategory(row.GroupName, row.ItemName, row.ItemCode);
      const itemKey = row.ItemCode || row.ItemName || 'کالا';

      if (!custMap.has(custName)) {
        custMap.set(custName, {
          customerName: custName,
          invoicesMap: new Map(),
          itemsMap: new Map(),
          salesAmt: 0,
          retAmt: 0,
          salesWgt: 0,
          retWgt: 0
        });
      }
      const record = custMap.get(custName)!;
      if (isReturn) {
        record.retAmt += amt;
        record.retWgt += qty;
        totalAllNetAmt -= amt;
      } else {
        record.salesAmt += amt;
        record.salesWgt += qty;
        totalAllNetAmt += amt;
      }

      // Invoices aggregation
      if (!record.invoicesMap.has(docKey)) {
        record.invoicesMap.set(docKey, {
          invoiceNum: invNum,
          docId: docKey,
          date: toShamsiStr(row.Date),
          city: row.City || 'نامشخص',
          salesExpert: row.SalesExpert || 'کارشناس فروش',
          grossAmt: 0,
          retAmt: 0,
          netAmt: 0,
          netWgt: 0,
          paymentStatus: row.PaymentStatus || 'تسویه شده'
        });
      }
      const inv = record.invoicesMap.get(docKey)!;
      if (isReturn) {
        inv.retAmt += amt;
        inv.netAmt -= amt;
        inv.netWgt -= qty;
      } else {
        inv.grossAmt += amt;
        inv.netAmt += amt;
        inv.netWgt += qty;
      }

      // Items aggregation
      if (!record.itemsMap.has(itemKey)) {
        record.itemsMap.set(itemKey, {
          itemCode: row.ItemCode || '',
          itemName: row.ItemName || 'کالای بدون نام',
          groupName: row.GroupName || 'سایر',
          majorCategory: majorCat,
          salesQty: 0,
          returnQty: 0,
          netQty: 0,
          salesAmt: 0,
          returnAmt: 0,
          netAmt: 0
        });
      }
      const it = record.itemsMap.get(itemKey)!;
      if (isReturn) {
        it.returnQty += qty;
        it.returnAmt += amt;
        it.netQty -= qty;
        it.netAmt -= amt;
      } else {
        it.salesQty += qty;
        it.salesAmt += amt;
        it.netQty += qty;
        it.netAmt += amt;
      }
    });

    return Array.from(custMap.values()).map(c => {
      const netAmt = c.salesAmt - c.retAmt;
      const netWgt = c.salesWgt - c.retWgt;
      const netFee = netWgt > 0 ? (netAmt / netWgt) : 0;
      const sharePct = totalAllNetAmt > 0 ? ((netAmt / totalAllNetAmt) * 100) : 0;

      const invoices = Array.from(c.invoicesMap.values()).sort((a, b) => b.netAmt - a.netAmt);
      const items = Array.from(c.itemsMap.values())
        .map(it => ({
          ...it,
          netFee: it.netQty > 0 ? (it.netAmt / it.netQty) : 0
        }))
        .sort((a, b) => b.netAmt - a.netAmt);

      return {
        customerName: c.customerName,
        invoiceCount: invoices.length,
        invoices,
        items,
        salesAmt: c.salesAmt,
        retAmt: c.retAmt,
        netAmt,
        salesWgt: c.salesWgt,
        retWgt: c.retWgt,
        netWgt,
        netFee,
        sharePct
      };
    });
  }, [salesData, invoiceFilter, excludeOther, selectedCustomer]);

  // Sorted and filtered customers for Customers Tab
  const sortedAndFilteredCustomers = useMemo(() => {
    let list = [...customersList];
    if (customerSearchQuery) {
      const q = customerSearchQuery.trim().toLowerCase();
      list = list.filter(c => c.customerName.toLowerCase().includes(q));
    }
    switch (customerSortBy) {
      case 'netAmt_desc':
        return list.sort((a, b) => b.netAmt - a.netAmt);
      case 'netAmt_asc':
        return list.sort((a, b) => a.netAmt - b.netAmt);
      case 'netWgt_desc':
        return list.sort((a, b) => b.netWgt - a.netWgt);
      case 'netWgt_asc':
        return list.sort((a, b) => a.netWgt - b.netWgt);
      case 'invoices_desc':
        return list.sort((a, b) => b.invoiceCount - a.invoiceCount);
      case 'name_asc':
        return list.sort((a, b) => a.customerName.localeCompare(b.customerName, 'fa'));
      default:
        return list.sort((a, b) => b.netAmt - a.netAmt);
    }
  }, [customersList, customerSearchQuery, customerSortBy]);

  // ----------------------------------------------------------------------
  // RENDER UI
  // ----------------------------------------------------------------------
  return (
    <div id="executive-sales-dashboard" className="w-full space-y-4 sm:space-y-6 text-right dir-rtl font-sans pb-8 px-0 sm:px-1 bg-transparent">
      
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-900 rounded-2xl p-5 text-white shadow-xl border border-blue-800/40 relative z-30">
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        </div>
        
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-500/20 border border-blue-400/30 rounded-xl text-blue-300">
                <BarChart2 className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <span>داشبورد ارشد مدیریتی و تصمیم‌گیری فروش سایان ERP</span>
                  <span className="bg-emerald-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">نسخه سازمانی</span>
                </h1>
                <p className="text-xs text-blue-200/80 mt-1">
                  پایش هومیوستاتیک فروش خالص، وزن، مرجوعی کد ۱۳، فی نهایی نوسانی، و پایش مقایسه‌ای دو بازه
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <button
              type="button"
              onClick={() => handleSendManualReport('today')}
              disabled={isSendingBot}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50 min-h-[40px]"
              title="ارسال دستی خلاصه فروش امروز به پیام‌رسان‌های بله و تلگرام"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSendingBot ? 'در حال ارسال...' : 'ارسال دستی امروز به بات'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSendManualReport('yesterday')}
              disabled={isSendingBot}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50 min-h-[40px]"
              title="ارسال دستی خلاصه فروش دیروز به پیام‌رسان‌های بله و تلگرام"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSendingBot ? 'در حال ارسال...' : 'ارسال دستی دیروز به بات'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsBotModalOpen(true)}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-2 shadow-lg hover:shadow-emerald-500/20 transition-all cursor-pointer min-h-[40px]"
              title="تنظیمات پیشرفته و ارسال سفارشی گزارش به بات‌ها"
            >
              <Send className="w-4 h-4" />
              <span>ارسال به پیام‌رسان‌ها (تنظیمات)</span>
            </button>

            {compareMode && (
              <>
                <button
                  onClick={handleDownloadComparePdf}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md hover:shadow-rose-500/20 transition-all cursor-pointer"
                  title="دانلود فایل PDF گزارش مقایسه‌ای دوره A vs دوره B"
                >
                  <Download className="w-4 h-4" />
                  <span>دانلود PDF مقایسه‌ای</span>
                </button>

                <button
                  onClick={handleSendToBots}
                  disabled={isSendingBot}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md hover:shadow-purple-500/20 transition-all cursor-pointer disabled:opacity-50"
                  title="ارسال فوری گزارش مقایسه‌ای دوره A vs B به پیام‌رسان‌ها"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>ارسال مقایسه‌ای به بات</span>
                </button>
              </>
            )}

            <button
              onClick={handleExportImage}
              disabled={isExportingImage}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 border border-white/20 backdrop-blur-md transition-all cursor-pointer disabled:opacity-50"
              title="دانلود تصویر کل داشبورد با کیفیت بالا"
            >
              <ImageIcon className="w-4 h-4 text-purple-300" />
              <span>{isExportingImage ? 'در حال تصویربرداری...' : 'خروجی تصویر'}</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 border border-white/20 backdrop-blur-md transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>خروجی Excel</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 border border-white/20 backdrop-blur-md transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-amber-300" />
              <span>خروجی CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 border border-white/20 backdrop-blur-md transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-blue-300" />
              <span>چاپ / PDF</span>
            </button>

            {onRefreshData && (
              <button
                onClick={onRefreshData}
                disabled={isLoading}
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all cursor-pointer disabled:opacity-50"
                title="به‌روزرسانی داده‌ها"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* DATE RANGE PRESETS & PICKERS */}
        <div className="mt-6 pt-4 border-t border-white/10 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            
            {/* Presets */}
            <div className="md:col-span-7 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-blue-300 ml-1">بازه اصلی (دوره A):</span>
              {[
                { id: 'today', label: 'امروز' },
                { id: 'yesterday', label: 'دیروز' },
                { id: 'this_week', label: 'این هفته' },
                { id: 'this_month', label: 'این ماه' },
                { id: 'last_month', label: 'ماه قبل' },
                { id: 'this_year', label: 'امسال' },
                { id: 'last_year', label: 'سال قبل' }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedPreset === p.id 
                      ? 'bg-blue-500 text-white shadow-md font-extrabold' 
                      : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Date Inputs A & Compare Toggle */}
            <div className="md:col-span-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const nextMode = !compareMode;
                  if (nextMode && (!salesDateFromB || !salesDateToB)) {
                    applyPreset('prev_year');
                  } else if (onToggleCompareMode) {
                    onToggleCompareMode(nextMode);
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  compareMode
                    ? 'bg-purple-500 hover:bg-purple-400 text-white shadow-lg shadow-purple-500/20 ring-2 ring-purple-300/30'
                    : 'bg-white/10 hover:bg-white/20 text-slate-200 border border-white/20'
                }`}
                title="فعال‌سازی یا غیرفعال‌سازی حالت مقایسه‌ای دوره A vs دوره B"
              >
                <span>{compareMode ? '📊 مقایسه فعال (دوره B)' : '➕ افزودن بازه مقایسه‌ای'}</span>
              </button>

              <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-xl border border-white/10">
                <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-white/10">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  <input
                    type="text"
                    value={dateFrom}
                    onChange={(e) => {
                      setSelectedPreset('custom');
                      if (onDateRangeChange) onDateRangeChange(e.target.value, dateTo);
                    }}
                    placeholder="از تاریخ"
                    className="w-20 text-center font-mono font-bold text-xs bg-transparent outline-none text-white"
                  />
                </div>
                <span className="text-xs text-slate-400">تا</span>
                <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-white/10">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  <input
                    type="text"
                    value={dateTo}
                    onChange={(e) => {
                      setSelectedPreset('custom');
                      if (onDateRangeChange) onDateRangeChange(dateFrom, e.target.value);
                    }}
                    placeholder="تا تاریخ"
                    className="w-20 text-center font-mono font-bold text-xs bg-transparent outline-none text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECONDARY COMPARISON PERIOD (PERIOD B) - Appears when compareMode is ON */}
          {compareMode && (
            <div className="bg-purple-950/40 p-3 rounded-2xl border border-purple-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fadeIn">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-purple-200 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                  بازه مقایسه‌ای (دوره B):
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset('prev_year')}
                    className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/30 rounded-lg text-[11px] px-2.5 py-1 font-bold transition-all cursor-pointer"
                  >
                    همسان سال قبل (پارسال)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('prev_month')}
                    className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/30 rounded-lg text-[11px] px-2.5 py-1 font-bold transition-all cursor-pointer"
                  >
                    ماه قبل
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('prev_quarter')}
                    className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-500/30 rounded-lg text-[11px] px-2.5 py-1 font-bold transition-all cursor-pointer"
                  >
                    فصل قبل
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-purple-300 font-bold hidden sm:inline">تاریخ دوره B:</span>
                <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-purple-500/30">
                  <div className="flex items-center gap-1 bg-slate-900/90 px-2 py-1 rounded-lg border border-purple-400/20">
                    <Calendar className="w-3.5 h-3.5 text-purple-400" />
                    <input
                      type="text"
                      value={salesDateFromB}
                      onChange={(e) => {
                        if (onCompareDateRangeChange) onCompareDateRangeChange(e.target.value, salesDateToB);
                      }}
                      placeholder="از تاریخ B"
                      className="w-20 text-center font-mono font-bold text-xs bg-transparent outline-none text-purple-100"
                    />
                  </div>
                  <span className="text-xs text-purple-300 font-bold">تا</span>
                  <div className="flex items-center gap-1 bg-slate-900/90 px-2 py-1 rounded-lg border border-purple-400/20">
                    <Calendar className="w-3.5 h-3.5 text-purple-400" />
                    <input
                      type="text"
                      value={salesDateToB}
                      onChange={(e) => {
                        if (onCompareDateRangeChange) onCompareDateRangeChange(salesDateFromB, e.target.value);
                      }}
                      placeholder="تا تاریخ B"
                      className="w-20 text-center font-mono font-bold text-xs bg-transparent outline-none text-purple-100"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Invoice Type Filter (All / Official / Unofficial) */}
          <div className="mt-4 pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold text-blue-300">نوع فاکتورها (پالایش نوع):</span>
                <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/10">
                  {[
                    { id: 'all', label: 'همه فاکتورها' },
                    { id: 'official', label: 'رسمی (ارزش افزوده/کدال)' },
                    { id: 'unofficial', label: 'غیررسمی (عادی)' }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setInvoiceFilter(item.id as any)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        invoiceFilter === item.id
                          ? 'bg-blue-500 text-white shadow-md font-extrabold'
                          : 'text-slate-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {item.id === 'official' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      {item.id === 'unofficial' && <AlertCircle className="w-3.5 h-3.5 text-amber-400" />}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold text-amber-300">مواد اولیه / بدون گروه:</span>
                <button
                  type="button"
                  onClick={() => setExcludeOther(!excludeOther)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 h-[34px] ${
                    excludeOther 
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {excludeOther ? 'حذف شده‌اند (عدم نمایش)' : 'شامل شده‌اند (نمایش)'}
                </button>
              </div>

              {/* Customer Filter Dropdown */}
              <div className="flex flex-col gap-2 relative z-50">
                <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>فیلتر مشتری (اشخاص):</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 h-[34px] border ${
                        selectedCustomer !== 'all'
                          ? 'bg-emerald-500 text-slate-950 font-black border-emerald-300 shadow-md ring-2 ring-emerald-400/40'
                          : 'bg-black/20 text-slate-200 border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span className="max-w-[130px] sm:max-w-[180px] truncate">
                        {selectedCustomer === 'all' ? 'همه مشتریان' : selectedCustomer}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    </button>

                    {isCustomerDropdownOpen && (
                      <div className="absolute top-full right-0 mt-2 w-72 sm:w-80 bg-slate-900 border-2 border-emerald-500/50 rounded-2xl shadow-2xl p-2.5 z-[100] text-right space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-700/60 pb-1.5 px-1">
                          <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-emerald-400" />
                            انتخاب مشتری ({allAvailableCustomers.length} شخص)
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsCustomerDropdownOpen(false)}
                            className="text-slate-400 hover:text-white p-0.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Search input in dropdown */}
                        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-1.5 px-2.5 flex items-center gap-2">
                          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <input
                            type="text"
                            value={customerFilterSearchQuery}
                            onChange={(e) => setCustomerFilterSearchQuery(e.target.value)}
                            placeholder="جستجوی نام مشتری..."
                            className="w-full text-xs bg-transparent border-none outline-none text-white placeholder-slate-400 font-bold"
                            autoFocus
                          />
                          {customerFilterSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setCustomerFilterSearchQuery('')}
                              className="text-slate-400 hover:text-white"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* List */}
                        <div className="max-h-56 overflow-y-auto space-y-1 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomer('all');
                              setIsCustomerDropdownOpen(false);
                            }}
                            className={`w-full text-right p-2 rounded-xl flex items-center justify-between transition-all ${
                              selectedCustomer === 'all'
                                ? 'bg-emerald-600/30 text-emerald-300 font-black border border-emerald-500/40'
                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            <span>همه مشتریان (بدون فیلتر)</span>
                            {selectedCustomer === 'all' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                          </button>

                          {filteredAvailableCustomers.map(cust => (
                            <button
                              key={cust.name}
                              type="button"
                              onClick={() => {
                                setSelectedCustomer(cust.name);
                                setIsCustomerDropdownOpen(false);
                              }}
                              className={`w-full text-right p-2 rounded-xl flex items-center justify-between transition-all ${
                                selectedCustomer === cust.name
                                  ? 'bg-emerald-600/30 text-emerald-300 font-black border border-emerald-500/40'
                                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                              }`}
                            >
                              <div className="truncate pl-2">
                                <div className="font-bold text-white truncate">{cust.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  {cust.count} فاکتور | {formatWeight(cust.totalWgt)} ک‌گ
                                </div>
                              </div>
                              <span className="text-[10px] text-emerald-400 font-mono font-bold shrink-0">
                                {formatMoney(cust.totalAmt)} ریال
                              </span>
                            </button>
                          ))}
                          {filteredAvailableCustomers.length === 0 && (
                            <div className="text-center py-4 text-xs text-slate-400">
                              مشتری با این نام یافت نشد
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedCustomer !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer('all')}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 flex items-center gap-1 transition-all h-[34px]"
                      title="حذف فیلتر شخص و نمایش همه"
                    >
                      <X className="w-3 h-3" />
                      <span>حذف</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {/* Show Quick Stats of Current View */}
            <div className="text-xs text-blue-200/90 font-semibold flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5 self-end sm:self-auto">
              <span>تعداد کل اقلام فیلترشده: <strong className="text-white font-mono font-black">{processedMetrics.filteredRowsCount.toLocaleString('fa-IR')}</strong></span>
              <span className="text-white/30">|</span>
              <span>مجموع وزن خالص: <strong className="text-white font-mono font-black">{formatWeight(processedMetrics.rangeNetWgt)}</strong> ک‌گ</span>
            </div>
          </div>
        </div>
      </div>

      {/* ACTIVE CUSTOMER FILTER BANNER */}
      {selectedCustomer !== 'all' && (
        <div className="bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 border border-emerald-500/50 rounded-2xl p-3.5 px-4 flex flex-wrap items-center justify-between gap-3 text-white shadow-lg animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-400/40 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-emerald-300">گزارش اختصاصی فیلتر شده روی خریدار:</div>
              <div className="text-base font-black text-white flex items-center gap-2">
                <span>{selectedCustomer}</span>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-lg border border-emerald-500/30">
                  {processedMetrics.invoicesList.length} فاکتور
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-xs text-emerald-200 font-mono font-bold bg-black/40 px-3 py-1.5 rounded-xl border border-emerald-500/30 flex items-center gap-3">
              <span>فروش خالص: <strong className="text-emerald-300">{formatMoney(processedMetrics.rangeNetAmt)}</strong> ریال</span>
              <span className="text-white/20">|</span>
              <span>وزن خالص: <strong className="text-emerald-300">{formatWeight(processedMetrics.rangeNetWgt)}</strong> ک‌گ</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCustomer('all')}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>حذف فیلتر و بازگشت به کل فروش</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. TOP EXECUTIVE KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        
        {/* Card 1: Today Performance */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs hover:shadow-md transition-all group flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1.5">
              <span className="text-[11px] font-extrabold text-slate-700">عملکرد فروش امروز</span>
              <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <DollarSign className="w-3.5 h-3.5" />
              </span>
            </div>
            
            {/* Breakdown */}
            <div className="space-y-1 text-[10px] border-b border-slate-100 pb-1.5 mb-1.5">
              <div className="flex justify-between items-center text-slate-500">
                <span>فروش ناخالص:</span>
                <span className="font-mono font-bold text-slate-700">
                  {formatMoney(processedMetrics.todayGrossAmt)}
                  <span className="text-[8.5px] text-slate-400 mr-1">({formatWeight(processedMetrics.todayGrossWgt)} ک‌گ)</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-rose-500">
                <span>مرجوعی:</span>
                <span className="font-mono font-bold">
                  {formatMoney(processedMetrics.todayRetAmt)}
                  <span className="text-[8.5px] text-rose-400 mr-1">({formatWeight(processedMetrics.todayRetWgt)} ک‌گ)</span>
                </span>
              </div>
            </div>
          </div>
          
          <div>
            <div className="text-[9px] text-slate-400 font-bold mb-0.5">خالص نهایی امروز:</div>
            <div className="text-sm font-black text-blue-900 font-mono">
              {formatMoney(processedMetrics.todayNetAmt)} <span className="text-[9px] text-slate-500 font-normal">ریال</span>
            </div>
            <div className="text-[9.5px] text-slate-500 font-medium mt-1 flex items-center justify-between">
              <span>وزن: {formatWeight(processedMetrics.todayNetWgt)} ک‌گ</span>
              <span className="font-mono text-blue-700 font-bold">فی: {formatMoney(processedMetrics.todayNetFee)}</span>
            </div>
          </div>
        </div>

        {/* Card 1.5: Yesterday Performance */}
        <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs hover:shadow-md transition-all group flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 mb-1.5">
              <span className="text-[11px] font-extrabold text-slate-700">عملکرد فروش دیروز</span>
              <span className="p-1.5 bg-cyan-50 text-cyan-600 rounded-lg group-hover:bg-cyan-600 group-hover:text-white transition-colors">
                <Calendar className="w-3.5 h-3.5" />
              </span>
            </div>
            
            {/* Breakdown */}
            <div className="space-y-1 text-[10px] border-b border-slate-100 pb-1.5 mb-1.5">
              <div className="flex justify-between items-center text-slate-500">
                <span>فروش ناخالص:</span>
                <span className="font-mono font-bold text-slate-700">
                  {formatMoney(processedMetrics.yesterdayGrossAmt)}
                  <span className="text-[8.5px] text-slate-400 mr-1">({formatWeight(processedMetrics.yesterdayGrossWgt)} ک‌گ)</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-rose-500">
                <span>مرجوعی:</span>
                <span className="font-mono font-bold">
                  {formatMoney(processedMetrics.yesterdayRetAmt)}
                  <span className="text-[8.5px] text-rose-400 mr-1">({formatWeight(processedMetrics.yesterdayRetWgt)} ک‌گ)</span>
                </span>
              </div>
            </div>
          </div>
          
          <div>
            <div className="text-[9px] text-slate-400 font-bold mb-0.5">خالص نهایی دیروز:</div>
            <div className="text-sm font-black text-slate-900 font-mono">
              {formatMoney(processedMetrics.yesterdayNetAmt)} <span className="text-[9px] text-slate-500 font-normal">ریال</span>
            </div>
            <div className="text-[9.5px] text-slate-500 font-medium mt-1 flex items-center justify-between">
              <span>وزن: {formatWeight(processedMetrics.yesterdayNetWgt)} ک‌گ</span>
              <span className="font-mono text-cyan-700 font-bold">فی: {formatMoney(processedMetrics.yesterdayNetFee)}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Current Month Net Sales */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all group">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold text-slate-600">فروش خالص ماه جاری</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-base font-black text-slate-900 font-mono">
            {formatMoney(processedMetrics.monthNetAmt)} <span className="text-[10px] text-slate-500">ریال</span>
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-1 flex items-center justify-between">
            <span>وزن: {formatWeight(processedMetrics.monthNetWgt)} ک‌گ</span>
            <span className="font-mono text-emerald-700 font-bold">فی: {formatMoney(processedMetrics.monthNetFee)}</span>
          </div>
        </div>

        {/* Card 3: Current Quarter Net Sales */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all group">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold text-slate-600">فروش خالص فصل جاری</span>
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Layers className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-base font-black text-slate-900 font-mono">
            {formatMoney(processedMetrics.quarterNetAmt)} <span className="text-[10px] text-slate-500">ریال</span>
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-1 flex items-center justify-between">
            <span>وزن: {formatWeight(processedMetrics.quarterNetWgt)} ک‌گ</span>
            <span className="font-mono text-indigo-700 font-bold">فی: {formatMoney(processedMetrics.quarterNetFee)}</span>
          </div>
        </div>

        {/* Card 4: Current Year Net Sales */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all group">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold text-slate-600">فروش خالص سال جاری</span>
            <span className="p-1.5 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <Award className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-base font-black text-slate-900 font-mono">
            {formatMoney(processedMetrics.yearNetAmt)} <span className="text-[10px] text-slate-500">ریال</span>
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-1 flex items-center justify-between">
            <span>وزن: {formatWeight(processedMetrics.yearNetWgt)} ک‌گ</span>
            <span className="font-mono text-purple-700 font-bold">فی: {formatMoney(processedMetrics.yearNetFee)}</span>
          </div>
        </div>

        {/* Card 5: Selected Range Performance */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl p-3 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5 opacity-95">
              <span className="text-[11px] font-extrabold">عملکرد فروش بازه</span>
              <span className="p-1 bg-white/20 rounded-lg"><DollarSign className="w-3.5 h-3.5" /></span>
            </div>
            
            {/* Breakdown */}
            <div className="space-y-1 text-[10px] border-b border-white/10 pb-1.5 mb-1.5 opacity-90">
              <div className="flex justify-between items-center text-blue-100">
                <span>فروش ناخالص:</span>
                <span className="font-mono font-bold text-white">
                  {formatMoney(processedMetrics.rangeSalesAmt)}
                  <span className="text-[8.5px] text-blue-200 mr-1">({formatWeight(processedMetrics.rangeSalesWgt)} ک‌گ)</span>
                </span>
              </div>
              <div className="flex justify-between items-center text-rose-200">
                <span>مرجوعی:</span>
                <span className="font-mono font-bold">
                  {formatMoney(processedMetrics.rangeRetAmt)}
                  <span className="text-[8.5px] text-rose-300 mr-1">({formatWeight(processedMetrics.rangeRetWgt)} ک‌گ)</span>
                </span>
              </div>
            </div>
          </div>
          
          <div>
            <div className="text-[9px] text-blue-200 font-bold mb-0.5">خالص نهایی بازه:</div>
            <div className="text-sm font-black font-mono">
              {formatMoney(processedMetrics.rangeNetAmt)} <span className="text-[9px] text-blue-100 font-normal">ریال</span>
            </div>
            <div className="text-[9.5px] text-blue-100 font-medium mt-1 flex items-center justify-between">
              <span>وزن: {formatWeight(processedMetrics.rangeNetWgt)} ک‌گ</span>
              <span className="font-mono font-bold bg-white/20 px-1.5 py-0.5 rounded">فی: {formatMoney(processedMetrics.rangeNetFee)}</span>
            </div>
          </div>
        </div>

        {/* Card 6: Selected Range Net Weight */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold text-slate-600">وزن خالص بازه</span>
            <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg"><Package className="w-3.5 h-3.5" /></span>
          </div>
          <div className="text-base font-black text-slate-900 font-mono">
            {formatWeight(processedMetrics.rangeNetWgt)} <span className="text-[10px] text-slate-500">کیلوگرم</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            ناخالص: {formatWeight(processedMetrics.rangeSalesAmt ? (processedMetrics.rangeNetWgt + processedMetrics.rangeRetWgt) : 0)} ک‌گ
          </div>
        </div>

        {/* Card 7: Invoice Count */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold text-slate-600">تعداد فاکتورها</span>
            <span className="p-1.5 bg-cyan-50 text-cyan-600 rounded-lg"><FileText className="w-3.5 h-3.5" /></span>
          </div>
          <div className="text-base font-black text-slate-900 font-mono">
            {processedMetrics.invoiceCount} <span className="text-[10px] text-slate-500">عدد</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            ثبت شده در سایان ERP
          </div>
        </div>

        {/* Card 8: Customer Count */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold text-slate-600">تعداد خریداران</span>
            <span className="p-1.5 bg-rose-50 text-rose-600 rounded-lg"><Users className="w-3.5 h-3.5" /></span>
          </div>
          <div className="text-base font-black text-slate-900 font-mono">
            {processedMetrics.customerCount} <span className="text-[10px] text-slate-500">نفر/شرکت</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            مشتریان فعال دوره
          </div>
        </div>

        {/* Card 9: Avg Invoice Amount */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold text-slate-600">میانگین مبلغ فاکتور</span>
            <span className="p-1.5 bg-teal-50 text-teal-600 rounded-lg"><DollarSign className="w-3.5 h-3.5" /></span>
          </div>
          <div className="text-base font-black text-slate-900 font-mono">
            {formatMoney(processedMetrics.avgInvoiceAmt)} <span className="text-[10px] text-slate-500">ریال</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            فروش خالص ÷ تعداد فاکتور
          </div>
        </div>

        {/* Card 10: Avg Invoice Weight */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold text-slate-600">میانگین وزن فاکتور</span>
            <span className="p-1.5 bg-slate-100 text-slate-600 rounded-lg"><Package className="w-3.5 h-3.5" /></span>
          </div>
          <div className="text-base font-black text-slate-900 font-mono">
            {formatWeight(processedMetrics.avgInvoiceWgt)} <span className="text-[10px] text-slate-500">ک‌گ</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            وزن خالص ÷ تعداد فاکتور
          </div>
        </div>

      </div>

      {/* 3. AUTOMATED AI EXECUTIVE INSIGHTS BOX */}
      <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-yellow-500/10 border border-amber-300/60 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 border-b border-amber-200/60 pb-2.5 mb-3">
          <Sparkles className="w-5 h-5 text-amber-600" />
          <h3 className="text-sm font-black text-amber-950">تحلیل هوشمند و خلاصه مدیریتی عملکرد فروش</h3>
          <span className="bg-amber-200/70 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full mr-auto">پردازش سیستم</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          
          <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50 flex items-start gap-2">
            <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0 mt-0.5"><Award className="w-4 h-4" /></div>
            <div>
              <div className="text-[10px] font-bold text-slate-500">پرفروش‌ترین کالا (مبلغ)</div>
              <div className="font-extrabold text-slate-900 mt-0.5">{processedMetrics.insights.topProductByAmt}</div>
            </div>
          </div>

          <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50 flex items-start gap-2">
            <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg shrink-0 mt-0.5"><Package className="w-4 h-4" /></div>
            <div>
              <div className="text-[10px] font-bold text-slate-500">پرفروش‌ترین کالا (وزن)</div>
              <div className="font-extrabold text-slate-900 mt-0.5">{processedMetrics.insights.topProductByWgt}</div>
            </div>
          </div>

          <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50 flex items-start gap-2">
            <div className="p-1.5 bg-purple-100 text-purple-700 rounded-lg shrink-0 mt-0.5"><DollarSign className="w-4 h-4" /></div>
            <div>
              <div className="text-[10px] font-bold text-slate-500">بالاترین فی خالص فروش</div>
              <div className="font-extrabold text-slate-900 mt-0.5">{processedMetrics.insights.topProductByFee}</div>
            </div>
          </div>

          <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/50 flex items-start gap-2">
            <div className="p-1.5 bg-rose-100 text-rose-700 rounded-lg shrink-0 mt-0.5"><ShieldAlert className="w-4 h-4" /></div>
            <div>
              <div className="text-[10px] font-bold text-slate-500">بیشترین میزان مرجوعی</div>
              <div className="font-extrabold text-slate-900 mt-0.5">{processedMetrics.insights.topReturnProduct}</div>
            </div>
          </div>

        </div>
      </div>

      {/* 4. MAIN NAVIGATION TABS FOR REPORTS & CHARTS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-1 flex flex-wrap gap-1">
        <button
          onClick={() => setActiveTab('hierarchy')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'hierarchy' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>۱۵ گروه اصلی کالا (Drill-Down)</span>
        </button>

        <button
          onClick={() => setActiveTab('items')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'items' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>گزارش تفکیکی ریز کالاها</span>
        </button>

        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'invoices' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>لیست فاکتورهای فروش</span>
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'customers' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>گزارش فروش بر اساس مشتریان (اشخاص)</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('compare');
            if (onToggleCompareMode) onToggleCompareMode(true);
          }}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'compare' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>پایش مقایسه‌ای (Period A vs B)</span>
        </button>

        <button
          onClick={() => setActiveTab('charts')}
          className={`flex-1 min-w-[140px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'charts' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>نمودارهای تصمیم‌گیری</span>
        </button>
      </div>

      {/* SEARCH & FILTER BAR */}
      {(activeTab === 'items' || activeTab === 'invoices') && (
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 mr-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'items' ? "جستجو بر اساس نام کالا، گروه کالا یا کد..." : "جستجو بر اساس شماره فاکتور، خریدار، شهر یا کارشناس..."}
            className="w-full text-xs font-bold bg-transparent border-none outline-none text-slate-800 placeholder-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-1 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 1: 15 MAJOR PRODUCT GROUPS REPORT WITH DRILL-DOWN */}
      {/* ================================================================== */}
      {activeTab === 'hierarchy' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-400" />
              <h2 className="text-sm font-extrabold">گزارش سرفصل‌های اصلی کالا (۱۵ گروه اصلی سایان) با قابلیت Drill-Down</h2>
            </div>
            <span className="text-[11px] bg-blue-500/20 border border-blue-400/30 text-blue-300 px-2.5 py-0.5 rounded-full font-mono">
              فروش خالص = فروش ناخالص - مرجوعی
            </span>
          </div>

          {/* Desktop View */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3 w-10 text-center"></th>
                  <th className="p-3">نام گروه اصلی کالا</th>
                  <th className="p-3 text-center">وزن فروش (ک‌گ)</th>
                  <th className="p-3 text-center text-rose-700 bg-rose-50/50">وزن مرجوعی (ک‌گ)</th>
                  <th className="p-3 text-center font-black text-blue-900 bg-blue-50/50">وزن خالص (ک‌گ)</th>
                  <th className="p-3 text-left">مبلغ فروش (ریال)</th>
                  <th className="p-3 text-left text-rose-700 bg-rose-50/50">مبلغ مرجوعی (ریال)</th>
                  <th className="p-3 text-left font-black text-blue-900 bg-blue-50/50">فروش خالص (ریال)</th>
                  <th className="p-3 text-left font-black text-emerald-900 bg-emerald-50/50">فی خالص نهایی (ریال/ک‌گ)</th>
                  <th className="p-3 text-center font-bold">سهم %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processedMetrics.categoryList.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-slate-400">
                      {isLoading ? (
                        <div className="flex flex-col items-center justify-center gap-3">
                          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                          <span className="font-extrabold text-slate-700 text-sm">در حال دریافت و تحلیل هوشمند اطلاعات فروش سایان ERP...</span>
                          <span className="text-xs text-slate-400 font-mono">اطلاعات در حال واکشی و بارگذاری لحظه‌ای است</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2.5">
                          <AlertCircle className="w-8 h-8 text-amber-500" />
                          <span className="font-extrabold text-slate-700 text-sm">هیچ رکوردی در بازه انتخابی یافت نشد</span>
                          <span className="text-xs text-slate-400">می‌توانید با استفاده از دکمه‌های بازه در بالا، تاریخ دیگری را بررسی نمایید.</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  processedMetrics.categoryList.map((cat, idx) => {
                    const isExpanded = !!expandedCategories[cat.name];
                    return (
                      <React.Fragment key={idx}>
                        {/* Parent Group Row */}
                        <tr 
                          onClick={() => toggleCategory(cat.name)}
                          className={`hover:bg-blue-50/40 transition-colors cursor-pointer font-bold ${
                            isExpanded ? 'bg-blue-50/60' : ''
                          }`}
                        >
                          <td className="p-3 text-center text-slate-400">
                            {cat.items.length > 0 ? (
                              isExpanded ? <ChevronDown className="w-4 h-4 text-blue-600" /> : <ChevronRight className="w-4 h-4 text-slate-400" />
                            ) : null}
                          </td>
                          <td className="p-3 font-extrabold text-slate-900 flex items-center gap-2">
                            <span>{cat.name}</span>
                            {cat.items.length > 0 && (
                              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-md font-mono">
                                {cat.items.length} کالا
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono">{formatWeight(cat.salesWgt)}</td>
                          <td className="p-3 text-center font-mono text-rose-600 bg-rose-50/30">{formatWeight(cat.retWgt)}</td>
                          <td className="p-3 text-center font-mono font-black text-blue-900 bg-blue-50/30">{formatWeight(cat.netWgt)}</td>
                          <td className="p-3 text-left font-mono">{formatMoney(cat.salesAmt)}</td>
                          <td className="p-3 text-left font-mono text-rose-600 bg-rose-50/30">{formatMoney(cat.retAmt)}</td>
                          <td className="p-3 text-left font-mono font-black text-blue-900 bg-blue-50/30">{formatMoney(cat.netAmt)}</td>
                          <td className="p-3 text-left font-mono font-black text-emerald-800 bg-emerald-50/30">{formatMoney(cat.netFee)}</td>
                          <td className="p-3 text-center font-mono">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold text-[10px]">
                              {cat.sharePct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>

                        {/* Nested Sub-items (Drill-Down) */}
                        {isExpanded && cat.items.map((sub, sIdx) => (
                          <tr key={`${idx}_sub_${sIdx}`} className="bg-slate-50/80 text-[11px] hover:bg-slate-100/80 transition-colors border-l-4 border-l-blue-500">
                            <td></td>
                            <td className="p-2.5 pr-8 text-slate-700 font-medium flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              <span>{sub.itemName}</span>
                            </td>
                            <td className="p-2.5 text-center font-mono text-slate-600">{formatWeight(sub.salesWgt)}</td>
                            <td className="p-2.5 text-center font-mono text-rose-600">{formatWeight(sub.retWgt)}</td>
                            <td className="p-2.5 text-center font-mono font-bold text-blue-800">{formatWeight(sub.netWgt)}</td>
                            <td className="p-2.5 text-left font-mono text-slate-600">{formatMoney(sub.salesAmt)}</td>
                            <td className="p-2.5 text-left font-mono text-rose-600">{formatMoney(sub.retAmt)}</td>
                            <td className="p-2.5 text-left font-mono font-bold text-blue-800">{formatMoney(sub.netAmt)}</td>
                            <td className="p-2.5 text-left font-mono font-bold text-emerald-700">{formatMoney(sub.netFee)}</td>
                            <td className="p-2.5 text-center font-mono text-slate-500">{sub.sharePct.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white font-bold text-xs border-t-2 border-slate-700">
                  <td colSpan={2} className="p-3.5">جمع کل عملکرد (۱۵ گروه اصلی):</td>
                  <td className="p-3.5 text-center font-mono">{formatWeight(processedMetrics.rangeSalesAmt ? (processedMetrics.rangeNetWgt + processedMetrics.rangeRetWgt) : 0)}</td>
                  <td className="p-3.5 text-center font-mono text-rose-300">{formatWeight(processedMetrics.rangeRetWgt)}</td>
                  <td className="p-3.5 text-center font-mono font-black text-blue-300">{formatWeight(processedMetrics.rangeNetWgt)}</td>
                  <td className="p-3.5 text-left font-mono">{formatMoney(processedMetrics.rangeSalesAmt)}</td>
                  <td className="p-3.5 text-left font-mono text-rose-300">{formatMoney(processedMetrics.rangeRetAmt)}</td>
                  <td className="p-3.5 text-left font-mono font-black text-blue-300">{formatMoney(processedMetrics.rangeNetAmt)}</td>
                  <td className="p-3.5 text-left font-mono font-black text-emerald-400">{formatMoney(processedMetrics.rangeNetFee)}</td>
                  <td className="p-3.5 text-center font-mono">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile Card List View (No Horizontal Scrolling) */}
          <div className="block md:hidden divide-y divide-slate-100 bg-white p-3.5 space-y-4">
            {processedMetrics.categoryList.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-medium">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center gap-2.5 py-4">
                    <RefreshCw className="w-7 h-7 text-blue-500 animate-spin" />
                    <span className="font-bold text-slate-700 text-sm">در حال دریافت اطلاعات فروش سایان ERP...</span>
                    <span className="text-[11px] text-slate-400">لطفاً چند لحظه شکیبا باشید</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-4">
                    <AlertCircle className="w-7 h-7 text-amber-500" />
                    <span className="font-bold text-slate-700 text-sm">هیچ رکوردی در این بازه یافت نشد</span>
                    <span className="text-[11px] text-slate-400">می‌توانید با دکمه‌های بازه در بالا تاریخ دیگری را انتخاب کنید.</span>
                  </div>
                )}
              </div>
            ) : (
              processedMetrics.categoryList.map((cat, idx) => {
                const isExpanded = !!expandedCategories[cat.name];
                return (
                  <div key={idx} className="bg-slate-50/60 rounded-xl border border-slate-100 p-3.5 space-y-3">
                    {/* Header */}
                    <div 
                      onClick={() => toggleCategory(cat.name)}
                      className="flex justify-between items-center border-b border-slate-200/50 pb-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {cat.items.length > 0 ? (
                          isExpanded ? <ChevronDown className="w-4 h-4 text-blue-600" /> : <ChevronRight className="w-4 h-4 text-slate-400" />
                        ) : null}
                        <span className="font-extrabold text-slate-900 text-xs">{cat.name}</span>
                        {cat.items.length > 0 && (
                          <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold font-mono">
                            {cat.items.length} کالا
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded font-black font-mono">
                        {cat.sharePct.toFixed(1)}% سهم
                      </span>
                    </div>

                    {/* Weight Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-white p-2 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block text-[9px]">وزن فروش</span>
                        <span className="font-mono font-bold text-slate-700">{formatWeight(cat.salesWgt)}</span>
                      </div>
                      <div className={`p-2 rounded-lg border ${cat.retWgt > 0 ? 'bg-rose-50/50 border-rose-100 text-rose-700' : 'bg-white border-slate-100 text-slate-500'}`}>
                        <span className="text-slate-400 block text-[9px]">وزن مرجوعی</span>
                        <span className="font-mono font-bold">{cat.retWgt > 0 ? formatWeight(cat.retWgt) : '-'}</span>
                      </div>
                    </div>

                    {/* Net Weight and Fee Row */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-blue-50/40 border border-blue-100/50 p-2 rounded-lg text-blue-950">
                        <span className="text-blue-600 block text-[9px] font-bold">وزن خالص</span>
                        <span className="font-mono font-black">{formatWeight(cat.netWgt)} kg</span>
                      </div>
                      <div className="bg-emerald-50/40 border border-emerald-100/50 p-2 rounded-lg text-emerald-950">
                        <span className="text-emerald-600 block text-[9px] font-bold">فی خالص نهایی</span>
                        <span className="font-mono font-black">{formatMoney(cat.netFee)}</span>
                      </div>
                    </div>

                    {/* Financial Sales Grid */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-white p-2 rounded-lg border border-slate-100">
                        <span className="text-slate-400 block text-[9px]">مبلغ فروش (ناخالص)</span>
                        <span className="font-mono font-bold text-slate-700">{formatMoney(cat.salesAmt)}</span>
                      </div>
                      <div className={`p-2 rounded-lg border ${cat.retAmt > 0 ? 'bg-rose-50/50 border-rose-100 text-rose-700' : 'bg-white border-slate-100 text-slate-500'}`}>
                        <span className="text-slate-400 block text-[9px]">مبلغ مرجوعی</span>
                        <span className="font-mono font-bold">{cat.retAmt > 0 ? formatMoney(cat.retAmt) : '-'}</span>
                      </div>
                    </div>

                    {/* Net Financial Highlight */}
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2.5 flex justify-between items-center text-[11px]">
                      <span className="font-bold text-indigo-900">فروش خالص نهایی گروه</span>
                      <span className="font-mono font-black text-indigo-700">{formatMoney(cat.netAmt)} ریال</span>
                    </div>

                    {/* Nested items list (Drill Down) */}
                    {isExpanded && cat.items.length > 0 && (
                      <div className="bg-white rounded-lg border border-slate-200/60 p-2.5 mt-2 space-y-2.5 divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                        <div className="text-[10px] font-extrabold text-slate-400 pb-1">اقلام زیرمجموعه {cat.name}:</div>
                        {cat.items.map((sub, sIdx) => (
                          <div key={sIdx} className="pt-2 space-y-1.5 first:pt-0">
                            <div className="flex justify-between items-start gap-1">
                              <span className="font-bold text-slate-800 text-[11px] leading-tight">{sub.itemName}</span>
                              <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">{sub.sharePct.toFixed(1)}% سهم</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono text-slate-500">
                              <div>
                                <span className="text-slate-400 text-[8px] block font-sans">وزن خالص:</span>
                                <span className="font-bold text-slate-700">{formatWeight(sub.netWgt)} kg</span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-[8px] block font-sans">فی خالص:</span>
                                <span className="font-bold text-slate-700">{formatMoney(sub.netFee)}</span>
                              </div>
                              <div className="text-left">
                                <span className="text-slate-400 text-[8px] block font-sans">مبلغ خالص:</span>
                                <span className="font-bold text-blue-700">{formatMoney(sub.netAmt)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Mobile Total Row Summary Card */}
            <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3.5 shadow-md border border-slate-800">
              <div className="text-xs font-black border-b border-white/15 pb-2">خلاصه کل عملکرد دوره (۱۵ گروه اصلی کالا)</div>
              
              <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
                  <span className="text-slate-400 block text-[9px]">وزن ناخالص کل</span>
                  <span className="font-mono font-bold text-white block mt-0.5">{formatWeight(processedMetrics.rangeSalesAmt ? (processedMetrics.rangeNetWgt + processedMetrics.rangeRetWgt) : 0)} kg</span>
                </div>
                <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
                  <span className="text-rose-300 block text-[9px]">وزن مرجوعی کل</span>
                  <span className="font-mono font-bold text-rose-300 block mt-0.5">{formatWeight(processedMetrics.rangeRetWgt)} kg</span>
                </div>
                <div className="bg-blue-900/40 p-2.5 rounded-lg border border-blue-500/20 col-span-2 flex justify-between items-center">
                  <span className="text-blue-300 text-[9px] font-bold">وزن خالص کل دوره:</span>
                  <span className="font-mono font-black text-blue-200">{formatWeight(processedMetrics.rangeNetWgt)} kg</span>
                </div>
              </div>

              <div className="bg-white/5 p-3 rounded-xl space-y-2 border border-white/5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">مجموع فروش ناخالص</span>
                  <span className="font-mono font-bold">{formatMoney(processedMetrics.rangeSalesAmt)} ریال</span>
                </div>
                <div className="flex justify-between items-center text-xs text-rose-300">
                  <span>مجموع مرجوعی کل</span>
                  <span className="font-mono font-bold">{formatMoney(processedMetrics.rangeRetAmt)} ریال</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-white/10 pt-2 text-blue-300">
                  <span className="font-bold">فروش خالص کل دوره</span>
                  <span className="font-mono font-black">{formatMoney(processedMetrics.rangeNetAmt)} ریال</span>
                </div>
                <div className="flex justify-between items-center text-xs text-emerald-400 border-t border-white/10 pt-2">
                  <span className="font-bold">میانگین فی خالص نهایی</span>
                  <span className="font-mono font-black">{formatMoney(processedMetrics.rangeNetFee)} ریال/ک‌گ</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 2: DETAILED ITEMS SALES REPORT */}
      {/* ================================================================== */}
      {activeTab === 'items' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <h2 className="text-sm font-extrabold flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-400" />
              <span>گزارش تفکیکی و ریز تمام کالاهای فروخته شده</span>
            </h2>
            <span className="text-[11px] text-slate-300 font-mono">
              تعداد اقلام: {filteredItems.length} مورد
            </span>
          </div>

          {/* Desktop View */}
          <div className="overflow-x-auto max-h-[600px] hidden md:block">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200">
                <tr className="font-bold text-slate-700">
                  <th className="p-3 w-12 text-center">ردیف</th>
                  <th className="p-3">نام کالا</th>
                  <th className="p-3">گروه اصلی</th>
                  <th className="p-3 text-center">وزن فروش (ک‌گ)</th>
                  <th className="p-3 text-center text-rose-700 bg-rose-50">وزن مرجوعی (ک‌گ)</th>
                  <th className="p-3 text-center font-black text-blue-900 bg-blue-50">وزن خالص (ک‌گ)</th>
                  <th className="p-3 text-left">مبلغ فروش (ریال)</th>
                  <th className="p-3 text-left text-rose-700 bg-rose-50">مبلغ مرجوعی (ریال)</th>
                  <th className="p-3 text-left font-black text-blue-900 bg-blue-50">فروش خالص (ریال)</th>
                  <th className="p-3 text-left font-black text-emerald-900 bg-emerald-50">فی خالص نهایی</th>
                  <th className="p-3 text-center">سهم %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-3 font-bold text-slate-900">{item.itemName}</td>
                    <td className="p-3 text-slate-500">{item.majorCategory}</td>
                    <td className="p-3 text-center font-mono">{formatWeight(item.salesQty)}</td>
                    <td className="p-3 text-center font-mono text-rose-600 bg-rose-50/20">{formatWeight(item.returnQty)}</td>
                    <td className="p-3 text-center font-mono font-bold text-blue-900 bg-blue-50/20">{formatWeight(item.netQty)}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(item.salesAmt)}</td>
                    <td className="p-3 text-left font-mono text-rose-600 bg-rose-50/20">{formatMoney(item.returnAmt)}</td>
                    <td className="p-3 text-left font-mono font-bold text-blue-900 bg-blue-50/20">{formatMoney(item.netAmt)}</td>
                    <td className="p-3 text-left font-mono font-bold text-emerald-700 bg-emerald-50/20">{formatMoney(item.netFee)}</td>
                    <td className="p-3 text-center font-mono text-slate-600">{item.sharePct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View (No Horizontal Scrolling) */}
          <div className="block md:hidden max-h-[600px] overflow-y-auto divide-y divide-slate-100 bg-white p-3.5 space-y-3">
            {filteredItems.length === 0 ? (
              <div className="py-12 text-center text-slate-400 font-medium">
                هیچ کالایی یافت نشد.
              </div>
            ) : (
              filteredItems.map((item, idx) => (
                <div key={idx} className="bg-slate-50/60 rounded-xl border border-slate-100 p-3 space-y-2.5">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-200/50 pb-2">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold font-mono">#{idx + 1} | گروه: {item.majorCategory}</span>
                      <h4 className="font-extrabold text-slate-900 text-xs mt-0.5 leading-tight">{item.itemName}</h4>
                    </div>
                    <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded font-black font-mono shrink-0">
                      {item.sharePct.toFixed(1)}% سهم
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-blue-50/40 border border-blue-100/50 p-2 rounded-lg text-blue-950">
                      <span className="text-blue-600 block text-[9px] font-bold">وزن خالص</span>
                      <span className="font-mono font-black">{formatWeight(item.netQty)} kg</span>
                    </div>
                    <div className="bg-emerald-50/40 border border-emerald-100/50 p-2 rounded-lg text-emerald-950">
                      <span className="text-emerald-600 block text-[9px] font-bold">فی خالص نهایی</span>
                      <span className="font-mono font-black">{formatMoney(item.netFee)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600">
                    <div className="bg-white p-2 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block text-[9px] font-sans">فروش ناخالص:</span>
                      <span className="font-bold">{formatMoney(item.salesAmt)}</span>
                    </div>
                    <div className={`p-2 rounded-lg border ${item.returnAmt > 0 ? 'bg-rose-50/50 border-rose-100 text-rose-700' : 'bg-white border-slate-100 text-slate-500'}`}>
                      <span className="text-slate-400 block text-[9px] font-sans">برگشت از فروش:</span>
                      <span className="font-bold">{item.returnAmt > 0 ? formatMoney(item.returnAmt) : '-'}</span>
                    </div>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2 flex justify-between items-center text-[11px]">
                    <span className="font-bold text-indigo-900">فروش خالص کالا</span>
                    <span className="font-mono font-black text-indigo-700">{formatMoney(item.netAmt)} ریال</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 3: INVOICES LIST REPORT */}
      {/* ================================================================== */}
      {activeTab === 'invoices' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <h2 className="text-sm font-extrabold flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              <span>لیست کامل فاکتورهای فروش صادر شده</span>
            </h2>
            <span className="text-[11px] text-slate-300 font-mono">
              تعداد فاکتورها: {filteredInvoices.length} عدد
            </span>
          </div>

          {/* Desktop View */}
          <div className="overflow-x-auto max-h-[600px] hidden md:block">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 font-bold text-slate-700">
                <tr>
                  <th className="p-3 w-12 text-center">ردیف</th>
                  <th className="p-3 font-mono">شماره فاکتور</th>
                  <th className="p-3 font-mono">تاریخ</th>
                  <th className="p-3">نام خریدار / مشتری</th>
                  <th className="p-3">شهر / استان</th>
                  <th className="p-3">کارشناس فروش</th>
                  <th className="p-3 text-left">مبلغ ناخالص (ریال)</th>
                  <th className="p-3 text-left text-rose-600">مرجوعی (ریال)</th>
                  <th className="p-3 text-left font-black text-blue-900">فروش خالص (ریال)</th>
                  <th className="p-3 text-center font-black text-blue-900">وزن خالص (ک‌گ)</th>
                  <th className="p-3 text-center">وضعیت تسویه</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-3 font-mono font-bold text-blue-700">#{inv.invoiceNum}</td>
                    <td className="p-3 font-mono text-slate-600">{inv.date}</td>
                    <td className="p-3 font-bold text-slate-900">{inv.customerName}</td>
                    <td className="p-3 text-slate-500">{inv.city}</td>
                    <td className="p-3 text-slate-500">{inv.salesExpert}</td>
                    <td className="p-3 text-left font-mono">{formatMoney(inv.grossAmt)}</td>
                    <td className="p-3 text-left font-mono text-rose-600">{formatMoney(inv.retAmt)}</td>
                    <td className="p-3 text-left font-mono font-bold text-blue-900">{formatMoney(inv.netAmt)}</td>
                    <td className="p-3 text-center font-mono font-bold text-blue-900">{formatWeight(inv.netWgt)}</td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {inv.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View (No Horizontal Scrolling) */}
          <div className="block md:hidden max-h-[600px] overflow-y-auto divide-y divide-slate-100 bg-white p-3.5 space-y-3">
            {filteredInvoices.length === 0 ? (
              <div className="py-12 text-center text-slate-400 font-medium">
                هیچ فاکتوری یافت نشد.
              </div>
            ) : (
              filteredInvoices.map((inv, idx) => (
                <div key={idx} className="bg-slate-50/60 rounded-xl border border-slate-100 p-3.5 space-y-2.5">
                  <div className="flex justify-between items-center border-b border-slate-200/50 pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-black text-blue-700 text-xs">#{inv.invoiceNum}</span>
                      <span className="text-slate-400 font-mono text-[9px] font-bold">({inv.date})</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
                      {inv.paymentStatus}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-extrabold text-slate-900 text-xs">{inv.customerName}</h4>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>استان/شهر: <strong>{inv.city || '---'}</strong></span>
                      <span>کارشناس: <strong>{inv.salesExpert || '---'}</strong></span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600">
                    <div className="bg-white p-2 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block text-[9px] font-sans">مبلغ ناخالص:</span>
                      <span className="font-bold">{formatMoney(inv.grossAmt)}</span>
                    </div>
                    <div className={`p-2 rounded-lg border ${inv.retAmt > 0 ? 'bg-rose-50/50 border-rose-100 text-rose-700' : 'bg-white border-slate-100 text-slate-500'}`}>
                      <span className="text-slate-400 block text-[9px] font-sans">برگشت از فروش (مرجوعی):</span>
                      <span className="font-bold">{inv.retAmt > 0 ? formatMoney(inv.retAmt) : '-'}</span>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 flex justify-between items-center text-[11px]">
                    <div className="text-blue-900 font-bold">
                      وزن خالص: <span className="font-mono text-blue-700">{formatWeight(inv.netWgt)} kg</span>
                    </div>
                    <div className="text-blue-900 font-bold">
                      فروش خالص: <span className="font-mono text-blue-700">{formatMoney(inv.netAmt)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 3.5: CUSTOMERS REPORT (فروش بر اساس مشتریان و اشخاص) */}
      {/* ================================================================== */}
      {activeTab === 'customers' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn space-y-4 p-4">
          
          {/* Header & Controls */}
          <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <span>گزارش جامع فروش به تفکیک خریداران و اشخاص (Customer Sales Breakdown)</span>
              </h2>
              <p className="text-[11px] text-slate-300 mt-1">
                قابلیت سورت، جستجوی آنی اشخاص، و مشاهده ریز فاکتورها و کالاهای خریداری‌شده هر مشتری (Drill-down)
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>تعداد خریداران: <strong className="text-white font-bold">{sortedAndFilteredCustomers.length}</strong> نفر/شرکت</span>
            </div>
          </div>

          {/* Search Bar & Sorting Selector */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            {/* Search Input */}
            <div className="md:col-span-6 flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-2xs">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={customerSearchQuery}
                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                placeholder="جستجوی نام خریدار یا شخص..."
                className="w-full text-xs font-bold bg-transparent outline-none text-slate-800 placeholder-slate-400"
              />
              {customerSearchQuery && (
                <button
                  type="button"
                  onClick={() => setCustomerSearchQuery('')}
                  className="text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Selector */}
            <div className="md:col-span-6 flex flex-wrap items-center justify-end gap-2 text-xs">
              <span className="font-bold text-slate-600 shrink-0">مرتب‌سازی (سورت):</span>
              <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                {[
                  { id: 'netAmt_desc', label: 'بیشترین مبلغ' },
                  { id: 'netAmt_asc', label: 'کمترین مبلغ' },
                  { id: 'netWgt_desc', label: 'بیشترین وزن' },
                  { id: 'invoices_desc', label: 'تعداد فاکتور' },
                  { id: 'name_asc', label: 'الفبای نام' }
                ].map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCustomerSortBy(s.id as any)}
                    className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                      customerSortBy === s.id
                        ? 'bg-emerald-600 text-white shadow-xs font-extrabold'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="overflow-x-auto hidden md:block max-h-[650px] overflow-y-auto">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 font-bold text-slate-700">
                <tr>
                  <th className="p-3 w-10 text-center"></th>
                  <th className="p-3 w-12 text-center">ردیف</th>
                  <th className="p-3">نام خریدار / مشتری</th>
                  <th className="p-3 text-center">تعداد فاکتور</th>
                  <th className="p-3 text-center">وزن فروش (ک‌گ)</th>
                  <th className="p-3 text-center text-rose-700 bg-rose-50/50">وزن مرجوعی (ک‌گ)</th>
                  <th className="p-3 text-center font-black text-blue-900 bg-blue-50/50">وزن خالص (ک‌گ)</th>
                  <th className="p-3 text-left">مبلغ فروش (ریال)</th>
                  <th className="p-3 text-left text-rose-700 bg-rose-50/50">مرجوعی (ریال)</th>
                  <th className="p-3 text-left font-black text-emerald-900 bg-emerald-50/50">فروش خالص (ریال)</th>
                  <th className="p-3 text-left font-black text-teal-900 bg-teal-50/50">فی میانگین (ریال/ک‌گ)</th>
                  <th className="p-3 text-center font-bold">سهم %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedAndFilteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-slate-400 font-medium">
                      هیچ مشتری یا خریدار متناسب با جستجو یافت نشد.
                    </td>
                  </tr>
                ) : (
                  sortedAndFilteredCustomers.map((cust, idx) => {
                    const isExpanded = expandedCustomer === cust.customerName;
                    const activeSubTab = customerDetailTab[cust.customerName] || 'invoices';

                    return (
                      <React.Fragment key={cust.customerName}>
                        <tr
                          onClick={() => setExpandedCustomer(isExpanded ? null : cust.customerName)}
                          className={`hover:bg-emerald-50/40 transition-colors cursor-pointer font-bold ${
                            isExpanded ? 'bg-emerald-50/60' : ''
                          }`}
                        >
                          <td className="p-3 text-center text-slate-400">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-emerald-600" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          </td>
                          <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-3 font-extrabold text-slate-900 flex items-center gap-2">
                            <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>{cust.customerName}</span>
                          </td>
                          <td className="p-3 text-center font-mono font-bold">{cust.invoiceCount}</td>
                          <td className="p-3 text-center font-mono">{formatWeight(cust.salesWgt)}</td>
                          <td className="p-3 text-center font-mono text-rose-600 bg-rose-50/30">{formatWeight(cust.retWgt)}</td>
                          <td className="p-3 text-center font-mono font-black text-blue-900 bg-blue-50/30">{formatWeight(cust.netWgt)}</td>
                          <td className="p-3 text-left font-mono">{formatMoney(cust.salesAmt)}</td>
                          <td className="p-3 text-left font-mono text-rose-600 bg-rose-50/30">{formatMoney(cust.retAmt)}</td>
                          <td className="p-3 text-left font-mono font-black text-emerald-900 bg-emerald-50/30">{formatMoney(cust.netAmt)}</td>
                          <td className="p-3 text-left font-mono font-black text-teal-800 bg-teal-50/30">{formatMoney(cust.netFee)}</td>
                          <td className="p-3 text-center font-mono">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold text-[10px]">
                              {cust.sharePct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>

                        {/* Customer Drill-Down Sub-table */}
                        {isExpanded && (
                          <tr className="bg-slate-50/90 border-l-4 border-l-emerald-500">
                            <td colSpan={12} className="p-4">
                              <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-2xs space-y-3">
                                
                                {/* Sub-tab Toggle Header */}
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-slate-800">جزئیات فروش به «{cust.customerName}»:</span>
                                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCustomerDetailTab(prev => ({ ...prev, [cust.customerName]: 'invoices' }));
                                        }}
                                        className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                                          activeSubTab === 'invoices' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                      >
                                        فاکتورها ({cust.invoices.length} عدد)
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCustomerDetailTab(prev => ({ ...prev, [cust.customerName]: 'items' }));
                                        }}
                                        className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                                          activeSubTab === 'items' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                      >
                                        کالاهای خریداری‌شده ({cust.items.length} نوع)
                                      </button>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setSelectedCustomer(cust.customerName)}
                                    className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[11px] rounded-lg border border-emerald-300 transition-all flex items-center gap-1 cursor-pointer"
                                    title="فیلتر کلیه بخش‌های داشبورد فقط برای این خریدار"
                                  >
                                    <Filter className="w-3 h-3 text-emerald-700" />
                                    <span>فیلتر کل داشبورد روی این خریدار</span>
                                  </button>
                                </div>

                                {/* Invoices Sub-tab View */}
                                {activeSubTab === 'invoices' && (
                                  <div className="overflow-x-auto max-h-60 overflow-y-auto">
                                    <table className="w-full text-right text-[11px]">
                                      <thead>
                                        <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                                          <th className="p-2 w-8 text-center">ردیف</th>
                                          <th className="p-2">شماره فاکتور</th>
                                          <th className="p-2 font-mono">تاریخ</th>
                                          <th className="p-2">شهر</th>
                                          <th className="p-2">کارشناس</th>
                                          <th className="p-2 text-left">مبلغ ناخالص (ریال)</th>
                                          <th className="p-2 text-left text-rose-600">مرجوعی (ریال)</th>
                                          <th className="p-2 text-left font-black text-blue-900">فروش خالص (ریال)</th>
                                          <th className="p-2 text-center font-bold">وزن خالص (ک‌گ)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 font-mono">
                                        {cust.invoices.map((inv, iIdx) => (
                                          <tr key={iIdx} className="hover:bg-slate-50">
                                            <td className="p-2 text-center text-slate-400">{iIdx + 1}</td>
                                            <td className="p-2 font-bold text-blue-700">#{inv.invoiceNum}</td>
                                            <td className="p-2 text-slate-600">{inv.date}</td>
                                            <td className="p-2 text-slate-500 font-sans">{inv.city}</td>
                                            <td className="p-2 text-slate-500 font-sans">{inv.salesExpert}</td>
                                            <td className="p-2 text-left">{formatMoney(inv.grossAmt)}</td>
                                            <td className="p-2 text-left text-rose-600">{formatMoney(inv.retAmt)}</td>
                                            <td className="p-2 text-left font-bold text-blue-900">{formatMoney(inv.netAmt)}</td>
                                            <td className="p-2 text-center font-bold text-blue-900">{formatWeight(inv.netWgt)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}

                                {/* Items Sub-tab View */}
                                {activeSubTab === 'items' && (
                                  <div className="overflow-x-auto max-h-60 overflow-y-auto">
                                    <table className="w-full text-right text-[11px]">
                                      <thead>
                                        <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                                          <th className="p-2 w-8 text-center">ردیف</th>
                                          <th className="p-2">نام کالا</th>
                                          <th className="p-2">گروه اصلی</th>
                                          <th className="p-2 text-center">وزن فروش (ک‌گ)</th>
                                          <th className="p-2 text-center text-rose-600">وزن مرجوعی</th>
                                          <th className="p-2 text-center font-bold text-blue-900">وزن خالص (ک‌گ)</th>
                                          <th className="p-2 text-left">فروش خالص (ریال)</th>
                                          <th className="p-2 text-left font-bold text-teal-800">فی میانگین (ریال/ک‌گ)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 font-mono">
                                        {cust.items.map((it, itIdx) => (
                                          <tr key={itIdx} className="hover:bg-slate-50">
                                            <td className="p-2 text-center text-slate-400">{itIdx + 1}</td>
                                            <td className="p-2 font-bold text-slate-800 font-sans">{it.itemName}</td>
                                            <td className="p-2 text-slate-500 font-sans">{it.majorCategory}</td>
                                            <td className="p-2 text-center">{formatWeight(it.salesQty)}</td>
                                            <td className="p-2 text-center text-rose-600">{formatWeight(it.returnQty)}</td>
                                            <td className="p-2 text-center font-bold text-blue-900">{formatWeight(it.netQty)}</td>
                                            <td className="p-2 text-left font-bold text-blue-900">{formatMoney(it.netAmt)}</td>
                                            <td className="p-2 text-left font-bold text-teal-800">{formatMoney(it.netFee)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}

                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-slate-100 space-y-3">
            {sortedAndFilteredCustomers.length === 0 ? (
              <div className="py-8 text-center text-slate-400 font-medium">
                هیچ خریدار یا مشتری یافت نشد.
              </div>
            ) : (
              sortedAndFilteredCustomers.map((cust, idx) => (
                <div key={cust.customerName} className="bg-slate-50/60 rounded-xl border border-slate-100 p-3.5 space-y-2.5">
                  <div className="flex justify-between items-start gap-2 border-b border-slate-200/50 pb-2">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold font-mono">#{idx + 1} | {cust.invoiceCount} فاکتور</span>
                      <h4 className="font-extrabold text-slate-900 text-xs mt-0.5">{cust.customerName}</h4>
                    </div>
                    <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-black font-mono shrink-0">
                      {cust.sharePct.toFixed(1)}% سهم
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-blue-50/40 border border-blue-100/50 p-2 rounded-lg text-blue-950">
                      <span className="text-blue-600 block text-[9px] font-bold">وزن خالص</span>
                      <span className="font-mono font-black">{formatWeight(cust.netWgt)} kg</span>
                    </div>
                    <div className="bg-teal-50/40 border border-teal-100/50 p-2 rounded-lg text-teal-950">
                      <span className="text-teal-600 block text-[9px] font-bold">فی میانگین</span>
                      <span className="font-mono font-black">{formatMoney(cust.netFee)}</span>
                    </div>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5 flex justify-between items-center text-[11px]">
                    <span className="font-bold text-emerald-900">فروش خالص خریدار</span>
                    <span className="font-mono font-black text-emerald-800">{formatMoney(cust.netAmt)} ریال</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(cust.customerName)}
                    className="w-full text-center py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs"
                  >
                    فیلتر کل گزارشات روی این مشتری
                  </button>
                </div>
              ))
            )}
          </div>

        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 4: TWO-PERIOD COMPARATIVE ANALYSIS (Period A vs Period B) */}
      {/* ================================================================== */}
      {activeTab === 'compare' && (
        <div className="space-y-4 animate-fadeIn">
          
          {/* COMPARATIVE CONTROL PANEL */}
          <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white p-4 rounded-2xl shadow-md border border-indigo-500/30 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-blue-200">تنظیمات و پنل تخصصی پایش مقایسه‌ای فروش (Period A vs Period B)</h3>
                <p className="text-[11px] text-slate-300">مقایسه تراز فروش، مرجوعی کد ۱۳، وزن خالص و میانگین فی نهایی اقلام</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = !compareMode;
                    if (nextMode && (!salesDateFromB || !salesDateToB)) {
                      applyPreset('prev_year');
                    } else if (onToggleCompareMode) {
                      onToggleCompareMode(nextMode);
                    }
                  }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    compareMode 
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950' 
                      : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                  }`}
                >
                  {compareMode ? '✅ حالت مقایسه: فعال' : '❌ حالت مقایسه: غیرفعال'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                <div className="text-[11px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                  <span>دوره A (بازه اصلی پایه): <strong className="text-blue-300 font-mono">{dateFrom || '---'} تا {dateTo || '---'}</strong></span>
                  <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-bold">دوره A</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-lg border border-white/10 w-full">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <input 
                      type="text" 
                      placeholder="از تاریخ"
                      value={dateFrom}
                      onChange={(e) => {
                        if (onDateRangeChange) onDateRangeChange(e.target.value, dateTo);
                      }}
                      className="text-xs bg-transparent outline-none text-white font-bold font-mono w-full text-center"
                    />
                  </div>
                  <span className="text-xs text-slate-400 font-bold">تا</span>
                  <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-lg border border-white/10 w-full">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <input 
                      type="text" 
                      placeholder="تا تاریخ"
                      value={dateTo}
                      onChange={(e) => {
                        if (onDateRangeChange) onDateRangeChange(dateFrom, e.target.value);
                      }}
                      className="text-xs bg-transparent outline-none text-white font-bold font-mono w-full text-center"
                    />
                  </div>
                </div>
              </div>
              
              <div className="bg-white/5 p-3 rounded-xl border border-white/10 space-y-2">
                <div className="text-[11px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                  <span>دوره B (بازه تطبیقی مقایسه‌ای): <strong className="text-purple-300 font-mono">{salesDateFromB || '---'} تا {salesDateToB || '---'}</strong></span>
                  <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold">دوره B</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-lg border border-white/10 w-full">
                    <Calendar className="w-3.5 h-3.5 text-purple-400" />
                    <input 
                      type="text" 
                      placeholder="۱۴۰۳/۰۱/۰۱"
                      value={salesDateFromB}
                      onChange={(e) => {
                        if (onCompareDateRangeChange) onCompareDateRangeChange(e.target.value, salesDateToB);
                      }}
                      className="text-xs bg-transparent outline-none text-white font-bold font-mono w-full text-center"
                    />
                  </div>
                  <span className="text-xs text-slate-400 font-bold">تا</span>
                  <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-lg border border-white/10 w-full">
                    <Calendar className="w-3.5 h-3.5 text-purple-400" />
                    <input 
                      type="text" 
                      placeholder="۱۴۰۳/۱۲/۲۹"
                      value={salesDateToB}
                      onChange={(e) => {
                        if (onCompareDateRangeChange) onCompareDateRangeChange(salesDateFromB, e.target.value);
                      }}
                      className="text-xs bg-transparent outline-none text-white font-bold font-mono w-full text-center"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400">میانبر بازه دوم:</span>
                <button
                  type="button"
                  onClick={() => applyPreset('prev_year')}
                  className="bg-white/10 hover:bg-white/25 border border-white/20 rounded text-[11px] px-2.5 py-1 font-bold transition-all cursor-pointer text-blue-200"
                >
                  همسان سال قبل (پارسال)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('prev_month')}
                  className="bg-white/10 hover:bg-white/25 border border-white/20 rounded text-[11px] px-2.5 py-1 font-bold transition-all cursor-pointer text-blue-200"
                >
                  ماه قبل
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('prev_quarter')}
                  className="bg-white/10 hover:bg-white/25 border border-white/20 rounded text-[11px] px-2.5 py-1 font-bold transition-all cursor-pointer text-blue-200"
                >
                  فصل قبل
                </button>
              </div>

              {compareMode && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadComparePdf}
                    className="bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs px-3 py-1.5 font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>دانلود PDF مقایسه‌ای</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsBotModalOpen(true)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs px-3 py-1.5 font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>ارسال مقایسه‌ای به بات</span>
                  </button>
                </div>
              )}
            </div>

            {/* Product Groups Filter / Exclusion Option */}
            <div className="pt-3 border-t border-white/10 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-white/10 border border-white/20 text-blue-300 flex items-center justify-center shadow-xs">
                    <Filter className="w-3.5 h-3.5" />
                  </span>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>استثنا کردن گروه کالاهای اصلی از گزارش مقایسه‌ای</span>
                      {excludedSalesGroups.length > 0 && (
                        <span className="bg-rose-500/20 text-rose-300 border border-rose-400/40 text-[10px] font-black px-2 py-0.5 rounded-full">
                          {excludedSalesGroups.length} گروه مستثنی شده
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300">
                      روی هر گروه کالا کلیک کنید تا از جدول مقایسه، محاسبات، نمودارها و PDF چاپی حذف شود:
                    </p>
                  </div>
                </div>

                {excludedSalesGroups.length > 0 && (
                  <button
                    type="button"
                    onClick={clearExcludedSalesGroups}
                    className="text-[11px] text-blue-200 hover:text-white font-bold flex items-center gap-1 bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-md border border-white/20 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>نمایش مجدد همه گروه‌ها</span>
                  </button>
                )}
              </div>

              {/* Groups list / chips */}
              {availableSalesGroups.length === 0 ? (
                <div className="text-[11px] text-slate-400 py-1.5 font-medium bg-black/20 rounded-lg px-3 border border-dashed border-white/10">
                  داده‌ای برای استخراج گروه‌های کالا یافت نشد.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {availableSalesGroups.map(group => {
                    const isExcluded = excludedSalesGroups.includes(group);
                    return (
                      <button
                        key={group}
                        type="button"
                        onClick={() => toggleExcludeSalesGroup(group)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                          isExcluded
                            ? 'bg-rose-950/80 text-rose-300 border border-rose-500/60 line-through opacity-85 hover:opacity-100 shadow-sm'
                            : 'bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/20 hover:border-blue-400 shadow-xs'
                        }`}
                        title={isExcluded ? `گروه «${group}» مستثنی شده است (برای بازگردانی کلیک کنید)` : `برای استثنا کردن «${group}» کلیک کنید`}
                      >
                        {isExcluded ? (
                          <EyeOff className="w-3 h-3 text-rose-400 shrink-0" />
                        ) : (
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        )}
                        <span>{group}</span>
                        {isExcluded && (
                          <span className="text-[9px] bg-rose-500/30 text-rose-200 px-1 rounded font-normal no-underline">مستثنی</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {!compareMode ? (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
              <TrendingUp className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h4 className="text-sm font-extrabold text-slate-800">حالت مقایسه دو بازه غیرفعال است</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                برای فعال‌سازی مقایسه تراز فروش بازه اول با بازه دوم، لطفاً روی دکمه «حالت مقایسه: غیرفعال» در پنل بالا کلیک کنید تا به وضعیت فعال تغییر کند.
              </p>
            </div>
          ) : isLoading ? (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-600 font-bold">در حال دریافت و تحلیل آماری داده‌های بازه دوم از سیستم سایان ERP...</p>
            </div>
          ) : !compareDataB || compareDataB.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
              <h4 className="text-sm font-extrabold text-slate-800">هیچ تراکنشی در بازه دوم یافت نشد</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                تراکنشی در تاریخ‌های مشخص شده برای بازه دوم در سیستم ERP یافت نشد. می‌توانید با دکمه‌های میانبر (مثلا همسان سال قبل) بازه دیگری انتخاب کنید.
              </p>
            </div>
          ) : comparisonMetrics && comparisonMetrics.compareGroupRows.length === 0 && comparisonMetrics.compareItemRows.length === 0 ? (
            <div className="p-8 text-center bg-amber-50/90 border-2 border-amber-300 rounded-2xl space-y-3">
              <AlertCircle className="w-12 h-12 text-amber-600 mx-auto" />
              <h4 className="text-sm font-black text-amber-900">تمامی {excludedSalesGroups.length} گروه کالایی از گزارش مقایسه‌ای مستثنی شده‌اند!</h4>
              <p className="text-xs text-amber-800 max-w-md mx-auto leading-relaxed font-medium">
                شما با کلیک روی چیپ‌های بالای صفحه، تمامی گروه‌های کالا را از محاسبات و جدول حذف فرموده‌اید. برای مشاهده مجدد تراز مقایسه‌ای، روی دکمه زیر کلیک کنید:
              </p>
              <button
                type="button"
                onClick={clearExcludedSalesGroups}
                className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-6 py-3 rounded-xl shadow-lg cursor-pointer transition-all inline-flex items-center gap-2 active:scale-95"
              >
                <RefreshCw size={16} />
                <span>پاکسازی فیلترها و نمایش مجدد تمامی گروه‌ها ({availableSalesGroups.length} گروه)</span>
              </button>
            </div>
          ) : (
            <>
              {/* COMPARISON METRICS SUMMARY CARDS */}
              {comparisonMetrics && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  
                  {/* Card 1: Amount Growth */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold text-slate-500 flex items-center justify-between">
                      <span>تغییرات مبلغ خالص فروش</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 ${
                        comparisonMetrics.amtGrowthPct >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {comparisonMetrics.amtGrowthPct >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {comparisonMetrics.amtGrowthPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-lg font-black text-slate-900 mt-2 font-mono">
                      {formatMoney(comparisonMetrics.netAmtA)} <span className="text-xs text-slate-400">vs {formatMoney(comparisonMetrics.netAmtB)}</span>
                    </div>
                    <div className={`text-xs font-bold mt-1 ${comparisonMetrics.amtDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      اختلاف: {comparisonMetrics.amtDiff >= 0 ? '+' : ''}{formatMoney(comparisonMetrics.amtDiff)} ریال
                    </div>
                  </div>

                  {/* Card 2: Weight Growth */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold text-slate-500 flex items-center justify-between">
                      <span>تغییرات وزن خالص فروش</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 ${
                        comparisonMetrics.wgtGrowthPct >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {comparisonMetrics.wgtGrowthPct >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {comparisonMetrics.wgtGrowthPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-lg font-black text-slate-900 mt-2 font-mono">
                      {formatWeight(comparisonMetrics.netWgtA)} <span className="text-xs text-slate-400">vs {formatWeight(comparisonMetrics.netWgtB)}</span> ک‌گ
                    </div>
                    <div className={`text-xs font-bold mt-1 ${comparisonMetrics.wgtDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      اختلاف: {comparisonMetrics.wgtDiff >= 0 ? '+' : ''}{formatWeight(comparisonMetrics.wgtDiff)} ک‌گ
                    </div>
                  </div>

                  {/* Card 3: Fee Growth */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold text-slate-500 flex items-center justify-between">
                      <span>تغییرات فی نهایی میانگین</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 ${
                        comparisonMetrics.feeGrowthPct >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {comparisonMetrics.feeGrowthPct >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        {comparisonMetrics.feeGrowthPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-lg font-black text-slate-900 mt-2 font-mono">
                      {formatMoney(comparisonMetrics.avgFeeA)} <span className="text-xs text-slate-400">vs {formatMoney(comparisonMetrics.avgFeeB)}</span> ریال
                    </div>
                    <div className={`text-xs font-bold mt-1 ${comparisonMetrics.feeDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      اختلاف: {comparisonMetrics.feeDiff >= 0 ? '+' : ''}{formatMoney(comparisonMetrics.feeDiff)} ریال/ک‌گ
                    </div>
                  </div>

                </div>
              )}

              {/* COMPARISON TABLE WITH DUAL MODES (Product Group Summary vs Product Detail) */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <h2 className="text-sm font-extrabold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    <span>جدول جامع مقایسه انحراف عملکرد و تحلیلی (Period A vs Period B)</span>
                  </h2>

                  {/* Mode Selector Buttons */}
                  <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setCompareModeType('groups')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        compareModeType === 'groups'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <Grid className="w-3.5 h-3.5" />
                      <span>۱. خلاصه گروه‌های کالا ({comparisonMetrics?.compareGroupRows.length || 0} گروه)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompareModeType('items')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        compareModeType === 'items'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>۲. ریز کالاهای منفرد ({comparisonMetrics?.compareItemRows.length || 0} کالا)</span>
                    </button>
                  </div>
                </div>

                {/* Desktop and Mobile Views for Comparison */}
                <div className="overflow-x-auto max-h-[650px] hidden md:block">
                  {compareModeType === 'groups' ? (
                    <table className="w-full text-right text-xs">
                      <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 text-slate-700 font-bold">
                        <tr>
                          <th className="p-3">ردیف</th>
                          <th className="p-3">نام گروه اصلی کالا</th>
                          <th className="p-3 text-left bg-blue-50/70">فروش خالص A (ریال)</th>
                          <th className="p-3 text-left bg-indigo-50/70">فروش خالص B (ریال)</th>
                          <th className="p-3 text-center bg-blue-50/70">وزن خالص A (ک‌گ)</th>
                          <th className="p-3 text-center bg-indigo-50/70">وزن خالص B (ک‌گ)</th>
                          <th className="p-3 text-left bg-blue-50/70">فی A (ریال/ک‌گ)</th>
                          <th className="p-3 text-left bg-indigo-50/70">فی B (ریال/ک‌گ)</th>
                          <th className="p-3 text-left font-black">اختلاف مبلغ</th>
                          <th className="p-3 text-center font-black">درصد رشد/افت</th>
                          <th className="p-3 text-center">سهم A %</th>
                          <th className="p-3 text-center">تحلیل انحراف (Variance)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {comparisonMetrics?.compareGroupRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-3 font-bold text-slate-900">{row.catName}</td>
                            <td className="p-3 text-left font-mono font-bold text-blue-900 bg-blue-50/20">{formatMoney(row.netAmtA)}</td>
                            <td className="p-3 text-left font-mono font-bold text-indigo-900 bg-indigo-50/20">{formatMoney(row.netAmtB)}</td>
                            <td className="p-3 text-center font-mono text-blue-900 bg-blue-50/20">{formatWeight(row.netWgtA)}</td>
                            <td className="p-3 text-center font-mono text-indigo-900 bg-indigo-50/20">{formatWeight(row.netWgtB)}</td>
                            <td className="p-3 text-left font-mono text-blue-900 bg-blue-50/20">{formatMoney(row.netFeeA)}</td>
                            <td className="p-3 text-left font-mono text-indigo-900 bg-indigo-50/20">{formatMoney(row.netFeeB)}</td>
                            <td className={`p-3 text-left font-mono font-black ${row.diffAmt >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {row.diffAmt >= 0 ? '+' : ''}{formatMoney(row.diffAmt)}
                            </td>
                            <td className="p-3 text-center font-mono font-black">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                                row.growthPct > 0 ? 'bg-emerald-100 text-emerald-800' : row.growthPct < 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {row.growthPct > 0 ? '+' : ''}{row.growthPct.toFixed(1)}%
                              </span>
                            </td>
                            <td className="p-3 text-center font-mono text-slate-600">{row.sharePctA.toFixed(1)}%</td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${row.variance.color}`}>
                                {row.variance.label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-right text-xs">
                      <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 text-slate-700 font-bold">
                        <tr>
                          <th className="p-3">ردیف</th>
                          <th className="p-3">نام کالا</th>
                          <th className="p-3">گروه اصلی</th>
                          <th className="p-3 text-left bg-blue-50/70">فروش خالص A</th>
                          <th className="p-3 text-left bg-indigo-50/70">فروش خالص B</th>
                          <th className="p-3 text-center bg-blue-50/70">وزن خالص A (ک‌گ)</th>
                          <th className="p-3 text-center bg-indigo-50/70">وزن خالص B (ک‌گ)</th>
                          <th className="p-3 text-left bg-blue-50/70">فی A</th>
                          <th className="p-3 text-left bg-indigo-50/70">فی B</th>
                          <th className="p-3 text-left font-black">اختلاف مبلغ</th>
                          <th className="p-3 text-center font-black">درصد تغییر</th>
                          <th className="p-3 text-center">تحلیل انحراف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {comparisonMetrics?.compareItemRows.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-3 font-bold text-slate-900">{item.itemName}</td>
                            <td className="p-3 text-slate-500">{item.majorCategory}</td>
                            <td className="p-3 text-left font-mono font-bold text-blue-900 bg-blue-50/20">{formatMoney(item.netAmtA)}</td>
                            <td className="p-3 text-left font-mono font-bold text-indigo-900 bg-indigo-50/20">{formatMoney(item.netAmtB)}</td>
                            <td className="p-3 text-center font-mono text-blue-900 bg-blue-50/20">{formatWeight(item.netWgtA)}</td>
                            <td className="p-3 text-center font-mono text-indigo-900 bg-indigo-50/20">{formatWeight(item.netWgtB)}</td>
                            <td className="p-3 text-left font-mono text-blue-900 bg-blue-50/20">{formatMoney(item.netFeeA)}</td>
                            <td className="p-3 text-left font-mono text-indigo-900 bg-indigo-50/20">{formatMoney(item.netFeeB)}</td>
                            <td className={`p-3 text-left font-mono font-black ${item.diffAmt >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {item.diffAmt >= 0 ? '+' : ''}{formatMoney(item.diffAmt)}
                            </td>
                            <td className="p-3 text-center font-mono font-black">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                                item.growthPct > 0 ? 'bg-emerald-100 text-emerald-800' : item.growthPct < 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {item.growthPct > 0 ? '+' : ''}{item.growthPct.toFixed(1)}%
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.variance.color}`}>
                                {item.variance.label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Mobile View (No Horizontal Scrolling) */}
                <div className="block md:hidden divide-y divide-slate-100 bg-white p-3.5 space-y-3.5 max-h-[650px] overflow-y-auto">
                  {compareModeType === 'groups' ? (
                    comparisonMetrics?.compareGroupRows.map((row, idx) => (
                      <div key={idx} className="bg-slate-50/60 rounded-xl border border-slate-100 p-3.5 space-y-2.5">
                        <div className="flex justify-between items-start gap-2 border-b border-slate-200/50 pb-2">
                          <div>
                            <span className="text-[9px] text-slate-400 font-bold font-mono">#{idx + 1} | گروه اصلی کالا</span>
                            <h4 className="font-extrabold text-slate-900 text-xs mt-0.5">{row.catName}</h4>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black font-mono ${
                              row.growthPct > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : row.growthPct < 0 ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-slate-50 text-slate-600 border border-slate-100'
                            }`}>
                              {row.growthPct > 0 ? '+' : ''}{row.growthPct.toFixed(1)}% رشد
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold border ${row.variance.color}`}>
                              {row.variance.label}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono leading-tight">
                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">فروش خالص A:</span>
                            <span className="font-bold text-blue-900">{formatMoney(row.netAmtA)}</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">فروش خالص B:</span>
                            <span className="font-bold text-purple-900">{formatMoney(row.netAmtB)}</span>
                          </div>

                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">وزن خالص A:</span>
                            <span className="font-bold text-blue-900">{formatWeight(row.netWgtA)} kg</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">وزن خالص B:</span>
                            <span className="font-bold text-purple-900">{formatWeight(row.netWgtB)} kg</span>
                          </div>

                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">میانگین فی A:</span>
                            <span className="font-bold text-blue-900">{formatMoney(row.netFeeA)}</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">میانگین فی B:</span>
                            <span className="font-bold text-purple-900">{formatMoney(row.netFeeB)}</span>
                          </div>
                        </div>

                        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2 flex justify-between items-center text-[11px]">
                          <div className="font-bold text-indigo-900 flex items-center gap-1">
                            <span>اختلاف فروش:</span>
                            <span className={`font-mono font-black ${row.diffAmt >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {row.diffAmt >= 0 ? '+' : ''}{formatMoney(row.diffAmt)} ریال
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">سهم A: {row.sharePctA.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    comparisonMetrics?.compareItemRows.map((item, idx) => (
                      <div key={idx} className="bg-slate-50/60 rounded-xl border border-slate-100 p-3.5 space-y-2.5">
                        <div className="flex justify-between items-start gap-2 border-b border-slate-200/50 pb-2">
                          <div>
                            <span className="text-[9px] text-slate-400 font-bold font-mono">#{idx + 1} | {item.majorCategory}</span>
                            <h4 className="font-extrabold text-slate-900 text-xs mt-0.5 leading-tight">{item.itemName}</h4>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black font-mono ${
                              item.growthPct > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : item.growthPct < 0 ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-slate-50 text-slate-600 border border-slate-100'
                            }`}>
                              {item.growthPct > 0 ? '+' : ''}{item.growthPct.toFixed(1)}% تغییر
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold border ${item.variance.color}`}>
                              {item.variance.label}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono leading-tight">
                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">فروش خالص A:</span>
                            <span className="font-bold text-blue-900">{formatMoney(item.netAmtA)}</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">فروش خالص B:</span>
                            <span className="font-bold text-purple-900">{formatMoney(item.netAmtB)}</span>
                          </div>

                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">وزن خالص A:</span>
                            <span className="font-bold text-blue-900">{formatWeight(item.netWgtA)} kg</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">وزن خالص B:</span>
                            <span className="font-bold text-purple-900">{formatWeight(item.netWgtB)} kg</span>
                          </div>

                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">فی A:</span>
                            <span className="font-bold text-blue-900">{formatMoney(item.netFeeA)}</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-slate-100">
                            <span className="text-slate-400 block text-[8px] font-sans">فی B:</span>
                            <span className="font-bold text-purple-900">{formatMoney(item.netFeeB)}</span>
                          </div>
                        </div>

                        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2 flex justify-between items-center text-[11px]">
                          <span className="font-bold text-indigo-900">اختلاف فروش خالص:</span>
                          <span className={`font-mono font-black ${item.diffAmt >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {item.diffAmt >= 0 ? '+' : ''}{formatMoney(item.diffAmt)} ریال
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 5: INTERACTIVE VISUAL CHARTS DASHBOARD */}
      {/* ================================================================== */}
      {activeTab === 'charts' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
          
          {/* Chart 1: Bar Chart Major Categories Sales Amount */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <h3 className="text-xs font-black text-slate-800 mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-600" />
              <span>فروش خالص به تفکیک ۱۵ گروه اصلی کالا (ریال)</span>
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={processedMetrics.categoryList} margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1e9).toFixed(1)}B`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: any) => [`${formatMoney(val)} ریال`, 'فروش خالص']} />
                  <Bar dataKey="netAmt" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Share Donut Chart */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <h3 className="text-xs font-black text-slate-800 mb-4 flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-emerald-600" />
              <span>دیسپوزیشن سهم سرفصل‌های اصلی از کل فروش %</span>
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={processedMetrics.categoryList}
                    dataKey="netAmt"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {processedMetrics.categoryList.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => [`${formatMoney(val)} ریال`, 'سهم فروش']} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      {/* ================================================================== */}
      {/* DEDICATED SECTION BOTTOM ACTIONS (SEND TO CHAT & AI) */}
      {/* ================================================================== */}
      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md p-4 rounded-2xl shadow-xs">
        <div className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-200">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span>عملیات و اشتراک‌گذاری گزارش فروش:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {onShareToChat && (
            <button
              type="button"
              onClick={handleShareCurrentTabToChat}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer min-h-[44px]"
              title="تولید PDF و ارسال این گزارش فروش به گفتگوی شخصی یا گروهی"
            >
              <Send className="w-4 h-4" />
              <span>ارسال این گزارش به گفتگو (PDF)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsAiModalOpen(true)}
            disabled={processedMetrics.categoryList.length === 0}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl text-xs font-black shadow-md shadow-purple-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
            title="تحلیل هوشمند و مهندسی فروش با هوش مصنوعی"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>تحلیل هوش مصنوعی فروش (AI)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBotModalOpen(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer min-h-[44px]"
            title="ارسال این گزارش به تلگرام و بله"
          >
            <Send className="w-4 h-4" />
            <span>ارسال به بات‌ها (تلگرام / بله)</span>
          </button>

          <button
            type="button"
            onClick={handleExportImage}
            disabled={isExportingImage}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-slate-300 dark:border-zinc-700 active:scale-95 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
            title="دانلود تصویر کل داشبورد"
          >
            <ImageIcon className="w-4 h-4" />
            <span>دانلود تصویر داشبورد</span>
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* BOT DISPATCH INTERACTIVE MODAL */}
      {/* ================================================================== */}
      {isBotModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[10000] flex items-center justify-center p-3 sm:p-4 pb-16 sm:pb-20" dir="rtl">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-lg w-full max-h-[80vh] sm:max-h-[82vh] flex flex-col shadow-2xl border border-slate-200 dark:border-zinc-800 animate-scaleUp overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 px-4 py-3 shrink-0 bg-slate-50/70 dark:bg-zinc-900/70">
              <div className="flex items-center gap-2 text-slate-900 dark:text-zinc-100 font-extrabold text-sm">
                <Send className="w-5 h-5 text-emerald-600" />
                <span>ارسال گزارش فروش به پیام‌رسان‌ها (بات‌ها و پی‌وی)</span>
              </div>
              <button 
                onClick={() => setIsBotModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 min-h-0 space-y-3 custom-scrollbar">
              {/* Report Summary Card */}
              <div className="bg-slate-50 dark:bg-zinc-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-zinc-700/60 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-zinc-300">
                  <span>نوع گزارش آماده ارسال:</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${compareMode ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200' : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200'}`}>
                    {compareMode ? '📊 گزارش مقایسه‌ای دوره A و B' : '📈 گزارش مدیریتی تک‌دوره‌ای'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                  {compareMode 
                    ? `بازه A (${dateFrom} تا ${dateTo}) در مقایسه با بازه B (${salesDateFromB} تا ${salesDateToB}) به صورت فایل PDF تحلیلی ارسال می‌شود.`
                    : `گزارش آمار و خلاصه فروش بازه ${dateFrom} تا ${dateTo} با سرتیتر تاریخ دقیق بازه ارسال خواهد شد.`}
                </p>
              </div>

              {/* Destination Mode Selector (Default Groups vs Individual PVs) */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block">نحوه انتخاب مقصد ارسال:</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-zinc-800 p-1 rounded-2xl border border-slate-200 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => setBotSendMode('custom_recipients')}
                    className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      botSendMode === 'custom_recipients'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>اشخاص، PV و شماره</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBotSendMode('default_groups')}
                    className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      botSendMode === 'default_groups'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>کانال‌ها و گروه‌های پیش‌فرض</span>
                  </button>
                </div>
              </div>

              {/* Platform Selection Checkboxes */}
              <div className="space-y-2 bg-slate-50 dark:bg-zinc-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-zinc-700/60">
                <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300 block mb-1">پلتفرم‌های مقصد:</span>
                
                <div className="flex flex-wrap items-center gap-4">
                  {[
                    { id: 'telegram', label: 'تلگرام (Telegram)', color: 'text-blue-600 dark:text-blue-400' },
                    { id: 'bale', label: 'بله (Bale)', color: 'text-emerald-600 dark:text-emerald-400' },
                    { id: 'whatsapp', label: 'واتساپ (WhatsApp)', color: 'text-green-600 dark:text-green-400' }
                  ].map(p => (
                    <label key={p.id} className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-zinc-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPlatforms.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedPlatforms(prev => [...prev, p.id]);
                          else setSelectedPlatforms(prev => prev.filter(x => x !== p.id));
                        }}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className={p.color}>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* PV & Contact Picker Component */}
              {botSendMode === 'custom_recipients' && (
                <div className="space-y-3 pt-1">
                  <div className="border border-slate-200 dark:border-zinc-700 rounded-2xl p-2.5 bg-white dark:bg-zinc-900">
                    <SmartBotRecipientPicker
                      selectedPlatforms={selectedPlatforms as any}
                      selectedChatIdsTele={customChatIdsTele}
                      onChangeTele={setCustomChatIdsTele}
                      selectedChatIdsBale={customChatIdsBale}
                      onChangeBale={setCustomChatIdsBale}
                      selectedChatIdsWa={customChatIdsWa}
                      onChangeWa={setCustomChatIdsWa}
                      settings={settings}
                      label="انتخاب افراد، مخاطبین بازرگانی یا گروه‌های مقصد (PV):"
                      compact={true}
                    />
                  </div>

                  {/* Manual WhatsApp Phone Number Entry */}
                  {selectedPlatforms.includes('whatsapp') && (
                    <div className="bg-green-50/70 dark:bg-green-950/30 p-3 rounded-2xl border border-green-200 dark:border-green-800/50 space-y-1.5">
                      <label className="text-[11px] font-bold text-green-900 dark:text-green-300 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-green-600" />
                        <span>ارسال مستقیم به شماره واتساپ (شماره دستی):</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="tel"
                          value={manualWhatsappPhone}
                          onChange={(e) => setManualWhatsappPhone(e.target.value)}
                          placeholder="مثال: 09123456789"
                          className="w-full text-xs font-mono font-bold bg-white dark:bg-zinc-900 border border-green-300 dark:border-green-700/60 rounded-xl px-3 py-2 text-slate-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-green-500"
                        />
                        {manualWhatsappPhone && (
                          <button
                            type="button"
                            onClick={() => setManualWhatsappPhone('')}
                            className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                            title="پاک کردن شماره"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-green-800/80 dark:text-green-400/80">
                        شماره موبایل وارد شده برای دریافت پیام شخصی (PV) در اولویت قرار می‌گیرد.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Manual Quick Action Options */}
              <div className="pt-2 space-y-1.5 border-t border-slate-100 dark:border-zinc-800">
                <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 block">ارسال‌های دستی فوری:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendManualReport('today')}
                    disabled={isSendingBot || selectedPlatforms.length === 0}
                    className="px-3 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-300 font-bold rounded-xl text-[11px] border border-blue-200 dark:border-blue-800 transition-all cursor-pointer disabled:opacity-50 text-center"
                  >
                    ⚡ ارسال فروش امروز
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendManualReport('yesterday')}
                    disabled={isSendingBot || selectedPlatforms.length === 0}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 font-bold rounded-xl text-[11px] border border-slate-300 dark:border-zinc-700 transition-all cursor-pointer disabled:opacity-50 text-center"
                  >
                    🗓️ ارسال فروش دیروز
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0 bg-slate-50/70 dark:bg-zinc-900/70">
              <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                {computedCustomTargets ? `${computedCustomTargets.length} مقصد سفارشی انتخاب شده` : 'ارسال به گروه‌های پیش‌فرض'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBotModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={handleSendToBots}
                  disabled={isSendingBot || selectedPlatforms.length === 0}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSendingBot && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{compareMode ? 'ارسال PDF مقایسه‌ای' : 'ارسال گزارش بازه فعلی'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* AI Strategic & Engineering Sales Report Modal */}
      <AiSayanReportModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        reportSection="sales"
        sectionTitle="گزارش جامع تحلیلی و مدیریتی فروش سایان"
        reportPayload={{
          rangeNetAmt: processedMetrics.rangeNetAmt,
          rangeNetWgt: processedMetrics.rangeNetWgt,
          rangeNetFee: processedMetrics.rangeNetFee,
          rangeRetAmt: processedMetrics.rangeRetAmt,
          rangeRetWgt: processedMetrics.rangeRetWgt,
          invoiceCount: processedMetrics.invoiceCount,
          customerCount: processedMetrics.customerCount,
          avgInvoiceAmt: processedMetrics.avgInvoiceAmt,
          topCategory: processedMetrics.insights.topGroup,
          topProduct: processedMetrics.insights.topProductByAmt,
          categories: processedMetrics.categoryList.map(c => ({
            name: c.name,
            salesWgt: c.salesWgt,
            retWgt: c.retWgt,
            netWgt: c.netWgt,
            salesAmt: c.salesAmt,
            retAmt: c.retAmt,
            netAmt: c.netAmt,
            netFee: c.netFee,
            sharePct: c.sharePct
          })),
          topItems: processedMetrics.itemList.slice(0, 15).map(i => ({
            code: i.itemCode,
            name: i.itemName,
            category: i.majorCategory,
            netQty: i.netQty,
            netAmt: i.netAmt,
            netFee: i.netFee,
            sharePct: i.sharePct
          }))
        }}
        dateRange={{ from: dateFrom, to: dateTo }}
        settings={settings}
      />

    </div>
  );
};

export default React.memo(SayanSalesDashboard);
