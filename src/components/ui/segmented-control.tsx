import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** "pill" = rounded-full (RoutePlanner), "rounded" = rounded-lg (RouteAddDropdown, ProjectSettings) */
  shape?: "pill" | "rounded";
  className?: string;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  shape = "rounded",
  className,
}: SegmentedControlProps<T>) {
  const isRound = shape === "pill";

  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(v) => { if (v) onValueChange(v as T); }}
      data-slot="segmented-control"
      className={cn(
        "flex p-1 text-xs font-medium relative",
        isRound ? "bg-secondary/50 rounded-full h-10" : "bg-secondary/50 rounded-lg",
        className,
      )}
    >
      {options.map((opt) => (
        <ToggleGroupPrimitive.Item
          key={opt.value}
          value={opt.value}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 transition-all z-10 text-muted-foreground",
            isRound
              ? "rounded-full text-[10px] font-bold"
              : "py-1.5 rounded-md",
            value === opt.value
              ? "text-foreground"
              : "hover:text-foreground/70",
          )}
        >
          {opt.icon}
          <span className="capitalize">{opt.label}</span>
        </ToggleGroupPrimitive.Item>
      ))}
      {/* Animated sliding indicator */}
      <div
        className={cn(
          "absolute top-1 bottom-1 bg-background shadow-sm transition-all duration-200 ease-out z-0",
          isRound ? "rounded-full" : "rounded-md",
        )}
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
