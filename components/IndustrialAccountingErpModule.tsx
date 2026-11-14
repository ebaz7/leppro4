import React, { useState, useEffect } from 'react';
import {
  Scale,
  Factory,
  Boxes,
  ShoppingCart,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Truck,
  Package,
  ArrowLeftRight,
  Landmark,
  CreditCard,
  ClipboardList,
  Cpu,
  Building2,
  ChevronDown,
  ChevronLeft,
  FolderKanban,
  Maximize2,
  Minimize2,
  LogOut,
  X,
  Unlock,
  Layers,
  Download,
  Bot,
  Trash2,
  Archive,
  Upload,
  RotateCcw,
  FileArchive,
  History,
  ShieldCheck,
  Server,
  FileSpreadsheet
} from 'lucide-react';
import { apiCall, getEffectiveApiUrl, getAuthToken, getServerHost } from '../services/apiService';
import { saveBlobAndOpenFile } from '../services/fileService';
import { getSettings } from '../services/storageService';
import { User, UserRole } from '../types';
import {
  ErpCompanySummary,
  ErpMainCategoryId,
  ErpSubViewId,
  IndustrialErpState,
  ErpCutoverConfig,
  ERP_SIDEBAR_TREE,
  SUBVIEW_TITLES,
  getTodayJalali
} from './industrial-erp/types';
import { WarehouseModuleView } from './industrial-erp/WarehouseModuleView';
import { CommercialTradeModuleView } from './industrial-erp/CommercialTradeModuleView';
import { ProductionBomModuleView } from './industrial-erp/ProductionBomModuleView';
import { TreasuryBankingModuleView } from './industrial-erp/TreasuryBankingModuleView';
import { FinancialAccountingModuleView } from './industrial-erp/FinancialAccountingModuleView';
import { PayrollAssetsMasterModuleView } from './industrial-erp/PayrollAssetsMasterModuleView';
import { createDefaultIndustrialErpState } from './industrial-erp/defaultState';

// Re-export types so any external imports remain 100% backward-compatible
export * from './industrial-erp/types';

// Isolated Error Boundary so an issue in one module never crashes other ERP modules
class ErpDomainErrorBoundary extends React.Component<
  { moduleTitle: string; children: React.ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: { moduleTitle: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMsg: error?.message || 'خطای غیرمنتظره در ماژول' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-2xl p-6 text-center space-y-3">
          <AlertTriangle size={28} className="mx-auto text-rose-600" />
          <div className="font-black text-sm text-rose-800 dark:text-rose-300">
            خطا در بارگذاری ماژول مستقل «{this.props.moduleTitle}»
          </div>
          <p className="text-xs text-rose-600 dark:text-rose-400 font-mono">{this.state.errorMsg}</p>
          <button
            onClick={() => this.setState({ hasError: false, errorMsg: '' })}
            className="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs cursor-pointer"
          >
            تلاش مجدد بارگذاری این بخش
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface IndustrialAccountingErpModuleProps {
  currentUser: User;
  settings?: any;
  financialYear?: string;
}

const makeStableCompanyId = (nameStr: string) => {
  const clean = String(nameStr || '').trim();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) - hash) + clean.charCodeAt(i);
    hash |= 0;
  }
  return 'comp_' + Math.abs(hash).toString(36);
};

