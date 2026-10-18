import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";

/** The PRO feature badge used across the app. */
function ProBadge({ className }: { className?: string }) {
  return (
    <Badge variant="info" size="micro" className={className}>
      PRO
    </Badge>
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
        "text-2xs font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export { ProBadge, StatusPill };
