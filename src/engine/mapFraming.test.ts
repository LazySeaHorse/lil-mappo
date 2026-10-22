import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MapboxMap } from 'mapbox-gl';
import { PANEL_GAP, PANEL_MARGIN, RIGHT_RESERVED_DESKTOP } from '@/constants/layout';
import { useProjectStore } from '@/store/useProjectStore';
import { beginGesture, endGesture } from '@/store/history';
import { canMoveCamera, frameBox, moveToCamera, frameGeometry, frameModel, framePadding, framePoint, withMinimumSpan, zoomForMeters } from './mapFraming';

const desktop = { isMobile: false, isTablet: false };

function fakeMap({ width = 1200, height = 800, zoom = 5, projected = { x: 600, y: 400 } } = {}) {
  const map = {
    getContainer: () => ({ getBoundingClientRect: () => ({ width, height }) }),
    getZoom: () => zoom,
    project: vi.fn(() => projected),
    fitBounds: vi.fn(),
    easeTo: vi.fn(),
  };
  return { map, api: map as unknown as MapboxMap };
}

beforeEach(() => {
  useProjectStore.setState({ isPlaying: false, isScrubbing: false, isExporting: false, isInspectorOpen: false, timelineHeight: 200 });
});
afterEach(() => endGesture());

describe('framePadding', () => {
  it('clears the toolbar on top and the timeline below', () => {
    const pad = framePadding({ width: 1200, height: 800 }, desktop, { isInspectorOpen: false, timelineHeight: 200 });
    expect(pad.top).toBe(PANEL_MARGIN + 56 + PANEL_GAP);
    expect(pad.bottom).toBe(200 + PANEL_MARGIN + PANEL_GAP);
    expect(pad.left).toBe(PANEL_MARGIN);
    expect(pad.right).toBe(PANEL_MARGIN);
  });

  it('reserves the inspector on the right', () => {
    const pad = framePadding({ width: 1200, height: 800 }, desktop, { isInspectorOpen: true, timelineHeight: 200 });
    expect(pad.right).toBe(RIGHT_RESERVED_DESKTOP);
  });

  it('never lets padding swallow a small map', () => {
    const pad = framePadding({ width: 500, height: 300 }, desktop, { isInspectorOpen: true, timelineHeight: 200 });
    expect(pad.top + pad.bottom).toBeLessThanOrEqual(300 * 0.7 + 1e-6);
    expect(pad.left + pad.right).toBeLessThanOrEqual(500 * 0.7 + 1e-6);
  });

  it('gives half the screen to the inspector drawer on phones', () => {
    const pad = framePadding({ width: 390, height: 800 }, { isMobile: true, isTablet: false }, { isInspectorOpen: true, timelineHeight: 200 });
    expect(pad.bottom).toBeGreaterThan(300);
  });
});

describe('withMinimumSpan', () => {
  it('widens a point to a small area and keeps larger boxes', () => {
    expect(withMinimumSpan([1, 2, 1, 2], 0.02)).toEqual([0.99, 1.99, 1.01, 2.01]);
    expect(withMinimumSpan([0, 0, 5, 5])).toEqual([0, 0, 5, 5]);
  });
});

describe('canMoveCamera', () => {
  it('is false while playing, scrubbing, exporting or dragging', () => {
    expect(canMoveCamera()).toBe(true);
    for (const key of ['isPlaying', 'isScrubbing', 'isExporting'] as const) {
      useProjectStore.setState({ [key]: true });
      expect(canMoveCamera()).toBe(false);
      useProjectStore.setState({ [key]: false });
    }
    beginGesture();
    expect(canMoveCamera()).toBe(false);
  });
});

describe('frameBox', () => {
  it('fits the box with panel padding', () => {
    const { map, api } = fakeMap();
    expect(frameBox(api, [0, 0, 10, 10], desktop)).toBe(true);
    expect(map.fitBounds).toHaveBeenCalledWith([[0, 0], [10, 10]], expect.objectContaining({
      padding: expect.objectContaining({ top: 88 }),
      maxZoom: 16,
    }));
  });

  it('does not leave the panel padding on the camera', () => {
    const { map, api } = fakeMap();
    frameBox(api, [0, 0, 10, 10], desktop);
    expect(map.fitBounds.mock.calls[0][1]).toMatchObject({ retainPadding: false });
  });

  it('does not move while playing', () => {
    const { map, api } = fakeMap();
    useProjectStore.setState({ isPlaying: true });
    expect(frameBox(api, [0, 0, 10, 10], desktop)).toBe(false);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });
});

