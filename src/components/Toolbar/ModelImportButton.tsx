import { useEffect, useState } from 'react';
import { Box } from 'lucide-react';
import { toast } from 'sonner';
import { ProBadge } from '@/components/ui/pro-badge';
import type { ModelAsset } from '@/store/types';
import { useMapRef } from '@/hooks/useMapRef';
import { useMapPicker } from '@/hooks/useMapPicker';
import { useFrameOnMap } from '@/hooks/useFrameOnMap';
import { useProjectStore } from '@/store/useProjectStore';
import { placeLabel } from '@/engine/routeMode';
import { ModelFileError } from '@/models/glb';
import { placeModel, readModelAsset, startingModelScale } from '@/models/modelImport';
import { modelExtent } from '@/models/modelGeometry';
import { ModelPickerDialog } from '@/models/ModelPickerDialog';
import { ModelPlaceStep, ModelReadingStep, type ModelPlacement } from '@/models/ModelPlaceStep';
import { MODEL_TERMS } from '@/models/modelTerms';
import { useModelImportAccess } from '@/models/useModelAccess';
import { holdModelFile } from '@/models/modelRetention';
import { ToolbarButton } from './ToolbarPrimitives';

/**
 * Toolbar button that opens the 3D model popup (Pro). A model picked or uploaded there is placed
 * from the popup's next step: the middle of the map or a picked point, at its starting size.
 */
export function ModelImportButton({ iconSize = 16 }: { iconSize?: number }) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [placement, setPlacement] = useState<ModelPlacement | null>(null);
  const mapRef = useMapRef();
  const frame = useFrameOnMap();
  const { canImport, askToUpgrade } = useModelImportAccess();

  const patchPlacement = (patch: Partial<ModelPlacement>) => setPlacement((current) => current && { ...current, ...patch });

  // A model chosen here joins the project only on Add: keep its file meanwhile, for the preview and the Add.
  const chosenSha = placement?.asset.sha256;
  useEffect(() => (chosenSha ? holdModelFile(chosenSha) : undefined), [chosenSha]);

  const picker = useMapPicker('model-new', {
    prompt: '3D model',
    enabled: open && placement !== null,
    onPick: (result) => patchPlacement({ position: result.lngLat, place: placeLabel(result.name, result.lngLat) }),
  });

  const handleClick = () => {
    if (!canImport) askToUpgrade();
    else setOpen(true);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setPlacement(null);
  };

  /** The model's next step starts at the middle of the map and its starting size. */
  const choose = (asset: ModelAsset) => {
    const center = mapRef.current?.getMap?.()?.getCenter();
    const position: [number, number] = center ? [center.lng, center.lat] : useProjectStore.getState().mapCenter;
    setPlacement({ asset, position, place: '', scale: startingModelScale(asset.bounds) });
  };

  const handleFile = async (file: File) => {
    if (!canImport) {
      askToUpgrade();
      return;
    }
    setReading(true);
    try {
      choose(await readModelAsset(file));
    } catch (err) {
      toast.error(err instanceof ModelFileError ? err.message : MODEL_TERMS.importFailed);
    } finally {
      setReading(false);
    }
  };

  const handleAdd = () => {
    if (!placement) return;
    const { asset, position, scale } = placement;
    const item = placeModel(asset, { position, scale, startTime: useProjectStore.getState().playheadTime });
    useProjectStore.getState().selectItem(item.id);
    toast.success(MODEL_TERMS.imported(item.name));
    handleOpenChange(false);
    // Brought into view at the size it was added at, so a small model is not a speck.
    frame.frameModel(position, modelExtent(asset.bounds).reachM * scale);
  };

  return (
    <>
      {/* The popup steps aside while a point is picked on the map, and comes back with it. */}
      <ModelPickerDialog
        open={open && !picker.isPicking}
        onOpenChange={handleOpenChange}
        onFile={handleFile}
        onPickModel={choose}
        keepOpen
      >
        {reading ? (
          <ModelReadingStep />
        ) : placement ? (
          <ModelPlaceStep
            placement={placement}
            onChange={patchPlacement}
            isPicking={picker.isPicking}
            onStartPick={picker.toggle}
            onBack={() => setPlacement(null)}
            onAdd={handleAdd}
          />
        ) : undefined}
      </ModelPickerDialog>
      <ToolbarButton
        icon={
          <span className="relative inline-flex">
            <Box size={iconSize} />
            {/* Hidden from the accessible name, which stays the tooltip text. */}
            {!canImport && <span aria-hidden="true"><ProBadge className="absolute -top-2 -right-4 px-1 py-0" /></span>}
          </span>
        }
        label={MODEL_TERMS.importButton}
        hideLabel
        onClick={handleClick}
        walkthroughTarget="import-model"
      />
    </>
  );
}
