import * as toGeoJSON from '@tmcw/togeojson';

export function parseKML(text: string): GeoJSON.FeatureCollection {
  const dom = new DOMParser().parseFromString(text, 'text/xml');
  return toGeoJSON.kml(dom) as GeoJSON.FeatureCollection;
}

export function parseGPX(text: string): GeoJSON.FeatureCollection {
  const dom = new DOMParser().parseFromString(text, 'text/xml');
  return toGeoJSON.gpx(dom) as GeoJSON.FeatureCollection;
}

export function importRouteFile(file: File): Promise<{ name: string; geojson: GeoJSON.FeatureCollection }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const ext = file.name.split('.').pop()?.toLowerCase();
        const geojson = ext === 'kml' ? parseKML(text) : parseGPX(text);
        resolve({ name: file.name.replace(/\.(kml|gpx)$/i, ''), geojson });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
