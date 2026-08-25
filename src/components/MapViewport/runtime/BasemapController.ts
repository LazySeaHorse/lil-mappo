import type {
  FogSpecification,
  LayerSpecification,
  Map as MapboxMap,
  MapSourceDataEvent,
} from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import { detectRuntimeCapabilities } from '../mapUtils';
import { mutateMap } from './mapboxResources';

type ProjectState = ReturnType<typeof useProjectStore.getState>;

const CONFIG_PROPERTIES: Record<string, string> = {
  place: 'showPlaceLabels',
  admin: 'showAdminBoundaries',
  road: 'showRoadLabels',
  poi: 'showPointOfInterestLabels',
  transit: 'showTransitLabels',
};

function resolveFog(state: ProjectState): FogSpecification {
  const base: FogSpecification = state.mapStyle === 'dark'
    ? {
        color: 'rgb(23, 23, 23)',
        'high-color': 'rgb(10, 10, 40)',
        'horizon-blend': 0.3,
        'space-color': 'rgb(5, 5, 15)',
        'star-intensity': 0.8,
      }
    : state.mapStyle === 'satellite' || state.mapStyle === 'satelliteStreets'
      ? {
          color: '#5d7883',
          'high-color': 'rgb(36, 92, 223)',
          'horizon-blend': 0.4,
          'space-color': 'rgb(11, 11, 25)',
          'star-intensity': 0.6,
        }
      : {
          color: 'rgb(186, 210, 235)',
          'high-color': 'rgb(36, 92, 223)',
          'horizon-blend': 0.02,
          'space-color': 'rgb(11, 11, 25)',
          'star-intensity': 0.6,
        };

  return {
    ...base,
    color: state.fogColor ?? base.color,
    'star-intensity': state.starIntensity ?? base['star-intensity'],
  };
}

function setLayerVisibility(
  map: MapboxMap,
  layers: LayerSpecification[],
  patterns: string[],
  visible: boolean,
): void {
  const target = visible ? 'visible' : 'none';
  for (const layer of layers) {
    if (!patterns.some((pattern) => layer.id.toLowerCase().includes(pattern.toLowerCase()))) continue;
    if (map.getLayoutProperty(layer.id, 'visibility') === target) continue;
    mutateMap(map, { operation: 'setLayoutProperty', phase: 'style-sync', resourceId: layer.id }, () => {
      map.setLayoutProperty(layer.id, 'visibility', target);
    });
  }
}

export class BasemapController {
  private disposed = false;
  private readonly animationFrames = new Set<number>();
  private unsubscribeInteractive: (() => void) | undefined;

  constructor(
    private readonly map: MapboxMap,
    private readonly setStyleLoaded: (loaded: boolean) => void,
    private readonly onStyleLoad?: () => void,
  ) {}

  mount(): void {
    this.map.on('style.load', this.handleStyleLoad);
    this.map.on('styleimportdata', this.handleStyleImportData);
    this.map.on('sourcedataloading', this.handleSourceDataLoading);
    this.map.on('sourcedata', this.handleSourceData);
    this.map.on('idle', this.handleIdle);
    this.map.on('error', this.handleError);

    const handlers = [
      this.map.dragPan,
      this.map.dragRotate,
      this.map.scrollZoom,
      this.map.touchZoomRotate,
      this.map.doubleClickZoom,
      this.map.keyboard,
    ];
    const applyInteractivity = (playing: boolean) => {
      handlers.forEach((handler) => playing ? handler?.disable() : handler?.enable());
    };
    applyInteractivity(useProjectStore.getState().isPlaying);
    this.unsubscribeInteractive = useProjectStore.subscribe((state, previous) => {
      if (state.isPlaying !== previous.isPlaying) applyInteractivity(state.isPlaying);
    });

    if (this.map.isStyleLoaded()) this.handleStyleLoad();
  }

  reconcile = (): void => {
    if (this.disposed || !this.map.isStyleLoaded()) return;
    const state = useProjectStore.getState();

    if (this.map.getProjection().name !== state.projection) {
      mutateMap(this.map, { operation: 'setProjection', phase: 'style-sync' }, () => {
        this.map.setProjection({ name: state.projection });
      });
    }

    this.reconcileBuildings(state);
    this.reconcileLabels(state);
    this.reconcileTerrain(state);
    this.reconcileFog(state);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeInteractive?.();
    this.animationFrames.forEach((frame) => cancelAnimationFrame(frame));
    this.animationFrames.clear();
    this.map.off('style.load', this.handleStyleLoad);
    this.map.off('styleimportdata', this.handleStyleImportData);
    this.map.off('sourcedataloading', this.handleSourceDataLoading);
    this.map.off('sourcedata', this.handleSourceData);
    this.map.off('idle', this.handleIdle);
    this.map.off('error', this.handleError);
  }

