import { describe, it, expect, vi } from 'vitest';
import '@/annotations/styles';
import { registerTestStyles, TEST_CARD_STYLE_ID, TEST_FLAT_STYLE_ID } from '../testStyles';
import { compositeAnnotations } from './renderAnnotation';
import type { CalloutItem } from '@/store/types';
import type { Map as MapboxMap } from 'mapbox-gl';

registerTestStyles();

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
      strokeText: vi.fn(),
      clip: vi.fn(),
      rect: vi.fn(),
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

  it('renders a card using screen pixels for altitude offset without zoom drift', () => {
    const ctx = createMockCtx();
    const map = createMockMap(200, 300);

    const callout: CalloutItem = {
      id: 'c1',
      kind: 'callout',
      styleId: TEST_CARD_STYLE_ID,
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
      sizeMode: 'screen',
      referenceZoom: 12,
      settings: {},
      linkTitleToLocation: false,
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
      styleId: TEST_CARD_STYLE_ID,
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
      sizeMode: 'screen',
      referenceZoom: 12,
      settings: {},
      linkTitleToLocation: false,
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
      styleId: TEST_FLAT_STYLE_ID,
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
      sizeMode: 'screen',
      referenceZoom: 12,
      settings: {},
      linkTitleToLocation: false,
    };

    compositeAnnotations(map, ctx, { r1: rippleCallout }, ['r1'], 5);

    // No connector line should be drawn for a flat marker because effectiveAltitude is 0
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });

  it('draws a leader line from the ground point to the offset origin without the generic connector', () => {
    const ctx = createMockCtx();
    const map = createMockMap(200, 300);

    const callout: CalloutItem = {
      id: 'l1',
      kind: 'callout',
      styleId: 'leader-line',
      styleVersion: 1,
      content: { title: 'Pier' },
      binding: { kind: 'geographic', lngLat: [5, 5], altitude: 0 },
      offset: [70, -90],
      anchor: 'bottom',
      startTime: 0,
      endTime: 10,
      transition: { enter: 'auto', exit: 'auto', enterDuration: 1.2, exitDuration: 0.5 },
      connector: { visible: true, style: 'solid', color: '#ffffff', width: 2, endDot: true, endDotRadius: 3 },
      opacity: 1,
      scale: 1,
      sizeMode: 'screen',
      referenceZoom: 12,
      settings: {},
      linkTitleToLocation: false,
    };

    compositeAnnotations(map, ctx, { l1: callout }, ['l1'], 5);

    // The scene is drawn at the elbow; its diagonal runs back to the ground point.
    expect(ctx.translate).toHaveBeenCalledWith(270, 210);
    expect(ctx.moveTo).toHaveBeenCalledWith(-70, 90);
    expect(ctx.lineTo).toHaveBeenCalledWith(0, 0);
    // No absolute-coordinate connector or end dot.
    expect(ctx.moveTo).not.toHaveBeenCalledWith(270, 210);
    expect(ctx.arc).not.toHaveBeenCalledWith(200, 300, 3, 0, Math.PI * 2);
    expect(ctx.fillText).toHaveBeenCalledWith('PIER', expect.any(Number), expect.any(Number), undefined);
  });

  it('starts a style-animated callout empty and finishes it as the entrance completes', () => {
    const map = createMockMap(200, 300);
    const callout: CalloutItem = {
      id: 'l2',
      kind: 'callout',
      styleId: 'leader-line',
      styleVersion: 1,
      content: { title: 'Pier' },
      binding: { kind: 'geographic', lngLat: [5, 5], altitude: 0 },
      offset: [70, -90],
      anchor: 'bottom',
      startTime: 0,
      endTime: 10,
      transition: { enter: 'auto', exit: 'auto', enterDuration: 1.2, exitDuration: 0.5 },
      connector: { visible: false, style: 'solid', color: '#ffffff', width: 2, endDot: true, endDotRadius: 3 },
      opacity: 1,
      scale: 1,
      sizeMode: 'screen',
      referenceZoom: 12,
      settings: {},
      linkTitleToLocation: false,
    };

    const start = createMockCtx();
    compositeAnnotations(map, start, { l2: callout }, ['l2'], 0);
    expect(start.stroke).not.toHaveBeenCalled();
    expect(start.fillText).not.toHaveBeenCalled();

    const done = createMockCtx();
    compositeAnnotations(map, done, { l2: callout }, ['l2'], 1.2);
    expect(done.stroke).toHaveBeenCalled();
    expect(done.fillText).toHaveBeenCalled();
  });

  describe('export scale', () => {
    const calloutAt = (overrides: Partial<CalloutItem> = {}): CalloutItem => ({
      id: 's1',
      kind: 'callout',
      styleId: TEST_CARD_STYLE_ID,
      styleVersion: 1,
      content: { title: 'Scale' },
      binding: { kind: 'geographic', lngLat: [10, 20], altitude: 40 },
      offset: [6, 0],
      anchor: 'bottom',
      startTime: 2,
      endTime: 8,
      transition: { enter: 'none', exit: 'none', enterDuration: 0, exitDuration: 0 },
      connector: { visible: true, style: 'solid', color: '#fff', width: 2, endDot: true, endDotRadius: 3 },
      opacity: 1,
      scale: 1,
      sizeMode: 'screen',
      referenceZoom: 12,
      settings: {},
      linkTitleToLocation: false,
      ...overrides,
    });

    /** A map showing `zoom`, projecting every point to (x, y). */
    const mapAt = (zoom: number, x: number, y: number) => ({
      getZoom: vi.fn(() => zoom),
      project: vi.fn(() => ({ x, y })),
    }) as unknown as MapboxMap;

    it('draws connector geometry at 2^zoomOffset times the editor size', () => {
      const editor = createMockCtx();
      compositeAnnotations(mapAt(12, 100, 100), editor, { s1: calloutAt() }, ['s1'], 5);
      const exported = createMockCtx();
      // The export renders at twice the width: one zoom level in, ground point twice as far out.
      compositeAnnotations(mapAt(13, 200, 200), exported, { s1: calloutAt() }, ['s1'], 5, { zoomOffset: 1 });

      // Connector runs from the origin (offset, lifted by the altitude) to the ground point.
      expect(editor.moveTo).toHaveBeenCalledWith(106, 60);
      expect(exported.moveTo).toHaveBeenCalledWith(212, 120);
      expect(editor.arc).toHaveBeenCalledWith(100, 100, 3, 0, Math.PI * 2);
      expect(exported.arc).toHaveBeenCalledWith(200, 200, 6, 0, Math.PI * 2);
      expect(exported.lineWidth).toBe(4);
      expect(exported.scale).toHaveBeenCalledWith(2, 2);
    });

    it('sizes map-scaled callouts for the zoom the editor shows, not the zoomed-in map', () => {
      const callout = calloutAt({ sizeMode: 'map', referenceZoom: 12 });
      const editor = createMockCtx();
      compositeAnnotations(mapAt(12, 100, 100), editor, { s1: callout }, ['s1'], 5);
      const exported = createMockCtx();
      compositeAnnotations(mapAt(13, 200, 200), exported, { s1: callout }, ['s1'], 5, { zoomOffset: 1 });

      // Same as the editor, relative to the frame: only the pixel scale differs.
      expect(exported.moveTo).toHaveBeenCalledWith(212, 120);
      expect(exported.scale).toHaveBeenCalledWith(2, 2);
      expect(editor.scale).toHaveBeenCalledWith(1, 1);
    });

    it('draws a selected callout settled only when it is off the playhead', () => {
      const callout = calloutAt({ transition: { enter: 'fade', exit: 'fade', enterDuration: 1, exitDuration: 1 } });
      const opacityAt = (time: number, selectedId: string | null) => {
        const ctx = createMockCtx();
        const alphas: number[] = [];
        Object.defineProperty(ctx, 'globalAlpha', { set: (v: number) => alphas.push(v), get: () => 1 });
        compositeAnnotations(mapAt(12, 0, 0), ctx, { s1: callout }, ['s1'], time, { selectedId });
        // The first alpha set is the frame's own; later ones are parts of it.
        return alphas[0];
      };

      expect(opacityAt(9, null)).toBeUndefined();
      expect(opacityAt(9, 's1')).toBe(1);
      // On the clip, the real animation shows.
      expect(opacityAt(2.5, 's1')).toBe(0.5);
    });
  });
});
