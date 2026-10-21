import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { clearHistory, getHistoryEntries, undo } from '@/store/history';
import { createHubRoutes, createdRoutesLabel } from './hubRoutes';

const line = (a: number): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [a, a]] } }],
});
const input = (name: string, a: number) => ({
  mode: 'flight' as const, start: [0, 1] as [number, number], end: [a, a] as [number, number],
  startName: 'London', endName: name, geojson: line(a),
});

describe('createHubRoutes', () => {
  beforeEach(() => {
    useProjectStore.setState({ items: {}, itemOrder: [] });
    clearHistory();
  });

  it('adds one named route per spoke, staggered from the start time', () => {
    const items = createHubRoutes([input('Paris', 2), input('Berlin', 3), input('Rome', 4)], {
      timing: 'staggered', gap: 2, startTime: 10, pro: false,
    });
    const store = useProjectStore.getState();
    expect(store.itemOrder).toEqual(items.map((i) => i.id));
    expect(items.map((i) => i.name)).toEqual(['London → Paris', 'London → Berlin', 'London → Rome']);
    expect(items.map((i) => i.startTime)).toEqual([10, 12, 14]);
    expect(items.every((i) => i.endTime - i.startTime === 5)).toBe(true);
  });

  it('is one undo step with one label', () => {
    createHubRoutes([input('Paris', 2), input('Berlin', 3)], { timing: 'together', gap: 1, startTime: 0, pro: false });
    const { past } = getHistoryEntries();
    expect(past).toHaveLength(1);
    expect(past[0].label).toBe('Created 2 routes');
    undo();
    expect(useProjectStore.getState().itemOrder).toEqual([]);
  });

  it('labels the step by the count', () => {
    expect(createdRoutesLabel(3)).toBe('Created 3 routes');
    expect(createdRoutesLabel(1)).toBe('Created 1 route');
  });
});
