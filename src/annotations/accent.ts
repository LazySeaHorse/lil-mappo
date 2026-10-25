import type { ControlDefinition } from './types';

type ColorControl = Extract<ControlDefinition, { type: 'color' }>;

/** The accent colors of a style, which one "Accent color" sets together. */
export const accentControls = (controls: readonly ControlDefinition[]): ColorControl[] =>
  controls.filter((control): control is ColorControl => control.type === 'color' && control.role === 'accent');

/** The settings that set every accent color of a style to `color`. */
export const accentSettings = (controls: readonly ColorControl[], color: string): Record<string, unknown> =>
  Object.fromEntries(controls.map((c) => [c.key, color]));
