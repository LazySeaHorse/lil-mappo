import { Eye } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { selectionPreviewPillState } from './previewPillState';
import { useResponsive } from '@/hooks/useResponsive';
import { PANEL_MARGIN, rightReserved } from '@/constants/layout';
import { clearSelection } from './escapeDeselect';
import { MapPill } from '@/components/MapStatusPills/MapPill';

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
      <MapPill
        testId="selection-preview-pill"
        leading={<Eye size={13} className="shrink-0 text-primary" />}
        title="Play from inside this clip to see its animation"
        onClick={() => setPlayheadTime(pill.seekTime)}
        dismiss={{
          label: 'Clear selection',
          onClick: () => {
            dismissSelectionPreview();
            clearSelection();
          },
        }}
      >
        Showing &ldquo;<span className="ph-mask">{pill.name}</span>&rdquo; in full
      </MapPill>
    </div>
  );
}
