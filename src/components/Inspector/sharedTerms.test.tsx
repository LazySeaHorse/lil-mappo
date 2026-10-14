import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoundaryAddDropdown } from '@/components/Toolbar/BoundaryAddDropdown';
import { BoundaryInspector } from './BoundaryInspector';
import { RouteInspector } from './RouteInspector';
import { useProjectStore } from '@/store/useProjectStore';
import { createBoundaryItem, createEndpointRouteItem } from '@/store/itemFactories';
import { syntheticIsland } from '@/test/syntheticGeometry';
import { BOUNDARY_ANIMATION_LABELS, BOUNDARY_TERMS, ROUTE_TERMS } from '@/lib/terms';
import { getWalkthroughStepConfig } from '@/components/Onboarding/walkthroughSteps';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }),
}));
vi.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false }),
}));
vi.mock('./RoutePlanner', () => ({ RoutePlanner: () => <div /> }));
vi.mock('./BoundarySearch', () => ({
  BoundarySearch: ({ onSelect }: { onSelect?: (r: unknown) => void }) => (
    <button onClick={() => onSelect?.({ display_name: 'Isola, Italia', type: 'island', geojson: syntheticIsland(), countryCode: 'it' })}>
      pick-result
    </button>
  ),
}));

const island = syntheticIsland();
const boundary = createBoundaryItem({ placeName: 'Isola', geojson: island, startTime: 0 });
const line: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }],
};
const route = createEndpointRouteItem({ mode: 'car', geojson: line, start: [0, 0], end: [1, 1], name: 'R', startTime: 0 });

beforeEach(() => {
  useProjectStore.setState({ items: {}, itemOrder: [], selectedItemId: null });
  useProjectStore.getState().clearPreviewBoundary();
});

function renderAddPanel() {
  const view = render(<BoundaryAddDropdown isOpen onOpenChange={vi.fn()} />);
  fireEvent.click(screen.getByText('pick-result'));
  return view;
}

describe('boundary words are the same in the add panel and the inspector', () => {
  it('uses "Border color" in both', () => {
    renderAddPanel();
    expect(screen.getByText(BOUNDARY_TERMS.borderColor)).toBeInTheDocument();
    expect(BOUNDARY_TERMS.borderColor).toBe('Border color');
  });

  it('the inspector says Border and Fill, not Stroke', () => {
    useProjectStore.setState({ items: { [boundary.id]: boundary } });
    render(<BoundaryInspector item={boundary} />);
    expect(screen.getByText(BOUNDARY_TERMS.borderColor)).toBeInTheDocument();
    expect(screen.getByText(BOUNDARY_TERMS.borderWidth)).toBeInTheDocument();
    expect(screen.getByText(BOUNDARY_TERMS.fillColor)).toBeInTheDocument();
    expect(screen.getByText(BOUNDARY_TERMS.fillOpacity)).toBeInTheDocument();
    expect(screen.queryByText(/stroke/i)).not.toBeInTheDocument();
  });

  it('names the entrance animations alike, including "Fade in"', () => {
    renderAddPanel();
    // The add panel picks from a select list; open it to read the options.
    fireEvent.click(screen.getByRole('combobox', { name: BOUNDARY_TERMS.animation }));
    const list = screen.getByRole('listbox');
    for (const style of ['fade', 'draw', 'trace'] as const) {
      expect(within(list).getByText(BOUNDARY_ANIMATION_LABELS[style])).toBeInTheDocument();
    }
    expect(BOUNDARY_ANIMATION_LABELS.fade).toBe('Fade in');
  });

  it('the inspector shows the same animation names', () => {
    useProjectStore.setState({ items: { [boundary.id]: boundary } });
    render(<BoundaryInspector item={boundary} />);
    for (const style of ['none', 'fade', 'draw', 'trace'] as const) {
      expect(screen.getByRole('button', { name: BOUNDARY_ANIMATION_LABELS[style] })).toBeInTheDocument();
    }
  });
});

describe('the camera switch is called "Follow camera" everywhere', () => {
  it('in the route inspector', () => {
    useProjectStore.setState({ items: { [route.id]: route } });
    render(<RouteInspector item={route} />);
    expect(screen.getByText(ROUTE_TERMS.followCamera)).toBeInTheDocument();
    expect(ROUTE_TERMS.followCamera).toBe('Follow camera');
  });

  it('in the tour step', () => {
    const step = getWalkthroughStepConfig('follow-route', false);
    const text = JSON.stringify(step.renderContent({
      isMobile: false,
      gestures: { pan: false, orbit: false, zoom: false },
      routeEndpoints: { start: false, end: false },
    }));
    expect(text).toContain(ROUTE_TERMS.followCamera);
    expect(step.title).toContain('camera');
  });
});
