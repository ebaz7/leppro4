import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, UserRole, SystemSettings } from '../types';
import { getUsers, saveUser, updateUser, deleteUser } from '../services/authService';
import { getSettings, uploadFile } from '../services/storageService'; 
import { 
  UserPlus, Trash2, Shield, User as UserIcon, Download, Pencil, X, Save, 
  Container, Camera, Send, Phone, BellRing, Info, Package, ShoppingCart, 
  FileText, FileCheck2, FileSpreadsheet, Banknote, ShieldCheck, Search,
  CheckCircle2, Building2, Factory, Lock, KeyRound, Sparkles, Filter, 
  Layers, ChevronDown, ChevronUp, Eye, EyeOff, LayoutGrid, List, AlertCircle
} from 'lucide-react';
import { generateUUID } from '../constants';
import { apiCall } from '../services/apiService';

const ManageUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null); 
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<'profile' | 'roles' | 'permissions'>('profile');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const initialFormState = { 
    username: '', 
    password: '', 
    fullName: '', 
    role: UserRole.USER as string, 
    roles: [UserRole.USER] as string[],
    canManageTrade: false, 
    canManageSales: false, 
    canManagePurchase: false,
    canManageParts: false,
    canManageArchiveAttachments: false,
    canManageProformas: false,
    canSelectProforma: false,
    canApproveCEO: false,
    canApproveCommercialManager: false,
    canCommercialFinalize: false,
    canApproveFactoryDecision: false,
    canApproveFactory: false,
    canApproveFactoryFinal: false,
    canViewPricingAndInvoices: false,
    canManageZanjanPurchasing: false,
    canExecuteBuyerZanjan: false,
    canCreatePurchaseRequest: false,
    canApproveWarehouseKeeper: false,
    canWarehouseFinalize: false,
    canApproveTechnical: false,
    canApproveShiftLeader: false,
    canCheckQC: false,
    canRegisterEntry: false,
    scopeZanjanOnly: false,
    scopeTehranOnly: false,
    canAccessSayanRegistrations: false,
    canSayanPreInvoices: false,
    canSayanRegisterCheque: false,
    canSayanEditReceipt: false,
    canSayanDeleteReceipt: false,
    canSayanApproveAccounting: false,
    canSayanApproveCeo: false,
    canSayanFinalApprove: false,
    receiveNotifications: true, 
    canAccessSecretariat: false,
    secretariatAllowedCompanies: [] as string[],
    canManageSecretariatSettings: false,
    avatar: '', 
    signatureUrl: '', 
    telegramChatId: '', 
    baleChatId: '', 
    phoneNumber: '' 
  };

  const [formData, setFormData] = useState(initialFormState);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const [usersData, settingsData] = await Promise.all([getUsers(), getSettings()]);
      setUsers(usersData);
      setSettings(settingsData);
    } catch (err) {
      console.error('Error loading users:', err);
    }
  };

  useEffect(() => { loadData(); }, []);
  
  const handleSubmit = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    let primaryRole = formData.role;
    const rolesArray = formData.roles && formData.roles.length > 0 ? formData.roles : [primaryRole];
    
    // Priority role mapping
    if (rolesArray.includes(UserRole.ADMIN)) {
      primaryRole = UserRole.ADMIN;
    } else if (rolesArray.includes(UserRole.CEO)) {
      primaryRole = UserRole.CEO;
    } else if (rolesArray.length > 0) {
      primaryRole = rolesArray[0];
    }

    const payload = {
      ...formData,
      role: primaryRole,
      roles: rolesArray
    };

    if (editingId) { 
      const updatedUser: User = { id: editingId, ...payload }; 
      await updateUser(updatedUser); 
      setSaveSuccessMessage(`اطلاعات کاربر «${formData.fullName}» با موفقیت ذخیره شد.`);
      setEditingId(null); 
    } else { 
      const user: User = { id: generateUUID(), ...payload }; 
      await saveUser(user); 
      setSaveSuccessMessage(`کاربر جدید «${formData.fullName}» با موفقیت ایجاد گردید.`);
    } 

    await loadData(); 
    setFormData(initialFormState);
    setIsFormOpen(false);
    setTimeout(() => setSaveSuccessMessage(null), 4000);
  };
  
  const handleEditClick = (user: User) => { 
    setEditingId(user.id); 
    const rolesArray = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    setFormData({ 
      username: user.username, 
      password: user.password || '', 
      fullName: user.fullName, 
      role: user.role, 
      roles: rolesArray,
      canManageTrade: user.canManageTrade || false, 
      canManageSales: user.canManageSales || false, 
      canManagePurchase: user.canManagePurchase || false,
      canManageParts: user.canManageParts || false,
      canManageArchiveAttachments: user.canManageArchiveAttachments || false,
      canManageProformas: user.canManageProformas || false,
      canSelectProforma: user.canSelectProforma || false,
      canApproveCEO: user.canApproveCEO || false,
      canApproveCommercialManager: user.canApproveCommercialManager || false,
      canCommercialFinalize: user.canCommercialFinalize || false,
      canApproveFactoryDecision: user.canApproveFactoryDecision || false,
      canApproveFactory: user.canApproveFactory || false,
      canApproveFactoryFinal: user.canApproveFactoryFinal || false,
      canViewPricingAndInvoices: user.canViewPricingAndInvoices || false,
      canManageZanjanPurchasing: user.canManageZanjanPurchasing || false,
      canExecuteBuyerZanjan: user.canExecuteBuyerZanjan || false,
      canCreatePurchaseRequest: user.canCreatePurchaseRequest || false,
      canApproveWarehouseKeeper: user.canApproveWarehouseKeeper || false,
      canWarehouseFinalize: user.canWarehouseFinalize || false,
      canApproveTechnical: user.canApproveTechnical || false,
      canApproveShiftLeader: user.canApproveShiftLeader || false,
      canCheckQC: user.canCheckQC || false,
      canRegisterEntry: user.canRegisterEntry || false,
      scopeZanjanOnly: user.scopeZanjanOnly || false,
      scopeTehranOnly: user.scopeTehranOnly || false,
      canAccessSayanRegistrations: user.canAccessSayanRegistrations || false,
      canSayanPreInvoices: user.canSayanPreInvoices || false,
      canSayanRegisterCheque: user.canSayanRegisterCheque || false,
      canSayanEditReceipt: user.canSayanEditReceipt || false,
      canSayanDeleteReceipt: user.canSayanDeleteReceipt || false,
      canSayanApproveAccounting: user.canSayanApproveAccounting || false,
      canSayanApproveCeo: user.canSayanApproveCeo || false,
      canSayanFinalApprove: user.canSayanFinalApprove || false,
      receiveNotifications: user.receiveNotifications !== false, 
      canAccessSecretariat: user.canAccessSecretariat || false,
      canManageSecretariatSettings: user.canManageSecretariatSettings || false,
      secretariatAllowedCompanies: user.secretariatAllowedCompanies || [],
      avatar: user.avatar || '', 
      signatureUrl: user.signatureUrl || '',
      telegramChatId: user.telegramChatId || '', 
      baleChatId: user.baleChatId || '', 
      phoneNumber: user.phoneNumber || '' 
    }); 
    setIsFormOpen(true);
    setActiveFormTab('profile');
    setTimeout(() => {
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };
  
  const handleCancelEdit = () => { 
    setEditingId(null); 
    setFormData(initialFormState); 
    setIsFormOpen(false);
  };

  const handleOpenCreateForm = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setIsFormOpen(true);
    setActiveFormTab('profile');
    setTimeout(() => {
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleDeleteUser = async (user: User) => {
    if (user.username === 'admin') {
      alert('کاربر اصلی مدیر سیستم (admin) قابل حذف نمی‌باشد.');
      return;
    }
    setDeleteConfirmUser(user);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmUser) return;
    await deleteUser(deleteConfirmUser.id);
    setDeleteConfirmUser(null);
    await loadData();
    setSaveSuccessMessage('کاربر با موفقیت حذف شد.');
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  const handleBackup = async () => { 
    try { 
      const backupData = await apiCall<any>('/backup'); 
      const jsonString = JSON.stringify(backupData, null, 2); 
      const blob = new Blob([jsonString], { type: 'application/json' }); 
      const url = URL.createObjectURL(blob); 
      const a = document.createElement('a'); 
      a.href = url; 
      a.download = `backup_payment_system_${new Date().toISOString().split('T')[0]}.json`; 
      document.body.appendChild(a); 
      a.click(); 
      document.body.removeChild(a); 
      URL.revokeObjectURL(url); 
    } catch (e) { 
      alert('خطا در دریافت فایل پشتیبان'); 
    } 
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try { 
        const result = await uploadFile(file.name, base64); 
        setFormData({ ...formData, avatar: result.url }); 
      } catch (error) { 
        alert('خطا در آپلود تصویر'); 
      } finally { 
        setUploadingAvatar(false); 
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingSignature(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try { 
        const result = await uploadFile(file.name, base64); 
        setFormData({ ...formData, signatureUrl: result.url }); 
      } catch (error) { 
        alert('خطا در آپلود امضا'); 
      } finally { 
        setUploadingSignature(false); 
      }
    };
    reader.readAsDataURL(file);
  };

  const getRoleLabel = (roleId: string) => {
    if (!roleId) return '';
    if (settings?.customRoleNames?.[roleId]) {
      return settings.customRoleNames[roleId];
    }
    const custom = settings?.customRoles?.find((r: any) => r.id === roleId || r.name === roleId);
    if (custom) {
      return settings?.customRoleNames?.[custom.id] || custom.label || custom.name;
    }
    switch (roleId?.toLowerCase()) {
      case UserRole.ADMIN:
      case 'admin': return 'مدیر سیستم';
      case UserRole.CEO:
      case 'ceo': return 'مدیر عامل';
      case UserRole.FINANCIAL:
      case 'financial': return 'مدیر مالی';
      case UserRole.MANAGER:
      case 'manager': return 'مدیر داخلی';
      case UserRole.SALES_MANAGER:
      case 'sales_manager': return 'مدیر فروش';
      case UserRole.FACTORY_MANAGER:
      case 'factory_manager': return 'مدیر کارخانه';
      case UserRole.WAREHOUSE_KEEPER:
      case 'warehouse_keeper': return 'انباردار'; 
      case UserRole.SECURITY_HEAD:
      case 'security_head': return 'سرپرست انتظامات';
      case UserRole.SECURITY_GUARD:
      case 'security_guard': return 'نگهبان';
      case UserRole.QC:
      case 'qc': return 'کنترل کیفی';
      case UserRole.COMMERCIAL:
      case 'commercial': return 'بازرگانی';
      case UserRole.USER:
      case 'user': return 'کاربر عادی';
      default:
        return roleId;
    }
  };

  const getRoleBadgeStyle = (roleId: string) => {
    switch (roleId?.toLowerCase()) {
      case UserRole.ADMIN:
      case 'admin':
        return 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800';
      case UserRole.CEO:
      case 'ceo':
        return 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case UserRole.FACTORY_MANAGER:
      case 'factory_manager':
        return 'bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-800';
      case UserRole.COMMERCIAL:
      case 'commercial':
        return 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800';
      case UserRole.FINANCIAL:
      case 'financial':
        return 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      case UserRole.QC:
      case 'qc':
        return 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800';
      case UserRole.WAREHOUSE_KEEPER:
      case 'warehouse_keeper':
        return 'bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700';
    }
  };

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const q = searchQuery.trim().toLowerCase();
      const matchSearch = !q || 
        (u.fullName && u.fullName.toLowerCase().includes(q)) ||
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.phoneNumber && u.phoneNumber.includes(q)) ||
        (u.roles && u.roles.some(r => r && r.toLowerCase().includes(q)));

      if (!matchSearch) return false;

      if (selectedRoleFilter === 'ALL') return true;
      if (selectedRoleFilter === 'ADMIN') return u.role === UserRole.ADMIN || (u.roles && u.roles.includes(UserRole.ADMIN));
      if (selectedRoleFilter === 'TEHRAN') return u.scopeTehranOnly || u.canApproveCEO || u.canApproveCommercialManager || u.canManageProformas;
      if (selectedRoleFilter === 'ZANJAN') return u.scopeZanjanOnly || u.canApproveFactory || u.canManageZanjanPurchasing || u.canExecuteBuyerZanjan || u.canApproveFactoryDecision;
      if (selectedRoleFilter === 'SALES') return u.canManageSales || u.role === UserRole.SALES_MANAGER || (u.roles && u.roles.includes(UserRole.SALES_MANAGER));
      if (selectedRoleFilter === 'WAREHOUSE') return u.role === UserRole.WAREHOUSE_KEEPER || (u.roles && u.roles.includes(UserRole.WAREHOUSE_KEEPER));
      
      return true;
    });
  }, [users, searchQuery, selectedRoleFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter(u => u.role === UserRole.ADMIN || (u.roles && u.roles.includes(UserRole.ADMIN))).length;
    const tehranUsers = users.filter(u => u.scopeTehranOnly || u.canApproveCEO || u.canApproveCommercialManager || u.canManageProformas).length;
    const zanjanUsers = users.filter(u => u.scopeZanjanOnly || u.canApproveFactory || u.canManageZanjanPurchasing || u.canExecuteBuyerZanjan).length;
    return { total, admins, tehranUsers, zanjanUsers };
  }, [users]);

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-4 text-right dir-rtl" dir="rtl">
      
      {/* Top Header & Stat Cards */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-indigo-500/20">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-indigo-600/30 text-indigo-300 rounded-2xl border border-indigo-400/30">
              <ShieldCheck size={26} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight">مدیریت جامع کاربران و سطوح دسترسی</h1>
              <p className="text-xs text-indigo-200/80 mt-0.5 font-medium">
                تعریف کاربران، تخصیص نقش‌های چندگانه، مجوزهای شعب (تهران و زنجان) و امضای دیجیتال
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button 
            onClick={handleBackup} 
            className="flex items-center gap-2 text-xs font-bold bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl border border-white/15 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="دریافت خروجی JSON از کاربران و اطلاعات"
          >
            <Download size={15} />
            <span>پشتیبان‌گیری</span>
          </button>
          
          <button 
            onClick={() => {
              if (isFormOpen && !editingId) {
                setIsFormOpen(false);
              } else {
                handleOpenCreateForm();
              }
            }}
            className="flex items-center gap-2 text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-900/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <UserPlus size={16} />
            <span>{isFormOpen && !editingId ? 'بستن فرم' : 'تعریف کاربر جدید'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-panel p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[11px] font-bold text-gray-500 block">کل کاربران سیستم</span>
            <span className="text-xl font-black text-gray-800 dark:text-gray-100">{stats.total} نفر</span>
          </div>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-xl">
            <UserIcon size={20} />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[11px] font-bold text-gray-500 block">مدیران ارشد سیستم</span>
            <span className="text-xl font-black text-purple-600 dark:text-purple-400">{stats.admins} نفر</span>
          </div>
          <div className="p-3 bg-purple-50 dark:bg-purple-950/50 text-purple-600 rounded-xl">
            <Shield size={20} />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[11px] font-bold text-gray-500 block">دسترسی شعبه بازرگانی تهران</span>
            <span className="text-xl font-black text-sky-600 dark:text-sky-400">{stats.tehranUsers} کاربر</span>
          </div>
          <div className="p-3 bg-sky-50 dark:bg-sky-950/50 text-sky-600 rounded-xl">
            <Building2 size={20} />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[11px] font-bold text-gray-500 block">دسترسی کارخانه زنجان</span>
            <span className="text-xl font-black text-teal-600 dark:text-teal-400">{stats.zanjanUsers} کاربر</span>
          </div>
          <div className="p-3 bg-teal-50 dark:bg-teal-950/50 text-teal-600 rounded-xl">
            <Factory size={20} />
          </div>
        </div>
      </div>

      {/* Success Alert */}
      {saveSuccessMessage && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl flex items-center gap-3 text-emerald-800 dark:text-emerald-300 font-bold text-xs animate-bounce">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* ADD / EDIT USER FORM (Expandable Clean Panel) */}
      {isFormOpen && (
        <div ref={formTopRef} className="glass-panel rounded-3xl shadow-xl border-2 border-indigo-200 dark:border-indigo-900/70 bg-white dark:bg-gray-900 overflow-hidden transition-all animate-fade-in">
          {/* Form Header */}
          <div className="px-6 py-5 bg-gradient-to-r from-gray-50 via-indigo-50/40 to-gray-50 dark:from-gray-800 dark:via-indigo-950/30 dark:to-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-2xl ${editingId ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'}`}>
                {editingId ? <Pencil size={20} /> : <UserPlus size={20} />}
              </div>
              <div>
                <h2 className="text-base font-black text-gray-900 dark:text-white">
                  {editingId ? `ویرایش کاربر: ${formData.fullName || formData.username}` : 'تعریف کاربر جدید در سیستم'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  اطلاعات هویتی، نقش‌ها و ماتریس دسترسی‌ها را تعیین و ذخیره فرمایید.
                </p>
              </div>
            </div>

            <button 
              type="button" 
              onClick={handleCancelEdit} 
              className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-200/60 dark:hover:bg-gray-700 transition-colors"
              title="بستن فرم"
            >
              <X size={20} />
            </button>
          </div>

          {/* Form Navigation Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-850 px-6 gap-2">
            <button
              type="button"
              onClick={() => setActiveFormTab('profile')}
              className={`py-3.5 px-4 text-xs font-black border-b-2 flex items-center gap-2 transition-all ${activeFormTab === 'profile' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-900 rounded-t-xl' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              <UserIcon size={15} />
              <span>۱. مشخصات فردی و امنیتی</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFormTab('roles')}
              className={`py-3.5 px-4 text-xs font-black border-b-2 flex items-center gap-2 transition-all ${activeFormTab === 'roles' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-900 rounded-t-xl' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              <Shield size={15} />
              <span>۲. انتخاب نقش‌های کاربری (چندگانه)</span>
              <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.2 rounded-full font-black">
                {formData.roles?.length || 1}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFormTab('permissions')}
              className={`py-3.5 px-4 text-xs font-black border-b-2 flex items-center gap-2 transition-all ${activeFormTab === 'permissions' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-900 rounded-t-xl' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              <Layers size={15} />
              <span>۳. ماتریس دسترسی‌ها و شعب</span>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="p-6">
              {/* TAB 1: Profile & Auth */}
              {activeFormTab === 'profile' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    
                    {/* Avatars & Digital Signatures Box */}
                    <div className="p-5 bg-slate-50 dark:bg-gray-800/60 rounded-2xl border border-slate-200 dark:border-gray-700 flex flex-col items-center justify-center gap-5">
                      {/* Avatar */}
                      <div className="flex flex-col items-center text-center">
                        <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden relative group border-2 border-indigo-200 dark:border-indigo-800 shadow-sm">
                          {formData.avatar ? (
                            <img src={formData.avatar} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <UserIcon size={36} />
                            </div>
                          )}
                          <div 
                            className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-white text-[10px]"
                            onClick={() => avatarInputRef.current?.click()}
                          >
                            <Camera size={18} />
                            <span>تغییر</span>
                          </div>
                        </div>
                        <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
                        <button 
                          type="button" 
                          onClick={() => avatarInputRef.current?.click()} 
                          className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                          disabled={uploadingAvatar}
                        >
                          {uploadingAvatar ? 'در حال آپلود...' : 'انتخاب تصویر پروفایل'}
                        </button>
                      </div>

                      <div className="w-full border-t border-gray-200 dark:border-gray-700 my-1"></div>

                      {/* Signature */}
                      <div className="flex flex-col items-center text-center w-full">
                        <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1.5">امضای الکترونیکی کاربر</span>
                        <div className="w-full h-16 rounded-xl bg-white dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-600 overflow-hidden relative group flex items-center justify-center p-2">
                          {formData.signatureUrl ? (
                            <img src={formData.signatureUrl} alt="Signature" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <span className="text-[10px] text-gray-400">امضا ثبت نشده</span>
                          )}
                          <div 
                            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-white text-xs gap-1"
                            onClick={() => signatureInputRef.current?.click()}
                          >
                            <Camera size={14} />
                            <span>آپلود امضا</span>
                          </div>
                        </div>
                        <input type="file" ref={signatureInputRef} className="hidden" accept="image/*" onChange={handleSignatureChange} />
                        <button 
                          type="button" 
                          onClick={() => signatureInputRef.current?.click()} 
                          className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                          disabled={uploadingSignature}
                        >
                          {uploadingSignature ? 'در حال آپلود...' : 'آپلود تصویر امضا'}
                        </button>
                      </div>
                    </div>

                    {/* Personal & Auth Inputs */}
                    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                          نام و نام خانوادگی <span className="text-rose-500">*</span>
                        </label>
                        <input 
                          required 
                          type="text" 
                          value={formData.fullName} 
                          onChange={(e) => setFormData({...formData, fullName: e.target.value})} 
                          className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                          placeholder="مثال: محمد ابراهیم حیدری" 
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                          نام کاربری (جهت ورود) <span className="text-rose-500">*</span>
                        </label>
                        <input 
                          required 
                          type="text" 
                          value={formData.username} 
                          onChange={(e) => setFormData({...formData, username: e.target.value})} 
                          className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-left dir-ltr focus:ring-2 focus:ring-indigo-500 outline-none" 
                          placeholder="username" 
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center justify-between">
                          <span>رمز عبور {editingId ? '(اختیاری جهت تغییر)' : '*'}</span>
                          <button 
                            type="button" 
                            onClick={() => setShowPassword(!showPassword)}
                            className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                          >
                            {showPassword ? <EyeOff size={12}/> : <Eye size={12}/>}
                            <span>{showPassword ? 'مخفی' : 'نمایش'}</span>
                          </button>
                        </label>
                        <input 
                          required={!editingId} 
                          type={showPassword ? 'text' : 'password'} 
                          value={formData.password} 
                          onChange={(e) => setFormData({...formData, password: e.target.value})} 
                          className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-left dir-ltr focus:ring-2 focus:ring-indigo-500 outline-none" 
                          placeholder={editingId ? 'بدون تغییر' : 'password'} 
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                          <Phone size={13} className="text-indigo-500" />
                          <span>شماره تماس (واتساپ / تماس)</span>
                        </label>
                        <input 
                          type="text" 
                          value={formData.phoneNumber} 
                          onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})} 
                          className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-left dir-ltr focus:ring-2 focus:ring-indigo-500 outline-none" 
                          placeholder="0912..." 
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                          <Send size={13} className="text-blue-500" />
                          <span>شناسه بله (Bale Chat ID)</span>
                        </label>
                        <input 
                          type="text" 
                          value={formData.baleChatId} 
                          onChange={(e) => setFormData({...formData, baleChatId: e.target.value})} 
                          className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-left dir-ltr focus:ring-2 focus:ring-indigo-500 outline-none" 
                          placeholder="12345678" 
                        />
                      </div>

                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                          <Send size={13} className="text-sky-500" />
                          <span>شناسه تلگرام (Telegram Chat ID)</span>
                        </label>
                        <input 
                          type="text" 
                          value={formData.telegramChatId} 
                          onChange={(e) => setFormData({...formData, telegramChatId: e.target.value})} 
                          className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-left dir-ltr focus:ring-2 focus:ring-indigo-500 outline-none" 
                          placeholder="Chat ID" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Roles Assignment */}
              {activeFormTab === 'roles' && (
                <div className="space-y-5 animate-fade-in">
                  <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-2xl p-4 flex items-start gap-3">
                    <Info size={20} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
                      <strong>راهنمای تخصیص نقش‌های چندگانه:</strong><br/>
                      شما می‌توانید چندین نقش را به طور همزمان برای یک کاربر انتخاب نمایید. مجوزهای تمام نقش‌ها تجمیع شده و در کارتابل‌ها، دکمه‌های تایید خرید و بخش‌های مرتبط فعال خواهند بود.
                    </div>
                  </div>

                  <div className="space-y-4">
                    <span className="text-xs font-black text-gray-800 dark:text-gray-200 block border-b pb-2">
                      ✅ نقش‌های سیستمی و سازمانی
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {[
                        { id: UserRole.ADMIN, desc: 'دسترسی کامل به تمام بخش‌ها و تنظیمات' },
                        { id: UserRole.CEO, desc: 'تاییدات نهایی، مجوزهای استعلام و پرداخت' },
                        { id: UserRole.FACTORY_MANAGER, desc: 'مدیریت کارخانه زنجان و تاییدات خرید' },
                        { id: UserRole.FINANCIAL, desc: 'مدیریت مالی، حسابداری و تایید اسناد' },
                        { id: UserRole.COMMERCIAL, desc: 'بازرگانی مرکزی تهران و ثبت پیش‌فاکتور' },
                        { id: UserRole.SALES_MANAGER, desc: 'مدیریت سفارشات، قیمت‌گذاری و مشتریان' },
                        { id: UserRole.WAREHOUSE_KEEPER, desc: 'مدیریت انبار، کاردکس و رسید کالا' },
                        { id: UserRole.QC, desc: 'کنترل کیفی قطعات و کالاهای ورودی' },
                        { id: UserRole.SECURITY_HEAD, desc: 'سرپرست انتظامات و مجوزهای ورود و خروج' },
                        { id: UserRole.SECURITY_GUARD, desc: 'نگهبانی و ثبت تردد خودروها' },
                        { id: UserRole.MANAGER, desc: 'مدیر داخلی' },
                        { id: UserRole.USER, desc: 'کاربر عادی سیستم' }
                      ].map(item => {
                        const isChecked = formData.roles ? formData.roles.includes(item.id) : formData.role === item.id;
                        return (
                          <label 
                            key={item.id} 
                            className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-2 ${isChecked ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-sm' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 bg-white dark:bg-gray-800/40'}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                                <Shield size={14} className={isChecked ? 'text-indigo-600' : 'text-gray-400'} />
                                {getRoleLabel(item.id)}
                              </span>
                              <input 
                                type="checkbox" 
                                checked={isChecked} 
                                onChange={() => {
                                  let currentRoles = formData.roles ? [...formData.roles] : [formData.role];
                                  if (currentRoles.includes(item.id)) {
                                    if (currentRoles.length > 1) {
                                      currentRoles = currentRoles.filter(x => x !== item.id);
                                    }
                                  } else {
                                    currentRoles.push(item.id);
                                  }
                                  setFormData({ ...formData, roles: currentRoles });
                                }}
                                className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" 
                              />
                            </div>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                              {item.desc}
                            </p>
                          </label>
                        );
                      })}
                    </div>

                    {settings?.customRoles && settings.customRoles.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
                        <span className="text-xs font-black text-amber-700 dark:text-amber-400 block">
                          ✏️ نقش‌های سفارشی تعریف‌شده در تنظیمات
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {settings.customRoles.map(role => {
                            const isChecked = formData.roles ? formData.roles.includes(role.id) : formData.role === role.id;
                            return (
                              <label 
                                key={role.id} 
                                className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${isChecked ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/40'}`}
                              >
                                <span className="text-xs font-black text-gray-900 dark:text-gray-100">
                                  {getRoleLabel(role.id) || role.label}
                                </span>
                                <input 
                                  type="checkbox" 
                                  checked={isChecked} 
                                  onChange={() => {
                                    let currentRoles = formData.roles ? [...formData.roles] : [formData.role];
                                    if (currentRoles.includes(role.id)) {
                                      if (currentRoles.length > 1) {
                                        currentRoles = currentRoles.filter(x => x !== role.id);
                                      }
                                    } else {
                                      currentRoles.push(role.id);
                                    }
                                    setFormData({ ...formData, roles: currentRoles });
                                  }}
                                  className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500" 
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: Permissions Matrix & Branch Scopes */}
              {activeFormTab === 'permissions' && (
                <div className="space-y-6 animate-fade-in">
                  
                  {/* Grid of 4 clear cards for permissions */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    
                    {/* CARD 1: Tehran Commercial Branch */}
                    <div className="p-5 bg-gradient-to-br from-sky-50/80 to-white dark:from-sky-950/30 dark:to-gray-900 rounded-3xl border-2 border-sky-200 dark:border-sky-800/70 shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-sky-200 dark:border-sky-800 pb-3">
                        <div className="flex items-center gap-2 text-sky-900 dark:text-sky-200 font-black text-sm">
                          <Building2 size={18} className="text-sky-600" />
                          <span>تاییدها و دسترسی‌های شعبه بازرگانی تهران</span>
                        </div>
                        <span className="text-[10px] bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300 font-bold px-2 py-0.5 rounded-full">
                          تهران
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        <label className="flex items-center gap-2.5 text-xs text-sky-950 dark:text-sky-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-sky-200/80 dark:border-sky-800 cursor-pointer hover:bg-sky-50">
                          <input type="checkbox" checked={formData.canApproveCEO} onChange={e => setFormData({...formData, canApproveCEO: e.target.checked})} className="w-4 h-4 text-sky-600 rounded" />
                          <span className="font-bold">👑 تایید اولیه و مجوز استعلام (مدیرعامل تهران)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-purple-950 dark:text-purple-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-purple-200/80 dark:border-purple-800 cursor-pointer hover:bg-purple-50">
                          <input type="checkbox" checked={formData.canApproveCommercialManager} onChange={e => setFormData({...formData, canApproveCommercialManager: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                          <span className="font-bold">👔 بررسی و تایید پیش‌فاکتورها (مدیر بازرگانی تهران)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-indigo-900 dark:text-indigo-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800 cursor-pointer hover:bg-indigo-50">
                          <input type="checkbox" checked={formData.canManageProformas} onChange={e => setFormData({...formData, canManageProformas: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded" />
                          <span>💼 ثبت پیش‌فاکتورها و استعلام (بازرگانی تهران)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-sky-900 dark:text-sky-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-sky-200/80 dark:border-sky-800 cursor-pointer hover:bg-sky-50">
                          <input type="checkbox" checked={formData.canSelectProforma} onChange={e => setFormData({...formData, canSelectProforma: e.target.checked})} className="w-4 h-4 text-sky-600 rounded" />
                          <span>🎯 تایید و انتخاب گزینه نهایی خرید تهران</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-indigo-900 dark:text-indigo-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800 cursor-pointer hover:bg-indigo-50">
                          <input type="checkbox" checked={formData.canCommercialFinalize} onChange={e => setFormData({...formData, canCommercialFinalize: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded" />
                          <span>📁 تایید نهایی و بایگانی اسناد بازرگانی تهران</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-gray-300 dark:border-gray-700 cursor-pointer">
                          <input type="checkbox" checked={formData.scopeTehranOnly} onChange={e => setFormData({...formData, scopeTehranOnly: e.target.checked, scopeZanjanOnly: e.target.checked ? false : formData.scopeZanjanOnly})} className="w-4 h-4 text-sky-600 rounded" />
                          <span className="font-black text-sky-700 dark:text-sky-400">🏢 محدودیت حوزه: فقط خریدهای بازرگانی تهران</span>
                        </label>
                      </div>
                    </div>

                    {/* CARD 2: Zanjan Factory Branch */}
                    <div className="p-5 bg-gradient-to-br from-teal-50/80 to-white dark:from-teal-950/30 dark:to-gray-900 rounded-3xl border-2 border-teal-200 dark:border-teal-800/70 shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-teal-200 dark:border-teal-800 pb-3">
                        <div className="flex items-center gap-2 text-teal-900 dark:text-teal-200 font-black text-sm">
                          <Factory size={18} className="text-teal-600" />
                          <span>تاییدها و دسترسی‌های کارخانه زنجان (تامین محلی)</span>
                        </div>
                        <span className="text-[10px] bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-300 font-bold px-2 py-0.5 rounded-full">
                          کارخانه زنجان
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        <label className="flex items-center gap-2.5 text-xs text-teal-950 dark:text-teal-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-teal-200/80 dark:border-teal-800 cursor-pointer hover:bg-teal-50">
                          <input type="checkbox" checked={formData.canCreatePurchaseRequest} onChange={e => setFormData({...formData, canCreatePurchaseRequest: e.target.checked})} className="w-4 h-4 text-teal-600 rounded" />
                          <span className="font-bold">📝 ثبت درخواست خرید جدید در کارخانه (سرشیفت / متقاضی)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-indigo-950 dark:text-indigo-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800 cursor-pointer hover:bg-indigo-50">
                          <input type="checkbox" checked={formData.canApproveShiftLeader} onChange={e => setFormData({...formData, canApproveShiftLeader: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded" />
                          <span className="font-bold">👷 تایید سرپرست خط (مرحله ۱ پس از ثبت سرشیفت)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-indigo-950 dark:text-indigo-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800 cursor-pointer hover:bg-indigo-50">
                          <input type="checkbox" checked={formData.canApproveTechnical} onChange={e => setFormData({...formData, canApproveTechnical: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded" />
                          <span className="font-bold">🔧 بررسی و تایید فنی نت (مرحله ۲)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-teal-950 dark:text-teal-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-teal-200/80 dark:border-teal-800 cursor-pointer hover:bg-teal-50">
                          <input type="checkbox" checked={formData.canApproveWarehouseKeeper} onChange={e => setFormData({...formData, canApproveWarehouseKeeper: e.target.checked})} className="w-4 h-4 text-teal-600 rounded" />
                          <span className="font-bold">🏬 بررسی موجودی انبار کارخانه (انباردار قطعات - مرحله ۳)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-amber-950 dark:text-amber-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-amber-200/80 dark:border-amber-800 cursor-pointer hover:bg-amber-50">
                          <input type="checkbox" checked={formData.canManageParts} onChange={e => setFormData({...formData, canManageParts: e.target.checked})} className="w-4 h-4 text-amber-600 rounded" />
                          <span className="font-bold">📦 تعریف و کدینگ کالا (کارخانه / انبار)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-teal-950 dark:text-teal-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-teal-200/80 dark:border-teal-800 cursor-pointer hover:bg-teal-50">
                          <input type="checkbox" checked={formData.canWarehouseFinalize} onChange={e => setFormData({...formData, canWarehouseFinalize: e.target.checked})} className="w-4 h-4 text-teal-600 rounded" />
                          <span className="font-bold">📥 رسید انبار نهایی و ورود قطعات به انبار کارخانه (انباردار)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-teal-950 dark:text-teal-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-teal-200/80 dark:border-teal-800 cursor-pointer hover:bg-teal-50">
                          <input type="checkbox" checked={formData.canApproveFactoryDecision} onChange={e => setFormData({...formData, canApproveFactoryDecision: e.target.checked})} className="w-4 h-4 text-teal-600 rounded" />
                          <span className="font-bold">🏭 تعیین مسیر و تصمیم‌گیری خرید محلی (مدیر کارخانه)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-teal-950 dark:text-teal-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-teal-200/80 dark:border-teal-800 cursor-pointer hover:bg-teal-50">
                          <input type="checkbox" checked={formData.canApproveFactory} onChange={e => setFormData({...formData, canApproveFactory: e.target.checked})} className="w-4 h-4 text-teal-600 rounded" />
                          <span className="font-bold">✅ تایید، انتخاب پیش‌فاکتور و دستور خرید (مدیر کارخانه زنجان)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-teal-900 dark:text-teal-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-teal-200/80 dark:border-teal-800 cursor-pointer hover:bg-teal-50">
                          <input type="checkbox" checked={formData.canManageZanjanPurchasing} onChange={e => setFormData({...formData, canManageZanjanPurchasing: e.target.checked})} className="w-4 h-4 text-teal-600 rounded" />
                          <span>📝 ثبت استعلام و پیشنهاد خرید محلی (تدارکات زنجان)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-teal-900 dark:text-teal-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-teal-200/80 dark:border-teal-800 cursor-pointer hover:bg-teal-50">
                          <input type="checkbox" checked={formData.canExecuteBuyerZanjan} onChange={e => setFormData({...formData, canExecuteBuyerZanjan: e.target.checked})} className="w-4 h-4 text-teal-600 rounded" />
                          <span>🛍️ ثبت خرید و فاکتور کارپرداز زنجان (کارخانه)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-emerald-950 dark:text-emerald-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800 cursor-pointer hover:bg-emerald-50">
                          <input type="checkbox" checked={formData.canCheckQC} onChange={e => setFormData({...formData, canCheckQC: e.target.checked})} className="w-4 h-4 text-emerald-600 rounded" />
                          <span>🔬 بررسی و تایید کنترل کیفی (QC)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-orange-950 dark:text-orange-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-orange-200/80 dark:border-orange-800 cursor-pointer hover:bg-orange-50">
                          <input type="checkbox" checked={formData.canRegisterEntry} onChange={e => setFormData({...formData, canRegisterEntry: e.target.checked})} className="w-4 h-4 text-orange-600 rounded" />
                          <span>🛡️ ثبت ورود کالا به کارخانه (انتظامات / نگهبانی)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-teal-900 dark:text-teal-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-teal-200/80 dark:border-teal-800 cursor-pointer hover:bg-teal-50">
                          <input type="checkbox" checked={formData.canApproveFactoryFinal} onChange={e => setFormData({...formData, canApproveFactoryFinal: e.target.checked})} className="w-4 h-4 text-teal-600 rounded" />
                          <span>🏁 تایید نهایی مدیر کارخانه زنجان</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-gray-300 dark:border-gray-700 cursor-pointer">
                          <input type="checkbox" checked={formData.scopeZanjanOnly} onChange={e => setFormData({...formData, scopeZanjanOnly: e.target.checked, scopeTehranOnly: e.target.checked ? false : formData.scopeTehranOnly})} className="w-4 h-4 text-teal-600 rounded" />
                          <span className="font-black text-teal-700 dark:text-teal-400">📍 محدودیت حوزه: فقط خریدهای محلی کارخانه (زنجان)</span>
                        </label>
                      </div>
                    </div>

                    {/* CARD 3: Modules & Confidential Financial Access */}
                    <div className="p-5 bg-gradient-to-br from-amber-50/70 to-white dark:from-amber-950/20 dark:to-gray-900 rounded-3xl border-2 border-amber-200 dark:border-amber-900/60 shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-amber-200 dark:border-amber-800 pb-3">
                        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-black text-sm">
                          <Lock size={18} className="text-amber-600" />
                          <span>دسترسی‌های عمومی، ماژول‌ها و محرمانگی مالی</span>
                        </div>
                        <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full">
                          ماژول‌ها
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        <label className="flex items-center gap-2.5 text-xs text-amber-950 dark:text-amber-200 bg-amber-100/60 dark:bg-amber-950/60 p-2.5 rounded-xl border border-amber-300 dark:border-amber-800 cursor-pointer">
                          <input type="checkbox" checked={formData.canViewPricingAndInvoices} onChange={e => setFormData({...formData, canViewPricingAndInvoices: e.target.checked})} className="w-4 h-4 text-amber-600 rounded" />
                          <span className="font-black">🔒 مشاهده فی، مبالغ ریالی و پیش‌فاکتورها (محرمانه مالی)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer">
                          <input type="checkbox" checked={formData.canManagePurchase} onChange={e => setFormData({...formData, canManagePurchase: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded" />
                          <span>🛒 دسترسی ماژول درخواست خرید و کارتابل</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer">
                          <input type="checkbox" checked={formData.canManageParts} onChange={e => setFormData({...formData, canManageParts: e.target.checked})} className="w-4 h-4 text-amber-600 rounded" />
                          <span>📦 تعریف و کدینگ کالا (درخواست خرید / انبار)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer">
                          <input type="checkbox" checked={formData.canManageTrade} onChange={e => setFormData({...formData, canManageTrade: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                          <span>🚢 دسترسی ماژول اختصاصی بازرگانی خارجی</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer">
                          <input type="checkbox" checked={formData.canManageSales} onChange={e => setFormData({...formData, canManageSales: e.target.checked})} className="w-4 h-4 text-sky-600 rounded" />
                          <span>📊 دسترسی مدیر فروش (پنل بات و پیش‌فاکتورها)</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-indigo-900 dark:text-indigo-200 bg-indigo-50/50 dark:bg-gray-800 p-2.5 rounded-xl border border-indigo-200 dark:border-gray-700 cursor-pointer">
                          <input type="checkbox" checked={formData.canManageArchiveAttachments} onChange={e => setFormData({...formData, canManageArchiveAttachments: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded" />
                          <span>📎 دسترسی افزودن و اتچ فایل به بایگانی اسناد</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-xs text-emerald-900 dark:text-emerald-200 bg-emerald-50/50 dark:bg-gray-800 p-2.5 rounded-xl border border-emerald-200 dark:border-gray-700 cursor-pointer">
                          <input type="checkbox" checked={formData.receiveNotifications} onChange={e => setFormData({...formData, receiveNotifications: e.target.checked})} className="w-4 h-4 text-emerald-600 rounded" />
                          <span>🔔 دریافت پیام‌ها و اعلان‌های سیستم</span>
                        </label>
                      </div>
                    </div>

                    {/* CARD 4: Secretariat & Sayan ERP */}
                    <div className="p-5 bg-gradient-to-br from-purple-50/70 to-white dark:from-purple-950/20 dark:to-gray-900 rounded-3xl border-2 border-purple-200 dark:border-purple-900/60 shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-purple-200 dark:border-purple-800 pb-3">
                        <div className="flex items-center gap-2 text-purple-900 dark:text-purple-200 font-black text-sm">
                          <FileCheck2 size={18} className="text-purple-600" />
                          <span>دبیرخانه، نامه‌نگاری و ثبت‌های سایان ERP</span>
                        </div>
                        <span className="text-[10px] bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300 font-bold px-2 py-0.5 rounded-full">
                          دبیرخانه و سایان
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {/* Secretariat */}
                        <label className="flex items-center gap-2.5 text-xs text-purple-950 dark:text-purple-200 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-purple-200 dark:border-purple-800 cursor-pointer font-bold">
                          <input type="checkbox" checked={formData.canAccessSecretariat} onChange={e => setFormData({...formData, canAccessSecretariat: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                          <span>🏛️ دسترسی کلی به ماژول دبیرخانه</span>
                        </label>
                        
                        {formData.canAccessSecretariat && settings?.companies && (
                          <div className="p-3 bg-purple-100/50 dark:bg-purple-950/40 rounded-xl border border-purple-200 space-y-2">
                            <span className="text-[11px] font-bold text-purple-900 dark:text-purple-200 block">
                              شرکت‌های مجاز کاربر در دبیرخانه:
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {settings.companies.map(comp => (
                                <label key={comp.id} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                                  <input 
                                    type="checkbox" 
                                    className="w-3.5 h-3.5 text-purple-600 rounded"
                                    checked={formData.secretariatAllowedCompanies?.includes(comp.id) || false}
                                    onChange={(e) => {
                                      const isChecked = e.target.checked;
                                      const current = formData.secretariatAllowedCompanies || [];
                                      setFormData({
                                        ...formData,
                                        secretariatAllowedCompanies: isChecked 
                                          ? [...current, comp.id] 
                                          : current.filter(id => id !== comp.id)
                                      });
                                    }}
                                  />
                                  <span>{comp.name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 bg-white/90 dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer">
                          <input type="checkbox" checked={formData.canManageSecretariatSettings} onChange={e => setFormData({...formData, canManageSecretariatSettings: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded" />
                          <span>⚙️ مدیریت تنظیمات دبیرخانه</span>
                        </label>

                        {/* Sayan ERP Details */}
                        <div className="pt-2 border-t border-purple-100 dark:border-purple-900/50 space-y-2">
                          <label className="flex items-center gap-2 text-xs text-purple-900 dark:text-purple-300 font-bold cursor-pointer">
                            <input type="checkbox" checked={formData.canAccessSayanRegistrations} onChange={e => setFormData({...formData, canAccessSayanRegistrations: e.target.checked})} className="w-4 h-4 text-purple-600 rounded" />
                            <span>دسترسی کلی به عملیات و ثبت‌های سایان ERP</span>
                          </label>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            <label className="flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-gray-800 p-2 rounded-lg border border-amber-200 cursor-pointer">
                              <input type="checkbox" checked={formData.canSayanPreInvoices} onChange={e => setFormData({...formData, canSayanPreInvoices: e.target.checked})} className="w-3.5 h-3.5 text-amber-600 rounded" />
                              <span>پیش‌فاکتور سایان (۵۳ به ۵۷)</span>
                            </label>
                            <label className="flex items-center gap-2 text-[11px] text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-gray-800 p-2 rounded-lg border border-emerald-200 cursor-pointer">
                              <input type="checkbox" checked={formData.canSayanRegisterCheque} onChange={e => setFormData({...formData, canSayanRegisterCheque: e.target.checked})} className="w-3.5 h-3.5 text-emerald-600 rounded" />
                              <span>ثبت رسید چک جدید سایان</span>
                            </label>
                            <label className="flex items-center gap-2 text-[11px] text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-gray-800 p-2 rounded-lg border border-blue-200 cursor-pointer">
                              <input type="checkbox" checked={formData.canSayanEditReceipt} onChange={e => setFormData({...formData, canSayanEditReceipt: e.target.checked})} className="w-3.5 h-3.5 text-blue-600 rounded" />
                              <span>ویرایش رسید چک سایان</span>
                            </label>
                            <label className="flex items-center gap-2 text-[11px] text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-gray-800 p-2 rounded-lg border border-rose-200 cursor-pointer">
                              <input type="checkbox" checked={formData.canSayanDeleteReceipt} onChange={e => setFormData({...formData, canSayanDeleteReceipt: e.target.checked})} className="w-3.5 h-3.5 text-rose-600 rounded" />
                              <span>حذف رسید چک سایان</span>
                            </label>
                            <label className="flex items-center gap-2 text-[11px] text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-gray-800 p-2 rounded-lg border border-teal-200 cursor-pointer">
                              <input type="checkbox" checked={formData.canSayanApproveAccounting} onChange={e => setFormData({...formData, canSayanApproveAccounting: e.target.checked})} className="w-3.5 h-3.5 text-teal-600 rounded" />
                              <span>تایید حسابداری چک سایان</span>
                            </label>
                            <label className="flex items-center gap-2 text-[11px] text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-gray-800 p-2 rounded-lg border border-purple-200 cursor-pointer">
                              <input type="checkbox" checked={formData.canSayanApproveCeo} onChange={e => setFormData({...formData, canSayanApproveCeo: e.target.checked})} className="w-3.5 h-3.5 text-purple-600 rounded" />
                              <span>تایید مدیرعامل در سایان</span>
                            </label>
                            <label className="flex items-center gap-2 text-[11px] text-indigo-800 dark:text-indigo-300 bg-indigo-50 dark:bg-gray-800 p-2 rounded-lg border border-indigo-200 cursor-pointer sm:col-span-2">
                              <input type="checkbox" checked={formData.canSayanFinalApprove} onChange={e => setFormData({...formData, canSayanFinalApprove: e.target.checked})} className="w-3.5 h-3.5 text-indigo-600 rounded" />
                              <span>تایید نهایی و ثبت در سایان (توسط کاربران مجاز به عنوان جایگزین مدیرعامل)</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Form Footer Action Buttons */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-850 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={handleCancelEdit} 
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 transition-colors shadow-2xs"
                >
                  انصراف
                </button>
              </div>

              <div className="flex items-center gap-3">
                {activeFormTab !== 'profile' && (
                  <button
                    type="button"
                    onClick={() => setActiveFormTab(activeFormTab === 'permissions' ? 'roles' : 'profile')}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-200/70 dark:bg-gray-700 hover:bg-gray-300 transition-colors"
                  >
                    مرحله قبل
                  </button>
                )}
                {activeFormTab !== 'permissions' ? (
                  <button
                    type="button"
                    onClick={() => setActiveFormTab(activeFormTab === 'profile' ? 'roles' : 'permissions')}
                    className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 cursor-pointer"
                  >
                    مرحله بعد
                  </button>
                ) : (
                  <button 
                    type="submit" 
                    className={`px-8 py-2.5 rounded-xl text-xs font-black text-white shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer ${editingId ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'}`}
                  >
                    <Save size={16} />
                    <span>{editingId ? 'ذخیره تغییرات کاربر' : 'ثبت و ایجاد نهایی کاربر'}</span>
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* SEARCH, FILTER & DIRECTORY TOOLBAR */}
      <div className="glass-panel p-4 rounded-3xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در نام، نام کاربری یا موبایل..." 
              className="w-full pl-8 pr-10 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto pb-1 md:pb-0">
            {[
              { id: 'ALL', label: 'همه کاربران', icon: UserIcon },
              { id: 'ADMIN', label: 'مدیران سیستم', icon: Shield },
              { id: 'TEHRAN', label: 'شعبه بازرگانی تهران', icon: Building2 },
              { id: 'ZANJAN', label: 'کارخانه زنجان', icon: Factory },
              { id: 'SALES', label: 'واحد فروش', icon: Package },
              { id: 'WAREHOUSE', label: 'انبار', icon: Package }
            ].map(tab => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedRoleFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${selectedRoleFilter === tab.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
                >
                  <TabIcon size={12} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* View Toggle */}
          <div className="hidden sm:flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow-xs' : 'text-gray-400 hover:text-gray-700'}`}
              title="نمایش جدولی"
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow-xs' : 'text-gray-400 hover:text-gray-700'}`}
              title="نمایش کارتی"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* USERS DIRECTORY (Table / Cards) */}
      <div className="glass-panel rounded-3xl shadow-sm border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserIcon size={18} className="text-indigo-600" />
            <h2 className="text-sm font-black text-gray-800 dark:text-gray-100">فهرست کاربران سیستم</h2>
            <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
              {filteredUsers.length} کاربر یافت شد
            </span>
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-3">
            <UserIcon size={48} className="mx-auto opacity-30" />
            <p className="text-xs font-bold">کاربری با این مشخصات یا فیلتر یافت نشد.</p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-gray-50/80 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 border-b border-gray-100 dark:border-gray-800">
                <tr>
                  <th className="px-5 py-3.5 font-black">کاربر</th>
                  <th className="px-5 py-3.5 font-black">نام کاربری</th>
                  <th className="px-5 py-3.5 font-black">نقش‌های کاربری</th>
                  <th className="px-5 py-3.5 font-black">حوزه و شعبه</th>
                  <th className="px-5 py-3.5 font-black">تماس / بله</th>
                  <th className="px-5 py-3.5 font-black">مجوزهای کلیدی</th>
                  <th className="px-5 py-3.5 font-black text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredUsers.map((user) => {
                  const rolesList = user.roles && user.roles.length > 0 ? user.roles : [user.role];
                  const isAdminUser = rolesList.includes(UserRole.ADMIN) || user.role === UserRole.ADMIN;
                  const isEditingThis = editingId === user.id;

                  return (
                    <tr 
                      key={user.id} 
                      className={`hover:bg-indigo-50/30 dark:hover:bg-gray-800/50 transition-colors ${isEditingThis ? 'bg-amber-50/60 dark:bg-amber-950/30 ring-2 ring-amber-300' : ''}`}
                    >
                      {/* Avatar & Full Name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden relative shrink-0">
                            {user.avatar ? (
                              <img src={user.avatar} alt={user.fullName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 font-black text-xs">
                                {user.fullName ? user.fullName.charAt(0) : <UserIcon size={18} />}
                              </div>
                            )}
                          </div>
                          <div>
                            <span className="font-black text-gray-900 dark:text-gray-100 block">
                              {user.fullName || 'بدون نام'}
                            </span>
                            {user.signatureUrl && (
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
                                <CheckCircle2 size={9} /> دارای امضای دیجیتال
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Username */}
                      <td className="px-5 py-3.5 font-mono text-gray-600 dark:text-gray-400 text-left dir-ltr">
                        @{user.username}
                      </td>

                      {/* Roles */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {rolesList.map((r, idx) => (
                            <span 
                              key={idx} 
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border ${getRoleBadgeStyle(r)}`}
                            >
                              {r === UserRole.ADMIN && <Shield size={10} />}
                              {getRoleLabel(r)}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Branch Scope */}
                      <td className="px-5 py-3.5">
                        {user.scopeTehranOnly ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                            <Building2 size={11} /> فقط تهران
                          </span>
                        ) : user.scopeZanjanOnly ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                            <Factory size={11} /> فقط کارخانه زنجان
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                            سراسری / دو شعبه
                          </span>
                        )}
                      </td>

                      {/* Contact */}
                      <td className="px-5 py-3.5">
                        <div className="space-y-0.5">
                          {user.phoneNumber ? (
                            <span className="text-[11px] font-mono text-gray-700 dark:text-gray-300 block" dir="ltr">
                              {user.phoneNumber}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-[10px]">بدون شماره</span>
                          )}
                          {user.baleChatId && (
                            <span className="text-[9px] text-blue-600 dark:text-blue-400 font-bold block" dir="ltr">
                              Bale: {user.baleChatId}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Permissions Tags */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {isAdminUser && (
                            <span className="text-[9px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">
                              تمام اختیارات
                            </span>
                          )}
                          {user.canViewPricingAndInvoices && (
                            <span className="text-[9px] font-bold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5">
                              <Lock size={9}/> فی مالی
                            </span>
                          )}
                          {user.canApproveFactory && (
                            <span className="text-[9px] font-bold bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded border border-teal-200">
                              دستور خرید کارخانه
                            </span>
                          )}
                          {user.canManageZanjanPurchasing && (
                            <span className="text-[9px] font-bold bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded border border-teal-200">
                              پیش‌فاکتور زنجان
                            </span>
                          )}
                          {user.canApproveCommercialManager && (
                            <span className="text-[9px] font-bold bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded border border-sky-200">
                              تایید بازرگانی تهران
                            </span>
                          )}
                          {user.canManagePurchase && (
                            <span className="text-[9px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                              درخواست خرید
                            </span>
                          )}
                          {user.canAccessSecretariat && (
                            <span className="text-[9px] font-bold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">
                              دبیرخانه
                            </span>
                          )}
                          {user.canAccessSayanRegistrations && (
                            <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">
                              ثبت‌های سایان
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => handleEditClick(user)} 
                            className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/60 rounded-xl transition-all border border-amber-200 dark:border-amber-900/50 shadow-2xs hover:scale-105 active:scale-95" 
                            title="ویرایش اطلاعات و دسترسی‌های کاربر"
                          >
                            <Pencil size={15} />
                          </button>
                          {user.username !== 'admin' && (
                            <button 
                              onClick={() => handleDeleteUser(user)} 
                              className="p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-xl transition-all border border-rose-200 dark:border-rose-900/50 shadow-2xs hover:scale-105 active:scale-95" 
                              title="حذف کاربر"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Cards Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {filteredUsers.map((user) => {
              const rolesList = user.roles && user.roles.length > 0 ? user.roles : [user.role];
              const isEditingThis = editingId === user.id;

              return (
                <div 
                  key={user.id} 
                  className={`p-5 rounded-2xl border-2 transition-all space-y-4 bg-white dark:bg-gray-800 ${isEditingThis ? 'border-amber-500 ring-2 ring-amber-200 bg-amber-50/20' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 shadow-sm'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 overflow-hidden relative shrink-0">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.fullName} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 font-black">
                            {user.fullName ? user.fullName.charAt(0) : <UserIcon size={20} />}
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-black text-sm text-gray-900 dark:text-gray-100">
                          {user.fullName || 'بدون نام'}
                        </h3>
                        <p className="text-xs font-mono text-gray-500 text-left dir-ltr">
                          @{user.username}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => handleEditClick(user)} 
                        className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg border border-amber-200"
                        title="ویرایش"
                      >
                        <Pencil size={14} />
                      </button>
                      {user.username !== 'admin' && (
                        <button 
                          onClick={() => handleDeleteUser(user)} 
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200"
                          title="حذف"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Roles */}
                  <div className="flex flex-wrap gap-1">
                    {rolesList.map((r, idx) => (
                      <span key={idx} className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getRoleBadgeStyle(r)}`}>
                        {getRoleLabel(r)}
                      </span>
                    ))}
                  </div>

                  {/* Contact & Branch */}
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-mono text-[11px]" dir="ltr">
                      {user.phoneNumber || '-'}
                    </span>
                    {user.scopeTehranOnly ? (
                      <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded">🏢 تهران</span>
                    ) : user.scopeZanjanOnly ? (
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">🏭 زنجان</span>
                    ) : (
                      <span className="text-[10px] text-gray-400">🌐 سراسری</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-3xl border-2 border-rose-300 bg-white dark:bg-gray-900 max-w-md w-full text-right dir-rtl space-y-4 shadow-2xl animate-scale-in">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 dark:bg-rose-950/60 rounded-2xl">
                <AlertCircle size={28} />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-gray-100">تایید حذف کاربر</h3>
                <p className="text-xs text-gray-500">این عملیات قابل بازگشت نمی‌باشد.</p>
              </div>
            </div>

            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
              آیا از حذف کامل کاربر <strong className="text-gray-900 dark:text-white font-black">«{deleteConfirmUser.fullName}»</strong> با نام کاربری <code className="font-mono text-rose-600 font-bold">@{deleteConfirmUser.username}</code> اطمینان دارید؟
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button 
                type="button" 
                onClick={() => setDeleteConfirmUser(null)} 
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                انصراف
              </button>
              <button 
                type="button" 
                onClick={confirmDelete} 
                className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-md shadow-rose-600/30"
              >
                بله، حذف شود
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ManageUsers;
