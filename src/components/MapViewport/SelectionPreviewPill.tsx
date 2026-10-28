import { Eye, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { selectionPreviewPillState } from './previewPillState';
import { useResponsive } from '@/hooks/useResponsive';
import { PANEL_MARGIN, rightReserved } from '@/constants/layout';
import { clearSelection } from './escapeDeselect';

/**
 * Flags that the selected item is drawn in full rather than at the playhead's
 * time, and jumps into its clip to show the real animation. The × clears the
 * selection, like Escape, and keeps the item from showing in full again until
 * another item is selected.
 */
export function SelectionPreviewPill() {
  const pill = useProjectStore(
    useShallow((s) => selectionPreviewPillState(s)),
  );
  const setPlayheadTime = useProjectStore((s) => s.setPlayheadTime);
  const dismissSelectionPreview = useProjectStore((s) => s.dismissSelectionPreview);
  const isInspectorOpen = useProjectStore((s) => s.isInspectorOpen);
  const { isMobile, isTablet } = useResponsive();

  if (!pill) return null;

  return (
    // Spans the area the top bar spans, so the pill centres on what the inspector leaves free.
    <div
      className="pointer-events-none absolute top-[calc(env(safe-area-inset-top,0px)+5rem)] z-10 flex justify-center transition-[right] duration-300"
      style={{ left: PANEL_MARGIN, right: rightReserved({ isInspectorOpen, isMobile, isTablet }) }}
    >
      <div
        data-testid="selection-preview-pill"
        className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full border border-border/50 bg-background/85 py-1 pl-3 pr-1.5 text-xs font-medium text-foreground shadow-lg shadow-black/10 backdrop-blur-xl"
      >
        <button
          type="button"
          title="Play from inside this clip to see its animation"
          onClick={() => setPlayheadTime(pill.seekTime)}
          className="flex min-w-0 items-center gap-2 py-0.5 transition-colors hover:text-primary"
        >
          <Eye size={13} className="shrink-0 text-primary" />
          <span className="truncate">Showing &ldquo;<span className="ph-mask">{pill.name}</span>&rdquo; in full</span>
        </button>
        <button
          type="button"
          aria-label="Clear selection"
          title="Clear selection"
          onClick={() => {
            dismissSelectionPreview();
            clearSelection();
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-secondary/80 hover:text-foreground"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
