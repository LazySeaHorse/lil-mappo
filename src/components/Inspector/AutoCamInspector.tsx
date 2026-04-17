import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem, AutoCamConfig } from '@/store/types';
import { Accordion } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Field } from '@/components/ui/field';
import { SliderField, EasingSelect } from './InspectorShared';
import { PanelWrapper, InspectorSection } from './InspectorLayout';
import { Film, Navigation } from 'lucide-react';

const MODE_OPTIONS = [
  { value: 'cinematic', label: 'Cinematic', icon: <Film size={12} /> },
  { value: 'navigation', label: 'Navigation', icon: <Navigation size={12} /> },
] as const;

export function AutoCamInspector({ item }: { item: RouteItem }) {
  const updateItem = useProjectStore((s) => s.updateItem);
  const setSelectedAutoCamRouteId = useProjectStore((s) => s.setSelectedAutoCamRouteId);

  const config = item.autoCam!;

  const u = (patch: Partial<AutoCamConfig>) =>
    updateItem(item.id, { autoCam: { ...config, ...patch } } as any);

  const handleDisable = () => {
    updateItem(item.id, { autoCam: { ...config, enabled: false } } as any);
    setSelectedAutoCamRouteId(null);
  };

  const footer = (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleDisable}
      className="w-full h-8 text-xs"
    >
      Disable Auto Camera
    </Button>
  );

  return (
    <PanelWrapper title={`Auto Cam: ${item.name}`} footer={footer}>
      <div className="mb-3">
        <SegmentedControl
          options={MODE_OPTIONS as any}
          value={config.mode}
          onValueChange={(v) => u({ mode: v as AutoCamConfig['mode'] })}
        />
      </div>

      <Accordion type="multiple" defaultValue={['settings']} className="w-full">
        <InspectorSection value="settings" title="Camera Settings">
          <SliderField
            label="Pitch"
            value={config.pitch}
            onChange={(v) => u({ pitch: v })}
            min={0}
            max={85}
            step={1}
          />
          <SliderField
            label="Smoothing"
            value={config.smoothing}
            onChange={(v) => u({ smoothing: v })}
            min={0}
            max={1}
            step={0.05}
          />
          <EasingSelect value={config.easing} onChange={(v) => u({ easing: v })} />
        </InspectorSection>

        {config.mode === 'cinematic' && (
          <InspectorSection value="cinematic" title="Cinematic">
            <SliderField
              label="Trail Distance (m)"
              value={config.distance}
              onChange={(v) => u({ distance: v })}
              min={100}
              max={3000}
              step={50}
            />
            <SliderField
              label="Camera Height (m)"
              value={config.height}
              onChange={(v) => u({ height: v })}
              min={50}
              max={2000}
              step={50}
            />
          </InspectorSection>
        )}

        {config.mode === 'navigation' && (
          <InspectorSection value="navigation" title="Navigation">
            <SliderField
              label="Zoom"
              value={config.zoom}
              onChange={(v) => u({ zoom: v })}
              min={8}
              max={20}
              step={0.5}
            />
            <SliderField
              label="Look Ahead (m)"
              value={config.lookAhead}
              onChange={(v) => u({ lookAhead: v })}
              min={50}
              max={1000}
              step={50}
            />
          </InspectorSection>
        )}
      </Accordion>
    </PanelWrapper>
  );
}
