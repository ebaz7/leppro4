
import React, { useState, useMemo, useEffect } from 'react';
import { PaymentOrder, OrderStatus, SystemSettings, User, ExitPermit, ExitPermitStatus, WarehouseTransaction, UserRole, SystemAnnouncement } from '../types';
import { formatCurrency, getShamsiDateFromIso } from '../constants';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Clock, CheckCircle, Check, Activity, XCircle, Banknote, Calendar as CalendarIcon, ShieldCheck, ArrowUpRight, CheckSquare, Truck, Package, ListChecks, PieChart, BarChart, BookOpen, PenTool, Edit3, Plus, Trash2, Send, X, FileText, Users, ChevronLeft, ChevronRight, RotateCw, Copy, Flame, Sparkles, Zap, ChevronDown, ChevronUp, BellRing, CreditCard, Crown, Briefcase, Settings2, GripVertical, Eye, EyeOff, Monitor, Image, Lock, Unlock, Sliders, LayoutGrid } from 'lucide-react';
import { getRolePermissions } from '../services/authService';
import { getExitPermits, getWarehouseTransactions, getNotes, getPurchaseRequests, getTaskGroups, getTasks, updateTask } from '../services/storageService';
import { isInFinancialYear } from '../utils/dateUtils';
import { getRandomPoem, getRandomMotivationalQuote, persianPoems, persianMotivationalQuotes } from '../utils/quotes';
import { Note, PurchaseRequest, PurchaseRequestStatus, GroupTask, TaskGroup } from '../types';
import { GoogleWorkspaceWidget } from './GoogleWorkspaceWidget';
import { 
  WarehouseAlertWidget, 
  DateCardWidget, 
  PoetryCardWidget, 
  MotivationCardWidget, 
  AnnouncementsWidget, 
  TaskGroupsQuickAccessWidget, 
  NotesPreviewWidget, 
  QuickTilesWidget 
} from './DashboardWidgets';
import { ResizableWidget, WidgetSize } from './ResizableWidget';
import { DashboardAdminRoleLocksModal } from './DashboardAdminRoleLocksModal';
import { UpdateBanner } from './UpdateBanner';
import { checkServerUpdate, AppVersionInfo, CURRENT_CLIENT_BUILD } from '../services/updateService';
import { RefreshCw, DownloadCloud, ArrowUpCircle } from 'lucide-react';

