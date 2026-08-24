import type { BoundaryStyle, RouteItem } from '@/store/types';

export interface ResolvedRoutePaint {
  lineColor: string;
  glowColor: string;
  glowWidth: number;
  glowBlur: number;
}

/** Resolve persisted route styling without introducing mode-specific overrides. */
export function resolveRoutePaint(route: Pick<RouteItem, 'style'>): ResolvedRoutePaint {
  return {
    lineColor: route.style.color,
    glowColor: route.style.glowColor,
    glowWidth: route.style.glowWidth,
    glowBlur: route.style.glowWidth / 2,
  };
}

type BoundaryFillContract = Pick<BoundaryStyle, 'strokeColor'> &
  Partial<Pick<BoundaryStyle, 'fillColor'>>;

/** Legacy boundaries predate fillColor and intentionally inherit their stroke color. */
export function resolveBoundaryFillColor(style: BoundaryFillContract): string {
  return style.fillColor ?? style.strokeColor;
}
