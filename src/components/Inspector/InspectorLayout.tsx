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

export function InspectorSection({ value, title, children }: { value: string; title: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={value} className="border-b-0 bg-secondary/30 rounded-lg px-3 mb-3">
      <AccordionTrigger className="hover:no-underline py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground">
        {title}
      </AccordionTrigger>
      <AccordionContent className="pb-3 flex flex-col">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

export function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="destructive" size="sm" onClick={onClick} className="mt-4 w-full h-8 flex items-center justify-center gap-1.5 text-xs">
      <Trash2 size={14} /> Delete
    </Button>
  );
}

export function ItemActions({
  id,
  kind
}: {
  id: string;
  kind: 'route' | 'boundary' | 'callout' | 'camera-kf'
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

  return (
    <div className="flex flex-col gap-2 w-full mt-4">
      {canDuplicate && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => duplicateItem(id)}
          className="w-full h-8 flex items-center justify-center gap-1.5 text-xs bg-secondary/50 hover:bg-secondary border border-border/50"
        >
          <Copy size={13} /> Duplicate
        </Button>
      )}
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDelete}
        className="w-full h-8 flex items-center justify-center gap-1.5 text-xs"
      >
        <Trash2 size={13} /> Delete {isCameraKF ? 'Keyframe' : kind.charAt(0).toUpperCase() + kind.slice(1)}
      </Button>
    </div>
  );
}

export function PanelWrapper({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
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
          <DrawerHeader className="px-6 pb-2 pt-6 border-b border-border/10 shrink-0">
            <DrawerTitle className="text-lg font-bold tracking-tight">{title}</DrawerTitle>
            <DrawerDescription className="hidden">Adjust settings for {title}</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto w-full relative mt-2 scroll-smooth px-2" vaul-drawer-scrollable="">
            <div className="p-4 pb-48 flex flex-col gap-1">
              {children}
              {footer && (
                <div className="mt-12 pt-8 border-t border-border/10 px-4">
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
      className={`absolute bg-background/80 backdrop-blur-xl border border-white/10 dark:border-white/5 rounded-2xl shadow-xl !overflow-visible pointer-events-auto flex flex-col transition-all duration-300`}
      style={{ ...widthStyles, ...positionStyles }}
    >
      <div className="p-4 py-3 border-b border-white/10 dark:border-white/5 shrink-0 bg-background/50 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => setIsInspectorOpen(false)}
        >
          <X size={14} />
        </Button>
      </div>
      <ScrollArea className="flex-1 w-full relative group min-h-0">
        <div className="p-4 flex flex-col gap-1">
          {children}
        </div>
        <ScrollBar orientation="vertical" className="z-40 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </ScrollArea>
      {footer && (
        <div className="p-4 border-t border-white/10 dark:border-white/5 shrink-0 bg-background/50">
          {footer}
        </div>
      )}
    </div>
  );
}
