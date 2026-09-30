import type { Shadow, ShadowConfig } from '../types';

/** A node's shadow as a list of layers, bottom first; empty when it has none. */
export function shadowLayers(shadow: Shadow | undefined): ShadowConfig[] {
  if (!shadow) return [];
  return Array.isArray(shadow) ? shadow : [shadow];
}
