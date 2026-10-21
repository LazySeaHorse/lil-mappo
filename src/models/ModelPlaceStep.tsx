import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PopupActions, PopupBody } from '@/components/ui/pin-drop';
import { PickOnMapButton } from '@/components/Search/PickOnMapButton';
import { SliderRow } from '@/components/Inspector/controls/SliderRow';
import { ReadoutRow } from '@/components/Inspector/controls/ReadoutRow';
import { RowLabel } from '@/components/Inspector/controls/RowLabel';
import { formatWideMultiplier } from '@/components/Inspector/inspectorValues';
import { VEHICLE_SCALE_RANGE } from '@/config/vehicles';
import type { ModelAsset } from '@/store/types';
import { modelExtent } from './modelGeometry';
import { startingModelScale } from './modelImport';
import { ModelPreview } from './ModelPreview';
import { MODEL_TERMS, formatMeters } from './modelTerms';

/** A model chosen in the popup and not on the map yet: where it goes and how big. */
export interface ModelPlacement {
  asset: ModelAsset;
  /** [lng, lat]; the middle of the map until the user picks a point. */
  position: [number, number];
  /** The picked place's name or coordinates; empty for the middle of the map. */
  place: string;
  scale: number;
}

interface ModelPlaceStepProps {
  placement: ModelPlacement;
  onChange: (patch: Partial<ModelPlacement>) => void;
  isPicking: boolean;
  onStartPick: () => void;
  onBack: () => void;
  onAdd: () => void;
}

/** The popup's step after a model is picked or uploaded: its position and size, then Add. */
export function ModelPlaceStep({ placement, onChange, isPicking, onStartPick, onBack, onAdd }: ModelPlaceStepProps) {
  const { asset, place, scale } = placement;
  return (
    <PopupBody>
      <DialogTitle>{MODEL_TERMS.placeTitle}</DialogTitle>
      <DialogDescription className="ph-mask truncate">{asset.fileName}</DialogDescription>
      <ModelPreview asset={asset} />
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 p-2 px-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <RowLabel label={MODEL_TERMS.position} />
          <span data-testid="model-place-position" className="ph-mask truncate text-xs text-foreground/80">
            {place || MODEL_TERMS.positionCenter}
          </span>
        </span>
        <PickOnMapButton isPicking={isPicking} onClick={onStartPick} />
      </div>
      <SliderRow
        label={MODEL_TERMS.size}
        hint={MODEL_TERMS.sizeHint}
        value={scale}
        onChange={(next) => onChange({ scale: next })}
        min={VEHICLE_SCALE_RANGE.custom.min}
        max={VEHICLE_SCALE_RANGE.custom.max}
        step={0.01}
        logarithmic
        formatValue={formatWideMultiplier}
        onReset={() => onChange({ scale: startingModelScale(asset.bounds) })}
      />
      <ReadoutRow label={MODEL_TERMS.heightLabel} value={formatMeters(modelExtent(asset.bounds).heightM * scale)} />
      <p className="text-xs text-muted-foreground">{MODEL_TERMS.inspectorNote}</p>
      <PopupActions>
        <Button type="button" variant="outline" onClick={onBack}>{MODEL_TERMS.back}</Button>
        <Button type="button" onClick={onAdd}>{MODEL_TERMS.add}</Button>
      </PopupActions>
    </PopupBody>
  );
}

/** The popup while an uploaded file is read (and converted, which can take a moment). */
export function ModelReadingStep() {
  return (
    <PopupBody>
      <DialogTitle>{MODEL_TERMS.placeTitle}</DialogTitle>
      <DialogDescription className="flex items-center gap-2">
        <Loader2 size={14} aria-hidden="true" className="animate-spin" /> {MODEL_TERMS.reading}
      </DialogDescription>
    </PopupBody>
  );
}
