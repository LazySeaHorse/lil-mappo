import { truncateCoordinates } from "@/engine/geoUtils";

const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

/**
 * Generates a Great Circle arc between two points on the globe surface without Z elevation.
 * Uses Spherical Linear Interpolation (Slerp) with continuous unwrapped longitudes,
 * ensuring the route is a single, unbroken LineString across the antimeridian.
 */
export function calculateFlightArc(
  start: [number, number],
  end: [number, number],
  _peakHeight?: number,
  npoints: number = 100
): GeoJSON.LineString {
  const lon1 = start[0] * TO_RAD;
  const lat1 = start[1] * TO_RAD;

  // Shortest longitudinal delta across the globe (-180 to 180)
  const deltaLon = ((end[0] - start[0] + 540) % 360) - 180;
  const lon2 = (start[0] + deltaLon) * TO_RAD;
  const lat2 = end[1] * TO_RAD;

  // 3D Cartesian unit vectors on unit sphere
  const v1 = [Math.cos(lat1) * Math.cos(lon1), Math.cos(lat1) * Math.sin(lon1), Math.sin(lat1)];
  const v2 = [Math.cos(lat2) * Math.cos(lon2), Math.cos(lat2) * Math.sin(lon2), Math.sin(lat2)];

  const dot = Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  const coordinates: GeoJSON.Position[] = [];
  let prevLon = start[0];

  for (let i = 0; i < npoints; i++) {
    const t = npoints > 1 ? i / (npoints - 1) : 0;
    let v: number[];

    if (sinOmega === 0) {
      v = v1;
    } else {
      const s1 = Math.sin((1 - t) * omega) / sinOmega;
      const s2 = Math.sin(t * omega) / sinOmega;
      v = [s1 * v1[0] + s2 * v2[0], s1 * v1[1] + s2 * v2[1], s1 * v1[2] + s2 * v2[2]];
    }

    const lat = Math.asin(Math.max(-1, Math.min(1, v[2]))) * TO_DEG;
    let lon = Math.atan2(v[1], v[0]) * TO_DEG;

    // Maintain continuous unwrapped longitude relative to previous point
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    prevLon = lon;

    coordinates.push([lon, lat]);
  }

  const rawLine: GeoJSON.LineString = {
    type: "LineString",
    coordinates,
  };

  return truncateCoordinates(rawLine, 4);
}
