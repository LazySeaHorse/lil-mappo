import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { pickOnMap } from './mapPick';
import { testContext } from './testContext';
import type { DemoFocus } from './focus';

const fake = vi.hoisted(() => ({ map: null as unknown }));
vi.mock('@/agent/mapRef', () => ({ getAgentMap: () => fake.map }));

function box(el: Element, left: number, top: number, width: number, height: number): void {
  el.getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  document.body.innerHTML = `<div data-walkthrough="inspector-panel"><section data-section="route-x"><button id="pick" aria-label="Pick on the map">p</button></section></div><div id="map"><canvas id="canvas"></canvas></div>`;
  box(document.getElementById('pick')!, 950, 200, 30, 20);
  box(document.querySelector('[data-section]')!, 900, 150, 280, 300);
  box(document.querySelector('[data-walkthrough]')!, 900, 100, 300, 700);
  const canvas = document.getElementById('canvas')!;
  box(canvas, 0, 0, 800, 600);
  const container = document.getElementById('map')!;
  Object.defineProperty(container, 'clientWidth', { value: 800 });
  Object.defineProperty(container, 'clientHeight', { value: 600 });
  fake.map = { getCanvas: () => canvas, getContainer: () => container, project: () => ({ x: 400, y: 300 }), once: () => {}, easeTo: () => {} };
  // The Pick on the map button starts the picker, as the app's does.
  document.getElementById('pick')!.addEventListener('click', () => {
    useProjectStore.setState({ activePicker: { onPick: () => {}, label: 'x' } as never });
  });
  canvas.addEventListener('click', () => useProjectStore.getState().stopPicking());
});

afterEach(() => {
  document.body.innerHTML = '';
  useProjectStore.setState({ activePicker: null });
});

describe('pickOnMap and the camera', () => {
  it('shows the panel with the button, then the whole stage while the map is clicked, then frees the camera', async () => {
    const ctx = testContext();
    const seen: DemoFocus[] = [];
    ctx.focus = (f) => seen.push(f);
    const ok = await pickOnMap(ctx, document.getElementById('pick')!, [2, 48]);
    expect(ok).toBe(true);
    expect(seen[0]).toEqual({ rect: { x: 900, y: 150, width: 280, height: 300 }, intent: 'work' });
    expect(seen.slice(1).every((f) => f.rect === null)).toBe(true);
    expect(seen.length).toBeGreaterThan(1);
    expect(ctx.focusHold).toBe(0);
  });
});
