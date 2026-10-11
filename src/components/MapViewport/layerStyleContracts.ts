import type { BoundaryStyle, RouteItem } from '@/store/types';

export interface ResolvedRoutePaint {
  lineColor: string;
  glowWidth: number;
  glowBlur: number;
}

/** Resolve persisted route styling without introducing mode-specific overrides. */
export function resolveRoutePaint(route: Pick<RouteItem, 'style'>): ResolvedRoutePaint {
  return {
    lineColor: route.style.color,
    glowWidth: route.style.glowWidth,
    glowBlur: route.style.glowWidth / 2,
  };
}

/**
 * The boundary fill colour. Always set: boundaries saved before fillColor existed are given
 * their stroke colour when the document is migrated (projectDocument v0 -> v1).
 */
export function resolveBoundaryFillColor(style: Pick<BoundaryStyle, 'fillColor'>): string {
  return style.fillColor;
}
