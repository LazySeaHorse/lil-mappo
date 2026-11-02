import React from 'react';
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { RowLabel } from './RowLabel';
import { InfoTip } from './InfoTip';

/** How many pointer positions a log slider has end to end. */
const LOG_SLIDER_STEPS = 500;
/** The keys that step a log slider by value, and the way each one goes. Home and End stay with Radix. */
const LOG_STEP_KEYS: Record<string, 1 | -1 | undefined> = {
  ArrowRight: 1, ArrowUp: 1, PageUp: 1, ArrowLeft: -1, ArrowDown: -1, PageDown: -1,
};

export function SliderRow({
  label,
  icon,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  unit = '',
  formatValue,
  onReset,
  logarithmic = false,
  hint,
  endLabels,
  showValue = true,
  className,
}: {
  label: string;
  icon?: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  formatValue?: (v: number) => string;
  /** Called on double-click, to return the slider to its default. */
  onReset?: () => void;
  /** Spreads a range spanning orders of magnitude evenly; `min` must be positive. */
  logarithmic?: boolean;
  /** Short help. It shows in an (i) tip right after the label. */
  hint?: string;
  /** Words under the left and right ends of the slider, e.g. ["Calm", "Lively"]. */
  endLabels?: readonly [string, string];
  /** Set to false to hide the number, usually when `endLabels` say enough. */
  showValue?: boolean;
  className?: string;
}) {
  const displayVal = formatValue ? formatValue(value) : `${value}${unit ? ` ${unit}` : ''}`;
  // A log slider runs over ln(value); its values snap back to `step` on the way out.
  const toSlider = (v: number) => (logarithmic ? Math.log(Math.max(min, v)) : v);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const fromSlider = (v: number) => (logarithmic ? clamp(Math.round(Math.exp(v) / step) * step) : v);
  const logStep = (toSlider(max) - toSlider(min)) / LOG_SLIDER_STEPS;
  // Radix steps the keyboard in position space, where one step near the bottom of a log
  // range is less than one `step` of value and rounds back to where it started. So the
  // keys step in value space instead: the same proportional move, never less than a `step`.
  const onLogKeyDown = (e: React.KeyboardEvent) => {
    const dir = LOG_STEP_KEYS[e.key];
    if (!dir) return;
    e.preventDefault(); // Radix would also step
    const jump = (/^Page/.test(e.key) || e.shiftKey ? 10 : 1) * logStep;
    const slots = value / step;
    const proportional = Math.round((value * Math.exp(dir * jump)) / step);
    const next = dir > 0 ? Math.max(proportional, Math.floor(slots + 1e-9) + 1) : Math.min(proportional, Math.ceil(slots - 1e-9) - 1);
    const nextValue = clamp(next * step);
    if (nextValue !== value) onChange(nextValue);
  };
  return (
    <div className={cn("flex flex-col gap-1 text-xs py-0.5", className)}>
      <div data-slot="slider-top-line" className="flex min-h-5 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <RowLabel label={label} icon={icon} className="min-w-0 shrink" />
          {hint && <InfoTip text={hint} />}
        </div>
        {showValue && (
          <span className="shrink-0 text-xs font-mono text-muted-foreground tabular-nums">{displayVal}</span>
        )}
      </div>
      <Slider
        min={toSlider(min)}
        max={toSlider(max)}
        step={logarithmic ? logStep : step}
        value={[toSlider(value)]}
        onValueChange={([v]) => onChange(fromSlider(v))}
        onKeyDown={logarithmic ? onLogKeyDown : undefined}
        onDoubleClick={onReset}
        title={onReset ? 'Double-click to reset' : undefined}
        className="py-1"
      />
      {endLabels && (
        <div data-slot="slider-end-labels" className="flex justify-between text-2xs leading-none text-muted-foreground">
          <span>{endLabels[0]}</span>
          <span>{endLabels[1]}</span>
        </div>
      )}
    </div>
  );
}
