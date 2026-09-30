/**
 * Browser side of the callout filmstrip (see run.mjs). Draws a style's frames
 * through the same prepare/draw functions the preview and export use.
 */
import '@/annotations/styles';
import {
  type AnnotationFrame,
  collectSceneAssets,
  drawAnnotationFrame,
  getFrameBounds,
  loadSceneAssets,
  prepareAnnotationFrame,
} from '@/annotations/draw';
import { getAllStyles, getStyle } from '@/annotations/registry';
import { createCalloutItem } from '@/store/itemFactories';
import type { CalloutItem } from '@/store/types';

export interface Variant {
  name: string;
  content: CalloutItem['content'];
  settings?: Record<string, unknown>;
  offset?: [number, number];
  altitude?: number;
  scale?: number;
  /** Ground point in the cell as fractions of its size. Default [0.2, 0.85]. */
  ground?: [number, number];
}

export interface FilmstripSpec {
  styleId: string;
  variants: Variant[];
  /** Named background colours; every variant is drawn on each. */
  backgrounds: Record<string, string>;
  /** Entrance frames to sample. Default 8. */
  samples: number;
  /** Also sample the exit. Default false. */
  exit: boolean;
  cellWidth: number;
  cellHeight: number;
  /** Outline the frame bounds (the canvas the app would allocate). Default true. */
  showBounds: boolean;
}

/** Room left round a callout in a contact-sheet cell, in pixels. */
const CELL_MARGIN = 24;

const START = 0;
const END = 10;

function buildCallout(styleId: string, variant: Variant): CalloutItem {
  const item = createCalloutItem({
    styleId,
    content: variant.content,
    lngLat: [10, 20],
    startTime: START,
    endTime: END,
  });
  if (!item) throw new Error(`Unknown style "${styleId}"`);
  if (variant.settings) item.settings = { ...item.settings, ...variant.settings };
  if (variant.offset) item.offset = variant.offset;
  if (variant.scale) item.scale = variant.scale;
  if (variant.altitude !== undefined && item.binding.kind === 'geographic') {
    item.binding = { ...item.binding, altitude: variant.altitude };
  }
  return item;
}

/** Playhead times: evenly through the entrance, a settled frame, and optionally the exit. */
function sampleTimes(callout: CalloutItem, samples: number, exit: boolean): number[] {
  const { enterDuration, exitDuration } = callout.transition;
  const enter = Array.from({ length: samples }, (_, i) => START + (enterDuration * (i + 1)) / (samples + 1));
  const settled = START + enterDuration + (END - START - enterDuration - exitDuration) / 2;
  const leave = exit
    ? Array.from({ length: samples }, (_, i) => END - exitDuration + (exitDuration * (i + 1)) / (samples + 1))
    : [];
  return [...enter, settled, ...leave];
}

