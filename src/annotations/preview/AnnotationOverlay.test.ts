import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Map as MapboxMap } from 'mapbox-gl';
import '@/annotations/styles';
import { registerTestStyles, TEST_CARD_STYLE_ID } from '@/annotations/testStyles';
import { AnnotationOverlay } from './AnnotationOverlay';
import { compositeAnnotations } from '@/annotations/export/renderAnnotation';
import { loadAnnotationAssets } from '@/annotations/draw';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';

vi.mock('@/annotations/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/annotations/draw')>()),
  loadAnnotationAssets: vi.fn(async () => {}),
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


/** Drawing calls after the last clear. */
function drawnAfterClear(calls: Call[]): Call[] {
  const lastClear = calls.map((c) => c[0]).lastIndexOf('clearRect');
  return calls.slice(lastClear + 1).filter(([name]) => name !== 'setTransform');
}

type Handler = () => void;

/** A map that records listeners and can fire its events. */
function createFakeMap(size = { width: 400, height: 300 }) {
  const handlers = new Map<string, Set<Handler>>();
  const canvasContainer = document.createElement('div');
  const map = {
    on: vi.fn((event: string, fn: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
    }),
    off: vi.fn((event: string, fn: Handler) => handlers.get(event)?.delete(fn)),
    triggerRepaint: vi.fn(),
    getZoom: vi.fn(() => 12),
    project: vi.fn(() => ({ x: 400, y: 300 })),
    getContainer: () => ({ clientWidth: size.width, clientHeight: size.height }),
    getCanvasContainer: () => canvasContainer,
  };
  return {
    map: map as unknown as MapboxMap,
    raw: map,
    canvasContainer,
    listeners: (event: string) => handlers.get(event)?.size ?? 0,
    fire: (event: string) => handlers.get(event)?.forEach((fn) => fn()),
  };
}

registerTestStyles();

function setStore(callouts: CalloutItem[], extra: Partial<ReturnType<typeof useProjectStore.getState>> = {}) {
  useProjectStore.setState({
    items: Object.fromEntries(callouts.map((c) => [c.id, c])),
    itemOrder: callouts.map((c) => c.id),
    playheadTime: 5,
    selectedItemId: null,
    isMoveModeActive: false,
    isExporting: false,
    ...extra,
  });
}

