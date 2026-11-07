import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, ChevronDown, ChevronUp, ArrowLeft, Building2, Calendar, Banknote } from 'lucide-react';
import { TradeRecord, User } from '../../types';
import { formatCurrency } from '../../constants';
import { extractAllGuaranteesWithAlerts, GuaranteeAlertItem } from '../../utils/guaranteeAlertUtils';

interface Props {
    records: TradeRecord[];
    currentUser: User;
    onNavigateToRecord?: (recordId: string, tab?: string) => void;
}

export const GuaranteeAlertBanner: React.FC<Props> = ({
    records,
    currentUser,
    onNavigateToRecord
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Filter only eligible roles for managerial/commercial fund alerts
    const role = String(currentUser.role || '').toLowerCase();
    const isEligible = 
        role.includes('admin') || 
        role.includes('manager') || 
        role.includes('ceo') || 
        role.includes('financial') || 
        role.includes('commercial') ||
        currentUser.canManageTrade === true;

    if (!isEligible) return null;

    const allGuarantees = extractAllGuaranteesWithAlerts(records);
    // Find undelivered guarantees that are either critical (<=3 days) or overdue (<0 days)
    const urgentItems = allGuarantees.filter(g => !g.isDelivered && g.needsFundAlert);

    if (urgentItems.length === 0) return null;

    const overdueCount = urgentItems.filter(g => g.status === 'overdue').length;
    const criticalCount = urgentItems.filter(g => g.status === 'critical').length;
    const totalUrgentAmount = urgentItems.reduce((acc, g) => acc + (g.amount || 0), 0);

    return (
        <div className="w-full mb-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 border-2 border-amber-500/30 rounded-2xl p-4 shadow-sm backdrop-blur-sm animate-fade-in text-right" dir="rtl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                        <ShieldAlert size={24} className="animate-bounce" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-black text-sm md:text-base text-gray-900 dark:text-gray-100">
                                هشدار سررسید تضامین بازرگانی ({urgentItems.length} فقره)
                            </h4>
                            {overdueCount > 0 && (
                                <span className="bg-rose-100 text-rose-800 text-[11px] font-black px-2 py-0.5 rounded-full border border-rose-300">
                                    {overdueCount} مورد منقضی
                                </span>
                            )}
                            {criticalCount > 0 && (
                                <span className="bg-amber-100 text-amber-900 text-[11px] font-black px-2 py-0.5 rounded-full border border-amber-300">
                                    {criticalCount} مورد در آستانه سررسید (۱ تا ۳ روز)
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed">
                            توجه مدیریت و بازرگانی: تاریخ سررسید ضمانت‌نامه‌های زیر فرارسیده یا در ۲ الی ۳ روز آینده است. لطفاً نسبت به تامین موجودی ریالی در حساب بانک مربوطه جهت جلوگیری از واخواست یا انسداد اقدام فرمایید.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                    <div className="text-left hidden md:block">
                        <div className="text-[10px] text-gray-500 font-bold">مجموع مبلغ نیازمند تامین</div>
                        <div className="text-xs font-black font-mono text-amber-900 dark:text-amber-300 dir-ltr">{formatCurrency(totalUrgentAmount)} ریال</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsExpanded(prev => !prev)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                    >
                        <span>{isExpanded ? 'بستن لیست' : 'مشاهده جزییات ضمانت‌ها'}</span>
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                </div>
            </div>

            {/* Expandable detailed table */}
            {isExpanded && (
                <div className="mt-4 pt-3 border-t border-amber-200/60 dark:border-amber-900/40 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {urgentItems.map((item) => (
                            <div 
                                key={item.id}
                                className={`p-3 rounded-xl border transition-all text-xs flex flex-col justify-between gap-2 shadow-xs ${
                                    item.status === 'overdue' 
                                        ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800' 
                                        : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
                                }`}
                            >
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                                                item.section === 'ارزی' 
                                                    ? 'bg-purple-100 text-purple-700' 
                                                    : 'bg-emerald-100 text-emerald-700'
                                            }`}>
                                                {item.section}
                                            </span>
                                            <span className="font-bold text-gray-800 dark:text-gray-200">
                                                پرونده: {item.fileNumber}
                                            </span>
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                                            item.status === 'overdue' 
                                                ? 'bg-rose-100 text-rose-800 border-rose-300' 
                                                : 'bg-amber-100 text-amber-900 border-amber-300'
                                        }`}>
                                            {item.statusLabel}
                                        </span>
                                    </div>

                                    <div className="text-gray-600 dark:text-gray-300 space-y-0.5">
                                        <div className="flex items-center gap-1 text-[11px]">
                                            <Building2 size={13} className="text-gray-400" />
                                            <span>شرکت: <strong>{item.company}</strong></span>
                                            <span className="text-gray-400">|</span>
                                            <span>بانک: <strong>{item.bank}</strong></span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[11px]">
                                            <Calendar size={13} className="text-gray-400" />
                                            <span>تاریخ سررسید:</span>
                                            <span className="font-mono font-bold text-gray-900 dark:text-gray-100 dir-ltr">{item.dueDate || '-'}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[11px]">
                                            <Banknote size={13} className="text-gray-400" />
                                            <span>مبلغ ضمانت:</span>
                                            <span className="font-mono font-black text-amber-800 dark:text-amber-300 dir-ltr">{formatCurrency(item.amount)} ریال</span>
                                        </div>
                                    </div>
                                </div>

                                {onNavigateToRecord && (
                                    <button
                                        type="button"
                                        onClick={() => onNavigateToRecord(item.recordId, item.section === 'ارزی' ? 'currency_purchase' : 'green_leaf')}
                                        className="w-full mt-1 py-1.5 px-2.5 bg-white dark:bg-zinc-800 hover:bg-gray-100 text-gray-700 dark:text-gray-200 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 border border-gray-200 dark:border-zinc-700 transition-colors"
                                    >
                                        <span>مشاهده پرونده و بخش ضمانت</span>
                                        <ArrowLeft size={13} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GuaranteeAlertBanner;
