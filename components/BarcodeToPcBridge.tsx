import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  Monitor,
  Smartphone,
  Wifi,
  WifiOff,
  QrCode,
  Barcode,
  Keyboard,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Volume2,
  VolumeX,
  Camera,
  X,
  Send,
  Zap,
  UploadCloud,
  Clock,
  ShieldCheck,
  Link2,
  Unlink,
  Undo2,
  Scale,
  Boxes
} from 'lucide-react';
import { apiCall, getServerHost, getAuthToken } from '../services/apiService';
import { isWindowsDesktopApp, isElectronDesktop, isTauriDesktopOnly, isTouchMobileDevice } from '../utils/platformDetection';
import { User } from '../types';

type BridgeRole = 'receiver' | 'sender';
type SuffixKey = 'enter' | 'tab' | 'enter2' | 'tab_enter' | 'none';

interface ConnectedScannerInfo {
  scannerId: string;
  deviceName: string;
  username?: string;
  fullName?: string;
  connectedAt: number;
  lastScanAt?: number | null;
  scanCount?: number;
}

interface BridgeScanItem {
  id: string;
  clientScanId?: string;
  barcode: string;
  scannerId?: string;
  scannerName?: string;
  fromOfflineQueue?: boolean;
  status: 'queued' | 'typing' | 'typed' | 'failed' | 'offline';
  createdAt: number;
  ackAt?: number | null;
  error?: string | null;
}

interface DiscoverableSession {
  code: string;
  hostDeviceName: string;
  hostPlatform: string;
  hostFullName: string;
  sameUser: boolean;
  hostOnline: boolean;
  connectedScannersCount: number;
  totalScans: number;
  lastActivityAt: number;
}

interface OfflineQueuedBarcode {
  clientScanId: string;
  barcode: string;
  scannedAt: number;
}

interface BarcodeToPcBridgeProps {
  currentUser?: User | any;
  embedded?: boolean;
}

const OFFLINE_QUEUE_KEY = 'dlkam_b2pc_offline_queue_v1';
const HOST_SESSION_KEY = 'dlkam_b2pc_host_session_v1';
const LAST_PAIRED_CODE_KEY = 'dlkam_b2pc_last_paired_code_v1';
const SCANNER_ID_KEY = 'dlkam_b2pc_scanner_id_v1';
const RECEIVER_PREFS_KEY = 'dlkam_b2pc_receiver_prefs_v1';

