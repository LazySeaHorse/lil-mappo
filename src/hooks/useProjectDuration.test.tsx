import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { FREE_LIMITS } from '@/lib/cloudAccess';
import { clampDuration, useProjectDuration } from './useProjectDuration';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
const subscription = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: subscription.current }) }));

beforeEach(() => {
  subscription.current = null;
  useProjectStore.setState({ duration: 10, playheadTime: 0, isPlaying: false });
});

describe('clampDuration', () => {
  it('cuts a length down to the plan limit', () => {
    expect(clampDuration(99, FREE_LIMITS)).toEqual({ seconds: 30, clamped: true });
    expect(clampDuration(12, FREE_LIMITS)).toEqual({ seconds: 12, clamped: false });
  });
});

describe('useProjectDuration', () => {
  it('writes the length to the store', () => {
    const { result } = renderHook(() => useProjectDuration());
    act(() => result.current.setDuration(20));
    expect(useProjectStore.getState().duration).toBe(20);
  });

  it('keeps a free plan at its longest video', () => {
    const { result } = renderHook(() => useProjectDuration());
    let outcome;
    act(() => { outcome = result.current.setDuration(120); });
    expect(outcome).toEqual({ seconds: 30, clamped: true });
    expect(useProjectStore.getState().duration).toBe(30);
    expect(result.current.maxDuration).toBe(30);
  });

  it('lets a paid plan set a long video', () => {
    subscription.current = { tier: 'wanderer', status: 'active' };
    const { result } = renderHook(() => useProjectDuration());
    act(() => result.current.setDuration(120));
    expect(useProjectStore.getState().duration).toBe(120);
  });
});
