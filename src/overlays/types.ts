/** Where the output is being shown: editor (no overlays), hide-UI mode, or a video/snapshot export. */
export type OverlayMode = 'editor' | 'present' | 'export';

/** 'free' = anything that is not an active Wanderer subscription (BYOK included). */
export type Branding = 'free' | 'paid';

export type OverlayAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface OverlayLayerBase {
  /** Stable key, unique within a resolved list. */
  id: string;
  anchor: OverlayAnchor;
}

/**
 * One overlay drawn over the map. Discriminated on `kind` so backends (canvas now,
 * DOM later) switch exhaustively. User-defined layers (text, image, ...) become
 * further members of this union.
 */
export type OverlayLayer =
  | (OverlayLayerBase & { kind: 'brand' })
  | (OverlayLayerBase & { kind: 'mapbox-logo' })
  | (OverlayLayerBase & { kind: 'attribution'; text: string });
