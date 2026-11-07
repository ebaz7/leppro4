import React, { useState, useEffect, useRef } from 'react';
import { TradeRecord, TradeStage } from '../types';
import { TradeDatePicker } from './TradeDatePicker';
import FormattedNumberInput from './FormattedNumberInput';
import { TradeAttachmentSection } from './trade/TradeAttachmentSection';
import { formatCurrency, formatNumberString, calculateDaysDiff, calculateDaysBetween, parsePersianDate, addDaysToPersianDate } from '../constants';
import { 
    Clock, 
    CheckCircle2, 
    Save, 
    Calendar, 
    Hash, 
    FileText, 
    Paperclip, 
    Eye, 
    FileDown, 
    Share2, 
    X, 
    ShieldCheck, 
    Layers,
    AlertTriangle,
    Coins
} from 'lucide-react';

export interface AllocationFormData {
    // Queue part (در صف تخصیص)
    isQueueCompleted: boolean;
    queueDate: string;
    currencyAllocationType: string;
    allocationCurrencyRank?: 'Type1' | 'Type2';
    isPriority?: boolean;

    // Approved part (تخصیص یافته)
    isAllocated: boolean;
    allocationCode: string;
    allocationDate: string;
    allocationExpiry: string;

    // Financial & Notes
    costRial: number;
    costCurrency: number;
    currencyType: string;
    description: string;
    attachments: { fileName: string; url: string }[];
}

interface AllocationTabProps {
    record: TradeRecord;
    onSave: (formData: AllocationFormData) => Promise<void>;
    uploadFile: (fileName: string, base64: string) => Promise<{ fileName: string; url: string }>;
    onOpenAttachment?: (url: string, name: string) => void;
    onSendToChat?: (attachment: { fileName: string; url: string }, msg: string) => void;
}

