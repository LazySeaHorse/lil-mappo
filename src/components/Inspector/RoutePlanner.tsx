import { Car, Footprints, Plane } from 'lucide-react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { RouteDraftEditor } from '@/hooks/useRouteDraft';
import { ROUTE_MODE_LABELS } from '@/lib/terms';
import type { RouteCalculation, RouteMode } from '@/store/types';
import { WalkPlanner } from './WalkPlanner';
import { EndpointPlanner } from './EndpointPlanner';

/**
 * The path editor: a travel mode and its fields. It edits the draft of
 * `useRouteDraft`; the route does not change until the draft is applied.
 */
export const RoutePlanner = ({
  routeId,
  calc,
  editor,
}: {
  routeId: string;
  calc: RouteCalculation;
  editor: RouteDraftEditor;
}) => (
  <div className="flex flex-col gap-3.5">
    <SegmentedControl
      options={[
        { value: 'car', label: ROUTE_MODE_LABELS.car, icon: <Car size={13} /> },
        { value: 'walk', label: ROUTE_MODE_LABELS.walk, icon: <Footprints size={13} /> },
        { value: 'flight', label: ROUTE_MODE_LABELS.flight, icon: <Plane size={13} /> },
      ]}
      value={calc.mode}
      onValueChange={(mode: RouteMode) => editor.setMode(mode)}
      className="h-8"
    />

    {calc.mode === 'walk'
      ? <WalkPlanner routeId={routeId} calc={calc} edit={editor.edit} />
      : <EndpointPlanner routeId={routeId} calc={calc} editor={editor} />}
  </div>
);
