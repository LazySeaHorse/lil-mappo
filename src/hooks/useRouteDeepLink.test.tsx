import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { CAMERA_TRACK_ID, createProject } from '@/store/projectDocument';
import { createWalkRouteItem } from '@/store/itemFactories';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { clearHistory } from '@/store/history';
import type { RouteItem } from '@/store/types';
import { useRouteDeepLink } from './useRouteDeepLink';

const library = vi.hoisted(() => ({ saveProjectToLibrary: vi.fn() }));
vi.mock('@/services/projectLibrary', () => library);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const request = (slug: string, autocam: 'chase' | 'drone' = 'chase') => ({ slug, autocam });

function routes(): RouteItem[] {
  return Object.values(useProjectStore.getState().items).filter((i): i is RouteItem => i.kind === 'route');
}

function resetStore(overrides = {}) {
  useProjectStore.setState({ ...createProject({ id: 'initial', name: 'Initial project', ...overrides }), ...createTransientState() });
  clearHistory();
}

describe('useRouteDeepLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    library.saveProjectToLibrary.mockResolvedValue({});
    resetStore();
  });

  it('is immediately ready and does nothing without a request', () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useRouteDeepLink(null, true, onSettled));
    expect(result.current).toEqual({ ready: true, isEntry: false });
    expect(routes()).toHaveLength(0);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('waits for the working draft before applying', () => {
    const { result } = renderHook(() => useRouteDeepLink(request('jfk-to-lhr'), false, vi.fn()));
    expect(result.current).toEqual({ ready: false, isEntry: true });
    expect(routes()).toHaveLength(0);
  });

  it('creates exactly one flight route with AutoCam enabled, without undo history', async () => {
    const onSettled = vi.fn();
    const { result, rerender } = renderHook(
      ({ draftReady }) => useRouteDeepLink(request('jfk-to-lhr', 'drone'), draftReady, onSettled),
      { initialProps: { draftReady: false } },
    );
    rerender({ draftReady: true });
    await waitFor(() => expect(result.current.ready).toBe(true));
    rerender({ draftReady: true });

    const [route, ...rest] = routes();
    expect(rest).toHaveLength(0);
    expect(route.calculation?.mode).toBe('flight');
    expect(route.autoCam).toMatchObject({ enabled: true, preset: 'drone' });
    expect(useProjectStore.getState().name).toBe('JFK to LHR');
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
    expect(onSettled).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledOnce();
    expect(library.saveProjectToLibrary).not.toHaveBeenCalled();
  });

  it('applies only once even if it re-renders', async () => {
    const onSettled = vi.fn();
    const { result, rerender } = renderHook(() => useRouteDeepLink(request('jfk-to-lhr'), true, onSettled));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const firstId = routes()[0].id;
    rerender();
    rerender();
    expect(routes().map((r) => r.id)).toEqual([firstId]);
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it.each(['new-york-to-london', 'jfk-to-jfk', 'zzz-to-lhr', ''])(
    'falls back to the empty editor with a toast for %j',
    async (slug) => {
      const onSettled = vi.fn();
      const { result } = renderHook(() => useRouteDeepLink(request(slug), true, onSettled));
      await waitFor(() => expect(result.current.ready).toBe(true));

      expect(result.current.isEntry).toBe(false);
      expect(routes()).toHaveLength(0);
      expect(Object.keys(useProjectStore.getState().items)).toEqual([CAMERA_TRACK_ID]);
      expect(useProjectStore.getState().id).toBe('initial');
      expect(toast.error).toHaveBeenCalledOnce();
      expect(toast.success).not.toHaveBeenCalled();
      expect(onSettled).toHaveBeenCalledOnce();
    },
  );

  it('leaves an existing draft untouched when the link is invalid', async () => {
    const walk = createWalkRouteItem({ points: [[0, 0], [1, 1]], startTime: 0 });
    resetStore({ items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, [walk.id]: walk }, itemOrder: [CAMERA_TRACK_ID, walk.id] });

    const { result } = renderHook(() => useRouteDeepLink(request('nope'), true, vi.fn()));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(useProjectStore.getState().items[walk.id]).toBeDefined();
    expect(library.saveProjectToLibrary).not.toHaveBeenCalled();
  });

  it('backs up a draft with work to the library before replacing it', async () => {
    const walk = createWalkRouteItem({ points: [[0, 0], [1, 1]], startTime: 0 });
    resetStore({ items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, [walk.id]: walk }, itemOrder: [CAMERA_TRACK_ID, walk.id] });

    const { result } = renderHook(() => useRouteDeepLink(request('jfk-to-lhr'), true, vi.fn()));
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(library.saveProjectToLibrary).toHaveBeenCalledOnce();
    const saved = library.saveProjectToLibrary.mock.calls[0][0];
    expect(saved.id).not.toBe('initial');
    expect(saved.name).toBe('Initial project (backup)');
    expect(Object.keys(saved.items)).toContain(walk.id);
    expect(routes().map((r) => r.calculation?.mode)).toEqual(['flight']);
    await waitFor(() => expect(toast.info).toHaveBeenCalledOnce());
  });

  it('warns when the backup fails but still opens the route', async () => {
    library.saveProjectToLibrary.mockRejectedValue(new Error('idb'));
    const walk = createWalkRouteItem({ points: [[0, 0], [1, 1]], startTime: 0 });
    resetStore({ items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, [walk.id]: walk }, itemOrder: [CAMERA_TRACK_ID, walk.id] });

    const { result } = renderHook(() => useRouteDeepLink(request('jfk-to-lhr'), true, vi.fn()));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledOnce());
    expect(routes().map((r) => r.calculation?.mode)).toEqual(['flight']);
  });

  it('does not back up a previous, unedited deep-link project', async () => {
    const first = renderHook(() => useRouteDeepLink(request('jfk-to-lhr'), true, vi.fn()));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    vi.clearAllMocks();

    const second = renderHook(() => useRouteDeepLink(request('jfk-to-lhr'), true, vi.fn()));
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(library.saveProjectToLibrary).not.toHaveBeenCalled();
    expect(routes()).toHaveLength(1);
  });
});