export const AllocationTab: React.FC<AllocationTabProps> = ({
    record,
    onSave,
    uploadFile,
    onOpenAttachment,
    onSendToChat
}) => {
    const queueStage = record.stages?.[TradeStage.ALLOCATION_QUEUE] || record.stages?.['در صف تخصیص ارز'];
    const approvedStage = record.stages?.[TradeStage.ALLOCATION_APPROVED] || record.stages?.['تخصیص یافته'];

    const [form, setForm] = useState<AllocationFormData>(() => {
        const isQueueDone = Boolean(
            queueStage?.isCompleted || 
            record.currencyPurchaseData?.queueEntryDate || 
            queueStage?.queueDate
        );
        const isApprDone = Boolean(
            approvedStage?.isCompleted || 
            record.currencyPurchaseData?.allocationDate || 
            approvedStage?.allocationDate
        );

        // Deduplicate attachments
        const allAtts: { fileName: string; url: string }[] = [];
        const seenUrls = new Set<string>();
        [...(queueStage?.attachments || []), ...(approvedStage?.attachments || [])].forEach(att => {
            if (att?.url && !seenUrls.has(att.url)) {
                seenUrls.add(att.url);
                allAtts.push(att);
            }
        });

        return {
            isQueueCompleted: isQueueDone,
            queueDate: queueStage?.queueDate || record.currencyPurchaseData?.queueEntryDate || '',
            currencyAllocationType: record.currencyAllocationType || '',
            allocationCurrencyRank: record.allocationCurrencyRank || 'Type1',
            isPriority: record.isPriority || false,

            isAllocated: isApprDone,
            allocationCode: approvedStage?.allocationCode || record.currencyPurchaseData?.allocationCode || '',
            allocationDate: approvedStage?.allocationDate || record.currencyPurchaseData?.allocationDate || '',
            allocationExpiry: approvedStage?.allocationExpiry || record.currencyPurchaseData?.allocationExpiryDate || '',

            costRial: (approvedStage?.costRial || 0) + (queueStage?.costRial || 0),
            costCurrency: approvedStage?.costCurrency || queueStage?.costCurrency || 0,
            currencyType: approvedStage?.currencyType || queueStage?.currencyType || record.mainCurrency || 'EUR',
            description: [queueStage?.description, approvedStage?.description].filter(Boolean).join('\n') || '',
            attachments: allAtts
        };
    });

    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [durationDaysInput, setDurationDaysInput] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Synchronize duration days when dates are present
    useEffect(() => {
        if (form.allocationDate && form.allocationExpiry) {
            const diff = calculateDaysBetween(form.allocationDate, form.allocationExpiry);
            if (diff && diff > 0) {
                setDurationDaysInput(diff.toString());
            }
        }
    }, [form.allocationDate, form.allocationExpiry]);

    const handleApplyDurationDays = (daysCount: number | string) => {
        const days = typeof daysCount === 'string' ? parseInt(daysCount, 10) : daysCount;
        setDurationDaysInput(days ? days.toString() : '');
        if (days && !isNaN(days) && days > 0) {
            const baseDate = form.allocationDate || form.queueDate;
            if (baseDate) {
                const calculatedExpiry = addDaysToPersianDate(baseDate, days);
                if (calculatedExpiry) {
                    setForm(prev => ({ ...prev, allocationExpiry: calculatedExpiry }));
                }
            }
        }
    };

    // Keep form synced if record ID changes
    useEffect(() => {
        const qStage = record.stages?.[TradeStage.ALLOCATION_QUEUE] || record.stages?.['در صف تخصیص ارز'];
        const aStage = record.stages?.[TradeStage.ALLOCATION_APPROVED] || record.stages?.['تخصیص یافته'];

        const allAtts: { fileName: string; url: string }[] = [];
        const seen = new Set<string>();
        [...(qStage?.attachments || []), ...(aStage?.attachments || [])].forEach(att => {
            if (att?.url && !seen.has(att.url)) {
                seen.add(att.url);
                allAtts.push(att);
            }
        });

        setForm({
            isQueueCompleted: Boolean(qStage?.isCompleted || record.currencyPurchaseData?.queueEntryDate || qStage?.queueDate),
            queueDate: qStage?.queueDate || record.currencyPurchaseData?.queueEntryDate || '',
            currencyAllocationType: record.currencyAllocationType || '',
            allocationCurrencyRank: record.allocationCurrencyRank || 'Type1',
            isPriority: record.isPriority || false,

            isAllocated: Boolean(aStage?.isCompleted || record.currencyPurchaseData?.allocationDate || aStage?.allocationDate),
            allocationCode: aStage?.allocationCode || record.currencyPurchaseData?.allocationCode || '',
            allocationDate: aStage?.allocationDate || record.currencyPurchaseData?.allocationDate || '',
            allocationExpiry: aStage?.allocationExpiry || record.currencyPurchaseData?.allocationExpiryDate || '',

            costRial: (aStage?.costRial || 0) + (qStage?.costRial || 0),
            costCurrency: aStage?.costCurrency || qStage?.costCurrency || 0,
            currencyType: aStage?.currencyType || qStage?.currencyType || record.mainCurrency || 'EUR',
            description: [qStage?.description, aStage?.description].filter(Boolean).join('\n') || '',
            attachments: allAtts
        });
    }, [record.id]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64 = ev.target?.result as string;
            try {
                const res = await uploadFile(file.name, base64);
                setForm(prev => ({
                    ...prev,
                    attachments: [...prev.attachments, { fileName: res.fileName, url: res.url }]
                }));
            } catch {
                alert('خطا در بارگذاری فایل');
            } finally {
                setUploading(false);
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleRemoveAttachment = (index: number) => {
        setForm(prev => ({
            ...prev,
            attachments: prev.attachments.filter((_, idx) => idx !== index)
        }));
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setIsSaving(true);
        try {
            await onSave(form);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err: any) {
            alert('خطا در ذخیره اطلاعات تخصیص ارز: ' + (err?.message || 'نامشخص'));
        } finally {
            setIsSaving(false);
        }
    };

    // Calculate queue waiting days (from queueDate to allocationDate if filled, otherwise to today)
    const queueDays = form.queueDate 
        ? calculateDaysDiff(form.queueDate, form.allocationDate || undefined) 
        : null;

    // Calculate total duration (from registered allocationDate to expiry deadline)
    const totalValidityDays = (form.allocationDate && form.allocationExpiry) 
        ? calculateDaysBetween(form.allocationDate, form.allocationExpiry) 
        : null;

    // Calculate expiry days remaining compared to TODAY
    let expiryStatus: { text: string; isExpired: boolean; days: number; totalDays: number | null } | null = null;
    if (form.allocationExpiry) {
        const expiryDate = parsePersianDate(form.allocationExpiry);
        if (expiryDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            expiryDate.setHours(0, 0, 0, 0);
            
            const diffTime = expiryDate.getTime() - today.getTime();
            const remainingDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (remainingDays < 0) {
                const pastDays = Math.abs(remainingDays);
                expiryStatus = {
                    text: 'تمام شده',
                    isExpired: true,
                    days: pastDays,
                    totalDays: totalValidityDays
                };
            } else if (remainingDays === 0) {
                expiryStatus = {
                    text: 'امروز آخرین روز مهلت تخصیص است',
                    isExpired: false,
                    days: 0,
                    totalDays: totalValidityDays
                };
            } else {
                expiryStatus = {
                    text: `${remainingDays} روز تا انقضای تخصیص`,
                    isExpired: false,
                    days: remainingDays,
                    totalDays: totalValidityDays
                };
            }
        }
    }

    return (
        <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-5" dir="rtl">
            {/* Top Status & Summary Banner */}
            <div className="glass-panel p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-l from-white via-white to-amber-50/50 dark:from-zinc-900 dark:via-zinc-900 dark:to-amber-950/20">
                <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                        form.isAllocated 
                            ? 'bg-emerald-600 text-white shadow-emerald-600/20' 
                            : form.isQueueCompleted 
                            ? 'bg-amber-500 text-white shadow-amber-500/20' 
                            : 'bg-gray-200 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                    }`}>
                        {form.isAllocated ? <ShieldCheck size={24} /> : <Coins size={24} />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-gray-100">
                                صف و تخصیص ارز
                            </h2>
                            {form.isAllocated ? (
                                <span className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                    <CheckCircle2 size={13} />
                                    تخصیص یافته
                                </span>
                            ) : form.isQueueCompleted ? (
                                <span className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                    <Clock size={13} />
                                    در صف تخصیص
                                </span>
                            ) : (
                                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400">
                                    در انتظار صف
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            پرونده: <span className="font-mono font-bold text-gray-700 dark:text-gray-300">{record.fileNumber || '---'}</span> | کالا: {record.goodsName}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                        type="button"
                        onClick={() => handleSubmit()}
                        disabled={isSaving}
                        className={`w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all ${
                            saveSuccess 
                                ? 'bg-emerald-600 text-white' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-95'
                        }`}
                    >
                        <Save size={16} />
                        <span>{isSaving ? 'در حال ذخیره...' : saveSuccess ? 'تغییرات ذخیره شد ✓' : 'ذخیره تغییرات'}</span>
                    </button>
                </div>
            </div>

            {/* TWO MERGED SECTIONS IN RESPONSIVE GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                
                {/* SECTION 1: در صف تخصیص ارز (Queue) */}
                <div className="glass-panel p-4 sm:p-5 rounded-2xl shadow-xs border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/15 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-amber-200 dark:border-amber-900/40">
                        <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold text-sm">
                                ۱
                            </span>
                            <div>
                                <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                    <Clock size={17} className="text-amber-600 dark:text-amber-400" />
                                    در صف تخصیص ارز
                                </h3>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">اطلاعات ثبت سفارش در صف تخصیص بانک مرکزی</p>
                            </div>
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-zinc-800/80 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800/60 shadow-2xs">
                            <input 
                                type="checkbox" 
                                checked={form.isQueueCompleted} 
                                onChange={e => setForm(prev => ({ ...prev, isQueueCompleted: e.target.checked }))} 
                                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-gray-800 dark:text-gray-200 select-none">
                                در صف قرار گرفت
                            </span>
                        </label>
                    </div>

                    <div className="space-y-3.5">
                        {/* Queue Entry Date */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                <Calendar size={13} className="text-amber-600" />
                                تاریخ ورود به صف تخصیص
                            </label>
                            <TradeDatePicker 
                                value={form.queueDate} 
                                onChange={val => setForm(prev => ({ ...prev, queueDate: val }))}
                                placeholder="۱۴۰۳/۰۱/۱۵"
                            />
                        </div>

                        {/* Waiting days badge */}
                        {queueDays !== null && (
                            <div className="bg-amber-100/70 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 p-2.5 rounded-xl text-xs flex items-center justify-between">
                                <span className="font-bold text-amber-900 dark:text-amber-200">
                                    {form.allocationDate ? 'مدت در صف تا صدور تخصیص:' : 'مدت انتظار در صف (تا امروز):'}
                                </span>
                                <span className="font-mono font-black text-amber-800 dark:text-amber-300 text-sm px-2 py-0.5 rounded-lg bg-amber-200/60 dark:bg-amber-900/60">
                                    {queueDays} روز
                                </span>
                            </div>
                        )}

                        {/* Currency Allocation Type */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 dark:text-gray-300">منشا / نوع تخصیص ارز</label>
                            <select 
                                className="w-full border border-gray-300 dark:border-zinc-700 rounded-xl p-2 text-xs sm:text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500"
                                value={form.currencyAllocationType}
                                onChange={e => setForm(prev => ({ ...prev, currencyAllocationType: e.target.value }))}
                            >
                                <option value="">انتخاب کنید...</option>
                                <option value="Bank">بانکی (نیما / تالار اول)</option>
                                <option value="Export">ارز حاصل از صادرات خود</option>
                                <option value="ExportOther">ارز حاصل از صادرات دیگران</option>
                                <option value="Free">متقاضی (آزاد)</option>
                            </select>
                        </div>

                        {/* Currency Rank & Priority */}
                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">نوع ارز (رتبه)</label>
                                <select 
                                    className="w-full border border-gray-300 dark:border-zinc-700 rounded-xl p-2 text-xs sm:text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100"
                                    value={form.allocationCurrencyRank || 'Type1'}
                                    onChange={e => setForm(prev => ({ ...prev, allocationCurrencyRank: e.target.value as any }))}
                                >
                                    <option value="Type1">نوع ۱</option>
                                    <option value="Type2">نوع ۲</option>
                                </select>
                            </div>

                            <div className="flex items-end">
                                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-white dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 w-full">
                                    <input 
                                        type="checkbox"
                                        checked={form.isPriority || false}
                                        onChange={e => setForm(prev => ({ ...prev, isPriority: e.target.checked }))}
                                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                                    />
                                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                        پرونده دارای اولویت
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 2: تخصیص یافته (Approved) */}
                <div className="glass-panel p-4 sm:p-5 rounded-2xl shadow-xs border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/15 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-emerald-200 dark:border-emerald-900/40">
                        <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm">
                                ۲
                            </span>
                            <div>
                                <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                    <CheckCircle2 size={17} className="text-emerald-600 dark:text-emerald-400" />
                                    تخصیص یافته
                                </h3>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">تایید نهایی و صدور مجوز تخصیص ارز</p>
                            </div>
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-zinc-800/80 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 shadow-2xs">
                            <input 
                                type="checkbox" 
                                checked={form.isAllocated} 
                                onChange={e => setForm(prev => ({ ...prev, isAllocated: e.target.checked }))} 
                                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 select-none">
                                تخصیص تایید شد
                            </span>
                        </label>
                    </div>

                    <div className="space-y-3.5">
                        {/* Allocation Code / Fish */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                <Hash size={13} className="text-emerald-600" />
                                شماره فیش / کد تخصیص ارز
                            </label>
                            <input 
                                type="text"
                                className="w-full border border-gray-300 dark:border-zinc-700 rounded-xl p-2 text-xs sm:text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 dir-ltr font-mono font-bold"
                                value={form.allocationCode}
                                onChange={e => setForm(prev => ({ ...prev, allocationCode: e.target.value }))}
                                placeholder="مثال: 987654321"
                            />
                        </div>

                        {/* Dates grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                    <Calendar size={13} className="text-emerald-600" />
                                    تاریخ تخصیص ارز
                                </label>
                                <TradeDatePicker 
                                    value={form.allocationDate} 
                                    onChange={val => {
                                        setForm(prev => {
                                            const updated = { ...prev, allocationDate: val };
                                            if (val && durationDaysInput) {
                                                const d = parseInt(durationDaysInput, 10);
                                                if (!isNaN(d) && d > 0) {
                                                    const newExpiry = addDaysToPersianDate(val, d);
                                                    if (newExpiry) updated.allocationExpiry = newExpiry;
                                                }
                                            }
                                            return updated;
                                        });
                                    }}
                                    placeholder="۱۴۰۳/۰۲/۰۱"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                    <Clock size={13} className="text-rose-500" />
                                    مهلت انقضای تخصیص
                                </label>
                                <TradeDatePicker 
                                    value={form.allocationExpiry} 
                                    onChange={val => setForm(prev => ({ ...prev, allocationExpiry: val }))}
                                    placeholder="۱۴۰۳/۰۳/۰۱"
                                />
                            </div>
                        </div>

                        {/* Quick Days Duration Option */}
                        <div className="bg-emerald-100/50 dark:bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <label className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                                    <Clock size={12} className="text-emerald-600" />
                                    <span>تنظیم مهلت بر اساس تعداد روز (از تاریخ تخصیص):</span>
                                </label>
                                <div className="flex items-center gap-1.5">
                                    <input 
                                        type="number" 
                                        min="1"
                                        max="365"
                                        value={durationDaysInput} 
                                        onChange={e => handleApplyDurationDays(e.target.value)}
                                        placeholder="مثلاً 30"
                                        className="w-20 px-2 py-1 text-center font-mono font-bold text-xs bg-white dark:bg-zinc-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-emerald-900 dark:text-emerald-100 focus:ring-2 focus:ring-emerald-500"
                                    />
                                    <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-bold">روز</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">مهلت‌های متداول:</span>
                                {[15, 30, 45, 60, 90, 180].map(days => (
                                    <button
                                        key={days}
                                        type="button"
                                        onClick={() => handleApplyDurationDays(days)}
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                            durationDaysInput === days.toString()
                                                ? 'bg-emerald-600 text-white shadow-2xs'
                                                : 'bg-white dark:bg-zinc-800 hover:bg-emerald-200/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80'
                                        }`}
                                    >
                                        {days} روز
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Expiry Badge */}
                        {expiryStatus && (
                            <div className={`p-2.5 rounded-xl text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border transition-all ${
                                expiryStatus.isExpired 
                                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200' 
                                    : expiryStatus.days <= 5 
                                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                                    : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                            }`}>
                                <span className="font-bold flex items-center gap-1.5 shrink-0">
                                    {expiryStatus.isExpired ? (
                                        <AlertTriangle size={15} className="text-rose-600 shrink-0"/>
                                    ) : expiryStatus.days <= 5 ? (
                                        <Clock size={15} className="text-amber-600 shrink-0"/>
                                    ) : (
                                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0"/>
                                    )}
                                    <span>وضعیت انقضا:</span>
                                </span>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {expiryStatus.totalDays !== null && expiryStatus.totalDays > 0 && (
                                        <span className="bg-white/80 dark:bg-zinc-800/80 px-2 py-0.5 rounded-md text-[11px] font-bold border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300">
                                            مهلت کل: {expiryStatus.totalDays} روز
                                        </span>
                                    )}
                                    <span className="font-mono font-black text-xs sm:text-sm">
                                        {expiryStatus.text}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* SECTION 3: هزینه‌ها و توضیحات مرحله تخصیص */}
            <div className="glass-panel p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200 dark:border-zinc-800 space-y-4">
                <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Coins size={18} className="text-blue-600" />
                    هزینه‌ها و توضیحات تخصیص ارز
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300">هزینه ریالی (ریال)</label>
                        <FormattedNumberInput 
                            className="w-full border border-gray-300 dark:border-zinc-700 rounded-xl p-2.5 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 font-bold"
                            value={form.costRial}
                            onChange={val => setForm(prev => ({ ...prev, costRial: val }))}
                            placeholder="۰"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300">هزینه ارزی ({form.currencyType})</label>
                        <FormattedNumberInput 
                            className="w-full border border-gray-300 dark:border-zinc-700 rounded-xl p-2.5 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 font-bold font-mono text-blue-600"
                            value={form.costCurrency}
                            onChange={val => setForm(prev => ({ ...prev, costCurrency: val }))}
                            placeholder="۰"
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                        <FileText size={13} className="text-gray-500" />
                        توضیحات و نکات تخصیص ارز
                    </label>
                    <textarea 
                        className="w-full border border-gray-300 dark:border-zinc-700 rounded-xl p-3 text-xs sm:text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 h-24 focus:ring-2 focus:ring-blue-500"
                        value={form.description}
                        onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="توضیحات مربوط به صف تخصیص، تاییدیه بانک مرکزی، مهلت‌ها و پیگیری‌ها..."
                    />
                </div>
            </div>

            {/* SECTION 4: فایل‌های ضمیمه */}
            <div className="glass-panel p-4 sm:p-5 rounded-2xl shadow-xs border border-gray-200 dark:border-zinc-800 space-y-3">
                <TradeAttachmentSection
                    attachments={form.attachments as any}
                    onAttachmentsChange={(updated: any) => setForm(prev => ({ ...prev, attachments: updated }))}
                    category="commercial/allocation"
                    title="پیوست‌ها و اسناد تخصیص و ثبت آماری (تصویر و PDF)"
                    description="فیش ثبت آماری، مجوز تخصیص بانک مرکزی، نامه‌های تمدید و فیش‌های کارمزد"
                />
            </div>

            {/* Bottom Save bar */}
            <div className="flex justify-end pt-2">
                <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all ${
                        saveSuccess 
                            ? 'bg-emerald-600 text-white shadow-emerald-600/20' 
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-95'
                    }`}
                >
                    <Save size={18} />
                    <span>{isSaving ? 'در حال ذخیره اطلاعات...' : saveSuccess ? 'تغییرات با موفقیت ذخیره شد ✓' : 'ذخیره نهایی اطلاعات تخصیص ارز'}</span>
                </button>
            </div>
        </div>
    );
};

export default AllocationTab;
