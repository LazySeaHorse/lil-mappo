import { arrayMove } from '@dnd-kit/sortable';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import { toggleMapPicker, useMapPicker } from '@/hooks/useMapPicker';
import { DEFAULT_SHARPNESS } from '@/engine/routeCurves';
import type { WalkRouteCalculation } from '@/store/types';
import { SwitchRow, SliderField } from './InspectorShared';
import { WalkPointList } from './WalkPointList';

export const WalkPlanner = ({ routeId, calc }: { routeId: string; calc: WalkRouteCalculation }) => {
  const { updateWalkRoute, activePicker, stopPicking } = useProjectStore(
    useShallow(s => ({
      updateWalkRoute: s.updateWalkRoute,
      activePicker: s.activePicker,
      stopPicking: s.stopPicking,
    }))
  );
  const { isPicking: isAppending, toggle: toggleAppend } = useMapPicker(`route-${routeId}-append`, {
    ownerId: routeId,
    prompt: 'Point',
    onPick: (result) => {
      updateWalkRoute(routeId, (c) => ({ points: [...c.points, result.lngLat] }));
      toast.success('Point added');
    },
  });
  const movePickerPrefix = `route-${routeId}-move-`;
  const movingIndex = activePicker?.id.startsWith(movePickerPrefix)
    ? Number(activePicker.id.slice(movePickerPrefix.length))
    : null;

  // Removing or reordering shifts indices, so a pending "move point N" pick would land on the wrong point.
  const stopMovePicker = () => {
    if (movingIndex !== null) stopPicking();
  };

  return (
    <div className="flex flex-col gap-3">
      <SwitchRow
        label="Smooth Curve"
        sublabel={calc.curved ? 'Bézier spline through points' : 'Straight line segments'}
        checked={calc.curved}
        onChange={(curved) => updateWalkRoute(routeId, { curved })}
      />

      {calc.curved && (
        <SliderField
          label="Curvature"
          value={calc.sharpness ?? DEFAULT_SHARPNESS}
          min={0.1}
          max={1.0}
          step={0.05}
          onChange={(sharpness) => updateWalkRoute(routeId, { sharpness })}
        />
      )}

      <div className="flex flex-col gap-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Points
        </span>

        {calc.points.length === 0 && (
          <p className="text-xs text-muted-foreground px-1">
            No points yet. Click below to add points.
          </p>
        )}

        <WalkPointList
          points={calc.points}
          onReorder={(from, to) => {
            stopMovePicker();
            updateWalkRoute(routeId, (c) => ({ points: arrayMove(c.points, from, to) }));
          }}
          onRemove={(index) => {
            stopMovePicker();
            updateWalkRoute(routeId, (c) => ({ points: c.points.filter((_, i) => i !== index) }));
          }}
          isAppending={isAppending}
          onToggleAppend={toggleAppend}
          movingIndex={movingIndex}
          onToggleMove={(index) =>
            toggleMapPicker({
              id: `${movePickerPrefix}${index}`,
              ownerId: routeId,
              prompt: `Move point ${index + 1}`,
              onPick: ({ lngLat }) =>
                updateWalkRoute(routeId, (c) => ({
                  points: c.points.map((p, i) => (i === index ? lngLat : p)),
                })),
            })
          }
        />
      </div>
    </div>
  );
};
