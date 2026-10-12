import { create } from 'zustand';
import { toast } from 'sonner';
import { CAMERA_TRACK_ID, useProjectStore, type ProjectStore } from '@/store/useProjectStore';
import type { CameraItem } from '@/store/types';
import { track } from '@/lib/analytics';
import {
  createWalkthroughState,
  walkthroughReducer,
  type MapGesture,
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

let layoutTimer: ReturnType<typeof setTimeout> | null = null;
let projectStoreUnsubscribers: (() => void)[] = [];

function executeStageEntryEffects(stage: WalkthroughStage) {
  const projectStore = useProjectStore.getState();

  switch (stage) {
    case 'move-playhead':
      projectStore.setIsInspectorOpen(false);
      break;

    case 'play-animation':
      projectStore.setPlayheadTime(0);
      break;

    case 'select-keyframe':
      projectStore.selectKeyframe(null);
      projectStore.setIsInspectorOpen(false);
      break;

    case 'prepare-render': {
      projectStore.setIsInspectorOpen(false);
      if (layoutTimer !== null) {
        clearTimeout(layoutTimer);
      }
      layoutTimer = setTimeout(() => {
        layoutTimer = null;
        useWalkthroughStore.getState().send({ type: 'render-layout-ready' });
      }, 350);
      break;
    }

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

const PROJECT_WATCHES = [
  watch({
    select: (state) => (state.items[CAMERA_TRACK_ID] as CameraItem | undefined)?.keyframes.length ?? 0,
    toEvent: (count) => ({
      type: 'keyframe-count-changed',
      count,
      playheadTime: useProjectStore.getState().playheadTime,
    }),
  }),
  watch({
    select: (state) => state.playheadTime,
    stages: ['move-playhead'],
    toEvent: (time) => ({ type: 'playhead-time-changed', time }),
  }),
  watch({
    select: (state) => state.selectedKeyframeId,
    stages: ['select-keyframe'],
    toEvent: (selectedKeyframeId) => (selectedKeyframeId ? { type: 'keyframe-selected' } : null),
  }),
  watch({
    select: (state) => state.mapStyle,
    stages: ['change-map-style', 'return-standard-style'],
    toEvent: (style) => ({ type: 'map-style-changed', style }),
  }),
  watch({
    select: (state) => state.projectSettingsTab,
    stages: ['map-settings-tab'],
    toEvent: (tab) => ({ type: 'project-settings-tab-changed', tab }),
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
  if (layoutTimer !== null) {
    clearTimeout(layoutTimer);
    layoutTimer = null;
  }
  projectStoreUnsubscribers.forEach((unsub) => unsub());
  projectStoreUnsubscribers = [];
}

/** The event the Next button sends in stages that wait for an acknowledgement. */
const NEXT_EVENTS: Partial<Record<WalkthroughStage, () => WalkthroughEvent>> = {
  'play-animation': () => ({ type: 'play-preview-acknowledged' }),
  'inspect-keyframe': () => ({ type: 'inspector-acknowledged' }),
  'map-settings-overview': () => ({ type: 'map-settings-overview-acknowledged' }),
  'terrain-buildings': () => ({
    type: 'terrain-intro-acknowledged',
    currentStyle: useProjectStore.getState().mapStyle,
  }),
};

export interface WalkthroughStore {
  isRunning: boolean;
  walkthrough: WalkthroughState;
  isMapStyleOpen: boolean;
  isMapToolsOpen: boolean;
  showMobileWarning: boolean;
  showInvitation: boolean;

  // Actions
  start: (isMobile?: boolean, cameraKeyframeCount?: number, usesLayerMenu?: boolean) => void;
  dismiss: () => void;
  complete: () => void;
  next: () => void;
  send: (event: WalkthroughEvent) => void;
  recordMapGesture: (gesture: MapGesture) => void;
  recordAddToolOpenChange: (tool: WalkthroughAddTool, open: boolean) => boolean;
  recordMapStyleOpenChange: (open: boolean) => void;
  recordMapToolsOpenChange: (open: boolean) => void;
  recordExportOpened: () => void;
  setShowMobileWarning: (show: boolean) => void;
  setShowInvitation: (show: boolean) => void;
}

export const useWalkthroughStore = create<WalkthroughStore>((set, get) => ({
  isRunning: false,
  walkthrough: createWalkthroughState(false, 0, false),
  isMapStyleOpen: false,
  isMapToolsOpen: false,
  showMobileWarning: false,
  showInvitation: false,

  start: (isMobile = false, cameraKeyframeCount, usesLayerMenu) => {
    stopProjectSubscriptions();

    const actualKeyframeCount =
      cameraKeyframeCount ??
      ((useProjectStore.getState().items[CAMERA_TRACK_ID] as CameraItem | undefined)?.keyframes.length ?? 0);
    const actualUsesLayerMenu = usesLayerMenu ?? isMobile;

    useProjectStore.getState().setIsInspectorOpen(false);

    set({
      showInvitation: false,
      walkthrough: createWalkthroughState(isMobile, actualKeyframeCount, actualUsesLayerMenu),
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
    toast.success('Tour complete. You can now create your map animation.');
  },

  next: () => {
    const stage = get().walkthrough.stage;
    const toEvent = NEXT_EVENTS[stage];
    if (!toEvent) return;
    if (stage === 'play-animation') useProjectStore.getState().setIsPlaying(false);
    get().send(toEvent());
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

  recordMapStyleOpenChange: (open) => {
    set({ isMapStyleOpen: open });
  },

  recordMapToolsOpenChange: (open) => {
    set({ isMapToolsOpen: open });
    if (get().isRunning && open) {
      get().send({ type: 'map-tools-opened' });
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
