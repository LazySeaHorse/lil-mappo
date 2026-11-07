import { Layers } from 'lucide-react';
import { UpcomingFeature } from '@/components/FeatureVotes/UpcomingFeature';
import { PanelWrapper } from './InspectorLayout';

/** Panel while several clips are selected. Moving and deleting them works; editing them together is something to ask for. */
export function MultiSelectionInspector({ count }: { count: number }) {
  return (
    <PanelWrapper title={`${count} items selected`} icon={<Layers size={15} />}>
      <div className="flex flex-col items-start gap-3" data-ph-unmask>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Drag one to move them all, or press Delete to remove them. Editing their settings together, and grouping them, is not built yet.
        </p>
        <UpcomingFeature featureId="multi-edit-groups" variant="inline" />
      </div>
    </PanelWrapper>
  );
}
