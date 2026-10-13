/**
 * Barrel for the inspector's shared controls. New code should import from the
 * specific file (`./controls/...`, `./timing/...`, `./VisualCardSelect`).
 */
import { Field, SectionLabel, SwitchField } from "@/components/ui/field";

// Canonical re-exports from ui/
export { Field, SectionLabel, SwitchField };

export { EditableTitle } from './controls/EditableTitle';
export { InputText, InputNumber } from './controls/inputs';
export { CoordinatesRows } from './controls/CoordinatesRows';
export { SliderRow, SliderField } from './controls/SliderRow';
export { ColorRow } from './controls/ColorRow';
export { SwitchRow } from './controls/SwitchRow';
export { NumberRow } from './controls/NumberRow';
export { SelectRow } from './controls/SelectRow';
export { EasingSelect } from './controls/EasingSelect';
export { VisualCardSelect } from './VisualCardSelect';
export type { VisualCardOption } from './VisualCardSelect';
