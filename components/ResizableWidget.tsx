import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  ChevronUp, ChevronDown, X, Maximize2, Minimize2, RotateCcw, 
  ArrowLeftRight, Lock, Eye, EyeOff, ChevronsUpDown, GripVertical, Move
} from 'lucide-react';

export interface WidgetSize {
  widthPercent?: number; // 15 to 100
  minHeight?: number;    // in pixels
}

interface ResizableWidgetProps {
  id: string;
  title: string;
  orderIndex: number;
  isFirst: boolean;
  isLast: boolean;
  isCustomizing: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  size?: WidgetSize;
  onSizeChange: (newSize: WidgetSize) => void;
  onResetSize: () => void;
  children: React.ReactNode;
  defaultWidthPercent?: number;
  className?: string;
  isLocked?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  // Drag and drop props
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
}

export const ResizableWidget: React.FC<ResizableWidgetProps> = ({
  id,
  title,
  orderIndex,
  isFirst,
  isLast,
  isCustomizing,
  onMoveUp,
  onMoveDown,
  onRemove,
  size,
  onSizeChange,
  onResetSize,
  children,
  defaultWidthPercent = 100,
  className = '',
  isLocked = false,
  isCollapsed = false,
  onToggleCollapse,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  isDragging = false,
  isDropTarget = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeMode, setResizeMode] = useState<'both' | 'width' | 'height' | null>(null);
  const [tempSize, setTempSize] = useState<WidgetSize | null>(null);

  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Active size calculation
  const currentWidthPercent = tempSize?.widthPercent ?? size?.widthPercent ?? defaultWidthPercent;
  const currentMinHeight = isCollapsed ? undefined : (tempSize?.minHeight ?? size?.minHeight);

  // Mouse Drag Resize Handler
  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    mode: 'both' | 'width' | 'height'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!containerRef.current) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = containerRef.current.getBoundingClientRect();
    const initialWidthPx = rect.width;
    const initialHeightPx = rect.height;

    // Get parent width to calculate percentage
    const parent = containerRef.current.parentElement;
    const parentWidthPx = parent ? parent.getBoundingClientRect().width : window.innerWidth;

    setIsResizing(true);
    setResizeMode(mode);

    // Temporarily disable text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = mode === 'both' ? 'nwse-resize' : mode === 'width' ? 'ew-resize' : 'ns-resize';

    let lastCalculatedSize: WidgetSize = {
      widthPercent: currentWidthPercent,
      minHeight: currentMinHeight ?? initialHeightPx,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newWidthPercent = currentWidthPercent;
      let newHeightPx = currentMinHeight ?? initialHeightPx;

      // In Persian RTL layout: dragging mouse to the LEFT increases width
      // and dragging to the RIGHT decreases width
      if (mode === 'both' || mode === 'width') {
        const adjustedDeltaX = -deltaX; // In RTL, left is positive growth
        const newWidthPx = Math.max(160, Math.min(parentWidthPx, initialWidthPx + adjustedDeltaX));
        let rawPercent = Math.round((newWidthPx / parentWidthPx) * 100);

        // Snap to common clean steps if close (20%, 25%, 33%, 50%, 66%, 75%, 100%)
        if (Math.abs(rawPercent - 20) < 2.5) rawPercent = 20;
        else if (Math.abs(rawPercent - 25) < 2.5) rawPercent = 25;
        else if (Math.abs(rawPercent - 33.33) < 3) rawPercent = 33.33;
        else if (Math.abs(rawPercent - 50) < 3.5) rawPercent = 50;
        else if (Math.abs(rawPercent - 66.66) < 3.5) rawPercent = 66.66;
        else if (Math.abs(rawPercent - 75) < 3.5) rawPercent = 75;
        else if (rawPercent > 92) rawPercent = 100;
        else if (rawPercent < 16) rawPercent = 16.66;

        newWidthPercent = Math.min(100, Math.max(15, rawPercent));
      }

      if (mode === 'both' || mode === 'height') {
        newHeightPx = Math.max(60, Math.min(1200, Math.round(initialHeightPx + deltaY)));
      }

      lastCalculatedSize = {
        widthPercent: newWidthPercent,
        minHeight: newHeightPx,
      };

      setTempSize(lastCalculatedSize);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      setIsResizing(false);
      setResizeMode(null);
      setTempSize(null);

      onSizeChange(lastCalculatedSize);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [currentWidthPercent, currentMinHeight, onSizeChange]);

  // Clean responsive width style allowing smaller widgets to sit side by side
  const getResponsiveStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {
      order: orderIndex,
    };

    // On mobile (< 768px), always use 100% full width to fit screen edge-to-edge
    if (isMobileScreen) {
      style.flex = '1 1 100%';
      style.width = '100%';
      style.maxWidth = '100%';
      style.minWidth = '0';
    } else if (currentWidthPercent && currentWidthPercent < 100) {
      // On desktop, apply custom width percentage and flex-basis
      style.flex = `0 0 calc(${currentWidthPercent}% - 0.75rem)`;
      style.maxWidth = `calc(${currentWidthPercent}% - 0.75rem)`;
      style.minWidth = '160px';
    } else {
      style.flex = '1 1 100%';
      style.width = '100%';
      style.maxWidth = '100%';
      style.minWidth = '0';
    }

    if (currentMinHeight && !isCollapsed) {
      style.minHeight = `${currentMinHeight}px`;
    }

    return style;
  };

  const isCustomizedSize = size?.widthPercent !== undefined || size?.minHeight !== undefined;
  const isFullWidth = Math.round(currentWidthPercent) >= 98;

  return (
    <div
      ref={containerRef}
      id={`widget-${id}`}
      style={getResponsiveStyle()}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative group transition-[flex,width,max-width,opacity,transform] duration-200 ease-out flex flex-col ${
        isResizing ? 'ring-2 ring-blue-500 shadow-xl z-30' : ''
      } ${
        isDragging ? 'opacity-35 scale-[0.98] border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-3xl' : ''
      } ${
        isDropTarget ? 'ring-2 ring-blue-500/80 ring-offset-2 ring-offset-transparent shadow-xl rounded-3xl scale-[1.01]' : ''
      } ${className}`}
    >
      {/* Real-time floating dimension badge while dragging with mouse */}
      {isResizing && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg border border-blue-400 flex items-center gap-2 animate-fade-in pointer-events-none">
          <ArrowLeftRight size={12} />
          <span>عرض: {Math.round(currentWidthPercent)}٪</span>
          {currentMinHeight && (
            <>
              <span className="opacity-40">|</span>
              <span>ارتفاع: {Math.round(currentMinHeight)}px</span>
            </>
          )}
        </div>
      )}

      {/* Drop Target Guide Indicator */}
      {isDropTarget && !isDragging && (
        <div className="absolute inset-0 z-40 bg-blue-500/10 dark:bg-blue-500/20 border-2 border-blue-500 rounded-3xl flex items-center justify-center pointer-events-none backdrop-blur-[1px] animate-pulse">
          <div className="bg-blue-600 text-white text-xs font-black px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1.5">
            <Move size={14} />
            <span>رها کنید تا در این جایگاه قرار گیرد</span>
          </div>
        </div>
      )}

      {/* Top Customizer Bar (ONLY visible when customize mode is active) */}
      {isCustomizing && (
        <div className="transition-all duration-200 opacity-100 mb-1.5">
          <div className="flex items-center gap-1 bg-zinc-900/95 hover:bg-zinc-900 text-white rounded-xl px-2 py-1 shadow-lg border border-zinc-700/70 backdrop-blur-md text-[10px]">
          {/* Drag Grip Handle */}
          <div
            draggable={!isLocked}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className={`p-1 rounded flex items-center justify-center transition-all ${
              isLocked 
                ? 'opacity-40 cursor-not-allowed text-zinc-500' 
                : 'cursor-grab active:cursor-grabbing hover:bg-zinc-800 text-blue-400 hover:text-white'
            }`}
            title={isLocked ? 'ابزارک قفل شده است' : 'با ماوس بکشید تا جایگاه ابزارک را بالا/پایین یا کنار هم تغییر دهید'}
          >
            <GripVertical size={13} />
          </div>

          {/* Lock indicator */}
          {isLocked && (
            <span className="flex items-center gap-1 text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded text-[9px] font-bold border border-amber-500/30" title="قفل‌شده توسط مدیر سیستم">
              <Lock size={10} />
              <span>قفل مدیر</span>
            </span>
          )}

          <span className="font-bold text-zinc-300 ml-1 hidden sm:inline max-w-[100px] truncate">{title}</span>

          {/* Quick preset width buttons - including compact 20% and 25% */}
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded-lg p-0.5 mr-0.5">
            <button
              type="button"
              onClick={() => onSizeChange({ widthPercent: 20, minHeight: currentMinHeight })}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                Math.round(currentWidthPercent) === 20 ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
              title="یک‌پنجم (۲۰٪) - بسیار کوچک"
            >
              ۲۰٪
            </button>
            <button
              type="button"
              onClick={() => onSizeChange({ widthPercent: 25, minHeight: currentMinHeight })}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                Math.round(currentWidthPercent) === 25 ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
              title="یک‌چهارم (۲۵٪)"
            >
              ۲۵٪
            </button>
            <button
              type="button"
              onClick={() => onSizeChange({ widthPercent: 33.33, minHeight: currentMinHeight })}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                Math.round(currentWidthPercent) === 33 ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
              title="یک‌سوم (۳۳٪)"
            >
              ۳۳٪
            </button>
            <button
              type="button"
              onClick={() => onSizeChange({ widthPercent: 50, minHeight: currentMinHeight })}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                Math.round(currentWidthPercent) === 50 ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
              title="نیم‌صفحه (۵۰٪)"
            >
              ۵۰٪
            </button>
            <button
              type="button"
              onClick={() => onSizeChange({ widthPercent: 100, minHeight: currentMinHeight })}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                Math.round(currentWidthPercent) === 100 ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
              title="تمام‌عرض (۱۰۰٪)"
            >
              ۱۰۰٪
            </button>
          </div>

          {/* Maximize / Minimize toggle button */}
          <button
            type="button"
            onClick={() => onSizeChange({ widthPercent: isFullWidth ? (defaultWidthPercent < 100 ? defaultWidthPercent : 33.33) : 100, minHeight: currentMinHeight })}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center justify-center"
            title={isFullWidth ? 'کوچک کردن' : 'بزرگ کردن کامل (۱۰۰٪)'}
          >
            {isFullWidth ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>

          {/* Collapse/Expand toggle button */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={`p-1 hover:bg-zinc-800 rounded transition-all cursor-pointer flex items-center justify-center ${
                isCollapsed ? 'text-amber-400' : 'text-zinc-300 hover:text-white'
              }`}
              title={isCollapsed ? 'گسترش و باز کردن محتوای ابزارک' : 'جمع کردن و فشرده‌سازی ابزارک'}
            >
              <ChevronsUpDown size={11} />
            </button>
          )}

          {/* Reset button if custom size exists */}
          {isCustomizedSize && (
            <button
              type="button"
              onClick={onResetSize}
              className="p-1 hover:bg-zinc-800 rounded text-amber-400 transition-all cursor-pointer flex items-center gap-0.5 text-[9px]"
              title="بازنشانی اندازه به حالت پیش‌فرض"
            >
              <RotateCcw size={11} />
            </button>
          )}

          {/* Reordering and remove buttons */}
          <div className="flex items-center gap-0.5 border-r border-zinc-700 pr-1 mr-0.5">
            <button
              type="button"
              disabled={isFirst}
              onClick={onMoveUp}
              className="p-1 hover:bg-zinc-800 rounded disabled:opacity-30 transition-all flex items-center justify-center cursor-pointer text-zinc-300"
              title="انتقال به جلو"
            >
              <ChevronUp size={12} />
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={onMoveDown}
              className="p-1 hover:bg-zinc-800 rounded disabled:opacity-30 transition-all flex items-center justify-center cursor-pointer text-zinc-300"
              title="انتقال به عقب"
            >
              <ChevronDown size={12} />
            </button>
            <button
              type="button"
              disabled={isLocked}
              onClick={onRemove}
              className={`p-1 rounded transition-all flex items-center justify-center ${
                isLocked 
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50' 
                  : 'hover:bg-red-600 cursor-pointer bg-red-500/80 text-white'
              }`}
              title={isLocked ? 'این ابزارک توسط مدیر قفل شده و قابل حذف نیست' : 'حذف ابزارک از پیشخوان'}
            >
              <X size={12} />
            </button>
          </div>
        </div>
        </div>
      )}

      {/* Widget Content Container */}
      {isCollapsed ? (
        <div 
          onClick={onToggleCollapse}
          className="w-full bg-white/70 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between backdrop-blur-md group/collapsed"
          title="کلیک برای باز کردن کامل ابزارک"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="font-black text-xs text-zinc-800 dark:text-zinc-200">{title}</span>
            <span className="text-[10px] text-zinc-400 font-medium">(فشرده‌شده)</span>
          </div>
          <button 
            type="button"
            className="text-xs text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1 group-hover/collapsed:translate-x-[-2px] transition-transform"
          >
            <span>باز کردن</span>
            <ChevronDown size={14} />
          </button>
        </div>
      ) : (
        <div 
          className="w-full flex-1 flex flex-col relative"
          style={{ minHeight: currentMinHeight ? `${currentMinHeight}px` : undefined }}
        >
          {children}
        </div>
      )}

      {/* --- MOUSE DRAG RESIZE HANDLES (Active when not collapsed and in customize mode) --- */}
      {!isCollapsed && isCustomizing && (
        <>
          {/* 1. Bottom-Left Corner Resize Handle (in RTL, left is where dragging expands width and bottom expands height) */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 'both')}
            onDoubleClick={onResetSize}
            className="absolute -bottom-1 -left-1 z-30 w-5 h-5 flex items-center justify-center cursor-nesw-resize opacity-80 hover:!opacity-100 transition-opacity select-none"
            title="بکشید تا اندازه (عرض و ارتفاع) تغییر کند (دابل‌کلیک برای بازنشانی)"
          >
            <div className="w-3.5 h-3.5 rounded-bl-md border-b-2 border-l-2 border-blue-500 bg-white dark:bg-zinc-900 shadow-sm flex items-center justify-center">
              <div className="w-1 h-1 bg-blue-500 rounded-full" />
            </div>
          </div>

          {/* 2. Bottom-Right Corner Handle (alternate corner) */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 'both')}
            onDoubleClick={onResetSize}
            className="absolute -bottom-1 -right-1 z-30 w-5 h-5 flex items-center justify-center cursor-nwse-resize opacity-80 hover:!opacity-100 transition-opacity select-none"
            title="بکشید تا اندازه تغییر کند"
          >
            <div className="w-3.5 h-3.5 rounded-br-md border-b-2 border-r-2 border-blue-500 bg-white dark:bg-zinc-900 shadow-sm flex items-center justify-center">
              <div className="w-1 h-1 bg-blue-500 rounded-full" />
            </div>
          </div>

          {/* 3. Bottom Edge Resize Handle (Adjust height) */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 'height')}
            onDoubleClick={onResetSize}
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-20 w-16 h-3 flex items-center justify-center cursor-ns-resize opacity-80 hover:!opacity-100 transition-opacity select-none"
            title="بکشید تا ارتفاع تنظیم شود"
          >
            <div className="w-10 h-1 rounded-full bg-blue-500/70 shadow-sm" />
          </div>

          {/* 4. Left Edge Resize Handle (Adjust width) */}
          <div
            onMouseDown={(e) => handleMouseDown(e, 'width')}
            onDoubleClick={onResetSize}
            className="absolute top-1/2 -left-1.5 -translate-y-1/2 z-20 w-3 h-16 flex items-center justify-center cursor-ew-resize opacity-80 hover:!opacity-100 transition-opacity select-none"
            title="بکشید تا عرض تنظیم شود"
          >
            <div className="w-1 h-10 rounded-full bg-blue-500/70 shadow-sm" />
          </div>
        </>
      )}
    </div>
  );
};

