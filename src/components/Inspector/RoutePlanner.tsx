import { useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useRoutePath } from '@/hooks/useRoutePath';
import { Car, Footprints, Plane } from 'lucide-react';
import type { RouteItem, RouteMode } from '@/store/types';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { buildWalkGeometry } from '@/engine/routeCurves';
import { convertRouteCalculation, isPlacedPoint } from '@/engine/routeMode';
import { vehicleChangePatch } from '@/config/vehicles';
import { WalkPlanner } from './WalkPlanner';
import { EndpointPlanner } from './EndpointPlanner';

interface RoutePlannerProps {
  item: RouteItem;
}

export const RoutePlanner = ({ item }: RoutePlannerProps) => {
  const updateItem = useProjectStore((s) => s.updateItem);
  const storeItem = useProjectStore((s) => s.items[item.id]) as RouteItem | undefined;
  const activeItem = storeItem ?? item;
  const calc = activeItem.calculation ?? convertRouteCalculation(undefined, 'car');
  const path = useRoutePath(item.id);

  useEffect(() => {
    return () => {
      if (useProjectStore.getState().activePicker?.ownerId === item.id) {
        useProjectStore.getState().stopPicking();
      }
    };
  }, [item.id]);

  /**
   * Switching mode redraws the path from the carried-over points so the route
   * never shows a path from its previous mode. Routes without enough points
   * (e.g. imported tracks) keep their geometry, since it cannot be rebuilt.
   */
  const handleModeChange = (mode: RouteMode) => {
    path.cancel();
    const store = useProjectStore.getState();
    if (store.activePicker?.ownerId === item.id) store.stopPicking();
    store.setPreviewRoute(null);

    const next = convertRouteCalculation(calc, mode);
    const vehicle = next.vehicle ?? { enabled: false, type: 'dot' as const, modelId: '', scale: 1 };

    const patch = vehicleChangePatch(activeItem, next, vehicle);
    if (next.mode === 'walk') {
      updateItem(item.id, next.points.length >= 2 ? { ...patch, geojson: buildWalkGeometry(next) } : patch);
      return;
    }
    updateItem(item.id, patch);
    if (isPlacedPoint(next.startPoint) && isPlacedPoint(next.endPoint)) void path.calculate(next, 'save');
  };

  return (
    <div className="flex flex-col gap-3.5">
      <SegmentedControl
        options={[
          { value: 'car', label: 'Car', icon: <Car size={13} /> },
          { value: 'walk', label: 'Walk', icon: <Footprints size={13} /> },
          { value: 'flight', label: 'Flight', icon: <Plane size={13} /> },
        ]}
        value={calc.mode}
        onValueChange={handleModeChange}
        className="h-8"
      />

      {calc.mode === 'walk'
        ? <WalkPlanner routeId={item.id} calc={calc} />
        : <EndpointPlanner item={activeItem} calc={calc} path={path} />}
    </div>
  );
};
