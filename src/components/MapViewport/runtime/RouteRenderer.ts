import type { ExpressionSpecification, Map as MapboxMap, ModelSource } from 'mapbox-gl';
import { extractLineCoords, facingAlong, splitAtAntimeridian } from '@/engine/geoUtils';
import { getLineSegment } from '@/engine/lineAnimation';
import { getRoutePath } from '@/engine/routePath';
import type { RouteItem, RouteVehicleConfig } from '@/store/types';
import { resolveRoutePaint } from '../layerStyleContracts';
import {
  EMPTY_FC,
  geoJSONSource,
  getGeoJSONSource,
  LayerPropertyWriter,
  noPaintTransitions,
  removeLayerIfPresent,
  removeSourceIfPresent,
} from './mapboxResources';
import { MODEL_BASE_SCALE, markerSize } from '@/config/vehicles';
import carModelUrl from '@/assets/models/car.glb?url';
import airplaneModelUrl from '@/assets/models/airplane.glb?url';
import { routeTiming, type RouteTiming } from './routeTiming';
import { modelExtent } from '@/models/modelGeometry';
import type { ModelResolver } from './ModelCatalog';

/** The route marker as drawn. */
type DrawnMarker =
  | { kind: 'dot'; radius: number }
  | {
    kind: 'model';
    /** Where the model's glTF is: a bundled asset or an imported model's in-memory object URL. */
    url: string;
    scale: number;
    /** Metres the model is raised so its lowest point sits on the route. */
    lift: number;
    size: { lengthM: number; reachM: number } | null;
  };

const DOT_BASE_RADIUS = 9;
// Imported so Vite gives each model a content-hashed URL that browsers can cache until the file changes.
const MODELS: Record<'car' | 'plane', string> = {
  car: carModelUrl,
  plane: airplaneModelUrl,
};

interface RouteResourceIds {
  mainSource: string;
  mainLayer: string;
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
  mainTrim: string;
  glowColor: string;
  glowWidth: number;
  glowOpacity: number;
  glowVisible: boolean;
  glowTrim: string;
  cometColor: string;
  cometWidth: number;
  lastAnimationType: string;
  vehicleVisible: boolean;
  vehicleOpacity: number;
  /** Last uploaded vehicle position and heading, as a `lng,lat,bearing` key. */
  vehiclePosition: string;
  /** Last model-translation height written to the vehicle layer. */
  vehicleLift: number;
  dashPattern: number[] | null;
}

function createIds(routeId: string): RouteResourceIds {
  return {
    mainSource: `route-${routeId}`,
    mainLayer: `route-layer-${routeId}`,
    glowLayer: `route-glow-layer-${routeId}`,
    cometSource: `route-comet-${routeId}`,
    cometLayer: `route-comet-layer-${routeId}`,
    vehicleSource: `vehicle-source-${routeId}`,
    vehicleLayer: `vehicle-layer-${routeId}`,
  };
}

function createPaintCache(): PaintCache {
  return {
    mainColor: '', mainWidth: -1, mainOpacity: -1, mainVisible: true, mainTrim: '',
    glowColor: '', glowWidth: -1, glowOpacity: -1, glowVisible: false, glowTrim: '',
    cometColor: '', cometWidth: -1,
    lastAnimationType: '',
    vehicleVisible: true, vehicleOpacity: -1, vehiclePosition: '', vehicleLift: 0,
    dashPattern: null,
  };
}

function coordsToFeatureCollection(coords: number[][]): GeoJSON.FeatureCollection {
  if (!coords || coords.length < 2 || !Array.isArray(coords[0])) return EMPTY_FC;
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: splitAtAntimeridian(coords) }],
  };
}

/**
 * The whole route as ONE LineString (a MultiLineString or several features would each get their own
 * 0..1 line-progress), longitude unwrapped so an antimeridian crossing stays continuous; Mapbox's
 * GeoJSON tiler wraps the world copies itself and keeps the progress continuous across the seam.
 */
function routeLine(coords: number[][]): GeoJSON.FeatureCollection {
  if (coords.length < 2) return EMPTY_FC;
  let prevLng = coords[0][0];
  const line = coords.map((c) => {
    prevLng = c[0] + 360 * Math.round((prevLng - c[0]) / 360);
    return [prevLng, ...c.slice(1)];
  });
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }] };
}

