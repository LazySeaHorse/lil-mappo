/**
 * Annotation style registry.
 *
 * Styles register themselves here. The inspector, toolbar, preview layer,
 * and export pipeline all look up styles from this registry.
 */

import { STYLE_CATEGORIES, type AnnotationStyleDefinition, type StyleCategory } from './types';

const registry = new Map<string, AnnotationStyleDefinition>();

/** Register an annotation style definition. */
export function registerStyle<T = Record<string, unknown>>(style: AnnotationStyleDefinition<T>): void {
  if (registry.has(style.id)) {
    console.warn(`[annotations] Style "${style.id}" already registered — overwriting.`);
  }
  registry.set(style.id, style as unknown as AnnotationStyleDefinition);
}

/** Look up a style by ID. */
export function getStyle(id: string): AnnotationStyleDefinition | undefined {
  return registry.get(id);
}

/** Get all registered styles. */
export function getAllStyles(): AnnotationStyleDefinition[] {
  return Array.from(registry.values());
}

/** Categories that have at least one registered style, in picker order. */
export function getCategories(): StyleCategory[] {
  const used = new Set(Array.from(registry.values(), (style) => style.category));
  return STYLE_CATEGORIES.filter((category) => used.has(category));
}

/** Check if a style ID is registered. */
export function hasStyle(id: string): boolean {
  return registry.has(id);
}

/**
 * Validated settings per stored settings object. The store replaces a
 * callout's settings object on every edit and never changes one in place, so
 * an object only needs validating once per style (draw runs this every frame).
 */
const validatedSettings = new WeakMap<
  object,
  { style: AnnotationStyleDefinition; result: Record<string, unknown> }
>();

/**
 * Validate and coerce settings for a style, applying defaults for missing keys.
 * Returns the style's defaults if the stored settings are invalid, so renderers
 * never receive values of the wrong type. Treat the result as read-only: it is
 * shared between calls with the same settings object.
 */
export function validateSettings(
  styleId: string,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const style = getStyle(styleId);
  if (!style) return settings;

  const cacheable = typeof settings === 'object' && settings !== null;
  const cached = cacheable ? validatedSettings.get(settings) : undefined;
  if (cached?.style === style) return cached.result;

  const parsed = style.settingsSchema.safeParse(settings ?? {});
  const result = parsed.success
    ? (parsed.data as Record<string, unknown>)
    : { ...(style.defaultSettings as Record<string, unknown>) };
  if (cacheable) validatedSettings.set(settings, { style, result });
  return result;
}
