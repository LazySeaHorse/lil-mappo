import { useState, useEffect } from 'react';
import { MOBILE_QUERY, TABLET_QUERY } from '@/constants/layout';

/**
 * Custom hook to handle responsive breakpoints.
 * Returns booleans for different screen sizes.
 */
export function useResponsive() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [isLayersCollapsed, setIsLayersCollapsed] = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');

  useEffect(() => {
    const mobileQuery = window.matchMedia(MOBILE_QUERY);
    const tabletQuery = window.matchMedia(TABLET_QUERY);
    const desktopQuery = window.matchMedia('(min-width: 1025px)');
    // Toolbar-only breakpoints: the bar has no room for every control at these widths.
    const toolbarQuery = window.matchMedia('(max-width: 815px)');
    const layersQuery = window.matchMedia('(max-width: 1081px)');

    const update = () => {
      setIsMobile(mobileQuery.matches);
      setIsTablet(tabletQuery.matches);
      setIsDesktop(desktopQuery.matches);
      setIsToolbarCollapsed(toolbarQuery.matches);
      setIsLayersCollapsed(layersQuery.matches);
      setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
    };

    update();

    mobileQuery.addEventListener('change', update);
    tabletQuery.addEventListener('change', update);
    desktopQuery.addEventListener('change', update);
    toolbarQuery.addEventListener('change', update);
    layersQuery.addEventListener('change', update);
    window.addEventListener('resize', update);

    return () => {
      mobileQuery.removeEventListener('change', update);
      tabletQuery.removeEventListener('change', update);
      desktopQuery.removeEventListener('change', update);
      toolbarQuery.removeEventListener('change', update);
      layersQuery.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return { isMobile, isTablet, isDesktop, isToolbarCollapsed, isLayersCollapsed, orientation };
}
