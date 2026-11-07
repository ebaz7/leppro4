import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    X, CreditCard, Search, Filter, Calendar, Download, Printer, 
    MessageSquare, RefreshCw, CheckSquare, Square, ChevronDown, 
    ChevronUp, ArrowUpDown, TrendingUp, TrendingDown, Clock, 
    Building2, User, Coins, FileSpreadsheet, ShieldAlert, 
    CheckCircle2, AlertCircle, Sparkles, Percent, Share2, 
    SlidersHorizontal, Eye, ExternalLink, ArrowRight, RotateCcw
} from 'lucide-react';
import * as jalaali from 'jalaali-js';
import * as XLSX from 'xlsx';
import { openSendToChat } from '../../services/chatShareService';
import { getServerHost, getAuthToken } from '../../services/apiService';

export interface SayanPersonCheque {
    id: string;
    chequeNo: string;
    amount: number;
    dueDate: string;
    receiveDate: string;
    bankName: string;
    branch?: string;
    drawerName: string;
    personCode: string;
    personName?: string;
    targetPersonCode?: string;
    targetPersonName?: string;
    statusDesc: string;
    statusGroup: 'in_hand' | 'at_bank' | 'cleared' | 'returned' | 'spent';
    chequeType: 'received' | 'spent' | 'issued';
    docNo?: string;
    docDesc?: string;
    isActive?: boolean;
    isDraft?: boolean;
}

interface PersonChequeLedgerModalProps {
    isOpen: boolean;
    onClose: () => void;
    personCode: string;
    personName: string;
    currentUser?: any;
    allPersonsList?: { code: string; name: string }[];
}

// Helpers for Shamsi Math
export const parseShamsiDate = (str: string): { jy: number; jm: number; jd: number } | null => {
    if (!str) return null;
    const clean = String(str).trim().replace(/[۰-۹]/g, x => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(x)));
    const match = clean.match(/(13\d{2}|14\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (!match) return null;
    return {
        jy: parseInt(match[1], 10),
        jm: parseInt(match[2], 10),
        jd: parseInt(match[3], 10)
    };
};

export const shamsiToDate = (shamsiStr: string): Date | null => {
    const parts = parseShamsiDate(shamsiStr);
    if (!parts) return null;
    try {
        const g = jalaali.toGregorian(parts.jy, parts.jm, parts.jd);
        return new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0);
    } catch {
        return null;
    }
};

export const dateToShamsi = (date: Date): string => {
    if (!date || isNaN(date.getTime())) return '';
    const j = jalaali.toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
};

export const getDayOfWeekFa = (date: Date): string => {
    if (!date || isNaN(date.getTime())) return '';
    const days = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
    return days[date.getDay()];
};

export const formatMoney = (amount: number): string => {
    if (isNaN(amount) || amount === null || amount === undefined) return '۰';
    return Math.round(amount).toLocaleString('fa-IR');
};

export const formatToman = (amount: number): string => {
    if (isNaN(amount) || amount === null || amount === undefined) return '۰';
    return Math.round(amount / 10).toLocaleString('fa-IR');
};

