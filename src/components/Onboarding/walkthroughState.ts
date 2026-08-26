export type MapGesture = 'pan' | 'orbit' | 'zoom';

export type WalkthroughStage =
  | 'map-controls'
  | 'open-add-menu'
  | 'first-keyframe'
  | 'move-again'
  | 'second-keyframe'
  | 'route'
  | 'boundary'
  | 'callout'
  | 'complete';

export type WalkthroughEvent =
  | { type: 'map-gesture'; gesture: MapGesture }
  | { type: 'add-menu-opened' }
  | { type: 'keyframe-count-changed'; count: number }
  | { type: 'route-opened' }
  | { type: 'boundary-opened' }
  | { type: 'callout-opened' };

export interface WalkthroughState {
  stage: WalkthroughStage;
  isMobile: boolean;
  initialKeyframeCount: number;
  gestures: Record<MapGesture, boolean>;
}

export function createWalkthroughState(
  isMobile: boolean,
  initialKeyframeCount: number,
): WalkthroughState {
  return {
    stage: 'map-controls',
    isMobile,
    initialKeyframeCount,
    gestures: { pan: false, orbit: false, zoom: false },
  };
}

export function walkthroughReducer(
  state: WalkthroughState,
  event: WalkthroughEvent,
): WalkthroughState {
  if (state.stage === 'map-controls' && event.type === 'map-gesture') {
    const gestures = { ...state.gestures, [event.gesture]: true };
    const hasTriedEveryGesture = Object.values(gestures).every(Boolean);

    return {
      ...state,
      gestures,
      stage: hasTriedEveryGesture
        ? state.isMobile
          ? 'open-add-menu'
          : 'first-keyframe'
        : state.stage,
    };
  }

  if (state.stage === 'open-add-menu' && event.type === 'add-menu-opened') {
    return { ...state, stage: 'first-keyframe' };
  }

  if (
    state.stage === 'first-keyframe' &&
    event.type === 'keyframe-count-changed' &&
    event.count > state.initialKeyframeCount
  ) {
    return { ...state, stage: 'move-again' };
  }

  if (state.stage === 'move-again' && event.type === 'map-gesture') {
    return { ...state, stage: 'second-keyframe' };
  }

  if (
    state.stage === 'second-keyframe' &&
    event.type === 'keyframe-count-changed' &&
    event.count > state.initialKeyframeCount + 1
  ) {
    return { ...state, stage: 'route' };
  }

  if (state.stage === 'route' && event.type === 'route-opened') {
    return { ...state, stage: 'boundary' };
  }

  if (state.stage === 'boundary' && event.type === 'boundary-opened') {
    return { ...state, stage: 'callout' };
  }

  if (state.stage === 'callout' && event.type === 'callout-opened') {
    return { ...state, stage: 'complete' };
  }

  return state;
}

