import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '@/lib/database.types';
import { useAuthStore } from '@/store/useAuthStore';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { clearModelRegistry } from '@/models/modelRegistry';
import { makeGlb } from '@/models/testGlb';
import { MODEL_TERMS } from '@/models/modelTerms';
import { SEARCH_TERMS } from '@/lib/terms';
import { clearHistory, undo } from '@/store/history';
import { ModelImportButton } from './ModelImportButton';

let subscription: Partial<Subscription> | null = null;
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: subscription }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const openUpgradeModal = vi.fn();

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:m'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
  useProjectStore.setState({ ...createProject(), ...createTransientState(), playheadTime: 4, mapCenter: [2.35, 48.85] });
  clearHistory();
  useAuthStore.setState({ openUpgradeModal });
  openUpgradeModal.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

const button = () => screen.getByRole('button', { name: MODEL_TERMS.importButton });
const fileInput = () => screen.getByTestId('model-file-input') as HTMLInputElement;
/** The popup's placing step, once the uploaded file is read. */
const placeStep = async () => {
  await screen.findByRole('button', { name: MODEL_TERMS.add });
  return screen.getByRole('dialog', { name: MODEL_TERMS.placeTitle });
};
const openPopup = () => {
  fireEvent.click(button());
  return screen.getByRole('dialog');
};

