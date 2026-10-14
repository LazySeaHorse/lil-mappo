import type {
  BoundaryItem,
  CalloutItem,
  CameraKeyframe,
  EasingName,
  ExitAnimation,
  RouteItem,
} from '@/store/types';
import type { TransitionConfig } from '@/annotations/types';
import type { InspectorSectionKind } from '../inspectorSections';

/**
 * The timing fields the inspector shows. A field that is missing is a field
 * the item does not support, and the timing section does not show it.
 */
export interface TimingModel {
  /** When the item starts, in seconds. */
  start: number;
  /** How long it lasts, in seconds. Items that last no time (a camera view) have none. */
  length?: number;
  /** When it ends: start plus length. Items without a length have none. */
  end?: number;
  /** "Motion". */
  easing?: EasingName;
  /** "When it ends": stay on screen, un-draw, or fade out. */
  whenItEnds?: ExitAnimation;
  /** Callout enter and exit animation. */
  transition?: TransitionConfig;
}

export type TimingPatch = Partial<Omit<TimingModel, 'transition'>> & {
  transition?: Partial<TransitionConfig>;
};

/** Maps one kind of item to and from the timing fields. */
export interface TimingAdapter<T> {
  /** The inspector panel this adapter belongs to. */
  panel: Extract<InspectorSectionKind, 'route' | 'boundary' | 'callout' | 'camera-kf'>;
  read: (item: T) => TimingModel;
  /** The store update for a change. It holds only the fields the change touches. */
  write: (item: T, patch: TimingPatch) => Partial<T>;
}

const MIN_LENGTH = 0.01;
const round2 = (value: number) => +value.toFixed(2);

type Timed = { startTime: number; endTime: number };

function readSpan(item: Timed): Pick<TimingModel, 'start' | 'length' | 'end'> {
  const length = Math.max(MIN_LENGTH, round2(item.endTime - item.startTime));
  return { start: item.startTime, length, end: round2(item.startTime + length) };
}

/**
 * Start, length and end become startTime and endTime. A new start alone keeps
 * the length; a new length keeps the start; a new end keeps the start. A start
 * and an end together set both edges. An end that leaves less than the minimum
 * length is rejected: the result is empty.
 */
function writeSpan(item: Timed, patch: TimingPatch): Partial<Timed> {
  if (patch.start === undefined && patch.length === undefined && patch.end === undefined) return {};
  const { start, length } = readSpan(item);
  const nextStart = Math.max(0, patch.start ?? start);
  if (patch.end !== undefined) {
    // Compare the raw end, so that 2.005 does not round up to a valid 2.01.
    if (patch.end - nextStart < MIN_LENGTH - 1e-9) return {};
    return { startTime: nextStart, endTime: round2(patch.end) };
  }
  const nextLength = Math.max(MIN_LENGTH, patch.length ?? length!);
  return { startTime: nextStart, endTime: round2(nextStart + nextLength) };
}

/** Routes: the end behaviour only applies to a route that draws itself. */
export const routeTiming: TimingAdapter<RouteItem> = {
  panel: 'route',
  read: (item) => ({
    ...readSpan(item),
    easing: item.easing,
    ...(item.style.animationType === 'draw' ? { whenItEnds: item.exitAnimation } : {}),
  }),
  write: (item, patch) => ({
    ...writeSpan(item, patch),
    ...(patch.easing !== undefined ? { easing: patch.easing } : {}),
    ...(patch.whenItEnds !== undefined ? { exitAnimation: patch.whenItEnds } : {}),
  }),
};

/** Boundaries: the end behaviour does not apply to the trace animation. */
export const boundaryTiming: TimingAdapter<BoundaryItem> = {
  panel: 'boundary',
  read: (item) => {
    const traced = item.style.animateStroke && item.style.animationStyle === 'trace';
    return {
      ...readSpan(item),
      easing: item.easing,
      ...(traced ? {} : { whenItEnds: item.exitAnimation }),
    };
  },
  write: (item, patch) => ({
    ...writeSpan(item, patch),
    ...(patch.easing !== undefined ? { easing: patch.easing } : {}),
    ...(patch.whenItEnds !== undefined ? { exitAnimation: patch.whenItEnds } : {}),
  }),
};

/** Callouts leave through their exit animation, so they have no motion or end behaviour. */
export const calloutTiming: TimingAdapter<CalloutItem> = {
  panel: 'callout',
  read: (item) => ({ ...readSpan(item), transition: item.transition }),
  write: (item, patch) => ({
    ...writeSpan(item, patch),
    ...(patch.transition ? { transition: { ...item.transition, ...patch.transition } } : {}),
  }),
};

/** A camera view is one moment: it has a time and a motion, and no length. */
export const cameraViewTiming: TimingAdapter<CameraKeyframe> = {
  panel: 'camera-kf',
  read: (item) => ({ start: item.time, easing: item.easing }),
  write: (_item, patch) => ({
    ...(patch.start !== undefined ? { time: Math.max(0, patch.start) } : {}),
    ...(patch.easing !== undefined ? { easing: patch.easing } : {}),
  }),
};
