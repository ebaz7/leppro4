import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    CreditCard, Plus, Trash2, CheckCircle2, AlertCircle, Clock, ShieldCheck,
    Search, RefreshCw, Eye, Download, Upload, Calendar, Building2, User,
    FileCheck, ArrowRight, ExternalLink, X, ChevronDown, Check, Sparkles,
    Hash, Layers, ShieldAlert, ArrowUpRight, Copy, Printer, Edit3, CornerUpLeft,
    CheckSquare, FileText, ArrowLeft, Settings2, Sliders, Zap, Loader2,
    CalendarDays, ChevronRight, ChevronLeft, Filter, ArrowUpDown, ArrowUp, ArrowDown,
    RotateCcw, UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as jalaali from 'jalaali-js';
import { UserRole } from '../types';
import { getRolePermissions } from '../services/authService';
import { ChequeItemRow, ChequeItemInput, COMMON_IRANIAN_BANKS, normalizeToAsciiDigits, toShamsiStr, fromShamsiStr, getChequeRegistrationLabel, getChequeIssuerLabel } from './sayan-cheques/ChequeItemRow';
// @ts-ignore
import DatePicker from "react-multi-date-picker";
// @ts-ignore
import persian from "react-date-object/calendars/persian";
// @ts-ignore
import persian_fa from "react-date-object/locales/persian_fa";
import { RealSayanDocumentModal } from './sayan-cheques/RealSayanDocumentModal';
import { AccountingReviewModal } from './sayan-cheques/AccountingReviewModal';
import { ChequeReceiptDetailModal } from './sayan-cheques/ChequeReceiptDetailModal';
import { A5ChequeReceiptPrintModal } from './sayan-cheques/A5ChequeReceiptPrintModal';
import { MobileAttachmentUploader, ReceiptAttachment } from './sayan-cheques/MobileAttachmentUploader';
import { ChequeWorkflowSettingsModal, ChequeWorkflowConfig } from './ChequeWorkflowSettingsModal';
import { getEffectiveApiUrl, getAuthToken, resolveImageUrl } from '../services/apiService';
import { FileViewerModal } from './FileViewerModal';

interface SayanPerson {
    personCode: string;
    tafsiliCode?: string;
    fullName: string;
    levelCode?: string;
    nationalId?: string;
    mobile?: string;
}

interface ChequeReceiptRecord {
    id: string;
    receiptNo?: number | string;
    source: 'APP_DRAFT' | 'SAYAN_DB';
    status: 'PENDING_ACCOUNTING' | 'PENDING_CEO' | 'APPROVED' | 'REGISTERED_IN_SAYAN' | 'REJECTED' | 'PENDING_APPROVAL' | 'PROCESSING_SAYAN';
    sayanSyncStatus?: 'QUEUED' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
    sayanError?: string;
    fiscalYear: string;
    docNo: string | number;
    archiveCode: string | number;
    poshtNomreh: string;
    docDate: string;
    docDateShamsi?: string;
    personCode: string;
    personName: string;
    cashboxCode?: string;
    cashboxTitle?: string;
    totalAmount: number;
    description: string;
    cheques: Array<{
        id?: string;
        chequeId?: string;
        rowId?: string;
        chequeNumber: string;
        sayadId?: string;
        amount: number;
        dueDate: string;
        bankName: string;
        inNameOf: string;
        accountNo?: string;
        poshtNomreh?: string;
        description?: string;
        registrationType?: 'company' | 'person' | 'unregistered' | '';
        registeredPersonName?: string;
        isCustomerSelfIssuer?: boolean;
        rowSeq?: number;
    }>;
    attachments?: Array<{
        fileName: string;
        fileData?: string;
        url?: string;
        fileType?: string;
        fileSize?: number;
        uploadedAt?: string;
    }>;
    accountingReview?: {
        approved: boolean;
        byUserId?: string;
        byName?: string;
        date?: string;
        note?: string;
    };
    ceoApproval?: {
        approved: boolean;
        byUserId?: string;
        byName?: string;
        date?: string;
    };
    sayanDocNo?: number;
    sayanArchiveCode?: number;
    sayanRegisteredAt?: string;
    registeredAt?: string;
    createdAt?: string;
    createdByName?: string;
}

interface Props {
    currentUser: any;
    fiscalYear?: string;
    settings?: any;
}

const toPersianDigits = (num: string | number | undefined | null): string => {
    if (num === undefined || num === null || num === '') return '';
    return String(num).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
};

const getTodayShamsi = (): string => {
    const now = new Date();
    const j = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const mm = String(j.jm).padStart(2, '0');
    const dd = String(j.jd).padStart(2, '0');
    return `${j.jy}/${mm}/${dd}`;
};

const getShamsiPlusMonths = (months: number): string => {
    const base = new Date();
    base.setMonth(base.getMonth() + months);
    const j = jalaali.toJalaali(base.getFullYear(), base.getMonth() + 1, base.getDate());
    const mm = String(j.jm).padStart(2, '0');
    const dd = String(j.jd).padStart(2, '0');
    return `${j.jy}/${mm}/${dd}`;
};

