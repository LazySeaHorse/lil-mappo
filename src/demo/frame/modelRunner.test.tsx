import { render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelImportButton } from '@/components/Toolbar/ModelImportButton';
import InspectorPanel from '@/components/Inspector/InspectorPanel';
import { setAgentMapRef } from '@/agent/mapRef';
import { readModelFile } from '@/models/glb';
import { clearModelRegistry } from '@/models/modelRegistry';
import { makeGlb } from '@/models/testGlb';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { clearHistory, getHistoryEntries, installGestureTracking } from '@/store/history';
import type { ModelItem, Project, TimelineItem } from '@/store/types';
import { clearMocks, installFetchMocks } from './mocks';
import { installPointerCapturePatch } from './actions';
import { planDemo, type DemoStep } from './plan';
import { runStep } from './runners';
import { relinkDemoModel, releaseHeldModels } from './session';
import { startingProject } from './startState';
import { testContext } from './testContext';
import { demoFixture } from './testFixture';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }) }));
// The preview's three.js renderer needs WebGL, which jsdom lacks.
vi.mock('@/models/modelPreview', () => ({ startModelPreview: vi.fn(() => Promise.resolve({ dispose: () => {} })) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const glbFile = () => new File([makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max: [1, 2, 3] })], 'Tower.glb');

/** The project file: the fixture with its model drawn from a real .glb and edited the way a user would. */
async function modelFile(): Promise<{ file: Project; target: ModelItem }> {
  const base = demoFixture();
  const read = await readModelFile(glbFile());
  const asset = { id: 'm-tower', fileName: 'Tower.glb', byteSize: read.byteSize, sha256: read.sha256, bounds: read.bounds };
  const model = base.items['mi-tower'] as ModelItem;
  const target: ModelItem = {
    ...model,
    name: 'Eiffel Tower',
    scale: 4,
    altitude: 30,
    heading: 90,
    pitch: 15,
    startTime: 3,
    endTime: 9,
    transition: { enter: 'rise', exit: 'sink', enterDuration: 1.2, exitDuration: 0.8 },
  };
  return { file: { ...base, models: { 'm-tower': asset }, items: { ...base.items, [target.id]: target } }, target };
}

const stepFor = (file: Project, id: string) =>
  planDemo(file).find((s): s is Extract<DemoStep, { kind: 'item' }> => s.kind === 'item' && s.itemId === id)!;

/** A map that projects everything to the same spot and reports a click there to the picker, as MapViewport does. */
function fakeMap(pickedAt: [number, number]) {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(canvas);
  canvas.addEventListener('click', () => {
    const { activePicker, stopPicking } = useProjectStore.getState();
    activePicker?.onPick({ lngLat: pickedAt, name: `${pickedAt[0]}, ${pickedAt[1]}` });
    stopPicking();
  });
  const map = {
    getCanvas: () => canvas,
    getContainer: () => ({ clientWidth: 1200, clientHeight: 800 }),
    project: () => ({ x: 600, y: 400 }),
    getZoom: () => 12,
    getCenter: () => ({ lng: 0, lat: 0 }),
    getBounds: () => null,
    easeTo: vi.fn(),
    fitBounds: vi.fn(),
    once: vi.fn(),
  };
  setAgentMapRef({ current: { getMap: () => map } } as never);
  return { map, remove: () => canvas.remove() };
}

function Editor() {
  return (
    <div>
      <ModelImportButton />
      <InspectorPanel />
    </div>
  );
}

let stopGestures: () => void;
let restoreCapture: () => void;
let nativeCapture: typeof Element.prototype.setPointerCapture;
let uninstallMocks: () => void;
let warn: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:m'), revokeObjectURL: vi.fn() }));
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  uninstallMocks = installFetchMocks();
  stopGestures = installGestureTracking();
  // Radix sliders read the pointer against the track's box, which jsdom does not lay out.
  // As Chrome does for a synthetic press: refuse the capture, which the frame's patch then remembers.
  nativeCapture = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = () => { throw new DOMException('No active pointer', 'NotFoundError'); };
  restoreCapture = installPointerCapturePatch();
  const box = (width: number) => ({ left: 0, top: 0, width, height: width ? 16 : 0, right: width, bottom: width ? 16 : 0, x: 0, y: 0, toJSON: () => ({}) });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return box(this.matches('[data-slot="slider"]') ? 400 : 0);
  });
  clearModelRegistry();
  useUiPreferencesStore.setState({ inspectorSections: {} });
  useProjectStore.setState({ ...startingProject(demoFixture()), ...createTransientState(), isInspectorOpen: true });
  clearHistory();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  setAgentMapRef(null);
  releaseHeldModels();
  clearModelRegistry();
  stopGestures();
  restoreCapture();
  Element.prototype.setPointerCapture = nativeCapture;
  vi.mocked(Element.prototype.getBoundingClientRect).mockRestore();
  uninstallMocks();
  clearMocks();
  warn.mockRestore();
  vi.unstubAllGlobals();
});

