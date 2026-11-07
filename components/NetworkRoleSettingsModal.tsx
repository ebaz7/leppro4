import React, { useState, useEffect } from 'react';
import { Server, Monitor, Wifi, CheckCircle2, AlertCircle, RefreshCw, X, Shield, Globe, HardDrive, Database, UploadCloud, Loader2 } from 'lucide-react';
import { apiCall } from '../services/apiService';

interface NetworkRoleSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRoleChanged?: (role: 'Standalone' | 'Server' | 'Client', serverUrl?: string) => void;
}

export const NetworkRoleSettingsModal: React.FC<NetworkRoleSettingsModalProps> = ({
  isOpen,
  onClose,
  onRoleChanged
}) => {
  const [activeRole, setActiveRole] = useState<'Standalone' | 'Server' | 'Client'>('Standalone');
  const [serverUrl, setServerUrl] = useState<string>('http://192.168.1.100:8080');
  const [port, setPort] = useState<number>(8080);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreMessage, setRestoreMessage] = useState<string>('');
  const restoreFileRef = React.useRef<HTMLInputElement>(null);

  const handleModalBackupRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('⚠️ آیا مطمئن هستید که می‌خواهید این فایل پشتیبان را بازگردانی کنید؟\nتمام اطلاعات فعلی سیستم با اطلاعات این فایل جایگزین خواهد شد.')) {
      e.target.value = '';
      return;
    }

    setIsRestoring(true);
    setRestoreMessage('در حال خواندن و استخراج فایل پشتیبان...');
    const reader = new FileReader();

    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try {
        const response = await apiCall<{success: boolean, mode?: string}>('/emergency-restore', 'POST', { fileData: base64 });
        if (response.success) {
          alert('✅ بازگردانی دیتابیس و فایل‌ها با موفقیت انجام شد!\nنرم‌افزار مجدداً بارگذاری می‌شود.');
          window.location.reload();
        } else {
          setRestoreMessage('❌ خطا در بازگردانی فایل.');
          setIsRestoring(false);
        }
      } catch (err: any) {
        setRestoreMessage(`❌ خطا: ${err.message || 'عملیات با شکست مواجه شد'}`);
        setIsRestoring(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  useEffect(() => {
    try {
      const storedRole = localStorage.getItem('sayan_network_role') as 'Standalone' | 'Server' | 'Client';
      if (storedRole) setActiveRole(storedRole);
      
      const storedUrl = localStorage.getItem('sayan_remote_server_url');
      if (storedUrl) setServerUrl(storedUrl);

      const storedPort = localStorage.getItem('sayan_server_port');
      if (storedPort) setPort(parseInt(storedPort, 10));
    } catch {
      // LocalStorage fallback
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const testServerConnection = async () => {
    if (!serverUrl.trim()) {
      setConnectionStatus({ success: false, message: 'لطفاً آدرس سرور را وارد کنید' });
      return;
    }
    setTestingConnection(true);
    setConnectionStatus(null);
    try {
      const normalizedUrl = serverUrl.replace(/\/+$/, '');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const res = await fetch(`${normalizedUrl}/api/health`, {
        signal: controller.signal
      }).catch(() => null);
      clearTimeout(timeoutId);

      if (res && (res.ok || res.status === 200 || res.status === 404)) {
        setConnectionStatus({ success: true, message: 'ارتباط با سرور با موفقیت برقرار شد!' });
      } else {
        // Second test directly on root
        const resRoot = await fetch(normalizedUrl, { mode: 'no-cors' }).catch(() => null);
        if (resRoot) {
          setConnectionStatus({ success: true, message: 'سرور در دسترس است و پاسخ می‌دهد.' });
        } else {
          setConnectionStatus({ success: false, message: 'عدم پاسخگویی سرور در آدرس مشخص شده.' });
        }
      }
    } catch (e: any) {
      setConnectionStatus({ success: false, message: `خطا در برقراری اتصال: ${e.message || 'سرور یافت نشد'}` });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = () => {
    try {
      localStorage.setItem('sayan_network_role', activeRole);
      if (activeRole === 'Client') {
        const cleanUrl = serverUrl.replace(/\/+$/, '');
        localStorage.setItem('sayan_remote_server_url', cleanUrl);
        localStorage.setItem('sayan_active_api_url', cleanUrl);
      } else {
        localStorage.removeItem('sayan_active_api_url');
      }
      localStorage.setItem('sayan_server_port', port.toString());
      
      // Notify Tauri backend if running inside Tauri
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        (window as any).__TAURI__.invoke('save_client_config', {
          config: {
            role: activeRole,
            local_server_url: `http://localhost:${port}`,
            server_url: serverUrl,
            port: port,
            update_url: ''
          }
        }).catch(() => {});
      }

      setSavedSuccess(true);
      if (onRoleChanged) {
        onRoleChanged(activeRole, serverUrl);
      }
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1000);
    } catch (e) {
      console.error(e);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">انتخاب نقش سیستم و تنظیمات شبکه</h3>
              <p className="text-xs text-slate-400 mt-0.5">مشخص کنید این کامپیوتر به عنوان سرور، کلاینت یا مستقل کار کند</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1. Standalone */}
            <div 
              onClick={() => setActiveRole('Standalone')}
              className={`cursor-pointer p-4 rounded-xl border transition-all text-right flex flex-col justify-between ${
                activeRole === 'Standalone'
                  ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/5'
                  : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/70 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${activeRole === 'Standalone' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <Monitor className="w-5 h-5" />
                  </div>
                  {activeRole === 'Standalone' && (
                    <span className="text-[11px] font-bold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded-full border border-blue-500/30">
                      انتخاب شده
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-sm text-white mb-1">سیستم مستقل (Standalone)</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  نرم‌افزار ۱۰۰٪ آفلاین و محلی روی همین سیستم کار می‌کند. بدون نیاز به شبکه یا اینترنت.
                </p>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center gap-1.5 text-[11px] text-emerald-400">
                <Shield className="w-3.5 h-3.5" />
                <span>امنیت کامل و آفلاین</span>
              </div>
            </div>

            {/* 2. Server (Host) */}
            <div 
              onClick={() => setActiveRole('Server')}
              className={`cursor-pointer p-4 rounded-xl border transition-all text-right flex flex-col justify-between ${
                activeRole === 'Server'
                  ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/5'
                  : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/70 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${activeRole === 'Server' ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <HardDrive className="w-5 h-5" />
                  </div>
                  {activeRole === 'Server' && (
                    <span className="text-[11px] font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                      انتخاب شده
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-sm text-white mb-1">سرور میزبان (Host)</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  این سیستم به عنوان سرور اصلی شبکه محلی (LAN) عمل کرده و اطلاعات را با سایر دستگاه‌ها به اشتراک می‌گذارد.
                </p>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center gap-1.5 text-[11px] text-amber-400">
                <Globe className="w-3.5 h-3.5" />
                <span>اشتراک‌گذاری در شبکه محلی</span>
              </div>
            </div>

            {/* 3. Client */}
            <div 
              onClick={() => setActiveRole('Client')}
              className={`cursor-pointer p-4 rounded-xl border transition-all text-right flex flex-col justify-between ${
                activeRole === 'Client'
                  ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/5'
                  : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/70 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${activeRole === 'Client' ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <Wifi className="w-5 h-5" />
                  </div>
                  {activeRole === 'Client' && (
                    <span className="text-[11px] font-bold text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded-full border border-purple-500/30">
                      انتخاب شده
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-sm text-white mb-1">کلاینت (Client)</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  این سیستم به سرور اصلی دیگری در شبکه وصل شده و اطلاعات را از سرور مرکزی می‌خواند.
                </p>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center gap-1.5 text-[11px] text-purple-400">
                <Wifi className="w-3.5 h-3.5" />
                <span>اتصال به سرور مرکزی</span>
              </div>
            </div>
          </div>

          {/* Conditional Options */}
          {activeRole === 'Server' && (
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3 animate-fadeIn">
              <h5 className="text-xs font-bold text-amber-300 flex items-center gap-2">
                <Server className="w-4 h-4" />
                تنظیمات سرور محلی
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">پورت سرور (Port)</label>
                  <input 
                    type="number"
                    value={port}
                    onChange={(e) => setPort(parseInt(e.target.value, 10) || 8080)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    placeholder="8080"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <p className="text-[11px] text-slate-400 leading-normal">
                    سایر سیستم‌ها در شبکه می‌توانند با آدرس IP این کامپیوتر و پورت فوق به برنامه دسترسی داشته باشند.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeRole === 'Client' && (
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3 animate-fadeIn">
              <h5 className="text-xs font-bold text-purple-300 flex items-center gap-2">
                <Wifi className="w-4 h-4" />
                آدرس سرور میزبان جهت اتصال
              </h5>
              <div className="space-y-2">
                <label className="block text-xs text-slate-400">آدرس سرور (IP یا دامنه سرور با پورت):</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    dir="ltr"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 font-mono text-left"
                    placeholder="http://192.168.1.100:8080"
                  />
                  <button 
                    onClick={testServerConnection}
                    disabled={testingConnection}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    {testingConnection ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    تست اتصال
                  </button>
                </div>

                {connectionStatus && (
                  <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    connectionStatus.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {connectionStatus.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span>{connectionStatus.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Backup Restore Section */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h6 className="text-xs font-bold text-white flex items-center gap-2">
                    <span>بازیابی بکاپ و دیتابیس قبلی (اختیاری)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      پشتیبانی از ZIP و JSON
                    </span>
                  </h6>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    با انتخاب فایل پشتیبان، تمام اطلاعات قبلی، حواله‌ها، چت‌ها و فایل‌های آپلود شده جایگزین می‌شوند.
                  </p>
                </div>
              </div>

              <input 
                type="file" 
                ref={restoreFileRef} 
                className="hidden" 
                accept=".zip,.json,.txt" 
                onChange={handleModalBackupRestore}
              />

              <button
                type="button"
                onClick={() => restoreFileRef.current?.click()}
                disabled={isRestoring}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold shrink-0 transition-all shadow-md shadow-amber-500/10 flex items-center justify-center gap-2"
              >
                {isRestoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                {isRestoring ? 'در حال بازیابی...' : 'انتخاب فایل بکاپ (ZIP / JSON)'}
              </button>
            </div>

            {restoreMessage && (
              <p className="text-xs text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-center animate-fadeIn">
                {restoreMessage}
              </p>
            )}
          </div>

          {savedSuccess && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold text-center animate-fadeIn">
              ✅ تنظیمات با موفقیت ذخیره شد.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/50">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
          >
            انصراف
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            ذخیره و اعمال نقش
          </button>
        </div>
      </div>
    </div>
  );
};
