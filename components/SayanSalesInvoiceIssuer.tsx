import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import * as jalaali from 'jalaali-js';
import {
    FileText,
    Printer,
    Download,
    Send,
    RefreshCw,
    Search,
    CheckCircle2,
    AlertCircle,
    Package,
    User,
    Warehouse,
    Calendar,
    Percent,
    Receipt,
    Sparkles,
    ArrowRight,
    X,
    Bot,
    Archive,
    Loader2,
    ShieldCheck,
    FileCheck2,
    Coins
} from 'lucide-react';
import { getEffectiveApiUrl, getAuthToken } from '../services/apiService';
import { saveBlobAndOpenFile } from '../services/fileService';
import { formatChequeAmountInWords } from '../utils/persianNumberToWords';

type InvoiceMode = 'unofficial' | 'official';

interface PendingRemittance {
    docId: string;
    fiscalYear: string;
    archiveNo: string;
    remittanceNo: string;
    subCode: string;
    docDate: string;
    shamsiDate: string;
    opCode: string;
    customerCode: string;
    customerName: string;
    warehouseCode: string;
    warehouseName: string;
    description: string;
    lineCount: number;
    activeLineCount?: number;
    voidedLineCount?: number;
    invoicedLineCount?: number;
    totalNetWeight: number;
    isVoided?: boolean;
    isInvoiced: boolean;
    isPartiallyInvoiced?: boolean;
    linkedInvoiceId?: string | null;
    linkedInvoiceNo?: string | null;
    linkedInvoiceArchiveNo?: string | null;
    linkedInvoiceType?: InvoiceMode | null;
}

interface RemittanceHeaderDetail {
    docId: string;
    fiscalYear: string;
    archiveNo: string;
    remittanceNo: string;
    subCode: string;
    docDate: string;
    shamsiDate: string;
    customerCode: string;
    customerTafsiliCode: string;
    customerName: string;
    customerNationalCode: string;
    customerMobile: string;
    customerAddress: string;
    warehouseCode: string;
    warehouseName: string;
    description: string;
}

interface DraftInvoiceItem {
    itemCode: string;
    itemName: string;
    unitName: string;
    unitCode: string;
    wareUnitId: string;
    netWeight: number;
    grossWeight: number;
    cartonCount: number;
    bobbinCount: number;
    grade: string;
    suggestedUnitPrice: number;
    unitPrice: number;
    discount: number;
    note: string;
    sourceRowIds: string[];
}

interface IssuedSalesInvoice {
    id: string;
    sayanDocId?: string;
    archiveNo: string;
    invoiceNo: string;
    fiscalYear: string;
    fiscalYearLabel?: string;
    baseRemittanceDocId?: string;
    baseRemittanceArchiveNo: string;
    baseRemittanceNo: string;
    customerCode: string;
    customerTafsiliCode?: string;
    customerName: string;
    customerNationalCode?: string;
    customerMobile?: string;
    customerAddress?: string;
    warehouseCode?: string;
    warehouseName?: string;
    invoiceType: InvoiceMode;
    vatRate: number;
    totalCartons: number;
    totalNetWeight: number;
    subtotal: number;
    totalDiscount: number;
    vatAmount: number;
    grandTotal: number;
    items: Array<{
        rowNo?: number;
        itemCode: string;
        itemName: string;
        unitName?: string;
        netWeight: number;
        cartonCount: number;
        baseUnitPrice?: number;
        vatPerUnit?: number;
        unitPrice: number;
        discount?: number;
        rawAmount?: number;
        afterDiscount?: number;
        vatAmount?: number;
        lineTotal?: number;
        note?: string;
    }>;
    notes?: string;
    subCode?: string;
    shamsiDate: string;
    publishedToBot?: boolean;
    botDeliveredCount?: number;
    createdBy?: string;
    createdAt?: string;
}

interface Props {
    settings?: any;
    currentUser?: any;
}

const toFaDigits = (val: string | number | undefined | null): string => {
    if (val === undefined || val === null) return '';
    return String(val).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
};

const formatFaNumber = (val: number | string | undefined | null, maxDecimals = 0): string => {
    const n = Number(val);
    if (!Number.isFinite(n)) return '۰';
    return toFaDigits(
        n.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: maxDecimals
        })
    );
};

const parseNumericInput = (raw: string): number => {
    const normalized = String(raw || '')
        .replace(/[۰-۹]/g, (ch) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)))
        .replace(/[٠-٩]/g, (ch) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
        .replace(/[^\d.]/g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
};

const getTodayShamsi = (): string => {
    const now = new Date();
    const j = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
};

const buildApiHeaders = (json = true): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (json) headers['Content-Type'] = 'application/json';
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
};

