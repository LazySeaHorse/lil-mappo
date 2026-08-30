import type { StateCreator } from 'zustand';
import type { CameraItem } from '../types';
import { CAMERA_TRACK_ID } from '../projectDocument';
import type { CameraSlice, ProjectStore } from './types';

const CAMERA_ID = CAMERA_TRACK_ID;

export const createCameraSlice: StateCreator<ProjectStore, [], [], CameraSlice> = (set) => ({
  addCameraKeyframe: (kf) =>
    set((s) => {
      const cam = s.items[CAMERA_ID] as CameraItem | undefined;
      if (!cam) return s;
      const keyframes = [...cam.keyframes, kf].sort((a, b) => a.time - b.time);
      return {
        items: { ...s.items, [CAMERA_ID]: { ...cam, keyframes } },
        selectedItemId: CAMERA_ID,
        selectedKeyframeId: kf.id,
      };
    }),

  updateCameraKeyframe: (kfId, updates) =>
    set((s) => {
      const cam = s.items[CAMERA_ID] as CameraItem | undefined;
      if (!cam) return s;
      const keyframes = cam.keyframes
        .map((kf) => (kf.id === kfId ? { ...kf, ...updates } : kf))
        .sort((a, b) => a.time - b.time);
      return {
        items: { ...s.items, [CAMERA_ID]: { ...cam, keyframes } },
      };
    }),

  removeCameraKeyframe: (kfId) =>
    set((s) => {
      const cam = s.items[CAMERA_ID] as CameraItem | undefined;
      if (!cam) return s;
      return {
        items: {
          ...s.items,
          [CAMERA_ID]: { ...cam, keyframes: cam.keyframes.filter((k) => k.id !== kfId) },
        },
        selectedKeyframeId: s.selectedKeyframeId === kfId ? null : s.selectedKeyframeId,
      };
    }),

  setIsCameraEnabled: (v) => set({ isCameraEnabled: v }),
});
