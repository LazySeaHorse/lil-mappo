import { create } from 'zustand';
import { toast } from 'sonner';
import { CAMERA_TRACK_ID, useProjectStore } from '@/store/useProjectStore';
import type { CameraItem } from '@/store/types';
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

function startProjectSubscriptions() {
  stopProjectSubscriptions();

  projectStoreUnsubscribers = [
    // 1. Camera keyframe count changes
    useProjectStore.subscribe(
      (state) => {
        const camera = state.items[CAMERA_TRACK_ID] as CameraItem | undefined;
        return camera?.keyframes.length ?? 0;
      },
      (count, prevCount) => {
        if (count === prevCount) return;
        const current = useWalkthroughStore.getState();
        if (current.isRunning) {
          const playheadTime = useProjectStore.getState().playheadTime;
          current.send({ type: 'keyframe-count-changed', count, playheadTime });
        }
      },
    ),

    // 2. Playhead time changes during move-playhead stage
    useProjectStore.subscribe(
      (state) => state.playheadTime,
      (time, prevTime) => {
        if (time === prevTime) return;
        const current = useWalkthroughStore.getState();
        if (current.isRunning && current.walkthrough.stage === 'move-playhead') {
          current.send({ type: 'playhead-time-changed', time });
        }
      },
    ),

    // 3. Keyframe selection during select-keyframe stage
    useProjectStore.subscribe(
      (state) => state.selectedKeyframeId,
      (selectedKeyframeId) => {
        const current = useWalkthroughStore.getState();
        if (current.isRunning && current.walkthrough.stage === 'select-keyframe' && selectedKeyframeId) {
          current.send({ type: 'keyframe-selected' });
        }
      },
    ),

    // 4. Map style changes during change-map-style or return-standard-style stages
    useProjectStore.subscribe(
      (state) => state.mapStyle,
      (style, prevStyle) => {
        if (style === prevStyle) return;
        const current = useWalkthroughStore.getState();
        if (
          current.isRunning &&
          (current.walkthrough.stage === 'change-map-style' ||
            current.walkthrough.stage === 'return-standard-style')
        ) {
          current.send({ type: 'map-style-changed', style });
        }
      },
    ),

    // 5. Project settings tab changes during map-settings-tab stage
    useProjectStore.subscribe(
      (state) => state.projectSettingsTab,
      (tab, prevTab) => {
        if (tab === prevTab) return;
        const current = useWalkthroughStore.getState();
        if (current.isRunning && current.walkthrough.stage === 'map-settings-tab') {
          current.send({ type: 'project-settings-tab-changed', tab });
        }
      },
    ),
  ];
}

function stopProjectSubscriptions() {
  if (layoutTimer !== null) {
    clearTimeout(layoutTimer);
    layoutTimer = null;
  }
  projectStoreUnsubscribers.forEach((unsub) => unsub());
  projectStoreUnsubscribers = [];
}

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
    if (stage === 'play-animation') {
      useProjectStore.getState().setIsPlaying(false);
      get().send({ type: 'play-preview-acknowledged' });
    } else if (stage === 'inspect-keyframe') {
      get().send({ type: 'inspector-acknowledged' });
    } else if (stage === 'map-settings-overview') {
      get().send({ type: 'map-settings-overview-acknowledged' });
    } else if (stage === 'terrain-buildings') {
      get().send({
        type: 'terrain-intro-acknowledged',
        currentStyle: useProjectStore.getState().mapStyle,
      });
    }
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
