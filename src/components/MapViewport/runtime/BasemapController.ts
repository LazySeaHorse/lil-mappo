import type {
  FogSpecification,
  Map as MapboxMap,
  MapSourceDataEvent,
} from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import { LABEL_CATEGORIES, MAP_STYLES, isDarkMapStyle } from '@/config/mapbox';
import { track } from '@/lib/analytics';
import { detectRuntimeCapabilities } from '../mapUtils';
import { isStyleReady, mutateMap } from './mapboxResources';
import { handleMissingStyleImage, loadKnownStyleAssets } from './styleAssets';

const BUILDINGS_LAYER_ID = '3d-buildings';

/** Styles already reported this page load, so a retry loop cannot flood analytics. */
const reportedStyleFailures = new Set<string>();

type ProjectState = ReturnType<typeof useProjectStore.getState>;

function resolveFog(state: ProjectState): FogSpecification {
  const isDark = isDarkMapStyle(state.mapStyle);
  const base: FogSpecification = isDark
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
  layerIds: string[],
  patterns: string[],
  visible: boolean,
): void {
  const target = visible ? 'visible' : 'none';
  for (const id of layerIds) {
    if (!patterns.some((pattern) => id.toLowerCase().includes(pattern.toLowerCase()))) continue;
    if (map.getLayoutProperty(id, 'visibility') === target) continue;
    mutateMap(map, { operation: 'setLayoutProperty', phase: 'style-sync', resourceId: id }, () => {
      map.setLayoutProperty(id, 'visibility', target);
    });
  }
}

export class BasemapController {
  private disposed = false;
  private readonly animationFrames = new Set<number>();
  /** Label-relevant classic layer ids and the first symbol layer, scanned once per style load (getStyle() serializes the whole style). */
  private styleScan: { labelLayerIds: string[]; firstSymbolId: string | undefined } | undefined;
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
    this.map.on('styleimagemissing', this.handleStyleImageMissing);

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

    if (isStyleReady(this.map)) this.handleStyleLoad();
  }

  reconcile = (): void => {
    if (this.disposed || !isStyleReady(this.map)) return;
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
    this.map.off('styleimagemissing', this.handleStyleImageMissing);
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

    // Classic styles: satellite-v9 has no vector data; others expose `composite` with a building layer
    if (state.mapStyle === 'satellite' || !this.map.getSource('composite')) return;
    if (!this.map.getLayer(BUILDINGS_LAYER_ID)) this.addBuildingsLayer(state.buildingsEnabled);
    const target = state.buildingsEnabled ? 'visible' : 'none';
    if (this.map.getLayer(BUILDINGS_LAYER_ID) && this.map.getLayoutProperty(BUILDINGS_LAYER_ID, 'visibility') !== target) {
      mutateMap(this.map, { operation: 'setLayoutProperty', phase: 'style-sync', resourceId: BUILDINGS_LAYER_ID }, () => {
        this.map.setLayoutProperty(BUILDINGS_LAYER_ID, 'visibility', target);
      });
    }
  }

  /** Inserted below the first symbol layer so labels stay on top of the extrusions. */
  private addBuildingsLayer(visible: boolean): void {
    const beforeId = this.getStyleScan().firstSymbolId;
    mutateMap(this.map, { operation: 'addLayer', phase: 'style-sync', resourceId: BUILDINGS_LAYER_ID }, () => {
      this.map.addLayer({
        id: BUILDINGS_LAYER_ID,
        source: 'composite',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': '#ddd',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'min_height'],
          'fill-extrusion-opacity': 0.8,
        },
        layout: { visibility: visible ? 'visible' : 'none' },
      }, beforeId);
    });
  }

  private reconcileLabels(state: ProjectState): void {
    const groups = state.detectedCapabilities?.labelGroups;
    if (!groups) return;
    const isStandard = state.mapStyle === 'standard';

    for (const group of groups) {
      const visible = state.labelVisibility[group.id] ?? true;
      if (isStandard) {
        // Standard's label layers live inside the basemap import, so only its config properties work
        const configProperty = group.configProperty;
        if (configProperty && this.map.getConfigProperty('basemap', configProperty) !== visible) {
          mutateMap(this.map, { operation: `setConfigProperty:${configProperty}`, phase: 'style-sync' }, () => {
            this.map.setConfigProperty('basemap', configProperty, visible);
          });
        }
        continue;
      }
      setLayerVisibility(this.map, this.getStyleScan().labelLayerIds, group.layerPatterns, visible);
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

  private getStyleScan(): NonNullable<BasemapController['styleScan']> {
    if (this.styleScan) return this.styleScan;
    // Standard's layers live inside the basemap import and are driven by config properties, so skip the scan
    if (useProjectStore.getState().mapStyle === 'standard') {
      return { labelLayerIds: [], firstSymbolId: undefined };
    }
    const layers = this.map.getStyle()?.layers ?? [];
    const patterns = LABEL_CATEGORIES.flatMap((category) => category.layerPatterns.map((p) => p.toLowerCase()));
    // Custom route/boundary layers added after style load never match label patterns, so they are not tracked
    this.styleScan = {
      labelLayerIds: layers.filter((layer) => patterns.some((p) => layer.id.toLowerCase().includes(p))).map((layer) => layer.id),
      firstSymbolId: layers.find((layer) => layer.type === 'symbol')?.id,
    };
    return this.styleScan;
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
    this.styleScan = undefined;
    void loadKnownStyleAssets(this.map);
    state.setDetectedCapabilities(detectRuntimeCapabilities(this.map, state.mapStyle));
    this.setStyleLoaded(true);
    this.reconcile();
    this.onStyleLoad?.();
  };

  private readonly handleStyleImageMissing = (event: { id: string }) => {
    if (this.disposed) return;
    void handleMissingStyleImage(this.map, event.id);
  };

  private readonly handleStyleImportData = () => this.reconcile();

  private readonly handleSourceData = (event: MapSourceDataEvent) => {
    if (event.sourceId !== 'mapbox-dem') return;
    this.schedule(() => this.updateTerrainLoading());
  };

  private readonly handleSourceDataLoading = (event: MapSourceDataEvent) => {
    if (event.sourceId !== 'mapbox-dem') return;
    const state = useProjectStore.getState();
    if (state.isPlaying || !state.terrainEnabled) return;
    this.schedule(() => useProjectStore.getState().setTerrainLoading(true));
  };

  private readonly handleIdle = () => {
    const state = useProjectStore.getState();
    if (!state.isPlaying && state.terrainLoading) this.schedule(() => this.updateTerrainLoading());
  };

  private readonly handleError = (event: { error: Error; sourceId?: string; tile?: unknown }) => {
    console.error('[map:error]', event.error);
    this.reportStyleLoadFailure(event);
  };

  /**
   * Only style-level failures (the style document or its fonts/sprites could not be
   * loaded), not tile or source errors, which are routine on flaky networks.
   */
  private reportStyleLoadFailure(event: { error: Error; sourceId?: string; tile?: unknown }): void {
    if (event.sourceId || event.tile) return;
    const { url } = event.error as Error & { url?: string };
    if (typeof url !== 'string' || !url.includes('/styles/')) return;
    const selected = useProjectStore.getState().mapStyle;
    const style = selected in MAP_STYLES ? selected : 'custom';
    if (reportedStyleFailures.has(style)) return;
    reportedStyleFailures.add(style);
    track('map_style_load_failed', { style });
  }
}
