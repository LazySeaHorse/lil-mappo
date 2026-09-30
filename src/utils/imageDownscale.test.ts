import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fitWithin, hasTransparency, imageFileToDataUrl, ImageImportError, MAX_SOURCE_BYTES,
} from './imageDownscale';

describe('fitWithin', () => {
  it('keeps small images as they are', () => {
    expect(fitWithin(700, 500)).toEqual({ width: 700, height: 500 });
  });
  it('scales the long edge down to 756, keeping the aspect ratio', () => {
    expect(fitWithin(4000, 2000)).toEqual({ width: 756, height: 378 });
    expect(fitWithin(1000, 5000)).toEqual({ width: 151, height: 756 });
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
  let webpSupported = true;
  const toDataURL = vi.fn((type: string) =>
    type === 'image/webp' && !webpSupported ? 'data:image/png;base64,xx' : `data:${type};base64,xx`);
  let alpha = 255;
  let natural = { w: 4000, h: 2000 };

  beforeEach(() => {
    drawImage.mockClear();
    toDataURL.mockClear();
    alpha = 255;
    webpSupported = true;
    natural = { w: 4000, h: 2000 };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
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

  it('downscales and encodes as WebP at 0.8', async () => {
    const url = await imageFileToDataUrl(file('image/png'));
    expect(url.startsWith('data:image/webp')).toBe(true);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 756, 378);
    expect(toDataURL).toHaveBeenCalledWith('image/webp', 0.8);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('falls back to JPEG when the browser cannot encode WebP', async () => {
    webpSupported = false;
    const url = await imageFileToDataUrl(file('image/png'));
    expect(url.startsWith('data:image/jpeg')).toBe(true);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
  });

  it('falls back to PNG when WebP is unavailable and the image has transparency', async () => {
    webpSupported = false;
    alpha = 10;
    const url = await imageFileToDataUrl(file('image/png'));
    expect(url.startsWith('data:image/png')).toBe(true);
  });

  it('does not upscale small images', async () => {
    natural = { w: 300, h: 200 };
    await imageFileToDataUrl(file('image/jpeg'));
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 300, 200);
  });

  it('rejects non-images, SVG and oversized files', async () => {
    await expect(imageFileToDataUrl(file('text/plain'))).rejects.toBeInstanceOf(ImageImportError);
    await expect(imageFileToDataUrl(file('image/svg+xml'))).rejects.toBeInstanceOf(ImageImportError);
    await expect(imageFileToDataUrl(file('image/png', MAX_SOURCE_BYTES + 1))).rejects.toThrow(/too large/);
  });
});
