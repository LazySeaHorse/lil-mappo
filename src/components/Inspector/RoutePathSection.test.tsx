import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoutePathSection } from './RoutePathSection';
import { useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { createTransientState } from '@/store/slices/mapEnvironmentSlice';
import { createEndpointRouteItem, createWalkRouteItem, wrapGeometry } from '@/store/itemFactories';
import type { RouteItem } from '@/store/types';
import { getDirections } from '@/services/directions';

vi.mock('@mapbox/search-js-core', () => ({
  SearchBoxCore: class {},
  SearchSession: class { suggest = vi.fn(); retrieve = vi.fn(); },
}));
vi.mock('@/services/directions', () => ({ getDirections: vi.fn() }));
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));

const LiveRoute = ({ id }: { id: string }) => {
  const item = useProjectStore((s) => s.items[id]) as RouteItem | undefined;
  return item ? <RoutePathSection key={item.id} item={item} /> : null;
};

const line = wrapGeometry({ type: 'LineString', coordinates: [[-74, 40.7], [-73.9, 40.8]] });
const car = () => createEndpointRouteItem({
  id: 'r1', mode: 'car', name: 'Drive', startTime: 0, geojson: line,
  start: [-74, 40.7], end: [-73.9, 40.8], startName: 'Brooklyn Bridge', endName: 'Central Park',
});
const walk = () => createWalkRouteItem({ id: 'w1', name: 'Stroll', startTime: 0, points: [[0, 0.1], [0, 0.2], [0, 0.3]] });

const state = () => useProjectStore.getState();
const stored = (id = 'r1') => state().items[id] as RouteItem;
const show = (route: RouteItem) => {
  state().addItem(route);
  state().selectItem(route.id);
  return render(<LiveRoute id={route.id} />);
};
const button = (name: string) => screen.queryByRole('button', { name });
const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
const summary = () => screen.getByTestId('route-summary').textContent;

describe('RoutePathSection', () => {
  beforeEach(() => {
    useProjectStore.setState({ ...createProject(), ...createTransientState() });
    vi.mocked(getDirections).mockReset().mockResolvedValue({
      geometry: { type: 'LineString', coordinates: [[-74, 40.7], [-73.95, 40.75], [-73.9, 40.8]] }, distance: 1, duration: 1,
    });
  });

  describe('summary', () => {
    it('is closed at first and shows the mode and the place names', () => {
      show(car());
      expect(summary()).toBe('Car · Brooklyn Bridge → Central Park');
      expect(button('Edit')).toBeInTheDocument();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      expect(state().routeDraft).toBeNull();
    });

    it('falls back to coordinates when a place has no name', () => {
      const route = car();
      if (route.calculation?.mode === 'car') route.calculation.startName = '';
      show(route);
      expect(summary()).toBe('Car · -74.00000, 40.70000 → Central Park');
    });

    it('shows point count and distance for a walk', () => {
      show(walk());
      expect(summary()).toMatch(/^Walk · 3 points · \d+(\.\d)? km$/);
    });
  });

  describe('draft', () => {
    it('Edit opens the planner and keeps the store unchanged while the user edits', () => {
      show(car());
      const before = state().items;
      edit();
      expect(screen.getAllByRole('radio')).toHaveLength(3);

      act(() => { state().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endName: 'Times Square', endPoint: [-73.98, 40.76] })); });
      expect(state().items).toBe(before);
      expect(summary()).toBe('Car · Brooklyn Bridge → Central Park');
    });

    it('shows Apply and Cancel only when the draft differs from the saved route', () => {
      show(car());
      edit();
      expect(button('Apply')).not.toBeInTheDocument();
      expect(button('Cancel')).not.toBeInTheDocument();

      act(() => { state().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endPoint: [-73.8, 40.9] })); });
      expect(button('Apply')).toBeInTheDocument();
      expect(button('Cancel')).toBeInTheDocument();

      act(() => { state().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endPoint: [-73.9, 40.8] })); });
      expect(button('Apply')).not.toBeInTheDocument();
      expect(button('Cancel')).not.toBeInTheDocument();
    });

    it('closes an unchanged editor with Close', () => {
      show(car());
      edit();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(state().routeDraft).toBeNull();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      expect(button('Edit')).toBeInTheDocument();
    });

    it('a mode switch is part of the draft', () => {
      show(car());
      edit();
      const before = state().items;
      fireEvent.click(screen.getByRole('radio', { name: /walk/i }));

      expect(state().routeDraft!.calculation.mode).toBe('walk');
      expect(state().items).toBe(before);
      expect(summary()).toMatch(/^Car/);
      expect(button('Apply')).toBeInTheDocument();
      expect(button('Cancel')).toBeInTheDocument();
    });

    it('Cancel drops the draft, closes the editor and clears the preview', () => {
      show(car());
      edit();
      fireEvent.click(screen.getByRole('radio', { name: /flight/i }));
      act(() => { state().setPreviewRoute(line); });
      const before = state().items;

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(state().routeDraft).toBeNull();
      expect(state().previewRoute).toBeNull();
      expect(state().items).toBe(before);
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      expect(button('Edit')).toBeInTheDocument();
    });

    it('Apply writes the mode, the points and the path as one undo step', async () => {
      show(car());
      useProjectStore.temporal.getState().clear();
      edit();
      act(() => { state().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endName: 'Times Square', endPoint: [-73.98, 40.76] })); });
      fireEvent.click(screen.getByRole('radio', { name: /flight/i }));

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply' })); });

      expect(stored().calculation).toMatchObject({ mode: 'flight', endName: 'Times Square', endPoint: [-73.98, 40.76] });
      expect(summary()).toBe('Flight · Brooklyn Bridge → Times Square');
      expect(state().routeDraft).toBeNull();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);

      act(() => { useProjectStore.temporal.getState().undo(); });
      expect(stored().calculation).toMatchObject({ mode: 'car', endName: 'Central Park' });
    });

    it('Apply keeps the draft when the path cannot be computed', async () => {
      vi.mocked(getDirections).mockRejectedValue(new Error('no route'));
      show(car());
      edit();
      act(() => { state().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endPoint: [10, 10] })); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply' })); });

      expect(stored().calculation).toMatchObject({ endPoint: [-73.9, 40.8] });
      expect(state().routeDraft).not.toBeNull();
      expect(button('Apply')).toBeInTheDocument();
    });

    it('drops the draft when the section goes away', () => {
      const { unmount } = show(car());
      edit();
      unmount();
      expect(state().routeDraft).toBeNull();
    });

    it('does not carry a draft to another route', () => {
      const Selected = () => {
        const id = useProjectStore((st) => st.selectedItemId) as string;
        const item = useProjectStore((st) => st.items[id]) as RouteItem;
        return <RoutePathSection key={item.id} item={item} />;
      };
      state().addItem(walk());
      state().addItem(car());
      state().selectItem('r1');
      render(<Selected />);
      edit();
      expect(state().routeDraft?.routeId).toBe('r1');

      act(() => { state().selectItem('w1'); });
      expect(state().routeDraft).toBeNull();
      expect(button('Edit')).toBeInTheDocument();
    });
  });
});
