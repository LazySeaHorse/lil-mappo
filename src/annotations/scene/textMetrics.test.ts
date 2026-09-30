import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { buildFont } from './textMetrics';

describe('buildFont', () => {
  it('builds a CSS font shorthand', () => {
    expect(buildFont(22, 'Barlow Condensed', 600)).toBe("600 22px 'Barlow Condensed', sans-serif");
    expect(buildFont(14, 'Outfit')).toBe("400 14px 'Outfit', sans-serif");
  });

  it('puts the italic style first so the italic face is requested', () => {
    expect(buildFont(20, 'Fraunces', 700, 'italic')).toBe("italic 700 20px 'Fraunces', sans-serif");
    expect(buildFont(20, 'Fraunces', 700, 'normal')).toBe("700 20px 'Fraunces', sans-serif");
  });
});

describe('text width cache', () => {
  type TextMetrics = typeof import('./textMetrics');
  let metrics: TextMetrics;
  let measureText: ReturnType<typeof vi.fn>;
  let fonts: EventTarget;

  beforeEach(async () => {
    // The measuring context is created once per module, so load a fresh module per test.
    vi.resetModules();
    measureText = vi.fn((text: string) => ({ width: text.length * 10 }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText, font: '' } as never);
    fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    metrics = await import('./textMetrics');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('measures a font and text once, whatever the number of frames', () => {
    for (let i = 0; i < 5; i++) expect(metrics.measureTextWidth('Harbour', 14, 'Outfit', 600)).toBe(70);
    expect(measureText).toHaveBeenCalledTimes(1);
  });

  it('adds the letter spacing to a cached width', () => {
    expect(metrics.measureTextWidth('abcd', 10, 'Outfit', 400, '2px')).toBe(48);
    expect(metrics.measureTextWidth('abcd', 10, 'Outfit', 400, '2px')).toBe(48);
    expect(metrics.measureTextWidth('abcd', 10, 'Outfit', 400, '0.5em')).toBe(60);
    expect(measureText).toHaveBeenCalledTimes(2);
  });

  it('keeps font, size, weight, style and text apart', () => {
    metrics.measureTextWidth('abc', 14, 'Outfit', 400);
    metrics.measureTextWidth('abc', 15, 'Outfit', 400);
    metrics.measureTextWidth('abc', 14, 'Lexend', 400);
    metrics.measureTextWidth('abc', 14, 'Outfit', 700);
    metrics.measureTextWidth('abc', 14, 'Outfit', 400, undefined, 'italic');
    metrics.measureTextWidth('abcd', 14, 'Outfit', 400);
    expect(measureText).toHaveBeenCalledTimes(6);
  });

  it('is bounded, dropping the least recently used width first', () => {
    const { TEXT_WIDTH_CACHE_SIZE, measureTextWidth } = metrics;
    for (let i = 0; i < TEXT_WIDTH_CACHE_SIZE; i++) measureTextWidth(`text ${i}`, 14, 'Outfit');
    measureTextWidth('text 0', 14, 'Outfit'); // refreshed: no longer the oldest
    measureTextWidth('one more', 14, 'Outfit'); // evicts 'text 1'
    expect(measureText).toHaveBeenCalledTimes(TEXT_WIDTH_CACHE_SIZE + 1);

    measureText.mockClear();
    measureTextWidth('text 0', 14, 'Outfit');
    measureTextWidth('one more', 14, 'Outfit');
    expect(measureText).not.toHaveBeenCalled();
    measureTextWidth('text 1', 14, 'Outfit');
    expect(measureText).toHaveBeenCalledTimes(1);
  });

  it('forgets every width when web fonts finish loading', () => {
    metrics.measureTextWidth('Harbour', 14, 'Outfit');
    const epoch = metrics.getTextMetricsEpoch();

    // The font arrives and the same text is wider.
    measureText.mockImplementation((text: string) => ({ width: text.length * 12 }));
    fonts.dispatchEvent(new Event('loadingdone'));

    expect(metrics.getTextMetricsEpoch()).not.toBe(epoch);
    expect(metrics.measureTextWidth('Harbour', 14, 'Outfit')).toBe(84);
  });

  it('does not cache the estimate used when no canvas is available', () => {
    measureText.mockReturnValue({ width: 0 });
    const estimate = metrics.measureTextWidth('abcd', 10, 'Outfit');
    expect(estimate).toBeCloseTo(22);
    measureText.mockReturnValue({ width: 40 });
    expect(metrics.measureTextWidth('abcd', 10, 'Outfit')).toBe(40);
  });
});
