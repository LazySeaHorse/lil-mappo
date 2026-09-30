/**
 * Migration from v1 CalloutItem (flat variant-based) to v2 CalloutItem (annotation-based).
 *
 * Preserves: id, title, subtitle, lngLat, altitude, startTime, endTime,
 *            animation timing, pole/connector config, linkTitleToLocation
 * Maps:      variant → styleId, animation names → transition names,
 *            style-specific fields → settings
 */

import type { CalloutItem } from '@/store/types';

/** The shape of v1 CalloutItem as it was persisted. */
interface LegacyCalloutItem {
  kind: 'callout';
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  lngLat: [number, number];
  anchor: 'bottom' | 'top' | 'left' | 'right';
  startTime: number;
  endTime: number;
  animation: {
    enter: 'fadeIn' | 'scaleUp' | 'slideUp';
    exit: 'fadeOut' | 'scaleDown' | 'slideDown';
    enterDuration: number;
    exitDuration: number;
  };
  style: {
    bgColor: string;
    textColor: string;
    accentColor: string;
    borderRadius: number;
    shadow: boolean;
    maxWidth: number;
    fontFamily: string;
    variant: 'default' | 'modern' | 'news' | 'topo';
    showMetadata: boolean;
  };
  linkTitleToLocation: boolean;
  altitude: number;
  poleVisible: boolean;
  poleColor: string;
}

// ─── Variant → Style ID ──────────────────────────────────────────────────────

const VARIANT_TO_STYLE: Record<string, string> = {
  default: 'standard-card',
  modern: 'modern-pill',
  news: 'news-slug',
  topo: 'topo-label',
};

// ─── Animation name mapping ──────────────────────────────────────────────────

const ENTER_NAME_MAP: Record<string, string> = {
  fadeIn: 'fade',
  scaleUp: 'scale-up',
  slideUp: 'slide-up',
};

const EXIT_NAME_MAP: Record<string, string> = {
  fadeOut: 'fade',
  scaleDown: 'scale-down',
  slideDown: 'slide-down',
};

// ─── Settings migration ──────────────────────────────────────────────────────

function migrateStyleSettings(legacy: LegacyCalloutItem): Record<string, unknown> {
  const style = legacy.style || ({} as Partial<LegacyCalloutItem['style']>);
  const base: Record<string, unknown> = {
    fontFamily: style.fontFamily,
    textColor: style.textColor,
  };

  switch (style.variant) {
    case 'modern':
      return {
        ...base,
        bgColor: style.bgColor,
        accentColor: style.accentColor,
        shadow: style.shadow,
      };

    case 'news':
      return {
        ...base,
        bgColor: style.bgColor,
        accentColor: style.accentColor,
        shadow: style.shadow,
      };

    case 'topo':
      return {
        ...base,
        accentColor: style.accentColor,
        showMetadata: style.showMetadata,
      };

    case 'default':
    default:
      return {
        ...base,
        bgColor: style.bgColor,
        borderRadius: style.borderRadius,
        shadow: style.shadow,
        maxWidth: style.maxWidth,
      };
  }
}

// ─── Main migration ──────────────────────────────────────────────────────────

/** Zoom the editor opens at when a project has no camera keyframes. */
export const DEFAULT_VIEW_ZOOM = 12;
/** Screen-space cap the v1 renderer applied to the pole height. */
const LEGACY_MAX_ALTITUDE_PX = 300;

/**
 * Converts a v1 altitude to v2 screen pixels.
 *
 * v1 stored metres and drew the pole at metres / metres-per-pixel for the
 * current zoom, capped at 300px, so its on-screen height changed with zoom.
 * v2 stores a fixed pixel height. Converting at the zoom the callout was
 * viewed at reproduces the height it had on screen.
 */
export function legacyAltitudeToPixels(altitudeMeters: unknown, latitude: number, zoom: number): number {
  if (typeof altitudeMeters !== 'number' || !Number.isFinite(altitudeMeters) || altitudeMeters <= 0) return 0;
  const metersPerPixel = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
  if (!(metersPerPixel > 0)) return 0;
  return Math.round(Math.min(altitudeMeters / metersPerPixel, LEGACY_MAX_ALTITUDE_PX));
}

interface LegacyKeyframe {
  time: number;
  camera: { zoom: number };
}

/**
 * Camera zoom at a time, interpolated linearly between keyframes.
 * Returns undefined when there are no usable keyframes.
 */
export function cameraZoomAt(keyframes: unknown, time: number): number | undefined {
  if (!Array.isArray(keyframes)) return undefined;
  const usable = (keyframes as LegacyKeyframe[])
    .filter((kf) => Number.isFinite(kf?.time) && Number.isFinite(kf?.camera?.zoom))
    .sort((a, b) => a.time - b.time);
  if (usable.length === 0) return undefined;
  if (time <= usable[0].time) return usable[0].camera.zoom;
  for (let i = 1; i < usable.length; i++) {
    const a = usable[i - 1];
    const b = usable[i];
    if (time <= b.time) {
      const t = b.time > a.time ? (time - a.time) / (b.time - a.time) : 1;
      return a.camera.zoom + (b.camera.zoom - a.camera.zoom) * t;
    }
  }
  return usable[usable.length - 1].camera.zoom;
}

/**
 * Migrate a v1 CalloutItem to the new annotation-based shape.
 * This is called during project document migration (v1 → v2).
 *
 * @param viewZoom Map zoom the callout was viewed at, used to convert its
 *   altitude from metres to screen pixels (see legacyAltitudeToPixels).
 */
export function migrateCalloutV1ToV2(legacy: unknown, viewZoom = DEFAULT_VIEW_ZOOM): CalloutItem {
  const old = legacy as LegacyCalloutItem;

  return {
    kind: 'callout',
    id: old.id,
    styleId: VARIANT_TO_STYLE[old.style?.variant] || 'standard-card',
    styleVersion: 1,
    content: {
      title: old.title || 'Untitled',
      subtitle: old.subtitle || undefined,
    },
    binding: {
      kind: 'geographic',
      lngLat: old.lngLat || [0, 0],
      altitude: legacyAltitudeToPixels(old.altitude, old.lngLat?.[1] ?? 0, viewZoom),
    },
    offset: [0, 0],
    anchor: 'bottom',
    startTime: old.startTime ?? 0,
    endTime: old.endTime ?? 5,
    transition: {
      enter: ENTER_NAME_MAP[old.animation?.enter] || 'fade',
      exit: EXIT_NAME_MAP[old.animation?.exit] || 'fade',
      enterDuration: old.animation?.enterDuration ?? 0.4,
      exitDuration: old.animation?.exitDuration ?? 0.3,
    },
    connector: {
      visible: old.poleVisible ?? true,
      style: 'dashed',
      color: old.poleColor || '#94a3b8',
      width: 2,
      endDot: true,
      endDotRadius: 3,
    },
    opacity: 1,
    scale: 1,
    sizeMode: 'screen',
    referenceZoom: viewZoom,
    settings: migrateStyleSettings(old),
    linkTitleToLocation: old.linkTitleToLocation ?? false,
  };
}

/**
 * Detect whether a callout item is in the v1 (legacy) format.
 * v1 items have `style.variant` and `animation.enter` as old-format strings.
 * v2 items have `styleId` and `transition`.
 */
export function isLegacyCallout(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;
  return obj.kind === 'callout' && !('styleId' in obj) && 'style' in obj;
}