export const SayanChequeReceiptsTab: React.FC<Props> = ({
    currentUser,
    fiscalYear = '4',
    settings
}) => {
    // Current Active Tab
    const [activeSubTab, setActiveSubTab] = useState<'NEW_RECEIPT' | 'CARTABLE' | 'CALENDAR' | 'ARCHIVE'>('NEW_RECEIPT');

    // Calendar View States
    const [calYear, setCalYear] = useState<number>(() => {
        try {
            const now = new Date();
            const j = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
            return j.jy;
        } catch { return 1404; }
    });
    const [calMonth, setCalMonth] = useState<number>(() => {
        try {
            const now = new Date();
            const j = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
            return j.jm;
        } catch { return 7; }
    });
    const [sayanSelectedDayModal, setSayanSelectedDayModal] = useState<{ day: number; dateStr: string; items: any[] } | null>(null);

    // Workflow Configuration State & System Users List
    const [workflowConfig, setWorkflowConfig] = useState<ChequeWorkflowConfig>({
        requireCeoApproval: false,
        autoRegisterAfterAccounting: true,
        allowAccountingFinalApproval: true,
        allowedFinalApproverUserIds: [],
        allowedFinalApproverRoles: ['ADMIN', 'CEO', 'FINANCIAL', 'ACCOUNTANT']
    });
    const [systemUsersList, setSystemUsersList] = useState<Array<{ id: string; name: string; username: string; role: string; roles?: string[] }>>([]);
    const [isWorkflowModalOpen, setIsWorkflowModalOpen] = useState(false);

    const apiFetch = async (urlPath: string, options: RequestInit = {}) => {
        const url = getEffectiveApiUrl(urlPath);
        const token = getAuthToken();
        const headers: Record<string, string> = {
            ...(options.headers as Record<string, string> || {})
        };
        if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return fetch(url, { ...options, headers });
    };

    const safeParseJson = async (res: Response): Promise<any> => {
        const rawText = await res.text();
        const trimmed = rawText.trim();
        if (!trimmed) {
            if (!res.ok) throw new Error(`خطای سرور (کد ${res.status})`);
            return {};
        }
        if (trimmed.startsWith('<')) {
            if (res.status === 413) {
                throw new Error('حجم اطلاعات یا فایل‌های پیوست بیش از حد مجاز سرور است. لطفاً فایل با حجم کمتر انتخاب کنید.');
            }
            throw new Error(`سرور پاسخ نامعتبر برگرداند (کد وضعیت ${res.status || 500}). لطفاً دوباره تلاش کنید.`);
        }
        try {
            return JSON.parse(trimmed);
        } catch {
            throw new Error(`پاسخ نامعتبر از سرور دریافت شد (کد وضعیت ${res.status}).`);
        }
    };

    const fetchWorkflowConfig = async () => {
        try {
            const res = await apiFetch('/api/sayan/cheque-receipts/workflow-config');
            if (res.ok) {
                const data = await safeParseJson(res);
                if (data.success && data.config) {
                    setWorkflowConfig(data.config);
                    if (Array.isArray(data.users)) setSystemUsersList(data.users);
                }
            }
        } catch (e) {
            console.error("Error fetching cheque workflow config:", e);
        }
    };

    useEffect(() => {
        fetchWorkflowConfig();
    }, []);

    // Check if current user is allowed to perform final approval
    const isDirectFinalAllowed = useMemo(() => {
        const uRole = String(currentUser?.role || '').toUpperCase();
        const uRoles = Array.isArray(currentUser?.roles) ? currentUser.roles.map((r: any) => String(r).toUpperCase()) : [];
        if (uRole === 'ADMIN' || uRole === 'CEO' || uRoles.includes('ADMIN') || uRoles.includes('CEO')) return true;
        if (workflowConfig.requireCeoApproval === false) return true;
        if (workflowConfig.allowAccountingFinalApproval && (uRole === 'FINANCIAL' || uRole === 'ACCOUNTANT' || uRoles.includes('FINANCIAL') || uRoles.includes('ACCOUNTANT'))) return true;
        if (Array.isArray(workflowConfig.allowedFinalApproverUserIds) && workflowConfig.allowedFinalApproverUserIds.includes(String(currentUser?.id))) return true;
        if (Array.isArray(workflowConfig.allowedFinalApproverRoles) && (workflowConfig.allowedFinalApproverRoles.includes(uRole) || workflowConfig.allowedFinalApproverRoles.some((r: string) => uRoles.includes(r)))) return true;
        return false;
    }, [currentUser, workflowConfig]);

    // Dynamic Permissions based on Settings & Roles
    const resolvedPermissions = useMemo(() => {
        let perms = currentUser?.rolePermissions || {};
        if (settings) {
            try {
                perms = getRolePermissions(currentUser?.role, settings, currentUser);
            } catch (e) {
                console.error("Error resolving role permissions in SayanChequeReceiptsTab:", e);
            }
        }
        
        const isAdmin = currentUser?.role === UserRole.ADMIN || currentUser?.roles?.includes(UserRole.ADMIN) || currentUser?.roles?.includes('admin');
        const isCeo = currentUser?.role === UserRole.CEO || currentUser?.role === 'CEO' || currentUser?.role === 'MANAGER' || currentUser?.roles?.includes('ceo');
        
        return {
            canSayanRegisterCheque: isAdmin || perms.canSayanRegisterCheque !== false, // default to true if not explicitly restricted
            canSayanEditReceipt: isAdmin || perms.canSayanEditReceipt === true || (perms.canSayanEditReceipt === undefined && (currentUser?.role === UserRole.FINANCIAL || currentUser?.roles?.includes('financial'))),
            canSayanApproveAccounting: isAdmin || perms.canSayanApproveAccounting === true || (perms.canSayanApproveAccounting === undefined && (currentUser?.role === UserRole.FINANCIAL || currentUser?.roles?.includes('financial'))),
            canSayanApproveCeo: isAdmin || isCeo || isDirectFinalAllowed || perms.canSayanApproveCeo === true,
            canSayanDeleteReceipt: isAdmin || perms.canSayanDeleteReceipt === true || (perms.canSayanDeleteReceipt === undefined && (currentUser?.role === UserRole.FINANCIAL || currentUser?.roles?.includes('financial'))),
            canConfigureWorkflow: isAdmin || isCeo || currentUser?.role === UserRole.FINANCIAL
        };
    }, [currentUser, settings, isDirectFinalAllowed]);

    const isFinancialOrAdmin = resolvedPermissions.canSayanApproveAccounting;
    const isCeoOrAdmin = resolvedPermissions.canSayanApproveCeo;
    const canDeleteReceipt = resolvedPermissions.canSayanDeleteReceipt;
    const canEditReceipt = resolvedPermissions.canSayanEditReceipt;
    const canRegisterReceipt = resolvedPermissions.canSayanRegisterCheque;
    const canConfigureWorkflow = resolvedPermissions.canConfigureWorkflow;

    // Redirect to Cartable if registration is not allowed
    useEffect(() => {
        if (!canRegisterReceipt && activeSubTab === 'NEW_RECEIPT') {
            setActiveSubTab('CARTABLE');
        }
    }, [canRegisterReceipt, activeSubTab]);

    useEffect(() => {
        const handleSubTabChange = (e: any) => {
            if (e.detail === 'ARCHIVE' || e.detail === 'CARTABLE' || e.detail === 'NEW_RECEIPT') {
                setActiveSubTab(e.detail);
            }
        };
        window.addEventListener('CHEQUE_RECEIPTS_SUB_TAB_CHANGE', handleSubTabChange);
        return () => window.removeEventListener('CHEQUE_RECEIPTS_SUB_TAB_CHANGE', handleSubTabChange);
    }, []);

    // Form States
    const [personQuery, setPersonQuery] = useState('');
    const [selectedPerson, setSelectedPerson] = useState<SayanPerson | null>(null);
    const [personSearchResults, setPersonSearchResults] = useState<SayanPerson[]>([]);
    const [searchingPersons, setSearchingPersons] = useState(false);
    const [personDropdownOpen, setPersonDropdownOpen] = useState(false);
    const personContainerRef = useRef<HTMLDivElement>(null);

    const [poshtNomreh, setPoshtNomreh] = useState('');
    const [receiptNoInput, setReceiptNoInput] = useState('');
    const [editingReceiptNoItem, setEditingReceiptNoItem] = useState<{ id: string; currentNo: string } | null>(null);
    const [tempQuickReceiptNo, setTempQuickReceiptNo] = useState('');
    const [savingQuickReceiptNo, setSavingQuickReceiptNo] = useState(false);
    const [targetTotalAmount, setTargetTotalAmount] = useState<number | ''>('');
    const [docDateShamsi, setDocDateShamsi] = useState(getTodayShamsi());
    const [description, setDescription] = useState('');
    const [attachments, setAttachments] = useState<ReceiptAttachment[]>([]);
    const [previewFile, setPreviewFile] = useState<ReceiptAttachment | null>(null);

    // Cashbox states
    const [cashboxCode, setCashboxCode] = useState('11001');
    const [cashboxesList, setCashboxesList] = useState<Array<{ code: string; title: string }>>([
        { code: '11001', title: 'صندوق دفتر' },
        { code: '11002', title: 'صندوق سکه و کارت هدیه' },
        { code: '11003', title: 'صندوق آقای مقدم' },
        { code: '11004', title: 'صندوق ارزی' },
        { code: '11005', title: 'صندوق چک های برگشتی' }
    ]);

    const fetchCashboxes = async () => {
        try {
            const res = await apiFetch('/api/sayan/cheque-receipts/cashboxes');
            const data = await safeParseJson(res);
            if (data.success && Array.isArray(data.cashboxes) && data.cashboxes.length > 0) {
                setCashboxesList(data.cashboxes);
            }
        } catch (err) {
            console.error('Failed to fetch cashboxes', err);
        }
    };

    // Cheque Rows
    const [chequeRows, setChequeRows] = useState<ChequeItemInput[]>([
        {
            id: '1',
            chequeNumber: '',
            sayadId: '',
            amount: '',
            dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
            bankName: 'سامان',
            inNameOf: '',
            accountNo: '',
            description: '',
            registrationType: '',
            registeredPersonName: '',
            isCustomerSelfIssuer: true
        }
    ]);

    // Data lists
    const [receiptsList, setReceiptsList] = useState<ChequeReceiptRecord[]>([]);
    const [loadingReceipts, setLoadingReceipts] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Advanced Filters, Multi-Criteria Search & Sorting in Archive
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_ACCOUNTING' | 'PENDING_CEO' | 'REGISTERED_IN_SAYAN' | 'REJECTED'>('ALL');
    const [sayanRegFilter, setSayanRegFilter] = useState<'ALL' | 'REGISTERED' | 'UNREGISTERED' | 'PROCESSING' | 'NEEDS_REREGISTER'>('ALL');
    const [sayadiRegTypeFilter, setSayadiRegTypeFilter] = useState<'ALL' | 'company' | 'person' | 'unregistered' | 'unspecified'>('ALL');
    const [registeredPersonFilter, setRegisteredPersonFilter] = useState('');
    const [issuerRelationFilter, setIssuerRelationFilter] = useState<'ALL' | 'SELF' | 'THIRD_PARTY'>('ALL');
    const [delivererFilter, setDelivererFilter] = useState('');
    const [inNameOfFilter, setInNameOfFilter] = useState('');
    const [bankFilter, setBankFilter] = useState('ALL');
    const [cashboxFilter, setCashboxFilter] = useState('ALL');
    const [dueDateFrom, setDueDateFrom] = useState('');
    const [dueDateTo, setDueDateTo] = useState('');
    const [docDateFrom, setDocDateFrom] = useState('');
    const [docDateTo, setDocDateTo] = useState('');
    const [minAmountFilter, setMinAmountFilter] = useState('');
    const [maxAmountFilter, setMaxAmountFilter] = useState('');
    const [sayadFilter, setSayadFilter] = useState<'ALL' | 'HAS_SAYAD' | 'NO_SAYAD'>('ALL');
    const [attachmentFilter, setAttachmentFilter] = useState<'ALL' | 'HAS_ATTACHMENT' | 'NO_ATTACHMENT'>('ALL');
    const [sourceFilter, setSourceFilter] = useState<'ALL' | 'APP_DRAFT' | 'SAYAN_DB'>('ALL');
    const [sortBy, setSortBy] = useState<
        'receiptNo' | 'poshtNomreh' | 'docDate' | 'nearestDueDate' | 'farthestDueDate' | 'totalAmount' | 'chequeCount' | 'personName' | 'inNameOf' | 'bankName' | 'sayadiRegType' | 'issuerRelation' | 'sayanStatus'
    >('receiptNo');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    // Modals
    const [inspectingArchiveCode, setInspectingArchiveCode] = useState<{ archiveCode: string | number; docNo?: string | number } | null>(null);
    const [reviewingReceipt, setReviewingReceipt] = useState<ChequeReceiptRecord | null>(null);
    const [selectedDetailReceipt, setSelectedDetailReceipt] = useState<ChequeReceiptRecord | null>(null);
    const [printReceipt, setPrintReceipt] = useState<any>(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [highlightedPersonIdx, setHighlightedPersonIdx] = useState(0);

    const sayanCalendarMonthData = useMemo(() => {
        const PERSIAN_MONTH_NAMES = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
        let daysCount = 30;
        if (calMonth >= 1 && calMonth <= 6) daysCount = 31;
        else if (calMonth >= 7 && calMonth <= 11) daysCount = 30;
        else daysCount = jalaali.isLeapJalaaliYear(calYear) ? 30 : 29;

        let firstDayIndex = 0;
        try {
            const g = jalaali.toGregorian(calYear, calMonth, 1);
            const gDate = new Date(g.gy, g.gm - 1, g.gd);
            firstDayIndex = (gDate.getDay() + 1) % 7;
        } catch(e) {}

        const dayChequesMap: Record<number, any[]> = {};
        for (let i = 1; i <= daysCount; i++) dayChequesMap[i] = [];

        let totalMonthAmount = 0;
        let totalMonthChequesCount = 0;
        let overdueChequesCount = 0;
        let todayChequesCount = 0;

        const todayStr = getTodayShamsi();

        receiptsList.forEach(rec => {
            (rec.cheques || []).forEach(c => {
                const dueDate = c.dueDate || rec.docDate;
                if (!dueDate) return;
                const cleanDate = String(dueDate).trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
                const parts = cleanDate.split(/[\/\.\-]/).map(p => parseInt(p, 10)).filter(n => !isNaN(n));
                if (parts.length === 3) {
                    let jy = parts[0] >= 1300 ? parts[0] : parts[2];
                    let jm = parts[1];
                    let jd = parts[0] >= 1300 ? parts[2] : parts[0];
                    if (jy < 100) jy += 1400;

                    if (jy === calYear && jm === calMonth && jd >= 1 && jd <= daysCount) {
                        const item = {
                            ...c,
                            receiptId: rec.id,
                            docNo: rec.docNo,
                            personName: rec.personName,
                            status: rec.status,
                            receiptRecord: rec,
                            dueDateStr: `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`
                        };
                        dayChequesMap[jd].push(item);

                        const amt = Number(c.amount || 0);
                        totalMonthAmount += amt;
                        totalMonthChequesCount++;

                        if (item.dueDateStr < todayStr && rec.status !== 'REGISTERED_IN_SAYAN') overdueChequesCount++;
                        if (item.dueDateStr === todayStr) todayChequesCount++;
                    }
                }
            });
        });

        return {
            monthName: PERSIAN_MONTH_NAMES[calMonth - 1] || '',
            daysCount,
            firstDayIndex,
            dayChequesMap,
            totalMonthAmount,
            totalMonthChequesCount,
            overdueChequesCount,
            todayChequesCount
        };
    }, [receiptsList, calYear, calMonth]);

    // Helper to safely extract and validate a receipt / posht-nomreh sequence number
    const extractValidReceiptSequence = (val: any): number | null => {
        if (val === null || val === undefined) return null;
        const s = String(val).trim();
        if (!s) return null;
        if (s.startsWith('SAYAN_') || s.startsWith('RCPT_') || s.startsWith('att_')) return null;
        const clean = s.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d]/g, '');
        if (!clean) return null;
        const n = parseInt(clean, 10);
        if (isNaN(n) || n <= 0) return null;
        // Reject Sayan system archive / header IDs (>= 5000)
        if (n >= 5000) return null;
        // Reject Persian solar calendar years (1390 to 1410)
        if (n >= 1390 && n <= 1410) return null;
        return n;
    };

    // Helper to extract the highest registered receipt sequence number from a list of records
    const getArchiveLatestSequence = (list: ChequeReceiptRecord[] = receiptsList) => {
        let maxNum = 0;
        for (const r of list) {
            const candidates = [r.receiptNo, r.poshtNomreh];
            if (Array.isArray(r.cheques)) {
                for (const ch of r.cheques) {
                    if (ch.poshtNomreh) candidates.push(ch.poshtNomreh);
                }
            }
            for (const val of candidates) {
                const n = extractValidReceiptSequence(val);
                if (n && n > maxNum) {
                    maxNum = n;
                }
            }
        }
        return maxNum > 0 ? maxNum : 848;
    };

    // Fetch Receipts
    const fetchMetaNumbers = async (overrideList?: ChequeReceiptRecord[]) => {
        const listToCheck = overrideList || receiptsList;
        const localMax = getArchiveLatestSequence(listToCheck);
        try {
            const res = await apiFetch(`/api/sayan/cheque-receipts/meta?fiscalYear=${fiscalYear}`);
            const data = await safeParseJson(res);
            if (data.success) {
                const apiNextRaw = data.nextPoshtNomreh || data.nextReceiptNo || data.nextAppReceiptNo;
                const apiNext = extractValidReceiptSequence(apiNextRaw);
                const computedNext = Math.max(apiNext || 0, localMax > 0 ? (localMax + 1) : 849);
                const nextStr = String(computedNext);
                setPoshtNomreh(nextStr);
                setReceiptNoInput(nextStr);
                return;
            }
        } catch (err) {
            console.error('Failed to fetch next posht nomreh', err);
        }
        const fallbackNext = localMax > 0 ? (localMax + 1) : 849;
        setPoshtNomreh(String(fallbackNext));
        setReceiptNoInput(String(fallbackNext));
    };

    const handleUpdateQuickReceiptNo = async (receiptId: string, newNo: string) => {
        const cleanNo = newNo.trim();
        if (!cleanNo) {
            setErrorMessage('لطفاً شماره رسید را وارد کنید.');
            return;
        }
        setSavingQuickReceiptNo(true);
        try {
            const res = await apiFetch(`/api/sayan/cheque-receipts/${receiptId}/update-receipt-no`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiptNo: cleanNo,
                    currentUser: { id: currentUser?.id, name: currentUser?.fullName || currentUser?.name }
                })
            });
            const data = await safeParseJson(res);
            if (data.success && data.receipt) {
                setReceiptsList(prev => prev.map(r => r.id === receiptId ? data.receipt : r));
                setEditingReceiptNoItem(null);
                setSuccessMessage(`شماره رسید با موفقیت به #${toPersianDigits(cleanNo)} تغییر یافت.`);
                setTimeout(() => setSuccessMessage(null), 3500);
            } else {
                setErrorMessage(data.error || 'خطا در ویرایش شماره رسید');
            }
        } catch (e: any) {
            setErrorMessage(e.message || 'خطا در ارتباط با سرور');
        } finally {
            setSavingQuickReceiptNo(false);
        }
    };

    const fetchReceipts = async (silent = false) => {
        if (!silent) setLoadingReceipts(true);
        try {
            const res = await apiFetch(`/api/sayan/cheque-receipts?fiscalYear=${fiscalYear}`);
            const data = await safeParseJson(res);
            if (data.success && Array.isArray(data.data)) {
                setReceiptsList(prev => {
                    if (prev.length === data.data.length && JSON.stringify(prev) === JSON.stringify(data.data)) {
                        return prev;
                    }
                    return data.data;
                });
                const maxInList = getArchiveLatestSequence(data.data);
                if (maxInList > 0) {
                    const nextStr = String(maxInList + 1);
                    setPoshtNomreh(prev => {
                        const parsedPrev = extractValidReceiptSequence(prev);
                        if (!prev || !parsedPrev || parsedPrev <= maxInList) {
                            return nextStr;
                        }
                        return prev;
                    });
                    setReceiptNoInput(prev => {
                        const parsedPrev = extractValidReceiptSequence(prev);
                        if (!prev || !parsedPrev || parsedPrev <= maxInList) {
                            return nextStr;
                        }
                        return prev;
                    });
                }
            }
        } catch (err: any) {
            console.error('Failed to fetch cheque receipts', err);
        } finally {
            if (!silent) setLoadingReceipts(false);
        }
    };

    useEffect(() => {
        fetchReceipts();
        fetchMetaNumbers();
        fetchCashboxes();
        const interval = setInterval(() => {
            fetchReceipts(true);
        }, 30000); // 30s gentle poll
        return () => clearInterval(interval);
    }, [fiscalYear]);

    // Listen for custom navigation / open events from Global Search
    useEffect(() => {
        const handleOpenChequeReceipt = (e: any) => {
            const detail = e.detail;
            if (!detail) return;
            const targetId = detail.receiptId || detail.id || detail.receiptNumber;
            const targetSearch = detail.searchTerm;
            setActiveSubTab('ARCHIVE');
            if (targetSearch) {
                setSearchTerm(targetSearch);
            }
            if (targetId) {
                const found = receiptsList.find(r => 
                    r.id === targetId || 
                    r.receiptNo === targetId || 
                    String(r.receiptNo) === String(targetId) ||
                    r.poshtNomreh === targetId ||
                    String(r.poshtNomreh) === String(targetId)
                );
                if (found) {
                    setSelectedDetailReceipt(found);
                } else if (!targetSearch) {
                    setSearchTerm(String(targetId));
                }
            }
        };
        window.addEventListener('OPEN_CHEQUE_RECEIPT' as any, handleOpenChequeReceipt);
        window.addEventListener('NAVIGATE_CHEQUE_RECEIPT' as any, handleOpenChequeReceipt);
        return () => {
            window.removeEventListener('OPEN_CHEQUE_RECEIPT' as any, handleOpenChequeReceipt);
            window.removeEventListener('NAVIGATE_CHEQUE_RECEIPT' as any, handleOpenChequeReceipt);
        };
    }, [receiptsList]);

    // Person Search
    const [allPersonsCache, setAllPersonsCache] = useState<SayanPerson[]>([]);

    const fetchPersons = async (q: string, force = false) => {
        setSearchingPersons(true);
        try {
            const res = await apiFetch(`/api/sayan/cheque-receipts/persons?query=${encodeURIComponent(q)}&fiscalYear=${fiscalYear}${force ? '&force=true' : ''}`);
            const data = await safeParseJson(res);
            if (data.success && Array.isArray(data.persons)) {
                setPersonSearchResults(data.persons);
                if (data.persons.length > 0) {
                    setPersonDropdownOpen(true);
                }
                if (!q && data.persons.length > 0) {
                    setAllPersonsCache(data.persons);
                }
                if (force) {
                    setSuccessMessage(`استعلام زنده سایان انجام شد (${toPersianDigits(data.persons.length)} طرف حساب فعال دریافت گردید).`);
                }
            }
        } catch (err) {
            console.error('Person search error', err);
        } finally {
            setSearchingPersons(false);
        }
    };

    const normalizeSearchText = (str: string) => {
        if (!str) return '';
        return str
            .replace(/^(آقای|خانم|شرکت|فروشگاه|کارخانه|مهندس|دکتر)\s+/gi, '')
            .replace(/[\u200c\u00a0\-_]/g, ' ')
            .replace(/\u064A/g, 'ی')
            .replace(/\u0649/g, 'ی')
            .replace(/\u0643/g, 'ک')
            .replace(/[\u0622\u0623\u0625]/g, 'ا')
            .replace(/\u0629/g, 'ه')
            .trim()
            .toLowerCase();
    };

    const displayedPersonResults = useMemo(() => {
        const q = (personQuery || '').trim();
        const baseList = (personSearchResults.length > 0 ? personSearchResults : allPersonsCache);
        if (!q) return baseList;

        const normQ = normalizeSearchText(q);
        const tokens = normQ.split(/\s+/).filter(t => t.length > 0);

        const filtered = baseList.filter(p => {
            const rawName = p.fullName || '';
            const normName = normalizeSearchText(rawName);
            const rawClean = rawName.replace(/[\u200c\u00a0\-_]/g, ' ').toLowerCase();
            const code = String(p.personCode || '').toLowerCase();
            const tafsili = String(p.tafsiliCode || '').toLowerCase();

            return tokens.every(t => normName.includes(t) || rawClean.includes(t) || code.includes(t) || tafsili.includes(t));
        });

        return filtered.sort((a, b) => {
            const nameA = normalizeSearchText(a.fullName || '');
            const nameB = normalizeSearchText(b.fullName || '');
            const pCodeA = String(a.personCode || '').toLowerCase();
            const pCodeB = String(b.personCode || '').toLowerCase();

            const scoreA = (nameA === normQ || pCodeA === normQ ? 10000 : 0) + (nameA.startsWith(normQ) ? 5000 : 0) + (nameA.includes(normQ) ? 2000 : 0);
            const scoreB = (nameB === normQ || pCodeB === normQ ? 10000 : 0) + (nameB.startsWith(normQ) ? 5000 : 0) + (nameB.includes(normQ) ? 2000 : 0);
            return scoreB - scoreA;
        });
    }, [personQuery, personSearchResults, allPersonsCache]);

    useEffect(() => {
        setHighlightedPersonIdx(0);
    }, [displayedPersonResults]);

    useEffect(() => {
        if (!personQuery || personQuery.trim().length === 0) {
            fetchPersons('');
            return;
        }
        const timer = setTimeout(() => {
            fetchPersons(personQuery.trim());
        }, 150);
        return () => clearTimeout(timer);
    }, [personQuery, fiscalYear]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (personContainerRef.current && !personContainerRef.current.contains(e.target as Node)) {
                setPersonDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Sum of cheque rows
    const sumChequesAmount = useMemo(() => {
        return chequeRows.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    }, [chequeRows]);

    const amountDiff = (Number(targetTotalAmount) || 0) - sumChequesAmount;

    // Global shortcut Ctrl+Enter to submit receipt from anywhere in the form
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                if (activeSubTab === 'NEW_RECEIPT') {
                    e.preventDefault();
                    document.getElementById('btn-submit-cheque-receipt')?.click();
                }
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [activeSubTab]);

    // Handle Keyboard Enter Navigation across fields
    const handleEnterNext = (rowIdx: number, field: string) => {
        if (field === 'person') {
            const el = document.getElementById('input-posht-nomreh') as HTMLInputElement | null;
            el?.focus();
            el?.select?.();
        } else if (field === 'poshtNomreh') {
            const el = document.getElementById('input-target-amount') as HTMLInputElement | null;
            el?.focus();
            el?.select?.();
        } else if (field === 'targetAmount') {
            const el = document.getElementById('input-doc-desc') as HTMLInputElement | null;
            el?.focus();
            el?.select?.();
        } else if (field === 'docDesc') {
            const el = document.getElementById('cheque-0-number') as HTMLInputElement | null;
            el?.focus();
            el?.select?.();
        } else if (field === 'number') {
            const el = document.getElementById(`cheque-${rowIdx}-amount`) as HTMLInputElement | null;
            el?.focus();
            el?.select?.();
        } else if (field === 'amount') {
            const el = document.getElementById(`cheque-${rowIdx}-dueDate`) as HTMLInputElement | null;
            el?.focus();
            el?.select?.();
        } else if (field === 'dueDate') {
            const el = document.getElementById(`cheque-${rowIdx}-bankName`) as HTMLInputElement | null;
            el?.focus();
            el?.select?.();
        } else if (field === 'bankName') {
            const el = document.getElementById(`cheque-${rowIdx}-inNameOf`) as HTMLInputElement | null;
            el?.focus();
            el?.select?.();
        } else if (field === 'inNameOf') {
            const el = document.getElementById(`cheque-${rowIdx}-description`) as HTMLInputElement | null;
            el?.focus();
            el?.select?.();
        } else if (field === 'description') {
            if (rowIdx === chequeRows.length - 1) {
                // If row has content, add next row; if empty, focus submit
                if (chequeRows[rowIdx]?.chequeNumber || chequeRows[rowIdx]?.amount) {
                    handleAddChequeRow(true);
                } else {
                    document.getElementById('btn-submit-cheque-receipt')?.focus();
                }
            } else {
                const el = document.getElementById(`cheque-${rowIdx + 1}-number`) as HTMLInputElement | null;
                el?.focus();
                el?.select?.();
            }
        }
    };

    // 4-Way Arrow Key Navigation across rows and columns
    const handleArrowNavigate = (rowIdx: number, field: string, direction: 'up' | 'down' | 'left' | 'right') => {
        const columns = ['number', 'amount', 'dueDate', 'bankName', 'inNameOf', 'description'];
        const colIdx = columns.indexOf(field);

        if (direction === 'up') {
            if (rowIdx > 0) {
                const prevInput = document.getElementById(`cheque-${rowIdx - 1}-${field}`) as HTMLInputElement | null;
                if (prevInput) {
                    prevInput.focus();
                    prevInput.select?.();
                }
            } else {
                // Moving up from Row 0 to Header
                if (field === 'number') {
                    const el = document.getElementById('input-posht-nomreh') as HTMLInputElement | null;
                    el?.focus();
                    el?.select?.();
                } else if (field === 'amount') {
                    const el = document.getElementById('input-target-amount') as HTMLInputElement | null;
                    el?.focus();
                    el?.select?.();
                } else if (field === 'dueDate') {
                    const el = document.getElementById('input-doc-date') as HTMLInputElement | null;
                    el?.focus();
                    el?.select?.();
                } else {
                    const el = document.getElementById('input-doc-desc') as HTMLInputElement | null;
                    el?.focus();
                    el?.select?.();
                }
            }
        } else if (direction === 'down') {
            if (rowIdx < chequeRows.length - 1) {
                const nextInput = document.getElementById(`cheque-${rowIdx + 1}-${field}`) as HTMLInputElement | null;
                if (nextInput) {
                    nextInput.focus();
                    nextInput.select?.();
                }
            } else {
                // If on last row, auto-add row if current row has data, or focus submit button
                if (chequeRows[rowIdx]?.chequeNumber || chequeRows[rowIdx]?.amount) {
                    handleAddChequeRow(false);
                    setTimeout(() => {
                        const target = document.getElementById(`cheque-${rowIdx + 1}-${field}`) as HTMLInputElement | null;
                        if (target) {
                            target.focus();
                            target.select?.();
                        }
                    }, 60);
                } else {
                    document.getElementById('btn-submit-cheque-receipt')?.focus();
                }
            }
        } else if (direction === 'left') {
            // In Persian RTL: left arrow is forward (next column)
            if (colIdx >= 0 && colIdx < columns.length - 1) {
                const nextField = columns[colIdx + 1];
                const nextEl = document.getElementById(`cheque-${rowIdx}-${nextField}`) as HTMLInputElement | null;
                if (nextEl) {
                    nextEl.focus();
                    nextEl.select?.();
                }
            } else if (colIdx === columns.length - 1) {
                if (rowIdx < chequeRows.length - 1) {
                    const nextRowEl = document.getElementById(`cheque-${rowIdx + 1}-number`) as HTMLInputElement | null;
                    if (nextRowEl) {
                        nextRowEl.focus();
                        nextRowEl.select?.();
                    }
                } else {
                    document.getElementById('btn-submit-cheque-receipt')?.focus();
                }
            }
        } else if (direction === 'right') {
            // In Persian RTL: right arrow is backward (previous column)
            if (colIdx > 0) {
                const prevField = columns[colIdx - 1];
                const prevEl = document.getElementById(`cheque-${rowIdx}-${prevField}`) as HTMLInputElement | null;
                if (prevEl) {
                    prevEl.focus();
                    prevEl.select?.();
                }
            } else if (colIdx === 0) {
                if (rowIdx > 0) {
                    const prevRowEl = document.getElementById(`cheque-${rowIdx - 1}-description`) as HTMLInputElement | null;
                    if (prevRowEl) {
                        prevRowEl.focus();
                        prevRowEl.select?.();
                    }
                } else {
                    const descEl = document.getElementById('input-doc-desc') as HTMLInputElement | null;
                    descEl?.focus();
                    descEl?.select?.();
                }
            }
        }
    };

    // Row management
    const handleChequeRowChange = (index: number, field: keyof ChequeItemInput, value: any) => {
        setChequeRows(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const handleAddChequeRow = (autoFocus = false) => {
        const newId = String(Date.now());
        setChequeRows(prev => [
            ...prev,
            {
                id: newId,
                chequeNumber: '',
                sayadId: '',
                amount: '',
                dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                bankName: 'سامان',
                inNameOf: selectedPerson ? selectedPerson.fullName : '',
                accountNo: '',
                description: '',
                registrationType: '',
                registeredPersonName: '',
                isCustomerSelfIssuer: true
            }
        ]);
        if (autoFocus) {
            setTimeout(() => {
                document.getElementById(`cheque-${chequeRows.length}-number`)?.focus();
            }, 50);
        }
    };

    const handleDuplicateChequeRow = (index: number) => {
        const source = chequeRows[index];
        if (!source) return;
        const newId = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 6);
        setChequeRows(prev => {
            const next = [...prev];
            next.splice(index + 1, 0, {
                ...source,
                id: newId,
                chequeNumber: '',
                sayadId: ''
            });
            return next;
        });
        setTimeout(() => {
            document.getElementById(`cheque-${index + 1}-number`)?.focus();
        }, 50);
    };

    const registeredPersonSuggestions = useMemo(() => {
        const names = new Set<string>();
        chequeRows.forEach(r => {
            if (r.registeredPersonName?.trim()) names.add(r.registeredPersonName.trim());
        });
        receiptsList.forEach(rec => {
            (rec.cheques || []).forEach(c => {
                if (c.registeredPersonName?.trim()) names.add(c.registeredPersonName.trim());
            });
        });
        allPersonsCache.forEach(p => {
            if (p.fullName?.trim()) names.add(p.fullName.trim());
        });
        return Array.from(names).slice(0, 60);
    }, [chequeRows, receiptsList, allPersonsCache]);

    const handleDeleteChequeRow = (index: number) => {
        if (chequeRows.length <= 1) return;
        setChequeRows(prev => prev.filter((_, i) => i !== index));
    };

    // File attachments handler (PDF / Images)
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const dataUrl = ev.target?.result as string;
                if (!dataUrl) return;

                let serverUrl = '';
                try {
                    const uploadRes = await apiFetch('/api/upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            fileName: file.name,
                            fileData: dataUrl
                        })
                    });
                    if (uploadRes.ok) {
                        const json = await safeParseJson(uploadRes);
                        serverUrl = json.url || '';
                    }
                } catch (err) {
                    console.warn('Upload fallback:', err);
                }

                setAttachments(prev => [
                    ...prev,
                    {
                        fileName: file.name,
                        fileData: serverUrl ? undefined : dataUrl,
                        url: serverUrl || undefined,
                        fileType: file.type,
                        fileSize: file.size,
                        uploadedAt: new Date().toISOString()
                    }
                ]);
            };
            reader.readAsDataURL(file);
        }
    };

    // Form Submission: Create Cheque Receipt
    const handleSubmitReceipt = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!selectedPerson) {
            setErrorMessage('انتخاب طرف حساب از بین اشخاص معتبر سیستم سایان اجباری است. لطفاً نام یا کد شخص را جستجو کرده و از لیست پیشنهادها انتخاب کنید.');
            document.getElementById('input-person-name')?.focus();
            return;
        }

        if (chequeRows.some(r => !String(r.chequeNumber || '').trim() || !r.amount)) {
            setErrorMessage('شماره چک و مبلغ برای تمامی ردیف‌های چک الزامی است.');
            return;
        }

        for (let i = 0; i < chequeRows.length; i++) {
            const r = chequeRows[i];
            if (!r.registrationType) {
                setErrorMessage(`لطفاً وضعیت ثبت صیادی (به نام شرکت، به نام شخص یا ثبت نشده) را برای ردیف چک ${toPersianDigits(i + 1)} انتخاب نمایید.`);
                document.getElementById(`cheque-${i}-number`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            if (r.registrationType === 'person' && !String(r.registeredPersonName || '').trim()) {
                setErrorMessage(`لطفاً نام شخص ثبت‌شده در صیاد را برای ردیف چک ${toPersianDigits(i + 1)} وارد نمایید.`);
                document.getElementById(`cheque-${i}-registeredPersonName`)?.focus();
                return;
            }
        }

        setActionLoading('submit_new');

        try {
            const sanitizedAttachments = (attachments || []).map(att =>
                att.url ? { ...att, fileData: undefined } : att
            );
            const resolvedDocDate = fromShamsiStr(docDateShamsi) || new Date().toISOString().slice(0, 10);

            const payload = {
                fiscalYear,
                receiptNo: receiptNoInput.trim() || undefined,
                poshtNomreh: poshtNomreh.trim() || '1',
                docDate: resolvedDocDate,
                docDateShamsi: docDateShamsi.trim(),
                personCode: selectedPerson ? selectedPerson.personCode : '101',
                personName: selectedPerson ? selectedPerson.fullName : personQuery.trim(),
                cashboxCode,
                totalAmount: sumChequesAmount,
                description: description.trim() || `رسید دریافت چک - ${selectedPerson?.fullName || personQuery}`,
                cheques: chequeRows.map((r, idx) => ({
                    id: r.id,
                    chequeNumber: String(r.chequeNumber || '').trim(),
                    sayadId: normalizeToAsciiDigits(r.sayadId || '').replace(/[^0-9]/g, '').slice(0, 16),
                    amount: Number(r.amount),
                    dueDate: r.dueDate,
                    bankName: r.bankName.trim() || 'سامان',
                    inNameOf: r.inNameOf.trim() || (selectedPerson?.fullName || personQuery.trim()),
                    accountNo: String(r.accountNo || '').trim(),
                    poshtNomreh: poshtNomreh.trim() || '1',
                    rowSeq: idx + 1,
                    description: r.description?.trim() || '',
                    registrationType: r.registrationType || '',
                    registeredPersonName: r.registrationType === 'person' ? String(r.registeredPersonName || '').trim() : '',
                    isCustomerSelfIssuer: Boolean(r.isCustomerSelfIssuer)
                })),
                attachments: sanitizedAttachments,
                createdByName: currentUser?.name || 'کاربر سیستم'
            };

            const res = await apiFetch('/api/sayan/cheque-receipts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await safeParseJson(res);
            if (data.success) {
                const createdReceipt = {
                    ...(data.receipt || {}),
                    id: data.receipt?.id || data.id || data.receiptNo || String(Date.now()),
                    receiptNo: data.receipt?.receiptNo || data.receiptNo || data.id,
                    poshtNomreh: payload.poshtNomreh,
                    personCode: payload.personCode,
                    personName: payload.personName,
                    cashboxCode: payload.cashboxCode,
                    cashboxTitle: cashboxesList.find(b => b.code === cashboxCode)?.title || 'صندوق چک',
                    totalAmount: payload.totalAmount,
                    description: payload.description,
                    docDate: payload.docDate,
                    docDateShamsi: docDateShamsi,
                    createdAt: new Date().toISOString(),
                    cheques: data.receipt?.cheques || payload.cheques,
                    attachments: (data.receipt?.attachments && data.receipt.attachments.length > 0) ? data.receipt.attachments : payload.attachments,
                    status: data.receipt?.status || 'PENDING_ACCOUNTING',
                    createdByName: currentUser?.name || 'ثبت‌کننده'
                };

                setSuccessMessage(`رسید دریافت چک با شماره #${toPersianDigits(createdReceipt.receiptNo || createdReceipt.id)} ثبت شد و به همراه پیوست‌ها آماده چاپ گردید.`);

                // Immediately open the A5 print & inspection modal with attachments
                setPrintReceipt(createdReceipt);
                setIsPrintModalOpen(true);

                // Reset form for next entry with automatic +1 from the newly created receipt
                const cleanSubmittedNo = String(payload.poshtNomreh || payload.receiptNo || '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d]/g, '');
                const submittedNum = parseInt(cleanSubmittedNo, 10);
                const nextSeqNo = (submittedNum > 0 && submittedNum < 50000) ? String(submittedNum + 1) : '';

                setPersonQuery('');
                setSelectedPerson(null);
                setPoshtNomreh(nextSeqNo);
                setReceiptNoInput(nextSeqNo);
                setCashboxCode('11001');
                setTargetTotalAmount('');
                setDescription('');
                setAttachments([]);
                setChequeRows([
                    {
                        id: '1',
                        chequeNumber: '',
                        sayadId: '',
                        amount: '',
                        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                        bankName: 'سامان',
                        inNameOf: '',
                        accountNo: '',
                        description: '',
                        registrationType: '',
                        registeredPersonName: '',
                        isCustomerSelfIssuer: true
                    }
                ]);
                fetchReceipts(true);
                fetchMetaNumbers();
            } else {
                setErrorMessage(data.error || 'خطا در ثبت رسید چک');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'خطا در ارتباط با سرور');
        } finally {
            setActionLoading(null);
        }
    };

    // Accounting Review / Pure Edit Save
    const handleSaveAccountingReview = async (receiptId: string, updatedData: any, isApproveForCEO: boolean) => {
        setActionLoading('accounting_review');
        try {
            const endpoint = isApproveForCEO 
                ? `/api/sayan/cheque-receipts/${receiptId}/accounting-review`
                : `/api/sayan/cheque-receipts/${receiptId}`;

            const res = await apiFetch(endpoint, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...updatedData,
                    approveForCEO: isApproveForCEO,
                    reviewerId: currentUser?.id,
                    reviewerName: currentUser?.name || 'کارشناس حسابداری'
                })
            });

            const data = await safeParseJson(res);
            if (data.success) {
                const isCeoRequired = workflowConfig?.requireCeoApproval !== false;
                const isAutoRegistered = !isCeoRequired && workflowConfig?.autoRegisterAfterAccounting;
                const msg = isApproveForCEO 
                    ? (isAutoRegistered 
                        ? 'رسید چک با موفقیت تایید و مستقیماً در صف صدور سند سایان قرار گرفت.'
                        : (isCeoRequired 
                            ? 'رسید چک با موفقیت تایید و جهت تایید نهایی به کارتابل مدیرعامل ارسال گردید.' 
                            : 'رسید چک با موفقیت تایید شد و آماده ثبت نهایی در سایان گردید.'))
                    : 'تغییرات رسید در همین مرحله با موفقیت ذخیره شد.';
                setSuccessMessage(msg);
                setReviewingReceipt(null);
                fetchReceipts(true);
            } else {
                setErrorMessage(data.error || 'خطا در ذخیره تغییرات رسید');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'خطا در برقراری ارتباط');
        } finally {
            setActionLoading(null);
        }
    };

    // CEO Approval & Direct Sayan Registration
    const handleApproveByCeo = async (receiptId: string) => {
        setActionLoading(receiptId);
        try {
            const res = await apiFetch(`/api/sayan/cheque-receipts/${receiptId}/ceo-approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    approverId: currentUser?.id,
                    approverName: currentUser?.name || 'مدیرعامل'
                })
            });

            const data = await safeParseJson(res);
            if (data.success) {
                setSuccessMessage(`رسید تایید شد و سند سایان با شماره ${toPersianDigits(data.sayanDocNo || data.docNo)} و کد بایگانی ${toPersianDigits(data.sayanArchiveCode || data.archiveCode)} در ERP سایان صادر گردید.`);
                setSelectedDetailReceipt(null);
                fetchReceipts(true);
            } else {
                setErrorMessage(data.error || 'خطا در ثبت سند در سایان');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'خطا در ثبت نهایی');
        } finally {
            setActionLoading(null);
        }
    };

    // Reject / Return
    const handleReject = async (receiptId: string) => {
        let reason = 'عودت جهت بررسی و اصلاح';
        try {
            const prompted = window.prompt('لطفاً دلیل عدم تایید یا عودت رسید را وارد نمایید:', reason);
            if (prompted === null) return;
            if (prompted.trim()) reason = prompted.trim();
        } catch {
            // Fallback if prompt is blocked in WebView
        }

        setActionLoading(receiptId);
        try {
            const res = await apiFetch(`/api/sayan/cheque-receipts/${receiptId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rejectReason: reason,
                    rejectedBy: currentUser?.name || 'کاربر'
                })
            });

            const data = await safeParseJson(res);
            if (data.success) {
                setSuccessMessage('رسید چک عودت داده شد.');
                setSelectedDetailReceipt(null);
                fetchReceipts(true);
            } else {
                setErrorMessage(data.error || 'خطا در عودت رسید');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'خطا در عودت');
        } finally {
            setActionLoading(null);
        }
    };

    // Full Draft / Receipt Delete
    const handleDeleteReceipt = async (receiptId: string) => {
        setActionLoading(receiptId);
        try {
            const res = await apiFetch('/api/sayan/cheque-receipts/delete-draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiptId })
            });

            const data = await safeParseJson(res);
            if (data.success) {
                setSuccessMessage('رسید دریافت چک با موفقیت حذف گردید.');
                setSelectedDetailReceipt(null);
                fetchReceipts(true);
            } else {
                setErrorMessage(data.error || 'خطا در حذف رسید');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'خطا در برقراری ارتباط جهت حذف');
        } finally {
            setActionLoading(null);
        }
    };

    // Fix invalid Sanad 1 receipts
    const [fixingSanadOne, setFixingSanadOne] = useState(false);
    const handleFixSanadOneReceipts = async () => {
        setFixingSanadOne(true);
        try {
            const res = await apiFetch('/api/sayan/cheque-receipts/fix-invalid-sanad-one', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fiscalYear })
            });
            const data = await safeParseJson(res);
            if (data.success) {
                setSuccessMessage(data.message || `${data.count} رسید اصلاح و آماده ثبت مجدد در سایان گردید.`);
                fetchReceipts(true);
            } else {
                setErrorMessage(data.error || 'خطا در اصلاح اسناد سند ۱');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'خطا در ارتباط با سرور');
        } finally {
            setFixingSanadOne(false);
        }
    };

    // Re-register a single receipt into Sayan
    const handleReRegisterInSayan = async (receiptId: string) => {
        setActionLoading(receiptId);
        try {
            const res = await apiFetch(`/api/sayan/cheque-receipts/${receiptId}/re-register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiptId, currentUser })
            });
            const data = await safeParseJson(res);
            if (data.success) {
                setSuccessMessage(`رسید با موفقیت در سایان ثبت شد. شماره سند: ${toPersianDigits(data.docNo || '-')}، کد بایگانی: ${toPersianDigits(data.archiveCode || '-')}`);
                setSelectedDetailReceipt(null);
                fetchReceipts(true);
            } else {
                setErrorMessage(data.error || 'خطا در ثبت مجدد در سایان');
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'خطا در ارتباط با سایان جهت ثبت مجدد');
        } finally {
            setActionLoading(null);
        }
    };

    // Filtered lists
    const pendingAccountingList = useMemo(() => {
        return receiptsList.filter(r => r.status === 'PENDING_ACCOUNTING');
    }, [receiptsList]);

    const pendingCeoList = useMemo(() => {
        return receiptsList.filter(r => r.status === 'PENDING_CEO');
    }, [receiptsList]);

    // Auto-poll to seamlessly reflect background Sayan registration completions
    useEffect(() => {
        const hasProcessing = receiptsList.some(r => r.status === 'PROCESSING_SAYAN' || r.sayanSyncStatus === 'QUEUED' || r.sayanSyncStatus === 'PROCESSING');
        if (!hasProcessing) return;

        const interval = setInterval(() => {
            fetchReceipts(true);
        }, 3000);

        return () => clearInterval(interval);
    }, [receiptsList]);

    // Archive Helpers: Shamsi normalization, self-issuer resolution, simultaneous filtering & multi-parameter sorting
    const normalizeFilterShamsi = (val?: string | Date | null): string => {
        if (!val) return '';
        const shamsi = toShamsiStr(val);
        const ascii = normalizeToAsciiDigits(shamsi).trim();
        const match = ascii.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
        if (match) {
            return `${match[1]}/${match[2].padStart(2, '0')}/${match[3].padStart(2, '0')}`;
        }
        return '';
    };

    const resolveChequeSelfIssuer = (r: ChequeReceiptRecord, c: NonNullable<ChequeReceiptRecord['cheques']>[number]): boolean | null => {
        if (c.isCustomerSelfIssuer === true) return true;
        if (c.isCustomerSelfIssuer === false) return false;
        const pName = normalizeSearchText(r.personName || '');
        const inName = normalizeSearchText(c.inNameOf || '');
        if (pName && inName) {
            return pName === inName || pName.includes(inName) || inName.includes(pName);
        }
        return null;
    };

    const isNeedsSayanReregister = (r: ChequeReceiptRecord): boolean => {
        return String(r.docNo) === '1' || String(r.archiveCode) === '1';
    };

    const isProcessingSayan = (r: ChequeReceiptRecord): boolean => {
        return r.status === 'PROCESSING_SAYAN' || r.sayanSyncStatus === 'QUEUED' || r.sayanSyncStatus === 'PROCESSING';
    };

    const isRegisteredInSayan = (r: ChequeReceiptRecord): boolean => {
        return !isNeedsSayanReregister(r) && !isProcessingSayan(r) && (r.status === 'REGISTERED_IN_SAYAN' || r.source === 'SAYAN_DB');
    };

    const availableArchiveBanks = useMemo(() => {
        const set = new Set<string>(COMMON_IRANIAN_BANKS);
        receiptsList.forEach(r => {
            (r.cheques || []).forEach(c => {
                if (c.bankName && c.bankName.trim()) set.add(c.bankName.trim());
            });
        });
        return Array.from(set);
    }, [receiptsList]);

    const archivePersonSuggestions = useMemo(() => {
        const set = new Set<string>();
        receiptsList.forEach(r => {
            if (r.personName?.trim()) set.add(r.personName.trim());
        });
        return Array.from(set).slice(0, 120);
    }, [receiptsList]);

    const archiveInNameOfSuggestions = useMemo(() => {
        const set = new Set<string>();
        receiptsList.forEach(r => {
            (r.cheques || []).forEach(c => {
                if (c.inNameOf?.trim()) set.add(c.inNameOf.trim());
            });
        });
        return Array.from(set).slice(0, 120);
    }, [receiptsList]);

    const archiveRegisteredPersonSuggestions = useMemo(() => {
        const set = new Set<string>();
        receiptsList.forEach(r => {
            (r.cheques || []).forEach(c => {
                if (c.registeredPersonName?.trim()) set.add(c.registeredPersonName.trim());
            });
        });
        return Array.from(set).slice(0, 120);
    }, [receiptsList]);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (searchTerm.trim()) count++;
        if (statusFilter !== 'ALL') count++;
        if (sayanRegFilter !== 'ALL') count++;
        if (sayadiRegTypeFilter !== 'ALL') count++;
        if (registeredPersonFilter.trim()) count++;
        if (issuerRelationFilter !== 'ALL') count++;
        if (delivererFilter.trim()) count++;
        if (inNameOfFilter.trim()) count++;
        if (bankFilter !== 'ALL') count++;
        if (cashboxFilter !== 'ALL') count++;
        if (dueDateFrom.trim()) count++;
        if (dueDateTo.trim()) count++;
        if (docDateFrom.trim()) count++;
        if (docDateTo.trim()) count++;
        if (minAmountFilter.trim()) count++;
        if (maxAmountFilter.trim()) count++;
        if (sayadFilter !== 'ALL') count++;
        if (attachmentFilter !== 'ALL') count++;
        if (sourceFilter !== 'ALL') count++;
        return count;
    }, [
        searchTerm, statusFilter, sayanRegFilter, sayadiRegTypeFilter, registeredPersonFilter,
        issuerRelationFilter, delivererFilter, inNameOfFilter, bankFilter, cashboxFilter,
        dueDateFrom, dueDateTo, docDateFrom, docDateTo, minAmountFilter, maxAmountFilter,
        sayadFilter, attachmentFilter, sourceFilter
    ]);

    const resetArchiveFilters = () => {
        setSearchTerm('');
        setStatusFilter('ALL');
        setSayanRegFilter('ALL');
        setSayadiRegTypeFilter('ALL');
        setRegisteredPersonFilter('');
        setIssuerRelationFilter('ALL');
        setDelivererFilter('');
        setInNameOfFilter('');
        setBankFilter('ALL');
        setCashboxFilter('ALL');
        setDueDateFrom('');
        setDueDateTo('');
        setDocDateFrom('');
        setDocDateTo('');
        setMinAmountFilter('');
        setMaxAmountFilter('');
        setSayadFilter('ALL');
        setAttachmentFilter('ALL');
        setSourceFilter('ALL');
    };

    const archiveList = useMemo(() => {
        const qNorm = normalizeSearchText(searchTerm);
        const qAscii = normalizeToAsciiDigits(searchTerm).trim().toLowerCase();
        const delivNorm = normalizeSearchText(delivererFilter);
        const delivAscii = normalizeToAsciiDigits(delivererFilter).trim().toLowerCase();
        const inNameNorm = normalizeSearchText(inNameOfFilter);
        const regPersonNorm = normalizeSearchText(registeredPersonFilter);
        const normDueFrom = normalizeFilterShamsi(dueDateFrom);
        const normDueTo = normalizeFilterShamsi(dueDateTo);
        const normDocFrom = normalizeFilterShamsi(docDateFrom);
        const normDocTo = normalizeFilterShamsi(docDateTo);
        const minAmt = minAmountFilter.trim() ? Number(normalizeToAsciiDigits(minAmountFilter).replace(/[^\d]/g, '')) : null;
        const maxAmt = maxAmountFilter.trim() ? Number(normalizeToAsciiDigits(maxAmountFilter).replace(/[^\d]/g, '')) : null;

        const filtered = receiptsList.filter(r => {
            const cheques = Array.isArray(r.cheques) ? r.cheques : [];

            // 1. Global multi-field search
            if (qAscii || qNorm) {
                const matchHeader =
                    normalizeSearchText(r.personName || '').includes(qNorm) ||
                    String(r.personCode || '').toLowerCase().includes(qAscii) ||
                    normalizeToAsciiDigits(String(r.receiptNo || '')).toLowerCase().includes(qAscii) ||
                    normalizeToAsciiDigits(String(r.poshtNomreh || '')).toLowerCase().includes(qAscii) ||
                    normalizeToAsciiDigits(String(r.docNo || '')).toLowerCase().includes(qAscii) ||
                    normalizeToAsciiDigits(String(r.archiveCode || '')).toLowerCase().includes(qAscii) ||
                    normalizeSearchText(r.description || '').includes(qNorm) ||
                    normalizeSearchText(r.createdByName || '').includes(qNorm);

                const matchCheques = cheques.some(c =>
                    normalizeToAsciiDigits(String(c.chequeNumber || '')).toLowerCase().includes(qAscii) ||
                    normalizeToAsciiDigits(String(c.sayadId || '')).toLowerCase().includes(qAscii) ||
                    normalizeSearchText(c.bankName || '').includes(qNorm) ||
                    normalizeSearchText(c.inNameOf || '').includes(qNorm) ||
                    normalizeSearchText(c.registeredPersonName || '').includes(qNorm) ||
                    normalizeSearchText(c.description || '').includes(qNorm)
                );

                if (!matchHeader && !matchCheques) return false;
            }

            // 2. Process status filter
            if (statusFilter !== 'ALL') {
                if (statusFilter === 'REGISTERED_IN_SAYAN') {
                    if (r.status !== 'REGISTERED_IN_SAYAN' && r.status !== 'PROCESSING_SAYAN') return false;
                } else if (r.status !== statusFilter) {
                    return false;
                }
            }

            // 3. Sayan registration status filter (ثبت شده / ثبت نشده در سایان)
            if (sayanRegFilter !== 'ALL') {
                if (sayanRegFilter === 'REGISTERED' && !isRegisteredInSayan(r)) return false;
                if (sayanRegFilter === 'UNREGISTERED' && (isRegisteredInSayan(r) || isProcessingSayan(r))) return false;
                if (sayanRegFilter === 'PROCESSING' && !isProcessingSayan(r)) return false;
                if (sayanRegFilter === 'NEEDS_REREGISTER' && !isNeedsSayanReregister(r)) return false;
            }

            // 4. Sayadi registration type filter (به نام شرکت / شخص / ثبت نشده / نامشخص)
            if (sayadiRegTypeFilter !== 'ALL') {
                const matchType = cheques.some(c => {
                    const rt = c.registrationType || '';
                    if (sayadiRegTypeFilter === 'unspecified') return !rt;
                    return rt === sayadiRegTypeFilter;
                });
                if (!matchType) return false;
            }

            // 5. Registered person name (نام شخص ثبت‌شده در صیاد)
            if (regPersonNorm) {
                const matchRegPerson = cheques.some(c =>
                    normalizeSearchText(c.registeredPersonName || '').includes(regPersonNorm)
                );
                if (!matchRegPerson) return false;
            }

            // 6. Customer self-issuer vs third party (صاحب چک با تحویل‌دهنده یکی است؟)
            if (issuerRelationFilter !== 'ALL') {
                const matchIssuer = cheques.some(c => {
                    const rel = resolveChequeSelfIssuer(r, c);
                    if (issuerRelationFilter === 'SELF') return rel === true;
                    if (issuerRelationFilter === 'THIRD_PARTY') return rel === false;
                    return false;
                });
                if (!matchIssuer) return false;
            }

            // 7. Deliverer / Person name or code (نام تحویل‌دهنده چک / طرف حساب)
            if (delivNorm || delivAscii) {
                const matchDeliverer =
                    normalizeSearchText(r.personName || '').includes(delivNorm) ||
                    String(r.personCode || '').toLowerCase().includes(delivAscii);
                if (!matchDeliverer) return false;
            }

            // 8. In Name Of (صاحب چک / در وجه / صادرکننده)
            if (inNameNorm) {
                const matchInName = cheques.some(c =>
                    normalizeSearchText(c.inNameOf || '').includes(inNameNorm)
                );
                if (!matchInName) return false;
            }

            // 9. Bank filter
            if (bankFilter !== 'ALL') {
                const normTargetBank = normalizeSearchText(bankFilter);
                const matchBank = cheques.some(c => normalizeSearchText(c.bankName || '') === normTargetBank || normalizeSearchText(c.bankName || '').includes(normTargetBank));
                if (!matchBank) return false;
            }

            // 10. Cashbox filter
            if (cashboxFilter !== 'ALL') {
                if (String(r.cashboxCode || '').trim() !== cashboxFilter) return false;
            }

            // 11. Cheque Due Date range (Shamsi)
            if (normDueFrom || normDueTo) {
                const matchDue = cheques.some(c => {
                    const cShamsi = normalizeFilterShamsi(c.dueDate);
                    if (!cShamsi) return false;
                    if (normDueFrom && cShamsi < normDueFrom) return false;
                    if (normDueTo && cShamsi > normDueTo) return false;
                    return true;
                });
                if (!matchDue) return false;
            }

            // 12. Receipt Doc Date range (Shamsi)
            if (normDocFrom || normDocTo) {
                const rShamsi = normalizeFilterShamsi(r.docDateShamsi || r.docDate || r.createdAt);
                if (!rShamsi) return false;
                if (normDocFrom && rShamsi < normDocFrom) return false;
                if (normDocTo && rShamsi > normDocTo) return false;
            }

            // 13. Amount range (Rial)
            const totalAmt = Number(r.totalAmount || 0);
            if (minAmt !== null && !isNaN(minAmt) && totalAmt < minAmt) return false;
            if (maxAmt !== null && !isNaN(maxAmt) && totalAmt > maxAmt) return false;

            // 14. Sayad ID presence filter
            if (sayadFilter !== 'ALL') {
                const hasSayad = cheques.some(c => Boolean(c.sayadId && String(c.sayadId).trim().length > 0));
                if (sayadFilter === 'HAS_SAYAD' && !hasSayad) return false;
                if (sayadFilter === 'NO_SAYAD' && hasSayad) return false;
            }

            // 15. Attachments filter
            if (attachmentFilter !== 'ALL') {
                const hasAtt = Array.isArray(r.attachments) && r.attachments.length > 0;
                if (attachmentFilter === 'HAS_ATTACHMENT' && !hasAtt) return false;
                if (attachmentFilter === 'NO_ATTACHMENT' && hasAtt) return false;
            }

            // 16. Source filter (APP_DRAFT vs SAYAN_DB)
            if (sourceFilter !== 'ALL') {
                if (r.source !== sourceFilter) return false;
            }

            return true;
        });

        // Multi-parameter sorting
        const regOrder: Record<string, number> = { company: 1, person: 2, unregistered: 3 };
        const sayanStatusOrder = (rec: ChequeReceiptRecord): number => {
            if (isRegisteredInSayan(rec)) return 4;
            if (isProcessingSayan(rec)) return 3;
            if (isNeedsSayanReregister(rec)) return 2;
            if (rec.status === 'PENDING_CEO') return 1;
            return 0;
        };

        const getNearestDue = (rec: ChequeReceiptRecord): string => {
            const dates = (rec.cheques || []).map(c => normalizeFilterShamsi(c.dueDate)).filter(Boolean).sort();
            return dates[0] || '';
        };
        const getFarthestDue = (rec: ChequeReceiptRecord): string => {
            const dates = (rec.cheques || []).map(c => normalizeFilterShamsi(c.dueDate)).filter(Boolean).sort();
            return dates[dates.length - 1] || '';
        };
        const getNumSeq = (val: any, fallback = 0): number => {
            const clean = normalizeToAsciiDigits(String(val || '')).replace(/[^\d]/g, '');
            return clean ? parseInt(clean, 10) : fallback;
        };

        const dirMult = sortDir === 'asc' ? 1 : -1;

        return [...filtered].sort((a, b) => {
            let cmp = 0;
            switch (sortBy) {
                case 'receiptNo': {
                    const aVal = getNumSeq(a.receiptNo || a.docNo || a.archiveCode);
                    const bVal = getNumSeq(b.receiptNo || b.docNo || b.archiveCode);
                    cmp = aVal - bVal;
                    break;
                }
                case 'poshtNomreh': {
                    cmp = getNumSeq(a.poshtNomreh) - getNumSeq(b.poshtNomreh);
                    break;
                }
                case 'docDate': {
                    const aDate = normalizeFilterShamsi(a.docDateShamsi || a.docDate || a.createdAt);
                    const bDate = normalizeFilterShamsi(b.docDateShamsi || b.docDate || b.createdAt);
                    cmp = aDate.localeCompare(bDate);
                    break;
                }
                case 'nearestDueDate': {
                    const aDue = getNearestDue(a) || '9999/99/99';
                    const bDue = getNearestDue(b) || '9999/99/99';
                    cmp = aDue.localeCompare(bDue);
                    break;
                }
                case 'farthestDueDate': {
                    const aDue = getFarthestDue(a) || '0000/00/00';
                    const bDue = getFarthestDue(b) || '0000/00/00';
                    cmp = aDue.localeCompare(bDue);
                    break;
                }
                case 'totalAmount': {
                    cmp = Number(a.totalAmount || 0) - Number(b.totalAmount || 0);
                    break;
                }
                case 'chequeCount': {
                    cmp = (a.cheques?.length || 0) - (b.cheques?.length || 0);
                    break;
                }
                case 'personName': {
                    cmp = String(a.personName || '').localeCompare(String(b.personName || ''), 'fa');
                    break;
                }
                case 'inNameOf': {
                    const aIn = a.cheques?.[0]?.inNameOf || a.personName || '';
                    const bIn = b.cheques?.[0]?.inNameOf || b.personName || '';
                    cmp = String(aIn).localeCompare(String(bIn), 'fa');
                    break;
                }
                case 'bankName': {
                    const aBank = a.cheques?.[0]?.bankName || '';
                    const bBank = b.cheques?.[0]?.bankName || '';
                    cmp = String(aBank).localeCompare(String(bBank), 'fa');
                    break;
                }
                case 'sayadiRegType': {
                    const aReg = regOrder[a.cheques?.[0]?.registrationType || ''] || 99;
                    const bReg = regOrder[b.cheques?.[0]?.registrationType || ''] || 99;
                    cmp = aReg - bReg;
                    break;
                }
                case 'issuerRelation': {
                    const aRel = a.cheques?.[0] ? (resolveChequeSelfIssuer(a, a.cheques[0]) === true ? 1 : resolveChequeSelfIssuer(a, a.cheques[0]) === false ? 2 : 3) : 3;
                    const bRel = b.cheques?.[0] ? (resolveChequeSelfIssuer(b, b.cheques[0]) === true ? 1 : resolveChequeSelfIssuer(b, b.cheques[0]) === false ? 2 : 3) : 3;
                    cmp = aRel - bRel;
                    break;
                }
                case 'sayanStatus': {
                    cmp = sayanStatusOrder(a) - sayanStatusOrder(b);
                    break;
                }
            }
            if (cmp !== 0) return cmp * dirMult;
            // Secondary tie-breaker: receiptNo desc
            return (getNumSeq(b.receiptNo || b.docNo) - getNumSeq(a.receiptNo || a.docNo));
        });
    }, [
        receiptsList, searchTerm, statusFilter, sayanRegFilter, sayadiRegTypeFilter,
        registeredPersonFilter, issuerRelationFilter, delivererFilter, inNameOfFilter,
        bankFilter, cashboxFilter, dueDateFrom, dueDateTo, docDateFrom, docDateTo,
        minAmountFilter, maxAmountFilter, sayadFilter, attachmentFilter, sourceFilter,
        sortBy, sortDir
    ]);

    const archiveStats = useMemo(() => {
        let totalCheques = 0;
        let totalAmount = 0;
        let registeredCount = 0;
        let unregisteredCount = 0;
        archiveList.forEach(r => {
            totalCheques += r.cheques?.length || 1;
            totalAmount += Number(r.totalAmount || 0);
            if (isRegisteredInSayan(r)) registeredCount++;
            else unregisteredCount++;
        });
        return {
            receiptsCount: archiveList.length,
            totalCheques,
            totalAmount,
            registeredCount,
            unregisteredCount
        };
    }, [archiveList]);

    return (
        <div className="space-y-6">
            {/* Header Notifications */}
            <AnimatePresence>
                {successMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-between shadow-xs"
                    >
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                        <button type="button" onClick={() => setSuccessMessage(null)} className="p-1 hover:bg-emerald-100 rounded-lg">
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
                {errorMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-bold flex items-center justify-between shadow-xs"
                    >
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                        <button type="button" onClick={() => setErrorMessage(null)} className="p-1 hover:bg-rose-100 rounded-lg">
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Navigation Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <CreditCard className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">
                            ثبت و مدیریت رسید دریافت چک (خزانه‌داری سایان)
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            فرم هوشمند ثبت چک، پشت‌نمره، تایید دومرحله‌ای کارمند حسابداری و مدیرعامل با امکان مشاهده سند واقعی سایان
                        </p>
                    </div>
                </div>

                {/* Sub-tab Switcher & Settings */}
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700 text-xs font-bold w-full sm:w-auto overflow-x-auto">
                        {canRegisterReceipt && (
                            <button
                                type="button"
                                onClick={() => setActiveSubTab('NEW_RECEIPT')}
                                className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap ${
                                    activeSubTab === 'NEW_RECEIPT'
                                        ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                }`}
                            >
                                <Plus className="w-4 h-4" />
                                <span>ثبت رسید جدید</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => setActiveSubTab('CARTABLE')}
                            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap relative ${
                                activeSubTab === 'CARTABLE'
                                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                        >
                            <CheckSquare className="w-4 h-4" />
                            <span>کارتابل تایید چک‌ها</span>
                            {(pendingAccountingList.length > 0 || pendingCeoList.length > 0) && (
                                <span className="w-5 h-5 rounded-full bg-amber-500 text-white font-mono text-[10px] flex items-center justify-center font-black animate-pulse">
                                    {toPersianDigits(pendingAccountingList.length + pendingCeoList.length)}
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveSubTab('CALENDAR')}
                            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap ${
                                activeSubTab === 'CALENDAR'
                                    ? 'bg-gradient-to-r from-amber-500 to-indigo-600 text-white font-black shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                        >
                            <CalendarDays className="w-4 h-4" />
                            <span>تقویم سررسید چک‌ها</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveSubTab('ARCHIVE')}
                            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 whitespace-nowrap ${
                                activeSubTab === 'ARCHIVE'
                                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                        >
                            <FileCheck className="w-4 h-4" />
                            <span>بایگانی و استعلام اسناد سایان</span>
                            <span className="text-[10px] opacity-70 font-mono">({toPersianDigits(receiptsList.length)})</span>
                        </button>
                    </div>

                    {canConfigureWorkflow && (
                        <button
                            type="button"
                            onClick={() => setIsWorkflowModalOpen(true)}
                            className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-bold shrink-0 shadow-xs"
                            title="تنظیمات مراحل تایید و اختیارات ثبت در سایان"
                        >
                            <Settings2 className="w-4 h-4 text-amber-500" />
                            <span className="hidden md:inline">تنظیمات تایید نهایی و سایان</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleFixSanadOneReceipts}
                        disabled={fixingSanadOne}
                        className="px-3 py-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-sm transition-all flex items-center gap-1.5 text-xs font-bold shrink-0"
                        title="بررسی اسنادی که با سند ۱ ثبت شده‌اند و بازنشانی آن‌ها جهت ثبت مجدد با سند واقعی"
                    >
                        {fixingSanadOne ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        <span>اصلاح اسناد با سند ۱ (ثبت مجدد سایان)</span>
                    </button>
                </div>
            </div>

            {/* Sub-tab 1: NEW CHEQUE RECEIPT FORM */}
            {activeSubTab === 'NEW_RECEIPT' && (
                <form onSubmit={handleSubmitReceipt} className="space-y-5">
                    {/* Sayan Operation & Cashbox Selector Dashboard Card */}
                    <div className="bg-gradient-to-l from-slate-50 to-emerald-50/20 dark:from-slate-900/60 dark:to-slate-900/10 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4">
                        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                            
                            {/* Step Indicators */}
                            <div className="flex flex-wrap items-center gap-2.5 text-xs">
                                <div className="flex items-center gap-1.5 bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-xl font-bold text-emerald-800 dark:text-emerald-300">
                                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-[10px]">۱۱</span>
                                    <span>مرحله ۱: عملیات دریافت</span>
                                </div>
                                
                                <span className="text-slate-400 font-bold">←</span>
                                
                                <div className="flex items-center gap-1.5 bg-blue-100/80 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-xl font-bold text-blue-800 dark:text-blue-300">
                                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-[10px]">۱۲</span>
                                    <span>مرحله ۲: عامل دریافت چک</span>
                                </div>

                                <span className="text-slate-400 font-bold">←</span>

                                <div className="flex items-center gap-1.5 bg-purple-100/80 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 px-3 py-1.5 rounded-xl font-bold text-purple-800 dark:text-purple-300">
                                    <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center font-black text-[10px]">۳</span>
                                    <span>مرحله ۳: صندوق دریافت چک *</span>
                                </div>
                            </div>

                            {/* Actual Dropdown Selection for Cashbox */}
                            <div className="min-w-[240px] relative">
                                <label className="block text-[11px] font-black text-purple-700 dark:text-purple-300 mb-1 flex items-center gap-1">
                                    <span>صندوق دریافت (خزانه‌داری سایان) *</span>
                                </label>
                                <div className="relative font-sans">
                                    <select
                                        value={cashboxCode}
                                        onChange={(e) => setCashboxCode(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border-2 border-purple-200 dark:border-purple-900 rounded-xl px-3 py-2.5 text-xs font-black text-slate-800 dark:text-slate-100 outline-none focus:border-purple-500 transition-colors cursor-pointer appearance-none pr-8 text-right"
                                    >
                                        {cashboxesList.map(box => (
                                            <option key={box.code} value={box.code}>
                                                {box.title} (کد: {toPersianDigits(box.code)})
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-purple-500 absolute left-2.5 top-3.5 pointer-events-none" />
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* Top General Information Card */}
                    <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-emerald-600" />
                                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">
                                    مشخصات کلی رسید و طرف حساب
                                </h3>
                            </div>
                            <span className="text-[11px] text-slate-400">
                                با زدن کلید Enter به فیلد بعدی هدایت می‌شوید
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                            {/* 1. Person Search Autocomplete */}
                            <div ref={personContainerRef} className="relative">
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                                    <span className="flex items-center gap-1">
                                        <span>طرف حساب (انتخاب اجباری از سایان)</span>
                                        <span className="text-red-500">*</span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => fetchPersons(personQuery.trim(), true)}
                                        className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                                        title="استعلام زنده از سرور سایان"
                                    >
                                        <RefreshCw className={`w-3 h-3 ${searchingPersons ? 'animate-spin' : ''}`} />
                                        <span>استعلام زنده سایان</span>
                                    </button>
                                </label>
                                <div className="relative">
                                    <input
                                        id="input-person-name"
                                        type="text"
                                        value={personQuery}
                                        onChange={(e) => {
                                            setPersonQuery(e.target.value);
                                            setPersonDropdownOpen(true);
                                            if (selectedPerson && e.target.value !== selectedPerson.fullName) {
                                                setSelectedPerson(null);
                                            }
                                        }}
                                        onFocus={() => {
                                            setPersonDropdownOpen(true);
                                            if (personSearchResults.length === 0 && allPersonsCache.length === 0) {
                                                fetchPersons('');
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                setPersonDropdownOpen(true);
                                                setHighlightedPersonIdx(prev => Math.min(prev + 1, Math.max(0, displayedPersonResults.length - 1)));
                                            } else if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                setPersonDropdownOpen(true);
                                                setHighlightedPersonIdx(prev => Math.max(prev - 1, 0));
                                            } else if (e.key === 'Escape') {
                                                setPersonDropdownOpen(false);
                                            } else if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (personDropdownOpen && displayedPersonResults.length > 0) {
                                                    const selected = displayedPersonResults[highlightedPersonIdx] || displayedPersonResults[0];
                                                    if (selected) {
                                                        setSelectedPerson(selected);
                                                        setPersonQuery(selected.fullName);
                                                        setPersonDropdownOpen(false);
                                                        setChequeRows(prev => prev.map(r => ({ ...r, inNameOf: selected.fullName })));
                                                        const nextEl = document.getElementById('input-posht-nomreh') || document.getElementById('input-receipt-no');
                                                        nextEl?.focus();
                                                    }
                                                } else {
                                                    handleEnterNext(0, 'person');
                                                }
                                            }
                                        }}
                                        placeholder="نام یا کد تفصیلی (جستجوی زنده در کل پایگاه سایان)..."
                                        className={`w-full border rounded-xl px-3 py-2.5 text-xs outline-none transition-colors ${
                                            selectedPerson
                                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500 text-emerald-900 dark:text-emerald-100 font-bold'
                                                : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900'
                                        }`}
                                    />
                                    {searchingPersons && (
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin absolute left-3 top-3 text-emerald-500" />
                                    )}
                                </div>

                                {selectedPerson ? (
                                    <div className="mt-1 flex items-center justify-between text-[10px] text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-100/70 dark:bg-emerald-950/60 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                        <span>طرف حساب معتبر سایان</span>
                                        <span className="font-mono">کد تفصیلی: {toPersianDigits(selectedPerson.tafsiliCode || selectedPerson.personCode)}</span>
                                    </div>
                                ) : (
                                    <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                                        * انتخاب از میان طرف‌های حساب زنده سایان الزامی است
                                    </div>
                                )}

                                {/* Person Dropdown */}
                                {personDropdownOpen && (
                                    <div className="absolute top-full right-0 left-0 mt-1 bg-white dark:bg-slate-800 border-2 border-emerald-500/30 dark:border-emerald-500/40 rounded-2xl shadow-2xl z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                                        <div className="p-2 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold text-slate-500">
                                            <span>طرف‌های حساب سایان ({toPersianDigits(displayedPersonResults.length)})</span>
                                            {searchingPersons && (
                                                <span className="flex items-center gap-1 text-emerald-600">
                                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                                    <span>در حال جستجو...</span>
                                                </span>
                                            )}
                                        </div>
                                        {displayedPersonResults.length > 0 ? (
                                            displayedPersonResults.map((p, pIdx) => {
                                                const isSelected = selectedPerson?.personCode === p.personCode;
                                                const isHighlighted = pIdx === highlightedPersonIdx;
                                                return (
                                                    <button
                                                        key={`${p.personCode}-${p.tafsiliCode}-${pIdx}`}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedPerson(p);
                                                            setPersonQuery(p.fullName);
                                                            setPersonDropdownOpen(false);
                                                            setChequeRows(prev => prev.map(r => ({ ...r, inNameOf: p.fullName })));
                                                            const nextEl = document.getElementById('input-posht-nomreh') || document.getElementById('input-receipt-no');
                                                            nextEl?.focus();
                                                        }}
                                                        className={`w-full text-right p-2.5 text-xs transition-colors flex items-center justify-between group cursor-pointer ${
                                                            isHighlighted
                                                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-950 dark:text-emerald-100 font-bold border-r-4 border-emerald-600'
                                                                : isSelected
                                                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                                                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-800 dark:text-slate-200'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <User className={`w-3.5 h-3.5 shrink-0 ${isHighlighted ? 'text-emerald-600' : 'text-slate-400'}`} />
                                                            <div>
                                                                <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                                                                    <span>{p.fullName}</span>
                                                                    {p.levelCode === '11' ? (
                                                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 font-normal">مشتری</span>
                                                                    ) : p.levelCode === '31' ? (
                                                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 font-normal">تامین‌کننده</span>
                                                                    ) : null}
                                                                </div>
                                                                {p.nationalId && <div className="text-[10px] text-slate-400 font-mono">کدملی: {p.nationalId}</div>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 border border-blue-200">
                                                                کد: {toPersianDigits(p.personCode)}
                                                            </span>
                                                            {p.tafsiliCode && p.tafsiliCode !== p.personCode && (
                                                                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950 text-purple-600 border border-purple-200">
                                                                    تفصیلی: {toPersianDigits(p.tafsiliCode)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            !searchingPersons && (
                                                <div className="p-3 text-center text-xs text-slate-400 flex flex-col items-center gap-1">
                                                    <span>هیچ حسابی در سایان با «{personQuery}» یافت نشد</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => fetchPersons(personQuery.trim(), true)}
                                                        className="text-emerald-600 font-bold hover:underline mt-1 cursor-pointer"
                                                    >
                                                        استعلام مستقیم کل پایگاه اطلاعاتی سایان
                                                    </button>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 2. Editable Receipt Number */}
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <span>شماره رسید</span>
                                        <span className="text-[10px] text-blue-600 font-normal">
                                            (پیش‌فرض: شماره بعدی بایگانی)
                                        </span>
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const lastVal = getArchiveLatestSequence(receiptsList) || 848;
                                                const nextVal = lastVal + 1;
                                                setReceiptNoInput(String(nextVal));
                                                setPoshtNomreh(String(nextVal));
                                            }}
                                            title="تنظیم خودکار به آخرین شماره ثبت شده + ۱"
                                            className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer font-bold"
                                        >
                                            <RefreshCw className="w-2.5 h-2.5" />
                                            خودکار (+۱)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => fetchMetaNumbers()}
                                            title="استعلام آخرین شماره از سیستم"
                                            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                                        >
                                            <RefreshCw className="w-2.5 h-2.5" />
                                            استعلام
                                        </button>
                                    </div>
                                </label>
                                <input
                                    id="input-receipt-no"
                                    type="text"
                                    value={receiptNoInput}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setReceiptNoInput(val);
                                        // Also keep poshtNomreh aligned if it was previously empty or equal
                                        if (!poshtNomreh || poshtNomreh === receiptNoInput) {
                                            setPoshtNomreh(val);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            document.getElementById('input-posht-nomreh')?.focus();
                                        }
                                    }}
                                    placeholder="مثال: ۸۴۹"
                                    className="w-full bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-3 py-2.5 text-xs font-mono font-black text-blue-700 dark:text-blue-300 outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                                />
                            </div>

                            {/* 3. Posht-Nomreh */}
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <span>شماره پشت‌نمره رسید *</span>
                                        <span className="text-[10px] text-emerald-600 font-normal">
                                            (آخرین در بایگانی: {toPersianDigits(getArchiveLatestSequence(receiptsList) || 848)})
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const lastVal = getArchiveLatestSequence(receiptsList) || 848;
                                            const nextVal = lastVal + 1;
                                            setPoshtNomreh(String(nextVal));
                                            setReceiptNoInput(String(nextVal));
                                        }}
                                        className="text-[10px] text-slate-500 hover:text-emerald-600 flex items-center gap-1 cursor-pointer font-bold"
                                        title="تنظیم خودکار به آخرین شماره بایگانی + ۱"
                                    >
                                        <RefreshCw className="w-2.5 h-2.5" />
                                        تنظیم خودکار (+۱)
                                    </button>
                                </label>
                                <input
                                    id="input-posht-nomreh"
                                    type="text"
                                    value={poshtNomreh}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setPoshtNomreh(val);
                                        // Also update receiptNoInput if empty
                                        if (!receiptNoInput) {
                                            setReceiptNoInput(val);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleEnterNext(0, 'poshtNomreh');
                                        }
                                    }}
                                    placeholder="مثال: ۸۴۸"
                                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono font-bold outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                                />
                            </div>

                            {/* 4. Target Total Amount */}
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    جمع چک (ریال) - کنترلی
                                </label>
                                <input
                                    id="input-target-amount"
                                    type="text"
                                    value={targetTotalAmount ? Number(targetTotalAmount).toLocaleString('en-US') : ''}
                                    onChange={(e) => {
                                        const clean = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '');
                                        setTargetTotalAmount(clean ? Number(clean) : '');
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleEnterNext(0, 'targetAmount');
                                        }
                                    }}
                                    placeholder="جمع اولیه چک‌ها"
                                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono font-black text-emerald-600 dark:text-emerald-400 outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                                />
                            </div>

                            {/* 5. Receipt Date (Shamsi) */}
                            <div>
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    تاریخ ثبت رسید (شمسی)
                                </label>
                                <div className="relative flex items-center">
                                    <input
                                        id="input-doc-date"
                                        type="text"
                                        value={docDateShamsi}
                                        onChange={(e) => setDocDateShamsi(normalizeToAsciiDigits(e.target.value))}
                                        className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl pr-3 pl-8 py-2.5 text-xs font-mono font-bold outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                                    />
                                    <div className="absolute left-2 top-2 z-10">
                                        <DatePicker
                                            calendar={persian}
                                            locale={persian_fa}
                                            value={docDateShamsi || undefined}
                                            onChange={(date: any) => {
                                                if (!date) return;
                                                const rawVal = date?.format?.('YYYY/MM/DD');
                                                const ascii = normalizeToAsciiDigits(rawVal);
                                                if (ascii) setDocDateShamsi(ascii);
                                            }}
                                            render={(value: any, openCalendar: any) => (
                                                <button
                                                    type="button"
                                                    onClick={openCalendar}
                                                    className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors"
                                                    title="انتخاب تاریخ ثبت رسید از تقویم"
                                                >
                                                    <Calendar className="w-4 h-4 text-emerald-600" />
                                                </button>
                                            )}
                                            calendarPosition="bottom-right"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="pt-2 text-xs">
                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                شرح کلی رسید و بابت
                            </label>
                            <input
                                id="input-doc-desc"
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleEnterNext(0, 'docDesc');
                                    }
                                }}
                                placeholder="مثال: تسویه فاکتور فروش شماره ۵۸۰"
                                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                            />
                        </div>

                        {/* Mobile-Optimized File Attachments */}
                        <div className="pt-1">
                            <MobileAttachmentUploader
                                attachments={attachments}
                                onChange={setAttachments}
                                label="پیوست تصویر یا فایل PDF چک‌ها (موبایل و کامپیوتر)"
                                helperText="امکان عکس‌برداری مستقیم با دوربین گوشی، انتخاب از گالری یا آپلود اسناد PDF"
                            />
                        </div>
                    </div>

                    {/* Cheque Rows Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-emerald-600" />
                                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">
                                    اقلام و برگه‌های چک رسید ({toPersianDigits(chequeRows.length)} فقره)
                                </h3>
                            </div>

                            <button
                                type="button"
                                onClick={() => handleAddChequeRow(true)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-500/20"
                            >
                                <Plus className="w-4 h-4" />
                                <span>افزودن برگه چک بعدی</span>
                            </button>
                        </div>

                        {/* Rows */}
                        <div className="space-y-3">
                            {chequeRows.map((item, idx) => (
                                <ChequeItemRow
                                    key={item.id}
                                    index={idx}
                                    totalRows={chequeRows.length}
                                    item={item}
                                    defaultInNameOf={selectedPerson ? selectedPerson.fullName : personQuery}
                                    onChange={handleChequeRowChange}
                                    onDelete={handleDeleteChequeRow}
                                    onEnterNext={handleEnterNext}
                                    onArrowNavigate={handleArrowNavigate}
                                    onDuplicateRow={handleDuplicateChequeRow}
                                    onAddRowBelow={() => handleAddChequeRow(true)}
                                    registeredPersonSuggestions={registeredPersonSuggestions}
                                />
                            ))}
                        </div>

                        {/* Summary & Discrepancy Bar */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
                            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400 block mb-0.5 font-bold">تعداد برگ چک:</span>
                                    <span className="font-mono font-black text-base text-slate-900 dark:text-white">
                                        {toPersianDigits(chequeRows.length)} برگ
                                    </span>
                                </div>
                                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400 block mb-0.5 font-bold">مجموع مبالغ کل چک‌ها:</span>
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-mono font-black text-xl text-emerald-600 dark:text-emerald-400">
                                            {toPersianDigits(sumChequesAmount.toLocaleString('fa-IR'))} ریال
                                        </span>
                                        <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                            ({toPersianDigits(Math.floor(sumChequesAmount / 10).toLocaleString('fa-IR'))} تومان)
                                        </span>
                                    </div>
                                </div>
                                {selectedPerson && (
                                    <>
                                        <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
                                        <div>
                                            <span className="text-slate-500 dark:text-slate-400 block mb-0.5 font-bold">طرف حساب / صادرکننده:</span>
                                            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                                                {selectedPerson.fullName}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>

                            {targetTotalAmount !== '' && (
                                <div className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 ${
                                    amountDiff === 0
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                }`}>
                                    {amountDiff === 0 ? (
                                        <>
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                            <span>جمع چک‌ها با مبلغ کنترلی کاملاً منطبق است.</span>
                                        </>
                                    ) : (
                                        <>
                                            <AlertCircle className="w-4 h-4 text-amber-600" />
                                            <span>
                                                مغایرت: {toPersianDigits(Math.abs(amountDiff).toLocaleString('fa-IR'))} ریال
                                                {amountDiff > 0 ? ' (کمتر از مبلغ کنترلی)' : ' (بیشتر از مبلغ کنترلی)'}
                                            </span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            id="btn-submit-cheque-receipt"
                            type="submit"
                            disabled={actionLoading === 'submit_new'}
                            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                        >
                            <ShieldCheck className="w-5 h-5" />
                            <span>
                                {actionLoading === 'submit_new'
                                    ? 'در حال ثبت و ارسال به کارتابل حسابداری...'
                                    : 'ثبت رسید چک و ارسال به کارتابل حسابداری (مرحله ۱)'}
                            </span>
                        </button>
                    </div>
                </form>
            )}

            {/* Sub-tab 2: CARTABLE (ACCOUNTING & CEO APPROVALS) */}
            {activeSubTab === 'CARTABLE' && (
                <div className="space-y-6">
                    {/* 1. Accounting Pending Items */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-xs font-mono">
                                    {toPersianDigits(pendingAccountingList.length)}
                                </span>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                        مرحله ۱: رسیدهای چک منتظر بررسی و تایید کارشناس حسابداری
                                    </h3>
                                    <p className="text-[11px] text-slate-500">
                                        کارمند حسابداری می‌تواند مبالغ، اقلام و مشخصات چک‌ها را قبل از ارسال به مدیرعامل ویرایش نماید.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {pendingAccountingList.length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-400">
                                در حال حاضر رسیدی در انتظار تایید حسابداری وجود ندارد.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {pendingAccountingList.map(rec => (
                                    <div key={rec.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-3 hover:shadow-md transition-shadow">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-bold text-xs text-slate-900 dark:text-white">{rec.personName}</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold">
                                                            #{toPersianDigits(rec.receiptNo || rec.id)}
                                                        </span>
                                                        {canEditReceipt && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingReceiptNoItem({ id: rec.id, currentNo: String(rec.receiptNo || rec.id) });
                                                                    setTempQuickReceiptNo(String(rec.receiptNo || rec.id));
                                                                }}
                                                                className="p-0.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer"
                                                                title="ویرایش شماره رسید"
                                                            >
                                                                <Edit3 className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                                                    پشت‌نمره: {toPersianDigits(rec.poshtNomreh || '-')} | تاریخ: {toPersianDigits(rec.docDate)}
                                                </div>
                                            </div>
                                            <span className="font-mono font-black text-xs text-emerald-600 dark:text-emerald-400">
                                                {toPersianDigits(Number(rec.totalAmount || 0).toLocaleString('fa-IR'))} ریال
                                            </span>
                                        </div>

                                        <div className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                                            {rec.description || `${toPersianDigits(rec.cheques?.length || 1)} فقره چک`}
                                        </div>

                                        <div className="flex items-center justify-between pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedDetailReceipt(rec)}
                                                className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                <span>مشاهده جزئیات</span>
                                            </button>

                                            {canEditReceipt && (
                                                <button
                                                    type="button"
                                                    onClick={() => setReviewingReceipt(rec)}
                                                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-amber-500/20 cursor-pointer"
                                                    title="ویرایش مشخصات و پیوست‌های رسید در همین مرحله"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                    <span>ویرایش اطلاعات و مدارک</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 2. CEO Pending Items */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-xs font-mono">
                                    {toPersianDigits(pendingCeoList.length)}
                                </span>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                        {workflowConfig.requireCeoApproval 
                                            ? 'مرحله ۲: رسیدهای چک تایید حسابداری شده و منتظر تایید مدیرعامل و ثبت در سایان'
                                            : 'مرحله ۲: رسیدهای چک تایید حسابداری شده و آماده ثبت در سایان (تایید مستقیم)'}
                                    </h3>
                                    <p className="text-[11px] text-slate-500">
                                        {workflowConfig.requireCeoApproval
                                            ? 'پس از تایید مدیرعامل، سند بلافاصله در دیتابیس ERP سایان بدون خطا ثبت و بایگانی می‌گردد.'
                                            : 'تایید مدیرعامل غیرفعال است؛ رسیدها با تایید حسابداری یا با فشردن دکمه ثبت زیر مستقیماً در سایان ثبت می‌شوند.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {pendingCeoList.length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-400">
                                {workflowConfig.requireCeoApproval 
                                    ? 'در حال حاضر رسیدی در انتظار تایید مدیرعامل وجود ندارد.'
                                    : 'در حال حاضر رسیدی در انتظار ثبت وجود ندارد.'}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {pendingCeoList.map(rec => {
                                    const hasError = !!rec.sayanError;
                                    return (
                                        <div 
                                            key={rec.id} 
                                            className={`p-4 rounded-2xl border transition-all space-y-3 hover:shadow-md ${
                                                hasError 
                                                    ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800' 
                                                    : 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/60'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                                                        <span>{rec.personName}</span>
                                                        <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                                                            hasError 
                                                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300' 
                                                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                        }`}>
                                                            {hasError ? 'خطای ثبت سایان' : 'تایید حسابداری شده'}
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 mt-0.5 font-mono flex items-center gap-1.5 flex-wrap">
                                                        <span>پشت‌نمره: {toPersianDigits(rec.poshtNomreh || '-')}</span>
                                                        <span>|</span>
                                                        <span className="text-blue-600 dark:text-blue-400 font-bold">رسید: #{toPersianDigits(rec.receiptNo || rec.id)}</span>
                                                        {canEditReceipt && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingReceiptNoItem({ id: rec.id, currentNo: String(rec.receiptNo || rec.id) });
                                                                    setTempQuickReceiptNo(String(rec.receiptNo || rec.id));
                                                                }}
                                                                className="p-0.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer"
                                                                title="ویرایش شماره رسید (مثلا: ۱۳۹۹)"
                                                            >
                                                                <Edit3 className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="font-mono font-black text-xs text-emerald-600 dark:text-emerald-400">
                                                    {toPersianDigits(Number(rec.totalAmount || 0).toLocaleString('fa-IR'))} ریال
                                                </span>
                                            </div>

                                            {hasError && (
                                                <div className="text-[11px] text-rose-800 dark:text-rose-300 bg-rose-100/50 dark:bg-rose-900/30 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 space-y-1">
                                                    <div className="font-bold flex items-center gap-1">
                                                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                                        <span>خطای بازگشتی از پایگاه‌داده ERP سایان:</span>
                                                    </div>
                                                    <p className="font-mono leading-relaxed break-all text-right select-all">{rec.sayanError}</p>
                                                </div>
                                            )}

                                            {rec.accountingReview?.note && (
                                                <div className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/40 p-2 rounded-xl">
                                                    <b>تاییدیه حسابداری:</b> {rec.accountingReview.note}
                                                </div>
                                            )}

                                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60 pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedDetailReceipt(rec)}
                                                    className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    <span>مشاهده چک‌ها</span>
                                                </button>

                                                <div className="flex items-center gap-1.5">
                                                    {/* Delete Draft Option if failed or pending */}
                                                    {canDeleteReceipt && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteReceipt(rec.id)}
                                                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 text-xs font-bold"
                                                            title="حذف کامل این رسید پیش‌نویس"
                                                        >
                                                            حذف
                                                        </button>
                                                    )}

                                                    {/* Edit option for authorized users to fix the fields */}
                                                    {canEditReceipt && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setReviewingReceipt(rec)}
                                                            className="px-2.5 py-1.5 rounded-xl bg-amber-100 text-amber-800 hover:bg-amber-200 text-xs font-bold"
                                                            title="اصلاح مشخصات یا مبالغ چک جهت رفع خطا"
                                                        >
                                                            اصلاح و ویرایش
                                                        </button>
                                                    )}

                                                    {isCeoOrAdmin && (
                                                        <>
                                                            {!hasError && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleReject(rec.id)}
                                                                    className="px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold hover:bg-rose-100"
                                                                >
                                                                    عدم تایید
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleApproveByCeo(rec.id)}
                                                                disabled={actionLoading === rec.id}
                                                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-emerald-500/20"
                                                            >
                                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                                <span>
                                                                    {actionLoading === rec.id 
                                                                        ? 'در حال ارسال...' 
                                                                        : hasError ? 'تلاش مجدد ثبت سایان' : 'تایید و ثبت سایان'}
                                                                </span>
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Sub-tab 3: PERSAN CALENDAR DUE CHEQUES VIEW */}
            {activeSubTab === 'CALENDAR' && (
                <div className="bg-white/90 dark:bg-slate-900/90 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex items-center justify-center shadow-md">
                                <CalendarDays className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">
                                    تقویم سررسید چک‌ها (سایان ERP) - {sayanCalendarMonthData.monthName} {calYear}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-bold">
                                    نمایش بصری و زمان‌بندی وصول چک‌های ثبت شده در خزانه‌داری
                                </p>
                            </div>
                        </div>

                        {/* Month / Year Selectors */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => {
                                    if (calMonth === 1) { setCalMonth(12); setCalYear(y => y - 1); }
                                    else setCalMonth(m => m - 1);
                                }}
                                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                                title="ماه قبل"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>

                            <select
                                value={calMonth}
                                onChange={e => setCalMonth(Number(e.target.value))}
                                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-amber-500"
                            >
                                {['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'].map((mName, idx) => (
                                    <option key={idx} value={idx + 1}>{mName}</option>
                                ))}
                            </select>

                            <select
                                value={calYear}
                                onChange={e => setCalYear(Number(e.target.value))}
                                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-amber-500"
                            >
                                {[1401, 1402, 1403, 1404, 1405, 1406, 1407].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>

                            <button
                                onClick={() => {
                                    if (calMonth === 12) { setCalMonth(1); setCalYear(y => y + 1); }
                                    else setCalMonth(m => m + 1);
                                }}
                                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                                title="ماه بعد"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>

                            <button
                                onClick={() => {
                                    const todayParts = getTodayShamsi().split('/');
                                    setCalYear(parseInt(todayParts[0]) || 1404);
                                    setCalMonth(parseInt(todayParts[1]) || 7);
                                }}
                                className="px-3 py-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-200 text-xs font-black transition-all"
                            >
                                امروز
                            </button>
                        </div>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40">
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">تعداد چک‌های سررسید ماه</p>
                            <p className="text-lg font-black text-blue-900 dark:text-blue-200 mt-1">
                                {toPersianDigits(sayanCalendarMonthData.totalMonthChequesCount)} <span className="text-xs font-normal">فقره</span>
                            </p>
                        </div>
                        <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40">
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">مجموع مبلغ سررسید ماه</p>
                            <p className="text-lg font-black text-emerald-900 dark:text-emerald-200 mt-1">
                                {toPersianDigits(sayanCalendarMonthData.totalMonthAmount.toLocaleString('fa-IR'))} <span className="text-xs font-normal">ریال</span>
                            </p>
                        </div>
                        <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40">
                            <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">چک‌های سررسید گذشته (معوق)</p>
                            <p className="text-lg font-black text-rose-900 dark:text-rose-200 mt-1">
                                {toPersianDigits(sayanCalendarMonthData.overdueChequesCount)} <span className="text-xs font-normal">فقره</span>
                            </p>
                        </div>
                        <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40">
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">سررسید‌های امروز</p>
                            <p className="text-lg font-black text-amber-900 dark:text-amber-200 mt-1">
                                {toPersianDigits(sayanCalendarMonthData.todayChequesCount)} <span className="text-xs font-normal">فقره</span>
                            </p>
                        </div>
                    </div>

                    {/* Weekday Grid */}
                    <div className="grid grid-cols-7 gap-1.5 md:gap-2 text-center text-xs font-black text-slate-500 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800/50 p-2 rounded-2xl">
                        <span>شنبه</span>
                        <span>یکشنبه</span>
                        <span>دوشنبه</span>
                        <span>سه‌شنبه</span>
                        <span>چهارشنبه</span>
                        <span>پنج‌شنبه</span>
                        <span className="text-rose-500">جمعه</span>
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-1.5 md:gap-2">
                        {Array.from({ length: sayanCalendarMonthData.firstDayIndex }).map((_, idx) => (
                            <div key={`empty-${idx}`} className="h-24 md:h-32 rounded-2xl bg-slate-50/40 dark:bg-slate-800/10 border border-slate-100/50 dark:border-slate-800/20 opacity-30" />
                        ))}

                        {Array.from({ length: sayanCalendarMonthData.daysCount }).map((_, idx) => {
                            const dayNum = idx + 1;
                            const dayStr = `${calYear}/${String(calMonth).padStart(2, '0')}/${String(dayNum).padStart(2, '0')}`;
                            const dayCheques = sayanCalendarMonthData.dayChequesMap[dayNum] || [];
                            const isToday = dayStr === getTodayShamsi();
                            const dayTotalAmount = dayCheques.reduce((sum, item) => sum + Number(item.amount || 0), 0);

                            return (
                                <div
                                    key={`day-${dayNum}`}
                                    onClick={() => {
                                        if (dayCheques.length > 0) {
                                            setSayanSelectedDayModal({ day: dayNum, dateStr: dayStr, items: dayCheques });
                                        }
                                    }}
                                    className={`min-h-[100px] md:min-h-[120px] p-1.5 md:p-2 rounded-2xl border transition-all flex flex-col justify-between ${
                                        isToday
                                            ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-md ring-2 ring-amber-400/50'
                                            : dayCheques.length > 0
                                            ? 'bg-white dark:bg-slate-800/90 border-blue-200 dark:border-blue-900/60 shadow-xs hover:border-blue-400 cursor-pointer'
                                            : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800/40'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center ${
                                            isToday 
                                                ? 'bg-amber-500 text-white shadow-xs' 
                                                : 'text-slate-700 dark:text-slate-300'
                                        }`}>
                                            {toPersianDigits(dayNum)}
                                        </span>
                                        {isToday && <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-1 rounded">امروز</span>}
                                        {dayCheques.length > 0 && !isToday && (
                                            <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1 rounded">
                                                {toPersianDigits(dayCheques.length)} چک
                                            </span>
                                        )}
                                    </div>

                                    {/* Day Cheque Chips */}
                                    {dayCheques.length > 0 ? (
                                        <div className="space-y-1 my-1 overflow-hidden">
                                            <div className="text-[9px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.5 rounded border border-emerald-200/50 truncate">
                                                {toPersianDigits(dayTotalAmount.toLocaleString('fa-IR'))} ریال
                                            </div>
                                            {dayCheques.slice(0, 2).map((item, cIdx) => (
                                                <div 
                                                    key={cIdx} 
                                                    className="p-1 rounded-lg bg-slate-100 dark:bg-slate-700/80 border border-slate-200/60 dark:border-slate-600 text-[9px] truncate space-y-0.5 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors"
                                                    title={`چک ${item.chequeNumber || '-'} | ${item.bankName || '-'} | ${item.personName || '-'}`}
                                                >
                                                    <div className="font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                                        {item.bankName || 'بانک'} - {toPersianDigits(item.chequeNumber || 'چک')}
                                                    </div>
                                                    <div className="text-slate-500 dark:text-slate-400 truncate">
                                                        {item.personName || 'شخص'}
                                                    </div>
                                                </div>
                                            ))}
                                            {dayCheques.length > 2 && (
                                                <p className="text-[9px] font-bold text-blue-600 dark:text-blue-400 text-center">
                                                    + {toPersianDigits(dayCheques.length - 2)} چک دیگر
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center">
                                            <span className="text-[10px] text-slate-300 dark:text-slate-600">-</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Sub-tab 4: ARCHIVE & REAL SAYAN LIVE INSPECTOR */}
            {activeSubTab === 'ARCHIVE' && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
                    {/* Top Row: Search + Sayan Registration Quick Filter + Advanced Filter Toggle + Sort Controls */}
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
                            <div className="relative flex-1 min-w-[240px]">
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="جستجوی جامع (تحویل‌دهنده، صاحب چک، شخص ثبت‌شده صیادی، شماره چک، صیاد، رسید، پشت‌نمره، سند)..."
                                    className="w-full min-h-[42px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-8 py-2 text-xs font-medium outline-none focus:border-emerald-500 transition-colors"
                                />
                                <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        className="absolute left-2.5 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                                        title="پاک کردن جستجو"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowAdvancedFilters(v => !v)}
                                className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 ${
                                    showAdvancedFilters || activeFilterCount > 0
                                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <Filter className="w-4 h-4" />
                                <span>فیلترهای پیشرفته همزمان</span>
                                {activeFilterCount > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white font-mono text-[10px]">
                                        {toPersianDigits(activeFilterCount)}
                                    </span>
                                )}
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
                            </button>

                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={resetArchiveFilters}
                                    className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>پاک کردن فیلترها</span>
                                </button>
                            )}
                        </div>

                        {/* Multi-Parameter Sort Controls */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 min-h-[42px] flex-1 sm:flex-initial">
                                <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span className="text-[11px] font-bold text-slate-500 shrink-0">مرتب‌سازی:</span>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as any)}
                                    className="bg-transparent text-xs font-black text-slate-800 dark:text-slate-100 outline-none cursor-pointer flex-1"
                                >
                                    <option value="receiptNo">شماره رسید</option>
                                    <option value="poshtNomreh">شماره پشت‌نمره</option>
                                    <option value="docDate">تاریخ ثبت رسید</option>
                                    <option value="nearestDueDate">تاریخ سررسید (نزدیک‌ترین چک)</option>
                                    <option value="farthestDueDate">تاریخ سررسید (دورترین چک)</option>
                                    <option value="totalAmount">مبلغ کل رسید</option>
                                    <option value="chequeCount">تعداد برگ چک</option>
                                    <option value="personName">نام تحویل‌دهنده (طرف حساب)</option>
                                    <option value="inNameOf">نام صاحب چک (در وجه)</option>
                                    <option value="bankName">بانک صادرکننده</option>
                                    <option value="sayadiRegType">وضعیت ثبت صیادی</option>
                                    <option value="issuerRelation">صاحب چک = تحویل‌دهنده (خود/ثالث)</option>
                                    <option value="sayanStatus">وضعیت ثبت سایان (ثبت‌شده/نشده)</option>
                                </select>
                            </div>

                            <button
                                type="button"
                                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                                className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                                title={sortDir === 'asc' ? 'صعودی (تغییر به نزولی)' : 'نزولی (تغییر به صعودی)'}
                            >
                                {sortDir === 'asc' ? <ArrowUp className="w-4 h-4 text-emerald-600" /> : <ArrowDown className="w-4 h-4 text-blue-600" />}
                                <span>{sortDir === 'asc' ? 'صعودی' : 'نزولی'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => fetchReceipts(false)}
                                className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer shrink-0 flex items-center justify-center"
                                title="بروزرسانی لیست"
                            >
                                <RefreshCw className={`w-4 h-4 ${loadingReceipts ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Quick Sayan Registration & Process Status Filter Strip */}
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <button
                            type="button"
                            onClick={() => { setSayanRegFilter('ALL'); setStatusFilter('ALL'); }}
                            className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                                sayanRegFilter === 'ALL' && statusFilter === 'ALL'
                                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                        >
                            همه ({toPersianDigits(receiptsList.length)})
                        </button>
                        <button
                            type="button"
                            onClick={() => setSayanRegFilter(v => v === 'REGISTERED' ? 'ALL' : 'REGISTERED')}
                            className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                                sayanRegFilter === 'REGISTERED'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60'
                            }`}
                        >
                            ثبت شده در سایان
                        </button>
                        <button
                            type="button"
                            onClick={() => setSayanRegFilter(v => v === 'UNREGISTERED' ? 'ALL' : 'UNREGISTERED')}
                            className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                                sayanRegFilter === 'UNREGISTERED'
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/60'
                            }`}
                        >
                            ثبت نشده در سایان
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusFilter(v => v === 'PENDING_CEO' ? 'ALL' : 'PENDING_CEO')}
                            className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                                statusFilter === 'PENDING_CEO'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                        >
                            {workflowConfig.requireCeoApproval ? 'منتظر تایید مدیرعامل' : 'آماده ثبت در سایان'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusFilter(v => v === 'PENDING_ACCOUNTING' ? 'ALL' : 'PENDING_ACCOUNTING')}
                            className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                                statusFilter === 'PENDING_ACCOUNTING'
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                        >
                            منتظر تایید حسابداری
                        </button>
                        <button
                            type="button"
                            onClick={() => setIssuerRelationFilter(v => v === 'SELF' ? 'ALL' : 'SELF')}
                            className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                                issuerRelationFilter === 'SELF'
                                    ? 'bg-teal-600 text-white shadow-xs'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                        >
                            صاحب چک = تحویل‌دهنده
                        </button>
                        <button
                            type="button"
                            onClick={() => setIssuerRelationFilter(v => v === 'THIRD_PARTY' ? 'ALL' : 'THIRD_PARTY')}
                            className={`px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                                issuerRelationFilter === 'THIRD_PARTY'
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                        >
                            چک شخص ثالث
                        </button>
                    </div>

                    {/* Collapsible Advanced Simultaneous Multi-Filter Panel */}
                    <AnimatePresence>
                        {showAdvancedFilters && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                            <Sliders className="w-4 h-4 text-emerald-600" />
                                            <span>فیلترهای ترکیبی پیشرفته (امکان فعال‌سازی همزمان تمام فیلترها)</span>
                                        </span>
                                        <span className="text-[11px] text-slate-500">
                                            نتایج مطابق با همه شروط انتخابی نمایش داده می‌شوند
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                                        {/* 1. Sayan Registration Status */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                وضعیت ثبت در سایان
                                            </label>
                                            <select
                                                value={sayanRegFilter}
                                                onChange={(e) => setSayanRegFilter(e.target.value as any)}
                                                className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold outline-none focus:border-emerald-500"
                                            >
                                                <option value="ALL">همه وضعیت‌ها</option>
                                                <option value="REGISTERED">ثبت شده در سایان</option>
                                                <option value="UNREGISTERED">ثبت نشده در سایان</option>
                                                <option value="PROCESSING">در حال ثبت پس‌زمینه</option>
                                                <option value="NEEDS_REREGISTER">سند ۱ (نیازمند اصلاح و ثبت مجدد)</option>
                                            </select>
                                        </div>

                                        {/* 2. Workflow Stage */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                مرحله کارتابل و تایید
                                            </label>
                                            <select
                                                value={statusFilter}
                                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                                className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold outline-none focus:border-emerald-500"
                                            >
                                                <option value="ALL">همه مراحل</option>
                                                <option value="PENDING_ACCOUNTING">منتظر تایید حسابداری</option>
                                                <option value="PENDING_CEO">{workflowConfig.requireCeoApproval ? 'منتظر تایید مدیرعامل' : 'آماده ثبت نهایی'}</option>
                                                <option value="REGISTERED_IN_SAYAN">نهایی / ثبت‌شده</option>
                                                <option value="REJECTED">عودت / رد شده</option>
                                            </select>
                                        </div>

                                        {/* 3. Sayadi Registration Status */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                وضعیت ثبت صیادی چک
                                            </label>
                                            <select
                                                value={sayadiRegTypeFilter}
                                                onChange={(e) => setSayadiRegTypeFilter(e.target.value as any)}
                                                className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold outline-none focus:border-emerald-500"
                                            >
                                                <option value="ALL">همه حالت‌های صیادی</option>
                                                <option value="company">ثبت به نام شرکت</option>
                                                <option value="person">ثبت به نام شخص</option>
                                                <option value="unregistered">ثبت نشده</option>
                                                <option value="unspecified">تعیین نشده (سوابق قدیمی)</option>
                                            </select>
                                        </div>

                                        {/* 4. Registered Person Name in Sayadi */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                نام شخص ثبت‌شده (در صیاد)
                                            </label>
                                            <input
                                                type="text"
                                                list="archive-registered-person-list"
                                                value={registeredPersonFilter}
                                                onChange={(e) => setRegisteredPersonFilter(e.target.value)}
                                                placeholder="نام شخصی که به نام او ثبت شده..."
                                                className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-medium outline-none focus:border-emerald-500"
                                            />
                                            <datalist id="archive-registered-person-list">
                                                {archiveRegisteredPersonSuggestions.map(n => <option key={n} value={n} />)}
                                            </datalist>
                                        </div>

                                        {/* 5. Customer Self-Issuer vs Third Party */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                نسبت صاحب چک با تحویل‌دهنده
                                            </label>
                                            <select
                                                value={issuerRelationFilter}
                                                onChange={(e) => setIssuerRelationFilter(e.target.value as any)}
                                                className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold outline-none focus:border-emerald-500"
                                            >
                                                <option value="ALL">همه (خود مشتری و شخص ثالث)</option>
                                                <option value="SELF">صاحب چک و تحویل‌دهنده یکی است (خود مشتری)</option>
                                                <option value="THIRD_PARTY">چک شخص ثالث (صاحب چک فرد دیگر است)</option>
                                            </select>
                                        </div>

                                        {/* 6. Deliverer Name / Counterparty */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                نام تحویل‌دهنده چک / طرف حساب
                                            </label>
                                            <input
                                                type="text"
                                                list="archive-deliverer-list"
                                                value={delivererFilter}
                                                onChange={(e) => setDelivererFilter(e.target.value)}
                                                placeholder="نام یا کد طرف حساب تحویل‌دهنده..."
                                                className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-medium outline-none focus:border-emerald-500"
                                            />
                                            <datalist id="archive-deliverer-list">
                                                {archivePersonSuggestions.map(n => <option key={n} value={n} />)}
                                            </datalist>
                                        </div>

                                        {/* 7. Cheque Owner / In Name Of */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                صاحب چک / صادرکننده (در وجه)
                                            </label>
                                            <input
                                                type="text"
                                                list="archive-innameof-list"
                                                value={inNameOfFilter}
                                                onChange={(e) => setInNameOfFilter(e.target.value)}
                                                placeholder="نام صاحب حساب روی چک..."
                                                className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-medium outline-none focus:border-emerald-500"
                                            />
                                            <datalist id="archive-innameof-list">
                                                {archiveInNameOfSuggestions.map(n => <option key={n} value={n} />)}
                                            </datalist>
                                        </div>

                                        {/* 8. Bank */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                بانک صادرکننده چک
                                            </label>
                                            <select
                                                value={bankFilter}
                                                onChange={(e) => setBankFilter(e.target.value)}
                                                className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold outline-none focus:border-emerald-500"
                                            >
                                                <option value="ALL">همه بانک‌ها</option>
                                                {availableArchiveBanks.map(b => (
                                                    <option key={b} value={b}>بانک {b}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* 9. Cashbox */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                صندوق دریافت چک
                                            </label>
                                            <select
                                                value={cashboxFilter}
                                                onChange={(e) => setCashboxFilter(e.target.value)}
                                                className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-bold outline-none focus:border-emerald-500"
                                            >
                                                <option value="ALL">همه صندوق‌ها</option>
                                                {cashboxesList.map(box => (
                                                    <option key={box.code} value={box.code}>{box.title} ({toPersianDigits(box.code)})</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* 10. Cheque Due Date From (Shamsi) */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                سررسید چک از تاریخ (شمسی)
                                            </label>
                                            <div className="relative flex items-center">
                                                <input
                                                    type="text"
                                                    value={dueDateFrom}
                                                    onChange={(e) => setDueDateFrom(normalizeToAsciiDigits(e.target.value))}
                                                    placeholder="مثلاً 1405/01/01"
                                                    className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pr-2.5 pl-8 py-1.5 font-mono font-bold outline-none focus:border-emerald-500"
                                                />
                                                <div className="absolute left-1.5 top-1.5 z-10">
                                                    <DatePicker
                                                        calendar={persian}
                                                        locale={persian_fa}
                                                        value={dueDateFrom || undefined}
                                                        onChange={(d: any) => {
                                                            const v = normalizeToAsciiDigits(d?.format?.('YYYY/MM/DD'));
                                                            if (v) setDueDateFrom(v);
                                                        }}
                                                        render={(_v: any, openCalendar: any) => (
                                                            <button type="button" onClick={openCalendar} className="p-1 text-emerald-600 hover:bg-slate-100 rounded-lg" title="تقویم">
                                                                <Calendar className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* 11. Cheque Due Date To (Shamsi) */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                سررسید چک تا تاریخ (شمسی)
                                            </label>
                                            <div className="relative flex items-center">
                                                <input
                                                    type="text"
                                                    value={dueDateTo}
                                                    onChange={(e) => setDueDateTo(normalizeToAsciiDigits(e.target.value))}
                                                    placeholder="مثلاً 1405/12/29"
                                                    className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pr-2.5 pl-8 py-1.5 font-mono font-bold outline-none focus:border-emerald-500"
                                                />
                                                <div className="absolute left-1.5 top-1.5 z-10">
                                                    <DatePicker
                                                        calendar={persian}
                                                        locale={persian_fa}
                                                        value={dueDateTo || undefined}
                                                        onChange={(d: any) => {
                                                            const v = normalizeToAsciiDigits(d?.format?.('YYYY/MM/DD'));
                                                            if (v) setDueDateTo(v);
                                                        }}
                                                        render={(_v: any, openCalendar: any) => (
                                                            <button type="button" onClick={openCalendar} className="p-1 text-emerald-600 hover:bg-slate-100 rounded-lg" title="تقویم">
                                                                <Calendar className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* 12. Doc Date From (Shamsi) */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                تاریخ ثبت رسید از (شمسی)
                                            </label>
                                            <div className="relative flex items-center">
                                                <input
                                                    type="text"
                                                    value={docDateFrom}
                                                    onChange={(e) => setDocDateFrom(normalizeToAsciiDigits(e.target.value))}
                                                    placeholder="مثلاً 1405/01/01"
                                                    className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pr-2.5 pl-8 py-1.5 font-mono font-bold outline-none focus:border-emerald-500"
                                                />
                                                <div className="absolute left-1.5 top-1.5 z-10">
                                                    <DatePicker
                                                        calendar={persian}
                                                        locale={persian_fa}
                                                        value={docDateFrom || undefined}
                                                        onChange={(d: any) => {
                                                            const v = normalizeToAsciiDigits(d?.format?.('YYYY/MM/DD'));
                                                            if (v) setDocDateFrom(v);
                                                        }}
                                                        render={(_v: any, openCalendar: any) => (
                                                            <button type="button" onClick={openCalendar} className="p-1 text-blue-600 hover:bg-slate-100 rounded-lg" title="تقویم">
                                                                <Calendar className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* 13. Doc Date To (Shamsi) */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                تاریخ ثبت رسید تا (شمسی)
                                            </label>
                                            <div className="relative flex items-center">
                                                <input
                                                    type="text"
                                                    value={docDateTo}
                                                    onChange={(e) => setDocDateTo(normalizeToAsciiDigits(e.target.value))}
                                                    placeholder="مثلاً 1405/12/29"
                                                    className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pr-2.5 pl-8 py-1.5 font-mono font-bold outline-none focus:border-emerald-500"
                                                />
                                                <div className="absolute left-1.5 top-1.5 z-10">
                                                    <DatePicker
                                                        calendar={persian}
                                                        locale={persian_fa}
                                                        value={docDateTo || undefined}
                                                        onChange={(d: any) => {
                                                            const v = normalizeToAsciiDigits(d?.format?.('YYYY/MM/DD'));
                                                            if (v) setDocDateTo(v);
                                                        }}
                                                        render={(_v: any, openCalendar: any) => (
                                                            <button type="button" onClick={openCalendar} className="p-1 text-blue-600 hover:bg-slate-100 rounded-lg" title="تقویم">
                                                                <Calendar className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* 14. Min Amount */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                حداقل مبلغ کل (ریال)
                                            </label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={minAmountFilter ? Number(normalizeToAsciiDigits(minAmountFilter).replace(/[^\d]/g, '') || 0).toLocaleString('en-US') : ''}
                                                onChange={(e) => setMinAmountFilter(normalizeToAsciiDigits(e.target.value).replace(/[^\d]/g, ''))}
                                                placeholder="از مبلغ..."
                                                className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-mono font-bold outline-none focus:border-emerald-500"
                                            />
                                        </div>

                                        {/* 15. Max Amount */}
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                                                حداکثر مبلغ کل (ریال)
                                            </label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={maxAmountFilter ? Number(normalizeToAsciiDigits(maxAmountFilter).replace(/[^\d]/g, '') || 0).toLocaleString('en-US') : ''}
                                                onChange={(e) => setMaxAmountFilter(normalizeToAsciiDigits(e.target.value).replace(/[^\d]/g, ''))}
                                                placeholder="تا مبلغ..."
                                                className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 font-mono font-bold outline-none focus:border-emerald-500"
                                            />
                                        </div>

                                        {/* 16. Sayad ID / Attachment / Source */}
                                        <div className="grid grid-cols-3 gap-1.5 sm:col-span-2 lg:col-span-1">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1 truncate">
                                                    شناسه صیاد
                                                </label>
                                                <select
                                                    value={sayadFilter}
                                                    onChange={(e) => setSayadFilter(e.target.value as any)}
                                                    className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-1.5 py-1.5 text-[11px] font-bold outline-none"
                                                >
                                                    <option value="ALL">همه</option>
                                                    <option value="HAS_SAYAD">دارای صیاد</option>
                                                    <option value="NO_SAYAD">بدون صیاد</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1 truncate">
                                                    پیوست تصویر
                                                </label>
                                                <select
                                                    value={attachmentFilter}
                                                    onChange={(e) => setAttachmentFilter(e.target.value as any)}
                                                    className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-1.5 py-1.5 text-[11px] font-bold outline-none"
                                                >
                                                    <option value="ALL">همه</option>
                                                    <option value="HAS_ATTACHMENT">دارد</option>
                                                    <option value="NO_ATTACHMENT">ندارد</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1 truncate">
                                                    منبع رکورد
                                                </label>
                                                <select
                                                    value={sourceFilter}
                                                    onChange={(e) => setSourceFilter(e.target.value as any)}
                                                    className="w-full min-h-[38px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-1.5 py-1.5 text-[11px] font-bold outline-none"
                                                >
                                                    <option value="ALL">همه</option>
                                                    <option value="APP_DRAFT">سیستم</option>
                                                    <option value="SAYAN_DB">سایان</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Filtered Summary Strip */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                            <span className="text-slate-500 dark:text-slate-400 font-bold">رسیدهای یافت‌شده</span>
                            <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                                {toPersianDigits(archiveStats.receiptsCount)} رسید
                            </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/50 flex items-center justify-between">
                            <span className="text-blue-700 dark:text-blue-300 font-bold">مجموع برگ چک‌ها</span>
                            <span className="font-mono font-black text-sm text-blue-800 dark:text-blue-200">
                                {toPersianDigits(archiveStats.totalCheques)} فقره
                            </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 flex items-center justify-between col-span-2 lg:col-span-2">
                            <span className="text-emerald-700 dark:text-emerald-300 font-bold">جمع کل مبلغ فیلترشده</span>
                            <div className="flex items-baseline gap-2 flex-wrap justify-end">
                                <span className="font-mono font-black text-sm text-emerald-700 dark:text-emerald-300">
                                    {toPersianDigits(archiveStats.totalAmount.toLocaleString('fa-IR'))} ریال
                                </span>
                                <span className="text-[11px] font-mono text-emerald-600/80 dark:text-emerald-400/80">
                                    ({toPersianDigits(Math.floor(archiveStats.totalAmount / 10).toLocaleString('fa-IR'))} تومان)
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Empty State */}
                    {archiveList.length === 0 ? (
                        <div className="py-12 text-center space-y-3 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                            <Search className="w-8 h-8 text-slate-300 mx-auto" />
                            <p className="text-xs font-bold text-slate-500">
                                با فیلترهای انتخابی فعلی هیچ رسید یا چکی یافت نشد.
                            </p>
                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={resetArchiveFilters}
                                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>نمایش همه رسیدها</span>
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Mobile & Android Responsive Card List */}
                            <div className="md:hidden space-y-3">
                                {archiveList.map(r => {
                                    const cheques = r.cheques || [];
                                    const firstCheque = cheques[0];
                                    const selfRel = firstCheque ? resolveChequeSelfIssuer(r, firstCheque) : null;
                                    const regNeedsFix = isNeedsSayanReregister(r);
                                    const regProcessing = isProcessingSayan(r);
                                    const regDone = isRegisteredInSayan(r);

                                    return (
                                        <div
                                            key={r.id}
                                            className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2.5"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-mono font-black text-xs text-blue-600 dark:text-blue-400">
                                                            {r.receiptNo ? `#${toPersianDigits(r.receiptNo)}` : (r.docNo ? `سند ${toPersianDigits(r.docNo)}` : `#${toPersianDigits(r.id)}`)}
                                                        </span>
                                                        <span className="font-mono text-[11px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                                                            پشت‌نمره: {toPersianDigits(r.poshtNomreh || '-')}
                                                        </span>
                                                        <span className="font-mono text-[10px] text-slate-400">
                                                            {toPersianDigits(normalizeFilterShamsi(r.docDateShamsi || r.docDate || r.createdAt) || '-')}
                                                        </span>
                                                    </div>
                                                    <div className="font-black text-xs text-slate-900 dark:text-white mt-1 truncate">
                                                        تحویل‌دهنده: {r.personName}
                                                    </div>
                                                </div>

                                                <div className="text-left shrink-0">
                                                    <div className="font-mono font-black text-xs text-emerald-600 dark:text-emerald-400">
                                                        {toPersianDigits(Number(r.totalAmount || 0).toLocaleString('fa-IR'))} ریال
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-mono">
                                                        {toPersianDigits(cheques.length || 1)} برگ چک
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Cheques Summary Badges */}
                                            {cheques.length > 0 && (
                                                <div className="space-y-1.5 bg-white dark:bg-slate-900/90 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px]">
                                                    {cheques.slice(0, 2).map((c, idx) => (
                                                        <div key={idx} className="flex flex-wrap items-center justify-between gap-1.5">
                                                            <span className="font-bold text-slate-700 dark:text-slate-200">
                                                                {c.bankName || 'بانک'} • چک {toPersianDigits(c.chequeNumber || '-')}
                                                            </span>
                                                            <span className="font-mono text-slate-500">
                                                                سررسید: {toPersianDigits(normalizeFilterShamsi(c.dueDate) || '-')}
                                                            </span>
                                                            {c.inNameOf && (
                                                                <span className="text-[10px] text-slate-500 w-full truncate">
                                                                    صاحب چک: {c.inNameOf}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {cheques.length > 2 && (
                                                        <div className="text-[10px] text-blue-600 font-bold">
                                                            + {toPersianDigits(cheques.length - 2)} برگ چک دیگر
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Status & Sayadi Badges */}
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {regNeedsFix ? (
                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                                        سند ۱ (نیازمند ثبت مجدد)
                                                    </span>
                                                ) : regDone ? (
                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                                                        ثبت شده در سایان {r.docNo ? `(سند ${toPersianDigits(r.docNo)})` : ''}
                                                    </span>
                                                ) : regProcessing ? (
                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-indigo-100 text-indigo-800 border border-indigo-300">
                                                        در حال ثبت در سایان
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200">
                                                        ثبت نشده در سایان ({r.status === 'PENDING_CEO' ? 'آماده ثبت' : 'منتظر حسابداری'})
                                                    </span>
                                                )}

                                                {firstCheque?.registrationType && (
                                                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200">
                                                        {getChequeRegistrationLabel(firstCheque.registrationType, firstCheque.registeredPersonName)}
                                                    </span>
                                                )}

                                                {selfRel !== null && (
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                                        selfRel
                                                            ? 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300'
                                                            : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                                    }`}>
                                                        {getChequeIssuerLabel(selfRel)}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Mobile Action Buttons */}
                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedDetailReceipt(r)}
                                                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    <span>جزئیات</span>
                                                </button>
                                                {(regNeedsFix || r.status === 'PENDING_CEO') && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleReRegisterInSayan(r.id)}
                                                        disabled={actionLoading === r.id}
                                                        className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1"
                                                    >
                                                        {actionLoading === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                                        <span>ثبت سایان</span>
                                                    </button>
                                                )}
                                                {r.archiveCode && String(r.archiveCode) !== '1' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setInspectingArchiveCode({ archiveCode: r.archiveCode, docNo: r.docNo })}
                                                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200 text-xs font-bold flex items-center justify-center gap-1"
                                                    >
                                                        <Layers className="w-3.5 h-3.5" />
                                                        <span>سند سایان</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Desktop Web Enterprise Table */}
                            <div className="hidden md:block border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto">
                                <table className="w-full text-right text-xs">
                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                                        <tr>
                                            <th className="px-3 py-3">شماره رسید / تاریخ</th>
                                            <th className="px-3 py-3">پشت‌نمره</th>
                                            <th className="px-3 py-3">تحویل‌دهنده (طرف حساب)</th>
                                            <th className="px-3 py-3">مشخصات چک‌ها (بانک / سررسید / صاحب چک)</th>
                                            <th className="px-3 py-3">ثبت صیادی و نسبت صادرکننده</th>
                                            <th className="px-3 py-3">مبلغ کل (ریال)</th>
                                            <th className="px-3 py-3">سند / وضعیت سایان</th>
                                            <th className="px-3 py-3 text-center">عملیات و استعلام</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {archiveList.map(r => {
                                            const cheques = r.cheques || [];
                                            const firstCheque = cheques[0];
                                            const selfRel = firstCheque ? resolveChequeSelfIssuer(r, firstCheque) : null;
                                            return (
                                                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-top">
                                                    <td className="px-3 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                                                        <div className="flex items-center gap-1.5">
                                                            <span>{r.receiptNo ? `#${toPersianDigits(r.receiptNo)}` : (r.docNo ? `سند ${toPersianDigits(r.docNo)}` : `#${toPersianDigits(r.id)}`)}</span>
                                                            {canEditReceipt && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setEditingReceiptNoItem({ id: r.id, currentNo: String(r.receiptNo || r.id) });
                                                                        setTempQuickReceiptNo(String(r.receiptNo || r.id));
                                                                    }}
                                                                    className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors cursor-pointer"
                                                                    title="ویرایش شماره رسید (مثلا: ۸۴۸)"
                                                                >
                                                                    <Edit3 className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                                                            {toPersianDigits(normalizeFilterShamsi(r.docDateShamsi || r.docDate || r.createdAt) || '-')}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 font-mono font-bold text-amber-600">
                                                        {toPersianDigits(r.poshtNomreh || '-')}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="font-bold text-slate-800 dark:text-slate-200">{r.personName}</div>
                                                        {r.personCode && (
                                                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                                                کد: {toPersianDigits(r.personCode)}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3 min-w-[210px]">
                                                        {cheques.length > 0 ? (
                                                            <div className="space-y-1">
                                                                {cheques.slice(0, 2).map((c, cIdx) => (
                                                                    <div key={cIdx} className="text-[11px] bg-slate-50 dark:bg-slate-800/70 px-2 py-1 rounded-lg border border-slate-200/70 dark:border-slate-700/70">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <span className="font-bold text-slate-700 dark:text-slate-200">
                                                                                {c.bankName || '-'} • {toPersianDigits(c.chequeNumber || '-')}
                                                                            </span>
                                                                            <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                                                                                {toPersianDigits(normalizeFilterShamsi(c.dueDate) || '-')}
                                                                            </span>
                                                                        </div>
                                                                        {c.inNameOf && (
                                                                            <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                                                                صاحب چک: {c.inNameOf}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                {cheques.length > 2 && (
                                                                    <div className="text-[10px] font-bold text-blue-600">
                                                                        + {toPersianDigits(cheques.length - 2)} برگ چک دیگر ({toPersianDigits(cheques.length)} برگ)
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex flex-col gap-1 items-start">
                                                            {firstCheque?.registrationType ? (
                                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                                                    firstCheque.registrationType === 'company'
                                                                        ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300'
                                                                        : firstCheque.registrationType === 'person'
                                                                        ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300'
                                                                        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
                                                                }`}>
                                                                    {getChequeRegistrationLabel(firstCheque.registrationType, firstCheque.registeredPersonName)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] text-slate-400">صیادی تعیین نشده</span>
                                                            )}
                                                            {selfRel !== null && (
                                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                                                    selfRel
                                                                        ? 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300'
                                                                        : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                                                }`}>
                                                                    {getChequeIssuerLabel(selfRel)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 font-mono font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                        {toPersianDigits(Number(r.totalAmount || 0).toLocaleString('fa-IR'))}
                                                        <div className="text-[10px] font-normal text-slate-400">
                                                            {toPersianDigits(cheques.length || 1)} برگ
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="space-y-1">
                                                            {(String(r.docNo) === '1' || String(r.archiveCode) === '1') ? (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 inline-flex items-center gap-1">
                                                                    <AlertCircle className="w-3 h-3 text-amber-600" />
                                                                    <span>سند ۱ (نیازمند ثبت مجدد)</span>
                                                                </span>
                                                            ) : r.status === 'REGISTERED_IN_SAYAN' ? (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 inline-block">
                                                                    ثبت شده در سایان
                                                                </span>
                                                            ) : r.status === 'PROCESSING_SAYAN' || r.sayanSyncStatus === 'QUEUED' || r.sayanSyncStatus === 'PROCESSING' ? (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-300 inline-flex items-center gap-1 animate-pulse">
                                                                    <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                                                                    <span>در حال ثبت سایان</span>
                                                                </span>
                                                            ) : r.status === 'PENDING_CEO' ? (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 inline-block">
                                                                    {workflowConfig.requireCeoApproval ? 'منتظر مدیرعامل' : 'آماده ثبت سایان'}
                                                                </span>
                                                            ) : r.status === 'PENDING_ACCOUNTING' ? (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 inline-block">
                                                                    منتظر حسابداری
                                                                </span>
                                                            ) : (
                                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 inline-block">
                                                                    {r.status}
                                                                </span>
                                                            )}
                                                            {r.archiveCode && String(r.archiveCode) !== '1' && (
                                                                <div className="text-[10px] font-mono text-purple-600 font-bold">
                                                                    سند: {toPersianDigits(r.docNo || '-')} ({toPersianDigits(r.archiveCode)})
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedDetailReceipt(r)}
                                                                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                                                                title="مشاهده جزئیات کامل رسید"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </button>
                                                            {(String(r.docNo) === '1' || String(r.archiveCode) === '1' || r.status === 'PENDING_CEO') ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleReRegisterInSayan(r.id)}
                                                                    disabled={actionLoading === r.id}
                                                                    className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold text-[11px] border border-emerald-500 shadow-sm flex items-center gap-1 hover:from-emerald-700 hover:to-teal-800 transition-all shrink-0 cursor-pointer"
                                                                    title="ثبت مجدد و دریافت شماره سند و بایگانی واقعی سایان"
                                                                >
                                                                    {actionLoading === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                                                    <span>ثبت سایان</span>
                                                                </button>
                                                            ) : null}
                                                            {r.archiveCode && String(r.archiveCode) !== '1' ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setInspectingArchiveCode({ archiveCode: r.archiveCode, docNo: r.docNo })}
                                                                    className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold text-[11px] border border-purple-200 dark:border-purple-800 flex items-center gap-1 hover:bg-purple-100 cursor-pointer"
                                                                    title="استعلام زنده سند واقعی از جداول سایان"
                                                                >
                                                                    <Layers className="w-3.5 h-3.5" />
                                                                    <span>سند واقعی</span>
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Modals */}
            {inspectingArchiveCode && (
                <RealSayanDocumentModal
                    archiveCode={inspectingArchiveCode.archiveCode}
                    docNo={inspectingArchiveCode.docNo}
                    fiscalYear={fiscalYear}
                    onClose={() => setInspectingArchiveCode(null)}
                />
            )}

            {reviewingReceipt && (
                <AccountingReviewModal
                    receipt={reviewingReceipt}
                    fiscalYear={fiscalYear}
                    onClose={() => setReviewingReceipt(null)}
                    onSaveReview={handleSaveAccountingReview}
                    actionLoading={actionLoading}
                    onApproveByCeo={handleApproveByCeo}
                    currentUser={currentUser}
                    isCeoOrAdmin={isCeoOrAdmin}
                    isFinancialOrAdmin={isFinancialOrAdmin}
                />
            )}

            {selectedDetailReceipt && (
                <ChequeReceiptDetailModal
                    receipt={selectedDetailReceipt}
                    currentUser={currentUser}
                    onClose={() => setSelectedDetailReceipt(null)}
                    onOpenRealSayanDoc={(arch, doc) => {
                        setSelectedDetailReceipt(null);
                        setInspectingArchiveCode({ archiveCode: arch, docNo: doc });
                    }}
                    onOpenAccountingReview={(rec) => {
                        setSelectedDetailReceipt(null);
                        setReviewingReceipt(rec);
                    }}
                    onPrintA5={(rec) => {
                        setSelectedDetailReceipt(null);
                        setPrintReceipt(rec);
                        setIsPrintModalOpen(true);
                    }}
                    onApproveByCeo={handleApproveByCeo}
                    onReject={handleReject}
                    onDelete={handleDeleteReceipt}
                    actionLoading={actionLoading}
                    isFinancialOrAdmin={isFinancialOrAdmin}
                    isCeoOrAdmin={isCeoOrAdmin}
                    canDeleteReceipt={canDeleteReceipt}
                    canEditReceipt={canEditReceipt}
                    onUpdateReceipt={(updated) => {
                        setSelectedDetailReceipt(updated);
                        fetchReceipts(true);
                    }}
                />
            )}

            {/* A5 Landscape Cheque Receipt Print & Preview Modal */}
            {isPrintModalOpen && printReceipt && (
                <A5ChequeReceiptPrintModal
                    receipt={printReceipt}
                    onClose={() => {
                        setIsPrintModalOpen(false);
                        setPrintReceipt(null);
                    }}
                />
            )}

            {/* Standard Touch-Zoomable File Viewer Modal */}
            {previewFile && (
                <FileViewerModal
                    isOpen={!!previewFile}
                    onClose={() => setPreviewFile(null)}
                    fileUrl={resolveImageUrl(previewFile.url || previewFile.fileData || '')}
                    fileName={previewFile.fileName || 'پیش‌نمایش فایل پیوست'}
                />
            )}
            {/* Cheque Workflow & Permissions Settings Modal */}
            <ChequeWorkflowSettingsModal
                isOpen={isWorkflowModalOpen}
                onClose={() => setIsWorkflowModalOpen(false)}
                currentConfig={workflowConfig}
                systemUsers={systemUsersList}
                onSaveSuccess={(updated) => {
                    setWorkflowConfig(updated);
                    fetchReceipts(true);
                }}
            />

            {/* Quick Edit Receipt Number Modal */}
            {editingReceiptNoItem && typeof document !== 'undefined' && createPortal(
                <div 
                    className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in"
                    dir="rtl"
                    onClick={() => {
                        if (!savingQuickReceiptNo) setEditingReceiptNoItem(null);
                    }}
                >
                    <div 
                        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 animate-scale-in"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                    <Edit3 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                        ویرایش دستی شماره رسید
                                    </h3>
                                    <p className="text-[11px] text-slate-500">
                                        شماره رسید مورد نظر را وارد نمایید (مثال: ۱۳۹۹)
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingReceiptNoItem(null)}
                                disabled={savingQuickReceiptNo}
                                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                شماره رسید جدید:
                            </label>
                            <input
                                type="text"
                                value={tempQuickReceiptNo}
                                onChange={(e) => setTempQuickReceiptNo(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleUpdateQuickReceiptNo(editingReceiptNoItem.id, tempQuickReceiptNo);
                                    }
                                }}
                                autoFocus
                                placeholder="مثال: ۱۳۹۹"
                                className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-blue-400 dark:border-blue-600 rounded-2xl px-4 py-3 text-base font-mono font-black text-blue-700 dark:text-blue-300 outline-none focus:bg-white dark:focus:bg-slate-900 transition-all text-center tracking-widest"
                            />
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                                این شماره در تمامی اسناد، گزارشات، فایل پرینت A5 و فرآیند تاییدیه مالی جایگزین خواهد شد.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => setEditingReceiptNoItem(null)}
                                disabled={savingQuickReceiptNo}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                انصراف
                            </button>
                            <button
                                type="button"
                                onClick={() => handleUpdateQuickReceiptNo(editingReceiptNoItem.id, tempQuickReceiptNo)}
                                disabled={savingQuickReceiptNo}
                                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50"
                            >
                                {savingQuickReceiptNo ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>در حال ذخیره...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>ثبت و ذخیره تغییرات</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {/* Modal showing due cheques for selected day in Sayan Registrations */}
            {sayanSelectedDayModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in" dir="rtl">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-500 to-indigo-600 text-white">
                            <div className="flex items-center gap-2">
                                <CalendarDays className="w-5 h-5" />
                                <h3 className="font-black text-sm md:text-base">
                                    چک‌های سررسید شده در تاریخ {sayanSelectedDayModal.dateStr} (خزانه‌داری سایان)
                                </h3>
                            </div>
                            <button 
                                onClick={() => setSayanSelectedDayModal(null)}
                                className="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-3 flex-1">
                            {sayanSelectedDayModal.items.map((item, idx) => (
                                <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div className="space-y-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="px-2 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-black text-xs">
                                                {item.bankName || 'بانک'}
                                            </span>
                                            <span className="font-mono font-black text-sm text-slate-800 dark:text-slate-100">
                                                شماره: {toPersianDigits(item.chequeNumber || '---')}
                                            </span>
                                        </div>
                                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                            طرف حساب: {item.personName || 'نامشخص'}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            رسید/سند سایان: #{toPersianDigits(item.docNo || item.receiptId)}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3 justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-200 dark:border-slate-700">
                                        <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                            {toPersianDigits(Number(item.amount || 0).toLocaleString('fa-IR'))} ریال
                                        </span>
                                        {item.receiptRecord && (
                                            <button
                                                onClick={() => {
                                                    setSelectedDetailReceipt(item.receiptRecord);
                                                    setSayanSelectedDayModal(null);
                                                }}
                                                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm"
                                            >
                                                <Eye className="w-3.5 h-3.5" /> جزئیات سند
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-800/40">
                            <button
                                onClick={() => setSayanSelectedDayModal(null)}
                                className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs"
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

export default SayanChequeReceiptsTab;
