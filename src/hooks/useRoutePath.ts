import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { withoutHistory } from '@/store/history';
import { useEndpointRoutePath } from '@/hooks/useEndpointRoutePath';
import { useFrameOnMap } from '@/hooks/useFrameOnMap';
import type { EndpointRouteCalculation } from '@/store/types';

/** Lands a computed path on the route ('save') or shows it as the map preview. */
export function useRoutePath(routeId: string) {
  const { loading, calculate, cancel } = useEndpointRoutePath(routeId);
  const frame = useFrameOnMap();

  const calculateFor = (calc: EndpointRouteCalculation, target: 'save' | 'preview') =>
    calculate(calc.mode, calc.startPoint, calc.endPoint, (geojson) => {
      const { updateItem, setPreviewRoute } = useProjectStore.getState();
      if (target === 'save') {
        // Async result of an earlier request, not an edit of its own.
        withoutHistory(() => updateItem(routeId, { geojson }));
        setPreviewRoute(null);
        frame.frameGeometry(geojson);
        toast.success('Route updated.');
      } else {
        setPreviewRoute(geojson);
        frame.frameGeometry(geojson);
        toast.success('Route preview is ready.');
      }
    });

  return { loading, calculate: calculateFor, cancel };
}

export type RoutePath = ReturnType<typeof useRoutePath>;
