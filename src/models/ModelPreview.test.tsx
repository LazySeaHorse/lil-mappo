import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelAsset } from '@/store/types';
import { clearModelRegistry, registerModelBytes } from './modelRegistry';
import { ModelPreview } from './ModelPreview';

const preview = vi.hoisted(() => ({ startModelPreview: vi.fn(), dispose: vi.fn() }));
vi.mock('@/models/modelPreview', () => ({ startModelPreview: preview.startModelPreview }));

const asset: ModelAsset = { id: 'a', fileName: 'bus.glb', byteSize: 8, sha256: 'b'.repeat(64), bounds: { min: [0, 0, 0], max: [1, 1, 1] } };

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:converted'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
  preview.startModelPreview.mockReset().mockResolvedValue({ dispose: preview.dispose });
  preview.dispose.mockReset();
});

describe('ModelPreview', () => {
  it('draws the bytes the map loads on a canvas, and frees it when it goes', async () => {
    registerModelBytes(asset.sha256, new ArrayBuffer(8));
    const { unmount } = render(<ModelPreview asset={asset} />);
    const canvas = screen.getByRole('img', { name: 'Preview of bus.glb' });
    await waitFor(() => expect(preview.startModelPreview).toHaveBeenCalledWith(canvas, 'blob:converted'));
    unmount();
    expect(preview.dispose).toHaveBeenCalled();
  });

  it('shows a cube for a model whose file is missing', () => {
    render(<ModelPreview asset={asset} />);
    expect(screen.getByTestId('model-preview')).toHaveAttribute('data-state', 'placeholder');
    expect(preview.startModelPreview).not.toHaveBeenCalled();
  });

  it('shows a cube when the model cannot be drawn here', async () => {
    preview.startModelPreview.mockRejectedValue(new Error('no WebGL'));
    registerModelBytes(asset.sha256, new ArrayBuffer(8));
    render(<ModelPreview asset={asset} />);
    await waitFor(() => expect(screen.getByTestId('model-preview')).toHaveAttribute('data-state', 'placeholder'));
  });
});
