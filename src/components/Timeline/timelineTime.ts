/** "mm:ss.cc", the way the timeline shows a time. Hundredths are cut, not rounded. */
export function formatTimelineTime(seconds: number): string {
  // The small bonus keeps 4.35 (stored as 4.3499...) from showing as 4.34.
  const centiseconds = Math.floor(seconds * 100 + 1e-6);
  const minutes = Math.floor(centiseconds / 6000);
  const wholeSeconds = Math.floor(centiseconds / 100) % 60;
  const hundredths = centiseconds % 100;

  return `${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

/**
 * Reads a time a user typed: seconds ("2.5") or minutes and seconds ("1:05.5",
 * the shape `formatTimelineTime` writes). Returns null when it is not a time.
 */
export function parseTimelineTime(text: string): number | null {
  const value = text.trim();
  const plain = /^(\d+(?:\.\d+)?)$/.exec(value);
  if (plain) return Number(plain[1]);
  const clock = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(value);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  return null;
}

// Round label intervals in seconds, so labels stay on times people read at a glance.
const RULER_LABEL_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
// How many ticks one label step holds, so every label sits on a tick.
const RULER_DIVISIONS: Record<number, number> = {
  0.5: 5, 1: 2, 2: 2, 5: 5, 10: 5, 15: 3, 30: 3, 60: 6, 120: 4, 300: 5, 600: 5, 1800: 3, 3600: 6,
};
const RULER_MIN_LABEL_GAP = 64;
const RULER_MIN_TICK_GAP = 6;

/**
 * The ruler's label and tick spacing in seconds for a zoom: the smallest round
 * label step that keeps labels a readable distance apart, so zooming out drops
 * labels instead of piling them up.
 */
export function rulerSteps(pixelsPerSecond: number): { labelStep: number; tickStep: number } {
  const labelStep =
    RULER_LABEL_STEPS.find((step) => step * pixelsPerSecond >= RULER_MIN_LABEL_GAP) ??
    RULER_LABEL_STEPS[RULER_LABEL_STEPS.length - 1];
  const tickStep = labelStep / RULER_DIVISIONS[labelStep];
  return { labelStep, tickStep: tickStep * pixelsPerSecond >= RULER_MIN_TICK_GAP ? tickStep : labelStep };
}

/** "m:ss" for a ruler label, with tenths when the labels are closer than a second. */
export function formatRulerLabel(seconds: number, labelStep: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  const text = labelStep < 1 ? rest.toFixed(1).padStart(4, '0') : Math.round(rest).toString().padStart(2, '0');
  return `${minutes}:${text}`;
}
