import type { Map as MapboxMap } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import type { BoundaryItem, ModelItem, RouteItem } from '@/store/types';
import type { MapSceneRuntime } from './MapSceneRuntime';
import { waitForMapRender } from './MapSceneRuntime';
import { BasemapController } from './BasemapController';
import { BoundaryMaskRenderer } from './BoundaryMaskRenderer';
import { BoundaryRenderer } from './BoundaryRenderer';
import { RouteRenderer } from './RouteRenderer';
import { ModelRenderer } from './ModelRenderer';
import { ModelCatalog } from './ModelCatalog';
import { isStyleReady } from './mapboxResources';
import { isSelectionPreview, previewableSelectionId, selectionPreviewTime } from '@/engine/selectionPreview';
import { activeAppearPreview, type AppearPreviewFrame } from '@/engine/appearPreview';
import { useModelRegistry } from '@/models/modelRegistry';

type ProjectState = ReturnType<typeof useProjectStore.getState>;

/** Store fields the basemap is reconciled from. */
const BASEMAP_KEYS = [
  'mapStyle',
  'projection',
  'terrainEnabled',
  'terrainExaggeration',
  'buildingsEnabled',
  'lightPreset',
  'labelVisibility',
  'show3dLandmarks',
  'show3dTrees',
  'show3dFacades',
  'starIntensity',
  'fogColor',
  'terrainLoading',
  'detectedCapabilities',
] as const satisfies readonly (keyof ProjectState)[];

function basemapStateChanged(state: ProjectState, previous: ProjectState): boolean {
  return BASEMAP_KEYS.some((key) => state[key] !== previous[key]);
}

interface ItemRenderer {
  mount(): void;
  dispose(): void;
}

/**
 * Brings `renderers` in line with `items`: updates the ones that exist, creates and mounts
 * the missing ones, and disposes of those whose item is gone.
 */
function syncRenderers<I extends { id: string }, R extends ItemRenderer>(
  renderers: Map<string, R>,
  items: readonly I[],
  update: (renderer: R, item: I) => void,
  create: (item: I) => R,
): void {
  const ids = new Set<string>();
  for (const item of items) {
    ids.add(item.id);
    const existing = renderers.get(item.id);
    if (existing) {
      update(existing, item);
    } else {
      const renderer = create(item);
      renderer.mount();
      renderers.set(item.id, renderer);
    }
  }
  for (const [id, renderer] of renderers) {
    if (ids.has(id)) continue;
    renderer.dispose();
    renderers.delete(id);
  }
}

export class MapSceneController implements MapSceneRuntime {
  private readonly basemap: BasemapController;
  private readonly routes = new Map<string, RouteRenderer>();
  private readonly boundaries = new Map<string, BoundaryRenderer>();
  private readonly models = new Map<string, ModelRenderer>();
  /** Imported 3D models in the Mapbox style (placed models and custom route markers). */
  private readonly catalog: ModelCatalog;
  private unsubscribeModels: (() => void) | undefined;
  /** Boundaries in item order (topmost first) that the shared mask is drawn from. */
  private maskBoundaries: BoundaryItem[] = [];
  private readonly mask: BoundaryMaskRenderer;
  private maskMounted = false;
  private unsubscribe: (() => void) | undefined;
  private lastItems: ProjectState['items'] | undefined;
  private lastItemOrder: ProjectState['itemOrder'] | undefined;
  private sceneRevision = 0;
  private renderedRevision = -1;
  private lastRenderedTime = Number.NaN;
  /** Selection the last live render used, so selecting an item redraws even at the same playhead time. */
  private lastRenderedSelection: string | null = null;
  /** The appear preview the last render drew (its items and time), '' for none. */
  private lastRenderedPreview = '';
  /** The animation frame of the next appear preview render, if any. */
  private previewFrame: number | undefined;
  /** A store update arrived while Mapbox was replacing its style. */
  private sceneDirty = true;
  private disposed = false;

