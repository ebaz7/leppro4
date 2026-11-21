import jsQR from 'jsqr';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource
} from '@zxing/library';

/**
 * Normalizes Persian/Arabic numerals and strips control characters / line endings
 * commonly appended by rugged Android barcode PDAs or USB laser scanners.
 */
export const normalizeScannedBarcode = (raw: string): string => {
  return String(raw || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\r\n\t\u0000-\u001F\u007F]/g, '')
    .trim();
};

/**
 * Requests Android native runtime CAMERA permission through DlkamAndroid bridge
 * before calling getUserMedia so Android 6-15 WebViews reliably show the OS prompt.
 */
export const ensureAndroidCameraPermission = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return true;
  const bridge = (window as any).DlkamAndroid;
  if (!bridge || typeof bridge.requestCameraPermission !== 'function') {
    return true;
  }
  try {
    if (typeof bridge.hasCameraPermission === 'function' && bridge.hasCameraPermission()) {
      return true;
    }
    const alreadyGranted = bridge.requestCameraPermission();
    if (alreadyGranted) return true;

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (val: boolean) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('dlkam-camera-permission', onResult as EventListener);
        window.clearTimeout(timer);
        resolve(val);
      };
      const onResult = (ev: CustomEvent<{ granted?: boolean }>) => {
        done(Boolean(ev?.detail?.granted));
      };
      window.addEventListener('dlkam-camera-permission', onResult as EventListener);
      // Safety fallback in case WebView handles permission directly in onPermissionRequest
      const timer = window.setTimeout(() => done(true), 12000);
    });
  } catch {
    return true;
  }
};

/**
 * Opens rear camera with a 3-tier constraint fallback chain so rugged Android PDAs,
 * older Android WebViews, iOS Safari, and desktop webcams never fail with OverconstrainedError.
 */
export const openRearCameraStream = async (): Promise<MediaStream> => {
  if (typeof navigator === 'undefined') {
    throw new Error('محیط مرورگر برای دسترسی به دوربین آماده نیست.');
  }

  // Trigger native Android runtime permission prompt if running inside Dlkam Android APK
  const androidPermOk = await ensureAndroidCameraPermission();
  if (!androidPermOk) {
    throw new Error('مجوز دسترسی به دوربین در گوشی تایید نشد. لطفاً از تنظیمات برنامه مجوز Camera را فعال کنید.');
  }

  const getUserMediaFn =
    navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices) ||
    ((constraints: MediaStreamConstraints) =>
      new Promise<MediaStream>((resolve, reject) => {
        const legacy =
          (navigator as any).getUserMedia ||
          (navigator as any).webkitGetUserMedia ||
          (navigator as any).mozGetUserMedia;
        if (!legacy) {
          reject(new Error('INSECURE_OR_UNSUPPORTED'));
          return;
        }
        legacy.call(navigator, constraints, resolve, reject);
      }));

  if (!navigator.mediaDevices?.getUserMedia && !(navigator as any).webkitGetUserMedia && !(navigator as any).getUserMedia) {
    const isSecure = typeof window !== 'undefined' && (window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost');
    if (!isSecure) {
      throw new Error('برای باز کردن دوربین زنده در مرورگر، آدرس باید با HTTPS باز شود. می‌توانید از دکمه «اسکن از عکس دوربین» در همین صفحه استفاده کنید.');
    }
    throw new Error('مرورگر یا WebView این دستگاه از دسترسی زنده دوربین پشتیبانی نمی‌کند. از دکمه «اسکن از عکس دوربین» استفاده کنید.');
  }

  // 3-tier constraint fallback: HD environment -> simple environment -> any available camera
  const constraintTiers: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    },
    {
      video: {
        facingMode: 'environment'
      },
      audio: false
    },
    {
      video: true,
      audio: false
    }
  ];

  let lastError: any = null;
  for (const constraints of constraintTiers) {
    try {
      const stream = await getUserMediaFn(constraints);
      if (stream && stream.getVideoTracks().length > 0) {
        return stream;
      }
    } catch (err: any) {
      lastError = err;
      const errName = String(err?.name || '');
      // Do not retry if user explicitly denied permission or no camera hardware exists
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
        break;
      }
      if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        break;
      }
    }
  }

  const errName = String(lastError?.name || '');
  const errMsg = String(lastError?.message || '');
  if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
    throw new Error('مجوز دوربین رد شده است. لطفاً در تنظیمات گوشی/مرورگر اجازه دسترسی به دوربین (Camera) را فعال کنید و دوباره تلاش کنید.');
  }
  if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
    throw new Error('دوربینی روی این دستگاه شناسایی نشد. از دکمه فیزیکی بارکدخوان یا اسکن از عکس استفاده کنید.');
  }
  if (errName === 'NotReadableError' || errName === 'TrackStartError') {
    throw new Error('دوربین در حال استفاده توسط برنامه دیگری است. برنامه‌های دیگر را ببندید و مجدداً تلاش کنید.');
  }
  if (errMsg === 'INSECURE_OR_UNSUPPORTED') {
    throw new Error('دسترسی مستقیم دوربین در این حالت پشتیبانی نشد. از دکمه «اسکن از عکس دوربین» استفاده کنید.');
  }
  throw new Error(errMsg || 'خطا در باز کردن دوربین دستگاه. لطفاً مجوز دوربین را بررسی کنید یا از دکمه «اسکن از عکس دوربین» استفاده کنید.');
};

