import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { Button } from '@/components/ui/button';
import {
  Hexagon, Plus, Check, Search, MapPin
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { BoundaryItem } from '@/store/types';
import { BoundarySearch } from '../Inspector/BoundarySearch';
import { useMapRef } from '@/hooks/useMapRef';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDropdownPanel } from '@/components/ui/toolbar-dropdown-panel';
import { PanelHeader } from '@/components/ui/panel-header';
import { SectionLabel, Field } from '@/components/ui/field';
import { ColorPicker } from '@/components/ui/color-picker';

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

  const trigger = (
    <IconButton
      variant={isOpen ? "toolbar-active" : "toolbar"}
      size="sm"
      title="Add Boundary"
    >
      <Hexagon size={18} />
    </IconButton>
  );

  const header = (
    <PanelHeader 
      icon={<Hexagon size={16} />} 
      title="Add Boundary" 
      subtitle="Search regions & nations"
    >
      <BoundarySearch 
        initialValue="" 
        onSelect={handleSelect} 
      />
    </PanelHeader>
  );

  const footer = (
    <Button 
      variant="default"
      size="sm" 
      onClick={handleAdd}
      disabled={!previewBoundary}
      className="w-full h-9 flex items-center justify-center gap-2 text-xs font-medium rounded-lg shadow-lg shadow-primary/10 transition-all"
    >
      <Plus size={13} /> Insert boundary
    </Button>
  );

  return (
    <ToolbarDropdownPanel
      open={isOpen}
      onOpenChange={onOpenChange}
      trigger={trigger}
      header={header}
      footer={footer}
    >
      {!previewBoundary ? (
        <EmptyState
          variant="dropdown"
          icon={MapPin}
          title="No location selected"
          description="Search for a country, city, or region to preview its boundary."
        />
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div>
            <SectionLabel>Selected place</SectionLabel>
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2 overflow-hidden">
                <Check size={14} className="text-primary shrink-0" />
                <span className="text-xs font-medium truncate">{draftBoundaryName}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={clearPreviewBoundary} className="h-6 text-[10px] font-medium text-muted-foreground hover:text-foreground">Change</Button>
            </div>
          </div>

          <div className="space-y-4">
            <SectionLabel>Visual appearance</SectionLabel>
            <div className="space-y-4 px-1">
              <Field label="Atmospheric color">
                <ColorPicker 
                  value={previewBoundaryStyle!.strokeColor} 
                  onChange={(v) => setPreviewBoundaryStyle({ strokeColor: v, fillColor: v, glowColor: v })} 
                />
              </Field>
              
              <Field label="Entrance animation">
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
    </ToolbarDropdownPanel>
  );
};