function gradient(color: string): ExpressionSpecification {
  return ['interpolate', ['linear'], ['line-progress'], 0, 'transparent', 1, color];
}

/** The one model in a route's model source. */
const VEHICLE_MODEL = 'vehicle';

/**
 * A model marker is drawn from a Mapbox model source, never a GeoJSON one, and turned by the
 * model's `orientation`, never by `model-rotation`.
 *
 * A model layer on a GeoJSON source bakes model-rotation into its tiles when they are built, so a
 * new heading reaches the drawn model only when a tile is rebuilt. Worse, on the globe (globe
 * projection below zoom 6) mapbox-gl's drawVectorLayerModels decomposes that baked rotation with
 * `getAxisAngle(rotation, quat)`, keeping the axis and dropping the angle, so the model is always
 * drawn facing north. Zooming in past 6 switches the map to mercator, where the heading shows,
 * until the camera goes back out. A model source is placed at draw time from the model's position
 * and orientation (drawModels -> calculateModelMatrix) in either projection, and `setModels` moves
 * and turns it in one write.
 */
function vehicleModel(url: string, position: [number, number], bearing: number) {
  return { [VEHICLE_MODEL]: { uri: url, position, orientation: [0, 0, bearing] as [number, number, number] } };
}

function getModelSource(map: MapboxMap, sourceId: string): ModelSource | undefined {
  const source = map.getSource(sourceId);
  return source?.type === 'model' ? source as ModelSource : undefined;
}

export class RouteRenderer {
  private route: RouteItem;
  private coordinates: number[][];
  private readonly ids: RouteResourceIds;
  private readonly layers: LayerPropertyWriter<PaintCache>;
  private lastCometState = '';
  private disposed = false;
  private marker: DrawnMarker | null = null;
  /** The model file the vehicle's model source was made with. */
  private vehicleModelUrl = '';

  constructor(
    private readonly map: MapboxMap,
    route: RouteItem,
    /** Finds imported models for a custom marker; without one, a custom marker is a dot. */
    private readonly resolver?: ModelResolver,
  ) {
    this.layers = new LayerPropertyWriter(map, createPaintCache);
    this.route = route;
    this.coordinates = extractLineCoords(route.geojson);
    this.ids = createIds(route.id);
  }

  mount(): void {
    this.disposed = false;
    this.layers.reset();
    this.lastCometState = '';
    this.ensureRouteResources();
    this.ensureVehicleResources();
    this.uploadGeometry();
  }

  setRoute(route: RouteItem): void {
    if (route.id !== this.route.id) throw new Error('RouteRenderer cannot change route ids');
    const geometryChanged = route.geojson !== this.route.geojson;
    const vehicleChanged = route.calculation?.vehicle !== this.route.calculation?.vehicle;
    const colorChanged = route.style.color !== this.route.style.color;
    this.route = route;
    if (geometryChanged) {
      this.coordinates = extractLineCoords(route.geojson);
      this.uploadGeometry();
    }
    if (vehicleChanged || colorChanged) this.ensureVehicleResources();
  }

