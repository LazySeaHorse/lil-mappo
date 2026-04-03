import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { searchPlaces } from '@/services/geocoding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Car, Footprints, Plane, Search, Loader2, Crosshair, 
  Route as RouteIcon, Upload, Plus,
  MapPin, X
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { RouteItem, SearchResult } from '@/store/types';
import { SearchField } from '../Search/SearchField';

export const RouteAddDropdown = ({ onImportClick }: { onImportClick: () => void }) => {
  const { 
    addItem, selectItem, playheadTime, previewRoute, setPreviewRoute,
    editingRoutePoint, setEditingRoutePoint,
    draftStart, setDraftStart, draftEnd, setDraftEnd
  } = useProjectStore();
  
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'car' | 'walk' | 'flight'>('car');
  const [start, setStart] = useState<[number, number]>([0, 0]);
  const [startName, setStartName] = useState('');
  const [end, setEnd] = useState<[number, number]>([0, 0]);
  const [endName, setEndName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync internal state from store drafts (map picks)
  useEffect(() => {
    if (draftStart) {
      setStart(draftStart.lngLat);
      setStartName(draftStart.name);
      setDraftStart(null); // consume it
    }
  }, [draftStart, setDraftStart]);

  useEffect(() => {
    if (draftEnd) {
      setEnd(draftEnd.lngLat);
      setEndName(draftEnd.name);
      setDraftEnd(null); // consume it
    }
  }, [draftEnd, setDraftEnd]);

  const calculate = async () => {
    if (start[0] === 0 || end[0] === 0) {
      toast.error('Set start and end');
      return;
    }
    setLoading(true);
    try {
      let geojson: GeoJSON.Geometry;
      if (mode === 'car' || mode === 'walk') {
        const res = await getDirections(start, end, mode);
        geojson = res.geometry;
      } else {
        geojson = calculateFlightArc(start, end);
      }
      setPreviewRoute({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: geojson, properties: {} }]
      });
      toast.success('Ready to insert');
    } catch (e) {
      toast.error('Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    if (!previewRoute) return;

    const id = nanoid();
    const item: RouteItem = {
      kind: 'route',
      id,
      name: `${startName || 'Start'} to ${endName || 'End'}`,
      geojson: previewRoute,
      startTime: playheadTime,
      endTime: playheadTime + 5,
      style: {
        color: mode === 'flight' ? '#f59e0b' : '#3b82f6',
        width: 4,
        glow: true,
        glowColor: mode === 'flight' ? '#fbbf24' : '#3b82f6',
        glowWidth: 12,
        trailFade: false,
        trailFadeLength: 0.3,
        dashPattern: null,
      },
      calculation: {
        mode,
        startPoint: start,
        endPoint: end,
        vehicle: {
          enabled: true,
          type: mode === 'flight' ? 'plane' : 'car',
          modelId: '',
          scale: 1,
        }
      },
      easing: 'easeInOutQuad',
    };

    addItem(item);
    selectItem(id);
    setStart([0, 0]);
    setStartName('');
    setEnd([0, 0]);
    setEndName('');
    setPreviewRoute(null);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={`h-8 w-8 px-0 transition-colors ${isOpen ? 'text-primary bg-primary/5' : 'text-foreground hover:text-primary'}`}
        >
          <RouteIcon size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align={isMobile ? "center" : "start"}
        collisionPadding={16}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="w-[calc(100vw-32px)] md:w-[300px] bg-background/95 border border-border rounded-2xl shadow-xl !overflow-visible flex flex-col max-h-[80vh] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="p-4 flex flex-col gap-4 w-full !overflow-visible">
          <div className="flex bg-secondary/50 p-1 rounded-lg text-xs font-medium">
            {(['car', 'walk', 'flight'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-md transition-all ${mode === m ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <span className="capitalize">{m}</span>
              </button>
            ))}
          </div>

          <div className="space-y-4 relative !overflow-visible">
            <SearchField 
              label="Start Location"
              value={start}
              name={startName}
              onSelect={(lngLat, name) => { setStart(lngLat); setStartName(name); }}
              color="bg-green-500/10 text-green-500 border-green-500/20"
              isPicking={editingRoutePoint === 'start'}
              onStartPick={() => setEditingRoutePoint(editingRoutePoint === 'start' ? null : 'start')}
            />
            
            <SearchField 
              label="End Location"
              value={end}
              name={endName}
              onSelect={(lngLat, name) => { setEnd(lngLat); setEndName(name); }}
              color="bg-red-500/10 text-red-500 border-red-500/20"
              isPicking={editingRoutePoint === 'end'}
              onStartPick={() => setEditingRoutePoint(editingRoutePoint === 'end' ? null : 'end')}
            />
          </div>

          <div className="flex flex-col gap-2 w-full mt-2">
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={calculate}
              className="w-full h-8 flex items-center justify-center gap-1.5 text-xs bg-secondary/50 hover:bg-secondary border border-border/50"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Preview Path
            </Button>

            <Button 
              variant="default"
              size="sm" 
              onClick={handleAdd}
              disabled={!previewRoute}
              className="w-full h-8 flex items-center justify-center gap-1.5 text-xs font-medium"
            >
              <Plus size={13} /> Insert Route
            </Button>

            <Button 
              variant="ghost"
              size="sm"
              onClick={onImportClick}
              className="w-full h-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-medium"
            >
              <Upload size={13} /> Import KML / GPX
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
