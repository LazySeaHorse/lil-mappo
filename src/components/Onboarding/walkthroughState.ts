export type MapGesture = 'pan' | 'orbit' | 'zoom';
export type WalkthroughAddTool = 'route' | 'boundary' | 'callout';

export type WalkthroughStage =
  | 'map-controls'
  | 'open-add-menu'
  | 'first-keyframe'
  | 'move-again'
  | 'move-playhead'
  | 'second-keyframe'
  | 'route'
  | 'route-editor'
  | 'boundary'
  | 'boundary-editor'
  | 'callout'
  | 'callout-editor'
  | 'complete';

export type WalkthroughEvent =
  | { type: 'map-gesture'; gesture: MapGesture }
  | { type: 'add-menu-opened' }
  | { type: 'keyframe-count-changed'; count: number; playheadTime: number }
  | { type: 'exploration-time-elapsed' }
  | { type: 'playhead-time-changed'; time: number }
  | { type: 'add-tool-opened'; tool: WalkthroughAddTool }
  | { type: 'add-tool-closed'; tool: WalkthroughAddTool };

export interface WalkthroughState {
  stage: WalkthroughStage;
  isMobile: boolean;
  initialKeyframeCount: number;
  firstKeyframeTime: number | null;
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
    firstKeyframeTime: null,
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
    return { ...state, firstKeyframeTime: event.playheadTime, stage: 'move-again' };
  }

  if (state.stage === 'move-again' && event.type === 'exploration-time-elapsed') {
    return { ...state, stage: 'move-playhead' };
  }

  if (
    state.stage === 'move-playhead' &&
    event.type === 'playhead-time-changed' &&
    state.firstKeyframeTime !== null &&
    Math.abs(event.time - state.firstKeyframeTime) >= 0.1
  ) {
    return { ...state, stage: 'second-keyframe' };
  }

  if (
    state.stage === 'second-keyframe' &&
    event.type === 'keyframe-count-changed' &&
    event.count > state.initialKeyframeCount + 1
  ) {
    return { ...state, stage: 'route' };
  }

  if (state.stage === 'route' && event.type === 'add-tool-opened' && event.tool === 'route') {
    return { ...state, stage: 'route-editor' };
  }

  if (state.stage === 'route-editor' && event.type === 'add-tool-closed' && event.tool === 'route') {
    return { ...state, stage: 'boundary' };
  }

  if (state.stage === 'boundary' && event.type === 'add-tool-opened' && event.tool === 'boundary') {
    return { ...state, stage: 'boundary-editor' };
  }

  if (state.stage === 'boundary-editor' && event.type === 'add-tool-closed' && event.tool === 'boundary') {
    return { ...state, stage: 'callout' };
  }

  if (state.stage === 'callout' && event.type === 'add-tool-opened' && event.tool === 'callout') {
    return { ...state, stage: 'callout-editor' };
  }

  if (state.stage === 'callout-editor' && event.type === 'add-tool-closed' && event.tool === 'callout') {
    return { ...state, stage: 'complete' };
  }

  return state;
}
