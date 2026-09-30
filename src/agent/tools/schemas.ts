import { z } from 'zod/v4';
import { colorSchema, easingSchema, lngLatSchema } from './shared';

// Style/field schemas shared by the add_* and update_item tools. Patch objects
// are strict so a misspelled field is reported instead of silently ignored.

export const routeStyleShape = {
  color: colorSchema.describe('Line color.'),
  width: z.number().min(0.5).max(30).describe('Line width in pixels.'),
  glow: z.boolean().describe('Soft glow around the line.'),
  glowColor: colorSchema.describe('Glow color.'),
  glowWidth: z.number().min(0).max(60).describe('Glow width in pixels.'),
  trailFade: z.boolean().describe('Fade the tail of the line behind the head as it draws.'),
  trailFadeLength: z.number().min(0).max(1).describe('Fraction of the route (0-1) over which the tail fades.'),
  dashPattern: z.array(z.number().min(0)).max(8).nullable().describe('Dash lengths [dash, gap, ...] in line widths, or null for solid.'),
  animationType: z.enum(['draw', 'navigation', 'comet']).describe('draw = line grows along the path; navigation = full line with a moving head; comet = short bright head with a trail.'),
  cometTrailLength: z.number().min(0).max(1).describe('Comet trail length as a fraction of the route (0-1).'),
};
export const routeStylePatchSchema = z.strictObject(routeStyleShape).partial();

export const boundaryStyleShape = {
  strokeColor: colorSchema.describe('Outline color.'),
  fillColor: colorSchema.describe('Fill color.'),
  strokeWidth: z.number().min(0).max(30).describe('Outline width in pixels.'),
  glow: z.boolean().describe('Soft glow around the outline.'),
  fillOpacity: z.number().min(0).max(1).describe('Fill opacity, 0-1.'),
  animateStroke: z.boolean().describe('Animate the outline in.'),
  animationStyle: z.enum(['fade', 'draw', 'trace']).describe('fade = fade in; draw = outline draws around the region; trace = a bright segment travels around it.'),
  traceLength: z.number().min(0).max(1).describe('Length of the trace segment as a fraction of the outline (0-1).'),
};
export const boundaryStylePatchSchema = z.strictObject(boundaryStyleShape).partial();

export const vehicleShape = {
  enabled: z.boolean().describe('Show a vehicle marker riding the route.'),
  type: z.enum(['dot', 'car', 'plane']).describe('dot = simple marker; car = 3D car; plane = 3D plane.'),
  scale: z.number().min(0.1).max(10).describe('Size multiplier, 1 = default.'),
};
export const vehiclePatchSchema = z.strictObject(vehicleShape).partial();

export const exitAnimationSchema = z.enum(['none', 'reverse', 'fade']).describe('How the item leaves at endTime: none = disappears, reverse = un-draws, fade = fades out.');

export const contentShape = {
  title: z.string().max(200).describe('Main text.'),
  subtitle: z.string().max(300).describe('Secondary line.'),
  eyebrow: z.string().max(100).describe('Small text above the title.'),
  body: z.string().max(1000).describe('Longer text.'),
  badge: z.string().max(60).describe('Short badge text.'),
  metric: z
    .strictObject({ value: z.number(), label: z.string().max(60).optional(), unit: z.string().max(20).optional() })
    .describe('A number to highlight, e.g. {value: 42, unit: "km"}.'),
};
export const contentPatchSchema = z.strictObject(contentShape).partial();

export const anchorSchema = z
  .enum(['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'])
  .describe('Which point of the callout sits on the map location. Cards default to "bottom", markers to "center".');

export const calloutSettingsSchema = z
  .record(z.string(), z.unknown())
  .describe('Style-specific settings, merged over the style defaults and validated by the style. Keys depend on styleId; omit unless needed.');

export const transitionPatchSchema = z.strictObject({
  enter: z.string().max(40),
  exit: z.string().max(40),
  enterDuration: z.number().min(0).max(5),
  exitDuration: z.number().min(0).max(5),
}).partial().describe('Enter/exit transition names and durations (seconds).');

export const connectorPatchSchema = z.strictObject({
  visible: z.boolean(),
  style: z.enum(['dashed', 'solid', 'dotted']),
  color: colorSchema,
  width: z.number().min(0).max(20),
  endDot: z.boolean(),
  endDotRadius: z.number().min(0).max(20),
}).partial().describe('Line from the card down to the map point.');

export const cameraShape = {
  center: lngLatSchema.describe('Map center [longitude, latitude].'),
  zoom: z.number().min(0).max(22).describe('Zoom level 0-22 (2 = continent, 10 = city, 15 = streets).'),
  pitch: z.number().min(0).max(85).describe('Tilt in degrees, 0 = top-down, up to 85.'),
  bearing: z.number().min(-360).max(360).describe('Heading in degrees clockwise from north.'),
  easing: easingSchema,
};

/** Formats zod issues as "path: message" for ToolError messages. */
export function issuesOf(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join('.') || '(root)', message: i.message }));
}
