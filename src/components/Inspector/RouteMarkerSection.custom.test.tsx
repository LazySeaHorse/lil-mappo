import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '@/lib/database.types';
import { useAuthStore } from '@/store/useAuthStore';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';
import { clearHistory, undo } from '@/store/history';
import type { ModelAsset, RouteItem } from '@/store/types';
import { clearModelRegistry } from '@/models/modelRegistry';
import { makeGlb } from '@/models/testGlb';
import { MODEL_TERMS } from '@/models/modelTerms';
import { RouteInspector } from './RouteInspector';

let subscription: Partial<Subscription> | null = null;
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: subscription }) }));
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));
vi.mock('./RoutePathSection', () => ({ RoutePathSection: () => <div /> }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const openUpgradeModal = vi.fn();
const base = createEndpointRouteItem({
  id: 'r1', mode: 'car', geojson: wrapGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }),
  start: [0, 0], end: [1, 1], name: 'Drive', startTime: 0,
});
const withVehicle = (vehicle: NonNullable<NonNullable<RouteItem['calculation']>['vehicle']>): RouteItem => ({
  ...base, calculation: { ...base.calculation!, vehicle },
});
const route = () => useProjectStore.getState().items.r1 as RouteItem;
const asset: ModelAsset = { id: 'bus', fileName: 'bus.glb', byteSize: 1, sha256: '2'.repeat(64), bounds: { min: [0, 0, 0], max: [1, 1, 4] } };

function setup(item: RouteItem, models: Record<string, ModelAsset> = {}) {
  useProjectStore.setState({ ...createProject(), ...createTransientState(), models, items: { r1: item }, itemOrder: ['r1'], selectedItemId: 'r1' });
  clearHistory();
  const view = render(<RouteInspector item={item} />);
  // The inspector re-renders from its parent in the app; follow the store here.
  const unsubscribe = useProjectStore.subscribe((s) => {
    const next = s.items.r1;
    if (next?.kind === 'route') view.rerender(<RouteInspector item={next} />);
  });
  return unsubscribe;
}

let stop: () => void = () => {};

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:m'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
  subscription = null;
  openUpgradeModal.mockClear();
  useAuthStore.setState({ openUpgradeModal });
});

afterEach(() => {
  stop();
  vi.unstubAllGlobals();
});

const dotMarker = { enabled: true, type: 'dot' as const, modelId: '', scale: 1 };
const customCard = () => screen.getByRole('button', { name: /Custom/ });

describe('custom route marker', () => {
  it('imports a .glb as the marker in one undo step (Pro)', async () => {
    subscription = { tier: 'wanderer', status: 'active' };
    stop = setup(withVehicle(dotMarker));
    fireEvent.click(customCard());
    const popup = screen.getByRole('dialog');
    const click = vi.spyOn(screen.getByTestId('marker-model-input'), 'click');
    fireEvent.click(within(popup).getByRole('button', { name: MODEL_TERMS.upload }));
    expect(click).toHaveBeenCalled();

    const file = new File([makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [2, 2, 6] })], 'bus.glb');
    fireEvent.change(screen.getByTestId('marker-model-input'), { target: { files: [file] } });
    await waitFor(() => expect(route().calculation?.vehicle?.type).toBe('custom'));
    const { modelId } = route().calculation!.vehicle!;
    expect(useProjectStore.getState().models[modelId].fileName).toBe('bus.glb');

    undo();
    expect(route().calculation?.vehicle?.type).toBe('dot');
    expect(useProjectStore.getState().models).toEqual({});
  });

  it('asks a free user to upgrade when there is no model to use', () => {
    stop = setup(withVehicle(dotMarker));
    fireEvent.click(customCard());
    expect(openUpgradeModal).toHaveBeenCalledWith('model_import');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(route().calculation?.vehicle?.type).toBe('dot');
  });

  it('lets anyone ride a model the project already has', () => {
    stop = setup(withVehicle(dotMarker), { bus: asset });
    fireEvent.click(customCard());
    expect(route().calculation?.vehicle).toMatchObject({ type: 'custom', modelId: 'bus' });
  });

  it('opens the popup from the import button once a model is the marker', () => {
    subscription = { tier: 'wanderer', status: 'active' };
    stop = setup(withVehicle({ enabled: true, type: 'custom', modelId: 'bus', scale: 1 }), { bus: asset });
    fireEvent.click(screen.getByRole('button', { name: MODEL_TERMS.importForMarker }));
    expect(within(screen.getByRole('dialog')).getByText(MODEL_TERMS.popupTitle)).toBeInTheDocument();
  });

  it('asks for a missing marker file and says what shows meanwhile', () => {
    stop = setup(withVehicle({ enabled: true, type: 'custom', modelId: 'bus', scale: 1 }), { bus: asset });
    expect(screen.getByText(MODEL_TERMS.missingTitle)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(MODEL_TERMS.markerMissing))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MODEL_TERMS.relink })).toBeInTheDocument();
  });
});
