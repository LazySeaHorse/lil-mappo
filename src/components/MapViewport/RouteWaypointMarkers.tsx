import { Marker } from 'react-map-gl/mapbox';
import type { MarkerDragEvent } from 'react-map-gl/mapbox';
import { useProjectStore } from '@/store/useProjectStore';

/** Draggable, numbered markers for walk points (numbers match the inspector list). */
function WalkPointMarkers({
  points,
  onMove,
}: {
  points: [number, number][];
  onMove: (index: number, point: [number, number]) => void;
}) {
  const lastIndex = points.length - 1;

  const handleDrag = (index: number, e: MarkerDragEvent) => onMove(index, [e.lngLat.lng, e.lngLat.lat]);

  const colorFor = (index: number) =>
    index === 0 ? 'bg-emerald-500' : index === lastIndex ? 'bg-rose-500' : 'bg-blue-500';

  return (
    <>
      {points.map((point, index) => (
        <Marker
          key={`wp-${index}`}
          longitude={point[0]}
          latitude={point[1]}
          draggable
          anchor="center"
          onDrag={(e) => handleDrag(index, e)}
          onDragEnd={(e) => handleDrag(index, e)}
        >
          <div
            className="group relative flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
            title={`Point ${index + 1} (drag to bend route)`}
          >
            <div className={`w-5 h-5 rounded-full ${colorFor(index)} text-white font-bold text-2xs flex items-center justify-center shadow-lg ring-2 ring-white hover:scale-125 transition-transform`}>
              {index + 1}
            </div>
          </div>
        </Marker>
      ))}
    </>
  );
}

/**
 * Markers for the selected walk route's points. While the route's path editor has a draft,
 * they show and move the draft's points (and none when the draft is not a walk).
 */
export function RouteWaypointMarkers() {
  const selectedItemId = useProjectStore((s) => s.selectedItemId);
  const selectedItem = useProjectStore((s) => (selectedItemId ? s.items[selectedItemId] : null));
  const routeDraft = useProjectStore((s) => s.routeDraft);
  const updateWalkRoute = useProjectStore((s) => s.updateWalkRoute);
  const updateRouteDraft = useProjectStore((s) => s.updateRouteDraft);

  if (selectedItem?.kind !== 'route') return null;
  const routeId = selectedItem.id;

  if (routeDraft?.routeId === routeId) {
    if (routeDraft.calculation.mode !== 'walk') return null;
    return (
      <WalkPointMarkers
        points={routeDraft.calculation.points}
        onMove={(index, point) =>
          updateRouteDraft((c) =>
            c.mode === 'walk' ? { ...c, points: c.points.map((p, i) => (i === index ? point : p)) } : c,
          )
        }
      />
    );
  }

  if (selectedItem.calculation?.mode !== 'walk') return null;
  return (
    <WalkPointMarkers
      points={selectedItem.calculation.points}
      onMove={(index, point) =>
        updateWalkRoute(routeId, (c) => ({ points: c.points.map((p, i) => (i === index ? point : p)) }))
      }
    />
  );
}

/** Markers for the walk being drafted in the Plan Route dropdown. */
export function DraftWalkMarkers() {
  const draft = useProjectStore((s) => s.draftWalk);
  const setDraftWalk = useProjectStore((s) => s.setDraftWalk);

  if (!draft) return null;

  return (
    <WalkPointMarkers
      points={draft.points}
      onMove={(index, point) =>
        setDraftWalk({ ...draft, points: draft.points.map((p, i) => (i === index ? point : p)) })
      }
    />
  );
}
