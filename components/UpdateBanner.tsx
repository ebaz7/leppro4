import React, { useState, useEffect } from 'react';
import { RefreshCw, X, ArrowUpCircle, DownloadCloud, CheckCircle2, Folder, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  AppVersionInfo, 
  applyApplicationUpdate, 
  isCapacitorAndroid, 
  openDirectUpdateLink,
  isDesktopUpdateFileReady,
  openDesktopUpdateFile,
  openDesktopUpdateFolder,
  markPlatformUpdateInstalled,
  dismissUpdate
} from '../services/updateService';
import { isTauriDesktop, isWebApp, isElectronDesktop, isTauriDesktopOnly } from '../utils/platformDetection';
import { getEffectiveApiUrl } from '../services/apiService';

interface UpdateBannerProps {
  updateInfo: AppVersionInfo | null;
  onDismiss?: () => void;
  className?: string;
  variant?: 'floating' | 'embedded';
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({
  updateInfo,
  onDismiss,
  className = '',
  variant = 'embedded'
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [downloadPct, setDownloadPct] = useState<number>(0);
  const [progressText, setProgressText] = useState<string>('');
  const [isLocalFileReady, setIsLocalFileReady] = useState(false);

  if (!updateInfo) return null;

  const isAndroid = isCapacitorAndroid();
  const isElectron = isElectronDesktop();
  const isTauri = isTauriDesktopOnly();
  const isDesktop = isTauriDesktop();
  const isWeb = isWebApp() && !isAndroid && !isDesktop;

  const targetVer = isAndroid
    ? (updateInfo.androidLatestVersion || updateInfo.version)
    : isElectron
      ? (updateInfo.electronLatestVersion || updateInfo.desktopLatestVersion || updateInfo.version)
      : isTauri
        ? (updateInfo.tauriLatestVersion || updateInfo.desktopLatestVersion || updateInfo.version)
        : (updateInfo.webVersion || updateInfo.version);

  const exeFileName = updateInfo.desktopFileName || (isElectron ? `dlkam-electron-setup-v${targetVer || 'latest'}.exe` : `dlkam-desktop-v${targetVer || 'latest'}.exe`);

  // Detect whether the desktop executable is already present in local app data
  useEffect(() => {
    let isMounted = true;
    const probeDesktopFile = async () => {
      if (!isDesktop || !targetVer) return;
      try {
        const ready = await isDesktopUpdateFileReady(exeFileName);
        if (isMounted && ready) {
          setIsLocalFileReady(true);
        }
      } catch (err) {
        console.debug('Probe local file notice:', err);
      }
    };
    probeDesktopFile();
    return () => { isMounted = false; };
  }, [isDesktop, targetVer, exeFileName]);

  let rawDownloadUrl = isAndroid
    ? (updateInfo.androidDownloadUrl || updateInfo.downloadUrl || `/api/downloads/latest-android?v=${encodeURIComponent(targetVer || 'latest')}`)
    : (updateInfo.downloadUrl || `/api/downloads/latest-desktop?v=${encodeURIComponent(targetVer || 'latest')}&ext=exe`);

  if (rawDownloadUrl && !rawDownloadUrl.startsWith('http://') && !rawDownloadUrl.startsWith('https://')) {
    rawDownloadUrl = getEffectiveApiUrl(rawDownloadUrl);
  }

  const handleDirectLinkClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!rawDownloadUrl) return;
    if (targetVer) {
      markPlatformUpdateInstalled(targetVer);
    }
    await openDirectUpdateLink(rawDownloadUrl);
    setTimeout(() => {
      onDismiss?.();
    }, 2000);
  };