const getOrCreateScannerId = (): string => {
  try {
    const existing = localStorage.getItem(SCANNER_ID_KEY);
    if (existing) return existing;
    const generated = `pda_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem(SCANNER_ID_KEY, generated);
    return generated;
  } catch {
    return `pda_${Date.now().toString(36)}`;
  }
};

const parseLepanWeight = (barcode: string): number => {
  const parts = String(barcode || '').trim().split('-');
  if (parts.length >= 4) {
    const w = parseFloat(parts[parts.length - 1]);
    if (!isNaN(w) && w > 0 && w < 200) return Number(w.toFixed(2));
  }
  return 0;
};

const buildSseUrl = (code: string, params: Record<string, string>): string => {
  const host = getServerHost();
  const base = host ? `${host.replace(/\/+$/, '')}/api` : '/api';
  const qs = new URLSearchParams(params);
  const token = getAuthToken();
  if (token) qs.set('token', token);
  return `${base}/barcode-bridge/sessions/${encodeURIComponent(code)}/stream?${qs.toString()}`;
};

const invokeTauri = async <T = any>(cmd: string, args?: Record<string, any>): Promise<T> => {
  const win = window as any;
  if (win.__TAURI__?.tauri?.invoke) {
    return win.__TAURI__.tauri.invoke(cmd, args);
  }
  if (win.__TAURI__?.invoke) {
    return win.__TAURI__.invoke(cmd, args);
  }
  const mod = await import('@tauri-apps/api/tauri');
  return mod.invoke<T>(cmd, args);
};

export const BarcodeToPcBridge: React.FC<BarcodeToPcBridgeProps> = ({
  currentUser,
  embedded = false
}) => {
  const isWinDesktop = isWindowsDesktopApp();
  const isElectron = isElectronDesktop();
  const isTauri = isTauriDesktopOnly();
  const isTouch = isTouchMobileDevice();

  const defaultRole: BridgeRole = isWinDesktop
    ? 'receiver'
    : isTouch || (typeof window !== 'undefined' && window.innerWidth < 900)
      ? 'sender'
      : 'receiver';

  const [role, setRole] = useState<BridgeRole>(defaultRole);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // ---------------- RECEIVER (PC / Windows) STATE ----------------
  const [hostCode, setHostCode] = useState<string>('');
  const [hostToken, setHostToken] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [hostLoading, setHostLoading] = useState<boolean>(false);
  const [hostStreamConnected, setHostStreamConnected] = useState<boolean>(false);
  const [connectedScanners, setConnectedScanners] = useState<ConnectedScannerInfo[]>([]);
  const [receiverScans, setReceiverScans] = useState<BridgeScanItem[]>([]);
  const [wedgeSupported, setWedgeSupported] = useState<boolean>(false);
  const [wedgeReady, setWedgeReady] = useState<boolean>(false);
  const [wedgeRuntime, setWedgeRuntime] = useState<string>('web');
  const [directTypingEnabled, setDirectTypingEnabled] = useState<boolean>(true);
  const [suffixKey, setSuffixKey] = useState<SuffixKey>('enter');
  const [delayBetweenMs, setDelayBetweenMs] = useState<number>(220);
  const [focusSayan, setFocusSayan] = useState<boolean>(false);
  const [duplicateGuard, setDuplicateGuard] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [testCountdown, setTestCountdown] = useState<number>(0);
  const [receiverNotice, setReceiverNotice] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null);

  // Typing queue refs (guarantee strict sequential 1-by-1 typing into Sayan without duplicates)
  const typingQueueRef = useRef<BridgeScanItem[]>([]);
  const isTypingWorkerRunningRef = useRef<boolean>(false);
  const processedScanIdsRef = useRef<Set<string>>(new Set());
  const hostEventSourceRef = useRef<EventSource | null>(null);
  const hostCodeRef = useRef<string>('');
  const hostTokenRef = useRef<string>('');
  const isPausedRef = useRef<boolean>(false);
  const directTypingEnabledRef = useRef<boolean>(true);
  const wedgeSupportedRef = useRef<boolean>(false);
  const suffixKeyRef = useRef<SuffixKey>('enter');
  const delayBetweenMsRef = useRef<number>(220);
  const focusSayanRef = useRef<boolean>(false);

  // ---------------- SENDER (Android PDA / Mobile) STATE ----------------
  const scannerIdRef = useRef<string>(getOrCreateScannerId());
  const [pairCodeInput, setPairCodeInput] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_PAIRED_CODE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [discoverablePcs, setDiscoverablePcs] = useState<DiscoverableSession[]>([]);
  const [loadingPcs, setLoadingPcs] = useState<boolean>(false);
  const [pairedCode, setPairedCode] = useState<string>('');
  const [pairedPcName, setPairedPcName] = useState<string>('');
  const [pairedHostOnline, setPairedHostOnline] = useState<boolean>(false);
  const [pairedHostPaused, setPairedHostPaused] = useState<boolean>(false);
  const [senderStreamConnected, setSenderStreamConnected] = useState<boolean>(false);
  const [isPairing, setIsPairing] = useState<boolean>(false);
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [hardwareGunMode, setHardwareGunMode] = useState<boolean>(isTouch);
  const [senderScans, setSenderScans] = useState<BridgeScanItem[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedBarcode[]>(() => {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [isFlushingOffline, setIsFlushingOffline] = useState<boolean>(false);
  const [offlineFlushProgress, setOfflineFlushProgress] = useState<{ sent: number; total: number } | null>(null);
  const [senderFeedback, setSenderFeedback] = useState<{
    type: 'ok' | 'warn' | 'err' | 'info';
    text: string;
    duplicateBarcode?: string;
  } | null>(null);
  const [cameraMode, setCameraMode] = useState<'none' | 'pair_qr' | 'barcode'>('none');
  const [cameraError, setCameraError] = useState<string>('');

  const senderEventSourceRef = useRef<EventSource | null>(null);
  const scannerInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRafRef = useRef<number | null>(null);
  const lastCameraCodeRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Sync refs
  useEffect(() => { hostCodeRef.current = hostCode; }, [hostCode]);
  useEffect(() => { hostTokenRef.current = hostToken; }, [hostToken]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { directTypingEnabledRef.current = directTypingEnabled; }, [directTypingEnabled]);
  useEffect(() => { wedgeSupportedRef.current = wedgeSupported; }, [wedgeSupported]);
  useEffect(() => { suffixKeyRef.current = suffixKey; }, [suffixKey]);
  useEffect(() => { delayBetweenMsRef.current = delayBetweenMs; }, [delayBetweenMs]);
  useEffect(() => { focusSayanRef.current = focusSayan; }, [focusSayan]);

  // Persist receiver preferences
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECEIVER_PREFS_KEY) || '{}');
      if (saved.suffixKey) setSuffixKey(saved.suffixKey);
      if (typeof saved.delayBetweenMs === 'number') setDelayBetweenMs(saved.delayBetweenMs);
      if (typeof saved.focusSayan === 'boolean') setFocusSayan(saved.focusSayan);
      if (typeof saved.duplicateGuard === 'boolean') setDuplicateGuard(saved.duplicateGuard);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        RECEIVER_PREFS_KEY,
        JSON.stringify({ suffixKey, delayBetweenMs, focusSayan, duplicateGuard })
      );
    } catch {}
  }, [suffixKey, delayBetweenMs, focusSayan, duplicateGuard]);

  // Persist offline queue
  useEffect(() => {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(offlineQueue));
    } catch {}
  }, [offlineQueue]);

  // Hide mobile bottom-nav & AI pill while scanning on PDA/mobile
  useEffect(() => {
    if (embedded) return;
    const syncChrome = () => {
      const hide = typeof window !== 'undefined' && window.innerWidth < 768 && role === 'sender';
      window.dispatchEvent(new CustomEvent('APP_HIDE_MOBILE_CHROME', { detail: hide }));
    };
    syncChrome();
    window.addEventListener('resize', syncChrome);
    return () => {
      window.removeEventListener('resize', syncChrome);
      window.dispatchEvent(new CustomEvent('APP_HIDE_MOBILE_CHROME', { detail: false }));
    };
  }, [role, embedded]);

  // Online / Offline listeners
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Sound & Haptic feedback
  const playBeep = useCallback(
    (kind: 'scan' | 'ack' | 'error' = 'scan') => {
      try {
        if (kind === 'ack' && navigator.vibrate) navigator.vibrate(35);
        else if (kind === 'error' && navigator.vibrate) navigator.vibrate([80, 50, 80]);
      } catch {}
      if (!soundEnabled) return;
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === 'error' ? 'sawtooth' : 'sine';
        osc.frequency.value = kind === 'ack' ? 1180 : kind === 'error' ? 260 : 840;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (kind === 'error' ? 0.22 : 0.09));
      } catch {}
    },
    [soundEnabled]
  );

  // Detect Windows Desktop OS Keyboard-Wedge capabilities
  useEffect(() => {
    let active = true;
    const detectWedge = async () => {
      const win = window as any;
      if (isElectron && win.electronAPI?.getBarcodeWedgeStatus) {
        try {
          const st = await win.electronAPI.getBarcodeWedgeStatus();
          if (active) {
            setWedgeSupported(Boolean(st?.supported));
            setWedgeReady(Boolean(st?.ready));
            setWedgeRuntime('electron');
          }
          return;
        } catch {}
      }
      if (isTauri) {
        try {
          const ok = await invokeTauri<boolean>('get_barcode_wedge_support');
          if (active) {
            setWedgeSupported(Boolean(ok));
            setWedgeReady(Boolean(ok));
            setWedgeRuntime('tauri');
          }
          return;
        } catch {}
      }
      if (active) {
        setWedgeSupported(false);
        setWedgeReady(false);
        setWedgeRuntime('web');
      }
    };
    detectWedge();
    return () => { active = false; };
  }, [isElectron, isTauri]);

  // Execute OS-level typing into active Windows window (Sayan ERP)
  const typeTextIntoWindows = useCallback(
    async (text: string, suffix: SuffixKey, shouldFocusSayan: boolean): Promise<void> => {
      const win = window as any;
      if (isElectron && win.electronAPI?.typeBarcodeToActiveWindow) {
        await win.electronAPI.typeBarcodeToActiveWindow({
          text,
          suffix,
          charDelayMs: 4,
          focusSayan: shouldFocusSayan
        });
        return;
      }
      if (isTauri) {
        await invokeTauri('type_barcode_to_active_window', {
          text,
          suffix,
          charDelayMs: 4
        });
        return;
      }
      // Browser fallback: copy to clipboard so user can paste if not using Windows app
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    },
    [isElectron, isTauri]
  );

  // Sequential FIFO Typing Worker on Windows PC
  const drainTypingQueue = useCallback(async () => {
    if (isTypingWorkerRunningRef.current) return;
    if (isPausedRef.current) return;
    isTypingWorkerRunningRef.current = true;

    try {
      while (typingQueueRef.current.length > 0) {
        if (isPausedRef.current) break;
        const nextItem = typingQueueRef.current.shift();
        if (!nextItem) continue;

        setReceiverScans((prev) =>
          prev.map((item) => (item.id === nextItem.id ? { ...item, status: 'typing' } : item))
        );

        let typedOk = false;
        let errMessage: string | null = null;

        try {
          if (directTypingEnabledRef.current && wedgeSupportedRef.current) {
            await typeTextIntoWindows(
              nextItem.barcode,
              suffixKeyRef.current,
              focusSayanRef.current
            );
            typedOk = true;
          } else {
            // Clipboard fallback in web mode or when direct typing is toggled off
            try {
              const win = window as any;
              if (win.electronAPI?.copyText) await win.electronAPI.copyText(nextItem.barcode);
              else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(nextItem.barcode);
            } catch {}
            typedOk = true;
          }
        } catch (err: any) {
          typedOk = false;
          errMessage = err?.message || 'خطا در تایپ سیستمی ویندوز';
        }

        const finalStatus = typedOk ? 'typed' : 'failed';
        setReceiverScans((prev) =>
          prev.map((item) =>
            item.id === nextItem.id
              ? { ...item, status: finalStatus, ackAt: Date.now(), error: errMessage }
              : item
          )
        );
        playBeep(typedOk ? 'ack' : 'error');

        // Acknowledge back to server -> instantly updates Android PDA UI!
        if (hostCodeRef.current && hostTokenRef.current) {
          apiCall(`/barcode-bridge/sessions/${hostCodeRef.current}/ack`, 'POST', {
            hostToken: hostTokenRef.current,
            scanId: nextItem.id,
            status: finalStatus,
            error: errMessage
          }).catch(() => {});
        }

        const waitMs = Math.max(40, Math.min(2000, delayBetweenMsRef.current || 200));
        if (typingQueueRef.current.length > 0 && !isPausedRef.current) {
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
    } finally {
      isTypingWorkerRunningRef.current = false;
    }
  }, [playBeep, typeTextIntoWindows]);

  // Resume draining when unpaused
  useEffect(() => {
    if (!isPaused && typingQueueRef.current.length > 0) {
      drainTypingQueue();
    }
  }, [isPaused, drainTypingQueue]);

  // Connect Receiver SSE Stream
  const connectHostStream = useCallback(
    (code: string, token: string) => {
      if (hostEventSourceRef.current) {
        try { hostEventSourceRef.current.close(); } catch {}
        hostEventSourceRef.current = null;
      }
      const url = buildSseUrl(code, {
        role: 'host',
        hostToken: token,
        clientId: `host_${Date.now()}`
      });
      const es = new EventSource(url);
      hostEventSourceRef.current = es;

      es.onopen = () => {
        setHostStreamConnected(true);
      };

      es.addEventListener('init', (ev: any) => {
        try {
          const data = JSON.parse(ev.data || '{}');
          const s = data.session;
          if (!s) return;
          setConnectedScanners(Array.isArray(s.connectedScanners) ? s.connectedScanners : []);
          setIsPaused(Boolean(s.paused));
          setDuplicateGuard(Boolean(s.duplicateGuard));
          const list: BridgeScanItem[] = Array.isArray(s.scans) ? s.scans : [];
          setReceiverScans(list.slice().reverse());
          // Mark already-typed items as processed, enqueue any still-queued ones safely
          list.forEach((item) => {
            if (item.status === 'typed' || item.status === 'failed') {
              processedScanIdsRef.current.add(item.id);
            } else if (item.status === 'queued' && !processedScanIdsRef.current.has(item.id)) {
              processedScanIdsRef.current.add(item.id);
              typingQueueRef.current.push(item);
            }
          });
          if (typingQueueRef.current.length > 0 && !s.paused) {
            drainTypingQueue();
          }
        } catch {}
      });

      es.addEventListener('scan:new', (ev: any) => {
        try {
          const data = JSON.parse(ev.data || '{}');
          const scan: BridgeScanItem | undefined = data.scan;
          if (!scan || !scan.id) return;
          if (processedScanIdsRef.current.has(scan.id)) return;
          processedScanIdsRef.current.add(scan.id);
          setReceiverScans((prev) => {
            if (prev.some((x) => x.id === scan.id)) return prev;
            return [scan, ...prev].slice(0, 500);
          });
          typingQueueRef.current.push(scan);
          drainTypingQueue();
        } catch {}
      });

      es.addEventListener('scanner:joined', (ev: any) => {
        try {
          const data = JSON.parse(ev.data || '{}');
          if (Array.isArray(data.connectedScanners)) {
            setConnectedScanners(data.connectedScanners);
          }
          playBeep('scan');
          setReceiverNotice({
            type: 'ok',
            text: `دستگاه «${data.scanner?.deviceName || 'بارکدخوان'}» متصل شد و آماده ارسال بارکد به سایان است.`
          });
        } catch {}
      });

      es.addEventListener('scanner:left', (ev: any) => {
        try {
          const data = JSON.parse(ev.data || '{}');
          if (Array.isArray(data.connectedScanners)) {
            setConnectedScanners(data.connectedScanners);
          }
        } catch {}
      });

      es.addEventListener('session:closed', () => {
        setHostStreamConnected(false);
        setHostCode('');
        setHostToken('');
        setQrDataUrl('');
      });

      es.onerror = () => {
        setHostStreamConnected(false);
      };
    },
    [drainTypingQueue, playBeep]
  );

  // Start or Resume Receiver Session on PC
  const startHostSession = useCallback(
    async (tryResume = true) => {
      setHostLoading(true);
      setReceiverNotice(null);
      try {
        let preferredCode = '';
        let savedToken = '';
        if (tryResume) {
          try {
            const cached = JSON.parse(sessionStorage.getItem(HOST_SESSION_KEY) || '{}');
            if (cached.code && cached.hostToken) {
              preferredCode = cached.code;
              savedToken = cached.hostToken;
            }
          } catch {}
        }

        const deviceLabel = isElectron
          ? `اپ ویندوز دلکام (${currentUser?.fullName || currentUser?.username || 'اپراتور'})`
          : isTauri
            ? `ویندوز دلکام (${currentUser?.fullName || currentUser?.username || 'اپراتور'})`
            : `مرورگر کامپیوتر (${currentUser?.fullName || currentUser?.username || 'اپراتور'})`;

        const res = await apiCall<{
          success?: boolean;
          code?: string;
          hostToken?: string;
          message?: string;
        }>('/barcode-bridge/sessions', 'POST', {
          preferredCode,
          hostToken: savedToken,
          hostDeviceName: deviceLabel,
          hostPlatform: isElectron ? 'electron' : isTauri ? 'tauri' : 'web',
          hostUsername: currentUser?.username || '',
          hostFullName: currentUser?.fullName || '',
          duplicateGuard
        });

        if (!res?.success || !res?.code || !res?.hostToken) {
          throw new Error(res?.message || 'ایجاد جلسه اتصال ناموفق بود');
        }

        setHostCode(res.code);
        setHostToken(res.hostToken);
        try {
          sessionStorage.setItem(
            HOST_SESSION_KEY,
            JSON.stringify({ code: res.code, hostToken: res.hostToken })
          );
        } catch {}

        // Generate pairing QR code locally
        try {
          const qr = await QRCode.toDataURL(`DLKAM-B2PC:${res.code}`, {
            width: 220,
            margin: 1,
            color: { dark: '#0f172a', light: '#ffffff' }
          });
          setQrDataUrl(qr);
        } catch {}

        // Warm up Electron persistent Win32 SendInput engine so first barcode types in <5ms
        const win = window as any;
        if (isElectron && win.electronAPI?.warmupBarcodeWedge) {
          win.electronAPI
            .warmupBarcodeWedge()
            .then((wRes: any) => {
              if (wRes?.supported) {
                setWedgeSupported(true);
                setWedgeReady(Boolean(wRes?.ready));
              }
            })
            .catch(() => {});
        }

        connectHostStream(res.code, res.hostToken);
      } catch (err: any) {
        setReceiverNotice({
          type: 'err',
          text: err?.message || 'خطا در شروع جلسه گیرنده کامپیوتر'
        });
      } finally {
        setHostLoading(false);
      }
    },
    [connectHostStream, currentUser?.fullName, currentUser?.username, duplicateGuard, isElectron, isTauri]
  );

  // Stop Receiver Session cleanly
  const stopHostSession = useCallback(async () => {
    if (hostEventSourceRef.current) {
      try { hostEventSourceRef.current.close(); } catch {}
      hostEventSourceRef.current = null;
    }
    const code = hostCodeRef.current;
    const token = hostTokenRef.current;
    setHostCode('');
    setHostToken('');
    setQrDataUrl('');
    setHostStreamConnected(false);
    setConnectedScanners([]);
    typingQueueRef.current = [];
    processedScanIdsRef.current.clear();
    try { sessionStorage.removeItem(HOST_SESSION_KEY); } catch {}
    if (code && token) {
      apiCall(`/barcode-bridge/sessions/${code}`, 'DELETE', { hostToken: token }).catch(() => {});
    }
    const win = window as any;
    if (isElectron && win.electronAPI?.stopBarcodeWedge) {
      win.electronAPI.stopBarcodeWedge().catch(() => {});
    }
  }, [isElectron]);

  // Auto-start host session when entering receiver mode on Windows PC
  useEffect(() => {
    if (role === 'receiver' && !hostCode && !hostLoading) {
      startHostSession(true);
    }
  }, [role, hostCode, hostLoading, startHostSession]);

  // Cleanup SSE streams on unmount
  useEffect(() => {
    return () => {
      if (hostEventSourceRef.current) {
        try { hostEventSourceRef.current.close(); } catch {}
      }
      if (senderEventSourceRef.current) {
        try { senderEventSourceRef.current.close(); } catch {}
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (cameraRafRef.current) cancelAnimationFrame(cameraRafRef.current);
    };
  }, []);

  // Update host settings (pause / duplicateGuard / clearHistory)
  const syncHostSettings = async (patch: {
    paused?: boolean;
    duplicateGuard?: boolean;
    clearHistory?: boolean;
  }) => {
    if (typeof patch.paused === 'boolean') setIsPaused(patch.paused);
    if (typeof patch.duplicateGuard === 'boolean') setDuplicateGuard(patch.duplicateGuard);
    if (patch.clearHistory) {
      setReceiverScans([]);
      typingQueueRef.current = [];
      processedScanIdsRef.current.clear();
    }
    if (hostCode && hostToken) {
      try {
        await apiCall(`/barcode-bridge/sessions/${hostCode}/settings`, 'PATCH', {
          hostToken,
          ...patch
        });
      } catch {}
    }
  };

  // 3-Second Test Typing into active Sayan window
  const runTestTyping = () => {
    if (testCountdown > 0) return;
    setTestCountdown(3);
    setReceiverNotice({
      type: 'info',
      text: 'ظرف ۳ ثانیه روی کادر بارکد نرم‌افزار سایان (یا Notepad) کلیک کنید تا تست تایپ انجام شود...'
    });
    let rem = 3;
    const iv = setInterval(async () => {
      rem -= 1;
      setTestCountdown(rem);
      if (rem <= 0) {
        clearInterval(iv);
        try {
          await typeTextIntoWindows('TEST-DLKAM-1405', suffixKeyRef.current, focusSayanRef.current);
          playBeep('ack');
          setReceiverNotice({
            type: 'ok',
            text: wedgeSupportedRef.current
              ? 'تست تایپ با موفقیت در پنجره فعال ویندوز انجام شد ✓'
              : 'کد تست در کلیپ‌بورد کپی شد (برای تایپ مستقیم در سایان، از اپلیکیشن ویندوز دلکام استفاده کنید).'
          });
        } catch (err: any) {
          playBeep('error');
          setReceiverNotice({
            type: 'err',
            text: err?.message || 'خطا در اجرای تست تایپ'
          });
        }
      }
    }, 1000);
  };

  // ---------------- SENDER (Android / Mobile PDA) LOGIC ----------------
  const fetchDiscoverablePcs = useCallback(async () => {
    if (!isOnline) return;
    setLoadingPcs(true);
    try {
      const qs = currentUser?.username ? `?username=${encodeURIComponent(currentUser.username)}` : '';
      const res = await apiCall<{
        success?: boolean;
        sessions?: DiscoverableSession[];
      }>(`/barcode-bridge/my-sessions${qs}`, 'GET');
      if (res?.success && Array.isArray(res.sessions)) {
        setDiscoverablePcs(res.sessions);
      }
    } catch {
      // Ignore quietly when offline
    } finally {
      setLoadingPcs(false);
    }
  }, [currentUser?.username, isOnline]);

  useEffect(() => {
    if (role === 'sender' && !pairedCode && isOnline) {
      fetchDiscoverablePcs();
      const iv = setInterval(fetchDiscoverablePcs, 6000);
      return () => clearInterval(iv);
    }
  }, [role, pairedCode, isOnline, fetchDiscoverablePcs]);

  const connectSenderStream = useCallback(
    (code: string) => {
      if (senderEventSourceRef.current) {
        try { senderEventSourceRef.current.close(); } catch {}
        senderEventSourceRef.current = null;
      }
      const url = buildSseUrl(code, {
        role: 'scanner',
        clientId: scannerIdRef.current
      });
      const es = new EventSource(url);
      senderEventSourceRef.current = es;

      es.onopen = () => setSenderStreamConnected(true);

      es.addEventListener('init', (ev: any) => {
        try {
          const data = JSON.parse(ev.data || '{}');
          const s = data.session;
          if (!s) return;
          setPairedPcName(s.hostDeviceName || 'کامپیوتر ویندوز');
          setPairedHostOnline(Boolean(s.hostOnline));
          setPairedHostPaused(Boolean(s.paused));
          if (Array.isArray(s.scans)) {
            setSenderScans(s.scans.slice(-150).reverse());
          }
        } catch {}
      });

      es.addEventListener('scan:ack', (ev: any) => {
        try {
          const ack = JSON.parse(ev.data || '{}');
          setSenderScans((prev) =>
            prev.map((item) =>
              item.id === ack.scanId || (ack.clientScanId && item.clientScanId === ack.clientScanId)
                ? {
                    ...item,
                    status: ack.status === 'failed' ? 'failed' : 'typed',
                    ackAt: ack.ackAt || Date.now(),
                    error: ack.error || null
                  }
                : item
            )
          );
          if (ack.status === 'typed') {
            playBeep('ack');
            setSenderFeedback({
              type: 'ok',
              text: `✓ در سایان / کامپیوتر تایپ شد: ${ack.barcode}`
            });
          } else {
            playBeep('error');
            setSenderFeedback({
              type: 'err',
              text: `خطای تایپ در کامپیوتر (${ack.barcode}): ${ack.error || 'خطای نامشخص'}`
            });
          }
        } catch {}
      });

      es.addEventListener('session:updated', (ev: any) => {
        try {
          const data = JSON.parse(ev.data || '{}');
          if (typeof data.hostOnline === 'boolean') setPairedHostOnline(data.hostOnline);
          if (typeof data.paused === 'boolean') setPairedHostPaused(data.paused);
          if (data.cleared) setSenderScans([]);
        } catch {}
      });

      es.addEventListener('session:closed', () => {
        setSenderStreamConnected(false);
        setPairedHostOnline(false);
        setSenderFeedback({
          type: 'warn',
          text: 'جلسه اتصال توسط کامپیوتر بسته شد. در صورت ادامه اسکن، بارکدها در صف آفلاین ذخیره می‌شوند.'
        });
      });

      es.onerror = () => {
        setSenderStreamConnected(false);
      };
    },
    [playBeep]
  );

  const pairWithPc = useCallback(
    async (rawCode: string) => {
      const cleanCode = String(rawCode || '').replace(/\D/g, '');
      if (cleanCode.length !== 6) {
        setSenderFeedback({ type: 'err', text: 'لطفاً کد ۶ رقمی نمایش‌داده‌شده در کامپیوتر را وارد کنید.' });
        return;
      }
      setIsPairing(true);
      setSenderFeedback(null);
      try {
        const deviceName = isTouch
          ? `بارکدخوان اندروید (${currentUser?.fullName || currentUser?.username || 'اپراتور'})`
          : `مرورگر فرستنده (${currentUser?.fullName || currentUser?.username || 'اپراتور'})`;

        const res = await apiCall<{
          success?: boolean;
          message?: string;
          session?: {
            hostDeviceName?: string;
            hostOnline?: boolean;
            paused?: boolean;
          };
        }>(`/barcode-bridge/sessions/${cleanCode}/join`, 'POST', {
          scannerId: scannerIdRef.current,
          deviceName,
          username: currentUser?.username || '',
          fullName: currentUser?.fullName || ''
        });
        if (!res?.success) {
          throw new Error(res?.message || 'کد اتصال نامعتبر است');
        }
        setPairedCode(cleanCode);
        setPairCodeInput(cleanCode);
        setPairedPcName(res.session?.hostDeviceName || 'کامپیوتر ویندوز');
        setPairedHostOnline(Boolean(res.session?.hostOnline));
        setPairedHostPaused(Boolean(res.session?.paused));
        try { localStorage.setItem(LAST_PAIRED_CODE_KEY, cleanCode); } catch {}
        connectSenderStream(cleanCode);
        playBeep('ack');
        setSenderFeedback({
          type: 'ok',
          text: `متصل به «${res.session?.hostDeviceName || 'کامپیوتر'}» — آماده اسکن مستقیم به سایان`
        });
        setTimeout(() => scannerInputRef.current?.focus(), 180);
      } catch (err: any) {
        playBeep('error');
        setSenderFeedback({
          type: 'err',
          text: err?.message || 'اتصال به کامپیوتر برقرار نشد؛ کد ۶ رقمی را بررسی کنید.'
        });
      } finally {
        setIsPairing(false);
      }
    },
    [connectSenderStream, currentUser?.fullName, currentUser?.username, isTouch, playBeep]
  );

  const disconnectFromPc = async () => {
    if (senderEventSourceRef.current) {
      try { senderEventSourceRef.current.close(); } catch {}
      senderEventSourceRef.current = null;
    }
    const prevCode = pairedCode;
    setPairedCode('');
    setPairedPcName('');
    setSenderStreamConnected(false);
    setPairedHostOnline(false);
    if (prevCode) {
      apiCall(`/barcode-bridge/sessions/${prevCode}/leave`, 'POST', {
        scannerId: scannerIdRef.current
      }).catch(() => {});
    }
  };

  // Send single barcode from PDA to PC (or queue offline if disconnected)
  const submitScannedBarcode = useCallback(
    async (rawBarcode: string, forceAllowDuplicate = false) => {
      const clean = String(rawBarcode || '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 128);
      if (!clean) return;
      setBarcodeInput('');

      // Check if user scanned a pairing QR code directly with hardware gun!
      const pairMatch = clean.match(/^DLKAM-B2PC:(\d{6})$/i);
      if (pairMatch) {
        pairWithPc(pairMatch[1]);
        return;
      }

      const clientScanId = `cs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // If offline OR not yet paired with PC -> save safely into local offline queue!
      if (!isOnline || !pairedCode) {
        setOfflineQueue((prev) => {
          if (!forceAllowDuplicate && prev.some((q) => q.barcode.toUpperCase() === clean.toUpperCase())) {
            playBeep('error');
            setSenderFeedback({
              type: 'warn',
              text: `بارکد تکراری در صف آفلاین: ${clean}`,
              duplicateBarcode: clean
            });
            return prev;
          }
          playBeep('scan');
          setSenderFeedback({
            type: 'info',
            text: !isOnline
              ? `ذخیره در صف آفلاین (بدون اینترنت): ${clean}`
              : `ذخیره در صف موقت (پس از اتصال به کامپیوتر ارسال کنید): ${clean}`
          });
          return [...prev, { clientScanId, barcode: clean, scannedAt: Date.now() }];
        });
        setTimeout(() => scannerInputRef.current?.focus(), 40);
        return;
      }

      // Optimistic local row
      const optimisticItem: BridgeScanItem = {
        id: clientScanId,
        clientScanId,
        barcode: clean,
        status: 'queued',
        createdAt: Date.now()
      };
      setSenderScans((prev) => [optimisticItem, ...prev].slice(0, 200));
      playBeep('scan');

      try {
        const res = await apiCall<{
          success?: boolean;
          paused?: boolean;
          accepted?: BridgeScanItem[];
          duplicates?: Array<{ barcode: string }>;
        }>(`/barcode-bridge/sessions/${pairedCode}/scan`, 'POST', {
          barcode: clean,
          clientScanId,
          scannerId: scannerIdRef.current,
          scannerName: currentUser?.fullName || currentUser?.username || 'بارکدخوان اندروید',
          forceAllowDuplicate
        });

        if ((res?.duplicates?.length || 0) > 0 && (!res.accepted || res.accepted.length === 0)) {
          setSenderScans((prev) => prev.filter((x) => x.clientScanId !== clientScanId));
          playBeep('error');
          setSenderFeedback({
            type: 'warn',
            text: `بارکد تکراری رد شد: ${clean}`,
            duplicateBarcode: clean
          });
          return;
        }

        const serverScan = res?.accepted?.[0];
        if (serverScan) {
          setSenderScans((prev) =>
            prev.map((x) =>
              x.clientScanId === clientScanId
                ? { ...x, id: serverScan.id, status: serverScan.status || 'queued' }
                : x
            )
          );
          setSenderFeedback({
            type: 'info',
            text: res?.paused
              ? `ارسال شد (کامپیوتر در حالت مکث است): ${clean}`
              : `ارسال شد به کامپیوتر: ${clean}`
          });
        }
      } catch (err: any) {
        // Network failure mid-scan -> auto-fallback to offline queue so ZERO cartons are ever lost!
        setSenderScans((prev) => prev.filter((x) => x.clientScanId !== clientScanId));
        setOfflineQueue((prev) => [...prev, { clientScanId, barcode: clean, scannedAt: Date.now() }]);
        playBeep('error');
        setSenderFeedback({
          type: 'warn',
          text: `اختلال شبکه؛ بارکد «${clean}» جهت جلوگیری از ازدست‌رفتن در صف آفلاین ذخیره شد.`
        });
      } finally {
        setTimeout(() => scannerInputRef.current?.focus(), 40);
      }
    },
    [currentUser?.fullName, currentUser?.username, isOnline, pairWithPc, pairedCode, playBeep]
  );

  // Drip-feed Offline Queue to PC (one-by-one / batched safely so Sayan never drops a carton)
  const flushOfflineQueueToPc = async () => {
    if (!pairedCode || !isOnline || offlineQueue.length === 0 || isFlushingOffline) return;
    setIsFlushingOffline(true);
    const snapshot = [...offlineQueue];
    setOfflineFlushProgress({ sent: 0, total: snapshot.length });
    const remaining: OfflineQueuedBarcode[] = [];
    let acceptedCount = 0;
    let duplicateCount = 0;

    try {
      // Send in compact chunks of 10 so server broadcasts smoothly to PC's sequential typing worker
      for (let i = 0; i < snapshot.length; i += 10) {
        const chunk = snapshot.slice(i, i + 10);
        try {
          const res = await apiCall<{
            success?: boolean;
            accepted?: BridgeScanItem[];
            duplicates?: Array<{ barcode: string }>;
          }>(`/barcode-bridge/sessions/${pairedCode}/scan`, 'POST', {
            scannerId: scannerIdRef.current,
            scannerName: currentUser?.fullName || currentUser?.username || 'بارکدخوان اندروید',
            items: chunk.map((c) => ({
              barcode: c.barcode,
              clientScanId: c.clientScanId,
              scannedAt: c.scannedAt,
              fromOfflineQueue: true
            }))
          });
          const acc: BridgeScanItem[] = Array.isArray(res?.accepted) ? res.accepted : [];
          acceptedCount += acc.length;
          duplicateCount += Array.isArray(res?.duplicates) ? res.duplicates.length : 0;
          if (acc.length > 0) {
            setSenderScans((prev) => [...acc.slice().reverse(), ...prev].slice(0, 250));
          }
          setOfflineFlushProgress({ sent: Math.min(snapshot.length, i + chunk.length), total: snapshot.length });
        } catch {
          remaining.push(...chunk);
        }
      }
      setOfflineQueue(remaining);
      playBeep(remaining.length === 0 ? 'ack' : 'error');
      setSenderFeedback({
        type: remaining.length === 0 ? 'ok' : 'warn',
        text:
          remaining.length === 0
            ? `${acceptedCount.toLocaleString('fa-IR')} بارکد صف آفلاین به کامپیوتر ارسال شد${duplicateCount > 0 ? ` (${duplicateCount} تکراری حذف شد)` : ''} و در حال تایپ دونه به دونه در سایان است.`
            : `${acceptedCount} مورد ارسال شد و ${remaining.length} مورد در صف باقی ماند.`
      });
    } finally {
      setIsFlushingOffline(false);
      setOfflineFlushProgress(null);
    }
  };

  // ---------------- CAMERA QR / BARCODE SCANNER ----------------
  const stopCamera = useCallback(() => {
    if (cameraRafRef.current) {
      cancelAnimationFrame(cameraRafRef.current);
      cameraRafRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setCameraMode('none');
    setCameraError('');
  }, []);

  const startCamera = async (mode: 'pair_qr' | 'barcode') => {
    setCameraError('');
    setCameraMode(mode);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('دوربین در این مرورگر در دسترس نیست (نیاز به اتصال HTTPS).');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      cameraStreamRef.current = stream;

      const waitVideoAndScan = () => {
        const video = videoRef.current;
        if (!video) {
          cameraRafRef.current = requestAnimationFrame(waitVideoAndScan);
          return;
        }
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.play().catch(() => {});

        const hasBarcodeDetector = typeof (window as any).BarcodeDetector === 'function';
        const detector = hasBarcodeDetector
          ? new (window as any).BarcodeDetector({
              formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a']
            })
          : null;

        const tick = async () => {
          if (!cameraStreamRef.current) return;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            let detected = '';
            if (detector) {
              try {
                const found = await detector.detect(video);
                if (found && found.length > 0 && found[0].rawValue) {
                  detected = String(found[0].rawValue).trim();
                }
              } catch {}
            }
            if (!detected && canvasRef.current) {
              const canvas = canvasRef.current;
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const qr = jsQR(imgData.data, imgData.width, imgData.height);
                if (qr?.data) detected = qr.data.trim();
              }
            }

            if (detected) {
              const now = Date.now();
              const isSameQuick =
                lastCameraCodeRef.current.code === detected &&
                now - lastCameraCodeRef.current.at < 1500;
              if (!isSameQuick) {
                lastCameraCodeRef.current = { code: detected, at: now };
                if (mode === 'pair_qr') {
                  const m = detected.match(/(\d{6})/);
                  if (m) {
                    stopCamera();
                    pairWithPc(m[1]);
                    return;
                  }
                } else {
                  submitScannedBarcode(detected);
                }
              }
            }
          }
          cameraRafRef.current = requestAnimationFrame(tick);
        };
        cameraRafRef.current = requestAnimationFrame(tick);
      };
      cameraRafRef.current = requestAnimationFrame(waitVideoAndScan);
    } catch (err: any) {
      setCameraError(err?.message || 'دسترسی به دوربین رد شد یا دوربین یافت نشد.');
    }
  };

  // ---------------- METRICS ----------------
  const receiverStats = useMemo(() => {
    const total = receiverScans.length;
    const typed = receiverScans.filter((s) => s.status === 'typed').length;
    const queued = receiverScans.filter((s) => s.status === 'queued' || s.status === 'typing').length;
    const totalWeight = receiverScans.reduce((acc, s) => acc + parseLepanWeight(s.barcode), 0);
    return { total, typed, queued, totalWeight: Number(totalWeight.toFixed(2)) };
  }, [receiverScans]);

  const senderStats = useMemo(() => {
    const typed = senderScans.filter((s) => s.status === 'typed').length;
    const total = senderScans.length;
    const totalWeight =
      senderScans.reduce((acc, s) => acc + parseLepanWeight(s.barcode), 0) +
      offlineQueue.reduce((acc, q) => acc + parseLepanWeight(q.barcode), 0);
    return { total, typed, offline: offlineQueue.length, totalWeight: Number(totalWeight.toFixed(2)) };
  }, [senderScans, offlineQueue]);

  const copyTextSafe = async (txt: string, which: 'code' | 'all') => {
    try {
      const win = window as any;
      if (win.electronAPI?.copyText) await win.electronAPI.copyText(txt);
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(txt);
      if (which === 'code') {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 1800);
      } else {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 1800);
      }
    } catch {}
  };

  const formattedHostCode = hostCode ? `${hostCode.slice(0, 3)}-${hostCode.slice(3)}` : '---';

  return (
    <div
      dir="rtl"
      className={`flex flex-col flex-1 min-h-0 w-full overflow-hidden ${
        embedded
          ? 'bg-transparent'
          : 'bg-slate-50/90 dark:bg-zinc-950 rounded-2xl border border-slate-200/80 dark:border-zinc-800'
      }`}
    >
      {/* Compact Adaptive Header */}
      <div className="flex-none px-2.5 py-2 sm:px-5 sm:py-3.5 bg-white dark:bg-zinc-900 border-b border-slate-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-md shrink-0">
            <Barcode size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-xs sm:text-base font-black text-slate-900 dark:text-white truncate">
                بارکدخوان به کامپیوتر (تایپ مستقیم در سایان)
              </h2>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 ${
                  isOnline
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                <span>{isOnline ? 'آنلاین' : 'آفلاین'}</span>
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-slate-500 dark:text-zinc-400">
              اتصال مستقیم اپلیکیشن اندروید به اپلیکیشن ویندوز برای تایپ دونه به دونه بارکدها در پنجره فعال سایان ERP
            </p>
          </div>
        </div>

        {/* Mode Switcher + Sound Toggle */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <div className="flex-1 sm:flex-initial grid grid-cols-2 gap-1 p-0.5 rounded-xl bg-slate-100 dark:bg-zinc-800">
            <button
              type="button"
              onClick={() => setRole('receiver')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                role === 'receiver'
                  ? 'bg-white dark:bg-zinc-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              <Monitor size={13} />
              <span>گیرنده (کامپیوتر)</span>
            </button>
            <button
              type="button"
              onClick={() => setRole('sender')}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                role === 'sender'
                  ? 'bg-white dark:bg-zinc-900 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              <Smartphone size={13} />
              <span>فرستنده (بارکدخوان)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 shrink-0 cursor-pointer"
            title={soundEnabled ? 'قطع صدای بوق' : 'فعال‌سازی صدای بوق'}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
        </div>
      </div>

      {/* =====================================================================
          MODE 1: RECEIVER (WINDOWS PC -> TYPES DIRECTLY INTO SAYAN WINDOW)
          ===================================================================== */}
      {role === 'receiver' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 space-y-4 custom-scrollbar">
          {/* Runtime Capability Banner */}
          <div
            className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-2 text-xs ${
              wedgeSupported
                ? 'bg-emerald-50/90 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-amber-50/90 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck size={17} className="shrink-0" />
              <div className="min-w-0">
                <p className="font-black text-xs">
                  {wedgeSupported
                    ? `موتور تایپ مستقیم سیستمی ویندوز (${wedgeRuntime === 'electron' ? 'Electron' : 'Tauri'}) فعال است — مقاوم در برابر زبان کیبورد فارسی/انگلیسی`
                    : 'نسخه تحت وب (مرورگر): بارکدها به‌صورت لحظه‌ای دریافت و در کلیپ‌بورد کپی می‌شوند'}
                </p>
                <p className="text-[11px] opacity-85 mt-0.5">
                  {wedgeSupported
                    ? 'کافی است داخل پنجره سایان (کادر بارکد/کد کالا) کلیک کنید؛ هر بارکدی که با دستگاه اندرویدی اسکن شود، بلافاصله دونه به دونه در سایان تایپ و ثبت می‌شود.'
                    : 'برای تایپ خودکار و مستقیم داخل پنجره نرم‌افزار سایان، همین صفحه را داخل اپلیکیشن ویندوز دلکام باز کنید.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={runTestTyping}
              disabled={testCountdown > 0}
              className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Zap size={13} />
              <span>{testCountdown > 0 ? `کلیک روی سایان (${testCountdown})...` : 'تست تایپ در سایان'}</span>
            </button>
          </div>

          {receiverNotice && (
            <div
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                receiverNotice.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : receiverNotice.type === 'err'
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
              }`}
            >
              <span>{receiverNotice.text}</span>
              <button type="button" onClick={() => setReceiverNotice(null)} className="p-1 opacity-70 hover:opacity-100">
                <X size={13} />
              </button>
            </div>
          )}

          {/* Main Grid: Pairing Card + Controls + Live Queue */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Pairing & QR Column */}
            <div className="lg:col-span-4 space-y-3">
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                    <QrCode size={15} className="text-emerald-600" />
                    <span>اتصال گوشی / بارکدخوان اندروید</span>
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 ${
                      hostStreamConnected
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${hostStreamConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    {hostStreamConnected ? 'آماده دریافت' : 'در حال اتصال...'}
                  </span>
                </div>

                {hostLoading ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <Loader2 size={24} className="animate-spin text-emerald-600" />
                    <span className="text-xs font-bold">در حال ایجاد کد اتصال...</span>
                  </div>
                ) : (
                  <>
                    {qrDataUrl && (
                      <div className="flex justify-center">
                        <div className="p-2.5 bg-white rounded-2xl border-2 border-slate-200 shadow-inner">
                          <img src={qrDataUrl} alt="Pairing QR" className="w-40 h-40 object-contain" />
                        </div>
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 text-center">
                      <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                        کد اتصال ۶ رقمی (یا اسکن QR در اپ اندروید):
                      </p>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <span className="text-2xl sm:text-3xl font-black tracking-[0.2em] text-slate-900 dark:text-white font-mono" dir="ltr">
                          {formattedHostCode}
                        </span>
                        {hostCode && (
                          <button
                            type="button"
                            onClick={() => copyTextSafe(hostCode, 'code')}
                            className="p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:text-emerald-600 cursor-pointer"
                            title="کپی کد اتصال"
                          >
                            {copiedCode ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startHostSession(false)}
                        className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw size={13} />
                        <span>کد جدید</span>
                      </button>
                      <button
                        type="button"
                        onClick={stopHostSession}
                        className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Unlink size={13} />
                        <span>پایان</span>
                      </button>
                    </div>
                  </>
                )}

                {/* Connected Scanners List */}
                <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
                  <p className="text-[11px] font-black text-slate-600 dark:text-zinc-300 mb-1.5">
                    دستگاه‌های متصل ({connectedScanners.length.toLocaleString('fa-IR')}):
                  </p>
                  {connectedScanners.length === 0 ? (
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                      در انتظار اتصال گوشی یا بارکدخوان اندروید...
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {connectedScanners.map((sc) => (
                        <div
                          key={sc.scannerId}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <span className="font-bold text-slate-800 dark:text-zinc-100 truncate">
                              {sc.deviceName}
                            </span>
                          </div>
                          <span className="font-black text-emerald-700 dark:text-emerald-300 shrink-0">
                            {(sc.scanCount || 0).toLocaleString('fa-IR')} اسکن
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sayan Typing Settings Card */}
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 shadow-xs space-y-3">
                <h3 className="text-xs font-black text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                  <Keyboard size={15} className="text-blue-600" />
                  <span>تنظیمات تایپ در سایان ERP</span>
                </h3>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-zinc-400 mb-1">
                      کلید خودکار پس از هر بارکد:
                    </label>
                    <select
                      value={suffixKey}
                      onChange={(e) => setSuffixKey(e.target.value as SuffixKey)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-bold"
                    >
                      <option value="enter">Enter (استاندارد ثبت ردیف در سایان)</option>
                      <option value="tab">Tab (رفتن به ستون بعدی)</option>
                      <option value="enter2">دوبار Enter (تأیید و رفتن به ردیف بعد)</option>
                      <option value="tab_enter">Tab + Enter</option>
                      <option value="none">بدون کلید اضافه (فقط متن بارکد)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-zinc-400 mb-1">
                      فاصله زمانی بین هر بارکد (سرعت تایپ در سایان):
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { ms: 80, label: '۸۰ms' },
                        { ms: 220, label: '۲۲۰ms' },
                        { ms: 450, label: '۴۵۰ms' },
                        { ms: 800, label: '۸۰۰ms' }
                      ].map((opt) => (
                        <button
                          key={opt.ms}
                          type="button"
                          onClick={() => setDelayBetweenMs(opt.ms)}
                          className={`py-1.5 rounded-lg text-[11px] font-black border cursor-pointer ${
                            delayBetweenMs === opt.ms
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/70 cursor-pointer">
                    <span className="font-bold text-[11px] text-slate-700 dark:text-zinc-200">
                      تایپ مستقیم در پنجره فعال ویندوز
                    </span>
                    <input
                      type="checkbox"
                      checked={directTypingEnabled}
                      onChange={(e) => setDirectTypingEnabled(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                  </label>

                  {isElectron && (
                    <label className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/70 cursor-pointer">
                      <span className="font-bold text-[11px] text-slate-700 dark:text-zinc-200">
                        فوکوس خودکار روی پنجره سایان (Sayan)
                      </span>
                      <input
                        type="checkbox"
                        checked={focusSayan}
                        onChange={(e) => setFocusSayan(e.target.checked)}
                        className="w-4 h-4 accent-blue-600"
                      />
                    </label>
                  )}

                  <label className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-zinc-800/70 cursor-pointer">
                    <span className="font-bold text-[11px] text-slate-700 dark:text-zinc-200">
                      جلوگیری از بارکد تکراری در این جلسه
                    </span>
                    <input
                      type="checkbox"
                      checked={duplicateGuard}
                      onChange={(e) => syncHostSettings({ duplicateGuard: e.target.checked })}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Live Incoming Queue & Log Column */}
            <div className="lg:col-span-8 flex flex-col gap-3">
              {/* KPI Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800">
                  <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                    <Boxes size={12} /> کل بارکدها
                  </p>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    {receiverStats.total.toLocaleString('fa-IR')}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/70 dark:border-emerald-900">
                  <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 size={12} /> تایپ‌شده در سایان
                  </p>
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {receiverStats.typed.toLocaleString('fa-IR')}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900">
                  <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <Clock size={12} /> در صف تایپ
                  </p>
                  <p className="text-xl font-black text-amber-700 dark:text-amber-300 mt-0.5">
                    {receiverStats.queued.toLocaleString('fa-IR')}
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200/70 dark:border-blue-900">
                  <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                    <Scale size={12} /> جمع وزن (کارتن)
                  </p>
                  <p className="text-xl font-black text-blue-700 dark:text-blue-300 mt-0.5">
                    {receiverStats.totalWeight > 0 ? `${receiverStats.totalWeight.toLocaleString('fa-IR')} kg` : '—'}
                  </p>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => syncHostSettings({ paused: !isPaused })}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer ${
                      isPaused
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                    }`}
                  >
                    {isPaused ? <Play size={14} /> : <Pause size={14} />}
                    <span>{isPaused ? 'ادامه تایپ در سایان' : 'مکث موقت تایپ'}</span>
                  </button>

                  {receiverScans.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        copyTextSafe(
                          receiverScans
                            .slice()
                            .reverse()
                            .map((s) => s.barcode)
                            .join('\n'),
                          'all'
                        )
                      }
                      className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedAll ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                      <span>{copiedAll ? 'کپی شد' : 'کپی همه بارکدها'}</span>
                    </button>
                  )}
                </div>

                {receiverScans.length > 0 && (
                  <button
                    type="button"
                    onClick={() => syncHostSettings({ clearHistory: true })}
                    className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>پاک‌سازی لیست جلسه</span>
                  </button>
                )}
              </div>

              {/* Live Scanned Stream Table */}
              <div className="flex-1 min-h-[300px] rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 overflow-hidden flex flex-col">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/50 flex items-center justify-between">
                  <span className="text-xs font-black text-slate-700 dark:text-zinc-200">
                    صف زنده بارکدهای دریافتی از بارکدخوان
                  </span>
                  {isPaused && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-200 text-amber-950 text-[10px] font-black">
                      تایپ در حالت مکث است
                    </span>
                  )}
                </div>

                {receiverScans.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-zinc-500">
                    <Barcode size={36} className="opacity-40 mb-2" />
                    <p className="text-xs font-bold">هنوز بارکدی دریافت نشده است</p>
                    <p className="text-[11px] mt-1 max-w-sm leading-relaxed">
                      اپ اندروید را با کد ۶ رقمی یا QR بالا متصل کنید، سپس داخل پنجره سایان روی فیلد بارکد کلیک کرده و شروع به اسکن کارتن‌ها نمایید.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-[460px] divide-y divide-slate-100 dark:divide-zinc-800">
                    {receiverScans.map((item, idx) => {
                      const rowNum = receiverScans.length - idx;
                      const weight = parseLepanWeight(item.barcode);
                      return (
                        <div
                          key={item.id}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-zinc-800/40"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-[11px] font-black flex items-center justify-center shrink-0">
                              {rowNum.toLocaleString('fa-IR')}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white" dir="ltr">
                                  {item.barcode}
                                </span>
                                {weight > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                                    {weight} kg
                                  </span>
                                )}
                                {item.fromOfflineQueue && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[9px] font-bold">
                                    صف آفلاین
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                                {item.scannerName || 'بارکدخوان'} • {new Date(item.createdAt).toLocaleTimeString('fa-IR')}
                                {item.error ? ` • ${item.error}` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {item.status === 'typed' && (
                              <span className="px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-black flex items-center gap-1">
                                <CheckCircle2 size={12} />
                                <span>تایپ شد</span>
                              </span>
                            )}
                            {(item.status === 'queued' || item.status === 'typing') && (
                              <span className="px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-black flex items-center gap-1">
                                <Loader2 size={12} className="animate-spin" />
                                <span>{item.status === 'typing' ? 'در حال تایپ...' : 'در صف'}</span>
                              </span>
                            )}
                            {item.status === 'failed' && (
                              <span className="px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-black flex items-center gap-1">
                                <AlertCircle size={12} />
                                <span>خطا</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* =====================================================================
           MODE 2: SENDER (ANDROID PDA / MOBILE -> SCANS & STREAMS TO WINDOWS PC)
           ===================================================================== */
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2.5 sm:p-5 space-y-2.5 sm:space-y-4 custom-scrollbar">
          {/* PAIRING SECTION (Shown when not paired yet) */}
          {!pairedCode ? (
            <div className="max-w-lg mx-auto space-y-3">
              {/* Auto-discovered Online PCs */}
              {discoverablePcs.length > 0 && (
                <div className="p-3 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                      <Monitor size={14} />
                      <span>کامپیوترهای آماده اتصال ({discoverablePcs.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={fetchDiscoverablePcs}
                      className="p-1 text-emerald-700 dark:text-emerald-300 cursor-pointer"
                    >
                      <RefreshCw size={13} className={loadingPcs ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {discoverablePcs.map((pc) => (
                      <button
                        key={pc.code}
                        type="button"
                        onClick={() => pairWithPc(pc.code)}
                        disabled={isPairing}
                        className="w-full p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800 hover:border-emerald-500 flex items-center justify-between gap-2 text-right transition-all cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {pc.hostDeviceName}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                            کد: <span className="font-mono font-bold">{pc.code}</span> • {pc.hostFullName}
                          </p>
                        </div>
                        <span className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-black shrink-0 flex items-center gap-1">
                          <Link2 size={12} />
                          <span>اتصال</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual 6-Digit Pairing Code + QR Scan */}
              <div className="p-3.5 sm:p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-3">
                <div className="text-center">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    اتصال به اپلیکیشن ویندوز (سایان)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                    کد ۶ رقمی نمایش‌داده‌شده در کامپیوتر را وارد کنید یا QR کد روی صفحه کامپیوتر را اسکن نمایید
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={7}
                    value={pairCodeInput}
                    onChange={(e) => setPairCodeInput(e.target.value.replace(/[^\d-]/g, '').slice(0, 7))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') pairWithPc(pairCodeInput);
                    }}
                    placeholder="کد ۶ رقمی (مثلاً 482915)"
                    dir="ltr"
                    className="flex-1 px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-zinc-700 text-center text-lg font-mono font-black tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={() => pairWithPc(pairCodeInput)}
                    disabled={isPairing || pairCodeInput.replace(/\D/g, '').length !== 6}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {isPairing ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                    <span>اتصال</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => startCamera('pair_qr')}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-100 text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Camera size={15} className="text-blue-600" />
                  <span>اسکن QR کد از روی صفحه کامپیوتر</span>
                </button>
              </div>
            </div>
          ) : (
            /* CONNECTED PC STATUS BAR */
            <div className="p-2.5 rounded-2xl bg-emerald-600 text-white flex items-center justify-between gap-2 shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    senderStreamConnected && pairedHostOnline ? 'bg-lime-300 animate-pulse' : 'bg-amber-300'
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-black truncate">
                    متصل به: {pairedPcName} ({pairedCode})
                  </p>
                  <p className="text-[10px] text-emerald-100">
                    {pairedHostPaused
                      ? 'کامپیوتر در حالت مکث موقت است'
                      : pairedHostOnline
                        ? 'هر بارکد بلافاصله در پنجره سایان تایپ می‌شود'
                        : 'در انتظار آنلاین شدن کامپیوتر...'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={disconnectFromPc}
                className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[11px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Unlink size={12} />
                <span>قطع</span>
              </button>
            </div>
          )}

          {/* OFFLINE QUEUE BANNER (Works even before pairing or when Wi-Fi drops!) */}
          {offlineQueue.length > 0 && (
            <div className="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <UploadCloud size={17} className="text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-black text-amber-900 dark:text-amber-200">
                    {offlineQueue.length.toLocaleString('fa-IR')} بارکد در صف آفلاین ذخیره شده است
                  </p>
                  <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80">
                    {pairedCode && isOnline
                      ? 'آماده ارسال دونه به دونه به سایان در کامپیوتر'
                      : 'پس از اتصال به اینترنت و کامپیوتر، با یک لمس ارسال می‌شود'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {pairedCode && isOnline && (
                  <button
                    type="button"
                    onClick={flushOfflineQueueToPc}
                    disabled={isFlushingOffline}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {isFlushingOffline ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    <span>
                      {offlineFlushProgress
                        ? `ارسال ${offlineFlushProgress.sent}/${offlineFlushProgress.total}...`
                        : 'ارسال صف به سایان'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOfflineQueue([])}
                  className="p-1.5 rounded-xl bg-amber-200/70 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 cursor-pointer"
                  title="پاک‌سازی صف آفلاین"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )}

          {/* SCANNER DECK (Always available — works both Online & Offline!) */}
          <div className="p-3 rounded-2xl bg-slate-900 text-white space-y-2.5 shadow-md">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Barcode size={16} className="text-emerald-400" />
                <span className="text-xs font-black">
                  {pairedCode ? 'اسکن مستقیم به سایان' : 'اسکن آفلاین (ذخیره در صف)'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setHardwareGunMode((v) => !v);
                    setTimeout(() => scannerInputRef.current?.focus(), 60);
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer ${
                    hardwareGunMode ? 'bg-emerald-500 text-slate-950' : 'bg-white/15 text-white'
                  }`}
                >
                  <Keyboard size={11} />
                  <span>{hardwareGunMode ? 'بارکدخوان لیزری' : 'کیبورد دستی'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => startCamera('barcode')}
                  className="px-2 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-black flex items-center gap-1 cursor-pointer"
                >
                  <Camera size={11} />
                  <span>دوربین</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                ref={scannerInputRef}
                type="text"
                inputMode={hardwareGunMode ? 'none' : 'text'}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitScannedBarcode(barcodeInput);
                  }
                }}
                placeholder={
                  hardwareGunMode
                    ? 'دکمه SCAN بارکدخوان را بزنید...'
                    : 'بارکد را تایپ و Enter بزنید...'
                }
                dir="ltr"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white text-slate-900 font-mono font-black text-sm border-2 border-emerald-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => submitScannedBarcode(barcodeInput)}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Send size={14} />
                <span>ارسال</span>
              </button>
            </div>

            {/* Compact Live KPI Row */}
            <div className="grid grid-cols-3 gap-1.5 text-center pt-0.5">
              <div className="p-1.5 rounded-xl bg-white/10">
                <p className="text-[9px] text-slate-300">ارسال‌شده</p>
                <p className="text-sm font-black text-white">{senderStats.total.toLocaleString('fa-IR')}</p>
              </div>
              <div className="p-1.5 rounded-xl bg-emerald-500/20">
                <p className="text-[9px] text-emerald-200">تایپ‌شده در سایان</p>
                <p className="text-sm font-black text-emerald-300">{senderStats.typed.toLocaleString('fa-IR')}</p>
              </div>
              <div className="p-1.5 rounded-xl bg-blue-500/20">
                <p className="text-[9px] text-blue-200">وزن کل</p>
                <p className="text-sm font-black text-blue-200">
                  {senderStats.totalWeight > 0 ? `${senderStats.totalWeight}` : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Instant Feedback Banner */}
          {senderFeedback && (
            <div
              className={`p-2.5 rounded-xl border text-xs font-bold flex flex-wrap items-center justify-between gap-2 ${
                senderFeedback.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : senderFeedback.type === 'warn'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                    : senderFeedback.type === 'err'
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                      : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
              }`}
            >
              <span className="min-w-0 break-all">{senderFeedback.text}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {senderFeedback.duplicateBarcode && pairedCode && (
                  <button
                    type="button"
                    onClick={() => submitScannedBarcode(senderFeedback.duplicateBarcode!, true)}
                    className="px-2 py-1 rounded-lg bg-amber-600 text-white text-[10px] font-black cursor-pointer"
                  >
                    ارسال مجدد اجباری
                  </button>
                )}
                <button type="button" onClick={() => setSenderFeedback(null)} className="p-0.5 opacity-70">
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {/* Compact Scanned Log (PDA Friendly) */}
          {(senderScans.length > 0 || offlineQueue.length > 0) && (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-800/50">
                <span className="text-[11px] font-black text-slate-700 dark:text-zinc-200">
                  آخرین بارکدهای اسکن‌شده
                </span>
                {offlineQueue.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOfflineQueue((prev) => prev.slice(0, -1))}
                    className="text-[10px] font-black text-amber-700 dark:text-amber-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Undo2 size={11} />
                    <span>حذف آخرین آفلاین</span>
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-100 dark:divide-zinc-800 max-h-64 overflow-y-auto">
                {offlineQueue
                  .slice()
                  .reverse()
                  .map((q) => (
                    <div key={q.clientScanId} className="px-3 py-2 flex items-center justify-between gap-2 bg-amber-50/40 dark:bg-amber-950/15">
                      <span className="font-mono text-xs font-black text-slate-900 dark:text-white truncate" dir="ltr">
                        {q.barcode}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 text-[10px] font-black shrink-0">
                        صف آفلاین
                      </span>
                    </div>
                  ))}
                {senderScans.map((s) => (
                  <div key={s.id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-black text-slate-900 dark:text-white truncate" dir="ltr">
                      {s.barcode}
                    </span>
                    {s.status === 'typed' ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-black flex items-center gap-1 shrink-0">
                        <CheckCircle2 size={11} />
                        <span>تایپ شد</span>
                      </span>
                    ) : s.status === 'failed' ? (
                      <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-black shrink-0">
                        خطا
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-black flex items-center gap-1 shrink-0">
                        <Loader2 size={10} className="animate-spin" />
                        <span>در صف</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Camera Modal Portal (Safe on all Android screen sizes via --app-vh) */}
      {cameraMode !== 'none' &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="dlkam-viewport-modal-backdrop z-[9999] flex items-center justify-center bg-black/85"
            dir="rtl"
          >
            <div
              className="dlkam-viewport-modal-card w-full max-w-md bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden flex flex-col"
              style={{ maxHeight: 'calc(var(--app-vh, 100vh) - 16px)' }}
            >
              <div className="flex-none px-3.5 py-2.5 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <Camera size={15} className="text-emerald-400" />
                  <span>
                    {cameraMode === 'pair_qr'
                      ? 'دوربین را روی QR کد صفحه کامپیوتر بگیرید'
                      : 'اسکن بارکد کارتن با دوربین'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="relative flex-1 min-h-[240px] bg-black flex items-center justify-center overflow-hidden">
                {cameraError ? (
                  <div className="p-4 text-center text-rose-300 text-xs font-bold space-y-2">
                    <AlertCircle size={28} className="mx-auto text-rose-400" />
                    <p>{cameraError}</p>
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="w-56 h-36 border-2 border-emerald-400 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                    </div>
                  </>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              <div className="flex-none p-3 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-400">
                  {cameraMode === 'pair_qr' ? 'اتصال خودکار پس از تشخیص QR' : 'پس از هر اسکن آماده بارکد بعدی است'}
                </span>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-4 py-1.5 rounded-xl bg-zinc-800 text-white text-xs font-black cursor-pointer"
                >
                  بستن دوربین
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default BarcodeToPcBridge;
