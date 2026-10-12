import { Eye, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { selectionPreviewPillState } from './previewPillState';
import { clearSelection } from './escapeDeselect';

/**
 * Flags that the selected item is drawn in full rather than at the playhead's
 * time, and jumps into its clip to show the real animation. The × clears the
 * selection, like Escape.
 */
export function SelectionPreviewPill() {
  const pill = useProjectStore(
    useShallow((s) => selectionPreviewPillState(s)),
  );
  const setPlayheadTime = useProjectStore((s) => s.setPlayheadTime);

  if (!pill) return null;

  return (
    <div
      data-testid="selection-preview-pill"
      className="ph-no-capture absolute left-1/2 top-[calc(env(safe-area-inset-top,0px)+5rem)] z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 rounded-full border border-border/50 bg-background/85 py-1 pl-3 pr-1.5 text-xs font-medium text-foreground shadow-lg shadow-black/10 backdrop-blur-xl"
    >
      <button
        type="button"
        title="Play from inside this clip to see its animation"
        onClick={() => setPlayheadTime(pill.seekTime)}
        className="flex min-w-0 items-center gap-2 py-0.5 transition-colors hover:text-primary"
      >
        <Eye size={13} className="shrink-0 text-primary" />
        <span className="truncate">Showing &ldquo;{pill.name}&rdquo; in full</span>
      </button>
      <button
        type="button"
        aria-label="Clear selection"
        title="Clear selection"
        onClick={clearSelection}
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-secondary/80 hover:text-foreground"
      >
        <X size={12} />
      </button>
    </div>
  );
}
