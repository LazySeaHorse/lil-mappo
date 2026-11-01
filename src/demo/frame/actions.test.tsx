import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { click, find, installPointerCapturePatch, query, selectOption, setSlider, type } from './actions';
import { testContext } from './testContext';
import { BoundaryAddDropdown } from '@/components/Toolbar/BoundaryAddDropdown';
import { SliderRow } from '@/components/Inspector/controls/SliderRow';
import { SwitchRow } from '@/components/Inspector/controls/SwitchRow';
import { ColorRow } from '@/components/Inspector/controls/ColorRow';
import { TimeRow } from '@/components/Inspector/controls/TimeRow';
import { EasingSelect } from '@/components/Inspector/controls/EasingSelect';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Field } from '@/components/ui/field';
import { useProjectStore } from '@/store/useProjectStore';
import { clearHistory, getHistoryEntries, installGestureTracking } from '@/store/history';
import type { BoundaryItem, EasingName } from '@/store/types';
import { BOUNDARY_ADD_TERMS } from '@/lib/terms';
import '@/annotations/styles';

const square: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

describe('locating controls', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('finds by role and name, walkthrough id, attributes, text and a row label', () => {
    render(
      <div>
        <button aria-label="Close">x</button>
        <button data-walkthrough="add-boundary" title="Add Boundary">+</button>
        <section data-section="boundary-timing"><span>Timing</span></section>
        <SwitchRow label="Glow" checked={false} onChange={() => {}} />
        <input placeholder="Search for a place or region" />
      </div>,
    );
    expect(query({ role: 'button', name: 'Close' })).toBe(screen.getByRole('button', { name: 'Close' }));
    expect(query({ walkthrough: 'add-boundary' })).toHaveAttribute('title', 'Add Boundary');
    expect(query({ attrs: { 'data-section': 'boundary-timing' } })).toHaveTextContent('Timing');
    expect(query({ text: 'Timing', selector: 'span' })).toHaveTextContent('Timing');
    expect(query({ label: 'Glow', role: 'switch' })).toBe(screen.getByRole('switch'));
    expect(query({ role: 'textbox', name: 'Search for a place or region' })).toBe(screen.getByRole('textbox'));
    expect(query({ role: 'button', name: 'Nothing' })).toBeNull();
  });

  it('waits for a control to appear, and warns and gives up when it never does', async () => {
    const ctx = testContext();
    const Late = () => {
      const [shown, setShown] = useState(false);
      setTimeout(() => setShown(true), 120);
      return shown ? <button>Late</button> : null;
    };
    render(<Late />);
    expect(await find(ctx, { role: 'button', name: 'Late' })).toHaveTextContent('Late');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await find(ctx, { role: 'button', name: 'Never', description: 'the never button' }, { timeout: 100 })).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('the never button'));
    expect(await click(ctx, { role: 'button', name: 'Never' }, { timeout: 100 })).toBe(false);
    warn.mockRestore();
  });
});

