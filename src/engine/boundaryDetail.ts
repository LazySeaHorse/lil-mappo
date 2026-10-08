import { metersToDegrees, optimizeGeometry } from '@/engine/geoUtils';

export type BoundaryDetailId = 'detailed' | 'standard' | 'light';

export interface BoundaryDetailLevel {
  id: BoundaryDetailId;
  label: string;
  /** Douglas-Peucker tolerance in metres. */
  toleranceM: number;
  /** When to pick this level. */
  hint: string;
}

/** The detail levels offered when adding a boundary. All store 6 decimal places. */
export const BOUNDARY_DETAIL_LEVELS: readonly BoundaryDetailLevel[] = [
  { id: 'detailed', label: 'Detailed', toleranceM: 1, hint: 'Cities and neighbourhoods, close-up shots' },
  { id: 'standard', label: 'Standard', toleranceM: 10, hint: 'Most regions' },
  { id: 'light', label: 'Light', toleranceM: 50, hint: 'Countries and continents, wide shots' },
];

export const DEFAULT_BOUNDARY_DETAIL: BoundaryDetailId = 'standard';

export function getBoundaryDetailLevel(id: BoundaryDetailId): BoundaryDetailLevel {
  return BOUNDARY_DETAIL_LEVELS.find((l) => l.id === id) ?? BOUNDARY_DETAIL_LEVELS[1];
}

function simplifyAt(geometry: GeoJSON.Geometry, id: BoundaryDetailId): GeoJSON.Geometry {
  return optimizeGeometry(geometry, { toleranceM: getBoundaryDetailLevel(id).toleranceM, precision: 6 });
}

// Search results are immutable, so the (geometry, level) -> simplified result is cached by
// geometry identity. Switching levels or re-rendering never re-simplifies a country outline.
const cache = new WeakMap<object, Map<BoundaryDetailId, GeoJSON.Geometry>>();

/** Simplifies a raw boundary geometry to the given detail level (memoised). */
export function applyBoundaryDetail(geometry: GeoJSON.Geometry, id: BoundaryDetailId = DEFAULT_BOUNDARY_DETAIL): GeoJSON.Geometry {
  let perLevel = cache.get(geometry);
  if (!perLevel) {
    perLevel = new Map();
    cache.set(geometry, perLevel);
  }
  let out = perLevel.get(id);
  if (!out) {
    out = simplifyAt(geometry, id);
    perLevel.set(id, out);
  }
  return out;
}

// ---- Thumbnails ------------------------------------------------------------

/** Width / height of the sample shape in metres, sized so 1 / 10 / 50 m tolerances look clearly different at ~40px. */
export const SAMPLE_WIDTH_M = 240;
export const SAMPLE_HEIGHT_M = 140;

/** A wiggly coastline-like polyline in metres: broad bays down to ~3 m crinkles, 1 m vertex spacing. */
function buildSampleCoastline(): GeoJSON.LineString {
  const coords: number[][] = [];
  for (let x = 0; x <= SAMPLE_WIDTH_M; x++) {
    const t = x / SAMPLE_WIDTH_M;
    const y =
      SAMPLE_HEIGHT_M / 2 +
      40 * Math.sin(t * Math.PI * 2 + 0.6) +
      26 * Math.sin(t * Math.PI * 2 * 3.1 + 1.3) +
      14 * Math.sin(t * Math.PI * 2 * 8.3 + 2.1) +
      4 * Math.sin(t * Math.PI * 2 * 19 + 0.4) +
      2 * Math.sin(t * Math.PI * 2 * 47 + 1.7) +
      1 * Math.sin(t * Math.PI * 2 * 83 + 0.9);
    coords.push([metersToDegrees(x), metersToDegrees(y)]);
  }
  return { type: 'LineString', coordinates: coords };
}

const sampleCache = new Map<BoundaryDetailId, number[][]>();

/**
 * The sample coastline simplified with the real simplify function at a level's tolerance,
 * in metres (x right, y up). Used for the honest per-level thumbnails.
 */
export function boundaryDetailSample(id: BoundaryDetailId): number[][] {
  let pts = sampleCache.get(id);
  if (!pts) {
    const line = buildSampleCoastline();
    // Round at 6dp like real stored geometry; metres here are exact to ~0.1 m.
    const out = simplifyAt(line, id) as GeoJSON.LineString;
    pts = out.coordinates.map(([x, y]) => [x * 111_320, y * 111_320]);
    sampleCache.set(id, pts);
  }
  return pts;
}
