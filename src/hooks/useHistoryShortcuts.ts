import { useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { installGestureTracking, redo, undo } from '@/store/history';

/**
 * Mount once in the editor: coalesces pointer gestures into single undo steps
 * and binds undo/redo shortcuts. react-hotkeys-hook ignores form fields and
 * contentEditable by default, so native text undo keeps working in inputs.
 */
export function useHistoryShortcuts(): void {
  useEffect(() => installGestureTracking(), []);

  useHotkeys('mod+z', () => { undo(); }, { preventDefault: true }, []);
  useHotkeys('mod+shift+z, ctrl+y', () => { redo(); }, { preventDefault: true }, []);
}
