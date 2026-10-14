import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function InputText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-xs"
    />
  );
}

export function InputNumber({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision = 2,
  className,
  'aria-label': ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Decimal places shown; the value itself is not rounded. */
  precision?: number;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <Input
      type="number"
      aria-label={ariaLabel}
      value={isNaN(value) ? '' : Number(value.toFixed(precision))}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className={cn("h-8 text-xs font-mono", className)}
    />
  );
}
