/**
 * Utility functions for Geospatial operations specific to li'l Mappo
 */

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
