import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";

interface SegmentedControlOption<T extends string> {
  value: T;
  label?: string;
  icon?: React.ReactNode;
  title?: string;
  'aria-label'?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Deprecated optional shape preserved for API compatibility, standardized to concentric geometry */
  shape?: "pill" | "rounded";
  className?: string;
  disabled?: boolean;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  className,
  disabled,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      disabled={disabled}
      onValueChange={(v) => { if (v) onValueChange(v as T); }}
      data-slot="segmented-control"
      className={cn(
        "flex p-1 text-xs font-medium relative bg-secondary/50 rounded-xl",
        className,
      )}
    >
      {options.map((opt) => (
        <ToggleGroupPrimitive.Item
          key={opt.value}
          value={opt.value}
          title={opt.title ?? opt.label ?? opt.value}
          aria-label={opt['aria-label'] ?? opt.label ?? opt.value}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 transition-all z-10 text-muted-foreground py-1.5 rounded-lg text-xs font-medium select-none",
            value === opt.value
              ? "text-foreground font-medium"
              : "hover:text-foreground/80",
          )}
        >
          {opt.icon}
          {opt.label ? <span className="capitalize">{opt.label}</span> : null}
        </ToggleGroupPrimitive.Item>
      ))}
      {/* Animated sliding indicator */}
      <div
        className="absolute top-1 bottom-1 bg-background shadow-sm rounded-lg transition-all duration-200 ease-out z-0"
        style={{
          width: `calc(${100 / options.length}% - 4px)`,
          left: `calc(${(options.findIndex((o) => o.value === value) * 100) / options.length}% + 2px)`,
        }}
      />
    </ToggleGroupPrimitive.Root>
  );
}

export { SegmentedControl };
export type { SegmentedControlOption, SegmentedControlProps };
