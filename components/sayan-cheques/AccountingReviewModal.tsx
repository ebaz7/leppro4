import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    Edit3, 
    X, 
    CreditCard, 
    Plus, 
    Trash2, 
    Building2, 
    Save, 
    Calendar,
    Send,
    ShieldCheck,
    AlertCircle,
    UserCheck,
    CheckCircle2
} from 'lucide-react';
import { ChequeItemInput, COMMON_IRANIAN_BANKS, toShamsiStr, fromShamsiStr, normalizeToAsciiDigits } from './ChequeItemRow';
import { MobileAttachmentUploader, ReceiptAttachment } from './MobileAttachmentUploader';
import { getEffectiveApiUrl, getAuthToken } from '../../services/apiService';
import * as jalaali from 'jalaali-js';
// @ts-ignore
import DatePicker from "react-multi-date-picker";
// @ts-ignore
import persian from "react-date-object/calendars/persian";
// @ts-ignore
import persian_fa from "react-date-object/locales/persian_fa";

interface SayanPerson {
    personCode: string;
    fullName: string;
    nationalId?: string;
    mobile?: string;
}

interface Props {
    receipt: any;
    fiscalYear: string;
    onClose: () => void;
    onSaveReview: (receiptId: string, updatedData: any, isApproveForCEO: boolean) => Promise<void>;
    actionLoading: string | null;
    onApproveByCeo?: (receiptId: string) => Promise<void>;
    currentUser?: any;
    isCeoOrAdmin?: boolean;
    isFinancialOrAdmin?: boolean;
}

const toPersianDigits = (num: string | number | undefined | null): string => {
    if (num === undefined || num === null || num === '') return '';
    return String(num).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
};

// Subcomponent for individual Cheque Row in Review/Edit Modal
interface ChequeRowProps {
    index: number;
    totalCount: number;
    item: ChequeItemInput;
    onChange: (idx: number, field: keyof ChequeItemInput, val: any) => void;
    onDelete: (idx: number) => void;
}

