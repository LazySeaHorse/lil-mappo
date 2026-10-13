import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { toast } from 'sonner';
import { CAMERA_VIEW_TERMS, type InspectorItemKind } from '@/lib/terms';

export interface InspectorItemActions {
  /** A camera view copy lands just after the original (see `duplicateCameraKeyframe`). */
  duplicate: () => void;
  remove: () => void;
  /** Pauses, then moves the playhead to the item's start time. */
  goToStart: () => void;
}

/** Store actions behind the inspector header menu, bound to one item. */
export function useInspectorItemActions(
  kind: InspectorItemKind,
  id: string,
  startTime: number,
): InspectorItemActions {
  const s = useProjectStore(
    useShallow((st) => ({
      duplicateItem: st.duplicateItem,
      duplicateCameraKeyframe: st.duplicateCameraKeyframe,
      removeItem: st.removeItem,
      selectItem: st.selectItem,
      removeCameraKeyframe: st.removeCameraKeyframe,
      selectKeyframe: st.selectKeyframe,
      setPlayheadTime: st.setPlayheadTime,
      setIsPlaying: st.setIsPlaying,
    })),
  );

  return useMemo(
    () => ({
      duplicate: () => {
        if (kind !== 'camera-kf') s.duplicateItem(id);
        else if (!s.duplicateCameraKeyframe(id)) toast.info(CAMERA_VIEW_TERMS.noRoomToDuplicate);
      },
      remove: () => {
        if (kind === 'camera-kf') {
          s.removeCameraKeyframe(id);
          s.selectKeyframe(null);
        } else {
          s.removeItem(id);
          s.selectItem(null);
        }
      },
      goToStart: () => {
        s.setIsPlaying(false);
        s.setPlayheadTime(startTime);
      },
    }),
    [kind, id, startTime, s],
  );
}
