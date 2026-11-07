import { toGregorian } from 'jalaali-js';
import { TradeRecord, User } from '../types';
import { sendNotification } from '../services/notificationService';

export interface GuaranteeAlertItem {
    id: string;
    recordId: string;
    fileNumber: string;
    proformaNumber?: string;
    goodsName?: string;
    company: string;
    section: 'ارزی' | 'گمرکی';
    guaranteeNumber: string;
    bank: string;
    amount: number;
    dueDate?: string;
    isDelivered: boolean;
    daysRemaining: number | null;
    status: 'delivered' | 'overdue' | 'critical' | 'upcoming' | 'no_date';
    statusLabel: string;
    needsFundAlert: boolean;
    description?: string;
}

/**
 * Normalizes Persian/Arabic digits to English 0-9
 */
export const normalizeDigits = (str: string): string => {
    if (!str) return '';
    return str
        .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
        .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
};

/**
 * Converts a date string (Shamsi 1403/06/25 or Gregorian 2024/09/15) to a JS Date object at midnight UTC/Local
 */
export const parseTradeDate = (dateStr?: string): Date | null => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const clean = normalizeDigits(dateStr).trim();
    if (!clean || clean === '-') return null;

    const parts = clean.split(/[\/\-\.]/).map(p => parseInt(p, 10));
    if (parts.length < 3 || parts.some(isNaN)) return null;

    const [y, m, d] = parts;

    // Shamsi year detection (1300 to 1500)
    if (y >= 1300 && y <= 1500 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        try {
            const { gy, gm, gd } = toGregorian(y, m, d);
            const res = new Date(gy, gm - 1, gd);
            res.setHours(0, 0, 0, 0);
            return isNaN(res.getTime()) ? null : res;
        } catch {
            return null;
        }
    }

    // Gregorian year detection (1900 to 2150)
    if (y >= 1900 && y <= 2150 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const res = new Date(y, m - 1, d);
        res.setHours(0, 0, 0, 0);
        return isNaN(res.getTime()) ? null : res;
    }

    return null;
};

/**
 * Calculates remaining days until dueDate.
 * Positive = X days remaining in future
 * 0 = Today
 * Negative = X days overdue in past
 * null = Invalid or unspecified date
 */
