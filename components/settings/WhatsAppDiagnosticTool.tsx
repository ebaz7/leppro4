import React, { useState, useEffect, useRef } from 'react';
import { 
    Activity, 
    Wifi, 
    WifiOff, 
    CheckCircle2, 
    AlertTriangle, 
    XCircle, 
    RefreshCw, 
    Send, 
    Terminal, 
    Trash2, 
    Copy, 
    Clock, 
    Server, 
    ShieldCheck, 
    Cpu, 
    Folder, 
    ExternalLink, 
    ChevronDown, 
    ChevronUp, 
    Search, 
    Loader2, 
    HelpCircle,
    Play,
    Unlock,
    Image as ImageIcon
} from 'lucide-react';
import { apiCall } from '../../services/apiService';

export interface DiagnosticLog {
    id: string;
    timestamp: string;
    timeStr: string;
    level: 'info' | 'warn' | 'error' | 'success';
    source: 'INIT' | 'AUTH' | 'NETWORK' | 'MESSAGE' | 'PUPPETEER' | 'DIAGNOSTIC' | 'CLIENT' | string;
    message: string;
    details?: string | null;
}

export interface DiagnosticStep {
    name: string;
    key: string;
    passed: boolean;
    status: 'ok' | 'warning' | 'error';
    message: string;
    latencyMs?: number;
    detail?: string;
}

export interface DiagnosticData {
    success: boolean;
    status: {
        ready: boolean;
        qr: string | null;
        qrDataUrl: string | null;
        user: string | null;
        initializing: boolean;
        error: string | null;
        state: 'CONNECTED' | 'INITIALIZING' | 'QR_READY' | 'ERROR' | 'DISCONNECTED' | string;
        connectedAt: string | null;
        disconnectedAt: string | null;
        uptimeSeconds: number;
        browserStatus: {
            running: boolean;
            pid: number | null;
        };
        activeProxy: string | null;
        chromePath: string | null;
        authDir: string | null;
    };
    system: {
        platform: string;
        arch: string;
        nodeVersion: string;
        uptimeSeconds: number;
        chromePath: string | null;
        activeProxy: string | null;
        authDir: string | null;
        sessionStats?: {
            exists: boolean;
            fileCount: number;
            totalSizeBytes: number;
            error?: string;
        };
    };
    logs: DiagnosticLog[];
    timestamp: string;
}

interface WhatsAppDiagnosticToolProps {
    onTriggerRestart?: (clean: boolean) => void;
    currentProxy?: string;
}

