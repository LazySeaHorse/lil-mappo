import { create } from 'zustand';

export type AiPanelTab = 'connect' | 'activity';

interface AiPanelState {
  open: boolean;
  tab: AiPanelTab;
  /** Ease the map to what the AI just changed. Per session, default on. */
  followAi: boolean;
  /** Number of tools currently registered with the browser (0 when not registered). */
  registeredCount: number;
  openPanel: (tab?: AiPanelTab) => void;
  closePanel: () => void;
  setTab: (tab: AiPanelTab) => void;
  setFollowAi: (v: boolean) => void;
  setRegisteredCount: (n: number) => void;
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
  openPanel: (tab) => set((s) => ({ open: true, tab: tab ?? s.tab })),
  closePanel: () => set({ open: false }),
  setTab: (tab) => set({ tab }),
  setFollowAi: (followAi) => set({ followAi }),
  setRegisteredCount: (registeredCount) => set({ registeredCount }),
}));

const CONSENT_KEY = 'lilmappo.ai.consent.v1';

/** Whether the user already accepted the experimental-feature confirmation in this browser. */
export function hasAiConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function recordAiConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, '1');
  } catch {
    // Storage unavailable: the dialog simply shows again next time.
  }
}
