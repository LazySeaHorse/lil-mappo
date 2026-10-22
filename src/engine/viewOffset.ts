import type { PaddingOptions } from 'mapbox-gl';

/** How the camera is shifted from the full-screen view so the whole video fits inside the fit frame. */
export interface FitView {
  /** log2(frame width / container width), zero or negative. Add it to a project zoom to get the view zoom. */
  offset: number;
  /** Puts the map centre on the frame centre. */
  padding: PaddingOptions;
}

export const NO_FIT_VIEW: Readonly<FitView> = { offset: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } };

/** What the map is showing now, as the code that reads or applies cameras needs to know it. */
let current: FitView = NO_FIT_VIEW;

/** The zoom the editor adds to every project zoom it shows. Zero in full screen. */
export function getViewOffset(): number {
  return current.offset;
}

/** The padding the editor's view holds on the camera to centre the frame. All zero in full screen. */
export function getViewPadding(): PaddingOptions {
  return current.padding;
}

/** Records the view the map is being moved to. Call it as the move starts, so readers see the target. */
export function setViewFit(view: FitView): void {
  current = view;
}

/** Project zoom (the one a keyframe stores) for a zoom read off the map. */
export function toProjectZoom(mapZoom: number): number {
  return mapZoom - current.offset;
}

/** Map zoom to show a project zoom at. */
export function toViewZoom(projectZoom: number): number {
  return projectZoom + current.offset;
}
