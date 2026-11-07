import React, { useMemo } from 'react';
import { X, Columns, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import { User, SystemSettings } from '../types';
import { AppNavItem, getAppNavItems, getSidebarLabel, ALL_NAVIGATION_ITEMS } from '../utils/navigationItems';

interface SplitViewSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  secondaryTab: string | null;
  onSelectSecondaryTab?: (tabId: string) => void;
  onSelectModuleForSplit?: (tabId: string) => void;
  onCloseSplit?: () => void;
  currentUser?: User | null;
  settings?: SystemSettings | null;
  allowedItems?: AppNavItem[];
}

export const SplitViewSelectorModal: React.FC<SplitViewSelectorModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  secondaryTab,
  onSelectSecondaryTab,
  onSelectModuleForSplit,
  onCloseSplit,
  currentUser,
  settings,
  allowedItems
}) => {
  if (!isOpen) return null;

  const handleSelect = (tabId: string) => {
    if (onSelectModuleForSplit) {
      onSelectModuleForSplit(tabId);
    } else if (onSelectSecondaryTab) {
      onSelectSecondaryTab(tabId);
    }
    onClose();
  };

  const handleCloseActiveSplit = () => {
    if (onCloseSplit) {
      onCloseSplit();
    } else if (onSelectSecondaryTab) {
      onSelectSecondaryTab('');
    }
    onClose();
  };

  // Strictly respect user permissions: only show modules the user has access to
  const items = useMemo(() => {
    if (allowedItems && allowedItems.length > 0) {
      return allowedItems;
    }
    if (currentUser) {
      return getAppNavItems(currentUser, settings || null);
    }
    return [ALL_NAVIGATION_ITEMS['dashboard']];
  }, [allowedItems, currentUser, settings]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-2xl bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md">
              <Columns size={20} />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base">مشاهده همزمان منوها (Split View)</h3>
              <p className="text-[11px] text-blue-100 mt-0.5">
                برنامه دوم را جهت باز شدن در کنار پنجره اصلی انتخاب کنید
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Current Active Info */}
        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between text-xs font-bold text-zinc-600 dark:text-zinc-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>پنجره اصلی فعال:</span>
            <span className="text-blue-600 dark:text-blue-400 font-black">
              {getSidebarLabel(activeTab, items)}
            </span>
          </div>
          {secondaryTab && (
            <button
              type="button"
              onClick={handleCloseActiveSplit}
              className="text-rose-600 hover:text-rose-700 hover:underline text-[11px]"
            >
              بستن پنجره دوم (حالت تک‌پنجره)
            </button>
          )}
        </div>

        {/* List of Modules */}
        <div className="p-5 overflow-y-auto custom-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item) => {
            const Icon = item.icon || FileText;
            const isMain = item.id === activeTab;
            const isSecondary = item.id === secondaryTab;

            return (
              <button
                key={item.id}
                type="button"
                disabled={isMain}
                onClick={() => {
                  if (!isMain) {
                    handleSelect(item.id);
                  }
                }}
                className={`p-3.5 rounded-2xl border text-right transition-all flex items-start gap-3 relative group ${
                  isMain 
                    ? 'opacity-50 cursor-not-allowed bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                    : isSecondary
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 ring-2 ring-blue-500/20 shadow-md'
                      : 'bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 hover:shadow-sm'
                }`}
              >
                <div className={`p-2.5 rounded-xl shrink-0 transition-transform group-hover:scale-105 ${
                  isSecondary 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30' 
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                }`}>
                  <Icon size={18} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-xs text-zinc-800 dark:text-zinc-200 truncate">
                      {item.label}
                    </span>
                    {isSecondary && (
                      <span className="text-[10px] bg-blue-600 text-white font-extrabold px-1.5 py-0.5 rounded-md">
                        کنار هم
                      </span>
                    )}
                    {isMain && (
                      <span className="text-[10px] bg-zinc-300 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold px-1.5 py-0.5 rounded-md">
                        پنجره اصلی
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1 line-clamp-1">
                    {item.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between text-xs">
          <span className="text-[11px] text-zinc-500">
            می‌توانید اندازه هر ستون را با تغییر نسبت یا بستن پنل در هر لحظه کنترل کنید.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold transition-colors"
          >
            انصراف
          </button>
        </div>
      </motion.div>
    </div>
  );
};
