import React from 'react';
import { Trash2, Copy, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription
} from "@/components/ui/drawer";
import { useProjectStore } from '@/store/useProjectStore';
import { useResponsive } from "@/hooks/useResponsive";
import {
  INSPECTOR_WIDTH_DESKTOP,
  INSPECTOR_WIDTH_TABLET,
  PANEL_MARGIN
} from '@/constants/layout';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';

export function InspectorSection({ 
  value, 
  title, 
  children,
  className,
}: { 
  value: string; 
  title: string; 
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AccordionItem 
      value={value} 
      className={cn(
        "border border-border/40 bg-secondary/25 hover:bg-secondary/35 rounded-xl px-3.5 mb-2.5 transition-colors overflow-hidden data-[state=open]:bg-secondary/35",
        className
      )}
    >
      <AccordionTrigger className="hover:no-underline py-2.5 text-xs font-semibold tracking-tight text-foreground/90 hover:text-foreground">
        <span>{title}</span>
      </AccordionTrigger>
      <AccordionContent className="pt-1 pb-3.5 flex flex-col gap-3">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

export function ItemActions({
  id,
  kind,
  customLabel,
}: {
  id: string;
  kind: 'route' | 'boundary' | 'callout' | 'camera-kf';
  customLabel?: string;
}) {
  const { removeItem, selectItem, removeCameraKeyframe, selectKeyframe, duplicateItem } = useProjectStore();

  const isCameraKF = kind === 'camera-kf';
  const canDuplicate = kind !== 'camera-kf';

  const handleDelete = () => {
    if (isCameraKF) {
      removeCameraKeyframe(id);
      selectKeyframe(null);
    } else {
      removeItem(id);
      selectItem(null);
    }
  };

  const kindLabel = 
    kind === 'route' ? 'Route' :
    kind === 'boundary' ? 'Boundary' :
    kind === 'callout' ? 'Callout' : 'Keyframe';

  return (
    <div className="flex flex-col gap-2 w-full">
      {canDuplicate && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => duplicateItem(id)}
          className="w-full h-9 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold bg-background/40 hover:bg-secondary/80 border-border/50 transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          <Copy size={13} /> Duplicate
        </Button>
      )}
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        className="w-full h-9 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
      >
        <Trash2 size={13} /> {customLabel || `Delete ${kindLabel}`}
      </Button>
    </div>
  );
}

export function PanelWrapper({ 
  title, 
  icon,
  children, 
  footer 
}: { 
  title: string; 
  icon?: React.ReactNode;
  children: React.ReactNode; 
  footer?: React.ReactNode 
}) {
  const { isMobile, isTablet } = useResponsive();
  const { isInspectorOpen, setIsInspectorOpen } = useProjectStore();
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
        <DrawerContent className="h-[96vh] max-h-none p-0 outline-none border-0 bg-white dark:bg-slate-950 rounded-t-[32px] shadow-2xl pointer-events-auto">
          <DrawerHeader className="px-6 pb-2 pt-6 border-b border-border/10 shrink-0 flex items-center gap-2">
            {icon && <span className="text-primary">{icon}</span>}
            <DrawerTitle className="text-lg font-bold tracking-tight">{title}</DrawerTitle>
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
      className="absolute bg-background/85 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col transition-all duration-300 z-30"
      style={{ ...widthStyles, ...positionStyles }}
    >
      <div className="p-3.5 px-4 border-b border-border/40 shrink-0 bg-background/50 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-primary shrink-0">{icon}</span>}
          <h2 className="text-xs font-bold tracking-tight text-foreground truncate">{title}</h2>
        </div>
        <IconButton
          variant="ghost"
          size="xs"
          className="rounded-lg hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
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

