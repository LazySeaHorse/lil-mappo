import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import type { InspectorItemKind } from '@/lib/terms';

export interface InspectorItemActions {
  /** Not offered for camera views. */
  duplicate: (() => void) | null;
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
      duplicate: kind === 'camera-kf' ? null : () => s.duplicateItem(id),
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
