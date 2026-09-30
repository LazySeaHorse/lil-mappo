import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import { undo } from '@/store/history';
import { createBoundaryItem, createCalloutItem, createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';
import { setAgentMapRef } from '../mapRef';
import { runAgentTool } from '../runner';
import { agentEvents } from '../events';
import { historyPast, resetAgentTestState, resultJson } from '../testHelpers';

const state = () => useProjectStore.getState();
const steps = () => useProjectStore.temporal.getState().pastStates.length;
const keyframes = () => {
  const cam = state().items[CAMERA_TRACK_ID];
  return cam.kind === 'camera' ? cam.keyframes : [];
};

describe('camera tools', () => {
  beforeEach(resetAgentTestState);

  it('add_camera_keyframe adds a sorted keyframe with UI defaults as one ai step', async () => {
    await runAgentTool('add_camera_keyframe', { time: 10, center: [2, 3], zoom: 5 });
    const result = await runAgentTool('add_camera_keyframe', { time: 4, center: [-9.14, 38.72], zoom: 11, pitch: 60, bearing: 20, easing: 'linear' });
    const { created } = resultJson<{ created: { id: string } }>(result);
    expect(keyframes().map((k) => k.time)).toEqual([4, 10]);
    expect(keyframes()[0]).toMatchObject({ id: created.id, easing: 'linear', followRoute: null, camera: { center: [-9.14, 38.72], zoom: 11, pitch: 60, bearing: 20, altitude: null } });
    expect(keyframes()[1]).toMatchObject({ easing: 'easeInOutCubic', camera: { pitch: 0, bearing: 0 } });
    expect(steps()).toBe(2);
    expect(historyPast()[1]).toMatchObject({ source: 'ai', label: 'AI: add camera keyframe at 4s' });
    const events = agentEvents.getLog().filter((e) => e.phase === 'succeeded');
    expect(events.at(-1)?.affectedKeyframeIds).toEqual([created.id]);
    expect(events.at(-1)?.affectedItemIds).toEqual([CAMERA_TRACK_ID]);
    undo();
    expect(keyframes()).toHaveLength(1);
  });

  it('validates keyframe input, duplicates and time range', async () => {
    await runAgentTool('add_camera_keyframe', { time: 5, center: [0, 0], zoom: 3 });
    expect(resultJson(await runAgentTool('add_camera_keyframe', { time: 5, center: [1, 1], zoom: 3 })).error).toBe('keyframe_exists');
    expect(resultJson(await runAgentTool('add_camera_keyframe', { time: 31, center: [1, 1], zoom: 3 })).error).toBe('time_out_of_range');
    expect(resultJson(await runAgentTool('add_camera_keyframe', { time: 6, center: [1, 1], zoom: 30 })).error).toBe('invalid_input');
    expect(resultJson(await runAgentTool('add_camera_keyframe', { time: 6, center: [1, 100], zoom: 3 })).error).toBe('invalid_input');
    expect(resultJson(await runAgentTool('add_camera_keyframe', { time: 6, center: [1, 1], zoom: 3, pitch: 90 })).error).toBe('invalid_input');
    expect(steps()).toBe(1);
  });

  it('warns when the user disabled the camera track', async () => {
    useProjectStore.setState({ isCameraEnabled: false });
    const body = resultJson<{ warnings: string[] }>(await runAgentTool('add_camera_keyframe', { time: 1, center: [0, 0], zoom: 3 }));
    expect(body.warnings[0]).toContain('switched off');
  });

  it('update_camera_keyframe merges camera fields and validates followRoute', async () => {
    const route = createEndpointRouteItem({ mode: 'flight', geojson: wrapGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }), start: [0, 0], end: [1, 1], name: 'r', startTime: 0 });
    state().addItem(route);
    const { created } = resultJson<{ created: { id: string } }>(await runAgentTool('add_camera_keyframe', { time: 2, center: [0, 0], zoom: 3, pitch: 40 }));
    useProjectStore.temporal.getState().clear();

    await runAgentTool('update_camera_keyframe', { id: created.id, patch: { zoom: 8, time: 3, followRoute: route.id } });
    expect(keyframes()[0]).toMatchObject({ time: 3, followRoute: route.id, camera: { zoom: 8, pitch: 40, center: [0, 0] } });
    expect(steps()).toBe(1);

    expect(resultJson(await runAgentTool('update_camera_keyframe', { id: created.id, patch: { followRoute: CAMERA_TRACK_ID } })).error).toBe('invalid_patch');
    expect(resultJson(await runAgentTool('update_camera_keyframe', { id: 'ghost', patch: { zoom: 1 } })).error).toBe('keyframe_not_found');
    expect(resultJson(await runAgentTool('update_camera_keyframe', { id: created.id, patch: {} })).error).toBe('empty_patch');
  });

  it('remove_camera_keyframe is undoable', async () => {
    const { created } = resultJson<{ created: { id: string } }>(await runAgentTool('add_camera_keyframe', { time: 2, center: [0, 0], zoom: 3 }));
    await runAgentTool('remove_camera_keyframe', { id: created.id });
    expect(keyframes()).toHaveLength(0);
    expect(historyPast().at(-1)?.label).toBe('AI: remove camera keyframe at 2s');
    undo();
    expect(keyframes()).toHaveLength(1);
  });
});

