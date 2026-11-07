import React, { useState } from 'react';
import { Minus, Maximize2, X, Move, Pin, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';

interface WorkstationFloatingWindowProps {
  id: string;
  tabId: string;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onMaximizeToMain: () => void;
  onClose: () => void;
  children: React.ReactNode;
  icon?: any;
}

export const WorkstationFloatingWindow: React.FC<WorkstationFloatingWindowProps> = ({
  id,
  tabId,
  title,
  isOpen,
  isMinimized,
  onMinimize,
  onRestore,
  onMaximizeToMain,
  onClose,
  children,
  icon: Icon
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div
        onClick={onRestore}
        className="fixed bottom-16 right-4 sm:right-6 z-[9998] bg-zinc-900/90 hover:bg-zinc-900 text-white p-2.5 rounded-2xl shadow-2xl flex items-center gap-2 cursor-pointer transition-all hover:scale-105 active:scale-95 border border-zinc-700/60 backdrop-blur-xl group"
        title={`پنجره کوچک شده: ${title} (کلیک برای بازگشت)`}
      >
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        {Icon && <Icon size={16} className="text-blue-400 group-hover:scale-110 transition-transform" />}
        <span className="text-xs font-bold truncate max-w-[120px]">{title}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-rose-400"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 30 }}
      transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      className={`fixed z-[9990] bg-white dark:bg-zinc-950 rounded-2xl md:rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col transition-all duration-200 ${
        isExpanded
          ? 'inset-3 md:inset-8'
          : 'bottom-16 right-2 sm:right-6 left-2 sm:left-auto w-auto sm:w-[540px] md:w-[620px] h-[580px] max-h-[82vh]'
      }`}
    >
      {/* Window Title Bar */}
      <div className="px-4 py-3 bg-zinc-100/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between select-none shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-amber-500 flex items-center justify-center cursor-pointer hover:opacity-80" onClick={onMinimize} title="کوچک کردن" />
          <div className="w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center cursor-pointer hover:opacity-80" onClick={() => setIsExpanded(prev => !prev)} title={isExpanded ? 'اندازه متوسط' : 'بزرگ کردن'} />
          <div className="w-3 h-3 rounded-full bg-rose-500 flex items-center justify-center cursor-pointer hover:opacity-80" onClick={onClose} title="بستن پنجره" />
          
          <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />
          
          {Icon && <Icon size={16} className="text-blue-600 dark:text-blue-400" />}
          <span className="text-xs font-black text-zinc-800 dark:text-zinc-200 truncate">
            {title} (پنجره شناور)
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMaximizeToMain}
            className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-blue-600 transition-colors flex items-center gap-1 text-[11px] font-bold"
            title="انتقال به پنجره اصلی"
          >
            <Maximize2 size={13} />
            <span className="hidden sm:inline">تمام صفحه</span>
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 dark:text-zinc-400 transition-colors"
            title="کوچک کردن به گوشه صفحه"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-950/50 text-rose-500 rounded-lg transition-colors"
            title="بستن"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Window Body Container */}
      <div
        data-split-pane-scroll={tabId === 'chat' ? 'chat' : 'floating'}
        className={`flex-1 min-h-0 h-full relative bg-zinc-50/50 dark:bg-zinc-900/30 ${
          tabId === 'chat'
            ? 'flex flex-col overflow-hidden p-0'
            : 'overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar p-2 pb-12'
        }`}
      >
        {children}
      </div>
    </motion.div>
  );
};
