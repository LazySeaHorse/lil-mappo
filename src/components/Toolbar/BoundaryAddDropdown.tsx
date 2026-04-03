import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MapPin, Plus, Check, Search, Palette, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { BoundaryItem } from '@/store/types';
import { BoundarySearch } from '../Inspector/BoundarySearch';
import { useMapRef } from '@/hooks/useMapRef';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Field, InputColor } from '../Inspector/InspectorShared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const BoundaryAddDropdown = () => {
  const { 
    addItem, selectItem, playheadTime, 
    previewBoundary, setPreviewBoundary,
    previewBoundaryStyle, setPreviewBoundaryStyle,
    draftBoundaryName, clearPreviewBoundary
  } = useProjectStore();
  
  const mapRef = useMapRef();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSelect = (r: any) => {
    setPreviewBoundary(r.geojson, r.display_name.split(',')[0]);
    
    // Zoom to boundary
    const map = mapRef.current?.getMap();
    if (map && r.geojson) {
      // Very simple bbox calculation for zooming
      let coords: number[][] = [];
      if (r.geojson.type === 'Polygon') coords = r.geojson.coordinates[0];
      else if (r.geojson.type === 'MultiPolygon') coords = r.geojson.coordinates[0][0];

      if (coords.length > 0) {
        const lats = coords.map(c => c[1]);
        const lngs = coords.map(c => c[0]);
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)]
        ];
        map.fitBounds(bounds, { padding: 50, duration: 1000 });
      }
    }
  };

  const handleAdd = () => {
    if (!previewBoundary || !previewBoundaryStyle) {
      toast.error('Search for a place first');
      return;
    }

    const id = nanoid();
    const item: BoundaryItem = {
      kind: 'boundary',
      id,
      placeName: draftBoundaryName,
      geojson: previewBoundary,
      resolveStatus: 'resolved',
      startTime: playheadTime,
      endTime: playheadTime + 5,
      style: { ...previewBoundaryStyle },
      easing: 'easeInOutCubic',
    };

    addItem(item);
    selectItem(id);
    clearPreviewBoundary();
    setIsOpen(false);
    toast.success('Boundary added to timeline');
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={`h-8 w-8 px-0 transition-all duration-300 ${isOpen ? 'text-primary bg-primary/10 scale-110 shadow-lg' : 'text-foreground hover:text-primary hover:bg-primary/5'}`}
          title="Add Boundary"
        >
          <MapPin size={18} className={isOpen ? 'animate-pulse' : ''} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align={isMobile ? "center" : "start"}
        collisionPadding={16}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="w-[calc(100vw-32px)] md:w-[320px] bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-0 overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-4 border-b border-border/50 bg-secondary/10 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <MapPin size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Add Boundary</h3>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Search regions & nations</p>
            </div>
          </div>
          
          <BoundarySearch 
            initialValue="" 
            onSelect={handleSelect} 
          />
        </div>

        <ScrollArea className="flex-1 overflow-hidden min-h-0">
          <div className="p-4 pt-2">
            {!previewBoundary ? (
              <div className="py-12 flex flex-col items-center justify-center text-center opacity-40">
                <Search size={32} className="mb-2 stroke-[1.5px]" />
                <p className="text-xs font-medium">Search for a location to<br />preview its boundary</p>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between p-2 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Check size={14} className="text-primary shrink-0" />
                    <span className="text-xs font-bold truncate">{draftBoundaryName}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearPreviewBoundary} className="h-6 text-[10px] font-bold text-muted-foreground">Change</Button>
                </div>

                <Accordion type="single" collapsible defaultValue="style" className="w-full">
                  <AccordionItem value="style" className="border-none">
                    <AccordionTrigger className="py-2 hover:no-underline px-1">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        <Palette size={14} /> Color & Style
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                       <div className="space-y-4">
                        <Field label="Choose Color">
                          <InputColor 
                            value={previewBoundaryStyle!.strokeColor} 
                            onChange={(v) => setPreviewBoundaryStyle({ strokeColor: v, fillColor: v, glowColor: v })} 
                          />
                        </Field>
                        
                        <Field label="Animation Style">
                          <Select 
                            value={previewBoundaryStyle!.animationStyle || 'draw'} 
                            onValueChange={(v) => setPreviewBoundaryStyle({ animationStyle: v as any })} 
                          >
                            <SelectTrigger className="h-8 text-sm w-full bg-background/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fade">Fade In</SelectItem>
                              <SelectItem value="draw">Drawing</SelectItem>
                              <SelectItem value="trace">Trace Line</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                       </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border/50 bg-secondary/5 shrink-0">
          <Button 
            variant="default"
            size="sm" 
            onClick={handleAdd}
            disabled={!previewBoundary}
            className="w-full h-8 flex items-center justify-center gap-1.5 text-xs font-medium"
          >
            <Plus size={13} /> Insert Boundary
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
