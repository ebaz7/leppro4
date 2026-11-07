import React, { useState, useEffect, useMemo } from 'react';
import { 
    RefreshCw, CheckCircle2, AlertTriangle, Play, Settings, 
    ShieldCheck, Clock, Layers, ArrowRight, Eye, ChevronDown, 
    ChevronUp, Sparkles, Filter, Check, AlertCircle, FileText,
    Building2, Hash, Calendar, DollarSign, ArrowLeftRight, Loader2,
    Package, Database, CheckSquare, Search, Sliders, ExternalLink,
    FileSpreadsheet, ArrowUpRight, History, X, CreditCard, FileCheck
} from 'lucide-react';
import { formatDate } from '../constants';
import { User, UserRole } from '../types';
import { getRolePermissions } from '../services/authService';
import { getEffectiveApiUrl, getAuthToken } from '../services/apiService';
import SayanChequeReceiptsTab from './SayanChequeReceiptsTab';

interface PendingRequest {
    doc53Id: string;
    fiscalYear: string;
    docNo: string;
    archiveCode?: string;
    subNo: string;
    subCode: string;
    docDate: string;
    note: string;
    descText: string;
    regDate: string;
    itemsCount: number;
    totalQty: number;
    detectedVendor: {
        personCode: string | null;
        personName: string | null;
        confidence: number;
        reason: string;
    };
    isReady: boolean;
}

interface ArchivedRequest {
    doc53Id: string;
    fiscalYear: string;
    docNo: string;
    archiveCode?: string;
    subNo: string;
    subCode: string;
    docDate: string;
    note: string;
    descText: string;
    regDate: string;
    itemsCount: number;
    totalQty: number;
    hasPreInvoice: boolean;
    preInvoiceDocNo: string | null;
    preInvoiceDocId: string | null;
    preInvoiceDate: string | null;
    preInvoiceVendorCode: string | null;
    preInvoiceVendorName: string | null;
}

interface RequestItemDetail {
    ItemRowId: string;
    ItemCode: string;
    Qty: number;
    SecondaryQty: number;
    TrackingCode: string;
    ItemDesc: string;
    ItemName: string;
    UnitName: string;
    WarehouseCode: string;
}

interface AutomationConfig {
    enabled: boolean;
    intervalMinutes: number;
    defaultFee: number;
    autoVendorMatching: boolean;
    dryRunMode: boolean;
    fiscalYear: string;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    lastRunSummary: any;
}

interface AutomationLog {
    id: string;
    timestamp: string;
    action: string;
    doc53Id?: string;
    doc53No?: string;
    note?: string;
    vendorCode?: string;
    vendorName?: string;
    itemsCount?: number;
    created57DocId?: string;
    created57DocNo?: string;
    fee?: number;
    user?: string;
    success: boolean;
    error?: string;
}

interface Props {
    currentUser: User;
    settings?: any;
}

