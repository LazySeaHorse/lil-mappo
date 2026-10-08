import { Eye } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { selectionPreviewPillState } from './previewPillState';

/**
 * Flags that the selected item is drawn in full rather than at the playhead's
 * time, and jumps into its clip to show the real animation.
 */
export function SelectionPreviewPill() {
  const pill = useProjectStore(
    useShallow((s) => selectionPreviewPillState(s)),
  );
  const setPlayheadTime = useProjectStore((s) => s.setPlayheadTime);

  if (!pill) return null;

  return (
    <button
      type="button"
      data-testid="selection-preview-pill"
      title="Play from inside this clip to see its animation"
      onClick={() => setPlayheadTime(pill.seekTime)}
      className="ph-no-capture absolute left-1/2 top-[calc(env(safe-area-inset-top,0px)+5rem)] z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-border/50 bg-background/85 py-1.5 pl-3 pr-2 text-xs font-medium text-foreground shadow-lg shadow-black/10 backdrop-blur-xl transition-colors hover:bg-background"
    >
      <Eye size={13} className="shrink-0 text-primary" />
      <span className="truncate">Showing &ldquo;{pill.name}&rdquo; in full</span>
      <kbd className="hidden shrink-0 rounded border border-border/60 bg-secondary/60 px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground sm:inline">
        Esc
      </kbd>
    </button>
  );
}
