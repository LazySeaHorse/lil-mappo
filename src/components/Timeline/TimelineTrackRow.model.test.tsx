import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { createModelItem } from '@/store/itemFactories';
import { clearModelRegistry, registerModelBytes } from '@/models/modelRegistry';
import { MODEL_TERMS } from '@/models/modelTerms';
import TimelineTrackRow from './TimelineTrackRow';

const SHA = '9'.repeat(64);
const item = { ...createModelItem({ assetId: 'a1', name: 'Tower', position: [0, 0], startTime: 1 }), id: 'm1' };

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:m'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
  useProjectStore.setState({
    ...createProject(),
    ...createTransientState(),
    models: { a1: { id: 'a1', fileName: 'tower.glb', byteSize: 1, sha256: SHA, bounds: { min: [0, 0, 0], max: [1, 1, 1] } } },
    items: { m1: item },
    itemOrder: ['m1'],
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('a placed model on the timeline', () => {
  it('has its own row with a bar, and a warning while its file is missing', () => {
    render(
      <TimelineTrackRow item={item} pixelsPerSecond={20} isSelected={false} selectedKeyframeId={null} onSelectItem={vi.fn()} onSelectKeyframe={vi.fn()} />,
    );
    expect(screen.getAllByText('Tower').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: MODEL_TERMS.missingTitle })).toBeInTheDocument();
    act(() => { registerModelBytes(SHA, new ArrayBuffer(4)); });
    expect(screen.queryByRole('img', { name: MODEL_TERMS.missingTitle })).not.toBeInTheDocument();
  });
});