/**
 * Safely attaches a MediaStream to a <video> element and guarantees playback starts
 * even when mounted inside a React Portal.
 */
export const attachStreamToVideo = async (
  videoEl: HTMLVideoElement | null,
  stream: MediaStream | null
): Promise<boolean> => {
  if (!videoEl || !stream) return false;
  try {
    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('webkit-playsinline', 'true');
    videoEl.setAttribute('muted', 'true');
    videoEl.muted = true;
    videoEl.playsInline = true;
    await videoEl.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
};

export interface UniversalBarcodeDecoder {
  decodeFromVideo: (videoEl: HTMLVideoElement, canvasEl: HTMLCanvasElement) => Promise<string | null>;
  decodeFromImageFile: (file: File) => Promise<string | null>;
}

const buildZxingReader = (): MultiFormatReader => {
  const reader = new MultiFormatReader();
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.PDF_417
  ]);
  reader.setHints(hints);
  return reader;
};

const decodeImageDataWithZxingAndJsQr = (
  reader: MultiFormatReader,
  imageData: ImageData
): string | null => {
  const { width, height, data } = imageData;

  // 1. ZXing 1D + 2D universal luminance decoder (Code-128, Code-39, EAN, QR, DataMatrix, etc.)
  try {
    const pixelCount = width * height;
    const luminances = new Uint8ClampedArray(pixelCount);
    for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
      // Fast perceptual luma
      luminances[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    }
    const source = new RGBLuminanceSource(luminances, width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const result = reader.decode(bitmap);
    const text = normalizeScannedBarcode(result?.getText?.() || '');
    if (text.length >= 3) {
      return text;
    }
  } catch {
    // NotFoundException on normal frames without barcode
  } finally {
    try {
      reader.reset();
    } catch {}
  }

  // 2. Fast jsQR fallback for dense/low-contrast QR codes
  try {
    const qr = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
    const text = normalizeScannedBarcode(qr?.data || '');
    if (text.length >= 3) {
      return text;
    }
  } catch {}

  return null;
};

/**
 * Creates a multi-engine universal 1D + 2D barcode decoder:
 * 1) Hardware-accelerated native BarcodeDetector (when available)
 * 2) ZXing MultiFormatReader (1D Code-128 / Code-39 / EAN / ITF + 2D QR / DataMatrix)
 * 3) jsQR fallback
 */
export const createUniversalBarcodeDecoder = async (): Promise<UniversalBarcodeDecoder> => {
  let nativeDetector: any = null;
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const BarcodeDetectorClass = (window as any).BarcodeDetector;
      const supportedFormats = await BarcodeDetectorClass.getSupportedFormats?.().catch(() => null);
      const desiredFormats = [
        'code_128',
        'code_39',
        'code_93',
        'ean_13',
        'ean_8',
        'itf',
        'qr_code',
        'data_matrix',
        'upc_a',
        'upc_e',
        'codabar',
        'pdf417'
      ];
      const formatsToUse =
        Array.isArray(supportedFormats) && supportedFormats.length > 0
          ? desiredFormats.filter((f) => supportedFormats.includes(f))
          : desiredFormats;
      nativeDetector = new BarcodeDetectorClass({
        formats: formatsToUse.length > 0 ? formatsToUse : undefined
      });
    } catch {
      try {
        nativeDetector = new (window as any).BarcodeDetector();
      } catch {
        nativeDetector = null;
      }
    }
  }

  const zxingReader = buildZxingReader();

  const decodeFromVideo = async (
    videoEl: HTMLVideoElement,
    canvasEl: HTMLCanvasElement
  ): Promise<string | null> => {
    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth <= 0 || videoEl.videoHeight <= 0) {
      return null;
    }

    // 1. Hardware-accelerated native detector first
    if (nativeDetector) {
      try {
        const hits = await nativeDetector.detect(videoEl);
        if (Array.isArray(hits) && hits.length > 0) {
          const valid = hits.find((h: any) => normalizeScannedBarcode(h?.rawValue || '').length >= 3);
          if (valid) {
            return normalizeScannedBarcode(valid.rawValue);
          }
        }
      } catch {
        // Fall through to canvas decoding
      }
    }

    // 2. Canvas ROI capture -> ZXing (1D + 2D) + jsQR fallback
    // Use crisp 640x360 center crop so thin 1D Code-128 bars stay sharp on mobile screens
    const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const cropW = Math.min(videoEl.videoWidth, Math.floor(videoEl.videoWidth * 0.9));
    const cropH = Math.min(videoEl.videoHeight, Math.floor(videoEl.videoHeight * 0.6));
    const sx = Math.floor((videoEl.videoWidth - cropW) / 2);
    const sy = Math.floor((videoEl.videoHeight - cropH) / 2);

    const targetW = Math.min(640, cropW);
    const targetH = Math.max(180, Math.round((cropH / cropW) * targetW));
    if (canvasEl.width !== targetW) canvasEl.width = targetW;
    if (canvasEl.height !== targetH) canvasEl.height = targetH;

    ctx.drawImage(videoEl, sx, sy, cropW, cropH, 0, 0, targetW, targetH);
    const imageData = ctx.getImageData(0, 0, targetW, targetH);

    return decodeImageDataWithZxingAndJsQr(zxingReader, imageData);
  };

  const decodeFromImageFile = async (file: File): Promise<string | null> => {
    const imgUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('تصویر انتخاب‌شده قابل خواندن نیست.'));
        el.src = imgUrl;
      });

      if (nativeDetector) {
        try {
          const hits = await nativeDetector.detect(img);
          if (Array.isArray(hits) && hits.length > 0) {
            const valid = hits.find((h: any) => normalizeScannedBarcode(h?.rawValue || '').length >= 3);
            if (valid) return normalizeScannedBarcode(valid.rawValue);
          }
        } catch {}
      }

      const maxDim = 1280;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.round((img.naturalWidth || 640) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || 480) * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      ctx.drawImage(img, 0, 0, w, h);
      const fullData = ctx.getImageData(0, 0, w, h);
      const direct = decodeImageDataWithZxingAndJsQr(zxingReader, fullData);
      if (direct) return direct;

      // Retry on center 70% crop in case label is small in photo
      const cw = Math.round(w * 0.7);
      const ch = Math.round(h * 0.5);
      const cx = Math.round((w - cw) / 2);
      const cy = Math.round((h - ch) / 2);
      const cropData = ctx.getImageData(cx, cy, cw, ch);
      return decodeImageDataWithZxingAndJsQr(zxingReader, cropData);
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  };

  return { decodeFromVideo, decodeFromImageFile };
};