/** A faint street-grid stand-in for a map, so contrast is judged on something busy. */
function paintBackground(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 6;
  for (let i = -2; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 60, y);
    ctx.lineTo(x + i * 60 + 90, y + h);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 2;
  for (let j = 0; j < 6; j++) {
    ctx.beginPath();
    ctx.moveTo(x, y + j * 45);
    ctx.lineTo(x + w, y + j * 45 - 20);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draws a frame with its ground point at (gx, gy), clipped to the frame bounds as the app's canvas is. */
function drawFrameAt(ctx: CanvasRenderingContext2D, frame: AnnotationFrame, gx: number, gy: number, showBounds: boolean) {
  const bounds = getFrameBounds(frame);
  const box = [gx + bounds.minX, gy + bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY] as const;

  ctx.save();
  if (showBounds) {
    ctx.strokeStyle = 'rgba(255,0,80,0.6)';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(...box);
    ctx.setLineDash([]);
  }
  // Clip to the bounds as the real canvas marker does: anything outside is lost.
  ctx.beginPath();
  ctx.rect(...box);
  ctx.clip();
  drawAnnotationFrame(ctx, frame, gx, gy);
  ctx.restore();
}

export async function renderFilmstrip(canvas: HTMLCanvasElement, spec: FilmstripSpec): Promise<void> {
  const style = getStyle(spec.styleId);
  if (!style) throw new Error(`Unknown style "${spec.styleId}"`);

  const rows = Object.entries(spec.backgrounds).flatMap(([background, color]) =>
    spec.variants.map((variant) => ({ background, color, variant, callout: buildCallout(spec.styleId, variant) })));
  const times = rows.map((row) => sampleTimes(row.callout, spec.samples, spec.exit));
  const cols = Math.max(...times.map((t) => t.length));

  canvas.width = cols * spec.cellWidth;
  canvas.height = rows.length * spec.cellHeight;
  const ctx = canvas.getContext('2d')!;

  // Canvas text needs its fonts loaded up front; use the settled state's.
  for (const [r, row] of rows.entries()) {
    const settled = prepareAnnotationFrame(row.callout, times[r][spec.samples]);
    if (settled) await loadSceneAssets(collectSceneAssets(settled.scene));
  }

  rows.forEach((row, r) => {
    times[r].forEach((t, c) => {
      const x = c * spec.cellWidth;
      const y = r * spec.cellHeight;
      paintBackground(ctx, x, y, spec.cellWidth, spec.cellHeight, row.color);

      const frame = prepareAnnotationFrame(row.callout, t);
      if (frame) {
        const [fx, fy] = row.variant.ground ?? [0.2, 0.85];
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, spec.cellWidth, spec.cellHeight);
        ctx.clip();
        drawFrameAt(ctx, frame, x + fx * spec.cellWidth, y + fy * spec.cellHeight, spec.showBounds);
        ctx.restore();
      }

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = '10px monospace';
      ctx.fillText(`${row.background} ${row.variant.name} t=${t.toFixed(2)}`, x + 4, y + 12);
    });
  });
}

export interface ContactSheetSpec {
  /** One representative variant per style id; a style without one is skipped. */
  variants: Record<string, Variant>;
  backgrounds: Record<string, string>;
  columns: number;
  cellWidth: number;
  cellHeight: number;
}

/**
 * The settled frame of every registered style, in picker order, as a grid per
 * background (stacked, one below the other).
 */
export async function renderContactSheet(canvas: HTMLCanvasElement, spec: ContactSheetSpec): Promise<void> {
  const entries = getAllStyles().flatMap((style) => {
    const variant = spec.variants[style.id];
    return variant ? [{ style, variant, callout: buildCallout(style.id, variant) }] : [];
  });
  const rowsPerGrid = Math.ceil(entries.length / spec.columns);
  const backgrounds = Object.entries(spec.backgrounds);
  const gridHeight = rowsPerGrid * spec.cellHeight;
  canvas.width = spec.columns * spec.cellWidth;
  canvas.height = backgrounds.length * gridHeight;
  const ctx = canvas.getContext('2d')!;

  const settled = (callout: CalloutItem) => {
    const { enterDuration, exitDuration } = callout.transition;
    return START + enterDuration + (END - START - enterDuration - exitDuration) / 2;
  };
  const frames = entries.map((entry) => prepareAnnotationFrame(entry.callout, settled(entry.callout)));
  for (const frame of frames) if (frame) await loadSceneAssets(collectSceneAssets(frame.scene));

  backgrounds.forEach(([, color], b) => {
    entries.forEach((entry, i) => {
      const x = (i % spec.columns) * spec.cellWidth;
      const y = b * gridHeight + Math.floor(i / spec.columns) * spec.cellHeight;
      paintBackground(ctx, x, y, spec.cellWidth, spec.cellHeight, color);
      const frame = frames[i];
      if (frame) {
        // Centre what the callout draws in its cell, shrinking it to fit if needed.
        const bounds = getFrameBounds(frame);
        const fit = Math.min(1, (spec.cellWidth - CELL_MARGIN) / (bounds.maxX - bounds.minX), (spec.cellHeight - CELL_MARGIN) / (bounds.maxY - bounds.minY));
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, spec.cellWidth, spec.cellHeight);
        ctx.clip();
        ctx.translate(x + spec.cellWidth / 2, y + spec.cellHeight / 2);
        ctx.scale(fit, fit);
        drawFrameAt(ctx, frame, -(bounds.minX + bounds.maxX) / 2, -(bounds.minY + bounds.maxY) / 2, false);
        ctx.restore();
      }
      ctx.fillStyle = '#8a929c';
      ctx.font = '10px monospace';
      ctx.fillText(entry.style.id, x + 4, y + 12);
    });
  });
}

const globals = window as unknown as { renderFilmstrip: typeof renderFilmstrip; renderContactSheet: typeof renderContactSheet };
globals.renderFilmstrip = renderFilmstrip;
globals.renderContactSheet = renderContactSheet;
