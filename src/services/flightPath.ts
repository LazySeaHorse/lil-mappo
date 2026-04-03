import { greatCircle } from '@turf/great-circle';
import { point } from '@turf/helpers';

/**
 * Generates a 3D Great Circle arc between two points.
 * Applies a parabolic altitude curve based on distance.
 */
export function calculateFlightArc(
  start: [number, number],
  end: [number, number],
  peakHeight: number = 50000 // default 50km
): GeoJSON.LineString {
  // Generate Great Circle segment
  // Using 100 points for smoothness across all projections
  const line = greatCircle(point(start), point(end), { npoints: 100 });
  
  // Coordinates are [lng, lat] from Turf
  const coords = line.geometry.coordinates as [number, number][];
  
  // Apply altitude (Z)
  // Formula: z = peakHeight * sin(progress * PI)
  const coordsWithAlt = coords.map((c, i) => {
    const progress = i / (coords.length - 1);
    const altitude = peakHeight * Math.sin(progress * Math.PI);
    return [c[0], c[1], altitude] as [number, number, number];
  });

  return {
    type: 'LineString',
    coordinates: coordsWithAlt as any
  };
}
