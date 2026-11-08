import { useEffect } from 'react';
import { CAMERA_TRACK_ID, useProjectStore } from '@/store/useProjectStore';
import { withHistoryLabel } from '@/store/history';
import { TIMELINE_GROUP_TERMS } from '@/lib/terms';

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
        case 'KeyG': {
          if (!event.ctrlKey && !event.metaKey) break;
          const { groups, groupItems, ungroupItems } = useProjectStore.getState();
          const clips = selectedItemIds.filter((id) => id !== CAMERA_TRACK_ID);
          // Only when there is something to do, so the browser keeps its find-next otherwise.
          if (event.shiftKey) {
            if (!Object.values(groups).some((group) => group.itemIds.some((id) => clips.includes(id)))) break;
            event.preventDefault();
            withHistoryLabel(TIMELINE_GROUP_TERMS.ungrouped, () => ungroupItems(clips));
          } else if (clips.length > 1) {
            event.preventDefault();
            withHistoryLabel(TIMELINE_GROUP_TERMS.grouped(clips.length), () => groupItems(clips));
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
