import React, { useState, useEffect, useRef } from 'react';
import { BioLinkConfig, BioLinkBlock, BioLinkOrder, User, SystemSettings, UserRole } from '../types';
import { getBioLinkConfig, saveBioLinkConfig, uploadFileChunked } from '../services/storageService';
import { getRolePermissions } from '../services/authService';
import { PublicBioPage, processBioImageUrl } from './PublicBioPage';
import QRCode from 'qrcode';
import { 
  QrCode, Edit3, Eye, Printer, Download, Plus, Trash2, ArrowUp, ArrowDown, 
  Check, X, Sparkles, Navigation, Phone, Mail, Instagram, FileText, ShoppingBag, 
  Globe, Share2, Copy, Smartphone, Layers, Palette, RefreshCw, Loader2, PhoneCall,
  ExternalLink, Building2, UserCheck, MessageSquare, AlertCircle, Save, ShieldAlert, Lock, MapPin,
  Upload, Image as ImageIcon
} from 'lucide-react';
import toast from 'react-hot-toast';

interface DigitalCardModuleProps {
  currentUser: User | null;
  settings?: SystemSettings | null;
}

export const DigitalCardModule: React.FC<DigitalCardModuleProps> = ({ currentUser, settings }) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'qr_print' | 'orders' | 'surveys'>('editor');
  const [config, setConfig] = useState<BioLinkConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Permission calculation: Can the current user edit/modify the digital card?
  const canManage = Boolean(
    currentUser?.role === UserRole.ADMIN ||
    currentUser?.role === 'ADMIN' ||
    (currentUser && settings && getRolePermissions(currentUser.role, settings, currentUser).canManageDigitalCard === true)
  );

  // QR Code Generator States
  const [qrSize, setQrSize] = useState(300);
  const [qrColor, setQrColor] = useState('#0f172a');
  const [qrBgColor, setQrBgColor] = useState('#ffffff');
  const [embedLogo, setEmbedLogo] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Add/Edit Block Modal State
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<BioLinkBlock | null>(null);
  const [blockForm, setBlockForm] = useState<Partial<BioLinkBlock>>({
    category: 'maps',
    title: '',
    subtitle: '',
    value: '',
    iconName: 'neshan',
    colorTheme: 'blue',
    badge: '',
    isActive: true
  });

  const cardPrintRef = useRef<HTMLDivElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  // Compress and read uploaded image into data URL
  const compressAndReadImage = (file: File, maxWidth = 600, quality = 0.85): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => reject(new Error('خطا در بارگذاری فایل تصویر'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('خطا در خواندن فایل'));
      reader.readAsDataURL(file);
    });
  };

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !config) return;
    try {
      toast.loading('در حال پردازش و آپلود لوگو...', { id: 'img_upload' });
      const dataUrl = await compressAndReadImage(file, 400, 0.88);
      setConfig({ ...config, avatarUrl: dataUrl });
      toast.success('لوگو با موفقیت انتخاب شد.', { id: 'img_upload' });
    } catch (err: any) {
      toast.error('خطا در آپلود لوگو: ' + (err.message || ''), { id: 'img_upload' });
    }
  };

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !config) return;
    try {
      toast.loading('در حال پردازش و آپلود کاور...', { id: 'img_upload' });
      const dataUrl = await compressAndReadImage(file, 900, 0.85);
      setConfig({ ...config, coverUrl: dataUrl });
      toast.success('تصویر کاور با موفقیت انتخاب شد.', { id: 'img_upload' });
    } catch (err: any) {
      toast.error('خطا در آپلود کاور: ' + (err.message || ''), { id: 'img_upload' });
    }
  };

  // Fetch initial configuration
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getBioLinkConfig(true);
      setConfig(data);
    } catch (e: any) {
      toast.error('خطا در دریافت اطلاعات زیلینک');
    } finally {
      setLoading(false);
    }
  };

  // Generate QR Code Data URL whenever options or config change
  useEffect(() => {
    if (!config) return;
    generateQRCode();
  }, [config, qrSize, qrColor, qrBgColor, embedLogo]);

  const getPublicUrl = () => {
    const origin = window.location.origin;
    const slug = config?.slug || 'lepanbaft';
    return `${origin}/#p/${slug}`;
  };

  const generateQRCode = async () => {
    try {
      const targetUrl = getPublicUrl();
      const qrDataUrlBase = await QRCode.toDataURL(targetUrl, {
        width: qrSize,
        margin: 2,
        color: {
          dark: qrColor,
          light: qrBgColor
        },
        errorCorrectionLevel: 'H'
      });

      if (!embedLogo) {
        setQrDataUrl(qrDataUrlBase);
        return;
      }

      // Draw onto canvas to add "LEPAN" center text badge with stylish font
      const canvas = document.createElement('canvas');
      canvas.width = qrSize;
      canvas.height = qrSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setQrDataUrl(qrDataUrlBase);
        return;
      }

      const img = new Image();
      img.src = qrDataUrlBase;
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });

      ctx.drawImage(img, 0, 0);

      const badgeWidth = qrSize * 0.42;
      const badgeHeight = qrSize * 0.18;
      const badgeX = (qrSize - badgeWidth) / 2;
      const badgeY = (qrSize - badgeHeight) / 2;

      ctx.fillStyle = qrBgColor;
      ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);

      ctx.lineWidth = 3;
      ctx.strokeStyle = qrColor;
      ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);

      ctx.fillStyle = qrColor;
      ctx.font = `900 ${Math.round(qrSize * 0.09)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LEPAN', qrSize / 2, qrSize / 2);

      setQrDataUrl(canvas.toDataURL('image/png'));
    } catch (err) {
      console.error('QR code generation error:', err);
      toast.error('خطا در تولید QR کد');
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    if (!canManage) {
      toast.error('شما دسترسی لازم برای ویرایش و ذخیره تنظیمات زیلینک و کارت دیجیتال را ندارید.');
      return;
    }
    setSaving(true);
    try {
      const updated = await saveBioLinkConfig(config);
      setConfig(updated);
      toast.success('تنظیمات زیلینک با موفقیت ذخیره شد.');
    } catch (e: any) {
      toast.error('خطا در ذخیره تغییرات: ' + (e.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddBlock = (presetCategory?: string) => {
    setEditingBlock(null);
    if (presetCategory === 'neshan') {
      setBlockForm({
        category: 'maps',
        title: 'مسیریاب نشان',
        subtitle: 'مسیریاب آنلاین نشان',
        value: 'https://nshn.ir',
        iconName: 'neshan',
        colorTheme: 'rose',
        badge: 'نقشه',
        isActive: true
      });
    } else if (presetCategory === 'balad') {
      setBlockForm({
        category: 'maps',
        title: 'مسیریاب بلد',
        subtitle: 'مسیریاب آنلاین بلد',
        value: 'https://balad.ir',
        iconName: 'balad',
        colorTheme: 'indigo',
        badge: 'نقشه',
        isActive: true
      });
    } else if (presetCategory === 'google_maps') {
      setBlockForm({
        category: 'maps',
        title: 'مسیریاب گوگل',
        subtitle: 'Google Maps Location',
        value: 'https://maps.google.com',
        iconName: 'google_maps',
        colorTheme: 'emerald',
        badge: 'نقشه',
        isActive: true
      });
    } else if (presetCategory === 'phone') {
      setBlockForm({
        category: 'phones',
        title: 'واحد فروش',
        subtitle: 'تماس با کارشناس فروش',
        value: '09120000000',
        iconName: 'mobile',
        colorTheme: 'blue',
        badge: 'تلفن',
        isActive: true
      });
    } else if (presetCategory === 'instagram') {
      setBlockForm({
        category: 'socials',
        title: 'اینستاگرام',
        subtitle: 'صفحه رسمی اینستاگرام',
        value: 'https://instagram.com/',
        iconName: 'instagram',
        colorTheme: 'purple',
        badge: 'شبکه اجتماعی',
        isActive: true
      });
    } else if (presetCategory === 'whatsapp') {
      setBlockForm({
        category: 'socials',
        title: 'ارتباط در واتساپ',
        subtitle: 'چت مستقیم با مدیر فروش',
        value: 'https://wa.me/989120000000',
        iconName: 'whatsapp',
        colorTheme: 'emerald',
        badge: 'واتساپ',
        isActive: true
      });
    } else {
      setBlockForm({
        category: 'maps',
        title: '',
        subtitle: '',
        value: '',
        iconName: 'neshan',
        colorTheme: 'blue',
        badge: '',
        isActive: true
      });
    }
    setBlockModalOpen(true);
  };

  const handleOpenEditBlock = (block: BioLinkBlock) => {
    setEditingBlock(block);
    setBlockForm({ ...block });
    setBlockModalOpen(true);
  };

  const handleSaveBlockForm = () => {
    if (!config) return;
    if (!blockForm.title || !blockForm.value) {
      toast.error('لطفاً عنوان و مقدار/لینک بلوک را وارد کنید.');
      return;
    }

    let updatedBlocks = [...(config.blocks || [])];

    if (editingBlock) {
      // Update existing block
      updatedBlocks = updatedBlocks.map(b => b.id === editingBlock.id ? { ...b, ...blockForm } as BioLinkBlock : b);
    } else {
      // Add new block
      const newBlock: BioLinkBlock = {
        id: `blk_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        category: blockForm.category || 'custom',
        title: blockForm.title || '',
        subtitle: blockForm.subtitle || '',
        value: blockForm.value || '',
        iconName: blockForm.iconName || 'globe',
        badge: blockForm.badge || '',
        colorTheme: blockForm.colorTheme || 'blue',
        isActive: blockForm.isActive !== false,
        order: updatedBlocks.length + 1
      };
      updatedBlocks.push(newBlock);
    }

    setConfig({
      ...config,
      blocks: updatedBlocks
    });

    setBlockModalOpen(false);
    toast.success(editingBlock ? 'بلوک بروزرسانی شد.' : 'بلوک جدید اضافه شد.');
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    if (!config || !config.blocks) return;
    const blocks = [...config.blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;

    const temp = blocks[index];
    blocks[index] = blocks[targetIndex];
    blocks[targetIndex] = temp;

    // Recalculate order index
    const reordered = blocks.map((b, idx) => ({ ...b, order: idx + 1 }));
    setConfig({ ...config, blocks: reordered });
  };

  const handleToggleBlockActive = (id: string) => {
    if (!config || !config.blocks) return;
    const updated = config.blocks.map(b => b.id === id ? { ...b, isActive: !b.isActive } : b);
    setConfig({ ...config, blocks: updated });
  };

  const handleDeleteBlock = (id: string) => {
    if (!config || !config.blocks) return;
    const updated = config.blocks.filter(b => b.id !== id);
    setConfig({ ...config, blocks: updated });
    toast.success('بلوک حذف شد.');
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `QR_Code_${config?.slug || 'lepanbaft'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('تصویر QR کد دانلود شد.');
  };

  const handlePrintCard = () => {
    window.print();
  };

  const handlePrintStandaloneQR = () => {
    if (!qrDataUrl) {
      toast.error('تصویر QR کد آماده نیست.');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('مرورگر از باز کردن پنجره چاپ جلوگیری کرد.');
      return;
    }
    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>چاپ QR کد LEPAN - ${config.companyTitle}</title>
          <style>
            body { font-family: Tahoma, sans-serif; text-align: center; padding: 40px; background: #fff; color: #000; }
            .card { border: 2px dashed #333; border-radius: 24px; padding: 30px; display: inline-block; max-width: 400px; margin: auto; }
            h1 { font-size: 22px; font-weight: 900; margin-bottom: 5px; color: #0f172a; }
            p { font-size: 13px; color: #475569; margin-bottom: 20px; line-height: 1.6; }
            img { width: 280px; height: 280px; object-fit: contain; margin: 15px 0; }
            .badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 6px 16px; border-radius: 999px; font-weight: bold; font-size: 12px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>${config.companyTitle}</h1>
            <p>${config.companySubtitle || 'مسیریابی، راه‌های ارتباطی و ثبت سفارش آنلاین'}</p>
            <img src="${qrDataUrl}" alt="QR Code LEPAN" />
            <div class="badge">اسکن کنید (LEPAN)</div>
          </div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    toast.success('پنجره چاپ اختصاصی QR کد باز شد.');
  };

  const handleCopyLink = () => {
    const url = getPublicUrl();
    navigator.clipboard.writeText(url);
    toast.success('لینک زیلینک کپی شد: ' + url);
  };

  const handleOrderStatusChange = (orderId: string, newStatus: BioLinkOrder['status']) => {
    if (!config || !config.orders) return;
    const updatedOrders = config.orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o);
    const newConfig = { ...config, orders: updatedOrders };
    setConfig(newConfig);
    saveBioLinkConfig(newConfig);
    toast.success('وضعیت سفارش بروزرسانی گردید.');
  };

  const handleDeleteOrder = (orderId: string) => {
    if (!config || !config.orders) return;
    const updatedOrders = config.orders.filter(o => o.id !== orderId);
    const newConfig = { ...config, orders: updatedOrders };
    setConfig(newConfig);
    saveBioLinkConfig(newConfig);
    toast.success('سفارش حذف شد.');
  };

  if (loading) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center gap-3 dir-rtl text-slate-500">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="text-xs font-bold">در حال بارگذاری تنظیمات زیلینک و کارت دیجیتال...</span>
      </div>
    );
  }

  if (!config) return null;

  const activeBlocksCount = (config.blocks || []).filter(b => b.isActive !== false).length;
  const pendingOrdersCount = (config.orders || []).filter(o => o.status === 'pending').length;
  const totalSurveysCount = (config.surveys || []).length;

  return (
    <div className="w-full flex flex-col flex-1 dir-rtl font-sans space-y-5 p-3 sm:p-5 md:p-6">
      
      {/* Unified Executive Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-5 sm:p-6 shadow-xl border border-white/10">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0 border border-white/20">
              <QrCode className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  لینک عمومی فعال
                </span>
                {!canManage && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    حالت فقط مشاهده
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-2xl font-black text-white mt-1">
                کارت دیجیتال، زیلینک اختصاصی و نظرسنجی مشتریان
              </h2>
              <p className="text-xs text-slate-300/90 mt-0.5">
                صفحه اختصاصی شرکت، مسیریاب‌ها، راه‌های ارتباطی، کیو آر کد کارت ویزیت و مدیریت نظرسنجی‌های خروج بار
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopyLink}
              className="px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="کپی لینک عمومی"
            >
              <Copy className="w-4 h-4 text-blue-300" />
              <span className="hidden sm:inline">کپی لینک:</span>
              <span className="font-mono text-[11px] text-blue-300">{config.slug}</span>
            </button>

            {canManage ? (
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5 shadow-lg shadow-emerald-500/30 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>ذخیره تغییرات</span>
              </button>
            ) : (
              <div className="px-3 py-2 rounded-2xl bg-white/10 border border-white/10 text-slate-300 text-xs font-bold flex items-center gap-1.5" title="دسترسی تغییرات فقط برای نقش‌های مجاز در تنظیمات فعال است">
                <Lock className="w-3.5 h-3.5" />
                <span>تغییرات قفل است</span>
              </div>
            )}
          </div>
        </div>

        {/* 4-Column KPI Strip */}
        <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-5 pt-4 border-t border-white/10">
          <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-slate-300 font-bold">بلوک‌های ارتباطی فعال</p>
              <p className="text-lg font-black text-white font-mono mt-0.5">{activeBlocksCount} بلوک</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Edit3 className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-rose-200 font-bold">سفارشات منتظر بررسی</p>
              <p className="text-lg font-black text-rose-300 font-mono mt-0.5">{pendingOrdersCount} مورد</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-300">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-amber-200 font-bold">پاسخ‌های نظرسنجی مشتریان</p>
              <p className="text-lg font-black text-amber-300 font-mono mt-0.5">{totalSurveysCount} ثبت</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] text-emerald-200 font-bold">شناسه صفحه اختصاصی</p>
              <p className="text-sm font-black text-emerald-300 font-mono mt-0.5 truncate">/{config.slug}</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Navigation Sub-Tabs inside Hero */}
        <div className="relative z-10 flex items-center gap-2 flex-wrap mt-4 pt-3 border-t border-white/10">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'editor'
                ? 'bg-white text-slate-900 shadow-lg'
                : 'bg-white/10 text-slate-200 hover:bg-white/20'
            }`}
          >
            <Edit3 className={`w-4 h-4 ${activeTab === 'editor' ? 'text-blue-600' : ''}`} />
            <span>ویرایشگر زیلینک و بلوک‌ها</span>
          </button>

          <button
            onClick={() => setActiveTab('qr_print')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'qr_print'
                ? 'bg-white text-slate-900 shadow-lg'
                : 'bg-white/10 text-slate-200 hover:bg-white/20'
            }`}
          >
            <QrCode className={`w-4 h-4 ${activeTab === 'qr_print' ? 'text-blue-600' : ''}`} />
            <span>کیو آر کد و چاپ کارت ویزیت</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all relative cursor-pointer ${
              activeTab === 'orders'
                ? 'bg-white text-slate-900 shadow-lg'
                : 'bg-white/10 text-slate-200 hover:bg-white/20'
            }`}
          >
            <ShoppingBag className={`w-4 h-4 ${activeTab === 'orders' ? 'text-blue-600' : ''}`} />
            <span>سفارشات دریافتی از کارت</span>
            {pendingOrdersCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-rose-500 text-white font-mono text-[10px] flex items-center justify-center font-bold">
                {pendingOrdersCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('surveys')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all relative cursor-pointer ${
              activeTab === 'surveys'
                ? 'bg-white text-slate-900 shadow-lg'
                : 'bg-white/10 text-slate-200 hover:bg-white/20'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>نظرسنجی‌های دریافتی مشتریان</span>
            {totalSurveysCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-indigo-500 text-white font-mono text-[10px] flex items-center justify-center font-bold">
                {totalSurveysCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: ZILINK EDITOR & LIVE PREVIEW */}
      {activeTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Form: Profile Settings & Block List Editor */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* General Information Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  مشخصات عمومی و برندینگ زیلینک
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    نام و عنوان شرکت / کسب‌وکار *
                  </label>
                  <input
                    type="text"
                    value={config.companyTitle}
                    onChange={(e) => setConfig({ ...config, companyTitle: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="مثال: شرکت تولیدی لپان بافت"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    شناسه اختصاصی (Slug)
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-mono text-slate-400">zilink.ir/</span>
                    <input
                      type="text"
                      value={config.slug}
                      onChange={(e) => setConfig({ ...config, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-mono font-bold text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    شرح فعالیت / اسلوگان
                  </label>
                  <input
                    type="text"
                    value={config.companySubtitle}
                    onChange={(e) => setConfig({ ...config, companySubtitle: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="مثال: تولید انواع نخ پلی استر ، کش ، اسپندکس ، POY و ساپورت"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>آدرس دقیق کارخانه و دفتر جهت نمایش در کارت دیجیتال و vCard</span>
                    <span className="text-[10px] text-blue-600 font-bold">نمایش کامل روی لینک عمومی</span>
                  </label>
                  <textarea
                    rows={2}
                    value={config.addressText || ''}
                    onChange={(e) => setConfig({ ...config, addressText: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                    placeholder="مثال: زنجان، شهرک صنعتی، خیابان ششم، کارخانه تولیدی لپان بافت"
                  />
                </div>

                {/* Hidden File Inputs */}
                <input
                  type="file"
                  ref={avatarFileInputRef}
                  onChange={handleUploadAvatar}
                  accept="image/*"
                  className="hidden"
                />
                <input
                  type="file"
                  ref={coverFileInputRef}
                  onChange={handleUploadCover}
                  accept="image/*"
                  className="hidden"
                />

                {/* Avatar / Logo Upload & URL Box */}
                <div className="md:col-span-1 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      لوگو / آواتار شرکت
                    </label>
                    <button
                      type="button"
                      onClick={() => avatarFileInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>آپلود تصویر...</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 shrink-0 shadow-sm flex items-center justify-center relative group">
                      <img
                        src={processBioImageUrl(config.avatarUrl, '/lepan-logo.png')}
                        alt="Logo"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.onerror = null;
                          target.src = '/lepan-logo.png';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <input
                        type="text"
                        value={config.avatarUrl}
                        onChange={(e) => setConfig({ ...config, avatarUrl: e.target.value })}
                        placeholder="آدرس اینترنتی تصویر لوگو..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dir-ltr text-right"
                      />
                      {config.avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setConfig({ ...config, avatarUrl: '' })}
                          className="text-[10px] text-rose-500 font-bold hover:underline flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>حذف عکس و بازگشت به پیش‌فرض</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cover / Banner Upload & URL Box */}
                <div className="md:col-span-1 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      تصویر کاور / بنر بالایی
                    </label>
                    <button
                      type="button"
                      onClick={() => coverFileInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>آپلود تصویر...</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-20 h-14 rounded-2xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-800 shrink-0 shadow-sm flex items-center justify-center relative group">
                      <img
                        src={processBioImageUrl(config.coverUrl, '/lepan-logo.png')}
                        alt="Cover"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.onerror = null;
                          target.src = '/lepan-logo.png';
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <input
                        type="text"
                        value={config.coverUrl}
                        onChange={(e) => setConfig({ ...config, coverUrl: e.target.value })}
                        placeholder="آدرس اینترنتی بنر کاور..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dir-ltr text-right"
                      />
                      {config.coverUrl && (
                        <button
                          type="button"
                          onClick={() => setConfig({ ...config, coverUrl: '' })}
                          className="text-[10px] text-rose-500 font-bold hover:underline flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>حذف عکس و بازگشت به پیش‌فرض</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Block Management Section */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-600" />
                  <h3 className="font-black text-sm text-slate-900 dark:text-white">
                    بلوک‌ها و دکمه‌های صفحه ({config.blocks?.length || 0} بلوک)
                  </h3>
                </div>

                {canManage && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleOpenAddBlock('neshan')}
                      className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-[11px] font-bold hover:bg-rose-100"
                    >
                      + نشان
                    </button>
                    <button
                      onClick={() => handleOpenAddBlock('balad')}
                      className="px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[11px] font-bold hover:bg-indigo-100"
                    >
                      + بلد
                    </button>
                    <button
                      onClick={() => handleOpenAddBlock('phone')}
                      className="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-[11px] font-bold hover:bg-blue-100"
                    >
                      + تلفن
                    </button>
                    <button
                      onClick={() => handleOpenAddBlock('whatsapp')}
                      className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[11px] font-bold hover:bg-emerald-100 cursor-pointer"
                    >
                      + واتساپ
                    </button>
                    <button
                      onClick={() => handleOpenAddBlock()}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-1 shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>افزودن بلوک جدید</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Blocks List */}
              <div className="space-y-2.5">
                {(config.blocks || []).map((block, index) => (
                  <div
                    key={block.id}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      block.isActive
                        ? 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                        : 'bg-slate-100/50 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Reorder buttons */}
                      <div className="flex flex-col gap-1">
                        <button
                          disabled={index === 0}
                          onClick={() => handleMoveBlock(index, 'up')}
                          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 disabled:opacity-20"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          disabled={index === (config.blocks?.length || 0) - 1}
                          onClick={() => handleMoveBlock(index, 'down')}
                          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 disabled:opacity-20"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                            {block.title}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                            {block.category === 'maps' ? 'مسیریاب' : block.category === 'phones' ? 'تلفن' : block.category === 'socials' ? 'شبکه اجتماعی' : block.category === 'emails' ? 'ایمیل' : block.category === 'catalog' ? 'کاتالوگ' : block.category === 'order_form' ? 'سفارش' : 'لینک'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 max-w-xs truncate dir-ltr text-right">
                          {block.value}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {canManage ? (
                        <>
                          <button
                            onClick={() => handleToggleBlockActive(block.id)}
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold border transition-colors ${
                              block.isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800'
                            }`}
                          >
                            {block.isActive ? 'فعال' : 'غیرفعال'}
                          </button>

                          <button
                            onClick={() => handleOpenEditBlock(block)}
                            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="ویرایش بلوک"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteBlock(block.id)}
                            className="p-2 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                            title="حذف بلوک"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold border ${
                          block.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800'
                        }`}>
                          {block.isActive ? 'فعال' : 'غیرفعال'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column: Live Interactive Smartphone Simulator */}
          <div className="lg:col-span-5 sticky top-6">
            <div className="bg-slate-900 dark:bg-black rounded-[40px] p-4 shadow-2xl border-4 border-slate-800 max-w-sm mx-auto overflow-hidden">
              <div className="w-32 h-4 bg-slate-800 rounded-full mx-auto mb-3" />
              <div className="rounded-[28px] overflow-hidden bg-slate-100 dark:bg-slate-950 max-h-[620px] overflow-y-auto">
                <PublicBioPage config={config} isEmbeddedPreview={true} />
              </div>
            </div>
            <div className="text-center text-xs text-slate-400 font-medium mt-3">
              پیش‌نمایش زنده کارت دیجیتال روی موبایل
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: QR CODE & BUSINESS CARD PRINTING */}
      {activeTab === 'qr_print' && (
        <div className="space-y-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Options Controls */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Palette className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  تنظیمات ظاهری QR کد و چاپ
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    اندازه کیو آر کد (پیکسل): {qrSize}px
                  </label>
                  <input
                    type="range"
                    min="200"
                    max="500"
                    step="20"
                    value={qrSize}
                    onChange={(e) => setQrSize(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رنگ کد QR
                  </label>
                  <div className="flex items-center gap-2">
                    {['#0f172a', '#1e40af', '#065f46', '#9f1239', '#581c87'].map(color => (
                      <button
                        key={color}
                        onClick={() => setQrColor(color)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          qrColor === color ? 'border-blue-500 scale-110 shadow-md' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={qrColor}
                      onChange={(e) => setQrColor(e.target.value)}
                      className="w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    جایگذاری لوگوی شرکت در مرکز QR کد
                  </span>
                  <input
                    type="checkbox"
                    checked={embedLogo}
                    onChange={(e) => setEmbedLogo(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                  />
                </div>

                <div className="pt-2 space-y-2">
                  <button
                    onClick={handleDownloadQR}
                    className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 active:scale-98 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>دانلود تصویر QR کد با کیفیت بالا (PNG)</span>
                  </button>

                  <button
                    onClick={handlePrintStandaloneQR}
                    className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 active:scale-98 transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    <span>چاپ اختصاصی و شیک QR کد LEPAN</span>
                  </button>

                  <button
                    onClick={handlePrintCard}
                    className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
                  >
                    <Printer className="w-4 h-4" />
                    <span>چاپ کارت ویزیت کامل دو رو</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Side: Printable Business Card Preview */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Printer className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-black text-sm text-slate-900 dark:text-white">
                      پیش‌نمایش کارت ویزیت آماده چاپ (دو رو)
                    </h3>
                  </div>
                  <span className="text-[11px] font-bold text-slate-400">ابعاد استاندارد: 9x5 cm</span>
                </div>

                {/* Card Container for Printing */}
                <div ref={cardPrintRef} className="space-y-6 flex flex-col items-center">
                  
                  {/* FRONT SIDE OF BUSINESS CARD */}
                  <div className="w-full max-w-[380px] min-h-[220px] bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 text-white rounded-2xl p-5 shadow-2xl relative overflow-hidden border border-slate-800 flex flex-col justify-between shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={config.avatarUrl || '/lepan-logo.png'}
                          alt="Logo"
                          className="w-12 h-12 rounded-xl object-cover bg-white p-1"
                        />
                        <div>
                          <div className="font-black text-sm text-white">
                            {config.companyTitle}
                          </div>
                          <div className="text-[9px] text-blue-200 mt-0.5">
                            {config.companySubtitle}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1 text-[10px] text-slate-300 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-blue-400" />
                        <span>فروش: ۰۹۱۲۰۲۴۴۱۵۹ / مدیریت: ۰۹۱۲۵۰۸۸۴۷۴</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3 h-3 text-blue-400" />
                        <span>{config.blocks.find(b => b.category === 'emails')?.value || 'lepanbaft55@gmail.com'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-blue-400" />
                        <span className="line-clamp-1">{config.addressText || 'تهران، بازار، خیابان خیام'}</span>
                      </div>
                    </div>
                  </div>

                  {/* BACK SIDE OF BUSINESS CARD (WITH QR CODE) */}
                  <div className="w-full max-w-[380px] min-h-[220px] bg-white text-slate-900 rounded-2xl p-5 shadow-2xl relative overflow-hidden border border-slate-200 flex items-center justify-between shrink-0">
                    <div className="flex-1 space-y-2 pl-3">
                      <div className="font-black text-sm text-slate-900">
                        مسیریابی و ارتباط آنلاین
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                        جهت مشاهده مسیر در نشان و بلد، شماره تلفن‌ها، اینستاگرام و ثبت سفارش آنلاین کیو آر کد را اسکن کنید.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[9px] px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 font-bold">مسیریاب نشان</span>
                        <span className="text-[9px] px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 font-bold">مسیریاب بلد</span>
                      </div>
                    </div>

                    <div className="w-32 h-32 bg-slate-50 p-2 rounded-2xl border border-slate-200 flex flex-col items-center justify-center shrink-0">
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="QR Code" className="w-full h-full object-contain" />
                      ) : (
                        <QrCode className="w-12 h-12 text-slate-400 animate-pulse" />
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* TAB 3: RECEIVED CUSTOMER ORDERS */}
      {activeTab === 'orders' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-600" />
              <h3 className="font-black text-sm text-slate-900 dark:text-white">
                سفارشات و استعلام‌های ثبت‌شده از کیو آر کد ({config.orders?.length || 0} درخواست)
              </h3>
            </div>
          </div>

          {(!config.orders || config.orders.length === 0) ? (
            <div className="py-16 text-center text-slate-400 text-xs font-bold">
              هنوز هیچ سفارشی از سمت مشتریان اسکن کننده QR کد ثبت نشده است.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">نام خریدار</th>
                    <th className="py-3 px-4">شماره تماس</th>
                    <th className="py-3 px-4">کالای درخواستی</th>
                    <th className="py-3 px-4">مقدار</th>
                    <th className="py-3 px-4">توضیحات</th>
                    <th className="py-3 px-4">تاریخ ثبت</th>
                    <th className="py-3 px-4">وضعیت</th>
                    <th className="py-3 px-4 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {config.orders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {ord.customerName}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-blue-600 dir-ltr text-right">
                        <a href={`tel:${ord.customerPhone}`} className="hover:underline flex items-center gap-1">
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>{ord.customerPhone}</span>
                        </a>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                        {ord.productTitle || '-'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                        {ord.quantity || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={ord.notes}>
                        {ord.notes || '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(ord.createdAt).toLocaleDateString('fa-IR')}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={ord.status}
                          onChange={(e) => handleOrderStatusChange(ord.id, e.target.value as any)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border focus:outline-none ${
                            ord.status === 'pending'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
                              : ord.status === 'contacted'
                              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          <option value="pending">در انتظار تماس</option>
                          <option value="contacted">تماس گرفته شد</option>
                          <option value="completed">تکمیل شده</option>
                          <option value="cancelled">لغو شده</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleDeleteOrder(ord.id)}
                          className="p-1.5 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50"
                          title="حذف سفارش"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* TAB 4: RECEIVED SURVEYS LIST */}
      {activeTab === 'surveys' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <h3 className="font-black text-sm text-slate-900 dark:text-white">
                نظرسنجی‌ها و ارزیابی‌های ثبت‌شده از مشتریان ({config.surveys?.length || 0} نظر)
              </h3>
            </div>
          </div>
          {(!config.surveys || config.surveys.length === 0) ? (
            <div className="py-16 text-center text-slate-400 text-xs font-bold">
              هنوز هیچ نظرسنجی ثبت نشده است. (مشتریان پس از خروج بار یا اسکن QR کد می‌توانند نظر خود را ثبت کنند)
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {config.surveys.map((srv) => (
                <div key={srv.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">{srv.customerName || 'مشتری ناشناس'}</h4>
                      {srv.customerPhone && (
                        <span className="text-[11px] font-mono text-blue-600 font-bold dir-ltr block mt-0.5">{srv.customerPhone}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(srv.createdAt).toLocaleDateString('fa-IR')}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                    <div>
                      <span className="block text-[10px] text-slate-500 font-bold">کیفیت محصول</span>
                      <span className="text-xs font-black text-amber-500">{srv.qualityRating} / ۵ ⭐</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-500 font-bold">سرعت تحویل</span>
                      <span className="text-xs font-black text-amber-500">{srv.deliveryRating} / ۵ ⭐</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-500 font-bold">پشتیبانی</span>
                      <span className="text-xs font-black text-amber-500">{srv.supportRating} / ۵ ⭐</span>
                    </div>
                  </div>

                  {srv.comment && (
                    <div className="text-xs text-slate-700 dark:text-slate-300 bg-amber-50/50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200/50 dark:border-amber-900/50">
                      <span className="font-bold text-[10px] text-amber-800 dark:text-amber-400 block mb-0.5">نظر / پیشنهاد:</span>
                      <p className="leading-relaxed">{srv.comment}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Block Modal */}
      {blockModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in dir-rtl">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl relative space-y-4">
            <button
              onClick={() => setBlockModalOpen(false)}
              className="absolute top-4 left-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Plus className="w-5 h-5 text-blue-600" />
              <h3 className="font-black text-sm text-slate-900 dark:text-white">
                {editingBlock ? 'ویرایش بلوک' : 'افزودن بلوک جدید به زیلینک'}
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  دسته‌بندی و نوع بلوک
                </label>
                <select
                  value={blockForm.category}
                  onChange={(e) => setBlockForm({ ...blockForm, category: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="maps">🗺️ مسیریاب و نقشه (نشان، بلد، گوگل مپس)</option>
                  <option value="phones">📞 شماره تلفن / موبایل (مدیریت، فروش، دفتر)</option>
                  <option value="emails">📧 ایمیل رسمی</option>
                  <option value="socials">📸 شبکه اجتماعی (اینستاگرام، تلگرام، ایتا، بله)</option>
                  <option value="catalog">📄 فایل / کاتالوگ محصولات (PDF)</option>
                  <option value="order_form">🛒 فرم ثبت سفارش آنلاین</option>
                  <option value="survey">⭐ فرم نظرسنجی رضایت مشتری</option>
                  <option value="custom">🌐 لینک دلخواه / وب‌سایت</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  عنوان بلوک *
                </label>
                <input
                  type="text"
                  required
                  value={blockForm.title}
                  onChange={(e) => setBlockForm({ ...blockForm, title: e.target.value })}
                  placeholder="مثال: مسیریاب نشان یا مدیریت: فتوت"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  توضیح کوتاه / زیرعنوان
                </label>
                <input
                  type="text"
                  value={blockForm.subtitle}
                  onChange={(e) => setBlockForm({ ...blockForm, subtitle: e.target.value })}
                  placeholder="مثال: تماس مستقیم با واحد فروش"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  مقدار / آدرس لینک {blockForm.category === 'catalog' ? 'یا آپلود مستقیم فایل PDF / کاتالوگ' : '*'}
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    required={blockForm.category !== 'catalog'}
                    value={blockForm.value}
                    onChange={(e) => setBlockForm({ ...blockForm, value: e.target.value })}
                    placeholder="مثال: https://... یا آپلود فایل زیر"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 dir-ltr text-right"
                  />
                  {blockForm.category === 'catalog' && (
                    <div className="flex items-center gap-2">
                      <label className="flex-1 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold border border-amber-200 dark:border-amber-800 flex items-center justify-center gap-2 cursor-pointer transition-all">
                        <Upload size={15} />
                        <span>انتخاب و آپلود مستقیم فایل کاتالوگ (PDF / تصویر)</span>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              toast('در حال آپلود فایل کاتالوگ...');
                              const result = await uploadFileChunked(file, () => {});
                              setBlockForm({ 
                                ...blockForm, 
                                value: result.url,
                                title: blockForm.title || file.name.replace(/\.[^/.]+$/, "")
                              });
                              toast.success('فایل با موفقیت آپلود و لینک شد.');
                            } catch (err: any) {
                              toast.error('خطا در آپلود فایل: ' + (err.message || ''));
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    آیکون
                  </label>
                  <select
                    value={blockForm.iconName}
                    onChange={(e) => setBlockForm({ ...blockForm, iconName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="neshan">نشان</option>
                    <option value="balad">بلد</option>
                    <option value="google_maps">گوگل مپس</option>
                    <option value="mobile">موبایل</option>
                    <option value="phone">تلفن ثابت</option>
                    <option value="email">ایمیل</option>
                    <option value="instagram">اینستاگرام</option>
                    <option value="file">فایل / کاتالوگ</option>
                    <option value="order">سفارش</option>
                    <option value="globe">وب‌سایت</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رنگ دکمه
                  </label>
                  <select
                    value={blockForm.colorTheme}
                    onChange={(e) => setBlockForm({ ...blockForm, colorTheme: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="blue">آبی (Blue)</option>
                    <option value="rose">قرمز (Rose)</option>
                    <option value="indigo">نیلی (Indigo)</option>
                    <option value="emerald">سبز (Emerald)</option>
                    <option value="purple">بنفش (Purple)</option>
                    <option value="amber">نارنجی (Amber)</option>
                    <option value="slate">ساده (Slate)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setBlockModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveBlockForm}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md"
              >
                {editingBlock ? 'بروزرسانی بلوک' : 'افزودن بلوک'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
