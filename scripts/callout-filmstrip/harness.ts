/**
 * Browser side of the callout filmstrip (see run.mjs). Draws a style's frames
 * through the same prepare/draw functions the preview and export use.
 */
import '@/annotations/styles';
import {
  collectSceneAssets,
  drawAnnotationFrame,
  getFrameBounds,
  loadSceneAssets,
  prepareAnnotationFrame,
} from '@/annotations/draw';
import { getStyle } from '@/annotations/registry';
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
        const gx = x + fx * spec.cellWidth;
        const gy = y + fy * spec.cellHeight;
        const bounds = getFrameBounds(frame);
        const box = [gx + bounds.minX, gy + bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY] as const;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, spec.cellWidth, spec.cellHeight);
        ctx.clip();
        if (spec.showBounds) {
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

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = '10px monospace';
      ctx.fillText(`${row.background} ${row.variant.name} t=${t.toFixed(2)}`, x + 4, y + 12);
    });
  });
}

(window as unknown as { renderFilmstrip: typeof renderFilmstrip }).renderFilmstrip = renderFilmstrip;
