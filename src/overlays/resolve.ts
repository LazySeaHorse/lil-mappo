import type { Branding, OverlayLayer, OverlayMode } from './types';

export const ATTRIBUTION_TEXT = '© Mapbox © OpenStreetMap';

/**
 * The overlays the app itself requires for a mode. Mapbox's logo and attribution are
 * mandatory outside the editor (where the map's own controls show them); the li'l Mappo
 * mark is the free-tier brand.
 */
export function resolveSystemOverlays({ mode, branding }: { mode: OverlayMode; branding: Branding }): OverlayLayer[] {
  if (mode === 'editor') return [];
  const layers: OverlayLayer[] = [];
  if (branding === 'free') layers.push({ id: 'brand', kind: 'brand', anchor: 'top-left' });
  layers.push(
    { id: 'mapbox-logo', kind: 'mapbox-logo', anchor: 'bottom-left' },
    { id: 'attribution', kind: 'attribution', anchor: 'bottom-right', text: ATTRIBUTION_TEXT },
  );
  return layers;
}
