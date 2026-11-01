import { getStyle } from '@/annotations/registry';
import { accentControls } from '@/annotations/accent';
import { TRANSITION_LABELS } from '@/annotations/animation';
import type { AnnotationContent, ControlDefinition } from '@/annotations/types';
import type { CalloutItem } from '@/store/types';
import { ACCENT_TERMS, CALLOUT_LOCATION_TERMS, CALLOUT_TEXT_TERMS, TIMING_LABELS } from '@/lib/terms';
import type { FieldControl, FieldTable } from './fields';
import { diffLeaves, orderEdits, type FieldEdit } from './plan';

/**
 * Which on-screen control edits which callout field, read off the callout
 * inspector (AnnotationInspector, ContentFields, DynamicControls, SizeControls
 * and the timing section). The style-specific rows come from the style's own
 * `controls`, the way DynamicControls draws them. Fields with no entry (the
 * image, the offset and anchor, the exact coordinates) are written by the
 * step's final write.
 */

/** The text fields typed by their accessible name: the content slot they belong to and the name. */
export const CALLOUT_TEXT_FIELDS: Record<string, { slot: keyof AnnotationContent; name: string }> = {
  'content.eyebrow': { slot: 'eyebrow', name: CALLOUT_TEXT_TERMS.topLine },
  'content.subtitle': { slot: 'subtitle', name: 'Subtitle' },
  'content.body': { slot: 'body', name: 'Body' },
  'content.metric.value': { slot: 'metric', name: 'Number value' },
  'content.metric.unit': { slot: 'metric', name: 'Number unit' },
  'content.metric.label': { slot: 'metric', name: 'Number label' },
  'content.badge': { slot: 'badge', name: 'Badge' },
};

export interface CalloutFieldTable {
  table: FieldTable<CalloutItem>;
  /** Paths whose row sits in the closed "Customize colors" group. */
  folded: ReadonlySet<string>;
}

type ColorControl = Extract<ControlDefinition, { type: 'color' }>;

const optionLabel = (options: Array<{ value: string; label: string }>) => (value: unknown) =>
  options.find((o) => o.value === value)?.label ?? String(value);

/** The row for one style control, or null when it has none on screen. */
function styleField(control: ControlDefinition): FieldControl<CalloutItem> | null {
  const base = { section: 'appearance', label: control.label };
  const shown = control.when
    ? { shown: (live: CalloutItem) => live.settings[control.when!.key] === control.when!.equals }
    : {};
  switch (control.type) {
    case 'color':
      return { ...base, control: 'color', ...shown };
    case 'slider':
      return { ...base, control: 'slider', ...shown };
    case 'switch':
      return { ...base, control: 'switch', ...shown };
    case 'select':
      return { ...base, control: 'select', option: optionLabel(control.options), ...shown };
    case 'tabs':
      return { ...base, control: 'segmented', option: optionLabel(control.options), ...shown };
    case 'font':
      return { ...base, control: 'select', option: (v) => String(v), ...shown };
    case 'text-input':
      return { ...base, control: 'text', ...shown };
    case 'flag':
      return { ...base, control: 'flag', ...shown };
  }
}

