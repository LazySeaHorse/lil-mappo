import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useProjectStore } from '@/store/useProjectStore';
import type { ExitAnimation } from '@/store/types';
import { ENTER_TRANSITIONS, EXIT_TRANSITIONS } from '@/annotations/animation';
import { formatTimelineTime } from '@/components/Timeline/timelineTime';
import { TIMING_LABELS } from '@/lib/terms';
import { InspectorSection } from '../InspectorSection';
import { NumberRow } from '../controls/NumberRow';
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
  const write = (patch: Parameters<typeof adapter.write>[1]) => onChange(adapter.write(item, patch));
  const setStart = (start: number) => write({ start });
  const atPlayhead = () => setStart(useProjectStore.getState().playheadTime);

  return (
    <InspectorSection kind={adapter.panel} id="timing">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2">
          <TimeRow
            label={TIMING_LABELS.starts}
            value={model.start}
            onChange={setStart}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={atPlayhead}
                className="h-8 rounded-lg px-2 text-[11px] font-medium"
              >
                {TIMING_LABELS.atPlayhead}
              </Button>
            }
          />
          {model.length !== undefined && (
            <>
              <NumberRow
                label={TIMING_LABELS.length}
                value={model.length}
                onChange={(length) => write({ length })}
                min={0.01}
                step={0.01}
                unit="s"
              />
              <ReadoutRow
                label={TIMING_LABELS.endsAt}
                value={formatTimelineTime(+(model.start + model.length).toFixed(2))}
              />
            </>
          )}
        </div>

        {model.easing !== undefined && (
          <EasingSelect label={TIMING_LABELS.motion} value={model.easing} onChange={(easing) => write({ easing })} />
        )}

        {model.whenItEnds !== undefined && (
          <div className="flex items-center justify-between gap-2 pt-1 text-xs">
            <RowLabel label={TIMING_LABELS.whenItEnds} />
            <div className="flex-1 max-w-[200px]">
              <SegmentedControl
                options={END_OPTIONS}
                value={model.whenItEnds}
                onValueChange={(whenItEnds) => write({ whenItEnds })}
                className="h-7 text-[11px]"
              />
            </div>
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
