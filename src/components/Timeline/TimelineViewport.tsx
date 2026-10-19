import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction, type WheelEvent } from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useProjectStore } from '@/store/useProjectStore';
import type { TimelineItem } from '@/store/types';
import TimelineTrackRow, { type AutoCamBlock } from './TimelineTrackRow';
import { formatRulerLabel, formatTimelineTime, rulerSteps } from './timelineTime';
import { wheelZoomFactor, zoomBy } from './timelineZoom';
import { PlayheadIcon } from './PlayheadIcon';

const RULER_HEIGHT = 40;
const TRACK_LABEL_WIDTH = 160;

interface TimelineViewportProps {
  autoCamBlocks: AutoCamBlock[];
  duration: number;
  isMobile: boolean;
  items: TimelineItem[];
  pixelsPerSecond: number;
  rulerDiamondRef: RefObject<HTMLDivElement>;
  selectedItemId: string | null;
  selectedKeyframeId: string | null;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsScrubbing: (isScrubbing: boolean) => void;
  setPixelsPerSecond: Dispatch<SetStateAction<number>>;
  setPlayheadTime: (time: number) => void;
  timeDisplayRef: RefObject<HTMLSpanElement>;
  trackLineRef: RefObject<HTMLDivElement>;
  onSelectItem: (itemId: string) => void;
  onSelectAutoCam: (routeId: string) => void;
  onSelectKeyframe: (keyframeId: string | null) => void;
}

export default function TimelineViewport({
  autoCamBlocks,
  duration,
  isMobile,
  items,
  pixelsPerSecond,
  rulerDiamondRef,
  selectedItemId,
  selectedKeyframeId,
  setIsPlaying,
  setIsScrubbing,
  setPixelsPerSecond,
  setPlayheadTime,
  timeDisplayRef,
  trackLineRef,
  onSelectItem,
  onSelectAutoCam,
  onSelectKeyframe,
}: TimelineViewportProps) {
  const initialPlayheadX = useProjectStore.getState().playheadTime * pixelsPerSecond;

  const isScrubbingRef = useRef(false);

  // The ruler runs to the panel's edge, not just to the project's end.
  const contentRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  useEffect(() => {
    const panel = contentRef.current?.closest<HTMLElement>('[data-slot="scroll-area"]');
    if (!panel) return;
    const measure = () => setPanelWidth(panel.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  const rulerDuration = Math.max(duration, (panelWidth - TRACK_LABEL_WIDTH) / pixelsPerSecond);

  const handleRulerPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsPlaying(false);
    setIsScrubbing(true);
    isScrubbingRef.current = true;

    event.currentTarget.setPointerCapture?.(event.pointerId);

    const ruler = event.currentTarget;
    const x = event.clientX - ruler.getBoundingClientRect().left;
    setPlayheadTime(Math.max(0, Math.min(duration, x / pixelsPerSecond)));
  }, [duration, pixelsPerSecond, setIsPlaying, setIsScrubbing, setPlayheadTime]);

  const handleRulerPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    const ruler = event.currentTarget;
    const x = event.clientX - ruler.getBoundingClientRect().left;
    setPlayheadTime(Math.max(0, Math.min(duration, x / pixelsPerSecond)));
  }, [duration, pixelsPerSecond, setPlayheadTime]);

  const handleRulerPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbingRef.current) {
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }, [setIsScrubbing]);

  const handleRulerLostPointerCapture = useCallback(() => {
    if (isScrubbingRef.current) {
      isScrubbingRef.current = false;
      setIsScrubbing(false);
    }
  }, [setIsScrubbing]);

  const handleWheel = useCallback((event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    setPixelsPerSecond((value) => zoomBy(value, wheelZoomFactor(event.deltaY)));
  }, [setPixelsPerSecond]);

  return (
    <ScrollArea className="flex-1 w-full relative group min-h-0">
      <div
        ref={contentRef}
        data-testid="timeline-viewport-content"
        className="flex flex-col relative min-w-max pb-4"
        style={{ width: rulerDuration * pixelsPerSecond + TRACK_LABEL_WIDTH + 20 }}
        onWheel={handleWheel}
      >
        <div className="h-10 border-b border-border/50 relative shrink-0 bg-background/60 sticky top-0 z-30 backdrop-blur-md flex items-end">
          <div className="w-[160px] h-full bg-background/90 border-r border-border/50 shrink-0 sticky left-0 z-30 pointer-events-none flex items-center px-4">
            {isMobile && (
              <span className="text-2xs font-mono tabular-nums text-muted-foreground/70 leading-none">
                <span ref={timeDisplayRef} data-testid="playhead-time">{formatTimelineTime(useProjectStore.getState().playheadTime)}</span>
                <span className="opacity-50"> / {formatTimelineTime(duration)}</span>
              </span>
            )}
          </div>

          <div
            data-testid="timeline-ruler"
            className="flex-1 relative h-full cursor-text touch-none select-none"
            onPointerDown={handleRulerPointerDown}
            onPointerMove={handleRulerPointerMove}
            onPointerUp={handleRulerPointerUp}
            onPointerCancel={handleRulerPointerUp}
            onLostPointerCapture={handleRulerLostPointerCapture}
          >
            <TimelineRuler duration={duration} rulerDuration={rulerDuration} pixelsPerSecond={pixelsPerSecond} />
            <div
              ref={rulerDiamondRef}
              data-testid="timeline-ruler-playhead"
              className="absolute bottom-0 -translate-x-[5px] pointer-events-none transition-none z-10 drop-shadow-md"
              style={{ left: initialPlayheadX }}
            >
              <PlayheadIcon className="text-primary transition-transform duration-100 hover:scale-110" />
            </div>
          </div>
        </div>

        <div className="flex flex-col relative grow min-h-[100px] isolate">
          <div
            ref={trackLineRef}
            data-testid="timeline-track-playhead"
            className="absolute top-0 bottom-0 w-px bg-primary z-20 pointer-events-none transition-none"
            style={{ left: initialPlayheadX + TRACK_LABEL_WIDTH }}
          />

          {items.map((item) => (
            <TimelineTrackRow
              key={item.id}
              item={item}
              pixelsPerSecond={pixelsPerSecond}
              isSelected={selectedItemId === item.id}
              selectedKeyframeId={item.kind === 'camera' ? selectedKeyframeId : null}
              onSelectItem={onSelectItem}
              onSelectKeyframe={onSelectKeyframe}
              autoCamBlocks={item.kind === 'camera' ? autoCamBlocks : undefined}
              onSelectAutoCam={onSelectAutoCam}
            />
          ))}
        </div>
      </div>
      <ScrollBar orientation="horizontal" className="z-40 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <ScrollBar orientation="vertical" className="z-40 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </ScrollArea>
  );
}

