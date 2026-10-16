import { create } from 'zustand';
import { toast } from 'sonner';
import { useProjectStore, type ProjectStore } from '@/store/useProjectStore';
import { track } from '@/lib/analytics';
import {
  createWalkthroughState,
  walkthroughReducer,
  type ExtraCounts,
  type MapGesture,
  type WalkthroughPlan,
  type WalkthroughAddTool,
  type WalkthroughEvent,
  type WalkthroughStage,
  type WalkthroughState,
} from './walkthroughState';

export const WALKTHROUGH_STORAGE_KEY = 'lil-mappo:quick-walkthrough:v1';
export const MOBILE_WARNING_STORAGE_KEY = 'lil-mappo:mobile-warning:v1';

export type StoredWalkthroughStatus = 'started' | 'dismissed' | 'completed';

export function readStoredStatus(): StoredWalkthroughStatus | null {
  try {
    return localStorage.getItem(WALKTHROUGH_STORAGE_KEY) as StoredWalkthroughStatus | null;
  } catch {
    return null;
  }
}

export function storeStatus(status: StoredWalkthroughStatus) {
  try {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, status);
  } catch {
    // Storage unavailable
  }
}

export function readMobileWarningStatus(): boolean {
  try {
    return localStorage.getItem(MOBILE_WARNING_STORAGE_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function storeMobileWarningStatus() {
  try {
    localStorage.setItem(MOBILE_WARNING_STORAGE_KEY, 'dismissed');
  } catch {
    // Ignore storage issues
  }
}

/** Seconds in, where the tour puts the playhead for the second camera view. */
const SECOND_VIEW_TIME = 3;

let projectStoreUnsubscribers: (() => void)[] = [];

function executeStageEntryEffects(stage: WalkthroughStage) {
  const projectStore = useProjectStore.getState();

  switch (stage) {
    case 'follow-route':
      // Inserting a route opens the inspector; keep it open if the user closed it, since the switch is there.
      projectStore.setIsInspectorOpen(true);
      break;

    case 'camera-view-second': {
      // Both views at one time would land on top of each other, so move on to a later time.
      projectStore.setPlayheadTime(Math.min(SECOND_VIEW_TIME, projectStore.duration / 2));
      // The inspector opened on the first view; it would sit over the Add menu on a phone.
      projectStore.setIsInspectorOpen(false);
      break;
    }

    case 'camera-view-rewind':
      projectStore.setIsInspectorOpen(false);
      break;

    case 'camera-view-play':
    case 'play-animation':
      projectStore.setPlayheadTime(0);
      // The timeline, with the Play button, is hidden on a phone while the inspector is open.
      projectStore.setIsInspectorOpen(false);
      break;

    case 'complete':
      useWalkthroughStore.getState().complete();
      break;
  }
}

/**
 * A project-store value the walkthrough listens to. The listener fires only
 * when the selected value changes; it sends `toEvent(value)` while the tour is
 * running and (if `stages` is set) in one of those stages. A null event is
 * skipped.
 */
interface ProjectWatch<T> {
  select: (state: ProjectStore) => T;
  stages?: WalkthroughStage[];
  toEvent: (value: T) => WalkthroughEvent | null;
}

const watch = <T,>(w: ProjectWatch<T>) => w;

function countExtras(state: ProjectStore): ExtraCounts {
  const items = Object.values(state.items);
  const camera = items.find((item) => item.kind === 'camera');
  return {
    camera: camera?.kind === 'camera' ? camera.keyframes.length : 0,
    boundary: items.filter((item) => item.kind === 'boundary').length,
    callout: items.filter((item) => item.kind === 'callout').length,
  };
}

const watchCount = (kind: keyof ExtraCounts, stages: WalkthroughStage[]) =>
  watch({
    select: (state) => countExtras(state)[kind],
    stages,
    toEvent: (count) => ({ type: 'item-count-changed', kind, count }),
  });

const PROJECT_WATCHES = [
  watchCount('camera', ['camera-view-first', 'camera-view-second']),
  watchCount('boundary', ['boundary', 'boundary-insert']),
  watchCount('callout', ['callout', 'callout-insert']),
  watch({
    select: (state) => state.playheadTime,
    stages: ['camera-view-rewind'],
    toEvent: (time) => ({ type: 'playhead-changed', time }),
  }),
  watch({
    select: (state) => Object.values(state.items).filter((item) => item.kind === 'route').length,
    stages: ['route-places', 'route-preview', 'route-insert'],
    toEvent: (count) => ({ type: 'route-count-changed', count }),
  }),
  watch({
    select: (state) => state.previewRoute !== null,
    stages: ['route-preview', 'route-insert'],
    toEvent: (hasPreview) => ({ type: 'route-preview-changed', hasPreview }),
  }),
  watch({
    select: (state) => {
      const item = state.selectedItemId ? state.items[state.selectedItemId] : undefined;
      return item?.kind === 'route' && item.autoCam?.enabled === true;
    },
    stages: ['follow-route'],
    toEvent: (enabled) => ({ type: 'follow-route-changed', enabled }),
  }),
] as ProjectWatch<unknown>[];

function startProjectSubscriptions() {
  stopProjectSubscriptions();

  projectStoreUnsubscribers = PROJECT_WATCHES.map(({ select, stages, toEvent }) =>
    useProjectStore.subscribe(select, (value) => {
      const current = useWalkthroughStore.getState();
      if (!current.isRunning) return;
      if (stages && !stages.includes(current.walkthrough.stage)) return;
      const event = toEvent(value);
      if (event) current.send(event);
    }),
  );
}

function stopProjectSubscriptions() {
  projectStoreUnsubscribers.forEach((unsub) => unsub());
  projectStoreUnsubscribers = [];
}

/** The event the Next button sends in stages that wait for an acknowledgement. */
const NEXT_EVENTS: Partial<Record<WalkthroughStage, WalkthroughEvent>> = {
  'play-animation': { type: 'play-preview-acknowledged' },
  'more-tools': { type: 'more-tools-acknowledged' },
  'camera-view-play': { type: 'camera-view-play-acknowledged' },
  'project-settings': { type: 'project-settings-acknowledged' },
};

export interface WalkthroughStore {
  isRunning: boolean;
  walkthrough: WalkthroughState;
  showMobileWarning: boolean;
  showInvitation: boolean;

  // Actions
  start: (isMobile?: boolean, plan?: WalkthroughPlan) => void;
  /** The "Keep going" button at the end of the trip tour. */
  continueToExtras: () => void;
  dismiss: () => void;
  complete: () => void;
  next: () => void;
  send: (event: WalkthroughEvent) => void;
  recordMapGesture: (gesture: MapGesture) => void;
  recordAddToolOpenChange: (tool: WalkthroughAddTool, open: boolean) => boolean;
  recordRouteEndpoints: (start: boolean, end: boolean) => void;
  recordExportOpened: () => void;
  setShowMobileWarning: (show: boolean) => void;
  setShowInvitation: (show: boolean) => void;
}

export const useWalkthroughStore = create<WalkthroughStore>((set, get) => ({
  isRunning: false,
  walkthrough: createWalkthroughState(false, 0),
  showMobileWarning: false,
  showInvitation: false,

  start: (isMobile = false, plan = 'trip') => {
    stopProjectSubscriptions();

    const initialRouteCount = Object.values(useProjectStore.getState().items).filter(
      (item) => item.kind === 'route',
    ).length;

    useProjectStore.getState().setIsInspectorOpen(false);

    set({
      showInvitation: false,
      walkthrough: createWalkthroughState(isMobile, initialRouteCount, plan, countExtras(useProjectStore.getState())),
      isRunning: true,
    });
    storeStatus('started');
    track('walkthrough_started');
    startProjectSubscriptions();
  },

  dismiss: () => {
    stopProjectSubscriptions();
    set({ isRunning: false });
    storeStatus('dismissed');
  },

  complete: () => {
    stopProjectSubscriptions();
    set({ isRunning: false });
    storeStatus('completed');
    toast.success('Tour complete. Press Export when your trip video is ready.');
  },

  next: () => {
    const stage = get().walkthrough.stage;
    const event = NEXT_EVENTS[stage];
    if (!event) return;
    if (stage === 'play-animation' || stage === 'camera-view-play') useProjectStore.getState().setIsPlaying(false);
    get().send(event);
  },

  continueToExtras: () => {
    if (get().walkthrough.stage !== 'more-tools') return;
    get().send({ type: 'extras-continued', counts: countExtras(useProjectStore.getState()) });
  },

  send: (event) => {
    const current = get().walkthrough;
    const next = walkthroughReducer(current, event);
    if (next !== current) {
      set({ walkthrough: next });
      executeStageEntryEffects(next.stage);
    }
  },

  recordMapGesture: (gesture) => {
    if (get().isRunning) {
      get().send({ type: 'map-gesture', gesture });
    }
  },

  recordAddToolOpenChange: (tool, open) => {
    if (!get().isRunning) return false;
    get().send({ type: open ? 'add-tool-opened' : 'add-tool-closed', tool });
    return true;
  },

  recordRouteEndpoints: (start, end) => {
    if (get().isRunning) {
      get().send({ type: 'route-endpoints-changed', start, end });
    }
  },

  recordExportOpened: () => {
    if (get().isRunning) {
      get().send({ type: 'export-opened' });
    }
  },

  setShowMobileWarning: (show) => set({ showMobileWarning: show }),
  setShowInvitation: (show) => set({ showInvitation: show }),
}));
