import type { ReactNode } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useResponsive } from '@/hooks/useResponsive';
import { PANEL_MARGIN, belowToolbarTop, rightReserved } from '@/constants/layout';

/**
 * Places the pills under the top bar: stacked top to bottom in the order given,
 * centred on the width the inspector leaves free. Each pill decides when it
 * shows and renders nothing otherwise. Mount it in the floating UI layer, so
 * Hide UI fades the pills out with the rest of the chrome.
 */
export function MapStatusPills({ children }: { children: ReactNode }) {
  const isInspectorOpen = useProjectStore((s) => s.isInspectorOpen);
  const { isMobile, isTablet } = useResponsive();

  return (
    <div
      data-testid="map-status-pills"
      className="pointer-events-none absolute flex flex-col items-center gap-2 transition-[right] duration-300"
      style={{
        top: belowToolbarTop(isMobile),
        left: PANEL_MARGIN,
        right: rightReserved({ isInspectorOpen, isMobile, isTablet }),
      }}
    >
      {children}
    </div>
  );
}
