import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  User,
  Users,
  Layers,
  Package,
  Scale,
  ShoppingCart,
  ShoppingBag,
  ArrowLeftRight,
  List,
  LayoutList,
  BarChart3,
  X,
  Check,
  Loader2,
  AlertCircle,
  Filter,
  ChevronsUpDown,
  RotateCcw,
  Calendar
} from 'lucide-react';
import * as XLSX from 'xlsx';
import * as jalaali from 'jalaali-js';
import { toast } from 'react-hot-toast';
import { saveWorkbookAndOpen } from '../services/fileService';
import { exportReportHtmlSmart } from '../utils/pdfGenerator';

export interface SayanInvoicesReportTabProps {
  settings?: any;
  currentUser?: any;
  dateFrom: string;
  dateTo: string;
  runSayanQuery: (queryStr: string) => Promise<any[]>;
  initialTafsilis?: any[];
}

type InvoiceDirectionFilter = 'all' | 'sales' | 'purchase';
type ReportViewMode = 'by_invoice' | 'flat_lines' | 'by_item' | 'by_party';

interface SayanPersonOption {
  personCode: string;
  tafsiliCode: string;
  name: string;
  group: string;
  categories: string;
}

interface ParsedInvoiceLine {
  lineKey: string;
  docId: string;
  archiveNo: string;
  invoiceNum: string;
  subCode: string;
  dateIso: string;
  dateJalali: string;
  opCode: string;
  opTitle: string;
  subSystem: string;
  direction: 'sales' | 'purchase';
  isReturn: boolean;
  personCode: string;
  personName: string;
  warehouseCode: string;
  warehouseName: string;
  rowNo: number;
  itemCode: string;
  itemName: string;
  itemType: string;
  unitName: string;
  quantity: number;
  netWeight: number;
  grossWeight: number;
  cartons: number;
  bobbins: number;
  grade: string;
  unitPrice: number;
  grossAmount: number;
  discount: number;
  taxVat: number;
  finalAmount: number;
  itemNotes: string;
  headerNotes: string;
}

interface GroupedInvoice {
  docKey: string;
  docId: string;
  archiveNo: string;
  invoiceNum: string;
  subCode: string;
  dateIso: string;
  dateJalali: string;
  opCode: string;
  opTitle: string;
  direction: 'sales' | 'purchase';
  isReturn: boolean;
  personCode: string;
  personName: string;
  warehouseCode: string;
  warehouseName: string;
  headerNotes: string;
  headerPayable: number;
  totalQuantity: number;
  totalNetWeight: number;
  totalGrossWeight: number;
  totalCartons: number;
  totalDiscount: number;
  totalTaxVat: number;
  totalAmount: number;
  lines: ParsedInvoiceLine[];
}

const OP_CODE_LABELS: Record<string, { title: string; direction: 'sales' | 'purchase'; isReturn?: boolean }> = {
  '3': { title: 'فاکتور فروش', direction: 'sales' },
  '12': { title: 'فاکتور فروش', direction: 'sales' },
  '23': { title: 'حواله / فاکتور فروش', direction: 'sales' },
  '13': { title: 'برگشت از فروش', direction: 'sales', isReturn: true },
  '24': { title: 'رسید مرجوعی فروش', direction: 'sales', isReturn: true },
  '1': { title: 'فاکتور خرید', direction: 'purchase' },
  '2': { title: 'فاکتور خرید', direction: 'purchase' },
  '11': { title: 'فاکتور خرید', direction: 'purchase' },
  '14': { title: 'فاکتور خرید', direction: 'purchase' },
  '15': { title: 'برگشت از خرید', direction: 'purchase', isReturn: true },
  '16': { title: 'فاکتور خرید', direction: 'purchase' },
  '27': { title: 'رسید خرید قطعات و لوازم', direction: 'purchase' },
  '29': { title: 'رسید / فاکتور خرید انبار', direction: 'purchase' },
  '30': { title: 'حواله مرجوعی خرید انبار', direction: 'purchase', isReturn: true },
  '31': { title: 'حواله مرجوعی لوازم و قطعات', direction: 'purchase', isReturn: true },
  '54': { title: 'فاکتور خرید بازرگانی', direction: 'purchase' },
  '55': { title: 'فاکتور خرید بازرگانی', direction: 'purchase' },
  '56': { title: 'فاکتور خرید بازرگانی', direction: 'purchase' },
  '57': { title: 'پیش‌فاکتور خرید', direction: 'purchase' },
  '58': { title: 'فاکتور خرید بازرگانی', direction: 'purchase' },
  '59': { title: 'برگشت از خرید بازرگانی', direction: 'purchase', isReturn: true },
  '60': { title: 'فاکتور خرید بازرگانی', direction: 'purchase' }
};

const WAREHOUSE_FALLBACK_NAMES: Record<string, string> = {
  '11': 'انبار کارخانه',
  '12': 'انبار تولید',
  '13': 'انبار ضایعات',
  '14': 'انبار ملزومات و قطعات',
  '15': 'انبار تهران',
  '16': 'انبار تک',
  '17': 'انبار تلاش',
  '18': 'انبار ملزومات جدید'
};

const normalizeFa = (val: string) =>
  String(val || '')
    .trim()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const formatNum = (val: number, maxDecimals = 0) => {
  if (!isFinite(val)) return '۰';
  return new Intl.NumberFormat('fa-IR', {
    maximumFractionDigits: maxDecimals
  }).format(maxDecimals === 0 ? Math.round(val) : val);
};

const formatDateToJalali = (dateStr: string): string => {
  if (!dateStr) return '-';
  if (dateStr.includes('/') && !dateStr.includes('T')) return dateStr;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const iranTime = new Date(d.getTime() + 3.5 * 60 * 60 * 1000);
    const j = jalaali.toJalaali(
      iranTime.getUTCFullYear(),
      iranTime.getUTCMonth() + 1,
      iranTime.getUTCDate()
    );
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  } catch {
    return String(dateStr);
  }
};

const jalaliToGregorianStr = (shamsiStr: string): string => {
  if (!shamsiStr) return '';
  const eng = String(shamsiStr)
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/-/g, '/')
    .trim();
  const parts = eng.split('/');
  if (parts.length !== 3) return '';
  const jy = parseInt(parts[0], 10);
  const jm = parseInt(parts[1], 10);
  const jd = parseInt(parts[2], 10);
  if (isNaN(jy) || isNaN(jm) || isNaN(jd) || jy < 1300) return '';
  try {
    const g = jalaali.toGregorian(jy, jm, jd);
    return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
  } catch {
    return '';
  }
};

