import React, { useState, useRef, useEffect, useCallback } from 'react';

interface PinchZoomContainerProps {
  children: React.ReactNode;
  /** Natural width of the inner document/table on mobile (e.g. 860 for wide tables, 794 for A4) */
  contentWidth?: number;
  /** Whether to auto-fit to container width on mobile (< 768px) by default */
  autoFitMobile?: boolean;
  /** Minimum allowed scale */
  minScale?: number;
  /** Maximum allowed scale */
  maxScale?: number;
  /** Optional className for outer wrapper */
  className?: string;
  /** Deprecated: kept for prop compatibility; touch pinch-to-zoom works natively without any toolbar */
  showToolbar?: boolean;
  /** Whether to apply zoom behavior on desktop too (default: false for tables, true if alwaysZoomable) */
  alwaysZoomable?: boolean;
}

export const PinchZoomContainer: React.FC<PinchZoomContainerProps> = ({
  children,
  contentWidth = 860,
  autoFitMobile = true,
  minScale = 0.25,
  maxScale = 3.0,
  className = '',
  alwaysZoomable = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [isMobileView, setIsMobileView] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [scale, setScale] = useState<number>(1);
  const [fitScale, setFitScale] = useState<number>(1);
  const [naturalHeight, setNaturalHeight] = useState<number>(0);

  // Touch pinch state
  const touchStateRef = useRef<{
    initialDistance: number | null;
    initialScale: number;
    lastTapTime: number;
  }>({
    initialDistance: null,
    initialScale: 1,
    lastTapTime: 0,
  });

  const activeZoomMode = alwaysZoomable || isMobileView;

  const calculateFit = useCallback(() => {
    if (typeof window === 'undefined') return;
    const mobile = window.innerWidth < 768;
    setIsMobileView(mobile);

    if (!alwaysZoomable && !mobile) {
      setScale(1);
      setFitScale(1);
      return;
    }

    const containerEl = containerRef.current;
    const availableWidth = containerEl && containerEl.clientWidth > 0
      ? Math.max(containerEl.clientWidth - 2, 220)
      : Math.max(window.innerWidth - 24, 220);

    if (availableWidth < contentWidth) {
      // Floor to 3 decimals so scaledWidth never exceeds availableWidth by 1px
      const calculated = Math.max(minScale, Math.floor((availableWidth / contentWidth) * 1000) / 1000);
      setFitScale(calculated);
      if (autoFitMobile) {
        setScale(calculated);
      }
    } else {
      setFitScale(1);
      setScale(1);
    }
  }, [alwaysZoomable, autoFitMobile, contentWidth, minScale]);

  // Measure natural height of inner content so scaled container has exact height
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (contentRef.current) {
        setNaturalHeight(contentRef.current.scrollHeight || contentRef.current.offsetHeight);
      }
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, activeZoomMode]);

  useEffect(() => {
    calculateFit();
    const timer = setTimeout(calculateFit, 100);
    window.addEventListener('resize', calculateFit);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateFit);
    };
  }, [calculateFit]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!activeZoomMode) return;

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStateRef.current.initialDistance = Math.hypot(dx, dy);
      touchStateRef.current.initialScale = scale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      const delta = now - touchStateRef.current.lastTapTime;
      if (delta > 0 && delta < 280) {
        // Double tap toggles between Fit-to-Screen and 100% readable zoom
        setScale((prev) => (Math.abs(prev - fitScale) < 0.08 ? Math.min(1.0, maxScale) : fitScale));
        touchStateRef.current.lastTapTime = 0;
      } else {
        touchStateRef.current.lastTapTime = now;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!activeZoomMode) return;

    if (e.touches.length === 2 && touchStateRef.current.initialDistance !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.hypot(dx, dy);
      const ratio = currentDistance / touchStateRef.current.initialDistance;
      const nextScale = Math.min(
        maxScale,
        Math.max(minScale, Number((touchStateRef.current.initialScale * ratio).toFixed(3)))
      );
      setScale(nextScale);
    }
  };

  const handleTouchEnd = () => {
    touchStateRef.current.initialDistance = null;
  };

  if (!activeZoomMode) {
    return <div className={className}>{children}</div>;
  }

  const scaledWidth = Math.floor(contentWidth * scale);
  const scaledHeight = naturalHeight > 0 ? Math.ceil(naturalHeight * scale) : undefined;
  const isZoomedIn = scale > fitScale + 0.02;

  return (
    <div className={`flex flex-col w-full max-w-full ${className}`}>
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={`w-full max-w-full rounded-xl bg-white dark:bg-slate-900 ${
          isZoomedIn ? 'overflow-x-auto overflow-y-auto touch-pan-x touch-pan-y' : 'overflow-x-hidden overflow-y-visible touch-pan-y'
        }`}
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'auto',
          touchAction: 'pan-y pinch-zoom',
        }}
      >
        <div
          style={{
            width: isZoomedIn ? `${scaledWidth}px` : '100%',
            height: scaledHeight ? `${scaledHeight}px` : 'auto',
            margin: '0 auto',
            position: 'relative',
            overflow: isZoomedIn ? 'hidden' : 'visible',
          }}
        >
          <div
            ref={contentRef}
            dir="rtl"
            style={{
              width: `${contentWidth}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top right',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
