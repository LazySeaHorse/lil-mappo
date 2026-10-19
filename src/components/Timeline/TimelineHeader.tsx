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
import { ZOOM_BUTTON_FACTOR, type ZoomBounds, ZOOM_SLIDER_MAX, sliderToZoom, zoomBy, zoomToSlider } from './timelineZoom';
import { useProjectStore } from '@/store/useProjectStore';
import { formatTimelineTime } from './timelineTime';
import { VideoLengthControl } from './VideoLengthControl';

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
  zoomBounds: ZoomBounds;
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
  zoomBounds,
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
      data-ph-unmask
      className="border-b border-border/50 flex items-center px-3 shrink-0 bg-background/40 rounded-t-2xl relative"
      style={{ height: 48 }}
    >
      {!isMobile ? (
        <div className="flex flex-col gap-0.5 shrink-0">
          <span className="font-medium text-xs text-foreground/80 leading-none">Timeline</span>
          <TimelineTimecode timeDisplayRef={timeDisplayRef} />
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
          onClick={() => setPixelsPerSecond((value) => zoomBy(value, 1 / ZOOM_BUTTON_FACTOR, zoomBounds))}
          title="Zoom Out"
        >
          <Minus />
        </IconButton>
        <div className="w-20 px-1">
          <Slider
            min={0}
            max={ZOOM_SLIDER_MAX}
            step={1}
            value={[zoomToSlider(pixelsPerSecond, zoomBounds) * ZOOM_SLIDER_MAX]}
            onValueChange={([value]) => setPixelsPerSecond(sliderToZoom(value / ZOOM_SLIDER_MAX, zoomBounds))}
            className="cursor-pointer"
            title={`Zoom: ${Math.round(pixelsPerSecond)}px/s`}
          />
        </div>
        <IconButton
          variant="ghost"
          size="xs"
          onClick={() => setPixelsPerSecond((value) => zoomBy(value, ZOOM_BUTTON_FACTOR, zoomBounds))}
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

function TimelineTimecode({ timeDisplayRef }: { timeDisplayRef: RefObject<HTMLSpanElement> }) {
  return (
    <span className="text-2xs font-mono tabular-nums text-muted-foreground/70 leading-none">
      <span ref={timeDisplayRef} data-testid="playhead-time">{formatTimelineTime(useProjectStore.getState().playheadTime)}</span>
      <span className="opacity-50"> / </span>
      <VideoLengthControl />
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
      <IconButton data-walkthrough="timeline-start" variant="ghost" size="xs" onClick={() => setPlayheadTime(0)} title="Jump to Start ([)">
        <SkipBack />
      </IconButton>
      <IconButton
        variant="ghost"
        size="xs"
        onClick={() => setPlayheadTime(Math.max(0, useProjectStore.getState().playheadTime - 1 / fps))}
        title="Step Back (←)"
      >
        <ChevronLeft />
      </IconButton>
      <IconButton
        data-walkthrough="timeline-play"
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
