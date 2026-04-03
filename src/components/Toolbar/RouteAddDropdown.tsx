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
  MapPin, X, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { RouteItem, SearchResult } from '@/store/types';
import { SearchField } from '../Search/SearchField';

import { PremiumLabel } from '../Inspector/InspectorShared';

export const RouteAddDropdown = ({ 
  onImportClick, 
  isOpen, 
  onOpenChange 
}: { 
  onImportClick: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { 
    addItem, selectItem, playheadTime, previewRoute, setPreviewRoute,
    editingRoutePoint, setEditingRoutePoint,
    draftStart, setDraftStart, draftEnd, setDraftEnd
  } = useProjectStore();
  
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
      toast.success('Path preview ready');
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
    onOpenChange(false);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={`h-8 w-8 px-0 transition-all duration-300 ${isOpen ? 'text-primary bg-primary/10 scale-110 shadow-lg' : 'text-foreground hover:text-primary hover:bg-primary/5'}`}
          title="Plan Route"
        >
          <RouteIcon size={18} className={isOpen ? 'animate-pulse' : ''} />
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
              <RouteIcon size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Plan Route</h3>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Choose travel mode & points</p>
            </div>
          </div>

          <div className="flex bg-secondary/50 p-1 rounded-lg text-xs font-medium">
            {(['car', 'walk', 'flight'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${mode === m ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {m === 'car' && <Car size={12} />}
                {m === 'walk' && <Footprints size={12} />}
                {m === 'flight' && <Plane size={12} />}
                <span className="capitalize">{m}</span>
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1 overflow-hidden min-h-0">
          <div className="p-4 space-y-6">
            <div className="space-y-4">
              <PremiumLabel>Route Points</PremiumLabel>
              <SearchField 
                label="Start Location..."
                value={start}
                name={startName}
                onSelect={(lngLat, name) => { setStart(lngLat); setStartName(name); }}
                color="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                isPicking={editingRoutePoint === 'start'}
                onStartPick={() => setEditingRoutePoint(editingRoutePoint === 'start' ? null : 'start')}
              />
              
              <div className="relative h-2 ml-4 border-l-2 border-dashed border-border/50" />

              <SearchField 
                label="End Location..."
                value={end}
                name={endName}
                onSelect={(lngLat, name) => { setEnd(lngLat); setEndName(name); }}
                color="bg-rose-500/10 text-rose-500 border-rose-500/20"
                isPicking={editingRoutePoint === 'end'}
                onStartPick={() => setEditingRoutePoint(editingRoutePoint === 'end' ? null : 'end')}
              />
            </div>

            {previewRoute && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-bottom-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Check size={14} className="text-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Path Validated</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setPreviewRoute(null)} className="h-6 text-[10px]">Clear</Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border/50 bg-secondary/5 shrink-0 space-y-2">
          {!previewRoute ? (
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={calculate}
              className="w-full h-9 flex items-center justify-center gap-2 text-xs font-bold bg-secondary/50 hover:bg-secondary border border-border/50 rounded-xl"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Preview Path
            </Button>
          ) : (
            <Button 
              variant="default"
              size="sm" 
              onClick={handleAdd}
              className="w-full h-9 flex items-center justify-center gap-2 text-xs font-bold rounded-xl"
            >
              <Plus size={16} /> Insert Route
            </Button>
          )}

          <Button 
            variant="ghost"
            size="sm"
            onClick={onImportClick}
            className="w-full h-8 flex items-center justify-center gap-2 text-xs text-muted-foreground font-medium hover:text-foreground"
          >
            <Upload size={13} /> Import KML / GPX data
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

