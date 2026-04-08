import { useProjectStore } from '@/store/useProjectStore';
import type { MapStyleCapabilities } from '@/config/mapbox';

/**
 * Returns the dynamically detected capabilities (label groups) for the current map style.
 * Capabilities are detected when each style loads by scanning its actual layer IDs.
 */
export function useMapStyleCapabilities(): MapStyleCapabilities {
  return useProjectStore((s) => s.detectedCapabilities) ?? {
    labelGroups: [],
    landmarks3d: false,
    trees3d: false,
    facades3d: false,
    timeOfDayPreset: false,
    colorCustomization: false,
  };
}
