import { Eye } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { selectionPreviewPillState } from './previewPillState';
import { clearSelection } from './escapeDeselect';
import { MapPill } from '@/components/MapStatusPills/MapPill';

/**
 * Flags that the selected item is drawn in full rather than at the playhead's
 * time, and jumps into its clip to show the real animation. The × clears the
 * selection, like Escape, and keeps the item from showing in full again until
 * another item is selected. `MapStatusPills` places it.
 */
export function SelectionPreviewPill() {
  const pill = useProjectStore(
    useShallow((s) => selectionPreviewPillState(s)),
  );
  const setPlayheadTime = useProjectStore((s) => s.setPlayheadTime);
  const dismissSelectionPreview = useProjectStore((s) => s.dismissSelectionPreview);

  if (!pill) return null;

  return (
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
  );
}
