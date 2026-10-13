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
