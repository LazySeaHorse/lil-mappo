import { Box } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import type { ModelItem } from '@/store/types';
import { isPlacedPoint, placeLabel } from '@/engine/routeMode';
import { modelExtent } from '@/models/modelGeometry';
import { MODEL_TERMS, formatBytes, formatMeters } from '@/models/modelTerms';
import { useMapPicker } from '@/hooks/useMapPicker';
import { SearchField } from '@/components/Search/SearchField';
import { PanelWrapper } from './InspectorLayout';
import { InspectorHeader } from './InspectorHeader';
import { InspectorSection } from './InspectorSection';
import { SliderRow } from './controls/SliderRow';
import { NumberRow } from './controls/NumberRow';
import { ReadoutRow } from './controls/ReadoutRow';
import { CoordinatesRows } from './controls/CoordinatesRows';
import { Disclosure } from './controls/Disclosure';
import { formatWideMultiplier } from './inspectorValues';
import { TimingSection } from './timing/TimingSection';
import { modelTiming } from './timing/timingAdapters';
import { ModelRelinkPrompt } from './ModelRelinkPrompt';
import { VEHICLE_SCALE_RANGE } from '@/config/vehicles';

const degrees = (value: number) => `${Math.round(value)}°`;

/** Panel of a placed 3D model: its file, where it stands, which way it faces, its size and timing. */
export function ModelInspector({ item }: { item: ModelItem }) {
  const updateItem = useProjectStore((s) => s.updateItem);
  const asset = useProjectStore((s) => s.models[item.assetId]);
  const u = (updates: Partial<ModelItem>) => updateItem(item.id, updates);

  const { isPicking, toggle: togglePick } = useMapPicker(`model-${item.id}`, {
    ownerId: item.id,
    prompt: '3D model',
    onPick: (result) => updateItem(item.id, { position: result.lngLat }),
  });

  const height = asset ? modelExtent(asset.bounds).heightM * item.scale : null;

  return (
    <PanelWrapper
      title="3D model"
      icon={<Box size={15} />}
      header={
        <InspectorHeader
          kind="model"
          id={item.id}
          name={item.name}
          onRename={(name) => u({ name })}
          placeholder="Model name"
          startTime={item.startTime}
        />
      }
    >
      {asset ? (
        <>
          <ReadoutRow label={MODEL_TERMS.file} value={`${asset.fileName} · ${formatBytes(asset.byteSize)}`} className="ph-mask" />
          <ModelRelinkPrompt asset={asset} />
        </>
      ) : null}

      <InspectorSection kind="model" id="location">
        <SearchField
          label={MODEL_TERMS.location}
          value={item.position}
          name={placeLabel('', item.position)}
          // Clearing the field reports the unset point; a model always keeps a place.
          onSelect={(position) => { if (isPlacedPoint(position)) u({ position }); }}
          parseCoordinates
          isPicking={isPicking}
          onStartPick={togglePick}
          className="px-0"
        />
        <SliderRow
          label={MODEL_TERMS.altitude}
          hint={MODEL_TERMS.altitudeHint}
          value={Math.min(item.altitude, 1000)}
          onChange={(altitude) => u({ altitude })}
          min={0}
          max={1000}
          step={1}
          formatValue={() => formatMeters(item.altitude)}
        />
        <Disclosure label={MODEL_TERMS.exactPosition}>
          <CoordinatesRows lngLat={item.position} onChange={(position) => u({ position })} />
          <NumberRow label={MODEL_TERMS.altitude} value={item.altitude} onChange={(altitude) => u({ altitude })} min={-500} step={1} unit="m" />
        </Disclosure>
      </InspectorSection>

      <InspectorSection kind="model" id="rotation">
        <SliderRow
          label={MODEL_TERMS.heading}
          hint={MODEL_TERMS.headingHint}
          value={item.heading}
          onChange={(heading) => u({ heading })}
          min={0}
          max={359}
          step={1}
          formatValue={degrees}
          onReset={() => u({ heading: 0 })}
        />
        <SliderRow label={MODEL_TERMS.tilt} value={item.pitch} onChange={(pitch) => u({ pitch })} min={-90} max={90} step={1} formatValue={degrees} onReset={() => u({ pitch: 0 })} />
        <SliderRow label={MODEL_TERMS.roll} value={item.roll} onChange={(roll) => u({ roll })} min={-180} max={180} step={1} formatValue={degrees} onReset={() => u({ roll: 0 })} />
      </InspectorSection>

      <InspectorSection kind="model" id="size">
        <SliderRow
          label={MODEL_TERMS.size}
          hint={MODEL_TERMS.sizeHint}
          value={item.scale}
          onChange={(scale) => u({ scale })}
          min={VEHICLE_SCALE_RANGE.custom.min}
          max={VEHICLE_SCALE_RANGE.custom.max}
          step={0.01}
          logarithmic
          formatValue={formatWideMultiplier}
          onReset={() => u({ scale: 1 })}
        />
        {height !== null && <ReadoutRow label={MODEL_TERMS.heightLabel} value={formatMeters(height)} />}
      </InspectorSection>

      <TimingSection adapter={modelTiming} item={item} onChange={u} />
    </PanelWrapper>
  );
}