const getCachedCompanyErpState = (companyId: string, companyName: string): IndustrialErpState => {
  try {
    const raw = localStorage.getItem(`delcom_erp_state_${companyId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items)) {
        return {
          ...createDefaultIndustrialErpState(companyId, companyName),
          ...parsed,
          companyId,
          companyName: parsed.companyName || companyName
        };
      }
    }
  } catch {}
  return createDefaultIndustrialErpState(companyId, companyName);
};

const getPendingSyncStorageKey = (companyId: string) => `delcom_erp_pending_sync_${companyId}`;

const getConnectedCentralServerLabel = (): string => {
  const configured = getServerHost();
  if (configured) return configured;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'سرور مرکزی';
};

export const IndustrialAccountingErpModule: React.FC<IndustrialAccountingErpModuleProps> = ({
  currentUser,
  settings,
  financialYear
}) => {
  // Multi-Company State (Synced 100% with Settings companies just like Secretariat)
  const [companies, setCompanies] = useState<ErpCompanySummary[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<ErpCompanySummary | null>(() => {
    try {
      const raw = localStorage.getItem('delcom_erp_selected_company');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id && parsed.name) return parsed;
      }
    } catch {}
    return null;
  });
  const [showNewCompanyModal, setShowNewCompanyModal] = useState(false);
  const [newCompanyForm, setNewCompanyForm] = useState({
    name: '',
    registrationNumber: '',
    nationalId: '',
    economicCode: '',
    address: '',
    phone: '',
    activeFiscalYear: financialYear || '1405'
  });

  // Standalone ERP Shell Navigation State
  const [expandedCategory, setExpandedCategory] = useState<ErpMainCategoryId>('PRODUCTION');
  const [activeSubView, setActiveSubView] = useState<ErpSubViewId>('prd_line_perf');
  const [openTabs, setOpenTabs] = useState<ErpSubViewId[]>([
    'prd_line_perf',
    'wh_sales_remittance',
    'wh_tracking',
    'prd_archive'
  ]);
  const [isErpFullScreen, setIsErpFullScreen] = useState<boolean>(false);

  // Selected Company ERP Database State (Offline-first: 0ms Instant Hydration)
  const [erpState, setErpState] = useState<IndustrialErpState | null>(() => {
    try {
      const raw = localStorage.getItem('delcom_erp_selected_company');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id && parsed.name) {
          return getCachedCompanyErpState(parsed.id, parsed.name);
        }
      }
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [, setSaving] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'pending' | 'offline'>('synced');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const erpStateRef = React.useRef<IndustrialErpState | null>(erpState);
  erpStateRef.current = erpState;
  const selectedCompanyRef = React.useRef<ErpCompanySummary | null>(selectedCompany);
  selectedCompanyRef.current = selectedCompany;
  const syncInFlightRef = React.useRef<boolean>(false);

  // Sayan Cutover & Barcode Sync Shared Handlers
  const [cutoffDateInput, setCutoffDateInput] = useState<string>('1405/08/20');
  const [syncingBarcodes, setSyncingBarcodes] = useState<boolean>(false);
  const [importingTrialBalance, setImportingTrialBalance] = useState<boolean>(false);
  const [backingUpToBot, setBackingUpToBot] = useState<boolean>(false);
  const [clearingData, setClearingData] = useState<boolean>(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);

  // Per-Company Isolated Backup & Restore Manager State
  interface CompanyBackupSnapshotMeta {
    id: string;
    fileName: string;
    format: 'json' | 'json.gz' | 'zip';
    backupKind: 'auto' | 'manual' | 'bot' | 'pre_restore' | 'pre_clear';
    sizeBytes: number;
    compressedSizeBytes: number;
    recordCounts?: Record<string, number> | null;
    checksumSha256?: string | null;
    createdBy?: string;
    createdAtMs: number;
    createdDateJalali?: string;
  }
  const [showCompanyBackupModal, setShowCompanyBackupModal] = useState<boolean>(false);
  const [companyBackupsList, setCompanyBackupsList] = useState<CompanyBackupSnapshotMeta[]>([]);
  const [loadingCompanyBackups, setLoadingCompanyBackups] = useState<boolean>(false);
  const [creatingCompanyBackup, setCreatingCompanyBackup] = useState<boolean>(false);
  const [restoringCompanyBackup, setRestoringCompanyBackup] = useState<boolean>(false);
  const [confirmRestoreFileName, setConfirmRestoreFileName] = useState<string | null>(null);
  const [pendingUploadBackup, setPendingUploadBackup] = useState<{ fileName: string; base64: string; allowCrossCompany: boolean } | null>(null);
  const [backupModalStatus, setBackupModalStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const loadCompanyBackupsList = async (compId: string, compName?: string) => {
    setLoadingCompanyBackups(true);
    try {
      const targetName = compName || selectedCompanyRef.current?.name || '';
      const res = await apiCall<{ success: boolean; backups?: CompanyBackupSnapshotMeta[]; error?: string }>(
        `/industrial-erp/company-backups?companyId=${encodeURIComponent(compId)}&companyName=${encodeURIComponent(targetName)}&_t=${Date.now()}`
      );
      if (res?.success && Array.isArray(res.backups)) {
        setCompanyBackupsList(res.backups);
      } else if (res?.error) {
        setBackupModalStatus({ type: 'error', text: res.error });
      }
    } catch (err: any) {
      setBackupModalStatus({
        type: 'error',
        text: err?.message || 'خطا در دریافت فهرست آرشیو بکاپ‌های شرکت از سرور مرکزی'
      });
    } finally {
      setLoadingCompanyBackups(false);
    }
  };

  const openCompanyBackupModal = () => {
    if (!selectedCompany) return;
    setConfirmRestoreFileName(null);
    setPendingUploadBackup(null);
    setBackupModalStatus(null);
    setShowCompanyBackupModal(true);
    loadCompanyBackupsList(selectedCompany.id, selectedCompany.name);
  };

  const handleBackupToBot = async () => {
    if (!selectedCompany) return;
    setBackingUpToBot(true);
    setBackupModalStatus({ type: 'info', text: 'در حال آماده‌سازی فایل فشرده اختصاصی شرکت و ارسال همزمان به بات‌های بله و تلگرام...' });
    try {
      const res = await apiCall<{
        success: boolean;
        message?: string;
        error?: string;
        filename?: string;
        snapshotFileName?: string;
        botResult?: any;
      }>('/industrial-erp/backup-to-bot', 'POST', {
        companyId: selectedCompany.id,
        companyName: selectedCompany.name,
        createdBy: currentUser.fullName
      });
      if (res && res.success) {
        const msg = res.message || `بکاپ اختصاصی شرکت با موفقیت به بات ارسال گردید (${res.filename || ''})`;
        setBackupModalStatus({ type: 'success', text: msg });
        showToast('success', msg);
        await loadCompanyBackupsList(selectedCompany.id, selectedCompany.name);
      } else {
        const errText = res?.message || res?.error || 'خطا در ارسال فایل پشتیبان به بات';
        setBackupModalStatus({ type: 'error', text: errText });
        showToast('error', errText);
        if (res?.snapshotFileName) {
          await loadCompanyBackupsList(selectedCompany.id, selectedCompany.name);
        }
      }
    } catch (err: any) {
      const errText = err?.message || 'خطا در برقراری ارتباط با سرور پشتیبان‌گیری';
      setBackupModalStatus({ type: 'error', text: errText });
      showToast('error', errText);
    } finally {
      setBackingUpToBot(false);
    }
  };

  const handleCreateIsolatedSnapshot = async () => {
    if (!selectedCompany) return;
    setCreatingCompanyBackup(true);
    setBackupModalStatus({ type: 'info', text: 'در حال ثبت نسخه بکاپ فشرده اختصاصی شرکت روی سرور مرکزی...' });
    try {
      const res = await apiCall<{ success: boolean; message?: string; error?: string; snapshot?: CompanyBackupSnapshotMeta }>(
        '/industrial-erp/create-company-backup',
        'POST',
        {
          companyId: selectedCompany.id,
          companyName: selectedCompany.name,
          createdBy: currentUser.fullName
        }
      );
      if (res?.success) {
        const msg = res.message || 'نسخه پشتیبان فشرده اختصاصی این شرکت روی سرور ذخیره شد.';
        setBackupModalStatus({ type: 'success', text: msg });
        showToast('success', msg);
        await loadCompanyBackupsList(selectedCompany.id, selectedCompany.name);
      } else {
        const errText = res?.error || res?.message || 'خطا در ثبت نسخه پشتیبان شرکت';
        setBackupModalStatus({ type: 'error', text: errText });
        showToast('error', errText);
      }
    } catch (err: any) {
      const errText = err?.message || 'خطا در ایجاد فایل پشتیبان روی سرور';
      setBackupModalStatus({ type: 'error', text: errText });
      showToast('error', errText);
    } finally {
      setCreatingCompanyBackup(false);
    }
  };

  const handleDownloadBackup = async (format: 'json' | 'zip' | 'gz' = 'zip', specificFileName?: string) => {
    if (!selectedCompany) return;
    setBackupModalStatus({ type: 'info', text: 'در حال آماده‌سازی و دریافت فایل پشتیبان از سرور مرکزی...' });
    try {
      const compNameParam = `&companyName=${encodeURIComponent(selectedCompany.name)}`;
      const relativeEndpoint = specificFileName
        ? `/industrial-erp/company-backups/download?companyId=${encodeURIComponent(selectedCompany.id)}${compNameParam}&fileName=${encodeURIComponent(specificFileName)}`
        : `/industrial-erp/download-backup?companyId=${encodeURIComponent(selectedCompany.id)}${compNameParam}&format=${format}`;
      const targetUrl = getEffectiveApiUrl(relativeEndpoint);
      const token = getAuthToken();
      const response = await fetch(targetUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) {
        let serverError = '';
        try {
          const ct = response.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const errJson = await response.json();
            serverError = errJson?.error || errJson?.message || '';
          } else {
            serverError = (await response.text()).slice(0, 180);
          }
        } catch {}
        throw new Error(serverError || `خطای سرور هنگام دانلود (کد ${response.status})`);
      }

      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error('فایل دریافت‌شده از سرور خالی است.');
      }

      const ext = format === 'gz' ? 'json.gz' : format;
      const downloadFileName =
        specificFileName ||
        `ERP_Backup_${selectedCompany.id}_${new Date().toISOString().slice(0, 10)}.${ext}`;

      const savedOk = await saveBlobAndOpenFile(blob, downloadFileName);
      if (!savedOk) {
        throw new Error('ذخیره فایل در حافظه دستگاه با خطا مواجه شد.');
      }
      const msg = `فایل پشتیبان اختصاصی شرکت «${selectedCompany.name}» (${downloadFileName}) با موفقیت ذخیره شد.`;
      setBackupModalStatus({ type: 'success', text: msg });
      showToast('success', msg);
    } catch (err: any) {
      // Offline emergency fallback when exporting raw JSON of current active state
      if (format === 'json' && !specificFileName && erpStateRef.current) {
        try {
          const emergencyEnvelope = {
            schema: 'DELKAM_ERP_COMPANY_BACKUP_V1',
            companyId: selectedCompany.id,
            companyName: selectedCompany.name,
            exportedAt: Date.now(),
            exportedDateJalali: getTodayJalali(),
            source: 'client-cache-fallback',
            state: erpStateRef.current
          };
          const fallbackBlob = new Blob([JSON.stringify(emergencyEnvelope, null, 2)], { type: 'application/json' });
          const fallbackName = `ERP_Backup_${selectedCompany.id}_${new Date().toISOString().slice(0, 10)}_offline.json`;
          const savedOk = await saveBlobAndOpenFile(fallbackBlob, fallbackName);
          if (savedOk) {
            const warnMsg = `سرور پاسخ نداد (${err?.message || 'خطای شبکه'})، اما نسخه JSON از داده‌های فعلی شرکت دانلود شد.`;
            setBackupModalStatus({ type: 'info', text: warnMsg });
            showToast('success', warnMsg);
            return;
          }
        } catch {}
      }
      const errText = err?.message || 'خطا در دانلود فایل پشتیبان';
      setBackupModalStatus({ type: 'error', text: errText });
      showToast('error', errText);
    }
  };

  const handleRestoreFromSnapshotFile = async (fileName: string) => {
    if (!selectedCompany) return;
    setRestoringCompanyBackup(true);
    try {
      const res = await apiCall<{ success: boolean; state?: IndustrialErpState; message?: string; error?: string }>(
        '/industrial-erp/restore-company-backup',
        'POST',
        {
          companyId: selectedCompany.id,
          companyName: selectedCompany.name,
          fileName,
          restoredBy: currentUser.fullName
        }
      );
      if (res?.success && res.state) {
        setErpState(res.state);
        try {
          localStorage.setItem(`delcom_erp_state_${selectedCompany.id}`, JSON.stringify(res.state));
        } catch {}
        setConfirmRestoreFileName(null);
        await loadCompanyBackupsList(selectedCompany.id, selectedCompany.name);
        const msg = res.message || `داده‌های شرکت «${selectedCompany.name}» با موفقیت بازیابی شد.`;
        setBackupModalStatus({ type: 'success', text: msg });
        showToast('success', msg);
      } else {
        const errText = res?.error || 'خطا در بازیابی بکاپ شرکت';
        setBackupModalStatus({ type: 'error', text: errText });
        showToast('error', errText);
      }
    } catch (err: any) {
      const errText = err?.message || 'خطا در بازیابی نسخه پشتیبان';
      setBackupModalStatus({ type: 'error', text: errText });
      showToast('error', errText);
    } finally {
      setRestoringCompanyBackup(false);
    }
  };

  const handleUploadBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      if (base64) {
        setPendingUploadBackup({ fileName: file.name, base64, allowCrossCompany: false });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmUploadedBackupRestore = async () => {
    if (!selectedCompany || !pendingUploadBackup) return;
    setRestoringCompanyBackup(true);
    try {
      const res = await apiCall<{ success: boolean; state?: IndustrialErpState; message?: string; error?: string }>(
        '/industrial-erp/restore-company-backup',
        'POST',
        {
          companyId: selectedCompany.id,
          companyName: selectedCompany.name,
          backupContentBase64: pendingUploadBackup.base64,
          allowCrossCompanyImport: pendingUploadBackup.allowCrossCompany,
          restoredBy: currentUser.fullName
        }
      );
      if (res?.success && res.state) {
        setErpState(res.state);
        try {
          localStorage.setItem(`delcom_erp_state_${selectedCompany.id}`, JSON.stringify(res.state));
        } catch {}
        setPendingUploadBackup(null);
        await loadCompanyBackupsList(selectedCompany.id, selectedCompany.name);
        const msg = res.message || 'فایل پشتیبان اختصاصی با موفقیت روی همین شرکت بازیابی شد.';
        setBackupModalStatus({ type: 'success', text: msg });
        showToast('success', msg);
      } else {
        const errText = res?.error || 'فایل پشتیبان با این شرکت همخوانی ندارد یا معتبر نیست.';
        setBackupModalStatus({ type: 'error', text: errText });
        showToast('error', errText);
      }
    } catch (err: any) {
      const errText = err?.message || 'خطا در بازیابی فایل انتخاب‌شده';
      setBackupModalStatus({ type: 'error', text: errText });
      showToast('error', errText);
    } finally {
      setRestoringCompanyBackup(false);
    }
  };

  const handleClearCompanyData = async () => {
    if (!selectedCompany) return;
    setClearingData(true);
    try {
      const res = await apiCall<{ success: boolean; message: string; state: IndustrialErpState }>(
        '/api/industrial-erp/clear-company-data',
        'POST',
        { companyId: selectedCompany.id }
      );
      if (res && res.success && res.state) {
        setErpState(res.state);
        try {
          localStorage.removeItem(`delcom_erp_state_${selectedCompany.id}`);
        } catch {}
        setShowClearConfirmModal(false);
        showToast('success', res.message || 'داده‌های شرکت خام و صفر گردید. دیتابیس اصلی برنامه کاملاً سالم و دست‌نخورده است.');
      } else {
        showToast('error', 'خطا در خام‌سازی داده‌های شرکت');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'خطا در پردازش درخواست');
    } finally {
      setClearingData(false);
    }
  };

  // Granular Access Matrix
  const userAny = currentUser as any;
  const isAdmin =
    currentUser.role === UserRole.ADMIN ||
    currentUser.role === UserRole.MANAGER ||
    currentUser.role === UserRole.FINANCIAL ||
    Boolean(userAny.canManageSettings);

  const perms = userAny.industrialErpPermissions || {};
  const canWeighAndPrintLabel = isAdmin || Boolean(perms.canWeighAndPrintLabel ?? true);
  const canIssueRemittance = isAdmin || Boolean(perms.canIssueWarehouseRemittance ?? true);
  const canCreateSalesFromRemittance = isAdmin || Boolean(perms.canCreateSalesInvoiceFromRemittance ?? true);
  const canViewCostPrice = isAdmin || Boolean(perms.canViewCostPrice ?? true);
  const canViewFinancialAmounts = isAdmin || Boolean(perms.canViewFinancialAmounts ?? true);
  const canManageMasterData = isAdmin || Boolean(perms.canManageMasterData ?? true);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4500);
  };

  const openSubViewTab = (subId: ErpSubViewId) => {
    let targetId = subId;
    if (subId === 'wh_weighbridge') targetId = 'prd_line_perf';
    if (subId === 'wh_exit_remittance') targetId = 'wh_sales_remittance';

    setActiveSubView(targetId);
    setOpenTabs(prev => (prev.includes(targetId) ? prev : [...prev, targetId]));
    const parentCat = ERP_SIDEBAR_TREE.find(cat =>
      cat.groups.some(g => g.items.some(it => it.id === targetId))
    );
    if (parentCat) {
      setExpandedCategory(parentCat.id);
    }
  };

  const closeSubViewTab = (subId: ErpSubViewId, e: React.MouseEvent) => {
    e.stopPropagation();
    if (openTabs.length <= 1) return;
    const next = openTabs.filter(t => t !== subId);
    setOpenTabs(next);
    if (activeSubView === subId) {
      setActiveSubView(next[next.length - 1]);
    }
  };

  const extractSettingsCompanies = (sysSettingsObj: any): any[] => {
    const companyMap = new Map<string, any>();
    const rawComps = Array.isArray(sysSettingsObj?.companies) ? sysSettingsObj.companies : [];
    const rawNames = Array.isArray(sysSettingsObj?.companyNames) ? sysSettingsObj.companyNames : [];

    rawComps.forEach((c: any) => {
      if (c && c.name && String(c.name).trim()) {
        const cleanName = String(c.name).trim();
        if (c.id === 'comp_arian' && !rawNames.includes(cleanName) && rawNames.length > 0) return;
        companyMap.set(cleanName, {
          ...c,
          id: c.id || makeStableCompanyId(cleanName),
          name: cleanName
        });
      }
    });

    rawNames.forEach((name: string) => {
      if (name && String(name).trim()) {
        const cleanName = String(name).trim();
        if (!companyMap.has(cleanName)) {
          companyMap.set(cleanName, {
            id: makeStableCompanyId(cleanName),
            name: cleanName
          });
        }
      }
    });

    let merged = Array.from(companyMap.values());
    if (merged.length > 1 && merged.some(c => c.name !== 'شرکت اصلی')) {
      merged = merged.filter(
        c =>
          c.name !== 'شرکت اصلی' ||
          c.logo ||
          c.registrationNumber ||
          c.nationalId ||
          c.address ||
          c.economicCode ||
          (c.banks && c.banks.length > 0)
      );
    }
    if (merged.length > 1 && merged.some(c => c.id !== 'comp_arian')) {
      merged = merged.filter(c => c.id !== 'comp_arian');
    }
    return merged;
  };

  const fetchCompaniesList = async () => {
    try {
      // 1. Instant local render from available settings
      const effectiveSettings = settings || {};
      const localComps = extractSettingsCompanies(effectiveSettings);
      if (localComps.length > 0) {
        setCompanies(prev => prev.length === 0 ? localComps.map((sc: any) => ({
          id: sc.id || makeStableCompanyId(sc.name),
          name: sc.name,
          logo: sc.logo || undefined,
          registrationNumber: sc.registrationNumber || '-',
          nationalId: sc.nationalId || '-',
          economicCode: sc.economicCode || '-',
          address: sc.address || '-',
          phone: sc.phone || '-',
          activeFiscalYear: financialYear || '1405',
          fiscalYears: ['1405', '1404'],
          allowedUserIds: sc.erpAllowedUserIds || [],
          stats: undefined
        })) : prev);
      }

      // 2. Fetch fresh settings & ERP companies asynchronously
      const [erpRes, freshSettings] = await Promise.all([
        apiCall<any>('/industrial-erp/companies').catch(() => null),
        getSettings().catch(() => null)
      ]);

      const erpList: ErpCompanySummary[] = Array.isArray(erpRes)
        ? erpRes
        : Array.isArray(erpRes?.companies)
        ? erpRes.companies
        : [];

      const latestSettings = freshSettings || settings || {};
      const settingsComps = extractSettingsCompanies(latestSettings);

      if (settingsComps.length > 0) {
        const syncedList: ErpCompanySummary[] = settingsComps.map((sc: any) => {
          const matchedErp = erpList.find(
            ec => ec.id === sc.id || ec.name === sc.name || ec.name?.trim() === sc.name?.trim()
          );
          return {
            id: matchedErp?.id || sc.id || makeStableCompanyId(sc.name),
            name: matchedErp?.name || sc.name,
            logo: sc.logo || matchedErp?.logo || undefined,
            registrationNumber: sc.registrationNumber || matchedErp?.registrationNumber || '-',
            nationalId: sc.nationalId || matchedErp?.nationalId || '-',
            economicCode: sc.economicCode || matchedErp?.economicCode || '-',
            address: sc.address || matchedErp?.address || '-',
            phone: sc.phone || matchedErp?.phone || '-',
            activeFiscalYear: matchedErp?.activeFiscalYear || financialYear || '1405',
            fiscalYears: matchedErp?.fiscalYears || ['1405', '1404'],
            allowedUserIds: sc.erpAllowedUserIds || matchedErp?.allowedUserIds || [],
            stats: matchedErp?.stats
          };
        });
        setCompanies(syncedList);

        // Reconcile cached selectedCompany with authoritative central server ID if name matches
        const curSel = selectedCompanyRef.current;
        if (curSel) {
          const reconciled = syncedList.find(
            c => c.id === curSel.id || c.name.trim() === curSel.name.trim()
          );
          if (reconciled && reconciled.id !== curSel.id) {
            setSelectedCompany(reconciled);
            try {
              localStorage.setItem('delcom_erp_selected_company', JSON.stringify(reconciled));
              localStorage.setItem('delcom_erp_last_selected_company_id', reconciled.id);
              localStorage.setItem('delcom_erp_last_selected_company_name', reconciled.name);
            } catch {}
          }
        }
      } else if (erpList.length > 0) {
        setCompanies(erpList);
        const curSel = selectedCompanyRef.current;
        if (curSel) {
          const reconciled = erpList.find(
            c => c.id === curSel.id || c.name.trim() === curSel.name.trim()
          );
          if (reconciled && reconciled.id !== curSel.id) {
            setSelectedCompany(reconciled);
            try {
              localStorage.setItem('delcom_erp_selected_company', JSON.stringify(reconciled));
            } catch {}
          }
        }
      }
    } catch {
      // Quietly ignore network failures when listing companies offline
    } finally {
      setLoading(false);
    }
  };

  const syncCompanyStateFromServer = async (
    compId: string,
    compName: string,
    options?: { silent?: boolean; force?: boolean }
  ) => {
    if (!compId || syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    const silent = Boolean(options?.silent);
    const force = Boolean(options?.force);

    try {
      setSyncStatus('syncing');

      // 1. If there are unsent local changes queued for this company, push & merge them first!
      let hasPendingLocal = false;
      try {
        hasPendingLocal = localStorage.getItem(getPendingSyncStorageKey(compId)) === '1';
      } catch {}

      if (hasPendingLocal) {
        const queuedState = getCachedCompanyErpState(compId, compName);
        const pushRes = await apiCall<{ success: boolean; state?: IndustrialErpState }>(
          '/industrial-erp/save-state',
          'POST',
          { companyId: compId, companyName: compName, state: queuedState }
        );
        if (pushRes?.success) {
          try {
            localStorage.removeItem(getPendingSyncStorageKey(compId));
          } catch {}
          const resolvedId = pushRes.state?.companyId || compId;
          if (pushRes.state) {
            setErpState(pushRes.state);
            try {
              localStorage.setItem(`delcom_erp_state_${resolvedId}`, JSON.stringify(pushRes.state));
            } catch {}
            setSyncStatus('synced');
            setLastSyncedAt(Date.now());
            setSyncErrorMsg(null);
            if (!silent) {
              showToast('success', 'تغییرات معوق این دستگاه به سرور مرکزی ارسال و با موفقیت همگام شد.');
            }
            return;
          }
        }
      }

      // 2. Fetch authoritative state from central server (PostgreSQL / Server DB) with cache-buster + companyName fallback
      const serverData = await apiCall<IndustrialErpState>(
        `/industrial-erp/state?companyId=${encodeURIComponent(compId)}&companyName=${encodeURIComponent(compName)}&_t=${Date.now()}`
      );

      if (serverData && typeof serverData === 'object' && Array.isArray(serverData.items)) {
        const canonicalId = serverData.companyId || compId;
        if (canonicalId !== compId && selectedCompanyRef.current && selectedCompanyRef.current.id === compId) {
          const reconciled = { ...selectedCompanyRef.current, id: canonicalId };
          setSelectedCompany(reconciled);
          try {
            localStorage.setItem('delcom_erp_selected_company', JSON.stringify(reconciled));
            localStorage.setItem('delcom_erp_last_selected_company_id', canonicalId);
          } catch {}
        }

        const currentLocal = erpStateRef.current;
        const serverRev = Number(serverData._revision || 0);
        const localRev = Number(currentLocal?._revision || 0);
        const companyChanged = !currentLocal || currentLocal.companyId !== canonicalId;

        if (force || companyChanged || serverRev === 0 || localRev === 0 || serverRev !== localRev) {
          setErpState(serverData);
          try {
            localStorage.setItem(`delcom_erp_state_${canonicalId}`, JSON.stringify(serverData));
          } catch {}
        }
        setSyncStatus('synced');
        setLastSyncedAt(Date.now());
        setSyncErrorMsg(null);
        if (!silent) {
          showToast('success', `اطلاعات شرکت «${compName}» با سرور مرکزی همگام شد (نسخه سرور: v${serverRev || 1}).`);
        }
      }
    } catch (err: any) {
      let hasPending = false;
      try {
        hasPending = localStorage.getItem(getPendingSyncStorageKey(compId)) === '1';
      } catch {}
      setSyncStatus(hasPending ? 'pending' : 'offline');
      const errText = err?.message || 'خطا در اتصال به سرور مرکزی';
      setSyncErrorMsg(errText);
      if (!silent) {
        showToast('error', `خطا در همگام‌سازی با سرور مرکزی: ${errText}`);
      }
    } finally {
      syncInFlightRef.current = false;
    }
  };

  const handleSelectCompany = (comp: ErpCompanySummary) => {
    setSelectedCompany(comp);
    try {
      localStorage.setItem('delcom_erp_selected_company', JSON.stringify(comp));
      localStorage.setItem('delcom_erp_last_selected_company_id', comp.id);
      localStorage.setItem('delcom_erp_last_selected_company_name', comp.name);
    } catch {}

    // 1. Instant local cache hydration for zero blank screen
    const local = getCachedCompanyErpState(comp.id, comp.name);
    setErpState(local);
    setLoading(false);

    // 2. Authoritative central server sync (with queued upload flush if any)
    syncCompanyStateFromServer(comp.id, comp.name, { silent: true, force: true });
  };

  useEffect(() => {
    fetchCompaniesList();
  }, [settings?.companies, settings?.companyNames]);

  useEffect(() => {
    if (!selectedCompany) return;

    if (!erpState || erpState.companyId !== selectedCompany.id) {
      const local = getCachedCompanyErpState(selectedCompany.id, selectedCompany.name);
      setErpState(local);
    }
    setLoading(false);

    // Initial sync when entering company or switching company
    syncCompanyStateFromServer(selectedCompany.id, selectedCompany.name, { silent: true, force: true });

    const triggerSilentSync = () => {
      const cur = selectedCompanyRef.current;
      if (!cur) return;
      syncCompanyStateFromServer(cur.id, cur.name, { silent: true });
    };

    // Real-time SSE event listener from server (instant push when Web / Windows / Android saves)
    const handleRealtimeErpUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const cur = selectedCompanyRef.current;
      if (!cur || !detail) return;
      const sameId = detail.companyId === cur.id;
      const sameName =
        detail.companyName && cur.name && String(detail.companyName).trim() === String(cur.name).trim();
      if (!sameId && !sameName) return;

      const incomingRev = Number(detail.revision || 0);
      const localRev = Number(erpStateRef.current?._revision || 0);
      if (!incomingRev || incomingRev > localRev) {
        syncCompanyStateFromServer(cur.id, cur.name, { silent: true, force: true });
        fetchCompaniesList();
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        triggerSilentSync();
      }
    };

    const handleCrossTabStorageSync = (ev: StorageEvent) => {
      const cur = selectedCompanyRef.current;
      if (!cur || !ev.key) return;
      if (ev.key === `delcom_erp_state_${cur.id}` && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          if (parsed && Array.isArray(parsed.items)) {
            setErpState(parsed);
          }
        } catch {}
      }
    };

    window.addEventListener('ERP_STATE_UPDATED_REALTIME', handleRealtimeErpUpdate);
    window.addEventListener('focus', triggerSilentSync);
    window.addEventListener('online', triggerSilentSync);
    window.addEventListener('storage', handleCrossTabStorageSync);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Periodic central-server sync fallback every 8 seconds while workspace is visible
    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      triggerSilentSync();
    }, 8000);

    return () => {
      window.removeEventListener('ERP_STATE_UPDATED_REALTIME', handleRealtimeErpUpdate);
      window.removeEventListener('focus', triggerSilentSync);
      window.removeEventListener('online', triggerSilentSync);
      window.removeEventListener('storage', handleCrossTabStorageSync);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      clearInterval(pollInterval);
    };
  }, [selectedCompany?.id]);

  const ERP_TRACKED_COLLECTIONS = [
    'productionLines',
    'commodityGroups',
    'warehouses',
    'items',
    'boms',
    'productionOrders',
    'cartonLabels',
    'productionVouchers',
    'warehouseDocuments',
    'warehouseDocs',
    'salesOrders',
    'remittances',
    'tradeDocs',
    'parties',
    'bankAccounts',
    'chequeBooks',
    'treasuryDocs',
    'employees',
    'payrollSlips',
    'fixedAssets',
    'chartOfAccounts',
    'vouchers'
  ] as const;

  const persistErpState = async (nextState: IndustrialErpState, successToast?: string) => {
    const activeComp = selectedCompanyRef.current || selectedCompany;
    if (!activeComp) return;

    // Diff deleted record IDs compared to previous in-memory state of same company
    const deletedIds: Record<string, string[]> = {};
    const prevState = erpStateRef.current;
    if (prevState && prevState.companyId === activeComp.id) {
      for (const col of ERP_TRACKED_COLLECTIONS) {
        const prevArr: any[] = Array.isArray((prevState as any)[col]) ? (prevState as any)[col] : [];
        const nextArr: any[] = Array.isArray((nextState as any)[col]) ? (nextState as any)[col] : [];
        if (prevArr.length > 0) {
          const nextIdSet = new Set(nextArr.map(r => r?.id).filter(Boolean));
          const removed = prevArr.map(r => r?.id).filter((id): id is string => Boolean(id) && !nextIdSet.has(id));
          if (removed.length > 0) {
            deletedIds[col] = removed;
          }
        }
      }
    }

    const stateToSave: IndustrialErpState = {
      ...nextState,
      companyId: activeComp.id,
      _revision: nextState._revision ?? prevState?._revision,
      ...(Object.keys(deletedIds).length > 0 ? { _deletedIds: deletedIds } : {})
    };

    // 1. Immediate memory update & local backup + pending flag
    setErpState(stateToSave);
    try {
      localStorage.setItem(`delcom_erp_state_${activeComp.id}`, JSON.stringify(stateToSave));
      localStorage.setItem(getPendingSyncStorageKey(activeComp.id), '1');
    } catch {}

    // 2. Central Server save with authoritative revision & concurrent merge sync
    try {
      setSaving(true);
      setSyncStatus('syncing');
      const saveRes = await apiCall<{ success: boolean; mergedConcurrently?: boolean; state?: IndustrialErpState }>(
        '/industrial-erp/save-state',
        'POST',
        {
          companyId: activeComp.id,
          companyName: activeComp.name,
          state: stateToSave
        }
      );
      if (!saveRes?.success) {
        throw new Error('پاسخ معتبر از سرور مرکزی دریافت نشد');
      }
      try {
        localStorage.removeItem(getPendingSyncStorageKey(activeComp.id));
      } catch {}
      if (saveRes?.state && saveRes.state.companyId === activeComp.id) {
        setErpState(saveRes.state);
        try {
          localStorage.setItem(`delcom_erp_state_${activeComp.id}`, JSON.stringify(saveRes.state));
        } catch {}
      }
      setSyncStatus('synced');
      setLastSyncedAt(Date.now());
      setSyncErrorMsg(null);
      if (successToast) {
        showToast(
          'success',
          saveRes.mergedConcurrently
            ? `${successToast} (ادغام همزمان با سرور مرکزی انجام شد)`
            : successToast
        );
      }
      fetchCompaniesList();
    } catch (err: any) {
      setSyncStatus('pending');
      setSyncErrorMsg(err?.message || 'عدم ارتباط با سرور مرکزی');
      showToast(
        'error',
        `خطا در ارسال به سرور مرکزی (${err?.message || 'قطع شبکه'}). تغییرات موقتاً در این دستگاه صف‌بندی شد تا پس از اتصال مجدد همگام شود.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrSaveCompany = async () => {
    if (!newCompanyForm.name.trim()) {
      showToast('error', 'نام شرکت الزامی است.');
      return;
    }
    try {
      setSaving(true);
      await apiCall<any>('/industrial-erp/companies', 'POST', newCompanyForm);
      await fetchCompaniesList();
      setShowNewCompanyModal(false);
      setNewCompanyForm({
        name: '',
        registrationNumber: '',
        nationalId: '',
        economicCode: '',
        address: '',
        phone: '',
        activeFiscalYear: financialYear || '1405'
      });
      showToast('success', `شرکت «${newCompanyForm.name}» در تنظیمات سیستم و حسابداری ثبت گردید.`);
    } catch (err: any) {
      showToast('error', err?.message || 'خطا در ثبت شرکت');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncSayanBarcodes = async () => {
    if (!selectedCompany) return;
    try {
      setSyncingBarcodes(true);
      const res = await apiCall<any>('/industrial-erp/sync-sayan-inventory-barcodes', 'POST', {
        companyId: selectedCompany.id
      });
      if (res?.state) setErpState(res.state);
      showToast('success', res?.message || 'بارکدها و موجودی کارتن‌های سایان به این شرکت منتقل شد.');
    } catch (err: any) {
      showToast('error', err?.message || 'خطا در دریافت بارکدها از سایان');
    } finally {
      setSyncingBarcodes(false);
    }
  };

  const handleImportSayanTrialBalance = async () => {
    if (!selectedCompany) return;
    try {
      setImportingTrialBalance(true);
      const res = await apiCall<any>('/industrial-erp/import-sayan-trial-balance', 'POST', {
        companyId: selectedCompany.id,
        cutoffDateJalali: cutoffDateInput.trim(),
        importedBy: currentUser.fullName
      });
      if (res?.state) setErpState(res.state);
      showToast('success', res?.message || 'تراز افتتاحیه از سایان با موفقیت به این شرکت منتقل شد.');
    } catch (err: any) {
      showToast('error', err?.message || 'خطا در انتقال تراز از سایان');
    } finally {
      setImportingTrialBalance(false);
    }
  };

  const handleToggleCutoverStage = async (stageKey: keyof ErpCutoverConfig) => {
    if (!erpState || !selectedCompany) return;
    const currentCfg: ErpCutoverConfig = erpState.cutoverConfig || {
      stage1FactoryWarehouseActive: true,
      stage2TehranPricingInvoiceActive: true,
      stage3PaymentOrdersAutoVoucherActive: false,
      lastSayanBarcodeSyncAt: null,
      lastSayanBarcodeSyncCount: 0,
      lastTrialBalanceCutoffDate: '',
      lastTrialBalanceImportAt: null,
      defaultPaymentBankAccountCode: '110101',
      defaultReceivableAccountCode: '110201',
      defaultPayableAccountCode: '210101'
    };
    const nextCfg = {
      ...currentCfg,
      [stageKey]: !currentCfg[stageKey]
    };
    try {
      const res = await apiCall<any>('/industrial-erp/update-cutover-config', 'POST', {
        companyId: selectedCompany.id,
        cutoverConfig: nextCfg
      });
      if (res?.state) setErpState(res.state);
      showToast('success', 'تنظیمات مرحله جایگزینی سایان برای این شرکت ذخیره شد.');
    } catch {
      showToast('error', 'خطا در ذخیره تنظیمات');
    }
  };

  // ============================================================================
  // STEP 1: MULTI-COMPANY SELECTION PORTAL (EXACTLY LIKE SECRETARIAT MODULE)
  // ============================================================================
  if (!selectedCompany) {
    const visibleCompanies = companies.filter(comp => {
      if (isAdmin) return true;
      if (!comp.allowedUserIds || comp.allowedUserIds.length === 0) return true;
      return comp.allowedUserIds.includes(currentUser.id);
    });

    return (
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-8 animate-fade-in" dir="rtl">
        {toastMsg && (
          <div
            className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl font-bold text-xs flex items-center gap-2 ${
              toastMsg.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            {toastMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{toastMsg.text}</span>
          </div>
        )}

        <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-indigo-500/20 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0">
              <Building2 size={34} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-black">
                  سامانه جامع حسابداری صنعتی، انبار و ERP چندشرکتی
                </h1>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold">
                  همگام با شرکت‌های تعریف‌شده در تنظیمات سیستم
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-blue-500/20 border border-blue-400/30 text-blue-200 text-[11px] font-mono font-bold flex items-center gap-1">
                  <Server size={12} />
                  <span>سرور مرکزی: {getConnectedCentralServerLabel()}</span>
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-300 mt-1.5 leading-relaxed">
                کلیه کاربران در وب، ویندوز و اندروید مستقیماً به دیتابیس همین سرور مرکزی متصل هستند. شرکت مورد نظر را جهت ورود انتخاب نمایید.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchCompaniesList}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 border border-white/20 cursor-pointer"
              title="بروزرسانی لیست شرکت‌ها از تنظیمات"
            >
              <RefreshCw size={15} />
              <span>بروزرسانی از تنظیمات</span>
            </button>
          </div>
        </div>

        {visibleCompanies.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 text-center p-10 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 font-bold">
            هیچ شرکتی در بخش تنظیمات سیستم تعریف نشده است. لطفاً ابتدا شرکت‌ها را در بخش «تنظیمات عمومی سیستم» تعریف نمایید.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleCompanies.map(comp => (
              <div
                key={comp.id}
                onClick={() => handleSelectCompany(comp)}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between cursor-pointer shadow-sm hover:shadow-xl hover:border-indigo-400 transition-all duration-200 relative group overflow-hidden"
              >
                <div className="absolute top-0 right-0 h-1.5 w-full bg-gradient-to-l from-indigo-600 to-emerald-500" />

                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-black text-lg shrink-0">
                        {comp.logo ? (
                          <img src={comp.logo} alt={comp.name} className="w-full h-full object-cover rounded-xl" />
                        ) : (
                          comp.name.charAt(0)
                        )}
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 dark:text-white text-base group-hover:text-indigo-600 transition-colors">
                          {comp.name}
                        </h3>
                        <span className="text-[11px] text-slate-500 font-mono block mt-0.5">
                          شناسه ملی: {comp.nationalId || '-'}
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-black text-[11px] border border-indigo-200 dark:border-indigo-800">
                      سال مالی {comp.activeFiscalYear || '1405'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1">
                    <div className="flex justify-between">
                      <span>شماره ثبت:</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{comp.registrationNumber || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>کد اقتصادی:</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{comp.economicCode || '-'}</span>
                    </div>
                    <div className="truncate text-[11px] text-slate-400 pt-1">{comp.address || '-'}</div>
                  </div>

                  {comp.stats && (
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2">
                        <div className="text-[10px] text-slate-500">اسناد مالی</div>
                        <div className="font-black text-xs text-indigo-600 font-mono mt-0.5">{comp.stats.vouchersCount}</div>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2">
                        <div className="text-[10px] text-slate-500">کارتن موجود</div>
                        <div className="font-black text-xs text-emerald-600 font-mono mt-0.5">{comp.stats.inStockCartonsCount}</div>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2">
                        <div className="text-[10px] text-slate-500">خروج بدون فی</div>
                        <div className="font-black text-xs text-amber-600 font-mono mt-0.5">{comp.stats.pendingRemittancesCount}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-indigo-600 dark:text-indigo-400 font-black text-xs">
                  <span className="flex items-center gap-1.5">
                    <Unlock size={14} className="text-emerald-600" />
                    <span>ورود به نرم‌افزار حسابداری این شرکت</span>
                  </span>
                  <ChevronLeft size={16} />
                </div>
              </div>
            ))}
          </div>
        )}

        {showNewCompanyModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 size={18} className="text-indigo-600" />
                  <span>تعریف شرکت جدید با دیتابیس حسابداری و انبار مستقل</span>
                </h3>
                <button onClick={() => setShowNewCompanyModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">نام رسمی شرکت *</label>
                  <input
                    type="text"
                    value={newCompanyForm.name}
                    onChange={e => setNewCompanyForm({ ...newCompanyForm, name: e.target.value })}
                    placeholder="مثلاً: شرکت ریسندگی و نساجی پارس نخ"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">شناسه ملی</label>
                  <input
                    type="text"
                    value={newCompanyForm.nationalId}
                    onChange={e => setNewCompanyForm({ ...newCompanyForm, nationalId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">شماره ثبت</label>
                  <input
                    type="text"
                    value={newCompanyForm.registrationNumber}
                    onChange={e => setNewCompanyForm({ ...newCompanyForm, registrationNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">کد اقتصادی</label>
                  <input
                    type="text"
                    value={newCompanyForm.economicCode}
                    onChange={e => setNewCompanyForm({ ...newCompanyForm, economicCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">سال مالی فعال</label>
                  <input
                    type="text"
                    value={newCompanyForm.activeFiscalYear}
                    onChange={e => setNewCompanyForm({ ...newCompanyForm, activeFiscalYear: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">نشانی دفتر مرکزی / کارخانه</label>
                  <input
                    type="text"
                    value={newCompanyForm.address}
                    onChange={e => setNewCompanyForm({ ...newCompanyForm, address: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setShowNewCompanyModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  onClick={handleCreateOrSaveCompany}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black cursor-pointer"
                >
                  ایجاد شرکت و راه‌اندازی دیتابیس مستقل
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // STEP 2: FULL STANDALONE ENTERPRISE ERP WORKSPACE WITH DEDICATED RIGHT SIDEBAR
  // ============================================================================
  // Effective ERP state is guaranteed to exist immediately via offline cache or default blueprint
  const currentErpState: IndustrialErpState =
    erpState && erpState.companyId === selectedCompany.id
      ? erpState
      : getCachedCompanyErpState(selectedCompany.id, selectedCompany.name);

  const quickRibbonShortcuts: { id: ErpSubViewId; label: string; icon: any; color: string }[] = [
    { id: 'prd_line_perf', label: 'عملکرد خط و باسکول (ورود به انبار تولید)', icon: Scale, color: 'text-orange-700 bg-orange-50 border-orange-200' },
    { id: 'wh_production_delivery', label: 'تحویل تولید به انبار مقصد', icon: Truck, color: 'text-teal-700 bg-teal-50 border-teal-200' },
    { id: 'wh_receipt_production', label: 'رسید دریافت از تولید', icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { id: 'wh_sales_remittance', label: 'حواله فروش (قفل بارکد)', icon: Truck, color: 'text-blue-700 bg-blue-50 border-blue-200' },
    { id: 'wh_opening_balance', label: 'موجودی ابتدای دوره', icon: Plus, color: 'text-cyan-700 bg-cyan-50 border-cyan-200' },
    { id: 'wh_stock_adjustment', label: 'اصلاح دستی مانده انبار', icon: ArrowLeftRight, color: 'text-amber-700 bg-amber-50 border-amber-200' },
    { id: 'wh_kardex', label: 'کاردکس کالا (مانده وزن)', icon: Layers, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
    { id: 'wh_inter_remittance', label: 'حواله بین‌انبار', icon: ArrowLeftRight, color: 'text-purple-700 bg-purple-50 border-purple-200' },
    { id: 'wh_inter_receipt', label: 'رسید حواله بین‌انبار', icon: CheckCircle2, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
    { id: 'wh_tracking', label: 'رهگیری بارکد/ارجاع', icon: Layers, color: 'text-teal-700 bg-teal-50 border-teal-200' },
    { id: 'wh_warehouses', label: 'انبارها (ویرایش/حذف)', icon: Boxes, color: 'text-teal-600 bg-teal-50 border-teal-200' },
    { id: 'wh_stock_report', label: 'موجودی و نقطه سفارش', icon: Boxes, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { id: 'wacc_pricing', label: 'حسابداری انبار (میانگین موزون)', icon: FileSpreadsheet, color: 'text-cyan-700 bg-cyan-50 border-cyan-200' },
    { id: 'prd_archive', label: 'بایگانی تولید', icon: FolderKanban, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { id: 'wh_archive', label: 'بایگانی اسناد انبار', icon: FolderKanban, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' }
  ];

  // Determine which isolated domain module handles the activeSubView
  const isWarehouseDomain =
    activeSubView.startsWith('wh_') || activeSubView.startsWith('wacc_');
  const isCommercialDomain =
    activeSubView.startsWith('com_') || activeSubView.startsWith('ord_');
  const isProductionDomain = activeSubView.startsWith('prd_');
  const isTreasuryDomain = activeSubView.startsWith('trs_');
  const isFinanceDomain = activeSubView.startsWith('fin_');
  const isPayrollAssetsMasterDomain =
    activeSubView.startsWith('pay_') ||
    activeSubView.startsWith('ast_') ||
    activeSubView.startsWith('mst_');

  return (
    <div
      className={`${
        isErpFullScreen
          ? 'fixed inset-0 z-50 bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden'
          : 'flex-1 flex flex-col min-h-0 h-full bg-slate-100 dark:bg-slate-950 overflow-hidden'
      }`}
      dir="rtl"
    >
      {toastMsg && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl shadow-2xl font-bold text-xs flex items-center gap-2 ${
            toastMsg.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          }`}
        >
          {toastMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* TOP ERP SYSTEM TITLE BAR */}
      <div className="bg-slate-900 text-white px-3 md:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-sm shrink-0">
            {selectedCompany.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-xs md:text-sm text-white">{selectedCompany.name}</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                دوره مالی {currentErpState.activeFiscalYear || selectedCompany.activeFiscalYear || '1405'}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  syncStatus === 'synced'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : syncStatus === 'syncing'
                    ? 'bg-blue-500/20 text-blue-200 border-blue-400/30'
                    : syncStatus === 'pending'
                    ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                    : 'bg-rose-500/20 text-rose-200 border-rose-400/40'
                }`}
                title={syncErrorMsg || `سرور: ${getConnectedCentralServerLabel()}`}
              >
                {syncStatus === 'synced'
                  ? `همگام با سرور مرکزی (v${currentErpState._revision || 1})`
                  : syncStatus === 'syncing'
                  ? 'در حال همگام‌سازی...'
                  : syncStatus === 'pending'
                  ? 'تغییرات در صف ارسال به سرور'
                  : 'عدم ارتباط با سرور مرکزی'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono truncate max-w-[340px] sm:max-w-none">
              سرور: {getConnectedCentralServerLabel()} | شناسه: {selectedCompany.id} | کاربر: {currentUser.fullName}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <button
            onClick={() => syncCompanyStateFromServer(selectedCompany.id, selectedCompany.name, { silent: false, force: true })}
            disabled={syncStatus === 'syncing'}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-100 border border-emerald-400/40 text-[11px] font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            title="دریافت آخرین داده‌ها از دیتابیس سرور مرکزی و ارسال تغییرات معوق"
          >
            <RefreshCw size={13} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
            <span>همگام‌سازی با سرور</span>
          </button>

          {/* Switch to Main Program Sidebar Toggle Button */}
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('TOGGLE_ERP_SIDEBAR_SWAP', { detail: { swapped: false } }));
              showToast('success', 'سایدبار اصلی برنامه نمایش داده شد. جهت بازگشت به سایدبار ERP از دکمه بالای سایدبار استفاده فرمایید.');
            }}
            className="px-3 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-400/40 text-[11px] font-black flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
            title="سوییچ به سایدبار اصلی برنامه"
          >
            <ArrowLeftRight size={13} />
            <span className="hidden sm:inline">⇄ سوییچ به سایدبار اصلی برنامه</span>
          </button>

          {/* Backup to Telegram & Bale Bots */}
          <button
            onClick={handleBackupToBot}
            disabled={backingUpToBot}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-400/30 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            title="ارسال آنی بکاپ اختصاصی این شرکت به ربات‌های بله و تلگرام"
          >
            <Bot size={13} className={backingUpToBot ? 'animate-spin' : ''} />
            <span className="hidden md:inline">ارسال بکاپ به بات</span>
          </button>

          {/* Per-Company Isolated Backup & Restore Center */}
          <button
            onClick={openCompanyBackupModal}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            title="مدیریت، دانلود و بازیابی بکاپ اختصاصی این شرکت"
          >
            <Archive size={13} className="text-emerald-400" />
            <span className="hidden md:inline">بکاپ اختصاصی شرکت</span>
          </button>

          {/* Clear / Raw Company Data */}
          <button
            onClick={() => setShowClearConfirmModal(true)}
            className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            title="خام‌سازی داده‌های این شرکت بدون دست‌خوردن دیتابیس اصلی نرم‌افزار"
          >
            <Trash2 size={13} />
            <span className="hidden lg:inline">خام‌سازی شرکت</span>
          </button>

          <button
            onClick={handleSyncSayanBarcodes}
            disabled={syncingBarcodes}
            className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={13} className={syncingBarcodes ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">سینک بارکدهای سایان</span>
          </button>

          <button
            onClick={() => setIsErpFullScreen(prev => !prev)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
            title={isErpFullScreen ? 'خروج از تمام‌صفحه' : 'نمایش تمام‌صفحه مستقل (بدون سایدبار دلکام)'}
          >
            {isErpFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span className="hidden md:inline">{isErpFullScreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه مستقل'}</span>
          </button>

          <button
            onClick={() => setSelectedCompany(null)}
            className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut size={13} />
            <span>تغییر شرکت</span>
          </button>
        </div>
      </div>

      {/* QUICK DESKTOP RIBBON BAR */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
        {quickRibbonShortcuts.map(sc => {
          const Icon = sc.icon;
          const isActive = activeSubView === sc.id;
          return (
            <button
              key={sc.id}
              onClick={() => openSubViewTab(sc.id)}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 shrink-0 transition cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-600 dark:border-indigo-500 shadow-xs'
                  : `${sc.color} dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 hover:opacity-90`
              }`}
            >
              <Icon size={14} />
              <span>{sc.label}</span>
            </button>
          );
        })}
      </div>

      {/* MAIN BODY: RIGHT-HAND DEDICATED ERP SIDEBAR + LEFT WORKSPACE */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* DEDICATED STANDALONE ERP RIGHT SIDEBAR */}
        <aside className="w-full lg:w-72 bg-slate-200/80 dark:bg-slate-900 border-b lg:border-b-0 lg:border-l border-slate-300 dark:border-slate-800 flex flex-col shrink-0 overflow-y-auto max-h-72 lg:max-h-none">
          <div className="p-2.5 bg-slate-300/70 dark:bg-slate-800/80 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between text-xs font-black text-slate-800 dark:text-slate-200 shrink-0">
            <span>منوی جامع سیستم‌های ERP</span>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('TOGGLE_ERP_SIDEBAR_SWAP', { detail: { swapped: false } }));
              }}
              className="text-[10px] text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
              title="نمایش سایدبار اصلی برنامه"
            >
              <ArrowLeftRight size={11} />
              <span>منوی اصلی</span>
            </button>
          </div>

          <div className="divide-y divide-slate-300/70 dark:divide-slate-800">
            {ERP_SIDEBAR_TREE.map(cat => {
              const CatIcon = cat.icon;
              const isExpanded = expandedCategory === cat.id;
              return (
                <div key={cat.id} className="bg-slate-100 dark:bg-slate-900">
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? cat.id : cat.id)}
                    className={`w-full px-3.5 py-2.5 flex items-center justify-between text-right font-black text-xs transition cursor-pointer ${
                      isExpanded
                        ? 'bg-gradient-to-l from-indigo-100 to-slate-200 dark:from-indigo-950/80 dark:to-slate-900 text-indigo-950 dark:text-indigo-200 border-r-4 border-indigo-600'
                        : 'hover:bg-slate-200/70 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <CatIcon size={16} className={cat.color} />
                      <span>{cat.title}</span>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${isExpanded ? 'rotate-180 text-indigo-600' : 'text-slate-400'}`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="bg-[#f8f6f0] dark:bg-slate-950/70 pb-2">
                      {cat.groups.map((grp, gIdx) => (
                        <div key={gIdx}>
                          <div className="px-3 py-1 bg-[#e6dec8] dark:bg-slate-800 text-[10px] font-black text-slate-700 dark:text-slate-300 border-y border-[#d5ccb4] dark:border-slate-700">
                            {grp.groupTitle}
                          </div>
                          <div className="py-1 space-y-0.5 px-1.5">
                            {grp.items.map(sub => {
                              const isSubActive = activeSubView === sub.id;
                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => openSubViewTab(sub.id)}
                                  className={`w-full px-2.5 py-1.5 rounded-lg text-right text-[11px] flex items-center justify-between transition cursor-pointer ${
                                    isSubActive
                                      ? 'bg-indigo-600 text-white font-black shadow-xs'
                                      : 'text-slate-700 dark:text-slate-300 hover:bg-[#ebe4d1] dark:hover:bg-slate-800 font-bold'
                                  }`}
                                >
                                  <span className="truncate">{sub.label}</span>
                                  <ChevronLeft size={12} className={isSubActive ? 'text-white' : 'text-slate-400'} />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* LEFT WORKSPACE AREA (OPEN TABS BAR + ISOLATED ACTIVE MODULE VIEW) */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 min-h-0">
          {/* MDI OPEN TABS BAR */}
          <div className="bg-slate-200/80 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-800 px-2 pt-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
            {openTabs.map(tabId => {
              const isTabActive = activeSubView === tabId;
              return (
                <div
                  key={tabId}
                  onClick={() => setActiveSubView(tabId)}
                  className={`px-3 py-1.5 rounded-t-xl text-xs font-bold flex items-center gap-2 cursor-pointer border-t border-x transition shrink-0 ${
                    isTabActive
                      ? 'bg-slate-50 dark:bg-slate-950 text-indigo-700 dark:text-indigo-300 border-slate-300 dark:border-slate-800 font-black'
                      : 'bg-slate-300/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-200'
                  }`}
                >
                  <span>{SUBVIEW_TITLES[tabId] || tabId}</span>
                  {openTabs.length > 1 && (
                    <button
                      onClick={e => closeSubViewTab(tabId, e)}
                      className="p-0.5 rounded hover:bg-rose-100 hover:text-rose-600"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* ACTIVE SUBVIEW CONTENT CONTAINER (ISOLATED DOMAIN COMPONENTS) */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {isWarehouseDomain && (
              <ErpDomainErrorBoundary moduleTitle="انبارداری، حواله‌ها و رهگیری کارتن">
                <WarehouseModuleView
                  activeSubView={activeSubView}
                  selectedCompany={selectedCompany}
                  erpState={currentErpState}
                  setErpState={setErpState}
                  persistErpState={persistErpState}
                  currentUser={currentUser}
                  showToast={showToast}
                  openSubViewTab={openSubViewTab}
                />
              </ErpDomainErrorBoundary>
            )}

            {isCommercialDomain && (
              <ErpDomainErrorBoundary moduleTitle="بازرگانی، خرید و فروش و دفتر تهران">
                <CommercialTradeModuleView
                  activeSubView={activeSubView}
                  selectedCompany={selectedCompany}
                  erpState={currentErpState}
                  setErpState={setErpState}
                  persistErpState={persistErpState}
                  currentUser={currentUser}
                  showToast={showToast}
                  canCreateSalesFromRemittance={canCreateSalesFromRemittance}
                  canViewFinancialAmounts={canViewFinancialAmounts}
                />
              </ErpDomainErrorBoundary>
            )}

            {isProductionDomain && (
              <ErpDomainErrorBoundary moduleTitle="عملکرد خط تولید، توزین باسکول و فرمول ساخت (BOM)">
                <ProductionBomModuleView
                  activeSubView={activeSubView}
                  selectedCompany={selectedCompany}
                  erpState={currentErpState}
                  setErpState={setErpState}
                  persistErpState={persistErpState}
                  currentUser={currentUser}
                  showToast={showToast}
                  openSubViewTab={openSubViewTab}
                />
              </ErpDomainErrorBoundary>
            )}

            {isTreasuryDomain && (
              <ErpDomainErrorBoundary moduleTitle="خزانه‌داری، بانک و عملیات چک">
                <TreasuryBankingModuleView
                  activeSubView={activeSubView}
                  selectedCompany={selectedCompany}
                  erpState={currentErpState}
                  persistErpState={persistErpState}
                  currentUser={currentUser}
                />
              </ErpDomainErrorBoundary>
            )}

            {isFinanceDomain && (
              <ErpDomainErrorBoundary moduleTitle="مالی و حسابداری">
                <FinancialAccountingModuleView
                  activeSubView={activeSubView}
                  selectedCompany={selectedCompany}
                  erpState={currentErpState}
                  persistErpState={persistErpState}
                  currentUser={currentUser}
                  showToast={showToast}
                  cutoffDateInput={cutoffDateInput}
                  setCutoffDateInput={setCutoffDateInput}
                  importingTrialBalance={importingTrialBalance}
                  handleImportSayanTrialBalance={handleImportSayanTrialBalance}
                  handleToggleCutoverStage={handleToggleCutoverStage}
                />
              </ErpDomainErrorBoundary>
            )}

            {isPayrollAssetsMasterDomain && (
              <ErpDomainErrorBoundary moduleTitle="حقوق و دستمزد، دارایی ثابت و اطلاعات پایه">
                <PayrollAssetsMasterModuleView
                  activeSubView={activeSubView}
                  selectedCompany={selectedCompany}
                  companies={companies}
                  setSelectedCompany={setSelectedCompany}
                  erpState={currentErpState}
                  persistErpState={persistErpState}
                  currentUser={currentUser}
                  cutoffDateInput={cutoffDateInput}
                  setCutoffDateInput={setCutoffDateInput}
                  importingTrialBalance={importingTrialBalance}
                  handleImportSayanTrialBalance={handleImportSayanTrialBalance}
                  handleToggleCutoverStage={handleToggleCutoverStage}
                />
              </ErpDomainErrorBoundary>
            )}
          </div>

          {/* BOTTOM STATUS BAR */}
          <div className="bg-slate-200 dark:bg-slate-900 border-t border-slate-300 dark:border-slate-800 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400 shrink-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-black text-slate-900 dark:text-white">
                {selectedCompany.name} (دیتابیس مرکزی مستقل)
              </span>
              <span>|</span>
              <span>سال مالی فعال: {currentErpState.activeFiscalYear || '1405'}</span>
              <span>|</span>
              <span>بخش فعال: {SUBVIEW_TITLES[activeSubView]}</span>
              {lastSyncedAt && (
                <>
                  <span>|</span>
                  <span className="font-mono">
                    آخرین همگام‌سازی: {new Date(lastSyncedAt).toLocaleTimeString('fa-IR')} (v{currentErpState._revision || 1})
                  </span>
                </>
              )}
            </div>
            <div className="font-mono">
              امروز: {getTodayJalali()} | کاربر: {currentUser.fullName}
            </div>
          </div>
        </main>
      </div>

      {/* MODAL: CLEAR COMPANY DEMO/SAMPLE DATA (RAW INITIALIZATION) */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <Trash2 size={24} />
              </div>
              <div className="flex-1">
                <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                  خام‌سازی داده‌های شرکت «{selectedCompany.name}»
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  آیا اطمینان دارید که می‌خواهید داده‌های این شرکت در ماژول حسابداری و انبار به حالت کاملاً خام و اولیه بازگردد؟
                </p>
              </div>
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
              <div className="font-black flex items-center gap-1.5">
                <CheckCircle2 size={15} />
                تضمین عدم دست‌خوردن دیتابیس اصلی نرم‌افزار:
              </div>
              <p className="text-[11px] leading-relaxed">
                این عملیات <strong>فقط اقلام، خطوط، انبارها، فرمول‌های ساخت و اسناد همین شرکت</strong> را صفر و خام می‌کند. دیتابیس اصلی نرم‌افزار (سفارشات، کاربران، چت‌ها، مجوزهای خروج و تنظیمات کلی) کاملاً محفوظ و دست‌نخورده باقی می‌ماند.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowClearConfirmModal(false)}
                disabled={clearingData}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                انصراف
              </button>
              <button
                onClick={handleClearCompanyData}
                disabled={clearingData}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Trash2 size={14} className={clearingData ? 'animate-spin' : ''} />
                <span>{clearingData ? 'در حال پاکسازی...' : 'بله، داده‌های این شرکت خام شود'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PER-COMPANY ISOLATED BACKUP & RESTORE CENTER */}
      {showCompanyBackupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-slate-50 dark:bg-slate-950/60">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Archive size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-sm text-slate-900 dark:text-white truncate">
                    مرکز بکاپ و بازیابی اختصاصی «{selectedCompany.name}»
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    بکاپ و بازیابی کاملاً مجزا بدون تداخل با سایر شرکت‌ها
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCompanyBackupModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
              {backupModalStatus && (
                <div
                  className={`p-3 rounded-2xl border text-xs font-bold flex items-start gap-2 ${
                    backupModalStatus.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : backupModalStatus.type === 'error'
                      ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                      : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
                  }`}
                >
                  {backupModalStatus.type === 'success' ? (
                    <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  ) : backupModalStatus.type === 'error' ? (
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  ) : (
                    <RefreshCw size={16} className="shrink-0 mt-0.5 animate-spin" />
                  )}
                  <span className="flex-1 leading-relaxed">{backupModalStatus.text}</span>
                </div>
              )}

              {/* Quick Export / Snapshot Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={handleCreateIsolatedSnapshot}
                  disabled={creatingCompanyBackup}
                  className="min-h-[44px] px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <History size={16} className={creatingCompanyBackup ? 'animate-spin' : ''} />
                  <span>{creatingCompanyBackup ? 'در حال ایجاد نسخه فشرده...' : 'ثبت نسخه بکاپ آنی روی سرور'}</span>
                </button>

                <button
                  onClick={handleBackupToBot}
                  disabled={backingUpToBot}
                  className="min-h-[44px] px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <Bot size={16} className={backingUpToBot ? 'animate-spin' : ''} />
                  <span>{backingUpToBot ? 'در حال ارسال...' : 'ارسال بکاپ فشرده این شرکت به بات'}</span>
                </button>

                <button
                  onClick={() => handleDownloadBackup('zip')}
                  className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <FileArchive size={15} className="text-indigo-600 dark:text-indigo-400" />
                  <span>دانلود بکاپ فشرده (ZIP)</span>
                </button>

                <button
                  onClick={() => handleDownloadBackup('json')}
                  className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Download size={15} className="text-emerald-600 dark:text-emerald-400" />
                  <span>دانلود مستقیم فایل (JSON)</span>
                </button>
              </div>

              {/* Upload Backup File For This Company Only */}
              <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-black text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Upload size={14} className="text-indigo-600" />
                      <span>بازیابی از فایل بکاپ اختصاصی شرکت</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      فرمت‌های مجاز: <span className="font-mono">.zip</span>، <span className="font-mono">.json.gz</span> یا <span className="font-mono">.json</span> (پیش از بازیابی، بکاپ ایمنی خودکار گرفته می‌شود)
                    </p>
                  </div>
                  <label className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                    <Upload size={14} />
                    <span>انتخاب فایل بکاپ</span>
                    <input
                      type="file"
                      accept=".json,.gz,.zip,application/json,application/zip,application/gzip"
                      onChange={handleUploadBackupFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>

                {pendingUploadBackup && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 space-y-2.5">
                    <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      فایل آماده بازیابی روی شرکت «{selectedCompany.name}»: <span className="font-mono">{pendingUploadBackup.fileName}</span>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pendingUploadBackup.allowCrossCompany}
                        onChange={e =>
                          setPendingUploadBackup(prev => (prev ? { ...prev, allowCrossCompany: e.target.checked } : null))
                        }
                        className="rounded"
                      />
                      <span>در صورتی که فایل متعلق به شرکت دیگری است اجازه انتقال به این شرکت داده شود</span>
                    </label>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setPendingUploadBackup(null)}
                        disabled={restoringCompanyBackup}
                        className="px-3 py-1.5 rounded-lg border border-amber-300 text-xs font-bold text-amber-800 dark:text-amber-200 cursor-pointer"
                      >
                        انصراف
                      </button>
                      <button
                        onClick={handleConfirmUploadedBackupRestore}
                        disabled={restoringCompanyBackup}
                        className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw size={13} className={restoringCompanyBackup ? 'animate-spin' : ''} />
                        <span>{restoringCompanyBackup ? 'در حال بازیابی...' : 'تایید و بازیابی فایل'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Saved Per-Company Snapshots Archive */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck size={15} className="text-emerald-600" />
                    <span>آرشیو بکاپ‌های خودکار و دستی این شرکت ({companyBackupsList.length})</span>
                  </h4>
                  <button
                    onClick={() => loadCompanyBackupsList(selectedCompany.id)}
                    disabled={loadingCompanyBackups}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={12} className={loadingCompanyBackups ? 'animate-spin' : ''} />
                    <span>بروزرسانی لیست</span>
                  </button>
                </div>

                {loadingCompanyBackups && companyBackupsList.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 font-bold">در حال دریافت آرشیو بکاپ‌های شرکت...</div>
                ) : companyBackupsList.length === 0 ? (
                  <div className="text-center py-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 font-bold">
                    هنوز نسخه پشتیبانی در آرشیو اختصاصی این شرکت ذخیره نشده است. با دکمه بالا می‌توانید اولین بکاپ فشرده را ایجاد کنید.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {companyBackupsList.map(bkp => {
                      const kindLabel =
                        bkp.backupKind === 'auto'
                          ? 'خودکار'
                          : bkp.backupKind === 'pre_restore'
                          ? 'ایمنی پیش از بازیابی'
                          : bkp.backupKind === 'pre_clear'
                          ? 'ایمنی پیش از خام‌سازی'
                          : bkp.backupKind === 'bot'
                          ? 'ارسال به بات'
                          : 'دستی';
                      const sizeKb = (bkp.compressedSizeBytes / 1024).toFixed(1);
                      const isConfirming = confirmRestoreFileName === bkp.fileName;

                      return (
                        <div
                          key={bkp.fileName}
                          className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 flex flex-col gap-2"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black">
                                  {kindLabel}
                                </span>
                                <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                                  {bkp.fileName}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-3 flex-wrap font-mono">
                                <span>{bkp.createdDateJalali || new Date(bkp.createdAtMs).toLocaleString('fa-IR')}</span>
                                <span>حجم فشرده: {sizeKb} KB</span>
                                {bkp.recordCounts && (
                                  <span>
                                    کارتن: {bkp.recordCounts.cartonLabels ?? 0} | اسناد: {bkp.recordCounts.vouchers ?? 0} | کالا: {bkp.recordCounts.items ?? 0}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleDownloadBackup(bkp.format === 'zip' ? 'zip' : 'gz', bkp.fileName)}
                                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Download size={13} />
                                <span>دانلود</span>
                              </button>
                              {!bkp.fileName.endsWith('.zip') && (
                                <button
                                  onClick={() => setConfirmRestoreFileName(isConfirming ? null : bkp.fileName)}
                                  className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-black flex items-center gap-1 cursor-pointer"
                                >
                                  <RotateCcw size={13} />
                                  <span>بازیابی</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {isConfirming && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-50/70 dark:bg-amber-950/20 p-2.5 rounded-xl">
                              <span className="text-[11px] font-bold text-amber-900 dark:text-amber-200">
                                داده‌های فعلی شرکت «{selectedCompany.name}» با این نسخه جایگزین شود؟ (نسخه فعلی پیش از بازیابی ذخیره می‌شود)
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                <button
                                  onClick={() => setConfirmRestoreFileName(null)}
                                  disabled={restoringCompanyBackup}
                                  className="px-2.5 py-1 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-600 cursor-pointer"
                                >
                                  لغو
                                </button>
                                <button
                                  onClick={() => handleRestoreFromSnapshotFile(bkp.fileName)}
                                  disabled={restoringCompanyBackup}
                                  className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black cursor-pointer disabled:opacity-50"
                                >
                                  {restoringCompanyBackup ? 'در حال بازیابی...' : 'تایید نهایی بازیابی'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IndustrialAccountingErpModule;
