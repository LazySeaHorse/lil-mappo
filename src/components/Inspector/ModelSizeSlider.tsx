import { VEHICLE_SCALE_RANGE } from '@/config/vehicles';
import { MODEL_TERMS } from '@/models/modelTerms';
import { SliderRow } from './controls/SliderRow';
import { formatWideMultiplier } from './inspectorValues';

/** The size of a placed 3D model, as a multiple of the size it was made at. */
export function ModelSizeSlider({
  value,
  onChange,
  mixed,
}: {
  value: number;
  onChange: (scale: number) => void;
  mixed?: boolean;
}) {
  return (
    <SliderRow
      label={MODEL_TERMS.size}
      hint={MODEL_TERMS.sizeHint}
      value={value}
      onChange={onChange}
      min={VEHICLE_SCALE_RANGE.custom.min}
      max={VEHICLE_SCALE_RANGE.custom.max}
      step={0.01}
      logarithmic
      formatValue={formatWideMultiplier}
      onReset={() => onChange(1)}
      mixed={mixed}
    />
  );
}
