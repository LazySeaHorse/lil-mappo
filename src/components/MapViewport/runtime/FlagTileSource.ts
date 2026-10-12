import type { CustomSourceInterface } from 'mapbox-gl';
import { drawFlagTile, type FlagDrawContext, type FlagPart, partsIntersectTile, prepareFlagParts } from './flagFill';
import { type FlagImage, loadFlagImage } from './flagImages';

export const FLAG_TILE_SIZE = 512;

type TileData = ImageBitmap | HTMLCanvasElement;

/** A canvas to draw one tile on, and how to hand the result to Mapbox (which accepts only canvas elements, bitmaps and ImageData). */
export interface TileTarget {
  ctx: FlagDrawContext;
  finish(): TileData;
}

export interface FlagTileSourceDeps {
  loadImage: (code: string) => Promise<FlagImage>;
  createTarget: (size: number) => TileTarget;
}

function createCanvasTarget(size: number): TileTarget {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size, size);
    return {
      ctx: canvas.getContext('2d') as unknown as FlagDrawContext,
      finish: () => canvas.transferToImageBitmap(),
    };
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { ctx: canvas.getContext('2d') as unknown as FlagDrawContext, finish: () => canvas };
}

/**
 * Mapbox custom raster source that paints one flag, clipped to a boundary, into each tile.
 * Tiles are cheap (clip + one drawImage of the already-decoded flag) because a pending
 * tile holds the map's `idle` event back, which video export waits on.
 *
 * Mapbox assigns `update()` (reload every tile) onto this object after `addSource`.
 */
export class FlagTileSource implements CustomSourceInterface<TileData | null | undefined> {
  readonly type = 'custom' as const;
  readonly dataType = 'raster' as const;
  readonly tileSize = FLAG_TILE_SIZE;
  /** Set by Mapbox once the source is added. */
  update?: () => void;
  clearTiles?: () => void;

  private code: string | null = null;
  private geometry: GeoJSON.Geometry | null = null;
  private parts: FlagPart[] = [];
  private mounted = false;
  private readonly deps: FlagTileSourceDeps;

  constructor(readonly id: string, deps?: Partial<FlagTileSourceDeps>) {
    this.deps = { loadImage: loadFlagImage, createTarget: createCanvasTarget, ...deps };
  }

  onAdd = (): void => {
    this.mounted = true;
  };

  onRemove = (): void => {
    this.mounted = false;
  };

  /** Sets what to draw. Re-renders every tile only when the flag or the outline actually changed. */
  setFlag(code: string | null, geometry: GeoJSON.Geometry | null): void {
    const geometryChanged = geometry !== this.geometry;
    const changed = code !== this.code || geometryChanged;
    if (geometryChanged) {
      this.geometry = geometry;
      this.parts = geometry ? prepareFlagParts(geometry) : [];
    }
    this.code = code;
    if (!changed) return;
    // Decode ahead of the first tile request; a failure surfaces (as an empty tile) in loadTile
    if (code) this.deps.loadImage(code).catch(() => undefined);
    if (this.mounted) this.update?.();
  }

  hasTile = ({ z, x, y }: { z: number; x: number; y: number }): boolean =>
    this.code !== null && partsIntersectTile(this.parts, z, x, y);

  loadTile = async (
    { z, x, y }: { z: number; x: number; y: number },
    { signal }: { signal: AbortSignal },
  ): Promise<TileData | null | undefined> => {
    const { code, parts } = this;
    if (!code || !partsIntersectTile(parts, z, x, y)) return null;
    let image: FlagImage;
    try {
      image = await this.deps.loadImage(code);
    } catch (error) {
      console.warn(`Flag "${code}" could not be loaded`, error);
      return null;
    }
    if (signal.aborted) return null;
    const target = this.deps.createTarget(this.tileSize);
    return drawFlagTile(target.ctx, { z, x, y, tileSize: this.tileSize }, parts, image) ? target.finish() : null;
  };
}
