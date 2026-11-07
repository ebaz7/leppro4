import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Columns, X, Calculator, ChevronUp, ChevronDown, Monitor, Minus, Eye, EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, SystemSettings } from '../types';
import { AppNavItem, getAppNavItems, getSidebarLabel, getSidebarIcon, ALL_NAVIGATION_ITEMS } from '../utils/navigationItems';

interface WorkstationDockProps {
  activeTab: string;
  secondaryTab: string | null;
  openTabs: string[];
  onSelectTab: (tabId: string) => void;
  onOpenSplitView: () => void;
  onCloseSecondaryTab: () => void;
  onFloatTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onToggleCalculator: () => void;
  isCalculatorOpen: boolean;
  floatingTab: string | null;
  currentUser: User | null;
  settings?: SystemSettings | null;
  allowedItems?: AppNavItem[];
}

export const WorkstationDock: React.FC<WorkstationDockProps> = ({
  activeTab,
  secondaryTab,
  openTabs,
  onSelectTab,
  onOpenSplitView,
  onCloseSecondaryTab,
  onFloatTab,
  onCloseTab,
  onToggleCalculator,
  isCalculatorOpen,
  floatingTab,
  currentUser,
  settings,
  allowedItems
}) => {
  const isInChat = activeTab === 'chat';

  // Persistence for user dock collapse preference
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('app_dock_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [isHidden, setIsHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem('app_dock_hidden') === 'true';
    } catch {
      return false;
    }
  });

  const pointerDragRef = useRef<{
    tabId: string;
    startX: number;
    startY: number;
    isDraggingUp: boolean;
  } | null>(null);

  const handleTabPointerDown = (e: React.PointerEvent<HTMLDivElement>, tabId: string) => {
    // Only primary button (left mouse click) or touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // If target is close button, ignore
    if ((e.target as HTMLElement).closest('button')) return;

    const startX = e.clientX;
    const startY = e.clientY;

    pointerDragRef.current = {
      tabId,
      startX,
      startY,
      isDraggingUp: false
    };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      if (!pointerDragRef.current) return;
      const dy = startY - moveEvt.clientY; // positive = dragging UP
      const dx = moveEvt.clientX - startX;

      if (!pointerDragRef.current.isDraggingUp) {
        // If dragged up by more than 12px or horizontally by more than 20px
        if (dy > 12 || Math.abs(dx) > 20) {
          pointerDragRef.current.isDraggingUp = true;
          try {
            window.dispatchEvent(new CustomEvent('workstation-tab-drag-start', {
              detail: {
                tabId,
                clientX: moveEvt.clientX,
                clientY: moveEvt.clientY,
                isPointer: true
              }
            }));
          } catch {}
        }
      } else {
        try {
          window.dispatchEvent(new CustomEvent('workstation-tab-drag-move', {
            detail: {
              tabId,
              clientX: moveEvt.clientX,
              clientY: moveEvt.clientY
            }
          }));
        } catch {}
      }
    };

    const handlePointerUp = (upEvt: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      if (pointerDragRef.current?.isDraggingUp) {
        try {
          window.dispatchEvent(new CustomEvent('workstation-tab-drag-end', {
            detail: {
              tabId,
              clientX: upEvt.clientX,
              clientY: upEvt.clientY
            }
          }));
        } catch {}

        // Prevent click from selecting tab after drag
        setTimeout(() => {
          if (pointerDragRef.current) {
            pointerDragRef.current = null;
          }
        }, 80);
      } else {
        pointerDragRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handleToggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('app_dock_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const handleToggleHidden = () => {
    setIsHidden(prev => {
      const next = !prev;
      try {
        localStorage.setItem('app_dock_hidden', String(next));
      } catch {}
      return next;
    });
  };

  // Derive allowed navigation items for current user
  const permittedItems = useMemo(() => {
    if (allowedItems && allowedItems.length > 0) {
      return allowedItems;
    }
    if (currentUser) {
      return getAppNavItems(currentUser, settings || null);
    }
    return [ALL_NAVIGATION_ITEMS['dashboard']];
  }, [allowedItems, currentUser, settings]);

  const allowedSet = useMemo(() => new Set(permittedItems.map(i => i.id)), [permittedItems]);

  // Tab label and icon strictly matched with the sidebar
  const getTabInfo = (tabId: string) => {
    const label = getSidebarLabel(tabId, permittedItems);
    const Icon = getSidebarIcon(tabId, permittedItems);
    return { label, Icon };
  };

  // Unique list of open tabs to show in the taskbar dock - STRICTLY FILTERED BY USER PERMISSIONS
  const displayTabs = Array.from(new Set([
    'dashboard',
    activeTab,
    ...(secondaryTab ? [secondaryTab] : []),
    ...(floatingTab ? [floatingTab] : []),
    ...openTabs
  ])).filter(tabId => Boolean(tabId) && allowedSet.has(tabId));

  // If user completely hid the dock, show a minimal restore trigger in a safe corner
  if (isHidden) {
    return (
      <div className="fixed top-3 left-20 z-[9980] hidden md:block animate-fade-in">
        <button
          type="button"
          onClick={handleToggleHidden}
          className="bg-zinc-900/80 hover:bg-zinc-900 text-white/80 hover:text-white px-2.5 py-1 rounded-xl shadow-md border border-zinc-700/50 backdrop-blur-md flex items-center gap-1.5 text-[10px] font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer"
          title="نمایش نوار وظایف میز کار (Taskbar)"
        >
          <Monitor size={12} className="text-blue-400" />
          <span>میز کار</span>
        </button>
      </div>
    );
  }

  // When collapsed or in Chat mode with collapse
  if (isCollapsed) {
    return (
      <div className={`fixed z-[9980] hidden md:block transition-all duration-200 ${
        isInChat 
          ? 'top-3 left-24' 
          : 'bottom-2 left-1/2 -translate-x-1/2'
      }`}>
        <div className="flex items-center gap-1 bg-zinc-900/90 text-white p-1 rounded-full shadow-xl border border-zinc-700/60 backdrop-blur-xl">
          <button
            type="button"
            onClick={handleToggleCollapse}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold hover:bg-zinc-800 transition-colors cursor-pointer"
            title="باز کردن نوار وظایف میز کار"
          >
            <Monitor size={13} className="text-blue-400" />
            <span>میز کار ({displayTabs.length})</span>
            {isInChat ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
          <button
            type="button"
            onClick={handleToggleHidden}
            className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-zinc-200 transition-colors"
            title="مخفی‌کردن کامل"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed z-[9980] hidden md:flex items-center gap-1.5 bg-white/95 dark:bg-zinc-950/95 border border-zinc-200/90 dark:border-zinc-800/90 p-1.5 rounded-2xl shadow-[0_12px_35px_rgba(0,0,0,0.18)] backdrop-blur-2xl max-w-[94vw] transition-all duration-200 select-none ${
      isInChat 
        ? 'top-3 left-24 shadow-md' 
        : 'bottom-2 left-1/2 right-auto -translate-x-1/2 transform rtl:left-1/2 rtl:right-auto rtl:-translate-x-1/2'
    }`}>
      {/* Workspace Indicator & Collapse toggle */}
      <div className="flex items-center gap-1 pl-1.5 border-l border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={handleToggleCollapse}
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          title="کوچک کردن نوار وظایف"
        >
          {isInChat ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="flex items-center gap-1.5 px-1">
          <Monitor size={14} className="text-blue-600 dark:text-blue-400" />
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-tight">وظایف</span>
        </div>
      </div>

      {/* Open Tabs on the Taskbar */}
      <div className="flex items-center gap-1 overflow-x-auto max-w-[55vw] lg:max-w-[65vw] custom-scrollbar py-0.5 px-1">
        {displayTabs.map((tabId) => {
          const { label, Icon } = getTabInfo(tabId);
          const isPrimary = activeTab === tabId;
          const isSecondary = secondaryTab === tabId;
          const isFloating = floatingTab === tabId;
          const isActive = isPrimary || isSecondary;

          return (
            <div
              key={tabId}
              draggable
              data-tab-id={tabId}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => handleTabPointerDown(e, tabId)}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-workstation-tab', tabId);
                e.dataTransfer.setData('text/plain', tabId);
                e.dataTransfer.effectAllowed = 'copyMove';
                try {
                  window.dispatchEvent(new CustomEvent('workstation-tab-drag-start', { 
                    detail: { tabId, clientX: e.clientX, clientY: e.clientY } 
                  }));
                } catch {}
              }}
              onDragEnd={(e) => {
                try {
                  window.dispatchEvent(new CustomEvent('workstation-tab-drag-end', {
                    detail: { tabId, clientX: e.clientX, clientY: e.clientY }
                  }));
                } catch {}
              }}
              onClick={() => {
                if (pointerDragRef.current?.isDraggingUp) return;
                onSelectTab(tabId);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-grab active:cursor-grabbing select-none group relative ${
                isPrimary
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400/50'
                  : isSecondary
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-500/25 ring-1 ring-purple-400/50'
                    : isFloating
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60'
                      : 'bg-zinc-100/80 dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/80 border border-transparent'
              }`}
              title={`${label} ${isPrimary ? '(پنجره فعال)' : isSecondary ? '(پنجره اسپلیت)' : isFloating ? '(پنجره شناور)' : ''} - برای اسپلیت به سمت بالا بکشید`}
            >
              <Icon size={14} className={isActive ? 'text-white' : 'text-zinc-500 group-hover:text-blue-500'} />
              <span className="truncate max-w-[90px]">{label}</span>

              {/* Status Badge */}
              {isSecondary && (
                <span className="text-[8px] bg-white/25 px-1 py-0.2 rounded font-mono">اسپلیت</span>
              )}
              {isFloating && (
                <span className="text-[8px] bg-amber-500 text-white px-1 py-0.2 rounded font-mono">شناور</span>
              )}

              {/* Quick Split / Close options on hover */}
              {!isPrimary && tabId !== 'dashboard' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSecondary) onCloseSecondaryTab();
                    else if (onCloseTab) onCloseTab(tabId);
                  }}
                  className="p-0.5 hover:bg-black/20 dark:hover:bg-white/20 rounded-md transition-colors ml-0.5 opacity-60 group-hover:opacity-100"
                  title="بستن پنجره"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Dock Actions Right Side */}
      <div className="flex items-center gap-1 pr-1.5 border-r border-zinc-200 dark:border-zinc-800">
        {/* Split View Button */}
        <button
          type="button"
          onClick={onOpenSplitView}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            secondaryTab
              ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
              : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30'
          }`}
          title={secondaryTab ? 'تغییر یا مدیریت صفحه همزمان (Split View)' : 'مشاهده همزمان منوها (Split View)'}
        >
          <Columns size={14} className={secondaryTab ? 'text-purple-600' : 'text-blue-600'} />
          <span className="hidden lg:inline">{secondaryTab ? 'همزمان (فعال)' : 'مشاهده همزمان'}</span>
        </button>

        {/* Floating Calculator Button */}
        <button
          type="button"
          onClick={onToggleCalculator}
          className={`p-1.5 rounded-xl text-xs font-bold transition-all ${
            isCalculatorOpen
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
          }`}
          title="ماشین‌حساب شناور"
        >
          <Calculator size={15} />
        </button>

        {/* Close Secondary Pane (if open) */}
        {secondaryTab && (
          <button
            type="button"
            onClick={onCloseSecondaryTab}
            className="p-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 hover:bg-rose-100 rounded-xl transition-colors"
            title="بستن پنجره دوم و بازگشت به تک‌پنجره"
          >
            <X size={14} />
          </button>
        )}

        {/* Hide Dock Button */}
        <button
          type="button"
          onClick={handleToggleHidden}
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors"
          title="مخفی‌کردن نوار وظایف"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
};
