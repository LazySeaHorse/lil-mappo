import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { ScrollArea } from "./scroll-area";
import { cn } from "@/lib/utils";

interface ToolbarDropdownPanelProps {
  /** Controlled open state */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trigger element (usually an IconButton) */
  trigger: React.ReactNode;
  /** Content for the header area — use PanelHeader here */
  header: React.ReactNode;
  /** Scrollable body content */
  children: React.ReactNode;
  /** Fixed footer area — typically action buttons */
  footer: React.ReactNode;
  /** Alignment of the dropdown */
  align?: "start" | "center" | "end";
  className?: string;
}

/**
 * The standard non-modal dropdown panel used by all 3 "Add" tools in the Toolbar.
 *
 * Layout:
 *   ┌──────────────────┐
 *   │  header          │  ← PanelHeader + optional extra controls
 *   ├──────────────────┤
 *   │  ScrollArea body │  ← children (search fields, previews, etc.)
 *   ├──────────────────┤
 *   │  footer          │  ← action buttons (Insert, Preview, etc.)
 *   └──────────────────┘
 *
 * Key behaviors (baked in):
 * - `modal={false}` — non-modal, allows map interaction while open
 * - `onPointerDownOutside` and `onInteractOutside` are suppressed — panel stays open
 * - Responsive width: full-width on mobile, 320px on desktop
 * - Glassmorphism styling with rounded-2xl corners
 */
function ToolbarDropdownPanel({
  open,
  onOpenChange,
  trigger,
  header,
  children,
  footer,
  align = "start",
  className,
}: ToolbarDropdownPanelProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        collisionPadding={16}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          "w-[calc(100vw-32px)] md:w-[320px] bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-0 overflow-hidden flex flex-col max-h-[85vh]",
          className,
        )}
      >
        {header}
        <ScrollArea className="flex-1 overflow-hidden min-h-0">
          <div className="p-4 space-y-6">{children}</div>
        </ScrollArea>
        <div className="p-4 border-t border-border/50 bg-secondary/5 shrink-0">
          {footer}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ToolbarDropdownPanel };
export type { ToolbarDropdownPanelProps };
