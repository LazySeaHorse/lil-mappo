import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem, AutoCamConfig } from '@/store/types';
import { Accordion } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { SliderRow } from './InspectorShared';
import { formatPercent } from './inspectorValues';
import { PanelWrapper, InspectorSection } from './InspectorLayout';
import { Video, VideoOff, Compass, Activity, Car, ArrowUpToLine, ZoomIn, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AutoCamInspector({ item }: { item: RouteItem }) {
  const updateItem = useProjectStore((s) => s.updateItem);
  const setSelectedAutoCamRouteId = useProjectStore((s) => s.setSelectedAutoCamRouteId);

  const config = item.autoCam!;

  const u = (patch: Partial<AutoCamConfig>) =>
    updateItem(item.id, { autoCam: { ...config, ...patch } });

  const handleDisable = () => {
    updateItem(item.id, { autoCam: { ...config, enabled: false } });
    setSelectedAutoCamRouteId(null);
  };

  const footer = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDisable}
      className="w-full h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-medium bg-background/40 hover:bg-secondary/80 border-border/50 transition-all"
    >
      <VideoOff size={13} /> Disable auto camera
    </Button>
  );

  return (
    <PanelWrapper 
      title="Auto camera"
      icon={<Video size={15} />}
      footer={footer}
    >
      {/* Visual Mode Selector Cards */}
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        {/* Cinematic Card */}
        <button
          type="button"
          onClick={() => u({ mode: 'cinematic' })}
          className={cn(
            "relative flex flex-col items-center p-3 rounded-xl border text-center transition-all cursor-pointer select-none",
            config.mode === 'cinematic'
              ? "bg-primary/10 border-primary text-foreground shadow-sm ring-1 ring-primary/20"
              : "bg-secondary/30 hover:bg-secondary/60 border-border/40 text-muted-foreground hover:text-foreground"
          )}
        >
          {/* Radio indicator */}
          <div className="w-full flex justify-start mb-1">
            <div className={cn(
              "w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors",
              config.mode === 'cinematic' ? "border-primary bg-primary" : "border-muted-foreground/40 bg-transparent"
            )}>
              {config.mode === 'cinematic' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </div>

          {/* Mini Illustration for Cinematic */}
          <div className="w-full h-16 rounded-lg bg-secondary/40 flex items-center justify-center overflow-hidden mb-2 relative">
            <svg viewBox="0 0 100 60" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Background gradient/horizon */}
              <path d="M0 35 Q 50 25 100 35 L 100 60 L 0 60 Z" fill="hsl(var(--primary) / 0.15)" />
              {/* Trees */}
              <circle cx="20" cy="30" r="8" fill="hsl(var(--item-route) / 0.5)" />
              <circle cx="80" cy="32" r="7" fill="hsl(var(--item-route) / 0.5)" />
              <rect x="18" y="36" width="4" height="6" fill="hsl(var(--muted-foreground))" opacity="0.4" />
              <rect x="78" y="37" width="4" height="5" fill="hsl(var(--muted-foreground))" opacity="0.4" />
              {/* Perspective Road */}
              <path d="M45 28 L 55 28 L 85 60 L 15 60 Z" fill="hsl(var(--primary) / 0.7)" />
              <path d="M49 30 L 51 30 L 53 60 L 47 60 Z" fill="hsl(var(--primary-foreground))" opacity="0.8" />
              {/* Little Car */}
              <rect x="42" y="44" width="16" height="10" rx="3" fill="hsl(var(--primary))" stroke="hsl(var(--primary-foreground))" strokeWidth="1" />
              <rect x="45" y="46" width="10" height="4" rx="1" fill="hsl(var(--primary-foreground) / 0.7)" />
            </svg>
          </div>

          <span className="text-xs font-medium text-foreground">Follow view</span>
          <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            Follow the route with a moving camera.
          </span>
        </button>

        {/* Navigation Card */}
        <button
          type="button"
          onClick={() => u({ mode: 'navigation' })}
          className={cn(
            "relative flex flex-col items-center p-3 rounded-xl border text-center transition-all cursor-pointer select-none",
            config.mode === 'navigation'
              ? "bg-primary/10 border-primary text-foreground shadow-sm ring-1 ring-primary/20"
              : "bg-secondary/30 hover:bg-secondary/60 border-border/40 text-muted-foreground hover:text-foreground"
          )}
        >
          {/* Radio indicator */}
          <div className="w-full flex justify-start mb-1">
            <div className={cn(
              "w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors",
              config.mode === 'navigation' ? "border-primary bg-primary" : "border-muted-foreground/40 bg-transparent"
            )}>
              {config.mode === 'navigation' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </div>

          {/* Mini Illustration for Navigation */}
          <div className="w-full h-16 rounded-lg bg-secondary/40 flex items-center justify-center overflow-hidden mb-2 relative">
            <svg viewBox="0 0 100 60" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Map grid lines */}
              <path d="M10 20 L 90 20 M10 40 L 90 40 M30 10 L 30 50 M70 10 L 70 50" stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
              {/* Map Route line with turn */}
              <path d="M20 45 L 50 45 Q 65 45 65 30 L 65 15" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round" />
              {/* Route dot */}
              <circle cx="20" cy="45" r="4" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="2" />
              {/* Navigation pointer arrow */}
              <circle cx="65" cy="15" r="8" fill="hsl(var(--primary))" />
              <path d="M65 10 L 69 18 L 65 16 L 61 18 Z" fill="hsl(var(--primary-foreground))" />
            </svg>
          </div>

          <span className="text-xs font-medium text-foreground">Navigation view</span>
          <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            Keep the route ahead in the map view.
          </span>
        </button>
      </div>

      <Accordion type="multiple" defaultValue={['camera', 'framing']} className="w-full">
        <InspectorSection value="camera" title="Camera">
          <div className="flex flex-col gap-3">
            <SliderRow
              label="Camera pitch"
              icon={<Compass size={13} />}
              value={config.pitch}
              onChange={(v) => u({ pitch: v })}
              min={0}
              max={85}
              step={1}
              unit="°"
            />
            <SliderRow
              label="Camera smoothing"
              icon={<Activity size={13} />}
              value={config.smoothing}
              onChange={(v) => u({ smoothing: v })}
              min={0}
              max={1}
              step={0.05}
              formatValue={formatPercent}
            />
          </div>
        </InspectorSection>

        {config.mode === 'cinematic' && (
          <InspectorSection value="framing" title="Follow view">
            <div className="flex flex-col gap-3">
              <SliderRow
                label="Follow distance"
                icon={<Car size={13} />}
                value={config.distance}
                onChange={(v) => u({ distance: v })}
                min={100}
                max={3000}
                step={50}
                unit="m"
              />
              <SliderRow
                label="Camera height"
                icon={<ArrowUpToLine size={13} />}
                value={config.height}
                onChange={(v) => u({ height: v })}
                min={50}
                max={2000}
                step={50}
                unit="m"
              />
            </div>
          </InspectorSection>
        )}

        {config.mode === 'navigation' && (
          <InspectorSection value="framing" title="Navigation view">
            <div className="flex flex-col gap-3">
              <SliderRow
                label="Zoom"
                icon={<ZoomIn size={13} />}
                value={config.zoom}
                onChange={(v) => u({ zoom: v })}
                min={8}
                max={20}
                step={0.5}
                formatValue={(v) => v.toFixed(1)}
              />
              <SliderRow
                label="Look ahead"
                icon={<Eye size={13} />}
                value={config.lookAhead}
                onChange={(v) => u({ lookAhead: v })}
                min={50}
                max={1000}
                step={50}
                unit="m"
              />
            </div>
          </InspectorSection>
        )}
      </Accordion>
    </PanelWrapper>
  );
}
