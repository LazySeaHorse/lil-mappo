import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem, AutoCamConfig } from '@/store/types';
import { Accordion } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { SliderRow } from './InspectorShared';
import { formatPercent } from './inspectorValues';
import { FollowViewIllustration, NavigationViewIllustration } from './AutoCamIllustrations';
import { PanelWrapper, InspectorSection } from './InspectorLayout';
import { Video, VideoOff, Compass, Activity, Car, Plane, ZoomIn, Eye, Gauge, Orbit, Clapperboard, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AUTO_CAM_PRESETS, autoCamPresetPatch, getAutoCamRanges, routeFitOf } from '@/config/vehicles';
import type { AutoCamPreset } from '@/store/types';

function ModeCard({ selected, onSelect, illustration, title, description }: {
  selected: boolean;
  onSelect: () => void;
  illustration: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center p-3 rounded-xl border text-center transition-all cursor-pointer select-none",
        selected
          ? "bg-primary/10 border-primary text-foreground shadow-sm ring-1 ring-primary/20"
          : "bg-secondary/30 hover:bg-secondary/60 border-border/40 text-muted-foreground hover:text-foreground"
      )}
    >
      <div className="w-full flex justify-start mb-1">
        <div className={cn(
          "w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors",
          selected ? "border-primary bg-primary" : "border-muted-foreground/40 bg-transparent"
        )}>
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
        </div>
      </div>
      <div className="w-full h-16 rounded-lg bg-secondary/40 flex items-center justify-center overflow-hidden mb-2 relative">
        {illustration}
      </div>
      <span className="text-xs font-medium text-foreground">{title}</span>
      <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">{description}</span>
    </button>
  );
}

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

  const vehicleType = item.calculation?.vehicle?.type;
  const isPlane = vehicleType === 'plane';
  const ranges = getAutoCamRanges(vehicleType);
  const formatDistance = (v: number) => (isPlane || v >= 10000 ? `${(v / 1000).toLocaleString()} km` : `${v} m`);


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
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <ModeCard
          selected={config.mode === 'cinematic'}
          onSelect={() => u({ mode: 'cinematic' })}
          illustration={<FollowViewIllustration />}
          title="Follow view"
          description="Follow the route with a moving camera."
        />
        <ModeCard
          selected={config.mode === 'navigation'}
          onSelect={() => u({ mode: 'navigation' })}
          illustration={<NavigationViewIllustration />}
          title="Navigation view"
          description="Keep the route ahead in the map view."
        />
      </div>

      {config.mode === 'cinematic' && (
        <div className="mb-3">
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(AUTO_CAM_PRESETS) as AutoCamPreset[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => u(autoCamPresetPatch(key, vehicleType, routeFitOf(item)))}
                className={cn(
                  'px-2.5 py-2 rounded-lg border text-left transition-all cursor-pointer select-none',
                  config.preset === key
                    ? 'bg-primary/10 border-primary text-foreground ring-1 ring-primary/20'
                    : 'bg-secondary/30 hover:bg-secondary/60 border-border/40 text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="block text-xs font-medium text-foreground">{AUTO_CAM_PRESETS[key].label}</span>
                <span className="block text-[10px] leading-tight mt-0.5">{AUTO_CAM_PRESETS[key].description}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Presets fit the camera distance to this route's length and duration.
          </p>
        </div>
      )}

      <Accordion type="multiple" defaultValue={['camera', 'framing', 'motion']} className="w-full">
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
                icon={isPlane ? <Plane size={13} /> : <Car size={13} />}
                value={config.distance}
                onChange={(v) => u({ distance: v })}
                min={ranges.distance.min}
                max={ranges.distance.max}
                step={ranges.distance.step}
                logarithmic
                unit={isPlane ? '' : 'm'}
                formatValue={formatDistance}
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

        <InspectorSection value="motion" title="Motion">
          <div className="flex flex-col gap-3">
            <SliderRow
              label="Dynamics"
              icon={<Gauge size={13} />}
              value={config.dynamics ?? 0.5}
              onChange={(v) => u({ dynamics: v })}
              min={0}
              max={1}
              step={0.05}
              formatValue={formatPercent}
            />
            {config.mode === 'cinematic' && (
              <>
                <SliderRow
                  label="Orbit drift"
                  icon={<Orbit size={13} />}
                  value={config.orbit ?? 0}
                  onChange={(v) => u({ orbit: v })}
                  min={0}
                  max={1}
                  step={0.05}
                  formatValue={formatPercent}
                />
                <SliderRow
                  label="Intro swoop"
                  icon={<Clapperboard size={13} />}
                  value={config.intro ?? 0}
                  onChange={(v) => u({ intro: v })}
                  min={0}
                  max={1}
                  step={0.05}
                  formatValue={formatPercent}
                />
                <SliderRow
                  label="Outro pull-back"
                  icon={<Maximize2 size={13} />}
                  value={config.outro ?? 0}
                  onChange={(v) => u({ outro: v })}
                  min={0}
                  max={1}
                  step={0.05}
                  formatValue={formatPercent}
                />
              </>
            )}
          </div>
        </InspectorSection>
      </Accordion>
    </PanelWrapper>
  );
}
