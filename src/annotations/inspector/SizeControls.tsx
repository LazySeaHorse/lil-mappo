/**
 * Size controls of a callout: how big it is, and whether that size holds on
 * screen or follows the map zoom like something printed on the map.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { SliderRow, SwitchRow } from '@/components/Inspector/InspectorShared';
import { useMapRef } from '@/hooks/useMapRef';
import { projectZoomOf } from '@/engine/frameScale';
import type { MixedFields } from '@/components/Inspector/mergeValues';
import { DEFAULT_VIEW_ZOOM } from '@/annotations/migration';
import type { CalloutItem } from '@/store/types';
import {
  SIZE_SLIDER_MAX,
  SIZE_SLIDER_MIN,
  SIZE_SLIDER_STEP,
  formatScale,
  scaleToSlider,
  sliderToScale,
} from './sizeSlider';

type SizeFields = Pick<CalloutItem, 'scale' | 'sizeMode' | 'referenceZoom'>;
type SizePatch = Partial<SizeFields>;

interface SizeControlsProps {
  item: SizeFields;
  onChange: (patch: SizePatch) => void;
  /** Fields on which the selected callouts differ. */
  mixed?: MixedFields<SizeFields>;
}

export function SizeControls({ item, onChange, mixed }: SizeControlsProps) {
  const mapRef = useMapRef();
  const currentZoom = () => {
    const map = mapRef.current?.getMap?.();
    return map ? projectZoomOf(map) : DEFAULT_VIEW_ZOOM;
  };
  const modeMixed = mixed?.has('sizeMode') ?? false;
  const scalesWithMap = item.sizeMode === 'map' && !modeMixed;

  return (
    <div className="flex flex-col gap-3.5">
      <SliderRow
        label="Size"
        value={scaleToSlider(item.scale)}
        onChange={(t) => onChange({ scale: sliderToScale(t) })}
        onReset={() => onChange({ scale: 1 })}
        min={SIZE_SLIDER_MIN}
        max={SIZE_SLIDER_MAX}
        step={SIZE_SLIDER_STEP}
        formatValue={(t) => formatScale(sliderToScale(t))}
        mixed={mixed?.has('scale')}
      />
      <SwitchRow
        label="Scale with map"
        sublabel="Grows and shrinks with the zoom, like it is printed on the map"
        checked={scalesWithMap}
        mixed={modeMixed}
        onChange={(on) => onChange(on ? { sizeMode: 'map', referenceZoom: currentZoom() } : { sizeMode: 'screen' })}
      />
      {scalesWithMap && (
        <div className="flex items-center justify-between gap-3 px-0.5 text-xs text-muted-foreground">
          <span>{mixed?.has('referenceZoom') ? 'Size is set at different zooms' : `Size is set at zoom ${item.referenceZoom.toFixed(1)}`}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ referenceZoom: currentZoom() })}
          >
            Use current zoom
          </Button>
        </div>
      )}
    </div>
  );
}
