import { create } from 'zustand';
import { readDefaultCalloutStyle, writeDefaultCalloutStyle } from './calloutStylePreference';
import {
  readInspectorSections,
  writeInspectorSections,
  type InspectorSectionChoices,
} from './inspectorSectionsPreference';
import { readGroupHintSeen, writeGroupHintSeen } from './groupHintPreference';

/** Per-user interface preferences. They live in localStorage, not in the project. */
interface UiPreferencesState {
  inspectorSections: InspectorSectionChoices;
  setInspectorSectionOpen: (panel: string, section: string, open: boolean) => void;
  /** The style new callouts start with; null until the user picks one. */
  defaultCalloutStyle: string | null;
  setDefaultCalloutStyle: (styleId: string) => void;
  /** Whether the one-time hint about grouping selected clips has been shown. */
  groupHintSeen: boolean;
  markGroupHintSeen: () => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>((set, get) => ({
  inspectorSections: readInspectorSections(),
  setInspectorSectionOpen: (panel, section, open) => {
    const current = get().inspectorSections;
    const next = { ...current, [panel]: { ...current[panel], [section]: open } };
    set({ inspectorSections: next });
    writeInspectorSections(next);
  },
  defaultCalloutStyle: readDefaultCalloutStyle(),
  setDefaultCalloutStyle: (styleId) => {
    set({ defaultCalloutStyle: styleId });
    writeDefaultCalloutStyle(styleId);
  },
  groupHintSeen: readGroupHintSeen(),
  markGroupHintSeen: () => {
    set({ groupHintSeen: true });
    writeGroupHintSeen();
  },
}));
