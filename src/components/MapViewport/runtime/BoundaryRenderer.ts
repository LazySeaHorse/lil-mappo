import type { Map as MapboxMap } from 'mapbox-gl';
import { clamp } from '@/engine/cameraPose';
import { extractLineStringsFromGeometry } from '@/engine/geoUtils';
import { getLineSegment } from '@/engine/lineAnimation';
import type { BoundaryItem } from '@/store/types';
import { resolveBoundaryFillColor } from '../layerStyleContracts';
import { BoundaryFlagLayer, type FlagPlacement, preloadFlag } from './BoundaryFlagLayer';
import { resolveBoundaryTiming } from './boundaryTiming';
import {
  getGeoJSONSource,
  LayerPropertyWriter,
  noPaintTransitions,
  removeLayerIfPresent,
  removeSourceIfPresent,
} from './mapboxResources';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

interface BoundaryResourceIds {
  fillSource: string;
  fillLayer: string;
  strokeSource: string;
  strokeLayer: string;
  glowLayer: string;
}

interface BoundaryPaintCache {
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  glowOpacity: number;
  glowVisible: boolean;
}

function createIds(boundaryId: string): BoundaryResourceIds {
  return {
    fillSource: `boundary-fill-${boundaryId}`,
    fillLayer: `boundary-fill-layer-${boundaryId}`,
    strokeSource: `boundary-stroke-${boundaryId}`,
    strokeLayer: `boundary-stroke-layer-${boundaryId}`,
    glowLayer: `boundary-glow-layer-${boundaryId}`,
  };
}

function createPaintCache(): BoundaryPaintCache {
  return {
    fillColor: '',
    fillOpacity: -1,
    strokeColor: '',
    strokeWidth: -1,
    strokeOpacity: -1,
    glowOpacity: -1,
    glowVisible: false,
  };
}

export class BoundaryRenderer {
  private boundary: BoundaryItem;
  private readonly ids: BoundaryResourceIds;
  private readonly layers: LayerPropertyWriter<BoundaryPaintCache>;
  private lastGeometry: GeoJSON.Geometry | null = null;
  private strokeSourceMode: 'static' | 'animated' | null = null;
  /** Inputs of the last animated stroke upload; an identical frame skips the (large) setData. */
  private lastAnimatedStroke: { geometry: GeoJSON.Geometry; key: string } | null = null;
  private readonly flag: BoundaryFlagLayer;
  private disposed = false;

  /** `getPlacement` is where flag fills go (under the basemap's roads and labels). */
  constructor(
    private readonly map: MapboxMap,
    boundary: BoundaryItem,
    getPlacement: () => FlagPlacement = () => ({}),
  ) {
    this.layers = new LayerPropertyWriter(map, createPaintCache);
    this.flag = new BoundaryFlagLayer(map, boundary.id, getPlacement);
    this.boundary = boundary;
    this.ids = createIds(boundary.id);
  }

  mount(): void {
    this.disposed = false;
    this.layers.reset();
    this.lastGeometry = null;
    this.strokeSourceMode = null;
    this.lastAnimatedStroke = null;
    this.flag.reset();
    this.ensureResources();
    preloadFlag(this.boundary.style.fillMode === 'flag', this.boundary.style.flagCode);
  }

  setBoundary(boundary: BoundaryItem): void {
    if (boundary.id !== this.boundary.id) throw new Error('BoundaryRenderer cannot change boundary ids');
    const previous = this.boundary.style;
    this.boundary = boundary;
    const { fillMode, flagCode } = boundary.style;
    if (fillMode !== previous.fillMode || flagCode !== previous.flagCode) preloadFlag(fillMode === 'flag', flagCode);
  }

