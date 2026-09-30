import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { withoutHistory } from '@/store/history';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { isPlacedPoint } from '@/engine/routeMode';
import type { EndpointRouteCalculation } from '@/store/types';

/**
 * Computes car (directions API) and flight (great-circle arc) paths for one
 * route. Only the latest request can land: starting a new one or calling
 * cancel() discards any request still in flight.
 */
export function useEndpointRoutePath(routeId: string) {
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    seqRef.current++;
    setLoading(false);
  }, []);

  useEffect(() => cancel, [routeId, cancel]);

  const calculate = async (calc: EndpointRouteCalculation, target: 'save' | 'preview') => {
    if (!isPlacedPoint(calc.startPoint) || !isPlacedPoint(calc.endPoint)) {
      toast.error('Set start and end points.');
      return;
    }

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    const seq = ++seqRef.current;
    setLoading(true);

    try {
      const geometry: GeoJSON.Geometry = calc.mode === 'car'
        ? (await getDirections(calc.startPoint, calc.endPoint, abortController.signal)).geometry
        : calculateFlightArc(calc.startPoint, calc.endPoint);
      if (seq !== seqRef.current) return;

      const featureCollection: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry, properties: {} }],
      };
      const { updateItem, setPreviewRoute } = useProjectStore.getState();
      if (target === 'save') {
        // Async result of an earlier request, not an edit of its own.
        withoutHistory(() => updateItem(routeId, { geojson: featureCollection }));
        setPreviewRoute(null);
        toast.success('Route updated.');
      } else {
        setPreviewRoute(featureCollection);
        toast.success('Route preview is ready.');
      }
    } catch (err: unknown) {
      if (seq !== seqRef.current || (err instanceof Error && err.name === 'AbortError')) return;
      toast.error('Cannot calculate route.');
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };

  return { loading, calculate, cancel };
}
