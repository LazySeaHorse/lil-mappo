import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ track: vi.fn(), trackAnonymous: vi.fn() }));
vi.mock('./index', () => ({ track: mocks.track }));
vi.mock('./anonymous', () => ({ trackAnonymous: mocks.trackAnonymous }));

import { useAuthStore } from '@/store/useAuthStore';
import { reportRouteAdded } from './reporters';

describe('reportRouteAdded', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the bucketed product event for signed-in users', () => {
    useAuthStore.setState({ user: { id: 'u', email: 'a@b.c' } });
    reportRouteAdded('import_gpx', 4200);
    expect(mocks.track).toHaveBeenCalledWith('route_added', { source: 'import_gpx', point_bucket: '1k-10k' });
    expect(mocks.trackAnonymous).not.toHaveBeenCalled();
  });

  it('sends only the anonymous counter (source only) for guests', () => {
    useAuthStore.setState({ user: null });
    reportRouteAdded('car', 50);
    expect(mocks.trackAnonymous).toHaveBeenCalledWith('guest_route_added', { source: 'car' });
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
