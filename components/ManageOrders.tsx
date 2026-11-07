
import React, { useState, useEffect } from 'react';
import { PaymentOrder, OrderStatus, User, UserRole, SystemSettings, PaymentMethod } from '../types';
import { updateOrderStatus, deleteOrder } from '../services/storageService';
import { getRolePermissions } from '../services/authService';
import { formatCurrency, formatDate, getStatusLabel, jalaliToGregorian, formatNumberString, deformatNumberString, parseSafeDate } from '../constants';
import { Eye, Trash2, Search, Filter, FileSpreadsheet, Paperclip, ListChecks, Archive, X, Building2, Calculator, AlertTriangle, RefreshCcw, Loader2, ShieldAlert, XCircle, Sparkles, Scan, CreditCard } from 'lucide-react';
import PrintVoucher from './PrintVoucher';
import { OrderArchiveModal } from './OrderArchiveModal';
import EditOrderModal from './EditOrderModal';
import { AiDocumentScannerModal } from './AiDocumentScannerModal';
import { apiCall } from '../services/apiService';
import MobileOrderCard from './mobile/MobileOrderCard';

import { isInFinancialYear } from '../utils/dateUtils';

interface ManageOrdersProps {
  orders: PaymentOrder[];
  refreshData: () => void;
  currentUser: User;
  initialTab?: 'current' | 'archive';
  settings?: SystemSettings;
  statusFilter?: any; 
  financialYear?: string;
}

