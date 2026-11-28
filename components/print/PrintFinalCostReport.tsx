import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  X,
  Printer,
  Loader2,
  FileDown,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MessageSquare,
  Bot,
  Send,
  Image as ImageIcon,
  FileText,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { TradeRecord, TradeStage, SystemSettings } from '../../types';
import { formatCurrency, formatNumberString } from '../../constants';
import { generatePdf } from '../../utils/pdfGenerator';
import { shareElementToChat, renderCleanElementToBlob } from '../../services/chatShareService';
import { apiCall } from '../../services/apiService';
import { getSettings } from '../../services/storageService';
import { SmartBotRecipientPicker } from '../SmartBotRecipientPicker';

interface Props {
  record: TradeRecord;
  totalRial: number;
  totalCurrency: number;
  exchangeRate: number;
  grandTotalRial: number;
  settings?: SystemSettings | null;
  onClose: () => void;
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('خطا در تبدیل فایل برای ارسال'));
    reader.readAsDataURL(blob);
  });

const PrintFinalCostReport: React.FC<Props> = ({
  record,
  totalRial,
  totalCurrency,
  exchangeRate,
  grandTotalRial,
  settings: propSettings,
  onClose
}) => {
  const [processing, setProcessing] = useState(false);
  const [loadedSettings, setLoadedSettings] = useState<SystemSettings | undefined>(propSettings || undefined);

  // Bot Send Modal States
  const [showBotModal, setShowBotModal] = useState(false);
  const [botPlatforms, setBotPlatforms] = useState<('telegram' | 'bale' | 'whatsapp')[]>(['bale']);
  const [teleChatIds, setTeleChatIds] = useState<string[]>([]);
  const [baleChatIds, setBaleChatIds] = useState<string[]>([]);
  const [waChatIds, setWaChatIds] = useState<string[]>([]);
  const [botFileFormat, setBotFileFormat] = useState<'image' | 'pdf'>('image');
  const [botCaption, setBotCaption] = useState('');
  const [sendingBot, setSendingBot] = useState(false);
  const [botFeedback, setBotFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Scaling & Dynamic Height State for Preview
  const [scale, setScale] = useState(1);
  const [userZoom, setUserZoom] = useState<number | null>(null);
  const [contentHeightPx, setContentHeightPx] = useState<number>(1123);
  const containerWrapperRef = useRef<HTMLDivElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Touch pinch zoom & pan refs
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartScaleRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  useEffect(() => {
    if (propSettings) {
      setLoadedSettings(propSettings);
    } else {
      getSettings()
        .then(s => {
          if (s) setLoadedSettings(s);
        })
        .catch(() => {});
    }
  }, [propSettings]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const el = containerWrapperRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const el = containerWrapperRef.current;
    if (!el) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    el.scrollLeft = dragStartRef.current.scrollLeft - dx;
    el.scrollTop = dragStartRef.current.scrollTop - dy;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  useEffect(() => {
    const styleId = 'page-size-style-final-cost';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.innerHTML = `
      @media print {
        @page { size: A4 portrait; margin: 8mm 0; }
        body { margin: 0 !important; padding: 0 !important; background: white !important; }
        .no-print { display: none !important; }
        #final-cost-print-area {
          width: 210mm !important;
          min-height: 281mm !important;
          height: auto !important;
          margin: 0 auto !important;
          padding: 8mm 11mm !important;
          box-sizing: border-box !important;
          overflow: visible !important;
          box-shadow: none !important;
        }
        #final-cost-print-area tr,
        #final-cost-print-area .print-avoid-break {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
      }
    `;
    return () => {
      if (style) style.remove();
    };
  }, []);

  // Measure actual height of #final-cost-print-area so multi-item dossiers scroll cleanly in preview
  useEffect(() => {
    const el = printAreaRef.current;
    if (!el) return;

    const updateHeight = () => {
      const measured = Math.max(1123, el.scrollHeight || el.offsetHeight || 1123);
      setContentHeightPx(measured);
    };

    updateHeight();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateHeight);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, [record, totalRial, totalCurrency, exchangeRate, grandTotalRial]);

  // Auto-Scale Logic for preview overlay
  useEffect(() => {
    const handleResize = () => {
      if (userZoom !== null) return;
      const wrapper = containerWrapperRef.current;
      if (wrapper) {
        const wrapperWidth = wrapper.clientWidth;
        const targetWidth = 794; // A4 Portrait width in px at 96dpi
        if (wrapperWidth < targetWidth + 40) {
          setScale(Math.max(0.25, (wrapperWidth - 32) / targetWidth));
        } else {
          setScale(1);
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [userZoom]);

  const handleZoomIn = () => {
    const currentScale = userZoom !== null ? userZoom : scale;
    const nextScale = Math.min(3.0, currentScale + 0.15);
    setUserZoom(nextScale);
    setScale(nextScale);
  };

  const handleZoomOut = () => {
    const currentScale = userZoom !== null ? userZoom : scale;
    const nextScale = Math.max(0.25, currentScale - 0.15);
    setUserZoom(nextScale);
    setScale(nextScale);
  };

  const handleSetZoom = (newScale: number) => {
    const clamped = Math.min(3.0, Math.max(0.25, newScale));
    setUserZoom(clamped);
    setScale(clamped);
  };

  const handleResetZoom = () => {
    setUserZoom(null);
    setTimeout(() => {
      const wrapper = containerWrapperRef.current;
      if (wrapper) {
        const wrapperWidth = wrapper.clientWidth;
        const targetWidth = 794;
        if (wrapperWidth < targetWidth + 40) {
          setScale(Math.max(0.25, (wrapperWidth - 32) / targetWidth));
        } else {
          setScale(1);
        }
      }
    }, 50);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartScaleRef.current = scale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        if (scale > 1.1) {
          handleResetZoom();
        } else {
          handleSetZoom(1.35);
        }
      }
      lastTapRef.current = now;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = currentDist / touchStartDistRef.current;
      const targetScale = Math.min(3.0, Math.max(0.25, touchStartScaleRef.current * ratio));
      setScale(targetScale);
      setUserZoom(targetScale);
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(3.0, Math.max(0.25, scale * zoomFactor));
      setScale(newScale);
      setUserZoom(newScale);
    }
  };

  const regNumber = record.registrationNumber || record.orderNumber || record.fileNumber || '---';
  const currencyStr = record.mainCurrency || 'USD';

  const items = record.items || [];
  const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0), 0);
  const totalFreightCurrency = record.freightCost || 0;
  const freightPerKgCurrency = totalWeight > 0 ? totalFreightCurrency / totalWeight : 0;
  const costPerKgRial = totalWeight > 0 ? grandTotalRial / totalWeight : 0;

  const itemCostRows = useMemo(() => {
    return items.map((item, idx) => {
      const weight = item.weight || 0;
      const unitPrice = item.unitPrice || 0;
      const itemTotalPrice = item.totalPrice ?? weight * unitPrice;
      const itemFreightShareCurrency = weight * freightPerKgCurrency;
      const itemAdjustedTotalPriceCurrency = itemTotalPrice + itemFreightShareCurrency;
      const itemAdjustedUnitPriceCurrency = weight > 0 ? itemAdjustedTotalPriceCurrency / weight : 0;
      const itemFinalCostRial = itemAdjustedTotalPriceCurrency * exchangeRate;
      const itemFinalCostPerKg = weight > 0 ? itemFinalCostRial / weight : 0;

      return {
        id: item.id || String(idx),
        name: item.name || '---',
        weight,
        unitPrice,
        itemAdjustedUnitPriceCurrency,
        itemFinalCostRial,
        itemFinalCostPerKg
      };
    });
  }, [items, freightPerKgCurrency, exchangeRate]);

  const totalItemsFinalCostRial = itemCostRows.reduce((sum, row) => sum + row.itemFinalCostRial, 0);

  const stageKeys = Object.values(TradeStage);
  const tableTotalRial = stageKeys.reduce((sum, stageKey) => sum + (record.stages?.[stageKey]?.costRial || 0), 0);
  const tableTotalCurrency = stageKeys.reduce((sum, stageKey) => sum + (record.stages?.[stageKey]?.costCurrency || 0), 0);

  const buildDefaultBotCaption = () => {
    const lines = [
      `📊 صورتحساب بهای تمام‌شده نهایی پرونده تجاری`,
      `🏢 شرکت: ${record.company || '---'}`,
      `🏭 تامین‌کننده: ${record.sellerName || '---'}`,
      `🔢 ثبت سفارش: ${regNumber} | پرونده: ${record.fileNumber || '---'}`,
      `⚖️ وزن کل: ${formatNumberString(totalWeight)} کیلوگرم`,
      `💱 جمع ارزی: ${formatNumberString(totalCurrency)} ${currencyStr}`,
      `💰 بهای تمام‌شده کل: ${formatCurrency(grandTotalRial || totalRial)}`,
      `📦 بهای تمام‌شده هر کیلو: ${costPerKgRial > 0 ? `${formatCurrency(costPerKgRial)} / kg` : '---'}`
    ];

    if (itemCostRows.length > 0) {
      lines.push('');
      lines.push('📋 تفکیک اقلام کالا:');
      itemCostRows.slice(0, 8).forEach((row, idx) => {
        lines.push(
          `${idx + 1}. ${row.name} (${formatNumberString(row.weight)} kg) ⬅️ فی هر کیلو: ${formatCurrency(row.itemFinalCostPerKg)}`
        );
      });
      if (itemCostRows.length > 8) {
        lines.push(`... و ${itemCostRows.length - 8} ردیف کالای دیگر در فایل پیوست`);
      }
    }

    return lines.join('\n');
  };

  const handleOpenBotModal = () => {
    setBotFeedback(null);
    setBotCaption(buildDefaultBotCaption());

    // Pre-select configured platforms smartly if user hasn't picked anything yet
    if (teleChatIds.length === 0 && baleChatIds.length === 0 && waChatIds.length === 0 && loadedSettings) {
      const initialPlatforms: ('telegram' | 'bale' | 'whatsapp')[] = [];
      if (loadedSettings.baleBotToken || loadedSettings.purchaseBaleGroup) initialPlatforms.push('bale');
      if (loadedSettings.telegramBotToken || loadedSettings.telegramAdminId || loadedSettings.purchaseTelegramGroup) {
        initialPlatforms.push('telegram');
      }
      if (initialPlatforms.length > 0) {
        setBotPlatforms(initialPlatforms);
      }
    }

    setShowBotModal(true);
  };

  const toggleBotPlatform = (platform: 'telegram' | 'bale' | 'whatsapp') => {
    setBotPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
  };

  const totalSelectedTargetsCount =
    (botPlatforms.includes('telegram') ? teleChatIds.length : 0) +
    (botPlatforms.includes('bale') ? baleChatIds.length : 0) +
    (botPlatforms.includes('whatsapp') ? waChatIds.length : 0);

  const handleSendViaBot = async () => {
    const activeTelegram = botPlatforms.includes('telegram') ? teleChatIds : [];
    const activeBale = botPlatforms.includes('bale') ? baleChatIds : [];
    const activeWa = botPlatforms.includes('whatsapp') ? waChatIds : [];

    const totalTargets = activeTelegram.length + activeBale.length + activeWa.length;
    if (botPlatforms.length === 0) {
      setBotFeedback({ type: 'error', message: 'لطفاً حداقل یک پیام‌رسان (بله، تلگرام یا واتس‌اپ) را انتخاب کنید.' });
      return;
    }
    if (totalTargets === 0) {
      setBotFeedback({ type: 'error', message: 'لطفاً حداقل یک گیرنده یا گروه مقصد انتخاب نمایید.' });
      return;
    }

    setSendingBot(true);
    setBotFeedback(null);

    try {
      const safeReg = String(regNumber).replace(/[\\/:*?"<>|]/g, '_');
      let blob: Blob | undefined;
      let mimeType = 'image/jpeg';
      let filename = `Final_Cost_Report_${safeReg}.jpg`;

      if (botFileFormat === 'pdf') {
        filename = `Final_Cost_Report_${safeReg}.pdf`;
        mimeType = 'application/pdf';
        blob = await generatePdf({
          elementId: 'final-cost-print-area',
          filename,
          format: 'A4',
          orientation: 'portrait',
          returnBlob: true
        });
        if (!blob) {
          const fallback = await renderCleanElementToBlob('final-cost-print-area', {
            scale: 2.2,
            asPdf: true,
            format: 'a4',
            orientation: 'portrait'
          });
          blob = fallback.blob;
        }
      } else {
        const rendered = await renderCleanElementToBlob('final-cost-print-area', { scale: 2.5 });
        blob = rendered.blob;
        mimeType = rendered.mimeType || 'image/jpeg';
      }

      if (!blob || blob.size === 0) {
        throw new Error('تولید فایل گزارش برای ارسال با خطا مواجه شد.');
      }

      const base64Data = await blobToBase64(blob);
      const captionToSend = botCaption.trim() || buildDefaultBotCaption();
      const mediaData = { data: base64Data, mimeType, filename };

      const tasks: Array<{ label: string; promise: Promise<any> }> = [];

      activeBale.forEach(chatId => {
        tasks.push({
          label: `بله (${chatId})`,
          promise: apiCall('/send-bot-message', 'POST', {
            platform: 'bale',
            chatId,
            caption: captionToSend,
            mediaData
          })
        });
      });

      activeTelegram.forEach(chatId => {
        tasks.push({
          label: `تلگرام (${chatId})`,
          promise: apiCall('/send-bot-message', 'POST', {
            platform: 'telegram',
            chatId,
            caption: captionToSend,
            mediaData
          })
        });
      });

      activeWa.forEach(chatId => {
        tasks.push({
          label: `واتس‌اپ (${chatId})`,
          promise: apiCall('/send-bot-message', 'POST', {
            platform: 'whatsapp',
            chatId,
            caption: captionToSend,
            mediaData
          })
        });
      });

      const results = await Promise.allSettled(tasks.map(t => t.promise));
      let successCount = 0;
      const failedLabels: string[] = [];

      results.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value?.success !== false) {
          successCount++;
        } else {
          const reason =
            res.status === 'rejected'
              ? res.reason?.message || 'خطای ارسال'
              : res.value?.error || res.value?.warning || 'خطای ارسال';
          failedLabels.push(`${tasks[idx].label}: ${reason}`);
        }
      });

      if (successCount > 0 && failedLabels.length === 0) {
        const msg = `گزارش بهای تمام‌شده با موفقیت به ${successCount} مقصد ارسال شد.`;
        setBotFeedback({ type: 'success', message: msg });
        toast.success(msg);
        setTimeout(() => setShowBotModal(false), 1100);
      } else if (successCount > 0) {
        const msg = `ارسال به ${successCount} مقصد موفق بود، اما ${failedLabels.length} مورد خطا داشت: ${failedLabels[0]}`;
        setBotFeedback({ type: 'error', message: msg });
        toast.error(msg);
      } else {
        const msg = failedLabels[0] || 'ارسال گزارش از طریق بات ناموفق بود.';
        setBotFeedback({ type: 'error', message: msg });
        toast.error(msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'خطا در آماده‌سازی یا ارسال گزارش به بات';
      setBotFeedback({ type: 'error', message: msg });
      toast.error(msg);
    } finally {
      setSendingBot(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    setProcessing(true);
    await generatePdf({
      elementId: 'final-cost-print-area',
      filename: `Final_Cost_Report_${regNumber}.pdf`,
      format: 'A4',
      orientation: 'portrait',
      onComplete: () => setProcessing(false),
      onError: () => {
        toast.error('خطا در تولید PDF');
        setProcessing(false);
      }
    });
  };

  const handleSendToChat = async () => {
    setProcessing(true);
    try {
      await shareElementToChat(
        'final-cost-print-area',
        `Final_Cost_Report_${regNumber}.jpg`,
        {
          defaultMessage: `گزارش بهای تمام شده نهایی پرونده شماره ${regNumber} - شرکت: ${record.company || '---'} (بهای تمام شده: ${formatCurrency(grandTotalRial || totalRial)})`,
          title: 'ارسال گزارش بهای تمام شده به گفتگو'
        }
      );
    } catch (e) {
      console.error(e);
      toast.error('خطا در آماده‌سازی گزارش بهای تمام شده جهت ارسال به گفتگو');
    } finally {
      setProcessing(false);
    }
  };

  const content = (
    <div
      id="final-cost-print-area"
      ref={printAreaRef}
      className="bg-white text-black font-sans relative text-right dir-rtl shadow-2xl flex flex-col justify-between"
      style={{
        width: '210mm',
        minHeight: '297mm',
        height: 'auto',
        padding: '8mm 11mm',
        boxSizing: 'border-box',
        margin: '0 auto',
        overflow: 'visible',
        backgroundColor: '#ffffff'
      }}
    >
      <div>
        {/* Header */}
        <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-2.5">
          <div>
            <h1 className="text-lg font-black text-gray-900 leading-tight">صورتحساب بهای تمام‌شده نهایی پرونده تجاری</h1>
            <p className="text-[11px] text-gray-600 mt-0.5">
              شرکت: <span className="font-bold text-black">{record.company}</span> | تامین‌کننده:{' '}
              <span className="font-bold text-black">{record.sellerName || '---'}</span>
            </p>
          </div>
          <div className="text-left text-[10.5px] space-y-0.5">
            <div>
              <span className="font-bold text-gray-500">شماره ثبت سفارش:</span>{' '}
              <span className="font-mono font-black">{regNumber}</span>
            </div>
            <div>
              <span className="font-bold text-gray-500">شماره پرونده:</span>{' '}
              <span className="font-mono">{record.fileNumber || '---'}</span>
            </div>
            <div>
              <span className="font-bold text-gray-500">تاریخ صدور گزارش:</span>{' '}
              <span className="font-mono font-bold">{new Date().toLocaleDateString('fa-IR')}</span>
            </div>
          </div>
        </div>

        {/* Quick Specs Summary */}
        <div className="grid grid-cols-4 gap-2 border border-black p-1.5 bg-gray-50 rounded-sm mb-2.5 text-[10.5px]">
          <div>
            <div className="text-gray-500 font-bold text-[9.5px]">مجموع وزن کل</div>
            <div className="font-mono font-black text-xs">
              {formatNumberString(totalWeight)} <span className="text-[9.5px] font-sans">کیلوگرم</span>
            </div>
          </div>
          <div>
            <div className="text-gray-500 font-bold text-[9.5px]">نوع ارز پرونده</div>
            <div className="font-black text-xs text-blue-800">{currencyStr}</div>
          </div>
          <div>
            <div className="text-gray-500 font-bold text-[9.5px]">نرخ تسعیر ارز نهایی</div>
            <div className="font-mono font-bold">{exchangeRate > 0 ? formatCurrency(exchangeRate) : 'تعیین نشده'}</div>
          </div>
          <div>
            <div className="text-gray-500 font-bold text-[9.5px]">وضعیت پرونده</div>
            <div className="font-black text-emerald-800">{record.status === 'Completed' ? 'تکمیل شده' : 'در جریان'}</div>
          </div>
        </div>

        {/* 1. Stage Expenses Table */}
        <div className="mb-2.5">
          <div className="text-[11px] font-black mb-1 flex justify-between items-center text-gray-800">
            <span>۱. ریز هزینه‌های ثبت‌شده در مراحل پرونده:</span>
          </div>
          <table className="w-full text-right border-collapse border border-black text-[10px]">
            <thead>
              <tr className="bg-gray-200 border-b border-black font-black text-gray-900">
                <th className="py-1 px-1.5 border-r border-black w-7 text-center">#</th>
                <th className="py-1 px-1.5 border-r border-black">مرحله / شرح هزینه</th>
                <th className="py-1 px-1.5 border-r border-black w-32 text-center">مبلغ ریالی (IRR)</th>
                <th className="py-1 px-1.5 border-r border-black w-28 text-center">مبلغ ارزی ({currencyStr})</th>
                <th className="py-1 px-1.5 w-36">وضعیت و توضیحات</th>
              </tr>
            </thead>
            <tbody>
              {stageKeys.map((stageKey, idx) => {
                const stageData = record.stages?.[stageKey];
                const costRial = stageData?.costRial || 0;
                const costCurrency = stageData?.costCurrency || 0;
                return (
                  <tr key={stageKey} className="border-b border-gray-300">
                    <td className="py-0.5 px-1 border-r border-black text-center font-mono text-[9.5px]">{idx + 1}</td>
                    <td className="py-0.5 px-1.5 border-r border-black font-bold">{stageKey}</td>
                    <td className="py-0.5 px-1.5 border-r border-black text-center font-mono font-bold">
                      {costRial > 0 ? formatCurrency(costRial) : '-'}
                    </td>
                    <td className="py-0.5 px-1.5 border-r border-black text-center font-mono font-bold text-blue-700">
                      {costCurrency > 0 ? `${formatNumberString(costCurrency)} ${currencyStr}` : '-'}
                    </td>
                    <td className="py-0.5 px-1.5 text-[9.5px] text-gray-600 truncate max-w-[140px]">
                      {stageData?.isCompleted ? 'تکمیل شده' : 'جاری'} {stageData?.description ? `(${stageData.description})` : ''}
                    </td>
                  </tr>
                );
              })}
              {/* Subtotals */}
              <tr className="bg-gray-100 font-bold border-t-2 border-black text-black">
                <td colSpan={2} className="py-1 px-1.5 border-r border-black text-left pl-3">
                  جمع کل هزینه‌های تفکیکی:
                </td>
                <td className="py-1 px-1.5 border-r border-black text-center font-mono text-[10.5px]">
                  {formatCurrency(tableTotalRial)}
                </td>
                <td className="py-1 px-1.5 border-r border-black text-center font-mono text-[10.5px] text-blue-800">
                  {tableTotalCurrency > 0 ? `${formatNumberString(tableTotalCurrency)} ${currencyStr}` : `۰ ${currencyStr}`}
                </td>
                <td className="py-1 px-1.5 text-[9.5px] text-gray-500">مجموع خالص ریالی + ارزی</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 2. Total Cost Consolidation Box */}
        <div className="border-2 border-black p-2 bg-gray-50 rounded-sm mb-2.5 print-avoid-break">
          <div className="text-[11px] font-black mb-1.5 text-gray-900 border-b border-gray-300 pb-1 flex justify-between">
            <span>۲. محاسبه و تجمیع نهایی بهای تمام‌شده کل:</span>
            <span className="text-[10px] font-mono text-gray-600">فرمول: (هزینه ارزی × نرخ تسعیر) + هزینه ریالی</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[10.5px]">
            <div className="space-y-1">
              <div className="flex justify-between border-b border-dashed border-gray-300 pb-0.5">
                <span className="text-gray-600">سرجمع هزینه‌های ارزی:</span>
                <span className="font-mono font-bold text-blue-700">
                  {formatNumberString(totalCurrency)} {currencyStr}
                </span>
              </div>
              <div className="flex justify-between border-b border-dashed border-gray-300 pb-0.5">
                <span className="text-gray-600">نرخ تسعیر محاسباتی:</span>
                <span className="font-mono font-bold">{exchangeRate > 0 ? formatCurrency(exchangeRate) : 'محاسبه نشده'}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-800">
                <span>ارزش ریالی بخش ارزی:</span>
                <span className="font-mono font-bold text-emerald-700">{formatCurrency(totalCurrency * exchangeRate)}</span>
              </div>
            </div>

            <div className="space-y-1 border-r border-gray-300 pr-3">
              <div className="flex justify-between border-b border-dashed border-gray-300 pb-0.5">
                <span className="text-gray-600">سرجمع هزینه‌های مستقیم ریالی:</span>
                <span className="font-mono font-bold">{formatCurrency(totalRial)}</span>
              </div>
              <div className="flex justify-between border-b border-black pb-0.5 bg-amber-100/70 px-1.5 py-0.5 rounded font-black text-black">
                <span>بهای تمام‌شده کل پرونده:</span>
                <span className="font-mono text-xs">{formatCurrency(grandTotalRial)}</span>
              </div>
              <div className="flex justify-between font-bold text-purple-900 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                <span>بهای تمام‌شده هر کیلوگرم:</span>
                <span className="font-mono font-black">{costPerKgRial > 0 ? formatCurrency(costPerKgRial) : '۰ ریال'} / kg</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Per-Item Final Cost Breakdown Table */}
        <div className="mb-2.5">
          <div className="text-[11px] font-black mb-1 flex justify-between items-center text-gray-800">
            <span>۳. قیمت تمام‌شده به تفکیک ردیف کالا ({itemCostRows.length} ردیف):</span>
            <span className="text-[9.5px] font-normal text-gray-500">
              {totalFreightCurrency > 0
                ? `سهم حمل کل: ${formatNumberString(totalFreightCurrency)} ${currencyStr} (${formatNumberString(freightPerKgCurrency)} ${currencyStr}/kg)`
                : 'بدون هزینه حمل جداگانه'}
            </span>
          </div>
          <table className="w-full text-right border-collapse border border-black text-[10px]">
            <thead>
              <tr className="bg-gray-200 border-b border-black font-black text-gray-900">
                <th className="py-1 px-1 border-r border-black w-7 text-center">ردیف</th>
                <th className="py-1 px-1.5 border-r border-black">شرح کالا</th>
                <th className="py-1 px-1 border-r border-black w-20 text-center">وزن (KG)</th>
                <th className="py-1 px-1 border-r border-black w-20 text-center">فی ارزی (خرید)</th>
                <th className="py-1 px-1 border-r border-black w-24 text-center bg-blue-50 text-blue-900">فی ارزی نهایی (با حمل)</th>
                <th className="py-1 px-1.5 border-r border-black w-32 text-center">قیمت تمام‌شده (ریال)</th>
                <th className="py-1 px-1.5 w-28 text-center">فی تمام‌شده (هر کیلو)</th>
              </tr>
            </thead>
            <tbody>
              {itemCostRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-2 text-center text-gray-500 text-[10px]">
                    هیچ ردیف کالایی برای این پرونده ثبت نشده است.
                  </td>
                </tr>
              ) : (
                <>
                  {itemCostRows.map((row, idx) => (
                    <tr key={row.id} className="border-b border-gray-300">
                      <td className="py-1 px-1 border-r border-black text-center font-mono text-[9.5px]">{idx + 1}</td>
                      <td className="py-1 px-1.5 border-r border-black font-bold text-gray-900">{row.name}</td>
                      <td className="py-1 px-1 border-r border-black text-center font-mono">{formatNumberString(row.weight)}</td>
                      <td className="py-1 px-1 border-r border-black text-center font-mono">{formatNumberString(row.unitPrice)}</td>
                      <td className="py-1 px-1 border-r border-black text-center font-mono font-bold text-blue-800 bg-blue-50/40">
                        {formatNumberString(row.itemAdjustedUnitPriceCurrency)}
                      </td>
                      <td className="py-1 px-1.5 border-r border-black text-center font-mono font-bold text-rose-800">
                        {formatCurrency(row.itemFinalCostRial)}
                      </td>
                      <td className="py-1 px-1.5 text-center font-mono font-bold bg-gray-50">
                        {formatCurrency(row.itemFinalCostPerKg)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-bold border-t-2 border-black text-black">
                    <td colSpan={2} className="py-1 px-1.5 border-r border-black text-left pl-2">
                      جمع کل اقلام ({itemCostRows.length} ردیف):
                    </td>
                    <td className="py-1 px-1 border-r border-black text-center font-mono">{formatNumberString(totalWeight)}</td>
                    <td className="py-1 px-1 border-r border-black text-center font-mono text-gray-500">-</td>
                    <td className="py-1 px-1 border-r border-black text-center font-mono text-blue-800">
                      {totalWeight > 0 && totalCurrency > 0 ? formatNumberString(totalCurrency / totalWeight) : '-'}
                    </td>
                    <td className="py-1 px-1.5 border-r border-black text-center font-mono font-black text-rose-800">
                      {formatCurrency(totalItemsFinalCostRial)}
                    </td>
                    <td className="py-1 px-1.5 text-center font-mono font-black">
                      {costPerKgRial > 0 ? formatCurrency(costPerKgRial) : '-'}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Signatures & Approvals */}
      <div className="border-t-2 border-black pt-2 mt-2 print-avoid-break">
        <div className="grid grid-cols-4 gap-2 text-center text-[9.5px]">
          <div className="border border-gray-300 p-1.5 rounded flex flex-col justify-between h-16">
            <span className="font-bold text-gray-700">کارشناس بازرگانی</span>
            <span className="text-gray-400">امضا و تاریخ</span>
          </div>
          <div className="border border-gray-300 p-1.5 rounded flex flex-col justify-between h-16">
            <span className="font-bold text-gray-700">حسابداری صنعتی</span>
            <span className="text-gray-400">امضا و تاریخ</span>
          </div>
          <div className="border border-gray-300 p-1.5 rounded flex flex-col justify-between h-16">
            <span className="font-bold text-gray-700">مدیر مالی</span>
            <span className="text-gray-400">امضا و تاریخ</span>
          </div>
          <div className="border border-black p-1.5 rounded bg-gray-100 flex flex-col justify-between h-16">
            <span className="font-black text-black">تایید مدیریت عامل</span>
            <span className="text-gray-400">مهر و امضا</span>
          </div>
        </div>
        <div className="text-center text-[8.5px] text-gray-400 mt-1.5">
          سامانه یکپارچه مدیریت بازرگانی خارجی | گزارش سیستمی
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[120] flex flex-col p-0 m-0 overflow-hidden animate-fade-in safe-top safe-bottom">
      {/* Sticky Top Header Bar */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-gray-200 dark:border-zinc-800 px-3 py-2.5 md:px-6 md:py-3 shadow-md flex items-center justify-between gap-2 flex-wrap shrink-0 no-print">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center font-bold text-xs shadow-xs">
            📊
          </div>
          <span className="font-bold text-sm md:text-base text-gray-800 dark:text-gray-100">
            پیش‌نمایش بهای تمام‌شده پرونده ({regNumber})
          </span>
        </div>

        {/* Interactive Zoom Toolbar */}
        <div className="flex items-center gap-1 md:gap-2 bg-gray-100 dark:bg-zinc-900 px-2 py-1 md:px-3 md:py-1.5 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-xs">
          <button
            onClick={handleZoomOut}
            className="p-1 md:p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            title="کوچک‌نمایی"
          >
            <ZoomOut size={16} />
          </button>

          <button
            onClick={() => handleSetZoom(1)}
            className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300 px-1.5 py-0.5 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded min-w-[44px] text-center"
            title="تنظیم به ۱۰۰٪"
          >
            {Math.round(scale * 100)}%
          </button>

          <button
            onClick={handleZoomIn}
            className="p-1 md:p-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            title="بزرگ‌نمایی"
          >
            <ZoomIn size={16} />
          </button>

          <div className="h-4 w-px bg-gray-300 dark:bg-zinc-700 mx-0.5" />

          <button
            onClick={handleResetZoom}
            className="px-2 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors flex items-center gap-1"
            title="تناسب خودکار"
          >
            <RotateCcw size={13} />
            <span className="text-[11px]">تناسب</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
          <button
            onClick={handleOpenBotModal}
            disabled={processing || sendingBot}
            className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs flex items-center gap-1.5 font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
            title="ارسال گزارش از طریق ربات بله، تلگرام یا واتساپ"
          >
            <Bot size={16} />
            <span>ارسال از طریق بات</span>
          </button>

          <button
            onClick={handleSendToChat}
            disabled={processing}
            className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs flex items-center gap-1.5 font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
            title="ارسال مستقیم به گفتگو"
          >
            {processing ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
            <span>ارسال به گفتگو</span>
          </button>

          <button
            onClick={handleDownloadPDF}
            disabled={processing}
            className="bg-red-600 hover:bg-red-700 active:scale-95 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs flex items-center gap-1.5 font-bold shadow-md transition-all disabled:opacity-50"
          >
            {processing ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            <span>دانلود PDF</span>
          </button>

          <button
            onClick={handlePrint}
            className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-xs flex items-center gap-1.5 font-bold shadow-md transition-all"
          >
            <Printer size={16} />
            <span className="hidden sm:inline">چاپ</span>
          </button>

          <button
            onClick={onClose}
            className="bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 p-2 rounded-xl transition-colors"
            title="بستن"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Main Canvas Area */}
      <main
        dir="ltr"
        className="flex-1 w-full overflow-auto bg-zinc-900/95 cursor-grab active:cursor-grabbing select-none"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x pan-y pinch-zoom'
        }}
        ref={containerWrapperRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          className="min-w-full min-h-full flex items-center justify-center p-2 md:p-6"
          style={{ width: 'max-content', height: 'max-content' }}
        >
          <div
            style={{
              width: `${210 * 3.779527559 * scale}px`,
              height: `${Math.max(297 * 3.779527559, contentHeightPx) * scale}px`,
              position: 'relative',
              flexShrink: 0,
              margin: 'auto'
            }}
          >
            <div
              dir="rtl"
              style={{
                width: '210mm',
                minHeight: '297mm',
                backgroundColor: 'white',
                boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                position: 'absolute',
                top: 0,
                left: 0
              }}
              className="printable-content rounded-md"
            >
              {content}
            </div>
          </div>
        </div>
      </main>

      {/* Send via Bot Modal */}
      {showBotModal && (
        <div
          dir="rtl"
          className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 no-print animate-fade-in"
          onClick={() => !sendingBot && setShowBotModal(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-zinc-800 flex flex-col max-h-[92vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 py-3.5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between bg-indigo-50/70 dark:bg-indigo-950/30 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                  <Bot size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900 dark:text-gray-100">
                    ارسال گزارش بهای تمام‌شده از طریق بات
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-zinc-400">
                    پرونده {regNumber} — ارسال تصویر یا PDF به بله، تلگرام و واتس‌اپ
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={sendingBot}
                onClick={() => setShowBotModal(false)}
                className="p-2 rounded-xl text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4 text-right flex-1">
              {/* Platform Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 block">
                  پلتفرم‌های مقصد:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      id: 'bale' as const,
                      label: 'بله (Bale)',
                      activeCls: 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    },
                    {
                      id: 'telegram' as const,
                      label: 'تلگرام',
                      activeCls: 'bg-sky-600 text-white border-sky-600 shadow-sm'
                    },
                    {
                      id: 'whatsapp' as const,
                      label: 'واتس‌اپ',
                      activeCls: 'bg-green-600 text-white border-green-600 shadow-sm'
                    }
                  ].map(p => {
                    const isSelected = botPlatforms.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleBotPlatform(p.id)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? p.activeCls
                            : 'bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border-gray-200 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Output File Format Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 block">
                  فرمت فایل ارسالی:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBotFileFormat('image')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      botFileFormat === 'image'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border-gray-200 dark:border-zinc-700'
                    }`}
                  >
                    <ImageIcon size={15} />
                    <span>تصویر باکیفیت (JPG)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBotFileFormat('pdf')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      botFileFormat === 'pdf'
                        ? 'bg-red-600 text-white border-red-600 shadow-sm'
                        : 'bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border-gray-200 dark:border-zinc-700'
                    }`}
                  >
                    <FileText size={15} />
                    <span>فایل PDF کامل</span>
                  </button>
                </div>
              </div>

              {/* Recipient Picker */}
              <div className="border border-gray-200 dark:border-zinc-700 rounded-2xl p-2.5 bg-gray-50/70 dark:bg-zinc-950/50">
                <SmartBotRecipientPicker
                  selectedPlatforms={botPlatforms}
                  selectedChatIdsTele={teleChatIds}
                  onChangeTele={setTeleChatIds}
                  selectedChatIdsBale={baleChatIds}
                  onChangeBale={setBaleChatIds}
                  selectedChatIdsWa={waChatIds}
                  onChangeWa={setWaChatIds}
                  settings={loadedSettings}
                  label="انتخاب گیرندگان، مخاطبین بازرگانی یا گروه‌ها:"
                  compact={true}
                />
              </div>

              {/* Caption Editor */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 dark:text-zinc-300 block">
                  متن پیام همراه گزارش:
                </label>
                <textarea
                  rows={5}
                  value={botCaption}
                  onChange={e => setBotCaption(e.target.value)}
                  className="w-full text-xs leading-relaxed bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 rounded-xl p-3 text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Inline Status / Feedback */}
              {botFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2 ${
                    botFeedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800'
                  }`}
                >
                  {botFeedback.type === 'success' ? (
                    <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  )}
                  <span>{botFeedback.message}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 border-t border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/80 flex items-center justify-between gap-2 shrink-0">
              <span className="text-[11px] font-bold text-gray-500 dark:text-zinc-400">
                {totalSelectedTargetsCount > 0
                  ? `${totalSelectedTargetsCount} مقصد انتخاب شده`
                  : 'مقصدی انتخاب نشده است'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={sendingBot}
                  onClick={() => setShowBotModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-200 hover:bg-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-200 transition-colors disabled:opacity-50"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  disabled={sendingBot || botPlatforms.length === 0 || totalSelectedTargetsCount === 0}
                  onClick={handleSendViaBot}
                  className="px-5 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {sendingBot ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  <span>{sendingBot ? 'در حال ارسال...' : 'ارسال به بات'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintFinalCostReport;