describe('model runner', () => {
  it('uploads the relinked file through the popup, places it on the map and edits it in the inspector', async () => {
    const { file, target } = await modelFile();
    await relinkDemoModel({ fileName: 'tour.json', project: file }, 'm-tower', glbFile());
    const { map, remove } = fakeMap(target.position);
    render(<Editor />);
    const seen: TimelineItem[] = [];
    const unsubscribe = useProjectStore.subscribe((s) => {
      for (const item of Object.values(s.items)) if (item.kind === 'model' && item.id !== target.id) seen.push(item);
    });
    // The click on the hidden file input must not open the browser's file dialog.
    const chooserClicks: boolean[] = [];
    document.addEventListener('click', (e) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'file') chooserClicks.push(e.defaultPrevented);
    });

    await runStep(testContext(), stepFor(file, target.id), file);
    unsubscribe();
    remove();

    expect(chooserClicks).toEqual([true]);
    expect(map.easeTo).not.toHaveBeenCalled();
    const shown = seen[seen.length - 1] as ModelItem;
    expect(shown).toMatchObject({
      name: 'Eiffel Tower',
      position: target.position,
      heading: 90,
      pitch: 15,
      altitude: 30,
      startTime: 3,
      endTime: 9,
      transition: { enter: 'rise', exit: 'sink' },
    });
    expect(shown.scale).toBeCloseTo(4, 0);
    expect(shown.transition.enterDuration).toBeCloseTo(1.2, 1);
    expect(warn).not.toHaveBeenCalled();

    const state = useProjectStore.getState();
    expect(state.items[target.id]).toEqual(target);
    expect(Object.values(state.items).filter((i) => i.kind === 'model')).toHaveLength(1);
    // The app's import made an asset of its own; the file's took its place.
    expect(state.models).toEqual(file.models);
    expect(state.selectedItemId).toBe(target.id);
    expect(getHistoryEntries().past.length).toBeGreaterThan(8);
    expect(getHistoryEntries().past.every((entry) => entry.source === 'user')).toBe(true);
  }, 30_000);

  it('picks a model the project already has from the popup’s list', async () => {
    const { file, target } = await modelFile();
    // No file relinked: the project has the model already, so the list has it.
    useProjectStore.setState({ models: file.models });
    render(<Editor />);

    await runStep(testContext(), stepFor(file, target.id), file);

    expect(warn).not.toHaveBeenCalled();
    expect(useProjectStore.getState().items[target.id]).toEqual(target);
    expect(useProjectStore.getState().models).toEqual(file.models);
  }, 30_000);

  it('writes the model directly when its file was not relinked, leaving the app to show its relink state', async () => {
    const { file, target } = await modelFile();
    render(<Editor />);

    await runStep(testContext(), stepFor(file, target.id), file);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('was not relinked'));
    expect(useProjectStore.getState().items[target.id]).toEqual(target);
    expect(useProjectStore.getState().models).toEqual(file.models);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  }, 15_000);
});
