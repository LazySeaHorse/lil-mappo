import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { useMapPicker } from './useMapPicker';

afterEach(() => useProjectStore.getState().stopPicking());

describe('useMapPicker', () => {
  it('toggles the session on and off', () => {
    const onPick = vi.fn();
    const { result } = renderHook(() => useMapPicker('p1', { prompt: 'Start', onPick }));
    expect(result.current.isPicking).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.isPicking).toBe(true);
    expect(useProjectStore.getState().activePicker?.prompt).toBe('Start');

    act(() => result.current.toggle());
    expect(result.current.isPicking).toBe(false);
  });

  it('stops its own session on unmount but not another picker\'s', () => {
    const { result, unmount } = renderHook(() => useMapPicker('p1', { onPick: () => {} }));
    act(() => result.current.toggle());
    unmount();
    expect(useProjectStore.getState().activePicker).toBeNull();

    act(() => useProjectStore.getState().startPicking({ id: 'other', onPick: () => {} }));
    const second = renderHook(() => useMapPicker('p1', { onPick: () => {} }));
    second.unmount();
    expect(useProjectStore.getState().activePicker?.id).toBe('other');
  });

  it('stops the session when disabled', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useMapPicker('p1', { enabled, onPick: () => {} }),
      { initialProps: { enabled: true } },
    );
    act(() => result.current.toggle());
    rerender({ enabled: false });
    expect(useProjectStore.getState().activePicker).toBeNull();
  });
});
