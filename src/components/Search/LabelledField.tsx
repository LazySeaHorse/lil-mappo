import type { ReactNode } from 'react';

/** A place search field with its name above it ("Start", "End", "Departure", "Arrival"). */
export const LabelledField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="px-1 text-[11px] font-medium text-foreground/90">{label}</span>
    {children}
  </div>
);
