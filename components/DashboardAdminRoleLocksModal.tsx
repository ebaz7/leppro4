import React, { useState } from 'react';
import { 
  Lock, Unlock, ShieldCheck, Check, X, RefreshCw, Layers, 
  Users, AlertCircle, Sparkles, Building
} from 'lucide-react';
import { UserRole } from '../types';

interface DashboardAdminRoleLocksModalProps {
  isOpen: boolean;
  onClose: () => void;
  widgetNames: Record<string, string>;
  roleLocks: Record<string, string[]>;
  onSaveRoleLocks: (newLocks: Record<string, string[]>) => void;
  onPublishDefaultLayout: () => void;
}

const ROLE_LABELS: Record<string, { title: string; desc: string }> = {
  all: { title: '🌐 همه نقش‌ها و پرسنل (قفل سراسری)', desc: 'اعمال قفل بر روی تمامی کاربران سازمان بدون استثنا' },
  [UserRole.USER]: { title: '👤 پرسنل و کاربران عمومی', desc: 'کاربران سطح پایه سیستم' },
  [UserRole.FINANCIAL]: { title: '💰 مالی و حسابداری', desc: 'کارشناسان و مدیران امور مالی' },
  [UserRole.WAREHOUSE_KEEPER]: { title: '📦 انباردار و تدارکات', desc: 'مسئولین انبار و مدیریت موجودی' },
  [UserRole.SALES_MANAGER]: { title: '📈 مدیر و کارشناسان فروش', desc: 'بخش بازاریابی و فروش' },
  [UserRole.COMMERCIAL]: { title: '💼 بازرگانی و خرید', desc: 'تدارکات، استعلام قیمت و خرید' },
  [UserRole.FACTORY_MANAGER]: { title: '🏭 مدیریت کارخانه و تولید', desc: 'سرپرستان و مدیران خط تولید' },
  [UserRole.QC]: { title: '🔬 کنترل کیفیت (QC)', desc: 'بازرسان فنی و آزمایشگاه' },
  [UserRole.SECURITY_HEAD]: { title: '🛡️ انتظامات و حراست', desc: 'سرپرست و ماموران حفاظت فیزیکی' },
  [UserRole.MANAGER]: { title: '👔 مدیران میانی و اجرایی', desc: 'روسای دپارتمان‌ها و واحدها' },
};

