import type { Map as MapboxMap } from 'mapbox-gl';
import { vi } from 'vitest';
import {
  bucketInstanceMatrix,
  evaluateModelPaint,
  globeGeoJSONMatrix,
  headingOf,
  modelSourceMatrix,
  styleSpec,
} from '@/test/mapboxModelMath';

/**
 * Test double of a Mapbox map that keeps sources and layers the way mapbox-gl 3.x does and answers
 * "which way is this model drawn right now?" with Mapbox's own placement math (see mapboxModelMath).
 *
 * What it models, read from mapbox-gl's draw code:
 * - A model layer on a GeoJSON source draws from a tile bucket that bakes model-rotation,
 *   model-scale and model-translation per feature when it is built (ModelBucket.evaluate). It is
 *   rebuilt on setData, when the layer is added, on any changed layout value (Style._updateLayer
 *   reloads the source), and on a changed paint value that is data-driven or one of those three
 *   (ModelStyleLayer._handleOverridablePaintPropertyUpdate). The rebuild is immediate here; in
 *   Mapbox it is a worker round trip. model-opacity is read at draw time.
 * - On the globe, that bucket's rotation goes through drawVectorLayerModels' decomposition, which
 *   drops the angle (see globeGeoJSONMatrix); its scale and translation survive.
 * - A model layer on a model source is placed at draw time from the model's position and
 *   orientation plus the layer's current paint, in either projection (drawModels).
 */

interface SourceRecord {
  type: string;
  spec: Record<string, unknown>;
  /** GeoJSON: the data last set. */
  data?: GeoJSON.Feature | GeoJSON.FeatureCollection;
  /** Model source: the models last set. */
  models?: Record<string, { uri: string; position?: number[]; orientation?: number[]; featureProperties?: Record<string, unknown> }>;
  setData?: (data: GeoJSON.Feature) => void;
  setModels?: (models: SourceRecord['models']) => void;
}

interface LayerRecord {
  id: string;
  type: string;
  source: string;
  layout?: Record<string, unknown>;
  paint: Record<string, unknown>;
  /** GeoJSON model layers: the bucket as last built, from the feature's properties and the paint then. */
  bucket?: { properties: Record<string, unknown>; rotation: unknown; scale: unknown; translation: unknown };
}

/** How Mapbox draws a model right now. */
export interface DrawnModel {
  /** The rotation-scale matrix Mapbox builds (rotationScaleYZFlipMatrix's output). */
  matrix: number[];
  /** Compass heading the matrix turns the model to. */
  heading: number;
  /** Metres east, north, up. */
  translation: number[];
  opacity: number;
  /** Where the model stands, [lng, lat]. */
  position: number[];
}

/** Paint values whose change makes Mapbox rebuild a model layer's buckets. */
const MODEL_RELAYOUT_PAINT = new Set(['model-color', 'model-color-mix-intensity', 'model-rotation', 'model-scale', 'model-translation', 'model-emissive-strength']);

export type Projection = 'globe' | 'mercator';

const isExpression = (value: unknown) => Array.isArray(value) && typeof value[0] === 'string';

