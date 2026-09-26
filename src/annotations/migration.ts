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

/**
 * Migrate a v1 CalloutItem to the new annotation-based shape.
 * This is called during project document migration (v1 → v2).
 */
export function migrateCalloutV1ToV2(legacy: unknown): CalloutItem {
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
      altitude: typeof old.altitude === 'number'
        ? (old.altitude > 150 ? 40 : Math.max(0, old.altitude))
        : 0,
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
