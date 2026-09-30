/**
 * The live editor's callout overlay: one canvas over the whole map, drawn from
 * the map's own render event so callouts move in the same frame as the basemap
 * instead of trailing it by a React commit.
 *
 * It draws through compositeAnnotations, the function exports use, so the editor
 * and an export run the same code; only the inputs differ (see draw for the
 * frame options). When the map is not rendering, a change to the project or an
 * asset load schedules one redraw of the overlay alone on the next animation
 * frame, without repainting the basemap. Both paths run the same `draw`.
 */

import type { Map as MapboxMap } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import { loadAnnotationAssets } from '@/annotations/draw';
import { compositeAnnotations } from '@/annotations/export/renderAnnotation';

type ProjectState = ReturnType<typeof useProjectStore.getState>;

/** Whether a store change alters what the overlay draws. */
function overlayStateChanged(state: ProjectState, previous: ProjectState): boolean {
  return state.playheadTime !== previous.playheadTime
    || state.items !== previous.items
    || state.itemOrder !== previous.itemOrder
    || state.selectedItemId !== previous.selectedItemId
    || state.isMoveModeActive !== previous.isMoveModeActive
    || state.isExporting !== previous.isExporting
    || state.isCapturingViewport !== previous.isCapturingViewport;
}

export class AnnotationOverlay {
  private readonly canvas = document.createElement('canvas');
  private unsubscribe: (() => void) | undefined;
  /** The animation frame of the pending redraw, if any. At most one. */
  private frame: number | undefined;
  private disposed = false;

  constructor(private readonly map: MapboxMap) {
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
  }

  mount(): void {
    this.map.getCanvasContainer().appendChild(this.canvas);
    this.map.on('render', this.draw);
    this.unsubscribe = useProjectStore.subscribe(this.handleStoreChange);
    this.loadAssets();
    this.scheduleDraw();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.map.off('render', this.draw);
    this.cancelScheduledDraw();
    this.canvas.remove();
  }

  private handleStoreChange = (state: ProjectState, previous: ProjectState): void => {
    if (!overlayStateChanged(state, previous)) return;
    if (state.items !== previous.items || state.itemOrder !== previous.itemOrder) this.loadAssets();
    this.scheduleDraw();
  };

  /** Canvas text doesn't trigger web font downloads and images load asynchronously: redraw once they have. */
  private loadAssets(): void {
    const { items, itemOrder } = useProjectStore.getState();
    void loadAnnotationAssets(items, itemOrder).then(() => {
      if (!this.disposed) this.scheduleDraw();
    });
  }

  private scheduleDraw(): void {
    if (this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.draw();
    });
  }

  private cancelScheduledDraw(): void {
    if (this.frame === undefined) return;
    cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  /**
   * Matches the backing store to the viewport and the display's pixel ratio, which
   * changes when the window moves between monitors. Only reallocates on a change.
   */
  private fitToViewport(dpr: number): void {
    const container = this.map.getContainer();
    const width = Math.round(container.clientWidth * dpr);
    const height = Math.round(container.clientHeight * dpr);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  private draw = (): void => {
    // Whatever asked for this frame, this draw covers it.
    this.cancelScheduledDraw();

    const state = useProjectStore.getState();
    // Exports composite callouts themselves. Captures lend the map a different size,
    // which is no reason to resize or redraw the overlay.
    if (state.isCapturingViewport) return;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    this.fitToViewport(dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (state.isExporting) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // While positioning, the callout is replaced by its drag handle.
    const drawn = state.isMoveModeActive
      ? state.itemOrder.filter((id) => id !== state.selectedItemId)
      : state.itemOrder;
    compositeAnnotations(this.map, ctx, state.items, drawn, state.playheadTime, {
      selectedId: state.selectedItemId,
    });
  };
}