/** The inspector rows that edit a callout of this style. */
export function calloutFields(styleId: string): CalloutFieldTable {
  const style = getStyle(styleId);
  const controls = style?.controls ?? [];
  const altitude = style?.supportsAltitude !== false;
  const fields: Record<string, FieldControl<CalloutItem>> = {
    'binding.altitude': {
      section: 'location',
      label: CALLOUT_LOCATION_TERMS.heightAboveMap,
      control: 'slider',
      shown: () => altitude,
    },
    linkTitleToLocation: { section: 'content', label: CALLOUT_LOCATION_TERMS.linkTitle, control: 'switch' },
    sizeMode: { section: 'size', label: 'Scale with map', control: 'switch' },
    'connector.visible': {
      section: 'connector',
      label: 'Show anchor line',
      control: 'switch',
      shown: () => altitude && !style?.drawsConnector,
    },
    'connector.color': {
      section: 'connector',
      label: 'Line color',
      control: 'color',
      shown: (live) => altitude && !style?.drawsConnector && live.connector.visible,
    },
    startTime: { section: 'timing', label: TIMING_LABELS.start, control: 'time' },
    endTime: { section: 'timing', label: TIMING_LABELS.end, control: 'time' },
    'transition.enter': { section: 'timing', label: 'Enter', control: 'select', option: (v) => TRANSITION_LABELS[String(v)] ?? String(v) },
    'transition.enterDuration': {
      section: 'timing',
      label: 'Enter duration',
      control: 'slider',
      shown: (live) => live.transition.enter !== 'none',
    },
    'transition.exit': { section: 'timing', label: 'Exit', control: 'select', option: (v) => TRANSITION_LABELS[String(v)] ?? String(v) },
    'transition.exitDuration': {
      section: 'timing',
      label: 'Exit duration',
      control: 'slider',
      shown: (live) => live.transition.exit !== 'none',
    },
  };

  // DynamicControls: with an accent, one "Accent color" row sets every accent and the other colors fold away.
  const accents = accentControls(controls);
  const folded = new Set<string>();
  controls.forEach((control) => {
    const path = `settings.${control.key}`;
    if (control.type === 'color' && accents.length > 0) {
      if (control.role === 'accent') {
        // Only the first accent has a row of its own; the rest follow it.
        if (control === accents[0]) fields[path] = { section: 'appearance', label: ACCENT_TERMS.accent, control: 'color' };
        return;
      }
      folded.add(path);
    }
    const field = styleField(control);
    if (field) fields[path] = field;
  });

  return { table: { kind: 'callout', fields }, folded };
}

/** The callout inspector's fields in screen order, top to bottom, for a style. */
export function calloutFieldOrder(styleId: string): string[] {
  const controls = getStyle(styleId)?.controls ?? [];
  return [
    'styleId',
    // Typing the title also stops it following the place, so it goes before that switch.
    'content.title',
    'binding.altitude',
    'linkTitleToLocation',
    'content.eyebrow',
    'content.subtitle',
    'content.body',
    'content.metric.value',
    'content.metric.unit',
    'content.metric.label',
    'content.badge',
    'content.image',
    ...controls.map((c) => `settings.${c.key}`),
    'scale',
    'sizeMode',
    'connector.visible',
    'connector.color',
    'startTime',
    'endTime',
    'transition.enter',
    'transition.enterDuration',
    'transition.exit',
    'transition.exitDuration',
  ];
}

/** The end of a later span is set first: the timing panel refuses a start at or past the end. */
function orderSpan(edits: FieldEdit[], base: CalloutItem): FieldEdit[] {
  const start = edits.find((e) => e.path === 'startTime');
  const end = edits.find((e) => e.path === 'endTime');
  if (!start || !end || (start.value as number) < base.endTime) return edits;
  const out = [...edits];
  out[edits.indexOf(start)] = end;
  out[edits.indexOf(end)] = start;
  return out;
}

/** A metric is three rows on screen (the number, its unit, its label), so it is three edits. */
function splitMetric(edits: FieldEdit[]): FieldEdit[] {
  return edits.flatMap((edit) => {
    if (edit.path !== 'content.metric') return [edit];
    const metric = edit.value as AnnotationContent['metric'];
    if (!metric) return [edit];
    return [
      { path: 'content.metric.value', value: metric.value },
      ...(metric.unit !== undefined ? [{ path: 'content.metric.unit', value: metric.unit }] : []),
      ...(metric.label !== undefined ? [{ path: 'content.metric.label', value: metric.label }] : []),
    ];
  });
}

/** Never edited on screen: identity. */
const SKIP = ['id', 'kind'];

/** The inspector edits that turn `base` (the callout as it is on screen) into the file's callout, in screen order. */
export function calloutEdits(base: CalloutItem, target: CalloutItem): FieldEdit[] {
  const ordered = orderEdits(splitMetric(diffLeaves(base, target, SKIP)), calloutFieldOrder(target.styleId));
  return orderSpan(ordered, base);
}
