
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CreateOrder from './components/CreateOrder';
import ManageOrders from './components/ManageOrders';
import Login from './components/Login';
import ManageUsers from './components/ManageUsers';
import Settings from './components/Settings';
import ChatRoom from './components/ChatRoom';
import TradeModule from './components/TradeModule';
import CreateExitPermit from './components/CreateExitPermit'; 
import ManageExitPermits from './components/ManageExitPermits'; 
import WarehouseModule from './components/WarehouseModule';
import SecurityModule from './components/SecurityModule'; 
import MeetingModule from './components/MeetingModule';
import PurchaseModule from './components/PurchaseModule';
import PrintVoucher from './components/PrintVoucher';
import NotificationController from './components/NotificationController'; 
import SalesCRMModule from './components/SalesCRMModule';
import ProductsModule from './components/ProductsModule';
import { Tickets } from './components/Tickets';
import KnowledgeBaseModule from './components/KnowledgeBaseModule';
import { CustomerBalanceModule } from './components/CustomerBalanceModule';
import CctiConverter from './components/CctiConverter';
import SayanReports from './components/SayanReports';
import SayanRegistrationsModule from './components/SayanRegistrationsModule';
import SecretariatModule from './components/SecretariatModule';
import { ChequeReceiptModule } from './components/ChequeReceiptModule';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeSelectorModal, AppThemeMode } from './components/ThemeSelectorModal';
import { NetworkRoleSettingsModal } from './components/NetworkRoleSettingsModal';
import { AiExecutiveCopilot } from './components/AiExecutiveCopilot';
import { AiDocumentScannerModal } from './components/AiDocumentScannerModal';
import { SendToChatModal } from './components/SendToChatModal';
import { WorkstationDock } from './components/WorkstationDock';
import { SplitViewSelectorModal } from './components/SplitViewSelectorModal';
import { WorkstationFloatingWindow } from './components/WorkstationFloatingWindow';
import { SplitViewDragOverlay } from './components/SplitViewDragOverlay';
import { FloatingCalculator } from './components/FloatingCalculator';
import { DigitalCardModule } from './components/DigitalCardModule';
import { PublicBioPage } from './components/PublicBioPage';
import { PublicCustomerSurveyPage } from './components/PublicCustomerSurveyPage';
import { AppNavItem, getAppNavItems, getSidebarLabel } from './utils/navigationItems';
import { getOrders, getSettings, getMessages, saveSettings, getSystemAnnouncements, getGroups, getTaskGroups, getTasks, getBioLinkConfig } from './services/storageService'; 
import { getCurrentUser, getUsers, getRolePermissions, logout as authLogout } from './services/authService';
import { logoutGoogleWorkspace } from './services/googleWorkspaceService';
import { PaymentOrder, User, OrderStatus, UserRole, AppNotification, SystemSettings, PaymentMethod, ChatMessage, SystemAnnouncement, ChatGroup, TaskGroup, GroupTask, BioLinkConfig } from './types';
import { Loader2, Bell, X, MessageSquare, AlertTriangle, FileWarning, CreditCard, BellRing, Columns, Maximize2, Minimize2, ArrowRightLeft, Minus, ExternalLink, Calculator, Monitor } from 'lucide-react';
import { toJpeg } from 'html-to-image';
import { generateUUID, parsePersianDate, formatCurrency } from './constants';
import { apiCall, getLocalData, LS_KEYS, getServerHost } from './services/apiService'; 
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { App as CapacitorApp } from '@capacitor/app'; 
import { PushNotifications } from '@capacitor/push-notifications'; 
import { LocalNotifications } from '@capacitor/local-notifications'; 
import { sendNotification, hasNotificationBeenShown, markNotificationAsShown, syncNativeShownNotifications, syncServiceWorkerShownNotifications, clearAllActiveNotifications, setupNativePushNotifications, unsubscribeFromPushNotifications, syncServiceWorkerAuth } from './services/notificationService';
import { initSSENotificationClient, disconnectSSENotificationClient } from './services/sseNotificationClient';
import { playNotificationSound, playTaskAlarmSound } from './services/soundService';
import { motion, AnimatePresence } from 'motion/react';
import { initGraphicsEngine } from './services/graphicsEngine';
import { isTauriDesktop, isElectronDesktop, isMobileApp, isWebApp, isPersistentClientApp, shouldEnforceIdleTimeout } from './utils/platformDetection';