  const handleOpenFolderClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await openDesktopUpdateFolder(exeFileName);
      toast.success('پوشه فایل نصبی در ویندوز باز شد');
    } catch (e) {
      console.warn('Open folder error:', e);
      toast.error('امکان باز کردن مستقیم پوشه در این نسخه ویندوز فراهم نشد');
    }
  };

  const handleUpdateClick = async () => {
    if (isUpdating) return;

    // Fast-path for desktop: if file was already downloaded, directly run and execute it immediately!
    if (isDesktop && isLocalFileReady) {
      setIsUpdating(true);
      setProgressText('در حال اجرای نصاب ویندوز...');
      try {
        await openDesktopUpdateFile(exeFileName);
        if (targetVer) {
          markPlatformUpdateInstalled(targetVer);
        }
        dismissUpdate(updateInfo);
        setIsSuccess(true);
        setIsUpdating(false);
        toast.success(`پنجره نصاب نسخه v${targetVer} اجرا شد ✓ مراحل نصب را در پنجره باز شده تکمیل نمایید.`, { duration: 6000 });
        setTimeout(() => {
          setIsSuccess(false);
          onDismiss?.();
        }, 2200);
        return;
      } catch (err) {
        console.warn('Execution error, opening folder fallback:', err);
        try {
          await openDesktopUpdateFolder(exeFileName);
          toast('پوشه فایل نصبی باز شد — لطفاً روی فایل نصبی کلیک نمایید.');
        } catch {}
        setIsUpdating(false);
        return;
      }
    }

    setIsUpdating(true);
    setDownloadPct(1);
    setProgressText(isWeb ? 'در حال تازه‌سازی...' : 'در حال اتصال به سرور...');
    try {
      await applyApplicationUpdate(
        { ...updateInfo, version: targetVer || updateInfo.version, downloadUrl: rawDownloadUrl, androidDownloadUrl: rawDownloadUrl },
        (pct, statusText) => {
          setDownloadPct(pct);
          if (statusText) setProgressText(statusText);
        }
      );
      if (isDesktop) {
        setIsLocalFileReady(true);
      }
      if (targetVer && (isDesktop || isAndroid)) {
        markPlatformUpdateInstalled(targetVer);
        dismissUpdate(updateInfo);
      }
      setIsSuccess(true);
      setIsUpdating(false);
      setTimeout(() => {
        setIsSuccess(false);
        if (isDesktop || isAndroid) {
          onDismiss?.();
        }
      }, 2500);
    } catch (e) {
      console.error('Update failed:', e);
      setIsUpdating(false);
    }
  };

  const titleText = isAndroid
    ? 'نسخه جدید اندروید آماده نصب'
    : isDesktop
      ? (isLocalFileReady ? 'فایل نصبی جدید آماده نصب است' : 'نسخه جدید ویندوز آماده نصب')
      : (updateInfo.title || 'نسخه جدید تحت‌وب آماده است');

  const fileNameText = isAndroid
    ? (updateInfo.androidFileName || `dlkam-android-v${targetVer}.apk`)
    : isDesktop
      ? (updateInfo.desktopFileName || `dlkam-desktop-v${targetVer}.exe`)
      : (updateInfo.buildNumber ? `بیلد ${updateInfo.buildNumber}` : `نسخه ${targetVer}`);

  const actionButtonText = isUpdating
    ? (isWeb ? 'در حال تازه‌سازی...' : isDesktop && isLocalFileReady ? 'در حال اجرای نصاب...' : `در حال دانلود (${downloadPct}%)`)
    : isSuccess
      ? (isWeb ? 'تازه‌سازی شد ✓' : isAndroid ? 'دانلود شد — نصب را بزنید ✓' : 'پنجره نصاب باز شد ✓')
      : (isWeb ? 'تازه‌سازی و به‌روزرسانی' : isDesktop && isLocalFileReady ? 'اجرا و نصب فایل آپدیت' : 'دانلود و نصب در برنامه');

  return (
    <div 
      className={`relative z-50 w-full transition-all duration-300 ${className}`}
      dir="rtl"
    >
      <div className="glass-panel rounded-2xl sm:rounded-3xl p-3 sm:p-3.5 flex flex-col gap-2 overflow-hidden backdrop-blur-xl border border-blue-200/60 dark:border-blue-900/60 shadow-md bg-white/85 dark:bg-zinc-900/85">
        <div className="flex items-center justify-between gap-3">
          {/* Right Section: Icon & Version Info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0 flex items-center justify-center">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                {isSuccess ? (
                  <CheckCircle2 size={20} className="text-white" />
                ) : isAndroid ? (
                  <DownloadCloud size={20} className="text-white" />
                ) : (
                  <ArrowUpCircle size={20} className="text-white" />
                )}
              </div>
              {!isSuccess && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight">
                  {titleText}
                </h3>
                {targetVer && (
                  <span className="text-[10px] sm:text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                    v{targetVer}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate">
                <span className="font-mono text-zinc-700 dark:text-zinc-300 font-bold" dir="ltr">
                  {isUpdating && progressText ? progressText : fileNameText}
                </span>
                {!isUpdating && (
                  <>
                    <span className="hidden xs:inline text-zinc-300 dark:text-zinc-600">•</span>
                    <span className="hidden xs:inline truncate text-blue-600 dark:text-blue-400 font-medium">
                      {updateInfo.releaseNotes || (isWeb ? 'ارتقای رابط کاربری و عملکرد سامانه تحت‌وب' : 'به‌روزرسانی فایل نصبی جدید')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Left Section: Action Buttons & Close */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isDesktop && isLocalFileReady && (
              <button
                type="button"
                onClick={handleOpenFolderClick}
                className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 sm:px-3 sm:py-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded-xl transition-all border border-amber-300/40 dark:border-amber-700/40 cursor-pointer"
                title="نمایش فایل نصبی در پوشه ویندوز (Explorer)"
              >
                <Folder size={14} className="text-amber-600 dark:text-amber-400" />
                <span className="hidden sm:inline">پوشه فایل</span>
              </button>
            )}

            {(isAndroid || isDesktop) && rawDownloadUrl && (
              <button
                type="button"
                onClick={handleDirectLinkClick}
                className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 sm:px-3 sm:py-2 bg-blue-100/70 hover:bg-blue-200/80 dark:bg-blue-900/40 dark:hover:bg-blue-800/60 text-blue-700 dark:text-blue-300 rounded-xl transition-all border border-blue-300/40 dark:border-blue-700/40 cursor-pointer"
                title="دانلود مستقیم از طریق مرورگر"
              >
                <DownloadCloud size={14} />
                <span>لینک مستقیم</span>
              </button>
            )}

            <button
              onClick={handleUpdateClick}
              disabled={isUpdating}
              className={`font-bold text-xs sm:text-sm px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl shadow-md transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95 ${
                isSuccess 
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20' 
                  : isDesktop && isLocalFileReady
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/25 ring-2 ring-emerald-400/30'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-blue-600/20'
              } disabled:opacity-75 disabled:cursor-not-allowed`}
            >
              {isUpdating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>{actionButtonText}</span>
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 size={15} />
                  <span>{actionButtonText}</span>
                </>
              ) : (
                <>
                  {isDesktop && isLocalFileReady ? (
                    <Play size={14} className="fill-current text-white" />
                  ) : isAndroid ? (
                    <DownloadCloud size={15} />
                  ) : (
                    <ArrowUpCircle size={15} className="hidden sm:inline" />
                  )}
                  <span>{actionButtonText}</span>
                </>
              )}
            </button>

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="بستن موقت اعلان"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Live Progress Bar during active download */}
        {isUpdating && !isWeb && (
          <div className="w-full pt-1">
            <div className="w-full h-2 bg-blue-100 dark:bg-blue-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-200 rounded-full"
                style={{ width: `${Math.max(4, downloadPct)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdateBanner;

