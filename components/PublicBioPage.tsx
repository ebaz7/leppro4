import React, { useState, useEffect } from 'react';
import { BioLinkConfig, BioLinkBlock, BioLinkOrder } from '../types';
import { submitBioLinkOrder, submitBioLinkSurvey, getBioLinkConfig } from '../services/storageService';
import { resolveImageUrl } from '../services/apiService';
import { 
  MapPin, Phone, Mail, Instagram, Send, Globe, FileText, ShoppingBag, 
  Share2, UserPlus, Check, X, Loader2, Sparkles, Navigation, ChevronLeft,
  MessageCircle, ExternalLink, ArrowRight, Building2, PhoneCall, Bot
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export const processBioImageUrl = (url: string | null | undefined, fallback: string): string => {
  if (!url) return fallback;
  let trimmed = url.trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // Google Drive sharing links conversion
  if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
    const fileIdMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
    }
  }

  // Dropbox direct link conversion
  if (trimmed.includes('dropbox.com')) {
    return trimmed.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
  }

  // Add missing scheme if entered e.g. www.site.com
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('/')) {
    trimmed = `https://${trimmed}`;
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('uploads/') || trimmed.startsWith('api/')) {
    return resolveImageUrl(trimmed);
  }

  return trimmed;
};

interface PublicBioPageProps {
  config: BioLinkConfig;
  onBackToApp?: () => void;
  isEmbeddedPreview?: boolean;
}

