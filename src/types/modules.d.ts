declare module 'react-map-gl' {
  import * as React from 'react';
  import type { Map as MapboxMap } from 'mapbox-gl';

  export interface MapRef {
    getMap(): MapboxMap;
    getCenter(): { lng: number; lat: number };
    getZoom(): number;
  }

  export interface MapProps {
    ref?: React.Ref<MapRef>;
    mapboxAccessToken?: string;
    initialViewState?: {
      longitude?: number;
      latitude?: number;
      zoom?: number;
      pitch?: number;
      bearing?: number;
    };
    style?: React.CSSProperties;
    mapStyle?: string;
    onClick?: (e: any) => void;
    onLoad?: () => void;
    interactive?: boolean;
    projection?: any;
    children?: React.ReactNode;
    [key: string]: any;
  }

  export const Map: React.ForwardRefExoticComponent<MapProps & React.RefAttributes<MapRef>>;
  export default Map;

  export interface SourceProps {
    id: string;
    type: string;
    data?: any;
    url?: string;
    tileSize?: number;
    maxzoom?: number;
    children?: React.ReactNode;
    [key: string]: any;
  }
  export const Source: React.FC<SourceProps>;

  export interface LayerProps {
    id: string;
    type: string;
    source?: string;
    'source-layer'?: string;
    paint?: Record<string, any>;
    layout?: Record<string, any>;
    minzoom?: number;
    [key: string]: any;
  }
  export const Layer: React.FC<LayerProps>;

  export interface MarkerProps {
    longitude: number;
    latitude: number;
    anchor?: string;
    offset?: [number, number];
    children?: React.ReactNode;
    [key: string]: any;
  }
  export const Marker: React.FC<MarkerProps>;

  export function useMap(): { current?: MapRef };
}

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

declare module '@turf/simplify' {
  import { Feature, FeatureCollection } from '@turf/helpers';
  export default function simplify<T extends Feature | FeatureCollection>(geojson: T, options?: { tolerance?: number; highQuality?: boolean }): T;
}
