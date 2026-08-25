import type { LayoutSpecification, Map as MapboxMap, PaintSpecification } from 'mapbox-gl';
import { getNormalizedProgress } from '@/engine/easings';
import { extractLineStringsFromGeometry } from '@/engine/geoUtils';
import { getLineSegment } from '@/engine/lineAnimation';
import { useProjectStore } from '@/store/useProjectStore';
import type { BoundaryItem } from '@/store/types';
import { resolveBoundaryFillColor } from '../layerStyleContracts';
import {
  getGeoJSONSource,
  mutateMap,
  removeLayerIfPresent,
  removeSourceIfPresent,
} from './mapboxResources';

type ProjectState = ReturnType<typeof useProjectStore.getState>;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const EXIT_DURATION = 0.5;

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
  private paint = createPaintCache();
  private lastGeometry: GeoJSON.Geometry | null = null;
  private unsubscribe: (() => void) | undefined;
  private disposed = false;

  constructor(private readonly map: MapboxMap, boundary: BoundaryItem) {
    this.boundary = boundary;
    this.ids = createIds(boundary.id);
  }

  mount(): void {
    this.disposed = false;
    this.paint = createPaintCache();
    this.lastGeometry = null;
    this.ensureResources();
    this.unsubscribe = useProjectStore.subscribe((state, previous) => {
      if (state.playheadTime !== previous.playheadTime) this.render(state);
    });
    this.render(useProjectStore.getState());
  }

  setBoundary(boundary: BoundaryItem): void {
    if (boundary.id !== this.boundary.id) throw new Error('BoundaryRenderer cannot change boundary ids');
    this.boundary = boundary;
    this.render(useProjectStore.getState());
  }

  render = (state: ProjectState): void => {
    if (this.disposed) return;
    const boundary = this.boundary;
    const geometry = boundary.geojson;
    if (!geometry || boundary.resolveStatus !== 'resolved') return;
    const fillSource = getGeoJSONSource(this.map, this.ids.fillSource);
    const strokeSource = getGeoJSONSource(this.map, this.ids.strokeSource);
    if (!fillSource || !strokeSource) return;

    const style = boundary.style;
    const progress = getNormalizedProgress(state.playheadTime, boundary.startTime, boundary.endTime, boundary.easing);
    const isExiting = boundary.exitAnimation !== 'none' && state.playheadTime > boundary.endTime;
    const exitProgress = isExiting ? Math.min((state.playheadTime - boundary.endTime) / EXIT_DURATION, 1) : 0;
    const reverseProgress = 1 - exitProgress;
    const fadeExit = boundary.exitAnimation === 'fade' && isExiting;
    const reverseExit = boundary.exitAnimation === 'reverse' && isExiting;
    const animationStyle = style.animationStyle ?? 'fade';
    const geometryChanged = this.lastGeometry !== geometry;

    const fillColor = resolveBoundaryFillColor(style);
    this.setPaint(this.ids.fillLayer, 'fill-color', fillColor, 'fillColor', fillColor);
    this.updateStrokeStyle();

    const glowVisible = style.glow && !reverseExit;
    this.setLayout(this.ids.glowLayer, 'visibility', glowVisible ? 'visible' : 'none', 'glowVisible', glowVisible);

    let fillProgress: number;
    if (reverseExit) {
      fillProgress = animationStyle === 'draw' ? Math.max(0, (reverseProgress - 0.7) / 0.3) : reverseProgress;
    } else {
      fillProgress = animationStyle === 'fade' ? progress : Math.max(0, (progress - 0.7) / 0.3);
    }
    let fillOpacity = style.fillOpacity * fillProgress;
    if (fadeExit) fillOpacity *= reverseProgress;

    if (geometryChanged) {
      fillSource.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry }],
      });
      this.lastGeometry = geometry;
    }
    this.setPaint(this.ids.fillLayer, 'fill-opacity', fillOpacity, 'fillOpacity', fillOpacity);

    const staticStroke = !style.animateStroke || animationStyle === 'fade';
    let strokeOpacity: number;
    if (reverseExit) {
      strokeOpacity = staticStroke
        ? Math.min(reverseProgress * 2, 1)
        : animationStyle === 'draw' ? (reverseProgress > 0 ? 1 : 0) : reverseProgress;
    } else {
      strokeOpacity = animationStyle === 'fade' ? Math.min(progress * 2, 1) : (progress > 0 ? 1 : 0);
      if (fadeExit) strokeOpacity *= reverseProgress;
    }

    if (!staticStroke || geometryChanged) {
      strokeSource.setData(staticStroke
        ? {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry }],
          }
        : this.buildAnimatedStroke(geometry, animationStyle, progress, exitProgress, reverseProgress, reverseExit));
    }

    this.setPaint(this.ids.strokeLayer, 'line-opacity', strokeOpacity, 'strokeOpacity', strokeOpacity);
    if (glowVisible) {
      const glowOpacity = 0.35 * strokeOpacity;
      this.setPaint(this.ids.glowLayer, 'line-opacity', glowOpacity, 'glowOpacity', glowOpacity);
    }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
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
        paint: { 'fill-color': resolveBoundaryFillColor(style), 'fill-opacity': 0 },
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
        },
      }, this.ids.strokeLayer);
    }
  }

  private updateStrokeStyle(): void {
    const style = this.boundary.style;
    if (this.paint.strokeColor !== style.strokeColor) {
      if (this.mutate('setPaintProperty:stroke-color', this.ids.strokeLayer, () => {
        this.map.setPaintProperty(this.ids.strokeLayer, 'line-color', style.strokeColor);
        this.map.setPaintProperty(this.ids.glowLayer, 'line-color', style.strokeColor);
      })) this.paint.strokeColor = style.strokeColor;
    }
    if (this.paint.strokeWidth !== style.strokeWidth) {
      if (this.mutate('setPaintProperty:stroke-size', this.ids.strokeLayer, () => {
        this.map.setPaintProperty(this.ids.strokeLayer, 'line-width', style.strokeWidth);
        this.map.setPaintProperty(this.ids.glowLayer, 'line-width', style.strokeWidth * 3);
        this.map.setPaintProperty(this.ids.glowLayer, 'line-blur', style.strokeWidth * 2);
      })) this.paint.strokeWidth = style.strokeWidth;
    }
  }

  private buildAnimatedStroke(
    geometry: GeoJSON.Geometry,
    animationStyle: string,
    progress: number,
    exitProgress: number,
    reverseProgress: number,
    reverseExit: boolean,
  ): GeoJSON.FeatureCollection {
    const traceLength = this.boundary.style.traceLength ?? 0.1;
    const animatedRings: number[][][] = [];
    for (const ring of extractLineStringsFromGeometry(geometry)) {
      let segment: number[][];
      if (animationStyle === 'draw') {
        segment = reverseExit
          ? getLineSegment(ring, exitProgress, 1)
          : getLineSegment(ring, 0, progress);
      } else {
        const position = reverseExit ? reverseProgress : progress;
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

  private setPaint<K extends keyof BoundaryPaintCache>(
    layerId: string,
    property: keyof PaintSpecification,
    value: unknown,
    cacheKey: K,
    cacheValue: BoundaryPaintCache[K],
  ): void {
    if (this.paint[cacheKey] === cacheValue) return;
    if (this.mutate(`setPaintProperty:${property}`, layerId, () => {
      this.map.setPaintProperty(layerId, property, value);
    })) this.paint[cacheKey] = cacheValue;
  }

  private setLayout<K extends keyof BoundaryPaintCache>(
    layerId: string,
    property: keyof LayoutSpecification,
    value: unknown,
    cacheKey: K,
    cacheValue: BoundaryPaintCache[K],
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
