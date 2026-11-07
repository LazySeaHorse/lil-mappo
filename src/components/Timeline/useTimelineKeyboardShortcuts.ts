import { useEffect } from 'react';
import { CAMERA_TRACK_ID, useProjectStore } from '@/store/useProjectStore';

interface TimelineKeyboardShortcutsOptions {
  duration: number;
  fps: number;
  isPlaying: boolean;
  selectedItemIds: readonly string[];
  removeItems: (itemIds: readonly string[]) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlayheadTime: (time: number) => void;
}

export function useTimelineKeyboardShortcuts({
  duration,
  fps,
  isPlaying,
  selectedItemIds,
  removeItems,
  setIsPlaying,
  setPlayheadTime,
}: TimelineKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isTyping) return;

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'Delete':
        case 'Backspace': {
          // A keyframe is selected along with the camera track, which itself is never deleted.
          const { selectedKeyframeId, removeCameraKeyframe } = useProjectStore.getState();
          if (selectedItemIds.includes(CAMERA_TRACK_ID)) {
            if (selectedKeyframeId) removeCameraKeyframe(selectedKeyframeId);
          } else if (selectedItemIds.length > 0) {
            removeItems(selectedItemIds);
          }
          break;
        }
        case 'BracketLeft':
          setPlayheadTime(0);
          break;
        case 'BracketRight':
          setPlayheadTime(duration);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          setPlayheadTime(useProjectStore.getState().playheadTime - 1 / fps);
          break;
        case 'ArrowRight':
          event.preventDefault();
          setPlayheadTime(useProjectStore.getState().playheadTime + 1 / fps);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration, fps, isPlaying, removeItems, selectedItemIds, setIsPlaying, setPlayheadTime]);
}