describe('frameModel', () => {
  it('measures zoom from metres on screen, a level per halving', () => {
    // At zoom 0 the 512 px world is one equator wide.
    expect(zoomForMeters(2 * Math.PI * 6378137, 512, 0)).toBeCloseTo(0);
    expect(zoomForMeters(100, 200, 45) - zoomForMeters(200, 200, 45)).toBeCloseTo(1);
  });

  it('zooms in on a small model and out for a big one, centred in the free area', () => {
    const { map, api } = fakeMap({ zoom: 3 });
    expect(frameModel(api, [2.35, 48.85], 100, desktop)).toBe(true);
    const near = map.easeTo.mock.calls[0][0];
    expect(near.center).toEqual([2.35, 48.85]);
    expect(near.zoom).toBeGreaterThan(15);
    expect(near.zoom).toBeLessThan(18);
    frameModel(api, [2.35, 48.85], 5000, desktop);
    expect(map.easeTo.mock.calls[1][0].zoom).toBeCloseTo(near.zoom - Math.log2(50));
  });

  it('stays below the closest zoom for a tiny model, and leaves the camera alone while playing', () => {
    const { map, api } = fakeMap();
    frameModel(api, [0, 0], 0.01, desktop);
    expect(map.easeTo.mock.calls[0][0].zoom).toBe(20);
    useProjectStore.setState({ isPlaying: true });
    expect(frameModel(api, [0, 0], 100, desktop)).toBe(false);
    expect(map.easeTo).toHaveBeenCalledTimes(1);
  });
});

describe('framePoint', () => {
  it('stays put when the point is well inside the free area', () => {
    const { map, api } = fakeMap({ projected: { x: 500, y: 350 } });
    expect(framePoint(api, [1, 2], desktop)).toBe(false);
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it('eases to a point that is off screen and zooms in to a city view', () => {
    const { map, api } = fakeMap({ zoom: 3, projected: { x: 5000, y: 400 } });
    expect(framePoint(api, [1, 2], desktop)).toBe(true);
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [1, 2], zoom: 12 }));
  });

  it('eases to a point hidden under a panel, keeping a closer zoom', () => {
    // y = 20 is under the toolbar.
    const { map, api } = fakeMap({ zoom: 15, projected: { x: 600, y: 20 } });
    expect(framePoint(api, [1, 2], desktop)).toBe(true);
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 15 }));
  });

  it('does not leave padding on the camera', () => {
    const { map, api } = fakeMap({ projected: { x: 5000, y: 400 } });
    framePoint(api, [1, 2], desktop);
    expect(map.easeTo.mock.calls[0][0]).not.toHaveProperty('padding');
  });
});

describe('frameGeometry', () => {
  it('fits the bounds of a route', () => {
    const { map, api } = fakeMap();
    const route: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-74, 40], [-73, 41]] } }],
    };
    expect(frameGeometry(api, route, desktop)).toBe(true);
    expect(map.fitBounds).toHaveBeenCalledWith([[-74, 40], [-73, 41]], expect.anything());
  });

  it('treats a lone point as a point', () => {
    const { map, api } = fakeMap({ projected: { x: 5000, y: 10 } });
    frameGeometry(api, { type: 'Point', coordinates: [3, 4] }, desktop);
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.easeTo).toHaveBeenCalled();
  });

  it('does nothing for empty geometry', () => {
    const { map, api } = fakeMap();
    expect(frameGeometry(api, { type: 'FeatureCollection', features: [] }, desktop)).toBe(false);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });
});

describe('moveToCamera', () => {
  const view = { center: [8, 46] as [number, number], zoom: 9, pitch: 40, bearing: 120 };

  it('eases the map to the camera with no panel offset', () => {
    const { map, api } = fakeMap();
    expect(moveToCamera(api, view)).toBe(true);
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining(view));
    expect(map.easeTo.mock.calls[0][0]).not.toHaveProperty('padding');
    expect(map.easeTo.mock.calls[0][0]).not.toHaveProperty('offset');
  });

  it('does not move while playing, scrubbing, exporting or dragging', () => {
    const { map, api } = fakeMap();
    for (const key of ['isPlaying', 'isScrubbing', 'isExporting'] as const) {
      useProjectStore.setState({ [key]: true });
      expect(moveToCamera(api, view)).toBe(false);
      useProjectStore.setState({ [key]: false });
    }
    beginGesture();
    expect(moveToCamera(api, view)).toBe(false);
    expect(map.easeTo).not.toHaveBeenCalled();
  });
});