export const SayanRegistrationsModule: React.FC<Props> = ({ currentUser, settings }) => {
    // Main module sub-navigation: Tab 1 = Purchase Pre-Invoices (53 -> 57), Tab 2 = Cheque Receipts (Bursary 11), Tab 3 = Other future Sayan registrations
    const perms = useMemo(() => {
        return getRolePermissions(currentUser?.role, settings || null, currentUser);
    }, [currentUser, settings]);

    const canSayanRegisterCheque = currentUser?.role === UserRole.ADMIN || perms.canSayanRegisterCheque === true;
    const canSayanPreInvoices = currentUser?.role === UserRole.ADMIN || perms.canSayanPreInvoices === true;
    const canAccessChequeReceiptsTab = currentUser?.role === UserRole.ADMIN || 
        perms.canAccessChequeReceipts === true || 
        canSayanRegisterCheque || 
        perms.canSayanEditReceipt === true || 
        perms.canSayanDeleteReceipt === true || 
        perms.canSayanApproveAccounting === true || 
        perms.canSayanApproveCeo === true ||
        perms.canSayanFinalApprove === true ||
        (currentUser as any)?.canSayanFinalApprove === true;

    const canAccessSayanRegistrations = currentUser?.role === UserRole.ADMIN || 
        perms.canAccessSayanRegistrations === true || 
        canSayanPreInvoices || 
        canAccessChequeReceiptsTab;

    const initialTab = useMemo(() => {
        if (canSayanPreInvoices) {
            return 'PURCHASE_PREINVOICES';
        }
        if (canAccessChequeReceiptsTab) {
            return 'CHEQUE_RECEIPTS';
        }
        return 'FUTURE_DOCS';
    }, [canSayanPreInvoices, canAccessChequeReceiptsTab]);

    const [mainSubTab, setMainSubTab] = useState<'PURCHASE_PREINVOICES' | 'CHEQUE_RECEIPTS' | 'FUTURE_DOCS'>(initialTab);

    useEffect(() => {
        setMainSubTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        const handleSubTabEvent = (e: any) => {
            if (e.detail === 'CHEQUE_RECEIPTS' || e.detail === 'CHEQUE' || e.detail === 'RECEIPTS') {
                if (canAccessChequeReceiptsTab) {
                    setMainSubTab('CHEQUE_RECEIPTS');
                }
            } else if (e.detail === 'PURCHASE_PREINVOICES') {
                if (canSayanPreInvoices) {
                    setMainSubTab('PURCHASE_PREINVOICES');
                }
            }
        };
        window.addEventListener('SAYAN_SUB_TAB_CHANGE', handleSubTabEvent);
        return () => window.removeEventListener('SAYAN_SUB_TAB_CHANGE', handleSubTabEvent);
    }, [canAccessChequeReceiptsTab, canSayanPreInvoices]);

    // State for Purchase Pre-Invoices automation
    const [selectedFiscalYear, setSelectedFiscalYear] = useState<'4' | '3'>('4');
    const [loading, setLoading] = useState(false);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [pendingList, setPendingList] = useState<PendingRequest[]>([]);
    const [archivedList, setArchivedList] = useState<ArchivedRequest[]>([]);
    const [config, setConfig] = useState<AutomationConfig | null>(null);
    const [logs, setLogs] = useState<AutomationLog[]>([]);
    const [activeTab, setActiveTab] = useState<'READY' | 'MANUAL' | 'ARCHIVED' | 'LOGS'>('READY');
    const [searchQuery, setSearchQuery] = useState('');
    const [logDateFilter, setLogDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH'>('ALL');
    const [logStatusFilter, setLogStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'DRY_RUN'>('ALL');
    
    // Item Details Modal
    const [selectedDocForItems, setSelectedDocForItems] = useState<{ 
        docNo: string; 
        fiscalYear: string; 
        archiveCode?: string; 
        doc53Id?: string; 
        note?: string;
        itemsCount?: number;
    } | null>(null);
    const [docItems, setDocItems] = useState<RequestItemDetail[]>([]);

    // Vendor override modal
    const [editingDoc, setEditingDoc] = useState<PendingRequest | null>(null);
    const [overrideVendorCode, setOverrideVendorCode] = useState('');
    const [overrideVendorName, setOverrideVendorName] = useState('');
    const [sayanPersons, setSayanPersons] = useState<Array<{ personCode: string; fullName: string; nationalId?: string; mobile?: string }>>([]);
    const [sayanPersonsLoading, setSayanPersonsLoading] = useState(false);
    const [personSearchQuery, setPersonSearchQuery] = useState('');

    // Settings drawer / expandable
    const [showConfigPanel, setShowConfigPanel] = useState(false);
    const [configForm, setConfigForm] = useState({
        intervalMinutes: 60,
        dryRunMode: false,
        autoVendorMatching: true,
        defaultFee: 1
    });

    // Auto Refresh Rate state (Defaults to OFF or 30M based on user preference)
    const [autoRefreshInterval, setAutoRefreshInterval] = useState<'OFF' | '5M' | '15M' | '30M'>('OFF');

    // Feedback banner
    const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    // Sayan Real Document (57 & 53) Inspector Modal State
    const [sayanInspectModal, setSayanInspectModal] = useState<{
        isOpen: boolean;
        loading: boolean;
        doc57No: string;
        fiscalYear: string;
        data: any | null;
        error: string | null;
    }>({
        isOpen: false,
        loading: false,
        doc57No: '',
        fiscalYear: '4',
        data: null,
        error: null
    });

    const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 5000);
    };

    const fetchApiJson = async (urlPath: string, options: RequestInit = {}) => {
        const token = getAuthToken();
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {})
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const fullUrl = getEffectiveApiUrl(urlPath);
        const res = await fetch(fullUrl, {
            ...options,
            headers
        });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const rawText = await res.text().catch(() => '');
            console.error(`Non-JSON response from ${urlPath}:`, rawText.slice(0, 150));
            return { success: false, error: `پاسخ دریافت شده از سرور معتبر نبود (کد وضعیت ${res.status}).` };
        }
        return await res.json();
    };

    const handleInspectSayanDoc = async (doc57No: string, fiscalYear: string = selectedFiscalYear) => {
        if (!doc57No) return;
        setSayanInspectModal({
            isOpen: true,
            loading: true,
            doc57No,
            fiscalYear,
            data: null,
            error: null
        });
        try {
            const data = await fetchApiJson(`/api/sayan/order-automation/sayan-doc/${doc57No}?fiscalYear=${fiscalYear}`);
            if (data.success) {
                setSayanInspectModal(prev => ({ ...prev, loading: false, data }));
            } else {
                setSayanInspectModal(prev => ({ ...prev, loading: false, error: data.error || 'خطا در دریافت اطلاعات سند از دیتابیس سایان' }));
            }
        } catch (err: any) {
            setSayanInspectModal(prev => ({ ...prev, loading: false, error: err.message || 'خطا در ارتباط با سرور' }));
        }
    };

    const fetchStatusAndData = async (targetFy?: '4' | '3', isSilent = false, forceRefresh = false) => {
        const fy = targetFy || selectedFiscalYear;
        if (!isSilent) {
            setLoading(true);
        }
        try {
            // Status & config
            const statusData = await fetchApiJson('/api/sayan/order-automation/status');
            if (statusData && statusData.success) {
                setConfig(statusData.config);
                setConfigForm({
                    intervalMinutes: statusData.config?.intervalMinutes || 60,
                    dryRunMode: statusData.config?.dryRunMode || false,
                    autoVendorMatching: statusData.config?.autoVendorMatching ?? true,
                    defaultFee: statusData.config?.defaultFee || 1
                });
                if (statusData.recentLogs) {
                    setLogs(statusData.recentLogs);
                }
            } else if (statusData && statusData.error) {
                if (!isSilent) showToast('خطا در دریافت وضعیت اتوماسیون: ' + statusData.error, 'error');
            }

            // Pending list (در جریان - strictly requests without pre-invoices)
            const refreshParam = forceRefresh ? '&forceRefresh=true' : '';
            const pendingData = await fetchApiJson(`/api/sayan/order-automation/pending?fiscalYear=${fy}${refreshParam}`);
            if (pendingData && pendingData.success) {
                setPendingList(pendingData.items || []);
            } else if (pendingData && pendingData.error) {
                if (!isSilent) showToast('خطا در دریافت لیست درخواست‌های معلق: ' + pendingData.error, 'error');
            }

            // Archived list (بایگانی - requests that already have pre-invoice 57 issued)
            const archivedData = await fetchApiJson(`/api/sayan/order-automation/archived?fiscalYear=${fy}${refreshParam}`);
            if (archivedData && archivedData.success) {
                setArchivedList(archivedData.items || []);
            } else if (archivedData && archivedData.error) {
                if (!isSilent) showToast('خطا در دریافت لیست درخواست‌های بایگانی: ' + archivedData.error, 'error');
            }
        } catch (err: any) {
            if (!isSilent) {
                console.error('Failed to load Sayan registrations data:', err);
                showToast('خطا در دریافت اطلاعات از سرور سایان: ' + (err.message || 'نامشخص'), 'error');
            }
        } finally {
            if (!isSilent) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        fetchStatusAndData(selectedFiscalYear, false);
    }, [selectedFiscalYear]);

    // Optional user-configured background silent refresher (No screen flash / spinner)
    useEffect(() => {
        if (autoRefreshInterval === 'OFF') return;
        const minutes = autoRefreshInterval === '5M' ? 5 : autoRefreshInterval === '15M' ? 15 : 30;
        const interval = setInterval(() => {
            fetchStatusAndData(selectedFiscalYear, true); // Silent background fetch
        }, minutes * 60 * 1000);

        return () => clearInterval(interval);
    }, [autoRefreshInterval, selectedFiscalYear]);

    const readyItems = useMemo(() => pendingList.filter(item => item.isReady), [pendingList]);
    const manualItems = useMemo(() => pendingList.filter(item => !item.isReady), [pendingList]);

    const filteredReady = useMemo(() => {
        if (!searchQuery.trim()) return readyItems;
        const q = searchQuery.toLowerCase().trim();
        return readyItems.filter(item => 
            item.docNo?.toLowerCase().includes(q) ||
            item.note?.toLowerCase().includes(q) ||
            item.detectedVendor?.personName?.toLowerCase().includes(q) ||
            item.detectedVendor?.personCode?.toLowerCase().includes(q)
        );
    }, [readyItems, searchQuery]);

    const filteredManual = useMemo(() => {
        if (!searchQuery.trim()) return manualItems;
        const q = searchQuery.toLowerCase().trim();
        return manualItems.filter(item => 
            item.docNo?.toLowerCase().includes(q) ||
            item.note?.toLowerCase().includes(q) ||
            item.descText?.toLowerCase().includes(q)
        );
    }, [manualItems, searchQuery]);

    const filteredArchived = useMemo(() => {
        if (!searchQuery.trim()) return archivedList;
        const q = searchQuery.toLowerCase().trim();
        return archivedList.filter(item => 
            item.docNo?.toLowerCase().includes(q) ||
            item.note?.toLowerCase().includes(q) ||
            item.preInvoiceDocNo?.toLowerCase().includes(q) ||
            item.preInvoiceVendorName?.toLowerCase().includes(q) ||
            item.preInvoiceVendorCode?.toLowerCase().includes(q)
        );
    }, [archivedList, searchQuery]);

    const filteredLogs = useMemo(() => {
        let result = logs;
        
        // Date filter
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
        const startOfWeek = startOfToday - (7 * 24 * 60 * 60 * 1000);
        const startOfMonth = startOfToday - (30 * 24 * 60 * 60 * 1000);

        if (logDateFilter === 'TODAY') {
            result = result.filter(l => new Date(l.timestamp).getTime() >= startOfToday);
        } else if (logDateFilter === 'YESTERDAY') {
            result = result.filter(l => {
                const t = new Date(l.timestamp).getTime();
                return t >= startOfYesterday && t < startOfToday;
            });
        } else if (logDateFilter === 'WEEK') {
            result = result.filter(l => new Date(l.timestamp).getTime() >= startOfWeek);
        } else if (logDateFilter === 'MONTH') {
            result = result.filter(l => new Date(l.timestamp).getTime() >= startOfMonth);
        }

        // Status filter
        if (logStatusFilter === 'SUCCESS') {
            result = result.filter(l => l.success && !l.action?.includes('DRY_RUN'));
        } else if (logStatusFilter === 'FAILED') {
            result = result.filter(l => !l.success);
        } else if (logStatusFilter === 'DRY_RUN') {
            result = result.filter(l => l.action?.includes('DRY_RUN'));
        }

        // Text search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            result = result.filter(l => 
                l.doc53No?.toLowerCase().includes(q) ||
                l.created57DocNo?.toLowerCase().includes(q) ||
                l.vendorName?.toLowerCase().includes(q) ||
                l.vendorCode?.toLowerCase().includes(q) ||
                l.note?.toLowerCase().includes(q) ||
                l.user?.toLowerCase().includes(q)
            );
        }

        return result;
    }, [logs, logDateFilter, logStatusFilter, searchQuery]);

    const logStats = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const todayLogs = logs.filter(l => new Date(l.timestamp).getTime() >= startOfToday);
        const successfulToday = todayLogs.filter(l => l.success && !l.action?.includes('DRY_RUN')).length;
        const failedToday = todayLogs.filter(l => !l.success).length;
        const dryRunsToday = todayLogs.filter(l => l.action?.includes('DRY_RUN')).length;
        const totalItemsConvertedToday = todayLogs
            .filter(l => l.success && !l.action?.includes('DRY_RUN'))
            .reduce((acc, cur) => acc + (cur.itemsCount || 0), 0);

        return {
            todayTotal: todayLogs.length,
            successfulToday,
            failedToday,
            dryRunsToday,
            totalItemsConvertedToday
        };
    }, [logs]);

    const parseSafeJson = async (res: Response) => {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return await res.json();
        }
        const text = await res.text();
        return { success: false, error: text.slice(0, 150) || `خطای سرور با کد ${res.status}` };
    };

    const handleToggleAutomation = async () => {
        if (!config) return;
        const newEnabled = !config.enabled;
        setActionLoading('toggle');
        try {
            const data = await fetchApiJson('/api/sayan/order-automation/config', {
                method: 'POST',
                body: JSON.stringify({ enabled: newEnabled })
            });
            if (data.success) {
                setConfig(data.config);
                showToast(newEnabled ? 'اتوماسیون ساعتی با موفقیت فعال شد.' : 'اتوماسیون ساعتی غیرفعال شد.', 'success');
            } else {
                showToast(data.error || data.message || 'خطا در تغییر وضعیت اتوماسیون', 'error');
            }
        } catch (err: any) {
            showToast('خطای شبکه: ' + err.message, 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleSaveConfig = async () => {
        setActionLoading('save_config');
        try {
            const data = await fetchApiJson('/api/sayan/order-automation/config', {
                method: 'POST',
                body: JSON.stringify(configForm)
            });
            if (data.success) {
                setConfig(data.config);
                setShowConfigPanel(false);
                showToast('تنظیمات اتوماسیون با موفقیت ذخیره شد.', 'success');
            } else {
                showToast(data.error || data.message || 'خطا در ذخیره تنظیمات', 'error');
            }
        } catch (err: any) {
            showToast('خطای شبکه: ' + err.message, 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleRunNow = async (dryRun: boolean = false) => {
        setActionLoading(dryRun ? 'run_dry' : 'run_live');
        try {
            const data = await fetchApiJson('/api/sayan/order-automation/run-now', {
                method: 'POST',
                body: JSON.stringify({
                    dryRun,
                    fiscalYear: selectedFiscalYear,
                    triggeredBy: currentUser?.fullName || currentUser?.username || 'کاربر سیستم'
                })
            });
            if (data.success) {
                const summary = data.summary || {};
                const converted = summary.convertedCount ?? summary.converted ?? 0;
                const total = summary.readyToConvert ?? summary.totalPending ?? summary.processed ?? 0;
                const errors = summary.failedCount ?? summary.errors ?? 0;
                showToast(
                    `عملیات انجام شد: ${total} سند بررسی شد | ${converted} پیش‌فاکتور جدید صادر شد ${errors > 0 ? `| ${errors} خطا` : ''}`,
                    errors > 0 ? 'info' : 'success'
                );
                await fetchStatusAndData(selectedFiscalYear, false, true);
            } else {
                showToast(data.error || data.message || 'خطا در اجرای فرآیند', 'error');
            }
        } catch (err: any) {
            showToast('خطای شبکه: ' + err.message, 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleConvertSingle = async (doc: PendingRequest, vendorCode: string, vendorName: string, dryRun: boolean = false) => {
        if (!vendorCode) {
            showToast('لطفاً ابتدا کد تفصیلی تامین‌کننده را مشخص نمایید.', 'error');
            return;
        }

        setActionLoading(`convert_${doc.doc53Id}`);
        try {
            const data = await fetchApiJson('/api/sayan/order-automation/convert-single', {
                method: 'POST',
                body: JSON.stringify({
                    doc53Id: doc.doc53Id,
                    vendorCode,
                    vendorName,
                    dryRun,
                    isDryRun: dryRun,
                    requestedBy: currentUser?.fullName || currentUser?.username || 'کاربر سیستم'
                })
            });
            if (data.success) {
                if (dryRun) {
                    showToast(`[شبیه‌سازی] پیش‌فاکتور برای سند ${doc.docNo} با موفقیت اعتبارسنجی شد.`, 'info');
                } else {
                    showToast(`پیش‌فاکتور جدید با شماره ${data.createdDocNo} در سایان صادر شد و سند بایگانی گردید.`, 'success');
                    setEditingDoc(null);
                    await fetchStatusAndData(selectedFiscalYear, false, true);
                }
            } else {
                showToast(data.error || data.message || 'خطا در صدور پیش‌فاکتور در سایان', 'error');
            }
        } catch (err: any) {
            showToast('خطای سرور سایان: ' + err.message, 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleViewItems = async (doc: { docNo: string; fiscalYear: string; archiveCode?: string; doc53Id?: string; note?: string; itemsCount?: number }) => {
        setSelectedDocForItems(doc);
        setItemsLoading(true);
        try {
            const queryParams = new URLSearchParams({
                fiscalYear: doc.fiscalYear || '4',
                archiveCode: doc.archiveCode || '',
                docId: doc.doc53Id || ''
            });
            const data = await fetchApiJson(`/api/sayan/order-automation/items/${doc.docNo}?${queryParams.toString()}`);
            if (data.success) {
                setDocItems(data.items || []);
            } else {
                showToast(data.error || data.message || 'خطا در دریافت اقلام سند', 'error');
            }
        } catch (err: any) {
            showToast('خطا در ارتباط با سایان: ' + err.message, 'error');
        } finally {
            setItemsLoading(false);
        }
    };

    const loadSayanPersons = async (query = '') => {
        setSayanPersonsLoading(true);
        try {
            const res = await fetchApiJson(`/api/sayan/order-automation/persons?query=${encodeURIComponent(query)}&limit=60`);
            if (res && res.success) {
                setSayanPersons(res.persons || []);
            }
        } catch (err: any) {
            console.error('Error loading Sayan persons:', err);
        } finally {
            setSayanPersonsLoading(false);
        }
    };

    const openVendorEditModal = (doc: PendingRequest) => {
        setEditingDoc(doc);
        setOverrideVendorCode(doc.detectedVendor?.personCode || '');
        setOverrideVendorName(doc.detectedVendor?.personName || '');
        setPersonSearchQuery('');
        loadSayanPersons('');
    };

    useEffect(() => {
        if (!editingDoc) return;
        const timer = setTimeout(() => {
            loadSayanPersons(personSearchQuery);
        }, 250);
        return () => clearTimeout(timer);
    }, [personSearchQuery, editingDoc]);

    if (!canAccessSayanRegistrations) {
        return (
            <div className="w-full flex flex-col flex-1 items-center justify-center p-8 text-center space-y-4">
                <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-100 dark:border-rose-900">
                    <Database className="w-8 h-8" />
                </div>
                <div className="max-w-md mx-auto">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        عدم دسترسی به بخش ثبت‌های سایان
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        شما دسترسی لازم برای مشاهده یا ثبت اسناد در ماژول ثبت‌های سایان را ندارید. لطفاً با مدیر سیستم تماس بگیرید.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col flex-1 min-h-0 space-y-5 pb-20 p-3 sm:p-5 md:p-6 animate-fade-in select-text">
            
            {/* Unified Executive Hero Header */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white p-5 sm:p-6 shadow-xl border border-white/10">
                <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-tr from-blue-600 to-indigo-500 text-white rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center shrink-0 border border-white/20">
                            <Database className="w-6 h-6 sm:w-7 sm:h-7" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-400/30">
                                    اتوماسیون مستقیم ERP سایان
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                                    SQL Server Bridge
                                </span>
                            </div>
                            <h1 className="text-lg sm:text-2xl font-black text-white mt-1">
                                مرکز ثبت‌ها و اتوماسیون اسناد سایان
                            </h1>
                            <p className="text-xs text-slate-300/90 mt-0.5">
                                ثبت، تایید و صدور مستقیم پیش‌فاکتورهای خرید (سند ۵۷) و رسید دریافت چک در پایگاه‌داده سایان ERP
                            </p>
                        </div>
                    </div>

                    {/* Sub-Module Switcher */}
                    <div className="flex flex-wrap items-center bg-white/10 backdrop-blur-md p-1.5 rounded-2xl gap-1.5 border border-white/15 w-full lg:w-auto">
                        {canSayanPreInvoices && (
                            <button
                                type="button"
                                onClick={() => setMainSubTab('PURCHASE_PREINVOICES')}
                                className={`flex-1 lg:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                    mainSubTab === 'PURCHASE_PREINVOICES'
                                        ? 'bg-white text-slate-900 shadow-lg'
                                        : 'text-slate-200 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                <Sparkles className="w-4 h-4 text-amber-500" />
                                <span>پیش‌فاکتورهای درخواست خرید</span>
                            </button>
                        )}
                        {canAccessChequeReceiptsTab && (
                            <button
                                type="button"
                                onClick={() => setMainSubTab('CHEQUE_RECEIPTS')}
                                className={`flex-1 lg:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                    mainSubTab === 'CHEQUE_RECEIPTS'
                                        ? 'bg-white text-slate-900 shadow-lg'
                                        : 'text-slate-200 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                <CreditCard className="w-4 h-4 text-emerald-500" />
                                <span>رسید دریافت چک (اسناد خزانه)</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setMainSubTab('FUTURE_DOCS')}
                            className={`flex-1 lg:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                mainSubTab === 'FUTURE_DOCS'
                                    ? 'bg-white text-slate-900 shadow-lg'
                                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                            <Layers className={`w-4 h-4 ${mainSubTab === 'FUTURE_DOCS' ? 'text-blue-600' : 'text-slate-300'}`} />
                            <span>سایر ثبت‌ها و عملیات اسناد</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* TAB 2: Cheque Receipts Module */}
            {mainSubTab === 'CHEQUE_RECEIPTS' && canAccessChequeReceiptsTab && (
                <SayanChequeReceiptsTab currentUser={currentUser} settings={settings} />
            )}

            {/* TAB 3: Future Document Types Placeholder */}
            {mainSubTab === 'FUTURE_DOCS' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto border border-blue-100 dark:border-blue-900">
                        <Layers className="w-8 h-8" />
                    </div>
                    <div className="max-w-md mx-auto">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            بخش ثبت‌های آتی اسناد سایان
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            این زیرمجموعه جهت پایه‌گذاری و گسترش ثبت سایر اسناد مستقل در سایان نظیر صدور فاکتور خرید از پیش‌فاکتور، صدور حواله و رسید انبار و اسناد تسویه تعبیه شده است.
                        </p>
                    </div>
                    <div className="pt-2">
                        {canSayanPreInvoices && (
                            <button
                                type="button"
                                onClick={() => setMainSubTab('PURCHASE_PREINVOICES')}
                                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs inline-flex items-center gap-2 transition-all shadow-sm"
                            >
                                <ArrowRight className="w-4 h-4" />
                                <span>بازگشت به ثبت پیش‌فاکتورهای درخواست خرید</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 1: Main Purchase Request to Pre-Invoice Feature */}
            {mainSubTab === 'PURCHASE_PREINVOICES' && canSayanPreInvoices && (
                <div className="space-y-4">
                    {/* Automation Status & Control Header Bar */}
                    <div className="bg-slate-50 dark:bg-slate-900/90 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            
                            {/* Cron Switch & Status Indicator */}
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    onClick={handleToggleAutomation}
                                    disabled={actionLoading === 'toggle'}
                                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${
                                        config?.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                                    title={config?.enabled ? 'کلیک جهت غیرفعال‌سازی اتوماسیون ساعتی' : 'کلیک جهت فعال‌سازی اتوماسیون ساعتی'}
                                >
                                    <span
                                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                                            config?.enabled ? '-translate-x-6' : '-translate-x-1'
                                        }`}
                                    />
                                </button>
                                
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                            اتوماسیون ساعتی صدور ۵۷
                                        </span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                            config?.enabled 
                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300' 
                                                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                                        }`}>
                                            {config?.enabled ? 'فعال (اجرای خودکار)' : 'غیرفعال (فقط دستی)'}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                                        <span>بازه اجرا: هر {config?.intervalMinutes || 60} دقیقه</span>
                                        <span>•</span>
                                        <span>فی پیش‌فاکتور: {config?.defaultFee || 1} ریال</span>
                                        {config?.lastRunAt && (
                                            <>
                                                <span>•</span>
                                                <span className="font-mono">آخرین اجرا: {formatDate(config.lastRunAt)}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Fiscal Year Selector */}
                                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-xs font-bold">
                                    <span className="text-slate-400 dark:text-slate-500 px-1.5 flex items-center gap-1 text-[11px]">
                                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
                                        <span className="hidden sm:inline">سال مالی سایان:</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedFiscalYear('4');
                                            fetchStatusAndData('4');
                                        }}
                                        className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                                            selectedFiscalYear === '4'
                                                ? 'bg-blue-600 text-white shadow-xs'
                                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                                        }`}
                                        title="سال مالی ۱۴۰۵ (سال ۴ در دیتابیس سایان)"
                                    >
                                        ۱۴۰۵ (سال ۴)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedFiscalYear('3');
                                            fetchStatusAndData('3');
                                        }}
                                        className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                                            selectedFiscalYear === '3'
                                                ? 'bg-blue-600 text-white shadow-xs'
                                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                                        }`}
                                        title="سال مالی ۱۴۰۴ (سال ۳ در دیتابیس سایان)"
                                    >
                                        ۱۴۰۴ (سال ۳)
                                    </button>
                                </div>

                                <button
                                    onClick={() => setShowConfigPanel(!showConfigPanel)}
                                    className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
                                >
                                    <Sliders className="w-3.5 h-3.5" />
                                    <span>تنظیمات اتوماسیون</span>
                                    {showConfigPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>

                                <button
                                    onClick={() => handleRunNow(true)}
                                    disabled={loading || actionLoading !== null}
                                    className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-100 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                                    title="تست بدون ثبت در پایگاه‌داده سایان"
                                >
                                    {actionLoading === 'run_dry' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                    <span>شبیه‌سازی آزمایشی</span>
                                </button>

                                <button
                                    onClick={() => handleRunNow(false)}
                                    disabled={loading || actionLoading !== null}
                                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                                >
                                    {actionLoading === 'run_live' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                                    <span>اجرای فوری صدور ۵۷</span>
                                </button>

                                {/* Auto-refresh interval dropdown */}
                                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-xs font-medium">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">بروزرسانی صفحه:</span>
                                    <select
                                        value={autoRefreshInterval}
                                        onChange={(e) => setAutoRefreshInterval(e.target.value as any)}
                                        className="bg-transparent text-slate-800 dark:text-slate-200 font-bold text-xs focus:outline-none cursor-pointer"
                                    >
                                        <option value="OFF">دستی</option>
                                        <option value="5M">هر ۵ دقیقه</option>
                                        <option value="15M">هر ۱۵ دقیقه</option>
                                        <option value="30M">هر ۳۰ دقیقه</option>
                                    </select>
                                </div>

                                <button
                                    onClick={() => fetchStatusAndData(selectedFiscalYear, false, true)}
                                    disabled={loading}
                                    className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 hover:text-slate-900 transition-colors shadow-sm"
                                    title="بروزرسانی دستی داده‌ها از سایان"
                                >
                                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {/* Expandable Configuration Form */}
                        {showConfigPanel && (
                            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in text-xs">
                                <div>
                                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        بازه اجرای خودکار (دقیقه):
                                    </label>
                                    <input
                                        type="number"
                                        min="5"
                                        max="1440"
                                        value={configForm.intervalMinutes}
                                        onChange={(e) => setConfigForm({ ...configForm, intervalMinutes: Number(e.target.value) })}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        فی پیش‌فرض اقلام (ریال):
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={configForm.defaultFee}
                                        onChange={(e) => setConfigForm({ ...configForm, defaultFee: Number(e.target.value) })}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        استخراج هوشمند تامین‌کننده:
                                    </label>
                                    <select
                                        value={configForm.autoVendorMatching ? 'yes' : 'no'}
                                        onChange={(e) => setConfigForm({ ...configForm, autoVendorMatching: e.target.value === 'yes' })}
                                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    >
                                        <option value="yes">فعال (بر اساس شرح و تطبیق با تفصیلی)</option>
                                        <option value="no">غیرفعال (فقط دستی)</option>
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <button
                                        onClick={handleSaveConfig}
                                        disabled={actionLoading === 'save_config'}
                                        className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        {actionLoading === 'save_config' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                        <span>ذخیره تنظیمات</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Toast / Notification Banner */}
                    {toastMessage && (
                        <div className={`p-3.5 rounded-xl text-xs flex items-center justify-between border animate-fade-in ${
                            toastMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300' :
                            toastMessage.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300' :
                            'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300'
                        }`}>
                            <div className="flex items-center gap-2">
                                {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                                {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
                                {toastMessage.type === 'info' && <Sparkles className="w-4 h-4 shrink-0" />}
                                <span className="font-medium">{toastMessage.text}</span>
                            </div>
                            <button onClick={() => setToastMessage(null)} className="opacity-70 hover:opacity-100 mr-2">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* 4 Smart KPI Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">کل معلق در جریان (۵۳)</span>
                                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                                    <Layers className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                                    {pendingList.length}
                                </span>
                                <span className="text-xs text-slate-400">سند منتظر ۵۷</span>
                            </div>
                            <div className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                                اقلام کل معوق: {pendingList.reduce((sum, p) => sum + (p.itemsCount || 0), 0)} ردیف
                            </div>
                        </div>

                        <div 
                            onClick={() => setActiveTab('READY')}
                            className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-sm cursor-pointer transition-all ${
                                activeTab === 'READY' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">در جریان: آماده تبدیل مستقیم</span>
                                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                    {readyItems.length}
                                </span>
                                <span className="text-xs text-slate-400">سند تایید شده</span>
                            </div>
                            <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                تامین‌کننده مشخص و قابل صدور
                            </div>
                        </div>

                        <div 
                            onClick={() => setActiveTab('MANUAL')}
                            className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-sm cursor-pointer transition-all ${
                                activeTab === 'MANUAL' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">در جریان: نیازمند بررسی دستی</span>
                                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
                                    {manualItems.length}
                                </span>
                                <span className="text-xs text-slate-400">سند</span>
                            </div>
                            <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                فاقد کد تامین‌کننده مشخص
                            </div>
                        </div>

                        <div 
                            onClick={() => setActiveTab('ARCHIVED')}
                            className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-sm cursor-pointer transition-all ${
                                activeTab === 'ARCHIVED' ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">صادرشده در سایان (بایگانی)</span>
                                <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                                    <ShieldCheck className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
                                    {archivedList.length}
                                </span>
                                <span className="text-xs text-slate-400">پیش‌فاکتور صادرشده</span>
                            </div>
                            <div className="mt-2 text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                                اسناد ۵۳ تکمیل شده در سایان
                            </div>
                        </div>
                    </div>

                    {/* Filter Tabs & Search Bar */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/70 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
                            <button
                                onClick={() => setActiveTab('READY')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                    activeTab === 'READY' 
                                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                }`}
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>در جریان: آماده تبدیل ({readyItems.length})</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('MANUAL')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                    activeTab === 'MANUAL' 
                                        ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' 
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                }`}
                            >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>در جریان: نیازمند بررسی دستی ({manualItems.length})</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('ARCHIVED')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                    activeTab === 'ARCHIVED' 
                                        ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm' 
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                }`}
                            >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>بایگانی (صادرشده در سایان) ({archivedList.length})</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('LOGS')}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                    activeTab === 'LOGS' 
                                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' 
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                }`}
                            >
                                <History className="w-3.5 h-3.5" />
                                <span>سوابق و لاگ‌ها ({logs.length})</span>
                            </button>
                        </div>

                        {/* Search Input */}
                        {activeTab !== 'LOGS' && (
                            <div className="relative w-full md:w-72">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="جستجو در شماره سند، پیش‌فاکتور، شرح یا شخص..."
                                    className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Data Display Content */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        {loading ? (
                            <div className="py-20 flex flex-col items-center justify-center gap-3">
                                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                <span className="text-xs text-slate-500">در حال دریافت اسناد و پیش‌فاکتورها از دیتابیس سایان...</span>
                            </div>
                        ) : activeTab === 'LOGS' ? (
                            /* Daily Audit & Logs View */
                            <div className="flex flex-col">
                                {/* Daily KPI Summary Header */}
                                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3">
                                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <div className="text-[11px] text-slate-500 font-medium">کل وقایع امروز</div>
                                        <div className="text-lg font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                                            {logStats.todayTotal}
                                        </div>
                                    </div>
                                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">ثبت‌های موفق در سایان</div>
                                        <div className="text-lg font-bold text-emerald-600 font-mono mt-0.5">
                                            {logStats.successfulToday}
                                        </div>
                                    </div>
                                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <div className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">اقلام صادرشده امروز</div>
                                        <div className="text-lg font-bold text-blue-600 font-mono mt-0.5">
                                            {logStats.totalItemsConvertedToday}
                                        </div>
                                    </div>
                                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                        <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">تست‌های آزمایشی</div>
                                        <div className="text-lg font-bold text-purple-600 font-mono mt-0.5">
                                            {logStats.dryRunsToday}
                                        </div>
                                    </div>
                                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm col-span-2 sm:col-span-1">
                                        <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">خطاهای سیستمی</div>
                                        <div className="text-lg font-bold text-rose-600 font-mono mt-0.5">
                                            {logStats.failedToday}
                                        </div>
                                    </div>
                                </div>

                                {/* Filter Controls Bar */}
                                <div className="p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-slate-500 font-medium text-[11px] ml-1">بازه زمانی:</span>
                                        {[
                                            { id: 'ALL', label: 'همه سوابق' },
                                            { id: 'TODAY', label: 'امروز' },
                                            { id: 'YESTERDAY', label: 'دیروز' },
                                            { id: 'WEEK', label: '۷ روز گذشته' },
                                            { id: 'MONTH', label: '۳۰ روز گذشته' }
                                        ].map((filter) => (
                                            <button
                                                key={filter.id}
                                                onClick={() => setLogDateFilter(filter.id as any)}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                                                    logDateFilter === filter.id
                                                        ? 'bg-blue-600 text-white shadow-xs'
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                                                }`}
                                            >
                                                {filter.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <span className="text-slate-500 font-medium text-[11px] ml-1">وضعیت:</span>
                                        {[
                                            { id: 'ALL', label: 'همه' },
                                            { id: 'SUCCESS', label: 'موفق' },
                                            { id: 'FAILED', label: 'خطادار' },
                                            { id: 'DRY_RUN', label: 'آزمایشی' }
                                        ].map((sf) => (
                                            <button
                                                key={sf.id}
                                                onClick={() => setLogStatusFilter(sf.id as any)}
                                                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                                    logStatusFilter === sf.id
                                                        ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                                                        : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                                                }`}
                                            >
                                                {sf.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-right text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                                            <tr>
                                                <th className="py-3 px-4">تاریخ و زمان</th>
                                                <th className="py-3 px-4">نوع عملیات</th>
                                                <th className="py-3 px-4">درخواست مبدا (۵۳)</th>
                                                <th className="py-3 px-4">پیش‌فاکتور مقصد در سایان (۵۷)</th>
                                                <th className="py-3 px-4">طرف حساب / تامین‌کننده</th>
                                                <th className="py-3 px-4">اقلام کالا</th>
                                                <th className="py-3 px-4">کاربر / محرک</th>
                                                <th className="py-3 px-4 text-center">وضعیت ثبت</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {filteredLogs.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="py-12 text-center text-slate-400">
                                                        هیچ سابقه‌ای مطابق با فیلترهای انتخابی یافت نشد.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredLogs.map((log) => (
                                                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                        <td className="py-3 px-4 text-slate-500 font-mono">
                                                            {formatDate(log.timestamp)}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                                                                log.action?.includes('DRY_RUN')
                                                                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                                                    : log.action?.includes('BATCH')
                                                                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                                                                    : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                                            }`}>
                                                                {log.action?.includes('DRY_RUN') ? 'اجرای آزمایشی' : log.action?.includes('BATCH') ? 'تبدیل خودکار دسته‌ای' : 'صدور مستقیم'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                                            {log.doc53No ? `درخواست #${log.doc53No}` : '-'}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            {log.created57DocNo ? (
                                                                <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                                                    <FileText className="w-3.5 h-3.5" />
                                                                    پیش‌فاکتور #{log.created57DocNo}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 font-mono">-</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                                                                {log.vendorName || '-'}
                                                            </div>
                                                            {log.vendorCode && (
                                                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                    کد: {log.vendorCode}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                                                            {log.itemsCount ? `${log.itemsCount} قلم` : '-'}
                                                        </td>
                                                        <td className="py-3 px-4 text-slate-500">
                                                            {log.user || 'اتوماسیون سایان'}
                                                        </td>
                                                        <td className="py-3 px-4 text-center">
                                                            {log.success ? (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                                    موفق
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800" title={log.error}>
                                                                    <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                                                                    خطا در ثبت
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : activeTab === 'ARCHIVED' ? (
                            /* Archived Table */
                            <div className="overflow-x-auto">
                                <div className="p-3 bg-purple-50/70 dark:bg-purple-950/30 border-b border-purple-200/50 dark:border-purple-800/40 text-xs text-purple-900 dark:text-purple-200 flex items-center justify-between">
                                    <span className="font-medium flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                                        <span>اسناد درخواست خرید (۵۳) که در دیتابیس سایان برای آن‌ها پیش‌فاکتور (۵۷) صادر شده و از لیست در جریان خارج شده‌اند.</span>
                                    </span>
                                    <span className="font-mono font-bold bg-white dark:bg-slate-800 px-2.5 py-0.5 rounded border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 shrink-0">
                                        {filteredArchived.length} سند صادرشده
                                    </span>
                                </div>
                                <table className="w-full text-right text-xs">
                                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                            <th className="py-3 px-4">شماره درخواست (۵۳)</th>
                                            <th className="py-3 px-4">تاریخ درخواست ۵۳</th>
                                            <th className="py-3 px-4">پیش‌فاکتور صادرشده در سایان (۵۷)</th>
                                            <th className="py-3 px-4">تاریخ صدور ۵۷</th>
                                            <th className="py-3 px-4">تامین‌کننده</th>
                                            <th className="py-3 px-4">شرح سند</th>
                                            <th className="py-3 px-4">اقلام کالا</th>
                                            <th className="py-3 px-4 text-center">وضعیت در سایان</th>
                                            <th className="py-3 px-4 text-center">مشاهده سند واقعی در سایان</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {filteredArchived.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="py-12 text-center text-slate-400">
                                                    سند بایگانی‌شده‌ای با این مشخصات یافت نشد.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredArchived.map((doc) => (
                                                <tr key={doc.doc53Id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                                        درخواست #{doc.docNo}
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-500 font-mono">
                                                        {formatDate(doc.docDate)}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono font-bold border border-blue-200 dark:border-blue-800">
                                                            <FileText className="w-3.5 h-3.5 text-blue-500" />
                                                            پیش‌فاکتور #{doc.preInvoiceDocNo}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-500 font-mono">
                                                        {formatDate(doc.preInvoiceDate)}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                            <span>{doc.preInvoiceVendorName || doc.preInvoiceVendorCode || '-'}</span>
                                                        </div>
                                                        {doc.preInvoiceVendorCode && (
                                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                                کد تفصیلی: {doc.preInvoiceVendorCode}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 max-w-xs truncate" title={doc.note}>
                                                        {doc.note || <span className="text-slate-400 italic">بدون متن توضیحات</span>}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <button
                                                            onClick={() => handleViewItems(doc)}
                                                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium hover:underline"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                            <span>{doc.itemsCount} ردیف کالا</span>
                                                        </button>
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                                            صادرشده (بایگانی)
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        {doc.preInvoiceDocNo ? (
                                                            <button
                                                                onClick={() => handleInspectSayanDoc(doc.preInvoiceDocNo!, doc.fiscalYear)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 transition-colors shadow-xs"
                                                                title="مشاهده سند و توضیحات کامل ثبت‌شده در پایگاه‌داده سایان"
                                                            >
                                                                <FileCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                                                <span>سند واقعی سایان</span>
                                                            </button>
                                                        ) : (
                                                            <span className="text-slate-400 font-mono text-[11px]">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            /* Pending Documents Table (Ready or Manual) */
                            <div className="overflow-x-auto">
                                <table className="w-full text-right text-xs">
                                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                            <th className="py-3 px-4">شماره درخواست (۵۳)</th>
                                            <th className="py-3 px-4">تاریخ ثبت</th>
                                            <th className="py-3 px-4">تامین‌کننده طرف حساب</th>
                                            <th className="py-3 px-4">شرح / توضیحات</th>
                                            <th className="py-3 px-4">تعداد اقلام</th>
                                            <th className="py-3 px-4">وضعیت تطبیق</th>
                                            <th className="py-3 px-4 text-center">عملیات صدور در سایان</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {(activeTab === 'READY' ? filteredReady : filteredManual).length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-16 text-center text-slate-400">
                                                    {activeTab === 'READY' 
                                                        ? 'هیچ درخواست معوقی در وضعیت «آماده صدور مستقیم» وجود ندارد.'
                                                        : 'هیچ درخواست معوقی در وضعیت «نیازمند بررسی دستی» وجود ندارد.'
                                                    }
                                                </td>
                                            </tr>
                                        ) : (
                                            (activeTab === 'READY' ? filteredReady : filteredManual).map((doc) => (
                                                <tr key={doc.doc53Id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                                                        درخواست #{doc.docNo}
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-500 font-mono">
                                                        {formatDate(doc.docDate)}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        {doc.detectedVendor?.personName ? (
                                                            <div>
                                                                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                                                                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                                    <span>{doc.detectedVendor.personName}</span>
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 font-mono">
                                                                    کد تفصیلی: {doc.detectedVendor.personCode}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                                                                نامشخص (نیاز به تعیین دستی)
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 max-w-xs truncate" title={doc.note}>
                                                        {doc.note || <span className="text-slate-400 italic">بدون متن توضیحات</span>}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <button
                                                            onClick={() => handleViewItems(doc)}
                                                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium hover:underline"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                            <span>{doc.itemsCount} قلم کالا</span>
                                                        </button>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        {doc.isReady ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                                <Check className="w-3 h-3 text-emerald-500" />
                                                                آماده صدور
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                                                بررسی تفصیلی
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 text-center">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {doc.isReady ? (
                                                                <button
                                                                    onClick={() => handleConvertSingle(doc, doc.detectedVendor.personCode!, doc.detectedVendor.personName!)}
                                                                    disabled={actionLoading !== null}
                                                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition-all shadow-sm active:scale-95"
                                                                    title="صدور فوری پیش‌فاکتور ۵۷ در سایان"
                                                                >
                                                                    {actionLoading === `convert_${doc.doc53Id}` ? (
                                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                    ) : (
                                                                        <Check className="w-3.5 h-3.5" />
                                                                    )}
                                                                    <span>تایید و صدور ۵۷</span>
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => openVendorEditModal(doc)}
                                                                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 transition-all shadow-sm"
                                                                >
                                                                    <Building2 className="w-3.5 h-3.5" />
                                                                    <span>تعیین تامین‌کننده</span>
                                                                </button>
                                                            )}

                                                            <button
                                                                onClick={() => openVendorEditModal(doc)}
                                                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                                title="تغییر تامین‌کننده یا شبیه‌سازی"
                                                            >
                                                                <Sliders className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Item Details Modal */}
            {selectedDocForItems && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Package className="w-5 h-5 text-blue-600" />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-black text-sm text-slate-900 dark:text-white">
                                            اقلام درخواست خرید #{selectedDocForItems.docNo}
                                        </h3>
                                        {selectedDocForItems.archiveCode && (
                                            <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-mono font-medium">
                                                کد بایگانی: {selectedDocForItems.archiveCode}
                                            </span>
                                        )}
                                        <span className="text-xs text-slate-400 font-mono">
                                            (سال مالی {selectedDocForItems.fiscalYear})
                                        </span>
                                    </div>
                                    {selectedDocForItems.note && (
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                            شرح: {selectedDocForItems.note}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedDocForItems(null)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Summary Bar if items exist */}
                        {docItems.length > 0 && (
                            <div className="px-4 py-2.5 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/40 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-3">
                                    <span className="text-slate-600 dark:text-slate-300">
                                        تعداد کل ردیف‌ها: <b className="text-blue-600 font-mono">{docItems.length}</b>
                                    </span>
                                    <span>•</span>
                                    <span className="text-slate-600 dark:text-slate-300">
                                        جمع کل مقدار: <b className="text-emerald-600 font-mono">
                                            {docItems.reduce((acc, curr) => acc + (Number(curr.Qty) || 0), 0).toLocaleString('fa-IR')}
                                        </b> {docItems[0]?.UnitName || 'کیلوگرم'}
                                    </span>
                                </div>
                                <span className="text-[11px] text-slate-500 font-medium">
                                    تطابق با پایگاه‌داده سایان ERP
                                </span>
                            </div>
                        )}

                        <div className="p-4 overflow-y-auto flex-1">
                            {itemsLoading ? (
                                <div className="py-12 flex flex-col items-center justify-center gap-2">
                                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                                    <span className="text-xs text-slate-500">در حال دریافت اقلام کالا از پایگاه‌داده سایان...</span>
                                </div>
                            ) : docItems.length === 0 ? (
                                <div className="py-12 text-center text-slate-400 text-xs">
                                    هیچ قلم کالایی برای این سند یافت نشد.
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                                    {docItems.map((item, idx) => (
                                        <div key={idx} className="py-2.5 px-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors">
                                            <div className="flex items-start gap-2.5">
                                                <div className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[11px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 dark:text-white text-sm">
                                                        {item.ItemName || item.ItemCode}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2 font-mono">
                                                        <span>کد کالا: <b className="text-slate-700 dark:text-slate-200">{item.ItemCode}</b></span>
                                                        <span>•</span>
                                                        <span>انبار: <b className="text-slate-700 dark:text-slate-200">{item.WarehouseCode || '-'}</b></span>
                                                        {item.TrackingCode && (
                                                            <>
                                                                <span>•</span>
                                                                <span>کد ردیابی: {item.TrackingCode}</span>
                                                            </>
                                                        )}
                                                        {item.ItemDesc && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="text-slate-400 font-sans">{item.ItemDesc}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-left shrink-0">
                                                <div className="font-black text-slate-900 dark:text-white text-sm font-mono">
                                                    {Number(item.Qty || 0).toLocaleString('fa-IR')} {item.UnitName || 'واحد'}
                                                </div>
                                                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                                                    فی در ۵۷: ۱ ریال
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 text-left">
                            <button
                                onClick={() => setSelectedDocForItems(null)}
                                className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold"
                            >
                                بستن
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Vendor Override / Manual Action Modal with Real Sayan Sarfasl Lookup */}
            {editingDoc && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-amber-600" />
                                <div>
                                    <h3 className="font-black text-sm text-slate-900 dark:text-white">
                                        تعیین سرفصل و طرف حساب سایان ERP
                                    </h3>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                        درخواست خرید #{editingDoc.docNo} (کد فرعی: {editingDoc.subCode || '-'})
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingDoc(null)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-4 space-y-3.5 text-xs overflow-y-auto flex-1">
                            {/* Request Notes in Sayan */}
                            <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/50 space-y-1">
                                <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>شرح و توضیحات ثبت شده در درخواست سایان (Opcode 53):</span>
                                </div>
                                <div className="text-amber-800 dark:text-amber-300 leading-relaxed font-medium">
                                    {editingDoc.note || editingDoc.descText || 'توضیحاتی ثبت نشده است.'}
                                </div>
                            </div>

                            {/* Quick Suggestion Chips */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                        <span>تامین‌کنندگان و سرفصل‌های پرتکرار:</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => { setPersonSearchQuery(''); loadSayanPersons(''); }}
                                        className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                    >
                                        <RefreshCw className={`w-2.5 h-2.5 ${sayanPersonsLoading ? 'animate-spin' : ''}`} />
                                        <span>تازه‌سازی لیست سایان</span>
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {[
                                        { code: '3178', name: 'شرکت کیا زیپ' },
                                        { code: '1147', name: 'شرکت پتروشیمی تندگویان' },
                                        { code: '1161', name: 'آصال الیاف سپاهان-فوده ای' },
                                        { code: '2557', name: 'شرکت الیاف سازان بهکوش' },
                                        { code: '2412', name: 'کارتن سازان عدل البرز' },
                                        { code: '2334', name: 'نعمتی (کارتن)' },
                                        { code: '3095', name: 'رسول شیری دوک' },
                                        { code: '1840', name: 'شعباني جعفر (دوک) آسیا پلاستیک' },
                                        { code: '1367', name: 'شرکت زرتاب زاینده رود' }
                                    ].map(item => (
                                        <button
                                            key={item.code}
                                            type="button"
                                            onClick={() => {
                                                setOverrideVendorCode(item.code);
                                                setOverrideVendorName(item.name);
                                            }}
                                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                                                overrideVendorCode === item.code 
                                                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-600 font-bold shadow-xs' 
                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span>{item.name}</span>
                                            <span className="text-[9px] opacity-60 font-mono">({item.code})</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Sayan Accounts Live Search & List */}
                            <div className="space-y-2">
                                <label className="block font-bold text-slate-700 dark:text-slate-300">
                                    جستجو و انتخاب از پایگاه داده سایان (جدول ACT_TBL_007):
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={personSearchQuery}
                                        onChange={(e) => setPersonSearchQuery(e.target.value)}
                                        placeholder="جستجوی نام شخص، شرکت یا کد تفصیلی در سایان..."
                                        className="w-full pl-9 pr-9 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    />
                                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                                    {sayanPersonsLoading ? (
                                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute left-3 top-2.5" />
                                    ) : personSearchQuery ? (
                                        <button
                                            type="button"
                                            onClick={() => setPersonSearchQuery('')}
                                            className="w-4 h-4 text-slate-400 hover:text-slate-600 absolute left-3 top-2.5"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    ) : null}
                                </div>

                                {/* Results Box */}
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-850/50">
                                    {sayanPersonsLoading && sayanPersons.length === 0 ? (
                                        <div className="p-4 text-center text-slate-500 flex items-center justify-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                            <span>در حال واکشی سرفصل‌ها از سرور سایان...</span>
                                        </div>
                                    ) : sayanPersons.length === 0 ? (
                                        <div className="p-4 text-center text-slate-400">
                                            {personSearchQuery ? 'هیچ طرف حسابی با این عبارت در سایان یافت نشد.' : 'در حال بارگذاری لیست سرفصل‌ها از سایان...'}
                                        </div>
                                    ) : (
                                        sayanPersons.map((p) => {
                                            const isSelected = overrideVendorCode === p.personCode;
                                            return (
                                                <div
                                                    key={p.personCode}
                                                    onClick={() => {
                                                        setOverrideVendorCode(p.personCode);
                                                        setOverrideVendorName(p.fullName);
                                                    }}
                                                    className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                                                        isSelected 
                                                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 font-bold' 
                                                            : 'hover:bg-blue-50/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ${
                                                            isSelected 
                                                                ? 'bg-emerald-500 text-white' 
                                                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                                        }`}>
                                                            {isSelected ? <Check className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                                                        </div>
                                                        <span className="text-xs">{p.fullName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                                            {p.personCode}
                                                        </span>
                                                        <span className="text-[10px] text-blue-600 dark:text-blue-400 opacity-80">
                                                            سایان
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Currently Selected Summary Card */}
                            {overrideVendorCode ? (
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-300 dark:border-emerald-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                        <div>
                                            <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                                                سرفصل و تامین‌کننده انتخاب شده جهت صدور پیش‌فاکتور (۵۷):
                                            </div>
                                            <div className="font-black text-xs text-emerald-900 dark:text-emerald-100">
                                                {overrideVendorName || 'بدون نام'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-left font-mono font-bold text-xs bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-2.5 py-1 rounded-lg">
                                        کد: {overrideVendorCode}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 flex items-center gap-2 text-amber-800 dark:text-amber-300">
                                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                                    <span>لطفاً از لیست سایان یا پیشنهادات بالا، سرفصل/تامین‌کننده را انتخاب نمایید.</span>
                                </div>
                            )}

                            {/* Manual Fine-Tuning Fields */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                <div>
                                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        کد تفصیلی در سایان:
                                    </label>
                                    <input
                                        type="text"
                                        value={overrideVendorCode}
                                        onChange={(e) => setOverrideVendorCode(e.target.value)}
                                        placeholder="مثال: 1147"
                                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs"
                                    />
                                </div>

                                <div>
                                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        نام طرف حساب / شرکت:
                                    </label>
                                    <input
                                        type="text"
                                        value={overrideVendorName}
                                        onChange={(e) => setOverrideVendorName(e.target.value)}
                                        placeholder="نام شخص یا شرکت..."
                                        className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                            <button
                                onClick={() => handleConvertSingle(editingDoc, overrideVendorCode, overrideVendorName, true)}
                                disabled={actionLoading !== null || !overrideVendorCode}
                                className="px-3.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold transition-colors disabled:opacity-50"
                            >
                                تست شبیه‌سازی
                            </button>
                            
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setEditingDoc(null)}
                                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    انصراف
                                </button>
                                <button
                                    onClick={() => handleConvertSingle(editingDoc, overrideVendorCode, overrideVendorName, false)}
                                    disabled={actionLoading !== null || !overrideVendorCode}
                                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {actionLoading === `convert_${editingDoc.doc53Id}` ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Check className="w-4 h-4" />
                                    )}
                                    <span>تایید و صدور پیش‌فاکتور ۵۷ در سایان</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sayan Real Document (57 & 53) Inspector Modal */}
            {sayanInspectModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white border-b border-indigo-900/40 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300">
                                    <FileCheck className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-black text-sm text-white">
                                            بازبینی سند واقعی ثبت‌شده در پایگاه‌داده سایان
                                        </h3>
                                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                            پیش‌فاکتور #{sayanInspectModal.doc57No}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-slate-300 mt-0.5">
                                        واکشی مستقیم از جداول STR_TBL_010 و STR_TBL_011 دیتابیس سایان (سال مالی {sayanInspectModal.fiscalYear})
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSayanInspectModal(prev => ({ ...prev, isOpen: false }))}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs">
                            {sayanInspectModal.loading ? (
                                <div className="py-16 flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                        در حال واکشی اطلاعات واقعی سند و ردیف‌های اقلام از پایگاه‌داده سایان...
                                    </span>
                                </div>
                            ) : sayanInspectModal.error ? (
                                <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-2">
                                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                                    <span>{sayanInspectModal.error}</span>
                                </div>
                            ) : sayanInspectModal.data ? (
                                <>
                                    {/* Sayan Document Header Card */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {/* Doc 57 Header Details */}
                                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                                            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                                                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                                                    <FileText className="w-4 h-4 text-blue-600" />
                                                    <span>مشخصات سربرگ پیش‌فاکتور (۵۷) در سایان</span>
                                                </span>
                                                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                                                    سند #{sayanInspectModal.data.doc57?.DocNo}
                                                </span>
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                <div>
                                                    <span className="text-slate-400">تاریخ سند:</span>
                                                    <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                                        {formatDate(sayanInspectModal.data.doc57?.DocDate)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400">شماره فرعی / کد عطف:</span>
                                                    <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                                        {sayanInspectModal.data.doc57?.SubCode || sayanInspectModal.data.doc57?.SubNo || '-'}
                                                    </div>
                                                </div>
                                                <div className="col-span-2">
                                                    <span className="text-slate-400">تامین‌کننده طرف حساب:</span>
                                                    <div className="font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5">
                                                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                        <span>{sayanInspectModal.data.doc57?.VendorName || sayanInspectModal.data.doc57?.VendorCode || '-'}</span>
                                                        {sayanInspectModal.data.doc57?.VendorCode && (
                                                            <span className="text-[10px] font-mono text-slate-400">
                                                                (کد تفصیلی: {sayanInspectModal.data.doc57?.VendorCode})
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="col-span-2 pt-1">
                                                    <span className="text-slate-400">شرح سربرگ سند (Field_017):</span>
                                                    <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 mt-1 leading-relaxed">
                                                        {sayanInspectModal.data.doc57?.Note || 'توضیحی ثبت نشده است.'}
                                                    </div>
                                                </div>
                                                {(sayanInspectModal.data.doc57?.Description || sayanInspectModal.data.doc57?.DescText) && (
                                                    <div className="col-span-2">
                                                        <span className="text-slate-400">توضیحات تکمیلی (Field_028 / Field_029):</span>
                                                        <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                                            {sayanInspectModal.data.doc57?.Description || sayanInspectModal.data.doc57?.DescText}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Doc 53 Origin Header Details */}
                                        <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 space-y-2.5">
                                            <div className="flex items-center justify-between border-b border-purple-200 dark:border-purple-800 pb-2">
                                                <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5 text-xs">
                                                    <Layers className="w-4 h-4 text-purple-600" />
                                                    <span>درخواست خرید مبنا (۵۳) در سایان</span>
                                                </span>
                                                <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
                                                    {sayanInspectModal.data.doc53 ? `درخواست #${sayanInspectModal.data.doc53.DocNo}` : 'نامشخص'}
                                                </span>
                                            </div>

                                            {sayanInspectModal.data.doc53 ? (
                                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                    <div>
                                                        <span className="text-slate-400">تاریخ درخواست ۵۳:</span>
                                                        <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                                            {formatDate(sayanInspectModal.data.doc53.DocDate)}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-400">شماره فرعی / عطف ۵۳:</span>
                                                        <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                                            {sayanInspectModal.data.doc53.SubCode || sayanInspectModal.data.doc53.SubNo || '-'}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2 pt-1">
                                                        <span className="text-slate-400">شرح درخواست خرید ۵۳:</span>
                                                        <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-purple-200/60 dark:border-purple-800/60 text-slate-800 dark:text-slate-200 mt-1 leading-relaxed">
                                                            {sayanInspectModal.data.doc53.Note || sayanInspectModal.data.doc53.DescText || 'بدون شرح'}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                                            <span>ارتباط ردیف‌های ۵۷ با درخواست ۵۳ به‌صورت قانونی و اتومیک برقرار است.</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="py-8 text-center text-slate-400">
                                                    سند ۵۳ مستقیمی برای این پیش‌فاکتور در سیستم متصل نیست یا از طریق عطف ادغام شده است.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Items Table from STR_TBL_011 */}
                                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                        <div className="p-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                            <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                                                <Package className="w-4 h-4 text-blue-600" />
                                                <span>اقلام ثبت‌شده در جدول STR_TBL_011 پیش‌فاکتور ۵۷</span>
                                            </span>
                                            <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                                                {sayanInspectModal.data.items57?.length || 0} ردیف کالا
                                            </span>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <table className="w-full text-right text-xs">
                                                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                                                    <tr>
                                                        <th className="py-2.5 px-3">ردیف</th>
                                                        <th className="py-2.5 px-3">کد کالا</th>
                                                        <th className="py-2.5 px-3">نام و شرح کالا در سایان</th>
                                                        <th className="py-2.5 px-3 text-center">مقدار / تعداد</th>
                                                        <th className="py-2.5 px-3 text-center">واحد</th>
                                                        <th className="py-2.5 px-3 text-center">فی (ریال)</th>
                                                        <th className="py-2.5 px-3 text-center">مبلغ کل (ریال)</th>
                                                        <th className="py-2.5 px-3 text-center">شناسه ردیف مبنا (MabnaRowId)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                    {(!sayanInspectModal.data.items57 || sayanInspectModal.data.items57.length === 0) ? (
                                                        <tr>
                                                            <td colSpan={8} className="py-8 text-center text-slate-400">
                                                                هیچ ردیف کالایی برای این سند در STR_TBL_011 یافت نشد.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        sayanInspectModal.data.items57.map((item: any, idx: number) => (
                                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                                <td className="py-2.5 px-3 font-mono text-slate-400">
                                                                    {idx + 1}
                                                                </td>
                                                                <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                                                                    {item.ItemCode}
                                                                </td>
                                                                <td className="py-2.5 px-3">
                                                                    <div className="font-semibold text-slate-900 dark:text-white">
                                                                        {item.ItemName}
                                                                    </div>
                                                                    {item.ItemNote && (
                                                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                                                            {item.ItemNote}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 dark:text-white">
                                                                    {Number(item.Quantity || 0).toLocaleString('fa-IR')}
                                                                </td>
                                                                <td className="py-2.5 px-3 text-center text-slate-500">
                                                                    {item.UnitName || 'عدد'}
                                                                </td>
                                                                <td className="py-2.5 px-3 text-center font-mono text-slate-700 dark:text-slate-300">
                                                                    {Number(item.Fee || 0).toLocaleString('fa-IR')}
                                                                </td>
                                                                <td className="py-2.5 px-3 text-center font-mono text-slate-700 dark:text-slate-300">
                                                                    {Number(item.TotalPrice || 0).toLocaleString('fa-IR')}
                                                                </td>
                                                                <td className="py-2.5 px-3 text-center">
                                                                    {item.MabnaRowId || item.SecondaryMabna ? (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                                            <Check className="w-3 h-3 text-emerald-500" />
                                                                            <span>{item.MabnaRowId || item.SecondaryMabna}</span>
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-slate-400 font-mono text-[10px]">-</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            ) : null}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <span className="text-slate-500 dark:text-slate-400 text-xs">
                                داده‌های فوق به‌صورت لحظه‌ای و بدون واسطه از سرور پایگاه‌داده سایان استعلام شده‌اند.
                            </span>
                            <button
                                onClick={() => setSayanInspectModal(prev => ({ ...prev, isOpen: false }))}
                                className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity"
                            >
                                بستن پنجره
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SayanRegistrationsModule;
