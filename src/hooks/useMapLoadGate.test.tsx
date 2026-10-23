import { renderHook, waitFor } from '@testing-library/react';
import secureLocalStorage from 'react-secure-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUEST_LOAD_LIMIT, claimDeepLinkGuestExemption } from '@/lib/cloudAccess';
import { useMapLoadGate } from './useMapLoadGate';

const auth = vi.hoisted(() => ({ state: { isLoading: false, session: null as unknown } }));
const rpc = vi.hoisted(() => vi.fn());

vi.mock('@/store/useAuthStore', () => ({ useAuthStore: () => auth.state }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null, isLoading: false }) }));

const storage = vi.mocked(secureLocalStorage);

function setGuestLoads(count: number) {
  storage.getItem.mockImplementation((key: string) => (key === 'mapbox.styler' ? count : null));
}

describe('claimDeepLinkGuestExemption', () => {
  beforeEach(() => sessionStorage.clear());

  it('grants once per browser session', () => {
    expect(claimDeepLinkGuestExemption()).toBe(true);
    expect(claimDeepLinkGuestExemption()).toBe(false);
  });

  it('fails closed when sessionStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(claimDeepLinkGuestExemption()).toBe(false);
    spy.mockRestore();
  });
});

describe('useMapLoadGate guest cap', () => {
  beforeEach(() => {
    sessionStorage.clear();
    auth.state = { isLoading: false, session: null };
    setGuestLoads(GUEST_LOAD_LIMIT);
  });

  it('blocks a guest over the cap on a normal visit', async () => {
    const { result } = renderHook(() => useMapLoadGate());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.blocked).toBe(true);
    expect(result.current.reason).toBe('guest_limit');
  });

  it('lets a deep-link arrival through the cap', async () => {
    const { result } = renderHook(() => useMapLoadGate({ deepLinkEntry: true }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.blocked).toBe(false);
  });

  it('only exempts the first deep-link load of a session', async () => {
    const first = renderHook(() => useMapLoadGate({ deepLinkEntry: true }));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(first.result.current.blocked).toBe(false);

    const second = renderHook(() => useMapLoadGate({ deepLinkEntry: true }));
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.blocked).toBe(true);
  });

  it('does not spend the exemption on a guest who is under the cap', async () => {
    setGuestLoads(1);
    const { result } = renderHook(() => useMapLoadGate({ deepLinkEntry: true }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.blocked).toBe(false);
    expect(claimDeepLinkGuestExemption()).toBe(true);
  });

  it('waits for deepLinkPending before evaluating the cap', async () => {
    let pending = true;
    let entry = false;
    const { result, rerender } = renderHook(() =>
      useMapLoadGate({ deepLinkEntry: entry, deepLinkPending: pending }),
    );
    expect(result.current.ready).toBe(false);

    pending = false;
    entry = true;
    rerender();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.blocked).toBe(false);
  });
});

describe('useMapLoadGate signed-in users', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    storage.getItem.mockImplementation(() => null);
    auth.state = { isLoading: false, session: { access_token: 'token' } };
    rpc.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    return () => vi.unstubAllGlobals();
  });

  function rpcAnswers(data: unknown) {
    rpc.mockResolvedValue({ data, error: null, status: 200 });
  }

  function rpcFails(error: { code: string; message: string }, status: number) {
    rpc.mockResolvedValue({ data: null, error, status });
  }

  async function settle(options?: Parameters<typeof useMapLoadGate>[0]) {
    const { result } = renderHook(() => useMapLoadGate(options));
    await waitFor(() => expect(result.current.ready).toBe(true));
    return result.current;
  }

  it('lets the map load when the database allows it, without calling the endpoint', async () => {
    rpcAnswers([{ allowed: true, reason: null, monthly_total: 4, daily_total: 1 }]);
    const gate = await settle();
    expect(rpc).toHaveBeenCalledWith('track_my_map_load');
    expect(gate.blocked).toBe(false);
    expect(gate.reason).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks with the database reason when the quota is used up', async () => {
    rpcAnswers([{ allowed: false, reason: 'daily_throttled', monthly_total: 30, daily_total: 3 }]);
    const gate = await settle();
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toBe('daily_throttled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still applies the server quota to a deep-link arrival', async () => {
    rpcAnswers([{ allowed: false, reason: 'monthly_exhausted', monthly_total: 50, daily_total: 0 }]);
    const gate = await settle({ deepLinkEntry: true });
    expect(rpc).toHaveBeenCalledWith('track_my_map_load');
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toBe('monthly_exhausted');
  });

  it('falls back to the endpoint when the database function is not there yet', async () => {
    rpcFails({ code: 'PGRST202', message: 'Could not find the function public.track_my_map_load' }, 404);
    fetchMock.mockResolvedValue({ json: async () => ({ allowed: false, reason: 'monthly_exhausted' }) });
    const gate = await settle();
    expect(fetchMock).toHaveBeenCalledWith('/api/track-map-load', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    });
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toBe('monthly_exhausted');
  });

  it('uses an allowed answer from the fallback endpoint', async () => {
    rpcFails({ code: 'PGRST202', message: 'Could not find the function public.track_my_map_load' }, 404);
    fetchMock.mockResolvedValue({ json: async () => ({ allowed: true, monthly_total: 2, daily_total: 1 }) });
    const gate = await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(gate.blocked).toBe(false);
  });

  it('fails closed on any other database error, without the fallback', async () => {
    rpcFails({ code: '42501', message: 'permission denied for function track_my_map_load' }, 401);
    const gate = await settle();
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toBe('quota_error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the database answers without a row', async () => {
    rpcAnswers([]);
    const gate = await settle();
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toBe('quota_error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the quota once per page load', async () => {
    rpcAnswers([{ allowed: true, reason: null, monthly_total: 1, daily_total: 1 }]);
    const { result, rerender } = renderHook(() => useMapLoadGate());
    await waitFor(() => expect(result.current.ready).toBe(true));
    rerender();
    rerender();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
