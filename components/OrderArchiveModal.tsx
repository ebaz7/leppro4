import React, { useState, useRef } from 'react';
import { PaymentOrder, User } from '../types';
import { apiCall } from '../services/apiService';
import { formatCurrency, formatDate } from '../constants';
import { 
  Paperclip, Upload, FileText, Trash2, Eye, Download, X, 
  Loader2, CheckCircle2, AlertTriangle, FileType, Image as ImageIcon,
  Sparkles, Wand2
} from 'lucide-react';

interface Props {
  order: PaymentOrder;
  currentUser: User;
  onClose: () => void;
  onOrderUpdated: (updatedOrder: PaymentOrder) => void;
}

export const OrderArchiveModal: React.FC<Props> = ({
  order,
  currentUser,
  onClose,
  onOrderUpdated
}) => {
  const [currentOrder, setCurrentOrder] = useState<PaymentOrder>(order);
  const [uploading, setUploading] = useState(false);
  const [autoConvertToPdf, setAutoConvertToPdf] = useState(true);
  const [scannerFilter, setScannerFilter] = useState<'magic_color' | 'crisp_bw' | 'enhance' | 'original'>('magic_color');
  const [convertingExistingId, setConvertingExistingId] = useState<string | null>(null);
  const [attachmentTitle, setAttachmentTitle] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const allAttachments = [
    ...(currentOrder.attachments || []).map((a, i) => ({ ...a, isArchive: false, originalIndex: i })),
    ...(currentOrder.archiveAttachments || []).map((a, i) => ({ ...a, isArchive: true, originalIndex: i }))
  ];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 150 * 1024 * 1024) {
      setErrorMsg('حجم فایل بیش از حد مجاز (۱۵۰ مگابایت) است.');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const rawBase64 = ev.target?.result as string;
          let finalFileName = attachmentTitle.trim() ? `${attachmentTitle.trim()}_${file.name}` : file.name;
          let finalData = rawBase64;
          let finalType = file.type || 'application/octet-stream';

          const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file.name);

          // Auto convert image to PDF with CamScanner enhancements if toggle is checked
          if (isImage && autoConvertToPdf) {
            try {
              const mergeRes = await apiCall<{ fileData?: string; pdfData?: string; url?: string; size?: number }>('/tools/merge-to-pdf', 'POST', {
                files: [
                  {
                    name: file.name,
                    fileName: file.name,
                    data: rawBase64,
                    type: 'image'
                  }
                ],
                filter: scannerFilter
              });

              const convertedData = mergeRes?.fileData || mergeRes?.pdfData || mergeRes?.url;
              if (mergeRes && convertedData) {
                finalData = convertedData;
                finalType = 'application/pdf';
                const baseName = finalFileName.substring(0, finalFileName.lastIndexOf('.')) || finalFileName;
                finalFileName = `${baseName}_کم_اسکنر.pdf`;
              }
            } catch (convErr) {
              console.warn('Auto PDF conversion failed, using original image:', convErr);
            }
          }

          // Upload to order archive attachments endpoint
          const res = await apiCall<{ order?: PaymentOrder; error?: string }>(`/orders/${currentOrder.id}/archive-attachments`, 'POST', {
            fileName: finalFileName,
            fileData: finalData,
            type: finalType,
            size: file.size,
            uploadedBy: currentUser?.fullName || 'کاربر'
          });

          if (res && res.order) {
            setCurrentOrder(res.order);
            onOrderUpdated(res.order);
            setSuccessMsg(autoConvertToPdf && isImage 
              ? 'فایل با افکت کم‌اسکنر به PDF ارتقاء یافته و به بایگانی پیوست شد.'
              : 'فایل با موفقیت به بایگانی سند اتچ شد.'
            );
            setAttachmentTitle('');
          } else {
            throw new Error(res?.error || 'خطا در ثبت ضمیمه در سرور');
          }
        } catch (err: any) {
          setErrorMsg('خطا در بارگذاری ضمیمه: ' + (err?.message || 'نامشخص'));
        } finally {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMsg('خطا در خواندن فایل: ' + (err?.message || 'نامشخص'));
      setUploading(false);
    }
  };

  // Convert an existing image attachment to CamScanner PDF right inside the modal
  const handleConvertExistingToPdf = async (att: any) => {
    const rawUrl = att.url || att.data;
    if (!rawUrl) return;

    setConvertingExistingId(att.id || att.fileName);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload: any = {
        name: att.fileName || 'document',
        fileName: att.fileName || 'document',
        type: 'image'
      };
      if (rawUrl.startsWith('data:')) {
        payload.data = rawUrl;
      } else {
        payload.url = rawUrl;
      }

      const mergeRes = await apiCall<{ fileData?: string; pdfData?: string; url?: string; size?: number }>('/tools/merge-to-pdf', 'POST', {
        files: [payload],
        filter: scannerFilter
      });

      const convertedData = mergeRes?.fileData || mergeRes?.pdfData || mergeRes?.url;
      if (!convertedData) {
        throw new Error('خطا در دریافت خروجی PDF اسکنر از سرور');
      }

      const baseName = (att.fileName || 'تصویر').replace(/\.[^/.]+$/, "");
      const finalPdfName = `[کم‌اسکنر]_${baseName}.pdf`;

      const res = await apiCall<{ order?: PaymentOrder; error?: string }>(`/orders/${currentOrder.id}/archive-attachments`, 'POST', {
        fileName: finalPdfName,
        fileData: convertedData,
        type: 'application/pdf',
        size: mergeRes?.size || att.size || 1024,
        uploadedBy: currentUser?.fullName || 'کاربر'
      });

      if (res && res.order) {
        setCurrentOrder(res.order);
        onOrderUpdated(res.order);
        setSuccessMsg(`نسخه PDF با کیفیت کم‌اسکنر برای فایل ${att.fileName} ساخته و بایگانی شد.`);
      } else {
        throw new Error(res?.error || 'خطا در ثبت نسخه PDF');
      }
    } catch (err: any) {
      setErrorMsg('خطا در تبدیل عکس موجود به PDF کم‌اسکنر: ' + (err?.message || 'نامشخص'));
    } finally {
      setConvertingExistingId(null);
    }
  };

  const handleDeleteArchiveAtt = async (attachmentId?: string, fileName?: string) => {
    const targetId = attachmentId || fileName;
    if (!targetId) return;
    if (!confirm('آیا از حذف این فایل پیوست اطمینان دارید؟')) return;

    try {
      const res = await apiCall<{ order?: PaymentOrder; error?: string }>(`/orders/${currentOrder.id}/archive-attachments/${targetId}`, 'DELETE');
      if (res && res.order) {
        setCurrentOrder(res.order);
        onOrderUpdated(res.order);
        setSuccessMsg('پیوست با موفقیت حذف گردید.');
      } else {
        throw new Error(res?.error || 'خطا در حذف ضمیمه');
      }
    } catch (err: any) {
      setErrorMsg('خطا در حذف فایل: ' + (err?.message || 'نامشخص'));
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-2xl w-full flex flex-col shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-purple-50/50 dark:bg-purple-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-bold shadow-md">
              <Paperclip size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                بایگانی و اتچ فایل به دستور پرداخت #{currentOrder.trackingNumber}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-semibold">
                گیرنده: {currentOrder.payee} | مبلغ: {formatCurrency(currentOrder.totalAmount)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl text-gray-500 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Upload Form Box */}
          <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
            <h4 className="text-xs font-black text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Upload size={16} className="text-purple-600" />
              افزودن مدرک / رسید / فایل جدید به بایگانی
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1">
                  عنوان یا توضیح فایل (اختیاری)
                </label>
                <input
                  type="text"
                  placeholder="مثال: فیش واریز نهایی، فاکتور..."
                  value={attachmentTitle}
                  onChange={(e) => setAttachmentTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-900 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 w-full hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={autoConvertToPdf}
                    onChange={(e) => setAutoConvertToPdf(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <span className="flex items-center gap-1">
                    <Sparkles size={14} className="text-amber-500" />
                    <span>تبدیل خودکار به PDF با کم‌اسکنر</span>
                  </span>
                </label>
              </div>
            </div>

            {autoConvertToPdf && (
              <div className="bg-purple-50/60 dark:bg-purple-950/20 p-2.5 rounded-xl border border-purple-100 dark:border-purple-900/40">
                <div className="text-[11px] font-bold text-purple-900 dark:text-purple-300 mb-1.5 flex items-center gap-1">
                  <Wand2 size={13} className="text-purple-600" />
                  <span>انتخاب افکت و بهینه‌سازی کیفیت کم‌اسکنر:</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setScannerFilter('magic_color')}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${scannerFilter === 'magic_color' ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}
                  >
                    ✨ اسکن جادویی
                  </button>
                  <button
                    type="button"
                    onClick={() => setScannerFilter('crisp_bw')}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${scannerFilter === 'crisp_bw' ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}
                  >
                    📄 سیاه‌سفید اسکنر
                  </button>
                  <button
                    type="button"
                    onClick={() => setScannerFilter('enhance')}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${scannerFilter === 'enhance' ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}
                  >
                    🔍 وضوح متن
                  </button>
                  <button
                    type="button"
                    onClick={() => setScannerFilter('original')}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${scannerFilter === 'original' ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}
                  >
                    🖼️ کیفیت اصلی
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*,application/pdf"
                className="hidden"
              />

              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>درحال آماده‌سازی و اتچ فایل...</span>
                  </>
                ) : (
                  <>
                    <Upload size={18} />
                    <span>انتخاب فایل و ذخیره در بایگانی (تصویر / PDF)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* List of Existing Attachments */}
          <div>
            <h4 className="text-xs font-black text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-1.5">
              <Paperclip size={16} className="text-blue-500" />
              لیست فایل‌های بایگانی‌شده و پیوست‌های سند ({allAttachments.length})
            </h4>

            {allAttachments.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/30 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                هنوز هیچ فایلی به بایگانی این دستور پرداخت اتچ نشده است.
              </div>
            ) : (
              <div className="space-y-2">
                {allAttachments.map((att, idx) => {
                  const rawUrl = att.url || att.data || '';
                  const fileName = att.fileName || att.name || `پیوست ${idx + 1}`;
                  const isPdf = fileName.toLowerCase().endsWith('.pdf') || (att.type && att.type.includes('pdf'));

                  return (
                    <div
                      key={att.id || `att-${idx}`}
                      className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/80 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-9 h-9 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center shrink-0">
                          {isPdf ? (
                            <FileType size={18} className="text-red-500" />
                          ) : (
                            <ImageIcon size={18} className="text-blue-500" />
                          )}
                        </div>

                        <div className="truncate">
                          <span className="font-bold text-gray-900 dark:text-white truncate block">
                            {fileName}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                            {att.isArchive ? (
                              <span className="bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-bold">بایگانی</span>
                            ) : (
                              <span className="bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold">پیوست اولیه</span>
                            )}
                            {att.uploadedBy && <span>ارسال‌کننده: {att.uploadedBy}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <a
                          href={rawUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-bold flex items-center gap-1"
                          title="مشاهده"
                        >
                          <Eye size={14} />
                        </a>

                        <button
                          type="button"
                          onClick={() => handleDeleteArchiveAtt(att.id, att.fileName || att.name)}
                          className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-bold cursor-pointer transition-colors"
                          title="حذف پیوست"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition-all"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};
