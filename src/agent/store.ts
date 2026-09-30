import { create } from 'zustand';
import type { ExportLimits } from '@/lib/cloudAccess';

interface AgentState {
  /** Master switch. While false every tool call is refused. Driven by the UI. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /**
   * Plan limits (duration, fps, resolution) enforced by update_project_settings.
   * The UI sets this from getExportLimits(subscription); null means free-tier limits.
   */
  exportLimits: ExportLimits | null;
  setExportLimits: (limits: ExportLimits | null) => void;
}

export const useAgentStore = create<AgentState>()((set) => ({
  enabled: false,
  setEnabled: (enabled) => set({ enabled }),
  exportLimits: null,
  setExportLimits: (exportLimits) => set({ exportLimits }),
}));
