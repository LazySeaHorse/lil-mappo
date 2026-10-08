import type { GeoJSONSource, LayoutSpecification, Map as MapboxMap, PaintSpecification } from 'mapbox-gl';

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

export function getGeoJSONSource(map: MapboxMap, sourceId: string): GeoJSONSource | undefined {
  const source = map.getSource(sourceId);
  if (!source || source.type !== 'geojson') return undefined;
  return source as GeoJSONSource;
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
    if (this.mutate(`setPaintProperty:${property}`, layerId, () => {
      this.map.setPaintProperty(layerId, property, value);
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