describe('ModelImportButton', () => {
  it('asks a free user to upgrade instead of opening the popup', () => {
    subscription = null;
    render(<ModelImportButton />);
    expect(screen.getByText('PRO')).toBeInTheDocument();
    fireEvent.click(button());
    expect(openUpgradeModal).toHaveBeenCalledWith('model_import');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the 3D model popup for Pro, and its upload button opens the file picker', () => {
    subscription = { tier: 'wanderer', status: 'active' };
    render(<ModelImportButton />);
    expect(screen.queryByText('PRO')).not.toBeInTheDocument();
    const popup = openPopup();
    expect(within(popup).getByText(MODEL_TERMS.popupTitle)).toBeInTheDocument();
    const click = vi.spyOn(fileInput(), 'click');
    fireEvent.click(within(popup).getByRole('button', { name: MODEL_TERMS.upload }));
    expect(click).toHaveBeenCalled();
    expect(openUpgradeModal).not.toHaveBeenCalled();
  });

  it('shows an uploaded model before placing it, then adds it at the map center and the playhead, selected', async () => {
    subscription = { tier: 'wanderer', status: 'active' };
    render(<ModelImportButton />);
    openPopup();
    const file = new File([makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 200, 1] })], 'Lighthouse.glb');
    fireEvent.change(fileInput(), { target: { files: [file] } });
    const popup = await placeStep();
    // Nothing is on the map until Add.
    expect(Object.values(useProjectStore.getState().items).some((i) => i.kind === 'model')).toBe(false);
    expect(within(popup).getByText('Lighthouse.glb')).toBeInTheDocument();
    expect(within(popup).getByTestId('model-place-position')).toHaveTextContent(MODEL_TERMS.positionCenter);
    expect(within(popup).getByText(MODEL_TERMS.inspectorNote)).toBeInTheDocument();
    // Over 100 m tall, it starts at its own size.
    expect(within(popup).getByText('1.0x')).toBeInTheDocument();
    expect(within(popup).getByText('200 m')).toBeInTheDocument();
    fireEvent.click(within(popup).getByRole('button', { name: MODEL_TERMS.add }));
    const state = useProjectStore.getState();
    expect(state.items[state.selectedItemId!]).toMatchObject({ kind: 'model', name: 'Lighthouse', position: [2.35, 48.85], startTime: 4, scale: 1 });
    expect(toast.success).toHaveBeenCalledWith(MODEL_TERMS.imported('Lighthouse'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('starts a small model at 100 m tall, and adds it at the size it is left at', async () => {
    subscription = { tier: 'wanderer', status: 'active' };
    render(<ModelImportButton />);
    openPopup();
    fireEvent.change(fileInput(), { target: { files: [new File([makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 2, 1] })], 'Drone.glb')] } });
    const popup = await placeStep();
    expect(within(popup).getByText('50x')).toBeInTheDocument();
    expect(within(popup).getByText('100 m')).toBeInTheDocument();
    fireEvent.click(within(popup).getByRole('button', { name: MODEL_TERMS.add }));
    const state = useProjectStore.getState();
    expect(state.items[state.selectedItemId!]).toMatchObject({ kind: 'model', scale: 50 });
  });

  it('steps aside while a point is picked on the map, and adds the model there', async () => {
    subscription = { tier: 'wanderer', status: 'active' };
    render(<ModelImportButton />);
    openPopup();
    fireEvent.change(fileInput(), { target: { files: [new File([makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 150, 1] })], 'Mast.glb')] } });
    const popup = await placeStep();
    fireEvent.click(within(popup).getByRole('button', { name: SEARCH_TERMS.pickOnMap }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The map's click handler hands the picker the point, then ends it.
    act(() => {
      const { activePicker, stopPicking } = useProjectStore.getState();
      activePicker!.onPick({ lngLat: [13.4, 52.5], name: 'Berlin' });
      stopPicking();
    });
    const back = screen.getByRole('dialog', { name: MODEL_TERMS.placeTitle });
    expect(within(back).getByTestId('model-place-position')).toHaveTextContent('Berlin');
    fireEvent.click(within(back).getByRole('button', { name: MODEL_TERMS.add }));
    const state = useProjectStore.getState();
    expect(state.items[state.selectedItemId!]).toMatchObject({ kind: 'model', name: 'Mast', position: [13.4, 52.5] });
  });

  it('ends a running pick and forgets the chosen model when the popup closes', () => {
    subscription = { tier: 'wanderer', status: 'active' };
    useProjectStore.setState({
      models: { m1: { id: 'm1', fileName: 'Tower.glb', byteSize: 1, sha256: '3'.repeat(64), bounds: { min: [0, 0, 0], max: [1, 1, 1] } } },
    });
    render(<ModelImportButton />);
    const popup = openPopup();
    fireEvent.click(within(popup).getByRole('button', { name: /Tower\.glb/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: MODEL_TERMS.back }));
    expect(screen.getByRole('dialog', { name: MODEL_TERMS.popupTitle })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Tower\.glb/ }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openPopup();
    expect(screen.getByRole('dialog', { name: MODEL_TERMS.popupTitle })).toBeInTheDocument();
  });

  it('says why a file cannot be used', async () => {
    subscription = { tier: 'wanderer', status: 'active' };
    render(<ModelImportButton />);
    openPopup();
    fireEvent.change(fileInput(), { target: { files: [new File(['x'], 'tower.fbx')] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Pick a .glb file. Other 3D formats are not supported.'));
    expect(Object.keys(useProjectStore.getState().models)).toHaveLength(0);
  });

  it("places a model the project already has from the popup's list, in one undo step", () => {
    subscription = { tier: 'wanderer', status: 'active' };
    useProjectStore.setState({
      models: { m1: { id: 'm1', fileName: 'Tower.glb', byteSize: 1, sha256: '3'.repeat(64), bounds: { min: [0, 0, 0], max: [1, 1, 1] } } },
    });
    render(<ModelImportButton />);
    const popup = openPopup();
    fireEvent.click(within(popup).getByRole('button', { name: /Tower\.glb/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: MODEL_TERMS.add }));
    const state = useProjectStore.getState();
    expect(state.items[state.selectedItemId!]).toMatchObject({ kind: 'model', assetId: 'm1', name: 'Tower', position: [2.35, 48.85], startTime: 4 });
    expect(Object.keys(state.models)).toEqual(['m1']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => undo());
    expect(Object.values(useProjectStore.getState().items).some((i) => i.kind === 'model')).toBe(false);
  });
});
