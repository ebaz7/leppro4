import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Columns, LayoutDashboard, ArrowLeft, ArrowRight, X, Sparkles, ExternalLink, Move } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ALL_NAVIGATION_ITEMS, getSidebarLabel, getSidebarIcon, AppNavItem } from '../utils/navigationItems';

interface SplitViewDragOverlayProps {
  onDropLeft: (tabId: string) => void;
  onDropRight: (tabId: string) => void;
  onDropFloat?: (tabId: string) => void;
  activeTab: string;
  secondaryTab?: string | null;
  allowedItems?: AppNavItem[];
}

export const SplitViewDragOverlay: React.FC<SplitViewDragOverlayProps> = ({
  onDropLeft,
  onDropRight,
  onDropFloat,
  activeTab,
  secondaryTab,
  allowedItems
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredZone, setHoveredZone] = useState<'left' | 'right' | 'float' | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);

  const hoveredZoneRef = useRef<'left' | 'right' | 'float' | null>(null);
  const draggedTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    hoveredZoneRef.current = hoveredZone;
  }, [hoveredZone]);

  useEffect(() => {
    draggedTabIdRef.current = draggedTabId;
  }, [draggedTabId]);

  // Derive tab label and icon
  const tabInfo = useMemo(() => {
    if (!draggedTabId) return { label: 'پنجره', Icon: Columns };
    const label = getSidebarLabel(draggedTabId, allowedItems);
    const Icon = getSidebarIcon(draggedTabId, allowedItems);
    return { label, Icon };
  }, [draggedTabId, allowedItems]);

  const calculateZoneFromCoords = (x: number, y: number): 'left' | 'right' | 'float' => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Top center zone -> Float window
    if (y < height * 0.28 && x > width * 0.35 && x < width * 0.65) {
      return 'float';
    }

    // Left half (Secondary/Split pane in RTL layout)
    if (x < width * 0.5) {
      return 'left';
    }

    // Right half (Primary pane)
    return 'right';
  };

  useEffect(() => {
    let isTabDragActive = false;

    const handleCustomStart = (e: any) => {
      const tabId = e.detail?.tabId;
      if (tabId) {
        setDraggedTabId(tabId);
        setIsDragging(true);
        isTabDragActive = true;
        if (e.detail?.clientX !== undefined && e.detail?.clientY !== undefined) {
          setPointerPos({ x: e.detail.clientX, y: e.detail.clientY });
          const zone = calculateZoneFromCoords(e.detail.clientX, e.detail.clientY);
          setHoveredZone(zone);
        }
      }
    };

    const handleCustomMove = (e: any) => {
      if (!isTabDragActive) return;
      const x = e.detail?.clientX;
      const y = e.detail?.clientY;
      if (x !== undefined && y !== undefined) {
        setPointerPos({ x, y });
        const zone = calculateZoneFromCoords(x, y);
        setHoveredZone(zone);
      }
    };

    const handleCustomEnd = (e: any) => {
      if (!isTabDragActive && !isDragging) return;
      const tabId = e.detail?.tabId || draggedTabIdRef.current;
      const currentZone = e.detail?.zone || hoveredZoneRef.current;

      setIsDragging(false);
      setHoveredZone(null);
      setDraggedTabId(null);
      setPointerPos(null);
      isTabDragActive = false;

      if (!e.detail?.cancelled && tabId) {
        if (currentZone === 'left') {
          onDropLeft(tabId);
        } else if (currentZone === 'right') {
          onDropRight(tabId);
        } else if (currentZone === 'float' && onDropFloat) {
          onDropFloat(tabId);
        } else if (currentZone === 'float') {
          onDropLeft(tabId);
        }
      }
    };

    const handleDragEnter = (e: DragEvent) => {
      let isWorkstationTab = false;
      if (e.dataTransfer && e.dataTransfer.types) {
        const typesList = Array.from(e.dataTransfer.types);
        isWorkstationTab = typesList.some(t => t.toLowerCase() === 'application/x-workstation-tab' || t.toLowerCase() === 'workstation-tab');
      }

      if (isWorkstationTab || isTabDragActive) {
        e.preventDefault();
        setIsDragging(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      let isWorkstationTab = false;
      if (e.dataTransfer && e.dataTransfer.types) {
        const typesList = Array.from(e.dataTransfer.types);
        isWorkstationTab = typesList.some(t => t.toLowerCase() === 'application/x-workstation-tab' || t.toLowerCase() === 'workstation-tab');
      }

      if (isWorkstationTab || isTabDragActive) {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
        if (e.clientX && e.clientY) {
          const zone = calculateZoneFromCoords(e.clientX, e.clientY);
          setHoveredZone(zone);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDragging(false);
        setHoveredZone(null);
        setDraggedTabId(null);
        setPointerPos(null);
        isTabDragActive = false;
      }
    };

    window.addEventListener('workstation-tab-drag-start', handleCustomStart);
    window.addEventListener('workstation-tab-drag-move', handleCustomMove);
    window.addEventListener('workstation-tab-drag-end', handleCustomEnd);
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('workstation-tab-drag-start', handleCustomStart);
      window.removeEventListener('workstation-tab-drag-move', handleCustomMove);
      window.removeEventListener('workstation-tab-drag-end', handleCustomEnd);
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onDropLeft, onDropRight, onDropFloat]);

  if (!isDragging) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 bottom-14 z-[9990] flex flex-col pointer-events-auto bg-black/40 backdrop-blur-sm transition-opacity duration-200 select-none animate-in fade-in"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const tabId = e.dataTransfer.getData('text/plain') || draggedTabId;
        const zone = hoveredZone || 'left';
        setIsDragging(false);
        setHoveredZone(null);
        setDraggedTabId(null);
        setPointerPos(null);
        if (tabId) {
          if (zone === 'left') onDropLeft(tabId);
          else if (zone === 'right') onDropRight(tabId);
          else if (zone === 'float' && onDropFloat) onDropFloat(tabId);
          else onDropLeft(tabId);
        }
      }}
    >
      {/* Top Bar with Floating Window Target and Instructions */}
      <div className="flex items-center justify-between px-6 pt-3 pb-1 shrink-0">
        <div className="flex items-center gap-2 bg-zinc-900/90 text-white px-4 py-2 rounded-2xl shadow-xl border border-zinc-700/60 pointer-events-none">
          <Columns size={18} className="text-blue-400 animate-pulse" />
          <span className="font-bold text-xs">حالت چیدمان هوشمند دو پنجره‌ای (اسپلیت ویو)</span>
          <span className="text-[11px] text-zinc-400 mr-2 border-r border-zinc-700 pr-2 font-mono">
            تب: {tabInfo.label}
          </span>
        </div>

        {/* Center Float / PiP Drop Zone */}
        {onDropFloat && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'copy';
              if (hoveredZone !== 'float') setHoveredZone('float');
            }}
            onDragLeave={(e) => {
              e.stopPropagation();
              if (hoveredZone === 'float') setHoveredZone(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const tabId = e.dataTransfer.getData('text/plain') || draggedTabId;
              setIsDragging(false);
              setHoveredZone(null);
              setDraggedTabId(null);
              setPointerPos(null);
              if (tabId) onDropFloat(tabId);
            }}
            className={`px-5 py-2.5 rounded-2xl border-2 border-dashed transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-lg ${
              hoveredZone === 'float'
                ? 'bg-amber-500 text-white border-amber-300 scale-105 shadow-amber-500/40 ring-4 ring-amber-400/30'
                : 'bg-zinc-900/80 text-amber-300 border-amber-500/50 hover:border-amber-400'
            }`}
          >
            <ExternalLink size={16} className={hoveredZone === 'float' ? 'animate-bounce' : ''} />
            <div className="text-right">
              <div className="text-xs font-black">پنجره شناور (Picture-in-Picture)</div>
              <div className="text-[10px] opacity-80">رها کنید تا به صورت معلق باز شود</div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setIsDragging(false);
            setHoveredZone(null);
            setDraggedTabId(null);
            setPointerPos(null);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 text-xs font-bold border border-zinc-700/60 shadow transition-colors cursor-pointer"
        >
          <X size={14} />
          <span>انصراف (Esc)</span>
        </button>
      </div>

      {/* Main Dual Snap Areas (Left & Right) */}
      <div className="flex-1 flex flex-row p-4 gap-4 min-h-0">
        {/* Left Drop Zone (Secondary / Split Pane) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
            if (hoveredZone !== 'left') setHoveredZone('left');
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            if (hoveredZone === 'left') setHoveredZone(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const tabId = e.dataTransfer.getData('text/plain') || draggedTabId;
            setIsDragging(false);
            setHoveredZone(null);
            setDraggedTabId(null);
            setPointerPos(null);
            if (tabId) {
              onDropLeft(tabId);
            }
          }}
          className={`w-1/2 h-full transition-all duration-200 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center p-6 backdrop-blur-md cursor-pointer ${
            hoveredZone === 'left'
              ? 'bg-purple-600/35 border-purple-400 scale-[0.99] shadow-2xl shadow-purple-500/40 ring-4 ring-purple-500/30'
              : 'bg-purple-950/20 border-purple-400/40 hover:bg-purple-900/30 hover:border-purple-300'
          }`}
        >
          <div className="p-6 rounded-3xl bg-white/95 dark:bg-zinc-900/95 text-purple-600 dark:text-purple-400 shadow-2xl flex flex-col items-center gap-3 max-w-sm text-center border border-purple-200 dark:border-purple-800 pointer-events-none transform transition-transform">
            <div className="p-4 bg-purple-100 dark:bg-purple-950/60 rounded-2xl text-purple-600 dark:text-purple-400 shadow-inner">
              <Columns size={40} className={hoveredZone === 'left' ? 'animate-bounce' : ''} />
            </div>
            <div>
              <h3 className="font-black text-base text-zinc-900 dark:text-white">
                پنجره سمت چپ (اسپلیت ویو)
              </h3>
              <p className="text-xs text-purple-700 dark:text-purple-300 font-bold mt-1">
                برای باز شدن «{tabInfo.label}» به صورت تقسیم صفحه اینجا رها کنید
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-1">
                مشاهده و کار همزمان با پنجره فعال فعلی
              </p>
            </div>
          </div>
        </div>

        {/* Right Drop Zone (Primary Pane in RTL) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
            if (hoveredZone !== 'right') setHoveredZone('right');
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            if (hoveredZone === 'right') setHoveredZone(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const tabId = e.dataTransfer.getData('text/plain') || draggedTabId;
            setIsDragging(false);
            setHoveredZone(null);
            setDraggedTabId(null);
            setPointerPos(null);
            if (tabId) {
              onDropRight(tabId);
            }
          }}
          className={`w-1/2 h-full transition-all duration-200 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center p-6 backdrop-blur-md cursor-pointer ${
            hoveredZone === 'right'
              ? 'bg-blue-600/35 border-blue-400 scale-[0.99] shadow-2xl shadow-blue-500/40 ring-4 ring-blue-500/30'
              : 'bg-blue-950/20 border-blue-400/40 hover:bg-blue-900/30 hover:border-blue-300'
          }`}
        >
          <div className="p-6 rounded-3xl bg-white/95 dark:bg-zinc-900/95 text-blue-600 dark:text-blue-400 shadow-2xl flex flex-col items-center gap-3 max-w-sm text-center border border-blue-200 dark:border-blue-800 pointer-events-none transform transition-transform">
            <div className="p-4 bg-blue-100 dark:bg-blue-950/60 rounded-2xl text-blue-600 dark:text-blue-400 shadow-inner">
              <Columns size={40} className={hoveredZone === 'right' ? 'animate-bounce' : ''} />
            </div>
            <div>
              <h3 className="font-black text-base text-zinc-900 dark:text-white">
                پنجره سمت راست (اصلی)
              </h3>
              <p className="text-xs text-blue-700 dark:text-blue-300 font-bold mt-1">
                برای باز شدن «{tabInfo.label}» در سمت راست اینجا رها کنید
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-1">
                قرارگیری به عنوان برنامه اولویت‌دار یا جابجایی
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Ghost Pill Attached to Pointer */}
      {pointerPos && draggedTabId && (
        <div
          className="fixed pointer-events-none z-[10000] -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 flex items-center gap-2 px-3 py-2 rounded-2xl bg-zinc-900 text-white border-2 border-blue-400 shadow-2xl shadow-black/80 ring-4 ring-blue-500/30"
          style={{
            left: `${pointerPos.x}px`,
            top: `${pointerPos.y}px`
          }}
        >
          <tabInfo.Icon size={16} className="text-blue-400 animate-spin-slow" />
          <span className="text-xs font-black">{tabInfo.label}</span>
          <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold">
            {hoveredZone === 'left' ? 'اسپلیت ویو' : hoveredZone === 'right' ? 'راست' : hoveredZone === 'float' ? 'شناور' : 'بکشید به چپ یا راست'}
          </span>
        </div>
      )}
    </div>
  );
};

