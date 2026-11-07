import React, { useState, useMemo } from 'react';
import { TradeRecord, TradeAttachment, User } from '../../types';
import { TradeAttachmentSection } from './TradeAttachmentSection';
import { FileViewerModal } from '../FileViewerModal';
import { downloadAndOpenFile } from '../../services/fileService';
import { openSendToChat } from '../../services/chatShareService';
import { deleteUploadedFile } from '../../services/storageService';
import { resolveImageUrl } from '../../services/apiService';
import { getDisplayFileName } from '../../utils/fileNameUtils';
import { formatDate } from '../../constants';
import { 
  Paperclip, 
  Search, 
  Filter, 
  Eye, 
  Download, 
  Share2, 
  Trash2, 
  FileText, 
  Image as ImageIcon, 
  Plus, 
  FolderOpen, 
  CheckCircle2, 
  Layers, 
  Clock, 
  Calendar, 
  FileCheck,
  Building2,
  Ship,
  Coins,
  Shield,
  Truck,
  Leaf,
  Microscope,
  Warehouse,
  Calculator,
  Grid,
  List
} from 'lucide-react';

interface TradeAllAttachmentsTabProps {
  record: TradeRecord;
  onUpdateRecord: (updated: TradeRecord) => Promise<void> | void;
  currentUser?: User;
}

