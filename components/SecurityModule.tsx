
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User, SecurityLog, DriverPayment, PersonnelDelay, SecurityIncident, SecurityStatus, UserRole, DailySecurityMeta, SystemSettings, PersonnelOvertime, SecurityGoodsItem, ChatGroup } from '../types';
import { 
    getSecurityLogs, saveSecurityLog, updateSecurityLog, deleteSecurityLog, 
    getPersonnelDelays, savePersonnelDelay, updatePersonnelDelay, deletePersonnelDelay, 
    getPersonnelOvertimes, savePersonnelOvertime, updatePersonnelOvertime, deletePersonnelOvertime,
    getSecurityIncidents, saveSecurityIncident, updateSecurityIncident, deleteSecurityIncident, 
    getSettings, saveSettings,
    getDriverPayments, saveDriverPayment, updateDriverPayment, deleteDriverPayment, notifyDriverPaymentToBots,
    getGroups, sendMessage
} from '../services/storageService';
import { generateUUID, getCurrentShamsiDate, getYesterdayShamsiDate, jalaliToGregorian, formatDate, getShamsiDateFromIso, formatLocalDateToIso, getIsoFromJalali } from '../constants';
import { Shield, Plus, CheckCircle, XCircle, Clock, Truck, AlertTriangle, UserCheck, Calendar, Printer, Archive, FileSymlink, Edit, Trash2, Eye, FileText, CheckSquare, User as UserIcon, ListChecks, Activity, FileDown, Loader2, Pencil, ChevronDown, ChevronUp, FolderOpen, Folder, Save, X, Camera, Settings, MessageSquare, ZoomIn, ZoomOut, RotateCcw, Sparkles, Check, CheckCheck, DollarSign, CreditCard, Paperclip, ExternalLink, Send, FileImage, Download, Building2, ShieldCheck, Copy, Share2 } from 'lucide-react';
import { PrintSecurityDailyLog, PrintPersonnelDelay, PrintIncidentReport, PrintPersonnelOvertime, PrintDriverPayment } from './security/SecurityPrints';
import { IranianPlateInput, IranianPlateDisplay } from './IranianPlate';
import { searchSavedDrivers, saveDriverToMemory, getSavedDrivers, findDriverByName, findDriverByPlate, syncDriversFromRecords, SavedDriver } from '../services/driverMemoryService';
import { getRolePermissions } from '../services/authService';
import { generatePdf } from '../utils/pdfGenerator';
import { isInFinancialYear } from '../utils/dateUtils';
import { shareElementToChat } from '../services/chatShareService';

interface Props {
    currentUser: User;
    financialYear?: string;
}

