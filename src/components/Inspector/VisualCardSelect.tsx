import React from 'react';
import { cn } from "@/lib/utils";

export interface VisualCardOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  disabled?: boolean;
  /**
   * Shown above the label, e.g. a small looping SVG or canvas. A function gets
   * whether the card is selected, so a preview can play only then.
   */
  preview?: React.ReactNode | ((state: { selected: boolean }) => React.ReactNode);
  /** Plan-gated: stays clickable, but selecting it calls `onLockedSelect` instead of `onChange`. */
  locked?: boolean;
}

export function VisualCardSelect<T extends string>({
  options,
  value,
  onChange,
  onLockedSelect,
  columns = 4,
}: {
  options: readonly VisualCardOption<T>[];
  value: T;
  onChange: (v: T) => void;
  onLockedSelect?: (v: T) => void;
  columns?: number;
}) {
  const colClass = 
    columns === 2 ? "grid-cols-2" :
    columns === 3 ? "grid-cols-3" :
    "grid-cols-4";

  return (
    <div className={cn("grid gap-2 w-full", colClass)}>
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            aria-disabled={opt.locked || undefined}
            onClick={() => (opt.locked ? onLockedSelect?.(opt.value) : onChange(opt.value))}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1.5 p-2 py-3 min-h-[58px] rounded-xl border text-center transition-all cursor-pointer select-none",
              isSelected
                ? "bg-primary/10 border-primary text-primary font-medium shadow-sm ring-1 ring-primary/20"
                : "bg-secondary/40 hover:bg-secondary/70 border-border/40 text-muted-foreground hover:text-foreground",
              opt.disabled && "opacity-40 cursor-not-allowed pointer-events-none",
              opt.locked && "opacity-60"
            )}
          >
            {opt.icon && (
              <div className={cn(
                "flex items-center justify-center transition-colors",
                isSelected ? "text-primary" : "text-muted-foreground/80"
              )}>
                {opt.icon}
              </div>
            )}
            {opt.preview != null && (
              <div className="flex w-full items-center justify-center">
                {typeof opt.preview === 'function' ? opt.preview({ selected: isSelected }) : opt.preview}
              </div>
            )}
            <span className="text-2xs font-medium leading-tight text-center w-full block whitespace-normal break-words">{opt.label}</span>
            {opt.badge && (
              <span className="absolute top-1 right-1 text-micro bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium tracking-wider uppercase">
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
