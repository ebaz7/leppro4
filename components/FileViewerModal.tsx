import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ZoomIn, ZoomOut, RotateCw, Printer, FileText, AlertCircle, Maximize2, Minimize2, MessageSquare, Share2, DownloadCloud, Move } from 'lucide-react';
import { downloadAndOpenFile, saveImageToGallery } from '../services/fileService';
import { getServerHost } from '../services/apiService';
import { openSendToChat } from '../services/chatShareService';
import {
  clampZoom,
  clampPanOffsets,
  computePinchZoomPan,
  getTouchDistance,
  getTouchMidpoint,
} from '../utils/touchZoomPan';

const resolveImageUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const host = (getServerHost() || '').replace(/\/+$/, '');
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;
  return host ? `${host}${cleanUrl}` : cleanUrl;
};

let cachedPdfJsLib: any = null;
const loadPdfJsLibrary = async () => {
  if (cachedPdfJsLib) return cachedPdfJsLib;
  const pdfLib = await import('pdfjs-dist');
  // @ts-ignore
  const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  const workerUrl = workerModule.default || workerModule;
  if (pdfLib && pdfLib.GlobalWorkerOptions) {
    pdfLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  cachedPdfJsLib = pdfLib;
  return cachedPdfJsLib;
};

interface FileViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName?: string;
  fileType?: 'image' | 'pdf' | 'auto';
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  fileName = 'فایل پیوست',
  fileType = 'auto',
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSavingGallery, setIsSavingGallery] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [isTouchingGesture, setIsTouchingGesture] = useState<boolean>(false);

  // Interactive Canvas PDF states for reliable Android/WebView pinch-zoom & 4-way panning
  const [pdfPageImages, setPdfPageImages] = useState<string[]>([]);
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [isRenderingPdfPages, setIsRenderingPdfPages] = useState<boolean>(false);
  const [useIframePdfFallback, setUseIframePdfFallback] = useState<boolean>(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Refs for gesture tracking without React re-render lag
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  zoomRef.current = zoom;
  panRef.current = pan;

  const gestureRef = useRef<{
    mode: 'none' | 'pan' | 'pinch';
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
    initialScale: number;
    initialDistance: number;
    initialMidpoint: { x: number; y: number };
    lastTapTime: number;
    lastTapX: number;
    lastTapY: number;
    isMouseDragging: boolean;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    initialPanX: 0,
    initialPanY: 0,
    initialScale: 1,
    initialDistance: 0,
    initialMidpoint: { x: 0, y: 0 },
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
    isMouseDragging: false,
  });

  const resolvedUrl = resolveImageUrl(fileUrl);

  // Detect file type
  const detectedType = React.useMemo(() => {
    if (fileType !== 'auto') return fileType;
    const lowerUrl = (fileUrl || '').toLowerCase();
    const lowerName = (fileName || '').toLowerCase();
    if (
      lowerUrl.startsWith('data:application/pdf') ||
      lowerUrl.endsWith('.pdf') ||
      lowerName.endsWith('.pdf') ||
      lowerUrl.includes('/pdf') ||
      lowerUrl.includes('type=pdf')
    ) {
      return 'pdf';
    }
    return 'image';
  }, [fileUrl, fileName, fileType]);

  const resetViewTransform = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  const getBounds = useCallback(() => {
    const vp = viewportRef.current;
    const ct = contentRef.current;
    return {
      viewportWidth: vp?.clientWidth || window.innerWidth,
      viewportHeight: vp?.clientHeight || window.innerHeight * 0.82,
      contentWidth: ct?.offsetWidth || vp?.clientWidth || window.innerWidth,
      contentHeight: ct?.offsetHeight || vp?.clientHeight || window.innerHeight * 0.82,
    };
  }, []);

  const applyZoomLevel = useCallback(
    (nextZoomRaw: number, focalPoint?: { x: number; y: number }) => {
      const nextZoom = clampZoom(nextZoomRaw);
      if (nextZoom <= 1.01) {
        setZoom(nextZoom);
        setPan({ x: 0, y: 0 });
        return;
      }
      const prevZoom = zoomRef.current || 1;
      const bounds = getBounds();
      let nextPanX = panRef.current.x * (nextZoom / prevZoom);
      let nextPanY = panRef.current.y * (nextZoom / prevZoom);

      if (focalPoint && viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const fx = focalPoint.x - cx;
        const fy = focalPoint.y - cy;
        const ratio = nextZoom / prevZoom;
        nextPanX = fx - (fx - panRef.current.x) * ratio;
        nextPanY = fy - (fy - panRef.current.y) * ratio;
      }

      const clamped = clampPanOffsets(nextPanX, nextPanY, nextZoom, bounds);
      setZoom(nextZoom);
      setPan({ x: clamped.panX, y: clamped.panY });
    },
    [getBounds]
  );

  useEffect(() => {
    if (!isOpen || !fileUrl) {
      setPreviewUrl('');
      setPdfPageImages([]);
      setPdfPageCount(0);
      setUseIframePdfFallback(false);
      return;
    }

    resetViewTransform();
    setLoadError(false);
    setPdfPageImages([]);
    setPdfPageCount(0);
    setUseIframePdfFallback(false);

    let objectUrlToRevoke: string | null = null;
    let isCancelled = false;

    const renderPdfToImages = async (pdfSource: { data?: ArrayBuffer; url?: string }) => {
      setIsRenderingPdfPages(true);
      try {
        const pdfjsLib = await loadPdfJsLibrary();
        const loadingTask = pdfjsLib.getDocument(pdfSource);
        const pdfDoc = await loadingTask.promise;
        if (isCancelled) return;
        const totalPages = pdfDoc.numPages || 0;
        setPdfPageCount(totalPages);
        const renderedPages: string[] = [];

        // Render up to 25 pages at crisp high-DPI for pinch-to-zoom & 4-way touch pan
        const maxPages = Math.min(totalPages, 25);
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          if (isCancelled) return;
          const page = await pdfDoc.getPage(pageNum);
          const baseViewport = page.getViewport({ scale: 1 });
          const targetScale = baseViewport.width < 900 ? 2.0 : 1.6;
          const viewport = page.getViewport({ scale: targetScale });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            renderedPages.push(canvas.toDataURL('image/jpeg', 0.92));
            if (!isCancelled) {
              setPdfPageImages([...renderedPages]);
            }
          }
        }
        if (renderedPages.length === 0 && !isCancelled) {
          setUseIframePdfFallback(true);
        }
      } catch (err) {
        console.warn('PDF canvas rendering fallback to native viewer:', err);
        if (!isCancelled) {
          setUseIframePdfFallback(true);
        }
      } finally {
        if (!isCancelled) {
          setIsRenderingPdfPages(false);
        }
      }
    };

    const preparePreview = async () => {
      setIsLoadingPreview(true);
      try {
        if (resolvedUrl.startsWith('data:')) {
          const arr = resolvedUrl.split(',');
          const mimeMatch = arr[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : detectedType === 'pdf' ? 'application/pdf' : 'image/png';
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const blob = new Blob([u8arr], { type: mime });
          objectUrlToRevoke = URL.createObjectURL(blob);
          if (!isCancelled) {
            setPreviewUrl(objectUrlToRevoke);
          }
          if (detectedType === 'pdf' && !isCancelled) {
            await renderPdfToImages({ data: u8arr.buffer });
          }
        } else if (detectedType === 'pdf') {
          try {
            const response = await fetch(resolvedUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const arrayBuffer = await response.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
            objectUrlToRevoke = URL.createObjectURL(blob);
            if (!isCancelled) {
              setPreviewUrl(objectUrlToRevoke);
            }
            if (!isCancelled) {
              await renderPdfToImages({ data: arrayBuffer });
            }
          } catch (fetchErr) {
            console.warn('Fallback to direct PDF URL for preview:', fetchErr);
            if (!isCancelled) {
              setPreviewUrl(resolvedUrl);
              await renderPdfToImages({ url: resolvedUrl });
            }
          }
        } else {
          if (!isCancelled) {
            setPreviewUrl(resolvedUrl);
          }
        }
      } catch (err) {
        console.error('Error preparing file preview:', err);
        if (!isCancelled) {
          setPreviewUrl(resolvedUrl);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPreview(false);
        }
      }
    };

    preparePreview();

    return () => {
      isCancelled = true;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [isOpen, fileUrl, resolvedUrl, detectedType, resetViewTransform]);

  // Handle Escape key & Android hardware back button
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Native non-passive touch listeners for silky-smooth 2-finger pinch-to-zoom & 4-way touch pan
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !isOpen) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        e.stopPropagation();
        const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        gestureRef.current.mode = 'pinch';
        gestureRef.current.initialDistance = getTouchDistance(p1, p2);
        gestureRef.current.initialMidpoint = getTouchMidpoint(p1, p2);
        gestureRef.current.initialScale = zoomRef.current;
        gestureRef.current.initialPanX = panRef.current.x;
        gestureRef.current.initialPanY = panRef.current.y;
        setIsTouchingGesture(true);
      } else if (e.touches.length === 1) {
        const touch = e.touches[0];
        const now = Date.now();
        const dt = now - gestureRef.current.lastTapTime;
        const dist = Math.hypot(
          touch.clientX - gestureRef.current.lastTapX,
          touch.clientY - gestureRef.current.lastTapY
        );

        // Double-tap to toggle zoom (1x <-> 2.4x centered on tap point)
        if (dt > 40 && dt < 320 && dist < 36) {
          e.preventDefault();
          e.stopPropagation();
          gestureRef.current.lastTapTime = 0;
          if (zoomRef.current > 1.15) {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          } else {
            applyZoomLevel(2.4, { x: touch.clientX, y: touch.clientY });
          }
          return;
        }

        gestureRef.current.lastTapTime = now;
        gestureRef.current.lastTapX = touch.clientX;
        gestureRef.current.lastTapY = touch.clientY;

        // Enable 1-finger 4-direction touch panning whenever zoomed in (or for images at any zoom)
        if (zoomRef.current > 1.01 || detectedType === 'image' || pdfPageImages.length > 0) {
          gestureRef.current.mode = 'pan';
          gestureRef.current.startX = touch.clientX;
          gestureRef.current.startY = touch.clientY;
          gestureRef.current.initialPanX = panRef.current.x;
          gestureRef.current.initialPanY = panRef.current.y;
          setIsTouchingGesture(true);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        e.stopPropagation();
        const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };

        if (gestureRef.current.mode !== 'pinch') {
          gestureRef.current.mode = 'pinch';
          gestureRef.current.initialDistance = getTouchDistance(p1, p2);
          gestureRef.current.initialMidpoint = getTouchMidpoint(p1, p2);
          gestureRef.current.initialScale = zoomRef.current;
          gestureRef.current.initialPanX = panRef.current.x;
          gestureRef.current.initialPanY = panRef.current.y;
        }

        const rect = el.getBoundingClientRect();
        const viewportCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };

        const next = computePinchZoomPan({
          initialScale: gestureRef.current.initialScale,
          initialPanX: gestureRef.current.initialPanX,
          initialPanY: gestureRef.current.initialPanY,
          initialDistance: gestureRef.current.initialDistance,
          currentDistance: getTouchDistance(p1, p2),
          initialMidpoint: gestureRef.current.initialMidpoint,
          currentMidpoint: getTouchMidpoint(p1, p2),
          viewportCenter,
          bounds: getBounds(),
        });

        setZoom(next.scale);
        setPan({ x: next.panX, y: next.panY });
      } else if (e.touches.length === 1 && gestureRef.current.mode === 'pan') {
        const touch = e.touches[0];
        const dx = touch.clientX - gestureRef.current.startX;
        const dy = touch.clientY - gestureRef.current.startY;

        if (zoomRef.current > 1.01) {
          // Full 4-directional touch panning (left, right, up, down) when zoomed
          e.preventDefault();
          e.stopPropagation();
          const rawPanX = gestureRef.current.initialPanX + dx;
          const rawPanY = gestureRef.current.initialPanY + dy;
          const clamped = clampPanOffsets(rawPanX, rawPanY, zoomRef.current, getBounds());
          setPan({ x: clamped.panX, y: clamped.panY });
        } else if (pdfPageImages.length > 1) {
          // At 1x zoom on multi-page PDF, allow vertical scrolling through pages via panY
          e.preventDefault();
          e.stopPropagation();
          const bounds = getBounds();
          const maxVerticalScroll = Math.max(0, (bounds.contentHeight - bounds.viewportHeight) / 2 + 120);
          const nextY = Math.min(maxVerticalScroll, Math.max(-maxVerticalScroll, gestureRef.current.initialPanY + dy));
          setPan({ x: 0, y: nextY });
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        gestureRef.current.mode = 'none';
        setIsTouchingGesture(false);
        if (zoomRef.current < 1) {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }
      } else if (e.touches.length === 1) {
        // Transition seamlessly from 2-finger pinch back to 1-finger 4-way pan without jumping
        const touch = e.touches[0];
        gestureRef.current.mode = 'pan';
        gestureRef.current.startX = touch.clientX;
        gestureRef.current.startY = touch.clientY;
        gestureRef.current.initialPanX = panRef.current.x;
        gestureRef.current.initialPanY = panRef.current.y;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || zoomRef.current > 1.01) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.2 : -0.2;
        applyZoomLevel(zoomRef.current + delta, { x: e.clientX, y: e.clientY });
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);
    el.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      el.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen, detectedType, pdfPageImages.length, applyZoomLevel, getBounds]);

  // Desktop mouse drag panning when zoomed in
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomRef.current <= 1.01 && pdfPageImages.length <= 1) return;
    e.preventDefault();
    gestureRef.current.isMouseDragging = true;
    gestureRef.current.startX = e.clientX;
    gestureRef.current.startY = e.clientY;
    gestureRef.current.initialPanX = panRef.current.x;
    gestureRef.current.initialPanY = panRef.current.y;
    setIsTouchingGesture(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!gestureRef.current.isMouseDragging) return;
    const dx = e.clientX - gestureRef.current.startX;
    const dy = e.clientY - gestureRef.current.startY;
    const clamped = clampPanOffsets(
      gestureRef.current.initialPanX + dx,
      gestureRef.current.initialPanY + dy,
      Math.max(zoomRef.current, pdfPageImages.length > 1 ? 1.5 : 1),
      getBounds()
    );
    setPan({ x: clamped.panX, y: clamped.panY });
  };

  const handleMouseUp = () => {
    if (gestureRef.current.isMouseDragging) {
      gestureRef.current.isMouseDragging = false;
      setIsTouchingGesture(false);
    }
  };

  if (!isOpen || !fileUrl) return null;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      let finalName = fileName || 'document';
      if (detectedType === 'pdf' && !finalName.toLowerCase().endsWith('.pdf')) {
        finalName += '.pdf';
      } else if (detectedType === 'image' && !/\.(jpg|jpeg|png|webp|gif)$/i.test(finalName)) {
        finalName += '.png';
      }
      await downloadAndOpenFile(resolvedUrl, finalName);
    } catch (error) {
      console.error('Error downloading file:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSaveToGallery = async () => {
    setIsSavingGallery(true);
    try {
      let finalName = fileName || `image_${Date.now()}.jpg`;
      if (!/\.(jpg|jpeg|png|webp)$/i.test(finalName)) {
        finalName += '.jpg';
      }
      await saveImageToGallery(resolvedUrl, finalName);
    } catch (error) {
      console.error('Error saving to gallery:', error);
    } finally {
      setIsSavingGallery(false);
    }
  };

  const handleSendToChat = async () => {
    try {
      let finalName = fileName || (detectedType === 'pdf' ? 'document.pdf' : 'image.jpg');
      if (detectedType === 'pdf' && !finalName.toLowerCase().endsWith('.pdf')) finalName += '.pdf';
      if (detectedType === 'image' && !/\.(jpg|jpeg|png|webp)$/i.test(finalName)) finalName += '.jpg';
      openSendToChat({
        fileUrl: resolvedUrl,
        fileName: finalName,
        defaultMessage: `📎 فایل پیوست: ${fileName || finalName}`,
        title: `ارسال «${fileName || finalName}» به گفتگو`,
      });
    } catch (err) {
      console.error('Failed to prepare file for chat share:', err);
      alert('خطا در آماده‌سازی فایل جهت ارسال به گفتگو');
    }
  };

  const handleShareNative = async () => {
    try {
      let finalName = fileName || (detectedType === 'pdf' ? 'document.pdf' : 'image.jpg');
      if (detectedType === 'pdf' && !finalName.toLowerCase().endsWith('.pdf')) finalName += '.pdf';
      if (detectedType === 'image' && !/\.(jpg|jpeg|png|webp)$/i.test(finalName)) finalName += '.jpg';

      if (navigator.share) {
        try {
          const response = await fetch(previewUrl || resolvedUrl);
          const blob = await response.blob();
          const file = new File([blob], finalName, { type: blob.type });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: finalName,
              text: `فایل پیوست: ${finalName}`,
              files: [file],
            });
            return;
          }
        } catch {}
        await navigator.share({
          title: finalName,
          url: resolvedUrl,
        });
        return;
      }
      await handleDownload();
    } catch (err) {
      console.warn('Share cancelled or failed:', err);
    }
  };

  const handlePrint = () => {
    const printWin = window.open('', '_blank');
    if (!printWin) {
      window.print();
      return;
    }

    if (detectedType === 'image') {
      printWin.document.write(`
        <html dir="rtl">
          <head>
            <title>${fileName}</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; }
              img { max-width: 100%; max-height: 100vh; object-fit: contain; }
              @media print { body { margin: 0; } img { max-height: 98vh; } }
            </style>
          </head>
          <body>
            <img src="${previewUrl || resolvedUrl}" onload="setTimeout(() => { window.print(); window.close(); }, 300);" />
          </body>
        </html>
      `);
      printWin.document.close();
    } else if (pdfPageImages.length > 0) {
      const imgsHtml = pdfPageImages.map((src) => `<div class="page"><img src="${src}" /></div>`).join('');
      printWin.document.write(`
        <html dir="rtl">
          <head>
            <title>${fileName}</title>
            <style>
              body { margin: 0; background: #fff; }
              .page { page-break-after: always; display: flex; justify-content: center; align-items: center; }
              img { max-width: 100%; height: auto; }
            </style>
          </head>
          <body>
            ${imgsHtml}
            <script>window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 400); };</script>
          </body>
        </html>
      `);
      printWin.document.close();
    } else {
      printWin.location.href = previewUrl || resolvedUrl;
    }
  };

  const isCanvasViewActive = detectedType === 'image' || (detectedType === 'pdf' && !useIframePdfFallback);

  const modalContent = (
    <div
      className="fixed inset-0 z-[100000] bg-slate-950/95 backdrop-blur-md flex flex-col overflow-hidden animate-fade-in select-none"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      onClick={onClose}
      dir="rtl"
    >
      {/* Top Action Bar - Compact, responsive, single-line friendly on Android */}
      <div
        className="w-full px-2.5 sm:px-5 py-2.5 bg-slate-900/95 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 z-20 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-white min-w-0 flex-1">
          <div className="p-2 bg-white/10 rounded-xl shrink-0">
            <FileText size={18} className="text-blue-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-xs sm:text-sm truncate max-w-[140px] sm:max-w-md" title={fileName}>
              {fileName}
            </h3>
            <p className="text-[10px] text-gray-400 truncate">
              {detectedType === 'pdf'
                ? pdfPageCount > 0
                  ? `سند PDF (${pdfPageCount.toLocaleString('fa-IR')} صفحه) • زوم با دو انگشت`
                  : 'سند PDF • زوم با دو انگشت'
                : 'تصویر • زوم با دو انگشت و حرکت در ۴ جهت'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-end">
          {isCanvasViewActive && (
            <div className="flex items-center gap-0.5 bg-white/10 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => applyZoomLevel(zoom + 0.35)}
                className="p-1.5 text-white hover:bg-white/20 rounded-lg transition"
                title="بزرگنمایی"
              >
                <ZoomIn size={16} />
              </button>
              <button
                onClick={resetViewTransform}
                className="text-[10px] text-white font-mono px-1.5 py-0.5 hover:bg-white/20 rounded transition min-w-[38px] text-center"
                title="بازنشانی زوم و مرکز"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => applyZoomLevel(zoom - 0.35)}
                className="p-1.5 text-white hover:bg-white/20 rounded-lg transition"
                title="کوچکنمایی"
              >
                <ZoomOut size={16} />
              </button>
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1.5 text-white hover:bg-white/20 rounded-lg transition"
                title="چرخش ۹۰ درجه"
              >
                <RotateCw size={16} />
              </button>
            </div>
          )}

          {detectedType === 'pdf' && (
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="hidden sm:flex p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition border border-white/10"
              title={isFullscreen ? 'خروج از تمام صفحه' : 'تمام صفحه'}
            >
              {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          )}

          <button
            onClick={handlePrint}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition border border-white/10"
            title="چاپ"
          >
            <Printer size={17} />
          </button>

          <button
            onClick={handleSendToChat}
            className="flex items-center gap-1 px-2.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition shadow-lg whitespace-nowrap"
            title="ارسال مستقیم به گفتگو"
          >
            <MessageSquare size={15} />
            <span className="hidden md:inline">ارسال به گفتگو</span>
          </button>

          <button
            onClick={handleShareNative}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition border border-white/10"
            title="اشتراک‌گذاری"
          >
            <Share2 size={16} />
          </button>

          {detectedType === 'image' ? (
            <button
              onClick={handleSaveToGallery}
              disabled={isSavingGallery}
              className="flex items-center gap-1 px-2.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition shadow-lg disabled:opacity-50 whitespace-nowrap"
              title="ذخیره مستقیم تصویر در گالری گوشی"
            >
              <DownloadCloud size={16} />
              <span>{isSavingGallery ? '...' : 'ذخیره در گالری'}</span>
            </button>
          ) : (
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center gap-1 px-2.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition shadow-lg disabled:opacity-50 whitespace-nowrap"
            >
              <Download size={16} />
              <span>{isDownloading ? '...' : 'دانلود PDF'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white rounded-xl transition border border-red-500/30"
            title="بستن"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Interactive Touch Viewport */}
      <div
        ref={viewportRef}
        className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center"
        style={{
          touchAction: isCanvasViewActive ? 'none' : 'auto',
          cursor: zoom > 1.01 ? (isTouchingGesture ? 'grabbing' : 'grab') : 'default',
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Floating Reset & Touch Hint Pill when zoomed */}
        {zoom > 1.05 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-900/90 text-white px-3.5 py-1.5 rounded-full border border-white/15 shadow-xl text-xs font-bold">
            <Move size={14} className="text-blue-400" />
            <span>حرکت در ۴ جهت فعال است ({Math.round(zoom * 100)}%)</span>
            <button
              onClick={resetViewTransform}
              className="mr-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-500 rounded-full text-[10px]"
            >
              بازنشانی
            </button>
          </div>
        )}

        {isLoadingPreview || isRenderingPdfPages ? (
          <div className="flex flex-col items-center gap-3 text-white">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold">
              {detectedType === 'pdf' ? 'در حال آماده‌سازی صفحات PDF با قابلیت زوم لمسی...' : 'در حال بارگذاری پیش‌نمایش فایل...'}
            </p>
          </div>
        ) : loadError ? (
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-md text-center text-white space-y-4 mx-4">
            <AlertCircle size={48} className="text-amber-400 mx-auto" />
            <h4 className="font-bold text-lg">امکان نمایش مستقیم فایل وجود ندارد</h4>
            <p className="text-xs text-gray-300 leading-relaxed">
              ممکن است فرمت فایل توسط مرورگر پشتیبانی نشود. می‌توانید فایل را دانلود و مشاهده نمایید.
            </p>
            <button
              onClick={handleDownload}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <Download size={18} />
              دانلود و باز کردن فایل
            </button>
          </div>
        ) : detectedType === 'image' ? (
          <div
            ref={contentRef}
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              transition: isTouchingGesture ? 'none' : 'transform 120ms cubic-bezier(0.2, 0, 0.2, 1)',
              willChange: 'transform',
            }}
            className="flex items-center justify-center p-2 sm:p-4"
          >
            <img
              src={previewUrl || resolvedUrl}
              alt={fileName}
              onError={() => setLoadError(true)}
              draggable={false}
              className="max-w-[94vw] max-h-[82vh] object-contain rounded-lg shadow-2xl select-none pointer-events-none"
            />
          </div>
        ) : pdfPageImages.length > 0 && !useIframePdfFallback ? (
          <div
            ref={contentRef}
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              transition: isTouchingGesture ? 'none' : 'transform 120ms cubic-bezier(0.2, 0, 0.2, 1)',
              willChange: 'transform',
            }}
            className="flex flex-col items-center gap-4 p-2 sm:p-4 max-w-[95vw]"
          >
            {pdfPageImages.map((pageSrc, idx) => (
              <div key={idx} className="relative bg-white rounded-lg shadow-2xl overflow-hidden">
                <img
                  src={pageSrc}
                  alt={`${fileName} - صفحه ${idx + 1}`}
                  draggable={false}
                  className="max-w-[92vw] sm:max-w-[80vw] max-h-[80vh] w-auto h-auto object-contain select-none pointer-events-none block"
                />
                {pdfPageImages.length > 1 && (
                  <span className="absolute bottom-2 left-2 bg-slate-900/75 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    صفحه {(idx + 1).toLocaleString('fa-IR')} از {pdfPageCount.toLocaleString('fa-IR')}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`bg-white rounded-2xl overflow-hidden shadow-2xl border border-white/20 flex flex-col transition-all ${
              isFullscreen ? 'w-full h-full rounded-none' : 'w-[96vw] max-w-5xl h-[82vh]'
            }`}
          >
            <iframe
              src={`${previewUrl || resolvedUrl}#toolbar=1&navpanes=1`}
              title={fileName}
              className="w-full flex-1 border-0"
              onError={() => setLoadError(true)}
            />
            <div className="bg-slate-900 text-gray-300 px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 border-t border-white/10">
              <span>اگر فایل PDF در گوشی شما باز نشد، دکمه روبرو را بزنید:</span>
              <button
                onClick={handleDownload}
                className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
              >
                <Download size={14} />
                باز کردن با برنامه PDF گوشی / دانلود
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default FileViewerModal;
