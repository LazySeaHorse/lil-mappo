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

  it('shows the two camera modes first, each with a picture and a short description', () => {
    const { container } = show();
    const modes = [FOLLOW_CAMERA_TERMS.followView, FOLLOW_CAMERA_TERMS.navigationView];
    const cards = modes.map(({ title }) => screen.getByRole('button', { name: new RegExp(title) }));
    for (const { description } of modes) expect(screen.getByText(description)).toBeInTheDocument();
    for (const card of cards) expect(card.querySelector('svg')).not.toBeNull();
    // The mode cards come before the preset cards and before the Fine-tune section.
    const chase = screen.getByRole('button', { name: /Chase/ });
    for (const card of cards) {
      expect(card.compareDocumentPosition(chase) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(card.compareDocumentPosition(fineTuneButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(container.querySelectorAll('[aria-pressed]').length).toBeGreaterThanOrEqual(2);
  });

  it('marks the mode in use', () => {
    show();
    const follow = screen.getByRole('button', { name: new RegExp(FOLLOW_CAMERA_TERMS.followView.title) });
    const navigation = screen.getByRole('button', { name: new RegExp(FOLLOW_CAMERA_TERMS.navigationView.title) });
    expect(follow).toHaveAttribute('aria-pressed', 'true');
    expect(navigation).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(navigation);
    expect(navigation).toHaveAttribute('aria-pressed', 'true');
    expect(follow).toHaveAttribute('aria-pressed', 'false');
  });

  it('the Follow view card switches back to the follow view and keeps the follow settings', () => {
    show((r) => { r.autoCam = { ...r.autoCam!, preset: 'drone', mode: 'navigation', distance: 777 }; });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(FOLLOW_CAMERA_TERMS.followView.title) }));
    expect(stored().autoCam).toMatchObject({ mode: 'cinematic', preset: 'drone', distance: 777 });
  });

  it('shows the four presets, each with a description, in the follow view only', () => {
    show();
    for (const key of ['chase', 'drone', 'reveal', 'topdown'] as const) {
      expect(screen.getByRole('button', { name: new RegExp(AUTO_CAM_PRESETS[key].label) })).toBeInTheDocument();
      expect(screen.getByText(AUTO_CAM_PRESETS[key].description)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: new RegExp(FOLLOW_CAMERA_TERMS.navigationView.title) }));
    expect(screen.queryByRole('button', { name: /Chase/ })).not.toBeInTheDocument();
  });

  it('marks the preset that is in use', () => {
    show();
    expect(screen.getByRole('button', { name: /Chase/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Drone/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('a preset card applies the preset', () => {
    show();
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
