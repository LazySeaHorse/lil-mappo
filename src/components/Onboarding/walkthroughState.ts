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
  | 'camera-view-first'
  | 'camera-view-second'
  | 'camera-view-play'
  | 'boundary'
  | 'callout'
  | 'project-settings'
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
  | { type: 'extras-continued'; counts: ExtraCounts }
  | { type: 'item-count-changed'; kind: keyof ExtraCounts; count: number }
  | { type: 'camera-view-play-acknowledged' }
  | { type: 'project-settings-acknowledged' }
  | { type: 'export-opened' };

/** How many camera views, boundaries and callouts the project holds. */
export interface ExtraCounts {
  camera: number;
  boundary: number;
  callout: number;
}

/**
 * `trip` is the first trip video. `trip+extras` goes on to camera views, a border and a
 * callout when the user chooses to keep going. `extras` is that second act on its own.
 */
export type WalkthroughPlan = 'trip' | 'trip+extras' | 'extras';

export interface WalkthroughState {
  plan: WalkthroughPlan;
  /** Counts when the second act began; a larger count means the user added one. */
  extraBaseline: ExtraCounts;
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

const NO_EXTRAS: ExtraCounts = { camera: 0, boundary: 0, callout: 0 };

export function createWalkthroughState(
  isMobile: boolean,
  initialRouteCount: number,
  plan: WalkthroughPlan = 'trip',
  extraBaseline: ExtraCounts = NO_EXTRAS,
): WalkthroughState {
  return {
    plan,
    extraBaseline,
    stage: plan === 'extras' ? 'camera-view-first' : 'map-controls',
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

  if (state.stage === 'more-tools' && event.type === 'extras-continued') {
    return { ...state, plan: 'trip+extras', extraBaseline: event.counts, stage: 'camera-view-first' };
  }

  if (event.type === 'item-count-changed') {
    const added = event.count - state.extraBaseline[event.kind];
    if (state.stage === 'camera-view-first' && event.kind === 'camera' && added >= 1) {
      return { ...state, stage: 'camera-view-second' };
    }
    if (state.stage === 'camera-view-second' && event.kind === 'camera' && added >= 2) {
      return { ...state, stage: 'camera-view-play' };
    }
    if (state.stage === 'boundary' && event.kind === 'boundary' && added >= 1) {
      return { ...state, stage: 'callout' };
    }
    if (state.stage === 'callout' && event.kind === 'callout' && added >= 1) {
      return { ...state, stage: 'project-settings' };
    }
    return state;
  }

  if (state.stage === 'camera-view-play' && event.type === 'camera-view-play-acknowledged') {
    return { ...state, stage: 'boundary' };
  }

  if (state.stage === 'project-settings' && event.type === 'project-settings-acknowledged') {
    return { ...state, stage: 'render' };
  }

  if (state.stage === 'render' && event.type === 'export-opened') {
    return { ...state, stage: 'complete' };
  }

  return state;
}
