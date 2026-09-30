import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { temporal } from 'zundo';
import { createProject } from './projectDocument';
import type { ProjectStore } from './slices/types';
import { createTransientState } from './slices/mapEnvironmentSlice';
import { createItemsSlice } from './slices/itemsSlice';
import { createCameraSlice } from './slices/cameraSlice';
import { createPlaybackSlice } from './slices/playbackSlice';
import { createProjectSettingsSlice } from './slices/projectSettingsSlice';
import { createMapEnvironmentSlice } from './slices/mapEnvironmentSlice';
import { createEditorUiSlice } from './slices/editorUiSlice';
import { partializeHistory, trackedStatesEqual, type TrackedState } from './historyKeys';
import {
  HISTORY_LIMIT,
  clearHistoryMeta,
  moveMetaOnRedo,
  moveMetaOnUndo,
  recordHistoryEntry,
} from './historyCore';

const defaultProject = createProject();

export const useProjectStore = create<ProjectStore>()(
  subscribeWithSelector(temporal<ProjectStore, [['zustand/subscribeWithSelector', never]], [], TrackedState>((set, get, store) => ({
    ...defaultProject,
    ...createTransientState(),
    ...createItemsSlice(set, get, store),
    ...createCameraSlice(set, get, store),
    ...createPlaybackSlice(set, get, store),
    ...createProjectSettingsSlice(set, get, store),
    ...createMapEnvironmentSlice(set, get, store),
    ...createEditorUiSlice(set, get, store),
  }), {
    partialize: (state): TrackedState => partializeHistory(state),
    equality: trackedStatesEqual,
    limit: HISTORY_LIMIT,
    onSave: recordHistoryEntry,
    // Keep the label/source stacks aligned however zundo is driven.
    wrapTemporal: (initializer) => (set, get, api) => {
      const base = initializer(set, get, api);
      return {
        ...base,
        undo: (steps = 1) => {
          const n = Math.min(steps, get().pastStates.length);
          base.undo(steps);
          for (let i = 0; i < n; i++) moveMetaOnUndo();
        },
        redo: (steps = 1) => {
          const n = Math.min(steps, get().futureStates.length);
          base.redo(steps);
          for (let i = 0; i < n; i++) moveMetaOnRedo();
        },
        clear: () => {
          base.clear();
          clearHistoryMeta();
        },
      };
    },
  }))
);

if (import.meta.env.DEV) {
  (window as unknown as { __projectStore?: typeof useProjectStore }).__projectStore = useProjectStore;
}

export { CAMERA_TRACK_ID } from './projectDocument';
export { createTransientState } from './slices/mapEnvironmentSlice';
export { STANDARD_CAPABILITIES } from '@/config/mapbox';
export {
  isCameraItem,
  isRouteItem,
  isBoundaryItem,
  isCalloutItem,
  getItem,
} from './typeGuards';
export type {
  ProjectStore,
  TransientProjectState,
  ItemsSlice,
  CameraSlice,
  PlaybackSlice,
  ProjectSettingsSlice,
  MapEnvironmentSlice,
  EditorUiSlice,
} from './slices/types';
