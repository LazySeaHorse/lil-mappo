import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from './useProjectStore';
import { createProject } from './projectDocument';
import { createTransientState } from './slices/mapEnvironmentSlice';
import { createEndpointRouteItem, wrapGeometry } from './itemFactories';
import type { RouteItem } from './types';

const state = () => useProjectStore.getState();

describe('route draft (transient editor state)', () => {
  beforeEach(() => {
    useProjectStore.setState({ ...createProject(), ...createTransientState() });
    state().addItem(createEndpointRouteItem({
      id: 'r1', mode: 'car', name: 'Drive', startTime: 0,
      geojson: wrapGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }),
      start: [1, 1], end: [2, 2], startName: 'A', endName: 'B',
    }));
    useProjectStore.temporal.getState().clear();
  });

  it('starts as a copy of the saved calculation', () => {
    state().startRouteDraft('r1');
    const draft = state().routeDraft!;
    expect(draft.routeId).toBe('r1');
    expect(draft.calculation).toEqual((state().items.r1 as RouteItem).calculation);
    expect(draft.calculation).not.toBe((state().items.r1 as RouteItem).calculation);
  });

  it('changes the draft and leaves the saved route and the history alone', () => {
    const before = state().items;
    state().startRouteDraft('r1');
    state().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endName: 'C', endPoint: [3, 3] }));
    expect(state().routeDraft!.calculation).toMatchObject({ endName: 'C', endPoint: [3, 3] });
    expect(state().items).toBe(before);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('does nothing for an update without a draft or for a route that is not there', () => {
    state().updateRouteDraft((c) => c);
    state().startRouteDraft('missing');
    expect(state().routeDraft).toBeNull();
  });

  it('drops the draft', () => {
    state().startRouteDraft('r1');
    state().discardRouteDraft();
    expect(state().routeDraft).toBeNull();
  });

  it('drops the draft when its route is deleted', () => {
    state().startRouteDraft('r1');
    state().removeItem('r1');
    expect(state().routeDraft).toBeNull();
  });

  it('a new transient state has no draft', () => {
    expect(createTransientState().routeDraft).toBeNull();
  });
});