const SayanSalesInvoiceIssuer: React.FC<Props> = ({ settings, currentUser }) => {
    const [subView, setSubView] = useState<'issue' | 'archive'>('issue');
    const [fiscalYear, setFiscalYear] = useState<string>('4');
    const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'invoiced'>('pending');
    const [remSearch, setRemSearch] = useState<string>('');
    const [remittances, setRemittances] = useState<PendingRemittance[]>([]);
    const [loadingRemittances, setLoadingRemittances] = useState<boolean>(false);
    const [remError, setRemError] = useState<string>('');

    // Selected remittance (basis) & draft invoice state
    const [selectedRemittance, setSelectedRemittance] = useState<RemittanceHeaderDetail | null>(null);
    const [loadingLines, setLoadingLines] = useState<boolean>(false);
    const [draftItems, setDraftItems] = useState<DraftInvoiceItem[]>([]);
    const [invoiceType, setInvoiceType] = useState<InvoiceMode | null>(null);
    const [invoiceDate, setInvoiceDate] = useState<string>(getTodayShamsi());
    const [notes, setNotes] = useState<string>('');
    const [publishToBot, setPublishToBot] = useState<boolean>(true);
    const [notifyCustomerViaBot, setNotifyCustomerViaBot] = useState<boolean>(true);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Archive state
    const [archiveList, setArchiveList] = useState<IssuedSalesInvoice[]>([]);
    const [loadingArchive, setLoadingArchive] = useState<boolean>(false);
    const [archiveSearch, setArchiveSearch] = useState<string>('');
    const [archiveTypeFilter, setArchiveTypeFilter] = useState<'all' | 'unofficial' | 'official'>('all');

    // Print / PDF / Bot Modal state
    const [previewInvoice, setPreviewInvoice] = useState<IssuedSalesInvoice | null>(null);
    const [previewMode, setPreviewMode] = useState<InvoiceMode>('unofficial');
    const [isPrinting, setIsPrinting] = useState<boolean>(false);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
    const [isSendingBot, setIsSendingBot] = useState<boolean>(false);

    const fetchPendingRemittances = useCallback(async () => {
        setLoadingRemittances(true);
        setRemError('');
        try {
            const params = new URLSearchParams({
                fiscalYear,
                status: statusFilter,
                limit: '120'
            });
            if (remSearch.trim()) params.set('search', remSearch.trim());
            const resp = await fetch(
                getEffectiveApiUrl(`/sayan/sales-invoices/pending-remittances?${params.toString()}`),
                { headers: buildApiHeaders(false) }
            );
            const data = await resp.json();
            if (!resp.ok || !data?.success) {
                throw new Error(data?.message || 'خطا در دریافت لیست حواله‌های فروش از سایان');
            }
            setRemittances(Array.isArray(data.remittances) ? data.remittances : []);
        } catch (err: any) {
            const msg = err?.message || 'خطا در ارتباط با سرور سایان';
            setRemError(msg);
            setRemittances([]);
        } finally {
            setLoadingRemittances(false);
        }
    }, [fiscalYear, statusFilter, remSearch]);

    const fetchArchive = useCallback(async () => {
        setLoadingArchive(true);
        try {
            const params = new URLSearchParams({
                invoiceType: archiveTypeFilter,
                limit: '200'
            });
            if (archiveSearch.trim()) params.set('search', archiveSearch.trim());
            const resp = await fetch(
                getEffectiveApiUrl(`/sayan/sales-invoices/archive?${params.toString()}`),
                { headers: buildApiHeaders(false) }
            );
            const data = await resp.json();
            if (resp.ok && data?.success) {
                setArchiveList(Array.isArray(data.archive) ? data.archive : []);
            }
        } catch {
            // non-fatal
        } finally {
            setLoadingArchive(false);
        }
    }, [archiveSearch, archiveTypeFilter]);

    useEffect(() => {
        fetchPendingRemittances();
    }, [fetchPendingRemittances]);

    useEffect(() => {
        fetchArchive();
    }, [fetchArchive]);

    const handleSelectRemittance = async (rem: PendingRemittance) => {
        if (rem.isVoided) {
            toast.error('تمام ردیف‌های این حواله فروش در سایان ابطال شده است.');
            return;
        }
        if (rem.isInvoiced) {
            toast.error(
                `برای حواله #${toFaDigits(rem.remittanceNo)} قبلاً فاکتور فروش${rem.linkedInvoiceNo ? ` شماره #${toFaDigits(rem.linkedInvoiceNo)}` : ''} در سایان ثبت شده است.`
            );
            return;
        }
        setLoadingLines(true);
        try {
            const resp = await fetch(
                getEffectiveApiUrl(
                    `/sayan/sales-invoices/remittance-lines/${encodeURIComponent(rem.archiveNo)}?fiscalYear=${encodeURIComponent(rem.fiscalYear || fiscalYear)}`
                ),
                { headers: buildApiHeaders(false) }
            );
            const data = await resp.json();
            if (!resp.ok || !data?.success) {
                throw new Error(data?.message || 'خطا در بارگذاری اقلام حواله فروش');
            }
            if (data.allLinesAlreadyInvoiced) {
                toast.error(`تمام ردیف‌های حواله #${toFaDigits(rem.remittanceNo)} در سایان فاکتور شده‌اند.`);
                fetchPendingRemittances();
                return;
            }
            setSelectedRemittance(data.remittance);
            const items: DraftInvoiceItem[] = (Array.isArray(data.groupedItems) ? data.groupedItems : []).map((it: any) => ({
                itemCode: String(it.itemCode || ''),
                itemName: String(it.itemName || it.itemCode || 'کالا'),
                unitName: String(it.unitName || 'کیلوگرم'),
                unitCode: String(it.unitCode || '12'),
                wareUnitId: String(it.wareUnitId || ''),
                netWeight: Number(it.netWeight) || 0,
                grossWeight: Number(it.grossWeight) || 0,
                cartonCount: Math.max(0, Math.round(Number(it.cartonCount) || 0)),
                bobbinCount: Math.max(0, Math.round(Number(it.bobbinCount) || 0)),
                grade: String(it.grade || ''),
                suggestedUnitPrice: Number(it.suggestedUnitPrice) || 0,
                unitPrice: 0,
                discount: 0,
                note: '',
                sourceRowIds: Array.isArray(it.sourceRowIds) ? it.sourceRowIds : []
            }));
            setDraftItems(items);
            setInvoiceType(null);
            setInvoiceDate(getTodayShamsi());
            setNotes(data.remittance?.description || '');
        } catch (err: any) {
            toast.error(err?.message || 'خطا در دریافت اطلاعات حواله فروش');
        } finally {
            setLoadingLines(false);
        }
    };

    const updateDraftItem = (idx: number, patch: Partial<DraftInvoiceItem>) => {
        setDraftItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
    };

    const applyAllSuggestedPrices = () => {
        let applied = 0;
        setDraftItems((prev) =>
            prev.map((item) => {
                if (item.suggestedUnitPrice > 0) {
                    applied++;
                    return { ...item, unitPrice: item.suggestedUnitPrice };
                }
                return item;
            })
        );
        if (applied > 0) {
            toast.success(`آخرین فی فروش سایان برای ${toFaDigits(applied)} ردیف اعمال شد.`);
        } else {
            toast('سابقه فی قبلی برای کالاهای این حواله یافت نشد.', { icon: 'ℹ️' });
        }
    };

    // Live totals calculation
    // Business rule: When 'official' is chosen at registration time, 10% is added directly to unit price (فی رسمی = فی پایه × 1.10)
    const draftSummary = useMemo(() => {
        const isOfficial = invoiceType === 'official';
        let totalCartons = 0;
        let totalWeight = 0;
        let subtotal = 0;
        let totalDiscount = 0;
        let totalVat = 0;
        let grandTotal = 0;

        const computedRows = draftItems.map((it) => {
            const qty = Number(it.netWeight) || 0;
            const baseUnitPrice = Math.max(0, Math.round(Number(it.unitPrice) || 0));
            const effectiveUnitPrice = isOfficial ? Math.round(baseUnitPrice * 1.10) : baseUnitPrice;
            const vatPerUnit = isOfficial ? Math.max(0, effectiveUnitPrice - baseUnitPrice) : 0;
            const rawAmount = Math.round(qty * baseUnitPrice);
            const discount = Math.max(0, Math.round(Number(it.discount) || 0));
            const afterDiscount = Math.max(0, rawAmount - discount);
            const grossWithVat = isOfficial ? Math.round(qty * effectiveUnitPrice) : rawAmount;
            const lineTotal = Math.max(0, grossWithVat - discount);
            const vat = isOfficial ? Math.max(0, lineTotal - afterDiscount) : 0;

            totalCartons += Math.max(0, Math.round(Number(it.cartonCount) || 0));
            totalWeight += qty;
            subtotal += rawAmount;
            totalDiscount += discount;
            totalVat += vat;
            grandTotal += lineTotal;

            return { ...it, baseUnitPrice, effectiveUnitPrice, vatPerUnit, rawAmount, afterDiscount, vat, lineTotal };
        });

        const totalAfterDiscount = Math.max(0, subtotal - totalDiscount);
        const missingPriceCount = draftItems.filter((it) => !it.unitPrice || it.unitPrice <= 0).length;

        return {
            computedRows,
            totalCartons,
            totalWeight: Number(totalWeight.toFixed(3)),
            subtotal,
            totalDiscount,
            totalAfterDiscount,
            totalVat,
            grandTotal,
            missingPriceCount
        };
    }, [draftItems, invoiceType]);

    const handleRegisterInvoice = async () => {
        if (!selectedRemittance) {
            toast.error('ابتدا حواله فروش مبنا را انتخاب نمایید.');
            return;
        }
        if (invoiceType !== 'official' && invoiceType !== 'unofficial') {
            toast.error('لطفاً پیش از ثبت فاکتور، رسمی یا غیر رسمی بودن آن را انتخاب نمایید.');
            return;
        }
        if (draftItems.length === 0) {
            toast.error('حواله انتخاب‌شده هیچ ردیف کالایی ندارد.');
            return;
        }
        if (draftSummary.missingPriceCount > 0) {
            toast.error(`لطفاً فی واحد تمام ردیف‌ها را وارد نمایید (${toFaDigits(draftSummary.missingPriceCount)} ردیف بدون فی است).`);
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                fiscalYear: selectedRemittance.fiscalYear || fiscalYear,
                baseRemittanceDocId: selectedRemittance.docId,
                baseRemittanceArchiveNo: selectedRemittance.archiveNo,
                baseRemittanceNo: selectedRemittance.remittanceNo,
                customerCode: selectedRemittance.customerCode,
                customerTafsiliCode: selectedRemittance.customerTafsiliCode,
                customerName: selectedRemittance.customerName,
                customerNationalCode: selectedRemittance.customerNationalCode,
                customerMobile: selectedRemittance.customerMobile,
                customerAddress: selectedRemittance.customerAddress,
                warehouseCode: selectedRemittance.warehouseCode,
                warehouseName: selectedRemittance.warehouseName,
                invoiceDate,
                invoiceType,
                subCode: selectedRemittance.subCode || selectedRemittance.remittanceNo,
                notes,
                publishToBot,
                notifyCustomerViaBot,
                currentUser: currentUser
                    ? { id: currentUser.id, username: currentUser.username, fullName: currentUser.fullName }
                    : undefined,
                items: draftItems.map((it) => ({
                    itemCode: it.itemCode,
                    itemName: it.itemName,
                    unitName: it.unitName,
                    unitCode: it.unitCode,
                    wareUnitId: it.wareUnitId,
                    netWeight: it.netWeight,
                    grossWeight: it.grossWeight,
                    cartonCount: it.cartonCount,
                    baseUnitPrice: it.unitPrice,
                    unitPrice: it.unitPrice,
                    discount: it.discount,
                    note: it.note,
                    sourceRowIds: it.sourceRowIds
                }))
            };

            const resp = await fetch(getEffectiveApiUrl('/sayan/sales-invoices/register'), {
                method: 'POST',
                headers: buildApiHeaders(true),
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (!resp.ok || !data?.success || !data?.invoice) {
                throw new Error(data?.message || 'خطا در ثبت فاکتور فروش در سایان');
            }

            toast.success(data.message || 'فاکتور فروش با موفقیت در سایان ثبت شد.');
            if (data.botDelivery?.message) {
                toast(data.botDelivery.message, { icon: data.botDelivery.delivered > 0 ? '🤖' : 'ℹ️', duration: 5000 });
            }

            setPreviewInvoice(data.invoice);
            setPreviewMode(data.invoice.invoiceType || invoiceType);
            setSelectedRemittance(null);
            setDraftItems([]);
            fetchPendingRemittances();
            fetchArchive();
        } catch (err: any) {
            toast.error(err?.message || 'خطا در ثبت فاکتور فروش');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openInvoicePreview = (inv: IssuedSalesInvoice) => {
        setPreviewInvoice(inv);
        setPreviewMode(inv.invoiceType === 'official' ? 'official' : 'unofficial');
    };

    const handleOpenLinkedInvoice = (linkedId?: string | null) => {
        if (!linkedId) return;
        const found = archiveList.find((inv) => inv.id === linkedId);
        if (found) {
            openInvoicePreview(found);
        } else {
            setSubView('archive');
            fetchArchive();
        }
    };

    // Direct Print via Windows Electron native printHtml or clean hidden iframe on Web/Tauri
    const handlePrintInvoice = async () => {
        if (!previewInvoice) return;
        setIsPrinting(true);
        try {
            const resp = await fetch(
                getEffectiveApiUrl(`/sayan/sales-invoices/${encodeURIComponent(previewInvoice.id)}/html?mode=${previewMode}`),
                { headers: buildApiHeaders(false) }
            );
            if (!resp.ok) {
                throw new Error('خطا در دریافت قالب چاپی فاکتور');
            }
            const html = await resp.text();
            const electronApi = (window as any)?.electronAPI;
            if (electronApi && typeof electronApi.printHtml === 'function') {
                const res = await electronApi.printHtml({
                    html,
                    title: `فاکتور فروش #${previewInvoice.invoiceNo}`,
                    pageSize: 'A4',
                    landscape: false,
                    silent: false
                });
                if (!res?.success && res?.error && res.error !== 'cancelled') {
                    throw new Error(res.error);
                }
                return;
            }

            // Fallback: isolated hidden iframe print (works cleanly in Chrome/Edge/Safari/Tauri)
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '210mm';
            iframe.style.height = '297mm';
            iframe.style.border = '0';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow?.document;
            if (!doc) {
                document.body.removeChild(iframe);
                throw new Error('مرورگر اجازه باز کردن پنجره چاپ را نداد.');
            }
            doc.open();
            doc.write(html);
            doc.close();

            setTimeout(() => {
                try {
                    iframe.contentWindow?.focus();
                    iframe.contentWindow?.print();
                } finally {
                    setTimeout(() => {
                        try {
                            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                        } catch {}
                    }, 1500);
                }
            }, 450);
        } catch (err: any) {
            toast.error(err?.message || 'خطا در چاپ فاکتور فروش');
        } finally {
            setIsPrinting(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!previewInvoice) return;
        setIsDownloadingPdf(true);
        try {
            const resp = await fetch(
                getEffectiveApiUrl(`/sayan/sales-invoices/${encodeURIComponent(previewInvoice.id)}/pdf?mode=${previewMode}`),
                { headers: buildApiHeaders(false) }
            );
            if (!resp.ok) {
                const errJson = await resp.json().catch(() => null);
                throw new Error(errJson?.message || 'خطا در تولید فایل PDF فاکتور');
            }
            const blob = await resp.blob();
            const safeNo = String(previewInvoice.invoiceNo || previewInvoice.archiveNo || 'Invoice').replace(/[^a-zA-Z0-9_-]/g, '');
            const fileName = `Factor_${safeNo}_${previewMode === 'official' ? 'Official' : 'Unofficial'}.pdf`;
            await saveBlobAndOpenFile(blob, fileName);
            toast.success('فایل PDF فاکتور آماده و ذخیره شد.');
        } catch (err: any) {
            toast.error(err?.message || 'خطا در دانلود فایل PDF');
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    const handleSendToBot = async (invoice?: IssuedSalesInvoice, modeOverride?: InvoiceMode) => {
        const target = invoice || previewInvoice;
        if (!target) return;
        setIsSendingBot(true);
        try {
            const resp = await fetch(
                getEffectiveApiUrl(`/sayan/sales-invoices/${encodeURIComponent(target.id)}/send-bot`),
                {
                    method: 'POST',
                    headers: buildApiHeaders(true),
                    body: JSON.stringify({ mode: modeOverride || previewMode || target.invoiceType })
                }
            );
            const data = await resp.json();
            if (!resp.ok || !data?.success) {
                throw new Error(data?.message || 'خطا در ارسال فاکتور به ربات مشتری');
            }
            toast.success(data.message || 'فاکتور در ربات مشتری ثبت/ارسال شد.');
            fetchArchive();
        } catch (err: any) {
            toast.error(err?.message || 'خطا در ارسال به ربات مشتری');
        } finally {
            setIsSendingBot(false);
        }
    };

    // Recompute preview totals dynamically when toggling Official / Unofficial mode inside preview modal
    const previewComputed = useMemo(() => {
        if (!previewInvoice) return null;
        const isOfficial = previewMode === 'official';
        const rows = (previewInvoice.items || []).map((it, idx) => {
            const qty = Number(it.netWeight) || 0;
            const storedUnit = Math.max(0, Math.round(Number(it.unitPrice) || 0));
            const storedVatPerUnit = Math.max(0, Math.round(Number(it.vatPerUnit) || 0));
            const baseUnitPrice =
                Number(it.baseUnitPrice) > 0
                    ? Math.round(Number(it.baseUnitPrice))
                    : previewInvoice.invoiceType === 'official' && storedVatPerUnit > 0
                        ? Math.max(0, storedUnit - storedVatPerUnit)
                        : storedUnit;
            const effectiveUnitPrice = isOfficial ? Math.round(baseUnitPrice * 1.10) : baseUnitPrice;
            const vatPerUnit = isOfficial ? Math.max(0, effectiveUnitPrice - baseUnitPrice) : 0;
            const cartons = Math.max(0, Math.round(Number(it.cartonCount) || 0));
            const rawAmount = Math.round(qty * baseUnitPrice);
            const discount = Math.max(0, Math.round(Number(it.discount) || 0));
            const afterDiscount = Math.max(0, rawAmount - discount);
            const grossWithVat = isOfficial ? Math.round(qty * effectiveUnitPrice) : rawAmount;
            const lineTotal = Math.max(0, grossWithVat - discount);
            const vat = isOfficial ? Math.max(0, lineTotal - afterDiscount) : 0;
            return {
                seq: idx + 1,
                itemCode: it.itemCode,
                itemName: it.itemName,
                cartonCount: cartons,
                netWeight: qty,
                unitName: it.unitName || 'کیلوگرم',
                baseUnitPrice,
                vatPerUnit,
                unitPrice: effectiveUnitPrice,
                rawAmount,
                discount,
                afterDiscount,
                vat,
                lineTotal,
                note: it.note || ''
            };
        });
        const totalCartons = rows.reduce((s, r) => s + r.cartonCount, 0);
        const totalWeight = Number(rows.reduce((s, r) => s + r.netWeight, 0).toFixed(3));
        const subtotal = rows.reduce((s, r) => s + r.rawAmount, 0);
        const totalDiscount = rows.reduce((s, r) => s + r.discount, 0);
        const totalAfterDiscount = Math.max(0, subtotal - totalDiscount);
        const totalVat = isOfficial ? rows.reduce((s, r) => s + r.vat, 0) : 0;
        const grandTotal = rows.reduce((s, r) => s + r.lineTotal, 0);
        return {
            isOfficial,
            rows,
            totalCartons,
            totalWeight,
            subtotal,
            totalDiscount,
            totalAfterDiscount,
            totalVat,
            grandTotal
        };
    }, [previewInvoice, previewMode]);

    const companyTitle = settings?.companyName || settings?.appName || 'شرکت تولیدی و صنعتی لپان بافت';

    return (
        <div className="w-full p-2.5 sm:p-5 space-y-4 sm:space-y-5" dir="rtl">
            {/* Header Strip */}
            <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-md border border-indigo-500/20">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                                <Receipt className="w-5 h-5 text-emerald-300" />
                            </div>
                            <div>
                                <h2 className="text-base sm:text-lg font-black tracking-tight">
                                    ثبت و چاپ فاکتور فروش (متصل به سایان و ربات مشتریان)
                                </h2>
                                <p className="text-[11px] sm:text-xs text-slate-300">
                                    انتخاب مبنا از حواله فروش سایان (کد ۲۳) ← بارگذاری خودکار مشتری، کالا و تعداد کارتن ← ورود فی ← چاپ ۲ حالته + ارسال PDF به ربات مشتری
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex bg-white/10 p-1 rounded-xl border border-white/15">
                            <button
                                type="button"
                                onClick={() => setSubView('issue')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    subView === 'issue'
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-200 hover:bg-white/10'
                                }`}
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                صدور فاکتور جدید
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSubView('archive');
                                    fetchArchive();
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    subView === 'archive'
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-200 hover:bg-white/10'
                                }`}
                            >
                                <Archive className="w-3.5 h-3.5" />
                                آرشیو فاکتورها ({toFaDigits(archiveList.length)})
                            </button>
                        </div>

                        <select
                            value={fiscalYear}
                            onChange={(e) => setFiscalYear(e.target.value)}
                            className="bg-white/10 border border-white/20 text-white text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-400"
                        >
                            <option value="4" className="text-slate-900">سال مالی ۱۴۰۵ (۴)</option>
                            <option value="3" className="text-slate-900">سال مالی ۱۴۰۴ (۳)</option>
                            <option value="2" className="text-slate-900">سال مالی ۱۴۰۳ (۲)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* SUB-VIEW 1: ISSUE NEW SALES INVOICE FROM REMITTANCE */}
            {subView === 'issue' && (
                <div className="space-y-4">
                    {!selectedRemittance ? (
                        /* STEP 1: CHOOSE REMITTANCE BASIS (حواله فروش) */
                        <div className="bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 space-y-3.5">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center">۱</span>
                                        انتخاب حواله فروش مبنا از سایان
                                        {!loadingRemittances && (
                                            <span className="px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[11px] font-black">
                                                {toFaDigits(remittances.length)} مورد
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        فقط حواله‌های فروش فعالِ بدون فاکتور در سایان (بررسی زنده جدول ارتباط اسناد) به‌عنوان مبنای آماده صدور نمایش داده می‌شوند.
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="inline-flex bg-white dark:bg-zinc-800 p-1 rounded-xl border border-slate-200 dark:border-zinc-700">
                                        {(
                                            [
                                                { id: 'pending', label: 'در انتظار فاکتور' },
                                                { id: 'all', label: 'همه حواله‌ها' },
                                                { id: 'invoiced', label: 'فاکتور شده' }
                                            ] as const
                                        ).map((st) => (
                                            <button
                                                key={st.id}
                                                type="button"
                                                onClick={() => setStatusFilter(st.id)}
                                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                    statusFilter === st.id
                                                        ? 'bg-indigo-600 text-white shadow-xs'
                                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-700'
                                                }`}
                                            >
                                                {st.label}
                                            </button>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={fetchPendingRemittances}
                                        disabled={loadingRemittances}
                                        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-700 flex items-center gap-1.5"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${loadingRemittances ? 'animate-spin' : ''}`} />
                                        بروزرسانی
                                    </button>
                                </div>
                            </div>

                            {/* Search Bar */}
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                    type="text"
                                    value={remSearch}
                                    onChange={(e) => setRemSearch(e.target.value)}
                                    placeholder="جستجو در شماره حواله، کد بایگانی، نام مشتری یا کد مشتری..."
                                    className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            {remError && (
                                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 shrink-0" />
                                        <span>{remError}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={fetchPendingRemittances}
                                        className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold shrink-0"
                                    >
                                        تلاش مجدد
                                    </button>
                                </div>
                            )}

                            {loadingRemittances || loadingLines ? (
                                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
                                    <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
                                    <span className="text-xs font-bold">
                                        {loadingLines ? 'در حال دریافت اقلام و تعداد کارتن حواله از سایان...' : 'در حال دریافت حواله‌های فروش زنده از سایان...'}
                                    </span>
                                </div>
                            ) : remittances.length === 0 ? (
                                <div className="py-10 text-center text-slate-500 dark:text-slate-400 space-y-1">
                                    <Package className="w-10 h-10 mx-auto text-slate-300 dark:text-zinc-600" />
                                    <p className="text-sm font-bold">حواله فروشی با این فیلتر یافت نشد.</p>
                                    <p className="text-xs">می‌توانید فیلتر را روی «همه حواله‌ها» قرار دهید یا سال مالی را بررسی کنید.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Desktop Table */}
                                    <div className="hidden md:block overflow-x-auto bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800">
                                        <table className="w-full text-xs text-right">
                                            <thead className="bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-200 font-black">
                                                <tr>
                                                    <th className="py-2.5 px-3">شماره حواله</th>
                                                    <th className="py-2.5 px-3">کد بایگانی</th>
                                                    <th className="py-2.5 px-3">تاریخ</th>
                                                    <th className="py-2.5 px-3">مشتری (کد)</th>
                                                    <th className="py-2.5 px-3">انبار</th>
                                                    <th className="py-2.5 px-3 text-center">اقلام / وزن (kg)</th>
                                                    <th className="py-2.5 px-3 text-center">وضعیت</th>
                                                    <th className="py-2.5 px-3 text-center">عملیات</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                                {remittances.map((r) => (
                                                    <tr
                                                        key={`${r.fiscalYear}-${r.archiveNo}`}
                                                        className="hover:bg-indigo-50/50 dark:hover:bg-zinc-800/70 transition-colors"
                                                    >
                                                        <td className="py-2.5 px-3 font-black text-slate-900 dark:text-white">
                                                            #{toFaDigits(r.remittanceNo)}
                                                        </td>
                                                        <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                                                            {toFaDigits(r.archiveNo)}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                                                            {toFaDigits(r.shamsiDate)}
                                                        </td>
                                                        <td className="py-2.5 px-3">
                                                            <div className="font-bold text-slate-900 dark:text-white">{r.customerName}</div>
                                                            <div className="text-[10px] text-slate-500 font-mono">کد: {toFaDigits(r.customerCode)}</div>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                                                            {r.warehouseName}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center">
                                                            <span className="font-bold text-slate-800 dark:text-slate-200">
                                                                {formatFaNumber(r.totalNetWeight, 2)} kg
                                                            </span>
                                                            <span className="block text-[10px] text-slate-500">
                                                                {toFaDigits(r.lineCount)} ردیف
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center">
                                                            {r.isVoided ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 font-bold text-[11px]">
                                                                    ابطال شده
                                                                </span>
                                                            ) : r.isInvoiced ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">
                                                                    <CheckCircle2 className="w-3 h-3" />
                                                                    فاکتور #{toFaDigits(r.linkedInvoiceNo || 'ثبت‌شده')}
                                                                    {r.linkedInvoiceType === 'official' ? ' (رسمی)' : r.linkedInvoiceType === 'unofficial' ? ' (غیررسمی)' : ''}
                                                                </span>
                                                            ) : r.isPartiallyInvoiced ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 font-bold text-[11px]">
                                                                    فاکتور جزئی (باقی‌مانده آماده)
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold text-[11px]">
                                                                    آماده صدور فاکتور
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center">
                                                            <div className="inline-flex items-center gap-1.5">
                                                                {!r.isInvoiced && !r.isVoided ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleSelectRemittance(r)}
                                                                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors"
                                                                    >
                                                                        انتخاب مبنا
                                                                    </button>
                                                                ) : (
                                                                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400 text-[11px] font-bold">
                                                                        {r.isVoided ? 'غیرفعال' : 'صادر شده'}
                                                                    </span>
                                                                )}
                                                                {r.linkedInvoiceId && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenLinkedInvoice(r.linkedInvoiceId)}
                                                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
                                                                        title="چاپ فاکتور ثبت‌شده"
                                                                    >
                                                                        <Printer className="w-3.5 h-3.5" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile / Android Cards */}
                                    <div className="grid grid-cols-1 gap-2.5 md:hidden">
                                        {remittances.map((r) => (
                                            <div
                                                key={`${r.fiscalYear}-${r.archiveNo}`}
                                                className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-3.5 space-y-2.5 shadow-xs"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                                                            {r.customerName}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                                                            <span>حواله #{toFaDigits(r.remittanceNo)}</span>
                                                            <span>•</span>
                                                            <span>بایگانی {toFaDigits(r.archiveNo)}</span>
                                                            <span>•</span>
                                                            <span>{toFaDigits(r.shamsiDate)}</span>
                                                        </div>
                                                    </div>
                                                    {r.isVoided ? (
                                                        <span className="px-2 py-1 rounded-lg bg-rose-100 text-rose-700 text-[10px] font-black shrink-0">
                                                            ابطال شده
                                                        </span>
                                                    ) : r.isInvoiced ? (
                                                        <span className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-black shrink-0">
                                                            فاکتور #{toFaDigits(r.linkedInvoiceNo || 'ثبت‌شده')}
                                                        </span>
                                                    ) : r.isPartiallyInvoiced ? (
                                                        <span className="px-2 py-1 rounded-lg bg-sky-100 text-sky-800 text-[10px] font-black shrink-0">
                                                            فاکتور جزئی
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-800 text-[10px] font-black shrink-0">
                                                            آماده فاکتور
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-3 gap-2 text-[11px] bg-slate-50 dark:bg-zinc-800/70 rounded-lg p-2">
                                                    <div>
                                                        <span className="text-slate-500 block">کد مشتری</span>
                                                        <span className="font-bold text-slate-900 dark:text-white">{toFaDigits(r.customerCode)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500 block">وزن کل</span>
                                                        <span className="font-bold text-slate-900 dark:text-white">{formatFaNumber(r.totalNetWeight, 2)} kg</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500 block">ردیف</span>
                                                        <span className="font-bold text-slate-900 dark:text-white">{toFaDigits(r.lineCount)} قلم</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {!r.isInvoiced && !r.isVoided ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSelectRemittance(r)}
                                                            className="flex-1 py-2.5 rounded-xl bg-indigo-600 active:bg-indigo-700 text-white text-xs font-black"
                                                        >
                                                            انتخاب به‌عنوان مبنای فاکتور
                                                        </button>
                                                    ) : (
                                                        <div className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400 text-xs font-bold text-center">
                                                            {r.isVoided ? 'این حواله ابطال شده است' : `فاکتور فروش #${toFaDigits(r.linkedInvoiceNo || '-')} در سایان ثبت شده است`}
                                                        </div>
                                                    )}
                                                    {r.linkedInvoiceId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenLinkedInvoice(r.linkedInvoiceId)}
                                                            className="px-3.5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                                                        >
                                                            <Printer className="w-4 h-4" />
                                                            چاپ
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        /* STEP 2: ENTER UNIT PRICES & CHOOSE OFFICIAL / UNOFFICIAL MODE */
                        <div className="space-y-4">
                            {/* Back & Selected Basis Summary */}
                            <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-3.5 sm:p-4 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedRemittance(null);
                                                setDraftItems([]);
                                            }}
                                            className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 flex items-center gap-1"
                                        >
                                            <ArrowRight className="w-3.5 h-3.5" />
                                            تغییر حواله مبنا
                                        </button>
                                        <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                                            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">۲</span>
                                            تکمیل فی کالا و صدور فاکتور فروش
                                        </h3>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={applyAllSuggestedPrices}
                                        className="px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border border-amber-300/70 text-xs font-bold flex items-center gap-1.5 hover:bg-amber-200/70 transition-colors"
                                    >
                                        <Coins className="w-3.5 h-3.5" />
                                        اعمال آخرین فی فروش سایان
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-2.5 border border-indigo-100 dark:border-zinc-800">
                                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                            <User className="w-3 h-3 text-indigo-500" />
                                            خریدار (خودکار از حواله)
                                        </div>
                                        <div className="font-black text-slate-900 dark:text-white mt-0.5 truncate">
                                            {selectedRemittance.customerName}
                                        </div>
                                        <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">
                                            کد مشتری: {toFaDigits(selectedRemittance.customerCode)}
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-2.5 border border-indigo-100 dark:border-zinc-800">
                                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                            <FileCheck2 className="w-3 h-3 text-emerald-500" />
                                            حواله فروش مبنا
                                        </div>
                                        <div className="font-black text-slate-900 dark:text-white mt-0.5">
                                            شماره #{toFaDigits(selectedRemittance.remittanceNo)}
                                        </div>
                                        <div className="text-[10px] text-slate-500">
                                            بایگانی {toFaDigits(selectedRemittance.archiveNo)} • {toFaDigits(selectedRemittance.shamsiDate)}
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-2.5 border border-indigo-100 dark:border-zinc-800">
                                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                            <Warehouse className="w-3 h-3 text-amber-500" />
                                            انبار خروجی
                                        </div>
                                        <div className="font-black text-slate-900 dark:text-white mt-0.5 truncate">
                                            {selectedRemittance.warehouseName || `انبار ${toFaDigits(selectedRemittance.warehouseCode)}`}
                                        </div>
                                        <div className="text-[10px] text-slate-500">
                                            تعداد کل: {toFaDigits(draftSummary.totalCartons)} کارتن
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-2.5 border border-indigo-100 dark:border-zinc-800">
                                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                            <Calendar className="w-3 h-3 text-blue-500" />
                                            تاریخ فاکتور (شمسی)
                                        </div>
                                        <input
                                            type="text"
                                            value={invoiceDate}
                                            onChange={(e) => setInvoiceDate(e.target.value)}
                                            className="mt-1 w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 dark:text-white text-center dir-ltr"
                                            placeholder="1405/09/02"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* MANDATORY 2-MODE SELECTOR AT REGISTRATION TIME: UNOFFICIAL vs OFFICIAL (+10% ADDED TO UNIT PRICE) */}
                            <div
                                className={`rounded-2xl p-3 sm:p-4 border-2 space-y-2.5 transition-colors ${
                                    invoiceType === null
                                        ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-950/20'
                                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                                }`}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black">الزامی</span>
                                        تعیین وضعیت رسمی یا غیر رسمی فاکتور پیش از ثبت در سایان
                                    </div>
                                    {invoiceType === null && (
                                        <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                            یکی از دو حالت زیر را انتخاب کنید
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setInvoiceType('unofficial')}
                                        className={`text-right p-4 rounded-2xl border-2 transition-all flex items-start gap-3 ${
                                            invoiceType === 'unofficial'
                                                ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/30 shadow-sm'
                                                : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-emerald-300'
                                        }`}
                                    >
                                        <div
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                invoiceType === 'unofficial'
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-500'
                                            }`}
                                        >
                                            <Receipt className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                                    فاکتور غیر رسمی (فی بدون ۱۰٪)
                                                </span>
                                                {invoiceType === 'unofficial' && (
                                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                                                فی دقیقاً همان مبلغ واردشده در سایان ثبت می‌شود • چاپ با <strong>تعداد کارتن</strong> و <strong>بدون ۱۰٪</strong>
                                            </p>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setInvoiceType('official')}
                                        className={`text-right p-4 rounded-2xl border-2 transition-all flex items-start gap-3 ${
                                            invoiceType === 'official'
                                                ? 'border-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/30 shadow-sm'
                                                : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-300'
                                        }`}
                                    >
                                        <div
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                invoiceType === 'official'
                                                    ? 'bg-indigo-700 text-white'
                                                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-500'
                                            }`}
                                        >
                                            <Percent className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                                    فاکتور رسمی (+۱۰٪ به فی اضافه می‌شود)
                                                </span>
                                                {invoiceType === 'official' && (
                                                    <CheckCircle2 className="w-5 h-5 text-indigo-700 shrink-0" />
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                                                <strong>۱۰٪ مستقیم به فی هر کالا اضافه</strong> (فی × ۱٫۱۰) و در سایان ثبت می‌شود • چاپ با <strong>تعداد کارتن + ۱۰٪</strong>
                                            </p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* ITEMS PRICING TABLE (Desktop) */}
                            <div className="hidden md:block overflow-x-auto bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs">
                                <table className="w-full text-xs text-right">
                                    <thead className="bg-slate-900 text-white font-bold">
                                        <tr>
                                            <th className="py-3 px-3 text-center w-10">#</th>
                                            <th className="py-3 px-3">کالا (خودکار از حواله)</th>
                                            <th className="py-3 px-3 text-center w-24">تعداد کارتن</th>
                                            <th className="py-3 px-3 text-center w-28">وزن خالص (kg)</th>
                                            <th className="py-3 px-3 w-48">
                                                {invoiceType === 'official' ? 'فی پایه (ریال) *' : 'فی واحد (ریال) *'}
                                            </th>
                                            {invoiceType === 'official' && (
                                                <th className="py-3 px-3 text-center w-36 bg-indigo-900">فی رسمی (+۱۰٪)</th>
                                            )}
                                            <th className="py-3 px-3 w-32">تخفیف (ریال)</th>
                                            {invoiceType === 'official' && (
                                                <th className="py-3 px-3 text-center w-32">ارزش افزوده (۱۰٪)</th>
                                            )}
                                            <th className="py-3 px-3 text-center w-36">جمع ردیف (ریال)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                        {draftSummary.computedRows.map((row, idx) => (
                                            <tr key={`${row.itemCode}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50">
                                                <td className="py-3 px-3 text-center font-black text-slate-500">
                                                    {toFaDigits(idx + 1)}
                                                </td>
                                                <td className="py-3 px-3">
                                                    <div className="font-black text-slate-900 dark:text-white">{row.itemName}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono">
                                                        کد کالا: {toFaDigits(row.itemCode)}
                                                        {row.grade ? ` • گرید ${row.grade}` : ''}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3 text-center">
                                                    <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-black">
                                                        {toFaDigits(row.cartonCount)} کارتن
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-center font-black text-slate-800 dark:text-slate-100">
                                                    {formatFaNumber(row.netWeight, 2)}
                                                </td>
                                                <td className="py-3 px-3">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={row.unitPrice > 0 ? row.unitPrice.toLocaleString('en-US') : ''}
                                                        onChange={(e) =>
                                                            updateDraftItem(idx, { unitPrice: parseNumericInput(e.target.value) })
                                                        }
                                                        placeholder="مثلاً 1,850,000"
                                                        className={`w-full px-3 py-2 rounded-xl border text-sm font-black dir-ltr text-left outline-none focus:ring-2 ${
                                                            row.unitPrice > 0
                                                                ? 'border-emerald-300 bg-emerald-50/40 dark:bg-zinc-800 text-slate-900 dark:text-white focus:ring-emerald-500'
                                                                : 'border-amber-400 bg-amber-50/40 dark:bg-zinc-800 text-slate-900 dark:text-white focus:ring-amber-500'
                                                        }`}
                                                    />
                                                    {row.suggestedUnitPrice > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => updateDraftItem(idx, { unitPrice: row.suggestedUnitPrice })}
                                                            className="mt-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                                        >
                                                            آخرین فی سایان: {formatFaNumber(row.suggestedUnitPrice)} ریال
                                                        </button>
                                                    )}
                                                </td>
                                                {invoiceType === 'official' && (
                                                    <td className="py-3 px-3 text-center bg-indigo-50/50 dark:bg-indigo-950/20">
                                                        <div className="font-black text-indigo-800 dark:text-indigo-300 text-sm">
                                                            {formatFaNumber(row.effectiveUnitPrice)}
                                                        </div>
                                                        <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">
                                                            +{formatFaNumber(row.vatPerUnit)} ریال
                                                        </div>
                                                    </td>
                                                )}
                                                <td className="py-3 px-3">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={row.discount > 0 ? row.discount.toLocaleString('en-US') : ''}
                                                        onChange={(e) =>
                                                            updateDraftItem(idx, { discount: parseNumericInput(e.target.value) })
                                                        }
                                                        placeholder="0"
                                                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold dir-ltr text-left text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </td>
                                                {invoiceType === 'official' && (
                                                    <td className="py-3 px-3 text-center font-bold text-indigo-700 dark:text-indigo-300">
                                                        {formatFaNumber(row.vat)}
                                                    </td>
                                                )}
                                                <td className="py-3 px-3 text-center font-black text-slate-900 dark:text-white">
                                                    {formatFaNumber(row.lineTotal)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* ITEMS PRICING CARDS (Mobile Web & Android) */}
                            <div className="space-y-3 md:hidden">
                                {draftSummary.computedRows.map((row, idx) => (
                                    <div
                                        key={`${row.itemCode}-${idx}`}
                                        className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-3.5 space-y-3 shadow-xs"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="text-sm font-black text-slate-900 dark:text-white">
                                                    {toFaDigits(idx + 1)}. {row.itemName}
                                                </div>
                                                <div className="text-[11px] text-slate-500 font-mono">
                                                    کد: {toFaDigits(row.itemCode)}
                                                </div>
                                            </div>
                                            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-black shrink-0">
                                                {toFaDigits(row.cartonCount)} کارتن
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-zinc-800/70 rounded-xl p-2.5">
                                            <div>
                                                <span className="text-[10px] text-slate-500 block">وزن خالص</span>
                                                <span className="font-black text-slate-900 dark:text-white">
                                                    {formatFaNumber(row.netWeight, 2)} کیلوگرم
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-slate-500 block">جمع این ردیف</span>
                                                <span className="font-black text-emerald-700 dark:text-emerald-400">
                                                    {formatFaNumber(row.lineTotal)} ریال
                                                </span>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <label className="text-xs font-black text-slate-700 dark:text-slate-200">
                                                        {invoiceType === 'official' ? 'فی پایه (ریال) *' : 'فی واحد (ریال) *'}
                                                    </label>
                                                    {row.suggestedUnitPrice > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => updateDraftItem(idx, { unitPrice: row.suggestedUnitPrice })}
                                                            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400"
                                                        >
                                                            آخرین فی: {formatFaNumber(row.suggestedUnitPrice)}
                                                        </button>
                                                    )}
                                                </div>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={row.unitPrice > 0 ? row.unitPrice.toLocaleString('en-US') : ''}
                                                    onChange={(e) =>
                                                        updateDraftItem(idx, { unitPrice: parseNumericInput(e.target.value) })
                                                    }
                                                    placeholder="فی هر کیلوگرم به ریال..."
                                                    className="w-full px-3.5 py-2.5 rounded-xl border-2 border-indigo-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-base font-black dir-ltr text-left text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                                                />
                                                {invoiceType === 'official' && row.unitPrice > 0 && (
                                                    <div className="mt-1.5 flex items-center justify-between px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs">
                                                        <span className="font-bold text-indigo-800 dark:text-indigo-300">فی رسمی (+۱۰٪):</span>
                                                        <span className="font-black text-indigo-900 dark:text-white">
                                                            {formatFaNumber(row.effectiveUnitPrice)} ریال
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                                                    تخفیف ردیف (اختیاری - ریال)
                                                </label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={row.discount > 0 ? row.discount.toLocaleString('en-US') : ''}
                                                    onChange={(e) =>
                                                        updateDraftItem(idx, { discount: parseNumericInput(e.target.value) })
                                                    }
                                                    placeholder="0"
                                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold dir-ltr text-left text-slate-800 dark:text-white"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Notes + Bot Publishing Options + Totals Footer */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                <div className="lg:col-span-7 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-4 space-y-3">
                                    <div>
                                        <label className="text-xs font-black text-slate-700 dark:text-slate-200 block mb-1.5">
                                            توضیحات فاکتور (در نسخه چاپی و سایان ثبت می‌شود)
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="مثلاً: تسویه طبق توافق / ارسال با باربری..."
                                            className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-zinc-800">
                                        <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={publishToBot}
                                                onChange={(e) => setPublishToBot(e.target.checked)}
                                                className="w-4 h-4 rounded text-indigo-600"
                                            />
                                            <Bot className="w-4 h-4 text-indigo-600 shrink-0" />
                                            <span>
                                                انتشار در ربات مشتریان (مشتری با کد مشتری <strong>{toFaDigits(selectedRemittance.customerCode)}</strong> فایل PDF را در ربات دریافت کند)
                                            </span>
                                        </label>
                                        {publishToBot && (
                                            <label className="flex items-center gap-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer pr-6">
                                                <input
                                                    type="checkbox"
                                                    checked={notifyCustomerViaBot}
                                                    onChange={(e) => setNotifyCustomerViaBot(e.target.checked)}
                                                    className="w-4 h-4 rounded text-emerald-600"
                                                />
                                                <span>ارسال فوری فایل PDF فاکتور به چت ربات مشتری (در صورت متصل بودن حساب)</span>
                                            </label>
                                        )}
                                    </div>
                                </div>

                                <div className="lg:col-span-5 bg-slate-900 text-white rounded-2xl p-4 space-y-2.5 shadow-md">
                                    <div className="flex items-center justify-between text-xs text-slate-300">
                                        <span>مجموع کارتن و وزن خالص:</span>
                                        <span className="font-bold text-white">
                                            {toFaDigits(draftSummary.totalCartons)} کارتن • {formatFaNumber(draftSummary.totalWeight, 2)} کیلوگرم
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-slate-300">
                                        <span>جمع مبلغ کالاها:</span>
                                        <span className="font-bold text-white">{formatFaNumber(draftSummary.subtotal)} ریال</span>
                                    </div>
                                    {draftSummary.totalDiscount > 0 && (
                                        <div className="flex items-center justify-between text-xs text-rose-300">
                                            <span>جمع تخفیف:</span>
                                            <span className="font-bold">− {formatFaNumber(draftSummary.totalDiscount)} ریال</span>
                                        </div>
                                    )}
                                    {invoiceType === 'official' && (
                                        <div className="flex items-center justify-between text-xs text-indigo-300">
                                            <span>مالیات بر ارزش افزوده (۱۰٪):</span>
                                            <span className="font-bold">+ {formatFaNumber(draftSummary.totalVat)} ریال</span>
                                        </div>
                                    )}
                                    <div className="border-t border-white/15 pt-2.5 flex items-center justify-between">
                                        <span className="text-xs font-bold text-emerald-300">مبلغ قابل پرداخت:</span>
                                        <div className="text-left">
                                            <div className="text-base sm:text-lg font-black text-emerald-300">
                                                {formatFaNumber(draftSummary.grandTotal)} ریال
                                            </div>
                                            <div className="text-[10px] text-slate-300">
                                                معادل {formatFaNumber(Math.floor(draftSummary.grandTotal / 10))} تومان
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={isSubmitting || !invoiceType || draftSummary.missingPriceCount > 0}
                                        onClick={handleRegisterInvoice}
                                        className="w-full mt-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                در حال ثبت در سایان و انتشار در ربات...
                                            </>
                                        ) : !invoiceType ? (
                                            <>
                                                <AlertCircle className="w-4 h-4" />
                                                ابتدا رسمی یا غیر رسمی بودن فاکتور را انتخاب کنید
                                            </>
                                        ) : (
                                            <>
                                                <ShieldCheck className="w-4 h-4" />
                                                ثبت فاکتور {invoiceType === 'official' ? 'رسمی (+۱۰٪ روی فی)' : 'غیر رسمی'} در سایان
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* SUB-VIEW 2: ISSUED SALES INVOICES ARCHIVE */}
            {subView === 'archive' && (
                <div className="bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 space-y-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                value={archiveSearch}
                                onChange={(e) => setArchiveSearch(e.target.value)}
                                placeholder="جستجو در شماره فاکتور، شماره حواله، نام یا کد مشتری..."
                                className="w-full pr-10 pl-4 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <select
                                value={archiveTypeFilter}
                                onChange={(e) => setArchiveTypeFilter(e.target.value as any)}
                                className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-800 dark:text-white"
                            >
                                <option value="all">همه نوع فاکتور</option>
                                <option value="unofficial">فقط غیر رسمی</option>
                                <option value="official">فقط رسمی (با ۱۰٪)</option>
                            </select>
                            <button
                                type="button"
                                onClick={fetchArchive}
                                disabled={loadingArchive}
                                className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${loadingArchive ? 'animate-spin' : ''}`} />
                                بروزرسانی
                            </button>
                        </div>
                    </div>

                    {loadingArchive ? (
                        <div className="py-10 flex items-center justify-center gap-2 text-slate-500 text-xs font-bold">
                            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                            در حال بارگذاری آرشیو فاکتورهای صادرشده...
                        </div>
                    ) : archiveList.length === 0 ? (
                        <div className="py-10 text-center text-slate-500 space-y-1">
                            <FileText className="w-10 h-10 mx-auto text-slate-300" />
                            <p className="text-sm font-bold">هنوز فاکتور فروشی از این بخش صادر نشده است.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {archiveList.map((inv) => (
                                <div
                                    key={inv.id}
                                    className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-3.5 space-y-3 shadow-xs hover:border-indigo-300 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                                    فاکتور #{toFaDigits(inv.invoiceNo)}
                                                </span>
                                                <span
                                                    className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                                        inv.invoiceType === 'official'
                                                            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200'
                                                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                                                    }`}
                                                >
                                                    {inv.invoiceType === 'official' ? 'رسمی (+۱۰٪)' : 'غیر رسمی'}
                                                </span>
                                            </div>
                                            <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1 truncate">
                                                {inv.customerName}
                                            </div>
                                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                                <span>کد مشتری: {toFaDigits(inv.customerCode)}</span>
                                                <span>•</span>
                                                <span>حواله #{toFaDigits(inv.baseRemittanceNo)}</span>
                                                <span>•</span>
                                                <span>{toFaDigits(inv.shamsiDate)}</span>
                                            </div>
                                        </div>
                                        {inv.publishedToBot !== false && (
                                            <span
                                                className="px-2 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-[10px] font-bold flex items-center gap-1 shrink-0"
                                                title="در ربات مشتریان فعال است"
                                            >
                                                <Bot className="w-3 h-3" />
                                                در ربات
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-[11px] bg-slate-50 dark:bg-zinc-800/70 rounded-xl p-2">
                                        <div>
                                            <span className="text-slate-500 block">کارتن</span>
                                            <span className="font-black text-slate-900 dark:text-white">{toFaDigits(inv.totalCartons)}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 block">وزن کل</span>
                                            <span className="font-black text-slate-900 dark:text-white">{formatFaNumber(inv.totalNetWeight, 2)} kg</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 block">مبلغ کل</span>
                                            <span className="font-black text-emerald-700 dark:text-emerald-400">
                                                {formatFaNumber(inv.grandTotal)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openInvoicePreview(inv)}
                                            className="flex-1 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                                        >
                                            <Printer className="w-3.5 h-3.5" />
                                            پیش‌نمایش / چاپ / PDF
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isSendingBot}
                                            onClick={() => handleSendToBot(inv, inv.invoiceType)}
                                            className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1"
                                            title="ارسال مجدد فایل PDF به ربات مشتری"
                                        >
                                            <Send className="w-3.5 h-3.5" />
                                            ربات
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ATTRACTIVE 2-MODE PRINT & PDF PREVIEW MODAL */}
            {previewInvoice && previewComputed && createPortal(
                <div
                    className="fixed inset-0 z-[100000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
                    dir="rtl"
                >
                    <div className="bg-slate-100 dark:bg-zinc-900 w-full max-w-5xl max-h-[95vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-700 flex flex-col overflow-hidden">
                        {/* Modal Action Bar */}
                        <div className="bg-slate-900 text-white px-3.5 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm sm:text-base font-black">
                                    فاکتور فروش #{toFaDigits(previewInvoice.invoiceNo)}
                                </span>
                                <span className="text-[11px] bg-white/10 px-2 py-0.5 rounded-md text-slate-200">
                                    بایگانی سایان: {toFaDigits(previewInvoice.archiveNo)}
                                </span>
                            </div>

                            {/* Live 2-Mode Switcher */}
                            <div className="inline-flex bg-white/10 p-1 rounded-xl border border-white/15">
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode('unofficial')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                        previewMode === 'unofficial'
                                            ? 'bg-emerald-500 text-slate-950 shadow-sm'
                                            : 'text-slate-200 hover:bg-white/10'
                                    }`}
                                >
                                    غیر رسمی (با کارتن • بدون ۱۰٪)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode('official')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                                        previewMode === 'official'
                                            ? 'bg-indigo-400 text-slate-950 shadow-sm'
                                            : 'text-slate-200 hover:bg-white/10'
                                    }`}
                                >
                                    رسمی (با کارتن + ۱۰٪ ارزش افزوده)
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                <button
                                    type="button"
                                    disabled={isPrinting}
                                    onClick={handlePrintInvoice}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5"
                                >
                                    {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                                    چاپ مستقیم
                                </button>
                                <button
                                    type="button"
                                    disabled={isDownloadingPdf}
                                    onClick={handleDownloadPdf}
                                    className="px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-black flex items-center gap-1.5"
                                >
                                    {isDownloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    فایل PDF
                                </button>
                                <button
                                    type="button"
                                    disabled={isSendingBot}
                                    onClick={() => handleSendToBot(previewInvoice, previewMode)}
                                    className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black flex items-center gap-1.5"
                                >
                                    {isSendingBot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                                    ارسال به ربات مشتری
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewInvoice(null)}
                                    className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-500 text-white transition-colors"
                                    aria-label="بستن"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Visual A4 Invoice Sheet Preview */}
                        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
                            <div className="bg-white text-slate-900 max-w-[210mm] mx-auto rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                                {/* Top Banner */}
                                <div
                                    className={`px-5 sm:px-7 py-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                        previewComputed.isOfficial
                                            ? 'bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900'
                                            : 'bg-gradient-to-l from-emerald-950 via-teal-900 to-slate-900'
                                    }`}
                                >
                                    <div>
                                        <div className="text-lg sm:text-xl font-black">{companyTitle}</div>
                                        <div className="text-xs text-slate-200 mt-0.5">
                                            {previewComputed.isOfficial
                                                ? 'صورتحساب رسمی فروش کالا (مشمول ۱۰٪ مالیات بر ارزش افزوده)'
                                                : 'فاکتور فروش کالا (غیر رسمی — بدون ۱۰٪ ارزش افزوده)'}
                                        </div>
                                    </div>
                                    <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-xs space-y-1">
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-slate-300">شماره فاکتور:</span>
                                            <span className="font-black text-sm">#{toFaDigits(previewInvoice.invoiceNo)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-slate-300">تاریخ صدور:</span>
                                            <span className="font-bold">{toFaDigits(previewInvoice.shamsiDate)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                            <span className="text-slate-300">حواله مبنا:</span>
                                            <span className="font-bold">#{toFaDigits(previewInvoice.baseRemittanceNo)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 sm:p-7 space-y-5">
                                    {/* Buyer Info Box */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
                                        <div className="space-y-1">
                                            <div className="text-[11px] font-bold text-slate-500">مشخصات خریدار</div>
                                            <div className="text-sm font-black text-slate-900">{previewInvoice.customerName}</div>
                                            <div className="text-slate-600">
                                                کد مشتری (دریافت در ربات): <strong className="font-mono">{toFaDigits(previewInvoice.customerCode)}</strong>
                                            </div>
                                            {previewInvoice.customerNationalCode && (
                                                <div className="text-slate-600">کد ملی/اقتصادی: {toFaDigits(previewInvoice.customerNationalCode)}</div>
                                            )}
                                        </div>
                                        <div className="space-y-1 sm:border-r sm:border-slate-200 sm:pr-4">
                                            <div className="text-[11px] font-bold text-slate-500">اطلاعات تحویل و انبار</div>
                                            <div className="font-bold text-slate-800">
                                                انبار خروجی: {previewInvoice.warehouseName || toFaDigits(previewInvoice.warehouseCode || '-')}
                                            </div>
                                            <div className="text-slate-600">
                                                مجموع بار: <strong>{toFaDigits(previewComputed.totalCartons)} کارتن</strong> ({formatFaNumber(previewComputed.totalWeight, 2)} کیلوگرم)
                                            </div>
                                            {previewInvoice.customerAddress && (
                                                <div className="text-slate-600 text-[11px]">نشانی: {previewInvoice.customerAddress}</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Invoice Line Table */}
                                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                                        <table className="w-full text-xs text-right">
                                            <thead
                                                className={
                                                    previewComputed.isOfficial
                                                        ? 'bg-indigo-950 text-white'
                                                        : 'bg-emerald-900 text-white'
                                                }
                                            >
                                                <tr>
                                                    <th className="py-2.5 px-2.5 text-center w-9">ردیف</th>
                                                    <th className="py-2.5 px-3">شرح کالا</th>
                                                    <th className="py-2.5 px-2.5 text-center">تعداد کارتن</th>
                                                    <th className="py-2.5 px-2.5 text-center">وزن خالص (kg)</th>
                                                    <th className="py-2.5 px-2.5 text-center">
                                                        {previewComputed.isOfficial ? 'فی رسمی (+۱۰٪)' : 'فی واحد (ریال)'}
                                                    </th>
                                                    <th className="py-2.5 px-2.5 text-center">مبلغ کل (ریال)</th>
                                                    {previewComputed.isOfficial && (
                                                        <th className="py-2.5 px-2.5 text-center">مالیات (۱۰٪)</th>
                                                    )}
                                                    <th className="py-2.5 px-3 text-center">جمع نهایی (ریال)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                                {previewComputed.rows.map((r, idx) => (
                                                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                                                        <td className="py-2.5 px-2.5 text-center font-bold">{toFaDigits(r.seq)}</td>
                                                        <td className="py-2.5 px-3">
                                                            <div className="font-black text-slate-900">{r.itemName}</div>
                                                            <div className="text-[10px] text-slate-500 font-mono">کد: {toFaDigits(r.itemCode)}</div>
                                                        </td>
                                                        <td className="py-2.5 px-2.5 text-center font-black text-indigo-900">
                                                            {toFaDigits(r.cartonCount)} کارتن
                                                        </td>
                                                        <td className="py-2.5 px-2.5 text-center font-bold">
                                                            {formatFaNumber(r.netWeight, 2)}
                                                        </td>
                                                        <td className="py-2.5 px-2.5 text-center font-bold">
                                                            <div>{formatFaNumber(r.unitPrice)}</div>
                                                            {previewComputed.isOfficial && (
                                                                <div className="text-[10px] text-slate-500 font-normal">
                                                                    پایه: {formatFaNumber(r.baseUnitPrice)}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="py-2.5 px-2.5 text-center font-bold">
                                                            {formatFaNumber(r.rawAmount)}
                                                        </td>
                                                        {previewComputed.isOfficial && (
                                                            <td className="py-2.5 px-2.5 text-center font-bold text-indigo-700">
                                                                {formatFaNumber(r.vat)}
                                                            </td>
                                                        )}
                                                        <td className="py-2.5 px-3 text-center font-black text-slate-900">
                                                            {formatFaNumber(r.lineTotal)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-slate-100 font-black border-t-2 border-slate-300">
                                                <tr>
                                                    <td colSpan={2} className="py-2.5 px-3 text-left">جمع کل:</td>
                                                    <td className="py-2.5 px-2.5 text-center">{toFaDigits(previewComputed.totalCartons)} کارتن</td>
                                                    <td className="py-2.5 px-2.5 text-center">{formatFaNumber(previewComputed.totalWeight, 2)}</td>
                                                    <td className="py-2.5 px-2.5 text-center">—</td>
                                                    <td className="py-2.5 px-2.5 text-center">{formatFaNumber(previewComputed.subtotal)}</td>
                                                    {previewComputed.isOfficial && (
                                                        <td className="py-2.5 px-2.5 text-center text-indigo-800">{formatFaNumber(previewComputed.totalVat)}</td>
                                                    )}
                                                    <td className="py-2.5 px-3 text-center text-emerald-800">{formatFaNumber(previewComputed.grandTotal)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>

                                    {/* Summary & Amount in Words */}
                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
                                        <div className="sm:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between text-xs space-y-2">
                                            <div>
                                                <div className="text-[11px] font-bold text-slate-500">مبلغ قابل پرداخت به حروف:</div>
                                                <div className="font-black text-slate-900 mt-1 leading-relaxed">
                                                    {(() => {
                                                        const w = formatChequeAmountInWords(previewComputed.grandTotal);
                                                        return `${w.rialWords} (${w.tomanWords})`;
                                                    })()}
                                                </div>
                                            </div>
                                            {previewInvoice.notes && (
                                                <div className="pt-2 border-t border-slate-200 text-slate-700">
                                                    <strong>توضیحات:</strong> {previewInvoice.notes}
                                                </div>
                                            )}
                                        </div>

                                        <div className="sm:col-span-5 border border-slate-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">جمع مبلغ کالاها:</span>
                                                <span className="font-bold">{formatFaNumber(previewComputed.subtotal)} ریال</span>
                                            </div>
                                            {previewComputed.totalDiscount > 0 && (
                                                <div className="flex justify-between text-rose-600">
                                                    <span>تخفیف:</span>
                                                    <span className="font-bold">− {formatFaNumber(previewComputed.totalDiscount)} ریال</span>
                                                </div>
                                            )}
                                            {previewComputed.isOfficial && (
                                                <div className="flex justify-between text-indigo-700">
                                                    <span>مالیات بر ارزش افزوده (۱۰٪):</span>
                                                    <span className="font-bold">+ {formatFaNumber(previewComputed.totalVat)} ریال</span>
                                                </div>
                                            )}
                                            <div className="pt-2 mt-1 border-t-2 border-slate-900 flex justify-between items-center text-sm font-black">
                                                <span>جمع قابل پرداخت:</span>
                                                <span className={previewComputed.isOfficial ? 'text-indigo-900' : 'text-emerald-800'}>
                                                    {formatFaNumber(previewComputed.grandTotal)} ریال
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Signatures */}
                                    <div className="grid grid-cols-3 gap-3 pt-4 border-t border-dashed border-slate-300 text-center text-[11px] text-slate-600">
                                        <div className="h-16 flex flex-col justify-between">
                                            <span className="font-black text-slate-800">واحد فروش / صادرکننده</span>
                                            <span>{previewInvoice.createdBy || 'مهر و امضا'}</span>
                                        </div>
                                        <div className="h-16 flex flex-col justify-between">
                                            <span className="font-black text-slate-800">واحد مالی و حسابداری</span>
                                            <span>ثبت سیستمی سایان</span>
                                        </div>
                                        <div className="h-16 flex flex-col justify-between">
                                            <span className="font-black text-slate-800">مهر و امضای خریدار</span>
                                            <span>{previewInvoice.customerName}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default SayanSalesInvoiceIssuer;
