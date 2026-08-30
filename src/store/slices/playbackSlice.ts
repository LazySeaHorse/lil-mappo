import type { StateCreator } from 'zustand';
import type { PlaybackSlice, ProjectStore } from './types';

export const createPlaybackSlice: StateCreator<ProjectStore, [], [], PlaybackSlice> = (
  set,
  get,
) => ({
  setPlayheadTime: (t) => set({ playheadTime: Math.max(0, Math.min(t, get().duration)) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsScrubbing: (v) => set({ isScrubbing: v }),
  setDuration: (d) => set({ duration: Math.max(1, d) }),
  setFps: (fps) => set({ fps }),
});
