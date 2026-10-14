import { Eye } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapPicker } from '@/hooks/useMapPicker';
import type { RouteDraftEditor } from '@/hooks/useRouteDraft';
import { PLACE_FIELD_TERMS, ROUTE_PATH_TERMS } from '@/lib/terms';
import { placeLabel } from '@/engine/routeMode';
import type { EndpointRouteCalculation } from '@/store/types';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/Search/SearchField';
import { AirportSearchField } from '@/components/Search/AirportSearchField';
import { LabelledField } from '@/components/Search/LabelledField';

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
          <LabelledField label={PLACE_FIELD_TERMS.departure}>
            <AirportSearchField
              label={PLACE_FIELD_TERMS.departure}
              placeholder="Departure airport or city (e.g. JFK)..."
              value={calc.startPoint}
              name={placeLabel(calc.startName, calc.startPoint)}
              onSelect={(lngLat, name) => setPoint('startPoint', lngLat, name)}
              isPicking={startPicker.isPicking}
              onStartPick={startPicker.toggle}
            />
          </LabelledField>
          <LabelledField label={PLACE_FIELD_TERMS.arrival}>
            <AirportSearchField
              label={PLACE_FIELD_TERMS.arrival}
              placeholder="Arrival airport or city (e.g. LHR)..."
              value={calc.endPoint}
              name={placeLabel(calc.endName, calc.endPoint)}
              onSelect={(lngLat, name) => setPoint('endPoint', lngLat, name)}
              isPicking={endPicker.isPicking}
              onStartPick={endPicker.toggle}
            />
          </LabelledField>
        </>
      ) : (
        <>
          <LabelledField label={PLACE_FIELD_TERMS.start}>
            <SearchField
              label={PLACE_FIELD_TERMS.start}
              placeholder="Search address or coordinates"
              parseCoordinates
              value={calc.startPoint}
              name={placeLabel(calc.startName, calc.startPoint)}
              onSelect={(lngLat, name) => setPoint('startPoint', lngLat, name)}
              isPicking={startPicker.isPicking}
              onStartPick={startPicker.toggle}
            />
          </LabelledField>
          <LabelledField label={PLACE_FIELD_TERMS.end}>
            <SearchField
              label={PLACE_FIELD_TERMS.end}
              placeholder="Search address or coordinates"
              parseCoordinates
              value={calc.endPoint}
              name={placeLabel(calc.endName, calc.endPoint)}
              onSelect={(lngLat, name) => setPoint('endPoint', lngLat, name)}
              isPicking={endPicker.isPicking}
              onStartPick={endPicker.toggle}
            />
          </LabelledField>
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
