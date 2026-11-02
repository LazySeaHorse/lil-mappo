import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveClickTarget } from './mapUtils';
import { useProjectStore } from '@/store/useProjectStore';
import { RouteAddDropdown } from '@/components/Toolbar/RouteAddDropdown';
import { AnnotationAddDropdown } from '@/annotations/toolbar/AnnotationAddDropdown';
import { AnnotationInspector } from '@/annotations/inspector/AnnotationInspector';
import type { CalloutItem } from '@/store/types';

vi.mock('react-secure-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    data: { tier: 'cartographer' },
  }),
}));

vi.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Map Point Picking Architecture', () => {
  beforeEach(() => {
    useProjectStore.setState({
      items: {},
      itemOrder: [],
      selectedItemId: null,
      selectedKeyframeId: null,
      activePicker: null,
    });
    vi.clearAllMocks();
  });

  describe('resolveClickTarget', () => {
    const clickAt = { lngLat: { lng: -73.98513, lat: 40.748817 }, point: { x: 400, y: 300 } };

    interface FakeFeature {
      geometry: GeoJSON.Geometry;
      properties?: Record<string, unknown> | null;
    }
    const label = (x: number, y: number, properties: Record<string, unknown> | null): FakeFeature => ({
      geometry: { type: 'Point', coordinates: [x, y] },
      properties,
    });

    /** A map whose labels sit at the given pixels (`project` maps a coordinate to the same pixel). */
    function fakeMap(features: FakeFeature[], layerIds = ['settlement-major-label', 'poi-label', 'road-label']) {
      const queryRenderedFeatures = vi.fn(() => features);
      const map = {
        queryRenderedFeatures,
        project: ([x, y]: [number, number]) => ({ x, y }),
        getStyle: () => ({ version: 8, sources: {}, layers: layerIds.map((id) => ({ id, type: 'symbol' })) }),
      };
      return { map: map as unknown as NonNullable<Parameters<typeof resolveClickTarget>[0]['target']>, queryRenderedFeatures };
    }

    beforeEach(() => {
      useProjectStore.setState({ mapStyle: 'streets' });
    });

    it('resolves raw coordinates when the click has no map to ask', () => {
      const result = resolveClickTarget({ lngLat: { lng: -73.98513, lat: 40.748817 } });
      expect(result.lngLat).toEqual([-73.98513, 40.748817]);
      expect(result.name).toBe('-73.98513, 40.74882');
    });

    it('names the point after the nearest place label, keeping the exact clicked point', () => {
      const { map, queryRenderedFeatures } = fakeMap([
        label(430, 300, { name: 'Far Town', name_en: 'Far Town' }),
        label(405, 304, { name: 'Ville', name_en: 'Town' }),
      ]);
      const result = resolveClickTarget({ ...clickAt, target: map });
      expect(result).toEqual({ lngLat: [-73.98513, 40.748817], name: 'Town' });
      // A box around the click, on the place and POI label layers only.
      expect(queryRenderedFeatures).toHaveBeenCalledWith([[expect.any(Number), expect.any(Number)], [expect.any(Number), expect.any(Number)]], {
        layers: ['settlement-major-label', 'poi-label'],
      });
    });

    it('uses the local name when a label has no English one', () => {
      const { map } = fakeMap([label(401, 301, { name: 'Zürich' })]);
      expect(resolveClickTarget({ ...clickAt, target: map }).name).toBe('Zürich');
    });

    it('ignores labels with no name, labels that are not points and labels beyond the radius', () => {
      const { map } = fakeMap([
        label(401, 300, null),
        label(402, 300, { name: '  ' }),
        label(403, 300, { class: 'park' }),
        { geometry: { type: 'LineString', coordinates: [[400, 300], [410, 300]] }, properties: { name: 'Main Street' } },
        label(480, 300, { name: 'Faraway' }),
      ]);
      expect(resolveClickTarget({ ...clickAt, target: map }).name).toBe('-73.98513, 40.74882');
    });

    it('does not query a style that has no place or POI label layers', () => {
      const { map, queryRenderedFeatures } = fakeMap([label(401, 300, { name: 'Town' })], ['road-label', 'water']);
      expect(resolveClickTarget({ ...clickAt, target: map }).name).toBe('-73.98513, 40.74882');
      expect(queryRenderedFeatures).not.toHaveBeenCalled();
    });

    it('asks the basemap featuresets of Standard, whose layers cannot be queried by id', () => {
      useProjectStore.setState({ mapStyle: 'standard' });
      const { map, queryRenderedFeatures } = fakeMap([label(398, 301, { name: 'Midtown' })]);
      expect(resolveClickTarget({ ...clickAt, target: map }).name).toBe('Midtown');
      expect(queryRenderedFeatures).toHaveBeenCalledWith(expect.anything(), { target: { featuresetId: 'place-labels', importId: 'basemap' } });
      expect(queryRenderedFeatures).toHaveBeenCalledWith(expect.anything(), { target: { featuresetId: 'poi', importId: 'basemap' } });
    });

    it('falls back to the coordinates when the map cannot be queried', () => {
      const { map, queryRenderedFeatures } = fakeMap([]);
      queryRenderedFeatures.mockImplementation(() => {
        throw new Error('Style is not done loading');
      });
      const result = resolveClickTarget({ ...clickAt, target: map });
      expect(result).toEqual({ lngLat: [-73.98513, 40.748817], name: '-73.98513, 40.74882' });
    });
  });

  describe('RouteAddDropdown picker lifecycle', () => {
    it('registers activePicker on pick start and updates local state on callback', () => {
      const { unmount } = render(
        <RouteAddDropdown
          isOpen={true}
          onOpenChange={() => {}}
          onImportClick={() => {}}
        />
      );

      const pickButtons = screen.getAllByTitle(/Pick on the map/i);
      expect(pickButtons.length).toBeGreaterThanOrEqual(2);

      // Click start pick button
      act(() => {
        fireEvent.click(pickButtons[0]);
      });

      const session = useProjectStore.getState().activePicker;
      expect(session).not.toBeNull();
      expect(session?.id).toBe('route-start');

      // Dispatch map click directly to activePicker
      act(() => {
        session?.onPick({ lngLat: [10.5, 20.5], name: 'Start City' });
      });

      // Unmounting should clean up active picker if still matching
      act(() => {
        unmount();
      });
      expect(useProjectStore.getState().activePicker).toBeNull();
    });

    it('cleans up active picker on unmount without leaking', () => {
      const { unmount } = render(
        <RouteAddDropdown
          isOpen={true}
          onOpenChange={() => {}}
          onImportClick={() => {}}
        />
      );

      const pickButtons = screen.getAllByTitle(/Pick on the map/i);
      act(() => {
        fireEvent.click(pickButtons[1]); // Pick End point
      });

      expect(useProjectStore.getState().activePicker?.id).toBe('route-end');

      act(() => {
        unmount();
      });
      expect(useProjectStore.getState().activePicker).toBeNull();
    });
  });

  describe('AnnotationAddDropdown picker lifecycle', () => {
    it('starts picking callout and receives location update onPick', () => {
      const { unmount } = render(
        <AnnotationAddDropdown
          isOpen={true}
          onOpenChange={() => {}}
        />
      );

      const pickButton = screen.getByTitle(/Pick on the map/i);
      act(() => {
        fireEvent.click(pickButton);
      });

      const session = useProjectStore.getState().activePicker;
      expect(session?.id).toBe('callout-new');

      act(() => {
        session?.onPick({ lngLat: [13.405, 52.52], name: 'Berlin' });
      });

      act(() => {
        unmount();
      });
      expect(useProjectStore.getState().activePicker).toBeNull();
    });
  });

  describe('AnnotationInspector picker lifecycle', () => {
    it('updates existing callout item in store when pick callback fires', () => {
      const callout: CalloutItem = {
        id: 'callout-1',
        kind: 'callout',
        styleId: 'leader-line',
        styleVersion: 1,
        content: { title: 'Original Title' },
        binding: { kind: 'geographic', lngLat: [0, 0], altitude: 0 },
        offset: [0, 0],
        anchor: 'bottom',
        startTime: 0,
        endTime: 5,
        transition: { enter: 'fade', exit: 'fade', enterDuration: 0.3, exitDuration: 0.3 },
        connector: { visible: true, style: 'dashed', color: '#94a3b8', width: 2, endDot: true, endDotRadius: 3 },
        opacity: 1,
        scale: 1,
        sizeMode: 'screen',
        referenceZoom: 12,
        settings: {},
        linkTitleToLocation: true,
        locationName: '',
      };

      useProjectStore.setState({
        items: { 'callout-1': callout },
        selectedItemId: 'callout-1',
      });

      const { unmount } = render(<AnnotationInspector item={callout} />);

      const pickButton = screen.getByTitle(/Pick on the map/i);
      act(() => {
        fireEvent.click(pickButton);
      });

      const session = useProjectStore.getState().activePicker;
      expect(session?.id).toBe('callout-callout-1');

      // Trigger pick result
      act(() => {
        session?.onPick({ lngLat: [4.9, 52.37], name: '4.90000, 52.37000' });
      });

      // Check item was updated in store; a click names no place, so the title stays
      const updated = useProjectStore.getState().items['callout-1'] as CalloutItem;
      expect((updated.binding as { lngLat: [number, number] }).lngLat).toEqual([4.9, 52.37]);
      expect(updated.content.title).toBe('Original Title');

      act(() => {
        unmount();
      });
      expect(useProjectStore.getState().activePicker).toBeNull();
    });
  });
});
