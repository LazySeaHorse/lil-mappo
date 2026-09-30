import { useCallback, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { PickSession } from '@/store/slices/types';

interface MapPickerOptions extends Omit<PickSession, 'id'> {
  /** Set false (e.g. a closed dropdown) to end this picker's session if it is running. */
  enabled?: boolean;
}

/**
 * Owns one map-picking session id: tells you whether it is the active picker,
 * toggles it, and ends it if it is still running when the component unmounts
 * (or `enabled` turns false).
 */
export function useMapPicker(id: string, { enabled = true, ...session }: MapPickerOptions) {
  const isPicking = useProjectStore((s) => s.activePicker?.id === id);

  const toggle = useCallback(() => {
    const { activePicker, startPicking, stopPicking } = useProjectStore.getState();
    if (activePicker?.id === id) stopPicking();
    else startPicking({ id, ...session });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session.ownerId, session.prompt, session.onPick]);

  useEffect(() => {
    if (enabled) return;
    if (useProjectStore.getState().activePicker?.id === id) useProjectStore.getState().stopPicking();
  }, [enabled, id]);

  useEffect(() => () => {
    if (useProjectStore.getState().activePicker?.id === id) useProjectStore.getState().stopPicking();
  }, [id]);

  return { isPicking, toggle };
}
