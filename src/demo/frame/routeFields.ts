import type { EasingName, RouteItem } from '@/store/types';
import { EASING_OPTIONS, normalizeEasing } from '@/components/Inspector/inspectorValues';
import { MODEL_TERMS } from '@/models/modelTerms';
import { ROUTE_ANIMATION_TERMS, TIMING_LABELS } from '@/lib/terms';
import type { FieldTable } from './fields';

/**
 * Which on-screen control edits which field of a route, read off the route
 * inspector (RouteLineSection, RouteAnimationSection, RouteMarkerSection,
 * TimingSection, the walk's curvature in the Path section). The name, the
 * marker's size (a log slider) and the Follow camera need more than a row
 * and a control: the route runner works those. A field with no entry, or
 * whose control is not on screen, is written by the step's final write.
 */

const easingLabel = (value: unknown) =>
  EASING_OPTIONS.find((o) => o.value === normalizeEasing(value as EasingName))?.label ?? String(value);

const LINE_STYLE_LABELS = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' } as const;

/** The line style card a dash pattern is shown as (a pattern the cards do not make still reads as dashed). */
const lineStyleLabel = (pattern: unknown) =>
  !Array.isArray(pattern) ? LINE_STYLE_LABELS.solid : pattern[0] === 2 ? LINE_STYLE_LABELS.dotted : LINE_STYLE_LABELS.dashed;

const MARKER_LABELS = { dot: 'Dot', car: 'Car', plane: 'Plane', custom: MODEL_TERMS.customMarker } as const;

const markerOn = (live: RouteItem) => !!live.calculation?.vehicle?.enabled;

export const ROUTE_FIELDS: FieldTable<RouteItem> = {
  kind: 'route',
  fields: {
    // Walk: the curvature slider edits the path draft; the runner presses Apply after it.
    'calculation.sharpness': {
      section: 'path',
      label: 'Curvature',
      control: 'slider',
      shown: (live) => live.calculation?.mode === 'walk' && live.calculation.curved,
    },

    'style.color': { section: 'line', label: 'Color', control: 'color' },
    'style.width': { section: 'line', label: 'Width', control: 'slider' },
    'style.dashPattern': {
      section: 'line',
      label: '',
      control: 'cards',
      option: lineStyleLabel,
      same: (live, value) => lineStyleLabel(live) === lineStyleLabel(value),
    },
    'style.glow': { section: 'line', label: 'Glow', control: 'switch' },
    'style.glowWidth': { section: 'line', label: 'Glow width', control: 'slider', shown: (live) => live.style.glow },

    'style.animationType': {
      section: 'animation',
      label: '',
      control: 'cards',
      option: (v) => ROUTE_ANIMATION_TERMS[v as RouteItem['style']['animationType']].label,
    },
    'style.cometTrailLength': {
      section: 'animation',
      label: 'Trail length',
      control: 'slider',
      shown: (live) => live.style.animationType === 'comet',
    },

    'calculation.vehicle.enabled': { section: 'marker', label: 'Route marker', control: 'switch' },
    'calculation.vehicle.type': {
      section: 'marker',
      label: '',
      control: 'cards',
      option: (v) => MARKER_LABELS[v as keyof typeof MARKER_LABELS],
      shown: markerOn,
    },
    'calculation.vehicle.scale': { section: 'marker', label: 'Size', control: 'slider', shown: markerOn },

    startTime: { section: 'timing', label: TIMING_LABELS.start, control: 'time' },
    endTime: { section: 'timing', label: TIMING_LABELS.end, control: 'time' },
    easing: {
      section: 'timing',
      label: TIMING_LABELS.motion,
      control: 'select',
      option: easingLabel,
      same: (live, value) => normalizeEasing(live as EasingName) === normalizeEasing(value as EasingName),
    },
    // Only a route that draws itself has an end behaviour.
    exitAnimation: {
      section: 'timing',
      label: TIMING_LABELS.whenItEnds,
      control: 'segmented',
      option: (v) => ({ none: 'Stay', reverse: 'Hide', fade: 'Fade out' })[v as string] ?? String(v),
      shown: (live) => live.style.animationType === 'draw',
    },
  },
};