  constructor(
    private readonly map: MapboxMap,
    setStyleLoaded: (loaded: boolean) => void,
  ) {
    this.basemap = new BasemapController(map, setStyleLoaded, this.rebuildAfterStyleLoad);
    this.mask = new BoundaryMaskRenderer(map);
    this.catalog = new ModelCatalog(map, () => useProjectStore.getState().models);
  }

  mount(): void {
    this.unsubscribe = useProjectStore.subscribe(this.handleStoreChange);
    // A relinked file arrives (or a released one goes) without a project change.
    this.unsubscribeModels = useModelRegistry.subscribe(this.refreshModels);
    this.catalog.attach();
    this.basemap.mount();
    this.sync();
  }

  getMap(): MapboxMap {
    return this.map;
  }

  sync = (): void => {
    if (this.disposed) return;
    const state = useProjectStore.getState();
    this.basemap.reconcile();
    this.reconcileRenderers(state);
    this.renderLive(state);
  };

  /** Draws the scene at exactly `time` (used by export); the editor's selection preview does not apply. */
  renderAt = (time: number): void => {
    this.renderScene(time, null);
  };

  /**
   * Draws the scene for the live editor: the selected item is shown fully drawn when off the playhead, except
   * while playing or with the UI hidden, and items just added play their entrance (see `activeAppearPreview`).
   */
  private renderLive(state: ProjectState): void {
    const preview = activeAppearPreview(state, performance.now());
    this.renderScene(state.playheadTime, previewableSelectionId(state), state.items, preview);
    if (preview && !preview.done && this.drawsAny(preview.itemIds)) this.schedulePreviewFrame();
  }

  /** Whether the scene draws any of these items (callouts are drawn by the annotation overlay). */
  private drawsAny(ids: ReadonlySet<string>): boolean {
    for (const id of ids) if (this.routes.has(id) || this.boundaries.has(id)) return true;
    return false;
  }

  private schedulePreviewFrame(): void {
    if (this.previewFrame !== undefined) return;
    this.previewFrame = requestAnimationFrame(() => {
      this.previewFrame = undefined;
      if (!this.disposed) this.renderLive(useProjectStore.getState());
    });
  }

  private renderScene = (
    time: number,
    selectedId: string | null,
    items: ProjectState['items'] = useProjectStore.getState().items,
    preview: AppearPreviewFrame | null = null,
  ): void => {
    if (this.disposed) return;
    // A style replacement removes every custom source and layer. Defer all
    // renderer work until the replacement style stylesheet has loaded.
    if (!isStyleReady(this.map)) {
      this.sceneDirty = true;
      return;
    }
    const previewKey = preview ? `${[...preview.itemIds].join()}@${preview.time}` : '';
    if (
      time === this.lastRenderedTime
      && selectedId === this.lastRenderedSelection
      && previewKey === this.lastRenderedPreview
      && this.renderedRevision === this.sceneRevision
    ) return;
    const timeFor = (id: string) => {
      if (preview?.itemIds.has(id)) return preview.time;
      const item = items[id];
      return item && item.kind !== 'camera' ? selectionPreviewTime(item, time, id === selectedId) : time;
    };
    this.routes.forEach((renderer, id) => renderer.render(timeFor(id)));
    this.mask.render(this.maskBoundaries, timeFor);
    this.boundaries.forEach((renderer, id) => renderer.render(timeFor(id)));
    // A selected model off the playhead is shown in full, like a callout, so it can be placed.
    this.models.forEach((renderer, id) => {
      const item = items[id];
      renderer.render(time, { settled: !!item && item.kind === 'model' && isSelectionPreview(item, time, id === selectedId) });
    });
    this.lastRenderedTime = time;
    this.lastRenderedSelection = selectedId;
    this.lastRenderedPreview = previewKey;
    this.renderedRevision = this.sceneRevision;
  };