/**
 * Subscribes to BOTH:
 * 1) Android native BroadcastReceiver scans ('dlkam-hardware-barcode' from MainActivity.java)
 * 2) Global HID / Keyboard-Wedge hardware barcode scanners even when no <input> is focused!
 */
export const subscribeHardwareBarcodeEvents = (
  onBarcode: (barcode: string, source: 'android-broadcast' | 'keyboard-wedge') => void,
  options?: {
    enabled?: boolean;
    ignoreInputElement?: () => HTMLInputElement | null;
  }
): (() => void) => {
  if (typeof window === 'undefined' || options?.enabled === false) {
    return () => {};
  }

  let buffer = '';
  let lastKeyTime = 0;
  let flushTimer: number | null = null;
  let lastDeliveredCode = '';
  let lastDeliveredAt = 0;

  const deliver = (raw: string, source: 'android-broadcast' | 'keyboard-wedge') => {
    const clean = normalizeScannedBarcode(raw);
    if (clean.length < 3) return;
    const now = Date.now();
    // Deduplicate identical scan fired by BOTH broadcast + wedge within 350ms
    if (clean.toLowerCase() === lastDeliveredCode.toLowerCase() && now - lastDeliveredAt < 350) {
      return;
    }
    lastDeliveredCode = clean;
    lastDeliveredAt = now;
    onBarcode(clean, source);
  };

  const handleNativeBroadcast = (ev: Event) => {
    const detail = (ev as CustomEvent<{ barcode?: string }>).detail;
    if (detail?.barcode) {
      deliver(detail.barcode, 'android-broadcast');
    }
  };

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    const activeEl = document.activeElement as HTMLElement | null;
    const dedicatedInput = options?.ignoreInputElement?.() || null;

    // If user is typing inside the dedicated barcode input itself, let the input's own handlers deal with it
    if (dedicatedInput && activeEl === dedicatedInput) {
      return;
    }

    // Do not hijack typing when user is intentionally inside another text input / search box / textarea / select
    if (activeEl) {
      const tag = activeEl.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || activeEl.isContentEditable) {
        return;
      }
    }

    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const now = Date.now();
    const gap = now - lastKeyTime;
    if (gap > 140) {
      buffer = '';
    }
    lastKeyTime = now;

    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }

    const isTerminator =
      e.key === 'Enter' ||
      e.key === 'Tab' ||
      e.keyCode === 13 ||
      e.keyCode === 9;

    if (isTerminator) {
      if (buffer.length >= 4) {
        e.preventDefault();
        const code = buffer;
        buffer = '';
        deliver(code, 'keyboard-wedge');
      } else {
        buffer = '';
      }
      return;
    }

    if (e.key && e.key.length === 1) {
      buffer += e.key;
      // If scanner does not append Enter/Tab, auto-flush rapid burst (>= 6 chars) after 130ms idle
      if (buffer.length >= 6) {
        flushTimer = window.setTimeout(() => {
          const code = buffer;
          buffer = '';
          if (code.length >= 6) {
            deliver(code, 'keyboard-wedge');
          }
        }, 130);
      }
    }
  };

  window.addEventListener('dlkam-hardware-barcode', handleNativeBroadcast);
  window.addEventListener('keydown', handleGlobalKeyDown, true);

  return () => {
    if (flushTimer !== null) window.clearTimeout(flushTimer);
    window.removeEventListener('dlkam-hardware-barcode', handleNativeBroadcast);
    window.removeEventListener('keydown', handleGlobalKeyDown, true);
  };
};
