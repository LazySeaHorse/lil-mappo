import React from 'react';
import { X } from 'lucide-react';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription
} from "@/components/ui/drawer";
import { useProjectStore } from '@/store/useProjectStore';
import { useShallow } from 'zustand/react/shallow';
import { useResponsive } from "@/hooks/useResponsive";
import {
  INSPECTOR_WIDTH_DESKTOP,
  INSPECTOR_WIDTH_TABLET,
  PANEL_MARGIN
} from '@/constants/layout';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';

export function PanelWrapper({ 
  title, 
  icon,
  header,
  children, 
  footer 
}: { 
  /** Panel name. Screen readers read it; it is shown unless `header` replaces it. */
  title: string; 
  icon?: React.ReactNode;
  /** Replaces the title text, e.g. an `InspectorHeader`. */
  header?: React.ReactNode;
  children: React.ReactNode; 
  footer?: React.ReactNode 
}) {
  const { isMobile, isTablet } = useResponsive();
  const { isInspectorOpen, setIsInspectorOpen } = useProjectStore(
    useShallow(s => ({
      isInspectorOpen: s.isInspectorOpen,
      setIsInspectorOpen: s.setIsInspectorOpen,
    }))
  );
  const [snap, setSnap] = React.useState<number | string | null>(0.7);

  if (isMobile) {
    return (
      <Drawer
        open={isInspectorOpen}
        onOpenChange={(open) => setIsInspectorOpen(open)}
        snapPoints={[0.7, 1]}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
      >
        <DrawerContent
          data-walkthrough="inspector-panel"
          className="h-[96vh] max-h-none p-0 outline-none border-0 bg-white dark:bg-slate-950 rounded-t-2xl shadow-2xl pointer-events-auto"
        >
          <DrawerHeader className="px-6 pb-2 pt-6 border-b border-border/10 shrink-0 flex items-center gap-2">
            {icon && <span className="text-primary">{icon}</span>}
            {header ? (
              <>
                <DrawerTitle className="sr-only">{title}</DrawerTitle>
                {header}
              </>
            ) : (
              <DrawerTitle className="text-lg font-medium tracking-tight">{title}</DrawerTitle>
            )}
            <DrawerDescription className="hidden">Adjust settings for {title}</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto w-full relative mt-2 scroll-smooth px-2" vaul-drawer-scrollable="">
            <div className="p-4 pb-48 flex flex-col gap-3">
              {children}
              {footer && (
                <div className="mt-8 pt-4 border-t border-border/20 px-2">
                  {footer}
                </div>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  const widthStyles: React.CSSProperties = {
    width: isTablet ? `${INSPECTOR_WIDTH_TABLET}px` : `${INSPECTOR_WIDTH_DESKTOP}px`
  };
  const positionStyles: React.CSSProperties = {
    top: `${PANEL_MARGIN}px`,
    right: `${PANEL_MARGIN}px`,
    bottom: `${PANEL_MARGIN}px`
  };

  return (
    <div
      data-walkthrough="inspector-panel"
      className="absolute bg-background/85 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col transition-all duration-300 z-30"
      style={{ ...widthStyles, ...positionStyles }}
    >
      <div className="p-3.5 px-4 border-b border-border/40 shrink-0 bg-background/50 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="text-primary shrink-0">{icon}</span>}
          {header ?? <h2 className="text-xs font-medium tracking-tight text-foreground truncate">{title}</h2>}
        </div>
        <IconButton
          variant="ghost"
          size="xs"
          className="rounded-lg hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
          aria-label="Close panel"
          onClick={() => setIsInspectorOpen(false)}
        >
          <X size={14} />
        </IconButton>
      </div>
      <ScrollArea className="flex-1 w-full relative group min-h-0">
        <div className="p-4 flex flex-col gap-1">
          {children}
        </div>
        <ScrollBar orientation="vertical" className="z-40 w-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </ScrollArea>
      {footer && (
        <div className="p-3.5 px-4 border-t border-border/40 shrink-0 bg-background/50 backdrop-blur-md">
          {footer}
        </div>
      )}
    </div>
  );
}
