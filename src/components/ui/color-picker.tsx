import * as React from "react";
import { Input } from "./input";
import { cn } from "./utils";

/**
 * Color swatch + hex text input. Replaces `InputColor` from InspectorShared.
 * This is the canonical color picker for the entire app.
 */
function ColorPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 w-full", className)}>
      <div
        className="relative shrink-0 w-8 h-8 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] border border-white/10 dark:border-white/5 overflow-hidden cursor-pointer ring-1 ring-border/50"
        style={{ backgroundColor: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="opacity-0 absolute -inset-2 w-12 h-12 cursor-pointer"
        />
      </div>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-8 font-mono text-[11px] uppercase tracking-wider bg-background/50 focus-visible:ring-1 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
      />
    </div>
  );
}

export { ColorPicker };
