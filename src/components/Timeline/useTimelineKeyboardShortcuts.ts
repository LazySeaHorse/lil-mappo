import { useEffect } from 'react';
import { CAMERA_TRACK_ID, useProjectStore } from '@/store/useProjectStore';

interface TimelineKeyboardShortcutsOptions {
  duration: number;
  fps: number;
  isPlaying: boolean;
  selectedItemId: string | null;
  removeItem: (itemId: string) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlayheadTime: (time: number) => void;
}

export function useTimelineKeyboardShortcuts({
  duration,
  fps,
  isPlaying,
  selectedItemId,
  removeItem,
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
          if (selectedItemId === CAMERA_TRACK_ID) {
            if (selectedKeyframeId) removeCameraKeyframe(selectedKeyframeId);
          } else if (selectedItemId) {
            removeItem(selectedItemId);
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
  }, [duration, fps, isPlaying, removeItem, selectedItemId, setIsPlaying, setPlayheadTime]);
}
