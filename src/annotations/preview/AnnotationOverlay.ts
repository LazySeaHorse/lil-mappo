/**
 * The live editor's callout overlay: one canvas over the whole map, drawn from
 * the map's own render event so callouts move in the same frame as the basemap
 * instead of trailing it by a React commit.
 *
 * It draws through compositeAnnotations, the function exports use, so the editor
 * and an export run the same code; only the inputs differ (see draw for the
 * frame options). Anything that changes what should be drawn just asks the map
 * to repaint, so there is a single place that draws.
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
    || state.isExporting !== previous.isExporting;
}

export class AnnotationOverlay {
  private readonly canvas = document.createElement('canvas');
  private unsubscribe: (() => void) | undefined;
  private disposed = false;

  constructor(private readonly map: MapboxMap) {
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
  }

  mount(): void {
    this.map.getCanvasContainer().appendChild(this.canvas);
    this.map.on('render', this.draw);
    this.map.on('resize', this.resize);
    this.unsubscribe = useProjectStore.subscribe(this.handleStoreChange);
    this.resize();
    this.loadAssets();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.map.off('render', this.draw);
    this.map.off('resize', this.resize);
    this.canvas.remove();
  }

  private handleStoreChange = (state: ProjectState, previous: ProjectState): void => {
    if (!overlayStateChanged(state, previous)) return;
    if (state.items !== previous.items || state.itemOrder !== previous.itemOrder) this.loadAssets();
    this.map.triggerRepaint();
  };

  /** Canvas text doesn't trigger web font downloads and images load asynchronously: repaint once they have. */
  private loadAssets(): void {
    const { items, itemOrder } = useProjectStore.getState();
    void loadAnnotationAssets(items, itemOrder).then(() => {
      if (!this.disposed) this.map.triggerRepaint();
    });
  }

  /** Matches the backing store to the viewport. Only a resize changes it, never a redraw. */
  private resize = (): void => {
    const dpr = window.devicePixelRatio || 1;
    const container = this.map.getContainer();
    this.canvas.width = Math.round(container.clientWidth * dpr);
    this.canvas.height = Math.round(container.clientHeight * dpr);
  };

  private draw = (): void => {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Exports composite callouts themselves, and resize the map while they do.
    const state = useProjectStore.getState();
    if (state.isExporting) return;

    const dpr = window.devicePixelRatio || 1;
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
