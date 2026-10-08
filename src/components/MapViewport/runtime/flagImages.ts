/**
 * Country flag artwork from the `flag-icons` package, rasterised on demand.
 *
 * The SVGs are only ever loaded through lazy `import.meta.glob` loaders, so none of the
 * artwork lands in the initial bundle. The flags have a viewBox but no width/height, which
 * browsers can't rasterise to a canvas, so a size is injected before decoding.
 */

export const FLAG_WIDTH = 1280;
export const FLAG_HEIGHT = 960;
/** The flags' native aspect ratio (4:3). */
export const FLAG_ASPECT = 4 / 3;

export type FlagImage = CanvasImageSource & { width: number; height: number };

const flagModules = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

/** Two-letter codes in the package that are not countries (EU, UN, the XX placeholder). */
const NON_COUNTRY_CODES = new Set(['eu', 'un', 'xx']);

function codeFromPath(path: string): string | null {
  const match = /\/([a-z]{2})\.svg$/.exec(path);
  return match && !NON_COUNTRY_CODES.has(match[1]) ? match[1] : null;
}

/** Adds an intrinsic size to the root <svg> so it can be drawn to a canvas. */
export function withIntrinsicSize(svg: string, width = FLAG_WIDTH, height = FLAG_HEIGHT): string {
  return svg.replace(/<svg\b([^>]*)>/, (_whole, attrs: string) => {
    const rest = attrs.replace(/\s(?:width|height)="[^"]*"/g, '');
    return `<svg${rest} width="${width}" height="${height}">`;
  });
}

async function rasterizeSvg(svgText: string): Promise<FlagImage> {
  const url = URL.createObjectURL(new Blob([withIntrinsicSize(svgText)], { type: 'image/svg+xml' }));
  try {
    const img = new Image(FLAG_WIDTH, FLAG_HEIGHT);
    img.src = url;
    await img.decode();
    const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(FLAG_WIDTH, FLAG_HEIGHT)
      : Object.assign(document.createElement('canvas'), { width: FLAG_WIDTH, height: FLAG_HEIGHT });
    (canvas.getContext('2d') as CanvasRenderingContext2D).drawImage(img, 0, 0, FLAG_WIDTH, FLAG_HEIGHT);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface FlagImageDeps {
  /** Lazy loaders keyed by file path (`.../<code>.svg`). */
  loaders: Record<string, () => Promise<string>>;
  rasterize: (svgText: string) => Promise<FlagImage>;
}

export function createFlagImages({ loaders, rasterize }: FlagImageDeps) {
  const byCode = new Map<string, () => Promise<string>>();
  for (const [path, loader] of Object.entries(loaders)) {
    const code = codeFromPath(path);
    if (code) byCode.set(code, loader);
  }
  const cache = new Map<string, Promise<FlagImage>>();
  const codes = [...byCode.keys()].sort();

  return {
    availableFlagCodes: (): readonly string[] => codes,
    hasFlag: (code: string | null | undefined): code is string => Boolean(code) && byCode.has(code as string),
    /** Decoded flag, cached per code. A failed load is not cached so it can be retried. */
    loadFlagImage(code: string): Promise<FlagImage> {
      const cached = cache.get(code);
      if (cached) return cached;
      const loader = byCode.get(code);
      if (!loader) return Promise.reject(new Error(`No flag for "${code}"`));
      const promise = loader().then(rasterize);
      cache.set(code, promise);
      promise.catch(() => cache.delete(code));
      return promise;
    },
  };
}

const flags = createFlagImages({ loaders: flagModules, rasterize: rasterizeSvg });

export const loadFlagImage = flags.loadFlagImage;
export const hasFlag = flags.hasFlag;
export const availableFlagCodes = flags.availableFlagCodes;

export interface FlagOption {
  code: string;
  name: string;
}

let optionsCache: FlagOption[] | null = null;

/** Country flags with English names, sorted by name. Codes Intl cannot name are dropped. */
export function getFlagOptions(): FlagOption[] {
  if (optionsCache) return optionsCache;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    names = null;
  }
  const options: FlagOption[] = [];
  for (const code of availableFlagCodes()) {
    let name: string | undefined;
    try {
      name = names?.of(code.toUpperCase());
    } catch {
      name = undefined;
    }
    if (!name || name.toUpperCase() === code.toUpperCase()) continue;
    options.push({ code, name });
  }
  optionsCache = options.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return optionsCache;
}

export function flagName(code: string | null | undefined): string | null {
  return getFlagOptions().find((option) => option.code === code)?.name ?? null;
}
