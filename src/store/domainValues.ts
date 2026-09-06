import type { BoundaryItem, Project } from './types';

export function parseProjection(value: string): Project['projection'] {
  switch (value) {
    case 'globe':
    case 'mercator':
      return value;
    default:
      throw new Error(`Unsupported projection: ${value}`);
  }
}

export function parseLightPreset(value: string): Project['lightPreset'] {
  switch (value) {
    case 'day':
    case 'night':
    case 'dusk':
    case 'dawn':
      return value;
    default:
      throw new Error(`Unsupported light preset: ${value}`);
  }
}

export function parseBoundaryAnimationStyle(
  value: string,
): BoundaryItem['style']['animationStyle'] {
  switch (value) {
    case 'fade':
    case 'draw':
    case 'trace':
      return value;
    default:
      throw new Error(`Unsupported boundary animation style: ${value}`);
  }
}
