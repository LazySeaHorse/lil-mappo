import { beforeEach, describe, expect, it } from 'vitest';
import '@/annotations/styles/index';
import { useProjectStore } from '@/store/useProjectStore';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import { undo } from '@/store/history';
import {
  createBoundaryItem,
  createCalloutItem,
  createEndpointRouteItem,
  createWalkRouteItem,
  wrapGeometry,
} from '@/store/itemFactories';
import { runAgentTool } from '../runner';
import { historyPast, resetAgentTestState, resultJson } from '../testHelpers';

const state = () => useProjectStore.getState();
const steps = () => useProjectStore.temporal.getState().pastStates.length;

function seed() {
  const route = createEndpointRouteItem({
    mode: 'car', geojson: wrapGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }),
    start: [0, 0], end: [1, 1], name: 'Drive', startTime: 1, endTime: 6,
  });
  const boundary = createBoundaryItem({ placeName: 'Land', geojson: null, startTime: 0 });
  const callout = createCalloutItem({ styleId: 'topo-label', content: { title: 'Spot', subtitle: 'sub' }, lngLat: [5, 5], startTime: 2 })!;
  const walk = createWalkRouteItem({ points: [[0, 0], [0.1, 0.1]], startTime: 0 });
  for (const i of [route, boundary, callout, walk]) state().addItem(i);
  useProjectStore.temporal.getState().clear();
  return { route, boundary, callout, walk };
}

describe('update_item', () => {
  beforeEach(resetAgentTestState);

  it('deep-merges style into the existing style and is one labeled ai step', async () => {
    const { route } = seed();
    const result = await runAgentTool('update_item', { id: route.id, patch: { style: { color: '#123456', width: 9 }, name: 'Road trip' } });
    expect(result.isError).toBeUndefined();
    const item = state().items[route.id];
    expect(item).toMatchObject({ name: 'Road trip', style: { color: '#123456', width: 9, glow: true, glowWidth: 12, animationType: 'draw' } });
    expect(steps()).toBe(1);
    expect(historyPast()[0]).toMatchObject({ source: 'ai' });
    expect(historyPast()[0].label).toContain('AI: update route "Drive"');
    undo();
    expect(state().items[route.id]).toMatchObject({ name: 'Drive', style: { color: '#3b82f6', width: 4 } });
  });

  it('validates time ranges against the duration', async () => {
    const { route } = seed();
    for (const patch of [{ endTime: 31 }, { startTime: 7 }, { startTime: 3, endTime: 3 }]) {
      const result = await runAgentTool('update_item', { id: route.id, patch });
      expect(resultJson(result).error).toBe('invalid_time_range');
    }
    expect((await runAgentTool('update_item', { id: route.id, patch: { startTime: 2, endTime: 30 } })).isError).toBeUndefined();
    expect(steps()).toBe(1);
  });

  it('rejects id/kind changes, unknown fields, wrong-kind fields, empty patches and the camera track', async () => {
    const { route, boundary } = seed();
    const idChange = await runAgentTool('update_item', { id: route.id, patch: { id: 'x', kind: 'callout' } });
    expect(resultJson(idChange).error).toBe('invalid_input');
    const wrongKind = await runAgentTool('update_item', { id: route.id, patch: { placeName: 'x' } });
    expect(resultJson(wrongKind).error).toBe('invalid_patch');
    const wrongStyle = await runAgentTool('update_item', { id: boundary.id, patch: { style: { color: '#fff' } } });
    expect(resultJson(wrongStyle).error).toBe('invalid_patch');
    expect(resultJson(await runAgentTool('update_item', { id: route.id, patch: {} })).error).toBe('empty_patch');
    expect(resultJson(await runAgentTool('update_item', { id: CAMERA_TRACK_ID, patch: { startTime: 1 } })).error).toBe('use_camera_tools');
    expect(resultJson(await runAgentTool('update_item', { id: 'missing', patch: { startTime: 1 } })).error).toBe('item_not_found');
    expect(steps()).toBe(0);
  });

  it('rebuilds walk geometry from new points and applies vehicle changes', async () => {
    const { walk, route } = seed();
    await runAgentTool('update_item', { id: walk.id, patch: { points: [[0, 0], [0.5, 0.5], [1, 0]], curved: false } });
    const updated = state().items[walk.id];
    expect(updated.kind === 'route' && updated.calculation).toMatchObject({ mode: 'walk', curved: false });
    expect(updated.kind === 'route' && updated.calculation?.mode === 'walk' && updated.calculation.points).toHaveLength(3);
    expect(steps()).toBe(1);

    const notWalk = await runAgentTool('update_item', { id: route.id, patch: { points: [[0, 0], [1, 1]] } });
    expect(resultJson(notWalk).error).toBe('invalid_patch');

    await runAgentTool('update_item', { id: route.id, patch: { vehicle: { type: 'car', scale: 2 } } });
    const r = state().items[route.id];
    expect(r.kind === 'route' && r.calculation?.vehicle).toMatchObject({ type: 'car', scale: 2, enabled: true });
  });

  it('updates callouts: content merge, style switch resets settings, invalid settings rejected', async () => {
    const { callout } = seed();
    await runAgentTool('update_item', { id: callout.id, patch: { content: { title: 'New' }, anchor: 'left', altitude: 10 } });
    const c1 = state().items[callout.id];
    expect(c1).toMatchObject({ content: { title: 'New', subtitle: 'sub' }, anchor: 'left', binding: { lngLat: [5, 5], altitude: 10 } });

    await runAgentTool('update_item', { id: callout.id, patch: { styleId: 'modern-pill' } });
    expect(state().items[callout.id]).toMatchObject({ styleId: 'modern-pill' });

    const bad = await runAgentTool('update_item', { id: callout.id, patch: { styleId: 'nope' } });
    expect(resultJson(bad).error).toBe('unknown_style');
    const notForCallout = await runAgentTool('update_item', { id: callout.id, patch: { easing: 'linear' } });
    expect(resultJson(notForCallout).error).toBe('invalid_patch');
  });
});

