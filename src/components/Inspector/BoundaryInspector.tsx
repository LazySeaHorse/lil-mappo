import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { BoundaryItem } from '@/store/types';
import { NominatimResult } from '@/services/nominatim';
import { toast } from 'sonner';
import { Accordion } from "@/components/ui/accordion";
import { BoundarySearch } from './BoundarySearch';
import { 
  EditableTitle, 
  SliderRow, 
  ColorRow, 
  SwitchRow, 
  TimingControls, 
  VisualCardSelect 
} from './InspectorShared';
import { PanelWrapper, InspectorSection, ItemActions } from './InspectorLayout';
import { CheckCircle2, Shield, Ban, Layers, PenLine, Sparkles, Loader2 } from 'lucide-react';

export function BoundaryInspector({ item }: { item: BoundaryItem }) {
  const { updateItem } = useProjectStore();

  const u = (updates: Partial<BoundaryItem>) => updateItem(item.id, updates as any);
  const us = (updates: Partial<BoundaryItem['style']>) => u({ style: { ...item.style, ...updates } });

  const handleSelect = (r: NominatimResult) => {
    u({
      geojson: r.geojson,
      resolveStatus: 'resolved',
      placeName: r.display_name.split(',')[0]
    } as any);
    toast.success('Boundary resolved');
  };

  const footer = <ItemActions id={item.id} kind="boundary" customLabel="Delete Boundary" />;

  // Determine active animation card
  const activeAnimMode = !item.style.animateStroke 
    ? 'none' 
    : (item.style.animationStyle || 'draw');

  const handleAnimModeChange = (mode: string) => {
    if (mode === 'none') {
      us({ animateStroke: false });
    } else {
      us({ animateStroke: true, animationStyle: mode as any });
    }
  };

  const animationOptions = [
    { value: 'none', label: 'None', icon: <Ban size={13} /> },
    { value: 'fade', label: 'Fade', icon: <Layers size={13} /> },
    { value: 'draw', label: 'Draw', icon: <PenLine size={13} /> },
    { value: 'trace', label: 'Trace', icon: <Sparkles size={13} /> },
  ] as const;

  return (
    <PanelWrapper 
      title="Boundary" 
      icon={<Shield size={15} />}
      footer={footer}
    >
      <EditableTitle 
        value={item.placeName} 
        onChange={(v) => u({ placeName: v })} 
        placeholder="Region name..."
      />

      <Accordion type="multiple" defaultValue={['region', 'appearance', 'animation', 'timing']} className="w-full">
        
        <InspectorSection value="region" title="Region">
          <div className="flex flex-col gap-2.5">
            <BoundarySearch
              initialValue={item.placeName}
              onSelect={handleSelect}
              onSearchingChange={(loading) => u({ resolveStatus: loading ? 'loading' : 'idle' } as any)}
            />
            
            <div className="pt-0.5">
              {item.resolveStatus === 'resolved' || item.geojson ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
                  <CheckCircle2 size={12} />
                  <span>Boundary ready</span>
                </div>
              ) : item.resolveStatus === 'loading' ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-medium">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Searching region...</span>
                </div>
              ) : null}
            </div>
          </div>
        </InspectorSection>

        <InspectorSection value="appearance" title="Appearance">
          <div className="flex flex-col gap-3">
            <ColorRow 
              label="Stroke color" 
              value={item.style.strokeColor} 
              onChange={(v) => us({ strokeColor: v })} 
            />
            
            <SliderRow 
              label="Width" 
              value={item.style.strokeWidth} 
              onChange={(v) => us({ strokeWidth: v })} 
              min={1} 
              max={15} 
              step={1} 
              unit="px"
            />
            
            <SwitchRow 
              label="Glow" 
              checked={item.style.glow} 
              onChange={(v) => us({ glow: v })} 
            />
            
            <SliderRow 
              label="Fill opacity" 
              value={item.style.fillOpacity} 
              onChange={(v) => us({ fillOpacity: v })} 
              min={0} 
              max={1} 
              step={0.01} 
              formatValue={(v) => `${Math.round(v * 100)} %`}
            />
          </div>
        </InspectorSection>

        <InspectorSection value="animation" title="Animation">
          <div className="flex flex-col gap-3">
            <VisualCardSelect
              options={animationOptions as any}
              value={activeAnimMode}
              onChange={handleAnimModeChange}
              columns={4}
            />

            {activeAnimMode === 'trace' && (
              <SliderRow 
                label="Highlight length" 
                value={item.style.traceLength || 0.1} 
                onChange={(v) => us({ traceLength: v })} 
                min={0.01} 
                max={0.5} 
                step={0.01} 
                formatValue={(v) => `${Math.round((v / 0.5) * 100)} %`}
              />
            )}
          </div>
        </InspectorSection>

        <InspectorSection value="timing" title="Timing">
          <TimingControls
            startTime={item.startTime}
            endTime={item.endTime}
            onChangeTime={(start, end) => u({ startTime: start, endTime: end })}
            easing={item.easing}
            onChangeEasing={(v) => u({ easing: v })}
            exitAnimation={item.exitAnimation}
            onChangeExitAnimation={(v) => u({ exitAnimation: v })}
            showExitAnimation={activeAnimMode !== 'trace'}
          />
        </InspectorSection>

      </Accordion>
    </PanelWrapper>
  );
}

