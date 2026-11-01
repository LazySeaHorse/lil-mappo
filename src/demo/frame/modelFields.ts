import type { ModelItem } from '@/store/types';
import { MODEL_TERMS, MODEL_TRANSITION_LABELS } from '@/models/modelTerms';
import { TIMING_LABELS } from '@/lib/terms';
import type { FieldControl, FieldTable } from './fields';
import { diffLeaves, orderEdits, type FieldEdit } from './plan';

/**
 * Which on-screen control edits which field of a placed 3D model, read off
 * ModelInspector and its timing section. The name (the panel's title field) and
 * the log-scaled Size slider are worked by the runner; the position is set by
 * the place step, and the final write settles what is left.
 */

const transitionLabel = (value: unknown) => MODEL_TRANSITION_LABELS[value as keyof typeof MODEL_TRANSITION_LABELS] ?? String(value);

const timing = (): Record<string, FieldControl<ModelItem>> => ({
  startTime: { section: 'timing', label: TIMING_LABELS.start, control: 'time' },
  endTime: { section: 'timing', label: TIMING_LABELS.end, control: 'time' },
  'transition.enter': { section: 'timing', label: MODEL_TERMS.enter, control: 'select', option: transitionLabel },
  'transition.enterDuration': {
    section: 'timing',
    label: MODEL_TERMS.enterDuration,
    control: 'slider',
    shown: (live) => live.transition.enter !== 'none',
  },
  'transition.exit': { section: 'timing', label: MODEL_TERMS.exit, control: 'select', option: transitionLabel },
  'transition.exitDuration': {
    section: 'timing',
    label: MODEL_TERMS.exitDuration,
    control: 'slider',
    shown: (live) => live.transition.exit !== 'none',
  },
});

export const MODEL_FIELDS: FieldTable<ModelItem> = {
  kind: 'model',
  fields: {
    altitude: { section: 'location', label: MODEL_TERMS.altitude, control: 'slider' },
    heading: { section: 'rotation', label: MODEL_TERMS.heading, control: 'slider' },
    pitch: { section: 'rotation', label: MODEL_TERMS.tilt, control: 'slider' },
    roll: { section: 'rotation', label: MODEL_TERMS.roll, control: 'slider' },
    ...timing(),
  },
};

/** The model panel's fields in screen order, top to bottom. */
export const MODEL_FIELD_ORDER = [
  'name',
  'position',
  'altitude',
  'heading',
  'pitch',
  'roll',
  'scale',
  'startTime',
  'endTime',
  'transition.enter',
  'transition.enterDuration',
  'transition.exit',
  'transition.exitDuration',
] as const;

/** Never edited on screen: identity, and the asset (the app's import makes its own). */
const SKIP = ['id', 'kind', 'assetId'];

/** The inspector edits that turn `base` (the model as it is on screen) into the file's model, in screen order. */
export function modelEdits(base: ModelItem, target: ModelItem): FieldEdit[] {
  const edits = orderEdits(diffLeaves(base, target, SKIP), MODEL_FIELD_ORDER);
  // The end of a later span is set first: the timing panel refuses a start at or past the end.
  const start = edits.find((e) => e.path === 'startTime');
  const end = edits.find((e) => e.path === 'endTime');
  if (!start || !end || (start.value as number) < base.endTime) return edits;
  const out = [...edits];
  out[edits.indexOf(start)] = end;
  out[edits.indexOf(end)] = start;
  return out;
}
