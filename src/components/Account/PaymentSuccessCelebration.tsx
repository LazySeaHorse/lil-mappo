import { useEffect, useState, type CSSProperties } from 'react';

interface PaymentSuccessCelebrationProps {
  planName: string;
  onComplete: () => void;
}

const DISPLAY_DURATION_MS = 3_000;
const FADE_DURATION_MS = 450;

const CONFETTI = Array.from({ length: 44 }, (_, index) => ({
  id: index,
  left: (index * 37 + 11) % 100,
  delay: -((index * 173) % 2400),
  duration: 2600 + ((index * 131) % 1700),
  drift: ((index * 29) % 180) - 90,
  rotation: (index * 47) % 180,
  color: ['#3b82f6', '#93c5fd', '#e5e7eb', '#64748b'][index % 4],
}));

export function PaymentSuccessCelebration({
  planName,
  onComplete,
}: PaymentSuccessCelebrationProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    let completionTimer: ReturnType<typeof setTimeout> | undefined;
    const displayTimer = setTimeout(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
        onComplete();
      } else {
        setIsExiting(true);
        completionTimer = setTimeout(onComplete, FADE_DURATION_MS);
      }
    }, DISPLAY_DURATION_MS);

    return () => {
      clearTimeout(displayTimer);
      if (completionTimer) clearTimeout(completionTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`payment-success-overlay fixed inset-0 z-[200] isolate overflow-hidden bg-slate-950/70 text-slate-50 backdrop-blur-[2px] ${isExiting ? 'payment-success-overlay-exiting' : ''}`}
      role="status"
      aria-live="polite"
      aria-labelledby="payment-success-title"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {CONFETTI.map((piece) => (
          <span
            key={piece.id}
            className="payment-success-confetti absolute -top-6 h-3 w-1.5 rounded-[2px]"
            style={{
              left: `${piece.left}%`,
              backgroundColor: piece.color,
              animationDelay: `${piece.delay}ms`,
              animationDuration: `${piece.duration}ms`,
              '--confetti-drift': `${piece.drift}px`,
              '--confetti-rotation': `${piece.rotation}deg`,
            } as CSSProperties}
          />
        ))}
      </div>

      <main className="payment-success-content relative flex min-h-[100dvh] items-center justify-center px-6 text-center sm:px-10">
        <h1
          id="payment-success-title"
          className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-slate-50 sm:text-6xl"
        >
          Hooray you&apos;re officially a {planName}!
        </h1>
      </main>
    </div>
  );
}