function TimelineRuler({ duration, rulerDuration, pixelsPerSecond }: { duration: number; rulerDuration: number; pixelsPerSecond: number }) {
  const { labelStep, tickStep } = rulerSteps(pixelsPerSecond);

  return (
    <svg width="100%" height={RULER_HEIGHT} className="absolute left-0 top-0 pointer-events-none">
      <rect
        data-testid="timeline-ruler-past-end"
        x={duration * pixelsPerSecond}
        y={0}
        width={Math.max(0, (rulerDuration - duration) * pixelsPerSecond + 20)}
        height={RULER_HEIGHT}
        className="fill-muted-foreground opacity-15"
      />
      {Array.from({ length: Math.ceil(rulerDuration / tickStep) + 1 }, (_, index) => {
        const time = index * tickStep;
        const x = time * pixelsPerSecond;
        const labelIndex = time / labelStep;
        const isMajor = Math.abs(labelIndex - Math.round(labelIndex)) < 1e-6;

        return (
          <g key={index} className={time > duration + 1e-6 ? 'opacity-50' : undefined}>
            <line
              x1={x}
              y1={isMajor ? 18 : 28}
              x2={x}
              y2={RULER_HEIGHT}
              stroke="currentColor"
              strokeWidth={isMajor ? 1 : 0.5}
              className="text-muted-foreground opacity-40"
            />
            {isMajor && (
              <text x={x + 3} y={14} fontSize={10} className="fill-muted-foreground opacity-80 font-mono-time">
                {formatRulerLabel(time, labelStep)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
