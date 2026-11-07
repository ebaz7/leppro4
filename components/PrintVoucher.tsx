
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PaymentOrder, OrderStatus, PaymentMethod, SystemSettings, User, UserRole, PaymentOrderAttachment, PaymentDetail } from '../types';
import { formatCurrency, formatDate, getStatusLabel, numberToPersianWords, formatNumberString, getShamsiDateFromIso } from '../constants';
import { X, Printer, FileDown, Loader2, CheckCircle, XCircle, Pencil, Share2, Users, Search, RotateCcw, AlertTriangle, FileText, LayoutTemplate, EyeOff, Eye, Settings2, ChevronLeft, ChevronRight, Calendar, MapPin, Layers, MessageSquare, Paperclip, Upload, Trash2, Image, FileCheck, Sparkles, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { apiCall, resolveImageUrl } from '../services/apiService';
import { generatePdf } from '../utils/pdfGenerator'; 
import { executeCrossPlatformPrint } from '../utils/mobilePrintService';
import { Capacitor } from '@capacitor/core';
import html2canvas from 'html2canvas';
import { shareElementToChat } from '../services/chatShareService';
import { FileViewerModal } from './FileViewerModal';
import { downloadAndOpenFile } from '../services/fileService';
import { addOrderArchiveAttachment, deleteOrderArchiveAttachment } from '../services/storageService';
import { getRolePermissions } from '../services/authService';

interface PrintVoucherProps {
  order: PaymentOrder;
  onClose?: () => void;
  settings?: SystemSettings;
  currentUser?: User;
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  onRevoke?: () => void; 
  embed?: boolean; 
  onOrderUpdated?: (updatedOrder: PaymentOrder) => void;
}

const PrintVoucher: React.FC<PrintVoucherProps> = ({ order, onClose, settings, currentUser, onApprove, onReject, onEdit, onRevoke, embed, onOrderUpdated }) => {
  const [currentOrder, setCurrentOrder] = useState<PaymentOrder>(order);

  useEffect(() => {
    setCurrentOrder(order);
  }, [order]);

  const [processing, setProcessing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharePlatform, setSharePlatform] = useState<'whatsapp' | 'telegram' | 'bale' | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  
  // Toggle between Internal Receipt and Bank Form Fill
  const [printMode, setPrintMode] = useState<'receipt' | 'bank_form'>('receipt');
  
  // Default: Background OFF (User wants to print on pre-printed paper)
  const [showFormBackground, setShowFormBackground] = useState(false);
  
  // Calibration State
  const [calibration, setCalibration] = useState({ x: 0, y: 0 }); // mm
  const [showCalibration, setShowCalibration] = useState(false);

  // Line Selection for Multi-Payment Orders
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  
  // Dual Print Mode State (full, withdrawal, deposit)
  const [dualPrintMode, setDualPrintMode] = useState<'full' | 'withdrawal' | 'deposit'>('full');

  // Scale & Pinch-to-Zoom State for Mobile Fit & Touch Zoom
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const containerWrapperRef = useRef<HTMLDivElement>(null);
  const touchZoomRef = useRef<{ initialDistance: number | null; initialScale: number; lastTap: number }>({
    initialDistance: null,
    initialScale: 1,
    lastTap: 0
  });

  // File Viewer Modal State
  const [activeViewer, setActiveViewer] = useState<{ isOpen: boolean; url: string; fileName: string; fileType?: 'image' | 'pdf' | 'auto' }>({
    isOpen: false,
    url: '',
    fileName: '',
    fileType: 'auto'
  });

  // Archive Attachment Upload State
  const [uploadingArchive, setUploadingArchive] = useState(false);
  const [autoConvertToPdf, setAutoConvertToPdf] = useState(true);
  const [scannerFilter, setScannerFilter] = useState<'magic' | 'bw' | 'sharp' | 'original'>('magic');
  const archiveFileInputRef = useRef<HTMLInputElement>(null);

  // Check Archive Attachment Permission
  const userPerms = currentUser ? getRolePermissions(currentUser.role, settings || null, currentUser) : null;
  const canManageArchiveAttachments = Boolean(
    currentUser && (
      currentUser.role === UserRole.ADMIN ||
      currentUser.canManageArchiveAttachments ||
      userPerms?.canManageArchiveAttachments ||
      (currentUser.roles && currentUser.roles.includes(UserRole.ADMIN)) ||
      (currentOrder.requester && currentOrder.requester === currentUser.fullName)
    )
  );

  // Determine which line to show
  const paymentLines = (currentOrder.paymentDetails as PaymentDetail[]) || [];
  const currentLine = (paymentLines[currentLineIndex] || paymentLines[0] || {}) as Partial<PaymentDetail>;

  // --- TEMPLATE LOGIC ---
  const company = settings?.companies?.find(c => c.name === currentOrder.payingCompany);
  const sourceBankConfig = company?.banks?.find(b => currentLine.bankName?.includes(b.bankName));
  
  // Logic to pick correct template based on method and DUAL PRINT mode
  let effectiveTemplateId = sourceBankConfig?.formLayoutId;
  const isInternalTransfer = currentLine.method === PaymentMethod.INTERNAL_TRANSFER;
  const isDualPrintEnabled = isInternalTransfer && sourceBankConfig?.enableDualPrint;

  if (isInternalTransfer) {
      if (isDualPrintEnabled) {
          if (dualPrintMode === 'withdrawal' && sourceBankConfig?.internalWithdrawalTemplateId) {
              effectiveTemplateId = sourceBankConfig.internalWithdrawalTemplateId;
          } else if (dualPrintMode === 'deposit' && sourceBankConfig?.internalDepositTemplateId) {
              effectiveTemplateId = sourceBankConfig.internalDepositTemplateId;
          } else if (sourceBankConfig?.internalTransferTemplateId) {
              effectiveTemplateId = sourceBankConfig.internalTransferTemplateId;
          }
      } else if (sourceBankConfig?.internalTransferTemplateId) {
          effectiveTemplateId = sourceBankConfig.internalTransferTemplateId;
      }
  }

  const dynamicTemplate = settings?.printTemplates?.find(t => t.id === effectiveTemplateId);
  const canPrintBankForm = !!dynamicTemplate;

  // -- NEW: Manual Override State for Date and Place --
  const [overrideDate, setOverrideDate] = useState({ year: '', month: '', day: '' });
  const [overridePlace, setOverridePlace] = useState('');

  // Auto-Scale & Pinch-to-Zoom Logic
  useEffect(() => {
    const handleResize = () => {
        if (embed) return; 
        const wrapper = containerWrapperRef.current;
        const availableWidth = wrapper ? wrapper.clientWidth : window.innerWidth;
        const targetWidth = 794; 
        if (availableWidth < targetWidth + 24) {
            const newScale = Math.max(0.3, Number(((availableWidth - 20) / targetWidth).toFixed(3)));
            setFitScale(newScale);
            setScale(newScale);
        } else {
            setFitScale(1);
            setScale(1);
        }
    };

    handleResize(); 
    const timer = setTimeout(handleResize, 100);
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [embed, printMode]);

  const handleVoucherTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchZoomRef.current.initialDistance = Math.hypot(dx, dy);
      touchZoomRef.current.initialScale = scale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - touchZoomRef.current.lastTap < 280) {
        setScale(prev => (Math.abs(prev - fitScale) < 0.08 ? 1.15 : fitScale));
        touchZoomRef.current.lastTap = 0;
      } else {
        touchZoomRef.current.lastTap = now;
      }
    }
  };

  const handleVoucherTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchZoomRef.current.initialDistance !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / touchZoomRef.current.initialDistance;
      const nextScale = Math.min(2.8, Math.max(0.3, Number((touchZoomRef.current.initialScale * ratio).toFixed(3))));
      setScale(nextScale);
    }
  };

  const handleVoucherTouchEnd = () => {
    touchZoomRef.current.initialDistance = null;
  };

  // Reset Dual Print Mode when line changes
  useEffect(() => {
      setDualPrintMode('full');
  }, [currentLineIndex]);

  // Effect to set default override values when current line changes
  useEffect(() => {
      let yStr = '', mStr = '', dStr = '';
      if (currentLine.method === PaymentMethod.CHEQUE && currentLine.chequeDate) {
          const parts = currentLine.chequeDate.split('/');
          if (parts.length === 3) {
              yStr = parts[0]; mStr = parts[1]; dStr = parts[2];
          }
      } 
      if (!yStr) {
          const shamsi = getShamsiDateFromIso(order.date);
          yStr = shamsi.year.toString();
          mStr = shamsi.month.toString();
          dStr = shamsi.day.toString();
      }
      setOverrideDate({ year: yStr, month: mStr, day: dStr });
      setOverridePlace(''); 
  }, [currentLineIndex, order.date, currentLine]);

  useEffect(() => {
      if (dynamicTemplate) {
          const saved = localStorage.getItem(`print_calib_${dynamicTemplate.id}`);
          if (saved) {
              setCalibration(JSON.parse(saved));
          } else {
              setCalibration({ x: 0, y: 0 });
          }
      }
  }, [dynamicTemplate]);

  const updateCalibration = (dx: number, dy: number) => {
      const newCal = { x: calibration.x + dx, y: calibration.y + dy };
      setCalibration(newCal);
      if (dynamicTemplate) {
          localStorage.setItem(`print_calib_${dynamicTemplate.id}`, JSON.stringify(newCal));
      }
  };

  useEffect(() => {
      const style = document.getElementById('page-size-style');
      if (style && !embed) { 
          if (printMode === 'bank_form' && dynamicTemplate) {
              const size = dynamicTemplate.pageSize || 'A4';
              const orient = dynamicTemplate.orientation || 'portrait';
              style.innerHTML = `@page { size: ${size} ${orient}; margin: 0; }`;
          } else {
              style.innerHTML = '@page { size: A5 landscape; margin: 0; }';
          }
      }
  }, [embed, printMode, dynamicTemplate]);

  const isCompact = order.paymentDetails.length > 1 || (order.description && order.description.length > 70);
  const printAreaId = `print-voucher-${order.id}`;

  const isRevocationProcess = [
      OrderStatus.REVOCATION_PENDING_FINANCE,
      OrderStatus.REVOCATION_PENDING_MANAGER,
      OrderStatus.REVOCATION_PENDING_CEO
  ].includes(order.status);
  
  const isRevoked = order.status === OrderStatus.REVOKED;

  const Stamp = ({ name, title }: { name: string; title: string }) => (
    <div className={`border-[1.5px] border-blue-900 text-blue-900 rounded-md py-0.5 px-2 rotate-[-4deg] opacity-95 mix-blend-multiply shadow-xs inline-block bg-blue-50/30`}>
      <div className="text-[7.5px] font-bold border-b border-blue-800/60 mb-0.5 text-center pb-0.5">{title}</div>
      <div className="text-[9px] text-center font-black whitespace-nowrap">{name}</div>
    </div>
  );

  const handlePrint = () => { 
      const isBankForm = printMode === 'bank_form' && dynamicTemplate;
      const w = isBankForm ? (dynamicTemplate?.width || 210) : 200;
      const h = isBankForm ? (dynamicTemplate?.height || 297) : 136;
      const size = isBankForm ? `${dynamicTemplate?.pageSize || 'A4'} ${dynamicTemplate?.orientation || 'portrait'}` : 'A5 landscape';

      const style = document.getElementById('page-size-style');
      if (style) {
          style.innerHTML = `
            @page { 
                size: ${size}; 
                margin: 0; 
            }
            @media print {
                html, body, #root, #root *, [class*="theme-"], [class*="bg-"], [class*="text-"], .dark, .dark * {
                    background-color: #ffffff !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    border-color: #1e293b !important;
                    box-shadow: none !important;
                    text-shadow: none !important;
                    filter: none !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                body > *:not(.printing-modal) { 
                    display: none !important; 
                }
                .printing-modal {
                    display: block !important;
                    visibility: visible !important;
                    position: static !important;
                    width: 100% !important;
                    height: 100% !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    background: #ffffff !important;
                    background-color: #ffffff !important;
                    backdrop-filter: none !important;
                    overflow: visible !important;
                }
                .no-print, .no-print * { 
                    display: none !important; 
                    visibility: hidden !important;
                }
                #${printAreaId} { 
                    display: flex !important;
                    flex-direction: column !important;
                    justify-content: space-between !important;
                    visibility: visible !important;
                    position: absolute !important; 
                    left: ${isBankForm ? '0' : '5mm'} !important; 
                    top: ${isBankForm ? '0' : '6mm'} !important; 
                    width: ${w}mm !important; 
                    height: ${h}mm !important;
                    max-height: ${h}mm !important;
                    margin: 0 !important;
                    padding: ${isBankForm ? '0' : '3.5mm 5mm'} !important;
                    border: ${isBankForm ? 'none' : '2px solid #000000'} !important;
                    border-radius: ${isBankForm ? '0' : '8px'} !important;
                    box-sizing: border-box !important;
                    box-shadow: none !important;
                    background: #ffffff !important;
                    background-color: #ffffff !important;
                    color: #000000 !important;
                    z-index: 9999999 !important;
                    overflow: hidden !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                    page-break-after: avoid !important;
                }
                #${printAreaId} * { 
                    visibility: visible !important; 
                }
            }
          `;
      }
      
      // Execute isolated cross-platform print (guarantees 100% 1-page fit on A5 with zero page breaks)
      const el = document.getElementById(printAreaId);
      if (el) {
          executeCrossPlatformPrint(el, {
              title: `رسید پرداخت وجه ${currentOrder.trackingNumber || ''}`,
              fileName: `Voucher_${currentOrder.trackingNumber || currentOrder.id}.pdf`,
              orientation: 'landscape'
          });
      }
  };

  const handleDownloadPDF = async () => {
      setProcessing(true);
      const isBankForm = printMode === 'bank_form' && !!dynamicTemplate;
      let opts: any = {
          elementId: printAreaId,
          filename: `Voucher_${currentOrder.trackingNumber || currentOrder.id}.pdf`,
          onComplete: () => setProcessing(false),
          onError: () => { alert('خطا در ایجاد PDF'); setProcessing(false); }
      };
      if (isBankForm && dynamicTemplate) {
          opts.width = `${dynamicTemplate.width}mm`;
          opts.height = `${dynamicTemplate.height}mm`;
      } else {
          opts.format = 'A5';
          opts.orientation = 'landscape';
      }
      await generatePdf(opts);
  };

  const handleSendToChat = async () => {
      try {
          const el = document.getElementById(printAreaId);
          if (!el) throw new Error('سند یافت نشد');
          await shareElementToChat(
              el,
              `Voucher_${currentOrder.trackingNumber || 'order'}.pdf`,
              {
                  defaultMessage: `سند پرداخت شماره ${currentOrder.trackingNumber || ''} - در وجه ${currentOrder.payee} (${formatCurrency(currentOrder.totalAmount)})`,
                  title: 'ارسال سند پرداخت به گفتگو',
                  asPdf: true
              }
          );
      } catch (e) {
          console.error(e);
          alert('خطا در آماده‌سازی سند جهت ارسال به گفتگو');
      }
  };

  const handleShare = async (targetId: string) => {
      if (!targetId || !sharePlatform) return;
      setProcessing(true);
      const element = document.getElementById(printAreaId);
      if (!element) { setProcessing(false); return; }
      try {
          const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
          const base64 = canvas.toDataURL('image/png').split(',')[1];
          const caption = `🧾 *رسید پرداخت وجه*\n🏢 شرکت: ${currentOrder.payingCompany}\n👤 ذینفع: ${currentOrder.payee}\n💰 مبلغ: ${formatCurrency(currentOrder.totalAmount)}`;
          if (sharePlatform === 'whatsapp') {
              await apiCall('/send-whatsapp', 'POST', {
                  number: targetId,
                  message: caption,
                  mediaData: { data: base64, mimeType: 'image/png', filename: `Order_${currentOrder.trackingNumber}.png` }
              });
          } else {
              await apiCall('/send-bot-message', 'POST', {
                  platform: sharePlatform,
                  chatId: targetId,
                  caption: caption,
                  mediaData: { data: base64, filename: `Order_${currentOrder.trackingNumber}.png` }
              });
          }
          if (!embed) alert('ارسال شد.');
          setSharePlatform(null);
      } catch(e) { alert('خطا در ارسال'); } finally { setProcessing(false); }
  };

  // --- ATTACHMENTS HANDLING ---
  const handleOpenViewer = (att: { url?: string; data?: string; fileName?: string; name?: string; type?: string }) => {
      const rawUrl = att.url || att.data;
      if (!rawUrl) return;
      const fileName = att.fileName || att.name || 'پیوست سند';
      const isPdf = fileName.toLowerCase().endsWith('.pdf') || (att.type && att.type.includes('pdf'));
      setActiveViewer({
          isOpen: true,
          url: rawUrl,
          fileName: fileName,
          fileType: isPdf ? 'pdf' : 'image'
      });
  };

  const handleDownloadAttachment = async (att: { url?: string; data?: string; fileName?: string; name?: string }) => {
      const rawUrl = att.url || att.data;
      if (!rawUrl) return;
      const fileName = att.fileName || att.name || 'پیوست';
      await downloadAndOpenFile(rawUrl, fileName);
  };

  const handlePrintAttachment = (att: { url?: string; data?: string; fileName?: string; name?: string; type?: string }) => {
      handleOpenViewer(att);
  };

  const handleArchiveFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const oversized = files.find(f => f.size > 150 * 1024 * 1024);
      if (oversized) {
          alert(`حجم فایل «${oversized.name}» بیش از حد مجاز (۱۵۰ مگابایت) است.`);
          return;
      }

      setUploadingArchive(true);

      const readFileAsBase64 = (file: File): Promise<{ file: File; base64: string }> => {
          return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (ev) => resolve({ file, base64: ev.target?.result as string });
              reader.onerror = (err) => reject(err);
              reader.readAsDataURL(file);
          });
      };

      try {
          const fileResults = await Promise.all(files.map(f => readFileAsBase64(f)));
          const hasImage = fileResults.some(item => item.file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp)$/i.test(item.file.name));

          if (hasImage && autoConvertToPdf) {
              // Convert/Merge all images (or image + PDF) into a single unified PDF
              const payloadFiles = fileResults.map(item => ({
                  name: item.file.name,
                  fileName: item.file.name,
                  data: item.base64,
                  type: item.file.type.startsWith('image/') ? 'image' : 'pdf'
              }));

              const res = await fetch('/api/tools/merge-to-pdf', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                      files: payloadFiles,
                      filter: scannerFilter 
                  })
              });

              if (res.ok) {
                  const pdfRes = await res.json();
                  const defaultName = files.length > 1
                      ? `[PDF]_پیوست_تجمیعی_سند_${currentOrder.trackingNumber || currentOrder.id}_${Date.now()}.pdf`
                      : `[PDF]_${files[0].name.replace(/\.[^/.]+$/, "")}.pdf`;

                  const attachRes = await addOrderArchiveAttachment(currentOrder.id, {
                      fileName: pdfRes.fileName || defaultName,
                      url: pdfRes.url,
                      fileData: pdfRes.url || pdfRes.fileData,
                      size: pdfRes.size,
                      type: 'application/pdf',
                      uploadedBy: currentUser?.fullName || 'کاربر'
                  });

                  if (attachRes && attachRes.order) {
                      setCurrentOrder(attachRes.order);
                      if (onOrderUpdated) onOrderUpdated(attachRes.order);
                  }
              } else {
                  // Fallback: upload each file individually if PDF merge endpoint had an issue
                  for (const item of fileResults) {
                      const attachRes = await addOrderArchiveAttachment(currentOrder.id, {
                          fileName: item.file.name,
                          fileData: item.base64,
                          size: item.file.size,
                          type: item.file.type,
                          uploadedBy: currentUser?.fullName || 'کاربر'
                      });
                      if (attachRes && attachRes.order) {
                          setCurrentOrder(attachRes.order);
                          if (onOrderUpdated) onOrderUpdated(attachRes.order);
                      }
                  }
              }
          } else {
              // Normal upload for each selected file (PDFs or standard images without auto-conversion)
              for (const item of fileResults) {
                  const attachRes = await addOrderArchiveAttachment(currentOrder.id, {
                      fileName: item.file.name,
                      fileData: item.base64,
                      size: item.file.size,
                      type: item.file.type,
                      uploadedBy: currentUser?.fullName || 'کاربر'
                  });
                  if (attachRes && attachRes.order) {
                      setCurrentOrder(attachRes.order);
                      if (onOrderUpdated) onOrderUpdated(attachRes.order);
                  }
              }
          }
      } catch (err: any) {
          console.error("Error adding archive attachment:", err);
          alert('خطا در بارگذاری و تبدیل پیوست بایگانی: ' + (err?.message || 'نامشخص'));
      } finally {
          setUploadingArchive(false);
          if (archiveFileInputRef.current) archiveFileInputRef.current.value = '';
      }
  };

  const handleDeleteArchiveAtt = async (attachmentId?: string, fileName?: string) => {
      const targetId = attachmentId || fileName;
      if (!targetId) return;
      if (!confirm('آیا از حذف این پیوست اطمینان دارید؟')) return;
      try {
          const res = await deleteOrderArchiveAttachment(currentOrder.id, targetId);
          if (res && res.order) {
              setCurrentOrder(res.order);
              if (onOrderUpdated) onOrderUpdated(res.order);
          }
      } catch (err: any) {
          alert('خطا در حذف پیوست: ' + (err?.message || 'نامشخص'));
      }
  };

  const allAttachments = [
      ...(currentOrder.attachments || []).map((a, i) => ({ ...a, isArchive: false, originalIndex: i })),
      ...(currentOrder.archiveAttachments || []).map((a, i) => ({ ...a, isArchive: true, originalIndex: i }))
  ];

  const filteredContacts = settings?.savedContacts?.filter(c => 
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) || 
    c.number.includes(contactSearch)
  ) || [];

  const DynamicBankFormOverlay = () => {
      if (!currentLine || !dynamicTemplate) return null;
      const yStr = overrideDate.year;
      const mStr = overrideDate.month.padStart(2, '0');
      const dStr = overrideDate.day.padStart(2, '0');
      const dateFull = `${yStr}/${mStr}/${dStr}`;
      const amountStr = formatNumberString(currentLine.amount);
      const amountWords = numberToPersianWords(currentLine.amount);

      const getValue = (key: string) => {
          switch(key) {
              case 'date_year': return yStr;
              case 'date_month': return mStr;
              case 'date_day': return dStr;
              case 'date_full': return dateFull;
              case 'amount_num': return amountStr;
              case 'amount_word': return amountWords;
              case 'payee': return currentOrder.payee;
              case 'description': return currentLine.description || currentOrder.description;
              case 'place': return overridePlace;
              case 'source_account': return sourceBankConfig?.accountNumber || '';
              case 'source_sheba': return sourceBankConfig?.sheba || '';
              case 'dest_account': return currentLine.destinationAccount || ''; 
              case 'dest_sheba': return currentLine.sheba || '';
              case 'dest_bank': return currentLine.recipientBank || '';
              case 'dest_owner': return currentLine.destinationOwner || '';
              case 'payment_id': return currentLine.paymentId || '';
              case 'cheque_no': return currentLine.chequeNumber || '';
              case 'company_name': return currentOrder.payingCompany;
              case 'company_id': return company?.nationalId || '';
              case 'company_reg': return company?.registrationNumber || '';
              case 'company_address': return company?.address || '';
              case 'company_postal': return company?.postalCode || '';
              case 'company_tel': return company?.phone || '';
              case 'company_fax': return company?.fax || '';
              case 'company_eco_code': return company?.economicCode || '';
              default: return '';
          }
      };

      const w = dynamicTemplate.width || 210;
      const h = dynamicTemplate.height || 297;

      return (
          <div className="printable-content relative w-full h-full text-black font-sans" 
               style={{ width: `${w}mm`, height: `${h}mm`, margin: '0 auto', overflow: 'hidden', padding: 0, position: 'relative' }}>
              {showFormBackground && dynamicTemplate.backgroundImage && (
                  <img src={dynamicTemplate.backgroundImage} className="absolute inset-0 w-full h-full object-contain opacity-50 z-0 pointer-events-none" style={{ transform: `translate(${calibration.x}mm, ${calibration.y}mm)` }} />
              )}
              {dynamicTemplate.fields.map(field => {
                  if (dualPrintMode === 'withdrawal' && ['dest_account', 'dest_sheba', 'dest_bank', 'dest_owner'].includes(field.key)) return null;
                  if (dualPrintMode === 'deposit' && ['source_account', 'source_sheba'].includes(field.key)) return null;
                  const val = getValue(field.key);
                  if (field.key.includes('sheba') && (field.letterSpacing || 0) > 0) {
                      const cleanSheba = val.replace(/[^0-9]/g, '');
                      return (
                          <div key={field.id} style={{ position: 'absolute', top: `${field.y + calibration.y}mm`, left: `${field.x + calibration.x}mm`, width: field.width ? `${field.width}mm` : 'auto', fontSize: `${field.fontSize}px`, fontWeight: field.isBold ? 'bold' : 'normal', letterSpacing: `${field.letterSpacing}px`, fontFamily: 'monospace', direction: 'ltr', textAlign: 'left', whiteSpace: 'nowrap' }}>{cleanSheba}</div>
                      );
                  }
                  return (
                    <div key={field.id} style={{ position: 'absolute', top: `${field.y + calibration.y}mm`, left: `${field.x + calibration.x}mm`, width: field.width ? `${field.width}mm` : 'auto', fontSize: `${field.fontSize}px`, fontWeight: field.isBold ? 'bold' : 'normal', textAlign: field.align || 'right', whiteSpace: 'nowrap', direction: 'rtl', border: (!showFormBackground) ? '1px dashed rgba(0,0,0,0.05)' : 'none', lineHeight: '1.2' }} className="print:border-none">{val}</div>
                  );
              })}
          </div>
      );
  };

  const rowCount = currentOrder.paymentDetails?.length || 0;
  const isTableCompact = rowCount >= 4;
  const isUltraCompact = rowCount >= 6;

  const receiptContent = (
      <div 
        id={printAreaId} 
        className="printable-content bg-white border-2 border-black rounded-none relative text-slate-900 flex flex-col justify-between select-text" 
        style={{ 
          direction: 'rtl', 
          width: '200mm', 
          height: '136mm', 
          maxHeight: '136mm', 
          padding: isUltraCompact ? '2.5mm 4mm' : isTableCompact ? '3mm 5mm' : '4mm 6mm', 
          boxSizing: 'border-box', 
          margin: '0 auto', 
          backgroundColor: '#ffffff',
          color: '#000000',
          borderColor: '#000000',
          borderRadius: '0px',
          fontFamily: "'Vazirmatn', 'Tahoma', 'Arial', sans-serif"
        }}
      >
        {currentOrder.status === OrderStatus.REJECTED && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-8 border-red-600/30 text-red-600/30 font-black text-8xl rotate-[-25deg] p-4 rounded-3xl select-none z-0 pointer-events-none">REJECTED</div>
        )}
        {isRevoked && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-8 border-gray-400/40 text-gray-400/40 font-black text-7xl rotate-[-25deg] p-4 rounded-3xl select-none z-0 pointer-events-none whitespace-nowrap">باطل شد</div>
        )}
        {isRevocationProcess && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-8 border-red-200/50 text-red-200/50 font-black text-5xl rotate-[-25deg] p-4 rounded-3xl select-none z-0 pointer-events-none whitespace-nowrap">در حال ابطال</div>
        )}
        <div className={`relative z-10 flex flex-col ${isUltraCompact ? 'gap-1' : isTableCompact ? 'gap-1.5' : 'gap-2'}`}>
            {/* Header */}
            <div className={`border-b-2 border-black flex justify-between items-center ${isUltraCompact ? 'pb-1' : 'pb-1.5'}`}>
                {/* Right: Company Info & Logo */}
                <div className="flex items-center gap-2.5">
                    {company?.logo ? (
                        <img src={company.logo} alt="Company Logo" className={`${isUltraCompact ? 'h-8 w-8' : 'h-10 w-10'} object-contain mix-blend-multiply shrink-0`} />
                    ) : (
                        <div className={`${isUltraCompact ? 'h-8 w-8 text-[8px]' : 'h-10 w-10 text-[9px]'} bg-slate-50 text-slate-600 flex items-center justify-center rounded-none border border-black font-bold shrink-0`}>بدون لوگو</div>
                    )}
                    <div className="flex flex-col text-right">
                        <h1 className={`${isUltraCompact ? 'text-sm' : 'text-base'} font-black text-black leading-tight`}>{currentOrder.payingCompany || 'شرکت لپان بافت'}</h1>
                        <p className="text-[9.5px] text-slate-700 font-bold mt-0.5">سیستم مدیریت مالی و پرداخت</p>
                    </div>
                </div>

                {/* Left: Voucher Title, Number, Date */}
                <div className="text-left flex flex-col items-end gap-0.5">
                    <h2 className="text-[11.5px] px-2.5 py-0.5 font-black bg-slate-100 border border-black text-black rounded-none mb-0.5 whitespace-nowrap">رسید پرداخت وجه</h2>
                    <div className="flex items-center gap-1 text-[10px]">
                        <span className="font-bold text-slate-700">شماره:</span>
                        <span className="font-mono font-black text-[11.5px] text-black">{currentOrder.trackingNumber || '-'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                        <span className="font-bold text-slate-700">تاریخ:</span>
                        <span className="font-bold text-black">{formatDate(currentOrder.date)}</span>
                    </div>
                </div>
            </div>

            {/* Info Cards Grid matching physical yellow voucher image3 */}
            <div className={`grid grid-cols-12 ${isUltraCompact ? 'gap-1' : 'gap-1.5'}`}>
                {/* Right Box (Spans 8 cols): Payee and Description */}
                <div className={`col-span-8 flex flex-col ${isUltraCompact ? 'gap-1' : 'gap-1.5'}`}>
                    <div className={`border border-black rounded-none bg-white ${isUltraCompact ? 'p-1 px-2' : 'p-1.5 px-2.5'}`}>
                        <span className="block text-slate-700 text-[9px] font-bold">در وجه (ذینفع):</span>
                        <span className="font-black text-black text-xs block truncate mt-0.5">{currentOrder.payee || '-'}</span>
                    </div>
                    <div className={`border border-black rounded-none bg-white ${isUltraCompact ? 'p-1 px-2 min-h-[26px]' : 'p-1.5 px-2.5 min-h-[30px]'}`}>
                        <span className="block text-slate-700 text-[9px] font-bold">بابت (شرح پرداخت):</span>
                        <p className="text-black text-justify font-medium leading-snug text-[9.5px] line-clamp-2 mt-0.5">{currentOrder.description || '-'}</p>
                    </div>
                </div>

                {/* Left Box (Spans 4 cols): Total Amount */}
                <div className={`col-span-4 border border-black rounded-none bg-white flex flex-col justify-center items-center text-center ${isUltraCompact ? 'p-1 px-2' : 'p-2 px-3'}`}>
                    <span className="block text-slate-700 text-[9.5px] font-bold mb-0.5">مبلغ کل پرداختی:</span>
                    <span className="font-black text-black text-sm font-mono block leading-tight">{formatCurrency(currentOrder.totalAmount)}</span>
                </div>
            </div>

            {/* Payment Details Table */}
            <div className="border border-black rounded-none overflow-hidden">
                <table className={`w-full text-right border-collapse ${isUltraCompact ? 'text-[8px]' : isTableCompact ? 'text-[8.5px]' : 'text-[9.5px]'}`}>
                    <thead className="bg-slate-100 border-b border-black font-black text-black">
                        <tr>
                            <th className={`${isUltraCompact ? 'py-0.5 px-1' : 'py-1 px-1.5'} border-l border-black w-6 text-center`}>#</th>
                            <th className={`${isUltraCompact ? 'py-0.5 px-1.5' : 'py-1 px-2'} border-l border-black w-24`}>نوع پرداخت</th>
                            <th className={`${isUltraCompact ? 'py-0.5 px-1.5' : 'py-1 px-2'} border-l border-black w-32`}>مبلغ (ریال)</th>
                            <th className={`${isUltraCompact ? 'py-0.5 px-1.5' : 'py-1 px-2'} border-l border-black`}>بانک / چک / شبا</th>
                            <th className={`${isUltraCompact ? 'py-0.5 px-1.5' : 'py-1 px-2'}`}>توضیحات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black">
                        {currentOrder.paymentDetails.map((detail, idx) => (
                            <tr key={detail.id} className="text-black font-medium">
                                <td className={`${isUltraCompact ? 'py-0.5 px-1' : 'py-0.5 px-1.5'} text-center font-bold text-black border-l border-black`}>{idx + 1}</td>
                                <td className={`${isUltraCompact ? 'py-0.5 px-1.5' : 'py-0.5 px-2'} font-bold border-l border-black`}>{detail.method}</td>
                                <td className={`${isUltraCompact ? 'py-0.5 px-1.5' : 'py-0.5 px-2'} font-mono font-bold border-l border-black`}>{formatCurrency(detail.amount)}</td>
                                <td className={`${isUltraCompact ? 'py-0.5 px-1.5' : 'py-0.5 px-2'} border-l border-black truncate`}>
                                    {detail.method === PaymentMethod.CHEQUE ? `چک: ${detail.chequeNumber}` : detail.method === PaymentMethod.SHEBA || detail.method === PaymentMethod.SATNA || detail.method === PaymentMethod.PAYA ? `شبا: IR-${detail.sheba}` : detail.method === PaymentMethod.INTERNAL_TRANSFER ? `حساب: ${detail.destinationAccount} (${detail.destinationOwner || ''})` : detail.method === PaymentMethod.TRANSFER ? `بانک: ${detail.bankName}` : '-'}
                                </td>
                                <td className={`${isUltraCompact ? 'py-0.5 px-1.5' : 'py-0.5 px-2'} text-black truncate`}>{detail.description || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Footer 4-Box Signature Blocks matching image 3 (Always 100% visible inside 136mm) */}
        <div className={`border-t-2 border-black relative z-10 ${isUltraCompact ? 'mt-1 pt-1' : 'mt-1.5 pt-1.5'}`}>
            <div className="grid grid-cols-4 gap-2 text-center">
                {/* Box 1: Requester */}
                <div className={`border border-black rounded-none p-0.5 flex flex-col justify-between bg-white ${isUltraCompact ? 'h-[36px]' : isTableCompact ? 'h-[40px]' : 'h-[46px]'}`}>
                    <div className="flex-1 flex items-center justify-center">
                        <Stamp name={currentOrder.requester || 'درخواست کننده'} title="درخواست‌کننده" />
                    </div>
                    <div className="border-t border-black pt-0.5">
                        <span className="text-[8px] font-bold text-black">درخواست کننده</span>
                    </div>
                </div>

                {/* Box 2: Finance Manager */}
                <div className={`border border-black rounded-none p-0.5 flex flex-col justify-between bg-white ${isUltraCompact ? 'h-[36px]' : isTableCompact ? 'h-[40px]' : 'h-[46px]'}`}>
                    <div className="flex-1 flex items-center justify-center">
                        {(currentOrder.approverFinancial || [OrderStatus.APPROVED_FINANCE, OrderStatus.APPROVED_MANAGER, OrderStatus.APPROVED_CEO, OrderStatus.PAID].includes(currentOrder.status)) ? (
                            <Stamp name={currentOrder.approverFinancial || 'تایید شده'} title="تایید مالی" />
                        ) : (
                            <span className="text-slate-400 text-[8px]">امضا نشده</span>
                        )}
                    </div>
                    <div className="border-t border-black pt-0.5">
                        <span className="text-[8px] font-bold text-black">مدیر مالی</span>
                    </div>
                </div>

                {/* Box 3: Management */}
                <div className={`border border-black rounded-none p-0.5 flex flex-col justify-between bg-white ${isUltraCompact ? 'h-[36px]' : isTableCompact ? 'h-[40px]' : 'h-[46px]'}`}>
                    <div className="flex-1 flex items-center justify-center">
                        {(currentOrder.approverManager || [OrderStatus.APPROVED_MANAGER, OrderStatus.APPROVED_CEO, OrderStatus.PAID].includes(currentOrder.status)) ? (
                            <Stamp name={currentOrder.approverManager || 'تایید شده'} title="تایید مدیریت" />
                        ) : (
                            <span className="text-slate-400 text-[8px]">امضا نشده</span>
                        )}
                    </div>
                    <div className="border-t border-black pt-0.5">
                        <span className="text-[8px] font-bold text-black">مدیریت</span>
                    </div>
                </div>

                {/* Box 4: CEO */}
                <div className={`border border-black rounded-none p-0.5 flex flex-col justify-between bg-white ${isUltraCompact ? 'h-[36px]' : isTableCompact ? 'h-[40px]' : 'h-[46px]'}`}>
                    <div className="flex-1 flex items-center justify-center">
                        {(currentOrder.approverCeo || [OrderStatus.APPROVED_CEO, OrderStatus.PAID].includes(currentOrder.status)) ? (
                            <Stamp name={currentOrder.approverCeo || 'تایید شده'} title="مدیر عامل" />
                        ) : (
                            <span className="text-slate-400 text-[8px]">امضا نشده</span>
                        )}
                    </div>
                    <div className="border-t border-black pt-0.5">
                        <span className="text-[8px] font-bold text-black">مدیر عامل</span>
                    </div>
                </div>
            </div>
        </div>
      </div>
  );

  const [approveLoading, setApproveLoading] = useState(false);

  const contentToRender = (printMode === 'bank_form' && canPrintBankForm) ? <DynamicBankFormOverlay /> : receiptContent;
  if (embed) return contentToRender;

  return createPortal(
    <div className="printing-modal fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex flex-col items-start pt-16 md:pt-24 pb-32 overflow-y-auto overflow-x-hidden justify-start p-2 animate-fade-in safe-pb">
      <div className="w-full max-w-4xl mx-auto z-[210] no-print mb-2 shrink-0">
         <div className="bg-white p-2 rounded-xl shadow-lg flex flex-col gap-2 w-full border border-gray-200">
             <div className="flex items-center justify-between border-b pb-1">
                 <h3 className="font-bold text-gray-800 text-[10px] flex items-center gap-1">
                     {isRevocationProcess ? <span className="text-red-600 flex items-center gap-1 animate-pulse"><AlertTriangle size={12}/> چرخه ابطال</span> : 'عملیات'}
                 </h3>
                 <button onClick={onClose} className="text-gray-400 hover:text-red-500"><X size={16}/></button>
             </div>
             
             {(onApprove || onReject || onEdit || onRevoke) && (
                <div className="flex items-center justify-center gap-2 mb-1">
                    {onApprove && (
                        <button 
                            onClick={async () => {
                                setApproveLoading(true);
                                try { await onApprove(); } finally { setApproveLoading(false); }
                            }} 
                            disabled={approveLoading}
                            className={`px-3 py-1 rounded-lg flex items-center gap-1 text-[10px] font-bold transition-all active:scale-95 shadow-sm ${isRevocationProcess ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'}`}
                        >
                            {approveLoading ? <Loader2 size={12} className="animate-spin"/> : (isRevocationProcess ? <XCircle size={12}/> : <CheckCircle size={12} />)}
                            {isRevocationProcess ? 'تایید ابطال' : 'تایید نهایی'}
                        </button>
                    )}
                    {onReject && <button onClick={onReject} className="px-3 py-1 bg-white border border-red-200 text-red-600 rounded-lg flex items-center gap-1 text-[10px] font-bold transition-all active:scale-95 hover:bg-red-50"><XCircle size={12} /> رد</button>}
                    {onRevoke && !isRevocationProcess && !isRevoked && <button onClick={onRevoke} className="px-3 py-1 bg-white border border-orange-200 text-orange-600 rounded-lg flex items-center gap-1 text-[10px] font-bold transition-all active:scale-95 hover:bg-orange-50"><RotateCcw size={12} /> ابطال</button>}
                    {onEdit && !isRevocationProcess && <button onClick={onEdit} className="p-1 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all active:scale-95"><Pencil size={12} /></button>}
                </div>
             )}
             
             <div className="flex flex-wrap items-center justify-center gap-2">
                 <button onClick={handleSendToChat} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg flex items-center gap-1 text-[10px] font-bold transition-colors shadow-sm cursor-pointer" title="ارسال مستقیم سند به گفتگوی سازمانی"><MessageSquare size={12} /> ارسال به گفتگو</button>
                 <button onClick={handleDownloadPDF} disabled={processing} className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1 rounded-lg flex items-center gap-1 text-[10px] font-bold transition-colors">{processing ? <Loader2 size={12} className="animate-spin"/> : <FileDown size={12} />} PDF</button>
                 <button onClick={handlePrint} disabled={processing} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg flex items-center gap-1 text-[10px] font-bold transition-colors shadow-sm">{processing ? <Loader2 size={12} className="animate-spin"/> : <Printer size={12} />} چاپ</button>
                 <div className="h-4 w-[1px] bg-gray-200 mx-1"></div>
                 <button onClick={() => setSharePlatform(sharePlatform === 'whatsapp' ? null : 'whatsapp')} className={`px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition-all ${sharePlatform === 'whatsapp' ? 'bg-green-500 text-white border-green-600' : 'bg-white border-gray-200 text-green-600 hover:bg-green-50'}`}><Share2 size={12}/> واتساپ</button>
                 <button onClick={() => setSharePlatform(sharePlatform === 'bale' ? null : 'bale')} className={`px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition-all ${sharePlatform === 'bale' ? 'bg-green-500 text-white border-green-600' : 'bg-white border-gray-200 text-green-600 hover:bg-green-50'}`}><Share2 size={12}/> بله</button>
                 <button onClick={() => setSharePlatform(sharePlatform === 'telegram' ? null : 'telegram')} className={`px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition-all ${sharePlatform === 'telegram' ? 'bg-blue-500 text-white border-blue-600' : 'bg-white border-gray-200 text-blue-600 hover:bg-blue-50'}`}><Share2 size={12}/> تلگرام</button>
                 {canPrintBankForm && (
                     <button onClick={() => setPrintMode(printMode === 'receipt' ? 'bank_form' : 'receipt')} className={`px-3 py-1 rounded-lg flex items-center gap-1 text-[10px] font-bold transition-colors border ${printMode === 'bank_form' ? 'bg-teal-100 text-teal-700 border-teal-200' : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'}`}><LayoutTemplate size={12}/> {printMode === 'receipt' ? `قالب بانکی` : 'رسید داخلی'}</button>
                 )}
                 <div className="h-4 w-[1px] bg-gray-200 mx-0.5"></div>
                 {/* Interactive Zoom Controls for Mobile & Desktop */}
                 <div className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded-lg border border-slate-200">
                     <button type="button" onClick={() => setScale(s => Math.max(0.3, Number((s - 0.15).toFixed(2))))} className="p-1 rounded bg-white text-slate-700 border border-slate-200 active:scale-95" title="کوچک‌نمایی"><ZoomOut size={12}/></button>
                     <span className="text-[10px] font-mono font-bold text-slate-700 min-w-[36px] text-center" dir="ltr">{Math.round(scale * 100)}%</span>
                     <button type="button" onClick={() => setScale(s => Math.min(2.8, Number((s + 0.15).toFixed(2))))} className="p-1 rounded bg-white text-slate-700 border border-slate-200 active:scale-95" title="بزرگ‌نمایی"><ZoomIn size={12}/></button>
                     <button type="button" onClick={() => setScale(fitScale)} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-0.5 ${Math.abs(scale - fitScale) < 0.03 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`} title="برازش به صفحه"><Maximize2 size={10}/><span>برازش</span></button>
                     <button type="button" onClick={() => setScale(1)} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${Math.abs(scale - 1) < 0.03 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`} title="اندازه واقعی">۱۰۰٪</button>
                 </div>
             </div>

             {sharePlatform && (
                 <div className="mt-2 bg-gray-50 rounded-xl shadow-inner border border-gray-200 z-[60] overflow-hidden animate-scale-in">
                     <div className="p-2 border-b flex justify-between items-center"><span className="text-xs font-bold text-gray-600">انتخاب مخاطب {sharePlatform === 'whatsapp' ? 'واتساپ' : sharePlatform === 'bale' ? 'بله' : 'تلگرام'}</span><button onClick={() => setSharePlatform(null)}><X size={14}/></button></div>
                     <div className="p-2 border-b"><input className="w-full text-xs p-1 border rounded" placeholder="جستجو..." value={contactSearch} onChange={e=>setContactSearch(e.target.value)} autoFocus/></div>
                     <div className="max-h-40 overflow-y-auto">{filteredContacts.map(c => {
                         let targetId = c.number;
                         if (sharePlatform === 'telegram') targetId = (c.telegramId || '').trim() || c.number;
                         if (sharePlatform === 'bale') targetId = (c.baleId || '').trim() || c.number;
                         return (
                           <div key={c.id} className="w-full text-right p-2 hover:bg-blue-50 text-xs flex justify-between items-center border-b border-gray-50 last:border-0"><span className="font-bold text-gray-800">{c.name}</span><button onClick={() => { if(!targetId){alert("آیدی تنظیم نشده");return;} handleShare(targetId); }} className="bg-green-600 text-white px-3 py-1 rounded text-[10px]">ارسال</button></div>
                         );
                     })}</div>
                 </div>
             )}

             {/* ATTACHMENTS & ARCHIVE SECTION */}
             <div className="mt-2 border-t pt-2">
                 <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                     <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                         <Paperclip size={14} className="text-blue-600" />
                         <span>پیوست‌ها و اسناد بایگانی ({allAttachments.length})</span>
                     </div>
                     {canManageArchiveAttachments && (
                         <div className="flex items-center gap-2">
                             <label 
                                 className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-gray-700 bg-blue-50/80 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded-lg transition-all"
                                 title="تبدیل اتوماتیک عکس‌ها به فایل تک‌صفحه‌ای یا چندصفحه‌ای PDF هنگام بارگذاری"
                             >
                                 <input 
                                     type="checkbox" 
                                    checked={autoConvertToPdf}
                                    onChange={(e) => setAutoConvertToPdf(e.target.checked)}
                                    className="rounded text-blue-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                                />
                                <span className="flex items-center gap-1 font-medium">
                                    <Sparkles size={12} className="text-amber-500" />
                                    <span>کم‌اسکنر به PDF</span>
                                </span>
                            </label>

                            {autoConvertToPdf && (
                                <select
                                    value={scannerFilter}
                                    onChange={(e: any) => setScannerFilter(e.target.value)}
                                    className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded-lg px-2 py-1 outline-none cursor-pointer"
                                    title="فیلتر پردازش و بهینه‌سازی کم‌اسکنر"
                                >
                                    <option value="magic">✨ اسکن جادویی (Magic)</option>
                                    <option value="bw">📄 سیاه‌سفید کم‌اسکنر (B&W)</option>
                                    <option value="sharp">🔍 وضوح متن (Sharp)</option>
                                    <option value="original">🖼️ کیفیت اصلی</option>
                                </select>
                            )}

                            <input
                                type="file"
                                ref={archiveFileInputRef}
                                onChange={handleArchiveFileChange}
                                className="hidden"
                                accept="image/*,application/pdf"
                                multiple
                            />
                            <button
                                type="button"
                                onClick={() => archiveFileInputRef.current?.click()}
                                disabled={uploadingArchive}
                                className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50"
                            >
                                {uploadingArchive ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                <span>{uploadingArchive ? "در حال اسکن و آپلود..." : "اسکن و افزودن به بایگانی"}</span>
                            </button>
                         </div>
                     )}
                 </div>

                 {allAttachments.length === 0 ? (
                     <div className="p-2 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-center text-[11px] text-gray-400">
                         هیچ فایلی برای این سند ضمیمه یا بایگانی نشده است.
                     </div>
                 ) : (
                     <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                         {allAttachments.map((att, idx) => {
                             const rawUrl = att.url || att.data || '';
                             const fullUrl = resolveImageUrl(rawUrl);
                             const fileName = att.fileName || att.name || `پیوست ${idx + 1}`;
                             const isPdf = fileName.toLowerCase().endsWith('.pdf') || (att.type && att.type.includes('pdf'));
                             
                             return (
                                 <div 
                                     key={att.id || `att-${idx}`} 
                                     className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-200 hover:border-blue-300 transition-all text-xs group"
                                 >
                                     <div 
                                         className="flex items-center gap-2 overflow-hidden flex-1 cursor-pointer"
                                         onClick={() => handleOpenViewer(att)}
                                         title="مشاهده پیش‌نمایش"
                                     >
                                         <div className="w-8 h-8 rounded shrink-0 bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
                                             {isPdf ? (
                                                 <FileText size={16} className="text-red-500" />
                                             ) : (
                                                 <img 
                                                     src={fullUrl} 
                                                     alt="" 
                                                     className="w-full h-full object-cover"
                                                     onError={(e) => {
                                                         (e.target as HTMLElement).style.display = 'none';
                                                     }} 
                                                 />
                                             )}
                                         </div>
                                         <div className="flex flex-col truncate">
                                             <span className="font-semibold text-gray-800 truncate text-[11px]">{fileName}</span>
                                             <div className="flex items-center gap-1 text-[9px] text-gray-500">
                                                 {att.isArchive ? (
                                                     <span className="text-purple-600 bg-purple-50 px-1 rounded font-medium">بایگانی</span>
                                                 ) : (
                                                     <span className="text-blue-600 bg-blue-50 px-1 rounded font-medium">ثبت اولیه</span>
                                                 )}
                                                 {att.uploadedBy && <span>• {att.uploadedBy}</span>}
                                             </div>
                                         </div>
                                     </div>

                                     <div className="flex items-center gap-1 shrink-0 mr-1">
                                         <button 
                                             type="button" 
                                             onClick={() => handleOpenViewer(att)}
                                             className="p-1 hover:bg-blue-100 text-blue-600 rounded" 
                                             title="پیش‌نمایش و چاپ"
                                         >
                                             <Eye size={13} />
                                         </button>
                                         <button 
                                             type="button" 
                                             onClick={() => handleDownloadAttachment(att)}
                                             className="p-1 hover:bg-emerald-100 text-emerald-600 rounded" 
                                             title="دانلود فایل"
                                         >
                                             <FileDown size={13} />
                                         </button>
                                         {canManageArchiveAttachments && (
                                             <button 
                                                 type="button" 
                                                 onClick={() => handleDeleteArchiveAtt(att.id, att.fileName || att.name)}
                                                 className="p-1 hover:bg-red-100 text-red-600 rounded opacity-70 hover:opacity-100 cursor-pointer transition-colors" 
                                                 title="حذف پیوست"
                                             >
                                                 <Trash2 size={13} />
                                             </button>
                                         )}
                                     </div>
                                 </div>
                             );
                         })}
                     </div>
                 )}
             </div>

             {printMode === 'bank_form' && (
                 <div className="col-span-2 md:col-span-4 flex flex-col gap-2 mt-2 bg-gray-50 p-2 rounded border animate-fade-in">
                     {paymentLines.length > 1 && (
                         <div className="flex items-center justify-between glass-panel p-2 rounded border border-gray-200 mb-2">
                             <button onClick={() => setCurrentLineIndex(prev => Math.max(0, prev - 1))} disabled={currentLineIndex === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16}/></button>
                             <span className="text-xs font-bold text-gray-700">ردیف {currentLineIndex + 1} از {paymentLines.length} - {currentLine.method} ({formatCurrency(currentLine.amount)})</span>
                             <button onClick={() => setCurrentLineIndex(prev => Math.min(paymentLines.length - 1, prev + 1))} disabled={currentLineIndex === paymentLines.length - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16}/></button>
                         </div>
                     )}
                     <div className="bg-blue-50 p-2 rounded border border-blue-100 mb-2">
                         <div className="text-xs font-bold text-blue-800 mb-1 flex items-center gap-1"><Pencil size={12}/> ویرایش اطلاعات چاپ (دستی):</div>
                         <div className="flex gap-2 mb-1"><div className="flex items-center gap-1 flex-1"><Calendar size={12} className="text-gray-500"/><input className="w-10 text-center border rounded text-xs p-0.5" value={overrideDate.day} onChange={e=>setOverrideDate({...overrideDate, day: e.target.value})} placeholder="روز"/><span className="text-gray-400">/</span><input className="w-10 text-center border rounded text-xs p-0.5" value={overrideDate.month} onChange={e=>setOverrideDate({...overrideDate, month: e.target.value})} placeholder="ماه"/><span className="text-gray-400">/</span><input className="w-12 text-center border rounded text-xs p-0.5" value={overrideDate.year} onChange={e=>setOverrideDate({...overrideDate, year: e.target.value})} placeholder="سال"/></div></div>
                         <div className="flex gap-1 items-center"><MapPin size={12} className="text-gray-500"/><input className="w-full border rounded text-xs p-1" placeholder="محل صدور (شهر)..." value={overridePlace} onChange={e=>setOverridePlace(e.target.value)}/></div>
                     </div>
                     {isDualPrintEnabled && (
                         <div className="flex gap-1 glass-panel p-1 rounded border border-orange-200 mb-2">
                             <button onClick={() => setDualPrintMode('full')} className={`flex-1 text-[10px] font-bold py-1 rounded ${dualPrintMode === 'full' ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:bg-gray-50'}`}>کامل</button>
                             <button onClick={() => setDualPrintMode('withdrawal')} className={`flex-1 text-[10px] font-bold py-1 rounded ${dualPrintMode === 'withdrawal' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:bg-gray-50'}`}>نسخه برداشت</button>
                             <button onClick={() => setDualPrintMode('deposit')} className={`flex-1 text-[10px] font-bold py-1 rounded ${dualPrintMode === 'deposit' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-50'}`}>نسخه واریز</button>
                         </div>
                     )}
                     <label className="flex items-center gap-2 text-xs cursor-pointer select-none"><input type="checkbox" checked={showFormBackground} onChange={e => setShowFormBackground(e.target.checked)} className="w-4 h-4 text-blue-600 rounded"/>چاپ زمینه (عکس فرم خام)</label>
                     <div className="flex items-center justify-between"><button onClick={() => setShowCalibration(!showCalibration)} className="text-xs flex items-center gap-1 text-blue-600 font-bold"><Settings2 size={12}/> کالیبراسیون چاپ</button>{showCalibration && <div className="text-[10px] text-gray-500">X: {calibration.x} | Y: {calibration.y}</div>}</div>
                     {showCalibration && (
                         <div className="grid grid-cols-4 gap-1">
                             <button onClick={() => updateCalibration(0, -1)} className="glass-panel border rounded p-1 hover:bg-gray-100">⬆️</button>
                             <button onClick={() => updateCalibration(0, 1)} className="glass-panel border rounded p-1 hover:bg-gray-100">⬇️</button>
                             <button onClick={() => updateCalibration(-1, 0)} className="glass-panel border rounded p-1 hover:bg-gray-100">⬅️</button>
                             <button onClick={() => updateCalibration(1, 0)} className="glass-panel border rounded p-1 hover:bg-gray-100">➡️</button>
                         </div>
                     )}
                 </div>
             )}
         </div>
      </div>
      <div
        className="flex-1 w-full overflow-auto pb-12 touch-pan-x touch-pan-y"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        ref={containerWrapperRef}
        onTouchStart={handleVoucherTouchStart}
        onTouchMove={handleVoucherTouchMove}
        onTouchEnd={handleVoucherTouchEnd}
        onTouchCancel={handleVoucherTouchEnd}
      >
        {(() => {
          const docWidthMm = (printMode === 'bank_form' && dynamicTemplate) ? (dynamicTemplate.width || 210) : 210;
          const docHeightMm = (printMode === 'bank_form' && dynamicTemplate) ? (dynamicTemplate.height || 297) : 148;
          const docWidthPx = Math.round(docWidthMm * 3.779527559);
          const docHeightPx = Math.round(docHeightMm * 3.779527559);
          return (
            <div
              style={{
                width: `${Math.round(docWidthPx * scale)}px`,
                minHeight: `${Math.round(docHeightPx * scale)}px`,
                margin: '0 auto',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: `${docWidthMm}mm`,
                  minHeight: `${docHeightMm}mm`,
                  backgroundColor: 'white',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
              >
                {contentToRender}
              </div>
            </div>
          );
        })()}
      </div>

      <FileViewerModal 
          isOpen={activeViewer.isOpen}
          onClose={() => setActiveViewer(prev => ({ ...prev, isOpen: false }))}
          fileUrl={activeViewer.url}
          fileName={activeViewer.fileName}
          fileType={activeViewer.fileType}
      />
    </div>,
    document.body
  );
};

export default PrintVoucher;
