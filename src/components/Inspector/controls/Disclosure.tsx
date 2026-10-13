import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

/**
 * A small closed-by-default group inside a section, for settings most users
 * never need. The content is not rendered while it is closed. The state is
 * local: it is not remembered between panels.
 */
export function Disclosure({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Collapsible className={cn('flex flex-col gap-2.5', className)}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span>{label}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2.5">{children}</CollapsibleContent>
    </Collapsible>
  );
}
