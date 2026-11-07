
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  BookOpen, LayoutDashboard, Search, PlusCircle, ListChecks, FileText, Inbox, Users, LogOut, 
  User as UserIcon, Settings, Bell, BellOff, MessageSquare, X, Check, Container, KeyRound, Save, 
  Upload, Camera, Download, Share, ChevronRight, Home, Send, BrainCircuit, Mic, StopCircle, Loader2, 
  Truck, ClipboardList, Package, Printer, CheckSquare, ShieldCheck, Shield, Phone, RefreshCw, 
  Smartphone, MonitorDown, BellRing, Smartphone as MobileIcon, Trash2, Menu, Edit3, Sun, Moon, 
  ShoppingCart, Wallet, Sparkles, Pin, PinOff, Zap,
  BadgePlus, Receipt, ArrowLeftRight, ArrowRight, ScrollText, ClipboardCheck, Warehouse, BarChart3, 
  CalendarDays, FolderArchive, Banknote, MessagesSquare, Globe, Boxes, Handshake, Headset, UserCog,
  FileCheck2, Link2, CheckCircle2, AlertCircle, Columns, Calculator, Monitor, Radio, Server
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, UserRole, AppNotification, SystemSettings } from '../types';
import { logout, hasPermission, getRolePermissions, updateUser } from '../services/authService';
import { signInWithGoogleWorkspace, logoutGoogleWorkspace, getGoogleAccessToken, isRunningInIframe, openInStandaloneTab } from '../services/googleWorkspaceService';
import { requestNotificationPermission, setNotificationPreference, isNotificationEnabledInApp, sendNotification } from '../services/notificationService';
import { getSettings, saveSettings, uploadFile } from '../services/storageService';
import { apiCall, resolveImageUrl } from '../services/apiService';
import { DEFAULT_MOBILE_NAV_ORDER } from '../constants';
import { Capacitor } from '@capacitor/core';
import { getAppNavItems } from '../utils/navigationItems';
import { safeLocalStorage } from '../utils/safeStorage';

interface LayoutProps {
  children: React.ReactNode;
  onBack: () => boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User;
  onLogout: () => void;
  notifications: AppNotification[];
  clearNotifications: () => void;
  markAllNotificationsAsRead?: () => void;
  onDeleteNotification?: (id: string) => void;
  onOpenNotification?: (notification: AppNotification) => void;
  onAddNotification: (title: string, message: string) => void;
  onRemoveNotification: (id: string) => void;
  financialYear?: string;
  setFinancialYear?: (y: string) => void;
  settings?: SystemSettings | null;
  theme: string;
  toggleTheme: () => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  unreadChatCount?: number;
  secondaryTab?: string | null;
  onOpenSplitView?: () => void;
  onCloseSecondaryTab?: () => void;
  onToggleCalculator?: () => void;
}

