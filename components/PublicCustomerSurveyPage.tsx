import React, { useState, useEffect } from 'react';
import {
  Truck,
  User,
  Calendar,
  Clock,
  MapPin,
  Package,
  Star,
  MessageSquare,
  Send,
  CheckCircle2,
  Bot,
  Building2,
  Phone,
  ShieldCheck,
  Award,
  Sparkles,
  ExternalLink,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface ExitPermitItem {
  goodsName: string;
  cartonCount?: number;
  weight?: number;
  deliveredCartonCount?: number;
  deliveredWeight?: number;
}

interface PublicPermitData {
  permitNumber: string;
  company: string;
  date: string;
  exitTime?: string;
  recipientName: string;
  driverName?: string;
  driverPhone?: string;
  plateNumber?: string;
  destinationAddress?: string;
  description?: string;
  items: ExitPermitItem[];
  totalWeight: number;
  totalCartons: number;
  botLinks?: {
    telegramUrl?: string;
    baleUrl?: string;
    whatsappUrl?: string;
  };
}

export const PublicCustomerSurveyPage: React.FC = () => {
  const [permitId, setPermitId] = useState<string>('');
  const [permitData, setPermitData] = useState<PublicPermitData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Form ratings (1 to 5)
  const [qualityRating, setQualityRating] = useState<number>(5);
  const [deliveryRating, setDeliveryRating] = useState<number>(5);
  const [courtesyRating, setCourtesyRating] = useState<number>(5);
  const [overallRating, setOverallRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [customerNameInput, setCustomerNameInput] = useState<string>('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  useEffect(() => {
    // Extract permit ID from URL hash or search params
    // e.g. #customer-survey?id=2429 or ?survey=2429 or ?id=2429
    try {
      const searchStr = window.location.search || '';
      const hashStr = window.location.hash || '';
      const combined = (searchStr + '&' + hashStr.replace(/^#/, '')).toLowerCase();
      
      const urlParams = new URLSearchParams(searchStr || hashStr.substring(hashStr.indexOf('?') + 1));
      let id = urlParams.get('id') || urlParams.get('permit') || urlParams.get('survey') || '';

      if (!id) {
        // Match numbers after id= or survey=
        const match = combined.match(/(?:id|permit|survey)=([a-z0-9_-]+)/i);
        if (match && match[1]) id = match[1];
      }

      setPermitId(id);
      if (id) {
        fetchPermitData(id);
      } else {
        setIsLoading(false);
      }
    } catch (e) {
      setIsLoading(false);
    }
  }, []);

  const fetchPermitData = async (id: string) => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/public/survey/${encodeURIComponent(id)}`);
      if (!res.ok) {
        throw new Error('اطلاعات محموله یافت نشد');
      }
      const data = await res.json();
      if (data && data.success) {
        setPermitData(data.data);
        if (data.data.recipientName) setCustomerNameInput(data.data.recipientName);
      } else {
        setErrorMsg(data.error || 'اطلاعات محموله یافت نشد');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در دریافت اطلاعات محموله');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        permitNumber: permitData?.permitNumber || permitId || 'نامشخص',
        customerName: customerNameInput || permitData?.recipientName || 'مشتری محترم',
        customerPhone: customerPhoneInput || '',
        qualityRating,
        deliveryRating,
        courtesyRating,
        overallRating,
        comment
      };

      const res = await fetch('/api/public/survey/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsSubmitted(true);
      } else {
        alert(data.error || 'خطا در ثبت نظرسنجی');
      }
    } catch (err: any) {
      alert('خطا در ارتباط با سرور: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStarRating = (
    label: string,
    value: number,
    onChange: (v: number) => void
  ) => {
    const starLabels: Record<number, string> = {
      5: 'عالی 🌟',
      4: 'خوب 👍',
      3: 'متوسط 😐',
      2: 'ضعیف 👎',
      1: 'بسیار ضعیف 😡'
    };

    return (
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 sm:p-5 transition-all hover:border-amber-500/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <span className="text-sm sm:text-base font-black text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            {label}
          </span>
          <span className="text-xs font-extrabold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 w-fit">
            {starLabels[value] || ''}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1 sm:gap-2 dir-ltr">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              className={`flex-1 py-2 sm:py-2.5 rounded-xl flex items-center justify-center transition-all ${
                star <= value
                  ? 'bg-gradient-to-t from-amber-600 to-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 scale-105'
                  : 'bg-slate-900 text-slate-600 hover:text-slate-400 hover:bg-slate-800/60'
              }`}
            >
              <Star
                className={`w-5 h-5 sm:w-6 sm:h-6 ${
                  star <= value ? 'fill-slate-950' : ''
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    );
  };

  const telegramUrl = permitData?.botLinks?.telegramUrl || 'https://t.me/LepanBaftBot';
  const baleUrl = permitData?.botLinks?.baleUrl || 'https://ble.ir/lepanbaft_bot';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 dir-rtl font-sans pb-16">
      {/* Top Header Banner */}
      <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />
              </div>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                شرکت لپان بافت
              </h1>
              <p className="text-[11px] sm:text-xs text-amber-400/90 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                سامانه رسمی ارزیابی کیفیت و پیگیری هوشمند محموله‌ها
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
            <Award className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-black text-emerald-300">
              تاییدیه خروج رسمی
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 pt-6 sm:pt-8 space-y-6">
        {/* Loading State */}
        {isLoading && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-4 shadow-2xl">
            <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
            <p className="text-sm font-bold text-slate-300">
              در حال بارگذاری مشخصات محموله و حواله خروج...
            </p>
          </div>
        )}

        {/* Error / Not Found fallback header if no permit */}
        {!isLoading && !permitData && (
          <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-xl">
            <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
              <Truck className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-black text-white">
              فرم نظرسنجی و ارزیابی کیفیت خدمات مشتریان
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
              مشتری گرامی، از اینکه محصولات شرکت لپان بافت را انتخاب نموده‌اید صمیمانه سپاسگزاریم. لطفاً نظرات و ارزیابی خود را ثبت نمایید.
            </p>
          </div>
        )}

        {/* Permit Details Card */}
        {!isLoading && permitData && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-12 -left-12 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Title & Badge */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    مشخصات محموله بارگیری شده
                    <span className="text-xs bg-amber-500/20 text-amber-300 font-extrabold px-2.5 py-0.5 rounded-md dir-ltr">
                      #{permitData.permitNumber}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 font-bold mt-0.5">
                    شرکت صادرکننده: {permitData.company || 'شرکت لپان بافت'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                <CheckCircle2 className="w-4 h-4" />
                خارج شده از کارخانه
              </div>
            </div>

            {/* Meta Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs sm:text-sm">
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3.5 flex items-center gap-3">
                <User className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <span className="block text-[11px] text-slate-400 font-bold">مشتری گرامی</span>
                  <span className="font-black text-white">{permitData.recipientName || 'تحویل‌گیرنده محترم'}</span>
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3.5 flex items-center gap-3">
                <Calendar className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <span className="block text-[11px] text-slate-400 font-bold">تاریخ و ساعت خروج</span>
                  <span className="font-black text-white">
                    {permitData.date} {permitData.exitTime ? `(ساعت ${permitData.exitTime})` : ''}
                  </span>
                </div>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3.5 flex items-center gap-3">
                <Truck className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <span className="block text-[11px] text-slate-400 font-bold">نام و تماس راننده</span>
                  <span className="font-black text-white">
                    {permitData.driverName || 'ثبت نشده'} {permitData.driverPhone ? `(${permitData.driverPhone})` : ''}
                  </span>
                </div>
              </div>

              {permitData.plateNumber && (
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3.5 flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <span className="block text-[11px] text-slate-400 font-bold">شماره پلاک خودرو</span>
                    <span className="font-black text-white dir-ltr">{permitData.plateNumber}</span>
                  </div>
                </div>
              )}

              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3.5 flex items-center gap-3 sm:col-span-2">
                <MapPin className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <span className="block text-[11px] text-slate-400 font-bold">مقصد تحویل</span>
                  <span className="font-black text-white leading-relaxed">
                    {permitData.destinationAddress || 'تحویل درب کارخانه'}
                  </span>
                </div>
              </div>
            </div>

            {/* Cargo Items Table */}
            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-black text-amber-400 flex items-center gap-2">
                <Package className="w-4 h-4" />
                اقلام و بسته‌های بارگیری شده
              </h3>

              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-800/80 text-slate-300 font-black border-b border-slate-800">
                        <th className="py-3 px-4">ردیف</th>
                        <th className="py-3 px-4">نام کالا / محصول</th>
                        <th className="py-3 px-4 text-center">تعداد کارتن / بسته</th>
                        <th className="py-3 px-4 text-center">وزن کل (کیلوگرم)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-bold text-slate-200">
                      {permitData.items && permitData.items.length > 0 ? (
                        permitData.items.map((it, idx) => {
                          const c = it.deliveredCartonCount ?? it.cartonCount ?? 0;
                          const w = it.deliveredWeight ?? it.weight ?? 0;
                          return (
                            <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-4 text-slate-400">{idx + 1}</td>
                              <td className="py-3 px-4 font-black text-white">{it.goodsName}</td>
                              <td className="py-3 px-4 text-center text-amber-300">{c.toLocaleString('fa-IR')} عدد</td>
                              <td className="py-3 px-4 text-center text-emerald-400">{w.toLocaleString('fa-IR')} کیلوگرم</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400">
                            اقلام محموله ثبت شده است
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-800/90 text-white font-black border-t border-slate-700">
                        <td colSpan={2} className="py-3 px-4 text-amber-400">مجموع کل محموله</td>
                        <td className="py-3 px-4 text-center text-amber-300">
                          {(permitData.totalCartons || 0).toLocaleString('fa-IR')} عدد
                        </td>
                        <td className="py-3 px-4 text-center text-emerald-400">
                          {(permitData.totalWeight || 0).toLocaleString('fa-IR')} کیلوگرم
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Survey Form Section */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Star className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                ارزیابی کیفیت خدمات و رضایت‌مندی
              </h2>
              <p className="text-xs text-slate-400 font-bold mt-0.5">
                نظرات شما مستقیم توسط مدیریت ارشد بررسی می‌شود
              </p>
            </div>
          </div>

          {isSubmitted ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-8 text-center space-y-4 shadow-xl">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-black text-white">
                با تشکر! نظرسنجی شما با موفقیت ثبت گردید 🌟
              </h3>
              <p className="text-xs sm:text-sm text-emerald-200/90 max-w-md mx-auto leading-relaxed">
                از زمانی که برای ثبت بازخورد خود اختصاص دادید صمیمانه سپاسگزاریم. نظرات ارزشمند شما به ما در ارتقای کیفیت محصولات و خدمات کمک شایانی خواهد نمود.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitSurvey} className="space-y-5">
              {!permitData && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                      نام و نام خانوادگی / نام فروشگاه
                    </label>
                    <input
                      type="text"
                      value={customerNameInput}
                      onChange={(e) => setCustomerNameInput(e.target.value)}
                      placeholder="مثال: جناب آقای مختار"
                      className="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs sm:text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">
                      شماره تماس همراه
                    </label>
                    <input
                      type="text"
                      value={customerPhoneInput}
                      onChange={(e) => setCustomerPhoneInput(e.target.value)}
                      placeholder="مثال: 0912..."
                      className="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white text-xs sm:text-sm dir-ltr text-right outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              )}

              {renderStarRating('کیفیت کالاها و بسته‌بندی محموله', qualityRating, setQualityRating)}
              {renderStarRating('سرعت بارگیری و نظم در زمان‌بندی تحویل', deliveryRating, setDeliveryRating)}
              {renderStarRating('نظم، سرعت و برخورد راننده / کادر تحویل', courtesyRating, setCourtesyRating)}
              {renderStarRating('میزان رضایت کلی شما از خرید و پشتیبانی', overallRating, setOverallRating)}

              {/* Text Comment */}
              <div>
                <label className="block text-xs sm:text-sm font-black text-slate-200 mb-2 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-amber-400" />
                  توضیحات، پیشنهادات و یا انتقادات شما (اختیاری):
                </label>
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="نظرات، پیشنهادات یا هرگونه نکته‌ای درباره این بارگیری را بیان فرمایید..."
                  className="w-full p-4 rounded-2xl bg-slate-800/90 border border-slate-700 text-white text-xs sm:text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 leading-relaxed resize-none"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-[1.01] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    در حال ثبت نظرسنجی...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    ثبت و ارسال نهایی نظرسنجی
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Bot Call-to-Action Section */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5 shadow-lg shadow-blue-500/20 flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Bot className="w-6 h-6 text-blue-400" />
              </div>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                پیگیری آنلاین سفارشات و دریافت سریع فاکتورها
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 font-bold mt-1 leading-relaxed">
                با عضویت در ربات‌های هوشمند لپان بافت، وضعیت خروج بار، صورت‌حساب‌ها و پیش‌فاکتورهای خود را لحظه‌ای دریافت کنید!
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-blue-600/90 to-blue-500/90 hover:from-blue-500 hover:to-blue-400 text-white font-black text-xs sm:text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white">
                  <Bot className="w-5 h-5" />
                </div>
                <span>عضویت در ربات تلگرام پیگیری سفارشات</span>
              </div>
              <ExternalLink className="w-4 h-4 text-white/80 group-hover:translate-x-[-2px] transition-transform dir-ltr" />
            </a>

            <a
              href={baleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-emerald-600/90 to-emerald-500/90 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs sm:text-sm shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <span>عضویت در ربات بله پیگیری سفارشات</span>
              </div>
              <ExternalLink className="w-4 h-4 text-white/80 group-hover:translate-x-[-2px] transition-transform dir-ltr" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};
