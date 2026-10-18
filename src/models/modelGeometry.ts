import type { ModelAsset } from '@/store/types';

export type ModelBounds = ModelAsset['bounds'];

/**
 * Sizes of an imported model as it is drawn, in metres at scale 1. An imported model is lifted so
 * its lowest point sits on the ground (`lift`); sideways and front to back it keeps its own origin,
 * the point it is placed at or rides the route on. glTF is y up and faces +z.
 */
export function modelExtent({ min, max }: ModelBounds): { lengthM: number; heightM: number; reachM: number; lift: number } {
  const heightM = max[1] - min[1];
  const side = Math.max(Math.abs(min[0]), Math.abs(max[0]));
  const ahead = Math.max(Math.abs(min[2]), Math.abs(max[2]));
  return {
    lengthM: max[2] - min[2],
    heightM,
    reachM: Math.hypot(side, heightM, ahead),
    lift: -min[1],
  };
}
