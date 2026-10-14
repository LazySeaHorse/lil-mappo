import { create } from 'zustand';
import {
  readInspectorSections,
  writeInspectorSections,
  type InspectorSectionChoices,
} from './inspectorSectionsPreference';

/** Per-user interface preferences. They live in localStorage, not in the project. */
interface UiPreferencesState {
  inspectorSections: InspectorSectionChoices;
  setInspectorSectionOpen: (panel: string, section: string, open: boolean) => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>((set, get) => ({
  inspectorSections: readInspectorSections(),
  setInspectorSectionOpen: (panel, section, open) => {
    const current = get().inspectorSections;
    const next = { ...current, [panel]: { ...current[panel], [section]: open } };
    set({ inspectorSections: next });
    writeInspectorSections(next);
  },
}));
