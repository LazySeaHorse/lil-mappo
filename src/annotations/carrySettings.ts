import type { AnnotationStyleDefinition, ControlDefinition } from './types';

type SliderControl = Extract<ControlDefinition, { type: 'slider' }>;

/** Rounds to the slider's step grid and clamps to its range. */
function fitSlider(control: SliderControl, value: number): number {
  const { min, max, step } = control;
  const snapped = step > 0 ? min + Math.round((value - min) / step) * step : value;
  // Strip float noise such as 0.30000000000000004.
  const clean = Number(snapped.toFixed(6));
  return Math.min(max, Math.max(min, clean));
}

/** The value as the new control would hold it, or undefined when it does not fit. */
function fitToControl(control: ControlDefinition, value: unknown): unknown {
  switch (control.type) {
    case 'color':
    case 'font':
    case 'text-input':
      return typeof value === 'string' ? value : undefined;
    case 'switch':
      return typeof value === 'boolean' ? value : undefined;
    case 'slider':
      return typeof value === 'number' && Number.isFinite(value) ? fitSlider(control, value) : undefined;
    case 'select':
      return typeof value === 'string' && control.options.some((option) => option.value === value) ? value : undefined;
    default:
      return undefined;
  }
}

/**
 * Settings for a callout that moves from one style to another. A setting
 * whose key and control type exist in both styles keeps its value, fitted to
 * the new control (a slider's range and step, a select's options). Every other
 * setting takes the new style's default. A kept value that the new style's
 * schema rejects is dropped, so the result is always valid.
 */
export function carrySettings(
  from: AnnotationStyleDefinition | undefined,
  settings: Record<string, unknown>,
  to: AnnotationStyleDefinition,
): Record<string, unknown> {
  let next: Record<string, unknown> = { ...(to.defaultSettings as Record<string, unknown>) };
  if (!from) return next;

  for (const control of to.controls) {
    const previous = from.controls.find((c) => c.key === control.key && c.type === control.type);
    if (!previous || !(control.key in settings)) continue;
    const value = fitToControl(control, settings[control.key]);
    if (value === undefined) continue;
    const trial = { ...next, [control.key]: value };
    if (to.settingsSchema.safeParse(trial).success) next = trial;
  }
  return next;
}
