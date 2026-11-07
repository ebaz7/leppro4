import React, { useState, useRef } from 'react';
import { TradeAttachment } from '../../types';
import { uploadTradeAttachment, deleteUploadedFile } from '../../services/storageService';
import { downloadAndOpenFile } from '../../services/fileService';
import { openSendToChat } from '../../services/chatShareService';
import { resolveImageUrl } from '../../services/apiService';
import { getDisplayFileName } from '../../utils/fileNameUtils';
import { FileViewerModal } from '../FileViewerModal';
import { 
  Paperclip, 
  Upload, 
  Trash2, 
  Eye, 
  Download, 
  Share2, 
  FileText, 
  Image as ImageIcon, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Plus,
  X,
  FileCheck,
  FolderOpen
} from 'lucide-react';
import { formatDate } from '../../constants';

interface TradeAttachmentSectionProps {
  attachments: TradeAttachment[];
  onAttachmentsChange: (updated: TradeAttachment[]) => void;
  category: string; // e.g. 'commercial/proforma', 'commercial/insurance', 'commercial/shipping', etc.
  title?: string;
  description?: string;
  currentUser?: { fullName?: string; username?: string };
  readOnly?: boolean;
  compact?: boolean;
  subCategory?: string;
  refId?: string;
  className?: string;
  badgeCount?: boolean;
}