export const PersonChequeLedgerModal: React.FC<PersonChequeLedgerModalProps> = ({
    isOpen,
    onClose,
    personCode: initialPersonCode,
    personName: initialPersonName,
    currentUser,
    allPersonsList = []
}) => {
    const [selectedCode, setSelectedCode] = useState(initialPersonCode);
    const [selectedName, setSelectedName] = useState(initialPersonName);

    // Main Data State
    const [cheques, setCheques] = useState<SayanPersonCheque[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Active Tab
    const [activeTab, setActiveTab] = useState<'list' | 'ras' | 'smart_match'>('list');

    // Filtering States
    const [searchQuery, setSearchQuery] = useState('');
    const [filterChequeType, setFilterChequeType] = useState<'all' | 'received' | 'spent' | 'issued'>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [dueFrom, setDueFrom] = useState<string>('');
    const [dueTo, setDueTo] = useState<string>('');
    const [selectedChequeIds, setSelectedChequeIds] = useState<Set<string>>(new Set());

    // Smart Matcher Target State
    const [targetSumInput, setTargetSumInput] = useState<string>('2500000000');
    const [targetRasInput, setTargetRasInput] = useState<string>(() => dateToShamsi(new Date(Date.now() + 90 * 24 * 3600 * 1000)));
    const [targetDueFromInput, setTargetDueFromInput] = useState<string>('');
    const [targetDueToInput, setTargetDueToInput] = useState<string>('');
    const [targetChequeTypeInput, setTargetChequeTypeInput] = useState<'all' | 'spent' | 'received'>('all');
    const [smartMatchResult, setSmartMatchResult] = useState<{
        matchedCheques: SayanPersonCheque[];
        totalMatchedSum: number;
        matchedRasDate: string;
        sumDiff: number;
        rasDaysDiff: number;
    } | null>(null);

    // Ras Calculation Settings
    const [rasBaseType, setRasBaseType] = useState<'today' | 'first_cheque' | 'last_cheque' | 'custom'>('today');
    const [customBaseDate, setCustomBaseDate] = useState<string>(() => dateToShamsi(new Date()));
    const [rasScope, setRasScope] = useState<'filtered' | 'selected' | 'received' | 'spent'>('filtered');
    const [interestRateAnnual, setInterestRateAnnual] = useState<number>(24); // 24% annual interest rate

    // Print & Share
    const printRef = useRef<HTMLDivElement | null>(null);

    // Sync prop changes
    useEffect(() => {
        setSelectedCode(initialPersonCode);
        setSelectedName(initialPersonName);
    }, [initialPersonCode, initialPersonName]);

    // Fetch Cheques from Backend
    const fetchCheques = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const host = getServerHost();
            const token = getAuthToken();
            const queryParams = new URLSearchParams({
                personCode: selectedCode || '',
                personName: selectedName || ''
            });

            const url = `${host || ''}/api/sayan/person-cheques?${queryParams.toString()}`;
            const res = await fetch(url, {
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                }
            });

            if (!res.ok) {
                throw new Error(`خطا در دریافت لیست چک‌ها (کد وضعیت ${res.status})`);
            }

            const data = await res.json();
            if (data.success && Array.isArray(data.cheques)) {
                setCheques(data.cheques);
                // Pre-select all
                const allIds = new Set<string>(data.cheques.map((c: SayanPersonCheque) => c.id));
                setSelectedChequeIds(allIds);
            } else {
                setCheques([]);
            }
        } catch (err: any) {
            console.error("Fetch person cheques error:", err);
            setError(err.message || 'خطا در ارتباط با سرور سایان');
        } finally {
            setIsLoading(false);
        }
    };

    // Smart Matcher Solver Algorithm
    const handleRunSmartMatch = () => {
        const rawTargetSum = parseFloat(String(targetSumInput || '0').replace(/,/g, '').replace(/[۰-۹]/g, x => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(x))));
        if (!rawTargetSum || rawTargetSum <= 0) {
            alert('لطفاً مبلغ کل هدف را به ریال یا تومان وارد نمایید.');
            return;
        }

        // Filter pool according to conditions
        let pool = cheques.filter(c => {
            if (targetChequeTypeInput !== 'all' && c.chequeType !== targetChequeTypeInput) return false;
            if (targetDueFromInput) {
                const cleanFrom = targetDueFromInput.replace(/\//g, '');
                const cleanDue = String(c.dueDate || '').replace(/\//g, '');
                if (cleanDue && cleanDue < cleanFrom) return false;
            }
            if (targetDueToInput) {
                const cleanTo = targetDueToInput.replace(/\//g, '');
                const cleanDue = String(c.dueDate || '').replace(/\//g, '');
                if (cleanDue && cleanDue > cleanTo) return false;
            }
            return true;
        });

        if (pool.length === 0) {
            alert('هیچ چکی با شروط سررسید و نوع انتخاب شده یافت نشد.');
            return;
        }

        const targetRasDateObj = shamsiToDate(targetRasInput) || new Date();
        const baseMs = targetRasDateObj.getTime();

        // Optimized subset algorithm
        const candidates = [...pool].sort((a, b) => (shamsiToDate(a.dueDate)?.getTime() || 0) - (shamsiToDate(b.dueDate)?.getTime() || 0));
        const numCandidates = candidates.length;

        let bestCombination: SayanPersonCheque[] = [];
        let bestScore = Infinity;

        const iterations = Math.min(2500, numCandidates * 50 + 500);
        for (let iter = 0; iter < iterations; iter++) {
            const sampleSize = Math.floor(Math.random() * Math.min(15, numCandidates)) + 1;
            const shuffled = [...candidates].sort(() => Math.random() - 0.5);
            const subset: SayanPersonCheque[] = [];
            let currentSum = 0;

            for (const ch of shuffled) {
                if (subset.length >= sampleSize) break;
                if (currentSum + ch.amount <= rawTargetSum * 1.3) {
                    subset.push(ch);
                    currentSum += ch.amount;
                }
            }

            if (subset.length === 0) continue;

            let sumWeightedMs = 0;
            let sumAmt = 0;
            subset.forEach(c => {
                const d = shamsiToDate(c.dueDate) || targetRasDateObj;
                sumWeightedMs += c.amount * d.getTime();
                sumAmt += c.amount;
            });

            const avgMs = sumWeightedMs / sumAmt;
            const rasDiffDays = Math.abs(avgMs - baseMs) / (24 * 3600 * 1000);
            const sumDiffRatio = Math.abs(sumAmt - rawTargetSum) / rawTargetSum;

            const score = sumDiffRatio * 100 + rasDiffDays * 2.5;

            if (score < bestScore) {
                bestScore = score;
                bestCombination = subset;
            }
        }

        if (bestCombination.length === 0) {
            bestCombination = candidates.slice(0, 3);
        }

        let totalSum = 0;
        let sumWeightedMs = 0;
        bestCombination.forEach(c => {
            const d = shamsiToDate(c.dueDate) || targetRasDateObj;
            totalSum += c.amount;
            sumWeightedMs += c.amount * d.getTime();
        });

        const calculatedRasMs = totalSum > 0 ? (sumWeightedMs / totalSum) : baseMs;
        const calculatedRasDate = new Date(calculatedRasMs);
        const rasShamsiStr = dateToShamsi(calculatedRasDate);
        const daysDiff = Math.round((calculatedRasMs - baseMs) / (24 * 3600 * 1000));

        const result = {
            matchedCheques: bestCombination,
            totalMatchedSum: totalSum,
            matchedRasDate: rasShamsiStr,
            sumDiff: totalSum - rawTargetSum,
            rasDaysDiff: daysDiff
        };

        setSmartMatchResult(result);

        // Auto select matched items in list
        const matchedIds = new Set<string>(bestCombination.map(c => c.id));
        setSelectedChequeIds(matchedIds);
    };

    useEffect(() => {
        if (isOpen) {
            fetchCheques();
        }
    }, [isOpen, selectedCode, selectedName]);

    // Filtered Cheques
    const filteredCheques = useMemo(() => {
        return cheques.filter(c => {
            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchNo = String(c.chequeNo || '').toLowerCase().includes(q);
                const matchBank = String(c.bankName || '').toLowerCase().includes(q);
                const matchDrawer = String(c.drawerName || '').toLowerCase().includes(q);
                const matchTarget = String(c.targetPersonName || '').toLowerCase().includes(q);
                const matchDesc = String(c.docDesc || '').toLowerCase().includes(q);
                if (!matchNo && !matchBank && !matchDrawer && !matchTarget && !matchDesc) {
                    return false;
                }
            }

            // Cheque Type Filter
            if (filterChequeType !== 'all' && c.chequeType !== filterChequeType) {
                return false;
            }

            // Status Filter
            if (filterStatus !== 'all') {
                if (filterStatus === 'in_hand' && c.statusGroup !== 'in_hand') return false;
                if (filterStatus === 'at_bank' && c.statusGroup !== 'at_bank') return false;
                if (filterStatus === 'cleared' && c.statusGroup !== 'cleared') return false;
                if (filterStatus === 'returned' && c.statusGroup !== 'returned') return false;
                if (filterStatus === 'spent' && c.statusGroup !== 'spent') return false;
            }

            // Date Range: Receive/Issue Date
            if (dateFrom) {
                const cleanFrom = dateFrom.replace(/\//g, '');
                const cleanC = String(c.receiveDate || '').replace(/\//g, '');
                if (cleanC && cleanC < cleanFrom) return false;
            }
            if (dateTo) {
                const cleanTo = dateTo.replace(/\//g, '');
                const cleanC = String(c.receiveDate || '').replace(/\//g, '');
                if (cleanC && cleanC > cleanTo) return false;
            }

            // Date Range: Due Date
            if (dueFrom) {
                const cleanDueFrom = dueFrom.replace(/\//g, '');
                const cleanDue = String(c.dueDate || '').replace(/\//g, '');
                if (cleanDue && cleanDue < cleanDueFrom) return false;
            }
            if (dueTo) {
                const cleanDueTo = dueTo.replace(/\//g, '');
                const cleanDue = String(c.dueDate || '').replace(/\//g, '');
                if (cleanDue && cleanDue > cleanDueTo) return false;
            }

            return true;
        });
    }, [cheques, searchQuery, filterChequeType, filterStatus, dateFrom, dateTo, dueFrom, dueTo]);

    // Statistics Cards Data
    const stats = useMemo(() => {
        let totalReceived = 0;
        let countReceived = 0;
        let totalSpent = 0;
        let countSpent = 0;
        let totalIssued = 0;
        let countIssued = 0;
        let totalCleared = 0;
        let totalReturned = 0;
        let totalInHand = 0;

        filteredCheques.forEach(c => {
            const amt = c.amount || 0;
            if (c.chequeType === 'received') {
                totalReceived += amt;
                countReceived++;
            } else if (c.chequeType === 'spent') {
                totalSpent += amt;
                countSpent++;
            } else if (c.chequeType === 'issued') {
                totalIssued += amt;
                countIssued++;
            }

            if (c.statusGroup === 'cleared') totalCleared += amt;
            else if (c.statusGroup === 'returned') totalReturned += amt;
            else if (c.statusGroup === 'in_hand') totalInHand += amt;
        });

        return {
            totalReceived,
            countReceived,
            totalSpent,
            countSpent,
            totalIssued,
            countIssued,
            totalCleared,
            totalReturned,
            totalInHand,
            totalSum: totalReceived + totalSpent + totalIssued,
            totalCount: filteredCheques.length
        };
    }, [filteredCheques]);

    // Cheques to Include in Ras Calculation
    const rasCheques = useMemo(() => {
        return filteredCheques.filter(c => {
            if (rasScope === 'selected') {
                return selectedChequeIds.has(c.id);
            }
            if (rasScope === 'received') {
                return c.chequeType === 'received';
            }
            if (rasScope === 'spent') {
                return c.chequeType === 'spent';
            }
            return true;
        });
    }, [filteredCheques, rasScope, selectedChequeIds]);

    // Determine Base Date for Ras Calculation
    const resolvedBaseDate = useMemo((): Date => {
        if (rasBaseType === 'today') {
            const now = new Date();
            now.setHours(12, 0, 0, 0);
            return now;
        }
        if (rasBaseType === 'custom') {
            const d = shamsiToDate(customBaseDate);
            if (d) return d;
        }
        if (rasBaseType === 'first_cheque' && rasCheques.length > 0) {
            // Find earliest due date
            let earliestDate: Date | null = null;
            rasCheques.forEach(c => {
                const d = shamsiToDate(c.dueDate);
                if (d && (!earliestDate || d.getTime() < earliestDate.getTime())) {
                    earliestDate = d;
                }
            });
            if (earliestDate) return earliestDate;
        }
        if (rasBaseType === 'last_cheque' && rasCheques.length > 0) {
            // Find latest due date
            let latestDate: Date | null = null;
            rasCheques.forEach(c => {
                const d = shamsiToDate(c.dueDate);
                if (d && (!latestDate || d.getTime() > latestDate.getTime())) {
                    latestDate = d;
                }
            });
            if (latestDate) return latestDate;
        }
        const fallback = new Date();
        fallback.setHours(12, 0, 0, 0);
        return fallback;
    }, [rasBaseType, customBaseDate, rasCheques]);

    // Perform Advanced Weighted Ras Calculation
    const rasResult = useMemo(() => {
        if (rasCheques.length === 0) {
            return null;
        }

        let sumWeightedDays = 0;
        let sumAmount = 0;
        let sumSimpleDays = 0;
        const baseDate = resolvedBaseDate;
        const baseMs = baseDate.getTime();
        const msPerDay = 24 * 60 * 60 * 1000;

        const breakdownItems = rasCheques.map(c => {
            const dueD = shamsiToDate(c.dueDate);
            const daysFromBase = dueD ? Math.round((dueD.getTime() - baseMs) / msPerDay) : 0;
            const amt = c.amount || 0;
            const weight = amt * daysFromBase;
            const interestAmount = (amt * Math.max(0, daysFromBase) * (interestRateAnnual / 100)) / 365;

            sumAmount += amt;
            sumWeightedDays += weight;
            sumSimpleDays += daysFromBase;

            return {
                cheque: c,
                daysFromBase,
                weight,
                percentOfTotal: 0, // calculated below
                interestAmount
            };
        });

        const weightedAvgDays = sumAmount > 0 ? (sumWeightedDays / sumAmount) : 0;
        const simpleAvgDays = rasCheques.length > 0 ? (sumSimpleDays / rasCheques.length) : 0;

        // Calculate Ras Date
        const rasDate = new Date(baseMs + (weightedAvgDays * msPerDay));
        const rasDateShamsi = dateToShamsi(rasDate);
        const dayOfWeekFa = getDayOfWeekFa(rasDate);
        const baseDateShamsi = dateToShamsi(baseDate);

        // Calculate total interest / opportunity cost
        const totalInterestCost = (sumAmount * Math.max(0, weightedAvgDays) * (interestRateAnnual / 100)) / 365;

        // Update percent of total for each breakdown item
        const finalBreakdown = breakdownItems.map(item => ({
            ...item,
            percentOfTotal: sumAmount > 0 ? ((item.cheque.amount / sumAmount) * 100) : 0
        }));

        return {
            baseDate,
            baseDateShamsi,
            totalAmount: sumAmount,
            totalCheques: rasCheques.length,
            weightedAvgDays: Math.round(weightedAvgDays * 10) / 10,
            simpleAvgDays: Math.round(simpleAvgDays * 10) / 10,
            rasDate,
            rasDateShamsi,
            dayOfWeekFa,
            totalInterestCost,
            interestRateAnnual,
            breakdown: finalBreakdown
        };
    }, [rasCheques, resolvedBaseDate, interestRateAnnual]);

    // Select / Deselect All Handlers
    const handleToggleSelectAll = () => {
        if (selectedChequeIds.size === filteredCheques.length) {
            setSelectedChequeIds(new Set());
        } else {
            setSelectedChequeIds(new Set(filteredCheques.map(c => c.id)));
        }
    };

    const handleToggleSelectOne = (id: string) => {
        const next = new Set(selectedChequeIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedChequeIds(next);
    };

    // Export to Excel (Full Detailed Cheque List)
    const handleExportExcel = (customList?: SayanPersonCheque[], categoryName?: string) => {
        const listToExport = customList || filteredCheques;
        if (listToExport.length === 0) {
            alert('چکی برای خروجی اکسل وجود ندارد.');
            return;
        }

        const sumAmt = listToExport.reduce((s, x) => s + (x.amount || 0), 0);

        const dataRows = listToExport.map((c, idx) => ({
            'ردیف': idx + 1,
            'نوع سند': c.chequeType === 'received' ? 'دریافتی از مشتری' : (c.chequeType === 'spent' ? 'خرج‌شده / واگذار به غیر' : 'صادره / پرداختی'),
            'شماره چک / صیادی': c.chequeNo,
            'مبلغ (ریال)': c.amount,
            'مبلغ (تومان)': Math.round(c.amount / 10),
            'تاریخ دریافت / ثبت': c.receiveDate || '-',
            'تاریخ سررسید': c.dueDate,
            'نام بانک': c.bankName,
            'شعبه / حساب': c.branch || '-',
            'صاحب حساب / صادرکننده': c.drawerName,
            'کد طرف‌حساب': c.personCode,
            'نام طرف‌حساب': c.personName || selectedName,
            'مقصد خرج / واگذاری': c.targetPersonName || '-',
            'وضعیت در خزانه‌داری': c.statusDesc,
            'شماره سند / عطف': c.docNo || '-',
            'شرح سند': c.docDesc || '-'
        }));

        // Add Summary Row
        dataRows.push({
            'ردیف': '-' as any,
            'نوع سند': 'مجموع کل',
            'شماره چک / صیادی': `${listToExport.length} فقره چک`,
            'مبلغ (ریال)': sumAmt,
            'مبلغ (تومان)': Math.round(sumAmt / 10),
            'تاریخ دریافت / ثبت': '-',
            'تاریخ سررسید': '-',
            'نام بانک': '-',
            'شعبه / حساب': '-',
            'صاحب حساب / صادرکننده': '-',
            'کد طرف‌حساب': '-',
            'نام طرف‌حساب': '-',
            'مقصد خرج / واگذاری': '-',
            'وضعیت در خزانه‌داری': '-',
            'شماره سند / عطف': '-',
            'شرح سند': '-'
        });

        const ws = XLSX.utils.json_to_sheet(dataRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, categoryName || 'ریز چک‌ها');

        const catTag = categoryName ? `_${categoryName.replace(/\s+/g, '_')}` : '';
        const fileName = `Cheques${catTag}_${selectedCode || 'All'}_${dateToShamsi(new Date()).replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // Export to Excel (Ras Analysis Sheet)
    const handleExportRasExcel = () => {
        if (!rasResult || rasResult.breakdown.length === 0) {
            alert('اطلاعات راس‌گیری موجود نیست.');
            return;
        }

        const rasRows = rasResult.breakdown.map((item, idx) => ({
            'ردیف': idx + 1,
            'نوع چک': item.cheque.chequeType === 'received' ? 'دریافتی' : (item.cheque.chequeType === 'spent' ? 'خرج‌شده' : 'صادره'),
            'شماره چک': item.cheque.chequeNo,
            'بانک': item.cheque.bankName,
            'صاحب حساب': item.cheque.drawerName,
            'مبلغ (ریال)': item.cheque.amount,
            'مبلغ (تومان)': Math.round(item.cheque.amount / 10),
            'تاریخ سررسید': item.cheque.dueDate,
            'فاصله روز از مبدأ': item.daysFromBase,
            'ضریب وزنی (مبلغ × روز)': item.weight,
            'سهم درصدی از کل (%)': parseFloat(item.percentOfTotal.toFixed(2)),
            'کارمزد/سود تاخیر (ریال)': Math.round(item.interestAmount)
        }));

        // Add Summary Row
        rasRows.push({
            'ردیف': '-' as any,
            'نوع چک': 'خلاصه راس‌گیری',
            'شماره چک': `مبدأ: ${rasResult.baseDateShamsi}`,
            'بانک': `تاریخ راس: ${rasResult.rasDateShamsi}`,
            'صاحب حساب': `فاصله راس: ${rasResult.weightedAvgDays} روز`,
            'مبلغ (ریال)': rasResult.totalAmount,
            'مبلغ (تومان)': Math.round(rasResult.totalAmount / 10),
            'تاریخ سررسید': `روز هفته: ${rasResult.dayOfWeekFa}`,
            'فاصله روز از مبدأ': rasResult.weightedAvgDays,
            'ضریب وزنی (مبلغ × روز)': rasResult.breakdown.reduce((s, x) => s + x.weight, 0),
            'سهم درصدی از کل (%)': 100,
            'کارمزد/سود تاخیر (ریال)': Math.round(rasResult.totalInterestCost)
        });

        const ws = XLSX.utils.json_to_sheet(rasRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'آنالیز راس‌گیری چک‌ها');

        const fileName = `Ras_Analysis_${selectedCode || 'All'}_${rasResult.rasDateShamsi.replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // Share to Chat
    const handleShareToChat = () => {
        if (!rasResult) {
            const summary = `📊 گزارش اسناد و چک‌های سایان\n👤 شخص: ${selectedName} (کد: ${selectedCode})\n💰 مجموع چک‌های دریافتی: ${formatMoney(stats.totalReceived)} ریال\n💸 مجموع چک‌های خرج‌شده: ${formatMoney(stats.totalSpent)} ریال\n🔢 تعداد کل: ${stats.totalCount} فقره`;
            openSendToChat({ title: 'گزارش چک‌ها', defaultMessage: summary });
            return;
        }

        const text = `📋 گزارش راس‌گیری چک‌های سایان ERP\n👤 طرف‌حساب: ${selectedName} (کد: ${selectedCode})\n📅 مبدأ محاسبه: ${rasResult.baseDateShamsi}\n\n🌟 تاریخ دقیق راس چک‌ها: ${rasResult.rasDateShamsi} (${rasResult.dayOfWeekFa})\n⏳ فاصله میانگین وزنی: ${rasResult.weightedAvgDays} روز\n💰 جمع کل مبالغ: ${formatMoney(rasResult.totalAmount)} ریال (${formatToman(rasResult.totalAmount)} تومان)\n🔢 تعداد چک‌های منتخب: ${rasResult.totalCheques} فقره\n📊 میانگین ساده سررسید: ${rasResult.simpleAvgDays} روز\n💳 سود دوران / هزینه تاخیر (${rasResult.interestRateAnnual}٪ سالانه): ${formatMoney(rasResult.totalInterestCost)} ریال`;
        openSendToChat({ title: 'گزارش راس‌گیری چک‌ها', defaultMessage: text });
    };

    // Browser Print Handler
    const handlePrint = () => {
        window.print();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4 overflow-hidden" dir="rtl">
            <div className="bg-white dark:bg-zinc-900 border-0 sm:border border-slate-200 dark:border-zinc-800 rounded-none sm:rounded-3xl shadow-2xl w-full max-w-7xl h-[100dvh] sm:h-auto sm:max-h-[96vh] flex flex-col overflow-hidden text-slate-800 dark:text-zinc-100 animate-scale-in">
                
                {/* MODAL HEADER - Ultra-compact on Android/Mobile */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-3 sm:px-6 py-2 sm:py-3.5 flex items-center justify-between gap-2 shrink-0 border-b border-white/10">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="hidden sm:flex p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl shadow-inner shrink-0">
                            <CreditCard size={22} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xs sm:text-lg font-black text-white truncate">
                                    پرونده اسناد چک و راس‌گیری سایان
                                </h3>
                                <span className="hidden md:inline-block bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] sm:text-xs font-black px-2.5 py-0.5 rounded-full">
                                    Sayan Treasury & Ras Engine
                                </span>
                            </div>
                            <p className="text-[10px] sm:text-xs text-slate-300 flex items-center gap-1.5 mt-0.5 truncate">
                                <span>طرف‌حساب:</span>
                                <b className="text-white bg-white/10 px-1.5 py-0.2 rounded-lg truncate">{selectedName || 'همه مشتریان و طرف‌های حساب'}</b>
                                {selectedCode && <span className="font-mono text-emerald-400 shrink-0">({selectedCode})</span>}
                            </p>
                        </div>
                    </div>

                    {/* Quick Switch Person Dropdown (If Available) */}
                    {allPersonsList.length > 0 && (
                        <div className="hidden md:flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
                            <User size={15} className="text-slate-300" />
                            <select
                                value={selectedCode}
                                onChange={(e) => {
                                    const code = e.target.value;
                                    const found = allPersonsList.find(p => p.code === code);
                                    setSelectedCode(code);
                                    setSelectedName(found ? found.name : '');
                                }}
                                className="bg-transparent text-xs text-white font-bold outline-none cursor-pointer max-w-[200px]"
                            >
                                <option value="" className="text-black">-- مشاهده همه اشخاص --</option>
                                {allPersonsList.map(p => (
                                    <option key={p.code} value={p.code} className="text-black">
                                        {p.name} ({p.code})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Header Action Buttons */}
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                        <button
                            onClick={fetchCheques}
                            disabled={isLoading}
                            className="p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white rounded-xl transition-colors cursor-pointer"
                            title="تازه‌سازی اطلاعات از سرور سایان"
                        >
                            <RefreshCw size={16} className={isLoading ? 'animate-spin text-emerald-400' : ''} />
                        </button>

                        <button
                            onClick={() => handleExportExcel()}
                            className="p-1.5 sm:p-2 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold shadow-xs"
                            title="خروجی کامل اکسل چک‌ها"
                        >
                            <FileSpreadsheet size={15} />
                            <span className="hidden sm:inline">اکسل چک‌ها</span>
                        </button>

                        <button
                            onClick={handleShareToChat}
                            className="p-1.5 sm:p-2 bg-blue-600/80 hover:bg-blue-600 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold shadow-xs"
                            title="اشتراک‌گذاری خلاصه گزارش در چت"
                        >
                            <Share2 size={15} />
                            <span className="hidden sm:inline">ارسال به چت</span>
                        </button>

                        <button
                            onClick={handlePrint}
                            className="p-1.5 sm:p-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold shadow-xs"
                            title="چاپ رسمی برگه چک‌ها و راس‌گیری"
                        >
                            <Printer size={15} />
                            <span className="hidden sm:inline">چاپ</span>
                        </button>

                        <button
                            onClick={onClose}
                            className="p-1.5 sm:p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                            title="بستن پنجره"
                        >
                            <X size={19} />
                        </button>
                    </div>
                </div>

                {/* KPI STATS CARDS RIBBON - Full Unshortened Numbers (Zero Truncation) */}
                <div className="bg-slate-50 dark:bg-zinc-950/60 border-b border-slate-200 dark:border-zinc-800 p-2 sm:p-3 sm:px-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-3 shrink-0">
                    {/* Card 1: Received */}
                    <div 
                        onClick={() => {
                            setFilterChequeType('received');
                            setFilterStatus('all');
                        }}
                        className={`bg-white dark:bg-zinc-900 border rounded-xl sm:rounded-2xl p-2 sm:p-3 shadow-xs flex flex-col justify-between cursor-pointer transition-all ${
                            filterChequeType === 'received' && filterStatus === 'all'
                                ? 'border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50/20'
                                : 'border-emerald-500/30 hover:border-emerald-500'
                        }`}
                    >
                        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-emerald-600 dark:text-emerald-400 font-bold gap-1">
                            <span>چک‌های دریافتی</span>
                            <span className="bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-mono shrink-0">
                                {stats.countReceived} فقره
                            </span>
                        </div>
                        <div className="mt-0.5 sm:mt-1">
                            <div className="text-[11px] sm:text-base font-black text-slate-900 dark:text-white font-mono break-all leading-tight">
                                {formatMoney(stats.totalReceived)} <span className="text-[9px] sm:text-[10px] font-sans font-normal text-slate-400">ریال</span>
                            </div>
                            <div className="hidden sm:block text-[10px] text-slate-400 font-medium break-all">
                                {formatToman(stats.totalReceived)} تومان
                            </div>
                        </div>
                    </div>

                    {/* Card 2: Spent / Endorsed */}
                    <div 
                        onClick={() => {
                            setFilterChequeType('spent');
                            setFilterStatus('all');
                        }}
                        className={`bg-white dark:bg-zinc-900 border rounded-xl sm:rounded-2xl p-2 sm:p-3 shadow-xs flex flex-col justify-between cursor-pointer transition-all ${
                            filterChequeType === 'spent' && filterStatus === 'all'
                                ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/20'
                                : 'border-blue-500/30 hover:border-blue-500'
                        }`}
                    >
                        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-blue-600 dark:text-blue-400 font-bold gap-1">
                            <span>چک‌های خرج‌شده</span>
                            <span className="bg-blue-100 dark:bg-blue-950/60 px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-mono shrink-0">
                                {stats.countSpent} فقره
                            </span>
                        </div>
                        <div className="mt-0.5 sm:mt-1">
                            <div className="text-[11px] sm:text-base font-black text-slate-900 dark:text-white font-mono break-all leading-tight">
                                {formatMoney(stats.totalSpent)} <span className="text-[9px] sm:text-[10px] font-sans font-normal text-slate-400">ریال</span>
                            </div>
                            <div className="hidden sm:block text-[10px] text-slate-400 font-medium break-all">
                                {formatToman(stats.totalSpent)} تومان
                            </div>
                        </div>
                    </div>

                    {/* Card 3: In Hand */}
                    <div 
                        onClick={() => {
                            setFilterChequeType('all');
                            setFilterStatus('in_hand');
                        }}
                        className={`bg-white dark:bg-zinc-900 border rounded-xl sm:rounded-2xl p-2 sm:p-3 shadow-xs flex flex-col justify-between cursor-pointer transition-all ${
                            filterStatus === 'in_hand'
                                ? 'border-amber-500 ring-2 ring-amber-500/30 bg-amber-50/20'
                                : 'border-amber-500/30 hover:border-amber-500'
                        }`}
                    >
                        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-amber-600 dark:text-amber-400 font-bold">
                            <span>نزد صندوق / در جریان</span>
                            <Clock size={12} />
                        </div>
                        <div className="mt-0.5 sm:mt-1">
                            <div className="text-[11px] sm:text-base font-black text-slate-900 dark:text-white font-mono break-all leading-tight">
                                {formatMoney(stats.totalInHand)} <span className="text-[9px] sm:text-[10px] font-sans font-normal text-slate-400">ریال</span>
                            </div>
                            <div className="hidden sm:block text-[10px] text-slate-400 font-medium break-all">
                                {formatToman(stats.totalInHand)} تومان
                            </div>
                        </div>
                    </div>

                    {/* Card 4: Cleared */}
                    <div 
                        onClick={() => {
                            setFilterChequeType('all');
                            setFilterStatus('cleared');
                        }}
                        className={`bg-white dark:bg-zinc-900 border rounded-xl sm:rounded-2xl p-2 sm:p-3 shadow-xs flex flex-col justify-between cursor-pointer transition-all ${
                            filterStatus === 'cleared'
                                ? 'border-teal-500 ring-2 ring-teal-500/30 bg-teal-50/20'
                                : 'border-teal-500/30 hover:border-teal-500'
                        }`}
                    >
                        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-teal-600 dark:text-teal-400 font-bold">
                            <span>وصول‌شده / پاس‌شده</span>
                            <CheckCircle2 size={12} />
                        </div>
                        <div className="mt-0.5 sm:mt-1">
                            <div className="text-[11px] sm:text-base font-black text-slate-900 dark:text-white font-mono break-all leading-tight">
                                {formatMoney(stats.totalCleared)} <span className="text-[9px] sm:text-[10px] font-sans font-normal text-slate-400">ریال</span>
                            </div>
                            <div className="hidden sm:block text-[10px] text-slate-400 font-medium break-all">
                                {formatToman(stats.totalCleared)} تومان
                            </div>
                        </div>
                    </div>

                    {/* Card 5: Returned */}
                    <div 
                        onClick={() => {
                            setFilterChequeType('all');
                            setFilterStatus('returned');
                        }}
                        className={`bg-white dark:bg-zinc-900 border rounded-xl sm:rounded-2xl p-2 sm:p-3 shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1 cursor-pointer transition-all ${
                            filterStatus === 'returned'
                                ? 'border-rose-500 ring-2 ring-rose-500/30 bg-rose-50/20'
                                : 'border-rose-500/30 hover:border-rose-500'
                        }`}
                    >
                        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                            <span>چک‌های برگشتی</span>
                            <AlertCircle size={12} />
                        </div>
                        <div className="mt-0.5 sm:mt-1">
                            <div className="text-[11px] sm:text-base font-black text-rose-600 dark:text-rose-400 font-mono break-all leading-tight">
                                {formatMoney(stats.totalReturned)} <span className="text-[9px] sm:text-[10px] font-sans font-normal text-slate-400">ریال</span>
                            </div>
                            <div className="hidden sm:block text-[10px] text-slate-400 font-medium break-all">
                                {formatToman(stats.totalReturned)} تومان
                            </div>
                        </div>
                    </div>
                </div>

                {/* NAVIGATION TABS & FILTER BAR - Compact on Mobile */}
                <div className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 p-2 sm:p-3 sm:px-6 space-y-2 shrink-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        {/* Tabs */}
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-zinc-700 w-full sm:w-auto justify-between sm:justify-start">
                            <button
                                onClick={() => setActiveTab('list')}
                                className={`flex-1 sm:flex-initial px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                    activeTab === 'list'
                                        ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                }`}
                            >
                                <CreditCard size={14} />
                                <span>لیست چک‌ها ({filteredCheques.length})</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('ras')}
                                className={`flex-1 sm:flex-initial px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                    activeTab === 'ras'
                                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                }`}
                            >
                                <Sparkles size={14} />
                                <span>راس‌گیری</span>
                            </button>

                            <button
                                onClick={() => setActiveTab('smart_match')}
                                className={`flex-1 sm:flex-initial px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                    activeTab === 'smart_match'
                                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                }`}
                            >
                                <SlidersHorizontal size={14} />
                                <span>انتخاب هوشمند</span>
                            </button>
                        </div>

                        {/* Quick Presets Chips */}
                        <div className="hidden sm:flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="text-slate-400 font-bold text-[10px] ml-1">شروط سریع:</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setDateFrom('');
                                    setDateTo('');
                                    setDueFrom('');
                                    setDueTo('');
                                    setFilterChequeType('all');
                                    setFilterStatus('all');
                                }}
                                className={`px-2.5 py-1 rounded-lg font-black transition-all cursor-pointer ${
                                    !dateFrom && !dateTo && !dueFrom && !dueTo && filterChequeType === 'all' && filterStatus === 'all'
                                        ? 'bg-indigo-600 text-white shadow-xs'
                                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                                }`}
                            >
                                🌟 از اول تا الان (همه)
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setFilterChequeType('received');
                                }}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                                    filterChequeType === 'received'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                                }`}
                            >
                                فقط دریافتی ({stats.countReceived})
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setFilterChequeType('spent');
                                }}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                                    filterChequeType === 'spent'
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100'
                                }`}
                            >
                                فقط خرج‌شده ({stats.countSpent})
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setDueFrom('1404/01/01');
                                    setDueTo('1404/12/29');
                                }}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                                    dueFrom === '1404/01/01' && dueTo === '1404/12/29'
                                        ? 'bg-slate-800 text-white'
                                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                                }`}
                            >
                                سال ۱۴۰۴
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    const todayShamsi = dateToShamsi(new Date());
                                    setDueFrom(todayShamsi);
                                    setDueTo('');
                                }}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                                    dueFrom === dateToShamsi(new Date()) && !dueTo
                                        ? 'bg-teal-600 text-white'
                                        : 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100'
                                }`}
                            >
                                سررسیدهای آینده
                            </button>
                        </div>
                    </div>

                    {/* Detailed Filter Inputs Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 pt-1 border-t border-slate-100 dark:border-zinc-800 text-xs">
                        {/* Search Input */}
                        <div className="relative flex-1 sm:flex-initial min-w-[140px]">
                            <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="جستجوی چک، صیادی، بانک..."
                                className="bg-slate-50 dark:bg-zinc-800/90 border border-slate-200 dark:border-zinc-700 text-[11px] sm:text-xs rounded-xl pr-7 pl-2.5 py-1 sm:py-1.5 w-full sm:w-56 focus:outline-none focus:border-indigo-500"
                            />
                        </div>

                        {/* Cheque Type Filter */}
                        <select
                            value={filterChequeType}
                            onChange={(e) => setFilterChequeType(e.target.value as any)}
                            className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-[11px] sm:text-xs rounded-xl px-2 py-1 sm:py-1.5 text-slate-700 dark:text-slate-200 font-bold outline-none"
                        >
                            <option value="all">همه انواع</option>
                            <option value="received">دریافتی</option>
                            <option value="spent">خرج‌شده</option>
                            <option value="issued">پرداختی</option>
                        </select>

                        {/* Status Filter */}
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-[11px] sm:text-xs rounded-xl px-2 py-1 sm:py-1.5 text-slate-700 dark:text-slate-200 font-bold outline-none"
                        >
                            <option value="all">همه وضعیت‌ها</option>
                            <option value="in_hand">نزد صندوق</option>
                            <option value="at_bank">واگذار به بانک</option>
                            <option value="cleared">وصول شده</option>
                            <option value="returned">برگشتی</option>
                            <option value="spent">خرج شده</option>
                        </select>

                        {/* Receive/Spent Date Filter */}
                        <div className="hidden lg:flex items-center gap-1 bg-slate-50 dark:bg-zinc-800/80 px-2 py-1 rounded-xl border border-slate-200 dark:border-zinc-700">
                            <span className="text-[10px] text-slate-500 font-bold">ثبت/خرج:</span>
                            <input
                                type="text"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                placeholder="از تاریخ"
                                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-[11px] rounded-lg px-1.5 py-0.5 w-22 font-mono text-center outline-none"
                            />
                            <span className="text-slate-400 text-[10px]">تا</span>
                            <input
                                type="text"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                placeholder="تا تاریخ"
                                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-[11px] rounded-lg px-1.5 py-0.5 w-22 font-mono text-center outline-none"
                            />
                        </div>

                        {/* Due Date Filter */}
                        <div className="hidden sm:flex items-center gap-1 bg-slate-50 dark:bg-zinc-800/80 px-2 py-1 rounded-xl border border-slate-200 dark:border-zinc-700">
                            <span className="text-[10px] text-slate-500 font-bold">سررسید:</span>
                            <input
                                type="text"
                                value={dueFrom}
                                onChange={(e) => setDueFrom(e.target.value)}
                                placeholder="از سررسید"
                                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-[11px] rounded-lg px-1.5 py-0.5 w-22 font-mono text-center outline-none"
                            />
                            <span className="text-slate-400 text-[10px]">تا</span>
                            <input
                                type="text"
                                value={dueTo}
                                onChange={(e) => setDueTo(e.target.value)}
                                placeholder="تا سررسید"
                                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-[11px] rounded-lg px-1.5 py-0.5 w-22 font-mono text-center outline-none"
                            />
                        </div>

                        {(dateFrom || dateTo || dueFrom || dueTo || searchQuery || filterChequeType !== 'all' || filterStatus !== 'all') && (
                            <button
                                type="button"
                                onClick={() => {
                                    setDateFrom('');
                                    setDateTo('');
                                    setDueFrom('');
                                    setDueTo('');
                                    setSearchQuery('');
                                    setFilterChequeType('all');
                                    setFilterStatus('all');
                                }}
                                className="p-1 sm:p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg text-[10px] sm:text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-0.5"
                                title="پاک کردن تمام فیلترها"
                            >
                                <RotateCcw size={12} />
                                <span>حذف فیلتر</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* MAIN CONTENT AREA - Zero Horizontal Scroll */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 sm:p-6 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                            <RefreshCw size={36} className="animate-spin text-emerald-500" />
                            <span className="text-sm font-bold">در حال بارگذاری و تطبیق اسناد چک از دیتابیس سایان...</span>
                        </div>
                    ) : error ? (
                        <div className="p-6 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl text-center space-y-2">
                            <AlertCircle size={32} className="mx-auto text-rose-600" />
                            <h4 className="font-bold text-rose-800 dark:text-rose-300">عدم برقراری ارتباط با خزانه‌داری سایان</h4>
                            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
                            <button
                                onClick={fetchCheques}
                                className="mt-2 px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700"
                            >
                                تلاش مجدد
                            </button>
                        </div>
                    ) : filteredCheques.length === 0 ? (
                        <div className="text-center py-20 space-y-2">
                            <CreditCard size={48} className="mx-auto text-slate-300 dark:text-zinc-700" />
                            <h4 className="font-bold text-slate-600 dark:text-zinc-400 text-sm">هیچ چکی با مشخصات یا فیلترهای انتخابی یافت نشد</h4>
                            <p className="text-xs text-slate-400">می‌توانید فیلترهای تاریخ یا جستجو را تغییر دهید یا دکمه تازه‌سازی را بزنید.</p>
                        </div>
                    ) : activeTab === 'list' ? (
                        /* ================= TAB 1: CHEQUE LIST TABLE & MOBILE CARDS ================= */
                        <div className="space-y-3 sm:space-y-4">
                            {/* Category Specific Banner */}
                            {filterStatus === 'returned' && (
                                <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-rose-900 dark:text-rose-200 animate-fadeIn">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                                        <div>
                                            <span className="font-black text-xs block">⚠️ گزارش اختصاصی چک‌های برگشتی ({filteredCheques.length} فقره)</span>
                                            <span className="text-[11px] text-rose-700 dark:text-rose-300">مجموع ارزش چک‌های برگشتی: <b>{formatMoney(filteredCheques.reduce((s, x) => s + x.amount, 0))} ریال</b> ({formatToman(filteredCheques.reduce((s, x) => s + x.amount, 0))} تومان)</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleExportExcel(filteredCheques, 'چک‌های_برگشتی')}
                                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                                    >
                                        <FileSpreadsheet size={15} />
                                        <span>دانلود اکسل چک‌های برگشتی</span>
                                    </button>
                                </div>
                            )}

                            {filterChequeType === 'spent' && (
                                <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-blue-900 dark:text-blue-200 animate-fadeIn">
                                    <div className="flex items-center gap-2">
                                        <Coins className="w-5 h-5 text-blue-600 shrink-0" />
                                        <div>
                                            <span className="font-black text-xs block">🔵 گزارش اختصاصی چک‌های خرج‌شده / واگذار به غیر ({filteredCheques.length} فقره)</span>
                                            <span className="text-[11px] text-blue-700 dark:text-blue-300">مجموع ارزش چک‌های واگذارشده به این شخص: <b>{formatMoney(filteredCheques.reduce((s, x) => s + x.amount, 0))} ریال</b> ({formatToman(filteredCheques.reduce((s, x) => s + x.amount, 0))} تومان)</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleExportExcel(filteredCheques, 'چک‌های_خرج‌شده')}
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                                    >
                                        <FileSpreadsheet size={15} />
                                        <span>دانلود اکسل چک‌های خرج‌شده</span>
                                    </button>
                                </div>
                            )}

                            {filterChequeType === 'received' && filterStatus === 'all' && (
                                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-emerald-900 dark:text-emerald-200 animate-fadeIn">
                                    <div className="flex items-center gap-2">
                                        <CreditCard className="w-5 h-5 text-emerald-600 shrink-0" />
                                        <div>
                                            <span className="font-black text-xs block">🟢 گزارش اختصاصی چک‌های دریافتی از مشتری ({filteredCheques.length} فقره)</span>
                                            <span className="text-[11px] text-emerald-700 dark:text-emerald-300">مجموع ارزش چک‌های دریافتی: <b>{formatMoney(filteredCheques.reduce((s, x) => s + x.amount, 0))} ریال</b> ({formatToman(filteredCheques.reduce((s, x) => s + x.amount, 0))} تومان)</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleExportExcel(filteredCheques, 'چک‌های_دریافتی')}
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                                    >
                                        <FileSpreadsheet size={15} />
                                        <span>دانلود اکسل چک‌های دریافتی</span>
                                    </button>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleToggleSelectAll}
                                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                    >
                                        {selectedChequeIds.size === filteredCheques.length ? (
                                            <>
                                                <CheckSquare size={16} />
                                                <span>انتخاب شده: همه ({filteredCheques.length})</span>
                                            </>
                                        ) : (
                                            <>
                                                <Square size={16} />
                                                <span>انتخاب همه</span>
                                            </>
                                        )}
                                    </button>
                                    <span className="text-slate-300">|</span>
                                    <span className="text-[11px] sm:text-xs">تعداد: <b>{filteredCheques.length} فقره</b></span>
                                </div>

                                <button
                                    onClick={() => {
                                        setRasScope('selected');
                                        setActiveTab('ras');
                                    }}
                                    className="px-2.5 sm:px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1 text-[11px] sm:text-xs shadow-xs transition-colors cursor-pointer"
                                >
                                    <Sparkles size={13} />
                                    <span>انتقال انتخابی ({selectedChequeIds.size}) به راس‌گیری</span>
                                </button>
                            </div>

                            {/* MOBILE / ANDROID NATIVE CHEQUE CARDS (Zero Horizontal Scroll, Full Numbers) */}
                            <div className="block md:hidden space-y-2">
                                {filteredCheques.map((c) => {
                                    const isSelected = selectedChequeIds.has(c.id);
                                    const dueD = shamsiToDate(c.dueDate);
                                    const nowMs = new Date().setHours(0, 0, 0, 0);
                                    const daysLeft = dueD ? Math.round((dueD.getTime() - nowMs) / (24 * 60 * 60 * 1000)) : 0;

                                    return (
                                        <div
                                            key={c.id}
                                            onClick={() => handleToggleSelectOne(c.id)}
                                            className={`rounded-2xl border p-3 transition-all cursor-pointer space-y-2 shadow-2xs ${
                                                isSelected
                                                    ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                                                    : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                                            }`}
                                        >
                                            {/* Row 1: Checkbox, Type Badge, Cheque No, Status Badge */}
                                            <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 dark:border-zinc-800 pb-1.5">
                                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleToggleSelectOne(c.id)}
                                                        className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                                                    />
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                        c.chequeType === 'received'
                                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                            : c.chequeType === 'spent'
                                                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                                    }`}>
                                                        {c.chequeType === 'received' ? 'دریافتی' : (c.chequeType === 'spent' ? 'خرج‌شده' : 'پرداختی')}
                                                    </span>
                                                    <span className="font-mono font-black text-xs text-slate-900 dark:text-white" dir="ltr">
                                                        #{c.chequeNo}
                                                    </span>
                                                </div>

                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    c.statusGroup === 'cleared'
                                                        ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                                                        : c.statusGroup === 'returned'
                                                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-black'
                                                            : c.statusGroup === 'spent'
                                                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                                }`}>
                                                    {c.statusDesc || 'نزد صندوق'}
                                                </span>
                                            </div>

                                            {/* Row 2: Full Amount (Rial & Toman) + Due Date */}
                                            <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-zinc-800/60 px-2.5 py-1.5 rounded-xl">
                                                <div>
                                                    <div className="font-mono font-black text-sm text-slate-900 dark:text-white">
                                                        {formatMoney(c.amount)} <span className="text-[10px] font-sans font-normal text-slate-500">ریال</span>
                                                    </div>
                                                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                                                        {formatToman(c.amount)} تومان
                                                    </div>
                                                </div>

                                                <div className="text-left">
                                                    <div className="text-[11px] font-mono font-black text-indigo-600 dark:text-indigo-400">
                                                        سررسید: {c.dueDate}
                                                    </div>
                                                    <div className="mt-0.5">
                                                        {daysLeft >= 0 ? (
                                                            <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                                {daysLeft} روز مانده
                                                            </span>
                                                        ) : (
                                                            <span className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                                {Math.abs(daysLeft)} روز گذشته
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Row 3: Bank, Drawer, Target Person, Description */}
                                            <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                                                <div>
                                                    <span className="text-slate-400 text-[10px]">بانک: </span>
                                                    <b className="text-slate-800 dark:text-slate-200">{c.bankName}</b>
                                                    {c.branch && <span className="text-[10px] text-slate-400"> ({c.branch})</span>}
                                                </div>
                                                <div className="text-left">
                                                    <span className="text-slate-400 text-[10px]">ثبت/خرج: </span>
                                                    <span className="font-mono">{c.receiveDate || '-'}</span>
                                                </div>
                                                <div className="col-span-2">
                                                    <span className="text-slate-400 text-[10px]">صاحب حساب/واگذارکننده: </span>
                                                    <b className="text-slate-800 dark:text-slate-200">{c.drawerName || '-'}</b>
                                                    {c.targetPersonName && (
                                                        <span className="text-blue-600 dark:text-blue-400 font-bold mr-2">
                                                            (واگذار به: {c.targetPersonName})
                                                        </span>
                                                    )}
                                                </div>
                                                {(c.docNo || c.docDesc) && (
                                                    <div className="col-span-2 text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-zinc-800 pt-1 break-words">
                                                        {c.docNo && <b className="text-slate-700 dark:text-slate-200 ml-1">[سند {c.docNo}]</b>}
                                                        {c.docDesc}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* DESKTOP TABLE VIEW */}
                            <div className="hidden md:block border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-x-auto shadow-xs">
                                <table className="w-full text-right text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100 dark:bg-zinc-800/90 text-slate-700 dark:text-slate-200 font-black border-b border-slate-200 dark:border-zinc-700">
                                            <th className="p-3 w-10 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedChequeIds.size === filteredCheques.length && filteredCheques.length > 0}
                                                    onChange={handleToggleSelectAll}
                                                    className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                                                />
                                            </th>
                                            <th className="p-3">نوع سند</th>
                                            <th className="p-3">شماره چک / صیادی</th>
                                            <th className="p-3">مبلغ (ریال)</th>
                                            <th className="p-3">تاریخ ثبت/خرج</th>
                                            <th className="p-3">تاریخ سررسید</th>
                                            <th className="p-3">روز مانده/گذشته</th>
                                            <th className="p-3">بانک و شعبه</th>
                                            <th className="p-3">صاحب حساب / واگذارکننده</th>
                                            <th className="p-3">وضعیت خزانه‌داری</th>
                                            <th className="p-3">شرح / عطف</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                        {filteredCheques.map((c) => {
                                            const isSelected = selectedChequeIds.has(c.id);
                                            const dueD = shamsiToDate(c.dueDate);
                                            const nowMs = new Date().setHours(0, 0, 0, 0);
                                            const daysLeft = dueD ? Math.round((dueD.getTime() - nowMs) / (24 * 60 * 60 * 1000)) : 0;

                                            return (
                                                <tr
                                                    key={c.id}
                                                    onClick={() => handleToggleSelectOne(c.id)}
                                                    className={`hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer ${
                                                        isSelected ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                                                    }`}
                                                >
                                                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => handleToggleSelectOne(c.id)}
                                                            className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                            c.chequeType === 'received'
                                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                                : c.chequeType === 'spent'
                                                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                                        }`}>
                                                            {c.chequeType === 'received' ? 'دریافتی' : (c.chequeType === 'spent' ? 'خرج‌شده' : 'پرداختی')}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 font-mono font-bold text-slate-900 dark:text-white" dir="ltr">
                                                        {c.chequeNo}
                                                    </td>
                                                    <td className="p-3 font-black text-slate-900 dark:text-white">
                                                        <div>{formatMoney(c.amount)}</div>
                                                        <div className="text-[10px] text-slate-400 font-normal">{formatToman(c.amount)} ت</div>
                                                    </td>
                                                    <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                                                        {c.receiveDate || '-'}
                                                    </td>
                                                    <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                        {c.dueDate}
                                                    </td>
                                                    <td className="p-3 font-bold">
                                                        {daysLeft >= 0 ? (
                                                            <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-lg text-[10px]">
                                                                {daysLeft} روز مانده
                                                            </span>
                                                        ) : (
                                                            <span className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-lg text-[10px]">
                                                                {Math.abs(daysLeft)} روز گذشته
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-slate-700 dark:text-slate-300">
                                                        <div>{c.bankName}</div>
                                                        {c.branch && <div className="text-[10px] text-slate-400">شعبه: {c.branch}</div>}
                                                    </td>
                                                    <td className="p-3 text-slate-700 dark:text-slate-300">
                                                        <div>{c.drawerName}</div>
                                                        {c.targetPersonName && (
                                                            <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                                                                واگذار به: {c.targetPersonName}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                            c.statusGroup === 'cleared'
                                                                ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                                                                : c.statusGroup === 'returned'
                                                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-black'
                                                                    : c.statusGroup === 'spent'
                                                                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                                        }`}>
                                                            {c.statusDesc || 'نزد صندوق'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-slate-500 dark:text-slate-400 text-[11px] max-w-xs break-words">
                                                        {c.docNo && <b className="text-slate-700 dark:text-slate-200 ml-1">[{c.docNo}]</b>}
                                                        {c.docDesc || '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : activeTab === 'ras' ? (
                        /* ================= TAB 2: ADVANCED RAS CALCULATOR ================= */
                        <div className="space-y-6">
                            {/* Ras Configuration Controls */}
                            <div className="bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4 sm:p-5 rounded-3xl space-y-4">
                                <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                                    <SlidersHorizontal size={18} className="text-emerald-500" />
                                    <span>تنظیمات و شروط راس‌گیری پیشرفته چک‌ها</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* 1. Base Date Strategy */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                            مبدأ محاسبه فاصله سررسیدها:
                                        </label>
                                        <select
                                            value={rasBaseType}
                                            onChange={(e) => setRasBaseType(e.target.value as any)}
                                            className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs rounded-xl p-2.5 font-bold outline-none"
                                        >
                                            <option value="today">امروز ({dateToShamsi(new Date())})</option>
                                            <option value="first_cheque">تاریخ اولین چک / اولین تراکنش</option>
                                            <option value="last_cheque">تاریخ آخرین چک / دورترین سررسید</option>
                                            <option value="custom">تاریخ دلخواه کاربر / فاکتور تسویه</option>
                                        </select>
                                    </div>

                                    {/* Custom Date Input (If custom is chosen) */}
                                    {rasBaseType === 'custom' && (
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                                تاریخ مبدأ سفارشی (شمسی):
                                            </label>
                                            <input
                                                type="text"
                                                value={customBaseDate}
                                                onChange={(e) => setCustomBaseDate(e.target.value)}
                                                placeholder="مثال: ۱۴۰۴/۰۶/۰۱"
                                                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs rounded-xl p-2.5 font-mono text-center font-bold outline-none"
                                            />
                                        </div>
                                    )}

                                    {/* 2. Ras Scope Selector */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                            محدوده چک‌های شرکت‌کننده در راس:
                                        </label>
                                        <select
                                            value={rasScope}
                                            onChange={(e) => setRasScope(e.target.value as any)}
                                            className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs rounded-xl p-2.5 font-bold outline-none"
                                        >
                                            <option value="filtered">همه چک‌های فیلترشده جاری ({filteredCheques.length} فقره)</option>
                                            <option value="selected">فقط چک‌های انتخاب‌شده تیک‌خورده ({selectedChequeIds.size} فقره)</option>
                                            <option value="received">فقط چک‌های دریافتی از شخص ({stats.countReceived} فقره)</option>
                                            <option value="spent">فقط چک‌های خرج‌شده به شخص ({stats.countSpent} فقره)</option>
                                        </select>
                                    </div>

                                    {/* 3. Annual Interest Rate for Capital Cost */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
                                            <span>نرخ سود سالانه / خسارت تاخیر:</span>
                                            <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{interestRateAnnual}٪</span>
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="range"
                                                min="0"
                                                max="60"
                                                step="1"
                                                value={interestRateAnnual}
                                                onChange={(e) => setInterestRateAnnual(parseFloat(e.target.value))}
                                                className="w-full accent-emerald-600 cursor-pointer"
                                            />
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={interestRateAnnual}
                                                onChange={(e) => setInterestRateAnnual(parseFloat(e.target.value) || 0)}
                                                className="w-16 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs rounded-xl p-2 text-center font-bold outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Ras Analytical Dashboard Cards */}
                            {rasResult && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
                                    {/* Result Card 1: Exact Ras Date */}
                                    <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
                                        <div className="flex items-center justify-between text-xs opacity-90 font-bold">
                                            <span>📅 تاریخ دقیق راس چک‌ها</span>
                                            <Sparkles size={18} />
                                        </div>
                                        <div className="my-2">
                                            <div className="text-2xl sm:text-3xl font-black font-mono tracking-wider">
                                                {rasResult.rasDateShamsi}
                                            </div>
                                            <div className="text-xs opacity-90 font-bold mt-1">
                                                روز {rasResult.dayOfWeekFa}
                                            </div>
                                        </div>
                                        <div className="text-[11px] bg-black/20 px-3 py-1 rounded-xl w-fit">
                                            مبدأ محاسبه: {rasResult.baseDateShamsi}
                                        </div>
                                    </div>

                                    {/* Result Card 2: Weighted Average Days */}
                                    <div className="bg-gradient-to-br from-indigo-600 via-blue-700 to-indigo-800 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
                                        <div className="flex items-center justify-between text-xs opacity-90 font-bold">
                                            <span>⏳ فاصله زمانی راس تا مبدا</span>
                                            <Clock size={18} />
                                        </div>
                                        <div className="my-2">
                                            <div className="text-2xl sm:text-3xl font-black font-mono">
                                                {rasResult.weightedAvgDays} <span className="text-sm font-normal">روز</span>
                                            </div>
                                            <div className="text-xs opacity-90 font-bold mt-1">
                                                میانگین ساده سررسیدها: {rasResult.simpleAvgDays} روز
                                            </div>
                                        </div>
                                        <div className="text-[11px] bg-black/20 px-3 py-1 rounded-xl w-fit">
                                            اختلاف وزنی: {Math.abs(Math.round((rasResult.weightedAvgDays - rasResult.simpleAvgDays) * 10) / 10)} روز
                                        </div>
                                    </div>

                                    {/* Result Card 3: Total Amount & Cheque Count */}
                                    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                                        <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                                            <span>💰 مجموع مبالغ منتخب</span>
                                            <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                                {rasResult.totalCheques} فقره چک
                                            </span>
                                        </div>
                                        <div className="my-2">
                                            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                                                {formatMoney(rasResult.totalAmount)} <span className="text-xs font-normal text-slate-400">ریال</span>
                                            </div>
                                            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                                                {formatToman(rasResult.totalAmount)} تومان
                                            </div>
                                        </div>
                                        <div className="text-[11px] text-slate-400">
                                            میانگین مبلغ هر چک: {formatToman(rasResult.totalAmount / (rasResult.totalCheques || 1))} تومان
                                        </div>
                                    </div>

                                    {/* Result Card 4: Capital Cost / Interest Amount */}
                                    <div className="bg-white dark:bg-zinc-900 border border-amber-500/30 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                                        <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 font-bold">
                                            <span>📈 هزینه سرمایه / خسارت تاخیر</span>
                                            <Percent size={18} />
                                        </div>
                                        <div className="my-2">
                                            <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400">
                                                {formatMoney(rasResult.totalInterestCost)} <span className="text-xs font-normal text-slate-400">ریال</span>
                                            </div>
                                            <div className="text-xs text-slate-500 font-bold mt-1">
                                                {formatToman(rasResult.totalInterestCost)} تومان
                                            </div>
                                        </div>
                                        <div className="text-[11px] text-slate-400">
                                            محاسبه بر مبنای نرخ {rasResult.interestRateAnnual}٪ سالانه
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Ras Breakdown Table & Actions */}
                            {rasResult && (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h4 className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                                            <span>جدول ریز محاسبات و ضرایب وزنی هر چک در راس</span>
                                            <span className="text-[11px] text-slate-400 font-normal">({rasResult.breakdown.length} ردیف)</span>
                                        </h4>

                                        <button
                                            onClick={handleExportRasExcel}
                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                        >
                                            <FileSpreadsheet size={15} />
                                            <span>خروجی اکسل آنالیز راس</span>
                                        </button>
                                    </div>

                                    {/* Mobile Breakdown Cards (Zero Horizontal Scroll) */}
                                    <div className="block md:hidden space-y-2">
                                        {rasResult.breakdown.map((b, idx) => (
                                            <div key={b.cheque.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 space-y-1.5 shadow-2xs text-xs">
                                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-mono font-bold text-slate-400">#{idx + 1}</span>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                            b.cheque.chequeType === 'received'
                                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                                        }`}>
                                                            {b.cheque.chequeType === 'received' ? 'دریافتی' : 'خرج‌شده'}
                                                        </span>
                                                        <span className="font-mono font-bold" dir="ltr">#{b.cheque.chequeNo}</span>
                                                    </div>
                                                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">سررسید: {b.cheque.dueDate}</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-1.5 bg-slate-50 dark:bg-zinc-800/60 p-2 rounded-lg text-[11px]">
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 block">مبلغ چک:</span>
                                                        <span className="font-mono font-black text-slate-900 dark:text-white">{formatMoney(b.cheque.amount)} ریال</span>
                                                    </div>
                                                    <div className="text-left">
                                                        <span className="text-[10px] text-slate-400 block">فاصله از مبدأ:</span>
                                                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{b.daysFromBase} روز ({b.percentOfTotal.toFixed(1)}٪)</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Desktop Breakdown Table */}
                                    <div className="hidden md:block border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-x-auto shadow-xs">
                                        <table className="w-full text-right text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-slate-100 dark:bg-zinc-800/90 text-slate-700 dark:text-slate-200 font-black border-b border-slate-200 dark:border-zinc-700">
                                                    <th className="p-3 w-12 text-center">ردیف</th>
                                                    <th className="p-3">نوع</th>
                                                    <th className="p-3">شماره چک</th>
                                                    <th className="p-3">مبلغ (ریال)</th>
                                                    <th className="p-3">تاریخ سررسید</th>
                                                    <th className="p-3">فاصله روز از مبدأ ({rasResult.baseDateShamsi})</th>
                                                    <th className="p-3">حاصل‌ضرب وزنی (مبلغ × روز)</th>
                                                    <th className="p-3">سهم وزنی از کل</th>
                                                    <th className="p-3">هزینه تاخیر / سود ({rasResult.interestRateAnnual}٪)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                                {rasResult.breakdown.map((b, idx) => (
                                                    <tr key={b.cheque.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors">
                                                        <td className="p-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                                                        <td className="p-3">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                                b.cheque.chequeType === 'received'
                                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                                            }`}>
                                                                 {b.cheque.chequeType === 'received' ? 'دریافتی' : 'خرج‌شده'}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 font-mono font-bold" dir="ltr">{b.cheque.chequeNo}</td>
                                                        <td className="p-3 font-black text-slate-900 dark:text-white">
                                                            <div>{formatMoney(b.cheque.amount)}</div>
                                                            <div className="text-[10px] text-slate-400 font-normal">{formatToman(b.cheque.amount)} ت</div>
                                                        </td>
                                                        <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">{b.cheque.dueDate}</td>
                                                        <td className="p-3 font-mono font-bold">
                                                            <span className={`px-2 py-0.5 rounded-lg text-[11px] ${
                                                                b.daysFromBase >= 0
                                                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                                                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                                            }`}>
                                                                {b.daysFromBase} روز
                                                            </span>
                                                        </td>
                                                        <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                                                            {formatMoney(b.weight)}
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-16 bg-slate-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="bg-emerald-500 h-full rounded-full"
                                                                        style={{ width: `${Math.min(100, b.percentOfTotal)}%` }}
                                                                    />
                                                                </div>
                                                                <span className="font-mono text-[11px] font-bold">{b.percentOfTotal.toFixed(1)}٪</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 font-mono text-amber-600 dark:text-amber-400 font-bold">
                                                            {formatMoney(b.interestAmount)} ریال
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-slate-100 dark:bg-zinc-800 font-black text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-zinc-700">
                                                    <td colSpan={3} className="p-3 text-center">مجموع و راس نهایی</td>
                                                    <td className="p-3 text-emerald-600 dark:text-emerald-400">{formatMoney(rasResult.totalAmount)} ریال</td>
                                                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{rasResult.rasDateShamsi}</td>
                                                    <td className="p-3 font-mono">{rasResult.weightedAvgDays} روز</td>
                                                    <td className="p-3 font-mono">{formatMoney(rasResult.breakdown.reduce((s, x) => s + x.weight, 0))}</td>
                                                    <td className="p-3 font-mono">۱۰۰٪</td>
                                                    <td className="p-3 font-mono text-amber-600 dark:text-amber-400">{formatMoney(rasResult.totalInterestCost)} ریال</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : activeTab === 'smart_match' ? (
                        /* ================= TAB 3: SMART MATCH TARGET FINDER ================= */
                        <div className="space-y-4 sm:space-y-6 animate-fade-in">
                            {/* Input Form Banner */}
                            <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-purple-950 text-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-xl border border-indigo-500/30 space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-500/30 pb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 sm:p-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl shadow-md">
                                            <SlidersHorizontal className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-xs sm:text-base">🎯 ابزار انتخاب هوشمند چک بابت تسویه با مبلغ و راس هدف</h3>
                                            <p className="text-[11px] sm:text-xs text-indigo-200">
                                                مبلغ و تاریخ راس مدنظر خود را مشخص کنید تا سیستم بهترین ترکیب چک‌های تطبیقی را از بین {cheques.length} چک موجود به صورت اتوماتیک انتخاب کند.
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleRunSmartMatch}
                                        className="w-full sm:w-auto justify-center px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-black rounded-2xl shadow-lg transition-all transform hover:scale-[1.02] active:scale-95 flex items-center gap-2 cursor-pointer text-xs"
                                    >
                                        <Sparkles size={16} />
                                        <span>⚡ محاسبه و انتخاب اتوماتیک چک‌ها</span>
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                                    {/* Input 1: Target Sum */}
                                    <div className="space-y-1">
                                        <label className="font-bold text-indigo-200 flex items-center gap-1">
                                            <span>مبلغ کل هدف (ریال):</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={targetSumInput}
                                            onChange={(e) => setTargetSumInput(e.target.value)}
                                            placeholder="مثلاً 2500000000"
                                            className="w-full bg-white/10 border border-indigo-400/40 rounded-xl px-3 py-2 text-white font-mono text-center font-bold outline-none focus:border-emerald-400"
                                        />
                                        {parseFloat(targetSumInput || '0') > 0 && (
                                            <span className="text-[10px] text-emerald-300 font-bold block text-center">
                                                {formatToman(parseFloat(targetSumInput))} تومان
                                            </span>
                                        )}
                                    </div>

                                    {/* Input 2: Target Ras Date */}
                                    <div className="space-y-1">
                                        <label className="font-bold text-indigo-200 flex items-center gap-1">
                                            <span>سررسید / راس هدف:</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={targetRasInput}
                                            onChange={(e) => setTargetRasInput(e.target.value)}
                                            placeholder="1404/06/15"
                                            className="w-full bg-white/10 border border-indigo-400/40 rounded-xl px-3 py-2 text-white font-mono text-center font-bold outline-none focus:border-emerald-400"
                                        />
                                        <span className="text-[10px] text-indigo-300 block text-center">
                                            شمسی (سال/ماه/روز)
                                        </span>
                                    </div>

                                    {/* Input 3: Due Range From */}
                                    <div className="space-y-1">
                                        <label className="font-bold text-indigo-200 flex items-center gap-1">
                                            <span>شرط از سررسید:</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={targetDueFromInput}
                                            onChange={(e) => setTargetDueFromInput(e.target.value)}
                                            placeholder="از سررسید..."
                                            className="w-full bg-white/10 border border-indigo-400/40 rounded-xl px-3 py-2 text-white font-mono text-center outline-none focus:border-emerald-400"
                                        />
                                    </div>

                                    {/* Input 4: Due Range To */}
                                    <div className="space-y-1">
                                        <label className="font-bold text-indigo-200 flex items-center gap-1">
                                            <span>شرط تا سررسید:</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={targetDueToInput}
                                            onChange={(e) => setTargetDueToInput(e.target.value)}
                                            placeholder="تا سررسید..."
                                            className="w-full bg-white/10 border border-indigo-400/40 rounded-xl px-3 py-2 text-white font-mono text-center outline-none focus:border-emerald-400"
                                        />
                                    </div>

                                    {/* Input 5: Cheque Type */}
                                    <div className="space-y-1">
                                        <label className="font-bold text-indigo-200 flex items-center gap-1">
                                            <span>محدوده نوع چک:</span>
                                        </label>
                                        <select
                                            value={targetChequeTypeInput}
                                            onChange={(e) => setTargetChequeTypeInput(e.target.value as any)}
                                            className="w-full bg-slate-900 border border-indigo-400/40 rounded-xl px-2 py-2 text-white font-bold outline-none"
                                        >
                                            <option value="all">همه چک‌ها</option>
                                            <option value="spent">فقط چک‌های خرج‌شده</option>
                                            <option value="received">فقط چک‌های دریافتی</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Result Dashboard Box */}
                            {smartMatchResult ? (
                                <div className="space-y-4 animate-fadeIn">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                        {/* Result 1: Total Sum Matched */}
                                        <div className="bg-white dark:bg-zinc-900 border-2 border-emerald-500/50 rounded-2xl p-4 shadow-sm">
                                            <div className="text-xs text-slate-500 font-bold flex items-center justify-between">
                                                <span>مجموع چک‌های منطبق</span>
                                                <CheckCircle2 size={16} className="text-emerald-500" />
                                            </div>
                                            <div className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-1 font-mono break-all">
                                                {formatMoney(smartMatchResult.totalMatchedSum)} <span className="text-xs font-normal text-slate-400">ریال</span>
                                            </div>
                                            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold break-all">
                                                {formatToman(smartMatchResult.totalMatchedSum)} تومان
                                            </div>
                                            <div className="mt-2 text-[11px] font-bold text-slate-500 border-t pt-1">
                                                اختلاف با هدف: {smartMatchResult.sumDiff === 0 ? 'دقیقاً انطباق' : `${formatToman(Math.abs(smartMatchResult.sumDiff))} تومان (${smartMatchResult.sumDiff > 0 ? 'مازاد' : 'کسری'})`}
                                            </div>
                                        </div>

                                        {/* Result 2: Matched Ras Date */}
                                        <div className="bg-white dark:bg-zinc-900 border-2 border-indigo-500/50 rounded-2xl p-4 shadow-sm">
                                            <div className="text-xs text-slate-500 font-bold flex items-center justify-between">
                                                <span>تاریخ راس محاسبه‌شده</span>
                                                <Calendar size={16} className="text-indigo-500" />
                                            </div>
                                            <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
                                                {smartMatchResult.matchedRasDate}
                                            </div>
                                            <div className="text-xs text-slate-500 font-bold">
                                                راس هدف: {targetRasInput}
                                            </div>
                                            <div className="mt-2 text-[11px] font-bold text-slate-500 border-t pt-1">
                                                اختلاف با راس هدف: {smartMatchResult.rasDaysDiff === 0 ? 'دقیقاً منطبق' : `${Math.abs(smartMatchResult.rasDaysDiff)} روز (${smartMatchResult.rasDaysDiff > 0 ? 'دیرتر' : 'زودتر'})`}
                                            </div>
                                        </div>

                                        {/* Result 3: Matched Count */}
                                        <div className="bg-white dark:bg-zinc-900 border-2 border-purple-500/50 rounded-2xl p-4 shadow-sm">
                                            <div className="text-xs text-slate-500 font-bold flex items-center justify-between">
                                                <span>تعداد چک‌های پیشنهادی</span>
                                                <CreditCard size={16} className="text-purple-500" />
                                            </div>
                                            <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">
                                                {smartMatchResult.matchedCheques.length} <span className="text-xs font-normal text-slate-400">فقره</span>
                                            </div>
                                            <div className="text-xs text-slate-400 font-medium">
                                                از بین {cheques.length} چک موجود
                                            </div>
                                        </div>

                                        {/* Result 4: Quick Actions */}
                                        <div className="bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-2xl p-3 flex flex-col justify-center gap-2">
                                            <button
                                                onClick={() => {
                                                    setActiveTab('list');
                                                }}
                                                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                                            >
                                                <Eye size={14} />
                                                <span>مشاهده انتخاب در جدول اصلی</span>
                                            </button>

                                            <button
                                                onClick={() => handleExportExcel(smartMatchResult.matchedCheques, 'پیشنهاد_هوشمند_تسویه')}
                                                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                                            >
                                                <FileSpreadsheet size={14} />
                                                <span>دانلود اکسل چک‌های پیشنهادی</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Matched Cheques List Table & Mobile Cards */}
                                    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 space-y-3">
                                        <div className="flex items-center justify-between border-b pb-2">
                                            <h4 className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-2">
                                                <span>لیست چک‌های منتخب بر اساس الگوریتم هوشمند</span>
                                                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-mono">
                                                    {smartMatchResult.matchedCheques.length} فقره
                                                </span>
                                            </h4>
                                        </div>

                                        {/* Mobile Cards (Zero Horizontal Scroll) */}
                                        <div className="block md:hidden space-y-2">
                                            {smartMatchResult.matchedCheques.map((c, idx) => (
                                                <div key={c.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 p-2.5 space-y-1.5 text-xs">
                                                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-1">
                                                        <span className="font-mono font-bold text-indigo-600">#{idx + 1} - چک {c.chequeNo}</span>
                                                        <span className="font-mono font-bold">سررسید: {c.dueDate}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between bg-slate-50 dark:bg-zinc-800/60 px-2 py-1 rounded-lg">
                                                        <span className="font-mono font-black text-slate-900 dark:text-white">{formatMoney(c.amount)} ریال</span>
                                                        <span className="font-mono text-emerald-600 font-bold text-[11px]">{formatToman(c.amount)} ت</span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-500">
                                                        {c.bankName} | {c.drawerName || '-'}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Desktop Table */}
                                        <div className="hidden md:block overflow-x-auto custom-scrollbar">
                                            <table className="w-full text-right text-xs">
                                                <thead>
                                                    <tr className="bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 font-bold border-b">
                                                        <th className="p-2.5">ردیف</th>
                                                        <th className="p-2.5">نوع چک</th>
                                                        <th className="p-2.5">شماره چک</th>
                                                        <th className="p-2.5">تاریخ سررسید</th>
                                                        <th className="p-2.5">مبلغ (ریال)</th>
                                                        <th className="p-2.5">مبلغ (تومان)</th>
                                                        <th className="p-2.5">بانک و شعبه</th>
                                                        <th className="p-2.5">صادرکننده / صاحب چک</th>
                                                        <th className="p-2.5">شرح سند</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                                    {smartMatchResult.matchedCheques.map((c, idx) => (
                                                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                                                            <td className="p-2.5 font-bold">{idx + 1}</td>
                                                            <td className="p-2.5">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                    c.chequeType === 'spent' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                                                                }`}>
                                                                    {c.chequeType === 'spent' ? 'خرج‌شده' : 'دریافتی'}
                                                                </span>
                                                            </td>
                                                            <td className="p-2.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">{c.chequeNo}</td>
                                                            <td className="p-2.5 font-mono font-bold">{c.dueDate}</td>
                                                            <td className="p-2.5 font-mono font-black">{formatMoney(c.amount)}</td>
                                                            <td className="p-2.5 font-mono text-emerald-600 dark:text-emerald-400 font-bold">{formatToman(c.amount)}</td>
                                                            <td className="p-2.5">{c.bankName} - {c.branch || '-'}</td>
                                                            <td className="p-2.5 font-bold">{c.drawerName || '-'}</td>
                                                            <td className="p-2.5 text-slate-500 text-[11px] break-words max-w-[240px]">{c.docDesc || c.statusDesc}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="bg-slate-100 dark:bg-zinc-800 font-black text-slate-900 dark:text-white border-t-2">
                                                        <td colSpan={4} className="p-2.5 text-center">مجموع انتخاب شده</td>
                                                        <td className="p-2.5 font-mono text-emerald-600">{formatMoney(smartMatchResult.totalMatchedSum)} ریال</td>
                                                        <td className="p-2.5 font-mono text-emerald-600">{formatToman(smartMatchResult.totalMatchedSum)} تومان</td>
                                                        <td colSpan={3} className="p-2.5 font-mono text-indigo-600">تاریخ راس: {smartMatchResult.matchedRasDate}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-slate-50 dark:bg-zinc-900/50 border border-dashed border-slate-300 dark:border-zinc-700 rounded-3xl space-y-3">
                                    <Sparkles size={40} className="mx-auto text-indigo-500 animate-pulse" />
                                    <h4 className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                                        مبلغ کل و سررسید راس هدف خود را وارد نموده و دکمه «محاسبه اتوماتیک» را فشار دهید.
                                    </h4>
                                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                                        الگوریتم هوشمند با ترکیب مبالغ و سررسید چک‌های موجود، نزدیک‌ترین ترکیب مبالغ و راس را برای تسویه پیدا کرده و در جدول تیک می‌زند.
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                {/* MODAL FOOTER - Compact on Mobile */}
                <div className="bg-slate-50 dark:bg-zinc-950 px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between border-t border-slate-200 dark:border-zinc-800 shrink-0 text-[11px] sm:text-xs">
                    <div className="hidden sm:flex items-center gap-2 text-slate-500">
                        <span>پایگاه داده: <b>سایان ERP (خزانه‌داری BUR_TBL_012 & BUR_TBL_009)</b></span>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => handleExportExcel()}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                            <Download size={14} />
                            <span>خروجی اکسل</span>
                        </button>

                        <button
                            onClick={onClose}
                            className="px-4 sm:px-5 py-1.5 sm:py-2 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-200 text-white dark:text-black rounded-xl font-bold transition-colors cursor-pointer"
                        >
                            بستن
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
