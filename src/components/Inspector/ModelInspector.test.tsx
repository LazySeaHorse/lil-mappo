import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '@/lib/database.types';
import { useAuthStore } from '@/store/useAuthStore';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { createModelItem } from '@/store/itemFactories';
import type { ModelAsset, ModelItem } from '@/store/types';
import { clearModelRegistry, registerModelBytes } from '@/models/modelRegistry';
import { sha256Hex } from '@/models/glb';
import { makeGlb } from '@/models/testGlb';
import { MODEL_TERMS } from '@/models/modelTerms';
import InspectorPanel from './InspectorPanel';

let subscription: Partial<Subscription> | null = null;
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: subscription }) }));
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));
vi.mock('@mapbox/search-js-core', () => ({ SearchBoxCore: class {}, SearchSession: class {} }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const glb = makeGlb({ nodes: [{ mesh: 0 }], min: [-1, 0, -1], max: [1, 12, 1] });
const otherGlb = makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [3, 3, 3] });
const openUpgradeModal = vi.fn();
let asset: ModelAsset;
let item: ModelItem;

beforeEach(async () => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:m'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
  subscription = null;
  openUpgradeModal.mockClear();
  useAuthStore.setState({ openUpgradeModal });
  asset = {
    id: 'a1', fileName: 'tower.glb', byteSize: glb.byteLength, sha256: await sha256Hex(glb),
    bounds: { min: [-1, 0, -1], max: [1, 12, 1] },
  };
  item = { ...createModelItem({ assetId: 'a1', name: 'Tower', position: [2.35, 48.85], startTime: 0 }), id: 'm1', scale: 2 };
  useProjectStore.setState({
    ...createProject(),
    ...createTransientState(),
    models: { a1: asset },
    items: { m1: item },
    itemOrder: ['m1'],
    selectedItemId: 'm1',
    isInspectorOpen: true,
  });
});

afterEach(() => vi.unstubAllGlobals());

const relinkInput = () => screen.getByTestId('relink-input-a1') as HTMLInputElement;
const pick = (bytes: ArrayBuffer, name: string) => fireEvent.change(relinkInput(), { target: { files: [new File([bytes], name)] } });

describe('ModelInspector', () => {
  it('shows the model panel with its file and size as drawn', () => {
    registerModelBytes(asset.sha256, glb);
    render(<InspectorPanel />);
    expect(screen.getByRole('heading', { name: '3D model' })).toBeInTheDocument();
    expect(screen.getByText(/tower\.glb/)).toBeInTheDocument();
    expect(screen.getByText('24 m')).toBeInTheDocument();
    expect(screen.getByText('Appear')).toBeInTheDocument();
    expect(screen.queryByText(MODEL_TERMS.missingTitle)).not.toBeInTheDocument();
  });

  it('asks for the file of a missing model and loads it when it is the same file', async () => {
    render(<InspectorPanel />);
    expect(screen.getByText(MODEL_TERMS.missingTitle)).toBeInTheDocument();
    pick(glb, 'renamed.glb');
    await waitFor(() => expect(screen.queryByText(MODEL_TERMS.missingTitle)).not.toBeInTheDocument());
    expect(useProjectStore.getState().models.a1).toEqual(asset);
  });

  it('warns about a different file and uses it after the OK (Pro)', async () => {
    subscription = { tier: 'wanderer', status: 'active' };
    render(<InspectorPanel />);
    pick(otherGlb, 'other.glb');
    await screen.findByText(MODEL_TERMS.mismatch('tower.glb'));
    fireEvent.click(screen.getByRole('button', { name: MODEL_TERMS.useAnyway }));
    await waitFor(() => expect(screen.queryByText(MODEL_TERMS.missingTitle)).not.toBeInTheDocument());
    expect(useProjectStore.getState().models.a1.fileName).toBe('other.glb');
  });

  it('keeps a free user on the old model when the file is different', async () => {
    render(<InspectorPanel />);
    pick(otherGlb, 'other.glb');
    await screen.findByText(MODEL_TERMS.mismatch('tower.glb'));
    fireEvent.click(screen.getByRole('button', { name: MODEL_TERMS.useAnyway }));
    expect(openUpgradeModal).toHaveBeenCalledWith('model_import');
    expect(useProjectStore.getState().models.a1).toEqual(asset);
  });

  it('cancels a different file', async () => {
    render(<InspectorPanel />);
    pick(otherGlb, 'other.glb');
    await screen.findByText(MODEL_TERMS.mismatch('tower.glb'));
    fireEvent.click(screen.getByRole('button', { name: MODEL_TERMS.cancel }));
    expect(screen.getByRole('button', { name: MODEL_TERMS.relink })).toBeInTheDocument();
  });

  it('says why a relink file cannot be used', async () => {
    render(<InspectorPanel />);
    pick(new ArrayBuffer(4), 'tower.png');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Pick a .glb file. Other 3D formats are not supported.'));
  });
});
