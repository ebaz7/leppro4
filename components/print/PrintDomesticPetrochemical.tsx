import React, { useEffect, useState, useRef } from 'react';
import { X, Printer, Loader2, FileDown, ZoomIn, ZoomOut, RotateCcw, Building2, Truck, Landmark, Scale, FileText, CheckCircle2 } from 'lucide-react';
import { TradeRecord, SystemSettings } from '../../types';
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

  const petro = record.petrochemicalData || {
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

  const totalFreight = petro.loadingNotice?.freightCostRial || 0;
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
          padding: 8mm 10mm !important;
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
            className="bg-white text-slate-900 w-[210mm] min-h-[297mm] p-6 text-xs font-sans border border-gray-300 relative flex flex-col justify-between"
            style={{ boxSizing: 'border-box' }}
          >
            <div>
              {/* Header Box */}
              <div className="border-2 border-slate-800 rounded-xl p-3 mb-3">
                <div className="flex justify-between items-center border-b border-slate-300 pb-2 mb-2">
                  <div className="w-1/4">
                    <span className="font-bold text-slate-600 block text-[10px]">خریدار:</span>
                    <span className="font-black text-slate-900 text-sm">{companyInfo.name}</span>
                  </div>
                  <div className="w-2/4 text-center">
                    <h1 className="text-base font-black text-slate-900">صورت وضعیت و بهای تمام‌شده خرید داخلی پتروشیمی</h1>
                    <span className="text-[10px] text-slate-600 font-bold">بورس کالای ایران / سامانه بهین‌یاب</span>
                  </div>
                  <div className="w-1/4 text-left font-mono text-[10px] space-y-0.5">
                    <div>شماره پرونده: <strong className="text-xs">{record.fileNumber || '---'}</strong></div>
                    <div>تاریخ چاپ: <strong>{new Date().toLocaleDateString('fa-IR')}</strong></div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-[10px] pt-1 text-slate-700">
                  <div>پتروشیمی: <strong className="text-slate-900">{petro.petrochemicalName}</strong></div>
                  <div>کارگزاری: <strong className="text-slate-900">{petro.brokerName || '---'}</strong></div>
                  <div>قرارداد بورس: <strong className="font-mono text-slate-900">{petro.contractNumber || '---'}</strong></div>
                  <div>پیش‌فاکتور: <strong className="font-mono text-slate-900">{petro.proformaNumber || '---'}</strong></div>
                </div>
              </div>

              {/* Specs & Goods Detail */}
              <div className="border border-slate-300 rounded-lg p-2.5 mb-3 bg-slate-50/50">
                <h3 className="font-bold text-xs text-slate-800 mb-2 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                  <FileText size={14} className="text-slate-700" />
                  <span>مشخصات کالا و شرایط معامله بورس</span>
                </h3>
                <table className="w-full text-center border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-slate-200 text-slate-800 font-bold border border-slate-300">
                      <th className="p-1.5 border border-slate-300">گرید کالایی</th>
                      <th className="p-1.5 border border-slate-300">وزن معامله (kg)</th>
                      <th className="p-1.5 border border-slate-300">نرخ پایه (ریال)</th>
                      <th className="p-1.5 border border-slate-300">مبلغ خالص (ریال)</th>
                      <th className="p-1.5 border border-slate-300">ارزش افزوده ۱۰٪</th>
                      <th className="p-1.5 border border-slate-300">کارمزد بورس</th>
                      <th className="p-1.5 border border-slate-300">جمع فاکتور (ریال)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border border-slate-300 font-mono">
                      <td className="p-2 border border-slate-300 font-sans font-bold">{petro.gradeName || record.goodsName}</td>
                      <td className="p-2 border border-slate-300 font-bold">{petro.quantityKg?.toLocaleString('fa-IR')}</td>
                      <td className="p-2 border border-slate-300 font-bold">{petro.basePricePerKg?.toLocaleString('fa-IR')}</td>
                      <td className="p-2 border border-slate-300">{petro.totalGoodsPrice?.toLocaleString('fa-IR')}</td>
                      <td className="p-2 border border-slate-300">{petro.vatAmount?.toLocaleString('fa-IR')}</td>
                      <td className="p-2 border border-slate-300">{petro.brokerageFee?.toLocaleString('fa-IR')}</td>
                      <td className="p-2 border border-slate-300 font-bold text-slate-900 bg-slate-100">{petro.totalInvoiceAmount?.toLocaleString('fa-IR')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Settlement & Banking Section */}
              <div className="border border-slate-300 rounded-lg p-2.5 mb-3">
                <h3 className="font-bold text-xs text-slate-800 mb-2 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                  <Landmark size={14} className="text-slate-700" />
                  <span>روش تسویه و اسناد مالی / اعتباری</span>
                </h3>

                {petro.paymentMethod === 'internal_lc' ? (
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>نوع تسویه: <strong className="text-indigo-800">اعتبار اسنادی داخلی (LC ریالی)</strong></div>
                    <div>شماره LC: <strong className="font-mono">{petro.internalLc?.lcNumber || '---'}</strong></div>
                    <div>بانک گشایش‌کننده: <strong>{petro.internalLc?.issuingBank} {petro.internalLc?.branch ? `(${petro.internalLc.branch})` : ''}</strong></div>
                    <div>مبلغ اعتبار: <strong className="font-mono">{petro.internalLc?.lcAmount?.toLocaleString('fa-IR')} ریال</strong></div>
                    <div>تاریخ گشایش: <strong className="font-mono">{petro.internalLc?.issueDate || '---'}</strong></div>
                    <div>تاریخ سررسید: <strong className="font-mono">{petro.internalLc?.dueDate || '---'}</strong></div>
                    <div>کارمزد بانکی: <strong className="font-mono">{petro.internalLc?.commissionFee?.toLocaleString('fa-IR')} ریال</strong></div>
                    <div>پیش‌پرداخت/سپرده: <strong className="font-mono">{petro.internalLc?.prepaymentAmount?.toLocaleString('fa-IR') || '۰'} ریال</strong></div>
                    <div>وثایق: <strong>{petro.internalLc?.collateralDesc || 'چک و سفته شرکتی'}</strong></div>
                  </div>
                ) : petro.paymentMethod === 'draft_barat' ? (
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>نوع تسویه: <strong className="text-teal-800">برات الکترونیک (سامانه سپام)</strong></div>
                    <div>شناسه سپام: <strong className="font-mono">{petro.draftBarat?.sepamCode || '---'}</strong></div>
                    <div>بانک عامل: <strong>{petro.draftBarat?.bankName}</strong></div>
                    <div>مبلغ اصل برات: <strong className="font-mono">{petro.draftBarat?.amount?.toLocaleString('fa-IR')} ریال</strong></div>
                    <div>تاریخ صدور: <strong className="font-mono">{petro.draftBarat?.issueDate || '---'}</strong></div>
                    <div>تاریخ سررسید: <strong className="font-mono">{petro.draftBarat?.dueDate || '---'}</strong></div>
                    <div>کارمزد اعتباری: <strong className="font-mono">{petro.draftBarat?.interestAmount?.toLocaleString('fa-IR') || '۰'} ریال</strong></div>
                    <div>برات‌کش / متعهد: <strong>{petro.draftBarat?.drawerName || companyInfo.name}</strong></div>
                    <div>ذینفع برات: <strong>{petro.draftBarat?.beneficiaryName || petro.petrochemicalName}</strong></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>نوع تسویه: <strong className="text-slate-800">تسویه نقدی اتاق پایاپای بورس کالا</strong></div>
                    <div>وضعیت: <strong>{petro.cashSettlement?.isSettled ? 'تسویه کامل انجام شده' : 'در انتظار واریز'}</strong></div>
                    <div>مهلت تسویه بورس: <strong className="font-mono">{petro.bourseSettlementDeadline || '۳ روز کاری'}</strong></div>
                  </div>
                )}
              </div>

              {/* Logistics & Weighbridge */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* Logistics */}
                <div className="border border-slate-300 rounded-lg p-2.5 bg-slate-50/50">
                  <h3 className="font-bold text-xs text-slate-800 mb-1.5 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                    <Truck size={14} className="text-slate-700" />
                    <span>حواله پتروشیمی و اطلاعات ناوگان حمل</span>
                  </h3>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span>شماره حواله فروش:</span><strong className="font-mono">{petro.loadingNotice?.remittanceNumber || '---'}</strong></div>
                    <div className="flex justify-between"><span>کد بهین‌یاب:</span><strong className="font-mono">{petro.loadingNotice?.behenyabCode || '---'}</strong></div>
                    <div className="flex justify-between"><span>شماره بارنامه:</span><strong className="font-mono">{petro.loadingNotice?.waybillNumber || '---'}</strong></div>
                    <div className="flex justify-between"><span>نام راننده:</span><strong>{petro.loadingNotice?.driverName || '---'} ({petro.loadingNotice?.driverPhone || '-'})</strong></div>
                    <div className="flex justify-between"><span>پلاک کامیون:</span><strong className="font-mono">{petro.loadingNotice?.truckPlate || '---'}</strong></div>
                    <div className="flex justify-between"><span>کرایه حمل کل:</span><strong className="font-mono">{totalFreight.toLocaleString('fa-IR')} ریال</strong></div>
                  </div>
                </div>

                {/* Weighbridge & Warehouse */}
                <div className="border border-slate-300 rounded-lg p-2.5 bg-slate-50/50">
                  <h3 className="font-bold text-xs text-slate-800 mb-1.5 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                    <Scale size={14} className="text-slate-700" />
                    <span>باسکول کارخانه و رسید انبار</span>
                  </h3>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span>قبض انبار / رسید:</span><strong className="font-mono">{petro.warehouseReceipt?.receiptNumber || '---'}</strong></div>
                    <div className="flex justify-between"><span>وزن فاکتور پتروشیمی:</span><strong className="font-mono">{petro.quantityKg?.toLocaleString('fa-IR')} kg</strong></div>
                    <div className="flex justify-between"><span>وزن خالص باسکول کارخانه:</span><strong className="font-mono font-bold text-emerald-800">{(petro.warehouseReceipt?.receivedWeightKg || petro.quantityKg || 0).toLocaleString('fa-IR')} kg</strong></div>
                    <div className="flex justify-between">
                      <span>اختلاف وزن (کسری/اضافه):</span>
                      <strong className={`font-mono font-bold ${varianceKg < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {varianceKg.toLocaleString('fa-IR')} kg {varianceKg !== 0 ? `(${((varianceKg / (petro.quantityKg || 1)) * 100).toFixed(2)}%)` : ''}
                      </strong>
                    </div>
                    <div className="flex justify-between"><span>انبار مقصد:</span><strong>{petro.warehouseReceipt?.warehouseName || 'انبار مرکزی مواد اولیه'}</strong></div>
                    <div className="flex justify-between"><span>تاریخ ورود:</span><strong className="font-mono">{petro.warehouseReceipt?.receiptDate || '---'}</strong></div>
                  </div>
                </div>
              </div>

              {/* Final Costing Breakdown Box */}
              <div className="border-2 border-emerald-800 rounded-xl p-3 bg-emerald-50/40">
                <h3 className="font-black text-xs text-emerald-950 mb-2 border-b border-emerald-300 pb-1">
                  آنالیز نهایی بهای تمام‌شده و قیمت هر کیلوگرم تحویل درب کارخانه
                </h3>

                <div className="grid grid-cols-4 gap-2 text-center text-[10px] mb-2">
                  <div className="p-1.5 bg-white border border-emerald-200 rounded">
                    <span className="text-slate-500 block">ارزش فاکتور پتروشیمی</span>
                    <strong className="font-mono text-slate-800">{petro.totalInvoiceAmount?.toLocaleString('fa-IR')} ریال</strong>
                  </div>
                  <div className="p-1.5 bg-white border border-emerald-200 rounded">
                    <span className="text-slate-500 block">کرایه حمل و باربری</span>
                    <strong className="font-mono text-slate-800">{totalFreight.toLocaleString('fa-IR')} ریال</strong>
                  </div>
                  <div className="p-1.5 bg-white border border-emerald-200 rounded">
                    <span className="text-slate-500 block">هزینه‌ها و کارمزد بانکی</span>
                    <strong className="font-mono text-slate-800">{bankComm.toLocaleString('fa-IR')} ریال</strong>
                  </div>
                  <div className="p-1.5 bg-emerald-100 border border-emerald-300 rounded">
                    <span className="text-emerald-900 font-bold block">مجموع بهای تمام‌شده</span>
                    <strong className="font-mono text-emerald-950 font-black text-xs">{grandTotalCost.toLocaleString('fa-IR')} ریال</strong>
                  </div>
                </div>

                <div className="p-2 bg-emerald-800 text-white rounded-lg flex justify-between items-center px-4">
                  <span className="font-bold text-xs">بهای تمام‌شده هر کیلوگرم کالا در انبار کارخانه (Cost Per Kg):</span>
                  <div className="text-left font-mono">
                    <span className="text-base font-black">{costPerKg.toLocaleString('fa-IR')}</span>
                    <span className="text-[10px] mr-1">ریال / کیلوگرم</span>
                    <span className="text-[10px] text-emerald-200 block">
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
