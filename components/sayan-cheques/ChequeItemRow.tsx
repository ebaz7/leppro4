import React, { useState, useRef, useEffect } from 'react';
import { CreditCard, Trash2, Calendar, Building2, User, ChevronDown, Check, Plus, Copy, Hash, Sparkles } from 'lucide-react';
import * as jalaali from 'jalaali-js';
// @ts-ignore
import DatePicker from "react-multi-date-picker";
// @ts-ignore
import persian from "react-date-object/calendars/persian";
// @ts-ignore
import persian_fa from "react-date-object/locales/persian_fa";

export interface ChequeItemInput {
    id: string;
    chequeNumber: string;
    amount: number | '';
    dueDate: string; // ISO date or YYYY-MM-DD
    bankName: string;
    inNameOf: string;
    accountNo?: string;
    description?: string;
}

export const COMMON_IRANIAN_BANKS = [
    'سامان',
    'ملی ایران',
    'ملت',
    'صادرات ایران',
    'تجارت',
    'سپه',
    'پاسارگاد',
    'پارسیان',
    'کشاورزی',
    'مسکن',
    'رفاه کارگران',
    'آینده',
    'شهر',
    'سینا',
    'کارآفرین',
    'خاورمیانه',
    'دی',
    'انصار',
    'سرمایه',
    'گردشگری',
    'صنعت و معدن',
    'توسعه صادرات',
    'قرض‌الحسنه مهر ایران',
    'قرض‌الحسنه رسالت',
    'ایران زمین',
    'پست بانک ایران',
    'موسسه اعتباری نور',
    'موسسه اعتباری ملل',
    'موسسه اعتباری کاسپین'
];

interface Props {
    index: number;
    totalRows: number;
    item: ChequeItemInput;
    defaultInNameOf: string;
    onChange: (index: number, field: keyof ChequeItemInput, value: any) => void;
    onDelete: (index: number) => void;
    onEnterNext: (currentIndex: number, currentField: string) => void;
    onArrowNavigate?: (currentIndex: number, currentField: string, direction: 'up' | 'down' | 'left' | 'right') => void;
    onDuplicateRow?: (index: number) => void;
    onAddRowBelow?: () => void;
}

const toPersianDigits = (num: string | number | undefined | null): string => {
    if (num === undefined || num === null || num === '') return '';
    return String(num).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
};

export const normalizeToAsciiDigits = (str: string | number | undefined | null): string => {
    if (str === undefined || str === null) return '';
    return String(str)
        .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
        .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
};

export const toShamsiStr = (dateStr?: string | Date | null): string => {
    if (!dateStr) return '';
    try {
        if (typeof dateStr === 'string') {
            const normalized = normalizeToAsciiDigits(dateStr).trim();
            const match = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
            if (match) {
                const y = parseInt(match[1], 10);
                if (y >= 1300 && y <= 1500) {
                    return `${match[1]}/${match[2].padStart(2, '0')}/${match[3].padStart(2, '0')}`;
                }
            }
        }
        const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
        if (isNaN(d.getTime())) return String(dateStr);
        const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const mm = String(j.jm).padStart(2, '0');
        const dd = String(j.jd).padStart(2, '0');
        return `${j.jy}/${mm}/${dd}`;
    } catch {
        return typeof dateStr === 'string' ? dateStr : '';
    }
};

export const fromShamsiStr = (shamsiStr?: string | null): string => {
    if (!shamsiStr) return '';
    const normalized = normalizeToAsciiDigits(shamsiStr);
    const clean = normalized.replace(/[^0-9]/g, '/');
    const parts = clean.split('/').filter(Boolean);
    if (parts.length === 3) {
        const jy = parseInt(parts[0], 10);
        const jm = parseInt(parts[1], 10);
        const jd = parseInt(parts[2], 10);
        if (jy >= 1300 && jy <= 1500 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31) {
            const g = jalaali.toGregorian(jy, jm, jd);
            const gm = String(g.gm).padStart(2, '0');
            const gd = String(g.gd).padStart(2, '0');
            return `${g.gy}-${gm}-${gd}`;
        }
    }
    return '';
};

