import { describe, it, expect, vi } from 'vitest';
import '@/annotations/styles';
import { compositeAnnotations } from './renderAnnotation';
import type { CalloutItem } from '@/store/types';
import type { Map as MapboxMap } from 'mapbox-gl';

describe('renderAnnotation and compositeAnnotations', () => {
  const createMockCtx = () => {
    return {
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      setLineDash: vi.fn(),
      measureText: vi.fn(() => ({ width: 100 })),
      fillText: vi.fn(),
      roundRect: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      globalAlpha: 1,
      strokeStyle: '#ffffff',
      fillStyle: '#ffffff',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;
  };

  const createMockMap = (projectX = 200, projectY = 300) => {
    return {
      getZoom: vi.fn(() => 14),
      project: vi.fn(() => ({ x: projectX, y: projectY })),
    } as unknown as MapboxMap;
  };

  it('renders standard-card using screen pixels for altitude offset without zoom drift', () => {
    const ctx = createMockCtx();
    const map = createMockMap(200, 300);

    const callout: CalloutItem = {
      id: 'c1',
      kind: 'callout',
      styleId: 'standard-card',
      styleVersion: 1,
      content: { title: 'Test Pin' },
      binding: {
        kind: 'geographic',
        lngLat: [10, 20],
        altitude: 48, // 48px height
      },
      offset: [0, 0],
      anchor: 'bottom',
      startTime: 0,
      endTime: 10,
      transition: {
        enter: 'none',
        exit: 'none',
        enterDuration: 0,
        exitDuration: 0,
      },
      connector: {
        visible: true,
        style: 'solid',
        color: '#ffffff',
        width: 2,
        endDot: true,
        endDotRadius: 3,
      },
      opacity: 1,
      scale: 1,
      settings: {},
    };

    compositeAnnotations(map, ctx, { c1: callout }, ['c1'], 5);

    // Connector line should move from card anchor (200, 300 - 48 = 252) to ground coordinate (200, 300)
    expect(ctx.moveTo).toHaveBeenCalledWith(200, 252);
    expect(ctx.lineTo).toHaveBeenCalledWith(200, 300);
    // End dot should be placed at ground position
    expect(ctx.arc).toHaveBeenCalledWith(200, 300, 3, 0, Math.PI * 2);
  });

  it('maintains the exact same screen pixel offset regardless of map zoom level', () => {
    const ctxZoom10 = createMockCtx();
    const mapZoom10 = {
      getZoom: vi.fn(() => 10),
      project: vi.fn(() => ({ x: 150, y: 250 })),
    } as unknown as MapboxMap;

    const ctxZoom18 = createMockCtx();
    const mapZoom18 = {
      getZoom: vi.fn(() => 18),
      project: vi.fn(() => ({ x: 150, y: 250 })),
    } as unknown as MapboxMap;

    const callout: CalloutItem = {
      id: 'c2',
      kind: 'callout',
      styleId: 'standard-card',
      styleVersion: 1,
      content: { title: 'No Drift' },
      binding: {
        kind: 'geographic',
        lngLat: [10, 20],
        altitude: 60, // 60px height
      },
      offset: [0, 0],
      anchor: 'bottom',
      startTime: 0,
      endTime: 10,
      transition: { enter: 'none', exit: 'none', enterDuration: 0, exitDuration: 0 },
      connector: {
        visible: true,
        style: 'solid',
        color: '#ffffff',
        width: 2,
        endDot: false,
        endDotRadius: 0,
      },
      opacity: 1,
      scale: 1,
      settings: {},
    };

    compositeAnnotations(mapZoom10, ctxZoom10, { c2: callout }, ['c2'], 5);
    compositeAnnotations(mapZoom18, ctxZoom18, { c2: callout }, ['c2'], 5);

    // At zoom 10: anchorY is 250 - 60 = 190
    expect(ctxZoom10.moveTo).toHaveBeenCalledWith(150, 190);
    expect(ctxZoom10.lineTo).toHaveBeenCalledWith(150, 250);

    // At zoom 18: anchorY is still 250 - 60 = 190 (zero zoom drift!)
    expect(ctxZoom18.moveTo).toHaveBeenCalledWith(150, 190);
    expect(ctxZoom18.lineTo).toHaveBeenCalledWith(150, 250);
  });

  it('forces altitude offset to 0 when style does not support altitude', () => {
    const ctx = createMockCtx();
    const map = createMockMap(100, 100);

    const rippleCallout: CalloutItem = {
      id: 'r1',
      kind: 'callout',
      styleId: 'ripple-marker',
      styleVersion: 1,
      content: { title: 'Ripple Ground' },
      binding: {
        kind: 'geographic',
        lngLat: [5, 5],
        altitude: 80, // Even if legacy data had altitude > 0
      },
      offset: [0, 0],
      anchor: 'center',
      startTime: 0,
      endTime: 10,
      transition: { enter: 'none', exit: 'none', enterDuration: 0, exitDuration: 0 },
      connector: {
        visible: true,
        style: 'solid',
        color: '#ffffff',
        width: 2,
        endDot: false,
        endDotRadius: 0,
      },
      opacity: 1,
      scale: 1,
      settings: {},
    };

    compositeAnnotations(map, ctx, { r1: rippleCallout }, ['r1'], 5);

    // No connector line should be drawn for ripple-marker because effectiveAltitude is 0
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });
});