// --- ENHANCED INTERACTIVE SCALED & ZOOMABLE CONTAINER ---
const ScaledContainer: React.FC<{ children: React.ReactNode, isLandscape?: boolean }> = ({ children, isLandscape }) => {
    const [baseScale, setBaseScale] = useState(1);
    const [zoomMultiplier, setZoomMultiplier] = useState(1);
    const containerWrapperRef = useRef<HTMLDivElement>(null);

    // Touch & Drag state refs
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
    const touchStartDistRef = useRef<number | null>(null);
    const touchStartMultiplierRef = useRef<number>(1);
    const lastTapRef = useRef<number>(0);

    const calculateBaseScale = () => {
        const wrapper = containerWrapperRef.current;
        if (wrapper) {
            const wrapperWidth = wrapper.clientWidth;
            const wrapperHeight = wrapper.clientHeight || (window.innerHeight - 80);
            
            // A4 Landscape = 297mm (~1123px width, ~794px height), Portrait = 210mm (~794px width, ~1123px height)
            const targetWidth = isLandscape ? 1123 : 794; 
            const targetHeight = isLandscape ? 794 : 1123;

            const scaleX = (wrapperWidth - 24) / targetWidth;
            const scaleY = (wrapperHeight - 24) / targetHeight;
            
            const calculated = Math.min(scaleX, scaleY, 1.0);
            const finalBase = Math.max(calculated, 0.25);
            setBaseScale(finalBase);
        }
    };

    useEffect(() => {
        calculateBaseScale();
        const handleResize = () => {
            calculateBaseScale();
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isLandscape]);

    const effectiveScale = Math.max(0.2, Math.min(3.5, baseScale * zoomMultiplier));

    const handleZoomIn = () => {
        setZoomMultiplier(prev => Math.min(3.5, Number((prev + 0.2).toFixed(2))));
    };

    const handleZoomOut = () => {
        setZoomMultiplier(prev => Math.max(0.4, Number((prev - 0.2).toFixed(2))));
    };

    const handleResetZoom = () => {
        setZoomMultiplier(1);
        if (containerWrapperRef.current) {
            containerWrapperRef.current.scrollLeft = 0;
            containerWrapperRef.current.scrollTop = 0;
        }
    };

    const handleToggle100 = () => {
        if (Math.abs(effectiveScale - 1.0) < 0.05) {
            handleResetZoom();
        } else {
            const desiredMultiplier = 1.0 / baseScale;
            setZoomMultiplier(Number(desiredMultiplier.toFixed(2)));
        }
    };

    // --- Mouse Drag to Pan ---
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const el = containerWrapperRef.current;
        if (!el) return;
        isDraggingRef.current = true;
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            scrollLeft: el.scrollLeft,
            scrollTop: el.scrollTop,
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

    // --- Wheel Zoom (Ctrl + Wheel or Wheel) ---
    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.12 : 0.88;
            setZoomMultiplier(prev => Math.max(0.4, Math.min(3.5, Number((prev * factor).toFixed(2)))));
        }
    };

    // --- Touch Gestures (Pinch to Zoom, Double Tap, Pan) ---
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            touchStartDistRef.current = dist;
            touchStartMultiplierRef.current = zoomMultiplier;
        } else if (e.touches.length === 1) {
            const now = Date.now();
            if (now - lastTapRef.current < 300) {
                if (zoomMultiplier > 1.2) {
                    handleResetZoom();
                } else {
                    setZoomMultiplier(1.6);
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
            const targetMultiplier = Math.min(3.5, Math.max(0.4, Number((touchStartMultiplierRef.current * ratio).toFixed(2))));
            setZoomMultiplier(targetMultiplier);
        }
    };

    const handleTouchEnd = () => {
        touchStartDistRef.current = null;
    };

    const targetWidthMm = isLandscape ? 297 : 210;
    const targetHeightMm = isLandscape ? 210 : 297;
    // Base pixel dimensions at 96 DPI: ~3.779527559 px/mm
    const baseWidthPx = isLandscape ? 1123 : 794;
    const baseHeightPx = isLandscape ? 794 : 1123;

    return (
        <div className="relative w-full h-full flex flex-col items-center overflow-hidden">
            {/* Floating Quick Zoom Toolbar */}
            <div className="absolute top-2.5 z-30 flex items-center gap-1 bg-gray-900/90 dark:bg-black/90 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/20 shadow-xl select-none no-print">
                <button 
                    onClick={handleZoomOut} 
                    className="p-1 text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer active:scale-95"
                    title="کوچک‌نمایی (-)"
                >
                    <ZoomOut size={15}/>
                </button>
                
                <button 
                    onClick={handleToggle100}
                    className="text-[11px] font-mono font-bold text-white px-2 py-0.5 hover:bg-white/10 rounded-md transition-colors min-w-[46px] text-center cursor-pointer"
                    title="کلیک برای زوم ۱۰۰٪ / تناسب"
                >
                    {Math.round(effectiveScale * 100)}%
                </button>
                
                <button 
                    onClick={handleZoomIn} 
                    className="p-1 text-gray-300 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer active:scale-95"
                    title="بزرگ‌نمایی (+)"
                >
                    <ZoomIn size={15}/>
                </button>

                <div className="h-3.5 w-px bg-white/20 mx-0.5" />

                <button 
                    onClick={handleResetZoom} 
                    className="px-2 py-0.5 text-[11px] font-bold text-emerald-300 hover:bg-white/10 rounded-md transition-colors flex items-center gap-1 cursor-pointer active:scale-95"
                    title="بازنشانی به تناسب صفحه"
                >
                    <RotateCcw size={12}/>
                    <span>تناسب</span>
                </button>
            </div>

            {/* Scrollable / Draggable Container */}
            <div 
                ref={containerWrapperRef}
                dir="ltr"
                className="w-full h-full overflow-auto cursor-grab active:cursor-grabbing select-none"
                style={{ 
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-x pan-y pinch-zoom'
                }}
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
                    className="min-w-full min-h-full flex p-3 md:p-6"
                    style={{ width: 'max-content', height: 'max-content' }}
                >
                    <div style={{
                        width: `${baseWidthPx * effectiveScale}px`,
                        height: `${baseHeightPx * effectiveScale}px`,
                        position: 'relative',
                        flexShrink: 0,
                        margin: 'auto',
                        transition: isDraggingRef.current ? 'none' : 'width 0.08s ease-out, height 0.08s ease-out'
                    }}>
                        <div 
                            dir="rtl"
                            style={{
                                width: `${targetWidthMm}mm`,
                                height: `${targetHeightMm}mm`,
                                transform: `scale(${effectiveScale})`,
                                transformOrigin: 'top left',
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                boxShadow: '0 10px 35px rgba(0,0,0,0.35)'
                            }}
                            className="bg-white rounded"
                        >
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SecurityModule: React.FC<Props> = ({ currentUser, financialYear }) => {
    const [activeTab, setActiveTab] = useState<'logs' | 'delays' | 'overtimes' | 'incidents' | 'cartable' | 'archive' | 'in_progress' | 'driver_payments'>('logs');
    const [subTab, setSubTab] = useState<'current' | 'archived'>('current');
    const [deletingItemKey, setDeletingItemKey] = useState<string | null>(null);
    const currentShamsi = getCurrentShamsiDate();
    
    // --- DRIVER PAYMENTS STATES ---
    const [driverPayments, setDriverPayments] = useState<DriverPayment[]>([]);
    const [driverPaymentForm, setDriverPaymentForm] = useState<Partial<DriverPayment>>({});
    const [driverPaymentEditingId, setDriverPaymentEditingId] = useState<string | null>(null);
    const [showDriverPaymentForm, setShowDriverPaymentForm] = useState(false);
    const [viewingPaymentModal, setViewingPaymentModal] = useState<DriverPayment | null>(null);
    const [driverPaymentStatusFilter, setDriverPaymentStatusFilter] = useState<'all' | 'cartable' | 'archived'>('all');
    const [isUploadingPaymentFile, setIsUploadingPaymentFile] = useState(false);
    const [driverPaymentSearchQuery, setDriverPaymentSearchQuery] = useState('');
    const [sharingPaymentId, setSharingPaymentId] = useState<string | null>(null);
    const [approvingPaymentId, setApprovingPaymentId] = useState<string | null>(null);
    const [showDriverPaymentSettingsModal, setShowDriverPaymentSettingsModal] = useState(false);
    const [chatGroupsList, setChatGroupsList] = useState<ChatGroup[]>([]);
    const [savingSecuritySettings, setSavingSecuritySettings] = useState(false);
    const [securitySettingsDraft, setSecuritySettingsDraft] = useState<Partial<SystemSettings>>({});
    const [selectedDate, setSelectedDate] = useState({ year: financialYear ? parseInt(financialYear) : currentShamsi.year, month: currentShamsi.month, day: currentShamsi.day });

    const [overtimes, setOvertimes] = useState<PersonnelOvertime[]>([]);
    const [overtimeForm, setOvertimeForm] = useState<Partial<PersonnelOvertime>>({ registrant: 'مقصود محمدی' });
    const [driverSuggestions, setDriverSuggestions] = useState<SavedDriver[]>([]);
    const [showDriverSuggestions, setShowDriverSuggestions] = useState(false);
    const [approvalManagementNote, setApprovalManagementNote] = useState('');
    const [loginTime] = useState<string>(() => {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    });

    // --- WEBCAM & AI ALPR STATES ---
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => {
        return localStorage.getItem('defaultCameraDeviceId') || '';
    });
    const [isReadingPlate, setIsReadingPlate] = useState(false);
    const [isReadingPlateLocal, setIsReadingPlateLocal] = useState(false);
    const [isSavingPhoto, setIsSavingPhoto] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [capturedImagePreview, setCapturedImagePreview] = useState<string | null>(null);
    const [viewAttachmentUrl, setViewAttachmentUrl] = useState<string | null>(null);
    const [cameraType, setCameraType] = useState<"usb" | "network">(() => (localStorage.getItem('cameraType') as "usb" | "network") || 'usb');
    const [cameraNetworkUrl, setCameraNetworkUrl] = useState<string>(() => localStorage.getItem('cameraNetworkUrl') || '');
    const [cameraNetworkType, setCameraNetworkType] = useState<"mjpeg" | "snapshot">(() => (localStorage.getItem('cameraNetworkType') as "mjpeg" | "snapshot") || 'mjpeg');
    const [cameraSnapshotInterval, setCameraSnapshotInterval] = useState<number>(() => parseInt(localStorage.getItem('cameraSnapshotInterval') || '1000', 10));
    const [cameraNetworkUsername, setCameraNetworkUsername] = useState<string>(() => localStorage.getItem('cameraNetworkUsername') || '');
    const [cameraNetworkPassword, setCameraNetworkPassword] = useState<string>(() => localStorage.getItem('cameraNetworkPassword') || '');
    const [liveSnapshotBase64, setLiveSnapshotBase64] = useState<string | null>(null);
    const [isLiveFetching, setIsLiveFetching] = useState(false);
    const [snapshotTime, setSnapshotTime] = useState<number>(Date.now());
    const [showQuickCameraSettings, setShowQuickCameraSettings] = useState(false);

    useEffect(() => {
        let active = true;
        let timer: any = null;

        const fetchLiveSnapshot = async () => {
            if (!isCameraActive || cameraType !== 'network') return;
            if (isLiveFetching) return;
            setIsLiveFetching(true);
            try {
                const response = await fetch('/api/security/proxy-snapshot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        url: cameraNetworkUrl,
                        username: cameraNetworkUsername,
                        password: cameraNetworkPassword
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && active) {
                        setLiveSnapshotBase64(data.imageBase64);
                    }
                }
            } catch (err) {
                console.error("Live snapshot proxy error in SecurityModule:", err);
            } finally {
                setIsLiveFetching(false);
            }
        };

        if (isCameraActive && cameraType === 'network') {
            fetchLiveSnapshot();
            timer = setInterval(() => {
                fetchLiveSnapshot();
                setSnapshotTime(Date.now());
            }, cameraSnapshotInterval || 1000);
        } else {
            setLiveSnapshotBase64(null);
        }

        return () => {
            active = false;
            if (timer) clearInterval(timer);
        };
    }, [isCameraActive, cameraType, cameraNetworkUrl, cameraSnapshotInterval, cameraNetworkUsername, cameraNetworkPassword]);

    const playBeep = () => {
        try {
            const shouldBeep = localStorage.getItem('cameraBeepOnSuccess') !== 'false';
            if (!shouldBeep) return;
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.15); // 150ms beep
        } catch (e) {
            console.error("Failed to play beep:", e);
        }
    };

    const handleFormKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter') {
            // Check if active element is a textarea or a button
            if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement) {
                return; // Let textarea handle normal enters, let buttons be click-activated via Enter
            }
            e.preventDefault();
            const container = e.currentTarget;
            // Select all input, select, textarea elements
            const focusables = Array.from(
                container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
                    'input, select, textarea'
                )
            ).filter(el => {
                // Ignore disabled, readOnly, or hidden fields (offsetParent === null means invisible)
                const isReadOnly = 'readOnly' in el ? (el as any).readOnly : false;
                return !el.disabled && !isReadOnly && el.tabIndex !== -1 && (el as HTMLElement).offsetParent !== null;
            });
            
            const index = focusables.indexOf(e.target as any);
            if (index > -1 && index < focusables.length - 1) {
                const nextField = focusables[index + 1];
                nextField.focus();
                if (nextField instanceof HTMLInputElement) {
                    nextField.select(); // Highlight text for fast typing
                }
            } else if (index === focusables.length - 1) {
                // If it is the last field, focus the submit button
                const submitBtn = document.getElementById('security-submit-btn') || Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
                    b => b.textContent?.includes('ثبت') || b.textContent?.includes('بروزرسانی')
                );
                if (submitBtn) {
                    submitBtn.focus();
                }
            }
        }
    };

    const startCamera = async () => {
        try {
            setCapturedImagePreview(null);

            // Fetch settings on demand to ensure we have the latest
            const latestType = (localStorage.getItem('cameraType') as "usb" | "network") || 'usb';
            const latestUrl = localStorage.getItem('cameraNetworkUrl') || '';
            setCameraType(latestType);
            setCameraNetworkUrl(latestUrl);

            if (latestType === 'network') {
                if (!latestUrl || !latestUrl.startsWith('http')) {
                    alert("لطفاً آدرس صحیح جریان دوربین تحت شبکه را در بخش تنظیمات یا منوی سریع وارد کنید.");
                    return;
                }
                setIsCameraActive(true);
                return;
            }

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            setCameraDevices(videoDevices);
            
            let deviceId = selectedDeviceId;
            if (videoDevices.length > 0 && !deviceId) {
                // Default to last device (usually back or USB camera)
                deviceId = videoDevices[videoDevices.length - 1].deviceId;
                setSelectedDeviceId(deviceId);
            }

            const resolution = localStorage.getItem('cameraResolution') || '720p';
            let idealWidth = 1280;
            let idealHeight = 720;
            if (resolution === '1080p') {
                idealWidth = 1920;
                idealHeight = 1080;
            } else if (resolution === '480p') {
                idealWidth = 854;
                idealHeight = 480;
            }

            const constraints = {
                video: deviceId 
                    ? { deviceId: { exact: deviceId }, width: { ideal: idealWidth }, height: { ideal: idealHeight } } 
                    : { width: { ideal: idealWidth }, height: { ideal: idealHeight } }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setIsCameraActive(true);
        } catch (err) {
            console.error("Camera access failed:", err);
            alert("امکان دسترسی به دوربین وجود ندارد. لطفا دسترسی مرورگر به دوربین را تایید کرده و کابل اتصال دوربین را بررسی کنید.");
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsCameraActive(false);
    };

    const captureImage = async (): Promise<string> => {
        if (cameraType === 'network') {
            if (!cameraNetworkUrl) {
                throw new Error("آدرس دوربین تحت شبکه مشخص نشده است. لطفاً آن را در بخش تنظیمات وارد کنید.");
            }
            // Fetch via our proxy to handle CORS
            const response = await fetch('/api/security/proxy-snapshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    url: cameraNetworkUrl,
                    username: cameraNetworkUsername,
                    password: cameraNetworkPassword
                })
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'خطا در ارتباط با دوربین شبکه (خطای پروکسی)');
            }
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'خطا در دریافت تصویر از دوربین شبکه');
            }
            return data.imageBase64;
        } else {
            if (!videoRef.current) {
                throw new Error("سخت‌افزار دوربین در دسترس نیست یا فعال نشده است.");
            }
            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("امکان ایجاد کانتکست بوم برای عکس‌برداری وجود ندارد.");
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.85);
        }
    };

    const handleCaptureAndRecognize = async () => {
        setIsReadingPlate(true);
        try {
            const base64Image = await captureImage();
            setCapturedImagePreview(base64Image);
            
            // Turn off camera stream to release hardware resources
            stopCamera();

            const response = await fetch('/api/security/ocr-plate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ imageBase64: base64Image })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'خطا در پردازش هوشمند پلاک');
            }

            const data = await response.json();
            if (data.success) {
                playBeep();
                const matchedDriver = data.plateNumber ? findDriverByPlate(data.plateNumber) : undefined;
                setLogForm(prev => ({
                    ...prev,
                    plateNumber: data.plateNumber || prev.plateNumber || '',
                    driverName: data.driverName || matchedDriver?.driverName || prev.driverName || '',
                    driverPhone: matchedDriver?.driverPhone || prev.driverPhone || '',
                    attachment: data.attachment
                }));
            }
        } catch (err: any) {
            console.error("ALPR Error:", err);
            alert("خطا در سیستم پلاک‌خوان هوشمند: " + err.message);
        } finally {
            setIsReadingPlate(false);
        }
    };

    const handleCaptureAndRecognizeLocal = async () => {
        setIsReadingPlateLocal(true);
        try {
            const base64Image = await captureImage();
            setCapturedImagePreview(base64Image);
            
            // Turn off camera stream to release hardware resources
            stopCamera();

            const response = await fetch('/api/security/ocr-plate-local', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ imageBase64: base64Image })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'خطا در پردازش محلی پلاک');
            }

            const data = await response.json();
            if (data.success) {
                playBeep();
                const matchedDriver = data.plateNumber ? findDriverByPlate(data.plateNumber) : undefined;
                setLogForm(prev => ({
                    ...prev,
                    plateNumber: data.plateNumber || prev.plateNumber || '',
                    driverName: prev.driverName || matchedDriver?.driverName || '',
                    driverPhone: prev.driverPhone || matchedDriver?.driverPhone || '',
                    attachment: data.attachment
                }));
            }
        } catch (err: any) {
            console.error("Local ALPR Error:", err);
            alert("خطا در پلاک‌خوان محلی: " + err.message);
        } finally {
            setIsReadingPlateLocal(false);
        }
    };

    const handleCaptureOnly = async () => {
        setIsSavingPhoto(true);
        try {
            const base64Image = await captureImage();
            setCapturedImagePreview(base64Image);
            
            // Turn off camera stream to release hardware resources
            stopCamera();

            const response = await fetch('/api/security/save-only-photo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ imageBase64: base64Image })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'خطا در ذخیره سازی تصویر');
            }

            const data = await response.json();
            if (data.success) {
                setLogForm(prev => ({
                    ...prev,
                    attachment: data.attachment
                }));
            }
        } catch (err: any) {
            console.error("Capture Photo Error:", err);
            alert("خطا در ذخیره سازی تصویر دوربین: " + err.message);
        } finally {
            setIsSavingPhoto(false);
        }
    };

    useEffect(() => {
        if (isCameraActive) {
            stopCamera();
            startCamera();
        }
    }, [selectedDeviceId]);

    useEffect(() => {
        const autoStart = localStorage.getItem('cameraAutoStart') === 'true';
        if (autoStart) {
            const timer = setTimeout(() => {
                startCamera();
            }, 600);
            return () => clearTimeout(timer);
        }
        return () => {
            stopCamera();
        };
    }, []);

    useEffect(() => {
        if (financialYear) {
            setSelectedDate(prev => ({ ...prev, year: parseInt(financialYear) }));
        }
    }, [financialYear]);
    const [logs, setLogs] = useState<SecurityLog[]>([]);
    const [delays, setDelays] = useState<PersonnelDelay[]>([]);
    const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [showShiftModal, setShowShiftModal] = useState(false);
    const [printTarget, setPrintTarget] = useState<any>(null);
    const [viewCartableItem, setViewCartableItem] = useState<any>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null); 
    const [logForm, setLogForm] = useState<Partial<SecurityLog>>({});
    const [delayForm, setDelayForm] = useState<Partial<PersonnelDelay>>({ registrant: 'مقصود محمدی' });
    const [incidentForm, setPartialIncidentForm] = useState<Partial<SecurityIncident>>({ registrant: 'مقصود محمدی' });
    const [metaForm, setMetaForm] = useState<DailySecurityMeta>({});
    const permissions = settings ? getRolePermissions(currentUser.role, settings, currentUser) : null;

    useEffect(() => { loadData(); }, [financialYear]);

    useEffect(() => {
        if (showModal || showPrintModal || showShiftModal || viewCartableItem) {
            window.scrollTo({ top: 0, behavior: 'instant' });
            const mainScroll = document.getElementById('main-scroll-container');
            if (mainScroll) {
                mainScroll.scrollTo({ top: 0, behavior: 'instant' });
            }

            const handleBack = () => {
                if (showModal) setShowModal(false);
                if (showPrintModal) setShowPrintModal(false);
                if (showShiftModal) setShowShiftModal(false);
                if (viewCartableItem) setViewCartableItem(null);
            };
            window.dispatchEvent(new CustomEvent('REGISTER_BACK_ACTION', { detail: handleBack }));
        } else {
            window.dispatchEvent(new CustomEvent('UNREGISTER_BACK_ACTION'));
        }
        return () => { window.dispatchEvent(new CustomEvent('UNREGISTER_BACK_ACTION')); };
    }, [showModal, showPrintModal, showShiftModal, viewCartableItem]);
    
    // Reset subTab when changing main tabs or date
    useEffect(() => {
        setSubTab('current');
    }, [activeTab, selectedDate]);

    const loadData = async () => {
        try {
            const [l, d, o, i, s, dp] = await Promise.all([
                getSecurityLogs(), 
                getPersonnelDelays(), 
                getPersonnelOvertimes(),
                getSecurityIncidents(), 
                getSettings(),
                getDriverPayments()
            ]);
            
            let safeL = Array.isArray(l) ? l : [];
            let safeD = Array.isArray(d) ? d : [];
            let safeO = Array.isArray(o) ? o : [];
            let safeI = Array.isArray(i) ? i : [];
            let safeDP = Array.isArray(dp) ? dp : [];
            
            if (financialYear && financialYear !== 'all') {
                safeL = safeL.filter(x => isInFinancialYear(x.date, financialYear));
                safeD = safeD.filter(x => isInFinancialYear(x.date, financialYear));
                safeO = safeO.filter(x => isInFinancialYear(x.date, financialYear));
                safeI = safeI.filter(x => isInFinancialYear(x.date || new Date(x.createdAt).toISOString().split('T')[0], financialYear));
                safeDP = safeDP.filter(x => isInFinancialYear(x.date, financialYear));
            }
            
            setLogs(safeL);
            syncDriversFromRecords(safeL);
            setDelays(safeD);
            setOvertimes(safeO);
            setIncidents(safeI);
            setDriverPayments(safeDP);
            setSettings(s);
        } catch(e) { console.error(e); }
    };

    const getIsoSelectedDate = (): string => { 
        try { 
            return getIsoFromJalali(selectedDate.year, selectedDate.month, selectedDate.day); 
        } catch { 
            return formatLocalDateToIso(new Date()); 
        } 
    };

    const getCurrentTimeStr = (): string => {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    const calculateOvertimeDuration = (start: string, end: string): string => {
        if (!start || !end) return '';
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = end.split(':').map(Number);
        if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return '';
        let totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (totalMinutes < 0) totalMinutes += 24 * 60; // crossover midnight
        const hrs = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        if (hrs > 0 && mins > 0) return `${hrs} ساعت و ${mins} دقیقه`;
        if (hrs > 0) return `${hrs} ساعت`;
        return `${mins} دقیقه`;
    };

    const handleAddGoodsItem = () => {
        const currentItems = Array.isArray(logForm.goodsItems) ? [...logForm.goodsItems] : [];
        const updated = [...currentItems, { name: '', quantity: '', unit: 'عدد' }];
        setLogForm({ ...logForm, goodsItems: updated });
    };

    const handleUpdateGoodsItem = (index: number, field: keyof SecurityGoodsItem, val: string) => {
        const currentItems = Array.isArray(logForm.goodsItems) ? [...logForm.goodsItems] : [];
        if (!currentItems[index]) return;
        currentItems[index] = { ...currentItems[index], [field]: val };
        const summaryName = currentItems.map(i => i.name).filter(Boolean).join('، ');
        const summaryQty = currentItems.map(i => `${i.quantity || ''} ${i.unit || ''}`.trim()).filter(Boolean).join(' + ');
        setLogForm({ ...logForm, goodsItems: currentItems, goodsName: summaryName || logForm.goodsName, quantity: summaryQty || logForm.quantity });
    };

    const handleRemoveGoodsItem = (index: number) => {
        const currentItems = Array.isArray(logForm.goodsItems) ? [...logForm.goodsItems] : [];
        const updated = currentItems.filter((_, i) => i !== index);
        const summaryName = updated.map(i => i.name).filter(Boolean).join('، ');
        const summaryQty = updated.map(i => `${i.quantity || ''} ${i.unit || ''}`.trim()).filter(Boolean).join(' + ');
        setLogForm({ ...logForm, goodsItems: updated, goodsName: summaryName, quantity: summaryQty });
    };

    const [recentDrivers, setRecentDrivers] = useState<SavedDriver[]>(() => getSavedDrivers().slice(0, 6));

    useEffect(() => {
        const handleUpdate = () => setRecentDrivers(getSavedDrivers().slice(0, 6));
        window.addEventListener('driver-memory-updated', handleUpdate);
        return () => window.removeEventListener('driver-memory-updated', handleUpdate);
    }, []);

    const handleDriverNameChange = (name: string) => {
        const trimmed = name.trim();
        const exactMatch = findDriverByName(trimmed);

        setLogForm(prev => {
            const next = { ...prev, driverName: name };
            if (exactMatch) {
                if (exactMatch.driverPhone) next.driverPhone = exactMatch.driverPhone;
                if (exactMatch.plateNumber) next.plateNumber = exactMatch.plateNumber;
            }
            return next;
        });

        if (trimmed.length > 0) {
            const matches = searchSavedDrivers(name);
            setDriverSuggestions(matches);
            setShowDriverSuggestions(matches.length > 0);
        } else {
            setShowDriverSuggestions(false);
        }
    };

    const handleDriverNameBlur = () => {
        setTimeout(() => {
            setShowDriverSuggestions(false);
            if (logForm.driverName && logForm.driverName.trim().length >= 2) {
                const match = findDriverByName(logForm.driverName);
                if (match) {
                    setLogForm(prev => ({
                        ...prev,
                        driverPhone: prev.driverPhone || match.driverPhone || '',
                        plateNumber: prev.plateNumber || match.plateNumber || ''
                    }));
                }
            }
        }, 250);
    };

    const handleDriverNameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            setShowDriverSuggestions(false);
            if (driverSuggestions.length > 0) {
                handleSelectDriverMemory(driverSuggestions[0]);
            } else if (logForm.driverName) {
                const match = findDriverByName(logForm.driverName);
                if (match) {
                    handleSelectDriverMemory(match);
                }
            }
            const phoneEl = document.querySelector<HTMLInputElement>('input[placeholder="09..."]');
            phoneEl?.focus();
        }
    };

    const handlePlateChangeInLog = (plate: string) => {
        setLogForm(prev => {
            const next = { ...prev, plateNumber: plate };
            if (plate && !prev.driverName) {
                const match = findDriverByPlate(plate);
                if (match) {
                    next.driverName = match.driverName;
                    if (match.driverPhone) next.driverPhone = match.driverPhone;
                }
            }
            return next;
        });
    };

    const handleSelectDriverMemory = (driver: SavedDriver) => {
        setLogForm(prev => ({
            ...prev,
            driverName: driver.driverName,
            driverPhone: driver.driverPhone || prev.driverPhone,
            plateNumber: driver.plateNumber || prev.plateNumber
        }));
        setShowDriverSuggestions(false);
    };

    useEffect(() => { const isoDate = getIsoSelectedDate(); if (settings?.dailySecurityMeta && settings.dailySecurityMeta[isoDate]) { setMetaForm(settings.dailySecurityMeta[isoDate]); } else { setMetaForm({ dailyDescription: '', morningGuard: { name: '', entry: '', exit: '' }, eveningGuard: { name: '', entry: '', exit: '' }, nightGuard: { name: '', entry: '', exit: '' } }); } }, [selectedDate, settings]);

    const handleJumpToEdit = (e: React.MouseEvent, type: 'log' | 'delay' | 'overtime' | 'incident', item: any) => {
        e.stopPropagation();
        const dateParts = getShamsiDateFromIso(item.date);
        setSelectedDate(dateParts);
        setActiveTab(type === 'log' ? 'logs' : type === 'delay' ? 'delays' : type === 'overtime' ? 'overtimes' : 'incidents');
        handleEditItem(item, type);
    };

    const formatTime = (timeStr: string) => { if(!timeStr) return ''; const clean = timeStr.replace(/[^0-9]/g, ''); if(clean.length >= 4) return `${clean.slice(0,2)}:${clean.slice(2,4)}`; return clean; };
    const handleTimeChange = (field: string, val: string, setter: any, form: any) => { setter({ ...form, [field]: val }); };
    const handleTimeBlur = (field: string, val: string, setter: any, form: any) => { setter({ ...form, [field]: formatTime(val) }); };
    
    const setMyName = (field: string, setter: any, form: any) => { setter({ ...form, [field]: currentUser.fullName }); };

    const allDailyLogs = logs.filter(l => l.date.startsWith(getIsoSelectedDate()));
    const dailyLogsActive = allDailyLogs.filter(l => l.status !== SecurityStatus.ARCHIVED);
    const dailyLogsArchived = allDailyLogs.filter(l => l.status === SecurityStatus.ARCHIVED);
    const displayLogs = subTab === 'current' ? dailyLogsActive : dailyLogsArchived;

    const allDailyDelays = delays.filter(d => d.date.startsWith(getIsoSelectedDate()));
    const dailyDelaysActive = allDailyDelays.filter(d => d.status !== SecurityStatus.ARCHIVED);
    const dailyDelaysArchived = allDailyDelays.filter(d => d.status === SecurityStatus.ARCHIVED);
    const displayDelays = subTab === 'current' ? dailyDelaysActive : dailyDelaysArchived;

    const allDailyOvertimes = overtimes.filter(o => o.date.startsWith(getIsoSelectedDate()));
    const dailyOvertimesActive = allDailyOvertimes.filter(o => o.status !== SecurityStatus.ARCHIVED);
    const dailyOvertimesArchived = allDailyOvertimes.filter(o => o.status === SecurityStatus.ARCHIVED);
    const displayOvertimes = subTab === 'current' ? dailyOvertimesActive : dailyOvertimesArchived;

    const allDailyIncidents = incidents.filter(i => i.date.startsWith(getIsoSelectedDate()));

    const canEdit = (status: SecurityStatus) => {
        if (currentUser.role === UserRole.ADMIN) return true;
        if (status === SecurityStatus.ARCHIVED || status === SecurityStatus.PENDING_CEO) return false;
        return true; 
    };

    const canDelete = () => {
        return currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.SECURITY_HEAD;
    };

    // Helper to see if we need to reset approvals when editing
    const resetDailyApprovalIfNeeded = (date: string) => {
        if (!settings) return;
        const meta = settings.dailySecurityMeta?.[date];
        if (meta && (meta.isFactoryDailyApproved || meta.isCeoDailyApproved)) {
            const updatedMeta = { ...meta, isFactoryDailyApproved: false, isCeoDailyApproved: false };
            const newSettings = { ...settings, dailySecurityMeta: { ...settings.dailySecurityMeta, [date]: updatedMeta } };
            saveSettings(newSettings);
            setSettings(newSettings);
            setMetaForm(updatedMeta);
        }
    };

    const getCartableItems = () => {
        let items: any[] = [];
        
        // Group items by date for multi-record batch approval
        const logsByDatePendingSup: Record<string, SecurityLog[]> = {};
        const delaysByDatePendingSup: Record<string, PersonnelDelay[]> = {};
        const overtimesByDatePendingSup: Record<string, PersonnelOvertime[]> = {};

        const logsByDatePendingFactory: Record<string, SecurityLog[]> = {};
        const delaysByDatePendingFactory: Record<string, PersonnelDelay[]> = {};
        const overtimesByDatePendingFactory: Record<string, PersonnelOvertime[]> = {};

        const logsByDatePendingCeo: Record<string, SecurityLog[]> = {};
        const delaysByDatePendingCeo: Record<string, PersonnelDelay[]> = {};
        const overtimesByDatePendingCeo: Record<string, PersonnelOvertime[]> = {};

        logs.forEach(l => {
            if (l.status === SecurityStatus.PENDING_SUPERVISOR) {
                if (!logsByDatePendingSup[l.date]) logsByDatePendingSup[l.date] = [];
                logsByDatePendingSup[l.date].push(l);
            } else if (l.status === SecurityStatus.PENDING_FACTORY) {
                if (!logsByDatePendingFactory[l.date]) logsByDatePendingFactory[l.date] = [];
                logsByDatePendingFactory[l.date].push(l);
            } else if (l.status === SecurityStatus.PENDING_CEO) {
                if (!logsByDatePendingCeo[l.date]) logsByDatePendingCeo[l.date] = [];
                logsByDatePendingCeo[l.date].push(l);
            }
        });

        delays.forEach(d => {
            if (d.status === SecurityStatus.PENDING_SUPERVISOR) {
                if (!delaysByDatePendingSup[d.date]) delaysByDatePendingSup[d.date] = [];
                delaysByDatePendingSup[d.date].push(d);
            } else if (d.status === SecurityStatus.PENDING_FACTORY) {
                if (!delaysByDatePendingFactory[d.date]) delaysByDatePendingFactory[d.date] = [];
                delaysByDatePendingFactory[d.date].push(d);
            } else if (d.status === SecurityStatus.PENDING_CEO) {
                if (!delaysByDatePendingCeo[d.date]) delaysByDatePendingCeo[d.date] = [];
                delaysByDatePendingCeo[d.date].push(d);
            }
        });

        overtimes.forEach(o => {
            if (o.status === SecurityStatus.PENDING_SUPERVISOR) {
                if (!overtimesByDatePendingSup[o.date]) overtimesByDatePendingSup[o.date] = [];
                overtimesByDatePendingSup[o.date].push(o);
            } else if (o.status === SecurityStatus.PENDING_FACTORY) {
                if (!overtimesByDatePendingFactory[o.date]) overtimesByDatePendingFactory[o.date] = [];
                overtimesByDatePendingFactory[o.date].push(o);
            } else if (o.status === SecurityStatus.PENDING_CEO) {
                if (!overtimesByDatePendingCeo[o.date]) overtimesByDatePendingCeo[o.date] = [];
                overtimesByDatePendingCeo[o.date].push(o);
            }
        });

        // 1. SUPERVISOR CARTABLE (PENDING_SUPERVISOR)
        if (currentUser.role === UserRole.SECURITY_HEAD || currentUser.role === UserRole.ADMIN) {
            Object.keys(logsByDatePendingSup).forEach(date => {
                items.push({ type: 'daily_approval', category: 'log', date, count: logsByDatePendingSup[date].length, status: SecurityStatus.PENDING_SUPERVISOR, title: 'تایید سرپرست: گزارش روزانه نگهبانی' });
            });
            Object.keys(delaysByDatePendingSup).forEach(date => {
                items.push({ type: 'daily_approval', category: 'delay', date, count: delaysByDatePendingSup[date].length, status: SecurityStatus.PENDING_SUPERVISOR, title: 'تایید سرپرست: تاخیر پرسنل' });
            });
            Object.keys(overtimesByDatePendingSup).forEach(date => {
                items.push({ type: 'daily_approval', category: 'overtime', date, count: overtimesByDatePendingSup[date].length, status: SecurityStatus.PENDING_SUPERVISOR, title: 'تایید سرپرست: اضافه کار پرسنل' });
            });
            incidents.filter(i => i.status === SecurityStatus.PENDING_SUPERVISOR).forEach(inc => {
                items.push({ type: 'incident', ...inc, status: SecurityStatus.PENDING_SUPERVISOR, title: 'تایید سرپرست: واقعه / حادثه' });
            });
        }

        // 2. FACTORY MANAGER CARTABLE (PENDING_FACTORY)
        if (currentUser.role === UserRole.FACTORY_MANAGER || currentUser.role === UserRole.ADMIN) {
            Object.keys(logsByDatePendingFactory).forEach(date => {
                items.push({ type: 'daily_approval', category: 'log', date, count: logsByDatePendingFactory[date].length, status: SecurityStatus.PENDING_FACTORY, title: 'تایید مدیریت کارخانه: گزارش نگهبانی' });
            });
            Object.keys(delaysByDatePendingFactory).forEach(date => {
                items.push({ type: 'daily_approval', category: 'delay', date, count: delaysByDatePendingFactory[date].length, status: SecurityStatus.PENDING_FACTORY, title: 'دستور و تایید مدیر: تاخیر پرسنل' });
            });
            Object.keys(overtimesByDatePendingFactory).forEach(date => {
                items.push({ type: 'daily_approval', category: 'overtime', date, count: overtimesByDatePendingFactory[date].length, status: SecurityStatus.PENDING_FACTORY, title: 'دستور و تایید مدیر: اضافه کار پرسنل' });
            });
            incidents.filter(i => i.status === SecurityStatus.PENDING_FACTORY).forEach(inc => {
                items.push({ type: 'incident', ...inc, status: SecurityStatus.PENDING_FACTORY, title: 'تایید مدیریت کارخانه: واقعه / حادثه' });
            });
        }

        // 3. CEO CARTABLE (PENDING_CEO)
        if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.ADMIN) {
            Object.keys(logsByDatePendingCeo).forEach(date => {
                items.push({ type: 'daily_approval', category: 'log', date, count: logsByDatePendingCeo[date].length, status: SecurityStatus.PENDING_CEO, title: 'تایید نهایی مدیرعامل: گزارش نگهبانی' });
            });
            Object.keys(delaysByDatePendingCeo).forEach(date => {
                items.push({ type: 'daily_approval', category: 'delay', date, count: delaysByDatePendingCeo[date].length, status: SecurityStatus.PENDING_CEO, title: 'تایید نهایی مدیرعامل: تاخیر پرسنل' });
            });
            Object.keys(overtimesByDatePendingCeo).forEach(date => {
                items.push({ type: 'daily_approval', category: 'overtime', date, count: overtimesByDatePendingCeo[date].length, status: SecurityStatus.PENDING_CEO, title: 'تایید نهایی مدیرعامل: اضافه کار پرسنل' });
            });
            incidents.filter(i => i.status === SecurityStatus.PENDING_CEO).forEach(inc => {
                items.push({ type: 'incident', ...inc, status: SecurityStatus.PENDING_CEO, title: 'تایید نهایی مدیرعامل: واقعه / حادثه' });
            });
        }

        return items;
    };

    const getInProgressItems = () => {
        const allPendingLogs = logs.filter(l => l.status !== SecurityStatus.ARCHIVED && l.status !== SecurityStatus.REJECTED);
        const allPendingDelays = delays.filter(d => d.status !== SecurityStatus.ARCHIVED && d.status !== SecurityStatus.REJECTED);
        const allPendingOvertimes = overtimes.filter(o => o.status !== SecurityStatus.ARCHIVED && o.status !== SecurityStatus.REJECTED);
        const allPendingIncidents = incidents.filter(i => i.status !== SecurityStatus.ARCHIVED && i.status !== SecurityStatus.REJECTED);
        
        const grouped: any[] = [];
        const logsByDate = allPendingLogs.reduce((acc, l) => { acc[l.date] = (acc[l.date] || 0) + 1; return acc; }, {} as Record<string,number>);
        Object.entries(logsByDate).forEach(([date, count]) => grouped.push({ type: 'log_summary', date, count, status: 'در جریان' }));

        const delaysByDate = allPendingDelays.reduce((acc, d) => { acc[d.date] = (acc[d.date] || 0) + 1; return acc; }, {} as Record<string,number>);
        Object.entries(delaysByDate).forEach(([date, count]) => grouped.push({ type: 'delay_summary', date, count, status: 'در جریان' }));

        const overtimesByDate = allPendingOvertimes.reduce((acc, o) => { acc[o.date] = (acc[o.date] || 0) + 1; return acc; }, {} as Record<string,number>);
        Object.entries(overtimesByDate).forEach(([date, count]) => grouped.push({ type: 'overtime_summary', date, count, status: 'در جریان' }));
        
        allPendingIncidents.forEach(i => grouped.push({ type: 'incident', ...i }));
        
        return grouped;
    };

    const getArchivedItems = () => {
        const logsByDate = logs.filter(l => l.status === SecurityStatus.ARCHIVED).reduce((acc, l) => { acc[l.date] = true; return acc; }, {} as Record<string,boolean>);
        const delaysByDate = delays.filter(d => d.status === SecurityStatus.ARCHIVED).reduce((acc, d) => { acc[d.date] = true; return acc; }, {} as Record<string,boolean>);
        const overtimesByDate = overtimes.filter(o => o.status === SecurityStatus.ARCHIVED).reduce((acc, o) => { acc[o.date] = true; return acc; }, {} as Record<string,boolean>);
        
        const items: any[] = [];
        Object.keys(logsByDate).forEach(date => items.push({ type: 'daily_archive', category: 'log', date }));
        Object.keys(delaysByDate).forEach(date => items.push({ type: 'daily_archive', category: 'delay', date }));
        Object.keys(overtimesByDate).forEach(date => items.push({ type: 'daily_archive', category: 'overtime', date }));
        
        incidents.filter(i => i.status === SecurityStatus.ARCHIVED).forEach(i => items.push({ type: 'incident', ...i }));
        
        return items.sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt));
    };

    const handleSaveLog = async () => {
        if (!logForm.origin || !logForm.driverName) return;
        const isoDate = getIsoSelectedDate();
        resetDailyApprovalIfNeeded(isoDate); // Reset approval if modifying
        
        // Auto save driver info to memory for future suggestions
        try {
            saveDriverToMemory({
                driverName: logForm.driverName,
                driverPhone: logForm.driverPhone || '',
                plateNumber: logForm.plateNumber || ''
            });
        } catch (err) {
            console.error('Error saving driver memory:', err);
        }

        if (editingId) {
            await updateSecurityLog({ ...logs.find(l => l.id === editingId)!, ...logForm } as SecurityLog);
        } else {
            // CHECK FOR EXISTING OPEN ENTRY (To prevent duplicate rows on exit)
            // If we are registering an Exit (exitTime is present), look for a record with same Plate/Driver that has Entry but NO Exit.
            let existingOpenLog = null;
            if (logForm.exitTime) {
                existingOpenLog = logs.find(l => 
                    l.date === isoDate && 
                    // Match Plate (preferred) or Driver
                    (
                        (logForm.plateNumber && l.plateNumber === logForm.plateNumber) ||
                        (!logForm.plateNumber && l.driverName === logForm.driverName)
                    ) &&
                    l.entryTime && // Has Entry
                    !l.exitTime // No Exit
                );
            }

            if (existingOpenLog) {
                // Update the existing record instead of creating new
                await updateSecurityLog({
                    ...existingOpenLog,
                    exitTime: logForm.exitTime,
                    // Update other fields if provided, otherwise keep existing
                    origin: logForm.origin || existingOpenLog.origin,
                    destination: logForm.destination || existingOpenLog.destination,
                    goodsName: logForm.goodsName || existingOpenLog.goodsName,
                    quantity: logForm.quantity || existingOpenLog.quantity,
                    goodsItems: logForm.goodsItems || existingOpenLog.goodsItems,
                    receiver: logForm.receiver || existingOpenLog.receiver,
                    workDescription: logForm.workDescription || existingOpenLog.workDescription,
                    permitProvider: logForm.permitProvider || existingOpenLog.permitProvider,
                    driverName: logForm.driverName || existingOpenLog.driverName,
                    driverPhone: logForm.driverPhone || existingOpenLog.driverPhone,
                    plateNumber: logForm.plateNumber || existingOpenLog.plateNumber,
                } as SecurityLog);
            } else {
                // Create New
                await saveSecurityLog({
                    id: generateUUID(),
                    rowNumber: logs.filter(l => l.date === isoDate).length + 1,
                    date: isoDate,
                    shift: '', 
                    origin: logForm.origin || '',
                    entryTime: logForm.entryTime || '',
                    exitTime: logForm.exitTime || '',
                    driverName: logForm.driverName || '',
                    driverPhone: logForm.driverPhone || '',
                    plateNumber: logForm.plateNumber || '',
                    goodsName: logForm.goodsName || '',
                    quantity: logForm.quantity || '',
                    goodsItems: logForm.goodsItems || [],
                    destination: logForm.destination || '',
                    receiver: logForm.receiver || '',
                    workDescription: logForm.workDescription || '',
                    permitProvider: logForm.permitProvider || '',
                    registrant: logForm.registrant || currentUser.fullName,
                    status: SecurityStatus.PENDING_SUPERVISOR, // Go to Supervisor first!
                    createdAt: Date.now(),
                    attachment: logForm.attachment || ''
                });
            }
        }
        
        const shouldTriggerPayment = !!logForm.hasDriverPayment;
        const driverNameForPayment = logForm.driverName || '';
        const driverPhoneForPayment = logForm.driverPhone || '';
        const plateNumberForPayment = logForm.plateNumber || '';
        const originForPayment = logForm.origin || '';
        const destinationForPayment = logForm.destination || '';
        const goodsNameForPayment = logForm.goodsName || '';
        const quantityForPayment = logForm.quantity || '';
        const permitProviderForPayment = logForm.permitProvider || '';

        resetForms();
        loadData();

        if (shouldTriggerPayment) {
            setDriverPaymentForm({
                id: generateUUID(),
                date: isoDate,
                driverName: driverNameForPayment,
                driverPhone: driverPhoneForPayment,
                plateNumber: plateNumberForPayment,
                origin: originForPayment,
                destination: destinationForPayment,
                goodsName: goodsNameForPayment,
                quantity: quantityForPayment,
                permitProvider: permitProviderForPayment,
                registrant: currentUser.fullName,
                amount: '',
                paymentType: 'کارت به کارت',
                description: `بابت حمل کالا: ${goodsNameForPayment} از مبدا ${originForPayment} به مقصد ${destinationForPayment}`,
                attachments: []
            });
            setDriverPaymentEditingId(null);
            setShowDriverPaymentForm(true);
            setActiveTab('driver_payments');
        }
    };

    const handleSaveDelay = async () => {
        if (!delayForm.personnelName) return;
        const isoDate = getIsoSelectedDate();
        resetDailyApprovalIfNeeded(isoDate);
        if (editingId) {
            await updatePersonnelDelay({ ...delays.find(d => d.id === editingId)!, ...delayForm } as PersonnelDelay);
        } else {
            await savePersonnelDelay({
                id: generateUUID(),
                date: isoDate,
                personnelName: delayForm.personnelName || '',
                unit: delayForm.unit || '',
                arrivalTime: delayForm.arrivalTime || '',
                delayAmount: delayForm.delayAmount || '',
                repeatCount: delayForm.repeatCount || '0',
                instruction: delayForm.instruction || '',
                managementInstruction: delayForm.managementInstruction || '',
                registrant: delayForm.registrant || 'مقصود محمدی', // default as requested
                status: SecurityStatus.PENDING_SUPERVISOR,
                createdAt: Date.now()
            });
        }
        resetForms();
        loadData();
    };

    const handleSaveOvertime = async () => {
        if (!overtimeForm.personnelName) return;
        const isoDate = getIsoSelectedDate();
        if (editingId) {
            await updatePersonnelOvertime({ ...overtimes.find(o => o.id === editingId)!, ...overtimeForm } as PersonnelOvertime);
        } else {
            await savePersonnelOvertime({
                id: generateUUID(),
                date: isoDate,
                personnelName: overtimeForm.personnelName || '',
                unit: overtimeForm.unit || '',
                startTime: overtimeForm.startTime || '',
                endTime: overtimeForm.endTime || '',
                duration: overtimeForm.duration || calculateOvertimeDuration(overtimeForm.startTime || '', overtimeForm.endTime || '') || '',
                reason: overtimeForm.reason || '',
                managementInstruction: overtimeForm.managementInstruction || '',
                registrant: overtimeForm.registrant || 'مقصود محمدی', // default as requested
                status: SecurityStatus.PENDING_SUPERVISOR,
                createdAt: Date.now()
            });
        }
        resetForms();
        loadData();
    };

    const handleSaveIncident = async () => {
        if (!incidentForm.subject) return;
        const isoDate = getIsoSelectedDate();
        if (editingId) {
            await updateSecurityIncident({ ...incidents.find(i => i.id === editingId)!, ...incidentForm } as SecurityIncident);
        } else {
            await saveSecurityIncident({
                id: generateUUID(),
                reportNumber: incidentForm.reportNumber || Math.floor(Math.random()*1000).toString(),
                date: isoDate,
                subject: incidentForm.subject || '',
                description: incidentForm.description || '',
                shift: incidentForm.shift || 'صبح',
                witnesses: incidentForm.witnesses || '',
                registrant: incidentForm.registrant || 'مقصود محمدی', // default as requested
                status: SecurityStatus.PENDING_SUPERVISOR,
                createdAt: Date.now()
            });
        }
        resetForms();
        loadData();
    };

    // --- DRIVER PAYMENTS ACTION HANDLERS ---
    const uploadFileChunked = async (file: File): Promise<{ fileName: string; url: string }> => {
        const uploadId = generateUUID();
        const chunkSize = 256 * 1024; // 256KB chunks
        const totalChunks = Math.ceil(file.size / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(file.size, start + chunkSize);
            const blobChunk = file.slice(start, end);

            const chunkData = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blobChunk);
            });

            const res = await fetch('/api/upload-chunk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId, chunkIndex: i, chunkData })
            });
            if (!res.ok) {
                throw new Error(`Failed to upload chunk ${i + 1}`);
            }
        }

        const finishRes = await fetch('/api/upload-finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId, fileName: file.name, totalChunks })
        });

        if (!finishRes.ok) {
            throw new Error('Failed to finish upload');
        }

        return await finishRes.json();
    };

    const handleSharePaymentToGroup = async (dp: DriverPayment, stage?: 'supervisor' | 'factory' | 'initial') => {
        try {
            setSharingPaymentId(dp.id);
            const resolvedStage = stage || (dp.factoryApproved || dp.status === 'ARCHIVED' ? 'factory' : (dp.supervisorApproved || dp.status === 'PENDING_FACTORY' ? 'supervisor' : 'initial'));

            // 1. Notify messenger bots (Telegram, Bale, WhatsApp) configured in settings for this stage
            try {
                await notifyDriverPaymentToBots(dp, { stage: resolvedStage });
            } catch (bErr) {
                console.warn("Could not notify external bots directly:", bErr);
            }

            // 2. Share to internal chat
            let targetGroupId = resolvedStage === 'factory'
                ? (settings?.securityDriverPaymentSecondInternalGroupId || settings?.securityDriverPaymentInternalGroupId)
                : settings?.securityDriverPaymentInternalGroupId;

            if (!targetGroupId) {
                const groupsList = await getGroups();
                if (groupsList && groupsList.length > 0) {
                    if (resolvedStage === 'factory') {
                        const match = groupsList.find(g => g.name.includes('مدیر') || g.name.includes('مالی') || g.name.includes('حسابداری')) || groupsList[0];
                        if (match) targetGroupId = match.id;
                    } else {
                        const match = groupsList.find(g => g.name.includes('انتظامات') || g.name.includes('نگهبانی')) || groupsList[0];
                        if (match) targetGroupId = match.id;
                    }
                }
            }

            const formattedAmount = dp.amount ? Number(dp.amount).toLocaleString('fa-IR') + ' ریال' : 'مشخص نشده';
            let stageTitle = '🚚 فرم حواله/واریزی رانندگان - واحد انتظامات';
            if (resolvedStage === 'factory') {
                stageTitle = '✅ تایید نهایی مدیر کارخانه و بایگانی: فرم واریزی راننده';
            } else if (resolvedStage === 'supervisor') {
                stageTitle = '📋 تایید سرپرست انتظامات: فرم واریزی راننده (ارسال به انتظامات)';
            }

            const fileCaption = `📊 **${stageTitle}**\n\n` +
                                `👤 **نام راننده**: ${dp.driverName}\n` +
                                `📱 **تلفن**: ${dp.driverPhone || 'ثبت نشده'}\n` +
                                `🚗 **شماره پلاک**: ${dp.plateNumber || 'ثبت نشده'}\n` +
                                `💰 **مبلغ واریزی**: ${formattedAmount}\n` +
                                `💳 **نوع پرداخت**: ${dp.paymentType || 'کارت به کارت'}\n` +
                                (dp.cardNumber ? `💳 **شماره کارت**: \`${dp.cardNumber}\`\n` : '') +
                                (dp.shebaNumber ? `🏦 **شماره شبا**: \`${dp.shebaNumber}\`\n` : '') +
                                ((dp.bankName || dp.accountHolder) ? `🏛️ **بانک / صاحب حساب**: ${dp.bankName || ''} ${dp.accountHolder ? `(${dp.accountHolder})` : ''}\n` : '') +
                                `📦 **کالا**: ${dp.goodsName || 'ثبت نشده'}\n` +
                                `🔢 **مقدار/تعداد**: ${dp.quantity || 'ثبت نشده'}\n` +
                                `📍 **مسیر حمل**: از *${dp.origin || 'نامشخص'}* به *${dp.destination || 'نامشخص'}*\n` +
                                (dp.supervisorApproved ? `👮‍♂️ **تایید سرپرست انتظامات**: تایید شده توسط ${dp.supervisorApproverName || 'سرپرست'}\n` : '') +
                                (dp.factoryApproved ? `🏭 **تایید مدیر کارخانه**: تایید و بایگانی شده توسط ${dp.factoryApproverName || 'مدیریت'}\n` : '') +
                                `👤 **ثبت کننده**: ${dp.registrant || 'واحد نگهبانی'}\n` +
                                `📅 **تاریخ ثبت**: ${formatDate(dp.date)}\n` +
                                (dp.description ? `📝 **توضیحات**: ${dp.description}\n` : '');

            if (targetGroupId && !settings?.disableInternalChatSharing) {
                const baseMsg = {
                    id: generateUUID(),
                    sender: currentUser.fullName,
                    senderUsername: currentUser.username,
                    role: currentUser.role,
                    message: fileCaption,
                    timestamp: Date.now(),
                    groupId: targetGroupId
                };
                await sendMessage(baseMsg);

                if (dp.attachments && dp.attachments.length > 0) {
                    for (const att of dp.attachments) {
                        const attMsg = {
                            id: generateUUID(),
                            sender: currentUser.fullName,
                            senderUsername: currentUser.username,
                            role: currentUser.role,
                            message: `پیوست سند واریزی راننده (${dp.driverName}) : ${att.fileName}`,
                            timestamp: Date.now(),
                            groupId: targetGroupId,
                            attachment: {
                                fileName: att.fileName,
                                url: att.url
                            }
                        };
                        await sendMessage(attMsg);
                    }
                }
            }

            if (settings?.disableInternalChatSharing) {
                alert(`فرم واریزی راننده (${dp.driverName}) با موفقیت به پیام‌رسان‌ها (بات‌ها) ارسال شد ✅`);
            } else {
                const groupStageName = resolvedStage === 'factory' ? 'گروه دوم (مدیریت/مالی)' : 'گروه اول (انتظامات)';
                alert(`فرم واریزی راننده (${dp.driverName}) با موفقیت به ${groupStageName} و پیام‌رسان‌ها ارسال شد ✅`);
            }
        } catch (err) {
            console.error('Error sharing driver payment to group:', err);
            alert('خطا در ارسال اطلاعات به گروه‌ها.');
        } finally {
            setSharingPaymentId(null);
        }
    };

    // --- APPROVAL WORKFLOW HANDLERS ---
    const handleSupervisorApprove = async (dp: DriverPayment) => {
        try {
            setApprovingPaymentId(dp.id);
            const updated: DriverPayment = {
                ...dp,
                supervisorApproved: true,
                supervisorApprovedAt: Date.now(),
                supervisorApproverName: currentUser.fullName,
                status: 'PENDING_FACTORY'
            };
            await updateDriverPayment(updated);
            await loadData();
            if (viewingPaymentModal && viewingPaymentModal.id === dp.id) {
                setViewingPaymentModal(updated);
            }

            // Auto send to Group 1 (Security group)
            if (settings?.botDriverPaymentAutoSendEnabled !== false) {
                await handleSharePaymentToGroup(updated, 'supervisor');
            } else {
                alert('تایید سرپرست انتظامات با موفقیت ثبت شد.');
            }
        } catch (e: any) {
            console.error("Supervisor approval error:", e);
            alert('خطا در ثبت تایید سرپرست انتظامات: ' + (e?.message || ''));
        } finally {
            setApprovingPaymentId(null);
        }
    };

    const handleFactoryApprove = async (dp: DriverPayment) => {
        try {
            setApprovingPaymentId(dp.id);
            const updated: DriverPayment = {
                ...dp,
                factoryApproved: true,
                factoryApprovedAt: Date.now(),
                factoryApproverName: currentUser.fullName,
                status: 'ARCHIVED'
            };
            await updateDriverPayment(updated);
            await loadData();
            if (viewingPaymentModal && viewingPaymentModal.id === dp.id) {
                setViewingPaymentModal(updated);
            }

            // Auto send to Group 2 (Management / Finance group)
            if (settings?.botDriverPaymentAutoSendEnabled !== false) {
                await handleSharePaymentToGroup(updated, 'factory');
            } else {
                alert('تایید مدیر کارخانه ثبت و سند واریزی با موفقیت بایگانی شد.');
            }
        } catch (e: any) {
            console.error("Factory approval error:", e);
            alert('خطا در ثبت تایید مدیر کارخانه: ' + (e?.message || ''));
        } finally {
            setApprovingPaymentId(null);
        }
    };

    const handleOpenSecurityGroupSettings = async () => {
        try {
            const currentSettings = settings || await getSettings();
            setSecuritySettingsDraft({
                securityDriverPaymentInternalGroupId: currentSettings.securityDriverPaymentInternalGroupId || '',
                securityDriverPaymentInternalGroupName: currentSettings.securityDriverPaymentInternalGroupName || '',
                securityDriverPaymentSecondInternalGroupId: currentSettings.securityDriverPaymentSecondInternalGroupId || '',
                securityDriverPaymentSecondInternalGroupName: currentSettings.securityDriverPaymentSecondInternalGroupName || '',
                botDriverPaymentGroupIdTele: currentSettings.botDriverPaymentGroupIdTele || currentSettings.botDriverPaymentGroupId || '',
                botDriverPaymentGroupIdBale: currentSettings.botDriverPaymentGroupIdBale || '',
                botDriverPaymentGroupIdWhatsApp: currentSettings.botDriverPaymentGroupIdWhatsApp || '',
                botDriverPaymentSecondGroupIdTele: currentSettings.botDriverPaymentSecondGroupIdTele || '',
                botDriverPaymentSecondGroupIdBale: currentSettings.botDriverPaymentSecondGroupIdBale || '',
                botDriverPaymentSecondGroupIdWhatsApp: currentSettings.botDriverPaymentSecondGroupIdWhatsApp || '',
                botDriverPaymentAutoSendEnabled: currentSettings.botDriverPaymentAutoSendEnabled !== false,
                disableInternalChatSharing: currentSettings.disableInternalChatSharing || false
            });
            const groups = await getGroups();
            setChatGroupsList(Array.isArray(groups) ? groups : []);
            setShowDriverPaymentSettingsModal(true);
        } catch (e) {
            console.error("Failed to prepare group settings:", e);
        }
    };

    const handleSaveSecurityPaymentSettings = async () => {
        try {
            setSavingSecuritySettings(true);
            const current = settings || await getSettings();
            const next = { ...current, ...securitySettingsDraft };
            await saveSettings(next);
            setSettings(next);
            setShowDriverPaymentSettingsModal(false);
            alert('تنظیمات گروه‌های مرحله ۱ (انتظامات) و مرحله ۲ (مدیریت/مالی) با موفقیت ذخیره شد.');
        } catch (e) {
            console.error(e);
            alert('خطا در ذخیره تنظیمات');
        } finally {
            setSavingSecuritySettings(false);
        }
    };

    const handleSaveDriverPayment = async (shouldShare: boolean = false) => {
        if (!driverPaymentForm.driverName) {
            alert('نام راننده الزامی است.');
            return;
        }
        
        const isoDate = getIsoSelectedDate();
        
        let finalRecord: DriverPayment;
        if (driverPaymentEditingId) {
            const existing = driverPayments.find(dp => dp.id === driverPaymentEditingId);
            finalRecord = {
                ...existing,
                ...driverPaymentForm,
                date: driverPaymentForm.date || isoDate
            } as DriverPayment;
            await updateDriverPayment(finalRecord);
        } else {
            finalRecord = {
                id: generateUUID(),
                date: driverPaymentForm.date || isoDate,
                driverName: driverPaymentForm.driverName || '',
                driverPhone: driverPaymentForm.driverPhone || '',
                plateNumber: driverPaymentForm.plateNumber || '',
                cardNumber: driverPaymentForm.cardNumber || '',
                shebaNumber: driverPaymentForm.shebaNumber || '',
                accountNumber: driverPaymentForm.accountNumber || '',
                bankName: driverPaymentForm.bankName || '',
                accountHolder: driverPaymentForm.accountHolder || '',
                amount: driverPaymentForm.amount || '',
                paymentType: driverPaymentForm.paymentType || 'کارت به کارت',
                origin: driverPaymentForm.origin || '',
                destination: driverPaymentForm.destination || '',
                goodsName: driverPaymentForm.goodsName || '',
                quantity: driverPaymentForm.quantity || '',
                permitProvider: driverPaymentForm.permitProvider || '',
                registrant: currentUser.fullName,
                description: driverPaymentForm.description || '',
                attachments: driverPaymentForm.attachments || [],
                supervisorApproved: false,
                factoryApproved: false,
                status: 'PENDING_SUPERVISOR',
                createdAt: Date.now()
            } as DriverPayment;
            await saveDriverPayment(finalRecord);
        }
        
        setShowDriverPaymentForm(false);
        setDriverPaymentForm({});
        setDriverPaymentEditingId(null);
        loadData();
        
        if (shouldShare) {
            await handleSharePaymentToGroup(finalRecord, 'initial');
        } else {
            alert('سند واریزی با موفقیت ذخیره شد.');
        }
    };

    const handleOpenNewItemModal = () => {
        setEditingId(null);
        if (activeTab === 'logs') {
            setLogForm({
                entryTime: loginTime,
                exitTime: '',
                origin: '',
                destination: '',
                driverName: '',
                driverPhone: '',
                plateNumber: '',
                goodsName: '',
                quantity: '',
                goodsItems: [],
                receiver: '',
                workDescription: '',
                permitProvider: '',
                registrant: currentUser.fullName
            });
        } else if (activeTab === 'delays') {
            setDelayForm({
                personnelName: '',
                unit: '',
                arrivalTime: getCurrentTimeStr(),
                delayAmount: '',
                repeatCount: '0',
                instruction: '',
                registrant: 'مقصود محمدی'
            });
        } else if (activeTab === 'overtimes') {
            setOvertimeForm({
                personnelName: '',
                unit: '',
                startTime: getCurrentTimeStr(),
                endTime: '',
                duration: '',
                reason: '',
                registrant: 'مقصود محمدی'
            });
        } else if (activeTab === 'incidents') {
            setPartialIncidentForm({
                reportNumber: Math.floor(Math.random() * 1000).toString(),
                subject: '',
                description: '',
                shift: 'صبح',
                witnesses: '',
                registrant: 'مقصود محمدی'
            });
        }
        setShowModal(true);
    };

    const resetForms = () => { 
        setShowModal(false); 
        setEditingId(null); 
        setLogForm({}); 
        setDelayForm({ registrant: 'مقصود محمدی' }); 
        setOvertimeForm({ registrant: 'مقصود محمدی' });
        setPartialIncidentForm({ registrant: 'مقصود محمدی' }); 
        stopCamera();
        setCapturedImagePreview(null);
    };

    const handleEditItem = (item: any, type: 'log' | 'delay' | 'overtime' | 'incident') => {
        setEditingId(item.id);
        if (type === 'log') setLogForm(item);
        if (type === 'delay') setDelayForm(item);
        if (type === 'overtime') setOvertimeForm(item);
        if (type === 'incident') setPartialIncidentForm(item);
        setShowModal(true);
    };

    const handleApprove = (item: any) => {
        setViewCartableItem(null);

        if (item.type === 'incident') {
            let nextStatus = SecurityStatus.PENDING_FACTORY;
            let updates: any = {};
            
            if (item.status === SecurityStatus.PENDING_SUPERVISOR) {
                nextStatus = SecurityStatus.PENDING_FACTORY;
                updates.approverSupervisor = currentUser.fullName;
            } else if (item.status === SecurityStatus.PENDING_FACTORY) {
                nextStatus = SecurityStatus.PENDING_CEO;
                updates.approverFactory = currentUser.fullName;
            } else if (item.status === SecurityStatus.PENDING_CEO) {
                nextStatus = SecurityStatus.ARCHIVED;
                updates.approverCeo = currentUser.fullName;
            }

            const updatedIncident = { ...item, status: nextStatus, ...updates };
            setIncidents(prev => prev.map(i => i.id === item.id ? updatedIncident : i));
            updateSecurityIncident(updatedIncident).then(() => loadData()).catch(() => {});
        } else if (item.type === 'delay') {
            let nextStatus = SecurityStatus.PENDING_FACTORY;
            let updates: any = {};
            if (item.status === SecurityStatus.PENDING_SUPERVISOR) {
                nextStatus = SecurityStatus.PENDING_FACTORY;
                updates.approverSupervisor = currentUser.fullName;
            } else if (item.status === SecurityStatus.PENDING_FACTORY) {
                nextStatus = SecurityStatus.PENDING_CEO;
                updates.approverFactory = currentUser.fullName;
                if (approvalManagementNote) {
                    updates.managementNote = approvalManagementNote;
                }
            } else if (item.status === SecurityStatus.PENDING_CEO) {
                nextStatus = SecurityStatus.ARCHIVED;
                updates.approverCeo = currentUser.fullName;
            }
            const updatedDelay = { ...item, status: nextStatus, ...updates };
            setDelays(prev => prev.map(d => d.id === item.id ? updatedDelay : d));
            updatePersonnelDelay(updatedDelay).then(() => {
                setApprovalManagementNote('');
                loadData();
            }).catch(() => {});
        } else if (item.type === 'overtime') {
            let nextStatus = SecurityStatus.PENDING_FACTORY;
            let updates: any = {};
            if (item.status === SecurityStatus.PENDING_SUPERVISOR) {
                nextStatus = SecurityStatus.PENDING_FACTORY;
                updates.approverSupervisor = currentUser.fullName;
            } else if (item.status === SecurityStatus.PENDING_FACTORY) {
                nextStatus = SecurityStatus.PENDING_CEO;
                updates.approverFactory = currentUser.fullName;
                if (approvalManagementNote) {
                    updates.managementNote = approvalManagementNote;
                }
            } else if (item.status === SecurityStatus.PENDING_CEO) {
                nextStatus = SecurityStatus.ARCHIVED;
                updates.approverCeo = currentUser.fullName;
            }
            const updatedOvertime = { ...item, status: nextStatus, ...updates };
            setOvertimes(prev => prev.map(o => o.id === item.id ? updatedOvertime : o));
            updatePersonnelOvertime(updatedOvertime).then(() => {
                setApprovalManagementNote('');
                loadData();
            }).catch(() => {});
        } else if (item.type === 'daily_approval') {
            const targetDate = item.date;
            if (item.category === 'log') {
                let nextStatus = SecurityStatus.PENDING_FACTORY;
                let field = 'approverSupervisor';
                
                if (item.status === SecurityStatus.PENDING_SUPERVISOR) {
                    nextStatus = SecurityStatus.PENDING_FACTORY;
                    field = 'approverSupervisor';
                } else if (item.status === SecurityStatus.PENDING_FACTORY) {
                    nextStatus = SecurityStatus.PENDING_CEO;
                    field = 'approverFactory';
                } else if (item.status === SecurityStatus.PENDING_CEO) {
                    nextStatus = SecurityStatus.ARCHIVED;
                    field = 'approverCeo';
                }
                
                setLogs(prev => prev.map(l => (l.date === targetDate && l.status === item.status) ? { ...l, status: nextStatus, [field]: currentUser.fullName } : l));
                
                const logsToApprove = logs.filter(l => l.date === targetDate && l.status === item.status);
                Promise.all(logsToApprove.map(l => updateSecurityLog({ ...l, status: nextStatus, [field]: currentUser.fullName }))).then(() => {
                    if (settings) {
                        const meta = settings.dailySecurityMeta?.[targetDate] || {};
                        if (item.status === SecurityStatus.PENDING_SUPERVISOR) meta.isSupervisorDailyApproved = true;
                        if (item.status === SecurityStatus.PENDING_FACTORY) meta.isFactoryDailyApproved = true;
                        if (item.status === SecurityStatus.PENDING_CEO) meta.isCeoDailyApproved = true;
                        saveSettings({ ...settings, dailySecurityMeta: { ...settings.dailySecurityMeta, [targetDate]: meta } }).catch(() => {});
                    }
                    loadData();
                }).catch(() => {});
            } else if (item.category === 'delay') {
                let nextStatus = SecurityStatus.PENDING_FACTORY;
                let field = 'approverSupervisor';
                
                if (item.status === SecurityStatus.PENDING_SUPERVISOR) {
                    nextStatus = SecurityStatus.PENDING_FACTORY;
                    field = 'approverSupervisor';
                } else if (item.status === SecurityStatus.PENDING_FACTORY) {
                    nextStatus = SecurityStatus.PENDING_CEO;
                    field = 'approverFactory';
                } else if (item.status === SecurityStatus.PENDING_CEO) {
                    nextStatus = SecurityStatus.ARCHIVED;
                    field = 'approverCeo';
                }
                
                setDelays(prev => prev.map(d => (d.date === targetDate && d.status === item.status) ? { ...d, status: nextStatus, [field]: currentUser.fullName } : d));
                
                const delaysToApprove = delays.filter(d => d.date === targetDate && d.status === item.status);
                Promise.all(delaysToApprove.map(d => updatePersonnelDelay({ ...d, status: nextStatus, [field]: currentUser.fullName }))).then(() => loadData()).catch(() => {});
            } else if (item.category === 'overtime') {
                let nextStatus = SecurityStatus.PENDING_FACTORY;
                let field = 'approverSupervisor';
                
                if (item.status === SecurityStatus.PENDING_SUPERVISOR) {
                    nextStatus = SecurityStatus.PENDING_FACTORY;
                    field = 'approverSupervisor';
                } else if (item.status === SecurityStatus.PENDING_FACTORY) {
                    nextStatus = SecurityStatus.PENDING_CEO;
                    field = 'approverFactory';
                } else if (item.status === SecurityStatus.PENDING_CEO) {
                    nextStatus = SecurityStatus.ARCHIVED;
                    field = 'approverCeo';
                }
                
                setOvertimes(prev => prev.map(o => (o.date === targetDate && o.status === item.status) ? { ...o, status: nextStatus, [field]: currentUser.fullName } : o));
                
                const overtimesToApprove = overtimes.filter(o => o.date === targetDate && o.status === item.status);
                Promise.all(overtimesToApprove.map(o => updatePersonnelOvertime({ ...o, status: nextStatus, [field]: currentUser.fullName }))).then(() => loadData()).catch(() => {});
            }
        }
    };

    const handleReject = async (item: any) => {
        const reason = prompt("دلیل رد:");
        if (!reason) return;
        if (item.type === 'incident') {
            await updateSecurityIncident({ ...item, status: SecurityStatus.REJECTED, rejectionReason: reason });
        } else if (item.type === 'delay') {
            await updatePersonnelDelay({ ...item, status: SecurityStatus.REJECTED, rejectionReason: reason });
        } else if (item.type === 'overtime') {
            await updatePersonnelOvertime({ ...item, status: SecurityStatus.REJECTED, rejectionReason: reason });
        } else if (item.type === 'daily_approval') {
            const targetDate = item.date;
            if (item.category === 'log') {
                const logsToReject = logs.filter(l => l.date === targetDate && l.status === item.status);
                await Promise.all(logsToReject.map(l => updateSecurityLog({ ...l, status: SecurityStatus.REJECTED, rejectionReason: reason })));
            } else if (item.category === 'delay') {
                const delaysToReject = delays.filter(d => d.date === targetDate && d.status === item.status);
                await Promise.all(delaysToReject.map(d => updatePersonnelDelay({ ...d, status: SecurityStatus.REJECTED, rejectionReason: reason })));
            } else if (item.category === 'overtime') {
                const overtimesToReject = overtimes.filter(o => o.date === targetDate && o.status === item.status);
                await Promise.all(overtimesToReject.map(o => updatePersonnelOvertime({ ...o, status: SecurityStatus.REJECTED, rejectionReason: reason })));
            }
        }
        loadData();
        setViewCartableItem(null);
    };

    const handleSaveShiftMeta = async () => {
        if (!settings) return;
        const isoDate = getIsoSelectedDate();
        const updatedMeta = { ...settings.dailySecurityMeta, [isoDate]: metaForm };
        await saveSettings({ ...settings, dailySecurityMeta: updatedMeta });
        setShowShiftModal(false);
    };

    const handleDeleteItem = async (id: string, type: 'log' | 'delay' | 'overtime' | 'incident') => {
        setDeletingItemKey(id);
        if (type === 'log') await deleteSecurityLog(id);
        if (type === 'delay') await deletePersonnelDelay(id);
        if (type === 'overtime') await deletePersonnelOvertime(id);
        if (type === 'incident') await deleteSecurityIncident(id);
        loadData();
        setDeletingItemKey(null);
    };

    const handleDownloadPDF = async () => {
        setIsGeneratingPdf(true);
        const elementId = 'printable-area-view';
        // Check if landscape based on type
        const isLandscape = (printTarget && (printTarget.type === 'daily_log')) || (viewCartableItem && (viewCartableItem.category === 'log' || viewCartableItem.type === 'log'));

        await generatePdf({
            elementId: elementId,
            filename: `Security_Report.pdf`,
            format: 'A4',
            orientation: isLandscape ? 'landscape' : 'portrait',
            onComplete: () => setIsGeneratingPdf(false),
            onError: () => { alert("خطا در ایجاد PDF"); setIsGeneratingPdf(false); }
        });
    };

    const handleSendToChat = async () => {
        setIsGeneratingPdf(true);
        const elementId = 'printable-area-view';
        const titleDesc = printTarget?.type === 'daily_log' ? 'گزارش روزانه انتظامات' :
            (printTarget?.type === 'daily_delay' ? 'گزارش تاخیر پرسنل' :
            (printTarget?.type === 'incident' ? 'گزارش حوادث و وقایع' : 'گزارش کارتابل انتظامات'));
        try {
            await shareElementToChat(
                elementId,
                `Security_Report_${new Date().toISOString().slice(0, 10)}.jpg`,
                {
                    defaultMessage: `${titleDesc} - تاریخ: ${getCurrentShamsiDate()}`,
                    title: 'ارسال گزارش انتظامات به گفتگو'
                }
            );
        } catch (e) {
            console.error(e);
            alert('خطا در آماده‌سازی گزارش انتظامات جهت ارسال به گفتگو');
        } finally {
            setIsGeneratingPdf(false);
        }
    };
    
    // --- SPECIAL HANDLERS FOR DAILY SUBMIT (Guard/Supervisor) ---
    const handleSupervisorDailySubmit = async () => {
        if (!confirm('آیا تایید می‌کنید؟ گزارش روزانه جهت بررسی به مدیر کارخانه ارسال می‌شود.')) return;
        const isoDate = getIsoSelectedDate();
        
        const targetLogs = logs.filter(l => l.date === isoDate && l.status === SecurityStatus.PENDING_SUPERVISOR);
        await Promise.all(targetLogs.map(l => updateSecurityLog({ ...l, status: SecurityStatus.PENDING_FACTORY, approverSupervisor: currentUser.fullName })));
        
        const targetDelays = delays.filter(d => d.date === isoDate && d.status === SecurityStatus.PENDING_SUPERVISOR);
        await Promise.all(targetDelays.map(d => updatePersonnelDelay({ ...d, status: SecurityStatus.PENDING_FACTORY, approverSupervisor: currentUser.fullName })));

        const targetOvertimes = overtimes.filter(o => o.date === isoDate && o.status === SecurityStatus.PENDING_SUPERVISOR);
        await Promise.all(targetOvertimes.map(o => updatePersonnelOvertime({ ...o, status: SecurityStatus.PENDING_FACTORY, approverSupervisor: currentUser.fullName })));
        
        loadData();
        alert('گزارش ارسال شد.');
    };

    const handleFactoryDailySubmit = async () => {
         // Handled inside cartable view
    };
    
    const handleDeleteDailyArchive = async (date: string, category: 'log'|'delay') => {
        if(!confirm('آیا از حذف کل آرشیو این روز اطمینان دارید؟')) return;
        if(category === 'log') {
            const targets = logs.filter(l => l.date === date && l.status === SecurityStatus.ARCHIVED);
            await Promise.all(targets.map(l => deleteSecurityLog(l.id)));
        } else {
            const targets = delays.filter(d => d.date === date && d.status === SecurityStatus.ARCHIVED);
            await Promise.all(targets.map(d => deletePersonnelDelay(d.id)));
        }
        loadData();
        setActiveTab('archive'); // Refresh view
    };

    const DateFilter = () => (
        <div className="flex gap-1 items-center bg-gray-100 dark:bg-gray-800/40 text-gray-800 dark:text-gray-200 p-1 rounded-lg border border-gray-200/50 dark:border-white/10">
            <Calendar size={16} className="text-gray-500 ml-1"/>
            <select className="bg-transparent text-sm p-1 outline-none" value={selectedDate.day} onChange={e=>setSelectedDate({...selectedDate, day: +e.target.value})}>{Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}</option>)}</select>
            <span className="text-gray-400">/</span>
            <select className="bg-transparent text-sm p-1 outline-none" value={selectedDate.month} onChange={e=>setSelectedDate({...selectedDate, month: +e.target.value})}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}</option>)}</select>
            <span className="text-gray-400">/</span>
            <select className="bg-transparent text-sm p-1 outline-none" value={selectedDate.year} onChange={e=>setSelectedDate({...selectedDate, year: +e.target.value})}>{Array.from({length:5},(_,i)=>1402+i).map(y=><option key={y} value={y}>{y}</option>)}</select>
        </div>
    );
    
    // Determine landscape mode for wrapper
    const isLandscapeMode = (printTarget && (printTarget.type === 'daily_log')) || (viewCartableItem && (viewCartableItem.category === 'log' || viewCartableItem.type === 'log'));

    return (
        <div className="p-2 sm:p-4 md:p-6 bg-gray-50 dark:bg-gray-900/40 text-gray-800 dark:text-gray-200 h-[calc(100dvh-130px)] md:h-[calc(100vh-100px)] overflow-y-auto animate-fade-in relative">
            
            {/* Shift Meta Modal */}
            {showShiftModal && typeof document !== 'undefined' && createPortal(
                <div 
                    className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in touch-manipulation"
                    onClick={() => setShowShiftModal(false)}
                >
                    <div 
                        className="bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[95dvh] sm:max-h-[85dvh] overflow-hidden border border-gray-200/80 dark:border-gray-800 modal-container"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Fixed Header */}
                        <div className="flex justify-between items-center px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-900 shrink-0 z-20">
                            <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-gray-100">
                                اطلاعات شیفت ({formatDate(getIsoSelectedDate())})
                            </h3>
                            <button 
                                type="button"
                                onClick={() => setShowShiftModal(false)}
                                className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                                title="بستن"
                            >
                                <X size={20}/>
                            </button>
                        </div>
                        {/* Scrollable Body */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar min-h-0">
                            <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-gray-600 dark:text-gray-300"><div>شیفت</div><div>نگهبان</div><div>ورود / خروج</div></div>
                            <div className="grid grid-cols-3 gap-2 items-center"><span className="text-sm font-bold">صبح</span><input className="border rounded p-1 text-sm dark:bg-zinc-800 dark:border-zinc-700" placeholder="نام" value={metaForm.morningGuard?.name} onChange={e=>setMetaForm({...metaForm, morningGuard:{...metaForm.morningGuard!, name:e.target.value}})}/><div className="flex gap-1"><input className="border rounded p-1 w-full text-center dark:bg-zinc-800 dark:border-zinc-700 text-xs" placeholder="07:00" value={metaForm.morningGuard?.entry} onChange={e=>setMetaForm({...metaForm, morningGuard:{...metaForm.morningGuard!, entry:e.target.value}})}/><input className="border rounded p-1 w-full text-center dark:bg-zinc-800 dark:border-zinc-700 text-xs" placeholder="15:00" value={metaForm.morningGuard?.exit} onChange={e=>setMetaForm({...metaForm, morningGuard:{...metaForm.morningGuard!, exit:e.target.value}})}/></div></div>
                            <div className="grid grid-cols-3 gap-2 items-center"><span className="text-sm font-bold">عصر</span><input className="border rounded p-1 text-sm dark:bg-zinc-800 dark:border-zinc-700" placeholder="نام" value={metaForm.eveningGuard?.name} onChange={e=>setMetaForm({...metaForm, eveningGuard:{...metaForm.eveningGuard!, name:e.target.value}})}/><div className="flex gap-1"><input className="border rounded p-1 w-full text-center dark:bg-zinc-800 dark:border-zinc-700 text-xs" placeholder="15:00" value={metaForm.eveningGuard?.entry} onChange={e=>setMetaForm({...metaForm, eveningGuard:{...metaForm.eveningGuard!, entry:e.target.value}})}/><input className="border rounded p-1 w-full text-center dark:bg-zinc-800 dark:border-zinc-700 text-xs" placeholder="23:00" value={metaForm.eveningGuard?.exit} onChange={e=>setMetaForm({...metaForm, eveningGuard:{...metaForm.eveningGuard!, exit:e.target.value}})}/></div></div>
                            <div className="grid grid-cols-3 gap-2 items-center"><span className="text-sm font-bold">شب</span><input className="border rounded p-1 text-sm dark:bg-zinc-800 dark:border-zinc-700" placeholder="نام" value={metaForm.nightGuard?.name} onChange={e=>setMetaForm({...metaForm, nightGuard:{...metaForm.nightGuard!, name:e.target.value}})}/><div className="flex gap-1"><input className="border rounded p-1 w-full text-center dark:bg-zinc-800 dark:border-zinc-700 text-xs" placeholder="23:00" value={metaForm.nightGuard?.entry} onChange={e=>setMetaForm({...metaForm, nightGuard:{...metaForm.nightGuard!, entry:e.target.value}})}/><input className="border rounded p-1 w-full text-center dark:bg-zinc-800 dark:border-zinc-700 text-xs" placeholder="07:00" value={metaForm.nightGuard?.exit} onChange={e=>setMetaForm({...metaForm, nightGuard:{...metaForm.nightGuard!, exit:e.target.value}})}/></div></div>
                            <div><label className="text-xs font-bold block mb-1">توضیحات کلی شیفت</label><textarea className="w-full border rounded p-2 text-sm h-20 dark:bg-zinc-800 dark:border-zinc-700" value={metaForm.dailyDescription} onChange={e=>setMetaForm({...metaForm, dailyDescription:e.target.value})} /></div>
                        </div>
                        {/* Fixed Footer */}
                        <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-t border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-zinc-900/95 backdrop-blur-md flex items-center gap-2.5 shrink-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                            <button 
                                type="button"
                                onClick={() => setShowShiftModal(false)}
                                className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer"
                            >
                                انصراف
                            </button>
                            <button 
                                type="button"
                                onClick={handleSaveShiftMeta} 
                                className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <CheckCircle size={16} />
                                ذخیره اطلاعات شیفت
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Print Preview Modal */}
            {showPrintModal && printTarget && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/80 z-[99999] flex flex-col items-center justify-between p-2 md:p-4 pt-12 md:pt-4 overflow-hidden animate-fade-in touch-manipulation">
                    <div className="w-full max-w-7xl flex items-center justify-between bg-gray-900/90 text-white p-3 rounded-2xl shadow-xl mb-2 no-print shrink-0 border border-white/10 flex-wrap gap-2">
                        <span className="font-black text-sm md:text-base px-2">پیش‌نمایش گزارش انتظامات</span>
                        <div className="flex gap-2 flex-wrap">
                            <button onClick={handleSendToChat} disabled={isGeneratingPdf} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow transition-all active:scale-95 cursor-pointer" title="ارسال مستقیم گزارش انتظامات به گفتگو">
                                {isGeneratingPdf ? <Loader2 size={16} className="animate-spin"/> : <MessageSquare size={16}/>} ارسال به گفتگو
                            </button>
                            <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow transition-all active:scale-95"><Printer size={16}/> چاپ</button>
                            <button onClick={handleDownloadPDF} disabled={isGeneratingPdf} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow transition-all active:scale-95">{isGeneratingPdf ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16}/>} دانلود PDF</button>
                            <button onClick={() => setShowPrintModal(false)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-95">بستن</button>
                        </div>
                    </div>
                    
                    {/* SCALED CONTAINER WRAPPER - NO BLACK GAP ABOVE/BELOW */}
                    <div className="flex-1 w-full max-w-7xl bg-gray-300 dark:bg-gray-800 rounded-2xl shadow-inner overflow-hidden flex items-center justify-center p-2 border border-white/10">
                         <ScaledContainer isLandscape={printTarget.type === 'daily_log'}>
                            <div id="printable-area-view" className="bg-white text-black shadow-2xl rounded">
                                {printTarget.type === 'daily_log' && <PrintSecurityDailyLog date={printTarget.date} logs={printTarget.logs} meta={printTarget.meta} />}
                                {printTarget.type === 'daily_delay' && <PrintPersonnelDelay delays={printTarget.delays} meta={printTarget.meta} />}
                                {printTarget.type === 'daily_overtime' && <PrintPersonnelOvertime overtimes={printTarget.overtimes} meta={printTarget.meta} />}
                                {printTarget.type === 'incident' && <PrintIncidentReport incident={printTarget.incident} />}
                                {printTarget.type === 'driver_payment' && <PrintDriverPayment payment={printTarget.payment} />}
                            </div>
                        </ScaledContainer>
                    </div>
                </div>,
                document.body
            )}

            {/* Cartable Action Modal */}
            {viewCartableItem && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/80 z-[99999] flex flex-col items-center justify-between p-2 md:p-4 pt-12 md:pt-4 overflow-hidden animate-fade-in touch-manipulation">
                    <div className="w-full max-w-7xl flex items-center justify-between bg-gray-900/90 text-white p-3 rounded-2xl shadow-xl mb-2 no-print shrink-0 border border-white/10 flex-wrap gap-2">
                        <div className="font-black text-sm md:text-base px-2">{viewCartableItem.type === 'daily_approval' || viewCartableItem.type === 'daily_archive' ? `گزارش روزانه - ${formatDate(viewCartableItem.date)}` : 'بررسی'}</div>
                        <div className="flex gap-2 items-center flex-wrap">
                             <button onClick={handleSendToChat} disabled={isGeneratingPdf} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer" title="ارسال مستقیم گزارش به گفتگو">
                                 {isGeneratingPdf ? <Loader2 size={16} className="animate-spin"/> : <MessageSquare size={16}/>} ارسال به گفتگو
                             </button>
                             <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow flex items-center gap-1.5 transition-all active:scale-95"><Printer size={16}/> چاپ</button>
                             <button onClick={handleDownloadPDF} disabled={isGeneratingPdf} className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow flex items-center gap-1.5 transition-all active:scale-95">{isGeneratingPdf ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16}/>} دانلود PDF</button>
                             {/* Only show Approve/Reject if it's an actionable item */}
                             {viewCartableItem.type !== 'daily_archive' && (
                                 <>
                                    <button onClick={() => handleApprove(viewCartableItem)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-xs font-black shadow transition-all active:scale-95">تایید</button>
                                    <button onClick={() => handleReject(viewCartableItem)} className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-xl text-xs font-bold shadow transition-all active:scale-95">رد / اصلاح</button>
                                 </>
                             )}
                             <button onClick={() => setViewCartableItem(null)} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-xl text-xs font-black transition-all active:scale-95">بستن</button>
                        </div>
                    </div>
                    
                    {/* SCALED CONTAINER WRAPPER - NO BLACK GAP ABOVE/BELOW */}
                    <div className="flex-1 w-full max-w-7xl bg-gray-300 dark:bg-gray-800 rounded-2xl shadow-inner overflow-hidden flex items-center justify-center p-2 border border-white/10">
                        <ScaledContainer isLandscape={isLandscapeMode}>
                            <div className="bg-white text-black shadow-2xl rounded" id="printable-area-view">
                                {(viewCartableItem.type === 'daily_approval' || viewCartableItem.type === 'daily_archive') && viewCartableItem.category === 'log' && (
                                    <PrintSecurityDailyLog 
                                        date={viewCartableItem.date} 
                                        logs={logs.filter(l => l.date === viewCartableItem.date)} 
                                        meta={(settings?.dailySecurityMeta || {})[String(viewCartableItem.date)]}
                                    />
                                )}
                                {(viewCartableItem.type === 'daily_approval' || viewCartableItem.type === 'daily_archive') && viewCartableItem.category === 'delay' && (
                                    <PrintPersonnelDelay 
                                        delays={delays.filter(d => d.date === viewCartableItem.date)} 
                                        meta={(settings?.dailySecurityMeta || {})[String(viewCartableItem.date)]}
                                    />
                                )}
                                {(viewCartableItem.type === 'daily_approval' || viewCartableItem.type === 'daily_archive') && viewCartableItem.category === 'overtime' && (
                                    <PrintPersonnelOvertime 
                                        overtimes={overtimes.filter(o => o.date === viewCartableItem.date)} 
                                        meta={(settings?.dailySecurityMeta || {})[String(viewCartableItem.date)]}
                                    />
                                )}
                                {viewCartableItem.type === 'log' && (
                                    <PrintSecurityDailyLog 
                                        date={viewCartableItem.date} 
                                        logs={logs.filter(l => l.date === viewCartableItem.date)} 
                                        meta={(settings?.dailySecurityMeta || {})[String(viewCartableItem.date)]}
                                    />
                                )}
                                {viewCartableItem.type === 'delay' && (
                                    <PrintPersonnelDelay 
                                        delays={delays.filter(d => d.date === viewCartableItem.date)} 
                                        meta={(settings?.dailySecurityMeta || {})[String(viewCartableItem.date)]}
                                    />
                                )}
                                {viewCartableItem.type === 'overtime' && (
                                    <PrintPersonnelOvertime 
                                        overtimes={overtimes.filter(o => o.date === viewCartableItem.date)} 
                                        meta={(settings?.dailySecurityMeta || {})[String(viewCartableItem.date)]}
                                    />
                                )}
                                {viewCartableItem.type === 'incident' && (
                                    <PrintIncidentReport incident={viewCartableItem} />
                                )}
                            </div>
                        </ScaledContainer>
                    </div>
                </div>,
                document.body
            )}

            {/* View Image Attachment Lightbox Modal */}
            {viewAttachmentUrl && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-black/80 z-[99999] flex items-center justify-center p-4 transition-all touch-manipulation" onClick={() => setViewAttachmentUrl(null)}>
                    <div className="bg-white rounded-xl shadow-2xl p-4 max-w-2xl w-full relative" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={() => setViewAttachmentUrl(null)}
                            className="absolute -top-3 -left-3 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 shadow-lg transition-all"
                        >
                            <X size={18} />
                        </button>
                        <h4 className="font-bold text-sm text-gray-800 mb-3 text-right">تصویر ثبت شده خودرو در گیت ورودی</h4>
                        <img 
                            src={viewAttachmentUrl} 
                            alt="License Plate Snapshot" 
                            className="w-full h-auto max-h-[70vh] object-contain rounded-lg border shadow-inner"
                        />
                        <div className="mt-4 flex justify-center gap-2">
                            <a 
                                href={viewAttachmentUrl} 
                                download="car_plate.jpg" 
                                target="_blank"
                                rel="noreferrer"
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all"
                            >
                                دریافت تصویر اصلی
                            </a>
                            <button 
                                onClick={() => setViewAttachmentUrl(null)}
                                className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                            >
                                بستن پنجره
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Driver Payment Form Modal */}
            {showDriverPaymentForm && typeof document !== 'undefined' && createPortal(
                <div 
                    className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4 pt-12 sm:pt-4 animate-fade-in touch-manipulation"
                    onClick={() => {
                        setShowDriverPaymentForm(false);
                        setDriverPaymentForm({});
                        setDriverPaymentEditingId(null);
                    }}
                >
                    <div 
                        className="bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[calc(100dvh-3rem)] sm:max-h-[90dvh] overflow-hidden border border-gray-200/80 dark:border-gray-800 modal-container"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-900 shrink-0 z-20">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                                    <DollarSign size={18}/>
                                </div>
                                <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-gray-100">
                                    {driverPaymentEditingId ? 'ویرایش فرم واریزی راننده' : 'ثبت فرم واریزی جدید راننده'}
                                </h3>
                            </div>
                            <button 
                                onClick={() => {
                                    setShowDriverPaymentForm(false);
                                    setDriverPaymentForm({});
                                    setDriverPaymentEditingId(null);
                                }}
                                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                            >
                                <X size={20}/>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-right">
                            {/* Driver Core Details Section */}
                            <div className="bg-purple-50/50 dark:bg-purple-950/10 p-3.5 rounded-xl border border-purple-100 dark:border-purple-900/30 space-y-3">
                                <h4 className="text-xs font-black text-purple-700 dark:text-purple-400 mb-1">👤 اطلاعات راننده و خودرو</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold block mb-1">نام و نام خانوادگی راننده <span className="text-red-500">*</span></label>
                                        <input 
                                            type="text"
                                            className="w-full border rounded p-2 text-sm bg-white dark:bg-gray-800"
                                            placeholder="مثال: عباس کریمی"
                                            value={driverPaymentForm.driverName || ''}
                                            onChange={e => setDriverPaymentForm({ ...driverPaymentForm, driverName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">تلفن همراه راننده</label>
                                        <input 
                                            type="text"
                                            className="w-full border rounded p-2 text-sm font-mono text-center bg-white dark:bg-gray-800"
                                            placeholder="مثال: 09123456789"
                                            value={driverPaymentForm.driverPhone || ''}
                                            onChange={e => setDriverPaymentForm({ ...driverPaymentForm, driverPhone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold block mb-1">پلاک خودرو</label>
                                    <div className="flex justify-center bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <IranianPlateInput 
                                            value={driverPaymentForm.plateNumber || ''} 
                                            onChange={val => setDriverPaymentForm({ ...driverPaymentForm, plateNumber: val })} 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Cargo Details Section */}
                            <div className="bg-gray-50/80 dark:bg-gray-800/20 p-3.5 rounded-xl border border-gray-100 dark:border-gray-800/40 space-y-3">
                                <h4 className="text-xs font-black text-blue-700 dark:text-blue-400 mb-1">📦 مشخصات کالا و مسیر</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold block mb-1">نام کالا / بار</label>
                                        <input 
                                            type="text"
                                            className="w-full border rounded p-2 text-sm bg-white dark:bg-gray-800"
                                            placeholder="مثال: میلگرد 14"
                                            value={driverPaymentForm.goodsName || ''}
                                            onChange={e => setDriverPaymentForm({ ...driverPaymentForm, goodsName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">تعداد / مقدار</label>
                                        <input 
                                            type="text"
                                            className="w-full border rounded p-2 text-sm bg-white dark:bg-gray-800"
                                            placeholder="مثال: 24 تن"
                                            value={driverPaymentForm.quantity || ''}
                                            onChange={e => setDriverPaymentForm({ ...driverPaymentForm, quantity: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">مبدا بارگیری</label>
                                        <input 
                                            type="text"
                                            className="w-full border rounded p-2 text-sm bg-white dark:bg-gray-800"
                                            placeholder="مثال: انبار تهران"
                                            value={driverPaymentForm.origin || ''}
                                            onChange={e => setDriverPaymentForm({ ...driverPaymentForm, origin: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">مقصد تخلیه</label>
                                        <input 
                                            type="text"
                                            className="w-full border rounded p-2 text-sm bg-white dark:bg-gray-800"
                                            placeholder="مثال: کارخانه تبریز"
                                            value={driverPaymentForm.destination || ''}
                                            onChange={e => setDriverPaymentForm({ ...driverPaymentForm, destination: e.target.value })}
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="text-xs font-bold block mb-1">مجوز دهنده / هماهنگ‌کننده</label>
                                        <input 
                                            type="text"
                                            className="w-full border rounded p-2 text-sm bg-white dark:bg-gray-800"
                                            placeholder="مثال: جناب محمدی"
                                            value={driverPaymentForm.permitProvider || ''}
                                            onChange={e => setDriverPaymentForm({ ...driverPaymentForm, permitProvider: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Payment Section */}
                            <div className="bg-emerald-50/30 dark:bg-emerald-950/5 p-3.5 rounded-xl border border-emerald-100/60 dark:border-emerald-900/20 space-y-3">
                                <h4 className="text-xs font-black text-emerald-700 dark:text-emerald-400 mb-1">💰 اطلاعات پرداخت و حساب بانکی راننده</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold block mb-1">مبلغ واریزی (ریال)</label>
                                        <input 
                                            type="number"
                                            className="w-full border rounded p-2 text-sm font-mono text-center bg-white dark:bg-gray-800"
                                            placeholder="مثال: 55000000"
                                            value={driverPaymentForm.amount || ''}
                                            onChange={e => setDriverPaymentForm({ ...driverPaymentForm, amount: e.target.value })}
                                        />
                                        {driverPaymentForm.amount && (
                                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-bold text-left">
                                                {Number(driverPaymentForm.amount).toLocaleString('fa-IR')} ریال
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">نوع پرداخت</label>
                                        <select
                                            className="w-full border rounded p-2 text-sm bg-white dark:bg-gray-800 outline-none"
                                            value={driverPaymentForm.paymentType || 'کارت به کارت'}
                                            onChange={e => setDriverPaymentForm({ ...driverPaymentForm, paymentType: e.target.value })}
                                        >
                                            <option value="کارت به کارت">کارت به کارت</option>
                                            <option value="حواله بانکی">حواله بانکی</option>
                                            <option value="نقدی">نقدی</option>
                                            <option value="چک صیادی">چک صیادی</option>
                                            <option value="سایر">سایر</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">شماره کارت راننده (۱۶ رقم)</label>
                                        <input 
                                            type="text"
                                            maxLength={19}
                                            dir="ltr"
                                            className="w-full border rounded p-2 text-sm font-mono text-center bg-white dark:bg-gray-800 tracking-wider"
                                            placeholder="XXXX-XXXX-XXXX-XXXX"
                                            value={driverPaymentForm.cardNumber || ''}
                                            onChange={e => {
                                                const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
                                                const formatted = raw.match(/.{1,4}/g)?.join('-') || raw;
                                                setDriverPaymentForm({ ...driverPaymentForm, cardNumber: formatted });
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">شماره شبا (IR + ۲۴ رقم)</label>
                                        <div className="relative">
                                            <input 
                                                type="text"
                                                maxLength={26}
                                                dir="ltr"
                                                className="w-full border rounded p-2 text-sm font-mono text-left bg-white dark:bg-gray-800"
                                                placeholder="IR000000000000000000000000"
                                                value={driverPaymentForm.shebaNumber || ''}
                                                onChange={e => {
                                                    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                                                    if (val && !val.startsWith('IR') && /^\d/.test(val)) {
                                                        val = 'IR' + val;
                                                    }
                                                    setDriverPaymentForm({ ...driverPaymentForm, shebaNumber: val.slice(0, 26) });
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">نام بانک</label>
                                        <input 
                                            type="text"
                                            className="w-full border rounded p-2 text-sm bg-white dark:bg-gray-800"
                                            placeholder="مثال: بانک ملی، ملت، صادرات..."
                                            value={driverPaymentForm.bankName || ''}
                                            onChange={e => setDriverPaymentForm({ ...driverPaymentForm, bankName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">نام صاحب حساب</label>
                                        <input 
                                            type="text"
                                            className="w-full border rounded p-2 text-sm bg-white dark:bg-gray-800"
                                            placeholder="مثال: عباس کریمی"
                                            value={driverPaymentForm.accountHolder || ''}
                                            onChange={e => setDriverPaymentForm({ ...driverPaymentForm, accountHolder: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold block mb-1">توضیحات و بابت پرداخت</label>
                                    <textarea 
                                        className="w-full border rounded p-2 text-sm h-16 bg-white dark:bg-gray-800"
                                        placeholder="توضیحات تکمیلی پیرامون این پرداخت..."
                                        value={driverPaymentForm.description || ''}
                                        onChange={e => setDriverPaymentForm({ ...driverPaymentForm, description: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* File Uploads / Attachment Section */}
                            <div className="space-y-3">
                                <label className="text-xs font-black text-gray-700 dark:text-gray-300 block">📎 اسناد، فاکتورها و تصاویر پیوست (پیش‌نمایش آنلاین)</label>
                                <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-purple-500 rounded-xl p-4 transition-all flex flex-col items-center justify-center bg-gray-50/50 dark:bg-gray-800/10 cursor-pointer relative">
                                    <input 
                                        type="file" 
                                        multiple
                                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                        onChange={async e => {
                                            const files = e.target.files;
                                            if (!files || files.length === 0) return;
                                            setIsUploadingPaymentFile(true);
                                            try {
                                                const currentAttachments = [...(driverPaymentForm.attachments || [])];
                                                for (let i = 0; i < files.length; i++) {
                                                    const result = await uploadFileChunked(files[i]);
                                                    currentAttachments.push({
                                                        fileName: result.fileName,
                                                        url: result.url
                                                    });
                                                }
                                                setDriverPaymentForm({ ...driverPaymentForm, attachments: currentAttachments });
                                            } catch (err) {
                                                alert('خطا در بارگذاری فایل');
                                            } finally {
                                                setIsUploadingPaymentFile(false);
                                            }
                                        }}
                                    />
                                    {isUploadingPaymentFile ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="animate-spin text-purple-600" size={24}/>
                                            <span className="text-xs text-purple-600 font-bold">در حال بارگذاری فایل(ها) به سرور...</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1">
                                            <Paperclip className="text-gray-400" size={24}/>
                                            <span className="text-xs text-gray-500 font-bold">برای انتخاب فایل(ها)، کلیک کنید یا فایل را به اینجا بکشید</span>
                                            <span className="text-[10px] text-gray-400">عکس فیش واریزی، بارنامه، فاکتورها، غیره</span>
                                        </div>
                                    )}
                                </div>

                                {/* Uploaded Attachments Previews */}
                                {driverPaymentForm.attachments && driverPaymentForm.attachments.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                                        {driverPaymentForm.attachments.map((att, index) => {
                                            const isImg = /\.(jpg|jpeg|png|webp)$/i.test(att.url);
                                            return (
                                                <div key={index} className="relative group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2 flex items-center gap-2 overflow-hidden shadow-xs hover:shadow transition-all">
                                                    {isImg ? (
                                                        <img 
                                                            src={att.url} 
                                                            alt={att.fileName}
                                                            className="w-10 h-10 object-cover rounded-lg border border-gray-100 dark:border-gray-800 cursor-pointer"
                                                            onClick={() => setViewAttachmentUrl(att.url)}
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-blue-500">
                                                            <FileText size={20}/>
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0 text-right">
                                                        <div className="text-[11px] font-black text-gray-700 dark:text-gray-300 truncate" title={att.fileName}>{att.fileName}</div>
                                                        <div className="text-[9px] text-gray-400 mt-0.5">بارگذاری شده</div>
                                                    </div>
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            const filtered = (driverPaymentForm.attachments || []).filter((_, i) => i !== index);
                                                            setDriverPaymentForm({ ...driverPaymentForm, attachments: filtered });
                                                        }}
                                                        className="p-1 rounded-full bg-red-50 hover:bg-red-100 text-red-500 transition-all active:scale-90"
                                                        title="حذف پیوست"
                                                    >
                                                        <X size={12}/>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-zinc-900/50 flex flex-wrap-reverse sm:flex-nowrap justify-end gap-2 shrink-0">
                            <button 
                                onClick={() => {
                                    setShowDriverPaymentForm(false);
                                    setDriverPaymentForm({});
                                    setDriverPaymentEditingId(null);
                                }}
                                className="w-full sm:w-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl transition-all"
                            >
                                انصراف
                            </button>
                            <button 
                                onClick={() => handleSaveDriverPayment(false)}
                                className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95"
                            >
                                <Save size={15}/>
                                <span>ذخیره و ثبت حواله</span>
                            </button>
                            <button 
                                onClick={() => handleSaveDriverPayment(true)}
                                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                            >
                                <Send size={14}/>
                                <span>ثبت و ارسال به بات و گروه‌ها</span>
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Input Modal */}
            {showModal && typeof document !== 'undefined' && createPortal(
                <div 
                    className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4 pt-12 sm:pt-4 animate-fade-in touch-manipulation"
                    onClick={resetForms}
                >
                    <div 
                        className="bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[calc(100dvh-3rem)] sm:max-h-[85dvh] overflow-hidden border border-gray-200/80 dark:border-gray-800 modal-container"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Fixed Header */}
                        <div className="flex justify-between items-center px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-900 shrink-0 z-20">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                                    {activeTab === 'logs' ? <Truck size={18}/> : activeTab === 'delays' ? <Clock size={18}/> : activeTab === 'overtimes' ? <FileText size={18}/> : <AlertTriangle size={18}/>}
                                </div>
                                <h3 className="font-bold text-base sm:text-lg text-gray-900 dark:text-gray-100">
                                    {editingId 
                                        ? 'ویرایش مورد' 
                                        : activeTab === 'logs' 
                                        ? 'ثبت ورود و خروج' 
                                        : activeTab === 'delays' 
                                        ? 'ثبت تاخیر پرسنل' 
                                        : activeTab === 'overtimes' 
                                        ? 'ثبت اضافه کار پرسنل' 
                                        : 'ثبت وقایع'
                                    }
                                </h3>
                            </div>
                            <button 
                                type="button"
                                onClick={resetForms}
                                className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
                                title="بستن پنجره"
                                aria-label="بستن"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Scrollable Form Body */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 custom-scrollbar min-h-0">
                        {activeTab === 'logs' && (
                            <div className="space-y-3" onKeyDown={handleFormKeyDown}>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold block mb-1">مبدا بارگیری</label><input className="w-full border rounded p-2" value={logForm.origin} onChange={e=>setLogForm({...logForm, origin:e.target.value})}/></div>
                                    <div><label className="text-xs font-bold block mb-1">مقصد</label><input className="w-full border rounded p-2" value={logForm.destination} onChange={e=>setLogForm({...logForm, destination:e.target.value})}/></div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold block mb-1">ساعت ورود</label><input type="time" className="w-full border rounded p-2 text-center font-mono" value={logForm.entryTime || ''} onChange={e=>setLogForm({...logForm, entryTime: e.target.value})}/></div>
                                    <div><label className="text-xs font-bold block mb-1">ساعت خروج</label><input type="time" className="w-full border rounded p-2 text-center font-mono" value={logForm.exitTime || ''} onChange={e=>setLogForm({...logForm, exitTime: e.target.value})}/></div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="relative">
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-xs font-bold block">نام راننده</label>
                                            {(logForm.driverName && (logForm.plateNumber || logForm.driverPhone)) && (
                                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                                                    <Check size={11} /> متصل به پلاک
                                                </span>
                                            )}
                                        </div>
                                        <input 
                                            className="w-full border rounded p-2 text-sm" 
                                            value={logForm.driverName || ''} 
                                            onChange={e => handleDriverNameChange(e.target.value)}
                                            onBlur={handleDriverNameBlur}
                                            onKeyDown={handleDriverNameKeyDown}
                                            enterKeyHint="next"
                                            placeholder="نام راننده..."
                                            onFocus={() => {
                                                if (logForm.driverName && logForm.driverName.trim().length > 0) {
                                                    const matches = searchSavedDrivers(logForm.driverName);
                                                    setDriverSuggestions(matches);
                                                    setShowDriverSuggestions(matches.length > 0);
                                                }
                                            }}
                                        />
                                        {showDriverSuggestions && driverSuggestions.length > 0 && (
                                            <div className="absolute z-[120] left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                                                {driverSuggestions.map((ds, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        onClick={() => handleSelectDriverMemory(ds)}
                                                        className="p-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-xs flex justify-between items-center"
                                                    >
                                                        <span className="font-bold text-gray-800 dark:text-gray-200">{ds.driverName}</span>
                                                        <span className="text-[10px] text-gray-500 font-mono">{(ds.driverPhone || '') + ' - ' + (ds.plateNumber || '')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div><label className="text-xs font-bold block mb-1">شماره تماس راننده</label><input className="w-full border rounded p-2 font-mono" dir="ltr" value={logForm.driverPhone || ''} onChange={e=>setLogForm({...logForm, driverPhone:e.target.value})} placeholder="09..."/></div>
                                </div>

                                {/* --- AUTOMATIC LICENSE PLATE RECOGNITION (ALPR) COMPONENT --- */}
                                <div className="border border-dashed border-gray-300 rounded-lg p-2 bg-gray-50/50">
                                    {!isCameraActive ? (
                                        <button 
                                            type="button" 
                                            onClick={startCamera} 
                                            className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                                        >
                                            <Camera size={14} />
                                            <span>فعالسازی دوربین جلو درب (پلاک‌خوان هوشمند)</span>
                                        </button>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between bg-white p-1 rounded border">
                                                <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5 pr-1">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                    </span>
                                                    دوربین جلو درب فعال است ({cameraType === 'network' ? 'تحت شبکه' : 'USB'})
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setShowQuickCameraSettings(!showQuickCameraSettings)} 
                                                        className="text-gray-500 hover:text-gray-700 text-xs p-1 rounded hover:bg-gray-100 transition-all"
                                                        title="تنظیمات سریع دوربین"
                                                    >
                                                        <Settings size={13} className={showQuickCameraSettings ? "text-emerald-600 spin-once" : ""} />
                                                    </button>
                                                    <button 
                                                        type="button" 
                                                        onClick={stopCamera} 
                                                        className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 text-[10px] font-bold px-2 py-0.5 rounded transition-all"
                                                    >
                                                        غیرفعال کردن دوربین
                                                    </button>
                                                </div>
                                            </div>

                                            {showQuickCameraSettings && (
                                                <div className="bg-white p-3 rounded border border-gray-200 text-xs space-y-2.5 animate-fade-in shadow-sm">
                                                    <div className="font-bold text-gray-700 pb-1 border-b flex justify-between items-center">
                                                        <span>تنظیمات سریع دوربین انتظامات</span>
                                                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">بروزرسانی زنده</span>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] text-gray-500 mb-1 font-bold">نوع دوربین ورودی:</label>
                                                        <div className="flex gap-4">
                                                            <label className="flex items-center gap-1 cursor-pointer">
                                                                <input 
                                                                    type="radio" 
                                                                    name="quickCameraType" 
                                                                    value="usb" 
                                                                    checked={cameraType === 'usb'} 
                                                                    onChange={() => {
                                                                        setCameraType('usb');
                                                                        localStorage.setItem('cameraType', 'usb');
                                                                        stopCamera();
                                                                        setTimeout(() => startCamera(), 100);
                                                                    }} 
                                                                />
                                                                <span>یو‌اس‌بی یا وب‌کم (USB)</span>
                                                            </label>
                                                            <label className="flex items-center gap-1 cursor-pointer">
                                                                <input 
                                                                    type="radio" 
                                                                    name="quickCameraType" 
                                                                    value="network" 
                                                                    checked={cameraType === 'network'} 
                                                                    onChange={() => {
                                                                        setCameraType('network');
                                                                        localStorage.setItem('cameraType', 'network');
                                                                        stopCamera();
                                                                        setTimeout(() => startCamera(), 100);
                                                                    }} 
                                                                />
                                                                <span>دوربین تحت شبکه (IP Camera)</span>
                                                            </label>
                                                        </div>
                                                    </div>
                                                    {cameraType === 'network' && (
                                                        <div className="space-y-2 bg-gray-50 p-2 rounded border border-gray-100">
                                                            <div>
                                                                <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">آدرس مستقیم جریان تصویر (HTTP MJPEG/Snapshot):</label>
                                                                <input 
                                                                    type="text" 
                                                                    className="w-full text-xs p-1.5 border rounded font-mono" 
                                                                    value={cameraNetworkUrl} 
                                                                    onChange={e => {
                                                                        setCameraNetworkUrl(e.target.value);
                                                                        localStorage.setItem('cameraNetworkUrl', e.target.value);
                                                                    }}
                                                                    placeholder="http://192.168.1.50/mjpeg.cgi"
                                                                />
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">نام کاربری:</label>
                                                                    <input 
                                                                        type="text" 
                                                                        className="w-full text-xs p-1.5 border rounded font-mono" 
                                                                        value={cameraNetworkUsername} 
                                                                        onChange={e => {
                                                                            setCameraNetworkUsername(e.target.value);
                                                                            localStorage.setItem('cameraNetworkUsername', e.target.value);
                                                                        }}
                                                                        placeholder="admin"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">کلمه عبور:</label>
                                                                    <input 
                                                                        type="password" 
                                                                        className="w-full text-xs p-1.5 border rounded font-mono" 
                                                                        value={cameraNetworkPassword} 
                                                                        onChange={e => {
                                                                            setCameraNetworkPassword(e.target.value);
                                                                            localStorage.setItem('cameraNetworkPassword', e.target.value);
                                                                        }}
                                                                        placeholder="******"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">نوع جریان تصویر:</label>
                                                                    <select 
                                                                        value={cameraNetworkType} 
                                                                        onChange={e => {
                                                                            const val = e.target.value as "mjpeg" | "snapshot";
                                                                            setCameraNetworkType(val);
                                                                            localStorage.setItem('cameraNetworkType', val);
                                                                        }}
                                                                        className="w-full text-[11px] p-1 border rounded bg-white"
                                                                    >
                                                                        <option value="mjpeg">جریان زنده MJPEG</option>
                                                                        <option value="snapshot">تصاویر متوالی (Snapshot)</option>
                                                                    </select>
                                                                </div>
                                                                {cameraNetworkType === 'snapshot' && (
                                                                    <div>
                                                                        <label className="block text-[10px] text-gray-500 mb-0.5 font-bold">بازخوانی (ms):</label>
                                                                        <input 
                                                                            type="number" 
                                                                            className="w-full text-[11px] p-1 border rounded font-mono" 
                                                                            value={cameraSnapshotInterval} 
                                                                            onChange={e => {
                                                                                const val = parseInt(e.target.value, 10) || 1000;
                                                                                setCameraSnapshotInterval(val);
                                                                                localStorage.setItem('cameraSnapshotInterval', val.toString());
                                                                            }}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            
                                            {cameraType === 'usb' && cameraDevices.length > 1 && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-gray-500 whitespace-nowrap font-bold">انتخاب ورودی دوربین:</span>
                                                    <select 
                                                        value={selectedDeviceId} 
                                                        onChange={e => setSelectedDeviceId(e.target.value)}
                                                        className="w-full text-xs border rounded p-1 bg-white font-sans"
                                                    >
                                                        {cameraDevices.map((dev, i) => (
                                                            <option key={dev.deviceId} value={dev.deviceId}>
                                                                {dev.label || `دوربین شماره ${i + 1}`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            <div className="relative overflow-hidden rounded border bg-black aspect-video max-w-sm mx-auto shadow-inner">
                                                {cameraType === 'network' ? (
                                                    <img 
                                                        src={liveSnapshotBase64 || (cameraNetworkType === 'snapshot' ? `${cameraNetworkUrl}${cameraNetworkUrl.includes('?') ? '&' : '?'}t=${snapshotTime}` : cameraNetworkUrl)}
                                                        referrerPolicy="no-referrer"
                                                        className={`w-full h-full object-contain ${localStorage.getItem('cameraMirror') === 'true' ? 'transform -scale-x-100' : ''}`} 
                                                        alt="Network Camera Feed"
                                                        onError={(e) => {
                                                            console.error("Network feed loading error");
                                                        }}
                                                    />
                                                ) : (
                                                    <video 
                                                        ref={videoRef} 
                                                        autoPlay 
                                                        playsInline 
                                                        muted 
                                                        className={`w-full h-full object-cover ${localStorage.getItem('cameraMirror') === 'true' ? 'transform -scale-x-100' : ''}`} 
                                                    />
                                                )}
                                                <div className="absolute inset-x-0 bottom-0 bg-black/85 p-2 flex flex-col gap-2 justify-center items-center">
                                                    <div className="flex flex-col gap-2 w-full">
                                                        <div className="flex gap-2 w-full">
                                                            <button
                                                                type="button"
                                                                onClick={handleCaptureAndRecognizeLocal}
                                                                disabled={isReadingPlate || isReadingPlateLocal || isSavingPhoto}
                                                                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white text-[10px] font-bold py-1.5 px-2 rounded shadow-md flex items-center justify-center gap-1 transition-all"
                                                                title="شناسایی خودکار شماره پلاک با فرمت ایران بدون هوش مصنوعی"
                                                            >
                                                                {isReadingPlateLocal ? (
                                                                    <>
                                                                        <Loader2 size={10} className="animate-spin" />
                                                                        <span>در حال خواندن پلاک...</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Camera size={11} />
                                                                        <span>فقط خواندن پلاک ایران (آفلاین)</span>
                                                                    </>
                                                                )}
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={handleCaptureAndRecognize}
                                                                disabled={isReadingPlate || isReadingPlateLocal || isSavingPhoto}
                                                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-500 text-white text-[10px] font-bold py-1.5 px-2 rounded shadow-md flex items-center justify-center gap-1 transition-all"
                                                            >
                                                                {isReadingPlate ? (
                                                                    <>
                                                                        <Loader2 size={10} className="animate-spin" />
                                                                        <span>در حال استخراج (AI)...</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Camera size={11} />
                                                                        <span>خواندن پلاک + اطلاعات (AI)</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={handleCaptureOnly}
                                                            disabled={isReadingPlate || isReadingPlateLocal || isSavingPhoto}
                                                            className="w-full bg-slate-600 hover:bg-slate-700 disabled:bg-gray-500 text-white text-[10px] font-bold py-1.5 px-2 rounded shadow-md flex items-center justify-center gap-1 transition-all"
                                                        >
                                                            {isSavingPhoto ? (
                                                                <>
                                                                    <Loader2 size={10} className="animate-spin" />
                                                                    <span>در حال ذخیره...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Camera size={11} />
                                                                    <span>فقط ثبت عکس خودرو (ثبت دستی اطلاعات)</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {isReadingPlate && (
                                        <div className="border border-blue-200 bg-blue-50/80 rounded-lg p-2 text-center mt-2 animate-pulse">
                                            <div className="flex items-center justify-center gap-2 text-xs font-bold text-blue-800">
                                                <Loader2 size={14} className="animate-spin text-blue-600" />
                                                <span>تصویر پلاک خودرو توسط هوش مصنوعی جمینی در حال پردازش و استخراج خودکار است...</span>
                                            </div>
                                        </div>
                                    )}

                                    {isReadingPlateLocal && (
                                        <div className="border border-indigo-200 bg-indigo-50/80 rounded-lg p-2 text-center mt-2 animate-pulse">
                                            <div className="flex items-center justify-center gap-2 text-xs font-bold text-indigo-800">
                                                <Loader2 size={14} className="animate-spin text-indigo-600" />
                                                <span>در حال اجرای موتور محلی OCR و انطباق پلاک ایران با الگوریتم‌های الگوشناسی...</span>
                                            </div>
                                        </div>
                                    )}

                                    {isSavingPhoto && (
                                        <div className="border border-blue-200 bg-blue-50/80 rounded-lg p-2 text-center mt-2 animate-pulse">
                                            <div className="flex items-center justify-center gap-2 text-xs font-bold text-blue-800">
                                                <Loader2 size={14} className="animate-spin text-blue-600" />
                                                <span>در حال ذخیره سازی تصویر خام و ضمیمه کردن آن به رکورد ورود...</span>
                                            </div>
                                        </div>
                                    )}

                                    {logForm.attachment && (
                                        <div className="border border-green-200 bg-green-50/80 rounded-lg p-2 mt-2 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <img 
                                                    src={logForm.attachment} 
                                                    alt="Captured vehicle" 
                                                    className="w-14 h-9 object-cover rounded border shadow-sm"
                                                />
                                                <div className="text-right">
                                                    <p className="text-xs font-bold text-green-800">تصویر خودرو با موفقیت پیوست شد</p>
                                                    <p className="text-[9px] text-gray-500">تصویر به عنوان سند ورود ذخیره و ثبت گردید.</p>
                                                </div>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => setLogForm(prev => ({ ...prev, attachment: undefined }))}
                                                className="text-red-500 hover:text-red-700 text-xs font-bold bg-white border px-1.5 py-0.5 rounded shadow-sm"
                                            >
                                                حذف
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-gray-50/70 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/60 rounded-xl p-3 flex flex-col items-center justify-center shadow-xs">
                                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">شماره پلاک خودرو</label>
                                    <IranianPlateInput value={logForm.plateNumber} onChange={handlePlateChangeInLog}/>
                                </div>
                                <div>
                                    <label className="text-xs font-bold block mb-1">مجوز دهنده</label>
                                    <input className="w-full border rounded p-2" value={logForm.permitProvider} onChange={e=>setLogForm({...logForm, permitProvider:e.target.value})}/>
                                </div>
                                {/* Multi-item Goods Section (ثبت چند آیتمی کالا) */}
                                <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-gray-50/50 dark:bg-gray-800/10 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300">لیست کالاهای ورودی / خروجی (ثبت چند آیتمی)</label>
                                        <button 
                                            type="button" 
                                            onClick={handleAddGoodsItem}
                                            className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 px-2 py-1 rounded-lg font-bold flex items-center gap-1 transition-all"
                                        >
                                            <Plus size={12} />
                                            <span>افزودن آیتم جدید</span>
                                        </button>
                                    </div>

                                    {Array.isArray(logForm.goodsItems) && logForm.goodsItems.length > 0 ? (
                                        <div className="space-y-2">
                                            {logForm.goodsItems.map((item, index) => (
                                                <div key={index} className="flex gap-2 items-center">
                                                    <input 
                                                        type="text" 
                                                        placeholder="نام کالا (مثلا: سیمان)" 
                                                        className="flex-1 text-xs border rounded p-2" 
                                                        value={item.name || ''} 
                                                        onChange={e => handleUpdateGoodsItem(index, 'name', e.target.value)} 
                                                    />
                                                    <input 
                                                        type="text" 
                                                        placeholder="تعداد" 
                                                        className="w-16 text-center text-xs border rounded p-2 font-mono" 
                                                        value={item.quantity || ''} 
                                                        onChange={e => handleUpdateGoodsItem(index, 'quantity', e.target.value)} 
                                                     />
                                                    <input 
                                                        type="text" 
                                                        placeholder="واحد" 
                                                        className="w-14 text-center text-xs border rounded p-2" 
                                                        value={item.unit || ''} 
                                                        onChange={e => handleUpdateGoodsItem(index, 'unit', e.target.value)} 
                                                    />
                                                    <button 
                                                        type="button" 
                                                        onClick={() => handleRemoveGoodsItem(index)}
                                                        className="text-red-500 hover:text-red-700 p-1 bg-red-50 dark:bg-red-950/30 rounded border border-red-200/50"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-[11px] text-gray-500 text-center py-2">
                                            هیچ کالای چندآیتمی ثبت نشده است. می‌توانید با دکمه بالا چند کالا را همزمان اضافه کنید.
                                        </div>
                                    )}

                                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                                        <div className="col-span-2">
                                            <label className="text-[10px] text-gray-500 font-bold block mb-1">خلاصه نام کالاها (پرکننده خودکار)</label>
                                            <input className="w-full border rounded p-2 text-xs bg-gray-50 dark:bg-gray-800 font-bold" value={logForm.goodsName || ''} onChange={e=>setLogForm({...logForm, goodsName:e.target.value})}/>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-gray-500 font-bold block mb-1">جمع تعداد</label>
                                            <input className="w-full border rounded p-2 text-xs text-center bg-gray-50 dark:bg-gray-800 font-bold" value={logForm.quantity || ''} onChange={e=>setLogForm({...logForm, quantity:e.target.value})}/>
                                        </div>
                                    </div>
                                </div>
                                <div><label className="text-xs font-bold block mb-1">تحویل گیرنده</label><input className="w-full border rounded p-2" value={logForm.receiver} onChange={e=>setLogForm({...logForm, receiver:e.target.value})}/></div>
                                <div><label className="text-xs font-bold block mb-1">توضیحات</label><textarea className="w-full border rounded p-2 h-16" value={logForm.workDescription} onChange={e=>setLogForm({...logForm, workDescription:e.target.value})}/></div>
                                <div className="flex items-center gap-2.5 mt-3 p-3.5 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40 rounded-xl transition-all hover:bg-purple-100/50">
                                    <input 
                                        type="checkbox" 
                                        id="hasDriverPayment" 
                                        className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
                                        checked={!!logForm.hasDriverPayment} 
                                        onChange={e => setLogForm({ ...logForm, hasDriverPayment: e.target.checked })}
                                    />
                                    <label htmlFor="hasDriverPayment" className="text-xs font-black text-purple-800 dark:text-purple-300 cursor-pointer select-none">
                                        این ورودی دارای پرداخت/واریزی راننده است (ثبت خودکار فرم واریزی پس از ثبت نگهبانی)
                                    </label>
                                </div>
                            </div>
                        )}
                        {activeTab === 'delays' && (
                            <div className="space-y-3" onKeyDown={handleFormKeyDown}>
                                <div><label className="text-xs font-bold block mb-1">نام و نام خانوادگی</label><input className="w-full border rounded p-2" value={delayForm.personnelName} onChange={e=>setDelayForm({...delayForm, personnelName:e.target.value})}/></div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold block mb-1">واحد / بخش</label><input className="w-full border rounded p-2" value={delayForm.unit} onChange={e=>setDelayForm({...delayForm, unit:e.target.value})}/></div>
                                    <div><label className="text-xs font-bold block mb-1">ساعت ورود</label><input type="time" className="w-full border rounded p-2 text-center font-mono" value={delayForm.arrivalTime || ''} onChange={e=>setDelayForm({...delayForm, arrivalTime: e.target.value})}/></div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold block mb-1">مدت تاخیر (دقیقه)</label><input className="w-full border rounded p-2 text-center" value={delayForm.delayAmount} onChange={e=>setDelayForm({...delayForm, delayAmount:e.target.value})}/></div>
                                    <div><label className="text-xs font-bold block mb-1">تعداد تکرار در ماه</label><input className="w-full border rounded p-2 text-center" value={delayForm.repeatCount} onChange={e=>setDelayForm({...delayForm, repeatCount:e.target.value})}/></div>
                                </div>
                                <div><label className="text-xs font-bold block mb-1">اقدام انجام شده / توضیحات</label><input className="w-full border rounded p-2" value={delayForm.instruction} onChange={e=>setDelayForm({...delayForm, instruction:e.target.value})}/></div>
                                <div>
                                    <label className="text-xs font-bold block mb-1">دستور مدیریت</label>
                                    <textarea 
                                        className="w-full border rounded p-2 text-sm" 
                                        rows={2} 
                                        placeholder="دستور صادر شده توسط مدیریت..." 
                                        value={delayForm.managementInstruction || ''} 
                                        onChange={e => setDelayForm({ ...delayForm, managementInstruction: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}
                        {activeTab === 'overtimes' && (
                            <div className="space-y-3" onKeyDown={handleFormKeyDown}>
                                <div>
                                    <label className="text-xs font-bold block mb-1">نام و نام خانوادگی پرسنل</label>
                                    <input 
                                        className="w-full border rounded p-2 text-sm" 
                                        value={overtimeForm.personnelName || ''} 
                                        onChange={e => setOvertimeForm({ ...overtimeForm, personnelName: e.target.value })} 
                                        placeholder="مثال: علی علوی"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold block mb-1">واحد / بخش</label>
                                        <input 
                                            className="w-full border rounded p-2 text-sm" 
                                            value={overtimeForm.unit || ''} 
                                            onChange={e => setOvertimeForm({ ...overtimeForm, unit: e.target.value })} 
                                            placeholder="مثال: تولید"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">ساعت شروع اضافه کار</label>
                                        <input 
                                            type="time"
                                            className="w-full border rounded p-2 text-center font-mono text-sm" 
                                            value={overtimeForm.startTime || ''} 
                                            onChange={e => {
                                                const val = e.target.value;
                                                const dur = calculateOvertimeDuration(val, overtimeForm.endTime || '');
                                                setOvertimeForm(prev => ({ ...prev, startTime: val, duration: dur }));
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold block mb-1">ساعت پایان اضافه کار</label>
                                        <input 
                                            type="time"
                                            className="w-full border rounded p-2 text-center font-mono text-sm" 
                                            value={overtimeForm.endTime || ''} 
                                            onChange={e => {
                                                const val = e.target.value;
                                                const dur = calculateOvertimeDuration(overtimeForm.startTime || '', val);
                                                setOvertimeForm(prev => ({ ...prev, endTime: val, duration: dur }));
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold block mb-1">مدت اضافه کار (خودکار)</label>
                                        <input 
                                            className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-800 text-center font-bold text-blue-600 dark:text-blue-400 text-sm" 
                                            value={overtimeForm.duration || ''} 
                                            disabled 
                                            placeholder="محاسبه خودکار..."
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold block mb-1">علت اضافه کار</label>
                                    <input 
                                        className="w-full border rounded p-2 text-sm" 
                                        value={overtimeForm.reason || ''} 
                                        onChange={e => setOvertimeForm({ ...overtimeForm, reason: e.target.value })} 
                                        placeholder="مثال: تکمیل سفارش فوری"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold block mb-1">نام ثبت کننده (نگهبان)</label>
                                    <input 
                                        className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-800 text-sm" 
                                        value={overtimeForm.registrant || 'مقصود محمدی'} 
                                        onChange={e => setOvertimeForm({ ...overtimeForm, registrant: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold block mb-1">دستور مدیریت</label>
                                    <textarea 
                                        className="w-full border rounded p-2 text-sm" 
                                        rows={2} 
                                        placeholder="دستور صادر شده توسط مدیریت..." 
                                        value={overtimeForm.managementInstruction || ''} 
                                        onChange={e => setOvertimeForm({ ...overtimeForm, managementInstruction: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}
                        {activeTab === 'incidents' && (
                            <div className="space-y-3" onKeyDown={handleFormKeyDown}>
                                <div className="flex gap-3">
                                    <div className="flex-1"><label className="text-xs font-bold block mb-1">موضوع گزارش</label><input className="w-full border rounded p-2" value={incidentForm.subject} onChange={e=>setPartialIncidentForm({...incidentForm, subject:e.target.value})}/></div>
                                    <div className="w-32"><label className="text-xs font-bold block mb-1">شماره گزارش</label><input className="w-full border rounded p-2 text-center" value={incidentForm.reportNumber} onChange={e=>setPartialIncidentForm({...incidentForm, reportNumber:e.target.value})}/></div>
                                </div>
                                <div><label className="text-xs font-bold block mb-1">شرح دقیق موضوع</label><textarea className="w-full border rounded p-2 h-32" value={incidentForm.description} onChange={e=>setPartialIncidentForm({...incidentForm, description:e.target.value})}/></div>
                                <div><label className="text-xs font-bold block mb-1">شهود</label><input className="w-full border rounded p-2" value={incidentForm.witnesses} onChange={e=>setPartialIncidentForm({...incidentForm, witnesses:e.target.value})}/></div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><label className="text-xs font-bold block mb-1">شیفت</label><select className="w-full border rounded p-2" value={incidentForm.shift} onChange={e=>setPartialIncidentForm({...incidentForm, shift:e.target.value})}><option>صبح</option><option>عصر</option><option>شب</option></select></div>
                                </div>
                            </div>
                        )}
                        </div>

                        {/* Fixed Footer */}
                        <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-t border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-zinc-900/95 backdrop-blur-md flex items-center gap-2.5 shrink-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                            <button 
                                type="button"
                                onClick={resetForms}
                                className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer"
                            >
                                انصراف
                            </button>
                            <button 
                                id="security-submit-btn"
                                type="button"
                                onClick={() => {
                                    if (activeTab === 'logs') handleSaveLog();
                                    else if (activeTab === 'delays') handleSaveDelay();
                                    else if (activeTab === 'overtimes') handleSaveOvertime();
                                    else if (activeTab === 'incidents') handleSaveIncident();
                                }}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white py-2.5 sm:py-3 rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <CheckCircle size={16} />
                                <span>
                                    {editingId 
                                        ? 'بروزرسانی اطلاعات' 
                                        : activeTab === 'logs' 
                                        ? 'ثبت گزارش' 
                                        : activeTab === 'delays' 
                                        ? 'ثبت تاخیر' 
                                        : activeTab === 'overtimes' 
                                        ? 'ثبت فرم اضافه کار' 
                                        : 'ثبت واقعه'
                                    }
                                </span>
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <div className="flex flex-col gap-3 mb-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <h1 className="text-xl md:text-2xl font-black text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <Shield className="text-blue-600"/> واحد انتظامات
                    </h1>
                    {(activeTab === 'logs' || activeTab === 'delays') && (
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                            <button onClick={() => setShowShiftModal(true)} className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs hover:bg-gray-50">
                                <FileText size={16}/> شیفت
                            </button>
                            <DateFilter />
                        </div>
                    )}
                </div>

                {/* Mobile & Desktop Horizontal Scrollable Tab Bar */}
                <div className="w-full overflow-x-auto no-scrollbar py-1">
                    <div className="inline-flex items-center gap-1.5 bg-gray-200/80 dark:bg-gray-800/80 p-1.5 rounded-2xl border border-gray-300/50 dark:border-white/10 text-xs font-bold whitespace-nowrap min-w-max">
                        <button onClick={() => setActiveTab('logs')} className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === 'logs' ? 'bg-blue-600 text-white font-black shadow-md' : 'text-gray-700 dark:text-gray-300 hover:bg-black/5'}`}>
                            <Shield size={14} className="inline ml-1" /> نگهبانی
                        </button>
                        <button onClick={() => setActiveTab('delays')} className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === 'delays' ? 'bg-blue-600 text-white font-black shadow-md' : 'text-gray-700 dark:text-gray-300 hover:bg-black/5'}`}>
                            <Clock size={14} className="inline ml-1" /> تاخیر پرسنل
                        </button>
                        <button onClick={() => setActiveTab('overtimes')} className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === 'overtimes' ? 'bg-blue-600 text-white font-black shadow-md' : 'text-gray-700 dark:text-gray-300 hover:bg-black/5'}`}>
                            <Clock size={14} className="inline ml-1" /> اضافه کار پرسنل
                        </button>
                        <button onClick={() => setActiveTab('incidents')} className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === 'incidents' ? 'bg-blue-600 text-white font-black shadow-md' : 'text-gray-700 dark:text-gray-300 hover:bg-black/5'}`}>
                            <AlertTriangle size={14} className="inline ml-1" /> وقایع
                        </button>
                        <div className="h-5 w-px bg-gray-300 dark:bg-gray-700 mx-0.5"></div>
                        <button onClick={() => setActiveTab('cartable')} className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === 'cartable' ? 'bg-orange-600 text-white font-black shadow-md' : 'text-gray-700 dark:text-gray-300 hover:bg-black/5'}`}>
                            کارتابل
                        </button>
                        <button onClick={() => setActiveTab('in_progress')} className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === 'in_progress' ? 'bg-indigo-600 text-white font-black shadow-md' : 'text-gray-700 dark:text-gray-300 hover:bg-black/5'}`}>
                            در جریان
                        </button>
                        <button onClick={() => setActiveTab('archive')} className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === 'archive' ? 'bg-green-600 text-white font-black shadow-md' : 'text-gray-700 dark:text-gray-300 hover:bg-black/5'}`}>
                            بایگانی
                        </button>
                        <button onClick={() => setActiveTab('driver_payments')} className={`px-3.5 py-2 rounded-xl transition-all ${activeTab === 'driver_payments' ? 'bg-purple-600 text-white font-black shadow-md' : 'text-gray-700 dark:text-gray-300 hover:bg-black/5'}`}>
                            <DollarSign size={14} className="inline ml-1" /> واریزی رانندگان
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 min-h-[500px] overflow-hidden">
                {activeTab === 'logs' && (
                    <>
                        <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-gray-800 flex flex-wrap sm:flex-nowrap justify-between items-center bg-gray-50/80 dark:bg-gray-800/40 gap-2">
                            <h2 className="font-black text-sm sm:text-base text-gray-800 dark:text-gray-200">دفتر ثبت ورود و خروج کالا و خودرو</h2>
                            <div className="flex gap-2 w-full sm:w-auto justify-end">
                                <button onClick={() => { setPrintTarget({ type: 'daily_log', date: getIsoSelectedDate(), logs: displayLogs, meta: metaForm }); setShowPrintModal(true); }} className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-gray-100 shadow-xs">
                                    <Printer size={14}/> چاپ روزانه
                                </button>
                                {canEdit(SecurityStatus.PENDING_FACTORY) && (
                                    <button onClick={handleOpenNewItemModal} className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-blue-700 shadow-xs">
                                        <Plus size={14}/> ثبت مورد جدید
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-xs text-center border-collapse">
                                <thead className="bg-gray-100/70 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 font-black">
                                    <tr>
                                        <th className="p-3 border-b">ردیف</th>
                                        <th className="p-3 border-b">مبدا</th>
                                        <th className="p-3 border-b">ورود</th>
                                        <th className="p-3 border-b">خروج</th>
                                        <th className="p-3 border-b">راننده / پلاک</th>
                                        <th className="p-3 border-b">کالا / تعداد</th>
                                        <th className="p-3 border-b">مقصد / گیرنده</th>
                                        <th className="p-3 border-b">وضعیت</th>
                                        <th className="p-3 border-b">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {displayLogs.length === 0 ? (
                                        <tr><td colSpan={9} className="p-8 text-gray-400">موردی برای این تاریخ ثبت نشده است.</td></tr>
                                    ) : displayLogs.map((log, idx) => (
                                        <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                            <td className="p-3 font-bold">{log.rowNumber || idx + 1}</td>
                                            <td className="p-3 font-bold">{log.origin}</td>
                                            <td className="p-3 font-mono dir-ltr">{log.entryTime}</td>
                                            <td className="p-3 font-mono dir-ltr">{log.exitTime}</td>
                                            <td className="p-3">
                                                <div className="font-bold">{log.driverName}</div>
                                                <div className="text-[10px] text-gray-500 font-mono">{log.driverPhone}</div>
                                                <div className="mt-1 flex justify-center">
                                                    <IranianPlateDisplay value={log.plateNumber} size="xs" />
                                                </div>
                                                {log.attachment && (
                                                    <button 
                                                        onClick={() => setViewAttachmentUrl(log.attachment)} 
                                                        className="block mt-1 mx-auto text-[10px] text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-150 px-1.5 py-0.5 rounded flex items-center justify-center gap-1 transition-all"
                                                        title="مشاهده تصویر ثبت شده پلاک خودرو"
                                                    >
                                                        <Camera size={10} />
                                                        <span>مشاهده عکس خودرو</span>
                                                    </button>
                                                )}
                                            </td>
                                            <td className="p-3"><div>{log.goodsName}</div><div className="text-gray-500">{log.quantity}</div></td>
                                            <td className="p-3"><div>{log.destination}</div><div className="text-gray-500">{log.receiver}</div></td>
                                            <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.status === SecurityStatus.ARCHIVED ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{log.status}</span></td>
                                            <td className="p-3 flex justify-center gap-1">
                                                {canEdit(log.status) && <button onClick={(e) => handleJumpToEdit(e, 'log', log)} className="text-amber-500 hover:bg-amber-50 p-1 rounded"><Edit size={14}/></button>}
                                                {canDelete() && <button onClick={() => handleDeleteItem(log.id, 'log')} className="text-red-400 hover:bg-red-50 p-1 rounded"><Trash2 size={14}/></button>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Cards View */}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800 md:hidden">
                            {displayLogs.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-xs">موردی برای این تاریخ ثبت نشده است.</div>
                            ) : displayLogs.map((log, idx) => (
                                <div key={log.id} className="p-3.5 space-y-2.5 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-black text-[11px] flex items-center justify-center">
                                                {log.rowNumber || idx + 1}
                                            </span>
                                            <span className="font-mono text-gray-700 dark:text-gray-300 font-bold dir-ltr text-[11px]">
                                                ⏱️ {log.entryTime || '--:--'} تا {log.exitTime || '--:--'}
                                            </span>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.status === SecurityStatus.ARCHIVED ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                            {log.status}
                                        </span>
                                    </div>

                                    <div className="bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 text-xs space-y-1">
                                        <div className="flex items-center justify-between font-bold text-gray-800 dark:text-gray-200">
                                            <span>از: {log.origin || '—'}</span>
                                            <span className="text-gray-400">➔</span>
                                            <span>به: {log.destination || '—'}</span>
                                        </div>
                                        {(log.receiver || log.driverName) && (
                                            <div className="text-[11px] text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-200/50 dark:border-gray-700/50 flex justify-between">
                                                <span>👤 راننده: {log.driverName || '—'} {log.driverPhone ? `(${log.driverPhone})` : ''}</span>
                                                {log.receiver && <span>تحویل: {log.receiver}</span>}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between gap-2 text-xs">
                                        <div className="flex-1">
                                            <span className="text-gray-500 dark:text-gray-400 text-[11px]">کالا: </span>
                                            <span className="font-bold text-gray-800 dark:text-gray-200">{log.goodsName || '—'}</span>
                                            {log.quantity && <span className="text-gray-500 text-[11px] mr-1">({log.quantity})</span>}
                                        </div>
                                        {log.plateNumber && (
                                            <div className="shrink-0">
                                                <IranianPlateDisplay value={log.plateNumber} size="xs" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between pt-1 text-xs">
                                        <div>
                                            {log.attachment && (
                                                <button 
                                                    onClick={() => setViewAttachmentUrl(log.attachment)} 
                                                    className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded-lg flex items-center gap-1 font-bold"
                                                >
                                                    <Camera size={12} /> عکس خودرو
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            {canEdit(log.status) && (
                                                <button onClick={(e) => handleJumpToEdit(e, 'log', log)} className="text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-1.5 rounded-lg flex items-center gap-1 text-[11px] font-bold">
                                                    <Edit size={14}/> ویرایش
                                                </button>
                                            )}
                                            {canDelete() && (
                                                <button onClick={() => handleDeleteItem(log.id, 'log')} className="text-red-500 bg-red-50 dark:bg-red-950/30 p-1.5 rounded-lg flex items-center gap-1 text-[11px] font-bold">
                                                    <Trash2 size={14}/> حذف
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {activeTab === 'delays' && (
                     <>
                        <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-gray-800 flex flex-wrap sm:flex-nowrap justify-between items-center bg-gray-50/80 dark:bg-gray-800/40 gap-2">
                            <h2 className="font-black text-sm sm:text-base text-gray-800 dark:text-gray-200">لیست تاخیر پرسنل</h2>
                            <div className="flex gap-2 w-full sm:w-auto justify-end">
                                <button onClick={() => { setPrintTarget({ type: 'daily_delay', date: getIsoSelectedDate(), delays: displayDelays, meta: metaForm }); setShowPrintModal(true); }} className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-gray-100 shadow-xs">
                                    <Printer size={14}/> چاپ فرم تاخیر
                                </button>
                                {canEdit(SecurityStatus.PENDING_FACTORY) && (
                                    <button onClick={handleOpenNewItemModal} className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-blue-700 shadow-xs">
                                        <Plus size={14}/> ثبت تاخیر
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-xs text-center">
                                <thead className="bg-gray-100/70 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 font-black">
                                    <tr>
                                        <th className="p-3 border-b">نام پرسنل</th>
                                        <th className="p-3 border-b">واحد</th>
                                        <th className="p-3 border-b">ساعت ورود</th>
                                        <th className="p-3 border-b">میزان تاخیر</th>
                                        <th className="p-3 border-b">تکرار</th>
                                        <th className="p-3 border-b">توضیحات</th>
                                        <th className="p-3 border-b">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {displayDelays.length === 0 ? (
                                        <tr><td colSpan={7} className="p-8 text-gray-400">موردی ثبت نشده است.</td></tr>
                                    ) : displayDelays.map(d => (
                                        <tr key={d.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                            <td className="p-3 font-bold">{d.personnelName}</td>
                                            <td className="p-3">{d.unit}</td>
                                            <td className="p-3 font-mono">{d.arrivalTime}</td>
                                            <td className="p-3 font-bold text-red-600">{d.delayAmount}</td>
                                            <td className="p-3">{d.repeatCount}</td>
                                            <td className="p-3 text-gray-500">{d.instruction}</td>
                                            <td className="p-3 flex justify-center gap-1">
                                                {canEdit(d.status) && <button onClick={(e) => handleJumpToEdit(e, 'delay', d)} className="text-amber-500 hover:bg-amber-50 p-1 rounded"><Edit size={14}/></button>}
                                                {canDelete() && <button onClick={() => handleDeleteItem(d.id, 'delay')} className="text-red-400 hover:bg-red-50 p-1 rounded"><Trash2 size={14}/></button>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Cards View */}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800 md:hidden">
                            {displayDelays.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-xs">موردی ثبت نشده است.</div>
                            ) : displayDelays.map(d => (
                                <div key={d.id} className="p-3.5 space-y-2 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="font-black text-sm text-gray-900 dark:text-gray-100">{d.personnelName}</span>
                                            <span className="text-xs text-gray-500 mr-2">({d.unit || 'نامشخص'})</span>
                                        </div>
                                        <span className="text-xs font-black text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
                                            تاخیر: {d.delayAmount} دقیقه
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                                        <span>ساعت ورود: <strong className="font-mono text-gray-800 dark:text-gray-200">{d.arrivalTime || '--:--'}</strong></span>
                                        <span>تکرار در ماه: <strong className="text-gray-800 dark:text-gray-200">{d.repeatCount || 1}</strong></span>
                                    </div>
                                    {d.instruction && (
                                        <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                                            توضیحات: {d.instruction}
                                        </div>
                                    )}
                                    <div className="flex justify-end gap-2 pt-1">
                                        {canEdit(d.status) && (
                                            <button onClick={(e) => handleJumpToEdit(e, 'delay', d)} className="text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-1.5 rounded-lg flex items-center gap-1 text-[11px] font-bold">
                                                <Edit size={14}/> ویرایش
                                            </button>
                                        )}
                                        {canDelete() && (
                                            <button onClick={() => handleDeleteItem(d.id, 'delay')} className="text-red-500 bg-red-50 dark:bg-red-950/30 p-1.5 rounded-lg flex items-center gap-1 text-[11px] font-bold">
                                                <Trash2 size={14}/> حذف
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                     </>
                )}

                {activeTab === 'overtimes' && (
                     <>
                        <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-gray-800 flex flex-wrap sm:flex-nowrap justify-between items-center bg-gray-50/80 dark:bg-gray-800/40 gap-2">
                            <h2 className="font-black text-sm sm:text-base text-gray-800 dark:text-gray-200">لیست اضافه کار پرسنل</h2>
                            <div className="flex gap-2 w-full sm:w-auto justify-end">
                                <button onClick={() => { setPrintTarget({ type: 'daily_overtime', date: getIsoSelectedDate(), overtimes: displayOvertimes, meta: metaForm }); setShowPrintModal(true); }} className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-gray-100 shadow-xs">
                                    <Printer size={14}/> چاپ فرم اضافه کار
                                </button>
                                {canEdit(SecurityStatus.PENDING_FACTORY) && (
                                    <button onClick={handleOpenNewItemModal} className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-blue-700 shadow-xs">
                                        <Plus size={14}/> ثبت اضافه کار
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-xs text-center">
                                <thead className="bg-gray-100/70 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 font-black">
                                    <tr>
                                        <th className="p-3 border-b">نام پرسنل</th>
                                        <th className="p-3 border-b">واحد</th>
                                        <th className="p-3 border-b">ساعت شروع</th>
                                        <th className="p-3 border-b">ساعت پایان</th>
                                        <th className="p-3 border-b">مدت اضافه کار</th>
                                        <th className="p-3 border-b">علت اضافه کار</th>
                                        <th className="p-3 border-b">وضعیت</th>
                                        <th className="p-3 border-b">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {displayOvertimes.length === 0 ? (
                                        <tr><td colSpan={8} className="p-8 text-gray-400">موردی ثبت نشده است.</td></tr>
                                    ) : displayOvertimes.map(o => (
                                        <tr key={o.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                            <td className="p-3 font-bold">{o.personnelName}</td>
                                            <td className="p-3">{o.unit}</td>
                                            <td className="p-3 font-mono">{o.startTime}</td>
                                            <td className="p-3 font-mono">{o.endTime}</td>
                                            <td className="p-3 font-bold text-blue-600">{o.duration}</td>
                                            <td className="p-3 text-gray-500">{o.reason}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${o.status === SecurityStatus.ARCHIVED ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{o.status}</span>
                                            </td>
                                            <td className="p-3 flex justify-center gap-1">
                                                {canEdit(o.status) && <button onClick={(e) => handleJumpToEdit(e, 'overtime', o)} className="text-amber-500 hover:bg-amber-50 p-1 rounded"><Edit size={14}/></button>}
                                                {canDelete() && <button onClick={() => handleDeleteItem(o.id, 'overtime')} className="text-red-400 hover:bg-red-50 p-1 rounded"><Trash2 size={14}/></button>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Cards View */}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800 md:hidden">
                            {displayOvertimes.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-xs">موردی ثبت نشده است.</div>
                            ) : displayOvertimes.map(o => (
                                <div key={o.id} className="p-3.5 space-y-2 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="font-black text-sm text-gray-900 dark:text-gray-100">{o.personnelName}</span>
                                            <span className="text-xs text-gray-500 mr-2">({o.unit || 'نامشخص'})</span>
                                        </div>
                                        <span className="text-xs font-black text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                                            مدت: {o.duration}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 font-mono">
                                        <span>شروع: <strong className="text-gray-800 dark:text-gray-200">{o.startTime || '--:--'}</strong></span>
                                        <span>پایان: <strong className="text-gray-800 dark:text-gray-200">{o.endTime || '--:--'}</strong></span>
                                    </div>
                                    {o.reason && (
                                        <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                                            علت: {o.reason}
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center pt-1">
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${o.status === SecurityStatus.ARCHIVED ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{o.status}</span>
                                        <div className="flex justify-end gap-2">
                                            {canEdit(o.status) && (
                                                <button onClick={(e) => handleJumpToEdit(e, 'overtime', o)} className="text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-1.5 rounded-lg flex items-center gap-1 text-[11px] font-bold">
                                                    <Edit size={14}/> ویرایش
                                                </button>
                                            )}
                                            {canDelete() && (
                                                <button onClick={() => handleDeleteItem(o.id, 'overtime')} className="text-red-500 bg-red-50 dark:bg-red-950/30 p-1.5 rounded-lg flex items-center gap-1 text-[11px] font-bold">
                                                    <Trash2 size={14}/> حذف
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                     </>
                )}

                {activeTab === 'incidents' && (
                    <>
                        <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/80 dark:bg-gray-800/40">
                            <h2 className="font-black text-sm sm:text-base text-gray-800 dark:text-gray-200">لیست وقایع و گزارشات</h2>
                            <button onClick={handleOpenNewItemModal} className="bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-blue-700 shadow-xs">
                                <Plus size={14}/> ثبت واقعه جدید
                            </button>
                        </div>
                        <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {allDailyIncidents.map(inc => (
                                <div key={inc.id} className="border border-gray-200 dark:border-gray-800 rounded-xl p-3.5 hover:shadow-md transition-shadow bg-gray-50/50 dark:bg-gray-800/30 relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 text-[10px] px-2 py-0.5 rounded font-black">گزارش #{inc.reportNumber}</span>
                                        <span className="text-[10px] text-gray-400">{new Date(inc.createdAt).toLocaleTimeString('fa-IR')}</span>
                                    </div>
                                    <h3 className="font-bold text-sm mb-1 text-gray-900 dark:text-gray-100">{inc.subject}</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{inc.description}</p>
                                    <div className="flex justify-between items-center mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${inc.status === SecurityStatus.ARCHIVED ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}`}>{inc.status}</span>
                                        <div className="flex gap-1">
                                            <button onClick={() => { setPrintTarget({ type: 'incident', incident: inc }); setShowPrintModal(true); }} className="text-gray-500 hover:text-blue-600 p-1"><Printer size={14}/></button>
                                            {canEdit(inc.status) && <button onClick={(e) => handleJumpToEdit(e, 'incident', inc)} className="text-amber-500 hover:text-amber-700 p-1"><Edit size={14}/></button>}
                                            {canDelete() && <button onClick={() => handleDeleteItem(inc.id, 'incident')} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14}/></button>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {activeTab === 'cartable' && (
                    <div className="p-4 sm:p-6">
                        {getCartableItems().length === 0 ? <div className="text-center text-gray-400 py-10 text-xs sm:text-sm">کارتابل شما خالی است.</div> : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {getCartableItems().map((item, idx) => (
                                    <div key={idx} onClick={() => setViewCartableItem(item)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-xs hover:shadow-md cursor-pointer transition-all border-r-4 border-r-orange-500">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-black text-sm text-gray-800 dark:text-gray-200">{item.type === 'daily_approval' ? 'تایید گزارش روزانه' : item.type === 'incident' ? 'تایید واقعه' : 'تایید تاخیر'}</span>
                                            <span className="bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 text-[10px] px-2 py-0.5 rounded font-bold animate-pulse">اقدام فوری</span>
                                        </div>
                                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                                            {item.date && <div>📅 تاریخ: {formatDate(item.date)}</div>}
                                            {item.count && <div>🔢 تعداد موارد: {item.count}</div>}
                                            {item.subject && <div>📝 موضوع: {item.subject}</div>}
                                            {item.personnelName && <div>👤 پرسنل: {item.personnelName}</div>}
                                        </div>
                                        <button className="mt-3 w-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 text-xs py-2 rounded-xl font-bold hover:bg-blue-100">بررسی و اقدام</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                
                {activeTab === 'archive' && (
                    <div className="p-3 sm:p-4">
                        <h3 className="font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"><Archive size={18}/> آرشیو گزارشات</h3>
                        <div className="space-y-2">
                            {getArchivedItems().map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-gray-50/80 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-200/80 dark:border-gray-700/80 hover:bg-gray-100/80">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${item.category === 'log' ? 'bg-blue-100 text-blue-600' : item.category === 'delay' ? 'bg-red-100 text-red-600' : 'bg-purple-100 text-purple-600'}`}>
                                            {item.category === 'log' ? <ListChecks size={16}/> : item.category === 'delay' ? <Clock size={16}/> : <AlertTriangle size={16}/>}
                                        </div>
                                        <div>
                                            <div className="font-bold text-xs sm:text-sm text-gray-800 dark:text-gray-200">
                                                {item.type === 'daily_archive' ? (item.category === 'log' ? 'گزارش روزانه نگهبانی' : 'گزارش تاخیرات روزانه') : item.subject}
                                            </div>
                                            <div className="text-[11px] text-gray-500">{formatDate(item.date)}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setViewCartableItem(item)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg"><Eye size={16}/></button>
                                        {canDelete() && <button onClick={() => handleDeleteDailyArchive(item.date, item.category)} className="text-red-400 hover:bg-red-50 p-1.5 rounded-lg"><Trash2 size={16}/></button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'driver_payments' && (
                    <div className="p-4 sm:p-6 space-y-4">
                        {/* Header Banner */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-800">
                            <div>
                                <h3 className="font-black text-gray-800 dark:text-gray-100 text-base flex items-center gap-2">
                                    <DollarSign className="text-purple-600" size={20}/>
                                    <span>فرم‌های واریزی و کرایه رانندگان (فرآیند تایید و بایگانی دو مرحله‌ای)</span>
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    مرحله ۱: تایید سرپرست انتظامات (ارسال خودکار به گروه ۱) ➔ مرحله ۲: تایید مدیر کارخانه و بایگانی (ارسال خودکار به گروه ۲)
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button 
                                    onClick={handleOpenSecurityGroupSettings}
                                    className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 border border-gray-200 dark:border-gray-600 shadow-xs"
                                    title="تنظیم گروه گفتگوی داخلی و ربات‌های تلگرام، بله، واتساپ برای مراحل ۱ و ۲"
                                >
                                    <Settings size={15} className="text-purple-600 dark:text-purple-400" />
                                    <span>تنظیم گروه‌های ۱ و ۲</span>
                                </button>
                                <button 
                                    onClick={() => {
                                        setDriverPaymentForm({
                                            id: generateUUID(),
                                            date: getIsoSelectedDate(),
                                            driverName: '',
                                            driverPhone: '',
                                            plateNumber: '',
                                            cardNumber: '',
                                            shebaNumber: '',
                                            accountNumber: '',
                                            bankName: '',
                                            accountHolder: '',
                                            amount: '',
                                            paymentType: 'کارت به کارت',
                                            origin: '',
                                            destination: '',
                                            goodsName: '',
                                            quantity: '',
                                            permitProvider: '',
                                            registrant: currentUser.fullName,
                                            description: '',
                                            attachments: [],
                                            supervisorApproved: false,
                                            factoryApproved: false,
                                            status: 'PENDING_SUPERVISOR'
                                        });
                                        setDriverPaymentEditingId(null);
                                        setShowDriverPaymentForm(true);
                                    }}
                                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm hover:shadow transition-all active:scale-95"
                                >
                                    <Plus size={16}/>
                                    <span>ثبت فرم واریزی جدید</span>
                                </button>
                            </div>
                        </div>

                        {/* Search and Stage Filter Tabs */}
                        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
                            <div className="flex gap-2 w-full max-w-md">
                                <input 
                                    type="text" 
                                    placeholder="جستجو بر اساس نام راننده، پلاک، شماره کارت، شبا یا کالا..." 
                                    className="w-full text-xs border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 bg-white dark:bg-gray-800 outline-none focus:border-purple-500 dark:focus:border-purple-500 transition-all"
                                    value={driverPaymentSearchQuery}
                                    onChange={e => setDriverPaymentSearchQuery(e.target.value)}
                                />
                            </div>

                            {/* Status Filter Badges */}
                            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800/80 p-1 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto text-xs">
                                <button
                                    onClick={() => setDriverPaymentStatusFilter('all')}
                                    className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
                                        driverPaymentStatusFilter === 'all'
                                            ? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-xs'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                                    }`}
                                >
                                    همه ({driverPayments.length})
                                </button>
                                <button
                                    onClick={() => setDriverPaymentStatusFilter('cartable')}
                                    className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                        driverPaymentStatusFilter === 'cartable'
                                            ? 'bg-amber-500 text-white shadow-xs'
                                            : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                                    }`}
                                >
                                    <Clock size={13} />
                                    <span>کارتابل ({driverPayments.filter(p => !p.factoryApproved && p.status !== 'ARCHIVED').length})</span>
                                </button>
                                <button
                                    onClick={() => setDriverPaymentStatusFilter('archived')}
                                    className={`px-3 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                        driverPaymentStatusFilter === 'archived'
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                                    }`}
                                >
                                    <CheckCheck size={13} />
                                    <span>بایگانی شده ({driverPayments.filter(p => p.factoryApproved || p.status === 'ARCHIVED').length})</span>
                                </button>
                            </div>
                        </div>

                        {/* List / Table */}
                        {driverPayments.length === 0 ? (
                            <div className="text-center text-gray-400 py-16 text-xs sm:text-sm bg-gray-50/50 dark:bg-gray-800/20 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                                هیچ فرم واریزی ثبت نشده است. می‌توانید با زدن دکمه بالا یک فرم واریزی جدید ثبت کنید.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs">
                                <table className="w-full text-right border-collapse text-xs sm:text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                            <th className="p-3 font-bold text-center w-12">ردیف</th>
                                            <th className="p-3 font-bold">تاریخ</th>
                                            <th className="p-3 font-bold">راننده و خودرو</th>
                                            <th className="p-3 font-bold">اطلاعات حساب و شبا</th>
                                            <th className="p-3 font-bold">مبلغ و نوع پرداخت</th>
                                            <th className="p-3 font-bold">کالا و مسیر</th>
                                            <th className="p-3 font-bold text-center">وضعیت تایید و گردش</th>
                                            <th className="p-3 font-bold text-center">پیوست‌ها</th>
                                            <th className="p-3 font-bold text-center">عملیات و اقدامات</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {driverPayments
                                            .filter(dp => {
                                                // Status tab filter
                                                if (driverPaymentStatusFilter === 'cartable' && (dp.factoryApproved || dp.status === 'ARCHIVED')) return false;
                                                if (driverPaymentStatusFilter === 'archived' && (!dp.factoryApproved && dp.status !== 'ARCHIVED')) return false;

                                                // Search query
                                                const q = driverPaymentSearchQuery.trim().toLowerCase();
                                                if (!q) return true;
                                                return (
                                                    (dp.driverName || '').toLowerCase().includes(q) ||
                                                    (dp.plateNumber || '').toLowerCase().includes(q) ||
                                                    (dp.goodsName || '').toLowerCase().includes(q) ||
                                                    (dp.origin || '').toLowerCase().includes(q) ||
                                                    (dp.destination || '').toLowerCase().includes(q) ||
                                                    (dp.cardNumber || '').replace(/-/g, '').includes(q) ||
                                                    (dp.shebaNumber || '').toLowerCase().includes(q) ||
                                                    (dp.bankName || '').toLowerCase().includes(q) ||
                                                    (dp.accountHolder || '').toLowerCase().includes(q)
                                                );
                                            })
                                            .map((dp, idx) => (
                                                <tr key={dp.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-all">
                                                    <td className="p-3 text-center text-gray-400 font-mono">{idx + 1}</td>
                                                    <td className="p-3 font-medium whitespace-nowrap">{formatDate(dp.date)}</td>
                                                    <td className="p-3">
                                                        <div className="font-bold text-gray-800 dark:text-gray-200">{dp.driverName}</div>
                                                        {dp.driverPhone && <div className="text-[10px] text-gray-400 font-mono mt-0.5">{dp.driverPhone}</div>}
                                                        <div className="mt-1">
                                                            <IranianPlateDisplay value={dp.plateNumber} />
                                                        </div>
                                                    </td>
                                                    <td className="p-3">
                                                        {dp.cardNumber ? (
                                                            <div className="font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/40 px-2 py-0.5 rounded inline-block dir-ltr" title="شماره کارت">
                                                                💳 {dp.cardNumber}
                                                            </div>
                                                        ) : null}
                                                        {dp.shebaNumber ? (
                                                            <div className="font-mono text-[10px] text-gray-600 dark:text-gray-400 mt-0.5 dir-ltr truncate max-w-[150px]" title={dp.shebaNumber}>
                                                                🏦 {dp.shebaNumber}
                                                            </div>
                                                        ) : null}
                                                        {(dp.bankName || dp.accountHolder) && (
                                                            <div className="text-[10px] text-gray-500 mt-0.5">
                                                                {dp.bankName} {dp.accountHolder ? `(${dp.accountHolder})` : ''}
                                                            </div>
                                                        )}
                                                        {!dp.cardNumber && !dp.shebaNumber && !dp.bankName && (
                                                            <span className="text-[10px] text-gray-400">ثبت نشده</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 whitespace-nowrap">
                                                        <div className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                                                            {dp.amount ? Number(dp.amount).toLocaleString('fa-IR') + ' ریال' : 'ثبت نشده'}
                                                        </div>
                                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 inline-block mt-1">
                                                            {dp.paymentType || 'کارت به کارت'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="font-bold text-xs">{dp.goodsName || 'نامشخص'}</div>
                                                        <div className="text-[10px] text-gray-400 mt-0.5">{dp.origin || 'مبدا'} ➔ {dp.destination || 'مقصد'}</div>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {dp.factoryApproved || dp.status === 'ARCHIVED' ? (
                                                            <div className="inline-flex flex-col items-center gap-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800">
                                                                <span className="flex items-center gap-1 font-black text-[11px]">
                                                                    <CheckCheck size={13} className="text-emerald-600" />
                                                                    تایید نهایی و بایگانی
                                                                </span>
                                                                {dp.factoryApproverName && (
                                                                    <span className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80">
                                                                        توسط: {dp.factoryApproverName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : dp.supervisorApproved ? (
                                                            <div className="inline-flex flex-col items-center gap-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-800">
                                                                <span className="flex items-center gap-1 font-black text-[11px]">
                                                                    <ShieldCheck size={13} className="text-blue-600" />
                                                                    تایید سرپرست / منتظر مدیر
                                                                </span>
                                                                {dp.supervisorApproverName && (
                                                                    <span className="text-[9px] text-blue-600/80 dark:text-blue-400/80">
                                                                        توسط: {dp.supervisorApproverName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2.5 py-1 rounded-xl border border-amber-200 dark:border-amber-800 font-black text-[11px]">
                                                                <Clock size={13} className="text-amber-600" />
                                                                در انتظار تایید سرپرست
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        {dp.attachments && dp.attachments.length > 0 ? (
                                                            <div className="flex justify-center gap-1.5">
                                                                {dp.attachments.map((att, attIdx) => (
                                                                    <button 
                                                                        key={attIdx}
                                                                        onClick={() => {
                                                                            setViewAttachmentUrl(att.url);
                                                                        }}
                                                                        className="p-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-all"
                                                                        title={att.fileName}
                                                                    >
                                                                        {/\.(jpg|jpeg|png|webp)$/i.test(att.url) ? <FileImage size={14} className="text-purple-600" /> : <FileText size={14} className="text-blue-500" />}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-400 font-medium">بدون پیوست</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-center whitespace-nowrap">
                                                        <div className="flex items-center justify-center gap-1">
                                                            {/* View Details Button */}
                                                            <button 
                                                                onClick={() => setViewingPaymentModal(dp)}
                                                                className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition-all"
                                                                title="مشاهده جزئیات کامل فرم واریزی"
                                                            >
                                                                <Eye size={15}/>
                                                            </button>

                                                            {/* Print & Form View Button */}
                                                            <button 
                                                                onClick={() => { setPrintTarget({ type: 'driver_payment', payment: dp }); setShowPrintModal(true); }}
                                                                className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 hover:bg-teal-100 transition-all"
                                                                title="نمایش فرم و چاپ"
                                                            >
                                                                <Printer size={15}/>
                                                            </button>

                                                            {/* Stage 1: Supervisor Approve Action */}
                                                            {!dp.supervisorApproved && (
                                                                <button 
                                                                    disabled={approvingPaymentId === dp.id}
                                                                    onClick={() => handleSupervisorApprove(dp)}
                                                                    className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all active:scale-95 disabled:opacity-50"
                                                                    title="تایید سرپرست انتظامات و ارسال اتومات به گروه ۱ (انتظامات)"
                                                                >
                                                                    {approvingPaymentId === dp.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                                                                    <span>تایید سرپرست</span>
                                                                </button>
                                                            )}

                                                            {/* Stage 2: Factory Manager Approve Action */}
                                                            {dp.supervisorApproved && !dp.factoryApproved && (
                                                                <button 
                                                                    disabled={approvingPaymentId === dp.id}
                                                                    onClick={() => handleFactoryApprove(dp)}
                                                                    className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all active:scale-95 disabled:opacity-50"
                                                                    title="تایید مدیر کارخانه، ارسال اتومات به گروه ۲ (مدیریت/مالی) و بایگانی"
                                                                >
                                                                    {approvingPaymentId === dp.id ? <Loader2 size={12} className="animate-spin" /> : <Building2 size={12} />}
                                                                    <span>تایید مدیر و بایگانی</span>
                                                                </button>
                                                            )}

                                                            {/* Share to Bots / Groups */}
                                                            <button 
                                                                disabled={sharingPaymentId === dp.id}
                                                                onClick={async () => {
                                                                    try {
                                                                        await handleSharePaymentToGroup(dp);
                                                                    } catch (err) {
                                                                        alert('خطا در ارسال پیام به گروه گفتگو');
                                                                    }
                                                                }}
                                                                className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-all disabled:opacity-50"
                                                                title="ارسال مجدد به ربات‌ها و گروه‌ها"
                                                            >
                                                                {sharingPaymentId === dp.id ? <Loader2 size={14} className="animate-spin text-purple-600" /> : <Send size={14}/>}
                                                            </button>

                                                            {/* Edit */}
                                                            <button 
                                                                onClick={() => {
                                                                    setDriverPaymentForm({ ...dp });
                                                                    setDriverPaymentEditingId(dp.id);
                                                                    setShowDriverPaymentForm(true);
                                                                }}
                                                                className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-all"
                                                                title="ویرایش"
                                                            >
                                                                <Pencil size={14}/>
                                                            </button>

                                                            {/* Delete */}
                                                            <button 
                                                                onClick={async () => {
                                                                    if (confirm('آیا از حذف این سند واریزی اطمینان دارید؟')) {
                                                                        await deleteDriverPayment(dp.id);
                                                                        loadData();
                                                                    }
                                                                }}
                                                                className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 transition-all"
                                                                title="حذف"
                                                            >
                                                                <Trash2 size={14}/>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* DRIVER PAYMENT DETAILED VIEW MODAL */}
            {viewingPaymentModal && typeof document !== 'undefined' && createPortal(
                <div 
                    className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[99999] flex items-center justify-center p-3 sm:p-4 animate-fade-in"
                    onClick={() => setViewingPaymentModal(null)}
                    dir="rtl"
                >
                    <div 
                        className="bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden border border-gray-200 dark:border-gray-800"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-5 py-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/15 rounded-xl backdrop-blur-xs">
                                    <DollarSign size={20} />
                                </div>
                                <div>
                                    <h3 className="font-black text-sm sm:text-base">مشاهده سند واریزی و کرایه راننده</h3>
                                    <div className="text-[11px] text-purple-200 flex items-center gap-2 mt-0.5">
                                        <span>تاریخ ثبت: {formatDate(viewingPaymentModal.date)}</span>
                                        <span>•</span>
                                        <span>ثبت‌کننده: {viewingPaymentModal.registrant || 'واحد انتظامات'}</span>
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={() => setViewingPaymentModal(null)}
                                className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-5 overflow-y-auto space-y-4 text-xs">
                            {/* Workflow Status Banner */}
                            <div className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                                viewingPaymentModal.factoryApproved || viewingPaymentModal.status === 'ARCHIVED'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
                                    : viewingPaymentModal.supervisorApproved
                                        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100'
                                        : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100'
                            }`}>
                                <div className="space-y-1">
                                    <div className="font-black text-sm flex items-center gap-2">
                                        {viewingPaymentModal.factoryApproved || viewingPaymentModal.status === 'ARCHIVED' ? (
                                            <>
                                                <CheckCheck className="text-emerald-600" size={18} />
                                                <span>وضعیت: تایید نهایی مدیر کارخانه و بایگانی شده ✅</span>
                                            </>
                                        ) : viewingPaymentModal.supervisorApproved ? (
                                            <>
                                                <ShieldCheck className="text-blue-600" size={18} />
                                                <span>وضعیت: تایید شده توسط سرپرست انتظامات (در انتظار تایید مدیر کارخانه) 📋</span>
                                            </>
                                        ) : (
                                            <>
                                                <Clock className="text-amber-600" size={18} />
                                                <span>وضعیت: در انتظار تایید سرپرست انتظامات ⏳</span>
                                            </>
                                        )}
                                    </div>
                                    <div className="text-[11px] opacity-80">
                                        {viewingPaymentModal.factoryApproved ? (
                                            `تایید مدیر کارخانه توسط ${viewingPaymentModal.factoryApproverName || 'مدیریت'} در تاریخ ${viewingPaymentModal.factoryApprovedAt ? formatDate(new Date(viewingPaymentModal.factoryApprovedAt).toISOString()) : '-'}`
                                        ) : viewingPaymentModal.supervisorApproved ? (
                                            `تایید سرپرست انتظامات توسط ${viewingPaymentModal.supervisorApproverName || 'سرپرست'} در تاریخ ${viewingPaymentModal.supervisorApprovedAt ? formatDate(new Date(viewingPaymentModal.supervisorApprovedAt).toISOString()) : '-'}`
                                        ) : (
                                            'سند پس از تایید سرپرست به گروه ۱ ارسال و سپس جهت تایید نهایی به مدیر کارخانه ارسال می‌گردد.'
                                        )}
                                    </div>
                                </div>

                                {/* Direct Approval Button inside Modal */}
                                {!viewingPaymentModal.supervisorApproved ? (
                                    <button 
                                        disabled={approvingPaymentId === viewingPaymentModal.id}
                                        onClick={() => handleSupervisorApprove(viewingPaymentModal)}
                                        className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
                                    >
                                        {approvingPaymentId === viewingPaymentModal.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                                        <span>تایید سرپرست و ارسال به گروه ۱</span>
                                    </button>
                                ) : !viewingPaymentModal.factoryApproved ? (
                                    <button 
                                        disabled={approvingPaymentId === viewingPaymentModal.id}
                                        onClick={() => handleFactoryApprove(viewingPaymentModal)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
                                    >
                                        {approvingPaymentId === viewingPaymentModal.id ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />}
                                        <span>تایید مدیر کارخانه، ارسال به گروه ۲ و بایگانی</span>
                                    </button>
                                ) : null}
                            </div>

                            {/* Section 1: Driver & Plate */}
                            <div className="bg-purple-50/50 dark:bg-purple-950/15 p-4 rounded-2xl border border-purple-100 dark:border-purple-900/30 space-y-3">
                                <h4 className="font-black text-purple-800 dark:text-purple-300 flex items-center gap-2">
                                    <span>👤 اطلاعات راننده و خودرو</span>
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-gray-500 block mb-0.5">نام راننده:</span>
                                        <span className="font-bold text-sm text-gray-800 dark:text-gray-100">{viewingPaymentModal.driverName}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block mb-0.5">تلفن تماس:</span>
                                        <span className="font-mono font-bold text-gray-800 dark:text-gray-100">{viewingPaymentModal.driverPhone || 'ثبت نشده'}</span>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <span className="text-gray-500 block mb-1">پلاک خودرو:</span>
                                        <IranianPlateDisplay value={viewingPaymentModal.plateNumber} />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Bank & Payment Info */}
                            <div className="bg-emerald-50/50 dark:bg-emerald-950/15 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 space-y-3">
                                <h4 className="font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                                    <span>💳 اطلاعات حساب بانکی و واریز</span>
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-gray-500 block mb-0.5">مبلغ واریزی:</span>
                                        <div className="font-black text-base text-emerald-600 dark:text-emerald-400 font-mono">
                                            {viewingPaymentModal.amount ? Number(viewingPaymentModal.amount).toLocaleString('fa-IR') + ' ریال' : 'مشخص نشده'}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block mb-0.5">نوع پرداخت:</span>
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 inline-block">
                                            {viewingPaymentModal.paymentType || 'کارت به کارت'}
                                        </span>
                                    </div>
                                    {viewingPaymentModal.cardNumber && (
                                        <div className="sm:col-span-2 bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                            <div>
                                                <span className="text-gray-500 text-[10px] block">شماره کارت راننده:</span>
                                                <span className="font-mono font-black text-indigo-700 dark:text-indigo-300 text-sm tracking-wider dir-ltr block">
                                                    {viewingPaymentModal.cardNumber}
                                                </span>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(viewingPaymentModal.cardNumber!.replace(/-/g, ''));
                                                    alert('شماره کارت در حافظه کپی شد.');
                                                }}
                                                className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 flex items-center gap-1 font-bold text-[11px]"
                                            >
                                                <Copy size={13} />
                                                <span>کپی</span>
                                            </button>
                                        </div>
                                    )}
                                    {viewingPaymentModal.shebaNumber && (
                                        <div className="sm:col-span-2 bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                            <div>
                                                <span className="text-gray-500 text-[10px] block">شماره شبا:</span>
                                                <span className="font-mono font-black text-gray-800 dark:text-gray-100 text-xs dir-ltr block">
                                                    {viewingPaymentModal.shebaNumber}
                                                </span>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(viewingPaymentModal.shebaNumber!);
                                                    alert('شماره شبا در حافظه کپی شد.');
                                                }}
                                                className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 flex items-center gap-1 font-bold text-[11px]"
                                            >
                                                <Copy size={13} />
                                                <span>کپی</span>
                                            </button>
                                        </div>
                                    )}
                                    {viewingPaymentModal.bankName && (
                                        <div>
                                            <span className="text-gray-500 block mb-0.5">نام بانک:</span>
                                            <span className="font-bold text-gray-800 dark:text-gray-100">{viewingPaymentModal.bankName}</span>
                                        </div>
                                    )}
                                    {viewingPaymentModal.accountHolder && (
                                        <div>
                                            <span className="text-gray-500 block mb-0.5">صاحب حساب:</span>
                                            <span className="font-bold text-gray-800 dark:text-gray-100">{viewingPaymentModal.accountHolder}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Section 3: Cargo & Route Details */}
                            <div className="bg-blue-50/50 dark:bg-blue-950/15 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30 space-y-3">
                                <h4 className="font-black text-blue-800 dark:text-blue-300 flex items-center gap-2">
                                    <span>📦 مشخصات بار و مسیر حمل</span>
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-gray-500 block mb-0.5">نام کالا / بار:</span>
                                        <span className="font-bold text-gray-800 dark:text-gray-100">{viewingPaymentModal.goodsName || 'ثبت نشده'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block mb-0.5">مقدار / وزن:</span>
                                        <span className="font-bold text-gray-800 dark:text-gray-100">{viewingPaymentModal.quantity || 'ثبت نشده'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block mb-0.5">مبدا بارگیری:</span>
                                        <span className="font-bold text-gray-800 dark:text-gray-100">{viewingPaymentModal.origin || 'ثبت نشده'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block mb-0.5">مقصد تخلیه:</span>
                                        <span className="font-bold text-gray-800 dark:text-gray-100">{viewingPaymentModal.destination || 'ثبت نشده'}</span>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <span className="text-gray-500 block mb-0.5">مجوز دهنده / هماهنگ‌کننده:</span>
                                        <span className="font-bold text-gray-800 dark:text-gray-100">{viewingPaymentModal.permitProvider || 'ثبت نشده'}</span>
                                    </div>
                                    {viewingPaymentModal.description && (
                                        <div className="sm:col-span-2 bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                                            <span className="text-gray-500 text-[10px] block mb-1">توضیحات و بابت پرداخت:</span>
                                            <p className="text-gray-700 dark:text-gray-200 whitespace-pre-line">{viewingPaymentModal.description}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Section 4: Attachments (Image & PDF Preview) */}
                            <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
                                <h4 className="font-black text-gray-800 dark:text-gray-200 flex items-center justify-between">
                                    <span>📎 اسناد و فاکتورهای پیوست ({viewingPaymentModal.attachments?.length || 0})</span>
                                </h4>
                                {viewingPaymentModal.attachments && viewingPaymentModal.attachments.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {viewingPaymentModal.attachments.map((att, attIdx) => {
                                            const isImage = /\.(jpg|jpeg|png|webp)$/i.test(att.url);
                                            return (
                                                <div 
                                                    key={attIdx} 
                                                    onClick={() => setViewAttachmentUrl(att.url)}
                                                    className="group cursor-pointer bg-white dark:bg-gray-900 rounded-xl p-2 border border-gray-200 dark:border-gray-700 hover:border-purple-500 transition-all shadow-xs flex flex-col items-center text-center"
                                                >
                                                    {isImage ? (
                                                        <div className="w-full h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 mb-2">
                                                            <img 
                                                                src={att.url} 
                                                                alt={att.fileName} 
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                                                referrerPolicy="no-referrer"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-24 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex flex-col items-center justify-center text-blue-600 mb-2">
                                                            <FileText size={32} />
                                                            <span className="text-[10px] font-bold mt-1">سند PDF</span>
                                                        </div>
                                                    )}
                                                    <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate w-full" title={att.fileName}>
                                                        {att.fileName}
                                                    </span>
                                                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold mt-0.5">
                                                        کلیک برای مشاهده
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-gray-400 text-center py-4 text-xs">
                                        هیچ تصویر یا سندی برای این فرم پیوست نشده است.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                                <button 
                                    disabled={sharingPaymentId === viewingPaymentModal.id}
                                    onClick={() => handleSharePaymentToGroup(viewingPaymentModal)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {sharingPaymentId === viewingPaymentModal.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                    <span>ارسال به گروه‌ها و بات‌ها</span>
                                </button>
                                <button 
                                    onClick={() => {
                                        setPrintTarget({ type: 'driver_payment', payment: viewingPaymentModal });
                                        setShowPrintModal(true);
                                    }}
                                    className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                                >
                                    <Printer size={14} />
                                    <span>نمایش و چاپ فرم</span>
                                </button>
                                <button 
                                    onClick={() => {
                                        const dp = viewingPaymentModal;
                                        setViewingPaymentModal(null);
                                        setDriverPaymentForm({ ...dp });
                                        setDriverPaymentEditingId(dp.id);
                                        setShowDriverPaymentForm(true);
                                    }}
                                    className="bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 hover:bg-blue-100 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                                >
                                    <Pencil size={14} />
                                    <span>ویرایش</span>
                                </button>
                            </div>
                            <button 
                                onClick={() => setViewingPaymentModal(null)}
                                className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 px-5 py-2 rounded-xl text-xs font-bold transition-all"
                            >
                                بستن
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* DRIVER PAYMENT GROUP SETTINGS MODAL (2-STAGE CONFIGURATION) */}
            {showDriverPaymentSettingsModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-fade-in flex flex-col max-h-[92vh]">
                        {/* Header */}
                        <div className="p-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Settings size={20} />
                                <h3 className="font-black text-sm">تنظیم گروه‌های ارسال دو مرحله‌ای فیش واریزی رانندگان</h3>
                            </div>
                            <button
                                onClick={() => setShowDriverPaymentSettingsModal(false)}
                                className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/10"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5 space-y-4 overflow-y-auto text-xs">
                            {/* Auto send toggle */}
                            <label className="flex items-center gap-2 cursor-pointer bg-purple-50 dark:bg-purple-950/40 p-3.5 rounded-xl border border-purple-200 dark:border-purple-800">
                                <input
                                    type="checkbox"
                                    checked={securitySettingsDraft.botDriverPaymentAutoSendEnabled !== false}
                                    onChange={(e) =>
                                        setSecuritySettingsDraft({
                                            ...securitySettingsDraft,
                                            botDriverPaymentAutoSendEnabled: e.target.checked,
                                        })
                                    }
                                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                />
                                <span className="font-bold text-purple-950 dark:text-purple-200">
                                    ارسال خودکار به گروه‌ها و بات‌ها هنگام تایید مراحل ۱ و ۲
                                </span>
                            </label>

                            {/* Disable internal chat sharing toggle */}
                            <label className="flex items-center gap-2 cursor-pointer bg-red-50 dark:bg-red-950/20 p-3.5 rounded-xl border border-red-200 dark:border-red-900/40">
                                <input
                                    type="checkbox"
                                    checked={securitySettingsDraft.disableInternalChatSharing === true}
                                    onChange={(e) =>
                                        setSecuritySettingsDraft({
                                            ...securitySettingsDraft,
                                            disableInternalChatSharing: e.target.checked,
                                        })
                                    }
                                    className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                                />
                                <span className="font-bold text-red-950 dark:text-red-200">
                                    غیر فعال‌سازی ارسال به گروه‌های چت داخل نرم‌افزار اسپان بافت (فقط ارسال به ربات‌های پیام‌رسان بله/تلگرام/واتساپ انجام شود)
                                </span>
                            </label>

                            {/* STAGE 1: SUPERVISOR APPROVAL -> GROUP 1 */}
                            <div className="space-y-3 p-4 bg-amber-50/60 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-800/40">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="text-amber-600" size={18} />
                                    <h4 className="font-black text-amber-950 dark:text-amber-200 text-sm">
                                        گروه ۱: ارسال پس از تایید سرپرست انتظامات (واحد انتظامات)
                                    </h4>
                                </div>
                                <p className="text-[11px] text-gray-500">
                                    پس از اینکه سرپرست انتظامات تیک تایید را بزند، سند فورا به این گروه‌ها ارسال می‌شود.
                                </p>
                                <div>
                                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">
                                        💬 گروه چت سازمانی مرحله ۱ (انتظامات):
                                    </label>
                                    <select
                                        value={securitySettingsDraft.securityDriverPaymentInternalGroupId || ""}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const sel = chatGroupsList.find((g) => g.id === val);
                                            setSecuritySettingsDraft({
                                                ...securitySettingsDraft,
                                                securityDriverPaymentInternalGroupId: val,
                                                securityDriverPaymentInternalGroupName: sel ? sel.name : "",
                                            });
                                        }}
                                        className="w-full text-xs border border-gray-300 dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                                    >
                                        <option value="">-- پیش‌فرض خودکار (گروه انتظامات / نگهبانی) --</option>
                                        {chatGroupsList.map((g) => (
                                            <option key={g.id} value={g.id}>
                                                👥 {g.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                                    <div>
                                        <label className="text-[11px] text-gray-600 dark:text-gray-400 block mb-0.5">تلگرام گروه ۱:</label>
                                        <input
                                            type="text"
                                            value={securitySettingsDraft.botDriverPaymentGroupIdTele || ""}
                                            onChange={(e) => setSecuritySettingsDraft({ ...securitySettingsDraft, botDriverPaymentGroupIdTele: e.target.value })}
                                            placeholder="-100..."
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-1.5 text-xs dir-ltr font-mono bg-white dark:bg-gray-800"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-gray-600 dark:text-gray-400 block mb-0.5">بله گروه ۱:</label>
                                        <input
                                            type="text"
                                            value={securitySettingsDraft.botDriverPaymentGroupIdBale || ""}
                                            onChange={(e) => setSecuritySettingsDraft({ ...securitySettingsDraft, botDriverPaymentGroupIdBale: e.target.value })}
                                            placeholder="شناسه بله"
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-1.5 text-xs dir-ltr font-mono bg-white dark:bg-gray-800"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-gray-600 dark:text-gray-400 block mb-0.5">واتساپ گروه ۱:</label>
                                        <input
                                            type="text"
                                            value={securitySettingsDraft.botDriverPaymentGroupIdWhatsApp || ""}
                                            onChange={(e) => setSecuritySettingsDraft({ ...securitySettingsDraft, botDriverPaymentGroupIdWhatsApp: e.target.value })}
                                            placeholder="...g.us"
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-1.5 text-xs dir-ltr font-mono bg-white dark:bg-gray-800"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* STAGE 2: FACTORY MANAGER APPROVAL -> GROUP 2 */}
                            <div className="space-y-3 p-4 bg-blue-50/60 dark:bg-blue-950/20 rounded-2xl border border-blue-200 dark:border-blue-800/40">
                                <div className="flex items-center gap-2">
                                    <Building2 className="text-blue-600" size={18} />
                                    <h4 className="font-black text-blue-950 dark:text-blue-200 text-sm">
                                        گروه ۲: ارسال پس از تایید مدیر کارخانه (مدیریت، مالی و بایگانی)
                                    </h4>
                                </div>
                                <p className="text-[11px] text-gray-500">
                                    پس از اینکه مدیر کارخانه تیک تایید را بزند، سند فورا به این گروه دوم ارسال شده و بایگانی نهایی می‌شود.
                                </p>
                                <div>
                                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">
                                        💬 گروه چت سازمانی مرحله ۲ (مدیریت/مالی):
                                    </label>
                                    <select
                                        value={securitySettingsDraft.securityDriverPaymentSecondInternalGroupId || ""}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const sel = chatGroupsList.find((g) => g.id === val);
                                            setSecuritySettingsDraft({
                                                ...securitySettingsDraft,
                                                securityDriverPaymentSecondInternalGroupId: val,
                                                securityDriverPaymentSecondInternalGroupName: sel ? sel.name : "",
                                            });
                                        }}
                                        className="w-full text-xs border border-gray-300 dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                                    >
                                        <option value="">-- پیش‌فرض خودکار (گروه مدیریت کارخانه / مالی / حسابداری) --</option>
                                        {chatGroupsList.map((g) => (
                                            <option key={g.id} value={g.id}>
                                                👥 {g.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                                    <div>
                                        <label className="text-[11px] text-gray-600 dark:text-gray-400 block mb-0.5">تلگرام گروه ۲:</label>
                                        <input
                                            type="text"
                                            value={securitySettingsDraft.botDriverPaymentSecondGroupIdTele || ""}
                                            onChange={(e) => setSecuritySettingsDraft({ ...securitySettingsDraft, botDriverPaymentSecondGroupIdTele: e.target.value })}
                                            placeholder="-100..."
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-1.5 text-xs dir-ltr font-mono bg-white dark:bg-gray-800"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-gray-600 dark:text-gray-400 block mb-0.5">بله گروه ۲:</label>
                                        <input
                                            type="text"
                                            value={securitySettingsDraft.botDriverPaymentSecondGroupIdBale || ""}
                                            onChange={(e) => setSecuritySettingsDraft({ ...securitySettingsDraft, botDriverPaymentSecondGroupIdBale: e.target.value })}
                                            placeholder="شناسه بله"
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-1.5 text-xs dir-ltr font-mono bg-white dark:bg-gray-800"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-gray-600 dark:text-gray-400 block mb-0.5">واتساپ گروه ۲:</label>
                                        <input
                                            type="text"
                                            value={securitySettingsDraft.botDriverPaymentSecondGroupIdWhatsApp || ""}
                                            onChange={(e) => setSecuritySettingsDraft({ ...securitySettingsDraft, botDriverPaymentSecondGroupIdWhatsApp: e.target.value })}
                                            placeholder="...g.us"
                                            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-1.5 text-xs dir-ltr font-mono bg-white dark:bg-gray-800"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-800/60 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowDriverPaymentSettingsModal(false)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                                انصراف
                            </button>
                            <button
                                type="button"
                                disabled={savingSecuritySettings}
                                onClick={handleSaveSecurityPaymentSettings}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
                            >
                                {savingSecuritySettings ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                <span>ذخیره تنظیمات</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Subtab Back Trigger */}
            {activeTab !== 'logs' && (
                <button 
                    data-subtab-back="true" 
                    onClick={() => setActiveTab('logs')} 
                    className="hidden"
                />
            )}
        </div>
    );
};

export default SecurityModule;
