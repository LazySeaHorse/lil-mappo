import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { Button } from '@/components/ui/button';
import { 
  Car, Footprints, Plane, Search, Loader2,
  Navigation, Upload, Plus, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { RouteItem } from '@/store/types';
import { SearchField } from '../Search/SearchField';

import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDropdownPanel } from '@/components/ui/toolbar-dropdown-panel';
import { PanelHeader } from '@/components/ui/panel-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SectionLabel } from '@/components/ui/field';

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
        animationType: 'draw' as const,
        cometTrailLength: 0.2,
      },
      calculation: {
        mode,
        startPoint: start,
        endPoint: end,
        vehicle: {
          enabled: true,
          type: 'dot' as const,
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

  const trigger = (
    <IconButton
      variant={isOpen ? "toolbar-active" : "toolbar"}
      size="sm"
      title="Plan Route"
    >
      <Navigation size={18} className={isOpen ? 'animate-pulse' : ''} />
    </IconButton>
  );

  const header = (
    <PanelHeader 
      icon={<Navigation size={16} />} 
      title="Plan Route" 
      subtitle="Choose travel mode & points"
    >
      <SegmentedControl
        options={[
          { value: 'car', label: 'Car', icon: <Car size={12} /> },
          { value: 'walk', label: 'Walk', icon: <Footprints size={12} /> },
          { value: 'flight', label: 'Flight', icon: <Plane size={12} /> },
        ]}
        value={mode}
        onValueChange={setMode}
      />
    </PanelHeader>
  );

  const footer = (
    <div className="space-y-2">
      {!previewRoute ? (
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={calculate}
          className="w-full h-9 flex items-center justify-center gap-2 text-xs font-bold bg-secondary/50 hover:bg-secondary border border-border/50 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Preview Path
        </Button>
      ) : (
        <Button 
          variant="default"
          size="sm" 
          onClick={handleAdd}
          className="w-full h-9 flex items-center justify-center gap-2 text-xs font-bold rounded-xl shadow-lg shadow-primary/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
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
  );

  return (
    <ToolbarDropdownPanel
      open={isOpen}
      onOpenChange={onOpenChange}
      trigger={trigger}
      header={header}
      footer={footer}
    >
      <div className="space-y-4">
        <SectionLabel>Route Points</SectionLabel>
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
    </ToolbarDropdownPanel>
  );
};
