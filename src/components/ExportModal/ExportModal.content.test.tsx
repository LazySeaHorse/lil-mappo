import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { useAuthStore } from '@/store/useAuthStore';
import { createProject } from '@/store/projectDocument';
import { createEndpointRouteItem, createModelItem } from '@/store/itemFactories';
import type { Subscription } from '@/lib/database.types';
import type { ModelItem, RouteItem } from '@/store/types';

const mocks = vi.hoisted(() => ({
  subscription: null as Subscription | null,
  startExport: vi.fn(),
  openUpgradeModal: vi.fn(),
}));

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ data: mocks.subscription }),
}));
vi.mock('./hooks/useLocalExportCapability', () => ({
  useLocalExportCapability: () => ({ status: 'ready', codec: 'avc1.640028' }),
}));
vi.mock('./hooks/useVideoExportExecution', () => ({
  useVideoExportExecution: () => ({
    progress: 0,
    phase: 'capture',
    error: null,
    startExport: mocks.startExport,
    cancelExport: vi.fn(),
  }),
}));

import ExportModal from './ExportModal';

const wanderer = { tier: 'wanderer', status: 'active', renewal_date: null } as Subscription;
const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function projectWith(...built: (ModelItem | RouteItem)[]) {
  const base = createProject();
  const items = { ...base.items };
  for (const item of built) items[item.id] = item;
  useProjectStore.setState({
    ...base,
    ...createTransientState(),
    items,
    itemOrder: [...base.itemOrder, ...built.map((item) => item.id)],
  });
}

const flightRoute = () =>
  createEndpointRouteItem({ mode: 'flight', start: [0, 0], end: [1, 1], name: 'Flight', startTime: 0, geojson });

const renderModal = () => act(async () => { render(<ExportModal open onClose={vi.fn()} />); });

describe('ExportModal with Pro project content', () => {
  beforeEach(() => {
    mocks.subscription = null;
    mocks.startExport.mockClear();
    mocks.openUpgradeModal.mockClear();
    useAuthStore.setState({ session: { access_token: 't' } as never, openUpgradeModal: mocks.openUpgradeModal });
  });

  afterEach(() => {
    useAuthStore.setState({ session: null });
  });

  it('lets a free user export a project of free content', async () => {
    projectWith();
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Export locally/i }));
    expect(mocks.startExport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Get Wanderer/i })).not.toBeInTheDocument();
  });

  it('asks a free user for Wanderer when the project has a placed model', async () => {
    projectWith(createModelItem({ assetId: 'a', name: 'Tower', position: [0, 0], startTime: 0 }));
    await renderModal();

    expect(screen.getByText('Placed 3D models come with the Wanderer plan.', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export locally/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Get Wanderer/i }));
    expect(mocks.openUpgradeModal).toHaveBeenCalledWith('export_limits');
    expect(mocks.startExport).not.toHaveBeenCalled();
  });

  it('asks a free user for Wanderer for a plane marker, the default on a flight route', async () => {
    projectWith(flightRoute());
    await renderModal();

    expect(screen.getByText('Car and plane markers come with the Wanderer plan.', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Get Wanderer/i })).toBeInTheDocument();
  });

  it('exports the same project for a Wanderer', async () => {
    mocks.subscription = wanderer;
    projectWith(
      createModelItem({ assetId: 'a', name: 'Tower', position: [0, 0], startTime: 0 }),
      flightRoute(),
    );
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Export locally/i }));
    expect(mocks.startExport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Get Wanderer/i })).not.toBeInTheDocument();
  });
});