const FALLBACK_BIO_CONFIG: BioLinkConfig = {
    slug: 'lepanbaft',
    companyTitle: 'شرکت تولیدی لیان بافت',
    companySubtitle: 'تولید انواع نخ پلی استر ، کش ، اسپندکس ، POY و ساپورت',
    avatarUrl: '/lepan-logo.png',
    coverUrl: '/lepan-logo.png',
    theme: 'lepan_light',
    addressText: 'تهران، بازار، خیابان خیام، پلاک ۱۲۰ / کارخانه: جاده قدیم قم، شهرک صنعتی',
    blocks: []
};

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<SystemSettings | undefined>(undefined);

  // Memoized user navigation items strictly derived from user role permissions
  const allowedNavItems = useMemo(() => {
    return getAppNavItems(currentUser, settings || null);
  }, [currentUser, settings]);
  const [activeTab, setActiveTabState] = useState('dashboard');
  const [tabHistory, setTabHistory] = useState<string[]>(['dashboard']);
  const [directChatTarget, setDirectChatTarget] = useState<{ type: 'private' | 'group' | 'public' | 'task_group' | 'system', id: string, taskId?: string } | null>(null);
  const [showAiScannerModal, setShowAiScannerModal] = useState(false);
  const [globalSendToChat, setGlobalSendToChat] = useState<{
    isOpen: boolean;
    attachment?: { fileName: string; url: string };
    attachmentPromise?: Promise<{ fileName: string; url: string } | null>;
    isGeneratingAttachment?: boolean;
    defaultMessage?: string;
    title?: string;
  }>({ isOpen: false });

  // Multi-window & Split-view Workstation State
  const [secondaryTab, setSecondaryTab] = useState<string | null>(() => {
    try {
      return localStorage.getItem('app_secondary_tab') || null;
    } catch {
      return null;
    }
  });
  const [splitRatio, setSplitRatio] = useState<'50-50' | '60-40' | '40-60'>('50-50');
  const [isSplitSelectorOpen, setIsSplitSelectorOpen] = useState(false);
  const [openWorkstationTabs, setOpenWorkstationTabs] = useState<string[]>(['dashboard']);
  const [floatingTab, setFloatingTab] = useState<string | null>(null);
  const [isFloatingMinimized, setIsFloatingMinimized] = useState(false);
  const [mobileActiveSplitPane, setMobileActiveSplitPane] = useState<'primary' | 'secondary'>('primary');

  // Floating Calculator State
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isCalculatorMinimized, setIsCalculatorMinimized] = useState(false);

  // Helper to determine if current URL is a public bio / digital card page
  
  // Helper to determine if current URL is a public customer survey page
  const checkIsPublicSurveyRoute = (): boolean => {
    try {
      const rawHash = (window.location.hash || '').toLowerCase();
      const rawPath = (window.location.pathname || '').toLowerCase();
      const rawSearch = (window.location.search || '').toLowerCase();
      return (
        rawHash.startsWith('#customer-survey') ||
        rawHash.startsWith('#survey') ||
        rawPath.startsWith('/survey') ||
        rawSearch.includes('customer-survey') ||
        rawSearch.includes('survey=')
      );
    } catch {
      return false;
    }
  };

  const checkIsPublicBioRoute = (): boolean => {
    try {
      const rawHash = (window.location.hash || '').toLowerCase();
      const rawPath = (window.location.pathname || '').toLowerCase();
      const rawSearch = (window.location.search || '').toLowerCase();
      return (
        rawHash.startsWith('#p/') ||
        rawHash.startsWith('#/p/') ||
        rawHash === '#p' ||
        rawPath.startsWith('/p/') ||
        rawSearch.includes('p=') ||
        rawSearch.includes('public_bio') ||
        rawHash.includes('bio') ||
        rawHash.includes('lepanlink')
      );
    } catch {
      return false;
    }
  };

  // Public Bio / QR Code Card Public Page View State
  const [isPublicBioView, setIsPublicBioView] = useState<boolean>(() => checkIsPublicBioRoute());
  const [isPublicSurveyView, setIsPublicSurveyView] = useState<boolean>(() => checkIsPublicSurveyRoute());
  const [publicBioConfig, setPublicBioConfig] = useState<BioLinkConfig | null>(null);

  const activeTabRef = useRef(activeTab);
  const tabHistoryRef = useRef(tabHistory);
  const customBackRef = useRef<(() => void) | null>(null);
  const lastBackTimestampRef = useRef<number>(0);

  useEffect(() => {
    // Launch Zero-Lag Hybrid Graphics Pipeline (GPU Compositor + Server Offload)
    initGraphicsEngine();

    const registerBack = (e: any) => { customBackRef.current = e.detail; };
    const unregisterBack = () => { customBackRef.current = null; };
    window.addEventListener('REGISTER_BACK_ACTION', registerBack);
    window.addEventListener('UNREGISTER_BACK_ACTION', unregisterBack);

    const handleOpenSendToChat = (e: any) => {
      if (e?.detail) {
        setGlobalSendToChat({
          isOpen: true,
          attachment: e.detail.attachment,
          attachmentPromise: e.detail.attachmentPromise,
          isGeneratingAttachment: Boolean(e.detail.isGeneratingAttachment && !e.detail.attachment),
          defaultMessage: e.detail.defaultMessage || '',
          title: e.detail.title || 'ارسال به گفتگوی سازمانی'
        });
      }
    };

    const handleAttachmentReady = (e: any) => {
      if (e?.detail?.attachment) {
        setGlobalSendToChat(prev => ({
          ...prev,
          attachment: e.detail.attachment,
          isGeneratingAttachment: false
        }));
      }
    };

    window.addEventListener('app_open_send_to_chat', handleOpenSendToChat);
    window.addEventListener('app_send_to_chat_attachment_ready', handleAttachmentReady);

    return () => {
        window.removeEventListener('REGISTER_BACK_ACTION', registerBack);
        window.removeEventListener('UNREGISTER_BACK_ACTION', unregisterBack);
        window.removeEventListener('app_open_send_to_chat', handleOpenSendToChat);
        window.removeEventListener('app_send_to_chat_attachment_ready', handleAttachmentReady);
    }
  }, []);

  useEffect(() => {
      activeTabRef.current = activeTab;
      tabHistoryRef.current = tabHistory;
  }, [activeTab, tabHistory]);

  const setActiveTab = (tab: string, addToHistory = true) => {
      setOpenWorkstationTabs(prev => prev.includes(tab) ? prev : [...prev, tab]);

      if (tab === secondaryTab) {
        setSecondaryTab(null);
        localStorage.removeItem('app_secondary_tab');
      }

      if (tab === floatingTab) {
        setFloatingTab(null);
      }

      if (tab === activeTabRef.current) return;
      
      // Clear custom back ref when changing tab to avoid leaks
      customBackRef.current = null;
      
      setActiveTabState(tab);
      if (addToHistory) {
          setTabHistory(prev => {
              if (prev[prev.length - 1] === tab) return prev;
              return [...prev.slice(-14), tab]; // Keep last 15
          });
          
          // Browser history support
          const hash = `#${tab}`;
          if (window.location.hash !== hash) {
              try {
                  window.history.pushState({ tab }, '', hash);
              } catch (e) {
                  window.location.hash = hash;
              }
          }
      }
  };

  const handleSwapSplitPanes = () => {
    if (!secondaryTab) return;
    const oldPrimary = activeTab;
    const oldSecondary = secondaryTab;
    setActiveTabState(oldSecondary);
    setSecondaryTab(oldPrimary);
    localStorage.setItem('app_secondary_tab', oldPrimary);
  };

  const handleCloseSecondaryTab = () => {
    setSecondaryTab(null);
    localStorage.removeItem('app_secondary_tab');
  };

  const handleSelectSecondaryTab = (tabId: string) => {
    if (!tabId || tabId === activeTab) {
      handleCloseSecondaryTab();
      return;
    }
    // Prevent unauthorized tab opening in Split View
    if (allowedNavItems.length > 0 && !allowedNavItems.some(i => i.id === tabId)) {
      return;
    }
    setSecondaryTab(tabId);
    setOpenWorkstationTabs(prev => prev.includes(tabId) ? prev : [...prev, tabId]);
    localStorage.setItem('app_secondary_tab', tabId);
    setMobileActiveSplitPane('secondary');
  };

  const handleDropToSplitLeft = (tabId: string) => {
    if (!tabId) return;
    if (allowedNavItems.length > 0 && !allowedNavItems.some(i => i.id === tabId)) {
      return;
    }

    if (tabId === activeTab) {
      // User dragged current active tab into split pane
      if (secondaryTab && secondaryTab !== tabId) {
        // Swap primary and secondary
        const oldActive = activeTab;
        const oldSecondary = secondaryTab;
        setActiveTab(oldSecondary);
        setSecondaryTab(oldActive);
        localStorage.setItem('app_secondary_tab', oldActive);
        setMobileActiveSplitPane('secondary');
      } else {
        // Split with another open tab or allow selecting
        const candidate = openWorkstationTabs.find(t => t !== tabId && allowedNavItems.some(i => i.id === t))
          || allowedNavItems.find(i => i.id !== tabId)?.id;
        if (candidate) {
          setActiveTab(candidate);
          setSecondaryTab(tabId);
          localStorage.setItem('app_secondary_tab', tabId);
          setOpenWorkstationTabs(prev => prev.includes(candidate) ? prev : [...prev, candidate]);
          setMobileActiveSplitPane('secondary');
        } else {
          setIsSplitSelectorOpen(true);
        }
      }
    } else {
      handleSelectSecondaryTab(tabId);
    }
  };

  const handleDropToSplitRight = (tabId: string) => {
    if (!tabId) return;
    if (allowedNavItems.length > 0 && !allowedNavItems.some(i => i.id === tabId)) {
      return;
    }

    if (tabId === secondaryTab) {
      // Secondary tab dragged to right (primary) -> swap
      const oldActive = activeTab;
      setActiveTab(tabId);
      setSecondaryTab(oldActive);
      localStorage.setItem('app_secondary_tab', oldActive);
      setMobileActiveSplitPane('primary');
    } else {
      setActiveTab(tabId);
      setOpenWorkstationTabs(prev => prev.includes(tabId) ? prev : [...prev, tabId]);
      setMobileActiveSplitPane('primary');
    }
  };

  const handleDropToFloat = (tabId: string) => {
    if (!tabId) return;
    if (allowedNavItems.length > 0 && !allowedNavItems.some(i => i.id === tabId)) return;
    if (tabId === secondaryTab) {
      handleCloseSecondaryTab();
    }
    handlePopOutFloating(tabId);
  };

  // Security guard: Ensure activeTab, secondaryTab, floatingTab and open tabs are strictly permitted
  useEffect(() => {
    if (!currentUser || allowedNavItems.length === 0) return;
    const allowedSet = new Set(allowedNavItems.map(i => i.id));

    if (secondaryTab && !allowedSet.has(secondaryTab)) {
      handleCloseSecondaryTab();
    }

    if (floatingTab && !allowedSet.has(floatingTab)) {
      handleCloseFloating();
    }

    if (activeTab && !allowedSet.has(activeTab)) {
      const fallbackTab = allowedSet.has('dashboard') ? 'dashboard' : allowedNavItems[0]?.id || 'dashboard';
      setActiveTab(fallbackTab);
    }

    setOpenWorkstationTabs(prev => {
      const filtered = prev.filter(t => allowedSet.has(t));
      return filtered.length > 0 ? filtered : ['dashboard'];
    });
  }, [currentUser?.username, currentUser?.role, allowedNavItems]);

  const handlePopOutFloating = (tabId: string) => {
    setFloatingTab(tabId);
    setIsFloatingMinimized(false);
    if (secondaryTab === tabId) {
      handleCloseSecondaryTab();
    }
  };

  const handleCloseFloating = () => {
    setFloatingTab(null);
    setIsFloatingMinimized(false);
  };

  const handleCloseWorkstationTab = (tabId: string) => {
    setOpenWorkstationTabs(prev => prev.filter(t => t !== tabId));
    if (secondaryTab === tabId) {
      handleCloseSecondaryTab();
    }
    if (floatingTab === tabId) {
      handleCloseFloating();
    }
    if (activeTab === tabId) {
      const remaining = openWorkstationTabs.filter(t => t !== tabId);
      setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1] : 'dashboard');
    }
  };

  const goBack = (isPopState: boolean = false) => {
      // 0. Debounce duplicate rapid invocations (e.g. Capacitor backButton + browser popstate firing within 350ms)
      const now = Date.now();
      if (now - lastBackTimestampRef.current < 350) {
          return true;
      }
      lastBackTimestampRef.current = now;

      // 1. Registered custom handler (e.g. viewer open, sub-dialogs)
      if (customBackRef.current) {
          try {
              customBackRef.current();
              return true;
          } catch (e) {
              console.warn('Error in custom back handler:', e);
          }
      }
      
      // 2. Modals and drawers check (close top-most open modal/drawer first)
      const activeModals = Array.from(
          document.querySelectorAll('.fixed.inset-0:not(.pointer-events-none):not(.invisible):not(.opacity-0), [role="dialog"], .notification-dropdown-container, .glass-panel.fixed:not(.pointer-events-none):not(.bottom-nav-bar), .modal-active')
      ).filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && !el.classList.contains('pointer-events-none');
      });

      if (activeModals.length > 0) {
          const lastModal = activeModals[activeModals.length - 1];
          const closeBtn = lastModal.querySelector('button[onClick], .modal-close-btn, [aria-label="بستن"], [data-close-modal="true"], [data-close-announcement="true"]') as HTMLElement;
          if (closeBtn) {
              closeBtn.click();
          } else {
              // Brute force click the first button that looks like a close/cancel
              const fallbackBtn = Array.from(lastModal.querySelectorAll('button')).find(btn => {
                  const txt = (btn.textContent || '').trim();
                  const hasCloseIcon = btn.querySelector('.lucide-x, .lucide-x-circle, .lucide-chevron-right, .lucide-arrow-right');
                  const hasRedText = btn.className.includes('red');
                  return txt.includes('بستن') || txt.includes('انصراف') || txt.includes('✕') || hasCloseIcon || hasRedText;
              }) as HTMLElement;
              
              if (fallbackBtn) {
                  fallbackBtn.click();
              } else {
                   window.dispatchEvent(new CustomEvent('CLOSE_ACTIVE_MODALS'));
              }
          }
          return true;
      }

      // 3. Sub-view / Detail view check inside active module (e.g. Trade record detail, Purchase request detail)
      const subviewBackBtn = document.querySelector('button[data-subtab-back="true"], button[data-module-back="true"], .subtab-back-btn') as HTMLElement;
      if (subviewBackBtn) {
          const style = window.getComputedStyle(subviewBackBtn);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
              subviewBackBtn.click();
              return true;
          }
      }

      // 4. Tab history back (pop exactly ONE tab step)
      if (tabHistoryRef.current.length > 1) {
          setTabHistory(prev => {
              if (prev.length <= 1) return prev;
              const newHist = [...prev];
              newHist.pop();
              const prevTab = newHist[newHist.length - 1];
              setActiveTabState(prevTab);
              safeReplaceState({ tab: prevTab }, '', `#${prevTab}`);
              return newHist;
          });
          return true;
      }

      // 5. Force back to dashboard if not at dashboard
      if (activeTabRef.current !== 'dashboard') {
          setActiveTab('dashboard', false);
          activeTabRef.current = 'dashboard';
          return true;
      }

      return false; // Let native behavior handle exit
  };

  const safePushState = (state: any, title: string, url: string) => {
    try { window.history.pushState(state, title, url); } catch (e) { window.location.hash = url; }
  };
  
  const safeReplaceState = (state: any, title: string, url: string) => {
    try { window.history.replaceState(state, title, url); } catch (e) { window.location.hash = url; }
  };
  const [financialYear, setFinancialYearState] = useState<string>(new Date().toLocaleDateString('fa-IR-u-nu-latn').split('/')[0]);
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('theme') || 'light-aurora');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem('app_dark_mode') === 'true');
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showNetworkRoleModal, setShowNetworkRoleModal] = useState<boolean>(false);

  useEffect(() => {
    const isTauriDesktop = typeof window !== 'undefined' && !!(window as any).__TAURI__;
    if (isTauriDesktop && !localStorage.getItem('sayan_network_role')) {
      setShowNetworkRoleModal(true);
    }
    const handleOpenRoleModal = () => setShowNetworkRoleModal(true);
    window.addEventListener('open-network-role-settings', handleOpenRoleModal);
    return () => window.removeEventListener('open-network-role-settings', handleOpenRoleModal);
  }, []);

  const applyThemeToRoot = (themeName: string, dark: boolean) => {
    const root = document.documentElement;
    root.classList.remove(
      'dark',
      'theme-light-aurora',
      'theme-bento',
      'theme-claymorphism',
      'theme-skeuomorphism',
      'theme-minimalism',
      'theme-maximalism',
      'theme-gold-noir'
    );
    if (themeName && themeName !== 'light') {
      root.classList.add(themeName);
    }
    if (dark) {
      root.classList.add('dark');
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light-aurora';
    const savedDark = localStorage.getItem('app_dark_mode') === 'true';
    setTheme(savedTheme);
    setIsDarkMode(savedDark);
    applyThemeToRoot(savedTheme, savedDark);
  }, []);

  useEffect(() => {
    const handleBgChange = () => {
      // Just notify components of background change without forcing light theme override
    };
    
    handleBgChange();
    window.addEventListener('APP_THEME_BG_CHANGED', handleBgChange);
    return () => window.removeEventListener('APP_THEME_BG_CHANGED', handleBgChange);
  }, []);

  const toggleTheme = () => {
    setShowThemeModal(true);
  };

  const handleToggleDarkMode = () => {
    setIsDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('app_dark_mode', next ? 'true' : 'false');
      applyThemeToRoot(theme, next);
      return next;
    });
  };

  const handleSelectTheme = (newTheme: AppThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyThemeToRoot(newTheme, isDarkMode);
  };
  const [orders, setOrders] = useState<PaymentOrder[]>(() => {
    try { const item = localStorage.getItem('app_data_orders'); return item ? JSON.parse(item) : []; } catch { return []; }
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try { const item = localStorage.getItem('app_data_chat'); return item ? JSON.parse(item) : []; } catch { return []; }
  }); 
  const [appGroups, setAppGroups] = useState<ChatGroup[]>(() => {
    try { const item = localStorage.getItem('app_data_groups'); return item ? JSON.parse(item) : []; } catch { return []; }
  });
  const [appTaskGroups, setAppTaskGroups] = useState<TaskGroup[]>(() => {
    try { const item = localStorage.getItem('app_data_task_groups'); return item ? JSON.parse(item) : []; } catch { return []; }
  }); 
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const notificationsRef = useRef<AppNotification[]>([]);
  const sessionStartTimeRef = useRef(Date.now());
  const [manageOrdersInitialTab, setManageOrdersInitialTab] = useState<'current' | 'archive'>('current');
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<any>(null); 
  const [exitPermitStatusFilter, setExitPermitStatusFilter] = useState<'pending' | null>(null);

  const [toast, setToast] = useState<{show: boolean, title: string, message: string} | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  const [backgroundJobs, setBackgroundJobs] = useState<{order: PaymentOrder, type: 'create' | 'approve'}[]>([]);
  const [sharedData, setSharedData] = useState<{ fileUrl?: string; text?: string; title?: string } | null>(null);
  const processingJobRef = useRef(false);

  const isSyncingRef = useRef(false);
  const syncPendingRef = useRef(false);
  const isFirstLoad = useRef(true);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const IDLE_LIMIT = 60 * 60 * 1000; 
  const NOTIFICATION_CHECK_KEY = 'last_notification_check';
  
  const lastChatMsgIdRef = useRef<string | null>(null);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNative) {
        let backListener: any;
        try {
            CapacitorApp.addListener('backButton', ({ canGoBack }) => {
                const handled = goBack();
                if (!handled && !canGoBack && activeTabRef.current === 'dashboard') {
                    CapacitorApp.exitApp();
                }
            }).then(l => { backListener = l; });
        } catch(e) { console.error("Back button listener error", e); }
        
        try {
            const mapNotificationUrlToTab = (url: string | undefined): string | null => {
                if (!url) return null;
                const path = url.replace('#', '').trim().toLowerCase();
                
                if (path.includes('chat')) return 'chat';
                if (path.includes('payment-approvals') || path.includes('payment-orders') || path.includes('manage')) return 'manage';
                if (path.includes('exit-permits') || path.includes('exit-approvals') || path.includes('exit') || path.includes('manage-exit')) return 'manage-exit';
                if (path.includes('security-panel') || path.includes('security')) return 'security';
                if (path.includes('warehouse')) return 'warehouse';
                if (path.includes('balances')) return 'balances';
                if (path.includes('purchase')) return 'purchase';
                if (path.includes('meetings')) return 'meetings';
                if (path.includes('invoices') || path.includes('manage-invoices')) return 'manage-invoices';
                
                const cleaned = path.replace(/^\//, ''); // remove leading slash
                const validTabs = ['dashboard', 'create', 'manage', 'chat', 'trade', 'users', 'settings', 'create-exit', 'manage-exit', 'manage-invoices', 'warehouse', 'security', 'purchase', 'balances', 'meetings', 'knowledge', 'ccti', 'sayan'];
                if (validTabs.includes(cleaned)) {
                    return cleaned;
                }
                return null;
            };

            const mapNotificationToChatTarget = (urlStr: string | undefined) => {
                if (!urlStr) return null;
                try {
                    const searchPart = urlStr.includes('?') ? urlStr.substring(urlStr.indexOf('?')) : '';
                    const params = new URLSearchParams(searchPart);
                    const pv = params.get('pv');
                    const group = params.get('group');
                    if (pv) return { type: 'private' as const, id: pv };
                    if (group) return { type: 'group' as const, id: group };
                } catch (e) {}
                return null;
            };

            const dispatchPurchaseDeepLink = (urlStr: string) => {
                try {
                    if (!urlStr || !urlStr.includes('?')) return;
                    const searchStr = urlStr.substring(urlStr.indexOf('?'));
                    const params = new URLSearchParams(searchStr);
                    const requestId = params.get('requestId');
                    const subTab = params.get('subTab');
                    if (requestId) {
                        const payload = { requestId, subTab: subTab || 'comments' };
                        sessionStorage.setItem('pending_purchase_deep_link', JSON.stringify(payload));
                        window.dispatchEvent(new CustomEvent('OPEN_PURCHASE_REQUEST_DETAILS', { detail: payload }));
                    }
                } catch {}
            };

            PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                const data = notification.notification.data;
                console.log("Push Action Data:", data);
                if (data && data.url) {
                    const mappedTab = mapNotificationUrlToTab(data.url);
                    if (mappedTab) setActiveTab(mappedTab);
                    
                    const chatTarget = mapNotificationToChatTarget(data.url);
                    if (chatTarget) setDirectChatTarget(chatTarget);
                    
                    if (data.url.includes('?')) {
                        const searchStr = data.url.substring(data.url.indexOf('?'));
                        if (searchStr.length > 1) window.history.pushState({}, '', window.location.pathname + searchStr);
                        dispatchPurchaseDeepLink(data.url);
                    }
                }
            });

            LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
                const data = action.notification.extra;
                console.log("Local action data:", data);
                if (data && data.url) {
                    const mappedTab = mapNotificationUrlToTab(data.url);
                    if (mappedTab) setActiveTab(mappedTab);
                    
                    const chatTarget = mapNotificationToChatTarget(data.url);
                    if (chatTarget) setDirectChatTarget(chatTarget);
                    
                    if (data.url.includes('?')) {
                        const searchStr = data.url.substring(data.url.indexOf('?'));
                        if (searchStr.length > 1) window.history.pushState({}, '', window.location.pathname + searchStr);
                        dispatchPurchaseDeepLink(data.url);
                    }
                }
            });
        } catch(e) { console.error("Notification Listener Error", e); }

        // --- ANDROID INTENT SUPPORT (Simplified) & SHARE TARGET plugin ---
        try {
            CapacitorApp.addListener('appRestoredResult', (data: any) => {
                if (data.pluginId === 'Share' || data.pluginId === 'App' || !data.pluginId) {
                    const result = data.data;
                    if (result && (result.url || result.text || result.uri)) {
                         setSharedData({ fileUrl: result.url || result.uri, text: result.text, title: result.title });
                         setTimeout(() => setActiveTab('chat'), 500);
                    }
                }
            });
            
            // Also try to catch it in appUrlOpen
            CapacitorApp.addListener('appUrlOpen', (data: any) => {
                if (data.url && (data.url.includes('sharedFileUrl') || data.url.includes('sharedText'))) {
                    // This case is already handled by the other useEffect but let's be sure
                    setTimeout(() => setActiveTab('chat'), 500);
                }
            });

            // Register @capgo/capacitor-share-target listener
            const initShareTarget = async () => {
                try {
                    const { CapacitorShareTarget } = await import('@capgo/capacitor-share-target');
                    CapacitorShareTarget.addListener('shareReceived', (event: any) => {
                        console.log("CapacitorShareTarget shareReceived event:", event);
                        if (event) {
                            const text = event.text || (event.texts && event.texts.length > 0 ? event.texts[0] : undefined);
                            const fileUrl = event.files && event.files.length > 0 ? (event.files[0].uri || event.files[0].url || event.files[0].path) : undefined;
                            const title = event.title || undefined;
                            
                            if (text || fileUrl) {
                                setSharedData({ fileUrl, text, title });
                                setTimeout(() => setActiveTab('chat'), 500);
                            }
                        }
                    });
                } catch (err) {
                    console.error("Failed to load optional CapacitorShareTarget", err);
                }
            };
            initShareTarget();
        } catch (e) { console.error("App Restored Error", e); }

        return () => {
            if (backListener) backListener.remove();
        };
    }
  }, []);

  useEffect(() => {
      const handleJob = (e: CustomEvent) => { setBackgroundJobs(prev => [...prev, e.detail]); };
      const handleGoBack = () => { goBack(); };
      window.addEventListener('QUEUE_WHATSAPP_JOB' as any, handleJob);
      window.addEventListener('GO_BACK', handleGoBack);
      return () => {
          window.removeEventListener('QUEUE_WHATSAPP_JOB' as any, handleJob);
          window.removeEventListener('GO_BACK', handleGoBack);
      };
  }, []);

  useEffect(() => { if (backgroundJobs.length > 0 && !processingJobRef.current) { processNextJob(); } }, [backgroundJobs]);

  const processNextJob = async () => {
      if (backgroundJobs.length === 0) return;
      processingJobRef.current = true;
      try {
          const job = backgroundJobs[0];
          const { order, type } = job;
          const mode = settings?.botPaymentNotificationMode || 'step_by_step';
          const isFinal = order.status === OrderStatus.APPROVED_CEO || order.status === OrderStatus.PAID;
          
          if (type === 'approve') {
              if (mode === 'after_submit' || (mode === 'after_final' && !isFinal)) {
                  setBackgroundJobs(prev => prev.slice(1));
                  return;
              }
          }

          // Small yield to let DOM mount without blocking UI
          await new Promise(resolve => setTimeout(resolve, 200));
          const element = document.getElementById(`bg-print-voucher-${order.id}`);
          if (element) {
              try {
                  let base64 = '';
                  try {
                      const dataUrl = await toJpeg(element, { quality: 0.9, pixelRatio: 1.5, backgroundColor: '#ffffff' });
                      base64 = dataUrl.split(',')[1] || '';
                  } catch (renderErr) {
                      // Fallback to html2canvas if available
                      // @ts-ignore
                      if (window.html2canvas) {
                          // @ts-ignore
                          const canvas = await window.html2canvas(element, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true });
                          base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
                      }
                  }

                  let usersList = getLocalData<User[]>(LS_KEYS.USERS, []);
                  if (!usersList || usersList.length === 0) {
                      try {
                          usersList = await getUsers();
                      } catch {
                          usersList = [];
                      }
                  }

                  let targetUser: User | undefined;
                  let caption = '';
                  
                  if (type === 'create') {
                      targetUser = usersList.find(u => u.role === UserRole.FINANCIAL && u.phoneNumber);
                      caption = `📢 *درخواست پرداخت جدید*\nشماره: ${order.trackingNumber}\nمبلغ: ${formatCurrency(order.totalAmount)}\nدرخواست کننده: ${order.requester}\n\nلطفا بررسی نمایید.`;
                  } else if (type === 'approve') {
                      if (order.status === OrderStatus.APPROVED_FINANCE) { 
                          targetUser = usersList.find(u => u.role === UserRole.MANAGER && u.phoneNumber); 
                          caption = `✅ *تایید مالی انجام شد*\nشماره: ${order.trackingNumber}\nمنتظر تایید مدیریت.`; 
                      } else if (order.status === OrderStatus.APPROVED_MANAGER) { 
                          targetUser = usersList.find(u => u.role === UserRole.CEO && u.phoneNumber); 
                          caption = `✅ *تایید مدیریت انجام شد*\nشماره: ${order.trackingNumber}\nمنتظر تایید نهایی مدیرعامل.`; 
                      } else if (order.status === OrderStatus.APPROVED_CEO) { 
                          targetUser = usersList.find(u => u.role === UserRole.FINANCIAL && u.phoneNumber); 
                          caption = `💰 *دستور پرداخت تایید نهایی شد*\nشماره: ${order.trackingNumber}\nلطفا پرداخت نمایید.`; 
                      }
                  }
                  if (targetUser && targetUser.phoneNumber && base64) {
                      try {
                          await apiCall('/send-whatsapp', 'POST', { 
                              number: targetUser.phoneNumber, 
                              message: caption, 
                              mediaData: { data: base64, mimeType: 'image/jpeg', filename: `Order_${order.trackingNumber}.jpg` } 
                          });
                      } catch (waErr) {
                          console.warn("Non-blocking background WhatsApp notification skipped:", waErr);
                      }
                  }

                  if (settings?.botAccountingGroupIdWhatsApp && base64) {
                      try {
                          await apiCall('/send-whatsapp', 'POST', { 
                              number: settings.botAccountingGroupIdWhatsApp, 
                              message: caption, 
                              mediaData: { data: base64, mimeType: 'image/jpeg', filename: `Order_${order.trackingNumber}.jpg` } 
                          });
                      } catch (gErr) {
                          console.warn("Non-blocking background group WhatsApp notification skipped:", gErr);
                      }
                  }
              } catch (e) { 
                  console.warn("Background Job execution warning:", e); 
              }
          }
      } catch (globalErr) {
          console.error("Background Job Queue Error", globalErr);
      } finally {
          setBackgroundJobs(prev => prev.slice(1));
          processingJobRef.current = false;
      }
  };

  useEffect(() => {
    const isPublic = checkIsPublicBioRoute();
    setIsPublicBioView(isPublic);

    if (isPublic) {
      getBioLinkConfig().then(cfg => {
        if (cfg) setPublicBioConfig(cfg);
      }).catch(console.error);
    }

    const handleRouteCheck = () => {
      const stillPublic = checkIsPublicBioRoute();
      setIsPublicBioView(stillPublic);
      const stillSurvey = checkIsPublicSurveyRoute();
      setIsPublicSurveyView(stillSurvey);
      if (stillPublic) {
        getBioLinkConfig().then(cfg => {
          if (cfg) setPublicBioConfig(cfg);
        }).catch(console.error);
      }
    };

    window.addEventListener('popstate', handleRouteCheck);
    window.addEventListener('hashchange', handleRouteCheck);

    if (isNative || isPublic) {
      return () => {
        window.removeEventListener('popstate', handleRouteCheck);
        window.removeEventListener('hashchange', handleRouteCheck);
      };
    }

    // Ensure we have a base history entry ONLY when not in public bio view
    if (window.history.length <= 1) {
        safeReplaceState({ tab: 'dashboard' }, '', '#dashboard');
        safePushState({ tab: 'dashboard', root: true }, '', '#dashboard');
    }

    const defaultTab = (window.location.hash || '').replace(/^#\/?/, '') || 'dashboard';
    const validTabs = ['dashboard', 'create', 'manage', 'chat', 'trade', 'users', 'settings', 'create-exit', 'manage-exit', 'manage-invoices', 'warehouse', 'security', 'purchase', 'balances', 'ccti', 'sayan', 'cheque-receipts', 'digital-card'];

    if (validTabs.includes(defaultTab)) {
        setActiveTabState(defaultTab); 
        safeReplaceState({ tab: defaultTab }, '', `#${defaultTab}`);
    } else { 
        safeReplaceState({ tab: 'dashboard' }, '', '#dashboard'); 
    }

    const handlePopState = (event: PopStateEvent) => {
        if (checkIsPublicBioRoute() || checkIsPublicSurveyRoute()) return;
        const handled = goBack(true);
        if (!handled && event.state?.tab) {
            setActiveTab(event.state.tab, false);
        }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handleRouteCheck);
      window.removeEventListener('hashchange', handleRouteCheck);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const handleUrlOpen = (data: any) => {
        try {
            const url = new URL(data.url);
            const params = new URLSearchParams(url.search);
            const sUrl = params.get('sharedFileUrl');
            const sText = params.get('sharedText');
            if (sUrl || sText) {
                setSharedData({ fileUrl: sUrl || undefined, text: sText || undefined });
                setActiveTab('chat');
            }
            
            // Extract chat direct targeting on deep link opening
            const pv = params.get('pv');
            const group = params.get('group');
            if (pv || group) {
                setDirectChatTarget({
                    type: pv ? 'private' : 'group',
                    id: pv || group || ''
                });
                setActiveTab('chat');
            }
        } catch (e) {}
    };

    if (isNative) {
        CapacitorApp.addListener('appUrlOpen', handleUrlOpen);
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'NAVIGATE') {
            try {
                const url = new URL(event.data.url);
                let path = url.pathname.replace(/^\/+/, '');
                if (!path) path = url.hash.replace(/^#\/?/, '');
                
                // Extract search params
                const params = new URLSearchParams(url.search);
                const pv = params.get('pv');
                const group = params.get('group');
                
                if (pv || group) {
                    setDirectChatTarget({
                        type: pv ? 'private' : 'group',
                        id: pv || group || ''
                    });
                }

                const validTabs = ['dashboard', 'create', 'manage', 'chat', 'trade', 'users', 'settings', 'create-exit', 'manage-exit', 'manage-invoices', 'warehouse', 'security', 'purchase', 'balances', 'meetings', 'knowledge', 'ccti', 'sayan', 'cheque-receipts'];
                if (validTabs.includes(path) || path === '') {
                    const targetTab = path || 'dashboard';
                    setActiveTab(targetTab);
                    try {
                        window.history.replaceState({ tab: targetTab }, '', `/#${targetTab}`);
                    } catch (e) {}
                }
            } catch(e) {}
        }
    };
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    const params = new URLSearchParams(window.location.search);
    const sharedFileUrl = params.get('sharedFileUrl');
    const sharedText = params.get('sharedText');
    const sharedTitle = params.get('sharedTitle');
    
    const pv = params.get('pv');
    const group = params.get('group');

    if (pv || group) {
        setDirectChatTarget({
            type: pv ? 'private' : 'group',
            id: pv || group || ''
        });
        setActiveTab('chat');
        try {
            const urlWithoutParams = window.location.protocol + "//" + window.location.host + "/#chat";
            window.history.replaceState({ path: urlWithoutParams, tab: 'chat' }, '', urlWithoutParams);
        } catch (e) {}
    } else if (sharedFileUrl || sharedText || sharedTitle) {
      setSharedData({
        fileUrl: sharedFileUrl || undefined,
        text: sharedText || undefined,
        title: sharedTitle || undefined,
      });
      // Switch to the chat tab
      setActiveTab('chat');
      
      // Clean up URL query parameters so refresh doesn't trigger again
      try {
        const urlWithoutParams = window.location.protocol + "//" + window.location.host + "/#chat";
        window.history.replaceState({ path: urlWithoutParams, tab: 'chat' }, '', urlWithoutParams);
      } catch (e) {
        console.error("Failed to clean query parameters", e);
      }
    } else if (window.location.pathname === '/chat') {
      setActiveTab('chat');
      try {
        window.history.replaceState({ tab: 'chat' }, '', '/#chat');
      } catch (e) {}
    }
  }, []);

  useEffect(() => { 
    if (isPublicBioView) return;
    const restoreSession = async () => {
      let user = getCurrentUser(); 
      // On native Android / Capacitor, if localStorage was purged by OS, fallback to Preferences
      if (!user && Capacitor.isNativePlatform()) {
        try {
          const pref = await Preferences.get({ key: 'app_current_user_data' });
          if (pref.value) {
            user = JSON.parse(pref.value);
            if (user) {
              localStorage.setItem('app_current_user', JSON.stringify(user));
            }
          }
        } catch (e) {
          console.warn('[NativeAuth] Could not restore from Preferences:', e);
        }
      }
      if (user) {
        setCurrentUser(user); 
        syncServiceWorkerAuth(user).catch(console.error);
      } else {
        syncServiceWorkerAuth(null).catch(console.error);
      }
      syncNativeShownNotifications().catch(console.error);
      syncServiceWorkerShownNotifications().catch(console.error);
    };
    restoreSession();
  }, [isPublicBioView]);

  useEffect(() => {
    const handleTabChange = (e: any) => {
        if (e.detail) setActiveTab(e.detail);
    };
    const handleOpenNotes = () => setActiveTab('notes');
    window.addEventListener('CHANGE_TAB' as any, handleTabChange);
    window.addEventListener('OPEN_NOTES_TAB' as any, handleOpenNotes);
    return () => {
        window.removeEventListener('CHANGE_TAB' as any, handleTabChange);
        window.removeEventListener('OPEN_NOTES_TAB' as any, handleOpenNotes);
    };
  }, []);

  const handleLogout = async () => { 
      const endpoint = localStorage.getItem('push_endpoint');
      const user = currentUser;
      
      // Clear Google OAuth active session so the next user doesn't inherit it
      logoutGoogleWorkspace(user?.id).catch(console.error);

      // 1. Clear local user session state immediately
      authLogout(); 
      if (Capacitor.isNativePlatform()) {
        Preferences.remove({ key: 'app_current_user_data' }).catch(() => {});
        Preferences.remove({ key: 'user_username' }).catch(() => {});
        Preferences.remove({ key: 'user_role' }).catch(() => {});
        Preferences.remove({ key: 'user_logged_in' }).catch(() => {});
      }
      setCurrentUser(null); 
      isFirstLoad.current = true; 
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }

      // 2. Perform thorough push manager unsubscription, cache clearance, and backend cleanup
      unsubscribeFromPushNotifications(user, endpoint).catch(e => {
          console.error("Unregister push token failed on logout", e);
      });
  };

  useEffect(() => {
    if (settings) {
        // Meta Updates
        if (settings.appName) {
            document.title = settings.appName;
            const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
            if (appleTitle) appleTitle.setAttribute('content', settings.appName);
        }

        const iconUrl = settings.pwaIcon || "/lepan-logo.png";

        // Favicon update
        let favicon = document.querySelector('link[rel="icon"]');
        if (!favicon) {
            favicon = document.createElement('link');
            // @ts-ignore
            favicon.rel = 'icon';
            document.head.appendChild(favicon);
        }
        favicon.setAttribute('href', iconUrl);

        // Apple Touch Icon
        let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
        if (!appleIcon) {
            appleIcon = document.createElement('link');
            // @ts-ignore
            appleIcon.rel = 'apple-touch-icon';
            document.head.appendChild(appleIcon);
        }
        appleIcon.setAttribute('href', iconUrl);

        // Manifest - Use the server-side generated route
        let manifestLink = document.querySelector('link[rel="manifest"]');
        if (!manifestLink) {
            manifestLink = document.createElement('link');
            // @ts-ignore
            manifestLink.rel = 'manifest';
            document.head.appendChild(manifestLink);
        }
        // Force refresh manifest if icon changes by adding dynamic version
        const iconHash = iconUrl.substring(iconUrl.length - 10);
        manifestLink.setAttribute('href', `/manifest.json?v=${iconHash}`);
    }
  }, [settings]);

  // Inactivity timeout:
  // Strictly applies ONLY to standard Web browsers (URL in browser).
  // Native Android and Windows Desktop apps MUST NEVER have an idle timeout or auto-logout;
  // they remain permanently authenticated until the user explicitly clicks logout,
  // allowing background push notifications and SSE to operate continuously without interruption.
  useEffect(() => {
    const enforceIdle = shouldEnforceIdleTimeout();
    if (currentUser && enforceIdle) {
        let lastReset = 0;
        const resetIdleTimer = () => {
            const now = Date.now();
            if (now - lastReset < 5000) return;
            lastReset = now;
            if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
            idleTimeoutRef.current = setTimeout(() => {
                handleLogout();
                alert("به دلیل عدم فعالیت به مدت ۱ ساعت در مرورگر وب، از سیستم خارج شدید.");
            }, IDLE_LIMIT);
        };
        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
        events.forEach(event => window.addEventListener(event, resetIdleTimer, { passive: true }));
        resetIdleTimer();
        return () => {
            events.forEach(event => window.removeEventListener(event, resetIdleTimer));
            if (idleTimeoutRef.current) {
                clearTimeout(idleTimeoutRef.current);
                idleTimeoutRef.current = null;
            }
        };
    } else {
        // Clear any lingering idle timer immediately for Android and Windows desktop
        if (idleTimeoutRef.current) {
            clearTimeout(idleTimeoutRef.current);
            idleTimeoutRef.current = null;
        }
    }
  }, [currentUser]);

  const playNotificationSound = () => { 
      try { 
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
              const ctx = new AudioContextClass();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(880, ctx.currentTime);
              gain.gain.setValueAtTime(0.15, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
              osc.start(ctx.currentTime);
              osc.stop(ctx.currentTime + 0.25);
          }
      } catch (e) { } 
  };

  const showToast = (title: string, message: string) => {
      if (isPublicBioView) return;
      playNotificationSound();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      setToast({ show: true, title, message });
      toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  };

  const addAppNotification = (title: string, message: string, url?: string) => { 
      if (isPublicBioView) return;
      // Only for local non-db alerts (like cheque alerts), though they will be 
      // overwritten if setNotifications is called. The toast is more important.
      showToast(title, message);
      sendNotification(title, message, url ? { url } : null);
  };

  const removeNotification = (id: string) => { 
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      notificationsRef.current = notificationsRef.current.map(n => n.id === id ? { ...n, read: true } : n);
      markNotificationAsShown(id);
      if (currentUser) apiCall('/notifications/read', 'POST', { username: currentUser.username, id }).catch(console.error);
  };

  const deleteNotification = (id: string) => {
      setNotifications(prev => prev.filter(n => n.id !== id));
      notificationsRef.current = notificationsRef.current.filter(n => n.id !== id);
      markNotificationAsShown(id);
      if (currentUser) apiCall('/notifications/delete', 'POST', { username: currentUser.username, id }).catch(console.error);
  };
  const closeToast = () => { setToast(null); if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current); };

  const setFinancialYear = async (yearLabel: string) => {
      setFinancialYearState(yearLabel);
      if (settings && settings.fiscalYears) {
          const year = settings.fiscalYears.find(y => y.label === yearLabel);
          if (year && year.id !== settings.activeFiscalYearId) {
              const updated = { ...settings, activeFiscalYearId: year.id };
              await saveSettings(updated);
              setSettings(updated);
          }
      }
  };

  const loadData = async (silent = false) => {
    if (!currentUser || isPublicBioView) return;
    if (isSyncingRef.current) {
        syncPendingRef.current = true;
        return;
    }
    isSyncingRef.current = true;

    // Deduplicate background push shown alerts dynamically
    try {
        await Promise.all([
            syncNativeShownNotifications().catch(() => {}),
            syncServiceWorkerShownNotifications().catch(() => {})
        ]);
    } catch (e) {
        console.warn("Deduplication sync failed", e);
    }
    
    if (!silent && isFirstLoad.current) {
        const cachedOrders = getLocalData<PaymentOrder[]>(LS_KEYS.ORDERS, []);
        const cachedSettings = getLocalData<SystemSettings>(LS_KEYS.SETTINGS, { currentTrackingNumber: 1000 } as any);
        const cachedMessages = getLocalData<ChatMessage[]>(LS_KEYS.CHAT, []); 
        
        if (cachedOrders.length > 0) setOrders(cachedOrders);
        if (cachedSettings) {
            setSettings(cachedSettings);
            if (cachedSettings.activeFiscalYearId && cachedSettings.fiscalYears) {
                const activeYear = cachedSettings.fiscalYears.find(y => y.id === cachedSettings.activeFiscalYearId);
                if (activeYear) setFinancialYearState(activeYear.label);
            }
        }
        if (cachedMessages.length > 0) {
            setChatMessages(cachedMessages);
            if (cachedMessages.length > 0) lastChatMsgIdRef.current = cachedMessages[cachedMessages.length - 1].id;
        }
    }

    if (!silent && orders.length === 0) setLoading(true);

    try {
        // --- OPTIMIZATION: LOAD SETTINGS SEPARATELY FIRST ---
        // This ensures the UI renders correctly (permissions etc.) even if heavy data lags
        getSettings().then(settingsData => {
            if (settingsData) {
                // Sanitize settings arrays just in case
                if (!Array.isArray(settingsData.companies)) settingsData.companies = [];
                if (!Array.isArray(settingsData.companyNames)) settingsData.companyNames = [];
                if (!Array.isArray(settingsData.fiscalYears)) settingsData.fiscalYears = [];
                if (!Array.isArray(settingsData.savedContacts)) settingsData.savedContacts = [];

                // Sync companyNames with companies
                const companyMap = new Map<string, any>();
                settingsData.companies.forEach((c: any) => {
                    if (c && c.name && c.name.trim()) {
                        companyMap.set(c.name.trim(), {
                            ...c,
                            name: c.name.trim(),
                            banks: Array.isArray(c.banks) ? c.banks : []
                        });
                    }
                });
                settingsData.companyNames.forEach((name: string) => {
                    if (name && name.trim() && !companyMap.has(name.trim())) {
                        companyMap.set(name.trim(), {
                            id: Math.random().toString(36).substring(2, 11),
                            name: name.trim(),
                            showInWarehouse: true,
                            banks: []
                        });
                    }
                });

                let mergedCompanies = Array.from(companyMap.values());
                // Filter out default "شرکت اصلی" if other custom companies exist and default was not modified
                if (mergedCompanies.length > 1 && mergedCompanies.some(c => c.name !== 'شرکت اصلی')) {
                    mergedCompanies = mergedCompanies.filter(c => 
                        c.name !== 'شرکت اصلی' || 
                        c.logo || 
                        c.registrationNumber || 
                        c.nationalId || 
                        c.address || 
                        c.economicCode || 
                        (c.banks && c.banks.length > 0)
                    );
                }

                if (mergedCompanies.length === 0) {
                    mergedCompanies = [{ id: 'comp_default', name: 'شرکت اصلی', showInWarehouse: true, banks: [] }];
                }

                settingsData.companies = mergedCompanies;
                settingsData.companyNames = mergedCompanies.map((c: any) => c.name);

                setSettings(settingsData);
                
                // Sync global background image & theme settings across all clients (desktop, mobile web, Android)
                if (settingsData.customBgImage) {
                    localStorage.setItem('app_custom_bg_image', settingsData.customBgImage);
                } else if (settingsData.customBgImage === null) {
                    localStorage.removeItem('app_custom_bg_image');
                }
                if (settingsData.bgMode) {
                    localStorage.setItem('app_bg_mode', settingsData.bgMode);
                }
                if (settingsData.bgPreset) {
                    localStorage.setItem('app_preset_bg', settingsData.bgPreset);
                }
                if (settingsData.customBgBlur !== undefined) {
                    localStorage.setItem('app_custom_bg_blur', settingsData.customBgBlur.toString());
                }
                if (settingsData.customBgAdapt !== undefined) {
                    localStorage.setItem('app_custom_bg_adapt', settingsData.customBgAdapt ? 'true' : 'false');
                }
                window.dispatchEvent(new Event('APP_THEME_BG_CHANGED'));

                // Sync financial year state from server settings
                if (settingsData.activeFiscalYearId && settingsData.fiscalYears) {
                    const activeYear = settingsData.fiscalYears.find(y => y.id === settingsData.activeFiscalYearId);
                    if (activeYear) setFinancialYearState(activeYear.label);
                }
            }
        }).catch(err => console.error("Settings load error", err));

        // Load Heavy Data & Notifications in Parallel
        const [ordersData, messagesData, announcementsData, notifsData, groupsData, taskGroupsData] = await Promise.all([
            getOrders(),
            getMessages(),
            getSystemAnnouncements(),
            apiCall<any[]>(`/notifications?username=${currentUser.username}&role=${currentUser.role}`).catch(err => {
                console.error("Notifications fetch failed", err);
                // Return mapping of cached memory notifications to maintain continuity and prevent loop triggers
                return notificationsRef.current.map(n => ({
                    id: n.id,
                    title: n.title,
                    body: n.message,
                    createdAt: n.timestamp,
                    readBy: n.read ? [currentUser!.username] : [],
                    url: n.url
                }));
            }),
            getGroups().catch(() => []),
            getTaskGroups().catch(() => [])
        ]);
        
        if (Array.isArray(groupsData)) setAppGroups(groupsData);
        if (Array.isArray(taskGroupsData)) setAppTaskGroups(taskGroupsData);
        
        // --- SAFE GUARD & DEEP SANITIZATION ---
        const safeOrders = Array.isArray(ordersData) ? ordersData.map(o => ({
            ...o,
            paymentDetails: Array.isArray(o.paymentDetails) ? o.paymentDetails : [],
            attachments: Array.isArray(o.attachments) ? o.attachments : []
        })) : [];

        const safeMessages = Array.isArray(messagesData) ? messagesData : [];
        const safeAnnouncements = Array.isArray(announcementsData) ? announcementsData : [];
        
        // --- OPTIMIZATION: ONLY SET IF CHANGED ---
        const areOrdersEqual = (arr1: PaymentOrder[], arr2: PaymentOrder[]) => {
            if (arr1.length !== arr2.length) return false;
            for (let i = 0; i < arr1.length; i++) {
                if (arr1[i].id !== arr2[i].id || arr1[i].status !== arr2[i].status || arr1[i].updatedAt !== arr2[i].updatedAt) {
                    return false;
                }
            }
            return true;
        };
        const areChatEqual = (arr1: ChatMessage[], arr2: ChatMessage[]) => {
            if (arr1.length !== arr2.length) return false;
            const checkCount = Math.min(arr1.length, 15);
            for (let i = 0; i < checkCount; i++) {
                const idx1 = arr1.length - 1 - i;
                const idx2 = arr2.length - 1 - i;
                if (arr1[idx1].id !== arr2[idx2].id || arr1[idx1].timestamp !== arr2[idx2].timestamp || arr1[idx1].isEdited !== arr2[idx2].isEdited || arr1[idx1].readBy?.length !== arr2[idx2].readBy?.length) {
                    return false;
                }
            }
            return true;
        };

        setOrders(prev => areOrdersEqual(prev, safeOrders) ? prev : safeOrders);
        setChatMessages(prev => areChatEqual(prev, safeMessages) ? prev : safeMessages); 
        
        const isNotFirstSync = !isFirstLoad.current;

        // Process server notifications under ultra smart, responsive, and deduplicated rules
        if (notifsData && Array.isArray(notifsData)) {
            const mappedNotifs = notifsData.map((n: any) => ({
                id: n.id,
                title: n.title,
                message: n.body,
                timestamp: n.createdAt,
                read: n.readBy && n.readBy.includes(currentUser.username),
                url: n.url
            }));
            
            // Clean up / Mark all read or older notifications as shown to ensure cross-device deduplication
            mappedNotifs.forEach(n => {
                if (n.read || isFirstLoad.current) {
                    markNotificationAsShown(n.id);
                }
            });

            // Cross-Device Auto-Clear: If all notifications for this user are read (e.g. marked read on Windows),
            // automatically clear any active delivered notifications from the Android notification bar & Windows taskbar!
            if (mappedNotifs.length > 0 && mappedNotifs.every(n => n.read)) {
                clearAllActiveNotifications().catch(console.error);
            }

            // If a notification was read on another device while toast was open, auto-close toast
            if (toast && mappedNotifs.some(n => n.read && (n.title === toast.title || n.message === toast.message))) {
                setToast(null);
            }

            const prevIds = notificationsRef.current.map(n => n.id);
            // Filter unread notifications that have not been shown on this device yet
            const unnotifiedUnread = mappedNotifs.filter(n => {
                const isUnread = !n.read;
                const isNotShown = !hasNotificationBeenShown(n.id);
                // Alert ONLY if it is a dynamically received completely new notification during active polling session
                const isDynamicNew = !isFirstLoad.current && prevIds.length > 0 && !prevIds.includes(n.id);
                
                return isUnread && isNotShown && isDynamicNew;
            });
            
            if (unnotifiedUnread.length > 0) {
                const chronNotifs = [...unnotifiedUnread].sort((a, b) => a.timestamp - b.timestamp);
                
                // Show maximum of 3 notifications elements to prevent UI alarms spam
                const alertsToShow = chronNotifs.slice(-3);
                
                alertsToShow.forEach((latest, index) => {
                    // Do not play sounds or toast if the user is actively inside the corresponding view AND app is focused
                    let isLookingAtSection = false;
                    if (latest.url) {
                        const path = latest.url.replace(/^\//, '').trim();
                        const cleanPath = path.split('?')[0];
                        if (cleanPath === 'chat' && activeTabRef.current === 'chat' && document.visibilityState === 'visible') {
                            isLookingAtSection = true;
                        }
                    }
                    
                    if (!isLookingAtSection) {
                        if (latest.title?.includes('یادآور') || latest.title?.includes('تسک') || (latest.url && latest.url.includes('task='))) {
                            playTaskAlarmSound();
                        } else if (index === 0) {
                            playNotificationSound();
                        }
                        
                        setToast({ show: true, title: latest.title, message: latest.message });
                        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                        toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
                        
                        // Fire native/web push notification alert
                        sendNotification(latest.title, latest.message, { id: latest.id, url: latest.url });
                    }
                });
                
                // Ensure marked as shown locally so they stay completely silent going forward
                unnotifiedUnread.forEach(n => markNotificationAsShown(n.id));
            }
            
            notificationsRef.current = mappedNotifs;
            setNotifications(mappedNotifs);
        }

        if (safeMessages && safeMessages.length > 0) {
            const currentU = currentUser.username.toLowerCase();
            // 1. Cross-device read sync: mark all messages read by currentUser as shown so they never alert
            safeMessages.forEach(m => {
                if (m.readBy?.some((u: string) => u.toLowerCase() === currentU)) {
                    markNotificationAsShown(m.id);
                }
            });

            // 2. Alert for incoming chat messages across ALL tabs (Dashboard, Warehouse, Secretariat, etc.)
            if (!isFirstLoad.current && lastChatMsgIdRef.current) {
                const newUnreadChatMessages = safeMessages.filter(m => {
                    if (m.senderUsername?.toLowerCase() === currentU) return false;
                    if (m.readBy?.some((u: string) => u.toLowerCase() === currentU)) return false;
                    if (hasNotificationBeenShown(m.id)) return false;
                    
                    // Validate intended audience
                    const isDirectPV = m.recipient && m.recipient.toLowerCase() === currentU;
                    const isGroupForMe = m.groupId && Array.isArray(groupsData) && groupsData.some((g: any) => g.id === m.groupId);
                    const isPublic = !m.recipient && !m.groupId;
                    if (!isDirectPV && !isGroupForMe && !isPublic) return false;

                    // If user is actively inside this exact conversation right now, do not fire external notification
                    const isLookingAtThisChat = activeTabRef.current === 'chat' && 
                        document.visibilityState === 'visible' && 
                        directChatTarget && 
                        (directChatTarget.id === m.senderUsername || directChatTarget.id === m.groupId);

                    return !isLookingAtThisChat;
                });

                if (newUnreadChatMessages.length > 0) {
                    const latestChat = newUnreadChatMessages[newUnreadChatMessages.length - 1];
                    markNotificationAsShown(latestChat.id);
                    const title = latestChat.sender ? `پیام از ${latestChat.sender}` : 'پیام جدید در گفتگو';
                    const body = latestChat.message || (latestChat.audioUrl ? '🎤 پیام صوتی' : '📎 فایل ضمیمه');
                    const targetUrl = latestChat.groupId ? `/chat?group=${latestChat.groupId}` : `/chat?pv=${latestChat.senderUsername}`;
                    
                    playNotificationSound();
                    setToast({ show: true, title, message: body });
                    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
                    sendNotification(title, body, { id: latestChat.id, url: targetUrl, tab: 'chat' });
                }
            }

            const lastMsg = safeMessages[safeMessages.length - 1];
            lastChatMsgIdRef.current = lastMsg.id;
        }

        if (isFirstLoad.current) { checkChequeAlerts(safeOrders); }
        
        localStorage.setItem(NOTIFICATION_CHECK_KEY, Date.now().toString());
        isFirstLoad.current = false;
    } catch (error) { 
        console.error("Failed to load data", error); 
    } finally { 
        if (!silent) setLoading(false); 
        isSyncingRef.current = false;
        isFirstLoad.current = false;
        if (syncPendingRef.current) {
            syncPendingRef.current = false;
            setTimeout(() => {
                loadData(true);
            }, 100);
        }
    }
  };

  const checkChequeAlerts = (list: PaymentOrder[]) => {
      const now = new Date();
      let alertCount = 0;
      list.forEach(order => {
          if (order.paymentDetails && Array.isArray(order.paymentDetails)) {
              order.paymentDetails.forEach(detail => {
                  if (detail.method === PaymentMethod.CHEQUE && detail.chequeDate) {
                      const dueDate = parsePersianDate(detail.chequeDate);
                      if (dueDate) {
                          const diffTime = dueDate.getTime() - now.getTime();
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                          if (diffDays <= 2 && diffDays >= 0) { alertCount++; }
                      }
                  }
              });
          }
      });
      if (alertCount > 0) { addAppNotification('هشدار سررسید چک', `${alertCount} چک در ۲ روز آینده سررسید می‌شوند.`); }
  };

  // --- REAL-TIME OPTIMISTIC ORDER SYNC (ZERO REFRESH) ---
  useEffect(() => {
    const handleOrderOptimistic = (e: any) => {
        const { orderId, targetStatus, updates, isDeleted, isNew, order } = e.detail || {};
        if (isDeleted && orderId) {
            setOrders(prev => prev.filter(o => o.id !== orderId));
        } else if (isNew && order) {
            setOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);
        } else if (orderId && targetStatus) {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: targetStatus, ...(updates || {}) } : o));
        }
    };
    const handleOrderSynced = (e: any) => {
        const { allOrders } = e.detail || {};
        if (Array.isArray(allOrders) && allOrders.length > 0) {
            setOrders(allOrders);
        }
    };
    window.addEventListener('ORDER_OPTIMISTIC_APPLY' as any, handleOrderOptimistic);
    window.addEventListener('ORDER_BACKGROUND_SYNCED' as any, handleOrderSynced);
    return () => {
        window.removeEventListener('ORDER_OPTIMISTIC_APPLY' as any, handleOrderOptimistic);
        window.removeEventListener('ORDER_BACKGROUND_SYNCED' as any, handleOrderSynced);
    };
  }, []);

  useEffect(() => {
      const triggerReload = () => {
          if (currentUser) {
              console.log("Forcing data synchronizer on focus/online/visibilitychange");
              loadData(true);
          }
      };

      const handleAppStateChange = async (state: any) => {
          if (state.isActive) {
              triggerReload();
          }
      };
      
      let listener: any;
      
      if (Capacitor.isNativePlatform()) {
          CapacitorApp.addListener('appStateChange', handleAppStateChange).then(l => { listener = l; });
      }
      
      window.addEventListener('focus', triggerReload);
      window.addEventListener('online', triggerReload);
      
      const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
              triggerReload();
          }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => { 
        if (listener) listener.remove(); 
        window.removeEventListener('focus', triggerReload);
        window.removeEventListener('online', triggerReload);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
  }, [currentUser]);

  // --- RECURRING 10-MINUTE TASK REMINDER WATCHDOG FOR TAGGED USERS ---
  useEffect(() => {
    if (!currentUser || isPublicBioView) return;

    const checkTaskAlarms = async () => {
      try {
        const taskList = await getTasks().catch(() => []);
        if (!Array.isArray(taskList) || taskList.length === 0) return;

        const now = Date.now();
        const currentUsernameLower = (currentUser.username || '').trim().toLowerCase();
        const myPendingReminderTasks = taskList.filter((t: GroupTask) => {
          if (t.status === 'completed' || !t.recurringReminder) return false;

          // Collect all specifically tagged / assigned users for this task
          const taggedUsers: string[] = [];
          if (Array.isArray(t.assignedTo) && t.assignedTo.length > 0) {
            t.assignedTo.forEach(u => {
              if (u && typeof u === 'string' && u.trim()) taggedUsers.push(u.trim().toLowerCase());
            });
          }
          if (t.assignee && typeof t.assignee === 'string' && t.assignee.trim()) {
            taggedUsers.push(t.assignee.trim().toLowerCase());
          }

          // Also check inline @mentions in title & description
          const textToCheck = `${t.title || ''} ${t.description || ''}`;
          const mentionRegex = /@([a-zA-Z0-9_\.\-\u0600-\u06FF]+)/g;
          let match;
          while ((match = mentionRegex.exec(textToCheck)) !== null) {
            const mentioned = match[1]?.trim().toLowerCase();
            if (mentioned && !taggedUsers.includes(mentioned)) {
              taggedUsers.push(mentioned);
            }
          }

          // If specific person(s) are tagged, alert ONLY if current user is among the tagged persons
          if (taggedUsers.length > 0) {
            return taggedUsers.includes(currentUsernameLower);
          }

          // If no specific person is tagged, alert only the task creator
          return (t.createdBy || '').trim().toLowerCase() === currentUsernameLower;
        });

        for (const task of myPendingReminderTasks) {
          const intervalMin = Number(task.reminderIntervalMinutes) || 10;
          const intervalMs = intervalMin * 60 * 1000;
          const storageKey = `task_alarm_sent_${task.id}_${currentUser.username}`;
          const lastSentStr = localStorage.getItem(storageKey);
          const lastSent = lastSentStr ? Number(lastSentStr) : (Number(task.createdAt) || 0);

          if (now - lastSent >= intervalMs) {
            localStorage.setItem(storageKey, String(now));
            playTaskAlarmSound();
            setToast({
              show: true,
              title: `⏰ یادآور ${intervalMin} دقیقه‌ای تسک`,
              message: `تسک "${task.title}" منتظر اقدام شماست.`
            });
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = setTimeout(() => setToast(null), 4500);

            sendNotification(
              `⏰ یادآور تسک (${intervalMin} دقیقه): ${task.title}`,
              `شما در این تسک تگ شده‌اید و تسک همچنان در انتظار انجام است.`,
              { id: `task_alarm_${task.id}_${now}`, url: `/chat?task=${task.id}` }
            );
          }
        }
      } catch (e) {
        console.error("Task alarm watchdog error:", e);
      }
    };

    const timer = setInterval(checkTaskAlarms, 20000);
    const initialTimer = setTimeout(checkTaskAlarms, 6000);

    return () => {
      clearInterval(timer);
      clearTimeout(initialTimer);
    };
  }, [currentUser]);

  useEffect(() => {
    const syncSettings = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const host = getServerHost() || 'https://dlkam.ir';
          if (currentUser) {
            await Preferences.set({ key: 'user_username', value: currentUser.username });
            await Preferences.set({ key: 'user_role', value: currentUser.role });
            await Preferences.set({ key: 'user_logged_in', value: 'true' });
            await Preferences.set({ key: 'app_current_user_data', value: JSON.stringify(currentUser) });
          } else {
            await Preferences.remove({ key: 'user_username' });
            await Preferences.remove({ key: 'user_role' });
            await Preferences.remove({ key: 'user_logged_in' });
            await Preferences.remove({ key: 'app_current_user_data' });
          }
          await Preferences.set({ key: 'server_url', value: host });
          console.log('[NativeSync] Synchronized user metadata across Preferences');
        } catch (err) {
          console.error('[NativeSync] Preferences sync failed:', err);
        }
      }
    };
    syncSettings();
  }, [currentUser]);

  useEffect(() => { 
      if (currentUser && !isPublicBioView) { 
          loadData(false); 
          // Ultra-efficient enterprise polling: 25s in foreground, 60s in background
          // (Zero lag: instant sync happens immediately on window focus, visibility change, or order dispatch)
          const isAppActive = typeof document !== 'undefined' && !document.hidden;
          const intervalDuration = isAppActive ? 25000 : 60000;
          const intervalId = setInterval(() => {
            if (!isPublicBioView) loadData(true);
          }, intervalDuration); 
          
          // Heartbeat for Last Seen (Every 1.5 minutes)
          const heartbeatId = setInterval(() => {
            if (!isPublicBioView) apiCall('/heartbeat', 'POST', { username: currentUser.username }).catch(console.error);
          }, 90000);

          // Immediate instant synchronization on window focus / tab visibility
          const handleVisibilitySync = () => {
            if (typeof document !== 'undefined' && !document.hidden && !isPublicBioView) {
              loadData(true);
            }
          };
          window.addEventListener('focus', handleVisibilitySync);
          document.addEventListener('visibilitychange', handleVisibilitySync);

          return () => { 
              clearInterval(intervalId); 
              clearInterval(heartbeatId);
              window.removeEventListener('focus', handleVisibilitySync);
              document.removeEventListener('visibilitychange', handleVisibilitySync);
          }; 
      } 
  }, [currentUser, isPublicBioView]);

  useEffect(() => {
      if (!currentUser) return;
      
      let fastChatInterval: any = null;
      let isFetchingChat = false;
      if (activeTab === 'chat') {
          const fetchChatMessages = async () => {
              if (isFetchingChat) return;
              isFetchingChat = true;
              try {
                  const messagesData = await getMessages();
                  const safeMessages = Array.isArray(messagesData) ? messagesData : [];
                  setChatMessages(prev => {
                      if (prev.length !== safeMessages.length) return safeMessages;
                      if (prev.length > 0 && safeMessages.length > 0) {
                          const pLast = prev[prev.length - 1];
                          const sLast = safeMessages[safeMessages.length - 1];
                          if (pLast.id !== sLast.id || pLast.timestamp !== sLast.timestamp || pLast.readBy?.length !== sLast.readBy?.length) {
                              return safeMessages;
                          }
                      }
                      return prev;
                  });
              } catch (e) {
                  console.error("Fast chat poll failed", e);
              } finally {
                  isFetchingChat = false;
              }
          };
          
          fastChatInterval = setInterval(fetchChatMessages, 4500);
      }
      
      return () => {
          if (fastChatInterval) clearInterval(fastChatInterval);
      };
  }, [currentUser, activeTab]);

  useEffect(() => {
      if (currentUser) {
          setupNativePushNotifications(currentUser.username, currentUser.role).catch(console.error);
          initSSENotificationClient(currentUser);
      } else {
          disconnectSSENotificationClient();
      }
      return () => {
          disconnectSSENotificationClient();
      };
  }, [currentUser]);

  // Real-time Chat message injection and Windows Action Center navigation listeners
  useEffect(() => {
      const handleRealtimeChat = (e: any) => {
          const msg = e.detail;
          if (!msg || !msg.id) return;
          setChatMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, msg];
          });
      };
      window.addEventListener('CHAT_MESSAGE_REALTIME', handleRealtimeChat);

      // Windows Action Center navigation from electron main process
      const electronAPI = (window as any).electronAPI;
      let cleanupElectronNav: any = null;
      if (electronAPI && typeof electronAPI.onNavigate === 'function') {
          cleanupElectronNav = electronAPI.onNavigate((data: any) => {
              if (data?.tab) setActiveTab(data.tab);
              if (data?.url) {
                  try {
                      const parsed = new URL(data.url, window.location.origin);
                      const pv = parsed.searchParams.get('pv');
                      const group = parsed.searchParams.get('group');
                      if (pv) {
                          setDirectChatTarget({ id: pv, type: 'private' });
                          setActiveTab('chat');
                      } else if (group) {
                          setDirectChatTarget({ id: group, type: 'group' });
                          setActiveTab('chat');
                      }
                  } catch (_) {}
              }
          });
      }

      return () => {
          window.removeEventListener('CHAT_MESSAGE_REALTIME', handleRealtimeChat);
          if (cleanupElectronNav) cleanupElectronNav();
      };
  }, []);

  // Synchronize Active Screen Views with Client and Server Notification read statuses
  useEffect(() => {
      if (!currentUser || notifications.length === 0) return;
      
      let targetUrls: string[] = [];
      if (activeTab === 'chat' && directChatTarget?.id) {
          // Only auto-dismiss notifications for this specific conversation, NOT all unread chats!
          targetUrls = [
              `/chat?pv=${directChatTarget.id}`, 
              `/chat?group=${directChatTarget.id}`, 
              `chat?pv=${directChatTarget.id}`, 
              `chat?group=${directChatTarget.id}`
          ];
      } else if (activeTab === 'manage' || activeTab === 'manage-orders') {
          targetUrls = ['/payment-approvals', '/payment-orders', 'payment-approvals', 'payment-orders'];
      } else if (activeTab === 'manage-exit' || activeTab === 'manage-invoices') {
          targetUrls = ['/exit-permits', '/exit-approvals', 'exit-permits', 'exit-approvals'];
      }
      
      if (targetUrls.length > 0) {
          const unreadMatched = notifications.filter(n => {
              if (n.read || !n.url) return false;
              // Ignore query parameters when matching base path
              const cleanUrl = n.url.split('?')[0];
              return targetUrls.includes(n.url) || targetUrls.includes(cleanUrl);
          });
          if (unreadMatched.length > 0) {
              unreadMatched.forEach(n => {
                  removeNotification(n.id);
              });
          }
      }
  }, [activeTab, notifications, currentUser, directChatTarget]);

  const handleOrderCreated = () => { loadData(); setManageOrdersInitialTab('current'); setDashboardStatusFilter(null); setActiveTab('manage'); };
  const handleLogin = (user: User) => { 
      setCurrentUser(user); 
      syncServiceWorkerAuth(user).catch(console.error);
      setActiveTab('dashboard'); 
  };
  const handleViewArchive = () => { setManageOrdersInitialTab('archive'); setDashboardStatusFilter(null); setActiveTab('manage'); };
  const handleDashboardFilter = (status: any) => { setDashboardStatusFilter(status); setManageOrdersInitialTab('current'); setActiveTab('manage'); };

  const handleGoToPaymentApprovals = () => {
      let filter: any = 'pending_all';
      if (currentUser) {
          const permissions = getRolePermissions(currentUser.role, settings || null);
          if (currentUser.role === UserRole.FINANCIAL || permissions.canApproveFinancial) filter = 'cartable_financial';
          else if (currentUser.role === UserRole.MANAGER || permissions.canApproveManager) filter = 'cartable_manager';
          else if (currentUser.role === UserRole.CEO || permissions.canApproveCeo) filter = 'cartable_ceo';
      }
      setDashboardStatusFilter(filter);
      setManageOrdersInitialTab('current');
      setActiveTab('manage');
  };

    const handleGoToExitApprovals = () => { 
      setExitPermitStatusFilter('pending'); 
      if (currentUser?.role === UserRole.CEO || currentUser?.role === UserRole.SALES_MANAGER) {
          setActiveTab('manage-invoices'); 
      } else {
          setActiveTab('manage-exit'); 
      }
    };
  const [warehouseInitialTab, setWarehouseInitialTab] = useState<any>('dashboard');
  const handleGoToWarehouseApprovals = () => { setWarehouseInitialTab('approvals'); setActiveTab('warehouse'); };
    const [purchaseInitialTab, setPurchaseInitialTab] = useState<'DASHBOARD' | 'REQUESTS' | 'PARTS' | 'KARDEX' | 'ARCHIVE'>('REQUESTS');
  const handleGoToPurchaseApprovals = () => { setPurchaseInitialTab('REQUESTS'); setActiveTab('purchase'); };

  const unreadChatCount = useMemo(() => {
      if (!currentUser || !currentUser.username) return 0;
      const currentU = currentUser.username.toLowerCase();
      const isManager = [UserRole.ADMIN, UserRole.MANAGER, UserRole.CEO].includes(currentUser.role as UserRole);

      return chatMessages.filter(m => {
          if (!m.senderUsername || m.senderUsername.toLowerCase() === currentU) return false;
          if (m.readBy?.some(u => u.toLowerCase() === currentU)) return false;
          
          if (m.recipient) {
              return m.recipient.toLowerCase() === currentU;
          }
          if (m.groupId) {
              const grp = appGroups.find(g => g.id === m.groupId) || appTaskGroups.find(g => g.id === m.groupId);
              if (!grp) return false; // Orphaned/deleted group messages are not counted as unread
              return isManager || (Array.isArray(grp.members) && grp.members.some(mem => mem.toLowerCase() === currentU)) || grp.createdBy?.toLowerCase() === currentU;
          }
          // Public message:
          return true;
      }).length;
  }, [chatMessages, currentUser, appGroups, appTaskGroups]);

  const toastStyle = useMemo(() => {
     if (!toast || !toast.title) return null;
     const titleText = toast.title.toLowerCase();
     const msgText = (toast.message || '').toLowerCase();
     const combined = `${titleText} ${msgText}`;
     
     if (combined.includes('گفتگو') || combined.includes('پیام') || combined.includes('چت') || combined.includes('گروه') || combined.includes('پیام جدید')) {
         return {
             gradient: 'from-emerald-500 to-teal-600',
             icon: <MessageSquare size={20} className="text-white" />,
             badge: 'پیام گفتگو',
             badgeBg: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400',
             barColor: 'bg-emerald-500'
         };
     }
     
     if (combined.includes('ابطال') || combined.includes('کنسل') || combined.includes('رد شد') || combined.includes('خطا')) {
         return {
             gradient: 'from-rose-500 to-red-600',
             icon: <AlertTriangle size={20} className="text-white animate-bounce" />,
             badge: 'هشدار ابطال',
             badgeBg: 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400',
             barColor: 'bg-rose-500'
         };
     }

     if (combined.includes('خروج') || combined.includes('سند خروج') || combined.includes('باربری') || combined.includes('مجوز')) {
         return {
             gradient: 'from-amber-600 to-orange-500',
             icon: <FileWarning size={20} className="text-white" />,
             badge: 'حواله خروج کارخانه',
             badgeBg: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
             barColor: 'bg-amber-500'
         };
     }

     if (combined.includes('پرداخت') || combined.includes('تایید مالی') || combined.includes('صندوق') || combined.includes('چک') || combined.includes('حواله')) {
         return {
             gradient: 'from-blue-500 to-indigo-600',
             icon: <CreditCard size={20} className="text-white" />,
             badge: 'مالی و پرداخت',
             badgeBg: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
             barColor: 'bg-blue-500'
         };
     }

     return {
         gradient: 'from-indigo-500 to-purple-600',
         icon: <BellRing size={20} className="text-white" />,
         badge: 'اعلان سیستم',
         badgeBg: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400',
         barColor: 'bg-indigo-500'
     };
  }, [toast]);

  const getModuleTitle = (tabId: string): string => {
    return getSidebarLabel(tabId, allowedNavItems);
  };

  const renderModuleContent = (tabId: string, isSecondary = false) => {
    if (!currentUser) return null;
    switch (tabId) {
      case 'dashboard':
        return (
          <Dashboard 
              orders={orders} 
              settings={settings} 
              currentUser={currentUser} 
              onViewArchive={handleViewArchive} 
              onFilterByStatus={handleDashboardFilter} 
              onGoToPaymentApprovals={handleGoToPaymentApprovals} 
              onGoToExitApprovals={handleGoToExitApprovals} 
              onGoToBijakApprovals={handleGoToWarehouseApprovals} 
              onGoToPurchaseApprovals={handleGoToPurchaseApprovals} 
              onNavigate={(tab) => {
                if (isSecondary) setSecondaryTab(tab);
                else setActiveTab(tab);
              }}
              financialYear={financialYear} 
              activeTab={tabId}
              onGoToTaskGroup={(groupId, taskId) => {
                  setDirectChatTarget({ type: 'task_group', id: groupId, taskId });
                  if (isSecondary) setSecondaryTab('chat');
                  else setActiveTab('chat');
              }}
          />
        );
      case 'create':
        return <div className="page-transition w-full"><CreateOrder onSuccess={handleOrderCreated} currentUser={currentUser} /></div>;
      case 'manage':
        return <div className="page-transition w-full"><ManageOrders orders={orders} refreshData={() => loadData(true)} currentUser={currentUser} initialTab={manageOrdersInitialTab} settings={settings} statusFilter={dashboardStatusFilter} financialYear={financialYear} /></div>;
      case 'create-exit':
        return <div className="page-transition w-full"><CreateExitPermit onSuccess={() => (isSecondary ? setSecondaryTab('manage-exit') : setActiveTab('manage-exit'))} currentUser={currentUser} /></div>;
      case 'manage-invoices':
        return <div className="page-transition w-full"><ErrorBoundary><ManageExitPermits currentUser={currentUser} settings={settings} statusFilter={exitPermitStatusFilter} financialYear={financialYear} mode="INVOICE" /></ErrorBoundary></div>;
      case 'manage-exit':
        return <div className="page-transition w-full"><ErrorBoundary><ManageExitPermits currentUser={currentUser} settings={settings} statusFilter={exitPermitStatusFilter} financialYear={financialYear} mode="EXIT" /></ErrorBoundary></div>;
      case 'warehouse':
        return <div className="page-transition w-full"><WarehouseModule currentUser={currentUser} settings={settings} initialTab={warehouseInitialTab} financialYear={financialYear} /></div>;
      case 'trade':
        return <div className="page-transition w-full"><TradeModule currentUser={currentUser} /></div>;
      case 'balances':
        return <div className="page-transition w-full"><CustomerBalanceModule currentUser={currentUser} /></div>;
      case 'sales':
        return <div className="page-transition w-full"><SalesCRMModule /></div>;
      case 'products':
        return <div className="page-transition w-full"><ProductsModule /></div>;
      case 'tickets':
        return <div className="page-transition w-full"><Tickets /></div>;
      case 'ccti':
        return <div className="page-transition w-full"><CctiConverter financialYear={financialYear} currentUser={currentUser} canManageArchive={currentUser.role === UserRole.ADMIN || (settings && getRolePermissions(currentUser.role, settings, currentUser).canManageCctiArchive === true)} /></div>;
      case 'sayan':
        return <div className="page-transition w-full bg-transparent"><SayanReports currentUser={currentUser} settings={settings} onNavigateToChat={(target) => { setDirectChatTarget(target); if (isSecondary) setSecondaryTab('chat'); else setActiveTab('chat'); }} /></div>;
      case 'sayan-operations':
        return <div className="page-transition w-full bg-transparent"><SayanRegistrationsModule currentUser={currentUser} settings={settings} /></div>;
      case 'users':
        return <div className="page-transition w-full"><ManageUsers /></div>;
      case 'settings':
        return <div className="page-transition w-full"><Settings financialYear={financialYear} settings={settings} onUpdateSettings={setSettings} /></div>;
      case 'knowledge':
      case 'notes':
        return <div className="page-transition w-full"><KnowledgeBaseModule currentUser={currentUser} settings={settings} onUpdateSettings={setSettings} /></div>;
      case 'security':
        return <div className="page-transition w-full"><SecurityModule currentUser={currentUser} financialYear={financialYear} /></div>;
      case 'meetings':
        return <div className="page-transition w-full"><MeetingModule currentUser={currentUser} /></div>;
      case 'purchase':
        return <div className="page-transition w-full"><PurchaseModule currentUser={currentUser} settings={settings || undefined} initialTab={purchaseInitialTab} /></div>;
      case 'secretariat':
        return <div className="page-transition w-full"><SecretariatModule currentUser={currentUser} /></div>;
      case 'cheque-receipts':
        return (currentUser.role === UserRole.ADMIN || (settings && getRolePermissions(currentUser.role, settings, currentUser).canAccessChequeReceipts === true)) ? <div className="page-transition w-full"><ChequeReceiptModule currentUser={currentUser} /></div> : null;
      case 'digital-card':
        return (currentUser && (currentUser.role === UserRole.ADMIN || (settings && (getRolePermissions(currentUser.role, settings, currentUser).canAccessDigitalCard === true || getRolePermissions(currentUser.role, settings, currentUser).canManageDigitalCard === true)) || (currentUser as any).canAccessDigitalCard === true || (currentUser as any).canManageDigitalCard === true)) ? <div className="page-transition w-full"><DigitalCardModule currentUser={currentUser} settings={settings} /></div> : <div className="p-8 text-center font-bold text-red-500">شما دسترسی لازم برای مشاهده این بخش را ندارید.</div>;
      case 'chat':
        return (
          <div className="flex-1 flex flex-col w-full min-h-0 h-full page-transition">
            <ChatRoom 
                currentUser={currentUser} 
                preloadedMessages={chatMessages}
                onRefresh={() => loadData(true)} 
                sharedData={sharedData}
                onClearSharedData={() => setSharedData(null)}
                onMessagesRead={(msgIds) => {
                    if (!currentUser) return;
                    const idsSet = new Set(msgIds);
                    setChatMessages(prev => prev.map(m => idsSet.has(m.id) ? { ...m, readBy: [...(m.readBy || []), currentUser.username] } : m));
                }}
                directChatTarget={directChatTarget}
                onClearDirectChatTarget={() => setDirectChatTarget(null)}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
        <AnimatePresence>
            {!isPublicBioView && toast && toast.show && toastStyle && (
                <div className="fixed inset-x-0 top-6 z-[9999999] flex justify-center pointer-events-none w-full px-4">
                    <motion.div
                        initial={{ opacity: 0, y: -45, scale: 0.93 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -35, scale: 0.93 }}
                        transition={{ type: "spring", stiffness: 380, damping: 24 }}
                        drag="y"
                        dragConstraints={{ top: -30, bottom: 30 }}
                        onDragEnd={(e, info) => {
                            if (info.offset.y < -12 || info.offset.y > 20) {
                                closeToast();
                            }
                        }}
                        className="glass-panel border-2 border-white/70 dark:border-white/10 shadow-[0_15px_30px_-5px_rgba(0,0,0,0.18)] rounded-2xl p-3 flex items-center gap-3.5 min-w-[290px] max-w-sm pointer-events-auto cursor-pointer relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-3xl overflow-hidden text-right select-none"
                        onClick={closeToast}
                    >
                        {/* Elegant Left bar */}
                        <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${toastStyle.gradient.split(' ')[0].replace('from-', 'bg-')} shadow-[0_0_10px_rgba(59,130,246,0.3)]`}></div>
                        
                        {/* Rounded Dynamic Icon */}
                        <div className={`bg-gradient-to-tr ${toastStyle.gradient} p-2.5 rounded-2xl text-white shadow-lg flex-shrink-0 flex items-center justify-center`}>
                            {toastStyle.icon}
                        </div>
                        
                        {/* Body labels */}
                        <div className="flex-1 min-w-0 pr-1 select-none">
                            <div className="flex justify-between items-baseline mb-0.5">
                                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${toastStyle.badgeBg}`}>{toastStyle.badge}</span>
                                <h4 className="font-extrabold text-gray-900 dark:text-white text-xs tracking-tight select-none">{toast.title}</h4>
                            </div>
                            <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed font-semibold max-h-[36px] overflow-hidden text-ellipsis line-clamp-2 select-none">{toast.message}</p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        {isPublicBioView ? (
            <div className="fixed inset-0 z-[99999999] w-full h-full overflow-y-auto overscroll-y-contain bg-slate-50 dark:bg-slate-950" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
              <PublicBioPage 
                  config={publicBioConfig || FALLBACK_BIO_CONFIG}
              />
            </div>
        ) : isPublicSurveyView ? (
            <div className="fixed inset-0 z-[99999999] w-full h-full overflow-y-auto overscroll-y-contain bg-slate-950 text-white" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
              <PublicCustomerSurveyPage />
            </div>
        ) : !currentUser ? (
            <Login onLogin={handleLogin} />
        ) : (
            <>
                <Layout 
            onBack={goBack}
            activeTab={activeTab} 
            setActiveTab={(t) => { setActiveTab(t); if(t!=='warehouse') setWarehouseInitialTab('dashboard'); if(t!=='manage-exit') setExitPermitStatusFilter(null); if(t!=='manage') setDashboardStatusFilter(null); if(t!=='purchase') setPurchaseInitialTab('REQUESTS'); }} 
            currentUser={currentUser} 
            onLogout={handleLogout} 
            notifications={notifications} 
            clearNotifications={() => {
                setNotifications([]);
                notificationsRef.current = [];
                clearAllActiveNotifications();
                if (currentUser) apiCall('/notifications/delete', 'POST', { username: currentUser.username, id: 'all' }).catch(console.error);
            }}
            markAllNotificationsAsRead={() => {
                setNotifications(prev => prev.map(n => ({...n, read: true})));
                notificationsRef.current = notificationsRef.current.map(n => ({...n, read: true}));
                clearAllActiveNotifications();
                if (currentUser) apiCall('/notifications/read', 'POST', { username: currentUser.username, id: 'all' }).catch(console.error);
            }}
            onDeleteNotification={deleteNotification}
            onOpenNotification={(n) => {
                deleteNotification(n.id);
                if (n.url) {
                    const cleanUrl = n.url.replace(/^\/+/, '');
                    const [targetTab, searchParams] = cleanUrl.split('?');
                    if (targetTab) {
                        setActiveTab(targetTab);
                        if (targetTab !== 'warehouse') setWarehouseInitialTab('dashboard');
                        if (targetTab !== 'manage-exit') setExitPermitStatusFilter(null);
                        if (targetTab !== 'manage') setDashboardStatusFilter(null);
                        if (targetTab !== 'purchase') setPurchaseInitialTab('REQUESTS');
                    }
                    if (searchParams) {
                        try {
                            const params = new URLSearchParams(searchParams);
                            const exitStatus = params.get('exitStatus');
                            const filterStatus = params.get('filterStatus');
                            const filter = params.get('filter');
                            const taskId = params.get('task');
                            const requestId = params.get('requestId');
                            const subTab = params.get('subTab');
                            if (exitStatus === 'pending') setExitPermitStatusFilter('pending');
                            if (filterStatus) setDashboardStatusFilter(filterStatus);
                            if (filter && targetTab === 'warehouse') setWarehouseInitialTab('approvals');
                            if (taskId) {
                                window.dispatchEvent(new CustomEvent('OPEN_TASK_DETAILS', { detail: { taskId } }));
                            }
                            if (requestId && targetTab === 'purchase') {
                                setPurchaseInitialTab('REQUESTS');
                                const payload = { requestId, subTab: subTab || 'comments' };
                                sessionStorage.setItem('pending_purchase_deep_link', JSON.stringify(payload));
                                setTimeout(() => {
                                    window.dispatchEvent(new CustomEvent('OPEN_PURCHASE_REQUEST_DETAILS', { detail: payload }));
                                }, 50);
                            }
                        } catch (e) {
                            console.error('Error parsing notification params:', e);
                        }
                    }
                }
            }}
            onAddNotification={addAppNotification}
            onRemoveNotification={removeNotification}
            financialYear={financialYear}
            setFinancialYear={setFinancialYear}
            settings={settings}
            theme={theme}
            toggleTheme={toggleTheme}
            isDarkMode={isDarkMode}
            onToggleDarkMode={handleToggleDarkMode}
            unreadChatCount={unreadChatCount}
            secondaryTab={secondaryTab}
            onOpenSplitView={() => setIsSplitSelectorOpen(true)}
            onCloseSecondaryTab={handleCloseSecondaryTab}
            onToggleCalculator={() => {
              setIsCalculatorOpen(prev => !prev);
              setIsCalculatorMinimized(false);
            }}
            >
            
            <NotificationController 
                currentUser={currentUser} 
                onNotificationClick={(data) => {
                    if (data && data.tab) {
                        setActiveTab(data.tab);
                    }
                }}
            />

            {backgroundJobs.length > 0 && (
                <div className="hidden-print-export" style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                    <div id={`bg-print-voucher-${backgroundJobs[0].order.id}`}>
                        <PrintVoucher order={backgroundJobs[0].order} embed settings={settings || undefined} />
                    </div>
                </div>
            )}

            <div className={`flex-1 relative flex flex-col min-h-0 ${(activeTab === 'chat' || Boolean(secondaryTab)) ? 'h-full overflow-hidden' : ''}`}>
                {loading && (
                    <div className="fixed top-20 right-4 z-[999] bg-white/80 dark:bg-gray-800/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800 shadow-lg flex items-center gap-2 animate-fade-in">
                        <Loader2 size={16} className="animate-spin text-blue-600" />
                        <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">در حال بروزرسانی دیتابیس...</span>
                    </div>
                )}

                {!secondaryTab ? (
                  <>
                    <div className={activeTab === 'dashboard' ? 'block h-full page-transition' : 'hidden'}>
                        <Dashboard 
                            orders={orders} 
                            settings={settings} 
                            currentUser={currentUser} 
                            onViewArchive={handleViewArchive} 
                            onFilterByStatus={handleDashboardFilter} 
                            onGoToPaymentApprovals={handleGoToPaymentApprovals} 
                            onGoToExitApprovals={handleGoToExitApprovals} 
                            onGoToBijakApprovals={handleGoToWarehouseApprovals} 
                            onGoToPurchaseApprovals={handleGoToPurchaseApprovals} 
                            onNavigate={(tab) => setActiveTab(tab)}
                            financialYear={financialYear} 
                            activeTab={activeTab}
                            onGoToTaskGroup={(groupId, taskId) => {
                                setDirectChatTarget({ type: 'task_group', id: groupId, taskId });
                                setActiveTab('chat');
                            }}
                        />
                    </div>
                    {activeTab === 'create' && <div className="page-transition flex flex-col flex-1 min-h-0"><CreateOrder onSuccess={handleOrderCreated} currentUser={currentUser} /></div>}
                    {(activeTab === 'manage' || activeTab === 'manage-orders') && <div className="page-transition flex flex-col flex-1 min-h-0"><ManageOrders orders={orders} refreshData={() => loadData(true)} currentUser={currentUser} initialTab={manageOrdersInitialTab} settings={settings} statusFilter={dashboardStatusFilter} financialYear={financialYear} /></div>}
                    {activeTab === 'create-exit' && <div className="page-transition flex flex-col flex-1 min-h-0"><CreateExitPermit onSuccess={() => setActiveTab('manage-exit')} currentUser={currentUser} /></div>}
                    {activeTab === 'manage-invoices' && <div className="page-transition flex flex-col flex-1 min-h-0"><ErrorBoundary><ManageExitPermits currentUser={currentUser} settings={settings} statusFilter={exitPermitStatusFilter} financialYear={financialYear} mode="INVOICE" /></ErrorBoundary></div>}
                    {activeTab === 'manage-exit' && <div className="page-transition flex flex-col flex-1 min-h-0"><ErrorBoundary><ManageExitPermits currentUser={currentUser} settings={settings} statusFilter={exitPermitStatusFilter} financialYear={financialYear} mode="EXIT" /></ErrorBoundary></div>}
                    {activeTab === 'warehouse' && <div className="page-transition flex flex-col flex-1 min-h-0"><WarehouseModule currentUser={currentUser} settings={settings} initialTab={warehouseInitialTab} financialYear={financialYear} /></div>}
                    {activeTab === 'trade' && <div className="page-transition flex flex-col flex-1 min-h-0"><TradeModule currentUser={currentUser} /></div>}
                    {activeTab === 'balances' && <div className="page-transition flex flex-col flex-1 min-h-0"><CustomerBalanceModule currentUser={currentUser} /></div>}
                    {activeTab === 'sales' && <div className="page-transition flex flex-col flex-1 min-h-0"><SalesCRMModule /></div>}
                    {activeTab === 'products' && <div className="page-transition flex flex-col flex-1 min-h-0"><ProductsModule /></div>}
                    {activeTab === 'tickets' && <div className="page-transition flex flex-col flex-1 min-h-0"><Tickets /></div>}
                    {activeTab === 'ccti' && <div className="page-transition flex flex-col flex-1 min-h-0"><CctiConverter financialYear={financialYear} currentUser={currentUser} canManageArchive={currentUser.role === UserRole.ADMIN || (settings && getRolePermissions(currentUser.role, settings, currentUser).canManageCctiArchive === true)} /></div>}
                    {activeTab === 'sayan' && <div className="page-transition flex flex-col flex-1 min-h-0 bg-transparent"><SayanReports currentUser={currentUser} settings={settings} onNavigateToChat={(target) => { setDirectChatTarget(target); setActiveTab('chat'); }} /></div>}
                    {activeTab === 'sayan-operations' && <div className="page-transition flex flex-col flex-1 min-h-0 bg-transparent"><SayanRegistrationsModule currentUser={currentUser} settings={settings} /></div>}
                    {activeTab === 'users' && <div className="page-transition flex flex-col flex-1 min-h-0"><ManageUsers /></div>}
                    {activeTab === 'settings' && <div className="page-transition flex flex-col flex-1 min-h-0"><Settings financialYear={financialYear} settings={settings} onUpdateSettings={setSettings} /></div>}
                    {(activeTab === 'knowledge' || activeTab === 'notes') && <div className="page-transition flex flex-col flex-1 min-h-0"><KnowledgeBaseModule currentUser={currentUser} settings={settings} onUpdateSettings={setSettings} /></div>}
                    {activeTab === 'security' && <div className="page-transition flex flex-col flex-1 min-h-0"><SecurityModule currentUser={currentUser} financialYear={financialYear} /></div>}
                    {activeTab === 'meetings' && <div className="page-transition flex flex-col flex-1 min-h-0"><MeetingModule currentUser={currentUser} /></div>}
                    {activeTab === 'purchase' && <div className="page-transition flex flex-col flex-1 min-h-0"><PurchaseModule currentUser={currentUser} settings={settings || undefined} initialTab={purchaseInitialTab} /></div>}
                    {activeTab === 'secretariat' && currentUser && <div className="page-transition flex flex-col flex-1 min-h-0"><SecretariatModule currentUser={currentUser} /></div>}
                    {activeTab === 'cheque-receipts' && currentUser && (currentUser.role === UserRole.ADMIN || (settings && getRolePermissions(currentUser.role, settings, currentUser).canAccessChequeReceipts === true)) && <div className="page-transition flex flex-col flex-1 min-h-0"><ChequeReceiptModule currentUser={currentUser} /></div>}
                    {activeTab === 'digital-card' && currentUser && (currentUser.role === UserRole.ADMIN || (settings && (getRolePermissions(currentUser.role, settings, currentUser).canAccessDigitalCard === true || getRolePermissions(currentUser.role, settings, currentUser).canManageDigitalCard === true)) || (currentUser as any).canAccessDigitalCard === true || (currentUser as any).canManageDigitalCard === true) && <div className="page-transition flex flex-col flex-1 min-h-0"><DigitalCardModule currentUser={currentUser} settings={settings} /></div>}
                    
                    <div className={activeTab === 'chat' ? 'flex-1 flex flex-col w-full min-h-0 h-full page-transition' : 'fixed inset-0 pointer-events-none opacity-0 invisible overflow-hidden h-0'}>
                        <ChatRoom 
                            currentUser={currentUser} 
                            preloadedMessages={chatMessages}
                            onRefresh={() => loadData(true)} 
                            sharedData={sharedData}
                            onClearSharedData={() => setSharedData(null)}
                            onMessagesRead={(msgIds) => {
                                if (!currentUser) return;
                                const idsSet = new Set(msgIds);
                                setChatMessages(prev => prev.map(m => idsSet.has(m.id) ? { ...m, readBy: [...(m.readBy || []), currentUser.username] } : m));
                            }}
                            directChatTarget={directChatTarget}
                            onClearDirectChatTarget={() => setDirectChatTarget(null)}
                        />
                    </div>
                  </>
                ) : (
                  /* Dual Split-View Container */
                  <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
                    {/* Mobile Dual Switcher Bar */}
                    <div className="md:hidden flex items-center justify-between p-2 mb-1.5 bg-gradient-to-r from-blue-50/90 to-purple-50/90 dark:from-blue-950/40 dark:to-purple-950/40 border border-blue-200/70 dark:border-blue-900/60 rounded-xl shrink-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setMobileActiveSplitPane('primary')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            mobileActiveSplitPane === 'primary'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-white/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          {getModuleTitle(activeTab)}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMobileActiveSplitPane('secondary')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            mobileActiveSplitPane === 'secondary'
                              ? 'bg-purple-600 text-white shadow-sm'
                              : 'bg-white/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          {getModuleTitle(secondaryTab)}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleCloseSecondaryTab}
                        className="p-1.5 text-zinc-500 hover:text-rose-600 rounded-lg hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                        title="بستن پنجره دوم"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Mobile View: show the active pane */}
                    <div
                      data-split-pane-scroll={(mobileActiveSplitPane === 'primary' ? activeTab : secondaryTab) === 'chat' ? 'chat' : 'mobile'}
                      className={`flex-1 md:hidden min-h-0 h-full ${
                        (mobileActiveSplitPane === 'primary' ? activeTab : secondaryTab) === 'chat'
                          ? 'flex flex-col overflow-hidden'
                          : 'overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar pb-24'
                      }`}
                    >
                      {renderModuleContent(mobileActiveSplitPane === 'primary' ? activeTab : secondaryTab, mobileActiveSplitPane === 'secondary')}
                    </div>

                    {/* Desktop View: Side-by-Side Split Panes */}
                    <div className="hidden md:flex flex-1 min-h-0 h-full gap-2.5 relative overflow-hidden">
                      {/* Primary Pane (Right side in RTL) */}
                      <div className={`flex flex-col min-h-0 h-full bg-white dark:bg-zinc-900/80 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm overflow-hidden transition-all duration-200 ${
                        splitRatio === '50-50' ? 'w-1/2' : splitRatio === '60-40' ? 'w-[60%]' : 'w-[40%]'
                      }`}>
                        <div className="px-3.5 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200/70 dark:border-zinc-800/70 flex items-center justify-between shrink-0 select-none">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            <span className="text-xs font-black text-zinc-800 dark:text-zinc-200">
                              {getModuleTitle(activeTab)}
                            </span>
                            <span className="text-[10px] bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold px-1.5 py-0.2 rounded">اصلی</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={handleSwapSplitPanes}
                              className="px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-blue-600 transition-colors flex items-center gap-1 text-[11px] font-bold"
                              title="جابجایی جای دو پنجره (Swap)"
                            >
                              <ArrowRightLeft size={12} />
                              <span>جابجایی</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitRatio(prev => prev === '50-50' ? '60-40' : prev === '60-40' ? '40-60' : '50-50')}
                              className="px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-purple-600 transition-colors text-[11px] font-bold"
                              title="تغییر نسبت اندازه (۵۰/۵۰ یا ۶۰/۴۰ یا ۴۰/۶۰)"
                            >
                              {splitRatio === '50-50' ? '۵۰/۵۰' : splitRatio === '60-40' ? '۶۰/۴۰' : '۴۰/۶۰'}
                            </button>
                            <button
                              type="button"
                              onClick={handleCloseSecondaryTab}
                              className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-blue-600 transition-colors"
                              title="تمام‌صفحه کردن این پنجره (خروج از اسپلیت)"
                            >
                              <Maximize2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div
                          id="split-pane-primary-scroll"
                          data-split-pane-scroll={activeTab === 'chat' ? 'chat' : 'primary'}
                          className={`flex-1 min-h-0 h-full ${
                            activeTab === 'chat'
                              ? 'flex flex-col overflow-hidden p-0'
                              : 'overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar p-2 pb-24'
                          }`}
                        >
                          {renderModuleContent(activeTab)}
                        </div>
                      </div>

                      {/* Secondary Pane (Left side in RTL) */}
                      <div className={`flex flex-col min-h-0 h-full bg-white dark:bg-zinc-900/80 rounded-2xl border border-purple-200/80 dark:border-purple-900/50 shadow-sm overflow-hidden transition-all duration-200 ${
                        splitRatio === '50-50' ? 'w-1/2' : splitRatio === '60-40' ? 'w-[40%]' : 'w-[60%]'
                      }`}>
                        <div className="px-3.5 py-2 bg-purple-50/60 dark:bg-purple-950/30 border-b border-purple-100 dark:border-purple-900/40 flex items-center justify-between shrink-0 select-none">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                            <span className="text-xs font-black text-purple-950 dark:text-purple-200">
                              {getModuleTitle(secondaryTab)}
                            </span>
                            <span className="text-[10px] bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold px-1.5 py-0.2 rounded">همزمان</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handlePopOutFloating(secondaryTab)}
                              className="p-1 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-lg text-purple-600 dark:text-purple-300 transition-colors"
                              title="شناور کردن پنجره دوم (پنجره کوچک گوشه)"
                            >
                              <ExternalLink size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const target = secondaryTab;
                                handleCloseSecondaryTab();
                                setActiveTab(target);
                              }}
                              className="p-1 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-lg text-purple-600 dark:text-purple-300 transition-colors"
                              title="تمام‌صفحه کردن پنجره دوم"
                            >
                              <Maximize2 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={handleCloseSecondaryTab}
                              className="p-1 hover:bg-rose-100 dark:hover:bg-rose-950/40 text-rose-500 rounded-lg transition-colors"
                              title="بستن پنجره دوم"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                        <div
                          id="split-pane-secondary-scroll"
                          data-split-pane-scroll={secondaryTab === 'chat' ? 'chat' : 'secondary'}
                          className={`flex-1 min-h-0 h-full ${
                            secondaryTab === 'chat'
                              ? 'flex flex-col overflow-hidden p-0'
                              : 'overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar p-2 pb-24'
                          }`}
                        >
                          {renderModuleContent(secondaryTab, true)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
            <ThemeSelectorModal
                isOpen={showThemeModal}
                onClose={() => setShowThemeModal(false)}
                currentTheme={theme as AppThemeMode}
                onSelectTheme={handleSelectTheme}
                isDarkMode={isDarkMode}
                onToggleDarkMode={handleToggleDarkMode}
            />
            </Layout>

            {/* Workstation Desktop Dock (Windows-style Taskbar) */}
            {currentUser && (
              <WorkstationDock
                openTabs={openWorkstationTabs}
                activeTab={activeTab}
                secondaryTab={secondaryTab}
                onSelectTab={(tabId) => {
                  if (tabId === activeTab) {
                    if (secondaryTab) {
                      setMobileActiveSplitPane('primary');
                    }
                  } else if (tabId === secondaryTab) {
                    setMobileActiveSplitPane('secondary');
                  } else {
                    setActiveTab(tabId);
                  }
                }}
                onCloseTab={handleCloseWorkstationTab}
                onOpenSplitView={() => setIsSplitSelectorOpen(true)}
                onCloseSecondaryTab={handleCloseSecondaryTab}
                isCalculatorOpen={isCalculatorOpen}
                onToggleCalculator={() => {
                  if (!isCalculatorOpen) {
                    setIsCalculatorOpen(true);
                    setIsCalculatorMinimized(false);
                  } else {
                    setIsCalculatorMinimized(prev => !prev);
                  }
                }}
                floatingTab={floatingTab}
                currentUser={currentUser}
                settings={settings}
                allowedItems={allowedNavItems}
              />
            )}

            {/* Split View Selection Modal */}
            <SplitViewSelectorModal
              isOpen={isSplitSelectorOpen}
              onClose={() => setIsSplitSelectorOpen(false)}
              activeTab={activeTab}
              secondaryTab={secondaryTab}
              onSelectModuleForSplit={(tabId) => {
                handleSelectSecondaryTab(tabId);
                setIsSplitSelectorOpen(false);
              }}
              onCloseSplit={() => {
                handleCloseSecondaryTab();
                setIsSplitSelectorOpen(false);
              }}
              currentUser={currentUser}
              settings={settings}
              allowedItems={allowedNavItems}
            />

            {/* Windows-style Drag & Snap Overlay for Split-View */}
            <SplitViewDragOverlay
              activeTab={activeTab}
              secondaryTab={secondaryTab}
              allowedItems={allowedNavItems}
              onDropLeft={handleDropToSplitLeft}
              onDropRight={handleDropToSplitRight}
              onDropFloat={handleDropToFloat}
            />

            {/* Windows-style Picture-in-Picture Floating Window */}
            {floatingTab && (
              <WorkstationFloatingWindow
                id={floatingTab}
                tabId={floatingTab}
                title={getModuleTitle(floatingTab)}
                isOpen={!!floatingTab}
                isMinimized={isFloatingMinimized}
                onMinimize={() => setIsFloatingMinimized(true)}
                onRestore={() => setIsFloatingMinimized(false)}
                onMaximizeToMain={() => {
                  handleSelectSecondaryTab(floatingTab);
                  handleCloseFloating();
                }}
                onClose={handleCloseFloating}
              >
                {renderModuleContent(floatingTab, true)}
              </WorkstationFloatingWindow>
            )}

            {/* Windows-style Draggable / Minimizable Floating Calculator */}
            <FloatingCalculator
              isOpen={isCalculatorOpen}
              onClose={() => setIsCalculatorOpen(false)}
              isMinimized={isCalculatorMinimized}
              onMinimize={() => setIsCalculatorMinimized(prev => !prev)}
            />

            {/* AI Voice Assistant & Executive Copilot Widget */}
            {currentUser && (
                <>
                    <AiExecutiveCopilot
                        currentUser={currentUser}
                        activeTab={activeTab}
                        onOpenScanner={() => setShowAiScannerModal(true)}
                        onOpenWarehouseAdvisor={() => setActiveTab('sayan')}
                        onOpenSalesAdvisor={() => setActiveTab('sayan')}
                    />
                    <AiDocumentScannerModal
                        isOpen={showAiScannerModal}
                        onClose={() => setShowAiScannerModal(false)}
                    />
                    <SendToChatModal
                        isOpen={globalSendToChat.isOpen}
                        onClose={() => setGlobalSendToChat(prev => ({ ...prev, isOpen: false }))}
                        attachment={globalSendToChat.attachment}
                        attachmentPromise={globalSendToChat.attachmentPromise}
                        isGeneratingAttachment={globalSendToChat.isGeneratingAttachment}
                        defaultMessage={globalSendToChat.defaultMessage}
                        title={globalSendToChat.title}
                        onGoToChat={(target) => {
                            setGlobalSendToChat(prev => ({ ...prev, isOpen: false }));
                        }}
                    />
                </>
            )}
            <NetworkRoleSettingsModal
                isOpen={showNetworkRoleModal}
                onClose={() => setShowNetworkRoleModal(false)}
            />
        </>
      )}
    </>
  );
}
export default App;