describe('primitives on the real controls', () => {
  let stopGestures: () => void;
  beforeEach(() => {
    stopGestures = installGestureTracking();
    clearHistory();
  });
  afterEach(() => stopGestures());

  it('clicks a switch, a segment and a colour swatch', async () => {
    const ctx = testContext();
    const changes: unknown[] = [];
    render(
      <div>
        <SwitchRow label="Glow" checked={false} onChange={(v) => changes.push(['glow', v])} />
        <Field label="Fill">
          <SegmentedControl
            options={[{ value: 'color', label: 'Color' }, { value: 'flag', label: 'Flag' }]}
            value="color"
            onValueChange={(v) => changes.push(['fill', v])}
          />
        </Field>
        <ColorRow label="Border color" value="#a855f7" onChange={(v) => changes.push(['color', v])} />
      </div>,
    );
    await click(ctx, { label: 'Glow', role: 'switch' });
    await click(ctx, { label: 'Fill', role: 'radio', name: 'Flag' });
    await click(ctx, { label: 'Border color', role: 'button', name: 'Select color #22c55e' });
    expect(changes).toEqual([['glow', true], ['fill', 'flag'], ['color', '#22c55e']]);
    // The cursor ended on the last control, showing the hand.
    expect(ctx.cursor.kind).toBe('hand');
  });

  it('types into a React-controlled field one character at a time, replacing its text', async () => {
    const ctx = testContext();
    const seen: string[] = [];
    const Name = () => {
      const [value, setValue] = useState('Untitled');
      return <input aria-label="Name" value={value} onChange={(e) => { setValue(e.target.value); seen.push(e.target.value); }} />;
    };
    render(<Name />);
    await type(ctx, { role: 'textbox', name: 'Name' }, 'Paris');
    expect(screen.getByRole('textbox')).toHaveValue('Paris');
    expect(seen).toEqual(['P', 'Pa', 'Par', 'Par' + 'i', 'Paris']);
    expect(ctx.cursor.kind).toBe('ibeam');
  });

  it('types a time into a TimeRow and commits it with Enter', async () => {
    const ctx = testContext();
    const onChange = vi.fn();
    render(<TimeRow label="Start" value={0} onChange={onChange} />);
    await type(ctx, { role: 'textbox', name: 'Start' }, '00:02.50', { enter: true });
    expect(onChange).toHaveBeenCalledWith(2.5);
  });

  it('glides a slider to a value as one undo step', async () => {
    const ctx = testContext();
    const Width = () => {
      const width = useProjectStore((s) => s.terrainExaggeration);
      return (
        <SliderRow label="Terrain height" value={width} min={1} max={3} step={0.1}
          onChange={(v) => useProjectStore.getState().setTerrainExaggeration(v)} />
      );
    };
    useProjectStore.setState({ terrainExaggeration: 1.5 });
    clearHistory();
    render(<Width />);
    await setSlider(ctx, { label: 'Terrain height', role: 'slider' }, 2.4);
    expect(useProjectStore.getState().terrainExaggeration).toBeCloseTo(2.4, 5);
    expect(getHistoryEntries().past).toHaveLength(1);

    await setSlider(ctx, { label: 'Terrain height', role: 'slider' }, 1.2);
    expect(useProjectStore.getState().terrainExaggeration).toBeCloseTo(1.2, 5);
    expect(getHistoryEntries().past).toHaveLength(2);
  });

  it('stops within a step of a value between steps', async () => {
    const ctx = testContext();
    const Opacity = () => {
      const [v, setV] = useState(0.1);
      return <SliderRow label="Fill opacity" value={v} min={0} max={1} step={0.1} onChange={setV} />;
    };
    render(<Opacity />);
    await setSlider(ctx, { label: 'Fill opacity', role: 'slider' }, 0.46);
    expect(Number(screen.getByRole('slider').getAttribute('aria-valuenow'))).toBeCloseTo(0.5, 5);
  });

  it('picks an option of a Radix Select', async () => {
    const ctx = testContext();
    const Motion = () => {
      const [v, setV] = useState<EasingName>('easeInOutCubic');
      return <EasingSelect value={v} onChange={setV} />;
    };
    render(<Motion />);
    expect(await selectOption(ctx, { label: 'Motion', role: 'combobox' }, 'Bounce')).toBe(true);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Bounce'));
  });

  it('remembers a pointer capture the browser refuses, so drags work in the frame', () => {
    const el = document.createElement('div');
    const native = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = () => { throw new DOMException('No active pointer', 'NotFoundError'); };
    const restore = installPointerCapturePatch();
    try {
      el.setPointerCapture(1);
      expect(el.hasPointerCapture(1)).toBe(true);
      el.releasePointerCapture(1);
      expect(el.hasPointerCapture(1)).toBe(false);
    } finally {
      restore();
      Element.prototype.setPointerCapture = native;
    }
  });
});

describe('the Add Boundary panel, driven by the primitives', () => {
  beforeEach(() => {
    useProjectStore.setState({ items: {}, itemOrder: [], stagedItems: [], selectedItemId: null, playheadTime: 0, appearPreview: null });
    clearHistory();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens the panel from its toolbar button, searches, picks the result and adds the boundary', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: square,
        properties: { display_name: 'France', type: 'administrative', extratags: { 'ISO3166-1': 'FR' } },
      }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    const ctx = testContext();
    const Panel = () => {
      const [open, setOpen] = useState(false);
      return <BoundaryAddDropdown isOpen={open} onOpenChange={setOpen} />;
    };
    render(<Panel />);

    expect(await click(ctx, { walkthrough: 'add-boundary' })).toBe(true);
    expect(await type(ctx, { role: 'textbox', name: 'Search for a place or region' }, 'France')).toBe(true);
    const result = await find(ctx, { role: 'button', text: /^France/ });
    expect(result).not.toBeNull();
    await click(ctx, result!);
    expect(await click(ctx, { role: 'radio', name: /detailed/i })).toBe(true);
    expect(await click(ctx, { role: 'button', name: BOUNDARY_ADD_TERMS.add })).toBe(true);

    const items = Object.values(useProjectStore.getState().items) as BoundaryItem[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'boundary', placeName: 'France', style: { flagCode: 'fr' } });
    expect(useProjectStore.getState().selectedItemId).toBe(items[0].id);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('q=France'), expect.anything());
  });
});