import { SearchModal } from './SearchModal';
import { UpdateBanner } from './UpdateBanner';
import { checkServerUpdate, dismissUpdate, AppVersionInfo } from '../services/updateService';

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  onBack, 
  activeTab, 
  setActiveTab, 
  currentUser, 
  onLogout, 
  notifications, 
  clearNotifications, 
  markAllNotificationsAsRead, 
  onDeleteNotification, 
  onOpenNotification,
  onAddNotification, 
  onRemoveNotification, 
  financialYear, 
  setFinancialYear, 
  settings: propSettings, 
  theme, 
  toggleTheme, 
  isDarkMode, 
  onToggleDarkMode, 
  unreadChatCount = 0,
  secondaryTab,
  onOpenSplitView,
  onCloseSecondaryTab,
  onToggleCalculator
}) => {
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [settings, setSettings] = useState<SystemSettings | null>(propSettings || null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [bgMode, setBgMode] = useState<string>(() => localStorage.getItem('app_bg_mode') || 'preset');
  const [bgPreset, setBgPreset] = useState<string>(() => localStorage.getItem('app_preset_bg') || 'aurora-light');
  const [customBgImage, setCustomBgImage] = useState<string | null>(() => localStorage.getItem('app_custom_bg_image'));
  const [customBgBlur, setCustomBgBlur] = useState<number>(() => {
    const saved = localStorage.getItem('app_custom_bg_blur');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [bgImageVersion, setBgImageVersion] = useState<number>(0);

  useEffect(() => {
    const handleBgChange = () => {
      setBgMode(localStorage.getItem('app_bg_mode') || 'preset');
      setBgPreset(localStorage.getItem('app_preset_bg') || 'aurora-light');
      setCustomBgImage(localStorage.getItem('app_custom_bg_image'));
      const savedBlur = localStorage.getItem('app_custom_bg_blur');
      setCustomBgBlur(savedBlur ? parseInt(savedBlur, 10) : 0);
      setBgImageVersion(v => v + 1);
    };
    window.addEventListener('APP_THEME_BG_CHANGED', handleBgChange);
    return () => window.removeEventListener('APP_THEME_BG_CHANGED', handleBgChange);
  }, []);

  const getRoleDisplayName = (role: string) => {
    if (!role) return '';
    if (settings?.customRoleNames && settings.customRoleNames[role]) {
      return settings.customRoleNames[role];
    }
    if (settings?.customRoles) {
      const customRole = settings.customRoles.find((r: any) => r.id === role || r.name === role);
      if (customRole) {
        return settings?.customRoleNames?.[customRole.id] || customRole.label || customRole.name;
      }
    }
    const builtInTranslations: Record<string, string> = {
      'admin': 'مدیر سیستم',
      'ceo': 'مدیر عامل',
      'financial': 'مالی',
      'manager': 'مدیر بخش',
      'sales_manager': 'مدیر فروش',
      'factory_manager': 'مدیر کارخانه',
      'warehouse_keeper': 'انباردار',
      'security_head': 'رئیس انتظامات',
      'security_guard': 'نگهبان انتظامات',
      'commercial': 'بازرگانی',
      'qc': 'کنترل کیفیت',
      'user': 'کاربر'
    };
    if (builtInTranslations[role.toLowerCase()]) {
      return builtInTranslations[role.toLowerCase()];
    }
    return role;
  };

  const getUserAllRolesDisplayName = (user: any) => {
    if (!user) return '';
    const rolesList = user?.roles && user.roles.length > 0 ? user.roles : (user?.role ? [user.role] : []);
    if (rolesList.length === 0) return 'کاربر';
    return rolesList.map((r: string) => getRoleDisplayName(r)).join(' / ');
  };

  useEffect(() => {
    const root = document.documentElement;
    
    // Remove old background-related classes
    root.classList.remove(
      'has-custom-bg', 
      'has-preset-bg-cosmic-dark', 
      'has-preset-bg-aurora-light', 
      'has-preset-bg-cyan-cosmic', 
      'has-preset-bg-dark-midnight', 
      'has-preset-bg-light-modern'
    );
    
    // Check if background image should be enabled
    const savedBgOverride = localStorage.getItem('app_enable_bg_image');
    const isBgActive = savedBgOverride === 'true' || (savedBgOverride !== 'false' && theme === 'light-aurora');

    if (isBgActive) {
      if (bgMode === 'custom' && customBgImage) {
        root.classList.add('has-custom-bg');
      } else if (bgMode === 'preset') {
        root.classList.add(`has-preset-bg-${bgPreset || 'aurora-light'}`);
      }
    }
  }, [bgMode, bgPreset, customBgImage, theme, bgImageVersion]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            setIsSearchOpen(true);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const scrollContainer = document.getElementById('main-scroll-container');
    if (scrollContainer && !secondaryTab) {
      scrollContainer.scrollTop = 0;
    }
    const primarySplitScroll = document.getElementById('split-pane-primary-scroll');
    if (primarySplitScroll) {
      primarySplitScroll.scrollTop = 0;
    }
  }, [activeTab, secondaryTab]);

  useEffect(() => {
    const secondarySplitScroll = document.getElementById('split-pane-secondary-scroll');
    if (secondarySplitScroll) {
      secondarySplitScroll.scrollTop = 0;
    }
  }, [secondaryTab]);

  useEffect(() => {
    const handleGlobalClose = () => {
        setShowNotifDropdown(false);
        setShowMobileMenu(false);
        setShowProfileModal(false);
        setShowIOSPrompt(false);
    };
    window.addEventListener('CLOSE_ACTIVE_MODALS', handleGlobalClose);
    return () => window.removeEventListener('CLOSE_ACTIVE_MODALS', handleGlobalClose);
  }, []);

  useEffect(() => {
    if (propSettings) {
        setSettings(propSettings);
        if (propSettings.customBgImage !== undefined) {
            setCustomBgImage(propSettings.customBgImage || null);
            if (propSettings.customBgImage) {
                localStorage.setItem('app_custom_bg_image', propSettings.customBgImage);
            } else {
                localStorage.removeItem('app_custom_bg_image');
            }
        }
        if (propSettings.bgMode) {
            setBgMode(propSettings.bgMode);
            localStorage.setItem('app_bg_mode', propSettings.bgMode);
        }
        if (propSettings.bgPreset) {
            setBgPreset(propSettings.bgPreset);
            localStorage.setItem('app_preset_bg', propSettings.bgPreset);
        }
        if (propSettings.customBgBlur !== undefined) {
            setCustomBgBlur(propSettings.customBgBlur);
            localStorage.setItem('app_custom_bg_blur', propSettings.customBgBlur.toString());
        }
    }
  }, [propSettings]);
  const isSecure = window.isSecureContext;
  const notifRef = useRef<HTMLDivElement>(null);
  const mobileNotifRef = useRef<HTMLDivElement>(null);
  const [notifOrigin, setNotifOrigin] = useState<'sidebar' | 'header'>('sidebar');
  
  // Mobile Drawer State
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [mobileMenuSearch, setMobileMenuSearch] = useState('');
  const [mobileMenuCategory, setMobileMenuCategory] = useState<'all' | 'finance' | 'warehouse' | 'sales' | 'admin'>('all');
  const isNativeAndroid = useMemo(() => Capacitor.isNativePlatform(), []);
  // Desktop Sidebar State: Collapsed by default, opens on mouse hover, can be pinned permanently
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(() => {
    return localStorage.getItem('app_sidebar_pinned') === 'true';
  });
  const [isSidebarHovered, setIsSidebarHovered] = useState<boolean>(false);
  const isSidebarOpen = isSidebarPinned || isSidebarHovered;

  const toggleSidebarPin = () => {
    setIsSidebarPinned(prev => {
      const next = !prev;
      localStorage.setItem('app_sidebar_pinned', String(next));
      return next;
    });
  };

  // PWA & Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  // Profile/Password Modal State
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Dynamic Modal Detection to Hide Bottom Nav (Throttled & Non-blocking)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasBackAction, setHasBackAction] = useState(false);

  // Ultra-Fast / Low-Spec Mode State (حالت سیستم‌های ضعیف / حذف کامل لگ)
  const [lowSpecMode, setLowSpecMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('app_low_spec_mode');
    if (saved !== null) return saved === 'true';
    if (typeof navigator !== 'undefined') {
      const cores = navigator.hardwareConcurrency || 4;
      const mem = (navigator as any).deviceMemory || 4;
      return cores <= 4 || mem <= 4;
    }
    return false;
  });

  const toggleLowSpecMode = () => {
    setLowSpecMode(prev => {
      const next = !prev;
      safeLocalStorage.setItem('app_low_spec_mode', String(next));
      if (next) {
        document.documentElement.classList.add('low-spec-mode');
      } else {
        document.documentElement.classList.remove('low-spec-mode');
      }
      window.dispatchEvent(new CustomEvent('APP_LOW_SPEC_MODE_CHANGED', { detail: next }));
      return next;
    });
  };

  // AI Copilot & AI Options Global/Local Toggle State (فعال و غیرفعال کردن هوش مصنوعی در اندروید، وب‌اپ و ویندوز)
  const [aiCopilotEnabled, setAiCopilotEnabled] = useState<boolean>(() => {
    const saved = safeLocalStorage.getItem('app_ai_copilot_enabled');
    if (saved !== null) return saved !== 'false';
    return true;
  });

  const toggleAiCopilot = () => {
    setAiCopilotEnabled(prev => {
      const next = !prev;
      try {
        safeLocalStorage.setItem('app_ai_copilot_enabled', String(next));
      } catch (err) {
        console.warn('Could not save ai toggle to local storage:', err);
      }
      if (!next) {
        document.documentElement.classList.add('ai-features-disabled');
      } else {
        document.documentElement.classList.remove('ai-features-disabled');
      }
      window.dispatchEvent(new CustomEvent('APP_AI_COPILOT_CHANGED', { detail: next }));
      return next;
    });
  };

  useEffect(() => {
    if (settings && (settings.enableAiWidget === false || settings.botAiEnabled === false)) {
      if (localStorage.getItem('app_ai_copilot_enabled') === null) {
        setAiCopilotEnabled(false);
        document.documentElement.classList.add('ai-features-disabled');
        window.dispatchEvent(new CustomEvent('APP_AI_COPILOT_CHANGED', { detail: false }));
      }
    }
  }, [settings?.enableAiWidget, settings?.botAiEnabled]);

  useEffect(() => {
    if (!aiCopilotEnabled) {
      document.documentElement.classList.add('ai-features-disabled');
    } else {
      document.documentElement.classList.remove('ai-features-disabled');
    }
    const syncAiState = (e: any) => {
      const enabled = typeof e.detail === 'boolean' ? e.detail : localStorage.getItem('app_ai_copilot_enabled') !== 'false';
      setAiCopilotEnabled(enabled);
    };
    window.addEventListener('APP_AI_COPILOT_CHANGED', syncAiState);
    return () => window.removeEventListener('APP_AI_COPILOT_CHANGED', syncAiState);
  }, [aiCopilotEnabled]);

  useEffect(() => {
    if (lowSpecMode) {
      document.documentElement.classList.add('low-spec-mode');
    } else {
      document.documentElement.classList.remove('low-spec-mode');
    }
    const handleLowSpecChange = (e: any) => {
      const val = e.detail !== undefined ? e.detail : localStorage.getItem('app_low_spec_mode') === 'true';
      setLowSpecMode(val);
      if (val) {
        document.documentElement.classList.add('low-spec-mode');
      } else {
        document.documentElement.classList.remove('low-spec-mode');
      }
    };
    window.addEventListener('APP_LOW_SPEC_MODE_CHANGED', handleLowSpecChange);
    return () => window.removeEventListener('APP_LOW_SPEC_MODE_CHANGED', handleLowSpecChange);
  }, [lowSpecMode]);

  useEffect(() => {
    let timeoutId: any = null;
    const checkModal = () => {
      // Check for any active modal/dialog backdrops without layout thrashing
      const modals = document.querySelectorAll('.fixed.inset-0:not(.pointer-events-none), [role="dialog"], .modal-active');
      let visible = false;
      for (let i = 0; i < modals.length; i++) {
        const el = modals[i] as HTMLElement;
        if (!el.classList.contains('bottom-nav-bar') && !el.classList.contains('bg-blobs')) {
          if (!el.classList.contains('hidden') && el.style.display !== 'none' && (el.offsetWidth > 0 || el.offsetHeight > 0)) {
            visible = true;
            break;
          }
        }
      }
      setIsModalOpen(visible);
    };
    
    checkModal();
    const debouncedCheck = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(checkModal, 250);
    };

    const observer = new MutationObserver(debouncedCheck);
    observer.observe(document.body, { childList: true, subtree: false });
    
    const handleRegister = () => setHasBackAction(true);
    const handleUnregister = () => setHasBackAction(false);
    window.addEventListener('REGISTER_BACK_ACTION', handleRegister);
    window.addEventListener('UNREGISTER_BACK_ACTION', handleUnregister);
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      observer.disconnect();
      window.removeEventListener('REGISTER_BACK_ACTION', handleRegister);
      window.removeEventListener('UNREGISTER_BACK_ACTION', handleUnregister);
    };
  }, []);

  // Local Profile Form State
  const [profileForm, setProfileForm] = useState<{
      password?: string;
      confirmPassword?: string;
      telegramChatId: string;
      phoneNumber: string;
      receiveNotifications: boolean;
      mobileNavOrder: string[];
  }>({
      password: '',
      confirmPassword: '',
      telegramChatId: '',
      phoneNumber: '',
      receiveNotifications: true,
      mobileNavOrder: []
  });

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Google Account Linking State
  const [googleLinkingStatus, setGoogleLinkingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [googleLinkedEmail, setGoogleLinkedEmail] = useState<string>(currentUser?.googleLinkedEmail || '');
  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    const syncGoogleState = () => {
      setGoogleLinkedEmail(currentUser?.googleLinkedEmail || '');
      setGoogleError(null);
      getGoogleAccessToken(currentUser?.id).then(token => {
        if (!token && !currentUser?.googleLinkedEmail) {
          setGoogleLinkedEmail('');
        }
      });
    };

    syncGoogleState();

    const handleAuthSync = (e: any) => {
      if (e?.detail?.userId && currentUser?.id && String(e.detail.userId) !== String(currentUser.id)) {
        return; // Ignore events from other users
      }
      if (e?.detail?.action === 'logout') {
        setGoogleLinkedEmail('');
      } else {
        syncGoogleState();
      }
    };

    const handleUserUpdate = (e: any) => {
      if (e?.detail?.googleLinkedEmail !== undefined) {
        setGoogleLinkedEmail(e.detail.googleLinkedEmail);
      }
    };

    window.addEventListener('google-auth-sync', handleAuthSync);
    window.addEventListener('current-user-updated', handleUserUpdate);
    return () => {
      window.removeEventListener('google-auth-sync', handleAuthSync);
      window.removeEventListener('current-user-updated', handleUserUpdate);
    };
  }, [showProfileModal, currentUser]);

  const handleLinkGoogleAccount = async () => {
    setGoogleLinkingStatus('loading');
    setGoogleError(null);
    try {
      const res = await signInWithGoogleWorkspace(currentUser?.id);
      if (res?.user && res.accessToken) {
        const email = res.user.email || 'حساب متصل گوگل';
        setGoogleLinkedEmail(email);
        setGoogleLinkingStatus('success');
        await updateUser({
          ...currentUser,
          googleLinkedEmail: email,
          googleLinkedAt: Date.now()
        });
        setTimeout(() => setGoogleLinkingStatus('idle'), 3000);
      }
    } catch (err: any) {
      console.error('Failed to link google account:', err);
      setGoogleError(err?.message || 'خطا در ارتباط با حساب گوگل');
      setGoogleLinkingStatus('error');
    }
  };

  const handleUnlinkGoogleAccount = async () => {
    if (!confirm('آیا از قطع اتصال حساب گوگل اطمینان دارید؟')) return;
    setGoogleLinkingStatus('loading');
    try {
      await logoutGoogleWorkspace(currentUser?.id);
      setGoogleLinkedEmail('');
      await updateUser({
        ...currentUser,
        googleLinkedEmail: '',
        googleLinkedAt: undefined
      });
      setGoogleLinkingStatus('idle');
    } catch (err: any) {
      console.error('Failed to unlink google account:', err);
      setGoogleError('خطا در قطع اتصال حساب گوگل');
      setGoogleLinkingStatus('error');
    }
  };

  const prevShowDropdown = useRef(showNotifDropdown);
  useEffect(() => {
      if (prevShowDropdown.current && !showNotifDropdown) {
          if (clearNotifications && notifications.length > 0) {
              clearNotifications();
          }
      }
      prevShowDropdown.current = showNotifDropdown;
  }, [showNotifDropdown, clearNotifications, notifications]);

  useEffect(() => {
    if (showProfileModal && currentUser) {
        setProfileForm({
            password: '',
            confirmPassword: '',
            telegramChatId: currentUser.telegramChatId || '',
            phoneNumber: currentUser.phoneNumber || '',
            receiveNotifications: currentUser.receiveNotifications !== false,
            mobileNavOrder: currentUser.mobileNavOrder || []
        });
    }
  }, [showProfileModal, currentUser]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
        setNotifEnabled(isNotificationEnabledInApp());
    } else {
        try {
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && isNotificationEnabledInApp()) {
                setNotifEnabled(true);
            } else {
                setNotifEnabled(false);
            }
        } catch(e) {
            console.warn("Notification API not supported or blocked");
            setNotifEnabled(false);
        }
    }
  }, []);

  // Update Detection State
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isUpdateDismissed, setIsUpdateDismissed] = useState(false);

  const checkVersion = async () => {
    try {
      const updateResult = await checkServerUpdate();
      if (updateResult.hasUpdate && updateResult.serverInfo) {
        setUpdateInfo(updateResult.serverInfo);
        setIsUpdateAvailable(true);
        setIsUpdateDismissed(false);
      } else {
        setIsUpdateAvailable(false);
      }
    } catch (e) {
      console.debug('Version check error', e);
    }
  };

  useEffect(() => {
    const autoCheckEnabled = settings?.desktopAutoCheckUpdates !== false;
    const configuredMinutes = Math.max(1, Number(settings?.desktopUpdateIntervalMinutes) || 60);
    const intervalMs = configuredMinutes * 60 * 1000;

    if (autoCheckEnabled) {
      checkVersion();
    }

    // Check for updates in background based on configurable interval in settings (in minutes)
    const interval = setInterval(checkVersion, intervalMs);

    const handleUpdatePublished = (e: any) => {
      if (e?.detail) {
        setUpdateInfo(e.detail);
        setIsUpdateAvailable(true);
        setIsUpdateDismissed(false);
      } else {
        checkVersion();
      }
    };
    const handleSettingsChanged = () => {
      checkVersion();
    };
    window.addEventListener('app:update-published', handleUpdatePublished);
    window.addEventListener('app:update-settings-changed', handleSettingsChanged);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        checkVersion();
      });
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('app:update-published', handleUpdatePublished);
      window.removeEventListener('app:update-settings-changed', handleSettingsChanged);
    };
  }, [settings?.desktopUpdateIntervalMinutes, settings?.desktopAutoCheckUpdates]);

  // Global mouse wheel forwarding ONLY when wheel occurs on outer non-scrollable margins outside main-scroll-container and outside split-view
  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      if (secondaryTab) return;
      const scrollContainer = document.getElementById('main-scroll-container');
      if (!scrollContainer || scrollContainer.classList.contains('split-view-no-scroll')) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // If the cursor is already inside main-scroll-container, sidebar, or a modal/dialog/split-pane, let the browser's native wheel scrolling work untouched
      if (
        scrollContainer.contains(target) ||
        target.closest('aside, [role="dialog"], .fixed, [data-split-pane-scroll]')
      ) {
        return;
      }

      scrollContainer.scrollTop += e.deltaY;
    };

    window.addEventListener('wheel', handleGlobalWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleGlobalWheel);
    };
  }, [secondaryTab]);

  useEffect(() => {
    getSettings().then(data => {
        setSettings(data);
        if (data.appName) {
            document.title = data.appName;
        }
        if (data.pwaIcon) {
            const timestamp = Date.now();
            const iconUrl = data.pwaIcon.includes('?') ? `${data.pwaIcon}&t=${timestamp}` : `${data.pwaIcon}?t=${timestamp}`;
            
            // Update Apple Icon
            const appleLink = document.querySelector("link[rel*='apple-touch-icon']") as HTMLLinkElement;
            if (appleLink) { appleLink.href = iconUrl; } else { const newLink = document.createElement('link'); newLink.rel = 'apple-touch-icon'; newLink.href = iconUrl; document.head.appendChild(newLink); }
            
            // Update Shortcut Icon
            const iconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
            if (iconLink) { iconLink.href = iconUrl; } else { const newLink = document.createElement('link'); newLink.rel = 'shortcut icon'; newLink.href = iconUrl; document.head.appendChild(newLink); }
        }
    });
    
    const handleClickOutside = (event: MouseEvent) => { 
        const target = event.target as Element;
        if (showNotifDropdown && !target.closest('.notification-dropdown-container') && !target.closest('.notification-trigger')) {
            setShowNotifDropdown(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    
    window.addEventListener('beforeinstallprompt', (e) => { 
        e.preventDefault(); 
        setDeferredPrompt(e); 
    });

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    try {
        const isInStandaloneMode = ('standalone' in window.navigator) && (window.navigator as any).standalone;
        const isDisplayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
        setIsStandalone(isInStandaloneMode || isDisplayModeStandalone);
    } catch(e) {
        setIsStandalone(false);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotifDropdown]);

  const handleLogout = () => { logout(); onLogout(); };
  
  const handleToggleNotif = async () => { 
      if (!Capacitor.isNativePlatform()) {
          if (typeof window === 'undefined' || !('Notification' in window)) {
              alert("این دستگاه/مرورگر از اعلان‌های وب پشتیبانی نمی‌کند.");
              return;
          }

          if (!isSecure && window.location.hostname !== 'localhost') { 
              alert("⚠️ مرورگرها اجازه فعال‌سازی نوتیفیکیشن در شبکه غیرامن (HTTP) را نمی‌دهند."); 
              return; 
          } 
      }
      
      if (notifEnabled) { 
          setNotifEnabled(false); 
          setNotificationPreference(false); 
          return;
      } 

      try {
          const granted = await requestNotificationPermission(); 
          if (granted) { 
              setNotifEnabled(true); 
              setNotificationPreference(true); 
              onAddNotification("سیستم دستور پرداخت", "نوتیفیکیشن‌ها با موفقیت فعال شدند."); 
          } else {
              setNotifEnabled(false);
              if (!Capacitor.isNativePlatform()) {
                  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
                      alert("دسترسی به نوتیفیکیشن توسط شما مسدود شده است.");
                  } else {
                      alert("امکان فعال‌سازی وجود ندارد یا توسط مرورگر پشتیبانی نمی‌شود.");
                  }
              }
          } 
      } catch (err) {
          console.error("Notification toggle error:", err);
          if(!Capacitor.isNativePlatform()) alert("خطا در فعال‌سازی نوتیفیکیشن");
      }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => { 
      e.preventDefault(); 
      const updates: Partial<User> = {}; 
      if (profileForm.password) { 
          if (profileForm.password !== profileForm.confirmPassword) { alert('رمز عبور و تکرار آن مطابقت ندارند.'); return; } 
          if (profileForm.password.length < 4) { alert('رمز عبور باید حداقل ۴ کاراکتر باشد.'); return; } 
          updates.password = profileForm.password; 
      } 
      updates.telegramChatId = profileForm.telegramChatId;
      updates.phoneNumber = profileForm.phoneNumber;
      updates.receiveNotifications = profileForm.receiveNotifications;
      updates.mobileNavOrder = profileForm.mobileNavOrder;
      try { await updateUser({ ...currentUser, ...updates }); alert('اطلاعات با موفقیت بروزرسانی شد.'); setProfileForm(prev => ({...prev, password: '', confirmPassword: ''})); setShowProfileModal(false); window.location.reload(); } catch (err) { alert('خطا در بروزرسانی اطلاعات'); } 
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => { 
      const file = e.target.files?.[0]; if (!file) return; 
      setUploadingAvatar(true); 
      const reader = new FileReader(); 
      reader.onload = async (ev) => { 
          const base64 = ev.target?.result as string; 
          try { const result = await uploadFile(file.name, base64); await updateUser({ ...currentUser, avatar: result.url }); window.location.reload(); } catch (error) { alert('خطا در آپلود تصویر'); } finally { setUploadingAvatar(false); } 
      }; 
      reader.readAsDataURL(file); 
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  
  // Calculate Permissions (Single source of truth via getAppNavItems)
  const navItems = useMemo(() => {
    return getAppNavItems(currentUser, settings);
  }, [currentUser, settings]);

  const canSeeNotifications = true;

  // Dynamic Navigation Logic Memoized
  const { sortedItems, bottomVisibleItems, menuItems } = useMemo(() => {
    const mobileNavOrder_val = currentUser.mobileNavOrder || settings?.mobileNavOrder || DEFAULT_MOBILE_NAV_ORDER;
    const sorted = [...navItems].sort((a, b) => {
        const idxA = mobileNavOrder_val.indexOf(a.id);
        const idxB = mobileNavOrder_val.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });
    return {
      sortedItems: sorted,
      bottomVisibleItems: sorted.slice(0, 4),
      menuItems: sorted.slice(4)
    };
  }, [navItems, currentUser.mobileNavOrder, settings?.mobileNavOrder]);

  const isBottomBarVisible = !showMobileMenu && !isModalOpen && !hasBackAction && activeTab !== 'chat';

  const getItemCategory = (id: string): 'finance' | 'warehouse' | 'sales' | 'admin' => {
    if (['create', 'manage', 'ccti', 'cheque-receipts', 'balances'].includes(id)) return 'finance';
    if (['create-exit', 'manage-exit', 'warehouse', 'security', 'meetings', 'purchase'].includes(id)) return 'warehouse';
    if (['sayan', 'sayan-operations', 'manage-invoices', 'trade', 'products', 'sales'].includes(id)) return 'sales';
    return 'admin';
  };

  const filteredMobileMenuItems = useMemo(() => {
    const q = mobileMenuSearch.trim().toLowerCase();
    return sortedItems.filter((item) => {
      const matchesSearch = !q || item.label.toLowerCase().includes(q) || (item.desc && item.desc.toLowerCase().includes(q));
      const matchesCat = mobileMenuCategory === 'all' || getItemCategory(item.id) === mobileMenuCategory;
      return matchesSearch && matchesCat;
    });
  }, [sortedItems, mobileMenuSearch, mobileMenuCategory]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('BOTTOM_NAV_VISIBLE', { detail: isBottomBarVisible }));
  }, [isBottomBarVisible]);

  const NotificationDropdown = () => {
    const [filterTab, setFilterTab] = useState<'all' | 'unread'>('all');
    const safeNotifications = useMemo(() => Array.isArray(notifications) ? notifications : [], [notifications]);
    
    const unreadCountLocal = useMemo(() => safeNotifications.filter(n => !n.read).length, [safeNotifications]);
    
    const displayedNotifications = useMemo(() => {
      if (filterTab === 'unread') {
        return safeNotifications.filter(n => !n.read);
      }
      return safeNotifications;
    }, [safeNotifications, filterTab]);

    const formatTimeAgo = (ts: number | string | undefined) => {
      if (!ts) return '';
      const timeNum = typeof ts === 'string' ? new Date(ts).getTime() : ts;
      if (isNaN(timeNum)) return '';
      const diffMs = Date.now() - timeNum;
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'همین الان';
      if (diffMin < 60) return `${diffMin} دقیقه پیش`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `${diffHours} ساعت پیش`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'دیروز';
      if (diffDays < 7) return `${diffDays} روز پیش`;
      try {
        return new Date(timeNum).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    };

    const getCategoryMeta = (n: AppNotification) => {
      const text = `${n.title || ''} ${n.message || ''} ${n.url || ''}`.toLowerCase();
      if (text.includes('تسک') || text.includes('task') || text.includes('یادآور')) {
        return {
          icon: CheckSquare,
          badgeText: 'وظیفه / تسک',
          badgeClass: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40',
          iconColor: 'text-purple-600 dark:text-purple-400'
        };
      }
      if (text.includes('خروج') || text.includes('مجوز') || text.includes('حواله') || text.includes('exit')) {
        return {
          icon: Truck,
          badgeText: 'حواله خروج',
          badgeClass: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40',
          iconColor: 'text-emerald-600 dark:text-emerald-400'
        };
      }
      if (text.includes('پرداخت') || text.includes('واریز') || text.includes('دستور') || text.includes('order')) {
        return {
          icon: Receipt,
          badgeText: 'دستور پرداخت',
          badgeClass: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40',
          iconColor: 'text-amber-600 dark:text-amber-400'
        };
      }
      if (text.includes('چک') || text.includes('صیاد') || text.includes('رسید')) {
        return {
          icon: FileCheck2,
          badgeText: 'چک صیادی',
          badgeClass: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/40',
          iconColor: 'text-cyan-600 dark:text-cyan-400'
        };
      }
      if (text.includes('پیام') || text.includes('chat') || text.includes('گفتگو')) {
        return {
          icon: MessageSquare,
          badgeText: 'پیام گفتگو',
          badgeClass: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40',
          iconColor: 'text-blue-600 dark:text-blue-400'
        };
      }
      if (text.includes('نامه') || text.includes('دبیرخانه')) {
        return {
          icon: FileText,
          badgeText: 'دبیرخانه',
          badgeClass: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40',
          iconColor: 'text-indigo-600 dark:text-indigo-400'
        };
      }
      if (text.includes('انبار') || text.includes('کالا') || text.includes('warehouse')) {
        return {
          icon: Package,
          badgeText: 'انبارداری',
          badgeClass: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800/40',
          iconColor: 'text-orange-600 dark:text-orange-400'
        };
      }
      return {
        icon: Bell,
        badgeText: 'اعلان سیستم',
        badgeClass: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700',
        iconColor: 'text-zinc-500 dark:text-zinc-400'
      };
    };

    const handleItemClick = (n: AppNotification) => {
      setShowNotifDropdown(false);
      if (showMobileMenu) setShowMobileMenu(false);

      if (onOpenNotification) {
        onOpenNotification(n);
      } else {
        if (onDeleteNotification) {
          onDeleteNotification(n.id);
        } else {
          onRemoveNotification(n.id);
        }
        if (n.url) {
          const clean = n.url.replace(/^\/+/, '');
          const [baseTab] = clean.split('?');
          if (baseTab) {
            setActiveTab(baseTab);
          }
        }
      }
    };

    return createPortal(
      <div className="fixed inset-0 z-[999999] pointer-events-none" dir="rtl">
        {/* Backdrop for click outside */}
        <div 
          className="fixed inset-0 bg-black/25 dark:bg-black/50 backdrop-blur-[1px] md:bg-transparent pointer-events-auto transition-opacity"
          onClick={() => setShowNotifDropdown(false)}
        />

        {/* Floating Notification Center Panel */}
        <div 
          role="dialog" 
          aria-label="مرکز اعلان‌ها" 
          className={`notification-dropdown-container pointer-events-auto fixed ${
            notifOrigin === 'header' 
              ? 'top-16 inset-x-3 sm:inset-x-auto sm:left-4 sm:w-[410px] max-h-[calc(100vh-80px)]' 
              : 'bottom-16 md:bottom-20 right-3 sm:right-6 md:right-[296px] w-[calc(100vw-24px)] sm:w-[410px] max-h-[calc(100vh-120px)]'
          } bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-[1000000] text-zinc-800 dark:text-zinc-100 backdrop-blur-2xl transition-all`}
          style={{
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.08)'
          }}
        >
          {/* Header */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <Bell size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-100">مرکز اعلان‌ها</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold">
                    {safeNotifications.length} اعلان
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">مدیریت هشدارهای کاربری، وظایف و پیام‌ها</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setShowNotifDropdown(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
                title="بستن پنجره"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* System Push Status Banner */}
          <div className="px-3.5 py-2 bg-blue-50/70 dark:bg-blue-950/30 border-b border-blue-100/70 dark:border-blue-900/40 flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-2">
              {notifEnabled ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              )}
              <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                {notifEnabled ? 'دریافت اعلان‌های سیستم فعال است' : 'اعلان‌های مرورگر غیرفعال است'}
              </span>
            </div>
            <button 
              onClick={handleToggleNotif}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                notifEnabled 
                  ? 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100' 
                  : 'bg-red-500 hover:bg-red-600 text-white shadow-sm'
              }`}
            >
              {notifEnabled ? 'تست ارسال' : 'فعال‌سازی'}
            </button>
          </div>

          {/* Filter Tabs & Quick Actions */}
          <div className="px-3 pt-2 pb-1.5 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  filterTab === 'all'
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                همه ({safeNotifications.length})
              </button>
              <button
                onClick={() => setFilterTab('unread')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  filterTab === 'unread'
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                خوانده‌نشده ({unreadCountLocal})
              </button>
            </div>

            {safeNotifications.length > 0 && (
              <div className="flex items-center gap-1">
                {unreadCountLocal > 0 && markAllNotificationsAsRead && (
                  <button
                    onClick={markAllNotificationsAsRead}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                    title="خواندن همه"
                  >
                    <CheckCircle2 size={15} />
                  </button>
                )}
                <button
                  onClick={clearNotifications}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  title="پاکسازی تمام اعلان‌ها"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>

          {/* Notifications Scrollable List */}
          <div className="overflow-y-auto flex-1 custom-scrollbar p-2.5 space-y-2 min-h-[160px]">
            {displayedNotifications.length === 0 ? (
              <div className="py-12 px-4 text-center flex flex-col items-center justify-center text-zinc-400 select-none">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 flex items-center justify-center mb-2.5 text-zinc-400">
                  <BellOff size={22} className="opacity-60" />
                </div>
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  {filterTab === 'unread' ? 'هیچ اعلان خوانده‌نشده‌ای ندارید' : 'مرکز اعلان‌ها خالی است'}
                </p>
                <p className="text-[11px] text-zinc-400 max-w-[220px]">
                  تمامی تسک‌ها، پیام‌ها و تاییدیه‌ها بررسی شده‌اند.
                </p>
              </div>
            ) : (
              displayedNotifications.map((n) => {
                const meta = getCategoryMeta(n);
                const IconComponent = meta.icon;
                const timeText = formatTimeAgo(n.timestamp);

                return (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`group relative p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      !n.read 
                        ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200/80 dark:border-blue-900/50 hover:bg-blue-50/80 dark:hover:bg-blue-900/30 shadow-sm' 
                        : 'bg-zinc-50/50 dark:bg-zinc-800/30 border-zinc-200/60 dark:border-zinc-800/60 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`p-2 rounded-xl shrink-0 ${meta.badgeClass}`}>
                        <IconComponent size={16} className={meta.iconColor} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5 mb-1">
                          <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 truncate">
                            {n.title}
                          </span>
                          {!n.read && (
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" title="خوانده نشده" />
                          )}
                        </div>

                        <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed line-clamp-2 mb-2 font-normal">
                          {n.message}
                        </p>

                        <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-100/80 dark:border-zinc-800/60">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${meta.badgeClass}`}>
                              {meta.badgeText}
                            </span>
                            <span>{timeText}</span>
                          </div>

                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            {!n.read && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveNotification(n.id);
                                }}
                                className="p-1 rounded-md text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                                title="علامت‌گذاری به عنوان خوانده شده"
                              >
                                <Check size={13} />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onDeleteNotification) {
                                  onDeleteNotification(n.id);
                                } else {
                                  onRemoveNotification(n.id);
                                }
                              }}
                              className="p-1 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              title="حذف این اعلان"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer note */}
          {safeNotifications.length > 0 && (
            <div className="p-2 bg-zinc-50/80 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800/60 text-center text-[10px] text-zinc-400 shrink-0">
              با کلیک روی هر اعلان، به صفحه مربوطه منتقل شده و اعلان به طور خودکار پاک می‌شود.
            </div>
          )}
        </div>
      </div>,
      document.body
    );
  };

  const showCustomBg = bgMode === 'custom' && !!customBgImage;
  const resolvedBgImage = customBgImage ? resolveImageUrl(customBgImage) : null;
  const isPlainLight = theme === 'light' && !showCustomBg && bgMode !== 'preset';

  return (
    <div className={`flex h-[100dvh] w-full text-[var(--text-primary)] font-sans relative overflow-hidden ${isPlainLight ? 'bg-gray-100 dark:bg-gray-900' : 'bg-transparent'}`}>
      {/* Background Blobs & Custom Background Image */}
      {(!isPlainLight || showCustomBg || bgMode === 'preset') && !lowSpecMode && (
        <div 
          className={`bg-blobs ${bgMode === 'preset' ? `bg-preset-${bgPreset}` : ''}`}
          style={showCustomBg && resolvedBgImage ? {
            backgroundImage: `url(${resolvedBgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
            filter: customBgBlur > 0 ? `blur(${customBgBlur}px)` : undefined,
            transform: customBgBlur > 0 ? 'scale(1.08)' : undefined,
            width: customBgBlur > 0 ? '108%' : '100%',
            height: customBgBlur > 0 ? '108%' : '100%',
            top: customBgBlur > 0 ? '-4%' : '0',
            left: customBgBlur > 0 ? '-4%' : '0',
            position: 'fixed'
          } : undefined}
        >
          {bgMode === 'preset' && !lowSpecMode && (
            <>
              <div className="blob blob-1"></div>
              <div className="blob blob-2"></div>
              <div className="blob blob-3"></div>
            </>
          )}
        </div>
      )}
      
      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-white dark:bg-zinc-950 z-[100] flex flex-col animate-fade-in overflow-y-auto">
            {/* Elegant Header */}
            <header className="border-b border-gray-150 dark:border-zinc-800 p-4 flex items-center justify-between sticky top-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={() => setShowProfileModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-gray-700 dark:text-gray-300" title="بازگشت">
                        <ArrowRight size={20}/>
                    </button>
                    <span className="font-black text-gray-800 dark:text-white text-base">پروفایل کاربری</span>
                </div>
                <div className="text-xs text-gray-500 font-bold hidden sm:block">
                    مشخصات و شخصی‌سازی نوار ابزار
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 md:py-12">
                <form onSubmit={handleUpdateProfile} className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                    {/* Left Column: Avatar & User identity */}
                    <div className="md:col-span-4 flex flex-col items-center p-6 bg-gray-50 dark:bg-zinc-900 rounded-[2rem] border border-gray-100 dark:border-zinc-800/60 shadow-sm">
                        <div className="relative group cursor-pointer mb-4" onClick={() => avatarInputRef.current?.click()}>
                            <div className="w-28 h-28 rounded-full bg-white/20 border-4 border-white dark:border-zinc-800 overflow-hidden shadow-xl">
                                {currentUser.avatar ? <img src={resolveImageUrl(currentUser.avatar)} alt="Profile" className="w-full h-full object-cover" /> : <UserIcon size={48} className="w-full h-full p-5 text-gray-400 bg-gray-200 dark:bg-zinc-800" />}
                            </div>
                            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                {uploadingAvatar ? <Loader2 size={24} className="animate-spin text-white"/> : <Camera size={24} className="text-white"/>}
                            </div>
                            <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} disabled={uploadingAvatar} />
                        </div>
                        <h2 className="text-xl font-black text-gray-800 dark:text-white mb-1">{currentUser.fullName}</h2>
                        <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold rounded-full text-xs border border-blue-100 dark:border-blue-900/50 mb-4">{getUserAllRolesDisplayName(currentUser)}</span>
                        
                        <div className="w-full space-y-4 pt-4 border-t border-gray-200 dark:border-zinc-800/60">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 dark:text-gray-400">شماره موبایل (واتساپ)</label>
                                <input type="tel" value={profileForm.phoneNumber} onChange={e => setProfileForm({...profileForm, phoneNumber: e.target.value})} className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl p-3 text-sm dir-ltr text-center font-bold focus:ring-2 focus:ring-blue-100 outline-none" placeholder="98912..."/>
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400">رمز عبور جدید</label>
                                    <input type="password" value={profileForm.password} onChange={e => setProfileForm({...profileForm, password: e.target.value})} className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none" placeholder="******"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 dark:text-gray-400">تکرار رمز عبور</label>
                                    <input type="password" value={profileForm.confirmPassword} onChange={e => setProfileForm({...profileForm, confirmPassword: e.target.value})} className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none" placeholder="******"/>
                                </div>
                            </div>
                        </div>

                        {/* Google Workspace Account Linking Section */}
                        <div className="w-full pt-4 border-t border-gray-200 dark:border-zinc-800/60 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                    <CalendarDays size={15} className="text-indigo-500" />
                                    اتصال حساب گوگل
                                </span>
                                {googleLinkedEmail ? (
                                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/50 flex items-center gap-1">
                                        <CheckCircle2 size={10} /> متصل
                                    </span>
                                ) : (
                                    <span className="text-[9px] font-bold text-gray-400 bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                                        غیرمتصل
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                                با لینک کردن حساب گوگل، تقویم و تسک‌های روزانه شخصی شما در داشبورد سیستم همگام‌سازی می‌شود.
                            </p>

                            {googleLinkedEmail ? (
                                <div className="bg-indigo-50/50 dark:bg-zinc-950/80 border border-indigo-100 dark:border-zinc-800 p-3 rounded-xl space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>
                                            <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate dir-ltr">{googleLinkedEmail}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleUnlinkGoogleAccount}
                                            disabled={googleLinkingStatus === 'loading'}
                                            className="text-[10px] font-bold text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-200/50 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                                        >
                                            قطع اتصال
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleLinkGoogleAccount}
                                    disabled={googleLinkingStatus === 'loading'}
                                    className="w-full flex items-center justify-center gap-2 bg-white dark:bg-zinc-950 hover:bg-gray-50 dark:hover:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-200 p-2.5 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-98 cursor-pointer disabled:opacity-60"
                                >
                                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 shrink-0">
                                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                                        <path fill="none" d="M0 0h48v48H0z"></path>
                                    </svg>
                                    <span>{googleLinkingStatus === 'loading' ? 'در حال برقراری ارتباط...' : 'لینک حساب گوگل (Google Workspace)'}</span>
                                </button>
                            )}

                            {googleError && (
                                <div className="text-[10px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <AlertCircle size={13} className="shrink-0 text-rose-500" />
                                        <span>{googleError}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                                        {isRunningInIframe() && (
                                            <button
                                                type="button"
                                                onClick={openInStandaloneTab}
                                                className="px-2 py-1 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-zinc-600 rounded-lg text-[9px] font-bold transition-all cursor-pointer"
                                                title="باز کردن در پنجره مستقل مرورگر"
                                            >
                                                باز کردن در تب مستقل
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleLinkGoogleAccount}
                                            className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-bold transition-all cursor-pointer"
                                        >
                                            تلاش مجدد
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Mobile Navigation Order & Settings */}
                    <div className="md:col-span-8 space-y-6">
                        <div className="p-6 bg-gray-50 dark:bg-zinc-900 rounded-[2rem] border border-gray-100 dark:border-zinc-800/60 shadow-sm space-y-4">
                            <h3 className="text-sm font-black text-gray-800 dark:text-white flex items-center gap-2">
                                <Smartphone size={18} className="text-blue-500"/>
                                <span>اولویت نوار پایین موبایل</span>
                            </h3>
                            <div className="bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/50 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                                ترتیب آیکون‌ها در نوار پایین موبایل را شخصی‌سازی کنید. با این کار دسترسی شما به بخش‌های پرکاربرد بسیار سریع‌تر خواهد شد.
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto p-3 bg-white dark:bg-zinc-950 rounded-2xl border border-gray-200 dark:border-zinc-800 custom-scrollbar">
                                {(profileForm.mobileNavOrder?.length ? profileForm.mobileNavOrder : DEFAULT_MOBILE_NAV_ORDER).map((itemId, idx) => {
                                    const navLabel = {
                                        dashboard: 'داشبورد',
                                        create: 'ثبت پرداخت',
                                        manage: 'سوابق پرداخت',
                                        'create-exit': 'ثبت خروج',
                                        'manage-invoices': 'مدیریت فاکتورها',
                                        'manage-exit': 'سوابق خروج',
                                        warehouse: 'مدیریت انبار',
                                        security: 'انتظامات',
                                        meetings: 'جلسات تولید',
                                        purchase: 'درخواست خرید',
                                        chat: 'گفتگو',
                                        knowledge: 'اطلاعات و یادداشت ها',
                                        trade: 'بازرگانی',
                                        balances: 'مانده حساب مشتریان',
                                        products: 'کالاها',
                                        sales: 'مشتریان',
                                        tickets: 'تیکت‌ها',
                                        users: 'کاربران',
                                        ccti: 'تبدیل CCTI',
                                        sayan: 'گزارشات سایان',
                                        settings: 'تنظیمات'
                                    }[itemId] || itemId;

                                    return (
                                        <div key={itemId} className="flex items-center justify-between bg-gray-50 dark:bg-zinc-900 p-3 rounded-xl border border-gray-100 dark:border-zinc-800 shadow-xs">
                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate">{navLabel}</span>
                                            <div className="flex gap-1.5">
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            const defaultOrder = DEFAULT_MOBILE_NAV_ORDER;
                                                            const currentOrder = profileForm.mobileNavOrder?.length ? profileForm.mobileNavOrder : defaultOrder;
                                                            const order = [...currentOrder];
                                                            if (idx > 0) {
                                                                const temp = order[idx];
                                                                order[idx] = order[idx-1];
                                                                order[idx-1] = temp;
                                                                setProfileForm({...profileForm, mobileNavOrder: order});
                                                            }
                                                        }}
                                                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
                                                        disabled={idx === 0}
                                                    >
                                                        <RefreshCw size={14} className="rotate-90"/>
                                                    </button>
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            const defaultOrder = DEFAULT_MOBILE_NAV_ORDER;
                                                            const currentOrder = profileForm.mobileNavOrder?.length ? profileForm.mobileNavOrder : defaultOrder;
                                                            const order = [...currentOrder];
                                                            if (idx < order.length - 1) {
                                                                const temp = order[idx];
                                                                order[idx] = order[idx+1];
                                                                order[idx+1] = temp;
                                                                setProfileForm({...profileForm, mobileNavOrder: order});
                                                            }
                                                        }}
                                                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
                                                        disabled={idx === (profileForm.mobileNavOrder?.length || 19) - 1}
                                                    >
                                                        <RefreshCw size={14} className="-rotate-90"/>
                                                    </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50 dark:bg-zinc-900 rounded-[2rem] border border-gray-100 dark:border-zinc-800/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <input 
                                    type="checkbox" 
                                    id="receiveNotifications" 
                                    checked={profileForm.receiveNotifications} 
                                    onChange={e => setProfileForm({...profileForm, receiveNotifications: e.target.checked})} 
                                    className="rounded text-blue-600 focus:ring-blue-500 h-4.5 w-4.5 cursor-pointer"
                                />
                                <label htmlFor="receiveNotifications" className="text-xs font-black text-gray-700 dark:text-gray-300 select-none cursor-pointer">دریافت نوتیفیکیشن‌های سیستم</label>
                            </div>
                            <button type="submit" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-black py-3 px-8 rounded-2xl text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-100 dark:shadow-none">
                                <Save size={16}/> ذخیره اطلاعات پروفایل
                            </button>
                        </div>
                    </div>
                </form>
            </main>
        </div>
      )}
      {/* Desktop Sidebar Container - Layout slot stays fixed unless pinned */}
      <div 
          onMouseEnter={() => setIsSidebarHovered(true)}
          onMouseLeave={() => setIsSidebarHovered(false)}
          className={`hidden md:block flex-shrink-0 relative transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] my-4 mr-4 ml-2 z-[70] ${
              isSidebarPinned ? 'w-64' : 'w-20'
          }`}
      >
          <aside 
              className={`flex flex-col no-print h-[calc(100vh-2rem)] rounded-[24px] text-zinc-900 dark:text-zinc-100 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                  isSidebarPinned
                      ? 'w-64 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border border-white/50 dark:border-zinc-800/40 shadow-[0_8px_30px_rgba(0,0,0,0.03)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.25)]'
                      : isSidebarHovered
                          ? 'absolute top-0 right-0 w-64 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl border border-blue-500/25 dark:border-blue-400/25 ring-1 ring-blue-500/15 dark:ring-blue-400/15 shadow-[0_20px_50px_rgba(0,0,0,0.14),0_10px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_25px_65px_rgba(0,0,0,0.7)] z-[80]'
                          : 'w-20 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl border border-white/40 dark:border-zinc-900/30 shadow-[0_8px_24px_rgba(0,0,0,0.02)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.2)]'
              }`}
          >
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <div className={`flex items-center gap-2.5 overflow-hidden transition-all duration-200 ${!isSidebarOpen ? 'hidden w-0 opacity-0' : 'flex-1 min-w-0 opacity-100'}`}>
                      <div className="bg-blue-600 p-2 rounded-xl text-white shadow-sm shrink-0"><Sparkles className="w-4 h-4" /></div>
                      <div className="whitespace-nowrap overflow-hidden">
                          <h1 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-white truncate">{settings?.appName || 'سیستم مالی'}</h1>
                          <span className="text-[10px] text-zinc-400 font-bold block truncate">سیستم مدیریت مالی و اداری</span>
                      </div>
                  </div>
                  
                  <div className={`flex items-center gap-1.5 shrink-0 ${!isSidebarOpen ? 'mx-auto' : ''}`}>
                      {/* Pin Button */}
                      {isSidebarOpen && (
                          <button 
                              type="button"
                              onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSidebarPin();
                              }} 
                              className={`p-1.5 rounded-lg transition-all duration-200 flex items-center justify-center ${
                                  isSidebarPinned 
                                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30' 
                                      : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                              }`}
                              title={isSidebarPinned ? 'منو پین شده است (کلیک برای خروج از پین و بسته‌شدن خودکار با خروج موس)' : 'پین کردن منو (ثابت ماندن منو)'}
                          >
                              <Pin size={16} className={`transition-transform duration-200 ${isSidebarPinned ? 'fill-current -rotate-45' : ''}`} />
                          </button>
                      )}

                      {/* Hamburger Button */}
                      <button 
                          type="button"
                          onClick={() => {
                              if (isSidebarPinned) {
                                  setIsSidebarPinned(false);
                                  localStorage.setItem('app_sidebar_pinned', 'false');
                              } else {
                                  setIsSidebarPinned(true);
                                  localStorage.setItem('app_sidebar_pinned', 'true');
                              }
                          }} 
                          className={`p-1.5 rounded-lg transition-all duration-200 ${
                              isSidebarPinned 
                                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100' 
                                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                          }`}
                          title={isSidebarPinned ? 'خروج از حالت پین منو' : 'پین کردن منو'}
                      >
                          <Menu size={18}/>
                      </button>
                  </div>
              </div>
              
              <div className={`p-3 bg-zinc-50 dark:bg-zinc-900/30 mx-4 mt-4 rounded-xl flex items-center gap-3 border border-zinc-200/50 dark:border-zinc-800/30 relative group cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-all ${!isSidebarOpen ? 'justify-center mx-2 px-0' : ''}`} onClick={() => setShowProfileModal(true)} title="تنظیمات کاربری">
                  <div className="w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800 overflow-hidden shrink-0">
                      {currentUser.avatar ? <img src={resolveImageUrl(currentUser.avatar)} alt="" className="w-full h-full object-cover"/> : <div className="w-full h-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-700 dark:text-zinc-300">{currentUser.fullName.charAt(0)}</div>}
                  </div>
                  {isSidebarOpen && (
                     <div className="overflow-hidden flex-1 animate-fade-in">
                         <p className="text-xs font-bold truncate text-zinc-800 dark:text-zinc-200">{currentUser.fullName}</p>
                         <p className="text-[10px] text-zinc-400 truncate font-bold inline-flex items-center gap-1 mt-0.5"><span>نقش:</span> <span className="text-blue-600 dark:text-blue-400">{getUserAllRolesDisplayName(currentUser)}</span></p>
                     </div>
                  )}
              </div>
              
              <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar relative z-10">
                  {navItems.map((item) => { 
                      const Icon = item.icon; 
                      const isActive = activeTab === item.id;
                      return (
                        <button 
                            key={item.id} 
                            onClick={() => setActiveTab(item.id)} 
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative ${isActive ? 'text-blue-600 dark:text-blue-400 font-bold shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/50 dark:hover:bg-zinc-900/30'} ${!isSidebarOpen ? 'justify-center' : ''}`} 
                            title={item.label}
                        >
                            {isActive && (
                                <motion.div 
                                    layoutId="activeSidebarTab"
                                    className="absolute inset-0 bg-blue-50/70 dark:bg-blue-950/20 rounded-xl border border-blue-100/50 dark:border-blue-900/30 -z-0"
                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                />
                            )}
                            <div className="relative z-10 flex items-center justify-between w-full">
                                <div className="flex items-center gap-3">
                                    <Icon size={18} className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-colors'} />
                                    {isSidebarOpen && <span className="text-xs whitespace-nowrap animate-fade-in">{item.label}</span>}
                                </div>
                                {item.id === 'chat' && unreadChatCount > 0 && isSidebarOpen && (
                                    <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full min-w-[16px] text-center font-bold shadow-sm">{unreadChatCount}</span>
                                )}
                                {item.id === 'chat' && unreadChatCount > 0 && !isSidebarOpen && (
                                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-zinc-900"></span>
                                )}
                            </div>
                        </button>
                      ); 
                  })}
                  
                  {canSeeNotifications && (
                      <div className="pt-4 mt-2 border-t border-zinc-200 dark:border-zinc-800 relative" ref={notifRef}>
                          <button onClick={() => {
                              const nextState = !showNotifDropdown;
                              setNotifOrigin('sidebar');
                              setShowNotifDropdown(nextState);
                              if (nextState && markAllNotificationsAsRead) {
                                  markAllNotificationsAsRead();
                              }
                          }} className={`notification-trigger w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-xs relative ${unreadCount > 0 ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 font-bold' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/40'} ${!isSidebarOpen ? 'justify-center' : ''}`} title="اعلان‌ها">
                              <div className="relative">
                                  <Bell size={18} className={unreadCount > 0 ? 'text-blue-600' : 'text-zinc-400'} />
                                  {unreadCount > 0 && (<span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white">{unreadCount}</span>)}
                              </div>
                              {isSidebarOpen && <span className="font-bold whitespace-nowrap animate-fade-in">مرکز اعلان‌ها</span>}
                          </button>
                          
                          {!notifEnabled && isSidebarOpen && (
                              <button onClick={handleToggleNotif} className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs bg-red-50 text-red-600 hover:bg-red-100 transition-all font-black border border-red-100 animate-fade-in">
                                  <BellRing size={16} />
                                  <span>فعال‌سازی نوتیفیکیشن</span>
                              </button>
                          )}
                      </div>
                  )}
              </nav>
              
              <div className="p-2.5 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/40">
                  {isSidebarOpen ? (
                      <div className="flex items-center justify-between gap-1 p-1 bg-zinc-200/50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200/60 dark:border-zinc-700/40">
                          {/* Low Spec Anti-Lag Toggle */}
                          <button 
                            onClick={toggleLowSpecMode} 
                            className={`flex-1 flex items-center justify-center p-2 rounded-lg transition-all relative group ${
                              lowSpecMode 
                                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30' 
                                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700/60'
                            }`}
                            title={lowSpecMode ? 'حالت ضد لگ: فعال (حداکثر سرعت)' : 'حالت بهینه‌سازی سیستم ضعیف (ضد لگ)'}
                          >
                              <Zap size={16} className={lowSpecMode ? 'fill-current animate-pulse' : ''} />
                          </button>

                          {/* AI Options Toggle (Android / Web / Windows) */}
                          <button 
                            onClick={toggleAiCopilot} 
                            className={`flex-1 flex items-center justify-center p-2 rounded-lg transition-all relative group ${
                              aiCopilotEnabled 
                                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30' 
                                : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700/60'
                            }`}
                            title={aiCopilotEnabled ? 'هوش مصنوعی (AI): فعال (کلیک جهت غیرفعال‌سازی)' : 'هوش مصنوعی (AI): غیرفعال (کلیک جهت فعال‌سازی)'}
                          >
                              <BrainCircuit size={16} />
                          </button>

                          {/* Dark Mode Toggle */}
                          {onToggleDarkMode && (
                            <button 
                              onClick={onToggleDarkMode} 
                              className="flex-1 flex items-center justify-center p-2 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700/60 rounded-lg transition-all"
                              title={isDarkMode ? 'حالت روشن (Light Mode)' : 'حالت تاریک (Dark Mode)'}
                            >
                                {isDarkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-indigo-500 dark:text-indigo-400" />}
                            </button>
                          )}

                          {/* Theme Selector */}
                          <button 
                            onClick={toggleTheme} 
                            className="flex-1 flex items-center justify-center p-2 text-zinc-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-white dark:hover:bg-zinc-700/60 rounded-lg transition-all"
                            title={`تغییر پوسته (پوسته فعلی: ${
                              theme === 'light-aurora' ? 'شیشه‌ای' :
                              theme === 'theme-bento' ? 'بنتو گرید' :
                              theme === 'theme-claymorphism' ? 'سفالی ۳D' :
                              theme === 'theme-skeuomorphism' ? 'واقع‌گرایانه' :
                              theme === 'theme-minimalism' ? 'مینیمال' :
                              theme === 'theme-maximalism' ? 'ماکسیمال' : 'پیش‌فرض'
                            })`}
                          >
                              <Sparkles size={16} className="text-purple-500" />
                          </button>

                          {/* Logout Button */}
                          <button 
                            onClick={handleLogout} 
                            className="flex-1 flex items-center justify-center p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-all"
                            title="خروج از سیستم"
                          >
                              <LogOut size={16} />
                          </button>
                      </div>
                  ) : (
                      <div className="flex flex-col gap-1 items-center">
                          <button 
                            onClick={toggleLowSpecMode} 
                            className={`p-2 rounded-lg transition-colors ${lowSpecMode ? 'bg-amber-500/15 text-amber-500' : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                            title={lowSpecMode ? 'حالت ضد لگ (فعال)' : 'ضد لگ'}
                          >
                              <Zap size={16} className={lowSpecMode ? 'fill-current' : ''} />
                          </button>
                          <button 
                            onClick={toggleAiCopilot} 
                            className={`p-2 rounded-lg transition-colors ${aiCopilotEnabled ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                            title={aiCopilotEnabled ? 'هوش مصنوعی: فعال (کلیک جهت غیرفعال‌سازی)' : 'هوش مصنوعی: غیرفعال (کلیک جهت فعال‌سازی)'}
                          >
                              <BrainCircuit size={16} />
                          </button>
                          {onToggleDarkMode && (
                            <button 
                              onClick={onToggleDarkMode} 
                              className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                              title={isDarkMode ? 'حالت روشن' : 'دارک مود'}
                            >
                                {isDarkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-indigo-500" />}
                            </button>
                          )}
                          <button 
                            onClick={toggleTheme} 
                            className="p-2 text-zinc-400 hover:text-purple-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                            title="تغییر پوسته"
                          >
                              <Sparkles size={16} className="text-purple-500" />
                          </button>
                          <button 
                            onClick={handleLogout} 
                            className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors"
                            title="خروج"
                          >
                              <LogOut size={16} />
                          </button>
                      </div>
                  )}
              </div>
          </aside>
      </div>
      
      {/* Mobile Drawer - Native Android App Launcher Sheet with Search & Categorized Modules */}
      <AnimatePresence>
        {showMobileMenu && (
          <div className="fixed inset-0 z-[100] md:hidden flex flex-col justify-end">
              {/* Backdrop */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className={`absolute inset-0 bg-black/60 ${isNativeAndroid || lowSpecMode ? '' : 'backdrop-blur-sm'}`} 
                onClick={() => setShowMobileMenu(false)}
              />
              {/* Slide-Up Panel */}
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "tween", duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-full h-[90vh] max-h-[90dvh] bg-white dark:bg-zinc-950 rounded-t-[28px] border-t border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden z-10 touch-pan-y"
              >
                  {/* Drag Handle */}
                  <div className="w-full pt-2.5 pb-1.5 flex justify-center cursor-pointer shrink-0" onClick={() => setShowMobileMenu(false)}>
                      <div className="w-11 h-1.5 bg-zinc-300 dark:bg-zinc-800 rounded-full" />
                  </div>

                  {/* Header */}
                  <div className="px-4 pb-3 border-b border-zinc-100 dark:border-zinc-900 flex justify-between items-center bg-white dark:bg-zinc-950 shrink-0">
                      <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-sm overflow-hidden shrink-0">
                              {currentUser.avatar ? <img src={resolveImageUrl(currentUser.avatar)} alt="" className="w-full h-full object-cover"/> : currentUser.fullName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-zinc-900 dark:text-white text-sm truncate">{currentUser.fullName}</span>
                                <span className="px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[9px] font-black">dlkam</span>
                              </div>
                              <div className="text-[10px] text-zinc-500 font-bold truncate">{getUserAllRolesDisplayName(currentUser)}</div>
                          </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => { setShowMobileMenu(false); setShowProfileModal(true); }}
                          className="p-2 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl text-zinc-600 dark:text-zinc-300 transition-colors"
                          title="تنظیمات پروفایل و چیدمان منو"
                        >
                          <Settings size={17} />
                        </button>
                        <button onClick={() => setShowMobileMenu(false)} className="p-2 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 transition-colors">
                            <X size={18} />
                        </button>
                      </div>
                  </div>

                  {/* Fast Search & Category Filter Bar */}
                  <div className="px-4 pt-3 pb-2 bg-zinc-50/70 dark:bg-zinc-900/40 border-b border-zinc-100 dark:border-zinc-900 shrink-0 space-y-2.5">
                      <div className="relative">
                        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                        <input
                          type="text"
                          value={mobileMenuSearch}
                          onChange={(e) => setMobileMenuSearch(e.target.value)}
                          placeholder="جستجوی سریع منو و امکانات (مثلاً: انبار، چک، سایان...)"
                          className="w-full pr-9 pl-8 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-blue-500"
                        />
                        {mobileMenuSearch && (
                          <button
                            onClick={() => setMobileMenuSearch('')}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                        {[
                          { id: 'all', label: `همه (${sortedItems.length})` },
                          { id: 'finance', label: 'مالی و پرداخت' },
                          { id: 'warehouse', label: 'انبار و خروج' },
                          { id: 'sales', label: 'فروش و سایان' },
                          { id: 'admin', label: 'اداری و سیستم' },
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => setMobileMenuCategory(cat.id as any)}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                              mobileMenuCategory === cat.id
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200/80 dark:border-zinc-800'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                  </div>
                  
                  {/* Notification Alert in bottom-sheet if disabled */}
                  {canSeeNotifications && !notifEnabled && (
                      <div className="px-4 mt-2.5 shrink-0">
                          <div className="bg-red-50/80 border border-red-100 dark:bg-red-950/20 dark:border-red-950 p-2.5 rounded-xl flex items-center justify-between">
                              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-bold">
                                  <Bell size={15} />
                                  <span>اعلان‌های لحظه‌ای غیرفعال است</span>
                              </div>
                              <button onClick={handleToggleNotif} className="bg-red-600 text-white px-3 py-1 rounded-lg text-[10px] font-bold">
                                  فعال‌سازی
                              </button>
                          </div>
                      </div>
                  )}

                  {/* Categorized & Searchable Menu Grid */}
                  <div 
                    className="px-4 py-3 flex-1 min-h-0 overflow-y-auto overscroll-y-auto touch-pan-y custom-scrollbar space-y-5 pb-28"
                    style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                  >
                      <div>
                          <div className="flex items-center justify-between mb-2.5">
                            <h4 className="text-[11px] font-black text-zinc-400">
                              {mobileMenuCategory === 'all' ? 'دسترسی سریع به تمام ماژول‌ها' : 'ماژول‌های منتخب'}
                            </h4>
                            <span className="text-[10px] font-bold text-zinc-400">{filteredMobileMenuItems.length} بخش</span>
                          </div>

                          {filteredMobileMenuItems.length === 0 ? (
                            <div className="py-8 text-center text-xs font-bold text-zinc-400 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                              موردی مطابق با جستجوی شما یافت نشد.
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                                {filteredMobileMenuItems.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = activeTab === item.id;
                                    return (
                                        <button 
                                          key={item.id} 
                                          onClick={() => {
                                            setActiveTab(item.id);
                                            setShowMobileMenu(false);
                                            setMobileMenuSearch('');
                                          }}
                                          className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-transform active:scale-95 border relative min-h-[84px] ${
                                              isActive 
                                              ? 'bg-blue-600 text-white border-blue-600 font-black shadow-md shadow-blue-600/20' 
                                              : 'bg-zinc-50/90 dark:bg-zinc-900/80 border-zinc-200/70 dark:border-zinc-800/80 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                          }`}
                                        >
                                            <div className={`p-2 rounded-xl ${isActive ? 'bg-white/20 text-white' : 'bg-white dark:bg-zinc-950 text-blue-600 dark:text-blue-400 border border-zinc-200/60 dark:border-zinc-800'}`}>
                                                <Icon size={20} strokeWidth={2.2} />
                                            </div>
                                            <span className="text-[11px] font-bold text-center leading-tight line-clamp-1 w-full">{item.label}</span>
                                            {item.id === 'chat' && unreadChatCount > 0 && (
                                                <span className="absolute top-1.5 left-1.5 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full min-w-[16px] text-center font-black shadow-sm">{unreadChatCount}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                          )}
                      </div>

                      {/* Quick Settings Tiles for Android / Mobile */}
                      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-900 flex flex-col gap-2 pb-8">
                          <h4 className="text-[11px] font-black text-zinc-400 mb-1 block">ابزارهای سریع و بهینه‌سازی اپلیکیشن</h4>
                          <div className="grid grid-cols-2 gap-2.5">
                              <button onClick={() => { setShowMobileMenu(false); setShowProfileModal(true); }} className="flex items-center justify-center gap-2 p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-300 active:scale-95">
                                  <Settings size={14} className="text-blue-500" /> چیدمان منو و پروفایل
                              </button>
                              <button onClick={() => { setShowMobileMenu(false); window.dispatchEvent(new CustomEvent('sayan:open-network-settings')); }} className="flex items-center justify-center gap-2 p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-300 active:scale-95">
                                  <Radio size={14} className="text-emerald-500" /> تنظیمات اتصال سرور
                              </button>
                              <button onClick={() => { toggleTheme(); }} className="flex items-center justify-center gap-2 p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-300 active:scale-95">
                                  <Sparkles size={14} className="text-purple-500" /> تغییر پوسته ظاهری
                              </button>
                              <button 
                                onClick={toggleLowSpecMode} 
                                className={`flex items-center justify-center gap-2 p-2.5 border rounded-xl text-xs font-bold active:scale-95 ${
                                  lowSpecMode 
                                    ? 'bg-amber-500/15 border-amber-400 dark:border-amber-700 text-amber-700 dark:text-amber-300' 
                                    : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                                }`}
                              >
                                  <Zap size={14} className={lowSpecMode ? "text-amber-500 fill-amber-500" : "text-zinc-500"} />
                                  <span>{lowSpecMode ? 'حالت بدون لگ: فعال' : 'حالت فوق‌سریع (بدون لگ)'}</span>
                              </button>
                          </div>
                          <button 
                            onClick={toggleAiCopilot} 
                            className={`flex items-center justify-center gap-2 p-2.5 border rounded-xl text-xs font-bold transition-colors ${
                              aiCopilotEnabled 
                                ? 'bg-indigo-500/10 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300' 
                                : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                              <BrainCircuit size={14} className={aiCopilotEnabled ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400"} />
                              <span>{aiCopilotEnabled ? 'دستیار هوش مصنوعی (AI): فعال' : 'دستیار هوش مصنوعی (AI): غیرفعال'}</span>
                          </button>
                          {onToggleDarkMode && (
                              <button onClick={onToggleDarkMode} className="flex items-center justify-center gap-2 p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                  {isDarkMode ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-indigo-500" />}
                                  <span>{isDarkMode ? 'تغییر به حالت روشن (Light)' : 'تغییر به حالت تاریک (Dark)'}</span>
                              </button>
                          )}
                          <button onClick={handleLogout} className="flex items-center justify-center gap-2 p-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 border border-red-100 dark:border-red-950/50 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold transition-colors">
                              <LogOut size={14}/> خروج از حساب کاربری
                          </button>
                      </div>
                  </div>
              </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Navigation - Always accessible across main modules for 1-tap switching */}
      {isBottomBarVisible && (
        <div 
          className={`md:hidden fixed z-[90] bottom-2.5 left-3 right-3 ${
            isNativeAndroid || lowSpecMode
              ? 'bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-lg'
              : 'bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/70 dark:border-zinc-800/70 backdrop-blur-lg shadow-[0_10px_30px_rgba(0,0,0,0.12)]'
          } pb-1.5 pt-1.5 rounded-2xl flex justify-around items-center px-1.5 bottom-nav-bar`}
        >
            {bottomVisibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                    <button 
                        key={item.id}
                        onClick={() => setActiveTab(item.id)} 
                        className={`flex flex-col items-center gap-0.5 transition-colors flex-1 relative py-1.5 rounded-xl active:scale-95 ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-black'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                    >
                        <div className="relative">
                            <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
                            {item.id === 'chat' && unreadChatCount > 0 && (
                              <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900"></span>
                            )}
                        </div>
                        <span className={`text-[10px] font-bold tracking-tight truncate max-w-[64px] ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'}`}>{item.label}</span>
                    </button>
                );
            })}
            
            <button 
                onClick={() => setShowMobileMenu(true)} 
                className={`flex flex-col items-center gap-0.5 transition-colors flex-1 relative py-1.5 rounded-xl active:scale-95 ${
                  menuItems.some(m => m.id === activeTab)
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-black'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
            >
                <div className="relative">
                    <Menu size={19} strokeWidth={menuItems.some(m => m.id === activeTab) ? 2.5 : 2} />
                    {menuItems.some(m => m.id === 'chat' && unreadChatCount > 0) && (
                      <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900"></span>
                    )}
                </div>
                <span className={`text-[10px] font-bold tracking-tight ${menuItems.some(m => m.id === activeTab) ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'}`}>همه منوها</span>
            </button>
        </div>
      )}

      <main className={`flex flex-1 flex-col overflow-hidden relative min-w-0 min-h-0 w-full max-w-full m-0 ${
          activeTab === 'dashboard' && !secondaryTab
            ? 'bg-transparent border-0 md:border-0 shadow-none md:my-0 md:ml-0 md:mr-0 rounded-none'
            : `md:my-4 md:ml-4 md:mr-2 ${isNativeAndroid || lowSpecMode ? 'bg-white dark:bg-slate-900' : 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl'} md:rounded-[24px] border-0 md:border border-slate-200/50 dark:border-slate-800/50 shadow-sm`
      }`}>
          {/* Mobile Header - Native Android App Bar (Zero-lag, ergonomic, clean) */}
          <header className={`px-3 py-2 md:hidden no-print items-center justify-between shrink-0 relative z-[60] safe-pt sticky top-0 ${
            isNativeAndroid || lowSpecMode
              ? 'bg-white dark:bg-zinc-950 border-b border-zinc-200/80 dark:border-zinc-800/80'
              : 'bg-white/85 dark:bg-zinc-950/85 border-b border-zinc-200/50 dark:border-zinc-800/50 backdrop-blur-md'
          } ${activeTab === 'chat' ? 'hidden' : 'flex'}`}>
              <div className="flex items-center gap-2 min-w-0">
                  {activeTab === 'dashboard' ? (
                  <button 
                      onClick={() => setShowMobileMenu(true)} 
                      className="flex items-center gap-2.5 transition-transform active:scale-95"
                  >
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white border border-blue-500/20 overflow-hidden shadow-sm flex items-center justify-center font-black text-xs shrink-0">
                          {currentUser.avatar ? <img src={resolveImageUrl(currentUser.avatar)} alt="" className="w-full h-full object-cover"/> : currentUser.fullName.charAt(0)}
                      </div>
                  </button>
                  ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button 
                        onClick={onBack} 
                        className="flex items-center justify-center w-8 h-8 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/70 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 active:scale-95 transition-transform"
                        title="بازگشت"
                    >
                        <ChevronRight size={18} />
                    </button>
                    <button 
                        onClick={() => setShowMobileMenu(true)} 
                        className="flex items-center justify-center w-8 h-8 bg-blue-50 dark:bg-blue-950/50 rounded-xl border border-blue-200/60 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 active:scale-95 transition-transform"
                        title="باز کردن منوی کل سیستم"
                    >
                        <Menu size={16} />
                    </button>
                  </div>
                  )}
                  <div className="min-w-0">
                     <h1 className="font-black text-zinc-900 dark:text-zinc-100 text-sm tracking-tight truncate">
                       {navItems.find(i => i.id === activeTab)?.label || 'داشبورد'}
                     </h1>
                  </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                  <button 
                    onClick={() => setIsSearchOpen(true)}
                    className="p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl text-zinc-700 dark:text-zinc-300 active:scale-95"
                    title="جستجو"
                  >
                      <Search size={16} />
                  </button>
                  {financialYear && setFinancialYear && (
                      <select 
                          value={financialYear} 
                          onChange={(e) => setFinancialYear(e.target.value)}
                          className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 font-bold rounded-xl text-[11px] px-2 py-1.5 focus:outline-none"
                          dir="ltr"
                      >
                          {settings?.fiscalYears?.map(fy => (
                              <option key={fy.id} value={fy.label} className="bg-white dark:bg-zinc-950">{fy.label}</option>
                          )) || <>
                              <option value="1402">1402</option>
                              <option value="1403">1403</option>
                              <option value="1404">1404</option>
                              <option value="1405">1405</option>
                          </>
                          }
                      </select>
                  )}
                  <button 
                    onClick={toggleTheme}
                    className="p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl text-zinc-700 dark:text-zinc-300 active:scale-95"
                    title="تغییر پوسته"
                  >
                      {theme === 'light-aurora' ? <Sparkles size={16} className="text-purple-500" /> : theme === 'light' ? <Moon size={16} /> : <Sun size={16} className="text-yellow-400" />}
                  </button>
                  {canSeeNotifications && (
                      <div className="relative notification-trigger" ref={mobileNotifRef}>
                          <button onClick={() => {
                              const nextState = !showNotifDropdown;
                              setNotifOrigin('header');
                              setShowNotifDropdown(nextState);
                              if (nextState && markAllNotificationsAsRead) {
                                  markAllNotificationsAsRead();
                              }
                          }} className="relative p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors active:scale-95">
                              <Bell size={16} className="text-zinc-700 dark:text-zinc-200" />
                              {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>}
                          </button>
                      </div>
                  )}
              </div>
          </header>
          
          <div className={`flex-1 ${(activeTab === 'chat' || Boolean(secondaryTab)) ? 'flex flex-col overflow-hidden pb-0 min-h-0 h-full split-view-no-scroll' : isBottomBarVisible ? 'overflow-y-auto overflow-x-hidden pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-24' : 'overflow-y-auto overflow-x-hidden pb-24'} bg-transparent min-w-0 w-full max-w-full custom-scrollbar`} id="main-scroll-container">
              {/* Bale-Style Top Update Banner for Web, Mobile, and PWA */}
              {isUpdateAvailable && !isUpdateDismissed && updateInfo && (
                <div className="p-2 sm:p-3 sm:pb-1 no-print animate-slide-down shrink-0">
                  <UpdateBanner
                    updateInfo={updateInfo}
                    onDismiss={() => {
                      setIsUpdateDismissed(true);
                      dismissUpdate(updateInfo);
                    }}
                  />
                </div>
              )}

              <div className={`${(activeTab === 'chat' && !secondaryTab) ? 'hidden' : 'hidden md:flex'} justify-end p-4 shrink-0 ${
                  activeTab === 'dashboard' && !secondaryTab
                    ? 'bg-transparent border-b-0' 
                    : 'bg-white/20 dark:bg-zinc-950/15 border-b border-zinc-200/40 dark:border-zinc-800/40 backdrop-blur-md'
              } z-40 shadow-sm no-print items-center gap-2`}>
                  <button 
                    onClick={() => setIsSearchOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-all mr-auto ml-2 group"
                    title="جستجو (Ctrl+K)"
                  >
                      <Search size={14} className="group-hover:text-blue-500 transition-colors" />
                      <span className="text-xs font-bold">جستجو در کل سیستم...</span>
                      <span className="bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[9px] font-black">Ctrl K</span>
                  </button>

                  {/* Split View Quick Action */}
                  {onOpenSplitView && (
                    <button
                      type="button"
                      onClick={onOpenSplitView}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        secondaryTab
                          ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 shadow-sm'
                          : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40'
                      }`}
                      title={secondaryTab ? 'تغییر یا مدیریت صفحه همزمان' : 'مشاهده همزمان دو منو کنار هم (Split View)'}
                    >
                      <Columns size={15} className={secondaryTab ? 'text-purple-600' : 'text-blue-600'} />
                      <span>{secondaryTab ? 'همزمان (فعال)' : 'مشاهده همزمان (Split View)'}</span>
                      {secondaryTab && (
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onCloseSecondaryTab) onCloseSecondaryTab();
                          }}
                          className="p-0.5 hover:bg-purple-200 dark:hover:bg-purple-800 rounded text-purple-700 dark:text-purple-300 mr-1"
                          title="بستن صفحه دوم"
                        >
                          <X size={12} />
                        </span>
                      )}
                    </button>
                  )}

                  {/* Floating Calculator Quick Action */}
                  {onToggleCalculator && (
                    <button
                      type="button"
                      onClick={onToggleCalculator}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-xs font-bold transition-all"
                      title="ماشین‌حساب مالی شناور"
                    >
                      <Calculator size={15} className="text-emerald-600" />
                      <span>ماشین‌حساب</span>
                    </button>
                  )}
                  <span className="font-bold text-zinc-500 dark:text-zinc-400 mr-3 text-xs">سال مالی:</span>
                  {settings?.fiscalYears && (
                      <select 
                          value={settings.activeFiscalYearId || ''} 
                          onChange={async (e) => {
                              const newYearId = e.target.value;
                              const newSettings = { ...settings, activeFiscalYearId: newYearId };
                              await saveSettings(newSettings);
                              window.location.reload(); 
                          }}
                          className="bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-400 font-bold border border-blue-200 dark:border-blue-900 outline-none rounded-lg px-3 py-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors cursor-pointer text-xs"
                          dir="ltr"
                      >
                          {settings.fiscalYears.map(fy => (
                              <option key={fy.id} value={fy.id}>{fy.label} سال مالی</option>
                          ))}
                      </select>
                  )}
              </div>
              <div className={`${Boolean(secondaryTab) ? 'p-1.5 sm:p-2 md:p-3 w-full max-w-full flex-1 flex flex-col min-h-0 h-full overflow-hidden' : (activeTab === 'chat' || activeTab === 'sayan') ? 'p-0 w-full max-w-full flex-1 flex flex-col min-h-0 overflow-x-hidden' : 'p-0 sm:p-2 md:p-4 w-full max-w-full'} mx-auto min-w-0`}>
                  {children}
              </div>
          </div>
      </main>

      <AnimatePresence>
        {isSearchOpen && (
            <SearchModal 
                isOpen={isSearchOpen} 
                onClose={() => setIsSearchOpen(false)} 
                currentUser={currentUser}
                settings={propSettings}
                onNavigate={(tab, data) => {
                    setActiveTab(tab);
                    setIsSearchOpen(false);
                }} 
            />
        )}
      </AnimatePresence>

      {showNotifDropdown && <NotificationDropdown />}
    </div>
  );
};

export default Layout;
