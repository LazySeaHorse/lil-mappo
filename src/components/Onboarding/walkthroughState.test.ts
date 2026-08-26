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

  it('requires a new view between the two new keyframes', () => {
    const ready = reduce(
      createWalkthroughState(false, 3),
      gesture('pan'),
      gesture('orbit'),
      gesture('zoom'),
    );
    const firstSaved = walkthroughReducer(ready, {
      type: 'keyframe-count-changed',
      count: 4,
    });

    expect(firstSaved.stage).toBe('move-again');
    expect(
      walkthroughReducer(firstSaved, {
        type: 'keyframe-count-changed',
        count: 5,
      }).stage,
    ).toBe('move-again');

    const moved = walkthroughReducer(firstSaved, gesture('pan'));
    expect(moved.stage).toBe('second-keyframe');
    expect(
      walkthroughReducer(moved, {
        type: 'keyframe-count-changed',
        count: 5,
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
      { type: 'route-opened' },
      { type: 'boundary-opened' },
      { type: 'callout-opened' },
    );

    expect(complete.stage).toBe('complete');
  });
});

