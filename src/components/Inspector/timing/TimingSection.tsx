import { SegmentedControl } from '@/components/ui/segmented-control';
import { useProjectStore } from '@/store/useProjectStore';
import type { ExitAnimation } from '@/store/types';
import { ENTER_TRANSITIONS, EXIT_TRANSITIONS } from '@/annotations/animation';
import { TIMING_LABELS } from '@/lib/terms';
import { cn } from '@/lib/utils';
import { InspectorSection } from '../InspectorSection';
import { TimeRow } from '../controls/TimeRow';
import { ReadoutRow } from '../controls/ReadoutRow';
import { RowLabel } from '../controls/RowLabel';
import { EasingSelect } from '../controls/EasingSelect';
import { SelectRow } from '../controls/SelectRow';
import { SliderRow } from '../controls/SliderRow';
import type { TimingAdapter } from './timingAdapters';
import { transitionOptions } from './transitionOptions';

const END_OPTIONS: { value: ExitAnimation; label: string }[] = [
  { value: 'none', label: 'Stay' },
  { value: 'reverse', label: 'Hide' },
  { value: 'fade', label: 'Fade out' },
];

/**
 * The one timing section for every item. The adapter says which fields the
 * kind of item has; `onChange` gets the store update to apply.
 */
export function TimingSection<T>({
  adapter,
  item,
  onChange,
}: {
  adapter: TimingAdapter<T>;
  item: T;
  onChange: (updates: Partial<T>) => void;
}) {
  const model = adapter.read(item);
  // An empty update is a change the adapter rejected (e.g. an end before the start).
  const write = (patch: Parameters<typeof adapter.write>[1]) => {
    const updates = adapter.write(item, patch);
    if (Object.keys(updates).length === 0) return false;
    onChange(updates);
    return true;
  };
  const hasLength = model.length !== undefined && model.end !== undefined;
  const playhead = () => useProjectStore.getState().playheadTime;
  // The playhead buttons set that edge, as typing the time would. When the other edge is
  // in the way, the item moves to the playhead and keeps its length.
  const startAtPlayhead = () => {
    const t = playhead();
    if (!hasLength || !write({ start: t, end: model.end })) write({ start: t });
  };
  const endAtPlayhead = () => {
    const t = playhead();
    if (!write({ end: t })) write({ start: t - model.length! });
  };

  return (
    <InspectorSection kind={adapter.panel} id="timing">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2">
          <div data-slot="timing-times" className={cn("grid gap-2", hasLength ? "grid-cols-2" : "grid-cols-1")}>
            <TimeRow
              label={TIMING_LABELS.start}
              value={model.start}
              // With an end, a new start trims the start edge and the end stays.
              onChange={(start) => write(hasLength ? { start, end: model.end } : { start })}
              onUsePlayhead={startAtPlayhead}
            />
            {hasLength && (
              <TimeRow
                label={TIMING_LABELS.end}
                value={model.end!}
                onChange={(end) => write({ end })}
                onUsePlayhead={endAtPlayhead}
              />
            )}
          </div>
          {hasLength && (
            <ReadoutRow label={TIMING_LABELS.length} value={`${model.length!.toFixed(2)} s`} />
          )}
        </div>

        {model.easing !== undefined && (
          <EasingSelect label={TIMING_LABELS.motion} value={model.easing} onChange={(easing) => write({ easing })} />
        )}

        {model.whenItEnds !== undefined && (
          <div data-slot="timing-end-behaviour" className="flex flex-col gap-1.5 pt-1 text-xs">
            <RowLabel label={TIMING_LABELS.whenItEnds} />
            <SegmentedControl
              options={END_OPTIONS}
              value={model.whenItEnds}
              onValueChange={(whenItEnds) => write({ whenItEnds })}
              className="h-7 w-full text-[11px]"
            />
          </div>
        )}

        {model.transition && (
          <div className="flex flex-col gap-3.5 pt-2 border-t border-border/30">
            <SelectRow
              label="Enter"
              value={model.transition.enter}
              onChange={(enter) => write({ transition: { enter } })}
              options={transitionOptions(ENTER_TRANSITIONS, model.transition.enter)}
            />
            <SliderRow
              label="Enter duration"
              value={model.transition.enterDuration}
              onChange={(enterDuration) => write({ transition: { enterDuration } })}
              min={0}
              max={3}
              step={0.1}
              unit="s"
            />
            <SelectRow
              label="Exit"
              value={model.transition.exit}
              onChange={(exit) => write({ transition: { exit } })}
              options={transitionOptions(EXIT_TRANSITIONS, model.transition.exit)}
            />
            <SliderRow
              label="Exit duration"
              value={model.transition.exitDuration}
              onChange={(exitDuration) => write({ transition: { exitDuration } })}
              min={0}
              max={3}
              step={0.1}
              unit="s"
            />
          </div>
        )}
      </div>
    </InspectorSection>
  );
}
