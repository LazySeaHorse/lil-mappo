import type { CalloutItem, CameraItem, TimelineItem } from '@/store/types';
import { geoStats } from './geo';
import { round } from './tools/shared';

/**
 * Compact JSON views of timeline items for agents. Geometry is always
 * summarized (types, point count, bbox) so responses stay small.
 */

function cameraSummary(item: CameraItem, enabled: boolean) {
  return {
    id: item.id,
    kind: 'camera' as const,
    enabled,
    keyframes: item.keyframes.map((k) => ({
      id: k.id,
      time: round(k.time, 3),
      center: k.camera.center.map((n) => round(n, 5)),
      zoom: round(k.camera.zoom, 2),
      pitch: round(k.camera.pitch, 1),
      bearing: round(k.camera.bearing, 1),
      easing: k.easing,
      ...(k.followRoute ? { followRoute: k.followRoute } : {}),
    })),
  };
}

function calloutLocation(item: CalloutItem) {
  return item.binding.kind === 'geographic'
    ? { lngLat: item.binding.lngLat, altitudePx: item.binding.altitude }
    : { screenPosition: item.binding.position };
}

export function summarizeItem(item: TimelineItem, opts: { detail: boolean; cameraEnabled?: boolean }): Record<string, unknown> {
  const { detail } = opts;
  switch (item.kind) {
    case 'route': {
      const calc = item.calculation;
      return {
        id: item.id,
        kind: 'route',
        name: item.name,
        startTime: item.startTime,
        endTime: item.endTime,
        mode: calc?.mode ?? 'imported',
        ...(calc && calc.mode !== 'walk' ? { from: calc.startPoint, to: calc.endPoint } : {}),
        ...(calc?.mode === 'walk' ? { walkPoints: calc.points.length, curved: calc.curved } : {}),
        geometry: geoStats(item.geojson),
        style: detail
          ? item.style
          : { color: item.style.color, width: item.style.width, glow: item.style.glow, animationType: item.style.animationType ?? 'draw' },
        easing: item.easing,
        ...(detail
          ? { exitAnimation: item.exitAnimation ?? 'none', vehicle: calc?.vehicle, autoCam: item.autoCam }
          : { autoCam: !!item.autoCam?.enabled }),
      };
    }
    case 'boundary':
      return {
        id: item.id,
        kind: 'boundary',
        placeName: item.placeName,
        startTime: item.startTime,
        endTime: item.endTime,
        resolveStatus: item.resolveStatus,
        geometry: geoStats(item.geojson),
        style: detail
          ? item.style
          : { strokeColor: item.style.strokeColor, fillOpacity: item.style.fillOpacity, animationStyle: item.style.animationStyle },
        easing: item.easing,
        ...(detail ? { exitAnimation: item.exitAnimation ?? 'none' } : {}),
      };
    case 'callout':
      return {
        id: item.id,
        kind: 'callout',
        styleId: item.styleId,
        title: item.content.title,
        startTime: item.startTime,
        endTime: item.endTime,
        ...calloutLocation(item),
        ...(detail
          ? {
              content: item.content,
              anchor: item.anchor,
              offset: item.offset,
              opacity: item.opacity,
              scale: item.scale,
              sizeMode: item.sizeMode,
              ...(item.sizeMode === 'map' ? { referenceZoom: item.referenceZoom } : {}),
              transition: item.transition,
              connector: item.connector,
              settings: item.settings,
              linkTitleToLocation: item.linkTitleToLocation,
            }
          : {}),
      };
    case 'camera':
      return cameraSummary(item, opts.cameraEnabled ?? true);
  }
}
