import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ZoomIn, ZoomOut, RotateCw, Printer, FileText, AlertCircle, Maximize2, Minimize2, MessageSquare, Share2, DownloadCloud, Move } from 'lucide-react';
import { downloadAndOpenFile, saveImageToGallery } from '../services/fileService';
import { getServerHost } from '../services/apiService';
import { openSendToChat } from '../services/chatShareService';
import { printHtmlInPage, printPdfOrImageInPage, PdfOrientation } from '../utils/pdfGenerator';
import { isAndroidApp } from '../utils/platformDetection';
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
const loadPdfJsLibrary = async (disableWorker = false) => {
  if (cachedPdfJsLib) {
    if (disableWorker && cachedPdfJsLib.GlobalWorkerOptions) {
      cachedPdfJsLib.GlobalWorkerOptions.workerSrc = '';
    }
    return cachedPdfJsLib;
  }
  const pdfLib = await import('pdfjs-dist');
  if (!disableWorker) {
    try {
      // @ts-ignore
      const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      const workerUrl = workerModule.default || workerModule;
      if (pdfLib && pdfLib.GlobalWorkerOptions && workerUrl) {
        pdfLib.GlobalWorkerOptions.workerSrc = workerUrl;
      }
    } catch {
      // Fall back to workerless mode when bundled worker fails to resolve
    }
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
  const [pdfOrientation, setPdfOrientation] = useState<PdfOrientation>('portrait');
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
        const bounds = getBounds();
        const clamped = clampPanOffsets(panRef.current.x, panRef.current.y, nextZoom, bounds);
        setZoom(nextZoom);
        setPan({ x: clamped.panX, y: clamped.panY });
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
        let pdfDoc: any = null;
        try {
          const pdfjsLib = await loadPdfJsLibrary(false);
          const task = pdfjsLib.getDocument(pdfSource);
          pdfDoc = await task.promise;
        } catch (workerErr) {
          console.warn('PDF worker load failed, retrying without worker:', workerErr);
          const pdfjsLib = await loadPdfJsLibrary(true);
          const task = pdfjsLib.getDocument({ ...pdfSource, disableWorker: true });
          pdfDoc = await task.promise;
        }
        if (isCancelled) return;
        const totalPages = pdfDoc.numPages || 0;
        setPdfPageCount(totalPages);
        const renderedPages: string[] = [];

        // Render up to 25 pages at crisp high-DPI for 2-finger pinch-to-zoom & 4-way touch pan
        const maxPages = Math.min(totalPages, 25);
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          if (isCancelled) return;
          const page = await pdfDoc.getPage(pageNum);
          const baseViewport = page.getViewport({ scale: 1 });
          if (pageNum === 1 && !isCancelled) {
            setPdfOrientation(baseViewport.width > baseViewport.height ? 'landscape' : 'portrait');
          }
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
            const authToken =
              typeof localStorage !== 'undefined'
                ? localStorage.getItem('token') || sessionStorage.getItem('token')
                : null;
            const fetchHeaders: Record<string, string> = {};
            if (authToken && !resolvedUrl.startsWith('blob:')) {
              fetchHeaders.Authorization = `Bearer ${authToken}`;
            }
            const response = await fetch(resolvedUrl, { headers: fetchHeaders });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
    window.dispatchEvent(new CustomEvent('REGISTER_BACK_ACTION', { detail: onClose }));
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.dispatchEvent(new CustomEvent('REGISTER_BACK_ACTION', { detail: null }));
    };
  }, [isOpen, onClose]);

  // Align multi-page PDF stacks so Page 1 starts cleanly near the top at 1x zoom
  useEffect(() => {
    if (!isOpen || pdfPageImages.length <= 1 || useIframePdfFallback) return;
    const raf = requestAnimationFrame(() => {
      const vp = viewportRef.current;
      const ct = contentRef.current;
      if (!vp || !ct) return;
      if (zoomRef.current <= 1.01 && panRef.current.x === 0 && panRef.current.y === 0) {
        const overflowY = Math.max(0, (ct.offsetHeight - vp.clientHeight) / 2);
        if (overflowY > 0) {
          setPan({ x: 0, y: overflowY });
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, pdfPageImages.length, useIframePdfFallback]);

  // Native non-passive touch listeners for strictly 2-finger pinch-to-zoom & 4-way touch pan
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !isOpen) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.stopPropagation();
      if (e.touches.length === 2) {
        e.preventDefault();
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
        // Strictly 1-finger 4-directional pan/scroll ONLY (never zoom on 1 finger tap/double-tap)
        gestureRef.current.mode = 'pan';
        gestureRef.current.startX = touch.clientX;
        gestureRef.current.startY = touch.clientY;
        gestureRef.current.initialPanX = panRef.current.x;
        gestureRef.current.initialPanY = panRef.current.y;
        setIsTouchingGesture(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.stopPropagation();
      if (e.touches.length === 2) {
        e.preventDefault();
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
        const bounds = getBounds();
        const rawPanX = gestureRef.current.initialPanX + dx;
        const rawPanY = gestureRef.current.initialPanY + dy;
        const clamped = clampPanOffsets(rawPanX, rawPanY, zoomRef.current, bounds);

        if (
          zoomRef.current > 1.01 ||
          pdfPageImages.length > 1 ||
          bounds.contentWidth > bounds.viewportWidth ||
          bounds.contentHeight > bounds.viewportHeight
        ) {
          e.preventDefault();
          setPan({ x: clamped.panX, y: clamped.panY });
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.stopPropagation();
      if (e.touches.length === 0) {
        gestureRef.current.mode = 'none';
        setIsTouchingGesture(false);
        if (zoomRef.current < 1) {
          const bounds = getBounds();
          const clamped = clampPanOffsets(panRef.current.x, panRef.current.y, 1, bounds);
          setZoom(1);
          setPan({ x: clamped.panX, y: clamped.panY });
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
        const delta = e.deltaY < 0 ? 0.25 : -0.25;
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
    // On Android native app, save and open locally instead of spawning web popup
    if (isAndroidApp()) {
      void handleDownload();
      return;
    }

    const safeTitle = (fileName || 'سند').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    if (detectedType === 'image') {
      const imgSrc = previewUrl || resolvedUrl;
      const imgDocHtml = `<!DOCTYPE html>
<html dir="rtl" lang="fa">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      @page { size: auto; margin: 4mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0 !important; padding: 0 !important; width: 100%; height: 100%; background: #ffffff; overflow: hidden; }
      .img-wrap { width: 100%; height: 97vh; text-align: center; padding: 2mm; }
      img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; margin: 0 auto; }
    </style>
  </head>
  <body><div class="img-wrap"><img src="${imgSrc}" /></div></body>
</html>`;
      printHtmlInPage(imgDocHtml, 'portrait', fileName, { skipStyleInjection: true });
      return;
    }

    if (pdfPageImages.length > 0) {
      const isLandscape = pdfOrientation === 'landscape';
      // Stay strictly 3mm inside physical A4 bounds (210x297mm / 297x210mm) and avoid flex pagination bugs so Chrome/Electron NEVER inserts blank pages between sheets
      const pageW = isLandscape ? '294mm' : '207mm';
      const pageH = isLandscape ? '206mm' : '293mm';
      const imgsHtml = pdfPageImages
        .map((src) => `<div class="page"><img src="${src}" /></div>`)
        .join('');
      const pdfImagesHtml = `<!DOCTYPE html>
<html dir="rtl" lang="fa">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>
      @page { size: A4 ${pdfOrientation}; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0 !important; padding: 0 !important; background: #ffffff; width: 100%; }
      .page {
        width: ${pageW};
        height: ${pageH};
        max-height: ${pageH};
        margin: 0 auto;
        padding: 3mm;
        overflow: hidden;
        text-align: center;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .page:not(:last-child) {
        page-break-after: always;
        break-after: page;
      }
      .page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .page img {
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
        object-fit: contain;
        display: block;
        margin: 0 auto;
      }
    </style>
  </head>
  <body>${imgsHtml}</body>
</html>`;
      printHtmlInPage(pdfImagesHtml, pdfOrientation, fileName, { skipStyleInjection: true });
      return;
    }

    void printPdfOrImageInPage(previewUrl || resolvedUrl, 'pdf', fileName);
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
        {/* Floating Touch Zoom & 4-Way Pan Control Bar for Android & Web */}
        {isCanvasViewActive && !isLoadingPreview && !isRenderingPdfPages && !loadError && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md text-white px-3 py-1.5 rounded-full border border-white/15 shadow-2xl text-xs font-bold whitespace-nowrap"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Move size={14} className={zoom > 1.05 ? 'text-emerald-400' : 'text-blue-400'} />
            <span className="text-[11px] text-gray-200 hidden sm:inline">
              {zoom > 1.05 ? 'حرکت در ۴ جهت فعال' : 'زوم فقط با دو انگشت • حرکت در ۴ جهت'}
            </span>
            <div className="flex items-center gap-1 mr-1">
              <button
                type="button"
                onClick={resetViewTransform}
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono transition ${
                  zoom <= 1.05 ? 'bg-blue-600 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-200'
                }`}
              >
                1x
              </button>
              <button
                type="button"
                onClick={() => applyZoomLevel(2)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono transition ${
                  zoom > 1.5 && zoom < 2.8 ? 'bg-blue-600 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-200'
                }`}
              >
                2x
              </button>
              <button
                type="button"
                onClick={() => applyZoomLevel(3.5)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono transition ${
                  zoom >= 2.8 ? 'bg-blue-600 text-white' : 'bg-white/10 hover:bg-white/20 text-gray-200'
                }`}
              >
                3.5x
              </button>
              {zoom > 1.05 && (
                <button
                  type="button"
                  onClick={resetViewTransform}
                  className="px-2 py-0.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-full text-[10px]"
                >
                  مرکز ({Math.round(zoom * 100)}%)
                </button>
              )}
            </div>
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
