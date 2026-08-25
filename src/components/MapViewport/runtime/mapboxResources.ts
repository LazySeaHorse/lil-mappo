import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';

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