export function createModelLayerMap() {
  const sources = new Map<string, SourceRecord>();
  const layers = new Map<string, LayerRecord>();
  /** Every source and layer spec as it was added, to validate against the style spec. */
  const added: { sources: Record<string, unknown>; layers: Record<string, unknown> } = { sources: {}, layers: {} };

  const featureProperties = (data: SourceRecord['data']) => {
    const feature = data?.type === 'FeatureCollection' ? data.features[0] : data;
    return (feature?.properties ?? {}) as Record<string, unknown>;
  };

  const rebuildBuckets = (sourceId: string) => {
    const source = sources.get(sourceId);
    if (source?.type !== 'geojson') return;
    for (const layer of layers.values()) {
      if (layer.source !== sourceId || layer.type !== 'model') continue;
      layer.bucket = {
        properties: featureProperties(source.data),
        rotation: layer.paint['model-rotation'],
        scale: layer.paint['model-scale'],
        translation: layer.paint['model-translation'],
      };
    }
  };

  const map = {
    isStyleLoaded: vi.fn(() => true),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string, spec: Record<string, unknown>) => {
      if (sources.has(id)) throw new Error(`There is already a source with ID "${id}".`);
      added.sources[id] = structuredClone(spec);
      const record: SourceRecord = { type: spec.type as string, spec };
      if (record.type === 'geojson') {
        record.data = spec.data as SourceRecord['data'];
        record.setData = vi.fn((data: GeoJSON.Feature) => {
          record.data = structuredClone(data);
          rebuildBuckets(id);
        });
      }
      if (record.type === 'model') {
        record.models = structuredClone(spec.models as SourceRecord['models']);
        record.setModels = vi.fn((models: SourceRecord['models']) => { record.models = structuredClone(models); });
      }
      sources.set(id, record);
    }),
    removeSource: vi.fn((id: string) => {
      if ([...layers.values()].some((l) => l.source === id)) throw new Error(`Source "${id}" is in use.`);
      sources.delete(id);
    }),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((spec: LayerRecord) => {
      if (!sources.has(spec.source)) throw new Error(`Source "${spec.source}" not found.`);
      added.layers[spec.id] = structuredClone(spec);
      layers.set(spec.id, { ...structuredClone(spec), paint: { ...spec.paint } });
      rebuildBuckets(spec.source);
    }),
    removeLayer: vi.fn((id: string) => { layers.delete(id); }),
    getLayoutProperty: vi.fn((id: string, prop: string) => layers.get(id)?.layout?.[prop]),
    setLayoutProperty: vi.fn((id: string, prop: string, value: unknown) => {
      const layer = layers.get(id);
      if (!layer || JSON.stringify(layer.layout?.[prop]) === JSON.stringify(value)) return;
      layer.layout = { ...layer.layout, [prop]: value };
      rebuildBuckets(layer.source);
    }),
    setPaintProperty: vi.fn((id: string, prop: string, value: unknown) => {
      const layer = layers.get(id);
      if (!layer || JSON.stringify(layer.paint[prop]) === JSON.stringify(value)) return;
      const relayout = isExpression(layer.paint[prop]) || isExpression(value)
        || (layer.type === 'model' && MODEL_RELAYOUT_PAINT.has(prop));
      layer.paint[prop] = value;
      if (relayout) rebuildBuckets(layer.source);
    }),
    hasModel: vi.fn(() => true),
    addModel: vi.fn(),
    triggerRepaint: vi.fn(),
  };

  /** How Mapbox draws the model of `layerId` in `projection`; null when the layer draws no model. */
  function drawn(layerId: string, projection: Projection): DrawnModel | null {
    const layer = layers.get(layerId);
    if (!layer || layer.type !== 'model' || layer.layout?.visibility === 'none') return null;
    const source = sources.get(layer.source);
    const opacityOf = (props: Record<string, unknown>) => evaluateModelPaint('model-opacity', layer.paint['model-opacity'], props) as unknown as number;
    if (source?.type === 'model') {
      const model = Object.values(source.models ?? {})[0];
      if (!model) return null;
      const props = model.featureProperties ?? {};
      const rotation = evaluateModelPaint('model-rotation', layer.paint['model-rotation'], props);
      const scale = evaluateModelPaint('model-scale', layer.paint['model-scale'], props);
      const matrix = modelSourceMatrix(model.orientation ?? [0, 0, 0], rotation, scale);
      return {
        matrix,
        heading: headingOf(matrix),
        translation: evaluateModelPaint('model-translation', layer.paint['model-translation'], props),
        opacity: opacityOf(props),
        position: model.position ?? [0, 0],
      };
    }
    if (source?.type === 'geojson' && layer.bucket) {
      const { properties } = layer.bucket;
      const rotation = evaluateModelPaint('model-rotation', layer.bucket.rotation, properties);
      const scale = evaluateModelPaint('model-scale', layer.bucket.scale, properties);
      const matrix = projection === 'globe' ? globeGeoJSONMatrix(rotation, scale) : bucketInstanceMatrix(rotation, scale);
      const data = source.data;
      const feature = data?.type === 'FeatureCollection' ? data.features[0] : data;
      return {
        matrix,
        heading: headingOf(matrix),
        translation: evaluateModelPaint('model-translation', layer.bucket.translation, properties),
        opacity: opacityOf(properties),
        position: (feature?.geometry as GeoJSON.Point | undefined)?.coordinates ?? [0, 0],
      };
    }
    return null;
  }

  /** The compass heading Mapbox draws the model of `layerId` at; null when it draws none. */
  function drawnHeading(layerId: string, projection: Projection): number | null {
    return drawn(layerId, projection)?.heading ?? null;
  }

  /** Mapbox's style validator's complaints about every source and layer added so far. */
  function validate(): string[] {
    const style = { version: 8, sources: added.sources, layers: Object.values(added.layers) };
    return styleSpec.validate(style).map((e) => e.message);
  }

  return { map: map as unknown as MapboxMap, double: map, sources, layers, drawn, drawnHeading, validate };
}
