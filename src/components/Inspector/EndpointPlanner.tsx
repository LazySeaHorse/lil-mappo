import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Loader2, Eye } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapPicker } from '@/hooks/useMapPicker';
import type { RoutePath } from '@/hooks/useRoutePath';
import { placeLabel } from '@/engine/routeMode';
import type { EndpointRouteCalculation, RouteItem } from '@/store/types';
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
  item,
  calc,
  path,
}: {
  item: RouteItem;
  calc: EndpointRouteCalculation;
  path: RoutePath;
}) => {
  const { updateItem, setPreviewRoute } = useProjectStore(
    useShallow(s => ({
      updateItem: s.updateItem,
      setPreviewRoute: s.setPreviewRoute,
    }))
  );

  const setPoint = (key: 'startPoint' | 'endPoint', lngLat: [number, number], name = '') => {
    path.cancel();
    const current = useProjectStore.getState().items[item.id];
    if (current?.kind !== 'route' || current.calculation?.mode === 'walk') return;
    const nameKey = key === 'startPoint' ? 'startName' : 'endName';
    updateItem(item.id, { calculation: { ...(current.calculation ?? calc), [key]: lngLat, [nameKey]: name } });
    setPreviewRoute(null);
  };

  const startPicker = useMapPicker(`route-${item.id}-start`, {
    ownerId: item.id,
    prompt: 'Start',
    onPick: (result) => setPoint('startPoint', result.lngLat, result.name),
  });
  const endPicker = useMapPicker(`route-${item.id}-end`, {
    ownerId: item.id,
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

      <div className="flex flex-col gap-2.5 pt-1">
        <Button
          type="button"
          onClick={() => path.calculate(calc, 'save')}
          disabled={path.loading}
          className="w-full h-10 py-2.5 px-4 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {path.loading ? <Loader2 size={15} className="animate-spin" /> : 'Apply route'}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => path.calculate(calc, 'preview')}
          disabled={path.loading}
          className="w-full h-10 py-2.5 px-4 rounded-lg text-xs font-medium shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Eye size={15} className="text-muted-foreground" />
          <span>Preview route</span>
        </Button>
      </div>
    </div>
  );
};
