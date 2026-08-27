export type MapGesture = 'pan' | 'orbit' | 'zoom';
export type WalkthroughAddTool = 'route' | 'boundary' | 'callout';

export type WalkthroughStage =
  | 'map-controls'
  | 'open-add-menu'
  | 'first-keyframe'
  | 'move-again'
  | 'move-playhead'
  | 'second-keyframe'
  | 'play-animation'
  | 'watch-animation'
  | 'select-keyframe'
  | 'inspect-keyframe'
  | 'route'
  | 'route-editor'
  | 'boundary'
  | 'boundary-editor'
  | 'callout'
  | 'callout-editor'
  | 'open-map-tools'
  | 'terrain-buildings'
  | 'change-map-style'
  | 'return-standard-style'
  | 'map-settings'
  | 'map-settings-tab'
  | 'render'
  | 'complete';

export type WalkthroughEvent =
  | { type: 'map-gesture'; gesture: MapGesture }
  | { type: 'add-menu-opened' }
  | { type: 'keyframe-count-changed'; count: number; playheadTime: number }
  | { type: 'exploration-time-elapsed' }
  | { type: 'playhead-time-changed'; time: number }
  | { type: 'playback-started' }
  | { type: 'playback-paused' }
  | { type: 'playback-finished' }
  | { type: 'keyframe-selected' }
  | { type: 'inspector-acknowledged' }
  | { type: 'map-tools-opened' }
  | { type: 'terrain-intro-acknowledged'; currentStyle: string }
  | { type: 'map-style-changed'; style: string }
  | { type: 'map-settings-opened' }
  | { type: 'project-settings-tab-changed'; tab: 'general' | 'map' }
  | { type: 'export-opened' }
  | { type: 'add-tool-opened'; tool: WalkthroughAddTool }
  | { type: 'add-tool-closed'; tool: WalkthroughAddTool };

export interface WalkthroughState {
  stage: WalkthroughStage;
  isMobile: boolean;
  usesLayerMenu: boolean;
  initialKeyframeCount: number;
  firstKeyframeTime: number | null;
  styleBeforeChange: string | null;
  gestures: Record<MapGesture, boolean>;
}

export function createWalkthroughState(
  isMobile: boolean,
  initialKeyframeCount: number,
  usesLayerMenu = isMobile,
): WalkthroughState {
  return {
    stage: 'map-controls',
    isMobile,
    usesLayerMenu,
    initialKeyframeCount,
    firstKeyframeTime: null,
    styleBeforeChange: null,
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
    return { ...state, stage: 'play-animation' };
  }

  if (state.stage === 'play-animation' && event.type === 'playback-started') {
    return { ...state, stage: 'watch-animation' };
  }

  if (state.stage === 'watch-animation' && event.type === 'playback-paused') {
    return { ...state, stage: 'play-animation' };
  }

  if (state.stage === 'watch-animation' && event.type === 'playback-finished') {
    return { ...state, stage: 'select-keyframe' };
  }

  if (state.stage === 'select-keyframe' && event.type === 'keyframe-selected') {
    return { ...state, stage: 'inspect-keyframe' };
  }

  if (state.stage === 'inspect-keyframe' && event.type === 'inspector-acknowledged') {
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
    return { ...state, stage: state.usesLayerMenu ? 'open-map-tools' : 'terrain-buildings' };
  }

  if (state.stage === 'open-map-tools' && event.type === 'map-tools-opened') {
    return { ...state, stage: 'terrain-buildings' };
  }

  if (state.stage === 'terrain-buildings' && event.type === 'terrain-intro-acknowledged') {
    return {
      ...state,
      styleBeforeChange: event.currentStyle,
      stage: 'change-map-style',
    };
  }

  if (
    state.stage === 'change-map-style' &&
    event.type === 'map-style-changed' &&
    state.styleBeforeChange !== null &&
    event.style !== state.styleBeforeChange
  ) {
    return { ...state, stage: 'return-standard-style' };
  }

  if (
    state.stage === 'return-standard-style' &&
    event.type === 'map-style-changed' &&
    event.style === 'standard'
  ) {
    return { ...state, stage: 'map-settings' };
  }

  if (state.stage === 'map-settings' && event.type === 'map-settings-opened') {
    return { ...state, stage: 'map-settings-tab' };
  }

  if (
    state.stage === 'map-settings-tab' &&
    event.type === 'project-settings-tab-changed' &&
    event.tab === 'map'
  ) {
    return { ...state, stage: 'render' };
  }

  if (state.stage === 'render' && event.type === 'export-opened') {
    return { ...state, stage: 'complete' };
  }

  return state;
}
