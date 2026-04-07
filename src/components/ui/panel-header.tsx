import * as React from "react";
import { cn } from "./utils";

/**
 * Icon badge + title + subtitle row used at the top of dropdown panels.
 * Replaces the copy-pasted header block in RouteAddDropdown, CalloutAddDropdown, BoundaryAddDropdown.
 */
function PanelHeader({
  icon,
  title,
  subtitle,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  className?: string;
  /** Optional extra content below the title row (e.g., SegmentedControl, search bar) */
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("p-4 border-b border-border/50 bg-secondary/10 shrink-0", className)}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-bold tracking-tight">{title}</h3>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

export { PanelHeader };
