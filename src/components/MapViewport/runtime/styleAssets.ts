import type { Map as MapboxMap } from 'mapbox-gl';
import line32Svg from '@/assets/textures/vintage/line-32.svg?raw';
import texture64Svg from '@/assets/textures/vintage/texture-64.svg?raw';
import textureDkTan64Svg from '@/assets/textures/vintage/texture-dktan-64.svg?raw';
import textureLtTan64Svg from '@/assets/textures/vintage/texture-lttan-64.svg?raw';

export interface StyleAssetDef {
  svg: string;
  width: number;
  height: number;
}

export const KNOWN_STYLE_TEXTURES: Record<string, StyleAssetDef> = {
  'texture-64': { svg: texture64Svg, width: 64, height: 64 },
  texture_64: { svg: texture64Svg, width: 64, height: 64 },
  'texture-lttan-64': { svg: textureLtTan64Svg, width: 64, height: 64 },
  'texture-dktan-64': { svg: textureDkTan64Svg, width: 64, height: 64 },
  'line-32': { svg: line32Svg, width: 32, height: 32 },
  line_32: { svg: line32Svg, width: 32, height: 32 },
};

const rasterizedCache = new Map<string, ImageData>();

/**
 * Converts an SVG string into an ImageData instance by drawing onto an offscreen canvas.
 * In environments without HTML5 Canvas/DOM, resolves a fallback empty buffer.
 */
export function rasterizeSvgToImageData(
  svg: string,
  width: number,
  height: number,
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof Image === 'undefined' ||
      typeof document.createElement !== 'function' ||
      (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test')
    ) {
      const data = new Uint8ClampedArray(width * height * 4);
      resolve({ width, height, data } as ImageData);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) {
      const data = new Uint8ClampedArray(width * height * 4);
      resolve({ width, height, data } as ImageData);
      return;
    }

    const img = new Image();
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        resolve(imageData);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      reject(err);
    };

    img.src = dataUrl;
  });
}

/**
 * Returns rasterized image data for a known style asset, using a memory cache.
 */
export async function getRasterizedStyleAsset(id: string): Promise<ImageData | null> {
  const cached = rasterizedCache.get(id);
  if (cached) return cached;

  const def = KNOWN_STYLE_TEXTURES[id];
  if (!def) return null;

  const data = await rasterizeSvgToImageData(def.svg, def.width, def.height);
  rasterizedCache.set(id, data);
  return data;
}

/**
 * Pre-loads all known style assets into memory cache.
 */
export async function preloadStyleAssets(): Promise<void> {
  await Promise.all(
    Object.keys(KNOWN_STYLE_TEXTURES).map((id) => getRasterizedStyleAsset(id)),
  );
}

// Auto-trigger preload in browser environment so assets are ready synchronously for styleimagemissing
if (typeof window !== 'undefined') {
  void preloadStyleAssets();
}

/**
 * Synchronously adds a cached style asset to the Mapbox map if present in cache.
 * Returns true if added or already exists.
 */
export function addCachedStyleAsset(map: MapboxMap, id: string): boolean {
  if (map.hasImage(id)) return true;
  const cached = rasterizedCache.get(id);
  if (!cached) return false;
  try {
    map.addImage(id, cached);
    return true;
  } catch (err) {
    console.warn(`[map:style-assets] Failed to add image ${id}`, err);
    return false;
  }
}

/**
 * Handles a missing style image event, either synchronously from cache or asynchronously.
 */
export async function handleMissingStyleImage(map: MapboxMap, imageId: string): Promise<boolean> {
  if (addCachedStyleAsset(map, imageId)) return true;

  const data = await getRasterizedStyleAsset(imageId);
  if (!data) return false;

  if (!map.hasImage(imageId)) {
    try {
      map.addImage(imageId, data);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Ensures all known style assets are loaded and added to the map.
 */
export async function loadKnownStyleAssets(map: MapboxMap): Promise<void> {
  await preloadStyleAssets();
  for (const id of Object.keys(KNOWN_STYLE_TEXTURES)) {
    if (!map.hasImage(id)) {
      addCachedStyleAsset(map, id);
    }
  }
}
