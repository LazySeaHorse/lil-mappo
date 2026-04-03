import React, { useState } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { MapPin, Car, Footprints, Plane, ArrowLeftRight, Search, Loader2, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import type { RouteItem } from '@/store/types';

interface RoutePlannerProps {
  item: RouteItem;
}

export const RoutePlanner = ({ item }: RoutePlannerProps) => {
  const updateItem = useProjectStore((s) => s.updateItem);
  const { editingRoutePoint, setEditingRoutePoint } = useProjectStore();
  const [loading, setLoading] = useState(false);

  const calc = item.calculation || {
    mode: 'manual',
    startPoint: [0, 0],
    endPoint: [0, 0],
  };

  const handleModeChange = (mode: 'car' | 'walk' | 'flight' | 'manual') => {
    updateItem(item.id, {
      calculation: { ...calc, mode }
    } as any);
  };

  const calculateRoute = async () => {
    if (calc.mode === 'manual') return;
    if (!calc.startPoint || !calc.endPoint || (calc.startPoint[0] === 0 && calc.startPoint[1] === 0)) {
       toast.error('Set start and end points first');
       return;
    }

    setLoading(true);
    try {
      if (calc.mode === 'car' || calc.mode === 'walk') {
        const result = await getDirections(calc.startPoint, calc.endPoint, calc.mode);
        updateItem(item.id, {
          geojson: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: result.geometry,
              properties: {}
            }]
          }
        } as any);
        toast.success(`Route calculated: ${(result.distance / 1000).toFixed(1)}km`);
      } else if (calc.mode === 'flight') {
        const result = calculateFlightArc(calc.startPoint, calc.endPoint);
        updateItem(item.id, {
          geojson: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: result,
              properties: {}
            }]
          }
        } as any);
        toast.success('Flight arc generated');
      } else {
         toast.info('Calculation for this mode not implemented yet');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to calculate route');
    } finally {
      setLoading(false);
    }
  };

  const swapPoints = () => {
    updateItem(item.id, {
      calculation: {
        ...calc,
        startPoint: calc.endPoint,
        endPoint: calc.startPoint
      }
    } as any);
  };

  return (
    <div className="space-y-4">
      <div className="flex bg-secondary/30 p-1 rounded-lg">
        {(['manual', 'car', 'walk', 'flight'] as const).map((m) => (
          <Button
            key={m}
            variant="ghost"
            size="sm"
            className={`flex-1 h-8 rounded-md capitalize transition-all ${calc.mode === m ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => handleModeChange(m)}
          >
            {m === 'manual' && <MapPin size={14} className="mr-1" />}
            {m === 'car' && <Car size={14} className="mr-1" />}
            {m === 'walk' && <Footprints size={14} className="mr-1" />}
            {m === 'flight' && <Plane size={14} className="mr-1" />}
            <span className="text-[10px] font-bold">{m}</span>
          </Button>
        ))}
      </div>

      {calc.mode !== 'manual' && (
        <div className="space-y-3 relative">
           <div className="flex flex-col gap-2">
             <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center shrink-0 border border-green-500/30">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
               </div>
               <Input 
                 placeholder="Start Lng, Lat" 
                 value={calc.startPoint[0] !== 0 ? `${calc.startPoint[0].toFixed(4)}, ${calc.startPoint[1].toFixed(4)}` : 'Click crosshair to set...'} 
                 readOnly 
                 className="h-8 text-[10px] font-mono bg-background/50 cursor-default"
               />
               <Button 
                variant={editingRoutePoint === 'start' ? 'default' : 'outline'}
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  setEditingRoutePoint(editingRoutePoint === 'start' ? null : 'start');
                  if (!editingRoutePoint) toast.info('Click on map to set start point');
                }}
               >
                 <Crosshair size={14} />
               </Button>
             </div>
             
             <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center shrink-0 border border-red-500/30">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
               </div>
               <Input 
                 placeholder="End Lng, Lat" 
                 value={calc.endPoint[0] !== 0 ? `${calc.endPoint[0].toFixed(4)}, ${calc.endPoint[1].toFixed(4)}` : 'Click crosshair to set...'} 
                 readOnly 
                 className="h-8 text-[10px] font-mono bg-background/50 cursor-default"
               />
               <Button 
                variant={editingRoutePoint === 'end' ? 'default' : 'outline'}
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  setEditingRoutePoint(editingRoutePoint === 'end' ? null : 'end');
                  if (!editingRoutePoint) toast.info('Click on map to set end point');
                }}
               >
                 <Crosshair size={14} />
               </Button>
             </div>
           </div>

           <Button 
             variant="ghost" 
             size="icon" 
             className="absolute right-10 top-[22px] w-8 h-8 rounded-full bg-background shadow-md border hover:bg-accent"
             onClick={swapPoints}
             title="Swap Points"
           >
             <ArrowLeftRight size={14} />
           </Button>

           <Button 
             onClick={calculateRoute} 
             disabled={loading} 
             className="w-full h-9 flex items-center justify-center gap-2 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95"
           >
             {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={16} />}
             <span className="font-bold text-xs uppercase tracking-wider">Calculate Route</span>
           </Button>

           <div className="pt-3 border-t border-border/20 flex flex-col gap-3">
             <label className="flex items-center justify-between cursor-pointer group px-1">
               <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">Show 3D Vehicle</span>
               <Switch 
                 checked={calc.vehicle?.enabled || false} 
                 onCheckedChange={(v) => updateItem(item.id, { 
                   calculation: { 
                     ...calc, 
                     vehicle: { 
                       enabled: v, 
                       type: calc.mode === 'flight' ? 'plane' : 'car',
                       modelId: '',
                       scale: calc.vehicle?.scale || 1 
                     } 
                   } 
                 } as any)} 
               />
             </label>

             {calc.vehicle?.enabled && (
               <div className="px-1 space-y-2">
                 <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                   <span>Model Scale</span>
                   <span>{calc.vehicle.scale.toFixed(1)}x</span>
                 </div>
                 <Slider 
                   value={[calc.vehicle.scale]} 
                   min={0.1} 
                   max={10} 
                   step={0.1} 
                   onValueChange={([v]) => updateItem(item.id, {
                     calculation: {
                       ...calc,
                       vehicle: { ...calc.vehicle!, scale: v }
                     }
                   } as any)}
                 />
               </div>
             )}
           </div>
        </div>
      )}
    </div>
  );
};
