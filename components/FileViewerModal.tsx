import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ZoomIn, ZoomOut, RotateCw, Printer, FileText, AlertCircle, Maximize2, Minimize2, MessageSquare, Share2, DownloadCloud, Move } from 'lucide-react';
import { downloadAndOpenFile, saveImageToGallery } from '../services/fileService';
import { getAuthToken, getServerHost } from '../services/apiService';
import { openSendToChat } from '../services/chatShareService';
import { printHtmlInPage, printPdfOrImageInPage, PdfOrientation } from '../utils/pdfGenerator';
import { isAndroidApp, hasPhoneGallery, isTouchMobileDevice } from '../utils/platformDetection';
import {
  clampZoom,
  getTouchDistance,
  getTouchMidpoint,
} from '../utils/touchZoomPan';

const INITIAL_PDF_BATCH = 8;

interface RenderedPdfPage {
  url: string;
  width: number;
  height: number;
  isBlobUrl: boolean;
}

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
  if (cachedPdfJsLib) {
    return cachedPdfJsLib;
  }
  const pdfLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    // @ts-ignore
    const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    const workerUrl = workerModule.default || workerModule;
    if (pdfLib && pdfLib.GlobalWorkerOptions && workerUrl) {
      pdfLib.GlobalWorkerOptions.workerSrc = workerUrl;
    }
  } catch (workerImportErr) {
    console.warn('PDF legacy worker URL import warning:', workerImportErr);
  }
  cachedPdfJsLib = pdfLib;
  return cachedPdfJsLib;
};

const canvasToPageUrl = (canvas: HTMLCanvasElement, quality: number): Promise<{ url: string; isBlobUrl: boolean }> => {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      try {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ url: URL.createObjectURL(blob), isBlobUrl: true });
            } else {
              resolve({ url: canvas.toDataURL('image/jpeg', quality), isBlobUrl: false });
            }
          },
          'image/jpeg',
          quality
        );
        return;
      } catch {
        // fallback below
      }
    }
    resolve({ url: canvas.toDataURL('image/jpeg', quality), isBlobUrl: false });
  });
};

