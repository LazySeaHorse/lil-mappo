import { create } from 'zustand';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import {
  createWalkthroughState,
  walkthroughReducer,
  type MapGesture,
  type WalkthroughAddTool,
  type WalkthroughEvent,
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

export interface WalkthroughStore {
  isRunning: boolean;
  walkthrough: WalkthroughState;
  isMapStyleOpen: boolean;
  isMapToolsOpen: boolean;
  showMobileWarning: boolean;
  showInvitation: boolean;

  // Actions
  start: (isMobile: boolean, cameraKeyframeCount: number, usesLayerMenu: boolean) => void;
  dismiss: () => void;
  complete: () => void;
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

  start: (isMobile, cameraKeyframeCount, usesLayerMenu) => {
    useProjectStore.getState().setIsInspectorOpen(false);
    set({
      showInvitation: false,
      walkthrough: createWalkthroughState(isMobile, cameraKeyframeCount, usesLayerMenu),
      isRunning: true,
    });
    storeStatus('started');
  },

  dismiss: () => {
    set({ isRunning: false });
    storeStatus('dismissed');
  },

  complete: () => {
    set({ isRunning: false });
    storeStatus('completed');
    toast.success('Tour complete. You can now create your map animation.');
  },

  send: (event) => {
    const current = get().walkthrough;
    const next = walkthroughReducer(current, event);
    if (next !== current) {
      set({ walkthrough: next });
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
