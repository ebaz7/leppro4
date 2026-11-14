import React, { useState } from 'react';
import { TradeRecord, PetrochemicalPurchaseData, User, SystemSettings } from '../../types';
import { formatCurrency, formatNumberString, deformatNumberString, formatDate } from '../../constants';
import { 
    Building2, FileText, Landmark, Truck, Warehouse, Calculator, Plus, Trash2, 
    CheckCircle2, Clock, AlertCircle, ShieldCheck, Scale, FileSpreadsheet, Paperclip, 
    ChevronRight, Save, Printer, FileDown, Phone, CreditCard, ArrowRightLeft, 
    Check, Calendar, DollarSign, Percent, AlertTriangle, ExternalLink, HelpCircle
} from 'lucide-react';
import { TradeDatePicker } from '../TradeDatePicker';
import { PrintDomesticPetrochemical } from '../print/PrintDomesticPetrochemical';
import { TradeAttachmentSection } from './TradeAttachmentSection';

interface DomesticPetrochemicalTabProps {
    record: TradeRecord;
    onUpdateRecord: (updatedRecord: TradeRecord) => Promise<void> | void;
    currentUser: User;
    settings?: SystemSettings | null;
}

export const DomesticPetrochemicalTab: React.FC<DomesticPetrochemicalTabProps> = ({
    record,
    onUpdateRecord,
    currentUser,
    settings
}) => {
    const [subTab, setSubTab] = useState<'contract' | 'settlement' | 'loading_shipping' | 'warehouse' | 'costing'>('contract');
    const [showPrintModal, setShowPrintModal] = useState(false);

    // New Cash Payment Row State
    const [newCashPayment, setNewCashPayment] = useState({
        trackingNumber: '',
        bankName: '',
        destinationAccount: '',
        amount: 0,
        amountStr: '',
        paymentDate: '',
        description: ''
    });

    // New Other Cost Item
    const [newCostItem, setNewCostItem] = useState({
        title: '',
        amount: 0,
        amountStr: '',
        description: ''
    });

    const petroData: PetrochemicalPurchaseData = record.petrochemicalData || {
        petrochemicalName: record.sellerName || 'پتروشیمی شهید تندگویان',
        brokerName: 'کارگزاری بورس کالا',
        contractNumber: record.registrationNumber || '',
        offeringCode: '',
        proformaNumber: record.proformaNumber || '',
        proformaDate: record.startDate ? record.startDate.split('T')[0] : '',
        paymentMethod: 'internal_lc',
        gradeName: record.goodsName || 'چیپس پلی استر نساجی TG642',
        quantityKg: (record.items || []).reduce((s, i) => s + (i.weight || 0), 0) || 50000,
        basePricePerKg: 0,
        competitionPercent: 0,
        totalGoodsPrice: 0,
        vatAmount: 0,
        brokerageFee: 0,
        otherFees: 0,
        totalInvoiceAmount: 0,
        bourseSettlementDeadline: '',
        cashSettlement: {
            isSettled: false,
            settlementDate: '',
            payments: []
        },
        internalLc: {
            lcNumber: '',
            issuingBank: 'بانک تجارت',
            branch: 'شعبه مرکزی',
            branchCode: '',
            lcType: 'sight',
            usanceDays: 90,
            issueDate: '',
            dueDate: '',
            expiryDate: '',
            latestShipmentDate: '',
            lcAmount: 0,
            prepaymentAmount: 0,
            prepaymentPercent: 10,
            collateralDesc: 'چک و سفته شرکتی',
            commissionFee: 0,
            extensionFee: 0,
            taxStampFee: 0,
            notificationNumber: '',
            notificationDate: '',
            status: 'draft'
        },
        draftBarat: {
            baratNumber: '',
            sepamCode: '',
            bankName: 'بانک ملت',
            branchName: '',
            issueDate: '',
            dueDate: '',
            tenorDays: 90,
            amount: 0,
            interestRatePercent: 0,
            interestAmount: 0,
            sepamFee: 0,
            collateralDesc: 'چک تضمین و حد اعتباری',
            drawerName: record.company || 'شرکت کارخانجات',
            draweeName: 'بانک عامل / پتروشیمی',
            beneficiaryName: record.sellerName || 'شرکت پتروشیمی',
            status: 'draft'
        },
        loadingNotice: {
            remittanceNumber: '',
            remittanceDate: '',
            behenyabCode: '',
            loadingTerminal: '',
            loadingDeadline: '',
            transportCompany: '',
            driverName: '',
            driverPhone: '',
            driverNationalCode: '',
            truckPlate: '',
            waybillNumber: '',
            freightCostRial: 0,
            prepaidFreight: 0,
            remainingFreight: 0,
            weighbridgeCostOrigin: 0,
            cargoInsuranceCost: 0,
            loadingDate: '',
            deliveryStatus: 'pending_loading'
        },
        warehouseReceipt: {
            receiptNumber: '',
            weighbridgeSlipNumber: '',
            grossWeightKg: 0,
            tareWeightKg: 0,
            receivedWeightKg: 0,
            weighbridgeVarianceKg: 0,
            variancePercent: 0,
            varianceAction: 'acceptable_tolerance',
            receiptDate: '',
            warehouseName: 'انبار مرکزی مواد اولیه کارخانه',
            receiverName: '',
            qcBatchNumber: '',
            qcStatus: 'pending',
            qcMfi: '',
            qcIv: '',
            qcMoisture: '',
            qcNotes: '',
            isConfirmed: false
        },
        otherCosts: []
    };

    const updatePetro = async (partial: Partial<PetrochemicalPurchaseData>) => {
        const next: PetrochemicalPurchaseData = {
            ...petroData,
            ...partial
        };

        // Recalculate amounts if quantity or basePrice changed
        const qty = next.quantityKg || 0;
        const base = next.basePricePerKg || 0;
        const totalGoods = qty * base;
        const isVatExempt = next.vatStatus === 'exempt' || next.vatStatus === 'معاف';
        const vat = partial.vatAmount !== undefined
            ? partial.vatAmount
            : isVatExempt
                ? 0
                : (next.vatAmount !== undefined && next.vatAmount > 0 ? next.vatAmount : Math.round(totalGoods * 0.10));
        const brokerage = partial.brokerageFee !== undefined
            ? partial.brokerageFee
            : (next.brokerageFee !== undefined && next.brokerageFee > 0 ? next.brokerageFee : Math.round(totalGoods * 0.0036));
        const otherFees = next.otherFees || 0;
        const totalInvoice = totalGoods + vat + brokerage + otherFees;

        next.totalGoodsPrice = totalGoods;
        if (partial.vatAmount === undefined) next.vatAmount = vat;
        if (partial.brokerageFee === undefined) next.brokerageFee = brokerage;
        next.totalInvoiceAmount = totalInvoice;

        // Auto sync LC or Barat principal amount if empty or matching previous total
        if (next.paymentMethod === 'internal_lc' && next.internalLc) {
            if (!next.internalLc.lcAmount || next.internalLc.lcAmount === petroData.totalInvoiceAmount) {
                next.internalLc.lcAmount = totalInvoice;
            }
        } else if (next.paymentMethod === 'draft_barat' && next.draftBarat) {
            if (!next.draftBarat.amount || next.draftBarat.amount === petroData.totalInvoiceAmount) {
                next.draftBarat.amount = totalInvoice;
            }
        }

        await onUpdateRecord({
            ...record,
            petrochemicalData: next,
            sellerName: next.petrochemicalName || record.sellerName,
            goodsName: next.gradeName || record.goodsName,
            proformaNumber: next.proformaNumber || record.proformaNumber,
            registrationNumber: next.contractNumber || record.registrationNumber
        });
    };

    // Calculate final costing metrics
    const totalFreight = petroData.loadingNotice?.freightCostRial || 0;
    const bankFees = petroData.paymentMethod === 'internal_lc'
        ? (petroData.internalLc?.commissionFee || 0) + (petroData.internalLc?.extensionFee || 0) + (petroData.internalLc?.taxStampFee || 0)
        : petroData.paymentMethod === 'draft_barat'
            ? (petroData.draftBarat?.interestAmount || 0) + (petroData.draftBarat?.sepamFee || 0)
            : 0;

    const otherCostsTotal = (petroData.otherCosts || []).reduce((acc, c) => acc + (c.amount || 0), 0);
    const finalTotalCost = (petroData.totalInvoiceAmount || 0) + totalFreight + bankFees + otherCostsTotal;
    const finalReceivedWeight = petroData.warehouseReceipt?.receivedWeightKg || petroData.quantityKg || 1;
    const costPerKg = finalReceivedWeight > 0 ? Math.round(finalTotalCost / finalReceivedWeight) : 0;
    
    // Weighbridge variance
    const invoiceQty = petroData.quantityKg || 0;
    const receivedQty = petroData.warehouseReceipt?.receivedWeightKg || 0;
    const weightVarianceKg = receivedQty > 0 ? (receivedQty - invoiceQty) : 0;
    const variancePercent = invoiceQty > 0 ? (weightVarianceKg / invoiceQty) * 100 : 0;

    // Days remaining for LC / Barat maturity countdown
    const getDaysRemaining = (dueDateStr?: string) => {
        if (!dueDateStr) return null;
        try {
            // Check if Shamsi (contains / or 14xx)
            const clean = dueDateStr.replace(/[^0-9\/]/g, '');
            const parts = clean.split('/');
            if (parts.length === 3) {
                // Approximate Shamsi to Gregorian or use today comparison
                const today = new Date();
                // Simple parser
                return null;
            }
            const d = new Date(dueDateStr);
            if (isNaN(d.getTime())) return null;
            const diffMs = d.getTime() - Date.now();
            return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        } catch {
            return null;
        }
    };

    // Export to Excel
    const handleExportExcel = () => {
        try {
            const fileName = `خرید_پتروشیمی_${petroData.petrochemicalName}_${record.fileNumber || 'پرونده'}.xls`;
            const htmlContent = `
                <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
                <head>
                    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
                    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>صورت وضعیت خرید پتروشیمی</x:Name><x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
                    <style>
                        table { border-collapse: collapse; width: 100%; direction: rtl; font-family: Tahoma, Arial, sans-serif; font-size: 11pt; }
                        th, td { border: 1px solid #999; padding: 6px 10px; text-align: center; }
                        th { background-color: #107c41; color: #ffffff; font-weight: bold; }
                        .header-row { background-color: #e8f5e9; font-weight: bold; text-align: right; }
                        .total-row { background-color: #c8e6c9; font-weight: bold; }
                        .num { mso-number-format:"\\#\\,\\#\\#0"; }
                    </style>
                </head>
                <body dir="rtl">
                    <h2 style="text-align: center;">صورت وضعیت و بهای تمام‌شده خرید پتروشیمی و بورس کالا</h2>
                    <p style="text-align: center;">شرکت: ${record.company || '---'} | پتروشیمی: ${petroData.petrochemicalName} | شماره پرونده: ${record.fileNumber || '---'}</p>
                    <table>
                        <tr class="header-row"><td colspan="4">۱. اطلاعات پایه قرارداد بورس و کالا</td></tr>
                        <tr><td>گرید / محصول</td><td>${petroData.gradeName || record.goodsName}</td><td>شماره قرارداد / جزء</td><td>${petroData.contractNumber || '---'}${petroData.contractSubNumber ? '/' + petroData.contractSubNumber : ''}</td></tr>
                        <tr><td>عنوان نماد</td><td>${petroData.symbolTitle || '---'}</td><td>بسته‌بندی / کیفیت</td><td>${petroData.packagingTitle || '---'} / ${petroData.qualityCode || 'منطبق'}</td></tr>
                        <tr><td>کارگزار خریدار / فروشنده</td><td>${petroData.brokerName || '---'} / ${petroData.sellerBrokerName || '---'}</td><td>بازار بورس / محل تحویل</td><td>${petroData.exchangeMarket || 'بورس کالای ایران'} / ${petroData.deliveryLocation || 'انبار کارخانه'}</td></tr>
                        <tr><td>تاریخ قرارداد / عرضه</td><td>${petroData.contractDate || '---'} / ${petroData.offeringDate || '---'}</td><td>تاریخ تحویل / تسویه</td><td>${petroData.deliveryDate || '---'} / ${petroData.settlementDate || '---'}</td></tr>
                        <tr><td>شماره پیش‌فاکتور</td><td>${petroData.proformaNumber || '---'}</td><td>مرحله جاری</td><td>${petroData.currentStage || '---'}</td></tr>
                        <tr><td>وزن قرارداد (کیلوگرم)</td><td class="num">${petroData.quantityKg || 0}</td><td>نرخ پایه هر کیلو (ریال)</td><td class="num">${petroData.basePricePerKg || 0}</td></tr>
                        <tr><td>ارزش قرارداد (ریال)</td><td class="num">${petroData.totalGoodsPrice || 0}</td><td>سهم فروشنده ریالی</td><td class="num">${petroData.sellerShareRial || 0}</td></tr>
                        <tr><td>مالیات ارزش افزوده (${petroData.vatStatus === 'exempt' ? 'معاف' : 'مشمول'})</td><td class="num">${petroData.vatAmount || 0}</td><td>جمع کارمزدهای بورس</td><td class="num">${petroData.brokerageFee || 0}</td></tr>
                        <tr><td>شماره و تاریخ صورتحساب</td><td>${petroData.invoiceInfo?.invoiceNumber || '---'} (${petroData.invoiceInfo?.invoiceDate || '---'})</td><td>جمع صورتحساب رسمی (ریال)</td><td class="num">${petroData.invoiceInfo?.finalInvoiceAmount || petroData.totalInvoiceAmount || 0}</td></tr>
                        
                        <tr class="header-row"><td colspan="4">۲. تسویه مالی و اسناد بانکی</td></tr>
                        <tr><td>روش تسویه</td><td>${petroData.paymentMethod === 'internal_lc' ? 'اعتبار اسنادی داخلی (LC)' : petroData.paymentMethod === 'draft_barat' ? 'برات الکترونیک (سپام)' : 'نقدی بورس'}</td><td>بانک عامل / شناسه پرداخت</td><td>${petroData.paymentMethod === 'internal_lc' ? petroData.internalLc?.issuingBank : petroData.paymentMethod === 'draft_barat' ? petroData.draftBarat?.bankName : 'اتاق پایاپای'} (${petroData.paymentIdentifier || '---'})</td></tr>
                        <tr><td>شناسه سند / LC / سپام</td><td>${petroData.paymentMethod === 'internal_lc' ? (petroData.internalLc?.lcNumber || '---') : petroData.paymentMethod === 'draft_barat' ? (petroData.draftBarat?.sepamCode || '---') : '---'}</td><td>تاریخ سررسید</td><td>${petroData.paymentMethod === 'internal_lc' ? (petroData.internalLc?.dueDate || '---') : petroData.paymentMethod === 'draft_barat' ? (petroData.draftBarat?.dueDate || '---') : '---'}</td></tr>
                        
                        <tr class="header-row"><td colspan="4">۳. اطلاعات حواله، بارگیری و باسکول کارخانه</td></tr>
                        <tr><td>شماره حواله فروش</td><td>${petroData.loadingNotice?.remittanceNumber || '---'}</td><td>تاریخ حواله</td><td>${petroData.loadingNotice?.remittanceDate || '---'}</td></tr>
                        <tr><td>مقدار حواله (kg)</td><td class="num">${petroData.loadingNotice?.remittanceQuantityKg || petroData.quantityKg || 0}</td><td>مانده حواله (باقیمانده)</td><td class="num">${petroData.loadingNotice?.remittanceRemainingKg ?? 0}</td></tr>
                        <tr><td>موسسه حمل</td><td>${petroData.loadingNotice?.transportCompany || '---'}</td><td>سریال برگه تحویل</td><td>${petroData.loadingNotice?.deliveryNoteSerial || '---'}</td></tr>
                        <tr><td>آدرس محل تخلیه</td><td colspan="3">${petroData.loadingNotice?.unloadingAddress || '---'}</td></tr>
                        <tr><td>کد بهین‌یاب / تاریخ بارگیری</td><td>${petroData.loadingNotice?.behenyabCode || '---'} / ${petroData.loadingNotice?.loadingDate || '---'}</td><td>ورود / خروج</td><td>${petroData.loadingNotice?.entryDateTime || '---'} / ${petroData.loadingNotice?.exitDateTime || '---'}</td></tr>
                        <tr><td>نام راننده و شماره تماس</td><td>${petroData.loadingNotice?.driverName || '---'} (${petroData.loadingNotice?.driverPhone || '---'})</td><td>شماره کامیون (پلاک)</td><td>${petroData.loadingNotice?.truckPlate || '---'}</td></tr>
                        <tr><td>شماره بارنامه / وزن خالص مبدا</td><td>${petroData.loadingNotice?.waybillNumber || '---'} / ${petroData.loadingNotice?.originNetWeightKg || 0} kg</td><td>کرایه حمل کل (ریال)</td><td class="num">${totalFreight}</td></tr>
                        <tr><td>وزن باسکول کارخانه (kg)</td><td class="num">${petroData.warehouseReceipt?.receivedWeightKg || 0}</td><td>اختلاف وزن باسکول (kg)</td><td class="num">${weightVarianceKg}</td></tr>

                        <tr class="total-row"><td colspan="2">مجموع بهای تمام‌شده خرید پتروشیمی (ریال)</td><td colspan="2" class="num">${finalTotalCost}</td></tr>
                        <tr class="total-row"><td colspan="2">بهای تمام‌شده هر کیلوگرم در انبار کارخانه (ریال/kg)</td><td colspan="2" class="num">${costPerKg}</td></tr>
                    </table>
                </body>
                </html>
            `;
            const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Error exporting excel", e);
            alert("خطا در دانلود فایل اکسل");
        }
    };

    // Add Cash Payment
    const handleAddCashPayment = async () => {
        if (!newCashPayment.amount || newCashPayment.amount <= 0) {
            alert("لطفاً مبلغ واریزی را وارد فرمایید.");
            return;
        }
        const payments = petroData.cashSettlement?.payments || [];
        const item = {
            id: 'cash-' + Date.now(),
            trackingNumber: newCashPayment.trackingNumber || '',
            bankName: newCashPayment.bankName || '',
            destinationAccount: newCashPayment.destinationAccount || '',
            amount: newCashPayment.amount,
            paymentDate: newCashPayment.paymentDate || '',
            description: newCashPayment.description || ''
        };
        const updatedList = [...payments, item];
        await updatePetro({
            cashSettlement: {
                ...(petroData.cashSettlement || { isSettled: false }),
                payments: updatedList,
                isSettled: updatedList.reduce((s, p) => s + p.amount, 0) >= (petroData.totalInvoiceAmount || 0)
            }
        });
        setNewCashPayment({
            trackingNumber: '',
            bankName: '',
            destinationAccount: '',
            amount: 0,
            amountStr: '',
            paymentDate: '',
            description: ''
        });
    };

    const handleRemoveCashPayment = async (id: string) => {
        const payments = (petroData.cashSettlement?.payments || []).filter(p => p.id !== id);
        await updatePetro({
            cashSettlement: {
                ...(petroData.cashSettlement || { isSettled: false }),
                payments,
                isSettled: payments.reduce((s, p) => s + p.amount, 0) >= (petroData.totalInvoiceAmount || 0)
            }
        });
    };

    // Add Other Cost
    const handleAddOtherCost = async () => {
        if (!newCostItem.title || !newCostItem.amount) return;
        const current = petroData.otherCosts || [];
        const item = {
            id: 'cost-' + Date.now(),
            title: newCostItem.title,
            amount: newCostItem.amount,
            description: newCostItem.description
        };
        await updatePetro({ otherCosts: [...current, item] });
        setNewCostItem({ title: '', amount: 0, amountStr: '', description: '' });
    };

    const handleRemoveOtherCost = async (id: string) => {
        const current = (petroData.otherCosts || []).filter(c => c.id !== id);
        await updatePetro({ otherCosts: current });
    };

    return (
        <div className="space-y-6 p-3 sm:p-6 max-w-6xl mx-auto" dir="rtl">
            {/* Print Modal Overlay */}
            {showPrintModal && (
                <PrintDomesticPetrochemical
                    record={record}
                    settings={settings}
                    onClose={() => setShowPrintModal(false)}
                />
            )}

            {/* Header Banner */}
            <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white p-4 sm:p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-bold border border-emerald-400/30">
                        <Building2 size={14} />
                        <span>پرونده خرید داخلی / پتروشیمی و بورس کالا</span>
                    </div>
                    <h2 className="text-lg sm:text-2xl font-black text-white truncate">
                        {petroData.petrochemicalName || 'پتروشیمی'} - {petroData.gradeName || 'کالای بورسی'}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-emerald-200">
                        <span className="bg-amber-400/20 border border-amber-300/40 text-amber-200 px-2.5 py-0.5 rounded-lg">
                            شماره حواله: <strong className="font-mono text-white text-sm">{petroData.loadingNotice?.remittanceNumber || 'ثبت نشده'}</strong>
                            {petroData.loadingNotice?.remittanceDate && <span className="mr-1.5 text-amber-100 font-mono">({petroData.loadingNotice.remittanceDate})</span>}
                        </span>
                        <span>قرارداد بورس: <strong className="font-mono text-white">{petroData.contractNumber || 'ثبت نشده'}{petroData.contractSubNumber ? `/${petroData.contractSubNumber}` : ''}</strong></span>
                        <span>•</span>
                        <span>صورتحساب: <strong className="font-mono text-white">{petroData.invoiceInfo?.invoiceNumber || petroData.proformaNumber || 'ثبت نشده'}</strong></span>
                        {petroData.currentStage && (
                            <>
                                <span>•</span>
                                <span>مرحله جاری: <strong className="text-emerald-100">{petroData.currentStage}</strong></span>
                            </>
                        )}
                        <span>•</span>
                        <span>روش تسویه: <strong className="text-amber-300">
                            {petroData.paymentMethod === 'internal_lc' ? 'اعتبار اسنادی داخلی (LC ریالی)' : petroData.paymentMethod === 'draft_barat' ? 'برات الکترونیک (سپام)' : petroData.paymentMethod === 'bourse_salaf' ? 'خرید سلف بورس' : 'نقدی بورس'}
                        </strong></span>
                    </div>
                </div>

                {/* Right Action Buttons & Quick Cost */}
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20 text-left">
                        <span className="text-[10px] text-emerald-200 block">بهای تمام‌شده هر کیلوگرم</span>
                        <span className="font-mono text-lg sm:text-xl font-black text-white">
                            {costPerKg.toLocaleString('fa-IR')} <span className="text-xs font-normal">ریال/kg</span>
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowPrintModal(true)}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2.5 rounded-2xl text-xs font-bold shadow-lg transition-all"
                        title="چاپ صورت وضعیت و دانلود PDF"
                    >
                        <Printer size={16} />
                        <span className="hidden sm:inline">چاپ و PDF</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleExportExcel}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2.5 rounded-2xl text-xs font-bold shadow-lg transition-all"
                        title="خروجی اکسل کامل"
                    >
                        <FileSpreadsheet size={16} />
                        <span className="hidden sm:inline">خروجی اکسل</span>
                    </button>
                </div>
            </div>

            {/* Navigation Sub-Tabs */}
            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 custom-scrollbar border-b border-gray-200 dark:border-gray-800">
                <button
                    type="button"
                    onClick={() => setSubTab('contract')}
                    className={`px-3 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                        subTab === 'contract'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    <FileText size={16} />
                    <span>۱. قرارداد بورس و پیش‌فاکتور</span>
                </button>
                <button
                    type="button"
                    onClick={() => setSubTab('settlement')}
                    className={`px-3 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                        subTab === 'settlement'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    <Landmark size={16} />
                    <span>۲. تسویه (نقدی / برات / LC)</span>
                </button>
                <button
                    type="button"
                    onClick={() => setSubTab('loading_shipping')}
                    className={`px-3 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                        subTab === 'loading_shipping'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    <Truck size={16} />
                    <span>۳. حواله پتروشیمی و ناوگان حمل</span>
                </button>
                <button
                    type="button"
                    onClick={() => setSubTab('warehouse')}
                    className={`px-3 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                        subTab === 'warehouse'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    <Warehouse size={16} />
                    <span>۴. رسید انبار کارخانه، باسکول و QC</span>
                </button>
                <button
                    type="button"
                    onClick={() => setSubTab('costing')}
                    className={`px-3 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                        subTab === 'costing'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    <Calculator size={16} />
                    <span>۵. آنالیز نهایی بهای تمام‌شده</span>
                </button>
            </div>

            {/* SUB-TAB 1: Bourse Contract, Base Info & Invoice */}
            {subTab === 'contract' && (
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-3xl border border-gray-200 dark:border-gray-700 space-y-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700 pb-4">
                        <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">اطلاعات پایه قرارداد بورس کالا، حواله و صورتحساب</h3>
                            <p className="text-xs text-gray-500 mt-0.5">کلیه مشخصات اسنادی گزارش خرید بورس (شماره حواله، قرارداد و جزء، نماد، تاریخ‌ها و صورتحساب)</p>
                        </div>
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-bold rounded-xl border border-emerald-200">
                            {petroData.exchangeMarket || 'بورس کالای ایران'}
                        </span>
                    </div>

                    {/* Critical Highlight: Remittance Number + Contract + Sub Number */}
                    <div className="p-4 bg-amber-50/70 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-800/60 grid grid-cols-1 md:grid-cols-4 gap-3.5 text-xs">
                        <div className="space-y-1.5">
                            <label className="font-black text-amber-900 dark:text-amber-300 flex items-center gap-1">
                                <span>شماره حواله فروش پتروشیمی *</span>
                            </label>
                            <input
                                className="w-full border-2 border-amber-300 dark:border-amber-700 rounded-xl p-2.5 bg-white dark:bg-gray-900 text-sm font-mono font-black text-amber-900 dark:text-amber-200 text-left dir-ltr"
                                value={petroData.loadingNotice?.remittanceNumber || ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), remittanceNumber: e.target.value }
                                })}
                                placeholder="مثال: BT03802/05"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">تاریخ حواله</label>
                            <TradeDatePicker
                                value={petroData.loadingNotice?.remittanceDate || ''}
                                onChange={d => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), remittanceDate: d }
                                })}
                                placeholder="1405/07/26"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">شماره قرارداد بورس *</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-2.5 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-900 dark:text-gray-100 text-left dir-ltr"
                                value={petroData.contractNumber || ''}
                                onChange={e => updatePetro({ contractNumber: e.target.value })}
                                placeholder="مثال: 1405338318"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">شماره جزء قرارداد</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-2.5 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-900 dark:text-gray-100 text-center"
                                value={petroData.contractSubNumber || ''}
                                onChange={e => updatePetro({ contractSubNumber: e.target.value })}
                                placeholder="مثال: 39"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">نام مجتمع پتروشیمی / فروشنده *</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.petrochemicalName}
                                onChange={e => updatePetro({ petrochemicalName: e.target.value })}
                                placeholder="مثال: پتروشیمی شهید تندگویان، اروند، شازند..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">نام مشتری (خریدار)</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.customerName ?? record.company ?? ''}
                                onChange={e => updatePetro({ customerName: e.target.value })}
                                placeholder="مثال: تولیدی لپان بافت"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">بازار بورس / محل تحویل</label>
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-xs font-bold text-gray-900 dark:text-gray-100"
                                    value={petroData.exchangeMarket ?? 'بورس کالای ایران'}
                                    onChange={e => updatePetro({ exchangeMarket: e.target.value })}
                                    placeholder="بازار بورس"
                                />
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-xs font-bold text-gray-900 dark:text-gray-100"
                                    value={petroData.deliveryLocation ?? 'انبار کارخانه'}
                                    onChange={e => updatePetro({ deliveryLocation: e.target.value })}
                                    placeholder="محل تحویل"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">نام کارگزار خریدار</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.brokerName || ''}
                                onChange={e => updatePetro({ brokerName: e.target.value })}
                                placeholder="مثال: هامرز، کاریزما، آگاه، مفید..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">نام کارگزار فروشنده</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.sellerBrokerName || ''}
                                onChange={e => updatePetro({ sellerBrokerName: e.target.value })}
                                placeholder="مثال: خلیج فارس"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">مرحله جاری سند</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.currentStage || ''}
                                onChange={e => updatePetro({ currentStage: e.target.value })}
                                placeholder="مثال: انبار محصول پتروشیمی تندگویان"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">نام تجاری محصول در بورس (گرید) *</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.gradeName || ''}
                                onChange={e => updatePetro({ gradeName: e.target.value })}
                                placeholder="مثال: پلی اتیلن ترفتالات نساجی TG645"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">عنوان نماد معاملاتی</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100 text-left dir-ltr"
                                value={petroData.symbolTitle || ''}
                                onChange={e => updatePetro({ symbolTitle: e.target.value })}
                                placeholder="مثال: PTC-PETTG645J-00"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">عنوان فارسی بسته‌بندی و کد کیفیت</label>
                            <div className="grid grid-cols-3 gap-2">
                                <input
                                    className="col-span-2 w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-xs font-bold text-gray-900 dark:text-gray-100"
                                    value={petroData.packagingTitle || ''}
                                    onChange={e => updatePetro({ packagingTitle: e.target.value })}
                                    placeholder="جامبوبگ 1100 کیلویی"
                                />
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-xs font-bold text-center text-gray-900 dark:text-gray-100"
                                    value={petroData.qualityCode ?? 'منطبق'}
                                    onChange={e => updatePetro({ qualityCode: e.target.value })}
                                    placeholder="منطبق"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">شماره پیش‌فاکتور و تاریخ آن</label>
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-xs font-mono text-gray-900 dark:text-gray-100 text-left dir-ltr"
                                    value={petroData.proformaNumber || ''}
                                    onChange={e => updatePetro({ proformaNumber: e.target.value })}
                                    placeholder="شماره پیش‌فاکتور"
                                />
                                <TradeDatePicker
                                    value={petroData.proformaDate || ''}
                                    onChange={d => updatePetro({ proformaDate: d })}
                                    placeholder="تاریخ پیش‌فاکتور"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">کد عرضه بورس / شناسه پرداخت</label>
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-xs font-mono text-gray-900 dark:text-gray-100 text-left dir-ltr"
                                    value={petroData.offeringCode || ''}
                                    onChange={e => updatePetro({ offeringCode: e.target.value })}
                                    placeholder="کد عرضه"
                                />
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-xs font-mono text-gray-900 dark:text-gray-100 text-left dir-ltr"
                                    value={petroData.paymentIdentifier || ''}
                                    onChange={e => updatePetro({ paymentIdentifier: e.target.value })}
                                    placeholder="شناسه پرداخت"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">درصد رقابت بورس (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-900 dark:text-gray-100 text-center"
                                value={petroData.competitionPercent || ''}
                                onChange={e => updatePetro({ competitionPercent: parseFloat(e.target.value) || 0 })}
                                placeholder="درصد رقابت معامله..."
                            />
                        </div>
                    </div>

                    {/* Contract Dates & Deadlines */}
                    <div className="p-4 bg-blue-50/40 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/50 space-y-3">
                        <h4 className="font-bold text-xs text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                            <Calendar size={15} />
                            <span>تاریخ‌ها و مهلت‌های قرارداد بورس</span>
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                            <div className="space-y-1">
                                <label className="font-bold text-gray-600 dark:text-gray-400">تاریخ عرضه</label>
                                <TradeDatePicker value={petroData.offeringDate || ''} onChange={d => updatePetro({ offeringDate: d })} placeholder="1405/07/21" />
                            </div>
                            <div className="space-y-1">
                                <label className="font-bold text-gray-600 dark:text-gray-400">تاریخ شمسی قرارداد</label>
                                <TradeDatePicker value={petroData.contractDate || ''} onChange={d => updatePetro({ contractDate: d })} placeholder="1405/07/21" />
                            </div>
                            <div className="space-y-1">
                                <label className="font-bold text-gray-600 dark:text-gray-400">مهلت تسویه</label>
                                <TradeDatePicker value={petroData.bourseSettlementDeadline || ''} onChange={d => updatePetro({ bourseSettlementDeadline: d })} placeholder="1405/07/26" />
                            </div>
                            <div className="space-y-1">
                                <label className="font-bold text-gray-600 dark:text-gray-400">تاریخ تسویه</label>
                                <TradeDatePicker value={petroData.settlementDate || ''} onChange={d => updatePetro({ settlementDate: d })} placeholder="1405/07/26" />
                            </div>
                            <div className="space-y-1">
                                <label className="font-bold text-gray-600 dark:text-gray-400">مهلت تحویل محاسباتی</label>
                                <TradeDatePicker value={petroData.calculatedDeliveryDeadline || ''} onChange={d => updatePetro({ calculatedDeliveryDeadline: d })} placeholder="1405/08/26" />
                            </div>
                            <div className="space-y-1">
                                <label className="font-bold text-gray-600 dark:text-gray-400">تاریخ تحویل</label>
                                <TradeDatePicker value={petroData.deliveryDate || ''} onChange={d => updatePetro({ deliveryDate: d })} placeholder="1405/08/19" />
                            </div>
                        </div>
                    </div>

                    {/* Quantities & Price Breakdown Grid */}
                    <div className="p-5 bg-slate-50 dark:bg-gray-900/50 rounded-2xl border border-slate-200 dark:border-gray-700 space-y-4">
                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <Calculator size={18} className="text-emerald-600" />
                            <span>محاسبه مالی قرارداد، سهم فروشنده، کارمزدها و جرائم</span>
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">مقدار قرارداد (کیلوگرم) *</label>
                                <input
                                    type="number"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-base font-mono font-bold text-gray-900 dark:text-gray-100 text-center"
                                    value={petroData.quantityKg || ''}
                                    onChange={e => updatePetro({ quantityKg: parseFloat(e.target.value) || 0 })}
                                    placeholder="مثال: 22000"
                                />
                                <span className="text-[11px] text-gray-500 block text-left">
                                    معادل: {((petroData.quantityKg || 0) / 1000).toFixed(2)} تن
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">قیمت واحد ریالی هر کیلو *</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-base font-mono font-bold text-emerald-700 dark:text-emerald-400 text-center"
                                    value={formatNumberString(petroData.basePricePerKg || 0)}
                                    onChange={e => updatePetro({ basePricePerKg: deformatNumberString(e.target.value) })}
                                    placeholder="مثال: 3,800,000"
                                />
                                <span className="text-[11px] text-gray-500 block text-left">
                                    {(petroData.basePricePerKg || 0).toLocaleString('fa-IR')} {petroData.baseCurrency || 'ریال'}
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">ارزش قرارداد (ریالی)</label>
                                <div className="w-full p-3 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl font-mono text-base font-black text-emerald-800 dark:text-emerald-300 text-center">
                                    {(petroData.totalGoodsPrice || 0).toLocaleString('fa-IR')}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">ارز مبنا معامله</label>
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-center text-gray-900 dark:text-gray-100"
                                    value={petroData.baseCurrency ?? 'ریال'}
                                    onChange={e => updatePetro({ baseCurrency: e.target.value })}
                                    placeholder="ریال"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs pt-2 border-t border-slate-200 dark:border-gray-800">
                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">وضعیت مالیات ارزش افزوده</label>
                                <select
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-800 dark:text-gray-200"
                                    value={petroData.vatStatus || 'subject'}
                                    onChange={e => updatePetro({
                                        vatStatus: e.target.value,
                                        vatAmount: e.target.value === 'exempt' ? 0 : Math.round((petroData.totalGoodsPrice || 0) * 0.10)
                                    })}
                                >
                                    <option value="subject">مشمول مالیات و عوارض ارزش افزوده</option>
                                    <option value="exempt">معاف از مالیات ارزش افزوده</option>
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">مالیات و عوارض ارزش افزوده (ریال)</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-800 dark:text-gray-200 text-center"
                                    value={formatNumberString(petroData.vatAmount || 0)}
                                    onChange={e => updatePetro({ vatAmount: deformatNumberString(e.target.value) })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">جمع کارمزدهای بورس و کارگزاری (ریال)</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-800 dark:text-gray-200 text-center"
                                    value={formatNumberString(petroData.brokerageFee || 0)}
                                    onChange={e => updatePetro({ brokerageFee: deformatNumberString(e.target.value) })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">سهم فروشنده ریالی</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-800 dark:text-gray-200 text-center"
                                    value={formatNumberString(petroData.sellerShareRial ?? Math.max(0, (petroData.totalGoodsPrice || 0) - (petroData.brokerageFee || 0)))}
                                    onChange={e => updatePetro({ sellerShareRial: deformatNumberString(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs pt-2 border-t border-slate-200 dark:border-gray-800">
                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">وضعیت جریمه</label>
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-800 dark:text-gray-200"
                                    value={petroData.penaltyStatus ?? 'ندارد'}
                                    onChange={e => updatePetro({ penaltyStatus: e.target.value })}
                                    placeholder="ندارد"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">جریمه تاخیر (ریال)</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-800 dark:text-gray-200 text-center"
                                    value={formatNumberString(petroData.delayPenaltyAmount || 0)}
                                    onChange={e => updatePetro({ delayPenaltyAmount: deformatNumberString(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">جریمه ابطال (ریال)</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-800 dark:text-gray-200 text-center"
                                    value={formatNumberString(petroData.cancellationPenaltyAmount || 0)}
                                    onChange={e => updatePetro({ cancellationPenaltyAmount: deformatNumberString(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-900 dark:text-gray-100">جمع کل پیش‌فاکتور و فاکتور (ریال)</label>
                                <div className="w-full p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl font-mono text-base font-black text-indigo-900 dark:text-indigo-200 text-center">
                                    {(petroData.totalInvoiceAmount || 0).toLocaleString('fa-IR')}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Official Petrochemical Invoice Details (اطلاعات صورتحساب) */}
                    <div className="p-4 bg-purple-50/40 dark:bg-purple-950/20 rounded-2xl border border-purple-200 dark:border-purple-800/50 space-y-3">
                        <h4 className="font-bold text-xs text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                            <FileText size={15} />
                            <span>اطلاعات صورتحساب رسمی پتروشیمی</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div className="space-y-1">
                                <label className="font-bold text-gray-700 dark:text-gray-300">شماره صورتحساب</label>
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-2.5 bg-white dark:bg-gray-900 font-mono text-sm text-left dir-ltr font-bold"
                                    value={petroData.invoiceInfo?.invoiceNumber || ''}
                                    onChange={e => updatePetro({
                                        invoiceInfo: { ...(petroData.invoiceInfo || {}), invoiceNumber: e.target.value }
                                    })}
                                    placeholder="مثال: PTC0508/05483"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="font-bold text-gray-700 dark:text-gray-300">تاریخ صورتحساب</label>
                                <TradeDatePicker
                                    value={petroData.invoiceInfo?.invoiceDate || ''}
                                    onChange={d => updatePetro({
                                        invoiceInfo: { ...(petroData.invoiceInfo || {}), invoiceDate: d }
                                    })}
                                    placeholder="1405/08/16"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="font-bold text-gray-700 dark:text-gray-300">مقدار صورتحساب (کیلوگرم)</label>
                                <input
                                    type="number"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-2.5 bg-white dark:bg-gray-900 font-mono text-sm font-bold text-center"
                                    value={petroData.invoiceInfo?.invoiceQuantityKg ?? ''}
                                    onChange={e => updatePetro({
                                        invoiceInfo: { ...(petroData.invoiceInfo || {}), invoiceQuantityKg: parseFloat(e.target.value) || 0 }
                                    })}
                                    placeholder="مثال: 22070"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="font-bold text-gray-700 dark:text-gray-300">جمع صورتحساب (ریال)</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-2.5 bg-white dark:bg-gray-900 font-mono text-sm font-bold text-purple-800 dark:text-purple-300 text-center"
                                    value={formatNumberString(petroData.invoiceInfo?.finalInvoiceAmount || 0)}
                                    onChange={e => updatePetro({
                                        invoiceInfo: { ...(petroData.invoiceInfo || {}), finalInvoiceAmount: deformatNumberString(e.target.value) }
                                    })}
                                    placeholder="مثال: 92,252,600,000"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SUB-TAB 2: Settlement (Cash, Barat, LC) */}
            {subTab === 'settlement' && (
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-3xl border border-gray-200 dark:border-gray-700 space-y-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-4">
                        <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">روش و ابزار تسویه مالی با پتروشیمی و بورس</h3>
                            <p className="text-xs text-gray-500 mt-0.5">مشخصات اعتبار اسنادی داخلی (LC ریالی)، برات الکترونیک یا تسویه نقدی بورس کالا</p>
                        </div>

                        {/* Payment Method Selector */}
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => updatePetro({ paymentMethod: 'cash' })}
                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    petroData.paymentMethod === 'cash'
                                        ? 'bg-emerald-600 text-white shadow-md'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                }`}
                            >
                                <DollarSign size={14} />
                                <span>خرید نقدی بورس</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => updatePetro({ paymentMethod: 'draft_barat' })}
                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    petroData.paymentMethod === 'draft_barat'
                                        ? 'bg-teal-600 text-white shadow-md'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                }`}
                            >
                                <FileText size={14} />
                                <span>برات الکترونیک (سپام)</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => updatePetro({ paymentMethod: 'internal_lc' })}
                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    petroData.paymentMethod === 'internal_lc'
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                }`}
                            >
                                <Landmark size={14} />
                                <span>اعتبار اسنادی داخلی (LC ریالی)</span>
                            </button>
                        </div>
                    </div>

                    {/* METHOD 1: CASH SETTLEMENT */}
                    {petroData.paymentMethod === 'cash' && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <DollarSign className="text-emerald-600 dark:text-emerald-400" size={20} />
                                    <div>
                                        <span className="font-bold text-sm text-emerald-950 dark:text-emerald-200 block">
                                            تسویه نقدی با پتروشیمی و اتاق پایاپای بورس کالا
                                        </span>
                                        <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                            مهلت تسویه نقدی بورس کالا: ۳ روز کاری از تاریخ معامله
                                        </span>
                                    </div>
                                </div>
                                <div className="text-left font-mono">
                                    <span className="text-xs text-gray-500 block">مبلغ کل قابل پرداخت:</span>
                                    <span className="text-sm font-black text-emerald-900 dark:text-emerald-100">
                                        {(petroData.totalInvoiceAmount || 0).toLocaleString('fa-IR')} ریال
                                    </span>
                                </div>
                            </div>

                            {/* Add Cash Payment Form */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
                                <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                    <Plus size={14} className="text-emerald-600" />
                                    <span>ثبت واریزی نقدی جدید به حساب پتروشیمی / بورس</span>
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                                    <div>
                                        <label className="font-bold block mb-1">مبلغ واریز (ریال) *</label>
                                        <input
                                            type="text"
                                            className="w-full border rounded-xl p-2.5 bg-white dark:bg-gray-800 font-mono font-bold text-emerald-700 text-center"
                                            value={newCashPayment.amountStr}
                                            onChange={e => {
                                                const val = deformatNumberString(e.target.value);
                                                setNewCashPayment({
                                                    ...newCashPayment,
                                                    amount: val,
                                                    amountStr: formatNumberString(val)
                                                });
                                            }}
                                            placeholder="مبلغ واریزی..."
                                        />
                                    </div>
                                    <div>
                                        <label className="font-bold block mb-1">شماره پیگیری / فیش</label>
                                        <input
                                            className="w-full border rounded-xl p-2.5 bg-white dark:bg-gray-800 font-mono"
                                            value={newCashPayment.trackingNumber}
                                            onChange={e => setNewCashPayment({ ...newCashPayment, trackingNumber: e.target.value })}
                                            placeholder="شماره فیش..."
                                        />
                                    </div>
                                    <div>
                                        <label className="font-bold block mb-1">بانک واریزکننده</label>
                                        <input
                                            className="w-full border rounded-xl p-2.5 bg-white dark:bg-gray-800"
                                            value={newCashPayment.bankName}
                                            onChange={e => setNewCashPayment({ ...newCashPayment, bankName: e.target.value })}
                                            placeholder="بانک مبدا..."
                                        />
                                    </div>
                                    <div>
                                        <label className="font-bold block mb-1">تاریخ پرداخت</label>
                                        <TradeDatePicker
                                            value={newCashPayment.paymentDate}
                                            onChange={d => setNewCashPayment({ ...newCashPayment, paymentDate: d })}
                                            placeholder="تاریخ واریز..."
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={handleAddCashPayment}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                                    >
                                        <Plus size={14} />
                                        <span>ثبت پرداخت</span>
                                    </button>
                                </div>
                            </div>

                            {/* Cash Payments Table */}
                            {((petroData.cashSettlement?.payments || []).length > 0) && (
                                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-2xl">
                                    <table className="w-full text-xs text-right">
                                        <thead className="bg-gray-100 dark:bg-gray-800 font-bold text-gray-700 dark:text-gray-300">
                                            <tr>
                                                <th className="p-3">ردیف</th>
                                                <th className="p-3">مبلغ واریزی (ریال)</th>
                                                <th className="p-3">شماره پیگیری / فیش</th>
                                                <th className="p-3">بانک</th>
                                                <th className="p-3">تاریخ واریز</th>
                                                <th className="p-3 text-center">عملیات</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {(petroData.cashSettlement?.payments || []).map((p, idx) => (
                                                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                                    <td className="p-3 font-mono">{idx + 1}</td>
                                                    <td className="p-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                                        {p.amount.toLocaleString('fa-IR')}
                                                    </td>
                                                    <td className="p-3 font-mono">{p.trackingNumber || '---'}</td>
                                                    <td className="p-3">{p.bankName || '---'}</td>
                                                    <td className="p-3 font-mono">{p.paymentDate || '---'}</td>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveCashPayment(p.id)}
                                                            className="text-red-500 hover:text-red-700 p-1"
                                                            title="حذف"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* METHOD 2: PROMISSORY NOTE / ELECTRONIC DRAFT (برات الکترونیک سپام) */}
                    {petroData.paymentMethod === 'draft_barat' && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="p-4 bg-teal-50/60 dark:bg-teal-950/30 rounded-2xl border border-teal-200 dark:border-teal-800 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <FileText className="text-teal-600 dark:text-teal-400" size={20} />
                                    <div>
                                        <span className="font-bold text-sm text-teal-950 dark:text-teal-200 block">
                                            برات الکترونیک سامانه سپام بانک مرکزی
                                        </span>
                                        <span className="text-[11px] text-teal-700 dark:text-teal-300">
                                            تسویه اعتباری از طریق خرید دین و انتشار برات الکترونیک
                                        </span>
                                    </div>
                                </div>
                                <span className="text-xs px-3 py-1 bg-teal-600 text-white font-bold rounded-xl shadow-xs">
                                    سامانه سپام (SEPAM)
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">شناسه ۱۶ رقمی سپام / برات الکترونیک *</label>
                                    <input
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-teal-800 dark:text-teal-300 text-center"
                                        value={petroData.draftBarat?.sepamCode || ''}
                                        onChange={e => updatePetro({
                                            draftBarat: { ...(petroData.draftBarat || { baratNumber: '', sepamCode: '', bankName: '', issueDate: '', dueDate: '', amount: 0, drawerName: '', draweeName: '', status: 'draft' }), sepamCode: e.target.value }
                                        })}
                                        placeholder="شناسه یکتای سپام..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">بانک عامل صادرکننده</label>
                                    <input
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                        value={petroData.draftBarat?.bankName || ''}
                                        onChange={e => updatePetro({
                                            draftBarat: { ...(petroData.draftBarat || { baratNumber: '', sepamCode: '', bankName: '', issueDate: '', dueDate: '', amount: 0, drawerName: '', draweeName: '', status: 'draft' }), bankName: e.target.value }
                                        })}
                                        placeholder="مثال: بانک تجارت، ملت، صادرات..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">مبلغ اصل برات (ریال) *</label>
                                    <input
                                        type="text"
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-teal-700 dark:text-teal-300 text-center"
                                        value={formatNumberString(petroData.draftBarat?.amount || petroData.totalInvoiceAmount || 0)}
                                        onChange={e => updatePetro({
                                            draftBarat: { ...(petroData.draftBarat || { baratNumber: '', sepamCode: '', bankName: '', issueDate: '', dueDate: '', amount: 0, drawerName: '', draweeName: '', status: 'draft' }), amount: deformatNumberString(e.target.value) }
                                        })}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">تاریخ صدور برات</label>
                                    <TradeDatePicker
                                        value={petroData.draftBarat?.issueDate || ''}
                                        onChange={d => updatePetro({
                                            draftBarat: { ...(petroData.draftBarat || { baratNumber: '', sepamCode: '', bankName: '', issueDate: '', dueDate: '', amount: 0, drawerName: '', draweeName: '', status: 'draft' }), issueDate: d }
                                        })}
                                        placeholder="تاریخ صدور..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">تاریخ سررسید برات (Due Date) *</label>
                                    <TradeDatePicker
                                        value={petroData.draftBarat?.dueDate || ''}
                                        onChange={d => updatePetro({
                                            draftBarat: { ...(petroData.draftBarat || { baratNumber: '', sepamCode: '', bankName: '', issueDate: '', dueDate: '', amount: 0, drawerName: '', draweeName: '', status: 'draft' }), dueDate: d }
                                        })}
                                        placeholder="تاریخ سررسید..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">مدت برات (روز)</label>
                                    <input
                                        type="number"
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-center font-bold"
                                        value={petroData.draftBarat?.tenorDays || 90}
                                        onChange={e => updatePetro({
                                            draftBarat: { ...(petroData.draftBarat || { baratNumber: '', sepamCode: '', bankName: '', issueDate: '', dueDate: '', amount: 0, drawerName: '', draweeName: '', status: 'draft' }), tenorDays: parseInt(e.target.value) || 0 }
                                        })}
                                        placeholder="مثال: 90"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">مبلغ کارمزد / سود اعتباری برات (ریال)</label>
                                    <input
                                        type="text"
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-center font-bold"
                                        value={formatNumberString(petroData.draftBarat?.interestAmount || 0)}
                                        onChange={e => updatePetro({
                                            draftBarat: { ...(petroData.draftBarat || { baratNumber: '', sepamCode: '', bankName: '', issueDate: '', dueDate: '', amount: 0, drawerName: '', draweeName: '', status: 'draft' }), interestAmount: deformatNumberString(e.target.value) }
                                        })}
                                        placeholder="کارمزد اعتباری..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">برات‌کش / متعهد (شرکت)</label>
                                    <input
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold"
                                        value={petroData.draftBarat?.drawerName || record.company || ''}
                                        onChange={e => updatePetro({
                                            draftBarat: { ...(petroData.draftBarat || { baratNumber: '', sepamCode: '', bankName: '', issueDate: '', dueDate: '', amount: 0, drawerName: '', draweeName: '', status: 'draft' }), drawerName: e.target.value }
                                        })}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">ذینفع برات (پتروشیمی)</label>
                                    <input
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold"
                                        value={petroData.draftBarat?.beneficiaryName || petroData.petrochemicalName || ''}
                                        onChange={e => updatePetro({
                                            draftBarat: { ...(petroData.draftBarat || { baratNumber: '', sepamCode: '', bankName: '', issueDate: '', dueDate: '', amount: 0, drawerName: '', draweeName: '', status: 'draft' }), beneficiaryName: e.target.value }
                                        })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* METHOD 3: INTERNAL DOMESTIC LC (ال‌سی داخلی ریالی) */}
                    {petroData.paymentMethod === 'internal_lc' && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Landmark className="text-indigo-600 dark:text-indigo-400" size={20} />
                                    <div>
                                        <span className="font-bold text-sm text-indigo-950 dark:text-indigo-200 block">
                                            اعتبار اسنادی داخلی ریالی (Domestic LC)
                                        </span>
                                        <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
                                            گشایش نزد شبکه بانکی کشور به نفع شرکت پتروشیمی
                                        </span>
                                    </div>
                                </div>
                                <span className="text-xs px-3 py-1 bg-indigo-600 text-white font-bold rounded-xl shadow-xs">
                                    اعتبار اسنادی ریالی
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">شماره اعتبار اسنادی (LC No.) *</label>
                                    <input
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-indigo-800 dark:text-indigo-300 text-center"
                                        value={petroData.internalLc?.lcNumber || ''}
                                        onChange={e => updatePetro({
                                            internalLc: { ...(petroData.internalLc || { lcNumber: '', issuingBank: '', branch: '', issueDate: '', dueDate: '', lcAmount: 0, status: 'draft' }), lcNumber: e.target.value }
                                        })}
                                        placeholder="شماره اعتبار اسنادی..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">بانک گشایش‌کننده</label>
                                    <input
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                        value={petroData.internalLc?.issuingBank || ''}
                                        onChange={e => updatePetro({
                                            internalLc: { ...(petroData.internalLc || { lcNumber: '', issuingBank: '', branch: '', issueDate: '', dueDate: '', lcAmount: 0, status: 'draft' }), issuingBank: e.target.value }
                                        })}
                                        placeholder="مثال: بانک تجارت، ملت، ملی..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">شعبه و کد شعبه</label>
                                    <input
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                        value={petroData.internalLc?.branch || ''}
                                        onChange={e => updatePetro({
                                            internalLc: { ...(petroData.internalLc || { lcNumber: '', issuingBank: '', branch: '', issueDate: '', dueDate: '', lcAmount: 0, status: 'draft' }), branch: e.target.value }
                                        })}
                                        placeholder="نام و کد شعبه..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">مبلغ کل اعتبار LC (ریال) *</label>
                                    <input
                                        type="text"
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-indigo-700 dark:text-indigo-300 text-center"
                                        value={formatNumberString(petroData.internalLc?.lcAmount || petroData.totalInvoiceAmount || 0)}
                                        onChange={e => updatePetro({
                                            internalLc: { ...(petroData.internalLc || { lcNumber: '', issuingBank: '', branch: '', issueDate: '', dueDate: '', lcAmount: 0, status: 'draft' }), lcAmount: deformatNumberString(e.target.value) }
                                        })}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">تاریخ گشایش LC</label>
                                    <TradeDatePicker
                                        value={petroData.internalLc?.issueDate || ''}
                                        onChange={d => updatePetro({
                                            internalLc: { ...(petroData.internalLc || { lcNumber: '', issuingBank: '', branch: '', issueDate: '', dueDate: '', lcAmount: 0, status: 'draft' }), issueDate: d }
                                        })}
                                        placeholder="تاریخ گشایش..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">تاریخ سررسید پرداخت LC (Due Date) *</label>
                                    <TradeDatePicker
                                        value={petroData.internalLc?.dueDate || ''}
                                        onChange={d => updatePetro({
                                            internalLc: { ...(petroData.internalLc || { lcNumber: '', issuingBank: '', branch: '', issueDate: '', dueDate: '', lcAmount: 0, status: 'draft' }), dueDate: d }
                                        })}
                                        placeholder="تاریخ سررسید..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">کارمزد گشایش بانکی (ریال)</label>
                                    <input
                                        type="text"
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-800 dark:text-gray-200 text-center"
                                        value={formatNumberString(petroData.internalLc?.commissionFee || 0)}
                                        onChange={e => updatePetro({
                                            internalLc: { ...(petroData.internalLc || { lcNumber: '', issuingBank: '', branch: '', issueDate: '', dueDate: '', lcAmount: 0, status: 'draft' }), commissionFee: deformatNumberString(e.target.value) }
                                        })}
                                        placeholder="کارمزد بانک..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">مبلغ پیش‌پرداخت / سپرده نقدی (ریال)</label>
                                    <input
                                        type="text"
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-800 dark:text-gray-200 text-center"
                                        value={formatNumberString(petroData.internalLc?.prepaymentAmount || 0)}
                                        onChange={e => updatePetro({
                                            internalLc: { ...(petroData.internalLc || { lcNumber: '', issuingBank: '', branch: '', issueDate: '', dueDate: '', lcAmount: 0, status: 'draft' }), prepaymentAmount: deformatNumberString(e.target.value) }
                                        })}
                                        placeholder="سپرده نقدی..."
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="font-bold text-gray-700 dark:text-gray-300">وثایق و تضامین تودیعی</label>
                                    <input
                                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                        value={petroData.internalLc?.collateralDesc || ''}
                                        onChange={e => updatePetro({
                                            internalLc: { ...(petroData.internalLc || { lcNumber: '', issuingBank: '', branch: '', issueDate: '', dueDate: '', lcAmount: 0, status: 'draft' }), collateralDesc: e.target.value }
                                        })}
                                        placeholder="مثال: چک و سفته شرکتی..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* SUB-TAB 3: Loading, Remittance & Logistics */}
            {subTab === 'loading_shipping' && (
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-3xl border border-gray-200 dark:border-gray-700 space-y-6 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-4">
                        <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">اطلاعات حواله پتروشیمی، مانده حواله، بارگیری و ناوگان</h3>
                            <p className="text-xs text-gray-500 mt-0.5">ثبت شماره و تاریخ حواله، مانده حواله، موسسه حمل، برگه تحویل، ساعت ورود/خروج و مشخصات کامیون</p>
                        </div>
                        <span className="px-3 py-1 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 text-xs font-bold rounded-xl border border-amber-200">
                            حواله و بارگیری
                        </span>
                    </div>

                    {/* Section A: Remittance Info (اطلاعات حواله و مانده حواله) */}
                    <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-800/60 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-bold text-xs text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                                <FileText size={15} />
                                <span>اطلاعات حواله فروش پتروشیمی</span>
                            </h4>
                            {(() => {
                                const remQty = petroData.loadingNotice?.remittanceQuantityKg ?? petroData.quantityKg ?? 0;
                                const loadedQty = petroData.loadingNotice?.originNetWeightKg || petroData.invoiceInfo?.invoiceQuantityKg || petroData.warehouseReceipt?.receivedWeightKg || 0;
                                const remaining = petroData.loadingNotice?.remittanceRemainingKg !== undefined
                                    ? petroData.loadingNotice.remittanceRemainingKg
                                    : (loadedQty > 0 ? remQty - loadedQty : remQty);
                                return (
                                    <span className={`px-3 py-1 rounded-xl text-xs font-mono font-black border ${
                                        remaining < 0
                                            ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300'
                                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300'
                                    }`}>
                                        مانده حواله: {remaining.toLocaleString('fa-IR')} kg
                                    </span>
                                );
                            })()}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">شماره حواله فروش پتروشیمی *</label>
                                <input
                                    className="w-full border-2 border-amber-300 dark:border-amber-700 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-black text-gray-900 dark:text-gray-100 text-left dir-ltr"
                                    value={petroData.loadingNotice?.remittanceNumber || ''}
                                    onChange={e => updatePetro({
                                        loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), remittanceNumber: e.target.value }
                                    })}
                                    placeholder="مثال: BT03802/05"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">تاریخ حواله</label>
                                <TradeDatePicker
                                    value={petroData.loadingNotice?.remittanceDate || ''}
                                    onChange={d => updatePetro({
                                        loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), remittanceDate: d }
                                    })}
                                    placeholder="1405/07/26"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">تاریخ و ساعت ثبت حواله</label>
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100 text-left dir-ltr"
                                    value={petroData.loadingNotice?.remittanceRegisteredAt || ''}
                                    onChange={e => updatePetro({
                                        loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), remittanceRegisteredAt: e.target.value }
                                    })}
                                    placeholder="1405/07/26 15:29"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">مقدار حواله (kg)</label>
                                <input
                                    type="number"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-900 dark:text-gray-100 text-center"
                                    value={petroData.loadingNotice?.remittanceQuantityKg ?? petroData.quantityKg ?? ''}
                                    onChange={e => updatePetro({
                                        loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), remittanceQuantityKg: parseFloat(e.target.value) || 0 }
                                    })}
                                    placeholder="مثال: 22000"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">باقیمانده / مانده حواله (kg)</label>
                                <input
                                    type="number"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-900 dark:text-gray-100 text-center"
                                    value={petroData.loadingNotice?.remittanceRemainingKg ?? ''}
                                    onChange={e => updatePetro({
                                        loadingNotice: {
                                            ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }),
                                            remittanceRemainingKg: e.target.value === '' ? undefined : parseFloat(e.target.value)
                                        }
                                    })}
                                    placeholder="مثال: -70 (محاسبه خودکار اگر خالی باشد)"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">کد سهمیه سامانه بهین‌یاب</label>
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100"
                                    value={petroData.loadingNotice?.behenyabCode || ''}
                                    onChange={e => updatePetro({
                                        loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), behenyabCode: e.target.value }
                                    })}
                                    placeholder="کد بهین‌یاب..."
                                />
                            </div>

                            <div className="md:col-span-3 space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">توضیحات پیش‌فاکتور / حواله</label>
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100"
                                    value={petroData.loadingNotice?.remittanceNotes || ''}
                                    onChange={e => updatePetro({
                                        loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), remittanceNotes: e.target.value }
                                    })}
                                    placeholder="توضیحات درج شده در برگه حواله یا پیش‌فاکتور..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section B: Loading Details & Fleet (اطلاعات بارگیری و ناوگان) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">موسسه حمل / باربری</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.loadingNotice?.transportCompany || ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), transportCompany: e.target.value }
                                })}
                                placeholder="مثال: بهرام بار بندر"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">شماره سریال برگه تحویل</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-900 dark:text-gray-100 text-left dir-ltr"
                                value={petroData.loadingNotice?.deliveryNoteSerial || ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), deliveryNoteSerial: e.target.value }
                                })}
                                placeholder="مثال: 142592"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">وزن خالص بارگیری پتروشیمی (kg)</label>
                            <input
                                type="number"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-emerald-700 dark:text-emerald-400 text-center"
                                value={petroData.loadingNotice?.originNetWeightKg ?? ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), originNetWeightKg: parseFloat(e.target.value) || 0 }
                                })}
                                placeholder="مثال: 22070"
                            />
                        </div>

                        <div className="md:col-span-3 space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">آدرس محل تخلیه</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.loadingNotice?.unloadingAddress || ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), unloadingAddress: e.target.value }
                                })}
                                placeholder="مثال: شهرک صنعتی علی آباد خیابان تیر روزبه 8 و 9 شرکت لپان"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">شماره بارنامه تمبردار دولتی</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100"
                                value={petroData.loadingNotice?.waybillNumber || ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), waybillNumber: e.target.value }
                                })}
                                placeholder="شماره بارنامه..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">نام راننده</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.loadingNotice?.driverName || ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), driverName: e.target.value }
                                })}
                                placeholder="نام و نام خانوادگی راننده..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">شماره موبایل راننده</label>
                            <div className="relative">
                                <input
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100 text-left dir-ltr pl-10"
                                    value={petroData.loadingNotice?.driverPhone || ''}
                                    onChange={e => updatePetro({
                                        loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), driverPhone: e.target.value }
                                    })}
                                    placeholder="0912..."
                                />
                                {petroData.loadingNotice?.driverPhone && (
                                    <a
                                        href={`tel:${petroData.loadingNotice.driverPhone}`}
                                        className="absolute left-2 top-2.5 p-1 text-emerald-600 hover:text-emerald-800"
                                        title="تماس"
                                    >
                                        <Phone size={16} />
                                    </a>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">شماره کامیون (پلاک)</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100 text-center font-bold"
                                value={petroData.loadingNotice?.truckPlate || ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), truckPlate: e.target.value }
                                })}
                                placeholder="مثال: 66ع279ایران69"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">ساعت و تاریخ ورود</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100 text-left dir-ltr"
                                value={petroData.loadingNotice?.entryDateTime || ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), entryDateTime: e.target.value }
                                })}
                                placeholder="1405/08/11 08:30"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">ساعت و تاریخ خروج</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100 text-left dir-ltr"
                                value={petroData.loadingNotice?.exitDateTime || ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), exitDateTime: e.target.value }
                                })}
                                placeholder="1405/08/11 00:00"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">کل کرایه حمل باربری (ریال) *</label>
                            <input
                                type="text"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-emerald-700 dark:text-emerald-400 text-center"
                                value={formatNumberString(petroData.loadingNotice?.freightCostRial || 0)}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), freightCostRial: deformatNumberString(e.target.value) }
                                })}
                                placeholder="مبلغ کرایه حمل..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">تاریخ بارگیری از پتروشیمی</label>
                            <TradeDatePicker
                                value={petroData.loadingNotice?.loadingDate || ''}
                                onChange={d => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), loadingDate: d }
                                })}
                                placeholder="1405/08/11"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">وضعیت حمل و ارسال</label>
                            <select
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.loadingNotice?.deliveryStatus || 'pending_loading'}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || {}), deliveryStatus: e.target.value as any }
                                })}
                            >
                                <option value="pending_loading">⏳ در انتظار صدور حواله و بارگیری</option>
                                <option value="loaded">📦 بارگیری شده در پتروشیمی</option>
                                <option value="dispatched">🚚 در حال حمل جاده‌ای به کارخانه</option>
                                <option value="delivered_warehouse">✅ تحویل و تخلیه در انبار کارخانه</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* SUB-TAB 4: Factory Warehouse Receipt & QC */}
            {subTab === 'warehouse' && (
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-3xl border border-gray-200 dark:border-gray-700 space-y-6 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-4">
                        <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">رسید انبار کارخانه، توزین باسکول و آزمون کنترل کیفیت</h3>
                            <p className="text-xs text-gray-500 mt-0.5">ثبت اطلاعات باسکول، مقایسه وزن با فاکتور پتروشیمی و تایید کیفی آزمایشگاه</p>
                        </div>
                        <span className="px-3 py-1 bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 text-xs font-bold rounded-xl border border-teal-200">
                            انبار کارخانه و QC
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">شماره رسید انبار مواد اولیه</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100"
                                value={petroData.warehouseReceipt?.receiptNumber || ''}
                                onChange={e => updatePetro({
                                    warehouseReceipt: { ...(petroData.warehouseReceipt || {}), receiptNumber: e.target.value }
                                })}
                                placeholder="شماره قبض انبار..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">وزن خالص باسکول کارخانه (kg) *</label>
                            <input
                                type="number"
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-base font-mono font-bold text-emerald-700 dark:text-emerald-400 text-center"
                                value={petroData.warehouseReceipt?.receivedWeightKg || ''}
                                onChange={e => updatePetro({
                                    warehouseReceipt: { ...(petroData.warehouseReceipt || {}), receivedWeightKg: parseFloat(e.target.value) || 0 }
                                })}
                                placeholder="وزن خالص باسکول..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">تاریخ تحویل و ورود به انبار</label>
                            <TradeDatePicker
                                value={petroData.warehouseReceipt?.receiptDate || ''}
                                onChange={d => updatePetro({
                                    warehouseReceipt: { ...(petroData.warehouseReceipt || {}), receiptDate: d }
                                })}
                                placeholder="تاریخ تخلیه..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">انبار مقصد</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.warehouseReceipt?.warehouseName || ''}
                                onChange={e => updatePetro({
                                    warehouseReceipt: { ...(petroData.warehouseReceipt || {}), warehouseName: e.target.value }
                                })}
                                placeholder="نام انبار..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">وضعیت کنترل کیفی و آزمایشگاه</label>
                            <select
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.warehouseReceipt?.qcStatus || 'pending'}
                                onChange={e => updatePetro({
                                    warehouseReceipt: { ...(petroData.warehouseReceipt || {}), qcStatus: e.target.value as any }
                                })}
                            >
                                <option value="pending">⏳ در حال انجام آزمون آزمایشگاه</option>
                                <option value="approved">✅ تایید کیفی کامل (مطابق استاندارد)</option>
                                <option value="conditional">⚠️ پذیرش مشروط</option>
                                <option value="rejected">❌ عدم تایید کیفی (مردود)</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-3 pt-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={petroData.warehouseReceipt?.isConfirmed || false}
                                    onChange={e => updatePetro({
                                        warehouseReceipt: { ...(petroData.warehouseReceipt || {}), isConfirmed: e.target.checked }
                                    })}
                                    className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
                                />
                                <span className="font-bold text-xs text-gray-800 dark:text-gray-200">
                                    تایید نهایی ورود بار به انبار کارخانه
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Weight Variance Notice */}
                    {weightVarianceKg !== 0 && (
                        <div className={`p-4 rounded-2xl border text-xs flex flex-wrap items-center justify-between gap-3 ${
                            weightVarianceKg < 0 
                                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-900 dark:text-amber-200' 
                                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-900 dark:text-emerald-200'
                        }`}>
                            <div className="flex items-center gap-2">
                                <Scale size={18} />
                                <span className="font-bold">
                                    {weightVarianceKg < 0 ? 'کسری وزن باسکول کارخانه نسبت به پیش‌فاکتور پتروشیمی:' : 'اضافه وزن باسکول کارخانه نسبت به پیش‌فاکتور:'}
                                </span>
                            </div>
                            <div className="font-mono font-black text-sm">
                                {Math.abs(weightVarianceKg).toLocaleString('fa-IR')} کیلوگرم 
                                <span className="text-xs font-normal mr-1">({Math.abs(variancePercent).toFixed(2)}%)</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* SUB-TAB 5: Costing Analysis */}
            {subTab === 'costing' && (
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-3xl border border-gray-200 dark:border-gray-700 space-y-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-4">
                        <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">آنالیز نهایی بهای تمام‌شده خرید پتروشیمی (Cost Per Kg)</h3>
                            <p className="text-xs text-gray-500 mt-0.5">تفکیک هزینه‌های خرید، ارزش افزوده، کارمزد بورس، کارمزد بانکی و کرایه حمل</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowPrintModal(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                            >
                                <Printer size={14} />
                                <span>چاپ صورت وضعیت رسمی</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                            >
                                <FileSpreadsheet size={14} />
                                <span>دانلود اکسل</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 bg-slate-50 dark:bg-gray-900/40 rounded-2xl border border-slate-200 dark:border-gray-700">
                            <span className="text-xs text-gray-500 block mb-1">ارزش خرید کالا</span>
                            <span className="font-mono text-lg font-black text-gray-900 dark:text-gray-100">
                                {(petroData.totalGoodsPrice || 0).toLocaleString('fa-IR')} <span className="text-xs font-normal">ریال</span>
                            </span>
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-gray-900/40 rounded-2xl border border-slate-200 dark:border-gray-700">
                            <span className="text-xs text-gray-500 block mb-1">مالیات و کارمزد بورس</span>
                            <span className="font-mono text-lg font-black text-gray-900 dark:text-gray-100">
                                {((petroData.vatAmount || 0) + (petroData.brokerageFee || 0)).toLocaleString('fa-IR')} <span className="text-xs font-normal">ریال</span>
                            </span>
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-gray-900/40 rounded-2xl border border-slate-200 dark:border-gray-700">
                            <span className="text-xs text-gray-500 block mb-1">کرایه حمل ناوگان</span>
                            <span className="font-mono text-lg font-black text-gray-900 dark:text-gray-100">
                                {totalFreight.toLocaleString('fa-IR')} <span className="text-xs font-normal">ریال</span>
                            </span>
                        </div>

                        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                            <span className="text-xs text-emerald-800 dark:text-emerald-300 font-bold block mb-1">بهای تمام‌شده هر کیلوگرم</span>
                            <span className="font-mono text-xl font-black text-emerald-900 dark:text-emerald-100">
                                {costPerKg.toLocaleString('fa-IR')} <span className="text-xs font-normal">ریال/kg</span>
                            </span>
                        </div>
                    </div>

                    {/* Cost Per Kg Highlight Box */}
                    <div className="p-5 bg-gradient-to-r from-emerald-800 to-teal-900 text-white rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 shadow-lg">
                        <div>
                            <h4 className="text-sm font-bold text-emerald-200">بهای تمام‌شده قطعی هر کیلوگرم تحویل انبار کارخانه</h4>
                            <p className="text-xs text-white/80 mt-0.5">محاسبه بر اساس وزن نهایی باسکول ({finalReceivedWeight.toLocaleString('fa-IR')} kg) و مجموع کل هزینه‌ها</p>
                        </div>
                        <div className="text-left font-mono">
                            <span className="text-2xl sm:text-3xl font-black">{costPerKg.toLocaleString('fa-IR')}</span>
                            <span className="text-xs mr-1 text-emerald-200">ریال / کیلوگرم</span>
                            <span className="text-xs text-emerald-300 block font-sans">
                                (معادل {Math.round(costPerKg / 10).toLocaleString('fa-IR')} تومان در هر کیلوگرم)
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Petrochemical & Bourse Documents & Attachments */}
            <div className="glass-panel p-6 rounded-2xl shadow-sm border border-emerald-100 dark:border-emerald-950/60 bg-white dark:bg-gray-800/90 space-y-4">
                <TradeAttachmentSection
                    attachments={record.attachments || []}
                    onAttachmentsChange={(updated) => {
                        onUpdateRecord({ ...record, attachments: updated });
                    }}
                    category="commercial/petrochemical"
                    title="پیوست‌ها و اسناد خرید پتروشیمی و بورس کالا (تصویر و PDF)"
                    description="تصویر قرارداد بورس کالا، پیش‌فاکتور پتروشیمی، نامه‌های گشایش ال‌سی داخلی/برات، فیش‌های واریزی و قبوض باسکول"
                    currentUser={currentUser}
                />
            </div>
        </div>
    );
};
export default DomesticPetrochemicalTab;
