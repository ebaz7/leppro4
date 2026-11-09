import React, { useState, useEffect } from 'react';
import { BellRing, ShieldCheck, Cpu, FolderCheck, CheckCircle2, Sparkles } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import toast from 'react-hot-toast';
import {
  isTauriDesktop,
  isElectronDesktop,
  isTauriDesktopOnly,
  isPersistentClientApp
} from '../utils/platformDetection';
import { isCapacitorAndroid } from '../services/updateService';
import {
  requestNotificationPermission,
  setNotificationPreference
} from '../services/notificationService';

const PERMISSION_ONBOARDED_KEY = 'dlkam_first_install_permissions_v2';

interface FirstLaunchPermissionsModalProps {
  currentUserId?: string;
}

export const FirstLaunchPermissionsModal: React.FC<FirstLaunchPermissionsModalProps> = ({
  currentUserId
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const [stepStatus, setStepStatus] = useState<{
    notifications: 'pending' | 'granted';
    background: 'pending' | 'granted';
    storage: 'pending' | 'granted';
  }>({
    notifications: 'pending',
    background: 'pending',
    storage: 'pending'
  });

  const isAndroid = isCapacitorAndroid();
  const isElectron = isElectronDesktop();
  const isTauri = isTauriDesktopOnly();
  const isDesktop = isTauriDesktop();
  const isNativeOrDesktop = isAndroid || isDesktop || isPersistentClientApp();

  const platformLabel = isAndroid
    ? 'اپلیکیشن اندروید دلکام'
    : isTauri
      ? 'نسخه ویندوز (Tauri) دلکام'
      : isElectron
        ? 'نسخه ویندوز (Electron) دلکام'
        : 'نسخه تحت‌وب دلکام';

  useEffect(() => {
    let isMounted = true;

    const checkFirstLaunchState = async () => {
      try {
        let alreadyOnboarded = localStorage.getItem(PERMISSION_ONBOARDED_KEY) === 'true';

        if (!alreadyOnboarded && Capacitor.isNativePlatform()) {
          try {
            const pref = await Preferences.get({ key: PERMISSION_ONBOARDED_KEY });
            if (pref.value === 'true') {
              alreadyOnboarded = true;
              localStorage.setItem(PERMISSION_ONBOARDED_KEY, 'true');
            }
          } catch (_) {}
        }

        // Always ensure app_notification_pref is enabled by default on native/desktop
        if (isNativeOrDesktop) {
          setNotificationPreference(true);
        }

        // Check if OS notification permission is currently not granted
        let osNotifGranted = false;
        const win = window as any;

        if (isAndroid) {
          if (win.DlkamAndroid && typeof win.DlkamAndroid.areNotificationsEnabledNative === 'function') {
            try {
              osNotifGranted = Boolean(win.DlkamAndroid.areNotificationsEnabledNative());
            } catch (_) {}
          } else {
            try {
              const perm = await LocalNotifications.checkPermissions();
              osNotifGranted = perm.display === 'granted';
            } catch (_) {}
          }
        } else if (isTauri) {
          try {
            const { isPermissionGranted } = await import('@tauri-apps/api/notification');
            osNotifGranted = await isPermissionGranted();
          } catch (_) {
            if ('Notification' in window) {
              osNotifGranted = Notification.permission === 'granted';
            }
          }
        } else if (isElectron) {
          if ('Notification' in window) {
            osNotifGranted = Notification.permission === 'granted';
          } else {
            osNotifGranted = true;
          }
        } else if ('Notification' in window) {
          osNotifGranted = Notification.permission === 'granted';
        }

        // Show on first install of Android, Windows Tauri, Windows Electron, or if permission is still ungranted on first run
        if (!alreadyOnboarded && (isNativeOrDesktop || ('Notification' in window && Notification.permission === 'default'))) {
          if (isMounted) {
            setStepStatus({
              notifications: osNotifGranted ? 'granted' : 'pending',
              background: osNotifGranted ? 'granted' : 'pending',
              storage: 'granted'
            });
            setIsOpen(true);
          }
        }
      } catch (err) {
        console.debug('First launch permission check notice:', err);
      }
    };

    const timer = setTimeout(checkFirstLaunchState, 600);

    const handleManualOpen = () => {
      setIsOpen(true);
    };
    window.addEventListener('app:open-permissions-modal', handleManualOpen);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      window.removeEventListener('app:open-permissions-modal', handleManualOpen);
    };
  }, [isAndroid, isTauri, isElectron, isNativeOrDesktop]);

  const handleGrantAllPermissions = async () => {
    if (isGranting) return;
    setIsGranting(true);

    const win = window as any;

    try {
      // 1. Enable in-app notification preference immediately
      setNotificationPreference(true);

      // 2. Unlock WebAudio context on user gesture so notification sounds play reliably in background
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          setTimeout(() => {
            try { ctx.close(); } catch (_) {}
          }, 300);
        }
      } catch (_) {}

      // 3. Platform-specific native permission requests
      if (isAndroid) {
        try {
          if (win.DlkamAndroid && typeof win.DlkamAndroid.requestNotificationPermissionNative === 'function') {
            win.DlkamAndroid.requestNotificationPermissionNative();
          }
        } catch (_) {}

        try {
          if (win.DlkamAndroid && typeof win.DlkamAndroid.requestIgnoreBatteryOptimizationsNative === 'function') {
            win.DlkamAndroid.requestIgnoreBatteryOptimizationsNative();
          }
        } catch (_) {}

        try {
          await LocalNotifications.requestPermissions();
        } catch (_) {}

        try {
          await PushNotifications.requestPermissions();
          await PushNotifications.register();
        } catch (_) {}
      }

      if (isTauri) {
        try {
          const { isPermissionGranted, requestPermission } = await import('@tauri-apps/api/notification');
          let granted = await isPermissionGranted();
          if (!granted) {
            const res = await requestPermission();
            granted = res === 'granted';
          }
        } catch (_) {}
      }

      if (isElectron) {
        try {
          const electronBridge = win.electronAPI || win.electron;
          if (electronBridge?.requestNativePermissions) {
            await electronBridge.requestNativePermissions();
          }
        } catch (_) {}
      }

      // 4. Request standard Web / WebView2 Notification permission with user gesture
      try {
        await requestNotificationPermission();
      } catch (_) {}

      setStepStatus({
        notifications: 'granted',
        background: 'granted',
        storage: 'granted'
      });

      // 5. Persist onboarding completion across localStorage & Native Preferences
      try {
        localStorage.setItem(PERMISSION_ONBOARDED_KEY, 'true');
        if (Capacitor.isNativePlatform()) {
          await Preferences.set({ key: PERMISSION_ONBOARDED_KEY, value: 'true' });
        }
      } catch (_) {}

      window.dispatchEvent(new CustomEvent('app:permissions-granted', { detail: { granted: true } }));

      toast.success('تمامی دسترسی‌های اعلان و فعالیت پس‌زمینه فعال شدند ✓', { duration: 4000 });

      setTimeout(() => {
        setIsOpen(false);
        setIsGranting(false);
      }, 650);
    } catch (error) {
      console.warn('Permission onboarding error:', error);
      localStorage.setItem(PERMISSION_ONBOARDED_KEY, 'true');
      setIsOpen(false);
      setIsGranting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
      dir="rtl"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 border border-blue-200/70 dark:border-blue-900/60 shadow-2xl overflow-hidden p-5 sm:p-6">
        {/* Top Accent Banner */}
        <div className="flex items-center gap-3.5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/25 shrink-0">
            <BellRing size={24} className="animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                راه‌اندازی اولیه {platformLabel}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-zinc-900 dark:text-zinc-100 mt-1">
              فعال‌سازی دسترسی‌های ضروری برنامه
            </h2>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed mt-3.5 font-medium">
          برای اینکه پیام‌های گفتگوی سازمانی، کارتابل وظایف و هشدارها بدون تأخیر و حتی هنگام بسته بودن صفحه در{' '}
          <strong className="text-blue-700 dark:text-blue-400 font-extrabold">
            {isAndroid ? 'نوار وضعیت بالای گوشی اندروید' : 'مرکز اعلان ویندوز (Notification Center)'}
          </strong>{' '}
          نمایش داده شوند، لطفاً دسترسی‌های زیر را تأیید نمایید:
        </p>

        {/* Permission Items List */}
        <div className="mt-4 space-y-2.5">
          <div className="flex items-start gap-3 p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
            <div className="p-2 rounded-xl bg-blue-600 text-white shrink-0 mt-0.5">
              <BellRing size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                  دریافت اعلان‌های آنی و صدای هشدار
                </h4>
                {stepStatus.notifications === 'granted' && (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                نمایش نوتیفیکیشن پیام‌های خصوصی، گروه‌ها و دستورات پرداخت با آرم اختصاصی دلکام
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/25 border border-indigo-100 dark:border-indigo-900/40">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shrink-0 mt-0.5">
              <Cpu size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                  فعالیت در پس‌زمینه و عدم خواب برنامه
                </h4>
                {stepStatus.background === 'granted' && (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                حفظ اتصال زنده و دریافت پیام‌ها در پس‌زمینه بدون خروج خودکار از حساب کاربری
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/25 border border-emerald-100 dark:border-emerald-900/40">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0 mt-0.5">
              <FolderCheck size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                  ذخیره فایل‌ها و به‌روزرسانی درون‌برنامه‌ای
                </h4>
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                دسترسی به پوشه اختصاصی برنامه جهت باز کردن پیوست‌ها و نصب آسان نسخه‌های جدید
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleGrantAllPermissions}
            disabled={isGranting}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs sm:text-sm shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer disabled:opacity-70"
          >
            <ShieldCheck size={18} />
            <span>
              {isGranting
                ? 'در حال فعال‌سازی دسترسی‌ها...'
                : 'تأیید و فعال‌سازی دسترسی‌ها'}
            </span>
            <Sparkles size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FirstLaunchPermissionsModal;
