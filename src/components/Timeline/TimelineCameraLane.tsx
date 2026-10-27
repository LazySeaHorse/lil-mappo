import React, { useCallback } from 'react';
import { Eye, EyeOff, Video } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { useProjectStore } from '@/store/useProjectStore';
import type { CameraItem } from '@/store/types';
import { CAMERA_VIEW_TERMS } from '@/lib/terms';
import { TIMELINE_GUTTER_WIDTH } from '@/constants/layout';
import { nearestSnap, SNAP_PIXELS, snapTimes } from './timelineSnap';
import type { TimelineDragHandlers } from './useTimelineLanes';

export interface AutoCamBlock {
  routeId: string;
  routeName: string;
  startTime: number;
  endTime: number;
}

interface TimelineCameraLaneProps {
  item: CameraItem;
  pixelsPerSecond: number;
  isSelected: boolean;
  selectedKeyframeId: string | null;
  onSelectItem: (itemId: string) => void;
  onSelectKeyframe: (id: string | null) => void;
  autoCamBlocks: AutoCamBlock[];
  onSelectAutoCam: (routeId: string) => void;
  drag: TimelineDragHandlers;
}

/** The camera's own lane at the top of the timeline: its camera views and the Auto Cam spans. */
const TimelineCameraLane = React.memo(({
  item,
  pixelsPerSecond,
  isSelected,
  selectedKeyframeId,
  onSelectItem,
  onSelectKeyframe,
  autoCamBlocks,
  onSelectAutoCam,
  drag,
}: TimelineCameraLaneProps) => {
  const isCameraEnabled = useProjectStore((state) => state.isCameraEnabled);
  const setIsCameraEnabled = useProjectStore((state) => state.setIsCameraEnabled);
  const handleSelect = useCallback(() => onSelectItem(item.id), [item.id, onSelectItem]);

  const keyframeDragRef = React.useRef<{
    startX: number;
    initialTime: number;
    keyframeId: string;
    snapTimes: number[];
  } | null>(null);

  const handleKeyframePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    keyframeId: string,
    initialTime: number,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    handleSelect();
    onSelectKeyframe(keyframeId);

    event.currentTarget.setPointerCapture?.(event.pointerId);

    keyframeDragRef.current = {
      startX: event.clientX,
      initialTime,
      keyframeId,
      snapTimes: snapTimes(useProjectStore.getState(), { keyframeId }),
    };
  };

  const handleKeyframePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const keyframeDrag = keyframeDragRef.current;
    if (!keyframeDrag) return;

    const { updateCameraKeyframe, duration } = useProjectStore.getState();
    const proposed = keyframeDrag.initialTime + (event.clientX - keyframeDrag.startX) / pixelsPerSecond;
    const snapped = nearestSnap(proposed, keyframeDrag.snapTimes, SNAP_PIXELS / pixelsPerSecond);
    drag.showSnap(snapped);
    updateCameraKeyframe(keyframeDrag.keyframeId, { time: Math.max(0, Math.min(duration, snapped ?? proposed)) });
  };

  const endKeyframeDrag = () => {
    if (!keyframeDragRef.current) return;
    keyframeDragRef.current = null;
    drag.end();
  };

  const handleKeyframePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    endKeyframeDrag();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      data-agent-item={item.id}
      className={`flex h-10 border-b border-border/30 cursor-pointer group transition-all ${isSelected ? 'bg-primary/5' : 'hover:bg-secondary/40'} ${!isCameraEnabled ? 'opacity-40 grayscale-[0.5]' : ''}`}
      onClick={handleSelect}
    >
      <div
        className="shrink-0 sticky left-0 z-10 flex items-center justify-center gap-1 border-r border-border/50 bg-background/90 backdrop-blur-sm"
        style={{ width: TIMELINE_GUTTER_WIDTH }}
      >
        <Video size={12} className={isSelected ? 'text-primary' : 'text-muted-foreground'} aria-label={CAMERA_VIEW_TERMS.track} />
        <IconButton
          variant="ghost"
          size="xs"
          className="hover:text-primary"
          title={isCameraEnabled ? 'Hide Camera' : 'Show Camera'}
          onClick={(event) => {
            event.stopPropagation();
            setIsCameraEnabled(!isCameraEnabled);
          }}
        >
          {isCameraEnabled ? <Eye size={12} /> : <EyeOff size={12} className="text-destructive" />}
        </IconButton>
      </div>

      {/* isolate keeps keyframes (z-10, z-20) under the sticky gutter when the timeline scrolls sideways */}
      <div className="flex-1 relative isolate">
        {autoCamBlocks.map((block) => {
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
                  onSelectAutoCam(block.routeId);
                }}
                title={`Auto Cam: ${block.routeName}`}
              />
              <AutoCamBoundaryMarker left={startX} />
              <AutoCamBoundaryMarker left={endX} />
            </React.Fragment>
          );
        })}

        {item.keyframes.map((keyframe) => {
          const isDisabled = autoCamBlocks.some(
            (block) => keyframe.time >= block.startTime && keyframe.time <= block.endTime,
          );

          return (
            <div
              key={keyframe.id}
              data-walkthrough="timeline-keyframe"
              data-agent-keyframe={keyframe.id}
              data-testid={`timeline-keyframe-${keyframe.id}`}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-ew-resize transition-transform z-10 select-none touch-none
                ${isDisabled ? 'opacity-35 grayscale pointer-events-none' : selectedKeyframeId === keyframe.id ? 'scale-125 z-20' : 'hover:scale-110'} active:scale-95`}
              style={{ left: keyframe.time * pixelsPerSecond }}
              onPointerDown={(event) => !isDisabled && handleKeyframePointerDown(event, keyframe.id, keyframe.time)}
              onPointerMove={handleKeyframePointerMove}
              onPointerUp={handleKeyframePointerUp}
              onPointerCancel={handleKeyframePointerUp}
              onLostPointerCapture={endKeyframeDrag}
              onClick={(event) => {
                event.stopPropagation();
                handleSelect();
                onSelectKeyframe(keyframe.id);
              }}
            >
              <div
                className={`w-3.5 h-3.5 rotate-45 rounded-[2px] shadow-sm border pointer-events-none ${
                  selectedKeyframeId === keyframe.id && !isDisabled
                    ? 'bg-primary border-primary ring-2 ring-primary/30 ring-offset-1 ring-offset-background'
                    : 'bg-background border-primary'
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

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

TimelineCameraLane.displayName = 'TimelineCameraLane';

export default TimelineCameraLane;
