import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  LayoutSpecification,
  Map as MapboxMap,
  PaintSpecification,
} from 'mapbox-gl';
import { getNormalizedProgress } from '@/engine/easings';
import { calculateBearing, calculatePitch } from '@/engine/geoUtils';
import { getAnimatedLine, getLineSegment } from '@/engine/lineAnimation';
import type { RouteItem, RouteVehicleConfig } from '@/store/types';
import { resolveRoutePaint } from '../layerStyleContracts';
import {
  getGeoJSONSource,
  mutateMap,
  removeLayerIfPresent,
  removeSourceIfPresent,
} from './mapboxResources';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const EXIT_DURATION = 0.5;
const DOT_BASE_RADIUS = 9;
const MODELS: Record<'car' | 'plane', string> = {
  car: '/models/car.glb',
  plane: '/models/airplane.glb',
};

interface RouteResourceIds {
  mainSource: string;
  mainLayer: string;
  glowSource: string;
  glowLayer: string;
  cometSource: string;
  cometLayer: string;
  vehicleSource: string;
  vehicleLayer: string;
}

interface PaintCache {
  mainColor: string;
  mainWidth: number;
  mainOpacity: number;
  mainVisible: boolean;
  glowColor: string;
  glowWidth: number;
  glowOpacity: number;
  glowVisible: boolean;
  cometColor: string;
  cometWidth: number;
  lastAnimationType: string;
  vehicleVisible: boolean;
  vehicleOpacity: number;
  dashPattern: number[] | null;
}

function createIds(routeId: string): RouteResourceIds {
  return {
    mainSource: `route-${routeId}`,
    mainLayer: `route-layer-${routeId}`,
    glowSource: `route-glow-${routeId}`,
    glowLayer: `route-glow-layer-${routeId}`,
    cometSource: `route-comet-${routeId}`,
    cometLayer: `route-comet-layer-${routeId}`,
    vehicleSource: `vehicle-source-${routeId}`,
    vehicleLayer: `vehicle-layer-${routeId}`,
  };
}

function createPaintCache(): PaintCache {
  return {
    mainColor: '', mainWidth: -1, mainOpacity: -1, mainVisible: true,
    glowColor: '', glowWidth: -1, glowOpacity: -1, glowVisible: false,
    cometColor: '', cometWidth: -1,
    lastAnimationType: '',
    vehicleVisible: true, vehicleOpacity: -1,
    dashPattern: null,
  };
}

function coordsToFeatureCollection(coords: number[][]): GeoJSON.FeatureCollection {
  if (coords.length < 2) return EMPTY_FC;
  const segments: number[][][] = [];
  let currentSegment: number[][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    if (Math.abs(coords[i][0] - coords[i - 1][0]) > 180) {
      if (currentSegment.length >= 2) {
        segments.push(currentSegment);
      }
      currentSegment = [];
    }
    currentSegment.push(coords[i]);
  }
  if (currentSegment.length >= 2) {
    segments.push(currentSegment);
  }

  if (segments.length === 0) {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }],
    };
  }

  const geometry: GeoJSON.Geometry = segments.length > 1
    ? { type: 'MultiLineString', coordinates: segments }
    : { type: 'LineString', coordinates: segments[0] };

  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry }],
  };
}

function extractCoordinates(route: RouteItem): number[][] {
  const coordinates: number[][] = [];
  for (const feature of route.geojson.features) {
    if (feature.geometry.type === 'LineString') {
      coordinates.push(...feature.geometry.coordinates);
    } else if (feature.geometry.type === 'MultiLineString') {
      for (const line of feature.geometry.coordinates) coordinates.push(...line);
    }
  }
  return coordinates;
}

function geoJSONSource(lineMetrics = false): GeoJSONSourceSpecification {
  return { type: 'geojson', data: EMPTY_FC, ...(lineMetrics ? { lineMetrics: true } : {}) };
}

function gradient(color: string): ExpressionSpecification {
  return ['interpolate', ['linear'], ['line-progress'], 0, 'transparent', 1, color];
}

