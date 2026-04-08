import React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Lock, Type, ImageIcon, Stamp } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import type { VideoOverlay } from '@/store/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Sortable row ─────────────────────────────────────────────────────────────

function OverlayRow({
  overlay,
  isSelected,
  onSelect,
}: {
  overlay: VideoOverlay;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { updateOverlay } = useProjectStore();
  const isWatermark = overlay.kind === 'watermark';

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: overlay.id, disabled: isWatermark });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = overlay.kind === 'watermark'
    ? Stamp
    : overlay.kind === 'image'
      ? ImageIcon
      : Type;

  const label = overlay.kind === 'watermark'
    ? 'Watermark'
    : overlay.kind === 'image'
      ? 'Image'
      : (overlay.text || 'Text');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-xl cursor-pointer transition-colors select-none',
        isSelected
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-secondary/60 text-foreground',
        isDragging && 'opacity-50 shadow-xl z-50',
      )}
      onClick={onSelect}
    >
      {/* Drag handle — hidden for watermark */}
      <div
        className={cn(
          'shrink-0 text-muted-foreground/40 transition-opacity',
          isWatermark ? 'pointer-events-none opacity-0' : 'cursor-grab group-hover:opacity-80',
        )}
        {...(isWatermark ? {} : { ...attributes, ...listeners })}
      >
        <GripVertical size={14} />
      </div>

      {/* Kind icon */}
      <Icon size={13} className="shrink-0 opacity-60" />

      {/* Label */}
      <span className="flex-1 text-xs font-medium truncate" title={label}>
        {label}
      </span>

      {/* Lock badge for watermark */}
      {isWatermark && (
        <Lock size={10} className="shrink-0 text-muted-foreground/50" />
      )}

      {/* Visibility toggle */}
      <button
        className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors p-0.5 rounded"
        onClick={(e) => {
          e.stopPropagation();
          updateOverlay(overlay.id, { enabled: !overlay.enabled });
        }}
        title={overlay.enabled ? 'Hide overlay' : 'Show overlay'}
      >
        {overlay.enabled
          ? <Eye size={13} />
          : <EyeOff size={13} className="text-muted-foreground/30" />
        }
      </button>
    </div>
  );
}

// ─── Main list ────────────────────────────────────────────────────────────────

interface OverlayListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddText: () => void;
  onAddImage: () => void;
}

export function OverlayList({ selectedId, onSelect, onAddText, onAddImage }: OverlayListProps) {
  const { overlays, reorderOverlays } = useProjectStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = overlays.findIndex((o) => o.id === active.id);
    const newIndex = overlays.findIndex((o) => o.id === over.id);

    // Never allow anything above the watermark (index 0)
    if (newIndex === 0) return;

    reorderOverlays(arrayMove(overlays, oldIndex, newIndex));
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto py-1 space-y-0.5 pr-0.5" style={{ scrollbarWidth: 'none' }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={overlays.map((o) => o.id)} strategy={verticalListSortingStrategy}>
            {overlays.map((overlay) => (
              <OverlayRow
                key={overlay.id}
                overlay={overlay}
                isSelected={selectedId === overlay.id}
                onSelect={() => onSelect(overlay.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Add buttons */}
      <div className="pt-2 border-t border-border/40 flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs gap-1.5 rounded-xl"
          onClick={onAddText}
        >
          <Type size={12} />
          Text
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs gap-1.5 rounded-xl"
          onClick={onAddImage}
        >
          <ImageIcon size={12} />
          Image
        </Button>
      </div>
    </div>
  );
}
