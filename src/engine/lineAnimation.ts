import { getRoutePath } from './routePath';

export function getLineSegment(fullCoords: number[][], startT: number, endT: number): number[][] {
  return getRoutePath(fullCoords).slice(startT, endT);
}

export function getAnimatedLine(fullCoords: number[][], t: number): number[][] {
  return getLineSegment(fullCoords, 0, t);
}
