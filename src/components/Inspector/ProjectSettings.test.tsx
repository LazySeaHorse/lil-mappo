import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { ProjectSettings } from './ProjectSettings';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: { tier: 'cartographer' } }) }));

const initialStore = useProjectStore.getState();

beforeEach(() => {
  act(() => useProjectStore.setState(initialStore, true));
  act(() => useProjectStore.setState({ projectSettingsTab: 'map' }));
});

/** The Atmosphere section starts collapsed. */
function openAtmosphere() {
  fireEvent.click(screen.getByText('Atmosphere'));
}

describe('ProjectSettings atmosphere', () => {
  it('offers star intensity and fog color on the globe', () => {
    act(() => useProjectStore.getState().setProjection('globe'));
    render(<ProjectSettings />);
    openAtmosphere();
    expect(screen.getByText(/^Star intensity/)).toBeInTheDocument();
    expect(screen.getByText('Fog color')).toBeInTheDocument();
  });

  it('hides star intensity in Mercator, which draws no stars, but keeps the fog color that tints the haze', () => {
    act(() => useProjectStore.getState().setProjection('mercator'));
    render(<ProjectSettings />);
    openAtmosphere();
    expect(screen.queryByText(/^Star intensity/)).toBeNull();
    expect(screen.getByText('Fog color')).toBeInTheDocument();
  });

  it('follows the projection while the panel is open, and keeps the stored star intensity', () => {
    act(() => useProjectStore.setState({ starIntensity: 0.9 }));
    render(<ProjectSettings />);
    openAtmosphere();
    act(() => useProjectStore.getState().setProjection('mercator'));
    expect(screen.queryByText(/^Star intensity/)).toBeNull();
    act(() => useProjectStore.getState().setProjection('globe'));
    expect(screen.getByText(/^Star intensity/)).toBeInTheDocument();
    expect(useProjectStore.getState().starIntensity).toBe(0.9);
  });
});
