import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createProject } from './projectDocument';
import type { ProjectStore } from './slices/types';
import { createTransientState } from './slices/mapEnvironmentSlice';
import { createItemsSlice } from './slices/itemsSlice';
import { createCameraSlice } from './slices/cameraSlice';
import { createPlaybackSlice } from './slices/playbackSlice';
import { createProjectSettingsSlice } from './slices/projectSettingsSlice';
import { createMapEnvironmentSlice } from './slices/mapEnvironmentSlice';
import { createEditorUiSlice } from './slices/editorUiSlice';

const defaultProject = createProject();

export const useProjectStore = create<ProjectStore>()(
  subscribeWithSelector((set, get, store) => ({
    ...defaultProject,
    ...createTransientState(),
    ...createItemsSlice(set, get, store),
    ...createCameraSlice(set, get, store),
    ...createPlaybackSlice(set, get, store),
    ...createProjectSettingsSlice(set, get, store),
    ...createMapEnvironmentSlice(set, get, store),
    ...createEditorUiSlice(set, get, store),
  }))
);

if (typeof window !== 'undefined' && (import.meta.env.DEV || (window as unknown as { __E2E__?: boolean }).__E2E__)) {
  (window as unknown as { __projectStore?: typeof useProjectStore }).__projectStore = useProjectStore;
}

export { CAMERA_TRACK_ID } from './projectDocument';
export { createTransientState, STANDARD_STYLE_CAPABILITIES } from './slices/mapEnvironmentSlice';
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