export const getDaysRemaining = (dueDate?: string): number | null => {
    const target = parseTradeDate(dueDate);
    if (!target) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Categorizes a guarantee by its due status
 */
export const getGuaranteeDueStatus = (
    dueDate?: string,
    isDelivered?: boolean
): {
    status: 'delivered' | 'overdue' | 'critical' | 'upcoming' | 'no_date';
    daysRemaining: number | null;
    statusLabel: string;
    colorClass: string;
    badgeClass: string;
    bgClass: string;
    needsFundAlert: boolean;
} => {
    if (isDelivered) {
        return {
            status: 'delivered',
            daysRemaining: null,
            statusLabel: 'عودت شد (رفع تعهد)',
            colorClass: 'text-emerald-700 dark:text-emerald-400',
            badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
            bgClass: 'bg-emerald-50/50',
            needsFundAlert: false
        };
    }

    const days = getDaysRemaining(dueDate);

    if (days === null) {
        return {
            status: 'no_date',
            daysRemaining: null,
            statusLabel: 'بدون تاریخ سررسید',
            colorClass: 'text-slate-500 dark:text-slate-400',
            badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
            bgClass: 'bg-slate-50/50',
            needsFundAlert: false
        };
    }

    if (days < 0) {
        return {
            status: 'overdue',
            daysRemaining: days,
            statusLabel: `${Math.abs(days)} روز گذشته از سررسید (اقدام فوری)`,
            colorClass: 'text-rose-700 dark:text-rose-400',
            badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 animate-pulse',
            bgClass: 'bg-rose-50/60 border-rose-200',
            needsFundAlert: true
        };
    }

    if (days <= 3) {
        const text = days === 0 
            ? 'سررسید امروز! (تامین موجودی حساب)' 
            : `${days} روز تا سررسید (تامین موجودی حساب)`;
        return {
            status: 'critical',
            daysRemaining: days,
            statusLabel: text,
            colorClass: 'text-amber-700 dark:text-amber-400',
            badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 font-black',
            bgClass: 'bg-amber-50/70 border-amber-200',
            needsFundAlert: true
        };
    }

    return {
        status: 'upcoming',
        daysRemaining: days,
        statusLabel: `${days} روز تا سررسید`,
        colorClass: 'text-blue-700 dark:text-blue-400',
        badgeClass: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
        bgClass: 'bg-blue-50/30',
        needsFundAlert: false
    };
};

/**
 * Extracts all guarantees from all trade records with calculated due date alerts
 */
export const extractAllGuaranteesWithAlerts = (records: TradeRecord[]): GuaranteeAlertItem[] => {
    const list: GuaranteeAlertItem[] = [];

    (records || []).forEach(r => {
        // 1. Currency guarantees
        if (r.currencyPurchaseData) {
            const currencyGuarantees = r.currencyPurchaseData.guaranteeCheques || 
                (r.currencyPurchaseData.guaranteeCheque ? [r.currencyPurchaseData.guaranteeCheque] : []);

            currencyGuarantees.forEach((g, idx) => {
                if (g.chequeNumber || g.amount) {
                    const dueInfo = getGuaranteeDueStatus(g.dueDate, g.isDelivered);
                    list.push({
                        id: `${r.id}_currency_${idx}`,
                        recordId: r.id,
                        fileNumber: r.fileNumber || '-',
                        proformaNumber: r.proformaNumber,
                        goodsName: r.goodsName,
                        company: r.company || '-',
                        section: 'ارزی',
                        guaranteeNumber: g.chequeNumber || '-',
                        bank: g.bank || '-',
                        amount: g.amount || 0,
                        dueDate: g.dueDate,
                        isDelivered: !!g.isDelivered,
                        daysRemaining: dueInfo.daysRemaining,
                        status: dueInfo.status,
                        statusLabel: dueInfo.statusLabel,
                        needsFundAlert: dueInfo.needsFundAlert,
                        description: 'ضمانت رفع تعهد ارزی'
                    });
                }
            });
        }

        // 2. Customs (Green Leaf) guarantees
        if (r.greenLeafData?.guarantees) {
            r.greenLeafData.guarantees.forEach((g) => {
                if (g.guaranteeNumber || g.chequeNumber || g.guaranteeAmount) {
                    const effectiveDueDate = g.dueDate || g.chequeDate || g.cashDate || '';
                    const dueInfo = getGuaranteeDueStatus(effectiveDueDate, g.isDelivered);
                    const duty = r.greenLeafData?.duties.find(d => d.id === g.relatedDutyId);

                    list.push({
                        id: `${r.id}_customs_${g.id}`,
                        recordId: r.id,
                        fileNumber: r.fileNumber || '-',
                        proformaNumber: r.proformaNumber,
                        goodsName: r.goodsName,
                        company: r.company || '-',
                        section: 'گمرکی',
                        guaranteeNumber: g.guaranteeNumber + (g.sepamNumber ? ` (سپام: ${g.sepamNumber})` : '') + (g.guaranteeType === 'credit' ? ' [حد اعتبار]' : (g.chequeNumber ? ` [چک: ${g.chequeNumber}]` : '')),
                        bank: g.guaranteeBank || (g.guaranteeType === 'credit' ? 'حد اعتبار بانکی' : (g.chequeBank || '-')),
                        amount: g.guaranteeAmount || g.chequeAmount || 0,
                        dueDate: effectiveDueDate,
                        isDelivered: !!g.isDelivered,
                        daysRemaining: dueInfo.daysRemaining,
                        status: dueInfo.status,
                        statusLabel: dueInfo.statusLabel,
                        needsFundAlert: dueInfo.needsFundAlert,
                        description: duty ? `کوتاژ ${duty.cottageNumber}` : 'ضمانت گمرکی برگ سبز'
                    });
                }
            });
        }
    });

    // Sort:
    // 1. Critical & Overdue (needsFundAlert = true) first, ordered by daysRemaining ascending (most overdue / nearest first)
    // 2. Upcoming with dates
    // 3. Undelivered without dates
    // 4. Delivered at the bottom
    return list.sort((a, b) => {
        if (a.isDelivered !== b.isDelivered) return a.isDelivered ? 1 : -1;
        if (a.needsFundAlert !== b.needsFundAlert) return a.needsFundAlert ? -1 : 1;
        
        if (a.daysRemaining !== null && b.daysRemaining !== null) {
            return a.daysRemaining - b.daysRemaining;
        }
        if (a.daysRemaining !== null) return -1;
        if (b.daysRemaining !== null) return 1;
        return 0;
    });
};

/**
 * Checks for guarantees reaching due date in <= 3 days and sends alert notification to managers / trade users.
 */
export const checkAndNotifyGuaranteeDueDates = async (records: TradeRecord[], currentUser?: User) => {
    if (!records || records.length === 0) return;

    // Check role eligibility: Admin, Manager, CEO, Financial, Commercial or canManageTrade
    if (currentUser) {
        const role = String(currentUser.role || '').toLowerCase();
        const isEligible = 
            role.includes('admin') || 
            role.includes('manager') || 
            role.includes('ceo') || 
            role.includes('financial') || 
            role.includes('commercial') ||
            currentUser.canManageTrade === true;

        if (!isEligible) return;
    }

    const allGuarantees = extractAllGuaranteesWithAlerts(records);
    const urgentItems = allGuarantees.filter(g => !g.isDelivered && g.needsFundAlert);

    if (urgentItems.length === 0) return;

    // Debounce to once per 6 hours per browser session so users aren't spammed on every render
    const STORAGE_KEY = 'last_guarantee_alert_timestamp';
    try {
        const lastAlert = localStorage.getItem(STORAGE_KEY);
        const now = Date.now();
        if (lastAlert && (now - parseInt(lastAlert, 10)) < 6 * 60 * 60 * 1000) {
            return;
        }
        localStorage.setItem(STORAGE_KEY, now.toString());
    } catch {
        // ignore localStorage errors
    }

    // Build notification message
    const count = urgentItems.length;
    const topItem = urgentItems[0];
    const title = `⚠️ هشدار سررسید ضمانت‌نامه بازرگانی (${count} مورد)`;
    
    let body = count === 1 
        ? `سررسید ضمانت پرونده ${topItem.fileNumber} (${topItem.bank}) نزدیک است (${topItem.statusLabel}). لطفاً موجودی ریالی حساب را تامین نمایید.`
        : `${count} فقره ضمانت‌نامه بازرگانی در آستانه سررسید (یا گذشته) قرار دارند. لطفاً موجودی حساب‌ها را تامین نمایید.`;

    try {
        await sendNotification(title, body, {
            id: `guarantee_alert_${Date.now()}`,
            tab: 'trade',
            url: window.location.origin
        });
    } catch (e) {
        console.warn('Could not dispatch guarantee notification:', e);
    }
};