export const DashboardAdminRoleLocksModal: React.FC<DashboardAdminRoleLocksModalProps> = ({
  isOpen,
  onClose,
  widgetNames,
  roleLocks,
  onSaveRoleLocks,
  onPublishDefaultLayout,
}) => {
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [localLocks, setLocalLocks] = useState<Record<string, string[]>>(() => ({ ...roleLocks }));
  const [publishedToast, setPublishedToast] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  if (!isOpen) return null;

  const currentLockedWidgets = localLocks[selectedRole] || [];

  const handleToggleLock = (widgetId: string) => {
    setLocalLocks(prev => {
      const currentList = prev[selectedRole] || [];
      const updatedList = currentList.includes(widgetId)
        ? currentList.filter(id => id !== widgetId)
        : [...currentList, widgetId];
      
      return {
        ...prev,
        [selectedRole]: updatedList,
      };
    });
  };

  const handleSelectAllForRole = () => {
    setLocalLocks(prev => ({
      ...prev,
      [selectedRole]: Object.keys(widgetNames),
    }));
  };

  const handleClearAllForRole = () => {
    setLocalLocks(prev => ({
      ...prev,
      [selectedRole]: [],
    }));
  };

  const handleSave = () => {
    onSaveRoleLocks(localLocks);
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 900);
  };

  const handlePublishDefault = () => {
    onPublishDefaultLayout();
    setPublishedToast(true);
    setTimeout(() => setPublishedToast(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-blue-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Lock size={20} />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>قفل سازمانی و شخصی‌سازی ابزارک‌ها</span>
                <span className="text-[10px] bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                  پنل مدیریت
                </span>
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                قفل کردن ابزارک‌های اجباری برای جلوگیری از حذف توسط نقش‌های خاص کاربران
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar text-right">
          
          {/* Company Default Layout Broadcast Box */}
          <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Building size={16} className="text-blue-600 dark:text-blue-400" />
                <h4 className="font-black text-xs sm:text-sm text-blue-950 dark:text-blue-200">
                  انتشار چیدمان و اندازه‌های فعلی برای کل سازمان
                </h4>
              </div>
              <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80">
                چیدمان، ترتیب و ابعاد ابزارک‌های فعلی شما به عنوان الگوی پیش‌فرض سازمانی ذخیره می‌شود تا تمام کاربران جدید آن را دریافت کنند.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePublishDefault}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0 active:scale-95"
            >
              {publishedToast ? <Check size={14} /> : <Sparkles size={14} />}
              <span>{publishedToast ? 'با موفقیت ذخیره شد!' : 'ذخیره به عنوان الگوی سازمان'}</span>
            </button>
          </div>

          {/* Role Selector Tabs */}
          <div>
            <label className="block text-xs font-black text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-1.5">
              <Users size={14} className="text-amber-500" />
              <span>انتخاب نقش هدف برای تنظیم قفل:</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {Object.entries(ROLE_LABELS).map(([roleKey, info]) => {
                const count = (localLocks[roleKey] || []).length;
                const isSelected = selectedRole === roleKey;
                return (
                  <button
                    key={roleKey}
                    type="button"
                    onClick={() => setSelectedRole(roleKey)}
                    className={`p-2 rounded-xl text-right border transition-all text-xs flex items-center justify-between gap-1 ${
                      isSelected
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm font-black'
                        : 'bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <span className="truncate">{info.title.split('(')[0]}</span>
                    {count > 0 && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                        isSelected ? 'bg-white/30 text-white' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                      }`}>
                        {count} قفل
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
              {ROLE_LABELS[selectedRole]?.desc}
            </p>
          </div>

          {/* Widgets Locking Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span>ابزارک‌های قفل‌شده برای این نقش ({currentLockedWidgets.length} مورد):</span>
              </span>
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={handleSelectAllForRole}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-bold px-1"
                >
                  قفل همه
                </button>
                <span className="text-zinc-300">|</span>
                <button
                  type="button"
                  onClick={handleClearAllForRole}
                  className="text-zinc-500 hover:text-red-500 font-bold px-1"
                >
                  آزادسازی همه
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 bg-zinc-50/50 dark:bg-zinc-900/50">
              {Object.entries(widgetNames).map(([id, label]) => {
                const isLocked = currentLockedWidgets.includes(id);
                return (
                  <div
                    key={id}
                    onClick={() => handleToggleLock(id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between select-none ${
                      isLocked
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800/80 text-amber-950 dark:text-amber-200 shadow-xs'
                        : 'bg-white dark:bg-zinc-800 border-zinc-200/80 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1.5 rounded-lg ${isLocked ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-400'}`}>
                        {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                      </div>
                      <span className="text-xs font-bold truncate">{label}</span>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                      isLocked 
                        ? 'bg-amber-200/70 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300' 
                        : 'text-zinc-400'
                    }`}>
                      {isLocked ? 'قفل‌شده' : 'آزاد'}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-zinc-400 mt-1.5 flex items-center gap-1">
              <AlertCircle size={12} />
              <span>کاربران در این نقش قادر به حذف یا مخفی‌کردن ابزارک‌های قفل‌شده نخواهند بود.</span>
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-xl transition-all"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl shadow-md shadow-amber-600/20 transition-all flex items-center gap-1.5 active:scale-95"
          >
            {savedToast ? <Check size={14} /> : <Lock size={14} />}
            <span>{savedToast ? 'ذخیره شد!' : 'ذخیره قوانین قفل ابزارک‌ها'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