  private reconcileBuildings(state: ProjectState): void {
    if (state.mapStyle === 'standard') {
      const properties: Array<[string, unknown]> = [
        ['lightPreset', state.lightPreset],
        ['show3dObjects', state.buildingsEnabled],
        ['show3dLandmarks', state.buildingsEnabled && state.show3dLandmarks],
        ['show3dTrees', state.buildingsEnabled && state.show3dTrees],
        ['show3dFacades', state.buildingsEnabled && state.show3dFacades],
      ];
      for (const [property, value] of properties) {
        if (this.map.getConfigProperty('basemap', property) === value) continue;
        mutateMap(this.map, { operation: `setConfigProperty:${property}`, phase: 'style-sync' }, () => {
          this.map.setConfigProperty('basemap', property, value);
        });
      }
      return;
    }

    if (!this.map.getLayer('3d-buildings')) return;
    const target = state.buildingsEnabled ? 'visible' : 'none';
    if (this.map.getLayoutProperty('3d-buildings', 'visibility') !== target) {
      mutateMap(this.map, { operation: 'setLayoutProperty', phase: 'style-sync', resourceId: '3d-buildings' }, () => {
        this.map.setLayoutProperty('3d-buildings', 'visibility', target);
      });
    }
  }

  private reconcileLabels(state: ProjectState): void {
    const groups = state.detectedCapabilities?.labelGroups;
    if (!groups) return;
    const layers = this.map.getStyle()?.layers ?? [];

    for (const group of groups) {
      const visible = state.labelVisibility[group.id] ?? true;
      const configProperty = CONFIG_PROPERTIES[group.id];
      if (state.mapStyle === 'standard' && configProperty && this.map.getConfigProperty('basemap', configProperty) !== visible) {
        mutateMap(this.map, { operation: `setConfigProperty:${configProperty}`, phase: 'style-sync' }, () => {
          this.map.setConfigProperty('basemap', configProperty, visible);
        });
      }
      setLayerVisibility(this.map, layers, group.layerPatterns, visible);
    }
  }

  private reconcileTerrain(state: ProjectState): void {
    if (state.terrainEnabled) {
      if (!this.map.getSource('mapbox-dem')) {
        mutateMap(this.map, { operation: 'addSource', phase: 'style-sync', resourceId: 'mapbox-dem' }, () => {
          this.map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });
        });
      }
      const terrain = this.map.getTerrain();
      const currentExaggeration = typeof terrain?.exaggeration === 'number' ? terrain.exaggeration : 1;
      if (!terrain || terrain.source !== 'mapbox-dem' || Math.abs(currentExaggeration - state.terrainExaggeration) >= 0.001) {
        mutateMap(this.map, { operation: 'setTerrain', phase: 'style-sync', resourceId: 'mapbox-dem' }, () => {
          this.map.setTerrain({ source: 'mapbox-dem', exaggeration: state.terrainExaggeration });
        });
      }
    } else if (this.map.getTerrain()) {
      mutateMap(this.map, { operation: 'setTerrain:null', phase: 'style-sync' }, () => {
        this.map.setTerrain(null);
      });
    }
  }

  private reconcileFog(state: ProjectState): void {
    const target = resolveFog(state);
    const current = this.map.getFog();
    const currentStars = current?.['star-intensity'];
    const targetStars = target['star-intensity'];
    const starsMatch = typeof currentStars === 'number' && typeof targetStars === 'number'
      ? Math.abs(currentStars - targetStars) <= 0.005
      : currentStars === targetStars;
    if (current?.color === target.color && current?.['space-color'] === target['space-color'] && starsMatch) return;
    mutateMap(this.map, { operation: 'setFog', phase: 'style-sync' }, () => {
      this.map.setFog(target);
    });
  }

  private schedule(callback: () => void): void {
    const frame = requestAnimationFrame(() => {
      this.animationFrames.delete(frame);
      if (!this.disposed) callback();
    });
    this.animationFrames.add(frame);
  }

  private updateTerrainLoading(): void {
    const state = useProjectStore.getState();
    if (state.isPlaying || !state.terrainEnabled) return;
    const sourceExists = this.map.getSource('mapbox-dem');
    state.setTerrainLoading(!(sourceExists && this.map.isSourceLoaded('mapbox-dem')));
  }

  private readonly handleStyleLoad = () => {
    const state = useProjectStore.getState();
    state.setDetectedCapabilities(detectRuntimeCapabilities(this.map, state.mapStyle));
    this.setStyleLoaded(true);
    this.reconcile();
    this.onStyleLoad?.();
  };

  private readonly handleStyleImportData = () => this.reconcile();

  private readonly handleSourceData = (event: MapSourceDataEvent) => {
    if (event.sourceId !== 'mapbox-dem') return;
    this.reconcile();
    this.schedule(() => this.updateTerrainLoading());
  };

  private readonly handleSourceDataLoading = (event: MapSourceDataEvent) => {
    if (event.sourceId !== 'mapbox-dem') return;
    const state = useProjectStore.getState();
    if (state.isPlaying || !state.terrainEnabled) return;
    this.schedule(() => useProjectStore.getState().setTerrainLoading(true));
  };

  private readonly handleIdle = () => {
    this.reconcile();
    const state = useProjectStore.getState();
    if (!state.isPlaying && state.terrainLoading) this.schedule(() => this.updateTerrainLoading());
  };

  private readonly handleError = (event: { error: Error }) => {
    console.error('[map:error]', event.error);
  };
}
