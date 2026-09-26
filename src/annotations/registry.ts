/**
 * Annotation style registry.
 *
 * Styles register themselves here. The inspector, toolbar, preview layer,
 * and export pipeline all look up styles from this registry.
 */

import type { AnnotationStyleDefinition, StyleCategory } from './types';

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

/** Get a style by ID, throwing if not found. */
export function requireStyle(id: string): AnnotationStyleDefinition {
  const style = registry.get(id);
  if (!style) {
    throw new Error(`[annotations] Style "${id}" not found in registry.`);
  }
  return style;
}

/** Get all registered styles. */
export function getAllStyles(): AnnotationStyleDefinition[] {
  return Array.from(registry.values());
}

/** Get styles filtered by category. */
export function getStylesByCategory(category: StyleCategory): AnnotationStyleDefinition[] {
  return getAllStyles().filter((s) => s.category === category);
}

/** Get all unique categories that have at least one registered style. */
export function getCategories(): StyleCategory[] {
  const categories = new Set<StyleCategory>();
  for (const style of registry.values()) {
    categories.add(style.category);
  }
  return Array.from(categories);
}

/** Check if a style ID is registered. */
export function hasStyle(id: string): boolean {
  return registry.has(id);
}

/**
 * Validate and coerce settings for a style, applying defaults for missing keys.
 * Returns the validated settings or the style's defaults if validation fails.
 */
export function validateSettings(
  styleId: string,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const style = getStyle(styleId);
  if (!style) return settings;

  const result = style.settingsSchema.safeParse(settings);
  if (result.success) return result.data as Record<string, unknown>;

  // Fall back to defaults merged with whatever we can salvage
  return { ...style.defaultSettings, ...settings };
}