describe('AnnotationOverlay', () => {
  let overlay: AnnotationOverlay | undefined;

  beforeEach(() => {
    contexts.clear();
    vi.mocked(loadAnnotationAssets).mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      let ctx = contexts.get(this);
      if (!ctx) {
        ctx = createRecordingContext(this);
        contexts.set(this, ctx);
      }
      return ctx as unknown as CanvasRenderingContext2D;
    } as unknown as HTMLCanvasElement['getContext']);
    setStore([makeCallout()]);
  });

  afterEach(() => {
    overlay?.dispose();
    overlay = undefined;
    vi.restoreAllMocks();
  });

  function mount(fake = createFakeMap()) {
    overlay = new AnnotationOverlay(fake.map);
    overlay.mount();
    const canvas = fake.canvasContainer.querySelector('canvas')!;
    canvas.getContext('2d'); // registers the recording context the overlay will draw into
    return { ...fake, canvas, ctx: contexts.get(canvas)! };
  }

  it('adds one viewport-sized canvas that ignores the pointer', () => {
    const { canvas, canvasContainer } = mount();
    expect(canvasContainer.querySelectorAll('canvas')).toHaveLength(1);
    expect(canvas.style.pointerEvents).toBe('none');
    expect(canvas.width).toBe(Math.round(400 * (window.devicePixelRatio || 1)));
    expect(canvas.height).toBe(Math.round(300 * (window.devicePixelRatio || 1)));
  });

  it('draws in the map render event, as the export compositor does', () => {
    const { fire, ctx, map } = mount();
    expect(ctx.calls).toEqual([]);
    fire('render');

    const expected = createRecordingContext();
    compositeAnnotations(map, expected as unknown as CanvasRenderingContext2D, useProjectStore.getState().items, ['c1'], 5);

    const drawn = drawnAfterClear(ctx.calls);
    expect(drawn.filter(([name]) => name === 'fillText')).toHaveLength(1);
    expect(drawn).toEqual(expected.calls);
  });

  it('clears the previous frame before every draw and does not resize the canvas', () => {
    const { fire, canvas, ctx } = mount();
    const size = [canvas.width, canvas.height];
    fire('render');
    fire('render');
    expect(ctx.calls.filter(([name]) => name === 'clearRect')).toHaveLength(2);
    expect([canvas.width, canvas.height]).toEqual(size);
  });

  it('resizes with the viewport', () => {
    const size = { width: 400, height: 300 };
    const { fire, canvas } = mount(createFakeMap(size));
    size.width = 800;
    fire('resize');
    expect(canvas.width).toBe(Math.round(800 * (window.devicePixelRatio || 1)));
  });

  it('asks the map to repaint, rather than drawing, when what it shows changes', () => {
    const { raw, ctx } = mount();
    raw.triggerRepaint.mockClear();

    useProjectStore.setState({ playheadTime: 6 });
    useProjectStore.setState({ selectedItemId: 'c1' });
    useProjectStore.setState({ items: { ...useProjectStore.getState().items } });
    expect(raw.triggerRepaint).toHaveBeenCalledTimes(3);
    expect(ctx.calls).toEqual([]);

    raw.triggerRepaint.mockClear();
    useProjectStore.setState({ mapStyle: 'satellite' });
    expect(raw.triggerRepaint).not.toHaveBeenCalled();
  });

  it('draws what the store holds at render time, not what it held earlier', () => {
    const { fire, ctx } = mount();
    useProjectStore.setState({ playheadTime: 50 });
    fire('render');
    expect(drawnAfterClear(ctx.calls)).toEqual([]);
  });

  it('shows a selected callout off the playhead settled, and only that one', () => {
    const other = makeCallout({ id: 'c2', content: { title: 'Other' } });
    setStore([makeCallout(), other], { playheadTime: 50, selectedItemId: 'c1' });
    const { fire, ctx } = mount();
    fire('render');
    const texts = drawnAfterClear(ctx.calls).filter(([name]) => name === 'fillText').map((c) => c[1]);
    expect(texts).toEqual(['Harbour']);
  });

  it('leaves the selected callout to its drag handle in move mode', () => {
    const other = makeCallout({ id: 'c2', content: { title: 'Other' } });
    setStore([makeCallout(), other], { selectedItemId: 'c1', isMoveModeActive: true });
    const { fire, ctx } = mount();
    fire('render');
    const texts = drawnAfterClear(ctx.calls).filter(([name]) => name === 'fillText').map((c) => c[1]);
    expect(texts).toEqual(['Other']);
  });

  it('draws nothing while a video export composites the callouts itself', () => {
    setStore([makeCallout()], { isExporting: true });
    const { fire, ctx } = mount();
    fire('render');
    expect(ctx.calls.some(([name]) => name === 'clearRect')).toBe(true);
    expect(drawnAfterClear(ctx.calls)).toEqual([]);
  });

  it('uses the map zoom as the view zoom for callouts sized with the map', () => {
    setStore([makeCallout({ sizeMode: 'map', referenceZoom: 12 })]);
    const { fire, ctx, raw } = mount();
    raw.getZoom.mockReturnValue(13);
    fire('render');
    expect(ctx.calls.filter(([name]) => name === 'scale')).toContainEqual(['scale', 2, 2]);
  });

  it('loads fonts and images for the callouts, then repaints', async () => {
    const { raw } = mount();
    expect(loadAnnotationAssets).toHaveBeenCalledTimes(1);
    raw.triggerRepaint.mockClear();
    await vi.waitFor(() => expect(raw.triggerRepaint).toHaveBeenCalled());

    // Only edits to the callouts reload them, not playhead ticks.
    vi.mocked(loadAnnotationAssets).mockClear();
    useProjectStore.setState({ playheadTime: 7 });
    expect(loadAnnotationAssets).not.toHaveBeenCalled();
    useProjectStore.setState({ items: { ...useProjectStore.getState().items } });
    expect(loadAnnotationAssets).toHaveBeenCalledTimes(1);
  });

  it('removes its canvas and listeners when disposed', async () => {
    const { listeners, canvasContainer, raw } = mount();
    expect(listeners('render')).toBe(1);
    expect(listeners('resize')).toBe(1);
    overlay!.dispose();
    expect(listeners('render')).toBe(0);
    expect(listeners('resize')).toBe(0);
    expect(canvasContainer.querySelector('canvas')).toBeNull();

    raw.triggerRepaint.mockClear();
    useProjectStore.setState({ playheadTime: 8 });
    await Promise.resolve();
    expect(raw.triggerRepaint).not.toHaveBeenCalled();
  });
});