interface DashboardProps {
  orders: PaymentOrder[];
  settings?: SystemSettings;
  currentUser: User;
  onViewArchive?: () => void;
  onFilterByStatus?: (status: OrderStatus | 'pending_all') => void;
  onGoToPaymentApprovals: () => void;
  onGoToExitApprovals: () => void;
  onGoToBijakApprovals: () => void;
  onGoToPurchaseApprovals: () => void;
  onGoToTaskGroup?: (groupId: string, taskId?: string) => void;
  onNavigate?: (tab: string) => void;
  financialYear?: string;
  activeTab?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
const MONTHS = [ 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند' ];

const DASHBOARD_WIDGET_NAMES: Record<string, string> = {
  warehouse_alert: 'هشدار موجودی بحرانی انبار',
  date_card: 'کارت تقویم، زمان و سررسید',
  poetry_card: 'کارت شعر و ادب پارسی',
  motivation_card: 'کارت حکمت، انگیزش و تفکر',
  google_widget: 'ابزارک دستیار گوگل و ارتباطات سازمانی',
  announcements: 'تابلو اعلانات و پیام‌های سیستمی',
  task_groups: 'دسترسی سریع به گروه‌های وظایف و پروژه‌ها',
  notes: 'یادداشت‌های اختصاصی و دستور کارها',
  cartable: 'کارتابل اسناد و تاییدیه‌های منتظر اقدام',
  payment_stats: 'شاخص‌ها و آمارهای مالی و پرداختی',
  payment_chart: 'نمودار تفکیکی وضعیت اسناد پرداخت',
  warehouse_status: 'داشبورد تراز وزنی زنجیره تامین و انبارها',
  recent_activities: 'آخرین فعالیت‌ها و تراکنش‌های پرداخت',
  quick_tiles: 'کاشی‌های دسترسی سریع (Windows Tiles)',
};

const Dashboard: React.FC<DashboardProps> = ({ orders: rawOrders, settings, currentUser, onViewArchive, onFilterByStatus, onGoToPaymentApprovals, onGoToExitApprovals, onGoToBijakApprovals, onGoToPurchaseApprovals, onGoToTaskGroup, onNavigate, financialYear, activeTab }) => {
  const [realtimeOrders, setRealtimeOrders] = useState<PaymentOrder[]>(() => {
    try {
        const item = localStorage.getItem('app_data_orders');
        return item ? JSON.parse(item) : (rawOrders || []);
    } catch {
        return rawOrders || [];
    }
  });

  useEffect(() => {
    if (Array.isArray(rawOrders) && rawOrders.length > 0) {
        setRealtimeOrders(rawOrders);
    }
  }, [rawOrders]);

  const orders = useMemo(() => {
        if (!financialYear || financialYear === 'all') return realtimeOrders;
        return realtimeOrders.filter(o => isInFinancialYear(o.date, financialYear) || isInFinancialYear(o.payDate, financialYear));
  }, [realtimeOrders, financialYear]);

  const [showBankReport, setShowBankReport] = useState(false);
  const [bankReportTab, setBankReportTab] = useState<'summary' | 'timeline'>('summary');
  
  // Data for additional counts
  const [exitPermits, setExitPermits] = useState<ExitPermit[]>(() => {
    try {
        const item = localStorage.getItem('app_data_exit_permits');
        return item ? JSON.parse(item) : [];
    } catch { return []; }
  });
  const [warehouseTxs, setWarehouseTxs] = useState<WarehouseTransaction[]>(() => {
    try {
        const item = localStorage.getItem('app_data_wh_tx');
        return item ? JSON.parse(item) : [];
    } catch { return []; }
  });
  const [purchaseReqs, setPurchaseReqs] = useState<PurchaseRequest[]>(() => {
    try {
        const item = localStorage.getItem('app_data_purchase_reqs');
        return item ? JSON.parse(item) : [];
    } catch { return []; }
  });
  const [secretariatLetters, setSecretariatLetters] = useState<any[]>(() => {
    try {
        const item = localStorage.getItem('app_data_secretariat');
        return item ? JSON.parse(item) : [];
    } catch { return []; }
  });

  // Personal Notes State
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
        const item = localStorage.getItem('app_data_notes');
        const allNotes = item ? JSON.parse(item) : [];
        return currentUser?.id ? allNotes.filter((n: Note) => n.userId === currentUser.id && !n.isPrivate) : [];
    } catch { return []; }
  });
  
  useEffect(() => {
    if (currentUser?.id) {
        getNotes().then(allNotes => {
            setNotes(allNotes.filter(n => n.userId === currentUser.id && !n.isPrivate));
        }).catch(e => console.error("Load dashboard notes error", e));
    }
  }, [currentUser]);

  // Poetry State
  const [poemList, setPoemList] = useState<Array<{text: string; author: string; source?: string; title?: string}>>(() => [...persianPoems]);
  const [currentPoemIndex, setCurrentPoemIndex] = useState(0);
  const [isLoadingPoem, setIsLoadingPoem] = useState(false);
  const [copiedPoem, setCopiedPoem] = useState(false);

  // Motivational Quotes State
  const [motivationalList, setMotivationalList] = useState<Array<{text: string; author: string; source?: string; title?: string}>>(() => [...persianMotivationalQuotes]);
  const [currentMotivationalIndex, setCurrentMotivationalIndex] = useState(0);
  const [isLoadingMotivational, setIsLoadingMotivational] = useState(false);
  const [copiedMotivational, setCopiedMotivational] = useState(false);
  const [showQuickTiles, setShowQuickTiles] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dashboard_show_quick_tiles');
      return saved !== 'false';
    } catch {
      return true;
    }
  });

  const toggleQuickTiles = () => {
    setShowQuickTiles(prev => {
      const next = !prev;
      try {
        localStorage.setItem('dashboard_show_quick_tiles', String(next));
      } catch {}
      return next;
    });
  };

  // Windows-style Customizable Tiles Order & Visibility
  const [customTileOrder, setCustomTileOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard_custom_tile_order');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [hiddenTileIds, setHiddenTileIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard_hidden_tile_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [showGoogleWidget, setShowGoogleWidget] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dashboard_show_google_widget');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleGoogleWidgetVisibility = () => {
    setShowGoogleWidget(prev => {
      const next = !prev;
      try {
        localStorage.setItem('dashboard_show_google_widget', String(next));
      } catch {}
      return next;
    });
  };

  const [isCustomizingTiles, setIsCustomizingTiles] = useState(false);

  // User-specific customization storage key
  const userStorageKey = useMemo(() => {
    return currentUser?.id ? String(currentUser.id) : (currentUser?.username || 'default_user');
  }, [currentUser]);

  // Admin Role-based widget locking state
  const [roleLocks, setRoleLocks] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem('dashboard_role_locks');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [showAdminLocksModal, setShowAdminLocksModal] = useState<boolean>(false);
  const [showPresetsDropdown, setShowPresetsDropdown] = useState<boolean>(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dashboard_toolbar_collapsed');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  // Version Update State
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean>(false);
  const [isUpdateDismissed, setIsUpdateDismissed] = useState<boolean>(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);

  const checkDashboardVersion = async () => {
    setIsCheckingUpdate(true);
    try {
      const updateResult = await checkServerUpdate();
      if (updateResult.serverInfo) {
        setUpdateInfo(updateResult.serverInfo);
        if (updateResult.hasUpdate) {
          setIsUpdateAvailable(true);
          setIsUpdateDismissed(false);
        }
      }
    } catch (e) {
      console.debug('Dashboard update check error', e);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    checkDashboardVersion();
    const handleUpdatePublished = (e: any) => {
      if (e?.detail) {
        setUpdateInfo(e.detail);
        setIsUpdateAvailable(true);
        setIsUpdateDismissed(false);
      } else {
        checkDashboardVersion();
      }
    };
    window.addEventListener('app:update-published', handleUpdatePublished);
    return () => {
      window.removeEventListener('app:update-published', handleUpdatePublished);
    };
  }, []);

  // Check if a widget is locked for the current user's role/group
  const isWidgetLockedForCurrentUser = (widgetId: string): boolean => {
    if (!currentUser) return false;
    // Admins and CEOs can always customize and edit their layout
    if (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CEO || permissions.isSuperUser) {
      return false;
    }
    const globalLocks = roleLocks['all'] || [];
    if (globalLocks.includes(widgetId)) return true;
    if (roleLocks[currentUser.role]?.includes(widgetId)) return true;
    const userRoles = (currentUser as any).roles;
    if (Array.isArray(userRoles)) {
      for (const r of userRoles) {
        if (roleLocks[r]?.includes(widgetId)) return true;
      }
    }
    return false;
  };

  // Collapsed widgets state (Minimize / Maximize per widget)
  const [collapsedWidgets, setCollapsedWidgets] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`dashboard_collapsed_widgets_${userStorageKey}`) || localStorage.getItem('dashboard_collapsed_widgets');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleToggleCollapseWidget = (id: string) => {
    setCollapsedWidgets(prev => {
      const updated = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(`dashboard_collapsed_widgets_${userStorageKey}`, JSON.stringify(updated));
        localStorage.setItem('dashboard_collapsed_widgets', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Full-dashboard interactive widgets management (customizable grid/list)
  const [widgetsVisibility, setWidgetsVisibility] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`dashboard_widgets_visibility_${userStorageKey}`) || localStorage.getItem('dashboard_widgets_visibility');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          warehouse_alert: parsed.warehouse_alert ?? true,
          date_card: parsed.date_card ?? true,
          poetry_card: parsed.poetry_card ?? true,
          motivation_card: parsed.motivation_card ?? true,
          google_widget: parsed.google_widget ?? true,
          announcements: parsed.announcements ?? true,
          task_groups: parsed.task_groups ?? true,
          notes: parsed.notes ?? true,
          cartable: parsed.cartable ?? true,
          payment_stats: parsed.payment_stats ?? true,
          payment_chart: parsed.payment_chart ?? true,
          warehouse_status: parsed.warehouse_status ?? true,
          recent_activities: parsed.recent_activities ?? true,
          quick_tiles: parsed.quick_tiles ?? true,
        };
      }
    } catch {}
    return {
      warehouse_alert: true,
      date_card: true,
      poetry_card: true,
      motivation_card: true,
      google_widget: true,
      announcements: true,
      task_groups: true,
      notes: true,
      cartable: true,
      payment_stats: true,
      payment_chart: true,
      warehouse_status: true,
      recent_activities: true,
      quick_tiles: true,
    };
  });

  const [widgetsOrder, setWidgetsOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`dashboard_widgets_order_${userStorageKey}`) || localStorage.getItem('dashboard_widgets_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        const defaultWidgets = [
          'warehouse_alert',
          'date_card',
          'poetry_card',
          'motivation_card',
          'google_widget',
          'announcements',
          'task_groups',
          'notes',
          'cartable',
          'payment_stats',
          'payment_chart',
          'warehouse_status',
          'recent_activities',
          'quick_tiles',
        ];
        const filtered = parsed.filter((id: string) => defaultWidgets.includes(id));
        const missing = defaultWidgets.filter(id => !filtered.includes(id));
        return [...filtered, ...missing];
      }
    } catch {}
    return [
      'warehouse_alert',
      'date_card',
      'poetry_card',
      'motivation_card',
      'google_widget',
      'announcements',
      'task_groups',
      'notes',
      'cartable',
      'payment_stats',
      'payment_chart',
      'warehouse_status',
      'recent_activities',
      'quick_tiles',
    ];
  });

  // Widget Resizing State (Width percentage and Height px per widget)
  const [widgetSizes, setWidgetSizes] = useState<Record<string, WidgetSize>>(() => {
    try {
      const saved = localStorage.getItem(`dashboard_widget_sizes_${userStorageKey}`) || localStorage.getItem('dashboard_widget_sizes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleUpdateWidgetSize = (id: string, newSize: WidgetSize) => {
    if (isWidgetLockedForCurrentUser(id)) return;
    setWidgetSizes(prev => {
      const updated = { ...prev, [id]: newSize };
      try {
        localStorage.setItem(`dashboard_widget_sizes_${userStorageKey}`, JSON.stringify(updated));
        localStorage.setItem('dashboard_widget_sizes', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleResetWidgetSize = (id: string) => {
    if (isWidgetLockedForCurrentUser(id)) return;
    setWidgetSizes(prev => {
      const updated = { ...prev };
      delete updated[id];
      try {
        localStorage.setItem(`dashboard_widget_sizes_${userStorageKey}`, JSON.stringify(updated));
        localStorage.setItem('dashboard_widget_sizes', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Layout Presets Switcher (including pre-update classic full-width default)
  const handleApplyLayoutPreset = (preset: 'classic_default' | 'modern_responsive' | 'company_default') => {
    if (preset === 'classic_default') {
      // 1. Classic Default (Before update - 100% full width, uncollapsed, classic sequence)
      const classicOrder = [
        'warehouse_alert',
        'date_card',
        'poetry_card',
        'motivation_card',
        'google_widget',
        'announcements',
        'task_groups',
        'notes',
        'cartable',
        'payment_stats',
        'payment_chart',
        'warehouse_status',
        'recent_activities',
        'quick_tiles',
      ];
      const all100Sizes: Record<string, WidgetSize> = {};
      classicOrder.forEach(id => {
        all100Sizes[id] = { widthPercent: 100 };
      });
      const allVisible: Record<string, boolean> = {};
      classicOrder.forEach(id => {
        allVisible[id] = true;
      });

      setWidgetsOrder(classicOrder);
      setWidgetSizes(all100Sizes);
      setCollapsedWidgets({});
      setWidgetsVisibility(allVisible);

      try {
        localStorage.setItem(`dashboard_widgets_order_${userStorageKey}`, JSON.stringify(classicOrder));
        localStorage.setItem(`dashboard_widget_sizes_${userStorageKey}`, JSON.stringify(all100Sizes));
        localStorage.setItem(`dashboard_collapsed_widgets_${userStorageKey}`, JSON.stringify({}));
        localStorage.setItem(`dashboard_widgets_visibility_${userStorageKey}`, JSON.stringify(allVisible));
        localStorage.setItem('dashboard_widgets_order', JSON.stringify(classicOrder));
        localStorage.setItem('dashboard_widget_sizes', JSON.stringify(all100Sizes));
        localStorage.setItem('dashboard_collapsed_widgets', JSON.stringify({}));
        localStorage.setItem('dashboard_widgets_visibility', JSON.stringify(allVisible));
      } catch {}
    } else if (preset === 'modern_responsive') {
      // 2. Modern Multi-Column Responsive Layout
      const modernSizes: Record<string, WidgetSize> = {
        date_card: { widthPercent: 33.33 },
        poetry_card: { widthPercent: 33.33 },
        motivation_card: { widthPercent: 33.33 },
        google_widget: { widthPercent: 100 },
        announcements: { widthPercent: 100 },
        task_groups: { widthPercent: 50 },
        notes: { widthPercent: 50 },
        cartable: { widthPercent: 100 },
        payment_stats: { widthPercent: 50 },
        payment_chart: { widthPercent: 50 },
        warehouse_status: { widthPercent: 100 },
        recent_activities: { widthPercent: 100 },
        quick_tiles: { widthPercent: 100 },
        warehouse_alert: { widthPercent: 100 },
      };
      setWidgetSizes(modernSizes);
      try {
        localStorage.setItem(`dashboard_widget_sizes_${userStorageKey}`, JSON.stringify(modernSizes));
        localStorage.setItem('dashboard_widget_sizes', JSON.stringify(modernSizes));
      } catch {}
    } else if (preset === 'company_default') {
      // 3. Organization layout published by Admin
      try {
        const savedCompany = localStorage.getItem('dashboard_company_default_layout');
        if (savedCompany) {
          const parsed = JSON.parse(savedCompany);
          if (parsed.order) setWidgetsOrder(parsed.order);
          if (parsed.sizes) setWidgetSizes(parsed.sizes);
          if (parsed.visibility) setWidgetsVisibility(parsed.visibility);
          if (parsed.collapsed) setCollapsedWidgets(parsed.collapsed);
        } else {
          handleApplyLayoutPreset('modern_responsive');
        }
      } catch {}
    }
    setShowPresetsDropdown(false);
  };

  const handlePublishCompanyDefaultLayout = () => {
    try {
      const companyPayload = {
        order: widgetsOrder,
        sizes: widgetSizes,
        visibility: widgetsVisibility,
        collapsed: collapsedWidgets,
        updatedAt: Date.now(),
        publishedBy: currentUser?.fullName || currentUser?.username,
      };
      localStorage.setItem('dashboard_company_default_layout', JSON.stringify(companyPayload));
      alert('چیدمان فعلی به عنوان چیدمان پیش‌فرض سازمانی برای تمام پرسنل با موفقیت ذخیره شد.');
    } catch {}
  };

  const handleSaveRoleLocks = (newLocks: Record<string, string[]>) => {
    setRoleLocks(newLocks);
    try {
      localStorage.setItem('dashboard_role_locks', JSON.stringify(newLocks));
    } catch {}
  };

  const [isClearDesktop, setIsClearDesktop] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dashboard_clear_desktop') === 'true';
    } catch {
      return false;
    }
  });

  const [bgEnabled, setBgEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('app_enable_bg_image') !== 'false';
    } catch {
      return true;
    }
  });
  const [bgMode, setBgMode] = useState<string>(() => {
    try {
      return localStorage.getItem('app_bg_mode') || 'preset';
    } catch {
      return 'preset';
    }
  });
  const [bgPreset, setBgPreset] = useState<string>(() => {
    try {
      return localStorage.getItem('app_preset_bg') || 'aurora-light';
    } catch {
      return 'aurora-light';
    }
  });
  const [customBgUrl, setCustomBgUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('app_custom_bg_image') || '';
    } catch {
      return '';
    }
  });
  const [bgBlur, setBgBlur] = useState<number>(() => {
    try {
      const b = localStorage.getItem('app_custom_bg_blur');
      return b ? parseInt(b, 10) : 0;
    } catch {
      return 0;
    }
  });

  const updateBgSetting = (key: string, value: string | number) => {
    try {
      localStorage.setItem(key, String(value));
      if (key === 'app_enable_bg_image') setBgEnabled(value === 'true');
      if (key === 'app_bg_mode') setBgMode(String(value));
      if (key === 'app_preset_bg') setBgPreset(String(value));
      if (key === 'app_custom_bg_image') setCustomBgUrl(String(value));
      if (key === 'app_custom_bg_blur') setBgBlur(Number(value));
      
      window.dispatchEvent(new Event('APP_THEME_BG_CHANGED'));
    } catch (e) {
      console.error(e);
    }
  };

  const [isCustomizingWidgets, setIsCustomizingWidgets] = useState(false);
  const [showAddWidgetsDropdown, setShowAddWidgetsDropdown] = useState(false);
  const [showWallpaperDropdown, setShowWallpaperDropdown] = useState(false);

  const toggleWidgetVisibility = (id: string) => {
    if (isWidgetLockedForCurrentUser(id)) {
      alert('این ابزارک توسط مدیر سیستم برای نقش کاربری شما قفل شده است و قابل حذف یا پنهان‌سازی نیست.');
      return;
    }
    setWidgetsVisibility(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(`dashboard_widgets_visibility_${userStorageKey}`, JSON.stringify(next));
        localStorage.setItem('dashboard_widgets_visibility', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const moveWidget = (fromIdx: number, toIdx: number) => {
    const list = [...widgetsOrder];
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length) return;
    const widgetId = list[fromIdx];
    if (isWidgetLockedForCurrentUser(widgetId)) {
      alert('این ابزارک توسط مدیریت برای نقش کاربری شما قفل شده است.');
      return;
    }
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    setWidgetsOrder(list);
    try {
      localStorage.setItem(`dashboard_widgets_order_${userStorageKey}`, JSON.stringify(list));
      localStorage.setItem('dashboard_widgets_order', JSON.stringify(list));
    } catch {}
  };

  // Drag and Drop reordering state for widgets
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);

  const handleWidgetDragStart = (id: string, e: React.DragEvent) => {
    if (isWidgetLockedForCurrentUser(id)) {
      e.preventDefault();
      return;
    }
    setDraggedWidgetId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleWidgetDragOver = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedWidgetId && draggedWidgetId !== targetId && dragOverWidgetId !== targetId) {
      setDragOverWidgetId(targetId);
    }
  };

  const handleWidgetDragLeave = (targetId: string) => {
    if (dragOverWidgetId === targetId) {
      setDragOverWidgetId(null);
    }
  };

  const handleWidgetDrop = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = draggedWidgetId || e.dataTransfer.getData('text/plain');
    if (sourceId && sourceId !== targetId) {
      const fromIdx = widgetsOrder.indexOf(sourceId);
      const toIdx = widgetsOrder.indexOf(targetId);
      if (fromIdx !== -1 && toIdx !== -1) {
        moveWidget(fromIdx, toIdx);
      }
    }
    setDraggedWidgetId(null);
    setDragOverWidgetId(null);
  };

  const handleWidgetDragEnd = () => {
    setDraggedWidgetId(null);
    setDragOverWidgetId(null);
  };

  const handleToggleClearDesktop = () => {
    setIsClearDesktop(prev => {
      const next = !prev;
      try {
        localStorage.setItem('dashboard_clear_desktop', String(next));
      } catch {}
      return next;
    });
  };

  const handleResetWidgets = () => {
    const defaultVisibility = {
      warehouse_alert: true,
      date_card: true,
      poetry_card: true,
      motivation_card: true,
      google_widget: true,
      announcements: true,
      task_groups: true,
      notes: true,
      cartable: true,
      payment_stats: true,
      payment_chart: true,
      warehouse_status: true,
      recent_activities: true,
      quick_tiles: true,
    };
    const defaultOrder = [
      'warehouse_alert',
      'date_card',
      'poetry_card',
      'motivation_card',
      'google_widget',
      'announcements',
      'task_groups',
      'notes',
      'cartable',
      'payment_stats',
      'payment_chart',
      'warehouse_status',
      'recent_activities',
      'quick_tiles',
    ];
    setWidgetsVisibility(defaultVisibility);
    setWidgetsOrder(defaultOrder);
    setWidgetSizes({});
    setCollapsedWidgets({});
    setIsClearDesktop(false);
    setIsCustomizingWidgets(false);
    try {
      localStorage.setItem(`dashboard_widgets_visibility_${userStorageKey}`, JSON.stringify(defaultVisibility));
      localStorage.setItem(`dashboard_widgets_order_${userStorageKey}`, JSON.stringify(defaultOrder));
      localStorage.removeItem(`dashboard_widget_sizes_${userStorageKey}`);
      localStorage.removeItem(`dashboard_collapsed_widgets_${userStorageKey}`);
      localStorage.setItem('dashboard_widgets_visibility', JSON.stringify(defaultVisibility));
      localStorage.setItem('dashboard_widgets_order', JSON.stringify(defaultOrder));
      localStorage.removeItem('dashboard_widget_sizes');
      localStorage.removeItem('dashboard_collapsed_widgets');
      localStorage.setItem('dashboard_clear_desktop', 'false');
    } catch {}
  };

  const widgetNames: Record<string, string> = {
    warehouse_alert: 'هشدار تراز وزنی انبارها',
    date_card: 'کارت تاریخ روز',
    poetry_card: 'شعر و غزل روزانه',
    motivation_card: 'جملات انگیزشی',
    google_widget: 'ویجت گوگل (تقویم و تسک)',
    announcements: 'اعلانات مدیران کارخانه',
    task_groups: 'تسک‌های گروهی گفتگو',
    notes: 'یادداشت‌ها و تسک‌های من',
    cartable: 'کارتابل و تاییدات من',
    payment_stats: 'آمار وضعیت پرداخت‌ها',
    payment_chart: 'نمودار روش‌های پرداخت',
    warehouse_status: 'داشبورد تراز وزنی کل زنجیره تامین',
    recent_activities: 'آخرین فعالیت‌های پرداخت',
    quick_tiles: 'کاشی‌های دسترسی سریع (ویندوزی)',
  };

  const saveTileOrder = (newOrder: string[]) => {
    setCustomTileOrder(newOrder);
    try {
      localStorage.setItem('dashboard_custom_tile_order', JSON.stringify(newOrder));
    } catch {}
  };

  const toggleTileVisibility = (tileId: string) => {
    setHiddenTileIds(prev => {
      const next = prev.includes(tileId) ? prev.filter(id => id !== tileId) : [...prev, tileId];
      try {
        localStorage.setItem('dashboard_hidden_tile_ids', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const moveTile = (fromIdx: number, toIdx: number) => {
    const list = [...displayTiles];
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    saveTileOrder(list.map(t => t.id));
  };

  // Warehouse Alert State
  const [warehouseAlertData, setWarehouseAlertData] = useState<{ totalCurrentAllWeight: number, diffAllWeight: number, ratioAllWeight: number } | null>(null);
  const [warehouseOverviewData, setWarehouseOverviewData] = useState<any | null>(null);
  const [isRefreshingWarehouse, setIsRefreshingWarehouse] = useState(false);
  const [warehouseIsMock, setWarehouseIsMock] = useState(false);

  // Cheque Receipts pending counts
  const [pendingChequeCounts, setPendingChequeCounts] = useState<{ 
      pendingAccounting: number; 
      pendingCeo: number; 
      processingSayan: number; 
      total: number;
      config?: any;
  }>({
      pendingAccounting: 0,
      pendingCeo: 0,
      processingSayan: 0,
      total: 0
  });

  const fetchPendingCheques = async () => {
      try {
          const res = await fetch('/api/sayan/cheque-receipts/pending-counts');
          if (res.ok) {
              const data = await res.json();
              if (data.success) {
                  setPendingChequeCounts({
                      pendingAccounting: data.pendingAccounting || 0,
                      pendingCeo: data.pendingCeo || data.pendingCEO || 0,
                      processingSayan: data.processingSayan || 0,
                      total: data.totalPending || data.total || 0,
                      config: data.config
                  });
              }
          }
      } catch (err) {
          // ignore silent
      }
  };

  useEffect(() => {
      fetchPendingCheques();
      const timer = setInterval(fetchPendingCheques, 30000);
      return () => clearInterval(timer);
  }, []);

  const fetchWarehouseAlert = async (isManual = false) => {
      if (isManual) setIsRefreshingWarehouse(true);
      try {
          const res = await fetch('/api/warehouse-overview/live-status' + (isManual ? '?force=true' : ''));
          if (res.ok) {
              const data = await res.json();
              setWarehouseOverviewData(data);
              setWarehouseIsMock(!!data.isMock);
              if (data?.meta?.totalCurrentAllWeight !== undefined) {
                  setWarehouseAlertData({
                      totalCurrentAllWeight: data.meta.totalCurrentAllWeight,
                      diffAllWeight: data.meta.diffAllWeight,
                      ratioAllWeight: data.meta.ratioAllWeight
                  });
              }
          }
      } catch (err) {
          console.warn("Failed to fetch warehouse overview alert (fallback to cached state):", err);
      } finally {
          if (isManual) setIsRefreshingWarehouse(false);
      }
  };

  useEffect(() => {
      fetchWarehouseAlert(false);

      // Periodic background polling every 90 seconds to stay in sync without saturating Sayan API
      const intervalTimer = setInterval(() => {
          fetchWarehouseAlert(false);
      }, 90000);

      // Re-fetch immediately when window or tab becomes visible / focused
      const handleWindowFocus = () => {
          if (!document.hidden) {
              fetchWarehouseAlert(false);
          }
      };

      const handleLiveWarehouseUpdate = (e: any) => {
          if (e.detail?.meta) {
              setWarehouseOverviewData((prev: any) => ({
                  ...(prev || {}),
                  meta: {
                      ...(prev?.meta || {}),
                      ...e.detail.meta
                  }
              }));
              if (e.detail.meta.totalCurrentAllWeight !== undefined) {
                  setWarehouseAlertData({
                      totalCurrentAllWeight: e.detail.meta.totalCurrentAllWeight,
                      diffAllWeight: e.detail.meta.diffAllWeight,
                      ratioAllWeight: e.detail.meta.ratioAllWeight
                  });
              }
          }
      };

      const handleStorageUpdate = (e: StorageEvent) => {
          if (e.key === 'SAYAN_EXCLUDED_REGISTRATION_NUMBERS') {
              fetchWarehouseAlert(false);
          }
      };

      window.addEventListener('warehouse_overview_updated', handleLiveWarehouseUpdate);
      window.addEventListener('storage', handleStorageUpdate);
      window.addEventListener('focus', handleWindowFocus);
      document.addEventListener('visibilitychange', handleWindowFocus);

      return () => {
          clearInterval(intervalTimer);
          window.removeEventListener('warehouse_overview_updated', handleLiveWarehouseUpdate);
          window.removeEventListener('storage', handleStorageUpdate);
          window.removeEventListener('focus', handleWindowFocus);
          document.removeEventListener('visibilitychange', handleWindowFocus);
      };
  }, []);

  // Automatically fetch online poem & online motivational quote on mount
  useEffect(() => {
    let isMounted = true;
    
    const fetchInitialPoem = async () => {
      try {
        const response = await fetch('/api/quote/poem');
        if (response.ok && isMounted) {
          const data = await response.json();
          if (data && data.text) {
            setPoemList(prev => {
              if (prev.some(q => q.text === data.text)) return prev;
              return [data, ...prev];
            });
            setCurrentPoemIndex(0);
          }
        }
      } catch (e) {
        console.error("Mount poem fetch error:", e);
      }
    };

    const fetchInitialMotivational = async () => {
      try {
        const response = await fetch('/api/quote/motivational');
        if (response.ok && isMounted) {
          const data = await response.json();
          if (data && data.text) {
            setMotivationalList(prev => {
              if (prev.some(q => q.text === data.text)) return prev;
              return [data, ...prev];
            });
            setCurrentMotivationalIndex(0);
          }
        }
      } catch (e) {
        console.error("Mount motivational fetch error:", e);
      }
    };

    fetchInitialPoem();
    fetchInitialMotivational();

    return () => { isMounted = false; };
  }, []);

  const dailyPoem = useMemo(() => {
    return poemList[currentPoemIndex] || poemList[0] || { text: 'بنی آدم اعضای یک پیکرند\nکه در آفرینش ز یک گوهرند', author: 'سعدی' };
  }, [currentPoemIndex, poemList]);

  const dailyMotivational = useMemo(() => {
    return motivationalList[currentMotivationalIndex] || motivationalList[0] || { text: 'موفقیت حاصل تلاش‌های کوچک اما مداوم است.', author: 'رابرت کالیر' };
  }, [currentMotivationalIndex, motivationalList]);

  // Poetry handlers
  const handlePrevPoem = () => {
    setCurrentPoemIndex(prev => (prev - 1 + poemList.length) % poemList.length);
  };

  const handleNextPoem = async () => {
    if (currentPoemIndex === poemList.length - 1) {
      setIsLoadingPoem(true);
      try {
        const response = await fetch('/api/quote/poem');
        if (response.ok) {
          const data = await response.json();
          if (data && data.text) {
            setPoemList(prev => [...prev, data]);
            setCurrentPoemIndex(prev => prev + 1);
            setIsLoadingPoem(false);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to fetch next online poem:", err);
      }
      setIsLoadingPoem(false);
    }
    setCurrentPoemIndex(prev => (prev + 1) % poemList.length);
  };

  const handleFetchNewPoem = async () => {
    setIsLoadingPoem(true);
    try {
      const response = await fetch('/api/quote/poem');
      if (response.ok) {
        const data = await response.json();
        if (data && data.text) {
          setPoemList(prev => {
            const existsIdx = prev.findIndex(q => q.text === data.text);
            if (existsIdx !== -1) {
              setCurrentPoemIndex(existsIdx);
              return prev;
            }
            const newList = [...prev, data];
            setCurrentPoemIndex(newList.length - 1);
            return newList;
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch fresh online poem:", err);
    }
    setIsLoadingPoem(false);
  };

  const handleCopyPoem = () => {
    if (!dailyPoem) return;
    const fullText = `«${dailyPoem.text}»\n— ${dailyPoem.author || 'شاعر پارسی'}${dailyPoem.source ? ` (${dailyPoem.source})` : ''}`;
    navigator.clipboard.writeText(fullText);
    setCopiedPoem(true);
    setTimeout(() => setCopiedPoem(false), 2000);
  };

  // Motivational handlers
  const handlePrevMotivational = () => {
    setCurrentMotivationalIndex(prev => (prev - 1 + motivationalList.length) % motivationalList.length);
  };

  const handleNextMotivational = async () => {
    if (currentMotivationalIndex === motivationalList.length - 1) {
      setIsLoadingMotivational(true);
      try {
        const response = await fetch('/api/quote/motivational');
        if (response.ok) {
          const data = await response.json();
          if (data && data.text) {
            setMotivationalList(prev => [...prev, data]);
            setCurrentMotivationalIndex(prev => prev + 1);
            setIsLoadingMotivational(false);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to fetch next online motivational quote:", err);
      }
      setIsLoadingMotivational(false);
    }
    setCurrentMotivationalIndex(prev => (prev + 1) % motivationalList.length);
  };

  const handleFetchNewMotivational = async () => {
    setIsLoadingMotivational(true);
    try {
      const response = await fetch('/api/quote/motivational');
      if (response.ok) {
        const data = await response.json();
        if (data && data.text) {
          setMotivationalList(prev => {
            const existsIdx = prev.findIndex(q => q.text === data.text);
            if (existsIdx !== -1) {
              setCurrentMotivationalIndex(existsIdx);
              return prev;
            }
            const newList = [...prev, data];
            setCurrentMotivationalIndex(newList.length - 1);
            return newList;
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch fresh online motivational quote:", err);
    }
    setIsLoadingMotivational(false);
  };

  const handleCopyMotivational = () => {
    if (!dailyMotivational) return;
    const fullText = `«${dailyMotivational.text}»\n— ${dailyMotivational.author || 'سخنان بزرگان'}${dailyMotivational.title ? ` (${dailyMotivational.title})` : ''}`;
    navigator.clipboard.writeText(fullText);
    setCopiedMotivational(true);
    setTimeout(() => setCopiedMotivational(false), 2000);
  };

  const shamsiDate = useMemo(() => {
        try {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const parts = formatter.formatToParts(now);
            
            const findPart = (type: string) => parts.find(p => p.type === type)?.value || '';
            
            return {
                weekday: findPart('weekday'),
                day: findPart('day'),
                month: findPart('month'),
                year: findPart('year'),
                full: formatter.format(now)
            };
        } catch (e) {
            return { weekday: 'امروز', day: '-', month: '-', year: '-', full: '' };
        }
    }, [rawOrders]);

    const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>(() => {
        try {
            const item = localStorage.getItem('app_data_announcements');
            return item ? JSON.parse(item) : [];
        } catch { return []; }
    });
    const [showAnnounceModal, setShowAnnounceModal] = useState(false);
    const [announceText, setAnnounceText] = useState('');
    const [announceTarget, setAnnounceTarget] = useState('');
    const [announceType, setAnnounceType] = useState<'announcement' | 'task'>('announcement');
    
    // Add users fetching for target dropdown
    const [allUsers, setAllUsers] = useState<User[]>([]);
    useEffect(() => {
        import('../services/authService').then(mod => {
            mod.getUsers().then(u => setAllUsers(u || []));
        });
    }, []);

    // Chat Task groups & tasks data for dashboard
    const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
    const [tasks, setTasks] = useState<GroupTask[]>([]);
    const [showTasksInDashboard, setShowTasksInDashboard] = useState<boolean>(() => {
        return localStorage.getItem('dashboard_show_chat_tasks') !== 'false';
    });

    const loadTasksData = () => {
        getTaskGroups().then(groups => {
            const myGroups = groups.filter(g => (g.members || []).includes(currentUser.username));
            setTaskGroups(myGroups);
        }).catch(e => console.error("Load task groups error", e));

        getTasks().then(allTasks => {
            setTasks(allTasks);
        }).catch(e => console.error("Load tasks error", e));
    };

    useEffect(() => {
        loadTasksData();
    }, [currentUser, activeTab]);

    const handleCreateAnnouncement = async () => {
        if (!announceText.trim()) return;
        const targetUsers = announceTarget ? [announceTarget] : [];
        const newAnn: SystemAnnouncement = {
            id: Date.now().toString(),
            message: announceText,
            createdBy: currentUser.username,
            createdAt: Date.now(),
            targetUsers,
            type: announceType,
            isCompleted: false
        } as any; // Allow for custom typings temporarily
        const mod = await import('../services/storageService');
        await mod.createSystemAnnouncement(newAnn);
        setAnnouncements(prev => [newAnn, ...prev]);
        setShowAnnounceModal(false);
        setAnnounceText('');
        setAnnounceTarget('');
        setAnnounceType('announcement');
    };

    useEffect(() => {
        import('../services/storageService').then(mod => {
            mod.getSystemAnnouncements().then(anns => {
                setAnnouncements(anns ? anns.sort((a,b)=>b.createdAt - a.createdAt) : []);
            }).catch(console.error);
        });
    }, [activeTab]);

    const handleToggleAnnouncementCompletion = async (ann: SystemAnnouncement) => {
        const updatedAnn = { 
            ...ann, 
            isCompleted: !ann.isCompleted, 
            completedAt: !ann.isCompleted ? Date.now() : undefined,
            completedBy: !ann.isCompleted ? currentUser.username : undefined
        };
        const mod = await import('../services/storageService');
        await mod.updateSystemAnnouncement(updatedAnn);
        setAnnouncements(prev => prev.map(a => a.id === ann.id ? updatedAnn : a));
    };

    const visibleAnnouncements = useMemo(() => {
        return announcements.filter(a => {
            if (!a.targetUsers || a.targetUsers.length === 0) return true; // all
            return a.targetUsers.includes(currentUser.username);
        });
    }, [announcements, currentUser]);

    // ... (rest of logic) ...

  // Permission Check
  const permissions = settings ? getRolePermissions(currentUser.role, settings, currentUser) : { canViewPaymentOrders: false };
  const hasPaymentAccess = permissions.canViewPaymentOrders === true || permissions.canManageArchiveAttachments === true || currentUser.canManageArchiveAttachments === true || currentUser.role === UserRole.ADMIN;
  const hasExitAccess = permissions.canViewExitPermits === true;
  const hasWarehouseAccess = permissions.canManageWarehouse === true || permissions.canApproveBijak === true;
  const hasPurchaseAccess = permissions.canManagePurchase === true || currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CEO || currentUser.role === UserRole.FACTORY_MANAGER;

  // --- REAL-TIME ZERO-DELAY OPTIMISTIC EVENT LISTENERS ---
  useEffect(() => {
    // 1. Payment Orders Real-Time Sync
    const handleOrderOptimistic = (e: any) => {
        const { orderId, targetStatus, updates, isDeleted, isNew, order } = e.detail || {};
        if (isDeleted && orderId) {
            setRealtimeOrders(prev => prev.filter(o => o.id !== orderId));
        } else if (isNew && order) {
            setRealtimeOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);
        } else if (orderId && targetStatus) {
            setRealtimeOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: targetStatus, ...(updates || {}) } : o));
        }
    };
    const handleOrderSynced = (e: any) => {
        const { allOrders } = e.detail || {};
        if (Array.isArray(allOrders) && allOrders.length > 0) {
            setRealtimeOrders(allOrders);
        }
    };

    // 2. Factory Exit Permits Real-Time Sync
    const handleExitPermitOptimistic = (e: any) => {
        const { permitId, targetStatus, extra, updates, isDeleted, isNew, permit } = e.detail || {};
        const applyUpdate = () => {
            if (isDeleted && permitId) {
                setExitPermits(prev => prev.filter(p => p.id !== permitId));
            } else if (isNew && permit) {
                setExitPermits(prev => [permit, ...prev.filter(p => p.id !== permit.id)]);
            } else if (permitId) {
                setExitPermits(prev => prev.map(p => p.id === permitId ? { ...p, ...(permit || {}), ...(targetStatus ? { status: targetStatus } : {}), ...(extra || {}), ...(updates || {}) } : p));
            }
        };
        if (activeTab && activeTab !== 'dashboard') {
            setTimeout(applyUpdate, 180);
        } else {
            applyUpdate();
        }
    };
    const handleExitPermitSynced = (e: any) => {
        const { permit, allPermits } = e.detail || {};
        const applySync = () => {
            if (permit && permit.id) {
                setExitPermits(prev => prev.some(p => p.id === permit.id)
                    ? prev.map(p => p.id === permit.id ? { ...p, ...permit } : p)
                    : [permit, ...prev]
                );
                return;
            }
            if (Array.isArray(allPermits) && allPermits.length > 0) {
                let filtered = allPermits;
                if (financialYear && financialYear !== 'all') {
                    filtered = filtered.filter(p => isInFinancialYear(p.date, financialYear));
                }
                setExitPermits(filtered);
            }
        };
        if (activeTab && activeTab !== 'dashboard') {
            setTimeout(applySync, 250);
        } else {
            applySync();
        }
    };

    // 3. Purchase Requests Real-Time Sync
    const handlePurchaseReqOptimistic = (e: any) => {
        const { reqId, targetStatus, updates, isDeleted, isNew, request } = e.detail || {};
        if (isDeleted && reqId) {
            setPurchaseReqs(prev => prev.filter(p => p.id !== reqId));
        } else if (isNew && request) {
            setPurchaseReqs(prev => [request, ...prev.filter(p => p.id !== request.id)]);
        } else if (reqId && targetStatus) {
            setPurchaseReqs(prev => prev.map(p => p.id === reqId ? { ...p, status: targetStatus, ...(updates || {}) } : p));
        }
    };
    const handlePurchaseReqSynced = (e: any) => {
        const { allPurchases } = e.detail || {};
        if (Array.isArray(allPurchases) && allPurchases.length > 0) {
            let filtered = allPurchases;
            if (financialYear && financialYear !== 'all') {
                filtered = filtered.filter(p => isInFinancialYear(p.date, financialYear));
            }
            setPurchaseReqs(filtered);
        }
    };

    // 4. Warehouse Transactions Real-Time Sync
    const handleWarehouseTxOptimistic = (e: any) => {
        const { txId, updates, isDeleted, isNew, tx } = e.detail || {};
        if (isDeleted && txId) {
            setWarehouseTxs(prev => prev.filter(t => t.id !== txId));
        } else if (isNew && tx) {
            setWarehouseTxs(prev => [tx, ...prev.filter(t => t.id !== tx.id)]);
        } else if (txId && updates) {
            setWarehouseTxs(prev => prev.map(t => t.id === txId ? { ...t, ...(updates || {}) } : t));
        }
    };
    const handleWarehouseTxSynced = (e: any) => {
        const { allTxs } = e.detail || {};
        if (Array.isArray(allTxs) && allTxs.length > 0) {
            let filtered = allTxs;
            if (financialYear && financialYear !== 'all') {
                filtered = filtered.filter(t => isInFinancialYear(t.date, financialYear));
            }
            setWarehouseTxs(filtered);
        }
    };

    window.addEventListener('ORDER_OPTIMISTIC_APPLY' as any, handleOrderOptimistic);
    window.addEventListener('ORDER_BACKGROUND_SYNCED' as any, handleOrderSynced);
    window.addEventListener('EXIT_PERMIT_OPTIMISTIC_APPLY' as any, handleExitPermitOptimistic);
    window.addEventListener('EXIT_PERMIT_BACKGROUND_SYNCED' as any, handleExitPermitSynced);
    window.addEventListener('PURCHASE_REQ_OPTIMISTIC_APPLY' as any, handlePurchaseReqOptimistic);
    window.addEventListener('PURCHASE_REQ_BACKGROUND_SYNCED' as any, handlePurchaseReqSynced);
    window.addEventListener('WAREHOUSE_TX_OPTIMISTIC_APPLY' as any, handleWarehouseTxOptimistic);
    window.addEventListener('WAREHOUSE_TX_BACKGROUND_SYNCED' as any, handleWarehouseTxSynced);

    return () => {
        window.removeEventListener('ORDER_OPTIMISTIC_APPLY' as any, handleOrderOptimistic);
        window.removeEventListener('ORDER_BACKGROUND_SYNCED' as any, handleOrderSynced);
        window.removeEventListener('EXIT_PERMIT_OPTIMISTIC_APPLY' as any, handleExitPermitOptimistic);
        window.removeEventListener('EXIT_PERMIT_BACKGROUND_SYNCED' as any, handleExitPermitSynced);
        window.removeEventListener('PURCHASE_REQ_OPTIMISTIC_APPLY' as any, handlePurchaseReqOptimistic);
        window.removeEventListener('PURCHASE_REQ_BACKGROUND_SYNCED' as any, handlePurchaseReqSynced);
        window.removeEventListener('WAREHOUSE_TX_OPTIMISTIC_APPLY' as any, handleWarehouseTxOptimistic);
        window.removeEventListener('WAREHOUSE_TX_BACKGROUND_SYNCED' as any, handleWarehouseTxSynced);
    };
  }, [financialYear]);

  useEffect(() => {
      const fetchData = async () => {
          try {
              // 0ms instant reload from local cache first
              try {
                  const localExits = localStorage.getItem('app_data_exit_permits');
                  if (localExits) {
                      let parsed = JSON.parse(localExits);
                      if (financialYear && financialYear !== 'all') parsed = parsed.filter((e: any) => isInFinancialYear(e.date, financialYear));
                      setExitPermits(parsed);
                  }
                  const localTxs = localStorage.getItem('app_data_wh_tx');
                  if (localTxs) {
                      let parsed = JSON.parse(localTxs);
                      if (financialYear && financialYear !== 'all') parsed = parsed.filter((t: any) => isInFinancialYear(t.date, financialYear));
                      setWarehouseTxs(parsed);
                  }
                  const localPurchases = localStorage.getItem('app_data_purchase_reqs');
                  if (localPurchases) {
                      let parsed = JSON.parse(localPurchases);
                      if (financialYear && financialYear !== 'all') parsed = parsed.filter((p: any) => isInFinancialYear(p.date, financialYear));
                      setPurchaseReqs(parsed);
                  }
              } catch {}

              if (hasExitAccess || hasWarehouseAccess || hasPurchaseAccess) {
                  let [exits, txs, purchases] = await Promise.all([getExitPermits(), getWarehouseTransactions(), getPurchaseRequests()]);
                  if (financialYear && financialYear !== 'all') {
                      exits = exits.filter(e => isInFinancialYear(e.date, financialYear));
                      txs = txs.filter(t => isInFinancialYear(t.date, financialYear));
                      purchases = purchases.filter(p => isInFinancialYear(p.date, financialYear));
                  }
                  setExitPermits(exits || []);
                  setWarehouseTxs(txs || []);
                  setPurchaseReqs(purchases || []);
              }
          } catch (error) {
              console.error("Dashboard data load error", error);
          }
      };
      fetchData();
  }, [hasExitAccess, hasWarehouseAccess, hasPurchaseAccess, financialYear, activeTab]);

  // --- CALC PENDING COUNTS FOR ACTION CARDS ---
  
  // 1. Payment Pending Count (Based on user role)
  let pendingPaymentCount = 0;
  if (hasPaymentAccess) {
      if (currentUser.role === UserRole.FINANCIAL || currentUser.role === UserRole.ADMIN || permissions.canApproveFinancial) {
          pendingPaymentCount += orders.filter(o => o.status === OrderStatus.PENDING || o.status === OrderStatus.REVOCATION_PENDING_FINANCE).length;
      }
      if (currentUser.role === UserRole.MANAGER || currentUser.role === UserRole.ADMIN || permissions.canApproveManager) {
          pendingPaymentCount += orders.filter(o => o.status === OrderStatus.APPROVED_FINANCE || o.status === OrderStatus.REVOCATION_PENDING_MANAGER).length;
      }
      if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.ADMIN || permissions.canApproveCeo) {
          pendingPaymentCount += orders.filter(o => o.status === OrderStatus.APPROVED_MANAGER || o.status === OrderStatus.REVOCATION_PENDING_CEO).length;
      }
  }

  // 2. Exit Pending Count
  let pendingExitCount = 0;
  if (hasExitAccess) {
      if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.ADMIN || permissions.canApproveExitCeo) {
          pendingExitCount += exitPermits.filter(p => p.status === ExitPermitStatus.PENDING_CEO).length;
      }
      if (currentUser.role === UserRole.FACTORY_MANAGER || currentUser.role === UserRole.ADMIN || permissions.canApproveExitFactory) {
          pendingExitCount += exitPermits.filter(p => p.status === ExitPermitStatus.PENDING_FACTORY || p.status === ExitPermitStatus.PENDING_FACTORY_FINAL).length;
      }
      if (currentUser.role === UserRole.WAREHOUSE_KEEPER || currentUser.role === UserRole.ADMIN || permissions.canApproveExitWarehouse) {
          pendingExitCount += exitPermits.filter(p => p.status === ExitPermitStatus.PENDING_WAREHOUSE).length;
      }
      if (currentUser.role === UserRole.SECURITY_HEAD || currentUser.role === UserRole.ADMIN || permissions.canApproveExitSecurity) {
          pendingExitCount += exitPermits.filter(p => p.status === ExitPermitStatus.PENDING_SECURITY).length;
      }
  }

  // 3. Bijak Pending Count
  let pendingBijakCount = 0;
  if (hasWarehouseAccess) {
      if (currentUser.role === UserRole.CEO || currentUser.role === UserRole.ADMIN || permissions.canApproveBijak) {
          pendingBijakCount += warehouseTxs.filter(t => t.type === 'OUT' && t.status === 'PENDING').length;
      }
  }

  // 4. Purchase Pending Count (broken down by role so Admin/CEO/Commercial distinguish duties)
  const isUserCEO = currentUser.role === UserRole.CEO || currentUser.role === 'CEO' || currentUser.role === UserRole.MANAGER || currentUser.role === 'MANAGER' || (currentUser as any).roles?.some((r: any) => ['ceo', 'CEO', UserRole.CEO, 'manager', UserRole.MANAGER].includes(r)) || permissions.canApprovePurchaseCeo;
  const isUserCommercial = currentUser.role === UserRole.COMMERCIAL || currentUser.role === 'COMMERCIAL' || (currentUser as any).roles?.some((r: any) => ['commercial', 'COMMERCIAL', UserRole.COMMERCIAL].includes(r)) || permissions.canManagePurchase;
  const isUserAdmin = currentUser.role === UserRole.ADMIN || (currentUser as any).roles?.includes(UserRole.ADMIN) || permissions.isSuperUser;

  let pendingCeoPurchaseCount = 0;
  let pendingCommercialPurchaseCount = 0;
  let pendingOtherPurchaseCount = 0;
  let pendingPurchaseCount = 0;

  if (hasPurchaseAccess) {
      const ceoStatuses = [
          PurchaseRequestStatus.PENDING_CEO_INITIAL,
          PurchaseRequestStatus.PENDING_CEO_SELECTION
      ];
      const commercialStatuses = [
          PurchaseRequestStatus.PENDING_COMMERCIAL_MANAGER,
          PurchaseRequestStatus.PENDING_TEHRAN_PROFORMA,
          PurchaseRequestStatus.PENDING_TEHRAN_PURCHASING,
          PurchaseRequestStatus.PENDING_FACTORY_PROFORMA,
          PurchaseRequestStatus.PENDING_BUYER_EXECUTION
      ];
      const otherUnitStatuses = [
          PurchaseRequestStatus.PENDING_TECHNICAL,
          PurchaseRequestStatus.PENDING_SHIFT_LEADER,
          PurchaseRequestStatus.PENDING_FACTORY,
          PurchaseRequestStatus.PENDING_WAREHOUSE_KEEPER,
          PurchaseRequestStatus.PENDING_FACTORY_DECISION,
          PurchaseRequestStatus.PENDING_COMMERCIAL_DECISION,
          PurchaseRequestStatus.PENDING_FACTORY_MANAGER_APPROVAL,
          PurchaseRequestStatus.PENDING_FACTORY_MANAGER_SELECTION,
          PurchaseRequestStatus.PENDING_FACTORY_FINAL_APPROVE,
          PurchaseRequestStatus.PENDING_FACTORY_ENTRY_APPROVAL,
          PurchaseRequestStatus.PENDING_SECURITY_ENTRY,
          PurchaseRequestStatus.PENDING_QC,
          PurchaseRequestStatus.PENDING_TECHNICAL_APPROVAL,
          PurchaseRequestStatus.PENDING_WAREHOUSE_RECEIPT,
          PurchaseRequestStatus.PENDING_FACTORY_FINAL_SIGN
      ];

      pendingCeoPurchaseCount = purchaseReqs.filter(p => ceoStatuses.includes(p.status)).length;
      pendingCommercialPurchaseCount = purchaseReqs.filter(p => commercialStatuses.includes(p.status)).length;
      pendingOtherPurchaseCount = purchaseReqs.filter(p => otherUnitStatuses.includes(p.status)).length;
      pendingPurchaseCount = purchaseReqs.filter(p => p.status !== PurchaseRequestStatus.COMPLETED && p.status !== PurchaseRequestStatus.REJECTED).length;
  }

  // 5. Secretariat Pending Count
  const hasSecretariatAccess = currentUser.canAccessSecretariat === true || permissions.isSuperUser;
  let pendingSecretariatCount = 0;
  if (hasSecretariatAccess) {
      pendingSecretariatCount = secretariatLetters.filter(l => {
          if (l.status !== 'در انتظار اقدام') return false;
          if (currentUser.secretariatAllowedCompanies?.length > 0 && !currentUser.secretariatAllowedCompanies.includes(l.companyId)) return false;
          
          if (permissions.isSuperUser) return true;
          const isReferred = l.referredTo?.includes(currentUser.id);
          const needsSignature = l.signers?.some(s => s.userId === currentUser.id) && !l.approvedBy?.includes(currentUser.id);
          
          return isReferred || needsSignature;
      }).length;
  }

  // 6. Cheque Receipts Pending Count (Accounting Review & CEO Approval)
  const isFinancialOrAdmin = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.FINANCIAL || (currentUser as any).roles?.includes('financial') || (currentUser as any).roles?.includes('admin');
  
  const chequeConfig = pendingChequeCounts.config;
  const isDirectFinalAllowed = chequeConfig?.requireCeoApproval === false 
      || (chequeConfig?.allowAccountingFinalApproval && (currentUser.role === UserRole.FINANCIAL || (currentUser as any).roles?.includes('financial')))
      || (Array.isArray(chequeConfig?.allowedFinalApproverUserIds) && chequeConfig.allowedFinalApproverUserIds.includes(String(currentUser.id)))
      || (Array.isArray(chequeConfig?.allowedFinalApproverRoles) && (chequeConfig.allowedFinalApproverRoles.includes(currentUser.role) || (currentUser as any).roles?.some((r: string) => chequeConfig.allowedFinalApproverRoles.includes(r))));

  const isCeoOrAdmin = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CEO || currentUser.role === 'CEO' || currentUser.role === 'MANAGER' || (currentUser as any).roles?.includes('ceo') || (currentUser as any).roles?.includes('admin') || isDirectFinalAllowed;
  
  let pendingChequeCount = 0;
  if ((isFinancialOrAdmin || isCeoOrAdmin) && pendingChequeCounts.pendingAccounting > 0) {
      pendingChequeCount += pendingChequeCounts.pendingAccounting;
  }
  if ((isCeoOrAdmin || isDirectFinalAllowed) && pendingChequeCounts.pendingCeo > 0) {
      pendingChequeCount += pendingChequeCounts.pendingCeo;
  }

  const showActionSection = pendingPaymentCount > 0 || pendingExitCount > 0 || pendingBijakCount > 0 || pendingPurchaseCount > 0 || pendingSecretariatCount > 0 || pendingChequeCount > 0;

  // ... (Existing Charts logic) ...
  const completedOrders = orders.filter(o => o.status === OrderStatus.APPROVED_CEO || o.status === OrderStatus.REVOKED);
  const totalAmount = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  const countPending = orders.filter(o => o.status === OrderStatus.PENDING).length;
  const countFin = orders.filter(o => o.status === OrderStatus.APPROVED_FINANCE).length;
  const countMgr = orders.filter(o => o.status === OrderStatus.APPROVED_MANAGER).length;
  const countRejected = orders.filter(o => o.status === OrderStatus.REJECTED).length;

  const activeCartable = hasPaymentAccess ? orders
    .filter(o => o.status !== OrderStatus.APPROVED_CEO && o.status !== OrderStatus.REJECTED && o.status !== OrderStatus.REVOKED)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10) : [];

  const handleWidgetClick = (status: OrderStatus | 'pending_all') => {
      if (hasPaymentAccess && onFilterByStatus) {
          onFilterByStatus(status);
      }
  };

  const statusWidgets = [
    { key: OrderStatus.PENDING, label: 'کارتابل مالی', count: countPending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', barColor: 'bg-amber-500' },
    { key: OrderStatus.APPROVED_FINANCE, label: 'کارتابل مدیریت', count: countFin, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300', border: 'border-blue-100', barColor: 'bg-blue-500' },
    { key: OrderStatus.APPROVED_MANAGER, label: 'کارتابل مدیرعامل', count: countMgr, icon: ShieldCheck, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300', border: 'border-indigo-100', barColor: 'bg-indigo-500' },
    { key: OrderStatus.REJECTED, label: 'رد شده', count: countRejected, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', barColor: 'bg-red-500' },
    { key: OrderStatus.APPROVED_CEO, label: 'بایگانی', count: completedOrders.length, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100', barColor: 'bg-green-500' }
  ];

  const methodDataRaw: Record<string, number> = {};
  orders.forEach(order => { order.paymentDetails.forEach(detail => { methodDataRaw[detail.method] = (methodDataRaw[detail.method] || 0) + detail.amount; }); });
  const methodData = Object.keys(methodDataRaw).map(key => ({ name: key, amount: methodDataRaw[key] }));

  const bankStats = useMemo(() => {
    const stats: Record<string, number> = {};
    completedOrders.forEach(order => { order.paymentDetails.forEach(detail => { if (detail.bankName && detail.bankName.trim() !== '') { const normalizedName = detail.bankName.trim(); stats[normalizedName] = (stats[normalizedName] || 0) + detail.amount; } }); });
    return Object.entries(stats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [completedOrders]);

  const warehouseChartData = useMemo(() => {
    const meta = warehouseOverviewData?.meta || {};
    const currYarns = meta.totalCurrentYarnsWeight !== undefined ? meta.totalCurrentYarnsWeight : 450000;
    const prevYarns = meta.totalLastYearYarnsWeight !== undefined ? meta.totalLastYearYarnsWeight : 420000;
    const currRaw = meta.totalCurrentRawWeight !== undefined ? meta.totalCurrentRawWeight : 280000;
    const prevRaw = meta.totalLastYearRawWeight !== undefined ? meta.totalLastYearRawWeight : 310000;

    return [
      {
        name: 'نخ‌های کارخانه',
        'امسال': currYarns / 1000,
        'سال قبل': prevYarns / 1000,
      },
      {
        name: 'مواد اولیه و وارده',
        'امسال': currRaw / 1000,
        'سال قبل': prevRaw / 1000,
      }
    ];
  }, [warehouseOverviewData]);

  const displayWarehouseData = useMemo(() => {
    const meta = warehouseOverviewData?.meta || {};
    const totalCurrentAllWeight = meta.totalCurrentAllWeight !== undefined ? meta.totalCurrentAllWeight : 0;
    const diffAllWeight = meta.diffAllWeight !== undefined ? meta.diffAllWeight : 0;
    const ratioAllWeight = meta.ratioAllWeight !== undefined ? meta.ratioAllWeight : 0;
    const totalPositiveWeight = meta.totalPositiveWeight !== undefined ? meta.totalPositiveWeight : 0;
    const totalNegativeWeight = meta.totalNegativeWeight !== undefined ? meta.totalNegativeWeight : 0;
    const reportDate = meta.reportDate || '';
    return {
      totalCurrentAllWeight,
      diffAllWeight,
      ratioAllWeight,
      totalPositiveWeight,
      totalNegativeWeight,
      reportDate
    };
  }, [warehouseOverviewData]);

  const topBank = bankStats.length > 0 ? bankStats[0] : { name: '-', value: 0 };
  const mostActiveMonth = { label: '-', total: 0 }; // Simplified for now

  const quickTiles = [
      { id: 'create', title: 'ثبت پرداخت', badge: 'پرداخت', icon: Plus, gradient: 'from-blue-600 to-indigo-600', onClick: () => onNavigate ? onNavigate('create') : null },
      { id: 'manage', title: 'کارتابل مالی', badge: 'مالی', count: pendingPaymentCount, icon: CheckSquare, gradient: 'from-amber-500 to-orange-600', onClick: onGoToPaymentApprovals },
      { id: 'create-exit', title: 'ثبت خروج بار', badge: 'خروج', icon: Truck, gradient: 'from-emerald-500 to-teal-600', onClick: () => onNavigate ? onNavigate('create-exit') : null },
      { id: 'manage-exit', title: 'کارتابل خروج', badge: 'انتظامات', count: pendingExitCount, icon: ShieldCheck, gradient: 'from-indigo-600 to-purple-600', onClick: onGoToExitApprovals },
      { id: 'manage-invoices', title: 'فاکتور فروش', badge: 'فاکتور', icon: FileText, gradient: 'from-sky-500 to-blue-600', onClick: () => onNavigate ? onNavigate('manage-invoices') : null },
      { id: 'warehouse', title: 'مدیریت انبار', badge: 'انبار', count: pendingBijakCount, icon: Package, gradient: 'from-teal-600 to-emerald-700', onClick: onGoToBijakApprovals },
      { id: 'sayan', title: 'گزارشات سایان', badge: 'ERP سایان', icon: TrendingUp, gradient: 'from-purple-600 to-pink-600', onClick: () => onNavigate ? onNavigate('sayan') : null },
      { id: 'secretariat', title: 'دبیرخانه اداری', badge: 'اداری', icon: BookOpen, gradient: 'from-blue-700 to-cyan-600', onClick: () => onNavigate ? onNavigate('secretariat') : null },
      { id: 'cheque-receipts', title: 'رسید چک', badge: 'چک صیادی', icon: Banknote, gradient: 'from-emerald-600 to-green-700', onClick: () => onNavigate ? onNavigate('cheque-receipts') : null },
      { id: 'chat', title: 'گفتگو و تسک‌ها', badge: 'ارتباطات', icon: Send, gradient: 'from-violet-600 to-purple-700', onClick: () => onNavigate ? onNavigate('chat') : null },
      { id: 'knowledge', title: 'یادداشت‌ها', badge: 'یادداشت', icon: Edit3, gradient: 'from-amber-600 to-yellow-600', onClick: () => onNavigate ? onNavigate('knowledge') : null },
      { id: 'trade', title: 'بازرگانی ارزی', badge: 'تجارت', icon: Activity, gradient: 'from-blue-600 to-indigo-700', onClick: () => onNavigate ? onNavigate('trade') : null },
      { id: 'balances', title: 'مانده حساب', badge: 'استعلام', icon: Activity, gradient: 'from-rose-500 to-pink-600', onClick: () => onNavigate ? onNavigate('balances') : null },
      { id: 'products', title: 'کاتالوگ کالاها', badge: 'محصولات', icon: Package, gradient: 'from-cyan-600 to-blue-600', onClick: () => onNavigate ? onNavigate('products') : null },
      { id: 'sales', title: 'مدیریت مشتریان', badge: 'CRM', icon: Users, gradient: 'from-orange-500 to-amber-600', onClick: () => onNavigate ? onNavigate('sales') : null },
      { id: 'purchase', title: 'درخواست خرید', badge: 'خرید کالا', count: pendingPurchaseCount, icon: Plus, gradient: 'from-fuchsia-600 to-pink-600', onClick: onGoToPurchaseApprovals },
      { id: 'users', title: 'کاربران سیستم', badge: 'دسترسی', icon: Users, gradient: 'from-gray-700 to-zinc-900', onClick: () => onNavigate ? onNavigate('users') : null },
      { id: 'settings', title: 'تنظیمات', badge: 'سیستم', icon: PenTool, gradient: 'from-slate-600 to-gray-800', onClick: () => onNavigate ? onNavigate('settings') : null },
  ];

  // Windows-style customized tile order and visibility
  const displayTiles = useMemo(() => {
    let sorted = [...quickTiles];
    if (customTileOrder.length > 0) {
      sorted.sort((a, b) => {
        const indexA = customTileOrder.indexOf(a.id);
        const indexB = customTileOrder.indexOf(b.id);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
    }
    return sorted;
  }, [quickTiles, customTileOrder]);

  const visibleTiles = useMemo(() => {
    return displayTiles.filter(t => !hiddenTileIds.includes(t.id));
  }, [displayTiles, hiddenTileIds]);

  return (
    <div className="space-y-6 pb-20 md:pb-0 animate-fade-in">
      
      {/* ENTERPRISE DASHBOARD CUSTOMIZER TOOLBAR (MINIMAL & UNINTRUSIVE) */}
      <div className={`rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shadow-xs transition-all relative z-[85] ${
        isToolbarCollapsed ? 'px-2.5 py-1 max-w-fit ml-auto' : 'px-3 py-1.5 w-full'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left / Title & Indicator */}
          <div 
            onClick={() => setIsToolbarCollapsed(!isToolbarCollapsed)}
            className="flex items-center gap-1.5 cursor-pointer select-none group py-0.5"
            title={isToolbarCollapsed ? 'کلیک جهت باز کردن نوار ابزار تنظیمات پیشخوان' : 'کلیک جهت بستن و کوچک‌سازی نوار'}
          >
            <div className="p-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 group-hover:bg-blue-100 transition-colors">
              <Sliders size={13} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[11px] text-zinc-700 dark:text-zinc-300">
                چیدمان ابزارک‌ها
              </span>
              <span className="text-[9px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-bold px-1.5 py-0.2 rounded-full">
                {Object.values(widgetsVisibility).filter(Boolean).length}
              </span>
            </div>
            <span className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-[10px] pr-0.5">
              {isToolbarCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </span>
          </div>

          {/* Right / Actions - Only fully visible or condensed */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Customization Mode Toggle */}
            <button
              onClick={() => setIsCustomizingWidgets(!isCustomizingWidgets)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all shadow-xs ${
                isCustomizingWidgets
                  ? 'bg-amber-500 text-white shadow-amber-500/20 ring-2 ring-amber-300'
                  : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300'
              }`}
              title="جابجایی، تغییر اندازه و پنهان‌سازی ابزارک‌ها در صفحه با ماوس و کشیدن (Drag & Drop)"
            >
              <Monitor size={12} />
              <span>{isCustomizingWidgets ? 'اتمام چیدمان' : 'تغییر چیدمان'}</span>
            </button>

            {!isToolbarCollapsed && (
              <>
                {/* Clear Desktop (Windows Style) Toggle */}
                <button
                  onClick={handleToggleClearDesktop}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    isClearDesktop
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                  title={isClearDesktop ? 'نمایش مجدد تمام ابزارک‌ها' : 'مخفی‌سازی موقت ابزارک‌ها و نمایش تصویر زمینه ویندوز'}
                >
                  {isClearDesktop ? <Eye size={12} /> : <EyeOff size={12} />}
                  <span className="hidden sm:inline">{isClearDesktop ? 'نمایش ابزارک‌ها' : 'پاکسازی صفحه'}</span>
                </button>

                {/* Layout Presets Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowPresetsDropdown(!showPresetsDropdown)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 transition-all border border-zinc-200/50 dark:border-zinc-700/50"
                    title="قالب‌ها و الگوهای آماده چیدمان"
                  >
                    <LayoutGrid size={12} className="text-indigo-500" />
                    <span>قالب‌ها</span>
                    <ChevronDown size={11} className={showPresetsDropdown ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                  {showPresetsDropdown && (
                    <div className="absolute left-0 mt-1.5 w-64 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl p-2 z-[100] animate-fade-in text-right space-y-1">
                      <div className="text-[10px] text-zinc-400 font-bold px-2 py-1 border-b border-zinc-100 dark:border-zinc-800">
                        انتخاب الگوی چیدمان پیشخوان
                      </div>
                      
                      {/* Classic Pre-update Default */}
                      <button
                        type="button"
                        onClick={() => handleApplyLayoutPreset('classic_default')}
                        className="w-full p-2 text-right rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all flex items-start gap-2 group"
                      >
                        <div className="p-1 rounded-lg bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors mt-0.5">
                          <LayoutGrid size={12} />
                        </div>
                        <div>
                          <div className="text-xs font-black text-zinc-800 dark:text-zinc-100">چیدمان کلاسیک (قبل از آپدیت)</div>
                          <div className="text-[10px] text-zinc-500">تمام‌عرض ۱۰۰٪ و بدون ستون‌بندی</div>
                        </div>
                      </button>

                      {/* Modern Responsive Multi-column */}
                      <button
                        type="button"
                        onClick={() => handleApplyLayoutPreset('modern_responsive')}
                        className="w-full p-2 text-right rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-all flex items-start gap-2 group"
                      >
                        <div className="p-1 rounded-lg bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors mt-0.5">
                          <Sliders size={12} />
                        </div>
                        <div>
                          <div className="text-xs font-black text-zinc-800 dark:text-zinc-100">چیدمان مدرن چندستونه</div>
                          <div className="text-[10px] text-zinc-500">تطبیقی هوشمند (۳ و ۲ ستونه)</div>
                        </div>
                      </button>

                      {/* Company Default Layout */}
                      <button
                        type="button"
                        onClick={() => handleApplyLayoutPreset('company_default')}
                        className="w-full p-2 text-right rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all flex items-start gap-2 group"
                      >
                        <div className="p-1 rounded-lg bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors mt-0.5">
                          <ShieldCheck size={12} />
                        </div>
                        <div>
                          <div className="text-xs font-black text-zinc-800 dark:text-zinc-100">چیدمان سازمانی مدیر</div>
                          <div className="text-[10px] text-zinc-500">الگوی استاندارد تعریف‌شده شرکت</div>
                        </div>
                      </button>

                      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1 mt-1">
                        <button
                          type="button"
                          onClick={handleResetWidgets}
                          className="w-full p-1.5 text-right rounded-xl hover:bg-red-50 text-red-600 transition-all flex items-center justify-between text-[11px] font-bold"
                        >
                          <span>بازنشانی کامل پیشخوان</span>
                          <RotateCw size={11} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Admin Role Locks Modal Button */}
                {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.CEO || currentUser.role === UserRole.FACTORY_MANAGER) && (
                  <button
                    onClick={() => setShowAdminLocksModal(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 transition-all border border-amber-200/60 dark:border-amber-800/60"
                    title="تعیین ابزارک‌های قفل‌شده برای هر نقش سازمانی"
                  >
                    <Lock size={12} className="text-amber-600 dark:text-amber-400" />
                    <span>قفل ابزارک‌ها</span>
                  </button>
                )}

                {/* Add Widget Dropdown Button */}
                <div className="relative">
                  <button
                    onClick={() => setShowAddWidgetsDropdown(!showAddWidgetsDropdown)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs"
                    title="نمایش یا پنهان‌سازی ابزارک‌های خاص"
                  >
                    <Plus size={12} />
                    <span>ابزارک‌ها</span>
                  </button>
                  {showAddWidgetsDropdown && (
                    <div className="absolute left-0 mt-1.5 w-60 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl p-2 z-[100] animate-fade-in text-right">
                      <div className="text-[10px] text-zinc-400 font-bold px-2 py-1 border-b border-zinc-100 dark:border-zinc-800 mb-1">لیست ابزارک‌های فعال</div>
                      <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-0.5">
                        {Object.entries(widgetNames).map(([id, label]) => {
                          const isVisible = widgetsVisibility[id];
                          const isLocked = isWidgetLockedForCurrentUser(id);
                          return (
                            <button
                              key={id}
                              disabled={isLocked}
                              onClick={() => toggleWidgetVisibility(id)}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                isLocked 
                                  ? 'opacity-50 cursor-not-allowed bg-zinc-50 dark:bg-zinc-900' 
                                  : 'hover:bg-blue-50/60 hover:text-blue-600 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
                              }`}
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                {isLocked && <Lock size={10} className="text-amber-500 shrink-0" />}
                                <span className="truncate">{label}</span>
                              </span>
                              <span className={`w-2 h-2 rounded-full shrink-0 ${isVisible ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Manual Check Update Button */}
                <button
                  onClick={checkDashboardVersion}
                  disabled={isCheckingUpdate}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  title="بررسی دستی به‌روزرسانی سامانه"
                >
                  <RefreshCw size={12} className={isCheckingUpdate ? "animate-spin" : ""} />
                  <span>{isCheckingUpdate ? 'بررسی...' : 'بررسی بروزرسانی'}</span>
                </button>

                {/* Quick Reset Button */}
                <button
                  onClick={handleResetWidgets}
                  className="p-1 text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                  title="بازنشانی چیدمان به پیش‌فرض"
                >
                  <RotateCw size={12} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>


      {!isClearDesktop && (
        <div className="flex flex-wrap gap-4 items-stretch w-full" id="dashboard-widgets-container">
        {/* WAREHOUSE ALERT WIDGET */}
        {widgetsVisibility.warehouse_alert && warehouseAlertData && (
          <ResizableWidget
            id="warehouse_alert"
            title="هشدار تراز وزنی انبارها"
            orderIndex={widgetsOrder.indexOf('warehouse_alert')}
            isFirst={widgetsOrder.indexOf('warehouse_alert') === 0}
            isLast={widgetsOrder.indexOf('warehouse_alert') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('warehouse_alert'), widgetsOrder.indexOf('warehouse_alert') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('warehouse_alert'), widgetsOrder.indexOf('warehouse_alert') + 1)}
            onRemove={() => toggleWidgetVisibility('warehouse_alert')}
            size={widgetSizes.warehouse_alert}
            defaultWidthPercent={100}
            onSizeChange={(size) => handleUpdateWidgetSize('warehouse_alert', size)}
            onResetSize={() => handleResetWidgetSize('warehouse_alert')}
            isLocked={isWidgetLockedForCurrentUser('warehouse_alert')}
            isCollapsed={!!collapsedWidgets.warehouse_alert}
            onToggleCollapse={() => handleToggleCollapseWidget('warehouse_alert')}
            onDragStart={(e) => handleWidgetDragStart('warehouse_alert', e)}
            onDragOver={(e) => handleWidgetDragOver('warehouse_alert', e)}
            onDragLeave={() => handleWidgetDragLeave('warehouse_alert')}
            onDrop={(e) => handleWidgetDrop('warehouse_alert', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'warehouse_alert'}
            isDropTarget={dragOverWidgetId === 'warehouse_alert'}
          >
            <div 
                onClick={() => onNavigate && onNavigate('sayan')}
                className={`cursor-pointer border rounded-2xl p-4 flex items-center justify-between shadow-sm transition-colors group h-full ${
                    warehouseAlertData.diffAllWeight < 0 
                        ? 'bg-red-50 hover:bg-red-100 border-red-200' 
                        : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                }`}
            >
                <div className="flex items-center gap-4">
                    <div className={`p-3 text-white rounded-xl shadow-inner group-hover:scale-105 transition-transform ${
                        warehouseAlertData.diffAllWeight < 0 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
                    }`}>
                        {warehouseAlertData.diffAllWeight < 0 ? <TrendingDown size={24} /> : <TrendingUp size={24} />}
                    </div>
                    <div>
                        <h4 className={`font-extrabold text-sm md:text-base mb-0.5 ${
                            warehouseAlertData.diffAllWeight < 0 ? 'text-red-900' : 'text-emerald-900'
                        }`}>
                            {warehouseAlertData.diffAllWeight < 0 ? 'هشدار: افت تراز وزنی انبارها' : 'وضعیت مطلوب: رشد تراز وزنی انبارها'}
                        </h4>
                        <p className={`text-xs font-medium ${
                            warehouseAlertData.diffAllWeight < 0 ? 'text-red-700' : 'text-emerald-700'
                        }`}>
                            موجودی انبار نسبت به سال گذشته <span className={`font-bold ${
                                warehouseAlertData.diffAllWeight < 0 ? 'text-red-800' : 'text-emerald-800'
                            }`} dir="ltr">{Math.abs(warehouseAlertData.diffAllWeight).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} kg</span> 
                            {' '}({(Math.abs(warehouseAlertData.ratioAllWeight)).toFixed(1)}٪) {warehouseAlertData.diffAllWeight < 0 ? 'کاهش' : 'افزایش'} یافته است.
                        </p>
                    </div>
                </div>
                <div className={`transition-colors hidden sm:block ${
                    warehouseAlertData.diffAllWeight < 0 ? 'text-red-400 group-hover:text-red-600' : 'text-emerald-400 group-hover:text-emerald-600'
                }`}>
                    <ChevronLeft size={24} />
                </div>
            </div>
          </ResizableWidget>
        )}

        {/* Minimal Date Card - Smaller & Sleek with Google Calendar/Tasks Quick Status */}
        {widgetsVisibility.date_card && (
          <ResizableWidget
            id="date_card"
            title="کارت تاریخ روز"
            orderIndex={widgetsOrder.indexOf('date_card')}
            isFirst={widgetsOrder.indexOf('date_card') === 0}
            isLast={widgetsOrder.indexOf('date_card') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('date_card'), widgetsOrder.indexOf('date_card') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('date_card'), widgetsOrder.indexOf('date_card') + 1)}
            onRemove={() => toggleWidgetVisibility('date_card')}
            size={widgetSizes.date_card}
            defaultWidthPercent={33}
            onSizeChange={(size) => handleUpdateWidgetSize('date_card', size)}
            onResetSize={() => handleResetWidgetSize('date_card')}
            isLocked={isWidgetLockedForCurrentUser('date_card')}
            isCollapsed={!!collapsedWidgets.date_card}
            onToggleCollapse={() => handleToggleCollapseWidget('date_card')}
            onDragStart={(e) => handleWidgetDragStart('date_card', e)}
            onDragOver={(e) => handleWidgetDragOver('date_card', e)}
            onDragLeave={() => handleWidgetDragLeave('date_card')}
            onDrop={(e) => handleWidgetDrop('date_card', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'date_card'}
            isDropTarget={dragOverWidgetId === 'date_card'}
          >
            <div 
                onClick={() => {
                  if (!widgetsVisibility.google_widget) {
                    toggleWidgetVisibility('google_widget');
                  }
                  const el = document.getElementById('google_widget');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="glass-panel rounded-2xl p-4 border border-indigo-100 dark:border-indigo-900/30 shadow-sm flex items-center justify-between gap-4 w-full h-full relative overflow-hidden cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all active:scale-[0.99]"
                title="کلیک برای مشاهده تقویم و رویدادهای گوگل"
            >
                <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20 transition-opacity"><CalendarIcon size={40}/></div>
                <div className="bg-indigo-50 dark:bg-indigo-950/50 p-3 rounded-xl text-indigo-600 dark:text-indigo-400 flex items-center justify-center relative z-10 group-hover:scale-105 transition-transform">
                    <CalendarIcon size={24} />
                </div>
                <div className="flex flex-col relative z-10 flex-1">
                    <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center justify-between gap-1">
                        <span>{shamsiDate.weekday}</span>
                        <span className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${currentUser?.googleLinkedEmail ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} title={currentUser?.googleLinkedEmail ? `متصل به گوگل: ${currentUser.googleLinkedEmail}` : 'حساب گوگل متصل نیست'}></span>
                        </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-gray-800 dark:text-gray-200">{shamsiDate.day}</span>
                        <span className="text-sm font-bold text-gray-600 dark:text-gray-400">{shamsiDate.month}</span>
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-gray-400 dark:text-gray-500 font-bold mt-1">
                        <span>{shamsiDate.year} شمسی</span>
                        <span className="text-[9px] text-indigo-600 dark:text-indigo-400 font-medium">
                            {widgetsVisibility.google_widget ? 'تقویم گوگل فعال' : 'مشاهده تقویم گوگل'}
                        </span>
                    </div>
                </div>
            </div>
          </ResizableWidget>
        )}

        {/* SECTION 1: PERSIAN POETRY (شعر و ادب کهن) */}
        {widgetsVisibility.poetry_card && (
          <ResizableWidget
            id="poetry_card"
            title="شعر و غزل روزانه"
            orderIndex={widgetsOrder.indexOf('poetry_card')}
            isFirst={widgetsOrder.indexOf('poetry_card') === 0}
            isLast={widgetsOrder.indexOf('poetry_card') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('poetry_card'), widgetsOrder.indexOf('poetry_card') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('poetry_card'), widgetsOrder.indexOf('poetry_card') + 1)}
            onRemove={() => toggleWidgetVisibility('poetry_card')}
            size={widgetSizes.poetry_card}
            defaultWidthPercent={33}
            onSizeChange={(size) => handleUpdateWidgetSize('poetry_card', size)}
            onResetSize={() => handleResetWidgetSize('poetry_card')}
            isLocked={isWidgetLockedForCurrentUser('poetry_card')}
            isCollapsed={!!collapsedWidgets.poetry_card}
            onToggleCollapse={() => handleToggleCollapseWidget('poetry_card')}
            onDragStart={(e) => handleWidgetDragStart('poetry_card', e)}
            onDragOver={(e) => handleWidgetDragOver('poetry_card', e)}
            onDragLeave={() => handleWidgetDragLeave('poetry_card')}
            onDrop={(e) => handleWidgetDrop('poetry_card', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'poetry_card'}
            isDropTarget={dragOverWidgetId === 'poetry_card'}
          >
            <div className="glass-panel rounded-2xl px-3.5 py-3 border border-rose-100 dark:border-rose-900/30 shadow-sm flex items-center justify-between relative overflow-hidden group min-h-[110px] h-full hover:border-rose-300 dark:hover:border-rose-800/60 transition-colors">
                <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-rose-400 to-indigo-500"></div>
                
                {/* Previous Button */}
                <button 
                    onClick={handlePrevPoem}
                    disabled={isLoadingPoem}
                    className="p-1.5 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-400 hover:text-rose-600 active:scale-90 transition-all cursor-pointer shrink-0 disabled:opacity-40"
                    title="شعر قبلی"
                >
                    <ChevronRight size={18} />
                </button>

                <div className="relative z-10 flex flex-col items-center flex-1 px-2.5 select-none min-w-0">
                    <div className="text-[10px] font-bold text-rose-500 dark:text-rose-400 mb-1 flex items-center justify-between w-full border-b border-rose-100/60 dark:border-rose-900/40 pb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <PenTool size={11} className="text-rose-500 shrink-0" /> 
                            <span className="font-black whitespace-nowrap">زمزمه و شعر روز</span>
                            <span className="text-[9px] text-rose-400 font-medium">({currentPoemIndex + 1}/{poemList.length})</span>
                            {dailyPoem.source && (
                                <span className="bg-rose-100/80 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded text-[8.5px] font-medium border border-rose-200/50 truncate max-w-[100px] hidden sm:inline-block">
                                    {dailyPoem.source}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={handleCopyPoem}
                                className="p-1 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-400 hover:text-rose-600 transition-all cursor-pointer inline-flex items-center justify-center gap-1"
                                title="کپی متن شعر"
                            >
                                {copiedPoem ? <Check size={11} className="text-green-600 dark:text-green-400" /> : <Copy size={11} />}
                                {copiedPoem && <span className="text-[8.5px] font-bold text-green-600">کپی شد</span>}
                            </button>
                            <button
                                onClick={handleFetchNewPoem}
                                disabled={isLoadingPoem}
                                className="p-1 rounded-md hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-400 hover:text-rose-600 transition-all cursor-pointer inline-flex items-center justify-center gap-1"
                                title="دریافت شعر آنلاین جدید"
                            >
                                <RotateCw size={11} className={`${isLoadingPoem ? 'animate-spin text-rose-600' : ''}`} />
                                <span className="text-[8.5px] font-medium hidden sm:inline">آنلاین</span>
                            </button>
                        </div>
                    </div>

                    {dailyPoem.title && (
                        <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-bold mb-0.5 truncate max-w-full">
                            {dailyPoem.title}
                        </span>
                    )}

                    <p className="text-gray-800 dark:text-gray-200 font-bold text-xs sm:text-[13px] text-center italic leading-relaxed py-0.5 line-clamp-3" style={{ whiteSpace: 'pre-line' }}>
                        {dailyPoem.text}
                    </p>

                    {dailyPoem.author && (
                        <span className="text-[9.5px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                            — {dailyPoem.author}
                        </span>
                    )}
                </div>

                {/* Next Button */}
                <button 
                    onClick={handleNextPoem}
                    disabled={isLoadingPoem}
                    className="p-1.5 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-400 hover:text-rose-600 active:scale-90 transition-all cursor-pointer shrink-0 disabled:opacity-40"
                    title="شعر بعدی (آنلاین)"
                >
                    <ChevronLeft size={18} />
                </button>
            </div>
          </ResizableWidget>
        )}

        {/* SECTION 2: MOTIVATIONAL & UPLIFTING QUOTES (انگیزه و روحیه‌بخش) */}
        {widgetsVisibility.motivation_card && (
          <ResizableWidget
            id="motivation_card"
            title="انگیزه و کلام روز"
            orderIndex={widgetsOrder.indexOf('motivation_card')}
            isFirst={widgetsOrder.indexOf('motivation_card') === 0}
            isLast={widgetsOrder.indexOf('motivation_card') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('motivation_card'), widgetsOrder.indexOf('motivation_card') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('motivation_card'), widgetsOrder.indexOf('motivation_card') + 1)}
            onRemove={() => toggleWidgetVisibility('motivation_card')}
            size={widgetSizes.motivation_card}
            defaultWidthPercent={33}
            onSizeChange={(size) => handleUpdateWidgetSize('motivation_card', size)}
            onResetSize={() => handleResetWidgetSize('motivation_card')}
            isLocked={isWidgetLockedForCurrentUser('motivation_card')}
            isCollapsed={!!collapsedWidgets.motivation_card}
            onToggleCollapse={() => handleToggleCollapseWidget('motivation_card')}
            onDragStart={(e) => handleWidgetDragStart('motivation_card', e)}
            onDragOver={(e) => handleWidgetDragOver('motivation_card', e)}
            onDragLeave={() => handleWidgetDragLeave('motivation_card')}
            onDrop={(e) => handleWidgetDrop('motivation_card', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'motivation_card'}
            isDropTarget={dragOverWidgetId === 'motivation_card'}
          >
            <div className="glass-panel rounded-2xl px-3.5 py-3 border border-amber-100 dark:border-amber-900/30 shadow-sm flex items-center justify-between relative overflow-hidden group min-h-[110px] h-full hover:border-amber-300 dark:hover:border-amber-800/60 transition-colors">
                <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-amber-400 to-emerald-500"></div>
                
                {/* Previous Button */}
                <button 
                    onClick={handlePrevMotivational}
                    disabled={isLoadingMotivational}
                    className="p-1.5 rounded-full hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-500 hover:text-amber-700 active:scale-90 transition-all cursor-pointer shrink-0 disabled:opacity-40"
                    title="جمله قبلی"
                >
                    <ChevronRight size={18} />
                </button>

                <div className="relative z-10 flex flex-col items-center flex-1 px-2.5 select-none min-w-0">
                    <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-1 flex items-center justify-between w-full border-b border-amber-100/60 dark:border-amber-900/40 pb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <Flame size={11} className="text-amber-500 shrink-0" /> 
                            <span className="font-black whitespace-nowrap">انگیزه و روحیه‌بخش</span>
                            <span className="text-[9px] text-amber-500 font-medium">({currentMotivationalIndex + 1}/{motivationalList.length})</span>
                            {dailyMotivational.title && (
                                <span className="bg-amber-100/80 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded text-[8.5px] font-medium border border-rose-200/50 truncate max-w-[100px] hidden sm:inline-block">
                                    {dailyMotivational.title}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={handleCopyMotivational}
                                className="p-1 rounded-md hover:bg-amber-100 dark:hover:bg-amber-950/60 text-amber-500 hover:text-amber-700 transition-all cursor-pointer inline-flex items-center justify-center gap-1"
                                title="کپی متن انگیزشی"
                            >
                                {copiedMotivational ? <Check size={11} className="text-green-600 dark:text-green-400" /> : <Copy size={11} />}
                                {copiedMotivational && <span className="text-[8.5px] font-bold text-green-600">کپی شد</span>}
                            </button>
                            <button
                                onClick={handleFetchNewMotivational}
                                disabled={isLoadingMotivational}
                                className="p-1 rounded-md hover:bg-amber-100 dark:hover:bg-amber-950/60 text-amber-500 hover:text-amber-700 transition-all cursor-pointer inline-flex items-center justify-center gap-1"
                                title="دریافت جمله انگیزشی آنلاین جدید"
                            >
                                <RotateCw size={11} className={`${isLoadingMotivational ? 'animate-spin text-amber-600' : ''}`} />
                                <span className="text-[8.5px] font-medium hidden sm:inline">آنلاین</span>
                            </button>
                        </div>
                    </div>

                    <p className="text-gray-800 dark:text-gray-200 font-bold text-xs sm:text-[13px] text-center leading-relaxed py-0.5 line-clamp-3">
                        «{dailyMotivational.text}»
                    </p>

                    {dailyMotivational.author && (
                        <span className="text-[9.5px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                            — {dailyMotivational.author}
                        </span>
                    )}
                </div>

                {/* Next Button */}
                <button 
                    onClick={handleNextMotivational}
                    disabled={isLoadingMotivational}
                    className="p-1.5 rounded-full hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-500 hover:text-amber-700 active:scale-90 transition-all cursor-pointer shrink-0 disabled:opacity-40"
                    title="جمله بعدی (آنلاین)"
                >
                    <ChevronLeft size={18} />
                </button>
            </div>
          </ResizableWidget>
        )}

        {/* GOOGLE WORKSPACE WIDGET (CALENDAR & TASKS) */}
        {widgetsVisibility.google_widget && (
          <ResizableWidget
            id="google_widget"
            title="تقویم و وظایف گوگل"
            orderIndex={widgetsOrder.indexOf('google_widget')}
            isFirst={widgetsOrder.indexOf('google_widget') === 0}
            isLast={widgetsOrder.indexOf('google_widget') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('google_widget'), widgetsOrder.indexOf('google_widget') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('google_widget'), widgetsOrder.indexOf('google_widget') + 1)}
            onRemove={() => toggleWidgetVisibility('google_widget')}
            size={widgetSizes.google_widget}
            defaultWidthPercent={100}
            onSizeChange={(size) => handleUpdateWidgetSize('google_widget', size)}
            onResetSize={() => handleResetWidgetSize('google_widget')}
            isLocked={isWidgetLockedForCurrentUser('google_widget')}
            isCollapsed={!!collapsedWidgets.google_widget}
            onToggleCollapse={() => handleToggleCollapseWidget('google_widget')}
            onDragStart={(e) => handleWidgetDragStart('google_widget', e)}
            onDragOver={(e) => handleWidgetDragOver('google_widget', e)}
            onDragLeave={() => handleWidgetDragLeave('google_widget')}
            onDrop={(e) => handleWidgetDrop('google_widget', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'google_widget'}
            isDropTarget={dragOverWidgetId === 'google_widget'}
          >
            <GoogleWorkspaceWidget 
              currentUser={currentUser} 
              onToggleDateCard={() => toggleWidgetVisibility('date_card')} 
              isDateCardVisible={widgetsVisibility.date_card} 
            />
          </ResizableWidget>
        )}

        {/* ANNOUNCEMENTS SECTION */}
        {widgetsVisibility.announcements && (visibleAnnouncements.length > 0 || permissions.canCreateAnnouncements || currentUser.role === UserRole.ADMIN) && (
          <ResizableWidget
            id="announcements"
            title="اعلانات مدیران"
            orderIndex={widgetsOrder.indexOf('announcements')}
            isFirst={widgetsOrder.indexOf('announcements') === 0}
            isLast={widgetsOrder.indexOf('announcements') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('announcements'), widgetsOrder.indexOf('announcements') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('announcements'), widgetsOrder.indexOf('announcements') + 1)}
            onRemove={() => toggleWidgetVisibility('announcements')}
            size={widgetSizes.announcements}
            defaultWidthPercent={100}
            onSizeChange={(size) => handleUpdateWidgetSize('announcements', size)}
            onResetSize={() => handleResetWidgetSize('announcements')}
            isLocked={isWidgetLockedForCurrentUser('announcements')}
            isCollapsed={!!collapsedWidgets.announcements}
            onToggleCollapse={() => handleToggleCollapseWidget('announcements')}
            onDragStart={(e) => handleWidgetDragStart('announcements', e)}
            onDragOver={(e) => handleWidgetDragOver('announcements', e)}
            onDragLeave={() => handleWidgetDragLeave('announcements')}
            onDrop={(e) => handleWidgetDrop('announcements', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'announcements'}
            isDropTarget={dragOverWidgetId === 'announcements'}
          >
                <div className={`rounded-2xl border border-blue-100 shadow-sm relative transition-all h-full ${visibleAnnouncements.length === 0 ? 'bg-transparent p-2 border-dashed' : 'bg-blue-50/50 p-6'}`}>
                    
                    {visibleAnnouncements.length === 0 ? (
                        <div className="flex justify-center items-center">
                            <button onClick={() => setShowAnnounceModal(true)} className="text-xs text-blue-500 hover:text-blue-600 font-bold transition-colors flex items-center gap-1 py-2">
                                <Plus size={14}/> ارسال اولین پیام / اعلامیه برای پرسنل
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="bg-blue-100 p-1.5 rounded-lg text-blue-600 animate-pulse">
                                        <Activity size={20} />
                                    </div>
                                    <h3 className="font-black text-gray-800">اعلانات مدیران</h3>
                                </div>
                                {(permissions.canCreateAnnouncements || currentUser.role === UserRole.ADMIN) && (
                                    <button onClick={() => setShowAnnounceModal(true)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1">
                                        <Plus size={14}/> اعلامیه جدید
                                    </button>
                                )}
                            </div>
                            <div className="space-y-3">
                                {visibleAnnouncements.map((ann, i) => (
                                    <div key={ann.id || i} className="glass-panel p-4 rounded-xl shadow-sm border border-blue-50 flex items-start gap-3 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 h-full w-1 bg-gradient-to-b from-blue-400 to-blue-600"></div>
                                        <div className="bg-blue-100/50 p-2 rounded-full text-blue-600 mt-1 cursor-pointer hover:bg-blue-200 transition-colors shadow-sm" onClick={() => handleToggleAnnouncementCompletion(ann)}>
                                            {ann.type === 'task' ? (
                                                ann.isCompleted ? <CheckCircle size={16} className="text-green-600" /> : <div className="w-4 h-4 rounded-full border-2 border-orange-500 bg-orange-100/50"></div>
                                            ) : (
                                                <BookOpen size={16} className="text-blue-600" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-xs font-black text-blue-800">{ann.createdBy}</span>
                                                <div className="flex items-center gap-2">
                                                    {ann.isCompleted && <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded font-bold">تکمیل شده</span>}
                                                    {ann.targetUsers && ann.targetUsers.length > 0 && <span className="bg-blue-100 px-2 py-0.5 rounded text-[10px] text-blue-700 font-bold border border-blue-200">پیام اختصاصی</span>}
                                                    {(permissions.canCreateAnnouncements || currentUser.role === UserRole.ADMIN) && (
                                                        <button onClick={async (e) => {
                                                            e.stopPropagation();
                                                            const mod = await import('../services/storageService');
                                                            await mod.deleteSystemAnnouncement(ann.id);
                                                            setAnnouncements(prev => prev.filter(a => a.id !== ann.id));
                                                        }} className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 p-1 rounded transition-all"><Trash2 size={12}/></button>
                                                    )}
                                                </div>
                                            </div>
                                            <p className={`text-sm font-bold transition-all ${ann.isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`} style={{ whiteSpace: 'pre-wrap' }}>{ann.message}</p>
                                            <div className="text-[10px] text-gray-400 mt-2 text-left">
                                                {(() => { 
                                                    const d = getShamsiDateFromIso(new Date(ann.createdAt).toISOString()); 
                                                    const greg = new Date(ann.createdAt).toLocaleDateString('en-CA'); // YYYY-MM-DD
                                                    return `${d.year}/${d.month}/${d.day} | ${greg}`; 
                                                })()} - {new Date(ann.createdAt).toLocaleTimeString('fa-IR', {hour: '2-digit', minute: '2-digit'})}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
          </ResizableWidget>
        )}

        {/* TASK GROUPS WIDGET */}
        {widgetsVisibility.task_groups && (
          <ResizableWidget
            id="task_groups"
            title="وظایف و پروژه‌ها"
            orderIndex={widgetsOrder.indexOf('task_groups')}
            isFirst={widgetsOrder.indexOf('task_groups') === 0}
            isLast={widgetsOrder.indexOf('task_groups') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('task_groups'), widgetsOrder.indexOf('task_groups') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('task_groups'), widgetsOrder.indexOf('task_groups') + 1)}
            onRemove={() => toggleWidgetVisibility('task_groups')}
            size={widgetSizes.task_groups}
            defaultWidthPercent={100}
            onSizeChange={(size) => handleUpdateWidgetSize('task_groups', size)}
            onResetSize={() => handleResetWidgetSize('task_groups')}
            isLocked={isWidgetLockedForCurrentUser('task_groups')}
            isCollapsed={!!collapsedWidgets.task_groups}
            onToggleCollapse={() => handleToggleCollapseWidget('task_groups')}
            onDragStart={(e) => handleWidgetDragStart('task_groups', e)}
            onDragOver={(e) => handleWidgetDragOver('task_groups', e)}
            onDragLeave={() => handleWidgetDragLeave('task_groups')}
            onDrop={(e) => handleWidgetDrop('task_groups', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'task_groups'}
            isDropTarget={dragOverWidgetId === 'task_groups'}
          >
                {!showTasksInDashboard ? (
                    <div className="flex justify-end my-3">
                        <button 
                            onClick={() => {
                                setShowTasksInDashboard(true);
                                localStorage.setItem('dashboard_show_chat_tasks', 'true');
                            }}
                            className="text-xs text-gray-400 hover:text-blue-600 font-bold transition flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-gray-100"
                        >
                            <ListChecks size={14}/> نمایش مجدد تسک‌های گفتگو در داشبورد
                        </button>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-blue-100 bg-white/50 p-6 shadow-sm relative transition-all my-5">
                        <div className="flex justify-between items-center mb-5">
                            <div className="flex items-center gap-2">
                                <div className="bg-orange-100 p-1.5 rounded-lg text-orange-600">
                                    <ListChecks size={20} />
                                </div>
                                <h3 className="font-black text-gray-800">📌 دسترسی سریع به تسک‌های گفتگو</h3>
                            </div>
                            <button 
                                onClick={() => {
                                    if (confirm('آیا مایل به لغو نمایش تسک‌های گفتگو در داشبورد هستید؟ (همواره می‌توانید از انتهای این بخش مجدداً آن را فعال کنید)')) {
                                        setShowTasksInDashboard(false);
                                        localStorage.setItem('dashboard_show_chat_tasks', 'false');
                                    }
                                }}
                                className="text-xs text-gray-400 hover:text-red-500 font-bold transition flex items-center gap-1 hover:bg-red-50 px-2.5 py-1.5 rounded-lg"
                                title="لغو نمایش تسک‌ها در داشبورد"
                            >
                                <X size={14}/> عدم نمایش در داشبورد
                            </button>
                        </div>

                        {taskGroups.length === 0 ? (
                            <div className="text-center text-gray-400 py-10 bg-white/30 rounded-xl border border-dashed">
                                <ListChecks size={36} className="mx-auto mb-2 opacity-20"/>
                                <p className="text-xs font-bold">شما در هیچ گروه تسک فعالی عضو نیستید.</p>
                                <p className="text-[10px] text-gray-400 mt-1">تسک‌ها پس از عضویت شما در گروه‌های تسک گفتگو در این بخش نمایش داده می‌شوند.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {taskGroups.map(group => {
                                    const groupTasks = tasks.filter(t => t.groupId === group.id);
                                    const pendingTasks = groupTasks.filter(t => t.status !== 'completed');
                                    const completedTasks = groupTasks.filter(t => t.status === 'completed');

                                    return (
                                        <div key={group.id} className="glass-panel p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col justify-between min-h-[220px]">
                                            <div>
                                                <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-gray-800 mb-3">
                                                    <h4 className="font-black text-sm text-gray-800 dark:text-gray-200">{group.name}</h4>
                                                    <span className="bg-orange-50 text-orange-600 text-[10px] font-black px-2 py-0.5 rounded-full">
                                                        {pendingTasks.length} تسک فعال
                                                    </span>
                                                </div>

                                                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pl-1">
                                                    {pendingTasks.length === 0 ? (
                                                        <div className="text-center py-6 text-gray-400">
                                                            <p className="text-xs">تسک فعال و معلقی در این گروه وجود ندارد ✨</p>
                                                        </div>
                                                    ) : (
                                                        pendingTasks.map(task => (
                                                            <div 
                                                                key={task.id} 
                                                                onClick={() => onGoToTaskGroup && onGoToTaskGroup(group.id, task.id)}
                                                                className="flex items-start gap-2.5 p-2 bg-white/60 dark:bg-gray-900/40 rounded-lg hover:bg-blue-50/50 dark:hover:bg-blue-950/20 hover:border-blue-200 border border-transparent transition cursor-pointer select-none"
                                                                title="کلیک برای انتقال به گفتگو و تسک‌های این گروه"
                                                            >
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const updatedTask = { 
                                                                            ...task, 
                                                                            status: 'completed' as const,
                                                                            completedBy: currentUser.username,
                                                                            completedAt: Date.now()
                                                                        };
                                                                        updateTask(updatedTask).then(() => {
                                                                            setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
                                                                        });
                                                                    }}
                                                                    className="mt-0.5 rounded-full border-2 border-gray-300 dark:border-gray-700 w-5 h-5 flex items-center justify-center hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950/20 text-slate-400 hover:text-green-600 transition shrink-0 cursor-pointer"
                                                                    title="علامت‌گذاری به عنوان انجام شده"
                                                                >
                                                                    <Check size={11} className="stroke-[3]" />
                                                                </button>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate" title={task.title}>{task.title}</p>
                                                                        {task.recurringReminder && (
                                                                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800" title={`یادآور صوتی هر ${task.reminderIntervalMinutes || 10} دقیقه فعال است`}>
                                                                                <BellRing size={9} className="animate-bounce" />
                                                                                <span>{task.reminderIntervalMinutes || 10}دقیقه</span>
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {task.assignedTo && task.assignedTo.length > 0 && (
                                                                        <span className="text-[9px] text-blue-600 bg-blue-50 dark:bg-blue-950/20 px-1 py-0.5 rounded mt-1 inline-block font-semibold">ارجاع: @{task.assignedTo.join(', @')}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                                <span className="text-[10px] text-gray-400 font-medium">{completedTasks.length} تسک انجام‌شده</span>
                                                {onGoToTaskGroup && (
                                                    <button 
                                                        onClick={() => onGoToTaskGroup(group.id)}
                                                        className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline transition-all"
                                                    >
                                                        <span>ورود به گفتگو و تسک‌ها</span>
                                                        <ArrowUpRight size={14}/>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
          </ResizableWidget>
        )}

        {/* NOTES PREVIEW SECTION - Google Keep Style Preview */}
        {widgetsVisibility.notes && (
          <ResizableWidget
            id="notes"
            title="برنامه یادداشت و تسک"
            orderIndex={widgetsOrder.indexOf('notes')}
            isFirst={widgetsOrder.indexOf('notes') === 0}
            isLast={widgetsOrder.indexOf('notes') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('notes'), widgetsOrder.indexOf('notes') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('notes'), widgetsOrder.indexOf('notes') + 1)}
            onRemove={() => toggleWidgetVisibility('notes')}
            size={widgetSizes.notes}
            defaultWidthPercent={100}
            onSizeChange={(size) => handleUpdateWidgetSize('notes', size)}
            onResetSize={() => handleResetWidgetSize('notes')}
            isLocked={isWidgetLockedForCurrentUser('notes')}
            isCollapsed={!!collapsedWidgets.notes}
            onToggleCollapse={() => handleToggleCollapseWidget('notes')}
            onDragStart={(e) => handleWidgetDragStart('notes', e)}
            onDragOver={(e) => handleWidgetDragOver('notes', e)}
            onDragLeave={() => handleWidgetDragLeave('notes')}
            onDrop={(e) => handleWidgetDrop('notes', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'notes'}
            isDropTarget={dragOverWidgetId === 'notes'}
          >
                <div className="bg-yellow-50/50 rounded-2xl p-6 border border-yellow-100 shadow-sm h-full">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <Edit3 size={20} className="text-yellow-600" />
                            <h3 className="font-black text-gray-800">برنامه یادداشت و تسک</h3>
                        </div>
                        <button 
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent('CHANGE_TAB', { detail: 'knowledge' }));
                            }}
                            className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-lg font-black hover:bg-yellow-200 transition-colors shadow-sm border border-yellow-200"
                        >
                            بازکردن برنامه اصلی
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {notes.length === 0 ? (
                            <div className="col-span-full py-8 text-center text-gray-400 text-sm border-2 border-dashed border-yellow-200 rounded-xl">
                                یادداشتی برای نمایش در پیشخوان وجود ندارد.
                            </div>
                        ) : (
                            notes.slice(0, 4).map(note => (
                                <div 
                                    key={note.id} 
                                    onClick={() => window.dispatchEvent(new CustomEvent('CHANGE_TAB', { detail: 'knowledge' }))}
                                    className={`${note.color || 'glass-panel'} p-4 rounded-xl border border-yellow-200 shadow-sm hover:shadow-md transition-all cursor-pointer relative group`}
                                >
                                    <h4 className="font-bold text-gray-800 text-sm mb-2 truncate">{note.title || 'بدون عنوان'}</h4>
                                    <div className="space-y-2">
                                        {note.content && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed">{note.content}</p>}
                                        {note.tasks && note.tasks.length > 0 && (
                                            <div className="space-y-1 my-1">
                                                {note.tasks.slice(0, 3).map(task => (
                                                    <div key={task.id} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                                        {task.isCompleted ? <ListChecks size={10} className="text-blue-500"/> : <Clock size={10} className="text-gray-300"/>}
                                                        <span className={task.isCompleted ? 'line-through opacity-50' : ''}>{task.text}</span>
                                                    </div>
                                                ))}
                                                {note.tasks.length > 3 && <div className="text-[9px] text-gray-400">...</div>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
          </ResizableWidget>
        )}

        {/* WINDOWS-STYLE QUICK ACCESS TILES & CUSTOMIZABLE WIDGETS */}
        {widgetsVisibility.quick_tiles && (
          <ResizableWidget
            id="quick_tiles"
            title="کاشی‌ها و دسترسی سریع برنامه‌ها"
            orderIndex={widgetsOrder.indexOf('quick_tiles')}
            isFirst={widgetsOrder.indexOf('quick_tiles') === 0}
            isLast={widgetsOrder.indexOf('quick_tiles') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('quick_tiles'), widgetsOrder.indexOf('quick_tiles') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('quick_tiles'), widgetsOrder.indexOf('quick_tiles') + 1)}
            onRemove={() => toggleWidgetVisibility('quick_tiles')}
            size={widgetSizes.quick_tiles}
            defaultWidthPercent={100}
            onSizeChange={(size) => handleUpdateWidgetSize('quick_tiles', size)}
            onResetSize={() => handleResetWidgetSize('quick_tiles')}
            isLocked={isWidgetLockedForCurrentUser('quick_tiles')}
            isCollapsed={!!collapsedWidgets.quick_tiles}
            onToggleCollapse={() => handleToggleCollapseWidget('quick_tiles')}
            onDragStart={(e) => handleWidgetDragStart('quick_tiles', e)}
            onDragOver={(e) => handleWidgetDragOver('quick_tiles', e)}
            onDragLeave={() => handleWidgetDragLeave('quick_tiles')}
            onDrop={(e) => handleWidgetDrop('quick_tiles', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'quick_tiles'}
            isDropTarget={dragOverWidgetId === 'quick_tiles'}
          >
                <div className="bg-gradient-to-br from-white/80 to-zinc-50/80 dark:from-zinc-950/80 dark:to-zinc-900/80 rounded-3xl p-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm backdrop-blur-xl relative h-full">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-500/20">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="font-black text-sm sm:text-base text-zinc-900 dark:text-white">
                                        کاشی‌ها و دسترسی سریع برنامه‌ها
                                    </h3>
                                    <span className="text-[10px] bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                                        {visibleTiles.length} کاشی فعال
                                    </span>
                                </div>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    کاشی‌ها را بکشید و رها کنید (Drag & Drop)، جابجا کنید یا کاشی‌های غیرضروری را مخفی نمایید
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                            {hiddenTileIds.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setHiddenTileIds([]);
                                        try {
                                            localStorage.removeItem('dashboard_hidden_tile_ids');
                                        } catch {}
                                    }}
                                    className="text-[11px] px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 font-bold transition-all"
                                    title="نمایش مجدد همه کاشی‌های مخفی‌شده"
                                >
                                    بازیابی همه ({hiddenTileIds.length} مخفی)
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsCustomizingTiles(prev => !prev)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm ${
                                    isCustomizingTiles
                                        ? 'bg-amber-600 text-white shadow-amber-500/20 ring-2 ring-amber-400/40'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                                }`}
                                title="شخصی‌سازی، حذف، نمایش و جابجایی کاشی‌ها"
                            >
                                <Settings2 size={14} />
                                <span>{isCustomizingTiles ? 'اتمام چینش کاشی‌ها' : 'شخصی‌سازی کاشی‌ها'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Tile Customizer Bar / Guide */}
                    {isCustomizingTiles && (
                        <div className="mb-5 p-3.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200 animate-fade-in">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                                <span>
                                    <b>حالت ویرایش فعال است:</b> می‌توانید با دکمه‌های فلش یا کشیدن، ترتیب را عوض کنید و با آیکون چشم کاشی‌ها را مخفی یا آشکار کنید.
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setCustomTileOrder([]);
                                    setHiddenTileIds([]);
                                    try {
                                        localStorage.removeItem('dashboard_custom_tile_order');
                                        localStorage.removeItem('dashboard_hidden_tile_ids');
                                    } catch {}
                                }}
                                className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline shrink-0"
                            >
                                بازنشانی به چیدمان پیش‌فرض
                            </button>
                        </div>
                    )}

                    {/* Tiles Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                        {(isCustomizingTiles ? displayTiles : visibleTiles).map((tile, idx) => {
                            const Icon = tile.icon || FileText;
                            const isHidden = hiddenTileIds.includes(tile.id);

                            return (
                                <div
                                    key={tile.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', tile.id);
                                        e.dataTransfer.setData('source-index', String(idx));
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const sourceIdxStr = e.dataTransfer.getData('source-index');
                                        if (sourceIdxStr !== '') {
                                            const sourceIdx = parseInt(sourceIdxStr, 10);
                                            if (!isNaN(sourceIdx) && sourceIdx !== idx) {
                                                moveTile(sourceIdx, idx);
                                            }
                                        }
                                    }}
                                    onClick={() => {
                                        if (!isCustomizingTiles) {
                                            if (tile.onClick) {
                                                tile.onClick();
                                            } else if (onNavigate) {
                                                onNavigate(tile.id);
                                            }
                                        }
                                    }}
                                    className={`p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between relative group ${
                                        isHidden
                                            ? 'opacity-40 bg-zinc-100 dark:bg-zinc-900 border-dashed border-zinc-300 dark:border-zinc-700'
                                            : 'bg-white/95 dark:bg-zinc-900/90 hover:bg-white dark:hover:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 hover:border-blue-400/80 dark:hover:border-blue-600/80 hover:shadow-lg shadow-sm active:scale-[0.98]'
                                    } ${isCustomizingTiles ? 'cursor-move ring-1 ring-zinc-300/60 dark:ring-zinc-700/60' : 'cursor-pointer'}`}
                                    title={`${tile.title} - ${isCustomizingTiles ? 'کشیدن جهت تغییر جایگاه' : 'کلیک برای باز کردن'}`}
                                >
                                    {/* Drag Grip & Actions in edit mode */}
                                    {isCustomizingTiles ? (
                                        <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-zinc-100 dark:border-zinc-800">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    disabled={idx === 0}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        moveTile(idx, idx - 1);
                                                    }}
                                                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 rounded text-zinc-500"
                                                    title="حرکت به جلو"
                                                >
                                                    <ChevronRight size={13} />
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={idx === displayTiles.length - 1}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        moveTile(idx, idx + 1);
                                                    }}
                                                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 rounded text-zinc-500"
                                                    title="حرکت به عقب"
                                                >
                                                    <ChevronLeft size={13} />
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleTileVisibility(tile.id);
                                                }}
                                                className={`p-1 rounded-lg transition-colors ${
                                                    isHidden
                                                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-rose-600'
                                                }`}
                                                title={isHidden ? 'آشکار کردن کاشی' : 'مخفی کردن کاشی از پیشخوان'}
                                            >
                                                {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between mb-2">
                                            <div className={`p-2.5 rounded-xl bg-gradient-to-br ${tile.gradient} text-white shadow-md shadow-blue-500/10 transition-transform group-hover:scale-105`}>
                                                <Icon size={18} />
                                            </div>
                                            {tile.count !== undefined && tile.count > 0 && (
                                                <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                                                    {tile.count}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <div>
                                        <h4 className="font-bold text-xs text-zinc-800 dark:text-zinc-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {tile.title}
                                        </h4>
                                        <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-400 font-medium">
                                            <span>{tile.badge}</span>
                                            {isHidden && <span className="text-rose-500 font-bold">مخفی</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
          </ResizableWidget>
        )}
        {widgetsVisibility.cartable && showActionSection && (
          <ResizableWidget
            id="cartable"
            title="کارتابل و وظایف من"
            orderIndex={widgetsOrder.indexOf('cartable')}
            isFirst={widgetsOrder.indexOf('cartable') === 0}
            isLast={widgetsOrder.indexOf('cartable') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('cartable'), widgetsOrder.indexOf('cartable') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('cartable'), widgetsOrder.indexOf('cartable') + 1)}
            onRemove={() => toggleWidgetVisibility('cartable')}
            size={widgetSizes.cartable}
            defaultWidthPercent={100}
            onSizeChange={(size) => handleUpdateWidgetSize('cartable', size)}
            onResetSize={() => handleResetWidgetSize('cartable')}
            isLocked={isWidgetLockedForCurrentUser('cartable')}
            isCollapsed={!!collapsedWidgets.cartable}
            onToggleCollapse={() => handleToggleCollapseWidget('cartable')}
            onDragStart={(e) => handleWidgetDragStart('cartable', e)}
            onDragOver={(e) => handleWidgetDragOver('cartable', e)}
            onDragLeave={() => handleWidgetDragLeave('cartable')}
            onDrop={(e) => handleWidgetDrop('cartable', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'cartable'}
            isDropTarget={dragOverWidgetId === 'cartable'}
          >
            <div className="h-full">
                <h2 className="text-xl font-black text-zinc-800 dark:text-zinc-200 mb-4 flex items-center gap-2">
                    <ListChecks className="text-[#4b90ff]" /> 
                    <span>کارتابل و وظایف من</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {pendingPaymentCount > 0 && hasPaymentAccess && (
                        <div onClick={onGoToPaymentApprovals} className="bg-gradient-to-br from-[#4b90ff] to-[#7154ff] rounded-2xl p-6 text-white shadow-lg shadow-blue-500/10 cursor-pointer transform hover:scale-[1.03] hover:-translate-y-1 transition-all relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Banknote size={100}/></div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl"><CheckSquare size={24} className="text-white"/></div>
                                    <span className="bg-[#ff4e6e] text-white text-[11px] font-black px-2.5 py-0.5 rounded-full animate-pulse">{pendingPaymentCount} مورد</span>
                                </div>
                                <h3 className="text-xl font-black mb-1">تایید دستور پرداخت</h3>
                                <p className="text-blue-50 text-xs opacity-85">درخواست‌های منتظر تایید شما</p>
                            </div>
                        </div>
                    )}

                    {pendingExitCount > 0 && hasExitAccess && (
                        <div onClick={onGoToExitApprovals} className="bg-gradient-to-br from-[#ff6097] to-[#e0306c] rounded-2xl p-6 text-white shadow-lg shadow-pink-500/10 cursor-pointer transform hover:scale-[1.03] hover:-translate-y-1 transition-all relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Truck size={100}/></div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl"><CheckSquare size={24} className="text-white"/></div>
                                    <span className="bg-zinc-900/60 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full animate-pulse">{pendingExitCount} مورد</span>
                                </div>
                                <h3 className="text-xl font-black mb-1">تایید حواله خروج کارخانه</h3>
                                <p className="text-rose-50 text-xs opacity-85">حواله‌های منتظر اقدام شما</p>
                            </div>
                        </div>
                    )}

                    {pendingBijakCount > 0 && hasWarehouseAccess && (
                        <div onClick={onGoToBijakApprovals} className="bg-gradient-to-br from-[#aa72ff] to-[#7f39f0] rounded-2xl p-6 text-white shadow-lg shadow-purple-500/10 cursor-pointer transform hover:scale-[1.03] hover:-translate-y-1 transition-all relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Package size={100}/></div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl"><CheckSquare size={24} className="text-white"/></div>
                                    <span className="bg-[#ff4e6e] text-white text-[11px] font-black px-2.5 py-0.5 rounded-full animate-pulse">{pendingBijakCount} مورد</span>
                                </div>
                                <h3 className="text-xl font-black mb-1">تایید تحویل بیجک</h3>
                                <p className="text-purple-50 text-xs opacity-85">اعلام بارهای خروجی (انتظامات)</p>
                            </div>
                        </div>
                    )}

                    {/* Role-Specific Colored Action Tiles for Purchase Requests */}
                    {hasPurchaseAccess && (isUserCEO || isUserAdmin) && pendingCeoPurchaseCount > 0 && (
                        <div onClick={onGoToPurchaseApprovals} className="bg-gradient-to-br from-[#f59e0b] via-[#d97706] to-[#b45309] rounded-2xl p-6 text-white shadow-lg shadow-amber-500/20 cursor-pointer transform hover:scale-[1.03] hover:-translate-y-1 transition-all relative overflow-hidden group border border-amber-300/40">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Crown size={100}/></div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-white/20 backdrop-blur-md p-3 rounded-xl"><Crown size={24} className="text-amber-100"/></div>
                                    <span className="bg-amber-200 text-amber-950 text-[11px] font-black px-2.5 py-0.5 rounded-full shadow animate-pulse">{pendingCeoPurchaseCount} مورد</span>
                                </div>
                                <h3 className="text-xl font-black mb-1 flex items-center gap-1.5">
                                    <span>تاییدات خرید (نقش مدیرعامل)</span>
                                </h3>
                                <p className="text-amber-100 text-xs opacity-90">مجوزهای استعلام و انتخاب پیش‌فاکتور نهایی</p>
                            </div>
                        </div>
                    )}

                    {hasPurchaseAccess && (isUserCommercial || isUserAdmin) && pendingCommercialPurchaseCount > 0 && (
                        <div onClick={onGoToPurchaseApprovals} className="bg-gradient-to-br from-[#7c3aed] via-[#6d28d9] to-[#4338ca] rounded-2xl p-6 text-white shadow-lg shadow-purple-500/20 cursor-pointer transform hover:scale-[1.03] hover:-translate-y-1 transition-all relative overflow-hidden group border border-purple-300/40">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Briefcase size={100}/></div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-white/20 backdrop-blur-md p-3 rounded-xl"><Briefcase size={24} className="text-purple-100"/></div>
                                    <span className="bg-purple-200 text-purple-950 text-[11px] font-black px-2.5 py-0.5 rounded-full shadow animate-pulse">{pendingCommercialPurchaseCount} مورد</span>
                                </div>
                                <h3 className="text-xl font-black mb-1 flex items-center gap-1.5">
                                    <span>کارتابل خرید (نقش مدیر بازرگانی)</span>
                                </h3>
                                <p className="text-purple-100 text-xs opacity-90">استعلام قیمت، ثبت پیش‌فاکتور و بررسی کارشناسی</p>
                            </div>
                        </div>
                    )}

                    {hasPurchaseAccess && pendingOtherPurchaseCount > 0 && (isUserAdmin || currentUser.role === UserRole.FACTORY_MANAGER || currentUser.role === UserRole.QC || currentUser.role === UserRole.WAREHOUSE_KEEPER || currentUser.role === UserRole.SECURITY_HEAD) && (
                        <div onClick={onGoToPurchaseApprovals} className="bg-gradient-to-br from-[#10b981] to-[#047857] rounded-2xl p-6 text-white shadow-lg shadow-emerald-500/10 cursor-pointer transform hover:scale-[1.03] hover:-translate-y-1 transition-all relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Package size={100}/></div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl"><CheckSquare size={24} className="text-white"/></div>
                                    <span className="bg-yellow-400 text-yellow-900 text-[11px] font-black px-2.5 py-0.5 rounded-full animate-pulse">{pendingOtherPurchaseCount} مورد</span>
                                </div>
                                <h3 className="text-xl font-black mb-1">تاییدات خرید کارخانه و فنی</h3>
                                <p className="text-emerald-50 text-xs opacity-85">بررسی نت، انبار، QC و کنترل ورود کالا</p>
                            </div>
                        </div>
                    )}

                    {pendingSecretariatCount > 0 && hasSecretariatAccess && (
                        <div onClick={() => window.dispatchEvent(new CustomEvent('CHANGE_TAB', { detail: 'secretariat' }))} className="bg-gradient-to-br from-[#f59e0b] to-[#d97706] rounded-2xl p-6 text-white shadow-lg shadow-amber-500/10 cursor-pointer transform hover:scale-[1.03] hover:-translate-y-1 transition-all relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><FileText size={100}/></div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl"><CheckSquare size={24} className="text-white"/></div>
                                    <span className="bg-[#ff4e6e] text-white text-[11px] font-black px-2.5 py-0.5 rounded-full animate-pulse">{pendingSecretariatCount} مورد</span>
                                </div>
                                <h3 className="text-xl font-black mb-1">کارتابل نامه‌ها</h3>
                                <p className="text-amber-50 text-xs opacity-85">نامه‌های اداری منتظر امضا/اقدام</p>
                            </div>
                        </div>
                    )}

                    {/* 1. Cheque Receipts: CEO / Final Approval Tile */}
                    {pendingChequeCounts.pendingCeo > 0 && (isCeoOrAdmin || isDirectFinalAllowed) && (
                        <div 
                            onClick={() => {
                                if (onNavigate) {
                                    onNavigate('sayan-operations');
                                } else {
                                    window.dispatchEvent(new CustomEvent('CHANGE_TAB', { detail: 'sayan-operations' }));
                                }
                                setTimeout(() => {
                                    window.dispatchEvent(new CustomEvent('SAYAN_SUB_TAB_CHANGE', { detail: 'CHEQUE_RECEIPTS' }));
                                    setTimeout(() => {
                                        window.dispatchEvent(new CustomEvent('CHEQUE_RECEIPTS_SUB_TAB_CHANGE', { detail: 'CARTABLE' }));
                                    }, 100);
                                }, 150);
                            }} 
                            className="bg-gradient-to-br from-[#d97706] to-[#b45309] rounded-2xl p-6 text-white shadow-lg shadow-amber-500/15 cursor-pointer transform hover:scale-[1.03] hover:-translate-y-1 transition-all relative overflow-hidden group"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><ShieldCheck size={100}/></div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl"><Crown size={24} className="text-white"/></div>
                                    <span className="bg-yellow-300 text-yellow-950 text-[11px] font-black px-2.5 py-0.5 rounded-full animate-pulse">{pendingChequeCounts.pendingCeo} مورد</span>
                                </div>
                                <h3 className="text-xl font-black mb-1">
                                    تاییدات رسید چک (نقش مدیرعامل)
                                </h3>
                                <p className="text-amber-50 text-xs opacity-90">
                                    {pendingChequeCounts.pendingCeo} رسید چک تایید حسابداری شده و منتظر تایید نهایی جهت صدور سند در سایان است
                                </p>
                            </div>
                        </div>
                    )}

                    {/* 2. Cheque Receipts: Accounting Review Tile */}
                    {pendingChequeCounts.pendingAccounting > 0 && (isFinancialOrAdmin || isCeoOrAdmin) && (
                        <div 
                            onClick={() => {
                                if (onNavigate) {
                                    onNavigate('sayan-operations');
                                } else {
                                    window.dispatchEvent(new CustomEvent('CHANGE_TAB', { detail: 'sayan-operations' }));
                                }
                                setTimeout(() => {
                                    window.dispatchEvent(new CustomEvent('SAYAN_SUB_TAB_CHANGE', { detail: 'CHEQUE_RECEIPTS' }));
                                    setTimeout(() => {
                                        window.dispatchEvent(new CustomEvent('CHEQUE_RECEIPTS_SUB_TAB_CHANGE', { detail: 'CARTABLE' }));
                                    }, 100);
                                }, 150);
                            }} 
                            className="bg-gradient-to-br from-[#059669] to-[#047857] rounded-2xl p-6 text-white shadow-lg shadow-emerald-500/10 cursor-pointer transform hover:scale-[1.03] hover:-translate-y-1 transition-all relative overflow-hidden group"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><CreditCard size={100}/></div>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl"><CreditCard size={24} className="text-white"/></div>
                                    <span className="bg-yellow-400 text-yellow-900 text-[11px] font-black px-2.5 py-0.5 rounded-full animate-pulse">{pendingChequeCounts.pendingAccounting} مورد</span>
                                </div>
                                <h3 className="text-xl font-black mb-1">
                                    بررسی حسابداری رسید چک
                                </h3>
                                <p className="text-emerald-50 text-xs opacity-85">
                                    {pendingChequeCounts.pendingAccounting} رسید چک منتظر بررسی و تایید حسابداری است
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
          </ResizableWidget>
        )}

        {/* PAYMENT DASHBOARD - ONLY IF ACCESS IS GRANTED */}
        {hasPaymentAccess && widgetsVisibility.payment_stats && (
          <ResizableWidget
            id="payment_stats"
            title="آمار وضعیت پرداخت‌ها"
            orderIndex={widgetsOrder.indexOf('payment_stats')}
            isFirst={widgetsOrder.indexOf('payment_stats') === 0}
            isLast={widgetsOrder.indexOf('payment_stats') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('payment_stats'), widgetsOrder.indexOf('payment_stats') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('payment_stats'), widgetsOrder.indexOf('payment_stats') + 1)}
            onRemove={() => toggleWidgetVisibility('payment_stats')}
            size={widgetSizes.payment_stats}
            defaultWidthPercent={100}
            onSizeChange={(size) => handleUpdateWidgetSize('payment_stats', size)}
            onResetSize={() => handleResetWidgetSize('payment_stats')}
            isLocked={isWidgetLockedForCurrentUser('payment_stats')}
            isCollapsed={!!collapsedWidgets.payment_stats}
            onToggleCollapse={() => handleToggleCollapseWidget('payment_stats')}
            onDragStart={(e) => handleWidgetDragStart('payment_stats', e)}
            onDragOver={(e) => handleWidgetDragOver('payment_stats', e)}
            onDragLeave={() => handleWidgetDragLeave('payment_stats')}
            onDrop={(e) => handleWidgetDrop('payment_stats', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'payment_stats'}
            isDropTarget={dragOverWidgetId === 'payment_stats'}
          >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 h-full">
                    {statusWidgets.map((widget) => (
                        <div key={widget.key} onClick={() => handleWidgetClick(widget.key === OrderStatus.APPROVED_CEO ? 'pending_all' : widget.key as any)} className={`glass-panel p-4 rounded-2xl border ${widget.border} shadow-sm transition-all relative overflow-hidden group cursor-pointer hover:shadow-md`}>
                            <div className={`absolute top-0 right-0 w-1.5 h-full ${widget.barColor}`}></div>
                            <div className="flex justify-between items-start mb-2">
                                <div className={`p-2 rounded-xl ${widget.bg} ${widget.color}`}>
                                    <widget.icon size={20} />
                                </div>
                                <span className="text-2xl font-black text-gray-800 font-mono">{widget.count}</span>
                            </div>
                            <h3 className="text-xs font-bold text-gray-500">{widget.label}</h3>
                        </div>
                    ))}
                </div>
          </ResizableWidget>
        )}

        {hasPaymentAccess && widgetsVisibility.payment_chart && (
          <ResizableWidget
            id="payment_chart"
            title="توزیع روش‌های پرداخت"
            orderIndex={widgetsOrder.indexOf('payment_chart')}
            isFirst={widgetsOrder.indexOf('payment_chart') === 0}
            isLast={widgetsOrder.indexOf('payment_chart') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('payment_chart'), widgetsOrder.indexOf('payment_chart') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('payment_chart'), widgetsOrder.indexOf('payment_chart') + 1)}
            onRemove={() => toggleWidgetVisibility('payment_chart')}
            size={widgetSizes.payment_chart}
            defaultWidthPercent={100}
            onSizeChange={(size) => handleUpdateWidgetSize('payment_chart', size)}
            onResetSize={() => handleResetWidgetSize('payment_chart')}
            isLocked={isWidgetLockedForCurrentUser('payment_chart')}
            isCollapsed={!!collapsedWidgets.payment_chart}
            onToggleCollapse={() => handleToggleCollapseWidget('payment_chart')}
            onDragStart={(e) => handleWidgetDragStart('payment_chart', e)}
            onDragOver={(e) => handleWidgetDragOver('payment_chart', e)}
            onDragLeave={() => handleWidgetDragLeave('payment_chart')}
            onDrop={(e) => handleWidgetDrop('payment_chart', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'payment_chart'}
            isDropTarget={dragOverWidgetId === 'payment_chart'}
          >
                <div className="grid grid-cols-1 gap-6 h-full">
                    <div className="glass-panel p-6 rounded-2xl border border-gray-200/50 dark:border-white/10 shadow-sm flex flex-col h-full">
                        <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><PieChart size={20} className="text-blue-500"/> توزیع روش‌های پرداخت</h3>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RechartsPieChart>
                                    <Pie data={methodData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="amount">
                                        {methodData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                    <Legend />
                                </RechartsPieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
          </ResizableWidget>
        )}

                  {/* WAREHOUSE STATUS WIDGET */}
                {permissions.canViewSayanWarehouseWidget && widgetsVisibility.warehouse_status && (
                  <ResizableWidget
                    id="warehouse_status"
                    title="داشبورد تراز وزنی کل زنجیره تامین و انبارها"
                    orderIndex={widgetsOrder.indexOf('warehouse_status')}
                    isFirst={widgetsOrder.indexOf('warehouse_status') === 0}
                    isLast={widgetsOrder.indexOf('warehouse_status') === widgetsOrder.length - 1}
                    isCustomizing={isCustomizingWidgets}
                    onMoveUp={() => moveWidget(widgetsOrder.indexOf('warehouse_status'), widgetsOrder.indexOf('warehouse_status') - 1)}
                    onMoveDown={() => moveWidget(widgetsOrder.indexOf('warehouse_status'), widgetsOrder.indexOf('warehouse_status') + 1)}
                    onRemove={() => toggleWidgetVisibility('warehouse_status')}
                    size={widgetSizes.warehouse_status}
                    defaultWidthPercent={100}
                    onSizeChange={(size) => handleUpdateWidgetSize('warehouse_status', size)}
                    onResetSize={() => handleResetWidgetSize('warehouse_status')}
                    isLocked={isWidgetLockedForCurrentUser('warehouse_status')}
                    isCollapsed={!!collapsedWidgets.warehouse_status}
                    onToggleCollapse={() => handleToggleCollapseWidget('warehouse_status')}
                    onDragStart={(e) => handleWidgetDragStart('warehouse_status', e)}
                    onDragOver={(e) => handleWidgetDragOver('warehouse_status', e)}
                    onDragLeave={() => handleWidgetDragLeave('warehouse_status')}
                    onDrop={(e) => handleWidgetDrop('warehouse_status', e)}
                    onDragEnd={handleWidgetDragEnd}
                    isDragging={draggedWidgetId === 'warehouse_status'}
                    isDropTarget={dragOverWidgetId === 'warehouse_status'}
                  >
                        <div className="glass-panel p-6 rounded-2xl border border-gray-200/50 dark:border-white/10 shadow-md flex flex-col relative overflow-hidden h-full">
                        {/* Sub-background decoration to emphasize managerial feel */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full blur-2xl pointer-events-none" />

                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-gray-100 pb-4">
                            <div className="space-y-1">
                                <h3 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                    <Package size={20} className="text-orange-500 animate-pulse"/>
                                    <span>داشبورد تراز وزنی کل زنجیره تامین و انبارها</span>
                                </h3>
                                <p className="text-[11px] text-gray-500 font-medium">پایش برخط موجودی مواد اولیه، کالاهای وارده، گمرک، ترانزیت و تولیدی کارخانجات</p>
                            </div>

                            <div className="flex items-center gap-2 self-stretch md:self-auto justify-between md:justify-end">
                                {/* Live Status Badge */}
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide shadow-sm border ${
                                    warehouseIsMock 
                                        ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                        warehouseIsMock ? 'bg-amber-500' : 'bg-emerald-500 animate-ping'
                                    }`} />
                                    <span>{warehouseIsMock ? 'نمایش آفلاین (دیتا بیس)' : 'برخط (Sayan Live)'}</span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <button 
                                        onClick={() => fetchWarehouseAlert(true)}
                                        disabled={isRefreshingWarehouse}
                                        className={`p-1.5 rounded-lg text-gray-500 hover:text-orange-600 hover:bg-orange-50 transition-all border border-gray-200/60 flex items-center justify-center ${
                                            isRefreshingWarehouse ? 'animate-spin text-orange-500' : ''
                                        }`}
                                        title="بروزرسانی مستقیم از هسته سایان"
                                    >
                                        <RotateCw size={14} />
                                    </button>

                                    <button 
                                        onClick={() => onNavigate && onNavigate('sayan')} 
                                        className="text-[11px] bg-orange-500 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-orange-600 transition-colors shadow-sm flex items-center gap-1"
                                    >
                                        <span>سامانه انبار</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Stat Blocks */}
                            <div className="space-y-4 flex flex-col justify-center">
                                <div className="bg-orange-50/40 dark:bg-orange-950/10 p-4 rounded-xl border border-orange-100/50">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs text-gray-500 font-bold">کل وزن موجودی زنجیره تامین</span>
                                        <span className="text-[9px] bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded">تناژ فعال</span>
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-2xl font-black text-gray-800 font-mono">
                                            {(displayWarehouseData.totalCurrentAllWeight / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}
                                        </span>
                                        <span className="text-xs text-gray-500 font-bold">تن (Tons)</span>
                                    </div>
                                </div>

                                <div className="bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-100/50">
                                    <span className="text-xs text-gray-500 block mb-1">تغییر نسبت به دوره مشابه سال قبل</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-lg font-black font-mono ${
                                            displayWarehouseData.diffAllWeight >= 0 ? 'text-emerald-600' : 'text-red-600'
                                        }`}>
                                            {(displayWarehouseData.diffAllWeight / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} تن
                                        </span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                            displayWarehouseData.diffAllWeight >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                                        }`}>
                                            {Math.abs(displayWarehouseData.ratioAllWeight).toFixed(1)}٪
                                        </span>
                                    </div>
                                </div>

                                {/* REPORT OF POSITIVE & NEGATIVE WEIGHTS AT ANY MOMENT */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-emerald-50/60 dark:bg-emerald-950/10 p-3 rounded-xl border border-emerald-100/50">
                                        <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-bold block mb-1">ترازهای مثبت (رشد وزنی)</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-sm font-black text-emerald-700 font-mono" dir="ltr">
                                                +{(displayWarehouseData.totalPositiveWeight / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}
                                            </span>
                                            <span className="text-[9px] text-emerald-600 font-bold">تن</span>
                                        </div>
                                    </div>

                                    <div className="bg-red-50/60 dark:bg-red-950/10 p-3 rounded-xl border border-red-100/50">
                                        <span className="text-[10px] text-red-800 dark:text-red-400 font-bold block mb-1">ترازهای منفی (کسری وزنی)</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-sm font-black text-red-700 font-mono" dir="ltr">
                                                {(displayWarehouseData.totalNegativeWeight / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}
                                            </span>
                                            <span className="text-[9px] text-red-600 font-bold">تن</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="text-xs text-gray-400 flex items-center gap-1">
                                    <Clock size={12} />
                                    <span>بروزرسانی گزارش: {displayWarehouseData.reportDate}</span>
                                </div>
                            </div>

                            {/* Bar Chart */}
                            <div className="lg:col-span-2 h-56 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsBarChart data={warehouseChartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} />
                                        <YAxis tick={{fontSize: 10}} tickFormatter={(value) => `${value}t`} />
                                        <Tooltip formatter={(value: number) => [`${value.toLocaleString('fa-IR', {maximumFractionDigits: 1})} تن`, '']} cursor={{fill: '#fcf8f2'}} />
                                        <Legend iconType="circle" wrapperStyle={{fontSize: 11, fontWeight: 'bold'}} />
                                        <Bar dataKey="امسال" fill="#f97316" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="سال قبل" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                                    </RechartsBarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                  </ResizableWidget>
                )}

        {/* RECENT ACTIVITIES */}
        {widgetsVisibility.recent_activities && (
          <ResizableWidget
            id="recent_activities"
            title="آخرین فعالیت‌ها (پرداخت)"
            orderIndex={widgetsOrder.indexOf('recent_activities')}
            isFirst={widgetsOrder.indexOf('recent_activities') === 0}
            isLast={widgetsOrder.indexOf('recent_activities') === widgetsOrder.length - 1}
            isCustomizing={isCustomizingWidgets}
            onMoveUp={() => moveWidget(widgetsOrder.indexOf('recent_activities'), widgetsOrder.indexOf('recent_activities') - 1)}
            onMoveDown={() => moveWidget(widgetsOrder.indexOf('recent_activities'), widgetsOrder.indexOf('recent_activities') + 1)}
            onRemove={() => toggleWidgetVisibility('recent_activities')}
            size={widgetSizes.recent_activities}
            defaultWidthPercent={100}
            onSizeChange={(size) => handleUpdateWidgetSize('recent_activities', size)}
            onResetSize={() => handleResetWidgetSize('recent_activities')}
            isLocked={isWidgetLockedForCurrentUser('recent_activities')}
            isCollapsed={!!collapsedWidgets.recent_activities}
            onToggleCollapse={() => handleToggleCollapseWidget('recent_activities')}
            onDragStart={(e) => handleWidgetDragStart('recent_activities', e)}
            onDragOver={(e) => handleWidgetDragOver('recent_activities', e)}
            onDragLeave={() => handleWidgetDragLeave('recent_activities')}
            onDrop={(e) => handleWidgetDrop('recent_activities', e)}
            onDragEnd={handleWidgetDragEnd}
            isDragging={draggedWidgetId === 'recent_activities'}
            isDropTarget={dragOverWidgetId === 'recent_activities'}
          >
                <div className="glass-panel rounded-2xl border border-gray-200 shadow-sm overflow-hidden h-full">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 dark:bg-gray-900/40 text-gray-800 dark:text-gray-200/50">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2"><Activity size={20} className="text-orange-500"/> آخرین فعالیت‌ها (پرداخت)</h3>
                        {onViewArchive && <button onClick={onViewArchive} className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-bold bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">مشاهده آرشیو <ArrowUpRight size={14}/></button>}
                    </div>
                    
                    <div className="divide-y divide-gray-100">
                        {activeCartable.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
                                <CheckCircle size={32} className="opacity-20"/>
                                موردی وجود ندارد.
                            </div>
                        ) : (
                            activeCartable.map(order => (
                                <div key={order.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${order.status === OrderStatus.REJECTED ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                            {order.trackingNumber % 100}
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-800 text-sm">{order.payee}</div>
                                            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                                                <span>{new Date(order.date).toLocaleDateString('fa-IR')}</span>
                                                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                <span>{order.requester}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-gray-900 font-mono text-sm">{formatCurrency(order.totalAmount)}</div>
                                        <div className={`text-[10px] mt-1 px-2 py-0.5 rounded inline-block ${order.status === OrderStatus.PENDING ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                                            {order.status}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
          </ResizableWidget>
        )}
      </div>
    )}

        {/* Bank Report Modal */}
        {showBankReport && hasPaymentAccess && (
            <div className="fixed inset-0 bg-black/50 z-[100] flex items-start justify-center p-4 animate-fade-in backdrop-blur-sm pt-10 md:pt-20">
                <div className="glass-panel rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2"><Banknote size={20}/> گزارش تفصیلی بانک‌ها</h3>
                        <button onClick={() => setShowBankReport(false)} className="p-1 hover:bg-gray-200 rounded-full transition-colors"><XCircle size={20} className="text-gray-500"/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
                        {bankReportTab === 'summary' ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="glass-panel p-4 rounded-xl border border-indigo-100 shadow-sm flex items-center gap-4">
                                        <div className="bg-indigo-100 p-3 rounded-full text-indigo-600"><TrendingUp size={24}/></div>
                                        <div><div className="text-xs text-gray-500 font-bold">پر تراکنش‌ترین بانک</div><div className="text-lg font-black text-gray-800">{topBank.name}</div><div className="text-xs text-indigo-600 font-mono">{formatCurrency(topBank.value)}</div></div>
                                    </div>
                                </div>
                                <div className="glass-panel rounded-xl border overflow-hidden">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-gray-100 dark:bg-gray-800/40 text-gray-800 dark:text-gray-200 text-gray-600"><tr><th className="p-3">نام بانک</th><th className="p-3">مجموع پرداختی</th><th className="p-3">درصد از کل</th></tr></thead>
                                        <tbody className="divide-y">
                                            {bankStats.map((bank, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="p-3 font-bold text-gray-800">{bank.name}</td>
                                                    <td className="p-3 font-mono text-gray-600">{formatCurrency(bank.value)}</td>
                                                    <td className="p-3 font-mono text-gray-500 dir-ltr">{((bank.value / totalAmount) * 100).toFixed(1)}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div>گزارش زمانی (همانند قبل)</div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Announce Modal */}
        {showAnnounceModal && (
            <div className="fixed inset-0 z-[9999999] flex items-start justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in overflow-y-auto pt-10 md:pt-14">
                <div role="dialog" aria-label="ثبت اعلان" className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-200 border border-white/20 relative mb-10">
                    <div className="p-5 border-b flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50 shrink-0">
                        <div className="flex items-center gap-3 text-indigo-800">
                            <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-indigo-100">
                                <Activity size={20} className="text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="font-black text-lg">ثبت {announceType === 'task' ? 'تسک' : 'اعلامیه'} جدید</h3>
                                <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-mono">Internal Communication</p>
                            </div>
                        </div>
                        <button onClick={() => setShowAnnounceModal(false)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all" data-close-modal="true" aria-label="بستن"><X size={24} strokeWidth={3} /></button>
                    </div>
                    <div className="p-4 flex flex-col gap-4">
                        <div className="flex bg-gray-100 p-1 rounded-xl">
                            <button onClick={() => setAnnounceType('announcement')} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${announceType === 'announcement' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>اعلامیه</button>
                            <button onClick={() => setAnnounceType('task')} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${announceType === 'task' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>تسک فردی</button>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-600 block mb-1">مخاطب (اختیاری - خالی برای همه)</label>
                            <select 
                                className="w-full border rounded-xl p-2.5 text-sm dir-rtl outline-none focus:ring-2 focus:ring-blue-100"
                                value={announceTarget}
                                onChange={(e) => setAnnounceTarget(e.target.value)}
                            >
                                <option value="">همه پرسنل</option>
                                {allUsers.map(u => (
                                    <option key={u.id} value={u.username}>{u.fullName || u.username}</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-gray-400 mt-1">اگر کاربری را انتخاب کنید، پیام فقط برای او نمایش داده می‌شود.</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-600 block mb-1">متن پیام</label>
                            <textarea 
                                className="w-full border rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                                rows={4}
                                value={announceText}
                                onChange={(e) => setAnnounceText(e.target.value)}
                                placeholder="موضوع مورد نظر خود را بنویسید..."
                            ></textarea>
                        </div>
                    </div>
                    <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                        <button onClick={() => setShowAnnounceModal(false)} className="px-4 py-2 text-gray-600 text-sm font-bold hover:bg-gray-200 rounded-xl transition-colors">انصراف</button>
                        <button onClick={handleCreateAnnouncement} disabled={!announceText.trim()} className="px-5 py-2 bg-blue-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-colors flex items-center gap-2">
                            <Send size={16}/> انتشار پیام
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* ADMIN ROLE-BASED WIDGET LOCKS & COMPANY DEFAULT MODAL */}
        <DashboardAdminRoleLocksModal
          isOpen={showAdminLocksModal}
          onClose={() => setShowAdminLocksModal(false)}
          widgetNames={DASHBOARD_WIDGET_NAMES}
          roleLocks={roleLocks}
          onSaveRoleLocks={handleSaveRoleLocks}
          onPublishDefaultLayout={handlePublishCompanyDefaultLayout}
        />
    </div>
  );
};

export default Dashboard;
