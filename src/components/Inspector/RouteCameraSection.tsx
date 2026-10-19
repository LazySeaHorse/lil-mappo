import { Clapperboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/store/useProjectStore';
import { FOLLOW_CAMERA_TERMS, ROUTE_TERMS } from '@/lib/terms';
import type { RouteItem } from '@/store/types';
import { SwitchRow } from './InspectorShared';
import { InspectorSection } from './InspectorSection';
import { followCameraSummary } from './followCameraSummary';

/**
 * The Follow camera switch of a route. It is off at first. When it is on, a card names
 * the camera and opens the Follow camera panel, where the camera is set up.
 */
export function RouteCameraSection({
  item,
  onToggle,
}: {
  item: RouteItem;
  onToggle: (on: boolean) => void;
}) {
  const setSelectedAutoCamRouteId = useProjectStore((s) => s.setSelectedAutoCamRouteId);
  const on = item.autoCam?.enabled ?? false;
  const summary = item.autoCam ? followCameraSummary(item.autoCam) : null;

  return (
    <InspectorSection kind="route" id="camera">
      <SwitchRow
        label={ROUTE_TERMS.followCamera}
        walkthroughTarget="follow-route"
        sublabel={on ? undefined : FOLLOW_CAMERA_TERMS.hint}
        checked={on}
        onChange={onToggle}
      />
      {on && summary && (
        <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/10 p-2.5">
          <Clapperboard size={14} className="shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">{summary.title}</p>
            <p className="text-2xs leading-tight text-muted-foreground">{summary.description}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setSelectedAutoCamRouteId(item.id)}
            className="shrink-0"
          >
            {FOLLOW_CAMERA_TERMS.editCamera}
          </Button>
        </div>
      )}
    </InspectorSection>
  );
}
