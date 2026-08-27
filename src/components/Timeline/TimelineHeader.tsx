import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Slider } from '@/components/ui/slider';
import { useProjectStore } from '@/store/useProjectStore';
import { formatTimelineTime } from './timelineTime';

interface TimelineHeaderProps {
  duration: number;
  fps: number;
  isMobile: boolean;
  isPlaying: boolean;
  pixelsPerSecond: number;
  setIsPlaying: (isPlaying: boolean) => void;
  setPixelsPerSecond: Dispatch<SetStateAction<number>>;
  setPlayheadTime: (time: number) => void;
  timeDisplayRef: RefObject<HTMLSpanElement>;
  onFitToTimeline: () => void;
}

export default function TimelineHeader({
  duration,
  fps,
  isMobile,
  isPlaying,
  pixelsPerSecond,
  setIsPlaying,
  setPixelsPerSecond,
  setPlayheadTime,
  timeDisplayRef,
  onFitToTimeline,
}: TimelineHeaderProps) {
  const transport = (
    <TransportControls
      setPlayheadTime={setPlayheadTime}
      isPlaying={isPlaying}
      setIsPlaying={setIsPlaying}
      duration={duration}
      fps={fps}
    />
  );

  return (
    <div
      className="border-b border-border/50 flex items-center px-3 shrink-0 bg-background/40 rounded-t-2xl relative"
      style={{ height: 48 }}
    >
      {!isMobile ? (
        <div className="flex flex-col gap-0.5 shrink-0">
          <span className="font-medium text-xs text-foreground/80 leading-none">Timeline</span>
          <TimelineTimecode timeDisplayRef={timeDisplayRef} duration={duration} />
        </div>
      ) : (
        <div className="flex items-center gap-0.5">{transport}</div>
      )}

      {!isMobile && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-0.5 pointer-events-auto">{transport}</div>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <IconButton
          variant="ghost"
          size="xs"
          onClick={() => setPixelsPerSecond((value) => Math.max(10, value - 15))}
          title="Zoom Out"
        >
          <Minus />
        </IconButton>
        <div className="w-20 px-1">
          <Slider
            min={10}
            max={300}
            step={1}
            value={[pixelsPerSecond]}
            onValueChange={([value]) => setPixelsPerSecond(value)}
            className="cursor-pointer"
            title={`Zoom: ${Math.round(pixelsPerSecond)}px/s`}
          />
        </div>
        <IconButton
          variant="ghost"
          size="xs"
          onClick={() => setPixelsPerSecond((value) => Math.min(300, value + 15))}
          title="Zoom In"
        >
          <Plus />
        </IconButton>
        <IconButton variant="ghost" size="xs" onClick={onFitToTimeline} title="Fit to Timeline">
          <Maximize2 />
        </IconButton>
      </div>
    </div>
  );
}

function TimelineTimecode({
  timeDisplayRef,
  duration,
}: {
  timeDisplayRef: RefObject<HTMLSpanElement>;
  duration: number;
}) {
  return (
    <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70 leading-none">
      <span ref={timeDisplayRef}>{formatTimelineTime(useProjectStore.getState().playheadTime)}</span>
      <span className="opacity-50"> / {formatTimelineTime(duration)}</span>
    </span>
  );
}

interface TransportControlsProps {
  setPlayheadTime: (time: number) => void;
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  duration: number;
  fps: number;
}

function TransportControls({
  setPlayheadTime,
  isPlaying,
  setIsPlaying,
  duration,
  fps,
}: TransportControlsProps) {
  return (
    <>
      <IconButton variant="ghost" size="xs" onClick={() => setPlayheadTime(0)} title="Jump to Start ([)">
        <SkipBack />
      </IconButton>
      <IconButton
        data-walkthrough="timeline-play"
        variant="ghost"
        size="xs"
        onClick={() => setPlayheadTime(Math.max(0, useProjectStore.getState().playheadTime - 1 / fps))}
        title="Step Back (←)"
      >
        <ChevronLeft />
      </IconButton>
      <IconButton
        variant="ghost"
        size="xs"
        onClick={() => setIsPlaying(!isPlaying)}
        title="Play / Pause (Space)"
        className={isPlaying ? 'text-primary' : ''}
      >
        {isPlaying ? <Pause /> : <Play />}
      </IconButton>
      <IconButton
        variant="ghost"
        size="xs"
        onClick={() => setPlayheadTime(Math.min(duration, useProjectStore.getState().playheadTime + 1 / fps))}
        title="Step Forward (→)"
      >
        <ChevronRight />
      </IconButton>
      <IconButton
        variant="ghost"
        size="xs"
        onClick={() => setPlayheadTime(duration)}
        title="Jump to End (])"
      >
        <SkipForward />
      </IconButton>
    </>
  );
}
