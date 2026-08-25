import type { Map as MapboxMap } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import type { BoundaryItem, RouteItem } from '@/store/types';
import type { MapSceneRuntime } from './MapSceneRuntime';
import { waitForMapRender } from './MapSceneRuntime';
import { BasemapController } from './BasemapController';
import { BoundaryRenderer } from './BoundaryRenderer';
import { RouteRenderer } from './RouteRenderer';

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
  private unsubscribe: (() => void) | undefined;
  private lastItems: ProjectState['items'] | undefined;
  private lastItemOrder: ProjectState['itemOrder'] | undefined;
  private sceneRevision = 0;
  private renderedRevision = -1;
  private lastRenderedTime = Number.NaN;
  private disposed = false;

  constructor(
    private readonly map: MapboxMap,
    setStyleLoaded: (loaded: boolean) => void,
  ) {
    this.basemap = new BasemapController(map, setStyleLoaded, this.rebuildAfterStyleLoad);
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
    this.renderAt(state.playheadTime);
  };

  renderAt = (time: number): void => {
    if (this.disposed) return;
    if (time === this.lastRenderedTime && this.renderedRevision === this.sceneRevision) return;
    this.routes.forEach((renderer) => renderer.render(time));
    this.boundaries.forEach((renderer) => renderer.render(time));
    this.lastRenderedTime = time;
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
    if (!force && state.items === this.lastItems && state.itemOrder === this.lastItemOrder) return;
    this.lastItems = state.items;
    this.lastItemOrder = state.itemOrder;

    const nextRouteIds = new Set<string>();
    const nextBoundaryIds = new Set<string>();
    const routes: RouteItem[] = [];
    const boundaries: BoundaryItem[] = [];
    for (const id of state.itemOrder) {
      const item = state.items[id];
      if (item?.kind === 'route') routes.push(item);
      if (item?.kind === 'boundary' && item.resolveStatus === 'resolved' && item.geojson) boundaries.push(item);
    }

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
        const renderer = new BoundaryRenderer(this.map, boundary);
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
  }

  private disposeRenderers(): void {
    this.routes.forEach((renderer) => renderer.dispose());
    this.boundaries.forEach((renderer) => renderer.dispose());
    this.routes.clear();
    this.boundaries.clear();
  }

  private readonly rebuildAfterStyleLoad = () => {
    if (this.disposed) return;
    this.disposeRenderers();
    this.lastItems = undefined;
    this.lastItemOrder = undefined;
    const state = useProjectStore.getState();
    this.reconcileRenderers(state, true);
    this.renderAt(state.playheadTime);
  };

  private readonly handleStoreChange = (state: ProjectState, previous: ProjectState) => {
    if (this.disposed) return;
    const sceneChanged = state.items !== previous.items || state.itemOrder !== previous.itemOrder;
    if (basemapStateChanged(state, previous)) this.basemap.reconcile();
    if (sceneChanged) this.reconcileRenderers(state);
    if (sceneChanged || state.playheadTime !== previous.playheadTime) this.renderAt(state.playheadTime);
  };
}
