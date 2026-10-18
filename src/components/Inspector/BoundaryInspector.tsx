import React from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import type { BoundaryItem } from '@/store/types';
import { applyBoundaryDetail } from '@/engine/boundaryDetail';
import { NominatimResult, shortPlaceName } from '@/services/nominatim';
import { toast } from 'sonner';
import { BoundarySearch } from './BoundarySearch';
import { FlagPicker } from './FlagPicker';
import { Field } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { 
  SliderRow, 
  ColorRow, 
  SwitchRow, 
  VisualCardSelect,
  type VisualCardOption,
} from './InspectorShared';
import { formatPercent } from './inspectorValues';
import { PanelWrapper } from './InspectorLayout';
import { InspectorSection } from './InspectorSection';
import { InspectorHeader } from './InspectorHeader';
import { BOUNDARY_ANIMATION_LABELS, BOUNDARY_TERMS } from '@/lib/terms';
import { TimingSection } from './timing/TimingSection';
import { boundaryTiming } from './timing/timingAdapters';
import { Shield, Ban, Layers, PenLine, Sparkles } from 'lucide-react';

type BoundaryAnimationMode = 'none' | BoundaryItem['style']['animationStyle'];

export function BoundaryInspector({ item }: { item: BoundaryItem }) {
  const updateItem = useProjectStore(s => s.updateItem);

  const u = (updates: Partial<BoundaryItem>) => updateItem(item.id, updates);
  const us = (updates: Partial<BoundaryItem['style']>) => u({ style: { ...item.style, ...updates } });

  const handleSelect = (r: NominatimResult) => {
    u({
      ...(r.countryCode ? { style: { ...item.style, flagCode: r.countryCode } } : {}),
      geojson: applyBoundaryDetail(r.geojson),
      placeName: shortPlaceName(r.display_name),
    });
    toast.success('Boundary updated.');
  };

  // Determine active animation card
  const activeAnimMode = item.style.animateStroke ? item.style.animationStyle : 'none';

  const handleAnimModeChange = (mode: BoundaryAnimationMode) => {
    if (mode === 'none') {
      us({ animateStroke: false });
    } else {
      us({ animateStroke: true, animationStyle: mode });
    }
  };

  const animationOptions = [
    { value: 'none', label: BOUNDARY_ANIMATION_LABELS.none, icon: <Ban size={13} /> },
    { value: 'fade', label: BOUNDARY_ANIMATION_LABELS.fade, icon: <Layers size={13} /> },
    { value: 'draw', label: BOUNDARY_ANIMATION_LABELS.draw, icon: <PenLine size={13} /> },
    { value: 'trace', label: BOUNDARY_ANIMATION_LABELS.trace, icon: <Sparkles size={13} /> },
  ] as const satisfies readonly VisualCardOption<BoundaryAnimationMode>[];

  return (
    <PanelWrapper 
      title="Area" 
      icon={<Shield size={15} />}
      header={
        <InspectorHeader
          kind="boundary"
          id={item.id}
          name={item.placeName}
          onRename={(v) => u({ placeName: v })}
          placeholder="Boundary name"
          startTime={item.startTime}
        />
      }
    >

      <div className="mb-2.5">
        <BoundarySearch initialValue={item.placeName} onSelect={handleSelect} />
      </div>

      <InspectorSection kind="boundary" id="appearance">
        <div className="flex flex-col gap-3">
          <ColorRow 
            label={BOUNDARY_TERMS.borderColor} 
            value={item.style.strokeColor} 
            onChange={(v) => us({ strokeColor: v })} 
          />
          
          <SliderRow 
            label={BOUNDARY_TERMS.borderWidth}
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
          
          <Field label={BOUNDARY_TERMS.fill}>
            <SegmentedControl
              options={[{ value: 'color', label: 'Color' }, { value: 'flag', label: 'Flag' }]}
              value={item.style.fillMode}
              onValueChange={(v) => us({ fillMode: v })}
            />
          </Field>

          {item.style.fillMode === 'flag' ? (
            <div className="flex flex-col gap-1.5">
              <FlagPicker value={item.style.flagCode} onChange={(code) => us({ flagCode: code })} />
              {!item.style.flagCode && (
                <span className="text-[11px] text-muted-foreground leading-tight">
                  Select a country to show its flag inside the boundary.
                </span>
              )}
            </div>
          ) : (
            <ColorRow
              label={BOUNDARY_TERMS.fillColor}
              value={item.style.fillColor}
              onChange={(v) => us({ fillColor: v })}
            />
          )}

          <SliderRow 
            label={BOUNDARY_TERMS.fillOpacity} 
            value={item.style.fillOpacity} 
            onChange={(v) => us({ fillOpacity: v })} 
            min={0} 
            max={1} 
            step={0.01} 
            formatValue={formatPercent}
          />

          <SwitchRow
            label="Mask outside"
            sublabel="Cover the map area outside the boundary"
            checked={item.style.maskOutside}
            onChange={(v) => us({ maskOutside: v })}
          />

          {item.style.maskOutside && (
            <div className="flex flex-col gap-3 pl-2 border-l-2 border-primary/20">
              <ColorRow
                label="Mask color"
                value={item.style.maskColor}
                onChange={(v) => us({ maskColor: v })}
              />
              <SliderRow
                label="Mask opacity"
                value={item.style.maskOpacity}
                onChange={(v) => us({ maskOpacity: v })}
                min={0}
                max={1}
                step={0.01}
                formatValue={formatPercent}
              />
            </div>
          )}
        </div>
      </InspectorSection>

      <InspectorSection kind="boundary" id="animation">
        <div className="flex flex-col gap-3">
          <VisualCardSelect
            options={animationOptions}
            value={activeAnimMode}
            onChange={handleAnimModeChange}
            columns={4}
          />

          {activeAnimMode === 'trace' && (
            <SliderRow 
              label={BOUNDARY_TERMS.highlightLength}
              hint={BOUNDARY_TERMS.highlightHint}
              endLabels={BOUNDARY_TERMS.highlightEnds}
              value={item.style.traceLength}
              onChange={(v) => us({ traceLength: v })} 
              min={0.01} 
              max={0.5} 
              step={0.01} 
              // The value is the part of the outline that is lit: 0.1 is 10 %.
              formatValue={formatPercent}
            />
          )}
        </div>
      </InspectorSection>

      <TimingSection adapter={boundaryTiming} item={item} onChange={u} />

    </PanelWrapper>
  );
}