describe('frame_items', () => {
  beforeEach(resetAgentTestState);

  function mockMap(rect = { width: 1000, height: 800 }) {
    const cameraForBounds = vi.fn(() => ({ center: { lng: 10, lat: 20 }, zoom: 6.5, bearing: 0, pitch: 0 }));
    const map = { cameraForBounds, getContainer: () => ({ getBoundingClientRect: () => rect }) };
    setAgentMapRef({ current: { getMap: () => map } } as never);
    return cameraForBounds;
  }

  it('fails clearly when the map is not ready', async () => {
    const route = createEndpointRouteItem({ mode: 'car', geojson: wrapGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }), start: [0, 0], end: [1, 1], name: 'r', startTime: 0 });
    state().addItem(route);
    const result = await runAgentTool('frame_items', { itemIds: [route.id], time: 1 });
    expect(resultJson(result).error).toBe('map_not_ready');
  });

  it('fits the union bounds of routes, boundaries and callouts with aspect-aware padding', async () => {
    const cameraForBounds = mockMap({ width: 1000, height: 800 });
    const route = createEndpointRouteItem({ mode: 'car', geojson: wrapGeometry({ type: 'LineString', coordinates: [[0, 0], [4, 2]] }), start: [0, 0], end: [4, 2], name: 'r', startTime: 0 });
    const boundary = createBoundaryItem({ placeName: 'b', geojson: { type: 'Polygon', coordinates: [[[-2, -1], [1, -1], [1, 1], [-2, -1]]] }, startTime: 0 });
    const callout = createCalloutItem({ styleId: 'leader-line', content: { title: 'c' }, lngLat: [6, 3], startTime: 0 })!;
    for (const i of [route, boundary, callout]) state().addItem(i);
    useProjectStore.temporal.getState().clear();

    const result = await runAgentTool('frame_items', { itemIds: [route.id, boundary.id, callout.id], time: 5, pitch: 30, bearing: 15, padding: 50 });
    expect(result.isError).toBeUndefined();
    const [bounds, opts] = cameraForBounds.mock.calls[0] as unknown as [number[][], { padding: Record<string, number>; pitch: number; bearing: number }];
    expect(bounds).toEqual([[-2, -1], [6, 3]]);
    expect(opts).toMatchObject({ pitch: 30, bearing: 15 });
    // 1000x800 viewport, 16:9 export => export height 562.5, extra vertical padding (800-562.5)/2
    expect(opts.padding.left).toBe(50);
    expect(opts.padding.top).toBeCloseTo(50 + (800 - 562.5) / 2, 3);

    expect(keyframes()).toHaveLength(1);
    expect(keyframes()[0]).toMatchObject({ time: 5, camera: { center: [10, 20], zoom: 6.5, pitch: 30, bearing: 15 } });
    expect(steps()).toBe(1);
    expect(historyPast()[0]).toMatchObject({ source: 'ai', label: 'AI: frame 3 items at 5s' });
    const done = agentEvents.getLog().at(-1)!;
    expect(done.affectedItemIds).toEqual([CAMERA_TRACK_ID, route.id, boundary.id, callout.id]);
  });

  it('replaces a keyframe at the same time and expands single points to a minimum span', async () => {
    const cameraForBounds = mockMap();
    const callout = createCalloutItem({ styleId: 'leader-line', content: { title: 'c' }, lngLat: [6, 3], startTime: 0 })!;
    state().addItem(callout);
    await runAgentTool('frame_items', { itemIds: [callout.id], time: 5 });
    const second = resultJson<{ replacedExisting: boolean }>(await runAgentTool('frame_items', { itemIds: [callout.id], time: 5 }));
    expect(second.replacedExisting).toBe(true);
    expect(keyframes()).toHaveLength(1);
    const [bounds] = cameraForBounds.mock.calls[0] as unknown as [number[][]];
    expect(bounds[1][0] - bounds[0][0]).toBeCloseTo(0.01, 6);
  });

  it('rejects the camera track and geometry-less items', async () => {
    mockMap();
    expect(resultJson(await runAgentTool('frame_items', { itemIds: [CAMERA_TRACK_ID], time: 1 })).error).toBe('cannot_frame_camera');
    const empty = createBoundaryItem({ placeName: 'b', geojson: null, startTime: 0 });
    state().addItem(empty);
    expect(resultJson(await runAgentTool('frame_items', { itemIds: [empty.id], time: 1 })).error).toBe('no_geometry');
    expect(steps()).toBe(1);
  });
});
