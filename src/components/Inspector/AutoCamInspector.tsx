import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem, AutoCamConfig, AutoCamPreset } from '@/store/types';
import { Button } from '@/components/ui/button';
import { SliderRow } from './InspectorShared';
import { PanelWrapper } from './InspectorLayout';
import { InspectorSection } from './InspectorSection';
import { FOLLOW_CAMERA_SLIDERS as SLIDERS, FOLLOW_CAMERA_TERMS, ROUTE_TERMS } from '@/lib/terms';
import { ArrowLeft, Video, VideoOff, Compass, Activity, Car, Plane, ZoomIn, Eye, Gauge, Orbit, Clapperboard, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AUTO_CAM_PRESETS, autoCamPresetPatch, getAutoCamRanges, routeFitOf } from '@/config/vehicles';

function StyleCard({ selected, onSelect, title, description, className }: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'px-2.5 py-2 rounded-lg border text-left transition-all cursor-pointer select-none',
        selected
          ? 'bg-primary/10 border-primary text-foreground ring-1 ring-primary/20'
          : 'bg-secondary/30 hover:bg-secondary/60 border-border/40 text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <span className="block text-xs font-medium text-foreground">{title}</span>
      <span className="block text-[10px] leading-tight mt-0.5">{description}</span>
    </button>
  );
}

/** Shows words, not numbers, under a slider. */
const words = ({ label, ends, hint }: { label: string; ends: readonly [string, string]; hint: string }) => ({
  label,
  endLabels: ends,
  hint,
  showValue: false,
});

export function AutoCamInspector({ item }: { item: RouteItem }) {
  const updateItem = useProjectStore((s) => s.updateItem);
  const setFollowCamera = useProjectStore((s) => s.setFollowCamera);
  const setSelectedAutoCamRouteId = useProjectStore((s) => s.setSelectedAutoCamRouteId);

  const config = item.autoCam!;

  const u = (patch: Partial<AutoCamConfig>) =>
    updateItem(item.id, { autoCam: { ...config, ...patch } });

  const handleDisable = () => {
    setFollowCamera(item.id, false);
    setSelectedAutoCamRouteId(null);
  };

  const vehicleType = item.calculation?.vehicle?.type;
  const isPlane = vehicleType === 'plane';
  const ranges = getAutoCamRanges(vehicleType);
  const isFollowView = config.mode === 'cinematic';

  const footer = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDisable}
      className="w-full h-9 rounded-lg flex items-center justify-center gap-2 text-xs font-medium bg-background/40 hover:bg-secondary/80 border-border/50 transition-all"
    >
      <VideoOff size={13} /> Turn off {ROUTE_TERMS.followCamera}
    </Button>
  );

  return (
    <PanelWrapper 
      title={ROUTE_TERMS.followCamera}
      icon={<Video size={15} />}
      footer={footer}
    >
      <button
        type="button"
        onClick={() => setSelectedAutoCamRouteId(null)}
        className="-mb-1 flex w-fit items-center gap-1 rounded-md py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        {FOLLOW_CAMERA_TERMS.backToRoute}
      </button>

      <div className="mb-1">
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(AUTO_CAM_PRESETS) as AutoCamPreset[]).map((key) => (
            <StyleCard
              key={key}
              selected={isFollowView && config.preset === key}
              onSelect={() => u({ mode: 'cinematic', ...autoCamPresetPatch(key, vehicleType, routeFitOf(item)) })}
              title={AUTO_CAM_PRESETS[key].label}
              description={AUTO_CAM_PRESETS[key].description}
            />
          ))}
          <StyleCard
            selected={!isFollowView}
            onSelect={() => u({ mode: 'navigation' })}
            {...FOLLOW_CAMERA_TERMS.navigationView}
            className="col-span-2"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Each style fits the camera distance to the length and time of this route.
        </p>
      </div>

      <InspectorSection kind="autocam" id="fine-tune">
        <SliderRow
          {...words(SLIDERS.pitch)}
          icon={<Compass size={13} />}
          value={config.pitch}
          onChange={(v) => u({ pitch: v })}
          min={0}
          max={85}
          step={1}
        />
        <SliderRow
          {...words(SLIDERS.smoothing)}
          icon={<Activity size={13} />}
          value={config.smoothing}
          onChange={(v) => u({ smoothing: v })}
          min={0}
          max={1}
          step={0.05}
        />

        {isFollowView ? (
          <SliderRow
            {...words(SLIDERS.distance)}
            icon={isPlane ? <Plane size={13} /> : <Car size={13} />}
            value={config.distance}
            onChange={(v) => u({ distance: v })}
            min={ranges.distance.min}
            max={ranges.distance.max}
            step={ranges.distance.step}
            logarithmic
          />
        ) : (
          <>
            <SliderRow
              {...words(SLIDERS.zoom)}
              icon={<ZoomIn size={13} />}
              value={config.zoom}
              onChange={(v) => u({ zoom: v })}
              min={8}
              max={20}
              step={0.5}
            />
            <SliderRow
              {...words(SLIDERS.lookAhead)}
              icon={<Eye size={13} />}
              value={config.lookAhead}
              onChange={(v) => u({ lookAhead: v })}
              min={50}
              max={1000}
              step={50}
            />
          </>
        )}

        <SliderRow
          {...words(SLIDERS.dynamics)}
          icon={<Gauge size={13} />}
          value={config.dynamics ?? 0.5}
          onChange={(v) => u({ dynamics: v })}
          min={0}
          max={1}
          step={0.05}
        />
        {isFollowView && (
          <>
            <SliderRow
              {...words(SLIDERS.orbit)}
              icon={<Orbit size={13} />}
              value={config.orbit ?? 0}
              onChange={(v) => u({ orbit: v })}
              min={0}
              max={1}
              step={0.05}
            />
            <SliderRow
              {...words(SLIDERS.intro)}
              icon={<Clapperboard size={13} />}
              value={config.intro ?? 0}
              onChange={(v) => u({ intro: v })}
              min={0}
              max={1}
              step={0.05}
            />
            <SliderRow
              {...words(SLIDERS.outro)}
              icon={<Maximize2 size={13} />}
              value={config.outro ?? 0}
              onChange={(v) => u({ outro: v })}
              min={0}
              max={1}
              step={0.05}
            />
          </>
        )}
      </InspectorSection>
    </PanelWrapper>
  );
}