  render = (playheadTime: number): void => {
    if (this.disposed) return;
    const route = this.route;
    const coordinates = this.coordinates;
    const mainSource = getGeoJSONSource(this.map, this.ids.mainSource);
    if (!mainSource || coordinates.length < 2) return;

    const resolvedPaint = resolveRoutePaint(route);
    const routeColor = resolvedPaint.lineColor;
    const timing = routeTiming(route, playheadTime);
    const { progress, isBeforeStart, exitActive, exitProgress, isAfterExit } = timing;
    const { animationType } = route.style;

    if (this.layers.cache.lastAnimationType === 'comet' && animationType !== 'comet') {
      getGeoJSONSource(this.map, this.ids.cometSource)?.setData(EMPTY_FC);
      this.lastCometState = '';
    }
    this.layers.cache.lastAnimationType = animationType;

    if (animationType === 'comet') {
      this.layers.setLayout(this.ids.mainLayer, 'visibility', 'none', 'mainVisible', false);
      this.layers.setLayout(this.ids.glowLayer, 'visibility', 'none', 'glowVisible', false);
      if (isBeforeStart || isAfterExit) {
        if (this.lastCometState !== 'comet:empty') {
          getGeoJSONSource(this.map, this.ids.cometSource)?.setData(EMPTY_FC);
          this.lastCometState = 'comet:empty';
        }
      } else {
        const state = `comet:${progress}`;
        if (this.lastCometState !== state) {
          const trail = getLineSegment(coordinates, Math.max(0, progress - route.style.cometTrailLength), progress);
          getGeoJSONSource(this.map, this.ids.cometSource)?.setData(coordsToFeatureCollection(trail));
          this.lastCometState = state;
        }
        this.layers.setPaint(this.ids.cometLayer, 'line-gradient', gradient(routeColor), 'cometColor', routeColor);
        this.layers.setPaint(this.ids.cometLayer, 'line-width', route.style.width, 'cometWidth', route.style.width);
      }
    } else {
      if (isBeforeStart || isAfterExit) {
        this.layers.setLayout(this.ids.mainLayer, 'visibility', 'none', 'mainVisible', false);
        this.layers.setLayout(this.ids.glowLayer, 'visibility', 'none', 'glowVisible', false);
      } else {
        this.layers.setLayout(this.ids.mainLayer, 'visibility', 'visible', 'mainVisible', true);
        const glowVisible = Boolean(route.style.glow);
        this.layers.setLayout(this.ids.glowLayer, 'visibility', glowVisible ? 'visible' : 'none', 'glowVisible', glowVisible);

        const { opacity } = timing;
        this.layers.setPaint(this.ids.mainLayer, 'line-color', routeColor, 'mainColor', routeColor);
        this.layers.setPaint(this.ids.mainLayer, 'line-opacity', opacity, 'mainOpacity', opacity);
        this.layers.setPaint(this.ids.mainLayer, 'line-width', route.style.width, 'mainWidth', route.style.width);
        this.updateDashPattern();

        if (glowVisible) {
          const glowOpacity = 0.35 * opacity;
          this.layers.setPaint(this.ids.glowLayer, 'line-color', routeColor, 'glowColor', routeColor);
          this.layers.setPaint(this.ids.glowLayer, 'line-opacity', glowOpacity, 'glowOpacity', glowOpacity);
          if (this.layers.cache.glowWidth !== resolvedPaint.glowWidth) {
            if (this.layers.mutate('setPaintProperty:glow-size', this.ids.glowLayer, () => {
              this.map.setPaintProperty(this.ids.glowLayer, 'line-width', resolvedPaint.glowWidth);
              this.map.setPaintProperty(this.ids.glowLayer, 'line-blur', resolvedPaint.glowBlur);
            })) this.layers.cache.glowWidth = resolvedPaint.glowWidth;
          }
        }

        // The full line is uploaded once; the animation only moves the trim, which hides [start, end]
        // of the line-progress. Progress is geodesic, line-progress is mercator, hence lineProgressAt.
        const path = getRoutePath(coordinates);
        let trim: [number, number] = [0, 0];
        if (animationType === 'navigation') trim = [0, path.lineProgressAt(progress)];
        else if (exitActive && route.exitAnimation === 'reverse') trim = [0, path.lineProgressAt(exitProgress)];
        else if (progress < 1) trim = [path.lineProgressAt(progress), 1];
        const key = `${trim[0]},${trim[1]}`;
        this.layers.setPaint(this.ids.mainLayer, 'line-trim-offset', trim, 'mainTrim', key);
        if (glowVisible) this.layers.setPaint(this.ids.glowLayer, 'line-trim-offset', trim, 'glowTrim', key);
      }
    }

    this.renderVehicle(playheadTime, timing);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    [this.ids.vehicleLayer, this.ids.glowLayer, this.ids.cometLayer, this.ids.mainLayer]
      .forEach((id) => removeLayerIfPresent(this.map, id));
    [this.ids.vehicleSource, this.ids.cometSource, this.ids.mainSource]
      .forEach((id) => removeSourceIfPresent(this.map, id));
  }

