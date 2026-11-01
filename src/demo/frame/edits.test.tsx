import { render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import InspectorPanel from '@/components/Inspector/InspectorPanel';
import { useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { DEFAULT_BOUNDARY_STYLE, createBoundaryItem } from '@/store/itemFactories';
import type { BoundaryItem } from '@/store/types';
import { showEdit } from './edits';
import { BOUNDARY_FIELDS } from './fields';
import { testContext } from './testContext';
import { FRANCE } from './testFixture';

vi.mock('@/components/Inspector/BoundarySearch', () => ({ BoundarySearch: () => null }));
vi.mock('@/components/MapViewport/runtime/flagImages', async (importActual) => ({
  ...(await importActual<typeof import('@/components/MapViewport/runtime/flagImages')>()),
  loadFlagSvg: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"/>'),
}));

const live = () => useProjectStore.getState().items.b1 as BoundaryItem;

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  useUiPreferencesStore.setState({ inspectorSections: {} });
  const item = createBoundaryItem({ id: 'b1', placeName: 'France', geojson: FRANCE, startTime: 0, countryCode: 'fr' });
  useProjectStore.setState({ items: { b1: item }, itemOrder: ['b1'], selectedItemId: 'b1', isInspectorOpen: true });
});
afterEach(() => vi.restoreAllMocks());

describe('showEdit on the boundary inspector', () => {
  const target = (style: Partial<BoundaryItem['style']>): BoundaryItem => ({ ...live(), style: { ...DEFAULT_BOUNDARY_STYLE, flagCode: 'fr', ...style } });

  it('types a colour that is not a swatch into the hex field', async () => {
    render(<InspectorPanel />);
    const outcome = await showEdit(testContext(), BOUNDARY_FIELDS, { path: 'style.strokeColor', value: '#123456' }, live, target({ strokeColor: '#123456' }));
    expect(outcome).toBe('shown');
    expect(live().style.strokeColor).toBe('#123456');
  });

  it('switches the fill to the flag and picks the country in the flag list', async () => {
    useProjectStore.setState({ items: { b1: { ...live(), style: { ...live().style, flagCode: null } } } });
    render(<InspectorPanel />);
    const goal = target({ fillMode: 'flag', flagCode: 'de' });
    const ctx = testContext();
    expect(await showEdit(ctx, BOUNDARY_FIELDS, { path: 'style.fillMode', value: 'flag' }, live, goal)).toBe('shown');
    expect(await showEdit(ctx, BOUNDARY_FIELDS, { path: 'style.flagCode', value: 'de' }, live, goal)).toBe('shown');
    expect(live().style).toMatchObject({ fillMode: 'flag', flagCode: 'de' });
  });

  it('opens a collapsed section first', async () => {
    useUiPreferencesStore.setState({ inspectorSections: { boundary: { animation: false } } });
    render(<InspectorPanel />);
    expect(await showEdit(testContext(), BOUNDARY_FIELDS, { path: 'style.animateStroke', value: false }, live, target({ animateStroke: false }))).toBe('shown');
    expect(live().style.animateStroke).toBe(false);
  });

  it('leaves to the final write what is already right, unmapped or not on screen', async () => {
    render(<InspectorPanel />);
    const ctx = testContext();
    const goal = target({ maskColor: '#ff0000' });
    expect(await showEdit(ctx, BOUNDARY_FIELDS, { path: 'style.strokeWidth', value: 5 }, live, goal)).toBe('already');
    expect(await showEdit(ctx, BOUNDARY_FIELDS, { path: 'placeName', value: 'Gaul' }, live, goal)).toBe('written');
    // The mask colour shows only while the mask is on.
    expect(await showEdit(ctx, BOUNDARY_FIELDS, { path: 'style.maskColor', value: '#ff0000' }, live, goal)).toBe('written');
    // Two easings under one label: nothing to change on screen.
    expect(await showEdit(ctx, BOUNDARY_FIELDS, { path: 'easing', value: 'easeInOutQuad' }, live, goal)).toBe('already');
  });
});
