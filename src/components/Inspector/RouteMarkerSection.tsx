import { useState } from 'react';
import { Box, Car, Circle, Plane, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { RouteItem } from '@/store/types';
import { useProjectStore } from '@/store/useProjectStore';
import { beginGesture, endGesture, withHistoryLabel } from '@/store/history';
import { Button } from '@/components/ui/button';
import { SelectRow, SliderRow, SwitchRow, VisualCardSelect } from './InspectorShared';
import { InspectorSection } from './InspectorSection';
import { formatWideMultiplier } from './inspectorValues';
import { ModelRelinkPrompt } from './ModelRelinkPrompt';
import { VEHICLE_SCALE_RANGE, clampVehicleScale } from '@/config/vehicles';
import { ModelFileError } from '@/models/glb';
import { readModelAsset } from '@/models/modelImport';
import { ModelPickerDialog } from '@/models/ModelPickerDialog';
import { MODEL_TERMS } from '@/models/modelTerms';
import { useModelImportAccess } from '@/models/useModelAccess';

type RouteVehicle = NonNullable<NonNullable<RouteItem['calculation']>['vehicle']>;

/** The marker that travels along the route: on or off, its model and its size. */
export function RouteMarkerSection({
  vehicle,
  isPro,
  onChange,
  onLockedSelect,
}: {
  vehicle: RouteVehicle | undefined;
  isPro: boolean;
  onChange: (patch: Partial<RouteVehicle>) => void;
  onLockedSelect: () => void;
}) {
  const models = useProjectStore((s) => s.models);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { canImport, askToUpgrade } = useModelImportAccess();
  const imported = Object.values(models);
  const customAsset = vehicle?.type === 'custom' ? models[vehicle.modelId] : undefined;

  const rideModel = (modelId: string) =>
    onChange({ type: 'custom', modelId, scale: clampVehicleScale('custom', vehicle?.scale || 1) });

  const pickFile = () => (canImport ? setPickerOpen(true) : askToUpgrade());

  const importForMarker = async (file: File) => {
    if (!canImport) {
      askToUpgrade();
      return;
    }
    try {
      const asset = await readModelAsset(file);
      // The model and the marker that rides it are one undo step.
      withHistoryLabel('Imported 3D model marker', () => {
        beginGesture();
        try {
          useProjectStore.getState().addModel(asset);
          rideModel(asset.id);
        } finally {
          endGesture();
        }
      });
    } catch (err) {
      toast.error(err instanceof ModelFileError ? err.message : MODEL_TERMS.importFailed);
    }
  };

  const chooseType = (type: RouteVehicle['type']) => {
    if (type !== 'custom') {
      onChange({ type, scale: clampVehicleScale(type, vehicle?.scale || 1) });
      return;
    }
    // An imported model already in the project needs no import; with none, pick a file.
    if (imported.length > 0) rideModel(customAsset?.id ?? imported[0].id);
    else pickFile();
  };

  return (
    <InspectorSection kind="route" id="marker">
      <ModelPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onFile={importForMarker} onPickModel={(asset) => rideModel(asset.id)} testId="marker-model-input" />
      <SwitchRow label="Route marker" checked={vehicle?.enabled || false} onChange={(enabled) => onChange({ enabled })} />

      {vehicle?.enabled && (
        <div className="flex flex-col gap-3 pl-0.5">
          <div className="flex flex-col gap-1.5 pt-0.5">
            <span className="text-xs font-medium text-muted-foreground">Marker type</span>
            <VisualCardSelect
              options={[
                { value: 'dot', label: 'Dot', icon: <Circle size={14} /> },
                { value: 'car', label: 'Car', icon: <Car size={14} />, badge: !isPro ? 'PRO' : undefined, locked: !isPro },
                { value: 'plane', label: 'Plane', icon: <Plane size={14} />, badge: !isPro ? 'PRO' : undefined, locked: !isPro },
                // Using a model already in the project is open to everyone; importing one is Pro.
                {
                  value: 'custom',
                  label: MODEL_TERMS.customMarker,
                  icon: <Box size={14} />,
                  badge: !canImport ? 'PRO' : undefined,
                  locked: !canImport && imported.length === 0,
                },
              ]}
              value={vehicle.type || 'dot'}
              onChange={chooseType}
              onLockedSelect={(type) => (type === 'custom' ? askToUpgrade() : onLockedSelect())}
              columns={4}
            />
          </div>

          {vehicle.type === 'custom' && (
            <div className="flex flex-col gap-2">
              {imported.length > 0 && (
                <SelectRow
                  label={MODEL_TERMS.chooseModel}
                  value={customAsset?.id ?? ''}
                  onChange={rideModel}
                  options={imported.map((asset) => ({ value: asset.id, label: asset.fileName }))}
                  className="ph-mask"
                />
              )}
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={pickFile}>
                <Upload size={13} aria-hidden="true" /> {MODEL_TERMS.importForMarker}
              </Button>
              {customAsset && <ModelRelinkPrompt asset={customAsset} note={MODEL_TERMS.markerMissing} />}
            </div>
          )}

          <SliderRow
            label="Size"
            value={vehicle.scale || 1}
            onChange={(scale) => onChange({ scale })}
            min={VEHICLE_SCALE_RANGE[vehicle.type || 'dot'].min}
            max={VEHICLE_SCALE_RANGE[vehicle.type || 'dot'].max}
            step={0.01}
            logarithmic
            formatValue={formatWideMultiplier}
          />
        </div>
      )}
    </InspectorSection>
  );
}
