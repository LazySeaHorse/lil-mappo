import { useCallback, type Dispatch, type MouseEvent, type RefObject, type SetStateAction, type WheelEvent } from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useProjectStore } from '@/store/useProjectStore';
import type { TimelineItem } from '@/store/types';
import TimelineTrackRow, { type AutoCamBlock } from './TimelineTrackRow';
import { formatTimelineTime } from './timelineTime';

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

  const handleRulerScrub = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsPlaying(false);
    setIsScrubbing(true);

    const ruler = event.currentTarget;
    const updateTime = (clientX: number) => {
      const x = clientX - ruler.getBoundingClientRect().left;
      setPlayheadTime(Math.max(0, Math.min(duration, x / pixelsPerSecond)));
    };
    const handleMove = (moveEvent: globalThis.MouseEvent) => updateTime(moveEvent.clientX);
    const handleUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    updateTime(event.clientX);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [duration, pixelsPerSecond, setIsPlaying, setIsScrubbing, setPlayheadTime]);

  const handleWheel = useCallback((event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    setPixelsPerSecond((value) => Math.max(10, Math.min(300, value - event.deltaY * 0.5)));
  }, [setPixelsPerSecond]);

  return (
    <ScrollArea className="flex-1 w-full relative group min-h-0">
      <div
        className="flex flex-col relative min-w-max pb-4"
        style={{ width: duration * pixelsPerSecond + TRACK_LABEL_WIDTH + 20 }}
        onWheel={handleWheel}
      >
        <div className="h-10 border-b border-border/50 relative shrink-0 bg-background/60 sticky top-0 z-30 backdrop-blur-md flex items-end">
          <div className="w-[160px] h-full bg-background/90 border-r border-border/50 shrink-0 sticky left-0 z-30 pointer-events-none flex items-center px-4">
            {isMobile && (
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70 leading-none">
                <span ref={timeDisplayRef}>{formatTimelineTime(useProjectStore.getState().playheadTime)}</span>
                <span className="opacity-50"> / {formatTimelineTime(duration)}</span>
              </span>
            )}
          </div>

          <div
            data-testid="timeline-ruler"
            className="flex-1 relative h-full cursor-text"
            onMouseDown={handleRulerScrub}
          >
            <TimelineRuler duration={duration} pixelsPerSecond={pixelsPerSecond} />
            <div
              ref={rulerDiamondRef}
              className="absolute bottom-0 -translate-x-[5px] pointer-events-none transition-none z-10 drop-shadow-md"
              style={{ left: initialPlayheadX }}
            >
              <svg width="11" height="12" viewBox="0 0 11 12" className="text-primary fill-current transition-transform duration-100 hover:scale-110">
                <path d="M0 0 H11 V6 L5.5 12 L0 6 Z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="flex flex-col relative grow min-h-[100px] isolate">
          <div
            ref={trackLineRef}
            className="absolute top-0 bottom-0 w-px bg-primary z-20 pointer-events-none transition-none"
            style={{ left: initialPlayheadX + TRACK_LABEL_WIDTH }}
          />

          {items.map((item) => (
            <TimelineTrackRow
              key={item.id}
              item={item}
              pixelsPerSecond={pixelsPerSecond}
              isSelected={selectedItemId === item.id}
              selectedKeyframeId={selectedKeyframeId}
              onSelect={() => onSelectItem(item.id)}
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

function TimelineRuler({ duration, pixelsPerSecond }: { duration: number; pixelsPerSecond: number }) {
  return (
    <svg width="100%" height={RULER_HEIGHT} className="absolute left-0 top-0 pointer-events-none">
      {Array.from({ length: Math.ceil(duration / 0.5) + 1 }, (_, index) => {
        const time = index * 0.5;
        const x = time * pixelsPerSecond;
        const isMajor = time % 1 === 0;

        return (
          <g key={index}>
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
                {Math.floor(time / 60)}:{(time % 60).toString().padStart(2, '0')}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
