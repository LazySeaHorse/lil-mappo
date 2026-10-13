import type { ReactNode } from 'react';
import { Eye } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapPicker } from '@/hooks/useMapPicker';
import type { RouteDraftEditor } from '@/hooks/useRouteDraft';
import { ROUTE_PATH_TERMS } from '@/lib/terms';
import { placeLabel } from '@/engine/routeMode';
import type { EndpointRouteCalculation } from '@/store/types';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/Search/SearchField';
import { AirportSearchField } from '@/components/Search/AirportSearchField';

const START_COLOR = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
const END_COLOR = 'bg-rose-500/10 text-rose-500 border-rose-500/20';

const Labelled = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="px-1 text-[11px] font-medium text-foreground/90">{label}</span>
    {children}
  </div>
);

/** Car / flight: two endpoints and a computed path. */
export const EndpointPlanner = ({
  routeId,
  calc,
  editor,
}: {
  routeId: string;
  calc: EndpointRouteCalculation;
  editor: RouteDraftEditor;
}) => {
  const { path } = editor;

  const setPoint = (key: 'startPoint' | 'endPoint', lngLat: [number, number], name = '') => {
    path.cancel();
    const nameKey = key === 'startPoint' ? 'startName' : 'endName';
    editor.edit((current) => (current.mode === 'walk' ? current : { ...current, [key]: lngLat, [nameKey]: name }));
    useProjectStore.getState().setPreviewRoute(null);
  };

  const startPicker = useMapPicker(`route-${routeId}-start`, {
    ownerId: routeId,
    prompt: 'Start',
    onPick: (result) => setPoint('startPoint', result.lngLat, result.name),
  });
  const endPicker = useMapPicker(`route-${routeId}-end`, {
    ownerId: routeId,
    prompt: 'End',
    onPick: (result) => setPoint('endPoint', result.lngLat, result.name),
  });

  return (
    <div className="flex flex-col gap-2.5">
      {calc.mode === 'flight' ? (
        <>
          <Labelled label="Departure">
            <AirportSearchField
              label="Departure"
              placeholder="Departure airport or city (e.g. JFK)..."
              value={calc.startPoint}
              name={placeLabel(calc.startName, calc.startPoint)}
              onSelect={(lngLat, name) => setPoint('startPoint', lngLat, name)}
              color={START_COLOR}
              isPicking={startPicker.isPicking}
              onStartPick={startPicker.toggle}
            />
          </Labelled>
          <Labelled label="Arrival">
            <AirportSearchField
              label="Arrival"
              placeholder="Arrival airport or city (e.g. LHR)..."
              value={calc.endPoint}
              name={placeLabel(calc.endName, calc.endPoint)}
              onSelect={(lngLat, name) => setPoint('endPoint', lngLat, name)}
              color={END_COLOR}
              isPicking={endPicker.isPicking}
              onStartPick={endPicker.toggle}
            />
          </Labelled>
        </>
      ) : (
        <>
          <Labelled label="Start">
            <SearchField
              label="Start"
              placeholder="Search address or coordinates"
              parseCoordinates
              value={calc.startPoint}
              name={placeLabel(calc.startName, calc.startPoint)}
              onSelect={(lngLat, name) => setPoint('startPoint', lngLat, name)}
              color={START_COLOR}
              isPicking={startPicker.isPicking}
              onStartPick={startPicker.toggle}
            />
          </Labelled>
          <Labelled label="End">
            <SearchField
              label="End"
              placeholder="Search address or coordinates"
              parseCoordinates
              value={calc.endPoint}
              name={placeLabel(calc.endName, calc.endPoint)}
              onSelect={(lngLat, name) => setPoint('endPoint', lngLat, name)}
              color={END_COLOR}
              isPicking={endPicker.isPicking}
              onStartPick={endPicker.toggle}
            />
          </Labelled>
        </>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => path.preview(calc)}
        disabled={path.loading}
        className="w-full h-10 py-2.5 px-4 rounded-lg text-xs font-medium shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <Eye size={15} className="text-muted-foreground" />
        <span>{ROUTE_PATH_TERMS.preview}</span>
      </Button>
    </div>
  );
};
