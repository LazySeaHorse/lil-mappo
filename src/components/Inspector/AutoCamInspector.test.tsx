import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoCamInspector } from './AutoCamInspector';
import { useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';
import { AUTO_CAM_PRESETS, autoCamForRoute } from '@/config/vehicles';
import { FOLLOW_CAMERA_TERMS, ROUTE_TERMS } from '@/lib/terms';
import type { RouteItem } from '@/store/types';

vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));

const makeRoute = (): RouteItem => {
  const route = createEndpointRouteItem({
    id: 'r1', mode: 'car', name: 'Drive', startTime: 0,
    geojson: wrapGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }), start: [0, 0], end: [1, 1],
  });
  return { ...route, autoCam: autoCamForRoute(route) };
};

const stored = () => useProjectStore.getState().items.r1 as RouteItem;

const Live = () => <AutoCamInspector item={useProjectStore((s) => s.items.r1) as RouteItem} />;

function show(patch: (route: RouteItem) => void = () => {}) {
  const route = makeRoute();
  patch(route);
  useProjectStore.setState({ items: { r1: route }, itemOrder: ['r1'], selectedItemId: 'r1', selectedAutoCamRouteId: 'r1' });
  return render(<Live />);
}

const fineTuneButton = () => screen.getByRole('button', { name: 'Fine-tune' });

describe('AutoCamInspector', () => {
  beforeEach(() => {
    localStorage.clear();
    useUiPreferencesStore.setState({ inspectorSections: {} });
    useProjectStore.setState({ items: {}, itemOrder: [] });
  });

  it('shows the camera styles first, each with a short description', () => {
    show();
    const cards = ['Chase', 'Drone', 'Reveal', 'Top-down', FOLLOW_CAMERA_TERMS.navigationView.title]
      .map((name) => screen.getByRole('button', { name: new RegExp(name) }));
    for (const key of ['chase', 'drone', 'reveal', 'topdown'] as const) {
      expect(screen.getByText(AUTO_CAM_PRESETS[key].description)).toBeInTheDocument();
    }
    expect(screen.getByText(FOLLOW_CAMERA_TERMS.navigationView.description)).toBeInTheDocument();
    // Every style card comes before the Fine-tune section.
    for (const card of cards) {
      expect(card.compareDocumentPosition(fineTuneButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('marks the style that is in use', () => {
    show();
    expect(screen.getByRole('button', { name: /Chase/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Drone/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('a preset card applies the preset and switches to the follow view', () => {
    show((r) => { r.autoCam = { ...r.autoCam!, mode: 'navigation' }; });
    fireEvent.click(screen.getByRole('button', { name: /Drone/ }));
    expect(stored().autoCam).toMatchObject({ mode: 'cinematic', preset: 'drone', pitch: AUTO_CAM_PRESETS.drone.pitch });
  });

  it('the navigation card switches to the navigation view', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(FOLLOW_CAMERA_TERMS.navigationView.title) }));
    expect(stored().autoCam?.mode).toBe('navigation');
  });

  it('keeps Fine-tune closed at first, with no slider in sight', () => {
    show();
    expect(fineTuneButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('opens Fine-tune with sliders that show words at their ends and no numbers', () => {
    const { container } = show();
    fireEvent.click(fineTuneButton());
    const region = screen.getByRole('region', { name: 'Fine-tune' });

    const sliders = within(region).getAllByRole('slider');
    expect(sliders).toHaveLength(7);
    const endLabels = region.querySelectorAll('[data-slot="slider-end-labels"]');
    expect(endLabels).toHaveLength(7);
    expect(region.textContent).toContain('Close');
    expect(region.textContent).toContain('Calm');
    expect(region.textContent).toContain('Lively');

    // No readout like "60°", "30 %", "600 m" or "1.2 km" anywhere in the panel.
    expect(container.textContent).not.toMatch(/\d\s?(%|°|km|m)(\s|$)/);
  });

  it('shows the sliders of the view in use', () => {
    show();
    fireEvent.click(fineTuneButton());
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.queryByText('Look ahead')).not.toBeInTheDocument();

    act(() => { useProjectStore.getState().updateItem('r1', { autoCam: { ...stored().autoCam!, mode: 'navigation' } }); });
    expect(screen.getByText('Look ahead')).toBeInTheDocument();
    expect(screen.getByText('Zoom')).toBeInTheDocument();
    expect(screen.queryByText('Distance')).not.toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(5);
  });

  it('keeps the button that turns Follow camera off', () => {
    show();
    expect(screen.getByRole('button', { name: `Turn off ${ROUTE_TERMS.followCamera}` })).toBeInTheDocument();
  });
});
