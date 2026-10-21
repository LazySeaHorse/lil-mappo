import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearModelRegistry, registerModelBytes } from './modelRegistry';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import type { ModelAsset } from '@/store/types';
import { makeGlb } from './testGlb';
import { MAX_MODEL_URLS } from './modelUrl';
import { MODEL_TERMS } from './modelTerms';
import { ModelPickerDialog } from './ModelPickerDialog';

const asset = (id: string, fileName: string): ModelAsset =>
  ({ id, fileName, byteSize: 2_500_000, sha256: id.repeat(64).slice(0, 64), bounds: { min: [0, 0, 0], max: [1, 1, 1] } });

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:m'), revokeObjectURL: vi.fn() }));
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  clearModelRegistry();
  useProjectStore.setState({ ...createProject(), ...createTransientState(), models: {} });
});

const fetchMock = vi.fn();

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
    expect(within(list).getAllByText(/2\.4 MB/)).toHaveLength(2);
    fireEvent.click(within(list).getByRole('button', { name: /bus\.glb/ }));
    expect(onPickModel).toHaveBeenCalledWith(bus);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('says which models still need their file', () => {
    const bus = asset('a', 'bus.glb');
    useProjectStore.setState({ models: { a: bus } });
    const { popup } = setup();
    expect(within(popup).getByText(new RegExp(MODEL_TERMS.needsFile))).toBeInTheDocument();
  });
});

describe('ModelPickerDialog URLs', () => {
  const glb = () => makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 1, 1] });
  const paste = (popup: HTMLElement, text: string) => {
    fireEvent.change(within(popup).getByRole('textbox', { name: MODEL_TERMS.urlLabel }), { target: { value: text } });
    fireEvent.click(within(popup).getByRole('button', { name: MODEL_TERMS.urlAdd }));
  };

  it('keeps the add button off until there is something pasted', () => {
    const { popup } = setup();
    expect(within(popup).getByRole('button', { name: MODEL_TERMS.urlAdd })).toBeDisabled();
  });

  it('gives every pasted URL its own row: loading, then added or the reason it failed', async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('good')) return new Promise<Response>((resolve) => { finish = resolve; });
      return init?.mode === 'no-cors' ? Promise.resolve(new Response(null)) : Promise.reject(new TypeError('Failed to fetch'));
    });
    const { popup } = setup();
    paste(popup, 'https://cdn.test/good.glb\nhttps://nocors.test/blocked.glb');
    const rows = () => within(popup).getAllByTestId('model-url-row');
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveAttribute('data-status', 'loading');
    await waitFor(() => expect(rows()[1]).toHaveAttribute('data-status', 'error'));
    expect(rows()[1]).toHaveTextContent("That host doesn't allow loading from other sites");
    expect(rows()[0]).toHaveAttribute('data-status', 'loading');

    finish(new Response(glb()));
    await waitFor(() => expect(rows()[0]).toHaveAttribute('data-status', 'added'));
    // The model joins the list of the project's models.
    expect(Object.values(useProjectStore.getState().models).map((a) => a.fileName)).toEqual(['good.glb']);
    expect(within(popup).getByRole('list', { name: MODEL_TERMS.listTitle })).toHaveTextContent('good.glb');
  });

  it('says when a URL is not a .glb', async () => {
    fetchMock.mockResolvedValue(new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
    const { popup } = setup();
    paste(popup, 'https://cdn.test/page');
    await waitFor(() => expect(within(popup).getByTestId('model-url-row')).toHaveAttribute('data-status', 'error'));
    expect(within(popup).getByTestId('model-url-row')).toHaveTextContent('not a .glb');
  });

  it('only loads the first few URLs of a long paste and says so', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { popup } = setup();
    paste(popup, Array.from({ length: MAX_MODEL_URLS + 2 }, (_, i) => `https://cdn.test/${i}.glb`).join('\n'));
    expect(within(popup).getAllByTestId('model-url-row')).toHaveLength(MAX_MODEL_URLS);
    expect(within(popup).getByText(MODEL_TERMS.urlSkipped(2))).toBeInTheDocument();
  });
});
