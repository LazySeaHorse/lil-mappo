import type { Map as MapboxMap } from 'mapbox-gl';
import type { BoundaryItem } from '@/store/types';
import {
  buildMaskFeature,
  DEFAULT_MASK_COLOR,
  maskSetKey,
  resolveActiveMasks,
  resolveMaskPaint,
} from './boundaryMaskModel';
import {
  getGeoJSONSource,
  LayerPropertyWriter,
  mutateMap,
  noPaintTransitions,
  removeLayerIfPresent,
  removeSourceIfPresent,
} from './mapboxResources';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const SOURCE_ID = 'boundary-mask';
const LAYER_ID = 'boundary-mask-layer';
/** Unions already built, so scrubbing back and forth over the same sets does not recompute. */
const GEOMETRY_CACHE_SIZE = 8;

interface MaskPaintCache {
  color: string;
  opacity: number;
}

/**
 * The single layer that paints everything outside the masked boundaries. It is shared
 * (one per map, not one per boundary) because per-boundary masks would each cover the
 * other boundary's interior.
 */
export class BoundaryMaskRenderer {
  private readonly layers: LayerPropertyWriter<MaskPaintCache>;
  private readonly geometryCache = new Map<string, GeoJSON.Feature | null>();
  /** Key of the set of holes currently uploaded; '' is the empty source. */
  private uploadedKey = '';
  private disposed = false;

  constructor(private readonly map: MapboxMap) {
    this.layers = new LayerPropertyWriter(map, () => ({ color: '', opacity: -1 }));
  }

  mount(): void {
    this.disposed = false;
    this.layers.reset();
    this.uploadedKey = '';
    this.ensureResources();
  }

  /** `boundaries` is in item order (topmost first); `timeFor` is each boundary's draw time. */
  render = (boundaries: readonly BoundaryItem[], timeFor: (id: string) => number): void => {
    if (this.disposed) return;
    const source = getGeoJSONSource(this.map, SOURCE_ID);
    if (!source) return;

    const active = resolveActiveMasks(boundaries, timeFor);
    const key = maskSetKey(active);
    if (key !== this.uploadedKey) {
      const feature = key === '' ? null : this.maskFor(key, active.map((mask) => mask.geometry));
      source.setData(feature ? { type: 'FeatureCollection', features: [feature] } : EMPTY_FC);
      this.uploadedKey = key;
    }

    const { color, opacity } = resolveMaskPaint(active);
    // Keep the last color while fully transparent so the fade-out does not flash another one
    if (opacity > 0) this.layers.setPaint(LAYER_ID, 'fill-color', color, 'color', color);
    this.layers.setPaint(LAYER_ID, 'fill-opacity', opacity, 'opacity', opacity);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geometryCache.clear();
    removeLayerIfPresent(this.map, LAYER_ID);
    removeSourceIfPresent(this.map, SOURCE_ID);
  }

  private maskFor(key: string, geometries: GeoJSON.Geometry[]): GeoJSON.Feature | null {
    if (this.geometryCache.has(key)) return this.geometryCache.get(key) ?? null;
    const feature = buildMaskFeature(geometries);
    if (this.geometryCache.size >= GEOMETRY_CACHE_SIZE) {
      this.geometryCache.delete(this.geometryCache.keys().next().value as string);
    }
    this.geometryCache.set(key, feature);
    return feature;
  }

  private ensureResources(): void {
    if (!this.map.getSource(SOURCE_ID)) {
      this.map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_FC });
    }
    if (this.map.getLayer(LAYER_ID)) return;
    // No slot and no beforeId: above the whole basemap, labels included, so nothing outside
    // shows through. It is added before any boundary/route layer, so those still draw over it.
    mutateMap(this.map, { operation: 'addLayer', phase: 'setup', resourceId: LAYER_ID }, () => {
      this.map.addLayer({
        id: LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': DEFAULT_MASK_COLOR,
          'fill-opacity': 0,
          ...noPaintTransitions('fill-color', 'fill-opacity'),
        },
      });
    });
  }
}
