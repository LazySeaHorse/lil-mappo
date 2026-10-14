import * as React from "react";
import { Switch } from "./switch";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/Inspector/controls/InfoTip";

/** Wraps a form control with a label. This is the ONE canonical way to label a control. */
function Field({
  label,
  children,
  hint,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  /** Short help. It shows in an (i) tip right after the label. */
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 px-1", className)}>
      {(label || hint) && (
        <div className="mb-1.5 flex items-center gap-1">
          {label && (
            <label className="text-xs font-medium text-muted-foreground block">
              {label}
            </label>
          )}
          {hint && <InfoTip text={hint} />}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Section heading inside inspector/panel. Uppercase, tiny, bold.
 * Replaces BOTH `SectionTitle` and `PremiumLabel` from InspectorShared.
 */
function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h3
      className={cn(
        "text-xs font-medium text-foreground/80 mb-2 px-1",
        className,
      )}
    >
      {children}
    </h3>
  );
}

/** Labeled switch/toggle row. Replaces `Toggle` from InspectorShared. */
function SwitchField({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group rounded p-1.5 hover:bg-secondary/50 transition-colors">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-xs font-medium text-foreground group-hover:text-foreground/80">
        {label}
      </span>
    </label>
  );
}

export { Field, SectionLabel, SwitchField };