export const PublicBioPage: React.FC<PublicBioPageProps> = ({ config: initialConfig, onBackToApp, isEmbeddedPreview = false }) => {
  const [config, setConfig] = useState<BioLinkConfig>(initialConfig);
  const [activeOrderModal, setActiveOrderModal] = useState(false);
  const [orderForm, setOrderForm] = useState({
    customerName: '',
    customerPhone: '',
    productTitle: 'نخ پلی استر / اسپندکس',
    quantity: '۱ کارتن',
    notes: ''
  });
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const [activeSurveyModal, setActiveSurveyModal] = useState(false);
  const [surveyForm, setSurveyForm] = useState({
    customerName: '',
    customerPhone: '',
    qualityRating: 5,
    deliveryRating: 5,
    supportRating: 5,
    comment: ''
  });
  const [submittingSurvey, setSubmittingSurvey] = useState(false);
  const [surveySuccess, setSurveySuccess] = useState(false);

  useEffect(() => {
    if (initialConfig) {
      setConfig(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(initialConfig)) {
          return initialConfig;
        }
        return prev;
      });
    }
  }, [initialConfig]);

  useEffect(() => {
    // If provided config has no blocks, fetch live config from server
    if (!initialConfig || !initialConfig.blocks || initialConfig.blocks.length === 0) {
      getBioLinkConfig().then(liveData => {
        if (liveData) {
          setConfig(liveData);
        }
      }).catch(console.error);
    }
  }, []);

  // Group active blocks by category
  const activeBlocks = (config.blocks || [])
    .filter(b => b.isActive)
    .sort((a, b) => a.order - b.order);

  const botBlocks = activeBlocks.filter(b => 
    b.category === 'bots' || 
    b.iconName === 'telegram_bot' || 
    b.iconName === 'bale_bot' || 
    b.iconName === 'telegram' || 
    b.iconName === 'bale' ||
    b.title.includes('تلگرام') ||
    b.title.includes('بله')
  );
  const mapBlocks = activeBlocks.filter(b => b.category === 'maps');
  const phoneBlocks = activeBlocks.filter(b => b.category === 'phones');
  const emailBlocks = activeBlocks.filter(b => b.category === 'emails');
  const socialBlocks = activeBlocks.filter(b => 
    b.category === 'socials' && 
    !botBlocks.some(bot => bot.id === b.id)
  );
  const catalogBlocks = activeBlocks.filter(b => b.category === 'catalog');
  const orderBlocks = activeBlocks.filter(b => b.category === 'order_form');
  const otherBlocks = activeBlocks.filter(b => 
    !['maps', 'phones', 'emails', 'socials', 'catalog', 'order_form', 'bots'].includes(b.category) &&
    !botBlocks.some(bot => bot.id === b.id)
  );

  // Generate vCard string for 1-click contact saving
  const handleDownloadVCard = () => {
    const mainPhone = phoneBlocks[0]?.value || '09125088474';
    const mainEmail = emailBlocks[0]?.value || 'lepanbaft55@gmail.com';
    const title = config.companyTitle || 'شرکت تولیدی لپان بافت';
    
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${title}
ORG:${title}
TITLE:${config.companySubtitle || ''}
TEL;TYPE=CELL,VOICE:${mainPhone}
${phoneBlocks[1] ? `TEL;TYPE=WORK,VOICE:${phoneBlocks[1].value}\n` : ''}
EMAIL;TYPE=PREF,INTERNET:${mainEmail}
NOTE:${config.addressText || ''}
URL:${window.location.href}
END:VCARD`;

    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${config.slug || 'company'}_contact.vcf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('کارت مخاطب آماده ذخیره‌سازی در گوشی شد.');
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: config.companyTitle,
          text: config.companySubtitle,
          url: shareUrl,
        });
      } catch (e) {
        // Fallback to copy
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast.success('لینک صفحه عمومی کپی شد.');
    }
  };

  const handleBlockClick = (block: BioLinkBlock) => {
    if (block.category === 'order_form') {
      setActiveOrderModal(true);
      return;
    }
    if (block.category === 'survey') {
      setActiveSurveyModal(true);
      return;
    }

    if (block.category === 'phones') {
      const cleanPhone = block.value.replace(/[^0-9+]/g, '');
      window.location.href = `tel:${cleanPhone}`;
      return;
    }

    if (block.category === 'emails') {
      window.location.href = `mailto:${block.value}`;
      return;
    }

    // WhatsApp handling
    if (block.iconName === 'whatsapp' || block.title.includes('واتساپ') || block.value.includes('wa.me')) {
      let val = (block.value || '').trim();
      if (!val.startsWith('http://') && !val.startsWith('https://')) {
        const cleanNum = val.replace(/[^0-9+]/g, '');
        val = `https://wa.me/${cleanNum}`;
      }
      window.open(val, '_blank', 'noopener,noreferrer');
      return;
    }
    // Bots handling (Telegram and Bale)
    if (block.category === 'bots' || block.iconName === 'telegram_bot' || block.iconName === 'bale_bot' || block.title.includes('تلگرام') || block.title.includes('بله')) {
      let val = (block.value || '').trim();
      const isTelegram = block.iconName === 'telegram_bot' || block.iconName === 'telegram' || block.title.includes('تلگرام') || val.includes('t.me');
      const isBale = block.iconName === 'bale_bot' || block.iconName === 'bale' || block.title.includes('بله') || val.includes('ble.ir');

      if (isTelegram) {
        const clean = val.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
        val = `https://t.me/${clean}`;
      } else if (isBale) {
        const clean = val.replace(/^@/, '').replace(/^https?:\/\/ble\.ir\//, '');
        val = `https://ble.ir/${clean}`;
      } else if (!val.startsWith('http://') && !val.startsWith('https://')) {
        val = `https://${val}`;
      }
      window.open(val, '_blank', 'noopener,noreferrer');
      return;
    }

    if (block.value && block.value !== 'order_form') {
      let url = block.value;
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:') && !url.startsWith('tel:')) {
        url = `https://${url}`;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderForm.customerName || !orderForm.customerPhone) {
      toast.error('لطفاً نام و شماره تماس را وارد کنید.');
      return;
    }
    setSubmittingOrder(true);
    try {
      const res = await submitBioLinkOrder(orderForm);
      if (res && res.success) {
        setOrderSuccess(true);
        toast.success(res.message || 'سفارش شما با موفقیت ثبت شد.');
      } else {
        toast.error(res?.error || 'خطا در ثبت سفارش');
      }
    } catch (e: any) {
      toast.error('خطا در ارتباط با سرور: ' + (e.message || ''));
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Icon Helper Function
  const renderBlockIcon = (block: BioLinkBlock) => {
    const iconName = block.iconName || '';
    if (iconName === 'telegram_bot' || iconName === 'telegram' || block.title.includes('تلگرام')) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-500 dark:text-sky-400 flex items-center justify-center shrink-0 shadow-sm border border-sky-500/20">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.37.74-.56 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.15 3.35-1.35 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06-.01.19-.03.32z"/>
          </svg>
        </div>
      );
    }
    if (iconName === 'whatsapp' || block.title.includes('واتساپ')) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-sm border border-emerald-500/20">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-2.646-1.027-5.13-2.904-7.008-1.878-1.88-4.363-2.908-7.008-2.905-5.448 0-9.886 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
          </svg>
        </div>
      );
    }
    if (iconName === 'bale_bot' || iconName === 'bale' || block.title.includes('بله')) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 font-black text-xs shadow-sm border border-emerald-500/20">
          <span className="px-1.5 py-0.5 rounded-lg bg-emerald-600 text-white text-[11px] font-black tracking-wider shadow-sm">بله</span>
        </div>
      );
    }
    if (iconName === 'neshan') {
      return (
        <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 font-black text-xs">
          نشان
        </div>
      );
    }
    if (iconName === 'balad') {
      return (
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 font-black text-xs">
          بلد
        </div>
      );
    }
    if (iconName === 'google_maps') {
      return (
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <MapPin className="w-5 h-5" />
        </div>
      );
    }
    if (block.category === 'phones' || iconName === 'mobile' || iconName === 'phone') {
      return (
        <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <PhoneCall className="w-5 h-5" />
        </div>
      );
    }
    if (block.category === 'emails' || iconName === 'email') {
      return (
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5" />
        </div>
      );
    }
    if (block.category === 'socials' || iconName === 'instagram') {
      return (
        <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
          <Instagram className="w-5 h-5" />
        </div>
      );
    }
    if (block.category === 'catalog' || iconName === 'file') {
      return (
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5" />
        </div>
      );
    }
    if (block.category === 'order_form' || iconName === 'order') {
      return (
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <ShoppingBag className="w-5 h-5" />
        </div>
      );
    }
    if (block.category === 'survey' || iconName === 'survey') {
      return (
        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-9 h-9 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
        <Globe className="w-5 h-5" />
      </div>
    );
  };

  // Color theme helper for block cards
  const getBlockCardStyle = (block: BioLinkBlock) => {
    switch (block.colorTheme) {
      case 'rose':
        return 'bg-rose-50/80 hover:bg-rose-100/80 border-rose-200/80 text-rose-950 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 dark:border-rose-900/50 dark:text-rose-100';
      case 'indigo':
        return 'bg-indigo-50/80 hover:bg-indigo-100/80 border-indigo-200/80 text-indigo-950 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/40 dark:border-indigo-900/50 dark:text-indigo-100';
      case 'emerald':
        return 'bg-emerald-50/80 hover:bg-emerald-100/80 border-emerald-200/80 text-emerald-950 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 dark:border-emerald-900/50 dark:text-emerald-100';
      case 'amber':
        return 'bg-amber-50/80 hover:bg-amber-100/80 border-amber-200/80 text-amber-950 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 dark:border-amber-900/50 dark:text-amber-100';
      case 'purple':
        return 'bg-purple-50/80 hover:bg-purple-100/80 border-purple-200/80 text-purple-950 dark:bg-purple-950/30 dark:hover:bg-purple-900/40 dark:border-purple-900/50 dark:text-purple-100';
      case 'blue':
        return 'bg-blue-50/80 hover:bg-blue-100/80 border-blue-200/80 text-blue-950 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 dark:border-blue-900/50 dark:text-blue-100';
      case 'slate':
      default:
        return 'bg-white hover:bg-slate-50 border-slate-200/90 text-slate-900 dark:bg-slate-900 dark:hover:bg-slate-800/80 dark:border-slate-800 dark:text-slate-100 shadow-sm';
    }
  };

  return (
    <div className={`w-full min-h-full h-auto overflow-y-visible dir-rtl font-sans bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 flex flex-col items-center justify-start ${isEmbeddedPreview ? 'p-0 min-h-0' : 'py-6 sm:py-10 px-3 sm:px-4 pb-48'}`} style={{ touchAction: 'pan-y' }}>
      <Toaster position="top-center" />
      
      {/* Top Action Bar if in full screen */}
      {!isEmbeddedPreview && (
        <div className="w-full max-w-lg mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-black text-slate-800 dark:text-slate-200">کارت ویزیت دیجیتال لپان لینک</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-2 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center justify-center shadow-sm hover:bg-slate-50 transition-colors"
              title="اشتراک‌گذاری"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleDownloadVCard}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>ذخیره مخاطب</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Lepan Link Card Wrapper */}
      <div className={`w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl sm:shadow-2xl transition-all duration-300 ${isEmbeddedPreview ? 'shadow-none rounded-2xl border-0' : ''}`}>
        
        {/* Cover Photo Header */}
        <div className="relative w-full h-44 bg-slate-800 overflow-hidden">
          <img
            src={processBioImageUrl(config.coverUrl, '/lepan-logo.png')}
            alt="Cover"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            className="w-full h-full object-cover opacity-90 scale-105 transform hover:scale-100 transition-transform duration-700"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.onerror = null;
              target.src = '/lepan-logo.png';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/20" />
          
          {/* Lepan Link Badge */}
          <div className="absolute top-3 left-3 bg-white/20 backdrop-blur-md border border-white/30 text-white text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
            <span>لپان لینک اختصاصی</span>
          </div>
        </div>

        {/* Profile Info Block */}
        <div className="relative px-5 pt-0 pb-6 text-center border-b border-slate-100 dark:border-slate-800/80">
          {/* Avatar Logo */}
          <div className="relative -mt-16 mb-3 inline-block">
            <div className="w-28 h-28 rounded-full bg-white dark:bg-slate-900 p-1.5 shadow-xl border-2 border-white dark:border-slate-800 mx-auto">
              <img
                src={processBioImageUrl(config.avatarUrl, '/lepan-logo.png')}
                alt="Logo"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                className="w-full h-full rounded-full object-cover bg-slate-50 dark:bg-slate-800"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.onerror = null;
                  target.src = '/lepan-logo.png';
                }}
              />
            </div>
          </div>

          {/* Title & Description */}
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
            {config.companyTitle || 'شرکت تولیدی لپان بافت'}
          </h1>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed max-w-xs mx-auto">
            {config.companySubtitle || 'تولید انواع نخ پلی استر ، کش ، اسپندکس ، POY و ساپورت'}
          </p>

          {/* Quick Contact & Save vCard Buttons inside Hero */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={handleDownloadVCard}
              className="px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-xs font-extrabold flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>ذخیره در مخاطبین</span>
            </button>
            <button
              onClick={() => setActiveOrderModal(true)}
              className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>ثبت سفارش آنلاین</span>
            </button>
          </div>
        </div>

        {/* Dynamic Blocks Container */}
        <div className="p-4 space-y-5 bg-slate-50/50 dark:bg-slate-950/40 min-h-[350px]">
          
          {/* Address & Location Info Card */}
          {config.addressText && (
            <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-900/60 text-amber-950 dark:text-amber-100 flex items-start gap-3 shadow-sm transition-all hover:border-amber-300">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 shadow-sm border border-amber-500/20">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                  <span>نشانی و آدرس کارخانه / دفتر مرکزی</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">ثبت رسمی</span>
                </div>
                <div className="text-xs font-semibold leading-relaxed mt-1.5 text-slate-800 dark:text-slate-100 whitespace-pre-line select-text">
                  {config.addressText}
                </div>
              </div>
            </div>
          )}
          
          {/* 1. Telegram & Bale Bots Section */}
          {botBlocks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 px-1">
                <Bot className="w-3.5 h-3.5 text-sky-500" />
                <span>بات‌ها و پیام‌رسان‌ها (تلگرام و بله)</span>
              </div>
              <div className="space-y-2">
                {botBlocks.map(block => (
                  <button
                    key={block.id}
                    onClick={() => handleBlockClick(block)}
                    className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all duration-200 text-right active:scale-[0.98] ${getBlockCardStyle(block)}`}
                  >
                    <div className="flex items-center gap-3">
                      {renderBlockIcon(block)}
                      <div>
                        <div className="font-bold text-xs">{block.title}</div>
                        {block.subtitle && (
                          <div className="text-[10px] opacity-75 font-medium mt-0.5 line-clamp-1">{block.subtitle}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {block.badge && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                          {block.badge}
                        </span>
                      )}
                      <ExternalLink className="w-4 h-4 opacity-50 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Maps & Navigation Section */}
          {mapBlocks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 px-1">
                <Navigation className="w-3.5 h-3.5 text-rose-500" />
                <span>آدرس و مسیریابی</span>
              </div>
              <div className="space-y-2">
                {mapBlocks.map(block => (
                  <button
                    key={block.id}
                    onClick={() => handleBlockClick(block)}
                    className={`w-full p-3 rounded-2xl border flex items-center justify-between transition-all duration-200 text-right active:scale-[0.98] ${getBlockCardStyle(block)}`}
                  >
                    <div className="flex items-center gap-3">
                      {renderBlockIcon(block)}
                      <div>
                        <div className="font-bold text-xs">{block.title}</div>
                        {block.subtitle && (
                          <div className="text-[10px] opacity-75 font-medium mt-0.5 line-clamp-1">{block.subtitle}</div>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 opacity-50 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Phone Contact Section */}
          {phoneBlocks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 px-1">
                <Phone className="w-3.5 h-3.5 text-blue-500" />
                <span>راه‌های ارتباطی</span>
              </div>
              <div className="space-y-2">
                {phoneBlocks.map(block => (
                  <button
                    key={block.id}
                    onClick={() => handleBlockClick(block)}
                    className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all duration-200 text-right active:scale-[0.98] ${getBlockCardStyle(block)}`}
                  >
                    <div className="flex items-center gap-3">
                      {renderBlockIcon(block)}
                      <div>
                        <div className="font-bold text-xs">{block.title}</div>
                        {block.subtitle && (
                          <div className="text-[10px] opacity-75 font-mono dir-ltr text-right mt-0.5">{block.subtitle}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold dir-ltr opacity-90">{block.value}</span>
                      <PhoneCall className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Email & Messaging Section */}
          {emailBlocks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 px-1">
                <Mail className="w-3.5 h-3.5 text-indigo-500" />
                <span>ایمیل و پیام‌رسان‌ها</span>
              </div>
              <div className="space-y-2">
                {emailBlocks.map(block => (
                  <button
                    key={block.id}
                    onClick={() => handleBlockClick(block)}
                    className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all duration-200 text-right active:scale-[0.98] ${getBlockCardStyle(block)}`}
                  >
                    <div className="flex items-center gap-3">
                      {renderBlockIcon(block)}
                      <div>
                        <div className="font-bold text-xs">{block.title}</div>
                        <div className="text-[11px] font-mono opacity-80 mt-0.5 dir-ltr text-right">{block.value}</div>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 opacity-50 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Social Media Section */}
          {socialBlocks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 px-1">
                <Instagram className="w-3.5 h-3.5 text-purple-500" />
                <span>شبکه‌های اجتماعی</span>
              </div>
              <div className="space-y-2">
                {socialBlocks.map(block => (
                  <button
                    key={block.id}
                    onClick={() => handleBlockClick(block)}
                    className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all duration-200 text-right active:scale-[0.98] ${getBlockCardStyle(block)}`}
                  >
                    <div className="flex items-center gap-3">
                      {renderBlockIcon(block)}
                      <div>
                        <div className="font-bold text-xs">{block.title}</div>
                        {block.subtitle && (
                          <div className="text-[10px] opacity-75 mt-0.5">{block.subtitle}</div>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 opacity-50 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 5. Catalog & Files Section */}
          {catalogBlocks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 px-1">
                <FileText className="w-3.5 h-3.5 text-amber-500" />
                <span>کاتالوگ و مشخصات کالاها</span>
              </div>
              <div className="space-y-2">
                {catalogBlocks.map(block => (
                  <button
                    key={block.id}
                    onClick={() => handleBlockClick(block)}
                    className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all duration-200 text-right active:scale-[0.98] ${getBlockCardStyle(block)}`}
                  >
                    <div className="flex items-center gap-3">
                      {renderBlockIcon(block)}
                      <div>
                        <div className="font-bold text-xs">{block.title}</div>
                        {block.subtitle && (
                          <div className="text-[10px] opacity-75 mt-0.5">{block.subtitle}</div>
                        )}
                      </div>
                    </div>
                    <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 6. Order Form & Custom Blocks */}
          {(orderBlocks.length > 0 || otherBlocks.length > 0) && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 px-1">
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
                <span>خدمات و درخواست‌ها</span>
              </div>
              <div className="space-y-2">
                {[...orderBlocks, ...otherBlocks].map(block => (
                  <button
                    key={block.id}
                    onClick={() => handleBlockClick(block)}
                    className={`w-full p-3.5 rounded-2xl border flex items-center justify-between transition-all duration-200 text-right active:scale-[0.98] ${getBlockCardStyle(block)}`}
                  >
                    <div className="flex items-center gap-3">
                      {renderBlockIcon(block)}
                      <div>
                        <div className="font-bold text-xs">{block.title}</div>
                        {block.subtitle && (
                          <div className="text-[10px] opacity-75 mt-0.5">{block.subtitle}</div>
                        )}
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 opacity-50 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="p-4 text-center bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
          <div className="font-bold text-slate-700 dark:text-slate-300">
            {config.companyTitle || 'شرکت تولیدی لپان بافت'}
          </div>
          <div className="text-[10px] mt-1 text-slate-400">
            طراحی شده اختصاصی - لپان لینک هوشمند ارائه‌دهنده کارت ویزیت و QR کد
          </div>
        </div>

      </div>

      {/* Order Modal Form */}
      {activeOrderModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in dir-rtl">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl relative overflow-hidden">
            <button
              onClick={() => {
                setActiveOrderModal(false);
                setOrderSuccess(false);
              }}
              className="absolute top-4 left-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {orderSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200 dark:border-emerald-800">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="font-black text-lg text-slate-900 dark:text-white">
                  درخواست شما با موفقیت ثبت شد
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                  از تماس شما متشکریم. کارشناسان واحد فروش شرکت تولیدی لپان بافت در اسرع وقت با شما تماس خواهند گرفت.
                </p>
                <button
                  onClick={() => {
                    setActiveOrderModal(false);
                    setOrderSuccess(false);
                  }}
                  className="mt-4 px-6 py-2.5 rounded-2xl bg-emerald-600 text-white font-extrabold text-xs shadow-md"
                >
                  تایید و بستن
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitOrder} className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900 dark:text-white">
                      ثبت سفارش و استعلام قیمت
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      اطلاعات خود را وارد کنید تا کارشناسان فروش با شما تماس بگیرند
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      نام و نام خانوادگی / نام خریدار *
                    </label>
                    <input
                      type="text"
                      required
                      value={orderForm.customerName}
                      onChange={(e) => setOrderForm({ ...orderForm, customerName: e.target.value })}
                      placeholder="مثال: علی محمدی (تولیدی بافت)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      شماره همراه جهت تماس *
                    </label>
                    <input
                      type="tel"
                      required
                      value={orderForm.customerPhone}
                      onChange={(e) => setOrderForm({ ...orderForm, customerPhone: e.target.value })}
                      placeholder="09123456789"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-mono font-medium dir-ltr text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      نوع کالا یا نخ درخواستی
                    </label>
                    <select
                      value={orderForm.productTitle}
                      onChange={(e) => setOrderForm({ ...orderForm, productTitle: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="نخ پلی استر">نخ پلی استر</option>
                      <option value="لاکرا (اسپندکس)">لاکرا (اسپندکس)</option>
                      <option value="کش لاستیکی / کش کاغذی">کش لاستیکی / کش کاغذی</option>
                      <option value="نخ POY">نخ POY</option>
                      <option value="نخ ساپورت">نخ ساپورت</option>
                      <option value="سایر کالاها">سایر کالاها / مشاوره فنی</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      مقدار تقریبی / کارتن
                    </label>
                    <input
                      type="text"
                      value={orderForm.quantity}
                      onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })}
                      placeholder="مثال: ۵ کارتن (۲۰۰ کیلو)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      توضیحات تکمیلی (اختیاری)
                    </label>
                    <textarea
                      rows={2}
                      value={orderForm.notes}
                      onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                      placeholder="رنگ، گرید یا شروط تحویل..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveOrderModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    disabled={submittingOrder}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
                  >
                    {submittingOrder ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>ثبت و ارسال درخواست</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Survey Modal */}
      {activeSurveyModal && (
        <div className="fixed inset-0 z-[999999999] flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-right dir-rtl">
            {surveySuccess ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">سپاس از ثبت نظرسنجی</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">نظر ارزشمند شما با موفقیت ثبت شد و در ارتقای کیفیت خدمات ما منظور گردید.</p>
                <button
                  onClick={() => { setActiveSurveyModal(false); setSurveySuccess(false); }}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs"
                >
                  بازگشت
                </button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSubmittingSurvey(true);
                  try {
                    const res = await submitBioLinkSurvey(surveyForm);
                    if (res && res.success) {
                      setSurveySuccess(true);
                      toast.success(res.message || 'ثبت نظر با موفقیت انجام شد.');
                    } else {
                      toast.error(res?.error || 'خطا در ثبت نظرسنجی');
                    }
                  } catch (err: any) {
                    toast.error('خطا در ارتباط با سرور: ' + (err.message || ''));
                  } finally {
                    setSubmittingSurvey(false);
                  }
                }}
                className="space-y-4"
              >
                <div className="flex justify-between items-center border-b pb-3 border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="font-black text-sm text-slate-900 dark:text-slate-100">فرم نظرسنجی کیفیت محصولات و خدمات</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">شرکت تولیدی و صنعتی لپان بافت</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSurveyModal(false)}
                    className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">نام مشتری یا شرکت (اختیاری)</label>
                    <input
                      type="text"
                      value={surveyForm.customerName}
                      onChange={(e) => setSurveyForm({ ...surveyForm, customerName: e.target.value })}
                      placeholder="مثال: شرکت بافتینه"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">شماره تماس (اختیاری)</label>
                    <input
                      type="tel"
                      value={surveyForm.customerPhone}
                      onChange={(e) => setSurveyForm({ ...surveyForm, customerPhone: e.target.value })}
                      placeholder="09123456789"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-mono dir-ltr text-right"
                    />
                  </div>

                  {/* Rating 1: Quality */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">۱. کیفیت محصول و نخ تحویلی (از ۱ تا ۵)</label>
                    <div className="flex items-center justify-between gap-1 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          type="button"
                          key={star}
                          onClick={() => setSurveyForm({ ...surveyForm, qualityRating: star })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors ${surveyForm.qualityRating === star ? 'bg-amber-500 text-white shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                        >
                          {star} ⭐
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rating 2: Delivery */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">۲. سرعت بارگیری و تحویل (از ۱ تا ۵)</label>
                    <div className="flex items-center justify-between gap-1 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          type="button"
                          key={star}
                          onClick={() => setSurveyForm({ ...surveyForm, deliveryRating: star })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors ${surveyForm.deliveryRating === star ? 'bg-amber-500 text-white shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                        >
                          {star} ⭐
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rating 3: Support */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">۳. پاسخگویی و پشتیبانی فروش (از ۱ تا ۵)</label>
                    <div className="flex items-center justify-between gap-1 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          type="button"
                          key={star}
                          onClick={() => setSurveyForm({ ...surveyForm, supportRating: star })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors ${surveyForm.supportRating === star ? 'bg-amber-500 text-white shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                        >
                          {star} ⭐
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">نظرات، انتقادات و پیشنهادات</label>
                    <textarea
                      rows={2}
                      value={surveyForm.comment}
                      onChange={(e) => setSurveyForm({ ...surveyForm, comment: e.target.value })}
                      placeholder="پیشنهادی برای بهبود کیفیت..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs resize-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSurveyModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    disabled={submittingSurvey}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
                  >
                    {submittingSurvey ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>ثبت نهایی نظرسنجی</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
