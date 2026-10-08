import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SelectionPreviewPill } from './SelectionPreviewPill';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';

const initialStore = useProjectStore.getState();
const route = { kind: 'route', id: 'r', name: 'Coast road', startTime: 2, endTime: 6 } as RouteItem;

beforeEach(() => {
  act(() => useProjectStore.setState(initialStore, true));
  act(() => useProjectStore.setState({ duration: 10, items: { r: route }, itemOrder: ['r'] }));
});

describe('SelectionPreviewPill', () => {
  it('shows only for a previewed selection and moves the playhead into the clip on click', () => {
    render(<SelectionPreviewPill />);
    expect(screen.queryByTestId('selection-preview-pill')).toBeNull();

    act(() => useProjectStore.getState().selectItem('r'));
    expect(screen.getByTestId('selection-preview-pill')).toHaveTextContent('Showing “Coast road” in full');

    fireEvent.click(screen.getByTestId('selection-preview-pill'));
    expect(useProjectStore.getState().playheadTime).toBe(4);
    expect(screen.queryByTestId('selection-preview-pill')).toBeNull();
  });

  it('hides in present mode', () => {
    render(<SelectionPreviewPill />);
    act(() => useProjectStore.getState().selectItem('r'));
    act(() => useProjectStore.getState().setHideUI(true));
    expect(screen.queryByTestId('selection-preview-pill')).toBeNull();
  });
});
