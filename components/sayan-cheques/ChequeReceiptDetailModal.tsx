import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Zap, FileText, X, CheckCircle2, AlertCircle, Clock, ShieldCheck,
    CreditCard, Building2, User, Hash, Layers, Eye, Download, Printer,
    ArrowRight, Check, Sparkles, CornerUpLeft, Edit3, Trash2, MessageSquare, Send,
    Upload, Plus, Loader2
} from 'lucide-react';
import * as jalaali from 'jalaali-js';
import { UserRole } from '../../types';
import { shareElementToChat, openSendToChat } from '../../services/chatShareService';
import { FileViewerModal } from '../FileViewerModal';
import { MobileAttachmentUploader } from './MobileAttachmentUploader';
import { getEffectiveApiUrl, getAuthToken, resolveImageUrl } from '../../services/apiService';

interface Props {
    receipt: any;
    currentUser: any;
    onClose: () => void;
    onOpenRealSayanDoc: (archiveCode: string | number, docNo?: string | number) => void;
    onOpenAccountingReview: (receipt: any) => void;
    onApproveByCeo: (receiptId: string) => void;
    onReject: (receiptId: string) => void;
    onDelete?: (receiptId: string) => void;
    onPrintA5?: (receipt: any) => void;
    onUpdateReceipt?: (updatedReceipt: any) => void;
    actionLoading: string | null;
    isFinancialOrAdmin?: boolean;
    isCeoOrAdmin?: boolean;
    canDeleteReceipt?: boolean;
    canEditReceipt?: boolean;
}

const toPersianDigits = (num: string | number | undefined | null): string => {
    if (num === undefined || num === null || num === '') return '';
    return String(num).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
};

const toShamsiDateStr = (dateInput: string | Date | null | undefined): string => {
    if (!dateInput) return '-';
    try {
        const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        if (isNaN(d.getTime())) return String(dateInput);
        const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
        const mm = String(j.jm).padStart(2, '0');
        const dd = String(j.jd).padStart(2, '0');
        return `${j.jy}/${mm}/${dd}`;
    } catch {
        return String(dateInput);
    }
};

