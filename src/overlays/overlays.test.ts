import { describe, expect, it, vi } from 'vitest';
import { resolveSystemOverlays } from './resolve';
import { drawOverlays } from './drawOverlays';
import { OVERLAY_LAYOUT as L, overlayScale } from './layout';
import type { OverlayImages } from './assets';

const ids = (mode: 'editor' | 'present' | 'export', branding: 'free' | 'paid') =>
  resolveSystemOverlays({ mode, branding }).map((l) => l.id);

describe('resolveSystemOverlays', () => {
  it('has no overlays in the editor', () => {
    expect(ids('editor', 'free')).toEqual([]);
    expect(ids('editor', 'paid')).toEqual([]);
  });

  it.each(['present', 'export'] as const)('%s: mapbox credit for all, brand only for free', (mode) => {
    expect(ids(mode, 'free')).toEqual(['brand', 'mapbox-logo', 'attribution']);
    expect(ids(mode, 'paid')).toEqual(['mapbox-logo', 'attribution']);
  });

  it('anchors the layers', () => {
    const by = Object.fromEntries(resolveSystemOverlays({ mode: 'export', branding: 'free' }).map((l) => [l.id, l.anchor]));
    expect(by).toEqual({ brand: 'top-left', 'mapbox-logo': 'bottom-left', attribution: 'bottom-right' });
  });
});

describe('overlayScale', () => {
  it('never shrinks and grows with the short side', () => {
    expect(overlayScale(1280, 720)).toBe(1);
    expect(overlayScale(3840, 2160)).toBe(2);
    expect(overlayScale(2160, 3840)).toBe(2);
  });
});

function mockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((t: string) => ({ width: t.length * 10 })),
  } as unknown as CanvasRenderingContext2D & { drawImage: ReturnType<typeof vi.fn>; fillText: ReturnType<typeof vi.fn> };
}
const images = { mapboxLogo: { id: 'm' }, brandMark: { id: 'b' } } as unknown as OverlayImages;

describe('drawOverlays', () => {
  it('draws free-tier overlays at their anchors', () => {
    const ctx = mockCtx();
    drawOverlays(ctx, resolveSystemOverlays({ mode: 'export', branding: 'free' }), 1920, 1080, images);

    const markH = L.brand.markHeight;
    const calls = ctx.drawImage.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([images.brandMark, L.margin, L.margin, markH * L.brand.markAspect, markH]);
    expect(calls[1]).toEqual([images.mapboxLogo, L.margin, 1080 - L.margin - 23, 88, 23]);

    const texts = ctx.fillText.mock.calls;
    expect(texts[0][0]).toBe("li'l Mappo");
    // Attribution is right-aligned: its left edge = width - margin - measured width.
    const attrib = texts[1];
    expect(attrib[0]).toBe('© Mapbox © OpenStreetMap');
    expect(attrib[1]).toBe(1920 - L.margin - attrib[0].length * 10);
  });

  it('omits the brand for paid', () => {
    const ctx = mockCtx();
    drawOverlays(ctx, resolveSystemOverlays({ mode: 'export', branding: 'paid' }), 1920, 1080, images);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
  });

  it('scales with output size', () => {
    const ctx = mockCtx();
    drawOverlays(ctx, resolveSystemOverlays({ mode: 'export', branding: 'paid' }), 3840, 2160, images);
    expect(ctx.drawImage.mock.calls[0]).toEqual([images.mapboxLogo, L.margin * 2, 2160 - L.margin * 2 - 46, 176, 46]);
  });

  it('skips image layers until assets are loaded', () => {
    const ctx = mockCtx();
    drawOverlays(ctx, resolveSystemOverlays({ mode: 'export', branding: 'free' }), 1920, 1080, null);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
  });
});
