/**
 * A callout style playing on a loop, for the style picker dialog.
 *
 * It goes through the real pipeline like the still previews (`stylePreview.ts`):
 * a sample callout, `prepareAnnotationFrame` and `drawAnnotationFrame` on a
 * canvas. The playhead walks the callout's life (entrance, a hold, exit), rests
 * on an empty beat and starts again. There is no backdrop: the callout sits on
 * the dialog itself. Under reduced motion it shows the settled still, and
 * bumping `replay` plays one cycle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createCalloutItem } from '@/store/itemFactories';
import type { CalloutItem } from '@/store/types';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { loopTime, type LoopTiming } from './styleLoop';
import { collectSceneAssets, drawAnnotationFrame, getFrameBounds, loadSceneAssets, prepareAnnotationFrame } from '../draw';

/** Seconds the callout holds between its entrance and exit. */
const HOLD = 1.7;
/** Empty seconds between loops. */
const GAP = 0.55;
/** Largest enlargement of the artwork; 1 is real size. */
const MAX_SCALE = 1.4;
/** Room kept round the artwork, in CSS pixels. */
const MARGIN = 8;
/** The measured box is padded for shadows and overshoot; the fit trims it to the artwork. */
const PAD_TRIM = 16;
/** Where the sample callout sits. Only its place on the canvas matters. */
const SAMPLE_POINT: [number, number] = [2.3522, 48.8566];

/** Fonts and images per style and text, loaded once. */
const assetLoads = new Map<string, Promise<void>>();
function loadAssets(item: CalloutItem, key: string): Promise<void> {
  let pending = assetLoads.get(key);
  if (!pending) {
    const frame = prepareAnnotationFrame(item, 0, { settled: true });
    pending = (frame ? loadSceneAssets(collectSceneAssets(frame.scene)) : Promise.resolve()).catch(() => {});
    assetLoads.set(key, pending);
  }
  return pending;
}

interface AnimatedStylePreviewProps {
  styleId: string;
  text: string;
  /** Changing it starts the loop again from the entrance, so two previews stay in step. */
  restartKey?: unknown;
  /** Reduced motion only: bumping it plays one cycle. */
  replay?: number;
}

export function AnimatedStylePreview({ styleId, text, restartKey, replay = 0 }: AnimatedStylePreviewProps) {
  const reduced = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });
  const [loadedKey, setLoadedKey] = useState('');
  const key = `${styleId}|${text}`;

  const built = useMemo(() => {
    const base = createCalloutItem({ styleId, content: { title: text }, lngLat: SAMPLE_POINT, startTime: 0 });
    if (!base) return null;
    const end = base.transition.enterDuration + HOLD + base.transition.exitDuration;
    const timing: LoopTiming = { end, cycle: end + GAP };
    return { item: { ...base, endTime: end } as CalloutItem, timing };
  }, [styleId, text]);

  // The canvas follows its box.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((s) => (s.w === w && s.h === h && s.dpr === dpr ? s : { w, h, dpr }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fonts and images first, so frames are measured and drawn with the final ones.
  useEffect(() => {
    if (!built) return;
    let current = true;
    loadAssets(built.item, key).then(() => { if (current) setLoadedKey(key); });
    return () => { current = false; };
  }, [built, key]);

  const ready = !!built && loadedKey === key && size.w > 0 && size.h > 0;

  // The fit comes from the settled frame, so the artwork keeps its place while it animates.
  const fit = useMemo(() => {
    if (!ready || !built) return null;
    const frame = prepareAnnotationFrame(built.item, 0, { settled: true });
    if (!frame) return null;
    const b = getFrameBounds(frame);
    const w = Math.max(1, b.maxX - b.minX - 2 * PAD_TRIM);
    const h = Math.max(1, b.maxY - b.minY - 2 * PAD_TRIM);
    const scale = Math.min(MAX_SCALE, (size.w - 2 * MARGIN) / w, (size.h - 2 * MARGIN) / h);
    return { scale, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 };
  }, [ready, built, size]);

  /** Draws the callout at a time, the settled still for null time, or nothing on the empty beat. */
  const draw = useCallback((time: number | null, settled = false) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !built || !fit) return;
    if (canvas.width !== Math.round(size.w * size.dpr)) canvas.width = Math.round(size.w * size.dpr);
    if (canvas.height !== Math.round(size.h * size.dpr)) canvas.height = Math.round(size.h * size.dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (time === null && !settled) return;
    const frame = prepareAnnotationFrame(built.item, time ?? 0, { settled });
    if (!frame) return;
    ctx.scale(size.dpr, size.dpr);
    ctx.translate(size.w / 2, size.h / 2);
    ctx.scale(fit.scale, fit.scale);
    ctx.translate(-fit.cx, -fit.cy);
    drawAnnotationFrame(ctx, frame, 0, 0);
  }, [built, fit, size]);

  // Loops, or under reduced motion shows the still and plays one cycle per replay.
  useEffect(() => {
    if (!built || !fit) return;
    const playOnce = reduced && replay > 0;
    if (reduced && !playOnce) {
      draw(null, true);
      return;
    }
    let start = -1;
    let frameId = requestAnimationFrame(function tick(now) {
      if (start < 0) start = now;
      const elapsed = (now - start) / 1000;
      if (playOnce && elapsed >= built.timing.cycle) {
        draw(null, true);
        return;
      }
      draw(loopTime(elapsed, built.timing));
      frameId = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frameId);
    // restartKey is only there to restart the loop.
  }, [built, fit, draw, reduced, replay, restartKey]);

  return <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />;
}
