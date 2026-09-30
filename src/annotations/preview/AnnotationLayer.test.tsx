import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Map as MapboxMap } from 'mapbox-gl';
import '@/annotations/styles';
import { registerTestStyles, TEST_CARD_STYLE_ID } from '@/annotations/testStyles';
import { AnnotationLayer } from './AnnotationLayer';
import { compositeAnnotations } from '@/annotations/export/renderAnnotation';
import { getFrameBounds, prepareAnnotationFrame } from '@/annotations/draw';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';

interface MarkerProps {
  children: React.ReactNode;
  anchor?: string;
  offset?: [number, number];
}

vi.mock('react-map-gl/mapbox', () => ({
  Marker: ({ children, anchor, offset }: MarkerProps) => (
    <div data-testid="marker" data-anchor={anchor} data-offset={JSON.stringify(offset)}>
      {children}
    </div>
  ),
}));

type Call = [string, ...unknown[]];

/** A 2D context stub that records drawing calls. */
function createRecordingContext(canvas?: HTMLCanvasElement) {
  const calls: Call[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push([name, ...args]);
  };
  const ctx = {
    canvas,
    calls,
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    scale: record('scale'),
    rotate: record('rotate'),
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    arcTo: record('arcTo'),
    quadraticCurveTo: record('quadraticCurveTo'),
    bezierCurveTo: record('bezierCurveTo'),
    closePath: record('closePath'),
    rect: record('rect'),
    roundRect: record('roundRect'),
    clip: record('clip'),
    stroke: record('stroke'),
    fill: record('fill'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    fillText: record('fillText'),
    strokeText: record('strokeText'),
    setLineDash: record('setLineDash'),
    drawImage: record('drawImage'),
    measureText: (text: string) => ({ width: text.length * 7 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    globalAlpha: 1,
  };
  return ctx;
}

type RecordingContext = ReturnType<typeof createRecordingContext>;

const contexts = new Map<HTMLCanvasElement, RecordingContext>();

function makeCallout(overrides: Partial<CalloutItem> = {}): CalloutItem {
  return {
    id: 'c1',
    kind: 'callout',
    styleId: TEST_CARD_STYLE_ID,
    styleVersion: 1,
    content: { title: 'Harbour' },
    binding: { kind: 'geographic', lngLat: [10, 20], altitude: 40 },
    offset: [0, 0],
    anchor: 'bottom',
    startTime: 0,
    endTime: 10,
    transition: { enter: 'fade', exit: 'fade', enterDuration: 1, exitDuration: 1 },
    connector: { visible: true, style: 'solid', color: '#fff', width: 2, endDot: true, endDotRadius: 3 },
    opacity: 1,
    scale: 1,
    sizeMode: 'screen',
    referenceZoom: 12,
    settings: {},
    linkTitleToLocation: false,
    ...overrides,
  };
}

/** Drawing calls after the last clear, with absolute coordinates shifted by (dx, dy). */
function drawCallsRelativeTo(calls: Call[], dx: number, dy: number): Call[] {
  const lastClear = calls.map((c) => c[0]).lastIndexOf('clearRect');
  return calls
    .slice(lastClear + 1)
    .filter(([name]) => name !== 'setTransform')
    .map((call, index, all) => {
      const [name, ...args] = call;
      // The connector and the first translate (to the origin) are absolute.
      const firstTranslate = all.findIndex(([n]) => n === 'translate');
      const absolute =
        name === 'moveTo' || name === 'lineTo' || (name === 'arc' && index < firstTranslate) || index === firstTranslate;
      if (!absolute) return call;
      return [name, (args[0] as number) - dx, (args[1] as number) - dy, ...args.slice(2)] as Call;
    });
}

registerTestStyles();

describe('AnnotationLayer', () => {
  beforeEach(() => {
    useProjectStore.setState({ playheadTime: 5, isMoveModeActive: false });
    contexts.clear();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      let ctx = contexts.get(this);
      if (!ctx) {
        ctx = createRecordingContext(this);
        contexts.set(this, ctx);
      }
      return ctx as unknown as CanvasRenderingContext2D;
    } as unknown as HTMLCanvasElement['getContext']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws into the mounted canvas on first render', () => {
    const { container } = render(<AnnotationLayer callouts={[makeCallout()]} selectedCalloutId={null} />);
    const canvas = container.querySelector('canvas')!;
    const ctx = contexts.get(canvas);
    expect(ctx).toBeDefined();
    expect(ctx!.calls.some(([name, text]) => name === 'fillText' && text === 'Harbour')).toBe(true);
  });

  it('redraws after a content change resizes the canvas', () => {
    const { container, rerender } = render(
      <AnnotationLayer callouts={[makeCallout()]} selectedCalloutId={null} />,
    );
    const longTitle = makeCallout({ content: { title: 'A much longer harbour name' } });
    rerender(<AnnotationLayer callouts={[longTitle]} selectedCalloutId={null} />);

    const canvas = container.querySelector('canvas')!;
    const calls = contexts.get(canvas)!.calls;
    const lastClear = calls.map((c) => c[0]).lastIndexOf('clearRect');
    expect(calls.slice(lastClear).some(([name, text]) => name === 'fillText' && text === 'A much longer harbour name')).toBe(true);
  });

  it('matches the export compositor draw-for-draw, relative to the ground point', () => {
    const callout = makeCallout({ offset: [6, -4] });
    const { container } = render(<AnnotationLayer callouts={[callout]} selectedCalloutId={null} />);

    const marker = screen.getByTestId('marker');
    const bounds = getFrameBounds(prepareAnnotationFrame(callout, 5)!);
    expect(marker.dataset.anchor).toBe('top-left');
    expect(JSON.parse(marker.dataset.offset!)).toEqual([bounds.minX, bounds.minY]);

    const canvas = container.querySelector('canvas')!;
    const preview = drawCallsRelativeTo(contexts.get(canvas)!.calls, -bounds.minX, -bounds.minY);

    const exportCtx = createRecordingContext();
    const map = { getZoom: () => 12, project: () => ({ x: 400, y: 300 }) } as unknown as MapboxMap;
    compositeAnnotations(map, exportCtx as unknown as CanvasRenderingContext2D, { c1: callout }, ['c1'], 5);
    const exported = drawCallsRelativeTo([['clearRect'], ...exportCtx.calls], 400, 300);

    expect(preview.filter(([name]) => name === 'fillText')).toHaveLength(1);
    expect(preview).toEqual(exported);
  });

  it('sizes and positions the canvas for a leader line drawn up and away from the ground point', () => {
    const callout = makeCallout({
      styleId: 'leader-line',
      content: { title: 'Harbour' },
      binding: { kind: 'geographic', lngLat: [10, 20], altitude: 0 },
      offset: [70, -90],
      transition: { enter: 'auto', exit: 'auto', enterDuration: 1.2, exitDuration: 0.5 },
    });
    const { container } = render(<AnnotationLayer callouts={[callout]} selectedCalloutId={null} />);

    const bounds = getFrameBounds(prepareAnnotationFrame(callout, 5)!);
    const marker = screen.getByTestId('marker');
    expect(JSON.parse(marker.dataset.offset!)).toEqual([bounds.minX, bounds.minY]);
    // The canvas reaches from the ground dot up to the label.
    expect(bounds.maxY - bounds.minY).toBeGreaterThan(90);
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(70);

    const canvas = container.querySelector('canvas')!;
    expect(canvas.style.width).toBe(`${bounds.maxX - bounds.minX}px`);
    const ctx = contexts.get(canvas)!;
    expect(ctx.calls.some(([name, text]) => name === 'fillText' && text === 'HARBOUR')).toBe(true);
  });
});
