import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { useTimelinePlayheadSync } from './useTimelinePlayheadSync';

describe('useTimelinePlayheadSync', () => {
  it('moves the playhead elements only when the playhead time changes', () => {
    useProjectStore.setState({ playheadTime: 1, isInspectorOpen: false });
    const { result } = renderHook(() => useTimelinePlayheadSync(10, 64));
    const diamond = document.createElement('div');
    const line = document.createElement('div');
    const time = document.createElement('span');
    Object.assign(result.current.rulerDiamondRef, { current: diamond });
    Object.assign(result.current.trackLineRef, { current: line });
    Object.assign(result.current.timeDisplayRef, { current: time });

    act(() => useProjectStore.setState({ playheadTime: 2 }));
    expect(diamond.style.left).toBe('20px');
    expect(line.style.left).toBe('84px');
    expect(time.textContent).not.toBe('');

    diamond.style.left = '999px';
    time.textContent = 'sentinel';
    act(() => useProjectStore.setState({ isInspectorOpen: true }));
    expect(diamond.style.left).toBe('999px');
    expect(time.textContent).toBe('sentinel');
  });
});