describe('remove / duplicate / reorder', () => {
  beforeEach(resetAgentTestState);

  it('remove_item is undoable and refuses the camera track', async () => {
    const { route } = seed();
    const result = await runAgentTool('remove_item', { id: route.id });
    expect(result.isError).toBeUndefined();
    expect(state().items[route.id]).toBeUndefined();
    expect(steps()).toBe(1);
    expect(historyPast()[0]).toMatchObject({ source: 'ai', label: 'AI: remove route "Drive"' });
    undo();
    expect(state().items[route.id]).toBeDefined();
    expect(resultJson(await runAgentTool('remove_item', { id: CAMERA_TRACK_ID })).error).toBe('use_camera_tools');
  });

  it('duplicate_item returns the new id as one ai step', async () => {
    const { boundary } = seed();
    const body = resultJson<{ created: { id: string; placeName: string } }>(await runAgentTool('duplicate_item', { id: boundary.id }));
    expect(body.created.placeName).toBe('Land Copy');
    expect(state().itemOrder.at(-1)).toBe(body.created.id);
    expect(steps()).toBe(1);
    expect(historyPast()[0].source).toBe('ai');
  });

  it('reorder_items requires a permutation', async () => {
    const { route, boundary } = seed();
    const order = state().itemOrder;
    const reversed = [...order].reverse();
    expect((await runAgentTool('reorder_items', { itemOrder: reversed })).isError).toBeUndefined();
    expect(state().itemOrder).toEqual(reversed);
    expect(steps()).toBe(1);

    for (const bad of [order.slice(1), [...order, 'ghost'], [...order.slice(1), order[1]], [route.id, boundary.id]]) {
      const result = await runAgentTool('reorder_items', { itemOrder: bad });
      expect(resultJson(result).error).toBe('not_a_permutation');
    }
    expect(steps()).toBe(1);
  });
});
