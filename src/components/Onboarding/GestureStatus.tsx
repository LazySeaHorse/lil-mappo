import type React from 'react';
import { Check, Circle } from 'lucide-react';

export function GestureStatus({
  complete,
  children,
  subtext,
}: {
  complete: boolean;
  children: React.ReactNode;
  subtext?: React.ReactNode;
}) {
  const Icon = complete ? Check : Circle;

  return (
    <div
      className={`flex items-start gap-2.5 p-2 rounded-xl transition-all ${
        complete
          ? 'bg-primary/10 border border-primary/20'
          : 'bg-secondary/30 border border-border/30'
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full shrink-0 transition-colors ${
          complete ? 'bg-primary text-primary-foreground' : 'text-muted-foreground/60'
        }`}
      >
        <Icon
          size={11}
          className={complete ? 'text-primary-foreground stroke-[2.5]' : 'text-muted-foreground/60'}
          aria-hidden="true"
        />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={`text-xs leading-tight transition-colors ${
            complete ? 'text-foreground font-medium' : 'text-muted-foreground'
          }`}
        >
          {children}
        </div>
        {subtext && (
          <div className="mt-0.5 text-[11px] text-muted-foreground/75 leading-tight">{subtext}</div>
        )}
      </div>
    </div>
  );
}
