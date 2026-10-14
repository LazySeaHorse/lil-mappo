import type { Map as MapboxMap } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import type { BoundaryItem, RouteItem } from '@/store/types';
import type { MapSceneRuntime } from './MapSceneRuntime';
import { waitForMapRender } from './MapSceneRuntime';
import { BasemapController } from './BasemapController';
import { BoundaryMaskRenderer } from './BoundaryMaskRenderer';
import { BoundaryRenderer } from './BoundaryRenderer';
import { RouteRenderer } from './RouteRenderer';
import { isStyleReady } from './mapboxResources';
import { previewableSelectionId, selectionPreviewTime } from '@/engine/selectionPreview';

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
  /** A store update arrived while Mapbox was replacing its style. */
  private sceneDirty = true;
  private disposed = false;

  constructor(
    private readonly map: MapboxMap,
    setStyleLoaded: (loaded: boolean) => void,
  ) {
    this.basemap = new BasemapController(map, setStyleLoaded, this.rebuildAfterStyleLoad);
    this.mask = new BoundaryMaskRenderer(map);
  }

  mount(): void {
    this.unsubscribe = useProjectStore.subscribe(this.handleStoreChange);
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

  /** Draws the scene for the live editor: the selected item is shown fully drawn when off the playhead, except while playing. */
  private renderLive(state: ProjectState): void {
    this.renderScene(state.playheadTime, previewableSelectionId(state), state.items);
  }

  private renderScene = (
    time: number,
    selectedId: string | null,
    items: ProjectState['items'] = useProjectStore.getState().items,
  ): void => {
    if (this.disposed) return;
    // A style replacement removes every custom source and layer. Defer all
    // renderer work until the replacement style stylesheet has loaded.
    if (!isStyleReady(this.map)) {
      this.sceneDirty = true;
      return;
    }
    if (
      time === this.lastRenderedTime
      && selectedId === this.lastRenderedSelection
      && this.renderedRevision === this.sceneRevision
    ) return;
    const timeFor = (id: string) => {
      const item = items[id];
      return item && item.kind !== 'camera' ? selectionPreviewTime(item, time, id === selectedId) : time;
    };
    this.routes.forEach((renderer, id) => renderer.render(timeFor(id)));
    this.mask.render(this.maskBoundaries, timeFor);
    this.boundaries.forEach((renderer, id) => renderer.render(timeFor(id)));
    this.lastRenderedTime = time;
    this.lastRenderedSelection = selectedId;
    this.renderedRevision = this.sceneRevision;
  };

  waitUntilRendered(timeoutMs?: number): Promise<void> {
    return waitForMapRender(this.map, timeoutMs);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
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
    for (const id of state.itemOrder) {
      const item = state.items[id];
      if (item?.kind === 'route') routes.push(item);
      if (item?.kind === 'boundary' && item.geojson) boundaries.push(item);
    }

    this.maskBoundaries = boundaries;

    syncRenderers(this.routes, routes, (renderer, route) => renderer.setRoute(route), (route) => new RouteRenderer(this.map, route));
    syncRenderers(
      this.boundaries,
      boundaries,
      (renderer, boundary) => renderer.setBoundary(boundary),
      (boundary) => new BoundaryRenderer(this.map, boundary, this.basemap.getFlagPlacement),
    );

    this.sceneRevision += 1;
    this.sceneDirty = false;
  }

  private disposeRenderers(): void {
    this.routes.forEach((renderer) => renderer.dispose());
    this.boundaries.forEach((renderer) => renderer.dispose());
    this.mask.dispose();
    this.maskMounted = false;
    this.maskBoundaries = [];
    this.routes.clear();
    this.boundaries.clear();
  }

  private readonly rebuildAfterStyleLoad = () => {
    if (this.disposed) return;
    this.disposeRenderers();
    this.lastItems = undefined;
    this.lastItemOrder = undefined;
    this.lastRenderedTime = Number.NaN;
    this.renderedRevision = -1;
    this.sceneDirty = true;
    const state = useProjectStore.getState();
    this.reconcileRenderers(state, true);
    this.renderLive(state);
  };

  private readonly handleStoreChange = (state: ProjectState, previous: ProjectState) => {
    if (this.disposed) return;
    const sceneChanged = state.items !== previous.items || state.itemOrder !== previous.itemOrder;
    if (basemapStateChanged(state, previous)) this.basemap.reconcile();
    if (sceneChanged) this.reconcileRenderers(state);
    if (
      sceneChanged
      || state.playheadTime !== previous.playheadTime
      || state.selectedItemId !== previous.selectedItemId
      || state.isExporting !== previous.isExporting
      || state.isPlaying !== previous.isPlaying
    ) this.renderLive(state);
  };
}
