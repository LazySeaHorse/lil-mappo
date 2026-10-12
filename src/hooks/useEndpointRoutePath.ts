import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { computeEndpointGeometry } from '@/services/endpointGeometry';
import { isPlacedPoint } from '@/engine/routeMode';

export interface EndpointPathMessages {
  /** Toast when an endpoint is not set yet. */
  missingEndpoints: string;
  /** Toast when the path cannot be computed (e.g. no driving route). */
  failed: string;
}

const DEFAULT_MESSAGES: EndpointPathMessages = {
  missingEndpoints: 'Set start and end points.',
  failed: 'Cannot calculate route.',
};

/**
 * Computes car (directions API) and flight (great-circle arc) paths. Only the
 * latest request can land: starting a new one, calling cancel(), changing
 * `resetKey` or unmounting discards any request still in flight.
 */
export function useEndpointRoutePath(resetKey?: string, messages: EndpointPathMessages = DEFAULT_MESSAGES) {
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  useEffect(() => cancel, [resetKey, cancel]);

  /**
   * Calls `onReady` with the path unless the request is superseded or
   * cancelled. A flight's path is ready synchronously.
   */
  const calculate = async (
    mode: 'car' | 'flight',
    start: [number, number],
    end: [number, number],
    onReady: (geojson: GeoJSON.FeatureCollection) => void,
  ) => {
    if (!isPlacedPoint(start) || !isPlacedPoint(end)) {
      toast.error(messages.missingEndpoints);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const pending = computeEndpointGeometry(mode, start, end, controller.signal);
      const { geojson } = pending instanceof Promise ? await pending : pending;
      if (!controller.signal.aborted) onReady(geojson);
    } catch (err: unknown) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      toast.error(messages.failed);
    } finally {
      // Whoever aborted this request (cancel or a newer request) owns `loading` now.
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return { loading, calculate, cancel };
}
