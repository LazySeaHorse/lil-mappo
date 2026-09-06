import { greatCircle } from "@turf/great-circle";
import { point } from "@turf/helpers";
import { truncateCoordinates } from "@/engine/geoUtils";

/**
 * Generates a Great Circle arc between two points on the globe surface without Z elevation.
 */
export function calculateFlightArc(
  start: [number, number],
  end: [number, number],
  _peakHeight?: number
): GeoJSON.LineString | GeoJSON.MultiLineString {
  // Generate Great Circle segment
  // Using 100 points for smoothness across all projections
  const line = greatCircle(point(start), point(end), { npoints: 100 });

  return truncateCoordinates(line.geometry, 4);
}
