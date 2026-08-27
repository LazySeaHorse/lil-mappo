import {
  createWalkthroughState,
  walkthroughReducer,
  type MapGesture,
  type WalkthroughEvent,
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

describe('quick walkthrough progression', () => {
  it('waits until pan, orbit, and zoom have all been tried', () => {
    const initial = createWalkthroughState(false, 0);
    const partial = reduce(initial, gesture('pan'), gesture('zoom'));

    expect(partial.stage).toBe('map-controls');
    expect(reduce(partial, gesture('orbit')).stage).toBe('first-keyframe');
  });

  it('opens the mobile add tray before highlighting the keyframe control', () => {
    const afterGestures = reduce(
      createWalkthroughState(true, 0),
      gesture('pan'),
      gesture('orbit'),
      gesture('zoom'),
    );

    expect(afterGestures.stage).toBe('open-add-menu');
    expect(
      walkthroughReducer(afterGestures, { type: 'add-menu-opened' }).stage,
    ).toBe('first-keyframe');
  });

  it('allows exploration, then requires the playhead to move before the second keyframe', () => {
    const ready = reduce(
      createWalkthroughState(false, 3),
      gesture('pan'),
      gesture('orbit'),
      gesture('zoom'),
    );
    const firstSaved = walkthroughReducer(ready, {
      type: 'keyframe-count-changed',
      count: 4,
      playheadTime: 0,
    });

    expect(firstSaved.stage).toBe('move-again');
    expect(
      walkthroughReducer(firstSaved, {
        type: 'keyframe-count-changed',
        count: 5,
        playheadTime: 0,
      }).stage,
    ).toBe('move-again');

    const explored = walkthroughReducer(firstSaved, { type: 'exploration-time-elapsed' });
    expect(explored.stage).toBe('move-playhead');
    expect(
      walkthroughReducer(explored, { type: 'playhead-time-changed', time: 0.05 }).stage,
    ).toBe('move-playhead');

    const moved = walkthroughReducer(explored, { type: 'playhead-time-changed', time: 5 });
    expect(moved.stage).toBe('second-keyframe');
    const secondSaved = walkthroughReducer(moved, {
      type: 'keyframe-count-changed',
      count: 5,
      playheadTime: 5,
    });
    expect(secondSaved.stage).toBe('play-animation');

    const inspecting = reduce(
      secondSaved,
      { type: 'play-preview-acknowledged' },
      { type: 'keyframe-selected' },
    );
    expect(inspecting.stage).toBe('inspect-keyframe');
    expect(
      walkthroughReducer(inspecting, { type: 'inspector-acknowledged' }).stage,
    ).toBe('route');
  });

  it('continues from add tools through map styling, settings, and export', () => {
    const initial = {
      ...createWalkthroughState(false, 0),
      stage: 'route' as const,
    };

    const mapTools = reduce(
      initial,
      { type: 'add-tool-opened', tool: 'route' },
      { type: 'add-tool-closed', tool: 'route' },
      { type: 'add-tool-opened', tool: 'boundary' },
      { type: 'add-tool-closed', tool: 'boundary' },
      { type: 'add-tool-opened', tool: 'callout' },
      { type: 'add-tool-closed', tool: 'callout' },
    );

    expect(mapTools.stage).toBe('terrain-buildings');

    const complete = reduce(
      mapTools,
      { type: 'terrain-intro-acknowledged', currentStyle: 'standard' },
      { type: 'map-style-changed', style: 'dark' },
      { type: 'map-style-changed', style: 'standard' },
      { type: 'map-settings-opened' },
      { type: 'project-settings-tab-changed', tab: 'map' },
      { type: 'export-opened' },
    );

    expect(complete.stage).toBe('complete');
  });

  it('opens compact layer controls before introducing terrain and buildings', () => {
    const calloutEditor = {
      ...createWalkthroughState(false, 0, true),
      stage: 'callout-editor' as const,
    };

    const closed = walkthroughReducer(calloutEditor, {
      type: 'add-tool-closed',
      tool: 'callout',
    });
    expect(closed.stage).toBe('open-map-tools');
    expect(walkthroughReducer(closed, { type: 'map-tools-opened' }).stage).toBe(
      'terrain-buildings',
    );
  });
});
