import mapboxLogoUrl from './assets/mapbox-logo.svg?url';
import brandMarkUrl from './assets/logo-mark.svg?url';
import { OVERLAY_LAYOUT } from './layout';

export { mapboxLogoUrl, brandMarkUrl };

export interface OverlayImages {
  mapboxLogo: HTMLImageElement;
  brandMark: HTMLImageElement;
}

let images: OverlayImages | null = null;
let loading: Promise<void> | null = null;

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/**
 * Loads the overlay images and the wordmark font. Await before any capture so the
 * first frame is complete. Memoized; a failed load can be retried.
 */
export function preloadOverlayAssets(): Promise<void> {
  loading ??= (async () => {
    const { fontFamily, fontWeight, fontSize } = OVERLAY_LAYOUT.brand;
    const [mapboxLogo, brandMark] = await Promise.all([
      loadImage(mapboxLogoUrl),
      loadImage(brandMarkUrl),
      document.fonts.load(`${fontWeight} ${fontSize}px ${fontFamily}`, "li'l Mappo").catch(() => []),
    ]);
    images = { mapboxLogo, brandMark };
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** The loaded images, or null before `preloadOverlayAssets` has resolved. */
export function getOverlayImages(): OverlayImages | null {
  return images;
}
