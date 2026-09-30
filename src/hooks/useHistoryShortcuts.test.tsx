import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useProjectStore, createTransientState } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { clearHistory } from '@/store/history';
import { useHistoryShortcuts } from './useHistoryShortcuts';

function Harness() {
  useHistoryShortcuts();
  return <input data-testid="field" />;
}

const state = () => useProjectStore.getState();

describe('useHistoryShortcuts', () => {
  beforeEach(() => {
    useProjectStore.setState({ ...createProject(), ...createTransientState() });
    clearHistory();
  });

  it('undoes on mod+z and redoes on mod+shift+z / ctrl+y, but not inside inputs', () => {
    const { getByTestId } = render(<Harness />);
    state().setProjection('mercator');

    fireEvent.keyDown(getByTestId('field'), { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(state().projection).toBe('mercator');

    fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(state().projection).toBe('globe');
    fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true });
    expect(state().projection).toBe('mercator');
    fireEvent.keyDown(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'y', code: 'KeyY', ctrlKey: true });
    expect(state().projection).toBe('mercator');
  });
});
