import type { Map as MapboxMap } from 'mapbox-gl';
import { FlagTileSource } from './FlagTileSource';
import { hasFlag, loadFlagImage } from './flagImages';
import {
  LayerPropertyWriter,
  mutateMap,
  noPaintTransitions,
  removeLayerIfPresent,
  removeSourceIfPresent,
} from './mapboxResources';
import type { MaskPlacement } from './BoundaryMaskRenderer';

/** What a boundary wants drawn this frame. */
export interface FlagFillState {
  /** fillMode === 'flag' */
  enabled: boolean;
  code: string | null;
  geometry: GeoJSON.Geometry | null;
  opacity: number;
}

/** Whether the style asks for a flag we have artwork for. */
export function wantsFlag(enabled: boolean, code: string | null): code is string {
  return enabled && hasFlag(code);
}

/** Starts decoding the flag so the first tiles do not wait on it. */
export function preloadFlag(enabled: boolean, code: string | null): void {
  if (wantsFlag(enabled, code)) loadFlagImage(code).catch(() => undefined);
}

/**
 * One boundary's flag fill: a custom raster source plus a raster layer, created only
 * while the boundary is in flag mode with a known flag. The layer goes where the shared
 * outside mask goes (below map labels); because the mask is mounted first, a layer added
 * later in the same slot / before the same symbol layer lands above it.
 */
export class BoundaryFlagLayer {
  readonly sourceId: string;
  readonly layerId: string;
  private source: FlagTileSource | null = null;
  private readonly layers: LayerPropertyWriter<{ opacity: number }>;

  constructor(
    private readonly map: MapboxMap,
    boundaryId: string,
    private readonly getPlacement: () => MaskPlacement,
  ) {
    this.sourceId = `boundary-flag-${boundaryId}`;
    this.layerId = `boundary-flag-layer-${boundaryId}`;
    this.layers = new LayerPropertyWriter(map, () => ({ opacity: -1 }));
  }

  /** Forget everything created earlier; call when the style (and so our resources) was replaced. */
  reset(): void {
    this.source = null;
    this.layers.reset();
  }

  sync({ enabled, code, geometry, opacity }: FlagFillState): void {
    if (!wantsFlag(enabled, code) || !geometry) {
      this.remove();
      return;
    }
    if (!this.ensureSource()) return;
    this.source?.setFlag(code, geometry);
    if (!this.ensureLayer()) return;
    this.layers.setPaint(this.layerId, 'raster-opacity', opacity, 'opacity', opacity);
  }

  dispose(): void {
    this.remove();
  }

  private remove(): void {
    if (!this.source && !this.map.getLayer(this.layerId) && !this.map.getSource(this.sourceId)) return;
    removeLayerIfPresent(this.map, this.layerId);
    removeSourceIfPresent(this.map, this.sourceId);
    this.source = null;
    this.layers.reset();
  }

  private ensureSource(): boolean {
    if (this.source && this.map.getSource(this.sourceId)) return true;
    // A source we hold no handle to (or one left over from before a reset) cannot be updated
    this.remove();
    const source = new FlagTileSource(this.sourceId);
    const added = mutateMap(this.map, { operation: 'addSource', phase: 'setup', resourceId: this.sourceId }, () => {
      this.map.addSource(this.sourceId, source);
    });
    if (added) this.source = source;
    return added;
  }

  private ensureLayer(): boolean {
    if (this.map.getLayer(this.layerId)) return true;
    const { slot, beforeId } = this.getPlacement();
    this.layers.reset();
    return mutateMap(this.map, { operation: 'addLayer', phase: 'setup', resourceId: this.layerId }, () => {
      this.map.addLayer({
        id: this.layerId,
        type: 'raster',
        source: this.sourceId,
        ...(slot ? { slot } : {}),
        paint: {
          'raster-opacity': 0,
          // Tiles are replaced when the flag or outline changes; a cross-fade would show both
          'raster-fade-duration': 0,
          ...noPaintTransitions('raster-opacity'),
        },
      }, beforeId);
    });
  }
}
