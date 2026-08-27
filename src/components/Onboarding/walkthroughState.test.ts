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
    expect(
      walkthroughReducer(moved, {
        type: 'keyframe-count-changed',
        count: 5,
        playheadTime: 5,
      }).stage,
    ).toBe('route');
  });

  it('finishes after the add-tool controls have been introduced', () => {
    const initial = {
      ...createWalkthroughState(false, 0),
      stage: 'route' as const,
    };

    const complete = reduce(
      initial,
      { type: 'add-tool-opened', tool: 'route' },
      { type: 'add-tool-closed', tool: 'route' },
      { type: 'add-tool-opened', tool: 'boundary' },
      { type: 'add-tool-closed', tool: 'boundary' },
      { type: 'add-tool-opened', tool: 'callout' },
      { type: 'add-tool-closed', tool: 'callout' },
    );

    expect(complete.stage).toBe('complete');
  });
});