  private ensureRouteResources(): void {
    if (!this.map.getSource(this.ids.mainSource)) this.map.addSource(this.ids.mainSource, geoJSONSource(true));
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
          ...noPaintTransitions('line-color', 'line-width', 'line-opacity'),
        },
      });
    }
    if (!this.map.getLayer(this.ids.glowLayer)) {
      this.map.addLayer({
        id: this.ids.glowLayer,
        type: 'line',
        source: this.ids.mainSource,
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
        paint: {
          'line-color': resolvedPaint.lineColor,
          'line-width': resolvedPaint.glowWidth,
          'line-opacity': 0.35,
          'line-blur': resolvedPaint.glowBlur,
          ...noPaintTransitions('line-color', 'line-width', 'line-opacity', 'line-blur'),
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
          ...noPaintTransitions('line-width'),
        },
      });
    }
  }

  /** What the marker is drawn as: a custom marker whose model file is missing falls back to the dot. */
  private resolveMarker(vehicle: RouteVehicleConfig): DrawnMarker {
    if (vehicle.type === 'custom') {
      const resolved = this.resolver?.resolve(vehicle.modelId) ?? null;
      if (!resolved) return { kind: 'dot', radius: DOT_BASE_RADIUS };
      const s = vehicle.scale || 1;
      const { lengthM, reachM, lift } = modelExtent(resolved.asset.bounds);
      // Lifted so the model's lowest point rides on the route, whatever its origin.
      return { kind: 'model', url: resolved.url, scale: s, lift: lift * s, size: { lengthM: lengthM * s, reachM: reachM * s } };
    }
    if (vehicle.type === 'dot') return { kind: 'dot', radius: DOT_BASE_RADIUS * vehicle.scale };
    const type = vehicle.type;
    return { kind: 'model', url: MODELS[type], scale: vehicle.scale * MODEL_BASE_SCALE[type], lift: 0, size: markerSize(vehicle) };
  }

  /** The imported models changed (relinked, released): look the custom marker's model up again. */
  refreshModels(): void {
    if (this.route.calculation?.vehicle?.type === 'custom') this.ensureVehicleResources();
  }

  private ensureVehicleResources(): void {
    // The source and layer may be recreated below, starting from their initial position and rotation.
    this.layers.cache.vehiclePosition = '';
    const vehicle = this.route.calculation?.vehicle;
    if (!vehicle?.enabled) {
      this.marker = null;
      removeLayerIfPresent(this.map, this.ids.vehicleLayer);
      removeSourceIfPresent(this.map, this.ids.vehicleSource);
      return;
    }

    const marker = this.resolveMarker(vehicle);
    this.marker = marker;
    const expectedLayer = marker.kind === 'dot' ? 'circle' : 'model';
    const expectedSource = marker.kind === 'dot' ? 'geojson' : 'model';
    // A different model file gets a new source, so it never shows the old model in the meantime.
    if (this.map.getLayer(this.ids.vehicleLayer)?.type !== expectedLayer
      || this.map.getSource(this.ids.vehicleSource)?.type !== expectedSource
      || (marker.kind === 'model' && marker.url !== this.vehicleModelUrl)) {
      removeLayerIfPresent(this.map, this.ids.vehicleLayer);
      removeSourceIfPresent(this.map, this.ids.vehicleSource);
    }

    if (!this.map.getSource(this.ids.vehicleSource)) {
      const [lng, lat] = this.coordinates[0] ?? [0, 0];
      this.vehicleModelUrl = marker.kind === 'model' ? marker.url : '';
      this.map.addSource(this.ids.vehicleSource, marker.kind === 'dot'
        ? { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } } }
        : { type: 'model', models: vehicleModel(marker.url, [lng, lat], 0) });
    }
    if (!this.map.getLayer(this.ids.vehicleLayer)) this.addVehicleLayer(marker);

    if (marker.kind === 'dot') {
      this.layers.mutate('setPaintProperty:vehicle-dot', this.ids.vehicleLayer, () => {
        this.map.setPaintProperty(this.ids.vehicleLayer, 'circle-radius', marker.radius);
        this.map.setPaintProperty(this.ids.vehicleLayer, 'circle-color', this.route.style.color);
      });
      return;
    }
    this.layers.mutate('setPaintProperty:model-scale', this.ids.vehicleLayer, () => {
      const s = marker.scale;
      this.map.setPaintProperty(this.ids.vehicleLayer, 'model-scale', [s, s, s]);
    });
    this.layers.setPaint(this.ids.vehicleLayer, 'model-translation', [0, 0, marker.lift], 'vehicleLift', marker.lift);
  }

  private addVehicleLayer(marker: DrawnMarker): void {
    // A new layer starts visible at full opacity, whatever the one it replaces was set to.
    this.layers.cache.vehicleVisible = true;
    this.layers.cache.vehicleOpacity = -1;
    this.layers.cache.vehicleLift = marker.kind === 'model' ? marker.lift : 0;
    if (marker.kind === 'dot') {
      this.map.addLayer({
        id: this.ids.vehicleLayer,
        type: 'circle',
        source: this.ids.vehicleSource,
        paint: {
          'circle-radius': marker.radius,
          'circle-color': this.route.style.color,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2.5,
          'circle-stroke-opacity': 1,
          ...noPaintTransitions('circle-radius', 'circle-color', 'circle-opacity'),
        },
      });
      return;
    }
    const s = marker.scale;
    this.map.addLayer({
      id: this.ids.vehicleLayer,
      type: 'model',
      source: this.ids.vehicleSource,
      // No model-rotation: the heading is the model's orientation (see vehicleModel).
      paint: {
        'model-scale': [s, s, s],
        'model-translation': [0, 0, marker.lift],
        ...noPaintTransitions('model-opacity', 'model-scale', 'model-translation'),
      },
    });
  }

  private uploadGeometry(): void {
    getGeoJSONSource(this.map, this.ids.mainSource)?.setData(routeLine(getRoutePath(this.coordinates).coords));
  }

  private updateDashPattern(): void {
    const pattern = this.route.style.dashPattern;
    if (this.layers.cache.dashPattern?.[0] === pattern?.[0] && this.layers.cache.dashPattern?.[1] === pattern?.[1]) return;
    if (this.layers.mutate('setPaintProperty:line-dasharray', this.ids.mainLayer, () => {
      this.map.setPaintProperty(this.ids.mainLayer, 'line-dasharray', pattern);
      this.map.setPaintProperty(this.ids.glowLayer, 'line-dasharray', pattern);
    })) this.layers.cache.dashPattern = pattern ? [...pattern] : null;
  }

  private renderVehicle(playheadTime: number, { progress, exitProgress, opacity }: RouteTiming): void {
    const marker = this.marker;
    if (!marker || this.coordinates.length < 2) return;
    const visible = playheadTime >= this.route.startTime && exitProgress < 1
      && !(this.route.style.animationType === 'comet' && progress === 0);
    this.layers.setLayout(this.ids.vehicleLayer, 'visibility', visible ? 'visible' : 'none', 'vehicleVisible', visible);
    if (!visible) return;

    const path = getRoutePath(this.coordinates);
    if (path.coords.length < 2) return;
    const [lng, lat] = path.pointAt(progress);
    const size = marker.kind === 'model' ? marker.size : null;
    // To a hundredth of a degree, so gliding along a straight doesn't rewrite it every frame.
    const bearing = size ? Math.round(facingAlong(path, progress, size.lengthM) * 100) / 100 : 0;
    const position = `${lng},${lat},${bearing}`;
    if (this.layers.cache.vehiclePosition !== position) {
      let sent = false;
      if (marker.kind === 'model') {
        // Position and heading in one write, applied when the model is next drawn (see vehicleModel).
        const source = getModelSource(this.map, this.ids.vehicleSource);
        sent = Boolean(source) && this.layers.mutate('setModels', this.ids.vehicleSource, () => {
          source!.setModels(vehicleModel(marker.url, [lng, lat], bearing));
          this.map.triggerRepaint();
        });
      } else {
        const source = getGeoJSONSource(this.map, this.ids.vehicleSource);
        sent = Boolean(source) && this.layers.mutate('setData', this.ids.vehicleSource, () => {
          source!.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } });
        });
      }
      if (sent) this.layers.cache.vehiclePosition = position;
    }
    const opacityProperty = marker.kind === 'dot' ? 'circle-opacity' : 'model-opacity';
    this.layers.setPaint(this.ids.vehicleLayer, opacityProperty, opacity, 'vehicleOpacity', opacity);
  }
}
