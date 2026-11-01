/** The 3-2-1 before a run, big over the stage. Keyed on the number so each one plays its own entrance. */
export function Countdown({ count }: { count: number | null }) {
  if (count === null) return null;
  return (
    <div className="ds-countdown" aria-live="assertive">
      <span key={count} className="ds-countdown__n">
        {count}
      </span>
    </div>
  );
}
