import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearModelRegistry, registerModelBytes } from './modelRegistry';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import type { ModelAsset } from '@/store/types';
import { MODEL_TERMS } from './modelTerms';
import { ModelPickerDialog } from './ModelPickerDialog';

const asset = (id: string, fileName: string): ModelAsset =>
  ({ id, fileName, byteSize: 2_500_000, sha256: id.repeat(64).slice(0, 64), bounds: { min: [0, 0, 0], max: [1, 1, 1] } });

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:m'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
  useProjectStore.setState({ ...createProject(), ...createTransientState(), models: {} });
});

const setup = () => {
  const onFile = vi.fn();
  const onPickModel = vi.fn();
  const onOpenChange = vi.fn();
  render(<ModelPickerDialog open onOpenChange={onOpenChange} onFile={onFile} onPickModel={onPickModel} />);
  return { popup: screen.getByRole('dialog'), onFile, onPickModel, onOpenChange };
};

describe('ModelPickerDialog', () => {
  it('opens with Mappo holding a cube over a drawn model scene, not a map still', () => {
    const { popup } = setup();
    expect(popup.querySelector('[data-slot="pin-drop"]')?.getAttribute('data-scene')).toBe('model');
    expect(popup.querySelector('svg[data-mood="cube"]')).not.toBeNull();
    expect(popup.querySelector('img')).toBeNull();
  });

  it('explains the file rules: .glb only, size, stays in the browser, pick again after a reload', () => {
    const { popup } = setup();
    for (const line of MODEL_TERMS.popupFacts) expect(within(popup).getByText(line)).toBeInTheDocument();
    expect(MODEL_TERMS.popupFacts.join(' ')).toMatch(/\.glb/);
    expect(MODEL_TERMS.popupFacts.join(' ')).toMatch(/50 MB/);
    expect(MODEL_TERMS.popupFacts.join(' ')).toMatch(/never uploaded/);
    expect(MODEL_TERMS.popupFacts.join(' ')).toMatch(/after a reload/i);
  });

  it('still offers the file picker', () => {
    const { popup } = setup();
    expect(within(popup).getByRole('button', { name: MODEL_TERMS.upload })).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('model-file-input'), { target: { files: [new File(['x'], 'a.glb')] } });
  });

  it('lists nothing to pick when the project has no models', () => {
    const { popup } = setup();
    expect(within(popup).queryByRole('list', { name: MODEL_TERMS.listTitle })).not.toBeInTheDocument();
  });

  it("lists the project's models, and picking one closes the popup and hands it over", () => {
    const bus = asset('a', 'bus.glb');
    useProjectStore.setState({ models: { a: bus, b: asset('b', 'tram.glb') } });
    registerModelBytes(bus.sha256, new ArrayBuffer(8));
    const { popup, onPickModel, onOpenChange } = setup();
    const list = within(popup).getByRole('list', { name: MODEL_TERMS.listTitle });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('2.4 MB', { exact: false })).toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: /bus\.glb/ }));
    expect(onPickModel).toHaveBeenCalledWith(bus);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('says which models still need their file', () => {
    const bus = asset('a', 'bus.glb');
    useProjectStore.setState({ models: { a: bus } });
    const { popup } = setup();
    expect(within(popup).getByText(MODEL_TERMS.needsFile)).toBeInTheDocument();
  });
});
