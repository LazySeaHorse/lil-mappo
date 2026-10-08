import { describe, expect, it, vi } from 'vitest';
import { FlagTileSource, type TileTarget } from './FlagTileSource';
import type { FlagImage } from './flagImages';

const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[-20, -15], [20, -15], [20, 15], [-20, 15], [-20, -15]]] };
const image = { width: 1280, height: 960 } as unknown as FlagImage;
const signal = new AbortController().signal;

function setup() {
  const tile = { done: true } as unknown as ImageBitmap;
  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    clip: vi.fn(), stroke: vi.fn(), drawImage: vi.fn(),
  };
  const target: TileTarget = { ctx: ctx as unknown as TileTarget['ctx'], finish: () => tile };
  const loadImage = vi.fn(async () => image);
  const createTarget = vi.fn(() => target);
  const source = new FlagTileSource('flag-src', { loadImage, createTarget });
  const update = vi.fn();
  source.update = update;
  return { source, tile, ctx, loadImage, createTarget, update };
}

describe('FlagTileSource', () => {
  it('is a 512px custom raster source', () => {
    const { source } = setup();
    expect(source).toMatchObject({ id: 'flag-src', type: 'custom', tileSize: 512 });
  });

  it('renders nothing before a flag is set', async () => {
    const { source, createTarget } = setup();
    expect(source.hasTile({ z: 0, x: 0, y: 0 })).toBe(false);
    expect(await source.loadTile({ z: 0, x: 0, y: 0 }, { signal })).toBeNull();
    expect(createTarget).not.toHaveBeenCalled();
  });

  it('draws intersecting tiles with the decoded flag', async () => {
    const { source, tile, ctx, loadImage } = setup();
    source.setFlag('fr', geometry);
    expect(loadImage).toHaveBeenCalledWith('fr');
    expect(source.hasTile({ z: 0, x: 0, y: 0 })).toBe(true);
    expect(await source.loadTile({ z: 0, x: 0, y: 0 }, { signal })).toBe(tile);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.clip).toHaveBeenCalledWith('evenodd');
  });

  it('returns null without allocating a canvas for non-intersecting tiles', async () => {
    const { source, createTarget } = setup();
    source.setFlag('fr', geometry);
    expect(source.hasTile({ z: 3, x: 0, y: 0 })).toBe(false);
    expect(await source.loadTile({ z: 3, x: 0, y: 0 }, { signal })).toBeNull();
    expect(createTarget).not.toHaveBeenCalled();
  });

  it('calls update() once the source is mounted and the flag or outline changes', () => {
    const { source, update } = setup();
    source.setFlag('fr', geometry);
    expect(update).not.toHaveBeenCalled();
    source.onAdd();
    source.setFlag('fr', geometry);
    expect(update).not.toHaveBeenCalled();
    source.setFlag('de', geometry);
    expect(update).toHaveBeenCalledTimes(1);
    source.setFlag('de', { ...geometry });
    expect(update).toHaveBeenCalledTimes(2);
    source.onRemove();
    source.setFlag('it', geometry);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('returns null and warns when the flag cannot be loaded', async () => {
    const { source, loadImage } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    source.setFlag('fr', geometry);
    loadImage.mockRejectedValue(new Error('decode'));
    expect(await source.loadTile({ z: 0, x: 0, y: 0 }, { signal })).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('draws nothing for an aborted tile', async () => {
    const { source, createTarget } = setup();
    source.setFlag('fr', geometry);
    const controller = new AbortController();
    controller.abort();
    expect(await source.loadTile({ z: 0, x: 0, y: 0 }, { signal: controller.signal })).toBeNull();
    expect(createTarget).not.toHaveBeenCalled();
  });
});
