import { useState } from 'react';
import { Box } from 'lucide-react';
import { toast } from 'sonner';
import { ProBadge } from '@/components/ui/pro-badge';
import type { ModelAsset } from '@/store/types';
import { useMapRef } from '@/hooks/useMapRef';
import { useProjectStore } from '@/store/useProjectStore';
import { ModelFileError } from '@/models/glb';
import { importModel, placeModel } from '@/models/modelImport';
import { ModelPickerDialog } from '@/models/ModelPickerDialog';
import { MODEL_TERMS } from '@/models/modelTerms';
import { useModelImportAccess } from '@/models/useModelAccess';
import { ToolbarButton } from './ToolbarPrimitives';

/** Toolbar button that opens the 3D model popup; an upload there is placed at the middle of the map (Pro). */
export function ModelImportButton({ iconSize = 16 }: { iconSize?: number }) {
  const [open, setOpen] = useState(false);
  const mapRef = useMapRef();
  const { canImport, askToUpgrade } = useModelImportAccess();

  const handleClick = () => {
    if (!canImport) askToUpgrade();
    else setOpen(true);
  };

  /** The middle of the map at the playhead: where a new model goes. */
  const placement = () => {
    const state = useProjectStore.getState();
    const center = mapRef.current?.getMap?.()?.getCenter();
    const position: [number, number] = center ? [center.lng, center.lat] : state.mapCenter;
    return { position, startTime: state.playheadTime };
  };

  const handlePick = (asset: ModelAsset) => {
    const item = placeModel(asset, placement());
    useProjectStore.getState().selectItem(item.id);
    toast.success(MODEL_TERMS.imported(item.name));
  };

  const handleFile = async (file: File) => {
    if (!canImport) {
      askToUpgrade();
      return;
    }
    try {
      const item = await importModel(file, placement());
      useProjectStore.getState().selectItem(item.id);
      toast.success(MODEL_TERMS.imported(item.name));
    } catch (err) {
      toast.error(err instanceof ModelFileError ? err.message : MODEL_TERMS.importFailed);
    }
  };

  return (
    <>
      <ModelPickerDialog open={open} onOpenChange={setOpen} onFile={handleFile} onPickModel={handlePick} />
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
