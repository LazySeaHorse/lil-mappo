import { create } from 'zustand';
import type { BridgeStatus } from '@/agent';
import { isBridgeGuideHidden } from './aiPrefs';

export type AiPanelTab = 'connect' | 'activity';

interface AiPanelState {
  open: boolean;
  tab: AiPanelTab;
  /** Ease the map to what the AI just changed. Per session, default on. */
  followAi: boolean;
  /** Number of tools currently registered with the browser (0 when not registered). */
  registeredCount: number;
  /** The link to the local bridge that serves coding agents; `off` while AI control is off. */
  bridgeStatus: BridgeStatus | 'off';
  /** The bridge setup guide (download, run, connect a coding agent). */
  guideOpen: boolean;
  /** AI control was just switched on: open the guide if the bridge turns out to be unreachable. */
  guideOffered: boolean;
  openPanel: (tab?: AiPanelTab) => void;
  closePanel: () => void;
  setTab: (tab: AiPanelTab) => void;
  setFollowAi: (v: boolean) => void;
  setRegisteredCount: (n: number) => void;
  setBridgeStatus: (status: BridgeStatus | 'off') => void;
  setGuideOpen: (v: boolean) => void;
  /** Called when the user switches AI control on: unless they hid it, the guide opens if no bridge answers. */
  offerBridgeGuide: () => void;
}

/**
 * UI state of the AI panel. Deliberately separate from the project store's
 * inspector/dropdown state: the panel is allowed to stay open alongside the
 * Inspector, so it is not part of the mutually exclusive tool surfaces.
 */
export const useAiPanelStore = create<AiPanelState>()((set) => ({
  open: false,
  tab: 'connect',
  followAi: true,
  registeredCount: 0,
  bridgeStatus: 'off',
  guideOpen: false,
  guideOffered: false,
  openPanel: (tab) => set((s) => ({ open: true, tab: tab ?? s.tab })),
  closePanel: () => set({ open: false }),
  setTab: (tab) => set({ tab }),
  setFollowAi: (followAi) => set({ followAi }),
  setRegisteredCount: (registeredCount) => set({ registeredCount }),
  setBridgeStatus: (bridgeStatus) => set((s) => {
    if (!s.guideOffered || bridgeStatus === 'connecting') return { bridgeStatus };
    // The offer is settled by the first real answer: no bridge opens the guide, anything else drops it.
    return { bridgeStatus, guideOffered: false, guideOpen: s.guideOpen || bridgeStatus === 'unreachable' };
  }),
  setGuideOpen: (guideOpen) => set({ guideOpen }),
  offerBridgeGuide: () => {
    if (!isBridgeGuideHidden()) set({ guideOffered: true });
  },
}));
