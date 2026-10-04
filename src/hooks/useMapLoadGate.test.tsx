import { renderHook, waitFor } from '@testing-library/react';
import secureLocalStorage from 'react-secure-storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUEST_LOAD_LIMIT, claimDeepLinkGuestExemption } from '@/lib/cloudAccess';
import { useMapLoadGate } from './useMapLoadGate';

const auth = vi.hoisted(() => ({ state: { isLoading: false, session: null as unknown } }));

vi.mock('@/store/useAuthStore', () => ({ useAuthStore: () => auth.state }));
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
});

describe('useMapLoadGate signed-in users', () => {
  it('still applies the server quota to a deep-link arrival', async () => {
    sessionStorage.clear();
    auth.state = { isLoading: false, session: { access_token: 'token' } };
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ allowed: false, reason: 'monthly_exhausted' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMapLoadGate({ deepLinkEntry: true }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/track-map-load', expect.anything());
    expect(result.current.blocked).toBe(true);
    expect(result.current.reason).toBe('monthly_exhausted');
    vi.unstubAllGlobals();
  });
});