export const ChequeReceiptDetailModal: React.FC<Props> = ({
    receipt: initialReceipt,
    currentUser,
    onClose,
    onOpenRealSayanDoc,
    onOpenAccountingReview,
    onApproveByCeo,
    onReject,
    onDelete,
    onPrintA5,
    onUpdateReceipt,
    actionLoading,
    isFinancialOrAdmin: propsIsFinancialOrAdmin,
    isCeoOrAdmin: propsIsCeoOrAdmin,
    canDeleteReceipt: propsCanDeleteReceipt,
    canEditReceipt: propsCanEditReceipt
}) => {
    const [receipt, setReceipt] = useState<any>(initialReceipt);
    const [showUploader, setShowUploader] = useState(false);
    const [savingAttachments, setSavingAttachments] = useState(false);
    const [isEditingReceiptNo, setIsEditingReceiptNo] = useState(false);
    const [tempReceiptNo, setTempReceiptNo] = useState(String(initialReceipt?.receiptNo || initialReceipt?.id || ''));
    const [savingReceiptNo, setSavingReceiptNo] = useState(false);

    // Keep internal receipt synced if prop updates
    React.useEffect(() => {
        setReceipt(initialReceipt);
        setTempReceiptNo(String(initialReceipt?.receiptNo || initialReceipt?.id || ''));
    }, [initialReceipt]);

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

    const handleSaveReceiptNo = async () => {
        const cleanNo = tempReceiptNo.trim();
        if (!cleanNo) {
            return;
        }
        setSavingReceiptNo(true);
        try {
            const res = await apiFetch(`/api/sayan/cheque-receipts/${receipt.id}/update-receipt-no`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiptNo: cleanNo,
                    currentUser: { id: currentUser.id, name: currentUser.fullName || currentUser.name }
                })
            });
            const data = await res.json();
            if (data.success && data.receipt) {
                setReceipt(data.receipt);
                setIsEditingReceiptNo(false);
                if (onUpdateReceipt) onUpdateReceipt(data.receipt);
            }
        } catch (e: any) {
            console.error('Error updating receipt no:', e);
        } finally {
            setSavingReceiptNo(false);
        }
    };

    const isFinancialOrAdmin = propsIsFinancialOrAdmin !== undefined 
        ? propsIsFinancialOrAdmin 
        : (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.FINANCIAL || currentUser.roles?.includes('financial') || currentUser.roles?.includes('admin'));
    const isCeoOrAdmin = propsIsCeoOrAdmin !== undefined 
        ? propsIsCeoOrAdmin 
        : (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CEO || currentUser.role === 'CEO' || currentUser.role === 'MANAGER' || currentUser.roles?.includes('ceo') || currentUser.roles?.includes('admin'));
    const canDeleteReceipt = propsCanDeleteReceipt !== undefined
        ? propsCanDeleteReceipt
        : isFinancialOrAdmin;
    const canEditReceipt = propsCanEditReceipt !== undefined
        ? propsCanEditReceipt
        : isFinancialOrAdmin;

    const detailContentRef = useRef<HTMLDivElement>(null);
    const [previewAttachment, setPreviewAttachment] = useState<{ fileName: string; fileData?: string; fileType?: string; url?: string; resolvedSrc?: string } | null>(null);

    // Direct attachment upload / sync handler
    const handleSaveNewAttachments = async (newAttachments: any[]) => {
        if (!receipt?.id) return;
        setSavingAttachments(true);
        try {
            const currentAtts = receipt.attachments || [];
            // Merge attachments avoiding exact duplicate names
            const merged = [...currentAtts];
            for (const att of newAttachments) {
                if (!merged.some(m => m.fileName === att.fileName && m.fileData === att.fileData)) {
                    merged.push(att);
                }
            }

            const res = await apiFetch(`/api/sayan/cheque-receipts/${receipt.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attachments: merged,
                    currentUser: { id: currentUser.id, name: currentUser.name || currentUser.username }
                })
            });
            const data = await res.json();
            if (data.success && data.receipt) {
                setReceipt(data.receipt);
                if (onUpdateReceipt) onUpdateReceipt(data.receipt);
                setShowUploader(false);
            }
        } catch (err: any) {
            console.error('Error saving attachments in detail modal:', err);
        } finally {
            setSavingAttachments(false);
        }
    };

    const handleDeleteAttachment = async (indexToDelete: number) => {
        if (!receipt?.id) return;
        setSavingAttachments(true);
        try {
            const currentAtts = [...(receipt.attachments || [])];
            currentAtts.splice(indexToDelete, 1);

            const res = await apiFetch(`/api/sayan/cheque-receipts/${receipt.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attachments: currentAtts,
                    currentUser: { id: currentUser.id, name: currentUser.name || currentUser.username }
                })
            });
            const data = await res.json();
            if (data.success && data.receipt) {
                setReceipt(data.receipt);
                if (onUpdateReceipt) onUpdateReceipt(data.receipt);
            }
        } catch (err: any) {
            console.error('Error deleting attachment:', err);
        } finally {
            setSavingAttachments(false);
        }
    };

    const handleShareToChat = async () => {
        const defaultMsg = `🧾 جزئیات رسید چک #${receipt.receiptNo || receipt.id}
👤 طرف حساب: ${receipt.personName || 'نامشخص'} (کد: ${receipt.personCode || '-'})
💰 مبلغ کل: ${Number(receipt.totalAmount || 0).toLocaleString('fa-IR')} ریال
🔢 پشت‌نمره: ${receipt.poshtNomreh || '-'}
📅 تاریخ سند: ${toShamsiDateStr(receipt.docDate)}
📑 تعداد چک‌ها: ${receipt.cheques?.length || 0} برگ
📊 وضعیت: ${receipt.status === 'REGISTERED_IN_SAYAN' ? 'ثبت شده در سایان' : receipt.status === 'PENDING_CEO' ? 'در انتظار تایید مدیرعامل' : receipt.status === 'PENDING_ACCOUNTING' ? 'در انتظار تایید حسابداری' : receipt.status}`;

        if (detailContentRef.current) {
            await shareElementToChat(
                detailContentRef.current,
                `cheque-receipt-detail-${receipt.receiptNo || receipt.id}.png`,
                {
                    defaultMessage: defaultMsg,
                    title: `ارسال رسید چک #${receipt.receiptNo || receipt.id} به گفتگو`
                }
            );
        } else {
            openSendToChat({
                defaultMessage: defaultMsg,
                title: `ارسال رسید چک #${receipt.receiptNo || receipt.id} به گفتگو`
            });
        }
    };

    const statusBadge = () => {
        switch (receipt.status) {
            case 'REGISTERED_IN_SAYAN':
                return (
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>ثبت شده در سایان</span>
                    </span>
                );
            case 'PENDING_CEO':
                return (
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>در انتظار تایید مدیرعامل (مرحله ۲)</span>
                    </span>
                );
            case 'PENDING_ACCOUNTING':
                return (
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>در انتظار بررسی کارمند حسابداری (مرحله ۱)</span>
                    </span>
                );
            case 'REJECTED':
                return (
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>عدم تایید / عودت</span>
                    </span>
                );
            default:
                return (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                        {receipt.status}
                    </span>
                );
        }
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
            <div 
                className="bg-white dark:bg-slate-900 w-full sm:max-w-4xl h-[94vh] sm:h-auto sm:max-h-[88vh] sm:rounded-3xl rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-scale-in border border-slate-200 dark:border-slate-800 shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 p-3.5 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/95 dark:bg-slate-800/60 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    رسید دریافت چک
                                </h3>
                                {isEditingReceiptNo ? (
                                    <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-blue-400 rounded-lg p-0.5 shadow-sm">
                                        <span className="text-xs font-mono font-bold text-blue-600 px-1">#</span>
                                        <input
                                            type="text"
                                            value={tempReceiptNo}
                                            onChange={(e) => setTempReceiptNo(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveReceiptNo();
                                                if (e.key === 'Escape') setIsEditingReceiptNo(false);
                                            }}
                                            className="w-20 px-1.5 py-0.5 text-xs font-mono font-bold text-blue-700 dark:text-blue-300 bg-transparent outline-none border-0"
                                            autoFocus
                                            placeholder="شماره رسید"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleSaveReceiptNo}
                                            disabled={savingReceiptNo}
                                            className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                            title="ذخیره شماره رسید"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTempReceiptNo(String(receipt.receiptNo || receipt.id || ''));
                                                setIsEditingReceiptNo(false);
                                            }}
                                            className="p-1 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                                            title="انصراف"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1">
                                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 font-bold">
                                            #{toPersianDigits(receipt.receiptNo || receipt.id)}
                                        </span>
                                        {canEditReceipt && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setTempReceiptNo(String(receipt.receiptNo || receipt.id || ''));
                                                    setIsEditingReceiptNo(true);
                                                }}
                                                className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-950 text-blue-500 transition-colors cursor-pointer"
                                                title="ویرایش شماره رسید (مثال: ۱۳۹۹)"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                )}
                                {statusBadge()}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                ثبت شده در تاریخ {toShamsiDateStr(receipt.createdAt || receipt.docDate)} {receipt.createdByName ? `توسط ${receipt.createdByName}` : ''}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleShareToChat}
                            className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                            title="ارسال مشخصات این رسید به گفتگوی سازمانی"
                        >
                            <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                            <span>ارسال به گفتگو</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body Details */}
                <div ref={detailContentRef} className="flex-1 min-h-0 overflow-y-auto overscroll-y-auto touch-pan-y p-3.5 sm:p-5 space-y-4 sm:space-y-5 bg-white dark:bg-slate-900 -webkit-overflow-scrolling-touch">
                    {/* Top Info Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/70 text-xs">
                        <div>
                            <span className="text-slate-400 block mb-1">طرف حساب (شخص):</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                                {receipt.personName || '-'}
                            </span>
                            {receipt.personCode && (
                                <div className="text-[10px] text-blue-600 font-mono mt-0.5">
                                    کد: {toPersianDigits(receipt.personCode)}
                                </div>
                            )}
                        </div>

                        <div>
                            <span className="text-slate-400 block mb-1">شماره رسید / پشت‌نمره:</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-black text-blue-600 text-sm">
                                    رسید: #{toPersianDigits(receipt.receiptNo || receipt.id)}
                                </span>
                                {receipt.poshtNomreh && (
                                    <span className="font-mono font-bold text-amber-600 text-[11px] bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                                        پشت‌نمره: {toPersianDigits(receipt.poshtNomreh)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div>
                            <span className="text-slate-400 block mb-1">صندوق خزانه‌داری:</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                                {receipt.cashboxCode === '11001' ? 'صندوق دفتر' :
                                 receipt.cashboxCode === '11002' ? 'صندوق سکه و کارت هدیه' :
                                 receipt.cashboxCode === '11003' ? 'صندوق آقای مقدم' :
                                 receipt.cashboxCode === '11004' ? 'صندوق ارزی' :
                                 receipt.cashboxCode === '11005' ? 'صندوق چک های برگشتی' :
                                 `صندوق کد ${receipt.cashboxCode || '11001'}`}
                            </span>
                        </div>

                        <div>
                            <span className="text-slate-400 block mb-1">مبلغ کل رسید:</span>
                            <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                {toPersianDigits(Number(receipt.totalAmount || 0).toLocaleString('fa-IR'))} <span className="text-[10px] font-normal text-slate-400">ریال</span>
                            </span>
                        </div>
                    </div>

                    {/* Sayan Registered Info Banner (If Registered) */}
                    {(String(receipt.docNo) === '1' || String(receipt.archiveCode) === '1') ? (
                        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center font-black">
                                    !
                                </div>
                                <div>
                                    <div className="font-black text-amber-900 dark:text-amber-300 text-sm flex items-center gap-2">
                                        <span>شماره سند ۱ نامعتبر بوده و نیاز به ثبت مجدد در سایان دارد</span>
                                    </div>
                                    <div className="text-amber-700 dark:text-amber-400 mt-0.5">
                                        این رسید جهت صدور سند رسمی در پایگاه‌داده سایان و دریافت کد بایگانی و شماره سند معتبر آماده است.
                                    </div>
                                </div>
                            </div>
                            {onApproveByCeo && (
                                <button
                                    type="button"
                                    onClick={() => onApproveByCeo(receipt.id)}
                                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all shrink-0 cursor-pointer"
                                >
                                    <Zap className="w-4 h-4" />
                                    <span>ثبت مجدد در سایان</span>
                                </button>
                            )}
                        </div>
                    ) : receipt.status === 'REGISTERED_IN_SAYAN' && receipt.archiveCode ? (
                        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
                                    ✓
                                </div>
                                <div>
                                    <div className="font-black text-emerald-900 dark:text-emerald-300 text-sm flex items-center gap-2">
                                        <span>رسید با موفقیت در پایگاه داده ERP سایان ثبت گردیده است</span>
                                    </div>
                                    <div className="text-slate-600 dark:text-slate-400 font-mono mt-0.5 flex flex-wrap gap-4">
                                        <span>شماره سند سایان: <b>{toPersianDigits(receipt.docNo || receipt.sayanDocNo || '-')}</b></span>
                                        <span>کد بایگانی سایان: <b>{toPersianDigits(receipt.archiveCode || receipt.sayanArchiveCode || '-')}</b></span>
                                        <span>تاریخ ثبت: <b>{toShamsiDateStr(receipt.sayanRegisteredAt || receipt.docDate)}</b></span>
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onOpenRealSayanDoc(receipt.archiveCode, receipt.docNo)}
                                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all shrink-0 cursor-pointer"
                            >
                                <Layers className="w-4 h-4" />
                                <span>استعلام سند واقعی سایان</span>
                            </button>
                        </div>
                    ) : null}

                    {/* Description */}
                    {receipt.description && (
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs">
                            <span className="font-bold text-slate-500 block mb-1">شرح و توضیحات رسید:</span>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                                {receipt.description}
                            </p>
                        </div>
                    )}

                    {/* Cheque Rows Table */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="font-black text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                                <CreditCard className="w-4 h-4 text-emerald-600" />
                                <span>اقلام چک‌های ثبت شده ({toPersianDigits(receipt.cheques?.length || 0)} برگ)</span>
                            </h4>
                        </div>

                        <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto">
                            <table className="w-full text-right text-xs">
                                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                        <th className="px-3 py-2.5">ردیف</th>
                                        <th className="px-3 py-2.5">شماره چک (صیادی)</th>
                                        <th className="px-3 py-2.5">مبلغ چک (ریال)</th>
                                        <th className="px-3 py-2.5">سررسید</th>
                                        <th className="px-3 py-2.5">بانک عامل</th>
                                        <th className="px-3 py-2.5">در وجه</th>
                                        <th className="px-3 py-2.5">شرح چک</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {receipt.cheques && receipt.cheques.length > 0 ? (
                                        receipt.cheques.map((c: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                <td className="px-3 py-2.5 font-mono text-slate-400">
                                                    {toPersianDigits(idx + 1)}
                                                </td>
                                                <td className="px-3 py-2.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                                                    {toPersianDigits(c.chequeNumber || '-')}
                                                </td>
                                                <td className="px-3 py-2.5 font-mono font-black text-emerald-600 dark:text-emerald-400">
                                                    {toPersianDigits(Number(c.amount || 0).toLocaleString('fa-IR'))}
                                                </td>
                                                <td className="px-3 py-2.5 font-mono text-slate-700 dark:text-slate-300">
                                                    {toShamsiDateStr(c.dueDate)}
                                                </td>
                                                <td className="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-200">
                                                    {c.bankName || '-'}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                                                    {c.inNameOf || receipt.personName || '-'}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-500">
                                                    {c.description || '-'}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={7} className="text-center py-6 text-slate-400">
                                                اطلاعات چک ثبت نشده است.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Approvals Review Timeline */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {/* Accounting Review */}
                        <div className={`p-4 rounded-2xl border ${
                            receipt.accountingReview?.approved
                                ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                        }`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                                    <span>مرحله ۱: بررسی کارشناسی حسابداری</span>
                                </span>
                                {receipt.accountingReview?.approved ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">
                                        تایید شده
                                    </span>
                                ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                                        در انتظار اقدام
                                    </span>
                                )}
                            </div>
                            {receipt.accountingReview ? (
                                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                                    <div>تاییدکننده: <b>{receipt.accountingReview.byName || 'کارشناس حسابداری'}</b></div>
                                    <div>تاریخ بررسی: <b>{toShamsiDateStr(receipt.accountingReview.date)}</b></div>
                                    {receipt.accountingReview.note && (
                                        <div className="mt-1.5 p-2 bg-white dark:bg-slate-900 rounded-lg border border-blue-100 dark:border-blue-900 text-blue-900 dark:text-blue-300">
                                            یادداشت حسابداری: {receipt.accountingReview.note}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-slate-400 text-[11px]">
                                    رسید هنوز توسط کارمند حسابداری بررسی و تایید نشده است.
                                </p>
                            )}
                        </div>

                        {/* CEO Approval */}
                        <div className={`p-4 rounded-2xl border ${
                            receipt.ceoApproval?.approved
                                ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                        }`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>مرحله ۲: تایید نهایی مدیرعامل</span>
                                </span>
                                {receipt.ceoApproval?.approved ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">
                                        تایید و ثبت نهایی
                                    </span>
                                ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                                        در انتظار تایید
                                    </span>
                                )}
                            </div>
                            {receipt.ceoApproval ? (
                                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                                    <div>تاییدکننده: <b>{receipt.ceoApproval.byName || 'مدیرعامل'}</b></div>
                                    <div>تاریخ تایید: <b>{toShamsiDateStr(receipt.ceoApproval.date)}</b></div>
                                </div>
                            ) : (
                                <p className="text-slate-400 text-[11px]">
                                    تایید نهایی مدیرعامل پس از تایید حسابداری انجام می‌پذیرد.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Attachments & Document Upload */}
                    <div className="space-y-3 text-xs bg-slate-50/70 dark:bg-slate-900/40 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                            <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-purple-600" />
                                <span>فایل‌های پیوست و تصاویر چک‌ها ({toPersianDigits(receipt.attachments?.length || 0)} فایل)</span>
                            </h4>
                            {(isFinancialOrAdmin || canEditReceipt) && (
                                <button
                                    type="button"
                                    onClick={() => setShowUploader(!showUploader)}
                                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                                >
                                    {showUploader ? <X className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
                                    <span>{showUploader ? 'بستن آپلودر' : 'افزودن / آپلود عکس جدید'}</span>
                                </button>
                            )}
                        </div>

                        {/* Inline Attachment Uploader Component */}
                        {showUploader && (
                            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-purple-200 dark:border-purple-800 shadow-sm space-y-2">
                                <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                                    فایل‌های جدید (تصویر چک، فیش و مدارک) را بارگذاری کنید:
                                </div>
                                <MobileAttachmentUploader
                                    attachments={[]}
                                    onChange={(newAtts) => {
                                        if (newAtts && newAtts.length > 0) {
                                            handleSaveNewAttachments(newAtts);
                                        }
                                    }}
                                    readOnly={savingAttachments}
                                />
                                {savingAttachments && (
                                    <div className="flex items-center gap-2 text-xs text-purple-600 font-bold py-1">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>در حال ذخیره و به‌روزرسانی مدارک...</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {receipt.attachments && receipt.attachments.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {receipt.attachments.map((att: any, idx: number) => {
                                    const rawFileSrc = att.fileData || att.url || (att.fileName ? `/uploads/${att.fileName}` : '');
                                    const fileSrc = resolveImageUrl(rawFileSrc);
                                    const isPdf = att.fileName?.toLowerCase().endsWith('.pdf') || att.fileType?.includes('pdf') || att.fileData?.startsWith('data:application/pdf');
                                    return (
                                        <div key={idx} className="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 shadow-xs">
                                            <div className="flex items-center gap-2 truncate">
                                                <FileText className="w-4 h-4 text-purple-500 shrink-0" />
                                                <div className="truncate flex flex-col">
                                                    <span className="truncate font-medium text-slate-800 dark:text-slate-200">{att.fileName || `پیوست شماره ${idx + 1}`}</span>
                                                    <span className="text-[10px] text-slate-400">{isPdf ? 'سند PDF' : 'تصویر پیوست'}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewAttachment({ ...att, resolvedSrc: fileSrc })}
                                                    className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                                    title="پیش‌نمایش فایل"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    <span>مشاهده</span>
                                                </button>
                                                {fileSrc && (
                                                    <a
                                                        href={fileSrc}
                                                        download={att.fileName || `cheque-receipt-${receipt.id}.pdf`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-colors"
                                                        title="دانلود مستقیم فایل"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                        <span>دانلود</span>
                                                    </a>
                                                )}
                                                {(isFinancialOrAdmin || canEditReceipt) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteAttachment(idx)}
                                                        disabled={savingAttachments}
                                                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950 dark:hover:bg-rose-900 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[11px] cursor-pointer transition-colors"
                                                        title="حذف این پیوست"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-3 text-center text-slate-400 text-[11px] bg-white/50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                                هیچ فایلی پیوست نشده است. می‌توانید با دکمه بالا تصویر چک‌ها یا رسید را اضافه کنید.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions (Always Pinned at Bottom with Safe Area) */}
                <div className="shrink-0 p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 shadow-lg pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <div className="flex flex-col sm:flex-row-reverse sm:items-center sm:justify-between gap-2.5 sm:gap-3">
                        {/* Step Actions (Primary on mobile, prominent at top) */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            {/* Step 1: Accounting can review/approve, reject and edit */}
                            {receipt.status === 'PENDING_ACCOUNTING' && (
                                <>
                                    {(canEditReceipt || isFinancialOrAdmin) && (
                                        <button
                                            type="button"
                                            onClick={() => onOpenAccountingReview(receipt)}
                                            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 cursor-pointer active:scale-95"
                                            title="ویرایش مشخصات، اقلام و مدارک پیوست و ثبت تایید مالی"
                                        >
                                            <Edit3 className="w-4 h-4" />
                                            <span>ویرایش و بررسی مالی</span>
                                        </button>
                                    )}
                                    {isFinancialOrAdmin && (
                                        <button
                                            type="button"
                                            onClick={() => onReject(receipt.id)}
                                            disabled={actionLoading === receipt.id}
                                            className="px-3.5 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs hover:bg-rose-100 cursor-pointer text-center"
                                        >
                                            رد / بازگشت
                                        </button>
                                    )}
                                </>
                            )}

                            {/* Edit button for authorized users on pending/failed receipts (e.g. PENDING_CEO or REJECTED) */}
                            {receipt.status !== 'REGISTERED_IN_SAYAN' && receipt.status !== 'PENDING_ACCOUNTING' && (canEditReceipt || isFinancialOrAdmin) && (
                                <button
                                    type="button"
                                    onClick={() => onOpenAccountingReview(receipt)}
                                    className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 cursor-pointer active:scale-95"
                                    title="ویرایش اطلاعات و مدارک رسید"
                                >
                                    <Edit3 className="w-4 h-4" />
                                    <span>ویرایش اطلاعات رسید</span>
                                </button>
                            )}

                            {/* Step 2: CEO Approves and registers in Sayan DB */}
                            {receipt.status === 'PENDING_CEO' && isCeoOrAdmin && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => onApproveByCeo(receipt.id)}
                                        disabled={actionLoading === receipt.id}
                                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 cursor-pointer active:scale-95"
                                    >
                                        <ShieldCheck className="w-4 h-4" />
                                        <span>{actionLoading === receipt.id ? 'در حال ثبت در پایگاه سایان...' : 'تایید نهایی مدیرعامل و ثبت در ERP سایان'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onReject(receipt.id)}
                                        disabled={actionLoading === receipt.id}
                                        className="px-3.5 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs hover:bg-rose-100 cursor-pointer text-center"
                                    >
                                        عدم تایید مدیرعامل
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Secondary utility actions */}
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
                            >
                                بستن
                            </button>

                            {onPrintA5 && (
                                <button
                                    type="button"
                                    onClick={() => onPrintA5(receipt)}
                                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                                    title="مشاهده پیش‌نمایش و چاپ رسید استاندارد A5 افقی"
                                >
                                    <Printer className="w-4 h-4" />
                                    <span>چاپ رسید A5</span>
                                </button>
                            )}

                            {receipt.archiveCode && (
                                <button
                                    type="button"
                                    onClick={() => onOpenRealSayanDoc(receipt.archiveCode, receipt.docNo)}
                                    className="px-3.5 py-2 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold text-xs border border-purple-200 dark:border-purple-800 flex items-center gap-1.5 hover:bg-purple-200 transition-colors cursor-pointer"
                                >
                                    <Layers className="w-4 h-4" />
                                    <span>سند در سایان</span>
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={handleShareToChat}
                                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                            >
                                <Send className="w-3.5 h-3.5" />
                                <span>ارسال به گفتگو</span>
                            </button>

                            {receipt.status !== 'REGISTERED_IN_SAYAN' && canDeleteReceipt && onDelete && (
                                <button
                                    type="button"
                                    onClick={() => onDelete(receipt.id)}
                                    disabled={actionLoading === receipt.id}
                                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-bold text-xs border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                                    title="حذف کامل این رسید چک"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>حذف</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Standard and Enhanced File Viewer Modal */}
            <FileViewerModal
                isOpen={!!previewAttachment}
                onClose={() => setPreviewAttachment(null)}
                fileUrl={resolveImageUrl(previewAttachment?.resolvedSrc || previewAttachment?.fileData || previewAttachment?.url || (previewAttachment?.fileName ? `/uploads/${previewAttachment.fileName}` : ''))}
                fileName={previewAttachment?.fileName || 'پیش‌نمایش پیوست'}
            />
        </div>,
        document.body
    );
};
