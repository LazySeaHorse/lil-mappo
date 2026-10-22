import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapRef } from '@/hooks/useMapRef';
import { useResponsive } from '@/hooks/useResponsive';
import { fitFrame, fitView, moveToFitView } from '@/engine/viewFit';
import { NO_FIT_VIEW, setViewFit } from '@/engine/viewOffset';

/**
 * Fit mode: a preview of the exported video's frame in the free space between the panels. The
 * map is never resized; it is zoomed out and padded so the full-screen framing sits in the frame
 * (see viewFit). Everything outside the frame is dimmed, and a crosshair marks its centre.
 */
export function FitModeLayer({ mapReady }: { mapReady: boolean }) {
  const mapRef = useMapRef();
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const { isFitMode, hideUI, resolution, timelineHeight } = useProjectStore(
    useShallow((s) => ({ isFitMode: s.isFitMode, hideUI: s.hideUI, resolution: s.resolution, timelineHeight: s.timelineHeight })),
  );
  const { isMobile, isTablet, isToolbarCollapsed } = useResponsive();
  // Phones and the narrow layouts have no Fit button, and zen mode hides the panels the frame sits between.
  const active = isFitMode && !hideUI && !isToolbarCollapsed;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => setSize({ width: root.clientWidth, height: root.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const frame = useMemo(
    () => (size ? fitFrame(size, resolution[0] / resolution[1], { isMobile, isTablet }, timelineHeight) : null),
    [size, resolution, isMobile, isTablet, timelineHeight],
  );
  const view = useMemo(() => (active && size && frame ? fitView(size, frame) : NO_FIT_VIEW), [active, size, frame]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (map && mapReady) moveToFitView(map, view);
  }, [mapRef, mapReady, view]);

  // Leaving the editor leaves the view as full screen for whatever opens next.
  useEffect(() => () => setViewFit(NO_FIT_VIEW), []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      data-testid="fit-mode-layer"
      className="absolute inset-0 z-[5] pointer-events-none overflow-hidden transition-opacity duration-500"
      style={{ opacity: active && frame ? 1 : 0 }}
    >
      {frame && (
        <div
          data-testid="fit-frame"
          className="absolute border border-white/70"
          style={{
            left: frame.x,
            top: frame.y,
            width: frame.width,
            height: frame.height,
            boxShadow: '0 0 0 100vmax rgba(0, 0, 0, 0.4)',
          }}
        >
          <div data-testid="fit-reticle" className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/80" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/80" />
          </div>
        </div>
      )}
    </div>
  );
}
