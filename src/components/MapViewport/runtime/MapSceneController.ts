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
import { selectionPreviewTime } from '@/engine/selectionPreview';

type ProjectState = ReturnType<typeof useProjectStore.getState>;

function basemapStateChanged(state: ProjectState, previous: ProjectState): boolean {
  return state.mapStyle !== previous.mapStyle
    || state.projection !== previous.projection
    || state.terrainEnabled !== previous.terrainEnabled
    || state.terrainExaggeration !== previous.terrainExaggeration
    || state.buildingsEnabled !== previous.buildingsEnabled
    || state.lightPreset !== previous.lightPreset
    || state.labelVisibility !== previous.labelVisibility
    || state.show3dLandmarks !== previous.show3dLandmarks
    || state.show3dTrees !== previous.show3dTrees
    || state.show3dFacades !== previous.show3dFacades
    || state.starIntensity !== previous.starIntensity
    || state.fogColor !== previous.fogColor
    || state.terrainLoading !== previous.terrainLoading
    || state.detectedCapabilities !== previous.detectedCapabilities;
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
    this.mask = new BoundaryMaskRenderer(map, this.basemap.getMaskPlacement);
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

  /** Draws the scene for the live editor: the selected item is shown fully drawn when off the playhead. */
  private renderLive(state: ProjectState): void {
    this.renderScene(state.playheadTime, state.isExporting ? null : state.selectedItemId, state.items);
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

    // Mounted before any route/boundary layer so it sits beneath them even when a style has no symbol layer to anchor to
    if (!this.maskMounted) {
      this.mask.mount();
      this.maskMounted = true;
    }
    const nextRouteIds = new Set<string>();
    const nextBoundaryIds = new Set<string>();
    const routes: RouteItem[] = [];
    const boundaries: BoundaryItem[] = [];
    for (const id of state.itemOrder) {
      const item = state.items[id];
      if (item?.kind === 'route') routes.push(item);
      if (item?.kind === 'boundary' && item.resolveStatus === 'resolved' && item.geojson) boundaries.push(item);
    }

    this.maskBoundaries = boundaries;

    for (const route of routes) {
      nextRouteIds.add(route.id);
      const existing = this.routes.get(route.id);
      if (existing) {
        existing.setRoute(route);
      } else {
        const renderer = new RouteRenderer(this.map, route);
        renderer.mount();
        this.routes.set(route.id, renderer);
      }
    }
    for (const [id, renderer] of this.routes) {
      if (nextRouteIds.has(id)) continue;
      renderer.dispose();
      this.routes.delete(id);
    }

    for (const boundary of boundaries) {
      nextBoundaryIds.add(boundary.id);
      const existing = this.boundaries.get(boundary.id);
      if (existing) {
        existing.setBoundary(boundary);
      } else {
        const renderer = new BoundaryRenderer(this.map, boundary, this.basemap.getMaskPlacement);
        renderer.mount();
        this.boundaries.set(boundary.id, renderer);
      }
    }
    for (const [id, renderer] of this.boundaries) {
      if (nextBoundaryIds.has(id)) continue;
      renderer.dispose();
      this.boundaries.delete(id);
    }

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
    ) this.renderLive(state);
  };
}