const parseItemNotesMeta = (notesRaw: string) => {
  const notes = String(notesRaw || '');
  const extractNum = (regex: RegExp) => {
    const m = notes.match(regex);
    if (!m) return 0;
    const n = parseFloat(String(m[1]).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const netWeight = extractNum(/وزن خالص\s*[:：\-]?\s*([\d.]+)/);
  const grossWeight = extractNum(/وزن ناخالص\s*[:：\-]?\s*([\d.]+)/);
  const cartons = extractNum(/تعداد کارتن\s*[:：\-]?\s*([\d.]+)/);
  const bobbins = extractNum(/تعداد بوبین\s*[:：\-]?\s*([\d.]+)/);
  const feeFromNote = extractNum(/(?:فی|قیمت واحد|نرخ|قیمت)\s*[:：\-]?\s*([\d,.]+)/);
  const gradeMatch = notes.match(/گرید\s*[:：\-]?\s*([A-Za-z0-9+]+)/i);
  return {
    netWeight,
    grossWeight,
    cartons,
    bobbins,
    feeFromNote,
    grade: gradeMatch ? gradeMatch[1].toUpperCase() : ''
  };
};

const detectItemTypeLabel = (itemCode: string, itemName: string, groupName: string): string => {
  if (groupName && groupName.trim()) return groupName.trim();
  const n = normalizeFa(itemName);
  if (n.includes('اسپاندکس') || n.includes('کاور')) return 'نخ اسپاندکس / کاور';
  if (n.includes('پلی استر') || n.includes('dty') || n.includes('تکسچره')) return 'نخ پلی‌استر DTY';
  if (n.includes('poy')) return 'نخ POY';
  if (n.includes('fdy')) return 'نخ FDY';
  if (n.includes('نایلون')) return 'نخ نایلون';
  if (n.includes('پنبه')) return 'نخ پنبه';
  if (n.includes('ویسکوز')) return 'نخ ویسکوز';
  if (n.includes('کش') || n.includes('لاستیک') || n.includes('لاکرا')) return 'کش / لاستیک';
  if (n.includes('چیپس') || n.includes('مستربچ') || n.includes('مستر بچ') || n.includes('روغن')) return 'مواد اولیه تولید';
  if (n.includes('کارتن') || n.includes('دوک') || n.includes('پالت') || n.includes('بسته')) return 'ملزومات بسته‌بندی';
  if (/^(01|02)/.test(itemCode)) return 'محصول تولیدی / نخ';
  if (/^(04|05)/.test(itemCode)) return 'مواد اولیه';
  if (/^(03|06|07|08|09)/.test(itemCode)) return 'قطعات و ملزومات';
  return 'سایر اقلام';
};

const classifyOpCode = (opCodeRaw: string, subSystemRaw: string, dynamicTitles: Record<string, string>) => {
  const op = String(opCodeRaw || '').trim();
  const known = OP_CODE_LABELS[op];
  const dynTitle = dynamicTitles[op] || '';
  if (known) {
    return {
      title: dynTitle || known.title,
      direction: known.direction,
      isReturn: Boolean(known.isReturn)
    };
  }
  const normTitle = normalizeFa(dynTitle);
  const isRet = normTitle.includes('برگشت') || normTitle.includes('مرجوع');
  if (normTitle.includes('فروش')) {
    return { title: dynTitle, direction: 'sales' as const, isReturn: isRet };
  }
  if (normTitle.includes('خرید')) {
    return { title: dynTitle, direction: 'purchase' as const, isReturn: isRet };
  }
  const sub = String(subSystemRaw || '').trim();
  return {
    title: dynTitle || (sub === '3' ? `سند بازرگانی (${op})` : `سند انبار (${op})`),
    direction: 'purchase' as const,
    isReturn: isRet
  };
};

const escapeHtml = (str: string) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const SayanInvoicesReportTab: React.FC<SayanInvoicesReportTabProps> = ({
  settings,
  dateFrom,
  dateTo,
  runSayanQuery,
  initialTafsilis = []
}) => {
  const [persons, setPersons] = useState<SayanPersonOption[]>([]);
  const [loadingPersons, setLoadingPersons] = useState(false);

  // Filters
  const [selectedPersonCode, setSelectedPersonCode] = useState<string>(''); // '' = All persons
  const [personDropdownOpen, setPersonDropdownOpen] = useState(false);
  const [personSearchText, setPersonSearchText] = useState('');
  const personDropdownRef = useRef<HTMLDivElement | null>(null);

  const [directionFilter, setDirectionFilter] = useState<InvoiceDirectionFilter>('all');
  const [includeReturns, setIncludeReturns] = useState<boolean>(true);
  const [includeProforma, setIncludeProforma] = useState<boolean>(false);
  const [selectedOpCodeFilter, setSelectedOpCodeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<ReportViewMode>('by_invoice');

  // Data
  const [rawLines, setRawLines] = useState<ParsedInvoiceLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFetchedRange, setLastFetchedRange] = useState<string>('');
  const [expandedInvoiceKeys, setExpandedInvoiceKeys] = useState<Set<string>>(new Set());
  // Lookup caches fetched cleanly in parallel so the main invoice query stays lean and never times out
  const [dynamicOpTitles, setDynamicOpTitles] = useState<Record<string, string>>({});
  const [warehouseNamesMap, setWarehouseNamesMap] = useState<Record<string, string>>({});
  const [itemMetaMap, setItemMetaMap] = useState<Record<string, { name: string; group: string }>>({});

  // Strict numeric parser so Sayan string tracking keys (e.g. '2-1-241-19449') or BIT flags (false/true) never become bogus numbers
  const toStrictNumber = (val: any): number => {
    if (typeof val === 'number') return isFinite(val) ? val : 0;
    if (typeof val === 'boolean' || val === null || val === undefined) return 0;
    const s = String(val).replace(/,/g, '').trim();
    if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return 0;
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };

  // Close person dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (personDropdownRef.current && !personDropdownRef.current.contains(e.target as Node)) {
        setPersonDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Build persons list from initialTafsilis and live Sayan ACT_TBL_007 + GNR_TBL_001
  const buildPersonsFromRows = (rows: any[]): SayanPersonOption[] => {
    const map = new Map<string, SayanPersonOption>();
    (rows || []).forEach((r: any) => {
      const pCode = String(r.PersonCode || r.Code || '').trim();
      const tCode = String(r.Code || r.PersonCode || '').trim();
      const name = String(r.Name || '').trim();
      if (!pCode && !tCode) return;
      const key = pCode || tCode;
      const group = String(r.TafsiliGroup || '').trim();
      const existing = map.get(key);
      if (!existing || (group === '11' && existing.group !== '11') || (!existing.name && name)) {
        map.set(key, {
          personCode: pCode || tCode,
          tafsiliCode: tCode || pCode,
          name: name || existing?.name || `شخص کد ${key}`,
          group,
          categories: String(r.Categories || existing?.categories || '').trim()
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  };

  useEffect(() => {
    if (Array.isArray(initialTafsilis) && initialTafsilis.length > 0 && persons.length === 0) {
      setPersons(buildPersonsFromRows(initialTafsilis));
    }
  }, [initialTafsilis]);

  const loadSayanPersons = async () => {
    setLoadingPersons(true);
    try {
      const sql = `
        SELECT
          RTRIM(LTRIM(t7.Field_003)) as Code,
          RTRIM(LTRIM(t7.Field_006)) as Name,
          RTRIM(LTRIM(t7.Field_005)) as PersonCode,
          RTRIM(LTRIM(t7.Field_004)) as TafsiliGroup,
          RTRIM(LTRIM(g.Field_032)) as Categories
        FROM ACT_TBL_007 t7 WITH (NOLOCK)
        LEFT JOIN GNR_TBL_001 g WITH (NOLOCK) ON RTRIM(LTRIM(t7.Field_005)) = RTRIM(LTRIM(g.Field_003))
        WHERE t7.Field_005 IS NOT NULL AND RTRIM(LTRIM(t7.Field_005)) <> ''
        ORDER BY t7.Field_006 ASC
      `;
      const rows = await runSayanQuery(sql);
      if (Array.isArray(rows) && rows.length > 0) {
        setPersons(buildPersonsFromRows(rows));
      }
    } catch (err) {
      console.warn('[SayanInvoicesReport] Failed loading persons:', err);
    } finally {
      setLoadingPersons(false);
    }
  };

  const fetchInvoicesData = async (overridePersonCode?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    const activePerson = overridePersonCode !== undefined ? overridePersonCode : selectedPersonCode;
    try {
      const gregFrom = jalaliToGregorianStr(dateFrom);
      const gregTo = jalaliToGregorianStr(dateTo);

      const dateFilter =
        gregFrom && gregTo
          ? `AND t10.Field_008 >= '${gregFrom}T00:00:00' AND t10.Field_008 <= '${gregTo}T23:59:59'`
          : '';

      // Match person code cleanly (exact PersonCode or prefixed variants)
      let personFilter = '';
      if (activePerson) {
        const cleanP = activePerson.replace(/'/g, "''").trim();
        const personObj = persons.find(p => p.personCode === activePerson);
        const altCode = personObj?.tafsiliCode ? personObj.tafsiliCode.replace(/'/g, "''").trim() : '';
        const candidates = Array.from(
          new Set([
            cleanP,
            altCode,
            cleanP.startsWith('11') && cleanP.length > 2 ? cleanP.slice(2) : '',
            cleanP.startsWith('31') && cleanP.length > 2 ? cleanP.slice(2) : ''
          ].filter(Boolean))
        );
        const inList = candidates.map(c => `'${c}'`).join(', ');
        personFilter = `AND RTRIM(LTRIM(ISNULL(t10.Field_010, ''))) IN (${inList})`;
      }

      // Operation filter covering both Sales & Purchase Invoices in Sayan (commercial Field_018=3 and warehouse priced docs)
      const salesOpCodes = ["'3'", "'12'", "'23'"];
      const salesReturnCodes = ["'13'", "'24'"];
      const purchaseOpCodes = ["'1'", "'2'", "'11'", "'14'", "'16'", "'27'", "'29'", "'54'", "'55'", "'56'", "'58'", "'60'"];
      const purchaseReturnCodes = ["'15'", "'30'", "'31'", "'59'"];
      if (includeProforma) {
        purchaseOpCodes.push("'57'");
      }

      const activeCodes: string[] = [];
      if (directionFilter === 'all' || directionFilter === 'sales') {
        activeCodes.push(...salesOpCodes);
        if (includeReturns) activeCodes.push(...salesReturnCodes);
      }
      if (directionFilter === 'all' || directionFilter === 'purchase') {
        activeCodes.push(...purchaseOpCodes);
        if (includeReturns) activeCodes.push(...purchaseReturnCodes);
      }

      // Include any unknown commercial (SubSystem=3) invoice opcode that is NOT a purchase request ('53')
      // IMPORTANT: Never compare BIT/NVARCHAR columns (t11.Field_009/010/011) with > 0 in SQL!
      const commercialCatchAll =
        directionFilter === 'purchase' || directionFilter === 'all'
          ? `OR (t10.Field_018 = 3 AND RTRIM(LTRIM(t10.Field_009)) NOT IN ('53'${includeProforma ? '' : ", '57'"}, '3', '12', '13', '23', '24') AND (ISNULL(t11.Field_007, 0) > 0 OR ISNULL(t10.Field_037, 0) > 0 OR ISNULL(t10.Field_026, 0) > 0))`
          : '';

      // Lean, 100% schema-verified SQL query (zero nonexistent Field_002, zero BIT/NVARCHAR numeric casts, zero heavy nested GROUP BY joins)
      const sql = `
        SELECT TOP 8000
          t10.Field_001 as DocId,
          t10.Field_004 as FiscalYear,
          t10.Field_005 as ArchiveNo,
          t10.Field_006 as InvoiceNum,
          t10.Field_007 as SubCode,
          t10.Field_008 as DocDate,
          RTRIM(LTRIM(t10.Field_009)) as OpCode,
          RTRIM(LTRIM(ISNULL(t10.Field_010, ''))) as PersonCode,
          RTRIM(LTRIM(ISNULL(t10.Field_011, ''))) as WarehouseCode,
          t10.Field_018 as SubSystem,
          ISNULL(t10.Field_029, '') as HeaderNotes,
          t10.Field_017 as HeaderNote2,
          ISNULL(t10.Field_026, 0) as HeaderGross,
          ISNULL(t10.Field_037, 0) as HeaderPayable,
          t11.Field_001 as LineId,
          t11.Field_034 as RowNo,
          RTRIM(LTRIM(ISNULL(t11.Field_005, ''))) as ItemCode,
          COALESCE(
            NULLIF(RTRIM(LTRIM(t22.Field_004)), ''),
            NULLIF(RTRIM(LTRIM(g03.Field_008)), ''),
            ''
          ) as DirectItemName,
          ISNULL(t11.Field_006, 0) as Quantity,
          ISNULL(t11.Field_007, 0) as Amount,
          t11.Field_008 as RawDiscount,
          t11.Field_009 as RawNetOrFee,
          t11.Field_010 as RawVatOrTotal,
          t11.Field_011 as RawTax,
          ISNULL(t11.Field_031, '') as ItemNotes,
          t11.Field_017 as ItemNotes2,
          NULLIF(RTRIM(LTRIM(COALESCE(g01.Field_006, '') + ' ' + COALESCE(g01.Field_007, ''))), '') as GnrPersonName
        FROM STR_TBL_010 t10 WITH (NOLOCK)
        INNER JOIN STR_TBL_011 t11 WITH (NOLOCK)
          ON t11.Field_004 = t10.Field_005
         AND t11.Field_003 = t10.Field_004
         AND t11.Field_012 = t10.Field_018
         AND (
              (t10.Field_009 IN ('3', '12', '23') AND (t11.Field_036 = t10.Field_009 OR t11.Field_036 IS NULL OR RTRIM(LTRIM(t11.Field_036)) = ''))
              OR (t10.Field_009 = '13' AND (t11.Field_036 IN ('3', '12', '23', '13') OR t11.Field_036 IS NULL OR RTRIM(LTRIM(t11.Field_036)) = ''))
              OR t10.Field_009 NOT IN ('3', '12', '23', '13')
         )
        LEFT JOIN IND_TBL_022 t22 WITH (NOLOCK) ON RTRIM(LTRIM(t22.Field_005)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN GNR_TBL_003 g03 WITH (NOLOCK) ON RTRIM(LTRIM(g03.Field_003)) = RTRIM(LTRIM(t11.Field_005))
        LEFT JOIN GNR_TBL_001 g01 WITH (NOLOCK) ON RTRIM(LTRIM(g01.Field_003)) = RTRIM(LTRIM(t10.Field_010))
        WHERE (
          RTRIM(LTRIM(t10.Field_009)) IN (${activeCodes.join(', ')})
          ${commercialCatchAll}
        )
        ${dateFilter}
        ${personFilter}
        ORDER BY t10.Field_008 DESC, t10.Field_005 DESC, t11.Field_001 ASC
      `;

      // Run main query + lightweight lookup queries in parallel (each lookup cached once & fault-tolerant)
      const [rows, whRows, itemGroupRows] = await Promise.all([
        runSayanQuery(sql),
        Object.keys(warehouseNamesMap).length === 0
          ? runSayanQuery(
              `SELECT RTRIM(LTRIM(Field_003)) as WCode, RTRIM(LTRIM(Field_004)) as WName FROM STR_TBL_001 WITH (NOLOCK)`
            ).catch(() => [])
          : Promise.resolve([]),
        Object.keys(itemMetaMap).length === 0
          ? runSayanQuery(`
              SELECT
                RTRIM(LTRIM(t21.Field_004)) as ItemCode,
                MIN(t02.Field_003) as ItemName,
                MIN(COALESCE(t02_gp.Field_003, t02_p.Field_003, t02.Field_003)) as GroupName
              FROM IND_TBL_021 t21 WITH (NOLOCK)
              LEFT JOIN IND_TBL_002 t02 WITH (NOLOCK) ON RTRIM(LTRIM(t21.Field_003)) = RTRIM(LTRIM(t02.Field_008))
              LEFT JOIN IND_TBL_002 t02_p WITH (NOLOCK) ON RTRIM(LTRIM(t02.Field_009)) = RTRIM(LTRIM(t02_p.Field_008))
              LEFT JOIN IND_TBL_002 t02_gp WITH (NOLOCK) ON RTRIM(LTRIM(t02_p.Field_009)) = RTRIM(LTRIM(t02_gp.Field_008))
              GROUP BY RTRIM(LTRIM(t21.Field_004))
            `).catch(() => [])
          : Promise.resolve([])
      ]);

      const mergedOpTitles = dynamicOpTitles;

      let mergedWhNames = warehouseNamesMap;
      if (Array.isArray(whRows) && whRows.length > 0) {
        const nextWh: Record<string, string> = { ...warehouseNamesMap };
        whRows.forEach((w: any) => {
          const code = String(w.WCode || '').trim();
          const name = String(w.WName || '').trim();
          if (code && name) nextWh[code] = name;
        });
        setWarehouseNamesMap(nextWh);
        mergedWhNames = nextWh;
      }

      let mergedItemMeta = itemMetaMap;
      if (Array.isArray(itemGroupRows) && itemGroupRows.length > 0) {
        const nextItems: Record<string, { name: string; group: string }> = { ...itemMetaMap };
        itemGroupRows.forEach((it: any) => {
          const code = String(it.ItemCode || '').trim();
          if (!code) return;
          nextItems[code] = {
            name: String(it.ItemName || '').trim(),
            group: String(it.GroupName || '').trim()
          };
        });
        setItemMetaMap(nextItems);
        mergedItemMeta = nextItems;
      }

      // Fast O(1) person name lookup from preloaded ACT_TBL_007 / initialTafsilis
      const personNameByCode = new Map<string, string>();
      (persons.length > 0 ? persons : buildPersonsFromRows(initialTafsilis || [])).forEach(p => {
        if (p.personCode && p.name) personNameByCode.set(p.personCode, p.name);
        if (p.tafsiliCode && p.name && !personNameByCode.has(p.tafsiliCode)) {
          personNameByCode.set(p.tafsiliCode, p.name);
        }
      });

      // Group raw rows by document to allocate HeaderPayable accurately when line amounts need normalization
      const byDoc = new Map<string, any[]>();
      (rows || []).forEach((r: any) => {
        const docKey = `${r.FiscalYear || ''}_${r.SubSystem || ''}_${r.DocId || r.ArchiveNo || ''}_${r.OpCode || ''}`;
        if (!byDoc.has(docKey)) byDoc.set(docKey, []);
        byDoc.get(docKey)!.push(r);
      });

      const parsed: ParsedInvoiceLine[] = [];
      byDoc.forEach((docRows, docKey) => {
        const first = docRows[0];
        const opCode = String(first.OpCode || '').trim();
        const subSystem = String(first.SubSystem || '').trim();
        const opMeta = classifyOpCode(opCode, subSystem, mergedOpTitles);
        const headerPayable = toStrictNumber(first.HeaderPayable) || toStrictNumber(first.HeaderGross);

        // Determine raw line amounts safely (ignoring non-numeric tracking strings or BIT flags)
        const rawLineAmts = docRows.map(r => {
          const amt7 = toStrictNumber(r.Amount);
          const net9 = toStrictNumber(r.RawNetOrFee);
          const vat10 = toStrictNumber(r.RawVatOrTotal);
          if (opCode === '57') {
            return vat10 > 0 ? vat10 : net9 * toStrictNumber(r.Quantity);
          }
          if (amt7 > 0) return amt7;
          if (net9 > 0 && subSystem === '3') return net9;
          return 0;
        });

        const sumRawAmt = rawLineAmts.reduce((s, a) => s + a, 0);
        const sumQty = docRows.reduce((s, r) => s + toStrictNumber(r.Quantity), 0);

        docRows.forEach((r, idx) => {
          const rawItemNotes = [r.ItemNotes, r.ItemNotes2].filter(Boolean).join(' | ').trim();
          const headerNotes = [r.HeaderNotes, r.HeaderNote2].filter(Boolean).join(' | ').trim();
          const noteMeta = parseItemNotesMeta(rawItemNotes);

          const qty = toStrictNumber(r.Quantity);
          const netWeight = noteMeta.netWeight > 0 ? noteMeta.netWeight : qty;
          const grossWeight = noteMeta.grossWeight;

          const baseLineAmt = rawLineAmts[idx];
          const discount = opCode === '57' ? 0 : toStrictNumber(r.RawDiscount);
          const taxVat =
            opCode === '57'
              ? 0
              : toStrictNumber(r.RawVatOrTotal) + toStrictNumber(r.RawTax);

          let finalAmount = baseLineAmt;
          if (headerPayable > 0 && opCode !== '57') {
            if (sumRawAmt > 0) {
              // If header payable differs from raw sum (e.g. includes header VAT/discount), allocate proportionally
              finalAmount = headerPayable * (baseLineAmt / sumRawAmt);
            } else if (sumQty > 0 && qty > 0) {
              finalAmount = headerPayable * (qty / sumQty);
            } else {
              finalAmount = headerPayable / docRows.length;
            }
          } else if (baseLineAmt > 0 && discount > 0 && headerPayable === 0) {
            finalAmount = Math.max(0, baseLineAmt - discount + taxVat);
          }

          const effectiveWeight = netWeight > 0 ? netWeight : qty;
          let unitPrice = 0;
          if (opCode === '57') {
            unitPrice = toStrictNumber(r.RawNetOrFee) || (effectiveWeight > 0 ? finalAmount / effectiveWeight : 0);
          } else if (effectiveWeight > 0 && baseLineAmt > 0) {
            unitPrice = baseLineAmt / effectiveWeight;
          } else if (effectiveWeight > 0 && finalAmount > 0) {
            unitPrice = finalAmount / effectiveWeight;
          } else if (noteMeta.feeFromNote > 0) {
            unitPrice = noteMeta.feeFromNote;
          }

          const wCode = String(r.WarehouseCode || '').trim();
          const wName = mergedWhNames[wCode] || WAREHOUSE_FALLBACK_NAMES[wCode] || (wCode ? `انبار ${wCode}` : '-');
          const itemCode = String(r.ItemCode || '').trim();
          const metaEntry = mergedItemMeta[itemCode];
          const itemName = String(r.DirectItemName || '').trim() || metaEntry?.name || itemCode || 'کالای بدون نام';
          const pCode = String(r.PersonCode || '').trim();
          const pName =
            personNameByCode.get(pCode) ||
            (pCode.length > 2 ? personNameByCode.get(pCode.slice(2)) : undefined) ||
            String(r.GnrPersonName || '').trim() ||
            pCode ||
            'نامشخص';

          parsed.push({
            lineKey: `${docKey}_${r.LineId || idx}`,
            docId: String(r.DocId || r.ArchiveNo || ''),
            archiveNo: String(r.ArchiveNo || ''),
            invoiceNum: String(r.InvoiceNum || r.ArchiveNo || r.DocId || '-'),
            subCode: String(r.SubCode || '').trim(),
            dateIso: String(r.DocDate || ''),
            dateJalali: formatDateToJalali(r.DocDate),
            opCode,
            opTitle: opMeta.title,
            subSystem,
            direction: opMeta.direction,
            isReturn: opMeta.isReturn,
            personCode: pCode,
            personName: pName,
            warehouseCode: wCode,
            warehouseName: wName,
            rowNo: toStrictNumber(r.RowNo) || idx + 1,
            itemCode,
            itemName,
            itemType: detectItemTypeLabel(itemCode, itemName, metaEntry?.group || ''),
            unitName: /^(01|02|04|05)/.test(itemCode) || noteMeta.netWeight > 0 ? 'کیلوگرم' : 'عدد / مقدار',
            quantity: qty,
            netWeight,
            grossWeight,
            cartons: noteMeta.cartons,
            bobbins: noteMeta.bobbins,
            grade: noteMeta.grade,
            unitPrice,
            grossAmount: baseLineAmt || finalAmount,
            discount,
            taxVat,
            finalAmount,
            itemNotes: rawItemNotes,
            headerNotes
          });
        });
      });

      setRawLines(parsed);
      setLastFetchedRange(`${dateFrom} تا ${dateTo}`);

      // Auto-expand first 3 invoices for immediate visual clarity
      const firstThreeKeys = Array.from(
        new Set(parsed.map(l => `${l.docId}_${l.opCode}_${l.archiveNo}`))
      ).slice(0, 3);
      setExpandedInvoiceKeys(new Set(firstThreeKeys));
    } catch (err: any) {
      const msg = err?.message || 'خطا در دریافت گزارش فاکتورهای فروش و خرید از سرور سایان';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSayanPersons();
  }, []);

  useEffect(() => {
    fetchInvoicesData();
  }, [dateFrom, dateTo, directionFilter, includeReturns, includeProforma, selectedPersonCode]);

  // Available OpCodes discovered in current dataset
  const availableOpCodes = useMemo(() => {
    const map = new Map<string, { opCode: string; title: string; count: number; direction: 'sales' | 'purchase'; isReturn: boolean }>();
    const seenDocs = new Set<string>();
    rawLines.forEach(l => {
      const dKey = `${l.docId}_${l.opCode}_${l.archiveNo}`;
      if (seenDocs.has(dKey)) return;
      seenDocs.add(dKey);
      const existing = map.get(l.opCode);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(l.opCode, {
          opCode: l.opCode,
          title: l.opTitle,
          count: 1,
          direction: l.direction,
          isReturn: l.isReturn
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [rawLines]);

  // Filtered lines (search + opcode chip)
  const filteredLines = useMemo(() => {
    const q = normalizeFa(searchQuery);
    return rawLines.filter(line => {
      if (selectedOpCodeFilter !== 'all' && line.opCode !== selectedOpCodeFilter) return false;
      if (!q) return true;
      return (
        normalizeFa(line.invoiceNum).includes(q) ||
        normalizeFa(line.archiveNo).includes(q) ||
        normalizeFa(line.personName).includes(q) ||
        normalizeFa(line.personCode).includes(q) ||
        normalizeFa(line.itemName).includes(q) ||
        normalizeFa(line.itemCode).includes(q) ||
        normalizeFa(line.itemType).includes(q) ||
        normalizeFa(line.dateJalali).includes(q) ||
        normalizeFa(line.itemNotes).includes(q) ||
        normalizeFa(line.headerNotes).includes(q)
      );
    });
  }, [rawLines, searchQuery, selectedOpCodeFilter]);

  // Grouped by Invoice
  const groupedInvoices = useMemo<GroupedInvoice[]>(() => {
    const map = new Map<string, GroupedInvoice>();
    filteredLines.forEach(line => {
      const docKey = `${line.docId}_${line.opCode}_${line.archiveNo}`;
      let inv = map.get(docKey);
      if (!inv) {
        inv = {
          docKey,
          docId: line.docId,
          archiveNo: line.archiveNo,
          invoiceNum: line.invoiceNum,
          subCode: line.subCode,
          dateIso: line.dateIso,
          dateJalali: line.dateJalali,
          opCode: line.opCode,
          opTitle: line.opTitle,
          direction: line.direction,
          isReturn: line.isReturn,
          personCode: line.personCode,
          personName: line.personName,
          warehouseCode: line.warehouseCode,
          warehouseName: line.warehouseName,
          headerNotes: line.headerNotes,
          headerPayable: 0,
          totalQuantity: 0,
          totalNetWeight: 0,
          totalGrossWeight: 0,
          totalCartons: 0,
          totalDiscount: 0,
          totalTaxVat: 0,
          totalAmount: 0,
          lines: []
        };
        map.set(docKey, inv);
      }
      inv.lines.push(line);
      inv.totalQuantity += line.quantity;
      inv.totalNetWeight += line.netWeight;
      inv.totalGrossWeight += line.grossWeight;
      inv.totalCartons += line.cartons;
      inv.totalDiscount += line.discount;
      inv.totalTaxVat += line.taxVat;
      inv.totalAmount += line.finalAmount;
    });
    return Array.from(map.values()).sort((a, b) => {
      const dCmp = String(b.dateIso || '').localeCompare(String(a.dateIso || ''));
      if (dCmp !== 0) return dCmp;
      return Number(b.invoiceNum || 0) - Number(a.invoiceNum || 0);
    });
  }, [filteredLines]);

  // Grouped by Item
  const groupedByItem = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        itemCode: string;
        itemName: string;
        itemType: string;
        direction: 'sales' | 'purchase';
        invoiceCount: Set<string>;
        lineCount: number;
        totalWeight: number;
        totalAmount: number;
        minPrice: number;
        maxPrice: number;
      }
    >();
    filteredLines.forEach(line => {
      const sign = line.isReturn ? -1 : 1;
      const key = `${line.direction}_${line.itemCode || line.itemName}`;
      let rec = map.get(key);
      if (!rec) {
        rec = {
          key,
          itemCode: line.itemCode,
          itemName: line.itemName,
          itemType: line.itemType,
          direction: line.direction,
          invoiceCount: new Set(),
          lineCount: 0,
          totalWeight: 0,
          totalAmount: 0,
          minPrice: line.unitPrice > 0 ? line.unitPrice : Infinity,
          maxPrice: line.unitPrice > 0 ? line.unitPrice : 0
        };
        map.set(key, rec);
      }
      rec.invoiceCount.add(`${line.docId}_${line.opCode}_${line.archiveNo}`);
      rec.lineCount += 1;
      rec.totalWeight += sign * line.netWeight;
      rec.totalAmount += sign * line.finalAmount;
      if (line.unitPrice > 0) {
        rec.minPrice = Math.min(rec.minPrice, line.unitPrice);
        rec.maxPrice = Math.max(rec.maxPrice, line.unitPrice);
      }
    });
    return Array.from(map.values())
      .map(r => ({
        ...r,
        invoicesCount: r.invoiceCount.size,
        avgPrice: r.totalWeight !== 0 ? Math.abs(r.totalAmount / r.totalWeight) : 0,
        minPrice: r.minPrice === Infinity ? 0 : r.minPrice
      }))
      .sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount));
  }, [filteredLines]);

  // Grouped by Party
  const groupedByParty = useMemo(() => {
    const map = new Map<
      string,
      {
        personCode: string;
        personName: string;
        salesDocs: Set<string>;
        purchaseDocs: Set<string>;
        salesAmount: number;
        salesWeight: number;
        purchaseAmount: number;
        purchaseWeight: number;
        totalLines: number;
      }
    >();
    filteredLines.forEach(line => {
      const sign = line.isReturn ? -1 : 1;
      const key = line.personCode || line.personName;
      let rec = map.get(key);
      if (!rec) {
        rec = {
          personCode: line.personCode,
          personName: line.personName,
          salesDocs: new Set(),
          purchaseDocs: new Set(),
          salesAmount: 0,
          salesWeight: 0,
          purchaseAmount: 0,
          purchaseWeight: 0,
          totalLines: 0
        };
        map.set(key, rec);
      }
      const docKey = `${line.docId}_${line.opCode}_${line.archiveNo}`;
      if (line.direction === 'sales') {
        rec.salesDocs.add(docKey);
        rec.salesAmount += sign * line.finalAmount;
        rec.salesWeight += sign * line.netWeight;
      } else {
        rec.purchaseDocs.add(docKey);
        rec.purchaseAmount += sign * line.finalAmount;
        rec.purchaseWeight += sign * line.netWeight;
      }
      rec.totalLines += 1;
    });
    return Array.from(map.values())
      .map(r => ({
        ...r,
        salesCount: r.salesDocs.size,
        purchaseCount: r.purchaseDocs.size,
        totalTurnover: Math.abs(r.salesAmount) + Math.abs(r.purchaseAmount)
      }))
      .sort((a, b) => b.totalTurnover - a.totalTurnover);
  }, [filteredLines]);

  // KPI Summaries
  const kpi = useMemo(() => {
    let salesCount = 0;
    let purchaseCount = 0;
    let salesAmount = 0;
    let purchaseAmount = 0;
    let salesWeight = 0;
    let purchaseWeight = 0;

    groupedInvoices.forEach(inv => {
      const sign = inv.isReturn ? -1 : 1;
      if (inv.direction === 'sales') {
        salesCount += 1;
        salesAmount += sign * inv.totalAmount;
        salesWeight += sign * inv.totalNetWeight;
      } else {
        purchaseCount += 1;
        purchaseAmount += sign * inv.totalAmount;
        purchaseWeight += sign * inv.totalNetWeight;
      }
    });

    return {
      totalInvoices: groupedInvoices.length,
      totalLines: filteredLines.length,
      salesCount,
      purchaseCount,
      salesAmount,
      purchaseAmount,
      salesWeight,
      purchaseWeight
    };
  }, [groupedInvoices, filteredLines]);

  // Filtered person options for searchable dropdown
  const filteredPersonOptions = useMemo(() => {
    const q = normalizeFa(personSearchText);
    if (!q) return persons.slice(0, 120);
    return persons
      .filter(
        p =>
          normalizeFa(p.name).includes(q) ||
          normalizeFa(p.personCode).includes(q) ||
          normalizeFa(p.tafsiliCode).includes(q)
      )
      .slice(0, 120);
  }, [persons, personSearchText]);

  const selectedPersonObj = useMemo(
    () => persons.find(p => p.personCode === selectedPersonCode) || null,
    [persons, selectedPersonCode]
  );

  const toggleInvoiceExpand = (docKey: string) => {
    setExpandedInvoiceKeys(prev => {
      const next = new Set(prev);
      if (next.has(docKey)) next.delete(docKey);
      else next.add(docKey);
      return next;
    });
  };

  const expandAllInvoices = () => {
    setExpandedInvoiceKeys(new Set(groupedInvoices.map(i => i.docKey)));
  };

  const collapseAllInvoices = () => {
    setExpandedInvoiceKeys(new Set());
  };

  // Export Excel (2 sheets: Invoice Headers + Detailed Line Items)
  const handleExportExcel = async () => {
    if (groupedInvoices.length === 0) {
      toast.error('داده‌ای برای خروجی اکسل وجود ندارد.');
      return;
    }
    try {
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };

      const headerRows = groupedInvoices.map((inv, idx) => ({
        'ردیف': idx + 1,
        'نوع سند': inv.opTitle,
        'دسته': inv.direction === 'sales' ? 'فروش' : 'خرید',
        'کد عملیات': inv.opCode,
        'شماره فاکتور': inv.invoiceNum,
        'کد بایگانی': inv.archiveNo,
        'تاریخ': inv.dateJalali,
        'کد شخص': inv.personCode,
        'نام طرف حساب': inv.personName,
        'انبار': inv.warehouseName,
        'تعداد اقلام': inv.lines.length,
        'جمع وزن / مقدار': Number(inv.totalNetWeight.toFixed(2)),
        'جمع تخفیف (ریال)': Math.round(inv.totalDiscount),
        'مالیات و عوارض (ریال)': Math.round(inv.totalTaxVat),
        'مبلغ نهایی فاکتور (ریال)': Math.round(inv.totalAmount),
        'توضیحات': inv.headerNotes
      }));

      const detailRows = filteredLines.map((line, idx) => ({
        'ردیف': idx + 1,
        'نوع سند': line.opTitle,
        'دسته': line.direction === 'sales' ? 'فروش' : 'خرید',
        'شماره فاکتور': line.invoiceNum,
        'تاریخ': line.dateJalali,
        'نام طرف حساب': line.personName,
        'کد شخص': line.personCode,
        'کد کالا': line.itemCode,
        'نام کالا': line.itemName,
        'نوع / گروه کالا': line.itemType,
        'وزن خالص / مقدار': Number(line.netWeight.toFixed(2)),
        'وزن ناخالص': line.grossWeight ? Number(line.grossWeight.toFixed(2)) : '',
        'تعداد کارتن': line.cartons || '',
        'تعداد بوبین': line.bobbins || '',
        'گرید': line.grade || '',
        'فی واحد (ریال)': Math.round(line.unitPrice),
        'تخفیف (ریال)': Math.round(line.discount),
        'مبلغ کل خط (ریال)': Math.round(line.finalAmount),
        'انبار': line.warehouseName,
        'شرح خط': line.itemNotes
      }));

      const wsHeaders = XLSX.utils.json_to_sheet(headerRows);
      const wsDetails = XLSX.utils.json_to_sheet(detailRows);
      XLSX.utils.book_append_sheet(wb, wsHeaders, 'خلاصه فاکتورها');
      XLSX.utils.book_append_sheet(wb, wsDetails, 'جزئیات خط به خط اقلام');

      const personSuffix = selectedPersonObj ? `_${selectedPersonObj.name.slice(0, 20)}` : '';
      const dirSuffix =
        directionFilter === 'sales' ? '_فروش' : directionFilter === 'purchase' ? '_خرید' : '_فروش_و_خرید';
      const fileName = `گزارش_فاکتورها${dirSuffix}${personSuffix}_${dateFrom.replace(/\//g, '-')}_تا_${dateTo.replace(/\//g, '-')}.xlsx`;

      await saveWorkbookAndOpen(XLSX, wb, fileName);
      toast.success('فایل اکسل گزارش فاکتورها با ۲ شیت (خلاصه و جزئیات خط به خط) آماده شد.');
    } catch (err: any) {
      toast.error(err?.message || 'خطا در تهیه خروجی اکسل');
    }
  };

  // Smart Print / PDF (works on Desktop Web, Mobile Web & Android)
  const handlePrintReport = async () => {
    if (groupedInvoices.length === 0) {
      toast.error('داده‌ای برای چاپ وجود ندارد.');
      return;
    }
    const companyName = settings?.appName || 'گزارش فاکتورهای فروش و خرید سایان';
    const dirLabel =
      directionFilter === 'sales'
        ? 'فاکتورهای فروش'
        : directionFilter === 'purchase'
        ? 'فاکتورهای خرید'
        : 'فاکتورهای فروش و خرید';
    const partyTitle = selectedPersonObj
      ? `${selectedPersonObj.name} (کد ${selectedPersonObj.personCode})`
      : 'همه اشخاص';

    const invoicesHtml = groupedInvoices
      .map(
        (inv, idx) => `
      <div style="border:1px solid #cbd5e1;border-radius:8px;margin-bottom:12px;page-break-inside:avoid;overflow:hidden;">
        <div style="background:${inv.direction === 'sales' ? '#eff6ff' : '#ecfdf5'};padding:8px 12px;border-bottom:1px solid #cbd5e1;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:11px;">
          <div><strong>${idx + 1}. ${escapeHtml(inv.opTitle)} #${escapeHtml(inv.invoiceNum)}</strong> | تاریخ: <strong>${escapeHtml(inv.dateJalali)}</strong> | طرف حساب: <strong>${escapeHtml(inv.personName)}</strong> (${escapeHtml(inv.personCode)})</div>
          <div>جمع وزن/مقدار: <strong>${formatNum(inv.totalNetWeight, 2)}</strong> | مبلغ کل: <strong>${formatNum(inv.totalAmount)} ریال</strong></div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
          <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
              <th style="padding:5px;border-left:1px solid #e2e8f0;">ردیف</th>
              <th style="padding:5px;border-left:1px solid #e2e8f0;">کد کالا</th>
              <th style="padding:5px;border-left:1px solid #e2e8f0;text-align:right;">نام کالا</th>
              <th style="padding:5px;border-left:1px solid #e2e8f0;">نوع کالا</th>
              <th style="padding:5px;border-left:1px solid #e2e8f0;">وزن/مقدار</th>
              <th style="padding:5px;border-left:1px solid #e2e8f0;">فی واحد (ریال)</th>
              <th style="padding:5px;">مبلغ کل خط (ریال)</th>
            </tr>
          </thead>
          <tbody>
            ${inv.lines
              .map(
                (l, lIdx) => `
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:4px;text-align:center;border-left:1px solid #e2e8f0;">${lIdx + 1}</td>
                <td style="padding:4px;text-align:center;font-family:monospace;border-left:1px solid #e2e8f0;">${escapeHtml(l.itemCode)}</td>
                <td style="padding:4px;text-align:right;font-weight:700;border-left:1px solid #e2e8f0;">${escapeHtml(l.itemName)}${l.itemNotes ? `<div style="font-size:9px;color:#64748b;font-weight:400;">${escapeHtml(l.itemNotes)}</div>` : ''}</td>
                <td style="padding:4px;text-align:center;border-left:1px solid #e2e8f0;">${escapeHtml(l.itemType)}</td>
                <td style="padding:4px;text-align:center;font-weight:700;border-left:1px solid #e2e8f0;">${formatNum(l.netWeight, 2)}</td>
                <td style="padding:4px;text-align:center;border-left:1px solid #e2e8f0;">${l.unitPrice > 0 ? formatNum(l.unitPrice) : '-'}</td>
                <td style="padding:4px;text-align:center;font-weight:700;">${formatNum(l.finalAmount)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
      )
      .join('');

    const fullHtml = `
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>گزارش ${escapeHtml(dirLabel)}</title>
        <style>
          body { font-family: 'Vazirmatn', Tahoma, Arial, sans-serif; color: #0f172a; margin: 14px; direction: rtl; }
          .hdr { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
          .kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
          .kpi-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; text-align: center; background: #f8fafc; }
          .kpi-title { font-size: 10px; color: #475569; }
          .kpi-val { font-size: 13px; font-weight: 900; margin-top: 4px; }
        </style>
      </head>
      <body>
        <div class="hdr">
          <div>
            <div style="font-size:15px;font-weight:900;">${escapeHtml(companyName)} — گزارش ${escapeHtml(dirLabel)}</div>
            <div style="font-size:11px;color:#475569;margin-top:4px;">شخص انتخاب‌شده: <strong>${escapeHtml(partyTitle)}</strong> | بازه زمانی: <strong>${escapeHtml(dateFrom)}</strong> تا <strong>${escapeHtml(dateTo)}</strong></div>
          </div>
          <div style="font-size:11px;color:#475569;">تعداد فاکتور: <strong>${formatNum(kpi.totalInvoices)}</strong> | تعداد اقلام: <strong>${formatNum(kpi.totalLines)}</strong></div>
        </div>
        <div class="kpi">
          <div class="kpi-box"><div class="kpi-title">جمع خالص فروش</div><div class="kpi-val">${formatNum(kpi.salesAmount)} ریال</div></div>
          <div class="kpi-box"><div class="kpi-title">وزن/مقدار فروش</div><div class="kpi-val">${formatNum(kpi.salesWeight, 2)}</div></div>
          <div class="kpi-box"><div class="kpi-title">جمع خالص خرید</div><div class="kpi-val">${formatNum(kpi.purchaseAmount)} ریال</div></div>
          <div class="kpi-box"><div class="kpi-title">وزن/مقدار خرید</div><div class="kpi-val">${formatNum(kpi.purchaseWeight, 2)}</div></div>
        </div>
        ${invoicesHtml}
      </body>
      </html>
    `;

    try {
      await exportReportHtmlSmart(fullHtml, `Sayan_Invoices_${dateFrom.replace(/\//g, '-')}.pdf`);
    } catch {
      toast.error('خطا در آماده‌سازی چاپ گزارش');
    }
  };

  return (
    <div className="w-full p-2.5 sm:p-5 space-y-4 select-text" dir="rtl">
      {/* Header & Controls Card */}
      <div className="bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 dark:from-zinc-900 dark:via-zinc-900 dark:to-indigo-950/20 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 space-y-3.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                گزارش جامع فاکتورهای فروش و خرید سایان
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                انتخاب هر شخص در سایان و مشاهده فاکتورهای فروش یا خرید با تاریخ، شماره فاکتور و جزئیات خط‌به‌خط کالا (نوع کالا، وزن، فی و مبلغ)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => fetchInvoicesData()}
              disabled={isLoading}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>بروزرسانی</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={groupedInvoices.length === 0}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>اکسل (۲ شیت)</span>
            </button>
            <button
              type="button"
              onClick={handlePrintReport}
              disabled={groupedInvoices.length === 0}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>چاپ / PDF</span>
            </button>
          </div>
        </div>

        {/* Row 1: Direction Switch + Person Selector + Quick Search */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          {/* Direction Filter: All / Sales / Purchase */}
          <div className="md:col-span-4 flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
              نوع گزارش فاکتور
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => {
                  setDirectionFilter('all');
                  setSelectedOpCodeFilter('all');
                }}
                className={`min-h-[36px] rounded-lg text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  directionFilter === 'all'
                    ? 'bg-white dark:bg-zinc-900 text-indigo-700 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                <span>همه</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirectionFilter('sales');
                  setSelectedOpCodeFilter('all');
                }}
                className={`min-h-[36px] rounded-lg text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  directionFilter === 'sales'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-blue-700'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                <span>فروش</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirectionFilter('purchase');
                  setSelectedOpCodeFilter('all');
                }}
                className={`min-h-[36px] rounded-lg text-xs font-black flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  directionFilter === 'purchase'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-emerald-700'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                <span>خرید</span>
              </button>
            </div>
          </div>

          {/* Searchable Sayan Person Selector */}
          <div className="md:col-span-4 flex flex-col gap-1 relative" ref={personDropdownRef}>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center justify-between">
              <span>انتخاب شخص در سایان (مشتری / تامین‌کننده)</span>
              {selectedPersonCode && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPersonCode('');
                    setPersonSearchText('');
                  }}
                  className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                >
                  حذف فیلتر شخص
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={() => setPersonDropdownOpen(v => !v)}
              className="min-h-[44px] w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-right text-xs font-bold text-slate-800 dark:text-white flex items-center justify-between gap-2 hover:border-blue-400 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 truncate">
                <User className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">
                  {selectedPersonObj
                    ? `${selectedPersonObj.name} (${selectedPersonObj.personCode})`
                    : loadingPersons
                    ? 'در حال بارگذاری اشخاص سایان...'
                    : 'همه اشخاص سایان (کل فاکتورها)'}
                </span>
              </span>
              <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {personDropdownOpen && (
              <div className="absolute top-full right-0 left-0 mt-1.5 z-40 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-2 border-b border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={personSearchText}
                      onChange={e => setPersonSearchText(e.target.value)}
                      placeholder="جستجوی نام یا کد شخص در سایان..."
                      autoFocus
                      className="w-full pr-8 pl-2.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800 custom-scrollbar">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPersonCode('');
                      setPersonDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 text-right text-xs font-black flex items-center justify-between hover:bg-blue-50 dark:hover:bg-zinc-800 cursor-pointer ${
                      !selectedPersonCode ? 'bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span>همه اشخاص سایان (نمایش کل فاکتورها)</span>
                    {!selectedPersonCode && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                  {filteredPersonOptions.map(p => {
                    const active = selectedPersonCode === p.personCode;
                    return (
                      <button
                        key={`${p.personCode}_${p.tafsiliCode}`}
                        type="button"
                        onClick={() => {
                          setSelectedPersonCode(p.personCode);
                          setPersonDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-right text-xs flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer ${
                          active ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-black' : 'text-slate-700 dark:text-slate-200 font-bold'
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 shrink-0">
                          {p.personCode}
                        </span>
                      </button>
                    );
                  })}
                  {filteredPersonOptions.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-400">شخصی با این مشخصات یافت نشد.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Instant Filter Search */}
          <div className="md:col-span-4 flex flex-col gap-1">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
              جستجو در شماره فاکتور، نام/کد کالا، نوع کالا یا شرح
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="مثلاً شماره فاکتور، پلی‌استر، اسپاندکس، چیپس..."
                className="min-h-[44px] w-full pr-9 pl-8 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: View Modes + Checkboxes + Date info */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-2 border-t border-slate-200/80 dark:border-zinc-800">
          {/* 4 Report View Modes */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => setViewMode('by_invoice')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer border ${
                viewMode === 'by_invoice'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-500'
                  : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:border-indigo-300'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>فاکتور به فاکتور (خط به خط)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flat_lines')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer border ${
                viewMode === 'flat_lines'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-500'
                  : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:border-indigo-300'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>جدول یکپارچه اقلام</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('by_item')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer border ${
                viewMode === 'by_item'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-500'
                  : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:border-indigo-300'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>تجمیعی تفکیک کالا</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('by_party')}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer border ${
                viewMode === 'by_party'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-500'
                  : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:border-indigo-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>تجمیعی تفکیک اشخاص</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeReturns}
                onChange={e => setIncludeReturns(e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600"
              />
              <span>شامل برگشت از فروش / خرید</span>
            </label>
            {(directionFilter === 'all' || directionFilter === 'purchase') && (
              <label className="inline-flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeProforma}
                  onChange={e => setIncludeProforma(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-600"
                />
                <span>شامل پیش‌فاکتور خرید (۵۷)</span>
              </label>
            )}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 font-mono text-[11px] font-bold">
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              <span>{lastFetchedRange || `${dateFrom} تا ${dateTo}`}</span>
            </span>
          </div>
        </div>

        {/* Dynamic Sayan OpCode Filter Strip */}
        {availableOpCodes.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              کد عملیات سایان:
            </span>
            <button
              type="button"
              onClick={() => setSelectedOpCodeFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border transition-colors ${
                selectedOpCodeFilter === 'all'
                  ? 'bg-slate-800 text-white border-slate-800 dark:bg-indigo-600'
                  : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700'
              }`}
            >
              همه ({formatNum(kpi.totalInvoices)})
            </button>
            {availableOpCodes.map(op => (
              <button
                key={op.opCode}
                type="button"
                onClick={() => setSelectedOpCodeFilter(op.opCode)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border transition-colors ${
                  selectedOpCodeFilter === op.opCode
                    ? op.direction === 'sales'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-700 hover:border-blue-300'
                }`}
              >
                کد {op.opCode}: {op.title} ({formatNum(op.count)})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-blue-700 dark:text-blue-300">
            <span>فاکتورهای فروش</span>
            <span className="font-mono">{formatNum(kpi.salesCount)} سند</span>
          </div>
          <div className="text-sm sm:text-base font-black text-blue-900 dark:text-blue-100 font-mono mt-1 truncate" dir="ltr">
            {formatNum(kpi.salesAmount)} <span className="text-[10px] font-sans font-bold">ریال</span>
          </div>
          <div className="text-[11px] text-blue-700/80 dark:text-blue-300/80 mt-0.5 font-bold">
            وزن / مقدار: {formatNum(kpi.salesWeight, 2)}
          </div>
        </div>

        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            <span>فاکتورهای خرید</span>
            <span className="font-mono">{formatNum(kpi.purchaseCount)} سند</span>
          </div>
          <div className="text-sm sm:text-base font-black text-emerald-900 dark:text-emerald-100 font-mono mt-1 truncate" dir="ltr">
            {formatNum(kpi.purchaseAmount)} <span className="text-[10px] font-sans font-bold">ریال</span>
          </div>
          <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5 font-bold">
            وزن / مقدار: {formatNum(kpi.purchaseWeight, 2)}
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300">
            <span>تعداد کل فاکتورها</span>
            <FileText className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono mt-1">
            {formatNum(kpi.totalInvoices)} <span className="text-[11px] font-sans font-bold">فاکتور</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-bold">
            مجموع {formatNum(kpi.totalLines)} ردیف کالا
          </div>
        </div>

        <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
            <span>محدوده شخص</span>
            <User className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xs sm:text-sm font-black text-indigo-950 dark:text-indigo-100 mt-1 truncate">
            {selectedPersonObj ? selectedPersonObj.name : 'همه اشخاص سایان'}
          </div>
          <div className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 mt-0.5 font-mono">
            {selectedPersonObj ? `کد شخص: ${selectedPersonObj.personCode}` : `${formatNum(groupedByParty.length)} طرف حساب فعال`}
          </div>
        </div>
      </div>

      {/* Error State */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchInvoicesData()}
            className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-black text-xs cursor-pointer shrink-0"
          >
            تلاش مجدد
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="text-xs font-black">در حال واکشی فاکتورها و جزئیات خط‌به‌خط اقلام از دیتابیس سایان...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !errorMsg && groupedInvoices.length === 0 && (
        <div className="py-14 px-4 text-center rounded-2xl border border-dashed border-slate-300 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-900/50 space-y-2">
          <FileText className="w-10 h-10 text-slate-300 dark:text-zinc-600 mx-auto" />
          <div className="text-sm font-black text-slate-700 dark:text-slate-200">
            هیچ فاکتوری در این بازه زمانی و فیلتر یافت نشد
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            بازه تاریخ بالای صفحه را بررسی کنید یا فیلتر شخص / نوع فاکتور (فروش یا خرید) را تغییر دهید.
          </p>
        </div>
      )}

      {/* VIEW 1: INVOICE-BY-INVOICE EXPANDABLE (LINE-BY-LINE DETAILS) */}
      {!isLoading && groupedInvoices.length > 0 && viewMode === 'by_invoice' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-600 dark:text-slate-400">
              نمایش {formatNum(groupedInvoices.length)} فاکتور ({formatNum(filteredLines.length)} ردیف کالا)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={expandAllInvoices}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-200 font-bold text-[11px] cursor-pointer"
              >
                باز کردن همه اقلام
              </button>
              <button
                type="button"
                onClick={collapseAllInvoices}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-200 font-bold text-[11px] cursor-pointer"
              >
                بستن همه
              </button>
            </div>
          </div>

          {groupedInvoices.map(inv => {
            const isOpen = expandedInvoiceKeys.has(inv.docKey);
            const isSales = inv.direction === 'sales';
            return (
              <div
                key={inv.docKey}
                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs"
              >
                {/* Invoice Header Button */}
                <button
                  type="button"
                  onClick={() => toggleInvoiceExpand(inv.docKey)}
                  className="w-full p-3 sm:p-4 text-right hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                    <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                      <span
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-black shrink-0 border ${
                          inv.isReturn
                            ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            : isSales
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        }`}
                      >
                        {inv.opTitle} ({inv.opCode})
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white font-mono">
                            فاکتور #{inv.invoiceNum}
                          </span>
                          {inv.archiveNo && inv.archiveNo !== inv.invoiceNum && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500">
                              بایگانی {inv.archiveNo}
                            </span>
                          )}
                          <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {inv.dateJalali}
                          </span>
                          <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                            {inv.personName}
                          </span>
                          {inv.personCode && (
                            <span className="text-[10px] font-mono text-slate-400">({inv.personCode})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <span>انبار: {inv.warehouseName}</span>
                          <span>•</span>
                          <span>{formatNum(inv.lines.length)} ردیف کالا</span>
                          {inv.headerNotes && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-md">{inv.headerNotes}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-zinc-800">
                      <div className="text-right md:text-left">
                        <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1 justify-end">
                          <Scale className="w-3 h-3 text-indigo-500" />
                          <span>وزن / مقدار: {formatNum(inv.totalNetWeight, 2)}</span>
                        </div>
                        <div
                          className={`text-xs sm:text-sm font-black font-mono ${
                            inv.isReturn
                              ? 'text-rose-600 dark:text-rose-400'
                              : isSales
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-emerald-700 dark:text-emerald-300'
                          }`}
                          dir="ltr"
                        >
                          {formatNum(inv.totalAmount)} <span className="text-[10px] font-sans">ریال</span>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Line-by-Line Items Details */}
                {isOpen && (
                  <div className="border-t border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/40">
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="bg-slate-100/90 dark:bg-zinc-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-zinc-700">
                            <th className="py-2.5 px-3 font-black w-12 text-center">ردیف</th>
                            <th className="py-2.5 px-3 font-black">کد کالا</th>
                            <th className="py-2.5 px-3 font-black">نام کالا و شرح خط</th>
                            <th className="py-2.5 px-3 font-black">نوع / گروه کالا</th>
                            <th className="py-2.5 px-3 font-black text-center">وزن / مقدار</th>
                            <th className="py-2.5 px-3 font-black text-center">بسته‌بندی / گرید</th>
                            <th className="py-2.5 px-3 font-black text-center">فی واحد (ریال)</th>
                            <th className="py-2.5 px-3 font-black text-center">تخفیف</th>
                            <th className="py-2.5 px-3 font-black text-center">مبلغ کل خط (ریال)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70 dark:divide-zinc-800">
                          {inv.lines.map((line, lIdx) => (
                            <tr
                              key={line.lineKey}
                              className="hover:bg-white dark:hover:bg-zinc-900/70 transition-colors"
                            >
                              <td className="py-2.5 px-3 text-center font-mono text-slate-500">{lIdx + 1}</td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                                {line.itemCode || '-'}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-black text-slate-900 dark:text-white">{line.itemName}</div>
                                {line.itemNotes && (
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                                    {line.itemNotes}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                                  {line.itemType}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900 dark:text-white">
                                {formatNum(line.netWeight, 2)}
                                {line.grossWeight > 0 && (
                                  <div className="text-[10px] font-normal text-slate-400">
                                    ناخالص: {formatNum(line.grossWeight, 2)}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center text-[11px] text-slate-600 dark:text-slate-300">
                                {line.cartons > 0 || line.bobbins > 0 || line.grade ? (
                                  <div className="flex items-center justify-center gap-1 flex-wrap">
                                    {line.cartons > 0 && <span>{formatNum(line.cartons)} کارتن</span>}
                                    {line.bobbins > 0 && <span>{formatNum(line.bobbins)} بوبین</span>}
                                    {line.grade && (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-mono text-[10px] font-bold">
                                        {line.grade}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-700 dark:text-indigo-300" dir="ltr">
                                {line.unitPrice > 0 ? formatNum(line.unitPrice) : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono text-rose-600 dark:text-rose-400" dir="ltr">
                                {line.discount > 0 ? formatNum(line.discount) : '-'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900 dark:text-white" dir="ltr">
                                {formatNum(line.finalAmount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 dark:bg-zinc-800/90 font-black border-t border-slate-300 dark:border-zinc-700">
                            <td colSpan={4} className="py-2.5 px-3 text-slate-700 dark:text-slate-200">
                              جمع کل فاکتور #{inv.invoiceNum} ({formatNum(inv.lines.length)} قلم)
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-900 dark:text-white">
                              {formatNum(inv.totalNetWeight, 2)}
                            </td>
                            <td className="py-2.5 px-3 text-center text-[11px]">
                              {inv.totalCartons > 0 ? `${formatNum(inv.totalCartons)} کارتن` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-indigo-700 dark:text-indigo-300" dir="ltr">
                              {inv.totalNetWeight > 0 ? formatNum(inv.totalAmount / inv.totalNetWeight) : '-'}
                              <div className="text-[9px] font-sans font-normal text-slate-500">میانگین فی</div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-rose-600" dir="ltr">
                              {inv.totalDiscount > 0 ? formatNum(inv.totalDiscount) : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-emerald-700 dark:text-emerald-300" dir="ltr">
                              {formatNum(inv.totalAmount)} ریال
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Mobile / Android Stacked Cards */}
                    <div className="md:hidden divide-y divide-slate-200 dark:divide-zinc-800">
                      {inv.lines.map((line, lIdx) => (
                        <div key={line.lineKey} className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="w-5 h-5 rounded-md bg-slate-200 dark:bg-zinc-800 text-[10px] font-black flex items-center justify-center shrink-0">
                                  {lIdx + 1}
                                </span>
                                <span className="text-xs font-black text-slate-900 dark:text-white">
                                  {line.itemName}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[10px]">
                                <span className="font-mono text-slate-500">کد: {line.itemCode || '-'}</span>
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold">
                                  {line.itemType}
                                </span>
                                {line.grade && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-mono font-bold">
                                    گرید {line.grade}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-left shrink-0 font-mono font-black text-xs text-slate-900 dark:text-white" dir="ltr">
                              {formatNum(line.finalAmount)} <span className="text-[9px] font-sans">ریال</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 bg-white dark:bg-zinc-900 rounded-xl p-2 border border-slate-200/80 dark:border-zinc-800 text-center">
                            <div>
                              <div className="text-[9px] text-slate-400">وزن / مقدار</div>
                              <div className="text-[11px] font-mono font-black text-slate-800 dark:text-white">
                                {formatNum(line.netWeight, 2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-slate-400">فی واحد (ریال)</div>
                              <div className="text-[11px] font-mono font-black text-indigo-700 dark:text-indigo-300" dir="ltr">
                                {line.unitPrice > 0 ? formatNum(line.unitPrice) : '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] text-slate-400">بسته‌بندی</div>
                              <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                {line.cartons > 0 ? `${formatNum(line.cartons)} کارتن` : line.bobbins > 0 ? `${formatNum(line.bobbins)} بوبین` : '-'}
                              </div>
                            </div>
                          </div>

                          {line.itemNotes && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                              {line.itemNotes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 2: UNIFIED FLAT LINE-BY-LINE TABLE */}
      {!isLoading && filteredLines.length > 0 && viewMode === 'flat_lines' && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-zinc-700">
                  <th className="py-2.5 px-3 font-black">#</th>
                  <th className="py-2.5 px-3 font-black">نوع</th>
                  <th className="py-2.5 px-3 font-black">تاریخ</th>
                  <th className="py-2.5 px-3 font-black">شماره فاکتور</th>
                  <th className="py-2.5 px-3 font-black">شخص (طرف حساب)</th>
                  <th className="py-2.5 px-3 font-black">کالا و نوع کالا</th>
                  <th className="py-2.5 px-3 font-black text-center">وزن / مقدار</th>
                  <th className="py-2.5 px-3 font-black text-center">فی واحد (ریال)</th>
                  <th className="py-2.5 px-3 font-black text-center">مبلغ کل خط (ریال)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredLines.slice(0, 600).map((line, idx) => (
                  <tr key={line.lineKey} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                    <td className="py-2 px-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                          line.isReturn
                            ? 'bg-rose-100 text-rose-700'
                            : line.direction === 'sales'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {line.opTitle}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono whitespace-nowrap">{line.dateJalali}</td>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                      #{line.invoiceNum}
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-100 max-w-[180px] truncate">
                      {line.personName}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-black text-slate-900 dark:text-white">{line.itemName}</div>
                      <div className="text-[10px] text-slate-500">
                        {line.itemType} {line.itemCode ? `• کد ${line.itemCode}` : ''}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-bold">{formatNum(line.netWeight, 2)}</td>
                    <td className="py-2 px-3 text-center font-mono font-bold text-indigo-700 dark:text-indigo-300" dir="ltr">
                      {line.unitPrice > 0 ? formatNum(line.unitPrice) : '-'}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-black text-slate-900 dark:text-white" dir="ltr">
                      {formatNum(line.finalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredLines.length > 600 && (
            <div className="p-2.5 text-center text-[11px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 border-t border-amber-200 dark:border-amber-800">
              نمایش ۶۰۰ ردیف اول از {formatNum(filteredLines.length)} ردیف. برای مشاهده تمام ردیف‌ها از «خروجی اکسل» یا فیلتر جستجو استفاده کنید.
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: GROUPED BY ITEM */}
      {!isLoading && groupedByItem.length > 0 && viewMode === 'by_item' && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-zinc-700">
                  <th className="py-2.5 px-3 font-black">#</th>
                  <th className="py-2.5 px-3 font-black">دسته</th>
                  <th className="py-2.5 px-3 font-black">کد و نام کالا</th>
                  <th className="py-2.5 px-3 font-black">نوع / گروه کالا</th>
                  <th className="py-2.5 px-3 font-black text-center">تعداد فاکتور</th>
                  <th className="py-2.5 px-3 font-black text-center">جمع خالص وزن/مقدار</th>
                  <th className="py-2.5 px-3 font-black text-center">کمترین / بیشترین فی</th>
                  <th className="py-2.5 px-3 font-black text-center">میانگین فی (ریال)</th>
                  <th className="py-2.5 px-3 font-black text-center">جمع کل مبلغ (ریال)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {groupedByItem.map((row, idx) => (
                  <tr key={row.key} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                    <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                          row.direction === 'sales' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {row.direction === 'sales' ? 'فروش' : 'خرید'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-black text-slate-900 dark:text-white">{row.itemName}</div>
                      <div className="text-[10px] font-mono text-slate-400">{row.itemCode}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                        {row.itemType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold">{formatNum(row.invoicesCount)}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-black text-slate-900 dark:text-white">
                      {formatNum(row.totalWeight, 2)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-500" dir="ltr">
                      {row.minPrice > 0 ? `${formatNum(row.minPrice)} ~ ${formatNum(row.maxPrice)}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-indigo-700 dark:text-indigo-300" dir="ltr">
                      {row.avgPrice > 0 ? formatNum(row.avgPrice) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-black text-emerald-700 dark:text-emerald-300" dir="ltr">
                      {formatNum(row.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 4: GROUPED BY PARTY */}
      {!isLoading && groupedByParty.length > 0 && viewMode === 'by_party' && (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-zinc-700">
                  <th className="py-2.5 px-3 font-black">#</th>
                  <th className="py-2.5 px-3 font-black">شخص (مشتری / تامین‌کننده)</th>
                  <th className="py-2.5 px-3 font-black text-center">تعداد فاکتور فروش</th>
                  <th className="py-2.5 px-3 font-black text-center">مبلغ کل فروش (ریال)</th>
                  <th className="py-2.5 px-3 font-black text-center">تعداد فاکتور خرید</th>
                  <th className="py-2.5 px-3 font-black text-center">مبلغ کل خرید (ریال)</th>
                  <th className="py-2.5 px-3 font-black text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {groupedByParty.map((p, idx) => (
                  <tr key={`${p.personCode}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                    <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-black text-slate-900 dark:text-white">{p.personName}</div>
                      <div className="text-[10px] font-mono text-slate-400">کد: {p.personCode || '-'}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-blue-700 dark:text-blue-300">
                      {formatNum(p.salesCount)}
                      {p.salesWeight > 0 && (
                        <div className="text-[10px] text-slate-400 font-normal">وزن: {formatNum(p.salesWeight, 2)}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-black text-blue-700 dark:text-blue-300" dir="ltr">
                      {p.salesAmount !== 0 ? formatNum(p.salesAmount) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700 dark:text-emerald-300">
                      {formatNum(p.purchaseCount)}
                      {p.purchaseWeight > 0 && (
                        <div className="text-[10px] text-slate-400 font-normal">وزن: {formatNum(p.purchaseWeight, 2)}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-black text-emerald-700 dark:text-emerald-300" dir="ltr">
                      {p.purchaseAmount !== 0 ? formatNum(p.purchaseAmount) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {p.personCode && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPersonCode(p.personCode);
                            setViewMode('by_invoice');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-black text-[11px] cursor-pointer"
                        >
                          ریز فاکتورها
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SayanInvoicesReportTab;
