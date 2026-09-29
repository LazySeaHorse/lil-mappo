import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Crosshair, GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';

interface WalkPointRowProps {
  id: string;
  index: number;
  coords: [number, number];
  isMoving?: boolean;
  onToggleMove?: () => void;
  onRemove: () => void;
}

const WalkPointRow = ({ id, index, coords, isMoving, onToggleMove, onRemove }: WalkPointRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2 bg-secondary/30 p-1.5 rounded-lg border border-border/40"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={13} />
      </button>
      <div className="w-5 h-5 rounded-full bg-blue-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
        {index + 1}
      </div>
      <span className="text-xs font-mono text-foreground/80 flex-1 min-w-0 truncate">
        {coords[0].toFixed(4)}, {coords[1].toFixed(4)}
      </span>
      {onToggleMove && (
        <IconButton
          variant={isMoving ? 'default' : 'outline'}
          size="xs"
          className={`rounded-lg h-6 w-6 shrink-0 ${isMoving ? 'bg-primary text-primary-foreground' : ''}`}
          onClick={onToggleMove}
          title="Move point on map"
        >
          <Crosshair size={11} className={isMoving ? 'animate-pulse text-white' : 'text-muted-foreground'} />
        </IconButton>
      )}
      <IconButton
        variant="ghost"
        size="xs"
        className="h-6 w-6 rounded shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        title="Remove point"
      >
        <Trash2 size={11} />
      </IconButton>
    </div>
  );
};

interface WalkPointListProps {
  points: [number, number][];
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  isAppending: boolean;
  onToggleAppend: () => void;
  /** Index whose map picker is active; enables per-row "move on map" buttons with onToggleMove. */
  movingIndex?: number | null;
  onToggleMove?: (index: number) => void;
}

/** Ordered, drag-to-reorder list of walk points with an "add point on map" button. */
export const WalkPointList = ({
  points,
  onReorder,
  onRemove,
  isAppending,
  onToggleAppend,
  movingIndex,
  onToggleMove,
}: WalkPointListProps) => {
  const sensors = useSensors(useSensor(PointerSensor));
  // Rows are keyed by position: reorders are committed on drop, so ids only need to be unique per render.
  const ids = points.map((_, i) => `pt-${i}`);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) onReorder(from, to);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {points.map((pt, i) => (
            <WalkPointRow
              key={ids[i]}
              id={ids[i]}
              index={i}
              coords={pt}
              isMoving={movingIndex === i}
              onToggleMove={onToggleMove && (() => onToggleMove(i))}
              onRemove={() => onRemove(i)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <Button
        type="button"
        variant={isAppending ? 'default' : 'outline'}
        size="sm"
        className="w-full h-8 mt-1 text-xs gap-1.5"
        onClick={onToggleAppend}
      >
        <Plus size={13} />
        {isAppending ? 'Click map to place point' : 'Add point on map'}
      </Button>
    </div>
  );
};
