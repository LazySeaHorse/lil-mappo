import type { StateCreator } from 'zustand';
import type { PlaybackSlice, ProjectStore } from './types';

export const createPlaybackSlice: StateCreator<ProjectStore, [], [], PlaybackSlice> = (
  set,
  get,
) => ({
  setPlayheadTime: (t) => set({ playheadTime: Math.max(0, Math.min(t, get().duration)) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsScrubbing: (v) => set({ isScrubbing: v }),
  setDuration: (d) =>
    set((s) => {
      const nextDuration = Math.max(1, d);
      const clampedPlayhead = Math.max(0, Math.min(s.playheadTime, nextDuration));
      return {
        duration: nextDuration,
        playheadTime: clampedPlayhead,
        isPlaying: s.playheadTime >= nextDuration ? false : s.isPlaying,
      };
    }),
  setFps: (fps) => set({ fps }),
});
