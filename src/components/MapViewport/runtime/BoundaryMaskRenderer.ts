import type { Map as MapboxMap } from 'mapbox-gl';
import type { BoundaryItem } from '@/store/types';
import {
  buildMaskRegions,
  DEFAULT_MASK_COLOR,
  LABEL_HIDE_OPACITY,
  type MaskRegions,
  maskSetKey,
  resolveActiveMasks,
  resolveRegionPaint,
} from './boundaryMaskModel';
import {
  getGeoJSONSource,
  mutateMap,
  noPaintTransitions,
  removeLayerIfPresent,
  removeSourceIfPresent,
} from './mapboxResources';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const SOURCE_ID = 'boundary-mask';
const LAYER_ID = 'boundary-mask-layer';
const CLIP_LAYER_ID = 'boundary-mask-clip';
const CLIP_SOURCE_PREFIX = 'boundary-mask-clip-';
/** Region sets already built, so scrubbing back and forth over the same sets does not recompute. */
const GEOMETRY_CACHE_SIZE = 8;

interface RegionPaint {
  opacity: number;
  color: string;
}

/**
 * The single layer that paints everything outside the masked boundaries. It is shared
 * (one per map, not one per boundary) because per-boundary masks would each cover the
 * other boundary's interior. Every region (the outside, each boundary's area) gets its
 * own opacity through feature state, so holes open and close with their boundary's fill.
 *
 * Labels and 3D objects under the dark regions are removed by a `clip` layer: on the
 * globe or with terrain Mapbox draws all fills before any label, so the fill alone
 * cannot cover them. Mapbox Standard's road, water and natural-feature labels are drawn
 * after every 3D layer (the clip counts as one), so on the globe those stay visible.
 */
export class BoundaryMaskRenderer {
  private readonly geometryCache = new Map<string, MaskRegions | null>();
  /** Key of the set of holes currently uploaded; '' is the empty source. */
  private uploadedKey = '';
  private uploaded: MaskRegions | null = null;
  /** Feature state last written per region id. */
  private readonly regionPaint = new Map<number, RegionPaint>();
  /** What the clip layer removes labels from (upload key plus region ids); '' while there is none. */
  private clipKey = '';
  private clipSourceId: string | null = null;
  private clipVersion = 0;
  private disposed = false;

  constructor(private readonly map: MapboxMap) {}

  mount(): void {
    this.disposed = false;
    this.uploadedKey = '';
    this.uploaded = null;
    this.regionPaint.clear();
    this.clipKey = '';
    this.clipSourceId = null;
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
      const built = key === '' ? null : this.regionsFor(key, active);
      source.setData(built?.data ?? EMPTY_FC);
      this.uploadedKey = key;
      this.uploaded = built;
      this.regionPaint.clear();
    }

    const hidden: number[] = [];
    for (const region of this.uploaded?.regions ?? []) {
      const paint = resolveRegionPaint(region.inside, active);
      this.writeRegionPaint(region.id, paint);
      if (paint.opacity >= LABEL_HIDE_OPACITY) hidden.push(region.id);
    }
    this.syncClip(hidden);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geometryCache.clear();
    this.removeClip();
    removeLayerIfPresent(this.map, LAYER_ID);
    removeSourceIfPresent(this.map, SOURCE_ID);
  }

  private regionsFor(key: string, holes: Parameters<typeof buildMaskRegions>[0]): MaskRegions | null {
    if (this.geometryCache.has(key)) return this.geometryCache.get(key) ?? null;
    const regions = buildMaskRegions(holes);
    if (this.geometryCache.size >= GEOMETRY_CACHE_SIZE) {
      this.geometryCache.delete(this.geometryCache.keys().next().value as string);
    }
    this.geometryCache.set(key, regions);
    return regions;
  }

  private writeRegionPaint(id: number, paint: RegionPaint): void {
    const last = this.regionPaint.get(id);
    if (last && last.opacity === paint.opacity && (last.color === paint.color || paint.opacity === 0)) return;
    // Keep the last color while transparent so a fade-out does not switch colors on its way
    const next = paint.opacity === 0 && last ? { opacity: 0, color: last.color } : paint;
    const written = mutateMap(this.map, { operation: 'setFeatureState', phase: 'update', resourceId: SOURCE_ID }, () => {
      this.map.setFeatureState({ source: SOURCE_ID, id }, { opacity: next.opacity, color: next.color });
    });
    if (written) this.regionPaint.set(id, next);
  }

  /**
   * Replaces the clip layer with one over the dark regions, or removes it when there are
   * none. Each shape gets a source of its own: Mapbox keeps the clip shapes it cached per
   * tile until a region's source id or bounds change, so new data (or a new filter) in the
   * same source would leave labels clipped, or not, by the old shape. This runs only when
   * the hidden set changes, a few times per video.
   */
  private syncClip(hidden: readonly number[]): void {
    const key = hidden.length === 0 ? '' : `${this.uploadedKey}#${hidden.join(',')}`;
    if (key === this.clipKey) return;
    this.removeClip();
    this.clipKey = '';
    if (key === '') return;

    const features = this.uploaded?.data.features.filter((feature) => hidden.includes(feature.id as number)) ?? [];
    const sourceId = `${CLIP_SOURCE_PREFIX}${++this.clipVersion}`;
    // A clip layer counts as 3D, which makes Mapbox Standard reorder some of its labels,
    // so it only exists while something is hidden. It goes under the mask fill, so the
    // fill still ends up above every label on a flat map.
    const added = mutateMap(this.map, { operation: 'addLayer', phase: 'update', resourceId: CLIP_LAYER_ID }, () => {
      this.map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features } });
      this.clipSourceId = sourceId;
      this.map.addLayer({
        id: CLIP_LAYER_ID,
        type: 'clip',
        source: sourceId,
        layout: { 'clip-layer-types': ['symbol', 'model'] },
      }, LAYER_ID);
    });
    if (added) this.clipKey = key;
  }

  private removeClip(): void {
    removeLayerIfPresent(this.map, CLIP_LAYER_ID);
    if (this.clipSourceId) removeSourceIfPresent(this.map, this.clipSourceId);
    this.clipSourceId = null;
  }

  private ensureResources(): void {
    if (!this.map.getSource(SOURCE_ID)) {
      this.map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_FC });
    }
    if (this.map.getLayer(LAYER_ID)) return;
    // No slot and no beforeId: above the whole basemap. That covers labels on a flat map;
    // on the globe or with terrain, fills are drawn before labels whatever their order, and
    // the clip layer removes them instead. Added before any boundary/route layer, so those
    // still draw over it.
    mutateMap(this.map, { operation: 'addLayer', phase: 'setup', resourceId: LAYER_ID }, () => {
      this.map.addLayer({
        id: LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': ['coalesce', ['feature-state', 'color'], DEFAULT_MASK_COLOR],
          'fill-opacity': ['coalesce', ['feature-state', 'opacity'], 0],
          ...noPaintTransitions('fill-color', 'fill-opacity'),
        },
      });
    });
  }
}
