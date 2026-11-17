/**
 * Touch Pinch-to-Zoom & 4-Way Pan Math Utilities
 * Supports strictly two-finger pinch-to-zoom (no 1-finger zoom)
 * and 4-directional touch panning/scrolling (left, right, top, bottom) on images and PDFs.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface ZoomPanState {
  scale: number;
  panX: number;
  panY: number;
}

export interface ViewportBounds {
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
}

export const MIN_TOUCH_ZOOM = 0.5;
export const MAX_TOUCH_ZOOM = 8;

export function clampZoom(scale: number, min = MIN_TOUCH_ZOOM, max = MAX_TOUCH_ZOOM): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(max, Math.max(min, Math.round(scale * 1000) / 1000));
}

export function getTouchDistance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

export function getTouchMidpoint(p1: Point2D, p2: Point2D): Point2D {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

/**
 * Clamps 4-way pan offsets (panX, panY) so the content can be panned
 * freely in all 4 directions (left, right, up, down) without flying completely off-screen.
 * Also supports panning tall/wide content at 1x scale if content exceeds viewport.
 */
export function clampPanOffsets(
  panX: number,
  panY: number,
  scale: number,
  bounds?: Partial<ViewportBounds>
): { panX: number; panY: number } {
  if (!Number.isFinite(panX)) panX = 0;
  if (!Number.isFinite(panY)) panY = 0;

  const vw = bounds?.viewportWidth && bounds.viewportWidth > 0 ? bounds.viewportWidth : 800;
  const vh = bounds?.viewportHeight && bounds.viewportHeight > 0 ? bounds.viewportHeight : 800;
  const cw = bounds?.contentWidth && bounds.contentWidth > 0 ? bounds.contentWidth : vw;
  const ch = bounds?.contentHeight && bounds.contentHeight > 0 ? bounds.contentHeight : vh;

  const scaledWidth = cw * scale;
  const scaledHeight = ch * scale;

  if (scale <= 1.01) {
    // At 1x scale, allow vertical/horizontal panning if the rendered content is larger than the viewport
    const overflowX = Math.max(0, (scaledWidth - vw) / 2);
    const overflowY = Math.max(0, (scaledHeight - vh) / 2);
    return {
      panX: overflowX > 0 ? Math.min(overflowX, Math.max(-overflowX, panX)) : 0,
      panY: overflowY > 0 ? Math.min(overflowY, Math.max(-overflowY, panY)) : 0,
    };
  }

  // When zoomed in (scale > 1.01), guarantee generous 4-way pan freedom in all 4 directions
  // even when the base image is smaller than the viewport on one axis.
  const maxPanX = Math.max(
    (scaledWidth - vw) / 2 + vw * 0.45,
    (vw * scale - vw) / 2 + vw * 0.35,
    vw * 0.5
  );
  const maxPanY = Math.max(
    (scaledHeight - vh) / 2 + vh * 0.45,
    (vh * scale - vh) / 2 + vh * 0.35,
    vh * 0.5
  );

  return {
    panX: Math.min(maxPanX, Math.max(-maxPanX, panX)),
    panY: Math.min(maxPanY, Math.max(-maxPanY, panY)),
  };
}

/**
 * Computes new scale and pan offsets during a two-finger pinch gesture,
 * keeping the pinch focal point anchored under the user's fingers while allowing simultaneous 4-way pan.
 */
export function computePinchZoomPan(params: {
  initialScale: number;
  initialPanX: number;
  initialPanY: number;
  initialDistance: number;
  currentDistance: number;
  initialMidpoint: Point2D;
  currentMidpoint: Point2D;
  viewportCenter: Point2D;
  bounds?: Partial<ViewportBounds>;
}): ZoomPanState {
  const {
    initialScale,
    initialPanX,
    initialPanY,
    initialDistance,
    currentDistance,
    initialMidpoint,
    currentMidpoint,
    viewportCenter,
    bounds,
  } = params;

  if (initialDistance <= 1 || currentDistance <= 1) {
    return { scale: initialScale, panX: initialPanX, panY: initialPanY };
  }

  const rawRatio = currentDistance / initialDistance;
  const nextScale = clampZoom(initialScale * rawRatio);
  const effectiveRatio = nextScale / (initialScale || 1);

  // Focal offset relative to viewport center at start of pinch
  const focalOffsetX = initialMidpoint.x - viewportCenter.x;
  const focalOffsetY = initialMidpoint.y - viewportCenter.y;

  // Midpoint translation (two-finger pan while pinching)
  const deltaMidX = currentMidpoint.x - initialMidpoint.x;
  const deltaMidY = currentMidpoint.y - initialMidpoint.y;

  const rawPanX = focalOffsetX - (focalOffsetX - initialPanX) * effectiveRatio + deltaMidX;
  const rawPanY = focalOffsetY - (focalOffsetY - initialPanY) * effectiveRatio + deltaMidY;

  const clamped = clampPanOffsets(rawPanX, rawPanY, nextScale, bounds);
  return {
    scale: nextScale,
    panX: clamped.panX,
    panY: clamped.panY,
  };
}
