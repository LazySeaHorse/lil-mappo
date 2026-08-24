import React, { useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { useProjectStore } from '@/store/useProjectStore';
import type {
  BoundaryItem,
  CalloutItem,
  CameraItem,
  RouteItem,
  TimelineItem,
} from '@/store/types';
import TimelineItemBar from './TimelineItemBar';

export interface AutoCamBlock {
  routeId: string;
  routeName: string;
  startTime: number;
  endTime: number;
}

interface TimelineTrackRowProps {
  item: TimelineItem;
  pixelsPerSecond: number;
  isSelected: boolean;
  selectedKeyframeId: string | null;
  onSelectItem: (itemId: string) => void;
  onSelectKeyframe: (id: string | null) => void;
  autoCamBlocks?: AutoCamBlock[];
  onSelectAutoCam?: (routeId: string) => void;
}

const TimelineTrackRow = React.memo(({
  item,
  pixelsPerSecond,
  isSelected,
  selectedKeyframeId,
  onSelectItem,
  onSelectKeyframe,
  autoCamBlocks,
  onSelectAutoCam,
}: TimelineTrackRowProps) => {
  const isCameraEnabled = useProjectStore((state) => state.isCameraEnabled);
  const setIsCameraEnabled = useProjectStore((state) => state.setIsCameraEnabled);
  const handleSelect = useCallback(() => onSelectItem(item.id), [item.id, onSelectItem]);

  const colorClass = item.kind === 'route'
    ? 'bg-item-route'
    : item.kind === 'boundary'
      ? 'bg-item-boundary'
      : item.kind === 'callout'
        ? 'bg-item-callout'
        : 'bg-item-camera';

  const label = item.kind === 'camera'
    ? 'Camera'
    : item.kind === 'route'
      ? item.name
      : item.kind === 'boundary'
        ? item.placeName || 'Boundary'
        : item.title;

  const handleKeyframeMouseDown = (event: React.MouseEvent, keyframeId: string, initialTime: number) => {
    event.stopPropagation();
    event.preventDefault();
    handleSelect();
    onSelectKeyframe(keyframeId);

    const startX = event.clientX;
    const updateKeyframe = useProjectStore.getState().updateCameraKeyframe;
    const duration = useProjectStore.getState().duration;

    const handleMove = (moveEvent: MouseEvent) => {
      const deltaTime = (moveEvent.clientX - startX) / pixelsPerSecond;
      const newTime = Math.max(0, Math.min(duration, initialTime + deltaTime));
      updateKeyframe(keyframeId, { time: newTime });
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
    };

    document.body.style.cursor = 'ew-resize';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  return (
    <div
      className={`flex h-10 border-b border-border/30 cursor-pointer group transition-all ${isSelected ? 'bg-primary/5' : 'hover:bg-secondary/40'} ${item.kind === 'camera' && !isCameraEnabled ? 'opacity-40 grayscale-[0.5]' : ''}`}
      onClick={handleSelect}
    >
      <div className={`w-[160px] shrink-0 sticky left-0 z-10 flex items-center px-4 gap-2.5 border-r border-border/50 bg-background/90 backdrop-blur-sm transition-colors ${isSelected ? 'border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}>
        <div className={`w-2 h-2 rounded-full ${colorClass} shadow-sm`} />
        <span className={`text-xs truncate font-medium flex-1 ${isSelected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
          {label}
        </span>

        {item.kind === 'camera' && (
          <IconButton
            variant="ghost"
            size="xs"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 data-[enabled=false]:opacity-100 hover:text-primary transition-all"
            data-enabled={isCameraEnabled}
            title={isCameraEnabled ? 'Hide Camera' : 'Show Camera'}
            onClick={(event) => {
              event.stopPropagation();
              setIsCameraEnabled(!isCameraEnabled);
            }}
          >
            {isCameraEnabled ? <Eye size={12} /> : <EyeOff size={12} className="text-destructive" />}
          </IconButton>
        )}
      </div>

      <div className="flex-1 relative">
        {item.kind === 'camera' ? (
          <CameraTrackContent
            item={item}
            pixelsPerSecond={pixelsPerSecond}
            selectedKeyframeId={selectedKeyframeId}
            autoCamBlocks={autoCamBlocks}
            onSelect={handleSelect}
            onSelectKeyframe={onSelectKeyframe}
            onSelectAutoCam={onSelectAutoCam}
            onKeyframeMouseDown={handleKeyframeMouseDown}
          />
        ) : (
          <TimelineItemBar
            item={item as RouteItem | BoundaryItem | CalloutItem}
            pixelsPerSecond={pixelsPerSecond}
            colorClass={colorClass}
            onSelect={handleSelect}
          />
        )}
      </div>
    </div>
  );
});

interface CameraTrackContentProps {
  item: CameraItem;
  pixelsPerSecond: number;
  selectedKeyframeId: string | null;
  autoCamBlocks?: AutoCamBlock[];
  onSelect: () => void;
  onSelectKeyframe: (id: string | null) => void;
  onSelectAutoCam?: (routeId: string) => void;
  onKeyframeMouseDown: (event: React.MouseEvent, keyframeId: string, initialTime: number) => void;
}

function CameraTrackContent({
  item,
  pixelsPerSecond,
  selectedKeyframeId,
  autoCamBlocks,
  onSelect,
  onSelectKeyframe,
  onSelectAutoCam,
  onKeyframeMouseDown,
}: CameraTrackContentProps) {
  return (
    <>
      {autoCamBlocks?.map((block) => {
        const startX = block.startTime * pixelsPerSecond;
        const endX = block.endTime * pixelsPerSecond;

        return (
          <React.Fragment key={block.routeId}>
            <div
              data-testid={`timeline-auto-cam-${block.routeId}`}
              className="absolute top-2 bottom-2 bg-primary/10 border-t border-b border-primary/20 cursor-pointer z-[5]"
              style={{ left: startX, width: Math.max(0, endX - startX) }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectAutoCam?.(block.routeId);
              }}
              title={`Auto Cam: ${block.routeName}`}
            />
            <AutoCamBoundaryMarker left={startX} />
            <AutoCamBoundaryMarker left={endX} />
          </React.Fragment>
        );
      })}

      {item.keyframes.map((keyframe) => {
        const isDisabled = autoCamBlocks?.some(
          (block) => keyframe.time >= block.startTime && keyframe.time <= block.endTime,
        ) ?? false;

        return (
          <div
            key={keyframe.id}
            data-testid={`timeline-keyframe-${keyframe.id}`}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer transition-transform z-10
              ${isDisabled ? 'opacity-35 grayscale' : selectedKeyframeId === keyframe.id ? 'scale-125 z-20' : 'hover:scale-110'} active:scale-95`}
            style={{ left: keyframe.time * pixelsPerSecond }}
            onMouseDown={(event) => onKeyframeMouseDown(event, keyframe.id, keyframe.time)}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
              onSelectKeyframe(keyframe.id);
            }}
          >
            <div
              className={`w-3.5 h-3.5 rotate-45 rounded-[2px] shadow-sm border ${
                selectedKeyframeId === keyframe.id && !isDisabled
                  ? 'bg-primary border-primary ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
                  : 'bg-background border-primary'
              }`}
            />
          </div>
        );
      })}
    </>
  );
}

function AutoCamBoundaryMarker({ left }: { left: number }) {
  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 pointer-events-none"
      style={{ left }}
    >
      <div className="w-3.5 h-3.5 rotate-45 rounded-[2px] bg-background border border-primary shadow-sm" />
    </div>
  );
}

TimelineTrackRow.displayName = 'TimelineTrackRow';

export default TimelineTrackRow;
