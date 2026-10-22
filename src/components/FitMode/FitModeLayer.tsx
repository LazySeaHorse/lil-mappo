import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapRef } from '@/hooks/useMapRef';
import { useResponsive } from '@/hooks/useResponsive';
import { frameDuration } from '@/engine/mapFraming';
import { fitCard, fitFrame, fitView, moveToFitView } from '@/engine/viewFit';
import { NO_FIT_VIEW, setViewFit } from '@/engine/viewOffset';

/** The panels' corner radius (rounded-2xl). */
const CARD_RADIUS = 16;
/** Share of black over the map outside the card, and over the card outside the video frame. */
const OUTSIDE_DIM = 0.6;
const CARD_DIM = 0.32;

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

  const card = useMemo(() => (size ? fitCard(size, { isMobile, isTablet }, timelineHeight) : null), [size, isMobile, isTablet, timelineHeight]);
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

  // The card and the frame move with the camera ease, so they use its duration and curve.
  const ms = frameDuration();
  const ease = `${ms}ms cubic-bezier(0.25, 0, 0.25, 1)`;
  const shown = active && !!card && !!frame;
  const rect = shown ? card : size && { x: 0, y: 0, width: size.width, height: size.height };

  return (
    <div
      ref={rootRef}
      aria-hidden
      data-testid="fit-mode-layer"
      data-active={shown}
      className="absolute inset-0 z-[5] pointer-events-none overflow-hidden"
    >
      {rect && frame && card && (
        <div
          data-testid="fit-card"
          className="absolute overflow-hidden"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            borderRadius: shown ? CARD_RADIUS : 0,
            // A thin ring like the panels' border, and the map outside the card dimmed.
            boxShadow: `0 0 0 1px rgba(255, 255, 255, ${shown ? 0.14 : 0}), 0 0 0 100vmax rgba(0, 0, 0, ${shown ? OUTSIDE_DIM : 0})`,
            transition: ['left', 'top', 'width', 'height', 'border-radius', 'box-shadow'].map((p) => `${p} ${ease}`).join(', '),
          }}
        >
          <div
            data-testid="fit-frame"
            className="absolute"
            style={{
              left: frame.x - card.x,
              top: frame.y - card.y,
              width: frame.width,
              height: frame.height,
              // The video is the clear part; the rest of the card is dimmed lightly.
              boxShadow: `0 0 0 100vmax rgba(0, 0, 0, ${shown ? CARD_DIM : 0})`,
              transition: `box-shadow ${ease}`,
            }}
          >
            <div
              data-testid="fit-reticle"
              className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2"
              style={{ opacity: shown ? 1 : 0, transition: `opacity ${ease}`, filter: 'drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.55))' }}
            >
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/75" />
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/75" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
