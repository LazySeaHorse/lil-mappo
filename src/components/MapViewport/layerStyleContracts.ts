import type { RouteItem } from '@/store/types';

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