const CATEGORIES = [
  { key: 'all', label: 'همه بخش‌ها', icon: Layers, color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { key: 'commercial/proforma', label: 'پروفرما و مجوزها', icon: FileText, color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  { key: 'commercial/petrochemical', label: 'خرید پتروشیمی و بورس', icon: Building2, color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  { key: 'commercial/insurance', label: 'بیمه و الحاقیه‌ها', icon: Shield, color: 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300' },
  { key: 'commercial/allocation', label: 'صف و تخصیص ارز', icon: Clock, color: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  { key: 'commercial/currency', label: 'خرید ارز و صرافی', icon: Coins, color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  { key: 'commercial/shipping', label: 'اسناد حمل (اینویس/بارنامه)', icon: Ship, color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  { key: 'commercial/inspection', label: 'گواهی بازرسی (COI)', icon: Microscope, color: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300' },
  { key: 'commercial/clearance', label: 'ترخیصیه و قبض انبار', icon: Warehouse, color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' },
  { key: 'commercial/green_leaf', label: 'برگ سبز و کوتاژ', icon: Leaf, color: 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300' },
  { key: 'commercial/internal_shipping', label: 'حمل داخلی و باسکول', icon: Truck, color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' },
  { key: 'commercial/agent_fees', label: 'هزینه‌های ترخیص و ایجنت', icon: FileCheck, color: 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300' },
  { key: 'commercial/final_calculation', label: 'محاسبه نهایی و تسویه', icon: Calculator, color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  { key: 'commercial/timeline', label: 'تایم‌لاین مراحل', icon: Clock, color: 'bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300' },
];

export const TradeAllAttachmentsTab: React.FC<TradeAllAttachmentsTabProps> = ({
  record,
  onUpdateRecord,
  currentUser
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'image' | 'pdf'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewLayout, setViewLayout] = useState<'grid' | 'list'>('grid');
  
  // Preview Modal state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerName, setViewerName] = useState('');
  const [viewerType, setViewerType] = useState<'image' | 'pdf' | 'auto'>('auto');

  // Aggregated attachments list across record.attachments + insuranceData + stages + shippingDocuments
  const allAttachments = useMemo(() => {
    const list: TradeAttachment[] = [];
    const seen = new Set<string>();

    const addIfNew = (att: TradeAttachment) => {
      if (!att || !att.url) return;
      const key = `${att.url}_${att.fileName}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(att);
      }
    };

    // 1. Direct record attachments
    (record.attachments || []).forEach(addIfNew);

    // 2. Insurance attachments
    (record.insuranceData?.attachments || []).forEach(att => {
      addIfNew({
        ...att,
        category: att.category || 'commercial/insurance'
      });
    });

    // 3. Stage attachments
    if (record.stages) {
      Object.entries(record.stages).forEach(([stageName, stageData]) => {
        if (stageData?.attachments) {
          stageData.attachments.forEach(rawAtt => {
            addIfNew({
              id: `stage_${stageName}_${rawAtt.fileName}`,
              fileName: rawAtt.fileName,
              url: rawAtt.url,
              category: `commercial/timeline/${stageName}`,
              uploadedAt: stageData.updatedAt || Date.now(),
              uploadedBy: stageData.updatedBy || 'کاربر',
              description: `مربوط به مرحله ${stageName}`
            });
          });
        }
      });
    }

    // 4. Shipping documents attachments
    if (record.shippingDocuments) {
      record.shippingDocuments.forEach(doc => {
        if (doc.attachments) {
          doc.attachments.forEach(rawAtt => {
            addIfNew({
              id: `ship_${doc.id}_${rawAtt.fileName}`,
              fileName: rawAtt.fileName,
              url: rawAtt.url,
              category: 'commercial/shipping',
              subCategory: (doc as any).documentType || doc.type || 'اسناد حمل',
              refId: doc.id,
              uploadedAt: Date.now(),
              uploadedBy: 'کاربر',
              description: `سند حمل: ${doc.documentNumber || (doc as any).documentType || doc.type || ''}`
            });
          });
        }
      });
    }

    return list;
  }, [record]);

  // Filtered Attachments
  const filteredAttachments = useMemo(() => {
    return allAttachments.filter(att => {
      // Category filter
      if (selectedCategory !== 'all') {
        if (!att.category || !att.category.startsWith(selectedCategory)) {
          return false;
        }
      }

      // Type filter
      const isImage = att.fileType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.fileName) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.url);
      const isPdf = att.fileType === 'application/pdf' || /\.pdf$/i.test(att.fileName) || /\.pdf$/i.test(att.url);

      if (selectedTypeFilter === 'image' && !isImage) return false;
      if (selectedTypeFilter === 'pdf' && !isPdf) return false;

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesName = att.fileName?.toLowerCase().includes(query);
        const matchesDesc = att.description?.toLowerCase().includes(query);
        const matchesUploader = att.uploadedBy?.toLowerCase().includes(query);
        const matchesSubCat = att.subCategory?.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc && !matchesUploader && !matchesSubCat) return false;
      }

      return true;
    });
  }, [allAttachments, selectedCategory, selectedTypeFilter, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const total = allAttachments.length;
    let images = 0;
    let pdfs = 0;
    let totalBytes = 0;

    allAttachments.forEach(a => {
      const isImg = a.fileType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(a.fileName) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(a.url);
      const isP = a.fileType === 'application/pdf' || /\.pdf$/i.test(a.fileName) || /\.pdf$/i.test(a.url);
      if (isImg) images++;
      if (isP) pdfs++;
      if (a.fileSize) totalBytes += a.fileSize;
    });

    return { total, images, pdfs, totalBytes };
  }, [allAttachments]);

  const handleOpenPreview = (att: TradeAttachment) => {
    const isImage = att.fileType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.fileName) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.url);
    const isPdf = att.fileType === 'application/pdf' || /\.pdf$/i.test(att.fileName) || /\.pdf$/i.test(att.url);

    setViewerUrl(att.url);
    setViewerName(att.fileName);
    setViewerType(isImage ? 'image' : isPdf ? 'pdf' : 'auto');
    setViewerOpen(true);
  };

  const handleDeleteAttachment = async (attToDelete: TradeAttachment) => {
    if (!window.confirm(`آیا از حذف پیوست "${attToDelete.fileName}" از سرور و پرونده اطمینان دارید؟`)) {
      return;
    }

    try {
      if (attToDelete.url) {
        await deleteUploadedFile(attToDelete.url);
      }
    } catch (e) {
      console.warn("Could not delete physical file:", e);
    }

    const updatedDirect = (record.attachments || []).filter(a => a.url !== attToDelete.url && a.id !== attToDelete.id);
    const updatedRecord = { ...record, attachments: updatedDirect };
    await onUpdateRecord(updatedRecord);
  };

  const handleAttachmentsUploaded = async (newAttachments: TradeAttachment[]) => {
    const current = record.attachments || [];
    const merged = [...current, ...newAttachments];
    await onUpdateRecord({ ...record, attachments: merged });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCategoryLabel = (catStr?: string) => {
    if (!catStr) return 'عمومی';
    const found = CATEGORIES.find(c => c.key !== 'all' && catStr.startsWith(c.key));
    if (found) return found.label;
    if (catStr.includes('proforma')) return 'پروفرما';
    if (catStr.includes('insurance')) return 'بیمه';
    if (catStr.includes('allocation')) return 'تخصیص ارز';
    if (catStr.includes('currency')) return 'خرید ارز';
    if (catStr.includes('shipping')) return 'اسناد حمل';
    if (catStr.includes('inspection')) return 'بازرسی';
    if (catStr.includes('clearance')) return 'ترخیصیه';
    if (catStr.includes('green_leaf')) return 'برگ سبز';
    if (catStr.includes('internal_shipping')) return 'حمل داخلی';
    if (catStr.includes('agent_fees')) return 'هزینه‌های ترخیص';
    if (catStr.includes('petrochemical')) return 'پتروشیمی و بورس';
    if (catStr.includes('final_calculation')) return 'محاسبه نهایی';
    if (catStr.includes('timeline')) return 'تایم‌لاین';
    return catStr.replace('commercial/', '');
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel p-4 rounded-2xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-900 dark:text-purple-300">کل پیوست‌ها</span>
            <Paperclip size={18} className="text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-purple-900 dark:text-purple-100">
            {stats.total} <span className="text-xs font-normal">فایل</span>
          </div>
          <span className="text-[10px] text-purple-700/70 dark:text-purple-400 mt-1 block">
            حجم کل: {formatFileSize(stats.totalBytes) || '---'}
          </span>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 dark:text-blue-300">تصاویر و عکس‌ها</span>
            <ImageIcon size={18} className="text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-blue-900 dark:text-blue-100">
            {stats.images} <span className="text-xs font-normal">تصویر</span>
          </div>
          <span className="text-[10px] text-blue-700/70 dark:text-blue-400 mt-1 block">
            با پیش‌نمایش کیفیت بالا
          </span>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-900 dark:text-rose-300">اسناد PDF</span>
            <FileText size={18} className="text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-rose-900 dark:text-rose-100">
            {stats.pdfs} <span className="text-xs font-normal">سند PDF</span>
          </div>
          <span className="text-[10px] text-rose-700/70 dark:text-rose-400 mt-1 block">
            با مرورگر داخلی PDF
          </span>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">محل ذخیره‌سازی</span>
            <FolderOpen size={18} className="text-emerald-600" />
          </div>
          <div className="mt-2 text-xs font-bold font-mono text-emerald-900 dark:text-emerald-100 truncate" dir="ltr">
            uploads/commercial/*
          </div>
          <span className="text-[10px] text-emerald-700/80 dark:text-emerald-400 mt-1 block">
            ذخیره روی فایل سرور (نه دیتابیس)
          </span>
        </div>
      </div>

      {/* Upload Zone to specific category */}
      <div className="glass-panel p-5 rounded-2xl shadow-xs border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-xl">
              <Plus size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">بارگذاری پیوست جدید (عکس و PDF)</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">فایل‌ها بر اساس دسته‌بندی انتخابی در پوشه مربوطه ذخیره می‌شوند</p>
            </div>
          </div>
        </div>

        <TradeAttachmentSection
          attachments={[]}
          onAttachmentsChange={handleAttachmentsUploaded}
          category={selectedCategory === 'all' ? 'commercial/general' : selectedCategory}
          title=""
          description=""
          currentUser={currentUser}
          compact={false}
          badgeCount={false}
        />
      </div>

      {/* Search & Category Filter Section */}
      <div className="space-y-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 custom-scrollbar">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.key;
            const count = cat.key === 'all' 
              ? allAttachments.length 
              : allAttachments.filter(a => a.category?.startsWith(cat.key)).length;

            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  isSelected 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-600/20' 
                    : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                }`}
              >
                <Icon size={14} className={isSelected ? 'text-white' : 'text-gray-500'} />
                <span>{cat.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter bar: Search + Type Filter + View Layout Switcher */}
        <div className="glass-panel p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو در نام فایل، توضیحات، ثبت‌کننده..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          </div>

          <div className="flex items-center gap-2">
            {/* Type Filter Buttons */}
            <div className="flex bg-gray-100 dark:bg-gray-900 p-0.5 rounded-xl border border-gray-200 dark:border-gray-800 text-xs">
              <button
                type="button"
                onClick={() => setSelectedTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  selectedTypeFilter === 'all' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-2xs' : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                همه ({allAttachments.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedTypeFilter('image')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  selectedTypeFilter === 'image' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-2xs' : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                <ImageIcon size={12} />
                <span>تصاویر ({stats.images})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTypeFilter('pdf')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  selectedTypeFilter === 'pdf' ? 'bg-white dark:bg-gray-800 text-red-600 shadow-2xs' : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                <FileText size={12} />
                <span>PDF ({stats.pdfs})</span>
              </button>
            </div>

            {/* Layout switch */}
            <div className="flex bg-gray-100 dark:bg-gray-900 p-0.5 rounded-xl border border-gray-200 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setViewLayout('grid')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewLayout === 'grid' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-2xs' : 'text-gray-500'}`}
                title="نمایش شبکه‌ای"
              >
                <Grid size={14} />
              </button>
              <button
                type="button"
                onClick={() => setViewLayout('list')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewLayout === 'list' ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-2xs' : 'text-gray-500'}`}
                title="نمایش جدولی"
              >
                <List size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Attachments Display Section */}
      {filteredAttachments.length > 0 ? (
        viewLayout === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredAttachments.map((att, idx) => {
              const isImage = att.fileType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.fileName) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.url);
              const isPdf = att.fileType === 'application/pdf' || /\.pdf$/i.test(att.fileName) || /\.pdf$/i.test(att.url);
              const resolvedUrl = resolveImageUrl(att.url);
              const categoryLabel = getCategoryLabel(att.category);

              return (
                <div
                  key={att.id || idx}
                  className="group relative glass-panel rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-gray-800/90 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col"
                >
                  {/* Thumbnail / Header Area */}
                  <div
                    onClick={() => handleOpenPreview(att)}
                    className="relative w-full h-36 bg-gray-100 dark:bg-gray-900 cursor-pointer overflow-hidden flex items-center justify-center border-b border-gray-100 dark:border-gray-800"
                  >
                    {isImage ? (
                      <img
                        src={resolvedUrl}
                        alt={att.fileName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1 text-red-500 dark:text-red-400">
                        <FileText size={42} />
                        <span className="text-xs font-bold font-mono">PDF DOCUMENT</span>
                      </div>
                    )}

                    {/* Preview overlay hover icon */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-xs">
                      <Eye size={16} />
                      <span>مشاهده پیش‌نمایش</span>
                    </div>

                    {/* Category Badge on Top */}
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-white/90 dark:bg-gray-900/90 text-gray-800 dark:text-gray-200 backdrop-blur-xs border border-gray-200 dark:border-gray-700 shadow-2xs">
                      {categoryLabel}
                    </span>

                    {/* File Type indicator */}
                    <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-black font-mono uppercase text-white ${
                      isPdf ? 'bg-red-600' : isImage ? 'bg-blue-600' : 'bg-gray-600'
                    }`}>
                      {isPdf ? 'PDF' : isImage ? 'IMG' : 'DOC'}
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                    <div>
                      {(() => {
                        const displayFileName = getDisplayFileName(att.fileName, att.url);
                        return (
                          <span 
                            onClick={() => handleOpenPreview(att)} 
                            className="text-xs font-bold text-gray-900 dark:text-gray-100 block break-words line-clamp-2 cursor-pointer hover:text-blue-600 leading-relaxed" 
                            title={displayFileName}
                            dir="auto"
                          >
                            {displayFileName}
                          </span>
                        );
                      })()}
                      {att.description && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                          {att.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">
                      <span>{att.fileSize ? formatFileSize(att.fileSize) : '---'}</span>
                      <span>{att.uploadedAt ? formatDate(att.uploadedAt) : ''}</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between gap-1 pt-1">
                      {(() => {
                        const displayFileName = getDisplayFileName(att.fileName, att.url);
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenPreview(att)}
                              className="flex-1 py-1.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                              title="پیش‌نمایش"
                            >
                              <Eye size={13} />
                              <span>پیش‌نمایش</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => downloadAndOpenFile(att.url, displayFileName)}
                              className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors cursor-pointer"
                              title="دانلود"
                            >
                              <Download size={14} />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                openSendToChat({
                                  fileUrl: att.url,
                                  fileName: displayFileName,
                                  title: `ارسال پیوست ${categoryLabel} به چت`,
                                  defaultMessage: `📎 فایل پیوست بازرگانی (${categoryLabel}): ${displayFileName}`
                                });
                              }}
                              className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                              title="ارسال به چت"
                            >
                              <Share2 size={14} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteAttachment(att)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                              title="حذف پیوست"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-panel rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                  <tr>
                    <th className="p-3">نوع</th>
                    <th className="p-3">نام فایل</th>
                    <th className="p-3">بخش / دسته‌بندی</th>
                    <th className="p-3">توضیحات</th>
                    <th className="p-3">حجم</th>
                    <th className="p-3">ثبت‌کننده</th>
                    <th className="p-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredAttachments.map((att, idx) => {
                    const isImage = att.fileType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.fileName) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.url);
                    const isPdf = att.fileType === 'application/pdf' || /\.pdf$/i.test(att.fileName) || /\.pdf$/i.test(att.url);
                    const categoryLabel = getCategoryLabel(att.category);

                    return (
                      <tr key={att.id || idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="p-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] ${
                            isPdf ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' : isImage ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {isPdf ? 'PDF' : isImage ? 'IMG' : 'DOC'}
                          </div>
                        </td>
                        <td className="p-3 font-bold text-gray-900 dark:text-gray-100">
                          {(() => {
                            const displayFileName = getDisplayFileName(att.fileName, att.url);
                            return (
                              <button
                                type="button"
                                onClick={() => handleOpenPreview(att)}
                                className="hover:underline hover:text-blue-600 text-right font-medium"
                                dir="auto"
                                title={displayFileName}
                              >
                                {displayFileName}
                              </button>
                            );
                          })()}
                        </td>
                        <td className="p-3">
                          <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md font-bold text-gray-800 dark:text-gray-200">
                            {categoryLabel}
                          </span>
                        </td>
                        <td className="p-3 text-gray-500 max-w-xs truncate">{att.description || '---'}</td>
                        <td className="p-3 font-mono">{formatFileSize(att.fileSize)}</td>
                        <td className="p-3 text-gray-500">{att.uploadedBy || 'کاربر'}</td>
                        <td className="p-3 text-center">
                          <div className="flex justify-center items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenPreview(att)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg cursor-pointer"
                              title="پیش‌نمایش"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadAndOpenFile(att.url, att.fileName)}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg cursor-pointer"
                              title="دانلود"
                            >
                              <Download size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                openSendToChat({
                                  fileUrl: att.url,
                                  fileName: att.fileName,
                                  title: `ارسال پیوست ${categoryLabel} به چت`,
                                  defaultMessage: `📎 فایل پیوست بازرگانی (${categoryLabel}): ${att.fileName}`
                                });
                              }}
                              className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg cursor-pointer"
                              title="ارسال به چت"
                            >
                              <Share2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAttachment(att)}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="glass-panel p-12 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 text-center space-y-3">
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-full flex items-center justify-center mx-auto">
            <Paperclip size={24} />
          </div>
          <h4 className="font-bold text-gray-700 dark:text-gray-300 text-sm">هیچ پیوستی در این بخش یافت نشد</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            می‌توانید با استفاده از کادر آپلود بالا، تصاویر فاکتورها، رسیدها و فایل‌های PDF را به این پرونده ضمیمه فرمایید.
          </p>
        </div>
      )}

      {/* Global Preview Modal */}
      {viewerOpen && (
        <FileViewerModal
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          fileUrl={viewerUrl}
          fileName={viewerName}
          fileType={viewerType}
        />
      )}
    </div>
  );
};

export default TradeAllAttachmentsTab;
