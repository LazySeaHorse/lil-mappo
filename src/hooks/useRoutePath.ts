import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { useEndpointRoutePath } from '@/hooks/useEndpointRoutePath';
import { useFrameOnMap } from '@/hooks/useFrameOnMap';
import { ROUTE_PATH_TERMS } from '@/lib/terms';
import type { EndpointRouteCalculation } from '@/store/types';

/** Computes the path of a car or flight route, for a map preview or for the caller to save. */
export function useRoutePath(routeId: string) {
  const { loading, calculate, cancel } = useEndpointRoutePath(routeId);
  const frame = useFrameOnMap();

  /** Shows the path on the map as a preview. The route does not change. */
  const preview = (calc: EndpointRouteCalculation) =>
    calculate(calc.mode, calc.startPoint, calc.endPoint, (geojson) => {
      useProjectStore.getState().setPreviewRoute(geojson);
      frame.frameGeometry(geojson);
      toast.success(ROUTE_PATH_TERMS.previewReady);
    });

  /** Calls `onReady` with the path, unless a newer request or a cancel replaced this one. */
  const compute = (calc: EndpointRouteCalculation, onReady: (geojson: GeoJSON.FeatureCollection) => void) =>
    calculate(calc.mode, calc.startPoint, calc.endPoint, onReady);

  return { loading, preview, compute, cancel };
}

export type RoutePath = ReturnType<typeof useRoutePath>;
