/** Timing of the looping style previews in the style picker dialog. */

export interface LoopTiming {
  /** Seconds from the start of the entrance to the end of the exit. */
  end: number;
  /** Seconds one loop takes, the empty beat included. */
  cycle: number;
}

/** The callout's time `elapsed` seconds into the loop, or null on the empty beat. */
export function loopTime(elapsed: number, { end, cycle }: LoopTiming): number | null {
  const time = elapsed - Math.floor(elapsed / cycle) * cycle;
  return time > end ? null : time;
}
