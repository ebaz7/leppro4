import React, { useState } from 'react';
import { SystemSettings } from '../../types';
import { 
    MessageCircle, Send, Globe, Bot, Star, Sparkles, 
    Copy, Check, Info, ExternalLink, HelpCircle, Eye
} from 'lucide-react';

interface Props {
    settings: SystemSettings;
    setSettings: (s: SystemSettings) => void;
    compact?: boolean;
}

export const CustomerExitNotificationConfig: React.FC<Props> = ({ 
    settings, 
    setSettings,
    compact = false 
}) => {
    const [copied, setCopied] = useState(false);
    const [showPreview, setShowPreview] = useState(true);

    const baleUrl = settings.customerExitBaleBotUrl || '';
    const telegramUrl = settings.customerExitTelegramBotUrl || '';
    const otherUrl = settings.customerExitOtherBotUrl || '';
    const surveyUrl = settings.customerSurveyUrl || '';
    const inviteText = settings.customerExitBotInviteText || '';

    // Generate formatted preview of bot links
    const previewBotLinks: string[] = [];
    if (baleUrl.trim()) {
        const cleanBale = baleUrl.trim().startsWith('http') 
            ? baleUrl.trim() 
            : (baleUrl.trim().startsWith('@') ? `https://ble.ir/${baleUrl.trim().slice(1)}` : `https://ble.ir/${baleUrl.trim()}`);
        previewBotLinks.push(`🔹 ربات بله: ${cleanBale}`);
    }
    if (telegramUrl.trim()) {
        const cleanTg = telegramUrl.trim().startsWith('http') 
            ? telegramUrl.trim() 
            : (telegramUrl.trim().startsWith('@') ? `https://t.me/${telegramUrl.trim().slice(1)}` : `https://t.me/${telegramUrl.trim()}`);
        previewBotLinks.push(`🔹 ربات تلگرام: ${cleanTg}`);
    }
    if (otherUrl.trim()) {
        previewBotLinks.push(`🔹 سامانه / سایر پیام‌رسان‌ها: ${otherUrl.trim()}`);
    }

    const defaultInvite = inviteText.trim() || 'جهت پیگیری آنلاین بار، دریافت فاکتورها، مانده حساب و ثبت سفارشات، می‌توانید از ربات‌های هوشمند ما استفاده فرمایید:';
    const effectiveSurvey = surveyUrl.trim() || `${(settings.appBaseUrl || 'https://dlkam.ir').replace(/\/+$/, '')}/#customer-survey?id=1240`;

    const sampleMessage = 
`🚚 *اعلام بارگیری و خروج بار کارخانه*

👤 *مشتری گرامی:* شرکت بازرگانی نمونه
🏢 *شرکت صادرکننده:* ${settings.companyNames?.[0] || 'شرکت تولیدی و صنعتی'}
🔢 *شماره حواله خروج:* #1240
📅 *تاریخ خروج:* ۱۴۰۵/۰۲/۱۵
🕒 *ساعت خروج از کارخانه:* ۱۴:۳۵

⚖️ *وزن کل بار:* ۲,۴۵۰ کیلوگرم
📦 *تعداد کارتن / بسته‌ها:* ۱۲۰ عدد

👨‍✈️ *مشخصات و نام راننده:* علی رضایی
📞 *شماره تماس راننده:* ۰۹۱۲۳۴۵۶۷۸۹
🆔 *شماره پلاک خودرو:* ایران ۲۲ - ۳۴۵ ع ۶۷
📍 *مقصد تحویل:* تهران - انبار مرکزی

📦 *اقلام و کالاهای بارگیری شده:*
  ▫️ ۱. نخ پلی‌استر DTY (۸۰ کارتن | ۱,۶۰۰ کیلوگرم)
  ▫️ ۲. نخ ملانژ پنبه (۴۰ کارتن | ۸۵۰ کیلوگرم)

✅ محموله شما با مشخصات فوق با موفقیت بارگیری و از کارخانه خارج گردید. تصویر فاکتور رسمی خروج کالا نیز پیوست می‌باشد.
${previewBotLinks.length > 0 ? `\n🤖 *${defaultInvite}*\n` + previewBotLinks.join('\n') : ''}
⭐ *فرم نظرسنجی و ارزیابی کیفیت محصولات و خدمات:*
${effectiveSurvey}

با سپاس از اعتماد و خرید شما 🙏`;

    const handleCopy = () => {
        navigator.clipboard.writeText(sampleMessage);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <div className="bg-gradient-to-br from-emerald-50/70 via-white to-blue-50/50 dark:from-gray-900/80 dark:via-gray-900/60 dark:to-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-5 md:p-6 shadow-sm space-y-5 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 dark:border-gray-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
                        <MessageCircle size={22} />
                    </div>
                    <div>
                        <h4 className="font-black text-sm md:text-base text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <span>لینک ربات‌ها در پیام واتساپ خروج مشتری</span>
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                                خروج کارخانه
                            </span>
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                            این لینک‌ها به طور خودکار به پیام واتساپی که پس از تایید نهایی خروج بار از کارخانه برای مشتری فرستاده می‌شود اضافه می‌گردند.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                        type="button"
                        onClick={() => setShowPreview(!showPreview)}
                        className="text-xs bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                        <Eye size={14} className="text-emerald-600" />
                        <span>{showPreview ? 'مخفی‌سازی پیش‌نمایش' : 'مشاهده پیش‌نمایش پیام'}</span>
                    </button>
                </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Telegram Bot Link */}
                <div className="bg-white dark:bg-gray-800/80 p-3.5 rounded-xl border border-sky-100 dark:border-gray-700 shadow-2xs space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                        <Send size={14} className="text-sky-500" />
                        <span>لینک ربات تلگرام (مشتریان)</span>
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={settings.customerExitTelegramBotUrl || ''}
                            onChange={(e) => setSettings({ ...settings, customerExitTelegramBotUrl: e.target.value })}
                            placeholder="مثال: https://t.me/dlkam_bot یا @dlkam_bot"
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-xs font-mono dir-ltr text-left bg-gray-50/50 dark:bg-gray-900 focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
                        />
                    </div>
                    <p className="text-[10px] text-gray-400 leading-tight">
                        می‌توانید لینک کامل یا آیدی ربات با @ را وارد کنید. سیستم در پیام به لینک تبدیل می‌کند.
                    </p>
                </div>

                {/* Bale Bot Link */}
                <div className="bg-white dark:bg-gray-800/80 p-3.5 rounded-xl border border-emerald-100 dark:border-gray-700 shadow-2xs space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                        <Bot size={14} className="text-emerald-600" />
                        <span>لینک ربات بله (مشتریان)</span>
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={settings.customerExitBaleBotUrl || ''}
                            onChange={(e) => setSettings({ ...settings, customerExitBaleBotUrl: e.target.value })}
                            placeholder="مثال: https://ble.ir/dlkam_bot یا @dlkam_bot"
                            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-xs font-mono dir-ltr text-left bg-gray-50/50 dark:bg-gray-900 focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                        />
                    </div>
                    <p className="text-[10px] text-gray-400 leading-tight">
                        لینک ربات پیام‌رسان بله برای مشتریانی که در پیام‌رسان‌های ایرانی فعالیت دارند.
                    </p>
                </div>

                {/* Other Messenger / Portal */}
                <div className="bg-white dark:bg-gray-800/80 p-3.5 rounded-xl border border-indigo-100 dark:border-gray-700 shadow-2xs space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                        <Globe size={14} className="text-indigo-500" />
                        <span>سامانه پیگیری بار / سایر پیام‌رسان‌ها (اختیاری)</span>
                    </label>
                    <input
                        type="text"
                        value={settings.customerExitOtherBotUrl || ''}
                        onChange={(e) => setSettings({ ...settings, customerExitOtherBotUrl: e.target.value })}
                        placeholder="مثال: https://dlkam.ir یا آدرس کانال/ربات ایتا و روبیکا"
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-xs font-mono dir-ltr text-left bg-gray-50/50 dark:bg-gray-900 focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                    />
                    <p className="text-[10px] text-gray-400 leading-tight">
                        لینک پرتال مشتریان، وب‌سایت رسمی یا درگاه پیگیری سفارشات.
                    </p>
                </div>

                {/* Customer Survey URL */}
                <div className="bg-white dark:bg-gray-800/80 p-3.5 rounded-xl border border-amber-100 dark:border-gray-700 shadow-2xs space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                        <Star size={14} className="text-amber-500 fill-amber-500/20" />
                        <span>لینک فرم نظرسنجی و ارزیابی کیفیت</span>
                    </label>
                    <input
                        type="url"
                        value={settings.customerSurveyUrl || ''}
                        onChange={(e) => setSettings({ ...settings, customerSurveyUrl: e.target.value })}
                        placeholder="مثال: https://survey.porsline.ir/s/... (خالی = لینک سیستم)"
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-xs font-mono dir-ltr text-left bg-gray-50/50 dark:bg-gray-900 focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all"
                    />
                    <p className="text-[10px] text-gray-400 leading-tight">
                        در صورت خالی بودن، لینک نظرسنجی استاندارد داخلی سیستم استفاده می‌شود.
                    </p>
                </div>
            </div>

            {/* Custom Invite Header Text */}
            <div className="bg-white dark:bg-gray-800/80 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xs space-y-1.5">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                        <Sparkles size={14} className="text-emerald-600" />
                        <span>متن سرتیتر دعوت به ربات در پیام مشتری (اختیاری)</span>
                    </span>
                    <span className="text-[10px] text-gray-400 font-normal">
                        پیش‌فرض: «جهت پیگیری آنلاین بار، دریافت فاکتورها، مانده حساب و ثبت سفارشات...»
                    </span>
                </label>
                <input
                    type="text"
                    value={settings.customerExitBotInviteText || ''}
                    onChange={(e) => setSettings({ ...settings, customerExitBotInviteText: e.target.value })}
                    placeholder="متن دلخواه قبل از لیست لینک‌ها بنویسید یا برای استفاده از متن پیش‌فرض سیستم خالی بگذارید..."
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-xs bg-gray-50/50 dark:bg-gray-900 focus:bg-white dark:focus:bg-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                />
            </div>

            {/* Live WhatsApp Preview */}
            {showPreview && (
                <div className="mt-4 pt-4 border-t border-emerald-100 dark:border-gray-800 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                پیش‌نمایش زنده پیام ارسالی واتساپ به مشتری:
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="text-xs text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 flex items-center gap-1 font-bold cursor-pointer"
                        >
                            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                            <span>{copied ? 'کپی شد!' : 'کپی نمونه متن'}</span>
                        </button>
                    </div>

                    <div className="bg-[#e5ddd5] dark:bg-gray-950 p-4 rounded-xl border border-emerald-200/60 dark:border-gray-800 font-sans shadow-inner">
                        <div className="max-w-xl mx-auto bg-white dark:bg-gray-800 rounded-2xl rounded-tr-none p-4 shadow-md text-xs leading-relaxed text-gray-800 dark:text-gray-100 whitespace-pre-line border border-gray-100 dark:border-gray-700">
                            {sampleMessage}
                            <div className="mt-2 text-left text-[10px] text-gray-400 flex items-center justify-end gap-1">
                                <span>۱۴:۳۶</span>
                                <span className="text-sky-500 font-bold">✓✓</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
