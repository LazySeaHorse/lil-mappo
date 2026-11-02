import React, { useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * A faint (i) icon that sits right after a label and shows a short hint.
 *
 * - Mouse: hover shows the hint. Keyboard: focus shows it.
 * - Touch has no hover, so a tap on the icon toggles the hint too. The tooltip is
 *   controlled for that: Radix closes it on pointer down, so the click handler
 *   toggles from the state that was open before the press (a mouse click just opens).
 * - Escape, a tap elsewhere, and leaving the icon close it.
 *
 * It is a real button. Its name is "More info" (or `label`); the open tooltip is its description.
 * `children` swap the icon for other content, such as the date badge of a historical search result.
 */
export function InfoTip({
  text,
  className,
  label = 'More info',
  children,
}: {
  text: string;
  className?: string;
  /** The button's accessible name. */
  label?: string;
  /** What the button shows instead of the (i) icon; the caller styles it through `className`. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // State before the press: Radix closes an open tooltip on pointer down, before click.
  const openBeforePress = useRef<boolean | null>(null);

  return (
    <Tooltip open={open} onOpenChange={setOpen} disableHoverableContent>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-slot="info-tip"
          // A mouse click on a tip that hover opened keeps it open; a tap toggles.
          onPointerDown={(event) => { openBeforePress.current = event.pointerType === 'mouse' ? false : open; }}
          onClick={(event) => {
            // Keep Radix from closing the tooltip again in its own click handler.
            event.preventDefault();
            const wasOpen = openBeforePress.current ?? open;
            openBeforePress.current = null;
            setOpen(!wasOpen);
          }}
          className={cn(
            'inline-flex shrink-0 items-center justify-center outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
            !children && 'size-4 rounded-full text-muted-foreground/60 hover:text-muted-foreground focus-visible:text-foreground',
            className,
          )}
        >
          {children ?? <Info size={12} aria-hidden="true" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56 text-center leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