export const ChequeItemRow: React.FC<Props> = ({
    index,
    totalRows,
    item,
    defaultInNameOf,
    onChange,
    onDelete,
    onEnterNext,
    onArrowNavigate,
    onDuplicateRow,
    onAddRowBelow
}) => {
    // Bank autocomplete state
    const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
    const [highlightedBankIdx, setHighlightedBankIdx] = useState(0);
    const bankDropdownRef = useRef<HTMLDivElement>(null);
    const bankInputRef = useRef<HTMLInputElement>(null);

    // Shamsi Date editing state
    const [shamsiInput, setShamsiInput] = useState(() => toShamsiStr(item.dueDate));
    const isTypingDateRef = useRef(false);

    const safeShamsiValue = React.useMemo(() => {
        return toShamsiStr(item.dueDate) || undefined;
    }, [item.dueDate]);

    useEffect(() => {
        if (isTypingDateRef.current) return;
        const currentItemShamsi = toShamsiStr(item.dueDate);
        const currentInputGreg = fromShamsiStr(shamsiInput);
        if (currentInputGreg !== item.dueDate && shamsiInput !== currentItemShamsi) {
            setShamsiInput(currentItemShamsi);
        }
    }, [item.dueDate]);

    const handleShamsiDateTyping = (val: string) => {
        isTypingDateRef.current = true;
        const normalized = normalizeToAsciiDigits(val);
        let clean = normalized.replace(/[^0-9/]/g, '');
        if (clean.length > 10) {
            clean = clean.slice(0, 10);
        }
        const digits = clean.replace(/\//g, '');
        let formatted = digits;
        if (digits.length > 4) {
            formatted = digits.slice(0, 4) + '/' + digits.slice(4);
        }
        if (digits.length > 6) {
            formatted = digits.slice(0, 4) + '/' + digits.slice(4, 6) + '/' + digits.slice(6);
        }
        setShamsiInput(formatted);
        const parts = formatted.split('/');
        if (parts.length === 3) {
            const jy = parseInt(parts[0], 10);
            const jm = parseInt(parts[1], 10);
            const jd = parseInt(parts[2], 10);
            if (jy >= 1300 && jy <= 1500 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= 31) {
                const g = jalaali.toGregorian(jy, jm, jd);
                const gm = String(g.gm).padStart(2, '0');
                const gd = String(g.gd).padStart(2, '0');
                onChange(index, 'dueDate', `${g.gy}-${gm}-${gd}`);
            }
        }
    };

    const handleDateBlur = () => {
        isTypingDateRef.current = false;
        const greg = fromShamsiStr(shamsiInput);
        if (greg) {
            onChange(index, 'dueDate', greg);
            setShamsiInput(toShamsiStr(greg));
        } else {
            setShamsiInput(toShamsiStr(item.dueDate));
        }
    };

    // Filtered banks based on input
    const filteredBanks = COMMON_IRANIAN_BANKS.filter(b =>
        b.toLowerCase().includes((item.bankName || '').trim().toLowerCase())
    );

    // Close bank dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) {
                setBankDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectBank = (bank: string) => {
        onChange(index, 'bankName', bank);
        setBankDropdownOpen(false);
        // Move to inNameOf
        onEnterNext(index, 'bankName');
    };

    const handleFieldKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>,
        fieldName: string
    ) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.ctrlKey && onAddRowBelow) {
                onAddRowBelow();
            } else {
                onEnterNext(index, fieldName);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onArrowNavigate?.(index, fieldName, 'down');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            onArrowNavigate?.(index, fieldName, 'up');
        } else if (e.key === 'ArrowLeft') {
            // In RTL, left arrow moves to next field
            const target = e.currentTarget;
            const isAtEnd = target.selectionStart === target.value.length;
            if (isAtEnd || target.selectionStart === null) {
                e.preventDefault();
                onArrowNavigate?.(index, fieldName, 'left');
            }
        } else if (e.key === 'ArrowRight') {
            // In RTL, right arrow moves to previous field
            const target = e.currentTarget;
            const isAtStart = target.selectionStart === 0 && target.selectionEnd === 0;
            if (isAtStart || target.selectionStart === null) {
                e.preventDefault();
                onArrowNavigate?.(index, fieldName, 'right');
            }
        }
    };

    const handleBankKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (bankDropdownOpen && filteredBanks.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedBankIdx(prev => Math.min(prev + 1, filteredBanks.length - 1));
                return;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedBankIdx(prev => Math.max(prev - 1, 0));
                return;
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (highlightedBankIdx >= 0 && filteredBanks[highlightedBankIdx]) {
                    handleSelectBank(filteredBanks[highlightedBankIdx]);
                } else {
                    onEnterNext(index, 'bankName');
                }
                return;
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setBankDropdownOpen(false);
                return;
            }
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            onEnterNext(index, 'bankName');
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onArrowNavigate?.(index, 'bankName', 'down');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            onArrowNavigate?.(index, 'bankName', 'up');
        } else if (e.key === 'ArrowLeft') {
            const target = e.currentTarget;
            const isAtEnd = target.selectionStart === target.value.length;
            if (isAtEnd) {
                e.preventDefault();
                setBankDropdownOpen(false);
                onArrowNavigate?.(index, 'bankName', 'left');
            }
        } else if (e.key === 'ArrowRight') {
            const target = e.currentTarget;
            const isAtStart = target.selectionStart === 0 && target.selectionEnd === 0;
            if (isAtStart) {
                e.preventDefault();
                setBankDropdownOpen(false);
                onArrowNavigate?.(index, 'bankName', 'right');
            }
        }
    };

    const handleQuickAddMonths = (monthsToAdd: number) => {
        const base = new Date();
        base.setMonth(base.getMonth() + monthsToAdd);
        const iso = base.toISOString().slice(0, 10);
        onChange(index, 'dueDate', iso);
    };

    return (
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3 relative group transition-all duration-200 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/15 focus-within:shadow-md">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2.5 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-emerald-500 text-white text-xs font-black font-mono flex items-center justify-center shadow-xs">
                        {toPersianDigits(index + 1)}
                    </span>
                    <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                        برگه چک شماره {toPersianDigits(item.chequeNumber || (index + 1))}
                    </span>
                    {item.amount ? (
                        <span className="font-mono font-black text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                            {toPersianDigits(Number(item.amount).toLocaleString('fa-IR'))} ریال
                        </span>
                    ) : null}
                    {item.inNameOf ? (
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                            صادرکننده: {item.inNameOf}
                        </span>
                    ) : null}
                </div>

                <div className="flex items-center gap-2">
                    {/* Quick Shamsi Month Buttons */}
                    <div className="hidden sm:flex items-center gap-1 text-[11px]">
                        <span className="text-slate-400 ml-1">سررسید سریع:</span>
                        {[1, 2, 3, 4, 6].map(m => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => handleQuickAddMonths(m)}
                                className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 font-bold transition-colors"
                            >
                                {toPersianDigits(m)} ماهه
                            </button>
                        ))}
                    </div>

                    {/* Quick duplicate row action */}
                    {onDuplicateRow && (
                        <button
                            type="button"
                            onClick={() => onDuplicateRow(index)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors flex items-center gap-1 text-xs font-bold"
                            title="تکثیر مشخصات این چک در ردیف جدید"
                        >
                            <Copy className="w-3.5 h-3.5" />
                            <span className="hidden md:inline">تکثیر</span>
                        </button>
                    )}

                    {/* Quick Add Row Button */}
                    {onAddRowBelow && (
                        <button
                            type="button"
                            onClick={onAddRowBelow}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors flex items-center gap-1 text-xs font-bold"
                            title="افزودن چک جدید"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="hidden md:inline">+ چک جدید</span>
                        </button>
                    )}

                    {totalRows > 1 && (
                        <button
                            type="button"
                            onClick={() => onDelete(index)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="حذف این ردیف چک"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                {/* 1. Cheque Number */}
                <div>
                    <label className="block text-xs font-black text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1">
                        <span>شماره چک (صیادی)</span>
                        <span className="text-rose-500">*</span>
                    </label>
                    <input
                        id={`cheque-${index}-number`}
                        type="text"
                        inputMode="numeric"
                        value={item.chequeNumber}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => onChange(index, 'chequeNumber', e.target.value)}
                        onKeyDown={(e) => handleFieldKeyDown(e, 'number')}
                        placeholder="مثال: ۱۲۳۴۵۶۷۸"
                        className="w-full bg-slate-50 dark:bg-slate-800/80 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono font-black text-slate-900 dark:text-slate-100 outline-none caret-emerald-600 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-emerald-500/20 transition-all"
                    />
                </div>

                {/* 2. Amount */}
                <div className="lg:col-span-1">
                    <label className="block text-xs font-black text-slate-800 dark:text-slate-200 mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                            <span>مبلغ چک (ریال)</span>
                            <span className="text-rose-500">*</span>
                        </span>
                        {item.amount ? (
                            <span className="text-[10px] font-mono text-emerald-600 font-bold">
                                {toPersianDigits(Math.floor(Number(item.amount) / 10).toLocaleString('fa-IR'))} تومان
                            </span>
                        ) : null}
                    </label>
                    <input
                        id={`cheque-${index}-amount`}
                        type="text"
                        inputMode="numeric"
                        value={item.amount ? Number(item.amount).toLocaleString('en-US') : ''}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => {
                            const clean = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '');
                            onChange(index, 'amount', clean ? Number(clean) : '');
                        }}
                        onKeyDown={(e) => handleFieldKeyDown(e, 'amount')}
                        placeholder="مبلغ به ریال"
                        className="w-full bg-slate-50 dark:bg-slate-800/80 border-2 border-emerald-300 dark:border-emerald-800 rounded-xl px-3 py-2.5 text-base font-mono font-black text-emerald-700 dark:text-emerald-400 outline-none caret-emerald-600 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-emerald-500/25 transition-all shadow-xs"
                    />
                </div>

                {/* 3. Due Date (Shamsi) */}
                <div>
                    <label className="block text-xs font-black text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1">
                        <span>تاریخ سررسید (شمسی)</span>
                        <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative flex items-center">
                        <input
                            id={`cheque-${index}-dueDate`}
                            type="text"
                            inputMode="numeric"
                            value={shamsiInput}
                            onFocus={(e) => {
                                isTypingDateRef.current = true;
                                e.currentTarget.select();
                            }}
                            onBlur={handleDateBlur}
                            onChange={(e) => handleShamsiDateTyping(e.target.value)}
                            onKeyDown={(e) => handleFieldKeyDown(e, 'dueDate')}
                            placeholder="۱۴۰۵/۰۶/۱۸"
                            className="w-full bg-slate-50 dark:bg-slate-800/80 border-2 border-slate-200 dark:border-slate-700 rounded-xl pr-3 pl-8 py-2.5 text-sm font-mono font-black text-slate-900 dark:text-slate-100 outline-none caret-emerald-600 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-emerald-500/20 transition-all"
                        />
                        <div className="absolute left-2 top-2 z-10">
                            <DatePicker
                                calendar={persian}
                                locale={persian_fa}
                                value={safeShamsiValue}
                                onChange={(date: any) => {
                                    if (!date) return;
                                    isTypingDateRef.current = false;
                                    const rawVal = date?.format?.('YYYY/MM/DD');
                                    const ascii = normalizeToAsciiDigits(rawVal);
                                    if (ascii) {
                                        setShamsiInput(ascii);
                                        const greg = fromShamsiStr(ascii);
                                        if (greg) {
                                            onChange(index, 'dueDate', greg);
                                        }
                                    }
                                }}
                                render={(value: any, openCalendar: any) => (
                                    <button
                                        type="button"
                                        onClick={openCalendar}
                                        className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors"
                                        title="انتخاب از تقویم"
                                    >
                                        <Calendar className="w-4 h-4 text-emerald-600" />
                                    </button>
                                )}
                                calendarPosition="bottom-right"
                            />
                        </div>
                    </div>
                </div>

                {/* 4. Bank Name with Autocomplete */}
                <div className="relative" ref={bankDropdownRef}>
                    <label className="block text-xs font-black text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1">
                        <span>نام بانک</span>
                        <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                        <input
                            ref={bankInputRef}
                            id={`cheque-${index}-bankName`}
                            type="text"
                            value={item.bankName}
                            onFocus={(e) => {
                                e.currentTarget.select();
                                setBankDropdownOpen(true);
                            }}
                            onChange={(e) => {
                                onChange(index, 'bankName', e.target.value);
                                setBankDropdownOpen(true);
                                setHighlightedBankIdx(0);
                            }}
                            onKeyDown={handleBankKeyDown}
                            placeholder="نام بانک"
                            className="w-full bg-slate-50 dark:bg-slate-800/80 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none caret-emerald-600 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-emerald-500/20 transition-all"
                        />
                        <button
                            type="button"
                            onClick={() => {
                                setBankDropdownOpen(!bankDropdownOpen);
                                bankInputRef.current?.focus();
                                bankInputRef.current?.select();
                            }}
                            className="absolute left-2 top-3 text-slate-400 hover:text-slate-600"
                        >
                            <ChevronDown className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Bank Autocomplete Dropdown */}
                    {bankDropdownOpen && filteredBanks.length > 0 && (
                        <div className="absolute top-full right-0 left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-40 max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/50">
                            {filteredBanks.map((bank, bIdx) => (
                                <button
                                    key={bank}
                                    type="button"
                                    onClick={() => handleSelectBank(bank)}
                                    className={`w-full text-right px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                                        bIdx === highlightedBankIdx
                                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold'
                                            : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                                    }`}
                                >
                                    <span>بانک {bank}</span>
                                    {item.bankName === bank && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* 5. In Name Of (صاحب حساب / در وجه / صادرکننده چک) */}
                <div>
                    <label className="block text-xs font-black text-slate-800 dark:text-slate-200 mb-1">
                        صاحب حساب / در وجه (صادرکننده)
                    </label>
                    <input
                        id={`cheque-${index}-inNameOf`}
                        type="text"
                        value={item.inNameOf !== undefined && item.inNameOf !== '' ? item.inNameOf : defaultInNameOf}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => onChange(index, 'inNameOf', e.target.value)}
                        onKeyDown={(e) => handleFieldKeyDown(e, 'inNameOf')}
                        placeholder="نام صادرکننده / در وجه (صاحب حساب)"
                        className="w-full bg-slate-50 dark:bg-slate-800/80 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none caret-emerald-600 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-emerald-500/20 transition-all"
                    />
                </div>

                {/* 6. Description / Note for row */}
                <div>
                    <label className="block text-xs font-black text-slate-800 dark:text-slate-200 mb-1">
                        بابت / توضیحات چک
                    </label>
                    <input
                        id={`cheque-${index}-description`}
                        type="text"
                        value={item.description || ''}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => onChange(index, 'description', e.target.value)}
                        onKeyDown={(e) => handleFieldKeyDown(e, 'description')}
                        placeholder="مثال: قسط ۲ فاکتور ۴۰۵"
                        className="w-full bg-slate-50 dark:bg-slate-800/80 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm outline-none caret-emerald-600 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-emerald-500/20 transition-all"
                    />
                </div>
            </div>
        </div>
    );
};
