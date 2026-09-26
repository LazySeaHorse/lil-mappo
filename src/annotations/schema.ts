/**
 * Zod schema for the new CalloutItem (annotation-based).
 *
 * This validates the persisted shape of callouts in project documents.
 */

import { z } from 'zod';

const coordinateSchema = z.tuple([z.number().finite(), z.number().finite()]);

export const annotationContentSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  eyebrow: z.string().optional(),
  body: z.string().optional(),
  icon: z.string().optional(),
  image: z.string().optional(),
  badge: z.string().optional(),
  metric: z
    .object({
      value: z.number(),
      label: z.string().optional(),
      unit: z.string().optional(),
    })
    .optional(),
});

export const annotationBindingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('geographic'),
    lngLat: coordinateSchema,
    altitude: z.number(),
  }),
  z.object({
    kind: z.literal('screen'),
    position: coordinateSchema,
  }),
]);

export const anchorPositionSchema = z.enum([
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

export const connectorConfigSchema = z.object({
  visible: z.boolean(),
  style: z.enum(['dashed', 'solid', 'dotted']),
  color: z.string(),
  width: z.number(),
  endDot: z.boolean(),
  endDotRadius: z.number(),
});

export const transitionConfigSchema = z.object({
  enter: z.string(),
  exit: z.string(),
  enterDuration: z.number(),
  exitDuration: z.number(),
});

export const calloutItemSchema = z.object({
  kind: z.literal('callout'),
  id: z.string().min(1),
  styleId: z.string().min(1),
  styleVersion: z.number(),
  content: annotationContentSchema,
  binding: annotationBindingSchema,
  offset: z.tuple([z.number(), z.number()]),
  anchor: anchorPositionSchema,
  startTime: z.number(),
  endTime: z.number(),
  transition: transitionConfigSchema,
  connector: connectorConfigSchema,
  opacity: z.number(),
  scale: z.number(),
  settings: z.record(z.unknown()),
  linkTitleToLocation: z.boolean(),
});
