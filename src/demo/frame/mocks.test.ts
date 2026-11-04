import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchBoxCore, SearchSession } from '@mapbox/search-js-core';
import type { SearchBoxOptions, SearchBoxRetrieveResponse, SearchBoxSuggestion, SearchBoxSuggestionResponse } from '@mapbox/search-js-core';
import { searchBoundary } from '@/services/nominatim';
import { getDirections } from '@/services/directions';
import { retrieveForView, suggestForView } from '@/services/locationSearch';
import { searchPlaces } from '@/agent/geocode';
import { clearMocks, installFetchMocks, mockBoundarySearch, mockDirections, mockPlaceSearch } from './mocks';

const france: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[2, 46], [2, 47], [3, 47], [3, 46], [2, 46]]] };

describe('demo fetch mocks', () => {
  let network: ReturnType<typeof vi.fn>;
  let uninstall: () => void;
  beforeEach(() => {
    network = vi.fn(async () => new Response('tile'));
    vi.stubGlobal('fetch', network);
    uninstall = installFetchMocks();
  });
  afterEach(() => {
    uninstall();
    clearMocks();
    vi.unstubAllGlobals();
  });

  it('answers a boundary search with the registered outline, name and flag', async () => {
    mockBoundarySearch('France', [{ displayName: 'France', geometry: france, countryCode: 'fr' }]);
    const results = await searchBoundary('France');
    expect(results).toEqual([{ display_name: 'France', type: 'administrative', geojson: france, countryCode: 'fr' }]);
    // As the name is typed, its start already finds it.
    expect(await searchBoundary('Fra')).toHaveLength(1);
    expect(await searchBoundary('Spain')).toEqual([]);
    expect(network).not.toHaveBeenCalled();
  });

  it('answers driving directions along the registered path, or a straight line when none is registered', async () => {
    const straight = await getDirections([0, 0], [1, 1]);
    expect(straight.geometry.coordinates).toEqual([[0, 0], [1, 1]]);

    const path: GeoJSON.LineString = { type: 'LineString', coordinates: [[2.35, 48.85], [3, 48], [4.83, 45.76]] };
    mockDirections({ start: [2.35, 48.85], end: [4.83, 45.76], geometry: path, distance: 460_000, duration: 16_000 });
    const route = await getDirections([2.35, 48.85], [4.83, 45.76]);
    expect(route.geometry.coordinates[0]).toEqual([2.35, 48.85]);
    expect(route.geometry.coordinates[route.geometry.coordinates.length - 1]).toEqual([4.83, 45.76]);
    expect(route.distance).toBe(460_000);
    expect(network).not.toHaveBeenCalled();
  });

  it('answers directions between ends picked a pixel off the file’s points with the nearest registered path', async () => {
    const paris: GeoJSON.LineString = { type: 'LineString', coordinates: [[2.35, 48.85], [4.83, 45.76]] };
    const rome: GeoJSON.LineString = { type: 'LineString', coordinates: [[2.35, 48.85], [3.5, 47], [12.5, 41.9]] };
    mockDirections({ start: [2.35, 48.85], end: [4.83, 45.76], geometry: paris, distance: 1 });
    mockDirections({ start: [2.35, 48.85], end: [12.5, 41.9], geometry: rome, distance: 2 });
    const picked = await getDirections([2.3512, 48.8493], [12.5006, 41.8995]);
    expect(picked.geometry.coordinates).toEqual(rome.coordinates);
    expect(picked.distance).toBe(2);
  });

  it('answers ends picked on a whole-globe view, a quarter of a degree off, with the registered path, not a straight line', async () => {
    const road: GeoJSON.LineString = { type: 'LineString', coordinates: [[-111.89, 40.76], [-110.5, 41.1], [-109.47, 41.53]] };
    mockDirections({ start: [-111.89, 40.76], end: [-109.47, 41.53], geometry: road });
    const picked = await getDirections([-112.13, 40.55], [-109.21, 41.79]);
    expect(picked.geometry.coordinates).toEqual(road.coordinates);
  });

  it('answers Mapbox Search Box suggest and retrieve through search-js-core', async () => {
    mockPlaceSearch('Lyon', [{ name: 'Lyon', coordinates: [4.83, 45.76], placeFormatted: 'Auvergne-Rhône-Alpes, France' }]);
    // Typed as the app's location search types its session.
    const session = new SearchSession(new SearchBoxCore({ accessToken: 'pk.test' }), 0) as unknown as SearchSession<
      SearchBoxOptions, SearchBoxSuggestion, SearchBoxSuggestionResponse, SearchBoxRetrieveResponse
    >;
    const { suggestions } = await suggestForView(session, 'Lyon', { center: [2, 47] });
    expect(suggestions.map((s) => s.name)).toEqual(['Lyon']);
    const feature = await retrieveForView(session, suggestions[0], { center: [2, 47] });
    expect(feature?.geometry.coordinates).toEqual([4.83, 45.76]);
    expect(feature?.properties.name).toBe('Lyon');
    expect(network).not.toHaveBeenCalled();
  });

  it('answers the AI tools geocoding', async () => {
    mockPlaceSearch('Lyon', [{ name: 'Lyon', coordinates: [4.83, 45.76], placeFormatted: 'France' }]);
    const [first] = await searchPlaces('Lyon');
    expect(first).toMatchObject({ name: 'Lyon', fullName: 'Lyon, France', coordinates: [4.83, 45.76] });
  });

  it('keeps unregistered searches off the network and passes everything else through', async () => {
    expect(await searchBoundary('Atlantis')).toEqual([]);
    expect(await searchPlaces('Atlantis')).toEqual([]);
    expect(network).not.toHaveBeenCalled();

    const tile = await fetch('https://api.mapbox.com/v4/mapbox.satellite/1/0/0.webp');
    expect(await tile.text()).toBe('tile');
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('restores the network fetch on uninstall', () => {
    uninstall();
    expect(globalThis.fetch).toBe(network);
    uninstall = () => {};
  });
});