export class RouteRenderer {
  private route: RouteItem;
  private coordinates: number[][];
  private readonly ids: RouteResourceIds;
  private paint = createPaintCache();
  private lastGeometryState = '';
  private lastGlowState = '';
  private disposed = false;

  constructor(private readonly map: MapboxMap, route: RouteItem) {
    this.route = route;
    this.coordinates = extractCoordinates(route);
    this.ids = createIds(route.id);
  }

  mount(): void {
    this.disposed = false;
    this.paint = createPaintCache();
    this.lastGeometryState = '';
    this.lastGlowState = '';
    this.ensureRouteResources();
    this.ensureVehicleResources();
    this.uploadGeometry();
  }

  setRoute(route: RouteItem): void {
    if (route.id !== this.route.id) throw new Error('RouteRenderer cannot change route ids');
    const geometryChanged = route.geojson !== this.route.geojson;
    const vehicleChanged = route.calculation?.vehicle !== this.route.calculation?.vehicle;
    this.route = route;
    if (geometryChanged) {
      this.coordinates = extractCoordinates(route);
      this.lastGeometryState = '';
      this.lastGlowState = '';
      this.uploadGeometry();
    }
    if (vehicleChanged) this.ensureVehicleResources();
  }

  render = (playheadTime: number): void => {
    if (this.disposed) return;
    const route = this.route;
    const coordinates = this.coordinates;
    const mainSource = getGeoJSONSource(this.map, this.ids.mainSource);
    if (!mainSource || coordinates.length < 2) return;

    const resolvedPaint = resolveRoutePaint(route);
    const routeColor = resolvedPaint.lineColor;
    const progress = getNormalizedProgress(playheadTime, route.startTime, route.endTime, route.easing);
    const animationType = route.style.animationType ?? 'draw';

    if (this.paint.lastAnimationType === 'comet' && animationType !== 'comet') {
      getGeoJSONSource(this.map, this.ids.cometSource)?.setData(EMPTY_FC);
    }
    this.paint.lastAnimationType = animationType;

    const isBeforeStart = playheadTime < route.startTime;
    const exitActive = route.exitAnimation !== 'none' && playheadTime > route.endTime;
    const exitProgress = exitActive ? Math.min((playheadTime - route.endTime) / EXIT_DURATION, 1) : 0;
    const isAfterExit = exitProgress >= 1;

    if (animationType === 'comet') {
      this.setLayout(this.ids.mainLayer, 'visibility', 'none', 'mainVisible', false);
      this.setLayout(this.ids.glowLayer, 'visibility', 'none', 'glowVisible', false);
      if (isBeforeStart || isAfterExit) {
        if (this.lastGeometryState !== 'comet:empty') {
          getGeoJSONSource(this.map, this.ids.cometSource)?.setData(EMPTY_FC);
          this.lastGeometryState = 'comet:empty';
        }
      } else {
        const state = `comet:${progress}`;
        if (this.lastGeometryState !== state) {
          const trailLength = route.style.cometTrailLength ?? 0.2;
          const trail = getLineSegment(coordinates, Math.max(0, progress - trailLength), progress);
          getGeoJSONSource(this.map, this.ids.cometSource)?.setData(coordsToFeatureCollection(trail));
          this.lastGeometryState = state;
        }
        this.setPaint(this.ids.cometLayer, 'line-gradient', gradient(routeColor), 'cometColor', routeColor);
        this.setPaint(this.ids.cometLayer, 'line-width', route.style.width, 'cometWidth', route.style.width);
      }
    } else {
      if (isBeforeStart || isAfterExit) {
        this.setLayout(this.ids.mainLayer, 'visibility', 'none', 'mainVisible', false);
        this.setLayout(this.ids.glowLayer, 'visibility', 'none', 'glowVisible', false);
        if (this.lastGeometryState !== 'empty') {
          mainSource.setData(EMPTY_FC);
          getGeoJSONSource(this.map, this.ids.glowSource)?.setData(EMPTY_FC);
          this.lastGeometryState = 'empty';
          this.lastGlowState = 'empty';
        }
      } else {
        this.setLayout(this.ids.mainLayer, 'visibility', 'visible', 'mainVisible', true);
        const glowVisible = Boolean(route.style.glow);
        this.setLayout(this.ids.glowLayer, 'visibility', glowVisible ? 'visible' : 'none', 'glowVisible', glowVisible);

        const opacity = this.resolveOpacity(playheadTime);
        this.setPaint(this.ids.mainLayer, 'line-color', routeColor, 'mainColor', routeColor);
        this.setPaint(this.ids.mainLayer, 'line-opacity', opacity, 'mainOpacity', opacity);
        this.setPaint(this.ids.mainLayer, 'line-width', route.style.width, 'mainWidth', route.style.width);
        this.updateDashPattern();

        if (glowVisible) {
          const glowOpacity = 0.35 * opacity;
          this.setPaint(this.ids.glowLayer, 'line-color', resolvedPaint.glowColor, 'glowColor', resolvedPaint.glowColor);
          this.setPaint(this.ids.glowLayer, 'line-opacity', glowOpacity, 'glowOpacity', glowOpacity);
          if (this.paint.glowWidth !== resolvedPaint.glowWidth) {
            if (this.mutate('setPaintProperty:glow-size', this.ids.glowLayer, () => {
              this.map.setPaintProperty(this.ids.glowLayer, 'line-width', resolvedPaint.glowWidth);
              this.map.setPaintProperty(this.ids.glowLayer, 'line-blur', resolvedPaint.glowBlur);
            })) this.paint.glowWidth = resolvedPaint.glowWidth;
          }
        }

        let state: string;
        let getGeoData: () => GeoJSON.FeatureCollection;

        if (animationType === 'navigation') {
          state = `nav:${progress}`;
          getGeoData = () => {
            const activeCoords = getLineSegment(coordinates, progress, 1);
            return coordsToFeatureCollection(activeCoords);
          };
        } else if (exitActive && route.exitAnimation === 'reverse') {
          state = `rev:${exitProgress}`;
          getGeoData = () => {
            const activeCoords = getLineSegment(coordinates, exitProgress, 1);
            return coordsToFeatureCollection(activeCoords);
          };
        } else if (progress >= 1) {
          state = 'full';
          getGeoData = () => route.geojson;
        } else {
          state = `draw:${progress}`;
          getGeoData = () => {
            const activeCoords = getAnimatedLine(coordinates, progress);
            return coordsToFeatureCollection(activeCoords);
          };
        }

        if (this.lastGeometryState !== state) {
          const geoData = getGeoData();
          mainSource.setData(geoData);
          this.lastGeometryState = state;
          if (glowVisible) {
            getGeoJSONSource(this.map, this.ids.glowSource)?.setData(geoData);
            this.lastGlowState = state;
          }
        } else if (glowVisible && this.lastGlowState !== state) {
          getGeoJSONSource(this.map, this.ids.glowSource)?.setData(getGeoData());
          this.lastGlowState = state;
        }
      }
    }

    this.renderVehicle(playheadTime, progress);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    [this.ids.vehicleLayer, this.ids.glowLayer, this.ids.cometLayer, this.ids.mainLayer]
      .forEach((id) => removeLayerIfPresent(this.map, id));
    [this.ids.vehicleSource, this.ids.glowSource, this.ids.cometSource, this.ids.mainSource]
      .forEach((id) => removeSourceIfPresent(this.map, id));
  }