export const WhatsAppDiagnosticTool: React.FC<WhatsAppDiagnosticToolProps> = ({ 
    onTriggerRestart,
    currentProxy = '' 
}) => {
    const [diagnosticData, setDiagnosticData] = useState<DiagnosticData | null>(null);
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResults, setTestResults] = useState<{
        timestamp: string;
        overallHealthy: boolean;
        summary: string;
        steps: DiagnosticStep[];
    } | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warn' | 'success_info'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    const [copiedLogs, setCopiedLogs] = useState(false);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

    // Test message state
    const [testNumber, setTestNumber] = useState('');
    const [testMessage, setTestMessage] = useState('تست ارتباط و ارسال تصویر سند رسمی همراه با کپشن در ربات واتساپ ERP ✅');
    const [sendWithPhoto, setSendWithPhoto] = useState(true);
    const [sendingTest, setSendingTest] = useState(false);

    const refreshTimerRef = useRef<any>(null);

    const fetchDiagnostics = async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        try {
            const data = await apiCall<DiagnosticData>('/whatsapp/diagnostics');
            if (data && data.success) {
                setDiagnosticData(data);
            }
        } catch (e: any) {
            console.error('Error fetching WhatsApp diagnostics:', e);
            if (!isSilent) {
                setActionMessage({ type: 'error', text: 'خطا در دریافت وضعیت عیب‌یابی: ' + (e.message || 'نامشخص') });
            }
        } finally {
            if (!isSilent) setLoading(false);
        }
    };

    useEffect(() => {
        fetchDiagnostics(false);
    }, []);

    // Auto refresh timer
    useEffect(() => {
        if (autoRefresh) {
            refreshTimerRef.current = setInterval(() => {
                fetchDiagnostics(true);
            }, 4000);
        } else {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        }
        return () => {
            if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
        };
    }, [autoRefresh]);

    const runSelfTest = async () => {
        setTesting(true);
        setActionMessage(null);
        try {
            const res = await apiCall<any>('/whatsapp/diagnostics/test', {
                method: 'POST',
                body: JSON.stringify({ proxy: currentProxy })
            });
            if (res && res.success) {
                setTestResults(res);
                fetchDiagnostics(true);
                setActionMessage({
                    type: res.overallHealthy ? 'success' : 'info',
                    text: res.summary || 'تست عیب‌یابی با موفقیت به پایان رسید.'
                });
            } else {
                throw new Error(res?.error || 'خطای ناشناخته در تست');
            }
        } catch (e: any) {
            console.error('Diagnostic test failed:', e);
            setActionMessage({ type: 'error', text: 'خطا در اجرای تست عیب‌یابی: ' + (e.message || '') });
        } finally {
            setTesting(false);
        }
    };

    const clearLogs = async () => {
        if (!confirm('آیا از پاکسازی تاریخچه لاگ‌های خطای واتساپ اطمینان دارید؟')) return;
        try {
            await apiCall('/whatsapp/diagnostics/clear', { method: 'POST' });
            fetchDiagnostics(true);
            setActionMessage({ type: 'info', text: 'لاگ‌های عیب‌یابی پاکسازی شدند.' });
        } catch (e: any) {
            setActionMessage({ type: 'error', text: 'خطا در پاکسازی لاگ‌ها: ' + e.message });
        }
    };

    const handleCleanLocks = async () => {
        try {
            setActionMessage(null);
            const res = await apiCall<{ success?: boolean; message?: string; error?: string }>('/whatsapp/clean-locks', { method: 'POST' });
            if (res && res.success) {
                setActionMessage({ type: 'success', text: res.message || 'قفل‌های مرورگر پاکسازی شدند.' });
                setTimeout(() => fetchDiagnostics(true), 1200);
            } else {
                throw new Error(res?.error || 'خطا در رفع قفل');
            }
        } catch (e: any) {
            setActionMessage({ type: 'error', text: 'خطا در رفع قفل مرورگر: ' + e.message });
        }
    };

    const copyLogsToClipboard = () => {
        if (!diagnosticData?.logs || diagnosticData.logs.length === 0) return;
        const text = diagnosticData.logs.map(l => 
            `[${l.timeStr}] [${l.level.toUpperCase()}] [${l.source}] ${l.message} ${l.details ? `\nDetails: ${l.details}` : ''}`
        ).join('\n\n');

        navigator.clipboard.writeText(text).then(() => {
            setCopiedLogs(true);
            setTimeout(() => setCopiedLogs(false), 2000);
        }).catch(() => {
            alert('عدم دسترسی به حافظه موقت (Clipboard)');
        });
    };

    const generateTestDocumentImage = (docTitle: string, docNumber: string, recipient: string, textCaption: string): string => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 900;
            canvas.height = 580;
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';

            // Background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 900, 580);

            // Border
            ctx.strokeStyle = '#059669';
            ctx.lineWidth = 6;
            ctx.strokeRect(12, 12, 876, 556);

            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(20, 20, 860, 540);

            // Header Banner
            ctx.fillStyle = '#065f46';
            ctx.fillRect(20, 20, 860, 85);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px Tahoma, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.direction = 'rtl';
            ctx.fillText('سامانه مدیریت یکپارچه و اطلاع‌رسانی سازمانی', 450, 58);

            ctx.font = '14px Tahoma, Arial, sans-serif';
            ctx.fillStyle = '#a7f3d0';
            ctx.fillText('نمونه برگه رسمی سند ارسال خودکار در واتساپ (Direct Image Card)', 450, 85);

            // Details card
            ctx.fillStyle = '#f0fdf4';
            ctx.strokeStyle = '#bbf7d0';
            ctx.lineWidth = 1.5;
            ctx.fillRect(40, 130, 820, 360);
            ctx.strokeRect(40, 130, 820, 360);

            // Details Content
            ctx.fillStyle = '#064e3b';
            ctx.font = 'bold 20px Tahoma, Arial, sans-serif';
            ctx.textAlign = 'right';
            ctx.direction = 'rtl';
            ctx.fillText(`📄 موضوع سند: ${docTitle}`, 830, 175);

            ctx.font = '15px Tahoma, Arial, sans-serif';
            ctx.fillStyle = '#334155';
            ctx.fillText(`🔢 شماره پیگیری: ${docNumber}`, 830, 215);
            ctx.fillText(`👤 گیرنده سند: ${recipient}`, 830, 255);
            ctx.fillText(`📅 تاریخ و زمان: ${new Date().toLocaleDateString('fa-IR')} | ساعت ${new Date().toLocaleTimeString('fa-IR')}`, 830, 295);
            ctx.fillText(`🏢 واحد صادرکننده: اتوماسیون هوشمند لجستیک، انبار و مالی`, 830, 335);

            // Caption summary
            ctx.fillStyle = '#475569';
            ctx.font = '13px Tahoma, Arial, sans-serif';
            const cleanPreview = textCaption.replace(/\*/g, '').slice(0, 70);
            ctx.fillText(`📝 خلاصه پیام: ${cleanPreview}`, 830, 380);

            // Seal Stamp
            ctx.save();
            ctx.translate(180, 360);
            ctx.rotate(-15 * Math.PI / 180);
            ctx.strokeStyle = '#059669';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(0, 0, 95, 45, 0, 0, 2 * Math.PI);
            ctx.stroke();

            ctx.fillStyle = '#059669';
            ctx.font = 'bold 15px Tahoma, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('تایید و مهر رسمی سیستم', 0, -4);
            ctx.font = '11px Tahoma, Arial, sans-serif';
            ctx.fillText('VERIFIED ENTERPRISE BOT', 0, 16);
            ctx.restore();

            // Footer
            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px Tahoma, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('این پیام به صورت مستقیم و همزمان به گروه تخصصی و افراد مسئول ارسال می‌گردد.', 450, 530);

            return canvas.toDataURL('image/jpeg', 0.90);
        } catch (e) {
            console.warn("Canvas test image render failed:", e);
            return '';
        }
    };

    const handleSendTestMessage = async () => {
        if (!testNumber.trim()) {
            alert('لطفاً شماره گیرنده یا شناسه گروه را وارد کنید.');
            return;
        }
        if (!testMessage.trim()) {
            alert('لطفاً متن پیام آزمایشی را وارد کنید.');
            return;
        }

        setSendingTest(true);
        setActionMessage(null);
        try {
            let mediaData = undefined;
            if (sendWithPhoto) {
                const docDataUrl = generateTestDocumentImage(
                    'برگه آزمایشی مجوز / دستور پرداخت',
                    'TST-' + Math.floor(100000 + Math.random() * 900000),
                    testNumber.trim(),
                    testMessage.trim()
                );
                if (docDataUrl) {
                    mediaData = {
                        data: docDataUrl,
                        mimeType: 'image/jpeg',
                        filename: 'test_document_card.jpg'
                    };
                }
            }

            const res = await apiCall<{ success?: boolean; error?: string; warning?: string }>('/send-whatsapp', {
                method: 'POST',
                body: JSON.stringify({
                    number: testNumber.trim(),
                    message: testMessage.trim(),
                    mediaData
                })
            });

            if (res && res.success) {
                const modeLabel = sendWithPhoto ? 'تصویر برگه رسمی با کپشن' : 'پیام متنی';
                setActionMessage({ type: 'success', text: `تست ارسال (${modeLabel}) با موفقیت به ${testNumber} انجام شد.` });
                fetchDiagnostics(true);
            } else {
                throw new Error(res?.error || res?.warning || 'ارسال پیام با شکست مواجه شد.');
            }
        } catch (e: any) {
            console.error('Test message send error:', e);
            setActionMessage({ type: 'error', text: 'خطا در ارسال پیام آزمایشی: ' + (e.message || 'نامشخص') });
            fetchDiagnostics(true);
        } finally {
            setSendingTest(false);
        }
    };

    // Format Uptime
    const formatUptime = (seconds: number) => {
        if (!seconds || seconds <= 0) return '0 ثانیه';
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const parts = [];
        if (d > 0) parts.push(`${d} روز`);
        if (h > 0) parts.push(`${h} ساعت`);
        if (m > 0) parts.push(`${m} دقیقه`);
        if (s > 0 || parts.length === 0) parts.push(`${s} ثانیه`);
        return parts.join(' و ');
    };

    // Format byte size
    const formatBytes = (bytes?: number) => {
        if (!bytes) return '0 KB';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    // Filter logs
    const filteredLogs = (diagnosticData?.logs || []).filter(log => {
        // Level filter
        if (logFilter === 'error' && log.level !== 'error') return false;
        if (logFilter === 'warn' && log.level !== 'warn') return false;
        if (logFilter === 'success_info' && log.level !== 'success' && log.level !== 'info') return false;

        // Search filter
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            const matchMsg = log.message.toLowerCase().includes(term);
            const matchSrc = log.source.toLowerCase().includes(term);
            const matchDet = log.details ? log.details.toLowerCase().includes(term) : false;
            if (!matchMsg && !matchSrc && !matchDet) return false;
        }
        return true;
    });

    const errorCount = (diagnosticData?.logs || []).filter(l => l.level === 'error').length;
    const warnCount = (diagnosticData?.logs || []).filter(l => l.level === 'warn').length;

    const isConnected = diagnosticData?.status?.ready;
    const isInitializing = diagnosticData?.status?.initializing;
    const hasQr = Boolean(diagnosticData?.status?.qr || diagnosticData?.status?.qrDataUrl);

    return (
        <div id="whatsapp-diagnostic-tool" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mb-6">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-emerald-50/60 via-teal-50/40 to-transparent dark:from-emerald-950/20 dark:via-teal-950/10 dark:to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                        isConnected 
                            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' 
                            : hasQr 
                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                            : 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
                    }`}>
                        <Activity size={22} className={isInitializing ? 'animate-spin' : ''} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-800 dark:text-gray-100 text-base sm:text-lg">
                                ابزار پایش و عیب‌یابی ارتباط واتساپ
                            </h3>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                isConnected 
                                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                    : hasQr 
                                    ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                                    : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                            }`}>
                                <span className={`w-2 h-2 rounded-full ${
                                    isConnected ? 'bg-emerald-500 animate-ping' : hasQr ? 'bg-amber-500' : 'bg-rose-500'
                                }`} />
                                {isConnected ? 'آنلاین و متصل' : hasQr ? 'منتظر اسکن QR' : isInitializing ? 'در حال راه‌اندازی' : 'غیرفعال / قطع'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            نظارت زنده بر وضعیت نشست، تاخیر شبکه، پروکسی، پپتیر و ثبت کامل لاگ‌های خطای فنی
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                        type="button"
                        onClick={handleCleanLocks}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                        title="پاکسازی قفل‌های موقت مرورگر کروم و رفع خطای SingletonLock"
                    >
                        <Unlock size={14} />
                        <span className="hidden sm:inline">رفع قفل مرورگر</span>
                    </button>
                    <button
                        id="run-wa-diagnostic-btn"
                        type="button"
                        onClick={runSelfTest}
                        disabled={testing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                        title="اجرای تست جامع دسترسی به وب واتساپ و سلامت سیستم"
                    >
                        {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                        <span>اجرای تست عیب‌یابی</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => fetchDiagnostics(false)}
                        disabled={loading}
                        className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs transition-colors"
                        title="بروزرسانی وضعیت"
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Action notification message */}
            {actionMessage && (
                <div className={`px-4 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
                    actionMessage.type === 'success' 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200' 
                        : actionMessage.type === 'error'
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200'
                        : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-200'
                }`}>
                    <div className="flex items-center gap-2">
                        {actionMessage.type === 'success' && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}
                        {actionMessage.type === 'error' && <XCircle size={16} className="text-rose-600 shrink-0" />}
                        {actionMessage.type === 'info' && <AlertTriangle size={16} className="text-blue-600 shrink-0" />}
                        <span>{actionMessage.text}</span>
                    </div>
                    <button 
                        type="button" 
                        onClick={() => setActionMessage(null)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs px-2"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Quick Metrics Grid */}
            <div className="p-4 sm:p-5 grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50/50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-800">
                <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span>شماره / کاربر متصل</span>
                        <Server size={14} className="text-gray-400" />
                    </div>
                    <div className="font-bold text-gray-800 dark:text-gray-100 text-sm font-mono dir-ltr truncate">
                        {diagnosticData?.status?.user || (isConnected ? 'متصل' : 'نامشخص')}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                        وضعیت نشست: {diagnosticData?.status?.state || 'نامشخص'}
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span>مدت زمان اتصال مداوم</span>
                        <Clock size={14} className="text-gray-400" />
                    </div>
                    <div className="font-bold text-gray-800 dark:text-gray-100 text-sm">
                        {isConnected ? formatUptime(diagnosticData?.status?.uptimeSeconds || 0) : 'قطع ارتباط'}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                        {diagnosticData?.status?.connectedAt ? new Date(diagnosticData.status.connectedAt).toLocaleTimeString('fa-IR') : 'فاقد نشست فعال'}
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span>وضعیت پروکسی / VPN</span>
                        <Wifi size={14} className="text-gray-400" />
                    </div>
                    <div className="font-bold text-gray-800 dark:text-gray-100 text-xs font-mono dir-ltr truncate" title={diagnosticData?.status?.activeProxy || 'مستقیم'}>
                        {diagnosticData?.status?.activeProxy ? diagnosticData.status.activeProxy : 'اتصال مستقیم (بدون پروکسی)'}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1 truncate">
                        {diagnosticData?.status?.activeProxy ? 'پروکسی فعال' : 'تنظیم پروکسی اختیاری'}
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span>حافظه نشست wauth</span>
                        <Folder size={14} className="text-gray-400" />
                    </div>
                    <div className="font-bold text-gray-800 dark:text-gray-100 text-sm">
                        {diagnosticData?.system?.sessionStats?.fileCount || 0} فایل
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                        حجم: {formatBytes(diagnosticData?.system?.sessionStats?.totalSizeBytes)}
                    </div>
                </div>
            </div>

            {/* Self-Test Diagnostic Result Section */}
            {testResults && (
                <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/50">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={18} className="text-emerald-600" />
                            <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">
                                نتیجه آخرین تست سلامت و ارتباط خودکار
                            </h4>
                            <span className="text-[11px] text-gray-400">
                                ({new Date(testResults.timestamp).toLocaleTimeString('fa-IR')})
                            </span>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                            testResults.overallHealthy 
                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                                : 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300'
                        }`}>
                            {testResults.overallHealthy ? 'ارتباط کاملاً پایدار' : 'نیاز به توجه یا بررسی'}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        {testResults.steps.map((step, idx) => (
                            <div 
                                key={idx} 
                                className={`p-3 rounded-xl border flex items-start gap-3 text-xs ${
                                    step.status === 'ok' 
                                        ? 'bg-white dark:bg-gray-800 border-emerald-200 dark:border-emerald-800/40' 
                                        : step.status === 'warning'
                                        ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40'
                                        : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40'
                                }`}
                            >
                                <div className="mt-0.5 shrink-0">
                                    {step.status === 'ok' && <CheckCircle2 size={16} className="text-emerald-600" />}
                                    {step.status === 'warning' && <AlertTriangle size={16} className="text-amber-500" />}
                                    {step.status === 'error' && <XCircle size={16} className="text-rose-600" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="font-bold text-gray-800 dark:text-gray-100">{step.name}</span>
                                        {step.latencyMs !== undefined && (
                                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                                step.latencyMs < 500 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                            }`}>
                                                {step.latencyMs}ms
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{step.message}</p>
                                    {step.detail && (
                                        <p className="text-[11px] text-gray-400 font-mono mt-0.5 dir-ltr truncate">
                                            {step.detail}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <HelpCircle size={15} className="text-blue-500 shrink-0" />
                        <span className="font-bold text-gray-500">خلاصه تحلیل:</span>
                        <span>{testResults.summary}</span>
                    </div>
                </div>
            )}

            {/* Test Message Dispatcher Drawer/Section */}
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 bg-emerald-50/20 dark:bg-emerald-950/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                        <Send size={16} className="text-emerald-600" />
                        <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">
                            تست زنده ارسال پیام و تصویر سند در واتساپ
                        </h4>
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-300 font-bold cursor-pointer select-none bg-emerald-100/70 dark:bg-emerald-900/40 px-2.5 py-1 rounded-md border border-emerald-300 dark:border-emerald-800">
                            <input
                                type="checkbox"
                                checked={sendWithPhoto}
                                onChange={(e) => setSendWithPhoto(e.target.checked)}
                                className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                            />
                            <ImageIcon size={13} className="text-emerald-700 dark:text-emerald-300" />
                            <span>ارسال به صورت تصویر مستقیم برگه با کپشن (روال ربات‌ها)</span>
                        </label>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                        <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1 font-bold">
                            شماره گیرنده / شناسه گروه
                        </label>
                        <input
                            type="text"
                            value={testNumber}
                            onChange={(e) => setTestNumber(e.target.value)}
                            placeholder="0912xxxxxxx یا شناسه گروه @g.us"
                            className="w-full border rounded-lg p-2 text-xs font-mono dir-ltr bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                    </div>
                    <div className="sm:col-span-2 flex gap-2 items-end">
                        <div className="flex-1">
                            <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1 font-bold">
                                متن کپشن و مشخصات پیوست
                            </label>
                            <input
                                type="text"
                                value={testMessage}
                                onChange={(e) => setTestMessage(e.target.value)}
                                className="w-full border rounded-lg p-2 text-xs bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleSendTestMessage}
                            disabled={sendingTest || !isConnected}
                            className="h-[34px] px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-40 shrink-0 flex items-center gap-1.5"
                            title={!isConnected ? 'ابتدا باید واتساپ متصل باشد' : 'ارسال تست به شماره یا گروه'}
                        >
                            {sendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            <span>ارسال آزمایشی</span>
                        </button>
                    </div>
                </div>
                {sendWithPhoto && (
                    <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                        💡 در حالت تصویر مستقیم سند، یک کارت گرافیکی با مهر رسمی، بارکد، عنوان سند و تاریخ به صورت فایل عکس در بالا و متن توضیحات کامل در قالب Caption در پایین آن ارسال می‌شود.
                    </p>
                )}
            </div>

            {/* Error Logs Console */}
            <div className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                        <Terminal size={17} className="text-gray-600 dark:text-gray-400" />
                        <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">
                            کنسول وقایع و خطاهای اخیر ربات واتساپ
                        </h4>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full font-bold text-gray-600 dark:text-gray-300">
                            {diagnosticData?.logs?.length || 0} مورد
                        </span>
                    </div>

                    {/* Filter tabs & tools */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setLogFilter('all')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                logFilter === 'all' 
                                    ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 shadow-sm' 
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                            }`}
                        >
                            همه
                        </button>
                        <button
                            type="button"
                            onClick={() => setLogFilter('error')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                logFilter === 'error' 
                                    ? 'bg-rose-600 text-white shadow-sm' 
                                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                            }`}
                        >
                            <span>خطاها</span>
                            {errorCount > 0 && (
                                <span className={`text-[10px] px-1 rounded-full ${logFilter === 'error' ? 'bg-white text-rose-600' : 'bg-rose-200 text-rose-800'}`}>
                                    {errorCount}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setLogFilter('warn')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                logFilter === 'warn' 
                                    ? 'bg-amber-600 text-white shadow-sm' 
                                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                            }`}
                        >
                            <span>هشدارها</span>
                            {warnCount > 0 && (
                                <span className={`text-[10px] px-1 rounded-full ${logFilter === 'warn' ? 'bg-white text-amber-600' : 'bg-amber-200 text-amber-800'}`}>
                                    {warnCount}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setLogFilter('success_info')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                logFilter === 'success_info' 
                                    ? 'bg-emerald-600 text-white shadow-sm' 
                                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                            }`}
                        >
                            موفق و اطلاعات
                        </button>

                        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-1" />

                        <button
                            type="button"
                            onClick={copyLogsToClipboard}
                            className="p-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-600 dark:text-gray-300 rounded-lg text-xs transition-colors"
                            title="کپی متن تمام لاگ‌ها در حافظه"
                        >
                            <Copy size={14} className={copiedLogs ? 'text-emerald-600' : ''} />
                        </button>

                        <button
                            type="button"
                            onClick={clearLogs}
                            className="p-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-rose-100 hover:text-rose-600 text-gray-600 dark:text-gray-300 rounded-lg text-xs transition-colors"
                            title="پاکسازی تاریخچه لاگ‌ها"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>

                {/* Search & Auto-Refresh Bar */}
                <div className="flex items-center gap-3 mb-3">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="جستجو در لاگ‌ها و خطاهای ثبت شده..."
                            className="w-full pr-8 pl-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>بروزرسانی زنده (هر ۴ ثانیه)</span>
                    </label>
                </div>

                {/* Log List View */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-900 text-gray-200 font-mono text-xs max-h-[360px] overflow-y-auto">
                    {filteredLogs.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            هیچ لاگ یا خطایی مطابق با فیلتر جاری یافت نشد.
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-800">
                            {filteredLogs.map((log) => {
                                const isExpanded = expandedLogId === log.id;
                                const isErr = log.level === 'error';
                                const isWrn = log.level === 'warn';
                                const isSucc = log.level === 'success';

                                return (
                                    <div 
                                        key={log.id} 
                                        className={`p-2.5 transition-colors hover:bg-gray-800/60 ${
                                            isErr ? 'bg-rose-950/20' : isWrn ? 'bg-amber-950/20' : ''
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                    isErr ? 'bg-rose-500 text-white' :
                                                    isWrn ? 'bg-amber-500 text-black' :
                                                    isSucc ? 'bg-emerald-500 text-white' :
                                                    'bg-gray-700 text-gray-300'
                                                }`}>
                                                    {log.level.toUpperCase()}
                                                </span>
                                                <span className="text-gray-400 text-[11px] dir-ltr">
                                                    {log.timeStr}
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] border border-gray-700">
                                                    {log.source}
                                                </span>
                                            </div>

                                            {log.details && (
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                                    className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-0.5 shrink-0"
                                                >
                                                    <span>{isExpanded ? 'بستن جزییات' : 'جزییات خطا'}</span>
                                                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                </button>
                                            )}
                                        </div>

                                        <div className="mt-1 text-gray-100 text-[11.5px] leading-relaxed break-words font-sans">
                                            {log.message}
                                        </div>

                                        {isExpanded && log.details && (
                                            <pre className="mt-2 p-2 bg-black/60 rounded-lg text-[11px] text-rose-300 font-mono dir-ltr overflow-x-auto whitespace-pre-wrap border border-gray-800">
                                                {log.details}
                                            </pre>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Troubleshooting Quick Tips */}
                <div className="mt-3 p-3 bg-blue-50/70 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                    <p className="font-bold mb-1">راهنمای رفع سریع خطاهای متداول واتساپ:</p>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-blue-800 dark:text-blue-300">
                        <li><strong>خطای ECONNREFUSED یا Timeout:</strong> فیلترشکن سرور یا پورت پروکسی محلی (v2rayN) قطع است یا پورت تنظیم شده در فیلد پروکسی نادرست است.</li>
                        <li><strong>خطای Session Closed یا Auth Failure:</strong> نشست منقضی شده یا از روی گوشی خارج شده‌اید. روی «پاکسازی نشست و ریستارت» کلیک کرده و مجدداً QR کد را اسکن کنید.</li>
                        <li><strong>خطای Puppeteer / Chrome:</strong> پپتیر نتوانسته مرورگر را بارگذاری کند؛ کلید ریستارت تمیز نشست را بزنید.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
