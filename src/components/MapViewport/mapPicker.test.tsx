import React from 'react';
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
    it('resolves raw coordinates when no search feature is hit', () => {
      const clickEvent = {
        lngLat: { lng: -73.98513, lat: 40.748817 },
      };

      const result = resolveClickTarget(clickEvent, 'Start point');
      expect(result.lngLat).toEqual([-73.98513, 40.748817]);
      expect(result.name).toBe('-73.98513, 40.74882');
    });

    it('resolves feature coordinates and name from search results', () => {
      const clickEvent = {
        lngLat: { lng: 0, lat: 0 },
        features: [
          {
            layer: { id: 'search-results-circles' },
            geometry: { type: 'Point' as const, coordinates: [2.3522, 48.8566] },
            properties: { name: 'Paris, France' },
          },
        ],
      };

      const result = resolveClickTarget(clickEvent, 'Destination');
      expect(result.lngLat).toEqual([2.3522, 48.8566]);
      expect(result.name).toBe('Paris');
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

      const pickButtons = screen.getAllByTitle(/Pick on Map/i);
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

      const pickButtons = screen.getAllByTitle(/Pick on Map/i);
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

      const pickButton = screen.getByTitle(/Pick on Map/i);
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
        styleId: 'standard-card',
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
        settings: {},
        linkTitleToLocation: true,
      };

      useProjectStore.setState({
        items: { 'callout-1': callout },
        selectedItemId: 'callout-1',
      });

      const { unmount } = render(<AnnotationInspector item={callout} />);

      const pickButton = screen.getByTitle(/Pick on Map/i);
      act(() => {
        fireEvent.click(pickButton);
      });

      const session = useProjectStore.getState().activePicker;
      expect(session?.id).toBe('callout-callout-1');

      // Trigger pick result
      act(() => {
        session?.onPick({ lngLat: [4.9, 52.37], name: 'Amsterdam' });
      });

      // Check item was updated in store
      const updated = useProjectStore.getState().items['callout-1'] as CalloutItem;
      expect((updated.binding as { lngLat: [number, number] }).lngLat).toEqual([4.9, 52.37]);
      expect(updated.content.title).toBe('Amsterdam');

      act(() => {
        unmount();
      });
      expect(useProjectStore.getState().activePicker).toBeNull();
    });
  });
});
