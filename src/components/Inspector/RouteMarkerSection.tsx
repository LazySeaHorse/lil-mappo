import { Car, Circle, Plane } from 'lucide-react';
import type { RouteItem } from '@/store/types';
import { SliderRow, SwitchRow, VisualCardSelect } from './InspectorShared';
import { InspectorSection } from './InspectorSection';
import { formatWideMultiplier } from './inspectorValues';
import { VEHICLE_SCALE_RANGE, clampVehicleScale } from '@/config/vehicles';

type RouteVehicle = NonNullable<NonNullable<RouteItem['calculation']>['vehicle']>;

/** The marker that travels along the route: on or off, its model and its size. */
export function RouteMarkerSection({
  vehicle,
  isPro,
  onChange,
  onLockedSelect,
}: {
  vehicle: RouteVehicle | undefined;
  isPro: boolean;
  onChange: (patch: Partial<RouteVehicle>) => void;
  onLockedSelect: () => void;
}) {
  return (
    <InspectorSection kind="route" id="marker">
      <SwitchRow label="Route marker" checked={vehicle?.enabled || false} onChange={(enabled) => onChange({ enabled })} />

      {vehicle?.enabled && (
        <div className="flex flex-col gap-3 pl-0.5">
          <div className="flex flex-col gap-1.5 pt-0.5">
            <span className="text-xs font-medium text-muted-foreground">Marker type</span>
            <VisualCardSelect
              options={[
                { value: 'dot', label: 'Dot', icon: <Circle size={14} /> },
                { value: 'car', label: 'Car', icon: <Car size={14} />, badge: !isPro ? 'PRO' : undefined, locked: !isPro },
                { value: 'plane', label: 'Plane', icon: <Plane size={14} />, badge: !isPro ? 'PRO' : undefined, locked: !isPro },
              ]}
              value={vehicle.type || 'dot'}
              onChange={(type) => onChange({ type, scale: clampVehicleScale(type, vehicle.scale || 1) })}
              onLockedSelect={onLockedSelect}
              columns={3}
            />
          </div>

          <SliderRow
            label="Size"
            value={vehicle.scale || 1}
            onChange={(scale) => onChange({ scale })}
            min={VEHICLE_SCALE_RANGE[vehicle.type || 'dot'].min}
            max={VEHICLE_SCALE_RANGE[vehicle.type || 'dot'].max}
            step={0.01}
            logarithmic
            formatValue={formatWideMultiplier}
          />
        </div>
      )}
    </InspectorSection>
  );
}
