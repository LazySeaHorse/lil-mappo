import distance from '@turf/distance';
import { point } from '@turf/helpers';

/**
 * Extracts all rings (exterior and interior) from a Polygon or MultiPolygon
 * as an array of LineString-compatible coordinate arrays.
 */
export function extractLineStringsFromGeometry(geometry: GeoJSON.Geometry): number[][][] {
  const lineStrings: number[][][] = [];

  if (geometry.type === 'Polygon') {
    // A Polygon is an array of LinearRings (exterior, then holes)
    for (const ring of geometry.coordinates) {
      lineStrings.push(ring);
    }
  } else if (geometry.type === 'MultiPolygon') {
    // A MultiPolygon is an array of Polygons
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        lineStrings.push(ring);
      }
    }
  } else if (geometry.type === 'LineString') {
    lineStrings.push(geometry.coordinates);
  } else if (geometry.type === 'MultiLineString') {
    for (const line of geometry.coordinates) {
      lineStrings.push(line);
    }
  }

  return lineStrings;
}

/**
 * Calculates the bearing between two points in degrees.
 */
export function calculateBearing(start: number[], end: number[]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const toDeg = (v: number) => (v * 180) / Math.PI;

  const φ1 = toRad(start[1]);
  const φ2 = toRad(end[1]);
  const Δλ = toRad(end[0] - start[0]);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return (toDeg(θ) + 360) % 360;
}

/**
 * Calculates the pitch (tilt) between two 3D points in degrees.
 */
export function calculatePitch(start: number[], end: number[]): number {
  if (start[2] === undefined || end[2] === undefined) return 0;

  const d = distance(point(start.slice(0, 2)), point(end.slice(0, 2)), { units: 'meters' });
  const dz = end[2] - start[2];

  if (d === 0) return dz > 0 ? 90 : dz < 0 ? -90 : 0;

  return (Math.atan2(dz, d) * 180) / Math.PI;
}
