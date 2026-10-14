export type MapGesture = 'pan' | 'orbit' | 'zoom';
export type WalkthroughAddTool = 'route' | 'boundary' | 'callout';

/**
 * The tour has one goal: make a first trip video. The user plans a route, makes the
 * camera follow it, plays it and finds Export.
 */
export type WalkthroughStage =
  | 'map-controls'
  | 'open-add-menu'
  | 'route'
  | 'route-places'
  | 'route-preview'
  | 'route-insert'
  | 'follow-route'
  | 'play-animation'
  | 'more-tools'
  | 'render'
  | 'complete';

export type WalkthroughEvent =
  | { type: 'map-gesture'; gesture: MapGesture }
  | { type: 'add-menu-opened' }
  | { type: 'add-tool-opened'; tool: WalkthroughAddTool }
  | { type: 'add-tool-closed'; tool: WalkthroughAddTool }
  | { type: 'route-endpoints-changed'; start: boolean; end: boolean }
  | { type: 'route-preview-changed'; hasPreview: boolean }
  | { type: 'route-count-changed'; count: number }
  | { type: 'follow-route-changed'; enabled: boolean }
  | { type: 'play-preview-acknowledged' }
  | { type: 'more-tools-acknowledged' }
  | { type: 'export-opened' };

export interface WalkthroughState {
  stage: WalkthroughStage;
  isMobile: boolean;
  /** Routes in the project when the tour started; a larger count means the user added one. */
  initialRouteCount: number;
  /** Whether Plan Route has a start and an end place. */
  routeEndpoints: { start: boolean; end: boolean };
  gestures: Record<MapGesture, boolean>;
}

/** Stages in which the Plan Route panel is open and waits for the user to finish the route. */
const ROUTE_PANEL_STAGES: readonly WalkthroughStage[] = ['route-places', 'route-preview', 'route-insert'];

export function createWalkthroughState(isMobile: boolean, initialRouteCount: number): WalkthroughState {
  return {
    stage: 'map-controls',
    isMobile,
    initialRouteCount,
    routeEndpoints: { start: false, end: false },
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
          : 'route'
        : state.stage,
    };
  }

  if (state.stage === 'open-add-menu' && event.type === 'add-menu-opened') {
    return { ...state, stage: 'route' };
  }

  if (event.type === 'route-endpoints-changed') {
    const routeEndpoints = { start: event.start, end: event.end };
    const complete = event.start && event.end;
    return {
      ...state,
      routeEndpoints,
      stage: state.stage === 'route-places' && complete ? 'route-preview' : state.stage,
    };
  }

  if (state.stage === 'route' && event.type === 'add-tool-opened' && event.tool === 'route') {
    const { start, end } = state.routeEndpoints;
    return { ...state, stage: start && end ? 'route-preview' : 'route-places' };
  }

  if (event.type === 'add-tool-closed' && event.tool === 'route' && ROUTE_PANEL_STAGES.includes(state.stage)) {
    return { ...state, stage: 'route' };
  }

  if (event.type === 'route-count-changed' && ROUTE_PANEL_STAGES.includes(state.stage)) {
    return event.count > state.initialRouteCount ? { ...state, stage: 'follow-route' } : state;
  }

  if (state.stage === 'route-preview' && event.type === 'route-preview-changed' && event.hasPreview) {
    return { ...state, stage: 'route-insert' };
  }

  if (state.stage === 'route-insert' && event.type === 'route-preview-changed' && !event.hasPreview) {
    return { ...state, stage: 'route-preview' };
  }

  if (state.stage === 'follow-route' && event.type === 'follow-route-changed' && event.enabled) {
    return { ...state, stage: 'play-animation' };
  }

  if (state.stage === 'play-animation' && event.type === 'play-preview-acknowledged') {
    return { ...state, stage: 'more-tools' };
  }

  if (state.stage === 'more-tools' && event.type === 'more-tools-acknowledged') {
    return { ...state, stage: 'render' };
  }

  if (state.stage === 'render' && event.type === 'export-opened') {
    return { ...state, stage: 'complete' };
  }

  return state;
}
