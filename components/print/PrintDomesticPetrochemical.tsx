import React, { useEffect, useState, useRef } from 'react';
import { X, Printer, Loader2, FileDown, ZoomIn, ZoomOut, RotateCcw, Building2, Truck, Landmark, Scale, FileText, CheckCircle2 } from 'lucide-react';
import { TradeRecord, SystemSettings, PetrochemicalPurchaseData } from '../../types';
import { formatCurrency, formatNumberString } from '../../constants';
import { generatePdf } from '../../utils/pdfGenerator';
import { shareElementToChat } from '../../services/chatShareService';

interface Props {
  record: TradeRecord;
  settings?: SystemSettings | null;
  onClose: () => void;
}

export const PrintDomesticPetrochemical: React.FC<Props> = ({ record, settings, onClose }) => {
  const [processing, setProcessing] = useState(false);
  const [scale, setScale] = useState(1);
  const [userZoom, setUserZoom] = useState<number | null>(null);
  const containerWrapperRef = useRef<HTMLDivElement>(null);

  const petro: PetrochemicalPurchaseData = record.petrochemicalData || {
    petrochemicalName: record.sellerName || 'پتروشیمی',
    paymentMethod: 'cash',
    quantityKg: 0,
    basePricePerKg: 0,
    totalGoodsPrice: 0,
    vatAmount: 0,
    brokerageFee: 0,
    totalInvoiceAmount: 0
  };

  const companyInfo = settings?.companies?.find(c => c.name === record.company) || {
    name: record.company || 'شرکت کارخانجات',
    economicCode: '',
    nationalId: '',
    registrationNumber: '',
    phone: '',
    address: ''
  };

  const invoiceInfo: NonNullable<PetrochemicalPurchaseData['invoiceInfo']> = petro.invoiceInfo || {};
  const loading: Partial<NonNullable<PetrochemicalPurchaseData['loadingNotice']>> = petro.loadingNotice || {};
  const remittanceQty = loading.remittanceQuantityKg ?? petro.quantityKg ?? 0;
  const loadedQty = loading.originNetWeightKg ?? petro.warehouseReceipt?.receivedWeightKg ?? 0;
  const remittanceRemaining = loading.remittanceRemainingKg !== undefined
    ? loading.remittanceRemainingKg
    : (remittanceQty - loadedQty);

  const totalFreight = loading.freightCostRial || 0;
  const bankComm = petro.paymentMethod === 'internal_lc' 
    ? (petro.internalLc?.commissionFee || 0) + (petro.internalLc?.extensionFee || 0) + (petro.internalLc?.taxStampFee || 0)
    : petro.paymentMethod === 'draft_barat'
      ? (petro.draftBarat?.interestAmount || 0) + (petro.draftBarat?.sepamFee || 0)
      : 0;

  const totalOtherCosts = (petro.otherCosts || []).reduce((acc, c) => acc + (c.amount || 0), 0);
  const grandTotalCost = (petro.totalInvoiceAmount || 0) + totalFreight + bankComm + totalOtherCosts;
  const receivedWeightKg = petro.warehouseReceipt?.receivedWeightKg || petro.quantityKg || 1;
  const costPerKg = receivedWeightKg > 0 ? Math.round(grandTotalCost / receivedWeightKg) : 0;
  const varianceKg = (petro.warehouseReceipt?.receivedWeightKg || 0) > 0
    ? (petro.warehouseReceipt!.receivedWeightKg! - (petro.quantityKg || 0))
    : 0;

  useEffect(() => {
    const styleId = 'page-size-style-domestic-petro';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.innerHTML = `
      @media print {
        @page { size: A4 portrait; margin: 0; }
        body { margin: 0 !important; padding: 0 !important; background: white !important; }
        .no-print { display: none !important; }
        #domestic-petro-print-area {
          width: 210mm !important;
          height: 297mm !important;
          max-height: 297mm !important;
          margin: 0 auto !important;
          padding: 7mm 9mm !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          page-break-after: avoid !important;
          page-break-before: avoid !important;
          page-break-inside: avoid !important;
        }
      }
    `;
    return () => {
      if (style) style.remove();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (userZoom !== null) return;
      const wrapper = containerWrapperRef.current;
      if (wrapper) {
        const wrapperWidth = wrapper.clientWidth;
        const targetWidth = 794;
        const padding = 32;
        const availableWidth = wrapperWidth - padding;
        if (availableWidth < targetWidth) {
          setScale(Math.max(0.35, Math.min(1, availableWidth / targetWidth)));
        } else {
          setScale(1);
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [userZoom]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('domestic-petro-print-area');
    if (!element) return;
    try {
      setProcessing(true);
      const fileName = `خرید_پتروشیمی_${petro.petrochemicalName || 'پتروشیمی'}_${record.fileNumber || 'پرونده'}.pdf`;
      await generatePdf({ elementId: 'domestic-petro-print-area', filename: fileName });
    } catch (e) {
      console.error('Error generating PDF', e);
      alert('خطا در ایجاد فایل PDF');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 z-[99999] flex flex-col justify-between overflow-hidden backdrop-blur-sm" dir="rtl">
      {/* Top Action Bar */}
      <div className="no-print bg-slate-900 border-b border-slate-700 text-white px-4 py-2.5 flex items-center justify-between shrink-0 shadow-lg z-20">
        <div className="flex items-center gap-3">
          <Building2 size={20} className="text-emerald-400" />
          <span className="font-bold text-sm sm:text-base">
            صورتحساب و بهای تمام‌شده خرید پتروشیمی ({record.goodsName})
          </span>
          {loading.remittanceNumber && (
            <span className="hidden md:inline-block px-2 py-0.5 text-xs bg-amber-500/20 text-amber-300 rounded border border-amber-400/40 font-mono">
              حواله: {loading.remittanceNumber}
            </span>
          )}
          <span className="hidden sm:inline-block px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-300 rounded border border-emerald-400/30">
            {petro.paymentMethod === 'internal_lc' ? 'اعتبار اسنادی LC' : petro.paymentMethod === 'draft_barat' ? 'برات الکترونیک سپام' : 'نقدی بورس کالا'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button
              type="button"
              onClick={() => setUserZoom(prev => Math.max(0.4, (prev ?? scale) - 0.1))}
              className="p-1.5 hover:bg-slate-700 rounded text-slate-300"
              title="کوچک‌نمایی"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs px-2 font-mono">{Math.round((userZoom ?? scale) * 100)}%</span>
            <button
              type="button"
              onClick={() => setUserZoom(prev => Math.min(1.8, (prev ?? scale) + 0.1))}
              className="p-1.5 hover:bg-slate-700 rounded text-slate-300"
              title="بزرگ‌نمایی"
            >
              <ZoomIn size={16} />
            </button>
            {userZoom !== null && (
              <button
                type="button"
                onClick={() => setUserZoom(null)}
                className="p-1.5 hover:bg-slate-700 rounded text-amber-400 border-r border-slate-700 mr-1"
                title="بازنشانی زوم خودکار"
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={processing}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
          >
            {processing ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            <span>دانلود PDF</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm"
          >
            <Printer size={16} />
            <span>چاپ برگه</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Preview Area */}
      <div
        ref={containerWrapperRef}
        className="flex-1 overflow-auto p-4 flex justify-center items-start bg-slate-950/60 custom-scrollbar"
      >
        <div
          style={{
            transform: `scale(${userZoom ?? scale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.1s ease-out'
          }}
          className="shrink-0 shadow-2xl"
        >
          {/* A4 Printable Sheet */}
          <div
            id="domestic-petro-print-area"
            className="bg-white text-slate-900 w-[210mm] min-h-[297mm] p-5 text-[10px] font-sans border border-gray-300 relative flex flex-col justify-between"
            style={{ boxSizing: 'border-box' }}
          >
            <div>
              {/* Header Box */}
              <div className="border-2 border-slate-800 rounded-xl p-2.5 mb-2">
                <div className="flex justify-between items-center border-b border-slate-300 pb-1.5 mb-1.5">
                  <div className="w-1/4">
                    <span className="font-bold text-slate-600 block text-[9px]">مشتری / خریدار:</span>
                    <span className="font-black text-slate-900 text-xs">{petro.customerName || companyInfo.name}</span>
                  </div>
                  <div className="w-2/4 text-center">
                    <h1 className="text-sm font-black text-slate-900">صورت وضعیت خرید مواد اولیه پتروشیمی و بهای تمام‌شده</h1>
                    <span className="text-[9px] text-slate-600 font-bold">{petro.exchangeMarket || 'بورس کالای ایران'} / سامانه آرکا و بهین‌یاب</span>
                  </div>
                  <div className="w-1/4 text-left font-mono text-[9.5px] space-y-0.5">
                    <div>شماره پرونده: <strong className="text-[11px]">{record.fileNumber || '---'}</strong></div>
                    <div className="text-amber-900">شماره حواله: <strong className="text-[11px] bg-amber-100 px-1 rounded">{loading.remittanceNumber || '---'}</strong></div>
                    <div>تاریخ چاپ: <strong>{new Date().toLocaleDateString('fa-IR')}</strong></div>
                  </div>
                </div>

                {/* ARCA Contract Base Info */}
                <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[9px] text-slate-700">
                  <div>فروشنده (پتروشیمی): <strong className="text-slate-900">{petro.petrochemicalName}</strong></div>
                  <div>قرارداد / جزء: <strong className="font-mono text-slate-900">{petro.contractNumber || '---'}{petro.contractSubNumber ? `/${petro.contractSubNumber}` : ''}</strong></div>
                  <div>تاریخ قرارداد / عرضه: <strong className="font-mono text-slate-900">{petro.contractDate || '---'} {petro.offeringDate ? `(${petro.offeringDate})` : ''}</strong></div>
                  <div>تاریخ / مهلت تحویل: <strong className="font-mono text-slate-900">{petro.deliveryDate || petro.calculatedDeliveryDeadline || '---'}</strong></div>
                  <div>کارگزار خریدار: <strong className="text-slate-900">{petro.brokerName || '---'}</strong></div>
                  <div>کارگزار فروشنده: <strong className="text-slate-900">{petro.sellerBrokerName || '---'}</strong></div>
                  <div>محل تحویل: <strong className="text-slate-900">{petro.deliveryLocation || 'انبار کارخانه'}</strong></div>
                  <div>تاریخ تسویه: <strong className="font-mono text-slate-900">{petro.settlementDate || petro.bourseSettlementDeadline || '---'}</strong></div>
                  <div>عنوان نماد: <strong className="font-mono text-slate-900">{petro.symbolTitle || '---'}</strong></div>
                  <div>بسته‌بندی / کیفیت: <strong className="text-slate-900">{petro.packagingTitle || '---'} / {petro.qualityCode || 'منطبق'}</strong></div>
                  <div>پیش‌فاکتور / شناسه پرداخت: <strong className="font-mono text-slate-900">{petro.proformaNumber || '---'}{petro.paymentIdentifier ? ` / ${petro.paymentIdentifier}` : ''}</strong></div>
                  <div>مرحله جاری: <strong className="text-emerald-900">{petro.currentStage || '---'}</strong></div>
                </div>
              </div>

              {/* Specs & Goods Detail */}
              <div className="border border-slate-300 rounded-lg p-2 mb-2 bg-slate-50/50">
                <h3 className="font-bold text-[10.5px] text-slate-800 mb-1.5 border-b border-slate-200 pb-0.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText size={12} className="text-slate-700" />
                    <span>مشخصات کالا، قرارداد بورس و صورتحساب رسمی</span>
                  </span>
                  <span className="text-[9px] font-normal text-slate-600">
                    ارز مبنا: <strong>{petro.baseCurrency || 'ریال'}</strong> | وضعیت مالیات: <strong>{petro.vatStatus === 'exempt' ? 'معاف' : 'مشمول'}</strong> | وضعیت جریمه: <strong>{petro.penaltyStatus || 'ندارد'}</strong>
                  </span>
                </h3>
                <table className="w-full text-center border-collapse text-[9.5px]">
                  <thead>
                    <tr className="bg-slate-200 text-slate-800 font-bold border border-slate-300">
                      <th className="p-1 border border-slate-300">نام تجاری محصول</th>
                      <th className="p-1 border border-slate-300">وزن (kg)</th>
                      <th className="p-1 border border-slate-300">نرخ واحد (ریال)</th>
                      <th className="p-1 border border-slate-300">ارزش قرارداد (ریال)</th>
                      <th className="p-1 border border-slate-300">ارزش افزوده</th>
                      <th className="p-1 border border-slate-300">کارمزد بورس</th>
                      <th className="p-1 border border-slate-300">سهم فروشنده</th>
                      <th className="p-1 border border-slate-300">جمع نهایی (ریال)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border border-slate-300 font-mono">
                      <td className="p-1.5 border border-slate-300 font-sans font-bold">{petro.gradeName || record.goodsName}</td>
                      <td className="p-1.5 border border-slate-300 font-bold">{petro.quantityKg?.toLocaleString('fa-IR')}</td>
                      <td className="p-1.5 border border-slate-300 font-bold">{petro.basePricePerKg?.toLocaleString('fa-IR')}</td>
                      <td className="p-1.5 border border-slate-300">{petro.totalGoodsPrice?.toLocaleString('fa-IR')}</td>
                      <td className="p-1.5 border border-slate-300">{petro.vatAmount?.toLocaleString('fa-IR')}</td>
                      <td className="p-1.5 border border-slate-300">{petro.brokerageFee?.toLocaleString('fa-IR')}</td>
                      <td className="p-1.5 border border-slate-300">{(petro.sellerShareRial ?? 0).toLocaleString('fa-IR')}</td>
                      <td className="p-1.5 border border-slate-300 font-bold text-slate-900 bg-slate-100">{petro.totalInvoiceAmount?.toLocaleString('fa-IR')}</td>
                    </tr>
                  </tbody>
                </table>
                {(invoiceInfo.invoiceNumber || invoiceInfo.finalInvoiceAmount || petro.delayPenaltyAmount || petro.cancellationPenaltyAmount) && (
                  <div className="grid grid-cols-4 gap-2 text-[9px] mt-1.5 pt-1 border-t border-slate-200 text-slate-700">
                    <div>شماره صورتحساب: <strong className="font-mono text-indigo-900">{invoiceInfo.invoiceNumber || '---'}</strong></div>
                    <div>تاریخ صورتحساب: <strong className="font-mono">{invoiceInfo.invoiceDate || '---'}</strong></div>
                    <div>مقدار صورتحساب: <strong className="font-mono">{invoiceInfo.invoiceQuantityKg ? `${invoiceInfo.invoiceQuantityKg.toLocaleString('fa-IR')} kg` : '---'}</strong></div>
                    <div>جمع صورتحساب: <strong className="font-mono text-indigo-950">{invoiceInfo.finalInvoiceAmount ? `${invoiceInfo.finalInvoiceAmount.toLocaleString('fa-IR')} ریال` : '---'}</strong></div>
                  </div>
                )}
              </div>

              {/* Settlement & Banking Section */}
              <div className="border border-slate-300 rounded-lg p-2 mb-2">
                <h3 className="font-bold text-[10.5px] text-slate-800 mb-1 border-b border-slate-200 pb-0.5 flex items-center gap-1.5">
                  <Landmark size={12} className="text-slate-700" />
                  <span>روش تسویه و اسناد مالی / اعتباری</span>
                </h3>

                {petro.paymentMethod === 'internal_lc' ? (
                  <div className="grid grid-cols-3 gap-1.5 text-[9.5px]">
                    <div>نوع تسویه: <strong className="text-indigo-800">اعتبار اسنادی داخلی (LC ریالی)</strong></div>
                    <div>شماره LC: <strong className="font-mono">{petro.internalLc?.lcNumber || '---'}</strong></div>
                    <div>بانک گشایش‌کننده: <strong>{petro.internalLc?.issuingBank} {petro.internalLc?.branch ? `(${petro.internalLc.branch})` : ''}</strong></div>
                    <div>مبلغ اعتبار: <strong className="font-mono">{petro.internalLc?.lcAmount?.toLocaleString('fa-IR')} ریال</strong></div>
                    <div>تاریخ گشایش / سررسید: <strong className="font-mono">{petro.internalLc?.issueDate || '---'} / {petro.internalLc?.dueDate || '---'}</strong></div>
                    <div>کارمزد بانکی / سپرده: <strong className="font-mono">{petro.internalLc?.commissionFee?.toLocaleString('fa-IR')} / {petro.internalLc?.prepaymentAmount?.toLocaleString('fa-IR') || '۰'}</strong></div>
                  </div>
                ) : petro.paymentMethod === 'draft_barat' ? (
                  <div className="grid grid-cols-3 gap-1.5 text-[9.5px]">
                    <div>نوع تسویه: <strong className="text-teal-800">برات الکترونیک (سامانه سپام)</strong></div>
                    <div>شناسه سپام: <strong className="font-mono">{petro.draftBarat?.sepamCode || '---'}</strong></div>
                    <div>بانک عامل: <strong>{petro.draftBarat?.bankName}</strong></div>
                    <div>مبلغ اصل برات: <strong className="font-mono">{petro.draftBarat?.amount?.toLocaleString('fa-IR')} ریال</strong></div>
                    <div>تاریخ صدور / سررسید: <strong className="font-mono">{petro.draftBarat?.issueDate || '---'} / {petro.draftBarat?.dueDate || '---'}</strong></div>
                    <div>کارمزد / ذینفع: <strong className="font-mono">{petro.draftBarat?.interestAmount?.toLocaleString('fa-IR') || '۰'} ({petro.draftBarat?.beneficiaryName || petro.petrochemicalName})</strong></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 text-[9.5px]">
                    <div>نوع تسویه: <strong className="text-slate-800">تسویه نقدی اتاق پایاپای بورس کالا</strong></div>
                    <div>وضعیت: <strong>{petro.cashSettlement?.isSettled ? 'تسویه کامل انجام شده' : 'در انتظار واریز'}</strong></div>
                    <div>مهلت تسویه بورس: <strong className="font-mono">{petro.bourseSettlementDeadline || '۳ روز کاری'}</strong></div>
                  </div>
                )}
              </div>

              {/* Logistics & Weighbridge */}
              <div className="grid grid-cols-2 gap-2.5 mb-2">
                {/* Remittance & Loading Logistics */}
                <div className="border border-slate-300 rounded-lg p-2 bg-slate-50/50">
                  <h3 className="font-bold text-[10.5px] text-slate-800 mb-1 border-b border-slate-200 pb-0.5 flex items-center gap-1.5">
                    <Truck size={12} className="text-slate-700" />
                    <span>اطلاعات حواله، بارگیری و ناوگان حمل</span>
                  </h3>
                  <div className="space-y-0.5 text-[9.2px]">
                    <div className="flex justify-between"><span>شماره حواله / تاریخ حواله:</span><strong className="font-mono text-amber-900">{loading.remittanceNumber || '---'} ({loading.remittanceDate || '-'})</strong></div>
                    <div className="flex justify-between"><span>مقدار حواله / مانده حواله:</span><strong className="font-mono">{remittanceQty.toLocaleString('fa-IR')} kg / <span className={remittanceRemaining < 0 ? 'text-rose-700' : 'text-emerald-800'}>{remittanceRemaining.toLocaleString('fa-IR')} kg</span></strong></div>
                    <div className="flex justify-between"><span>موسسه حمل / کد بهین‌یاب:</span><strong>{loading.transportCompany || '---'} ({loading.behenyabCode || '-'})</strong></div>
                    <div className="flex justify-between"><span>سریال برگه تحویل / بارنامه:</span><strong className="font-mono">{loading.deliveryNoteSerial || '---'} / {loading.waybillNumber || '---'}</strong></div>
                    <div className="flex justify-between"><span>نام راننده / پلاک کامیون:</span><strong>{loading.driverName || '---'} | <span className="font-mono">{loading.truckPlate || '---'}</span></strong></div>
                    <div className="flex justify-between"><span>تاریخ بارگیری / ساعت خروج:</span><strong className="font-mono">{loading.loadingDate || '---'} {loading.exitDateTime ? `| ${loading.exitDateTime}` : ''}</strong></div>
                    <div className="flex justify-between"><span>وزن خالص بارگیری / کرایه حمل:</span><strong className="font-mono">{loading.originNetWeightKg ? `${loading.originNetWeightKg.toLocaleString('fa-IR')} kg` : '---'} / {totalFreight.toLocaleString('fa-IR')} ریال</strong></div>
                    {loading.unloadingAddress && (
                      <div className="pt-0.5 text-[8.5px] text-slate-600 truncate" title={loading.unloadingAddress}>محل تخلیه: <strong className="text-slate-800">{loading.unloadingAddress}</strong></div>
                    )}
                  </div>
                </div>

                {/* Weighbridge & Warehouse */}
                <div className="border border-slate-300 rounded-lg p-2 bg-slate-50/50">
                  <h3 className="font-bold text-[10.5px] text-slate-800 mb-1 border-b border-slate-200 pb-0.5 flex items-center gap-1.5">
                    <Scale size={12} className="text-slate-700" />
                    <span>باسکول کارخانه و رسید انبار</span>
                  </h3>
                  <div className="space-y-0.5 text-[9.2px]">
                    <div className="flex justify-between"><span>قبض انبار / برگه باسکول:</span><strong className="font-mono">{petro.warehouseReceipt?.receiptNumber || '---'} / {petro.warehouseReceipt?.weighbridgeSlipNumber || '---'}</strong></div>
                    <div className="flex justify-between"><span>وزن فاکتور / قرارداد:</span><strong className="font-mono">{petro.quantityKg?.toLocaleString('fa-IR')} kg</strong></div>
                    <div className="flex justify-between"><span>وزن خالص باسکول کارخانه:</span><strong className="font-mono font-bold text-emerald-800">{(petro.warehouseReceipt?.receivedWeightKg || petro.quantityKg || 0).toLocaleString('fa-IR')} kg</strong></div>
                    <div className="flex justify-between">
                      <span>اختلاف وزن (کسری/اضافه):</span>
                      <strong className={`font-mono font-bold ${varianceKg < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {varianceKg.toLocaleString('fa-IR')} kg {varianceKg !== 0 ? `(${((varianceKg / (petro.quantityKg || 1)) * 100).toFixed(2)}%)` : ''}
                      </strong>
                    </div>
                    <div className="flex justify-between"><span>انبار مقصد:</span><strong>{petro.warehouseReceipt?.warehouseName || 'انبار مرکزی مواد اولیه'}</strong></div>
                    <div className="flex justify-between"><span>تاریخ ورود به انبار:</span><strong className="font-mono">{petro.warehouseReceipt?.receiptDate || '---'}</strong></div>
                    <div className="flex justify-between"><span>بچ کنترل کیفیت / وضعیت QC:</span><strong className="font-mono">{petro.warehouseReceipt?.qcBatchNumber || '---'}</strong></div>
                  </div>
                </div>
              </div>

              {/* Final Costing Breakdown Box */}
              <div className="border-2 border-emerald-800 rounded-xl p-2.5 bg-emerald-50/40">
                <h3 className="font-black text-[10.5px] text-emerald-950 mb-1.5 border-b border-emerald-300 pb-0.5">
                  آنالیز نهایی بهای تمام‌شده و قیمت هر کیلوگرم تحویل درب کارخانه
                </h3>

                <div className="grid grid-cols-4 gap-2 text-center text-[9.5px] mb-1.5">
                  <div className="p-1 bg-white border border-emerald-200 rounded">
                    <span className="text-slate-500 block">ارزش فاکتور پتروشیمی</span>
                    <strong className="font-mono text-slate-800">{petro.totalInvoiceAmount?.toLocaleString('fa-IR')} ریال</strong>
                  </div>
                  <div className="p-1 bg-white border border-emerald-200 rounded">
                    <span className="text-slate-500 block">کرایه حمل و باربری</span>
                    <strong className="font-mono text-slate-800">{totalFreight.toLocaleString('fa-IR')} ریال</strong>
                  </div>
                  <div className="p-1 bg-white border border-emerald-200 rounded">
                    <span className="text-slate-500 block">هزینه‌ها و کارمزد بانکی</span>
                    <strong className="font-mono text-slate-800">{(bankComm + totalOtherCosts).toLocaleString('fa-IR')} ریال</strong>
                  </div>
                  <div className="p-1 bg-emerald-100 border border-emerald-300 rounded">
                    <span className="text-emerald-900 font-bold block">مجموع بهای تمام‌شده</span>
                    <strong className="font-mono text-emerald-950 font-black text-[11px]">{grandTotalCost.toLocaleString('fa-IR')} ریال</strong>
                  </div>
                </div>

                <div className="p-1.5 bg-emerald-800 text-white rounded-lg flex justify-between items-center px-3">
                  <span className="font-bold text-[10.5px]">بهای تمام‌شده هر کیلوگرم کالا در انبار کارخانه (Cost Per Kg):</span>
                  <div className="text-left font-mono">
                    <span className="text-sm font-black">{costPerKg.toLocaleString('fa-IR')}</span>
                    <span className="text-[9.5px] mr-1">ریال / کیلوگرم</span>
                    <span className="text-[9.5px] text-emerald-200 block">
                      (معادل {Math.round(costPerKg / 10).toLocaleString('fa-IR')} تومان/kg)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Signature Footer */}
            <div className="mt-4 pt-3 border-t-2 border-slate-400 grid grid-cols-4 gap-4 text-center text-[10px]">
              <div>
                <span className="font-bold text-slate-700 block mb-8">کارشناس خرید / بازرگانی</span>
                <span className="border-t border-dashed border-slate-400 block pt-1 text-slate-500">امضاء و تایید</span>
              </div>
              <div>
                <span className="font-bold text-slate-700 block mb-8">مدیر مالی و حسابداری</span>
                <span className="border-t border-dashed border-slate-400 block pt-1 text-slate-500">امضاء و تایید</span>
              </div>
              <div>
                <span className="font-bold text-slate-700 block mb-8">مسئول انبار و باسکول</span>
                <span className="border-t border-dashed border-slate-400 block pt-1 text-slate-500">امضاء و تایید</span>
              </div>
              <div>
                <span className="font-bold text-slate-700 block mb-8">مدیرعامل / مدیریت کارخانه</span>
                <span className="border-t border-dashed border-slate-400 block pt-1 text-slate-500">امضاء و تایید نهایی</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default PrintDomesticPetrochemical;
