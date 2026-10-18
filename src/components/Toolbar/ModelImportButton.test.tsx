import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '@/lib/database.types';
import { useAuthStore } from '@/store/useAuthStore';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { clearModelRegistry } from '@/models/modelRegistry';
import { makeGlb } from '@/models/testGlb';
import { MODEL_TERMS } from '@/models/modelTerms';
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
  useAuthStore.setState({ openUpgradeModal });
  openUpgradeModal.mockClear();
  toast.success.mockClear();
  toast.error.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

const button = () => screen.getByRole('button', { name: MODEL_TERMS.importButton });
const fileInput = () => screen.getByTestId('model-file-input') as HTMLInputElement;

describe('ModelImportButton', () => {
  it('asks a free user to upgrade instead of opening the file picker', () => {
    subscription = null;
    render(<ModelImportButton />);
    const click = vi.spyOn(fileInput(), 'click');
    expect(screen.getByText('PRO')).toBeInTheDocument();
    fireEvent.click(button());
    expect(openUpgradeModal).toHaveBeenCalledWith('model_import');
    expect(click).not.toHaveBeenCalled();
  });

  it('opens the file picker for Pro', () => {
    subscription = { tier: 'wanderer', status: 'active' };
    render(<ModelImportButton />);
    const click = vi.spyOn(fileInput(), 'click');
    expect(screen.queryByText('PRO')).not.toBeInTheDocument();
    fireEvent.click(button());
    expect(click).toHaveBeenCalled();
    expect(openUpgradeModal).not.toHaveBeenCalled();
  });

  it('places a picked model at the map center and the playhead, and selects it', async () => {
    subscription = { tier: 'wanderer', status: 'active' };
    render(<ModelImportButton />);
    const file = new File([makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 1, 1] })], 'Lighthouse.glb');
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await waitFor(() => expect(useProjectStore.getState().selectedItemId).not.toBeNull());
    const item = useProjectStore.getState().items[useProjectStore.getState().selectedItemId!];
    expect(item).toMatchObject({ kind: 'model', name: 'Lighthouse', position: [2.35, 48.85], startTime: 4 });
    expect(toast.success).toHaveBeenCalled();
  });

  it('says why a file cannot be used', async () => {
    subscription = { tier: 'wanderer', status: 'active' };
    render(<ModelImportButton />);
    fireEvent.change(fileInput(), { target: { files: [new File(['x'], 'tower.fbx')] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Pick a .glb file. Other 3D formats are not supported.'));
    expect(Object.keys(useProjectStore.getState().models)).toHaveLength(0);
  });

  it('does not import for a free user even if a file arrives', async () => {
    subscription = null;
    render(<ModelImportButton />);
    const file = new File([makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 1, 1] })], 'a.glb');
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await waitFor(() => expect(openUpgradeModal).toHaveBeenCalledWith('model_import'));
    expect(Object.keys(useProjectStore.getState().models)).toHaveLength(0);
  });
});
