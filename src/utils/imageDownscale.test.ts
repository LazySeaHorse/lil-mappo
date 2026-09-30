import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fitWithin, hasTransparency, imageFileToDataUrl, ImageImportError, MAX_SOURCE_BYTES,
} from './imageDownscale';

describe('fitWithin', () => {
  it('keeps small images as they are', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('scales the long edge down to 1280, keeping the aspect ratio', () => {
    expect(fitWithin(4000, 2000)).toEqual({ width: 1280, height: 640 });
    expect(fitWithin(1000, 5000)).toEqual({ width: 256, height: 1280 });
  });
  it('never yields a zero side', () => {
    expect(fitWithin(100000, 10).height).toBe(1);
  });
});

describe('hasTransparency', () => {
  it('detects any non-opaque pixel', () => {
    expect(hasTransparency([1, 2, 3, 255, 4, 5, 6, 255])).toBe(false);
    expect(hasTransparency([1, 2, 3, 255, 4, 5, 6, 200])).toBe(true);
  });
});

describe('imageFileToDataUrl', () => {
  const drawImage = vi.fn();
  const toDataURL = vi.fn((type: string) => `data:${type};base64,xx`);
  let alpha = 255;
  let natural = { w: 4000, h: 2000 };
  let canvas: { width: number; height: number };

  beforeEach(() => {
    drawImage.mockClear();
    toDataURL.mockClear();
    alpha = 255;
    natural = { w: 4000, h: 2000 };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      canvas = this;
      return { drawImage, getImageData: () => ({ data: [0, 0, 0, alpha] }), imageSmoothingQuality: '' } as never;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(toDataURL as never);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      get naturalWidth() { return natural.w; }
      get naturalHeight() { return natural.h; }
      set src(_v: string) { queueMicrotask(() => this.onload?.()); }
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const file = (type: string, size = 10) => {
    const f = new File(['x'], 'a', { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };

  it('downscales and encodes opaque images as JPEG at 0.85', async () => {
    const url = await imageFileToDataUrl(file('image/png'));
    expect(url.startsWith('data:image/jpeg')).toBe(true);
    expect(canvas).toMatchObject({ width: 1280, height: 640 });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 640);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('keeps PNG when the image has transparency', async () => {
    alpha = 10;
    const url = await imageFileToDataUrl(file('image/png'));
    expect(url.startsWith('data:image/png')).toBe(true);
  });

  it('does not upscale small images', async () => {
    natural = { w: 300, h: 200 };
    await imageFileToDataUrl(file('image/jpeg'));
    expect(canvas).toMatchObject({ width: 300, height: 200 });
  });

  it('rejects non-images, SVG and oversized files', async () => {
    await expect(imageFileToDataUrl(file('text/plain'))).rejects.toBeInstanceOf(ImageImportError);
    await expect(imageFileToDataUrl(file('image/svg+xml'))).rejects.toBeInstanceOf(ImageImportError);
    await expect(imageFileToDataUrl(file('image/png', MAX_SOURCE_BYTES + 1))).rejects.toThrow(/too large/);
  });
});
