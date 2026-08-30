import React from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem, EasingName, AutoCamConfig } from '@/store/types';
import { RoutePlanner } from './RoutePlanner';
import { Accordion } from "@/components/ui/accordion";
import { useSubscription } from '@/hooks/useSubscription';
import { 
  EditableTitle, 
  SliderRow, 
  ColorRow, 
  SwitchRow, 
  TimingControls, 
  VisualCardSelect,
  formatMultiplier 
} from './InspectorShared';
import { PanelWrapper, InspectorSection, ItemActions } from './InspectorLayout';
import { 
  Navigation, 
  Clapperboard, 
  CircleDot, 
  Flame, 
  Spline, 
  Car, 
  Plane, 
  Circle 
} from 'lucide-react';

const AUTO_CAM_DEFAULTS: AutoCamConfig = {
  enabled: true,
  mode: 'cinematic',
  pitch: 65,
  smoothing: 0.3,
  distance: 500,
  height: 300,
  zoom: 14,
  lookAhead: 300,
  easing: 'easeInOutSine' as EasingName,
};

export function RouteInspector({ item }: { item: RouteItem }) {
  const updateItem = useProjectStore((s) => s.updateItem);
  const { data: sub } = useSubscription();
  const isPro = sub && (sub.tier === 'wanderer' || sub.tier === 'cartographer' || sub.tier === 'pioneer');

  const u = (patch: Partial<RouteItem>) => updateItem(item.id, patch as any);
  const us = (patch: Partial<RouteItem['style']>) => u({ style: { ...item.style, ...patch } });

  const calc = item.calculation || {
    mode: 'car',
    startPoint: [0, 0],
    endPoint: [0, 0],
  };

  const updateVehicle = (patch: Partial<NonNullable<RouteItem['calculation']>['vehicle']>) => {
    const currentVehicle = calc.vehicle || {
      enabled: false,
      type: 'dot' as const,
      modelId: '',
      scale: 1.0,
    };
    updateItem(item.id, { 
      calculation: { 
        ...calc, 
        vehicle: { ...currentVehicle, ...patch } 
      } 
    } as any);
  };

  const handleAutoCamToggle = (enabled: boolean) => {
    if (enabled) {
      let coordCount = 0;
      for (const f of item.geojson.features) {
        if (f.geometry.type === 'LineString') coordCount += (f.geometry.coordinates as any[]).length;
        else if (f.geometry.type === 'MultiLineString') for (const l of (f.geometry.coordinates as any[])) coordCount += l.length;
      }
      if (coordCount < 2) {
        toast.error('Add a route before you enable Auto camera.');
        return;
      }

      const allItems = useProjectStore.getState().items;
      const overlapping = Object.values(allItems).find(
        (other) =>
          other.id !== item.id &&
          other.kind === 'route' &&
          (other as RouteItem).autoCam?.enabled &&
          (other as RouteItem).startTime < item.endTime &&
          (other as RouteItem).endTime > item.startTime,
      ) as RouteItem | undefined;

      if (overlapping) {
        toast.error(`Auto camera is already enabled for "${overlapping.name}" during this time range.`);
        return;
      }

      u({ autoCam: { ...AUTO_CAM_DEFAULTS, ...(item.autoCam ?? {}), enabled: true } });
    } else {
      u({ autoCam: item.autoCam ? { ...item.autoCam, enabled: false } : undefined });
    }
  };

  const animType = item.style.animationType || 'draw';
  const footer = <ItemActions id={item.id} kind="route" customLabel="Delete Route" />;

  const lineStyleValue = 
    !item.style.dashPattern ? 'solid' :
    item.style.dashPattern[0] === 2 ? 'dotted' : 'dashed';

  const animOptions = [
    { value: 'draw', label: 'Draw', icon: <Spline size={13} /> },
    { value: 'navigation', label: 'Progress', icon: <CircleDot size={13} /> },
    { value: 'comet', label: 'Moving trail', icon: <Flame size={13} /> },
  ] as const;

  return (
    <PanelWrapper 
      title="Route" 
      icon={<Navigation size={15} />}
      footer={footer}
    >
      <EditableTitle 
        value={item.name} 
        onChange={(v) => u({ name: v })} 
        placeholder="Route name"
      />

      <Accordion type="multiple" defaultValue={['path', 'appearance', 'animation', 'camera']} className="w-full">
        
        <InspectorSection value="path" title="Path">
          <RoutePlanner item={item} />
        </InspectorSection>

        <InspectorSection value="appearance" title="Appearance">
          <div className="flex flex-col gap-3">
            <ColorRow 
              label="Color" 
              value={item.style.color} 
              onChange={(v) => us({ color: v })} 
            />

            <SliderRow 
              label="Width" 
              value={item.style.width} 
              onChange={(v) => us({ width: v })} 
              min={1} 
              max={15} 
              step={1} 
              unit="px"
            />

            <div className="flex flex-col gap-1.5 pt-0.5">
              <span className="text-xs font-medium text-muted-foreground">Line style</span>
              <VisualCardSelect
                options={[
                  { 
                    value: 'solid', 
                    label: 'Solid', 
                    icon: <div className="w-5 h-[2.5px] bg-current rounded-full my-0.5" /> 
                  },
                  { 
                    value: 'dashed', 
                    label: 'Dashed', 
                    icon: <div className="w-5 border-t-[2.5px] border-dashed border-current my-0.5" /> 
                  },
                  { 
                    value: 'dotted', 
                    label: 'Dotted', 
                    icon: <div className="w-5 border-t-[2.5px] border-dotted border-current my-0.5" /> 
                  },
                ] as any}
                value={lineStyleValue}
                onChange={(v) => us({ dashPattern: v === 'dashed' ? [8, 4] : v === 'dotted' ? [2, 4] : null })}
                columns={3}
              />
            </div>

            <SwitchRow 
              label="Glow" 
              checked={item.style.glow} 
              onChange={(v) => us({ glow: v })} 
            />

            {item.style.glow && (
              <>
                <ColorRow
                  label="Glow color"
                  value={item.style.glowColor}
                  onChange={(v) => us({ glowColor: v })}
                />
                <SliderRow
                  label="Glow width"
                  value={item.style.glowWidth}
                  onChange={(v) => us({ glowWidth: v })}
                  min={2}
                  max={40}
                  step={1}
                  unit="px"
                />
              </>
            )}
          </div>
        </InspectorSection>

        <InspectorSection value="animation" title="Animation">
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Style</span>
              <VisualCardSelect
                options={animOptions as any}
                value={animType}
                onChange={(v) => us({ animationType: v as any })}
                columns={3}
              />
            </div>

            {/* Travel Marker */}
            <div className="flex flex-col gap-3 pt-1 border-t border-border/30">
              <SwitchRow
                label="Route marker"
                checked={calc.vehicle?.enabled || false}
                onChange={(v) => updateVehicle({ enabled: v })}
              />

              {calc.vehicle?.enabled && (
                <div className="flex flex-col gap-3 pl-0.5">
                  <div className="flex flex-col gap-1.5 pt-0.5">
                    <span className="text-xs font-medium text-muted-foreground">Marker type</span>
                    <VisualCardSelect
                      options={[
                        { value: 'dot', label: 'Dot', icon: <Circle size={14} /> },
                        { value: 'car', label: 'Car', icon: <Car size={14} />, badge: !isPro ? 'PRO' : undefined, disabled: !isPro },
                        { value: 'plane', label: 'Plane', icon: <Plane size={14} />, badge: !isPro ? 'PRO' : undefined, disabled: !isPro },
                      ]}
                      value={calc.vehicle?.type || 'dot'}
                      onChange={(type) => updateVehicle({ type: type as 'dot' | 'car' | 'plane' })}
                      columns={3}
                    />
                  </div>

                  <SliderRow 
                    label="Size" 
                    value={calc.vehicle?.scale || 1} 
                    onChange={(v) => updateVehicle({ scale: v })} 
                    min={0.2} 
                    max={4} 
                    step={0.1} 
                    formatValue={formatMultiplier}
                  />
                </div>
              )}
            </div>

            {animType === 'comet' && (
              <SliderRow
                label="Trail length"
                value={item.style.cometTrailLength ?? 0.2}
                onChange={(v) => us({ cometTrailLength: v })}
                min={0.05}
                max={0.8}
                step={0.05}
                formatValue={(v) => v.toFixed(2)}
              />
            )}

            {animType === 'draw' && (
              <div className="flex flex-col gap-2 pt-1 border-t border-border/30">
                <SwitchRow 
                  label="Fade trail"
                  checked={item.style.trailFade} 
                  onChange={(v) => us({ trailFade: v })} 
                />
                {item.style.trailFade && (
                  <SliderRow 
                    label="Fade length"
                    value={item.style.trailFadeLength} 
                    onChange={(v) => us({ trailFadeLength: v })} 
                    min={0.05} 
                    max={1} 
                    step={0.05} 
                    formatValue={(v) => v.toFixed(2)}
                  />
                )}
              </div>
            )}

            <div className="pt-2 border-t border-border/30">
              <TimingControls
                startTime={item.startTime}
                endTime={item.endTime}
                onChangeTime={(start, end) => u({ startTime: start, endTime: end })}
                easing={item.easing}
                onChangeEasing={(v) => u({ easing: v })}
                exitAnimation={item.exitAnimation}
                onChangeExitAnimation={(v) => u({ exitAnimation: v })}
                showExitAnimation={animType === 'draw'}
              />
            </div>
          </div>
        </InspectorSection>

        <InspectorSection value="camera" title="Camera">
          <div className="flex flex-col gap-2">
            <SwitchRow
              label="Follow route"
              sublabel="Keeps the route or marker in view during playback."
              checked={item.autoCam?.enabled ?? false}
              onChange={handleAutoCamToggle}
            />
            {item.autoCam?.enabled && (
              <div className="mt-1.5 p-2 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2">
                <Clapperboard size={13} className="text-primary shrink-0" />
                <p className="text-[11px] text-primary font-medium leading-tight">
                  Click the blue block in the Camera track to edit camera settings.
                </p>
              </div>
            )}
          </div>
        </InspectorSection>

      </Accordion>
    </PanelWrapper>
  );
}