  waitUntilRendered(timeoutMs?: number): Promise<void> {
    return waitForMapRender(this.map, timeoutMs);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.previewFrame !== undefined) cancelAnimationFrame(this.previewFrame);
    this.unsubscribe?.();
    this.unsubscribeModels?.();
    this.catalog.detach();
    this.basemap.dispose();
    this.disposeRenderers();
  }

  private reconcileRenderers(state: ProjectState, force = false): void {
    if (!isStyleReady(this.map)) {
      this.sceneDirty = true;
      return;
    }
    if (!force && !this.sceneDirty && state.items === this.lastItems && state.itemOrder === this.lastItemOrder) return;
    this.lastItems = state.items;
    this.lastItemOrder = state.itemOrder;

    // Mounted before any route/boundary layer: it goes on top of the basemap, and those are added above it
    if (!this.maskMounted) {
      this.mask.mount();
      this.maskMounted = true;
    }
    const routes: RouteItem[] = [];
    const boundaries: BoundaryItem[] = [];
    const models: ModelItem[] = [];
    for (const id of state.itemOrder) {
      const item = state.items[id];
      if (item?.kind === 'route') routes.push(item);
      if (item?.kind === 'boundary' && item.geojson) boundaries.push(item);
      if (item?.kind === 'model') models.push(item);
    }

    this.maskBoundaries = boundaries;

    syncRenderers(this.routes, routes, (renderer, route) => renderer.setRoute(route), (route) => new RouteRenderer(this.map, route, this.catalog));
    syncRenderers(
      this.boundaries,
      boundaries,
      (renderer, boundary) => renderer.setBoundary(boundary),
      (boundary) => new BoundaryRenderer(this.map, boundary, this.basemap.getFlagPlacement),
    );
    syncRenderers(this.models, models, (renderer, model) => renderer.setItem(model), (model) => new ModelRenderer(this.map, model, this.catalog));
    this.catalog.prune(state.items);

    this.sceneRevision += 1;
    this.sceneDirty = false;
  }

  private disposeRenderers(): void {
    this.routes.forEach((renderer) => renderer.dispose());
    this.boundaries.forEach((renderer) => renderer.dispose());
    this.models.forEach((renderer) => renderer.dispose());
    this.models.clear();
    this.mask.dispose();
    this.maskMounted = false;
    this.maskBoundaries = [];
    this.routes.clear();
    this.boundaries.clear();
  }

  private readonly rebuildAfterStyleLoad = () => {
    if (this.disposed) return;
    this.disposeRenderers();
    // The new style has none of the imported models; they are added again as layers need them.
    this.catalog.reset();
    this.lastItems = undefined;
    this.lastItemOrder = undefined;
    this.lastRenderedTime = Number.NaN;
    this.renderedRevision = -1;
    this.sceneDirty = true;
    const state = useProjectStore.getState();
    this.reconcileRenderers(state, true);
    this.renderLive(state);
  };

  /** An imported model's file arrived or went, or its metadata changed: redraw what uses it. */
  private readonly refreshModels = (): void => {
    if (this.disposed || !isStyleReady(this.map)) {
      this.sceneDirty = true;
      return;
    }
    this.routes.forEach((renderer) => renderer.refreshModels());
    this.models.forEach((renderer) => renderer.refresh());
    const state = useProjectStore.getState();
    this.catalog.prune(state.items);
    this.sceneRevision += 1;
    this.renderLive(state);
  };

  private readonly handleStoreChange = (state: ProjectState, previous: ProjectState) => {
    if (this.disposed) return;
    const sceneChanged = state.items !== previous.items || state.itemOrder !== previous.itemOrder;
    if (basemapStateChanged(state, previous)) this.basemap.reconcile();
    if (sceneChanged) this.reconcileRenderers(state);
    if (state.models !== previous.models) this.refreshModels();
    if (
      sceneChanged
      || state.playheadTime !== previous.playheadTime
      || state.selectedItemId !== previous.selectedItemId
      || state.isExporting !== previous.isExporting
      || state.isPlaying !== previous.isPlaying
      || state.hideUI !== previous.hideUI
      || state.appearPreview !== previous.appearPreview
    ) this.renderLive(state);
  };
}
