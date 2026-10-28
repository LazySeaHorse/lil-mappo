import type {
  GeoJSONSource,
  GeoJSONSourceSpecification,
  LayoutSpecification,
  Map as MapboxMap,
  ModelSource,
  PaintSpecification,
} from 'mapbox-gl';
import { clamp } from '@/engine/geoMath';

export type MapMutationPhase = 'setup' | 'update' | 'cleanup' | 'style-sync';

export interface MapMutationContext {
  operation: string;
  phase: MapMutationPhase;
  resourceId?: string;
}

export type MapMutationReporter = (context: MapMutationContext, error: unknown) => void;

const defaultReporter: MapMutationReporter = (context, error) => {
  const resource = context.resourceId ? ` (${context.resourceId})` : '';
  console.warn(`[map:${context.phase}] ${context.operation}${resource} failed`, error);
};

/**
 * Runs a Mapbox style mutation and reports unexpected failures with enough
 * context to identify the resource. A style replacement can invalidate every
 * custom resource between the guard and the mutation; that race is expected
 * and is ignored only while the style is not loaded.
 */
export function mutateMap(
  map: MapboxMap,
  context: MapMutationContext,
  mutation: () => void,
  report: MapMutationReporter = defaultReporter,
): boolean {
  try {
    mutation();
    return true;
  } catch (error) {
    if (!map.isStyleLoaded()) return false;
    report(context, error);
    return false;
  }
}

/**
 * Returns true if the Mapbox style is loaded and ready to accept sources, layers,
 * and property updates.
 *
 * `map.isStyleLoaded()` in Mapbox GL checks whether all sources, tiles, and images
 * have zero pending updates. Adding a GeoJSON source causes `map.isStyleLoaded()` to
 * return false until the worker finishes processing the source cache.
 *
 * Checking `style._loaded` reflects whether the stylesheet itself is loaded and ready,
 * matching Mapbox's internal `_checkLoaded()` guard. Mapbox has no public equivalent;
 * react-map-gl's Source and Layer components gate on the same field. Re-check this
 * when upgrading mapbox-gl.
 */
export function isStyleReady(map: MapboxMap): boolean {
  if (map.isStyleLoaded()) return true;
  const style = (map as unknown as { style?: { _loaded?: boolean } }).style;
  return Boolean(style && style._loaded);
}

/**
 * Mapbox eases a changed paint property over 300 ms by default. Our layers are driven
 * frame by frame, so the ease would trail the playhead (and stall export frames waiting
 * for idle). Spread this into a layer's `paint` for the properties we write at runtime.
 */
export function noPaintTransitions(...props: string[]): PaintSpecification {
  return Object.fromEntries(
    props.map((prop) => [`${prop}-transition`, { duration: 0, delay: 0 }]),
  ) as PaintSpecification;
}

type CasterCheck = (layer: unknown, coords: unknown) => boolean;
interface ShadowRendererInternals {
  painter: { style: { getLayerSourceCache(layer: unknown): { getSource(): { type: string; getModels?: unknown } } | undefined } };
  _hasCasterGeometry: CasterCheck;
}

/**
 * Mapbox loads model sources lazily: until the model module arrives, a `model`
 * source is a placeholder without `getModels`, and the shadow pass calls it
 * anyway (`n.getModels is not a function`, mapbox-gl 3.32 and 3.33), so adding a
 * model under a style that casts shadows throws on every frame until the module
 * loads. A placeholder casts no shadow yet; this answers that instead of throwing.
 * The painter creates its private `_shadowRenderer` only once a style turns on 3D
 * lights, so the guard goes on as it is assigned. Does nothing if the painter is
 * not there. Re-check this when upgrading mapbox-gl.
 */
export function guardShadowCasterCheck(map: MapboxMap): void {
  const painter = (map as unknown as { painter?: { _shadowRenderer?: ShadowRendererInternals | null } }).painter;
  if (!painter || typeof painter !== 'object') return;
  let renderer = painter._shadowRenderer;
  if (renderer) guardRenderer(renderer);
  Object.defineProperty(painter, '_shadowRenderer', {
    configurable: true,
    enumerable: true,
    get: () => renderer,
    set: (next: ShadowRendererInternals | null | undefined) => {
      renderer = next;
      if (next) guardRenderer(next);
    },
  });
}

const guardedRenderers = new WeakSet<object>();

