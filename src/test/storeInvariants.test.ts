import { validateStoreInvariants, type MinimalProjectState } from '../../e2e/fuzz/storeInvariants';

describe('validateStoreInvariants', () => {
  const healthyState: MinimalProjectState = {
    items: {
      'camera-track': {
        id: 'camera-track',
        kind: 'camera',
        keyframes: [
          { id: 'kf-1', time: 0, zoom: 3, pitch: 0, bearing: 0, center: [0, 20] },
          { id: 'kf-2', time: 10, zoom: 6, pitch: 30, bearing: 45, center: [10, 30] },
        ],
      },
      'route-1': {
        id: 'route-1',
        kind: 'route',
        startTime: 0,
        endTime: 10,
      },
    },
    itemOrder: ['camera-track', 'route-1'],
    duration: 30,
    fps: 30,
    playheadTime: 5,
    selectedItemId: 'route-1',
    selectedKeyframeId: null,
  };

  it('reports 0 violations for a healthy state', () => {
    const violations = validateStoreInvariants(healthyState);
    expect(violations).toHaveLength(0);
  });

  it('catches dangling itemOrder ID', () => {
    const state = {
      ...healthyState,
      itemOrder: ['camera-track', 'route-1', 'deleted-route-99'],
    };
    const violations = validateStoreInvariants(state);
    expect(violations.some((v) => v.path.includes('itemOrder'))).toBe(true);
  });

  it('catches item in items but missing in itemOrder', () => {
    const state = {
      ...healthyState,
      itemOrder: ['camera-track'],
    };
    const violations = validateStoreInvariants(state);
    expect(violations.some((v) => v.path.includes('itemOrder'))).toBe(true);
  });

  it('catches dangling selectedItemId', () => {
    const state = {
      ...healthyState,
      selectedItemId: 'non-existent-id',
    };
    const violations = validateStoreInvariants(state);
    expect(violations.some((v) => v.path === 'selectedItemId')).toBe(true);
  });

  it('catches invalid playheadTime', () => {
    const state = {
      ...healthyState,
      playheadTime: 45, // duration is 30
    };
    const violations = validateStoreInvariants(state);
    expect(violations.some((v) => v.path === 'playheadTime')).toBe(true);
  });

  it('catches invalid camera pitch / coordinates', () => {
    const state = {
      ...healthyState,
      cameraItem: {
        id: 'camera-track',
        keyframes: [
          { id: 'kf-1', time: 0, zoom: 3, pitch: 120, bearing: 0, center: [200, 20] },
        ],
      },
    };
    const violations = validateStoreInvariants(state);
    expect(violations.some((v) => v.path.includes('pitch'))).toBe(true);
    expect(violations.some((v) => v.path.includes('center'))).toBe(true);
  });
});