const ChequeReviewRow: React.FC<ChequeRowProps> = ({
    index,
    totalCount,
    item,
    onChange,
    onDelete
}) => {
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
        if (clean.length > 10) clean = clean.slice(0, 10);
        const digits = clean.replace(/\//g, '');
        let formatted = digits;
        if (digits.length > 4) formatted = digits.slice(0, 4) + '/' + digits.slice(4);
        if (digits.length > 6) formatted = digits.slice(0, 4) + '/' + digits.slice(4, 6) + '/' + digits.slice(6);
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

    const tomanAmount = item.amount ? Math.floor(Number(item.amount) / 10) : 0;

    return (
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200 dark:border-slate-700">
                <span className="font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-mono font-bold text-[11px]">
                        {toPersianDigits(index + 1)}
                    </span>
                    <span>برگ چک شماره {toPersianDigits(index + 1)}</span>
                </span>

                {totalCount > 1 && (
                    <button
                        type="button"
                        onClick={() => onDelete(index)}
                        className="text-rose-600 hover:text-rose-700 dark:text-rose-400 text-xs flex items-center gap-1 p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer transition-colors"
                        title="حذف این برگ چک"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف برگ</span>
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* 1. Cheque Number */}
                <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        شماره صیاد / سریال چک *
                    </label>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={item.chequeNumber}
                        onChange={(e) => onChange(index, 'chequeNumber', e.target.value)}
                        placeholder="۱۶ رقم صیادی یا سریال"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none focus:border-emerald-500 transition-colors"
                    />
                </div>

                {/* 2. Amount */}
                <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                        <span>مبلغ چک (ریال) *</span>
                        {tomanAmount > 0 && (
                            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                                {toPersianDigits(tomanAmount.toLocaleString('fa-IR'))} تومان
                            </span>
                        )}
                    </label>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={item.amount ? Number(item.amount).toLocaleString('en-US') : ''}
                        onChange={(e) => {
                            const clean = e.target.value.replace(/,/g, '').replace(/[^0-9]/g, '');
                            onChange(index, 'amount', clean === '' ? '' : Number(clean));
                        }}
                        placeholder="مبلغ به ریال"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 outline-none focus:border-emerald-500 transition-colors"
                    />
                </div>

                {/* 3. Due Date */}
                <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        تاریخ سررسید (شمسی) *
                    </label>
                    <div className="relative flex items-center">
                        <input
                            type="text"
                            inputMode="numeric"
                            value={shamsiInput}
                            onFocus={(e) => {
                                isTypingDateRef.current = true;
                                e.currentTarget.select();
                            }}
                            onBlur={handleDateBlur}
                            onChange={(e) => handleShamsiDateTyping(e.target.value)}
                            placeholder="۱۴۰۴/۰۸/۲۵"
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pr-3 pl-8 py-2 text-xs font-mono font-bold outline-none focus:border-emerald-500 transition-colors"
                        />
                        <div className="absolute left-1.5 top-1.5 z-10">
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
                                        if (greg) onChange(index, 'dueDate', greg);
                                    }
                                }}
                                render={(value: any, openCalendar: any) => (
                                    <button
                                        type="button"
                                        onClick={openCalendar}
                                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-600 transition-colors"
                                        title="انتخاب از تقویم شمسی"
                                    >
                                        <Calendar className="w-4 h-4 text-emerald-600" />
                                    </button>
                                )}
                                calendarPosition="bottom-right"
                            />
                        </div>
                    </div>
                </div>

                {/* 4. Bank */}
                <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        بانک صادرکننده
                    </label>
                    <select
                        value={item.bankName || 'سامان'}
                        onChange={(e) => onChange(index, 'bankName', e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold outline-none focus:border-emerald-500 transition-colors"
                    >
                        {COMMON_IRANIAN_BANKS.map(b => (
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                </div>

                {/* 5. In Name Of (در وجه / صاحب حساب) */}
                <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        در وجه / صاحب حساب
                    </label>
                    <input
                        type="text"
                        value={item.inNameOf || ''}
                        onChange={(e) => onChange(index, 'inNameOf', e.target.value)}
                        placeholder="نام صاحب حساب / در وجه"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 text-xs font-bold outline-none focus:border-emerald-500 transition-colors"
                    />
                </div>
            </div>
        </div>
    );
};

export const AccountingReviewModal: React.FC<Props> = ({
    receipt,
    fiscalYear,
    onClose,
    onSaveReview,
    actionLoading,
    onApproveByCeo,
    currentUser,
    isCeoOrAdmin,
    isFinancialOrAdmin
}) => {
    // Lock body scrolling when modal is open to prevent mobile background jump and dual-scroll
    useEffect(() => {
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    const [editPersonQuery, setEditPersonQuery] = useState(receipt.personName || '');
    const [editPerson, setEditPerson] = useState<SayanPerson | null>({
        personCode: String(receipt.personCode || ''),
        fullName: receipt.personName || ''
    });
    const [editPersonResults, setEditPersonResults] = useState<SayanPerson[]>([]);
    const [editReceiptNo, setEditReceiptNo] = useState(String(receipt.receiptNo || receipt.id || ''));
    const [editPoshtNomreh, setEditPoshtNomreh] = useState(String(receipt.poshtNomreh || ''));
    const [editDocDateShamsi, setEditDocDateShamsi] = useState(() => {
        return receipt.docDateShamsi || toShamsiStr(receipt.docDate || receipt.createdAt) || '';
    });
    const [editDescription, setEditDescription] = useState(receipt.description || '');
    const [accountingNote, setAccountingNote] = useState(receipt.accountingReview?.note || '');
    const [editCashboxCode, setEditCashboxCode] = useState(receipt.cashboxCode || '11001');
    const [cashboxes, setCashboxes] = useState<Array<{ code: string; title: string }>>([
        { code: '11001', title: 'صندوق دفتر' },
        { code: '11002', title: 'صندوق سکه و کارت هدیه' },
        { code: '11003', title: 'صندوق آقای مقدم' },
        { code: '11004', title: 'صندوق ارزی' },
        { code: '11005', title: 'صندوق چک های برگشتی' }
    ]);

    // Attachments state (images, mobile camera shots & PDF documents)
    const [editAttachments, setEditAttachments] = useState<ReceiptAttachment[]>(() => {
        if (Array.isArray(receipt.attachments)) {
            return receipt.attachments;
        }
        return [];
    });

    useEffect(() => {
        const fetchBox = async () => {
            try {
                const token = getAuthToken();
                const headers: Record<string, string> = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const res = await fetch(getEffectiveApiUrl('/api/sayan/cheque-receipts/cashboxes'), { headers });
                const data = await res.json();
                if (data.success && Array.isArray(data.cashboxes) && data.cashboxes.length > 0) {
                    setCashboxes(data.cashboxes);
                }
            } catch (err) {
                // silent
            }
        };
        fetchBox();
    }, []);

    const [editCheques, setEditCheques] = useState<ChequeItemInput[]>(() => {
        if (receipt.cheques && receipt.cheques.length > 0) {
            return receipt.cheques.map((c: any, idx: number) => ({
                id: c.chequeId || c.rowId || String(idx + 1),
                chequeNumber: c.chequeNumber || '',
                amount: c.amount || '',
                dueDate: c.dueDate ? c.dueDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
                bankName: c.bankName || 'سامان',
                inNameOf: c.inNameOf || receipt.personName || '',
                accountNo: c.accountNo || '',
                description: c.description || ''
            }));
        }
        return [
            {
                id: '1',
                chequeNumber: '',
                amount: receipt.totalAmount || '',
                dueDate: new Date().toISOString().slice(0, 10),
                bankName: 'سامان',
                inNameOf: receipt.personName || '',
                accountNo: '',
                description: ''
            }
        ];
    });

    // Search persons for accounting editing
    useEffect(() => {
        if (!editPersonQuery || editPersonQuery.trim().length === 0) {
            setEditPersonResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const token = getAuthToken();
                const headers: Record<string, string> = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const res = await fetch(
                    getEffectiveApiUrl(`/api/sayan/cheque-receipts/persons?query=${encodeURIComponent(editPersonQuery.trim())}&fiscalYear=${fiscalYear}`),
                    { headers }
                );
                const data = await res.json();
                if (data.success && Array.isArray(data.persons)) {
                    setEditPersonResults(data.persons);
                }
            } catch (err) {
                // silent
            }
        }, 200);
        return () => clearTimeout(timer);
    }, [editPersonQuery, fiscalYear]);

    const editTotalAmount = editCheques.reduce((sum, ch) => sum + (Number(ch.amount) || 0), 0);

    const handleChequeFieldChange = (idx: number, field: keyof ChequeItemInput, val: any) => {
        setEditCheques(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
    };

    const handleChequeDelete = (idx: number) => {
        setEditCheques(prev => prev.filter((_, i) => i !== idx));
    };

    const buildPayload = () => {
        const finalPersonCode = editPerson ? editPerson.personCode : receipt.personCode;
        const finalPersonName = editPerson ? editPerson.fullName : receipt.personName;

        if (!finalPersonCode) {
            alert('انتخاب طرف حساب معتبر از سیستم سایان الزامی است.');
            return null;
        }

        return {
            receiptNo: editReceiptNo.trim(),
            personCode: finalPersonCode,
            personName: finalPersonName,
            poshtNomreh: editPoshtNomreh,
            cashboxCode: editCashboxCode,
            docDate: editDocDateShamsi.trim(),
            docDateShamsi: editDocDateShamsi.trim(),
            description: editDescription,
            totalAmount: editTotalAmount,
            cheques: editCheques.map((ch, idx) => ({
                chequeNumber: ch.chequeNumber,
                amount: Number(ch.amount) || 0,
                dueDate: ch.dueDate,
                bankName: ch.bankName,
                inNameOf: ch.inNameOf || finalPersonName,
                poshtNomreh: editPoshtNomreh,
                rowSeq: idx + 1,
                description: ch.description
            })),
            attachments: editAttachments,
            accountingNote
        };
    };

    const handleSave = async (isApproveForCEO: boolean) => {
        const payload = buildPayload();
        if (!payload) return;
        await onSaveReview(receipt.id, payload, isApproveForCEO);
    };

    const handleSaveAndCeoApprove = async () => {
        if (!onApproveByCeo) return;
        const proceed = window.confirm('آیا از ذخیره تغییرات و صدور مستقیم سند در دیتابیس ERP سایان اطمینان دارید؟');
        if (!proceed) return;

        const payload = buildPayload();
        if (!payload) return;

        // Save changes first
        await onSaveReview(receipt.id, payload, false);
        // Then trigger CEO approval
        await onApproveByCeo(receipt.id);
    };

    // Lock body scrolling when modal is open to prevent background jump without resetting #main-scroll-container position
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const originalBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = originalBodyOverflow;
        };
    }, []);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div 
            className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-sm overflow-hidden select-text"
            dir="rtl"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            {/* Modal Container: Centered modal card */}
            <div 
                className="bg-white dark:bg-slate-900 w-full sm:max-w-5xl h-[94vh] sm:h-auto sm:max-h-[88vh] sm:rounded-3xl rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-scale-in border border-slate-200 dark:border-slate-800 shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                
                {/* Header (Always Pinned Top) */}
                <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-800/80 backdrop-blur-sm flex items-center justify-between">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                            <Edit3 className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                                <span className="truncate">ویرایش اطلاعات رسید چک</span>
                                <span className="font-mono text-xs px-2 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 font-bold shrink-0">
                                    #{toPersianDigits(receipt.receiptNo || receipt.id)}
                                </span>
                            </h3>
                            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                طرف حساب: {receipt.personName || 'نامشخص'} • جمع: {toPersianDigits(editTotalAmount.toLocaleString('fa-IR'))} ریال
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 sm:p-2.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer shrink-0"
                        title="بستن"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body Form (Smooth Momentum Scrolling Isolated Container) */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-auto touch-pan-y p-3.5 sm:p-6 space-y-4 sm:space-y-5 -webkit-overflow-scrolling-touch">
                    
                    {/* General Receipt Metadata Panel */}
                    <div className="bg-slate-50/90 dark:bg-slate-800/40 p-3.5 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3.5">
                        <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/60">
                            <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                            <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
                                مشخصات طرف حساب، صندوق و سربرگ رسید
                            </h4>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            {/* Person Selection */}
                            <div className="relative sm:col-span-2 lg:col-span-1">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    طرف حساب سایان (پرداخت کننده) *
                                </label>
                                <input
                                    type="text"
                                    value={editPersonQuery}
                                    onChange={(e) => {
                                        setEditPersonQuery(e.target.value);
                                        if (editPerson && editPerson.fullName !== e.target.value) {
                                            setEditPerson(null);
                                        }
                                    }}
                                    placeholder="جستجوی کد یا نام طرف حساب..."
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-amber-500 transition-colors"
                                />
                                {editPerson && (
                                    <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 font-bold">
                                        <span className="truncate">انتخاب شد: {editPerson.fullName}</span>
                                        <span className="font-mono shrink-0 mr-1">کد: {toPersianDigits(editPerson.personCode)}</span>
                                    </div>
                                )}

                                {editPersonResults.length > 0 && !editPerson && (
                                    <div className="absolute top-full right-0 left-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-30 max-h-48 overflow-y-auto">
                                        {editPersonResults.map(p => (
                                            <div
                                                key={p.personCode}
                                                onClick={() => {
                                                    setEditPerson(p);
                                                    setEditPersonQuery(p.fullName);
                                                    setEditPersonResults([]);
                                                    setEditCheques(prev => prev.map(ch => ({ ...ch, inNameOf: p.fullName })));
                                                }}
                                                className="p-2.5 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0 flex items-center justify-between text-xs"
                                            >
                                                <span className="font-bold text-slate-800 dark:text-slate-200">{p.fullName}</span>
                                                <span className="font-mono text-slate-400 text-[11px]">کد: {toPersianDigits(p.personCode)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Receipt Number */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    شماره رسید *
                                </label>
                                <input
                                    type="text"
                                    value={editReceiptNo}
                                    onChange={(e) => setEditReceiptNo(e.target.value)}
                                    placeholder="مثال: ۱۳۹۹"
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-blue-600 dark:text-blue-400 outline-none focus:border-blue-500"
                                />
                            </div>

                            {/* Posht Nomreh */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    پشت‌نمره رسید در سایان *
                                </label>
                                <input
                                    type="text"
                                    value={editPoshtNomreh}
                                    onChange={(e) => setEditPoshtNomreh(e.target.value)}
                                    placeholder="مثال: ۱۰۲۴"
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none focus:border-amber-500"
                                />
                            </div>

                            {/* Receipt Date (Shamsi) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    تاریخ ثبت رسید (شمسی) *
                                </label>
                                <div className="relative flex items-center">
                                    <input
                                        type="text"
                                        value={editDocDateShamsi}
                                        onChange={(e) => setEditDocDateShamsi(normalizeToAsciiDigits(e.target.value))}
                                        placeholder="۱۴۰۴/۰۸/۲۵"
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pr-3 pl-8 py-2 text-xs font-mono font-bold outline-none focus:border-amber-500 transition-colors"
                                    />
                                    <div className="absolute left-1.5 top-1.5 z-10">
                                        <DatePicker
                                            calendar={persian}
                                            locale={persian_fa}
                                            value={editDocDateShamsi || undefined}
                                            onChange={(date: any) => {
                                                if (!date) return;
                                                const rawVal = date?.format?.('YYYY/MM/DD');
                                                const ascii = normalizeToAsciiDigits(rawVal);
                                                if (ascii) setEditDocDateShamsi(ascii);
                                            }}
                                            render={(value: any, openCalendar: any) => (
                                                <button
                                                    type="button"
                                                    onClick={openCalendar}
                                                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-600 transition-colors"
                                                    title="انتخاب تاریخ رسید از تقویم"
                                                >
                                                    <Calendar className="w-4 h-4 text-amber-600" />
                                                </button>
                                            )}
                                            calendarPosition="bottom-right"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Cashbox Selection */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    صندوق دریافت کننده *
                                </label>
                                <select
                                    value={editCashboxCode}
                                    onChange={(e) => setEditCashboxCode(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-amber-500"
                                >
                                    {cashboxes.map(cb => (
                                        <option key={cb.code} value={cb.code}>
                                            {cb.title} (کد: {cb.code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                شرح و بابت رسید
                            </label>
                            <input
                                type="text"
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                placeholder="شرح بابت سند رسید چک در سایان..."
                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>

                    {/* Cheque Rows Panel */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                                <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
                                    اقلام و برگ‌های چک ({toPersianDigits(editCheques.length)} برگ)
                                </h4>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setEditCheques(prev => [
                                        ...prev,
                                        {
                                            id: String(Date.now()),
                                            chequeNumber: '',
                                            amount: '',
                                            dueDate: new Date().toISOString().slice(0, 10),
                                            bankName: 'سامان',
                                            inNameOf: editPerson ? editPerson.fullName : receipt.personName || '',
                                            accountNo: '',
                                            description: ''
                                        }
                                    ]);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span>+ برگ چک جدید</span>
                            </button>
                        </div>

                        <div className="space-y-3">
                            {editCheques.map((ch, idx) => (
                                <ChequeReviewRow
                                    key={ch.id || idx}
                                    index={idx}
                                    totalCount={editCheques.length}
                                    item={ch}
                                    onChange={handleChequeFieldChange}
                                    onDelete={handleChequeDelete}
                                />
                            ))}
                        </div>

                        {/* Total Amount Summary */}
                        <div className="p-3 sm:p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs sm:text-sm">
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                                جمع کل مبلغ چک‌های این رسید:
                            </span>
                            <span className="font-mono font-black text-sm sm:text-base text-emerald-600 dark:text-emerald-400">
                                {toPersianDigits(editTotalAmount.toLocaleString('fa-IR'))} <span className="text-xs font-normal">ریال</span>
                            </span>
                        </div>
                    </div>

                    {/* Mobile-Optimized File & Photo Attachments Component */}
                    <div className="bg-slate-50/90 dark:bg-slate-800/40 p-3.5 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                        <MobileAttachmentUploader
                            attachments={editAttachments}
                            onChange={setEditAttachments}
                            label="تصاویر و اسناد پیوست چک (بهینه شده برای گوشی و کامپیوتر)"
                            helperText="می‌توانید مستقیماً با دوربین موبایل از چک عکس بگیرید یا تصاویر را انتخاب نمایید."
                        />
                    </div>

                    {/* Accounting Review Note */}
                    <div className="space-y-1.5 pb-2">
                        <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                            یادداشت و توضیحات کارشناس
                        </label>
                        <input
                            type="text"
                            value={accountingNote}
                            onChange={(e) => setAccountingNote(e.target.value)}
                            placeholder="توضیحات و یادداشت‌های مربوط به این ویرایش..."
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-medium outline-none focus:border-amber-500"
                        />
                    </div>
                </div>

                {/* Footer Actions (Always Pinned at Bottom with Safe Area) */}
                <div className="shrink-0 p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 shadow-lg pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                        
                        {/* Cancel Button */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="order-last sm:order-first px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs sm:text-sm transition-colors cursor-pointer text-center"
                        >
                            انصراف
                        </button>

                        {/* Action Buttons: Stack on Mobile, Flex on Desktop */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            
                            {/* Save Draft / Changes (Current Stage) */}
                            <button
                                type="button"
                                onClick={() => handleSave(false)}
                                disabled={actionLoading === 'accounting_review'}
                                className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                            >
                                <Save className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                <span>{actionLoading === 'accounting_review' ? 'در حال ذخیره...' : 'ذخیره تغییرات رسید'}</span>
                            </button>

                            {/* Step 1 Approval: Confirm and Send to CEO */}
                            {receipt.status === 'PENDING_ACCOUNTING' && (
                                <button
                                    type="button"
                                    onClick={() => handleSave(true)}
                                    disabled={actionLoading === 'accounting_review'}
                                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-500/25 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                                >
                                    <Send className="w-4 h-4" />
                                    <span>تایید و ارسال به مدیرعامل (مرحله ۲)</span>
                                </button>
                            )}

                            {/* Step 2 Approval: Direct CEO approval & Sayan ERP registration */}
                            {(receipt.status === 'PENDING_CEO' || receipt.sayanError) && onApproveByCeo && (isCeoOrAdmin !== false) && (
                                <button
                                    type="button"
                                    onClick={handleSaveAndCeoApprove}
                                    disabled={actionLoading === receipt.id || actionLoading === 'accounting_review'}
                                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                                >
                                    <ShieldCheck className="w-4 h-4" />
                                    <span>تایید نهایی و صدور سند در سایان</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>,
        document.body
    );
};
