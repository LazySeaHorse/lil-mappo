import { describe, expect, it } from 'vitest';
import type { ModelAsset, RouteItem } from '@/store/types';
import { defaultAutoCamFor } from '@/config/vehicles';
import { getCameraAtTime } from './cameraInterpolation';

const coords = [[0, 0], [0.05, 0], [0.1, 0]];

const route: RouteItem = {
  kind: 'route',
  id: 'r1',
  name: 'Parade',
  geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] },
  startTime: 0,
  endTime: 10,
  style: { color: '#fff', width: 4, glow: false, glowWidth: 8, dashPattern: null, animationType: 'draw', cometTrailLength: 0.2 },
  easing: 'linear',
  exitAnimation: 'none',
  autoCam: { ...defaultAutoCamFor('car'), mode: 'navigation', zoom: 17 },
  calculation: {
    mode: 'car', startPoint: [0, 0], endPoint: [0.1, 0], startName: '', endName: '',
    vehicle: { enabled: true, type: 'custom', modelId: 'blimp', scale: 1 },
  },
};

// A 2 km model: the camera has to back off to keep it in the shot.
const blimp: ModelAsset = {
  id: 'blimp', fileName: 'blimp.glb', byteSize: 1, sha256: 'f'.repeat(64),
  bounds: { min: [-200, 0, -1000], max: [200, 300, 1000] },
};

describe('auto-camera framing a custom marker', () => {
  it('frames the marker from its imported model size', () => {
    const near = getCameraAtTime([], 5, () => coords, [route], null, {});
    const far = getCameraAtTime([], 5, () => coords, [route], null, { blimp });
    expect(near?.type).toBe('jumpTo');
    expect(far?.type).toBe('jumpTo');
    if (near?.type !== 'jumpTo' || far?.type !== 'jumpTo') return;
    expect(far.zoom).toBeLessThan(near.zoom - 1);
  });
});
