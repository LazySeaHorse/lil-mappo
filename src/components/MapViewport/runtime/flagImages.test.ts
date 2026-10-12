import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  availableFlagCodes,
  createFlagImages,
  FLAG_HEIGHT,
  FLAG_WIDTH,
  type FlagImage,
  flagName,
  getFlagOptions,
  hasFlag,
  loadFlagImage,
  withIntrinsicSize,
} from './flagImages';

afterEach(() => vi.unstubAllGlobals());

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" id="x" viewBox="0 0 640 480"><path d="M0 0"/></svg>';

describe('withIntrinsicSize', () => {
  it('injects width and height on the root svg only', () => {
    const out = withIntrinsicSize(SVG);
    expect(out).toContain(`width="${FLAG_WIDTH}" height="${FLAG_HEIGHT}"`);
    expect(out).toContain('viewBox="0 0 640 480"');
    expect(out.match(/width=/g)).toHaveLength(1);
  });

  it('replaces existing sizes instead of duplicating them', () => {
    const out = withIntrinsicSize('<svg width="10" height="5" viewBox="0 0 1 1"/>'.replace('/>', '></svg>'));
    expect(out.match(/width=/g)).toHaveLength(1);
    expect(out).toContain('width="1280"');
  });
});

describe('createFlagImages', () => {
  const makeLoaders = () => ({
    '/node_modules/flag-icons/flags/4x3/fr.svg': vi.fn(async () => SVG),
    '/node_modules/flag-icons/flags/4x3/de.svg': vi.fn(async () => SVG),
    '/node_modules/flag-icons/flags/4x3/eu.svg': vi.fn(async () => SVG),
    '/node_modules/flag-icons/flags/4x3/gb-eng.svg': vi.fn(async () => SVG),
    '/node_modules/flag-icons/flags/4x3/arab.svg': vi.fn(async () => SVG),
  });

  it('lists only two-letter country codes, sorted', () => {
    const flags = createFlagImages({ loaders: makeLoaders(), rasterize: vi.fn() });
    expect(flags.availableFlagCodes()).toEqual(['de', 'fr']);
    expect(flags.hasFlag('fr')).toBe(true);
    expect(flags.hasFlag('eu')).toBe(false);
    expect(flags.hasFlag('gb-eng')).toBe(false);
    expect(flags.hasFlag(null)).toBe(false);
  });

  it('loads each code once and caches the promise', async () => {
    const loaders = makeLoaders();
    const image = { width: 1280, height: 960 } as unknown as FlagImage;
    const rasterize = vi.fn(async () => image);
    const flags = createFlagImages({ loaders, rasterize });
    const [a, b] = await Promise.all([flags.loadFlagImage('fr'), flags.loadFlagImage('fr')]);
    expect(a).toBe(image);
    expect(b).toBe(image);
    expect(loaders['/node_modules/flag-icons/flags/4x3/fr.svg']).toHaveBeenCalledTimes(1);
    expect(rasterize).toHaveBeenCalledTimes(1);
    expect(rasterize).toHaveBeenCalledWith(SVG);
    expect(loaders['/node_modules/flag-icons/flags/4x3/de.svg']).not.toHaveBeenCalled();
  });

  it('rejects unknown codes and retries after a failure', async () => {
    const rasterize = vi.fn().mockRejectedValueOnce(new Error('decode')).mockResolvedValue({ width: 1, height: 1 } as unknown as FlagImage);
    const flags = createFlagImages({ loaders: makeLoaders(), rasterize });
    await expect(flags.loadFlagImage('zz')).rejects.toThrow(/No flag/);
    await expect(flags.loadFlagImage('fr')).rejects.toThrow('decode');
    await expect(flags.loadFlagImage('fr')).resolves.toBeDefined();
  });

  it('works when the loaders are called detached from the object', async () => {
    const image = { width: 1280, height: 960 } as unknown as FlagImage;
    const { loadFlagImage, loadFlagSvg } = createFlagImages({ loaders: makeLoaders(), rasterize: vi.fn(async () => image) });
    await expect(loadFlagImage('fr')).resolves.toBe(image);
    await expect(loadFlagSvg('de')).resolves.toBe(SVG);
    const deps = { loadImage: loadFlagImage };
    await expect(deps.loadImage('fr')).resolves.toBe(image);
  });
});

describe('rasterising', () => {
  it('decodes a sized svg blob, draws it to a 1280x960 canvas and revokes the url', async () => {
    const drawImage = vi.fn();
    class FakeOffscreen {
      constructor(public width: number, public height: number) {}
      getContext() { return { drawImage }; }
    }
    const blobParts: string[] = [];
    vi.stubGlobal('Blob', class { constructor(parts: string[]) { blobParts.push(...parts); } });
    vi.stubGlobal('OffscreenCanvas', FakeOffscreen);
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:flag', revokeObjectURL: vi.fn() });
    const decode = vi.fn(async () => undefined);
    vi.stubGlobal('Image', class { src = ''; decode = decode; });

    const image = await loadFlagImage('fr');
    expect(image.width).toBe(FLAG_WIDTH);
    expect(image.height).toBe(FLAG_HEIGHT);
    expect(decode).toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, FLAG_WIDTH, FLAG_HEIGHT);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:flag');
    expect(blobParts[0]).toContain(`width="${FLAG_WIDTH}"`);
    expect(await loadFlagImage('fr')).toBe(image);
  });
});

describe('real flag set', () => {
  it('exposes the bundled country flags', () => {
    expect(hasFlag('fr')).toBe(true);
    expect(hasFlag('gb')).toBe(true);
    expect(hasFlag('xx')).toBe(false);
    expect(availableFlagCodes().length).toBeGreaterThan(200);
    expect(availableFlagCodes()).not.toContain('eu');
  });

  it('names flags with Intl.DisplayNames, sorted by name', () => {
    const options = getFlagOptions();
    expect(flagName('fr')).toBe('France');
    const names = options.map((o) => o.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(options.every((o) => o.name.toLowerCase() !== o.code)).toBe(true);
  });
});
