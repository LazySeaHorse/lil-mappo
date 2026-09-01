import { useEffect, useRef, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaymentSuccessCelebrationProps {
  planName: string;
  onContinue: () => void;
}

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
  onContinue,
}: PaymentSuccessCelebrationProps) {
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    continueRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onContinue();
      if (event.key === 'Tab') {
        event.preventDefault();
        continueRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onContinue]);

  return (
    <div
      className="fixed inset-0 z-[200] isolate overflow-hidden bg-[#07090d] text-slate-50"
      role="dialog"
      aria-modal="true"
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

      <div className="relative flex min-h-[100dvh] flex-col">
        <div className="flex items-center gap-2.5 p-5 sm:p-7">
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            className="h-8 w-8"
            alt="li'l Mappo"
          />
          <span className="text-sm font-medium tracking-tight text-slate-300">
            li&apos;l Mappo
          </span>
        </div>

        <main className="payment-success-content flex flex-1 items-center justify-center px-6 pb-24 pt-10 sm:px-10">
          <div className="flex max-w-2xl flex-col items-center text-center">
            <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
              <Check className="h-7 w-7 text-blue-300" strokeWidth={2.25} aria-hidden="true" />
            </div>

            <h1
              id="payment-success-title"
              className="max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-slate-50 sm:text-6xl"
            >
              You&apos;re a {planName} now.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-slate-400 sm:text-lg">
              Your project is right where you left it. Your new plan is ready.
            </p>

            <Button
              ref={continueRef}
              onClick={onContinue}
              className="mt-9 h-11 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-[0_12px_35px_rgba(37,99,235,0.25)] transition-transform hover:bg-blue-500 active:scale-[0.98]"
            >
              Back to your map
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
