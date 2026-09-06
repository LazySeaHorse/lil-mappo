declare module '@tmcw/togeojson' {
  export function kml(doc: Document): GeoJSON.FeatureCollection;
  export function gpx(doc: Document): GeoJSON.FeatureCollection;
}

declare module '@turf/along' {
  import { Feature, Point, LineString } from '@turf/helpers';
  export default function along(line: Feature<LineString>, distance: number, options?: { units?: string }): Feature<Point>;
}

declare module '@turf/length' {
  import { Feature, LineString } from '@turf/helpers';
  export default function length(line: Feature<LineString>, options?: { units?: string }): number;
}

declare module '@turf/distance' {
  import { Feature, Point } from '@turf/helpers';
  export default function distance(from: Feature<Point>, to: Feature<Point>, options?: { units?: string }): number;
}