const ManageOrders: React.FC<ManageOrdersProps> = ({ orders, refreshData, currentUser, initialTab = 'current', settings, statusFilter, financialYear }) => {
  const [localOrders, setLocalOrders] = useState<PaymentOrder[]>(orders);
  useEffect(() => {
      setLocalOrders(orders);
  }, [orders]);

  let safeOrders = Array.isArray(localOrders) ? localOrders : [];
  if (financialYear && financialYear !== 'all') {
      safeOrders = safeOrders.filter(o => isInFinancialYear(o.date, financialYear));
  }

  const [activeTab, setActiveTab] = useState<'current' | 'archive'>(initialTab);
  const [viewOrder, setViewOrder] = useState<PaymentOrder | null>(null); 
  const [editingOrder, setEditingOrder] = useState<PaymentOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showFilters, setShowFilters] = useState(false);
  const [amountRange, setAmountRange] = useState({ min: '', max: '' });
  const [dateRange, setDateRange] = useState({
      from: { year: 1402, month: 1, day: 1 },
      to: { year: 1405, month: 12, day: 29 },
      enabled: false
  });
  const [companyFilter, setCompanyFilter] = useState('');
  
  const [currentStatusFilter, setCurrentStatusFilter] = useState<any>(statusFilter || null);
  const [archivingOrder, setArchivingOrder] = useState<PaymentOrder | null>(null);
  const [showAiScanner, setShowAiScanner] = useState(false);

  useEffect(() => {
      if (viewOrder || editingOrder) {
          const handleBack = () => {
              if (viewOrder) setViewOrder(null);
              if (editingOrder) setEditingOrder(null);
          };
          window.dispatchEvent(new CustomEvent('REGISTER_BACK_ACTION', { detail: handleBack }));
      } else {
          window.dispatchEvent(new CustomEvent('UNREGISTER_BACK_ACTION'));
      }
      return () => { window.dispatchEvent(new CustomEvent('UNREGISTER_BACK_ACTION')); };
  }, [viewOrder, editingOrder]);

  // Check if mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
      setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
      if (statusFilter) {
          setCurrentStatusFilter(statusFilter);
          if (statusFilter === OrderStatus.APPROVED_CEO || statusFilter === OrderStatus.REVOKED) {
              setActiveTab('archive');
          } else {
              setActiveTab('current');
          }
      }
  }, [statusFilter]);

  // Listen for custom navigation / open events from Global Search or cross-module links
  useEffect(() => {
      const handleOpenPaymentOrder = (e: any) => {
          const detail = e.detail;
          if (!detail) return;
          const targetId = detail.orderId || detail.id || detail.trackingNumber;
          const targetSearch = detail.searchTerm;
          if (targetSearch) {
              setSearchTerm(targetSearch);
          }
          if (targetId) {
              const allList = Array.isArray(localOrders) ? localOrders : [];
              const found = allList.find(o => o.id === targetId || o.trackingNumber === targetId || String(o.trackingNumber) === String(targetId));
              if (found) {
                  if (found.status === OrderStatus.APPROVED_CEO || found.status === OrderStatus.REVOKED) {
                      setActiveTab('archive');
                  } else {
                      setActiveTab('current');
                  }
                  setViewOrder(found);
              }
          }
      };
      window.addEventListener('OPEN_PAYMENT_ORDER' as any, handleOpenPaymentOrder);
      window.addEventListener('NAVIGATE_PAYMENT_ORDER' as any, handleOpenPaymentOrder);
      return () => {
          window.removeEventListener('OPEN_PAYMENT_ORDER' as any, handleOpenPaymentOrder);
          window.removeEventListener('NAVIGATE_PAYMENT_ORDER' as any, handleOpenPaymentOrder);
      };
  }, [localOrders]);

  const permissions = getRolePermissions(currentUser.role, settings || null, currentUser);
  const availableCompanies = settings?.companies?.map(c => c.name) || settings?.companyNames || [];

  const isRevocationStatus = (status: OrderStatus) => {
      return [
          OrderStatus.REVOCATION_PENDING_FINANCE,
          OrderStatus.REVOCATION_PENDING_MANAGER,
          OrderStatus.REVOCATION_PENDING_CEO
      ].includes(status);
  };

  const canApprove = (order: PaymentOrder): boolean => {
    if (order.status === OrderStatus.APPROVED_CEO || order.status === OrderStatus.REVOKED) return false;
    if (order.status === OrderStatus.REVOCATION_PENDING_FINANCE) {
        return currentUser.role === UserRole.FINANCIAL || permissions.canApproveFinancial || currentUser.role === UserRole.ADMIN;
    }
    if (order.status === OrderStatus.REVOCATION_PENDING_MANAGER) {
        return currentUser.role === UserRole.MANAGER || permissions.canApproveManager || currentUser.role === UserRole.ADMIN;
    }
    if (order.status === OrderStatus.REVOCATION_PENDING_CEO) {
        return currentUser.role === UserRole.CEO || permissions.canApproveCeo || currentUser.role === UserRole.ADMIN;
    }
    if (isRevocationStatus(order.status)) return false;

    if (order.status === OrderStatus.PENDING && permissions.canApproveFinancial) return true;
    if (order.status === OrderStatus.APPROVED_FINANCE && permissions.canApproveManager) return true;
    if (order.status === OrderStatus.APPROVED_MANAGER && permissions.canApproveCeo) return true;
    
    return false;
  };

  const canEdit = (order: PaymentOrder): boolean => {
      if (currentUser.role === UserRole.ADMIN) return true;
      if (order.status === OrderStatus.APPROVED_CEO || order.status === OrderStatus.REVOKED) return false;
      if (isRevocationStatus(order.status)) return false;

      if (currentUser.role === UserRole.USER) {
          return permissions.canEditOwn && order.requester === currentUser.fullName && (order.status === OrderStatus.PENDING || order.status === OrderStatus.REJECTED);
      }
      if (permissions.canEditAll) return true;
      if (permissions.canEditOwn && order.requester === currentUser.fullName && (order.status === OrderStatus.PENDING || order.status === OrderStatus.REJECTED)) return true;
      return false;
  };

  const canDelete = (order: PaymentOrder): boolean => {
      if (currentUser.role === UserRole.ADMIN) return true;
      if (order.status === OrderStatus.APPROVED_CEO || order.status === OrderStatus.REVOKED || isRevocationStatus(order.status)) return false;
      
      if (currentUser.role === UserRole.USER) {
          // If User created it and it's still pending, they can delete it
          return permissions.canDeleteOwn && order.requester === currentUser.fullName && (order.status === OrderStatus.PENDING || order.status === OrderStatus.REJECTED);
      }
      if (permissions.canDeleteAll) return true;
      if (permissions.canDeleteOwn && order.requester === currentUser.fullName && (order.status === OrderStatus.PENDING || order.status === OrderStatus.REJECTED)) return true;
      return false;
  };

  const getNextStatus = (current: OrderStatus): OrderStatus => {
      if (current === OrderStatus.REVOCATION_PENDING_FINANCE) return OrderStatus.REVOCATION_PENDING_MANAGER;
      if (current === OrderStatus.REVOCATION_PENDING_MANAGER) return OrderStatus.REVOCATION_PENDING_CEO;
      if (current === OrderStatus.REVOCATION_PENDING_CEO) return OrderStatus.REVOKED;

      if (current === OrderStatus.PENDING) return OrderStatus.APPROVED_FINANCE;
      if (current === OrderStatus.APPROVED_FINANCE) return OrderStatus.APPROVED_MANAGER;
      if (current === OrderStatus.APPROVED_MANAGER) return OrderStatus.APPROVED_CEO;
      
      return current;
  };

  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleApprove = (id: string, currentStatus: OrderStatus) => {
    const nextStatus = getNextStatus(currentStatus);
    const isRevocation = isRevocationStatus(currentStatus);
    
    // For revocation we should still confirm as it's a destructive/critical action
    if (isRevocation) {
        if (!window.confirm(`⚠️ تایید ابطال:\nوضعیت بعدی: ${getStatusLabel(nextStatus)}\nآیا اطمینان دارید؟`)) return;
    }
    
    const prevOrders = [...localOrders];
    // 1. Instant Optimistic UI Update: updates/removes instantly with 0ms delay
    setLocalOrders(prev => prev.map(o => o.id === id ? { ...o, status: nextStatus, updatedAt: Date.now() } : o));
    setViewOrder(null);

    // 2. Run background server processing (Fire-and-forget)
    updateOrderStatus(id, nextStatus, currentUser)
        .then((updatedOrders) => {
            const orderList = Array.isArray(updatedOrders) ? updatedOrders : [];
            const order = orderList.find(o => o.id === id);
            if (order) {
                const event = new CustomEvent('QUEUE_WHATSAPP_JOB', { 
                    detail: { order: order, type: 'approve' } 
                });
                window.dispatchEvent(event);
            }
            // Silently refresh data to keep things in sync
            refreshData(); 
        })
        .catch(e => {
            console.error("Order approval error:", e);
            // Rollback state on error
            setLocalOrders(prevOrders);
            alert('خطا در انجام عملیات تایید دستور پرداخت: ' + (e?.message || 'مشکل ارتباط با سرور'));
        });
  };

  const getPrevStatusForReject = (current: OrderStatus): OrderStatus => {
      if (current === OrderStatus.APPROVED_MANAGER) return OrderStatus.APPROVED_FINANCE;
      if (current === OrderStatus.APPROVED_FINANCE) return OrderStatus.PENDING;
      return OrderStatus.REJECTED;
  };

  const getRejectPromptText = (current: OrderStatus): string => {
      if (current === OrderStatus.APPROVED_MANAGER) {
          return 'لطفاً دلیل رد درخواست را وارد کنید (درخواست به مرحله قبل «کارتابل مدیریت» بازگردانده می‌شود):';
      }
      if (current === OrderStatus.APPROVED_FINANCE) {
          return 'لطفاً دلیل رد درخواست را وارد کنید (درخواست به مرحله قبل «کارتابل مالی» بازگردانده می‌شود):';
      }
      return 'لطفاً دلیل رد درخواست را وارد کنید (درخواست به ثبت‌کننده ارجاع و رد نهایی می‌شود):';
  };

  const handleReject = (id: string, currentStatus?: OrderStatus) => {
      const order = safeOrders.find(o => o.id === id);
      const status = currentStatus || order?.status || OrderStatus.PENDING;
      const prevStatus = getPrevStatusForReject(status);
      const promptText = getRejectPromptText(status);

      const reason = window.prompt(promptText);
      if (reason !== null) {
          const prevOrders = [...localOrders];
          // 1. Optimistic Update
          setLocalOrders(prev => prev.map(o => o.id === id ? { ...o, status: prevStatus, updatedAt: Date.now() } : o));
          setViewOrder(null);

          // 2. Background task
          updateOrderStatus(id, prevStatus, currentUser, reason || 'رد جهت بررسی و اصلاح در مرحله قبل', true)
              .then(() => refreshData())
              .catch(e => {
                  setLocalOrders(prevOrders);
                  alert("خطا در ثبت رد درخواست");
              });
      }
  };

  const handleRevoke = (id: string) => {
      if (window.confirm('⚠️ آیا درخواست ابطال این دستور پرداخت را دارید؟')) {
          const prevOrders = [...localOrders];
          // 1. Optimistic Update
          setLocalOrders(prev => prev.map(o => o.id === id ? { ...o, status: OrderStatus.REVOCATION_PENDING_FINANCE, updatedAt: Date.now() } : o));
          setViewOrder(null);

          // 2. Background task
          apiCall(`/orders/${id}`, 'PUT', { status: OrderStatus.REVOCATION_PENDING_FINANCE, updatedAt: Date.now() })
              .then(() => refreshData())
              .catch(e => {
                  setLocalOrders(prevOrders);
                  alert('خطا در عملیات ابطال.');
              });
      }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('آیا از حذف این دستور پرداخت اطمینان دارید؟')) {
      const prevOrders = [...localOrders];
      // 1. Optimistic Update
      setLocalOrders(prev => prev.filter(o => o.id !== id));
      setViewOrder(null);

      // 2. Background task
      deleteOrder(id)
          .then(() => refreshData())
          .catch(e => {
              setLocalOrders(prevOrders);
              console.error("Delete failed", e);
              const msg = e.message || 'خطا در ارتباط با سرور';
              alert("خطا در حذف: " + msg); 
          });
    }
  };

  const handleEdit = (order: PaymentOrder) => {
      setEditingOrder(order);
      setViewOrder(null);
  };

  const handleExportCSV = () => {
      if (filteredOrders.length === 0) { alert("هیچ سفارشی موجود نیست."); return; }
      const headers = ["شماره دستور", "تاریخ", "گیرنده", "مبلغ", "شرکت پرداخت کننده", "بانک/روش", "شرح", "وضعیت", "درخواست کننده"];
      const rows = filteredOrders.map(o => {
          // SAFE GUARD for paymentDetails
          const details = Array.isArray(o.paymentDetails) ? o.paymentDetails : [];
          const banks = details.map(d => d.bankName || d.method).join(', ');
          return [o.trackingNumber, formatDate(o.date), o.payee, o.totalAmount, o.payingCompany || '-', banks, o.description, getStatusLabel(o.status), o.requester];
      });
      const csvContent = [headers.join(','), ...rows.map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `export_${activeTab}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const parseISODate = (iso: string) => parseSafeDate(iso);
  const getFilterDate = (d: {year: number, month: number, day: number}) => {
      return jalaliToGregorian(d.year, d.month, d.day);
  };

  const getOrdersForTab = () => {
      // Use safeOrders instead of orders
      let tabOrders = safeOrders;
      if (activeTab === 'archive') {
          tabOrders = safeOrders.filter(o => o.status === OrderStatus.APPROVED_CEO || o.status === OrderStatus.REVOKED);
      } else {
          tabOrders = safeOrders.filter(o => o.status !== OrderStatus.APPROVED_CEO && o.status !== OrderStatus.REVOKED);
      }
      
      if (currentStatusFilter) return tabOrders;

      if (currentUser.role === UserRole.ADMIN) return tabOrders;

      const roleBasedFilter = (o: PaymentOrder) => {
          if (o.requester === currentUser.fullName) return true;
          // Users with archive attachment permission must be able to view orders (especially archive orders) to attach documents
          if (permissions.canManageArchiveAttachments || currentUser.canManageArchiveAttachments) return true;
          if ((currentUser.role === UserRole.FINANCIAL || permissions.canApproveFinancial) && (o.status === OrderStatus.PENDING || o.status === OrderStatus.REVOCATION_PENDING_FINANCE)) return true;
          if ((currentUser.role === UserRole.MANAGER || permissions.canApproveManager) && (o.status === OrderStatus.APPROVED_FINANCE || o.status === OrderStatus.REVOCATION_PENDING_MANAGER)) return true;
          if ((currentUser.role === UserRole.CEO || permissions.canApproveCeo) && (o.status === OrderStatus.APPROVED_MANAGER || o.status === OrderStatus.REVOCATION_PENDING_CEO)) return true;
          return false;
      };
      
      if (permissions.canViewAll) return tabOrders;
      return tabOrders.filter(roleBasedFilter);
  };

  const filteredOrders = getOrdersForTab().filter(order => {
    if (currentStatusFilter) {
        if (currentStatusFilter === 'pending_all') {
            if (order.status === OrderStatus.APPROVED_CEO || order.status === OrderStatus.REJECTED || order.status === OrderStatus.REVOKED) return false;
        } 
        else if (currentStatusFilter === 'cartable_financial') {
            if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.REVOCATION_PENDING_FINANCE) return false;
        }
        else if (currentStatusFilter === 'cartable_manager') {
            if (order.status !== OrderStatus.APPROVED_FINANCE && order.status !== OrderStatus.REVOCATION_PENDING_MANAGER) return false;
        }
        else if (currentStatusFilter === 'cartable_ceo') {
            if (order.status !== OrderStatus.APPROVED_MANAGER && order.status !== OrderStatus.REVOCATION_PENDING_CEO) return false;
        }
        else {
            if (order.status !== currentStatusFilter) return false;
        }
    }
    
    if (companyFilter && order.payingCompany !== companyFilter) return false;

    const term = searchTerm.toLowerCase();
    // Safety check for strings
    const payee = order.payee || '';
    const desc = order.description || '';
    const track = order.trackingNumber ? order.trackingNumber.toString() : '';

    if (!payee.toLowerCase().includes(term) && !desc.toLowerCase().includes(term) && !track.includes(term)) return false;
    if (amountRange.min && order.totalAmount < deformatNumberString(amountRange.min)) return false;
    if (amountRange.max && order.totalAmount > deformatNumberString(amountRange.max)) return false;
    if (dateRange.enabled) {
        const orderDate = parseISODate(order.date);
        const fromDate = getFilterDate(dateRange.from);
        const toDate = getFilterDate(dateRange.to);
        orderDate.setHours(0,0,0,0);
        fromDate.setHours(0,0,0,0);
        toDate.setHours(23,59,59,999);
        if (orderDate < fromDate || orderDate > toDate) return false;
    }
    return true;
  }).sort((a, b) => {
    const aNum = Number(a.trackingNumber) || 0;
    const bNum = Number(b.trackingNumber) || 0;
    return bNum - aNum;
  });

  const totalFilteredAmount = filteredOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalFilteredCount = filteredOrders.length;

  const canExport = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.MANAGER;
  const years = Array.from({ length: 11 }, (_, i) => 1400 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  const getFilterLabel = (filter: any) => {
      if (filter === 'pending_all') return 'همه موارد فعال';
      if (filter === 'cartable_financial') return 'کارتابل مالی (عادی + ابطال)';
      if (filter === 'cartable_manager') return 'کارتابل مدیریت (عادی + ابطال)';
      if (filter === 'cartable_ceo') return 'کارتابل مدیرعامل (عادی + ابطال)';
      return getStatusLabel(filter);
  };

  // Orders statistics for Executive KPI cards
  const stats = React.useMemo(() => {
    const all = safeOrders;
    const totalCount = all.length;
    const totalAmount = all.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const myCartableCount = all.filter(o => canApprove(o)).length;
    const completedCount = all.filter(o => o.status === OrderStatus.APPROVED_CEO).length;
    const inProgressCount = all.filter(o => o.status !== OrderStatus.APPROVED_CEO && o.status !== OrderStatus.REJECTED && o.status !== OrderStatus.REVOKED).length;
    return { totalCount, totalAmount, myCartableCount, completedCount, inProgressCount };
  }, [safeOrders, currentUser, permissions]);

  return (
    <div className="space-y-5 animate-fade-in text-right dir-rtl" dir="rtl">
      {/* Executive Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-blue-500/20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/30 text-blue-300 rounded-2xl border border-blue-400/30">
            <CreditCard size={26} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight">مدیریت و کارتابل دستورات پرداخت</h1>
            <p className="text-xs text-blue-200/80 mt-0.5 font-medium">
              پیگیری تاییدات چندمرحله‌ای، کنترل سقف مبالغ، صدور چک و حواله، تسویه بانکی و بایگانی اسناد
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowAiScanner(true)}
            className="flex items-center gap-2 text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="اسکن هوشمند اسناد با هوش مصنوعی"
          >
            <Sparkles size={15} className="text-amber-300 animate-pulse" />
            <span>کم‌اسکنر هوشمند</span>
          </button>
          
          {canExport && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 text-xs font-bold bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl border border-white/15 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="دریافت فایل اکسل دستورات پرداخت"
            >
              <FileSpreadsheet size={15} />
              <span>خروجی اکسل</span>
            </button>
          )}

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${
              showFilters 
                ? 'bg-blue-600 text-white border-blue-400 shadow-md' 
                : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
            }`}
          >
            <Filter size={15} />
            <span>فیلترها</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-panel p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[11px] font-bold text-gray-500 block">کل دستورات پرداخت</span>
            <span className="text-xl font-black text-gray-800 dark:text-gray-100">{stats.totalCount} فقره</span>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl">
            <CreditCard size={20} />
          </div>
        </div>

        <div className={`glass-panel p-4 rounded-2xl border transition-all flex items-center justify-between shadow-2xs ${
          stats.myCartableCount > 0 
            ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/30 ring-1 ring-amber-300' 
            : 'border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80'
        }`}>
          <div>
            <span className="text-[11px] font-bold text-gray-500 block">در انتظار اقدام شما</span>
            <span className={`text-xl font-black ${stats.myCartableCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-200'}`}>
              {stats.myCartableCount} مورد
            </span>
          </div>
          <div className="p-3 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 rounded-xl">
            <ListChecks size={20} />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[11px] font-bold text-gray-500 block">دستورات جاری در گردش</span>
            <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">{stats.inProgressCount} فقره</span>
          </div>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <RefreshCcw size={20} />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[11px] font-bold text-gray-500 block">تایید نهایی / بایگانی</span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{stats.completedCount} فقره</span>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <Archive size={20} />
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl shadow-sm border border-gray-200/70 dark:border-gray-800 overflow-hidden bg-white/90 dark:bg-gray-900/90">
        <div className="p-4 md:p-6 border-b border-gray-100 dark:border-gray-800 flex flex-col gap-4">
            {/* Search and Tabs */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl border border-gray-200/70 dark:border-gray-700 w-full lg:w-auto">
                    <button 
                      onClick={() => { setActiveTab('current'); setCurrentStatusFilter(null); }} 
                      className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${
                        activeTab === 'current' 
                          ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-md' 
                          : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                      }`}
                    >
                      <ListChecks size={18} />
                      <span>کارتابل جاری</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono">
                        {stats.inProgressCount}
                      </span>
                    </button>
                    <button 
                      onClick={() => { setActiveTab('archive'); setCurrentStatusFilter(null); }} 
                      className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${
                        activeTab === 'archive' 
                          ? 'bg-white dark:bg-gray-900 text-emerald-600 dark:text-emerald-400 shadow-md' 
                          : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                      }`}
                    >
                      <Archive size={18} />
                      <span>بایگانی نهایی</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono">
                        {stats.completedCount}
                      </span>
                    </button>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-3 w-full lg:w-auto">
                    {currentStatusFilter && (
                      <div className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-3 py-2 rounded-xl text-xs flex items-center justify-between w-full md:w-auto gap-2 border border-amber-300 dark:border-amber-700">
                        <span>فیلتر: {getFilterLabel(currentStatusFilter)}</span>
                        <button onClick={() => setCurrentStatusFilter(null)} className="hover:scale-110 transition-transform"><X size={14}/></button>
                      </div>
                    )}
                    <div className="relative w-full md:w-72">
                      <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                      <input 
                        type="text" 
                        placeholder="جستجو بر اساس شماره، گیرنده، شرح..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        className="w-full pl-4 pr-10 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-xs sm:text-sm outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 transition-colors"
                      />
                    </div>
                </div>
            </div>
            
            {showFilters && (
                <div className="bg-gray-50 dark:bg-gray-900/40 text-gray-800 dark:text-gray-200 rounded-xl p-4 border grid grid-cols-1 md:grid-cols-3 gap-6 text-sm animate-fade-in">
                    <div>
                        <label className="block font-bold mb-2 flex items-center gap-2"><Building2 size={16}/> شرکت پرداخت کننده (محل پرداخت):</label>
                        <select className="w-full border rounded p-2 glass-panel" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
                            <option value="">-- همه شرکت‌ها --</option>
                            {availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block font-bold mb-2">مبلغ (ریال):</label>
                        <div className="flex gap-2">
                            <input placeholder="از..." className="w-full border rounded p-2 dir-ltr" value={formatNumberString(amountRange.min)} onChange={e=>setAmountRange({...amountRange, min:deformatNumberString(e.target.value).toString()})}/>
                            <span className="self-center">تا</span>
                            <input placeholder="تا..." className="w-full border rounded p-2 dir-ltr" value={formatNumberString(amountRange.max)} onChange={e=>setAmountRange({...amountRange, max:deformatNumberString(e.target.value).toString()})}/>
                        </div>
                    </div>
                    <div>
                         <div className="flex justify-between items-center mb-2"><label className="font-bold text-gray-700">محدوده تاریخ (شمسی):</label><div className="flex items-center gap-2"><input type="checkbox" id="enableDate" checked={dateRange.enabled} onChange={e => setDateRange({...dateRange, enabled: e.target.checked})}/><label htmlFor="enableDate" className="text-xs text-gray-500 cursor-pointer">فعال‌سازی</label></div></div>
                         <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${!dateRange.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                             <div><span className="text-xs text-gray-500 block mb-1">از تاریخ:</span><div className="flex gap-1"><select className="border rounded px-1 py-1 w-full text-xs" value={dateRange.from.year} onChange={e => setDateRange({...dateRange, from: {...dateRange.from, year: Number(e.target.value)}})}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select><select className="border rounded px-1 py-1 w-full text-xs" value={dateRange.from.month} onChange={e => setDateRange({...dateRange, from: {...dateRange.from, month: Number(e.target.value)}})}>{months.map(m => <option key={m} value={m}>{m}</option>)}</select><select className="border rounded px-1 py-1 w-full text-xs" value={dateRange.from.day} onChange={e => setDateRange({...dateRange, from: {...dateRange.from, day: Number(e.target.value)}})}>{days.map(d => <option key={d} value={d}>{d}</option>)}</select></div></div>
                             <div><span className="text-xs text-gray-500 block mb-1">تا تاریخ:</span><div className="flex gap-1"><select className="border rounded px-1 py-1 w-full text-xs" value={dateRange.to.year} onChange={e => setDateRange({...dateRange, to: {...dateRange.to, year: Number(e.target.value)}})}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select><select className="border rounded px-1 py-1 w-full text-xs" value={dateRange.to.month} onChange={e => setDateRange({...dateRange, to: {...dateRange.to, month: Number(e.target.value)}})}>{months.map(m => <option key={m} value={m}>{m}</option>)}</select><select className="border rounded px-1 py-1 w-full text-xs" value={dateRange.to.day} onChange={e => setDateRange({...dateRange, to: {...dateRange.to, day: Number(e.target.value)}})}>{days.map(d => <option key={d} value={d}>{d}</option>)}</select></div></div>
                         </div>
                    </div>
                </div>
            )}
        </div>

        {/* Summary Bar */}
        <div className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/60 p-3.5 flex flex-wrap justify-between items-center text-xs sm:text-sm px-6 gap-3">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-black">
                <Calculator size={18} className="text-blue-600 dark:text-blue-400" />
                <span>خلاصه گزارش فیلتر شده:</span>
            </div>
            <div className="flex gap-4 sm:gap-6 items-center">
                <div className="glass-panel px-3.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xs">
                    <span className="text-gray-500 text-xs ml-2">تعداد کل:</span>
                    <span className="font-mono font-black text-blue-700 dark:text-blue-400">{totalFilteredCount}</span>
                </div>
                <div className="glass-panel px-3.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xs">
                    <span className="text-gray-500 text-xs ml-2">مجموع مبلغ:</span>
                    <span className="font-mono font-black text-blue-700 dark:text-blue-400 text-base">{formatCurrency(totalFilteredAmount)}</span>
                </div>
            </div>
        </div>

        {/* --- RESPONSIVE LIST RENDERING --- */}
        {isMobile ? (
            <div className="p-4 bg-gray-50 min-h-[400px]">
                {filteredOrders.length === 0 ? (
                    <div className="text-center text-gray-400 py-10">موردی یافت نشد</div>
                ) : (
                    filteredOrders.map(order => (
                        <MobileOrderCard 
                            key={order.id} 
                            order={order} 
                            onView={setViewOrder} 
                            onDelete={handleDelete}
                            onApprove={handleApprove}
                            onReject={handleReject}
                            onArchive={setArchivingOrder}
                            canDelete={canDelete(order)}
                            canApprove={canApprove(order)}
                            isProcessing={processingId === order.id}
                        />
                    ))
                )}
            </div>
        ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right min-w-[800px]">
                <thead className="bg-gray-50 text-gray-600 font-medium">
                  <tr>
                    <th className="px-6 py-4">ش. دستور</th>
                    <th className="px-6 py-4">تاریخ</th>
                    <th className="px-6 py-4">گیرنده / شرح</th>
                    <th className="px-6 py-4">شرکت پرداخت کننده</th>
                    <th className="px-6 py-4">بانک / روش</th>
                    <th className="px-6 py-4">مبلغ کل</th>
                    <th className="px-6 py-4">وضعیت</th>
                    <th className="px-6 py-4 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOrders.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-8 text-gray-400">موردی یافت نشد</td></tr>
                  ) : (
                      filteredOrders.map((order) => {
                          const isRevocation = isRevocationStatus(order.status);
                          const rowClass = isRevocation ? "bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500 transition-colors" : "hover:bg-gray-50/80 transition-colors";
                          
                          // SAFE ACCESS for paymentDetails map
                          const paymentDetails = Array.isArray(order.paymentDetails) ? order.paymentDetails : [];

                          return (
                          <tr key={order.id} className={rowClass}>
                            <td className="px-6 py-4 font-mono text-gray-500">#{order.trackingNumber}</td>
                            <td className="px-6 py-4 text-gray-700">{formatDate(order.date)}</td>
                            <td className="px-6 py-4 font-medium text-gray-900 max-w-[200px]"><div className="truncate font-bold">{order.payee}</div><div className="text-xs text-gray-500 truncate mt-1">{order.description}</div><div className="flex gap-1 mt-1">{order.attachments?.map((a,i) => <a key={i} href={a.data} target="_blank" className="text-blue-500 text-[10px] bg-blue-50 px-1 rounded flex items-center"><Paperclip size={10}/></a>)}</div></td>
                            <td className="px-6 py-4 text-xs font-bold text-gray-700">{order.payingCompany || '-'}</td>
                            <td className="px-6 py-4 text-xs text-gray-600">
                                {paymentDetails.map((d, i) => (
                                    <div key={i} className="truncate max-w-[120px]" title={d.bankName || d.method}>
                                        {d.bankName ? d.bankName : d.method === PaymentMethod.CASH ? 'صندوق' : d.method}
                                    </div>
                                ))}
                            </td>
                            <td className="px-6 py-4 font-bold text-gray-900">{formatCurrency(order.totalAmount)}</td>
                            <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                                    order.status === OrderStatus.APPROVED_CEO ? 'bg-green-50 text-green-700 border-green-200' : 
                                    order.status === OrderStatus.REVOKED ? 'bg-gray-100 text-gray-700 border-gray-300' :
                                    order.status === OrderStatus.REJECTED ? 'bg-red-50 text-red-700 border-red-200' : 
                                    isRevocation ? 'bg-red-100 text-red-800 border-red-200 animate-pulse' :
                                    'bg-yellow-50 text-yellow-700 border-yellow-200'
                                }`}>
                                    {isRevocation && <RefreshCcw size={12} className="ml-1 animate-spin-slow"/>}
                                    {getStatusLabel(order.status)}
                                </span>
                                {order.rejectionReason && (
                                    <div className={`text-[10px] mt-1 max-w-[140px] truncate ${order.status === OrderStatus.REJECTED ? 'text-red-500' : 'text-amber-600 bg-amber-50 px-1 py-0.5 rounded border border-amber-200'}`} title={order.rejectionReason}>
                                        {order.status === OrderStatus.REJECTED ? `دلیل رد: ${order.rejectionReason}` : `⚠️ بازگشت: ${order.rejectionReason}`}
                                    </div>
                                )}
                            </td>
                            <td className="px-6 py-4"><div className="flex justify-center items-center gap-2">
                                 {canApprove(order) && (
                                    <>
                                       <button 
                                          onClick={(e) => { e.stopPropagation(); handleApprove(order.id, order.status); }} 
                                          disabled={processingId === order.id}
                                          className="p-1.5 bg-green-50 text-green-600 hover:bg-green-600 hover:text-white rounded-lg transition-all shadow-sm border border-green-100"
                                          title="تایید سریع"
                                       >
                                          {processingId === order.id ? <Loader2 size={16} className="animate-spin" /> : <ListChecks size={16}/>}
                                       </button>
                                       <button 
                                          onClick={(e) => { e.stopPropagation(); handleReject(order.id, order.status); }} 
                                          disabled={processingId === order.id}
                                          className="p-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-all shadow-sm border border-red-100"
                                          title={order.status === OrderStatus.APPROVED_MANAGER ? 'رد و بازگشت به کارتابل مدیریت' : (order.status === OrderStatus.APPROVED_FINANCE ? 'رد و بازگشت به کارتابل مالی' : 'رد درخواست')}
                                       >
                                          <XCircle size={16}/>
                                       </button>
                                    </>
                                 )}
                                 <button 
                                    onClick={() => setViewOrder(order)} 
                                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs transition-colors shadow-sm ${isRevocation ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                 >
                                    <Eye size={16}/> مشاهده
                                 </button>
                                 <button 
                                    onClick={(e) => { e.stopPropagation(); setArchivingOrder(order); }}
                                    className="p-1.5 bg-purple-50 text-purple-600 hover:bg-purple-600 hover:text-white rounded-lg transition-all shadow-sm border border-purple-100"
                                    title="اتچ فایل و بایگانی مدارک"
                                 >
                                    <Paperclip size={16}/>
                                 </button>
                                 {canDelete(order) && <button onClick={() => handleDelete(order.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="حذف"><Trash2 size={16}/></button>}
                            </div></td>
                          </tr>
                      )})
                  )}
                </tbody>
              </table>
            </div>
        )}
      </div>
      
      {viewOrder && (
          <PrintVoucher 
            order={viewOrder} 
            onClose={() => setViewOrder(null)} 
            settings={settings}
            currentUser={currentUser}
            onOrderUpdated={(updated) => {
                setViewOrder(updated);
                refreshData();
            }}
            onApprove={canApprove(viewOrder) ? () => handleApprove(viewOrder.id, viewOrder.status) : undefined}
            onReject={canApprove(viewOrder) ? () => handleReject(viewOrder.id, viewOrder.status) : undefined}
            onEdit={canEdit(viewOrder) ? () => handleEdit(viewOrder) : undefined}
            onRevoke={
                (!isRevocationStatus(viewOrder.status) && viewOrder.status !== OrderStatus.REVOKED && 
                (currentUser.role === UserRole.ADMIN || viewOrder.requester === currentUser.fullName)) 
                ? () => handleRevoke(viewOrder.id) 
                 : undefined
            }
          />
      )}
      
      {editingOrder && <EditOrderModal order={editingOrder} onClose={() => setEditingOrder(null)} onSave={refreshData} />}

      {archivingOrder && (
        <OrderArchiveModal
          order={archivingOrder}
          currentUser={currentUser}
          onClose={() => setArchivingOrder(null)}
          onOrderUpdated={() => {
            refreshData();
          }}
        />
      )}

      {showAiScanner && (
        <AiDocumentScannerModal
          isOpen={showAiScanner}
          onClose={() => setShowAiScanner(false)}
        />
      )}
    </div>
  );
};

export default ManageOrders;