  private ensureRouteResources(): void {
    if (!this.map.getSource(this.ids.mainSource)) this.map.addSource(this.ids.mainSource, geoJSONSource(true));
    if (!this.map.getSource(this.ids.glowSource)) this.map.addSource(this.ids.glowSource, geoJSONSource(true));
    if (!this.map.getSource(this.ids.cometSource)) this.map.addSource(this.ids.cometSource, geoJSONSource(true));

    const resolvedPaint = resolveRoutePaint(this.route);
    if (!this.map.getLayer(this.ids.mainLayer)) {
      this.map.addLayer({
        id: this.ids.mainLayer,
        type: 'line',
        source: this.ids.mainSource,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': resolvedPaint.lineColor,
          'line-width': this.route.style.width,
          'line-opacity': 1,
        },
      });
    }
    if (!this.map.getLayer(this.ids.glowLayer)) {
      this.map.addLayer({
        id: this.ids.glowLayer,
        type: 'line',
        source: this.ids.glowSource,
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
        paint: {
          'line-color': resolvedPaint.glowColor,
          'line-width': resolvedPaint.glowWidth,
          'line-opacity': 0.35,
          'line-blur': resolvedPaint.glowBlur,
        },
      }, this.ids.mainLayer);
    }
    if (!this.map.getLayer(this.ids.cometLayer)) {
      this.map.addLayer({
        id: this.ids.cometLayer,
        type: 'line',
        source: this.ids.cometSource,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-width': this.route.style.width,
          'line-gradient': gradient(this.route.style.color),
        },
      });
    }
  }

  private ensureVehicleResources(): void {
    const vehicle = this.route.calculation?.vehicle;
    if (!vehicle?.enabled) {
      removeLayerIfPresent(this.map, this.ids.vehicleLayer);
      removeSourceIfPresent(this.map, this.ids.vehicleSource);
      return;
    }

    const expectedType = vehicle.type === 'dot' ? 'circle' : 'model';
    if (this.map.getLayer(this.ids.vehicleLayer)?.type !== expectedType) {
      removeLayerIfPresent(this.map, this.ids.vehicleLayer);
      removeSourceIfPresent(this.map, this.ids.vehicleSource);
    }

    if (vehicle.type !== 'dot' && !this.map.hasModel(vehicle.type)) {
      this.mutate('addModel', vehicle.type, () => this.map.addModel(vehicle.type, MODELS[vehicle.type]));
    }
    if (!this.map.getSource(this.ids.vehicleSource)) {
      const initialCoord = this.coordinates[0] ?? [0, 0];
      this.map.addSource(this.ids.vehicleSource, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [initialCoord[0], initialCoord[1]] } },
      });
    }
    if (!this.map.getLayer(this.ids.vehicleLayer)) this.addVehicleLayer(vehicle);

    if (vehicle.type === 'dot') {
      this.mutate('setPaintProperty:vehicle-dot', this.ids.vehicleLayer, () => {
        this.map.setPaintProperty(this.ids.vehicleLayer, 'circle-radius', DOT_BASE_RADIUS * vehicle.scale);
        this.map.setPaintProperty(this.ids.vehicleLayer, 'circle-color', this.route.style.color);
      });
    } else {
      this.mutate('setPaintProperty:model-scale', this.ids.vehicleLayer, () => {
        this.map.setPaintProperty(this.ids.vehicleLayer, 'model-scale', [vehicle.scale, vehicle.scale, vehicle.scale]);
      });
    }
  }

  private addVehicleLayer(vehicle: RouteVehicleConfig): void {
    if (vehicle.type === 'dot') {
      this.map.addLayer({
        id: this.ids.vehicleLayer,
        type: 'circle',
        source: this.ids.vehicleSource,
        paint: {
          'circle-radius': DOT_BASE_RADIUS * vehicle.scale,
          'circle-color': this.route.style.color,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2.5,
          'circle-stroke-opacity': 1,
        },
      });
      return;
    }
    this.map.addLayer({
      id: this.ids.vehicleLayer,
      type: 'model',
      source: this.ids.vehicleSource,
      layout: { 'model-id': vehicle.type },
      paint: {
        'model-scale': [vehicle.scale, vehicle.scale, vehicle.scale],
        'model-rotation': [0, 0, 0],
        'model-translation': [0, 0, 0],
      },
    });
  }

  private uploadGeometry(): void {
    const data: GeoJSON.FeatureCollection = this.coordinates.length >= 2
      ? this.route.geojson
      : EMPTY_FC;
    getGeoJSONSource(this.map, this.ids.mainSource)?.setData(data);
    getGeoJSONSource(this.map, this.ids.glowSource)?.setData(data);
  }

  private resolveOpacity(playheadTime: number): number {
    if (this.route.exitAnimation !== 'fade' || playheadTime <= this.route.endTime) return 1;
    return 1 - Math.min((playheadTime - this.route.endTime) / EXIT_DURATION, 1);
  }

  private updateDashPattern(): void {
    const pattern = this.route.style.dashPattern;
    if (this.paint.dashPattern?.[0] === pattern?.[0] && this.paint.dashPattern?.[1] === pattern?.[1]) return;
    if (this.mutate('setPaintProperty:line-dasharray', this.ids.mainLayer, () => {
      this.map.setPaintProperty(this.ids.mainLayer, 'line-dasharray', pattern);
      this.map.setPaintProperty(this.ids.glowLayer, 'line-dasharray', pattern);
    })) this.paint.dashPattern = pattern ? [...pattern] : null;
  }

  private renderVehicle(playheadTime: number, progress: number): void {
    const vehicle = this.route.calculation?.vehicle;
    if (!vehicle?.enabled || this.coordinates.length < 2) return;
    const exitActive = playheadTime > this.route.endTime && this.route.exitAnimation !== 'none';
    const exitProgress = exitActive ? Math.min((playheadTime - this.route.endTime) / EXIT_DURATION, 1) : 0;
    const visible = playheadTime >= this.route.startTime && exitProgress < 1
      && !((this.route.style.animationType ?? 'draw') === 'comet' && progress === 0);
    this.setLayout(this.ids.vehicleLayer, 'visibility', visible ? 'visible' : 'none', 'vehicleVisible', visible);
    const source = getGeoJSONSource(this.map, this.ids.vehicleSource);
    if (!visible || !source) return;

    const head = getAnimatedLine(this.coordinates, progress);
    if (head.length < 2) return;
    const current = head[head.length - 1];
    const previous = head[head.length - 2];
    source.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [current[0], current[1]] },
    });
    const opacity = this.route.exitAnimation === 'fade' && exitActive ? 1 - exitProgress : 1;
    const opacityProperty = vehicle.type === 'dot' ? 'circle-opacity' : 'model-opacity';
    this.setPaint(this.ids.vehicleLayer, opacityProperty, opacity, 'vehicleOpacity', opacity);

    if (vehicle.type !== 'dot') {
      const [prevForAngle, currForAngle] =
        previous[0] === current[0] && previous[1] === current[1]
          ? [this.coordinates[0], this.coordinates[1]]
          : [previous, current];
      const bearing = calculateBearing(prevForAngle, currForAngle);
      const pitch = calculatePitch(prevForAngle, currForAngle);
      this.mutate('setPaintProperty:model-transform', this.ids.vehicleLayer, () => {
        this.map.setPaintProperty(this.ids.vehicleLayer, 'model-rotation', [0, -pitch, bearing]);
        this.map.setPaintProperty(this.ids.vehicleLayer, 'model-translation', [0, 0, 0]);
      });
    }
  }

  private setPaint<K extends keyof PaintCache>(
    layerId: string,
    property: keyof PaintSpecification,
    value: unknown,
    cacheKey: K,
    cacheValue: PaintCache[K],
  ): void {
    if (this.paint[cacheKey] === cacheValue) return;
    if (this.mutate(`setPaintProperty:${property}`, layerId, () => {
      this.map.setPaintProperty(layerId, property, value);
    })) this.paint[cacheKey] = cacheValue;
  }

  private setLayout<K extends keyof PaintCache>(
    layerId: string,
    property: keyof LayoutSpecification,
    value: unknown,
    cacheKey: K,
    cacheValue: PaintCache[K],
  ): void {
    if (this.paint[cacheKey] === cacheValue) return;
    if (this.mutate(`setLayoutProperty:${property}`, layerId, () => {
      this.map.setLayoutProperty(layerId, property, value);
    })) this.paint[cacheKey] = cacheValue;
  }

  private mutate(operation: string, resourceId: string, mutation: () => void): boolean {
    return mutateMap(this.map, { operation, phase: 'update', resourceId }, mutation);
  }
}
