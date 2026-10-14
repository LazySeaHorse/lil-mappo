import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/annotations/styles/index';

const { renderScene } = vi.hoisted(() => ({ renderScene: vi.fn() }));
vi.mock('../scene/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scene/renderer')>()),
  renderScene,
}));

import { clearStylePreviewCache, getStylePreview } from './stylePreview';

/** A 2D context that accepts every call; text measures 8px per call so layout has numbers. */
function fakeContext() {
  const fills: unknown[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(_, prop: string) {
      if (prop === 'measureText') return () => ({ width: 8 });
      if (prop in state) return state[prop];
      return () => {};
    },
    set(_, prop: string, value) {
      state[prop] = value;
      if (prop === 'fillStyle') fills.push(value);
      return true;
    },
  });
  return { ctx, fills };
}

let fills: unknown[];
beforeEach(() => {
  clearStylePreviewCache();
  renderScene.mockReset();
  const fake = fakeContext();
  fills = fake.fills;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake.ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
});

describe('getStylePreview', () => {
  it('draws the style with the real renderer and returns a data URL', async () => {
    expect(await getStylePreview('leader-line', 'light', 'Paris')).toBe('data:image/png;base64,AAAA');
    expect(renderScene).toHaveBeenCalledTimes(1);
  });

  it('draws once per style and theme, then answers from the cache', async () => {
    await getStylePreview('leader-line', 'light', 'Paris');
    await getStylePreview('leader-line', 'light', 'Paris');
    expect(renderScene).toHaveBeenCalledTimes(1);

    await getStylePreview('leader-line', 'dark', 'Paris');
    expect(renderScene).toHaveBeenCalledTimes(2);
    await getStylePreview('leader-line', 'dark', 'Paris');
    await getStylePreview('leader-line', 'light', 'Paris');
    expect(renderScene).toHaveBeenCalledTimes(2);

    await getStylePreview('waypoint', 'light', 'Paris');
    expect(renderScene).toHaveBeenCalledTimes(3);
  });

  it('shares one draw between callers that ask at the same time', async () => {
    await Promise.all([
      getStylePreview('stamp', 'light', 'Paris'),
      getStylePreview('stamp', 'light', 'Paris'),
    ]);
    expect(renderScene).toHaveBeenCalledTimes(1);
  });

  it('draws again for another sample text, because the picture shows the text', async () => {
    await getStylePreview('stamp', 'light', 'Paris');
    await getStylePreview('stamp', 'light', 'Rome');
    expect(renderScene).toHaveBeenCalledTimes(2);
  });

  it('puts a light map tone behind the light theme and a dark one behind the dark theme', async () => {
    await getStylePreview('stamp', 'light', 'Paris');
    const light = fills[0];
    fills.length = 0;
    await getStylePreview('stamp', 'dark', 'Paris');
    expect(fills[0]).not.toBe(light);
  });

  it('gives null for an unknown style and when the canvas has no 2D context', async () => {
    expect(await getStylePreview('nope', 'light', 'Paris')).toBeNull();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    expect(await getStylePreview('flag', 'light', 'Paris')).toBeNull();
    expect(renderScene).not.toHaveBeenCalled();
  });
});
