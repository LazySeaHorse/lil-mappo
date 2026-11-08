import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TIMELINE_GROUP_TERMS } from '@/lib/terms';
import { cn } from '@/lib/utils';
import { GROUP_COLORS } from '@/store/timelineGroups';
import type { GroupBlock } from '@/store/timelineLanes';
import { useProjectStore } from '@/store/useProjectStore';

/** A group's controls beside its first lane: the colour dot (selects it, opens its options) and the fold arrow. */
export default function TimelineGroupGutter({ block }: { block: GroupBlock }) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const selectItems = useProjectStore((s) => s.selectItems);
  const setGroupColor = useProjectStore((s) => s.setGroupColor);
  const ungroupItems = useProjectStore((s) => s.ungroupItems);
  const toggleGroupCollapsed = useProjectStore((s) => s.toggleGroupCollapsed);

  return (
    // A press here is not a press on empty lane space, which would clear the selection. React
    // bubbles the popover's presses through here too, though it renders in a portal.
    <div
      data-testid={`timeline-group-${block.groupId}-gutter`}
      className="absolute inset-0 flex items-center justify-center gap-0.5 pl-1"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={TIMELINE_GROUP_TERMS.options}
            onClick={() => selectItems(block.memberIds)}
            className="size-2.5 shrink-0 rounded-full border border-black/15 dark:border-white/20 transition-transform hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ backgroundColor: block.color }}
          />
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={6} className="w-auto rounded-xl border border-border/60 bg-popover p-2.5 shadow-xl z-overlay">
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-4 gap-2">
              {GROUP_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={TIMELINE_GROUP_TERMS.color(color)}
                  aria-pressed={color === block.color}
                  onClick={() => setGroupColor(block.groupId, color)}
                  className={cn(
                    'size-5 rounded-full border border-black/15 dark:border-white/20 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    color === block.color && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => {
                setOptionsOpen(false);
                ungroupItems(block.memberIds);
              }}
            >
              {TIMELINE_GROUP_TERMS.ungroup}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={block.collapsed ? TIMELINE_GROUP_TERMS.expand : TIMELINE_GROUP_TERMS.collapse}
        aria-expanded={!block.collapsed}
        onClick={() => toggleGroupCollapsed(block.groupId)}
        className="shrink-0 rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronDown size={12} aria-hidden="true" className={cn('transition-transform duration-150', block.collapsed && '-rotate-90')} />
      </button>
    </div>
  );
}
