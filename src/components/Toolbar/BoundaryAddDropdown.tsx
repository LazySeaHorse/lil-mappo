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
import { Field, InputColor, PremiumLabel } from '../Inspector/InspectorShared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const BoundaryAddDropdown = ({ 
  isOpen, 
  onOpenChange 
}: { 
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { 
    addItem, selectItem, playheadTime, 
    previewBoundary, setPreviewBoundary,
    previewBoundaryStyle, setPreviewBoundaryStyle,
    draftBoundaryName, clearPreviewBoundary
  } = useProjectStore();
  
  const mapRef = useMapRef();
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
    onOpenChange(false);
    toast.success('Boundary added to timeline');
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange} modal={false}>
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
          <div className="p-4">
            {!previewBoundary ? (
              <div className="py-12 flex flex-col items-center justify-center text-center opacity-40">
                <Search size={32} className="mb-2 stroke-[1.5px]" />
                <p className="text-[11px] font-medium leading-relaxed uppercase tracking-wider">Search for a location to<br />preview its boundary</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div>
                   <PremiumLabel>Selected Place</PremiumLabel>
                   <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Check size={14} className="text-primary shrink-0" />
                      <span className="text-xs font-bold truncate">{draftBoundaryName}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={clearPreviewBoundary} className="h-6 text-[10px] font-bold text-muted-foreground hover:text-foreground">Change</Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <PremiumLabel>Visual Appearance</PremiumLabel>
                   <div className="space-y-4 px-1">
                    <Field label="Atmospheric Color">
                      <InputColor 
                        value={previewBoundaryStyle!.strokeColor} 
                        onChange={(v) => setPreviewBoundaryStyle({ strokeColor: v, fillColor: v, glowColor: v })} 
                      />
                    </Field>
                    
                    <Field label="Entrance Animation">
                      <Select 
                        value={previewBoundaryStyle!.animationStyle || 'draw'} 
                        onValueChange={(v) => setPreviewBoundaryStyle({ animationStyle: v as any })} 
                      >
                        <SelectTrigger className="h-9 text-xs transition-all bg-secondary/20 border-transparent focus:border-border/50 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/50 shadow-2xl">
                          <SelectItem value="fade">Subtle Fade In</SelectItem>
                          <SelectItem value="draw">Precise Drawing</SelectItem>
                          <SelectItem value="trace">Trace Contour</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                   </div>
                </div>
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
            className="w-full h-9 flex items-center justify-center gap-2 text-xs font-bold rounded-xl shadow-lg shadow-primary/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={13} /> Insert Boundary
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

