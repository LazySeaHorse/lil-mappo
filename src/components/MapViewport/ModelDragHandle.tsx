import { Marker } from 'react-map-gl/mapbox';
import type { MarkerDragEvent } from 'react-map-gl/mapbox';
import { Box } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { MODEL_TERMS } from '@/models/modelTerms';

/** A handle at the selected 3D model's base: drag it to move the model. Hidden while playing or exporting. */
export function ModelDragHandle() {
  const item = useProjectStore((s) => {
    const selected = s.selectedItemId ? s.items[s.selectedItemId] : null;
    return selected?.kind === 'model' && !s.isPlaying && !s.isExporting ? selected : null;
  });
  const updateItem = useProjectStore((s) => s.updateItem);
  if (!item) return null;

  const move = (e: MarkerDragEvent) => updateItem(item.id, { position: [e.lngLat.lng, e.lngLat.lat] });

  return (
    <Marker
      longitude={item.position[0]}
      latitude={item.position[1]}
      draggable
      anchor="center"
      onDrag={move}
      onDragEnd={move}
    >
      <div
        className="flex h-6 w-6 cursor-grab items-center justify-center rounded-full bg-teal-500 text-white shadow-lg ring-2 ring-white active:cursor-grabbing"
        title={MODEL_TERMS.dragHint}
        aria-label={MODEL_TERMS.dragHint}
        role="img"
      >
        <Box size={12} aria-hidden="true" />
      </div>
    </Marker>
  );
}
