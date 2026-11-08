import { Redo2, Undo2 } from 'lucide-react';
import { redo, undo, useHistoryControls } from '@/store/history';
import { isMac } from '@/lib/platform';
import { ToolbarButton } from './ToolbarPrimitives';

/** Undo/redo toolbar buttons; subscribe only to stack availability and labels. */
export function HistoryButtons({ iconSize = 16 }: { iconSize?: number }) {
  const { canUndo, canRedo, undoLabel, redoLabel } = useHistoryControls();
  const undoKeys = isMac ? '⌘Z' : 'Ctrl+Z';
  const redoKeys = isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z';

  return (
    <div className="flex items-center gap-0.5" data-walkthrough="history">
      <ToolbarButton
        icon={<Undo2 size={iconSize} />}
        label={`Undo${undoLabel ? ` ${undoLabel}` : ''} (${undoKeys})`}
        hideLabel
        disabled={!canUndo}
        onClick={() => { undo(); }}
      />
      <ToolbarButton
        icon={<Redo2 size={iconSize} />}
        label={`Redo${redoLabel ? ` ${redoLabel}` : ''} (${redoKeys})`}
        hideLabel
        disabled={!canRedo}
        onClick={() => { redo(); }}
      />
    </div>
  );
}