const canvasToDataUrlForPrint = async (page: RenderedPdfPage): Promise<string> => {
  if (!page.isBlobUrl) return page.url;
  try {
    const res = await fetch(page.url);
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : page.url);
      reader.onerror = () => resolve(page.url);
      reader.readAsDataURL(blob);
    });
  } catch {
    return page.url;
  }
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
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSavingGallery, setIsSavingGallery] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<boolean>(false);
  const [isTouchingGesture, setIsTouchingGesture] = useState<boolean>(false);

  // Interactive Canvas PDF states for reliable Android/Mobile WebView pinch-zoom & 4-way panning
  const [pdfPageImages, setPdfPageImages] = useState<RenderedPdfPage[]>([]);
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [pdfOrientation, setPdfOrientation] = useState<PdfOrientation>('portrait');
  const [isRenderingPdfPages, setIsRenderingPdfPages] = useState<boolean>(false);
  const [isLoadingMorePdfPages, setIsLoadingMorePdfPages] = useState<boolean>(false);
  const [useIframePdfFallback, setUseIframePdfFallback] = useState<boolean>(false);

  // Measured container & content base dimensions for exact scrollable sizer math
  const [baseSize, setBaseSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);
  const pdfBytesRef = useRef<Uint8Array | null>(null);
  const pageBlobUrlsRef = useRef<string[]>([]);
  const activeModalSessionRef = useRef<number>(0);

  const isMobileTouch = isTouchMobileDevice();
  const isNativeAndroid = isAndroidApp();
  const shouldUseMobilePdfCanvas = isMobileTouch || isNativeAndroid;
  const showPhoneGallery = hasPhoneGallery();

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

  const isCanvasViewActive = detectedType === 'image' || (detectedType === 'pdf' && !useIframePdfFallback);
  const isZoomedOrRotated = zoom > 1.01 || rotation !== 0;

  const isRotated90 = rotation % 180 === 90;
  const rawBaseW = baseSize.width || viewportSize.width || 320;
  const rawBaseH = baseSize.height || viewportSize.height || 320;
  const unscaledW = isRotated90 ? rawBaseH : rawBaseW;
  const unscaledH = isRotated90 ? rawBaseW : rawBaseH;
  const sizerW = Math.max(viewportSize.width || 0, Math.ceil(unscaledW * zoom));
  const sizerH = Math.max(viewportSize.height || 0, Math.ceil(unscaledH * zoom));

  // Refs for gesture handlers without React re-render lag
  const zoomRef = useRef(1);
  const unscaledRef = useRef({ w: unscaledW, h: unscaledH });
  const sizerRef = useRef({ w: sizerW, h: sizerH });
  zoomRef.current = zoom;
  unscaledRef.current = { w: unscaledW, h: unscaledH };
  sizerRef.current = { w: sizerW, h: sizerH };

  const revokePageBlobUrls = useCallback(() => {
    if (pageBlobUrlsRef.current.length > 0) {
      pageBlobUrlsRef.current.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch {}
      });
      pageBlobUrlsRef.current = [];
    }
  }, []);

  const gestureRef = useRef<{
    mode: 'none' | 'pan' | 'pinch';
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
    initialScale: number;
    initialDistance: number;
    initialMidpoint: { x: number; y: number };
    initialSizerW: number;
    initialSizerH: number;
    isMouseDragging: boolean;
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    initialScale: 1,
    initialDistance: 0,
    initialMidpoint: { x: 0, y: 0 },
    initialSizerW: 0,
    initialSizerH: 0,
    isMouseDragging: false,
  });

  const resetViewTransform = useCallback(() => {
    pendingScrollRef.current = { left: 0, top: 0 };
    setZoom(1);
    setRotation(0);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    }
  }, []);

  const applyZoomLevel = useCallback(
    (nextZoomRaw: number, focalPoint?: { x: number; y: number }) => {
      const nextZoom = clampZoom(nextZoomRaw, 1, 8);
      const prevZoom = zoomRef.current || 1;
      const vp = viewportRef.current;

      if (vp) {
        const vpW = vp.clientWidth || 320;
        const vpH = vp.clientHeight || 320;
        const { w: uW, h: uH } = unscaledRef.current;
        const prevSizerW = Math.max(vpW, Math.ceil(uW * prevZoom));
        const prevSizerH = Math.max(vpH, Math.ceil(uH * prevZoom));
        const nextSizerW = Math.max(vpW, Math.ceil(uW * nextZoom));
        const nextSizerH = Math.max(vpH, Math.ceil(uH * nextZoom));

        if (nextZoom <= 1.01) {
          const centerOffsetRatioY = prevSizerH > 0 ? (vp.scrollTop + vpH / 2) / prevSizerH : 0;
          const targetTop = Math.max(0, Math.min(nextSizerH - vpH, centerOffsetRatioY * nextSizerH - vpH / 2));
          pendingScrollRef.current = { left: 0, top: uH > vpH ? targetTop : 0 };
        } else {
          const rect = vp.getBoundingClientRect();
          const localX = focalPoint ? focalPoint.x - rect.left : vpW / 2;
          const localY = focalPoint ? focalPoint.y - rect.top : vpH / 2;
          const offX = (vp.scrollLeft + localX - prevSizerW / 2) / prevZoom;
          const offY = (vp.scrollTop + localY - prevSizerH / 2) / prevZoom;
          const rawLeft = nextSizerW / 2 + offX * nextZoom - localX;
          const rawTop = nextSizerH / 2 + offY * nextZoom - localY;
          pendingScrollRef.current = {
            left: Math.max(0, Math.min(Math.max(0, nextSizerW - vpW), rawLeft)),
            top: Math.max(0, Math.min(Math.max(0, nextSizerH - vpH), rawTop)),
          };
        }
      }

      setZoom(nextZoom);
    },
    []
  );

  // Apply computed scroll coordinates immediately after sizer expands/contracts
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !pendingScrollRef.current) return;
    const { left, top } = pendingScrollRef.current;
    pendingScrollRef.current = null;
    vp.scrollLeft = Math.max(0, left);
    vp.scrollTop = Math.max(0, top);
  }, [zoom, rotation, sizerW, sizerH]);

  // Measure viewport & unscaled content bounds via ResizeObserver
  useEffect(() => {
    if (!isOpen) return;
    const vp = viewportRef.current;
    const ct = contentRef.current;

    const updateSizes = () => {
      if (vp) {
        setViewportSize((prev) =>
          Math.abs(prev.width - vp.clientWidth) <= 1 && Math.abs(prev.height - vp.clientHeight) <= 1
            ? prev
            : { width: vp.clientWidth, height: vp.clientHeight }
        );
      }
      if (ct && zoomRef.current <= 1.01 && rotation === 0) {
        const w = ct.offsetWidth;
        const h = ct.offsetHeight;
        if (w > 0 && h > 0) {
          setBaseSize((prev) =>
            Math.abs(prev.width - w) <= 1 && Math.abs(prev.height - h) <= 1
              ? prev
              : { width: w, height: h }
          );
        }
      }
    };

    updateSizes();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateSizes);
    if (vp) ro.observe(vp);
    if (ct) ro.observe(ct);
    return () => ro.disconnect();
  }, [isOpen, previewUrl, pdfPageImages.length, useIframePdfFallback, isFullscreen, rotation, isZoomedOrRotated]);

  const renderPdfRange = useCallback(
    async (
      sessionId: number,
      startPage: number,
      endPage: number,
      bytes: Uint8Array | null,
      fallbackUrl?: string
    ) => {
      const isCancelled = () => activeModalSessionRef.current !== sessionId;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let pdfDoc: any = null;
      const isLowSpec =
        typeof document !== 'undefined' && document.documentElement.classList.contains('low-spec-mode');

      try {
        const pdfjsLib = await loadPdfJsLibrary();
        const authToken = getAuthToken();
        const docInput = bytes
          ? { data: new Uint8Array(bytes) }
          : {
              url: fallbackUrl,
              ...(authToken && fallbackUrl && !fallbackUrl.startsWith('blob:')
                ? { httpHeaders: { Authorization: `Bearer ${authToken}` } }
                : {}),
            };

        const docTask = pdfjsLib.getDocument(docInput);
        pdfDoc = await Promise.race([
          docTask.promise,
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              try { docTask.destroy?.(); } catch {}
              reject(new Error('PDF render timeout'));
            }, 15000);
          }),
        ]);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (isCancelled()) return false;

        const totalPages = pdfDoc.numPages || 0;
        setPdfPageCount(totalPages);

        const actualEnd = Math.min(totalPages, endPage);
        const batchPages: RenderedPdfPage[] = [];
        const maxPixelWidth = isLowSpec || isNativeAndroid ? 1050 : 1350;
        const baseDpiScale = isLowSpec || isNativeAndroid ? 1.4 : 1.65;
        const jpegQuality = isLowSpec || isNativeAndroid ? 0.82 : 0.86;

        for (let pageNum = startPage; pageNum <= actualEnd; pageNum++) {
          if (isCancelled()) return false;
          let page: any = null;
          const canvas = document.createElement('canvas');
          try {
            page = await pdfDoc.getPage(pageNum);
            if (isCancelled()) return false;

            const baseViewport = page.getViewport({ scale: 1 });
            if (pageNum === 1 && !isCancelled()) {
              setPdfOrientation(baseViewport.width > baseViewport.height ? 'landscape' : 'portrait');
            }
            const targetScale = Math.min(
              baseDpiScale,
              maxPixelWidth / Math.max(1, baseViewport.width)
            );
            const viewport = page.getViewport({ scale: Math.max(0.75, targetScale) });
            const ctx = canvas.getContext('2d', { alpha: false });
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));

            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              await page.render({ canvasContext: ctx, viewport }).promise;
              if (isCancelled()) return false;

              const { url, isBlobUrl } = await canvasToPageUrl(canvas, jpegQuality);
              if (isCancelled()) {
                if (isBlobUrl) {
                  try { URL.revokeObjectURL(url); } catch {}
                }
                return false;
              }
              if (isBlobUrl) {
                pageBlobUrlsRef.current.push(url);
              }
              const pageEntry: RenderedPdfPage = {
                url,
                width: Math.max(1, Math.round(baseViewport.width)),
                height: Math.max(1, Math.round(baseViewport.height)),
                isBlobUrl,
              };
              batchPages.push(pageEntry);

              setPdfPageImages((prev) => (startPage === 1 && pageNum === 1 ? [pageEntry] : [...prev, pageEntry]));

              if (pageNum === 1) {
                setIsLoadingPreview(false);
                setIsRenderingPdfPages(false);
                if (actualEnd > 1) {
                  setIsLoadingMorePdfPages(true);
                }
              }
            }
          } finally {
            try { page?.cleanup?.(); } catch {}
            canvas.width = 0;
            canvas.height = 0;
          }

          // Yield between pages so touch scrolling and close actions remain 100% responsive
          if (pageNum < actualEnd && !isCancelled()) {
            await new Promise((r) => setTimeout(r, 16));
          }
        }

        return batchPages.length > 0;
      } catch (err) {
        console.warn('PDF canvas rendering fallback:', err);
        if (!isCancelled() && startPage === 1) {
          setUseIframePdfFallback(true);
        }
        return false;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        try { pdfDoc?.destroy?.(); } catch {}
        if (!isCancelled()) {
          setIsRenderingPdfPages(false);
          setIsLoadingMorePdfPages(false);
        }
      }
    },
    [isNativeAndroid]
  );

  useEffect(() => {
    const sessionId = ++activeModalSessionRef.current;

    if (!isOpen || !fileUrl) {
      revokePageBlobUrls();
      pdfBytesRef.current = null;
      setPreviewUrl('');
      setPdfPageImages([]);
      setPdfPageCount(0);
      setUseIframePdfFallback(false);
      setBaseSize({ width: 0, height: 0 });
      return;
    }

    resetViewTransform();
    revokePageBlobUrls();
    pdfBytesRef.current = null;
    setLoadError(false);
    setPdfPageImages([]);
    setPdfPageCount(0);
    setUseIframePdfFallback(false);
    setBaseSize({ width: 0, height: 0 });

    let objectUrlToRevoke: string | null = null;
    const isCancelled = () => activeModalSessionRef.current !== sessionId;

    const preparePreview = async () => {
      setIsLoadingPreview(true);
      try {
        if (resolvedUrl.startsWith('data:')) {
          const arr = resolvedUrl.split(',');
          const mimeMatch = arr[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : detectedType === 'pdf' ? 'application/pdf' : 'image/png';
          const cleanB64 = (arr[1] || '').replace(/\s+/g, '');
          const bstr = atob(cleanB64);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const blob = new Blob([u8arr], { type: mime });
          objectUrlToRevoke = URL.createObjectURL(blob);
          if (isCancelled()) return;
          setPreviewUrl(objectUrlToRevoke);

          if (detectedType === 'pdf') {
            if (!shouldUseMobilePdfCanvas) {
              // Desktop Web & Desktop Apps: native crisp vector PDF viewer, instant load, zero worker crash
              setUseIframePdfFallback(true);
              setIsLoadingPreview(false);
              return;
            }
            pdfBytesRef.current = u8arr;
            setIsRenderingPdfPages(true);
            await renderPdfRange(sessionId, 1, INITIAL_PDF_BATCH, u8arr);
          }
        } else if (detectedType === 'pdf') {
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const fetchTimeout = controller ? setTimeout(() => controller.abort(), 20000) : null;
          try {
            const authToken = getAuthToken();
            const fetchHeaders: Record<string, string> = {};
            if (authToken && !resolvedUrl.startsWith('blob:')) {
              fetchHeaders.Authorization = `Bearer ${authToken}`;
            }
            const response = await fetch(resolvedUrl, {
              headers: fetchHeaders,
              signal: controller ? controller.signal : undefined,
            });
            if (fetchTimeout) clearTimeout(fetchTimeout);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('text/html')) {
              throw new Error('Unexpected HTML response for PDF URL');
            }
            const arrayBuffer = await response.arrayBuffer();
            if (isCancelled()) return;

            const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
            objectUrlToRevoke = URL.createObjectURL(blob);
            setPreviewUrl(objectUrlToRevoke);

            if (!shouldUseMobilePdfCanvas) {
              // Desktop Web & Desktop Containers: render natively in vector iframe with zero pdf.js overhead or worker crash
              setUseIframePdfFallback(true);
              setIsLoadingPreview(false);
              return;
            }

            const bytes = new Uint8Array(arrayBuffer);
            pdfBytesRef.current = bytes;
            setIsRenderingPdfPages(true);
            await renderPdfRange(sessionId, 1, INITIAL_PDF_BATCH, bytes);
          } catch (fetchErr: any) {
            if (fetchTimeout) clearTimeout(fetchTimeout);
            console.warn('PDF fetch/preview notice:', fetchErr);
            if (isCancelled()) return;

            if (String(fetchErr?.message || '').includes('HTTP 404')) {
              setLoadError(true);
              return;
            }

            setPreviewUrl(resolvedUrl);
            if (!shouldUseMobilePdfCanvas) {
              setUseIframePdfFallback(true);
              setIsLoadingPreview(false);
              return;
            }
            setIsRenderingPdfPages(true);
            await renderPdfRange(sessionId, 1, INITIAL_PDF_BATCH, null, resolvedUrl);
          }
        } else {
          if (!isCancelled()) {
            setPreviewUrl(resolvedUrl);
          }
        }
      } catch (err) {
        console.error('Error preparing file preview:', err);
        if (!isCancelled()) {
          setPreviewUrl(resolvedUrl);
        }
      } finally {
        if (!isCancelled()) {
          setIsLoadingPreview(false);
          setIsRenderingPdfPages(false);
        }
      }
    };

    preparePreview();

    return () => {
      activeModalSessionRef.current++;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
      revokePageBlobUrls();
      pdfBytesRef.current = null;
    };
  }, [isOpen, fileUrl, resolvedUrl, detectedType, shouldUseMobilePdfCanvas, resetViewTransform, renderPdfRange, revokePageBlobUrls]);

  const handleLoadMorePdfPages = async () => {
    if (isLoadingMorePdfPages || pdfPageImages.length >= pdfPageCount) return;
    const sessionId = activeModalSessionRef.current;
    const start = pdfPageImages.length + 1;
    const end = Math.min(pdfPageCount, start + INITIAL_PDF_BATCH - 1);
    setIsLoadingMorePdfPages(true);
    await renderPdfRange(sessionId, start, end, pdfBytesRef.current, resolvedUrl);
  };

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

  // Native touch listeners (Mobile Web & Android) & Ctrl+Wheel zoom (Desktop)
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !isOpen || !isCanvasViewActive) return;

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
        gestureRef.current.startScrollLeft = vp.scrollLeft;
        gestureRef.current.startScrollTop = vp.scrollTop;
        gestureRef.current.initialSizerW = sizerRef.current.w;
        gestureRef.current.initialSizerH = sizerRef.current.h;
        setIsTouchingGesture(true);
      } else if (e.touches.length === 1 && zoomRef.current > 1.01) {
        const touch = e.touches[0];
        gestureRef.current.mode = 'pan';
        gestureRef.current.startX = touch.clientX;
        gestureRef.current.startY = touch.clientY;
        gestureRef.current.startScrollLeft = vp.scrollLeft;
        gestureRef.current.startScrollTop = vp.scrollTop;
        setIsTouchingGesture(true);
      } else {
        gestureRef.current.mode = 'none';
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.stopPropagation();
      if (e.touches.length === 2) {
        e.preventDefault();
        const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        const currDist = getTouchDistance(p1, p2);
        const currMid = getTouchMidpoint(p1, p2);

        if (gestureRef.current.mode !== 'pinch') {
          gestureRef.current.mode = 'pinch';
          gestureRef.current.initialDistance = currDist;
          gestureRef.current.initialMidpoint = currMid;
          gestureRef.current.initialScale = zoomRef.current;
          gestureRef.current.startScrollLeft = vp.scrollLeft;
          gestureRef.current.startScrollTop = vp.scrollTop;
          gestureRef.current.initialSizerW = sizerRef.current.w;
          gestureRef.current.initialSizerH = sizerRef.current.h;
        }

        const initDist = gestureRef.current.initialDistance;
        if (initDist <= 1 || currDist <= 1) return;

        const initScale = gestureRef.current.initialScale || 1;
        const nextScale = clampZoom(initScale * (currDist / initDist), 1, 8);
        const rect = vp.getBoundingClientRect();
        const vpW = vp.clientWidth || 320;
        const vpH = vp.clientHeight || 320;
        const { w: uW, h: uH } = unscaledRef.current;

        const initSizerW = gestureRef.current.initialSizerW || Math.max(vpW, Math.ceil(uW * initScale));
        const initSizerH = gestureRef.current.initialSizerH || Math.max(vpH, Math.ceil(uH * initScale));
        const nextSizerW = Math.max(vpW, Math.ceil(uW * nextScale));
        const nextSizerH = Math.max(vpH, Math.ceil(uH * nextScale));

        const initLocalX = gestureRef.current.initialMidpoint.x - rect.left;
        const initLocalY = gestureRef.current.initialMidpoint.y - rect.top;
        const currLocalX = currMid.x - rect.left;
        const currLocalY = currMid.y - rect.top;

        const offX = (gestureRef.current.startScrollLeft + initLocalX - initSizerW / 2) / initScale;
        const offY = (gestureRef.current.startScrollTop + initLocalY - initSizerH / 2) / initScale;

        const rawLeft = nextSizerW / 2 + offX * nextScale - currLocalX;
        const rawTop = nextSizerH / 2 + offY * nextScale - currLocalY;

        pendingScrollRef.current = {
          left: Math.max(0, Math.min(Math.max(0, nextSizerW - vpW), rawLeft)),
          top: Math.max(0, Math.min(Math.max(0, nextSizerH - vpH), rawTop)),
        };
        setZoom(nextScale);
      } else if (e.touches.length === 1 && gestureRef.current.mode === 'pan' && zoomRef.current > 1.01) {
        e.preventDefault();
        const touch = e.touches[0];
        const dx = touch.clientX - gestureRef.current.startX;
        const dy = touch.clientY - gestureRef.current.startY;
        vp.scrollLeft = gestureRef.current.startScrollLeft - dx;
        vp.scrollTop = gestureRef.current.startScrollTop - dy;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.stopPropagation();
      if (e.touches.length === 0) {
        gestureRef.current.mode = 'none';
        setIsTouchingGesture(false);
      } else if (e.touches.length === 1 && zoomRef.current > 1.01) {
        const touch = e.touches[0];
        gestureRef.current.mode = 'pan';
        gestureRef.current.startX = touch.clientX;
        gestureRef.current.startY = touch.clientY;
        gestureRef.current.startScrollLeft = vp.scrollLeft;
        gestureRef.current.startScrollTop = vp.scrollTop;
      } else {
        gestureRef.current.mode = 'none';
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.25 : -0.25;
        applyZoomLevel(zoomRef.current + delta, { x: e.clientX, y: e.clientY });
      }
    };

    vp.addEventListener('touchstart', handleTouchStart, { passive: false });
    vp.addEventListener('touchmove', handleTouchMove, { passive: false });
    vp.addEventListener('touchend', handleTouchEnd);
    vp.addEventListener('touchcancel', handleTouchEnd);
    vp.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      vp.removeEventListener('touchstart', handleTouchStart);
      vp.removeEventListener('touchmove', handleTouchMove);
      vp.removeEventListener('touchend', handleTouchEnd);
      vp.removeEventListener('touchcancel', handleTouchEnd);
      vp.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen, isCanvasViewActive, applyZoomLevel]);

  // Desktop mouse drag panning ONLY when zoomed in (zoom > 1.01)
  const handleMouseDown = (e: React.MouseEvent) => {
    const vp = viewportRef.current;
    if (!vp || e.button !== 0 || zoomRef.current <= 1.01) return;
    e.preventDefault();
    gestureRef.current.isMouseDragging = true;
    gestureRef.current.startX = e.clientX;
    gestureRef.current.startY = e.clientY;
    gestureRef.current.startScrollLeft = vp.scrollLeft;
    gestureRef.current.startScrollTop = vp.scrollTop;
    setIsTouchingGesture(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const vp = viewportRef.current;
    if (!vp || !gestureRef.current.isMouseDragging) return;
    const dx = e.clientX - gestureRef.current.startX;
    const dy = e.clientY - gestureRef.current.startY;
    vp.scrollLeft = gestureRef.current.startScrollLeft - dx;
    vp.scrollTop = gestureRef.current.startScrollTop - dy;
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
          const authToken = getAuthToken();
          const headers: Record<string, string> = {};
          if (authToken && !(previewUrl || resolvedUrl).startsWith('blob:') && !(previewUrl || resolvedUrl).startsWith('data:')) {
            headers.Authorization = `Bearer ${authToken}`;
          }
          const response = await fetch(previewUrl || resolvedUrl, { headers });
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

  const handlePrint = async () => {
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

    if (useIframePdfFallback || pdfPageImages.length === 0) {
      const iframeEl = document.querySelector('#file-viewer-native-pdf-iframe') as HTMLIFrameElement | null;
      await printPdfOrImageInPage(previewUrl || resolvedUrl, 'pdf', fileName, iframeEl);
      return;
    }

    if (pdfPageImages.length > 0) {
      const isLandscape = pdfOrientation === 'landscape';
      const pageW = isLandscape ? '294mm' : '207mm';
      const pageH = isLandscape ? '206mm' : '293mm';
      const resolvedPrintSrcs = await Promise.all(pdfPageImages.map(canvasToDataUrlForPrint));
      const imgsHtml = resolvedPrintSrcs
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
  };

  const subtitleText = (() => {
    if (detectedType === 'pdf' && useIframePdfFallback) {
      return 'سند PDF • پیش‌نمایش برداری سریع';
    }
    if (isMobileTouch) {
      if (detectedType === 'pdf') {
        const countPart = pdfPageCount > 0 ? `سند PDF (${pdfPageCount.toLocaleString('fa-IR')} صفحه)` : 'سند PDF';
        return zoom > 1.01
          ? `${countPart} • حرکت در ۴ جهت فعال`
          : `${countPart} • اسکرول صفحات و زوم با دو انگشت`;
      }
      return zoom > 1.01 ? 'تصویر • حرکت در ۴ جهت فعال' : 'تصویر • زوم با دو انگشت و حرکت در ۴ جهت';
    }
    if (detectedType === 'pdf') {
      const countPart = pdfPageCount > 0 ? `سند PDF (${pdfPageCount.toLocaleString('fa-IR')} صفحه)` : 'سند PDF';
      return zoom > 1.01
        ? `${countPart} • اسکرول با موس و درگ در ۴ جهت`
        : `${countPart} • اسکرول صفحات با چرخ موس`;
    }
    return zoom > 1.01
      ? 'تصویر • جابجایی با موس در ۴ جهت'
      : 'تصویر • برای جابجایی از دکمه بزرگنمایی استفاده کنید';
  })();

  const remainingPages = Math.max(0, pdfPageCount - pdfPageImages.length);

  const renderPdfPageCards = () => (
    <>
      {pdfPageImages.map((pageObj, idx) => (
        <div
          key={idx}
          className="relative bg-white rounded-lg shadow-xl overflow-hidden shrink-0 w-full max-w-[92vw] sm:max-w-[80vw] md:max-w-[760px]"
          style={{ aspectRatio: `${pageObj.width} / ${pageObj.height}` }}
        >
          <img
            src={pageObj.url}
            alt={`${fileName} - صفحه ${idx + 1}`}
            decoding="async"
            draggable={false}
            className="w-full h-full object-contain select-none pointer-events-none block"
          />
          {pdfPageCount > 1 && (
            <span className="absolute bottom-2 left-2 bg-slate-900/75 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              صفحه {(idx + 1).toLocaleString('fa-IR')} از {pdfPageCount.toLocaleString('fa-IR')}
            </span>
          )}
        </div>
      ))}
      {isLoadingMorePdfPages && (
        <div className="flex items-center gap-2 bg-slate-900/85 text-white text-xs font-bold px-3.5 py-2 rounded-full border border-white/15 shadow-lg shrink-0" dir="rtl">
          <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span>در حال آماده‌سازی ادامه صفحات ({pdfPageImages.length.toLocaleString('fa-IR')} از {pdfPageCount.toLocaleString('fa-IR')})...</span>
        </div>
      )}
      {!isLoadingMorePdfPages && remainingPages > 0 && (
        <button
          type="button"
          onClick={handleLoadMorePdfPages}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg transition shrink-0 cursor-pointer"
          dir="rtl"
        >
          بارگذاری {Math.min(INITIAL_PDF_BATCH, remainingPages).toLocaleString('fa-IR')} صفحه بعدی ({remainingPages.toLocaleString('fa-IR')} صفحه باقیمانده)
        </button>
      )}
    </>
  );

  const modalContent = (
    <div
      className="fixed inset-0 z-[100000] bg-slate-950/95 flex flex-col overflow-hidden select-none"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      onClick={onClose}
      dir="rtl"
    >
      {/* Top Action Bar */}
      <div
        className="w-full px-2.5 sm:px-5 py-2.5 bg-slate-900 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 z-20 shrink-0"
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
              {subtitleText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-end">
          {isCanvasViewActive && (
            <div className="flex items-center gap-0.5 bg-white/10 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => applyZoomLevel(zoom + 0.35)}
                className="p-1.5 text-white hover:bg-white/20 rounded-lg transition cursor-pointer"
                title="بزرگنمایی"
              >
                <ZoomIn size={16} />
              </button>
              <button
                onClick={resetViewTransform}
                className="text-[10px] text-white font-mono px-1.5 py-0.5 hover:bg-white/20 rounded transition min-w-[38px] text-center cursor-pointer"
                title="بازنشانی زوم و مرکز"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => applyZoomLevel(zoom - 0.35)}
                className="p-1.5 text-white hover:bg-white/20 rounded-lg transition cursor-pointer"
                title="کوچکنمایی"
              >
                <ZoomOut size={16} />
              </button>
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1.5 text-white hover:bg-white/20 rounded-lg transition cursor-pointer"
                title="چرخش ۹۰ درجه"
              >
                <RotateCw size={16} />
              </button>
            </div>
          )}

          {detectedType === 'pdf' && (
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="hidden sm:flex p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition border border-white/10 cursor-pointer"
              title={isFullscreen ? 'خروج از تمام صفحه' : 'تمام صفحه'}
            >
              {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          )}

          <button
            onClick={handlePrint}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition border border-white/10 cursor-pointer"
            title="چاپ"
          >
            <Printer size={17} />
          </button>

          <button
            onClick={handleSendToChat}
            className="flex items-center gap-1 px-2.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition shadow-lg whitespace-nowrap cursor-pointer"
            title="ارسال مستقیم به گفتگو"
          >
            <MessageSquare size={15} />
            <span className="hidden md:inline">ارسال به گفتگو</span>
          </button>

          <button
            onClick={handleShareNative}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition border border-white/10 cursor-pointer"
            title="اشتراک‌گذاری"
          >
            <Share2 size={16} />
          </button>

          {detectedType === 'image' && showPhoneGallery ? (
            <button
              onClick={handleSaveToGallery}
              disabled={isSavingGallery}
              className="flex items-center gap-1 px-2.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition shadow-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
              title="ذخیره مستقیم تصویر در گالری گوشی"
            >
              <DownloadCloud size={16} />
              <span>{isSavingGallery ? '...' : 'ذخیره در گالری'}</span>
            </button>
          ) : (
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center gap-1 px-2.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition shadow-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
              title={detectedType === 'image' ? 'دانلود تصویر' : 'دانلود فایل PDF'}
            >
              <Download size={16} />
              <span>{isDownloading ? '...' : detectedType === 'image' ? 'دانلود تصویر' : 'دانلود PDF'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white rounded-xl transition border border-red-500/30 cursor-pointer"
            title="بستن"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Scrollable & Zoomable Viewport Container */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        <div
          ref={viewportRef}
          className="w-full h-full overflow-auto custom-scrollbar"
          dir="ltr"
          style={{
            touchAction: isCanvasViewActive
              ? zoom > 1.01
                ? 'none'
                : 'pan-y'
              : 'auto',
            cursor: zoom > 1.01 ? (isTouchingGesture ? 'grabbing' : 'grab') : 'default',
            WebkitOverflowScrolling: 'touch',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {isLoadingPreview || isRenderingPdfPages ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white" dir="rtl">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-bold">
                {detectedType === 'pdf' ? 'در حال آماده‌سازی صفحات PDF...' : 'در حال بارگذاری پیش‌نمایش فایل...'}
              </p>
            </div>
          ) : loadError ? (
            <div className="w-full h-full flex items-center justify-center p-4" dir="rtl">
              <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-md text-center text-white space-y-4">
                <AlertCircle size={48} className="text-amber-400 mx-auto" />
                <h4 className="font-bold text-lg">امکان نمایش مستقیم فایل وجود ندارد</h4>
                <p className="text-xs text-gray-300 leading-relaxed">
                  ممکن است فرمت فایل توسط مرورگر پشتیبانی نشود. می‌توانید فایل را دانلود و مشاهده نمایید.
                </p>
                <button
                  onClick={handleDownload}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download size={18} />
                  دانلود و باز کردن فایل
                </button>
              </div>
            </div>
          ) : detectedType === 'image' ? (
            !isZoomedOrRotated ? (
              <div className="w-full min-h-full flex items-center justify-center p-2 sm:p-4">
                <div ref={contentRef} className="flex items-center justify-center">
                  <img
                    src={previewUrl || resolvedUrl}
                    alt={fileName}
                    onLoad={() => {
                      if (contentRef.current) {
                        setBaseSize({
                          width: contentRef.current.offsetWidth,
                          height: contentRef.current.offsetHeight,
                        });
                      }
                    }}
                    onError={() => setLoadError(true)}
                    draggable={false}
                    className="max-w-[94vw] max-h-[82vh] object-contain rounded-lg shadow-2xl select-none pointer-events-none"
                  />
                </div>
              </div>
            ) : (
              <div
                style={{
                  width: `${sizerW}px`,
                  height: `${sizerH}px`,
                  position: 'relative',
                  margin: '0 auto',
                }}
              >
                <div
                  ref={contentRef}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -50%) scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center',
                    transition: 'none',
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
              </div>
            )
          ) : pdfPageImages.length > 0 && !useIframePdfFallback ? (
            !isZoomedOrRotated ? (
              // Top-anchored flow at 1x guarantees Page 1 NEVER shifts/jumps when Page 2..N finish rendering below
              <div className="w-full min-h-full flex flex-col items-center justify-start py-3 px-2 sm:px-4">
                <div
                  ref={contentRef}
                  dir="rtl"
                  className="flex flex-col items-center gap-3 w-full max-w-[94vw] sm:max-w-[82vw] md:max-w-[780px]"
                >
                  {renderPdfPageCards()}
                </div>
              </div>
            ) : (
              <div
                style={{
                  width: `${sizerW}px`,
                  height: `${sizerH}px`,
                  position: 'relative',
                  margin: '0 auto',
                }}
              >
                <div
                  ref={contentRef}
                  dir="rtl"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -50%) scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center',
                    transition: 'none',
                  }}
                  className="flex flex-col items-center gap-3 p-2 sm:p-4 w-[94vw] sm:w-[82vw] md:w-[780px]"
                >
                  {renderPdfPageCards()}
                </div>
              </div>
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center p-1 sm:p-2" dir="rtl">
              <div
                className={`bg-white rounded-2xl overflow-hidden shadow-2xl border border-white/20 flex flex-col ${
                  isFullscreen ? 'w-full h-full rounded-none' : 'w-[98vw] max-w-6xl h-[86vh]'
                }`}
              >
                <iframe
                  id="file-viewer-native-pdf-iframe"
                  src={`${previewUrl || resolvedUrl}#toolbar=1&navpanes=1`}
                  title={fileName}
                  className="w-full flex-1 border-0 bg-white"
                  onError={() => setLoadError(true)}
                />
                <div className="bg-slate-900 text-gray-300 px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 border-t border-white/10 shrink-0">
                  <span>
                    {isMobileTouch
                      ? 'اگر فایل PDF در گوشی شما باز نشد، دکمه روبرو را بزنید:'
                      : 'پیش‌نمایش مرورگر • برای ذخیره در سیستم دکمه روبرو را بزنید:'}
                  </span>
                  <button
                    onClick={handleDownload}
                    className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Download size={14} />
                    {isMobileTouch ? 'باز کردن با برنامه PDF گوشی / دانلود' : 'دانلود فایل PDF'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Floating Touch Zoom & 4-Way Pan Control Bar ONLY on Mobile Web & Android */}
        {isMobileTouch && isCanvasViewActive && !isLoadingPreview && !isRenderingPdfPages && !loadError && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-slate-900/95 text-white px-3 py-1.5 rounded-full border border-white/15 shadow-2xl text-xs font-bold whitespace-nowrap"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <Move size={14} className={zoom > 1.05 ? 'text-emerald-400' : 'text-blue-400'} />
            <div className="flex items-center gap-1">
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
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default FileViewerModal;
