import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoutePathSection } from './RoutePathSection';
import { useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { createTransientState } from '@/store/slices/mapEnvironmentSlice';
import { createEndpointRouteItem, createWalkRouteItem, wrapGeometry } from '@/store/itemFactories';
import type { RouteItem } from '@/store/types';
import { ROUTE_PATH_TERMS } from '@/lib/terms';
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
const endField = () => screen.getAllByPlaceholderText('Search address or coordinates')[1];

describe('RoutePathSection', () => {
  beforeEach(() => {
    useProjectStore.setState({ ...createProject(), ...createTransientState() });
    vi.mocked(getDirections).mockReset().mockResolvedValue({
      geometry: { type: 'LineString', coordinates: [[-74, 40.7], [-73.95, 40.75], [-73.9, 40.8]] }, distance: 1, duration: 1,
    });
  });

  describe('open section', () => {
    it('shows the planner at once, with no Edit button and no summary line', () => {
      show(car());
      expect(button('Edit')).not.toBeInTheDocument();
      expect(button('Close')).not.toBeInTheDocument();
      expect(screen.queryByTestId('route-summary')).not.toBeInTheDocument();
      expect(screen.getAllByRole('radio')).toHaveLength(3);
      expect(screen.getByText('Start')).toBeInTheDocument();
      expect(endField()).toHaveValue('Central Park');
      expect(state().routeDraft?.routeId).toBe('r1');
    });

    it('shows the point list for a walk', () => {
      show(walk());
      expect(screen.getAllByTitle('Remove point')).toHaveLength(3);
      expect(state().routeDraft?.calculation.mode).toBe('walk');
    });

    it('shows the fields for a flight', () => {
      const route = car();
      if (route.calculation) route.calculation.mode = 'flight';
      show(route);
      expect(screen.getByText('Departure')).toBeInTheDocument();
      expect(screen.getByText('Arrival')).toBeInTheDocument();
    });

    it('tells that an imported path is imported and offers the planner', () => {
      const imported = car();
      delete imported.calculation;
      show(imported);
      expect(screen.getByText(ROUTE_PATH_TERMS.importedHint)).toBeInTheDocument();
      expect(screen.getAllByRole('radio')).toHaveLength(3);
      expect(button('Apply')).not.toBeInTheDocument();
    });
  });

  describe('draft', () => {
    it('keeps the store unchanged while the user edits', () => {
      show(car());
      const before = state().items;
      act(() => { state().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endName: 'Times Square', endPoint: [-73.98, 40.76] })); });
      expect(state().items).toBe(before);
      expect(stored().calculation).toMatchObject({ endName: 'Central Park' });
    });

    it('shows Apply and Cancel only when the draft differs from the saved route', () => {
      show(car());
      expect(button('Apply')).not.toBeInTheDocument();
      expect(button('Cancel')).not.toBeInTheDocument();

      act(() => { state().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endPoint: [-73.8, 40.9] })); });
      expect(button('Apply')).toBeInTheDocument();
      expect(button('Cancel')).toBeInTheDocument();

      act(() => { state().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endPoint: [-73.9, 40.8] })); });
      expect(button('Apply')).not.toBeInTheDocument();
      expect(button('Cancel')).not.toBeInTheDocument();
    });

    it('a mode switch is part of the draft', () => {
      show(car());
      const before = state().items;
      fireEvent.click(screen.getByRole('radio', { name: /walk/i }));

      expect(state().routeDraft!.calculation.mode).toBe('walk');
      expect(state().items).toBe(before);
      expect(stored().calculation?.mode).toBe('car');
      expect(button('Apply')).toBeInTheDocument();
      expect(button('Cancel')).toBeInTheDocument();
    });

    it('Cancel resets the draft to the saved route, keeps the planner and clears the preview', () => {
      show(car());
      fireEvent.click(screen.getByRole('radio', { name: /flight/i }));
      act(() => { state().setPreviewRoute(line); });
      const before = state().items;

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(state().routeDraft?.calculation).toMatchObject({ mode: 'car', endName: 'Central Park' });
      expect(state().previewRoute).toBeNull();
      expect(state().items).toBe(before);
      expect(screen.getAllByRole('radio')).toHaveLength(3);
      expect(screen.getByRole('radio', { name: /car/i })).toBeChecked();
      expect(button('Apply')).not.toBeInTheDocument();
      expect(button('Cancel')).not.toBeInTheDocument();
    });

    it('Apply writes the mode, the points and the path as one undo step', async () => {
      show(car());
      useProjectStore.temporal.getState().clear();
      act(() => { state().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endName: 'Times Square', endPoint: [-73.98, 40.76] })); });
      fireEvent.click(screen.getByRole('radio', { name: /flight/i }));

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply' })); });

      expect(stored().calculation).toMatchObject({ mode: 'flight', endName: 'Times Square', endPoint: [-73.98, 40.76] });
      // The planner stays and now shows the applied route as a clean draft.
      expect(screen.getAllByRole('radio')).toHaveLength(3);
      expect(state().routeDraft?.calculation).toMatchObject({ mode: 'flight', endName: 'Times Square' });
      expect(button('Apply')).not.toBeInTheDocument();
      expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);

      act(() => { useProjectStore.temporal.getState().undo(); });
      expect(stored().calculation).toMatchObject({ mode: 'car', endName: 'Central Park' });
      // Undo moves the draft back to the saved route.
      expect(state().routeDraft?.calculation).toMatchObject({ mode: 'car', endName: 'Central Park' });
      expect(button('Apply')).not.toBeInTheDocument();
    });

    it('Apply keeps the draft when the path cannot be computed', async () => {
      vi.mocked(getDirections).mockRejectedValue(new Error('no route'));
      show(car());
      act(() => { state().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endPoint: [10, 10] })); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply' })); });

      expect(stored().calculation).toMatchObject({ endPoint: [-73.9, 40.8] });
      expect(state().routeDraft?.calculation).toMatchObject({ endPoint: [10, 10] });
      expect(button('Apply')).toBeInTheDocument();
    });

    it('drops the draft when the section goes away', () => {
      const { unmount } = show(car());
      expect(state().routeDraft).not.toBeNull();
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
      expect(state().routeDraft?.routeId).toBe('r1');

      act(() => { state().selectItem('w1'); });
      expect(state().routeDraft?.routeId).toBe('w1');
      expect(state().routeDraft?.calculation.mode).toBe('walk');
    });
  });
});
