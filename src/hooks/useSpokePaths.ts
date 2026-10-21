import { useEffect, useMemo, useRef, useState } from 'react';
import { computeEndpointGeometry } from '@/services/endpointGeometry';
import { placedSpokes, spokeEndpoints, type Spoke, type SpokeSide } from '@/engine/hubSpoke';

export type SpokePath =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; geojson: GeoJSON.FeatureCollection };

interface SpokePathInput {
  mode: 'car' | 'flight';
  side: SpokeSide;
  hub: [number, number];
  hubName: string;
  spokes: Spoke[];
}

const keyOf = (mode: string, start: [number, number], end: [number, number]) => `${mode}|${start}|${end}`;

/**
 * The path of each placed spoke, computed the way a single endpoint route is (directions for a
 * car, an arc for a flight). Each path is computed once per pair of endpoints and kept, so the
 * live preview and the Create button share it. A spoke that cannot be routed comes back as an
 * error, and the others are not affected. Nothing runs while `enabled` is false.
 */
export function useSpokePaths({ mode, side, hub, hubName, spokes }: SpokePathInput, enabled: boolean) {
  const [results, setResults] = useState<Record<string, SpokePath>>({});
  const requested = useRef(new Set<string>());

  const jobs = useMemo(
    () => placedSpokes(spokes, hub).map((spoke) => {
      const e = spokeEndpoints(side, hub, hubName, spoke);
      return { spoke, key: keyOf(mode, e.start, e.end), start: e.start, end: e.end };
    }),
    [spokes, hub, hubName, side, mode],
  );

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    for (const job of jobs) {
      if (requested.current.has(job.key)) continue;
      requested.current.add(job.key);
      setResults((r) => ({ ...r, [job.key]: { status: 'loading' } }));
      void (async () => {
        try {
          const { geojson } = await computeEndpointGeometry(mode, job.start, job.end, controller.signal);
          if (!controller.signal.aborted) setResults((r) => ({ ...r, [job.key]: { status: 'ready', geojson } }));
        } catch {
          if (controller.signal.aborted) {
            requested.current.delete(job.key);
            return;
          }
          setResults((r) => ({ ...r, [job.key]: { status: 'error' } }));
        }
      })();
    }
    // Paths still in flight when the inputs change are dropped; the next run asks for them again.
    return () => controller.abort();
  }, [jobs, mode, enabled]);

  /** The state of each placed spoke, by spoke id. */
  const byId = useMemo(() => {
    const out: Record<string, SpokePath & { start: [number, number]; end: [number, number] }> = {};
    for (const job of jobs) out[job.spoke.id] = { ...(results[job.key] ?? { status: 'loading' as const }), start: job.start, end: job.end };
    return out;
  }, [jobs, results]);

  return byId;
}
