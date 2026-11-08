import { SegmentedControl } from '@/components/ui/segmented-control';
import type { ExitAnimation } from '@/store/types';
import type { TransitionConfig } from '@/annotations/types';
import { ENTER_TRANSITIONS, EXIT_TRANSITIONS, TRANSITION_LABELS } from '@/annotations/animation';
import { TIMING_LABELS } from '@/lib/terms';
import { RowLabel } from '../controls/RowLabel';
import { MixedTag } from '../controls/MixedTag';
import { EasingSelect } from '../controls/EasingSelect';
import { SelectRow } from '../controls/SelectRow';
import { SliderRow } from '../controls/SliderRow';
import type { MixedFields } from '../mergeValues';
import type { TimingAdapter, TimingModel, TimingPatch, TransitionChoices } from './timingAdapters';
import { transitionOptions } from './transitionOptions';

/** Callouts' enter and exit animations. */
const CALLOUT_TRANSITIONS: TransitionChoices = {
  enter: ENTER_TRANSITIONS,
  exit: EXIT_TRANSITIONS,
  labels: TRANSITION_LABELS,
  words: { enter: 'Enter', enterDuration: 'Enter duration', exit: 'Exit', exitDuration: 'Exit duration' },
};

const END_OPTIONS: { value: ExitAnimation; label: string }[] = [
  { value: 'none', label: 'Stay' },
  { value: 'reverse', label: 'Hide' },
  { value: 'fade', label: 'Fade out' },
];

/** The timing fields on which the selected clips differ. */
export interface TimingMixed {
  fields: MixedFields<TimingModel>;
  transition: MixedFields<TransitionConfig>;
}

/** How an item moves and leaves: everything in the timing section except its times. */
export function TimingBehaviour<T>({
  adapter,
  model,
  write,
  mixed,
}: {
  adapter: TimingAdapter<T>;
  model: TimingModel;
  write: (patch: TimingPatch) => unknown;
  mixed?: TimingMixed;
}) {
  const choices = adapter.transitionChoices ?? CALLOUT_TRANSITIONS;
  const whenItEndsMixed = mixed?.fields.has('whenItEnds') ?? false;
  const enterMixed = mixed?.transition.has('enter') ?? false;
  const exitMixed = mixed?.transition.has('exit') ?? false;

  return (
    <>
      {model.easing !== undefined && (
        <EasingSelect
          label={TIMING_LABELS.motion}
          value={model.easing}
          onChange={(easing) => write({ easing })}
          mixed={mixed?.fields.has('easing')}
        />
      )}

      {model.whenItEnds !== undefined && (
        <div data-slot="timing-end-behaviour" className="flex flex-col gap-1.5 pt-1 text-xs">
          <span className="flex items-center gap-1.5">
            <RowLabel label={TIMING_LABELS.whenItEnds} />
            {whenItEndsMixed && <MixedTag />}
          </span>
          <SegmentedControl
            options={END_OPTIONS}
            value={whenItEndsMixed ? null : model.whenItEnds}
            onValueChange={(whenItEnds) => write({ whenItEnds })}
            className="h-7 w-full text-2xs"
          />
        </div>
      )}

      {model.transition && (
        // With no times above it (several clips selected), this block opens the section.
        <div className="flex flex-col gap-3.5 pt-2 border-t border-border/30 first:pt-0 first:border-t-0">
          <SelectRow
            label={choices.words.enter}
            value={model.transition.enter}
            onChange={(enter) => write({ transition: { enter } })}
            options={transitionOptions(choices.enter, model.transition.enter, choices.labels)}
            mixed={enterMixed}
          />
          {/* 'none' is instant, so it has no duration. */}
          {!enterMixed && model.transition.enter !== 'none' && (
            <SliderRow
              label={choices.words.enterDuration}
              value={model.transition.enterDuration}
              onChange={(enterDuration) => write({ transition: { enterDuration } })}
              min={0}
              max={3}
              step={0.1}
              unit="s"
              mixed={mixed?.transition.has('enterDuration')}
            />
          )}
          <SelectRow
            label={choices.words.exit}
            value={model.transition.exit}
            onChange={(exit) => write({ transition: { exit } })}
            options={transitionOptions(choices.exit, model.transition.exit, choices.labels)}
            mixed={exitMixed}
          />
          {!exitMixed && model.transition.exit !== 'none' && (
            <SliderRow
              label={choices.words.exitDuration}
              value={model.transition.exitDuration}
              onChange={(exitDuration) => write({ transition: { exitDuration } })}
              min={0}
              max={3}
              step={0.1}
              unit="s"
              mixed={mixed?.transition.has('exitDuration')}
            />
          )}
        </div>
      )}
    </>
  );
}