export const TradeAttachmentSection: React.FC<TradeAttachmentSectionProps> = ({
  attachments = [],
  onAttachmentsChange,
  category = 'commercial/general',
  title = 'پیوست‌ها و مستندات (تصویر و PDF)',
  description = 'امکان آپلود تصاویر فاکتورها، رسیدها و فایل‌های PDF با پیش‌نمایش فوری',
  currentUser,
  readOnly = false,
  compact = false,
  subCategory,
  refId,
  className = '',
  badgeCount = true
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  
  // Preview Modal state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerName, setViewerName] = useState('');
  const [viewerType, setViewerType] = useState<'image' | 'pdf' | 'auto'>('auto');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter attachments if refId or subCategory is scoped, otherwise show relevant
  const filteredAttachments = React.useMemo(() => {
    if (!Array.isArray(attachments)) return [];
    return attachments.filter(att => {
      if (refId && att.refId && att.refId !== refId) return false;
      if (subCategory && att.subCategory && att.subCategory !== subCategory) return false;
      return true;
    });
  }, [attachments, refId, subCategory]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || readOnly) return;
    setIsUploading(true);
    setUploadError(null);

    const uploadedList: TradeAttachment[] = [];
    const uploader = currentUser?.fullName || currentUser?.username || 'کاربر بازرگانی';

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Validate file type: Images or PDF or Office docs
        const isAllowed = /\.(jpg|jpeg|png|webp|gif|svg|pdf|docx?|xlsx?)$/i.test(file.name) || 
                          file.type.startsWith('image/') || 
                          file.type === 'application/pdf';

        if (!isAllowed) {
          throw new Error(`فرمت فایل "${file.name}" مجاز نیست. لطفاً فقط تصاویر و فایل‌های PDF بارگذاری فرمایید.`);
        }

        const uploaded = await uploadTradeAttachment(
          file, 
          category, 
          uploader, 
          undefined, 
          subCategory, 
          refId
        );
        uploadedList.push(uploaded);
      }

      const updated = [...(attachments || []), ...uploadedList];
      onAttachmentsChange(updated);
    } catch (err: any) {
      console.error("Trade upload error:", err);
      setUploadError(err.message || 'خطا در بارگذاری فایل در سرور');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (attToDelete: TradeAttachment) => {
    if (readOnly) return;
    if (!window.confirm(`آیا از حذف پیوست "${attToDelete.fileName}" اطمینان دارید؟`)) {
      return;
    }

    try {
      // Delete physically from server if stored locally
      if (attToDelete.url) {
        await deleteUploadedFile(attToDelete.url);
      }
    } catch (e) {
      console.warn("Could not delete physical file:", e);
    }

    const updated = (attachments || []).filter(a => a.id !== attToDelete.id && a.url !== attToDelete.url);
    onAttachmentsChange(updated);
  };

  const handleOpenPreview = (att: TradeAttachment) => {
    const isImage = att.fileType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.fileName) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.url);
    const isPdf = att.fileType === 'application/pdf' || /\.pdf$/i.test(att.fileName) || /\.pdf$/i.test(att.url);
    
    setViewerUrl(att.url);
    setViewerName(att.fileName);
    setViewerType(isImage ? 'image' : isPdf ? 'pdf' : 'auto');
    setViewerOpen(true);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700/80 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg">
              <Paperclip size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{title}</span>
                {badgeCount && filteredAttachments.length > 0 && (
                  <span className="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs px-2 py-0.5 rounded-full font-bold">
                    {filteredAttachments.length}
                  </span>
                )}
              </div>
              {description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
              )}
            </div>
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              <span>افزودن عکس / PDF</span>
            </button>
          )}
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFiles(e.target.files)}
        multiple
        accept="image/*,application/pdf"
        className="hidden"
      />

      {/* Error Banner */}
      {uploadError && (
        <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <AlertCircle size={14} className="shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button type="button" onClick={() => setUploadError(null)} className="text-red-500 hover:text-red-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Drag and drop upload zone (when empty or in full mode) */}
      {!readOnly && (!compact || filteredAttachments.length === 0) && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            dragOver 
              ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40' 
              : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 bg-gray-50/50 dark:bg-gray-800/30'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-1.5 py-1">
            <div className="p-2 bg-white dark:bg-gray-800 rounded-full shadow-xs text-blue-600 dark:text-blue-400">
              {isUploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
            </div>
            <div className="text-xs font-bold text-gray-700 dark:text-gray-300">
              {isUploading ? 'در حال بارگذاری و ذخیره فایل در سرور...' : 'کلیک کنید یا عکس و PDF را اینجا رها نمایید'}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              پوشه دسته‌بندی: <span className="font-mono text-blue-600 dark:text-blue-400" dir="ltr">uploads/{category}</span>
            </div>
          </div>
        </div>
      )}

      {/* Compact upload button if compact mode and has items */}
      {!readOnly && compact && filteredAttachments.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium transition-all"
          >
            {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            <span>افزودن پیوست</span>
          </button>
        </div>
      )}

      {/* Attachments List / Grid */}
      {filteredAttachments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredAttachments.map((att, idx) => {
            const isImage = att.fileType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.fileName) || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.url);
            const isPdf = att.fileType === 'application/pdf' || /\.pdf$/i.test(att.fileName) || /\.pdf$/i.test(att.url);
            const resolvedUrl = resolveImageUrl(att.url);
            const displayFileName = getDisplayFileName(att.fileName, att.url);

            return (
              <div 
                key={att.id || idx}
                className="group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-xl p-3 flex items-center justify-between gap-3 shadow-xs hover:shadow-md transition-all"
              >
                {/* File Thumbnail & Info */}
                <div 
                  onClick={() => handleOpenPreview(att)}
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer overflow-hidden"
                  title={`مشاهده فایل: ${displayFileName}`}
                >
                  {isImage ? (
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-900 shrink-0 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
                      <img 
                        src={resolvedUrl} 
                        alt={displayFileName} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className={`w-12 h-12 rounded-xl shrink-0 flex items-center justify-center shadow-2xs ${
                      isPdf ? 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50' : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50'
                    }`}>
                      {isPdf ? <FileText size={24} /> : <Paperclip size={24} />}
                    </div>
                  )}

                  <div className="min-w-0 flex-1 text-right overflow-hidden">
                    <span 
                      className="text-xs font-bold text-gray-900 dark:text-gray-100 block break-words line-clamp-2 leading-relaxed" 
                      dir="auto" 
                      title={displayFileName}
                    >
                      {displayFileName}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                      {att.fileSize ? <span className="font-mono bg-gray-100 dark:bg-gray-700/60 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">{formatFileSize(att.fileSize)}</span> : null}
                      {isPdf && <span className="bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-bold px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900/50">PDF</span>}
                      {isImage && <span className="bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900/50">تصویر</span>}
                      <span className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 mr-auto">
                        <Eye size={11} /> پیش‌نمایش
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* Preview button */}
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(att)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                    title="پیش‌نمایش (Preview)"
                  >
                    <Eye size={15} />
                  </button>

                  {/* Download button */}
                  <button
                    type="button"
                    onClick={() => downloadAndOpenFile(att.url, displayFileName)}
                    className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors cursor-pointer"
                    title="دانلود فایل"
                  >
                    <Download size={15} />
                  </button>

                  {/* Send to chat button */}
                  <button
                    type="button"
                    onClick={() => {
                      openSendToChat({
                        fileUrl: att.url,
                        fileName: displayFileName,
                        title: 'ارسال پیوست بازرگانی به چت',
                        defaultMessage: `📎 فایل پیوست بازرگانی: ${displayFileName}`
                      });
                    }}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                    title="ارسال به چت و گفتگو"
                  >
                    <Share2 size={15} />
                  </button>

                  {/* Delete button */}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleDelete(att)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                      title="حذف پیوست"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-2 text-xs text-gray-400 dark:text-gray-500">
          هنوز پیوستی بارگذاری نشده است.
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

export default TradeAttachmentSection;
