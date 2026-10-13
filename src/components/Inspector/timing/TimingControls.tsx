import { Clock } from 'lucide-react';
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { EasingName, ExitAnimation } from '@/store/types';
import { NumberRow } from '../controls/NumberRow';
import { EasingSelect } from '../controls/EasingSelect';

export function TimingControls({
  startTime,
  endTime,
  onChangeTime,
  easing,
  onChangeEasing,
  exitAnimation,
  onChangeExitAnimation,
  showExitAnimation = false,
}: {
  startTime: number;
  endTime: number;
  onChangeTime: (start: number, end: number) => void;
  easing?: EasingName;
  onChangeEasing?: (v: EasingName) => void;
  exitAnimation?: ExitAnimation;
  onChangeExitAnimation?: (v: ExitAnimation) => void;
  showExitAnimation?: boolean;
}) {
  const duration = Math.max(0.01, +(endTime - startTime).toFixed(2));

  const handleStartChange = (newStart: number) => {
    const s = Math.max(0, newStart);
    onChangeTime(s, +(s + duration).toFixed(2));
  };

  const handleDurationChange = (newDur: number) => {
    const d = Math.max(0.01, newDur);
    onChangeTime(startTime, +(startTime + d).toFixed(2));
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2">
        <NumberRow
          label="Start time"
          value={startTime}
          onChange={handleStartChange}
          min={0}
          step={0.01}
          unit={<Clock size={12} />}
        />
        <NumberRow
          label="Duration"
          value={duration}
          onChange={handleDurationChange}
          min={0.01}
          step={0.01}
          unit="s"
        />
      </div>

      {onChangeEasing && (
        <EasingSelect value={easing} onChange={onChangeEasing} />
      )}

      {showExitAnimation && onChangeExitAnimation && (
        <div className="flex items-center justify-between gap-2 pt-1 text-xs">
          <span className="text-xs font-medium text-muted-foreground shrink-0">After end</span>
          <div className="flex-1 max-w-[200px]">
            <SegmentedControl
              options={[
                { value: 'none', label: 'Show' },
                { value: 'reverse', label: 'Hide' },
                { value: 'fade', label: 'Fade out' },
              ]}
              value={exitAnimation}
              onValueChange={onChangeExitAnimation}
              className="h-7 text-[11px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
