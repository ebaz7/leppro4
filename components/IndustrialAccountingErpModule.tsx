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
  Trash2
} from 'lucide-react';
import { apiCall } from '../services/apiService';
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
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
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
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sayan Cutover & Barcode Sync Shared Handlers
  const [cutoffDateInput, setCutoffDateInput] = useState<string>('1405/08/20');
  const [syncingBarcodes, setSyncingBarcodes] = useState<boolean>(false);
  const [importingTrialBalance, setImportingTrialBalance] = useState<boolean>(false);
  const [backingUpToBot, setBackingUpToBot] = useState<boolean>(false);
  const [clearingData, setClearingData] = useState<boolean>(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);

  const handleBackupToBot = async () => {
    if (!selectedCompany) return;
    setBackingUpToBot(true);
    try {
      const res = await apiCall<{ success: boolean; message: string; filename?: string; botResult?: any }>(
        '/api/industrial-erp/backup-to-bot',
        'POST',
        { companyId: selectedCompany.id }
      );
      if (res && res.success) {
        showToast('success', `بکاپ دیتابیس حسابداری و انبار با موفقیت ایجاد و به بات ارسال گردید (${res.filename || ''})`);
      } else {
        showToast('error', res?.message || 'خطا در ارسال فایل پشتیبان به بات');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'خطا در برقراری ارتباط با سرور پشتیبان‌گیری');
    } finally {
      setBackingUpToBot(false);
    }
  };

  const handleDownloadBackup = () => {
    if (!selectedCompany) return;
    window.open(`/api/industrial-erp/download-backup?companyId=${selectedCompany.id}`, '_blank');
    showToast('success', 'فایل JSON پشتیبان اختصاصی شرکت دانلود شد');
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
            id: sc.id || matchedErp?.id || makeStableCompanyId(sc.name),
            name: sc.name,
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
      } else if (erpList.length > 0) {
        setCompanies(erpList);
      }
    } catch {
      // Quietly ignore network failures in offline intranet environment
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCompany = (comp: ErpCompanySummary) => {
    setSelectedCompany(comp);
    try {
      localStorage.setItem('delcom_erp_selected_company', JSON.stringify(comp));
      localStorage.setItem('delcom_erp_last_selected_company_id', comp.id);
      localStorage.setItem('delcom_erp_last_selected_company_name', comp.name);
    } catch {}

    // 1. Instant 0ms offline hydration - NEVER show a blocking spinner
    const local = getCachedCompanyErpState(comp.id, comp.name);
    setErpState(local);
    setLoading(false);

    // 2. Non-blocking silent background update from local/central server
    apiCall<IndustrialErpState>(
      `/industrial-erp/state?companyId=${encodeURIComponent(comp.id)}`
    )
      .then(serverData => {
        if (serverData && Array.isArray(serverData.items) && serverData.items.length > 0) {
          setErpState(serverData);
          try {
            localStorage.setItem(`delcom_erp_state_${comp.id}`, JSON.stringify(serverData));
          } catch {}
        }
      })
      .catch(() => {
        // Intranet / Offline mode: server unavailable or offline, keep local state smoothly
      });
  };

  useEffect(() => {
    fetchCompaniesList();
  }, [settings?.companies, settings?.companyNames]);

  useEffect(() => {
    if (selectedCompany) {
      if (!erpState || erpState.companyId !== selectedCompany.id) {
        const local = getCachedCompanyErpState(selectedCompany.id, selectedCompany.name);
        setErpState(local);
      }
      setLoading(false);

      // Non-blocking background sync
      apiCall<IndustrialErpState>(
        `/industrial-erp/state?companyId=${encodeURIComponent(selectedCompany.id)}`
      )
        .then(serverData => {
          if (serverData && Array.isArray(serverData.items) && serverData.items.length > 0) {
            setErpState(serverData);
            try {
              localStorage.setItem(`delcom_erp_state_${selectedCompany.id}`, JSON.stringify(serverData));
            } catch {}
          }
        })
        .catch(() => {
          // Intranet / Offline safe
        });
    }
  }, [selectedCompany?.id]);

  const persistErpState = async (nextState: IndustrialErpState, successToast?: string) => {
    if (!selectedCompany) return;
    // 1. Immediate memory update
    setErpState(nextState);
    // 2. Immediate local storage persistence (Never lose data even with no network)
    try {
      localStorage.setItem(`delcom_erp_state_${selectedCompany.id}`, JSON.stringify(nextState));
    } catch {}

    // 3. Background server save
    try {
      setSaving(true);
      await apiCall('/industrial-erp/save-state', 'POST', {
        companyId: selectedCompany.id,
        state: nextState
      });
      if (successToast) showToast('success', successToast);
      fetchCompaniesList();
    } catch {
      // Offline fallback
      if (successToast) {
        showToast('success', `${successToast} (ذخیره در حافظه محلی آفلاین)`);
      }
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
              </div>
              <p className="text-xs md:text-sm text-slate-300 mt-1.5 leading-relaxed">
                فهرست زیر مستقیماً از شرکت‌های تعریف‌شده در بخش «تنظیمات سیستم» خوانده می‌شود. شرکت مورد نظر را جهت ورود به محیط مستقل حسابداری انتخاب نمایید.
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
    { id: 'prd_line_perf', label: 'عملکرد خط و باسکول (چاپ لیبل)', icon: Scale, color: 'text-orange-700 bg-orange-50 border-orange-200' },
    { id: 'wh_sales_remittance', label: 'حواله فروش کارخانه (خروج بدون فی)', icon: Truck, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { id: 'wh_receipt_production', label: 'رسید تحویل از خط تولید', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { id: 'wh_inter_remittance', label: 'حواله بین‌انبار (انتقال)', icon: ArrowLeftRight, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { id: 'wh_inter_receipt', label: 'رسید حواله بین‌انبار (تایید ورود)', icon: CheckCircle2, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
    { id: 'wh_tracking', label: 'رهگیری جامع کارتن با کد ارجاع / بارکد', icon: Layers, color: 'text-teal-700 bg-teal-50 border-teal-200' },
    { id: 'prd_lines', label: 'تعریف خطوط تولید', icon: Factory, color: 'text-orange-600 bg-orange-50 border-orange-200' },
    { id: 'prd_items', label: 'تعریف کالاها و اوزان دوک/کارتن', icon: Package, color: 'text-slate-700 bg-slate-100 border-slate-300' },
    { id: 'wh_warehouses', label: 'تعریف انبارها و تخصیص', icon: Boxes, color: 'text-teal-600 bg-teal-50 border-teal-200' },
    { id: 'prd_archive', label: 'بایگانی تولید', icon: FolderKanban, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { id: 'wh_archive', label: 'بایگانی اسناد انبار', icon: FolderKanban, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
    { id: 'wh_stock_report', label: 'گزارش موجودی کالا', icon: Boxes, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
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
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-sm">
            {selectedCompany.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-xs md:text-sm text-white">{selectedCompany.name}</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                دوره مالی {currentErpState.activeFiscalYear || selectedCompany.activeFiscalYear || '1405'}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                <Layers size={11} />
                <span>کامپوننت‌های ماژولار مجزا</span>
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              DELKAM ENTERPRISE RESOURCE PLANNING — کاربر فعال: {currentUser.fullName}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            title="تهیه و ارسال آنی بکاپ دیتابیس حسابداری و انبار به ربات‌های بله و تلگرام"
          >
            <Bot size={13} className={backingUpToBot ? 'animate-spin' : ''} />
            <span className="hidden md:inline">ارسال بکاپ به بات</span>
          </button>

          {/* Download JSON Backup */}
          <button
            onClick={handleDownloadBackup}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            title="دانلود فایل پشتیبان داده‌های این شرکت"
          >
            <Download size={13} />
            <span className="hidden md:inline">دانلود بکاپ</span>
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

          {/* BOTTOM STATUS BAR (LIKE SAYAN ENTERPRISE STATUS BAR) */}
          <div className="bg-slate-200 dark:bg-slate-900 border-t border-slate-300 dark:border-slate-800 px-4 py-1.5 flex flex-wrap items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 shrink-0">
            <div className="flex items-center gap-3">
              <span className="font-black text-slate-900 dark:text-white flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                {selectedCompany.name} (دیتابیس مستقل)
              </span>
              <span>|</span>
              <span>سال مالی فعال: {currentErpState.activeFiscalYear || '1405'}</span>
              <span>|</span>
              <span>بخش فعال: {SUBVIEW_TITLES[activeSubView]}</span>
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
    </div>
  );
};

export default IndustrialAccountingErpModule;
