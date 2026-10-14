import { useAuthStore } from '@/store/useAuthStore';
import { convertRouteCalculation } from '@/engine/routeMode';
import React from 'react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import { vehicleChangePatch } from '@/config/vehicles';
import { RoutePathSection } from './RoutePathSection';
import { useSubscription } from '@/hooks/useSubscription';
import { isWanderer } from '@/lib/cloudAccess';
import { RouteCameraSection } from './RouteCameraSection';
import { InspectorSection } from './InspectorSection';
import { RouteLineSection } from './RouteLineSection';
import { RouteAnimationSection } from './RouteAnimationSection';
import { RouteMarkerSection } from './RouteMarkerSection';
import { PanelWrapper } from './InspectorLayout';
import { InspectorHeader } from './InspectorHeader';
import { FOLLOW_CAMERA_BLOCKED } from '@/lib/terms';
import { TimingSection } from './timing/TimingSection';
import { routeTiming } from './timing/timingAdapters';
import { track } from '@/lib/analytics';
import { Navigation } from 'lucide-react';

export function RouteInspector({ item }: { item: RouteItem }) {
  const updateItem = useProjectStore((s) => s.updateItem);
  const setFollowCamera = useProjectStore((s) => s.setFollowCamera);
  const openUpgradeModal = useAuthStore((s) => s.openUpgradeModal);
  const { data: sub } = useSubscription();
  const isPro = isWanderer(sub);

  const u = (patch: Partial<RouteItem>) => updateItem(item.id, patch);
  const us = (patch: Partial<RouteItem['style']>) => u({ style: { ...item.style, ...patch } });

  const calc: NonNullable<RouteItem['calculation']> = item.calculation || convertRouteCalculation(undefined, 'car');

  const updateVehicle = (patch: Partial<NonNullable<RouteItem['calculation']>['vehicle']>) => {
    const currentVehicle = calc.vehicle || {
      enabled: false,
      type: 'dot' as const,
      modelId: '',
      scale: 1.0,
    };
    u(vehicleChangePatch(item, calc, { ...currentVehicle, ...patch }));
  };

  const handleAutoCamToggle = (enabled: boolean) => {
    const result = setFollowCamera(item.id, enabled);
    if (result.ok === false) toast.error(FOLLOW_CAMERA_BLOCKED(result));
    else if (enabled) track('autocam_enabled');
  };

  return (
    <PanelWrapper 
      title="Route" 
      icon={<Navigation size={15} />}
      header={
        <InspectorHeader
          kind="route"
          id={item.id}
          name={item.name}
          onRename={(v) => u({ name: v })}
          placeholder="Route name"
          startTime={item.startTime}
        />
      }
    >

      <InspectorSection kind="route" id="path">
        <RoutePathSection key={item.id} item={item} />
      </InspectorSection>

      <RouteLineSection style={item.style} onStyle={us} />

      <RouteAnimationSection style={item.style} onStyle={us} />

      <RouteMarkerSection
        vehicle={calc.vehicle}
        isPro={isPro}
        onChange={updateVehicle}
        onLockedSelect={() => openUpgradeModal('vehicle_lock')}
      />

      <TimingSection adapter={routeTiming} item={item} onChange={u} />

      <RouteCameraSection item={item} onToggle={handleAutoCamToggle} />

    </PanelWrapper>
  );
}
