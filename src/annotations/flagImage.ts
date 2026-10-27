/**
 * Country flags as scene images. A style names a flag as `flag:<code>`
 * (flagSource); the renderer fetches the artwork through the same loaders the
 * boundary flag fill uses, so a flag costs nothing until a callout draws it.
 */

import { hasFlag, loadFlagSvg, withIntrinsicSize } from '@/components/MapViewport/runtime/flagImages';
import { registerImageScheme } from './scene/renderer';

const SCHEME = 'flag';

/** The image source for a country flag (lowercase ISO 3166-1 alpha-2 code). */
export function flagSource(code: string): string {
  return `${SCHEME}:${code}`;
}

/** Whether `code` names a flag the app has artwork for. */
export function isFlagCode(code: unknown): code is string {
  return typeof code === 'string' && hasFlag(code);
}

registerImageScheme(SCHEME, async (code) => {
  // Flag artwork has a viewBox but no size, which a browser cannot draw to a canvas.
  const svg = withIntrinsicSize(await loadFlagSvg(code));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
});