function guardRenderer(renderer: ShadowRendererInternals): void {
  const check = renderer._hasCasterGeometry;
  if (guardedRenderers.has(renderer) || typeof check !== 'function') return;
  guardedRenderers.add(renderer);
  renderer._hasCasterGeometry = function (layer, coords) {
    const source = this.painter.style.getLayerSourceCache(layer)?.getSource();
    if (source?.type === 'model' && typeof source.getModels !== 'function') return false;
    return check.call(this, layer, coords);
  };
}

/**
 * Whether Mapbox has a render queued for the current animation frame, i.e. a
 * 'render' event is about to fire. Mapbox has no public equivalent (`isMoving()`
 * is false after a jumpTo, `loaded()` says nothing about repaints), so this reads
 * the private `_frame` / `_renderNextFrame` pair that `triggerRepaint` sets. Re-check
 * this when upgrading mapbox-gl.
 */
export function isRepaintPending(map: MapboxMap): boolean {
  const internal = map as unknown as { _frame?: unknown; _renderNextFrame?: unknown };
  return Boolean(internal._frame && internal._renderNextFrame);
}

/** Shared empty data for geojson sources that start (or are cleared to) nothing. */
export const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** An empty geojson source spec; `lineMetrics` enables line-progress (gradients, trim offsets). */
export function geoJSONSource(lineMetrics = false): GeoJSONSourceSpecification {
  return { type: 'geojson', data: EMPTY_FC, ...(lineMetrics ? { lineMetrics: true } : {}) };
}

export function getGeoJSONSource(map: MapboxMap, sourceId: string): GeoJSONSource | undefined {
  const source = map.getSource(sourceId);
  if (!source || source.type !== 'geojson') return undefined;
  return source as GeoJSONSource;
}

export function getModelSource(map: MapboxMap, sourceId: string): ModelSource | undefined {
  const source = map.getSource(sourceId);
  if (!source || source.type !== 'model') return undefined;
  return source as ModelSource;
}

export function removeLayerIfPresent(
  map: MapboxMap,
  layerId: string,
  report?: MapMutationReporter,
): void {
  if (!map.getLayer(layerId)) return;
  mutateMap(map, { operation: 'removeLayer', phase: 'cleanup', resourceId: layerId }, () => {
    map.removeLayer(layerId);
  }, report);
}

export function removeSourceIfPresent(
  map: MapboxMap,
  sourceId: string,
  report?: MapMutationReporter,
): void {
  if (!map.getSource(sourceId)) return;
  mutateMap(map, { operation: 'removeSource', phase: 'cleanup', resourceId: sourceId }, () => {
    map.removeSource(sourceId);
  }, report);
}

/**
 * Applies paint/layout properties to layers, skipping writes whose value is
 * already what the cache says Mapbox has. `cache` maps a caller-chosen key to
 * the last value successfully written; it is only updated when the write
 * succeeds, so a failed write is retried on the next update.
 *
 * Numeric `*-opacity` paint values are clamped to 0-1: Mapbox rejects anything
 * outside that range with an error event rather than a throw, so the cache would
 * otherwise record a value that was never applied.
 */
export class LayerPropertyWriter<C extends object> {
  cache: C;

  constructor(
    private readonly map: MapboxMap,
    private readonly createCache: () => C,
  ) {
    this.cache = createCache();
  }

  /** Forget everything written; call when layers are recreated. */
  reset(): void {
    this.cache = this.createCache();
  }

  setPaint<K extends keyof C>(
    layerId: string,
    property: keyof PaintSpecification,
    value: unknown,
    cacheKey: K,
    cacheValue: C[K],
  ): void {
    if (this.cache[cacheKey] === cacheValue) return;
    const applied = typeof value === 'number' && property.endsWith('-opacity') ? clamp(value, 0, 1) : value;
    if (this.mutate(`setPaintProperty:${property}`, layerId, () => {
      this.map.setPaintProperty(layerId, property, applied);
    })) this.cache[cacheKey] = cacheValue;
  }

  setLayout<K extends keyof C>(
    layerId: string,
    property: keyof LayoutSpecification,
    value: unknown,
    cacheKey: K,
    cacheValue: C[K],
  ): void {
    if (this.cache[cacheKey] === cacheValue) return;
    if (this.mutate(`setLayoutProperty:${property}`, layerId, () => {
      this.map.setLayoutProperty(layerId, property, value);
    })) this.cache[cacheKey] = cacheValue;
  }

  mutate(operation: string, resourceId: string, mutation: () => void): boolean {
    return mutateMap(this.map, { operation, phase: 'update', resourceId }, mutation);
  }
}
