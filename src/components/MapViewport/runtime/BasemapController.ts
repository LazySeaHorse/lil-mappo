import type {
  FogSpecification,
  Map as MapboxMap,
  MapSourceDataEvent,
} from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import { LABEL_CATEGORIES, MAP_STYLES, isStandardBasemap, resolveFog } from '@/config/mapbox';
import { track } from '@/lib/analytics';
import { classicColorTargets, recolorValue, type RecolorLayer, type RecolorTarget } from '@/customMapStyles/classicRecolor';
import { STANDARD_CUSTOM_PROPERTIES, standardCustomConfig } from '@/customMapStyles/model';
import { detectRuntimeCapabilities } from '../mapUtils';
import { isStyleReady, mutateMap } from './mapboxResources';
import { handleMissingStyleImage, loadKnownStyleAssets } from './styleAssets';

/** Styles already reported this page load, so a retry loop cannot flood analytics. */
const reportedStyleFailures = new Set<string>();

type ProjectState = ReturnType<typeof useProjectStore.getState>;

interface StyleScan {
  labelLayerIds: string[];
  firstSymbolId: string | undefined;
  firstRoadId: string | undefined;
  colorTargets: Array<{ layerId: string; target: RecolorTarget }>;
}

/** Fog values within this are the same; Mapbox hands numbers back with float noise. */
const FOG_NUMBER_TOLERANCE = 0.005;

function fogMatches(current: FogSpecification | null | undefined, target: FogSpecification): boolean {
  if (!current) return false;
  return (Object.keys(target) as Array<keyof FogSpecification>).every((key) => {
    const have = current[key];
    const want = target[key];
    return typeof have === 'number' && typeof want === 'number'
      ? Math.abs(have - want) <= FOG_NUMBER_TOLERANCE
      : have === want;
  });
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
  /** Label-relevant classic layer ids, the first symbol and road layers and the colours a custom style can repaint, scanned once per style load (getStyle() serializes the whole style). */
  private styleScan: StyleScan | undefined;
  /** The classic style's own value of each paint property a custom style changed, by `layerId\u0000property`. */
  private readonly originalPaint = new Map<string, unknown>();
  /** The custom style last painted on this classic style (undefined: none since the style loaded). */
  private paintedStyle: ProjectState['customStyle'] | undefined;
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

  /**
   * Where boundary flag fills go: over land and water but under roads, buildings and
   * labels, so the country's streets and place names read on top of its flag. Standard's
   * `bottom` slot is exactly that (`middle` is above roads, `top` above POI labels).
   * Fills that sit under the roads use it: flag fills, and colour fills with `fillUnderRoads`.
   * Classic styles insert before the first road layer, or the first symbol layer when a
   * style has no roads (satellite).
   */
  getFlagPlacement = (): { slot?: 'bottom'; beforeId?: string } => {
    if (isStandardBasemap(useProjectStore.getState().mapStyle)) return { slot: 'bottom' };
    const scan = this.getStyleScan();
    return { beforeId: scan.firstRoadId ?? scan.firstSymbolId };
  };

  reconcile = (): void => {
    if (this.disposed || !isStyleReady(this.map)) return;
    const state = useProjectStore.getState();

    if (this.map.getProjection().name !== state.projection) {
      mutateMap(this.map, { operation: 'setProjection', phase: 'style-sync' }, () => {
        this.map.setProjection({ name: state.projection });
      });
    }

    this.reconcileBuildings(state);
    this.reconcileCustomStyle(state);
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

  /** 3D buildings are a Standard-only feature; classic styles have no toggle and draw none. */
  private reconcileBuildings(state: ProjectState): void {
    if (!isStandardBasemap(state.mapStyle)) return;
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
  }

  private reconcileCustomStyle(state: ProjectState): void {
    if (isStandardBasemap(state.mapStyle)) this.reconcileStandardColors(state);
    else this.reconcileClassicColors(state);
  }

  /** Standard: the custom style's config values, and the schema default for every one it does not set. */
  private reconcileStandardColors(state: ProjectState): void {
    const schema = this.map.getSchema('basemap');
    if (!schema) return;
    const config = standardCustomConfig(state.customStyle);
    for (const property of STANDARD_CUSTOM_PROPERTIES) {
      const value = config[property] ?? schema[property]?.default;
      if (value === undefined || this.map.getConfigProperty('basemap', property) === value) continue;
      mutateMap(this.map, { operation: `setConfigProperty:${property}`, phase: 'style-sync' }, () => {
        this.map.setConfigProperty('basemap', property, value);
      });
    }
  }

  /**
   * Classic: repaints the layers the custom style has a colour for, from the style's own
   * values (kept the first time a property changes), and puts back the ones it no longer sets.
   */
  private reconcileClassicColors(state: ProjectState): void {
    if (state.customStyle === this.paintedStyle) return;
    if (this.paintedStyle === undefined && !state.customStyle) {
      this.paintedStyle = null;
      return;
    }
    const colors = state.customStyle?.colors ?? {};
    for (const { layerId, target } of this.getStyleScan().colorTargets) {
      const key = `${layerId}\u0000${target.property}`;
      if (!this.originalPaint.has(key)) this.originalPaint.set(key, this.map.getPaintProperty(layerId, target.property as never));
      const original = this.originalPaint.get(key);
      const value = recolorValue(target, colors, original) ?? original;
      if (JSON.stringify(value) === JSON.stringify(this.map.getPaintProperty(layerId, target.property as never))) continue;
      mutateMap(this.map, { operation: `setPaintProperty:${target.property}`, phase: 'style-sync', resourceId: layerId }, () => {
        this.map.setPaintProperty(layerId, target.property as never, value as never);
      });
    }
    this.paintedStyle = state.customStyle;
  }

  private reconcileLabels(state: ProjectState): void {
    const groups = state.detectedCapabilities?.labelGroups;
    if (!groups) return;
    const isStandard = isStandardBasemap(state.mapStyle);

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
    if (fogMatches(this.map.getFog(), target)) return;
    mutateMap(this.map, { operation: 'setFog', phase: 'style-sync' }, () => {
      this.map.setFog(target);
    });
  }

  private getStyleScan(): StyleScan {
    if (this.styleScan) return this.styleScan;
    // Standard's layers live inside the basemap import and are driven by config properties, so skip the scan
    if (isStandardBasemap(useProjectStore.getState().mapStyle)) {
      return { labelLayerIds: [], firstSymbolId: undefined, firstRoadId: undefined, colorTargets: [] };
    }
    const layers = this.map.getStyle()?.layers ?? [];
    const patterns = LABEL_CATEGORIES.flatMap((category) => category.layerPatterns.map((p) => p.toLowerCase()));
    // Custom route/boundary layers added after style load never match label patterns, so they are not tracked
    this.styleScan = {
      labelLayerIds: layers.filter((layer) => patterns.some((p) => layer.id.toLowerCase().includes(p))).map((layer) => layer.id),
      firstSymbolId: layers.find((layer) => layer.type === 'symbol')?.id,
      // Mapbox Streets puts roads, tunnels and bridges in the `road` source layer
      firstRoadId: layers.find((layer) => 'source-layer' in layer && layer['source-layer'] === 'road')?.id,
      colorTargets: layers.flatMap((layer) =>
        classicColorTargets(layer as RecolorLayer).map((target) => ({ layerId: layer.id, target }))),
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
    this.originalPaint.clear();
    this.paintedStyle = undefined;
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
