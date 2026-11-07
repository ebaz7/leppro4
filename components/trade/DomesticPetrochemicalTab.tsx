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
        const vat = next.vatAmount !== undefined && next.vatAmount > 0 
            ? next.vatAmount 
            : Math.round(totalGoods * 0.10); // Standard 10% VAT
        const brokerage = next.brokerageFee !== undefined && next.brokerageFee > 0 
            ? next.brokerageFee 
            : Math.round(totalGoods * 0.0036); // standard bourse & broker fees ~0.36%
        const otherFees = next.otherFees || 0;
        const totalInvoice = totalGoods + vat + brokerage + otherFees;

        next.totalGoodsPrice = totalGoods;
        if (!partial.vatAmount) next.vatAmount = vat;
        if (!partial.brokerageFee) next.brokerageFee = brokerage;
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
                        <tr class="header-row"><td colspan="4">۱. اطلاعات قرارداد بورس و کالا</td></tr>
                        <tr><td>گرید کالا</td><td>${petroData.gradeName || record.goodsName}</td><td>شماره قرارداد بورس</td><td>${petroData.contractNumber || '---'}</td></tr>
                        <tr><td>کارگزاری</td><td>${petroData.brokerName || '---'}</td><td>شماره پیش‌فاکتور</td><td>${petroData.proformaNumber || '---'}</td></tr>
                        <tr><td>وزن معامله (کیلوگرم)</td><td class="num">${petroData.quantityKg || 0}</td><td>نرخ پایه هر کیلو (ریال)</td><td class="num">${petroData.basePricePerKg || 0}</td></tr>
                        <tr><td>ارزش خالص کالا (ریال)</td><td class="num">${petroData.totalGoodsPrice || 0}</td><td>مالیات ارزش افزوده ۱۰٪</td><td class="num">${petroData.vatAmount || 0}</td></tr>
                        <tr><td>کارمزد بورس و کارگزاری</td><td class="num">${petroData.brokerageFee || 0}</td><td>مبلغ کل فاکتور پتروشیمی</td><td class="num">${petroData.totalInvoiceAmount || 0}</td></tr>
                        
                        <tr class="header-row"><td colspan="4">۲. تسویه مالی و اسناد بانکی</td></tr>
                        <tr><td>روش تسویه</td><td>${petroData.paymentMethod === 'internal_lc' ? 'اعتبار اسنادی داخلی (LC)' : petroData.paymentMethod === 'draft_barat' ? 'برات الکترونیک (سپام)' : 'نقدی بورس'}</td><td>بانک عامل</td><td>${petroData.paymentMethod === 'internal_lc' ? petroData.internalLc?.issuingBank : petroData.paymentMethod === 'draft_barat' ? petroData.draftBarat?.bankName : 'اتاق پایاپای'}</td></tr>
                        <tr><td>شناسه سند / LC / سپام</td><td>${petroData.paymentMethod === 'internal_lc' ? (petroData.internalLc?.lcNumber || '---') : petroData.paymentMethod === 'draft_barat' ? (petroData.draftBarat?.sepamCode || '---') : '---'}</td><td>تاریخ سررسید</td><td>${petroData.paymentMethod === 'internal_lc' ? (petroData.internalLc?.dueDate || '---') : petroData.paymentMethod === 'draft_barat' ? (petroData.draftBarat?.dueDate || '---') : '---'}</td></tr>
                        
                        <tr class="header-row"><td colspan="4">۳. لجستیک، ناوگان و باسکول کارخانه</td></tr>
                        <tr><td>شماره حواله فروش</td><td>${petroData.loadingNotice?.remittanceNumber || '---'}</td><td>کد بهین‌یاب</td><td>${petroData.loadingNotice?.behenyabCode || '---'}</td></tr>
                        <tr><td>نام راننده و شماره تماس</td><td>${petroData.loadingNotice?.driverName || '---'} (${petroData.loadingNotice?.driverPhone || '---'})</td><td>پلاک کامیون</td><td>${petroData.loadingNotice?.truckPlate || '---'}</td></tr>
                        <tr><td>شماره بارنامه</td><td>${petroData.loadingNotice?.waybillNumber || '---'}</td><td>کرایه حمل کل (ریال)</td><td class="num">${totalFreight}</td></tr>
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
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-emerald-200">
                        <span>قرارداد بورس: <strong className="font-mono text-white">{petroData.contractNumber || 'ثبت نشده'}</strong></span>
                        <span>•</span>
                        <span>پیش‌فاکتور: <strong className="font-mono text-white">{petroData.proformaNumber || 'ثبت نشده'}</strong></span>
                        <span>•</span>
                        <span>روش تسویه: <strong className="text-amber-300">
                            {petroData.paymentMethod === 'internal_lc' ? 'اعتبار اسنادی داخلی (LC ریالی)' : petroData.paymentMethod === 'draft_barat' ? 'برات الکترونیک (سپام)' : 'نقدی بورس'}
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

            {/* SUB-TAB 1: Bourse Contract & Proforma */}
            {subTab === 'contract' && (
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-3xl border border-gray-200 dark:border-gray-700 space-y-6 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-4">
                        <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">مشخصات عرضه بورس کالا و پیش‌فاکتور پتروشیمی</h3>
                            <p className="text-xs text-gray-500 mt-0.5">اطلاعات پایه عرضه، کارگزاری، گرید، تناژ و مبالغ معامله شده</p>
                        </div>
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-bold rounded-xl border border-emerald-200">
                            بورس کالای ایران
                        </span>
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
                            <label className="font-bold text-gray-700 dark:text-gray-300">کارگزاری بورس کالا</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.brokerName || ''}
                                onChange={e => updatePetro({ brokerName: e.target.value })}
                                placeholder="مثال: کاریزما، آگاه، مفید، صبا جهاد..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">شماره قرارداد / شناسه معامله بورس</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100"
                                value={petroData.contractNumber || ''}
                                onChange={e => updatePetro({ contractNumber: e.target.value })}
                                placeholder="شناسه معامله / قرارداد..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">کد عرضه بورس کالا</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100"
                                value={petroData.offeringCode || ''}
                                onChange={e => updatePetro({ offeringCode: e.target.value })}
                                placeholder="کد اطلاعیه عرضه..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">شماره پیش‌فاکتور داخلی پتروشیمی</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100"
                                value={petroData.proformaNumber || ''}
                                onChange={e => updatePetro({ proformaNumber: e.target.value })}
                                placeholder="شماره پیش‌فاکتور..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">تاریخ پیش‌فاکتور</label>
                            <TradeDatePicker
                                value={petroData.proformaDate || ''}
                                onChange={d => updatePetro({ proformaDate: d })}
                                placeholder="تاریخ صدور..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">گرید کالایی پتروشیمی *</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-bold text-gray-900 dark:text-gray-100"
                                value={petroData.gradeName || ''}
                                onChange={e => updatePetro({ gradeName: e.target.value })}
                                placeholder="مثال: چیپس نساجی TG642، پلی‌پروپیلن C30S..."
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">مهلت تسویه در بورس کالا</label>
                            <TradeDatePicker
                                value={petroData.bourseSettlementDeadline || ''}
                                onChange={d => updatePetro({ bourseSettlementDeadline: d })}
                                placeholder="تاریخ مهلت تسویه..."
                            />
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

                    {/* Quantities & Price Breakdown Grid */}
                    <div className="p-5 bg-slate-50 dark:bg-gray-900/50 rounded-2xl border border-slate-200 dark:border-gray-700 space-y-4">
                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <Calculator size={18} className="text-emerald-600" />
                            <span>محاسبه مالی پیش‌فاکتور و معامله بورس کالا</span>
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">وزن معامله شده (کیلوگرم) *</label>
                                <input
                                    type="number"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-base font-mono font-bold text-gray-900 dark:text-gray-100 text-center"
                                    value={petroData.quantityKg || ''}
                                    onChange={e => updatePetro({ quantityKg: parseFloat(e.target.value) || 0 })}
                                    placeholder="مثال: 50000"
                                />
                                <span className="text-[11px] text-gray-500 block text-left">
                                    معادل: {((petroData.quantityKg || 0) / 1000).toFixed(2)} تن
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">قیمت معامله شده هر کیلو (ریال) *</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-base font-mono font-bold text-emerald-700 dark:text-emerald-400 text-center"
                                    value={formatNumberString(petroData.basePricePerKg || 0)}
                                    onChange={e => updatePetro({ basePricePerKg: deformatNumberString(e.target.value) })}
                                    placeholder="نرخ هر کیلوگرم..."
                                />
                                <span className="text-[11px] text-gray-500 block text-left">
                                    {(petroData.basePricePerKg || 0).toLocaleString('fa-IR')} ریال
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">مبلغ خالص کالا (ریال)</label>
                                <div className="w-full p-3 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl font-mono text-base font-black text-emerald-800 dark:text-emerald-300 text-center">
                                    {(petroData.totalGoodsPrice || 0).toLocaleString('fa-IR')}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2 border-t border-slate-200 dark:border-gray-800">
                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">مالیات بر ارزش افزوده (۱۰٪) (ریال)</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-800 dark:text-gray-200 text-center"
                                    value={formatNumberString(petroData.vatAmount || 0)}
                                    onChange={e => updatePetro({ vatAmount: deformatNumberString(e.target.value) })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="font-bold text-gray-700 dark:text-gray-300">کارمزد بورس کالا و کارگزاری (ریال)</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono font-bold text-gray-800 dark:text-gray-200 text-center"
                                    value={formatNumberString(petroData.brokerageFee || 0)}
                                    onChange={e => updatePetro({ brokerageFee: deformatNumberString(e.target.value) })}
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
                            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">حواله پتروشیمی، سامانه بهین‌یاب و ناوگان بارگیری</h3>
                            <p className="text-xs text-gray-500 mt-0.5">ثبت حواله بارگیری، سهمیه بهین‌یاب، اطلاعات بارنامه، راننده، پلاک کامیون و کرایه حمل</p>
                        </div>
                        <span className="px-3 py-1 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 text-xs font-bold rounded-xl border border-amber-200">
                            ناوگان و لجستیک
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="space-y-1.5">
                            <label className="font-bold text-gray-700 dark:text-gray-300">شماره حواله فروش پتروشیمی *</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100"
                                value={petroData.loadingNotice?.remittanceNumber || ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), remittanceNumber: e.target.value }
                                })}
                                placeholder="شماره حواله..."
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
                            <label className="font-bold text-gray-700 dark:text-gray-300">پلاک کامیون / تریلی</label>
                            <input
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-3 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-gray-100 text-center font-bold"
                                value={petroData.loadingNotice?.truckPlate || ''}
                                onChange={e => updatePetro({
                                    loadingNotice: { ...(petroData.loadingNotice || { deliveryStatus: 'pending_loading' }), truckPlate: e.target.value }
                                })}
                                placeholder="مثال: 12 ع 345 ایران 68"
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
                                placeholder="تاریخ بارگیری..."
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
