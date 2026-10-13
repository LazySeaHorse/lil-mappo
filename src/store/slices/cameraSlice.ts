import type { StateCreator } from 'zustand';
import { nanoid } from 'nanoid';
import type { CameraItem, CameraKeyframe } from '../types';
import { CAMERA_TRACK_ID } from '../projectDocument';
import type { CameraSlice, ProjectStore } from './types';

const CAMERA_ID = CAMERA_TRACK_ID;
/** A duplicated camera view lands this many seconds after the original. */
const DUPLICATE_OFFSET = 1;
/** Closest two camera views may be after rounding to hundredths. */
const MIN_KEYFRAME_GAP = 0.01;

export const createCameraSlice: StateCreator<ProjectStore, [], [], CameraSlice> = (set, get) => ({
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

  duplicateCameraKeyframe: (kfId) => {
    const s = get();
    const cam = s.items[CAMERA_ID] as CameraItem | undefined;
    const original = cam?.keyframes.find((k) => k.id === kfId);
    if (!cam || !original) return null;

    const nextTime = cam.keyframes.find((k) => k.time > original.time)?.time ?? s.duration;
    const room = nextTime - original.time;
    if (room < MIN_KEYFRAME_GAP * 2) return null;
    const time = +(original.time + (room > DUPLICATE_OFFSET ? DUPLICATE_OFFSET : room / 2)).toFixed(2);

    const copy: CameraKeyframe = { ...structuredClone(original), id: nanoid(), time };
    const keyframes = [...cam.keyframes, copy].sort((a, b) => a.time - b.time);
    set({
      items: { ...s.items, [CAMERA_ID]: { ...cam, keyframes } },
      selectedItemId: CAMERA_ID,
      selectedKeyframeId: copy.id,
      isInspectorOpen: true,
    });
    return copy.id;
  },

  setIsCameraEnabled: (v) => set({ isCameraEnabled: v }),
});
