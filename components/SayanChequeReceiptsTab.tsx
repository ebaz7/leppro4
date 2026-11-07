import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    CreditCard, Plus, Trash2, CheckCircle2, AlertCircle, Clock, ShieldCheck,
    Search, RefreshCw, Eye, Download, Upload, Calendar, Building2, User,
    FileCheck, ArrowRight, ExternalLink, X, ChevronDown, Check, Sparkles,
    Hash, Layers, ShieldAlert, ArrowUpRight, Copy, Printer, Edit3, CornerUpLeft,
    CheckSquare, FileText, ArrowLeft, Settings2, Sliders, Zap, Loader2,
    CalendarDays, ChevronRight, ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as jalaali from 'jalaali-js';
import { UserRole } from '../types';
import { getRolePermissions } from '../services/authService';
import { ChequeItemRow, ChequeItemInput, COMMON_IRANIAN_BANKS, normalizeToAsciiDigits, toShamsiStr, fromShamsiStr } from './sayan-cheques/ChequeItemRow';
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
    personCode: string;
    personName: string;
    totalAmount: number;
    description: string;
    cheques: Array<{
        chequeId?: string;
        rowId?: string;
        chequeNumber: string;
        amount: number;
        dueDate: string;
        bankName: string;
        inNameOf: string;
        poshtNomreh?: string;
        description?: string;
    }>;
    attachments?: Array<{
        fileName: string;
        fileData: string;
        fileType?: string;
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

    const fetchWorkflowConfig = async () => {
        try {
            const res = await apiFetch('/api/sayan/cheque-receipts/workflow-config');
            if (res.ok) {
                const data = await res.json();
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
            const data = await res.json();
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
            amount: '',
            dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
            bankName: 'سامان',
            inNameOf: '',
            accountNo: '',
            description: ''
        }
    ]);

    // Data lists
    const [receiptsList, setReceiptsList] = useState<ChequeReceiptRecord[]>([]);
    const [loadingReceipts, setLoadingReceipts] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Filters & Search in Archive
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_ACCOUNTING' | 'PENDING_CEO' | 'REGISTERED_IN_SAYAN'>('ALL');

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
            const data = await res.json();
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
            const data = await res.json();
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
            const data = await res.json();
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
            const data = await res.json();
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
                amount: '',
                dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                bankName: 'سامان',
                inNameOf: selectedPerson ? selectedPerson.fullName : '',
                accountNo: '',
                description: ''
            }
        ]);
        if (autoFocus) {
            setTimeout(() => {
                document.getElementById(`cheque-${chequeRows.length}-number`)?.focus();
            }, 50);
        }
    };

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
                        const json = await uploadRes.json();
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

        if (chequeRows.some(r => !r.chequeNumber.trim() || !r.amount)) {
            setErrorMessage('شماره چک و مبلغ برای تمامی ردیف‌های چک الزامی است.');
            return;
        }

        setActionLoading('submit_new');

        try {
            const payload = {
                fiscalYear,
                receiptNo: receiptNoInput.trim() || undefined,
                poshtNomreh: poshtNomreh.trim() || '1',
                personCode: selectedPerson ? selectedPerson.personCode : '101',
                personName: selectedPerson ? selectedPerson.fullName : personQuery.trim(),
                cashboxCode,
                totalAmount: sumChequesAmount,
                description: description.trim() || `رسید دریافت چک - ${selectedPerson?.fullName || personQuery}`,
                cheques: chequeRows.map((r, idx) => ({
                    chequeNumber: r.chequeNumber.trim(),
                    amount: Number(r.amount),
                    dueDate: r.dueDate,
                    bankName: r.bankName.trim() || 'سامان',
                    inNameOf: r.inNameOf.trim() || (selectedPerson?.fullName || personQuery.trim()),
                    poshtNomreh: poshtNomreh.trim() || '1',
                    rowSeq: idx + 1,
                    description: r.description?.trim() || ''
                })),
                attachments,
                createdByName: currentUser?.name || 'کاربر سیستم'
            };

            const res = await apiFetch('/api/sayan/cheque-receipts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
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
                    docDateShamsi: docDateShamsi,
                    createdAt: new Date().toISOString(),
                    cheques: payload.cheques,
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
                        amount: '',
                        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                        bankName: 'سامان',
                        inNameOf: '',
                        accountNo: '',
                        description: ''
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

            const data = await res.json();
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

            const data = await res.json();
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

            const data = await res.json();
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

            const data = await res.json();
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
            const data = await res.json();
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
            const data = await res.json();
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

    const archiveList = useMemo(() => {
        return receiptsList.filter(r => {
            const matchSearch = !searchTerm ||
                r.personName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                String(r.poshtNomreh || '').includes(searchTerm) ||
                String(r.docNo || '').includes(searchTerm) ||
                String(r.archiveCode || '').includes(searchTerm) ||
                r.cheques?.some(c => c.chequeNumber?.includes(searchTerm));

            if (!matchSearch) return false;

            if (statusFilter === 'ALL') return true;
            if (statusFilter === 'REGISTERED_IN_SAYAN') {
                return r.status === 'REGISTERED_IN_SAYAN' || r.status === 'PROCESSING_SAYAN';
            }
            return r.status === statusFilter;
        });
    }, [receiptsList, searchTerm, statusFilter]);

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
                            type="submit"
                            disabled={actionLoading === 'submit_new'}
                            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
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
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
                    {/* Filter & Search Bar */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="relative w-full sm:w-80">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="جستجو در طرف حساب، شماره چک، سند، پشت نمره..."
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs outline-none focus:border-emerald-500"
                            />
                            <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto text-xs font-bold">
                            <button
                                type="button"
                                onClick={() => setStatusFilter('ALL')}
                                className={`px-3 py-1.5 rounded-xl transition-colors ${
                                    statusFilter === 'ALL'
                                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                                }`}
                            >
                                همه ({toPersianDigits(receiptsList.length)})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('REGISTERED_IN_SAYAN')}
                                className={`px-3 py-1.5 rounded-xl transition-colors ${
                                    statusFilter === 'REGISTERED_IN_SAYAN'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                                }`}
                            >
                                ثبت شده در سایان
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('PENDING_CEO')}
                                className={`px-3 py-1.5 rounded-xl transition-colors ${
                                    statusFilter === 'PENDING_CEO'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                                }`}
                            >
                                {workflowConfig.requireCeoApproval ? 'منتظر تایید مدیرعامل' : 'آماده ثبت در سایان'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('PENDING_ACCOUNTING')}
                                className={`px-3 py-1.5 rounded-xl transition-colors ${
                                    statusFilter === 'PENDING_ACCOUNTING'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                                }`}
                            >
                                منتظر تایید حسابداری
                            </button>

                            <button
                                type="button"
                                onClick={() => fetchReceipts(false)}
                                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600"
                                title="بروزرسانی لیست"
                            >
                                <RefreshCw className={`w-4 h-4 ${loadingReceipts ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Archive Table */}
                    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto">
                        <table className="w-full text-right text-xs">
                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                                <tr>
                                    <th className="px-3 py-3">شماره رسید</th>
                                    <th className="px-3 py-3">پشت‌نمره</th>
                                    <th className="px-3 py-3">طرف حساب (شخص)</th>
                                    <th className="px-3 py-3">مبلغ کل (ریال)</th>
                                    <th className="px-3 py-3">تعداد چک</th>
                                    <th className="px-3 py-3">سند / بایگانی سایان</th>
                                    <th className="px-3 py-3">وضعیت فرآیند</th>
                                    <th className="px-3 py-3 text-center">عملیات و استعلام</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {archiveList.map(r => (
                                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
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
                                        </td>
                                        <td className="px-3 py-3 font-mono font-bold text-amber-600">
                                            {toPersianDigits(r.poshtNomreh || '-')}
                                        </td>
                                        <td className="px-3 py-3 font-bold text-slate-800 dark:text-slate-200">
                                            {r.personName}
                                        </td>
                                        <td className="px-3 py-3 font-mono font-black text-emerald-600 dark:text-emerald-400">
                                            {toPersianDigits(Number(r.totalAmount || 0).toLocaleString('fa-IR'))}
                                        </td>
                                        <td className="px-3 py-3 font-mono text-slate-500">
                                            {toPersianDigits(r.cheques?.length || 1)} برگ
                                        </td>
                                        <td className="px-3 py-3 font-mono">
                                            {(String(r.docNo) === '1' || String(r.archiveCode) === '1') ? (
                                                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-black bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-700">
                                                    سند ۱ (نیازمند ثبت مجدد)
                                                </span>
                                            ) : r.archiveCode ? (
                                                <div className="flex items-center gap-1 text-purple-600 font-bold">
                                                    <span>سند: {toPersianDigits(r.docNo || '-')}</span>
                                                    <span className="text-[10px] text-slate-400">({toPersianDigits(r.archiveCode)})</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            {(String(r.docNo) === '1' || String(r.archiveCode) === '1') ? (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3 text-amber-600" />
                                                    <span>نیازمند ثبت مجدد در سایان</span>
                                                </span>
                                            ) : r.status === 'REGISTERED_IN_SAYAN' ? (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                                                    ثبت شده در سایان
                                                </span>
                                            ) : r.status === 'PROCESSING_SAYAN' || r.sayanSyncStatus === 'QUEUED' || r.sayanSyncStatus === 'PROCESSING' ? (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-300 flex items-center gap-1 animate-pulse">
                                                    <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                                                    <span>در حال ثبت در سایان (پس‌زمینه)</span>
                                                </span>
                                            ) : r.status === 'PENDING_CEO' ? (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                                                    {workflowConfig.requireCeoApproval ? 'منتظر مدیرعامل' : 'آماده ثبت در سایان'}
                                                </span>
                                            ) : r.status === 'PENDING_ACCOUNTING' ? (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300">
                                                    منتظر حسابداری
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                                                    {r.status}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedDetailReceipt(r)}
                                                    className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                                    title="مشاهده جزئیات کامل رسید"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                {(String(r.docNo) === '1' || String(r.archiveCode) === '1' || r.status === 'PENDING_CEO') ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleReRegisterInSayan(r.id)}
                                                        disabled={actionLoading === r.id}
                                                        className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold text-[11px] border border-emerald-500 shadow-sm flex items-center gap-1 hover:from-emerald-700 hover:to-teal-800 transition-all shrink-0"
                                                        title="ثبت مجدد و دریافت شماره سند و بایگانی واقعی سایان"
                                                    >
                                                        {actionLoading === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                                        <span>ثبت مجدد در سایان</span>
                                                    </button>
                                                ) : null}
                                                {r.archiveCode && String(r.archiveCode) !== '1' ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setInspectingArchiveCode({ archiveCode: r.archiveCode, docNo: r.docNo })}
                                                        className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold text-[11px] border border-purple-200 dark:border-purple-800 flex items-center gap-1 hover:bg-purple-100"
                                                        title="استعلام زنده سند واقعی از جداول سایان"
                                                    >
                                                        <Layers className="w-3.5 h-3.5" />
                                                        <span>سند واقعی سایان</span>
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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

            {/* Local Attachment Preview Modal */}
            {previewFile && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-[99999] overflow-y-auto">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[85vh] my-auto animate-scale-in">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-500" />
                                <span>پیش‌نمایش فایل: {previewFile.fileName}</span>
                            </h3>
                            <button
                                type="button"
                                onClick={() => setPreviewFile(null)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        {/* Content */}
                        <div className="p-6 flex-1 overflow-y-auto flex items-center justify-center bg-slate-50 dark:bg-slate-950/40">
                            {previewFile.fileType.startsWith('image/') ? (
                                <img
                                    src={resolveImageUrl(previewFile.url || previewFile.fileData || '')}
                                    alt={previewFile.fileName}
                                    className="max-w-full max-h-[55vh] object-contain rounded-xl shadow-md border border-slate-200 dark:border-slate-800"
                                />
                            ) : previewFile.fileType === 'application/pdf' ? (
                                <iframe
                                    src={resolveImageUrl(previewFile.url || previewFile.fileData || '')}
                                    title={previewFile.fileName}
                                    className="w-full h-[55vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                                />
                            ) : (
                                <div className="text-center py-12 space-y-4">
                                    <FileText className="w-16 h-16 text-indigo-400 mx-auto animate-pulse" />
                                    <p className="text-slate-600 dark:text-slate-400 text-xs">
                                        امکان پیش‌نمایش مستقیم این نوع فایل وجود ندارد. لطفاً آن را دانلود کنید.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/60 rounded-b-3xl">
                            <button
                                type="button"
                                onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = resolveImageUrl(previewFile.url || previewFile.fileData || '');
                                    link.download = previewFile.fileName;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                }}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                                <Download className="w-4 h-4" />
                                <span>دانلود این فایل</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPreviewFile(null)}
                                className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                                بستن
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
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
