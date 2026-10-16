import {
  createWalkthroughState,
  walkthroughReducer,
  type MapGesture,
  type WalkthroughEvent,
  type WalkthroughStage,
  type WalkthroughState,
} from './walkthroughState';

function reduce(
  state: WalkthroughState,
  ...events: WalkthroughEvent[]
): WalkthroughState {
  return events.reduce(walkthroughReducer, state);
}

const gesture = (value: MapGesture): WalkthroughEvent => ({
  type: 'map-gesture',
  gesture: value,
});

const at = (stage: WalkthroughStage, isMobile = false, initialRouteCount = 0): WalkthroughState => ({
  ...createWalkthroughState(isMobile, initialRouteCount),
  stage,
});

const endpoints = (start: boolean, end: boolean): WalkthroughEvent => ({
  type: 'route-endpoints-changed',
  start,
  end,
});

describe('quick walkthrough progression', () => {
  it('waits until pan, orbit, and zoom have all been tried', () => {
    const initial = createWalkthroughState(false, 0);
    const partial = reduce(initial, gesture('pan'), gesture('zoom'));

    expect(partial.stage).toBe('map-controls');
    expect(reduce(partial, gesture('orbit')).stage).toBe('route');
  });

  it('opens the mobile add tray before highlighting Plan Route', () => {
    const afterGestures = reduce(
      createWalkthroughState(true, 0),
      gesture('pan'),
      gesture('orbit'),
      gesture('zoom'),
    );

    expect(afterGestures.stage).toBe('open-add-menu');
    expect(
      walkthroughReducer(afterGestures, { type: 'add-menu-opened' }).stage,
    ).toBe('route');
  });

  it('follows one trip from Plan Route to export, one real action at a time', () => {
    let state = at('route');

    state = walkthroughReducer(state, { type: 'add-tool-opened', tool: 'route' });
    expect(state.stage).toBe('route-places');

    state = reduce(state, endpoints(true, false));
    expect(state.stage).toBe('route-places');
    expect(state.routeEndpoints).toEqual({ start: true, end: false });
    state = reduce(state, endpoints(true, true));
    expect(state.stage).toBe('route-preview');

    state = walkthroughReducer(state, { type: 'route-preview-changed', hasPreview: true });
    expect(state.stage).toBe('route-insert');

    state = walkthroughReducer(state, { type: 'route-count-changed', count: 1 });
    expect(state.stage).toBe('follow-route');

    state = walkthroughReducer(state, { type: 'follow-route-changed', enabled: true });
    expect(state.stage).toBe('play-animation');

    state = walkthroughReducer(state, { type: 'play-preview-acknowledged' });
    expect(state.stage).toBe('more-tools');

    state = walkthroughReducer(state, { type: 'more-tools-acknowledged' });
    expect(state.stage).toBe('render');

    expect(walkthroughReducer(state, { type: 'export-opened' }).stage).toBe('complete');
  });

  it('does not move on when the wrong thing happens', () => {
    expect(walkthroughReducer(at('route'), { type: 'add-tool-opened', tool: 'boundary' }).stage).toBe('route');
    expect(walkthroughReducer(at('route-preview'), { type: 'route-count-changed', count: 0 }).stage).toBe('route-preview');
    expect(walkthroughReducer(at('follow-route'), { type: 'follow-route-changed', enabled: false }).stage).toBe('follow-route');
    expect(walkthroughReducer(at('render'), { type: 'play-preview-acknowledged' }).stage).toBe('render');
  });

  it('skips the endpoint steps when both places are already set', () => {
    const state = reduce(at('route'), endpoints(true, true), { type: 'add-tool-opened', tool: 'route' });
    expect(state.stage).toBe('route-preview');
  });

  it('forgets a place the user clears', () => {
    const state = reduce(at('route-places'), endpoints(true, false), endpoints(false, false));
    expect(state.routeEndpoints).toEqual({ start: false, end: false });
    expect(reduce(state, endpoints(false, true)).stage).toBe('route-places');
  });

  it('goes back to the preview step when the preview goes away', () => {
    expect(walkthroughReducer(at('route-insert'), { type: 'route-preview-changed', hasPreview: false }).stage).toBe(
      'route-preview',
    );
  });

  it('goes back to Plan Route when the panel closes before the route is added', () => {
    for (const stage of ['route-places', 'route-preview', 'route-insert'] as const) {
      expect(walkthroughReducer(at(stage), { type: 'add-tool-closed', tool: 'route' }).stage).toBe('route');
    }
    // Closing it after the route exists is the normal end of the panel.
    expect(walkthroughReducer(at('follow-route'), { type: 'add-tool-closed', tool: 'route' }).stage).toBe('follow-route');
  });

  it('moves on when a route is added another way, such as a walk path or an import', () => {
    for (const stage of ['route-places', 'route-preview', 'route-insert'] as const) {
      expect(walkthroughReducer(at(stage, false, 2), { type: 'route-count-changed', count: 3 }).stage).toBe('follow-route');
    }
    expect(walkthroughReducer(at('route-places', false, 2), { type: 'route-count-changed', count: 2 }).stage).toBe(
      'route-places',
    );
  });

  it('goes on to camera views, a border and a callout only when the user chooses to', () => {
    const counts = { camera: 1, boundary: 0, callout: 0 };
    const count = (kind: 'camera' | 'boundary' | 'callout', n: number): WalkthroughEvent => ({ type: 'item-count-changed', kind, count: n });

    expect(reduce(at('more-tools'), { type: 'more-tools-acknowledged' }).stage).toBe('render');

    let state = reduce(at('more-tools'), { type: 'extras-continued', counts });
    expect(state.plan).toBe('trip+extras');
    expect(state.stage).toBe('camera-view-first');

    state = reduce(state, count('camera', 1));
    expect(state.stage).toBe('camera-view-first');
    state = reduce(state, count('camera', 2));
    expect(state.stage).toBe('camera-view-second');
    state = reduce(state, count('camera', 3));
    expect(state.stage).toBe('camera-view-play');
    state = reduce(state, { type: 'camera-view-play-acknowledged' });
    expect(state.stage).toBe('boundary');
    state = reduce(state, count('callout', 1));
    expect(state.stage).toBe('boundary');
    state = reduce(state, count('boundary', 1));
    expect(state.stage).toBe('callout');
    state = reduce(state, count('callout', 1));
    expect(state.stage).toBe('project-settings');
    state = reduce(state, { type: 'project-settings-acknowledged' });
    expect(state.stage).toBe('render');
  });

  it('starts the second act on its own from the menu', () => {
    expect(createWalkthroughState(false, 0, 'extras').stage).toBe('camera-view-first');
  });
});
