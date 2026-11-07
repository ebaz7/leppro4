import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    FileText, X, CheckCircle2, AlertCircle, RefreshCw, Printer,
    CreditCard, Building2, Hash, Calendar, Layers, ShieldCheck, Download,
    Code, Copy, Check
} from 'lucide-react';
import * as jalaali from 'jalaali-js';
import { getEffectiveApiUrl, getAuthToken } from '../../services/apiService';

interface Props {
    archiveCode: string | number;
    docNo?: string | number;
    fiscalYear?: string;
    onClose: () => void;
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

export const RealSayanDocumentModal: React.FC<Props> = ({
    archiveCode,
    docNo,
    fiscalYear = '4',
    onClose
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [docData, setDocData] = useState<any | null>(null);
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'BUR_TBL_012' | 'BUR_TBL_009' | 'BUR_TBL_008' | 'BUR_TBL_016' | 'PRINT_VIEW' | 'RAW_DATA'>('OVERVIEW');
    const [copied, setCopied] = useState(false);

    const fetchRealDoc = async () => {
        setLoading(true);
        setError(null);
        try {
            const cleanArch = String(archiveCode || docNo || '').trim();
            const url = getEffectiveApiUrl(`/api/sayan/cheque-receipts/real-document/${cleanArch}?fiscalYear=${fiscalYear}`);
            const token = getAuthToken();
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(url, { headers });
            if (!res.ok) {
                setError(`خطا در پاسخ سرور (کد ${res.status})`);
                return;
            }
            const data = await res.json();
            if (data.success) {
                setDocData(data.data || data);
            } else {
                setError(data.error || data.message || 'اطلاعات سند در دیتابیس سایان یافت نشد.');
            }
        } catch (err: any) {
            setError(err.message || 'خطا در برقراری ارتباط با سرور');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (archiveCode || docNo) {
            fetchRealDoc();
        }
    }, [archiveCode, docNo, fiscalYear]);

    const handlePrint = () => {
        window.print();
    };

    const handleCopyJson = () => {
        if (docData) {
            navigator.clipboard.writeText(JSON.stringify(docData, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
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
                className="bg-white dark:bg-slate-900 w-full sm:max-w-5xl h-[94vh] sm:h-auto sm:max-h-[88vh] sm:rounded-3xl rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-scale-in border border-slate-200 dark:border-slate-800 shrink-0"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 p-3.5 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/95 dark:bg-slate-800/60 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-xs">
                            <Layers className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    سند واقعی ثبت شده در پایگاه‌داده ERP سایان
                                </h3>
                                <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono font-bold text-xs border border-purple-200 dark:border-purple-800">
                                    کد بایگانی: {toPersianDigits(archiveCode || docData?.header?.archiveCode)}
                                </span>
                                {docData?.header?.docNo && (
                                    <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono font-bold text-xs border border-blue-200 dark:border-blue-800">
                                        شماره سند: {toPersianDigits(docData.header.docNo)}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                استعلام زنده و مستقیم از جداول اسناد دریافتنی خزانه داری سایان (BUR_TBL_008, 009, 012, 016)
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={fetchRealDoc}
                            disabled={loading}
                            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="بازخوانی مجدد اطلاعات از دیتابیس"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Sub-tabs */}
                <div className="shrink-0 flex items-center gap-2 px-3 sm:px-5 pt-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 overflow-x-auto text-xs font-bold no-scrollbar">
                    <button
                        type="button"
                        onClick={() => setActiveTab('OVERVIEW')}
                        className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                            activeTab === 'OVERVIEW'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <FileText className="w-4 h-4" />
                        <span>خلاصه سند و مشخصات طرف حساب</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('BUR_TBL_012')}
                        className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                            activeTab === 'BUR_TBL_012'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <CreditCard className="w-4 h-4" />
                        <span>اقلام چک‌ها (BUR_TBL_012)</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('BUR_TBL_009')}
                        className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                            activeTab === 'BUR_TBL_009'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <Hash className="w-4 h-4" />
                        <span>آرتیکل‌های خزانه‌داری (BUR_TBL_009)</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('BUR_TBL_008')}
                        className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                            activeTab === 'BUR_TBL_008'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <Layers className="w-4 h-4" />
                        <span>هدر سند (BUR_TBL_008)</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('BUR_TBL_016')}
                        className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                            activeTab === 'BUR_TBL_016'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <Building2 className="w-4 h-4" />
                        <span>ابعاد و تفصیلی‌ها (BUR_TBL_016)</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('PRINT_VIEW')}
                        className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                            activeTab === 'PRINT_VIEW'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <Printer className="w-4 h-4" />
                        <span>پیش‌نمایش و چاپ رسید</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('RAW_DATA')}
                        className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                            activeTab === 'RAW_DATA'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <Code className="w-4 h-4" />
                        <span>داده‌های خام JSON</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-auto touch-pan-y p-3.5 sm:p-5 space-y-4 -webkit-overflow-scrolling-touch">
                    {loading ? (
                        <div className="py-20 text-center flex flex-col items-center justify-center gap-3 text-slate-400">
                            <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
                            <span className="text-sm font-bold">در حال استعلام اطلاعات سند از سرور سایان...</span>
                        </div>
                    ) : error ? (
                        <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-start gap-3 text-sm">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                            <div>
                                <div className="font-bold">عدم امکان دریافت اطلاعات سند:</div>
                                <div className="text-xs mt-1">{error}</div>
                            </div>
                        </div>
                    ) : docData ? (
                        <>
                            {activeTab === 'OVERVIEW' && (
                                <div className="space-y-4">
                                    {/* Main Header Card */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
                                        <div>
                                            <span className="text-slate-400 block mb-1">شماره سند سایان (DocNo)</span>
                                            <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                                                {toPersianDigits(docData.header?.docNo || docNo || '-')}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 block mb-1">کد بایگانی (ArchiveCode)</span>
                                            <span className="font-mono font-bold text-purple-600 dark:text-purple-400 text-sm">
                                                {toPersianDigits(docData.header?.archiveCode || archiveCode)}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 block mb-1">تاریخ سند (شمسی)</span>
                                            <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                                                {toPersianDigits(docData.header?.shamsiDate || toShamsiDateStr(docData.header?.docDate))}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 block mb-1">جمع کل سند خزانه</span>
                                            <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                                {toPersianDigits(Number(docData.header?.totalAmount || 0).toLocaleString('fa-IR'))} ریال
                                            </span>
                                        </div>
                                    </div>

                                    {/* Party & Explanation */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 border-b pb-2">
                                                <Building2 className="w-4 h-4 text-blue-500" />
                                                <span>مشخصات طرف حساب (شخص دریافتنی)</span>
                                            </div>
                                            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                                                <span className="text-slate-400">نام طرف حساب:</span>
                                                <span className="font-bold text-slate-900 dark:text-white">{docData.header?.personName || 'نامشخص'}</span>
                                            </div>
                                            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                                                <span className="text-slate-400">کد تفصیلی شخص:</span>
                                                <span className="font-mono font-bold text-blue-600">{toPersianDigits(docData.header?.personCode || '-')}</span>
                                            </div>
                                            <div className="flex justify-between py-1">
                                                <span className="text-slate-400">کد عملیات سایان:</span>
                                                <span className="font-mono text-slate-600 dark:text-slate-300">018 (دریافت اسناد بهادار)</span>
                                            </div>
                                        </div>

                                        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 border-b pb-2">
                                                <FileText className="w-4 h-4 text-emerald-500" />
                                                <span>شرح کامل ثبت شده در هدر سند (Field_028)</span>
                                            </div>
                                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-sans bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                                                {docData.header?.desc || 'بدون شرح هدر'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'BUR_TBL_012' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <span>اقلام و برگه‌های چک ثبت شده در جدول BUR_TBL_012 ({toPersianDigits(docData.tbl012Records?.length || 0)} مورد)</span>
                                    </div>
                                    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto">
                                        <table className="w-full text-right text-xs">
                                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                                                <tr>
                                                    <th className="px-3 py-2.5">ردیف</th>
                                                    <th className="px-3 py-2.5">شماره چک</th>
                                                    <th className="px-3 py-2.5">مبلغ چک (ریال)</th>
                                                    <th className="px-3 py-2.5">سررسید (شمسی)</th>
                                                    <th className="px-3 py-2.5">بانک و شعبه</th>
                                                    <th className="px-3 py-2.5">پشت‌نمره</th>
                                                    <th className="px-3 py-2.5">صاحب حساب</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {docData.tbl012Records?.map((row: any, idx: number) => (
                                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                        <td className="px-3 py-2.5 text-slate-400 font-mono">{idx + 1}</td>
                                                        <td className="px-3 py-2.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                                                            {toPersianDigits(row.Field_003 || row.chequeNumber || '-')}
                                                        </td>
                                                        <td className="px-3 py-2.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                            {toPersianDigits(Number(row.Field_004 || row.amount || 0).toLocaleString('fa-IR'))}
                                                        </td>
                                                        <td className="px-3 py-2.5 font-mono">
                                                            {toPersianDigits(toShamsiDateStr(row.Field_005 || row.dueDate))}
                                                        </td>
                                                        <td className="px-3 py-2.5">{row.Field_006 || row.bankName || '-'}</td>
                                                        <td className="px-3 py-2.5 font-mono font-bold text-amber-600">
                                                            {toPersianDigits(row.Field_010 || row.poshtNomreh || '-')}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-slate-500">{row.Field_007 || row.inNameOf || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'BUR_TBL_009' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <span>آرتیکل‌های گردش خزانه‌داری در جدول BUR_TBL_009 ({toPersianDigits(docData.tbl009Records?.length || docData.rows?.length || 0)} سطر)</span>
                                    </div>
                                    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto">
                                        <table className="w-full text-right text-xs">
                                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                                                <tr>
                                                    <th className="px-3 py-2.5">ردیف</th>
                                                    <th className="px-3 py-2.5">شناسه آرتیکل</th>
                                                    <th className="px-3 py-2.5">نوع آرتیکل</th>
                                                    <th className="px-3 py-2.5">کد حساب / صندوق</th>
                                                    <th className="px-3 py-2.5">شناسه چک</th>
                                                    <th className="px-3 py-2.5">مبلغ آرتیکل (ریال)</th>
                                                    <th className="px-3 py-2.5">شرح سطر خزانه‌داری</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {(docData.tbl009Records || docData.rows || [])?.map((row: any, idx: number) => (
                                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                        <td className="px-3 py-2.5 text-slate-400 font-mono">{toPersianDigits(row.RowSeq || row.rowSeq || idx + 1)}</td>
                                                        <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-400">{toPersianDigits(row.RowId || row.rowId || '-')}</td>
                                                        <td className="px-3 py-2.5 font-mono">
                                                            <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[11px]">
                                                                {row.RowType === '12' || row.rowType === '12' ? '۱۲ (چک دریافتی)' : (row.RowType || row.rowType || '-')}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2.5 font-mono font-bold text-purple-600 dark:text-purple-400">
                                                            {toPersianDigits(row.CashboxCode || row.cashboxCode || row.FundCode || row.fundCode || '-')}
                                                        </td>
                                                        <td className="px-3 py-2.5 font-mono text-amber-600">
                                                            {toPersianDigits(row.ChequeId || row.chequeId || '-')}
                                                        </td>
                                                        <td className="px-3 py-2.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                            {toPersianDigits(Number(row.RowAmount || row.rowAmount || 0).toLocaleString('fa-IR'))}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                                                            {row.RowNote || row.rowNote || row.RowDesc || row.rowDesc || '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'BUR_TBL_008' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <span>فیلدهای هدر سند خزانه‌داری در جدول BUR_TBL_008</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                            <span className="text-slate-400 block mb-1">شماره سند (Field_006)</span>
                                            <span className="font-mono font-black text-sm text-blue-600 dark:text-blue-400">
                                                {toPersianDigits(docData.header?.docNo || docData.header?.DocNo || '-')}
                                            </span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                            <span className="text-slate-400 block mb-1">کد بایگانی (Field_005)</span>
                                            <span className="font-mono font-black text-sm text-purple-600 dark:text-purple-400">
                                                {toPersianDigits(docData.header?.archiveCode || docData.header?.ArchiveCode || archiveCode)}
                                            </span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                            <span className="text-slate-400 block mb-1">سال مالی (Field_004)</span>
                                            <span className="font-mono font-bold text-sm">
                                                {toPersianDigits(docData.header?.fiscalYear || docData.header?.FiscalYear || fiscalYear)}
                                            </span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                            <span className="text-slate-400 block mb-1">تاریخ سند (Field_008)</span>
                                            <span className="font-mono font-bold text-sm">
                                                {toPersianDigits(docData.header?.shamsiDate || toShamsiDateStr(docData.header?.docDate || docData.header?.DocDate))}
                                            </span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                            <span className="text-slate-400 block mb-1">تاریخ و ساعت ثبت سیستم (Field_030)</span>
                                            <span className="font-mono font-bold text-xs text-slate-700 dark:text-slate-300">
                                                {toPersianDigits(toShamsiDateStr(docData.header?.regDate || docData.header?.RegDate || docData.header?.createdDate))}
                                            </span>
                                        </div>
                                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                                            <span className="text-slate-400 block mb-1">مبلغ کل سند (Field_025)</span>
                                            <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                                                {toPersianDigits(Number(docData.header?.totalAmount || docData.header?.TotalAmount || 0).toLocaleString('fa-IR'))} ریال
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
                                        <span className="text-slate-400 block mb-1">شرح کامل هدر سند (Field_028)</span>
                                        <p className="font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                                            {docData.header?.desc || docData.header?.description || docData.header?.Description || 'بدون شرح'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'BUR_TBL_016' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <span>ابعاد و مراکز هزینه تفصیلی شناور در جدول BUR_TBL_016 ({toPersianDigits(docData.tbl016Records?.length || docData.dimensions?.length || 0)} مورد)</span>
                                    </div>
                                    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto">
                                        <table className="w-full text-right text-xs">
                                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                                                <tr>
                                                    <th className="px-3 py-2.5">ردیف</th>
                                                    <th className="px-3 py-2.5">شناسه بعد (DimId)</th>
                                                    <th className="px-3 py-2.5">نوع بعد (DimType)</th>
                                                    <th className="px-3 py-2.5">کد مقدار تفصیلی / مرکز (DimValue)</th>
                                                    <th className="px-3 py-2.5">توضیح بعد در سایان</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {(docData.tbl016Records || docData.dimensions || [])?.map((dim: any, idx: number) => (
                                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                        <td className="px-3 py-2.5 text-slate-400 font-mono">{idx + 1}</td>
                                                        <td className="px-3 py-2.5 font-mono">{toPersianDigits(dim.DimId || dim.Field_001 || '-')}</td>
                                                        <td className="px-3 py-2.5 font-mono font-bold text-blue-600">
                                                            {dim.DimType === '6' ? '۶ (جزء / شعبه)' :
                                                             dim.DimType === '15' ? '۱۵ (تفصیلی شخص)' :
                                                             toPersianDigits(dim.DimType || dim.Field_005 || '-')}
                                                        </td>
                                                        <td className="px-3 py-2.5 font-mono font-black text-purple-600">
                                                            {toPersianDigits(dim.DimValue || dim.Field_006 || '-')}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-slate-500">
                                                            {dim.DimType === '6' ? 'کد جزء شعبه اصلی' :
                                                             dim.DimType === '15' ? 'کد شخص طرف حساب' : 'بعد حسابداری'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'RAW_DATA' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <span>پاسخ کامل و خام دریافتی از سرور ERP سایان (JSON)</span>
                                        <button
                                            type="button"
                                            onClick={handleCopyJson}
                                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer"
                                        >
                                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                            <span>{copied ? 'کپی شد' : 'کپی JSON'}</span>
                                        </button>
                                    </div>
                                    <pre className="p-4 rounded-2xl bg-slate-950 text-emerald-400 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[50vh] border border-slate-800" dir="ltr">
                                        {JSON.stringify(docData, null, 2)}
                                    </pre>
                                </div>
                            )}

                            {activeTab === 'PRINT_VIEW' && (
                                <div className="space-y-4">
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={handlePrint}
                                            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm"
                                        >
                                            <Printer className="w-4 h-4" />
                                            <span>چاپ رسمی این رسید</span>
                                        </button>
                                    </div>

                                    {/* Printable Voucher Paper */}
                                    <div className="bg-white text-black p-8 rounded-2xl border border-slate-300 shadow-sm space-y-6 print:m-0 print:border-none print:shadow-none" dir="rtl">
                                        <div className="flex items-center justify-between border-b-2 border-black pb-4">
                                            <div className="text-right">
                                                <h2 className="text-lg font-black">رسید رسمی دریافت اسناد دریافتنی (چک)</h2>
                                                <div className="text-xs text-gray-600 mt-1">سامانه جامع یکپارچه سازمانی ERP سایان</div>
                                            </div>
                                            <div className="text-left text-xs font-mono space-y-1">
                                                <div>شماره سند: <b>{toPersianDigits(docData.header?.docNo || '-')}</b></div>
                                                <div>کد بایگانی: <b>{toPersianDigits(docData.header?.archiveCode || archiveCode)}</b></div>
                                                <div>تاریخ ثبت: <b>{toPersianDigits(toShamsiDateStr(docData.header?.docDate))}</b></div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                                <span className="text-gray-500">طرف حساب / پرداخت کننده:</span>
                                                <div className="font-bold text-sm mt-1">{docData.header?.personName} (کد {docData.header?.personCode})</div>
                                            </div>
                                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                                <span className="text-gray-500">مجموع مبلغ رسید:</span>
                                                <div className="font-bold text-sm text-emerald-700 mt-1">
                                                    {toPersianDigits(Number(docData.header?.totalAmount || 0).toLocaleString('fa-IR'))} ریال
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <table className="w-full text-right text-xs border border-collapse border-black">
                                                <thead>
                                                    <tr className="bg-gray-100 border-b border-black font-bold">
                                                        <th className="p-2 border-l border-black">ردیف</th>
                                                        <th className="p-2 border-l border-black">شماره چک</th>
                                                        <th className="p-2 border-l border-black">مبلغ (ریال)</th>
                                                        <th className="p-2 border-l border-black">تاریخ سررسید</th>
                                                        <th className="p-2 border-l border-black">بانک صادرکننده</th>
                                                        <th className="p-2">پشت‌نمره</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {docData.tbl012Records?.map((r: any, i: number) => (
                                                        <tr key={i} className="border-b border-black">
                                                            <td className="p-2 border-l border-black font-mono">{i + 1}</td>
                                                            <td className="p-2 border-l border-black font-mono font-bold">{toPersianDigits(r.Field_003 || r.chequeNumber)}</td>
                                                            <td className="p-2 border-l border-black font-mono">{toPersianDigits(Number(r.Field_004 || r.amount).toLocaleString('fa-IR'))}</td>
                                                            <td className="p-2 border-l border-black font-mono">{toPersianDigits(toShamsiDateStr(r.Field_005 || r.dueDate))}</td>
                                                            <td className="p-2 border-l border-black">{r.Field_006 || r.bankName}</td>
                                                            <td className="p-2 font-mono font-bold">{toPersianDigits(r.Field_010 || r.poshtNomreh)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="pt-8 grid grid-cols-3 gap-4 text-center text-xs font-bold border-t border-gray-300">
                                            <div>امضاء و مهر تحویل‌دهنده</div>
                                            <div>امضاء کارشناس حسابداری</div>
                                            <div>امضاء و تایید مدیرعامل</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="shrink-0 p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer"
                    >
                        بستن
                    </button>
                    {docData?.header?.docNo && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-[11px] sm:text-xs">سند با موفقیت در دیتابیس سایان ثبت و بایگانی شده است.</span>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