  render = (playheadTime: number): void => {
    if (this.disposed) return;
    const boundary = this.boundary;
    const geometry = boundary.geojson;
    if (!geometry || boundary.resolveStatus !== 'resolved') return;
    const fillSource = getGeoJSONSource(this.map, this.ids.fillSource);
    const strokeSource = getGeoJSONSource(this.map, this.ids.strokeSource);
    if (!fillSource || !strokeSource) return;

    const style = boundary.style;
    const { progress, exitProgress, reverseProgress, fadeExit, reverseExit, animationStyle, fillFactor } = resolveBoundaryTiming(boundary, playheadTime);
    const geometryChanged = this.lastGeometry !== geometry;

    const fillColor = resolveBoundaryFillColor(style);
    this.layers.setPaint(this.ids.fillLayer, 'fill-color', fillColor, 'fillColor', fillColor);
    this.updateStrokeStyle();

    const glowVisible = style.glow && !reverseExit;
    this.layers.setLayout(this.ids.glowLayer, 'visibility', glowVisible ? 'visible' : 'none', 'glowVisible', glowVisible);

    // In flag mode the colour fill stays invisible and the raster flag layer carries the opacity
    const flagMode = style.fillMode === 'flag';
    const targetOpacity = clamp(style.fillOpacity, 0, 1) * fillFactor;
    const fillOpacity = flagMode ? 0 : targetOpacity;
    this.flag.sync({
      enabled: flagMode,
      code: style.flagCode,
      geometry,
      opacity: targetOpacity,
    });

    if (geometryChanged) {
      fillSource.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry }],
      });
      this.lastGeometry = geometry;
    }
    this.layers.setPaint(this.ids.fillLayer, 'fill-opacity', fillOpacity, 'fillOpacity', fillOpacity);

    const staticStroke = !style.animateStroke || animationStyle === 'fade';
    let strokeOpacity: number;
    if (reverseExit) {
      strokeOpacity = staticStroke
        ? Math.min(reverseProgress * 2, 1)
        : animationStyle === 'draw' ? (reverseProgress > 0 ? 1 : 0) : reverseProgress;
    } else if (!style.animateStroke) {
      strokeOpacity = progress > 0 ? 1 : 0;
      if (fadeExit) strokeOpacity *= reverseProgress;
    } else {
      strokeOpacity = animationStyle === 'fade' ? Math.min(progress * 2, 1) : (progress > 0 ? 1 : 0);
      if (fadeExit) strokeOpacity *= reverseProgress;
    }

    if (staticStroke) {
      if (this.strokeSourceMode !== 'static' || geometryChanged) {
        strokeSource.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry }],
        });
        this.strokeSourceMode = 'static';
        this.lastAnimatedStroke = null;
      }
    } else {
      const traceLength = boundary.style.traceLength ?? 0.1;
      const draw = animationStyle === 'draw';
      const position = reverseExit ? (draw ? exitProgress : reverseProgress) : progress;
      const key = `${animationStyle}|${reverseExit}|${position}|${traceLength}`;
      const last = this.lastAnimatedStroke;
      if (this.strokeSourceMode !== 'animated' || !last || last.geometry !== geometry || last.key !== key) {
        strokeSource.setData(this.buildAnimatedStroke(geometry, draw, position, reverseExit, traceLength));
        this.strokeSourceMode = 'animated';
        this.lastAnimatedStroke = { geometry, key };
      }
    }

    this.layers.setPaint(this.ids.strokeLayer, 'line-opacity', strokeOpacity, 'strokeOpacity', strokeOpacity);
    if (glowVisible) {
      const glowOpacity = 0.35 * strokeOpacity;
      this.layers.setPaint(this.ids.glowLayer, 'line-opacity', glowOpacity, 'glowOpacity', glowOpacity);
    }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.flag.dispose();
    [this.ids.glowLayer, this.ids.strokeLayer, this.ids.fillLayer]
      .forEach((id) => removeLayerIfPresent(this.map, id));
    [this.ids.strokeSource, this.ids.fillSource]
      .forEach((id) => removeSourceIfPresent(this.map, id));
  }

  private ensureResources(): void {
    if (!this.map.getSource(this.ids.fillSource)) {
      this.map.addSource(this.ids.fillSource, { type: 'geojson', data: EMPTY_FC });
    }
    if (!this.map.getSource(this.ids.strokeSource)) {
      this.map.addSource(this.ids.strokeSource, { type: 'geojson', data: EMPTY_FC });
    }

    const style = this.boundary.style;
    if (!this.map.getLayer(this.ids.fillLayer)) {
      this.map.addLayer({
        id: this.ids.fillLayer,
        type: 'fill',
        source: this.ids.fillSource,
        paint: {
          'fill-color': resolveBoundaryFillColor(style),
          'fill-opacity': 0,
          ...noPaintTransitions('fill-color', 'fill-opacity'),
        },
      });
    }
    if (!this.map.getLayer(this.ids.strokeLayer)) {
      this.map.addLayer({
        id: this.ids.strokeLayer,
        type: 'line',
        source: this.ids.strokeSource,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': style.strokeColor,
          'line-width': style.strokeWidth,
          'line-opacity': 0,
          ...noPaintTransitions('line-color', 'line-width', 'line-opacity'),
        },
      });
    }
    if (!this.map.getLayer(this.ids.glowLayer)) {
      this.map.addLayer({
        id: this.ids.glowLayer,
        type: 'line',
        source: this.ids.strokeSource,
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
        paint: {
          'line-color': style.strokeColor,
          'line-width': style.strokeWidth * 3,
          'line-opacity': 0.35,
          'line-blur': style.strokeWidth * 2,
          ...noPaintTransitions('line-color', 'line-width', 'line-opacity', 'line-blur'),
        },
      }, this.ids.strokeLayer);
    }
  }

  private updateStrokeStyle(): void {
    const style = this.boundary.style;
    if (this.layers.cache.strokeColor !== style.strokeColor) {
      if (this.layers.mutate('setPaintProperty:stroke-color', this.ids.strokeLayer, () => {
        this.map.setPaintProperty(this.ids.strokeLayer, 'line-color', style.strokeColor);
        this.map.setPaintProperty(this.ids.glowLayer, 'line-color', style.strokeColor);
      })) this.layers.cache.strokeColor = style.strokeColor;
    }
    if (this.layers.cache.strokeWidth !== style.strokeWidth) {
      if (this.layers.mutate('setPaintProperty:stroke-size', this.ids.strokeLayer, () => {
        this.map.setPaintProperty(this.ids.strokeLayer, 'line-width', style.strokeWidth);
        this.map.setPaintProperty(this.ids.glowLayer, 'line-width', style.strokeWidth * 3);
        this.map.setPaintProperty(this.ids.glowLayer, 'line-blur', style.strokeWidth * 2);
      })) this.layers.cache.strokeWidth = style.strokeWidth;
    }
  }

  private buildAnimatedStroke(
    geometry: GeoJSON.Geometry,
    draw: boolean,
    position: number,
    reverseExit: boolean,
    traceLength: number,
  ): GeoJSON.FeatureCollection {
    const animatedRings: number[][][] = [];
    for (const ring of extractLineStringsFromGeometry(geometry)) {
      let segment: number[][];
      if (draw) {
        segment = reverseExit
          ? getLineSegment(ring, position, 1)
          : getLineSegment(ring, 0, position);
      } else {
        segment = getLineSegment(
          ring,
          position * (1 + traceLength) - traceLength,
          position * (1 + traceLength),
        );
      }
      if (segment.length >= 2) animatedRings.push(segment);
    }
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'MultiLineString', coordinates: animatedRings },
      }],
    };
  }
}
