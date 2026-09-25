import type { Map as MapboxMap } from 'mapbox-gl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KNOWN_STYLE_TEXTURES,
  addCachedStyleAsset,
  getRasterizedStyleAsset,
  handleMissingStyleImage,
  loadKnownStyleAssets,
  rasterizeSvgToImageData,
} from './styleAssets';

describe('styleAssets', () => {
  let mockMap: {
    hasImage: ReturnType<typeof vi.fn>;
    addImage: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockMap = {
      hasImage: vi.fn(() => false),
      addImage: vi.fn(),
    };
  });

  it('defines all required vintage map textures and lines', () => {
    expect(KNOWN_STYLE_TEXTURES['texture-64']).toBeDefined();
    expect(KNOWN_STYLE_TEXTURES['texture_64']).toBeDefined();
    expect(KNOWN_STYLE_TEXTURES['texture-lttan-64']).toBeDefined();
    expect(KNOWN_STYLE_TEXTURES['texture-dktan-64']).toBeDefined();
    expect(KNOWN_STYLE_TEXTURES['line-32']).toBeDefined();
    expect(KNOWN_STYLE_TEXTURES['line_32']).toBeDefined();
  });

  it('rasterizes SVG into ImageData in test/node environment safely', async () => {
    const data = await rasterizeSvgToImageData('<svg></svg>', 64, 64);
    expect(data.width).toBe(64);
    expect(data.height).toBe(64);
    expect(data.data.length).toBe(64 * 64 * 4);
  });

  it('returns rasterized image data for known texture id and caches it', async () => {
    const data1 = await getRasterizedStyleAsset('texture-64');
    expect(data1).not.toBeNull();
    expect(data1?.width).toBe(64);

    const data2 = await getRasterizedStyleAsset('texture-64');
    expect(data2).toBe(data1); // Same reference from cache
  });

  it('returns null for unknown style asset id', async () => {
    const unknown = await getRasterizedStyleAsset('non-existent-asset');
    expect(unknown).toBeNull();
  });

  it('handles missing style image by adding it to map', async () => {
    const added = await handleMissingStyleImage(mockMap as unknown as MapboxMap, 'texture-lttan-64');
    expect(added).toBe(true);
    expect(mockMap.addImage).toHaveBeenCalledWith('texture-lttan-64', expect.anything());
  });

  it('does not re-add image if map already has it', async () => {
    mockMap.hasImage.mockReturnValue(true);
    const added = await handleMissingStyleImage(mockMap as unknown as MapboxMap, 'texture-64');
    expect(added).toBe(true);
    expect(mockMap.addImage).not.toHaveBeenCalled();
  });

  it('synchronously adds cached style asset once loaded', async () => {
    await getRasterizedStyleAsset('texture-dktan-64');
    const result = addCachedStyleAsset(mockMap as unknown as MapboxMap, 'texture-dktan-64');
    expect(result).toBe(true);
    expect(mockMap.addImage).toHaveBeenCalledWith('texture-dktan-64', expect.anything());
  });

  it('loads all known style assets to map', async () => {
    await loadKnownStyleAssets(mockMap as unknown as MapboxMap);
    expect(mockMap.addImage).toHaveBeenCalledWith('texture-64', expect.anything());
    expect(mockMap.addImage).toHaveBeenCalledWith('texture-lttan-64', expect.anything());
    expect(mockMap.addImage).toHaveBeenCalledWith('texture-dktan-64', expect.anything());
  });
});
