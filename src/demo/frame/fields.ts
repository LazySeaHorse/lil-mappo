import type { BoundaryItem, EasingName, Project } from '@/store/types';
import type { InspectorSectionKind } from '@/components/Inspector/inspectorSections';
import { EASING_OPTIONS, normalizeEasing } from '@/components/Inspector/inspectorValues';
import { BOUNDARY_ANIMATION_LABELS, BOUNDARY_TERMS, TIMING_LABELS } from '@/lib/terms';

/**
 * Which on-screen control edits which field: the inspector section it sits
 * in, the label of its row and the kind of control. Read off the inspector
 * panels (BoundaryInspector, TimingSection, ProjectSettings). A field with no
 * entry, or whose control is not on screen for the item as it is, is written
 * straight to the store by the step's final write.
 */

export type ControlKind =
  /** ColorRow: a preset swatch, else More colors and the hex field. */
  | 'color'
  | 'slider'
  | 'switch'
  /** SegmentedControl (Radix toggle group): the option's radio. */
  | 'segmented'
  /** VisualCardSelect: the card's button. */
  | 'cards'
  /** Radix Select. */
  | 'select'
  /** TimeRow: typed as mm:ss.cc. */
  | 'time'
  /** A text field. */
  | 'text'
  /** FlagPicker: search the country, pick it. */
  | 'flag';

export interface FieldControl<T> {
  /** Inspector section id (of the panel's kind). */
  section: string;
  /** The row's label text (a time field's and a text field's accessible name). */
  label: string;
  control: ControlKind;
  /** The option to pick for a value (segmented, cards, select). */
  option?: (value: unknown, target: T) => string;
  /** Whether the control is on screen for the item as it is now and the edit should be shown. */
  shown?: (live: T, target: T) => boolean;
  /** The control already shows the value (e.g. two easings under one label). */
  same?: (live: unknown, value: unknown) => boolean;
}

export interface FieldTable<T> {
  kind: InspectorSectionKind;
  fields: Record<string, FieldControl<T>>;
}

const traced = (b: BoundaryItem) => b.style.animateStroke && b.style.animationStyle === 'trace';
const easingLabel = (value: unknown) =>
  EASING_OPTIONS.find((o) => o.value === normalizeEasing(value as EasingName))?.label ?? String(value);

/** The timing section every item panel ends with. */
function timingFields<T>(): Record<string, FieldControl<T>> {
  return {
    startTime: { section: 'timing', label: TIMING_LABELS.start, control: 'time' },
    endTime: { section: 'timing', label: TIMING_LABELS.end, control: 'time' },
    easing: {
      section: 'timing',
      label: TIMING_LABELS.motion,
      control: 'select',
      option: easingLabel,
      same: (live, value) => normalizeEasing(live as EasingName) === normalizeEasing(value as EasingName),
    },
  };
}

const END_LABELS: Record<string, string> = { none: 'Stay', reverse: 'Hide', fade: 'Fade out' };

export const BOUNDARY_FIELDS: FieldTable<BoundaryItem> = {
  kind: 'boundary',
  fields: {
    'style.strokeColor': { section: 'appearance', label: BOUNDARY_TERMS.borderColor, control: 'color' },
    'style.strokeWidth': { section: 'appearance', label: BOUNDARY_TERMS.borderWidth, control: 'slider' },
    'style.glow': { section: 'appearance', label: 'Glow', control: 'switch' },
    'style.fillMode': {
      section: 'appearance',
      label: BOUNDARY_TERMS.fill,
      control: 'segmented',
      option: (v) => (v === 'flag' ? 'Flag' : 'Color'),
    },
    'style.flagCode': {
      section: 'appearance',
      label: 'Country flag',
      control: 'flag',
      shown: (live) => live.style.fillMode === 'flag',
    },
    'style.fillColor': {
      section: 'appearance',
      label: BOUNDARY_TERMS.fillColor,
      control: 'color',
      shown: (live) => live.style.fillMode === 'color',
    },
    'style.fillOpacity': { section: 'appearance', label: BOUNDARY_TERMS.fillOpacity, control: 'slider' },
    'style.fillUnderRoads': {
      section: 'appearance',
      label: 'Keep roads visible',
      control: 'switch',
      shown: (live) => live.style.fillMode === 'color',
    },
    'style.maskOutside': { section: 'appearance', label: 'Mask outside', control: 'switch' },
    'style.maskColor': { section: 'appearance', label: 'Mask color', control: 'color', shown: (live) => live.style.maskOutside },
    'style.maskOpacity': { section: 'appearance', label: 'Mask opacity', control: 'slider', shown: (live) => live.style.maskOutside },
    // The animation cards set the style and the switch together: a style card only when it ends animated.
    'style.animationStyle': {
      section: 'animation',
      label: '',
      control: 'cards',
      option: (v) => BOUNDARY_ANIMATION_LABELS[v as BoundaryItem['style']['animationStyle']],
      shown: (_live, target) => target.style.animateStroke,
    },
    'style.animateStroke': {
      section: 'animation',
      label: '',
      control: 'cards',
      option: (v, target) => (v ? BOUNDARY_ANIMATION_LABELS[target.style.animationStyle] : BOUNDARY_ANIMATION_LABELS.none),
    },
    'style.traceLength': {
      section: 'animation',
      label: BOUNDARY_TERMS.highlightLength,
      control: 'slider',
      shown: (live) => traced(live),
    },
    ...timingFields<BoundaryItem>(),
    exitAnimation: {
      section: 'timing',
      label: TIMING_LABELS.whenItEnds,
      control: 'segmented',
      option: (v) => END_LABELS[v as string] ?? String(v),
      shown: (live) => !traced(live),
    },
  },
};

/** The project settings panel; terrain and buildings are the toolbar's toggles (see the settings runner). */
export const PROJECT_FIELDS: FieldTable<Project> = {
  kind: 'project',
  fields: {
    name: { section: 'video', label: 'Name', control: 'text' },
    duration: { section: 'video', label: 'Duration (s)', control: 'text' },
    fps: { section: 'video', label: 'Frame rate', control: 'segmented', option: (v) => String(v) },
    projection: {
      section: 'env',
      label: 'Projection',
      control: 'segmented',
      option: (v) => (v === 'mercator' ? 'Mercator' : 'Globe'),
    },
    lightPreset: {
      section: 'env',
      label: 'Lighting',
      control: 'segmented',
      option: (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1),
    },
    terrainExaggeration: { section: 'env', label: 'Terrain height', control: 'slider' },
    starIntensity: { section: 'atmos', label: 'Star intensity', control: 'slider', shown: (live) => live.projection === 'globe' },
    fogColor: { section: 'atmos', label: 'Fog color', control: 'color' },
    show3dLandmarks: { section: '3d', label: 'Landmarks', control: 'switch' },
    show3dTrees: { section: '3d', label: 'Trees', control: 'switch' },
    show3dFacades: { section: '3d', label: 'Facades', control: 'switch' },
  },
};
