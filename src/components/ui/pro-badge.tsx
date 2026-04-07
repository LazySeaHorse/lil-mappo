import * as React from "react";
import { cn } from "./utils";

/** The PRO feature badge used across the app. */
function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-black tracking-wider uppercase shrink-0",
        className,
      )}
    >
      PRO
    </span>
  );
}

/**
 * Small status pill indicator for things like "Linked", "Manual", "Resolved".
 * Used next to switches and in inspector headers.
 */
function StatusPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-[9px] font-bold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export { ProBadge, StatusPill };
