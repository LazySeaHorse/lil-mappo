import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INSPECTOR_SECTIONS, type InspectorSectionId, type InspectorSectionKind } from './inspectorSections';
import { useInspectorSections } from './useInspectorSections';

/**
 * A collapsible group of controls. The title and the first open state come
 * from `INSPECTOR_SECTIONS`; later the user's choice wins.
 */
export function InspectorSection<K extends InspectorSectionKind>({
  kind,
  id,
  children,
  className,
}: {
  kind: K;
  id: InspectorSectionId<K>;
  children: React.ReactNode;
  className?: string;
}) {
  const { isOpen, toggle } = useInspectorSections(kind);
  const open = isOpen(id);
  const title = INSPECTOR_SECTIONS[kind].find((section) => section.id === id)?.title ?? id;
  const contentId = useId();

  return (
    <section
      data-state={open ? 'open' : 'closed'}
      data-section={`${kind}-${id}`}
      className={cn(
        'border border-border/40 bg-secondary/25 hover:bg-secondary/35 rounded-xl px-3.5 mb-2.5 transition-colors overflow-hidden data-[state=open]:bg-secondary/35',
        className,
      )}
    >
      <h3 className="flex">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? contentId : undefined}
          onClick={() => toggle(id)}
          className="flex flex-1 items-center justify-between gap-4 py-2.5 text-left text-xs font-medium tracking-tight text-foreground/90 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-md"
        >
          <span>{title}</span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn('shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          />
        </button>
      </h3>
      {open && (
        <div id={contentId} role="region" aria-label={title} className="pt-1 pb-3.5 flex flex-col gap-3">
          {children}
        </div>
      )}
    </section>
  );
}
