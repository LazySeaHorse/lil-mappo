import React from 'react';
import { cn } from "@/lib/utils";

/** The label column of a row: optional icon, then the label. */
export function RowLabel({ label, icon, className }: { label: string; icon?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("text-xs font-medium text-muted-foreground shrink-0 flex items-center gap-1.5", className)}>
      {icon && <span className="text-muted-foreground/70 shrink-0">{icon}</span>}
      <span className="truncate">{label}</span>
    </span>
  );
}
